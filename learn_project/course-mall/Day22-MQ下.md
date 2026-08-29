# Day 22 · MQ 下（幂等消费 + 重试 + Parking Lot）

> **今天目标**：让 Day21 的事件允许重复投递但业务只生效一次；临时故障交给
> RocketMQ 重试，永久坏消息写入隔离表后 ACK，并具备告警与受控重放依据。

本日项目根目录统一为 `E:\CourseMall`。示例通知消费者先放在 `mall-order` 方便学习；
真实项目可独立为 `mall-notification` 服务，代码结构保持不变。

## 一、先接受 At-least-once

生产者重试、Broker 重投、消费者处理成功但 ACK 丢失，都可能让同一消息再次到达。
目标不是幻想“消息只来一次”，而是：消息可以来多次，同一消费者组的业务结果只生效一次。

幂等键使用 Day21 的 `eventId`，并和 `consumer_group` 组成唯一索引。

## 二、建消费日志、通知和隔离表

新建 `E:\CourseMall\sql\day22-mq-reliability.sql` 并执行：

```sql
USE course_mall;

CREATE TABLE IF NOT EXISTS mq_consume_log (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    consumer_group VARCHAR(128) NOT NULL,
    message_key    VARCHAR(128) NOT NULL,
    topic          VARCHAR(128) NOT NULL,
    consumed_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_group_message (consumer_group, message_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MQ消费幂等日志';

CREATE TABLE IF NOT EXISTS user_notification (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    user_id     BIGINT       NOT NULL,
    biz_type    VARCHAR(64)  NOT NULL,
    biz_key     VARCHAR(128) NOT NULL,
    content     VARCHAR(500) NOT NULL,
    create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_type_key_user (biz_type, biz_key, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内通知';

CREATE TABLE IF NOT EXISTS mq_parking_lot (
    id              BIGINT        NOT NULL AUTO_INCREMENT,
    consumer_group  VARCHAR(128)  NOT NULL,
    message_id      VARCHAR(128)  NULL,
    topic           VARCHAR(128)  NOT NULL,
    tag              VARCHAR(128) NULL,
    payload          TEXT         NULL,
    failure_reason   VARCHAR(500) NOT NULL,
    status           TINYINT      NOT NULL DEFAULT 0 COMMENT '0待处理 1已重放 2已忽略',
    first_failed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_failed_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_status_time (status, first_failed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='永久失败消息隔离表';
```

同一事件允许通知服务和积分服务各处理一次，因此唯一键必须包含 consumer group。

## 三、Entity

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\entity\ConsumeLog.java`：

```java
package com.mall.order.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** MQ 消费幂等记录。 */
@Data
@TableName("mq_consume_log")
public class ConsumeLog {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String consumerGroup;
    private String messageKey;
    private String topic;
    private LocalDateTime consumedAt;
}
```

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\entity\UserNotification.java`：

```java
package com.mall.order.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 用户站内通知。 */
@Data
@TableName("user_notification")
public class UserNotification {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private String bizType;
    private String bizKey;
    private String content;
    private LocalDateTime createTime;
}
```

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\entity\ParkingLotMessage.java`：

```java
package com.mall.order.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/** 永久失败消息的人工处理记录。 */
@Data
@TableName("mq_parking_lot")
public class ParkingLotMessage {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String consumerGroup;
    private String messageId;
    private String topic;
    private String tag;
    private String payload;
    private String failureReason;
    private Integer status;
    private LocalDateTime firstFailedAt;
    private LocalDateTime lastFailedAt;
}
```

## 四、Mapper

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\mapper\ConsumeLogMapper.java`：

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.order.entity.ConsumeLog;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;

/** 消费幂等日志 Mapper。 */
public interface ConsumeLogMapper extends BaseMapper<ConsumeLog> {

    @Insert("""
            INSERT IGNORE INTO mq_consume_log
                (consumer_group, message_key, topic, consumed_at)
            VALUES
                (#{consumerGroup}, #{messageKey}, #{topic}, NOW())
            """)
    int insertIgnore(
            @Param("consumerGroup") String consumerGroup,
            @Param("messageKey") String messageKey,
            @Param("topic") String topic);
}
```

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\mapper\UserNotificationMapper.java`：

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.order.entity.UserNotification;

/** 用户通知 Mapper。 */
public interface UserNotificationMapper extends BaseMapper<UserNotification> {
}
```

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\mapper\ParkingLotMessageMapper.java`：

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.order.entity.ParkingLotMessage;

