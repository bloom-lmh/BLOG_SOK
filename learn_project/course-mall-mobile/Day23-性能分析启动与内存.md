# Day 23 · Flutter 性能分析、列表优化与内存治理

> **今天目标**：建立“先测量、再定位、后优化”的性能方法。会使用 profile 模式和 DevTools，给首屏、滚动、图片、内存设预算。

## 一、性能目标

建议项目验收线，需在指定中端真机上测：

| 指标 | 目标示例 |
| --- | --- |
| 冷启动到可交互 | P75 < 2.5s |
| 页面打开 | P75 < 800ms（不含不可控网络） |
| 60Hz 帧预算 | UI/Raster 各尽量 < 16.7ms |
| 120Hz 帧预算 | 各尽量 < 8.3ms |
| 崩溃自由会话 | > 99.5% |
| 图片列表 | 连续滚动无明显掉帧或内存暴涨 |

不要在简历写没有测量环境的“提升 80%”。记录设备、构建模式、样本量和前后数据。

## 二、必须在 profile/release 测

```bash
flutter run --profile -t lib/main_prod.dart
flutter devtools
flutter build apk --profile
```

Debug 模式包含断言、调试服务和不同编译策略，不能代表用户性能。Release 接近生产，但 Profile 更便于时间线分析。

DevTools 重点：

- Performance：UI/Raster 帧、事件时间线；
- CPU Profiler：Dart 热点；
- Memory：堆增长、对象快照、泄漏；
- Network：请求瀑布和 payload；
- Widget Inspector：重建与布局；
- App Size：包体组成。

::: tip 💡 面试题：UI 线程快，页面为什么仍可能掉帧？
Raster 线程的图片解码、阴影、裁剪或复杂绘制也可能超预算；要分别看 UI 和 Raster 时间线。
:::

## 三、控制 Widget 重建范围

原则：

- 能 `const` 就 const；
- 状态尽量靠近使用处；
- Riverpod 用小 Provider 或 `select` 限定变化；
- 不在 build 中创建网络请求、Controller 或昂贵对象；
- 不为“感觉快”到处加 memo，先看重建统计。

```dart
class CartBadge extends ConsumerWidget {
  const CartBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final count = ref.watch(
      cartProvider.select((state) => state.totalCount),
    );
    return Badge(
      isLabelVisible: count > 0,
      label: Text('$count'),
      child: const Icon(Icons.shopping_cart_outlined),
    );
  }
}
```

这样购物车其他字段改变而数量不变时，Badge 不重建。

## 四、长列表

使用懒构建：

```dart
ListView.builder(
  itemCount: courses.length,
  itemExtent: 112, // 仅在每项确实固定高度时设置
  itemBuilder: (_, index) => CourseRow(
    key: ValueKey(courses[index].id),
    course: courses[index],
  ),
);
```

要点：

- 禁止 `SingleChildScrollView + Column` 渲染几百项；
- 固定高度可用 itemExtent/prototypeItem 减少布局计算；
- Grid/List 嵌套时使用统一 Sliver；
- `shrinkWrap: true` 会让列表测量更多内容，谨慎使用；
- cacheExtent 不是越大越好，会换取更多内存；
- 分页追加避免复制超大列表的无谓次数；
- 图片按显示尺寸解码。

## 五、图片性能

```dart
CachedNetworkImage(
  imageUrl: thumbnailUrl,
  memCacheWidth: 480,
  maxWidthDiskCache: 960,
  fit: BoxFit.cover,
);
```

优化顺序：

1. CDN 返回正确尺寸和现代格式；
2. 明确布局尺寸，避免跳动；
3. 限制内存解码尺寸；
4. 占位图轻量；
5. 预加载只用于即将出现的关键图；
6. 观察 ImageCache 和内存，而不是无限提高缓存。

一张 2000×2000 RGBA 图片解码后约占 16MB，即使压缩文件只有几百 KB。

