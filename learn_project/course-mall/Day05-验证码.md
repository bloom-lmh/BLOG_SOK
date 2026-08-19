# Day 05 · 验证码

> **今天目标**：给注册/登录加上「图形验证码 + 短信验证码」，并把登录态刷新（refresh token）和登出也一并做了。三个功能的共同点是——**都靠 Redis 存储**：验证码有有效期、refresh token 要能随时吊销。今天彻底搞懂「什么数据该放 Redis、key 怎么设计、TTL 怎么定」。

## 一、前置条件

- 已完成 Day 01（Maven 多模块骨架 + 统一返回 + 全局异常）
- 已完成 Day 02（`user` 表已建好）
- 已完成 Day 03（用户服务：注册/查询、`@Valid` 参数校验）
- 已完成 Day 04（登录鉴权：JWT 生成/解析、登录接口返回 accessToken）
- Redis 已装（本机 `localhost:6379` ✅，Windows 可用 Docker 或 `memurai`，Linux 直接 `apt install redis`）

> ⚠️ 今天的「登录态刷新/登出」是 Day 04 JWT 的延伸。Day 04 的登录接口返回时，**要多存一个 refreshToken 到 Redis**（步骤 5 会讲），否则刷新接口拿不到可校验的 refreshToken。

## 二、为什么验证码要存 Redis？（先想清楚再写）

验证码本质是「一段临时、会过期、用完作废的短字符串」。存哪？

| 方案 | 问题 |
|---|---|
| 存 `HttpSession` | ① 无状态 + 分布式下 session 不共享，两台机器间验证码对不上；② 依赖 Tomcat 的 session，微服务拆开后失效 |
| 存 MySQL | 杀鸡用牛刀：验证码生命周期只有几分钟，写库还要手动清理过期数据，IO 开销大 |
| 存 Redis ✅ | 天生带 **TTL（过期时间）**，写进去设 5 分钟自动删；内存读写快；多实例共享同一份 |

::: tip 💡 面试题：为什么验证码存 Redis 而不是 HttpSession 或 MySQL？
**一句话**：Redis 有原生 TTL（过期自动删），读写快、多实例共享；HttpSession 在分布式/无状态下会失效，MySQL 存几分钟就过期的数据是浪费还要手动清理。详见 [Redis](/learn_database/Redis)。
:::

另外注意验证码的两条铁律：

1. **一定要设 TTL** —— 不设就是永久 Key，Redis 会被垃圾数据撑爆（内存泄漏）。
2. **一次性使用** —— 校验通过或过期就该删，否则同一个验证码能被反复拿来爆破。

## 三、步骤

### 步骤 1：加 Redis 依赖 + 配置

`mall-user/pom.xml`（在 Day 01 基础上新增三个依赖，完整版如下）：

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
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>

        <!-- Redis 启动器：自动装配 StringRedisTemplate，验证码/登录态都存 Redis -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>
        </dependency>

        <!-- 参数校验：@Valid + @NotBlank/@Pattern，发短信前校验入参 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>

        <!-- JWT：Day04 已引入；今天 refresh 时要重新生成 accessToken -->
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-api</artifactId>
            <version>0.12.5</version>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-impl</artifactId>
            <version>0.12.5</version>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>io.jsonwebtoken</groupId>
            <artifactId>jjwt-jackson</artifactId>
            <version>0.12.5</version>
            <scope>runtime</scope>
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

`mall-user/src/main/resources/application.yml`（在 Day 01 基础上加 Redis 和自定义配置）：

```yaml
server:
  port: 8080

spring:
  application:
    name: mall-user
  data:
    redis:
      host: localhost          # Redis 地址
      port: 6379
      # password:              # 如果 Redis 设了密码就填
      timeout: 3s              # 连接超时
      lettuce:                 # lettuce 是默认客户端（底层 Netty，线程安全）
        pool:
          max-active: 8        # 连接池最大连接数（commons-pool2 生效，可加依赖）
          max-idle: 8
          min-idle: 0

# 自定义配置（用 @Value 读，避免魔法数字散落在代码里）
mall:
  jwt:
    # 密钥必须 >= 32 字节（HS256 要求），生产环境放环境变量，别硬编码进代码
    secret: course-mall-jwt-secret-key-change-me-in-prod-0123456789abcdef
    expire: 1800               # accessToken 有效期 30 分钟（秒）
```