/** 永久失败消息 Mapper。 */
public interface ParkingLotMessageMapper extends BaseMapper<ParkingLotMessage> {
}
```

## 五、消费日志和业务写入必须在同一事务

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\service\OrderCreatedConsumerService.java`：

```java
package com.mall.order.service;

import com.mall.contract.order.OrderCreatedEvent;
import com.mall.order.entity.UserNotification;
import com.mall.order.mapper.ConsumeLogMapper;
import com.mall.order.mapper.UserNotificationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** “订单已创建”通知消费者的本地业务事务。 */
@Service
@RequiredArgsConstructor
public class OrderCreatedConsumerService {

    public static final String CONSUMER_GROUP =
            "notification-order-created";

    private final ConsumeLogMapper consumeLogMapper;
    private final UserNotificationMapper notificationMapper;

    @Transactional(rollbackFor = Exception.class)
    public void consume(OrderCreatedEvent event) {
        int inserted = consumeLogMapper.insertIgnore(
                CONSUMER_GROUP,
                event.eventId(),
                "order-events");
        if (inserted == 0) {
            return;
        }

        UserNotification notification = new UserNotification();
        notification.setUserId(event.userId());
        notification.setBizType("ORDER_CREATED");
        notification.setBizKey(event.orderNo());
        notification.setContent("订单已创建，请及时完成支付");
        notification.setCreateTime(LocalDateTime.now());
        notificationMapper.insert(notification);
    }
}
```

不能先提交消费日志再写业务表：若第二步失败，重试会被日志误判为“已消费”，业务永久丢失。

## 六、永久坏消息隔离服务

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\service\ParkingLotService.java`：

```java
package com.mall.order.service;

import com.mall.order.entity.ParkingLotMessage;
import com.mall.order.mapper.ParkingLotMessageMapper;
import lombok.RequiredArgsConstructor;
import org.apache.rocketmq.common.message.MessageExt;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;

/** 将确定无法自动恢复的消息保存到人工处理区。 */
@Service
@RequiredArgsConstructor
public class ParkingLotService {

    private final ParkingLotMessageMapper mapper;

    public void park(MessageExt message, String reason) {
        ParkingLotMessage record = new ParkingLotMessage();
        record.setConsumerGroup(OrderCreatedConsumerService.CONSUMER_GROUP);
        record.setMessageId(message.getMsgId());
        record.setTopic(message.getTopic());
        record.setTag(message.getTags());
        record.setPayload(safePayload(message.getBody()));
        record.setFailureReason(truncate(reason, 500));
        record.setStatus(0);
        record.setFirstFailedAt(LocalDateTime.now());
        record.setLastFailedAt(LocalDateTime.now());
        mapper.insert(record);
    }

    private String safePayload(byte[] body) {
        if (body == null) {
            return null;
        }
        // 生产环境应先脱敏；课程示例限制长度，避免异常消息撑爆数据库。
        return truncate(new String(body, StandardCharsets.UTF_8), 4_000);
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }
}
```

## 七、消费者入口：区分永久错误和临时错误

新建
`E:\CourseMall\mall-order\src\main\java\com\mall\order\mq\OrderCreatedListener.java`：

```java
package com.mall.order.mq;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.contract.order.OrderCreatedEvent;
import com.mall.order.service.OrderCreatedConsumerService;
import com.mall.order.service.ParkingLotService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.common.message.MessageExt;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Component;

/** 订单创建事件监听器。 */
@Slf4j
@Component
@RequiredArgsConstructor
@RocketMQMessageListener(
        topic = "order-events",
        selectorExpression = "created",
        consumerGroup = "notification-order-created")
public class OrderCreatedListener implements RocketMQListener<MessageExt> {

    private final ObjectMapper objectMapper;
    private final OrderCreatedConsumerService consumerService;
    private final ParkingLotService parkingLotService;

    @Override
    public void onMessage(MessageExt message) {
        try {
            OrderCreatedEvent event = objectMapper.readValue(
                    message.getBody(), OrderCreatedEvent.class);
            validate(event);
            consumerService.consume(event);
        } catch (JsonProcessingException | IllegalArgumentException ex) {
            // JSON/字段永久非法：落隔离表后正常返回，RocketMQ 会视为 ACK。
            parkingLotService.park(message, ex.getMessage());
            log.error("订单事件已隔离 messageId={}", message.getMsgId());
        }
        // 数据库、网络等其他 RuntimeException 不捕获，让 RocketMQ 自动重试。
    }

