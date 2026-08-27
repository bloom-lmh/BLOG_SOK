# Day 04 · 登录认证与 RBAC 授权（JWT + Spring Security）

> **今天目标**：先用 Spring Security + JWT 完成无状态登录认证，再接上 RBAC 授权。最终跑通登录、当前用户信息，以及只有具备 `user:list` 权限才能访问的用户查询接口，并分清 401 与 403。

## 一、前置条件

- 已完成 Day 01（Maven 多模块 + `Result`/`ErrorCode`/`BizException`/`GlobalExceptionHandler`）
- 已完成 Day 02（`user`、`role`、`permission`、`user_role`、`role_permission` 表可用）
- 已完成 Day 03（用户服务：`User` 实体 + `UserMapper` + MapStruct + `DelegatingPasswordEncoder` + 注册/查询接口）
- MySQL 正在运行，`course_mall` 库里已有一个注册好的用户（没注册的话，看步骤 9 的手动插数据方式）

> 今天完成「认证 + 最小可用授权闭环」，不碰验证码、登出和刷新 token（那是 Day 05 的事）。

## 二、整体思路

登录和鉴权是两段独立的动作：

```
【登录（认证）】POST /api/user/login
  └─ AuthenticationManager.authenticate(username, password)
       └─ DaoAuthenticationProvider（Spring Security 自动装配）
            ├─ UserDetailsService.loadUserByUsername()  查库拿用户
            └─ PasswordEncoder.matches()                 根据 {bcrypt} 前缀选择算法并比对密码
  └─ 通过后 JwtUtil.generateToken() 签发 JWT，返回给前端

【后续请求（认证）】任意接口，带 Authorization: Bearer <token>
  └─ JwtAuthFilter 解析 token → 查用户及权限 → 把 Authentication 塞进 SecurityContext
       └─ Controller 通过 @AuthenticationPrincipal 拿到当前登录用户
  └─ 没带 / token 非法 → 401

【业务接口授权】例如 GET /api/user/{id}
  └─ @PreAuthorize("hasAuthority('user:list')")
       └─ 从 SecurityContext 的 Authentication.authorities 中查找 user:list
            ├─ 有权限 → 执行业务方法
            └─ 已登录但没权限 → 403
```

完成后你会新增这些文件：

```
E:\course-mall\mall-user\src\main\java\com\mall\user\
├─ MallUserApplication.java          # 加 @MapperScan（Day03 应已加）
├─ config/
│  ├─ PasswordConfig.java            # 沿用 Day03：DelegatingPasswordEncoder
│  └─ SecurityConfig.java            # 无状态、白名单、过滤器、方法授权
├─ advice/
│  └─ SecurityExceptionHandler.java  # 方法授权失败时统一返回 403
├─ controller/
│  └─ LoginController.java           # 登录 + 当前用户信息
├─ converter/
│  └─ UserConverter.java             # 沿用 Day03 的 MapStruct 转换器
├─ dto/
│  └─ LoginRequest.java              # 登录入参
├─ entity/
│  └─ User.java                      # user 表实体（Day03 已建，今天贴全）
├─ mapper/
│  ├─ UserMapper.java                # BaseMapper（Day03 已建）
│  └─ AuthorityMapper.java           # 按用户查询角色和权限
├─ security/
│  ├─ JwtAuthFilter.java             # JWT 过滤器（今天的核心）
│  ├─ LoginUser.java                 # UserDetails 实现
│  └─ UserDetailsServiceImpl.java    # 按用户名查用户
├─ util/
│  └─ JwtUtil.java                   # 签发 / 解析 JWT
└─ vo/
   ├─ LoginVO.java                   # 登录令牌响应
   └─ UserVO.java                    # 返回前端的用户信息（不含密码）

E:\course-mall\mall-user\src\main\resources\mapper\
└─ AuthorityMapper.xml               # RBAC 多表关联 SQL
```

## 三、步骤

### 步骤 1：补充依赖 + 配置

`mall-user/pom.xml` 只追加 Day04 新依赖，不要用另一份“完整 POM”覆盖 Day03 已有的
DevTools、MapStruct、Knife4j 等配置。

先在模块的 `properties` 中统一 JJWT 版本：

```xml
<properties>
    <!-- 保留 Day03 已有的 mp/mapstruct/knife4j 版本 -->
    <jjwt.version>0.12.6</jjwt.version>
</properties>
```

