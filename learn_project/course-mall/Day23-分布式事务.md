# Day 23 · 分布式事务

> **今天目标**：给「下单」引入 Seata，用 **AT 模式**把「写订单（mall-order）+ 扣库存（mall-stock）」两个服务的本地事务合成一个**全局事务**，跑通「正常提交」和「异常回滚」两条链路；同时把 **TCC** 的原理和 AT 对比清楚（今天只理解、不写代码）。

## 一、前置条件

- 已完成 **Day 02**（`orders` / `order_item` / `course` 表已建好，`course.stock` 字段 Day 11 已加）
- 已完成 **Day 10**（`mall-order` 模块，`POST /api/order/create` 下单接口）
- 已完成 **Day 11**（`mall-stock` 模块，`POST /api/stock/deduct` 原子扣减接口，防超卖）
- 已完成 **Day 13**（Nacos 注册中心已启动，服务注册/发现已打通）
- 已完成 **Day 15**（OpenFeign 远程调用，`@EnableFeignClients`、超时配置都学过）
- 已完成 **Day 21/22**（`mall-order` 里的 MQ 异步下单——**今天要把它改回同步 Feign 扣库存**，见步骤 3 开头）
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
   │ ② Feign 调用 /api/stock/deduct（连接 B，事务 B）
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

- **一阶段**（各 RM 干活，但不提交）：执行本地 SQL 前查出该行「**前镜像**」，执行后记「**后镜像**」，一起写进 `undo_log`；本地事务**先不提交**，向 TC 报告「我准备好了」。
- **二阶段**（TC 拍板）：所有分支都就绪 → **全局提交**（各 RM 提交本地事务，删 `undo_log`）；任一分支失败 → **全局回滚**（各 RM 按前镜像**反向 UPDATE** 把数据改回去，再删日志）。

::: tip 💡 面试题：Seata AT 模式一句话原理？
**一句话**：一阶段**记录前后镜像、不提交**；二阶段要么全局提交（删日志），要么按 `undo_log` 的**前镜像反向补偿**（把数据改回原值）。业务代码只加一个 `@GlobalTransactional` 注解，其余全是 Seata 自动做的——这就是 AT「对业务零侵入」的原因。详见 [Seata](/learn_backend/java/微服务/Seata)。
:::

::: tip 💡 面试题：AT 模式和 TCC 怎么选？
**一句话**：AT 对业务**零侵入**（加注解就行），但有全局锁、性能一般，适合**大多数业务**（订单+库存这种）；TCC 侵入大（每个操作要自己写 Try/Confirm/Cancel 三个接口），但性能好、每一步可控，适合**资金账户等核心链路**。详见 [Seata](/learn_backend/java/微服务/Seata)。
:::

## 四、步骤

### 改造前的现状盘点（Day 21 留下的尾巴，先看懂再动手）

Day 21 把下单改成了 **MQ 异步扣库存**：`createOrder` 里 `syncSend` 发一条消息，由同服务的 `OrderCreateListener` 消费后**本地**扣库存。今天要换成 **Seata 同步 Feign 扣库存**，所以 `createOrder` 要再改一次：

- **删掉** `rocketMQTemplate.syncSend(...)` 那一段和 `rocketMQTemplate` 字段（扣库存不再走 MQ）；
- Day 21 的 `OrderCreateListener`、事务消息 `createTx`、Day 22 的幂等/死信代码**全部保留不动**——消息不再发送，监听器自然收不到消息，不影响它们的存在。

::: tip 💡 面试题：MQ 异步（最终一致）和 Seata（强一致）到底怎么选？
**一句话**：**强一致、实时性强、链路上服务少**（订单+库存这种 2~3 个服务的核心写链路）用 Seata；**允许短暂不一致、需要削峰解耦、链路长**（下单后还要通知、积分、优惠券）用 MQ + 本地消息表/事务消息保证最终一致。两种方案解决的是同一个问题，Day 21 和今天正好是同一个下单场景的两种解法，面试时放在一起讲很加分。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

