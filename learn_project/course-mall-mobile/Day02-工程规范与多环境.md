# Day 02 · 工程规范、多环境与依赖治理

> **今天目标**：让项目从第一天就能被团队维护。建立严格静态检查、dev/staging/prod 环境、统一启动入口和可重复构建规则。

## 一、安装基础依赖

在你创建的 Flutter 项目中执行：

```bash
flutter pub add flutter_riverpod go_router dio
flutter pub add json_annotation
flutter pub add --dev build_runner json_serializable mocktail
```

先不手写版本号，让 Pub 解析当前 Flutter SDK 兼容版本，然后提交 `pubspec.yaml` 和 `pubspec.lock`。升级依赖时使用：

```bash
flutter pub outdated
flutter pub upgrade --major-versions
flutter analyze
flutter test
```

`upgrade --major-versions` 不能在主分支随手执行，应单独提交并回归。

## 二、开启严格静态检查

`analysis_options.yaml`：

```yaml
include: package:flutter_lints/flutter.yaml

analyzer:
  exclude:
    - "**/*.g.dart"
    - "**/*.freezed.dart"
  language:
    strict-casts: true
    strict-inference: true
    strict-raw-types: true
  errors:
    invalid_annotation_target: ignore

linter:
  rules:
    always_declare_return_types: true
    avoid_dynamic_calls: true
    avoid_print: true
    cancel_subscriptions: true
    close_sinks: true
    directives_ordering: true
    prefer_final_locals: true
    unawaited_futures: true
    use_build_context_synchronously: true
```

常用质量命令：

```bash
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
```

CI 必须运行这三条。IDE 中“没有红线”不等于 CI 能通过。

::: tip 💡 面试题：为什么 Dart 还要开启 strict-casts？
静态类型可以在编译前发现 JSON、泛型和 dynamic 隐式转换问题，减少运行时才出现的类型异常。
:::

## 三、环境配置不是“一个 baseUrl”

三个环境：

| 环境 | 用途 | 后端/数据 |
| --- | --- | --- |
| dev | 本地开发 | 本机或局域网后端，可重置数据 |
| staging | 联调、测试、预发布 | 独立数据库，接近生产配置 |
| prod | 正式用户 | 生产域名、生产监控 |

`lib/app/config/app_environment.dart`：

```dart
enum AppFlavor { dev, staging, prod }

final class AppEnvironment {
  const AppEnvironment({
    required this.flavor,
    required this.apiBaseUrl,
    required this.wsBaseUrl,
    required this.enableHttpLog,
  });

  final AppFlavor flavor;
  final Uri apiBaseUrl;
  final Uri wsBaseUrl;
  final bool enableHttpLog;

  factory AppEnvironment.fromDefines(AppFlavor flavor) {
    const api = String.fromEnvironment('API_BASE_URL');
    const ws = String.fromEnvironment('WS_BASE_URL');

    if (api.isEmpty || ws.isEmpty) {
      throw StateError('缺少 API_BASE_URL 或 WS_BASE_URL');
    }

    return AppEnvironment(
      flavor: flavor,
      apiBaseUrl: Uri.parse(api),
      wsBaseUrl: Uri.parse(ws),
      enableHttpLog: flavor != AppFlavor.prod,
    );
  }
}
```

为什么用 `Uri` 而不是 String：它能明确 scheme、host、path，并避免到处手工拼接斜杠。

## 四、统一 bootstrap

`lib/app/config/environment_provider.dart`：

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_environment.dart';

final environmentProvider = Provider<AppEnvironment>((ref) {
  throw UnimplementedError('必须在 ProviderScope 中覆盖');
});
```

修改 `bootstrap`，把环境注入而不是使用全局变量：

```dart
Future<void> bootstrap({
  required AppEnvironment environment,
  required FutureOr<Widget> Function() builder,
}) async {
  WidgetsFlutterBinding.ensureInitialized();
  final app = await builder();

  runApp(
    ProviderScope(
      overrides: [
        environmentProvider.overrideWithValue(environment),
      ],
      child: app,
    ),
  );
}
```

`lib/main_dev.dart`：

```dart
import 'app/app.dart';
import 'app/bootstrap.dart';
import 'app/config/app_environment.dart';

