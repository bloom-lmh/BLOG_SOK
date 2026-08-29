# Day 17 · 熔断限流（Sentinel 流控 / 熔断降级 / 热点限流 / 规则持久化）

> **今天目标**：给 `mall-user` 接入 Sentinel，实现「接口级 QPS 流控、慢调用熔断 + 业务异常降级、热点参数限流」，并把规则持久化到 Nacos（服务重启后规则不丢）。

本日项目根目录统一为 `E:\CourseMall`。Sentinel 依赖和配置应加入每个需要保护的
可执行服务；示例 Java 路径均相对于对应模块的 `src\main\java`。

## 一、前置条件

- 已完成 **Day 13（服务拆分 + Nacos 注册）**：父 pom 已引入 Spring Cloud Alibaba `2023.0.1.0` BOM
- 已完成 **Day 14（配置中心）**：`mall-user` 能从 Nacos 拉配置，`dev` 命名空间已建好
- 已完成 **Day 15（OpenFeign）/ Day 16（Gateway）**：知道「服务间远程调用」「统一入口」的存在（本天只动 `mall-user`，但熔断的对象通常是这些远程调用）
- **Nacos Server 已启动**（`http://localhost:8848/nacos`，账号 `nacos/nacos`）

> 本天额外需要一个新组件：**Sentinel 控制台（Dashboard）**，步骤 1 会下载并启动它。
>
> ⚠️ 实验端点只在 `dev` 环境开启，并要求管理员 Token。统一从 9000 网关访问；不把“直连服务绕过网关”当作正常联调方案。

## 二、先搞懂：Sentinel 到底在解决什么问题

微服务「服务间互相调用」带来的最大风险是 **服务雪崩**：

| 场景 | 结果 |
|---|---|
| 课程服务被请求打爆 / 出现慢 SQL | 请求堆积，课程服务线程耗尽 → 崩溃 |
| 用户服务还在不停调课程服务 | 用户服务线程也被拖垮 → 跟着崩 |
| 用户服务崩了，调用它的网关/订单也崩 | 故障像多米诺骨牌一路扩散，**整个集群雪崩** |

Sentinel 就是「流量防卫兵」，在服务「撑不住之前」就出手，把风险挡在门口：

- **流控（限流）**：超过 QPS/线程数阈值就直接拒绝，不让请求进来堆积
- **熔断降级**：下游慢/出错到一定程度，先「熔断」不再调它，返回兜底结果，等它恢复
- **热点限流**：对某个「热点参数」（如某个热门课程 ID）单独限流
- **系统保护**：按整体 CPU 负载、入口 QPS 兜底保护（本天不展开，见知识库）

::: tip 💡 面试题：什么是服务雪崩？Sentinel 靠什么防雪崩？
**一句话**：一个服务故障顺着调用链扩散、拖垮整条链路的连锁崩溃就是雪崩；Sentinel 靠「限流（不让流量超载）+ 熔断降级（下游不行就快速失败、不再拖垮自己）」在源头阻断扩散。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

::: tip 💡 面试题：Sentinel 和 Hystrix 有什么区别？
**一句话**：Hystrix 已停止维护（进入维护模式），Sentinel 是当前主流——两者都做熔断降级，但 Sentinel 额外提供**细粒度流控（QPS/线程数/热点参数/系统级）、控制台可视化实时配置、规则动态生效**，且不用像 Hystrix 那样为每个依赖「新建线程池/信号量」来隔离。详见 [Sentinel](/learn_backend/java/微服务/Sentinel)。
:::

## 三、步骤

### 步骤 1：引入依赖 + 启动 Sentinel 控制台

打开 `E:\course-mall\mall-user\pom.xml`，在 `<dependencies>` 里**新增**：

```xml
<!-- Sentinel：流控/熔断/热点限流。版本由 Day13 引入的 Spring Cloud Alibaba BOM 统一管理，不写版本号 -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-sentinel</artifactId>
</dependency>
```

**下载并启动控制台**（控制台本身是个独立 Spring Boot 应用，和业务服务无关）：

