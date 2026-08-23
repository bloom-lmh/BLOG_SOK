# Day 11 · 课程详情、章节、收藏与系统分享

> **今天目标**：完成课程详情聚合页。详情不是只显示标题和价格，还要处理讲师、章节试听、购买权限、收藏、分享、缓存和非法参数。

## 一、移动端聚合接口

当前后端 `GET /api/course/{id}` 如果只返回课程表字段，建议增加：

```http
GET /api/mobile/course/{courseId}
```

响应一次返回首屏所需信息：

```json
{
  "course": {
    "id": 12,
    "title": "Spring Boot 实战",
    "subtitle": "从入门到部署",
    "coverUrl": "https://cdn.example.com/...",
    "price": "99.00",
    "originalPrice": "199.00",
    "description": "...",
    "sales": 2180
  },
  "teacher": {
    "id": 7,
    "name": "林老师",
    "avatarUrl": "...",
    "introduction": "..."
  },
  "chapters": [
    {
      "id": 101,
      "title": "第一章",
      "lessons": [
        {
          "id": 1001,
          "title": "环境搭建",
          "durationSeconds": 620,
          "preview": true
        }
      ]
    }
  ],
  "access": {
    "purchased": false,
    "canLearn": false
  },
  "favorite": false
}
```

这个接口属于移动端 BFF/聚合视图，不代表数据库要做一张“大宽表”。服务端可以并行查询后组装 DTO。

## 二、领域模型

```dart
class CourseDetail {
  const CourseDetail({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.priceText,
    required this.description,
    required this.teacher,
    required this.chapters,
    required this.purchased,
    required this.canLearn,
    required this.favorite,
    this.coverUrl,
  });

  final int id;
  final String title;
  final String subtitle;
  final String priceText;
  final String description;
  final Teacher teacher;
  final List<CourseChapter> chapters;
  final bool purchased;
  final bool canLearn;
  final bool favorite;
  final Uri? coverUrl;
}

class CourseChapter {
  const CourseChapter({
    required this.id,
    required this.title,
    required this.lessons,
  });

  final int id;
  final String title;
  final List<CourseLesson> lessons;
}

class CourseLesson {
  const CourseLesson({
    required this.id,
    required this.title,
    required this.duration,
    required this.preview,
  });

  final int id;
  final String title;
  final Duration duration;
  final bool preview;
}
```

列表 DTO 和详情 DTO 分开。列表不需要章节和长描述，避免每条数据过重。

## 三、详情 Provider

```dart
final courseDetailProvider =
    FutureProvider.autoDispose.family<CourseDetail, int>(
  (ref, courseId) async {
    if (courseId <= 0) {
      throw const AppException(
        kind: AppExceptionKind.invalidResponse,
        message: '课程编号无效',
      );
    }
    return ref.watch(courseRepositoryProvider).fetchDetail(courseId);
  },
);
```

进入订单成功页、收藏变化、购买成功后：

```dart
ref.invalidate(courseDetailProvider(courseId));
```

这样重新获取 `purchased/canLearn/favorite`，不在客户端猜测权限。

## 四、Sliver 详情页

