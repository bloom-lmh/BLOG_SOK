# Day 18 · 治理收尾（跨域 + 全局异常 + 统一日志 + 链路追踪）

> **今天目标**：给 Day 13~17 拆出来的微服务做一次「治理收尾」——统一跨域（CORS）、补全局异常（网关 WebFlux + Feign 透传）、统一日志格式、打通链路追踪，让一次请求从网关到用户服务的调用链「看得见、串得起来、报错找得到」。

## 一、前置条件

- 已完成 **Day 13~17**：Nacos 注册、Nacos Config、OpenFeign、Gateway 网关、Sentinel 熔断限流
- `mall-gateway`（Day 16）、`mall-user`（Day 13/14）已能跑通，网关能路由到 `lb://mall-user`
- Nacos Server 已启动（`localhost:8848`）
- 复用 Day 01 的 `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`（在 `mall-common`）

> ⚠️ 本天不建新表、不建新业务模块，所有改动都是「给已有服务加横切治理能力」。核心改动集中在 `mall-gateway`（跨域 + WebFlux 异常 + 日志），`mall-common`（升级全局异常 + Feign 解码器），各服务加链路追踪依赖。

## 二、今天完成后你会得到什么

1. 前端跨域请求不再报 `CORS` 错误（网关统一处理，预检 OPTIONS 也放行）
2. 网关路由/过滤器抛异常时，返回统一 `Result` JSON，而不是默认白页/堆栈
3. Feign 调用下游出错，调用方能拿到下游真实的 `code` / `message`
4. 所有服务日志统一格式：`[应用名,traceId,spanId]`
5. 一次请求从 `gateway → mall-user`，两边日志的 `traceId` 一致，能串起来定位

## 三、先搞懂：微服务的「治理」和单体差在哪

单体时代一个应用，改配置、打日志、抓异常都在一个进程里，肉眼就能追。拆成微服务后，一次请求要跨多个进程：

| 治理项 | 单体 | 微服务（拆了之后的痛点） | 今天的解法 |
|---|---|---|---|
| 跨域 CORS | 前端和后端同域，或一个服务里配 | 多个服务各配各的，漏配、不一致 | **网关统一配** |
| 全局异常 | 一个 `@RestControllerAdvice` 全搞定 | 网关是 WebFlux，老处理器失效；Feign 调用还丢错误信息 | **网关 `ErrorWebExceptionHandler` + Feign `ErrorDecoder`** |
| 统一日志 | 一份 logback 全服务通用 | 各服务日志格式五花八门，串不起来 | **统一 logback 格式 + MDC 塞 traceId** |
| 链路追踪 | 不需要，一个进程 | 报错不知道是哪个服务、哪一跳挂了 | **Micrometer Tracing / SkyWalking** |

一句话概括：**治理就是把这些「横切」能力抽出来统一做，避免每个服务各写一套、还写不一致。**

## 四、步骤

### 步骤 1：跨域 CORS —— 在网关统一配

**先搞懂 CORS 是什么**：浏览器有「同源策略」——协议、域名、端口三者完全一致才叫同源，否则浏览器会拦截请求结果。前端跑在 `http://localhost:3000`，后端在 `http://localhost:9000`，跨域了，浏览器直接报 `blocked by CORS policy`。

注意一个关键点：**CORS 是「浏览器」的拦截，不是「服务器」的拒绝**。服务器照常返回了数据，只是浏览器不把结果给前端 JS。所以解决 CORS 的姿势是：让服务器在响应头里声明「我允许哪些来源访问」，浏览器看到这些头就放行。

在 `mall-gateway/src/main/resources/application.yml` 的 `spring.cloud.gateway` 下**新增**：

```yaml
spring:
  cloud:
    gateway:
      globalcors:
        cors-configurations:
          '[/**]':                          # 对所有路由生效
            allowed-origin-patterns: "*"    # 允许的来源（为什么用 patterns 见下面面试题）
            allowed-methods: "*"            # 允许的 HTTP 方法
            allowed-headers: "*"            # 允许的请求头
            allow-credentials: true         # 允许携带 Cookie
            max-age: 3600                   # 预检结果缓存 1 小时
```

