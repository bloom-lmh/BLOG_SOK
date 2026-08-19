# Day 12 · 支付对接

> 今天目标：新建 `mall-payment` 支付服务，跑通「发起支付 → 沙箱模拟支付成功 → 异步回调 → 订单置为已支付」整条链路，并重点解决**回调幂等**——这是支付模块里最值钱、面试必问的点。

## 一、前置条件

- 已完成 **Day 01**（`mall-common` 的 `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`，`scanBasePackages="com.mall"`）
- 已完成 **Day 02**（`orders` 订单表、`payment` 支付记录表已建好，今天**复用这两张表，不新建表**）
- 已完成 **Day 05**（Redis 已接入，回调幂等的分布式锁要靠它）
- Day 10（订单服务）**若还没做**：不影响——步骤 7 给了手动插一条待支付订单的 SQL，先插数据也能独立联调支付
- Day 11 结尾的第 5 问（「回补库存被重复调用两次会怎样」）今天给出答案——**幂等**

## 二、先搞清楚：为什么支付一定有「回调 + 幂等」

```
用户 → 发起支付 → mall-payment → 创建支付单 → 第三方平台(沙箱) → 返回支付链接
用户 → 完成付款 → 第三方平台扣款成功 → 异步回调 /notify → mall-payment（可能重复发 N 次！）
```

三个关键认知（今天的灵魂）：

1. **为什么是「回调」而不是「主动查」？** 用户在支付平台完成付款后，平台**异步**通知商家，商家必须提供 `notify` 接口让平台来调。
2. **为什么回调会重复？** 平台通知后若没收到商家返回的 `success`，会**重试**。「商家已处理、平台以为没处理」→ 平台重复发 → **商家必须幂等**。
3. **什么叫幂等？** 同一个支付通知，无论来 1 次还是 10 次，**结果完全一样**：订单只变成「已支付」一次，不重复入账。

::: tip 💡 面试题：什么是幂等？为什么支付回调必须幂等？
**一句话**：幂等 = 同一操作执行多次，结果和执行一次完全相同。支付平台会因网络超时、通知失败而**重复回调**，回调不幂等就会重复记账、重复发货，造成资损。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

## 三、步骤

### 步骤 1：新建模块 `mall-payment`

**① 父工程 `E:\course-mall\pom.xml`**，在 `<modules>` 里加一行（已做到 Day 11 的话，你的 modules 列表应该长这样，今天只新增最后一行）：

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-course</module>
    <module>mall-order</module>
    <module>mall-stock</module>
    <module>mall-payment</module>   <!-- 今天新增 -->
</modules>
```

**② 模块 pom `E:\course-mall\mall-payment\pom.xml`**：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.mall</groupId>
        <artifactId>course-mall</artifactId>
        <version>1.0.0</version>
    </parent>

    <artifactId>mall-payment</artifactId>

    <dependencies>
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>          <!-- 复用 Day01 的 Result / 全局异常 -->
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <!-- MyBatis-Plus：不写版本号，Day06 已收进父 pom 的 dependencyManagement（3.5.7） -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
        </dependency>
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>   <!-- 幂等第一层 SETNX 锁用 -->
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

**③ 配置 `E:\course-mall\mall-payment\src\main\resources\application.yml`**：

```yaml
server:
  port: 8083          # mall-user=8080、mall-course=8081、mall-order/mall-stock=8082，支付用 8083（冲突就改）

spring:
  application:
    name: mall-payment
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
    username: root        # 换成你自己的
    password: root        # 换成你自己的
  data:
    redis:
      host: localhost     # Day05 已接入，别忘了先启动 Redis
      port: 6379

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true   # 下划线列名 <-> 驼峰字段（order_no -> orderNo）
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 打印 SQL，联调时观察状态机 UPDATE 影响了几行
```

**④ 启动类 `E:\course-mall\mall-payment\src\main\java\com\mall\payment\MallPaymentApplication.java`**：

```java
package com.mall.payment;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// scanBasePackages 扩大到 com.mall：和 Day01 一样，要扫到 mall-common 的全局异常处理器
@SpringBootApplication(scanBasePackages = "com.mall")
@MapperScan("com.mall.payment.mapper")   // 不写这句，Mapper 注入会报找不到 Bean
public class MallPaymentApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallPaymentApplication.class, args);
    }
}
```

### 步骤 2：实体 + Mapper（复用 Day02 的表）

`com/mall/payment/entity/Payment.java` 和 `Order.java`（支付环节只关心这些字段，所以 `Order` 不映射全表）：

```java
// ── 文件一：com/mall/payment/entity/Payment.java（映射 Day02 的 payment 表）──
package com.mall.payment.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("payment")
public class Payment {
    private Long id;
    private String orderNo;        // 关联订单号
    private String transactionId;  // 第三方支付流水号（回调成功后写入）
    private BigDecimal amount;     // 支付金额（DECIMAL，精度不能丢）
    private Integer status;        // 0待支付 1成功 2失败
    private LocalDateTime createTime;
}