```bash
# 1. 下载 Dashboard（版本 1.8.6，与本课程 SCA 2023.0.1.0 对应）
#    下载地址：https://github.com/alibaba/Sentinel/releases/download/1.8.6/sentinel-dashboard-1.8.6.jar

# 2. 启动（用 8858 端口，避开 mall-user 的 8080）
java -Dserver.port=8858 -jar sentinel-dashboard-1.8.6.jar
```

浏览器打开 `http://localhost:8858`，账号密码都是 `sentinel`。

::: tip 💡 面试题：为什么是「服务主动连控制台」，而不是「控制台连服务」？
**一句话**：控制台是「被注册 + 被动拉取」架构——服务启动后通过 `transport.port` 这个 HTTP 端点主动向控制台注册自己并上报心跳，控制台再通过该端点**下发规则、拉监控数据**；好处是控制台无需维护服务注册表，服务动态增减它都能自动发现。详见 [Sentinel](/learn_backend/java/微服务/Sentinel)。
:::

### 步骤 2：流控（QPS 限流）

下面的批量命令使用 Bash/Git Bash，先设置 `ADMIN_TOKEN='<管理员Token>'`。PowerShell 则使用 `$env:ADMIN_TOKEN='<管理员Token>'`，命令中改读 `$env:ADMIN_TOKEN`。

新建演示接口 `E:\course-mall\mall-user\src\main\java\com\mall\user\controller\SentinelController.java`（本天四个功能都在这一个 Controller 里）：

```java
package com.mall.user.controller;

import com.alibaba.csp.sentinel.annotation.SentinelResource;
import com.alibaba.csp.sentinel.slots.block.BlockException;
import com.mall.common.result.ErrorCode;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import jakarta.validation.constraints.Positive;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 本天四个功能（流控/熔断/降级/热点）都在这一个 Controller 里演示，
// 用 @SentinelResource 把每个接口注册成 Sentinel 的「资源」
@RestController
@RequestMapping("/api/sentinel")
@Validated
@Profile("dev")
@PreAuthorize("hasRole('ADMIN')")
public class SentinelController {

    // ---------- 1. 流控（QPS 限流）----------
    // value：Sentinel 里的「资源名」，控制台配规则时按这个名字找资源
    // blockHandler：请求被 Sentinel 拦截（限流/熔断/热点）时走的兜底方法
    @GetMapping("/flow")
    @SentinelResource(value = "flow", blockHandler = "flowBlockHandler")
    public Result<String> flow() {
        return Result.ok("flow 正常访问");
    }

    // blockHandler 方法签名规则：参数和原方法一致 + 末尾多一个 BlockException，返回类型一致
    public Result<String> flowBlockHandler(BlockException ex) {
        return Result.fail(ErrorCode.TOO_MANY_REQUESTS);
    }
}
```

> 为什么要自定义 `blockHandler`？Sentinel 默认被限流时只返回一行纯文本 `Blocked by Sentinel (flow limiting)`，前端拿到的是乱格式。自定义 `blockHandler` 后，被限流也返回统一的 `Result` JSON，和项目其他接口风格一致。

**改造 `application.yml`**，接入控制台（保留 Day13/14 已有的 nacos 配置，只**新增** `sentinel` 段）：

```yaml
spring:
  cloud:
    sentinel:
      transport:
        dashboard: localhost:8858   # 控制台地址，服务会主动向它注册并上报心跳
        port: 8719                  # 本机与控制台通信的端口（默认 8719，被占用会自动 +1）
      eager: true                   # 启动即初始化并连控制台；不加则要等第一次请求后控制台才看到它
```

启动后**先 curl 一次**，让资源 `flow` 出现在控制台里：

```bash
mvn -pl mall-user spring-boot:run      # 在 E:\course-mall\ 根目录
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:9000/api/sentinel/flow
```

**到控制台配流控规则**：`http://localhost:8858` → 左侧「流控规则」→ 新增：

