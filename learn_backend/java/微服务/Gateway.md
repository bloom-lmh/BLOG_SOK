# Gateway

> 一句话定位：Spring Cloud Gateway 是 Spring 官方的 API 网关，基于 WebFlux + Reactor Netty 响应式非阻塞模型，统一在服务入口做路由转发、鉴权、限流、跨域、负载均衡等横切逻辑，让客户端只对一个入口、下游微服务专注业务。

## 基础篇

### 为什么需要网关

先回到微服务架构本身。单体应用只有一个入口，所有请求都打进一个进程里，由它自己路由到对应的方法；拆成微服务之后，系统从「一个应用」变成了「一堆服务」，客户端（App / 小程序 / H5 / 第三方系统）立刻会遇到三个麻烦：

| 问题 | 表现 | 后果 |
| --- | --- | --- |
| 入口太多 | 客户端要记住每个服务的 IP + 端口 | 服务一扩缩容、一换地址，客户端全得跟着改 |
| 横切逻辑重复 | 鉴权、日志、限流、跨域每个服务各写一遍 | 代码重复、规则不统一、容易漏 |
| 协议/位置混乱 | 有的 HTTP、有的走别的协议，地址散落 | 客户端无法统一处理，联调成本高 |

网关的作用，就是把这些**与业务无关的横切关注点**（cross-cutting concerns）上收到一个统一入口，做「请求的统一收口」：

```
改造前：客户端直连每个服务（N 个入口，重复鉴权）
   客户端 ──► user-service     （自己鉴权 + 自己跨域 + 自己限流）
   客户端 ──► order-service    （自己鉴权 + 自己跨域 + 自己限流）
   客户端 ──► pay-service      （自己鉴权 + 自己跨域 + 自己限流）

改造后：统一走网关（1 个入口，横切逻辑只做一次）
   客户端 ──► Gateway（统一鉴权/限流/路由/跨域） ──► user-service
                                             ├──► order-service
                                             └──► pay-service
```

一句话记忆：**网关不是干业务的，它是业务前面的「门卫 + 调度员」。**

::: tip 💡 面试题：微服务里为什么要加一层网关？
结论：为了把「鉴权、限流、路由、跨域、日志」这些横切逻辑统一收口，避免每个服务重复实现、规则不一致。
原因：微服务化后入口变多、横切逻辑分散，网关用一个统一入口解决入口收敛与横切复用两个问题，下游服务只管业务。
:::

### 网关的分类：API 网关 vs 服务网关

网关这个词在不同语境下指代不同，先分清两个维度，面试才不会混：

| 类型 | 流量方向 | 典型场景 | 代表 |
| --- | --- | --- | --- |
| API 网关（北向流量） | 客户端 → 系统内部 | 统一鉴权、限流、协议转换、聚合 | Gateway、Kong、APISIX |
| 服务网关（东西流量） | 服务 → 服务 | 服务间调用、灰度、流量管控 | 注册中心 + 负载均衡（Nacos/OpenFeign） |

Spring Cloud Gateway 定位是 **API 网关**，管的是「从外部进入系统」的北向流量；服务之间的东西向流量由 [Nacos](/learn_backend/java/微服务/Nacos) + [OpenFeign](/learn_backend/java/微服务/OpenFeign) 负责。两边各司其职。

### 三大核心概念：Route / Predicate / Filter

Gateway 的一切配置，最终都落到这三个词上。理解它们就理解了整个网关：

| 概念 | 作用 | 一句话 | 类比 |
| --- | --- | --- | --- |
| **Route（路由）** | 定义「请求去哪」 | 一条完整的转发规则 | 地图上的一条导航路线 |
| **Predicate（断言）** | 判断「这个请求走不走这条路」 | 匹配条件，匹配成功才进这条路由 | 路口的红绿灯判断 |
| **Filter（过滤器）** | 在转发前/后对请求、响应加工 | 加工逻辑，可加头、改路径、鉴权、限流 | 路上的检查站 |

一条 Route 的结构拆开看：

```
Route（一条路由 = 完整转发规则）
├── id             ：路由唯一标识（用于日志、断言定位）
├── uri            ：转发目标（http://... 或 lb://服务名）
├── order          ：路由优先级，越小越先匹配（默认 0）
├── predicates     ：一组断言，全部满足才走这条路由
│                      ├── Path=/order/**
│                      └── Method=GET
└── filters        ：一组过滤器，转发前后加工
                       ├── StripPrefix=1
                       └── AddRequestHeader=X-Color, blue
```

注意两个关键规则：
1. **Predicate 是「与」关系**：一条路由里配了多个断言，必须**全部满足**才算命中。
2. **Route 按 order 排序匹配**：请求进来按 order 从小到大遍历路由，**先命中先走，短路返回**。

::: tip 💡 面试题：Gateway 的核心三要素是什么？各自解决什么问题？
结论：Route、Predicate、Filter。Route 决定请求去哪（uri），Predicate 决定匹不匹配（进不进这条路由），Filter 决定怎么加工（转发前后做什么）。
原因：三者组合成一条完整的转发链路——先断言匹配、再按路由转发、转发前后用过滤器加工，缺一不可。
:::

### 工作流程：一个请求在网关里的完整旅程

把上面三个概念串起来，一个请求从进入网关到返回，要经过下面几步：

