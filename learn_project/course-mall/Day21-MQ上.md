# Day 21 · MQ 上（事件解耦 + 顺序消息 + 事务消息）

> **今天目标**：用 RocketMQ 发布“订单已创建”领域事件，让通知、积分等非核心流程异步执行；使用事务消息保证“订单入库成功才发布事件”。

## 一、不要把所有步骤都异步化

用户下单时，必须同步得到“是否获得购买资格/是否受理”的确定结果。发通知、加积分、埋点可以异步；扣库存若改为异步，订单状态必须先是 `PROCESSING`，且要有失败补偿，不能先告诉用户“下单成功”再悄悄扣库存失败。

```text
下单主链路：校验身份 -> 校验课程 -> 库存预留 -> 订单入库
异步副作用：OrderCreatedEvent -> 通知 / 积分 / 统计
```

## 二、依赖和配置

`mall-order/pom.xml`：

```xml
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>${rocketmq-spring.version}</version>
</dependency>
```

```yaml
rocketmq:
  name-server: ${ROCKETMQ_NAME_SERVER:127.0.0.1:9876}
  producer:
    group: order-producer-group
    send-message-timeout: 3000
    retry-times-when-send-failed: 2
```

RocketMQ 仪表盘、NameServer 和 Broker 不能使用默认口令直接暴露公网。

## 三、事件契约

`mall-contract` 新增：

```java
package com.mall.contract.order;

import java.math.BigDecimal;
import java.time.LocalDateTime;

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

`eventId` 是消费幂等键，`version` 用于事件演进。不直接发 `Order` Entity：Entity 是数据库模型，事件是跨服务契约。

## 四、发送事务消息

```java
@Service
@RequiredArgsConstructor
public class OrderCommandService {
    private final RocketMQTemplate rocketMQTemplate;

    public String submit(Long userId, String requestId, CreateOrderRequest request) {
        String orderNo = OrderNumbers.next(userId);
        OrderCreateCommand command = new OrderCreateCommand(
                orderNo, userId, request.courseId(), requestId);

        Message<String> halfMessage = MessageBuilder
                .withPayload(orderNo)
                .setHeader("orderNo", orderNo)
                .build();

        rocketMQTemplate.sendMessageInTransaction(
                "order-tx-producer-group",
                "order-events:created",
                halfMessage,
                command);
        return orderNo;
    }
}
```

发送顺序：先把半消息写入 Broker，再执行本地事务；本地事务成功返回 COMMIT，Broker 才让消费者看到消息。

## 五、事务监听器

```java
@Component
@RequiredArgsConstructor
@RocketMQTransactionListener(txProducerGroup = "order-tx-producer-group")
public class OrderTransactionListener implements RocketMQLocalTransactionListener {
    private final OrderLocalTransactionService localTransactionService;
    private final OrderMapper orderMapper;

    @Override
    public RocketMQLocalTransactionState executeLocalTransaction(
            Message message, Object arg) {
        OrderCreateCommand command = (OrderCreateCommand) arg;
        try {
            localTransactionService.create(command);
            return RocketMQLocalTransactionState.COMMIT;
        } catch (BizException e) {
            return RocketMQLocalTransactionState.ROLLBACK;
        } catch (Exception e) {
            // 系统异常时结果可能不确定，让 Broker 后续回查数据库。
            return RocketMQLocalTransactionState.UNKNOWN;
        }
    }

    @Override
    public RocketMQLocalTransactionState checkLocalTransaction(Message message) {
        String orderNo = (String) message.getHeaders().get("orderNo");
        return orderMapper.existsByOrderNo(orderNo)
                ? RocketMQLocalTransactionState.COMMIT
                : RocketMQLocalTransactionState.ROLLBACK;
    }
}
```

```java
@Service
@RequiredArgsConstructor
public class OrderLocalTransactionService {
    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final CourseClient courseClient;
    private final StockClient stockClient;

    @Transactional(rollbackFor = Exception.class)
    public void create(OrderCreateCommand command) {
        // 复用 Day10/15 的幂等下单逻辑：课程快照、库存预留、订单+明细。
        // 本方法必须在独立 Spring Bean，避免 self-invocation 让 @Transactional 失效。
    }
}
```

事务回查必须查数据库中的稳定业务事实，不能查 JVM Map，因为生产者重启后内存状态会丢失。

## 六、顺序消息只保证“同一业务键”有序

```java
public void publishStatus(OrderStatusChangedEvent event) {
    Message<OrderStatusChangedEvent> message = MessageBuilder.withPayload(event).build();
    rocketMQTemplate.syncSendOrderly(
            "order-events:status-changed", message, event.orderNo());
}
```

同一 `orderNo` 用相同 hashKey 路由到同一 MessageQueue，消费端使用顺序模式。RocketMQ 不保证全 Topic 所有订单的全局顺序，也不需要这样做。

## 七、Controller 保持当前项目契约

Day10 的 `POST /api/orders` 保持 DTO + JWT 当前用户 + 幂等键：

```java
@PostMapping
@PreAuthorize("isAuthenticated()")
public Result<OrderAcceptedVO> create(
        @AuthenticationPrincipal(expression = "id") Long userId,
        @RequestHeader("Idempotency-Key")
        @NotBlank @Size(max = 64) String requestId,
        @Valid @RequestBody CreateOrderRequest request) {
    String orderNo = orderCommandService.submit(userId, requestId, request);
    return Result.ok(new OrderAcceptedVO(orderNo, "PROCESSING"));
}
```

不再提供 `/statusChange`、`/createTx` 这类公网测试接口。顺序消息用单元/集成测试验证，不让客户端任意伪造订单状态。

## 八、验收

1. 无 Token 下单是 401，空 `Idempotency-Key` 是 400。
2. 本地事务失败时，`created` 事件不会投递。
3. 本地事务成功但生产者未回传结果时，Broker 回查数据库后提交。
4. 同一 orderNo 的状态事件按顺序消费。

## 九、知识点索引

| 知识点 | 文档 |
|---|---|
| Topic / Tag / Queue / 事务消息 | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| 本地事务、代理调用 | [Spring](/learn_backend/java/基础/Spring) |
| 最终一致性 | [分布式基础](/learn_backend/java/微服务/分布式基础) |

## 十、面试追问

1. RocketMQ 事务消息的半消息、本地事务和回查如何协作？
2. 为什么回查必须查数据库？
3. 顺序消息是全局顺序还是分区顺序？
4. 哪些业务适合异步，哪些不应盲目异步？
5. 事务消息和本地 Outbox 各有什么取舍？
