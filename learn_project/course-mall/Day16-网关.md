# Day 16 · 网关（Gateway 统一入口 + 路由断言 + 过滤器 + 全局鉴权）

> **今天目标**：新增 `mall-gateway` 模块（9000 端口），让所有请求统一从网关进入：按路径断言路由到 `mall-user` / `mall-course`，并在网关层用全局过滤器统一做 JWT 鉴权——无效 token 直接 401 拦下，合法 token 解析出 userId 用 `X-User-Id` 头透传给下游。

## 一、前置条件

- 已完成 **Day 13（服务拆分 + Nacos 注册）**：`mall-user`（8080）、`mall-course`（8081）都已注册到 Nacos，网关要能通过 `lb://` 按服务名找到它们
- 已完成 **Day 4（JWT 登录）**：登录接口签发的 JWT 格式（userId 放在 `sub` 标准字段里、密钥配置在 `jwt.secret`），网关校验必须和它完全一致
- **Nacos Server 已启动**（`http://localhost:8848/nacos`），两个服务实例都在服务列表里
- Day 14/15 不直接依赖，但今天改的 `mall-user` 里已有它们的代码（Nacos Config、OpenFeign），不要删

> ⚠️ 网关依赖服务发现，Nacos 没启动的话，网关启动和转发都会报「找不到实例」。

## 二、今天完成后你会得到什么

1. 新模块 `mall-gateway`，监听 `9000` 端口（对外唯一入口）
2. 两条路由：`/api/course/**` → `mall-course`、其余 `/api/**` → `mall-user`（含路由优先级）
3. 过滤器演示：`AddRequestHeader`（路由过滤器）+ `StripPrefix` 原理讲解
4. 全局鉴权：`AuthGlobalFilter` 校验 JWT，白名单放行、无效返回 401、合法透传 `X-User-Id`

## 三、步骤

### 步骤 1：先搞懂「网关」到底解决什么问题

Day 13 把服务拆开了，每个服务一个端口：`mall-user` 占 `8080`，`mall-course` 占 `8081`……客户端（前端/App）如果直连每个服务，会有一堆问题：

| 痛点 | 具体表现 |
|---|---|
| 入口太多 | 前端要记住每个服务的 IP:端口，服务一扩缩容、一改端口，前端全要跟着改 |
| 鉴权重复 | 每个服务都得写一遍「校验 JWT」的代码，逻辑重复、容易漏 |
| 横切逻辑散落 | 跨域、限流、日志、灰度……要么每个服务各写一套，要么根本没人写 |
| 暴露内部结构 | 客户端直接摸到内部服务，攻击面变大 |

**网关（Gateway）是流量的统一大门**：客户端只连网关一个入口，网关负责「路由到哪个服务」+「在入口统一做鉴权/限流/日志」，服务本身只管业务。

::: tip 💡 面试题：为什么微服务一定要有网关？
**一句话**：解决「入口太多、鉴权重复、横切逻辑散落、暴露内部结构」四大痛点——客户端只连网关一个入口，网关统一做路由、鉴权、限流、跨域、日志，下游服务专心写业务。详见 [Gateway](/learn_backend/java/微服务/Gateway)。
:::

::: tip 💡 面试题：Gateway 的三大核心概念是什么？
**一句话**：**Route（路由）**= 转发的规则（去哪 + 什么条件去）；**Predicate（断言）**= 匹配条件（路径/方法/请求头满足才命中）；**Filter（过滤器）**= 命中路由后、转发前后对请求/响应的加工。一个请求 = 命中断言 → 走过滤器 → 转发。详见 [Gateway](/learn_backend/java/微服务/Gateway)。
:::

### 步骤 2：新建 `mall-gateway` 模块

先改父工程 `E:\course-mall\pom.xml` 的 `<modules>`（Day 13 已加了 `mall-course`，今天追加 `mall-gateway`）：

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-course</module>   <!-- Day 13 拆出的课程服务 -->
    <module>mall-gateway</module>  <!-- 今天新增：网关 -->