1. 请求到达网关，先进入 **DispatcherHandler**（WebFlux 的统一入口）。
2. 交给 **RoutePredicateHandlerMapping**，用每条路由的 **Predicate** 逐个匹配，命中一条 Route。
3. 命中后，把这条 Route 放进 exchange 的属性里，交给 **FilteringWebHandler**。
4. FilteringWebHandler 组装这条路由的 **Filter 链**（全局过滤器 + 局部过滤器，按 order 排序）。
5. Filter 链逐层执行 **pre 阶段**（鉴权、限流、改写请求），最后到 **NettyRoutingFilter** 真正把请求转发给 `uri` 指向的下游服务。
6. 拿到下游响应后，Filter 链**反向再走一遍 post 阶段**（加响应头、改写响应），最后返回客户端。

```
浏览器 / App / 小程序
        │ 请求
        ▼
┌──────────────────────────────────────────────┐
│                 Gateway 进程                   │
│                                              │
│  ① DispatcherHandler（WebFlux 统一入口）       │
│        │                                     │
│        ▼                                     │
│  ② RoutePredicateHandlerMapping              │
│     （遍历所有路由，用 Predicate 断言匹配）      │
│        │ 命中某条 Route                       │
│        ▼                                     │
│  ③ FilteringWebHandler                      │
│     （组装 全局Filter + 路由Filter 成一条链）   │
│        │ 逐层 pre：鉴权 → 限流 → 改写请求头     │
│        ▼                                     │
│  ④ NettyRoutingFilter（真正发出请求）          │
│     （lb:// 则先经 LoadBalancerClientFilter    │
│       从注册中心选实例，再拼真实 URL）           │
└──────────────┬───────────────────────────────┘
               │ WebClient 异步发起请求
               ▼
        ┌──────────────┐
        │  下游微服务     │   order-service / user-service
        └──────────────┘
               │ 响应返回
               ▼
   Filter 链反向走一遍（post：加响应头、改写响应）
               │
               ▼
          返回客户端
```

### 为什么选 Gateway 而不是 Zuul

这是面试最高频的对比题。核心差异在**底层线程模型**：

| 对比项 | Spring Cloud Gateway | Zuul 1.x |
| --- | --- | --- |
| 底层技术 | WebFlux + Reactor Netty（响应式非阻塞） | Servlet（阻塞式） |
| 线程模型 | 少量 EventLoop 线程即可支撑高并发 | 每个请求独占一个线程，N 并发 = N 线程 |
| 阻塞点 | 下游 IO 全异步，线程不阻塞等待 | 调用下游时线程阻塞等待，线程池易打满 |
| 与 Spring 生态 | Spring 官方，与 Cloud 无缝集成 | Netflix 开源，已停止维护（Zuul 2 未进主流） |
| 限流 | 内置 RequestRateLimiter（基于 Redis） | 需自己集成 |

两种线程模型的本质区别：

```
Zuul 1.x（Servlet 阻塞式）：
  请求1 ──► 线程1 ──阻塞等待下游响应──► 返回（期间线程1 啥也干不了）
  请求2 ──► 线程2 ──阻塞等待下游响应──► 返回
  请求3 ──► 线程3 ──阻塞等待下游响应──► 返回
  问题：1000 个并发就需要 1000 个线程，线程池满 = 请求被拒，内存/上下文切换开销大

Gateway（Reactor Netty 非阻塞）：
  请求1 ─┐
  请求2 ─┼──► 少量 EventLoop 线程（一般 = CPU 核数 ×2）──异步 IO，事件回调──► 返回
  请求3 ─┘
  优势：线程发出请求后立即去处理下一个，下游回来时用事件回调，少量线程扛住高并发
```

结论一句话：**Gateway 是官方新一代网关，非阻塞响应式，高并发下资源占用更低、吞吐更高**，是现在的默认选择。

### 快速入门：跑通第一个路由

**第一步：引入依赖**（版本由 Spring Cloud 统一管理，见 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)）：

```xml
<!-- 网关核心依赖：spring-cloud-starter-gateway -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-gateway</artifactId>
</dependency>
```

注意：**Gateway 依赖 WebFlux，不能和 `spring-boot-starter-web`（Servlet）同时引入**，否则会报 `Spring MVC found on classpath` 冲突。

**第二步：写配置**，一个最小可用的路由：

```yaml
server:
  port: 8080                 # 网关自身端口

spring:
  application:
    name: gateway
  cloud:
    gateway:
      routes:
        - id: order-route               # 路由唯一标识，随便起但不要重复
          uri: http://localhost:8081    # 转发目标：下游订单服务地址
          predicates:
            - Path=/order/**            # 断言：路径以 /order/ 开头的请求走这条路
```

**第三步：验证**。启动网关和下游服务后：

```bash
# 客户端请求网关，网关转发到 http://localhost:8081/order/create
curl http://localhost:8080/order/create
```

此时 `/order/**` 的请求被网关转发到了 `8081` 端口。这就是最小闭环：**断言匹配 → 路由转发**。

小结：基础篇讲清了「为什么有网关 → 网关三大概念 → 请求流程 → 选型 → 最小 demo」，接下来高级篇把 Route / Predicate / Filter 的每一个细节展开。

---

## 高级篇