// ── 文件二：com/mall/payment/entity/Order.java ──
package com.mall.payment.entity;

import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("orders")
public class Order {
    private Long id;
    private String orderNo;
    private Long userId;
    private BigDecimal totalAmount;  // 发起支付时用它做支付金额
    private Integer status;          // 0待支付 1已支付 2已取消 3已退款
    private Integer payType;         // 1支付宝 2微信
    private LocalDateTime payTime;
    // 和 Day10 一样声明逻辑删除：selectOne 自动拼 deleted=0，查不到已删订单
    @TableLogic
    private Integer deleted;
}
```

两个 Mapper（`com/mall/payment/mapper/`）：

```java
// ── 文件一：PaymentMapper.java ──
package com.mall.payment.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.payment.entity.Payment;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface PaymentMapper extends BaseMapper<Payment> {

    // 状态机单向流转：只有 status=0（待支付）才允许改成 1（成功）。
    // WHERE 里带 status=0 是关键——并发/重复回调时，只有第一次能命中，
    // 第二次影响 0 行 → 天然幂等。返回 1=本次成功，0=已处理过或支付单不存在
    @Update("UPDATE payment SET status = 1, transaction_id = #{transactionId} " +
            "WHERE order_no = #{orderNo} AND status = 0")
    int markPaid(@Param("orderNo") String orderNo, @Param("transactionId") String transactionId);
}

// ── 文件二：OrderMapper.java ──
package com.mall.payment.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.payment.entity.Order;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface OrderMapper extends BaseMapper<Order> {

    // 同样带 status=0 条件：订单只允许从「待支付」流转到「已支付」，不会重复流转
    @Update("UPDATE orders SET status = 1, pay_type = #{payType}, pay_time = NOW() " +
            "WHERE order_no = #{orderNo} AND status = 0")
    int markOrderPaid(@Param("orderNo") String orderNo, @Param("payType") Integer payType);
}
```

::: tip 💡 面试题：为什么 `UPDATE ... WHERE status=0` 能保证幂等？两个回调「同时」进来会怎样？
**一句话**：一条 `UPDATE` 在 InnoDB 里是**原子**的，且对命中行加**行锁**。并发回调串行执行：第一个把 `status` 从 0 改成 1，第二个执行时 `WHERE status=0` 已匹配不到 → 影响 0 行 → 跳过。所以**数据库状态机是幂等的最终兜底**，比任何锁都可靠。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)、[MySQL](/learn_database/MySQL)。
:::

### 步骤 3：支付渠道抽象（策略模式，为接真实支付宝留口子）

三个文件都在 `com/mall/payment/strategy/`：

```java
// ── 文件一：PaymentStrategy.java ──
package com.mall.payment.strategy;

import java.math.BigDecimal;

// 支付渠道统一抽象：支付宝、微信、沙箱都实现它。
// 业务代码只依赖接口，新增渠道不改业务，符合「开闭原则」
public interface PaymentStrategy {

    Integer payType();  // 该策略对应的支付方式，用于路由

    // 发起支付：返回给前端的支付参数（沙箱返回链接，真实支付宝返回 HTML 表单/二维码）
    String createPay(String orderNo, BigDecimal amount);
}