| 字段 | 值 | 含义 |
|---|---|---|
| 资源名 | `flow` | 对应 `@SentinelResource(value = "flow")` |
| 阈值类型 | QPS | 按每秒请求数限流 |
| 单机阈值 | 2 | 每秒最多放行 2 个请求 |
| 流控模式 | 直接 | 直接对当前资源限流（另有「关联」「链路」） |
| 流控效果 | 快速失败 | 超限立即拒绝（另有 Warm Up、排队等待） |

**验证**：快速连续发 20 个请求：

```bash
for i in {1..20}; do curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:9000/api/sentinel/flow; echo; done
```

预期：前 2 个返回 `flow 正常访问`，后面全部返回 `code:429` 的限流 JSON。

::: tip 💡 面试题：QPS 限流和「并发线程数」限流有什么本质区别？
**一句话**：QPS 限流按「每秒进来多少个请求」计数，超出就拒；并发线程数限流按「同一时刻有多少个请求正在处理（没返回）」计数，超了就拒——后者适合「每个请求都吃资源、慢请求」的场景，能把「同时在跑」的请求数压在资源可承受范围内。详见 [并发编程](/learn_backend/java/Java核心/并发编程)。
:::

::: tip 💡 面试题：流控效果里的「快速失败 / Warm Up / 排队等待」分别是什么？
**一句话**：快速失败是超限立即拒绝；Warm Up（预热）是冷启动时阈值从低到高缓慢爬坡，防止瞬时流量把刚启动的服务打崩；排队等待是超限的请求进队列匀速放行（削峰填谷，适合脉冲流量）。详见 [Sentinel](/learn_backend/java/微服务/Sentinel)。
:::

::: tip 💡 面试题：Sentinel 的流控是「单机」还是「集群」维度的？多实例部署时 QPS=2 实际放行多少？
**一句话**：**默认是单机维度**——规则下发到每台实例各自生效，QPS=2 时 N 台实例总共放行 2×N 个请求；要「全集群总 QPS=2」需开启**集群流控**（指定一个 token server 统一计数）。所以生产上限流阈值要考虑实例数，或在网关层再做一层全局限流。详见 [Sentinel](/learn_backend/java/微服务/Sentinel)。
:::

### 步骤 3：熔断降级（慢调用熔断 + 业务异常 fallback）

在 `SentinelController` 里**追加**两个接口：

```java
    // ---------- 2. 熔断降级 ----------
    // 场景A「熔断」：慢调用比例超过阈值 → 打开熔断 → 走 blockHandler
    @GetMapping("/degrade")
    @SentinelResource(value = "degrade", blockHandler = "degradeBlockHandler")
    public Result<String> degrade() throws InterruptedException {
        Thread.sleep(200); // 模拟慢调用（比如查一个很慢的下游接口 / 慢 SQL）
        return Result.ok("degrade 正常返回（耗时 200ms）");
    }

    // DegradeException 也是 BlockException 的子类，所以「熔断打开」时走 blockHandler
    public Result<String> degradeBlockHandler(BlockException ex) {
        return Result.fail(ErrorCode.SERVICE_UNAVAILABLE);
    }

    // 场景B「降级」：业务方法抛异常 → 走 fallback（返回兜底结果，而不是把异常抛给前端）
    @GetMapping("/fallback")
    @SentinelResource(value = "fallback", fallback = "fallbackHandler",
            exceptionsToIgnore = BizException.class)
    public Result<String> fallback() {
        // 模拟下游课程服务挂了：直接抛业务异常
        throw new RuntimeException("下游课程服务调用失败");
    }

    // fallback 方法签名规则：参数和原方法一致 + 末尾多一个 Throwable，返回类型一致
    public Result<String> fallbackHandler(Throwable t) {
        return Result.fail(ErrorCode.SERVICE_UNAVAILABLE);
    }
```

**到控制台配熔断规则**（左侧「降级规则」→ 新增）：

