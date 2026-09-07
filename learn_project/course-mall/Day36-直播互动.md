# Day 36 · 直播互动（弹幕 + 礼物幂等 + 回放）

> **今天目标**：在 Day35 的直播链路上完成三件事：可信弹幕、可审计礼物扣款、SRS 回放回调。实时展示允许最终一致，扣款绝不能只靠 WebSocket 广播。

## 一、职责划分

| 功能 | 入口/可靠链路 | 实时展示 |
|---|---|---|
| 弹幕 | STOMP → 限频/过滤 → RocketMQ → DB | Redis Pub/Sub → WebSocket |
| 礼物 | HTTP → 幂等订单 + DB 原子扣款 → RocketMQ | WebSocket 礼物特效 |
| 回放 | SRS 录制完成 Hook → DB | 房间状态通知 |

客户端传来的 `userId`、`giftName`、`price` 一律不可信。当前用户来自 JWT Principal，礼物名称和价格来自数据库。

`mall-live/pom.xml` 增加与 Day21 相同版本的 RocketMQ starter，
`application.yml` 配置 `rocketmq.name-server`；`mall-realtime` 已在 Day32 配过，不重复添加。

```xml
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>2.3.1</version>
</dependency>
```

`mall-live/src/main/resources/application.yml` 增加：

```yaml
rocketmq:
  name-server: ${ROCKETMQ_NAME_SERVER:127.0.0.1:9876}
  producer:
    group: mall-live-producer
```

## 二、数据库

`E:\CourseMall\sql\day36_live_interaction.sql`：

```sql
ALTER TABLE live_room
    ADD COLUMN replay_status TINYINT NOT NULL DEFAULT 0
        COMMENT '0无回放 1生成中 2就绪 3失败',
    ADD COLUMN replay_duration_seconds INT DEFAULT NULL,
    ADD COLUMN replay_failure_reason VARCHAR(500) DEFAULT NULL;

CREATE TABLE live_danmaku (
    id BIGINT NOT NULL AUTO_INCREMENT,
    message_id VARCHAR(64) NOT NULL,
    room_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    username VARCHAR(64) NOT NULL,
    content VARCHAR(200) NOT NULL,
    video_time_seconds INT NOT NULL DEFAULT 0,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_message_id (message_id),
    KEY idx_room_video_time (room_id, video_time_seconds, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='直播弹幕';

CREATE TABLE live_gift (
    id BIGINT NOT NULL AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    icon_url VARCHAR(500) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    enabled TINYINT NOT NULL DEFAULT 1,
    created_by BIGINT DEFAULT NULL COMMENT '创建人ID',
    updated_by BIGINT DEFAULT NULL COMMENT '最后修改人ID',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='直播礼物';

CREATE TABLE user_wallet (
    user_id BIGINT NOT NULL,
    balance DECIMAL(12,2) NOT NULL DEFAULT 0,
    version INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户钱包';

CREATE TABLE gift_order (
    id BIGINT NOT NULL AUTO_INCREMENT,
    request_id VARCHAR(64) NOT NULL,
    user_id BIGINT NOT NULL,
    room_id BIGINT NOT NULL,
    gift_id BIGINT NOT NULL,
    quantity INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status TINYINT NOT NULL DEFAULT 1 COMMENT '1成功 2退款',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_request_id (request_id),
    KEY idx_room_create (room_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='礼物订单';

CREATE TABLE gift_event_outbox (
    id BIGINT NOT NULL AUTO_INCREMENT,
    event_id VARCHAR(64) NOT NULL,
    payload JSON NOT NULL,
    status TINYINT NOT NULL DEFAULT 0 COMMENT '0待发送 1已发送',
    retry_count INT NOT NULL DEFAULT 0,
    next_retry_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_event_id (event_id),
    KEY idx_status_retry (status, next_retry_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='礼物事件Outbox';
```

迁移执行后，把 `E:\CourseMall\mall-live\src\main\java\com\mall\live\entity\LiveRoom.java` 更新为：

