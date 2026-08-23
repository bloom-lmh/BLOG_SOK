# Day 17 · STOMP WebSocket、心跳、重连与消息去重

> **今天目标**：接入订单通知和课程聊天。实现鉴权、订阅释放、断线重连、消息去重，并理解单机 SimpleBroker 的边界。

## 一、移动端需要原生 WebSocket 端点

```bash
flutter pub add stomp_dart_client
```

当前 Java 后端若只有：

```java
registry.addEndpoint("/ws").withSockJS();
```

建议同时提供原生端点：

```java
@Override
public void registerStompEndpoints(StompEndpointRegistry registry) {
    registry.addEndpoint("/ws-native")
            .setAllowedOriginPatterns("https://m.coursemall.com");

    registry.addEndpoint("/ws")
            .setAllowedOriginPatterns("https://m.coursemall.com")
            .withSockJS();
}

@Override
public void configureMessageBroker(MessageBrokerRegistry registry) {
    registry.enableSimpleBroker("/topic", "/queue");
    registry.setApplicationDestinationPrefixes("/app");
    registry.setUserDestinationPrefix("/user");
}
```

SockJS 主要解决浏览器降级传输，Flutter 原生客户端直接使用 `ws/wss` 更简单。

## 二、消息模型

```json
{
  "messageId": "01J...",
  "type": "ORDER_STATUS_CHANGED",
  "occurredAt": "2026-08-23T20:30:00+08:00",
  "payload": {
    "orderNo": "CM20260823001",
    "status": "PAID"
  }
}
```

所有消息都有全局唯一 `messageId`、类型和发生时间。payload 按类型解析，未知类型记录后忽略，不让旧版 App 崩溃。

## 三、连接服务

`lib/core/realtime/realtime_service.dart`：

```dart
class RealtimeService {
  RealtimeService({
    required Uri wsBaseUrl,
    required TokenManager tokenManager,
    required void Function(RealtimeMessage) onMessage,
  })  : _wsBaseUrl = wsBaseUrl,
        _tokenManager = tokenManager,
        _onMessage = onMessage;

  final Uri _wsBaseUrl;
  final TokenManager _tokenManager;
  final void Function(RealtimeMessage) _onMessage;

  StompClient? _client;
  StompUnsubscribe? _unsubscribeNotifications;
  final _recentMessageIds = <String>{};

  Future<void> connect() async {
    if (_client?.connected == true) return;

    await _tokenManager.refreshIfNearExpiry();
    final token = _tokenManager.accessToken;
    if (token == null) return;

    final client = StompClient(
      config: StompConfig(
        url: _wsBaseUrl.resolve('/ws-native').toString(),
        stompConnectHeaders: {
          'Authorization': 'Bearer $token',
        },
        webSocketConnectHeaders: {
          'Authorization': 'Bearer $token',
        },
        reconnectDelay: const Duration(seconds: 5),
        heartbeatIncoming: const Duration(seconds: 10),
        heartbeatOutgoing: const Duration(seconds: 10),
        onConnect: _onConnect,
        onWebSocketError: (error) => logRealtimeError(error),
        onStompError: (frame) => logStompError(frame),
      ),
    );

    _client = client;
    client.activate();
  }

  void _onConnect(StompFrame frame) {
    _unsubscribeNotifications?.call();
    _unsubscribeNotifications = _client!.subscribe(
      destination: '/user/queue/notifications',
      callback: (frame) {
        final body = frame.body;
        if (body == null) return;

        final message = RealtimeMessage.fromJson(
          jsonDecode(body) as Map<String, dynamic>,
        );
        if (!_recentMessageIds.add(message.messageId)) return;
        if (_recentMessageIds.length > 500) {
          _recentMessageIds.remove(_recentMessageIds.first);
        }
        _onMessage(message);
      },
    );
  }

  void disconnect() {
    _unsubscribeNotifications?.call();
    _unsubscribeNotifications = null;
    _client?.deactivate();
    _client = null;
    _recentMessageIds.clear();
  }
}
```

具体 `StompUnsubscribe` 的签名以安装版本 API 为准；核心要求是每次重连先释放旧订阅，退出登录时彻底断开。

