# Day 31 · WebSocket 基础（独立实时服务 + STOMP + JWT）

> **今天目标**：新增独立的 `mall-realtime:8087`，通过 STOMP `CONNECT` 帧认证商城 JWT，完成可验证的在线连接统计。WebSocket 不再塞进 `mall-user`，用户服务只负责身份与令牌。

本日项目根目录统一为 `E:\CourseMall`。下面每段代码都给出完整路径；先直连 `8087` 验证，再接入 Day16 的 Gateway。

## 一、先理解三层关系

| 层 | 作用 | 本项目中的例子 |
|---|---|---|
| WebSocket | 全双工长连接协议 | `ws://localhost:8087/ws` |
| STOMP | 约定消息目的地、订阅和帧格式 | `/app/**`、`/topic/**`、`/user/**` |
| Spring Messaging | 把 STOMP 帧分发到 Java 方法 | `@MessageMapping`、`SimpMessagingTemplate` |

HTTP 只负责第一次 Upgrade 握手；升级成功后，同一条 TCP 连接上交换 WebSocket 帧。浏览器 WebSocket API 不能给握手随意增加 `Authorization` Header，因此本项目把 JWT 放在 STOMP `CONNECT` 帧中，并在 `ChannelInterceptor` 校验。

::: tip 💡 面试题：为什么不能只在 HTTP JWT Filter 中认证 WebSocket？
**一句话**：HTTP Filter 只处理握手请求，后续 STOMP 消息不会再次经过 Servlet Filter；连接身份必须在 `CONNECT` 帧校验并绑定为 `Principal`，后续消息再从会话 Principal 取用户，不能相信客户端传来的 `userId`。
:::

## 二、新建 `mall-realtime` 模块

### 步骤 1：父工程和依赖

`E:\CourseMall\pom.xml` 的 `<modules>` 增加：

```xml
<module>mall-realtime</module>
```

新建 `E:\CourseMall\mall-realtime\pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.mall</groupId>
        <artifactId>course-mall</artifactId>
        <version>1.0.0</version>
    </parent>
    <artifactId>mall-realtime</artifactId>
    <dependencies>
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-websocket</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-api</artifactId>
            <version>${jjwt.version}</version>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-impl</artifactId>
            <version>${jjwt.version}</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-jackson</artifactId>
            <version>${jjwt.version}</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <scope>provided</scope>
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

### 步骤 2：启动类与配置

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\MallRealtimeApplication.java`：

```java
package com.mall.realtime;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.mall")
public class MallRealtimeApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallRealtimeApplication.class, args);
    }
}
```

新建 `E:\CourseMall\mall-realtime\src\main\resources\application.yml`：

```yaml
server:
  port: 8087
spring:
  application:
    name: mall-realtime
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_ADDR:127.0.0.1:8848}
jwt:
  secret: ${JWT_SECRET}
mall:
  websocket:
    allowed-origins:
      - http://localhost:5173
```

### 步骤 3：WebSocket 属性和配置

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\config\WebSocketProperties.java`：

```java
package com.mall.realtime.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.List;

@ConfigurationProperties(prefix = "mall.websocket")
public record WebSocketProperties(List<String> allowedOrigins) {
    public WebSocketProperties {
        allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
    }
}
```

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\config\WebSocketConfig.java`：

```java
package com.mall.realtime.config;

import com.mall.realtime.security.StompAuthChannelInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
@RequiredArgsConstructor
@EnableConfigurationProperties(WebSocketProperties.class)
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {
    private final WebSocketProperties properties;
    private final StompAuthChannelInterceptor authChannelInterceptor;

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOrigins(properties.allowedOrigins().toArray(String[]::new));
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");
        registry.setUserDestinationPrefix("/user");
        // Day31 先用单机内存 Broker；Day32 再解决多实例广播。
        registry.enableSimpleBroker("/topic", "/queue");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authChannelInterceptor);
    }
}
```

