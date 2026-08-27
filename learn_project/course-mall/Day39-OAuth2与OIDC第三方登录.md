# Day 39 · OAuth2 / OIDC 第三方登录（GitHub + 商城 JWT）

> **今天目标**：在不推翻 Day04/Day05 JWT 登录体系的前提下，加入 GitHub 第三方登录。GitHub 负责证明“你是谁”，CourseMall 负责绑定本地用户，并继续签发自己的 accessToken + refreshToken。

## 一、先把 OAuth2、OIDC、JWT 分清

| 名称 | 它解决什么问题 | 在本项目里的作用 |
|---|---|---|
| OAuth 2.0 | 授权框架：允许应用在用户同意后访问第三方资源 | 让 CourseMall 获得 GitHub 用户身份信息 |
| OIDC | 构建在 OAuth2 之上的身份层，增加标准化的 `ID Token`、UserInfo 等 | 后续接 Google、Keycloak 时使用 |
| JWT | 一种 token 字符串格式，不是一套登录协议 | CourseMall 登录成功后签发自己的 accessToken |

Spring Security 的 `oauth2Login()` 同时支持 OAuth2 Provider（如 GitHub）和 OIDC Provider（如 Google）。GitHub OAuth App 的登录过程主要是 OAuth2 授权码流程；Google、Keycloak 才是更标准的 OIDC 登录。

::: tip 💡 面试题：已经有 JWT，为什么还需要 OAuth2？
**一句话**：JWT 只规定 token 长什么样，没规定“用户如何登录”；OAuth2/OIDC 规定用户如何跳转到第三方授权、如何安全回调以及如何取得身份。第三方登录完成后，商城仍可签发自己的 JWT，两者不是替代关系。
:::

## 二、最终链路

```text
浏览器点击“GitHub 登录”
    ↓ GET /oauth2/authorization/github
Spring Security 生成 state，跳转 GitHub
    ↓ 用户同意授权
GitHub 回调 /login/oauth2/code/github?code=...&state=...
    ↓ Spring Security 用 code 换 GitHub access token，再读取 GitHub 用户
OAuthAccountService 查 oauth_account
    ├─ 已绑定：找到本地 user
    └─ 未绑定：创建本地 user，再建立绑定
    ↓
服务端生成 60 秒一次性 ticket，Redis 中保存 ticket -> userId
    ↓ 302 到前端 /oauth/callback?ticket=...
前端 POST /api/user/oauth/exchange，用 ticket 换商城 accessToken + refreshToken
```

这里**不能直接把商城 JWT 放进回调 URL**。URL 会进入浏览器历史、代理日志、分析平台和 `Referer`，因此只放短期、一次性的 ticket。

## 三、前置条件

- 已完成 Day04：Spring Security + JWT 鉴权
- 已完成 Day05：Redis + accessToken/refreshToken
- GitHub 账号可正常登录
- 本地前端回调页暂定为 `http://localhost:5173/oauth/callback`

## 四、步骤

### 步骤 1：创建 GitHub OAuth App

进入 GitHub：`Settings → Developer settings → OAuth Apps → New OAuth App`。

本地开发填写：

```text
Application name: CourseMall Local
Homepage URL: http://localhost:5173
Authorization callback URL: http://localhost:8080/login/oauth2/code/github
```

创建后拿到 `Client ID` 和 `Client Secret`。Secret 不写死在 Git、YAML 或前端代码里，使用环境变量。

PowerShell 当前窗口临时设置：

```powershell
$env:GITHUB_CLIENT_ID="你的Client ID"
$env:GITHUB_CLIENT_SECRET="你的Client Secret"
```

### 步骤 2：加入 OAuth2 Client 依赖

`mall-user/pom.xml` 新增：

```xml
<!-- OAuth2/OIDC 客户端：授权跳转、state 校验、code 换 token、读取用户信息 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-client</artifactId>
</dependency>
```

它建立在现有 `spring-boot-starter-security` 上，不需要再引一套安全框架。

### 步骤 3：配置 GitHub 和前端回调

`mall-user/src/main/resources/application.yml` 增加：

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          github:
            client-id: ${GITHUB_CLIENT_ID}
            client-secret: ${GITHUB_CLIENT_SECRET}
            authorization-grant-type: authorization_code
            redirect-uri: "{baseUrl}/login/oauth2/code/{registrationId}"
            scope:
              - read:user
              - user:email

