# Day 22 · MQ下（幂等 + 死信 + 消息不丢失）

> **今天目标**：在 Day 21「异步下单」的 MQ 链路上，把订单消息从「能发出去」升级成「**不丢、不重、失败可查**」——消费端做**幂等**防重复下单、配**死信队列**兜住毒消息、落地**消息不丢失**的三端保证。这是 RocketMQ 进阶里面试考察最密的三个点，也是「引入 MQ 到底值不值」的关键答案。

## 一、前置条件

- 已完成 **Day 01**（`Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler` 都在 `mall-common`）
- 已完成 **Day 02**（11 张表已建，`orders` 表已有 `uk_order_no` 唯一索引）
- 已完成 **Day 21（MQ上）**：RocketMQ 已接入，`mall-order` 服务能发订单消息、有基础消费者
- **RocketMQ 已启动**（NameServer `127.0.0.1:9876`，Broker 正常）
- MySQL 已启动，能连上 `course_mall` 库

## 二、先想清楚：为什么引入 MQ 就绕不开这三个问题

Day 21 用 MQ 换来了「异步、解耦、削峰」，但代价是三个必须自己解决的新问题，它们之间有内在联系：

| 问题 | 为什么会出现 | 对应解法 |
|---|---|---|
| **消息不丢失** | 消息从生产 → Broker 存储 → 消费要过三个节点，任一节点宕机都可能丢 | 三端兜底 |
| **重复消费** | 为了「不丢」，MQ 采用**至少一次**投递：发送失败要重发、消费失败要重投，重发/重投必然带来重复 | 消费端幂等 |
| **毒消息堆积** | 消费失败会无限重试？不会——但有上限，超过上限的消息要有个去处，否则阻塞队列 | 死信队列 |

**核心辩证关系一句话**：`不丢失` 靠「重试」，`重试` 必然带来 `重复`，所以必须 `幂等`；而「永远失败的消息」重试到上限后要进 `死信`，避免占用队列阻塞后续消息。

::: tip 💡 面试题：RocketMQ 能保证「消息不丢」和「恰好一次」吗？
**一句话**：RocketMQ 通过配置可以做到「**不丢**」（至少一次投递），但**做不到「恰好一次」**——「恰好一次」本质是「不丢 + 不重」，而不重只能靠**消费者自己做幂等**，MQ 本身不负责。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

## 三、完成后你会得到什么

1. 一个 `mall-order` 模块（端口 8083），跑通「发消息 → 消费 → 幂等落库」完整链路
2. 生产者**同步发送 + 结果校验**，Broker **同步刷盘/同步复制**配置，消费者**成功才确认**——三端兜底防丢失
3. 消费者用 `orders` 表的 `uk_order_no` 唯一索引做幂等，重复消息被安全跳过
4. 一个死信队列消费者 + 一个「毒消息」测试入口，能亲眼看到消息重试 16 次后进 `%DLQ%`

## 四、步骤

### 步骤 1：模块骨架 + 依赖（先解决「版本坑」）

新建 `mall-order` 模块，父 `pom.xml` 的 `<modules>` 里加一行：

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-course</module>
    <module>mall-stock</module>
    <module>mall-order</module>   <!-- 今天新增 -->
</modules>
```

`mall-order/pom.xml`：

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

    <artifactId>mall-order</artifactId>

    <dependencies>
        <!-- 复用 Day01 的 Result / ErrorCode / BizException / GlobalExceptionHandler -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        <!-- ⚠️ RocketMQ starter 版本坑：
             2.2.x 只支持 Spring Boot 2（javax 命名空间），Boot 3（jakarta）会起不来；
             2.3.x 才开始支持 Spring Boot 3。本项目 Boot 3.2.5，必须用 2.3.x -->
        <dependency>
            <groupId>org.apache.rocketmq</groupId>
            <artifactId>rocketmq-spring-boot-starter</artifactId>
            <version>2.3.1</version>
        </dependency>

        <!-- MyBatis-Plus：幂等落库要用，版本与 Day11 保持一致 -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
            <version>3.5.5</version>
        </dependency>
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
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

启动类 `com/mall/order/MallOrderApplication.java`：

```java
package com.mall.order;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// scanBasePackages = "com.mall"：扫到 mall-common 的全局异常处理器（老规矩）
// @MapperScan：告诉 MyBatis 去哪里找 Mapper 接口
@SpringBootApplication(scanBasePackages = "com.mall")
@MapperScan("com.mall.order.mapper")
public class MallOrderApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallOrderApplication.class, args);
    }
}
```

配置 `mall-order/src/main/resources/application.yml`：

```yaml
server:
  port: 8083                 # 8080/8081/8082 已被 user/course/stock 占用

