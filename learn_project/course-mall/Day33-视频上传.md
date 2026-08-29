# Day 33 · 视频上传（分片 + 断点续传 + 秒传）

> **今天目标**：新增 `mall-media:8086`，完成可运行的本地分片上传链路：初始化 → 查询进度 → 幂等上传分片 → 加锁合并 → SHA-256 校验 → 对象存储。以后切换阿里云 OSS/MinIO 时只替换存储实现。

本日不再使用旧文档中的 `commons-fileupload`：Spring Boot 3 的 `spring-boot-starter-web` 已提供 Multipart 支持。也不把媒体代码放进 `mall-user`，更不能把 `E:/course-mall/videos` 写死在 Java 常量中。

## 一、设计边界

| 数据 | 保存位置 | 原因 |
|---|---|---|
| 上传任务、已完成分片 | Redis（24 小时 TTL） | 高频、临时、便于断点续传 |
| 分片文件 | 临时目录 | 合并完成后即可删除 |
| 最终视频 | `ObjectStorage` | 本地可运行，生产替换 OSS/MinIO |
| 文件指纹索引 | Redis 示例；生产应落 DB | 秒传必须长期存在且可审计 |

路线总览写的是 MD5 秒传，但本实现改用 SHA-256。两者都只能作为“文件指纹”，不是权限证明；SHA-256 的碰撞风险更低，签名与安全校验也不应再新增 MD5。

## 二、新建 `mall-media`

### 步骤 1：父工程和依赖

`E:\CourseMall\pom.xml` 的 `<modules>` 增加：

```xml
<module>mall-media</module>
```

新建 `E:\CourseMall\mall-media\pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.mall</groupId>
        <artifactId>course-mall</artifactId>
        <version>1.0.0</version>
    </parent>
    <artifactId>mall-media</artifactId>
    <dependencies>
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>
        </dependency>
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <scope>provided</scope>
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

### 步骤 2：启动类和配置

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\MallMediaApplication.java`：

```java
package com.mall.media;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.mall")
public class MallMediaApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallMediaApplication.class, args);
    }
}
```

新建 `E:\CourseMall\mall-media\src\main\resources\application.yml`：

```yaml
server:
  port: 8086
spring:
  application:
    name: mall-media
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_ADDR:127.0.0.1:8848}
  data:
    redis:
      host: ${REDIS_HOST:127.0.0.1}
      port: ${REDIS_PORT:6379}
  servlet:
    multipart:
      max-file-size: 12MB
      max-request-size: 12MB
jwt:
  secret: ${JWT_SECRET}
security:
  resource:
    enabled: true
    public-get-paths:
      - /media/**
mall:
  media:
    temp-root: ${MEDIA_TEMP_ROOT:E:/CourseMall/data/media-temp}
    storage-root: ${MEDIA_STORAGE_ROOT:E:/CourseMall/data/media}
    public-base-url: ${MEDIA_PUBLIC_BASE_URL:http://localhost:9000/media/}
    max-chunk-bytes: 10485760
    task-ttl: 24h
```

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\config\MediaProperties.java`：

```java
package com.mall.media.config;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;

@Validated
@ConfigurationProperties(prefix = "mall.media")
public record MediaProperties(
        @NotNull Path tempRoot,
        @NotNull Path storageRoot,
        @NotNull URI publicBaseUrl,
        @Positive long maxChunkBytes,
        @NotNull Duration taskTtl) {
}
```

在启动类加上 `@EnableConfigurationProperties(MediaProperties.class)`，并 import 对应类型。

## 三、补齐媒体错误码

`E:\CourseMall\mall-common\src\main\java\com\mall\common\result\ErrorCode.java` 的文件域增加：

```java
VIDEO_UPLOAD_TASK_NOT_FOUND(404702, MessageKeys.File.UPLOAD_TASK_NOT_FOUND),
VIDEO_CHUNK_INCOMPLETE(409701, MessageKeys.File.CHUNK_INCOMPLETE),
VIDEO_HASH_MISMATCH(422701, MessageKeys.File.HASH_MISMATCH),
VIDEO_MERGE_BUSY(409702, MessageKeys.File.MERGE_BUSY),
VIDEO_NOT_READY(409703, MessageKeys.File.VIDEO_NOT_READY),
```

`MessageKeys.File` 增加：

```java
public static final String UPLOAD_TASK_NOT_FOUND = "file.video.upload-task-not-found";
public static final String CHUNK_INCOMPLETE = "file.video.chunk-incomplete";
public static final String HASH_MISMATCH = "file.video.hash-mismatch";
public static final String MERGE_BUSY = "file.video.merge-busy";
public static final String VIDEO_NOT_READY = "file.video.not-ready";
```

三个 messages 文件都加入对应文本，例如中文：

```properties
file.video.upload-task-not-found=上传任务不存在或已过期
file.video.chunk-incomplete=视频分片不完整，已上传 {0}/{1}
file.video.hash-mismatch=合并文件的 SHA-256 与初始化值不一致
file.video.merge-busy=该视频正在合并，请稍后重试
file.video.not-ready=视频尚未转码完成
validation.video.file-name.not-blank=文件名不能为空
validation.video.file-size.positive=文件大小必须大于 0
validation.video.hash.invalid=SHA-256 必须是 64 位十六进制字符串
validation.video.total-chunks.range=分片总数必须在 1 到 10000 之间
```

## 四、DTO 与存储抽象

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\dto\InitUploadRequest.java`：

