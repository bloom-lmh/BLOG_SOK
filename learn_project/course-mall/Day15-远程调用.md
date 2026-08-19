# Day 15 · 远程调用（OpenFeign 声明式调用 + 负载均衡 + 超时重试）

> **今天目标**：让 `mall-user` 通过 OpenFeign **像调本地方法一样**调用 `mall-course` 的接口，把「声明式调用、负载均衡、超时重试」三件事跑通并看懂原理。这是微服务「服务之间互相调用」的第一课，Day 16 网关、Day 17 熔断都建立在它之上。

## 一、前置条件

- 已完成 **Day 13（服务拆分 + Nacos 注册）**：`mall-user`（8080）、`mall-course`（8081）两个服务都已注册到 Nacos，`mall-course` 已有 `GET /api/course/list` 课程列表接口（内存数据）
- 已完成 **Day 14（配置中心）**：`mall-user` 已接入 Nacos Config，`dev` 命名空间已建好
- **Nacos Server 已启动**（`http://localhost:8848/nacos`），控制台服务列表能看到两个服务
- `mall-common` 公共模块可用（Result / ErrorCode / GlobalExceptionHandler，Day 1 建的）

> ⚠️ 今天不建新表、不引入数据库。课程数据继续用**内存数据**演示，把注意力全部放在 OpenFeign 上——课程表和种子数据 Day 2 已建好，真实查库后续接上即可。

## 二、今天要解决的问题（为什么需要远程调用）

Day 13 把单体拆成了多个服务，每个服务有自己的进程。于是出现一个新问题：**服务之间怎么互相调接口？** 如果还用老办法，会遇到这些痛点：

| 痛点 | 具体表现 |
|---|---|
| URL 硬编码 | `RestTemplate` 要写死 `http://localhost:8081`，服务一多、IP 一变就全崩 |
| 没有负载均衡 | 服务有多个实例时，不知道发给哪一个 |
| 样板代码多 | 每次调用都要 `new RestTemplate()` → 拼 URL → 手动反序列化 JSON → 手动判断 HTTP 状态码 |
| 超时/重试难统一 | 每个调用点自己写超时、重试，散落各处，出问题不好排查 |

**OpenFeign** 就是来解决这些的：把「远程调用」声明成一个**接口方法**，Spring 在运行时生成**动态代理**。你调用接口方法时，它自动完成「发现服务 → 负载均衡挑实例 → 发 HTTP 请求 → 反序列化 JSON → 返回结果」。

::: tip 💡 面试题：OpenFeign 和 Feign 有什么区别？它比 `RestTemplate` 好在哪？
**一句话**：Feign 是 Netflix 开源的声明式 HTTP 客户端，OpenFeign 是 Spring Cloud 对它的封装——**支持 Spring MVC 注解**（`@GetMapping`/`@PathVariable`）且深度整合服务发现和负载均衡。比 `RestTemplate` 好在：**不用写 URL 拼接和反序列化样板代码**，一个接口方法就是一次远程调用，可读性、可维护性高一个量级。详见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)。
:::

