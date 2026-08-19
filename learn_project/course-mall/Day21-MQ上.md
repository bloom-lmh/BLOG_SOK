# Day 21 · MQ上（异步下单 + 顺序消息 + 事务消息）

> **今天目标**：把 Day 10 的「同步下单」改造成 **RocketMQ 异步下单**——下单接口只「写订单 + 发消息」就返回，扣库存、发通知交给消费者异步做；并在同一个订单服务里跑通 **顺序消息**（同一订单的状态变更不能乱序）和 **事务消息**（写订单和发消息要最终一致）。Day 20 你在秒杀里见过 MQ 削峰，今天是 MQ 的正式三连课。

## 一、前置条件

- 已完成 **Day 10（订单服务）**：`mall-order` 模块已建好（端口 8082），`Order` / `OrderItem` / `Course` 实体、`OrderStatus` 状态机、`CourseMapper` 的原子扣减 `deductStock`、`POST /api/order/create` 都已就绪——今天**直接改造它们，不新建模块**
- 已完成 **Day 20（秒杀下）**：RocketMQ 环境已搭好并启动（NameServer 9876 + Broker），`mall-seckill` 已示范过 MQ 削峰
- 已完成 **Day 01 / Day 02**（`Result` / 全局异常、`orders` / `order_item` 表已建好，今天不另建表）
- **RocketMQ 已启动**（Day 20 步骤 1 搭的），MySQL 已启动

> ⚠️ 今天聚焦「把下单改造成异步」这一件事。真正的「消息不丢 / 幂等 / 死信」留到 **Day 22**，今天先把三板斧跑通并看懂。

## 二、先想清楚：为什么把 Day 10 的下单改造成异步？

Day 10 的下单接口是**同步链路**，四件事串行做完才返回：

```
Day 10（同步）：请求 → 查课程 → 扣库存 → 写订单+明细 → 返回
                 ↑ 用户要等全部做完，扣库存慢、写库锁竞争，接口就慢
```

今天把「必须同步做」和「可以晚点做」拆开：

```
Day 21（异步）：请求 → 查课程 → 写订单+明细（事务）→ 发 MQ 消息 → 立即返回 ✅
                                              ↓（异步，不阻塞用户）
                       消费者收到消息 → 扣库存 → 发通知
```

**为什么敢把扣库存挪出去？** 因为普通下单不像秒杀那样瞬时洪峰，但「发通知」「扣库存」这类下游操作仍会拖慢接口、还可能失败。用 MQ 解耦后：用户响应变快；下游挂了不影响下单入口，稍后重试即可（重试机制 Day 22 讲）。

::: tip 💡 面试题：MQ 解决的三个经典问题是什么？
**一句话**：**解耦**（生产者不直接依赖消费者，新增一个消费者不用改生产者代码）、**异步**（耗时操作不阻塞主流程，下单接口快速返回）、**削峰**（瞬时大流量先堆在 MQ 里，消费者按自己的节奏慢慢消费，保护下游 DB）。Day 20 的秒杀用的主要是「削峰」，今天普通下单用的是「异步 + 解耦」。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

## 三、步骤

### 步骤 0：确认 RocketMQ 已就绪（Day 20 已搭好）

Day 20 步骤 1 已经装好 RocketMQ，今天只做确认：

```bash
# 两个进程都在跑，就说明环境 OK
#   NameServer：9876（路由中心）
#   Broker：10911（真正收发消息的服务器）
curl localhost:9876          # 通 = NameServer 活着
```

> ⚠️ 如果 Broker 之前没起来，常见原因是 `bin/runbroker.cmd` 里默认堆内存 `-Xms8g` 太高，把 `-Xms` / `-Xmx` 改成 `512m` 再启动。

### 步骤 1：给 `mall-order` 引入 RocketMQ 依赖 + 配置

**1.1 打开 `E:\course-mall\mall-order\pom.xml`**，在 `<dependencies>` 里**新增**一条（其余 Day 10 的依赖不动）：

