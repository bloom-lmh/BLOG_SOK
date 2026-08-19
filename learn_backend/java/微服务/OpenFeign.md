# OpenFeign

> 一句话定位：OpenFeign 是一个**声明式的 HTTP 客户端**，让你「写一个接口 + 加几个注解」就能完成微服务之间的远程调用，彻底告别手写 `RestTemplate` 拼接 URL、序列化、负载均衡的模板代码。

---

## 基础篇

### 远程调用的演进：为什么会有 OpenFeign

在单体应用里，A 类调 B 类就是一句 `b.method()`，本地方法调用，简单直接。但拆成微服务后，服务 A 要调服务 B，中间隔着**网络**，事情就复杂了：要发 HTTP 请求、要传 JSON、要解析响应、还要处理服务地址怎么找、负载均衡怎么做、超时重试怎么配。

远程调用方式的演进，本质上就是「把网络细节一步步藏起来」的过程：

| 阶段 | 写法 | 代码量 | 问题 |
| --- | --- | --- | --- |
| 原生 `HttpURLConnection` | 手写 socket 连接、手写请求行、请求头 | 极大 | 每个请求要几十行，几乎不可维护 |
| `RestTemplate`（Spring 提供） | 手动拼 URL、手动序列化/反序列化 | 较大 | 模板代码多、地址硬编码、不好统一管理 |
| **OpenFeign**（声明式） | 定义一个接口 + 注解 | 极小 | 代码即文档，自动负载均衡，开箱即用 |

看一段真实对比，感受差异有多大：

```java
// ============ 方式一：RestTemplate（命令式） ============
@Service
public class UserRemoteService {

    @Autowired
    private RestTemplate restTemplate;

    public User getUserById(Long id) {
        // 问题 1：地址硬编码在代码里，服务迁移、端口变更都要改代码
        String url = "http://localhost:8081/user/" + id;
        // 问题 2：每个方法都要写 getForObject / postForObject 等模板代码
        User user = restTemplate.getForObject(url, User.class);
        return user;
    }

    public User saveUser(User user) {
        // 问题 3：序列化/反序列化要自己管，方法多了全是重复代码
        return restTemplate.postForObject("http://localhost:8081/user", user, User.class);
    }
}

// ============ 方式二：OpenFeign（声明式） ============
@FeignClient("user-service")          // 指定服务名，不写死 IP，自动从注册中心解析
public interface UserClient {

    @GetMapping("/user/{id}")          // 声明 HTTP 方法 + 路径
    User getUserById(@PathVariable("id") Long id);

    @PostMapping("/user")
    User saveUser(@RequestBody User user);   // 声明 JSON 请求体
}
```

对比之后，OpenFeign 的三个核心价值就清晰了：

1. **声明式**：接口本身就是「调用说明书」，路径、参数、方法一目了然，代码即文档。
2. **自动负载均衡**：写的是服务名 `user-service`，不是 IP，真正地址由注册中心 + 负载均衡在运行时解析。
3. **零模板代码**：请求构造、JSON 序列化、响应反序列化全部由框架完成，开发者只关心业务。

::: tip 💡 面试题：OpenFeign 和 RestTemplate 的区别？
一句话结论：OpenFeign 是声明式调用（写接口 + 注解），RestTemplate 是命令式调用（手动拼 URL、手动序列化）。
一句话原因：OpenFeign 内部封装了请求构造、序列化、负载均衡，把 RestTemplate 需要手写的模板代码全部隐藏了。
一句话展开：RestTemplate 还需要自己管理 URL 拼接和序列化，而 OpenFeign 通过 JDK 动态代理，在方法调用时自动解析注解、生成请求并发送，所以代码更简洁、更易维护。
:::

### Feign 和 OpenFeign 是什么关系（高频易混点）

很多同学分不清「Feign」和「OpenFeign」，这里把历史脉络捋清楚：

1. **Feign**：Netflix 开源的声明式 HTTP 客户端（2013 年前后），用的是**自己的注解** `@RequestLine`、`@Headers`、`@Param`，和 Spring MVC 注解不通用。
2. **OpenFeign**：2016 年 Netflix 将 Feign 捐给社区后，社区接手维护的版本就叫 **OpenFeign**（GitHub：`OpenFeign/feign`），是 Feign 的「续作」。
3. **Spring Cloud OpenFeign**：Spring 官方对 OpenFeign 的整合封装，对应 starter 就是 `spring-cloud-starter-openfeign`，**支持 Spring MVC 注解**（`@GetMapping`、`@PathVariable` 等），并深度集成了 Spring Cloud 生态（负载均衡、熔断、注册发现）。

一句话记忆：**Feign 是 Netflix 的老版本（已停更），OpenFeign 是社区的续作，Spring Cloud OpenFeign 是 Spring 把 OpenFeign 和 Spring MVC 打通后的整合版。** 现在项目里说的「Feign」几乎都指 Spring Cloud OpenFeign。

| 维度 | Netflix Feign（旧） | Spring Cloud OpenFeign（现主流） |
| --- | --- | --- |
| 注解 | `@RequestLine`、`@Headers`、`@Param` | Spring MVC 注解（`@GetMapping` 等） |
| 维护状态 | 已停止维护 | 社区活跃维护 |
| 与 Spring 生态整合 | 弱 | 强（负载均衡、熔断、注册发现） |
| 依赖 | `spring-cloud-starter-feign` | `spring-cloud-starter-openfeign` |

### 远程调用方案选型：OpenFeign vs Dubbo vs gRPC

「服务间远程调用」其实不止 OpenFeign 一种方案，面试常问「你为什么用 OpenFeign 而不是 Dubbo」。先搞清楚各自的定位：

| 维度 | OpenFeign | Dubbo | gRPC |
| --- | --- | --- | --- |
| 通信协议 | HTTP/1.1（REST，JSON） | 自定义 RPC 协议（二进制） | HTTP/2 + Protobuf |
| 调用方式 | 声明式接口 + 注解 | 接口 + RPC 框架 | 接口 + IDL 定义 |
| 序列化 | JSON（可读性强，体积大） | Hessian/Kryo 等（紧凑） | Protobuf（最紧凑） |
| 跨语言 | ✅ HTTP 天然跨语言 | ❌ 主要 Java 生态 | ✅ 多语言支持 |
| 性能 | 一般（HTTP + JSON 开销大） | 高（二进制协议） | 很高（HTTP/2 多路复用 + Protobuf） |
| 生态整合 | 与 Spring Cloud 无缝 | 阿里系、独立治理体系 | Google 系、微服务/流式 |
| 适用场景 | 内部 HTTP 风格微服务 | 高性能 Java 微服务 | 多语言、高性能、流式 |

