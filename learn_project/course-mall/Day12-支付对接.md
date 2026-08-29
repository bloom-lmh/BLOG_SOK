# Day 12 · 支付对接（策略模式 + 验签 + 事务幂等）

> **今天目标**：在 Day01～Day12 的模块化单体中新增 `mall-payment` 领域模块，完成发起支付、沙箱回调、签名与金额校验、订单/支付单一致更新和重复回调幂等。今天不接真实资金渠道，但代码边界按真实项目设计。

本日项目根目录统一为 `E:\CourseMall`。支付 Java 文件位于
`mall-payment\src\main\java`；本日仍由 `mall-user` 启动。

## 一、支付链路

```text
已登录用户 -> POST /api/payments -> 校验订单归属/状态 -> 创建或复用支付单
支付平台 -> POST /api/payment/callbacks/sandbox -> 验签 -> 校验金额
         -> 同一本地事务更新 orders + payment -> 返回 success
```

回调会因超时、网络重试或支付平台补偿被发送多次，后端必须让同一回调只生效一次。

::: warning 支付的三条底线
1. 不相信前端传来的价格，金额只从订单和支付单读取。
2. 不用 Redis 锁作为正确性保障，核心依靠唯一索引、条件 `UPDATE` 和事务。
3. 同一回调已成功时仍返回 `success`，否则支付平台会继续重试。
:::

## 二、建立 `mall-payment` 模块

Day12 仍是**模块化单体**：`mall-payment` 是普通 jar，没有启动类、端口和独立数据源；只启动 `mall-user`。Day13 再拆分进程。

在父工程的 `<modules>` 和 `<dependencyManagement>` 中加入 `mall-payment`，然后让 `mall-user` 依赖它：

```xml
<dependency>
    <groupId>com.mall</groupId>
    <artifactId>mall-payment</artifactId>
</dependency>
```

`mall-payment/pom.xml` 的核心依赖：

```xml
<dependencies>
    <dependency>
        <groupId>com.mall</groupId>
        <artifactId>mall-common</artifactId>
    </dependency>
    <dependency>
        <groupId>com.mall</groupId>
        <artifactId>mall-order</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
        <groupId>com.baomidou</groupId>
        <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
    </dependency>
    <dependency>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

依赖方向是 `mall-user -> mall-payment -> mall-order -> mall-stock -> mall-course -> mall-common`。不要在 `mall-payment` 复制 `Order` 实体和 `OrderMapper`。

## 三、数据库约束和错误码

Day02 已包含所需字段和索引。如果旧库是修改文档前建的，才执行：

```sql
ALTER TABLE payment
    ADD COLUMN pay_type TINYINT NOT NULL DEFAULT 1 COMMENT '支付渠道' AFTER order_no,
    ADD COLUMN update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP AFTER create_time,
    ADD UNIQUE KEY uk_order_no (order_no),
    ADD UNIQUE KEY uk_transaction_id (transaction_id);
```

`transaction_id` 可以有多个 `NULL`，但一旦写入真实流水号，同一流水就不能绑定两张订单。

在 `MessageKeys.Payment`、`ErrorCode` 和中英文资源文件中补充：

```java
// MessageKeys.Payment
public static final String NOT_FOUND = "payment.not-found";
public static final String CHANNEL_UNSUPPORTED = "payment.channel-unsupported";

// ErrorCode
PAYMENT_NOT_FOUND(404401, MessageKeys.Payment.NOT_FOUND),
PAYMENT_CHANNEL_UNSUPPORTED(400402, MessageKeys.Payment.CHANNEL_UNSUPPORTED),
```

```properties
# messages_zh_CN.properties
payment.not-found=支付单不存在
payment.channel-unsupported=不支持的支付渠道：{0}

