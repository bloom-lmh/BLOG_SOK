# Day 05 · 验证码与会话续期（Redis + Refresh Token）

> **今天目标**：在 Day04 的认证授权基础上完成两条安全链路：图形验证码保护短信发送，短信验证码保护注册；短期 accessToken 搭配可吊销、可轮换的 refreshToken，实现刷新和登出。

## 一、先看最终链路

```text
【注册验证码】
获取图形验证码 → Redis（5 分钟）
  → 图形验证码校验通过
  → 60 秒短信限频
  → 短信验证码写入 Redis（5 分钟）
  → 注册时原子校验并消费短信验证码

【登录与续期】
账号密码登录 → accessToken（30 分钟）+ refreshToken（7 天）
  → accessToken 访问业务接口
  → accessToken 过期后，用 refreshToken 换一对新令牌
  → 旧 refreshToken 同时失效（rotation）
  → 登出时删除当前 refreshToken
```

今天有三个边界先说清楚：

- 密码登录**不强制短信验证码**。短信验证码用于注册；登录验证码通常由连续失败次数或风控策略触发。
- refreshToken 是高价值凭证。本文面向后续 Flutter 客户端，暂时通过 JSON 传输，客户端必须放入安全存储。
- 删除 refreshToken 不能让已签发的 accessToken 立刻消失；它最多继续存活 30 分钟。

## 二、前置条件

- Day04 登录、JWT 过滤器和 RBAC 授权已经跑通。
- 本机 Redis 可连接。你现在的 Redis 3.x 也能运行本文 Lua 脚本；正式环境应使用仍在维护的 Redis 版本。
- `mall-common` 已有 `ErrorCode`、`MessageKeys`、`ResultMessageAdvice` 和中英文 `messages*.properties`。

## 三、需要新增或修改的文件

```text
mall-user/src/main/java/com/mall/user/
├─ config/properties/
│  ├─ CaptchaProperties.java
│  └─ TokenProperties.java
├─ controller/
│  ├─ CaptchaController.java
│  ├─ LoginController.java          # 修改登录响应
│  └─ TokenController.java
├─ dto/
│  ├─ RefreshTokenRequest.java
│  ├─ SmsCaptchaRequest.java
│  └─ UserRegisterDTO.java          # 增加 smsCode
├─ service/
│  ├─ CaptchaService.java
│  ├─ SmsSender.java
│  └─ TokenService.java
├─ service/impl/
│  ├─ LoggingSmsSender.java
│  └─ UserServiceImpl.java          # 注册时消费短信验证码
└─ vo/
   ├─ ImageCaptchaVO.java
   └─ LoginVO.java                  # 增加 refreshToken
```

## 四、实现步骤

### 步骤 1：只增加 Day05 新依赖

不要用一份不完整的 POM 覆盖 Day04。只在 `mall-user/pom.xml` 的 `dependencies` 末尾追加：

```xml
<!-- ==================== 第 4 次：Day05 验证码与会话续期 ==================== -->

<!-- Redis：保存验证码、发送限频和 refreshToken -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>

```

JJWT、Security、Validation 都已经由 Day03/Day04 引入，不要重复添加，也不要把 JJWT 从 `0.12.6` 改回 `0.12.5`。

如果以后要让自定义配置生成完整的 IDE 元数据，可以再把
`spring-boot-configuration-processor` 加入现有
`maven-compiler-plugin.annotationProcessorPaths`；它不是运行所必需的依赖。

在 `application.yml` 中追加 Redis 和业务配置，并把 Day04 的 accessToken 调整为 30 分钟：

```yaml
spring:
  data:
    redis:
      host: ${COURSE_MALL_REDIS_HOST:127.0.0.1}
      port: ${COURSE_MALL_REDIS_PORT:6379}
      password: ${COURSE_MALL_REDIS_PASSWORD:}
      database: 0
      timeout: 3s

jwt:
  # secret 沿用 Day04，这里不重复写
  expire-seconds: 1800

captcha:
  image-ttl: 5m
  sms-ttl: 5m
  sms-send-interval: 60s
  max-verify-attempts: 5

auth:
  token:
    refresh-ttl: 7d
```