### 步骤 1：部署 Seata Server（TC）

**① 下载**：从 https://github.com/seata/seata/releases 下载 `seata-server-1.8.0.zip`（客户端 1.8.0 由 Day 13 引入的 Spring Cloud Alibaba BOM 2023.0.1.2 管理，两端版本要一致），解压到 `E:\seata\`。

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

`E:\course-mall\mall-order\src\main\resources\application.yml` 在 Day 21 的基础上补两段（**Day 21 的 `rocketmq` 段保持不变**——MQ 组件还挂在这个服务里，去掉配置反而可能导致启动报错）：

```yaml
server:
  port: 8082              # ⚠️ Day 10/21 都写的 8082；如果你 Day 22 把它改成了 8083，
                          # 就保持 8083，把 mall-stock 换成 8084（步骤 4），下面的 curl 跟着改端口

spring:
  application:
    name: mall-order
  datasource:
    url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
    username: root        # 换成你自己的
    password: 你的密码
    driver-class-name: com.mysql.cj.jdbc.Driver
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848

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
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 打印 SQL，观察事务提交/回滚
  global-config:
    db-config:
      logic-delete-field: deleted
      logic-delete-value: 1
      logic-not-delete-value: 0
```

> `tx-service-group` 是「客户端和 TC 之间的暗号」：所有参加同一个全局事务的服务，这个值必须**完全一致**。`seata.config` 没配（默认 file），因为 Seata 的 spring-boot starter 内置了 `SpringBootConfigurationProvider`——直接读 Spring 环境（就是这份 application.yml），不用再建 file.conf。

#### 3.4 用 DataSourceProxy 包住数据源（AT 核心配置）

新建 `E:\course-mall\mall-order\src\main\java\com\mall\order\config\SeataDataSourceConfig.java`：

```java
package com.mall.order.config;

import io.seata.rm.datasource.DataSourceProxy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;

@Configuration
public class SeataDataSourceConfig {

    // 关键：用 Seata 的 DataSourceProxy 包住 Spring Boot 自动装配的 Hikari 数据源。
    // 之后业务代码的所有 SQL 都会先经过它：自动解析表名/主键、生成前后镜像写 undo_log，
    // 业务代码对此完全无感知——这就是 AT「零侵入」的实现基础。
    // @Primary：容器里现在有两个 DataSource 类型的 Bean，标了 @Primary 的那个
    // 才是 MyBatis-Plus 真正拿去用的，否则注入会因「多个候选」而报错。
    @Bean
    @Primary
    public DataSourceProxy dataSourceProxy(DataSource dataSource) {
        return new DataSourceProxy(dataSource);
    }
}
```

::: tip 💡 面试题：为什么必须用 `DataSourceProxy` 包住数据源？不包会怎样？
**一句话**：AT 模式靠**拦截业务 SQL**来记录前后镜像和回滚补偿，`DataSourceProxy` 就是那个「SQL 拦截器」——它返回的连接是代理连接，每条写 SQL 都会被解析并生成 `undo_log`。不包的话 Seata 拿不到镜像，全局事务要么报错、要么回滚时无凭据。详见 [Seata](/learn_backend/java/微服务/Seata)。
:::

#### 3.5 远程扣库存的 Feign 客户端

新建 `E:\course-mall\mall-order\src\main\java\com\mall\order\feign\StockClient.java`：

```java
package com.mall.order.feign;

import com.mall.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

// name = "mall-stock"：只写服务名不写 IP:端口（Day 15：Nacos 发现 + LoadBalancer 挑实例）
@FeignClient(name = "mall-stock")
public interface StockClient {

    // 方法签名和 mall-stock 的 StockController.deduct 完全对齐（Day 11 实现的那个）
    @PostMapping("/api/stock/deduct")
    Result<Void> deduct(@RequestParam("courseId") Long courseId,
                        @RequestParam("count") Integer count);
}
```