# messages_en_US.properties
payment.not-found=Payment record not found
payment.channel-unsupported=Unsupported payment channel: {0}
```

## 四、实体、DTO 和 VO

```java
package com.mall.payment.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("payment")
public class Payment {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String orderNo;
    private Integer payType;
    private String transactionId;
    private BigDecimal amount;
    private Integer status; // 0待支付 1成功 2失败
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
```

```java
package com.mall.payment.dto;

import jakarta.validation.constraints.*;

public record CreatePaymentRequest(
        @NotBlank @Size(max = 64) String orderNo,
        @NotNull @Min(1) @Max(2) Integer payType) {
}

public record PaymentCallbackRequest(
        @NotBlank @Size(max = 64) String orderNo,
        @NotBlank @Size(max = 64) String transactionId,
        @NotBlank @Pattern(regexp = "^(0|[1-9]\\d*)(\\.\\d{1,2})?$") String amount,
        @NotBlank @Size(max = 128) String sign) {
}
```

```java
package com.mall.payment.vo;

import java.math.BigDecimal;

public record PaymentCreateVO(String orderNo, BigDecimal amount, Integer payType, String payUrl) {}
public record PaymentStatusVO(String orderNo, BigDecimal amount, Integer payType, Integer status) {}
```

Controller 不接收 Entity，也不返回 `Map<String, Object>`。DTO 负责输入约束，VO 负责稳定的接口契约。实际创建时将每个 `public` 类放在同名文件中。

## 五、Mapper：把状态判断放进 SQL

```java
package com.mall.payment.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.payment.entity.Payment;
import org.apache.ibatis.annotations.*;

public interface PaymentMapper extends BaseMapper<Payment> {
    @Select("SELECT * FROM payment WHERE order_no = #{orderNo} FOR UPDATE")
    Payment selectByOrderNoForUpdate(@Param("orderNo") String orderNo);

    @Insert("""
            INSERT IGNORE INTO payment
                (order_no, pay_type, amount, status, create_time, update_time)
            VALUES
                (#{orderNo}, #{payType}, #{amount}, 0, NOW(), NOW())
            """)
    int insertIgnore(Payment payment);

    @Update("""
            UPDATE payment
            SET status = 1, transaction_id = #{transactionId}, update_time = NOW()
            WHERE order_no = #{orderNo} AND status = 0
            """)
    int markPaid(@Param("orderNo") String orderNo,
                 @Param("transactionId") String transactionId);
}
```

在 Day10 的 `com.mall.order.mapper.OrderMapper` 中追加：

```java
@Update("""
        UPDATE orders
        SET status = 1, pay_type = #{payType}, pay_time = #{payTime}, update_time = NOW()
        WHERE order_no = #{orderNo} AND status = 0 AND deleted_at IS NULL
        """)
int markPaid(@Param("orderNo") String orderNo,
             @Param("payType") Integer payType,
             @Param("payTime") LocalDateTime payTime);
```

`WHERE status = 0` 是并发保护：支付回调和用户取消同时到达时，只有一方能把待支付订单改掉。

## 六、支付策略

```java
package com.mall.payment.strategy;

import com.mall.payment.entity.Payment;
import com.mall.payment.vo.PaymentCreateVO;

public interface PaymentStrategy {
    int payType();
    PaymentCreateVO create(Payment payment);
}
```

```java
package com.mall.payment.strategy;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class PaymentStrategyRouter {
    private final Map<Integer, PaymentStrategy> strategies;

    public PaymentStrategyRouter(List<PaymentStrategy> strategies) {
        this.strategies = strategies.stream().collect(Collectors.toUnmodifiableMap(
                PaymentStrategy::payType, Function.identity()));
    }

    public PaymentStrategy route(Integer payType) {
        PaymentStrategy strategy = strategies.get(payType);
        if (strategy == null) {
            throw new BizException(ErrorCode.PAYMENT_CHANNEL_UNSUPPORTED, payType);
        }
        return strategy;
    }
}
```

```java
package com.mall.payment.strategy;

import com.mall.payment.entity.Payment;
import com.mall.payment.vo.PaymentCreateVO;
import org.springframework.stereotype.Component;

@Component
public class SandboxPaymentStrategy implements PaymentStrategy {
    @Override
    public int payType() {
        return 1;
    }