选型结论（面试直接背这句）：**HTTP 风格微服务、看重与 Spring Cloud 生态整合、需要跨语言 → 选 OpenFeign；对性能有极致要求、纯 Java 技术栈、需要更多服务治理能力 → 选 Dubbo。**

::: tip 💡 面试题：OpenFeign 和 Dubbo 的区别？
一句话结论：OpenFeign 是「HTTP + REST」的声明式客户端，Dubbo 是「自定义二进制协议」的 RPC 框架。
一句话原因：两者协议、序列化、性能、生态都不同——Feign 走 HTTP + JSON 可读性好、跨语言、和 Spring Cloud 绑定；Dubbo 走二进制协议性能更高、治理能力更强、但主要面向 Java。
:::

### 快速入门：五分钟跑通一个 Feign 调用

以一个典型的「订单服务调用户服务」场景为例，从零搭建：

#### 1. 引入依赖

```xml
<!-- 在调用方（订单服务）的 pom.xml 中引入 -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
```

> 说明：OpenFeign 依赖 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) 体系，还需要引入服务注册发现组件（如 [Nacos](/learn_backend/java/微服务/Nacos)）才能做「服务名 → 地址」的解析，否则 `@FeignClient("user-service")` 里的服务名无法解析成真实 IP。

#### 2. 启动类开启 Feign 扫描

```java
@SpringBootApplication
@EnableFeignClients   // 关键：开启 Feign 客户端扫描，自动为 @FeignClient 接口生成代理
public class OrderApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderApplication.class, args);
    }
}
```

`@EnableFeignClients` 的作用是告诉 Spring：启动时扫描所有标注了 `@FeignClient` 的接口，并为它们动态生成代理对象放进容器。常用属性：

| 属性 | 作用 | 示例 |
| --- | --- | --- |
| `basePackages` | 指定扫描的包路径（默认扫启动类所在包） | `@EnableFeignClients(basePackages = "com.example.client")` |
| `clients` | 显式指定要注册的 Feign 接口类 | `@EnableFeignClients(clients = UserClient.class)` |
| `defaultConfiguration` | 指定全局默认配置类 | `@EnableFeignClients(defaultConfiguration = FeignConfig.class)` |

#### 3. 定义 Feign 客户端接口

```java
// @FeignClient：声明这是一个远程调用客户端
// name = "user-service"：目标服务在注册中心的名字
@FeignClient(name = "user-service")
public interface UserClient {

    // GET 请求，路径变量用 @PathVariable 绑定
    @GetMapping("/user/{id}")
    User getUserById(@PathVariable("id") Long id);

    // POST 请求，@RequestBody 表示 JSON 请求体
    @PostMapping("/user")
    User saveUser(@RequestBody User user);

    // GET 请求，查询参数用 @RequestParam 绑定
    @GetMapping("/user/list")
    List<User> listUsers(@RequestParam("page") Integer page,
                         @RequestParam("size") Integer size);
}
```

被调方（用户服务）的 Controller 长这样，两者路径、参数名必须一一对应：

```java
@RestController
@RequestMapping("/user")
public class UserController {

    @GetMapping("/{id}")
    public User getUserById(@PathVariable Long id) {
        return userService.getById(id);
    }

    @PostMapping
    public User saveUser(@RequestBody User user) {
        return userService.save(user);
    }
}
```

#### 4. 注入并调用

```java
@RestController
public class OrderController {

    private final UserClient userClient;   // 直接注入 Feign 生成的代理对象

    public OrderController(UserClient userClient) {
        this.userClient = userClient;
    }

    @GetMapping("/order/{userId}")
    public User getUser(@PathVariable Long userId) {
        // 像调本地方法一样调远程接口，框架替你把 HTTP 请求发出去
        return userClient.getUserById(userId);
    }
}
```

跑通之后你会惊讶：**整个调用过程没有任何一行拼接 URL、序列化、发请求的代码**，这就是声明式客户端的魅力。

### 常用注解完整体系

OpenFeign 的注解分「客户端级」和「方法/参数级」两类，一次讲全：

#### 客户端级：`@FeignClient`

| 属性 | 作用 | 说明 |
| --- | --- | --- |
| `name` / `value` | 目标服务名（必填） | 从注册中心按这个名字解析地址，二者等价 |
| `url` | 直接指定目标地址 | 调试/直连时用，写死地址则不经过负载均衡 |
| `path` | 统一路径前缀 | 所有方法路径前拼上这个前缀 |
| `contextId` | 客户端唯一标识 | 同一个服务定义多个 FeignClient 时用于区分，避免 Bean 名冲突 |
| `configuration` | 指定该客户端的独立配置类 | 实现「不同服务不同配置」，注意不能被 `@ComponentScan` 扫到 |
| `fallback` | 熔断降级实现类 | 配合 Sentinel/Hystrix，调用失败时兜底 |
| `fallbackFactory` | 熔断降级工厂 | 相比 `fallback` 能拿到异常信息 |
| `primary` | 是否设为优先注入 | 多个候选 Bean 时指定主 Bean |
| `qualifiers` / `qualifier` | 注入限定名 | 自定义 Bean 的限定符 |

示例：

```java
@FeignClient(
    name = "user-service",
    contextId = "userQueryClient",   // 同一个 user-service 定义了多个客户端时区分
    path = "/api",                   // 所有方法路径自动拼 /api 前缀
    configuration = UserFeignConfig.class
)
public interface UserClient {
    @GetMapping("/user/{id}")       // 实际请求路径 = /api/user/{id}
    User getUserById(@PathVariable("id") Long id);
}
```

#### 方法/参数级注解

| 注解 | 位置 | 作用 | 示例 |
| --- | --- | --- | --- |
| `@GetMapping` / `@PostMapping` / `@PutMapping` / `@DeleteMapping` / `@RequestMapping` | 方法 | 声明 HTTP 方法和路径 | `@PostMapping("/user")` |
| `@PathVariable` | 参数 | 绑定路径变量 `{id}` | `@PathVariable("id") Long id` |
| `@RequestParam` | 参数 | 绑定查询参数 `?a=1` | `@RequestParam("page") Integer page` |
| `@RequestBody` | 参数 | JSON 请求体（序列化对象） | `@RequestBody User user` |
| `@RequestHeader` | 参数 | 绑定请求头 | `@RequestHeader("Authorization") String token` |
| `@RequestPart` | 参数 | multipart 文件上传 | `@RequestPart("file") MultipartFile file` |
| `@SpringQueryMap` / `@QueryMap` | 参数 | 把对象展开为查询参数 | `@SpringQueryMap UserQuery query` |

