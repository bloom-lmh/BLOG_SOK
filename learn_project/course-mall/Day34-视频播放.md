# Day 34 · 视频播放（HLS 转码 + 鉴权播放 + 进度上报）

> **今天目标**：在 `mall-media` 中把 Day33 的 MP4 转为 HLS，签发短时播放令牌，并记录可信的断点续播进度。

旧方案“给 m3u8 URL 加 MD5 参数”不可直接用于 HLS：播放清单通过后，播放器还会请求几十个 `.ts` 分片，而相对分片 URL 不一定继承查询参数。本日把令牌放进路径：

```text
/media/hls/{token}/{assetId}/index.m3u8
/media/hls/{token}/{assetId}/segment_00001.ts
```

清单里的相对路径会自然保留 `token/assetId` 前缀，每个分片都会重新验签。

## 一、数据库与配置

执行 `E:\CourseMall\sql\day34_media.sql`：

```sql
CREATE TABLE video_asset (
    id BIGINT NOT NULL AUTO_INCREMENT,
    lesson_id BIGINT NOT NULL,
    source_object_key VARCHAR(500) NOT NULL,
    hls_directory VARCHAR(500) DEFAULT NULL,
    duration_seconds INT NOT NULL DEFAULT 0,
    status TINYINT NOT NULL DEFAULT 0 COMMENT '0待转码 1转码中 2就绪 3失败',
    failure_reason VARCHAR(500) DEFAULT NULL,
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_lesson_id (lesson_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='视频媒资';

CREATE TABLE lesson_progress (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    lesson_id BIGINT NOT NULL,
    last_position_seconds INT NOT NULL DEFAULT 0,
    max_watched_seconds INT NOT NULL DEFAULT 0,
    completed TINYINT NOT NULL DEFAULT 0,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_lesson (user_id, lesson_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课时播放进度';
```

`mall-media/pom.xml` 增加 MyBatis-Plus、MySQL、OpenFeign；版本均沿用父工程：

```xml
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
    <version>${mp.version}</version>
</dependency>
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <scope>runtime</scope>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
```

启动类增加 `@EnableFeignClients` 和 `@MapperScan("com.mall.media.mapper")`。`application.yml` 增加 datasource，并补充：

```yaml
mall:
  media:
    public-base-url: ${MEDIA_PUBLIC_BASE_URL:http://localhost:9000/media/}
  playback:
    secret: ${PLAYBACK_SECRET}
    token-ttl: 2h
  ffmpeg:
    executable: ${FFMPEG_EXECUTABLE:ffmpeg}
    ffprobe-executable: ${FFPROBE_EXECUTABLE:ffprobe}
    hls-root: ${HLS_ROOT:E:/CourseMall/data/hls}
```

`PLAYBACK_SECRET` 至少 32 个随机字节，与 JWT 密钥分开轮换，不能硬编码到仓库。

## 二、媒资实体与转码

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\entity\VideoAsset.java`：

```java
package com.mall.media.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("video_asset")
public class VideoAsset {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long lessonId;
    private String sourceObjectKey;
    private String hlsDirectory;
    private Integer durationSeconds;
    private Integer status;
    private String failureReason;
}
```

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\mapper\VideoAssetMapper.java`：

```java
package com.mall.media.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.media.entity.VideoAsset;

public interface VideoAssetMapper extends BaseMapper<VideoAsset> {
}
```

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\config\FfmpegProperties.java`：

```java
package com.mall.media.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.nio.file.Path;

@ConfigurationProperties(prefix = "mall.ffmpeg")
public record FfmpegProperties(
        String executable,
        String ffprobeExecutable,
        Path hlsRoot) {
}
```

把它加入启动类的 `@EnableConfigurationProperties`。新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\service\VideoTranscodeService.java`：