mall:
  oauth2:
    # 只允许服务端配置的固定地址，不能接受请求参数传入任意 redirectUri，否则会产生开放重定向漏洞
    frontend-callback: ${OAUTH2_FRONTEND_CALLBACK:http://localhost:5173/oauth/callback}
```

GitHub 是 Spring Security 内置的常见 Provider，因此授权地址、token 地址和 UserInfo 地址不用手写。

### 步骤 4：建立第三方账号绑定表

在 `sql/schema.sql` 加入：

```sql
DROP TABLE IF EXISTS `oauth_account`;
CREATE TABLE `oauth_account` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`          BIGINT       NOT NULL                COMMENT 'CourseMall 本地用户ID',
    `provider`         VARCHAR(32)  NOT NULL                COMMENT '提供方：github/google/keycloak',
    `provider_user_id` VARCHAR(128) NOT NULL                COMMENT '第三方稳定用户ID，不使用昵称作为身份',
    `provider_username` VARCHAR(100) DEFAULT NULL           COMMENT '第三方展示用户名，可修改，不作为唯一身份',
    `create_time`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_provider_user` (`provider`, `provider_user_id`),
    KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='第三方账号与本地账号绑定表';
```

为什么一定要单独建表：

- 一个本地用户以后可以绑定 GitHub、Google、微信等多个账号。
- GitHub 的 `login` 可以修改，真正稳定的是 GitHub 返回的数字 `id`。
- 唯一索引从数据库层阻止同一个第三方账号被重复绑定。
- 本项目只做登录，不需要代表用户长期调用 GitHub API，所以**不保存 GitHub access token**。

### 步骤 5：实体和 Mapper

`com/mall/user/entity/OAuthAccount.java`：

```java
package com.mall.user.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("oauth_account")
public class OAuthAccount {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;

    private String provider;

    private String providerUserId;

    private String providerUsername;

    private LocalDateTime createTime;

    private LocalDateTime updateTime;
}
```

`com/mall/user/mapper/OAuthAccountMapper.java`：

```java
package com.mall.user.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.user.entity.OAuthAccount;

public interface OAuthAccountMapper extends BaseMapper<OAuthAccount> {
}
```

### 步骤 6：把第三方身份绑定到本地用户

`com/mall/user/service/OAuthAccountService.java`：

```java
package com.mall.user.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.i18n.MessageKeys;
import com.mall.common.result.ErrorCode;
import com.mall.user.entity.OAuthAccount;
import com.mall.user.entity.User;
import com.mall.user.mapper.OAuthAccountMapper;
import com.mall.user.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OAuthAccountService {

    private final OAuthAccountMapper oauthAccountMapper;
    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    @Transactional
    public User loginOrRegister(String registrationId, OAuth2User principal) {
        String provider = registrationId.toLowerCase(Locale.ROOT);
        if (!"github".equals(provider)) {
            throw new BizException(
                    ErrorCode.PARAM_ERROR.getCode(),
                    MessageKeys.Auth.OAUTH_PROVIDER_UNSUPPORTED,
                    provider);
        }

        Object idAttribute = principal.getAttribute("id");
        if (idAttribute == null) {
            throw new BizException(
                    ErrorCode.UNAUTHORIZED.getCode(),
                    MessageKeys.Auth.OAUTH_LOGIN_FAILED);
        }

        String providerUserId = idAttribute.toString();
        String providerUsername = principal.getAttribute("login");

        OAuthAccount boundAccount = oauthAccountMapper.selectOne(
                new LambdaQueryWrapper<OAuthAccount>()
                        .eq(OAuthAccount::getProvider, provider)
                        .eq(OAuthAccount::getProviderUserId, providerUserId));

        if (boundAccount != null) {
            User user = userMapper.selectById(boundAccount.getUserId());
            if (user == null) {
                // 绑定记录存在但本地用户不存在，属于数据一致性问题，不能悄悄再创建一个账号
                throw new BizException(
                        ErrorCode.SYSTEM_ERROR.getCode(),
                        MessageKeys.Auth.OAUTH_BINDING_INVALID);
            }
            if (Integer.valueOf(0).equals(user.getStatus())) {
                throw new BizException(
                        ErrorCode.UNAUTHORIZED.getCode(),
                        MessageKeys.Auth.ACCOUNT_DISABLED);
            }
            return user;
        }

        // user.password 当前是 NOT NULL。第三方账号没有本地明文密码，存一个无法被用户猜到的随机密码哈希。
        // 仍然使用项目现有 DelegatingPasswordEncoder，数据库值会带 {bcrypt} 前缀。
        User user = new User();
        user.setUsername(provider + "_" + providerUserId);
        user.setPassword(passwordEncoder.encode(UUID.randomUUID() + ":" + UUID.randomUUID()));
        user.setNickname(firstNonBlank(
                principal.getAttribute("name"),
                providerUsername,
                "GitHub用户"));
        user.setAvatar(principal.getAttribute("avatar_url"));
        user.setEmail(principal.getAttribute("email"));
        user.setStatus(1);
        user.setDeleted(0);
        userMapper.insert(user);

        OAuthAccount account = new OAuthAccount();
        account.setUserId(user.getId());
        account.setProvider(provider);
        account.setProviderUserId(providerUserId);
        account.setProviderUsername(providerUsername);
        oauthAccountMapper.insert(account);
        return user;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return "CourseMall用户";
    }
}
```

::: tip 💡 面试题：第三方登录为什么不能拿昵称或邮箱当唯一身份？
**一句话**：昵称可修改也可重复；邮箱可能为空、未验证或之后更换。应使用 Provider 保证稳定的用户 ID，并用 `(provider, provider_user_id)` 联合唯一索引标识第三方身份。
:::

### 步骤 7：生成 60 秒一次性登录票据

`com/mall/user/service/OAuthLoginTicketService.java`：

```java
package com.mall.user.service;

import com.mall.common.exception.BizException;
import com.mall.common.i18n.MessageKeys;
import com.mall.common.result.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class OAuthLoginTicketService {

    private static final String KEY_PREFIX = "login:oauth:ticket:";
    private static final long TTL_SECONDS = 60;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final StringRedisTemplate stringRedisTemplate;

    public String create(Long userId) {
        byte[] randomBytes = new byte[32];
        SECURE_RANDOM.nextBytes(randomBytes);
        String ticket = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        stringRedisTemplate.opsForValue().set(
                KEY_PREFIX + ticket,
                userId.toString(),
                TTL_SECONDS,
                TimeUnit.SECONDS);
        return ticket;
    }

    public Long consume(String ticket) {
        // GETDEL 是原子操作：两个并发请求拿同一 ticket，最多只有一个成功。
        String userId = stringRedisTemplate.opsForValue().getAndDelete(KEY_PREFIX + ticket);
        if (userId == null) {
            throw new BizException(
                    ErrorCode.UNAUTHORIZED.getCode(),
                    MessageKeys.Auth.OAUTH_TICKET_INVALID);
        }
        return Long.valueOf(userId);
    }
}
```

### 步骤 8：让 TokenService 一次签发商城双 token

`com/mall/user/vo/TokenPairVO.java`：

```java
package com.mall.user.vo;

public record TokenPairVO(
        String accessToken,
        String refreshToken,
        String tokenType,
        long expiresIn) {
}
```

在 Day05 的 `TokenService` 增加统一签发方法，密码登录和第三方登录都调用它：

```java
public TokenPairVO issueTokenPair(Long userId) {
    String accessToken = jwtUtil.generateAccessToken(userId);
    String refreshToken = UUID.randomUUID().toString().replace("-", "");
    storeRefreshToken(userId, refreshToken);
    return new TokenPairVO(
            accessToken,
            refreshToken,
            "Bearer",
            jwtUtil.getExpireSeconds());
}
```

需要的 import：

```java
import com.mall.user.vo.TokenPairVO;
import java.util.UUID;
```

同时给 `JwtUtil` 增加：

```java
public long getExpireSeconds() {
    return expireSeconds;
}
```

这样登录方式只决定“怎样证明用户身份”，证明成功后统一走 `issueTokenPair(userId)`，后面的 JWT 鉴权完全不用改。

### 步骤 9：OAuth2 成功与失败处理器

`com/mall/user/security/OAuth2LoginSuccessHandler.java`：

```java
package com.mall.user.security;

import com.mall.user.entity.User;
import com.mall.user.service.OAuthAccountService;
import com.mall.user.service.OAuthLoginTicketService;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component
public class OAuth2LoginSuccessHandler implements AuthenticationSuccessHandler {

    private final OAuthAccountService oauthAccountService;
    private final OAuthLoginTicketService ticketService;
    private final String frontendCallback;

    public OAuth2LoginSuccessHandler(
            OAuthAccountService oauthAccountService,
            OAuthLoginTicketService ticketService,
            @Value("${mall.oauth2.frontend-callback}") String frontendCallback) {
        this.oauthAccountService = oauthAccountService;
        this.ticketService = ticketService;
        this.frontendCallback = frontendCallback;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication) throws IOException, ServletException {

        OAuth2AuthenticationToken oauthToken = (OAuth2AuthenticationToken) authentication;
        User user = oauthAccountService.loginOrRegister(
                oauthToken.getAuthorizedClientRegistrationId(),
                oauthToken.getPrincipal());

        String ticket = ticketService.create(user.getId());
        clearTemporarySession(request);

        String redirectUrl = UriComponentsBuilder
                .fromUriString(frontendCallback)
                .queryParam("ticket", ticket)
                .build()
                .encode()
                .toUriString();
        response.sendRedirect(redirectUrl);
    }

    private void clearTemporarySession(HttpServletRequest request) {
        // oauth2Login 默认用 HttpSession 暂存 authorization request 和 state。
        // 回调成功后立即销毁；商城真正的业务登录态仍由 JWT 承担。
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
    }
}
```

`com/mall/user/security/OAuth2LoginFailureHandler.java`：

```java
package com.mall.user.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component
public class OAuth2LoginFailureHandler implements AuthenticationFailureHandler {

    private final String frontendCallback;

    public OAuth2LoginFailureHandler(
            @Value("${mall.oauth2.frontend-callback}") String frontendCallback) {
        this.frontendCallback = frontendCallback;
    }

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception) throws IOException {

        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }

        // 不把第三方异常堆栈或描述放进 URL，只返回前端可识别的稳定错误码。
        String redirectUrl = UriComponentsBuilder
                .fromUriString(frontendCallback)
                .queryParam("error", "oauth_login_failed")
                .build()
                .encode()
                .toUriString();
        response.sendRedirect(redirectUrl);
    }
}
```

### 步骤 10：前端用 ticket 换商城 token

`com/mall/user/dto/OAuthTicketRequest.java`：

```java
package com.mall.user.dto;