#### 参数绑定规则（踩坑重点）

OpenFeign 对方法参数有一组「默认规则」，不搞清楚很容易出 Bug：

```java
@GetMapping("/user/list")
List<User> listUsers(
    @RequestParam("page") Integer page,   // ① 有注解 → 按注解绑定为查询参数
    Integer size,                          // ② 无注解 → 默认当作 @RequestBody 处理
    User filter                            // ③ 又一个无注解 → 报错！body 参数只能有一个
);
```

关键结论：

1. **一个方法最多只能有一个 `@RequestBody`（或无注解）的 body 参数**，否则启动直接报错。
2. **无注解的参数默认按 `@RequestBody` 处理**，这点和 Spring MVC 不同（Spring MVC 无注解参数默认按 `@RequestParam`）。
3. **参数名问题**：`@PathVariable` / `@RequestParam` 如果没显式写 `name`，会取「参数名」，但这依赖编译时开启 `-parameters` 或 Spring Boot 默认配置（Spring Boot 2.x 已默认开启），保险起见**永远显式写 name**。

```java
// 推荐写法：显式写 name，不依赖参数名保留机制
@GetMapping("/user/{id}")
User getUser(@PathVariable("id") Long id);

// 不推荐：省略 name，依赖编译期参数名，换环境可能解析失败
@GetMapping("/user/{id}")
User getUser(@PathVariable Long id);
```

#### 返回值类型支持

OpenFeign 的 `Decoder` 会把 HTTP 响应体反序列化成方法声明的返回类型，支持以下常见类型：

| 返回类型 | 说明 | 使用场景 |
| --- | --- | --- |
| 自定义 POJO | JSON 自动反序列化成对象 | 最常用，`User`、`Order` 等 |
| `List<T>` / 集合 | JSON 数组反序列化成集合 | 批量查询 |
| `String` | 原样返回响应体文本 | 调第三方返回 HTML/文本 |
| `ResponseEntity<T>` | 拿到完整的响应状态码、响应头、响应体 | 需要判断状态码或读响应头 |
| `void` | 不关心响应体 | 通知类接口、删除操作 |

```java
// 需要状态码时用 ResponseEntity，可以拿到 headers 和 status
@GetMapping("/user/{id}")
ResponseEntity<User> getUserWithStatus(@PathVariable("id") Long id);
```

### 小结

到这里，基础篇的核心就一句话：**OpenFeign 把「远程调用」伪装成了「本地接口调用」**。你负责写接口和注解，框架负责发请求、序列化、负载均衡。下一步高级篇，我们解决实际生产中的四大难题：日志怎么开、超时怎么配、token 怎么透传、连接池怎么换。

---

## 高级篇

### 日志配置：调试 Feign 的第一工具

Feign 默认**不打印任何请求日志**，出了问题只能靠抓包，非常痛苦。它提供了 4 个日志级别，开对级别能直接看到完整的请求和响应。

#### 日志级别

| 级别 | 输出的内容 | 适用场景 |
| --- | --- | --- |
| `NONE` | 不输出任何日志（默认） | 生产环境默认 |
| `BASIC` | 只输出请求方法、URL、响应状态码、耗时 | 粗粒度排查 |
| `HEADERS` | BASIC + 请求/响应头 | 排查 header 透传问题 |
| `FULL` | HEADERS + 请求/响应体 | 完整调试，排查参数/返回值 |

#### 配置步骤

第一步，定义日志级别（两种方式，推荐配置类）：

```java
// 方式一：全局配置类，对所有 FeignClient 生效
@Configuration
public class FeignConfig {
    @Bean
    public Logger.Level feignLoggerLevel() {
        return Logger.Level.FULL;   // 调试期用 FULL，上线前改回 BASIC 或 NONE
    }
}
```

```java
// 方式二：只对某个客户端生效，用 @FeignClient 的 configuration 指定
@FeignClient(name = "user-service", configuration = UserFeignConfig.class)
public interface UserClient { ... }

public class UserFeignConfig {
    @Bean
    public Logger.Level feignLoggerLevel() {
        return Logger.Level.HEADERS;
    }
}
```

第二步，在 yaml 里把 Feign 接口包名下的日志级别设为 `debug`：

```yaml
logging:
  level:
    # 这里写 Feign 客户端接口所在的包名，而不是 feign 的包
    com.example.client: debug
```

::: warning 常见误区
很多同学只配了 `Logger.Level.FULL`，但没把接口包名的日志级别调到 `debug`，结果一条日志都看不到。**两个配置缺一不可**：`Logger.Level` 决定「记什么」，`logging.level` 决定「要不要输出」。
:::

### 超时配置：防止慢服务拖垮线程

#### 为什么必须配超时

Feign 底层发请求时，如果没有超时限制，一个慢服务可能让调用线程**无限等待**，最终线程池被占满，整个服务雪崩。所以超时是生产必配项。

| 超时类型 | 含义 | 默认值（Spring Cloud OpenFeign） |
| --- | --- | --- |
| `connectTimeout` | 建立 TCP 连接的最大等待时间 | 10 秒 |
| `readTimeout` | 连接建立后，等服务器返回数据的最大时间 | 60 秒 |

::: tip 💡 面试题：Feign 调用超时怎么配置？connectTimeout 和 readTimeout 有什么区别？
一句话结论：通过 `feign.client.config` 配置 `connectTimeout`（连接超时）和 `readTimeout`（读超时），两者都要设。
一句话原因：连接超时管「建立连接」这段，读超时管「连接建立后等服务响应」这段，慢服务卡在读超时，网络抖动卡在连接超时，缺一个都会拖垮线程。
:::

#### 配置方式

```yaml
feign:
  client:
    config:
      default:                  # default 关键字：对所有 FeignClient 生效
        connectTimeout: 2000    # 连接超时 2 秒
        readTimeout: 5000       # 读超时 5 秒
        loggerLevel: basic      # 日志级别也能配在这里
      user-service:             # 只对 user-service 这个客户端生效（覆盖 default）
        connectTimeout: 1000
        readTimeout: 3000
```