```java
package com.mall.media.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.media.client.LessonAccessClient;
import com.mall.media.config.FfmpegProperties;
import com.mall.media.config.MediaProperties;
import com.mall.media.entity.VideoAsset;
import com.mall.media.mapper.VideoAssetMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class VideoTranscodeService {
    private final VideoAssetMapper assetMapper;
    private final MediaProperties mediaProperties;
    private final FfmpegProperties ffmpegProperties;

    @Async
    public void transcode(Long assetId) {
        VideoAsset asset = assetMapper.selectById(assetId);
        if (asset == null) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        asset.setStatus(1);
        assetMapper.updateById(asset);

        Path source = safeResolve(mediaProperties.storageRoot(), asset.getSourceObjectKey());
        Path output = ffmpegProperties.hlsRoot().toAbsolutePath().normalize()
                .resolve(assetId.toString());
        try {
            Files.createDirectories(output);
            List<String> command = List.of(
                    ffmpegProperties.executable(), "-y",
                    "-i", source.toString(),
                    "-c:v", "libx264", "-preset", "veryfast",
                    "-c:a", "aac",
                    "-hls_time", "6",
                    "-hls_playlist_type", "vod",
                    "-hls_segment_filename", output.resolve("segment_%05d.ts").toString(),
                    output.resolve("index.m3u8").toString());
            Process process = new ProcessBuilder(command)
                    .redirectErrorStream(true)
                    .start();
            String outputLog = new String(
                    process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            int exitCode = process.waitFor();
            if (exitCode != 0) {
                throw new IllegalStateException("ffmpeg exit=" + exitCode + ": " + outputLog);
            }
            asset.setHlsDirectory(output.toString());
            asset.setDurationSeconds(probeDuration(source));
            asset.setStatus(2);
            asset.setFailureReason(null);
            assetMapper.updateById(asset);
        } catch (IOException | InterruptedException | RuntimeException exception) {
            if (exception instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            asset.setStatus(3);
            asset.setFailureReason(limit(exception.getMessage()));
            assetMapper.updateById(asset);
            log.error("Transcode video failed: assetId={}", assetId, exception);
        }
    }

    private Path safeResolve(Path rootValue, String child) {
        Path root = rootValue.toAbsolutePath().normalize();
        Path result = root.resolve(child).normalize();
        if (!result.startsWith(root)) {
            throw new IllegalArgumentException("Illegal media path");
        }
        return result;
    }

    private String limit(String value) {
        if (value == null) {
            return "unknown";
        }
        return value.substring(0, Math.min(value.length(), 500));
    }

    private int probeDuration(Path source) throws IOException, InterruptedException {
        Process process = new ProcessBuilder(
                ffmpegProperties.ffprobeExecutable(),
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                source.toString())
                .redirectErrorStream(true)
                .start();
        String value = new String(
                process.getInputStream().readAllBytes(), StandardCharsets.UTF_8).trim();
        if (process.waitFor() != 0) {
            throw new IllegalStateException("ffprobe failed: " + value);
        }
        return (int) Math.ceil(Double.parseDouble(value));
    }
}
```

`MallMediaApplication` 的最终配置注解为：

```java
@EnableAsync
@EnableFeignClients
@MapperScan("com.mall.media.mapper")
@EnableConfigurationProperties({
        MediaProperties.class,
        FfmpegProperties.class,
        PlaybackProperties.class
})
```

真实生产应把“转码任务”写入 MQ，由独立 worker 消费；`@Async` 只用于本地学习，进程重启会丢未完成任务。

### 把上传结果绑定到课时并启动转码

Day33 merge 返回 `objectKey`。新建
`E:\CourseMall\mall-media\src\main\java\com\mall\media\dto\CreateVideoAssetRequest.java`：

```java
package com.mall.media.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

@Schema(description = "创建课时视频资产请求")
public record CreateVideoAssetRequest(
        @Schema(description = "课时 ID", example = "1001")
        @NotNull Long lessonId,
        @Schema(description = "Day33 上传得到的对象存储键", example = "video/ab/abc123.mp4")
        @NotBlank String sourceObjectKey) {
}
```

新建 `service/VideoAssetService.java`：