spring:
  application:
    name: mall-order
  datasource:
    url: jdbc:mysql://localhost:3306/course_mall?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8&allowPublicKeyRetrieval=true
    username: root
    password: 你的密码          # ⚠️ 改成你自己的 MySQL root 密码
    driver-class-name: com.mysql.cj.jdbc.Driver

rocketmq:
  name-server: 127.0.0.1:9876   # NameServer 地址
  producer:
    group: order-producer-group
    send-message-timeout: 3000          # 发送超时（毫秒）
    retry-times-when-send-failed: 3     # 同步发送失败重试次数（「不丢失」生产端兜底之一）
    retry-times-when-send-async-failed: 3

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true   # create_time -> createTime 自动映射
```

### 步骤 2：消息不丢失 —— 三端兜底

消息要经过「生产 → Broker 存储 → 消费」三个节点，任何一个节点都可能丢，所以必须三端各自兜底。先看一张总表，再逐端落地：

| 环节 | 会怎么丢 | 怎么防 |
|---|---|---|
| 生产端 | `sendOneway()` 发完不管，Broker 收没收到都不知道 | 同步发送 + 校验 `SEND_OK` + 失败重试 |
| Broker 端 | 消息只在内存 Page Cache，还没落盘就宕机 | 同步刷盘 + 同步复制 |
| 消费端 | 拿到消息没处理完就返回成功，消息被「确认」丢了 | 处理成功才返回 `CONSUME_SUCCESS`，失败抛异常重试 |

**2.1 生产端：同步发送 + 结果校验**

`com/mall/order/dto/OrderMessage.java`（消息体 DTO）：

```java
package com.mall.order.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class OrderMessage {
    private String orderNo;          // 订单号：既做业务键，也做幂等键
    private Long userId;             // 下单用户
    private Long courseId;           // 课程 ID
    private BigDecimal totalAmount;  // 订单金额
}
```

`com/mall/order/producer/OrderMqProducer.java`：

```java
package com.mall.order.producer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.exception.BizException;
import com.mall.order.dto.OrderMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.client.producer.SendResult;
import org.apache.rocketmq.client.producer.SendStatus;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.apache.rocketmq.spring.support.RocketMQHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderMqProducer {

    private final RocketMQTemplate rocketMQTemplate;
    private final ObjectMapper objectMapper;   // Spring Boot 自动装配的 Jackson，别自己 new

    public static final String TOPIC = "order-create-topic";
    public static final String TAG = "create";

    public void sendOrderMessage(OrderMessage msg) {
        try {
            String json = objectMapper.writeValueAsString(msg);
            // 把订单号放进消息 Key（不是 body），Broker 会建 IndexFile 索引，
            // 之后能按 orderNo 快速定位消息、排查「这条消息到底发没发」
            Message<String> message = MessageBuilder
                    .withPayload(json)
                    .setHeader(RocketMQHeaders.KEYS, msg.getOrderNo())
                    .build();

            // 同步发送：阻塞等 Broker 返回结果。为什么不用 sendOneway？
            // sendOneway 发完就走，Broker 收没收到都不知道，只能用于「丢得起的消息」（日志）
            SendResult result = rocketMQTemplate.syncSend(TOPIC + ":" + TAG, message);

            // 关键：只有 SEND_OK 才代表 Broker 已接收（落盘/入内存），其他状态都要当失败处理
            if (result.getSendStatus() != SendStatus.SEND_OK) {
                throw new BizException(500, "消息发送失败，状态=" + result.getSendStatus());
            }
            log.info("订单消息发送成功 orderNo={} msgId={}", msg.getOrderNo(), result.getMsgId());
        } catch (BizException e) {
            throw e;   // 业务异常直接抛，交给全局异常处理器
        } catch (Exception e) {
            // 序列化失败 / 网络异常：同样抛出去。注意——这里不能「吞掉」，
            // 吞掉 = 上层以为发送成功 = 消息在源头就丢了
            log.error("订单消息发送异常 orderNo={}", msg.getOrderNo(), e);
            throw new BizException(500, "消息发送异常");
        }
    }
}
```

::: tip 💡 面试题：同步、异步、单向发送，什么时候用哪个？
**一句话**：重要消息用**同步发送**（等 `SEND_OK` 才认为成功，最可靠）；对时延敏感、可容忍短暂不一致的用**异步发送**（回调拿结果）；只有日志这类「丢了无所谓」的才用**单向发送**（吞吐最高但不保证送达）。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

**2.2 Broker 端：同步刷盘 + 同步复制（这是配置，不是代码）**

改 RocketMQ 的 `broker.conf`（RocketMQ 安装目录 `conf/` 下）：

```properties
# 同步刷盘：消息写入内存 Page Cache 后，立即 fsync 落盘，落盘成功才返回 ACK
# 默认是 ASYNC_FLUSH（异步刷盘，宕机可能丢 1 秒内的消息）
flushDiskType = SYNC_FLUSH

