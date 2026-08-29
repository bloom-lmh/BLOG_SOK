# Day 32 · WebSocket 实战（可信聊天室 + 订单推送 + 集群广播）

> **今天目标**：在 Day31 的 `mall-realtime` 中完成课程聊天室与个人订单通知，并把单机 `SimpleBroker` 的消息通过 Redis Pub/Sub 扩散到所有实时服务实例。

今天遵守三个真实项目原则：

1. 消息里的用户身份只取 STOMP `Principal`，不接收客户端传来的 `userId/username`。
2. 支付服务不直接依赖 WebSocket Controller，而是发布 `OrderPaidEvent`。
3. Redis 只负责跨实例实时广播；重要业务事实仍由 RocketMQ/数据库保存，不能把 Pub/Sub 当可靠消息队列。

## 一、补充依赖

`E:\CourseMall\mall-realtime\pom.xml` 增加：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>2.3.1</version>
</dependency>
```

给 `MallRealtimeApplication` 增加 `@EnableFeignClients`。新建
`E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\client\CourseAccessClient.java`：

```java
package com.mall.realtime.client;

import com.mall.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "mall-course", path = "/internal/courses")
public interface CourseAccessClient {
    @GetMapping("/{courseId}/chat-access")
    Result<Boolean> canJoinChat(
            @PathVariable Long courseId,
            @RequestParam Long userId);
}
```

`E:\CourseMall\mall-realtime\src\main\resources\application.yml` 增加：

```yaml
spring:
  data:
    redis:
      host: ${REDIS_HOST:127.0.0.1}
      port: ${REDIS_PORT:6379}

rocketmq:
  name-server: ${ROCKETMQ_NAME_SERVER:127.0.0.1:9876}
  consumer:
    group: mall-realtime
```

## 二、聊天室请求与响应模型

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\chat\ChatSendRequest.java`：

```java
package com.mall.realtime.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ChatSendRequest(
        @NotBlank(message = "{validation.live.content.not-blank}")
        @Size(max = 200, message = "{validation.live.content.size}")
        String content) {
}
```

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\chat\ChatMessage.java`：

```java
package com.mall.realtime.chat;

import java.time.Instant;

public record ChatMessage(
        String messageId,
        Long courseId,
        Long userId,
        String username,
        String content,
        Instant sentAt) {
}
```

请求只有 `content`。服务端根据目的地取得 `courseId`，根据 Principal 取得当前用户，再生成消息 ID 和时间；这能阻止客户端伪装成别人。

## 三、Redis 跨实例广播

### 步骤 1：统一广播信封

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\broker\RealtimeEnvelope.java`：

```java
package com.mall.realtime.broker;

import com.fasterxml.jackson.databind.JsonNode;

public record RealtimeEnvelope(TargetType type, String target, JsonNode body) {
    public enum TargetType {
        DESTINATION,
        USER
    }
}
```

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\broker\RealtimePublisher.java`：

```java
package com.mall.realtime.broker;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RealtimePublisher {
    public static final String CHANNEL = "mall:realtime:broadcast";

    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    public void broadcast(String destination, Object body) {
        publish(new RealtimeEnvelope(
                RealtimeEnvelope.TargetType.DESTINATION,
                destination,
                objectMapper.valueToTree(body)));
    }

    public void sendToUser(Long userId, String destination, Object body) {
        publish(new RealtimeEnvelope(
                RealtimeEnvelope.TargetType.USER,
                userId + "|" + destination,
                objectMapper.valueToTree(body)));
    }

    private void publish(RealtimeEnvelope envelope) {
        try {
            redisTemplate.convertAndSend(CHANNEL, objectMapper.writeValueAsString(envelope));
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Serialize realtime message failed", exception);
        }
    }
}
```

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\broker\RealtimeSubscriber.java`：

```java
package com.mall.realtime.broker;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class RealtimeSubscriber {
    private final ObjectMapper objectMapper;
    private final SimpMessagingTemplate messagingTemplate;

    public void onMessage(String json) {
        try {
            RealtimeEnvelope envelope = objectMapper.readValue(json, RealtimeEnvelope.class);
            if (envelope.type() == RealtimeEnvelope.TargetType.DESTINATION) {
                messagingTemplate.convertAndSend(envelope.target(), envelope.body());
                return;
            }
            String[] target = envelope.target().split("\\|", 2);
            messagingTemplate.convertAndSendToUser(target[0], target[1], envelope.body());
        } catch (JsonProcessingException | RuntimeException exception) {
            // Pub/Sub 无重试能力，至少记录 message 和堆栈，生产环境还要上报监控。
            log.error("Consume realtime Redis message failed", exception);
        }
    }
}
```

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\config\RedisPubSubConfig.java`：

```java
package com.mall.realtime.config;

import com.mall.realtime.broker.RealtimePublisher;
import com.mall.realtime.client.CourseAccessClient;
import com.mall.realtime.broker.RealtimeSubscriber;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.data.redis.listener.adapter.MessageListenerAdapter;
import org.springframework.data.redis.serializer.StringRedisSerializer;

