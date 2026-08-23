# Day 27 · Sentry、结构化日志、TraceId 与产品埋点

> **今天目标**：让线上问题可发现、可定位、可关联版本。打通 Flutter 错误、HTTP traceId、用户操作面包屑和发布版本，同时保护隐私。

## 一、可观测性四类信号

| 信号 | 解决问题 |
| --- | --- |
| Crash/Error | 哪个版本在哪崩了 |
| Performance Trace | 哪个页面/请求慢 |
| Structured Log | 发生问题前后经过什么 |
| Product Analytics | 用户在哪一步流失 |

监控不是把所有数据上传。先定义用途、保留周期和脱敏规则。

## 二、初始化 Sentry

```bash
flutter pub add sentry_flutter
```

`lib/app/bootstrap.dart`：

```dart
Future<void> bootstrap({
  required AppEnvironment environment,
  required FutureOr<Widget> Function() builder,
}) async {
  WidgetsFlutterBinding.ensureInitialized();

  await SentryFlutter.init(
    (options) {
      options.dsn = environment.sentryDsn;
      options.environment = environment.flavor.name;
      options.release = environment.releaseName;
      options.tracesSampleRate =
          environment.flavor == AppFlavor.prod ? 0.1 : 1.0;
      options.sendDefaultPii = false;
      options.attachScreenshot = false;
      options.beforeSend = scrubSentryEvent;
    },
    appRunner: () async {
      final app = await builder();
      runApp(
        ProviderScope(
          overrides: [
            environmentProvider.overrideWithValue(environment),
          ],
          child: SentryWidget(child: app),
        ),
      );
    },
  );
}
```

Sentry Flutter SDK 已负责接入 Flutter 和当前 isolate 的主要错误入口，避免又手工捕获同一异常造成重复事件。自行创建的 isolate 需要单独注册错误监听。

DSN 不是服务端私钥，但仍通过环境配置管理。真正敏感的是 Sentry 管理 Token，只能放 CI。

## 三、错误边界和用户恢复

```dart
ErrorWidget.builder = (details) {
  return Material(
    child: AppErrorView(
      message: '页面出现异常，请重试',
      onRetry: () => appRestartOrNavigateHome(),
    ),
  );
};
```

不要向用户展示红屏、堆栈和文件路径。错误页要提供重试、返回首页或反馈入口。

手动捕获业务边界：

```dart
try {
  await paymentRepository.verify(paymentNo);
} catch (error, stack) {
  await Sentry.captureException(
    error,
    stackTrace: stack,
    withScope: (scope) {
      scope.setTag('feature', 'payment');
      scope.setContexts('payment', {
        'paymentNoSuffix': paymentNoSuffix(paymentNo),
      });
    },
  );
  rethrow;
}
```

不要把完整支付号、Token、手机号放 context。

## 四、用户关联但不发送 PII

```dart
Future<void> setObservabilityUser(CurrentUser user) {
  return Sentry.configureScope(
    (scope) => scope.setUser(
      SentryUser(id: stablePseudonymousId(user.id)),
    ),
  );
}

Future<void> clearObservabilityUser() {
  return Sentry.configureScope((scope) => scope.setUser(null));
}
```

退出时清除。内部 ID 也可先做稳定伪名化，取决于隐私要求。

## 五、前后端 TraceId 串联

App 每个请求添加 client request ID：

```dart
void onRequest(
  RequestOptions options,
  RequestInterceptorHandler handler,
) {
  options.headers['X-Request-Id'] = const Uuid().v4();
  handler.next(options);
}
```

网关/后端返回 `X-Trace-Id` 或响应 body `traceId`。异常中保留：

```dart
final traceId = response.headers.value('x-trace-id') ??
    body['traceId']?.toString();
```

用户反馈页展示“问题编号：traceId”，开发者可从：

```text
Sentry event
 → Flutter requestId/traceId
 → API Gateway
 → Spring Boot 日志
 → 数据库/MQ/支付日志
```

追踪完整链路。

::: tip 💡 面试题：requestId 和 traceId 有什么区别？
requestId 常标识单次请求；traceId 贯穿一个分布式调用链。实现中可由网关统一，也可同时保留。
:::

## 六、结构化 Logger

```dart
enum LogLevel { debug, info, warning, error }

abstract interface class AppLogger {
  void log(
    LogLevel level,
    String event, {
    Map<String, Object?> fields = const {},
    Object? error,
    StackTrace? stackTrace,
  });
}
```

调用：

```dart
logger.log(
  LogLevel.warning,
  'payment_verification_timeout',
  fields: {
    'attempt': attempt,
    'network': networkType,
    'traceId': traceId,
  },
);
```

事件名稳定、字段结构化。禁止字符串拼完整对象；Logger 内统一递归脱敏和生产级别过滤。

## 七、Breadcrumb

记录能帮助还原路径的低敏行为：

```dart
Sentry.addBreadcrumb(
  Breadcrumb(
    category: 'navigation',
    message: 'course_detail_opened',
    data: {'courseId': courseId},
    level: SentryLevel.info,
  ),
);
```

可以记录页面、网络状态变化、订单操作阶段；不要记录输入内容、聊天正文、搜索隐私词和完整 URL Query。

## 八、产品埋点

定义事件字典：

| 事件 | 关键属性 |
| --- | --- |
| `course_viewed` | courseId、source |
| `order_created` | courseId、couponUsed |
| `payment_started` | channel |
| `payment_verified` | result、latencyBucket |
| `lesson_started` | courseId、lessonId |
| `lesson_completed` | courseId、lessonId |

规则：

- 不把金额、手机号等随意发第三方；
- 服务端收入数据比客户端埋点权威；
- 事件有版本；
- 失败重试去重；
- 用户可按隐私政策选择；
- 开发/测试数据与生产隔离。

漏斗用于产品分析，订单数据库用于财务事实，二者不能混用。

## 九、告警

必须配置：

- 新版本 crash rate 异常；
- 登录失败率骤增；
- 支付验证失败/超时；
- API 5xx 和 P95 延迟；
- 视频播放错误率；
- Outbox 积压；
- 推送无效 Token 激增。

告警要有负责人、阈值、静默和处理手册，不能只发一个无人看的群。

## 十、发布符号

使用混淆时保留并上传：

- Flutter `--split-debug-info` 目录；
- Android mapping/native symbols；
- iOS dSYM；
- 精确 release 名和 build number；
- Git commit。

没有匹配符号，线上堆栈会失去可读性。

## 十一、知识点索引

- Crash、Trace、Log、Metric/Analytics。
- Sampling、Breadcrumb、Release Health。
- requestId、traceId 和分布式链路。
- PII 脱敏和数据最小化。
- Symbols、dSYM、混淆映射。

## 十二、完成清单

- [ ] dev/staging/prod 事件分环境
- [ ] 错误关联 release 和 commit
- [ ] 前后端可通过 traceId 串联
- [ ] Sentry/日志无敏感字段
- [ ] 支付、登录、视频有可执行告警

## 十三、明天我会问你

1. 为什么客户端埋点不能作为支付收入事实？
2. 混淆后为什么必须保存符号文件？
3. tracesSampleRate 为什么生产不一定设为 1？
