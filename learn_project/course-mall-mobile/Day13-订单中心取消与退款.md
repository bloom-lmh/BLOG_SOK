# Day 13 · 订单中心、状态映射、取消与退款

> **今天目标**：完成订单列表、详情、取消和退款入口。重点是状态前向兼容、并发状态变更和操作后的缓存一致性。

## 一、需要补齐的移动端接口

```http
GET  /api/orders?status=PENDING_PAYMENT&current=1&size=20
GET  /api/orders/{orderNo}
POST /api/orders/{orderNo}/cancel
POST /api/orders/{orderNo}/refund-applications
```

当前 `POST /api/order/cancel/{orderNo}` 可以保留兼容，但推荐资源化路径并统一复数命名。

所有接口从 JWT 获取当前用户，并确保订单属于该用户。知道订单号不等于有权查看订单。

## 二、状态映射要能接住未知值

```dart
enum OrderStatusCode {
  pendingPayment,
  paymentProcessing,
  paid,
  completed,
  cancelled,
  refunding,
  refunded,
  unknown,
}

OrderStatusCode parseOrderStatus(String raw) {
  return switch (raw) {
    'PENDING_PAYMENT' => OrderStatusCode.pendingPayment,
    'PAYMENT_PROCESSING' => OrderStatusCode.paymentProcessing,
    'PAID' => OrderStatusCode.paid,
    'COMPLETED' => OrderStatusCode.completed,
    'CANCELLED' => OrderStatusCode.cancelled,
    'REFUNDING' => OrderStatusCode.refunding,
    'REFUNDED' => OrderStatusCode.refunded,
    _ => OrderStatusCode.unknown,
  };
}

String orderStatusLabel(OrderStatusCode status) {
  return switch (status) {
    OrderStatusCode.pendingPayment => '待支付',
    OrderStatusCode.paymentProcessing => '支付确认中',
    OrderStatusCode.paid => '已支付',
    OrderStatusCode.completed => '已完成',
    OrderStatusCode.cancelled => '已取消',
    OrderStatusCode.refunding => '退款处理中',
    OrderStatusCode.refunded => '已退款',
    OrderStatusCode.unknown => '状态更新中',
  };
}
```

不要反序列化未知状态时直接崩溃。服务端可能先发布新状态，旧版 App 应安全降级并隐藏不确定操作。

::: tip 💡 面试题：为什么枚举要有 unknown？
移动端版本更新慢于服务端，后端新增枚举值时旧客户端仍需稳定运行，这叫前向兼容。
:::

## 三、订单列表查询键

```dart
typedef OrderPageQuery = ({
  OrderStatusCode? status,
  int page,
  int pageSize,
});

final orderPageProvider =
    FutureProvider.autoDispose.family<OrderPage, OrderPageQuery>(
  (ref, query) {
    return ref.watch(orderRepositoryProvider).fetchPage(
          status: query.status,
          page: query.page,
          pageSize: query.pageSize,
        );
  },
);

final orderDetailProvider =
    FutureProvider.autoDispose.family<Order, String>(
  (ref, orderNo) {
    if (!RegExp(r'^[A-Z0-9-]{8,40}$').hasMatch(orderNo)) {
      throw const FormatException('订单号格式不正确');
    }
    return ref.watch(orderRepositoryProvider).fetchDetail(orderNo);
  },
);
```

列表按状态分页，Tab 切换时每个状态有独立缓存键。具体无限分页结构复用 Day 09，不再复制一套不同逻辑。

## 四、操作权限由服务端返回

详情响应建议包含：

```json
{
  "orderNo": "CM20260823001",
  "status": "PENDING_PAYMENT",
  "payableAmount": "99.00",
  "expireAt": "2026-08-23T20:10:00+08:00",
  "actions": {
    "canPay": true,
    "canCancel": true,
    "canApplyRefund": false
  },
  "version": 3
}
```

客户端无需复制复杂业务规则，只根据 actions 显示按钮。服务端仍在执行时再次校验。

## 五、取消订单

```dart
Future<void> cancelOrder({
  required String orderNo,
  required int version,
  required String reason,
}) async {
  await _dio.post<void>(
    '/api/orders/$orderNo/cancel',
    data: {
      'reason': reason,
      'version': version,
    },
    options: Options(
      headers: {'Idempotency-Key': const Uuid().v4()},
    ),
  );
}
```

`version` 用于乐观锁。用户点击取消的同时支付回调可能把订单改为已支付，后端执行类似：

```sql
UPDATE orders
SET status = 'CANCELLED', version = version + 1
WHERE order_no = ?
  AND user_id = ?
  AND status = 'PENDING_PAYMENT'
  AND version = ?;
```

影响行数为 0 时重新查询订单，并提示“订单状态已变化”。

操作成功后：

```dart
ref.invalidate(orderDetailProvider(orderNo));
ref.invalidate(orderPageProvider);
```

不做“强制本地改状态”的乐观更新，因为支付/退款状态存在服务端并发事件。

## 六、支付倒计时

倒计时只用于展示：

```dart
Duration remaining(DateTime serverExpireAt, Duration serverClockOffset) {
  final estimatedServerNow = DateTime.now().toUtc().add(serverClockOffset);
  final value = serverExpireAt.toUtc().difference(estimatedServerNow);
  return value.isNegative ? Duration.zero : value;
}
```

可从响应 `Date` Header 估算客户端与服务端时钟偏差。倒计时归零后重新查询，不能由客户端直接把订单改为取消。

## 七、退款申请

退款不是“把状态改为 REFUNDED”，而是一条独立申请：

```http
POST /api/orders/{orderNo}/refund-applications
Idempotency-Key: ...

{
  "reasonCode": "COURSE_NOT_EXPECTED",
  "description": "课程内容与预期不符"
}
```

服务端流程：

1. 校验订单归属、支付状态和退款规则；
2. 创建退款申请；
3. 调用支付渠道退款；
4. 接收异步回调；
5. 更新退款单和订单；
6. 根据规则撤销课程权益；
7. 记录完整审计。

App 展示“申请已提交”，不能在接口刚返回时显示“退款成功”。

## 八、订单列表隐私

- 截图、日志和埋点不要包含完整支付流水号；
- 页面进入后台可模糊敏感信息；
- 客服入口传内部关联 ID，不把完整对象塞第三方 SDK；
- 订单详情错误提示包含 traceId 即可，不暴露 SQL/网关信息。

## 九、知识点索引

- 状态机与前向兼容枚举。
- 乐观锁和支付回调并发。
- 服务端 action capability。
- 客户端时间与服务端时间。
- 退款单、异步回调与审计。

## 十、完成清单

- [ ] 订单 Tab 有独立分页状态
- [ ] 未知订单状态不会导致崩溃
- [ ] 取消请求带版本号且服务端条件更新
- [ ] 倒计时结束后重新查服务端
- [ ] 退款提交与退款成功明确区分

## 十一、明天我会问你

1. 订单状态为什么必须支持 unknown？
2. 支付和取消同时发生时，乐观锁如何保护状态？
3. 退款接口返回成功为什么不等于钱已经退回？