## 六、JSON 与 CPU 密集任务

小 JSON 直接解析更快；只有实测大 payload 阻塞主 isolate 时再放到 isolate：

```dart
List<CourseSummaryDto> parseCourses(String raw) {
  final list = jsonDecode(raw) as List<dynamic>;
  return list
      .map(
        (item) => CourseSummaryDto.fromJson(
          item as Map<String, dynamic>,
        ),
      )
      .toList(growable: false);
}

final courses = await Isolate.run(() => parseCourses(rawJson));
```

跨 isolate 传输和启动也有成本。更优先让后端分页并减少字段，不要下载 10MB JSON 后再“优化解析”。

## 七、启动优化

启动阶段只做阻塞首屏的工作：

- 读取必要环境；
- 初始化会话最小状态；
- 初始化路由和错误捕获。

延后：

- 非关键埋点；
- 全量数据库清理；
- 推送 Token 同步；
- 首页之外的资源预热；
- 大型 SDK。

```dart
Future<void> bootstrapApp() async {
  final stopwatch = Stopwatch()..start();
  await initializeCriticalDependencies();
  logStartupStage('critical_ready', stopwatch.elapsed);

  runApp(const CourseMallApp());
  unawaited(initializeNonCriticalDependencies());
}
```

延迟初始化也要捕获错误，不能变成无人处理的 Future。

## 八、网络性能

- 首页聚合减少串行瀑布；
- 无依赖请求并行 `Future.wait`；
- 接口分页和字段裁剪；
- ETag/If-None-Match 或合理缓存头；
- gzip/brotli 由网关协商；
- 搜索取消旧请求；
- 请求去重；
- 避免 App 启动同时刷新所有缓存。

并行不是越多越好。限制并发，避免低端机和弱网连接拥塞。

## 九、内存与资源泄漏

重点检查：

- TextEditingController、AnimationController；
- ScrollController、VideoPlayerController；
- Timer、StreamSubscription；
- WidgetsBindingObserver；
- WebSocket 订阅；
- 大图、WebView、PlatformView；
- Provider 中永不释放的缓存。

验证流程：

1. 进入/退出播放器 20 次；
2. Memory 页做 GC 和快照；
3. 比较对象数量是否持续增长；
4. 查看 Controller、Texture、Image 对象；
5. 修复后重复。

## 十、绘制优化

- 减少大面积半透明叠层和过度模糊；
- 谨慎使用 `saveLayer`、复杂 Clip 和多重阴影；
- 静态复杂绘制可评估 RepaintBoundary；
- RepaintBoundary 也会增加图层和内存，实测后使用；
- 使用 Flutter 当前默认渲染后端并在目标机验证 shader/jank。

## 十一、性能报告模板

```text
场景：课程列表连续滚动 60 秒
设备：Android 中端机 / 系统版本
构建：profile, Flutter x.y.z
问题：Raster P95 24ms，内存峰值 420MB
定位：列表加载原始 2K 封面
改动：CDN 480px 缩略图 + memCacheWidth
结果：Raster P95 11ms，内存峰值 230MB
证据：DevTools trace / commit / 测试日期
```

这类证据比背诵“const 能优化性能”更有面试价值。

## 十二、知识点索引

- Debug/Profile/Release。
- UI/Raster 线程与帧预算。
- Widget rebuild、layout、paint。
- Isolate 和消息传输成本。
- 图片解码内存、资源泄漏、启动链路。

## 十三、完成清单

- [ ] 在真机 profile 模式采集时间线
- [ ] 列表无一次构建全部项
- [ ] 图片使用缩略图和解码尺寸
- [ ] 播放器反复进出无持续泄漏
- [ ] 有一份包含前后数据的性能报告

## 十四、明天我会问你

1. 为什么不能用 Debug 模式判断生产性能？
2. 图片文件很小为什么解码后仍可能占大量内存？
3. Isolate 为什么不是所有 JSON 解析都该使用？