```java
package com.mall.media.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.media.dto.CreateVideoAssetRequest;
import com.mall.media.entity.VideoAsset;
import com.mall.media.mapper.VideoAssetMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class VideoAssetService {
    private final VideoAssetMapper assetMapper;
    private final VideoTranscodeService transcodeService;
    private final StringRedisTemplate redisTemplate;
    private final LessonAccessClient lessonAccessClient;

    public Long create(Long teacherId, CreateVideoAssetRequest request) {
        Result<Boolean> manageable = lessonAccessClient.canManage(
                request.lessonId(), teacherId);
        if (manageable == null || !Boolean.TRUE.equals(manageable.getData())) {
            throw new BizException(ErrorCode.FORBIDDEN);
        }
        String objectKey = request.sourceObjectKey();
        if (!objectKey.matches("^video/[a-f0-9]{2}/[a-f0-9]{64}\\.mp4$")
                || !Boolean.TRUE.equals(redisTemplate.opsForSet().isMember(
                        "video:file:owners:" + objectKey,
                        teacherId.toString()))) {
            throw new BizException(ErrorCode.FORBIDDEN);
        }

        VideoAsset asset = assetMapper.selectOne(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getLessonId, request.lessonId()));
        if (asset == null) {
            asset = new VideoAsset();
            asset.setLessonId(request.lessonId());
            asset.setSourceObjectKey(objectKey);
            asset.setStatus(0);
            asset.setDurationSeconds(0);
            assetMapper.insert(asset);
        } else {
            asset.setSourceObjectKey(objectKey);
            asset.setStatus(0);
            asset.setFailureReason(null);
            assetMapper.updateById(asset);
        }
        transcodeService.transcode(asset.getId());
        return asset.getId();
    }
}
```

新建 `controller/VideoAssetController.java`：

```java
package com.mall.media.controller;

import com.mall.common.result.Result;
import com.mall.media.dto.CreateVideoAssetRequest;
import com.mall.media.service.VideoAssetService;
import com.mall.security.ResourcePrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/media/assets")
@RequiredArgsConstructor
@Tag(name = "视频资产", description = "绑定课时视频并启动转码")
public class VideoAssetController {
    private final VideoAssetService assetService;

    @Operation(summary = "创建课时视频资产")
    @PostMapping
    @PreAuthorize("hasAnyAuthority('ROLE_TEACHER', 'ROLE_ADMIN')")
    public Result<Long> create(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @Valid @RequestBody CreateVideoAssetRequest request) {
        return Result.ok(assetService.create(principal.id(), request));
    }
}
```

这里同时校验课时管理权和上传对象所有权：前者证明课时属于当前讲师，后者证明视频由
当前讲师上传，两者缺一不可。

## 三、短时播放令牌

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\config\PlaybackProperties.java`：

```java
package com.mall.media.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.time.Duration;

@ConfigurationProperties(prefix = "mall.playback")
public record PlaybackProperties(String secret, Duration tokenTtl) {
}
```

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\service\PlaybackTokenService.java`：

```java
package com.mall.media.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.media.config.PlaybackProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;

@Service
@RequiredArgsConstructor
public class PlaybackTokenService {
    private final PlaybackProperties properties;

    public String issue(Long userId, Long assetId) {
        long expiresAt = Instant.now().plus(properties.tokenTtl()).getEpochSecond();
        String payload = userId + ":" + assetId + ":" + expiresAt;
        return encode(payload.getBytes(StandardCharsets.UTF_8)) + "." + encode(hmac(payload));
    }

    public Claims verify(String token, Long expectedAssetId) {
        try {
            String[] parts = token.split("\\.", 2);
            byte[] payloadBytes = Base64.getUrlDecoder().decode(parts[0]);
            String payload = new String(payloadBytes, StandardCharsets.UTF_8);
            byte[] actual = Base64.getUrlDecoder().decode(parts[1]);
            if (!MessageDigest.isEqual(hmac(payload), actual)) {
                throw new BizException(ErrorCode.FORBIDDEN);
            }
            String[] values = payload.split(":", 3);
            Claims claims = new Claims(
                    Long.valueOf(values[0]),
                    Long.valueOf(values[1]),
                    Long.parseLong(values[2]));
            if (!claims.assetId().equals(expectedAssetId)
                    || claims.expiresAt() < Instant.now().getEpochSecond()) {
                throw new BizException(ErrorCode.SIGNED_URL_EXPIRED);
            }
            return claims;
        } catch (IllegalArgumentException | ArrayIndexOutOfBoundsException exception) {
            throw new BizException(ErrorCode.FORBIDDEN);
        }
    }

    private byte[] hmac(String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    properties.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot create playback signature", exception);
        }
    }

    private String encode(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    public record Claims(Long userId, Long assetId, long expiresAt) {
    }
}
```