> 为什么在**网关**配、不在每个服务配？因为前端只访问网关（Day 16 的统一入口），网关是所有请求的必经之路。在这配一次，下游所有服务都不用再管 CORS，也不会出现「user 服务配了、course 服务漏配」的不一致。

::: tip 💡 面试题：为什么用 `allowed-origin-patterns` 而不是 `allowed-origins`？
**一句话**：CORS 规范规定，当 `allow-credentials=true` 时，`Access-Control-Allow-Origin` **不能是 `*`**（浏览器会直接拒绝）。`allowedOriginPatterns` 是 Spring 的解法——它配置里写 `*`，但实际响应时**回显请求方的具体 origin**（如 `http://localhost:3000`），既满足规范、又支持任意来源。详见 [Gateway](/learn_backend/java/微服务/Gateway)。
:::

::: tip 💡 面试题：什么是「预检请求（Preflight）」？为什么会有一次 OPTIONS？
**一句话**：浏览器在发「非简单请求」（如带自定义头、`Content-Type: application/json`、PUT/DELETE）之前，会先发一个 `OPTIONS` 请求问服务器「你允不允许我这个来源、这个方法、这个头」。服务器回了 CORS 头，浏览器才发真正的请求。这就是很多后端日志里看到一次 OPTIONS 一次真实请求的原因。详见 [Gateway](/learn_backend/java/微服务/Gateway)。
:::

### 步骤 2：全局异常 —— 网关（WebFlux）不能用 `@RestControllerAdvice`

Day 01 的 `GlobalExceptionHandler` 用的是 `@RestControllerAdvice`，它依赖 Spring MVC 的 `DispatcherServlet`。**但网关是 WebFlux（响应式）**，根本没有 `DispatcherServlet`——网关的请求走的是 `RoutePredicateHandlerMapping` + 一堆过滤器，路由转发、鉴权过滤器抛的异常，**不会**进 `@RestControllerAdvice`，而是落到 WebFlux 的 `ErrorWebExceptionHandler`。所以网关要单独写一个异常处理器。

新建 `E:\course-mall\mall-gateway\src\main\java\com\mall\gateway\config\GatewayExceptionHandler.java`：

```java
package com.mall.gateway.config;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.result.Result;
import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;

@Component
// @Order(-2)：Spring Boot 默认的 DefaultErrorWebExceptionHandler 自己就是 @Order(-1)，
// 你必须写比它更小（更靠前）的 -2 才能压过它，否则异常还是走默认处理，返回 HTML 白页
@Order(-2)
public class GatewayExceptionHandler implements ErrorWebExceptionHandler {

    private final ObjectMapper objectMapper;

    public GatewayExceptionHandler(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        ServerHttpResponse response = exchange.getResponse();
        // 网关兜底：下游服务挂了、路由不存在等，统一返回 JSON，不让前端看到默认错误页
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        Result<Void> result = Result.fail(500, "网关异常: " + ex.getMessage());

        byte[] bytes;
        try {
            bytes = objectMapper.writeValueAsBytes(result);
        } catch (JsonProcessingException e) {
            // 极端情况：序列化都失败，就返回一段写死的 JSON
            bytes = "{\"code\":500,\"message\":\"网关异常\"}".getBytes(StandardCharsets.UTF_8);
        }
        DataBuffer buffer = response.bufferFactory().wrap(bytes);
        return response.writeWith(Mono.just(buffer));
    }
}
```

> 网关要能 `import com.mall.common.result.Result`，说明 `mall-gateway` 的 `pom.xml` 里已经依赖了 `mall-common`（Day 16 建网关时应该加了）。

::: tip 💡 面试题：为什么网关不能用 `@RestControllerAdvice` 处理异常？
**一句话**：`@RestControllerAdvice` 是 Spring MVC 的机制，靠 `DispatcherServlet` 分发；网关是 WebFlux 响应式技术栈，没有 `DispatcherServlet`，路由和过滤器抛的异常走的是 `ErrorWebExceptionHandler`（WebFlux 的异常出口）。所以网关必须实现 `ErrorWebExceptionHandler`，并且注意——**Spring Boot 默认的 `DefaultErrorWebExceptionHandler` 本身就标了 `@Order(-1)`**，你写的处理器要用更小的 `@Order(-2)` 才能压过它（写 -1 就平级了，谁先执行不定）。详见 [Gateway](/learn_backend/java/微服务/Gateway)。
:::