# 同步复制：Master 等 Slave 写完才返回 ACK，Master 挂了数据还在 Slave
# 默认是 ASYNC_MASTER（异步复制，主挂了可能丢刚发的消息）
brokerRole = SYNC_MASTER
```

改完重启 Broker 时指定该配置：

```bash
mqbroker -c conf/broker.conf
```

> 刷盘和复制是两个**独立维度**：刷盘管「本机宕机丢不丢」，复制管「Master 宕机数据还在不在」。二者可组合出四种可靠性等级，全同步（`SYNC_FLUSH + SYNC_MASTER`）最可靠但最慢，是金融/支付级配置；普通业务用默认的「异步刷盘 + 异步复制」即可。

::: tip 💡 面试题：刷盘和主从复制有什么区别？
**一句话**：刷盘是**单机**维度（消息是否真正落到磁盘），主从复制是**集群**维度（Master 和 Slave 是否有备份），两者独立可组合。金融级要「同步刷盘 + 同步复制」双保险，普通业务「异步刷盘 + 异步复制」即可。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

**2.3 消费端：成功才确认（这端最容易踩坑）**

消费端的「不丢」靠一个原则：**业务处理成功后，消息才被确认；处理失败必须让 MQ 重投，绝不能吞异常**。

- 用 `RocketMQListener` 时，`onMessage` 方法**正常返回 = `CONSUME_SUCCESS`**（消费进度推进，消息被确认）
- `onMessage` 里**抛异常 = `RECONSUME_LATER`**（消息进入重试队列，稍后重投）

所以最危险的写法是 `try-catch` 把所有异常都吞掉然后正常返回——这等于告诉 MQ「我处理好了」，消息就真的丢了。我们在步骤 3 的消费者里会看到正确姿势：只 catch「幂等跳过」这一种情况，其余异常一律往上抛。

### 步骤 3：幂等 —— 用 `uk_order_no` 唯一索引防重复下单

先补实体和 Mapper。

`com/mall/order/entity/Order.java`：

```java
package com.mall.order.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;

// @TableName("orders")：直接复用 Day02 的订单表，不另建表
@Data
@TableName("orders")
public class Order {
    @TableId(type = IdType.AUTO)
    private Long id;

    private String orderNo;         // 订单号（对应唯一索引 uk_order_no）
    private Long userId;
    private BigDecimal totalAmount;
    private Integer status;         // 订单状态：0 待支付
}
```

`com/mall/order/mapper/OrderMapper.java`：

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.order.entity.Order;

public interface OrderMapper extends BaseMapper<Order> {
}
```

`com/mall/order/consumer/OrderCreateConsumer.java`（今天最核心的类）：