</modules>
```

新建 `E:\course-mall\mall-gateway\pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.mall</groupId>
        <artifactId>course-mall</artifactId>
        <version>1.0.0</version>
    </parent>

    <artifactId>mall-gateway</artifactId>

    <dependencies>
        <!-- 网关核心：Spring Cloud Gateway。版本由 Day13 引入的 Spring Cloud BOM 管理 -->
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-gateway</artifactId>
        </dependency>

        <!-- 负载均衡：lb:// 前缀按服务名选实例，缺它会报 "Unable to find instance for lb://..." -->
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-loadbalancer</artifactId>
        </dependency>

        <!-- Nacos 服务发现：让网关能按服务名去注册表找到下游实例 -->
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
        </dependency>

        <!-- 复用统一返回体 Result / 错误码 ErrorCode（鉴权拦截返回 JSON 时用）。
             注意：mall-common 只带 spring-web（WebFlux 也用它），不带 spring-webmvc，
             所以引进来不会触发「Spring MVC found on classpath」的启动报错 -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>

        <!-- JWT 解析库 jjwt：和 Day4 登录用的是同一套（版本也一致），网关校验 token 用 -->
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-api</artifactId>
            <version>0.12.6</version>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-impl</artifactId>
            <version>0.12.6</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-jackson</artifactId>
            <version>0.12.6</version>
            <scope>runtime</scope>
        </dependency>

        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

::: tip 💡 面试题：网关能不能引入 `spring-boot-starter-web`？
**一句话**：**不能**。Spring Cloud Gateway 基于 **WebFlux（响应式，跑在 Netty 上）**，而 `spring-boot-starter-web` 是 Spring MVC（Servlet 阻塞模型），两者模型冲突——同时引入会启动报错 `Spring MVC found on classpath`。所以网关模块全程**只有 gateway starter、没有 web starter**。
:::

::: tip 💡 面试题：Gateway 和 Zuul 有什么区别？为什么现在都用 Gateway？
**一句话**：Zuul 1.x 基于 Servlet（Tomcat 阻塞模型），每个请求占一个线程，高并发下线程开销大；Gateway 基于 **WebFlux + Netty（响应式非阻塞）**，少量线程就能扛大量并发。Zuul 2.x 迟迟不成熟，所以 Spring 官方力推 Gateway。详见 [Gateway](/learn_backend/java/微服务/Gateway)。
:::

### 步骤 3：启动类（网关是 WebFlux 应用）

新建 `E:\course-mall\mall-gateway\src\main\java\com\mall\gateway\MallGatewayApplication.java`：

```java
package com.mall.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// 网关不托管业务 Controller，所以不需要像 mall-user 那样 scanBasePackages="com.mall"；
// 它默认只扫自己 com.mall.gateway 包下的 Bean（过滤器、JwtUtil）。
// Result/ErrorCode 是直接 import 用的普通类，不需要被扫描。
@SpringBootApplication
public class MallGatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallGatewayApplication.class, args);
    }
}
```

### 步骤 4：路由配置 `application.yml`（今天的核心配置）

新建 `E:\course-mall\mall-gateway\src\main\resources\application.yml`：

```yaml
server:
  port: 9000                # 网关统一入口：前端从此只连 9000，不再直连 8080/8081

spring:
  application:
    name: mall-gateway
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
        # 这里不配 namespace！Day13/15 里 mall-user / mall-course 注册时没设 namespace，
        # 默认注册到 public；网关必须和下游在同一个命名空间才能互相发现，配了 dev 反而找不到实例
    gateway:
      routes:
        # 路由一：课程服务。order=0 让它先于用户服务被匹配（原因见下面的「路由优先级」）
        - id: mall-course
          uri: lb://mall-course          # lb = loadbalance：按服务名去 Nacos 找实例并负载均衡
          order: 0                       # 路由优先级：数字越小越先匹配
          predicates:
            - Path=/api/course/**        # 断言：路径以 /api/course/ 开头才命中这条路由
        # 路由二：用户服务（兜底：/api/ 下其余路径都走这里）
        - id: mall-user
          uri: lb://mall-user
          order: 1
          predicates:
            - Path=/api/**
          filters:
            - AddRequestHeader=X-From-Gateway, mall-gateway   # 转发时加个头，下游可识别「我从网关来」（步骤 8 细讲）

# JWT 密钥：必须和 Day4 mall-user 的 application.yml 里 jwt.secret 完全一致，
# 否则网关验签不过，合法 token 也会被判 401（JWT 用同一把密钥签发和校验）
jwt:
  secret: course-mall-jwt-secret-key-please-change-it-in-production-2026
```

