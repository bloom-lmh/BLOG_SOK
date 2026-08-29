# Day 23 · 分布式事务

> **今天目标**：给「下单」引入 Seata，用 **AT 模式**把「写订单（mall-order）+ 扣库存（mall-stock）」两个服务的本地事务合成一个**全局事务**，跑通「正常提交」和「异常回滚」两条链路；同时把 **TCC** 的原理和 AT 对比清楚（今天只理解、不写代码）。

## 一、前置条件

- 已完成 **Day 02**（`orders` / `order_item` / `course` 表已建好，`course.stock` 字段 Day 11 已加）
- 已完成 **Day 10**（`mall-order` 模块，`POST /api/orders` 下单接口）
- 已完成 **Day 11/15**（`mall-stock` 的 `/internal/stocks/deductions` 幂等扣减接口）
- 已完成 **Day 13**（Nacos 注册中心已启动，服务注册/发现已打通）
- 已完成 **Day 15**（OpenFeign 远程调用，`@EnableFeignClients`、超时配置都学过）
- 已完成 **Day 21/22**（订单事务消息、消费幂等与失败处理）。MQ 继续负责订单创建后的异步事件；今天的 Seata 只处理下单主链路中订单与库存的同步一致性
- Seata Server 今天部署（步骤 1）

## 二、先想清楚：为什么要分布式事务

Day 10 的下单是**单体思维**：一个 `@Transactional` 方法里「插订单 + 插明细 + 扣库存」，三条 SQL 走**同一个数据库连接**，一起提交、一起回滚。

拆成微服务后，这个「一起」就不存在了：

```
用户下单
   │
   ▼
┌───────────────┐  ① 写 orders/order_item（连接 A，事务 A）   ┌──────────────┐
│   mall-order   │ ────────────────────────────────────────▶ │   MySQL 库    │
│   (8082)       │                                            │ course_mall  │
└───────────────┘                                            └──────────────┘
   │
   │ ② Feign 调用 /internal/stocks/deductions（连接 B，事务 B）
   ▼
┌───────────────┐  ③ 改 course.stock（连接 B，事务 B）        ┌──────────────┐
│   mall-stock   │ ────────────────────────────────────────▶ │   MySQL 库    │
│   (8083)       │                                            │ course_mall  │
└───────────────┘                                            └──────────────┘
```

**事故现场**：订单写成功（事务 A 已提交），扣库存失败（事务 B 回滚）→ 数据库里躺着一条「没扣库存的订单」。反过来：库存扣了、订单没写成 → 用户钱扣了却查不到订单。

::: tip 💡 面试题：为什么 `@Transactional` 在微服务里失效？
**一句话**：一个本地事务 = 一个数据库连接。跨服务是**两个服务、两个连接、两个互相不知道对方的本地事务**——事务 A 提交后事务 B 才失败，A 不会因为 B 失败而回滚。所以微服务下的数据一致性必须靠**分布式事务**（或最终一致性方案）来解决。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

> 说明：学习阶段两个服务连的是**同一个 MySQL**（`course_mall`），但事务边界已经按服务拆开了——每个服务用自己的连接、自己的事务，这正是「分布式」的含义。生产上每个服务连自己的库，机制完全一样。

## 三、Seata 的三角色 + AT 模式原理（先懂再写）

Seata 里有三个角色：**TC**（Transaction Coordinator，独立部署的全局事务协调者，就是 `E:\seata\` 的 seata-server）、**TM**（Transaction Manager，发起全局事务的一方，就是标 `@GlobalTransactional` 的 `mall-order.createOrder`）、**RM**（Resource Manager，管分支事务的每个连库服务，`mall-order`/`mall-stock` 都是）。

**AT 模式的两阶段**：

```
                    ┌──────────────┐
        注册/心跳    │   Seata TC   │  维护全局事务状态
  ┌────────────────▶│  (Server)    │◀──────────────────┐
  │                 └──────────────┘                   │
  │  ① TM 开启全局事务，生成 XID                 ③ 各 RM 注册分支、汇报状态
  ▼                                                   ▼