### 步骤 3：全局异常 —— Feign 调用异常怎么「透传」

Day 15 用 OpenFeign 做服务间调用。这里有个**隐蔽的坑**：下游服务报错时，调用方拿不到下游的真实错误信息。

原因分两层：

1. **Feign 默认行为**：下游返回**非 2xx** 时，Feign 会抛 `FeignException`，把响应体丢掉，只留一个状态码。调用方日志里只剩 `FeignException: [404] during GET...`，根本不知道下游到底为什么报错。
2. **我们 Day 01 的全局异常返回的是 HTTP 200**（`Result.fail` 不带状态码），Feign 看到 200 就当成功，错误码藏在 body 的 `code` 字段里，调用方若不去检查就「假装成功」了。

所以要分两步治：

**① 升级 `mall-common` 的 `GlobalExceptionHandler`，让它返回真实 HTTP 状态码**

改 `E:\course-mall\mall-common\src\main\java\com\mall\common\exception\GlobalExceptionHandler.java`：

```java
package com.mall.common.exception;

import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 业务异常：把 BizException 的 code 映射成真实 HTTP 状态码
    @ExceptionHandler(BizException.class)
    public ResponseEntity<Result<Void>> handleBiz(BizException e) {
        log.warn("业务异常: code={}, msg={}", e.getCode(), e.getMessage());
        // HttpStatus.resolve(401) → UNAUTHORIZED，resolve(404) → NOT_FOUND……
        // 非标准 code（如 50001 库存不足）返回 null，兜底 500
        HttpStatus status = HttpStatus.resolve(e.getCode());
        if (status == null) {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
        }
        return ResponseEntity.status(status).body(Result.fail(e.getCode(), e.getMessage()));
    }

    // 系统异常：统一 500
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Result<Void>> handleOther(Exception e) {
        log.error("系统异常", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Result.fail(ErrorCode.SYSTEM_ERROR.getCode(), ErrorCode.SYSTEM_ERROR.getMessage()));
    }
}
```

> 为什么这个改动很重要？之前「统一 200 + code」是单体的省事做法；但微服务里 Feign 靠 HTTP 状态码判断调用成败，所以**必须让异常返回真实状态码**，Feign 才能识别「这次调用失败了」。

**② 加 Feign `ErrorDecoder`，把下游的 `Result` 解析回 `BizException`**

`ErrorDecoder` 要放 `mall-common` 让所有用 Feign 的服务复用，但 `mall-common` 目前只有 `spring-web` + `lombok`（Day 01 建的），得先给它补三个依赖。打开 `E:\course-mall\mall-common\pom.xml`，在 `<dependencies>` 里**新增**：

```xml
<!-- spring-context：@Configuration / @Bean 注解所在包（spring-web 不传递引入它） -->
<dependency>
    <groupId>org.springframework</groupId>
    <artifactId>spring-context</artifactId>
</dependency>
<!-- feign-core：ErrorDecoder 接口。版本由 Day13 引入的 Spring Cloud BOM 统一管理，不写版本号 -->
<dependency>
    <groupId>io.github.openfeign</groupId>
    <artifactId>feign-core</artifactId>
</dependency>
<!-- jackson-databind：ObjectMapper 把下游的 JSON 响应体反序列化成 Result -->
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
</dependency>
```

> 为什么引轻量的 `feign-core` 而不是整个 `spring-cloud-starter-openfeign`？公共模块只用 `ErrorDecoder` 这个接口，`feign-core` 就够；而且 `mall-gateway` 也依赖 `mall-common`，别把 Feign 全家桶塞进网关。

然后新建 `E:\course-mall\mall-common\src\main\java\com\mall\common\feign\FeignErrorConfig.java`（放 `mall-common`，所有用 Feign 的服务都能复用）：