`jwt.expire-seconds` 是修改 Day04 已有值，不要在 YAML 中再创建第二个同名
`jwt:` 节点。

不要配置 Lettuce 连接池却漏掉 `commons-pool2`。当前学习阶段先使用默认连接管理；需要调优时再同时加入连接池依赖和参数。

#### 使用类型安全的配置对象

`CaptchaProperties.java`：

```java
package com.mall.user.config.properties;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * 验证码有效期与限流配置。
 */
@Validated
@ConfigurationProperties(prefix = "captcha")
public record CaptchaProperties(
        @NotNull Duration imageTtl,
        @NotNull Duration smsTtl,
        @NotNull Duration smsSendInterval,
        @Min(1) int maxVerifyAttempts) {
}
```

`TokenProperties.java`：

```java
package com.mall.user.config.properties;

import jakarta.validation.constraints.NotNull;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.time.Duration;

/**
 * 登录令牌配置。
 */
@Validated
@ConfigurationProperties(prefix = "auth.token")
public record TokenProperties(@NotNull Duration refreshTtl) {
}
```

启动类增加 `@ConfigurationPropertiesScan`：

```java
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication(scanBasePackages = "com.mall")
@ConfigurationPropertiesScan("com.mall.user.config.properties")
@MapperScan("com.mall.user.mapper")
public class MallUserApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallUserApplication.class, args);
    }
}
```

相比到处写 `@Value`，配置类能集中管理字段、支持 `Duration`，IDE 也能提示配置项。

### 步骤 2：验证码 DTO、VO 与短信发送抽象

`ImageCaptchaVO.java`：

```java
package com.mall.user.vo;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 图形验证码响应。
 */
@Getter
@AllArgsConstructor
public class ImageCaptchaVO {
    private String uuid;
    private String image;
}
```

`SmsCaptchaRequest.java`：

```java
package com.mall.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

/**
 * 发送短信验证码请求。
 */
@Data
public class SmsCaptchaRequest {

    @NotBlank(message = "{validation.user.phone.invalid}")
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "{validation.user.phone.invalid}")
    private String phone;

    @NotBlank(message = "{validation.captcha.uuid.not-blank}")
    private String uuid;

    @NotBlank(message = "{validation.captcha.code.not-blank}")
    private String imageCode;
}
```

校验注解保存的是 `{message.key}`。`LocalValidatorFactoryBean` 负责解析它，异常处理器拿到的已经是当前语言文本。

真实短信供应商不要直接写死在 `CaptchaService` 中，先抽象接口：

`SmsSender.java`：

```java
package com.mall.user.service;

/**
 * 短信发送端口。
 */
public interface SmsSender {

    /**
     * 发送验证码。
     *
     * @param phone 手机号
     * @param code  验证码
     */
    void sendVerificationCode(String phone, String code);
}
```

`LoggingSmsSender.java`：

```java
package com.mall.user.service.impl;

import com.mall.user.service.SmsSender;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/**
 * 非生产环境短信模拟器。
 */
@Slf4j
@Service
@Profile("!prod")
public class LoggingSmsSender implements SmsSender {

    @Override
    public void sendVerificationCode(String phone, String code) {
        // 仅本地学习允许打印验证码；生产环境必须接短信供应商且禁止记录明文验证码。
        log.info("[mock-sms] phone={}, code={}", phone, code);
    }
}
```

生产环境没有 `SmsSender` Bean 会直接启动失败，这是好事：它强迫你先实现供应商适配器，避免误把 mock 带上线。

### 步骤 3：验证码服务——TTL、限频与原子消费

`CaptchaService.java`：