关键点（为什么这么写）：

- **`uri: lb://mall-user`**：`lb://` 表示「走负载均衡」，后面的 `mall-user` 不是 IP，而是**注册到 Nacos 的服务名**。网关启动后会去 Nacos 拉 `mall-user` 的实例列表，转发时挑一个。
- **`Path=/api/**`**：这是**断言（Predicate）**，`**` 是 Ant 风格通配符，匹配 `/api/` 后面任意层级。只有路径匹配的请求才会命中这条路由。
- **路由优先级**：`/api/course/list` 同时匹配 `Path=/api/course/**` 和 `Path=/api/**` 两条路由。Gateway 按 **`order` 升序**（相同 order 按 yml 里的定义顺序）逐条匹配，**第一条命中的生效**。所以课程路由必须 `order: 0` 排在前面——否则课程请求全被用户路由的 `/api/**` 吃掉，转发给 `mall-user` 就是 404。
- **本项目下游 Controller 都保留了 `/api` 前缀**（Day01 的 `/api/health`、Day13 的 `/api/course/list`、Day14 的 `/api/config`），所以网关路径和下游路径一一对应，**主路由不用 `StripPrefix`**（步骤 8 讲什么时候才需要剥前缀）。

::: tip 💡 面试题：多个路由都能匹配同一个请求时，Gateway 怎么决定走哪条？
**一句话**：按 `order` 升序逐条匹配（order 相同则按定义顺序），**第一条命中的路由生效**。所以「更具体」的路径要配更小的 order 排前面——比如 `/api/course/**` 必须排在 `/api/**` 前面，否则被宽泛路由先吃掉。
:::

::: tip 💡 面试题：网关转发报 503「找不到实例」，最常见的原因是什么？
**一句话**：① 下游服务没启动/没注册到 Nacos；② **namespace 不一致**——服务注册到了 public，网关却配了别的 namespace；③ `lb://` 后面的服务名和 Nacos 里的注册名大小写/拼写不一致。详见 [Nacos](/learn_backend/java/微服务/Nacos)。
:::

### 步骤 5：小改造——把 `/api/health` 加进 `mall-user` 的白名单

网关白名单放行还不够，`mall-user` 里还留着 Day4 的 Spring Security（`anyRequest().authenticated()`），它会再拦一次。健康检查接口一般要**公开**（Nginx/K8s 探活都是无鉴权访问），所以改 `E:\course-mall\mall-user\src\main\java\com\mall\user\config\SecurityConfig.java` 的这一行：

```java
.authorizeHttpRequests(auth -> auth
    // Day4 的白名单；今天把 /api/health 加进来：探活接口要公开，
    // 否则网关白名单放行了、下游 Security 又拦一次，健康检查会莫名其妙返回 401
    .requestMatchers("/api/user/login", "/api/user/register", "/api/health").permitAll()
    .anyRequest().authenticated())
```

> 这暴露了一个重要事实：**网关鉴权之后，下游服务的鉴权（Day4 的 JwtAuthFilter）仍然在工作**——这是「纵深防御」，网关被绕过时下游还有一道防线。步骤 9 验证完你会看到两层鉴权如何配合。

### 步骤 6：验证「路由转发」（两条路由都通）

先整体编译，再开三个终端依次启动（顺序无所谓，都起就行）：

```bash
# 在 E:\course-mall\ 根目录
mvn clean install -DskipTests

# 终端 1：mall-user（8080）
mvn -pl mall-user spring-boot:run
# 终端 2：mall-course（8081）
mvn -pl mall-course spring-boot:run
# 终端 3：网关（9000）
mvn -pl mall-gateway spring-boot:run
```