┌───────────┐   ② Feign 调用（请求头 TX_XID 透传）  ┌───────────┐
│ mall-order │ ──────────────────────────────────▶ │ mall-stock│
│  TM + RM  │                                     │    RM     │
└───────────┘                                     └───────────┘
```

- **一阶段**：RM 执行业务 SQL，记录前/后镜像和 `undo_log`，注册分支并获取全局锁，然后**提交本地事务并释放本地锁**。这是 AT 与传统 XA 长时持有资源的重要区别。
- **二阶段**：全局提交时异步删除 `undo_log`；全局回滚时根据前镜像生成反向 SQL 补偿，并用后镜像检查脏写。

::: tip 💡 面试题：Seata AT 模式一句话原理？
**一句话**：AT 一阶段在同一本地事务中写业务数据和 `undo_log`，获得全局锁后就提交本地事务；二阶段提交只清理日志，回滚则使用镜像补偿。详见 [Seata](/learn_backend/java/微服务/Seata)。
:::

::: tip 💡 面试题：AT 模式和 TCC 怎么选？
**一句话**：AT 对业务**零侵入**（加注解就行），但有全局锁、性能一般，适合**大多数业务**（订单+库存这种）；TCC 侵入大（每个操作要自己写 Try/Confirm/Cancel 三个接口），但性能好、每一步可控，适合**资金账户等核心链路**。详见 [Seata](/learn_backend/java/微服务/Seata)。
:::

## 四、步骤

### 改造前的现状盘点

Day 21 的事务消息用于发布 `OrderCreatedEvent`，通知、积分等下游可以异步消费；它**不再承担核心扣库存**。今天让 `createOrder` 在 Seata 全局事务内同步调用库存服务，事务成功后再提交订单事件。两条链路不要混为一谈：

- **同步主链路**：写订单 + Feign 扣库存，由 Seata 保证一致性；
- **异步扩展链路**：事务提交后发布订单事件，由 MQ 实现解耦和最终一致性。

::: tip 💡 面试题：MQ 异步（最终一致）和 Seata（强一致）到底怎么选？
**一句话**：**强一致、实时性强、链路上服务少**（订单+库存这种 2~3 个服务的核心写链路）用 Seata；**允许短暂不一致、需要削峰解耦、链路长**（下单后还要通知、积分、优惠券）用 MQ + 本地消息表/事务消息保证最终一致。两种方案解决的是同一个问题，Day 21 和今天正好是同一个下单场景的两种解法，面试时放在一起讲很加分。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

### 步骤 1：部署 Seata Server（TC）

**① 确认版本再下载**：先执行 `mvn dependency:tree -Dincludes=io.seata` 查看项目实际解析出的 Seata 客户端版本，再从 https://github.com/apache/incubator-seata/releases 下载兼容的 Server。不要在课程里写死一个与当前 BOM 不一致的版本。

**② 改配置**：打开 `E:\seata\conf\application.yml`，把 `registry` 从 file 改成 nacos（让 TC 注册到 Nacos，客户端才能发现它）：

```yaml
seata:
  config:
    type: file            # TC 自身配置走本地文件（默认值，学习阶段不动）
  registry:
    type: nacos           # ← 改成 nacos：TC 把自己注册到 Nacos
    nacos:
      application: seata-server
      server-addr: localhost:8848
      group: SEATA_GROUP
      namespace: ""
      # 你的 Nacos 如果开了鉴权，取消这两行注释：
      # username: nacos
      # password: nacos
  store:
    mode: file            # 全局事务会话存本地文件，学习够用；生产建议 mode: db 并建对应的三张表
```

**③ 启动**：

```bash
E:\seata\bin\seata-server.bat     # Windows；macOS/Linux 用 sh seata-server.sh
```

**④ 验证**：打开 Nacos 控制台 `http://localhost:8848/nacos` → 服务列表，能看到 `seata-server`（分组 SEATA_GROUP）。Seata 的 RPC 端口是 `8091`（HTTP 控制台 `7091`），后面客户端就是通过 Nacos 发现这个地址的。

### 步骤 2：建 `undo_log` 表（AT 模式回滚的凭据）

AT 模式下，**参与全局事务的每个库**都要有 `undo_log` 表（前后镜像存这里）。两个服务连的是同一个 `course_mall` 库，建一张即可；生产上每个服务一个库，每个库都要建。

