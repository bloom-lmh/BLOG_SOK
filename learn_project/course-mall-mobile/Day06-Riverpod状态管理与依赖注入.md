# Day 06 · Riverpod 状态管理、依赖注入与单向数据流

> **今天目标**：把页面、状态和数据访问串成一条清晰链路。你要会判断状态该放 `setState`、Riverpod 还是本地数据库，而不是“所有东西都全局化”。

## 一、状态先分类

| 状态 | 示例 | 推荐位置 |
| --- | --- | --- |
| 瞬时 UI 状态 | 密码是否可见、某个动画 | StatefulWidget/Hook |
| 页面业务状态 | 搜索条件、分页加载 | Riverpod Controller |
| 服务端状态 | 课程、订单、学习记录 | Repository + Riverpod 异步 Provider |
| 跨页面客户端状态 | 会话、购物意图、主题选择 | Riverpod Notifier |
| 需要跨启动保存 | 搜索历史、离线任务 | SharedPreferences/Drift |
| 敏感凭证 | Refresh Token | Secure Storage |

把服务端课程列表复制进一个全局 List 再手动同步，是常见反模式。服务端数据由 Repository 提供，Provider 负责缓存与刷新，UI 只是订阅。

## 二、领域模型与 Repository 接口

`lib/features/course/domain/course.dart`：

```dart
class Course {
  const Course({
    required this.id,
    required this.title,
    required this.priceText,
    required this.sales,
    this.coverUrl,
    this.teacherName,
  });

  final int id;
  final String title;
  final String priceText;
  final int sales;
  final Uri? coverUrl;
  final String? teacherName;
}

class CoursePage {
  const CoursePage({
    required this.items,
    required this.page,
    required this.pageSize,
    required this.total,
    required this.totalPages,
  });

  final List<Course> items;
  final int page;
  final int pageSize;
  final int total;
  final int totalPages;
}
```

`lib/features/course/domain/course_repository.dart`：

```dart
abstract interface class CourseRepository {
  Future<CoursePage> fetchPage({
    required int page,
    required int pageSize,
    int? categoryId,
    String? keyword,
  });

  Future<Course> fetchDetail(int courseId);
}
```

`lib/features/course/data/repositories/course_repository_impl.dart`：

```dart
class CourseRepositoryImpl implements CourseRepository {
  CourseRepositoryImpl(this._service);

  final CourseApiService _service;

  @override
  Future<CoursePage> fetchPage({
    required int page,
    required int pageSize,
    int? categoryId,
    String? keyword,
  }) async {
    final dto = await _service.fetchPage(
      page: page,
      size: pageSize,
      categoryId: categoryId,
      keyword: keyword,
    );

    return CoursePage(
      items: dto.records
          .map(
            (item) => Course(
              id: item.id,
              title: item.title,
              priceText: item.price,
              sales: item.sales,
              coverUrl: item.coverUrl == null
                  ? null
                  : Uri.tryParse(item.coverUrl!),
              teacherName: item.teacherName,
            ),
          )
          .toList(growable: false),
      page: dto.current,
      pageSize: dto.size,
      total: dto.total,
      totalPages: dto.pages,
    );
  }

  @override
  Future<Course> fetchDetail(int courseId) async {
    // Day 11 完成详情 DTO 映射。
    throw UnimplementedError();
  }
}
```

Repository 是领域数据的唯一入口；Service 只知道 HTTP。未来加入本地缓存时，Widget 和 Controller 不需要修改。

## 三、依赖图由 Provider 组装

`lib/features/course/course_providers.dart`：

```dart
import 'package:flutter_riverpod/flutter_riverpod.dart';

final courseApiServiceProvider = Provider<CourseApiService>((ref) {
  return CourseApiService(ref.watch(dioProvider));
});

final courseRepositoryProvider = Provider<CourseRepository>((ref) {
  return CourseRepositoryImpl(ref.watch(courseApiServiceProvider));
});
```

创建对象不等于全局单例。Provider 管理生命周期、依赖关系和测试替换；业务代码依赖抽象接口。

::: tip 💡 面试题：Riverpod 在这里除了“状态管理”还做了什么？
它还充当依赖注入容器，负责构造依赖图、缓存实例、管理生命周期，并允许测试覆盖实现。
:::

## 四、读取服务端状态

使用 Dart record 作为结构化查询键：

