# Day 16 · 网关（Gateway 路由 + JWT 粗鉴权 + 纵深防御）

> **今天目标**：新增 `mall-gateway:9000` 作为客户端唯一入口，按业务路径转发到各服务，并在入口层校验 JWT。下游服务仍然独立验证 Token 并执行 `@PreAuthorize`，避免绕过网关后服务裸奔。

## 一、Gateway 的职责边界

| 网关做 | 业务服务做 |
|---|---|
| 路由、跨域、粗粒度鉴权、限流、记录请求 | JWT 再校验、`SecurityContext`、`@PreAuthorize`、数据所有权 |
| 拦截明显非法请求 | 决定“这个用户能否操作这条业务数据” |

`X-User-Id` 只能当作网关解析后的便利头，不能当作唯一安全依据，因为客户端也能伪造 HTTP Header。

## 二、新建 `mall-gateway`

父 pom 加入模块和依赖管理：

```xml
<module>mall-gateway</module>
```

`mall-gateway/pom.xml`：

```xml
<dependencies>
    <!-- 本课程锁定 Spring Cloud 2023.0.x / Gateway 4.1.x -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-gateway</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-loadbalancer</artifactId>
    </dependency>
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    </dependency>
    <dependency>
        <groupId>com.mall</groupId>
        <artifactId>mall-common</artifactId>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-api</artifactId>
        <version>${jjwt.version}</version>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-impl</artifactId>
        <version>${jjwt.version}</version>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-jackson</artifactId>
        <version>${jjwt.version}</version>
        <scope>runtime</scope>
    </dependency>
</dependencies>
```

不要引入 `spring-boot-starter-web`。Gateway 4.1 基于 WebFlux + Reactor Netty，不是 Servlet/Tomcat 应用。

```java
package com.mall.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class MallGatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallGatewayApplication.class, args);
    }
}
```

## 三、配置公网路由

```yaml
server:
  port: 9000

spring:
  application:
    name: mall-gateway
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_SERVER_ADDR:127.0.0.1:8848}
        namespace: ${NACOS_NAMESPACE:dev}
    gateway:
      routes:
        - id: mall-course
          uri: lb://mall-course
          predicates:
            - Path=/api/courses/**,/api/categories/**,/api/teachers/**,/api/files/**,/api/admin/courses/**,/upload/**
        - id: mall-order
          uri: lb://mall-order
          predicates:
            - Path=/api/orders/**
        - id: mall-stock
          uri: lb://mall-stock
          predicates:
            - Path=/api/admin/stocks/**
        - id: mall-payment
          uri: lb://mall-payment
          predicates:
            - Path=/api/payments/**,/api/payment/callbacks/**
        - id: mall-seckill
          uri: lb://mall-seckill
          predicates:
            - Path=/api/seckill/**
        - id: mall-search
          uri: lb://mall-search
          predicates:
            - Path=/api/search/**
        - id: mall-user
          uri: lb://mall-user
          predicates:
            - Path=/api/user/**,/api/captcha/**,/api/sentinel/**,/api/health

jwt:
  secret: ${COURSE_MALL_JWT_SECRET}
```

路由不再使用“`/api/**` 全部扔给 mall-user”这种兜底，否则新增业务路径时容易被错路由。`/internal/**` 故意没有公网路由，它只能由内部服务通过 Nacos + Feign 调用。

## 四、JWT 解析工具

```java
package com.mall.gateway.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

@Component
public class GatewayJwtVerifier {
    private final SecretKey key;

    public GatewayJwtVerifier(@Value("${jwt.secret}") String secret) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public Claims verify(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
```

网关和下游必须使用同一份外部密钥。更成熟的方案是非对称签名：认证服务持有私钥签发，网关和资源服务只持有公钥验签；Day39 学 OAuth2/OIDC 时会升级。

## 五、方法感知的白名单

白名单不能只看 path。例如 `GET /api/courses` 应公开，`POST /api/admin/courses` 必须认证。

```java
package com.mall.gateway.security;

import org.springframework.http.HttpMethod;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;

@Component
public class PublicRequestMatcher {
    public boolean matches(ServerHttpRequest request) {
        String path = request.getURI().getPath();
        HttpMethod method = request.getMethod();

        if (method == HttpMethod.POST) {
            return path.equals("/api/user/login")
                    || path.equals("/api/user/register")
                    || path.equals("/api/captcha/sms")
                    || path.startsWith("/api/payment/callbacks/");
        }
        if (method == HttpMethod.GET) {
            return path.equals("/api/health")
                    || path.equals("/api/captcha/image")
                    || path.equals("/api/courses")
                    || path.startsWith("/api/courses/")
                    || path.equals("/api/categories")
                    || path.startsWith("/api/categories/")
                    || path.equals("/api/teachers")
                    || path.startsWith("/api/teachers/")
                    || path.startsWith("/upload/");
        }
        return false;
    }
}
```