规则：**「具体服务名」的配置优先级高于 `default`，`default` 作用于所有未单独配置的客户端。** 也可以用 Java 配置类实现：

```java
@Configuration
public class FeignTimeoutConfig {
    @Bean
    public Request.Options requestOptions() {
        // 构造参数：connectTimeout, readTimeout（单位毫秒）
        return new Request.Options(2000, 5000);
    }
}
```

### 重试机制：失败自动重来

#### 默认行为

Spring Cloud OpenFeign 默认的重试器是 `Retryer.NEVER_RETRY`，也就是**默认不重试**。这跟老版本的认知不一样，面试常考。

```java
// feign 默认重试器：不重试
Retryer retryer = Retryer.NEVER_RETRY;
```

为什么默认不重试？因为微服务调用可能**不幂等**（比如下单、扣款），盲目重试会导致重复提交。所以框架把「要不要重试」的决定权交给开发者。

#### 开启重试

```java
// 自定义重试器：每隔 100ms 重试一次，最多 5 次（含首次），最大间隔 1s
@Configuration
public class FeignRetryConfig {
    @Bean
    public Retryer retryer() {
        // 参数：period 初始间隔, maxPeriod 最大间隔, maxAttempts 最大尝试次数
        return new Retryer.Default(100, TimeUnit.SECONDS.toMillis(1), 5);
    }
}
```

::: warning 注意
重试只对**连接失败、超时、5xx 服务端错误**生效（通过 `ErrorDecoder` 判断），4xx 客户端错误（参数错、404、权限不足）不会重试——重试了也没用，错误在请求本身。
:::

如果配合 Spring Cloud LoadBalancer，还可以用 Spring Retry 实现更精细的「负载均衡层重试」：

```xml
<!-- 引入 Spring Retry，负载均衡器在选实例失败时会换一个实例重试 -->
<dependency>
    <groupId>org.springframework.retry</groupId>
    <artifactId>spring-retry</artifactId>
</dependency>
```

### 自定义拦截器：token 透传的标配方案

微服务之间互相调用时，一个非常高频的需求是**透传认证信息**：用户带了 token 访问订单服务，订单服务调用户服务时要把这个 token 继续传下去，否则下游服务认证失败。

Feign 通过 `RequestInterceptor` 接口实现这个能力——**每次请求发出前，拦截器链会被自动执行**，统一往请求头塞东西：

```java
// 实现 RequestInterceptor，注册为 Spring Bean 后对所有 Feign 请求生效
@Component
public class TokenRelayInterceptor implements RequestInterceptor {

    @Override
    public void apply(RequestTemplate template) {
        // 为什么用 RequestContextHolder？它是 ThreadLocal 封装的工具，
        // 能拿到「当前线程」正在处理的 HTTP 请求，从而取出上游传来的 token
        ServletRequestAttributes attributes =
            (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();

        if (attributes != null) {
            HttpServletRequest request = attributes.getRequest();
            String token = request.getHeader("Authorization");
            if (token != null) {
                // 把 token 塞进下游请求的 header，实现认证信息透传
                template.header("Authorization", token);
            }
        }
    }
}
```

`RequestInterceptor` 的常见用途：

| 用途 | 说明 |
| --- | --- |
| 透传 token | 把上游的认证信息传给下游（如上例） |
| 透传 traceId | 把链路追踪 ID 传下去，串联调用链 |
| 加公共请求头 | 统一加 `X-Request-Id`、`X-Source` 等 |
| 加签名 | 请求发出前统一计算并附加签名 |

### 连接池优化：高并发下的必选项

#### 问题：默认实现的性能瓶颈

Feign 默认的 `Client` 实现基于 **`HttpURLConnection`**，它的致命缺点是：**每次请求都新建连接、用完即关，不支持连接复用**。高并发下反复建立/销毁 TCP 连接，性能极差。

| 底层实现 | 连接复用 | 性能 | 依赖 |
| --- | --- | --- | --- |
| `HttpURLConnection`（默认） | ❌ 每次新建 | 差 | 无（JDK 自带） |
| Apache HttpClient | ✅ 支持连接池 | 好 | `feign-httpclient` |
| OkHttp | ✅ 支持连接池 | 好 | `feign-okhttp` |

#### 切换到 OkHttp

```xml
<!-- 引入后 Feign 自动切换底层实现，支持连接复用和连接池 -->
<dependency>
    <groupId>io.github.openfeign</groupId>
    <artifactId>feign-okhttp</artifactId>
</dependency>
```

引入依赖后 Feign 会自动检测到 OkHttp 在 classpath 上并切换。要精细控制连接池参数，可自定义 `OkHttpClient`：

```java
@Configuration
public class OkHttpConfig {
    @Bean
    public OkHttpClient okHttpClient() {
        return new OkHttpClient.Builder()
                .connectTimeout(2, TimeUnit.SECONDS)   // 连接超时
                .readTimeout(5, TimeUnit.SECONDS)      // 读超时
                .connectionPool(new ConnectionPool(    // 连接池：最多 100 个空闲连接，空闲 5 分钟回收
                        100, 5, TimeUnit.MINUTES))
                .build();
    }
}
```

切换到 Apache HttpClient 的方式类似，引入 `feign-httpclient` 并配置 `feign.httpclient.enabled: true`。

### 负载均衡配置：控制「选哪个实例」

Feign 调用时写的是服务名，真正选哪个实例由负载均衡器决定。Spring Cloud 现在默认用 **Spring Cloud LoadBalancer**（老版本是 Ribbon）。

```yaml
# 指定 user-service 使用随机策略（默认是轮询 RoundRobin）
spring:
  cloud:
    loadbalancer:
      nacos:
        enabled: true
      configurations:
        user-service:
          - RandomLoadBalancer
```

内置的负载均衡策略：

| 策略 | 说明 |
| --- | --- |
| `RoundRobinLoadBalancer` | 轮询，默认策略 |
| `RandomLoadBalancer` | 随机 |
| 自定义 `ReactorServiceInstanceLoadBalancer` | 按权重、一致性哈希等自定义 |

::: tip 💡 面试题：Feign 的负载均衡是谁做的？
一句话结论：Feign 自己不做负载均衡，它把请求交给 Spring Cloud LoadBalancer（或老的 Ribbon）来选实例。
一句话原因：Feign 只负责「发请求」，具体「发给谁」由负载均衡器在运行时从注册中心拿到的实例列表中挑一个。
:::