然后在 `dependencies` 末尾追加：

```xml
<!-- ==================== 第 3 次：Day04 登录认证与授权 ==================== -->

<!-- Spring Security：认证、授权和安全过滤器链；已包含 password crypto 模块 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>

<!-- JJWT API：编译期使用 -->
<dependency>
    <groupId>io.jsonwebtoken</groupId>
    <artifactId>jjwt-api</artifactId>
    <version>${jjwt.version}</version>
</dependency>

<!-- JJWT 实现与 Jackson 适配：只在运行时需要 -->
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
```

Day03 如果单独引入过 `spring-security-crypto`，现在可以删除它，因为
`spring-boot-starter-security` 已经传递包含该模块；重复声明不会增强安全性。

`application.yml` 保留 Day03 已有的数据源、i18n、日志和 Knife4j 配置，只追加：

```yaml
jwt:
  # 默认值仅方便本地学习；部署时必须通过环境变量覆盖，不能提交真实密钥
  # HS256 要求密钥至少 32 字节（256 位）
  secret: ${COURSE_MALL_JWT_SECRET:course-mall-dev-secret-key-at-least-32-bytes}
  expire-seconds: 7200
```

::: tip 💡 面试题：JWT 用的是什么签名算法？secret 为什么要至少 32 字节？
**一句话**：这里用 HS256（HMAC-SHA256），是一个「对称」签名算法——签发和校验用**同一把密钥**，所以密钥必须保密。HMAC 的安全下限要求密钥长度 ≥ 哈希输出长度（SHA256 = 256 位 = 32 字节），jjwt 对不够长的密钥直接抛 `WeakKeyException` 拒绝启动。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

### 步骤 2：`User` 实体 + `UserMapper`（复用 Day02 的表结构）

`User.java`（`com/mall/user/entity/User.java`，Day03 已建，这里贴全以保证今天代码自洽）：

```java
package com.mall.user.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
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

    private String password;       // 带 {bcrypt} 算法前缀的密码哈希，绝不存明文

    private String nickname;

    private String avatar;

    private String phone;

    private String email;

    private Integer status;        // 1启用 0禁用（登录时靠它判断账号是否可用）

    /**
     * Day02 使用 deleted_at：NULL 表示正常，删除后写入当前时间。
     */
    @TableField("deleted_at")
    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;

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
import java.time.Instant;
import java.util.Date;

@Component
public class JwtUtil {

    private final SecretKey key;
    private final long expireSeconds;

    public JwtUtil(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expire-seconds}") long expireSeconds) {
        // 启动时只转换一次；密钥太短会立即抛 WeakKeyException，尽早暴露配置错误。
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expireSeconds = expireSeconds;
    }

    // 签发 token：subject 放用户标识，username 放自定义 claim
    public String generateToken(Long userId, String username) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plusSeconds(expireSeconds);
        return Jwts.builder()
                .subject(String.valueOf(userId))   // sub：标准字段，放用户标识
                .claim("username", username)        // 自定义 claim，鉴权时读它
                .issuedAt(Date.from(issuedAt))      // iat：签发时间
                .expiration(Date.from(expiresAt))   // exp：过期时间
                .signWith(key)                      // 用 HMAC-SHA256 签名
                .compact();                          // 拼成 header.payload.signature 三段
    }

    // 解析并校验 token：签名不对 / 已过期会直接抛异常（JwtException）
    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(key)                    // 用同一把密钥校验签名
                .build()
                .parseSignedClaims(token)           // 校验签名 + 过期时间
                .getPayload();                       // 拿到 body（claims）
    }

    public long getExpireSeconds() {
        return expireSeconds;
    }
}
```

::: tip 💡 面试题：JWT 由哪三部分组成？为什么别人改不了里面的内容？
**一句话**：JWT = `header.payload.signature` 三段 Base64 拼起来。签名是把「header + payload」用服务端密钥算出来的 HMAC，别人改了 payload 任何一个字，重新算出来的签名就对不上，服务端一验就失败。所以 **JWT 的 payload 是「可读但不可篡改」的**——别把密码、身份证号这种敏感信息放里面。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

### 步骤 4：查出角色与权限，放进 `Authentication`

先记住认证和授权的分工：