支付回调不带本系统 JWT，但必须由 Day12 的回调 Service 验签。“JWT 白名单”不等于“没有安全校验”。

## 六、全局鉴权过滤器

```java
package com.mall.gateway.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.MessageSource;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.*;
import org.springframework.http.server.reactive.*;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.cloud.gateway.filter.*;
import reactor.core.publisher.Mono;
import java.util.List;
import java.util.Locale;

@Component
@RequiredArgsConstructor
public class AuthGlobalFilter implements GlobalFilter, Ordered {
    private final GatewayJwtVerifier jwtVerifier;
    private final PublicRequestMatcher publicMatcher;
    private final ObjectMapper objectMapper;
    private final MessageSource messageSource;

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String authorization = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);

        if (!StringUtils.hasText(authorization)) {
            return publicMatcher.matches(request)
                    ? chain.filter(removeSpoofedIdentity(exchange))
                    : writeError(exchange, ErrorCode.UNAUTHORIZED);
        }
        if (!authorization.startsWith("Bearer ")) {
            return writeError(exchange, ErrorCode.TOKEN_INVALID);
        }

        try {
            Claims claims = jwtVerifier.verify(authorization.substring(7));
            ServerHttpRequest trustedRequest = request.mutate()
                    // 先删客户端伪造值，再写入网关验证后的值。
                    .headers(headers -> headers.remove("X-User-Id"))
                    .header("X-User-Id", claims.getSubject())
                    .build();
            // Authorization 原样保留，下游继续独立验证。
            return chain.filter(exchange.mutate().request(trustedRequest).build());
        } catch (JwtException | IllegalArgumentException e) {
            return writeError(exchange, ErrorCode.TOKEN_INVALID);
        }
    }

    private ServerWebExchange removeSpoofedIdentity(ServerWebExchange exchange) {
        ServerHttpRequest request = exchange.getRequest().mutate()
                .headers(headers -> headers.remove("X-User-Id"))
                .build();
        return exchange.mutate().request(request).build();
    }

    private Mono<Void> writeError(ServerWebExchange exchange, ErrorCode errorCode) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        try {
            List<Locale> locales = exchange.getRequest().getHeaders().getAcceptLanguageAsLocales();
            Locale locale = locales.isEmpty() ? Locale.SIMPLIFIED_CHINESE : locales.get(0);
            String message = messageSource.getMessage(errorCode.getMessageKey(), null, locale);
            byte[] body = objectMapper.writeValueAsBytes(
                    Result.fail(errorCode.getCode(), message));
            DataBuffer buffer = response.bufferFactory().wrap(body);
            return response.writeWith(Mono.just(buffer));
        } catch (Exception e) {
            return response.setComplete();
        }
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
```

这里注入 Spring Boot 已配置的 `ObjectMapper`，不要自己 `new ObjectMapper()`；否则 Java Time、命名策略等全局 Jackson 配置不会生效。网关是 WebFlux，不使用 MVC 的 `LocaleContextHolder`，而是直接根据 `Accept-Language` 解析 Locale。

## 七、下游仍要建立 SecurityContext

把 JWT 通用验证逻辑抽取为 `mall-security` 普通 jar，让
course/order/stock/payment/seckill/search 等资源服务依赖它。`mall-user` 是令牌签发方，
继续使用自己的 Day04 Security 配置，不启用资源服务配置。拆分后不能让过滤器每次去
user 表查用户；JWT 携带 `sub`、`username` 和 `authorities`，资源服务验签后在本进程
构造 `Authentication`。

### 1. `mall-security` 依赖

新建 `E:\CourseMall\mall-security\pom.xml`，并把模块加入父工程。该模块至少包含：

```xml
<dependencies>
    <dependency>
        <groupId>com.mall</groupId>
        <artifactId>mall-common</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-api</artifactId>
        <version>${jjwt.version}</version>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-impl</artifactId>
        <version>${jjwt.version}</version>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>io.jsonwebtoken</groupId>
        <artifactId>jjwt-jackson</artifactId>
        <version>${jjwt.version}</version>
        <scope>runtime</scope>
    </dependency>
</dependencies>
```