### 签发播放地址

先补上不能省略的课程权限客户端。新建
`E:\CourseMall\mall-media\src\main\java\com\mall\media\client\LessonAccessClient.java`：

```java
package com.mall.media.client;

import com.mall.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "mall-course", path = "/internal/lessons")
public interface LessonAccessClient {
    @GetMapping("/{lessonId}/playable")
    Result<Boolean> canPlay(
            @PathVariable Long lessonId,
            @RequestParam Long userId);

    @GetMapping("/{lessonId}/manageable")
    Result<Boolean> canManage(
            @PathVariable Long lessonId,
            @RequestParam Long teacherId);
}
```

`mall-course` 的内部接口根据免费试听、课程是否上架以及用户购买记录返回结果；它必须受
内部服务鉴权保护，不能暴露成客户端可伪造的 `canPlay=true` 参数。

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\controller\PlaybackController.java`：

```java
package com.mall.media.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.media.client.LessonAccessClient;
import com.mall.media.entity.VideoAsset;
import com.mall.media.mapper.VideoAssetMapper;
import com.mall.media.service.PlaybackTokenService;
import com.mall.security.ResourcePrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/media/playback")
@RequiredArgsConstructor
@Tag(name = "视频播放", description = "校验观看权并签发短时播放地址")
public class PlaybackController {
    private final VideoAssetMapper assetMapper;
    private final PlaybackTokenService tokenService;
    private final LessonAccessClient lessonAccessClient;

    @Value("${mall.media.public-base-url}")
    private String publicBaseUrl;

    @Operation(summary = "获取课时播放地址")
    @GetMapping("/{lessonId}")
    public Result<PlaybackVO> create(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable Long lessonId) {
        Result<Boolean> access = lessonAccessClient.canPlay(lessonId, principal.id());
        if (access == null || !Boolean.TRUE.equals(access.getData())) {
            throw new BizException(ErrorCode.COURSE_NOT_PURCHASED);
        }
        VideoAsset asset = assetMapper.selectOne(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getLessonId, lessonId));
        if (asset == null) {
            throw new BizException(ErrorCode.LESSON_NOT_FOUND);
        }
        if (!Integer.valueOf(2).equals(asset.getStatus())) {
            throw new BizException(ErrorCode.VIDEO_NOT_READY);
        }
        String token = tokenService.issue(principal.id(), asset.getId());
        String url = publicBaseUrl + "hls/" + token + "/"
                + asset.getId() + "/index.m3u8";
        return Result.ok(new PlaybackVO(url, asset.getDurationSeconds()));
    }

    @Schema(description = "课时播放信息")
    public record PlaybackVO(
            @Schema(description = "带短时令牌的 HLS 清单地址") String manifestUrl,
            @Schema(description = "视频总时长（秒）", example = "1800") int durationSeconds) {
    }
}
```

### 每个 HLS 文件都验签

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\controller\HlsResourceController.java`：