// ── 文件二：MockSandboxPayStrategy.java ──
package com.mall.payment.strategy;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class MockSandboxPayStrategy implements PaymentStrategy {

    @Override
    public Integer payType() {
        return 1;   // 1 = 支付宝（沙箱版）
    }

    @Override
    public String createPay(String orderNo, BigDecimal amount) {
        // 本地沙箱：不真调支付宝，只返回一个「模拟支付成功」的链接
        // 真实场景这里会调 alipay.trade.page.pay，返回 HTML 表单/二维码
        return "/api/pay/mock-success?orderNo=" + orderNo + "&amount=" + amount;
    }
}

// ── 文件三：PaymentStrategyRouter.java ──
package com.mall.payment.strategy;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class PaymentStrategyRouter {

    private final Map<Integer, PaymentStrategy> strategies;

    // 构造器注入：Spring 会把容器里「所有 PaymentStrategy 实现类」收集成 List 注入，
    // 转成 Map<payType, 策略>，调用时 O(1) 路由。以后加微信策略，只需新增一个 @Component
    public PaymentStrategyRouter(List<PaymentStrategy> strategies) {
        this.strategies = strategies.stream()
                .collect(Collectors.toMap(PaymentStrategy::payType, Function.identity()));
    }

    public PaymentStrategy get(Integer payType) {
        PaymentStrategy s = strategies.get(payType);
        if (s == null) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "不支持的支付方式: " + payType);
        }
        return s;
    }
}
```

::: tip 💡 面试题：策略模式在这里有什么用？怎么用 Spring 优雅实现「按类型路由」？
**一句话**：把支付宝/微信/沙箱各自的支付逻辑封装成策略，业务只面向接口；Spring 把所有 `PaymentStrategy` 实现注入成 `List`，转成 `Map<payType, 策略>` 按类型 O(1) 路由。新增渠道 = 新增一个 `@Component`，业务零改动。详见 [Spring](/learn_backend/java/基础/Spring)。
:::

### 步骤 4：DTO + 验签工具

两个 DTO 都在 `com/mall/payment/dto/`：

```java
// ── 文件一：CreatePayRequest.java ──
package com.mall.payment.dto;

import lombok.Data;

@Data
public class CreatePayRequest {
    private String orderNo;   // 要支付的订单号
    private Integer payType;  // 支付方式：1支付宝 2微信
}

// ── 文件二：PayNotifyRequest.java ──
package com.mall.payment.dto;

import lombok.Data;

@Data
public class PayNotifyRequest {
    private String orderNo;
    private String transactionId;  // 第三方流水号（每次回调唯一，幂等的天然 key）
    private String amount;         // 用 String：签名是按「原始字符串」算的，BigDecimal 会丢格式
    private String sign;           // 签名
    private Integer payType;       // 沙箱固定传 1；真实场景由「哪个渠道的 notify 地址」决定
}
```

`com/mall/payment/util/SignUtil.java`：

```java
package com.mall.payment.util;

import com.mall.payment.dto.PayNotifyRequest;
import org.springframework.util.DigestUtils;

import java.nio.charset.StandardCharsets;

public class SignUtil {

    // 沙箱密钥：真实支付宝用「应用私钥 + 支付宝公钥」做 RSA2 验签，这里用 MD5 模拟流程。
    // 验签的目的：防止别人伪造回调「白嫖课程」。真正上线必须换成 RSA2。
    private static final String SECRET = "course-mall-sandbox-secret";

    // 签名：按固定顺序拼接字段 + 密钥，MD5 后转十六进制
    public static String sign(String orderNo, String transactionId, String amount) {
        String raw = orderNo + transactionId + amount + SECRET;
        return DigestUtils.md5DigestAsHex(raw.getBytes(StandardCharsets.UTF_8));
    }

    // 验签：自己按同样规则算一遍，和传进来的 sign 比对
    public static boolean verify(PayNotifyRequest req) {
        String expected = sign(req.getOrderNo(), req.getTransactionId(), req.getAmount());
        return expected.equalsIgnoreCase(req.getSign());
    }
}
```

### 步骤 5：核心 Service（发起支付 + 回调两层幂等）

`com/mall/payment/service/PaymentService.java`（今天的核心，逐段带注释）：

```java
package com.mall.payment.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.payment.dto.CreatePayRequest;
import com.mall.payment.dto.PayNotifyRequest;
import com.mall.payment.entity.Order;
import com.mall.payment.entity.Payment;
import com.mall.payment.mapper.OrderMapper;
import com.mall.payment.mapper.PaymentMapper;
import com.mall.payment.strategy.PaymentStrategy;
import com.mall.payment.strategy.PaymentStrategyRouter;
import com.mall.payment.util.SignUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;