import jakarta.validation.constraints.NotBlank;

public record OAuthTicketRequest(
        @NotBlank(message = "{validation.oauth.ticket.not-blank}") String ticket) {
}
```

`com/mall/user/controller/OAuthLoginController.java`：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import com.mall.user.dto.OAuthTicketRequest;
import com.mall.user.service.OAuthLoginTicketService;
import com.mall.user.service.TokenService;
import com.mall.user.vo.TokenPairVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/user/oauth")
@RequiredArgsConstructor
public class OAuthLoginController {

    private final OAuthLoginTicketService ticketService;
    private final TokenService tokenService;

    @PostMapping("/exchange")
    public Result<TokenPairVO> exchange(@Valid @RequestBody OAuthTicketRequest request) {
        Long userId = ticketService.consume(request.ticket());
        return Result.ok(tokenService.issueTokenPair(userId));
    }
}
```

前端回调页只做一件事：读取 URL 的 `ticket`，立刻 POST 到 `/api/user/oauth/exchange`，拿到 token 后用 `history.replaceState` 清掉地址栏里的 ticket。

### 步骤 11：接入 SecurityFilterChain

在现有 `SecurityConfig` 注入两个处理器：

```java
private final OAuth2LoginSuccessHandler oauth2LoginSuccessHandler;
private final OAuth2LoginFailureHandler oauth2LoginFailureHandler;
```

