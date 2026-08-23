# Day 09 · 首页、分类树与课程无限分页

> **今天目标**：实现真实课程流，而不是写死卡片。覆盖首页聚合、分类筛选、分页追加、下拉刷新、图片缓存和六种列表状态。

## 一、依赖和接口

```bash
flutter pub add cached_network_image
```

使用：

- `GET /api/category/tree`：课程分类树；
- `GET /api/course/page?current=1&size=20&categoryId=...`：课程分页；
- 推荐补充 `GET /api/mobile/home`：轮播、推荐分类、热门课程的一次聚合接口。

首页可以用聚合接口减少瀑布请求，但课程列表仍保留独立分页接口。不要为了“一个接口”把所有不相关数据永久绑定。

## 二、分类树不要假设只有一层

```dart
class CourseCategory {
  const CourseCategory({
    required this.id,
    required this.name,
    this.children = const [],
  });

  final int id;
  final String name;
  final List<CourseCategory> children;
}

final categoryTreeProvider =
    FutureProvider.autoDispose<List<CourseCategory>>((ref) {
  return ref.watch(categoryRepositoryProvider).fetchTree();
});
```

当前 UI 即使只展示一级分类，模型也保留 children。服务端分类树需要保证无环，并限定最大深度。

## 三、分页状态必须区分首次和追加

`lib/features/course/presentation/course_feed_state.dart`：

```dart
class CourseFeedState {
  const CourseFeedState({
    required this.items,
    required this.page,
    required this.totalPages,
    this.categoryId,
    this.isLoadingMore = false,
    this.loadMoreError,
  });

  final List<Course> items;
  final int page;
  final int totalPages;
  final int? categoryId;
  final bool isLoadingMore;
  final String? loadMoreError;

  bool get hasMore => page < totalPages;

  CourseFeedState copyWith({
    List<Course>? items,
    int? page,
    int? totalPages,
    int? categoryId,
    bool clearCategory = false,
    bool? isLoadingMore,
    String? loadMoreError,
    bool clearLoadMoreError = false,
  }) {
    return CourseFeedState(
      items: items ?? this.items,
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
      categoryId:
          clearCategory ? null : (categoryId ?? this.categoryId),
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      loadMoreError:
          clearLoadMoreError ? null : (loadMoreError ?? this.loadMoreError),
    );
  }
}
```

## 四、无限分页 Controller

`lib/features/course/presentation/course_feed_controller.dart`：

```dart
class CourseFeedController extends AsyncNotifier<CourseFeedState> {
  static const _pageSize = 20;

  @override
  Future<CourseFeedState> build() => _firstPage(categoryId: null);

  Future<CourseFeedState> _firstPage({required int? categoryId}) async {
    final page = await ref.read(courseRepositoryProvider).fetchPage(
          page: 1,
          pageSize: _pageSize,
          categoryId: categoryId,
        );
    return CourseFeedState(
      items: page.items,
      page: page.page,
      totalPages: page.totalPages,
      categoryId: categoryId,
    );
  }

  Future<void> selectCategory(int? categoryId) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => _firstPage(categoryId: categoryId),
    );
  }

  Future<void> refresh() async {
    final current = state.asData?.value;
    state = await AsyncValue.guard(
      () => _firstPage(categoryId: current?.categoryId),
    );
  }

  Future<void> loadMore() async {
    final current = state.asData?.value;
    if (current == null ||
        current.isLoadingMore ||
        !current.hasMore) {
      return;
    }

    state = AsyncData(
      current.copyWith(
        isLoadingMore: true,
        clearLoadMoreError: true,
      ),
    );

    try {
      final next = await ref.read(courseRepositoryProvider).fetchPage(
            page: current.page + 1,
            pageSize: _pageSize,
            categoryId: current.categoryId,
          );

      // 服务端数据变化时页码分页可能重复，按 ID 去重。
      final merged = <int, Course>{
        for (final course in current.items) course.id: course,
        for (final course in next.items) course.id: course,
      }.values.toList(growable: false);

      state = AsyncData(
        current.copyWith(
          items: merged,
          page: next.page,
          totalPages: next.totalPages,
          isLoadingMore: false,
          clearLoadMoreError: true,
        ),
      );
    } catch (error) {
      state = AsyncData(
        current.copyWith(
          isLoadingMore: false,
          loadMoreError: userMessage(error),
        ),
      );
    }
  }
}

final courseFeedProvider =
    AsyncNotifierProvider<CourseFeedController, CourseFeedState>(
  CourseFeedController.new,
);
```

