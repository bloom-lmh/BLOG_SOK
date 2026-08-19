# Day 04 · 登录鉴权（JWT + Spring Security 无状态登录）

> **今天目标**：实现「课程商城」的登录鉴权——用 Spring Security 校验用户名密码，签发 JWT，之后每个请求凭 token 识别身份，全程无状态。交付一个 `POST /api/user/login` 登录接口 + 一个需要登录才能访问的 `GET /api/user/info` 接口，都跑通。

## 一、前置条件

- 已完成 Day 01（Maven 多模块 + `Result`/`ErrorCode`/`BizException`/`GlobalExceptionHandler`）
- 已完成 Day 02（11 张表已建好，`user` 表可用）
- 已完成 Day 03（用户服务：`User` 实体 + `UserMapper` + 注册接口 + 参数校验 + BCrypt 密码加密 + MyBatis-Plus/MySQL 依赖）
- MySQL 正在运行，`course_mall` 库里已有一个注册好的用户（没注册的话，看步骤 8 的手动插数据方式）

> 今天只做「登录 + 鉴权」一个功能，不碰验证码/登出/刷新（那是 Day 05 的事）。

## 二、整体思路

登录和鉴权是两段独立的动作：

```
【登录（认证）】POST /api/user/login
  └─ AuthenticationManager.authenticate(username, password)
       └─ DaoAuthenticationProvider（Spring Security 自动装配）
            ├─ UserDetailsService.loadUserByUsername()  查库拿用户
            └─ BCryptPasswordEncoder.matches()           比对密码（还有账号是否禁用）
  └─ 通过后 JwtUtil.generateToken() 签发 JWT，返回给前端

【后续请求（鉴权）】任意接口，带 Authorization: Bearer <token>
  └─ JwtAuthFilter（过滤器）解析 token → 查库 → 把用户塞进 SecurityContext
       └─ Controller 通过 @AuthenticationPrincipal 拿到当前登录用户
  └─ 没带 / token 非法 → 401
```

完成后你会新增这些文件：

```
E:\course-mall\mall-user\src\main\java\com\mall\user\
├─ MallUserApplication.java          # 加 @MapperScan（Day03 应已加）
├─ config/
│  └─ SecurityConfig.java            # 安全配置：无状态、白名单、过滤器注册（今天核心）
├─ controller/
│  └─ LoginController.java           # 登录 + 当前用户信息
├─ dto/
│  └─ LoginRequest.java              # 登录入参
├─ entity/
│  └─ User.java                      # user 表实体（Day03 已建，今天贴全）
├─ mapper/
│  └─ UserMapper.java                # BaseMapper（Day03 已建）
├─ security/
│  ├─ JwtAuthFilter.java             # JWT 过滤器（今天的核心）
│  ├─ LoginUser.java                 # UserDetails 实现
│  └─ UserDetailsServiceImpl.java    # 按用户名查用户
├─ util/
│  └─ JwtUtil.java                   # 签发 / 解析 JWT
└─ vo/
   └─ UserVO.java                    # 返回前端的用户信息（不含密码）
```

## 三、步骤

### 步骤 1：补充依赖 + 配置

`mall-user/pom.xml` 在 Day03 基础上新增两样：**Spring Security** 和 **JWT 库（jjwt）**。完整内容如下（`# 新增` 标的是今天加的，其余是 Day01/Day03 已有的）：

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

    <artifactId>mall-user</artifactId>

    <dependencies>
        <!-- Day01：自己的公共模块 -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <!-- Day01：Web 启动器 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <!-- Day04 新增：Spring Security（认证 + 授权 + BCrypt 密码加密都从这来） -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-security</artifactId>
        </dependency>
        <!-- Day03：参数校验 @Valid / @NotBlank -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <!-- Day03：MyBatis-Plus（Spring Boot 3 专用 starter，注意不是 mybatis-plus-boot-starter） -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
            <version>3.5.7</version>
        </dependency>
        <!-- Day03：MySQL 驱动 -->
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
        <!-- Day04 新增：JWT（jjwt 0.12.x，api/impl/jackson 三个要一起引） -->
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

`application.yml` 在 Day03 基础上补数据源和 JWT 配置（数据源 Day03 应已配，这里贴全）：