    @Override
    public PaymentCreateVO create(Payment payment) {
        return new PaymentCreateVO(payment.getOrderNo(), payment.getAmount(),
                payment.getPayType(), "/api/payments/" + payment.getOrderNo() + "/mock-success");
    }
}
```

策略模式解决“不同渠道如何创建支付参数”；验签、幂等和状态流转是共同规则，留在 Service。

## 七、沙箱签名配置

`E:\CourseMall\mall-user\src\main\resources\application.yml`：

```yaml
mall:
  payment:
    sandbox-enabled: ${COURSE_MALL_PAYMENT_SANDBOX_ENABLED:true}
    sandbox-secret: ${COURSE_MALL_PAYMENT_SANDBOX_SECRET}
```

IDEA 启动配置的环境变量中加入：

```text
COURSE_MALL_PAYMENT_SANDBOX_SECRET=change-this-local-secret-at-least-32-bytes
```

新建
`E:\CourseMall\mall-payment\src\main\java\com\mall\payment\config\PaymentProperties.java`：

```java
package com.mall.payment.config;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties(prefix = "mall.payment")
public record PaymentProperties(boolean sandboxEnabled, @NotBlank String sandboxSecret) {}
```

新建
`E:\CourseMall\mall-payment\src\main\java\com\mall\payment\config\PaymentConfig.java`：

```java
package com.mall.payment.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(PaymentProperties.class)
public class PaymentConfig {
}
```

新建
`E:\CourseMall\mall-payment\src\main\java\com\mall\payment\support\SandboxSigner.java`：

```java
package com.mall.payment.support;

import com.mall.payment.config.PaymentProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

@Component
@RequiredArgsConstructor
public class SandboxSigner {
    private static final String ALGORITHM = "HmacSHA256";
    private final PaymentProperties properties;

