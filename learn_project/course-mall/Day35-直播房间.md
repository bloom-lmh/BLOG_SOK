# Day 35 · 直播房间（SRS 推拉流 + 状态机 + 在线人数）

> **今天目标**：新增 `mall-live:8089` 管理直播房间，用 SRS 承担 RTMP 推流和 HLS 拉流；讲师身份、推流密钥、房间状态和在线人数都由服务端控制。

Java 服务不是流媒体服务器。它负责房间、权限、签名和状态；音视频字节由 SRS/CDN 处理。旧文档只拼接一个 `rtmp://...` 字符串并不代表直播已经可用。

## 一、最终链路

```text
讲师 OBS --RTMP + publishSecret--> SRS:1935
                                      |
                                      +--HTTP callback--> mall-live 校验并更新 LIVE
                                      |
学生播放器 <--HLS--------------------- SRS:8088

学生 STOMP join/leave --> mall-realtime --> Redis 在线集合 --> /topic/live/{roomId}/presence
```

## 二、新建 `mall-live` 与表

`E:\CourseMall\pom.xml` 增加 `<module>mall-live</module>`。新模块依赖：

```xml
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
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-redis</artifactId>
    </dependency>
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-openfeign</artifactId>
    </dependency>
    <dependency>
        <groupId>org.mapstruct</groupId>
        <artifactId>mapstruct</artifactId>
        <version>${mapstruct.version}</version>
    </dependency>
    <dependency>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <scope>provided</scope>
    </dependency>
</dependencies>
```

annotation processor 配置沿用 Day03。新建
`E:\CourseMall\mall-live\src\main\java\com\mall\live\MallLiveApplication.java`：

```java
package com.mall.live;

import com.mall.live.config.LiveProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cloud.openfeign.EnableFeignClients;

@EnableFeignClients
@MapperScan("com.mall.live.mapper")
@EnableConfigurationProperties(LiveProperties.class)
@SpringBootApplication(scanBasePackages = "com.mall")
public class MallLiveApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallLiveApplication.class, args);
    }
}
```

`E:\CourseMall\sql\day35_live.sql`：

```sql
CREATE TABLE live_room (
    id BIGINT NOT NULL AUTO_INCREMENT,
    teacher_id BIGINT NOT NULL,
    course_id BIGINT DEFAULT NULL,
    title VARCHAR(100) NOT NULL,
    stream_name VARCHAR(64) NOT NULL,
    status TINYINT NOT NULL DEFAULT 0 COMMENT '0待开始 1待推流 2直播中 3已结束 4已取消',
    scheduled_start_time DATETIME DEFAULT NULL,
    actual_start_time DATETIME DEFAULT NULL,
    actual_end_time DATETIME DEFAULT NULL,
    replay_url VARCHAR(500) DEFAULT NULL,
    version INT NOT NULL DEFAULT 0,
    created_by BIGINT DEFAULT NULL COMMENT '创建人ID',
    updated_by BIGINT DEFAULT NULL COMMENT '最后修改人ID',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted TINYINT NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_stream_name (stream_name),
    KEY idx_teacher_status (teacher_id, status),
    KEY idx_course_status (course_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='直播房间';
```

不保存可直接使用的完整推流 URL；只有讲师点击“开始直播”时才签发短时 publishSecret。

## 三、配置、DTO、实体与 MapStruct

`E:\CourseMall\mall-live\src\main\resources\application.yml`：

```yaml
server:
  port: 8089
spring:
  application:
    name: mall-live
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_ADDR:127.0.0.1:8848}
  datasource:
    url: jdbc:mysql://127.0.0.1:3306/course_mall?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai
    username: ${MYSQL_USERNAME}
    password: ${MYSQL_PASSWORD}
  data:
    redis:
      host: ${REDIS_HOST:127.0.0.1}
      port: ${REDIS_PORT:6379}
jwt:
  secret: ${JWT_SECRET}
security:
  resource:
    enabled: true
    public-post-paths:
      - /internal/live/hooks/**
mall:
  live:
    push-base-url: ${LIVE_PUSH_BASE_URL:rtmp://localhost:1935/live}
    pull-base-url: ${LIVE_PULL_BASE_URL:http://localhost:8088/live}
    publish-secret: ${LIVE_PUBLISH_SECRET}
    publish-token-ttl: 10m
```

