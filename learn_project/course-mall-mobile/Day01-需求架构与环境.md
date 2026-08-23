# Day 01 · 需求、架构与 Flutter 环境

> **今天目标**：先把项目边界和工程骨架想清楚，再开始写页面。最终交付不是“能跑的 Demo”，而是一套可测试、可监控、可发布的课程商城移动端。

## 一、项目定位

移动端服务于 `course-mall` Java 后端，核心闭环是：

```text
注册/登录 → 浏览与搜索课程 → 查看详情 → 创建订单
→ 支付 → 获得课程权限 → 视频学习 → 上报进度
```

首期支持 Android、iOS，不把 Flutter Web 当作主要交付目标。后台管理仍适合 Web，移动端重点解决消费、支付、学习、通知等场景。

### 非功能目标

| 维度 | 项目目标 |
| --- | --- |
| 架构 | UI、状态、业务、数据访问分层，功能按 feature 隔离 |
| 稳定性 | 网络错误可恢复，关键操作幂等，异常可追踪 |
| 性能 | 列表滚动稳定，首屏和图片加载可度量 |
| 安全 | Token 安全存储，不在日志中打印敏感信息 |
| 质量 | 单元、Widget、集成测试覆盖主链路 |
| 交付 | dev/staging/prod 多环境，Android/iOS 可签名发布 |

::: tip 💡 面试题：为什么移动端不能直接复用后台管理网页？
后台管理和用户移动端的交互密度、权限模型、网络环境及设备能力都不同；强行复用通常会牺牲体验、安全与可维护性。
:::

## 二、技术基线

本系列以 **Flutter stable + Dart 3** 为基线。编写文档时 Flutter 官方文档对应 3.44.x；你实际创建项目时先执行：

```bash
flutter channel stable
flutter upgrade
flutter --version
dart --version
```

不要在团队里每个人随意升级。提交 `pubspec.lock`，CI 固定 Flutter 版本；升级单独开分支并完整回归。

核心选型：

| 能力 | 选择 | 原因 |
| --- | --- | --- |
| UI | Material 3 | 官方、可主题化、无障碍支持较好 |
| 状态与依赖注入 | Riverpod 3 | 类型安全、无需 BuildContext、便于测试 |
| 路由 | go_router | 官方维护，支持嵌套路由和 Deep Link |
| HTTP | Dio | 拦截器、取消、上传进度、超时能力完整 |
| DTO | json_serializable | 编译期生成，减少手写解析错误 |
| 本地数据库 | Drift/SQLite | 可查询、可迁移，适合离线数据和任务队列 |
| 安全存储 | flutter_secure_storage | 使用系统 Keychain/Keystore |
| 监控 | Sentry | Crash、错误、性能和版本关联 |

这里采用“**feature-first + 分层架构**”：

```text
View/Widget
    ↓ 事件                 ↑ 不可变 UI State
Controller/ViewModel（Riverpod）
    ↓
Repository（业务数据的唯一入口）
    ↓
Remote Service / Local Database / Secure Storage
```

它符合 Flutter 官方推荐的 View、ViewModel、Repository、Service 分工。只有订单、支付等复杂规则才增加 `domain/use_case`，不为简单 CRUD 机械套六层。

## 三、环境准备

需要安装：

- Flutter stable
- Android Studio（主要使用 Android SDK、模拟器和性能工具）
- JDK 17
- IntelliJ IDEA 或 VS Code 的 Flutter/Dart 插件
- Git
- 若构建 iOS：macOS、Xcode、CocoaPods

检查环境：

```bash
flutter doctor -v
flutter devices
```

`flutter doctor` 中 Android toolchain 和目标设备必须通过。Windows 不能本地编译 iOS，这是平台限制，不是 Flutter 配置错误。

## 四、由你创建项目

本系列只写教学文档，不替你生成项目。你在自己的项目目录执行：

```bash
flutter create --org com.coursemall --platforms=android,ios course_mall_mobile
cd course_mall_mobile
flutter run
```

建议最终包名：

- Android：`com.coursemall.app`
- iOS Bundle ID：`com.coursemall.app`

正式发布前再确定包名，因为应用上架后不能随意更换身份标识。

## 五、目录设计

先创建以下结构，后续每天往里面填：

