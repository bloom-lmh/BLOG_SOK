# Day 09 · 文件上传（视频封面 + 本地存储 / OSS）

> **今天目标**：给课程商城实现一个可复用的文件上传能力——课程封面（视频封面）上传，支持「本地磁盘 / 阿里云 OSS」两种存储可配置切换，并做好类型、大小、魔数三层校验，上传后返回可直接访问的 URL（回填到 Day 02 的 `course.cover` 字段）。

本日项目根目录统一为 `E:\CourseMall`。Day09 仍处于模块化单体阶段，示例 Java
文件放在 `mall-user\src\main\java`，配置放在 `mall-user\src\main\resources`。

## 一、前置条件

- 已完成 **Day 01**（Maven 多模块骨架 + `Result` / `ErrorCode` / `GlobalExceptionHandler` 已就位）
- 已完成 **Day 02**（`course.cover`、`teacher.avatar`、`lesson.video_url` 字段已建好——今天上传返回的 URL 就是回填这些字段）
- 本天代码加在 `mall-user` 模块（Day 01 建好的可运行服务），**只依赖 Day 01 的骨架**，不依赖 Day 03~08 的代码，可独立跑通

> ⚠️ 今天不写课程 CRUD（那是 Day 06 的事），只聚焦「文件上传」这一个功能。Day 06 课程服务做好后，把这里返回的 URL 写进 `course.cover` 即可。

## 二、完成后你会得到什么

1. 一个受 `file:upload` 权限保护的 `POST /api/files/upload` 接口
2. 本地存储模式：文件落到磁盘，能通过 `http://localhost:8080/upload/xxx.jpg` 访问
3. 存储策略可切换：改一个配置项，就能从「本地磁盘」切到「阿里云 OSS」，业务代码零改动
4. 三层文件校验：目录白名单 → 扩展名白名单 → 魔数（magic number）校验

## 三、整体思路：一次文件上传发生了什么

```
前端 multipart/form-data（含二进制文件）
   ↓
FileController（@RequestParam MultipartFile file）
   ↓
FileService.upload(file, dir) —— 只做「校验 + 起名」，不碰磁盘
   ├─ ① 非空校验 + 目录白名单（防 dir=../.. 路径穿越）
   ├─ ② 扩展名白名单（jpg/jpeg/png/webp）
   ├─ ③ 魔数校验（读文件头字节，防「改后缀伪装」）
   └─ ④ 生成唯一文件名：dir/UUID.ext（丢弃原始文件名）
   ↓
FileStorage 接口（存储策略）
   ├─ LocalFileStorage（本地磁盘，默认）—— 写磁盘 + 静态资源映射对外访问
   └─ AliyunOssStorage（阿里云 OSS）—— putObject 上传，走 OSS 域名访问
   ↓
返回 URL → 存进 course.cover / teacher.avatar
```

为什么要把「存储」抽象成接口（`FileStorage`）而不是直接在 Service 里写死？因为存储是一种**可替换的策略**：开发用本地磁盘，上线切 OSS。用接口 + `@ConditionalOnProperty` 按配置切换，换存储时 Service、Controller 一行都不用改。

| 维度 | 本地磁盘（local） | 阿里云 OSS |
|---|---|---|
| 文件在哪 | 应用服务器磁盘 | 阿里云对象存储（近乎无限容量） |
| 对外访问 | 应用自己做静态资源映射 | OSS 域名 / CDN |
| 扩容 | 受单机磁盘限制，多实例难共享 | 自动扩容、天然高可用 |
| 带宽 | 应用自己发文件，占带宽 | OSS/CDN 承担，应用只存 URL |
| 适用场景 | 开发、测试、小项目 | 生产环境 |
| 成本 | 免费但占服务器资源 | 按量付费 |

## 四、步骤

### 步骤 1：扩展 `ErrorCode` + 全局异常处理超限文件

文件上传要新增几个专属错误码（比复用 `PARAM_ERROR` 更精确，前端能针对性提示）。