- `UserDetailsService` 不只查账号密码，还要组装当前用户的权限集合。
- `LoginUser.getAuthorities()` 返回的内容最终会进入 `Authentication.authorities`。
- `@PreAuthorize` 不会自己查数据库，它只检查当前 `Authentication` 里的权限字符串。

本项目采用标准 RBAC 链路：

```text
user → user_role → role → role_permission → permission
                         │
                         ├─ 角色：ADMIN      → 存成 ROLE_ADMIN
                         └─ 权限：user:list  → 原样存成 user:list
```

#### 4.1 查询当前用户的全部 authority

`AuthorityMapper.java`（`com/mall/user/mapper/AuthorityMapper.java`）：

```java
package com.mall.user.mapper;

import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 用户授权信息查询。
 */
public interface AuthorityMapper {

    /**
     * 查询用户拥有的角色和操作权限。
     *
     * @param userId 用户 ID
     * @return Spring Security 可直接识别的 authority 字符串
     */
    List<String> selectAuthoritiesByUserId(@Param("userId") Long userId);
}
```

不用给接口加 `@Mapper`，因为启动类已有 `@MapperScan("com.mall.user.mapper")`。

`AuthorityMapper.xml`（`src/main/resources/mapper/AuthorityMapper.xml`）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper
        PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.mall.user.mapper.AuthorityMapper">

    <select id="selectAuthoritiesByUserId" resultType="java.lang.String">
        SELECT authority
        FROM (
            SELECT CONCAT('ROLE_', r.code) AS authority
            FROM user_role ur
            INNER JOIN `role` r ON r.id = ur.role_id
            WHERE ur.user_id = #{userId}
              AND r.status = 1

            UNION

            SELECT p.code AS authority
            FROM user_role ur
            INNER JOIN `role` r ON r.id = ur.role_id
            INNER JOIN role_permission rp ON rp.role_id = r.id
            INNER JOIN permission p ON p.id = rp.permission_id
            WHERE ur.user_id = #{userId}
              AND r.status = 1
        ) authorities
        ORDER BY authority
    </select>

</mapper>
```

`UNION` 会自动去重。角色编码统一补 `ROLE_` 前缀，是因为 `hasRole('ADMIN')` 实际检查的是 `ROLE_ADMIN`；权限编码 `user:list` 则原样保留，交给 `hasAuthority('user:list')` 检查。

#### 4.2 让 `LoginUser` 持有权限

`LoginUser.java`（`com/mall/user/security/LoginUser.java`）：

```java
package com.mall.user.security;

import com.mall.user.entity.User;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

/**
 * Spring Security 使用的当前登录用户。
 */
@Getter
@RequiredArgsConstructor
public class LoginUser implements UserDetails {

    private final User user;
    private final List<GrantedAuthority> authorities;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return authorities;
    }

    @Override
    public String getPassword() {
        return user.getPassword();
    }

    @Override
    public String getUsername() {
        return user.getUsername();
    }

    public Long getId() {
        return user.getId();
    }

    // 下面四个钩子会被 DaoAuthenticationProvider 用来判断账号能否登录。
    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        // status=0 表示禁用；返回 false 时认证阶段会抛 DisabledException。
        return user.getStatus() == null || user.getStatus() == 1;
    }
}
```

这里去掉 `@Setter`，改成构造时一次性传入用户和权限。登录身份不应该在请求处理中被随意修改。

#### 4.3 查用户时一起组装权限

`UserDetailsServiceImpl.java`（`com/mall/user/security/UserDetailsServiceImpl.java`）：

```java
package com.mall.user.security;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.result.ErrorCode;
import com.mall.user.entity.User;
import com.mall.user.mapper.AuthorityMapper;
import com.mall.user.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UserMapper userMapper;
    private final AuthorityMapper authorityMapper;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userMapper.selectOne(
                new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (user == null) {
            // 认证失败最终统一映射为 BAD_CREDENTIALS，避免泄露用户名是否存在。
            throw new UsernameNotFoundException(ErrorCode.USER_NOT_FOUND.getMessageKey());
        }

        // 数据库里的字符串必须包装成 GrantedAuthority，Spring Security 才能进行授权判断。
        List<GrantedAuthority> authorities = authorityMapper
                .selectAuthoritiesByUserId(user.getId())
                .stream()
                .map(SimpleGrantedAuthority::new)
                .toList();

        return new LoginUser(user, authorities);
    }
}
```

登录时会调用一次这个方法；之后每个携带 JWT 的请求，`JwtAuthFilter` 也会调用一次。因此角色或权限在数据库里被修改后，用户不用重新登录，下一个请求就会生效。代价是每次请求多查一次数据库，后续可用 Redis 缓存权限。

::: tip 💡 面试题：`DelegatingPasswordEncoder` 默认生成的 BCrypt 哈希为什么每次都不一样？
**一句话**：`DelegatingPasswordEncoder` 当前默认委托 BCrypt；BCrypt 每次都会**随机生成盐（salt）**参与哈希，所以相同明文结果也不同。存储值中的 `{bcrypt}` 负责选择算法，后面的 BCrypt 哈希自带盐，校验时可重新计算。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

### 步骤 5：`JwtAuthFilter`——每个请求验 token 的「拦截器」

`JwtAuthFilter.java`（`com/mall/user/security/JwtAuthFilter.java`）：

```java
package com.mall.user.security;