### 路由 Route 详解：静态路由 vs 动态路由

路由的 `uri` 可以写死，也可以走注册中心，这是「静态」和「动态」的分水岭：

| 写法 | uri 示例 | 特点 | 适用 |
| --- | --- | --- | --- |
| 静态路由 | `uri: http://localhost:8081` | 地址写死，下游一变就得改配置 | 下游固定、不走注册中心的场景 |
| 动态路由 | `uri: lb://order-service` | `lb://` 前缀 + 服务名，从注册中心拿实例 | 生产环境主流，配合 [Nacos](/learn_backend/java/微服务/Nacos) |

`lb://` 的含义是 **Load Balance**：网关不在配置文件里写死 IP，而是根据服务名到注册中心拿实例列表，再按负载均衡策略选一个真实地址转发。好处是**下游服务扩缩容、换地址都不用改网关配置**。

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-service
          uri: lb://order-service       # lb:// = 负载均衡 + 服务发现
          predicates:
            - Path=/order/**
          filters:
            - StripPrefix=1             # 转发前去掉第一段路径 /order
```

`StripPrefix=1` 为什么常配：客户端请求的是 `/order/create`，但下游服务内部的路由通常**不含服务名前缀**（它就是 `/create`），所以要把 `/order` 去掉再转发，否则下游会 404。

### 断言 Predicate 全家桶

断言工厂都以 `xxxRoutePredicateFactory` 命名，配置里写 `- Key=value` 的形式。最常用的完整清单：

| 断言 | 配置示例 | 匹配含义 | 使用场景 |
| --- | --- | --- | --- |
| Path | `- Path=/user/**` | 路径按 Ant 风格匹配 | 按业务路径分流 |
| Method | `- Method=GET,POST` | 请求方法匹配 | 限制某路由只收 GET/POST |
| Header | `- Header=X-Request-Id, \d+` | 请求头存在且值匹配正则 | 校验特定头（如版本号、来源） |
| Query | `- Query=name, zhangsan` | 查询参数存在（可选匹配值） | 按参数分流 |
| Cookie | `- Cookie=sessionId, .+` | Cookie 存在且值匹配正则 | 会话相关路由 |
| Host | `- Host=**.example.com` | 请求 Host 域名匹配 | 按域名分流 |
| RemoteAddr | `- RemoteAddr=192.168.1.0/24` | 来源 IP 网段匹配 | 内网白名单 |
| After | `- After=2026-01-01T00:00:00+08:00[Asia/Shanghai]` | 时间在某个时刻之后 | 定时上线路由 |
| Before | `- Before=2026-06-01T00:00:00+08:00[Asia/Shanghai]` | 时间在某个时刻之前 | 定时下线 |
| Between | `- Between=...T00:00:00+08:00[Asia/Shanghai], ...T23:59:59+08:00[Asia/Shanghai]` | 时间在区间内 | 限时活动 |
| Weight | `- Weight=group1, 80` | 按权重（80%）分流到该路由 | 灰度发布、A/B 测试 |

一条路由配多个断言时是**「与」关系**，全部满足才命中：

```yaml
- id: order-query
  uri: lb://order-service
  predicates:
    - Path=/order/**          # 路径要匹配
    - Method=GET              # 方法要匹配
    - Header=X-Version, v2    # 请求头要匹配
  # 三个条件同时满足，才会走这条路由
```

**Weight 权重路由**是灰度发布的利器，两条路由用同一个 group、权重相加为 100：

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-v1
          uri: lb://order-service-v1
          predicates:
            - Path=/order/**
            - Weight=orderGray, 80      # 80% 流量走 v1
        - id: order-v2
          uri: lb://order-service-v2
          predicates:
            - Path=/order/**
            - Weight=orderGray, 20      # 20% 流量走 v2
```

::: tip 💡 面试题：Gateway 怎么做灰度发布？
结论：用 Weight 断言做权重分流；原因：给新老版本各配一条路由、共用同一个 Weight group，按比例把流量导到新版，实现不中断的灰度切换。
:::

### 过滤器 Filter 分类

过滤器分两大类，本质区别在**作用范围**：

| 类型 | 作用范围 | 实现方式 | 典型用途 |
| --- | --- | --- | --- |
| 局部过滤器（GatewayFilter） | 只作用于某一条路由 | 在路由的 `filters` 里配置 | 加请求头、改路径、限流、熔断 |
| 全局过滤器（GlobalFilter） | 作用于所有路由 | 写 Java 类实现 `GlobalFilter` 接口 | 统一鉴权、统一日志 |

两者不冲突：一条路由的过滤器链 = **全局过滤器 + 该路由的局部过滤器**，最后按 order 一起排序执行。

### 常用局部过滤器清单

局部过滤器由 `xxxGatewayFilterFactory` 提供，配置里可简写 `- FilterName=args`，带多个参数用 `name` + `args` 的完整写法：

| 过滤器 | 配置示例 | 作用 | 场景 |
| --- | --- | --- | --- |
| AddRequestHeader | `- AddRequestHeader=X-Color, blue` | 转发前给下游加请求头 | 传递来源、染色标识 |
| AddRequestParameter | `- AddRequestParameter=color, blue` | 转发前加查询参数 | 透传参数 |
| AddResponseHeader | `- AddResponseHeader=X-Gateway, gateway` | 响应里加响应头 | 标记经过网关 |
| StripPrefix | `- StripPrefix=1` | 去掉路径前 N 段 | 去掉服务名前缀 |
| PrefixPath | `- PrefixPath=/api` | 给路径加前缀 | 统一加 /api |
| SetPath | `- SetPath=/new/{segment}` | 直接替换路径 | 路径改写 |
| RewritePath | `- RewritePath=/red/(?<segment>.*), /$\{segment}` | 正则重写路径 | 复杂路径替换 |
| RedirectTo | `- RedirectTo=302, https://example.com` | 重定向 | 强制跳转 |
| SetStatus | `- SetStatus=401` | 直接返回状态码 | 快速拒绝 |
| RequestRateLimiter | `name: RequestRateLimiter` + args | 基于 Redis 限流 | 保护下游 |
| CircuitBreaker | `name: CircuitBreaker` + args | 熔断降级 | 下游不稳定时快速失败 |
| Retry | `name: Retry` + args | 失败重试 | 临时故障重试 |

带多个参数的过滤器（限流、熔断、重试）必须用完整写法，见下面各小节。

### 全局过滤器：统一鉴权（重点）

全局过滤器最典型的用途是**统一鉴权**——所有请求进网关先验 token，合法才放行，下游服务不再各自写鉴权。完整可运行代码：

```java
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * 统一鉴权全局过滤器：所有请求进网关先验 token
 */
