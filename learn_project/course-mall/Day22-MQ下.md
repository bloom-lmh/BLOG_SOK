# Day 22 · MQ 下（幂等消费 + 重试 + 死信 + 可观测）

> **今天目标**：把 Day21 的消息链路做到可靠。消费者要允许同一消息投递多次，区分可重试与不可重试异常，并让死信可告警、可查询、可审核重放。

## 一、先接受一个事实：MQ 通常是 At-least-once

生产者重试、Broker 重投、消费者处理成功但 ACK 丢失，都会让同一消息再次到达。业务目标不是“保证消息只来一次”，而是“消息可以来多次，但业务结果只生效一次”。

## 二、消费日志表

```sql
CREATE TABLE mq_consume_log (
    id BIGINT NOT NULL AUTO_INCREMENT,
    consumer_group VARCHAR(128) NOT NULL,
    message_key VARCHAR(128) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    consumed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_group_message (consumer_group, message_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MQ消费幂等日志';
```

幂等维度必须包含 consumer group：同一事件允许通知服务和积分服务各消费一次，但同一个消费者组只能处理一次。

## 三、消费逻辑与业务写入处于同一事务

```java
@Service
@RequiredArgsConstructor
public class OrderCreatedConsumerService {
    private final ConsumeLogMapper consumeLogMapper;
    private final NotificationMapper notificationMapper;

    @Transactional(rollbackFor = Exception.class)
    public void consume(OrderCreatedEvent event) {
        int inserted = consumeLogMapper.insertIgnore(
                "notification-order-created", event.eventId(), "order-events");
        if (inserted == 0) {
            return; // 已成功处理过，幂等返回
        }

        Notification notification = Notification.orderCreated(
                event.userId(), event.orderNo());
        notificationMapper.insert(notification);
    }
}
```

不能“先写消费日志并提交，再写业务表”：如果第二步失败，重试时会因为日志已存在而跳过，业务永远丢失。两次写入必须由同一个本地事务覆盖。

## 四、消费者入口只做反序列化和异常分类

```java
@Slf4j
@Component
@RequiredArgsConstructor
@RocketMQMessageListener(
        topic = "order-events",
        selectorExpression = "created",
        consumerGroup = "notification-order-created")
public class OrderCreatedListener implements RocketMQListener<OrderCreatedEvent> {
    private final OrderCreatedConsumerService consumerService;

    @Override
    public void onMessage(OrderCreatedEvent event) {
        if (event == null || event.eventId() == null || event.orderNo() == null) {
            // 不可恢复的坏消息应记录到 parking_lot 后 ACK，不能无限消耗重试资源。
            throw new NonRetryableMessageException("invalid order-created event");
        }
        consumerService.consume(event);
    }
}
```

建议用统一监听器切面/适配器处理异常：

- 数据库暂时不可用、网络超时：抛异常，让 RocketMQ 稍后重试。
- JSON 缺字段、版本不支持、金额格式永久非法：写入 parking-lot 表并告警，然后确认消费。
- 不要在日志里打印完整敏感消息体。

## 五、死信不是“自动修复”，而是最后隔离区

消息超过最大重试次数会进入 `%DLQ%<consumer-group>`。生产要求：

1. 监控消费积压、重试次数和 DLQ 数量。
2. 保存 messageId/eventId、topic、tag、失败原因、首次/最后失败时间。
3. 管理员修复根因后按 eventId 幂等重放。
4. 重放接口放在 `/api/admin/mq/**`，使用 `@Valid` DTO 和 `@PreAuthorize("hasRole('ADMIN')")`，并记录审计日志。

不要创建公开的 `/create-poison`、`/create-dup` 接口。重复投递和毒消息应通过测试代码或受控管理工具构造，不能留在生产 API。

## 六、生产者侧可靠性

```java
SendResult result = rocketMQTemplate.syncSend(destination, message, 3000);
if (result == null || result.getSendStatus() != SendStatus.SEND_OK) {
    throw new BizException(ErrorCode.SERVICE_UNAVAILABLE);
}
```

普通同步发送仍存在“本地事务提交了、消息没发出”的窗口。核心领域事件优先使用 Day21 的事务消息，或使用本地 Outbox：业务表和 outbox 同事务提交，由后台任务可靠投递并标记发送状态。

## 七、验证测试

```java
@SpringBootTest
class OrderCreatedConsumerServiceTest {
    @Test
    void duplicateEventShouldCreateOneNotification() {
        OrderCreatedEvent event = Fixtures.orderCreated("event-001");
        consumerService.consume(event);
        consumerService.consume(event);

        assertThat(notificationMapper.countByOrderNo(event.orderNo())).isEqualTo(1);
        assertThat(consumeLogMapper.count("notification-order-created", "event-001"))
                .isEqualTo(1);
    }
}
```

还要验证：第一次业务写入抛异常时消费日志也回滚；第二次重试可以成功；MySQL 恢复后积压消息可继续消费；不可重试消息进入 parking-lot 并触发告警。

## 八、知识点索引

| 知识点 | 文档 |
|---|---|
| 至少一次、重试、DLQ | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| 唯一索引、消费幂等 | [MySQL](/learn_database/MySQL) |
| 本地事务 / Outbox | [分布式基础](/learn_backend/java/微服务/分布式基础) |

## 九、✅ 完成后回填

- [ ] 同一 eventId 重复投递，业务结果只产生一次
- [ ] 消费日志与业务写入在同一事务
- [ ] 临时异常会重试，永久非法消息会隔离并告警
- [ ] DLQ 有监控和受控重放方案
- [ ] 没有公开毒消息/重复消息测试接口

## 十、面试追问

1. 为什么“ACK 丢失”会造成重复消费？
2. 消费日志为什么必须和业务写入处于同一事务？
3. 数据库唯一索引和 Redis SETNX 做消费幂等各有什么取舍？
4. 哪些异常应该重试，哪些不应该？
5. 死信消息为什么不能修复后直接无脑重放？