### 熔断降级：与 Sentinel 集成

Feign 本身没有熔断能力，但可以无缝集成 [Sentinel](/learn_backend/java/微服务/Sentinel) 或 Hystrix。以 Sentinel 为例：

```xml
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-sentinel</artifactId>
</dependency>
```

```yaml
feign:
  sentinel:
    enabled: true   # 开启 Feign 的 Sentinel 支持
```

#### 方式一：fallback（不关心异常原因）

```java
@FeignClient(name = "user-service", fallback = UserClientFallback.class)
public interface UserClient {
    @GetMapping("/user/{id}")
    User getUserById(@PathVariable("id") Long id);
}

// 降级类实现同一个接口，调用失败时走这里
@Component
public class UserClientFallback implements UserClient {
    @Override
    public User getUserById(Long id) {
        // 返回一个兜底对象，避免异常直接抛给上层
        return new User(id, "默认用户");
    }
}
```

#### 方式二：fallbackFactory（能拿到异常信息）

```java
@FeignClient(name = "user-service", fallbackFactory = UserClientFallbackFactory.class)
public interface UserClient {
    @GetMapping("/user/{id}")
    User getUserById(@PathVariable("id") Long id);
}

@Component
public class UserClientFallbackFactory implements FallbackFactory<UserClient> {
    @Override
    public UserClient create(Throwable cause) {
        // 为什么用 factory？因为能拿到 cause，可以记录异常、区分超时还是服务不可用
        return id -> {
            log.error("调用 user-service 失败, id={}", id, cause);
            return new User(id, "降级用户");
        };
    }
}
```

### Feign 配置属性大全（速查表）

`feign.client.config` 下的完整配置项，收藏这张表就够了：

| 配置项 | 类型 | 作用 |
| --- | --- | --- |
| `connectTimeout` | int | 连接超时（毫秒） |
| `readTimeout` | int | 读超时（毫秒） |
| `loggerLevel` | 枚举 | 日志级别（NONE/BASIC/HEADERS/FULL） |
| `decode404` | boolean | 404 是否当作正常返回而不是抛异常 |
| `retryer` | class | 重试器类 |
| `errorDecoder` | class | 错误解码器类 |
| `requestInterceptors` | list | 请求拦截器列表 |
| `encoder` / `decoder` | class | 自定义编解码器 |
| `contract` | class | 注解解析契约（一般不动） |

### 抽取公共接口：继承式 API

当「提供方」和「调用方」由同一团队维护时，可以把 Feign 接口抽成一个公共模块，双方共用，避免重复定义、保证契约一致：

```
common-api 模块（公共契约）
    └── UserClient 接口（@FeignClient + 方法定义）
            ▲                  ▲
            │                  │
    user-service 实现接口     order-service 注入并调用
    （implements 重写方法）    （@Autowired 直接注入）
```

```java
// 公共模块里的接口，两边都依赖 common-api
@FeignClient(name = "user-service")
public interface UserClient {
    @GetMapping("/user/{id}")
    User getUserById(@PathVariable("id") Long id);
}
```

注意：这种方式虽然方便，但会把「提供方」和「调用方」耦合在同一个接口上，一方改接口另一方必须同步升级，适合**内部服务**，对外接口不推荐。

### 错误处理：自定义 ErrorDecoder

Feign 默认的 `ErrorDecoder` 逻辑很简单：响应状态码 2xx 正常返回，**4xx 和 5xx 都直接抛 `FeignException`**。但生产环境往往需要更细粒度的处理——比如 404 返回默认值、500 记录告警、业务错误码转自定义异常。

```java
// 自定义 ErrorDecoder，根据状态码做差异化处理
@Component
public class CustomErrorDecoder implements ErrorDecoder {

    private final ErrorDecoder defaultDecoder = new ErrorDecoder.Default();

    @Override
    public Exception decode(String methodKey, Response response) {
        // 为什么返回 FeignException？它是 Feign 统一的异常类型，上层可以统一捕获
        if (response.status() == 404) {
            return new ResourceNotFoundException("资源不存在: " + methodKey);
        }
        if (response.status() >= 500) {
            // 5xx 服务端错误，通常配合重试器做重试
            return new RetryableException(response.status(), methodKey, null, null, null);
        }
        // 其它情况走默认逻辑
        return defaultDecoder.decode(methodKey, response);
    }
}
```

配合 `@FeignClient` 的 `decode404` 属性，可以让 404 直接返回 null 而不是抛异常：

```java
@FeignClient(name = "user-service", configuration = FeignConfig.class)
public interface UserClient {
    @GetMapping("/user/{id}")
    User getUserById(@PathVariable("id") Long id);   // 404 时返回 null
}
```

```java
public class FeignConfig {
    @Bean
    public ErrorDecoder errorDecoder() {
        return new CustomErrorDecoder();
    }
}
```

### 文件上传：multipart 表单

Feign 支持 multipart 文件上传，用 `@RequestPart` 绑定文件参数：

```java
@FeignClient(name = "file-service")
public interface FileClient {

    // consumes = MULTIPART_FORM_DATA_VALUE 声明这是 multipart 请求
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    String upload(@RequestPart("file") MultipartFile file);
}
```

调用方需要把文件转成 `MultipartFile`（通常是 `MockMultipartFile`）再传入：

```java
// 调用示例：把本地文件读进来封装成 MultipartFile 传给 Feign
File file = new File("C:/temp/photo.jpg");
FileInputStream input = new FileInputStream(file);
MultipartFile multipartFile = new MockMultipartFile(
    "file", file.getName(), "image/jpeg", input);

String result = fileClient.upload(multipartFile);
```

::: warning 注意
Feign 文件上传依赖 `feign-form` 支持，Spring Cloud OpenFeign 已内置。多个文件时用 `@RequestPart("files") MultipartFile[] files` 或 `List<MultipartFile>`。
:::

### 小结

高级篇解决的是一句「生产环境能不能扛住」的问题：日志帮你排错、超时和重试帮你防雪崩、拦截器帮你透传上下文、连接池帮你扛并发、熔断帮你兜底。这些配置背下来，Feign 就能从「能用」变成「好用」。下一篇原理篇，我们掀开它的盖子，看它到底是怎么用动态代理把接口变成 HTTP 请求的。

---

## 原理篇

原理篇的目标只有一个：**搞清楚「调用一个接口方法」到「发出一段 HTTP 请求」之间，到底发生了什么。** 这是面试的重灾区，也是理解 Feign 一切配置行为的钥匙。

