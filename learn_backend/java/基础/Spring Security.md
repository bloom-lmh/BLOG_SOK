# Spring Security

> **一句话定位**：Spring Security 是 Spring 官方出品的安全框架，用**一串 Servlet 过滤器链**统一解决 Web 应用的「**认证**（Authentication，你是谁）与「**授权**（Authorization，你能干什么）」两大横切安全问题，同时内置了密码加密、CSRF 防护、会话管理、方法级权限等一整套开箱即用的安全能力。

它解决的核心痛点：几乎每个后端项目都要写登录校验、会话维护、密码加密、URL 拦截、防 XSS/CSRF 攻击，这些代码高度重复、极易写出漏洞；Spring Security 把这些沉淀成一套**可插拔、可组合、可深度定制**的安全过滤体系，让开发者把精力集中在业务本身，安全边界交给框架统一兜底。

---

## 基础篇

### 1. 背景：没有安全框架时，项目是怎么「裸奔」的？

在引入 Spring Security 之前，一个典型的 Web 项目通常靠**手写拦截器 + 自定义注解 + 工具类**来拼安全逻辑：

```
浏览器 ──请求──> 登录拦截器（手写校验 Session/Token）
                        │
                        ├─ 没登录？ ──> 重定向到 /login 或返回 401
                        │
                        ├─ 登录了？ ──> 手写权限判断（查角色表、拼 SQL）
                        │
                        └─ 通过？ ──> Controller 业务
```

这种「土办法」的问题非常明显：

| 问题 | 表现 | 后果 |
| --- | --- | --- |
| **重复造轮子** | 每个项目、每个模块都写一遍登录/拦截逻辑 | 代码冗余、风格不一 |
| **容易有漏洞** | 密码明文存库、用 MD5 加密、URL 直接拼接用户 id | 拖库、越权、暴力破解 |
| **横切逻辑散落** | 权限判断散落在 Controller / Service / Mapper 各处 | 改一处漏一处 |
| **攻击面没人管** | CSRF、XSS、Session 固定攻击没有统一防护 | 被黑还不自知 |

Spring Security 的思路就是把「安全」从业务代码里**剥离出来**，放到一个独立的过滤器链里统一处理——业务代码只需关注「我要做什么」，而「谁有资格做」交给框架。

### 2. 认证 vs 授权：安全的两条主线

这是理解整个框架的入口，必须先把这两个词分清楚。

| 概念 | 英文 | 回答的问题 | 典型动作 | 例子 |
| --- | --- | --- | --- | --- |
| 认证 | Authentication | 你是谁？ | 登录、验证凭证 | 输入账号密码登录 |
| 授权 | Authorization | 你能干什么？ | 权限校验、访问控制 | 普通用户不能访问 `/admin/**` |

**执行顺序**：一定是**先认证、后授权**——因为你得先确认「你是谁」，才能知道「你能干什么」。

::: tip 💡 面试题：认证（Authentication）和授权（Authorization）有什么区别？
认证是确认身份（登录），授权是确认权限（能访问什么资源）。顺序上先认证后授权，因为得先知道你是谁，才能判断你能干什么。认证失败通常返回 401（未认证），授权失败返回 403（已认证但无权限）。
:::

### 3. 核心组件：一张图看懂框架的「角色分工」

Spring Security 由一组高度解耦的接口与类组成，先记住这些「主角」，后面所有流程都是它们之间的协作。

| 组件 | 类型 | 作用 |
| --- | --- | --- |
| `SecurityContext` | 接口 | 安全上下文容器，保存当前登录用户的 `Authentication` |
| `SecurityContextHolder` | 工具类 | 持有 `SecurityContext`，**默认用 `ThreadLocal` 存储**，保证线程隔离 |
| `Authentication` | 接口 | 认证对象，封装**身份（principal）+ 凭证（credentials）+ 权限（authorities）** |
| `UserDetails` | 接口 | 框架认识的标准用户模型，从数据库查出的用户要转成它 |
| `UserDetailsService` | 接口 | 只做一件事：**根据用户名加载用户**，认证时被调用 |
| `AuthenticationManager` | 接口 | 认证入口，真正干活的是它的实现 `ProviderManager` |
| `AuthenticationProvider` | 接口 | 具体认证策略，如 `DaoAuthenticationProvider`（查库认证） |
| `PasswordEncoder` | 接口 | 密码加密与比对（`encode` / `matches`） |
| `GrantedAuthority` | 接口 | 权限项，如 `ROLE_ADMIN`、`order:read` |
| `FilterChainProxy` | 类 | 安全过滤器链的**总入口**，把多个 `SecurityFilterChain` 串起来 |
| `SecurityFilterChain` | 接口 | 一条具体的过滤器链（可配置多条，如 API 链 + 页面链） |

它们之间的「三角关系」如下：

```
UserDetailsService（查用户）
        │  返回
        ▼
UserDetails（用户名/密码/权限）  <── 数据库 User 实体转换而来
        │
        │ 交给
        ▼
DaoAuthenticationProvider（认证提供者）
        │  1. 调 UserDetailsService 查用户
        │  2. 调 PasswordEncoder.matches 比对密码
        │  3. 成功则组装 Authentication
        ▼
Authentication（认证对象）
        │  放入
        ▼
SecurityContext ──> SecurityContextHolder（ThreadLocal）
        │  授权时从这里取
        ▼
FilterSecurityInterceptor / AuthorizationFilter（授权判断）
```

### 4. 快速入门：最小可运行的 Spring Security 工程