@Component
public class AuthGlobalFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        // 从请求头取出 Authorization token（网关统一收口鉴权，下游不再重复做）
        String token = exchange.getRequest().getHeaders().getFirst("Authorization");

        // 没带 token 或格式不对：直接返回 401，不再放行到下游
        // 这样避免了「每个服务都写一遍鉴权」的重复
        if (token == null || !token.startsWith("Bearer ")) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            // setComplete() 表示响应写完，返回 Mono 结束请求，不调用 chain.filter
            return exchange.getResponse().setComplete();
        }

        // 有合法 token：调用 chain.filter(exchange) 放行，交给下一个过滤器继续处理
        // 也可以在这里解析 token，把 userId 放进请求头透传给下游
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        // 返回 -1，让鉴权在过滤器链最前面执行（数值越小越先执行）
        // 否则请求可能已经被转发出去，鉴权就形同虚设
        return -1;
    }
}
```

关键点拆解：

1. **实现 `GlobalFilter`**：让 Spring 把它注册成作用于所有路由的过滤器。
2. **实现 `Ordered`**：`getOrder()` 决定执行顺序，鉴权必须最先执行，所以给很小的负数（如 `-1`）。
3. **`chain.filter(exchange)` 是放行**：不调用它，请求就断在鉴权这层，不会继续往后走。
4. **返回 `Mono<Void>`**：响应式写法，整个链路是异步的，不能按传统 `void` 方法理解。

::: tip 💡 面试题：全局过滤器和局部过滤器有什么区别？统一鉴权用哪个？
结论：全局过滤器作用于所有路由（实现 GlobalFilter 接口），局部过滤器只作用于配了它的那条路由；统一鉴权必须用全局过滤器。
原因：鉴权要覆盖所有入口，用局部过滤器会漏配；全局过滤器天然对所有路由生效，且通过实现 Ordered 能保证它最先执行。
:::

### 负载均衡：lb:// 的完整原理

前面说了 `lb://` 是「服务发现 + 负载均衡」，拆开看它的工作链路：

```
请求 /order/create
   │
   ▼
RoutePredicateHandlerMapping 匹配到路由（uri = lb://order-service）
   │
   ▼
LoadBalancerClientFilter（order=10150）
   │  1. 从注册中心（Nacos）拿到 order-service 的实例列表
   │     [ 192.168.1.10:8081, 192.168.1.11:8081, 192.168.1.12:8081 ]
   │  2. 按负载均衡策略选一个实例
   │     RoundRobinLoadBalancer（默认轮询）→ 选中 192.168.1.10:8081
   │  3. 把 lb://order-service 替换成 http://192.168.1.10:8081
   ▼
NettyRoutingFilter 用真实 URL 发起请求
```

默认的负载均衡策略是**轮询**（RoundRobin），生产环境常配合 [Nacos](/learn_backend/java/微服务/Nacos) 的**权重**做流量控制。

### 跨域配置 CORS

网关是统一入口，跨域最适合在网关**一次性解决**，而不是每个服务各配一套：

```yaml
spring:
  cloud:
    gateway:
      globalcors:
        cors-configurations:
          '[/**]':                      # 对所有路径生效
            allowedOriginPatterns: "*"  # 允许的源，生产环境建议写具体域名
            allowedMethods: "*"         # 允许的方法
            allowedHeaders: "*"         # 允许的请求头
            allowCredentials: true      # 是否允许携带 Cookie
            maxAge: 3600                # 预检请求结果缓存时间（秒）
```

几个容易踩的点：

- `allowedOriginPatterns` 和 `allowedOrigins` 二选一；带了 Cookie（`allowCredentials: true`）时，源不能用 `*`，要用 `allowedOriginPatterns` 做模式匹配。
- CORS 由网关统一处理后，下游服务**不要再配 CORS**，否则响应头重复、还可能冲突。

### 限流：RequestRateLimiter（基于 Redis）