import com.mall.common.result.ErrorCode;
import com.mall.user.util.JwtUtil;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.AccountStatusException;
import org.springframework.security.authentication.AccountStatusUserDetailsChecker;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

// 注意：这里故意不加 @Component（原因见下方 tip）
// OncePerRequestFilter：保证单个请求只执行一次过滤，防止在转发/包含场景下重复执行
public class JwtAuthFilter extends OncePerRequestFilter {

    public static final String JWT_ERROR_ATTRIBUTE =
            JwtAuthFilter.class.getName() + ".error";
    private static final AccountStatusUserDetailsChecker ACCOUNT_STATUS_CHECKER =
            new AccountStatusUserDetailsChecker();

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

        // 上游认证机制已经建立身份时，不重复解析和查库。
        if (SecurityContextHolder.getContext().getAuthentication() != null) {
            filterChain.doFilter(request, response);
            return;
        }

        Claims claims;
        try {
            // 2. 只捕获 JWT 解析错误，不能把数据库故障等系统异常也伪装成 401。
            claims = jwtUtil.parseToken(header.substring(7));
        } catch (ExpiredJwtException e) {
            request.setAttribute(JWT_ERROR_ATTRIBUTE, ErrorCode.TOKEN_EXPIRED);
            filterChain.doFilter(request, response);
            return;
        } catch (JwtException | IllegalArgumentException e) {
            request.setAttribute(JWT_ERROR_ATTRIBUTE, ErrorCode.TOKEN_INVALID);
            filterChain.doFilter(request, response);
            return;
        }

        String username = claims.get("username", String.class);
        if (!StringUtils.hasText(username)) {
            request.setAttribute(JWT_ERROR_ATTRIBUTE, ErrorCode.TOKEN_INVALID);
            filterChain.doFilter(request, response);
            return;
        }

        UserDetails userDetails;
        try {
            // 每次请求查用户和权限：账号禁用、角色变更可在下一次请求立即生效。
            userDetails = userDetailsService.loadUserByUsername(username);
        } catch (UsernameNotFoundException e) {
            request.setAttribute(JWT_ERROR_ATTRIBUTE, ErrorCode.TOKEN_INVALID);
            filterChain.doFilter(request, response);
            return;
        }

        try {
            // JWT 请求不会经过 DaoAuthenticationProvider，四个账号状态钩子要在这里主动检查。
            ACCOUNT_STATUS_CHECKER.check(userDetails);
        } catch (DisabledException e) {
            request.setAttribute(
                    JWT_ERROR_ATTRIBUTE,
                    ErrorCode.ACCOUNT_DISABLED);
            filterChain.doFilter(request, response);
            return;
        } catch (AccountStatusException e) {
            request.setAttribute(
                    JWT_ERROR_ATTRIBUTE,
                    ErrorCode.UNAUTHORIZED);
            filterChain.doFilter(request, response);
            return;
        }

        // 3. 三参数构造器表示“已认证”，第三个参数就是后续授权使用的权限集合。
        UsernamePasswordAuthenticationToken authToken =
                new UsernamePasswordAuthenticationToken(
                        userDetails,
                        null,
                        userDetails.getAuthorities());
        authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
        SecurityContextHolder.getContext().setAuthentication(authToken);