@Service
@RequiredArgsConstructor   // 生成「所有 final 字段」的构造器，配合构造器注入
@Slf4j
public class PaymentService {

    private final OrderMapper orderMapper;
    private final PaymentMapper paymentMapper;
    private final PaymentStrategyRouter strategyRouter;
    private final StringRedisTemplate stringRedisTemplate;
    private final TransactionTemplate transactionTemplate;   // 编程式事务，见下方面试题

    // 1. 发起支付：创建/复用支付单，返回支付参数
    public String createPay(CreatePayRequest req) {
        Order order = orderMapper.selectOne(new LambdaQueryWrapper<Order>()
                .eq(Order::getOrderNo, req.getOrderNo()));
        if (order == null) {
            throw new BizException(ErrorCode.NOT_FOUND.getCode(), "订单不存在: " + req.getOrderNo());
        }
        // 只有「待支付」的订单才能发起支付
        if (order.getStatus() != 0) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "订单状态不允许支付: " + order.getStatus());
        }

        // 复用未支付的支付单：用户重复点「去支付」，不重复建支付单
        Payment payment = paymentMapper.selectOne(new LambdaQueryWrapper<Payment>()
                .eq(Payment::getOrderNo, req.getOrderNo())
                .eq(Payment::getStatus, 0));
        if (payment == null) {
            payment = new Payment();
            payment.setOrderNo(req.getOrderNo());
            payment.setAmount(order.getTotalAmount());
            payment.setStatus(0);
            paymentMapper.insert(payment);
        }

        PaymentStrategy strategy = strategyRouter.get(req.getPayType());
        return strategy.createPay(req.getOrderNo(), order.getTotalAmount());
    }

    // 2. 处理支付回调（核心：两层幂等）
    public void handleNotify(PayNotifyRequest req) {
        // ① 验签：先确认「这真的是第三方平台发的」，防止伪造回调
        if (!SignUtil.verify(req)) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "验签失败，非法回调");
        }

        // ② 幂等第一层：Redis SETNX 锁，用 transactionId 做 key 快速拦截重复回调
        String lockKey = "pay:notify:" + req.getTransactionId();
        Boolean locked = stringRedisTemplate.opsForValue()
                .setIfAbsent(lockKey, "1", Duration.ofMinutes(5));   // setIfAbsent = SETNX
        if (Boolean.FALSE.equals(locked)) {
            log.info("重复回调，已被拦截: transactionId={}", req.getTransactionId());
            return;   // 已处理过，直接返回（Controller 仍回 success，通知方不再重试）
        }

        try {
            // 编程式事务：让锁的持有范围覆盖整个事务提交，避免「锁先释放、事务后提交」的竞态。
            // doPaySuccess 抛异常则整体回滚，finally 释放锁，后续正确回调还能再进来
            transactionTemplate.executeWithoutResult(status -> doPaySuccess(req));
        } finally {
            stringRedisTemplate.delete(lockKey);
        }
    }

    private void doPaySuccess(PayNotifyRequest req) {
        // ③ 金额校验：回调金额必须和支付单一致，防「一块钱回调」改金额类攻击
        Payment payment = paymentMapper.selectOne(new LambdaQueryWrapper<Payment>()
                .eq(Payment::getOrderNo, req.getOrderNo()));
        if (payment == null) {
            throw new BizException(ErrorCode.NOT_FOUND.getCode(), "支付单不存在: " + req.getOrderNo());
        }
        if (payment.getAmount().compareTo(new BigDecimal(req.getAmount())) != 0) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "回调金额与支付单不一致");
        }

        // ④ 幂等第二层：状态机单向流转（数据库兜底）。
        //    即使 Redis 锁失效/未命中（Redis 挂了、锁过期），这里也只能「待支付 → 成功」一次
        int rows = paymentMapper.markPaid(req.getOrderNo(), req.getTransactionId());
        if (rows == 0) {
            log.info("支付单已处理过: orderNo={}", req.getOrderNo());
            return;
        }
        // ⑤ 订单同步置为已支付（同样带 status=0 条件，双保险）
        orderMapper.markOrderPaid(req.getOrderNo(), req.getPayType() == null ? 1 : req.getPayType());
    }

    // 3. 主动查询（回调丢失时的兜底；真实场景会再调 alipay.trade.query 向平台确认）
    public Integer query(String orderNo) {
        Payment p = paymentMapper.selectOne(new LambdaQueryWrapper<Payment>()
                .eq(Payment::getOrderNo, orderNo)
                .orderByDesc(Payment::getId)
                .last("LIMIT 1"));
        return p == null ? null : p.getStatus();
    }
}
```

::: tip 💡 面试题：为什么回调幂等要「多层」设计，而不是只靠一个 Redis 锁？
**一句话**：分布式锁有**超时、误删、Redis 故障**等不确定性，不能作为唯一保证；真正可靠的是**数据库状态机**（`UPDATE ... WHERE status=0`），它在 DB 层原子执行、并发也安全。「Redis 锁快速拦截 + DB 状态机最终兜底」是标准做法。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

::: tip 💡 面试题：为什么这里用 `TransactionTemplate`（编程式事务）而不是 `@Transactional`？
**一句话**：`@Transactional` 靠 AOP 代理，事务在**方法体执行完、返回前**才提交——锁在 `finally` 里释放就会「先释放锁、后提交」，出现竞态窗口；`TransactionTemplate` 把「加锁 → 事务提交 → 释放锁」的顺序捏在自己手里，更可控。详见 [Spring](/learn_backend/java/基础/Spring)。
:::

### 步骤 6：Controller（发起 + 回调 + 模拟 + 查询）

`com/mall/payment/controller/PayController.java`：

```java
package com.mall.payment.controller;