网关层面的限流是「对所有入口统一限流」，用的是**令牌桶算法**，令牌存 Redis，多实例网关也能共享计数：

**第一步：引入依赖**（限流需要 Redis）：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis-reactive</artifactId>
</dependency>
```

**第二步：定义限流维度**（按什么限：IP / 用户 / 接口）：

```java
@Configuration
public class RateLimiterConfig {

    // 按客户端 IP 限流：返回的字符串就是限流的 key，同一个 IP 的请求共享一个桶
    @Bean
    public KeyResolver ipKeyResolver() {
        return exchange -> Mono.just(
            exchange.getRequest().getRemoteAddress().getAddress().getHostAddress()
        );
    }
}
```

**第三步：配置限流规则**：

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-rate-limit
          uri: lb://order-service
          predicates:
            - Path=/order/**
          filters:
            - name: RequestRateLimiter
              args:
                redis-rate-limiter.replenishRate: 10    # 每秒补充的令牌数（允许的 QPS）
                redis-rate-limiter.burstCapacity: 20    # 令牌桶容量（允许的突发量）
                key-resolver: "#{@ipKeyResolver}"       # 引用上面定义的 KeyResolver
```

三个参数理解：

| 参数 | 含义 | 关系 |
| --- | --- | --- |
| replenishRate | 每秒往桶里放的令牌数 | 决定「匀速」的速率，即稳定 QPS |
| burstCapacity | 桶最多能装多少令牌 | 决定「突发」上限，允许瞬时超发 |
| key-resolver | 限流 key 的取值逻辑 | 决定「对谁限」：按 IP / 用户 / 接口 |

被限流时默认返回 **HTTP 429 Too Many Requests**。网关限流和 [Sentinel](/learn_backend/java/微服务/Sentinel) 的区别：**网关限流是入口总闸**，Sentinel 是每个服务内部的细粒度限流，两者常配合使用。

### 熔断降级：CircuitBreaker

下游服务不稳定时，网关不应傻等，而要**快速失败并走兜底**，避免请求在网关卡住堆积。网关用 CircuitBreaker 过滤器（底层走 Resilience4J）：

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-circuit-breaker
          uri: lb://order-service
          predicates:
            - Path=/order/**
          filters:
            - name: CircuitBreaker
              args:
                name: orderCircuitBreaker          # 熔断器名称，区分不同的熔断实例
                fallbackUri: forward:/fallback     # 熔断打开时，转发到本地兜底接口
```

兜底接口写在**网关自己**里（注意：`forward:` 指向网关本地的 controller）：

```java
@RestController
public class FallbackController {

    // 熔断后网关把请求 forward 到这里，返回一个快速兜底响应，避免客户端一直等待
    @RequestMapping("/fallback")
    public Map<String, Object> fallback() {
        Map<String, Object> result = new HashMap<>();
        result.put("code", 503);
        result.put("message", "服务暂时不可用，请稍后再试");
        return result;
    }
}
```

熔断的三态：**关闭 → 打开 → 半开**，打开期间直接走兜底，过一段时间放一个请求试探，成功则关闭、失败则继续打开。网关熔断和 Sentinel 熔断可二选一，网关层做**入口级**熔断，服务内做**接口级**熔断。

### 失败重试：Retry

下游偶尔抖动（网络闪断、临时 5xx），网关可以自动重试，减少「偶发失败」对用户的影响：

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: order-retry
          uri: lb://order-service
          predicates:
            - Path=/order/**
          filters:
            - name: Retry
              args:
                retries: 3                          # 最多重试 3 次
                statuses: BAD_GATEWAY, SERVICE_UNAVAILABLE  # 只对这些状态码重试
                backoff:
                  firstBackoff: 100ms               # 首次重试等待时间
                  maxBackoff: 500ms                 # 最大等待时间
                  factor: 2                         # 每次等待时间翻倍
                  basedOnPreviousValue: false       # 不基于上次值累计
```

注意：重试对**幂等**接口（GET、查询）才安全；下单、扣款这类**非幂等**接口要慎用，否则可能重复提交。

### 自定义断言与过滤器工厂

Gateway 的断言和过滤器都是「工厂 + 配置」的约定：配置里写 `- Key=value`，框架会自动找对应的工厂类。理解了这条约定，就能自己扩展。

**自定义断言工厂**：类名必须以 `RoutePredicateFactory` 结尾，配置里的 Key 是去掉后缀的部分。下面自定义一个「请求必须带某个 header 才放行」的断言：

```java
/**
 * 自定义断言：请求头必须包含 X-Auth-Token
 * 类名结尾 RoutePredicateFactory → 配置里写 - AuthToken=xxx
 */
@Component
public class AuthTokenRoutePredicateFactory
        extends AbstractRoutePredicateFactory<AuthTokenRoutePredicateFactory.Config> {

    public AuthTokenRoutePredicateFactory() {
        super(Config.class);
    }

    @Override
    public Predicate<ServerWebExchange> apply(Config config) {
        // 核心判断逻辑：请求头里有没有对应的 token
        return exchange -> {
            String header = exchange.getRequest().getHeaders().getFirst("X-Auth-Token");
            // 存在且值等于配置的期望值，才算命中
            return header != null && header.equals(config.getToken());
        };
    }

    // 支持短路：判断参数顺序用的（这里只有一个参数）
    @Override
    public List<String> shortcutFieldOrder() {
        return List.of("token");
    }

    public static class Config {
        private String token;   // 配置里 - AuthToken=期望的token值
        public String getToken() { return token; }
        public void setToken(String token) { this.token = token; }
    }
}
```

配置方式：

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: custom-predicate-demo
          uri: lb://order-service
          predicates:
            - Path=/order/**
            - AuthToken=abc123    # 用自定义断言：只有带对 token 的请求才放行
```