```sql
-- 保存到 E:\course-mall\sql\day23-undo-log.sql 并执行
USE `course_mall`;

CREATE TABLE IF NOT EXISTS `undo_log` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `branch_id`     BIGINT       NOT NULL                COMMENT '分支事务ID',
    `xid`           VARCHAR(128) NOT NULL                COMMENT '全局事务ID',
    `context`       VARCHAR(128) NOT NULL                COMMENT '序列化信息',
    `rollback_info` LONGBLOB     NOT NULL                COMMENT '前后镜像（回滚凭据，核心）',
    `log_status`    INT          NOT NULL                COMMENT '状态：0正常 1已全局提交待清理',
    `log_created`   DATETIME     NOT NULL,
    `log_modified`  DATETIME     NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_undo_log` (`xid`, `branch_id`)        -- 一个全局事务的一个分支只有一条
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Seata AT 模式回滚日志表';
```

::: tip 💡 面试题：`undo_log` 里存的是什么？为什么说它是「回滚的凭据」？
**一句话**：存的是每次 UPDATE/INSERT 的**前镜像**（行改之前的值）和**后镜像**（改之后的值），以及 `xid`/`branch_id`。全局回滚时，Seata 按前镜像生成**反向 UPDATE/DELETE**（把数据改回去），再按 `(xid, branch_id)` 删掉日志——所以删了日志就代表这个分支「尘埃落定」。详见 [Seata](/learn_backend/java/微服务/Seata)。
:::

### 步骤 3：`mall-order` 接入 Seata（TM + RM）

#### 3.1 pom 新增依赖

`E:\course-mall\mall-order\pom.xml` 的 `<dependencies>` 里**新增**（版本都由 Day 13 的父 BOM 管理，不写版本号）：

```xml
<!-- Nacos 服务发现：Day 13 只给 mall-user/mall-course 加过，mall-order 今天才补上 -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<!-- OpenFeign + LoadBalancer：远程调 mall-stock（Day 15 学过） -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-loadbalancer</artifactId>
</dependency>
<!-- Seata：传递引入 io.seata:seata-spring-boot-starter（1.8.0，和 Server 版本一致） -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-seata</artifactId>
</dependency>
```

#### 3.2 启动类加 `@EnableFeignClients`

改 `E:\course-mall\mall-order\src\main\java\com\mall\order\MallOrderApplication.java`：

```java
package com.mall.order;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication(scanBasePackages = "com.mall")
@MapperScan("com.mall.order.mapper")
// 新增：开启 OpenFeign，扫描 @FeignClient 接口（Day 15 讲过原理）
@EnableFeignClients
public class MallOrderApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallOrderApplication.class, args);
    }
}
```

#### 3.3 配置文件补全（Nacos + Seata）

`E:\CourseMall\mall-order\src\main\resources\application.yml` 在 Day21 的基础上补充
数据源、Nacos 和 Seata 配置。Day21 的 `rocketmq` 段继续保留：

```yaml
server:
  port: 8082              # ⚠️ Day 10/21 都写的 8082；如果你 Day 22 把它改成了 8083，
                          # 就保持 8083，把 mall-stock 换成 8084（步骤 4），下面的 curl 跟着改端口

spring:
  application:
    name: mall-order
  datasource:
    url: ${ORDER_DB_URL:jdbc:mysql://127.0.0.1:3306/course_mall?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true}
    username: ${ORDER_DB_USERNAME:root}
    password: ${ORDER_DB_PASSWORD}
    driver-class-name: com.mysql.cj.jdbc.Driver
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_SERVER_ADDR:127.0.0.1:8848}

# ---- Day 21 加的 MQ 配置，今天原样保留（NameServer 没启动也不影响今天的验证）----
rocketmq:
  name-server: 127.0.0.1:9876
  producer:
    group: order-producer-group
    send-message-timeout: 3000

# ---- 今天新增：Seata 客户端配置 ----
seata:
  tx-service-group: course-mall-tx-group   # 事务分组名（自己起），TM/RM 靠它找到 TC 集群
  service:
    vgroup-mapping:
      course-mall-tx-group: default        # 该分组映射到 TC 集群 default
  registry:
    type: nacos                            # 从 Nacos 发现 TC（seata-server 注册在 SEATA_GROUP）
    nacos:
      application: seata-server
      server-addr: localhost:8848
      group: SEATA_GROUP
      namespace: ""

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 仅开发环境打印 SQL
  global-config:
    db-config:
      logic-delete-field: deletedAt
      logic-not-delete-value: 'null'
      logic-delete-value: now()