新建 `config/LiveProperties.java`：

```java
package com.mall.live.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.net.URI;
import java.time.Duration;

@ConfigurationProperties(prefix = "mall.live")
public record LiveProperties(
        URI pushBaseUrl,
        URI pullBaseUrl,
        String publishSecret,
        Duration publishTokenTtl,
        String hookSecret) {
}
```

新建 `dto/CreateLiveRoomRequest.java`：

```java
package com.mall.live.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

@Schema(description = "创建直播房间请求")
public record CreateLiveRoomRequest(
        @Schema(description = "关联课程 ID；公开直播可为空", example = "1001")
        Long courseId,
        @Schema(description = "直播标题", example = "Spring Boot 事务实战")
        @NotBlank(message = "{validation.live.title.not-blank}")
        @Size(max = 100, message = "{validation.live.title.size}")
        String title,
        @Schema(description = "计划开播时间", example = "2026-09-01T20:00:00")
        LocalDateTime scheduledStartTime) {
}
```

新建 `entity/LiveRoom.java`：

```java
package com.mall.live.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.LocalDateTime;

@Data
@TableName("live_room")
public class LiveRoom {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long teacherId;
    private Long courseId;
    private String title;
    private String streamName;
    private Integer status;
    private LocalDateTime scheduledStartTime;
    private LocalDateTime actualStartTime;
    private LocalDateTime actualEndTime;
    private String replayUrl;
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
    @TableLogic
    private Integer deleted;
}
```

新建 `vo/LiveRoomVO.java` 与 `converter/LiveRoomConverter.java`：

```java
package com.mall.live.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDateTime;

@Schema(description = "直播房间信息")
public record LiveRoomVO(
        @Schema(description = "直播房间 ID")
        Long id,
        @Schema(description = "讲师用户 ID")
        Long teacherId,
        @Schema(description = "关联课程 ID")
        Long courseId,
        @Schema(description = "直播标题")
        String title,
        @Schema(description = "状态：0待开始，1待推流，2直播中，3已结束，4已取消")
        Integer status,
        @Schema(description = "计划开播时间")
        LocalDateTime scheduledStartTime,
        @Schema(description = "实际开播时间")
        LocalDateTime actualStartTime,
        @Schema(description = "HLS 拉流地址")
        String pullUrl,
        @Schema(description = "在线用户数")
        long onlineUsers) {
}
```

```java
package com.mall.live.converter;

import com.mall.live.entity.LiveRoom;
import com.mall.live.vo.LiveRoomVO;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface LiveRoomConverter {
    @Mapping(target = "pullUrl", source = "pullUrl")
    @Mapping(target = "onlineUsers", source = "onlineUsers")
    LiveRoomVO toVO(LiveRoom room, String pullUrl, long onlineUsers);
}
```

record 是不可变数据载体，适合 DTO/VO；数据库实体需要 MyBatis-Plus 回填 ID 和修改状态，所以继续使用普通 class。

## 四、推流令牌与状态机

新建 `service/LivePublishTokenService.java`：

```java
package com.mall.live.service;

import com.mall.live.config.LiveProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
public class LivePublishTokenService {
    private final LiveProperties properties;

    public PublishToken issue(String streamName) {
        long expires = Instant.now().plus(properties.publishTokenTtl()).getEpochSecond();
        return new PublishToken(expires, sign(streamName, expires));
    }

    public boolean verify(String streamName, long expires, String token) {
        return expires >= Instant.now().getEpochSecond()
                && java.security.MessageDigest.isEqual(
                        sign(streamName, expires).getBytes(StandardCharsets.UTF_8),
                        token.getBytes(StandardCharsets.UTF_8));
    }

    private String sign(String streamName, long expires) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(
                    properties.publishSecret().getBytes(StandardCharsets.UTF_8),
                    "HmacSHA256"));
            return HexFormat.of().formatHex(
                    mac.doFinal((streamName + ":" + expires)
                            .getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot sign publish token", exception);
        }
    }

    public record PublishToken(long expires, String value) {
    }
}
```