```bash
# 老方式：直连下游
curl http://localhost:8080/api/health
curl http://localhost:8081/api/course/list

# 新方式：全部走网关，返回应该和直连一致
curl http://localhost:9000/api/health        # → 用户服务的健康检查 JSON
curl http://localhost:9000/api/course/list   # → 课程服务的 3 门课（Day13 的数据）
```

预期 `/api/course/list` 走网关返回：

```json
{
  "code": 200,
  "message": "success",
  "data": [
    { "id": 1, "title": "Java 高并发实战", "price": 199.00 },
    { "id": 2, "title": "MySQL 底层原理", "price": 99.00 },
    { "id": 3, "title": "大模型 Agent 开发", "price": 299.00 }
  ]
}
```

到这一步，你已经验证了「客户端 → 9000 网关 → 按 Path 断言命中路由 → `lb://服务名` → Nacos 找到实例 → 转发到对应服务」。这就是网关最核心的路由转发链路。

> 说明：这一步还没写 `AuthGlobalFilter`，所以不带 token 也能通——鉴权是步骤 9 加的，加完之后 `/api/course/list` 不带 token 就会变成 401。

### 步骤 7：路由断言（Predicate）还能匹配什么

`Path` 只是最常用的一种断言。Gateway 内置了一堆断言工厂，都是 `Key=Value` 的形式：

| 断言 | 写法示例 | 命中条件 |
|---|---|---|
| 路径 Path | `- Path=/api/**` | 路径匹配 Ant 表达式 |
| 方法 Method | `- Method=GET,POST` | 请求方法在列表里 |
| 请求头 Header | `- Header=X-Request-Id, \d+` | 头存在且值匹配正则 |
| 查询参数 Query | `- Query=page, \d+` | 参数存在且值匹配正则 |
| Cookie | `- Cookie=sessionId, .+` | Cookie 存在且值匹配 |
| 时间 After/Before | `- After=2026-08-19T00:00:00+08:00` | 请求时间晚于/早于某时刻（活动定时开关） |
| 权重 Weight | `- Weight=group1, 80` | 按权重分流（灰度发布） |

同一条路由下写了多个断言，是 **AND 关系**：必须**同时满足**才命中。

::: tip 💡 面试题：断言和过滤器有什么区别？谁先执行？
**一句话**：**断言**决定「这个请求该不该走这条路由」（匹配阶段），**过滤器**决定「命中之后怎么加工请求/响应」（加工阶段）。顺序是：先断言匹配 → 命中路由 → 再执行过滤器链 → 最后转发。
:::

### 步骤 8：过滤器（Filter）——转发的加工站

过滤器分两类：

- **路由过滤器（GatewayFilter）**：只作用于**某一条路由**，写在 yml 里那条路由的 `filters:` 下。
- **全局过滤器（GlobalFilter）**：作用于**所有路由**，写 Java 类实现 `GlobalFilter` 接口（步骤 9 的鉴权就是）。

**最常用的路由过滤器 `StripPrefix`**：把「网关路径里多余的段」剥掉再转发。对照表：

| StripPrefix 参数 | 网关收到的路径 | 剥掉几段 | 转发给下游的路径 |
|---|---|---|---|
| `StripPrefix=1` | `/api/user/login` | 剥掉 `/api` | `/user/login` |
| `StripPrefix=2` | `/api/user/login` | 剥掉 `/api` `/user` | `/login` |

什么时候用？当「**下游服务的 Controller 路径比网关路径短**」时。例如下游 Controller 写成 `@RequestMapping("/user")`（没有 `/api`），网关对外却想暴露 `/api/user/**`，就加 `StripPrefix=1`：

```yaml
          filters:
            - StripPrefix=1      # /api/user/login → /user/login
```

> ⚠️ **本项目主路由不加 StripPrefix**：因为我们 Day01/Day13/Day14 写的下游 Controller 都带 `/api` 前缀，网关 `/api/**` 和下游 `/api/**` 一一对应。加 `StripPrefix=1` 会把 `/api` 剥掉、下游收不到路径而 404。