```java
package com.mall.user.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.user.config.properties.CaptchaProperties;
import com.mall.user.dto.SmsCaptchaRequest;
import com.mall.user.vo.ImageCaptchaVO;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.UUID;

/**
 * 图形验证码与短信验证码服务。
 */
@Service
@RequiredArgsConstructor
public class CaptchaService {

    private static final String IMAGE_PREFIX = "course-mall:captcha:image:";
    private static final String IMAGE_ATTEMPT_PREFIX = "course-mall:captcha:image-attempt:";
    private static final String SMS_PREFIX = "course-mall:captcha:sms:";
    private static final String SMS_ATTEMPT_PREFIX = "course-mall:captcha:sms-attempt:";
    private static final String SMS_LIMIT_PREFIX = "course-mall:captcha:sms-limit:";

    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    /**
     * 返回值：1=校验成功并删除；0=错误；-1=不存在或已过期。
     *
     * <p>校验、错误次数累加和成功删除都在 Redis 内一次完成，兼容 Redis 3.x。</p>
     */
    private static final DefaultRedisScript<Long> VERIFY_AND_CONSUME_SCRIPT =
            new DefaultRedisScript<>("""
                    local code = redis.call('GET', KEYS[1])
                    if not code then
                        return -1
                    end

                    if string.upper(code) == string.upper(ARGV[1]) then
                        redis.call('DEL', KEYS[1])
                        redis.call('DEL', KEYS[2])
                        return 1
                    end

                    local attempts = redis.call('INCR', KEYS[2])
                    if attempts == 1 then
                        local ttl = redis.call('TTL', KEYS[1])
                        if ttl < 1 then ttl = 300 end
                        redis.call('EXPIRE', KEYS[2], ttl)
                    end

                    if attempts >= tonumber(ARGV[2]) then
                        redis.call('DEL', KEYS[1])
                        redis.call('DEL', KEYS[2])
                    end
                    return 0
                    """, Long.class);

    private final StringRedisTemplate redisTemplate;
    private final CaptchaProperties properties;
    private final SmsSender smsSender;

    /**
     * 生成四位图形验证码。
     *
     * @return uuid 与 Base64 图片
     */
    public ImageCaptchaVO generateImageCaptcha() {
        String uuid = UUID.randomUUID().toString().replace("-", "");
        String code = randomTextCode(4);

        redisTemplate.opsForValue().set(
                IMAGE_PREFIX + uuid,
                code,
                properties.imageTtl());

        return new ImageCaptchaVO(uuid, drawImage(code));
    }

    /**
     * 图形验证码通过后发送短信验证码。
     *
     * @param request 请求参数
     */
    public void sendSmsCaptcha(SmsCaptchaRequest request) {
        String limitKey = SMS_LIMIT_PREFIX + request.getPhone();
        // 先做一次快速检查，避免明显处于冷却期时还消耗用户刚输入的图形验证码。
        if (Boolean.TRUE.equals(redisTemplate.hasKey(limitKey))) {
            throw new BizException(ErrorCode.SMS_CAPTCHA_TOO_FREQUENT);
        }

        consumeCode(
                IMAGE_PREFIX + request.getUuid(),
                IMAGE_ATTEMPT_PREFIX + request.getUuid(),
                request.getImageCode(),
                ErrorCode.IMAGE_CAPTCHA_EXPIRED,
                ErrorCode.IMAGE_CAPTCHA_INVALID);

        Boolean firstRequest = redisTemplate.opsForValue().setIfAbsent(
                limitKey,
                "1",
                properties.smsSendInterval());
        if (!Boolean.TRUE.equals(firstRequest)) {
            throw new BizException(ErrorCode.SMS_CAPTCHA_TOO_FREQUENT);
        }

        String code = randomNumberCode(6);
        String codeKey = SMS_PREFIX + request.getPhone();
        String attemptKey = SMS_ATTEMPT_PREFIX + request.getPhone();

        redisTemplate.delete(attemptKey);
        redisTemplate.opsForValue().set(codeKey, code, properties.smsTtl());

        try {
            smsSender.sendVerificationCode(request.getPhone(), code);
        } catch (RuntimeException e) {
            // 供应商发送失败时回滚验证码和限频键，允许用户立即重试。
            redisTemplate.delete(List.of(
                    codeKey,
                    limitKey));
            throw new BizException(ErrorCode.OPERATION_FAILED);
        }
    }

    /**
     * 注册时校验并消费短信验证码。
     *
     * @param phone 手机号
     * @param code  用户提交的验证码
     */
    public void consumeSmsCaptcha(String phone, String code) {
        consumeCode(
                SMS_PREFIX + phone,
                SMS_ATTEMPT_PREFIX + phone,
                code,
                ErrorCode.SMS_CAPTCHA_EXPIRED,
                ErrorCode.SMS_CAPTCHA_INVALID);
    }

    private void consumeCode(
            String codeKey,
            String attemptKey,
            String submittedCode,
            ErrorCode expiredError,
            ErrorCode invalidError) {
        Long result = redisTemplate.execute(
                VERIFY_AND_CONSUME_SCRIPT,
                List.of(codeKey, attemptKey),
                submittedCode,
                String.valueOf(properties.maxVerifyAttempts()));

        if (result == null) {
            throw new BizException(ErrorCode.SYSTEM_ERROR);
        }
        if (result == -1L) {
            throw new BizException(expiredError);
        }
        if (result != 1L) {
            throw new BizException(invalidError);
        }
    }

    private String randomTextCode(int length) {
        StringBuilder value = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            value.append(CODE_CHARS.charAt(
                    SECURE_RANDOM.nextInt(CODE_CHARS.length())));
        }
        return value.toString();
    }

    private String randomNumberCode(int length) {
        StringBuilder value = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            value.append(SECURE_RANDOM.nextInt(10));
        }
        return value.toString();
    }

    private String drawImage(String code) {
        int width = 120;
        int height = 40;
        BufferedImage image =
                new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D graphics = image.createGraphics();

        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);

            for (int i = 0; i < 6; i++) {
                graphics.setColor(randomColor(180));
                graphics.drawLine(
                        SECURE_RANDOM.nextInt(width),
                        SECURE_RANDOM.nextInt(height),
                        SECURE_RANDOM.nextInt(width),
                        SECURE_RANDOM.nextInt(height));
            }

            graphics.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 28));
            for (int i = 0; i < code.length(); i++) {
                graphics.setColor(randomColor(140));
                graphics.drawString(
                        String.valueOf(code.charAt(i)),
                        18 + i * 24,
                        29 + SECURE_RANDOM.nextInt(4));
            }
        } finally {
            graphics.dispose();
        }

        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (!ImageIO.write(image, "png", output)) {
                throw new IOException("PNG writer is unavailable");
            }
            return "data:image/png;base64,"
                    + Base64.getEncoder().encodeToString(output.toByteArray());
        } catch (IOException e) {
            throw new BizException(ErrorCode.SYSTEM_ERROR);
        }
    }

    private Color randomColor(int upperBound) {
        return new Color(
                SECURE_RANDOM.nextInt(upperBound),
                SECURE_RANDOM.nextInt(upperBound),
                SECURE_RANDOM.nextInt(upperBound));
    }
}
```