::: tip 💡 面试题：OpenFeign（HTTP 声明式）和 Dubbo（RPC）的本质区别？
**一句话**：都是远程调用，但 OpenFeign 走 **HTTP + JSON**：跨语言、协议透明、可用 curl 直接调试；Dubbo 走**自定义 RPC 协议 + 二进制序列化**：性能更高、服务治理更全，但绑定 Java。Spring Cloud 生态主打 HTTP 好对接（网关/前端/第三方），Dubbo 主打服务间高性能调用。详见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)、[分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

## 三、步骤

### 步骤 0：先理清调用关系

```
┌─────────────────┐        ① OpenFeign 声明式调用          ┌─────────────────────┐
│    mall-user     │ ───────────────────────────────────▶ │     mall-course      │
│   (8080 消费者)  │                                       │  (8081/8082 提供者)  │
│                 │     只写服务名 "mall-course"           │                      │
│ RemoteCallController ─▶ CourseClient(接口) ─▶ Nacos 服务发现 ─▶ 负载均衡挑实例 ─▶ /api/course/{id}
└─────────────────┘                                       └─────────────────────┘
```

关键点：`mall-user` 里**不写任何 IP:Port**，只写服务名 `mall-course`。OpenFeign 拿着这个名字去 Nacos 查实例列表，再用负载均衡挑一个实例发请求。

### 步骤 1：共享 DTO + 给 mall-course 补两个端点

**为什么要把 `CourseVO` 放 `mall-common`？** 因为 `mall-course` 返回它、`mall-user` 接收它，两边要用同一个类。放公共模块只写一份，不会出现「两份各改各的、字段对不上」——这是微服务的常见做法。

新建 `E:\course-mall\mall-common\src\main\java\com\mall\common\vo\CourseVO.java`：

```java
package com.mall.common.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class CourseVO {
    private Long id;
    private String title;
    private BigDecimal price;   // 金额：和数据库一致用 BigDecimal（Day 2 的 DECIMAL），不用 double
    private String teacherName; // 讲师名（真实场景 mall-course join teacher 得到）
    private Integer port;       // 返回该数据的实例端口——学习时用来「肉眼验证负载均衡」，生产别暴露
}
```

> 注意：`port` 字段纯粹是为了今天的负载均衡实验能「看见」请求轮询到了不同实例。生产环境用链路追踪（traceId，Day 18）定位请求，不会把端口暴露给前端。

再改 `E:\course-mall\mall-course\src\main\java\com\mall\course\controller\CourseController.java`——**保留 Day 13 的 `/list`，新增 `/{id}` 详情和 `/slow` 慢接口**，并统一用公共 `CourseVO`（删掉 Day 13 内嵌的 record）：

```java
package com.mall.course.controller;

import com.mall.common.result.Result;
import com.mall.common.vo.CourseVO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/course")
public class CourseController {

    // 注入当前实例端口：塞进 CourseVO.port，让负载均衡实验能看到「这次请求落在哪个实例」
    @Value("${server.port}")
    private Integer port;

    // ① Day 13 拆出来的老接口：课程列表。
    // 今天升级成返回公共 CourseVO（原内嵌 record 删掉），保证「提供方/消费方用同一个类」
    @GetMapping("/list")
    public Result<List<CourseVO>> list() {
        List<CourseVO> courses = List.of(
                build(1L, "Java 高并发实战", new BigDecimal("199.00"), "张老师"),
                build(2L, "MySQL 底层原理", new BigDecimal("99.00"), "张老师"),
                build(3L, "大模型 Agent 开发", new BigDecimal("299.00"), "李老师")
        );
        return Result.ok(courses);
    }

    // ② 今天新增：课程详情——消费方 Feign 调的就是这个接口。
    // 真实项目走 MyBatis 查 course join teacher（Day 6 单体里已实现过）；
    // 今天聚焦 OpenFeign，用内存数据保证链路可独立跑通，不引入数据库干扰
    @GetMapping("/{id}")
    public Result<CourseVO> getCourse(@PathVariable("id") Long id) {
        return Result.ok(build(id, "Java 高并发实战", new BigDecimal("199.00"), "张老师"));
    }

    // ③ 今天新增：慢接口，sleep 5 秒——专门用来触发「读超时」和观察「超时后的重试」
    @GetMapping("/slow")
    public Result<String> slow() throws InterruptedException {
        Thread.sleep(5000);
        return Result.ok("slow from port " + port);
    }

    private CourseVO build(Long id, String title, BigDecimal price, String teacherName) {
        CourseVO vo = new CourseVO();
        vo.setId(id);
        vo.setTitle(title);
        vo.setPrice(price);
        vo.setTeacherName(teacherName);
        vo.setPort(port);   // 学习用途：标记本次响应由哪个实例返回
        return vo;
    }
}
```

> 改完后 `/list` 的返回 JSON 会多出 `teacherName`、`port` 两个字段，不影响旧逻辑；3 门课的数据与 Day 2 种子数据保持一致。

### 步骤 2：mall-user 引入 OpenFeign 依赖

打开 `E:\course-mall\mall-user\pom.xml`，在 `<dependencies>` 里**新增**：

```xml
<!-- OpenFeign：声明式 HTTP 客户端。版本由 Day13 引入的 Spring Cloud BOM 统一管理，不写版本号 -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
<!-- 负载均衡：Spring Cloud LoadBalancer（Ribbon 已停更）。nacos-discovery 通常会传递引入它，
     这里显式声明，语义更清楚：OpenFeign + LoadBalancer 一起才能「按服务名挑实例」 -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-loadbalancer</artifactId>
</dependency>
```

::: tip 💡 面试题：为什么现在用 Spring Cloud LoadBalancer 而不是 Ribbon？
**一句话**：Ribbon 已进入**维护模式、不再更新**，Spring Cloud 2020+ 用 LoadBalancer 替代它，默认轮询策略。只要引了 `spring-cloud-starter-loadbalancer`，`@FeignClient(name = "服务名")` 就能自动按服务名做负载均衡。详见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)。
:::

