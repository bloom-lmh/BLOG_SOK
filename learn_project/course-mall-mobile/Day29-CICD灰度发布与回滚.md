# Day 29 · CI/CD、灰度发布、回滚与热更新边界

> **今天目标**：让每个提交自动验证，让发布可重复、可审计、可灰度、可停止。理解 Flutter 更新为什么不能照搬 Web 的即时发布。

## 一、流水线分层

```text
Pull Request
  → format → generate → analyze → unit/widget → fake integration

main
  → 上述检查 → staging build → staging contract/E2E

release tag / manual approval
  → signed prod build → internal testing
  → staged rollout → monitor → expand or halt
```

构建和上传可自动化，生产放量保留审批门禁。

## 二、GitHub Actions 质量流水线

`.github/workflows/verify.yml`：

```yaml
name: verify

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: verify-${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20

    steps:
      - uses: actions/checkout@v4

      - uses: subosito/flutter-action@v2
        with:
          flutter-version: "3.44.7"
          channel: stable
          cache: true

      - name: Resolve dependencies
        run: flutter pub get

      - name: Verify generated code
        run: |
          dart run build_runner build --delete-conflicting-outputs
          git diff --exit-code

      - name: Format
        run: dart format --output=none --set-exit-if-changed .

      - name: Analyze
        run: flutter analyze

      - name: Test
        run: flutter test --coverage

      - name: Build unsigned Android dev APK
        run: >
          flutter build apk
          --debug
          --flavor dev
          -t lib/main_dev.dart
          --dart-define=API_BASE_URL=https://dev.invalid
          --dart-define=WS_BASE_URL=wss://dev.invalid
```

Flutter 版本要与项目基线一致，升级时修改一处并完整回归。Action 也应固定主版本/commit，按团队供应链策略管理。

## 三、发布流水线中的 Secret

CI Secret 包含：

- Android upload keystore（Base64 或安全文件）及密码；
- Google Play service account；
- iOS distribution certificate/profile 或 Match 凭证；
- App Store Connect API Key；
- Sentry symbol upload token；
- 生产非公开构建配置。

规则：

- 不输出到日志；
- 只对受保护环境和分支开放；
- Fork PR 无权读取；
- 临时 runner 用后删除；
- 定期轮换；
- 上传账号最小权限；
- 发布操作有审计。

App 中仍不能出现服务端 Secret。

## 四、Fastlane 负责商店上传

Flutter 官方支持把构建与 fastlane 结合：

```ruby
# android/fastlane/Fastfile
platform :android do
  lane :internal do
    upload_to_play_store(
      track: "internal",
      aab: "../build/app/outputs/bundle/prodRelease/app-prod-release.aab"
    )
  end
end
```

```ruby
# ios/fastlane/Fastfile
platform :ios do
  lane :beta do
    upload_to_testflight(
      ipa: "../build/ios/ipa/course_mall_mobile.ipa"
    )
  end
end
```

用 Gemfile/Gemfile.lock 固定 fastlane 版本。先在本地跑通，再搬进 CI。

## 五、发布通道

Android：

```text
internal → closed testing → open testing → production staged rollout
```

iOS：

```text
internal TestFlight → external TestFlight → App Store phased release
```

灰度步骤示例：

1. 内测 24 小时；
2. 1% 生产用户；
3. 观察 Crash、登录、支付、视频 2–4 小时；
4. 5% → 20% → 50% → 100%；
5. 指标异常立即停止扩量。

比例和时间按实际用户量调整，小项目可用内测/白名单替代统计无意义的 1%。

## 六、发布门禁

进入生产前必须满足：

- format/analyze/test 全绿；
- OpenAPI 无未处理 breaking change；
- staging 主链路通过；
- release 真机冒烟通过；
- Crash-free 达标；
- 新权限和隐私评审完成；
- 数据库迁移可前后兼容；
- 服务端已支持旧版 App；
- 回滚和客服话术准备；
- 负责人批准。

## 七、回滚不是重新上传旧包那么简单

应用商店不能让所有设备瞬间降级。回滚工具：

- 停止 staged rollout；
- 服务端 Feature Flag 关闭新功能；
- API 继续兼容旧客户端；
- 服务端回滚；
- 发布修复版本并加速审核；
- minimum version 只在严重安全问题时使用；
- 数据库 migration 采用 expand → migrate → contract，避免旧版无法运行。

::: tip 💡 面试题：为什么移动端发布比 Web 更强调向后兼容？
已安装旧版无法被立即替换，商店审核和用户升级都有延迟；服务端会长期同时面对多个客户端版本。
:::

## 八、Feature Flag

服务端下发：

```json
{
  "searchV2": {
    "enabled": true,
    "rolloutPercent": 10,
    "minAppVersion": "1.1.0"
  }
}
```

Flag 用于：

- 按用户稳定分桶灰度；
- 快速关闭高风险入口；
- A/B 实验；
- 服务端能力逐步启用。

不能用 Flag 绕过商店审核动态下发全新未审核功能；关闭路径也必须被测试。

## 九、Flutter 热更新边界

Flutter 官方标准发布仍是重新构建并通过应用商店分发。开发时 Hot Reload 不等于生产热更新。

第三方方案（如 Dart 代码补丁工具）需要单独评估：

- 商店政策和地区规则；
- 原生代码/插件变更通常仍需新安装包；
- Flutter 版本与补丁兼容；
- 签名、供应链和回滚；
- 崩溃监控；
- 用户知情和合规。

本项目首版不把第三方热更新当关键依赖。紧急处理优先 Feature Flag、服务端兼容和商店修复版。

## 十、监控放量

每一阶段观察：

- 新版本 Crash-free users/sessions；
- ANR、启动失败；
- 登录成功率；
- Token refresh 失败率；
- 下单与支付验证成功率；
- 视频首帧和播放错误；
- API 4xx/5xx/P95；
- 按版本对比，而不是只看总量。

自动门禁示例：新版本 Crash-free 低于阈值或支付失败率较基线显著升高，则停止流水线扩量并通知负责人。

## 十一、知识点索引

- CI、CD、环境审批。
- Fastlane、签名 Secret。
- 内测、灰度、分阶段发布。
- Feature Flag、向后兼容、数据库 expand/contract。
- Flutter 热更新边界和商店分发。

## 十二、完成清单

- [ ] PR 自动执行生成、格式、分析和测试
- [ ] 发布签名只在受保护环境可用
- [ ] Android/iOS 有内测上传流程
- [ ] 生产按阶段放量并监控版本指标
- [ ] 回滚不依赖“所有用户立刻降级”

## 十三、明天我会问你

1. 为什么生产发布仍要审批门禁？
2. 移动端回滚为什么比 Web 困难？
3. Feature Flag 和热更新分别解决什么问题？