::: tip 💡 面试题：`StringRedisTemplate` 和 `RedisTemplate` 有什么区别？什么时候用哪个？
**一句话**：`StringRedisTemplate` 是 `RedisTemplate<String, String>` 的特例，key/value 都用字符串序列化，**存验证码、token 这种纯字符串刚刚好**；`RedisTemplate` 默认用 JDK 序列化（存对象会变一坨二进制、不可读），想存对象要自定义 JSON 序列化器。今天全部用 String，所以用 `StringRedisTemplate` 最省事。详见 [Redis](/learn_database/Redis)。
:::

### 步骤 2：图形验证码

返回给前端一张 base64 图片 + 一个 `uuid`。前端把图片显示出来，用户照着输入，提交时把 `uuid` + 用户输入一起传回来，后端去 Redis 里比对。

VO `ImageCaptchaVO.java`（`com/mall/user/vo/ImageCaptchaVO.java`）：

```java
package com.mall.user.vo;

import lombok.AllArgsConstructor;
import lombok.Data;

// VO：返回给前端的展示对象，字段只留前端需要的（uuid + 图片），不暴露内部细节
@Data
@AllArgsConstructor
public class ImageCaptchaVO {
    private String uuid;   // 验证码唯一标识，前端提交时带回来，后端据此去 Redis 找答案
    private String image;  // base64 图片，前端 <img :src="image"> 直接显示
}
```

服务 `CaptchaService.java`（`com/mall/user/service/CaptchaService.java`）：

```java
package com.mall.user.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.user.dto.SmsCaptchaRequest;
import com.mall.user.vo.ImageCaptchaVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
// @RequiredArgsConstructor：给 final 字段自动生成构造器，替代手写 @Autowired 构造注入
@RequiredArgsConstructor
public class CaptchaService {

    private static final String IMAGE_KEY      = "captcha:image:";        // 图形验证码 key 前缀
    private static final String SMS_KEY        = "captcha:sms:";          // 短信验证码 key 前缀
    private static final String SMS_LIMIT_KEY  = "captcha:sms:limit:";    // 短信发送频率限制 key
    // 去掉易混淆的 I / O / 0 / 1，避免用户看不清楚反复输错
    private static final String CODE_CHARS     = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final StringRedisTemplate stringRedisTemplate;

    /**
     * 生成图形验证码：随机 4 位字符 → 存 Redis（带 TTL）→ 画成图片返回
     */
    public ImageCaptchaVO generateImageCaptcha() {
        String code = randomCode(4);
        String uuid = UUID.randomUUID().toString().replace("-", "");

        // 存 Redis：key 带 uuid，5 分钟过期。TTL 是关键——不设就会变成永久垃圾数据
        stringRedisTemplate.opsForValue().set(IMAGE_KEY + uuid, code, 5, TimeUnit.MINUTES);

        String base64 = drawImage(code);
        return new ImageCaptchaVO(uuid, base64);
    }

    /**
     * 发送短信验证码：先校验图形验证码（防脚本直刷短信接口）→ 限频 → 生成 6 位数字存 Redis
     */
    public void sendSmsCaptcha(SmsCaptchaRequest req) {
        // ① 校验图形验证码：短信是花钱/有成本的，必须先过图形验证码挡住机器
        String imageCode = stringRedisTemplate.opsForValue().get(IMAGE_KEY + req.getUuid());
        if (imageCode == null) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "图形验证码已过期，请刷新");
        }
        if (!imageCode.equalsIgnoreCase(req.getImageCode())) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "图形验证码错误");
        }
        // 图形验证码一次性使用，用完即删
        stringRedisTemplate.delete(IMAGE_KEY + req.getUuid());

        // ② 频率限制：setIfAbsent 只在 key 不存在时才写入成功（等价 Redis SETNX）
        //    返回 false 说明 60 秒内已经发过一次了，直接拒绝
        Boolean first = stringRedisTemplate.opsForValue()
                .setIfAbsent(SMS_LIMIT_KEY + req.getPhone(), "1", 60, TimeUnit.SECONDS);
        if (Boolean.FALSE.equals(first)) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "发送太频繁，请稍后再试");
        }

        // ③ 生成 6 位数字验证码存 Redis，5 分钟过期
        String code = randomNumCode(6);
        stringRedisTemplate.opsForValue().set(SMS_KEY + req.getPhone(), code, 5, TimeUnit.MINUTES);

        // ④ 真实项目这里接阿里云/腾讯云短信 SDK，今天是 mock：打日志代替真实发送
        log.info("【mock短信】向 {} 发送验证码：{}", req.getPhone(), code);
    }

    /**
     * 校验短信验证码（注册/登录接口里调用）。只读不删，删除交给业务方调用 clearSmsCaptcha
     */
    public boolean verifySmsCaptcha(String phone, String code) {
        String saved = stringRedisTemplate.opsForValue().get(SMS_KEY + phone);
        return saved != null && saved.equals(code);
    }

    /** 校验通过后删除，防止同一个验证码被反复使用 */
    public void clearSmsCaptcha(String phone) {
        stringRedisTemplate.delete(SMS_KEY + phone);
    }

    // ---------- 私有工具方法 ----------

    private String randomCode(int len) {
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) {
            sb.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
        }
        return sb.toString();
    }

    private String randomNumCode(int len) {
        SecureRandom random = new SecureRandom();
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < len; i++) {
            sb.append(random.nextInt(10));
        }
        return sb.toString();
    }

    /** 用 JDK 自带的 AWT 画一张带干扰线的验证码图，转 base64（省一个第三方验证码依赖） */
    private String drawImage(String code) {
        int width = 120, height = 40;
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        Random random = new Random();

        g.setColor(Color.WHITE);                 // 白色背景
        g.fillRect(0, 0, width, height);

        for (int i = 0; i < 6; i++) {            // 干扰线：增加机器识别难度
            g.setColor(new Color(random.nextInt(255), random.nextInt(255), random.nextInt(255)));
            g.drawLine(random.nextInt(width), random.nextInt(height),
                       random.nextInt(width), random.nextInt(height));
        }

        g.setFont(new Font("Arial", Font.BOLD, 28));
        for (int i = 0; i < code.length(); i++) {
            g.setColor(new Color(random.nextInt(150), random.nextInt(150), random.nextInt(150)));
            g.drawString(String.valueOf(code.charAt(i)), 20 + i * 22, 28 + random.nextInt(5));
        }
        g.dispose();

        try (ByteArrayOutputStream bos = new ByteArrayOutputStream()) {
            ImageIO.write(image, "png", bos);
            return "data:image/png;base64," + Base64.getEncoder().encodeToString(bos.toByteArray());
        } catch (IOException e) {
            throw new BizException(ErrorCode.SYSTEM_ERROR);
        }
    }
}
```