追加失败时保留已经加载的列表，只在底部显示“重试”；首次加载失败才整页错误。用户不应因为第 3 页失败而失去前 2 页。

::: tip 💡 面试题：页码分页为什么可能重复或漏数据？
翻页期间如果服务端有新数据插入或排序字段变化，后续页的偏移会移动。高频动态流更适合基于稳定排序键的游标分页。
:::

## 五、课程卡片和图片缓存

```dart
class CourseCard extends StatelessWidget {
  const CourseCard({required this.course, super.key});

  final Course course;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: '课程：${course.title}，价格 ${course.priceText} 元',
      child: InkWell(
        borderRadius: AppRadius.md,
        onTap: () => context.push('/course/${course.id}'),
        child: Card(
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 16 / 9,
                child: course.coverUrl == null
                    ? const ColoredBox(color: Colors.black12)
                    : CachedNetworkImage(
                        imageUrl: course.coverUrl.toString(),
                        fit: BoxFit.cover,
                        placeholder: (_, __) =>
                            const ColoredBox(color: Colors.black12),
                        errorWidget: (_, __, ___) =>
                            const Icon(Icons.broken_image_outlined),
                      ),
              ),
              Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      course.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      '¥${course.priceText}',
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.primary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

服务端/OSS 应提供缩略图参数，列表不要下载 4K 原图。磁盘缓存能减少流量，但仍需合理 CDN Cache-Control 和尺寸变体。

## 六、列表页面

```dart
class CourseFeedPage extends ConsumerStatefulWidget {
  const CourseFeedPage({super.key});

  @override
  ConsumerState<CourseFeedPage> createState() => _CourseFeedPageState();
}

class _CourseFeedPageState extends ConsumerState<CourseFeedPage> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  void _onScroll() {
    if (_scrollController.position.extentAfter < 400) {
      ref.read(courseFeedProvider.notifier).loadMore();
    }
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final feed = ref.watch(courseFeedProvider);

    return feed.when(
      loading: () => const AppLoadingView(),
      error: (error, stack) => AppErrorView(
        message: userMessage(error),
        onRetry: () => ref.invalidate(courseFeedProvider),
      ),
      data: (value) {
        if (value.items.isEmpty) {
          return AppEmptyView(
            message: '该分类暂时没有课程',
            actionLabel: '查看全部',
            onAction: () => ref
                .read(courseFeedProvider.notifier)
                .selectCategory(null),
          );
        }

        return RefreshIndicator(
          onRefresh: ref.read(courseFeedProvider.notifier).refresh,
          child: ListView.builder(
            key: const PageStorageKey('course-feed'),
            controller: _scrollController,
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(AppSpacing.lg),
            itemCount: value.items.length + 1,
            itemBuilder: (context, index) {
              if (index == value.items.length) {
                return CourseListFooter(
                  hasMore: value.hasMore,
                  loading: value.isLoadingMore,
                  error: value.loadMoreError,
                  onRetry:
                      ref.read(courseFeedProvider.notifier).loadMore,
                );
              }
              final course = value.items[index];
              return Padding(
                key: ValueKey(course.id),
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: CourseCard(course: course),
              );
            },
          ),
        );
      },
    );
  }
}
```

`ValueKey(course.id)` 帮助 Flutter 在列表变化时识别同一条业务数据。不要使用随机 Key，也不要用变化中的 index 代表稳定身份。

## 七、六种列表状态

1. 首次加载：整页骨架或 Loading；
2. 首次失败：整页错误 + 重试；
3. 空结果：空状态；
4. 正常数据：列表；
5. 加载更多：底部 Loading；
6. 加载更多失败：保留列表 + 底部重试。

下拉刷新期间尽量保留旧数据，避免整个页面闪白。进一步优化可为 AsyncValue 增加“刷新中但有旧值”的展示。

## 八、知识点索引

- 无限滚动、下拉刷新、分页去重。
- 页码分页与游标分页。
- ListView 懒构建、Key、PageStorage。
- 图片内存/磁盘/CDN 多级缓存。
- 初始错误与追加错误的体验差异。

## 九、完成清单

- [ ] 分类树能切换课程列表
- [ ] 接近底部自动加载下一页
- [ ] 重复触发不会并发请求同一页
- [ ] 加载更多失败不清空已有课程
- [ ] 图片有占位、错误态和尺寸约束

## 十、明天我会问你

1. 初次加载失败与加载更多失败为什么要不同处理？
2. 页码分页和游标分页分别适合什么场景？
3. 列表项为什么用业务 ID 作为 Key？