| 字段 | 值 | 含义 |
|---|---|---|
| 资源名 | `degrade` | 对应 `@SentinelResource(value = "degrade")` |
| 降级策略 | 慢调用比例 | 慢调用占比超过阈值就熔断 |
| 最大 RT | 100 (ms) | 超过 100ms 就算「慢调用」 |
| 比例阈值 | 0.5 | 慢调用比例超过 50% 才触发 |
| 熔断时长 | 10 (s) | 熔断 10 秒后放一个探测请求试恢复 |
| 最小请求数 | 5 | 统计窗口内至少 5 个请求才判断（防抖动） |

**验证熔断**：连续打 10 次（每次 sleep 200ms，100% 慢调用，超过 50% 阈值）：

```bash
for i in {1..10}; do curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:9000/api/sentinel/degrade; echo; done
```

预期：前几个返回 `degrade 正常返回（耗时 200ms）`，第 5 个之后熔断打开，请求**瞬间**返回 `课程服务熔断中`（不再等 200ms）。

**验证降级 fallback**：

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:9000/api/sentinel/fallback
```

预期返回 `code:500` + `课程查询降级兜底：下游课程服务调用失败`。如果不配 `fallback`，这个 `RuntimeException` 会冒泡到 Day01 的 `GlobalExceptionHandler` 返回 500——**降级就是提前把异常处理掉，返回一个有意义的兜底结果**。

::: tip 💡 面试题：`blockHandler` 和 `fallback` 到底有什么区别？（高频）
**一句话**：`blockHandler` 处理的是 **`BlockException`**（流控、熔断、热点等 Sentinel 规则触发的「请求被拦」）；`fallback` 处理的是**业务方法内部抛出的非 BlockException**（下游超时、NPE 等「方法执行出错」）。熔断打开抛的是 `DegradeException`（BlockException 子类），所以走 `blockHandler`；下游挂了抛 `RuntimeException`，走 `fallback`。详见 [Sentinel](/learn_backend/java/微服务/Sentinel)。
:::

::: tip 💡 面试题：熔断降级有三种策略，分别适用什么场景？
**一句话**：慢调用比例（RT 超阈值占比高，适合「依赖变慢」）、异常比例（异常占比高，适合「依赖报错」）、异常数（异常绝对数量，适合「请求量很小但一报错就不能忍」）；慢调用比例是生产最常用，因为它能在依赖「变慢还没崩」时就提前熔断。详见 [Sentinel](/learn_backend/java/微服务/Sentinel)。
:::

### 步骤 4：热点参数限流

在 `SentinelController` 里**追加**（热点限流：针对某个「参数值」单独限流）：

```java
    // ---------- 3. 热点参数限流 ----------
    // paramIdx=0（第一个参数 courseId）作为「热点」维度：对热门课程单独限流
    @GetMapping("/hot")
    @SentinelResource(value = "hot", blockHandler = "hotBlockHandler")
    public Result<String> hot(@RequestParam @Positive Long courseId) {
        return Result.ok("查询课程 " + courseId + " 成功");
    }

    // 注意：blockHandler 要带上原方法的参数（courseId），签名才能和原方法对上
    public Result<String> hotBlockHandler(Long courseId, BlockException ex) {
        return Result.fail(ErrorCode.TOO_MANY_REQUESTS);
    }