新建 `mapper/LiveRoomMapper.java`，用条件 UPDATE 保证状态迁移原子性：

```java
package com.mall.live.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.live.entity.LiveRoom;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface LiveRoomMapper extends BaseMapper<LiveRoom> {
    @Update("""
            UPDATE live_room
            SET status = #{target}, version = version + 1,
                actual_start_time = CASE WHEN #{target} = 2 THEN NOW() ELSE actual_start_time END,
                actual_end_time = CASE WHEN #{target} = 3 THEN NOW() ELSE actual_end_time END
            WHERE id = #{roomId} AND teacher_id = #{teacherId}
              AND status = #{expected} AND deleted = 0
            """)
    int transition(
            @Param("roomId") Long roomId,
            @Param("teacherId") Long teacherId,
            @Param("expected") int expected,
            @Param("target") int target);

    @Update("""
            UPDATE live_room
            SET status = #{target}, version = version + 1,
                actual_start_time = CASE WHEN #{target} = 2 THEN NOW() ELSE actual_start_time END,
                actual_end_time = CASE WHEN #{target} = 3 THEN NOW() ELSE actual_end_time END
            WHERE stream_name = #{streamName} AND status = #{expected} AND deleted = 0
            """)
    int transitionByStream(
            @Param("streamName") String streamName,
            @Param("expected") int expected,
            @Param("target") int target);
}
```

新建 `service/LiveRoomService.java`：

先新增课程观看权客户端和在线数查询器：

```java
package com.mall.live.client;

import com.mall.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "mall-course", path = "/internal/courses")
public interface LiveCourseClient {
    @GetMapping("/{courseId}/live-access")
    Result<Boolean> canWatchLive(
            @PathVariable Long courseId,
            @RequestParam Long userId);
}
```

```java
package com.mall.live.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import java.time.Instant;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class LiveOnlineQueryService {
    private final StringRedisTemplate redisTemplate;

    public long countUsers(Long roomId) {
        String key = "live:room:" + roomId + ":sessions";
        long cutoff = Instant.now().minusSeconds(45).toEpochMilli();
        redisTemplate.opsForZSet().removeRangeByScore(key, 0, cutoff);
        Set<String> active = redisTemplate.opsForZSet()
                .rangeByScore(key, cutoff, Double.POSITIVE_INFINITY);
        return active == null ? 0 : active.stream()
                .map(value -> value.substring(0, value.indexOf(':')))
                .distinct()
                .count();
    }
}
```

`mall-live` 因此还要加入 OpenFeign 依赖，启动类加 `@EnableFeignClients`。完整 Service：