        filterChain.doFilter(request, response);
    }
}
```

这里故意不使用 `catch (Exception)`。如果 MySQL/Redis 故障也被吞掉，客户端只会看到
“token 无效”，真正的系统故障既难排查又会被错误分类；只处理预期的 JWT 和用户不存在异常即可。

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
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.user.security.JwtAuthFilter;
import com.mall.user.util.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.MessageSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.servlet.LocaleResolver;

import java.io.IOException;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity   // 开启 @PreAuthorize / @PostAuthorize，默认 prePostEnabled=true
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;
    private final ObjectMapper objectMapper;
    private final MessageSource messageSource;
    private final LocaleResolver localeResolver;

    // PasswordEncoder Bean 已由 Day03 的 PasswordConfig 提供。
    // DaoAuthenticationProvider 会自动找到它，并按数据库里的 {bcrypt} 前缀完成密码比对。

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
                // 登录、注册和开发期接口文档不需要 token；生产环境应关闭或保护文档地址
                .requestMatchers(
                        "/api/user/login",
                        "/api/user/register",
                        "/doc.html",
                        "/webjars/**",
                        "/v3/api-docs/**",
                        "/swagger-ui/**",
                        "/favicon.ico")
                .permitAll()
                // URL 层先做粗粒度限制；具体业务权限再由 @PreAuthorize 判断
                .anyRequest().authenticated())
            // 认证失败 / 权限不足时返回统一 JSON（而不是 Spring Security 默认的 403 空白页）
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, e) -> {
                    // JwtAuthFilter 会标记“过期”或“非法”；没有标记就是普通未登录。
                    ErrorCode errorCode =
                            request.getAttribute(JwtAuthFilter.JWT_ERROR_ATTRIBUTE) instanceof ErrorCode jwtError
                                    ? jwtError
                                    : ErrorCode.UNAUTHORIZED;
                    writeJson(request, response, errorCode);
                })
                .accessDeniedHandler((request, response, e) ->
                        writeJson(request, response, ErrorCode.FORBIDDEN)))
            // 把 JWT 过滤器插到「用户名密码过滤器」之前：先解析 token 再走认证
            // 用 new 创建（不注册成 Bean），避免 Spring Boot 把它自动注册成 servlet filter 执行两次
            .addFilterBefore(new JwtAuthFilter(jwtUtil, userDetailsService), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /**
     * Security 过滤器发生在 Spring MVC 之前，手写响应不会经过 ResultMessageAdvice，
     * 因此这里必须主动按 Accept-Language 解析消息键。
     */
    private void writeJson(
            HttpServletRequest request,
            HttpServletResponse response,
            ErrorCode errorCode) throws IOException {
        String message = messageSource.getMessage(
                errorCode.getMessageKey(),
                null,
                errorCode.getMessageKey(),
                localeResolver.resolveLocale(request));

        // 当前项目约定 HTTP 200 + 业务码；若改用 REST 状态码，可改为 errorCode.getHttpStatus()。
        response.setStatus(200);
        response.setContentType("application/json;charset=UTF-8");
        objectMapper.writeValue(
                response.getWriter(),
                Result.fail(errorCode.getCode(), message));
    }
}
```

这里不能只写 `Result.fail(ErrorCode.UNAUTHORIZED)` 后交给 `ObjectMapper`。因为
`AuthenticationEntryPoint` 和 `AccessDeniedHandler` 位于 Security 过滤器链，
响应在进入 `DispatcherServlet` 前就已经写出，MVC 的 `ResultMessageAdvice` 根本不会执行。
所以这个边界要用 `LocaleResolver + MessageSource` 主动翻译，并复用 Spring 容器中的
`ObjectMapper`，不要每次 `new ObjectMapper()`。

::: tip 💡 面试题：为什么 JWT 无状态登录要关掉 CSRF 防护？
**一句话**：CSRF 攻击利用的是「浏览器会自动带上 Cookie」这个特性——攻击者诱导用户点一个链接，浏览器就带着登录 Cookie 发出恶意请求。而 JWT 放在 `Authorization` 请求头里，**不依赖 Cookie**，攻击者伪造不出这个头，所以 CSRF 防护可以安全关闭。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

