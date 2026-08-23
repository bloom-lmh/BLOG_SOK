# Day 10 · 搜索、筛选、Debounce 与请求竞态

> **今天目标**：完成关键词搜索、分类/价格/排序筛选和分页。重点不是输入框，而是处理防抖、旧请求覆盖、取消、缓存键和空结果。

## 一、后端接口建议

推荐：

```http
GET /api/search/course
  ?keyword=Spring
  &categoryId=12
  &minPrice=0
  &maxPrice=19900
  &sort=relevance
  &current=1
  &size=20
```

价格使用“分”为单位整数。`sort` 使用白名单：

- `relevance`：相关度；
- `newest`：发布时间；
- `sales`：销量；
- `priceAsc/priceDesc`：价格。

如果后端尚无搜索接口，可先基于数据库实现，再接入 Elasticsearch。移动端契约保持不变，由后端决定数据源。

## 二、搜索状态

```dart
enum CourseSort { relevance, newest, sales, priceAsc, priceDesc }
enum SearchPhase { idle, loading, success, failure }

class CourseSearchState {
  const CourseSearchState({
    this.keyword = '',
    this.categoryId,
    this.minPriceInCents,
    this.maxPriceInCents,
    this.sort = CourseSort.relevance,
    this.items = const [],
    this.page = 0,
    this.totalPages = 0,
    this.phase = SearchPhase.idle,
    this.isLoadingMore = false,
    this.errorMessage,
  });

  final String keyword;
  final int? categoryId;
  final int? minPriceInCents;
  final int? maxPriceInCents;
  final CourseSort sort;
  final List<Course> items;
  final int page;
  final int totalPages;
  final SearchPhase phase;
  final bool isLoadingMore;
  final String? errorMessage;

  bool get hasMore => page < totalPages;

  CourseSearchState copyWith({
    String? keyword,
    int? categoryId,
    bool clearCategory = false,
    int? minPriceInCents,
    int? maxPriceInCents,
    CourseSort? sort,
    List<Course>? items,
    int? page,
    int? totalPages,
    SearchPhase? phase,
    bool? isLoadingMore,
    String? errorMessage,
    bool clearError = false,
  }) {
    return CourseSearchState(
      keyword: keyword ?? this.keyword,
      categoryId:
          clearCategory ? null : (categoryId ?? this.categoryId),
      minPriceInCents: minPriceInCents ?? this.minPriceInCents,
      maxPriceInCents: maxPriceInCents ?? this.maxPriceInCents,
      sort: sort ?? this.sort,
      items: items ?? this.items,
      page: page ?? this.page,
      totalPages: totalPages ?? this.totalPages,
      phase: phase ?? this.phase,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}
```

生产代码可进一步用 Freezed 生成 `copyWith/==`。这里手写是为了先理解状态模型。

## 三、Repository 支持取消

```dart
abstract interface class CourseSearchRepository {
  Future<CoursePage> search({
    required String keyword,
    required int page,
    required int pageSize,
    int? categoryId,
    int? minPriceInCents,
    int? maxPriceInCents,
    required CourseSort sort,
    CancelToken? cancelToken,
  });
}
```

Dio 收到 `CancelToken.cancel()` 后会结束等待。注意：客户端取消不保证服务端停止计算，因此服务端搜索仍要有超时和资源限制。

## 四、Controller：防抖 + 取消 + 版本号

`lib/features/course/presentation/course_search_controller.dart`：