::: tip 💡 面试题：LoadBalancer 默认什么策略？能换吗？
**一句话**：默认**轮询（RoundRobin）**。要换成随机/最少连接/按 Nacos 权重等策略，用 `@LoadBalancerClient(name = "服务名", configuration = 自定义配置类)` 单独指定，或 `@LoadBalancerClients(defaultConfiguration = ...)` 全局指定。详见 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)。
:::

### 步骤 3：定义 Feign 客户端接口

新建 `E:\course-mall\mall-user\src\main\java\com\mall\user\feign\CourseClient.java`：

```java
package com.mall.user.feign;

import com.mall.common.result.Result;
import com.mall.common.vo.CourseVO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

// name = "mall-course"：远程服务名（= mall-course 注册到 Nacos 的名字）。
// OpenFeign 拿这个名字去 Nacos 查实例列表，再用负载均衡挑一个实例，所以这里不写 IP:Port。
@FeignClient(name = "mall-course")
public interface CourseClient {

    // 方法签名要和 mall-course 的 Controller 完全对齐：路径、参数注解、返回类型都一致。
    // 你「调用 getCourse(id)」就等价于「GET mall-course 的 /api/course/{id}」
    @GetMapping("/api/course/{id}")
    Result<CourseVO> getCourse(@PathVariable("id") Long id);

    // 慢接口（测超时 + 重试用）
    @GetMapping("/api/course/slow")
    Result<String> slow();
}
```

**这里为什么是接口、不是类？** 因为 OpenFeign 的核心就是**动态代理**：启动时扫描所有 `@FeignClient` 接口，为每个接口生成一个代理实现类。代理拦截你的方法调用，读取方法上的 MVC 注解拼出真实请求，交给底层 HTTP 客户端发出去，再把 JSON 响应反序列化成返回类型。

::: tip 💡 面试题：OpenFeign 底层是怎么实现的？
**一句话**：`@EnableFeignClients` 扫描 `@FeignClient` 接口 → 用 **JDK 动态代理**为接口生成代理类 → 调用接口方法时，代理类读取方法上的 MVC 注解（`@GetMapping`、`@PathVariable`）拼出 URL 和参数 → 通过 LoadBalancer 拿到实例地址 → 发 HTTP 请求 → 用 Jackson 把响应体反序列化成方法返回类型。详见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)。
:::

::: tip 💡 面试题：`@FeignClient` 的 `name` 和 `url` 属性分别什么时候用？
**一句话**：`name` 填**服务名**，配合服务发现 + 负载均衡，实例增删、IP 变更都不用改代码（生产主流）；`url` 填**固定地址**（如 `http://localhost:8081`），绕过服务发现，一般只在**本地联调、对接非注册中心的老系统**时用。
:::

### 步骤 4：开启 Feign + 配置超时

**4.1 启动类加 `@EnableFeignClients`**，改 `E:\course-mall\mall-user\src\main\java\com\mall\user\MallUserApplication.java`：

```java
package com.mall.user;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication(scanBasePackages = "com.mall")
// 开启 OpenFeign：扫描本类所在包（com.mall.user）及其子包里的 @FeignClient 接口，
// 为它们生成动态代理并注册成 Bean。我们的 CourseClient 在 com.mall.user.feign，能被扫到。
@EnableFeignClients
public class MallUserApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallUserApplication.class, args);
    }
}
```