```yaml
server:
  port: 8080

spring:
  application:
    name: mall-user
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
    username: root
    password: 改成你的MySQL密码      # Day02 建库时用的那个

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true   # 下划线转驼峰：create_time -> createTime
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 控制台打印 SQL，调试用

jwt:
  # HS256 要求密钥至少 32 字节（256 位），太短启动时抛 WeakKeyException
  secret: course-mall-jwt-secret-key-please-change-it-in-production-2026
  expire-seconds: 7200   # token 有效期 2 小时（秒）
```

::: tip 💡 面试题：JWT 用的是什么签名算法？secret 为什么要至少 32 字节？
**一句话**：这里用 HS256（HMAC-SHA256），是一个「对称」签名算法——签发和校验用**同一把密钥**，所以密钥必须保密。HMAC 的安全下限要求密钥长度 ≥ 哈希输出长度（SHA256 = 256 位 = 32 字节），jjwt 对不够长的密钥直接抛 `WeakKeyException` 拒绝启动。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

### 步骤 2：`User` 实体 + `UserMapper`（复用 Day02 的表结构）

`User.java`（`com/mall/user/entity/User.java`，Day03 已建，这里贴全以保证今天代码自洽）：

```java
package com.mall.user.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
// `user` 既是 MySQL 保留字（USER() 函数），又容易和系统库 mysql.user 混淆，
// 必须用反引号包裹，否则 MyBatis-Plus 生成的 SQL 会语法报错
@TableName("`user`")
public class User {

    @TableId(type = IdType.AUTO)   // 主键自增，对应表里的 AUTO_INCREMENT
    private Long id;

    private String username;

    private String password;       // BCrypt 加密后的密文，绝不存明文

    private String nickname;

    private String avatar;

    private String phone;

    private String email;

    private Integer status;        // 1启用 0禁用（登录时靠它判断账号是否可用）

    @TableLogic                    // 逻辑删除：select 自动拼 deleted=0，delete 变成 update deleted=1
    private Integer deleted;

    // 下面两个时间字段由数据库 DEFAULT CURRENT_TIMESTAMP / ON UPDATE 填充，
    // MyBatis-Plus 默认不插入 null 字段，所以不用手动赋值
    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
```

`UserMapper.java`（`com/mall/user/mapper/UserMapper.java`）：

```java
package com.mall.user.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.user.entity.User;

// 继承 BaseMapper：selectOne / selectById / insert 等 CRUD 都是现成的，不用手写 SQL
// 这里不加 @Mapper，因为启动类上已经用 @MapperScan 统一扫描（见步骤 7 的启动类）
public interface UserMapper extends BaseMapper<User> {
}
```

### 步骤 3：`JwtUtil`——签发和解析 token

`JwtUtil.java`（`com/mall/user/util/JwtUtil.java`）：

```java
package com.mall.user.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtil {

    // 从 application.yml 读；HS256 要求密钥 >= 32 字节
    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expire-seconds}")
    private Long expireSeconds;

    // 把字符串密钥转成 HMAC 需要的 SecretKey（每次现算，简单可靠）
    private SecretKey key() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    // 签发 token：subject 放用户标识，username 放自定义 claim
    public String generateToken(Long userId, String username) {
        Date now = new Date();
        Date expire = new Date(now.getTime() + expireSeconds * 1000);
        return Jwts.builder()
                .subject(String.valueOf(userId))   // sub：标准字段，放用户标识
                .claim("username", username)        // 自定义 claim，鉴权时读它
                .issuedAt(now)                      // iat：签发时间
                .expiration(expire)                 // exp：过期时间
                .signWith(key())                    // 用 HMAC-SHA256 签名
                .compact();                          // 拼成 header.payload.signature 三段
    }

    // 解析并校验 token：签名不对 / 已过期会直接抛异常（JwtException）
    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(key())                  // 用同一把密钥校验签名
                .build()
                .parseSignedClaims(token)           // 校验签名 + 过期时间
                .getPayload();                       // 拿到 body（claims）
    }

    public Long getExpireSeconds() {
        return expireSeconds;
    }
}
```

