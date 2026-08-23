# Day 30 · 全链路验收、项目文档、简历与面试答辩

> **今天目标**：把 30 天成果整理成可运行、可证明、可讲解的面试项目。今天不再堆功能，而是验收真实质量和证据。

## 一、最终系统结构

```text
Flutter App
├─ Presentation：Widget + Riverpod Controller
├─ Domain：Entity + Repository Interface + 少量 UseCase
├─ Data：Dio Service + Repository Impl
├─ Local：Secure Storage + Drift + Image Cache
├─ Device：Push + Biometrics + Camera + Deep Link
└─ Observability：Sentry + Structured Log + Analytics

                    HTTPS / WSS
                          ↓
Spring Boot
├─ Spring Security + JWT/Refresh Session
├─ Course / Search / Order / Payment / Learning
├─ MySQL + Redis + Elasticsearch（按后端项目进度）
├─ MQ/Outbox + STOMP Broker
├─ Object Storage + CDN + Video
└─ OpenAPI + Trace + Metrics
```

## 二、覆盖的常用 Flutter 技术

| 领域 | 已覆盖 |
| --- | --- |
| Dart/Flutter | 不可变状态、异步、isolate、生命周期、Widget/Sliver |
| 架构 | feature-first、MVVM、Repository、依赖反转 |
| 状态管理 | Riverpod Provider/Notifier/AsyncValue/family/override |
| 导航 | go_router、嵌套路由、Tab 栈、守卫、Deep Link |
| 网络 | Dio、拦截器、超时、取消、错误模型、Token 刷新 |
| 数据 | JSON 生成、DTO 映射、Drift、迁移、离线 Outbox |
| 业务 | 搜索、详情、订单、支付、权益、视频、进度 |
| 实时 | STOMP WebSocket、推送、重连、消息去重 |
| 设备 | 相机/相册、生物识别、MethodChannel、权限 |
| 体验 | Material 3、暗色、i18n、无障碍、平板适配 |
| 质量 | Unit、Widget、Integration、OpenAPI 契约 |
| 工程 | Flavor、签名、CI/CD、灰度、监控、安全 |

这已经覆盖大多数中小型 Flutter 业务项目常见能力。地图、蓝牙、音视频通话、复杂动画等不属于课程商城核心，不为了“技术数量”硬塞。

## 三、最终验收矩阵

### 功能

- [ ] 注册、登录、刷新、退出；
- [ ] 首页、分类、搜索、分页；
- [ ] 详情、章节、试听、收藏、分享；
- [ ] 订单试算、幂等创建、取消、退款；
- [ ] 沙箱支付、回跳、服务端核验；
- [ ] 我的课程、视频续播、进度同步；
- [ ] 实时通知、系统推送；
- [ ] 头像上传、主题、语言。

### 异常

- [ ] 无网、弱网、超时；
- [ ] 并发 401；
- [ ] 请求超时但订单已创建；
- [ ] 支付回跳丢失；
- [ ] WebSocket 断线；
- [ ] App 切后台/被杀；
- [ ] 图片选择进程恢复；
- [ ] Token/权益过期；
- [ ] 后端返回未知枚举；
- [ ] 数据库从旧版本迁移。

### 安全

- [ ] A 用户不能访问 B 用户订单；
- [ ] 客户端金额/userId 被后端忽略；
- [ ] Token、密码、签名 URL 不进日志；
- [ ] Deep Link/WebView 白名单；
- [ ] 上传文件服务端重验；
- [ ] 支付验签、核额、幂等；
- [ ] 退出清理本地用户数据。

### 质量与发布

- [ ] format/analyze/test 通过；
- [ ] OpenAPI 契约无漂移；
- [ ] profile 真机性能报告；
- [ ] Sentry 错误可符号化；
- [ ] dev/staging/prod 可区分；
- [ ] Android AAB/iOS IPA 构建流程；
- [ ] 灰度、停止和修复方案。