```xml
<!-- RocketMQ 的 Spring Boot 启动器：提供 RocketMQTemplate 和 @RocketMQMessageListener -->
<!-- 版本用 2.3.1（和 Day20 一致）：2.2.x 及以下用 javax.*，和 Spring Boot 3 的 jakarta.* 不兼容 -->
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>2.3.1</version>
</dependency>
```

**1.2 打开 `E:\course-mall\mall-order\src\main\resources\application.yml`**，末尾**追加**（Day 10 的 datasource / mybatis-plus 配置保持不变）：

```yaml
rocketmq:
  name-server: 127.0.0.1:9876   # NameServer 地址
  producer:
    group: order-producer-group # 生产者组（普通消息用）
    send-message-timeout: 3000  # 发送超时 3 秒
```

### 步骤 2：异步下单 —— 改造 Day 10 的 `OrderService`

**2.1 新建消息体** `E:\course-mall\mall-order\src\main\java\com\mall\order\mq\OrderMessage.java`：

```java
package com.mall.order.mq;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;

// 消息体要能序列化（starter 默认用 Jackson 转 JSON 传输，和 Day20 的 SeckillMessage 同理）。
// @NoArgsConstructor 必须有：Jackson 反序列化需要无参构造器
@Data
@NoArgsConstructor
@AllArgsConstructor
public class OrderMessage implements Serializable {
    private String orderNo;        // 订单号
    private Long userId;           // 下单用户
    private Long courseId;         // 课程（消费者扣库存用）
    private String courseTitle;    // 课程标题（发通知用）
    private BigDecimal price;      // 金额
}
```

**2.2 改造 `OrderService.createOrder`**（`com/mall/order/service/OrderService.java`）。Day 10 的原方法是「查课程 → 扣库存 → 写订单+明细」，今天**改两处**：删掉「扣库存」，在最后加「发消息」。注入 `RocketMQTemplate` 后，方法变成：

```java
// 字段区新增：
private final RocketMQTemplate rocketMQTemplate;

/**
 * 异步下单（Day21 改造版）：只做「查课程 → 写订单+明细 → 发消息」，立刻返回；
 * 扣库存、发通知挪到消费者里异步做（步骤 3 的 OrderCreateListener）。
 */
@Transactional(rollbackFor = Exception.class)
public Order createOrder(CreateOrderRequest request) {
    // 1. 查课程（价格/标题必须从 DB 取，绝不能信任前端传值——Day10 强调过）
    Course course = courseMapper.selectById(request.getCourseId());
    if (course == null) {
        throw new BizException(ErrorCode.NOT_FOUND.getCode(), "课程不存在");
    }
    if (course.getStatus() == null || course.getStatus() != 1) {
        throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "课程已下架，无法购买");
    }

    // 2.【改动1】Day10 这里的「扣库存」删掉了——挪到消费者里异步做

    // 3. 生成订单号 + 写订单主表 + 明细快照（Day10 逻辑不变，@Transactional 保证原子）
    String orderNo = generateOrderNo(request.getUserId());
    Order order = new Order();
    order.setOrderNo(orderNo);
    order.setUserId(request.getUserId());
    order.setTotalAmount(course.getPrice());
    order.setStatus(OrderStatus.PENDING_PAYMENT.getCode());
    orderMapper.insert(order);

    OrderItem item = new OrderItem();
    item.setOrderId(order.getId());
    item.setCourseId(course.getId());
    item.setCourseTitle(course.getTitle());
    item.setCourseCover(course.getCover());
    item.setPrice(course.getPrice());
    orderItemMapper.insert(item);

    // 4.【改动2】发消息（syncSend：同步等 Broker 确认 SEND_OK 才返回，可靠）。
    //    destination 格式 "topic:tag"；下游慢操作由消费者异步执行，所以接口能快速返回
    rocketMQTemplate.syncSend("order-topic:orderCreate",
            new OrderMessage(orderNo, request.getUserId(), course.getId(),
                    course.getTitle(), course.getPrice()));

    log.info("下单成功并已发消息 orderNo={}", orderNo);
    return order;
}
```