白名单增加：

```java
.requestMatchers(
        "/oauth2/**",
        "/login/oauth2/**",
        "/api/user/oauth/exchange"
).permitAll()
```

并在 `HttpSecurity` 链中增加：

```java
.oauth2Login(oauth -> oauth
        .successHandler(oauth2LoginSuccessHandler)
        .failureHandler(oauth2LoginFailureHandler))
```

保留 Day04 的 `SessionCreationPolicy.STATELESS`。OAuth2 授权跳转期间，默认的 `AuthorizationRequestRepository` 会短暂用 Session 保存授权请求和 `state`；成功/失败处理器已经立即销毁该临时 Session，商城业务登录态仍然只认 JWT。

::: tip 💡 面试题：OAuth2 的 `state` 是干什么的？
**一句话**：客户端发起授权时生成随机 state，回调时必须完全一致，用于把“发起请求”和“收到回调”关联起来并抵御登录 CSRF。它不能用可预测字符串，也不能省略。
:::

## 五、启动验证

先启动 MySQL、Redis、后端和前端，然后浏览器访问：

```text
http://localhost:8080/oauth2/authorization/github
```

授权后应跳到：

```text
http://localhost:5173/oauth/callback?ticket=<随机票据>
```

用 ticket 换商城 token：

```bash
curl -X POST http://localhost:8080/api/user/oauth/exchange \
  -H "Content-Type: application/json" \
  -H "Accept-Language: zh-CN" \
  -d '{"ticket":"替换成回调里的ticket"}'
```