::: tip 💡 面试题：生成随机验证码为什么用 `SecureRandom` 而不是 `Random`？
**一句话**：`Random` 是可预测的线性同余伪随机数，攻击者收集几个输出就能推出后面的值、预测验证码；`SecureRandom` 用系统熵源（加密强度随机），不可预测。**凡是安全相关（验证码、token、盐）都用 `SecureRandom`**。详见 [并发编程](/learn_backend/java/Java核心/并发编程)。
:::

控制器 `CaptchaController.java`（`com/mall/user/controller/CaptchaController.java`）：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import com.mall.user.dto.SmsCaptchaRequest;
import com.mall.user.service.CaptchaService;
import com.mall.user.vo.ImageCaptchaVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/captcha")
@RequiredArgsConstructor
public class CaptchaController {

    private final CaptchaService captchaService;

    /** 获取图形验证码 */
    @GetMapping("/image")
    public Result<ImageCaptchaVO> image() {
        return Result.ok(captchaService.generateImageCaptcha());
    }

    /** 发送短信验证码（需先通过图形验证码） */
    @PostMapping("/sms")
    public Result<Void> sms(@RequestBody @Valid SmsCaptchaRequest req) {
        captchaService.sendSmsCaptcha(req);
        return Result.ok();
    }
}
```

### 步骤 3：短信验证码入参 + 参数校验异常处理

DTO `SmsCaptchaRequest.java`（`com/mall/user/dto/SmsCaptchaRequest.java`）：

```java
package com.mall.user.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;

// DTO：接收前端入参。校验注解在「进门」时就把非法请求挡住，Service 里只处理合法数据
@Data
public class SmsCaptchaRequest {
    @NotBlank(message = "手机号不能为空")
    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式错误")   // 大陆手机号正则
    private String phone;