```java
package com.mall.live.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("live_room")
public class LiveRoom {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long teacherId;
    private Long courseId;
    private String title;
    private String streamName;
    private Integer status;
    private LocalDateTime scheduledStartTime;
    private LocalDateTime actualStartTime;
    private LocalDateTime actualEndTime;
    private String replayUrl;
    private Integer replayStatus;
    private Integer replayDurationSeconds;
    private String replayFailureReason;
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    @TableLogic
    private Integer deleted;
}
```

礼物消费涉及真实金额时还必须接支付渠道、退款、账务对账和合规；本日钱包只用于学习事务、幂等和事件驱动，简历中应写“虚拟余额”，不要冒充真实支付系统。

## 三、可信弹幕

### 步骤 1：请求、事件与发送服务

先新建 `mall-realtime/client/LiveAccessClient.java`，让实时服务向 `mall-live` 查询房间状态和观看权：

```java
package com.mall.realtime.client;

import com.mall.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "mall-live", path = "/internal/live/rooms")
public interface LiveAccessClient {
    @GetMapping("/{roomId}/watch-access")
    Result<Boolean> canWatch(
            @PathVariable Long roomId,
            @RequestParam Long userId);
}
```

`mall-realtime/src/main/java/com/mall/realtime/live/DanmakuSendRequest.java`：

```java
package com.mall.realtime.live;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DanmakuSendRequest(
        @NotBlank @Size(max = 200) String content,
        @Min(0) @Max(86400) int videoTimeSeconds) {
}
```

`mall-common/src/main/java/com/mall/common/event/DanmakuCreatedEvent.java`：

```java
package com.mall.common.event;

import java.time.Instant;

public record DanmakuCreatedEvent(
        String messageId,
        Long roomId,
        Long userId,
        String username,
        String content,
        int videoTimeSeconds,
        Instant sentAt) {
}
```

`mall-realtime/src/main/java/com/mall/realtime/live/DanmakuService.java`：

```java
package com.mall.realtime.live;

import com.mall.common.event.DanmakuCreatedEvent;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.realtime.broker.RealtimePublisher;
import com.mall.realtime.client.LiveAccessClient;
import com.mall.realtime.security.StompPrincipal;
import lombok.RequiredArgsConstructor;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DanmakuService {
    private static final Set<String> BLOCKED_WORDS = Set.of("赌博", "诈骗");

    private final StringRedisTemplate redisTemplate;
    private final RealtimePublisher publisher;
    private final RocketMQTemplate rocketMQTemplate;
    private final LiveAccessClient liveAccessClient;

    public void send(
            Long roomId, StompPrincipal user, DanmakuSendRequest request) {
        com.mall.common.result.Result<Boolean> access =
                liveAccessClient.canWatch(roomId, user.userId());
        if (access == null || !Boolean.TRUE.equals(access.getData())) {
            throw new BizException(ErrorCode.LIVE_ACCESS_DENIED);
        }
        String rateKey = "live:danmaku:rate:" + roomId + ":" + user.userId();
        if (!Boolean.TRUE.equals(redisTemplate.opsForValue()
                .setIfAbsent(rateKey, "1", Duration.ofMillis(800)))) {
            throw new BizException(ErrorCode.LIVE_MESSAGE_TOO_FREQUENT);
        }
        String content = request.content().trim();
        if (BLOCKED_WORDS.stream().anyMatch(content::contains)) {
            throw new BizException(ErrorCode.PARAM_ERROR);
        }

        DanmakuCreatedEvent event = new DanmakuCreatedEvent(
                UUID.randomUUID().toString(),
                roomId,
                user.userId(),
                user.username(),
                content,
                request.videoTimeSeconds(),
                Instant.now());
        // 先交给可靠 MQ 持久化；在线广播失败不影响后续回放查询。
        rocketMQTemplate.syncSend("live-danmaku", event);
        publisher.broadcast("/topic/live/" + roomId + "/danmaku", event);
    }
}
```

`DanmakuMessageController.java`：

```java
package com.mall.realtime.live;

import com.mall.realtime.security.StompPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class DanmakuMessageController {
    private final DanmakuService danmakuService;

    @MessageMapping("/live/{roomId}/danmaku")
    public void send(
            @DestinationVariable Long roomId,
            @Valid DanmakuSendRequest request,
            Principal principal) {
        danmakuService.send(roomId, (StompPrincipal) principal, request);
    }
}
```