**第一步：引入依赖**（Spring Boot 3.x 对应 Spring Security 6.x）：

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
```

只要引入这个 starter，**无需任何配置**，Spring Security 就已经接管了所有请求：

- 默认所有请求都要登录（HTTP Basic + 表单登录）
- 启动时在控制台打印一个**随机生成的临时密码**：`Using generated security password: 8a3f...`
- 默认用户名是 `user`

**第二步：写一个最简单的控制器**验证：

```java
@RestController
public class HelloController {
    @GetMapping("/hello")
    public String hello() {
        return "hello, 你已通过认证";
    }
}
```

此时访问 `http://localhost:8080/hello`，会被重定向到默认登录页 `/login`，输入 `user` + 控制台密码即可访问。这就是 Spring Security「默认即安全」的体现——**不写任何代码，先保证你不裸奔**。

### 5. 从数据库加载用户：`UserDetailsService` 实战

默认的 `user/随机密码` 只是演示用，真实项目必须从数据库查用户。核心就是实现 `UserDetailsService.loadUserByUsername`。

```java
@Service
public class UserDetailsServiceImpl implements UserDetailsService {

    private final UserMapper userMapper;

    public UserDetailsServiceImpl(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        // 1. 从数据库按用户名查用户（可以是 MySQL / Redis / 任意来源）
        User user = userMapper.selectByUsername(username);
        if (user == null) {
            // 2. 查不到必须抛这个异常，框架会翻译成「登录失败」
            throw new UsernameNotFoundException("用户不存在: " + username);
        }
        // 3. 把业务实体转成框架认识的 UserDetails
        //    为什么用 Security 的 User.builder：
        //    框架后续的密码比对、权限判断都只认 UserDetails，
        //    roles("USER") 会自动在内部转成权限字符串 ROLE_USER
        return org.springframework.security.core.userdetails.User
                .withUsername(user.getUsername())
                .password(user.getPassword())   // 必须是 BCrypt 加密后的密文
                .roles(user.getRole())          // 如 "USER" / "ADMIN"
                .disabled(!user.isEnabled())    // 账号是否启用
                .build();
    }
}
```

**关键规则**（这些点面试和踩坑都高频）：

1. `password` 字段必须存的是**加密后的密文**，不能存明文；否则登录时 `PasswordEncoder.matches` 比对失败。
2. `roles("USER")` 内部会自动加前缀变成 `ROLE_USER`；而 `authorities("USER")` 则**原样保留**，不加前缀。这是新手最常见的困惑点。
3. `loadUserByUsername` 只负责「**查**用户」，**不负责比对密码**——比对由框架的 `DaoAuthenticationProvider` 调用 `PasswordEncoder.matches` 完成。

### 6. 密码加密：BCrypt 为什么是默认选择

Spring Security 要求密码必须加密存储，最常用的是 `BCryptPasswordEncoder`。

```java
@Configuration
public class PasswordConfig {
    @Bean
    public PasswordEncoder passwordEncoder() {
        // 为什么用 BCrypt：
        // 1. 自带随机盐（每次加密盐都不同，同样的密码密文也不同）
        // 2. 慢哈希（可调 cost，故意拖慢暴力破解速度）
        return new BCryptPasswordEncoder();
    }
}
```

**注册时加密、登录时自动比对**：

```java
@Service
public class UserService {
    private final PasswordEncoder passwordEncoder;

    public UserService(PasswordEncoder passwordEncoder) {
        this.passwordEncoder = passwordEncoder;
    }

    public void register(String username, String rawPassword) {
        // 注册：明文 → 密文，存库
        String encoded = passwordEncoder.encode(rawPassword);
        // 注意：两次 encode 同一个密码，密文完全不同（因为盐随机）
        userMapper.insert(username, encoded);
    }
}
```

```java
// 登录时你根本不用手动比对，框架自动做：
boolean ok = passwordEncoder.matches("123456", encoded); // true
// 为什么不用 decode：BCrypt 是单向散列，无法解密，
// matches 内部是用「明文 + 存储的盐」重新算一遍再比对
```

::: tip 💡 面试题：密码为什么不能用 MD5，而要用 BCrypt？
MD5 是快速哈希且无盐（或不安全加盐），彩虹表可以瞬间反查出常见密码；BCrypt 内置**随机盐 + 慢哈希**（cost 可调，如 cost=10 意味着 2^10 次迭代），能把暴力破解速度拖慢几个数量级。所以现代系统默认 BCrypt（更高要求可用 Argon2）。
:::

### 7. 过滤器链：Spring Security 的「真身」

Spring Security 在底层**并不是一个 Controller 或 Interceptor**，而是一串标准的 **Servlet Filter**。请求进入应用后，先经过这一串过滤器，最后才到达真正的业务 `DispatcherServlet`。

```
浏览器请求
   │
   ▼
┌─────────────────────────────────────────────────────┐
│  FilterChainProxy（过滤器链总入口）                    │
│                                                      │
│  请求 ──> SecurityContextHolderFilter（准备上下文）    │
│       ──> HeaderWriterFilter（安全响应头）             │
│       ──> CsrfFilter（CSRF 校验）                     │
│       ──> LogoutFilter（处理退出）                     │
│       ──> UsernamePasswordAuthenticationFilter（认证） │
│       ──> BasicAuthenticationFilter（HTTP Basic 认证）│
│       ──> AnonymousAuthenticationFilter（匿名兜底）    │
│       ──> ExceptionTranslationFilter（异常翻译）       │
│       ──> AuthorizationFilter（授权校验）              │
│                                                      │
│   任何一个过滤器「不同意」就中断，返回 401/403 或重定向 │
└─────────────────────────────────────────────────────┘
   │
   ▼
DispatcherServlet（真正业务 Controller）
```

只需先记住三个**最重要的过滤器**：