@Configuration
@RequiredArgsConstructor
public class RedisPubSubConfig {
    private final RealtimeSubscriber subscriber;

    @Bean
    public MessageListenerAdapter realtimeListenerAdapter() {
        MessageListenerAdapter adapter = new MessageListenerAdapter(subscriber, "onMessage");
        adapter.setSerializer(new StringRedisSerializer());
        return adapter;
    }

    @Bean
    public RedisMessageListenerContainer realtimeListenerContainer(
            RedisConnectionFactory connectionFactory,
            MessageListenerAdapter realtimeListenerAdapter) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(connectionFactory);
        container.addMessageListener(
                realtimeListenerAdapter,
                new ChannelTopic(RealtimePublisher.CHANNEL));
        return container;
    }
}
```

每个实例都订阅相同 Redis channel。实例 A 发布一次，A/B/C 都收到并只向自己持有的连接推送，所以跨实例聊天室和点对点通知都能工作。

## 四、发送课程聊天消息

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\chat\ChatService.java`：

```java
package com.mall.realtime.chat;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.realtime.broker.RealtimePublisher;
import com.mall.realtime.security.StompPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ChatService {
    private final RealtimePublisher publisher;
    private final StringRedisTemplate redisTemplate;
    private final CourseAccessClient courseAccessClient;

    public void send(Long courseId, StompPrincipal principal, String rawContent) {
        if (!canJoin(courseId, principal.userId())) {
            throw new BizException(ErrorCode.COURSE_NOT_PURCHASED);
        }
        String rateKey = "live:chat:rate:" + courseId + ":" + principal.userId();
        Boolean first = redisTemplate.opsForValue().setIfAbsent(
                rateKey, "1", Duration.ofSeconds(1));
        if (!Boolean.TRUE.equals(first)) {
            throw new BizException(ErrorCode.LIVE_MESSAGE_TOO_FREQUENT);
        }

        ChatMessage message = new ChatMessage(
                UUID.randomUUID().toString(),
                courseId,
                principal.userId(),
                principal.username(),
                rawContent.trim(),
                Instant.now());
        publisher.broadcast("/topic/courses/" + courseId + "/chat", message);
    }

    private boolean canJoin(Long courseId, Long userId) {
        com.mall.common.result.Result<Boolean> result =
                courseAccessClient.canJoinChat(courseId, userId);
        return result != null && Boolean.TRUE.equals(result.getData());
    }
}
```

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\chat\ChatMessageController.java`：

```java
package com.mall.realtime.chat;

import com.mall.realtime.security.StompPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class ChatMessageController {
    private final ChatService chatService;

    @MessageMapping("/courses/{courseId}/chat")
    public void send(
            @DestinationVariable Long courseId,
            @Valid ChatSendRequest request,
            Principal principal) {
        chatService.send(courseId, (StompPrincipal) principal, request.content());
    }
}
```

发送目的地是 `/app/courses/1/chat`，订阅目的地是 `/topic/courses/1/chat`。SEND 已在
`ChatService` 校验；SUBSCRIBE 再加一个入站拦截器，避免未购买用户偷听：

```java
package com.mall.realtime.security;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.realtime.client.CourseAccessClient;
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
public class SubscriptionAuthorizationInterceptor implements ChannelInterceptor {
    private static final Pattern COURSE_CHAT =
            Pattern.compile("^/topic/courses/(\\d+)/chat$");

    private final CourseAccessClient courseAccessClient;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(
                message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() != StompCommand.SUBSCRIBE) {
            return message;
        }
        String destination = accessor.getDestination();
        if (destination == null) {
            throw new BizException(ErrorCode.PARAM_ERROR);
        }
        Matcher matcher = COURSE_CHAT.matcher(destination);
        if (!matcher.matches()) {
            return message;
        }
        if (!(accessor.getUser() instanceof StompPrincipal user)) {
            throw new BizException(ErrorCode.UNAUTHORIZED);
        }
        Long courseId = Long.valueOf(matcher.group(1));
        Result<Boolean> access = courseAccessClient.canJoinChat(courseId, user.userId());
        if (access == null || !Boolean.TRUE.equals(access.getData())) {
            throw new BizException(ErrorCode.COURSE_NOT_PURCHASED);
        }
        return message;
    }
}
```

把它注入 Day31 的 `WebSocketConfig`，然后注册为第二个拦截器：

```java
registration.interceptors(
        authChannelInterceptor,
        subscriptionAuthorizationInterceptor);
```

### STOMP 异常回给当前连接

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\chat\StompExceptionHandler.java`：