本地敏感词 Set 只是跑通链路；生产接审核服务并记录命中规则。发送权限已由
`LiveAccessClient` 校验，但还要保护 SUBSCRIBE，否则未购买用户仍能偷听广播。

新建 `mall-realtime/src/main/java/com/mall/realtime/security/LiveSubscriptionAuthorizationInterceptor.java`：

```java
package com.mall.realtime.security;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.realtime.client.LiveAccessClient;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
public class LiveSubscriptionAuthorizationInterceptor implements ChannelInterceptor {
    private static final Pattern LIVE_TOPIC = Pattern.compile(
            "^/topic/live/(\\d+)/(danmaku|gifts|presence)$");

    private final LiveAccessClient liveAccessClient;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(
                message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() != StompCommand.SUBSCRIBE) {
            return message;
        }

        Matcher matcher = LIVE_TOPIC.matcher(
                accessor.getDestination() == null ? "" : accessor.getDestination());
        if (!matcher.matches()) {
            return message;
        }
        if (!(accessor.getUser() instanceof StompPrincipal user)) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }

        Long roomId = Long.valueOf(matcher.group(1));
        Result<Boolean> access = liveAccessClient.canWatch(roomId, user.userId());
        if (access == null || !Boolean.TRUE.equals(access.getData())) {
            throw new BizException(ErrorCode.LIVE_ACCESS_DENIED);
        }
        return message;
    }
}
```

在 Day31 的 `WebSocketConfig` 注入该拦截器，并与 Day32 的课程订阅拦截器一起注册：

```java
private final StompAuthChannelInterceptor authChannelInterceptor;
private final SubscriptionAuthorizationInterceptor subscriptionAuthorizationInterceptor;
private final LiveSubscriptionAuthorizationInterceptor liveSubscriptionAuthorizationInterceptor;

@Override
public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(
            authChannelInterceptor,
            subscriptionAuthorizationInterceptor,
            liveSubscriptionAuthorizationInterceptor);
}
```

### 步骤 2：异步幂等落库

新建 `E:\CourseMall\mall-live\src\main\java\com\mall\live\entity\LiveDanmaku.java`：

```java
package com.mall.live.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("live_danmaku")
public class LiveDanmaku {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String messageId;
    private Long roomId;
    private Long userId;
    private String username;
    private String content;
    private Integer videoTimeSeconds;
    private LocalDateTime createTime;
}
```

新建 `E:\CourseMall\mall-live\src\main\java\com\mall\live\mapper\LiveDanmakuMapper.java`：

```java
package com.mall.live.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.live.entity.LiveDanmaku;

public interface LiveDanmakuMapper extends BaseMapper<LiveDanmaku> {
}
```

消费者完整代码：

```java
package com.mall.live.consumer;

import com.mall.common.event.DanmakuCreatedEvent;
import com.mall.live.entity.LiveDanmaku;
import com.mall.live.mapper.LiveDanmakuMapper;
import lombok.RequiredArgsConstructor;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@RocketMQMessageListener(
        topic = "live-danmaku",
        consumerGroup = "live-danmaku-persist")
public class DanmakuPersistConsumer
        implements RocketMQListener<DanmakuCreatedEvent> {
    private final LiveDanmakuMapper mapper;

    @Override
    public void onMessage(DanmakuCreatedEvent event) {
        LiveDanmaku entity = new LiveDanmaku();
        entity.setMessageId(event.messageId());
        entity.setRoomId(event.roomId());
        entity.setUserId(event.userId());
        entity.setUsername(event.username());
        entity.setContent(event.content());
        entity.setVideoTimeSeconds(event.videoTimeSeconds());
        try {
            mapper.insert(entity);
        } catch (DuplicateKeyException ignored) {
            // RocketMQ 至少一次投递；message_id 唯一索引保证重复消费幂等。
        }
    }
}
```

## 四、礼物订单：幂等 + 原子扣款

`mall-live/src/main/java/com/mall/live/dto/SendGiftRequest.java`：