Day01 的统一错误码已包含 `FILE_EMPTY`、`FILE_TOO_LARGE`、`FILE_TYPE_UNSUPPORTED`、`FILE_UPLOAD_FAILED`，这里不要再创建一套旧式 `(code, 中文消息)` 枚举。为目录白名单补一个错误码和消息键：

```java
// ErrorCode.java（文件域）
FILE_DIRECTORY_INVALID(400702, MessageKeys.File.DIRECTORY_INVALID),

// MessageKeys.File
public static final String DIRECTORY_INVALID = "file.directory-invalid";

// messages.properties / messages_zh_CN.properties
file.directory-invalid=上传目录不合法

// messages_en.properties
file.directory-invalid=Invalid upload directory
```

再打开 `GlobalExceptionHandler.java`，新增一个处理「文件超限」的方法。为什么单独接？因为文件超过 `spring.servlet.multipart` 配置的上限时，Spring 会在**进入 Controller 之前**就抛 `MaxUploadSizeExceededException`，不处理的话会落到兜底 `Exception` 分支返回 500。

```java
@ExceptionHandler(MaxUploadSizeExceededException.class)
public Result<Void> handleMaxUpload(MaxUploadSizeExceededException e) {
    log.warn("上传文件超过大小限制: {}", e.getMessage());
    return Result.fail(ErrorCode.FILE_TOO_LARGE);
}
```

方法继续放在现有 `com.mall.common.web.advice.GlobalExceptionHandler` 中；`ResultMessageAdvice` 会按请求语言解析消息键。

### 步骤 2：multipart 配置 + 存储配置（`application.yml` + `StorageProperties`）

打开 `E:\CourseMall\mall-user\src\main\resources\application.yml`，只合并下面新增项，不要覆盖已有数据库、Redis、JWT 配置：

```yaml
spring:
  servlet:
    multipart:
      # 单个文件上限：超过后 Spring 在进入 Controller 前就抛 MaxUploadSizeExceededException
      max-file-size: 10MB
      # 整个请求上限：一次传多个文件时，是它们的总和上限
      max-request-size: 20MB

# 自定义文件存储配置（对应 StorageProperties 类）
mall:
  file:
    storage-type: local                # local（本地磁盘，默认）/ oss（阿里云对象存储）
    local:
      upload-dir: ${COURSE_MALL_UPLOAD_DIR:E:/CourseMall/upload}
      url-prefix: /upload                 # 对外访问前缀，配合步骤 5 的静态资源映射
    oss:
      endpoint: ${COURSE_MALL_OSS_ENDPOINT:}
      access-key-id: ${COURSE_MALL_OSS_ACCESS_KEY_ID:}
      access-key-secret: ${COURSE_MALL_OSS_ACCESS_KEY_SECRET:}
      bucket: ${COURSE_MALL_OSS_BUCKET:}
      url-prefix: ${COURSE_MALL_OSS_URL_PREFIX:}
```

::: tip 💡 面试题：`max-file-size` 和 `max-request-size` 有什么区别？
**一句话**：`max-file-size` 限制**单个文件**大小，`max-request-size` 限制**整个请求体**大小（一次传多个文件时，是它们的总和上限）。所以 `max-request-size` 通常设成 `max-file-size` 的 1.5~2 倍。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

然后新建配置类 `E:\course-mall\mall-user\src\main\java\com\mall\user\storage\StorageProperties.java`，把上面 `mall.file.*` 批量绑定成类型安全的对象：

```java
package com.mall.user.storage;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

// 把 mall.file.* 配置批量绑定到对象：比在代码里到处 @Value 更清晰、类型安全
@Data
@Component
@ConfigurationProperties(prefix = "mall.file")
public class StorageProperties {

    private String storageType = "local";   // local / oss，默认 local（开箱即跑）

    // 嵌套配置：mall.file.local.* → local 对象，mall.file.oss.* → oss 对象
    private Local local = new Local();
    private Oss oss = new Oss();

    @Data
    public static class Local {
        private String uploadDir = "upload";   // 本地存储目录
        private String urlPrefix = "/upload";  // 对外访问前缀
    }

    @Data
    public static class Oss {
        private String endpoint;
        private String accessKeyId;
        private String accessKeySecret;
        private String bucket;
        private String urlPrefix;
    }
}
```