```java
package com.mall.common.feign;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.Result;
import feign.Response;
import feign.Util;
import feign.codec.ErrorDecoder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.nio.charset.StandardCharsets;

@Configuration
public class FeignErrorConfig {

    // Feign 默认对非 2xx 只抛 FeignException（丢信息）；这里自定义 ErrorDecoder，
    // 把下游返回的统一 Result 解析成 BizException，交给本服务的 GlobalExceptionHandler 兜底
    @Bean
    public ErrorDecoder errorDecoder(ObjectMapper objectMapper) {
        return (methodKey, response) -> {
            try {
                // Feign 的响应体只能读一次，读完就没了，所以在这里读完并解析
                String body = Util.toString(response.body().asReader(StandardCharsets.UTF_8));
                Result<?> result = objectMapper.readValue(body, Result.class);
                return new BizException(result.getCode(), result.getMessage());
            } catch (Exception e) {
                // 下游返回的不是统一 Result（比如直接 502 网关超时），按 HTTP 状态兜底
                return new BizException(response.status(), "远程调用失败: " + response.reason());
            }
        };
    }
}
```

::: tip 💡 面试题：Feign 调用下游报错，调用方为什么拿不到下游的 `message`？`ErrorDecoder` 怎么解决？
**一句话**：Feign 默认把非 2xx 响应包装成 `FeignException`，只保留状态码、**丢弃响应体**，所以下游精心写的错误信息全没了。自定义 `ErrorDecoder` 就是在 Feign 抛异常前，**手动读出响应体、解析回 `Result` 里的 code/message**，再转成 `BizException` 抛出去，让调用方自己的 `GlobalExceptionHandler` 统一兜底。详见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)。
:::

::: tip 💡 面试题：`@Configuration` 里的这个 `ErrorDecoder` Bean，为什么会影响**所有** Feign 客户端？
**一句话**：OpenFeign 给每个 `@FeignClient` 建一个子上下文，但子上下文继承主上下文的 Bean；默认配置里 `ErrorDecoder` 用了 `@ConditionalOnMissingBean`，发现主上下文已有你的 Bean 就不再新建，于是你的解码器变成全局默认。这也就是那个经典坑——**自定义 Feign 配置类如果放在 `@ComponentScan` 能扫到的包下，会「意外」全局生效**。详见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)。
:::

### 步骤 4：统一日志 —— logback + MDC

微服务排查问题的第一步，是让每个服务的日志**格式一致、能看出是哪个服务、哪一次请求**。这里引入一个关键概念 **MDC（Mapped Diagnostic Context）**：它给「当前线程」绑定一个键值上下文（底层就是 `ThreadLocal`），logback 用 `%X{key}` 就能把这个值打进日志。

新建 `E:\course-mall\mall-gateway\src\main\resources\logback-spring.xml`（**每个服务都复制同一份**，内容完全一样，因为格式要统一）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- 从 Spring Environment 读应用名，作为日志里的服务标识 -->
    <springProperty scope="context" name="appName" source="spring.application.name" defaultValue="app"/>

    <property name="LOG_HOME" value="./logs"/>
    <!-- 统一格式：时间 级别 [应用名,traceId,spanId] 线程 类 - 消息
         %X{traceId:-}：从 MDC 取 traceId，取不到就打印一个横杠 -->
    <property name="LOG_PATTERN"
              value="%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [${appName},%X{traceId:-},%X{spanId:-}] [%thread] %logger{40} - %msg%n"/>

    <!-- 控制台输出 -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>${LOG_PATTERN}</pattern>
            <charset>UTF-8</charset>
        </encoder>
    </appender>

    <!-- 滚动文件：按天 + 按大小切，保留 30 天 -->
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_HOME}/${appName}.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>${LOG_HOME}/${appName}.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
            <maxFileSize>50MB</maxFileSize>
            <maxHistory>30</maxHistory>
        </rollingPolicy>
        <encoder>
            <pattern>${LOG_PATTERN}</pattern>
            <charset>UTF-8</charset>
        </encoder>
    </appender>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="FILE"/>
    </root>