为什么不用“先 `GET`、成功后再 `DEL`”？因为两个并发请求可能同时读到同一个验证码并都通过。Lua 脚本把读取、判断、计数和删除变成一次原子操作，同时兼容你本机的 Redis 3.x。

::: tip 💡 面试题：为什么验证码用 SecureRandom？
`SecureRandom` 的输出不可预测，适合验证码和令牌；`Random` 只适合普通模拟数据。安全随机数不能用时间戳、UUID 截断或 `Math.random()` 代替。
:::

### 步骤 4：验证码接口

`CaptchaController.java`：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import com.mall.user.dto.SmsCaptchaRequest;
import com.mall.user.service.CaptchaService;
import com.mall.user.vo.ImageCaptchaVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "验证码")
@RestController
@RequestMapping("/api/captcha")
@RequiredArgsConstructor
public class CaptchaController {

    private final CaptchaService captchaService;

    @Operation(summary = "获取图形验证码")
    @GetMapping("/image")
    public Result<ImageCaptchaVO> image() {
        return Result.ok(captchaService.generateImageCaptcha());
    }

    @Operation(summary = "发送短信验证码")
    @PostMapping("/sms")
    public Result<Void> sms(@Valid @RequestBody SmsCaptchaRequest request) {
        captchaService.sendSmsCaptcha(request);
        return Result.ok();
    }
}
```

### 步骤 5：只在注册时消费短信验证码

Day02 目前只有用户名唯一索引。手机号开始承担验证码身份后，也必须由数据库兜底唯一性；
确认现有数据没有重复后执行一次：

```sql
ALTER TABLE `user`
    ADD UNIQUE KEY `uk_phone` (`phone`),
    ADD UNIQUE KEY `uk_email` (`email`);