> ⚠️ **注意这里有个隐患**：消息是在 `@Transactional` 方法里发的，此时事务**还没提交**。极端情况下消费者先收到消息、去查订单却发现不存在。这就是「本地事务」和「发消息」不一致的问题——**步骤 5 的事务消息正是为它而来**。先记住这个坑，往下看。

::: tip 💡 面试题：`RocketMQTemplate` 的三种发送方式怎么选？「异步下单」该用哪种？
**一句话**：`syncSend`（同步，等 Broker 确认，最可靠）、`asyncSend`（异步，回调拿结果，不阻塞当前线程）、`sendOneway`（单向，发完就走，吞吐最高但可能丢）。下单是**核心交易**，消息不能丢，所以用 `syncSend`；`sendOneway` 只适合日志这类丢得起的数据。注意「异步下单」的异步是指**下游处理异步**，和发送方式是两个概念。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

::: tip 💡 面试题：消息的 Topic / Tag / Queue 分别是什么？
**一句话**：**Topic** 是消息的一级分类（如 `order-topic`）；**Tag** 是 Topic 内的二级标签（如 `orderCreate`/`orderStatus`），消费者按它过滤；**Queue** 是 Topic 底下的物理队列（默认一个 Topic 分 4 个），消息最终落在某个 Queue 上被并发消费。`syncSend("order-topic:orderCreate", ...)` 里冒号前是 Topic、冒号后是 Tag。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

### 步骤 3：消费者 —— 扣库存 + 发通知

消息发出去后，谁来扣库存？消费者。它和生产者同在一个服务里，但以独立线程异步执行。

新建 `E:\course-mall\mall-order\src\main\java\com\mall\order\mq\OrderCreateListener.java`：

```java
package com.mall.order.mq;

import com.mall.order.mapper.CourseMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
// 订阅 order-topic 下 orderCreate 这个 Tag；
// 同一 consumerGroup 内的多个消费者「均分」消息，一条消息只被组内一个消费者消费（集群模式）
@RocketMQMessageListener(topic = "order-topic",
        consumerGroup = "order-create-consumer-group",
        selectorExpression = "orderCreate")
public class OrderCreateListener implements RocketMQListener<OrderMessage> {

    private final CourseMapper courseMapper;   // Day10 写好的原子扣减 SQL，直接复用

    @Override
    public void onMessage(OrderMessage msg) {
        log.info("异步处理订单 {}：扣库存 + 发通知", msg.getOrderNo());

        // 1. 扣库存：Day10 的原子 UPDATE ... WHERE stock > 0，防超卖
        int rows = courseMapper.deductStock(msg.getCourseId());
        if (rows == 0) {
            // 正常下单前已查过库存，这里一般不会发生；真发生了说明库存被并发抢光，
            // 应走补偿（取消订单），Day23 Seata 展开讲
            log.error("订单 {} 扣库存失败，需要补偿", msg.getOrderNo());
            return;
        }

        // 2. 发通知（短信/站内信，这里用日志模拟）
        log.info("订单 {} 扣库存成功，已通知用户 {}", msg.getOrderNo(), msg.getUserId());
    }
}
```

**验证「异步」生效**：启动后调一次下单接口，你会发现响应几乎立刻返回，而「扣库存 + 发通知」的日志是**随后**才打印的——两个动作不在同一个请求线程里了。

### 步骤 4：顺序消息 —— 同一订单的状态变更不能乱序

异步下单有个隐藏问题：**一个订单的状态有先后顺序**（0 创建 → 1 已支付 → 2 已取消……）。如果状态变更消息乱序到达，就可能出现「先标记已取消、后标记已支付」的脏数据。

**RocketMQ 只保证「单个 Queue 内有序」**，所以顺序消息就两句话：

1. **生产端**：把同一个订单的消息发到**同一个 Queue**（按 `orderNo` 路由）。
2. **消费端**：这个 Queue 用**顺序消费模式**，同一时刻只有一个线程串行消费。