没有加入 SockJS：CourseMall 的 Web 端与 Flutter 都支持原生 WebSocket，SockJS 会引入额外 HTTP 轮询路径和安全配置。只有确实需要兼容老旧浏览器时再加。

## 三、STOMP 连接认证

### 步骤 4：Principal 与 JWT 解析器

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\security\StompPrincipal.java`：

```java
package com.mall.realtime.security;

import java.security.Principal;
import java.util.List;

public record StompPrincipal(Long userId, String username, List<String> authorities)
        implements Principal {
    @Override
    public String getName() {
        // convertAndSendToUser 使用 Principal.name 定位用户。
        return userId.toString();
    }
}
```

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\security\AccessTokenParser.java`：

```java
package com.mall.realtime.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.List;

@Component
public class AccessTokenParser {
    private final SecretKey key;

    public AccessTokenParser(@Value("${jwt.secret}") String secret) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public StompPrincipal parse(String token) {
        Claims claims = Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload();
        List<?> rawAuthorities = claims.get("authorities", List.class);
        List<String> authorities = rawAuthorities == null
                ? List.of()
                : rawAuthorities.stream().map(String::valueOf).toList();
        return new StompPrincipal(Long.valueOf(claims.getSubject()),
                claims.get("username", String.class), authorities);
    }
}
```

### 步骤 5：拦截 CONNECT 帧

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\security\StompAuthChannelInterceptor.java`：

```java
package com.mall.realtime.security;

import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@RequiredArgsConstructor
public class StompAuthChannelInterceptor implements ChannelInterceptor {
    private final AccessTokenParser accessTokenParser;

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(
                message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() != StompCommand.CONNECT) {
            return message;
        }
        String authorization = accessor.getFirstNativeHeader(HttpHeaders.AUTHORIZATION);
        if (!StringUtils.hasText(authorization) || !authorization.startsWith("Bearer ")) {
            throw new BadCredentialsException("Missing access token");
        }
        try {
            accessor.setUser(accessTokenParser.parse(authorization.substring(7)));
            return message;
        } catch (JwtException | IllegalArgumentException exception) {
            throw new BadCredentialsException("Invalid access token", exception);
        }
    }
}
```

## 四、在线连接统计

### 步骤 6：会话注册表

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\presence\OnlineSessionRegistry.java`：

```java
package com.mall.realtime.presence;

import org.springframework.stereotype.Component;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class OnlineSessionRegistry {
    private final Map<String, Long> sessionUsers = new ConcurrentHashMap<>();
    private final Map<Long, Set<String>> userSessions = new ConcurrentHashMap<>();

    public void connect(String sessionId, Long userId) {
        if (sessionUsers.putIfAbsent(sessionId, userId) == null) {
            userSessions.computeIfAbsent(userId, ignored -> ConcurrentHashMap.newKeySet())
                    .add(sessionId);
        }
    }

    public void disconnect(String sessionId) {
        Long userId = sessionUsers.remove(sessionId);
        if (userId == null) {
            return;
        }
        userSessions.computeIfPresent(userId, (ignored, sessions) -> {
            sessions.remove(sessionId);
            return sessions.isEmpty() ? null : sessions;
        });
    }

    public int connectionCount() {
        return sessionUsers.size();
    }

    public int userCount() {
        return userSessions.size();
    }
}
```

使用 `sessionId` 去重，重复断开不会减成负数；同一用户开两个标签页时是 2 个连接、1 个在线用户。

### 步骤 7：监听连接与断开

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\presence\PresenceEventListener.java`：

```java
package com.mall.realtime.presence;

import com.mall.realtime.security.StompPrincipal;
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
public class PresenceEventListener {
    private final OnlineSessionRegistry registry;
    private final SimpMessagingTemplate messagingTemplate;

    @EventListener
    public void onConnected(SessionConnectedEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        if (accessor.getSessionId() != null && accessor.getUser() instanceof StompPrincipal user) {
            registry.connect(accessor.getSessionId(), user.userId());
            broadcast();
            log.info("STOMP connected: sessionId={}, userId={}",
                    accessor.getSessionId(), user.userId());
        }
    }

