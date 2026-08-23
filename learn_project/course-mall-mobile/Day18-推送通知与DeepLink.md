# Day 18 · 推送通知、前后台处理与安全 Deep Link

> **今天目标**：接入订单和课程通知，覆盖权限申请、设备 Token 注册、前后台展示、点击跳转和 Token 生命周期。

## 一、推送架构

```text
业务事件 → Java 通知服务 → FCM/APNs/厂商通道
                         → 设备系统通知
                         → App 点击 Deep Link
                         → HTTP 获取最新业务数据
```

海外/标准 Android 可用 Firebase Cloud Messaging；中国大陆 Android 生产环境通常还要抽象华为、小米、OPPO、vivo 等厂商通道。App 与后端使用统一“设备安装”模型，渠道实现可替换。

## 二、依赖和平台配置

```bash
flutter pub add firebase_core firebase_messaging flutter_local_notifications
```

还需：

- Android 配置 Firebase/厂商服务文件和通知权限；
- iOS 开启 Push Notifications、Background Modes，并配置 APNs；
- 真实设备测试，iOS 模拟器能力有限；
- dev/staging/prod 使用不同推送项目，避免测试消息发到生产用户。

## 三、后台入口必须是顶层函数

`lib/core/notifications/push_bootstrap.dart`：

```dart
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(
  RemoteMessage message,
) async {
  await Firebase.initializeApp();
  // 这里只做短小、幂等工作；不能依赖现有 Widget 树。
}

Future<void> initializePush() async {
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(
    firebaseMessagingBackgroundHandler,
  );
}
```

后台 isolate 与主 isolate 不共享普通内存状态。复杂业务留到 App 启动后通过 HTTP 同步。

## 四、权限申请要有时机

不要 App 第一次打开就无解释弹权限。用户完成登录或开启“订单提醒”时先展示用途，再请求：

```dart
Future<bool> requestPushPermission() async {
  final settings = await FirebaseMessaging.instance.requestPermission(
    alert: true,
    badge: true,
    sound: true,
    provisional: false,
  );

  return settings.authorizationStatus ==
          AuthorizationStatus.authorized ||
      settings.authorizationStatus ==
          AuthorizationStatus.provisional;
}
```

拒绝后不要反复骚扰；提供设置页入口和站内消息兜底。

## 五、设备安装注册

后端接口：

```http
PUT /api/devices/{installationId}

{
  "pushToken": "...",
  "platform": "ANDROID",
  "channel": "FCM",
  "appVersion": "1.0.0",
  "locale": "zh-CN",
  "timezone": "Asia/Shanghai"
}
```

`installationId` 是 App 安装级随机 ID，不使用 IMEI 等硬件标识。

```dart
class PushTokenRegistrar {
  PushTokenRegistrar(this._messaging, this._deviceRepository);

  final FirebaseMessaging _messaging;
  final DeviceRepository _deviceRepository;
  StreamSubscription<String>? _refreshSubscription;

  Future<void> start() async {
    final token = await _messaging.getToken();
    if (token != null) {
      await _deviceRepository.registerPushToken(token);
    }

    _refreshSubscription = _messaging.onTokenRefresh.listen(
      _deviceRepository.registerPushToken,
    );
  }

  Future<void> stop() async {
    await _refreshSubscription?.cancel();
    _refreshSubscription = null;
    await _deviceRepository.deactivateCurrentInstallation();
  }
}
```

Token 会轮换，必须监听更新。退出登录时解绑“用户—安装”关系；是否删除渠道 Token 取决于匿名通知策略。

## 六、前台、后台、冷启动

```dart
class PushCoordinator {
  PushCoordinator({
    required FlutterLocalNotificationsPlugin localNotifications,
    required GoRouter router,
  })  : _localNotifications = localNotifications,
        _router = router;

  final FlutterLocalNotificationsPlugin _localNotifications;
  final GoRouter _router;

  Future<void> start() async {
    FirebaseMessaging.onMessage.listen(_showForegroundNotification);
    FirebaseMessaging.onMessageOpenedApp.listen(_openMessage);

    final initial =
        await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) {
      _openMessage(initial);
    }
  }

  Future<void> _showForegroundNotification(RemoteMessage message) async {
    // Android 需要预先创建 high_importance_channel。
    await _localNotifications.show(
      message.messageId.hashCode,
      message.notification?.title ?? 'CourseMall',
      message.notification?.body ?? '你有一条新消息',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'important',
          '重要通知',
          channelDescription: '订单、退款和课程变更',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      ),
      payload: message.data['route']?.toString(),
    );
  }

  void _openMessage(RemoteMessage message) {
    final route = safePushRoute(message.data);
    if (route != null) _router.push(route);
  }
}
```

本地通知插件的点击回调也调用同一个 `safePushRoute`，避免两套跳转规则。

## 七、推送路由白名单

不要让服务端 payload 直接成为任意路由：

```dart
String? safePushRoute(Map<String, dynamic> data) {
  final type = data['type'];
  return switch (type) {
    'ORDER_CHANGED' => _orderRoute(data['orderNo']),
    'COURSE_ANNOUNCEMENT' => _courseRoute(data['courseId']),
    _ => null,
  };
}

String? _orderRoute(Object? raw) {
  final orderNo = raw?.toString() ?? '';
  return RegExp(r'^[A-Z0-9-]{8,40}$').hasMatch(orderNo)
      ? '/orders/$orderNo'
      : null;
}

String? _courseRoute(Object? raw) {
  final id = int.tryParse(raw?.toString() ?? '');
  return id != null && id > 0 ? '/course/$id' : null;
}
```

打开受保护页面时仍经过登录守卫，进入后通过 HTTP 校验资源归属。

::: tip 💡 面试题：推送 payload 为什么不能携带完整订单详情？
系统通知和第三方推送链路可能暴露内容，且 payload 会过期；只传最小类型和 ID，打开后再安全查询。
:::

## 八、通知内容与隐私

- 锁屏内容避免显示完整课程消费、金额或私密聊天；
- 提供“隐藏通知详情”设置；
- 不用公共 Topic 推送某个用户的订单；
- 服务端按用户和安装记录定向发送；
- 无效 Token 由发送回执自动清理；
- 同一事件带 eventId，避免多通道重复展示；
- 勿把 Push 当可靠消息队列，重要状态始终可在 App 内查询。

## 九、知识点索引

- APNs、FCM、厂商推送和设备安装模型。
- 前台、后台、终止态消息。
- 后台 isolate。
- Token 轮换、解绑和无效 Token 清理。
- Deep Link 白名单与最小 payload。

## 十、完成清单

- [ ] 权限在合理场景申请且有解释
- [ ] 推送 Token 注册并监听轮换
- [ ] 前台通知和点击回调可用
- [ ] 冷启动能进入正确页面
- [ ] payload 不含敏感详情且路由有白名单

## 十一、明天我会问你

1. 为什么推送 Token 需要更新接口？
2. 后台 handler 为什么不能直接操作现有 Widget？
3. 推送为什么不能替代可靠的站内状态查询？
