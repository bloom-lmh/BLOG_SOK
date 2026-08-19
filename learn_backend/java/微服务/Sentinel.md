# Sentinel

> 一句话定位：Sentinel 是阿里巴巴开源的**流量治理组件**，它以「资源 + 规则」为核心，提供流量控制（限流）、熔断降级、热点参数限流、系统自适应保护、授权控制等一系列能力，核心目的是防止某个接口或服务被突发流量打挂，避免微服务链路发生**级联雪崩**。

---

## 基础篇

### 1. 背景：微服务为什么需要「流量治理」

在微服务架构下，一个对外请求往往要穿透多个服务，形成一条调用链：

```
浏览器
   │
   ▼
┌─────────┐   RPC    ┌─────────┐   RPC    ┌─────────┐
│ 网关     │────────▶│ 订单服务 │────────▶│ 库存服务 │
│ Gateway │          │ Order   │          │ Stock   │
└─────────┘          └─────────┘          └─────────┘
```

假设「库存服务」因为一次大促流量过大、或者依赖的数据库变慢，导致它的接口响应时间从 20ms 涨到 2s。此时会发生什么？

1. **线程耗尽**：订单服务调用库存时，每个请求都会占用一个线程等待返回。库存变慢后，订单服务的线程池被「等待中的请求」逐渐占满。
2. **资源传导**：订单服务自己也变慢了，于是网关调订单服务也开始等待，网关的线程也被占满。
3. **级联失败 / 雪崩**：最终整条链路上的每个服务都因为「等待下游」而耗尽资源，一个服务的故障像雪崩一样传导到整个系统。

这就是经典的**雪崩效应（Cascading Failure / Avalanche）**。它的本质不是「某个服务挂了」，而是**故障通过「同步等待」这个机制被放大和传导**。

> 小结：流量治理要解决的不是「让服务跑得更快」，而是「在负载异常时，让系统**有损但可用**」——宁可拒绝一部分请求、降级一部分功能，也不让整个系统被拖垮。

### 2. Sentinel 是什么

Sentinel（哨兵）是阿里中间件团队开源的**轻量级、高可用**流量治理组件，2018 年贡献给社区并进入 Spring Cloud Alibaba 生态。它的定位可以用一句话概括：

> **以「资源」为维度，通过「规则」定义行为，以「责任链」串起限流、熔断、降级、系统保护等能力。**

它的几个核心特点：

| 特点 | 说明 |
| --- | --- |
| **资源抽象** | 把「要保护的东西」抽象成 `Resource`，可以是接口、方法、一段代码，甚至一个服务，与业务解耦 |
| **规则独立** | 规则（Rule）与资源分离，规则可**动态加载、实时生效**，不用重启应用 |
| **多维度流控** | 支持 QPS、并发线程数、热点参数、链路、关联资源等多种限流维度 |
| **细粒度熔断** | 支持慢调用比例、异常比例、异常数三种熔断策略 |
| **实时监控** | 自带控制台（Dashboard），可视化配置规则、实时查看调用量/响应时间/异常 |
| **无侵入** | 支持注解、代码 API、与 Spring Cloud / Dubbo / gRPC 等无缝集成 |
| **高性能** | 统计模块用**滑动窗口 + 无锁/CAS** 设计，单机 QPS 统计开销极低（约几纳秒级别） |

### 3. 核心概念全景

在深入之前，先把 Sentinel 的几个核心概念建立起来，后面所有规则都围绕它们展开：

| 概念 | 英文 | 含义 |
| --- | --- | --- |
| 资源 | Resource | 被保护的对象，一个「唯一标识字符串」+ 一段代码。如 `"GET:/order/{id}"` |
| 规则 | Rule | 围绕资源定义的策略，如「该资源每秒最多 100 个请求」 |
| Entry | Entry | 一次「进入资源」的凭证，`SphU.entry(resource)` 返回，业务结束 `entry.exit()` 释放 |
| 上下文 | Context | 一次调用的上下文，标识「从哪个入口进来」，关联调用链 |
| 节点 | Node | 统计单元，保存某个资源（或某个集群）的实时统计数据 |
| 插槽 | Slot | 责任链上的一个处理器，每个 Slot 负责一种能力（统计/流控/熔断/系统保护） |
| 兜底 | BlockHandler / Fallback | 被限流/熔断后的降级逻辑 |
| 控制台 | Dashboard | 可视化配置规则、监控流量的 Web 端 |

用一张图串起来，理解一次请求如何被 Sentinel 接管：

```
请求进入
   │
   ▼
SphU.entry("createOrder")   ← 声明要进入的资源
   │
   ▼
构造 Context（从 ThreadLocal 取或新建）
   │
   ▼
沿责任链 Slot Chain 逐个检查：
   NodeSelectorSlot → ClusterBuilderSlot → StatisticSlot → AuthoritySlot
   → SystemSlot → FlowSlot → DegradeSlot → ParamFlowSlot
   │
   ├── 全部通过 → 返回 Entry，执行业务逻辑 → entry.exit() 统计
   └── 某 Slot 拦截 → 抛 BlockException → 走 blockHandler 兜底
```

> 小结：Sentinel 把「拦截逻辑」全部收敛到一条**责任链**上，业务代码只通过 `SphU.entry` / `@SentinelResource` 与它交互，这就是它能做到「无侵入 + 可插拔」的根本原因。

### 4. Sentinel 与 Hystrix 对比

Sentinel 常被拿来和 Netflix Hystrix 对比，二者都是「熔断降级」领域的经典组件，但 Hystrix 已经停止维护（进入维护模式），Sentinel 成为主流选择：

| 维度 | Hystrix | Sentinel |
| --- | --- | --- |
| 隔离策略 | 线程池隔离 / 信号量隔离 | 信号量（资源维度）隔离，无额外线程开销 |
| 熔断策略 | 异常比例 | 慢调用比例、异常比例、异常数 |
| 限流 | 不支持独立限流 | 支持 QPS / 并发线程数 / 热点参数 / 链路 |
| 规则管理 | 代码写死、改动需重启 | 规则可**动态加载、实时生效**，支持多种数据源 |
| 控制台 | 监控功能有限 | 独立 Dashboard，配置 + 监控 + 集群流控 |
| 生态/状态 | 已停更 | 活跃维护，深度整合 Spring Cloud Alibaba / Dubbo |
| 统计模型 | 固定窗口（滑动窗口简陋） | 滑动窗口，统计更精确 |

::: tip 💡 面试题：Sentinel 和 Hystrix 的本质区别？
结论：Hystrix 的核心是**隔离 + 熔断**（通过线程池/信号量把故障隔开），Sentinel 的核心是**资源 + 规则 + 责任链**（把流量治理抽象成可动态配置的规则）。
原因：Hystrix 的设计围绕「保护调用方」展开，隔离是其灵魂；Sentinel 的设计围绕「对资源的通用治理」展开，限流、熔断、降级都是规则的一种，因此扩展性更强，这也是它能在限流维度做得比 Hystrix 细得多的原因。
:::

### 5. 快速入门

#### 5.1 引入依赖

以 Spring Cloud Alibaba 为例（版本对应 Spring Cloud 版本，这里以 2021.0.x / 2.2.x 系列为例）：

```xml
<dependencies>
    <!-- Sentinel 核心 + Spring Cloud 适配 -->
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-sentinel</artifactId>
    </dependency>
</dependencies>
```

