# Day 26 · 集成测试、原生交互与 OpenAPI 契约

> **今天目标**：用少量稳定 E2E 覆盖登录—下单—支付—学习主链路，并让 Flutter DTO 与 Spring Boot OpenAPI 在 CI 中保持一致。

## 一、安装官方集成测试

```bash
flutter pub add --dev "integration_test:{sdk: flutter}"
```

目录：

```text
integration_test/
├─ login_test.dart
├─ purchase_flow_test.dart
└─ learning_flow_test.dart
```

官方 `integration_test` 可以运行完整 App，但不能直接控制系统权限弹窗、通知栏等原生 UI。需要这些能力时评估 Patrol，并把它限制在少量端到端用例。

## 二、让 App 可测试启动

```dart
Future<Widget> buildApp({
  required AppEnvironment environment,
  List<Override> overrides = const [],
}) async {
  return ProviderScope(
    overrides: [
      environmentProvider.overrideWithValue(environment),
      ...overrides,
    ],
    child: const CourseMallApp(),
  );
}
```

生产 main 调用它，集成测试也调用它。不要复制第二套 App 初始化代码。

## 三、登录集成测试

`integration_test/login_test.dart`：

```dart
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('user can login and open learning center', (tester) async {
    final app = await buildApp(
      environment: testEnvironment,
      overrides: [
        authRepositoryProvider.overrideWithValue(TestAuthRepository()),
      ],
    );
    await tester.pumpWidget(app);
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('tab.learning')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('login.page')), findsOneWidget);

    await tester.enterText(
      find.byKey(const Key('login.account')),
      'e2e_user@example.com',
    );
    await tester.enterText(
      find.byKey(const Key('login.password')),
      'TestPassword123!',
    );
    await tester.tap(find.byKey(const Key('login.submit')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('learning.page')), findsOneWidget);
  });
}
```

Key 使用业务语义且稳定，不依赖中文文本或 Widget 层级。

## 四、测试环境两种策略

### 策略 A：Fake 服务

优点：

- 快、确定；
- 可精确模拟超时、401、空数据；
- PR 每次运行。

缺点：不能发现真实序列化、网关和后端契约问题。

### 策略 B：staging 后端

优点：

- 覆盖真实 HTTP、数据库和服务；
- 能发现联调问题。

缺点：

- 数据污染、慢、易受外部系统影响。

推荐：

- PR：Unit + Widget + Fake 集成；
- 主分支/每日：staging 契约和主链路；
- 发版前：真实设备 + 支付沙箱 + 推送/Deep Link。

## 五、E2E 数据必须可重复

测试账号和数据规则：

- 专用账号，不用开发者个人账号；
- 每次用例创建唯一业务数据；
- 后端提供测试数据准备/清理机制；
- 支付只走沙箱；
- 幂等键每次用例可控；
- 测试失败也执行清理；
- 用例可并行，不依赖执行顺序。

禁止测试直接连接生产数据库。

## 六、主链路清单

最少覆盖：

1. 未登录 Deep Link → 登录 → 回原课程；
2. 搜索课程 → 详情 → 创建订单；
3. 重复点击/超时重试不产生重复订单；
4. 沙箱支付 → 服务端状态确认 → 学习中心出现课程；
5. 播放 → 上报进度 → 再进入能续播；
6. Refresh Token 过期 → 自动刷新；
7. 刷新失败 → 回登录且清理会话；
8. 断网缓存 → 恢复网络补发进度。

不要把所有分支塞进一个 20 分钟大用例；失败时难定位。

## 七、OpenAPI 作为接口事实源

Spring Boot 接入 springdoc-openapi，CI 导出：

```text
GET /v3/api-docs → contracts/course-mall-openapi.json
```

契约至少描述：

- 路径、方法、鉴权；
- 请求/响应 Schema；
- 必填、nullable、枚举；
- 分页和错误响应；
- 示例；
- 幂等 Header；
- 时间和金额格式。

流程：

```text
后端变更 Controller/DTO
 → 生成 OpenAPI
 → CI 对比契约
 → Flutter 生成/校验 DTO
 → 编译与契约测试
```

## 八、生成代码还是手写

可选择 OpenAPI Generator 生成 Dio Client，但要注意：

- 生成层只放 `data/generated`；
- 业务层依赖 Repository，不直接依赖生成 Client；
- 不手改生成文件；
- 锁定生成器版本和配置；
- 生成差异进入代码评审；
- 后端错误 envelope 的泛型支持要实测。

如果手写 Service，也要在 CI 用 JSON Schema/fixture 验证关键响应。架构边界保证未来能替换。

## 九、契约漂移检查

CI 规则：

1. 从当前后端构建生成 OpenAPI；
2. 与仓库基线比较；
3. 删除字段、收紧类型、修改枚举视为 breaking；
4. breaking change 必须升级 API 版本或先做兼容；
5. Flutter 用最新契约编译；
6. 对关键 fixture 反序列化。

移动端存在旧版本，后端不能假设所有用户立即升级。新增字段通常兼容，删除/改名通常不兼容。

::: tip 💡 面试题：为什么移动端比普通 Web 更强调接口向后兼容？
Web 发布后用户刷新就能获得新代码；移动端旧版本可能长期存在且升级受商店和用户控制。
:::

## 十、原生系统交互测试

需要真机/Patrol 覆盖：

- 通知权限允许/拒绝；
- 生物识别成功/取消/锁定；
- 相机与系统照片选择；
- 支付跳到外部 App 再回跳；
- Deep Link 冷启动；
- 横竖屏、后台恢复；
- 网络切换。

这些用例成本高，放夜间或发布流水线，不拖慢每个小提交。

## 十一、知识点索引

- integration_test 与 native UI 边界。
- 可测试 bootstrap、稳定 Key。
- Fake 环境与 staging 环境。
- OpenAPI、代码生成、契约漂移。
- 移动端 API 向后兼容。

## 十二、完成清单

- [ ] PR 可运行 Fake 集成测试
- [ ] staging 主链路有独立账号
- [ ] E2E 用例可重复、可清理
- [ ] OpenAPI 在 CI 生成并比较
- [ ] 原生能力有真机发版清单

## 十三、明天我会问你

1. Fake E2E 和 staging E2E 各能发现什么问题？
2. 为什么移动端接口删除字段风险很高？
3. integration_test 为什么不能覆盖所有系统弹窗？