::: tip 💡 面试题：JWT 由哪三部分组成？为什么别人改不了里面的内容？
**一句话**：JWT = `header.payload.signature` 三段 Base64 拼起来。签名是把「header + payload」用服务端密钥算出来的 HMAC，别人改了 payload 任何一个字，重新算出来的签名就对不上，服务端一验就失败。所以 **JWT 的 payload 是「可读但不可篡改」的**——别把密码、身份证号这种敏感信息放里面。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

### 步骤 4：`LoginUser` + `UserDetailsService`——让 Spring Security 认识「我们的用户」

`LoginUser.java`（`com/mall/user/security/LoginUser.java`）：

```java
package com.mall.user.security;

import com.mall.user.entity.User;
import lombok.Getter;
import lombok.Setter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

// 登录后放进 SecurityContext 的「当前登录用户」。实现 UserDetails，Spring Security 才认得它
@Getter
@Setter
public class LoginUser implements UserDetails {

    // 直接持有 User 实体：认证时要 username/password，业务上要 id/昵称
    private User user;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        // 单体阶段先给空权限列表；Day13+ 微服务/权限阶段再扩展角色
        return List.of();
    }

    @Override
    public String getPassword() { return user.getPassword(); }

    @Override
    public String getUsername() { return user.getUsername(); }

    public Long getId() { return user.getId(); }

    // 下面四个「是否可用」的钩子，认证时 DaoAuthenticationProvider 会逐个调用
    @Override public boolean isAccountNonExpired()     { return true; }
    @Override public boolean isAccountNonLocked()      { return true; }
    @Override public boolean isCredentialsNonExpired() { return true; }

    @Override
    public boolean isEnabled() {
        // status=0 表示禁用：这里返回 false，认证时抛 DisabledException
        return user.getStatus() == null || user.getStatus() == 1;
    }
}
```

`UserDetailsServiceImpl.java`（`com/mall/user/security/UserDetailsServiceImpl.java`）：

```java
package com.mall.user.security;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.user.entity.User;
import com.mall.user.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UserMapper userMapper;

    // Spring Security 靠这个接口「按用户名查用户」；密码比对由 DaoAuthenticationProvider 自动完成
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        // LambdaQueryWrapper：类型安全地拼 where 条件，避免手写 "username" 字符串
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (user == null) {
            throw new UsernameNotFoundException("用户不存在");
        }
        LoginUser loginUser = new LoginUser();
        loginUser.setUser(user);
        return loginUser;
    }
}
```

::: tip 💡 面试题：为什么 BCrypt 同一个密码，每次加密出来的密文都不一样？
**一句话**：BCrypt 每次加密都会**随机生成一个盐（salt）**，盐参与哈希计算，所以同样的明文每次结果不同；但密文里自带盐，校验时把盐取出来重新算一遍就能对上。这也是为什么数据库被拖库后，攻击者没法用「彩虹表」直接反查密码。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

### 步骤 5：`JwtAuthFilter`——每个请求验 token 的「拦截器」

`JwtAuthFilter.java`（`com/mall/user/security/JwtAuthFilter.java`）：

```java
package com.mall.user.security;

import com.mall.user.util.JwtUtil;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

// 注意：这里故意不加 @Component（原因见下方 tip）
// OncePerRequestFilter：保证单个请求只执行一次过滤，防止在转发/包含场景下重复执行
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;

    public JwtAuthFilter(JwtUtil jwtUtil, UserDetailsService userDetailsService) {
        this.jwtUtil = jwtUtil;
        this.userDetailsService = userDetailsService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        // 1. 取 Authorization 头，格式固定 "Bearer <token>"
        String header = request.getHeader("Authorization");
        if (header == null || !header.startsWith("Bearer ")) {
            // 没带 token：直接放行，交给后面的 authorizeHttpRequests / entryPoint 决定是否 401
            filterChain.doFilter(request, response);
            return;
        }

        String token = header.substring(7);
        try {
            // 2. 解析 token（签名不对 / 已过期会抛异常，走 catch）
            Claims claims = jwtUtil.parseToken(token);
            String username = claims.get("username", String.class);

            // 3. 当前请求还没认证过才设置（避免重复查库）
            if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
                // 每请求查一次库：简单但多一次查询。优化做法是只信 token 里的 claim，
                // 代价是改密码/禁用账号不实时生效——这个权衡 Day5 讨论登出时会再讲
                UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                // 构造「已认证」的 Authentication（第三个参数是权限）
                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                // 4. 塞进 SecurityContext，后面的 Controller 就能拿到当前登录人
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        } catch (Exception e) {
            // token 非法/过期：不设 Authentication。不设 = 未认证，最终会被 entryPoint 拦下返回 401
        }
        filterChain.doFilter(request, response);
    }
}
```