```

MySQL 唯一索引允许多个 `NULL`，所以可选邮箱仍然可以为空。

在 Day03 的 `UserRegisterDTO` 增加手机号必填和短信验证码：

```java
@NotBlank(message = "{validation.user.phone.invalid}")
@Pattern(regexp = "^1[3-9]\\d{9}$", message = "{validation.user.phone.invalid}")
private String phone;

@NotBlank(message = "{validation.sms.code.not-blank}")
private String smsCode;
```

在 `UserServiceImpl` 注入 `CaptchaService`：

```java
private final CaptchaService captchaService;
```

完成用户名唯一性检查后，再检查手机号；否则 Day03 把所有
`DuplicateKeyException` 都翻译为 `USERNAME_EXISTS`，手机号冲突时文案会错误：

```java
Long phoneCount = userMapper.selectCount(
        new LambdaQueryWrapper<User>()
                .eq(User::getPhone, dto.getPhone()));
if (phoneCount > 0) {
    throw new BizException(ErrorCode.PHONE_EXISTS);
}
```

然后在写数据库之前消费验证码：

```java
captchaService.consumeSmsCaptcha(dto.getPhone(), dto.getSmsCode());

User user = userConverter.toEntity(dto);
if (!StringUtils.hasText(user.getEmail())) {
    // 唯一索引下应把“未填写”统一存成 NULL，避免多个空字符串互相冲突。
    user.setEmail(null);
}
user.setPassword(passwordEncoder.encode(dto.getPassword()));
user.setStatus(1);
userMapper.insert(user);
```

上面需要导入 `org.springframework.util.StringUtils`。

验证码采用“验证成功立即作废”的安全语义。即使后续数据库写入失败，也不能让同一个验证码再次使用；用户需要重新获取验证码。

唯一索引仍是并发下的最终保障。生产代码可根据约束名
`uk_username`、`uk_phone`、`uk_email` 映射成对应错误码；
不要把所有唯一索引冲突都固定返回“用户名已存在”。

> 密码登录仍然只校验账号和密码。若要防撞库，应记录失败次数，达到阈值后再要求图形验证码，而不是每次登录都强制短信验证。

### 步骤 6：refreshToken 轮换服务

先把 Day04 的 `LoginVO` 替换为双令牌响应：

```java
package com.mall.user.vo;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 登录或刷新成功后的双令牌响应。
 */
@Getter
@AllArgsConstructor
public class LoginVO {
    private String accessToken;
    private String refreshToken;
    private String tokenType;
    private long expiresIn;
}
```

`TokenService.java`：

```java
package com.mall.user.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.user.config.properties.TokenProperties;
import com.mall.user.entity.User;
import com.mall.user.mapper.UserMapper;
import com.mall.user.util.JwtUtil;
import com.mall.user.vo.LoginVO;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