> **XID 怎么传过去？** `mall-order` 开启全局事务后生成一个 XID，SCA 的 Seata 集成会自动把 XID 塞进 Feign 请求头（`TX_XID`），`mall-stock` 侧自动取出挂到线程上下文——**全程不用你写一行代码**。这也是为什么分布式事务必须走带服务发现的调用链，不能自己裸发 HTTP。

#### 3.6 核心：改造 OrderService（@GlobalTransactional）

改 `E:\course-mall\mall-order\src\main\java\com\mall\order\service\OrderService.java`。**注意**：Day 21 加过 `rocketMQTemplate` 字段和 `syncSend` 调用，今天**删掉这两处**；`cancelOrder`（Day 10）、`createTx`、MQ 监听器全部保留不动。下面只列出改动后的 `createOrder` 和公共部分：

```java
package com.mall.order.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.order.dto.CreateOrderRequest;
import com.mall.order.entity.Course;
import com.mall.order.entity.Order;
import com.mall.order.entity.OrderItem;
import com.mall.order.enums.OrderStatus;
import com.mall.order.feign.StockClient;
import com.mall.order.mapper.CourseMapper;
import com.mall.order.mapper.OrderItemMapper;
import com.mall.order.mapper.OrderMapper;
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
public class OrderService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final CourseMapper courseMapper;   // 今天只读课程信息，不再本地扣库存（Day 10/21 的本地扣减都去掉）
    private final StockClient stockClient;     // 远程扣库存：Feign 调 mall-stock

    // 两个注解各管一摊，职责不同、缺一不可：
    // @GlobalTransactional：开启 Seata 全局事务（生成 XID 并分发给各分支），本方法就是 TM。
    //   方法正常返回 → 通知 TC 全局提交；抛异常 → 通知 TC 全局回滚（各 RM 按 undo_log 反向补偿）。
    // @Transactional：括住本服务的「分支事务」——本方法的 insert 必须处在一个
    //   本地事务边界内，DataSourceProxy 才能按「一阶段不提交」的方式拦截住这次提交，
    //   等 TC 二阶段指令再真正提交/回滚。只有全局注解、没有本地事务边界，AT 拿不到干净的分支。
    @GlobalTransactional
    @Transactional(rollbackFor = Exception.class)
    public Order createOrder(CreateOrderRequest request) {
        // 1. 读课程（价格/标题必须取 DB，防前端改价）。生产上应通过 Feign 调 mall-course，
        //    今天为聚焦分布式事务，沿用 Day 10 直接查 course 表的做法。
        Course course = courseMapper.selectById(request.getCourseId());
        if (course == null) {
            throw new BizException(ErrorCode.NOT_FOUND.getCode(), "课程不存在");
        }
        if (course.getStatus() == null || course.getStatus() != 1) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "课程已下架，无法购买");
        }
        int count = request.getCount() == null ? 1 : request.getCount();

        // 2. 分支事务一（本地）：写订单主表 + 明细快照。这两个 insert 会被 DataSourceProxy
        //    拦截并写入 undo_log，本地事务暂不提交，等 TC 二阶段指令。
        Order order = new Order();
        order.setOrderNo(generateOrderNo(request.getUserId()));
        order.setUserId(request.getUserId());
        order.setTotalAmount(course.getPrice().multiply(BigDecimal.valueOf(count)));
        order.setStatus(OrderStatus.PENDING_PAYMENT.getCode());
        orderMapper.insert(order);

        OrderItem item = new OrderItem();
        item.setOrderId(order.getId());
        item.setCourseId(course.getId());
        item.setCourseTitle(course.getTitle());
        item.setCourseCover(course.getCover());
        item.setPrice(course.getPrice());
        orderItemMapper.insert(item);

        // 3. 分支事务二（远程）：Feign 扣库存（XID 随 TX_XID 请求头自动透传）
        Result<Void> stockResult = stockClient.deduct(course.getId(), count);
        if (stockResult.getCode() != 200) {
            // 关键！mall-stock 的「库存不足」返回的是 HTTP 200 + code=400（Day 11 抛
            // BizException(400,...)，全局异常处理器统一返回 HTTP 200 + 业务码），Feign 不抛异常。
            // 这里必须自己检查 code 并抛异常，Seata 才能捕获到并触发全局回滚——
            // 否则订单已写、库存没扣，就是事故现场。
            throw new BizException(stockResult.getCode(), stockResult.getMessage());
        }

        // 4. 模拟故障开关（仅测试用）：库存扣成功后订单侧再抛异常，
        //    用来验证「Seata 把已经扣掉的库存自动补回去」——AT 的回滚能力。
        if (Boolean.TRUE.equals(request.getForceFail())) {
            throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "模拟订单服务异常，验证全局回滚");
        }

        log.info("下单成功 orderNo={} courseId={} count={}", order.getOrderNo(), course.getId(), count);
        return order;
    }

    // 订单号生成（Day 10 的实现，不动）：时间戳 + userId + 6 位随机数
    private String generateOrderNo(Long userId) {
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        int rand = ThreadLocalRandom.current().nextInt(100000, 999999);
        return timestamp + userId + rand;
    }
}
```