**另一个常用过滤器 `AddRequestHeader`**：给转发到下游的请求加一个固定头。今天已经配在 `mall-user` 路由上了（步骤 4 的 yml），下游能通过 `HttpServletRequest.getHeader("X-From-Gateway")` 读到它——步骤 9 的 echo 接口会验证。

::: tip 💡 面试题：`StripPrefix` 解决什么问题？参数 `1` 表示什么？
**一句话**：解决「网关对外路径和下游服务真实路径前缀不一致」的问题；参数 `1` 表示剥掉路径**最前面的 1 段**（按 `/` 切分）。例如网关 `/api/user/login` 剥 1 段得 `/user/login`，剥 2 段得 `/login`。
:::

### 步骤 9：全局鉴权——`AuthGlobalFilter` + `JwtUtil`（今天最有分量的部分）

把「校验 JWT」这件所有服务都要做的事，**从各服务抽到网关统一做一次**。网关解析通过后，把 userId 放进 `X-User-Id` 头透传给下游。

先写 JWT 解析工具 `E:\course-mall\mall-gateway\src\main\java\com\mall\gateway\util\JwtUtil.java`：

```java
package com.mall.gateway.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;

@Component
public class JwtUtil {

    private final SecretKey key;

    // 构造时从配置读密钥。必须和 Day4 签发 JWT 用的 jwt.secret 完全一致，否则验签不过。
    public JwtUtil(@Value("${jwt.secret}") String secret) {
        // HS256 要求密钥 >= 256 位（32 字节），长度不够启动时抛 WeakKeyException
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    // 解析并校验 token：验签 + 校验过期时间，任何一步不过都会抛 JwtException
    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(key)             // 用同一个密钥验签：被篡改的 token 在这里就失败
                .build()
                .parseSignedClaims(token)    // 返回 Jws<Claims>
                .getPayload();               // 取出载荷
    }

    // 取 userId。注意：Day4 签发时把 userId 放在了标准字段 sub 里（subject），
    // 不是自定义 claim——写成 claims.get("userId") 会取到 null！
    public Long getUserId(Claims claims) {
        return Long.parseLong(claims.getSubject());
    }
}
```

再写全局过滤器 `E:\course-mall\mall-gateway\src\main\java\com\mall\gateway\filter\AuthGlobalFilter.java`：

```java
package com.mall.gateway.filter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.gateway.util.JwtUtil;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.core.io.buffer.DataBuffer;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuthGlobalFilter implements GlobalFilter, Ordered {

    private final JwtUtil jwtUtil;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // 白名单：这些路径不用登录。health 是探活接口；login/register 是 Day3/4 的登录注册
    private static final Set<String> WHITE_LIST = Set.of(
            "/api/health",
            "/api/user/login",
            "/api/user/register"
    );

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();

        // 1. 白名单直接放行，不碰 token
        if (WHITE_LIST.contains(path)) {
            return chain.filter(exchange);
        }

        // 2. 取 Authorization 头，标准格式：Bearer <token>
        String authHeader = request.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return unauthorized(exchange, "未登录，请先登录");
        }
        String token = authHeader.substring(7);   // 去掉 "Bearer " 前缀

        // 3. 校验 JWT：签名不对、过期、格式错，都会抛 JwtException
        try {
            Claims claims = jwtUtil.parseToken(token);
            Long userId = jwtUtil.getUserId(claims);

            // 4. mutate 复制一个 request 并加头，再把新 request 塞回 exchange 继续往下走。
            //    ServerHttpRequest 是不可变的，想加头必须复制一份再加。
            //    注意：原 Authorization 头原样保留，所以下游 Day4 的 JwtAuthFilter 还能正常解析
            ServerHttpRequest mutated = request.mutate()
                    .header("X-User-Id", String.valueOf(userId))
                    .build();
            return chain.filter(exchange.mutate().request(mutated).build());
        } catch (JwtException | IllegalArgumentException e) {
            log.warn("token 校验失败: {}", e.getMessage());
            return unauthorized(exchange, "token 无效或已过期");
        }
    }

    // 网关是响应式的，不能像 Spring MVC 那样直接 return 一个 JSON 对象；
    // 要手动把 JSON 字符串写入 Response 的 DataBuffer，再由 Netty 写出
    private Mono<Void> unauthorized(ServerWebExchange exchange, String message) {
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.UNAUTHORIZED);
        response.getHeaders().setContentType(MediaType.APPLICATION_JSON);
        Result<Void> result = Result.fail(ErrorCode.UNAUTHORIZED.getCode(), message);
        byte[] bytes;
        try {
            bytes = objectMapper.writeValueAsBytes(result);
        } catch (JsonProcessingException e) {
            bytes = "{\"code\":401,\"message\":\"未登录\"}".getBytes(StandardCharsets.UTF_8);
        }
        DataBuffer buffer = response.bufferFactory().wrap(bytes);
        return response.writeWith(Mono.just(buffer));
    }

    // 数字越小越先执行。真正转发请求的 NettyRoutingFilter 顺序在很后面，
    // 鉴权必须排在它前面（-100 足够靠前），否则无效请求早被转发到下游了
    @Override
    public int getOrder() {
        return -100;
    }
}
```