/**
 * accessToken 与 refreshToken 生命周期管理。
 */
@Service
@RequiredArgsConstructor
public class TokenService {

    private static final String REFRESH_PREFIX = "course-mall:auth:refresh:";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    /**
     * 原子读取并删除 refreshToken，保证同一令牌并发刷新时只有一个请求成功。
     */
    private static final DefaultRedisScript<String> GET_AND_DELETE_SCRIPT =
            new DefaultRedisScript<>("""
                    local value = redis.call('GET', KEYS[1])
                    if value then
                        redis.call('DEL', KEYS[1])
                    end
                    return value
                    """, String.class);

    private final StringRedisTemplate redisTemplate;
    private final UserMapper userMapper;
    private final JwtUtil jwtUtil;
    private final TokenProperties properties;

    /**
     * 登录成功后签发一对令牌。
     *
     * @param user 已认证用户
     * @return 双令牌
     */
    public LoginVO issue(User user) {
        String accessToken =
                jwtUtil.generateToken(user.getId(), user.getUsername());
        String refreshToken = randomRefreshToken();

        // Redis 只保存 refreshToken 的 SHA-256 摘要，避免 Redis 泄露时直接暴露原令牌。
        redisTemplate.opsForValue().set(
                refreshKey(refreshToken),
                user.getId().toString(),
                properties.refreshTtl());

        return new LoginVO(
                accessToken,
                refreshToken,
                "Bearer",
                jwtUtil.getExpireSeconds());
    }

    /**
     * 消费旧 refreshToken，并轮换出一对新令牌。
     *
     * @param refreshToken 旧 refreshToken
     * @return 新双令牌
     */
    public LoginVO refresh(String refreshToken) {
        String userId = redisTemplate.execute(
                GET_AND_DELETE_SCRIPT,
                List.of(refreshKey(refreshToken)));
        if (userId == null) {
            throw new BizException(ErrorCode.REFRESH_TOKEN_INVALID);
        }

        User user = userMapper.selectById(Long.valueOf(userId));
        if (user == null) {
            throw new BizException(ErrorCode.REFRESH_TOKEN_INVALID);
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw new BizException(ErrorCode.ACCOUNT_DISABLED);
        }

        // rotation：旧 refreshToken 已删除，返回新的 accessToken + refreshToken。
        return issue(user);
    }

    /**
     * 当前设备登出。重复调用仍然成功，保持接口幂等。
     *
     * @param refreshToken 当前 refreshToken
     */
    public void logout(String refreshToken) {
        redisTemplate.delete(refreshKey(refreshToken));
    }

    private String randomRefreshToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(bytes);
    }

    private String refreshKey(String refreshToken) {
        try {
            byte[] digest = MessageDigest
                    .getInstance("SHA-256")
                    .digest(refreshToken.getBytes(StandardCharsets.UTF_8));
            return REFRESH_PREFIX + HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // Java 标准运行时必须提供 SHA-256；缺失属于不可恢复的运行环境错误。
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
```

这一版比“查询 refreshToken 后继续续期 7 天”更安全：

- 每次刷新都会删除旧 refreshToken 并返回新 refreshToken。
- Lua 保证并发刷新时旧 token 只能成功一次。
- Redis 中只保存 token 摘要，不保存客户端持有的原始 refreshToken。
- 不做无限滑动续期；每个新 refreshToken 都有明确的 7 天 TTL。

轮换也有代价：如果后端已经轮换成功，但响应在网络中丢失，客户端手里的旧 token 已失效，只能重新登录。大型系统会增加很短的重试宽限窗口和“令牌家族”复用检测，当前阶段先不展开。

当前 refreshToken 是不透明随机串；Redis key 消失后，服务端无法再区分“自然过期”和
“已登出/已轮换”，所以统一返回 `REFRESH_TOKEN_INVALID`。若必须精确区分，需要让令牌
自带受保护的过期信息或额外保留过期记录。

### 步骤 7：接入登录、刷新和登出接口

Day04 的 `LoginController` 不再直接调用 `JwtUtil`，改为注入 `TokenService`：

```java
private final AuthenticationManager authenticationManager;
private final TokenService tokenService;
private final UserConverter userConverter;

@PostMapping("/login")
public Result<LoginVO> login(@Valid @RequestBody LoginRequest request) {
    Authentication authentication;
    try {
        authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.getUsername(),
                        request.getPassword()));
    } catch (DisabledException e) {
        throw new BizException(ErrorCode.ACCOUNT_DISABLED);
    } catch (AuthenticationException e) {
        throw new BizException(ErrorCode.BAD_CREDENTIALS);
    }

    LoginUser loginUser = (LoginUser) authentication.getPrincipal();
    return Result.ok(tokenService.issue(loginUser.getUser()));
}
```

`RefreshTokenRequest.java`：

```java
package com.mall.user.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 刷新或登出请求。
 */