```

> `tx-service-group` 是「客户端和 TC 之间的暗号」：所有参加同一个全局事务的服务，这个值必须**完全一致**。`seata.config` 没配（默认 file），因为 Seata 的 spring-boot starter 内置了 `SpringBootConfigurationProvider`——直接读 Spring 环境（就是这份 application.yml），不用再建 file.conf。

#### 3.4 使用 Starter 自动代理数据源

```yaml
seata:
  enabled: true
  enable-auto-data-source-proxy: true
  data-source-proxy-mode: AT
```

Seata Spring Boot Starter 会自动将数据源代理为 `DataSourceProxy`。**不再手工声明一个 `@Primary DataSourceProxy` Bean**，否则版本/条件配置不当时可能产生双重代理或数据源循环依赖。启动日志应能确认 AT 数据源代理已生效。

::: tip 💡 面试题：`DataSourceProxy` 做了什么？
**一句话**：它拦截业务 SQL，生成前/后镜像和 `undo_log`，并将本地事务注册为全局分支。现代 Starter 通常自动完成代理，不需要再手写 Bean。
:::

#### 3.5 复用 Day15 的 Feign 客户端

继续使用
`E:\CourseMall\mall-order\src\main\java\com\mall\order\client\StockClient.java`，
不要再创建一份 `com.mall.order.feign.StockClient`。Day15 的客户端已经按服务名调用
`POST /internal/stocks/deductions`，Seata 集成会在同一 Feign 调用上继续传播 XID。

> **XID 怎么传过去？** `mall-order` 开启全局事务后生成一个 XID，SCA 的 Seata 集成会自动把 XID 塞进 Feign 请求头（`TX_XID`），`mall-stock` 侧自动取出挂到线程上下文——**全程不用你写一行代码**。这也是为什么分布式事务必须走带服务发现的调用链，不能自己裸发 HTTP。

#### 3.6 核心：改造 OrderService（@GlobalTransactional）

新建同步强一致版本
`E:\CourseMall\mall-order\src\main\java\com\mall\order\service\SeataOrderService.java`。
它与 Day21 的事务消息方案并列，方便面试时比较“可靠消息最终一致”和“Seata AT”。
不要把两种下单流程同时映射到同一个公网路径：本日验证时让订单 Controller 调用
`SeataOrderService`，Day21 的 `OrderCommandService` 暂时保留但不接公网入口。

```java
package com.mall.order.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.order.dto.CreateOrderRequest;
import com.mall.order.entity.Order;
import com.mall.order.entity.OrderItem;
import com.mall.order.enums.OrderStatus;
import com.mall.order.client.CourseClient;
import com.mall.order.client.StockClient;
import com.mall.order.mapper.OrderItemMapper;
import com.mall.order.mapper.OrderMapper;
import com.mall.order.support.OrderFaultInjector;
import com.mall.order.support.RemoteResult;
import com.mall.order.vo.OrderVO;
import com.mall.contract.course.CourseSnapshotDTO;
import com.mall.contract.stock.StockChangeRequest;
import io.seata.spring.annotation.GlobalTransactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
@RequiredArgsConstructor
public class SeataOrderService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final CourseClient courseClient;
    private final StockClient stockClient;
    private final OrderFaultInjector faultInjector;

    // 两个注解各管一摊，职责不同、缺一不可：
    // @GlobalTransactional：开启 Seata 全局事务（生成 XID 并分发给各分支），本方法就是 TM。
    //   方法正常返回 → 通知 TC 全局提交；抛异常 → 通知 TC 全局回滚（各 RM 按 undo_log 反向补偿）。
    // @Transactional：括住本服务的「分支事务」——本方法的 insert 必须处在一个
    //   本地事务边界内，业务数据和 undo_log 一起提交，并注册为全局分支。
    @GlobalTransactional
    @Transactional(rollbackFor = Exception.class)
    public OrderVO createOrder(Long userId, String requestId, CreateOrderRequest request) {
        // 跨服务只调 API，不再跨库直接查 course 表。
        CourseSnapshotDTO course = RemoteResult.unwrap(
                courseClient.getSnapshot(request.getCourseId()));
        if (!Integer.valueOf(1).equals(course.status())) {
            throw new BizException(ErrorCode.COURSE_OFFLINE);
        }
        int count = request.getCount() == null ? 1 : request.getCount();

        // 分支事务一：写订单主表 + 明细快照。
        Order order = new Order();
        order.setOrderNo(generateOrderNo(userId));
        order.setRequestId(requestId);
        order.setUserId(userId);
        order.setTotalAmount(course.price().multiply(BigDecimal.valueOf(count)));
        order.setStatus(OrderStatus.PENDING_PAYMENT.getCode());
        orderMapper.insert(order);

        OrderItem item = new OrderItem();
        item.setOrderId(order.getId());
        item.setCourseId(course.id());
        item.setCourseTitle(course.title());
        item.setCourseCover(course.cover());
        item.setPrice(course.price());
        orderItemMapper.insert(item);

        // 3. 分支事务二（远程）：Feign 扣库存（XID 随 TX_XID 请求头自动透传）
        RemoteResult.unwrap(stockClient.deduct(new StockChangeRequest(
                course.id(), count, "deduct:" + requestId)));

        // 生产实现为空操作；集成测试 Profile 在这里模拟“库存已扣、订单服务随后故障”。
        faultInjector.afterStockDeducted();

        log.info("下单成功 orderNo={} courseId={} count={}", order.getOrderNo(), course.id(), count);
        return new OrderVO(
                order.getId(),
                order.getOrderNo(),
                order.getTotalAmount(),
                order.getStatus(),
                order.getCreateTime());
    }

    // 订单号生成（Day 10 的实现，不动）：时间戳 + userId + 6 位随机数
    private String generateOrderNo(Long userId) {
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        int rand = ThreadLocalRandom.current().nextInt(100000, 999999);
        return timestamp + userId + rand;
    }
}
```

删除 Day21 `OrderCommandController`（或至少移除它的 `POST /api/orders`），然后新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\controller\SeataOrderController.java`：

