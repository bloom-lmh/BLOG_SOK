# Day 36 · 直播互动（弹幕 + 礼物 + 回放）

> **今天目标**：在 Day35 直播房间的基础上，用 WebSocket 实现弹幕和礼物功能，并生成直播回放。

## 一、前置条件

- 已完成 Day 35（直播房间能跑通）

## 二、步骤

### 步骤 1：弹幕——WebSocket 广播

弹幕本质是直播间内的实时聊天，每个进入直播间的用户订阅该房间的弹幕频道。

`com/mall/user/websocket/DanmakuController.java`：

```java
@Controller
@RequiredArgsConstructor
public class DanmakuController {

    private final SimpMessagingTemplate messagingTemplate;
    private final LiveOnlineCounter liveOnlineCounter;

    // 发送弹幕
    @MessageMapping("/danmaku/{roomId}")
    @SendTo("/topic/danmaku/{roomId}")
    public DanmakuMessage sendDanmaku(@DestinationVariable Long roomId, DanmakuMessage msg) {
        msg.setTimestamp(System.currentTimeMillis());
        return msg;
    }
}
```

`com/mall/user/websocket/DanmakuMessage.java`：

```java
@Data
public class DanmakuMessage {
    private Long userId;
    private String username;
    private String content;
    private String color;       // 弹幕颜色
    private Integer position;   // 弹幕位置（顶部/滚动/底部）
    private Long timestamp;
}
```

### 步骤 2：礼物系统

`com/mall/user/entity/Gift.java`：

```java
@Data
@TableName("gift")
public class Gift {
    private Long id;
    private String name;
    private String icon;
    private BigDecimal price;   // 礼物价格（虚拟币或真实金额）
}
```

`com/mall/user/controller/GiftController.java`：

```java
@RestController
@RequestMapping("/api/gift")
@RequiredArgsConstructor
public class GiftController {

    private final GiftService giftService;
    private final SimpMessagingTemplate messagingTemplate;

    @PostMapping("/send")
    public Result<Void> sendGift(@RequestBody SendGiftDTO dto) {
        // 1. 扣费/扣虚拟币
        giftService.sendGift(dto.getUserId(), dto.getRoomId(), dto.getGiftId());
        // 2. 广播礼物消息（带特效展示）
        GiftMessage giftMsg = new GiftMessage(dto.getUserId(), dto.getGiftId(),
            dto.getGiftName(), dto.getCount());
        messagingTemplate.convertAndSend("/topic/gift/" + dto.getRoomId(), giftMsg);
        return Result.ok();
    }
}
```

### 步骤 3：直播回放

直播结束后，把推流时录制的视频转成回放：

```java
public void endLive(Long roomId) {
    LiveRoom room = liveRoomMapper.selectById(roomId);
    room.setStatus(2); // 已结束
    room.setEndTime(LocalDateTime.now());

    // 生成回放（如果流媒体服务器配置了录制）
    String replayUrl = String.format("https://live.course-mall.com/replay/%d.m3u8", roomId);
    room.setReplayUrl(replayUrl);

    liveRoomMapper.updateById(room);

    // 通知所有在直播间的人直播已结束
    messagingTemplate.convertAndSend("/topic/live/" + roomId + "/status",
        Map.of("status", "ended", "replayUrl", replayUrl));
}
```

### 步骤 4：弹幕持久化

弹幕不只是实时推送，也需要存下来供回放时加载：

```sql
CREATE TABLE `danmaku` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT,
    `room_id`     BIGINT       NOT NULL,
    `user_id`     BIGINT       NOT NULL,
    `content`     VARCHAR(200) NOT NULL,
    `color`       VARCHAR(20)  DEFAULT '#ffffff',
    `position`    TINYINT      DEFAULT 0 COMMENT '0滚动 1顶部 2底部',
    `video_time`  INT          DEFAULT 0  COMMENT '弹幕在视频中的时间点（秒），回放用',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_room_id` (`room_id`),
    KEY `idx_room_time` (`room_id`, `video_time`)  -- 回放时按时间点加载弹幕
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='弹幕表';
```

回放时加载弹幕：

```java
// 回放页面根据播放进度加载对应时间点的弹幕
@GetMapping("/api/danmaku/{roomId}")
public Result<List<DanmakuMessage>> getDanmaku(
        @PathVariable Long roomId,
        @RequestParam int startTime,
        @RequestParam int endTime) {
    return Result.ok(danmakuService.listByTimeRange(roomId, startTime, endTime));
}
```

::: tip 💡 面试题：弹幕系统在高并发下怎么设计？
**一句话**：① 弹幕写入先放 MQ 削峰，异步批量写入 DB；② 弹幕读取用 Redis 缓存最近 N 条；③ 回放时按视频时间点分段加载，不是全量拉取；④ 敏感词过滤在服务端做，不在客户端。
:::

## 三、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 弹幕发送和广播正常：是 / 否
- [ ] 礼物发送和广播正常：是 / 否
- [ ] 直播结束后生成回放：是 / 否
- [ ] 回放时弹幕按时间点加载：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：