```java
package com.mall.live.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.live.client.LiveCourseClient;
import com.mall.live.config.LiveProperties;
import com.mall.live.converter.LiveRoomConverter;
import com.mall.live.dto.CreateLiveRoomRequest;
import com.mall.live.entity.LiveRoom;
import com.mall.live.mapper.LiveRoomMapper;
import com.mall.live.vo.LiveRoomVO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class LiveRoomService {
    private final LiveRoomMapper roomMapper;
    private final LivePublishTokenService tokenService;
    private final LiveProperties properties;
    private final LiveCourseClient courseClient;
    private final LiveOnlineQueryService onlineQueryService;
    private final LiveRoomConverter converter;

    public Long create(Long teacherId, CreateLiveRoomRequest request) {
        LiveRoom room = new LiveRoom();
        room.setTeacherId(teacherId);
        room.setCourseId(request.courseId());
        room.setTitle(request.title().trim());
        room.setScheduledStartTime(request.scheduledStartTime());
        room.setStreamName(UUID.randomUUID().toString().replace("-", ""));
        room.setStatus(0);
        room.setVersion(0);
        roomMapper.insert(room);
        return room.getId();
    }

    public StartLiveVO prepareStart(Long teacherId, Long roomId) {
        LiveRoom room = required(roomId);
        if (!teacherId.equals(room.getTeacherId())
                || roomMapper.transition(roomId, teacherId, 0, 1) != 1) {
            throw new BizException(ErrorCode.LIVE_ACCESS_DENIED);
        }
        LivePublishTokenService.PublishToken token = tokenService.issue(room.getStreamName());
        String pushUrl = properties.pushBaseUrl() + "/" + room.getStreamName()
                + "?expires=" + token.expires() + "&token=" + token.value();
        String pullUrl = properties.pullBaseUrl() + "/" + room.getStreamName() + ".m3u8";
        return new StartLiveVO(pushUrl, pullUrl, token.expires());
    }

    public void end(Long teacherId, Long roomId) {
        // 此处只在 SRS 已停止发布后落业务状态；不能靠改数据库强制断开推流连接。
        if (roomMapper.transition(roomId, teacherId, 2, 3) != 1) {
            throw new BizException(ErrorCode.LIVE_ACCESS_DENIED);
        }
    }

    public LiveRoom required(Long roomId) {
        LiveRoom room = roomMapper.selectById(roomId);
        if (room == null) {
            throw new BizException(ErrorCode.LIVE_ROOM_NOT_FOUND);
        }
        return room;
    }

    public List<LiveRoomVO> listLiving() {
        return roomMapper.selectList(new LambdaQueryWrapper<LiveRoom>()
                        .eq(LiveRoom::getStatus, 2)
                        .orderByDesc(LiveRoom::getActualStartTime))
                .stream()
                .map(this::toVO)
                .toList();
    }

    public LiveRoomVO enter(Long userId, Long roomId) {
        LiveRoom room = required(roomId);
        if (!Integer.valueOf(2).equals(room.getStatus())) {
            throw new BizException(ErrorCode.LIVE_NOT_STARTED);
        }
        if (room.getCourseId() != null) {
            Result<Boolean> access = courseClient.canWatchLive(
                    room.getCourseId(), userId);
            if (access == null || !Boolean.TRUE.equals(access.getData())) {
                throw new BizException(ErrorCode.LIVE_ACCESS_DENIED);
            }
        }
        return toVO(room);
    }

    private LiveRoomVO toVO(LiveRoom room) {
        String pullUrl = properties.pullBaseUrl()
                + "/" + room.getStreamName() + ".m3u8";
        return converter.toVO(
                room,
                pullUrl,
                onlineQueryService.countUsers(room.getId()));
    }

    @Schema(description = "开播凭证")
    public record StartLiveVO(
            @Schema(description = "带短时凭证的推流地址") String pushUrl,
            @Schema(description = "观众拉流地址") String pullUrl,
            @Schema(description = "推流凭证过期时间戳（秒）") long expiresAt) {
    }
}
```

`end` 接口应先调用 SRS 管理 API 断开发布者（或要求 OBS 主动停止推流），确认停止后再把状态从 2 改为 3。数据库状态不是流媒体服务器的开关；生产环境还要由 `on_unpublish` 回调兜底纠正状态。

状态不能由普通 `updateById` 随便改，否则两个“开始直播”请求都可能成功。条件 UPDATE 相当于轻量状态机：
`WAITING(0) -> READY_TO_PUBLISH(1) -> LIVE(2) -> ENDED(3)`。

本地 SRS 的 pullUrl 便于联调，但知道地址的人仍可分享。生产环境把 HLS 放在 CDN/Nginx
后，并像 Day34 一样签发短时 HMAC 路径令牌；不能把“先调用 enter 接口”误认为真正的
媒体防盗链。

## 五、Controller 权限

新建 `controller/LiveRoomController.java`：