```java
package com.mall.order.controller;

import com.mall.common.result.Result;
import com.mall.order.dto.CreateOrderRequest;
import com.mall.order.service.SeataOrderService;
import com.mall.order.vo.OrderVO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Seata AT 同步下单接口。 */
@Validated
@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class SeataOrderController {

    private final SeataOrderService orderService;

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public Result<OrderVO> create(
            @AuthenticationPrincipal(expression = "id") Long userId,
            @RequestHeader("Idempotency-Key")
            @NotBlank @Size(max = 64) String requestId,
            @Valid @RequestBody CreateOrderRequest request) {
        return Result.ok(orderService.createOrder(userId, requestId, request));
    }
}
```

为了可重复测试全局回滚，不要在公网 Controller 留“故障开关”。新建生产环境空实现：

`E:\CourseMall\mall-order\src\main\java\com\mall\order\support\OrderFaultInjector.java`：

```java
package com.mall.order.support;

/** 仅用于集成测试在指定事务位置注入故障。 */
public interface OrderFaultInjector {
    void afterStockDeducted();
}
```

`E:\CourseMall\mall-order\src\main\java\com\mall\order\support\NoOpOrderFaultInjector.java`：

```java
package com.mall.order.support;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** 正常运行时不注入任何故障。 */
@Component
@Profile("!seata-fail")
public class NoOpOrderFaultInjector implements OrderFaultInjector {
    @Override
    public void afterStockDeducted() {
        // 正常环境为空操作。
    }
}
```

::: tip 💡 面试题：`@GlobalTransactional` 和 `@Transactional` 是什么关系？只写其中一个行不行？
**一句话**：`@GlobalTransactional` 由 TM 建立全局边界并传播 XID，`@Transactional` 将本服务的多条 SQL 组成一个清晰本地分支。只有本地注解无法协调跨服务回滚；只有全局注解时单条 SQL 仍可被代理，但多 SQL 的本地原子边界不够清晰，因此业务方法通常两者都使用。
:::