**4.1 给 `OrderService` 加一个发顺序消息的方法**：

```java
// 接在 OrderService 里。订单状态流转（创建→支付→取消）必须按顺序被消费
public void notifyStatusChange(String orderNo, int status) {
    // syncSendOrderly 第三个参数 hashKey：内部用 orderNo.hashCode() % queueNum
    // 把消息固定路由到某个 Queue，同一个订单的多次状态变更永远进同一个 Queue，顺序就保住了
    rocketMQTemplate.syncSendOrderly(
            "order-topic:orderStatus",              // destination
            "订单 " + orderNo + " 状态 -> " + status, // 消息体
            orderNo);                                // hashKey：按订单号分队列
    log.info("已发送顺序消息：订单 {} 状态 {}", orderNo, status);
}
```

**4.2 顺序消费者** `E:\course-mall\mall-order\src\main\java\com\mall\order\mq\OrderStatusListener.java`：

```java
package com.mall.order.mq;

import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.ConsumeMode;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
// consumeMode = ConsumeMode.ORDERLY：顺序消费模式（关键！默认 CONCURRENTLY 是并发消费）。
// 顺序模式下，同一个 Queue 的消息被加锁串行处理，保证按发送顺序消费
@RocketMQMessageListener(topic = "order-topic",
        consumerGroup = "order-status-consumer-group",
        selectorExpression = "orderStatus",
        consumeMode = ConsumeMode.ORDERLY)
public class OrderStatusListener implements RocketMQListener<String> {

    @Override
    public void onMessage(String msg) {
        // 顺序执行：同一订单的「创建→支付→取消」会严格按照发送顺序进来
        log.info("顺序消费：{}", msg);
    }
}
```

::: tip 💡 面试题：RocketMQ 怎么保证消息顺序？代价是什么？
**一句话**：生产端用 `MessageQueueSelector`（Spring 里是 `syncSendOrderly` 的 hashKey）把**同一个业务键**的消息路由到**同一个 Queue**，消费端用 `MessageListenerOrderly`（Spring 里是 `consumeMode = ORDERLY`）对**单个 Queue 串行消费**。代价是**牺牲并发**——一个 Queue 同时只有一个线程消费，消费慢了整条队列都堵，所以只给订单状态流转、binlog 这类真正需要有序的业务用。注意这是「同一订单」级别的**局部顺序**，全局有序只能单队列，吞吐骤降，生产基本不用。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

### 步骤 5：事务消息 —— 「写订单」和「发消息」要最终一致

回看步骤 2 结尾提到的隐患：**「写订单表」和「发消息」不是原子的**。可能出现：

- 订单表写成功，但发消息失败 → 消费者永远不知道，订单「孤儿」了；
- 消息发出去了，但订单表写失败（事务回滚）→ 消费者处理了一个不存在的订单。

RocketMQ 用**事务消息（半消息 + 回查）**解决：先发一条「半消息」占位（**不投递给消费者**），执行本地事务，成功就提交半消息（转正投递）、失败就回滚（删除）；如果一直没收到提交/回滚（比如进程挂了），**Broker 会回查**生产者确认本地事务到底成没成。

**5.1 本地事务单独放一个 Bean**（这里有个坑，见下面注释）`E:\course-mall\mall-order\src\main\java\com\mall\order\service\OrderTxLocalService.java`：