</configuration>
```

此时启动服务，日志会变成 `2026-08-19 22:10:01.123 INFO [mall-gateway,-,-] [reactor-http-...] ...`——`traceId` 和 `spanId` 位置是 `-`，因为还没引入链路追踪。下一步就把它填上。

::: tip 💡 面试题：MDC 是什么？为什么它能在一行日志里打出 `traceId`？
**一句话**：MDC 是日志框架提供的「当前线程的键值上下文」，底层是 `ThreadLocal`——每个线程一份，互不干扰。logback 的 `%X{traceId}` 就是从当前线程的 MDC 里取 `traceId` 这个 key。链路追踪框架会在每个请求进入时把 traceId 塞进 MDC，请求结束再清掉，所以同一请求的所有日志都带同一个 traceId。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

### 步骤 5：链路追踪 —— Spring Boot 3 用不了 Sleuth，改用 Micrometer Tracing

**先说一个大坑（也是高频面试点）**：`Spring Cloud Sleuth` 在 Spring Boot 2.x 是标配，但到了 **Spring Boot 3.x，Sleuth 已经停止维护并归档**——因为官方把它的核心功能合并进了 Micrometer 的 Tracing API（基于 Observation）。所以本工程（Boot 3.2.5）**不能**引入 `spring-cloud-starter-sleuth`，要用它的继任者：

- 实现桥接二选一：`micrometer-tracing-bridge-brave`（Brave 实现，Sleuth 的直系后代）或 `micrometer-tracing-bridge-otel`（OpenTelemetry 实现）。

给**每个服务**（`mall-gateway`、`mall-user` 等）的 `pom.xml` **新增**依赖：

```xml
<!-- 链路追踪（Spring Boot 3 的 Sleuth 替代）：Micrometer Tracing + Brave 桥接
     版本由 Spring Boot 父工程统一管理，不写版本号 -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>
```

就这一个依赖，Boot 会自动装配：每个请求生成 `traceId`/`spanId`、塞进 MDC、并通过 HTTP 头（W3C `traceparent`）自动跨服务传递。**不需要改任何业务代码**。

启动 `mall-user`（8080）和 `mall-gateway`（9000），发一个请求：

```bash
# 注意必须用 /api/health：它是 Day16 网关鉴权白名单里的路径，
# 不带 token 也能一路转发到 mall-user。换个非白名单路径（如 /api/user/1）
# 会被 AuthGlobalFilter 以 401 拦在网关，mall-user 根本收不到请求，traceId 就串不起来了
curl http://localhost:9000/api/health
```

观察两个服务的控制台，会看到**相同的 traceId**：

```
# mall-gateway 日志
2026-08-19 22:15:03.456 INFO [mall-gateway,64f2a1c3b8d9e7f1,64f2a1c3b8d9e7f1] [reactor-http-epoll-2] ... 路由到 mall-user

# mall-user 日志（traceId 一致，spanId 不同）
2026-08-19 22:15:03.460 INFO [mall-user,64f2a1c3b8d9e7f1,1a2b3c4d5e6f7081] [http-nio-8080-exec-1] c.m.user.controller.HealthController - health 检查
```

两边 `traceId` 都是 `64f2a1c3b8d9e7f1`，说明这是同一次调用链。排查线上问题时，拿这一个 id 去各服务的日志里 `grep`，整条链就串起来了。

::: tip 💡 面试题：Spring Boot 3 为什么用不了 Sleuth？
**一句话**：Spring Cloud Sleuth 在 2022 年宣布进入维护模式并归档，核心功能被并入 Micrometer 官方的 Tracing API（基于 Observation）。Boot 3 用 `micrometer-tracing-bridge-brave`（Brave 实现）或 `-otel`（OpenTelemetry 实现）替代，API 和用法基本延续 Sleuth 的思路。详见 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)。
:::

::: tip 💡 面试题：traceId 是怎么「跨服务、跨线程」传递的？
**一句话**：**跨服务**靠 HTTP 头（默认 W3C `traceparent: 00-<traceId>-<spanId>-01`）——上游在出站请求里带上，下游在入站时读出同一个 traceId，生成自己的 spanId；**跨线程**靠 MDC/Scope，线程池提交任务时把当前 traceId 复制过去（所以用线程池时要注意用「可传播上下文」的包装器，否则子线程会丢 traceId）。详见 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)。
:::

### 步骤 6：SkyWalking —— 生产级 APM（java agent，无侵入）

Micrometer Tracing 只解决「日志里能串 traceId」。要**看调用拓扑、每跳耗时、服务健康指标**，需要 APM（应用性能监控）工具，最主流的是 **SkyWalking**。

它和 Sleuth/追踪库最大的不同：**SkyWalking 是「java agent」方式**——不改代码、不加依赖，启动时加个 JVM 参数，通过字节码增强自动埋点。

```bash
# 1. 启动 SkyWalking 后端（OAP）+ UI（Docker，Day 27 细讲，今天先知道有这东西）
docker run -p 11800:11800 -p 12800:12800 apache/skywalking-oap-server:9.7.0
# UI 容器内的端口是 8080，映射到宿主机的 8090——宿主机 8080 已被 mall-user 占用，直接映射会冲突
docker run -p 8090:8080 apache/skywalking-ui:9.7.0