```java
package com.mall.order.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.exception.BizException;
import com.mall.order.dto.OrderMessage;
import com.mall.order.entity.Order;
import com.mall.order.mapper.OrderMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Slf4j
@Component
@RequiredArgsConstructor
// topic/consumerGroup 要和生产者保持一致。
// consumerGroup 很重要：它决定重试队列名 %RETRY%xxx 和死信队列名 %DLQ%xxx
@RocketMQMessageListener(topic = OrderCreateConsumer.TOPIC, consumerGroup = OrderCreateConsumer.GROUP)
public class OrderCreateConsumer implements RocketMQListener<String> {

    public static final String TOPIC = "order-create-topic";
    public static final String GROUP = "order-consumer-group";

    private final ObjectMapper objectMapper;
    private final OrderMapper orderMapper;

    @Override
    public void onMessage(String json) {
        // 1. 反序列化。消息体是脏数据时会抛异常 -> 触发 MQ 重试（不吞，所以不丢）
        OrderMessage msg = parse(json);

        // 2. 毒消息校验：金额非法是「不可重试错误」，重试一万次也不会变合法。
        // 这里先抛出去演示「默认行为」；步骤 4 会讲怎么更优雅地处理它
        if (msg.getTotalAmount() == null || msg.getTotalAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new BizException(400, "非法订单金额，orderNo=" + msg.getOrderNo());
        }

        // 3. 幂等落库：直接 insert，靠 orders 表的 uk_order_no 唯一索引去重
        Order order = new Order();
        order.setOrderNo(msg.getOrderNo());
        order.setUserId(msg.getUserId());
        order.setTotalAmount(msg.getTotalAmount());
        order.setStatus(0);   // 0 = 待支付

        try {
            orderMapper.insert(order);
        } catch (DuplicateKeyException e) {
            // 唯一索引冲突 = 这条订单已经落过库（消息被重投/重复消费）-> 幂等跳过。
            // 为什么「正常 return」而不是抛异常？因为这是「业务已经成功过」，确认即可
            log.warn("重复消息，幂等跳过 orderNo={}", msg.getOrderNo());
            return;
        }
        // 走到这里说明插入成功。注意：这里没包 try-catch，
        // 其他异常（如 DB 抖动）会往上抛 -> RECONSUME_LATER -> 稍后重投 -> 重试成功后再确认
        log.info("订单创建成功 orderNo={} userId={}", msg.getOrderNo(), msg.getUserId());
    }

    private OrderMessage parse(String json) {
        try {
            return objectMapper.readValue(json, OrderMessage.class);
        } catch (Exception e) {
            throw new BizException(400, "消息体非法，无法解析");
        }
    }
}
```

**为什么用唯一索引做幂等，而不是「先查再插」？** 这是今天的关键追问点。

「先 `select` 判断 orderNo 存不存在，不存在才 `insert`」有两个致命缺陷：

1. **并发窗口**：两个消费线程同时 `select` 都查到「不存在」，都去 `insert` → 重复落库。
2. **宕机窗口**：`insert` 成功了，但还没来得及确认就宕机，消息重投后 `select` 查到「已存在」，跳过——这个还能凑合；但反过来，如果 `insert` 和「标记已处理」不是原子的，仍会有问题。

唯一索引把「查重 + 插入」合并成**数据库层的一条原子操作**：`uk_order_no` 约束下，同样的 orderNo 第二次 `insert` 必然失败，无论并发还是宕机重投都漏不掉。**约束在数据库层，任何时刻、任何并发下都成立**——这和 Day 11 用 `WHERE stock >= n` 防超卖、Day 02 用 `uk_user_activity` 防一人多单是同一个思想。

::: tip 💡 面试题：消息幂等的几种实现方式？各适用什么场景？
**一句话**：① **数据库唯一索引**（重复插入报错，强一致，最可靠）；② **Redis `setnx`**（首次写入成功才处理，有 TTL 自动过期，最常用）；③ **状态字段**（`update ... where status='未处理'`，看影响行数）；④ **本地去重表**（单体/低并发）。订单这种「不能重复扣钱」的场景，唯一索引是最终兜底。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)、[Redis](/learn_database/Redis)。
:::

::: tip 💡 面试题：为什么 RocketMQ 会重复消费？
**一句话**：RocketMQ 是**至少一次**投递——发送失败会重发、消费失败会重投、消费进度提交前宕机会重放，这些「重」都会让同一条消息被消费多次，所以幂等是消费者的必答题。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

### 步骤 4：死信 —— 有限重试 + 兜底

先搞懂默认的重试机制：

