# Day 24 · 移动端安全审计、威胁模型与加固边界

> **今天目标**：对完整项目做一次安全审计。你要能说清保护什么、攻击者是谁、控制在哪一层，而不是只回答“用了 HTTPS”。

## 一、先做威胁模型

| 资产 | 主要威胁 | 核心控制 |
| --- | --- | --- |
| 会话 Token | 日志泄露、恶意软件、备份 | Secure Storage、短期 Token、撤销 |
| 订单与支付 | 篡改金额、伪造回调、重放 | 服务端计价、验签、幂等 |
| 课程视频 | 永久链接泄露、越权播放 | 权益校验、短签名、DRM（按需） |
| 用户隐私 | 锁屏通知、缓存串号、埋点泄露 | 最小化、用户隔离、脱敏 |
| Deep Link | 任意跳转、参数注入 | 域名关联、路由白名单、再鉴权 |
| 本地数据库 | Root/备份提取 | 少存、清理、必要时加密 |

攻击者可能控制：

- 自己的 App 客户端和网络请求；
- 越狱/Root 设备；
- 恶意代理或公共 Wi-Fi；
- 构造的 Deep Link、文件和推送 payload；
- 被盗账号或 Refresh Token。

因此“客户端校验过”从来不是安全边界。

## 二、传输安全

- 生产全部 HTTPS/WSS；
- Android 禁止明文流量；
- iOS 不随意放宽 ATS；
- 正确校验证书和主机名；
- API、CDN、上传、WebSocket 都要覆盖；
- Token 不放 URL；
- 服务器启用现代 TLS、HSTS（Web 域名）和证书自动续期。

证书 Pinning 可降低特定中间人风险，但会带来证书轮换、灾备和旧版本 App 断网风险。若采用，至少 pin 备用公钥并支持安全更新；它不能抵御已 Hook 的客户端，也不能替代服务端授权。

::: tip 💡 面试题：用了 HTTPS，为什么仍然需要后端鉴权？
HTTPS 保护传输通道，不判断当前用户是否有权访问某个订单、课程或对象。
:::

## 三、凭证与会话

检查：

- Access Token 仅内存；
- Refresh Token 在系统安全存储；
- Android 备份规则不会产生无法解密恢复或意外备份；
- Token 日志、崩溃附件、剪贴板均无泄露；
- 401 刷新 single-flight；
- Refresh Token 可轮换、撤销、检测重放；
- 修改密码/封禁后可踢下线；
- logout 清理 Token、DB 用户数据、WebSocket 和推送绑定。

生物识别是本地增强，不替代服务端 Token。

## 四、授权审计

逐接口测试对象级越权：

```text
用户 A 的 Token + 用户 B 的 orderNo
用户 A 的 Token + 用户 B 的 lessonId/playbackSession
用户 A 修改请求体 userId 为 B
普通用户调用 mock-success/admin 接口
```

预期都是拒绝。订单号难猜不是权限控制，服务端每次按 `resource.user_id == current_user.id` 校验。

## 五、输入和展示安全

- JSON 字段做类型、范围、长度校验；
- 富文本白名单清洗；
- WebView 导航和 JS Bridge 白名单；
- Deep Link 参数解析失败安全降级；
- 图片解码前检查大小/像素/MIME；
- WebSocket 消息限制大小和频率；
- 搜索排序字段使用枚举白名单；
- 错误消息不回显 SQL、路径和堆栈。

如果使用 WebView：

```dart
NavigationDecision allowNavigation(Uri uri) {
  const allowedHosts = {
    'pay.coursemall.com',
    'help.coursemall.com',
  };
  if (uri.scheme != 'https' || !allowedHosts.contains(uri.host)) {
    return NavigationDecision.prevent;
  }
  return NavigationDecision.navigate;
}
```

不要开放任意 `javascript:`、`file:`、`intent:` scheme。

## 六、文件和本地数据

- 私有文件放 App sandbox；
- 分享文件前复制临时副本，完成后删除；
- 数据库按 userScope 隔离；
- 缓存设置过期和容量；
- 退出/删号清理；
- 不备份短期签名 URL；
- SQLite 默认明文，需要时采用 SQLCipher 并管理密钥；
- 加密密钥不能硬编码在 Dart。

本地加密的密钥最终仍要在设备上使用，所以它主要提高静态提取成本，不是绝对防护。

## 七、日志、监控和埋点脱敏

禁止记录：

- Authorization、Cookie；
- 密码、验证码；
- Refresh Token、预签名 URL；
- 完整手机号、邮箱、身份证；
- 支付渠道原始回调；
- 私密聊天正文。

统一 Logger：

```dart
Map<String, Object?> redact(Map<String, Object?> fields) {
  const blocked = {
    'authorization',
    'password',
    'refreshToken',
    'signedUrl',
  };
  return fields.map(
    (key, value) => MapEntry(
      key,
      blocked.contains(key) ? '[REDACTED]' : value,
    ),
  );
}
```

仅靠键名不够，真正实现还应处理大小写、嵌套对象和 URL Query。生产默认最少日志。

## 八、逆向与完整性

构建可使用：

```bash
flutter build appbundle \
  --obfuscate \
  --split-debug-info=artifacts/symbols/android
```

保管符号文件，Sentry/崩溃平台需要它还原堆栈。混淆只是增加逆向成本，不能隐藏硬编码 Secret。

可选风控：

- Google Play Integrity；
- Apple App Attest/DeviceCheck；
- Root/越狱检测；
- 最低版本和远程风险开关。

这些信号可能误判，应由服务端作为风险评分，不要仅凭客户端布尔值决定高价值权限。

## 九、供应链安全

每次合并前：

```bash
flutter pub outdated
flutter analyze
flutter test
```

同时：

- 锁定依赖和 Flutter SDK；
- 评估包维护者、License、下载来源和原生代码；
- 开启 Dependabot/依赖漏洞扫描；
- 删除不用的插件和平台权限；
- CI 密钥使用受保护 Secret；
- 构建产物生成校验值和可追踪版本；
- 第三方 SDK 做隐私清单。

## 十、服务端才是最终安全边界

移动端加固不能替代：

- Spring Security 认证授权；
- 参数校验；
- Redis 限流；
- 数据库唯一约束/乐观锁；
- 支付验签和金额核对；
- 对象存储私有访问；
- 审计日志；
- 风控与告警；
- 备份、恢复、密钥轮换。

## 十一、安全验收清单

- [ ] 抓包确认生产无明文 HTTP/WS
- [ ] 安装包字符串搜索无 Secret
- [ ] A 用户无法读取 B 用户订单/课程
- [ ] Token、密码、签名 URL 不进日志
- [ ] Deep Link/WebView 仅允许白名单
- [ ] 上传文件服务端重验
- [ ] 支付回调验签、核额、幂等
- [ ] 退出登录清理全部用户态
- [ ] 混淆符号文件安全归档
- [ ] 第三方 SDK 与隐私政策一致

## 十二、知识点索引

- 威胁建模、资产、攻击面、信任边界。
- TLS、Pinning 的收益和运维风险。
- 对象级授权（BOLA/IDOR）。
- WebView、Deep Link、文件上传安全。
- 混淆、Attestation 和供应链安全。

## 十三、明天我会问你

1. HTTPS、登录认证、资源授权分别解决什么问题？
2. 证书 Pinning 为什么会带来可用性风险？
3. Flutter 混淆为什么不能保护硬编码密钥？