```java
package com.mall.live.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Schema(description = "发送直播礼物请求")
public record SendGiftRequest(
        @Schema(description = "客户端生成的幂等请求 ID")
        @NotBlank String requestId,
        @Schema(description = "礼物 ID", example = "1")
        @NotNull Long giftId,
        @Schema(description = "礼物数量，范围 1～99", example = "1")
        @Min(1) @Max(99) int quantity) {
}
```

新建 `LiveGift.java`：

```java
package com.mall.live.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("live_gift")
public class LiveGift {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String name;
    private String iconUrl;
    private BigDecimal price;
    private Integer enabled;
    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
```

新建 `GiftOrder.java`：

```java
package com.mall.live.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.math.BigDecimal;

@Data
@TableName("gift_order")
public class GiftOrder {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String requestId;
    private Long userId;
    private Long roomId;
    private Long giftId;
    private Integer quantity;
    private BigDecimal amount;
    private Integer status;

    public static GiftOrder success(
            String requestId,
            Long userId,
            Long roomId,
            Long giftId,
            int quantity,
            BigDecimal amount) {
        GiftOrder order = new GiftOrder();
        order.setRequestId(requestId);
        order.setUserId(userId);
        order.setRoomId(roomId);
        order.setGiftId(giftId);
        order.setQuantity(quantity);
        order.setAmount(amount);
        order.setStatus(1);
        return order;
    }
}
```

新建 `mapper/GiftOrderMapper.java`：

```java
package com.mall.live.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.live.entity.GiftOrder;

public interface GiftOrderMapper extends BaseMapper<GiftOrder> {
}
```

新建 `entity/GiftEventOutbox.java`：

```java
package com.mall.live.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("gift_event_outbox")
public class GiftEventOutbox {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String eventId;
    private String payload;
    private Integer status;
    private Integer retryCount;
    private LocalDateTime nextRetryTime;
    private LocalDateTime createTime;

    public static GiftEventOutbox pending(String eventId, String payload) {
        GiftEventOutbox outbox = new GiftEventOutbox();
        outbox.setEventId(eventId);
        outbox.setPayload(payload);
        outbox.setStatus(0);
        outbox.setRetryCount(0);
        outbox.setNextRetryTime(LocalDateTime.now());
        return outbox;
    }
}
```

新建 `mapper/GiftEventOutboxMapper.java`：

```java
package com.mall.live.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.live.entity.GiftEventOutbox;

public interface GiftEventOutboxMapper extends BaseMapper<GiftEventOutbox> {
}
```

新建 `mapper/LiveGiftMapper.java`：

```java
package com.mall.live.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.live.entity.LiveGift;

public interface LiveGiftMapper extends BaseMapper<LiveGift> {
}
```

新建 `mapper/UserWalletMapper.java`：

```java
package com.mall.live.mapper;

import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;
import java.math.BigDecimal;

public interface UserWalletMapper {
    @Update("""
            UPDATE user_wallet
            SET balance = balance - #{amount}, version = version + 1
            WHERE user_id = #{userId} AND balance >= #{amount}
            """)
    int deduct(
            @Param("userId") Long userId,
            @Param("amount") BigDecimal amount);
}
```

扣款 SQL 把余额判断放进同一条 UPDATE，避免并发“先查余额都够、随后都扣款”导致负数。

`mall-live/src/main/java/com/mall/live/service/GiftService.java`：