    @NotBlank(message = "uuid 不能为空")
    private String uuid;          // 图形验证码的标识，用来去 Redis 找答案

    @NotBlank(message = "图形验证码不能为空")
    private String imageCode;     // 用户照着图片输入的字符
}
```

Day 01 的 `GlobalExceptionHandler` 只处理了 `BizException` 和兜底 `Exception`。`@Valid` 校验失败会抛 `MethodArgumentNotValidException`，如果没接住会被兜底当成 500。给它补一个 handler（`com/mall/common/exception/GlobalExceptionHandler.java` 里加）：

```java
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;

    // 参数校验失败（@Valid 注解触发）：取第一条错误提示返回给前端，而不是笼统的 500
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<Void> handleValid(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .findFirst()
                .orElse(ErrorCode.PARAM_ERROR.getMessage());
        return Result.fail(ErrorCode.PARAM_ERROR.getCode(), msg);
    }
```

> 如果 Day 03 已经加过这个 handler，跳过即可，别重复加。

::: tip 💡 面试题：`@Valid` 校验失败抛的异常为什么必须单独处理，不能走兜底？
**一句话**：校验失败是「用户输错了」，应该返回 400 + 具体哪错了；走兜底会变成 500「系统繁忙」，既误导用户又不算业务异常。所以异常处理要「越具体的异常越优先匹配」，兜底放最后。详见 [Spring MVC](/learn_backend/java/基础/Spring MVC)。
:::

### 步骤 4：把验证码校验接进注册/登录（复用，不重复造轮子）

Day 03 的注册、Day 04 的登录接口里，在真正落库/发 token 之前，先校验短信验证码：

```java
// 在注册/登录接口里，拿到 phone + smsCode 后：
if (!captchaService.verifySmsCaptcha(req.getPhone(), req.getSmsCode())) {
    throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "短信验证码错误或已过期");
}
// ... 业务处理成功后：
captchaService.clearSmsCaptcha(req.getPhone());   // 用完删掉，防重复使用
```

> `verifySmsCaptcha` 和 `clearSmsCaptcha` 拆成两步，是因为「读」和「删」分属不同时刻：校验通过到业务成功之间可能还有别的逻辑，成功后才该删。如果校验一通过就删，业务失败后用户得重发一条，体验差。

::: tip 💡 面试题：验证码「一次性使用」为什么要用 `GETDEL`（读并删）而不是「先 GET 再 DEL」？
**一句话**：`GET` 和 `DEL` 是两条命令、中间有间隙，并发下两个请求可能同时读到同一个验证码、都校验通过；Redis 6.2+ 的 `GETDEL` 是原子命令，读的同时就删了，第二个请求读到的必然是 null。Spring Data Redis 里是 `opsForValue().getAndDelete(key)`。详见 [Redis](/learn_database/Redis)。
:::

### 步骤 5：登录态刷新（refresh token 存 Redis）

**为什么需要刷新？** accessToken 是 JWT、无状态、过期只能重登。为了「既安全又不用频繁登录」，业界用**双 token**：

- `accessToken`：短（30 分钟），无状态 JWT，每次请求都带，过期了不去改它。
- `refreshToken`：长（7 天），一个随机字符串，**存 Redis**，专门用来换新的 accessToken。

accessToken 短，即使泄露影响窗口小；refreshToken 长且能随时从 Redis 删除（吊销），泄露了服务端能主动作废。

JWT 工具 `JwtUtil.java`（`com/mall/user/util/JwtUtil.java`，Day 04 已有，这里列出完整版方便对照）：

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

    @Value("${mall.jwt.secret}")
    private String secret;

    @Value("${mall.jwt.expire}")
    private long expire;   // 秒

    private SecretKey key() {
        return Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    /** 生成 accessToken（登录、刷新时都用它） */
    public String generateAccessToken(Long userId) {
        return Jwts.builder()
                .subject(String.valueOf(userId))                        // 把 userId 放进 sub 声明
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expire * 1000))
                .signWith(key())                                        // HS256 签名，防篡改
                .compact();
    }

    /** 解析 token 拿 userId（Day04 的鉴权拦截器里用） */
    public Long parseUserId(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key())
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return Long.valueOf(claims.getSubject());
    }
}
```

刷新/登出的服务 `TokenService.java`（`com/mall/user/service/TokenService.java`）：