父 POM 的 `dependencyManagement` 管理 `mall-security` 版本，各资源服务只需添加：

```xml
<dependency>
    <groupId>com.mall</groupId>
    <artifactId>mall-security</artifactId>
</dependency>
```

### 2. 当前用户和公开路径配置

新建
`E:\CourseMall\mall-security\src\main\java\com\mall\security\ResourcePrincipal.java`：

```java
package com.mall.security;

/** 资源服务从 JWT 中恢复出的当前用户。 */
public record ResourcePrincipal(Long id, String username) {
}
```

新建
`E:\CourseMall\mall-security\src\main\java\com\mall\security\ResourceSecurityProperties.java`：

```java
package com.mall.security;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/** 每个资源服务自己的公开 GET/POST 路径。 */
@Data
@ConfigurationProperties(prefix = "security.resource")
public class ResourceSecurityProperties {
    private boolean enabled;
    private List<String> publicGetPaths = new ArrayList<>();
    private List<String> publicPostPaths = new ArrayList<>();
}
```

### 3. JWT 过滤器

新建
`E:\CourseMall\mall-security\src\main\java\com\mall\security\ResourceJwtFilter.java`：

```java
package com.mall.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import javax.crypto.SecretKey;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** 资源服务 JWT 验签过滤器。 */
public class ResourceJwtFilter extends OncePerRequestFilter {

    private final SecretKey key;

    public ResourceJwtFilter(String secret) {
        this.key = Keys.hmacShaKeyFor(
                secret.getBytes(StandardCharsets.UTF_8));
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (StringUtils.hasText(authorization)
                && authorization.startsWith("Bearer ")
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                Claims claims = Jwts.parser()
                        .verifyWith(key)
                        .build()
                        .parseSignedClaims(authorization.substring(7))
                        .getPayload();

                Long userId = Long.valueOf(claims.getSubject());
                String username = claims.get("username", String.class);
                List<?> authorityValues = claims.get(
                        "authorities", List.class);
                List<SimpleGrantedAuthority> authorities = authorityValues == null
                        ? List.of()
                        : authorityValues.stream()
                                .map(String::valueOf)
                                .map(SimpleGrantedAuthority::new)
                                .toList();

                ResourcePrincipal principal =
                        new ResourcePrincipal(userId, username);
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                principal, null, authorities);
                authentication.setDetails(
                        new WebAuthenticationDetailsSource()
                                .buildDetails(request));
                SecurityContextHolder.getContext()
                        .setAuthentication(authentication);
            } catch (JwtException | IllegalArgumentException ex) {
                // 保持未认证，后面的 AuthorizationFilter 会进入统一 401 入口。
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }
}
```

### 4. 完整资源服务 Security 配置

新建
`E:\CourseMall\mall-security\src\main\java\com\mall\security\ResourceSecurityConfig.java`：

```java
package com.mall.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Servlet 资源服务通用安全配置。 */
@EnableMethodSecurity
@Configuration
@RequiredArgsConstructor
@EnableConfigurationProperties(ResourceSecurityProperties.class)
@ConditionalOnProperty(
        prefix = "security.resource",
        name = "enabled",
        havingValue = "true")
public class ResourceSecurityConfig {

    private final ResourceSecurityProperties properties;
    private final ObjectMapper objectMapper;
    private final MessageSource messageSource;

    @Bean
    public SecurityFilterChain resourceFilterChain(
            HttpSecurity http,
            @Value("${jwt.secret}") String secret)
            throws Exception {
        ResourceJwtFilter jwtFilter = new ResourceJwtFilter(secret);
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> {
                    if (!properties.getPublicGetPaths().isEmpty()) {
                        auth.requestMatchers(
                                        HttpMethod.GET,
                                        properties.getPublicGetPaths()
                                                .toArray(String[]::new))
                                .permitAll();
                    }
                    if (!properties.getPublicPostPaths().isEmpty()) {
                        auth.requestMatchers(
                                        HttpMethod.POST,
                                        properties.getPublicPostPaths()
                                                .toArray(String[]::new))
                                .permitAll();
                    }
                    auth.anyRequest().authenticated();
                })
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, exception) ->
                                writeError(response, request.getLocale(),
                                        ErrorCode.UNAUTHORIZED))
                        .accessDeniedHandler((request, response, exception) ->
                                writeError(response, request.getLocale(),
                                        ErrorCode.FORBIDDEN)))
                .addFilterBefore(
                        jwtFilter,
                        UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private void writeError(
            HttpServletResponse response,
            java.util.Locale locale,
            ErrorCode errorCode) throws IOException {
        response.setStatus(errorCode.getHttpStatus());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        String message = messageSource.getMessage(
                errorCode.getMessageKey(), null, locale);
        objectMapper.writeValue(
                response.getOutputStream(),
                Result.fail(errorCode.getCode(), message));
    }
}
```