::: tip 💡 面试题：过滤器 Filter 和拦截器 Interceptor 有什么区别？为什么鉴权用 Filter？
**一句话**：Filter 是 **Servlet 容器**层的（请求还没进 Spring MVC 就在了），Interceptor 是 **Spring MVC** 层的（能拿到 Handler 和 Model）。鉴权要在「最外层」拦下所有请求、还不能依赖 Controller 是否被映射到，所以用 Filter；而打印日志、给 Controller 结果统一加字段这种「方法级」增强，用 Interceptor 更合适。标题里的「拦截器鉴权」，在 Spring Security 里实际对应的是过滤器链里的 `JwtAuthFilter`。详见 [Spring MVC](/learn_backend/java/基础/Spring MVC)。
:::

::: tip 💡 面试题：`JwtAuthFilter` 为什么不能加 `@Component`？
**一句话**：加了 `@Component`，Spring Boot 会把它**自动注册成 servlet 过滤器**（对所有请求生效一次）；你再在 `SecurityConfig` 里 `addFilterBefore` 一次，同一个过滤器就会对每个请求**执行两次**（日志打两遍、库查两遍）。所以要么像今天这样 `new` 出来不注册成 Bean，要么注册成 Bean 后用 `FilterRegistrationBean.setEnabled(false)` 关掉自动注册。
:::

### 步骤 6：`SecurityConfig`——无状态 + 白名单 + 挂过滤器

`SecurityConfig.java`（`com/mall/user/config/SecurityConfig.java`）：

```java
package com.mall.user.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.result.Result;
import com.mall.user.security.JwtAuthFilter;
import com.mall.user.util.JwtUtil;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

import java.io.IOException;

@Configuration
@EnableWebSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;

    // BCrypt 密码编码器：注册时 encode，登录时 DaoAuthenticationProvider 用它 matches
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    // 把 AuthenticationManager 暴露成 Bean，登录接口手动调用它做认证
    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // 前后端分离 + token 放 Header（不靠 Cookie 传登录态），关掉 CSRF
            .csrf(csrf -> csrf.disable())
            // 核心：禁用 Session。每个请求都要带 token 重新认证，服务端不保存任何会话 → 无状态
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // 白名单：登录、注册（注册是 Day03 的接口）不需要 token
                .requestMatchers("/api/user/login", "/api/user/register").permitAll()
                .anyRequest().authenticated())
            // 认证失败 / 权限不足时返回统一 JSON（而不是 Spring Security 默认的 403 空白页）
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((req, res, e) -> writeJson(res, 401, "未登录或 token 已失效"))
                .accessDeniedHandler((req, res, e) -> writeJson(res, 403, "无权限")))
            // 把 JWT 过滤器插到「用户名密码过滤器」之前：先解析 token 再走认证
            // 用 new 创建（不注册成 Bean），避免 Spring Boot 把它自动注册成 servlet filter 执行两次
            .addFilterBefore(new JwtAuthFilter(jwtUtil, userDetailsService), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    // 统一返回：HTTP 200 + 业务码（和 Day01 的 Result 约定保持一致）
    private void writeJson(HttpServletResponse response, int code, String msg) throws IOException {
        response.setStatus(200);
        response.setContentType("application/json;charset=UTF-8");
        response.getWriter().write(new ObjectMapper().writeValueAsString(Result.fail(code, msg)));
    }
}
```

::: tip 💡 面试题：为什么 JWT 无状态登录要关掉 CSRF 防护？
**一句话**：CSRF 攻击利用的是「浏览器会自动带上 Cookie」这个特性——攻击者诱导用户点一个链接，浏览器就带着登录 Cookie 发出恶意请求。而 JWT 放在 `Authorization` 请求头里，**不依赖 Cookie**，攻击者伪造不出这个头，所以 CSRF 防护可以安全关闭。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