::: tip 💡 面试题：为什么远程业务失败必须转成异常？
**一句话**：Seata 根据 TM 方法是否正常返回决定提交/回滚。Day18 已让下游返回真实非 2xx，并用 `ErrorDecoder` 转成异常；如果仍使用 HTTP 200 + 失败 code，就必须 `unwrap` 检查并抛异常，否则全局事务会误提交。
:::

#### 3.7 完善下单 DTO 校验

改 `E:\course-mall\mall-order\src\main\java\com\mall\order\dto\CreateOrderRequest.java`：

```java
package com.mall.order.dto;

import lombok.Data;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

@Data
public class CreateOrderRequest {
    @NotNull @Positive
    private Long courseId;
    @NotNull @Min(1) @Max(10)
    private Integer count = 1;
}
```

### 步骤 4：`mall-stock` 接入 Seata（RM）

库存服务的扣减接口（Day 11 写的原子 SQL）**业务逻辑一行都不用改**——AT 模式对 RM 侧业务代码零侵入。但 Day 11 建的模块**还没注册到 Nacos**（那时还没拆微服务），Feign 按服务名找不到它，所以今天要做四件事：

**① pom 新增两条依赖**（`E:\CourseMall\mall-stock\pom.xml`）：

```xml
<!-- Nacos 服务注册：今天才补上——Feign 要按服务名发现 mall-stock（Day 13 的 BOM 管版本） -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<!-- Seata（版本由父 BOM 管理） -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-seata</artifactId>
</dependency>
```

**② 创建完整配置文件**
`E:\CourseMall\mall-stock\src\main\resources\application.yml`：

```yaml
server:
  port: 8083              # ⚠️ Day 11 写的 8082 和 mall-order 撞了，今天改成 8083
                          # （若你 Day 22 把 mall-order 改到了 8083，这里就换 8084）。
                          # Feign 按服务名调用，端口随便改——这正是注册中心的价值

spring:
  application:
    name: mall-stock
  datasource:
    url: ${STOCK_DB_URL:jdbc:mysql://127.0.0.1:3306/course_mall?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true}
    username: ${STOCK_DB_USERNAME:root}
    password: ${STOCK_DB_PASSWORD}
    driver-class-name: com.mysql.cj.jdbc.Driver
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_SERVER_ADDR:127.0.0.1:8848}

# ---- 今天新增：Seata 客户端配置（tx-service-group 必须和 mall-order 完全一致）----
seata:
  enabled: true
  enable-auto-data-source-proxy: true
  data-source-proxy-mode: AT
  tx-service-group: course-mall-tx-group
  service:
    vgroup-mapping:
      course-mall-tx-group: default
  registry:
    type: nacos
    nacos:
      application: seata-server
      server-addr: ${NACOS_SERVER_ADDR:127.0.0.1:8848}
      group: SEATA_GROUP
      namespace: ""

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl
  global-config:
    db-config:
      logic-delete-field: deletedAt
      logic-not-delete-value: 'null'
      logic-delete-value: now()
```

**③ Starter 自动数据源代理已经包含在上面的完整 YAML 中**。不要再复制手写
`DataSourceProxy` 配置类。

**④（建议）给扣减方法加上本地事务边界**：改 `E:\course-mall\mall-stock\src\main\java\com\mall\stock\service\StockService.java` 的 `deductByAtomicSql`，方法上加 `@Transactional(rollbackFor = Exception.class)`（import `org.springframework.transaction.annotation.Transactional`）。和 TM 侧同理：RM 的 SQL 也要有明确的本地事务边界，AT 才能把它作为一个干净的分支交给 TC 管理。

### 步骤 5：启动验证（正常提交 + 异常回滚）

启动前确认依赖服务都活着：**Nacos（8848）**、**Seata Server（8091）**、MySQL。先把库存重置成 100，方便观察：

```sql
UPDATE `course` SET `stock` = 100 WHERE `id` = 1;
```

编译 + 启动（在 `E:\course-mall\` 根目录）：

```bash
mvn clean install -DskipTests

# 终端 1：订单服务（TM）
mvn -pl mall-order spring-boot:run

