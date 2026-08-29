# Day 18 · 治理收尾（CORS + HTTP 语义 + 远程异常 + 链路追踪）

> **今天目标**：统一处理网关跨域、MVC/WebFlux 异常出口、Feign 远程错误和日志链路。从今天起，HTTP 状态码表达协议结果，`Result.code` 表达细分业务错误。

本日项目根目录统一为 `E:\CourseMall`。`mall-common` 中的 MVC/Feign 代码供所有
Servlet 业务服务复用；WebFlux 异常处理只放在 `mall-gateway`。

## 一、微服务为什么不应“所有响应都 HTTP 200”

```text
HTTP 401 + Result.code=401103  -> Token 无效
HTTP 403 + Result.code=403201  -> 未购买课程
HTTP 409 + Result.code=409503  -> 秒杀已售罄
HTTP 503 + Result.code=503601  -> 搜索服务不可用
```

HTTP 状态码供网关、Feign、监控和运维系统判断成功/失败；六位业务码供应用程序精确处理。两者不冲突。

Day03 的 `ErrorCode#getHttpStatus()` 已按约定将 `409503 -> 409`：

```java
public int getHttpStatus() {
    return code >= 100000 ? code / 1000 : code;
}
```

## 二、MVC 业务服务返回真实 HTTP 状态

把
`E:\CourseMall\mall-common\src\main\java\com\mall\common\web\advice\GlobalExceptionHandler.java`
替换为下面的完整内容：

```java
package com.mall.common.web.advice;

import com.mall.common.exception.BizException;
import com.mall.common.remote.RemoteCallException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

/** MVC 服务统一异常出口。 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

@ExceptionHandler(BizException.class)
public ResponseEntity<Result<Void>> handleBiz(BizException e) {
    ErrorCode errorCode = e.getErrorCode();
    log.warn("业务异常: code={}, key={}",
            errorCode.getCode(), errorCode.getMessageKey());
    return ResponseEntity
            .status(errorCode.getHttpStatus())
            .body(Result.fail(errorCode, e.getMessageArgs()));
}

@ExceptionHandler(MethodArgumentNotValidException.class)
public ResponseEntity<Result<Void>> handleValid(MethodArgumentNotValidException e) {
    String messageKey = e.getBindingResult().getFieldErrors().stream()
            .findFirst()
            .map(DefaultMessageSourceResolvable::getDefaultMessage)
            .orElse(ErrorCode.PARAM_ERROR.getMessageKey());
    return ResponseEntity.badRequest()
            .body(Result.fail(ErrorCode.PARAM_ERROR.getCode(), messageKey));
}

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Result<Void>> handleConstraintViolation(
            ConstraintViolationException e) {
        String message = e.getConstraintViolations().stream()
                .findFirst()
                .map(ConstraintViolation::getMessage)
                .orElse(ErrorCode.PARAM_ERROR.getMessageKey());
        return ResponseEntity.badRequest()
                .body(Result.fail(ErrorCode.PARAM_ERROR.getCode(), message));
    }

    @ExceptionHandler(BindException.class)
    public ResponseEntity<Result<Void>> handleBind(BindException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .map(DefaultMessageSourceResolvable::getDefaultMessage)
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest()
                .body(Result.fail(ErrorCode.PARAM_ERROR.getCode(), message));
    }

    @ExceptionHandler({
            HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class
    })
    public ResponseEntity<Result<Void>> handleInvalidRequest(Exception e) {
        log.warn("请求格式错误: {}", e.getMessage());
        return ResponseEntity.badRequest()
                .body(Result.fail(ErrorCode.INVALID_REQUEST));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Result<Void>> handleNotFound(NoResourceFoundException e) {
        log.debug("请求资源不存在: {}", e.getResourcePath());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Result.fail(ErrorCode.NOT_FOUND));
    }

    @ExceptionHandler(RemoteCallException.class)
    public ResponseEntity<Result<Void>> handleRemote(RemoteCallException e) {
        log.warn("远程调用失败: status={}, code={}",
                e.getHttpStatus(), e.getBusinessCode());
        return ResponseEntity.status(e.getHttpStatus())
                .body(Result.fail(e.getBusinessCode(), e.getMessage()));
    }

@ExceptionHandler(Exception.class)
public ResponseEntity<Result<Void>> handleOther(Exception e) {
    log.error("系统异常", e);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(Result.fail(ErrorCode.SYSTEM_ERROR));
}
}
```

`ResultMessageAdvice` 仍在写出响应前根据 Locale 把 message key 转为最终文本，`ResponseEntity` 只是额外指定 HTTP status。约束校验、JSON 解析、不存在、冲突、限流等处理方法也要分别返回 400/404/409/429，不再统一 200。

## 三、Feign 远程错误保留业务码

Feign 对非 2xx 响应默认抛 `FeignException`。它并非一定“丢掉响应体”，异常对象可保留内容；但业务层得到的仍是通用 Feign 异常，所以需要 `ErrorDecoder` 把统一 JSON 转为结构化远程异常。

