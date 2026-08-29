# Day 21 · MQ 上（事务消息 + 顺序消息）

> **今天目标**：订单服务使用 RocketMQ 事务消息，使“本地订单创建成功”与
> “订单已创建事件可见”保持一致；再用 `orderNo` 作为队列选择键发送顺序消息。

本日项目根目录统一为 `E:\CourseMall`。下面使用
`rocketmq-spring-boot-starter 2.3.1` 的 API：事务消息调用
`sendMessageInTransaction(destination, message, arg)`；
`@RocketMQTransactionListener` 不再配置已经移除的 `txProducerGroup` 属性。

## 一、先划清异步边界

```text
同步准备：身份校验 -> 查询课程快照
事务消息：发送 half message -> 执行本地订单事务 -> COMMIT/ROLLBACK
异步副作用：订单事件 -> 通知 / 积分 / 统计
```

课程查询失败时不能发送消息。通知、积分等非核心副作用适合异步；是否获得下单资格、
库存是否预留成功必须形成明确状态，不能先返回“成功”再静默失败。

::: warning Day21 仍没有解决所有分布式事务
本地事务只能覆盖订单库，不能自动回滚远程库存服务。这里依赖 Day15 的库存
`requestId` 幂等和失败回补；Day23 再用 Seata 演示强一致方案。
:::

## 二、依赖与配置

在 `E:\CourseMall\mall-order\pom.xml` 中加入：

```xml
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>2.3.1</version>
</dependency>
```

在 `E:\CourseMall\mall-order\src\main\resources\application.yml` 中加入：

```yaml
rocketmq:
  name-server: ${ROCKETMQ_NAME_SERVER:127.0.0.1:9876}
  producer:
    group: order-producer-group
    send-message-timeout: 3000
    retry-times-when-send-failed: 2
```

RocketMQ 的 NameServer 和 Broker 不能使用无鉴权配置暴露到公网。

## 三、跨服务事件与模块内命令

新建
`E:\CourseMall\mall-contract\src\main\java\com\mall\contract\order\OrderCreatedEvent.java`：

```java
package com.mall.contract.order;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 订单创建成功后对外发布的稳定事件契约。 */
public record OrderCreatedEvent(
        String eventId,
        String orderNo,
        Long userId,
        Long courseId,
        BigDecimal amount,
        LocalDateTime occurredAt,
        int version) {
}
```

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\command\OrderCreateCommand.java`：

```java
package com.mall.order.command;

import com.mall.contract.course.CourseSnapshotDTO;

/** RocketMQ 回调执行本地订单事务所需的数据。 */
public record OrderCreateCommand(
        String eventId,
        String orderNo,
        Long userId,
        String requestId,
        CourseSnapshotDTO course) {
}
```

事件是跨服务契约，放 `mall-contract`；Command 只服务订单模块内部，不应暴露给消费者。

## 四、订单号生成器和受理响应

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\support\OrderNumbers.java`：

```java
package com.mall.order.support;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/** 本阶段的订单号生成器；Day24 分表主键仍使用 ASSIGN_ID。 */
public final class OrderNumbers {

    private static final DateTimeFormatter FORMATTER =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");
    private static final SecureRandom RANDOM = new SecureRandom();

    private OrderNumbers() {
    }

    public static String next(Long userId) {
        int suffix = RANDOM.nextInt(900_000) + 100_000;
        return "CM" + LocalDateTime.now().format(FORMATTER)
                + userId + suffix;
    }
}
```

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\vo\OrderAcceptedVO.java`：

```java
package com.mall.order.vo;

/** 异步下单受理响应，不代表订单最终支付成功。 */
public record OrderAcceptedVO(String orderNo, String status) {
}
```

订单号仍由数据库唯一索引兜底；受理状态使用 `PROCESSING`，不能返回误导性的
“下单成功”。

## 五、订单事务 Mapper

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\mapper\OrderCommandMapper.java`：

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.order.entity.Order;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/** 事务消息下单流程使用的订单 Mapper。 */
public interface OrderCommandMapper extends BaseMapper<Order> {