关键点（为什么这么写）：

- **`GlobalFilter` + `@Component`**：实现 `GlobalFilter` 接口并交给 Spring 管理，就会**自动作用于所有路由**，不用在 yml 里逐条配置。
- **`Ordered` 控制顺序**：`getOrder()` 返回越小越先执行。鉴权必须跑在「真正转发」之前，否则 token 无效的请求已经进到下游了。
- **响应式写法**：Gateway 是 WebFlux，请求/响应都是 `Mono`/`Flux` 流。拦截时不能 `return Result`，而要往 `response` 的 `DataBuffer` 里写字节再 `writeWith`。
- **`request.mutate().header(...)`**：`ServerHttpRequest` 不可变，想加头必须 `mutate()` 复制一份再加，再把新请求放回 `exchange`。
- **Authorization 头原样转发**：网关只「加」头、不删头。所以 `mall-user` 里 Day4 的 `JwtAuthFilter` 依然能拿到原始 token 完成自己的认证——两层鉴权同时成立。

为了让「透传」看得见，在 `mall-user` 加一个 echo 接口 `E:\course-mall\mall-user\src\main\java\com\mall\user\controller\GatewayDemoController.java`：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
public class GatewayDemoController {

    // 演示网关透传的头：
    // X-User-Id 由 AuthGlobalFilter 解析 token 后注入；X-From-Gateway 由路由上的 AddRequestHeader 注入。
    // 该接口在 mall-user 的 Security 保护下（非白名单），带合法 token 才能进来
    @GetMapping("/echo")
    public Result<Map<String, Object>> echo(HttpServletRequest request) {
        Map<String, Object> data = new HashMap<>();
        data.put("X-User-Id", request.getHeader("X-User-Id"));
        data.put("X-From-Gateway", request.getHeader("X-From-Gateway"));
        data.put("Authorization", request.getHeader("Authorization") == null ? null : "***已带***");
        return Result.ok(data);
    }
}
```

::: tip 💡 面试题：为什么鉴权要放在网关做，而不是每个服务自己校验 JWT？
**一句话**：① 避免每个服务重复写同一套校验逻辑（一处改动要改 N 个服务）；② 网关是唯一入口，天然是「统一安检」的位置；③ 下游服务可以简化成「信任网关透传的用户身份」，只做业务授权。代价是**网关成了安全单点**，它一旦被绕过，下游全裸奔——所以本项目下游仍保留 Day4 的 Security，这叫「纵深防御」。详见 [Gateway](/learn_backend/java/微服务/Gateway)。
:::

::: tip 💡 面试题：网关校验通过后，怎么把「当前用户是谁」告诉下游服务？
**一句话**：解析 token 拿到 `userId`，用 `request.mutate().header("X-User-Id", ...)` 把它放进请求头透传，下游服务直接读 `X-User-Id`，不用再解析 token。
:::

### 步骤 10：验证「全局鉴权」（六连发）

重启网关后，依次验证：

```bash
# 1) 白名单：不带 token 也能通（/api/health 网关白名单 + 下游 Security 双放行）
curl http://localhost:9000/api/health
# → 200 健康检查 JSON

