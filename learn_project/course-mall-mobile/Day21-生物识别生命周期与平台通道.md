# Day 21 · 生物识别、App 生命周期与原生平台通道

> **今天目标**：加入本地生物识别解锁、敏感页自动锁定和一个原生安全屏幕能力。重点是理解“设备本地验证”与“服务端身份认证”的边界。

## 一、生物识别的正确定位

```bash
flutter pub add local_auth
```

指纹/Face ID 在本项目中用于：

- App 从后台较长时间返回时解锁；
- 查看订单隐私信息前二次确认；
- 从 Secure Storage 读取高敏感凭证前增强保护。

它**不是**服务端登录。服务端仍依赖会话 Token，生物识别只证明“当前有人通过了这台设备配置的本地认证”。

::: tip 💡 面试题：指纹验证成功后，后端为什么不能直接认为这是某个用户？
本地系统只返回验证成功/失败，不把指纹身份直接证明给你的后端；后端身份仍由受保护的会话凭证确认。
:::

## 二、封装本地认证

`lib/core/device/local_auth_service.dart`：

```dart
import 'package:local_auth/local_auth.dart';

class LocalAuthService {
  LocalAuthService(this._auth);

  final LocalAuthentication _auth;

  Future<bool> isAvailable() async {
    final supported = await _auth.isDeviceSupported();
    final canCheck = await _auth.canCheckBiometrics;
    return supported || canCheck;
  }

  Future<bool> authenticate({
    required String reason,
    bool biometricOnly = false,
  }) async {
    if (!await isAvailable()) return false;

    return _auth.authenticate(
      localizedReason: reason,
      options: AuthenticationOptions(
        biometricOnly: biometricOnly,
        stickyAuth: true,
        useErrorDialogs: true,
      ),
    );
  }

  Future<void> cancel() => _auth.stopAuthentication();
}
```

`biometricOnly: false` 允许设备 PIN/密码兜底，通常可用性更好。若业务要求强生物识别，需要明确没有录入生物特征时的恢复流程。

## 三、平台配置

Android：

- 使用 `FlutterFragmentActivity`（按 local_auth 当前文档配置）；
- Manifest 声明生物识别权限；
- minSdk 与插件版本兼容；
- 测试指纹未录入、锁定、取消、切后台。

iOS：

- `Info.plist` 添加 `NSFaceIDUsageDescription`；
- 真机测试 Face ID/Touch ID；
- 测试系统密码变更和生物信息变更。

插件升级可能改变最低系统版本，安装后先查对应版本文档，而不是复制旧博客配置。

## 四、后台超时锁

`lib/features/auth/presentation/app_lock_controller.dart`：

```dart
class AppLockState {
  const AppLockState({
    this.locked = false,
    this.backgroundedAt,
  });

  final bool locked;
  final DateTime? backgroundedAt;

  AppLockState copyWith({
    bool? locked,
    DateTime? backgroundedAt,
  }) {
    return AppLockState(
      locked: locked ?? this.locked,
      backgroundedAt: backgroundedAt ?? this.backgroundedAt,
    );
  }
}

class AppLockController extends Notifier<AppLockState> {
  static const _lockAfter = Duration(minutes: 5);

  @override
  AppLockState build() => const AppLockState();

  void onBackground() {
    state = state.copyWith(backgroundedAt: DateTime.now());
  }

  void onResume() {
    final at = state.backgroundedAt;
    if (at == null) return;
    if (DateTime.now().difference(at) >= _lockAfter) {
      state = state.copyWith(locked: true);
    }
  }

  Future<bool> unlock() async {
    final ok = await ref.read(localAuthServiceProvider).authenticate(
          reason: '验证身份以继续使用 CourseMall',
        );
    if (ok) state = state.copyWith(locked: false);
    return ok;
  }
}
```

根 Widget 监听生命周期：