```java
package com.mall.user.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.user.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class TokenService {

    private static final String REFRESH_KEY = "login:refresh:";   // refreshToken -> userId
    private static final long REFRESH_TTL_DAYS = 7;               // 7 天

    private final StringRedisTemplate stringRedisTemplate;
    private final JwtUtil jwtUtil;

    /**
     * 登录成功后调用（Day04 的登录接口里补一行）：把 refreshToken 存 Redis。
     * refreshToken 是随机串，不存 JWT（JWT 无法主动失效），存 Redis 才能随时删。
     */
    public void storeRefreshToken(Long userId, String refreshToken) {
        stringRedisTemplate.opsForValue().set(
                REFRESH_KEY + refreshToken, userId.toString(), REFRESH_TTL_DAYS, TimeUnit.DAYS);
    }

    /**
     * 刷新登录态：前端带 refreshToken 来，校验 Redis 里有 → 生成新的 accessToken。
     */
    public String refreshAccessToken(String refreshToken) {
        String userId = stringRedisTemplate.opsForValue().get(REFRESH_KEY + refreshToken);
        if (userId == null) {
            throw new BizException(ErrorCode.UNAUTHORIZED);   // Redis 里没有 = 已登出/已过期
        }
        // 滑动过期：每次成功刷新都把有效期续回 7 天，活跃用户不用重新登录
        stringRedisTemplate.expire(REFRESH_KEY + refreshToken, REFRESH_TTL_DAYS, TimeUnit.DAYS);
        return jwtUtil.generateAccessToken(Long.valueOf(userId));
    }

    /**
     * 登出：删掉 Redis 里的 refreshToken。之后它再想刷新就换不了新 accessToken 了。
     */
    public void logout(String refreshToken) {
        stringRedisTemplate.delete(REFRESH_KEY + refreshToken);
    }
}
```

控制器 `TokenController.java`（`com/mall/user/controller/TokenController.java`）：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import com.mall.user.dto.RefreshRequest;
import com.mall.user.service.TokenService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class TokenController {

    private final TokenService tokenService;

    /** 刷新登录态：用 refreshToken 换新 accessToken */
    @PostMapping("/refresh")
    public Result<Map<String, String>> refresh(@RequestBody @Valid RefreshRequest req) {
        String accessToken = tokenService.refreshAccessToken(req.getRefreshToken());
        // HashMap：这里只临时组装返回，key 无序无影响；要保序可用 LinkedHashMap
        Map<String, String> data = new HashMap<>();
        data.put("accessToken", accessToken);
        return Result.ok(data);
    }

    /** 登出：吊销 refreshToken */
    @PostMapping("/logout")
    public Result<Void> logout(@RequestBody @Valid RefreshRequest req) {
        tokenService.logout(req.getRefreshToken());
        return Result.ok();
    }
}
```

DTO `RefreshRequest.java`（`com/mall/user/dto/RefreshRequest.java`）：

```java
package com.mall.user.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class RefreshRequest {
    @NotBlank(message = "refreshToken 不能为空")
    private String refreshToken;
}
```

> **Day 04 登录接口要补的一行**：登录成功返回前，先生成 refreshToken 并存 Redis：
> ```java
> String refreshToken = UUID.randomUUID().toString().replace("-", "");
> tokenService.storeRefreshToken(user.getId(), refreshToken);
> // 然后把 accessToken + refreshToken 一起返回给前端
> ```

::: tip 💡 面试题：accessToken 和 refreshToken 为什么要分开？refreshToken 为什么存 Redis 而 accessToken 不存？
**一句话**：accessToken 短（泄露窗口小）但无状态、每次请求都带；refreshToken 长但要能「主动吊销」——JWT 一旦发出就无法让它失效，所以 refreshToken 用**随机串存 Redis**，登出/发现泄露时直接从 Redis 删掉即可。二者配合 = 安全 + 体验。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

### 步骤 6：登出——无状态 JWT 怎么「立刻失效」

JWT 是无状态的，服务端不存它，所以「删」不了已经发出去的 accessToken。两种思路：

1. **短有效期**（今天用的）：accessToken 只活 30 分钟，登出后最多 30 分钟内它仍有效，但窗口可控。
2. **黑名单**：登出时把 accessToken 的 `jti`/签名存 Redis 黑名单，鉴权拦截器每次查一遍。能立刻失效，但每次请求多一次 Redis 查询，且要存到 token 过期才能清。

今天选了「短 accessToken + 删 refreshToken」的组合，是成本最低、绝大多数场景够用的方案。

::: tip 💡 面试题：无状态 JWT 怎么实现「登出后立刻失效」？
**一句话**：JWT 本身删不掉，只能靠① accessToken 设短有效期，或② 登出时把它加进 Redis 黑名单、鉴权时拦截。方案①零成本但有几十分钟延迟，方案②立刻失效但每次请求都要查 Redis。详见 [Redis](/learn_database/Redis)。
:::

### 步骤 7：启动验证

先确认 Redis 起来了：

```bash
redis-cli ping      # 返回 PONG 说明连得上
```

然后回到 `E:\course-mall\` 根目录：

```bash
mvn clean install -DskipTests        # 编译安装
mvn -pl mall-user spring-boot:run    # 启动用户服务
```

**① 图形验证码**：

```bash
curl http://localhost:8080/api/captcha/image
```

预期返回（image 是一长串 base64，可复制到浏览器地址栏直接看图）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "uuid": "6f3a2c...",
    "image": "data:image/png;base64,iVBORw0KGgo..."
  }
}
```