```

**到控制台配热点规则**（左侧「热点规则」→ 新增）：

| 字段 | 值 | 含义 |
|---|---|---|
| 资源名 | `hot` | 对应 `@SentinelResource(value = "hot")` |
| 参数索引 | 0 | 第 0 个参数 `courseId` 作为热点维度 |
| 单机阈值 | 1 | **每个不同 courseId** 每秒最多 1 个请求 |
| 统计窗口时长 | 1 (s) | 1 秒一个统计窗口 |

**验证**：对**同一个** `courseId=1` 连续打 20 次：

```bash
for i in {1..20}; do curl -s -H "Authorization: Bearer $ADMIN_TOKEN" "http://localhost:9000/api/sentinel/hot?courseId=1"; echo; done
```

预期：第一个返回 `查询课程 1 成功`，后面返回 `课程 1 访问过热`。换个 `courseId=2` 又能正常访问——这就是「热点」：限流是按**参数值**维度的，不是对整个接口一刀切。

::: tip 💡 面试题：热点参数限流和普通 QPS 流控有什么区别？
**一句话**：普通流控对「整个资源」统一限流；热点限流把粒度细到「某个参数值」——例如秒杀场景里 `goodsId=100` 是爆款要单独限流，其他商品不受影响，甚至能用 `paramFlowItemList`（例外项）给指定热门值设**不同的阈值**。详见 [Sentinel](/learn_backend/java/微服务/Sentinel)。
:::

### 步骤 5：规则持久化到 Nacos（重启不丢）

**问题**：上面在控制台配的规则，都存在 Sentinel 客户端**内存**里——服务重启就没了，而且控制台推的规则只对单个实例生效。生产上要把规则外置到**配置中心**。

**方案**：使用 Nacos DataSource 让 Sentinel 启动时读取规则，并监听 Nacos 配置变更。先把 `sentinel-datasource-nacos` 依赖加进实际受保护的服务 `pom.xml`：

```xml
<!-- Sentinel 规则数据源：从 Nacos 读规则（持久化用）。部分 SCA 版本已传递引入，显式声明更稳妥 -->
<dependency>
    <groupId>com.alibaba.csp</groupId>
    <artifactId>sentinel-datasource-nacos</artifactId>
</dependency>
```

**在 `application.yml` 的 `spring.cloud.sentinel` 下追加 `datasource`**（和 `transport` 平级）：

```yaml
spring:
  cloud:
    sentinel:
      transport:
        dashboard: localhost:8858
        port: 8719
      eager: true
      # 规则持久化：从 Nacos 读规则，服务重启后规则还在
      datasource:
        flow:                                   # 数据源名，自定义，随便取
          nacos:
            server-addr: localhost:8848
            namespace: dev                      # 和 Day14 一致，规则配置也要建在 dev 命名空间下
            group-id: DEFAULT_GROUP
            data-id: mall-user-sentinel-flow    # 对应 Nacos 里创建的配置 Data ID
            data-type: json
            rule-type: flow                     # 规则类型：flow=流控
        degrade:
          nacos:
            server-addr: localhost:8848
            namespace: dev
            group-id: DEFAULT_GROUP
            data-id: mall-user-sentinel-degrade
            data-type: json
            rule-type: degrade                  # degrade=熔断
        param-flow:
          nacos:
            server-addr: localhost:8848
            namespace: dev
            group-id: DEFAULT_GROUP
            data-id: mall-user-sentinel-param
            data-type: json
            rule-type: param-flow               # param-flow=热点参数
