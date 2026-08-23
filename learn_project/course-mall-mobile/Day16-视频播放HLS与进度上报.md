# Day 16 · 视频播放、HLS、签名 URL 与进度上报

> **今天目标**：完成课程播放器。覆盖播放会话、断点续播、HLS、生命周期、进度节流和服务端防伪，而不是只放一个 `VideoPlayer`。

## 一、依赖

```bash
flutter pub add video_player wakelock_plus
```

`video_player` 使用 Android Media3/ExoPlayer、iOS AVPlayer 等平台实现。HLS 能否播放还取决于编码、容器、证书和 CDN 配置，必须真机验证。

## 二、播放前申请短期会话

```http
POST /api/playback/sessions
Authorization: Bearer ...

{"lessonId": 1001}
```

响应：

```json
{
  "sessionId": "ps_01...",
  "lessonId": 1001,
  "courseId": 12,
  "streamUrl": "https://cdn.example.com/signed/master.m3u8?...",
  "headers": {},
  "expiresAt": "2026-08-23T21:00:00+08:00",
  "resumePositionSeconds": 480,
  "durationSeconds": 620,
  "heartbeatIntervalSeconds": 15
}
```

服务端在创建会话时校验：

- 当前用户是否购买课程，或该课时是否可试听；
- 课程和课时是否发布；
- 并发设备/播放数量限制；
- 签名 URL 有效期和可访问资源范围。

不要在课程目录接口返回永久 OSS 地址。

## 三、播放器生命周期

```dart
class LessonPlayerPage extends ConsumerStatefulWidget {
  const LessonPlayerPage({required this.lessonId, super.key});

  final int lessonId;

  @override
  ConsumerState<LessonPlayerPage> createState() =>
      _LessonPlayerPageState();
}

class _LessonPlayerPageState extends ConsumerState<LessonPlayerPage>
    with WidgetsBindingObserver {
  VideoPlayerController? _player;
  PlaybackSession? _session;
  Timer? _reportTimer;
  bool _initializing = true;
  Object? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initialize();
  }

  Future<void> _initialize() async {
    try {
      final session = await ref
          .read(playbackRepositoryProvider)
          .createSession(widget.lessonId);

      final player = VideoPlayerController.networkUrl(
        session.streamUrl,
        httpHeaders: session.headers,
      );
      await player.initialize();

      final duration = player.value.duration;
      final resume = session.resumePosition < duration
          ? session.resumePosition
          : Duration.zero;
      await player.seekTo(resume);

      if (!mounted) {
        await player.dispose();
        return;
      }

      setState(() {
        _session = session;
        _player = player;
        _initializing = false;
      });

      _reportTimer = Timer.periodic(
        session.heartbeatInterval,
        (_) => _reportProgress(),
      );
      await player.play();
      await WakelockPlus.enable();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error;
        _initializing = false;
      });
    }
  }

  Future<void> _reportProgress() async {
    final player = _player;
    final session = _session;
    if (player == null || session == null || !player.value.isInitialized) {
      return;
    }

    await ref.read(playbackRepositoryProvider).reportProgress(
          sessionId: session.sessionId,
          lessonId: widget.lessonId,
          position: player.value.position,
          duration: player.value.duration,
          playing: player.value.isPlaying,
        );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive) {
      _player?.pause();
      unawaited(_reportProgress());
      unawaited(WakelockPlus.disable());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _reportTimer?.cancel();
    unawaited(_reportProgress());
    unawaited(_player?.dispose());
    unawaited(WakelockPlus.disable());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_initializing) return const AppLoadingView();
    if (_error != null) {
      return AppErrorView(
        message: userMessage(_error!),
        onRetry: () {
          setState(() {
            _initializing = true;
            _error = null;
          });
          _initialize();
        },
      );
    }

    final player = _player!;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Center(
          child: AspectRatio(
            aspectRatio: player.value.aspectRatio,
            child: Stack(
              alignment: Alignment.bottomCenter,
              children: [
                VideoPlayer(player),
                VideoProgressIndicator(
                  player,
                  allowScrubbing: true,
                  padding: const EdgeInsets.all(12),
                ),
                PlayerControls(controller: player),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
```

