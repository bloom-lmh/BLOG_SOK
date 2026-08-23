# Day 28 · Flavors、签名、版本与 Android/iOS 构建

> **今天目标**：把 dev/staging/prod 变成真正可安装的不同应用，完成 Android AAB、iOS IPA 的签名构建和发布前权限审计。

## 一、三个层次不要混

| 层次 | 示例 | 作用 |
| --- | --- | --- |
| Dart 入口 | `main_dev.dart` | 注入 API、日志、功能配置 |
| Android Flavor/iOS Scheme | dev/prod | 包名、App 名、图标、原生配置 |
| 签名/商店通道 | keystore/certificate | 证明发布者身份 |

只使用 `--dart-define` 不能让测试版和正式版同时安装，也不能切换 Firebase 原生配置。

## 二、Android productFlavors

新项目通常使用 `android/app/build.gradle.kts`：

```kotlin
android {
    namespace = "com.coursemall.app"

    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            versionNameSuffix = "-dev"
            resValue("string", "app_name", "CourseMall Dev")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            versionNameSuffix = "-staging"
            resValue("string", "app_name", "CourseMall Staging")
        }
        create("prod") {
            dimension = "env"
            resValue("string", "app_name", "CourseMall")
        }
    }
}
```

`AndroidManifest.xml`：

```xml
<application
    android:label="@string/app_name"
    android:icon="@mipmap/ic_launcher">
    ...
</application>
```

原生配置按目录覆盖：

```text
android/app/src/dev/
├─ google-services.json
└─ res/
android/app/src/staging/
android/app/src/prod/
```

dev 使用 `com.coursemall.app.dev`，prod 使用 `com.coursemall.app`，Deep Link 的 assetlinks.json 也要分别包含正确签名证书指纹。

## 三、Android Release 签名

生成 keystore：

```bash
keytool -genkeypair -v \
  -keystore course-mall-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias course-mall-upload
```

`android/key.properties`：

```properties
storePassword=...
keyPassword=...
keyAlias=course-mall-upload
storeFile=../course-mall-upload.jks
```

它和 `*.jks` 必须加入 `.gitignore`，放在密码管理器/CI Secret 中备份。丢失上传密钥会严重影响发布。

Kotlin DSL 读取：

```kotlin
import java.util.Properties

val keystoreProperties = Properties().apply {
    val propertiesFile = rootProject.file("key.properties")
    if (propertiesFile.exists()) {
        propertiesFile.inputStream().use(::load)
    }
}

android {
    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String?
            keyPassword = keystoreProperties["keyPassword"] as String?
            storeFile = keystoreProperties["storeFile"]
                ?.let { file(it as String) }
            storePassword = keystoreProperties["storePassword"] as String?
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            isShrinkResources = true
        }
    }
}
```

Google Play 推荐 Play App Signing：Google 管理最终 App Signing Key，你保管 Upload Key。

## 四、iOS Schemes

在 Xcode 中为 Runner 建立：

- Dev：Bundle ID `com.coursemall.app.dev`；
- Staging：`com.coursemall.app.staging`；
- Prod：`com.coursemall.app`。

每个 Scheme 关联对应 Build Configuration、`GoogleService-Info.plist`、App 名、图标、Entitlements 和 Bundle ID。

还要配置：

- Apple Developer Team；
- Development/Distribution Certificate；
- Provisioning Profile；
- Associated Domains；
- Push Notifications；
- Sign in with Apple（如果未来使用第三方登录并触发规则）。

Windows 可以开发 Flutter Android，但 iOS 最终构建和签名必须在 macOS/Xcode 环境完成。

## 五、版本号

`pubspec.yaml`：

```yaml
version: 1.0.0+100
```

- `1.0.0`：用户看到的版本；
- `100`：单调递增构建号；
- Android 映射 versionName/versionCode；
- iOS 映射 CFBundleShortVersionString/CFBundleVersion。

CI 推荐按发布版本 + 流水线编号生成：

```bash
flutter build appbundle \
  --flavor prod \
  -t lib/main_prod.dart \
  --build-name=1.0.0 \
  --build-number=100
```

同一商店版本的构建号不能回退或重复。

## 六、环境构建命令

```bash
# Android 开发
flutter run \
  --flavor dev \
  -t lib/main_dev.dart \
  --dart-define-from-file=config/dev.json

# Android 正式 AAB
flutter build appbundle \
  --release \
  --flavor prod \
  -t lib/main_prod.dart \
  --dart-define-from-file=config/prod.json \
  --obfuscate \
  --split-debug-info=artifacts/symbols/android

# iOS 正式 IPA（macOS）
flutter build ipa \
  --release \
  --flavor prod \
  -t lib/main_prod.dart \
  --dart-define-from-file=config/prod.json \
  --obfuscate \
  --split-debug-info=artifacts/symbols/ios
```

`prod.json` 只能包含可公开客户端配置。支付私钥、服务账号和 Sentry 上传 Token 放 CI Secret，不通过 dart-define 编译进 App。

## 七、构建产物

Android：

- AAB：商店发布；
- APK：内部安装/测试，可按 ABI 拆分；
- mapping.txt、native symbols；
- Flutter split-debug-info。

iOS：

- IPA；
- xcarchive；
- dSYM；
- Flutter split-debug-info。

每个产物关联：

- Git commit；
- Flutter/Dart 版本；
- lockfile；
- 环境；
- build number；
- 构建日志和 SHA-256。

## 八、权限与隐私审计

发布前检查 Manifest/Info.plist：

- 移除未使用相机、麦克风、定位权限；
- 权限用途文案真实且本地化；
- Android 通知、前台服务类型正确；
- iOS Privacy Manifest/第三方 SDK 声明完整；
- 后台模式只开启实际使用项；
- URL Scheme 不过度暴露；
- 网络安全配置无测试域名和明文例外。

::: tip 💡 面试题：为什么删除一个 Flutter 插件后还要检查权限？
插件或历史原生配置可能已把权限写入 Manifest/Info.plist；依赖删除不一定自动清理所有手工配置和合并结果。
:::

## 九、商店素材和合规

- App 名、描述、截图、隐私政策；
- 用户协议和账号删除入口；
- 内容版权和年龄分级；
- 测试审核账号；
- 支付/数字内容规则；
- 数据收集清单；
- 客服和投诉渠道；
- 备案、地区法规按实际业务处理。

## 十、发布前本地检查

```bash
dart format --output=none --set-exit-if-changed .
flutter analyze
flutter test
flutter build appbundle --flavor prod -t lib/main_prod.dart
```

安装 release 构建真机验证，不能只测 debug：

- 登录/刷新；
- Deep Link；
- 推送；
- 支付沙箱；
- 视频；
- 相机/相册；
- 生物识别；
- Sentry 符号化。

## 十一、知识点索引

- Flavor、Scheme、Bundle ID/Application ID。
- Android keystore、Play App Signing。
- iOS Certificate、Profile、Entitlements。
- 语义版本和构建号。
- AAB、IPA、symbols/dSYM。

## 十二、完成清单

- [ ] 三环境可同时安装且名称可区分
- [ ] 正式签名材料未进 Git
- [ ] Android AAB 能 release 构建
- [ ] iOS Scheme 和签名配置明确
- [ ] 符号、commit、构建号可追踪

## 十三、明天我会问你

1. dart-define 与原生 Flavor 的区别是什么？
2. Android Upload Key 与 App Signing Key 有什么区别？
3. 为什么 release 真机回归不可省略？