import com.mall.common.result.Result;
import com.mall.payment.dto.CreatePayRequest;
import com.mall.payment.dto.PayNotifyRequest;
import com.mall.payment.service.PaymentService;
import com.mall.payment.util.SignUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/pay")
@RequiredArgsConstructor
public class PayController {

    private final PaymentService paymentService;

    // 1. 发起支付
    @PostMapping("/create")
    public Result<Map<String, Object>> create(@RequestBody CreatePayRequest req) {
        String payUrl = paymentService.createPay(req);
        Map<String, Object> data = new HashMap<>();
        data.put("payUrl", payUrl);   // 前端拿到后跳转/展示二维码
        return Result.ok(data);
    }

    // 2. 支付回调（第三方支付平台调的接口）
    @PostMapping("/notify")
    public String notify(@RequestBody PayNotifyRequest req) {
        paymentService.handleNotify(req);
        // 关键：返回纯文本 "success"，不能是 JSON。
        // 支付宝等平台只有收到 "success" 才停止重试，返回其它内容会反复通知
        return "success";
    }

    // 3. 模拟沙箱支付成功（本地联调用；真实场景由第三方调 /notify）
    @GetMapping("/mock-success")
    public Result<String> mockSuccess(@RequestParam String orderNo, @RequestParam String amount) {
        // 模拟第三方：生成流水号 + 正确签名，再走一遍和真实回调完全一样的 handleNotify
        String transactionId = "MOCK" + System.currentTimeMillis();
        PayNotifyRequest notify = new PayNotifyRequest();
        notify.setOrderNo(orderNo);
        notify.setTransactionId(transactionId);
        notify.setAmount(amount);
        notify.setPayType(1);
        notify.setSign(SignUtil.sign(orderNo, transactionId, amount));
        paymentService.handleNotify(notify);
        return Result.ok("模拟支付成功，订单已置为已支付");
    }