```java
package com.mall.media.controller;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.media.config.FfmpegProperties;
import com.mall.media.service.PlaybackTokenService;
import io.swagger.v3.oas.annotations.Hidden;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/media/hls")
@RequiredArgsConstructor
@Hidden
public class HlsResourceController {
    private final PlaybackTokenService tokenService;
    private final FfmpegProperties properties;

    @GetMapping("/{token}/{assetId}/{fileName}")
    public ResponseEntity<Resource> read(
            @PathVariable String token,
            @PathVariable Long assetId,
            @PathVariable String fileName) {
        tokenService.verify(token, assetId);
        if (!fileName.matches("^(index\\.m3u8|segment_\\d{5}\\.ts)$")) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        Path root = properties.hlsRoot().toAbsolutePath().normalize()
                .resolve(assetId.toString());
        Path file = root.resolve(fileName).normalize();
        if (!file.startsWith(root) || !Files.isRegularFile(file)) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        MediaType type = fileName.endsWith(".m3u8")
                ? MediaType.parseMediaType("application/vnd.apple.mpegurl")
                : MediaType.parseMediaType("video/mp2t");
        return ResponseEntity.ok()
                .contentType(type)
                .header("Cache-Control", "private, max-age=30")
                .body(new FileSystemResource(file));
    }
}
```

将 `/media/hls/**` 配为 HTTP `permitAll`，因为它使用自己的短时 HMAC token；如果仍要求 JWT，原生 `<video>`/HLS 分片请求往往无法方便附加 Authorization Header。

## 四、断点续播进度

新建 `E:\CourseMall\mall-media\src\main\java\com\mall\media\entity\LessonProgress.java`：

```java
package com.mall.media.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("lesson_progress")
public class LessonProgress {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long lessonId;
    private Integer lastPositionSeconds;
    private Integer maxWatchedSeconds;
    private Integer completed;
    private LocalDateTime updateTime;
}
```

Mapper 用一条原子 UPSERT，避免“先查后改”的并发窗口：

`E:\CourseMall\mall-media\src\main\java\com\mall\media\mapper\LessonProgressMapper.java`：

```java
package com.mall.media.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.media.entity.LessonProgress;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Param;

public interface LessonProgressMapper extends BaseMapper<LessonProgress> {
    @Insert("""
            INSERT INTO lesson_progress
                (user_id, lesson_id, last_position_seconds, max_watched_seconds, completed)
            VALUES
                (#{userId}, #{lessonId}, #{position}, #{position}, #{completed})
            ON DUPLICATE KEY UPDATE
                last_position_seconds = VALUES(last_position_seconds),
                max_watched_seconds = GREATEST(max_watched_seconds, VALUES(max_watched_seconds)),
                completed = GREATEST(completed, VALUES(completed))
            """)
    int upsert(
            @Param("userId") Long userId,
            @Param("lessonId") Long lessonId,
            @Param("position") int position,
            @Param("completed") int completed);
}
```

新建
`E:\CourseMall\mall-media\src\main\java\com\mall\media\dto\ProgressReportRequest.java`：

```java
package com.mall.media.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;

@Schema(description = "学习进度上报请求")
public record ProgressReportRequest(
        @Schema(description = "当前播放位置（秒）", example = "320")
        @Min(value = 0, message = "{validation.progress.position.min}")
        int positionSeconds) {
}
```

`E:\CourseMall\mall-media\src\main\java\com\mall\media\controller\LessonProgressController.java`：