::: tip 💡 面试题：`SessionCreationPolicy.STATELESS` 到底做了什么？
**一句话**：它告诉 Spring Security「不要创建、也不要使用 HttpSession 来存登录态」。传统登录成功后，Spring Security 会把认证信息存进 Session；设为 STATELESS 后，每个请求都从零开始认证（靠我们的 JwtAuthFilter 从 token 还原身份），这样服务端才真正「无状态」，方便后面水平扩容、多实例部署。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

### 步骤 7：登录接口 + 当前用户信息接口

`LoginRequest.java`（`com/mall/user/dto/LoginRequest.java`）：

```java
package com.mall.user.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LoginRequest {

    @NotBlank(message = "用户名不能为空")
    private String username;

    @NotBlank(message = "密码不能为空")
    private String password;
}
```

`UserVO.java`（`com/mall/user/vo/UserVO.java`）：

```java
package com.mall.user.vo;

import lombok.Data;

// 返回给前端的用户信息。故意不包含 password——即使密码是密文也不能往外发
@Data
public class UserVO {
    private Long id;
    private String username;
    private String nickname;
    private String avatar;
    private String phone;
    private String email;
}
```

`LoginController.java`（`com/mall/user/controller/LoginController.java`）：

```java
package com.mall.user.controller;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.user.dto.LoginRequest;
import com.mall.user.security.LoginUser;
import com.mall.user.util.JwtUtil;
import com.mall.user.vo.UserVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.BeanUtils;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
public class LoginController {

    private final AuthenticationManager authenticationManager;
    private final JwtUtil jwtUtil;

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@Valid @RequestBody LoginRequest req) {
        Authentication authentication;
        try {
            // 交给 Spring Security 认证：查用户 + 比对 BCrypt 密码 + 检查账号是否禁用
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(req.getUsername(), req.getPassword()));
        } catch (DisabledException e) {
            // 账号被禁用（status=0）：单独提示
            throw new BizException(ErrorCode.UNAUTHORIZED.getCode(), "账号已被禁用");
        } catch (AuthenticationException e) {
            // 密码错 / 用户不存在都落到这里（Spring Security 默认把「用户不存在」也包装成 BadCredentialsException）
            throw new BizException(ErrorCode.UNAUTHORIZED.getCode(), "用户名或密码错误");
        }

        LoginUser loginUser = (LoginUser) authentication.getPrincipal();
        String token = jwtUtil.generateToken(loginUser.getId(), loginUser.getUsername());

        Map<String, Object> data = new HashMap<>();
        data.put("token", token);
        data.put("tokenType", "Bearer");
        data.put("expireSeconds", jwtUtil.getExpireSeconds());
        return Result.ok(data);
    }

    // 受保护接口：必须带 Authorization: Bearer <token> 才能进到这里
    @GetMapping("/info")
    public Result<UserVO> info(@AuthenticationPrincipal LoginUser loginUser) {
        // @AuthenticationPrincipal 直接把 SecurityContext 里的 principal 注入成 LoginUser，省去手动转型
        UserVO vo = new UserVO();
        // 只拷贝同名字段；UserVO 没有 password 字段，所以密码天然不会泄露出去
        BeanUtils.copyProperties(loginUser.getUser(), vo);
        return Result.ok(vo);
    }
}
```

启动类加 `@MapperScan`（`com/mall/user/MallUserApplication.java`）：

```java
package com.mall.user;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.mall")
@MapperScan("com.mall.user.mapper")   // 扫描 Mapper 接口，等价于给每个接口单独加 @Mapper
public class MallUserApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallUserApplication.class, args);
    }
}
```

::: tip 💡 面试题：为什么「用户不存在」和「密码错误」要返回同一句话？
**一句话**：为了防「用户枚举（user enumeration）」攻击——如果「用户不存在」单独提示，攻击者拿一堆手机号/用户名批量试探，就能筛出哪些账号是真实存在的。所以安全做法是统一返回「用户名或密码错误」。Spring Security 默认就把 `UsernameNotFoundException` 包装成 `BadCredentialsException`，正是这个原因。
:::

