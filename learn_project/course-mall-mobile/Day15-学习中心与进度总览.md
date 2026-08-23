# Day 15 · 我的课程、章节进度与继续学习

> **今天目标**：完成学习中心，将购买权益、章节目录和播放记录连成闭环。视频 URL 不在列表接口中暴露，Day 16 播放前再申请。

## 一、学习中心接口

需要补充移动端接口：

```http
GET /api/learning/courses?current=1&size=20
GET /api/learning/courses/{courseId}
GET /api/learning/recent
```

课程列表响应：

```json
{
  "records": [
    {
      "courseId": 12,
      "title": "Spring Boot 实战",
      "coverUrl": "...",
      "learnedSeconds": 4200,
      "totalSeconds": 12600,
      "progressPercent": 33,
      "lastLessonId": 1008,
      "lastLearnedAt": "2026-08-23T19:30:00+08:00",
      "entitlementStatus": "ACTIVE"
    }
  ]
}
```

服务端从购买权益表查询当前用户有权学习的课程。不要让客户端提交 userId。

## 二、领域模型

```dart
enum EntitlementStatus { active, expired, revoked, unknown }

class LearningCourse {
  const LearningCourse({
    required this.courseId,
    required this.title,
    required this.learned,
    required this.total,
    required this.progressPercent,
    required this.entitlementStatus,
    this.coverUrl,
    this.lastLessonId,
    this.lastLearnedAt,
  });

  final int courseId;
  final String title;
  final Duration learned;
  final Duration total;
  final int progressPercent;
  final EntitlementStatus entitlementStatus;
  final Uri? coverUrl;
  final int? lastLessonId;
  final DateTime? lastLearnedAt;

  double get progress =>
      (progressPercent.clamp(0, 100)) / 100.0;
}
```

进度百分比由服务端给出，客户端仍 clamp 到 0–100，防止异常值导致进度条断言或视觉溢出。

## 三、课程学习详情

```json
{
  "courseId": 12,
  "title": "Spring Boot 实战",
  "chapters": [
    {
      "id": 101,
      "title": "第一章",
      "lessons": [
        {
          "id": 1001,
          "title": "环境搭建",
          "durationSeconds": 620,
          "lastPositionSeconds": 480,
          "completed": false,
          "locked": false
        }
      ]
    }
  ]
}
```

`locked` 由服务端基于权益、课程发布状态和章节规则计算。即便返回 false，播放会话接口仍要再次鉴权。

## 四、Provider 与刷新关系

```dart
final learningCoursePageProvider =
    FutureProvider.autoDispose.family<LearningCoursePage, int>(
  (ref, page) {
    return ref.watch(learningRepositoryProvider).fetchMyCourses(
          page: page,
          pageSize: 20,
        );
  },
);

final learningCourseDetailProvider =
    FutureProvider.autoDispose.family<LearningCourseDetail, int>(
  (ref, courseId) {
    return ref
        .watch(learningRepositoryProvider)
        .fetchCourseDetail(courseId);
  },
);

final recentLearningProvider =
    FutureProvider.autoDispose<RecentLearning?>((ref) {
  return ref.watch(learningRepositoryProvider).fetchRecent();
});
```

播放进度上报成功后：

```dart
ref.invalidate(recentLearningProvider);
ref.invalidate(learningCourseDetailProvider(courseId));
ref.invalidate(learningCoursePageProvider);
```

对 family 整体 invalidate 会清理所有页。数据量大时可只更新内存中的对应课程，再后台校准。

## 五、“继续学习”决策

```dart
Future<void> continueLearning(
  BuildContext context,
  LearningCourse course,
) async {
  if (course.entitlementStatus != EntitlementStatus.active) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('课程权益当前不可用')),
    );
    return;
  }

  final lessonId = course.lastLessonId;
  if (lessonId != null) {
    context.push('/player/$lessonId');
  } else {
    context.push('/learning/course/${course.courseId}');
  }
}
```

若最近课时已被下架，播放接口返回明确业务错误，客户端刷新目录并选择第一个可学习课时。

## 六、学习中心卡片

```dart
class LearningCourseCard extends StatelessWidget {
  const LearningCourseCard({
    required this.course,
    required this.onContinue,
    super.key,
  });

  final LearningCourse course;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          children: [
            SizedBox(
              width: 120,
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: CourseCover(url: course.coverUrl),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    course.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Semantics(
                    label: '学习进度 ${course.progressPercent}%',
                    child: LinearProgressIndicator(value: course.progress),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text('已学习 ${course.progressPercent}%'),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: onContinue,
                      child: const Text('继续学习'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
```

## 七、进度如何计算

可选规则：

1. 按有效观看秒数 / 总视频秒数；
2. 按完成课时数 / 总课时数；
3. 综合视频、测验和作业。

首版建议：

```text
课程进度 = Σ min(课时有效观看秒数, 课时总时长)
           / Σ 课时总时长
```

完成条件可设置为观看到 90%，但服务端要防止客户端一次上报超大 position。进度不是金融数据，不必做到绝对防作弊，但要避免明显伪造。

## 八、数据一致性

- 服务端是学习进度的权威来源；
- App 可缓存最近播放位置用于秒开，但联网后与服务端取较合理值；
- 多设备同时学习时，用更新时间或“最大有效进度”合并；
- 已完成课时一般不因另一个设备较旧进度而回退；
- 课程下架不等于立即删除已购用户权益，规则由业务确定。

::: tip 💡 面试题：为什么不能只把播放进度存在本地？
用户换设备、卸载 App 或清缓存会丢失，而且服务端无法生成学习中心、统计和课程完成状态。
:::

## 九、知识点索引

- 购买订单与学习权益解耦。
- 服务端进度聚合。
- 多设备进度合并策略。
- Provider 缓存失效关系。
- 列表接口不暴露播放地址。

## 十、完成清单

- [ ] 学习中心只展示当前用户有权益课程
- [ ] 进度值异常时 UI 不崩溃
- [ ] “继续学习”能进入最近课时
- [ ] 下架课时有恢复策略
- [ ] 播放地址未出现在课程列表响应

## 十一、明天我会问你

1. 订单已支付与课程权益已开通为什么要分开？
2. 多设备学习进度可以如何合并？
3. 为什么列表接口不应直接返回永久视频 URL？