`unawaited` 需要 `dart:async`。dispose 不能变成 async，因此最后一次上报是“尽力而为”；定时上报和暂停上报保证大部分进度已经同步。

## 四、进度上报接口

已有后端接口可调整为：

```http
POST /api/play-record/report
Idempotency-Key: {sessionId}:{sequence}

{
  "sessionId": "ps_01...",
  "lessonId": 1001,
  "positionSeconds": 495,
  "durationSeconds": 620,
  "playing": true,
  "sequence": 8,
  "clientTime": "2026-08-23T20:31:00+08:00"
}
```

服务端校验：

1. session 属于当前用户和课时；
2. position 在 0 到 duration 合理范围；
3. sequence 不回退；
4. 两次上报增长不能远大于经过时间；
5. 已完成进度一般不回退；
6. 达到阈值后幂等标记完成。

客户端时间只辅助诊断，服务端以接收时间为主。

::: tip 💡 面试题：为什么不能直接相信客户端 positionSeconds？
客户端可篡改请求或倍速跳转。服务端应结合播放会话、上报间隔和单调序号限制不合理增长。
:::

## 五、节流和拖动

- 播放中每 15 秒上报一次；
- 暂停、切后台、切课时、播放完成时立即上报；
- 用户拖动只更新 position，不把跳过区间都算成有效观看时长；
- 连续拖动过程中不要每一帧发请求；
- 上报失败进入 Day 19 的离线队列。

播放器 UI 可以显示观看位置，但“有效学习时长”由服务端算法计算。

## 六、签名 URL 过期

HLS 主清单和分片可能在播放中跨过有效期。方案：

- 签名有效期覆盖正常课程时长并留余量；
- CDN 使用 Cookie/Header 鉴权；
- 播放器遇 401/403 时重新申请会话并 seek 回原位置；
- 新会话仍需服务端鉴权。

不要把长期 JWT 放在 URL Query 中，URL 容易进入 CDN、代理和崩溃日志。

## 七、清晰度、倍速、字幕

生产播放器常见能力：

- HLS 自适应码率；
- 0.75x–2.0x 倍速；
- 字幕和多音轨；
- 全屏与横竖屏切换；
- 后台音频策略；
- Picture in Picture；
- 播放错误码和网络重试。

`video_player` 提供基础能力，自定义控制条或选用成熟播放器封装。每增加一个插件都要评估维护活跃度、原生 SDK、License 和包体。

## 八、DRM 和防录屏边界

短期签名 URL 只能控制访问窗口，不能等于 DRM。高价值版权内容可能需要 Widevine/FairPlay 及原生播放器集成。

禁止截图/录屏也不是绝对保护：

- Android 可使用安全窗口标志；
- iOS 能检测屏幕捕获并遮挡；
- 外部摄像机无法阻止。

项目面试中要诚实描述威胁模型，不声称“完全防盗录”。

## 九、知识点索引

- HLS、自适应码率、平台播放器。
- 短期签名 URL 与播放会话。
- AppLifecycleState、资源释放、Wakelock。
- Throttle、单调序号、离线补报。
- DRM 与防录屏边界。

## 十、完成清单

- [ ] 播放前服务端校验权益
- [ ] 能从上次位置续播
- [ ] 每 15 秒及暂停时上报
- [ ] 页面销毁时释放 Timer 和播放器
- [ ] 日志不包含签名 URL 和 Token

## 十一、明天我会问你

1. 为什么目录接口不返回永久视频地址？
2. 最后一次 dispose 上报为什么不能作为唯一保障？
3. 签名 URL 与 DRM 的区别是什么？
