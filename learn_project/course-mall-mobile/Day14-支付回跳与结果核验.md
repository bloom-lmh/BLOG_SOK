# Day 14 · 支付发起、App 回跳、轮询与结果核验

> **今天目标**：完成可演示的沙箱支付闭环，并理解生产支付为什么依赖服务端通知、签名验签和主动查询。客户端回跳永远不是支付成功凭证。

## 一、支付链路

```text
App 创建待支付订单
  → App 请求服务端创建支付单
  → 服务端调用支付渠道
  → App 打开渠道 App/收银台
  → 渠道异步通知服务端（权威）
  → 服务端验签、幂等更新支付单和订单
  → App 回跳后主动查询服务端
```

移动端只负责拉起和展示结果，不能持有商户私钥，也不能根据“回跳参数 success=true”开通课程。

## 二、创建支付单

```http
POST /api/payments
Authorization: Bearer ...
Idempotency-Key: ...

{
  "orderNo": "CM20260823001",
  "channel": "H5_SANDBOX",
  "returnUrl": "https://m.coursemall.com/payment/result"
}
```

返回：

```json
{
  "paymentNo": "PAY20260823009",
  "cashierUrl": "https://sandbox-pay.example.com/...",
  "expiresAt": "2026-08-23T20:10:00+08:00",
  "callbackState": "random-one-time-state"
}
```

后端再次从订单读取金额，不能接受 App 传金额。`callbackState` 绑定本次支付意图，用于降低伪造回跳和串单风险。

## 三、打开外部收银台

```bash
flutter pub add url_launcher
```

```dart
Future<void> openCashier(Uri cashierUrl) async {
  if (cashierUrl.scheme != 'https') {
    throw const AppException(
      kind: AppExceptionKind.business,
      message: '支付地址不安全',
    );
  }

  final opened = await launchUrl(
    cashierUrl,
    mode: LaunchMode.externalApplication,
  );
  if (!opened) {
    throw const AppException(
      kind: AppExceptionKind.business,
      message: '无法打开支付页面',
    );
  }
}
```

不要用任意 WebView 打开服务端下发的 URL。若业务必须内嵌 WebView，应严格限制域名、导航、JS Bridge 和文件访问。

## 四、回跳路由

Day 04 的 HTTPS App Link 增加：

```dart
GoRoute(
  path: '/payment/result',
  builder: (_, state) => PaymentResultPage(
    paymentNo: state.uri.queryParameters['paymentNo'],
    callbackState: state.uri.queryParameters['state'],
  ),
),
```

支付页启动前将 `paymentNo + callbackState` 与未完成支付意图关联保存。回跳后：

1. 校验参数格式；
2. 校验 state 与本地意图匹配；
3. **忽略回跳中的支付结果**；
4. 调服务端 `GET /api/payments/{paymentNo}`；
5. 根据服务端状态展示。

正常 Universal Link 让 `go_router` 统一接收即可。不要同时再注册另一个 Deep Link 插件处理同一链接，否则可能重复导航。

::: tip 💡 面试题：为什么支付回跳不能作为成功依据？
回跳发生在用户设备上，参数可伪造且可能丢失；权威结果应来自支付渠道对服务端的签名通知或服务端主动查询。
:::

## 五、支付状态

```dart
enum PaymentStatus {
  created,
  processing,
  succeeded,
  failed,
  closed,
  unknown,
}

bool isPaymentTerminal(PaymentStatus status) {
  return switch (status) {
    PaymentStatus.succeeded ||
    PaymentStatus.failed ||
    PaymentStatus.closed =>
      true,
    _ => false,
  };
}
```

支付成功后也可能需要短时间开通课程权益。服务端响应可同时返回：

```json
{
  "paymentStatus": "SUCCEEDED",
  "orderStatus": "PAID",
  "entitlementStatus": "GRANTING"
}
```

App 展示“支付成功，课程正在开通”，而不是直接猜测。

## 六、有限轮询

```dart
class PaymentVerifier {
  PaymentVerifier(this._repository);

  final PaymentRepository _repository;

  Future<PaymentResult> waitForResult(
    String paymentNo, {
    int maxAttempts = 8,
  }) async {
    var delay = const Duration(seconds: 1);

    for (var attempt = 0; attempt < maxAttempts; attempt++) {
      final result = await _repository.fetchResult(paymentNo);
      if (isPaymentTerminal(result.paymentStatus)) return result;

      await Future<void>.delayed(delay);
      final nextSeconds = (delay.inSeconds * 2).clamp(1, 8);
      delay = Duration(seconds: nextSeconds);
    }

    return _repository.fetchResult(paymentNo);
  }
}
```

限制次数并指数退避，避免每秒永久轰炸服务端。App 切后台时停止轮询，回前台立即查询一次：

```dart
@override
void didChangeAppLifecycleState(AppLifecycleState state) {
  if (state == AppLifecycleState.resumed) {
    ref.read(paymentResultProvider.notifier).verifyNow();
  }
}
```

Widget 需要实现 `WidgetsBindingObserver`，并在 dispose 时移除。

## 七、服务端回调处理

服务端必须：

1. 验证签名、商户号、应用 ID；
2. 比对订单号、支付金额和币种；
3. 以渠道交易号建立唯一约束；
4. 幂等处理重复通知；
5. 在事务中更新支付单和订单；
6. 通过 Outbox/MQ 开通课程权益；
7. 返回渠道要求的确认响应；
8. 定时对账补偿漏单。

伪代码：

```text
if callback already processed:
    return success
verify signature and amount
transaction:
    payment CREATED -> SUCCEEDED
    order PENDING_PAYMENT -> PAID
    append ENTITLEMENT_GRANT event
return success
```

## 八、模拟支付的边界

后端现有 `/api/pay/mock-success` 只允许：

- dev/staging 环境；
- 测试账号；
- 服务端鉴权；
- 与生产构建完全隔离；
- 审计日志可追踪。

生产配置中路由应不存在，而不是仅在 App 中隐藏按钮。

## 九、应用商店规则

在线课程属于数字内容，iOS/Android 不同商店和地区可能要求使用应用内购买。H5、微信或支付宝直付能否使用，必须在发布前核对当时的商店规则、地区政策和业务模式。不要把“技术上能拉起”当成“审核一定允许”。

## 十、知识点索引

- 支付单、订单、权益三种状态。
- Universal Link、自定义 scheme 和外部应用拉起。
- 异步通知、验签、幂等、主动查询。
- 指数退避轮询和 App 生命周期。
- 对账与补偿。

## 十一、完成清单

- [ ] App 不持有任何商户私钥
- [ ] 支付金额由服务端订单决定
- [ ] 回跳后只查询服务端，不信任回跳结果
- [ ] 轮询有限且切后台停止
- [ ] mock-success 无法进入生产环境

## 十二、明天我会问你

1. 支付回跳、支付回调、主动查询有什么区别？
2. 为什么支付成功和权益开通可能不是同一时刻？
3. 支付渠道重复通知时后端如何保证幂等？