::: tip 💡 面试题：启动报 `No qualifying bean of type 'CourseClient'` 是怎么回事？
**一句话**：`@EnableFeignClients` 默认只扫**启动类所在包及其子包**——接口放到了扫描范围外就扫不到；要么把接口挪进扫描范围，要么显式指定 `@EnableFeignClients(basePackages = "com.mall.user.feign")`。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

**4.2 配置超时**。改 `E:\course-mall\mall-user\src\main\resources\application.yml`，在 `spring.cloud` 下新增 `openfeign` 段（完整配置如下，Day 13/14 的注册中心、配置中心配置原样保留）：

```yaml
server:
  port: 8080

spring:
  application:
    name: mall-user
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
      config:
        server-addr: localhost:8848
        namespace: dev
        group: DEFAULT_GROUP
    # ---- 今天新增：OpenFeign 超时配置 ----
    openfeign:
      client:
        config:
          mall-course:               # 只针对 mall-course 这个 FeignClient 生效（键 = @FeignClient 的 name）
            connectTimeout: 1000     # 建立 TCP 连接的超时（毫秒），Feign 默认 10s
            readTimeout: 2000        # 读响应超时（毫秒），Feign 默认 60s；超过就抛超时异常
  config:
    import:
      - optional:nacos:${spring.application.name}.yaml
```

> `connectTimeout`（建连超时）和 `readTimeout`（读超时）是两个概念：前者是「三次握手连不上服务器」的超时，后者是「连上了但服务器一直不返回数据」的超时。我们今天的 `slow` 接口 sleep 5 秒，`readTimeout=2000`（2 秒）就会触发读超时。
>
> 配置放本地还是放 Nacos？openfeign 超时属于「基建配置」，放本地 yml 即可；放 Nacos 也行，但 Day 14 说过**远程配置优先级更高**——同样的 key 别两处都写，容易自己把自己绕晕。

::: tip 💡 面试题：`connectTimeout` 和 `readTimeout` 有什么区别？
**一句话**：`connectTimeout` 是**建立连接**阶段的超时（服务器连不上）；`readTimeout` 是**连接建立后等待响应数据**的超时（服务器处理慢、迟迟不回）。常见的「调用下游慢接口超时」走的是 `readTimeout`。详见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)。
:::

::: tip 💡 面试题：Feign 默认 readTimeout 是 60 秒，为什么线上不能用默认值？
**一句话**：下游一旦变慢，60 秒内所有调用线程都阻塞在等响应上，上游 Tomcat 线程池很快被打满、整体雪崩。所以线上必须按接口的 P99 耗时**显式调小读超时**，再配合 Day 17 的 Sentinel 熔断兜底。详见 [Sentinel](/learn_backend/java/微服务/Sentinel)。
:::

### 步骤 5：Controller 用 Feign 远程调用

新建 `E:\course-mall\mall-user\src\main\java\com\mall\user\controller\RemoteCallController.java`：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import com.mall.common.vo.CourseVO;
import com.mall.user.feign.CourseClient;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
public class RemoteCallController {

    // 注入的是 OpenFeign 生成的「代理对象」，你看到的类型是接口 CourseClient
    @Autowired
    private CourseClient courseClient;

    // 聚合接口：个人中心要展示「用户 + 正在学的课」。课程信息不在本服务，靠远程调用拿到。
    @GetMapping("/course/{id}")
    public Result<Map<String, Object>> userCourse(@PathVariable("id") Long id) {
        // 像调本地方法一样调远程服务——这就是「声明式调用」，一行代码完成一次跨服务 HTTP 请求
        Result<CourseVO> remote = courseClient.getCourse(id);

        Map<String, Object> data = new HashMap<>();
        data.put("user", "当前登录用户（mall-user 自己查）");
        data.put("course", remote.getData());   // 远程返回的课程信息
        return Result.ok(data);
    }