    @Select("""
            SELECT * FROM orders
            WHERE user_id = #{userId}
              AND request_id = #{requestId}
              AND deleted_at IS NULL
            LIMIT 1
            """)
    Order selectByRequestId(
            @Param("userId") Long userId,
            @Param("requestId") String requestId);

    @Select("""
            SELECT COUNT(*) FROM orders
            WHERE order_no = #{orderNo} AND deleted_at IS NULL
            """)
    boolean existsByOrderNo(@Param("orderNo") String orderNo);

    @Insert("""
            INSERT IGNORE INTO orders
                (order_no, request_id, user_id, total_amount, status, create_time)
            VALUES
                (#{orderNo}, #{requestId}, #{userId}, #{totalAmount}, #{status}, #{createTime})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertIgnore(Order order);
}
```

`(user_id, request_id)` 和 `order_no` 必须已有唯一索引。应用层预查用于快速返回，
数据库唯一索引才是并发下的最终保证。

## 六、本地事务完整实现

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\service\OrderLocalTransactionService.java`：

```java
package com.mall.order.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.contract.stock.StockChangeRequest;
import com.mall.order.client.StockClient;
import com.mall.order.command.OrderCreateCommand;
import com.mall.order.entity.Order;
import com.mall.order.entity.OrderItem;
import com.mall.order.enums.OrderStatus;
import com.mall.order.mapper.OrderCommandMapper;
import com.mall.order.mapper.OrderItemMapper;
import com.mall.order.support.RemoteResult;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** RocketMQ 事务回调中的本地订单事务。 */
@Service
@RequiredArgsConstructor
public class OrderLocalTransactionService {

    private final OrderCommandMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final StockClient stockClient;

    @Transactional(rollbackFor = Exception.class)
    public void create(OrderCreateCommand command) {
        Order replay = orderMapper.selectByRequestId(
                command.userId(), command.requestId());
        if (replay != null) {
            return;
        }

        String deductRequestId = "deduct:" + command.requestId();
        RemoteResult.unwrap(stockClient.deduct(new StockChangeRequest(
                command.course().id(), 1, deductRequestId)));

        try {
            Order order = new Order();
            order.setOrderNo(command.orderNo());
            order.setRequestId(command.requestId());
            order.setUserId(command.userId());
            order.setTotalAmount(command.course().price());
            order.setStatus(OrderStatus.PENDING_PAYMENT.getCode());
            order.setCreateTime(LocalDateTime.now());

            if (orderMapper.insertIgnore(order) == 0) {
                // 并发回调使用相同库存幂等键，不会重复扣减。
                return;
            }

            OrderItem item = new OrderItem();
            item.setOrderId(order.getId());
            item.setCourseId(command.course().id());
            item.setCourseTitle(command.course().title());
            item.setCourseCover(command.course().cover());
            item.setPrice(command.course().price());
            item.setCreateTime(LocalDateTime.now());
            orderItemMapper.insert(item);
        } catch (RuntimeException ex) {
            // 过渡方案：本地订单失败时调用幂等回补。Day23 再改为 Seata。
            stockClient.restore(new StockChangeRequest(
                    command.course().id(),
                    1,
                    "restore:" + command.requestId()));
            throw new BizException(ErrorCode.OPERATION_FAILED);
        }
    }
}
```

`OrderLocalTransactionService` 必须是独立 Spring Bean。若把方法写成同一个类里的
`this.create()`，会绕过 Spring 事务代理，`@Transactional` 不生效。

## 七、发送事务消息

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\service\OrderCommandService.java`：

```java
package com.mall.order.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.contract.course.CourseSnapshotDTO;
import com.mall.contract.order.OrderCreatedEvent;
import com.mall.order.client.CourseClient;
import com.mall.order.command.OrderCreateCommand;
import com.mall.order.dto.CreateOrderRequest;
import com.mall.order.support.OrderNumbers;
import com.mall.order.support.RemoteResult;
import lombok.RequiredArgsConstructor;
import org.apache.rocketmq.client.producer.LocalTransactionState;
import org.apache.rocketmq.client.producer.TransactionSendResult;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

/** 异步下单命令入口。 */
@Service
@RequiredArgsConstructor
public class OrderCommandService {

    private static final String DESTINATION = "order-events:created";

    private final RocketMQTemplate rocketMQTemplate;
    private final CourseClient courseClient;

    public String submit(
            Long userId,
            String requestId,
            CreateOrderRequest request) {
        CourseSnapshotDTO course = RemoteResult.unwrap(
                courseClient.getSnapshot(request.getCourseId()));
        if (!Integer.valueOf(1).equals(course.status())) {
            throw new BizException(ErrorCode.COURSE_OFFLINE);
        }

        String eventId = UUID.randomUUID().toString();
        String orderNo = OrderNumbers.next(userId);
        OrderCreateCommand command = new OrderCreateCommand(
                eventId, orderNo, userId, requestId, course);
        OrderCreatedEvent event = new OrderCreatedEvent(
                eventId,
                orderNo,
                userId,
                course.id(),
                course.price(),
                LocalDateTime.now(),
                1);

        Message<OrderCreatedEvent> message = MessageBuilder
                .withPayload(event)
                .setHeader("orderNo", orderNo)
                .build();

        TransactionSendResult result = rocketMQTemplate
                .sendMessageInTransaction(DESTINATION, message, command);
        if (result == null
                || result.getLocalTransactionState()
                == LocalTransactionState.ROLLBACK_MESSAGE) {
            throw new BizException(ErrorCode.OPERATION_FAILED);
        }
        return orderNo;
    }
}
```

发送顺序是：Broker 保存 half message → 回调本地事务 → 返回 COMMIT 后消息才对消费者
可见。系统异常返回 UNKNOWN 时，Broker 会回查稳定的数据库事实。

## 八、事务监听器

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\mq\OrderTransactionListener.java`：

```java
package com.mall.order.mq;

import com.mall.common.exception.BizException;
import com.mall.order.command.OrderCreateCommand;
import com.mall.order.mapper.OrderCommandMapper;
import com.mall.order.service.OrderLocalTransactionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQTransactionListener;
import org.apache.rocketmq.spring.core.RocketMQLocalTransactionListener;
import org.apache.rocketmq.spring.core.RocketMQLocalTransactionState;
import org.springframework.messaging.Message;

/** 订单事务消息的本地事务执行器与回查器。 */
@Slf4j
@RequiredArgsConstructor
@RocketMQTransactionListener
public class OrderTransactionListener
        implements RocketMQLocalTransactionListener {

    private final OrderLocalTransactionService localTransactionService;
    private final OrderCommandMapper orderMapper;

    @Override
    public RocketMQLocalTransactionState executeLocalTransaction(
            Message message,
            Object arg) {
        OrderCreateCommand command = (OrderCreateCommand) arg;
        try {
            localTransactionService.create(command);
            return RocketMQLocalTransactionState.COMMIT;
        } catch (BizException ex) {
            log.warn("订单本地事务回滚 orderNo={}, key={}",
                    command.orderNo(), ex.getMessage());
            return RocketMQLocalTransactionState.ROLLBACK;
        } catch (Exception ex) {
            log.error("订单本地事务状态未知 orderNo={}", command.orderNo(), ex);
            return RocketMQLocalTransactionState.UNKNOWN;
        }
    }

    @Override
    public RocketMQLocalTransactionState checkLocalTransaction(Message message) {
        Object header = message.getHeaders().get("orderNo");
        if (header == null) {
            return RocketMQLocalTransactionState.ROLLBACK;
        }
        return orderMapper.existsByOrderNo(header.toString())
                ? RocketMQLocalTransactionState.COMMIT
                : RocketMQLocalTransactionState.ROLLBACK;
    }
}
```

回查必须查询数据库，不能查询 JVM `Map`：生产者重启后内存状态会丢失。

## 九、顺序消息

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\mq\OrderStatusPublisher.java`：

```java
package com.mall.order.mq;

import com.mall.contract.order.OrderStatusChangedEvent;
import lombok.RequiredArgsConstructor;
import org.apache.rocketmq.client.producer.SendResult;
import org.apache.rocketmq.client.producer.SendStatus;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;

/** 订单状态顺序消息发布器。 */
@Component
@RequiredArgsConstructor
public class OrderStatusPublisher {

    private final RocketMQTemplate rocketMQTemplate;

    public boolean publish(OrderStatusChangedEvent event) {
        Message<OrderStatusChangedEvent> message = MessageBuilder
                .withPayload(event)
                .build();
        SendResult result = rocketMQTemplate.syncSendOrderly(
                "order-events:status-changed",
                message,
                event.orderNo());
        return result != null && result.getSendStatus() == SendStatus.SEND_OK;
    }
}
```

新建事件契约
`E:\CourseMall\mall-contract\src\main\java\com\mall\contract\order\OrderStatusChangedEvent.java`：

```java
package com.mall.contract.order;

import java.time.LocalDateTime;

/** 订单状态变化事件。 */
public record OrderStatusChangedEvent(
        String eventId,
        String orderNo,
        Integer fromStatus,
        Integer toStatus,
        LocalDateTime occurredAt,
        int version) {
}
```

同一 `orderNo` 使用相同 hashKey，消息会进入同一 MessageQueue。它保证的是同一订单的
分区顺序，不是整个 Topic 的全局顺序。

## 十、Controller

删除 Day15 `OrderController` 中旧的 `POST /api/orders` 方法，避免映射冲突；保留取消、
查询接口。新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\controller\OrderCommandController.java`：

```java
package com.mall.order.controller;

import com.mall.common.result.Result;
import com.mall.order.dto.CreateOrderRequest;
import com.mall.order.service.OrderCommandService;
import com.mall.order.vo.OrderAcceptedVO;
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

/** 异步下单接口。 */
@Validated
@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderCommandController {

    private final OrderCommandService orderCommandService;

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public Result<OrderAcceptedVO> create(
            @AuthenticationPrincipal(expression = "id") Long userId,
            @RequestHeader("Idempotency-Key")
            @NotBlank @Size(max = 64) String requestId,
            @Valid @RequestBody CreateOrderRequest request) {
        String orderNo = orderCommandService.submit(
                userId, requestId, request);
        return Result.ok(new OrderAcceptedVO(orderNo, "PROCESSING"));
    }
}
```

不要提供 `/createTx`、`/statusChange` 等公网测试接口。测试事务回滚和顺序性应该使用
集成测试或受控管理工具。

## 十一、启动与验收

1. 无 Token 下单返回 401，空 `Idempotency-Key` 返回 400。
2. 本地事务失败时，`created` 消息对消费者不可见。
3. 本地事务成功但生产者未及时返回状态时，Broker 回查数据库后提交消息。
4. 同一 `orderNo` 的状态事件使用同一队列并按发送顺序消费。
5. 重复 `Idempotency-Key` 不会重复创建订单或重复扣库存。

## 十二、知识点索引

| 知识点 | 文档 |
|---|---|
| Topic / Tag / Queue / 事务消息 | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| 本地事务、代理调用 | [Spring](/learn_backend/java/基础/Spring) |
| 最终一致性 | [分布式基础](/learn_backend/java/微服务/分布式基础) |

## 十三、✅ 完成后回填

- [ ] 所有新增 Java 类都按本文绝对路径创建
- [ ] 事务消息使用 2.3.1 的三参数发送 API
- [ ] 本地事务提交后消费者才能看到订单事件
- [ ] Broker 回查读取数据库，不依赖内存状态
- [ ] 重复幂等键不会重复订单或库存扣减
- [ ] 顺序消息按 `orderNo` 选择队列

## 十四、面试追问

1. half message、本地事务、COMMIT/ROLLBACK 和事务回查如何协作？
2. 为什么事务回查必须查数据库，而不能查本地 Map？
3. RocketMQ 事务消息能否自动回滚另一个微服务的数据库？
4. 顺序消息保证的是全局顺序还是同一队列内顺序？
5. 事务消息与本地 Outbox 各有什么取舍？

参考：[RocketMQ Spring 事务消息官方说明](https://github.com/apache/rocketmq-spring/wiki/Transactional-Message)。