- 消费失败（`onMessage` 抛异常）→ 消息进入重试队列 `%RETRY%消费者组`
- 重试间隔**按延迟级别递增**：`10s → 30s → 1m → 2m → 3m → ... → 30m → 1h → 2h`
- 默认最多重试 **16 次**
- 16 次后仍失败 → 进入**死信队列** `%DLQ%消费者组`，不再自动消费

为什么不能无限重试？因为消费是**按队列串行**推进的（尤其顺序消费），一条永远失败的消息若无限重试，会一直卡在队首，把后面的正常消息全部堵住 → 消息堆积。

`com/mall/order/consumer/OrderDeadLetterConsumer.java`：

```java
package com.mall.order.consumer;

import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
// 死信队列 topic 命名规则：%DLQ% + 原消费者组。
// 单独订阅它，把「重试 16 次仍失败」的消息捞出来人工处理，而不是让它们永远躺在队列里
@RocketMQMessageListener(topic = "%DLQ%order-consumer-group", consumerGroup = "order-consumer-group-dlq")
public class OrderDeadLetterConsumer implements RocketMQListener<String> {

    @Override
    public void onMessage(String json) {
        // 生产上这里应该：① 落库记录死信（便于追溯）② 发告警（钉钉/邮件）让人工介入
        log.error("死信消息待人工处理，消息体：{}", json);
    }
}
```

**为什么还要区分「可重试异常」和「不可重试异常」？**

步骤 3 的毒消息（金额非法）如果就让它抛异常，会白白重试 16 次（每次间隔越来越长，最多浪费 2 小时）才进死信。更优的做法是：**临时性错误（DB 抖动、网络超时）才重试，业务性毒消息（数据非法）直接记死信跳过，别浪费 16 次重试**。这也是面试里体现你「真在生产上用过 MQ」的细节。

::: tip 💡 面试题：死信队列是什么？为什么需要它？
**一句话**：消费重试超过上限（默认 16 次）仍失败的消息进入死信队列（`%DLQ%消费者组`），不再自动消费、改由人工/告警处理。原因：失败消息若无限重试会卡住队列头部、阻塞后续消息造成堆积，所以用「有限重试 + 死信」隔离问题消息。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

::: tip 💡 面试题：消费失败的异常都要重试吗？
**一句话**：不是。**临时性异常**（DB 抖动、下游超时）值得重试，重试大概率能成功；**业务性毒消息**（数据非法、逻辑错误）重试一万次也没用，应该 catch 后记录死信直接跳过，否则白白浪费 16 次重试还占着队列。
:::

### 步骤 5：下单入口 + 验证

`com/mall/order/controller/OrderController.java`：

```java
package com.mall.order.controller;

import com.mall.common.result.Result;
import com.mall.order.dto.OrderMessage;
import com.mall.order.producer.OrderMqProducer;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.UUID;

@RestController
@RequestMapping("/api/order")
@RequiredArgsConstructor
public class OrderController {

    private final OrderMqProducer orderMqProducer;

    /** 正常下单：发消息，消费者异步落库 */
    @PostMapping("/create")
    public Result<String> create(@RequestParam Long userId,
                                 @RequestParam Long courseId,
                                 @RequestParam BigDecimal amount) {
        OrderMessage msg = new OrderMessage();
        // 订单号：真实项目用雪花算法（Day24 分库分表时换），现在用时间戳+UUID 保证唯一即可
        msg.setOrderNo("NO" + System.currentTimeMillis() + UUID.randomUUID().toString().substring(0, 6));
        msg.setUserId(userId);
        msg.setCourseId(courseId);
        msg.setTotalAmount(amount);
        orderMqProducer.sendOrderMessage(msg);
        return Result.ok(msg.getOrderNo());   // 异步下单：消息发出即返回「处理中」
    }

    /** 毒消息测试入口：金额故意传 -1，观察它重试 16 次后进死信 */
    @PostMapping("/create-poison")
    public Result<String> createPoison(@RequestParam Long userId) {
        OrderMessage msg = new OrderMessage();
        msg.setOrderNo("POISON" + System.currentTimeMillis());
        msg.setUserId(userId);
        msg.setTotalAmount(new BigDecimal("-1"));
        orderMqProducer.sendOrderMessage(msg);
        return Result.ok(msg.getOrderNo());
    }

    /** 幂等验证入口：同一个 orderNo 发两条消息，模拟「重发/重投」导致的重复消费 */
    @PostMapping("/create-dup")
    public Result<String> createDuplicate(@RequestParam Long userId) {
        OrderMessage msg = new OrderMessage();
        msg.setOrderNo("DUP" + System.currentTimeMillis());   // 两条消息用同一个订单号
        msg.setUserId(userId);
        msg.setTotalAmount(new BigDecimal("199.00"));
        orderMqProducer.sendOrderMessage(msg);
        orderMqProducer.sendOrderMessage(msg);   // 第二次发送 = 模拟生产端重发
        return Result.ok(msg.getOrderNo());
    }
}
```