### 整体架构：一次调用经过哪些组件

先建立全局视图。OpenFeign 的一次远程调用，数据要流经下面这条流水线：

```
┌──────────────────────────────────────────────────────────────────┐
│                    调用方 OrderService                             │
│                 userClient.getUserById(1L)                        │
└──────────────────────────────┬───────────────────────────────────┘
                               │ ① 调用接口方法
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│          JDK 动态代理  FeignInvocationHandler                      │
│      持有 Map<Method, MethodHandler> 方法→处理器 映射表             │
└──────────────────────────────┬───────────────────────────────────┘
                               │ ② invoke() 按方法路由到对应 handler
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│         SynchronousMethodHandler（每个方法一个实例）                │
│  ③ 解析注解 → 生成 RequestTemplate（URL/头/查询参数/请求体）         │
│  ④ 执行 RequestInterceptor 链（加 token、traceId）                 │
│  ⑤ Encoder 编码请求体（Java 对象 → JSON 字节）                     │
└──────────────────────────────┬───────────────────────────────────┘
                               │ ⑥ execute(request)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                Client（真正发 HTTP 请求的组件）                     │
│  LoadBalancerClient → 负载均衡选实例 → 真实 HTTP Client             │
│  （HttpURLConnection / OkHttp / Apache HttpClient）                │
└──────────────────────────────┬───────────────────────────────────┘
                               │ ⑦ HTTP 响应返回
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  ⑧ ErrorDecoder 校验状态码（4xx/5xx 抛异常）                       │
│  ⑨ Decoder 反序列化响应体（JSON 字节 → Java 对象）                  │
└──────────────────────────────┬───────────────────────────────────┘
                               ▼
                      返回 User 对象给调用方
```

记住这条流水线，下面每一节都是在放大其中的某一段。

### 核心组件：Feign 的「可插拔零件」

OpenFeign 采用**组件化设计**，每一步都是一个可替换的接口，这也是它能灵活集成各种实现（JSON 库、HTTP 客户端、负载均衡器）的原因：

| 组件接口 | 职责 | 默认实现 |
| --- | --- | --- |
| `Contract` | 解析接口方法上的注解，生成 `MethodMetadata` | `SpringMvcContract` |
| `Encoder` | 把 Java 对象编码成 HTTP 请求体 | `SpringEncoder`（底层 Jackson） |
| `Decoder` | 把 HTTP 响应体解码成 Java 对象 | `SpringDecoder`（底层 Jackson） |
| `Client` | 真正执行 HTTP 请求 | `Client.Default`（HttpURLConnection） |
| `RequestInterceptor` | 请求发出前拦截并修改请求 | 无 |
| `Retryer` | 失败重试策略 | `Retryer.NEVER_RETRY` |
| `Logger` | 记录请求日志 | `NoOpLogger`（不输出） |
| `ErrorDecoder` | 根据响应状态码决定是否抛异常 | `ErrorDecoder.Default` |

这些组件在 `Feign.Builder` 里装配，最终通过 `build()` 拼出一个完整的 Feign 客户端。

### 动态代理机制：接口如何「活」起来（源码级）

这是整个 OpenFeign 的**灵魂**，面试必问。

#### 第一步：`@EnableFeignClients` 启动扫描

`@EnableFeignClients` 注解上标了 `@Import(FeignClientsRegistrar.class)`，`FeignClientsRegistrar` 会在容器启动时扫描指定包下所有 `@FeignClient` 接口，为每个接口注册一个 `FeignClientFactoryBean`。

```
@EnableFeignClients
       │  @Import(FeignClientsRegistrar.class)
       ▼
FeignClientsRegistrar.registerBeanDefinitions()
       │  扫描 basePackages 下所有 @FeignClient 接口
       ▼
为每个接口注册一个 FeignClientFactoryBean（BeanDefinition）
       │  FeignClientFactoryBean 实现 FactoryBean，getObject() 负责造代理
       ▼
容器启动，注入时触发 getObject()
```

`FeignClientFactoryBean` 之所以叫 FactoryBean，是因为它**不直接注册接口本身，而是注册「造代理对象的工厂」**——容器拿到的是工厂，工厂产出的是代理。

#### 第二步：构建 Feign.Builder

`FeignClientFactoryBean.getObject()` 内部会调用 `feign(context)` 构建一个 `Feign.Builder`，把前面表格里的各个组件（Contract、Encoder、Decoder、Client、Retryer 等）装配进去：

```java
// 简化版源码逻辑（FeignClientFactoryBean 内部）
protected Feign.Builder feign(FeignContext context) {
    // 从 context 里按客户端名拿各个组件，没有就用默认的
    Feign.Builder builder = Feign.builder()
            .contract(context.getInstance(name, Contract.class))       // 注解解析
            .encoder(context.getInstance(name, Encoder.class))        // 请求体编码
            .decoder(context.getInstance(name, Decoder.class))        // 响应解码
            .client(context.getInstance(name, Client.class))          // HTTP 客户端
            .retryer(context.getInstance(name, Retryer.class))        // 重试器
            .requestInterceptors(...);                                // 拦截器链
    return builder;
}
```

这里的 `FeignContext` 是每个客户端独立的配置容器，这就是「不同 FeignClient 可以有不同的 configuration」的底层原因。

#### 第三步：`ReflectiveFeign` 生成代理

`Feign.Builder.target()` 最终委托给 `ReflectiveFeign.newInstance()`，它做了两件关键的事：

1. **遍历接口的每个方法，为每个方法生成一个 `MethodHandler`**（默认是 `SynchronousMethodHandler`），存进 `Map<Method, MethodHandler>`。
2. **调用 JDK 的 `Proxy.newProxyInstance` 生成代理对象**，`InvocationHandler` 就是 `FeignInvocationHandler`。

```java
// 简化版源码逻辑（ReflectiveFeign 内部）
public <T> T newInstance(Target<T> target) {
    // ① 为每个方法解析元数据 + 创建处理器，放进映射表
    Map<String, MethodHandler> nameToHandler = targetToHandlersByName.apply(target);
    Map<Method, MethodHandler> dispatch = new LinkedHashMap<>();
    for (Method method : target.type().getMethods()) {
        dispatch.put(method, nameToHandler.get(Feign.configKey(target.type(), method)));
    }
    // ② 用 JDK 动态代理生成代理对象
    InvocationHandler handler = factory.create(target, dispatch);
    T proxy = (T) Proxy.newProxyInstance(
        target.type().getClassLoader(),           // 类加载器
        new Class<?>[]{ target.type() },          // 要代理的接口
        handler);                                  // 调用处理器
    return proxy;
}
```