    public String sign(String orderNo, String transactionId, String amount) {
        try {
            String content = orderNo + "|" + transactionId + "|" + amount;
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(new SecretKeySpec(
                    properties.sandboxSecret().getBytes(StandardCharsets.UTF_8), ALGORITHM));
            return HexFormat.of().formatHex(mac.doFinal(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("沙箱签名失败", e);
        }
    }

    public boolean verify(String orderNo, String transactionId, String amount, String sign) {
        byte[] expected = sign(orderNo, transactionId, amount).getBytes(StandardCharsets.UTF_8);
        byte[] actual = sign.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(expected, actual);
    }
}
```

真实支付宝/微信接入时，改用官方 SDK 的验签方法，密钥仍不能写进 Git。

## 八、核心 Service

```java
package com.mall.payment.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.order.entity.Order;
import com.mall.order.mapper.OrderMapper;
import com.mall.payment.dto.*;
import com.mall.payment.entity.Payment;
import com.mall.payment.mapper.PaymentMapper;
import com.mall.payment.strategy.PaymentStrategyRouter;
import com.mall.payment.support.SandboxSigner;
import com.mall.payment.vo.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {
    private final OrderMapper orderMapper;
    private final PaymentMapper paymentMapper;
    private final PaymentStrategyRouter strategyRouter;
    private final SandboxSigner signer;

    @Transactional(rollbackFor = Exception.class)
    public PaymentCreateVO create(Long userId, CreatePaymentRequest request) {
        Order order = findOwnedOrder(userId, request.orderNo());
        if (Integer.valueOf(1).equals(order.getStatus())) {
            throw new BizException(ErrorCode.ORDER_ALREADY_PAID);
        }
        if (!Integer.valueOf(0).equals(order.getStatus())) {
            throw new BizException(ErrorCode.ORDER_CANNOT_PAY);
        }

        Payment payment = findPayment(request.orderNo());
        if (payment == null) {
            payment = new Payment();
            payment.setOrderNo(order.getOrderNo());
            payment.setPayType(request.payType());
            payment.setAmount(order.getTotalAmount());
            paymentMapper.insertIgnore(payment);
            payment = findPayment(request.orderNo());
        }
        if (payment == null) {
            throw new BizException(ErrorCode.PAYMENT_CREATE_FAILED);
        }
        if (!request.payType().equals(payment.getPayType())) {
            throw new BizException(ErrorCode.PAYMENT_CHANNEL_UNSUPPORTED, request.payType());
        }
        return strategyRouter.route(payment.getPayType()).create(payment);
    }

    public PaymentStatusVO getStatus(Long userId, String orderNo) {
        findOwnedOrder(userId, orderNo);
        return toVO(requirePayment(orderNo));
    }

    /** 回调中的订单和支付单必须一起成功或一起回滚。 */
    @Transactional(rollbackFor = Exception.class)
    public void handleCallback(PaymentCallbackRequest request) {
        if (!signer.verify(request.orderNo(), request.transactionId(), request.amount(), request.sign())) {
            throw new BizException(ErrorCode.PAYMENT_SIGNATURE_INVALID);
        }

        // 锁住这张支付单，让同一订单的并发回调按顺序进入状态机。
        Payment payment = paymentMapper.selectByOrderNoForUpdate(request.orderNo());
        if (payment == null) {
            throw new BizException(ErrorCode.PAYMENT_NOT_FOUND);
        }
        if (payment.getAmount().compareTo(new BigDecimal(request.amount())) != 0) {
            throw new BizException(ErrorCode.PAYMENT_AMOUNT_MISMATCH);
        }
        if (Integer.valueOf(1).equals(payment.getStatus())) {
            if (request.transactionId().equals(payment.getTransactionId())) {
                return; // 相同流水重复回调，幂等成功
            }
            throw new BizException(ErrorCode.PAYMENT_CALLBACK_DUPLICATE);
        }

        int orderRows = orderMapper.markPaid(
                request.orderNo(), payment.getPayType(), LocalDateTime.now());
        if (orderRows != 1) {
            throw new BizException(ErrorCode.ORDER_CANNOT_PAY);
        }

        // 失败就抛异常，让上面的订单更新一起回滚。
        if (paymentMapper.markPaid(request.orderNo(), request.transactionId()) != 1) {
            throw new BizException(ErrorCode.PAYMENT_CALLBACK_DUPLICATE);
        }
        log.info("支付回调成功 orderNo={}, transactionId={}",
                request.orderNo(), request.transactionId());
    }

    /** 仅供 dev 环境模拟支付平台回调。 */
    @Transactional(rollbackFor = Exception.class)
    public void mockSuccess(Long userId, String orderNo) {
        findOwnedOrder(userId, orderNo);
        Payment payment = requirePayment(orderNo);
        String transactionId = "sandbox-" + UUID.randomUUID();
        String amount = payment.getAmount().toPlainString();
        handleCallback(new PaymentCallbackRequest(
                orderNo, transactionId, amount, signer.sign(orderNo, transactionId, amount)));
    }

    private Order findOwnedOrder(Long userId, String orderNo) {
        Order order = orderMapper.selectOne(new LambdaQueryWrapper<Order>()
                .eq(Order::getOrderNo, orderNo).eq(Order::getUserId, userId));
        if (order == null) {
            // 不区分不存在与属于别人，避免泄露订单信息。
            throw new BizException(ErrorCode.ORDER_NOT_FOUND, orderNo);
        }
        return order;
    }

    private Payment findPayment(String orderNo) {
        return paymentMapper.selectOne(new LambdaQueryWrapper<Payment>()
                .eq(Payment::getOrderNo, orderNo));
    }

    private Payment requirePayment(String orderNo) {
        Payment payment = findPayment(orderNo);
        if (payment == null) throw new BizException(ErrorCode.PAYMENT_NOT_FOUND);
        return payment;
    }

    private PaymentStatusVO toVO(Payment p) {
        return new PaymentStatusVO(p.getOrderNo(), p.getAmount(), p.getPayType(), p.getStatus());
    }
}
```

这里不使用 Redis 锁，因为支付正确性必须在 Redis 宕机、锁过期或网络抖动时仍成立。`SELECT ... FOR UPDATE` 串行化同一支付单的回调，`status = 0` 条件更新防止越过状态机，唯一索引和本地事务做最终保障。

## 九、Controller 和 Security

```java
package com.mall.payment.controller;

import com.mall.common.result.Result;
import com.mall.payment.dto.*;
import com.mall.payment.service.PaymentService;
import com.mall.payment.vo.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Validated
@RestController
@RequiredArgsConstructor
public class PaymentController {
    private final PaymentService paymentService;

    @PostMapping("/api/payments")
    @PreAuthorize("isAuthenticated()")
    public Result<PaymentCreateVO> create(
            @AuthenticationPrincipal(expression = "id") Long userId,
            @Valid @RequestBody CreatePaymentRequest request) {
        return Result.ok(paymentService.create(userId, request));
    }

    @GetMapping("/api/payments/{orderNo}")
    @PreAuthorize("isAuthenticated()")
    public Result<PaymentStatusVO> status(
            @AuthenticationPrincipal(expression = "id") Long userId,
            @PathVariable @NotBlank @Size(max = 64) String orderNo) {
        return Result.ok(paymentService.getStatus(userId, orderNo));
    }

    // 支付平台不带本系统 JWT，该路径放行，但必须验签。
    @PostMapping(value = "/api/payment/callbacks/sandbox", produces = MediaType.TEXT_PLAIN_VALUE)
    public ResponseEntity<String> callback(@Valid @RequestBody PaymentCallbackRequest request) {
        paymentService.handleCallback(request);
        return ResponseEntity.ok("success");
    }
}
```

新建
`E:\CourseMall\mall-payment\src\main\java\com\mall\payment\controller\SandboxPaymentController.java`：

```java
package com.mall.payment.controller;

import com.mall.common.result.Result;
import com.mall.payment.service.PaymentService;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequiredArgsConstructor
@Profile("dev")
@ConditionalOnProperty(prefix = "mall.payment", name = "sandbox-enabled", havingValue = "true")
public class SandboxPaymentController {
    private final PaymentService paymentService;

    @PostMapping("/api/payments/{orderNo}/mock-success")
    @PreAuthorize("isAuthenticated()")
    public Result<Void> mockSuccess(
            @AuthenticationPrincipal(expression = "id") Long userId,
            @PathVariable @NotBlank @Size(max = 64) String orderNo) {
        paymentService.mockSuccess(userId, orderNo);
        return Result.ok();
    }
}
```

在 Day04 的 `SecurityConfig` 中只放行精确的回调路径：

```java
.authorizeHttpRequests(auth -> auth
        .requestMatchers(HttpMethod.POST, "/api/payment/callbacks/sandbox").permitAll()
        // 其他 Day04～Day09 已有白名单保持不变
        .anyRequest().authenticated())
```

不要放行 `/api/payment/**`，否则查询、模拟支付等接口也会绕过认证。回调放行不等于无安全校验：JWT 换成了支付平台签名。

## 十、联调与验收

启动时使用 `dev` Profile，并配置沙箱密钥。Apifox 请求：

```http
POST http://127.0.0.1:8080/api/payments
Authorization: Bearer <access-token>
Content-Type: application/json

{"orderNo":"202608281234560001","payType":1}
```

```http
POST http://127.0.0.1:8080/api/payments/202608281234560001/mock-success
Authorization: Bearer <access-token>
```

连续调用两次 `mock-success`：第一次使 `orders.status` 和 `payment.status` 都变为 `1`；第二次不得重复更新业务结果。再验证：无 Token 是 401、访问别人订单不泄露数据、错金额被拒绝、错签名被拒绝。

## 十一、知识点索引

| 今天用到的点 | 对应知识文档 |
|---|---|
| 唯一索引、条件更新、事务 | [MySQL](/learn_database/MySQL) |
| `@Transactional` | [Spring 事务](/learn_backend/java/基础/Spring) |
| `@Valid` / `@Validated` | [Spring Boot 参数校验](/learn_backend/java/基础/Spring Boot) |
| `@PreAuthorize` | [Spring Security](/learn_backend/java/基础/Spring Security) |
| 策略模式 | [本节支付策略](#六、支付策略) |

## 十二、✅ 完成后回填

- [ ] `mall-payment` 是普通 jar，只启动 `mall-user`
- [ ] 没有复制 `Order` / `OrderMapper`
- [ ] 发起支付使用 DTO + `@Valid`，并从 JWT 取 userId
- [ ] 查询和模拟支付都校验订单归属
- [ ] 回调完成验签、金额校验和幂等
- [ ] 订单与支付单在同一事务中成功/回滚
- [ ] 沙箱秘钥来自环境变量，未写进 Git
- [ ] 沙箱接口只在 `dev` 环境开启

## 十三、面试追问

1. 为什么支付回调必须幂等？重复回调为什么仍返回 `success`？
2. `UPDATE ... WHERE status = 0` 如何解决支付与取消的竞争？
3. 为什么 Redis 锁不能单独保证支付正确性？
4. 为什么回调可以不带 JWT，却仍然不是“无鉴权”？
5. Day13 拆成微服务后，订单和支付不再共享本地事务，如何保证最终一致性？