## 四、10 分钟演示脚本

1. 用 Deep Link 打开课程详情；
2. 因未登录被守卫带到登录，成功后回原页；
3. 搜索、筛选并展示分页和空状态；
4. 下单时快速双击，后端只有一单；
5. 进入支付沙箱，回跳后展示“核验中”再成功；
6. 学习中心出现课程，从上次位置续播；
7. 切断网络，上报进入 Outbox；
8. 恢复网络，进度补发且不重复；
9. 展示 Sentry 中同一 traceId 关联后端日志；
10. 展示测试、OpenAPI 和 CI 记录。

演示前准备稳定测试数据和录屏备用，但不要伪造线上规模。

## 五、README 应包含

```markdown
# CourseMall Mobile

## 项目背景与目标
## 功能截图/演示视频
## 技术栈与版本
## 架构图与目录说明
## 本地启动
## 环境配置（不含 Secret）
## 后端接口与 OpenAPI
## 核心设计
### Token single-flight
### 订单幂等
### 支付最终一致性
### 播放进度 Outbox
## 测试与覆盖范围
## 性能基线
## 安全清单
## 构建发布
## 已知限制与下一步
```

“已知限制”不会减分，反而说明你知道生产边界，例如：

- 支付目前使用沙箱；
- iOS 构建需 macOS；
- 国内 Android 推送需要厂商通道；
- 高价值视频 DRM 未纳入首版；
- 第三方热更新未作为关键依赖。

## 六、简历写法

不要写：

> 使用 Flutter 完成课程商城，实现登录、列表、支付等功能。

可以写：

> 独立设计并实现 CourseMall Flutter 双端应用，采用 Riverpod + go_router + Dio + Drift 的 feature-first 分层架构，完成登录、课程检索、幂等下单、支付核验、HLS 学习与离线进度补偿闭环。

> 设计 Access/Refresh Token 会话状态机及并发 401 single-flight 刷新；订单创建通过 Idempotency-Key 与服务端唯一约束防重，支付结果以服务端验签回调和主动查询为准。

> 建立 Unit/Widget/Integration 测试、OpenAPI 契约检查、Sentry 前后端 traceId 关联和多环境签名构建流水线，并在指定真机上记录启动、帧耗时与内存基线。

只写你真正实现并能现场解释的内容。性能数字必须附设备、模式和测量证据。

## 七、项目亮点如何讲

### 亮点 1：并发 Token 刷新

```text
问题：多个请求同时 401 会重复 refresh，轮换 Token 互相覆盖
方案：一个共享 Future 做 single-flight，请求等待同一次刷新
保护：刷新请求用裸 Dio，每个业务请求最多重试一次
失败：统一清理会话并回登录
验证：并发测试断言 refresh 只调用一次
```

### 亮点 2：订单幂等

```text
问题：双击、超时和代理重试会重复下单
方案：一次购买意图生成一个 Idempotency-Key
服务端：(userId, key) 唯一约束并返回已有结果
超时：复用原 key 查询/重试，不创建新意图
验证：并发请求数据库只有一单
```

### 亮点 3：支付一致性

```text
客户端回跳不可信
→ 服务端验签并核对金额
→ 回调幂等更新支付单/订单
→ Outbox 异步开通权益
→ App 主动查询展示最终状态
→ 定时对账补偿漏单
```

### 亮点 4：离线进度

```text
弱网上报失败 → Drift Outbox
网络恢复 → 指数退避补发
服务端按 idempotencyKey 去重
同课时任务合并，只留最新有效进度
```

## 八、高频面试题与短答

1. **为什么选 Flutter？**

   单代码库覆盖 Android/iOS，UI 一致且可接原生能力；项目用它补齐 Java 后端的完整移动端交付。

2. **Riverpod 比 setState 好在哪里？**

   setState 适合局部 UI；Riverpod 适合跨组件业务状态、异步状态、依赖注入和可替换测试。