```java
package com.mall.live.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.event.GiftSentEvent;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.live.dto.SendGiftRequest;
import com.mall.live.entity.GiftEventOutbox;
import com.mall.live.entity.GiftOrder;
import com.mall.live.entity.LiveGift;
import com.mall.live.mapper.GiftEventOutboxMapper;
import com.mall.live.mapper.GiftOrderMapper;
import com.mall.live.mapper.LiveGiftMapper;
import com.mall.live.mapper.UserWalletMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;

@Service
@RequiredArgsConstructor
public class GiftService {
    private final LiveGiftMapper giftMapper;
    private final GiftOrderMapper orderMapper;
    private final UserWalletMapper walletMapper;
    private final GiftEventOutboxMapper outboxMapper;
    private final ObjectMapper objectMapper;
    private final LiveRoomService roomService;

    @Transactional
    public Long send(Long userId, Long roomId, SendGiftRequest request) {
        // 同时校验房间正在直播，以及当前用户具有课程观看权。
        roomService.enter(userId, roomId);
        GiftOrder existing = orderMapper.selectOne(
                new LambdaQueryWrapper<GiftOrder>()
                        .eq(GiftOrder::getRequestId, request.requestId()));
        if (existing != null) {
            if (!existing.getUserId().equals(userId)
                    || !existing.getRoomId().equals(roomId)) {
                throw new BizException(ErrorCode.CONFLICT);
            }
            return existing.getId();
        }

        LiveGift gift = giftMapper.selectById(request.giftId());
        if (gift == null || !Integer.valueOf(1).equals(gift.getEnabled())) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        BigDecimal amount = gift.getPrice()
                .multiply(BigDecimal.valueOf(request.quantity()));
        if (walletMapper.deduct(userId, amount) != 1) {
            throw new BizException(ErrorCode.OPERATION_FAILED);
        }

        GiftOrder order = GiftOrder.success(
                request.requestId(), userId, roomId,
                gift.getId(), request.quantity(), amount);
        try {
            orderMapper.insert(order);
        } catch (DuplicateKeyException exception) {
            // 并发重复 requestId 会回滚本次扣款，再读取首次成功订单。
            throw new BizException(ErrorCode.CONFLICT);
        }

        GiftSentEvent event = new GiftSentEvent(
                request.requestId(), order.getId(), roomId, userId,
                gift.getId(), gift.getName(), request.quantity(), amount, Instant.now());
        // 订单、扣款和 Outbox 同属当前本地事务，不会出现“库成功、消息没发”的空窗。
        outboxMapper.insert(GiftEventOutbox.pending(
                event.eventId(), toJson(event)));
        return order.getId();
    }

    private String toJson(GiftSentEvent event) {
        try {
            return objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("礼物事件序列化失败", exception);
        }
    }
}
```

新建
`E:\CourseMall\mall-common\src\main\java\com\mall\common\event\GiftSentEvent.java`：

```java
package com.mall.common.event;

import java.math.BigDecimal;
import java.time.Instant;

public record GiftSentEvent(
        String eventId,
        Long giftOrderId,
        Long roomId,
        Long userId,
        Long giftId,
        String giftName,
        int quantity,
        BigDecimal amount,
        Instant sentAt) {
}
```

新建 `mall-live/src/main/java/com/mall/live/mq/GiftOutboxPublisher.java`：

```java
package com.mall.live.mq;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.event.GiftSentEvent;
import com.mall.live.entity.GiftEventOutbox;
import com.mall.live.mapper.GiftEventOutboxMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class GiftOutboxPublisher {
    private final GiftEventOutboxMapper outboxMapper;
    private final ObjectMapper objectMapper;
    private final RocketMQTemplate rocketMQTemplate;

    @Scheduled(fixedDelayString = "${live.gift-outbox-delay-ms:1000}")
    public void publishPending() {
        List<GiftEventOutbox> events = outboxMapper.selectList(
                new LambdaQueryWrapper<GiftEventOutbox>()
                        .eq(GiftEventOutbox::getStatus, 0)
                        .le(GiftEventOutbox::getNextRetryTime, LocalDateTime.now())
                        .orderByAsc(GiftEventOutbox::getId)
                        .last("LIMIT 100"));
        events.forEach(this::publishOne);
    }

    private void publishOne(GiftEventOutbox outbox) {
        try {
            GiftSentEvent event = objectMapper.readValue(
                    outbox.getPayload(), GiftSentEvent.class);
            rocketMQTemplate.syncSend("gift-sent", event);
            outbox.setStatus(1);
            outboxMapper.updateById(outbox);
        } catch (JsonProcessingException exception) {
            // JSON 已无法恢复，记录后仍保留数据，交由告警和人工处理。
            log.error("礼物Outbox数据损坏 eventId={}", outbox.getEventId(), exception);
            scheduleRetry(outbox);
        } catch (Exception exception) {
            log.warn("礼物事件发送失败，等待重试 eventId={}", outbox.getEventId(), exception);
            scheduleRetry(outbox);
        }
    }

    private void scheduleRetry(GiftEventOutbox outbox) {
        int retryCount = outbox.getRetryCount() + 1;
        long delaySeconds = Math.min(300L, 1L << Math.min(retryCount, 8));
        outbox.setRetryCount(retryCount);
        outbox.setNextRetryTime(LocalDateTime.now().plusSeconds(delaySeconds));
        outboxMapper.updateById(outbox);
    }
}
```