```java
package com.mall.order.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.order.entity.Order;
import com.mall.order.entity.OrderItem;
import com.mall.order.enums.OrderStatus;
import com.mall.order.mapper.OrderItemMapper;
import com.mall.order.mapper.OrderMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

@Slf4j
@Service
@RequiredArgsConstructor
// 为什么单独一个 Bean，而不是在 OrderTransactionListener 里直接调 mapper？
// 事务监听器是在 RocketMQ 的线程池里执行的，如果它「自己调自己类的方法」，
// 会绕过 Spring 的 @Transactional 代理，事务失效（Day10 追问5 讲过的 self-invocation）。
// 调另一个 Bean 的方法，走的是代理，事务才生效。
public class OrderTxLocalService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;

    /** 事务消息里的「本地事务」：写订单主表 + 明细，全成或全回滚 */
    @Transactional(rollbackFor = Exception.class)
    public void writeOrderAndItem(String orderNo, Long userId, Long courseId,
                                  String courseTitle, BigDecimal price) {
        Order order = new Order();
        order.setOrderNo(orderNo);
        order.setUserId(userId);
        order.setTotalAmount(price);
        order.setStatus(OrderStatus.PENDING_PAYMENT.getCode());
        orderMapper.insert(order);

        OrderItem item = new OrderItem();
        item.setOrderId(order.getId());
        item.setCourseId(courseId);
        item.setCourseTitle(courseTitle);
        item.setPrice(price);
        orderItemMapper.insert(item);
        log.info("本地事务完成：订单 {} 已写入", orderNo);
    }

    /** 回查用：按订单号确认订单到底写没写成功（以 DB 为准，不能凭内存猜） */
    public boolean existsByOrderNo(String orderNo) {
        return orderMapper.selectOne(
                new LambdaQueryWrapper<Order>().eq(Order::getOrderNo, orderNo)) != null;
    }
}
```

**5.2 事务监听器** `E:\course-mall\mall-order\src\main\java\com\mall\order\mq\OrderTransactionListener.java`：

```java
package com.mall.order.mq;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.order.dto.CreateOrderRequest;
import com.mall.order.entity.Course;
import com.mall.order.mapper.CourseMapper;
import com.mall.order.service.OrderTxLocalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQTransactionListener;
import org.apache.rocketmq.spring.core.RocketMQLocalTransactionListener;
import org.apache.rocketmq.spring.core.RocketMQLocalTransactionState;
import org.springframework.messaging.Message;

@Slf4j
// txProducerGroup：事务消息的生产者组，发送事务消息时要和 sendMessageInTransaction 的组对上
@RocketMQTransactionListener(txProducerGroup = "order-tx-producer-group")
@RequiredArgsConstructor
public class OrderTransactionListener implements RocketMQLocalTransactionListener {

    private final OrderTxLocalService orderTxLocalService;
    private final CourseMapper courseMapper;   // 查课程快照数据

    // 半消息发送成功后，Broker 回调这里「执行本地事务」
    @Override
    public RocketMQLocalTransactionState executeLocalTransaction(Message msg, Object arg) {
        String orderNo = (String) msg.getHeaders().get("orderNo");
        CreateOrderRequest request = (CreateOrderRequest) arg;
        try {
            // 和步骤 2 一样，价格/标题从 DB 取，不信任前端
            Course course = courseMapper.selectById(request.getCourseId());
            if (course == null) {
                throw new BizException(ErrorCode.NOT_FOUND.getCode(), "课程不存在");
            }
            orderTxLocalService.writeOrderAndItem(orderNo, request.getUserId(),
                    course.getId(), course.getTitle(), course.getPrice());
            return RocketMQLocalTransactionState.COMMIT;   // 成功 → 半消息转正、投递给消费者
        } catch (Exception e) {
            log.error("本地事务失败，回滚半消息", e);
            return RocketMQLocalTransactionState.ROLLBACK; // 失败 → 删除半消息，不投递
        }
    }

    // Broker 回查：半消息一直没收到 COMMIT/ROLLBACK（如进程执行到一半挂了），
    // Broker 定时回调这里，根据业务键查本地事务的真实状态，决定提交还是回滚
    @Override
    public RocketMQLocalTransactionState checkLocalTransaction(Message msg) {
        String orderNo = (String) msg.getHeaders().get("orderNo");
        boolean exists = orderTxLocalService.existsByOrderNo(orderNo);
        log.info("Broker 回查订单 {} 是否存在：{}", orderNo, exists);
        return exists ? RocketMQLocalTransactionState.COMMIT
                      : RocketMQLocalTransactionState.ROLLBACK;
    }
}
```