关键点：**OpenFeign 用的是 JDK 动态代理，所以 `@FeignClient` 必须是接口，不能是类**——JDK 代理只能代理接口。

#### 第四步：方法调用被拦截

当你调用 `userClient.getUserById(1L)` 时，实际上调用的是代理对象的方法，会被 `FeignInvocationHandler.invoke()` 拦截：

```java
// 简化版源码逻辑（FeignInvocationHandler 内部）
public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    // 跳过 Object 自带方法（toString、hashCode、equals）
    if ("equals".equals(method.getName())) { ... }
    if ("hashCode".equals(method.getName())) { ... }
    // 从映射表里按方法找到对应的处理器，交给它执行
    return dispatch.get(method).invoke(args);
}
```

### 请求执行流程：`SynchronousMethodHandler` 内部（源码级）

`SynchronousMethodHandler` 是每次调用的「执行中枢」，它把一个方法调用拆成 7 个步骤：

```
SynchronousMethodHandler.invoke(args)
   │
   ├─ ① createRequest(args)
   │     用 MethodMetadata（启动时解析好的注解元数据）把实参填进模板
   │     → 生成 RequestTemplate（URL、headers、query、body）
   │
   ├─ ② targetRequest(template)
   │     把 http://user-service/user/1 中的服务名替换为真实 IP:端口
   │     （这一步由 Client 里的负载均衡器完成，见下一节）
   │
   ├─ ③ 执行 RequestInterceptor 链
   │     依次调用所有拦截器的 apply()，往 RequestTemplate 加 token 等
   │
   ├─ ④ 用 Retryer 包裹执行
   │     失败时按重试策略决定是否重试（默认不重试）
   │
   ├─ ⑤ client.execute(request, options)
   │     真正把 HTTP 请求发出去，拿到 Response
   │
   ├─ ⑥ 状态码校验
   │     ErrorDecoder 判断 4xx/5xx，需要抛异常就抛（FeignException）
   │
   └─ ⑦ decoder.decode(response, returnType)
         把响应体 JSON 反序列化成方法声明的返回类型
```

用一张「类结构图」看清 `ReflectiveFeign` 内部的内存布局——它就是代理对象背后真正的数据结构：

```
ReflectiveFeign
 ├─ Map<Method, MethodHandler> dispatch   // 方法 → 处理器 的映射表
 │     └─ SynchronousMethodHandler        // 每个接口方法一个
 │           ├─ MethodMetadata metadata   // 启动时解析好的方法元数据
 │           │     ├─ configKey           // "UserClient#getUserById(Long)"
 │           │     ├─ template            // 请求模板（含路径/头/参数占位符）
 │           │     ├─ returnType          // 方法返回类型 User
 │           │     ├─ urlIndex / bodyIndex // 参数在实参数组中的位置
 │           │     └─ headers / queryMap  // 声明的头和查询参数
 │           ├─ Encoder encoder           // 请求体编码器
 │           ├─ Decoder decoder           // 响应解码器
 │           ├─ Client client             // HTTP 客户端
 │           ├─ List<RequestInterceptor>  // 拦截器链
 │           └─ Retryer retryer           // 重试器
 └─ InvocationHandlerFactory             // 产出 FeignInvocationHandler
```

::: tip 💡 面试题：OpenFeign 的实现原理是什么？
一句话结论：基于 JDK 动态代理，为每个 `@FeignClient` 接口生成代理对象，方法调用时由代理拦截并解析注解、构造并发送 HTTP 请求。
一句话原因：`@EnableFeignClients` 扫描接口 → `FeignClientFactoryBean` 构建 `Feign.Builder` → `ReflectiveFeign` 用 `Proxy.newProxyInstance` 生成代理 → 调用时 `FeignInvocationHandler.invoke()` 路由到 `SynchronousMethodHandler` 执行。
一句话展开：`SynchronousMethodHandler` 内部完成「解析注解生成模板 → 执行拦截器 → 编码 → 发请求 → 解码」的完整流程。
:::

### 注解是如何变成请求的：`Contract` 与 `MethodMetadata`

为什么 `@GetMapping("/user/{id}")` 能变成真实的 HTTP 请求？答案是 `Contract` 组件。

`SpringMvcContract` 在**启动时**（而非每次调用时）就解析好每个方法的注解，生成 `MethodMetadata` 缓存起来。解析内容包括：

| 解析项 | 来源注解 | 存入 |
| --- | --- | --- |
| HTTP 方法 + 路径 | `@GetMapping` 等 | `template` 的 method + url |
| 路径变量 | `@PathVariable` | `urlIndex`（参数位置映射） |
| 查询参数 | `@RequestParam` | `template` 的 query 占位符 |
| 请求体 | `@RequestBody` | `bodyIndex` |
| 请求头 | `@RequestHeader` | `template` 的 header |
| 返回类型 | 方法返回值 | `returnType` |

这样设计的好处是**性能**：注解解析是反射操作，比较耗时，如果每次调用都解析，高并发下就是巨大的开销。启动时解析一次、缓存起来，运行时只需「把实参填进模板」，非常快。

### 负载均衡如何集成：服务名如何变成 IP（源码级）

这是「`@FeignClient("user-service")` 里的服务名怎么变成真实地址」的完整机制。

Feign 的 `Client` 组件在 Spring Cloud 环境下，默认被替换成**带负载均衡的 Client**：老版本是 `LoadBalancerFeignClient`（Ribbon），新版是 `FeignBlockingLoadBalancerClient`（Spring Cloud LoadBalancer）。

```
请求 URL 模板： http://user-service/user/1
                         │
                         ▼
FeignBlockingLoadBalancerClient.execute()
   │
   ├─ loadBalancer.choose("user-service")
   │        │
   │        ▼
   │   从 Nacos 拉取 user-service 的实例列表
   │        ├─ 192.168.1.10:8081
   │        ├─ 192.168.1.11:8081
   │        └─ 192.168.1.12:8081
   │        │
   │        ▼ 按负载均衡策略（默认轮询）选出一个实例
   │   选中 192.168.1.11:8081
   │
   ▼
替换 URL： http://192.168.1.11:8081/user/1
   │
   ▼
交给真正的 HTTP Client（OkHttp 等）发送请求
```