::: tip 💡 面试题：`@GlobalTransactional` 和 `@Transactional` 是什么关系？只写其中一个行不行？
**一句话**：`@GlobalTransactional` 管**全局**（TM 身份：开全局事务、发 XID、汇总各分支结果），`@Transactional` 管**本地**（给自己这个分支划定本地事务边界）。只写全局注解：本服务的 SQL 不在明确的本地事务边界内，AT 一阶段「拦住不提交」无从谈起，会提交成散段；只写本地注解：跨服务的两个事务依旧各走各的，回到 Day 10 之后「事故现场」。详见 [Seata](/learn_backend/java/微服务/Seata)。
:::

::: tip 💡 面试题：下游返回「HTTP 200 + code=400」时，Feign 会抛异常吗？不抛会有什么后果？
**一句话**：**不会**——Feign 只把 HTTP 非 2xx 当异常，body 里的业务失败码它不关心。所以 TM 侧**必须自己检查 `Result.code` 并抛异常**，Seata 的全局事务拦截器才能捕获异常并触发全局回滚；漏掉这个检查，全局事务会「正常提交」，留下一笔没扣库存的订单。详见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)。
:::

#### 3.7 DTO 加两个测试字段

改 `E:\course-mall\mall-order\src\main\java\com\mall\order\dto\CreateOrderRequest.java`：

```java
package com.mall.order.dto;

import lombok.Data;

@Data
public class CreateOrderRequest {
    private Long userId;      // 下单用户（Day 04 起从 JWT 取，今天显式传方便测试）
    private Long courseId;    // 要买的课程
    private Integer count = 1;      // 购买数量（今天新增，默认 1）
    private Boolean forceFail;      // 模拟故障开关（今天新增，仅测试用；生产环境别留这种口子）
}
```

### 步骤 4：`mall-stock` 接入 Seata（RM）

库存服务的扣减接口（Day 11 写的原子 SQL）**业务逻辑一行都不用改**——AT 模式对 RM 侧业务代码零侵入。但 Day 11 建的模块**还没注册到 Nacos**（那时还没拆微服务），Feign 按服务名找不到它，所以今天要做四件事：

**① pom 新增两条依赖**（`E:\course-mall\mall-stock\pom.xml`）：

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

**② yml 加 Nacos + Seata 段 + 改端口**（`E:\course-mall\mall-stock\src\main\resources\application.yml`，Day 11 的 datasource / mybatis-plus 保持不变）：