# 终端 2：库存服务（RM）
mvn -pl mall-stock spring-boot:run
```

> 启动后先打开 Nacos 控制台确认 **`mall-order` 和 `mall-stock` 都在服务列表里**再往下测。如果 `mall-stock` 不在，curl 会报 Feign 错 `Load balancer does not have available server for client: mall-stock`——八成是步骤 4 的 nacos-discovery 没加或没生效。

**验证 1 · 正常下单（全局提交）**：

```bash
curl -X POST http://localhost:9000/api/orders \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Idempotency-Key: seata-ok-001" \
  -H "Content-Type: application/json" \
  -d '{"courseId":1,"count":1}'
```

预期：返回 `code=200` 的订单；`SELECT stock FROM course WHERE id=1;` 变成 99；`orders`/`order_item` 各多一条；`SELECT COUNT(*) FROM undo_log;` 为 **0**（全局提交后日志已清理）。

**验证 2 · 模拟故障（全局回滚，今天的重头戏）**。

新建测试故障实现
`E:\CourseMall\mall-order\src\test\java\com\mall\order\support\FailingOrderFaultInjector.java`：

```java
package com.mall.order.support;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("seata-fail")
public class FailingOrderFaultInjector implements OrderFaultInjector {
    @Override
    public void afterStockDeducted() {
        throw new IllegalStateException("seata rollback test");
    }
}
```

新建集成测试
`E:\CourseMall\mall-order\src\test\java\com\mall\order\service\SeataRollbackIntegrationTest.java`：

```java
package com.mall.order.service;

import com.mall.order.dto.CreateOrderRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@ActiveProfiles("seata-fail")
class SeataRollbackIntegrationTest {

    @Autowired
    private SeataOrderService orderService;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void prepare() {
        jdbcTemplate.update("UPDATE course SET stock = 100 WHERE id = 1");
        jdbcTemplate.update(
                "DELETE FROM orders WHERE user_id = ? AND request_id = ?",
                1L,
                "seata-fail-001");
    }

    @Test
    void shouldRollbackOrderAndRemoteStock() {
        CreateOrderRequest request = new CreateOrderRequest();
        request.setCourseId(1L);
        request.setCount(1);

        assertThatThrownBy(() -> orderService.createOrder(
                1L, "seata-fail-001", request))
                .isInstanceOf(IllegalStateException.class);

        Integer orderCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM orders WHERE user_id = ? AND request_id = ?",
                Integer.class,
                1L,
                "seata-fail-001");
        Integer stock = jdbcTemplate.queryForObject(
                "SELECT stock FROM course WHERE id = 1",
                Integer.class);

        assertThat(orderCount).isZero();
        assertThat(stock).isEqualTo(100);
    }
}
```

预期：测试捕获故障异常。然后查库：

- `orders` / `order_item` **没有新增**（分支一的 insert 被回滚）
- `course.stock` **仍然是 99**——库存先被扣成 98，订单侧抛异常后，Seata 二阶段按 `undo_log` 的前镜像反向 UPDATE，把库存补回了 99
- `undo_log` 表最终为空（补偿完成后日志被删）

**验证 3 · 库存不足（远端业务失败，同样全局回滚）**：

```bash
curl -X POST http://localhost:9000/api/orders \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Idempotency-Key: seata-stock-001" \
  -H "Content-Type: application/json" \
  -d '{"courseId":1,"count":9999}'