```java
package com.mall.live.controller;

import com.mall.common.result.Result;
import com.mall.live.dto.CreateLiveRoomRequest;
import com.mall.live.service.LiveRoomService;
import com.mall.security.ResourcePrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/live/rooms")
@RequiredArgsConstructor
@Tag(name = "直播房间", description = "直播房间创建、开播、进入和结束")
public class LiveRoomController {
    private final LiveRoomService roomService;

    @Operation(summary = "查询正在直播的房间")
    @GetMapping
    public Result<List<com.mall.live.vo.LiveRoomVO>> listLiving() {
        return Result.ok(roomService.listLiving());
    }

    @Operation(summary = "进入直播房间")
    @GetMapping("/{roomId}")
    public Result<com.mall.live.vo.LiveRoomVO> enter(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable Long roomId) {
        return Result.ok(roomService.enter(principal.id(), roomId));
    }

    @Operation(summary = "创建直播房间")
    @PostMapping
    @PreAuthorize("hasAnyAuthority('ROLE_TEACHER', 'ROLE_ADMIN')")
    public Result<Long> create(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @Valid @RequestBody CreateLiveRoomRequest request) {
        return Result.ok(roomService.create(principal.id(), request));
    }

    @Operation(summary = "获取推流凭证并准备开播")
    @PostMapping("/{roomId}/start")
    @PreAuthorize("hasAnyAuthority('ROLE_TEACHER', 'ROLE_ADMIN')")
    public Result<LiveRoomService.StartLiveVO> start(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable Long roomId) {
        return Result.ok(roomService.prepareStart(principal.id(), roomId));
    }

    @Operation(summary = "结束直播")
    @PostMapping("/{roomId}/end")
    @PreAuthorize("hasAnyAuthority('ROLE_TEACHER', 'ROLE_ADMIN')")
    public Result<Void> end(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable Long roomId) {
        roomService.end(principal.id(), roomId);
        return Result.ok();
    }
}
```

注意：`ROLE_TEACHER` 只是粗粒度授权；Service 里的 `teacher_id = 当前用户` 才是数据所有权校验。管理员代操作要单独设计，不要把“有 ADMIN”偷偷等同于房主。

## 六、SRS 本地运行与回调

新建 `E:\CourseMall\deploy\srs\docker-compose.yml`：

```yaml
services:
  srs:
    image: ossrs/srs:5
    ports:
      - "1935:1935"
      - "8088:8080"
      - "1985:1985"
    volumes:
      - ./srs.conf:/usr/local/srs/conf/srs.conf:ro
    command: ["./objs/srs", "-c", "conf/srs.conf"]
```

新建 `E:\CourseMall\deploy\srs\srs.conf`：

```text
listen              1935;
max_connections     1000;
daemon              off;

http_server {
    enabled on;
    listen 8080;
    dir ./objs/nginx/html;
}

vhost __defaultVhost__ {
    hls {
        enabled on;
        hls_path ./objs/nginx/html;
        hls_fragment 6;
        hls_window 60;
    }
    http_hooks {
        enabled on;
        on_publish http://host.docker.internal:8089/internal/live/hooks/publish?secret=local-hook-secret;
        on_unpublish http://host.docker.internal:8089/internal/live/hooks/unpublish?secret=local-hook-secret;
    }
}
```

生产环境的 Hook 地址只走内网并使用独立强随机 secret；本地示例值不能部署到公网。

`application.yml` 的 `mall.live` 增加：

```yaml
hook-secret: ${LIVE_HOOK_SECRET:local-hook-secret}
```

上面的 `LiveProperties` 已包含 `hookSecret` 组件。新建
`E:\CourseMall\mall-live\src\main\java\com\mall\live\controller\SrsHookController.java`：