    @EventListener
    public void onDisconnected(SessionDisconnectEvent event) {
        registry.disconnect(event.getSessionId());
        broadcast();
        log.info("STOMP disconnected: sessionId={}", event.getSessionId());
    }

    private void broadcast() {
        messagingTemplate.convertAndSend("/topic/presence",
                new PresenceMessage(registry.userCount(), registry.connectionCount()));
    }

    public record PresenceMessage(int onlineUsers, int connections) {
    }
}
```

### 步骤 8：只开放握手路径

新建 `E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\config\RealtimeSecurityConfig.java`：

```java
package com.mall.realtime.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class RealtimeSecurityConfig {
    @Bean
    public SecurityFilterChain realtimeFilterChain(HttpSecurity http) throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/ws/**").permitAll()
                        .anyRequest().denyAll());
        return http.build();
    }
}
```

`permitAll()` 只允许完成握手，不代表匿名用户能建立 STOMP 会话；真正的身份校验发生在 CONNECT 拦截器。

## 五、接入 Gateway 并验证

`E:\CourseMall\mall-gateway\src\main\resources\application.yml` 的 routes 增加：

```yaml
- id: mall-realtime-ws
  uri: lb:ws://mall-realtime
  predicates:
    - Path=/ws/**
```

如果 Gateway 全局过滤器强制检查 HTTP `Authorization`，把 `/ws` 握手路径加入其公开路径；不能删除 `Upgrade`、`Connection`、`Sec-WebSocket-*` 头。

先登录取得 accessToken，再在已加载 `@stomp/stompjs` 的页面测试：

```javascript
const client = new StompJs.Client({
  brokerURL: 'ws://localhost:9000/ws',
  connectHeaders: { Authorization: `Bearer ${accessToken}` },
  reconnectDelay: 5000,
  heartbeatIncoming: 10000,
  heartbeatOutgoing: 10000,
});
client.onConnect = () => {
  client.subscribe('/topic/presence', frame => console.log(JSON.parse(frame.body)));
};
client.onStompError = frame => console.error(frame.headers.message);
client.activate();
```

验证顺序：一个用户开两个页面，应看到 `onlineUsers=1, connections=2`；关闭一个页面后变为 `1/1`；关闭全部页面后变为 `0/0`；把 token 改错应连接失败。

::: warning 当前边界
`OnlineSessionRegistry` 是单实例内存状态。Day31 的验收只启动一个 `mall-realtime`；Day32 再处理多实例广播和异常掉线。不要把单机数字冒充成集群在线人数。
:::

## 六、知识点索引

| 知识点 | 本日落点 |
|---|---|
| WebSocket Upgrade | `/ws` 首次 HTTP 握手 |
| STOMP 目的地 | `/app` 入站、`/topic` 广播、`/user` 点对点 |
| 身份绑定 | `CONNECT Authorization` → `StompPrincipal` |
| 线程安全 | `ConcurrentHashMap` + 幂等 session 注册 |
| 心跳与重连 | STOMP heartbeat + `reconnectDelay` |

## 七、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-realtime:8087` 已注册到 Nacos：是 / 否
- [ ] 正确 token 能连接、错误 token 被拒绝：是 / 否
- [ ] 同用户多标签页的用户数/连接数统计正确：是 / 否
- [ ] Gateway 的 `ws://localhost:9000/ws` 可连接：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：

## 八、我下次会追问的问题

1. WebSocket、STOMP、Spring Messaging 分别负责哪一层？
2. 为什么握手路径 `permitAll()` 仍然可以保证连接需要登录？
3. 为什么消息体里的 `userId` 不能作为当前用户？
4. `onlineUsers` 和 `connections` 为什么不是同一个数字？
5. 单机内存统计部署两个实例后会出现什么问题？