```text
lib/
├─ main_dev.dart
├─ main_staging.dart
├─ main_prod.dart
├─ app/
│  ├─ bootstrap.dart
│  ├─ app.dart
│  ├─ config/
│  ├─ router/
│  └─ theme/
├─ core/
│  ├─ error/
│  ├─ network/
│  ├─ storage/
│  ├─ observability/
│  ├─ utils/
│  └─ widgets/
└─ features/
   ├─ auth/
   │  ├─ data/
   │  │  ├─ models/
   │  │  ├─ services/
   │  │  └─ repositories/
   │  ├─ domain/
   │  └─ presentation/
   ├─ course/
   ├─ order/
   ├─ payment/
   └─ learning/
test/
integration_test/
```

目录的判断标准不是“看起来像大厂”，而是依赖方向清楚：

- Widget 不直接调用 Dio。
- Service 不引用 Widget。
- Repository 屏蔽远程、本地数据来源。
- Controller 把领域数据转换成页面需要的状态。
- 跨 feature 的基础能力放 `core`，业务代码不要全塞进去。

::: tip 💡 面试题：为什么采用 feature-first，而不是把所有 page、model、service 分成三个大文件夹？
按业务功能聚合后，一个功能的代码修改范围更集中，团队并行冲突更少；每个 feature 内部仍然可以继续分层。
:::

## 六、先审计后端契约

当前 Java 项目已有或计划已有：

| 移动端能力 | 后端接口 | 状态 |
| --- | --- | --- |
| 注册 | `POST /api/user/register` | 已有 |
| 登录 | `POST /api/user/login` | 已有 |
| 刷新/退出 | `POST /api/auth/refresh`、`/logout` | 需要核对 |
| 课程分页 | `GET /api/course/page` | 已有 |
| 分类树 | `GET /api/category/tree` | 已有 |
| 课程详情 | `GET /api/course/{id}` | 已有 |
| 创建订单 | `POST /api/order/create` | 已有但需安全改造 |
| 订单列表/详情 | 移动端订单接口 | 需要补充 |
| 支付 | `/api/pay/*` | 有模拟流程 |
| 学习进度 | `/api/play-record/*` | 已有 |
| 消息/聊天 | STOMP WebSocket | 已有基础能力 |
| 收藏、头像、推送设备 | 移动端配套接口 | 需要补充 |

关键原则：`userId` 必须由后端从 JWT 身份中取得，不能信任客户端提交的用户 ID；课程价格、优惠、订单金额也必须由后端重新计算。

## 七、应用入口骨架

先安装入口需要的状态容器：

```bash
flutter pub add flutter_riverpod
```

`lib/app/bootstrap.dart`：

```dart
import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

Future<void> bootstrap(FutureOr<Widget> Function() builder) async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    // Day 27 替换为 Sentry.captureException。
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    // 捕获 Flutter 框架之外的未处理异步异常。
    return false;
  };

  final app = await builder();
  runApp(ProviderScope(child: app));
}
```

`lib/main_dev.dart`：

```dart
import 'app/app.dart';
import 'app/bootstrap.dart';

void main() {
  bootstrap(() async => const CourseMallApp());
}
```

真正初始化数据库、监控和配置时，都放进 `bootstrap`，入口文件只负责选择环境。

## 八、今天必须想清楚的边界

1. App 只保存展示所需数据，支付金额和权限判断以服务端为准。
2. Access Token、Refresh Token 不放普通偏好存储。
3. 视频播放地址使用短期签名 URL，不写死 OSS 永久地址。
4. 所有可能重试的写操作都要考虑幂等。
5. 弱网、断网、App 切后台不是异常边角，而是移动端正常场景。

## 九、知识点索引

- Flutter 声明式 UI：UI 是状态的函数。
- Widget、Element、RenderObject 的职责先有概念，Day 23 再深入性能。
- MVVM/分层架构、单一数据源、单向数据流。
- Android/iOS 构建链和 Flutter SDK 的边界。

## 十、完成清单

- [ ] `flutter doctor -v` 无阻塞错误
- [ ] 真机或模拟器能运行默认 App
- [ ] 能说清 View、Controller、Repository、Service 的职责
- [ ] 记录后端已有接口和待补接口
- [ ] 确认包名、支持平台和三个运行环境

## 十一、明天我会问你

1. Widget 为什么应尽量少放业务逻辑？
2. Repository 和 Service 有什么区别？
3. 为什么客户端传来的 `userId` 和订单金额都不可信？