```dart
typedef CoursePageQuery = ({
  int page,
  int pageSize,
  int? categoryId,
  String keyword,
});

final coursePageProvider =
    FutureProvider.autoDispose.family<CoursePage, CoursePageQuery>(
  (ref, query) async {
    final repository = ref.watch(courseRepositoryProvider);
    return repository.fetchPage(
      page: query.page,
      pageSize: query.pageSize,
      categoryId: query.categoryId,
      keyword: query.keyword,
    );
  },
);
```

record 自带值相等语义，相同查询参数会命中同一个 family 实例。不要用没有实现 `==/hashCode` 的普通可变类当 family 参数，否则缓存键会失效。

页面消费 `AsyncValue`：

```dart
class CourseSection extends ConsumerWidget {
  const CourseSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final result = ref.watch(
      coursePageProvider(
        (page: 1, pageSize: 20, categoryId: null, keyword: ''),
      ),
    );

    return result.when(
      loading: () => const AppLoadingView(),
      error: (error, stack) => AppErrorView(
        message: userMessage(error),
        onRetry: () => ref.invalidate(coursePageProvider),
      ),
      data: (page) => CourseList(items: page.items),
    );
  }
}
```

只想重建销售数量组件时使用 `select`：

```dart
final count = ref.watch(
  cartProvider.select((state) => state.totalCount),
);
```

`select` 不是越多越好，只在实测存在无关重建时使用。

## 五、客户端状态使用 Notifier

`lib/features/order/presentation/cart_controller.dart`：

```dart
class CartState {
  const CartState({this.courseIds = const {}});

  final Set<int> courseIds;
  int get totalCount => courseIds.length;

  CartState copyWith({Set<int>? courseIds}) {
    return CartState(courseIds: courseIds ?? this.courseIds);
  }
}

class CartController extends Notifier<CartState> {
  @override
  CartState build() => const CartState();

  void add(int courseId) {
    state = state.copyWith(
      courseIds: {...state.courseIds, courseId},
    );
  }

  void remove(int courseId) {
    state = state.copyWith(
      courseIds: {...state.courseIds}..remove(courseId),
    );
  }

  void clear() => state = const CartState();
}

final cartProvider =
    NotifierProvider<CartController, CartState>(CartController.new);
```

每次创建新 Set，保持状态不可变。如果原地修改 `state.courseIds.add(...)`，Riverpod 可能无法识别变化，也容易产生共享引用 bug。

课程商城当前是“单课程立即购买”，购物车可暂不出现在 UI；保留这个例子是为了理解客户端状态，而不是强行增加业务。

## 六、刷新、重试和生命周期

- `ref.invalidate(provider)`：丢弃旧状态，下次读取重新执行。
- `ref.refresh(provider.future)`：立即刷新并等待结果。
- `autoDispose`：页面不再监听时自动释放。
- `ref.keepAlive()`：确有短期缓存需求时延长生命周期。
- `ref.onDispose(...)`：取消请求、关闭流或释放 Controller。

下拉刷新：

```dart
Future<void> onRefresh(WidgetRef ref) async {
  await ref.refresh(
    coursePageProvider(
      (page: 1, pageSize: 20, categoryId: null, keyword: ''),
    ).future,
  );
}
```

## 七、常见反模式

1. 在 `build` 中调用写操作，造成重复请求。
2. 用 Provider 保存 `BuildContext`。
3. Provider 之间互相读写形成环。
4. 捕获异常后只返回空列表，把“失败”伪装成“无数据”。
5. 所有状态都做成全局且永不释放。
6. Repository 返回 Widget 或依赖 Flutter UI 包。

## 八、知识点索引

- 单向数据流、不可变状态、单一数据源。
- Provider、FutureProvider、NotifierProvider。
- Provider family 的值相等缓存键。
- Repository 抽象与依赖反转。
- autoDispose、invalidate、refresh、select。

## 九、完成清单

- [ ] Widget 不直接依赖 Dio
- [ ] DTO 已映射为领域模型
- [ ] Provider 负责组装 Service 与 Repository
- [ ] Loading、Error、Data 三态完整
- [ ] 状态更新没有原地修改集合

## 十、明天我会问你

1. Service 和 Repository 的职责有什么区别？
2. 为什么不能用普通可变对象随便做 family 参数？
3. `invalidate` 与 `refresh` 有什么差别？