# 2. 服务启动时挂 agent（agent 从官网下载，无需改 pom.xml）
java -javaagent:/path/to/skywalking-agent.jar \
     -DSW_AGENT_NAME=mall-user \
     -DSW_AGENT_COLLECTOR_BACKEND_SERVICES=localhost:11800 \
     -jar mall-user.jar
```

然后浏览器打开 `http://localhost:8090`（SkyWalking UI），就能看到服务拓扑、调用链、每跳耗时和错误率。

> OAP 容器默认用 H2 内存存储，容器重启数据就没了——今天演示够用；生产要接 Elasticsearch/MySQL 存储（Day 27 Docker 编排时展开）。

| 对比项 | Micrometer Tracing（Sleuth 继任） | SkyWalking |
|---|---|---|
| 侵入方式 | 加依赖 + 日志里看 traceId | java agent，零代码 |
| 可视化 | 靠日志手动 grep / 上 Zipkin | 自带 UI：拓扑、Trace、指标 |
| 定位 | 轻量、日志可读性好 | 重量级 APM、指标全 |
| 适用 | 快速排查「这一单请求串不串得起来」 | 生产级监控、定位慢调用 |

::: tip 💡 面试题：Sleuth 和 SkyWalking 有什么区别？什么场景选谁？
**一句话**：Sleuth（现 Micrometer Tracing）是**轻量埋点库**，解决「日志带 traceId、能串调用链」，几乎无成本；SkyWalking 是**完整 APM 平台**，用字节码增强采集拓扑、耗时、指标，有 UI 可视化。轻量排查用前者，生产监控定位用后者——很多公司两个都上。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| CORS 跨域、网关全局异常（WebFlux） | [Gateway](/learn_backend/java/微服务/Gateway) |
| Feign 调用、`ErrorDecoder` 错误透传 | [OpenFeign](/learn_backend/java/微服务/OpenFeign) |
| Sleuth / Micrometer Tracing / 链路追踪 | [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) |
| SkyWalking、APM 可观测性 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| MDC、logback 日志配置 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| 网关 `lb://` 从 Nacos 拉实例 | [Nacos](/learn_backend/java/微服务/Nacos) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 网关配置 CORS 后，跨域请求不再报错（含 OPTIONS 预检）：是 / 否
- [ ] 网关访问一个不存在的路由，返回统一 `Result` JSON（而不是默认错误页）：是 / 否
- [ ] 升级 `GlobalExceptionHandler` 后，`mall-user` 抛业务异常返回真实状态码（如 404）：是 / 否
- [ ] 加了 `logback-spring.xml` 后，日志格式统一带 `[应用名,traceId,spanId]`：是 / 否
- [ ] 加 `micrometer-tracing-bridge-brave` 后，一次请求 gateway 和 mall-user 日志 traceId 一致：是 / 否
- [ ] 踩坑记录（CORS 不生效、traceId 是 `-`、依赖找不到等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. CORS 是「浏览器拦截」还是「服务器拒绝」？预检 OPTIONS 请求是什么时候发、为了干什么？
2. 网关为什么不能用 `@RestControllerAdvice` 处理异常？`ErrorWebExceptionHandler` 和它有什么本质区别？为什么我们写的处理器要用 `@Order(-2)`、写 `-1` 会怎样？（提示：默认处理器本身就是 `@Order(-1)`）
3. Feign 调用下游报错，调用方为什么拿不到下游的真实 `message`？为什么我们的全局异常要先改成返回真实 HTTP 状态码，`ErrorDecoder` 才有意义？
4. MDC 底层是什么？`traceId` 从「同一个线程的变量」变成「跨服务、跨线程都能续传」，分别靠什么机制？
5. Spring Boot 3 为什么用不了 Sleuth？Micrometer Tracing + Brave 是什么关系？SkyWalking 和它俩有什么本质区别、什么场景选哪个？