```yaml
spring:
  cloud:
    sentinel:
      transport:
        dashboard: localhost:8858   # 控制台地址，服务会主动向它注册并上报心跳
        port: 8719                  # 本机与控制台通信的 HTTP 端口（默认 8719）
```

#### 5.2 启动控制台

下载 `sentinel-dashboard.jar` 后启动（控制台本身也是一个 Spring Boot 应用）：

```bash
java -Dserver.port=8858 -Dcsp.sentinel.dashboard.server=localhost:8858 \
     -Dproject.name=sentinel-dashboard \
     -jar sentinel-dashboard.jar
```

访问 `http://localhost:8858`，默认账号密码都是 `sentinel`。

> 为什么服务要主动连控制台，而不是控制台连服务？
> 控制台是「被注册 + 被动拉取」的架构：服务启动后，通过 `transport.port` 的 HTTP 端点向控制台注册自己的机器信息，控制台再通过该端点下发规则、拉取监控数据。这样设计的好处是**控制台无需维护服务的注册中心**，服务可以动态增减。

#### 5.3 最小示例

```java
@RestController
public class OrderController {

    // 声明资源 + 指定被限流时的兜底方法
    @SentinelResource(value = "createOrder", blockHandler = "createOrderBlock")
    @GetMapping("/order/create")
    public String createOrder(Long userId) {
        // 正常业务逻辑：这里假设下单成功
        return "下单成功，userId = " + userId;
    }

    // 兜底方法：被限流/熔断时走这里，避免请求堆积
    // 注意：方法签名必须与原方法一致，并在最后多一个 BlockException 参数
    public String createOrderBlock(Long userId, BlockException e) {
        return "系统繁忙，请稍后再试";
    }
}
```

第一次访问接口后，资源 `createOrder` 就会出现在控制台，此时可以在控制台给它配置流控规则。

### 6. 两种使用方式：注解 vs 代码 API

Sentinel 提供两种接入方式，理解它们的差异和适用场景很重要：

| 方式 | 写法 | 优点 | 缺点 | 适用场景 |
| --- | --- | --- | --- | --- |
| 注解方式 | `@SentinelResource` | 声明式、可读性好、兜底逻辑清晰 | 只能标注在方法上，粒度受限于方法 | 业务方法级保护 |
| 代码方式 | `SphU.entry()` / `Tracer.trace()` | 灵活，可保护任意代码块，可细粒度控制 | 侵入业务代码、样板代码多 | 框架集成、非注解场景 |

#### 6.1 代码 API 方式

```java
import com.alibaba.csp.sentinel.Entry;
import com.alibaba.csp.sentinel.SphU;
import com.alibaba.csp.sentinel.Tracer;
import com.alibaba.csp.sentinel.slots.block.BlockException;

public void process(String orderId) {
    Entry entry = null;
    try {
        // 1. 进入资源：如果被限流，这里直接抛 BlockException
        entry = SphU.entry("processOrder");
        // 2. 正常业务逻辑
        doBiz(orderId);
    } catch (BlockException e) {
        // 3. 被限流/熔断，走降级
        handleBlock(orderId);
    } catch (Throwable t) {
        // 4. 业务异常：需要手动上报给统计模块，才会被「异常熔断」统计到
        Tracer.trace(t);
        handleError(orderId);
    } finally {
        // 5. 无论成功失败都要释放 Entry，否则会导致并发统计错误
        if (entry != null) {
            entry.exit();
        }
    }
}
```

> 为什么 `finally` 里必须 `entry.exit()`？
> Entry 本质是一个「资源占用凭证」，内部记录了进入时间、当前线程等信息。如果进入后不释放，**线程数统计会一直不归零**，导致并发线程数限流、以及后续的统计都失真，甚至内存泄漏（Entry 挂在 ThreadLocal/调用树节点上）。

#### 6.2 注解方式 vs 代码方式的映射

| 代码 API | 注解属性 | 说明 |
| --- | --- | --- |
| `SphU.entry("xxx")` | `@SentinelResource(value = "xxx")` | 声明资源 |
| `catch (BlockException)` | `blockHandler` / `blockHandlerClass` | 被限流/熔断的兜底 |
| `catch (Throwable) + Tracer.trace` | `fallback` / `fallbackClass` | 业务异常的兜底 |
| `ContextUtil.enter(...)` | 无直接对应（注解自动建上下文） | 手动指定调用入口 |

### 7. blockHandler 与 fallback 的完整辨析

这是 Sentinel 使用中最高频的混淆点，必须彻底分清：

| 属性 | 处理什么 | 触发条件 | 方法签名要求 | 常见用途 |
| --- | --- | --- | --- | --- |
| `blockHandler` | `BlockException` 及其子类 | 被**限流、熔断、系统保护、授权**拦截 | 参数与原方法一致 + 末尾多一个 `BlockException` | 「系统繁忙，请稍后再试」 |
| `fallback` | 任意 `Throwable` | 原方法**自身抛异常**（如空指针、SQL 异常） | 参数与原方法一致，可加 `Throwable` | 记录日志、返回默认值 |
| 两者同时存在 | 先 blockHandler 后 fallback | 限流走 blockHandler，业务异常走 fallback | —— | 完整兜底 |

```java
@RestController
public class PayController {

    // 同时配置 blockHandler 和 fallback，覆盖两种失败场景
    @SentinelResource(
            value = "pay",
            blockHandler = "payBlock",   // 被 Sentinel 拦截
            fallback = "payFallback"     // 业务抛异常
    )
    public String pay(Long orderId) {
        if (orderId == null) {
            throw new IllegalArgumentException("orderId 不能为空"); // 触发 fallback
        }
        return "支付成功";
    }

    // 限流/熔断兜底：签名 = 原方法 + BlockException
    public String payBlock(Long orderId, BlockException e) {
        return "限流了，请稍后再试";
    }

    // 业务异常兜底：签名 = 原方法 + Throwable（可选）
    public String payFallback(Long orderId, Throwable t) {
        return "支付失败：" + t.getMessage();
    }
}
```

**为什么要用 `blockHandlerClass` / `fallbackClass`？**

兜底方法默认要求写在**同一个类**里，如果兜底逻辑要复用、或原类已经很臃肿，可以把兜底方法抽到独立的类：

```java
// 兜底方法集中管理
public final class CommonBlockHandler {
    // 必须是 static 方法，签名与原方法一致 + BlockException
    public static String globalBlock(Long orderId, BlockException e) {
        return "全局限流兜底";
    }
}

// 使用 blockHandlerClass 指定兜底类
@SentinelResource(
        value = "pay",
        blockHandler = "globalBlock",
        blockHandlerClass = CommonBlockHandler.class
)
public String pay(Long orderId) { ... }
```

> 注意：`blockHandlerClass` 里的方法必须是 **`static`** 且 `public`，否则 Sentinel 反射调用时会失败。

### 8. 常见踩坑与最佳实践

这些是实际使用中最高频的坑，务必提前避开：

#### 8.1 兜底方法签名不对导致不生效

**坑**：`blockHandler` / `fallback` 的方法签名必须与原方法**完全一致**（参数类型、顺序、返回值），否则运行期抛异常。

```java
// 原方法
public String createOrder(Long userId) { ... }

// ❌ 错误：参数类型不一致（String vs Long）
public String createOrderBlock(String userId, BlockException e) { ... }

// ✅ 正确：参数完全一致 + 末尾 BlockException
public String createOrderBlock(Long userId, BlockException e) { ... }
```

#### 8.2 同时配置 blockHandler 和 fallback 的优先级