## 四、鉴权不能只在 CONNECT 时做

后端需要 ChannelInterceptor：

```java
@Override
public void configureClientInboundChannel(ChannelRegistration registration) {
    registration.interceptors(new ChannelInterceptor() {
        @Override
        public Message<?> preSend(Message<?> message, MessageChannel channel) {
            StompHeaderAccessor accessor =
                    MessageHeaderAccessor.getAccessor(
                            message, StompHeaderAccessor.class);

            if (StompCommand.CONNECT.equals(accessor.getCommand())) {
                String token = extractBearer(accessor);
                Authentication authentication = jwtService.authenticate(token);
                accessor.setUser(authentication);
            }
            return message;
        }
    });
}
```

除此之外：

- 订阅 `/user/queue/*` 由 Spring 用户目的地隔离；
- 发送聊天消息时校验课程权益；
- 不允许客户端自行订阅任意用户 ID；
- 限制消息大小、频率和目的地白名单；
- 文本内容做安全过滤和审计。

## 五、重连策略

固定 5 秒重连只是基础，生产推荐指数退避 + 随机抖动：

```text
1s, 2s, 4s, 8s, 16s, 30s ...
每次增加 0–30% jitter
```

原因：服务恢复时，如果十万客户端同一秒重连，会形成惊群。网络恢复或 App 回前台可立即尝试一次。

App 生命周期：

- `resumed`：会话有效时连接；
- `paused`：根据业务断开或降低活动；
- logout：立即断开并清理消息；
- Token 刷新后下次重连使用新 Token。

## 六、消息驱动缓存失效

订单通知到达时：

```dart
void handleRealtimeMessage(Ref ref, RealtimeMessage message) {
  switch (message.type) {
    case RealtimeMessageType.orderStatusChanged:
      final orderNo = message.orderNo;
      if (orderNo != null) {
        ref.invalidate(orderDetailProvider(orderNo));
        ref.invalidate(orderPageProvider);
      }
    case RealtimeMessageType.courseAnnouncement:
      ref.invalidate(courseAnnouncementProvider);
    case RealtimeMessageType.unknown:
      break;
  }
}
```

实时消息只告诉 App“有变化”，详情仍通过 HTTP 查询。这能减少消息 payload、统一权限校验，并应对漏消息。

::: tip 💡 面试题：为什么收到订单已支付消息后还要查 HTTP？
WebSocket 消息可能重复、乱序、过期或被伪造；HTTP 查询服务端当前状态，作为最终展示依据。
:::

## 七、聊天的额外要求

- 客户端生成 `clientMessageId`，重发时服务端幂等；
- 服务端生成最终 `messageId` 和时间；
- 发送中、成功、失败状态可见；
- 历史消息走 HTTP 分页，WebSocket 只传增量；
- 断线重连按最后游标补拉；
- 图片先上传获得资源 ID，再发送消息；
- 敏感词、举报、拉黑和审计由服务端处理。

## 八、SimpleBroker 的边界

Spring `enableSimpleBroker` 适合单实例学习和小规模项目：

- 消息在进程内；
- 多实例之间不共享订阅；
- 服务重启消息丢失；
- 背压和监控能力有限。

生产集群可使用 STOMP Broker Relay（RabbitMQ/ActiveMQ）或独立消息系统，并配合负载均衡、会话路由和消息持久化。

## 九、知识点索引

- WebSocket、STOMP、SockJS 的关系。
- 心跳、重连、指数退避和 jitter。
- 用户目的地、ChannelInterceptor。
- 消息去重、乱序和补拉。
- 单机 Broker 与集群 Broker。

## 十、完成清单

- [ ] Flutter 连接原生 `wss` 端点
- [ ] CONNECT 和订阅均有服务端鉴权
- [ ] 重连不会产生重复订阅
- [ ] messageId 能去重
- [ ] 收到消息后以 HTTP 状态为准

## 十一、明天我会问你

1. SockJS、WebSocket、STOMP 分别是什么？
2. 为什么重连需要指数退避和 jitter？
3. SimpleBroker 部署多实例会有什么问题？