**自定义过滤器工厂**：类名以 `GatewayFilterFactory` 结尾，用于做一些框架没内置的加工逻辑：

```java
/**
 * 自定义过滤器：记录每个请求的耗时日志
 * 类名结尾 GatewayFilterFactory → 配置里写 - LogTime
 */
@Component
public class LogTimeGatewayFilterFactory
        extends AbstractGatewayFilterFactory<LogTimeGatewayFilterFactory.Config> {

    public LogTimeGatewayFilterFactory() {
        super(Config.class);
    }

    @Override
    public GatewayFilter apply(Config config) {
        // 返回一个 GatewayFilter，pre 记录开始时间，post 打印耗时
        return (exchange, chain) -> {
            long start = System.currentTimeMillis();           // pre：请求进来记开始时间
            return chain.filter(exchange).then(Mono.fromRunnable(() -> {
                long cost = System.currentTimeMillis() - start; // post：响应回来算耗时
                System.out.println(exchange.getRequest().getPath() + " 耗时 " + cost + "ms");
            }));
        };
    }

    public static class Config {
        // 无参数配置，可留空
    }
}
```

配置方式：

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: log-time-demo
          uri: lb://order-service
          predicates:
            - Path=/order/**
          filters:
            - LogTime        # 用自定义过滤器打印每个请求耗时
```

关键规律记两条：**类名后缀决定配置 Key**、**`apply()` 返回的判断/加工逻辑才是核心**。扩展能力和 Spring 的自动装配一致——加了 `@Component` 就会被自动发现。

### 超时与连接池配置

网关作为所有流量的汇聚点，超时和连接池配置直接影响稳定性：

```yaml
spring:
  cloud:
    gateway:
      httpclient:
        connect-timeout: 1000          # 建立连接超时（毫秒）
        response-timeout: 5s           # 等待下游响应超时
        pool:
          max-connections: 500         # 连接池最大连接数
          max-idle-time: 40s           # 空闲连接存活时间
```

要点：**响应超时要设得比下游最慢接口的耗时稍大**，设小了正常慢接口会被误杀；`max-connections` 设太小会在高并发时连接耗尽。

### 动态路由：开启服务发现自动路由

除了手写 `lb://服务名`，Gateway 还能**自动**根据注册中心的服务名生成路由，一条配置都不用写：

```yaml
spring:
  cloud:
    gateway:
      discovery:
        locator:
          enabled: true                # 开启服务发现自动路由
          lower-case-service-id: true  # 服务名转小写（Nacos 服务名通常是大写）
```

开启后，请求 `/order-service/**` 会自动路由到注册中心里名为 `order-service` 的服务，相当于自动生成了 `Path=/{serviceId}/**` + `lb://{serviceId}` 的路由。适合快速联调，但**生产环境更推荐显式写路由**，因为显式配置可控性更强（能配过滤器和断言）。

### 默认过滤器 default-filters

如果某个过滤器要对**所有路由**生效（比如统一加一个响应头），除了写 GlobalFilter，还可以用 `default-filters`：

```yaml
spring:
  cloud:
    gateway:
      default-filters:
        - AddResponseHeader=X-Powered-By, gateway   # 所有路由的响应都加这个头
        - DedupeResponseHeader=Access-Control-Allow-Origin, RETAIN_FIRST
```

`default-filters` 是「配置层面的全局过滤器」，作用于所有路由，但它仍属于局部过滤器体系，和代码里的 `GlobalFilter` 是两个入口，最终都会进过滤器链统一排序执行。

---

## 原理篇

### 底层：WebFlux 响应式非阻塞模型

Gateway 高性能的根源在于它**不基于 Servlet**，而是基于 Spring WebFlux + Reactor Netty。理解三个关键词：

1. **Reactor Netty**：基于 Netty 的响应式 HTTP 客户端/服务端，底层是**事件循环（EventLoop）+ NIO**，一个线程能同时处理成千上万个连接。
2. **Mono / Flux**：Reactor 的响应式类型。`Mono<T>` 表示「0 或 1 个元素的异步结果」，`Flux<T>` 表示「0 到 N 个」，整个处理链是**异步 + 非阻塞**的。
3. **WebClient**：网关转发下游请求用的响应式客户端（替代阻塞的 RestTemplate），发起请求后不阻塞等待，而是注册回调。

为什么能「少量线程扛高并发」：

```
阻塞模型（Servlet）：
  线程发请求 → 阻塞等待响应 → 拿到响应继续
  线程在「等待」期间被浪费，N 个并发就需要 N 个线程

非阻塞模型（WebFlux）：
  线程发请求 → 立刻返回，注册回调 → 线程去处理别的请求
  → 响应回来时，事件循环唤醒回调继续处理
  线程几乎不空闲，少量线程（≈ CPU 核数）就能跑满吞吐
```

这正是面试里「Gateway 为什么性能好」的标准答案：**非阻塞 + 事件驱动 + 少量线程高吞吐**。

### 源码结构：核心类关系图

Gateway 的源码骨架用一张图理清（面试问「源码结构」能答出这个就够）：

```
DispatcherHandler（WebFlux 总入口）
   │
   ├── 遍历 HandlerMapping 列表
   │      └── RoutePredicateHandlerMapping（Gateway 的路由映射器）
   │              │
   │              ├── 依赖 RouteLocator（拿到所有 Route）
   │              │      ├── CachingRouteLocator（缓存路由，避免每次重建）
   │              │      └── CompositeRouteLocator
   │              │            └── RouteDefinitionRouteLocator（把定义转成 Route）
   │              │                  └── 依赖 RouteDefinitionLocator
   │              │                        ├── PropertiesRouteDefinitionLocator（读 yml 的 routes）
   │              │                        └── DiscoveryClientRouteDefinitionLocator（自动发现服务）
   │              │
   │              └── 用 RoutePredicateFactory 把断言定义转成 AsyncPredicate
   │                      匹配成功 → 把 Route 放进 exchange 属性 GATEWAY_ROUTE_ATTR
   │
   └── WebHandler
          └── FilteringWebHandler（组装过滤器链）
                 └── globalFilters + routeFilters → 排序 → DefaultGatewayFilterChain
```

两个关键的「定义 vs 运行」概念：

| 概念 | 含义 | 来源 |
| --- | --- | --- |
| RouteDefinition | 路由的**配置定义**（id、uri、predicates、filters 的原始字符串） | yml / 注册中心 |
| Route | 路由的**运行对象**（predicates 已编译成 `AsyncPredicate`，filters 已编译成 `GatewayFilter`） | 由 RouteDefinition 构建 |

启动时，`RouteDefinitionLocator` 读到配置里的 `RouteDefinition`，`RouteDefinitionRouteLocator` 再逐个「编译」成真正能用的 `Route`，然后缓存起来。

### 请求处理完整机制流程

把源码结构串成一次请求的完整生命周期（面试可以照着讲）：

1. **DispatcherHandler** 收到请求，遍历所有 `HandlerMapping`，找到 `RoutePredicateHandlerMapping`。
2. `RoutePredicateHandlerMapping` 从 `RouteLocator` 拿到所有路由，**按 order 排序**，逐个用路由的 `AsyncPredicate` 测试。
3. 命中后，把 `Route` 对象放进 exchange 的属性（key 是 `GATEWAY_ROUTE_ATTR`），交给 `FilteringWebHandler`。
4. `FilteringWebHandler` 取出 route 的 `filters`，加上所有 `globalFilters`（包装成 `GatewayFilter`），合并成一个列表，用 `AnnotationAwareOrderComparator` **按 order 排序**。
5. 用这个列表构造 `DefaultGatewayFilterChain`，从第一个过滤器开始执行。
6. 过滤器链走到 `NettyRoutingFilter`（order 最大，最后执行），用 WebClient 把请求真正转发给下游。
7. 下游响应返回后，过滤器链**反向**执行 post 逻辑，`NettyWriteResponseFilter`（order -1）把响应写回客户端。

```
① DispatcherHandler（入口）
      │
      ▼
② RoutePredicateHandlerMapping
      │  遍历路由，AsyncPredicate 测试（先命中先走）
      ▼
③ 命中 Route，写入 GATEWAY_ROUTE_ATTR
      │
      ▼
④ FilteringWebHandler：globalFilters + routeFilters 合并排序
      │
      ▼
⑤ DefaultGatewayFilterChain 依次执行 pre
      │  全局鉴权(-1) → 改请求头 → LoadBalancerClientFilter(10150) → ...
      ▼
⑥ NettyRoutingFilter（Integer.MAX_VALUE）发出请求
      │
      ▼
⑦ 响应回来 → Filter 链反向执行 post → NettyWriteResponseFilter(-1) 写回
```

### Route 匹配机制：Predicate 的组合

一个路由的多个断言，会被组合成一个 `AsyncPredicate`，规则是**「与」关系**（全部满足才命中）：

```
Route.predicates = [Path=/order/**, Method=GET, Header=X-Version, v2]

编译后：
  AsyncPredicate p = pathPredicate
                     .and(methodPredicate)
                     .and(headerPredicate)

匹配时：p.test(exchange) 为 true 才走这条路由
```

路由之间则按 `order` 排序，**先匹配到的路由短路返回**（不会继续匹配后面的路由）。所以配置多条路由时要注意：

- 更**具体**的路径要写在前面（`/order/detail/**` 应在 `/order/**` 之前），否则会被宽泛路径先抢走。
- 用 `order` 字段显式控制优先级，避免依赖配置顺序这种隐式行为。

### Filter 执行顺序：Ordered 排序机制

过滤器链的执行顺序由 `order` 决定，规则：**数值越小越先执行（pre 阶段），响应时反向执行（post 阶段）**。

内置几个关键过滤器的 order 值（面试高频）：

| 过滤器 | order 值 | 作用 |
| --- | --- | --- |
| NettyWriteResponseFilter | -1 | 把响应写回客户端（响应侧最外层） |
| 自定义鉴权 GlobalFilter | 可设 -1 及更小 | 最先执行，鉴权拦在最前面 |
| RouteToRequestUrlFilter | 10000 | 把路由 URI 转成真实请求 URL |
| LoadBalancerClientFilter | 10150 | `lb://` 时从注册中心选实例 |
| NettyRoutingFilter | Integer.MAX_VALUE | 真正发出请求（转发侧最外层） |

为什么 `LoadBalancerClientFilter` 要在 `NettyRoutingFilter` 之前？因为必须先**选定实例、把 `lb://` 换成真实 URL**，`NettyRoutingFilter` 才能知道往哪发请求。这就是 order 设计的用意：**先选地址，再发请求**。

```
过滤器链（按 order 从小到大）：
  pre 方向 ──────────────────────────────►
  鉴权(-1) → ... → RouteToRequestUrlFilter(10000) → LoadBalancerClientFilter(10150) → ... → NettyRoutingFilter(MAX)
  ◄────────────────────────────────────── post 方向（响应时反向走）
```

### lb:// 负载均衡机制：ReactiveLoadBalancer

`lb://` 的底层由 Spring Cloud LoadBalancer 提供，核心接口是 `ReactiveLoadBalancer<ServiceInstance>`：

```
LoadBalancerClientFilter（拦截请求）
   │
   ▼
ReactiveLoadBalancer<ServiceInstance>
   ├── 通过 ServiceInstanceListSupplier 从 Nacos 拉取实例列表
   │     （Nacos 客户端本地缓存实例，见 Nacos 原理）
   │
   └── 按策略选一个实例
         ├── RoundRobinLoadBalancer（默认：轮询）
         └── 自定义策略（按权重、按区域等）
   │
   ▼
选中 ServiceInstance（ip + port）→ 替换 lb:// 为 http://ip:port
   │
   ▼
交给 NettyRoutingFilter 转发
```

默认实现是 `RoundRobinLoadBalancer`（轮询）。要换策略，注册一个 `ReactorLoadBalancer` 的 Bean 即可。负载均衡 + 服务发现的完整细节见 [Nacos](/learn_backend/java/微服务/Nacos)。

### 为什么 Gateway 比 Zuul 快：再往下挖一层

除了前面说的「非阻塞 vs 阻塞」，还可以从两个更深的角度解释：

1. **连接复用**：Netty 的 `WebClient` 默认使用连接池，同一个下游实例复用 TCP 连接，避免每次请求都三次握手。
2. **内存开销**：Servlet 每个线程默认分配 1MB 栈内存，1000 线程就是 1GB；Netty 少量 EventLoop 线程 + 事件对象，内存占用低几个数量级。

一句话总结原理：**事件循环 + NIO + 连接复用 + 少量线程**，让 Gateway 在高并发下吞吐更高、资源占用更低。

---

## 面试常问

1. **Gateway 和 Zuul 的区别？** Gateway 基于 WebFlux 非阻塞响应式，Zuul 1.x 基于 Servlet 阻塞式；高并发下 Gateway 用少量线程扛住更多请求，且 Spring 官方维护、Zuul 已停更。

2. **Gateway 的核心三要素？** Route（决定去哪）、Predicate（决定匹不匹配）、Filter（决定怎么加工）；三者组合成一条完整的转发链路。

3. **lb:// 的作用和原理？** 按服务名从注册中心拿实例列表做负载均衡，避免硬编码地址；底层由 LoadBalancerClientFilter 拦截、ReactiveLoadBalancer 选实例、默认轮询策略。

4. **全局过滤器和局部过滤器的区别？统一鉴权怎么实现？** 全局过滤器实现 GlobalFilter 接口、作用于所有路由，局部过滤器只作用于配置了它的路由；统一鉴权用 GlobalFilter + Ordered，在 filter 里校验 token，不合法直接返回 401 不放行。

5. **Filter 的执行顺序怎么定？** 由 order 决定，数值越小越先执行（响应时反向）；内置 LoadBalancerClientFilter(10150) 在 NettyRoutingFilter(MAX) 之前，保证先选实例再转发。

6. **Gateway 为什么性能高？** 基于 WebFlux + Reactor Netty 的非阻塞事件驱动模型，少量 EventLoop 线程 + 连接复用，避免 Servlet 每请求一线程的阻塞等待和内存开销。

7. **Gateway 和 Nginx 的区别？** Gateway 是应用层 API 网关，靠 Predicate/Filter 做业务级路由、鉴权、限流；Nginx 是高性能反向代理，偏流量转发、静态资源、四层/七层负载均衡，两者常搭配（Nginx 在外层、Gateway 在内层）。

8. **网关限流和 Sentinel 限流有什么区别？** 网关限流是入口总闸（基于 Redis 令牌桶、对所有入口统一限），Sentinel 是服务内部接口级细粒度限流，两者配合使用、不冲突。

相关阅读：[Spring Cloud](/learn_backend/java/微服务/Spring Cloud) · [Nacos](/learn_backend/java/微服务/Nacos) · [Sentinel](/learn_backend/java/微服务/Sentinel) · [OpenFeign](/learn_backend/java/微服务/OpenFeign) · [Nginx](/learn_backend/java/微服务/Nginx) · [Seata](/learn_backend/java/微服务/Seata)