> `@ConfigurationProperties` 的「松散绑定」会自动把 `storage-type` → `storageType`、`access-key-id` → `accessKeyId` 对应起来，不用你手写映射。

### 步骤 3：存储策略接口 + 本地存储实现

新建接口 `E:\course-mall\mall-user\src\main\java\com\mall\user\storage\FileStorage.java`：

```java
package com.mall.user.storage;

import org.springframework.web.multipart.MultipartFile;

// 存储策略接口：本地磁盘、阿里云 OSS 都实现它。
// 业务层只依赖这个接口，不关心文件到底存到哪——这就是「策略模式」的落点
public interface FileStorage {

    /**
     * 上传文件
     * @param file       上传的文件
     * @param objectName 对象名（含目录前缀 + 唯一文件名，如 cover/2f3b....jpg），由 FileService 生成
     * @return 可访问的完整 URL
     */
    String upload(MultipartFile file, String objectName);
}
```

新建本地实现 `E:\course-mall\mall-user\src\main\java\com\mall\user\storage\LocalFileStorage.java`：

```java
package com.mall.user.storage;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;

@Slf4j
@Component
// matchIfMissing = true：不配 storage-type 时默认装配这个 bean（保证开箱即跑）。
// 一旦 storage-type=oss，这个 bean 就不装配，换成 AliyunOssStorage
@ConditionalOnProperty(name = "mall.file.storage-type", havingValue = "local", matchIfMissing = true)
public class LocalFileStorage implements FileStorage {

    private final StorageProperties properties;

    public LocalFileStorage(StorageProperties properties) {
        this.properties = properties;
    }

    @Override
    public String upload(MultipartFile file, String objectName) {
        String uploadDir = properties.getLocal().getUploadDir();
        Path root = Paths.get(uploadDir).toAbsolutePath().normalize();
        Path target = root.resolve(objectName).normalize();
        // 双重防线：即使以后 objectName 的生成方式改变，也不能逃出上传根目录。
        if (!target.startsWith(root)) {
            throw new BizException(ErrorCode.FILE_DIRECTORY_INVALID);
        }
        try {
            // createDirectories：父目录不存在就逐级创建（等价 mkdir -p）
            Files.createDirectories(target.getParent());
            // getInputStream()：流式写入，不把整个文件一次性读进内存（大文件友好）
            Files.copy(file.getInputStream(), target, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            log.error("本地文件写入失败: {}", objectName, e);
            throw new BizException(ErrorCode.FILE_UPLOAD_FAILED);
        }
        // 返回对外 URL：/upload/cover/xxx.jpg，配合步骤 5 的静态资源映射对外访问
        return properties.getLocal().getUrlPrefix() + "/" + objectName;
    }
}
```

::: tip 💡 面试题：`@ConditionalOnProperty` 是怎么做到「按配置切换存储」的？
**一句话**：`LocalFileStorage` 标 `havingValue="local"`、`AliyunOssStorage` 标 `havingValue="oss"`，Spring 启动时读 `mall.file.storage-type` 的值，只装配匹配的那一个 bean，另一个根本不会被创建。业务层只依赖 `FileStorage` 接口，换存储不用改一行业务代码——这就是**策略模式** + Spring 条件装配的结合。详见 [Spring](/learn_backend/java/基础/Spring)。
:::

### 步骤 4：文件校验 + 上传服务（`FileService`）

先建立稳定返回对象 `FileUploadVO.java`：

```java
package com.mall.user.vo;

public record FileUploadVO(String url, long size, String contentType) {
}
```