```java
package com.mall.media.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

@Schema(description = "初始化分片上传请求")
public record InitUploadRequest(
        @Schema(description = "原始文件名", example = "spring-boot.mp4")
        @NotBlank(message = "{validation.video.file-name.not-blank}") String fileName,
        @Schema(description = "文件总字节数", example = "52428800")
        @Positive(message = "{validation.video.file-size.positive}") long fileSize,
        @Schema(description = "整个文件的 SHA-256", example = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
        @Pattern(regexp = "^[a-fA-F0-9]{64}$",
                message = "{validation.video.hash.invalid}") String sha256,
        @Schema(description = "分片总数", example = "10")
        @Min(value = 1, message = "{validation.video.total-chunks.range}")
        @Max(value = 10000, message = "{validation.video.total-chunks.range}")
        int totalChunks) {
}
```

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\vo\InitUploadVO.java`：

```java
package com.mall.media.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.Set;

@Schema(description = "初始化上传结果")
public record InitUploadVO(
        @Schema(description = "上传任务 ID")
        String uploadId,
        @Schema(description = "是否命中秒传")
        boolean instantUpload,
        @Schema(description = "秒传成功时的对象地址")
        String objectUrl,
        @Schema(description = "已经上传的分片序号")
        Set<Integer> uploadedChunks) {
}
```

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\vo\MergedVideoVO.java`：

```java
package com.mall.media.vo;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "视频分片合并结果")
public record MergedVideoVO(
        @Schema(description = "对象存储键")
        String objectKey,
        @Schema(description = "对象访问地址")
        String objectUrl,
        @Schema(description = "合并后文件的 SHA-256")
        String sha256) {
}
```

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\storage\ObjectStorage.java`：

```java
package com.mall.media.storage;

import java.io.IOException;
import java.nio.file.Path;

public interface ObjectStorage {
    boolean exists(String objectKey);
    String put(String objectKey, Path source) throws IOException;
}
```

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\storage\LocalObjectStorage.java`：

```java
package com.mall.media.storage;

import com.mall.media.config.MediaProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@Component
@RequiredArgsConstructor
public class LocalObjectStorage implements ObjectStorage {
    private final MediaProperties properties;

    @Override
    public boolean exists(String objectKey) {
        return Files.isRegularFile(resolve(objectKey));
    }

    @Override
    public String put(String objectKey, Path source) throws IOException {
        Path target = resolve(objectKey);
        Files.createDirectories(target.getParent());
        Files.move(source, target, StandardCopyOption.REPLACE_EXISTING);
        return properties.publicBaseUrl().resolve(objectKey).toString();
    }

    private Path resolve(String objectKey) {
        Path root = properties.storageRoot().toAbsolutePath().normalize();
        Path target = root.resolve(objectKey).normalize();
        if (!target.startsWith(root)) {
            throw new IllegalArgumentException("Illegal object key");
        }
        return target;
    }
}
```

生产切 OSS/MinIO 时实现同一个 `ObjectStorage`，业务 Service 不需要改。真正的 OSS 分片上传还可以让前端拿预签名 URL 直传，避免大文件流量穿过 Java 服务。