```dart
class AppLifecycleGate extends ConsumerStatefulWidget {
  const AppLifecycleGate({required this.child, super.key});
  final Widget child;

  @override
  ConsumerState<AppLifecycleGate> createState() => _AppLifecycleGateState();
}

class _AppLifecycleGateState extends ConsumerState<AppLifecycleGate>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = ref.read(appLockProvider.notifier);
    switch (state) {
      case AppLifecycleState.resumed:
        controller.onResume();
      case AppLifecycleState.inactive:
      case AppLifecycleState.hidden:
      case AppLifecycleState.paused:
        controller.onBackground();
      case AppLifecycleState.detached:
        break;
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final locked = ref.watch(
      appLockProvider.select((value) => value.locked),
    );
    return Stack(
      children: [
        widget.child,
        if (locked) const Positioned.fill(child: AppUnlockPage()),
      ],
    );
  }
}
```

解锁页覆盖原内容，防止最近任务预览露出订单详情。真正的系统任务快照保护还需要平台层能力。

## 五、用 MethodChannel 开启 Android 安全窗口

Flutter 不能覆盖所有平台能力，MethodChannel 用于调用 Kotlin/Swift。

`lib/core/device/secure_screen.dart`：

```dart
class SecureScreen {
  static const _channel =
      MethodChannel('com.coursemall.app/security');

  static Future<void> setEnabled(bool enabled) {
    return _channel.invokeMethod<void>(
      'setSecureScreen',
      {'enabled': enabled},
    );
  }
}
```

`android/app/src/main/kotlin/.../MainActivity.kt`：

```kotlin
import android.view.WindowManager
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "com.coursemall.app/security"
        ).setMethodCallHandler { call, result ->
            if (call.method != "setSecureScreen") {
                result.notImplemented()
                return@setMethodCallHandler
            }

            val enabled = call.argument<Boolean>("enabled") ?: false
            if (enabled) {
                window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            }
            result.success(null)
        }
    }
}
```

在支付、订单隐私或播放器页进入时开启，离开时恢复。Android `FLAG_SECURE` 可阻止普通截图/任务预览，但不能承诺阻止所有外部录制。iOS 没有完全等价的全局禁止截图 API，通常监听捕获状态并遮挡敏感内容。

## 六、权限最小化

| 能力 | 申请时机 | 拒绝后的降级 |
| --- | --- | --- |
| 相机 | 用户点击拍照 | 选择相册 |
| 通知 | 用户开启提醒 | 站内消息 |
| 生物识别 | 用户开启 App 锁 | 设备密码或关闭功能 |
| 照片 | 用户选择头像 | 系统选择器 |
| 麦克风 | 真正加入语音功能时 | 文本聊天 |

不要为“以后可能用”提前申请。权限说明文案必须与真实用途一致。

## 七、设备标识与隐私

- 不采集 IMEI、序列号等硬件唯一标识；
- 使用随机 installationId；
- 风控所需设备信号最小化并在隐私政策披露；
- local_auth 不会把生物模板交给 App；
- 日志和埋点不记录权限系统的敏感细节；
- 删除账号时同步删除设备绑定和推送注册。

## 八、知识点索引

- 生物识别、本地认证与服务端认证。
- AppLifecycleState。
- MethodChannel、Dart 与 Kotlin/Swift 边界。
- Android FLAG_SECURE 与 iOS 捕获检测。
- 最小权限和隐私设计。

## 九、完成清单

- [ ] 生物识别有设备密码降级策略
- [ ] 后台超过阈值会锁定敏感内容
- [ ] 退出登录不会保留锁屏后的旧会话
- [ ] Android 安全窗口可按页面开启/关闭
- [ ] 所有权限均按用户动作申请

## 十、明天我会问你

1. 生物识别成功为什么不等于服务端登录？
2. MethodChannel 解决什么问题？
3. FLAG_SECURE 为什么仍不能叫“绝对防录屏”？
