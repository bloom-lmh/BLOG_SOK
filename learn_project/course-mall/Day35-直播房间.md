# Day 35 · 直播房间（推流 + 拉流 + 在线人数）

> **今天目标**：实现直播房间的创建/关闭、推流地址生成和拉流播放，结合 WebSocket 统计实时在线人数。

## 一、前置条件

- 已完成 Day 31–32（WebSocket）
- 了解推流/拉流基本概念（RTMP/HLS）

## 二、核心概念

### 直播架构

```
讲师端（推流）              服务器（流媒体）              学生端（拉流）
    │                           │                           │
    │  RTMP 推流                │                           │
    ├──────────────────────►    │                           │
    │  OBS / FFmpeg             │  Nginx-RTMP 模块          │
    │                           │  或 SRS / 云直播服务       │
    │                           │                           │
    │                           │   HLS / FLV 拉流  ◄───────┤
    │                           │                           视频播放器
```

### 三个核心概念

| 概念 | 协议 | 说明 |
|---|---|---|
| **推流** | RTMP | 讲师端把视频流推到服务器 |
| **拉流** | HLS / FLV | 学生端从服务器拉视频流播放 |
| **转码** | 服务端 | 把一路 RTMP 流转成多路 HLS/FLV，适配不同终端 |

### 推流/拉流 URL 格式

```
推流地址：rtmp://live.course-mall.com/live/{roomId}
拉流地址：https://live.course-mall.com/hls/{roomId}.m3u8
```

## 三、步骤

### 步骤 1：直播房间表

```sql
CREATE TABLE `live_room` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `teacher_id`  BIGINT       NOT NULL                COMMENT '讲师ID',
    `course_id`   BIGINT       DEFAULT NULL            COMMENT '关联课程（可选）',
    `title`       VARCHAR(100) NOT NULL                COMMENT '直播标题',
    `push_url`    VARCHAR(255) DEFAULT NULL            COMMENT '推流地址',
    `pull_url`    VARCHAR(255) DEFAULT NULL            COMMENT '拉流地址（学生观看）',
    `status`      TINYINT      NOT NULL DEFAULT 0      COMMENT '0未开始 1直播中 2已结束',
    `start_time`  DATETIME     DEFAULT NULL            COMMENT '开始时间',
    `end_time`    DATETIME     DEFAULT NULL            COMMENT '结束时间',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_teacher_id` (`teacher_id`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='直播房间表';
```

### 步骤 2：直播房间 Controller

`com/mall/user/controller/LiveRoomController.java`：

```java
@RestController
@RequestMapping("/api/live")
@RequiredArgsConstructor
public class LiveRoomController {

    private final LiveRoomService liveRoomService;

    // 讲师创建直播间
    @PostMapping("/room")
    public Result<LiveRoom> createRoom(@RequestBody CreateLiveRoomDTO dto) {
        return Result.ok(liveRoomService.createRoom(dto));
    }

    // 讲师开始直播（生成推流地址）
    @PostMapping("/room/{roomId}/start")
    public Result<LiveRoom> startLive(@PathVariable Long roomId) {
        return Result.ok(liveRoomService.startLive(roomId));
    }

    // 结束直播
    @PostMapping("/room/{roomId}/end")
    public Result<Void> endLive(@PathVariable Long roomId) {
        liveRoomService.endLive(roomId);
        return Result.ok();
    }

    // 学生获取直播间列表（进行中的）
    @GetMapping("/rooms")
    public Result<List<LiveRoom>> listLiving() {
        return Result.ok(liveRoomService.listLiving());
    }

    // 学生进入直播间，获取拉流地址
    @GetMapping("/room/{roomId}")
    public Result<LiveRoomVO> enterRoom(@PathVariable Long roomId) {
        return Result.ok(liveRoomService.enterRoom(roomId));
    }
}
```

### 步骤 3：核心逻辑

`com/mall/user/service/LiveRoomService.java`：

```java
@Service
@RequiredArgsConstructor
public class LiveRoomService {

    private static final String LIVE_DOMAIN = "live.course-mall.com";

    public LiveRoom startLive(Long roomId) {
        LiveRoom room = liveRoomMapper.selectById(roomId);
        // 生成推流地址
        String pushUrl = String.format("rtmp://%s/live/%d", LIVE_DOMAIN, roomId);
        // 生成拉流地址（HLS）
        String pullUrl = String.format("https://%s/hls/%d.m3u8", LIVE_DOMAIN, roomId);

        room.setPushUrl(pushUrl);
        room.setPullUrl(pullUrl);
        room.setStatus(1);  // 直播中
        room.setStartTime(LocalDateTime.now());
        liveRoomMapper.updateById(room);
        return room;
    }

    public LiveRoomVO enterRoom(Long roomId) {
        LiveRoom room = liveRoomMapper.selectById(roomId);
        if (room.getStatus() != 1) {
            throw new BizException(400, "直播未开始或已结束");
        }
        LiveRoomVO vo = BeanUtil.copyProperties(room, LiveRoomVO.class);
        // 拉流地址加防盗链签名
        vo.setPullUrl(VideoSignUtil.generateSignedUrl(room.getPullUrl(), UserContext.getUserId()));
        return vo;
    }
}
```

### 步骤 4：直播在线人数（WebSocket + Redis）

直播间的在线人数用 WebSocket 实时推送，Redis 记录每个房间的在线用户数：

```java
@Component
public class LiveOnlineCounter {

    private final StringRedisTemplate stringRedisTemplate;

    // 用户进入直播间
    public void enter(Long roomId, Long userId) {
        stringRedisTemplate.opsForSet().add("live:room:" + roomId + ":users", String.valueOf(userId));
    }

    // 用户离开直播间
    public void leave(Long roomId, Long userId) {
        stringRedisTemplate.opsForSet().remove("live:room:" + roomId + ":users", String.valueOf(userId));
    }

    // 获取在线人数
    public long getCount(Long roomId) {
        Long count = stringRedisTemplate.opsForSet().size("live:room:" + roomId + ":users");
        return count != null ? count : 0;
    }
}
```

::: tip 💡 面试题：直播推流和拉流用的什么协议？有什么区别？
**一句话**：推流用 RTMP（Real-Time Messaging Protocol，TCP 长连接，延迟低 1-3 秒），拉流用 HLS（HTTP 切片，延迟高 10-30 秒但兼容性好，CDN 加速方便）或 HTTP-FLV（延迟低 1-3 秒，适合低延迟场景）。
:::

## 四、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 直播房间创建/开始/结束流程正常：是 / 否
- [ ] 推流地址和拉流地址生成正确：是 / 否
- [ ] 直播在线人数实时更新：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：