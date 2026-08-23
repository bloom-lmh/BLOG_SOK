# Day 31 · WebSocket 基础（长连接 + STOMP + 实时在线人数）

> **今天目标**：把 WebSocket 集成到 Spring Boot 项目里，理解 HTTP 短连接和 WebSocket 长连接的本质区别，做一个「实时在线人数」功能。

## 一、前置条件

- 已完成 Day 01 ~ Day 30（至少到 Day 16 网关，能跑通基本接口）
- 了解 HTTP 协议基本概念

## 二、核心概念

### HTTP vs WebSocket

| | HTTP | WebSocket |
|---|---|---|
| 连接方式 | 请求-响应，用完即关 | 一次握手，持久连接 |
| 谁主动 | 只能客户端主动请求 | 服务器可以主动推送 |
| 协议 | HTTP/HTTPS | ws:// / wss:// |
| 适用场景 | 查询、表单提交 | 聊天、通知、实时数据 |

### 协议升级过程

```
客户端 → 服务器：HTTP 请求，带上特殊头
  GET /ws HTTP/1.1
  Upgrade: websocket
  Connection: Upgrade

服务器 → 客户端：HTTP 101 Switching Protocols
  HTTP/1.1 101 Switching Protocols
  Upgrade: websocket
  Connection: Upgrade

之后双方走 WebSocket 协议通信，不再走 HTTP
```

## 三、步骤

### 步骤 1：添加依赖

`mall-user/pom.xml`：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-websocket</artifactId>
</dependency>
```

### 步骤 2：WebSocket 配置类

`com/mall/user/config/WebSocketConfig.java`：

```java
package com.mall.user.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker  // 开启 STOMP 消息代理
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")           // WebSocket 连接端点
                .setAllowedOriginPatterns("*") // 允许跨域
                .withSockJS();                 // 降级兜底（浏览器不支持 WebSocket 时用 HTTP 轮询）
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // 客户端订阅的前缀（服务端 → 客户端推送消息的目标前缀）
        registry.enableSimpleBroker("/topic");  // 广播
        // 客户端发送消息的前缀（客户端 → 服务端）
        registry.setApplicationDestinationPrefixes("/app");
    }
}
```

### 步骤 3：在线人数统计

`com/mall/user/websocket/OnlineCounter.java`：

```java
package com.mall.user.websocket;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public class OnlineCounter {
    // AtomicInteger：原子操作，线程安全的自增/自减
    private static final AtomicInteger count = new AtomicInteger(0);

    public static void increment() {
        count.incrementAndGet();
    }

    public static void decrement() {
        count.decrementAndGet();
    }

    public static int get() {
        return count.get();
    }
}
```

### 步骤 4：连接事件监听

`com/mall/user/websocket/WebSocketEventListener.java`：

```java
package com.mall.user.websocket;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketEventListener {

    private final SimpMessagingTemplate messagingTemplate;
    // SimpMessagingTemplate：Spring 封装的消息发送工具，类似 JdbcTemplate 的思路

    @EventListener
    public void handleConnect(SessionConnectedEvent event) {
        OnlineCounter.increment();
        log.info("用户上线，当前在线：{}", OnlineCounter.get());
        // 向所有订阅了 /topic/online 的客户端广播最新在线人数
        messagingTemplate.convertAndSend("/topic/online", OnlineCounter.get());
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {
        OnlineCounter.decrement();
        log.info("用户下线，当前在线：{}", OnlineCounter.get());
        messagingTemplate.convertAndSend("/topic/online", OnlineCounter.get());
    }
}
```

### 步骤 5：测试接口

`com/mall/user/controller/WsTestController.java`：

```java
@RestController
@RequestMapping("/api/ws")
public class WsTestController {

    @GetMapping("/online")
    public Result<Integer> onlineCount() {
        return Result.ok(OnlineCounter.get());
    }
}
```

### 步骤 6：前端测试（浏览器控制台）

```javascript
// 连接 WebSocket
const socket = new SockJS('http://localhost:8080/ws');
const stompClient = Stomp.over(socket);

stompClient.connect({}, () => {
    console.log('已连接');

    // 订阅在线人数
    stompClient.subscribe('/topic/online', (msg) => {
        console.log('当前在线人数：', msg.body);
        document.getElementById('online-count').textContent = msg.body;
    });
});
```

::: tip 💡 面试题：WebSocket 和 HTTP 轮询有什么区别？
**一句话**：HTTP 轮询是客户端定期发请求问"有新消息吗"，大部分请求是空的浪费带宽；WebSocket 是长连接，服务器有新消息直接推，省带宽、延迟低。但 WebSocket 需要服务端维护连接状态，连接数多了有内存压力。
:::

::: tip 💡 面试题：WebSocket 连接建立后如何保持？心跳机制是什么？
**一句话**：WebSocket 协议自带 Ping/Pong 帧，客户端或服务端发 Ping，对方回 Pong，超时没收到就断开。STOMP 协议在此基础上加了应用层心跳，`client.send('\\n')` 定期发空帧。如果不做心跳，Nginx/负载均衡器可能因为超时把连接断开。
:::

## 四、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] WebSocket 配置成功，前端能连接：是 / 否
- [ ] 在线人数统计正确（多人连接/断开）：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：