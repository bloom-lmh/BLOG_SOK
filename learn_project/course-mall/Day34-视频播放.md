# Day 34 · 视频播放（HLS 切片 + 播放器 + 防盗链）

> **今天目标**：把 Day33 上传的视频播放起来，实现 HLS 流式播放、播放进度记录、防盗链签名 URL。

## 一、前置条件

- 已完成 Day 33（视频上传，已有视频文件 URL）

## 二、核心概念

### HLS 是什么

全称 HTTP Live Streaming（Apple 提出），把一个大视频切成多个 `.ts` 小片段（每段几秒），用一个 `.m3u8` 索引文件串联。播放器按顺序下载和播放片段。

```
course-intro.mp4  (1GB 原始视频)
    │
    ▼ FFmpeg 切片
course-intro/
    ├── index.m3u8          ← 索引文件，记录所有片段的顺序和时长
    ├── segment-0.ts        ← 第 0 段（0-10 秒）
    ├── segment-1.ts        ← 第 1 段（10-20 秒）
    ├── segment-2.ts
    └── ...
```

**好处：** ① 不用等整个文件下载完就能开始播放；② 自适应码率（根据网速切换清晰度）；③ 拖动进度条直接跳到对应片段。

### 三种播放方式对比

| 方式 | 原理 | 适用场景 |
|---|---|---|
| 直接播放 MP4 | 前端 `<video>` 标签直链 | 短视频 |
| HLS 切片 | FFmpeg 切 ts + m3u8，播放器按序加载 | 长视频、课程视频 |
| 防盗链 + 签名 URL | URL 带 token + 过期时间，后端校验 | 付费课程 |

## 三、步骤

### 步骤 1：视频转码切片（用 FFmpeg）

```bash
# 安装 FFmpeg（https://ffmpeg.org/download.html）
# 切片命令：每段 10 秒，生成 m3u8 + ts 文件
ffmpeg -i input.mp4 \
  -c:v libx264 -c:a aac \
  -hls_time 10 \
  -hls_list_size 0 \
  -hls_segment_filename "course_%03d.ts" \
  output.m3u8
```

### 步骤 2：防盗链签名 URL

`com/mall/user/util/VideoSignUtil.java`：

```java
public class VideoSignUtil {
    private static final String SECRET_KEY = "course-mall-secret";
    private static final long EXPIRE_SECONDS = 7200; // 2 小时过期

    public static String generateSignedUrl(String videoUrl, Long userId) {
        long expireTime = System.currentTimeMillis() / 1000 + EXPIRE_SECONDS;
        // 签名 = MD5(videoUrl + userId + expireTime + secretKey)
        String sign = DigestUtils.md5Hex(videoUrl + userId + expireTime + SECRET_KEY);
        return String.format("%s?userId=%d&expire=%d&sign=%s", videoUrl, userId, expireTime, sign);
    }

    public static boolean verifySignedUrl(String videoUrl, Long userId, long expire, String sign) {
        if (System.currentTimeMillis() / 1000 > expire) {
            return false; // 链接已过期
        }
        String expectedSign = DigestUtils.md5Hex(videoUrl + userId + expire + SECRET_KEY);
        return expectedSign.equals(sign);
    }
}
```

### 步骤 3：播放进度记录

`com/mall/user/entity/PlayRecord.java`：

```java
@Data
@TableName("play_record")
public class PlayRecord {
    private Long id;
    private Long userId;
    private Long lessonId;
    private Integer currentTime;  // 当前播放到的秒数
    private Integer totalTime;    // 视频总时长
    private LocalDateTime updateTime;
}
```

```sql
CREATE TABLE `play_record` (
    `id`           BIGINT  NOT NULL AUTO_INCREMENT,
    `user_id`      BIGINT  NOT NULL,
    `lesson_id`    BIGINT  NOT NULL,
    `current_time` INT     NOT NULL DEFAULT 0 COMMENT '播放进度（秒）',
    `total_time`   INT     NOT NULL DEFAULT 0 COMMENT '视频总时长（秒）',
    `update_time`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_lesson` (`user_id`, `lesson_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='播放记录表';
```

`com/mall/user/controller/PlayRecordController.java`：

```java
@RestController
@RequestMapping("/api/play-record")
@RequiredArgsConstructor
public class PlayRecordController {

    private final PlayRecordService playRecordService;

    // 前端每 30 秒上报一次播放进度
    @PostMapping("/report")
    public Result<Void> report(@RequestBody PlayRecordDTO dto) {
        playRecordService.saveOrUpdate(dto.getUserId(), dto.getLessonId(), dto.getCurrentTime());
        return Result.ok();
    }

    // 获取上次播放进度（断点续播）
    @GetMapping("/{lessonId}")
    public Result<Integer> getProgress(@PathVariable Long lessonId) {
        Long userId = UserContext.getUserId();
        return Result.ok(playRecordService.getCurrentTime(userId, lessonId));
    }
}
```

::: tip 💡 面试题：HLS 和 MP4 直接播放有什么区别？
**一句话**：MP4 是完整文件，必须下载到足够数据才能开始播；HLS 把视频切成小片段，播放器按序加载，边下边播，延迟低、拖动快。但 HLS 需要额外转码，直播场景延迟比 RTMP 高几秒。
:::

::: tip 💡 面试题：防盗链怎么实现？
**一句话**：URL 带签名参数（MD5(资源路径 + 用户ID + 过期时间 + 密钥)），后端在 Nginx 或应用层校验签名和过期时间，不合法则拒绝访问。CDN 层面也可以配 Referer 白名单 + 时间戳鉴权。
:::

## 四、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] FFmpeg 切片成功，HLS 能播放：是 / 否
- [ ] 防盗链签名 URL 校验通过：是 / 否
- [ ] 播放进度记录和恢复：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：