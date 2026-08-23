# Day 32 · WebSocket 实战（聊天室 + 订单状态推送）

> **今天目标**：在 Day31 的基础上做实两个功能：① 课程页实时聊天室；② 订单支付成功后的实时推送通知。同时理解「集群下 WebSocket 如何共享」这个面试高频问题。

## 一、前置条件

- 已完成 Day 31（WebSocket 基础能跑通）
- 订单支付流程已跑通（Day 12）

## 二、步骤

### 步骤 1：聊天室——客户端发消息，广播给房间内所有人

`com/mall/user/websocket/ChatController.java`：

```java
package com.mall.user.websocket;

import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
@RequiredArgsConstructor
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;

    // @MessageMapping：客户端发到 /app/chat/{courseId} 的消息被这里接收
    // @SendTo：返回值广播到 /topic/chat/{courseId}，订阅该课程的都能收到
    @MessageMapping("/chat/{courseId}")
    @SendTo("/topic/chat/{courseId}")
    public ChatMessage handleChat(@DestinationVariable Long courseId, ChatMessage message) {
        message.setTimestamp(System.currentTimeMillis());
        return message;
    }

    // 服务端主动推送（不经过客户端请求，如订单状态变更）
    public void pushOrderStatus(Long userId, String message) {
        // convertAndSendToUser：点对点推送，只发给指定用户
        messagingTemplate.convertAndSendToUser(
            String.valueOf(userId), "/queue/order", message
        );
    }
}
```

`com/mall/user/websocket/ChatMessage.java`：

```java
@Data
public class ChatMessage {
    private Long userId;
    private String username;
    private String content;
    private Long courseId;
    private Long timestamp;
}
```

### 步骤 2：订单状态实时推送

在支付回调成功的地方（`PaymentController`）调用：

```java
@RestController
@RequiredArgsConstructor
public class PaymentController {

    private final OrderService orderService;
    private final ChatController chatController;

    @PostMapping("/api/payment/callback")
    public Result<String> callback(@RequestBody PaymentCallbackDTO dto) {
        // 1. 处理支付回调（幂等校验、更新订单状态）
        orderService.handlePayment(dto);
        // 2. 实时推送通知：告诉该用户"你的订单已支付成功"
        Orders order = orderService.getByOrderNo(dto.getOrderNo());
        chatController.pushOrderStatus(order.getUserId(),
            "订单 " + order.getOrderNo() + " 已支付成功，即将开始学习！");
        return Result.ok("success");
    }
}
```

### 步骤 3：集群下 WebSocket 的问题

```
                     ┌─ Nginx ─┐
                     │          │
用户A ──WebSocket──► │  负载均衡  │
用户B ──WebSocket──► │          │
                     └─┬─────┬──┘
                       │     │
                  mall-user-1  mall-user-2
                  (A 连这里)    (B 连这里)
```

**问题：** 用户 A 连 `mall-user-1`，用户 B 连 `mall-user-2`，A 发的消息 `mall-user-2` 上的 B 收不到——因为 WebSocket 连接绑定在单台机器上。

**解决方案：**

| 方案 | 原理 | 适用场景 |
|---|---|---|
| **Redis 发布订阅** | 消息发到 Redis，所有实例订阅同一频道，收到后转发给各自连接的客户端 | 中小规模，Spring 自带 `BrokerRegistry` 支持 |
| **MQ 广播** | 消息发到 RabbitMQ/RocketMQ，所有实例消费广播消息 | 中大规模，已有 MQ 基础设施 |
| **IP Hash** | Nginx 根据用户 IP 路由到同一台机器 | 简单但不够可靠（机器挂了连接就丢了） |

::: tip 💡 面试题：集群下 WebSocket 怎么共享消息？
**一句话**：用 Redis 发布订阅或 MQ 做消息广播——每个实例既是消息的生产者也是消费者，本地收到的消息广播到中间件，其他实例消费后推给各自连接的客户端。Spring 的 `SimpMessagingTemplate` 可以配置 Redis 作为外部 Broker 替代内存 Broker。
:::

## 三、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 聊天室功能正常（不同用户在同课程页面能收到消息）：是 / 否
- [ ] 支付成功后前端收到推送通知：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：