@Data
public class RefreshTokenRequest {

    @NotBlank(message = "{validation.auth.refresh-token.not-blank}")
    private String refreshToken;
}
```

`TokenController.java`：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import com.mall.user.dto.RefreshTokenRequest;
import com.mall.user.service.TokenService;
import com.mall.user.vo.LoginVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "登录会话")
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class TokenController {

    private final TokenService tokenService;

    @Operation(summary = "刷新登录令牌")
    @PostMapping("/refresh")
    public Result<LoginVO> refresh(
            @Valid @RequestBody RefreshTokenRequest request) {
        return Result.ok(tokenService.refresh(request.getRefreshToken()));
    }

    @Operation(summary = "退出当前设备")
    @PostMapping("/logout")
    public Result<Void> logout(
            @Valid @RequestBody RefreshTokenRequest request) {
        tokenService.logout(request.getRefreshToken());
        return Result.ok();
    }
}
```

### 步骤 8：更新 Security 白名单

验证码、登录、注册和刷新都发生在“尚未拥有有效 accessToken”时，必须在 `SecurityConfig` 放行：

```java
import org.springframework.http.HttpMethod;

.authorizeHttpRequests(auth -> auth
        .requestMatchers(HttpMethod.GET,
                "/api/captcha/image",
                "/doc.html",
                "/webjars/**",
                "/v3/api-docs/**",
                "/swagger-ui/**",
                "/favicon.ico")
        .permitAll()
        .requestMatchers(HttpMethod.POST,
                "/api/captcha/sms",
                "/api/user/register",
                "/api/user/login",
                "/api/auth/refresh",
                "/api/auth/logout")
        .permitAll()
        .anyRequest()
        .authenticated())
```

`/api/auth/refresh` 必须放行，否则 accessToken 过期时反而无法刷新。`logout` 只凭 refreshToken 就能吊销当前会话，并且接口幂等，因此也可以放行。

> 如果未来 Web 端把 refreshToken 放进 HttpOnly Cookie，这两个接口会重新涉及 CSRF；本文面向 Flutter/JSON 请求，refreshToken 不依赖浏览器自动携带的 Cookie。

### 步骤 9：为什么这套 i18n 能正常工作？

- DTO 的 `{validation...}` 由 `LocalValidatorFactoryBean` 解析。
- `CaptchaService`、`TokenService` 只抛 `new BizException(ErrorCode.Xxx)`。
- `GlobalExceptionHandler` 返回带消息键的 `Result`。
- Controller 响应会经过 `ResultMessageAdvice`，在 Jackson 序列化前翻译。
- Day04 的 Security 过滤器响应不会经过 MVC，所以已经在 `writeJson` 中用 `LocaleResolver + MessageSource` 单独翻译。

因此业务代码里不再出现“验证码错误”“refreshToken 无效”等硬编码中文。

## 五、启动与验收

先确认 Redis：

```bash
redis-cli ping
```

返回 `PONG` 后启动 `mall-user`。