## 五、完整上传 Service

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\service\VideoUploadService.java`：

```java
package com.mall.media.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.media.config.MediaProperties;
import com.mall.media.dto.InitUploadRequest;
import com.mall.media.storage.ObjectStorage;
import com.mall.media.vo.InitUploadVO;
import com.mall.media.vo.MergedVideoVO;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;
import org.springframework.util.FileSystemUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.Map;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class VideoUploadService {
    private static final String TASK_PREFIX = "video:upload:task:";
    private static final String CHUNKS_PREFIX = "video:upload:chunks:";
    private static final String HASH_PREFIX = "video:file:sha256:";
    private static final DefaultRedisScript<Long> UNLOCK_SCRIPT =
            new DefaultRedisScript<>("""
                    if redis.call('GET', KEYS[1]) == ARGV[1] then
                        return redis.call('DEL', KEYS[1])
                    end
                    return 0
                    """, Long.class);

    private final StringRedisTemplate redisTemplate;
    private final MediaProperties properties;
    private final ObjectStorage objectStorage;

    public InitUploadVO init(Long ownerId, InitUploadRequest request) {
        String hash = request.sha256().toLowerCase();
        String existingObjectKey = redisTemplate.opsForValue().get(HASH_PREFIX + hash);
        if (existingObjectKey != null && objectStorage.exists(existingObjectKey)) {
            redisTemplate.opsForSet().add(
                    "video:file:owners:" + existingObjectKey,
                    ownerId.toString());
            return new InitUploadVO(null, true,
                    properties.publicBaseUrl().resolve(existingObjectKey).toString(), Set.of());
        }

        String uploadId = UUID.randomUUID().toString();
        String taskKey = taskKey(uploadId);
        redisTemplate.opsForHash().putAll(taskKey, Map.of(
                "ownerId", ownerId.toString(),
                "fileName", safeFileName(request.fileName()),
                "fileSize", Long.toString(request.fileSize()),
                "sha256", hash,
                "totalChunks", Integer.toString(request.totalChunks())));
        redisTemplate.expire(taskKey, properties.taskTtl());
        redisTemplate.expire(chunksKey(uploadId), properties.taskTtl());
        return new InitUploadVO(uploadId, false, null, Set.of());
    }

    public Set<Integer> uploadedChunks(Long ownerId, String uploadId) {
        task(ownerId, uploadId);
        Set<String> values = redisTemplate.opsForSet().members(chunksKey(uploadId));
        if (values == null) {
            return Set.of();
        }
        return values.stream().map(Integer::valueOf).sorted()
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
    }

    public void uploadChunk(
            Long ownerId, String uploadId, int chunkIndex, MultipartFile chunk) {
        Map<Object, Object> task = task(ownerId, uploadId);
        int totalChunks = Integer.parseInt(task.get("totalChunks").toString());
        if (chunkIndex < 0 || chunkIndex >= totalChunks || chunk.isEmpty()
                || chunk.getSize() > properties.maxChunkBytes()) {
            throw new BizException(ErrorCode.PARAM_ERROR);
        }

        Path directory = uploadDirectory(uploadId);
        Path target = directory.resolve(chunkIndex + ".part");
        Path writing = directory.resolve(chunkIndex + ".writing");
        try {
            Files.createDirectories(directory);
            chunk.transferTo(writing);
            Files.move(writing, target,
                    StandardCopyOption.REPLACE_EXISTING,
                    StandardCopyOption.ATOMIC_MOVE);
            redisTemplate.opsForSet().add(chunksKey(uploadId), Integer.toString(chunkIndex));
            redisTemplate.expire(chunksKey(uploadId), properties.taskTtl());
        } catch (IOException exception) {
            throw new BizException(ErrorCode.FILE_UPLOAD_FAILED);
        }
    }

    public MergedVideoVO merge(Long ownerId, String uploadId) {
        Map<Object, Object> task = task(ownerId, uploadId);
        String lockKey = "video:upload:merge-lock:" + uploadId;
        String lockToken = UUID.randomUUID().toString();
        Boolean locked = redisTemplate.opsForValue()
                .setIfAbsent(lockKey, lockToken, Duration.ofMinutes(10));
        if (!Boolean.TRUE.equals(locked)) {
            throw new BizException(ErrorCode.VIDEO_MERGE_BUSY);
        }
        try {
            return doMerge(ownerId, uploadId, task);
        } finally {
            // Lua 比较随机 token 后再删除，避免锁过期并被别人获取后误删新锁。
            redisTemplate.execute(UNLOCK_SCRIPT, List.of(lockKey), lockToken);
        }
    }

    private MergedVideoVO doMerge(
            Long ownerId, String uploadId, Map<Object, Object> task) {
        int totalChunks = Integer.parseInt(task.get("totalChunks").toString());
        Long count = redisTemplate.opsForSet().size(chunksKey(uploadId));
        if (count == null || count != totalChunks) {
            throw new BizException(
                    ErrorCode.VIDEO_CHUNK_INCOMPLETE,
                    count == null ? 0 : count,
                    totalChunks);
        }

        Path directory = uploadDirectory(uploadId);
        Path merged = directory.resolve("merged.tmp");
        try (OutputStream output = Files.newOutputStream(merged)) {
            for (int index = 0; index < totalChunks; index++) {
                Path chunk = directory.resolve(index + ".part");
                if (!Files.isRegularFile(chunk)) {
                    throw new BizException(
                            ErrorCode.VIDEO_CHUNK_INCOMPLETE, index, totalChunks);
                }
                Files.copy(chunk, output);
            }
        } catch (IOException exception) {
            throw new BizException(ErrorCode.FILE_UPLOAD_FAILED);
        }

        String expectedHash = task.get("sha256").toString();
        try {
            long expectedSize = Long.parseLong(task.get("fileSize").toString());
            if (Files.size(merged) != expectedSize) {
                throw new BizException(ErrorCode.VIDEO_HASH_MISMATCH);
            }
        } catch (IOException exception) {
            throw new BizException(ErrorCode.FILE_UPLOAD_FAILED);
        }
        if (!expectedHash.equals(sha256(merged))) {
            throw new BizException(ErrorCode.VIDEO_HASH_MISMATCH);
        }

        String extension = extension(task.get("fileName").toString());
        String objectKey = "video/" + expectedHash.substring(0, 2)
                + "/" + expectedHash + extension;
        try {
            String url = objectStorage.put(objectKey, merged);
            redisTemplate.opsForValue().set(HASH_PREFIX + expectedHash, objectKey);
            redisTemplate.opsForSet().add(
                    "video:file:owners:" + objectKey,
                    ownerId.toString());
            redisTemplate.delete(taskKey(uploadId));
            redisTemplate.delete(chunksKey(uploadId));
            FileSystemUtils.deleteRecursively(directory);
            return new MergedVideoVO(objectKey, url, expectedHash);
        } catch (IOException exception) {
            throw new BizException(ErrorCode.FILE_UPLOAD_FAILED);
        }
    }

    private Map<Object, Object> task(Long ownerId, String uploadId) {
        Map<Object, Object> task = redisTemplate.opsForHash().entries(taskKey(uploadId));
        if (task.isEmpty()) {
            throw new BizException(ErrorCode.VIDEO_UPLOAD_TASK_NOT_FOUND);
        }
        if (!ownerId.toString().equals(task.get("ownerId"))) {
            throw new BizException(ErrorCode.FORBIDDEN);
        }
        return task;
    }

    private Path uploadDirectory(String uploadId) {
        if (!uploadId.matches("^[0-9a-fA-F-]{36}$")) {
            throw new BizException(ErrorCode.PARAM_ERROR);
        }
        Path root = properties.tempRoot().toAbsolutePath().normalize();
        return root.resolve(uploadId).normalize();
    }

    private String safeFileName(String rawName) {
        String name = Path.of(rawName).getFileName().toString();
        if (!name.toLowerCase().endsWith(".mp4")) {
            throw new BizException(ErrorCode.FILE_TYPE_UNSUPPORTED);
        }
        return name;
    }

    private String extension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot < 0 ? ".mp4" : fileName.substring(dot).toLowerCase();
    }

    private String sha256(Path file) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = new DigestInputStream(
                    Files.newInputStream(file), digest)) {
                input.transferTo(OutputStream.nullOutputStream());
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new BizException(ErrorCode.FILE_UPLOAD_FAILED);
        }
    }

    private String taskKey(String uploadId) {
        return TASK_PREFIX + uploadId;
    }

    private String chunksKey(String uploadId) {
        return CHUNKS_PREFIX + uploadId;
    }
}
```

## 六、Controller 与权限

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\controller\VideoUploadController.java`：