3. **为什么分 Service 和 Repository？**

   Service 处理协议通信，Repository 提供业务数据并协调远程/本地，UI 不受数据源变化影响。

4. **如何防止重复下单？**

   客户端复用幂等键，服务端用用户 + 幂等键唯一约束并返回第一次结果。

5. **支付成功以谁为准？**

   以服务端验签回调/主动查询为准，客户端回跳只触发查询。

6. **如何处理并发 401？**

   共享刷新 Future，所有失败请求等待同一次 refresh，成功后各自最多重试一次。

7. **离线任务为什么可能重复？**

   服务端成功后客户端可能在删任务前崩溃，所以采用至少一次投递并要求服务端幂等。

8. **Flutter 卡顿怎么排查？**

   真机 profile 查看 UI/Raster 时间线，再检查重建、布局、图片解码、CPU 和内存，不凭感觉优化。

9. **WebSocket 消息能当最终状态吗？**

   不能，消息会丢、重复或乱序；它用于通知缓存失效，最终状态再走 HTTP。

10. **App 里怎样保护 Secret？**

    真正服务端 Secret 根本不进入 App；用户 Token 使用短期会话和系统安全存储，日志统一脱敏。

## 九、你必须能画出的图

```text
用户操作
  ↓
Widget → Controller → Repository
                       ├→ Dio → Spring Boot
                       └→ Drift/Secure Storage
                                  ↓
                           AsyncValue/UI State
```

以及支付图：

```text
App ─创建支付→ 后端 ─签名请求→ 支付渠道
App ←收银台──────────────┘
App ←回跳（不可信）────── 渠道
后端 ←验签回调（权威）── 渠道
App ─查询结果→ 后端 → 订单/权益状态
```

## 十、后端待补接口清单

为避免移动端文档与现有 Java 项目脱节，后端至少核对或补充：

- Refresh Token rotation/logout/current-user；
- 移动端首页聚合和搜索；
- 详情聚合、章节与收藏；
- 订单 quote、列表、详情、幂等创建、退款；
- 播放会话与短期签名 URL；
- 原生 WebSocket 端点；
- 设备推送注册；
- 预签名上传和 complete；
- OpenAPI 与 traceId。

这些是你后续完善 Java 项目的明确任务，不在 Flutter 端伪造。

## 十一、最终交付物

- [ ] Flutter 源码仓库；
- [ ] Java 后端仓库；
- [ ] OpenAPI 契约；
- [ ] 架构图；
- [ ] 数据库 ER 图；
- [ ] README 和本地运行步骤；
- [ ] 演示视频/截图；
- [ ] 测试报告；
- [ ] 性能报告；
- [ ] 安全清单；
- [ ] CI 运行记录；
- [ ] Android 内测包；
- [ ] iOS 构建说明；
- [ ] 面试讲解提纲。

## 十二、真实性底线

- 没接真实支付就说“沙箱支付”，不要说“已商用”；
- 没有真实用户就不写“十万用户”；
- 没有压测就不写“高并发”；
- 没有测量就不写百分比优化；
- 第三方服务能力和自己实现要区分；
- 遇到限制能说明取舍和下一步。

面试项目最有价值的不是功能数量，而是你能从需求、架构、失败场景、验证证据一路讲通。

## 十三、知识点索引

- Flutter 生产项目的端到端架构与依赖方向。
- 会话、订单、支付、权益和进度的状态机。
- 幂等、最终一致性、离线补偿和前向兼容。
- 测试、性能、安全、可观测性和双端发布。
- README、证据链、简历表达和技术答辩。

## 十四、课程完成检查

- [ ] 能不看文档讲清四个核心亮点
- [ ] 能现场画出客户端分层和支付时序
- [ ] 能运行主链路并演示两个故障场景
- [ ] 每个简历表述都有代码或报告证据
- [ ] 清楚列出项目边界与后续优化