void main() {
  bootstrap(
    environment: AppEnvironment.fromDefines(AppFlavor.dev),
    builder: () async => const CourseMallApp(),
  );
}
```

运行：

```bash
flutter run -t lib/main_dev.dart \
  --dart-define=API_BASE_URL=http://10.0.2.2:8080 \
  --dart-define=WS_BASE_URL=ws://10.0.2.2:8080
```

Android 模拟器中的 `localhost` 指模拟器自身，访问宿主机通常使用 `10.0.2.2`；真机需使用电脑局域网 IP，并确认防火墙和后端监听地址。

## 五、dart-define 不是保险箱

编译进 App 的值都可能被逆向拿到，包括：

- API 域名
- Sentry DSN
- 公共地图 Key
- 功能开关默认值

绝不能放进去：

- 数据库密码
- JWT 签名密钥
- 支付商户私钥
- OSS Secret
- 第三方服务端密钥

这些秘密只能在后端或 CI 的受保护环境中。移动端最多持有允许公开的客户端标识。

::: tip 💡 面试题：把 Secret 写进 .env 并加入 .gitignore 就安全了吗？
不安全。`.env` 只避免提交源码；一旦值被编译进安装包，仍可被提取。客户端不能保存真正的服务端秘密。
:::

## 六、Android/iOS 真正的 Flavor

`--dart-define` 负责 Dart 配置，平台 Flavor/Scheme 负责：

- 不同包名：`com.coursemall.app.dev` / `com.coursemall.app`
- 不同 App 名和图标
- 不同 Firebase 配置
- 测试版与正式版可同时安装
- 不同签名和发布通道

Day 28 会完整配置 Android productFlavors 与 iOS Schemes。现在先约定启动命令：

```bash
flutter run --flavor dev -t lib/main_dev.dart --dart-define-from-file=config/dev.json
flutter run --flavor staging -t lib/main_staging.dart --dart-define-from-file=config/staging.json
flutter build appbundle --flavor prod -t lib/main_prod.dart --dart-define-from-file=config/prod.json
```

注意：配置 JSON 只能存非敏感配置；生产配置文件也要经过代码评审。

## 七、提交规范

建议 Conventional Commits：

```text
feat(auth): add refresh token flow
fix(order): prevent duplicate order submission
test(course): cover pagination failure
chore(deps): upgrade dio
```

`.gitignore` 至少检查：

```text
.dart_tool/
.idea/
.flutter-plugins*
build/
android/key.properties
*.jks
*.keystore
ios/Runner/*.mobileprovision
config/local.json
```

不要忽略 `pubspec.lock`。应用项目提交 lock 文件，确保本地和 CI 解析到相同依赖。

## 八、生成代码规则

Day 05 起会使用 JSON 代码生成：

```bash
dart run build_runner build --delete-conflicting-outputs
```

团队必须二选一并固定：

1. 提交 `*.g.dart`：CI 更快，代码评审能看到变化。
2. 不提交生成文件：CI 必须先运行 build_runner。

本项目建议提交生成文件，并在 CI 中重新生成后执行 `git diff --exit-code`，防止忘记更新。

## 九、知识点索引

- Pub 依赖解析与 `pubspec.lock`。
- 编译期常量 `String.fromEnvironment`。
- Riverpod override 作为依赖注入。
- Dart 静态检查、格式化和代码生成。
- Dart 环境配置与平台 Flavor 的区别。

## 十、完成清单

- [ ] 静态检查规则已生效
- [ ] dev 环境能连接本地 Java 后端
- [ ] 环境对象通过 Provider 注入
- [ ] 仓库没有提交密钥、签名文件或生产秘密
- [ ] `format + analyze + test` 全部通过

## 十一、明天我会问你

1. `--dart-define` 为什么不能保存商户私钥？
2. Dart 环境配置与 Android/iOS Flavor 分别解决什么问题？
3. 为什么应用项目通常要提交 `pubspec.lock`？