把 `E:\CourseMall\mall-live\src\main\java\com\mall\live\MallLiveApplication.java` 更新为：

```java
package com.mall.live;

import com.mall.live.config.LiveProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@EnableFeignClients
@MapperScan("com.mall.live.mapper")
@EnableConfigurationProperties(LiveProperties.class)
@SpringBootApplication(scanBasePackages = "com.mall")
public class MallLiveApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallLiveApplication.class, args);
    }
}
```

Outbox 可能在“MQ 已收到、状态尚未改为已发送”时重复投递，因此消费者仍必须幂等。

新建
`E:\CourseMall\mall-live\src\main\java\com\mall\live\controller\GiftController.java`：

```java
package com.mall.live.controller;

import com.mall.common.result.Result;
import com.mall.live.dto.SendGiftRequest;
import com.mall.live.service.GiftService;
import com.mall.security.ResourcePrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/live/rooms")
@RequiredArgsConstructor
@Tag(name = "直播礼物", description = "幂等赠送虚拟礼物")
public class GiftController {
    private final GiftService giftService;

    @Operation(summary = "赠送直播礼物")
    @PostMapping("/{roomId}/gifts")
    @PreAuthorize("isAuthenticated()")
    public Result<Long> sendGift(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable Long roomId,
            @Valid @RequestBody SendGiftRequest request) {
        return Result.ok(giftService.send(principal.id(), roomId, request));
    }
}
```

在 `mall-realtime` 新建完整消费者：

```java
package com.mall.realtime.live;

import com.mall.common.event.GiftSentEvent;
import com.mall.realtime.broker.RealtimePublisher;
import lombok.RequiredArgsConstructor;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
@RequiredArgsConstructor
@RocketMQMessageListener(
        topic = "gift-sent",
        consumerGroup = "realtime-gift-broadcast")
public class GiftSentConsumer implements RocketMQListener<GiftSentEvent> {
    private final RealtimePublisher publisher;
    private final StringRedisTemplate redisTemplate;

    @Override
    public void onMessage(GiftSentEvent event) {
        String dedupKey = "live:gift:event:" + event.eventId();
        if (!Boolean.TRUE.equals(redisTemplate.opsForValue()
                .setIfAbsent(dedupKey, "1", Duration.ofDays(1)))) {
            return;
        }
        try {
            publisher.broadcast(
                    "/topic/live/" + event.roomId() + "/gifts",
                    event);
        } catch (RuntimeException exception) {
            // 广播失败时允许 RocketMQ 重投后再次处理。
            redisTemplate.delete(dedupKey);
            throw exception;
        }
    }
}
```

数据库扣款成功才产生特效；前端不能自己发一个 STOMP 礼物消息。

## 五、回放不是“拼一个 URL”

在 SRS 开启 DVR/HLS 录制。录制完成后由 SRS/转码 worker 回调
`POST /internal/live/hooks/replay-ready`。

先在 `LiveRoomMapper` 增加以下方法：

```java
@Update("""
        UPDATE live_room
        SET status = 3,
            actual_end_time = NOW(),
            replay_status = 1,
            version = version + 1
        WHERE stream_name = #{streamName} AND status = 2 AND deleted = 0
        """)
int endAndGenerateReplay(@Param("streamName") String streamName);
```

然后把 Day35 `SrsHookController.onUnpublish` 中的状态更新替换为：

```java
// SRS 停止发布后进入“回放生成中”；重复回调不会反复更新。
roomMapper.endAndGenerateReplay(request.stream());
```

新建 `ReplayService.java`：