::: tip 💡 面试题：为什么接口返回用 `UserVO`，而不是直接返回 `User` 实体？
**一句话**：`User` 里有 `password`（哪怕是 BCrypt 密文也是敏感信息），直接返回会把密文泄露出去。VO（View Object）只暴露该暴露的字段，把「存储模型」和「对外视图」解耦——这也是为什么登录失败要转成 `BizException` 让全局异常处理器返回统一 JSON，而不是让 Spring Security 的异常直接冒出去变成 500。详见 [Spring MVC](/learn_backend/java/基础/Spring MVC)。
:::

### 步骤 8：启动验证

**先准备一个测试用户。** 如果 Day03 的注册接口已就绪，直接注册：

```bash
curl -X POST http://localhost:8080/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"123456","nickname":"张三"}'
```

否则手动生成一个 BCrypt 密文再插入（写个临时 `main` 打印后删掉）：

```java
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
public class Temp {
    public static void main(String[] args) {
        System.out.println(new BCryptPasswordEncoder().encode("123456"));
    }
}
```

```sql
INSERT INTO `user` (`username`, `password`, `nickname`, `status`, `deleted`)
VALUES ('zhangsan', '<把上面打印的密文贴到这里>', '张三', 1, 0);
```

**启动并验证**（在 `E:\course-mall\` 根目录）：

```bash
mvn clean install -DskipTests
mvn -pl mall-user spring-boot:run
```

**① 登录成功：**

```bash
curl -X POST http://localhost:8080/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"123456"}'
```

预期返回（`token` 是一长串，后面要用）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwidXNlcm5hbWUiOiJ6aGFuZ3NhbiJ9.xxx",
    "tokenType": "Bearer",
    "expireSeconds": 7200
  }
}
```

**② 密码错：**

```bash
curl -X POST http://localhost:8080/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"wrong"}'
```

预期返回：`{"code":401,"message":"用户名或密码错误","data":null}`

**③ 带 token 访问受保护接口**（把 `<token>` 换成 ① 里的）：

```bash
curl http://localhost:8080/api/user/info -H "Authorization: Bearer <token>"
```

预期返回（注意**没有 password 字段**）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "username": "zhangsan",
    "nickname": "张三",
    "avatar": null,
    "phone": null,
    "email": null
  }
}
```

**④ 不带 token 访问：**

```bash
curl http://localhost:8080/api/user/info
```

预期返回：`{"code":401,"message":"未登录或 token 已失效","data":null}`

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| JWT 三段结构、签名、无状态 | [Spring Security](/learn_backend/java/基础/Spring Security) |
| Spring Security 过滤器链、`SecurityFilterChain` | [Spring Security](/learn_backend/java/基础/Spring Security) |
| BCrypt 密码加密、盐 | [Spring Security](/learn_backend/java/基础/Spring Security) |
| Filter 和 Interceptor 的区别 | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| `@Valid` / `@NotBlank` 参数校验 | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| MyBatis-Plus `BaseMapper` / `@TableLogic` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| `AuthenticationManager` 自动装配 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| `user` 表查询、保留字 | [MySQL](/learn_database/MySQL) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 登录成功返回了 token：是 / 否
- [ ] 带 token 访问 `/api/user/info` 返回了用户信息（且不含 password）：是 / 否
- [ ] 不带 token / token 篡改后访问被 401 拦下：是 / 否
- [ ] 密码错误返回「用户名或密码错误」而不是 500：是 / 否
- [ ] 踩坑记录（依赖冲突、secret 太短、过滤器执行两次、SQL 报错等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. JWT 由哪三部分组成？为什么攻击者改了 payload 里的 `userId` 却没法伪装成别人登录？签名到底防的是什么？
2. JWT 无状态和传统 Session 有状态的核心区别是什么？为什么说无状态更适合微服务/水平扩容？无状态有什么代价（比如怎么主动登出、怎么「踢人下线」）？
3. `JwtAuthFilter` 为什么不能加 `@Component`？如果加了会发生什么现象？Filter 和 Interceptor 的区别是什么？
4. 为什么「用户不存在」和「密码错误」要返回同一句话？这防的是哪种攻击？BCrypt 为什么同一个密码每次密文都不一样？
5. 登录失败为什么不会被 `GlobalExceptionHandler` 兜底成 500？我在 `LoginController` 里把 `AuthenticationException` 转成 `BizException` 这一步，解决了什么问题？