```yaml
server:
  port: 8083              # ⚠️ Day 11 写的 8082 和 mall-order 撞了，今天改成 8083
                          # （若你 Day 22 把 mall-order 改到了 8083，这里就换 8084）。
                          # Feign 按服务名调用，端口随便改——这正是注册中心的价值

spring:
  application:
    name: mall-stock
  # ... Day 11 的 datasource、mybatis-plus 配置保持不变 ...
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848   # 今天新增：注册到 Nacos

# ---- 今天新增：Seata 客户端配置（tx-service-group 必须和 mall-order 完全一致）----
seata:
  tx-service-group: course-mall-tx-group
  service:
    vgroup-mapping:
      course-mall-tx-group: default
  registry:
    type: nacos
    nacos:
      application: seata-server
      server-addr: localhost:8848
      group: SEATA_GROUP
      namespace: ""
```

**③ 加 DataSourceProxy 配置类**：和步骤 3.4 那个类**一模一样**（包名换成 `com.mall.stock.config` 即可），新建 `E:\course-mall\mall-stock\src\main\java\com\mall\stock\config\SeataDataSourceConfig.java` 复制过去。

> 为什么不把这个类抽到 `mall-common`？因为 `mall-common` 不想背上 Seata 依赖——不是所有服务都要分布式事务，公共模块保持轻量，谁用谁引。

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
curl -X POST http://localhost:8082/api/order/create \
  -H "Content-Type: application/json" \
  -d "{\"userId\":1,\"courseId\":1}"
```

预期：返回 `code=200` 的订单；`SELECT stock FROM course WHERE id=1;` 变成 99；`orders`/`order_item` 各多一条；`SELECT COUNT(*) FROM undo_log;` 为 **0**（全局提交后日志已清理）。

**验证 2 · 模拟故障（全局回滚，今天的重头戏）**：

```bash
curl -X POST http://localhost:8082/api/order/create \
  -H "Content-Type: application/json" \
  -d "{\"userId\":1,\"courseId\":1,\"forceFail\":true}"
```

预期：接口返回「模拟订单服务异常，验证全局回滚」。然后查库：

- `orders` / `order_item` **没有新增**（分支一的 insert 被回滚）
- `course.stock` **仍然是 99**——库存先被扣成 98，订单侧抛异常后，Seata 二阶段按 `undo_log` 的前镜像反向 UPDATE，把库存补回了 99
- `undo_log` 表最终为空（补偿完成后日志被删）

**验证 3 · 库存不足（远端业务失败，同样全局回滚）**：

```bash
curl -X POST http://localhost:8082/api/order/create \
  -H "Content-Type: application/json" \
  -d "{\"userId\":1,\"courseId\":1,\"count\":9999}"
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
| Feign 远程调用、TX_XID 透传、HTTP 200 + 业务失败码 | [OpenFeign](/learn_backend/java/微服务/OpenFeign) |
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
- [ ] `forceFail=true` 下单失败后：订单无新增、库存自动补回（先扣后还）：是 / 否
- [ ] `count=9999` 库存不足时订单表无新增（证明检查 code 抛异常生效）：是 / 否
- [ ] 踩坑记录（Seata Server 起不来、注册不上、mall-stock 没注册进 Nacos、数据源代理没生效等）：
- [ ] 疑问（有就写，我来答）：

## 八、我下次会追问的问题（做完先自己想想）

1. Day 10 的 `@Transactional` 为什么在拆分后失效了？「一个事务 = 一个数据库连接」具体怎么理解？Seata 是怎么把两个服务的两个连接「捏」成一个全局事务的？
2. AT 模式一阶段为什么不直接提交本地事务？`undo_log` 是谁写的、什么时候删？全局回滚时 `mall-stock` 那条「反向 UPDATE」是怎么生成的？
3. `@GlobalTransactional` 和 `@Transactional` 各管什么？只写其中一个会发生什么？
4. XID 是怎么从 `mall-order` 传到 `mall-stock` 的？如果不用 Feign、自己用 `RestTemplate` 裸调 HTTP，XID 还能传过去吗？（提示：TX_XID 请求头）
5. AT 和 TCC 怎么选？TCC 的 Try/Confirm/Cancel 为什么都必须幂等？什么是「空回滚」和「悬挂」？另外想想：Day 21 的 MQ 异步下单和今天的 Seata 强一致，各自适合什么场景？