```dart
import 'dart:async';

class CourseSearchController extends Notifier<CourseSearchState> {
  static const _pageSize = 20;
  Timer? _debounce;
  CancelToken? _activeRequest;
  int _requestVersion = 0;

  @override
  CourseSearchState build() {
    ref.onDispose(() {
      _debounce?.cancel();
      _activeRequest?.cancel('search disposed');
    });
    return const CourseSearchState();
  }

  void onKeywordChanged(String value) {
    state = state.copyWith(keyword: value);
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 350),
      () => search(reset: true),
    );
  }

  Future<void> updateFilters({
    int? categoryId,
    bool clearCategory = false,
    int? minPriceInCents,
    int? maxPriceInCents,
    CourseSort? sort,
  }) async {
    state = state.copyWith(
      categoryId: categoryId,
      clearCategory: clearCategory,
      minPriceInCents: minPriceInCents,
      maxPriceInCents: maxPriceInCents,
      sort: sort,
    );
    await search(reset: true);
  }

  Future<void> search({required bool reset}) async {
    final keyword = state.keyword.trim();
    if (keyword.isEmpty) {
      _activeRequest?.cancel();
      state = state.copyWith(
        items: const [],
        page: 0,
        totalPages: 0,
        phase: SearchPhase.idle,
        clearError: true,
      );
      return;
    }

    if (!reset && (state.isLoadingMore || !state.hasMore)) return;

    final version = ++_requestVersion;
    _activeRequest?.cancel('superseded by a newer search');
    final cancelToken = CancelToken();
    _activeRequest = cancelToken;

    final targetPage = reset ? 1 : state.page + 1;
    state = state.copyWith(
      phase: reset ? SearchPhase.loading : state.phase,
      isLoadingMore: !reset,
      clearError: true,
    );

    try {
      final page = await ref.read(courseSearchRepositoryProvider).search(
            keyword: keyword,
            page: targetPage,
            pageSize: _pageSize,
            categoryId: state.categoryId,
            minPriceInCents: state.minPriceInCents,
            maxPriceInCents: state.maxPriceInCents,
            sort: state.sort,
            cancelToken: cancelToken,
          );

      if (version != _requestVersion) return;

      final oldItems = reset ? const <Course>[] : state.items;
      final merged = <int, Course>{
        for (final item in oldItems) item.id: item,
        for (final item in page.items) item.id: item,
      }.values.toList(growable: false);

      state = state.copyWith(
        items: merged,
        page: page.page,
        totalPages: page.totalPages,
        phase: SearchPhase.success,
        isLoadingMore: false,
        clearError: true,
      );
    } on DioException catch (error) {
      if (CancelToken.isCancel(error)) return;
      if (version != _requestVersion) return;
      _setFailure(error, reset: reset);
    } catch (error) {
      if (version != _requestVersion) return;
      _setFailure(error, reset: reset);
    }
  }

  void _setFailure(Object error, {required bool reset}) {
    state = state.copyWith(
      phase: reset ? SearchPhase.failure : state.phase,
      isLoadingMore: false,
      errorMessage: userMessage(error),
    );
  }
}

final courseSearchProvider =
    NotifierProvider<CourseSearchController, CourseSearchState>(
  CourseSearchController.new,
);
```

为什么取消后还保留 `version`：某些请求可能已经进入解析或无法真正取消，版本号是最后一道防线，只有最新搜索可以写状态。

::: tip 💡 面试题：Debounce 和 Throttle 有什么区别？
Debounce 等用户停止输入一段时间后执行，适合搜索；Throttle 在一段时间内最多执行一次，适合滚动或进度上报。
:::

## 五、搜索输入与筛选

```dart
class CourseSearchBar extends ConsumerWidget {
  const CourseSearchBar({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SearchBar(
      hintText: '搜索课程、讲师或技术',
      leading: const Icon(Icons.search),
      onChanged: ref.read(courseSearchProvider.notifier).onKeywordChanged,
      trailing: [
        IconButton(
          tooltip: '筛选',
          onPressed: () => showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            builder: (_) => const CourseFilterSheet(),
          ),
          icon: const Icon(Icons.tune),
        ),
      ],
    );
  }
}
```

筛选 BottomSheet 点击“确定”后一次性更新条件。价格区间需要验证：

- 最低价不能小于 0；
- 最高价不能小于最低价；
- 元转分时用十进制解析，不能 `double * 100` 后直接截断；
- 后端再次校验范围和排序白名单。

## 六、搜索历史

```bash
flutter pub add shared_preferences
```

```dart
class SearchHistoryStore {
  static const _key = 'course.search_history.v1';

  Future<List<String>> read() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_key) ?? const [];
  }

  Future<void> add(String raw) async {
    final value = raw.trim();
    if (value.isEmpty) return;

    final prefs = await SharedPreferences.getInstance();
    final old = prefs.getStringList(_key) ?? const [];
    final next = [
      value,
      ...old.where((item) => item != value),
    ].take(10).toList(growable: false);
    await prefs.setStringList(_key, next);
  }
}
```

历史词属于隐私数据：提供一键清空，不同步敏感搜索；退出账号时根据产品规则决定是否清除。

## 七、搜索缓存键

完整缓存键必须包含：

```text
keyword + categoryId + priceRange + sort + page + pageSize
```

只用 keyword 会导致切换价格或排序后复用错误结果。关键词先 trim，并由产品决定是否统一大小写。

## 八、知识点索引

- Debounce、Throttle。
- CancelToken、请求版本号、竞态条件。
- 搜索筛选的完整缓存键。
- 页码追加、去重和错误保留。
- 本地搜索历史与隐私。

## 九、完成清单

- [ ] 输入停顿 350ms 后才搜索
- [ ] 快速输入时旧响应不会覆盖新结果
- [ ] 分类、价格、排序均进入请求参数
- [ ] 追加失败保留已有结果
- [ ] 搜索历史去重、限长且可清空

## 十、明天我会问你

1. 为什么 CancelToken 之外还需要请求版本号？
2. 搜索为什么用 Debounce，而进度上报更适合 Throttle？
3. 搜索缓存键漏掉 sort 会发生什么？