```java
package com.mall.live.controller;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.mall.live.config.LiveProperties;
import com.mall.live.mapper.LiveRoomMapper;
import com.mall.live.service.LivePublishTokenService;
import io.swagger.v3.oas.annotations.Hidden;
import lombok.RequiredArgsConstructor;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.util.UriComponentsBuilder;

@RestController
@RequestMapping("/internal/live/hooks")
@RequiredArgsConstructor
@Hidden
public class SrsHookController {
    private final LiveProperties properties;
    private final LivePublishTokenService tokenService;
    private final LiveRoomMapper roomMapper;

    @PostMapping("/publish")
    public HookResponse onPublish(
            @RequestParam String secret,
            @RequestBody SrsHookRequest request) {
        if (!properties.hookSecret().equals(secret)) {
            return new HookResponse(1);
        }
        MultiValueMap<String, String> query = parseQuery(request.param());
        try {
            long expires = Long.parseLong(query.getFirst("expires"));
            String token = query.getFirst("token");
            boolean verified = token != null
                    && tokenService.verify(request.stream(), expires, token);
            int changed = verified
                    ? roomMapper.transitionByStream(request.stream(), 1, 2)
                    : 0;
            return new HookResponse(changed == 1 ? 0 : 1);
        } catch (RuntimeException exception) {
            return new HookResponse(1);
        }
    }

    @PostMapping("/unpublish")
    public HookResponse onUnpublish(
            @RequestParam String secret,
            @RequestBody SrsHookRequest request) {
        if (!properties.hookSecret().equals(secret)) {
            return new HookResponse(1);
        }
        // OBS 正常停止或网络中断都由 SRS 回调，状态迁移保持幂等。
        roomMapper.transitionByStream(request.stream(), 2, 3);
        return new HookResponse(0);
    }

    private MultiValueMap<String, String> parseQuery(String param) {
        String value = param == null ? "" : param;
        return UriComponentsBuilder.fromUriString("http://localhost/" + value)
                .build()
                .getQueryParams();
    }

    public record SrsHookRequest(
            String action,
            @JsonProperty("client_id") String clientId,
            String ip,
            String app,
            String stream,
            String param) {
    }

    public record HookResponse(int code) {
    }
}
```

`prepareStart` 只把状态从 0 改为 1；SRS 真正收到并验证推流后，Hook 才把 1 改为
2。客户端调用“开始直播”不再等同于已经有视频流。

## 七、在线人数放在实时服务

在 `mall-realtime` 使用 ZSet 记录带最后心跳时间的会话。新建
`E:\CourseMall\mall-realtime\src\main\java\com\mall\realtime\live\LivePresenceService.java`：

```java
package com.mall.realtime.live;

import com.mall.realtime.broker.RealtimePublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
@RequiredArgsConstructor
public class LivePresenceService {
    private static final Duration TIMEOUT = Duration.ofSeconds(45);

    private final StringRedisTemplate redisTemplate;
    private final RealtimePublisher publisher;
    private final Map<String, Set<Membership>> localSessions = new ConcurrentHashMap<>();

    public void heartbeat(Long roomId, Long userId, String sessionId) {
        Membership membership = new Membership(roomId, userId);
        localSessions.computeIfAbsent(sessionId, ignored -> ConcurrentHashMap.newKeySet())
                .add(membership);
        redisTemplate.opsForZSet().add(
                key(roomId), member(userId, sessionId), Instant.now().toEpochMilli());
        broadcast(roomId);
    }

    public void leave(Long roomId, Long userId, String sessionId) {
        redisTemplate.opsForZSet().remove(key(roomId), member(userId, sessionId));
        localSessions.computeIfPresent(sessionId, (ignored, memberships) -> {
            memberships.remove(new Membership(roomId, userId));
            return memberships.isEmpty() ? null : memberships;
        });
        broadcast(roomId);
    }

    public void disconnect(String sessionId) {
        Set<Membership> memberships = localSessions.remove(sessionId);
        if (memberships == null) {
            return;
        }
        memberships.forEach(value -> {
            redisTemplate.opsForZSet().remove(
                    key(value.roomId()), member(value.userId(), sessionId));
            broadcast(value.roomId());
        });
    }

    private void broadcast(Long roomId) {
        long cutoff = Instant.now().minus(TIMEOUT).toEpochMilli();
        redisTemplate.opsForZSet().removeRangeByScore(key(roomId), 0, cutoff);
        Set<String> active = redisTemplate.opsForZSet()
                .rangeByScore(key(roomId), cutoff, Double.POSITIVE_INFINITY);
        long users = active == null ? 0 : active.stream()
                .map(value -> value.substring(0, value.indexOf(':')))
                .distinct()
                .count();
        publisher.broadcast(
                "/topic/live/" + roomId + "/presence",
                new PresenceMessage(users));
    }

    private String key(Long roomId) {
        return "live:room:" + roomId + ":sessions";
    }

    private String member(Long userId, String sessionId) {
        return userId + ":" + sessionId;
    }

    private record Membership(Long roomId, Long userId) {
    }

    public record PresenceMessage(long onlineUsers) {
    }
}
```