    private void validate(OrderCreatedEvent event) {
        if (event == null
                || event.eventId() == null
                || event.eventId().isBlank()
                || event.orderNo() == null
                || event.orderNo().isBlank()
                || event.userId() == null) {
            throw new IllegalArgumentException("订单事件缺少必填字段");
        }
        if (event.version() != 1) {
            throw new IllegalArgumentException(
                    "不支持的订单事件版本: " + event.version());
        }
    }
}
```

临时数据库故障会抛出运行时异常并触发重试；JSON 损坏、必填字段缺失、版本不支持等
永久问题写入 parking lot 后返回，从而确认当前消费。不要把所有异常都吞掉，也不要让
确定无法恢复的消息无限重试。

## 八、死信与受控重放

超过最大重试次数的消息进入 `%DLQ%notification-order-created`。生产必须监控：

1. 消费积压、重试次数和 DLQ 数量；
2. `messageId/eventId/topic/tag`、失败原因和失败时间；
3. 修复根因后按 `eventId` 幂等重放；
4. 重放接口只能放 `/api/admin/mq/**`，使用 DTO Validation、
   `@PreAuthorize("hasRole('ADMIN')")` 和审计日志。

不要创建公开的 `/create-poison`、`/create-dup` 接口。重复投递和毒消息由集成测试或
受控管理工具构造。

## 九、验证测试

新建
`E:\CourseMall\mall-order\src\test\java\com\mall\order\service\OrderCreatedConsumerServiceTest.java`：

```java
package com.mall.order.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.contract.order.OrderCreatedEvent;
import com.mall.order.entity.ConsumeLog;
import com.mall.order.entity.UserNotification;
import com.mall.order.mapper.ConsumeLogMapper;
import com.mall.order.mapper.UserNotificationMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class OrderCreatedConsumerServiceTest {

    @Autowired
    private OrderCreatedConsumerService consumerService;
    @Autowired
    private ConsumeLogMapper consumeLogMapper;
    @Autowired
    private UserNotificationMapper notificationMapper;

    @Test
    void duplicateEventShouldCreateOneNotification() {
        OrderCreatedEvent event = new OrderCreatedEvent(
                "event-001",
                "CM202608290001",
                1L,
                1L,
                new BigDecimal("99.00"),
                LocalDateTime.now(),
                1);

        consumerService.consume(event);
        consumerService.consume(event);

        Long notificationCount = notificationMapper.selectCount(
                new LambdaQueryWrapper<UserNotification>()
                        .eq(UserNotification::getBizType, "ORDER_CREATED")
                        .eq(UserNotification::getBizKey, event.orderNo())
                        .eq(UserNotification::getUserId, event.userId()));
        Long consumeCount = consumeLogMapper.selectCount(
                new LambdaQueryWrapper<ConsumeLog>()
                        .eq(ConsumeLog::getConsumerGroup,
                                OrderCreatedConsumerService.CONSUMER_GROUP)
                        .eq(ConsumeLog::getMessageKey, event.eventId()));

        assertThat(notificationCount).isEqualTo(1L);
        assertThat(consumeCount).isEqualTo(1L);
    }
}
```

还要验证：业务插入失败时消费日志一起回滚；MySQL 恢复后重试成功；永久坏消息进入
`mq_parking_lot`；同一 `eventId` 重放不会产生第二条业务结果。

## 十、知识点索引

| 知识点 | 文档 |
|---|---|
| 至少一次、重试、DLQ | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| 唯一索引、消费幂等 | [MySQL](/learn_database/MySQL) |
| 本地事务 / Outbox | [分布式基础](/learn_backend/java/微服务/分布式基础) |

## 十一、✅ 完成后回填

- [ ] SQL 文件按本文路径执行成功
- [ ] 同一 eventId 重复投递，通知只产生一次
- [ ] 消费日志与业务写入处于同一事务
- [ ] 临时异常会重试，永久非法消息会隔离并 ACK
- [ ] DLQ 有监控和受控重放方案
- [ ] 没有公开毒消息/重复消息测试接口

## 十二、面试追问

1. 为什么 ACK 丢失会造成重复消费？
2. 消费日志为什么必须和业务写入处于同一事务？
3. 数据库唯一索引和 Redis `SETNX` 做消费幂等各有什么取舍？
4. 哪些异常应该重试，哪些应该直接隔离？
5. 死信消息为什么不能修复后直接无脑重放？