> 上面的实现里，本地事务失败（课程不存在 / 写库异常）都会走 `ROLLBACK`，半消息被删除，消费者收不到——这就是「订单写失败时消息也不投递」的保证。

**5.3 发事务消息**（接在 `OrderService` 里）：

```java
// 接在 OrderService 里
public void createOrderByTx(CreateOrderRequest request) {
    // 课程校验放在事务监听器的 executeLocalTransaction 里做（查课程 → 写订单+明细）
    String orderNo = generateOrderNo(request.getUserId());

    // 用 MessageBuilder 构造消息，把 orderNo 塞进消息头，事务监听器和回查都靠它定位业务
    org.springframework.messaging.Message<String> msg =
            org.springframework.messaging.support.MessageBuilder
                    .withPayload("订单 " + orderNo)
                    .setHeader("orderNo", orderNo)
                    .build();

    // 发送事务消息：先发半消息 → Broker 回调 executeLocalTransaction 执行本地事务
    // → COMMIT 转正 / ROLLBACK 删除。arg 会把下单请求带给监听器
    rocketMQTemplate.sendMessageInTransaction(
            "order-tx-producer-group",   // 要和 @RocketMQTransactionListener 的组对上
            "order-topic:orderTx",       // destination
            msg,                         // 消息
            request);                    // arg → executeLocalTransaction 的第二个参数
    log.info("事务消息已发送：订单 {}", orderNo);
}
```

**5.4 事务消息消费者**（普通并发消费即可）`E:\course-mall\mall-order\src\main\java\com\mall\order\mq\OrderTxListener.java`：

```java
package com.mall.order.mq;

import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RocketMQMessageListener(topic = "order-topic",
        consumerGroup = "order-tx-consumer-group",
        selectorExpression = "orderTx")
public class OrderTxListener implements RocketMQListener<String> {

    @Override
    public void onMessage(String msg) {
        // 只有「半消息被 COMMIT 转正」后，这里才会收到消息
        log.info("收到事务消息（已提交）：{}", msg);
    }
}
```

> 说明：这个消费者只演示「事务消息投递链路」，没做扣库存——把步骤 3 里 `courseMapper.deductStock(...)` 的写法搬进来即可，和「幂等」一起留到 Day 22 做。

::: tip 💡 面试题：为什么需要「半消息」？事务消息的核心流程是什么？
**一句话**：因为「本地事务」和「发消息」无法天然原子，所以 RocketMQ 让消息**先以半消息占位、不投递给消费者**，等本地事务结果：成功则提交（转正投递）、失败则回滚（删除）；若一直没结果，Broker **回查**生产者确认。半消息就是「先不下发、把决定权交给本地事务结果」的占位消息。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

::: tip 💡 面试题：事务消息的「回查」由谁发起？查什么？
**一句话**：由 **Broker** 发起——半消息发出后若一段时间（默认约 60 秒）没收到 COMMIT/ROLLBACK，Broker 就回调生产者的 `checkLocalTransaction`。回查**必须查数据库/本地事务的真实结果**（订单到底写没写），绝不能凭内存或瞎猜，否则进程重启后状态就丢了。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

### 步骤 6：Controller 加两个触发接口 + 启动验证

给 Day 10 的 `OrderController` **追加**两个接口（`/create` 和 `/cancel` 保持不变）：

> ⚠️ 记得补 import：`org.springframework.web.bind.annotation.RequestParam`（Day 10 的 OrderController 里还没有它）。

```java
// 接在 OrderController 里
// 触发顺序消息：同一订单连续调 3 次 status=0/1/2，观察消费者按顺序打印
@PostMapping("/statusChange")
public Result<Void> statusChange(@RequestParam String orderNo, @RequestParam int status) {
    orderService.notifyStatusChange(orderNo, status);
    return Result.ok();
}

// 触发事务消息：观察「半消息 → 本地事务 COMMIT → 消费者收到」完整链路
@PostMapping("/createTx")
public Result<Void> createTx(@RequestBody CreateOrderRequest request) {
    orderService.createOrderByTx(request);
    return Result.ok();
}
```