```java
package com.mall.media.controller;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.media.client.LessonAccessClient;
import com.mall.media.dto.ProgressReportRequest;
import com.mall.media.entity.LessonProgress;
import com.mall.media.entity.VideoAsset;
import com.mall.media.mapper.LessonProgressMapper;
import com.mall.media.mapper.VideoAssetMapper;
import com.mall.security.ResourcePrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/media/lessons")
@RequiredArgsConstructor
@Tag(name = "学习进度", description = "上报和查询课时播放进度")
public class LessonProgressController {
    private final VideoAssetMapper assetMapper;
    private final LessonProgressMapper progressMapper;
    private final LessonAccessClient lessonAccessClient;

    @Operation(summary = "上报课时学习进度")
    @PutMapping("/{lessonId}/progress")
    public Result<Void> report(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable Long lessonId,
            @Valid @RequestBody ProgressReportRequest request) {
        assertCanPlay(principal.id(), lessonId);
        VideoAsset asset = assetMapper.selectOne(new LambdaQueryWrapper<VideoAsset>()
                .eq(VideoAsset::getLessonId, lessonId));
        if (asset == null) {
            throw new BizException(ErrorCode.LESSON_NOT_FOUND);
        }
        int duration = asset.getDurationSeconds();
        if (request.positionSeconds() > duration + 10) {
            throw new BizException(ErrorCode.PARAM_ERROR);
        }
        int position = Math.min(request.positionSeconds(), duration);
        int completed = duration > 0 && position >= duration * 0.9 ? 1 : 0;
        progressMapper.upsert(principal.id(), lessonId, position, completed);
        return Result.ok();
    }

    @Operation(summary = "查询课时学习进度")
    @GetMapping("/{lessonId}/progress")
    public Result<ProgressVO> get(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable Long lessonId) {
        assertCanPlay(principal.id(), lessonId);
        LessonProgress progress = progressMapper.selectOne(
                new LambdaQueryWrapper<LessonProgress>()
                        .eq(LessonProgress::getUserId, principal.id())
                        .eq(LessonProgress::getLessonId, lessonId));
        return Result.ok(progress == null
                ? new ProgressVO(0, 0, false)
                : new ProgressVO(
                        progress.getLastPositionSeconds(),
                        progress.getMaxWatchedSeconds(),
                        Integer.valueOf(1).equals(progress.getCompleted())));
    }

    private void assertCanPlay(Long userId, Long lessonId) {
        Result<Boolean> access = lessonAccessClient.canPlay(lessonId, userId);
        if (access == null || !Boolean.TRUE.equals(access.getData())) {
            throw new BizException(ErrorCode.COURSE_NOT_PURCHASED);
        }
    }

    @Schema(description = "课时学习进度")
    public record ProgressVO(
            @Schema(description = "上次播放位置（秒）") int lastPositionSeconds,
            @Schema(description = "历史最远观看位置（秒）") int maxWatchedSeconds,
            @Schema(description = "是否已完成学习") boolean completed) {
    }
}
```

前端每 15~30 秒、暂停、退出页面时上报一次；不要每秒写数据库。后端仍要校验时长和课程所有权，不能接受 DTO 里的 userId/totalTime。

## 五、验收

1. FFmpeg 不在 PATH 时，转码状态变为失败且有日志，不应永远卡在“转码中”。
2. m3u8 和所有 ts 都能播放；改 token 任意一个字符返回 403。
3. token 到期后分片请求失败，前端重新请求 playback URL 后继续播放。
4. 未购买用户不能拿到播放 token。
5. 同一用户并发上报进度不产生重复行，回看时 last position 可回退，max watched 不回退。

::: tip 💡 面试题：防盗链是否能阻止录屏？
**一句话**：不能。短时签名 URL 只能降低链接分享和资源盗用，合法用户拿到解密后的视频仍可录屏；更高要求需要 DRM、水印、设备限制和风控共同完成。
:::

## 六、知识点索引

| 知识点 | 本日实现 |
|---|---|
| HLS | m3u8 清单 + 6 秒 ts 分片 |
| 异步转码 | 本地 `@Async`，生产 MQ worker |
| 防盗链 | HMAC-SHA256 路径令牌 |
| 恒定时间比较 | `MessageDigest.isEqual` |
| 断点续播 | 唯一索引 + MySQL UPSERT |

## 七、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] MP4 转 HLS 成功，状态能正确落库：是 / 否
- [ ] m3u8 与 ts 都经过令牌校验：是 / 否
- [ ] 未购买用户不能获得播放地址：是 / 否
- [ ] 进度上报和断点续播正常：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：

## 八、我下次会追问的问题

1. 为什么只给 m3u8 查询参数签名可能保护不了 ts？
2. HMAC 与 MD5 拼接密钥相比好在哪里？
3. 为什么转码不应占用 HTTP 请求线程？
4. 播放进度为什么要唯一索引和 UPSERT？
5. 签名 URL、防盗链、DRM 分别能解决什么问题？