新建
`E:\CourseMall\mall-common\src\main\java\com\mall\common\remote\RemoteCallException.java`：

```java
package com.mall.common.remote;

public class RemoteCallException extends RuntimeException {
    private final int httpStatus;
    private final int businessCode;

    public RemoteCallException(int httpStatus, int businessCode, String message) {
        super(message);
        this.httpStatus = httpStatus;
        this.businessCode = businessCode;
    }

    public int getHttpStatus() { return httpStatus; }
    public int getBusinessCode() { return businessCode; }
}
```

新建
`E:\CourseMall\mall-common\src\main\java\com\mall\common\remote\ResultErrorDecoder.java`：

```java
package com.mall.common.remote;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.result.Result;
import feign.Response;
import feign.codec.ErrorDecoder;

import java.io.InputStream;

public class ResultErrorDecoder implements ErrorDecoder {
    private final ObjectMapper objectMapper;
    private final ErrorDecoder fallback = new ErrorDecoder.Default();

    public ResultErrorDecoder(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public Exception decode(String methodKey, Response response) {
        if (response.body() == null) {
            return fallback.decode(methodKey, response);
        }
        try (InputStream input = response.body().asInputStream()) {
            Result<?> result = objectMapper.readValue(input, Result.class);
            if (result.getCode() == null) {
                return fallback.decode(methodKey, response);
            }
            return new RemoteCallException(
                    response.status(), result.getCode(), result.getMessage());
        } catch (Exception e) {
            return fallback.decode(methodKey, response);
        }
    }
}
```

新建
`E:\CourseMall\mall-common\src\main\java\com\mall\common\remote\FeignErrorConfig.java`：

```java
package com.mall.common.remote;

import com.fasterxml.jackson.databind.ObjectMapper;
import feign.codec.ErrorDecoder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Feign 远程错误解码配置。 */
@Configuration
public class FeignErrorConfig {
    @Bean
    public ErrorDecoder errorDecoder(ObjectMapper objectMapper) {
        return new ResultErrorDecoder(objectMapper);
    }
}
```

调用方对 `RemoteCallException` 的处理已经包含在本节完整
`GlobalExceptionHandler` 中，会同时保留 HTTP status 和 business code。

调用链要同时透传 `Authorization`、`Accept-Language` 和追踪上下文。Day15 已传 Authorization，现在给拦截器再加 `Accept-Language`，下游返回的 message 就与用户语言一致。

## 四、在网关统一 CORS

把下面配置加入
`E:\CourseMall\mall-gateway\src\main\resources\application.yml`：

```yaml
spring:
  cloud:
    gateway:
      globalcors:
        add-to-simple-url-handler-mapping: true
        cors-configurations:
          '[/**]':
            allowedOrigins:
              - ${WEB_ORIGIN:http://localhost:5173}
            allowedMethods: [GET, POST, PUT, DELETE, OPTIONS]
            allowedHeaders: ['*']
            exposedHeaders: [Content-Disposition]
            allowCredentials: true
            maxAge: 3600
```

当 `allowCredentials=true` 时不能将任意来源 `*` 当作生产配置。开发/生产各自通过环境变量给出确切前端 Origin。下游服务不再重复配 CORS，且不暴露公网端口。

## 五、WebFlux 网关异常

MVC 服务的 `@RestControllerAdvice` 不会处理 Gateway 路由过滤器异常。网关需要实现 `ErrorWebExceptionHandler`，并使用比默认处理器更高的优先级：

新建
`E:\CourseMall\mall-gateway\src\main\java\com\mall\gateway\web\GatewayExceptionHandler.java`：

```java
package com.mall.gateway.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.web.reactive.error.ErrorWebExceptionHandler;
import org.springframework.context.MessageSource;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Locale;

/** Gateway 路由和 WebFlux 异常统一出口。 */
@Slf4j
@Component
@Order(-2)
@RequiredArgsConstructor
public class GatewayExceptionHandler implements ErrorWebExceptionHandler {
    private final ObjectMapper objectMapper;
    private final MessageSource messageSource;

    @Override
    public Mono<Void> handle(ServerWebExchange exchange, Throwable ex) {
        HttpStatus status = ex instanceof ResponseStatusException responseStatus
                ? HttpStatus.valueOf(responseStatus.getStatusCode().value())
                : HttpStatus.SERVICE_UNAVAILABLE;
        ErrorCode code = status == HttpStatus.NOT_FOUND
                ? ErrorCode.NOT_FOUND : ErrorCode.SERVICE_UNAVAILABLE;

        if (status.is5xxServerError()) {
            log.error("网关请求失败 path={}", exchange.getRequest().getURI().getPath(), ex);
        }
        exchange.getResponse().setStatusCode(status);
        exchange.getResponse().getHeaders().setContentType(MediaType.APPLICATION_JSON);
        try {
            List<Locale> locales = exchange.getRequest()
                    .getHeaders()
                    .getAcceptLanguageAsLocales();
            Locale locale = locales.isEmpty()
                    ? Locale.SIMPLIFIED_CHINESE : locales.get(0);
            String message = messageSource.getMessage(
                    code.getMessageKey(), null, locale);
            byte[] bytes = objectMapper.writeValueAsBytes(
                    Result.fail(code.getCode(), message));
            DataBuffer buffer = exchange.getResponse()
                    .bufferFactory()
                    .wrap(bytes);
            return exchange.getResponse().writeWith(Mono.just(buffer));
        } catch (Exception writeException) {
            log.error("网关异常响应写出失败", writeException);
            return exchange.getResponse().setComplete();
        }
    }
}
```