```dart
class CourseDetailPage extends ConsumerWidget {
  const CourseDetailPage({required this.courseId, super.key});

  final int courseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(courseDetailProvider(courseId));

    return Scaffold(
      body: detail.when(
        loading: () => const AppLoadingView(),
        error: (error, stack) => AppErrorView(
          message: userMessage(error),
          onRetry: () => ref.invalidate(courseDetailProvider(courseId)),
        ),
        data: (course) => CustomScrollView(
          slivers: [
            SliverAppBar.large(
              pinned: true,
              title: Text(course.title),
              flexibleSpace: FlexibleSpaceBar(
                background: CourseCover(url: course.coverUrl),
              ),
              actions: [
                FavoriteButton(
                  courseId: course.id,
                  selected: course.favorite,
                ),
                IconButton(
                  tooltip: '分享课程',
                  onPressed: () => shareCourse(course),
                  icon: const Icon(Icons.share_outlined),
                ),
              ],
            ),
            SliverPadding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              sliver: SliverList.list(
                children: [
                  Text(
                    course.title,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  Text(course.subtitle),
                  const SizedBox(height: AppSpacing.lg),
                  TeacherSection(teacher: course.teacher),
                  const SizedBox(height: AppSpacing.xl),
                  CourseDescription(text: course.description),
                  const SizedBox(height: AppSpacing.xl),
                  ChapterList(
                    chapters: course.chapters,
                    canLearn: course.canLearn,
                    onLessonTap: (lesson) =>
                        _openLesson(context, course, lesson),
                  ),
                  const SizedBox(height: 96),
                ],
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: detail.whenOrNull(
        data: (course) => SafeArea(
          minimum: const EdgeInsets.all(AppSpacing.lg),
          child: AppPrimaryButton(
            label: course.canLearn ? '继续学习' : '立即购买 ¥${course.priceText}',
            onPressed: () {
              if (course.canLearn) {
                context.push('/learning/course/${course.id}');
              } else {
                context.push('/order/confirm?courseId=${course.id}');
              }
            },
          ),
        ),
      ),
    );
  }

  void _openLesson(
    BuildContext context,
    CourseDetail course,
    CourseLesson lesson,
  ) {
    if (!lesson.preview && !course.canLearn) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('购买课程后可学习本节')),
      );
      return;
    }
    context.push('/player/${lesson.id}');
  }
}
```

客户端隐藏锁定课时只是体验。播放器接口必须在服务端再次判断用户是否购买或该课时是否可试听。

## 五、收藏操作

需要后端补充幂等接口：

```http
PUT    /api/favorites/courses/{courseId}
DELETE /api/favorites/courses/{courseId}
GET    /api/favorites/courses
```

```dart
Future<void> toggleFavorite(
  WidgetRef ref, {
  required int courseId,
  required bool selected,
}) async {
  final repository = ref.read(favoriteRepositoryProvider);
  if (selected) {
    await repository.removeCourse(courseId);
  } else {
    await repository.addCourse(courseId);
  }
  ref.invalidate(courseDetailProvider(courseId));
  ref.invalidate(favoriteCourseListProvider);
}
```

`PUT/DELETE` 本身幂等：重复收藏仍是已收藏，重复取消仍是未收藏。网络慢时按钮显示局部 Loading。后续可做乐观更新，但失败必须回滚。

## 六、系统分享

```bash
flutter pub add share_plus
```

```dart
Future<void> shareCourse(CourseDetail course) {
  final uri = Uri.https(
    'm.coursemall.com',
    '/course/${course.id}',
  );
  return SharePlus.instance.share(
    ShareParams(
      title: course.title,
      text: '推荐课程：${course.title}\n$uri',
      uri: uri,
    ),
  );
}
```

分享的是可验证的 HTTPS Universal Link，不分享临时视频地址、Token 或内部接口地址。

## 七、描述内容安全

如果详情描述来自富文本：

- 后端先做 HTML 白名单清洗；
- App 使用受控渲染组件；
- 禁止任意 script、iframe、`javascript:` 链接；
- 外链打开前校验 scheme 和域名；
- 不把富文本塞进可执行 WebView。

最安全的首版是服务端返回结构化段落/图片，或返回已清洗 Markdown。

::: tip 💡 面试题：为什么“服务端返回的 HTML”仍是不可信输入？
后台账号、数据库或内容链路都可能被攻击；客户端直接执行任意 HTML/JS 会扩大为 XSS、钓鱼和隐私泄露风险。
:::

## 八、知识点索引

- 移动端 BFF/聚合接口。
- SliverAppBar、CustomScrollView、SliverList。
- 资源级权限与路由级权限。
- 幂等收藏、缓存失效。
- Universal Link 与富文本安全。

## 九、完成清单

- [ ] 详情、讲师、章节均来自接口
- [ ] 试听和已购权限由后端返回
- [ ] 收藏接口幂等且失败可恢复
- [ ] 分享链接能冷启动进入对应课程
- [ ] 富文本不会执行任意脚本

## 十、明天我会问你

1. 为什么详情页适合聚合接口？
2. 客户端已经锁住课时，播放器接口为什么还要鉴权？
3. 收藏接口为什么推荐 PUT/DELETE？