**② 短信验证码**（先看图里是什么字符，替换 `uuid` 和 `imageCode`）：

```bash
curl -X POST http://localhost:8080/api/captcha/sms \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","uuid":"6f3a2c...","imageCode":"图中字符"}'
```

预期返回 `{"code":200,...}`，同时控制台打印 `【mock短信】向 13800138000 发送验证码：xxxxxx`。

**③ 确认验证码进了 Redis 且带 TTL**：

```bash
redis-cli
> KEYS captcha:*
> TTL captcha:sms:13800138000    # 应返回 300 附近（秒），且在倒计时
```

**④ 刷新/登出**（先用 Day04 登录拿到 accessToken + refreshToken 后）：

```bash
curl -X POST http://localhost:8080/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"登录时返回的refreshToken"}'

curl -X POST http://localhost:8080/api/auth/logout \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"登录时返回的refreshToken"}'
```

## 四、知识点索引

| 今天用到的点 | 对应知识文档 |
|---|---|
| Redis 存验证码、TTL、SETNX 防刷、GETDEL 原子性 | [Redis](/learn_database/Redis) |
| `StringRedisTemplate` 自动装配 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| `@Valid` + `@NotBlank`/`@Pattern` 参数校验 | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| `@RestControllerAdvice` 全局异常、异常匹配优先级 | [Spring](/learn_backend/java/基础/Spring) |
| `HashMap` 组装返回、`SecureRandom` | [Java集合](/learn_backend/java/Java核心/Java集合) |
| 双 token 机制、JWT 无状态与吊销 | [Spring Security](/learn_backend/java/基础/Spring Security) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 图形验证码接口返回了 base64 图片，浏览器能显示：是 / 否
- [ ] 短信验证码发送成功，`redis-cli` 里能看到 `captcha:sms:*` 且 TTL 在倒计时：是 / 否
- [ ] 60 秒内重复发短信被拒绝（频率限制生效）：是 / 否
- [ ] `/api/auth/refresh` 能换到新 accessToken，`/api/auth/logout` 后 refresh 返回 401：是 / 否
- [ ] 踩坑记录（Redis 连不上、jjwt 版本报错、AWT 无头异常等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 为什么验证码存 Redis 而不是 HttpSession 或 MySQL？验证码的 key 是怎么设计的？TTL 设了多少、为什么设这个值？
2. 为什么发短信验证码之前必须先过图形验证码？如果去掉这步，短信接口会被怎么攻击？60 秒限频又是怎么用 Redis 实现的（`setIfAbsent` 的底层命令是什么）？
3. 为什么生成验证码用 `SecureRandom` 不用 `Random`？「一次性使用」的验证码在并发下怎么保证只被用一次（`GET` + `DEL` 有什么问题）？
4. accessToken 和 refreshToken 为什么要分开？refreshToken 为什么存 Redis 而 accessToken 不存？「滑动过期」是怎么实现的？
5. 无状态 JWT 怎么做到「登出立刻失效」？「短有效期」和「黑名单」两种方案各有什么取舍？