```java
package com.mall.realtime.chat;

import com.mall.common.exception.BizException;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.stereotype.Controller;

@Controller
public class StompExceptionHandler {
    @MessageExceptionHandler(BizException.class)
    @SendToUser(destinations = "/queue/errors", broadcast = false)
    public StompErrorMessage handleBizException(BizException exception) {
        return new StompErrorMessage(
                exception.getErrorCode().getCode(),
                exception.getErrorCode().getMessageKey());
    }

    public record StompErrorMessage(Integer code, String messageKey) {
    }
}
```

REST 的 `ResultMessageAdvice` 不处理 STOMP 消息，因此 STOMP 要有自己的错误帧约定；前端收到 `messageKey` 后可本地翻译，或后续注入 `MessageSource` 在服务端解析。

## 五、支付成功后推送订单状态

### 步骤 1：公共事件模型

新建 `E:\CourseMall\mall-common\src\main\java\com\mall\common\event\OrderPaidEvent.java`：

```java
package com.mall.common.event;

import java.time.Instant;

public record OrderPaidEvent(
        String eventId,
        Long orderId,
        String orderNo,
        Long userId,
        Instant paidAt) {
}
```

Day22 已经要求支付成功后发 RocketMQ。把原来的事件模型统一为这个 record，并确保消息在支付事务提交后发送；生产项目用 Outbox/事务消息解决“数据库成功但 MQ 发送失败”。

### 步骤 2：实时服务消费可靠事件，再转成本地实时广播

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\order\OrderPaidConsumer.java`：

```java
package com.mall.realtime.order;

import com.mall.common.event.OrderPaidEvent;
import com.mall.realtime.broker.RealtimePublisher;
import lombok.RequiredArgsConstructor;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@RocketMQMessageListener(
        topic = "order-paid",
        consumerGroup = "realtime-order-notify")
public class OrderPaidConsumer implements RocketMQListener<OrderPaidEvent> {
    private final RealtimePublisher publisher;

    @Override
    public void onMessage(OrderPaidEvent event) {
        publisher.sendToUser(
                event.userId(),
                "/queue/orders",
                new OrderStatusMessage(
                        event.eventId(),
                        event.orderId(),
                        event.orderNo(),
                        "PAID",
                        event.paidAt()));
    }
}
```

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\order\OrderStatusMessage.java`：

```java
package com.mall.realtime.order;

import java.time.Instant;

public record OrderStatusMessage(
        String eventId,
        Long orderId,
        String orderNo,
        String status,
        Instant occurredAt) {
}
```

前端订阅固定地址 `/user/queue/orders`。服务端使用当前连接的 `Principal.name=userId` 路由，不能让前端订阅 `/topic/user/123` 这种可猜路径。

## 六、前端联调

```javascript
client.onConnect = () => {
  client.subscribe('/topic/courses/1/chat', frame => {
    console.log('chat', JSON.parse(frame.body));
  });
  client.subscribe('/user/queue/orders', frame => {
    console.log('order', JSON.parse(frame.body));
  });
  client.subscribe('/user/queue/errors', frame => {
    console.warn('stomp error', JSON.parse(frame.body));
  });

  client.publish({
    destination: '/app/courses/1/chat',
    body: JSON.stringify({ content: '这门课讲得很清楚' }),
  });
};
```

集群验证：启动两个 `mall-realtime` 实例（不同端口、同服务名），分别直连一个客户端；A 发聊天，A/B 都收到。触发一次支付成功事件，目标用户只收到一条订单通知。Redis 停止后应记录广播失败，RocketMQ 消息可以重试，但 Redis Pub/Sub 期间的聊天消息不会补发——这是它与 MQ 的本质区别。

::: tip 💡 面试题：Redis Pub/Sub 为什么不能替代 RocketMQ？
**一句话**：Pub/Sub 不持久化、订阅者离线就丢消息，也没有消费确认和重试；适合允许丢失的在线广播。支付成功是重要业务事实，必须先进入可靠 MQ/Outbox，再转成尽力而为的 WebSocket 通知。
:::

## 七、知识点索引

| 知识点 | 本日实现 |
|---|---|
| 防身份伪造 | Principal 生成 userId/username |
| 输入校验与限频 | `@Valid` + Redis `SET NX EX` |
| 跨实例消息 | Redis Pub/Sub 扇出 |
| 可靠业务事件 | RocketMQ `OrderPaidEvent` |
| 点对点推送 | `convertAndSendToUser` + `/user/queue/orders` |

## 八、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 客户端无法伪造聊天用户身份：是 / 否
- [ ] 一秒内连续发送会收到限频错误：是 / 否
- [ ] 两个实时服务实例能互相收到聊天室广播：是 / 否
- [ ] 支付成功后只有目标用户收到订单通知：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：

## 九、我下次会追问的问题

1. 为什么不能让支付服务直接注入 `ChatController`？
2. Redis Pub/Sub 和 RocketMQ 在可靠性上有什么差别？
3. `/topic` 和 `/user/queue` 分别适合什么场景？
4. 为什么发送权限和订阅权限都要校验？
5. 两个实例使用同一个 RocketMQ consumer group，为什么仍要再经过 Redis 广播？