```java
package com.mall.media.controller;

import com.mall.common.result.Result;
import com.mall.media.dto.InitUploadRequest;
import com.mall.media.service.VideoUploadService;
import com.mall.media.vo.InitUploadVO;
import com.mall.media.vo.MergedVideoVO;
import com.mall.security.ResourcePrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Set;

@Validated
@RestController
@RequestMapping("/api/media/videos/uploads")
@RequiredArgsConstructor
@PreAuthorize("hasAnyAuthority('ROLE_TEACHER', 'ROLE_ADMIN')")
@Tag(name = "视频上传", description = "视频分片上传、断点续传与合并")
public class VideoUploadController {
    private final VideoUploadService uploadService;

    @Operation(summary = "初始化视频上传")
    @PostMapping
    public Result<InitUploadVO> init(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @Valid @RequestBody InitUploadRequest request) {
        return Result.ok(uploadService.init(principal.id(), request));
    }

    @Operation(summary = "查询已上传分片")
    @GetMapping("/{uploadId}")
    public Result<Set<Integer>> progress(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable String uploadId) {
        return Result.ok(uploadService.uploadedChunks(principal.id(), uploadId));
    }

    @Operation(summary = "上传单个视频分片")
    @PostMapping("/{uploadId}/chunks")
    public Result<Void> uploadChunk(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable String uploadId,
            @RequestParam @Min(0) int index,
            @RequestParam("file") MultipartFile file) {
        uploadService.uploadChunk(principal.id(), uploadId, index, file);
        return Result.ok();
    }

    @Operation(summary = "合并视频分片")
    @PostMapping("/{uploadId}/merge")
    public Result<MergedVideoVO> merge(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable String uploadId) {
        return Result.ok(uploadService.merge(principal.id(), uploadId));
    }
}
```