新建服务接口 `E:\course-mall\mall-user\src\main\java\com\mall\user\service\FileService.java`：

```java
package com.mall.user.service;

import com.mall.user.vo.FileUploadVO;
import org.springframework.web.multipart.MultipartFile;

public interface FileService {
    FileUploadVO upload(MultipartFile file, String dir);
}
```

新建实现 `E:\course-mall\mall-user\src\main\java\com\mall\user\service\impl\FileServiceImpl.java`：

```java
package com.mall.user.service.impl;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.user.service.FileService;
import com.mall.user.storage.FileStorage;
import com.mall.user.vo.FileUploadVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

@Slf4j
@Service
public class FileServiceImpl implements FileService {

    private final FileStorage fileStorage;

    public FileServiceImpl(FileStorage fileStorage) {
        this.fileStorage = fileStorage;
    }

    // 目录白名单：前端传的 dir 只能在这几个里，防止 dir=../.. 把文件写到任意路径
    private static final List<String> ALLOWED_DIRS = Arrays.asList("cover", "avatar", "video");

    // 扩展名白名单：封面/头像用图片（视频今天不放开，后面做大文件分片再处理）
    private static final List<String> ALLOWED_EXT = Arrays.asList("jpg", "jpeg", "png", "webp");

    @Override
    public FileUploadVO upload(MultipartFile file, String dir) {
        // ① 非空 + 目录校验
        if (file == null || file.isEmpty()) {
            throw new BizException(ErrorCode.FILE_EMPTY);
        }
        if (!ALLOWED_DIRS.contains(dir)) {
            throw new BizException(ErrorCode.FILE_DIRECTORY_INVALID);
        }

        // ② 扩展名校验：从原始文件名提取后缀，转小写后比对
        String ext = StringUtils.getFilenameExtension(file.getOriginalFilename());
        if (ext == null || !ALLOWED_EXT.contains(ext.toLowerCase(Locale.ROOT))) {
            throw new BizException(ErrorCode.FILE_TYPE_UNSUPPORTED);
        }

        // ③ 魔数校验：读文件内容头几个字节，防止「改后缀伪装」（见下方 tip）
        checkMagicNumber(file);

        // ④ 生成唯一文件名：UUID + 白名单后缀。绝不用原始文件名——防路径穿越、防重名覆盖
        String objectName = dir + "/" + UUID.randomUUID() + "." + ext.toLowerCase(Locale.ROOT);

        // ⑤ 交给存储策略（本地 / OSS），业务层不关心存到哪
        String url = fileStorage.upload(file, objectName);
        return new FileUploadVO(url, file.getSize(), file.getContentType());
    }

    // 校验文件头 12 字节的「魔数」，判断真实类型
    private void checkMagicNumber(MultipartFile file) {
        byte[] head = new byte[12];
        try {
            // 只读文件头几个字节判断类型，不用读整个文件（简化写法，小文件单次 read 即可读满）
            int read = file.getInputStream().read(head);
            if (read < 12) {
                throw new BizException(ErrorCode.FILE_TYPE_UNSUPPORTED);
            }
            // & 0xFF：Java 的 byte 是有符号的（-128~127），与 0xFF 按位与转成无符号 0~255，
            // 否则 0xFF 会被读成 -1，魔数判断全错
            boolean jpeg = (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF;
            boolean png  = (head[0] & 0xFF) == 0x89 && (head[1] & 0xFF) == 0x50 && (head[2] & 0xFF) == 0x4E && (head[3] & 0xFF) == 0x47;
            // WEBP：前 4 字节 "RIFF"，第 8~11 字节 "WEBP"
            boolean riff = (head[0] & 0xFF) == 0x52 && (head[1] & 0xFF) == 0x49 && (head[2] & 0xFF) == 0x46 && (head[3] & 0xFF) == 0x46;
            boolean webp = riff && (head[8] & 0xFF) == 0x57 && (head[9] & 0xFF) == 0x45
                    && (head[10] & 0xFF) == 0x42 && (head[11] & 0xFF) == 0x50;

            if (!jpeg && !png && !webp) {
                throw new BizException(ErrorCode.FILE_TYPE_UNSUPPORTED);
            }
        } catch (BizException e) {
            throw e;   // 业务异常原样上抛，交给全局异常处理器
        } catch (Exception e) {
            log.warn("读取文件头失败", e);
            throw new BizException(ErrorCode.FILE_TYPE_UNSUPPORTED);
        }
    }
}
```