```

**在 Nacos 控制台创建 3 个规则配置**（左侧「配置管理 → 配置列表」，切到 `dev` 命名空间，新建配置，格式选 `JSON`）：

① `mall-user-sentinel-flow`（流控规则，对应步骤 2 的 dashboard 配置）：

```json
[
  {
    "resource": "flow",
    "grade": 1,
    "count": 2,
    "strategy": 0,
    "controlBehavior": 0,
    "limitApp": "default"
  }
]
```

② `mall-user-sentinel-degrade`（熔断规则，对应步骤 3）：

```json
[
  {
    "resource": "degrade",
    "grade": 0,
    "count": 100,
    "timeWindow": 10,
    "minRequestAmount": 5,
    "slowRatioThreshold": 0.5,
    "statIntervalMs": 1000
  }
]
```

③ `mall-user-sentinel-param`（热点规则，对应步骤 4）：

```json
[
  {
    "resource": "hot",
    "grade": 1,
    "count": 1,
    "paramIdx": 0,
    "durationInSec": 1,
    "controlBehavior": 0,
    "limitApp": "default"
  }
]
```

各 JSON 字段含义（`grade` 是重点，不同规则类型里数值含义不同）：

| 规则 | 关键字段 | 含义 |
|---|---|---|
| flow | `grade`=1 | 1=QPS，0=并发线程数；`count`=阈值 |
| flow | `controlBehavior` | 0=快速失败，1=Warm Up，2=排队等待 |
| degrade | `grade`=0 | 0=慢调用比例，1=异常比例，2=异常数 |
| degrade | `count` | grade=0 时是 RT 阈值(ms)，grade=1 时是异常比例(0~1) |
| param-flow | `paramIdx`=0 | 第 0 个参数作为热点维度；`grade` 只支持 1(QPS) |

**验证持久化**：重启 `mall-user`（**不碰控制台**），直接打请求：

```bash
# 重启后，规则已从 Nacos 加载，不再需要去控制台手动配
for i in {1..20}; do curl -s -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:9000/api/sentinel/flow; echo; done
```

预期：不用控制台配置，重启后依然限流（前 2 个成功，后面 429）。说明规则已经从 Nacos 读进来了。

> ⚠️ 开源 Sentinel Dashboard 中直接修改的规则默认只在客户端内存生效，不会自动写回 Nacos。接入 DataSource 后把 Nacos 作为规则唯一来源；生产中通常改造管理端，让变更先持久化再下发。

::: tip 💡 面试题：Sentinel 规则默认存哪里？为什么重启就丢？怎么持久化？
**一句话**：默认存在客户端**内存**（`RuleManager` 的 Map）里，重启即丢、且只对单机生效；持久化用 `datasource` 把规则外置到 Nacos 等配置中心，客户端启动时读取。详见 [Sentinel](/learn_backend/java/微服务/Sentinel)。
:::

::: tip 💡 面试题：Pull 模式和 Push 模式有什么区别？生产为什么用 Push？
**一句话**：Pull 是客户端定时/启动时从配置中心**拉**规则（简单但有延迟、改规则不能实时到）；Push 是配置中心**推**规则到所有实例（实时、集群一致，但需改造控制台/数据源）。生产要求「改规则立即全集群生效」必须 Push。详见 [Nacos](/learn_backend/java/微服务/Nacos)。
:::

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| Sentinel 流控/熔断/热点/持久化 | [Sentinel](/learn_backend/java/微服务/Sentinel) |
| 服务雪崩、熔断降级 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| 微服务容错体系、`@SentinelResource` | [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) |
| Nacos 作为 Sentinel 规则数据源 | [Nacos](/learn_backend/java/微服务/Nacos) |
| QPS/并发线程数、滑动窗口限流 | [并发编程](/learn_backend/java/Java核心/并发编程) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] Sentinel 控制台 8858 启动成功，`mall-user` 能在控制台看到：是 / 否
- [ ] `/api/sentinel/flow` 配 QPS=2 后，连续请求能返回 429 限流：是 / 否
- [ ] `/api/sentinel/degrade` 触发慢调用熔断，返回「熔断中」兜底：是 / 否
- [ ] `/api/sentinel/fallback` 返回业务异常降级兜底：是 / 否
- [ ] `/api/sentinel/hot?courseId=1` 热点限流生效、换 courseId 又能访问：是 / 否
- [ ] 规则写进 Nacos 后，重启服务不碰控制台仍限流（持久化生效）：是 / 否
- [ ] 踩坑记录（控制台看不到服务、规则不生效、namespace 不匹配等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 为什么熔断要选「慢调用比例」而不是「异常比例」？两者各自适用什么场景？
2. `blockHandler` 和 `fallback` 底层是怎么被区分调用的？如果**只配了 `fallback` 没配 `blockHandler`**，流控/熔断触发（抛 `BlockException`）时会走哪个？为什么？
3. QPS 限流和「并发线程数」限流的本质区别是什么？各自用什么算法/计数器实现？（提示：滑动窗口 vs 信号量/线程计数）
4. 热点参数限流和普通 QPS 流控的区别在哪？`paramIdx` 是什么？「特定值例外」`paramFlowItemList` 能解决什么场景？
5. Sentinel 规则默认存哪里？为什么重启就丢？Pull 模式和 Push 模式的区别是什么？生产上为什么必须 Push？（提示：实时性 + 集群一致性 + 改规则要全实例生效）