### 1. 获取图形验证码

```bash
curl http://localhost:8080/api/captcha/image
```

把返回的 `uuid` 和 Base64 图片保存下来。

### 2. 发送短信验证码

```bash
curl -X POST http://localhost:8080/api/captcha/sms \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","uuid":"替换为真实uuid","imageCode":"替换为图片字符"}'
```

非生产环境日志会显示 mock 验证码。60 秒内再次发送应返回 `SMS_CAPTCHA_TOO_FREQUENT` 对应文案。

查看 Redis 时使用 `SCAN`，不要在生产环境执行阻塞式 `KEYS *`：

```bash
redis-cli SCAN 0 MATCH "course-mall:captcha:*" COUNT 100
```

### 3. 注册并登录

注册请求增加 `phone` 和 `smsCode`：

```bash
curl -X POST http://localhost:8080/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"Mall@123456","nickname":"张三","phone":"13800138000","smsCode":"短信中的6位数字"}'
```

登录成功后应同时得到：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "安全随机字符串",
    "tokenType": "Bearer",
    "expiresIn": 1800
  }
}
```

### 4. 验证 refreshToken rotation

```bash
curl -X POST http://localhost:8080/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"登录返回的refreshToken"}'
```

响应会返回一对新令牌。再次提交旧 refreshToken，应该失败；这证明旧令牌已经被原子消费。

### 5. 登出

```bash
curl -X POST http://localhost:8080/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"刷新后返回的新refreshToken"}'
```

再次刷新应失败。注意：登出前已经签发的 accessToken 仍可用到 30 分钟过期；如果业务要求“踢下线立即生效”，后续需要 tokenVersion 或 Redis 黑名单。

### 6. 验证英文响应

故意提交错误图形验证码：

```bash
curl -X POST http://localhost:8080/api/captcha/sms \
  -H "Content-Type: application/json" \
  -H "Accept-Language: en" \
  -d '{"phone":"13800138000","uuid":"真实uuid","imageCode":"WRONG"}'
```

`message` 应返回英文，而不是消息键或硬编码中文。

## 六、✅ 完成后回填

- [ ] Redis 可以连接，验证码 key 都有 TTL。
- [ ] 图形验证码最多允许配置次数的错误尝试，成功后不可重复使用。
- [ ] 60 秒短信限频生效，业务代码没有硬编码中文响应。
- [ ] 注册成功后短信验证码不可再次使用。
- [ ] 登录返回 accessToken 与 refreshToken。
- [ ] 刷新后旧 refreshToken 失效，新 refreshToken 可用。
- [ ] 登出后 refreshToken 失效，但能解释为什么 accessToken 不会立刻失效。
- [ ] `Accept-Language: en` 能得到英文校验/业务提示。
- [ ] 踩坑记录：
- [ ] 疑问：

## 七、知识点索引

| 知识点 | 对应文档 |
|---|---|
| Redis TTL、SET NX、Lua 原子脚本、SCAN | [Redis](/learn_database/Redis) |
| `@ConfigurationProperties` 与 `Duration` | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| `@Valid` 与国际化校验消息 | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| accessToken、refreshToken、rotation、吊销 | [Spring Security](/learn_backend/java/基础/Spring Security) |
| `SecureRandom`、SHA-256 | [并发编程](/learn_backend/java/Java核心/并发编程) |

## 八、我下次会追问的问题

1. 为什么注册短信验证码要原子“校验并删除”，不能先 `GET` 再 `DEL`？
2. `setIfAbsent(key, value, ttl)` 对应 Redis 的什么语义？为什么一定要同时带 TTL？
3. 为什么 refreshToken 要存 Redis，而 accessToken 通常不存？rotation 解决了什么问题？
4. 为什么 `/api/auth/refresh` 必须放进白名单？它如何证明调用者身份？
5. 为什么 Security 过滤器里的错误不能依赖 `ResultMessageAdvice` 做国际化？