Gateway 增加明确路由：

```yaml
- id: mall-media-api
  uri: lb://mall-media
  predicates:
    - Path=/api/media/**
```

## 七、联调与验收

前端按固定大小（建议 5~10 MiB）切片，并发 3~5 个即可；不要无限并发压垮连接池。初始化前计算整个文件 SHA-256。初始化响应若 `instantUpload=true`，直接保存 `objectUrl`；否则先 GET 进度，只补传缺失索引，最后调用 merge。

至少验证这些异常：

1. 故意漏传一个分片，merge 返回 `VIDEO_CHUNK_INCOMPLETE`。
2. 同一分片上传两次，最终集合只记一次，合并结果不重复。
3. 使用别人的 uploadId，返回 403。
4. 修改任一分片内容，merge 返回 `VIDEO_HASH_MISMATCH`。
5. 合并成功后重新初始化同一文件，直接秒传。
6. 任务超过 24 小时后返回 `VIDEO_UPLOAD_TASK_NOT_FOUND`。

::: tip 💡 面试题：为什么“分片全上传”不等于“文件正确”？
**一句话**：分片数量正确只能证明索引到齐，不能证明内容未损坏或顺序正确；合并后还要重新计算整个文件的 SHA-256，与初始化指纹比较，通过后才能进入对象存储。
:::

## 八、知识点索引

| 知识点 | 本日实现 |
|---|---|
| 断点续传 | Redis Set 保存已上传索引 |
| 幂等上传 | 相同 index 原子覆盖，Set 去重 |
| 秒传 | SHA-256 → objectKey 索引 |
| 并发合并 | Redis `SET NX EX` 合并锁 |
| 路径安全 | UUID 校验 + normalize + 固定根目录 |
| 存储解耦 | `ObjectStorage` 接口 |

## 九、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-media:8086` 独立启动并注册 Nacos：是 / 否
- [ ] 中断后只上传缺失分片：是 / 否
- [ ] 合并后 SHA-256 校验通过：是 / 否
- [ ] 同文件再次初始化直接秒传：是 / 否
- [ ] 越权 uploadId 被拒绝：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：

## 十、我下次会追问的问题

1. Redis 里的上传任务为什么要有 TTL？
2. 秒传为什么仍要做权限和对象存在性检查？
3. 为什么分片完成集合不能只存在前端？
4. 合并锁不加会出现什么竞争？
5. 如果改成 OSS 直传，Java 服务还负责哪些事情？
