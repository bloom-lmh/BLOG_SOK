# Day 12 · 订单确认、服务端计价与幂等创建

> **今天目标**：完成“确认订单 → 创建订单”流程。重点是服务端计价、幂等键和订单状态机，不能靠禁用按钮防重复下单。

## 一、先获取订单试算

确认页不要直接展示课程详情中的旧价格，进入页面时请求：

```http
POST /api/mobile/orders/quote
Content-Type: application/json

{
  "courseId": 12,
  "couponId": 88
}
```

响应：

```json
{
  "courseTitle": "Spring Boot 实战",
  "originalAmount": "199.00",
  "discountAmount": "100.00",
  "payableAmount": "99.00",
  "coupon": {"id": 88, "name": "新人券"},
  "quoteToken": "short-lived-signed-token",
  "expiresAt": "2026-08-23T20:00:00+08:00"
}
```

`quoteToken` 是短期服务端试算凭据。创建订单时服务端仍要校验价格、优惠适用性、课程状态和 Token 是否过期。

## 二、创建接口必须改造

当前后端若接收 `userId` 或 `amount`，需要改为：

```http
POST /api/orders
Authorization: Bearer ...
Idempotency-Key: 4aa...

{
  "courseId": 12,
  "couponId": 88,
  "quoteToken": "..."
}
```

后端从 JWT 获取用户 ID，重新计算金额，并对 `(user_id, idempotency_key)` 建唯一约束。同一个键重复请求必须返回同一个订单结果。

::: danger 不能信任客户端字段
`userId`、课程价格、优惠金额、支付状态都不能由客户端决定。客户端只提交购买意图。
:::

## 三、购买意图与幂等键

```bash
flutter pub add uuid
```

```dart
class PurchaseIntent {
  PurchaseIntent({
    required this.courseId,
    required this.quoteToken,
    String? idempotencyKey,
  }) : idempotencyKey = idempotencyKey ?? const Uuid().v4();

  final int courseId;
  final String quoteToken;
  final String idempotencyKey;
}
```

同一次用户购买意图的所有重试必须复用同一个 key。用户明确返回并重新发起购买，才创建新 key。Day 19 会把未完成意图持久化，支持 App 被杀后继续查询。

## 四、订单状态机

```text
PENDING_PAYMENT ──支付成功──> PAID ──开通权益──> COMPLETED
       │
       ├──用户取消/超时──> CANCELLED
       └──支付处理中──> PAYMENT_PROCESSING

PAID/COMPLETED ──申请退款──> REFUNDING ──成功──> REFUNDED
                                      └─失败──> 原状态/人工处理
```

状态跃迁由后端事务控制，App 只展示。支付回调、订单状态和学习权益必须最终一致。

## 五、Repository

```dart
abstract interface class OrderRepository {
  Future<OrderQuote> quote({
    required int courseId,
    int? couponId,
  });

  Future<Order> create({
    required PurchaseIntent intent,
    int? couponId,
  });
}

class OrderRepositoryImpl implements OrderRepository {
  OrderRepositoryImpl(this._dio);

  final Dio _dio;

  @override
  Future<Order> create({
    required PurchaseIntent intent,
    int? couponId,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/orders',
      data: {
        'courseId': intent.courseId,
        'couponId': couponId,
        'quoteToken': intent.quoteToken,
      },
      options: Options(
        headers: {'Idempotency-Key': intent.idempotencyKey},
      ),
    );
    return parseOrder(response.data!);
  }

  @override
  Future<OrderQuote> quote({
    required int courseId,
    int? couponId,
  }) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/mobile/orders/quote',
      data: {'courseId': courseId, 'couponId': couponId},
    );
    return parseOrderQuote(response.data!);
  }
}
```

网络超时意味着“结果未知”，不等于创建失败。重试同一个幂等键，或提供 `GET /api/orders/by-idempotency-key/{key}` 查询结果。

## 六、下单 Controller

```dart
class CreateOrderController extends AsyncNotifier<Order?> {
  PurchaseIntent? _intent;

  @override
  Future<Order?> build() async => null;

  Future<Order?> submit({
    required OrderQuote quote,
    int? couponId,
  }) async {
    if (state.isLoading) return null;
    if (quote.isExpired(DateTime.now())) {
      state = AsyncError(
        const AppException(
          kind: AppExceptionKind.business,
          message: '价格已过期，请重新确认',
        ),
        StackTrace.current,
      );
      return null;
    }

    _intent ??= PurchaseIntent(
      courseId: quote.courseId,
      quoteToken: quote.quoteToken,
    );

    state = const AsyncLoading();
    Order? created;
    state = await AsyncValue.guard(() async {
      created = await ref.read(orderRepositoryProvider).create(
            intent: _intent!,
            couponId: couponId,
          );
      return created;
    });
    return state.hasError ? null : created;
  }

  void startNewIntent() {
    _intent = null;
    state = const AsyncData(null);
  }
}

final createOrderControllerProvider =
    AsyncNotifierProvider<CreateOrderController, Order?>(
  CreateOrderController.new,
);
```

按钮 Loading 是体验防重；`Idempotency-Key` 才能覆盖双击、超时重试、代理重试和进程恢复。

## 七、确认页提交

```dart
Future<void> createOrder(
  BuildContext context,
  WidgetRef ref,
  OrderQuote quote,
) async {
  final order = await ref
      .read(createOrderControllerProvider.notifier)
      .submit(quote: quote, couponId: quote.coupon?.id);

  if (order == null || !context.mounted) return;

  ref.invalidate(orderListProvider);
  if (order.status == OrderStatusCode.pendingPayment) {
    context.replace('/pay/${order.orderNo}');
  } else {
    context.replace('/orders/${order.orderNo}');
  }
}
```

不要乐观显示“下单成功”。订单创建属于关键写操作，必须收到服务端确认。

## 八、后端事务与一致性

后端创建订单至少要在事务中完成：

1. 校验课程可售；
2. 判断用户是否已购买；
3. 校验优惠券与 quote；
4. 计算最终金额；
5. 插入订单；
6. 占用/核销优惠资格；
7. 写入 Outbox 事件（如需要异步处理）。

唯一约束建议：

- `UNIQUE(user_id, idempotency_key)`；
- 如果一门课程只能购买一次，再增加业务唯一性或幂等查询。

数据库事务不能包住第三方支付网络调用。先创建待支付订单，再单独发起支付。

::: tip 💡 面试题：为什么“请求超时”不能直接提示下单失败？
客户端没收到响应不代表服务端没成功提交。直接重新生成新键会产生重复订单，应使用原幂等键重试或查询。
:::

## 九、知识点索引

- 服务端计价与不可信客户端。
- 幂等键、唯一约束、结果未知。
- 订单状态机。
- 数据库事务与第三方调用边界。
- Outbox/最终一致性概念。

## 十、完成清单

- [ ] 确认页价格来自 quote 接口
- [ ] 创建请求不包含 userId 和客户端金额
- [ ] 同一次重试始终使用同一个幂等键
- [ ] 超时后能查询或幂等重试
- [ ] 后端有唯一约束兜底

## 十一、明天我会问你

1. 禁用按钮和幂等键分别解决什么问题？
2. 请求超时后为什么不能生成新幂等键立即重试？
3. 为什么不能把第三方支付请求包进数据库事务？