启动验证（在 `E:\course-mall\` 根目录）：

```bash
mvn clean install -DskipTests
mvn -pl mall-order spring-boot:run
```

**验证 1 · 正常下单 + 幂等**：先发正常订单，再调 `create-dup` 模拟「同一条消息被发了两次」。

```bash
# 正常下单
curl -X POST "http://localhost:8083/api/order/create?userId=1&courseId=1&amount=199.00"

# 幂等验证：同一个 orderNo 连发两条消息（模拟生产端重发/消费端重投）
curl -X POST "http://localhost:8083/api/order/create-dup?userId=1"
```

预期结果：`orders` 表里 `DUP` 开头那条订单号**只有一行**；控制台日志先出现「订单创建成功」，紧接着出现「重复消息，幂等跳过」——第二条消息被唯一索引挡下，没有重复落库。

**验证 2 · 毒消息进死信**：调毒消息接口，观察 `mall-order` 控制台日志——消息会按 `10s → 30s → 1m ...` 的间隔反复重试，16 次后进入 `%DLQ%order-consumer-group`，由 `OrderDeadLetterConsumer` 打印出「死信消息待人工处理」。这一过程最长要等几十分钟，可以先观察前几次重试日志确认行为正确即可。

```bash
curl -X POST "http://localhost:8083/api/order/create-poison?userId=1"
```

**验证 3 · 消息不丢失**：停掉 MySQL（或临时把消费者写库的 datasource 指向错误端口）再下单，消费者会因为 `insert` 抛异常而不断 `RECONSUME_LATER` 重试，消息不会丢；恢复 MySQL 后消息被重新消费成功落库。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| 幂等、至少一次投递、重复消费、死信队列、刷盘/主从复制 | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| 消息不丢失三端兜底、最终一致性 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| `uk_order_no` 唯一索引防重（数据库层约束） | [MySQL](/learn_database/MySQL) |
| Redis `setnx` 幂等（备选方案） | [Redis](/learn_database/Redis) |
| `rocketmq-spring-boot-starter` 自动装配、starter 版本兼容 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-order` 启动成功（8083），无 RocketMQ starter 版本/jakarta 报错：是 / 否
- [ ] 正常下单后 `orders` 表落库，`/api/order/create` 返回了订单号：是 / 否
- [ ] 相同 orderNo 重复消费被幂等跳过（只落一行，日志出现「重复消息，幂等跳过」）：是 / 否
- [ ] 毒消息按递增间隔重试，最终进死信队列、死信消费者打印日志：是 / 否
- [ ] 断掉 DB 后下单，消费者持续重试、消息不丢，恢复后落库成功：是 / 否
- [ ] 踩坑记录（starter 版本冲突、Broker 连不上、唯一索引没建等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. RocketMQ 为什么会出现「重复消费」？「至少一次」和「恰好一次」的差别在哪，为什么「恰好一次」只能靠消费者自己实现？
2. 用 `uk_order_no` 唯一索引做幂等，为什么比「先查再插」可靠？它在并发和宕机两个场景下分别是怎么兜住的？
3. 消费失败后 RocketMQ 会做什么？「临时性异常」和「业务性毒消息」为什么要区别对待？毒消息如果无限重试会发生什么？
4. 死信队列的名字为什么是 `%DLQ%消费者组`？它和重试队列 `%RETRY%消费者组` 是什么关系？
5. 消息不丢失为什么要「三端兜底」？「同步刷盘」和「同步复制」分别解决的是什么？为什么全同步是金融级才用、普通业务用异步？