    // 4. 主动查询（回调丢失的兜底）
    @GetMapping("/query/{orderNo}")
    public Result<Map<String, Object>> query(@PathVariable String orderNo) {
        Map<String, Object> data = new HashMap<>();
        data.put("orderNo", orderNo);
        data.put("status", paymentService.query(orderNo));
        return Result.ok(data);
    }
}
```

::: tip 💡 面试题：为什么回调接口要返回纯文本 `success`，而不是统一返回体 `Result`？
**一句话**：第三方支付平台**只认 `success` 字符串**——收到它才认为通知送达并停止重试；返回 JSON 会被判定为「失败」，触发**重复通知**，反而加剧幂等压力。所以回调接口是少数「不能用统一返回体」的例外。
:::

### 步骤 7：联调验证

先插入一条待支付订单（Day 10 下单做好前用它联调；`user` 表需有 userId=1，Day 10 已插过）：

```sql
INSERT INTO `orders` (`order_no`, `user_id`, `total_amount`, `status`) VALUES
('202608190001', 1, 199.00, 0);
```

编译启动（确保 MySQL 和 Redis 都已启动）：

```bash
# 在 E:\course-mall\ 根目录
mvn clean install -DskipTests
mvn -pl mall-payment spring-boot:run
```

按顺序打四个命令：

```bash
# ① 发起支付 → 预期返回 payUrl
curl -X POST http://localhost:8083/api/pay/create \
  -H "Content-Type: application/json" \
  -d '{"orderNo":"202608190001","payType":1}'
# → {"code":200,...,"data":{"payUrl":"/api/pay/mock-success?orderNo=202608190001&amount=199.00"}}

# ② 模拟支付成功（点开上面返回的链接）
curl "http://localhost:8083/api/pay/mock-success?orderNo=202608190001&amount=199.00"

# ③ 查支付状态 → data.status=1（已支付）；orders 表 status 也变 1、pay_time 有值
curl http://localhost:8083/api/pay/query/202608190001

# ④ 验证幂等（今天最重要的实验）：再点一次 mock-success。
#    观察控制台日志——第二次会打印「重复回调，已被拦截」或「支付单已处理过」，
#    订单状态仍是 1，不会重复入账。这就是幂等生效。
curl "http://localhost:8083/api/pay/mock-success?orderNo=202608190001&amount=199.00"
```

## 四、两层幂等小结（面试直接背这个）

| 层 | 手段 | 作用 | 失效了会怎样 |
|---|---|---|---|
| 第一层 | Redis `SETNX` 分布式锁 | 快速拦截重复回调，省数据库开销 | 锁超时/Redis 挂了 → 失效 |
| 第二层 | DB 状态机 `UPDATE ... WHERE status=0` | **核心兜底**，原子 + 行锁保证 | 几乎不会失效（最终保障） |
| 可选加固 | `transaction_id` 唯一索引 | 极端并发下数据库层强约束 | 需给 Day02 表加索引 |

可选加固 SQL（给第三方流水号加唯一索引，插入重复流水号直接报错）：

```sql
ALTER TABLE `payment` ADD UNIQUE KEY `uk_transaction_id` (`transaction_id`);
```

> 注意：`transaction_id` 在「支付成功前」是 NULL，MySQL 唯一索引允许**多个 NULL**，所以待支付的支付单不受影响，只有回调写入流水号后才受唯一约束保护。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| 幂等设计、分布式锁、状态机 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| Redis `SETNX` 锁、过期时间 | [Redis](/learn_database/Redis) |
| `UPDATE ... WHERE status=0` 原子性、行锁 | [MySQL](/learn_database/MySQL) |
| 策略模式 + 构造器注入 | [Spring](/learn_backend/java/基础/Spring) |
| 编程式事务 `TransactionTemplate` | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| MyBatis-Plus 条件更新、`LambdaQueryWrapper` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-payment` 模块编译启动成功（8083）：是 / 否
- [ ] `POST /api/pay/create` 返回了 `payUrl`：是 / 否
- [ ] 调 `mock-success` 后，`/api/pay/query` 返回 `status=1`，`orders` 表也变已支付：是 / 否
- [ ] **重复调 mock-success，订单状态不变、日志显示「重复回调被拦截」：是 / 否**（幂等验证）
- [ ] 踩坑记录（端口冲突、Redis 未启动、密码错误等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. 第三方支付平台为什么会**重复回调**？如果回调处理不幂等，会发生什么事故？
2. 你的幂等实现分几层？如果 Redis 挂了或者锁过期了，还能保证不重复入账吗？（提示：DB 状态机兜底）
3. 为什么 `UPDATE ... WHERE status=0` 能保证幂等？两个回调**同时**进来，数据库层发生了什么？（提示：InnoDB 原子 + 行锁）
4. 验签是防什么的？除了验签，回调里还校验了什么？为什么「金额」必须和支付单比对？你的代码在哪一行做的？
5. 为什么回调接口要返回纯文本 `success`？返回 `Result` JSON 会怎样？
