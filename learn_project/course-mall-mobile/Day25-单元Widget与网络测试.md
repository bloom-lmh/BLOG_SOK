# Day 25 · 单元测试、Widget 测试与网络层测试

> **今天目标**：建立测试金字塔，覆盖校验器、Controller、Repository、异常映射和登录 UI。测试业务行为，不把快照数量当质量。

## 一、测试分层

| 类型 | 重点 | 数量 |
| --- | --- | --- |
| Unit | 校验、映射、状态机、UseCase | 最多 |
| Widget | 页面状态、交互、无障碍 | 较多 |
| Integration/E2E | 登录购买学习主链路 | 少而关键 |

执行：

```bash
flutter test
flutter test --coverage
```

依赖：

```bash
flutter pub add --dev mocktail http_mock_adapter
```

## 二、纯函数单元测试

`test/features/auth/auth_validators_test.dart`：

```dart
void main() {
  group('AuthValidators.account', () {
    test('accepts mainland mobile number', () {
      expect(AuthValidators.account('13800138000'), isNull);
    });

    test('accepts email and trims account', () {
      expect(AuthValidators.account(' user@example.com '), isNull);
    });

    test('rejects malformed input', () {
      expect(
        AuthValidators.account('abc'),
        equals('手机号或邮箱格式不正确'),
      );
    });
  });

  group('order status mapping', () {
    test('unknown backend value degrades safely', () {
      expect(
        parseOrderStatus('NEW_STATUS_FROM_FUTURE'),
        OrderStatusCode.unknown,
      );
    });
  });
}
```

测试命名表达条件和结果，不写 `test1/test2`。

## 三、Repository 映射测试

```dart
class MockCourseApiService extends Mock implements CourseApiService {}

void main() {
  late MockCourseApiService service;
  late CourseRepository repository;

  setUp(() {
    service = MockCourseApiService();
    repository = CourseRepositoryImpl(service);
  });

  test('maps DTO amount and nullable cover to domain model', () async {
    when(
      () => service.fetchPage(
        page: any(named: 'page'),
        size: any(named: 'size'),
        categoryId: any(named: 'categoryId'),
        keyword: any(named: 'keyword'),
      ),
    ).thenAnswer(
      (_) async => const CoursePageDto(
        records: [
          CourseSummaryDto(
            id: 12,
            title: 'Spring Boot',
            price: '99.00',
            sales: 100,
          ),
        ],
        current: 1,
        size: 20,
        total: 1,
        pages: 1,
      ),
    );

    final page = await repository.fetchPage(
      page: 1,
      pageSize: 20,
    );

    expect(page.items.single.id, 12);
    expect(page.items.single.priceText, '99.00');
    expect(page.items.single.coverUrl, isNull);
  });
}
```

Mock Service 是为了隔离映射逻辑。不要 mock 被测对象本身。

## 四、Riverpod Controller 测试

```dart
class FakeOrderRepository implements OrderRepository {
  var createCalls = 0;

  @override
  Future<Order> create({
    required PurchaseIntent intent,
    int? couponId,
  }) async {
    createCalls++;
    return Order(
      orderNo: 'CM001',
      status: OrderStatusCode.pendingPayment,
    );
  }

  // 其他方法按测试需要实现。
}

void main() {
  test('double submit while loading creates only one order', () async {
    final repository = FakeOrderRepository();
    final container = ProviderContainer(
      overrides: [
        orderRepositoryProvider.overrideWithValue(repository),
      ],
    );
    addTearDown(container.dispose);

    // 初始化 AsyncNotifier。
    await container.read(createOrderControllerProvider.future);

    final controller =
        container.read(createOrderControllerProvider.notifier);
    final quote = validQuote();

    final first = controller.submit(quote: quote);
    final second = controller.submit(quote: quote);
    await Future.wait([first, second]);

    expect(repository.createCalls, 1);
  });
}
```

更重要的测试是“超时重试复用相同幂等键”。让 Fake Repository 记录两次 `PurchaseIntent.idempotencyKey` 并断言相等。

::: tip 💡 面试题：Provider override 对测试有什么价值？
它允许不改生产代码就替换 Repository、时钟、环境等依赖，使测试快速、确定且不访问真实网络。
:::

## 五、Dio 网络测试