**坑**：两者同时配置时，很多人以为「先 fallback 后 blockHandler」。实际是：**被 Sentinel 拦截 → 走 blockHandler；业务自身抛异常 → 走 fallback**，二者互不干扰，各管各的。

#### 8.3 业务异常没有被熔断统计

**坑**：用代码 API 方式时，业务异常如果不调用 `Tracer.trace(e)`，异常熔断规则**永远不触发**。注解方式由框架自动上报，代码方式必须手动上报。

```java
catch (Throwable t) {
    Tracer.trace(t);   // 必须手动上报，否则「异常比例/异常数」熔断统计不到
    // 处理异常...
}
```

#### 8.4 链路限流不生效

**坑**：链路限流（`STRATEGY_CHAIN`）必须用 `ContextUtil.enter(入口名)` 显式建立入口上下文，否则 Sentinel 无法区分「请求是从哪个入口进来的」。

```java
// 在请求入口（如过滤器/拦截器）里显式声明入口
ContextUtil.enter("goodsList");   // 入口名，对应 FlowRule 的 refResource
try {
    // 后续的 SphU.entry / 注解资源都在这个 Context 下
    chain.doFilter(req, resp);
} finally {
    ContextUtil.exit();
}
```

#### 8.5 规则重启就丢

**坑**：默认规则存内存，服务重启丢失。生产环境务必配置数据源（Nacos）持久化，否则每次重启都要重新推规则。

#### 8.6 最佳实践小结

| 实践 | 说明 |
| --- | --- |
| 兜底逻辑保持「轻量」 | 兜底方法里不要再做耗时操作，否则起不到快速失败的作用 |
| 阈值先压测再上线 | QPS/线程数阈值不是拍脑袋定的，要根据压测结果设置 |
| 规则统一管理 | 用配置中心集中管理规则，而不是散落在各服务的代码里 |
| 异常必须上报 | 代码方式务必 `Tracer.trace`，否则熔断统计失效 |
| 兜底要有返回值 | 兜底方法的返回值类型要与原方法一致，保证调用方能拿到结果 |

---

## 高级篇

### 1. 流控规则（FlowRule）全解析

流控是 Sentinel 最核心、最常用的能力。它的本质回答三个问题：**按什么限（grade）、对谁限（strategy）、超了怎么办（controlBehavior）**。

#### 1.1 FlowRule 字段总览

| 字段 | 说明 | 取值 |
| --- | --- | --- |
| `resource` | 资源名，必填 | 字符串，如 `"createOrder"` |
| `count` | 阈值 | 数字，如 QPS=10 表示每秒最多 10 个 |
| `grade` | 限流维度 | `FLOW_GRADE_QPS`（0）按 QPS / `FLOW_GRADE_THREAD`（1）按并发线程数 |
| `strategy` | 调用关系策略 | `STRATEGY_DIRECT`（0）直接 / `STRATEGY_RELATE`（1）关联 / `STRATEGY_CHAIN`（2）链路 |
| `controlBehavior` | 流量控制行为 | `CONTROL_BEHAVIOR_DEFAULT`（0）快速失败 / `CONTROL_BEHAVIOR_WARM_UP`（1）预热 / `CONTROL_BEHAVIOR_RATE_LIMITER`（2）排队等待 |
| `refResource` | 关联资源/入口资源名 | 配合 strategy 使用 |
| `warmUpPeriodSec` | 预热时长（秒） | 配合 WARM_UP 使用 |
| `maxQueueingTimeMs` | 排队等待的最大超时 | 配合 RATE_LIMITER 使用 |
| `limitApp` | 针对调用来源限流 | `default`（所有）或指定来源名 |
| `clusterMode` | 是否集群流控 | true/false |

#### 1.2 grade：按 QPS 还是按线程数

这是限流最基础的分流：

- **QPS（每秒请求数）**：统计滑动窗口内的请求总量，超过阈值就拒绝。适合**快接口**、保护的是「吞吐量」。
- **线程数（并发线程数）**：统计当前正在处理的请求数（即「进入资源但还没 exit」的线程数），超过阈值就拒绝。适合**慢接口**、保护的是「线程资源不被占满」。

```java
FlowRule qpsRule = new FlowRule();
qpsRule.setResource("createOrder");
qpsRule.setGrade(RuleConstant.FLOW_GRADE_QPS); // 按 QPS
qpsRule.setCount(100);                          // 每秒最多 100 个
FlowRuleManager.loadRules(Collections.singletonList(qpsRule));
```

```java
FlowRule threadRule = new FlowRule();
threadRule.setResource("queryReport");          // 一个很慢的报表接口
threadRule.setGrade(RuleConstant.FLOW_GRADE_THREAD); // 按并发线程数
threadRule.setCount(20);                        // 同时最多 20 个线程在跑
FlowRuleManager.loadRules(Collections.singletonList(threadRule));
```

::: tip 💡 面试题：QPS 限流和线程数限流怎么选？
结论：快接口用 QPS 限流（保护吞吐量），慢接口用线程数限流（保护线程资源）。
原因：快接口每个请求占用线程时间极短，线程数限流几乎拦不住，QPS 才敏感；而慢接口即使 QPS 不高，也会因为「长时间占用线程」把线程池耗尽，所以要用并发线程数来兜底。两者本质是「流量速率」和「资源占用」两个维度的防护。
:::

#### 1.3 strategy：直接 / 关联 / 链路

- **直接（DIRECT）**：最常用，对当前资源自己限流。
- **关联（RELATE）**：A 关联 B，当 **B 的流量超过阈值时，A 被限流**。典型场景：**支付接口**和**下单接口**共享数据库，当下单（B）流量过大时，优先保证支付（A）的可用性，于是限制下单，保护关联的支付。
- **链路（CHAIN）**：只限制从**某个入口**进入的调用，其他入口不受限。典型场景：同一个资源 `getGoods` 被「商品列表」和「商品详情」两个入口调用，只想限制「商品列表」这条链路的流量。

```java
// 关联策略：下单流量过大时，限制支付接口
FlowRule relateRule = new FlowRule();
relateRule.setResource("pay");                        // 被限流的资源 A
relateRule.setStrategy(RuleConstant.STRATEGY_RELATE); // 关联策略
relateRule.setRefResource("createOrder");             // 关联的资源 B
relateRule.setGrade(RuleConstant.FLOW_GRADE_QPS);
relateRule.setCount(100);                             // B 超过 100 QPS 时，A 被限流
```

```java
// 链路策略：只限制「商品列表」入口进入的 getGoods
FlowRule chainRule = new FlowRule();
chainRule.setResource("getGoods");
chainRule.setStrategy(RuleConstant.STRATEGY_CHAIN);   // 链路策略
chainRule.setRefResource("goodsList");                // 入口资源名
chainRule.setGrade(RuleConstant.FLOW_GRADE_QPS);
chainRule.setCount(50);
```

> 链路限流要生效，必须在代码里用 `ContextUtil.enter(入口名)` 显式指定入口上下文，否则 Sentinel 无法区分「是从哪个入口进来的」。在 Spring 环境下，通常需要借助框架（如 Sentinel Web 适配器）或自定义拦截器来建立入口。

#### 1.4 controlBehavior：超阈值后的三种行为

