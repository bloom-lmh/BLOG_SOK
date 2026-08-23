# Day 19 · 离线缓存、Drift 数据库与可靠任务队列

> **今天目标**：让 App 在弱网下仍可查看已缓存内容，并可靠补报学习进度。区分缓存和真相，避免把“离线可用”误做成“离线下单”。

## 一、本地存储分工

| 数据 | 工具 |
| --- | --- |
| Token | flutter_secure_storage |
| 主题、语言、搜索历史 | shared_preferences |
| 结构化缓存、离线队列 | Drift/SQLite |
| 图片 | 图片缓存/CDN |
| 高价值视频离线 | 下载管理 + DRM，另立专项 |

SharedPreferences 不是数据库；SQLite 也默认不加密。敏感业务数据是否落库，要经过威胁评估和清理策略。

## 二、安装 Drift

```bash
flutter pub add drift drift_flutter connectivity_plus
flutter pub add --dev drift_dev build_runner
dart run build_runner build --delete-conflicting-outputs
```

## 三、缓存表与 Outbox 表

`lib/core/storage/app_database.dart`：

```dart
import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'app_database.g.dart';

class CachedCourses extends Table {
  TextColumn get userScope => text()();
  IntColumn get courseId => integer()();
  TextColumn get jsonBody => text()();
  DateTimeColumn get cachedAt => dateTime()();
  DateTimeColumn get expiresAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {userScope, courseId};
}

class OutboxJobs extends Table {
  TextColumn get id => text()();
  TextColumn get userScope => text()();
  TextColumn get type => text()();
  TextColumn get payloadJson => text()();
  TextColumn get idempotencyKey => text().unique()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get nextAttemptAt => dateTime()();
  DateTimeColumn get createdAt => dateTime()();
  TextColumn get lastError => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

@DriftDatabase(tables: [CachedCourses, OutboxJobs])
final class AppDatabase extends _$AppDatabase {
  AppDatabase([QueryExecutor? executor])
      : super(executor ?? driftDatabase(name: 'course_mall'));

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (migrator) => migrator.createAll(),
        onUpgrade: (migrator, from, to) async {
          // 每次升级按版本逐步迁移，不能直接删库。
        },
        beforeOpen: (details) async {
          await customStatement('PRAGMA foreign_keys = ON');
        },
      );
}
```

`userScope` 可以是服务端用户 ID 的不可逆派生值。它防止 A 用户退出后 B 用户看到 A 的缓存；退出时必须清理对应 scope。

## 四、缓存采用 stale-while-revalidate

策略：

```text
有新鲜缓存 → 立即展示
有过期缓存 → 先展示并标记“可能已更新”，后台拉取
没有缓存   → 请求网络
网络成功   → 事务写缓存并展示
网络失败   → 有旧缓存则降级；否则错误页
```

```dart
class OfflineCourseRepository implements CourseRepository {
  OfflineCourseRepository(this._remote, this._database);

  final CourseApiService _remote;
  final AppDatabase _database;

  @override
  Future<Course> fetchDetail(int courseId) async {
    final cached = await _readCachedCourse(courseId);

    if (cached != null && cached.expiresAt.isAfter(DateTime.now())) {
      return cached.course;
    }

    try {
      final dto = await _remote.fetchDetail(courseId);
      final course = dto.toDomain();
      await _writeCachedCourse(course);
      return course;
    } catch (_) {
      if (cached != null) return cached.course;
      rethrow;
    }
  }
}
```

关键页面显示缓存时间。订单支付、权益和退款状态不应长期使用旧缓存，回到前台必须刷新。

::: tip 💡 面试题：缓存和数据源有什么区别？
缓存可以过期、被清除或与服务端不一致；服务端/本地权威库才是 Source of Truth。业务决策不能只依赖缓存。
:::

## 五、学习进度进入 Outbox

网络失败时不直接丢弃：

```dart
Future<void> enqueueProgress(ProgressReport report) {
  return database.into(database.outboxJobs).insertOnConflictUpdate(
        OutboxJobsCompanion.insert(
          id: const Uuid().v4(),
          userScope: currentUserScope,
          type: 'PLAY_PROGRESS',
          payloadJson: jsonEncode(report.toJson()),
          idempotencyKey: report.idempotencyKey,
          nextAttemptAt: DateTime.now(),
          createdAt: DateTime.now(),
        ),
      );
}
```

Outbox worker：

```dart
Future<void> flushOutbox() async {
  if (_running) return;
  _running = true;
  try {
    final jobs = await loadDueJobs(limit: 20);
    for (final job in jobs) {
      try {
        await sendJob(job);
        await deleteJob(job.id);
      } catch (error) {
        await rescheduleWithBackoff(job, error);
      }
    }
  } finally {
    _running = false;
  }
}
```

服务端必须按 `idempotencyKey` 去重，因为 worker 可能“服务端成功、客户端删除前崩溃”，之后会再次发送。这是 **at-least-once delivery**。

## 六、任务重试策略

```text
nextDelay = min(2^attempts 秒 + jitter, 15 分钟)
```

分类：

- 连接失败、5xx：重试；
- 401：先刷新 Token；
- 400 参数错误：进入死信/删除并记录；
- 403 权益失效：停止重试；
- 409 已处理：按成功处理；
- 超过最大次数：保留诊断或上报，不永久热循环。

多个进度任务可按 `lessonId` 合并，只保留最新有效 position，降低请求量。

## 七、网络状态只是提示

`connectivity_plus` 能告诉你当前连接类型，但“连着 Wi-Fi”不代表能访问互联网。真正请求仍需超时和异常处理。

监听网络恢复、App 回前台、用户手动重试时调用 `flushOutbox`。若需要应用被系统终止后后台同步，再评估 WorkManager/BGTask，且不能假设系统一定按时执行。

## 八、数据库迁移

每次 schemaVersion 增加时：

1. 写明确迁移；
2. 用旧版本数据库 fixture 测试升级；
3. 禁止生产直接 dropAll；
4. 数据转换放事务；
5. 大表迁移考虑耗时和磁盘空间；
6. 缓存表实在无法兼容可定向重建，用户数据表不行。

## 九、退出登录清理

```dart
Future<void> clearUserData(String userScope) {
  return database.transaction(() async {
    await (database.delete(database.cachedCourses)
          ..where((row) => row.userScope.equals(userScope)))
        .go();
    await (database.delete(database.outboxJobs)
          ..where((row) => row.userScope.equals(userScope)))
        .go();
  });
}
```

先尝试补发不代表可以阻塞退出。退出时未发送的用户任务应清理，避免下一个账号误发。

## 十、离线能力边界

可以：

- 查看缓存课程详情和目录；
- 查看最近学习记录；
- 暂存进度、收藏意图；
- 显示离线提示。

不应该：

- 离线确认支付成功；
- 用旧价格创建订单；
- 用缓存权益绕过播放鉴权；
- 无限期缓存签名视频地址。

## 十一、知识点索引

- SQLite、Drift、Schema Migration。
- stale-while-revalidate。
- Outbox、at-least-once、幂等消费。
- 指数退避、死信和任务合并。
- 网络连接类型与真正可达性。

## 十二、完成清单

- [ ] 缓存和安全存储职责分开
- [ ] 过期缓存可降级且明确提示
- [ ] 进度失败进入 Outbox
- [ ] 服务端按幂等键去重
- [ ] 退出登录清理用户隔离数据

## 十三、明天我会问你

1. 为什么 Outbox 发送成功后仍可能重复？
2. connectivity 显示 Wi-Fi 为什么仍不能认定网络可用？
3. 哪些业务绝不能只依赖离线缓存？