| 过滤器 | 职责 | 失败表现 |
| --- | --- | --- |
| `UsernamePasswordAuthenticationFilter` | 处理 `/login` 表单登录，完成**认证** | 认证失败重定向回登录页 |
| `AuthorizationFilter`（旧版 `FilterSecurityInterceptor`） | 根据 URL 规则判断是否放行，完成**授权** | 未认证 → 401，无权限 → 403 |
| `ExceptionTranslationFilter` | 把认证/授权异常翻译成响应（重定向或错误码） | 决定返回 401 还是 403 |

### 8. 基础篇小结

- Spring Security = **过滤器链 + 一组核心接口**，本质是「认证 + 授权」两条主线。
- 认证靠 `UserDetailsService` 查用户 + `PasswordEncoder` 比密码；授权靠 `AuthorizationFilter` 按 URL 规则拦截。
- 默认配置「即安全」，但真实项目必须重写 `UserDetailsService`、配置密码加密与访问规则。
- 用户信息全程通过 `SecurityContextHolder`（`ThreadLocal`）传递，业务代码随时可取当前登录人。

---

## 高级篇

### 1. `SecurityFilterChain`：Spring Security 6 的现代化配置

Spring Security 6 全面拥抱**基于 Lambda 的 `SecurityFilterChain` Bean 配置**（废弃了旧的 `WebSecurityConfigurerAdapter`）。这是项目里最核心的一段配置。

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // 1. 关闭 CSRF（前后端分离 + 无状态 token 时通常关闭，见后文专门讲解）
            .csrf(csrf -> csrf.disable())
            // 2. 授权规则：从上往下匹配，命中即止
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/login", "/register", "/public/**", "/error").permitAll()  // 白名单
                .requestMatchers("/admin/**").hasRole("ADMIN")   // 只有 ROLE_ADMIN 能访问
                .requestMatchers("/api/order/**").hasAuthority("order:read")  // 有该权限即可
                .requestMatchers(HttpMethod.POST, "/goods").hasAuthority("goods:write") // 限定请求方法
                .anyRequest().authenticated()                    // 其余都要登录
            )
            // 3. 表单登录配置
            .formLogin(form -> form
                .loginPage("/login.html")          // 自定义登录页
                .loginProcessingUrl("/doLogin")    // 表单提交地址（POST 用户名密码）
                .usernameParameter("username")     // 表单字段名（默认就是 username）
                .passwordParameter("password")
                .defaultSuccessUrl("/index")       // 登录成功默认跳转
                .successHandler(customSuccessHandler)   // 前后端分离：成功返回 JSON
                .failureHandler(customFailureHandler)   // 失败返回 JSON
                .permitAll()                        // 登录页和提交接口放行
            )
            // 4. 退出登录
            .logout(logout -> logout
                .logoutUrl("/logout")              // 触发退出的地址
                .logoutSuccessUrl("/login")        // 退出后跳转
                .invalidateHttpSession(true)       // 清空 Session（默认 true）
                .deleteCookies("JSESSIONID")       // 删除会话 Cookie
            )
            // 5. 会话管理
            .sessionManagement(sm -> sm
                .maximumSessions(1)                // 同一账号最多同时在线 1 个
                .maxSessionsPreventsLogin(true)    // true：顶号后禁止新登录；false：踢掉旧的
            );
        return http.build();
    }
}
```

**`requestMatchers` 常用匹配规则一览**：

| 写法 | 说明 | 场景 |
| --- | --- | --- |
| `.permitAll()` | 无条件放行 | 登录页、注册页、静态资源 |
| `.authenticated()` | 只要登录即可（不限角色） | 需要登录才能看的页面 |
| `.hasRole("ADMIN")` | 必须拥有 `ROLE_ADMIN` 权限 | 管理员后台 |
| `.hasAnyRole("ADMIN","USER")` | 拥有任一角色即可 | 多角色共享页面 |
| `.hasAuthority("order:read")` | 拥有指定权限（**不带** ROLE_ 前缀） | 细粒度权限点 |
| `.hasAnyAuthority(...)` | 拥有任一权限即可 | 多个权限点 |
| `.denyAll()` | 全部拒绝 | 临时封禁某接口 |
| `.anonymous()` | 只允许匿名（未登录）访问 | 已经登录了反而不能进登录页 |
| `.rememberMe()` | 允许「记住我」登录的用户 | 依赖记住我功能 |

### 2. 认证方式全景：表单登录、HTTP Basic、Token

Spring Security 支持多种认证方式，可以叠加使用。

| 认证方式 | 适用场景 | 配置 |
| --- | --- | --- |
| 表单登录（formLogin） | 传统服务端渲染的 Web 应用 | `.formLogin(...)` |
| HTTP Basic | 内部系统、简单接口、调试 | `.httpBasic(...)` |
| JWT / Token | 前后端分离、移动端、分布式 | 自定义 Filter（见下文） |
| OAuth2 / OIDC | 第三方登录、单点登录 | `.oauth2Login(...)` |
| Remember Me | 记住登录状态，延长免登录时间 | `.rememberMe(...)` |

```java
// HTTP Basic：浏览器弹出原生的账号密码框，Authorization 头里带 Base64 的 user:pass
http.httpBasic(Customizer.withDefaults());
```

**为什么前后端分离要自己写 JWT 过滤器**：表单登录和 HTTP Basic 都依赖 Session/Cookie，而前后端分离场景下前端是独立域名、移动端根本没有 Cookie，所以业界统一采用「无状态 JWT」——登录后发一个 token，之后每次请求头携带，服务端解析后重建认证信息。

### 3. 密码编码器细节：`matches` 比对与加密格式

`PasswordEncoder` 接口只有三个方法，含义非常清晰：

```java
public interface PasswordEncoder {
    String encode(CharSequence rawPassword);            // 加密：明文 → 密文
    boolean matches(CharSequence rawPassword, String encodedPassword); // 比对：明文 vs 密文
    default boolean upgradeEncoding(String encodedPassword) { return false; } // 是否需要升级加密
}
```

BCrypt 密文的**完整格式**（理解了它你就明白「盐」存哪了）：

```
$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
│ │   │                      │
│ │   │                      └── 31 字符的哈希结果
│ │   └── 22 字符（16 字节）的随机盐
│ └── cost = 10（2^10 = 1024 次迭代）
└── 算法版本 2a
```

**重点结论**：盐被**编码进了密文本身**，所以登录时 `matches("明文", "密文")` 能自动从密文里解析出盐来重算，无需单独存盐字段。

### 4. JWT 整合实战（前后端分离标准方案）

Spring Security 默认基于 Session，前后端分离要改成**无状态 JWT**，完整流程分四步：

**第一步：引入 JWT 依赖**（这里以 jjwt 为例）：

```xml
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
```

**第二步：封装 JWT 工具类**：

```java
@Component
public class JwtUtil {

    // 为什么密钥要够长且放配置里：HS256 要求至少 256 bit，硬编码有泄露风险
    @Value("${jwt.secret}")
    private String secret;

    @Value("${jwt.expiration}")
    private long expiration; // 单位：毫秒

    private SecretKey getKey() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(String username) {
        return Jwts.builder()
                .subject(username)                     // 主体 = 用户名
                .issuedAt(new Date())                  // 签发时间
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getKey())                    // 签名
                .compact();
    }

    public String parseUsername(String token) {
        return Jwts.parser()
                .verifyWith(getKey())
                .build()
                .parseSignedClaims(token)
                .getPayload()
                .getSubject();
    }
}
```

**第三步：编写 JWT 认证过滤器**（放在认证过滤器之前）：

```java
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final UserDetailsService userDetailsService;

    public JwtAuthenticationFilter(JwtUtil jwtUtil, UserDetailsService userDetailsService) {
        this.jwtUtil = jwtUtil;
        this.userDetailsService = userDetailsService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        // 1. 从请求头取 token
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);  // 去掉 "Bearer " 前缀
            try {
                // 2. 解析出用户名，再查一次库拿到最新权限
                String username = jwtUtil.parseUsername(token);
                if (SecurityContextHolder.getContext().getAuthentication() == null) {
                    UserDetails user = userDetailsService.loadUserByUsername(username);
                    // 3. 手动构造认证对象塞进 SecurityContext
                    //    为什么手动塞：JWT 场景没有登录过滤器帮你存，
                    //    塞进去之后，后面的 AuthorizationFilter 才能拿到权限做判断
                    UsernamePasswordAuthenticationToken auth =
                            new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
                    auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (Exception e) {
                // token 过期或非法：不设置认证，让后面的授权过滤器按「未认证」处理
                SecurityContextHolder.clearContext();
            }
        }
        // 4. 无论如何都要继续走后面的过滤器链
        filterChain.doFilter(request, response);
    }
}
```

**第四步：注册过滤器 + 关闭 Session**：

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    http
        .csrf(csrf -> csrf.disable())
        .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS)) // 无状态，不创建 Session
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/login", "/register").permitAll()
            .anyRequest().authenticated()
        )
        // 为什么用 addFilterBefore 而不是 after：
        // 自定义 JWT 过滤器要先于 UsernamePasswordAuthenticationFilter 执行，
        // 保证走到授权环节时认证信息已经就位
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
    return http.build();
}
```

**登录接口**则负责校验密码、签发 token（这一步通常绕开默认表单登录，自己写）：

```java
@RestController
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final JwtUtil jwtUtil;

    public AuthController(AuthenticationManager authenticationManager, JwtUtil jwtUtil) {
        this.authenticationManager = authenticationManager;
        this.jwtUtil = jwtUtil;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody LoginRequest req) {
        // 手动触发认证：交给 AuthenticationManager 走完整的认证流程
        Authentication auth = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(req.getUsername(), req.getPassword())
        );
        // 认证通过则签发 token（认证失败会抛 AuthenticationException，由全局异常处理）
        String token = jwtUtil.generateToken(auth.getName());
        return Map.of("token", token);
    }
}
```

### 5. 方法级安全：把权限校验下沉到 Service

URL 级别控制只能管到「能不能进这个接口」，方法级安全能管到「能不能调这个方法」，实现**更细粒度**的控制。

```java
@Configuration
@EnableMethodSecurity   // 必须开启，否则下面所有注解都不生效
public class SecurityConfig { ... }
```

常用注解一览：

| 注解 | 作用 | 例子 |
| --- | --- | --- |
| `@PreAuthorize` | 方法调用**前**校验 | `@PreAuthorize("hasRole('ADMIN')")` |
| `@PostAuthorize` | 方法调用**后**校验（能拿到返回值） | `@PostAuthorize("returnObject.owner == authentication.name")` |
| `@PreFilter` | 入参集合过滤 | `@PreFilter("filterObject.owner == authentication.name")` |
| `@PostFilter` | 返回值集合过滤 | `@PostFilter("filterObject.visible == true")` |
| `@Secured` | 基于角色（需开启 securedEnabled） | `@Secured("ROLE_ADMIN")` |

```java
@Service
public class OrderService {

    // 只有 ADMIN 能删单
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteOrder(Long id) { ... }

    // 只能操作自己的订单：#order 是方法参数，authentication.name 是当前登录用户名
    @PreAuthorize("#order.userId == authentication.name")
    public void cancelOrder(Order order) { ... }

    // 返回值里，只留下属于自己的记录
    @PostFilter("filterObject.owner == authentication.name")
    public List<Order> listOrders() { ... }
}
```

::: tip 💡 面试题：`@PreAuthorize` 和 URL 拦截（`authorizeHttpRequests`）有什么区别？
URL 拦截是**入口级、粗粒度**控制（能不能访问这个接口），`@PreAuthorize` 是**方法级、细粒度**控制（能不能调用这个业务方法），且支持 SpEL 表达式引用方法参数和返回值。两者配合使用：URL 层做第一道粗筛，方法层做第二道精筛，形成纵深防御。
:::

### 6. CSRF 与 CORS：两个高频踩坑的「C」开头概念

#### 6.1 CSRF（跨站请求伪造）

CSRF 攻击原理：用户登录了银行网站 A（浏览器带着 A 的 Cookie），此时访问了恶意网站 B，B 里的脚本偷偷向 A 发起转账请求——因为浏览器自动带上 A 的 Cookie，A 误以为是用户本人在操作。

Spring Security 的防护：默认开启 CSRF 防护，要求**写操作**（POST/PUT/DELETE）必须携带一个服务端下发的 CSRF token。

```
1. 服务端生成 csrfToken，渲染进表单隐藏字段 / 存入 Cookie
2. 浏览器提交时带上 token
3. CsrfFilter 校验请求里的 token 与 Session 里的 token 是否一致
4. 不一致 → 拒绝（403），因为攻击者跨站伪造的请求拿不到这个 token
```

```java
// 传统表单项目：默认开启即可，模板里自动注入 _csrf 隐藏字段
// <input type="hidden" th:name="${_csrf.parameterName}" th:value="${_csrf.token}"/>

// 前后端分离 + 无状态 token：关闭 CSRF
http.csrf(csrf -> csrf.disable());
```

**关键判断**：只要你的接口是**无状态 token 认证**（不依赖 Cookie 自动携带），就可以安全地关闭 CSRF；反之如果是 Session+Cookie 的老式 Web 应用，务必保持开启。

#### 6.2 CORS（跨域资源共享）

CORS 解决的是「**浏览器**不允许跨域 Ajax 请求」的问题（注意：是浏览器的同源策略拦截，不是服务器拦的）。Spring Security 需要单独配置放行：

```java
@Configuration
public class CorsConfig {

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("http://localhost:3000")); // 允许的前端源
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);  // 允许携带 Cookie
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}

// 在 Security 配置里启用
http.cors(cors -> cors.configurationSource(corsConfigurationSource()));
```

| 概念 | 攻击/问题来源 | 谁来拦 | 防护手段 |
| --- | --- | --- | --- |
| CSRF | 恶意网站伪造请求 | 服务端 | CSRF token 校验 |
| CORS | 同源策略拦跨域请求 | 浏览器 | 服务端返回 CORS 响应头 |

### 7. 异常处理与自定义返回

前后端分离时，框架默认的「重定向到登录页」「403 页面」并不友好，需要自定义 JSON 返回。

```java
@Component
public class CustomAuthenticationEntryPoint implements AuthenticationEntryPoint {
    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        // 未登录（认证失败）时返回 401 JSON，而不是重定向到登录页
        response.setContentType("application/json;charset=UTF-8");
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.getWriter().write("{\"code\":401,\"msg\":\"未登录或登录已过期\"}");
    }
}

@Component
public class CustomAccessDeniedHandler implements AccessDeniedHandler {
    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
                       AccessDeniedException accessDeniedException) throws IOException {
        // 已登录但无权限时返回 403 JSON
        response.setContentType("application/json;charset=UTF-8");
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.getWriter().write("{\"code\":403,\"msg\":\"没有访问权限\"}");
    }
}
```

```java
// 挂到配置里
http
    .exceptionHandling(ex -> ex
        .authenticationEntryPoint(customAuthenticationEntryPoint)  // 处理未认证
        .accessDeniedHandler(customAccessDeniedHandler)            // 处理无权限
    );
```

### 8. Remember Me「记住我」

让用户勾选「记住我」后，一段时间内免登录。原理是下发一个带签名和过期时间的 Cookie，下次访问自动用它重建认证。

```java
http.rememberMe(remember -> remember
    .key("uniqueAndSecretKey")      // 签名密钥，多个节点必须一致
    .tokenValiditySeconds(60 * 60 * 24 * 7)  // 7 天有效
    .userDetailsService(userDetailsService)  // 重建认证时查用户
);
```

### 9. 高级篇小结

- 核心配置就是 `SecurityFilterChain` Bean，Lambda 链式 API 串联 CSRF、授权、登录、退出、会话。
- 前后端分离的标准方案 = **关 CSRF + 无状态 Session + 自定义 JWT 过滤器 + 方法级注解**。
- CSRF 与 CORS 是两码事，一个防伪造、一个解决跨域，别混淆。
- 异常处理要自定义成 JSON 返回，才能适配前后端分离。

---

## 原理篇

### 1. 过滤器链的完整执行机制

#### 1.1 过滤器是谁注册、怎么串联的？

Spring Security 的过滤器并不直接注册到 Servlet 容器，而是统一挂在 **`DelegatingFilterProxy`** 之下，由它把请求转交给 Spring 容器里的 `FilterChainProxy`。这样做的目的是：**让安全过滤器也享受 Spring 的依赖注入**。

```
Servlet 容器
   │
   ▼
DelegatingFilterProxy（注册在 web.xml / Servlet 规范里的「空壳」过滤器）
   │  委托给 Spring 容器里的 Bean
   ▼
FilterChainProxy（真正的过滤器链入口，是一个 @Bean）
   │  根据请求匹配出一条 SecurityFilterChain（可能有多条）
   ▼
SecurityFilterChain（一条具体的过滤器链）
   │  依次执行链上的 Filter
   ▼
DispatcherServlet（业务）
```

#### 1.2 Spring Security 6 默认过滤器顺序（重要，面试爱考）

过滤器的**顺序是写死的**（在 `FilterOrderRegistration` 里定义），顺序错了认证授权就会乱套：

```
1.  DisableEncodeUrlFilter            —— 禁止在 URL 里编码 Session id
2.  WebAsyncManagerIntegrationFilter  —— 把 SecurityContext 集成到异步线程
3.  SecurityContextHolderFilter        —— 从存储中恢复/保存 SecurityContext（6.x 新写法）
4.  HeaderWriterFilter                 —— 写入安全响应头（X-Content-Type-Options 等）
5.  CorsFilter                         —— CORS 处理
6.  CsrfFilter                         —— CSRF 校验
7.  LogoutFilter                       —— 处理退出登录
8.  UsernamePasswordAuthenticationFilter —— 表单登录认证 ★核心
9.  DefaultLoginPageGeneratingFilter   —— 生成默认登录页
10. DefaultLogoutPageGeneratingFilter  —— 生成默认退出页
11. BasicAuthenticationFilter          —— HTTP Basic 认证
12. RequestCacheAwareFilter            —— 恢复被拦截的原始请求
13. SecurityContextHolderAwareRequestFilter —— 包装请求，方便取 SecurityContext
14. AnonymousAuthenticationFilter      —— 未登录时塞入「匿名认证对象」★关键
15. ExceptionTranslationFilter         —— 捕获下游异常并翻译 ★核心
16. AuthorizationFilter                —— 授权校验 ★核心（6.x 取代 FilterSecurityInterceptor）
```

**为什么 `AnonymousAuthenticationFilter` 很关键**：它会在「没人认证」时给当前请求塞一个 `AnonymousAuthenticationToken`，这样后续授权环节就不必判空——`isAuthenticated()` 永远有值，未登录就是 `anonymousUser`。

**为什么 `ExceptionTranslationFilter` 要放在授权过滤器之前**：它像一层「网」，捕获后面授权过滤器抛出的 `AuthenticationException` 和 `AccessDeniedException`，分别转成 401（重定向登录）和 403（拒绝）。

#### 1.3 认证的完整内部流程（逐层下钻）

以「用户提交用户名密码登录」为例，一次完整的认证要穿过下面这些类：

```
UsernamePasswordAuthenticationFilter（只拦截 POST /login）
   │  把 username + password 包成一个 UsernamePasswordAuthenticationToken
   ▼
AuthenticationManager（接口，实现是 ProviderManager）
   │  ProviderManager 内部维护一个 List<AuthenticationProvider>，
   │  逐个遍历找到「支持该 token 类型」的 provider
   ▼
DaoAuthenticationProvider（支持 UsernamePasswordAuthenticationToken）
   │  1. retrieveUser(username, ...) → 调 UserDetailsService.loadUserByUsername 查用户
   │  2. additionalAuthenticationChecks() → 调 PasswordEncoder.matches 比对密码
   │  3. createSuccessAuthentication() → 组装一个「已认证」的 Authentication
   ▼
返回 Authentication（已认证，principal=UserDetails, authorities=权限列表）
   │
   ▼
SecurityContextHolder.getContext().setAuthentication(auth)   // 存入 ThreadLocal
```

对应到 `DaoAuthenticationProvider` 的核心源码逻辑（简化版，帮助理解）：

```java
// DaoAuthenticationProvider.retrieveUser() 的核心（示意）
protected UserDetails retrieveUser(String username, UsernamePasswordAuthenticationToken authentication) {
    // 1. 调我们写的 UserDetailsService 查用户
    UserDetails loadedUser = this.getUserDetailsService().loadUserByUsername(username);
    if (loadedUser == null) {
        throw new InternalAuthenticationServiceException("UserDetailsService 返回 null");
    }
    return loadedUser;
}

// DaoAuthenticationProvider.additionalAuthenticationChecks() 的核心（示意）
protected void additionalAuthenticationChecks(UserDetails userDetails,
        UsernamePasswordAuthenticationToken authentication) {
    String presentedPassword = authentication.getCredentials().toString();
    // 2. 调 PasswordEncoder 比对「明文」与「库里密文」，不匹配就抛 BadCredentialsException
    if (!this.passwordEncoder.matches(presentedPassword, userDetails.getPassword())) {
        throw new BadCredentialsException("密码错误");
    }
}
```

### 2. 授权机制：`AuthorizationFilter` 如何决策

认证通过后，`AuthorizationFilter` 要为每个请求做「放行 / 拒绝」的决策。Spring Security 6 把决策委托给 **`AuthorizationManager`**。

#### 2.1 授权决策流程

```
AuthorizationFilter
   │  取出当前 Authentication（来自 SecurityContextHolder）
   ▼
AuthorizationManager（如 RequestMatcherDelegatingAuthorizationManager）
   │  根据 URL 匹配到一条授权规则（permitAll / hasRole / authenticated ...）
   ▼
调用对应的具体 AuthorizationManager：
   ├─ AuthenticatedAuthorizationManager  → 检查「是否已登录（且不是匿名）」
   ├─ AuthorityAuthorizationManager     → 检查「是否有某个 ROLE_ / authority」
   └─ PermitAllAuthorizationManager     → 直接放行
   │
   ▼
返回 AuthorizationDecision（granted = true / false）
   │
   ├─ true  → 放行，继续后续过滤器
   └─ false → 抛 AccessDeniedException（被 ExceptionTranslationFilter 捕获 → 403）
```

#### 2.2 `ROLE_` 前缀的来龙去脉

这是理解授权规则的关键细节：`hasRole("ADMIN")` 内部会把 `ADMIN` 拼成 `ROLE_ADMIN` 再去匹配权限列表。

```java
// 你写的配置
.requestMatchers("/admin/**").hasRole("ADMIN")
// 框架内部等价于
.requestMatchers("/admin/**").hasAuthority("ROLE_ADMIN")
```

**为什么要有这个前缀**：历史上前缀用于区分「角色（Role，业务概念）」和「权限（Authority，操作权限）」，前者是 `ROLE_xxx`、后者是 `xxx:read`。虽然现代 Spring Security 已经弱化了这个区分，但 `hasRole` 自动加前缀的行为一直保留，所以：

- 存权限时用 `roles("ADMIN")` → 实际权限是 `ROLE_ADMIN`
- 存权限时用 `authorities("ADMIN")` → 实际权限是 `ADMIN`（**不加前缀**）

### 3. `SecurityContextHolder`：ThreadLocal 的存储策略

`SecurityContextHolder` 是贯穿整个请求的「信息载体」，默认用 `ThreadLocal` 存储，保证每个线程独立。

```java
// 三种存储策略
public static final String MODE_THREADLOCAL = "MODE_THREADLOCAL"; // 默认：线程内共享
public static final String MODE_INHERITABLETHREADLOCAL = "MODE_INHERITABLETHREADLOCAL"; // 子线程可继承
public static final String MODE_GLOBAL = "MODE_GLOBAL"; // 全局共享（慎用）
```

**为什么用 ThreadLocal**：Servlet 容器为每个请求分配一个线程，把 `SecurityContext` 放进 `ThreadLocal` 后，同一请求在任意层（Controller/Service/Mapper）都能取到当前用户，且请求之间互不干扰。

```java
// 业务代码里随时随地取当前登录用户
Authentication auth = SecurityContextHolder.getContext().getAuthentication();
if (auth != null && auth.isAuthenticated()) {
    String username = auth.getName();               // 当前用户名
    Collection<? extends GrantedAuthority> as = auth.getAuthorities(); // 权限列表
}
```

**重要清理规则**：请求结束后，`SecurityContextHolderFilter` 会调用 `SecurityContextHolder.clearContext()` 清空 ThreadLocal，防止线程复用（线程池）导致的**用户信息串号**——这是必须理解的安全细节。

### 4. BCrypt 的慢哈希原理（字节级解析）

BCrypt 之所以抗暴力破解，核心在两点：**随机盐**和**可调成本（慢）**。

#### 4.1 密文格式逐段拆解

```
$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
```

| 段 | 值 | 含义 |
| --- | --- | --- |
| 算法标识 | `$2a$` | BCrypt 版本（还有 2b / 2y，修复了小 bug） |
| cost | `10` | 成本因子，实际迭代次数 = 2^10 = **1024 次** |
| 盐 | 22 个字符 | 16 字节随机盐的 Base64 编码 |
| 哈希 | 31 个字符 | 24 字节哈希结果的 Base64 编码 |

#### 4.2 cost 与速度的关系

cost 每加 1，迭代次数翻倍，破解难度也翻倍。典型取值：

| cost | 迭代次数 | 单次耗时（参考） | 适用 |
| --- | --- | --- | --- |
| 10 | 1024 | ~50~100ms | 一般系统 |
| 12 | 4096 | ~200~400ms | 安全要求较高 |
| 14 | 16384 | ~1s 左右 | 高安全场景 |

**注意权衡**：cost 太高会拖慢登录接口，可能被攻击者反过来用于**密码撞库导致的 CPU 耗尽（DoS）**，所以不是越高越好。

### 5. JWT 的结构与验证原理

JWT 由三段 Base64URL 编码拼接而成，用 `.` 分隔：

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ6aGFuZ3NhbiJ9.4m7YF... 
│                      │                      │
Header               Payload               Signature
```

| 段 | 内容 | 说明 |
| --- | --- | --- |
| Header | `{"alg":"HS256","typ":"JWT"}` | 声明签名算法 |
| Payload | `{"sub":"zhangsan","exp":1710000000}` | 载荷，**只 Base64 编码、不加密**，任何人可解码 |
| Signature | 用密钥对前两段签名 | 保证内容**不可篡改** |

**验证流程**：

```
服务端收到 token
   │
   ├─ 1. 用「密钥 + Header 声明的算法 + 前两段」重新计算签名
   ├─ 2. 与第三段签名比对：不一致 → 被篡改，拒绝
   ├─ 3. 检查 exp（过期时间）：已过期 → 拒绝
   └─ 4. 全部通过 → 信任 payload，取出 sub 等字段重建认证
```

::: tip 💡 面试题：JWT 是无状态的，那怎么实现「退出登录」和「踢人」？
JWT 一旦签发，在有效期内服务端无法让它「失效」，因为服务端不存状态。常见做法：① 缩短 token 有效期 + 用 Refresh Token 续期；② 维护一个「黑名单」（如 Redis 存已注销 token 的 jti，剩余有效期）；③ 用户改密码/被踢时，更新一个版本号并让旧 token 校验失败。本质是用「少量服务端状态」去补 JWT 无状态的短板。
:::

### 6. CSRF 防护的底层机制

Spring Security 的 CSRF 防护依赖 **`CsrfFilter`** 和一个「同步器令牌（Synchronizer Token）」：

```
1. GET 请求进入 → CsrfFilter 生成一个随机 csrfToken，存入 Session + 暴露给视图
   （传统表单项目会把 token 渲染成 <input type="hidden" name="_csrf">）
2. 浏览器提交 POST → 请求里带上这个 token
3. CsrfFilter 取出请求里的 token 与 Session 里的 token 比对
   ├─ 相等 → 放行
   └─ 不等/缺失 → 抛 CsrfException → 403
```

**为什么能防住攻击**：攻击者伪造的跨站请求虽然会带上目标站的 Cookie（因为浏览器自动携带），但**拿不到隐藏在页面表单里的 CSRF token**，所以无法通过校验。

**为什么前后端分离可以关掉它**：无状态 JWT 场景下，token 存在 `Authorization` 头里，浏览器**不会自动携带**（不像 Cookie），攻击者跨站无法伪造这个头，CSRF 的前提就不成立了。

### 7. 原理篇小结

- 过滤器链由 `DelegatingFilterProxy` → `FilterChainProxy` → `SecurityFilterChain` 三层串联，过滤器顺序是**固定**的。
- 认证走 `AuthenticationManager → ProviderManager → DaoAuthenticationProvider → UserDetailsService + PasswordEncoder` 的链式下钻。
- 授权走 `AuthorizationManager` 决策，`hasRole` 自动加 `ROLE_` 前缀是高频细节。
- `SecurityContextHolder` 用 `ThreadLocal` 传用户，请求结束必须清理防串号。
- BCrypt 的安全来自「随机盐 + 慢哈希」，JWT 的「无状态」是双刃剑，退出需要额外机制。

---

## 面试常问

1. **Spring Security 的认证流程是怎样的？**
   **结论**：登录请求 → `UsernamePasswordAuthenticationFilter` 组装 token → `AuthenticationManager` 委托 `DaoAuthenticationProvider` → 调 `UserDetailsService` 查用户、`PasswordEncoder.matches` 比密码 → 成功则把 `Authentication` 存入 `SecurityContextHolder`。
   展开：这是一条标准的「职责链」——过滤器只负责拦截和组装，真正校验交给 Provider，查数据交给 UserDetailsService，比密码交给 PasswordEncoder，层层解耦，任何一环都可替换。

2. **认证和授权有什么区别？**
   **结论**：认证回答「你是谁」（登录验证），授权回答「你能干什么」（权限控制），顺序上先认证后授权。
   展开：认证失败返回 401，授权失败返回 403。在代码里，认证对应 `AuthenticationManager` 和过滤器链的前半段，授权对应 `AuthorizationFilter` 和 `@PreAuthorize` 等。

3. **BCrypt 为什么比 MD5 安全？**
   **结论**：BCrypt 内置随机盐 + 慢哈希（可调 cost），能同时抵抗彩虹表和暴力破解，MD5 快速且无安全盐，彩虹表可秒破。
   展开：盐被编码进密文本身，每次加密盐都不同；cost=10 意味着 2^10 次迭代，故意拖慢计算速度，让批量破解变得不划算。

4. **前后端分离怎么做认证？**
   **结论**：关闭 Session（`STATELESS`）和 CSRF，用自定义 `OncePerRequestFilter` 从 `Authorization: Bearer xxx` 解析 JWT，手动构造 `Authentication` 塞进 `SecurityContextHolder`。
   展开：因为前后端分离和移动端没有 Cookie/Session，改用无状态 token；JWT 过滤器要放在 `UsernamePasswordAuthenticationFilter` 之前，保证授权时认证信息已就位。

5. **`@PreAuthorize` 和 URL 拦截的区别？**
   **结论**：URL 拦截是入口级粗粒度控制，`@PreAuthorize` 是方法级细粒度控制，且支持 SpEL 引用参数和返回值。
   展开：两者配合形成纵深防御——URL 层先粗筛「能不能进接口」，方法层再精筛「能不能调这个方法、能不能操作这条数据」。

6. **CSRF 攻击是什么？怎么防？为什么前后端分离可以关掉？**
   **结论**：CSRF 是利用浏览器自动携带 Cookie 伪造请求的攻击；防护靠服务端下发并校验 CSRF token；前后端分离用 `Authorization` 头传 token（浏览器不自动携带），所以可以关闭。
   展开：核心是「攻击者拿不到隐藏在页面里的 token」；无状态 JWT 场景下，跨站请求无法伪造 `Authorization` 头，CSRF 前提不成立。

7. **`SecurityContextHolder` 的存储机制是什么？为什么要清理？**
   **结论**：默认用 `ThreadLocal` 存储当前登录用户的 `SecurityContext`，实现请求内共享、请求间隔离；请求结束必须 `clearContext()` 清理。
   展开：Servlet 容器用线程池复用线程，若不清理，上一个请求的用户信息可能「串」到下一个请求，造成严重越权。

8. **Spring Security 的过滤器链顺序为什么重要？**
   **结论**：过滤器顺序是固定设计的，认证（`UsernamePasswordAuthenticationFilter`）必须在授权（`AuthorizationFilter`）之前，否则授权时拿不到认证信息。
   展开：`ExceptionTranslationFilter` 要包在授权过滤器外层，才能把授权抛出的异常翻译成 401/403；顺序错乱会导致认证无效或异常无法被正确处理。

---

**相关链接**：[Spring](./Spring) · [Spring Boot](./Spring%20Boot) · [Spring MVC](./Spring%20MVC) · [MyBatis](./MyBatis) · [JVM](../Java核心/JVM) · [Java集合](../Java核心/Java集合) · [并发编程](../Java核心/并发编程)