# 2) 非白名单：不带 token，被网关拦下
curl http://localhost:9000/api/course/list
# → HTTP 401 {"code":401,"message":"未登录，请先登录","data":null}

# 3) 伪造 token，被拦下
curl -H "Authorization: Bearer abc.def.ghi" http://localhost:9000/api/course/list
# → HTTP 401 {"code":401,"message":"token 无效或已过期","data":null}

# 4) 走网关登录拿真实 token（登录在白名单里，不需要 token）
curl -X POST http://localhost:9000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"123456"}'
# → {"code":200,...,"token":"eyJ..."}，把 token 复制下来

# 5) 带真实 token 访问课程列表：通，且被路由到 mall-course
curl -H "Authorization: Bearer <TOKEN>" http://localhost:9000/api/course/list
# → 200 课程数据（和步骤 6 一样）

# 6) 验证身份透传：echo 接口把网关注入的两个头原样返回
curl -H "Authorization: Bearer <TOKEN>" http://localhost:9000/api/user/echo
# → {"code":200,"message":"success","data":{"X-User-Id":"1","X-From-Gateway":"mall-gateway","Authorization":"***已带***"}}
```

> 第 6 步能同时证明三件事：① 网关解析 token 后把 `userId` 放进了 `X-User-Id`；② `AddRequestHeader` 路由过滤器生效了；③ 原始 `Authorization` 头被原样转发，所以下游 Day4 的 `JwtAuthFilter` 依然能完成认证（否则 echo 进不来）。

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| Gateway 路由 / 断言 / 过滤器 / GlobalFilter | [Gateway](/learn_backend/java/微服务/Gateway) |
| WebFlux 响应式 vs Spring MVC、Netty | [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) |
| Nacos 服务发现、`lb://` 负载均衡、namespace | [Nacos](/learn_backend/java/微服务/Nacos) |
| JWT 验签、无状态鉴权、纵深防御 | [Spring Security](/learn_backend/java/基础/Spring Security) |
| `@Value` 配置注入、`@Component` 装配 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-gateway` 启动成功，`curl http://localhost:9000/api/health` 和直连 8080 一致：是 / 否
- [ ] `curl http://localhost:9000/api/course/list` 路由到了 mall-course（返回 3 门课）：是 / 否
- [ ] 不带 token 访问 `/api/course/list` 返回 401：是 / 否
- [ ] 伪造 token 返回 401「token 无效或已过期」：是 / 否
- [ ] 走网关登录拿到 token 后，课程列表能通、echo 返回了 `X-User-Id` 和 `X-From-Gateway`：是 / 否
- [ ] 踩坑记录（路由顺序 404、namespace 不一致 503、secret 不一致 401、web starter 冲突等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 网关为什么必须基于 WebFlux（响应式）？给 `mall-gateway` 引入 `spring-boot-starter-web` 会怎样？Gateway 和 Zuul 的核心区别是什么？
2. 一个请求从进网关到转发出去，大致经过哪几个环节？`/api/course/**` 和 `/api/**` 都能匹配 `/api/course/list` 时走哪条路由？为什么课程路由必须 `order` 更小或排在前面？
3. `uri: lb://mall-user` 里的 `lb` 是什么？网关怎么把「服务名」变成「具体 IP:端口」？（提示：Nacos 服务发现 + 负载均衡）namespace 配错会报什么错？
4. 全局鉴权过滤器为什么要实现 `Ordered` 并返回很小的值？如果它排在转发过滤器之后会有什么问题？它拦截时为什么不能直接 `return Result`？
5. 网关把 userId 透传 `X-User-Id` 给下游后，下游怎么防止有人**绕过网关**、直连服务并伪造 `X-User-Id` 头？本项目的双层鉴权（网关 + Day4 的 JwtAuthFilter）各自防住了什么？