整个「服务名 → IP」的解析发生在**运行时**，而不是启动时。每次请求都会重新 `choose` 一次，这也是为什么实例下线后，Feign 能自动切到其它健康实例的原因。

::: tip 💡 面试题：Feign 怎么知道目标服务的地址？
一句话结论：Feign 用服务名去注册中心（Nacos）查实例列表，再通过负载均衡器（Spring Cloud LoadBalancer）选出一个真实地址。
一句话原因：`@FeignClient` 只写了服务名，真正的 IP 由「注册发现 + 负载均衡」在运行时动态解析，所以实例上下线对调用方透明。
:::

### 一次调用的完整时序总结

把前面所有片段串起来，一次 `userClient.getUserById(1L)` 的完整生命周期：

```
1. 启动时
   ├─ FeignClientsRegistrar 扫描 @FeignClient 接口
   ├─ SpringMvcContract 解析注解 → MethodMetadata
   ├─ FeignClientFactoryBean 构建 Feign.Builder（装配所有组件）
   └─ ReflectiveFeign 生成代理对象（Map<Method, MethodHandler> + Proxy）

2. 运行时（每次调用）
   ├─ 调用接口方法 → 代理拦截（FeignInvocationHandler.invoke）
   ├─ 按 Method 找到 SynchronousMethodHandler
   ├─ createRequest：实参填进模板 → RequestTemplate
   ├─ RequestInterceptor 链执行（加 token）
   ├─ Client.execute：负载均衡选实例 → 真实 IP 替换服务名
   ├─ 真正 HTTP 客户端发送请求
   ├─ ErrorDecoder 校验状态码
   └─ Decoder 反序列化 → 返回对象
```

### 小结

原理篇的终极结论一句话：**OpenFeign = JDK 动态代理 + 注解解析（Contract）+ 可插拔组件（Client/Encoder/Decoder）+ 运行时负载均衡**。理解了这条链路，前面高级篇里所有的配置（日志、超时、重试、拦截器、连接池）就都有了归属——它们本质都是在替换或调整这条流水线上的某个「零件」。

---

## 面试常问

**1. OpenFeign 是什么？**

结论：一个声明式的 HTTP 客户端，写接口 + 注解即可完成微服务间远程调用。展开：它基于 JDK 动态代理，把「接口方法」自动翻译成「HTTP 请求」，隐藏了 URL 拼接、序列化、负载均衡等所有模板代码。相比 `RestTemplate`，代码更简洁、更易维护。

**2. Feign 和 OpenFeign 有什么区别？**

结论：Feign 是 Netflix 的老版本（用 `@RequestLine` 等自己的注解，已停更），OpenFeign 是社区续作，Spring Cloud OpenFeign 是 Spring 的整合版。展开：现在项目里说的「Feign」几乎都指 Spring Cloud OpenFeign，它支持 Spring MVC 注解，并深度集成负载均衡、熔断、注册发现。面试官问这个问题，本质是考察你对「技术演进和版本归属」的敏感度。

**3. OpenFeign 的实现原理（动态代理流程）？**

结论：`@EnableFeignClients` 扫描接口 → `FeignClientFactoryBean` 构建 `Feign.Builder` → `ReflectiveFeign` 用 `Proxy.newProxyInstance` 生成代理 → 调用时 `FeignInvocationHandler` 路由到 `SynchronousMethodHandler`。展开：`SynchronousMethodHandler` 内部依次完成「解析注解生成 RequestTemplate → 执行拦截器 → Encoder 编码 → Client 发请求 → Decoder 解码」。因为用的是 JDK 动态代理，所以 `@FeignClient` 必须是接口。

**4. Feign 怎么找到目标服务地址、怎么做负载均衡？**

结论：Feign 自己不做负载均衡，它写的是服务名，运行时由 Spring Cloud LoadBalancer（或老的 Ribbon）从注册中心（Nacos）拿实例列表，选出一个真实 IP 替换。展开：`Client` 组件在 Spring Cloud 下默认被替换成带负载均衡的 `FeignBlockingLoadBalancerClient`，每次请求都会 `choose` 一次，所以实例上下线对调用方透明。

**5. Feign 的超时怎么配置？connectTimeout 和 readTimeout 的区别？**

结论：通过 `feign.client.config` 配 `connectTimeout`（连接超时）和 `readTimeout`（读超时）。展开：连接超时管「建立 TCP 连接」，读超时管「连接建立后等服务响应」。Spring Cloud OpenFeign 默认连接 10s、读 60s，生产环境必须按业务调小，否则慢服务会拖垮线程池引发雪崩。

**6. 如何透传请求头（如 token、traceId）？**

结论：实现 `RequestInterceptor` 接口，重写 `apply(RequestTemplate)`，用 `RequestContextHolder` 拿到上游请求的 token 塞进 `RequestTemplate`。展开：拦截器链在每次请求发出前自动执行，注册为 Spring Bean 后对所有 Feign 请求生效。这是微服务「认证信息透传」和「链路追踪串联」的标配方案。

**7. Feign 默认重试吗？为什么？**

结论：默认不重试（`Retryer.NEVER_RETRY`）。展开：因为远程调用可能不幂等（下单、扣款），盲目重试会重复提交。需要重试时自定义 `Retryer.Default` 或引入 Spring Retry，但要注意重试只对连接失败、超时、5xx 生效，4xx 不会重试。

**8. Feign 默认的 HTTP 客户端是什么？为什么要换？**

结论：默认 `HttpURLConnection`，每次请求新建连接、不支持连接复用，性能差。展开：生产环境引入 `feign-okhttp` 或 `feign-httpclient`，让 Feign 自动切换到支持连接池的客户端，提升高并发下的性能。这是「默认实现能用但不优」的典型案例。

---

## 相关知识

- [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)：OpenFeign 所属的微服务治理体系
- [Nacos](/learn_backend/java/微服务/Nacos)：提供服务注册发现，为 Feign 解析「服务名 → 地址」
- [Sentinel](/learn_backend/java/微服务/Sentinel)：与 Feign 集成实现熔断降级
- [Gateway](/learn_backend/java/微服务/Gateway)：统一网关入口，与 Feign 都是服务调用链的一环
- [Spring](/learn_backend/java/基础/Spring)：理解 Feign 依赖的 IoC 与 AOP（动态代理）基础
- [并发编程](/learn_backend/java/Java核心/并发编程)：理解动态代理、ThreadLocal（`RequestContextHolder`）等底层机制