    // 探针接口：直接转发到慢接口，方便用 curl 测超时
    @GetMapping("/course/slow")
    public Result<String> slow() {
        return courseClient.slow();
    }
}
```

### 步骤 6：验证「声明式调用」+「负载均衡」（起两个 mall-course 实例）

先整体编译，再启动服务（Nacos 保持运行，Day 13 起的）：

```bash
# 在 E:\course-mall\ 根目录
mvn clean install -DskipTests

# 终端 1：启动 mall-user
mvn -pl mall-user spring-boot:run

# 终端 2：启动 mall-course 实例 A（端口 8081，application.yml 里的默认值）
mvn -pl mall-course spring-boot:run

# 终端 3：再启动一个 mall-course 实例 B（端口覆盖成 8082，注册到 Nacos 时服务名还是 mall-course）
mvn -pl mall-course spring-boot:run -Dspring-boot.run.arguments="--server.port=8082"
```

> 两个 `mall-course` 实例用**同一个服务名**注册到 Nacos，所以 `@FeignClient(name = "mall-course")` 会拿到「两个地址」的实例列表，负载均衡在它们之间轮询。

**验证 1：声明式调用** —— 访问聚合接口：

```bash
curl http://localhost:8080/api/user/course/1
```

预期返回（`course.port` 是提供方实例端口）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "user": "当前登录用户（mall-user 自己查）",
    "course": {
      "id": 1,
      "title": "Java 高并发实战",
      "price": 199.00,
      "teacherName": "张老师",
      "port": 8081
    }
  }
}
```

**验证 2：负载均衡** —— 连续多 curl 几次，观察 `course.port` 在 `8081` / `8082` 之间**轮流变化**：

```bash
for i in 1 2 3 4 5 6; do curl -s http://localhost:8080/api/user/course/1 | grep -o '"port": [0-9]*'; done
```

你会看到类似 `8081 → 8082 → 8081 → 8082 ...` 的输出，这就是 Spring Cloud LoadBalancer 默认的**轮询策略**在起作用。

> 顺带确认：`curl http://localhost:8081/api/course/list` 仍返回 3 门课——升级公共 VO 没破坏老接口。

::: tip 💡 面试题：OpenFeign 到底是怎么「只写服务名就能负载均衡」的？
**一句话**：`@FeignClient(name = "mall-course")` → OpenFeign 把 `name` 交给 **Spring Cloud LoadBalancer** → LoadBalancer 从 **Nacos 注册表**拿到 `mall-course` 的所有实例地址 → 按轮询策略挑一个 → 拼出真实 URL 发请求。所以「服务发现（Nacos）+ 负载均衡（LoadBalancer）+ 声明式调用（OpenFeign）」三者缺一不可。详见 [Nacos](/learn_backend/java/微服务/Nacos)。
:::

### 步骤 7：验证「超时」+「重试」

**7.1 先看超时**。`slow` 接口 sleep 5 秒，而我们 `readTimeout=2000`（2 秒）：

```bash
curl http://localhost:8080/api/user/course/slow
```

2 秒后请求失败，`mall-user` 日志里出现 `Read timed out`（`SocketTimeoutException`），接口返回：

```json
{ "code": 500, "message": "系统繁忙，请稍后再试" }
```

> 返回统一 JSON 而不是白页/堆栈，是因为 Day 1 的 `GlobalExceptionHandler` 兜住了——Feign 抛的超时异常被 `@ExceptionHandler(Exception.class)` 捕获，统一转成 `Result`。这正是 Day 1 基建的价值。

**7.2 再看重试**。Feign **默认不重试**（`Retryer.NEVER_RETRY`），需要手动开启。新建 `E:\course-mall\mall-user\src\main\java\com\mall\user\config\FeignRetryConfig.java`：