::: tip 💡 面试题：`SessionCreationPolicy.STATELESS` 到底做了什么？
**一句话**：它告诉 Spring Security「不要创建、也不要使用 HttpSession 来存登录态」。传统登录成功后，Spring Security 会把认证信息存进 Session；设为 STATELESS 后，每个请求都从零开始认证（靠我们的 JwtAuthFilter 从 token 还原身份），这样服务端才真正「无状态」，方便后面水平扩容、多实例部署。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

### 步骤 7：开启方法授权，并给真实接口加权限

到这里，`Authentication` 已经同时包含身份和权限，但还差最后一步：告诉 Spring Security 在调用业务方法前检查权限。

`SecurityConfig` 上一步加入的：

```java
@EnableMethodSecurity
```

会开启 `@PreAuthorize`。现在修改 Day03 的 `UserController#getById`，让“按 ID 查询用户”只有具备 `user:list` 权限的人能调用：

```java
import org.springframework.security.access.prepost.PreAuthorize;

// 省略类上的其他代码

@Operation(summary = "按 ID 查询用户")
@PreAuthorize("hasAuthority('user:list')")
@GetMapping("/{id}")
public Result<UserVO> getById(
        @Parameter(description = "用户 ID", example = "1")
        @PathVariable("id") Long id) {
    return Result.ok(userService.getById(id));
}
```

执行顺序是：

```text
请求 → JwtAuthFilter 恢复 Authentication
     → URL 规则 anyRequest().authenticated()：先确认已经登录
     → @PreAuthorize：再检查 authorities 中有没有 user:list
          ├─ 有：执行 getById()
          └─ 没有：抛 AccessDeniedException，返回 403
```

常用表达式先掌握这几个：

| 写法 | 含义 |
|---|---|
| `isAuthenticated()` | 只要求已登录 |
| `hasAuthority('user:list')` | 必须有一个精确权限 |
| `hasAnyAuthority('course:create', 'course:edit')` | 任意一个权限即可 |
| `hasRole('ADMIN')` | 检查 `ROLE_ADMIN`，Spring 会自动补 `ROLE_` |
| `hasAnyRole('ADMIN', 'OPERATOR')` | 任意一个角色即可 |

业务接口优先检查细粒度权限，例如 `course:create`；`hasRole` 更适合“仅管理员入口”这种粗粒度规则。老师只能修改自己的课程属于**数据权限**，不能只靠一个静态权限字符串，后面应在 Service 中继续校验课程归属。

#### 方法授权失败为什么还要单独处理？

`SecurityConfig.accessDeniedHandler` 负责过滤器链中的 URL 授权失败。但 `@PreAuthorize` 是在 MVC 方法调用阶段抛出异常；项目里的通用 `GlobalExceptionHandler` 又有 `Exception.class` 兜底，不单独处理时可能把 403 当成 500。

新增 `SecurityExceptionHandler.java`（`com/mall/user/advice/SecurityExceptionHandler.java`）：

```java
package com.mall.user.advice;

import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 处理 MVC 方法授权阶段抛出的安全异常。
 */
@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice
public class SecurityExceptionHandler {

    /**
     * 已认证但权限不足，统一返回 403。
     *
     * @param e 权限不足异常
     * @return 统一失败响应
     */
    @ExceptionHandler(AccessDeniedException.class)
    public Result<Void> handleAccessDenied(AccessDeniedException e) {
        // 这里位于 Spring MVC 内部，会继续经过 ResultMessageAdvice，因此保留消息键即可。
        return Result.fail(ErrorCode.FORBIDDEN);
    }
}
```

`@Order(HIGHEST_PRECEDENCE)` 保证它先于通用异常处理器匹配 `AccessDeniedException`。

::: tip 💡 认证和授权到底是什么关系？
**认证（Authentication）**回答“你是谁”，失败通常是 401；**授权（Authorization）**回答“你能做什么”，已经登录但权限不足是 403。两者最终都围绕 `SecurityContextHolder` 中的 `Authentication`：`principal` 是身份，`authorities` 是权限。
:::

### 步骤 8：登录接口 + 当前用户信息接口

`LoginRequest.java`（`com/mall/user/dto/LoginRequest.java`）：

```java
package com.mall.user.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class LoginRequest {

    @NotBlank(message = "{validation.user.username.not-blank}")
    private String username;

    @NotBlank(message = "{validation.user.password.not-blank}")
    private String password;
}
```

`LoginVO.java`（`com/mall/user/vo/LoginVO.java`）：