```dart
void main() {
  test('maps business failure to AppException', () async {
    final dio = Dio(
      BaseOptions(baseUrl: 'https://api.test'),
    );
    final adapter = DioAdapter(dio: dio);
    addAppInterceptors(dio);

    adapter.onGet(
      '/api/course/page',
      (server) => server.reply(
        200,
        {
          'code': 40001,
          'message': '课程不存在',
          'data': null,
          'traceId': 'trace-1',
        },
      ),
    );

    expect(
      () => dio.get<void>('/api/course/page'),
      throwsA(
        isA<DioException>().having(
          (error) => error.error,
          'mapped error',
          isA<AppException>().having(
            (error) => error.traceId,
            'traceId',
            'trace-1',
          ),
        ),
      ),
    );
  });
}
```

网络层至少测试：

- 200 + 业务失败；
- 401 刷新后重试；
- 并发 401 只 refresh 一次；
- refresh 失败退出；
- timeout/network 映射；
- CancelToken 不弹错误；
- 日志不记录 Authorization。

## 六、Widget 测试登录页

给重要控件稳定 Key：

```dart
const accountFieldKey = Key('login.account');
const passwordFieldKey = Key('login.password');
const submitButtonKey = Key('login.submit');
```

测试：

```dart
testWidgets('shows validation errors and does not submit', (tester) async {
  final repository = FakeAuthRepository();

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(repository),
      ],
      child: const MaterialApp(home: LoginPage()),
    ),
  );

  await tester.tap(find.byKey(submitButtonKey));
  await tester.pump();

  expect(find.text('请输入手机号或邮箱'), findsOneWidget);
  expect(find.text('请输入密码'), findsOneWidget);
  expect(repository.loginCalls, 0);
});

testWidgets('disables submit while request is pending', (tester) async {
  final repository = CompleterAuthRepository();
  await tester.pumpWidget(buildLoginTestApp(repository));

  await tester.enterText(
    find.byKey(accountFieldKey),
    'user@example.com',
  );
  await tester.enterText(find.byKey(passwordFieldKey), 'password123');
  await tester.tap(find.byKey(submitButtonKey));
  await tester.pump();

  final button = tester.widget<FilledButton>(
    find.byType(FilledButton),
  );
  expect(button.onPressed, isNull);
});
```

不要在每个测试都使用 `pumpAndSettle`。如果页面有无限动画，它会超时；明确 pump 所需时间更稳定。

## 七、插件测试

Secure Storage、local_auth、image_picker 等包含平台代码，普通 Unit/Widget 测试没有真实原生实现。

做法：

1. 业务代码依赖你定义的接口；
2. Unit 测试注入 Fake；
3. 插件适配层做少量平台通道 mock；
4. 真正原生行为放 Integration/真机测试。

```dart
abstract interface class BiometricAuthenticator {
  Future<bool> authenticate(String reason);
}
```

Controller 不直接 new `LocalAuthentication`，测试才能稳定覆盖成功、拒绝、异常。

## 八、Golden 测试的边界

Golden 适合稳定基础组件、主题和关键页面视觉回归；不适合：

- 动态时间；
- 网络图片；
- 不同平台字体未固定；
- 整个 App 每页都截一张。

先注入固定字体、Locale、屏幕尺寸和假数据。视觉变化必须人工审核更新，不执行“失败就自动覆盖基准图”。

## 九、覆盖率

覆盖率只是一种反馈：

- 关键订单/支付/Token 状态机要求高分支覆盖；
- DTO 样板或生成代码可排除；
- 100% 行覆盖仍可能没有有效断言；
- CI 可设置最低线，并防止新增代码显著下降；
- 更关注关键路径、边界值、失败和竞态。

## 十、知识点索引

- 测试金字塔、Fake/Mock/Stub。
- Provider override。
- WidgetTester、Finder、pump。
- Dio adapter 和异常映射。
- Golden 与覆盖率边界。

## 十一、完成清单

- [ ] 校验器和状态映射有 Unit 测试
- [ ] Token 并发刷新和订单幂等有测试
- [ ] 登录页成功、失败、Loading 有 Widget 测试
- [ ] 平台插件通过接口隔离
- [ ] CI 可生成覆盖率报告

## 十二、明天我会问你

1. Fake、Mock、真实实现分别适合什么测试？
2. 为什么行覆盖率 100% 仍不代表测试充分？
3. 为什么平台插件要先包一层自己的接口？