```

预期：返回「库存不足」，且 `orders` 表**没有新增**——这正是 3.6 里「必须检查 code 抛异常」那一步生效的结果。

> 观察日志：`mall-order` 的 SQL 日志里先看到 INSERT，随后是 Seata 的 `Global transaction rollback` / `branch rollback`；`mall-stock` 日志里能看到 Seata 自动生成的 `UPDATE course SET stock = stock + ? ...`（反向补偿 SQL）。这两条日志就是 AT 模式在工作的直接证据。

## 五、TCC 对比（面试视角，今天不写代码）

TCC = **Try / Confirm / Cancel**，把一次业务操作拆成三个阶段：**Try** 预留资源（冻结库存/余额，不落最终数据）→ **Confirm** 确认（真正扣掉冻结的资源）→ **Cancel** 取消（释放预留）。以「下单扣库存」为例：Try 冻结库存，Confirm 扣掉冻结量，Cancel 解冻。

| 维度 | AT 模式（今天实现） | TCC |
|---|---|---|
| 侵入性 | 低：加注解 + 数据源代理，业务零改动 | 高：每个参与方要实现 3 个接口 |
| 原理 | Seata 自动记前后镜像，回滚时反向 UPDATE | 业务自己定义「预留/确认/取消」 |
| 性能 | 一般（全局锁 + 额外镜像 SQL） | 好：无全局锁，预留的是业务字段 |
| 一致性 | 最终一致，存在短暂脏读窗口 | 各阶段语义由业务掌控 |
| 适用 | 大多数业务（订单、库存、积分） | 资金、账户等核心链路 |

::: tip 💡 面试题：TCC 最大的坑是什么？
**一句话**：Confirm/Cancel 可能因网络重试被**重复调用**，所以三个接口都必须**幂等**；还要处理两个边界场景——**空回滚**（Cancel 先到、Try 还没执行过）和**悬挂**（Try 因为网络延迟晚于 Cancel 到达，导致资源被冻结却无人确认）。这是 TCC 面试的必考点。详见 [Seata](/learn_backend/java/微服务/Seata)。
:::

> 今天把 AT 模式跑通、TCC 原理吃透就够了。想动手写 TCC（给库存服务实现 Try/Confirm/Cancel）的话告诉我，另排一天。

## 六、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| Seata 三角色（TC/TM/RM）、AT 两阶段、undo_log 前后镜像 | [Seata](/learn_backend/java/微服务/Seata) |
| 分布式事务理论：CAP/BASE、2PC、最终一致 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| `@GlobalTransactional` + `@Transactional` 分工、DataSourceProxy 数据源代理 | [Seata](/learn_backend/java/微服务/Seata) |
| Feign 远程调用、TX_XID 透传、非 2xx 与业务异常转换 | [OpenFeign](/learn_backend/java/微服务/OpenFeign) |
| TC 注册到 Nacos、按服务名发现 | [Nacos](/learn_backend/java/微服务/Nacos) |
| 本地事务 `@Transactional` 与 AOP 代理的边界 | [Spring](/learn_backend/java/基础/Spring) |
| 反向补偿 UPDATE、行锁与前后镜像 | [MySQL](/learn_database/MySQL) |
| MQ 最终一致 vs Seata 强一致（Day 21 场景对照） | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |

## 七、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] Seata Server 启动成功，Nacos 服务列表能看到 `seata-server`：是 / 否
- [ ] `undo_log` 表建成功：是 / 否
- [ ] Nacos 服务列表能看到 `mall-order` 和 `mall-stock`：是 / 否
- [ ] `mall-order`（8082）、`mall-stock`（8083）都启动成功且无 Seata 相关报错：是 / 否
- [ ] 正常下单成功：订单 +1、库存 -1、`undo_log` 为空：是 / 否
- [ ] 集成测试注入故障后：订单无新增、库存自动补回（先扣后还）：是 / 否
- [ ] `count=9999` 库存不足时订单表无新增（证明检查 code 抛异常生效）：是 / 否
- [ ] 踩坑记录（Seata Server 起不来、注册不上、mall-stock 没注册进 Nacos、数据源代理没生效等）：
- [ ] 疑问（有就写，我来答）：

## 八、我下次会追问的问题（做完先自己想想）

1. Day 10 的 `@Transactional` 为什么在拆分后失效了？「一个事务 = 一个数据库连接」具体怎么理解？Seata 是怎么把两个服务的两个连接「捏」成一个全局事务的？
2. AT 一阶段为什么可以提交本地事务？`undo_log` 和全局锁如何支持二阶段回滚？
3. `@GlobalTransactional` 和 `@Transactional` 各管什么？只写其中一个会发生什么？
4. XID 是怎么从 `mall-order` 传到 `mall-stock` 的？如果不用 Feign、自己用 `RestTemplate` 裸调 HTTP，XID 还能传过去吗？（提示：TX_XID 请求头）
5. AT 和 TCC 怎么选？TCC 的 Try/Confirm/Cancel 为什么都必须幂等？什么是「空回滚」和「悬挂」？另外想想：Day 21 的 MQ 异步下单和今天的 Seata 强一致，各自适合什么场景？