```java
package com.mall.user.vo;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 登录成功响应。
 */
@Getter
@AllArgsConstructor
public class LoginVO {
    private String accessToken;
    private String tokenType;
    private Long expiresIn;
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
import com.mall.user.converter.UserConverter;
import com.mall.user.dto.LoginRequest;
import com.mall.user.security.LoginUser;
import com.mall.user.util.JwtUtil;
import com.mall.user.vo.LoginVO;
import com.mall.user.vo.UserVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
public class LoginController {

    private final AuthenticationManager authenticationManager;
    private final JwtUtil jwtUtil;
    private final UserConverter userConverter;

    @PostMapping("/login")
    public Result<LoginVO> login(@Valid @RequestBody LoginRequest req) {
        Authentication authentication;
        try {
            // 交给 Spring Security：查用户 + PasswordEncoder 根据 {bcrypt} 前缀比对 + 检查状态
            authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(req.getUsername(), req.getPassword()));
        } catch (DisabledException e) {
            throw new BizException(ErrorCode.ACCOUNT_DISABLED);
        } catch (AuthenticationException e) {
            // 密码错 / 用户不存在都落到这里（Spring Security 默认把「用户不存在」也包装成 BadCredentialsException）
            throw new BizException(ErrorCode.BAD_CREDENTIALS);
        }

        LoginUser loginUser = (LoginUser) authentication.getPrincipal();
        String token = jwtUtil.generateToken(loginUser.getId(), loginUser.getUsername());

        return Result.ok(new LoginVO(
                token,
                "Bearer",
                jwtUtil.getExpireSeconds()));
    }

    // 受保护接口：必须带 Authorization: Bearer <token> 才能进到这里
    @GetMapping("/info")
    public Result<UserVO> info(@AuthenticationPrincipal LoginUser loginUser) {
        // @AuthenticationPrincipal 直接把 SecurityContext 里的 principal 注入成 LoginUser，省去手动转型
        // 沿用 Day03 的 MapStruct 转换器，不使用运行时反射，也不会映射 password
        return Result.ok(userConverter.toVO(loginUser.getUser()));
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
**一句话**：`User` 里有 `password`（哪怕是不可逆哈希也是敏感信息），直接返回仍会泄露认证材料。VO 只暴露允许返回的字段，MapStruct 在编译期完成安全映射，把存储模型和对外视图解耦。详见 [Spring MVC](/learn_backend/java/基础/Spring MVC)。
:::

### 步骤 9：启动验证

**先准备一个测试用户。** 如果 Day03 的注册接口已就绪，直接注册：

```bash
curl -X POST http://localhost:8080/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"123456","nickname":"张三"}'
```

否则手动生成一个带算法前缀的密码哈希再插入（写个临时 `main` 打印后删掉）：

```java
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;

public class Temp {
    public static void main(String[] args) {
        PasswordEncoder encoder = PasswordEncoderFactories.createDelegatingPasswordEncoder();
        System.out.println(encoder.encode("123456")); // 输出以 {bcrypt} 开头
    }
}
```

```sql
INSERT INTO `user` (`username`, `password`, `nickname`, `status`)
VALUES ('zhangsan', '<把上面打印的密文贴到这里>', '张三', 1);
```

Day02 已插入角色和权限基础数据，但还没有建立关联。先让 `ADMIN` 角色拥有全部权限：

```sql
INSERT IGNORE INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM `role` r
CROSS JOIN permission p
WHERE r.code = 'ADMIN';
```

这里只配置“角色拥有什么权限”，**暂时不要**给 `zhangsan` 分配角色，先用他验证一次 403。生产项目也绝不能让注册用户自动成为管理员。

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

预期返回（`accessToken` 是一长串，后面要用）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwidXNlcm5hbWUiOiJ6aGFuZ3NhbiJ9.xxx",
    "tokenType": "Bearer",
    "expiresIn": 7200
  }
}
```

**② 密码错，验证认证失败：**

```bash
curl -X POST http://localhost:8080/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"wrong"}'
```

预期返回：`{"code":401,"message":"用户名或密码错误","data":null}`

**③ 带 token 访问只要求登录的接口**（把 `<token>` 换成 ① 里的）：

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

**④ 不带 token 访问，验证 401：**

```bash
curl http://localhost:8080/api/user/info
```