```java
package com.mall.user.config;

import feign.Retryer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// 这个配置类在 com.mall.user.config 下，会被主容器扫描到；
// 定义成全局 Bean 后，对所有 @FeignClient 生效（除非某个客户端单独指定了自己的 Retryer）
@Configuration
public class FeignRetryConfig {

    // Feign 默认 Retryer.NEVER_RETRY（一次都不重试）。
    // 这里换成 Retryer.Default：
    //   period=100ms    第一次重试前的等待
    //   maxPeriod=1000ms 重试等待的最大值（会逐渐翻倍，直到这个上限）
    //   maxAttempts=3    最多尝试 3 次（含第一次，也就是最多重试 2 次）
    @Bean
    public Retryer retryer() {
        return new Retryer.Default(100, 1000, 3);
    }
}
```

重启 `mall-user`，再 curl 一次慢接口，然后去看 `mall-course` 的控制台日志——`/slow` 被请求了 **3 次**（超时 → 重试 → 再超时 → 再重试 → 3 次后放弃，抛异常）。

**为什么超时会触发重试？** 因为超时抛出的 `SocketTimeoutException` 被 Feign 包装成 `RetryableException`（「可重试异常」），`Retryer` 看到它就按策略重试。3 次都失败后，最终异常同样被全局异常处理器兜成 500。

::: tip 💡 面试题：Feign 的重试会不会重试 HTTP 500？为什么？
**一句话**：**不会**。Feign 的 `Retryer` 只重试**网络/IO 类异常**（连接失败、读超时，被包装成 `RetryableException`），**HTTP 4xx/5xx 是「业务响应」不是「请求没发出去」**，默认不重试。要让 5xx 也重试，得自定义 `ErrorDecoder` 把某些响应码转成 `RetryableException`。详见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)。
:::

::: tip 💡 面试题：重试为什么一定要考虑「幂等」？
**一句话**：重试 = 「同一个请求可能被执行多次」。GET/查询天然幂等（多查一次没副作用），但**下单、扣款、扣库存这类写操作不幂等**——重试一次就可能重复扣钱、重复扣库存。所以写接口要么保证幂等（唯一索引、幂等键），要么别开自动重试。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| OpenFeign 声明式调用、JDK 动态代理、超时/重试 | [OpenFeign](/learn_backend/java/微服务/OpenFeign) |
| 负载均衡（Spring Cloud LoadBalancer） | [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) |
| 服务发现（Nacos 注册表） | [Nacos](/learn_backend/java/微服务/Nacos) |
| 全局异常兜底（`@RestControllerAdvice`） | [Spring](/learn_backend/java/基础/Spring) |
| `@FeignClient`、`@EnableFeignClients` 自动装配 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| 幂等与重试、限流熔断关系 | [分布式基础](/learn_backend/java/微服务/分布式基础)、[Sentinel](/learn_backend/java/微服务/Sentinel) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-user` 启动成功，`@EnableFeignClients` 生效，无「No qualifying bean of type CourseClient」报错：是 / 否
- [ ] `curl /api/user/course/1` 返回了课程信息（含 `port`）：是 / 否
- [ ] 起两个 `mall-course` 实例后，连续 curl 能看到 `port` 在 8081/8082 轮询：是 / 否
- [ ] `curl /api/user/course/slow` 约 2 秒后超时，返回 500 且日志有 `Read timed out`：是 / 否
- [ ] 配了 `Retryer` 后，`mall-course` 日志显示 `/slow` 被请求了 3 次：是 / 否
- [ ] `mall-course` 的 `/api/course/list` 仍正常返回 3 门课（升级公共 VO 没破坏老接口）：是 / 否
- [ ] 踩坑记录（Feign Bean 扫不到、超时不生效、实例没注册上等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. OpenFeign 底层是怎么把「接口方法」变成「真实 HTTP 请求」的？（提示：JDK 动态代理 + MVC 注解）
2. 我只写了 `@FeignClient(name = "mall-course")`，没写 IP 和端口，它凭什么能调到正确的服务？服务发现和负载均衡各自干了什么？
3. `connectTimeout` 和 `readTimeout` 有什么区别？哪个才是「下游慢接口」会触发的那种超时？为什么线上不能留默认的 60 秒？
4. Feign 的重试会不会重试 HTTP 500？为什么？如果要让 5xx 也重试，要怎么做？
5. 重试和「幂等」有什么关系？为什么下单、扣库存这类接口不能随便开重试？