```java
package com.mall.live.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.live.entity.LiveRoom;
import com.mall.live.mapper.LiveRoomMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class ReplayService {
    private final LiveRoomService roomService;
    private final LiveRoomMapper liveRoomMapper;

    @Transactional
    public void markReplayReady(
            Long roomId, String replayUrl, Integer durationSeconds) {
        LiveRoom room = roomService.required(roomId);
        if (!Integer.valueOf(3).equals(room.getStatus())) {
            throw new BizException(ErrorCode.LIVE_REPLAY_NOT_READY);
        }
        room.setReplayUrl(replayUrl);
        room.setReplayDurationSeconds(durationSeconds);
        room.setReplayFailureReason(null);
        room.setReplayStatus(2);
        liveRoomMapper.updateById(room);
    }

    @Transactional
    public void markReplayFailed(Long roomId, String reason) {
        LiveRoom room = roomService.required(roomId);
        if (!Integer.valueOf(3).equals(room.getStatus())) {
            throw new BizException(ErrorCode.LIVE_REPLAY_NOT_READY);
        }
        room.setReplayStatus(3);
        room.setReplayFailureReason(reason);
        liveRoomMapper.updateById(room);
    }
}
```

新建 `ReplayHookController.java`：

```java
package com.mall.live.controller;

import com.mall.live.config.LiveProperties;
import com.mall.live.service.ReplayService;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/live/hooks")
@RequiredArgsConstructor
@Hidden
public class ReplayHookController {
    private final LiveProperties properties;
    private final ReplayService replayService;

    @PostMapping("/replay-ready")
    public SrsHookController.HookResponse ready(
            @RequestParam String secret,
            @Valid @RequestBody ReplayReadyRequest request) {
        if (!properties.hookSecret().equals(secret)) {
            return new SrsHookController.HookResponse(1);
        }
        replayService.markReplayReady(
                request.roomId(), request.replayUrl(), request.durationSeconds());
        return new SrsHookController.HookResponse(0);
    }

    @PostMapping("/replay-failed")
    public SrsHookController.HookResponse failed(
            @RequestParam String secret,
            @Valid @RequestBody ReplayFailedRequest request) {
        if (!properties.hookSecret().equals(secret)) {
            return new SrsHookController.HookResponse(1);
        }
        replayService.markReplayFailed(request.roomId(), request.reason());
        return new SrsHookController.HookResponse(0);
    }

    public record ReplayReadyRequest(
            @NotNull Long roomId,
            @NotBlank String replayUrl,
            @NotNull Integer durationSeconds) {
    }

    public record ReplayFailedRequest(
            @NotNull Long roomId,
            @NotBlank String reason) {
    }
}
```

录制刚结束时先写 `replay_status=1`，转码/上传成功后才写 2；失败写 3 并保存原因。回放 URL 继续使用 Day34 的短时播放令牌，不能永久公开。

### 回放弹幕查询

新建 `mall-live/src/main/java/com/mall/live/vo/DanmakuVO.java`：

```java
package com.mall.live.vo;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "回放弹幕")
public record DanmakuVO(
        @Schema(description = "弹幕 ID")
        Long id,
        @Schema(description = "发送用户 ID")
        Long userId,
        @Schema(description = "发送用户名")
        String username,
        @Schema(description = "弹幕内容")
        String content,
        @Schema(description = "弹幕对应的视频秒数")
        Integer videoTimeSeconds) {
}
```

新建 `mall-live/src/main/java/com/mall/live/service/ReplayDanmakuService.java`：