JWT 401/403 仍由 Day16 的安全过滤器精确返回；这个处理器主要兜底路由 404、下游不可用和网关未预期异常。

## 六、统一日志格式

每个可执行服务的 `src/main/resources/logback-spring.xml` 放置同一份配置，
例如 `E:\CourseMall\mall-order\src\main\resources\logback-spring.xml`：

```xml
<configuration>
    <springProperty name="APP_NAME"
                    source="spring.application.name"
                    defaultValue="app"/>
    <property name="PATTERN"
              value="%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [${APP_NAME},%X{traceId:-},%X{spanId:-}] [%thread] %logger{40} - %msg%n"/>

    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder><pattern>${PATTERN}</pattern><charset>UTF-8</charset></encoder>
    </appender>
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>logs/${APP_NAME}.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>logs/archive/${APP_NAME}.%d{yyyy-MM-dd}.%i.log.gz</fileNamePattern>
            <maxFileSize>100MB</maxFileSize>
            <maxHistory>30</maxHistory>
            <totalSizeCap>5GB</totalSizeCap>
        </rollingPolicy>
        <encoder><pattern>${PATTERN}</pattern><charset>UTF-8</charset></encoder>
    </appender>
    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="FILE"/>
    </root>
</configuration>
```

日志不记录密码、完整 Token、短信验证码、签名秘钥和支付敏感原文。业务异常记 `warn` 且通常不打堆栈；未知系统异常记 `error` 并打堆栈。

## 七、Spring Boot 3 链路追踪

Spring Cloud Sleuth 已归档，Boot 3 使用 Micrometer Tracing。每个网关/业务服务加：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>
<dependency>
    <groupId>io.github.openfeign</groupId>
    <artifactId>feign-micrometer</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

```yaml
management:
  tracing:
    sampling:
      probability: ${TRACING_SAMPLING_PROBABILITY:1.0} # dev 全量，生产按流量调低
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
```

WebClient/RestTemplate 要使用 Spring Boot 提供的 Builder 创建，Feign 需要 Micrometer capability；自己 `new` 客户端容易丢失自动观测和追踪头。线程池和异步任务也需显式传播 Observation/Context，不是只加一个 jar 就能保证所有自定义线程都不丢 traceId。

## 八、验收

1. 参数错误返回 HTTP 400 + 业务码 400，无权限返回 HTTP 403。
2. Feign 调用下游 404/409 时，上游保留 HTTP status 和业务 code。
3. `Origin` 在允许列表时 OPTIONS 预检成功，非法 Origin 没有 CORS 授权头。
4. 请求 `gateway -> order -> course` 时三个服务日志 traceId 一致，spanId 不同。
5. `/actuator/health` 可供探活，`env/beans/configprops` 等敏感端点未对外暴露。

## 九、✅ 完成后回填

- [ ] MVC 参数错误、业务冲突和未知异常返回正确 HTTP status
- [ ] Feign 非 2xx 响应保留远程业务码
- [ ] CORS 只允许配置的前端 Origin
- [ ] Gateway 404/503 返回统一 JSON 和 i18n 文案
- [ ] 日志文件包含 application name、traceId 和 spanId
- [ ] Actuator 只暴露 health、info、prometheus

## 十、知识点索引

| 知识点 | 文档 |
|---|---|
| Gateway CORS / WebFlux 异常 | [Gateway](/learn_backend/java/微服务/Gateway) |
| Feign ErrorDecoder | [OpenFeign](/learn_backend/java/微服务/OpenFeign) |
| Micrometer Tracing | [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) |
| Actuator | [Spring Boot](/learn_backend/java/基础/Spring Boot) |

## 十一、面试追问

1. HTTP status 和业务 code 为什么要同时保留？
2. `ErrorDecoder` 的作用是什么？FeignException 真的一定丢响应体吗？
3. 为什么 Gateway 不能直接复用 MVC `@RestControllerAdvice`？
4. `allowCredentials=true` 时为什么不应开任意 Origin？
5. traceId 如何跨 HTTP 传播？自定义线程为什么可能丢失？