::: tip 💡 面试题：为什么不能用用户上传的原始文件名？
**一句话**：原始文件名是攻击者可控的输入，可能带 `../../`（路径穿越，把文件写到任意目录）、可能重名（互相覆盖）、可能含特殊字符/中文乱码。所以一律「丢弃原始文件名，用 UUID + 白名单后缀」自己生成。详见 [Spring MVC](/learn_backend/java/基础/Spring MVC)。
:::

::: tip 💡 面试题：校验了扩展名，为什么还要校验「魔数」（magic number）？
**一句话**：扩展名是文件名的一部分，可以随便改——把 `.php`/`.jsp` 后缀改成 `.jpg` 就能绕过只看后缀的校验，达到「任意文件上传 getshell」。魔数读的是文件**内容**最前面几个字节（如 JPEG 是 `FF D8 FF`、PNG 是 `89 50 4E 47`），改后缀改不了内容，所以能拦住伪装文件。详见 [Spring MVC](/learn_backend/java/基础/Spring MVC)。
:::

### 步骤 5：上传接口 + 静态资源映射

新建控制器 `E:\course-mall\mall-user\src\main\java\com\mall\user\controller\FileController.java`：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import com.mall.user.service.FileService;
import com.mall.user.vo.FileUploadVO;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/files")
public class FileController {

    private final FileService fileService;