| 行为 | 常量 | 含义 | 适用 |
| --- | --- | --- | --- |
| 快速失败 | `CONTROL_BEHAVIOR_DEFAULT` | 超过阈值**直接拒绝**（抛 `FlowException`） | 默认、通用 |
| 预热 Warm Up | `CONTROL_BEHAVIOR_WARM_UP` | 阈值从 `count / coldFactor` 缓慢升到 `count`，冷启动保护 | 缓存刚启动、JIT 未热身、DB 连接池未满 |
| 排队等待 | `CONTROL_BEHAVIOR_RATE_LIMITER` | 请求排队、**匀速通过**，超过等待时间再拒绝 | 需要削峰填谷、匀速下游的场景 |

```java
// 预热：冷启动时先只放行 1/3，10 秒内缓慢升到满阈值 100
FlowRule warmRule = new FlowRule();
warmRule.setResource("seckill");
warmRule.setGrade(RuleConstant.FLOW_GRADE_QPS);
warmRule.setCount(100);                                   // 最终阈值
warmRule.setControlBehavior(RuleConstant.CONTROL_BEHAVIOR_WARM_UP);
warmRule.setWarmUpPeriodSec(10);                          // 预热 10 秒
```

```java
// 排队等待：每秒匀速放行 100 个，单个请求最多排队 500ms
FlowRule queueRule = new FlowRule();
queueRule.setResource("sendMsg");
queueRule.setGrade(RuleConstant.FLOW_GRADE_QPS);
queueRule.setCount(100);
queueRule.setControlBehavior(RuleConstant.CONTROL_BEHAVIOR_RATE_LIMITER);
queueRule.setMaxQueueingTimeMs(500);                      // 超过 500ms 排队就拒绝
```

### 2. 熔断降级规则（DegradeRule）

限流是「事前拦截」，熔断是「事后保护」——当某个资源已经变慢/异常时，快速失败，避免继续放大故障。

#### 2.1 三种熔断策略

| 策略 | 常量 | 判断依据 | 参数 | 适用场景 |
| --- | --- | --- | --- | --- |
| 慢调用比例 | `DEGRADE_GRADE_RT` | 响应时间 > `count`(ms) 的请求占比超过阈值 | `count`=慢调用阈值(ms)、`slowRatioThreshold`=慢调用比例、`timeWindow`=熔断时长 | 接口变慢 |
| 异常比例 | `DEGRADE_GRADE_EXCEPTION_RATIO` | 异常数/请求数 > 阈值 | `count`=异常比例(0~1)、`timeWindow` | 接口频繁报错 |
| 异常数 | `DEGRADE_GRADE_EXCEPTION_COUNT` | 一分钟内异常数 > 阈值 | `count`=异常数、`timeWindow` | 异常量明确 |

```java
// 慢调用比例熔断：响应超过 300ms 的比例超过 30%，熔断 10 秒
DegradeRule rtRule = new DegradeRule("queryStock")
        .setGrade(RuleConstant.DEGRADE_GRADE_RT)
        .setCount(300)               // 慢调用阈值 300ms
        .setSlowRatioThreshold(0.3)  // 慢调用比例 30%
        .setTimeWindow(10);          // 熔断 10 秒
DegradeRuleManager.loadRules(Collections.singletonList(rtRule));
```

```java
// 异常比例熔断：异常比例超过 50%，熔断 5 秒
DegradeRule ratioRule = new DegradeRule("pay")
        .setGrade(RuleConstant.DEGRADE_GRADE_EXCEPTION_RATIO)
        .setCount(0.5)               // 异常比例 50%
        .setTimeWindow(5);
```

> 熔断的「异常」必须被 `Tracer.trace(e)` 上报（注解方式由框架自动上报），否则异常不会被统计，熔断规则形同虚设。

#### 2.2 熔断器三态（关闭 / 打开 / 半开）

熔断器是一个**状态机**，这是理解熔断的核心：

```
       请求失败/慢调用达到阈值
   ┌──────────────────────────────┐
   │                              ▼
┌──────┐   满足熔断条件    ┌──────────┐   超过熔断时长(timeWindow)   ┌──────────┐
│ CLOSED │────────────────▶│  OPEN    │──────────────────────────▶│ HALF_OPEN │
│ 关闭态  │                  │ 打开态    │                            │  半开态    │
└──────┘                  └──────────┘                            └─────┬────┘
   ▲   正常放行                ▲  直接拒绝                              │
   │                          │                             放行一个探测请求
   │                          │                                      │
   └──────────────────────────┴──────────────────────────────────────┤
                      探测成功 → 回到关闭态                             │
                      探测失败 → 回到打开态，重新计时                    ▼
```

- **CLOSED（关闭）**：正常放行请求，同时统计慢调用/异常。
- **OPEN（打开）**：直接拒绝所有请求（抛 `DegradeException`），不再调用下游，避免故障扩散。
- **HALF_OPEN（半开）**：熔断时长过后，放行**一个探测请求**去试探下游是否恢复：
  - 探测成功 → 关闭熔断，恢复正常。
  - 探测失败 → 重新打开熔断，重新计时。

### 3. 热点参数限流（ParamFlowRule）

普通限流对「整个资源」生效，热点参数限流对「资源里的某个参数」生效，比如「同一个商品 id 每秒最多 5 个请求」，而不同商品之间互不影响。

```java
// 对 queryGoods 的第 0 个参数做热点限流：同一个参数值每秒最多 5 个
ParamFlowRule paramRule = new ParamFlowRule("queryGoods")
        .setParamIdx(0)                              // 参数下标，从 0 开始
        .setGrade(RuleConstant.FLOW_GRADE_QPS)       // 按 QPS
        .setCount(5);                                // 每个参数值每秒最多 5 个
ParamFlowRuleManager.loadRules(Collections.singletonList(paramRule));
```

配合注解使用：

```java
@SentinelResource(value = "queryGoods", blockHandler = "queryGoodsBlock")
public Goods queryGoods(String goodsId) {
    return goodsService.getById(goodsId);
}
```

**高级用法：参数例外项**——某些参数值可以单独放行更高的阈值（如热门商品 id 单独给 1000 QPS）：

```java
ParamFlowRule rule = new ParamFlowRule("queryGoods")
        .setParamIdx(0)
        .setGrade(RuleConstant.FLOW_GRADE_QPS)
        .setCount(5);
// 例外项：goodsId = "10086" 的请求每秒允许 1000 个
ParamFlowItem item = new ParamFlowItem()
        .setObject("10086")
        .setClassType(String.class.getName())
        .setCount(1000);
rule.setParamFlowItemList(Collections.singletonList(item));
```

### 4. 系统保护规则（SystemRule）

前面的规则都是「针对某个资源」，系统保护规则是「针对整台机器」的**全局兜底**，从系统负载维度防止机器被打垮：

| 字段 | 含义 | 说明 |
| --- | --- | --- |
| `highestSystemLoad` | 系统最高 Load（Linux 1 分钟平均负载） | 超过则限流，`-1` 表示不启用 |
| `highestCpuUsage` | 最高 CPU 使用率（0~1） | 超过则限流 |
| `qps` | 全局最大 QPS | 整机入口 QPS 上限 |
| `avgRt` | 所有入口平均响应时间 | 超过则限流 |
| `maxThread` | 最大并发线程数 | 整机并发线程上限 |

```java
SystemRule sysRule = new SystemRule();
sysRule.setHighestSystemLoad(4.0);   // 机器 1 分钟 Load 超过 4 就整体限流
sysRule.setMaxThread(1000);          // 整机并发线程超过 1000 就整体限流
SystemRuleManager.loadRules(Collections.singletonList(sysRule));
```