```java
package com.mall.live.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.live.client.LiveCourseClient;
import com.mall.live.entity.LiveDanmaku;
import com.mall.live.entity.LiveRoom;
import com.mall.live.mapper.LiveDanmakuMapper;
import com.mall.live.vo.DanmakuVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ReplayDanmakuService {
    private final LiveRoomService roomService;
    private final LiveCourseClient courseClient;
    private final LiveDanmakuMapper danmakuMapper;

    public List<DanmakuVO> listByTimeRange(
            Long userId, Long roomId, int from, int to) {
        if (to < from || to - from > 300) {
            throw new BizException(ErrorCode.PARAM_ERROR);
        }
        LiveRoom room = roomService.required(roomId);
        if (!Integer.valueOf(3).equals(room.getStatus())
                || !Integer.valueOf(2).equals(room.getReplayStatus())) {
            throw new BizException(ErrorCode.LIVE_REPLAY_NOT_READY);
        }
        if (room.getCourseId() != null) {
            Result<Boolean> access = courseClient.canWatchLive(
                    room.getCourseId(), userId);
            if (access == null || !Boolean.TRUE.equals(access.getData())) {
                throw new BizException(ErrorCode.LIVE_ACCESS_DENIED);
            }
        }
        return danmakuMapper.selectList(
                        new LambdaQueryWrapper<LiveDanmaku>()
                                .eq(LiveDanmaku::getRoomId, roomId)
                                .between(LiveDanmaku::getVideoTimeSeconds, from, to)
                                .orderByAsc(LiveDanmaku::getVideoTimeSeconds)
                                .orderByAsc(LiveDanmaku::getId))
                .stream()
                .map(item -> new DanmakuVO(
                        item.getId(), item.getUserId(), item.getUsername(),
                        item.getContent(), item.getVideoTimeSeconds()))
                .toList();
    }
}
```

新建 `mall-live/src/main/java/com/mall/live/controller/ReplayDanmakuController.java`：

```java
package com.mall.live.controller;

import com.mall.common.result.Result;
import com.mall.live.service.ReplayDanmakuService;
import com.mall.live.vo.DanmakuVO;
import com.mall.security.ResourcePrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Validated
@RestController
@RequestMapping("/api/live/rooms")
@RequiredArgsConstructor
@Tag(name = "直播回放", description = "按播放时间窗查询回放弹幕")
public class ReplayDanmakuController {
    private final ReplayDanmakuService replayDanmakuService;

    @Operation(summary = "查询回放弹幕")
    @GetMapping("/{roomId}/danmaku")
    public Result<List<DanmakuVO>> listDanmaku(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable Long roomId,
            @RequestParam @Min(0) int from,
            @RequestParam @Min(0) int to) {
        return Result.ok(replayDanmakuService.listByTimeRange(
                principal.id(), roomId, from, to));
    }
}
```

查询 SQL 使用 `idx_room_video_time`，每次最多拉 5 分钟，播放器向前预取；不要一次加载整场直播弹幕。

## 六、验收

1. 客户端伪造 userId/price 不影响服务端结果。
2. 相同 requestId 连续发送两次，只扣一次余额、只有一条 gift_order。
3. 余额不足时没有礼物订单，也不广播特效。
4. 重复 MQ 弹幕消息只落一条数据。
5. 直播结束后先显示“回放生成中”，收到真实回调后才可播放。
6. 回放拖到 600 秒，只查询附近时间窗弹幕。

::: tip 💡 面试题：礼物为什么用 HTTP，不直接走 WebSocket？
**一句话**：礼物扣款需要明确响应、事务、幂等键、鉴权和审计，HTTP 更适合作为命令入口；事务成功后再发事件让 WebSocket展示特效，实时通道不能成为账务真相来源。
:::

## 七、知识点索引

| 知识点 | 本日实现 |
|---|---|
| 消息幂等 | messageId/requestId 唯一索引 |
| 原子扣款 | `UPDATE ... balance >= amount` |
| 可靠与实时分离 | RocketMQ/DB 与 WebSocket |
| 最终一致性 | 业务完成后异步广播 |
| 回放弹幕 | roomId + videoTime 联合索引 |

## 八、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 弹幕身份、限频、过滤和幂等落库正常：是 / 否
- [ ] 礼物重复请求只扣款一次：是 / 否
- [ ] 余额不足不会广播礼物：是 / 否
- [ ] SRS 真实回调后才出现回放：是 / 否
- [ ] 回放弹幕按时间窗加载：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：

## 九、我下次会追问的问题

1. 为什么 RocketMQ 重复消费不会产生重复弹幕？
2. 为什么余额判断必须写进 UPDATE 条件？
3. 事务提交后再发 MQ 仍有什么空窗，Outbox 怎么解决？
4. 礼物特效丢失和礼物扣款丢失，严重程度为什么不同？
5. 回放地址为什么不能在结束直播时直接拼出来？