默认中文预期：`{"code":401,"message":"未登录或登录状态已失效","data":null}`

再验证 Security 过滤器响应也能国际化：

```bash
curl http://localhost:8080/api/user/info -H "Accept-Language: en"
```

预期 `message` 为 `Authentication is required or has expired`。如果返回
`auth.unauthorized`，说明你仍然只序列化了消息键，没有在过滤器边界主动调用
`MessageSource`。

**⑤ 已登录但没有 `user:list`，验证 403：**

```bash
curl http://localhost:8080/api/user/1 -H "Authorization: Bearer <token>"
```

预期返回：`{"code":403,"message":"无权限","data":null}`。这说明 JWT 已经通过，失败发生在授权阶段。

**⑥ 给用户分配 ADMIN，再用同一个 token 访问：**

```sql
INSERT IGNORE INTO user_role (user_id, role_id)
SELECT u.id, r.id
FROM `user` u
CROSS JOIN `role` r
WHERE u.username = 'zhangsan'
  AND r.code = 'ADMIN';
```

```bash
curl http://localhost:8080/api/user/1 -H "Authorization: Bearer <token>"
```

预期返回用户信息，业务码为 200。这里**不需要重新登录**：当前实现会在每个 JWT 请求中重新调用 `UserDetailsService`，从数据库加载最新权限。

最终闭环是：

```text
数据库角色/权限
  → AuthorityMapper 查询字符串
  → SimpleGrantedAuthority
  → LoginUser.getAuthorities()
  → Authentication.authorities
  → @PreAuthorize 判断
```

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| JWT 三段结构、签名、无状态 | [Spring Security](/learn_backend/java/基础/Spring Security) |
| Spring Security 过滤器链、`SecurityFilterChain` | [Spring Security](/learn_backend/java/基础/Spring Security) |
| RBAC、`GrantedAuthority`、`@EnableMethodSecurity`、`@PreAuthorize` | [Spring Security](/learn_backend/java/基础/Spring Security) |
| 认证 401 与授权 403 的区别 | [Spring Security](/learn_backend/java/基础/Spring Security) |
| `DelegatingPasswordEncoder`、BCrypt 哈希与盐 | [Spring Security](/learn_backend/java/基础/Spring Security) |
| Filter 和 Interceptor 的区别 | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| `@Valid` / `@NotBlank` 参数校验 | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| MapStruct 的 Entity → VO 安全映射 | [MapStruct](/learn_backend/java/工具/MapStruct) |
| MyBatis-Plus `BaseMapper` / `@TableLogic` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| `AuthenticationManager` 自动装配 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| `user` 表查询、保留字 | [MySQL](/learn_database/MySQL) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 登录成功返回了 accessToken：是 / 否
- [ ] 带 token 访问 `/api/user/info` 返回了用户信息（且不含 password）：是 / 否
- [ ] 不带 token / token 篡改后访问被 401 拦下：是 / 否
- [ ] 已登录但没有 `user:list` 时，`/api/user/{id}` 返回 403：是 / 否
- [ ] 分配 ADMIN 后，用同一个 token 访问 `/api/user/{id}` 成功：是 / 否
- [ ] 能在调试器里看到 `Authentication.authorities` 同时包含 `ROLE_ADMIN` 和权限编码：是 / 否
- [ ] 密码错误返回「用户名或密码错误」而不是 500：是 / 否
- [ ] Security 的 401/403 响应能根据 `Accept-Language` 返回中英文：是 / 否
- [ ] 踩坑记录（依赖冲突、secret 太短、过滤器执行两次、SQL 报错等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. JWT 由哪三部分组成？为什么攻击者改了 payload 里的 `userId` 却没法伪装成别人登录？签名到底防的是什么？
2. JWT 无状态和传统 Session 有状态的核心区别是什么？为什么说无状态更适合微服务/水平扩容？无状态有什么代价（比如怎么主动登出、怎么「踢人下线」）？
3. 认证和授权有什么区别？为什么没登录是 401，而登录后权限不足是 403？
4. `hasRole('ADMIN')` 为什么查找的是 `ROLE_ADMIN`？它和 `hasAuthority('user:list')` 有什么区别？
5. `@PreAuthorize` 从哪里拿权限？为什么只把权限查出来却不放进 `Authentication`，注解仍然不会生效？