> 系统规则只对**入口资源**（Entry Type 为 `IN` 的资源）生效，因为它保护的是「系统整体」，而不是某个内部方法。这与流控规则面向任意资源不同。

### 5. 授权规则（AuthorityRule，黑白名单）

根据「调用来源」做黑白名单控制：

```java
AuthorityRule authRule = new AuthorityRule();
authRule.setResource("adminApi");
authRule.setStrategy(RuleConstant.AUTHORITY_WHITE);  // 白名单：只允许下面的来源访问
authRule.setLimitApp("app1,app2");                   // 来源名，逗号分隔
AuthorityRuleManager.loadRules(Collections.singletonList(authRule));
```

| 策略 | 含义 |
| --- | --- |
| `AUTHORITY_WHITE` | 白名单：只放行 `limitApp` 里的来源，其余拒绝 |
| `AUTHORITY_BLACK` | 黑名单：拒绝 `limitApp` 里的来源，其余放行 |

调用来源的识别依赖 `RequestOriginParser` 接口，需要自定义实现（如从请求头里取 app 标识）。

### 6. 规则持久化

#### 6.1 为什么需要持久化

Sentinel 的规则**默认存在内存**里（`RuleManager` 的 Map），服务重启就丢失，且控制台推的规则只对单机生效。生产环境需要把规则外置到**配置中心**，实现「一次配置、全局生效、动态更新」。

#### 6.2 三种持久化模式

| 模式 | 说明 | 优缺点 |
| --- | --- | --- |
| 原始模式（内存） | 规则存内存，控制台推送 | 简单，但重启丢失、不支持集群一致 |
| Pull 模式 | 服务定期从数据源拉取规则 | 简单，但有延迟、不能实时 |
| Push 模式（推荐） | 配置中心推送规则到所有实例 | 实时、集群一致，需改造控制台或数据源 |

#### 6.3 基于 Nacos 的持久化

引入 `sentinel-datasource-nacos` 依赖后，规则从 Nacos 读取：

```xml
<dependency>
    <groupId>com.alibaba.csp</groupId>
    <artifactId>sentinel-datasource-nacos</artifactId>
</dependency>
```

```yaml
spring:
  cloud:
    sentinel:
      datasource:
        ds-flow:                              # 数据源名，可配多个
          nacos:
            server-addr: localhost:8848       # Nacos 地址
            data-id: ${spring.application.name}-flow-rules
            group-id: DEFAULT_GROUP
            data-type: json
            rule-type: flow                   # 规则类型：flow / degrade / system / authority / param-flow
        ds-degrade:
          nacos:
            server-addr: localhost:8848
            data-id: ${spring.application.name}-degrade-rules
            group-id: DEFAULT_GROUP
            rule-type: degrade
```

Nacos 中的流控规则 JSON 示例（`data-id` 对应上面的配置）：

```json
[
  {
    "resource": "createOrder",
    "grade": 1,
    "count": 100,
    "strategy": 0,
    "controlBehavior": 0,
    "limitApp": "default"
  }
]
```

> `rule-type` 与规则类的对应：`flow` → `FlowRule`、`degrade` → `DegradeRule`、`system` → `SystemRule`、`authority` → `AuthorityRule`、`param-flow` → `ParamFlowRule`、`gw-flow` → 网关流控。

### 7. 整合 Spring Cloud 生态

#### 7.1 整合 OpenFeign

给 Feign 客户端加 Sentinel 兜底，下游服务不可用时快速降级：

```yaml
feign:
  sentinel:
    enabled: true   # 开启 Feign 的 Sentinel 支持
```

```java
// Feign 客户端：fallback 指定降级实现类
@FeignClient(name = "stock-service", fallback = StockClientFallback.class)
public interface StockClient {
    @GetMapping("/stock/{id}")
    String getStock(@PathVariable("id") Long id);
}

// 降级实现：下游不可用时返回默认值
@Component
public class StockClientFallback implements StockClient {
    @Override
    public String getStock(Long id) {
        return "库存服务暂不可用";   // 降级兜底
    }
}
```

#### 7.2 整合 Gateway 网关