    @PreAuthorize("hasAuthority('file:upload')")
    @PostMapping("/upload")
    public Result<FileUploadVO> upload(
            @RequestParam("file") MultipartFile file,
            @Pattern(regexp = "cover|avatar|video", message = "{file.directory-invalid}")
            @RequestParam(value = "dir", defaultValue = "cover") String dir) {
        // 返回的 URL 就是以后写进 course.cover / teacher.avatar 字段的值（Day 02 已建好这些列）
        return Result.ok(fileService.upload(file, dir));
    }
}
```

上传本身必须登录并拥有 `file:upload` 权限；封面和头像的读取可以在 `SecurityConfig` 中公开：

```java
.requestMatchers(HttpMethod.GET, "/upload/**").permitAll()
```

这里的本地静态映射只服务公开图片。课程视频不能直接这样公开，Day33/34 会改成鉴权后的对象存储签名 URL。

新建配置类 `E:\course-mall\mall-user\src\main\java\com\mall\user\config\WebMvcConfig.java`，把 `/upload/**` 映射到本地磁盘目录（本地模式才有意义，OSS 模式不依赖它）：

```java
package com.mall.user.config;

import com.mall.user.storage.StorageProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Paths;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final StorageProperties properties;

    public WebMvcConfig(StorageProperties properties) {
        this.properties = properties;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 用 Path.toUri() 把磁盘路径转成标准 file:// URI。
        // 不能直接拼 "file:" + 路径：Windows 盘符（E:）会被错误解析，
        // toUri() 会自动转成 file:///E:/course-mall/upload/ 这种合法形式
        String uri = Paths.get(properties.getLocal().getUploadDir())
                .toAbsolutePath()
                .normalize()
                .toUri()
                .toString();

        registry.addResourceHandler("/upload/**")
                .addResourceLocations(uri);
    }
}
```

::: tip 💡 面试题：本地磁盘的文件，怎么通过 HTTP URL 访问？
**一句话**：三种方式——① 应用内做静态资源映射（`addResourceHandlers` 把 `/upload/**` 映射到磁盘目录，适合开发/测试）；② 交给 Nginx 当静态文件服务器（生产常用，应用不背文件带宽）；③ 直接上 OSS + CDN（静态资源彻底和业务分离）。本天做的是方式①。详见 [Spring](/learn_backend/java/基础/Spring)。
:::

### 步骤 6：启动验证

先准备一张测试图片（任意 jpg 即可，Windows 画图另存为 `.jpg`），放到 `E:\course-mall\test-cover.jpg`。

在 `E:\course-mall\` 根目录执行：

```bash
mvn clean install -DskipTests        # mall-common 改了 ErrorCode/GlobalExceptionHandler，要重新 install
mvn -pl mall-user spring-boot:run    # 启动用户服务
```

上传：

```bash
curl -X POST http://localhost:8080/api/files/upload \
  -H "Authorization: Bearer 你的ADMIN_TOKEN" \
  -F "file=@E:/course-mall/test-cover.jpg" \
  -F "dir=cover"
```

预期返回：

```json
{ "code": 200, "message": "success", "data": "/upload/cover/2f3b0e1a-....jpg" }
```

把返回的 `data` 拼到 `localhost:8080` 后面，浏览器打开，能看到图片：

```
http://localhost:8080/upload/cover/2f3b0e1a-....jpg
```

再做几个「负面」验证，确认校验真的生效：

```bash
# 1) 把 .txt 改名成 .jpg 再上传 —— 返回 FILE_TYPE_UNSUPPORTED（415701）
# 2) 传一个 >10MB 的文件 —— 返回 FILE_TOO_LARGE（413701）
# 3) dir 传 ../evil —— 返回 400 非法目录（目录白名单拦截）
```

### 步骤 7：切换到 OSS（可选，需要阿里云账号）

本地模式已经跑通。现在演示「换个存储，业务代码零改动」。

**① 引依赖**：打开 `E:\course-mall\mall-user\pom.xml`，在 `<dependencies>` 里新增（本地模式的同学可跳过这步）：

```xml
<!-- 阿里云 OSS SDK：只有 storage-type=oss 时真正用到，本地模式不影响运行。
     版本不在 Spring Boot BOM 里，需显式写（拉不到就到 Maven Central 查最新稳定版） -->
<dependency>
    <groupId>com.aliyun.oss</groupId>
    <artifactId>aliyun-sdk-oss</artifactId>
    <version>3.17.4</version>
</dependency>
```

**② 新增 OSS 实现** `E:\course-mall\mall-user\src\main\java\com\mall\user\storage\AliyunOssStorage.java`：

```java
package com.mall.user.storage;

import com.aliyun.oss.OSS;
import com.aliyun.oss.OSSClientBuilder;
import com.aliyun.oss.ClientException;
import com.aliyun.oss.OSSException;
import com.aliyun.oss.model.PutObjectRequest;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;

@Slf4j
@Component
// 只有 storage-type=oss 时才装配这个 bean，本地模式不会创建 OSS 客户端
@ConditionalOnProperty(name = "mall.file.storage-type", havingValue = "oss")
public class AliyunOssStorage implements FileStorage {

    private final StorageProperties properties;
    private final OSS ossClient;   // OSS 客户端线程安全，作为单例复用

    public AliyunOssStorage(StorageProperties properties) {
        this.properties = properties;
        StorageProperties.Oss oss = properties.getOss();
        // AK/SK 是访问 OSS 的密钥，只能来自配置/环境变量，绝不能硬编码进代码、更别提交到 git
        this.ossClient = new OSSClientBuilder()
                .build(oss.getEndpoint(), oss.getAccessKeyId(), oss.getAccessKeySecret());
    }

    @Override
    public String upload(MultipartFile file, String objectName) {
        try {
            // putObject 直接上传流：objectName 就是 OSS 里的 key（如 cover/uuid.jpg）
            ossClient.putObject(new PutObjectRequest(
                    properties.getOss().getBucket(), objectName, file.getInputStream()));
        } catch (OSSException | ClientException | IOException e) {
            log.error("OSS 上传失败: {}", objectName, e);
            throw new BizException(ErrorCode.FILE_UPLOAD_FAILED);
        }
        // OSS 访问 URL = url-prefix（bucket 域名或 CDN 域名）+ objectName
        return properties.getOss().getUrlPrefix() + "/" + objectName;
    }

    // 应用关闭时释放 OSS 客户端连接
    @PreDestroy
    public void shutdown() {
        if (ossClient != null) {
            ossClient.shutdown();
        }
    }
}
```

**③ 切配置**：把 `application.yml` 里的 `storage-type` 改成 `oss`，填上你的 AK/SK、bucket。重启后同样 `curl` 上传，返回的就是 `https://course-mall.oss-cn-hangzhou.aliyuncs.com/cover/uuid.jpg`。

**关键**：`FileService`、`FileController` 一行没改，只是 Spring 把注入的 `FileStorage` 从 `LocalFileStorage` 换成了 `AliyunOssStorage`。

::: tip 💡 面试题：生产环境为什么用 OSS 存图片，而不是存应用服务器本地磁盘？
**一句话**：① 本地磁盘和应用耦合——应用一扩容成多实例，文件散落在多台机器、无法统一访问；② 应用服务器磁盘有限，图片视频一多就爆；③ 应用自己发图片会占满 CPU/带宽，拖垮接口。OSS 容量近乎无限、自带高可用，再接 CDN 让用户就近访问，应用只存一个 URL。（阿里云 OSS 官方文档：help.aliyun.com/oss）
:::

::: tip 💡 面试题：OSS 的「服务端转发」和「客户端直传」有什么区别？
**一句话**：服务端转发 = 文件先传到自己服务器再转给 OSS（多一次网络、占应用带宽，但简单安全，本天就是这种）；客户端直传 = 浏览器直接传 OSS（快、省服务器带宽），但需要服务端用 AK/SK 签发**临时凭证/签名 URL** 给前端，前端凭签名直传，避免把 AK/SK 暴露在前端。（阿里云 OSS 官方文档：help.aliyun.com/oss）
:::

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| `MultipartFile`、`multipart/form-data` 解析 | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| `@ConfigurationProperties` 松散绑定、multipart 配置 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| `@ConditionalOnProperty` 条件装配、静态资源映射、策略模式 | [Spring](/learn_backend/java/基础/Spring) |
| OSS 对象存储（直传/签名/CDN） | （本库暂无独立文档，参考阿里云官方文档 help.aliyun.com/oss） |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 本地模式上传成功，返回了 `/upload/cover/xxx.jpg`，浏览器能打开图片：是 / 否
- [ ] 把 `.txt` 改名 `.jpg` 上传被拦（魔数校验生效）：是 / 否
- [ ] 无 Token / 无权限 Token 上传分别返回 401 / 403：是 / 否
- [ ] 传 >10MB 文件返回 413701（超限被全局异常接住）：是 / 否
- [ ] （可选）切到 OSS 上传成功，返回 OSS 域名 URL：是 / 否
- [ ] 踩坑记录（multipart 配置、Windows 路径、魔数判断等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. `MultipartFile` 是怎么从 HTTP 请求里解析出来的？Spring 的 `MultipartResolver` 在这个过程里做了什么？
2. 文件上传有哪些安全风险？「路径穿越」攻击是怎么回事？为什么不能信任用户上传的原始文件名？
3. 校验了扩展名为什么还要校验「魔数」？`(head[0] & 0xFF)` 里的 `& 0xFF` 是干嘛的，去掉会怎样？
4. `@ConditionalOnProperty` 是怎么实现「按配置切换本地/OSS 存储」的？为什么业务层改存储不用改代码？（提示：策略模式）
5. 生产环境为什么用 OSS + CDN 而不是本地磁盘？OSS 直传和服务端转发各有什么优缺点？