新建 `LivePresenceController.java`：

```java
package com.mall.realtime.live;

import com.mall.realtime.security.StompPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
@RequiredArgsConstructor
public class LivePresenceController {
    private final LivePresenceService presenceService;

    @MessageMapping("/live/{roomId}/heartbeat")
    public void heartbeat(
            @DestinationVariable Long roomId,
            @Header("simpSessionId") String sessionId,
            Principal principal) {
        StompPrincipal user = (StompPrincipal) principal;
        presenceService.heartbeat(roomId, user.userId(), sessionId);
    }

    @MessageMapping("/live/{roomId}/leave")
    public void leave(
            @DestinationVariable Long roomId,
            @Header("simpSessionId") String sessionId,
            Principal principal) {
        StompPrincipal user = (StompPrincipal) principal;
        presenceService.leave(roomId, user.userId(), sessionId);
    }
}
```

在 Day31 的 `PresenceEventListener.onDisconnected` 中额外调用
`livePresenceService.disconnect(event.getSessionId())`。前端进入房间后立即发送一次 heartbeat，
之后每 20 秒发送；实例崩溃时虽然收不到 disconnect，但 45 秒后旧 ZSet 成员不再计数。
同一用户多设备只算 1 人，这是本项目明确采用的产品口径。

## 八、Gateway 与验收

```yaml
- id: mall-live-api
  uri: lb://mall-live
  predicates:
    - Path=/api/live/**
```

验收顺序：

1. 学生 token 调创建/开始接口返回 403。
2. 讲师只能操作自己的房间，重复 start/end 不成功。
3. OBS 使用返回的短时 pushUrl 能推流，过期或篡改 token 被拒绝。
4. VLC/HLS.js 能播放 pullUrl。
5. 两个用户 join 后在线人数为 2，异常断开后 TTL 到期能回落。

::: tip 💡 面试题：为什么推流地址不能永久有效？
**一句话**：永久地址一旦泄漏，攻击者可以冒充讲师推流；短时 HMAC publish token 把 streamName 与过期时间绑定，流媒体服务器在 on_publish 时校验，泄漏窗口有限且可轮换密钥。
:::

## 九、知识点索引

| 知识点 | 本日实现 |
|---|---|
| RTMP/HLS | OBS 推流、SRS 转 HLS |
| 职责拆分 | Java 管业务，SRS 管媒体字节 |
| 状态机 | 条件 UPDATE 防重复迁移 |
| 双层授权 | `@PreAuthorize` + teacherId 所有权 |
| 在线 Presence | Redis + WebSocket + TTL |

## 十、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] SRS RTMP 推流与 HLS 拉流跑通：是 / 否
- [ ] 短时推流 token 过期/篡改会失败：是 / 否
- [ ] 重复状态迁移被拒绝：是 / 否
- [ ] 在线人数能处理异常断开：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：

## 十一、我下次会追问的问题

1. Java 服务为什么不直接接收 RTMP 视频字节？
2. “调用开始接口”和“真正开始推流”为什么是两个状态？
3. `@PreAuthorize` 通过后为什么还要校验 teacherId？
4. Redis Set 在线人数为什么会出现幽灵用户？
5. RTMP、HLS、WebRTC 在延迟和兼容性上怎么选？