启动与验证（在 `E:\course-mall\` 根目录）：

```bash
mvn clean install -DskipTests
mvn -pl mall-order spring-boot:run      # 8082（Day10 端口）
```

```bash
# 先确认课程 1 有库存（Day11 测试可能扣过）
#   UPDATE course SET stock = 100 WHERE id = 1;

# 验证 1：异步下单 —— 响应立即返回，扣库存日志随后才打
curl -X POST http://localhost:8082/api/order/create \
  -H "Content-Type: application/json" -d "{\"userId\":1,\"courseId\":1}"
# 查库：orders 新增一行；几秒后 course.stock 减 1（消费者扣的）

# 验证 2：顺序消息 —— 同一订单 status 依次 0→1→2，消费者必须按 0→1→2 顺序打印
curl -X POST "http://localhost:8082/api/order/statusChange?orderNo=TEST001&status=0"
curl -X POST "http://localhost:8082/api/order/statusChange?orderNo=TEST001&status=1"
curl -X POST "http://localhost:8082/api/order/statusChange?orderNo=TEST001&status=2"

# 验证 3：事务消息 —— 观察「执行本地事务 → COMMIT → OrderTxListener 收到消息」
curl -X POST http://localhost:8082/api/order/createTx \
  -H "Content-Type: application/json" -d "{\"userId\":1,\"courseId\":2}"
```

预期：验证 3 里 `OrderTransactionListener` 打印 `本地事务完成`，随后 `OrderTxListener` 打印 `收到事务消息（已提交）`。把 `writeOrderAndItem` 临时改成抛异常再试一次，`OrderTxListener` 就收不到消息——这就是半消息的意义。

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| RocketMQ 消息模型（Topic/Queue/Tag）、三种发送方式 | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| 顺序消息（hashKey 路由 + 顺序消费） | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| 事务消息（半消息 + 回查） | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| MQ 解耦 / 异步 / 削峰、最终一致 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| `@Transactional` 本地事务、self-invocation 失效 | [Spring](/learn_backend/java/基础/Spring) |
| MyBatis-Plus `BaseMapper`、`LambdaQueryWrapper` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| Spring Boot 3 依赖版本对齐（starter 2.3.x） | [Spring Boot](/learn_backend/java/基础/Spring Boot) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] RocketMQ 的 NameServer（9876）+ Broker（10911）都启动成功：是 / 否
- [ ] `mall-order`（8082）启动成功，无 starter 版本不兼容 / 找不到 Bean 报错：是 / 否
- [ ] 异步下单：`/api/order/create` 立即返回，订单入库，`course.stock` 随后被消费者扣减：是 / 否
- [ ] 顺序消息：同一订单 3 条状态消息按 0→1→2 顺序被消费：是 / 否
- [ ] 事务消息：本地事务 COMMIT 时消费者收到消息，改抛异常（ROLLBACK）后收不到：是 / 否
- [ ] 踩坑记录（Broker 内存 OOM、依赖版本不对、消息没被消费等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 「异步下单」到底「异步」在哪一步？下单接口为什么能变快？如果消费者挂了，用户能正常下单吗？（提示：解耦与可用性的关系，订单会成为「待处理」）
2. 步骤 2 里消息是在 `@Transactional` 方法里发的，为什么说这是个隐患？什么场景下消费者会拿到「查无此订单」的消息？
3. RocketMQ 为什么只保证「单队列有序」？顺序消息要满足哪两个条件（生产端 + 消费端各做什么）？它牺牲了什么？
4. 事务消息的「半消息」解决什么问题？如果没有「回查」兜底，进程在「发完半消息、还没执行本地事务」时挂了会怎样？
5. 异步下单里，消费者「扣库存」如果消息被重复投递（消费两次）会怎样？为什么说「消息不丢」和「幂等」是 MQ 的两个核心难题？（提示：为 Day 22 铺路）