网关是流量的第一道入口，在这里做限流能「御敌于国门之外」：

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-route
          uri: lb://order-service
          predicates:
            - Path=/order/**
          filters:
            - name: RequestRateLimiter   # 网关限流过滤器
              args:
                redis-rate-limiter.replenishRate: 100   # 每秒填充令牌数
                redis-rate-limiter.burstCapacity: 200   # 令牌桶容量
                key-resolver: "#{@userKeyResolver}"     # 限流维度（按用户/按 IP/按路径）
```

```java
// 按 IP 限流的 key 解析器
@Bean
public KeyResolver userKeyResolver() {
    return exchange -> Mono.just(
        exchange.getRequest().getRemoteAddress().getAddress().getHostAddress()
    );
}
```

### 8. 控制台（Dashboard）使用

控制台是 Sentinel 的**可视化操作界面**，用于配置规则、监控流量，是日常使用最频繁的入口。

#### 8.1 控制台能做什么

| 功能 | 说明 |
| --- | --- |
| 实时监控 | 查看每个资源的 QPS、响应时间、通过/拒绝数、并发线程数 |
| 流控规则 | 新增/修改/删除 FlowRule，动态下发到服务 |
| 熔断规则 | 配置 DegradeRule（慢调用/异常比例/异常数） |
| 热点规则 | 配置 ParamFlowRule，可视化热点参数 |
| 系统规则 | 配置整机维度的保护规则 |
| 授权规则 | 配置黑白名单 |
| 集群流控 | 配置 Token Server 与集群规则 |

#### 8.2 关键操作流程

1. **看流量**：服务启动并首次访问接口后，在「簇点链路」里能看到资源列表，点进去看实时 QPS、RT、线程数。
2. **配规则**：在资源的「流控」页新增规则，填阈值、选 grade / strategy / controlBehavior，保存后**立即生效**。
3. **验证**：压测或频繁刷新接口，观察「通过 QPS / 拒绝 QPS」是否按预期变化。

> 控制台是「实时下发」的：保存规则后，控制台会通过服务的 `transport.port` HTTP 端点把规则推给对应机器，因此改动无需重启即可生效（前提是服务端与控制台网络互通）。

#### 8.3 控制台的局限

| 局限 | 说明 |
| --- | --- |
| 规则默认不持久化 | 控制台推的规则存服务内存，重启丢失（需配合 Nacos 等数据源） |
| 单机维度 | 默认规则只对单机生效，集群一致需集群流控 |
| 监控数据有延迟 | 服务定时上报，非实时精确到每毫秒 |

---

### 9. 集群流控

单机限流有一个先天缺陷：阈值是**单机维度**的。假设集群有 10 台机器，你想限制「总 QPS 不超过 1000」，单机流控只能每台限 100，但流量分配不均时（某台收到 500），单机 100 的限制就无法精确控制集群总量。

集群流控通过一个 **Token Server** 统一分配令牌，实现「整个集群共享一个阈值」：

```
请求 → 本机 Client ──远程──▶ Token Server（统一计数/发令牌）
                                  │
                                  ▼
                        集群总阈值 = 1000（全局共享）
```

集群流控需要引入 `sentinel-cluster-client` / `sentinel-cluster-server` 依赖，并通过控制台或 API 指定 Token Server。它是「精确集群限流」的解决方案，但引入了一定复杂度和单点风险，需要评估后使用。

---

---

## 原理篇

这一篇深入 Sentinel 的**源码结构与运行机制**，是面试考察的重点，也是真正理解「为什么 Sentinel 快、准、可扩展」的关键。

### 1. 整体架构与核心类

Sentinel 的核心类图（简化）：

```
                        ┌──────────────────────┐
                        │      SphU            │  ← 入口 API：entry() / asyncEntry()
                        │  (静态门面)           │
                        └──────────┬───────────┘
                                   │ 委托
                                   ▼
                        ┌──────────────────────┐
                        │   CtSph（实现类）      │  ← 真正干活的地方
                        └──────────┬───────────┘
                                   │
              构建 Context + 调用 SlotChain
                                   │
                    ┌──────────────┼───────────────┐
                    ▼              ▼               ▼
            ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
            │   Context    │  │  Node(树)   │  │  SlotChain  │
            │  (调用上下文) │  │  (统计节点)  │  │  (责任链)    │
            └─────────────┘  └─────────────┘  └──────┬──────┘
                                                     │
                              由 8 个 Slot 按顺序组成（见 1.2）
```

**入口流程（完整）**：

1. 业务调用 `SphU.entry("resource")`，委托给 `CtSph`。
2. `CtSph` 从 `ThreadLocal` 里获取（或新建）`Context`，并生成 `Entry` 对象。
3. `CtSph` 取得该资源对应的 `ProcessorSlotChain`（责任链），依次执行。
4. 责任链里 `StatisticSlot` 做统计，`FlowSlot`/`DegradeSlot` 等做规则校验。
5. 全部通过则返回 `Entry` 给业务；否则抛 `BlockException`。
6. 业务执行完调用 `entry.exit()`，释放资源、结束统计。

### 1.2 责任链 Slot Chain 详解

Sentinel 把「统计、限流、熔断、授权、系统保护」拆成一个个 Slot，用**责任链模式**串起来，这是它「可插拔、易扩展」的架构基石。

默认责任链由 8 个 Slot 组成，**顺序固定**（顺序很重要，后置依赖前置的产物）：

```
请求
 │
 ▼
┌────────────────────────────────────────────────────────────────┐
│ 1. NodeSelectorSlot      收集调用路径，构建 Context 里的节点树     │
│ 2. ClusterBuilderSlot    构建/复用 集群节点 ClusterNode            │
│ 3. LogSlot               记录异常日志（BlockException）            │
│ 4. StatisticSlot         统计！记录 RT、QPS、线程数、异常（核心）   │
│ 5. AuthoritySlot         授权校验（黑白名单）                      │
│ 6. SystemSlot            系统保护校验（CPU、Load、并发）           │
│ 7. FlowSlot              流控校验（限流）                         │
│ 8. DegradeSlot           熔断降级校验                             │
└────────────────────────────────────────────────────────────────┘
 │
 ├── 任意 Slot 抛 BlockException → 中断链路，走 blockHandler
 └── 全部通过 → 返回 Entry，执行业务
```

**为什么 StatisticSlot 排在 FlowSlot 前面？**
因为流控（FlowSlot）依赖统计数据来判断「是否超过阈值」，必须先由 StatisticSlot 完成统计，FlowSlot 才能拿到正确的 QPS/线程数去判断。如果顺序反了，FlowSlot 拿到的永远是「上一秒」的旧数据。

| Slot | 职责 | 关键产物 |
| --- | --- | --- |
| NodeSelectorSlot | 为当前资源创建 DefaultNode，挂到 Context 的节点树上 | 调用树节点 |
| ClusterBuilderSlot | 维护资源的 ClusterNode（聚合了该资源所有上下文的统计） | 集群统计节点 |
| LogSlot | 记录 `BlockException` 日志 | 日志 |
| StatisticSlot | 记录耗时、成功/异常、并发线程数 | Metric 滑动窗口 |
| AuthoritySlot | 校验调用来源黑白名单 | 授权结果 |
| SystemSlot | 校验系统负载（Load/CPU/并发） | 系统保护结果 |
| FlowSlot | 校验流控规则 | 限流结果 |
| DegradeSlot | 校验熔断规则 | 熔断结果 |

> 注意：热点参数限流（ParamFlow）不在默认责任链里，它是 `@SentinelResource` 切面里额外做的处理（通过 `ParamFlowSlot` 动态插入），因为参数限流需要拿到方法参数，只有注解切面能方便地拿到参数。

### 2. Context 与 Node 资源调用树

#### 2.1 Context：一次调用的上下文

- 每个请求进入时，`ContextUtil.enter(name)` 创建一个 Context，name 通常标识「入口来源」（如 `sentinel_web_servlet_context`、feign 调用的目标服务名）。
- Context 保存在 `ThreadLocal` 里，线程内的后续 `SphU.entry` 都复用这个 Context。
- Context 内部维护一个 `Node` 树（调用树），记录「本次调用经过哪些资源」。

#### 2.2 Node 树：三层统计结构

```
Context（一次入口调用）
  └── EntranceNode（入口节点，如 "sentinel_web_servlet_context"）
        └── DefaultNode("createOrder")      ← 本次调用经过的资源
              ├── DefaultNode("queryStock")  ← createOrder 又调用了 queryStock
              └── DefaultNode("queryCoupon")
```

Sentinel 的统计节点分为几类：

| 节点类型 | 作用 | 粒度 |
| --- | --- | --- |
| `DefaultNode` | 某个**上下文**中某资源的统计 | Context + Resource 维度 |
| `ClusterNode` | 某个资源**跨所有上下文**的统计 | Resource 维度（限流主要用它） |
| `EntranceNode` | 入口的统计 | 入口维度 |
| `StatisticNode` | 上述节点的公共父类，持有一个 `Metric` 滑动窗口 | —— |

**为什么限流用 ClusterNode 而不是 DefaultNode？**
因为流控规则针对的是「资源」，不关心请求从哪个入口进来（除非是链路限流）。`ClusterNode` 聚合了所有上下文对同一资源的访问，正好匹配「按资源限流」的语义；而 `DefaultNode` 是「资源 × 上下文」的细粒度统计，用于链路限流。

### 3. 滑动窗口统计原理（核心）

Sentinel 的 QPS/RT 统计是基于**滑动窗口**实现的，这是它高性能、高精度的根本。

#### 3.1 为什么不用固定窗口

固定窗口把时间切成固定段（如 0~1s、1~2s），统计当前段内的请求数。它的致命问题是**临界突刺**：

```
固定窗口：每秒 1 段，阈值 = 10

时间轴：  0s ──────── 1s ──────── 2s
窗口1 [0,1):  10 个请求
窗口2 [1,2):  10 个请求

在 0.9s~1.1s 这短短 0.2s 内，实际到达了 20 个请求
（0.9~1.0 的 10 个 + 1.0~1.1 的 10 个）
但固定窗口看不到这个突刺，每个窗口都"没超"，于是 20 个请求全被放行
→ 限流失效，下游被打爆
```

#### 3.2 滑动窗口的结构

滑动窗口把 1 秒拆成 N 个**小格子（bucket）**，统计的是「最近 N 个格子的请求数之和」。时间窗口整体向前滑动，越老的格子越早被丢弃：

```
滑动窗口：1 秒拆成 5 个 bucket，每个 bucket 200ms，统计最近 5 个 bucket

         过去                               现在
  ┌─────────┬─────────┬─────────┬─────────┬─────────┐
  │ bucket1 │ bucket2 │ bucket3 │ bucket4 │ bucket5 │
  │ (旧)     │         │         │         │ (当前)   │
  └─────────┴─────────┴─────────┴─────────┴─────────┘
  ◀────────────── 滑动窗口（1 秒）──────────────▶

时间推进 200ms 后，最旧的 bucket1 被丢弃，新的 bucket6 加入：
  ┌─────────┬─────────┬─────────┬─────────┬─────────┐
  │ bucket2 │ bucket3 │ bucket4 │ bucket5 │ bucket6 │
  └─────────┴─────────┴─────────┴─────────┴─────────┘
```

这样任意时刻的 QPS 都是「最近 1 秒的真实请求数」，临界突刺被消解。

#### 3.3 核心类：LeapArray / WindowWrap / MetricBucket

源码结构：

```
LeapArray（滑动窗口抽象，环形数组）
   │
   ├── sampleCount    : 每秒钟格子数（如 2 个格子，每个 500ms）
   ├── intervalInMs   : 总窗口时长（默认 1000ms）
   ├── windowLengthInMs: 每格时长 = intervalInMs / sampleCount
   │
   ├── array          : AtomicReferenceArray<WindowWrap<T>>  环形数组
   │
   └── currentWindow() : 定位当前时间对应的格子（无锁 + CAS）
         │
         ▼
   WindowWrap<T>（一个格子的包装）
         │
         ├── windowStart : 本格子的起始时间戳
         ├── windowLength: 本格子时长
         └── value       : MetricBucket（真正的统计数据）
                │
                ▼
   MetricBucket（一个格子里的统计值，用 LongAdder 存）
         ├── pass      : 通过的请求数
         ├── block     : 被拦截的请求数
         ├── success   : 成功的请求数
         ├── exception : 异常的请求数
         ├── rt        : 响应时间总和
         └── minRt     : 最小响应时间
```

**内存布局（字节级视角）**：

```
LeapArray
 ┌────────────────────────────────────────────┐
 │ sampleCount = 2        （每秒 2 个格子）      │
 │ intervalInMs = 1000ms                      │
 │ windowLengthInMs = 500ms                   │
 │                                            │
 │ array (AtomicReferenceArray, 长度 = 2)     │
 │  ┌──────────────┬──────────────┐           │
 │  │ index 0      │ index 1      │           │
 │  │ WindowWrap   │ WindowWrap   │           │
 │  │ [t0, t0+500) │ [t0+500,t0+1s)│          │
 │  │  MetricBucket │  MetricBucket │          │
 │  └──────────────┴──────────────┘           │
 └────────────────────────────────────────────┘
```

#### 3.4 如何无锁定位当前格子

`currentWindow()` 的核心逻辑：

1. 用 `当前时间 / windowLengthInMs` 计算出「当前时间应该落在哪个格子」。
2. 对 `sampleCount` 取模，得到环形数组的下标（因为数组是环形的，老的格子被复用）。
3. 如果该格子的 `windowStart` 与当前时间匹配，直接返回（**命中，无锁**）。
4. 如果不匹配，说明这个格子已经过期，需要「重置」为新的时间窗口，用 **CAS** 尝试写入，失败则说明别的线程抢先重置了，直接重试或返回。

```java
// LeapArray.currentWindow() 伪代码（简化）
public WindowWrap<T> currentWindow(long timeMillis) {
    // 1. 计算当前格子下标
    int idx = calculateTimeIdx(timeMillis);  // (timeMillis / windowLengthInMs) % array.length()

    // 2. 计算当前格子应有的起始时间
    long windowStart = calculateWindowStart(timeMillis);

    while (true) {
        WindowWrap<T> old = array.get(idx);
        if (old == null) {
            // 3. 格子还没创建，new 一个并用 CAS 塞进去
            WindowWrap<T> window = new WindowWrap<>(windowLengthInMs, windowStart, newEmptyBucket());
            if (array.compareAndSet(idx, null, window)) {
                return window;   // CAS 成功，返回
            } else {
                Thread.yield();  // CAS 失败，别的线程抢先了，让出 CPU 重试
            }
        } else if (windowStart == old.windowStart()) {
            // 4. 格子时间匹配，命中
            return old;
        } else if (windowStart > old.windowStart()) {
            // 5. 格子过期，CAS 重置它
            if (updateLock.tryLock()) {
                try {
                    return resetWindowTo(old, windowStart);
                } finally {
                    updateLock.unlock();
                }
            } else {
                Thread.yield();
            }
        } else {
            return new WindowWrap<>(windowLengthInMs, windowStart, newEmptyBucket());
        }
    }
}
```

> 为什么这样能「无锁」高性能？
> 读路径（命中当前格子）完全不需要锁，只是读一个 `AtomicReferenceArray` 元素；只有「格子过期重置」的罕见写路径才用 CAS 竞争。绝大多数请求都走「命中」这条快路径，因此统计开销极低。

#### 3.5 MetricBucket 用 LongAdder 而非 AtomicLong

`MetricBucket` 里的计数器（pass、block、rt 等）用的是 `LongAdder`，而不是 `AtomicLong`：

- `AtomicLong` 在高并发下所有线程竞争同一个变量，**CAS 自旋严重**，性能随并发数上升而下降。
- `LongAdder` 内部把计数分散到多个 Cell（类似分段锁），写时先定位自己的 Cell，**减少竞争**，最后 `sum()` 时再汇总。这正是 [并发编程](/learn_backend/java/Java核心/并发编程) 里讲到的「空间换时间、热点分散」思想。

### 4. 限流算法全景对比

Sentinel 底层综合运用了多种经典限流算法，理解它们的差异是面试重点：

#### 4.1 四种算法对比

| 算法 | 原理 | 能否应对突发 | 平滑度 | Sentinel 对应 |
| --- | --- | --- | --- | --- |
| 固定窗口计数器 | 固定时间段内计数 | 不能（临界突刺） | 差 | 早期/简单场景 |
| 滑动窗口计数器 | 拆成小格，统计最近 N 格 | 一般 | 较好 | **默认 QPS 限流** |
| 漏桶（Leaky Bucket） | 恒定速率流出，请求排队 | 不能（削峰） | 最好 | **排队等待**（RATE_LIMITER） |
| 令牌桶（Token Bucket） | 恒定速率放令牌，可攒令牌 | 能（允许突发） | 较好 | 预热/网关限流思想 |

#### 4.2 ASCII 图解

**漏桶（匀速，削峰）：**

```
请求 →  ┌───┬───┬───┐
        │   │   │   │  水（请求）以恒定速率从底部流出
        │   │   │   │  桶满了就溢出（拒绝）
        └───┴───┴───┘
              ↓
        恒定速率输出（漏）
```

**令牌桶（可突发）：**

```
令牌生成器 ──▶ 以固定速率往桶里放令牌

        ┌───┬───┬───┐
        │ T │ T │ T │   ← 桶里可以攒令牌（容量有限）
        └───┴───┴───┘

请求到达 → 取一个令牌 → 有令牌才放行
                        → 没令牌就拒绝（或等待）
攒下的令牌 = 允许的突发流量
```

> Sentinel 的「排队等待」（RATE_LIMITER）底层是**漏桶思想**：以固定速率匀速放行，用 `maxQueueingTimeMs` 控制排队上限；「预热」（WARM_UP）底层是**令牌桶的慢启动**：阈值从低位缓慢上升到目标值。

### 5. 熔断器状态机的源码机制

前面高级篇讲了熔断的三态，这里下到源码看它如何判断与切换：

```
DegradeRule 的三种策略在源码里对应三个判断逻辑（CircuitBreaker 接口）：

1. 慢调用比例（ResponseTimeCircuitBreaker）
   → 判断：慢调用数 / 总调用数 > slowRatioThreshold
   慢调用 = RT > maxAllowedRt 的请求

2. 异常比例（ExceptionRatioCircuitBreaker）
   → 判断：异常数 / 总调用数 > count

3. 异常数（ExceptionCircuitBreaker）
   → 判断：一分钟内异常数 > count
```

**状态切换机制（以异常比例为例）：**

```
[CLOSED 状态]
  每来一个请求 → 计入滑动窗口
  计算: 异常比例 = exception / total
        │
        ├── 异常比例 > count 且 total >= minRequestAmount
        │       → 切换到 OPEN，记录熔断开始时间
        └── 否则 → 保持 CLOSED，正常放行

[OPEN 状态]
  当前时间 - 熔断开始时间 < timeWindow
        → 直接拒绝，抛 DegradeException（不调用下游）

  当前时间 - 熔断开始时间 >= timeWindow
        → 切换到 HALF_OPEN

[HALF_OPEN 状态]
  放行一个探测请求
        ├── 探测成功（无异常/不慢）→ 切换到 CLOSED，恢复正常
        └── 探测失败 → 切换到 OPEN，重新计时
```

> 注意：源码里有 `minRequestAmount`（最小请求数）保护，避免「流量极低时，一次异常就误触发熔断」。例如异常比例 50%，但总共才 2 个请求、1 个异常，此时不该熔断——所以要先满足最小请求数。

### 6. 规则如何动态生效

Sentinel 的规则能「改了立刻生效」而不重启，靠的是**事件监听 + 内存缓存**机制：

```
规则数据源（Nacos / 控制台 / 本地文件）
        │
        │ 数据源监听器监听到变更
        ▼
  FlowRuleManager.loadRules(newRules)   ← 规则管理器重载
        │
        ├── 更新内存里的规则 Map
        │
        └── 通知所有监听该规则变化的监听器
                │
                ▼
        FlowSlot 下次校验时，读到的是新规则（无需重启）
```

- `RuleManager` 内部用 `Map<String, List<Rule>>` 存「资源 → 规则列表」。
- `FlowSlot.checkFlow()` 每次调用都**实时从内存 Map 取规则**，因此只要 Map 更新了，下次校验立即生效。
- 数据源（DataSource）负责「监听外部变化 → 解析规则 → 调用 loadRules」，把外部存储和内存缓存打通。

### 7. 并发控制与线程安全设计总结

| 场景 | 手段 | 目的 |
| --- | --- | --- |
| 滑动窗口定位当前格子 | `AtomicReferenceArray` + CAS | 读路径无锁 |
| 格子内计数 | `LongAdder` | 分散热点，减少 CAS 竞争 |
| 规则管理 | `volatile` + `CopyOnWrite` / `synchronized` | 规则读写安全 |
| Context 传递 | `ThreadLocal` | 线程内隔离，跨方法传递上下文 |
| 熔断状态切换 | `AtomicInteger`（状态机 CAS） | 状态切换原子性 |

这些设计与 [JVM 内存模型](/learn_backend/java/Java核心/JVM) 和 [并发编程](/learn_backend/java/Java核心/并发编程) 里的「无锁化、CAS、LongAdder、ThreadLocal」一脉相承，是理解高性能中间件的通用范式。

---

---

## 面试常问

**1. Sentinel 有哪几大核心功能？**

结论：流量控制（限流）、熔断降级、系统自适应保护、热点参数限流、授权控制，核心是防止服务被流量打挂、避免级联雪崩。
展开：它以「资源 + 规则」为抽象，用责任链把统计、限流、熔断、授权、系统保护串起来；相比 Hystrix 的「隔离 + 熔断」，Sentinel 把流量治理抽象成可动态配置的规则，因此扩展性更强、限流维度更细。

**2. blockHandler 和 fallback 的区别？**

结论：blockHandler 处理 `BlockException`（被限流/熔断/系统保护拦截），fallback 处理业务异常（任意 `Throwable`）。
展开：两者触发条件不同——blockHandler 是「Sentinel 主动拦截」，fallback 是「业务方法自己抛异常」；方法签名都要求与原方法一致，但 blockHandler 末尾多一个 `BlockException` 参数。两者可同时配置，各管各的失败场景。

**3. 限流的 grade 有哪两种？怎么选？**

结论：QPS（每秒请求数）和并发线程数。
展开：快接口用 QPS 限流（保护吞吐量），慢接口用线程数限流（保护线程资源不被长时间占满）。本质是「流量速率」和「资源占用」两个维度的防护，慢接口即使 QPS 不高也会因长时间占用线程而拖垮系统。

**4. 流控的 controlBehavior 三种行为分别是什么？**

结论：快速失败（直接拒绝）、Warm Up（预热，阈值缓慢爬升）、排队等待（匀速通过）。
展开：快速失败是默认行为；Warm Up 用于冷启动保护（如缓存未热、JIT 未优化），底层是令牌桶慢启动思想；排队等待用于削峰填谷，底层是漏桶匀速思想，配合 `maxQueueingTimeMs` 控制排队上限。

**5. Sentinel 的 QPS 统计怎么实现？为什么不用固定窗口？**

结论：用**滑动窗口**（LeapArray），把 1 秒拆成多个小格，统计最近 N 格请求数。
展开：固定窗口存在「临界突刺」问题——窗口交界处会把两个窗口的流量算在一起导致限流失准；滑动窗口时间粒度更细、统计更平滑。底层用 `AtomicReferenceArray` + CAS 实现读路径无锁、`LongAdder` 分散计数热点，所以性能极高。

**6. 熔断器的三种状态和切换流程？**

结论：关闭（CLOSED）、打开（OPEN）、半开（HALF_OPEN）。
展开：满足熔断条件（慢调用比例/异常比例/异常数）时从关闭切到打开，打开态直接拒绝请求；熔断时长（timeWindow）过后切到半开，放行一个探测请求试探下游，成功则关闭、失败则重新打开并计时。

**7. 规则怎么持久化？**

结论：默认存内存、重启丢失；生产环境通过数据源（DataSource）推到 Nacos 等配置中心持久化。
展开：有三种模式——原始模式（内存）、Pull 模式（定时拉取）、Push 模式（配置中心推送，推荐）。引入 `sentinel-datasource-nacos` 后配置 `spring.cloud.sentinel.datasource` 即可从 Nacos 读取规则，改动实时生效、全集群一致。

**8. 单机限流的缺陷？集群流控解决什么？**

结论：单机限流阈值是单机维度，无法精确控制「集群总 QPS」；集群流控用 Token Server 统一分配令牌。
展开：10 台机器想限制总 QPS 1000，单机限流只能每台限 100，流量不均时无法精确控制总量；集群流控通过独立的 Token Server 全局计数、统一发令牌，实现集群共享一个阈值，但引入复杂度和单点，需评估后使用。

---

相关阅读：[Spring Cloud](/learn_backend/java/微服务/Spring Cloud) · [Gateway](/learn_backend/java/微服务/Gateway) · [Nacos](/learn_backend/java/微服务/Nacos) · [OpenFeign](/learn_backend/java/微服务/OpenFeign) · [Seata](/learn_backend/java/微服务/Seata) · [并发编程](/learn_backend/java/Java核心/并发编程) · [JVM](/learn_backend/java/Java核心/JVM)