`mall-security` 必须位于各启动类 `scanBasePackages = "com.mall"` 的范围内。
Gateway 是 WebFlux，不依赖这个 Servlet 模块。

### 5. 每个服务配置自己的公开路径

例如 `E:\CourseMall\mall-course\src\main\resources\application.yml`：

```yaml
jwt:
  secret: ${COURSE_MALL_JWT_SECRET}

security:
  resource:
    enabled: true
    public-get-paths:
      - /api/courses
      - /api/courses/**
      - /api/categories/**
      - /api/teachers/**
      - /upload/**
    public-post-paths: []
```

其他服务按职责配置：`mall-order`、`mall-stock` 默认没有公开路径；
`mall-payment` 只公开支付回调 POST；`mall-search` 只公开课程搜索 GET。
`/internal/**` 不放白名单，Feign 必须传播合法身份或后续改用 OAuth2 Client Credentials。

### 6. 签发 Token 时写入权限

Day04/05 的认证服务必须把权限放进 Token，否则资源服务只能完成认证，
`@PreAuthorize("hasAuthority(...) ")` 会因为权限列表为空而返回 403。签发时增加：

```java
List<String> authorities = loginUser.getAuthorities().stream()
        .map(GrantedAuthority::getAuthority)
        .toList();

String token = Jwts.builder()
        .subject(String.valueOf(loginUser.getId()))
        .claim("username", loginUser.getUsername())
        .claim("authorities", authorities)
        .issuedAt(now)
        .expiration(expire)
        .signWith(key())
        .compact();
```

这段应合并到
`E:\CourseMall\mall-user\src\main\java\com\mall\user\util\JwtUtil.java` 的签发方法，
并让 `TokenService.issue(...)` 接收 `LoginUser`，而不是只接收丢失权限信息的 `User`。
修改后旧 Token 没有 authorities，需要重新登录获取新 Token。

生产网络还应通过安全组/Kubernetes NetworkPolicy 禁止公网直连 8080～8084，只暴露网关 9000。代码鉴权与网络隔离要同时存在。

## 八、联调验收

```bash
# 公开 GET：不带 Token
curl http://127.0.0.1:9000/api/courses

# 后台写接口：必须带 Token，且下游还会检查 course:create
curl -X POST http://127.0.0.1:9000/api/admin/courses \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Java","categoryId":1,"teacherId":1,"price":99,"stock":100,"status":1}'
```

必测用例：

1. 公开 GET 无 Token 通过，但伪造 Token 仍返回 401。
2. 管理接口无 Token 在网关被拦截。
3. 有 Token 但无 `course:create` 在下游 `@PreAuthorize` 返回 403。
4. 客户端伪造 `X-User-Id: 1`，网关会删除/覆盖。
5. `/internal/**` 从网关访问不能命中任何路由。

## 九、知识点索引

| 知识点 | 文档 |
|---|---|
| Route / Predicate / Filter / WebFlux | [Gateway](/learn_backend/java/微服务/Gateway) |
| `lb://` + Nacos + LoadBalancer | [Nacos](/learn_backend/java/微服务/Nacos) |
| JWT、SecurityContext、`@PreAuthorize` | [Spring Security](/learn_backend/java/基础/Spring Security) |
| i18n `MessageSource` | [Spring Boot](/learn_backend/java/基础/Spring Boot) |

## 十、✅ 完成后回填

- [ ] 网关只使用 WebFlux/Gateway，没有 MVC starter
- [ ] 公网路由按服务明确列出，没有错误的 `/api/** -> mall-user`
- [ ] 白名单同时匹配 HTTP Method 和 Path
- [ ] JWT 秘钥来自环境变量
- [ ] 下游服务仍会验证 JWT，`@PreAuthorize` 已实测 403
- [ ] 伪造 `X-User-Id` 无法绕过鉴权

## 十一、面试追问

1. Route、Predicate 和 Filter 各是什么？
2. `lb://mall-course` 如何变成真实实例地址？
3. 为什么白名单必须同时匹配 Method 和 Path？
4. 网关已验 JWT，下游为什么还要再验？
5. 如何防止直连下游并伪造 `X-User-Id`？