预期：

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "...",
    "tokenType": "Bearer",
    "expiresIn": 1800
  }
}
```

把同一个 ticket 再换一次，应返回 401；等待 60 秒再换也应返回 401。这两项证明 ticket 是一次性且有 TTL。

数据库验证：

```sql
SELECT id, username, nickname, status FROM `user`
WHERE username LIKE 'github\_%';

SELECT user_id, provider, provider_user_id, provider_username
FROM oauth_account;
```

再次用同一 GitHub 账号登录，不应新增第二个本地用户。

## 六、Flutter 后续怎么接

Flutter 不能把 `client_secret` 打包进 APK/IPA；客户端包里的字符串最终都能被提取。移动端应使用系统浏览器 + Authorization Code + PKCE，并通过 App Link/Universal Link 或自定义 Scheme 回到 App。

CourseMall 可以沿用本日后半段设计：

1. Flutter 在系统浏览器打开后端授权入口。
2. 第三方回调到后端。
3. 后端生成 60 秒 ticket。
4. 通过 App Link 把 ticket 带回 Flutter。
5. Flutter POST exchange 接口换商城 token。

PKCE 的 `code_verifier` 留在移动端，授权请求只发送它的 SHA-256 摘要 `code_challenge`，即使授权码被截获，攻击者没有 verifier 也换不到 token。

## 七、生产级检查清单

- GitHub Client Secret 只存在环境变量或密钥管理服务中。
- 生产回调必须使用 HTTPS，并在 GitHub 后台精确登记地址。
- 前端回调地址由后端配置固定，禁止用户传入任意 redirect URI。
- 回调 URL 不放 accessToken、refreshToken、GitHub token 或异常详情。
- ticket 至少 256 位随机数、TTL 不超过 60 秒、使用 Redis `GETDEL` 一次消费。
- 使用 GitHub 稳定 `id` 绑定，不用昵称或邮箱当第三方主键。
- `(provider, provider_user_id)` 有数据库唯一索引。
- 不需要调用第三方 API 时，不落库保存第三方 access token。
- 登录、绑定、解绑要写审计日志，但日志不能打印 token、secret、code。
- 对 `/api/user/oauth/exchange` 增加 IP/设备维度限流。

## 八、官方参考

- [Spring Security OAuth2 Login](https://docs.spring.io/spring-security/reference/servlet/oauth2/login/index.html)
- [GitHub OAuth Web Application Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [RFC 9700：OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700.html)

## 九、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] GitHub 授权后能创建或找到本地用户：是 / 否
- [ ] 回调 URL 中只有一次性 ticket，没有任何 token：是 / 否
- [ ] ticket 能换到商城双 token，第二次消费失败：是 / 否
- [ ] 同一 GitHub 账号重复登录不会创建重复用户：是 / 否
- [ ] 账号禁用后第三方登录也会被拒绝：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：

## 十、我下次会追问的问题

1. OAuth2、OIDC、JWT 各自解决什么问题，为什么它们不是互相替代关系？
2. 为什么 GitHub 回调成功后不能直接把商城 JWT 拼在 URL 上？一次性 ticket 解决了哪些泄漏风险？
3. `state` 和 PKCE 分别防什么攻击？为什么移动端绝不能保存 `client_secret`？
4. 为什么第三方账号绑定要使用 `(provider, provider_user_id)`，不能只使用邮箱或昵称？
5. 接入 OAuth2 后，商城原来的 JWT 过滤器、RBAC 和 refreshToken 为什么几乎不用改？
