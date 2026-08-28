# Day 26 · 搜索下（Canal 增量同步 + PIT 游标分页）

> **今天目标**：用 Canal 订阅课程库 binlog，把 MySQL 变更增量同步到 Elasticsearch；再用官方推荐的 `PIT + search_after` 完成稳定的深分页。重点是“不丢、不乱、不越权”，不是只让 Demo 跑起来。

## 一、最终链路

```text
mall-course -> MySQL(course) -> ROW binlog -> Canal Server
                                               |
                                               v
                                      mall-search consumer -> Elasticsearch

客户端 -> Gateway -> GET /api/search/courses/cursor -> PIT + search_after
```

MySQL 是事实源，ES 是可重建的查询副本。短暂延迟可以接受，但永久丢事件不可以；Day25 的管理员重建接口就是最终兜底。

## 二、Canal 前置配置

### 1. MySQL 开启行级 binlog

`my.ini` 或 `my.cnf`：

```ini
[mysqld]
server-id=1
log-bin=mysql-bin
binlog-format=ROW
binlog-row-image=FULL
```

重启 MySQL 后验证：

```sql
SHOW VARIABLES LIKE 'log_bin';
SHOW VARIABLES LIKE 'binlog_format';
SHOW VARIABLES LIKE 'binlog_row_image';
```

三项应分别是 `ON`、`ROW`、`FULL`。`FULL` 让 UPDATE 的 after image 包含完整行，下面才能直接重建 ES 文档。

### 2. 最小权限账号

```sql
CREATE USER 'canal'@'%' IDENTIFIED BY '<CANAL_DB_PASSWORD>';
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'canal'@'%';
FLUSH PRIVILEGES;
```

不要使用 root，也不要把真实密码提交到 Git。

### 3. Canal Server

使用与 MySQL/JDK 兼容的 Canal 1.1.8。`conf/example/instance.properties`：

```properties
canal.instance.mysql.slaveId=1234
canal.instance.master.address=host.docker.internal:3306
canal.instance.dbUsername=canal
canal.instance.dbPassword=${CANAL_DB_PASSWORD}
canal.instance.filter.regex=course_mall\\.course
```

`slaveId` 不能与 MySQL `server-id` 或其他复制客户端重复。生产优先使用 Canal → RocketMQ → 搜索服务，让 MQ 承担堆积、重试和多消费者解耦；今天保留直连 Client，是为了看清确认机制。

## 三、依赖与配置

`mall-search/pom.xml`：

```xml
<dependency>
    <groupId>com.alibaba.otter</groupId>
    <artifactId>canal.client</artifactId>
    <version>1.1.8</version>
    <exclusions>
        <exclusion>
            <groupId>commons-logging</groupId>
            <artifactId>commons-logging</artifactId>
        </exclusion>
        <exclusion>
            <groupId>log4j</groupId>
            <artifactId>log4j</artifactId>
        </exclusion>
        <exclusion>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-log4j12</artifactId>
        </exclusion>
    </exclusions>
</dependency>
```

`application.yml`：

```yaml
canal:
  host: ${CANAL_HOST:127.0.0.1}
  port: ${CANAL_PORT:11111}
  destination: ${CANAL_DESTINATION:example}
  username: ${CANAL_USERNAME:}
  password: ${CANAL_PASSWORD:}
  filter: course_mall\\.course
  batch-size: 500
```

配置对象：

```java
@Validated
@ConfigurationProperties(prefix = "canal")
public record CanalProperties(
        @NotBlank String host,
        @Min(1) @Max(65535) int port,
        @NotBlank String destination,
        String username,
        String password,
        @NotBlank String filter,
        @Min(1) @Max(2000) int batchSize) {
}
```

在启动类加 `@ConfigurationPropertiesScan`。

## 四、让 ES 文档拥有可排序字段

Elasticsearch 的 `_id` 不能用于排序、聚合和脚本。Day25 的 `CourseDoc` 增加一份可排序副本：

```java
@Field(type = FieldType.Long)
private Long sortId;
```

构建文档时同时赋值：

```java
doc.setId(courseId);       // ES _id：保证 upsert 幂等
doc.setSortId(courseId);   // 普通 Long 字段：供排序与 search_after 使用
```

字段映射变化后要通过 Day25 的重建流程创建新索引并切换别名；不要期待已有索引自动修改历史文档。

## 五、可靠的 Canal 消费循环

下面省略的 `toCourseDoc(row)` 与 Day25 字段映射一致，但必须设置 `id/sortId`。关键点是：整批全部写 ES 成功才 `ack`；任何一条失败就 `rollback(batchId)`，并在重连后重试。

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class CanalSyncWorker implements SmartLifecycle {

    private final CanalProperties properties;
    private final CourseDocRepository repository;
    private final ExecutorService executor = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "canal-course-sync");
        thread.setDaemon(true);
        return thread;
    });

    private volatile boolean running;
    private volatile CanalConnector connector;

    @Override
    public void start() {
        if (running) {
            return;
        }
        running = true;
        executor.submit(this::consumeWithReconnect);
    }

    @Override
    public void stop() {
        running = false;
        CanalConnector current = connector;
        if (current != null) {
            current.disconnect();
        }
        executor.shutdownNow();
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    @Override
    public boolean isAutoStartup() {
        return true;
    }

    private void consumeWithReconnect() {
        while (running) {
            try {
                consume();
            } catch (Exception ex) {
                log.error("Canal 连接中断，3 秒后重连", ex);
                sleep(3000);
            }
        }
    }

    private void consume() {
        connector = CanalConnectors.newSingleConnector(
                new InetSocketAddress(properties.host(), properties.port()),
                properties.destination(), properties.username(), properties.password());
        try {
            connector.connect();
            connector.subscribe(properties.filter());
            connector.rollback();

            while (running) {
                Message message = connector.getWithoutAck(properties.batchSize());
                long batchId = message.getId();
                if (batchId < 0 || message.getEntries().isEmpty()) {
                    sleep(500);
                    continue;
                }
                try {
                    handleEntries(message.getEntries());
                    connector.ack(batchId);
                } catch (Exception ex) {
                    connector.rollback(batchId);
                    log.error("Canal 批次处理失败 batchId={}，已回滚消费位点", batchId, ex);
                    sleep(1000);
                }
            }
        } finally {
            connector.disconnect();
            connector = null;
        }
    }

    private void handleEntries(List<CanalEntry.Entry> entries) throws Exception {
        for (CanalEntry.Entry entry : entries) {
            if (entry.getEntryType() != CanalEntry.EntryType.ROWDATA) {
                continue;
            }
            CanalEntry.RowChange change = CanalEntry.RowChange.parseFrom(entry.getStoreValue());
            for (CanalEntry.RowData data : change.getRowDatasList()) {
                if (change.getEventType() == CanalEntry.EventType.DELETE) {
                    delete(toMap(data.getBeforeColumnsList()));
                } else {
                    upsert(toMap(data.getAfterColumnsList()));
                }
            }
        }
    }

    private Map<String, String> toMap(List<CanalEntry.Column> columns) {
        return columns.stream().collect(Collectors.toMap(
                CanalEntry.Column::getName,
                column -> column.getIsNull() ? "" : column.getValue(),
                (left, right) -> right));
    }

    private void upsert(Map<String, String> row) {
        String id = require(row, "id");
        boolean published = "1".equals(row.get("status"));
        boolean deleted = !row.getOrDefault("deleted_at", "").isBlank();
        if (!published || deleted) {
            repository.deleteById(Long.valueOf(id));
            return;
        }
        repository.save(toCourseDoc(row));
    }

    private void delete(Map<String, String> row) {
        repository.deleteById(Long.valueOf(require(row, "id")));
    }

    private String require(Map<String, String> row, String key) {
        String value = row.get(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("binlog 缺少字段: " + key);
        }
        return value;
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            running = false;
        }
    }
}
```

完整 `toCourseDoc` 至少映射：`id/sortId/title/description/cover/category_id/teacher_id/price/status/view_count/buy_count/create_time`。数值转换失败必须抛异常，让本批回滚；不能 `catch` 后跳过再确认。

> 直连 Client 是“至少一次”投递：批次可能重复，但不会因先确认而丢失。ES `_id` 复用课程 ID，所以重复 save 只覆盖同一文档。生产还应监控同步延迟、失败次数和 Canal 位点，并准备死信/人工重放。

## 六、`PIT + search_after` 深分页

只用 `search_after` 时，两页之间若索引刷新，结果顺序可能变化。PIT（Point in Time）固定一个短期查询视图；每次请求使用上一页最后一条的 sort 值继续查询。

返回对象：

```java
public record CursorPage<T>(
        List<T> items,
        String pitId,
        Long nextAfterId,
        boolean hasMore) {
}
```

Service：

```java
@Slf4j
@Service
@RequiredArgsConstructor
public class CourseCursorSearchService {

    private static final String INDEX = "course";
    private final ElasticsearchClient client;
    private final CourseSearchConverter converter;

    public CursorPage<CourseHitVO> search(
            String keyword, String pitId, Long afterId, int size) {
        try {
            String activePitId = pitId;
            if (activePitId == null || activePitId.isBlank()) {
                activePitId = client.openPointInTime(o -> o
                        .index(INDEX)
                        .keepAlive("1m")).id();
            }
            final String requestPitId = activePitId;

            SearchResponse<CourseDoc> response = client.search(s -> {
                s.pit(p -> p.id(requestPitId).keepAlive("1m"))
                        .query(q -> q.multiMatch(m -> m
                                .fields("title", "description")
                                .query(keyword)))
                        .sort(sort -> sort.field(f -> f
                                .field("sortId")
                                .order(SortOrder.Desc)))
                        .size(size + 1)
                        .trackTotalHits(t -> t.enabled(false));
                if (afterId != null) {
                    s.searchAfter(FieldValue.of(afterId));
                }
                return s;
            }, CourseDoc.class);

            List<Hit<CourseDoc>> hits = response.hits().hits();
            boolean hasMore = hits.size() > size;
            List<Hit<CourseDoc>> current = hasMore ? hits.subList(0, size) : hits;
            List<CourseHitVO> items = current.stream()
                    .map(Hit::source)
                    .filter(Objects::nonNull)
                    .map(converter::toVO)
                    .toList();

            String latestPitId = response.pitId() == null ? requestPitId : response.pitId();
            if (!hasMore) {
                client.closePointInTime(c -> c.id(latestPitId));
                return new CursorPage<>(items, null, null, false);
            }
            Long nextAfterId = current.get(current.size() - 1)
                    .sort().get(0).longValue();
            return new CursorPage<>(items, latestPitId, nextAfterId, true);
        } catch (Exception ex) {
            log.error("课程游标搜索失败", ex);
            throw new BizException(ErrorCode.SEARCH_UNAVAILABLE);
        }
    }
}
```

这个接口按 `sortId DESC` 展示“较新的课程”，适合无限滚动。Day25 的普通搜索仍按 `_score` 展示相关性并用于前 10000 条内的浅分页。若要“相关性排序 + 深分页”，排序必须同时带 `_score` 和唯一的 `sortId`，游标也要原样保存两个 sort 值。

Controller：

```java
@Validated
@RestController
@RequestMapping("/api/search/courses")
@RequiredArgsConstructor
public class CourseCursorSearchController {

    private final CourseCursorSearchService searchService;

    @GetMapping("/cursor")
    public Result<CursorPage<CourseHitVO>> cursor(
            @RequestParam @NotBlank @Size(max = 100) String keyword,
            @RequestParam(required = false) @Size(max = 4096) String pitId,
            @RequestParam(required = false) @Positive Long afterId,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return Result.ok(searchService.search(keyword, pitId, afterId, size));
    }
}
```

第一页不传 `pitId/afterId`；下一页必须把响应中的两者原样传回。PIT ID 较长，客户端必须 URL encode。用户中途离开时不关闭也会在 `keep_alive` 到期后释放；不要把 keep-alive 设成数小时。

## 七、验证

先用 `mall-course` 管理接口新增、改名、下架课程，不直接改数据库，以便同时验证权限、审计和 CDC：

```bash
curl -X PUT http://127.0.0.1:9000/api/admin/courses/1 \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Java 高并发实战（新版）", "status":1}'
```

确认 ES 文档更新后查询第一页：

```bash
curl "http://127.0.0.1:9000/api/search/courses/cursor?keyword=Java&size=2"
```

把返回的 `pitId` 和 `nextAfterId` URL encode 后传给下一页。两页结果应不重不漏，最后一页返回 `hasMore=false`、`pitId=null`。

还要验证：

- 停掉 ES，更新课程，确认 Canal 批次不 ack；恢复 ES 后自动补上；
- 停掉 Canal Server 后恢复，搜索服务能重连；
- 下架或逻辑删除课程后，ES 文档被删除；
- 非法 `size/afterId/keyword` 被 Validation 拦截；
- 重新执行同一批事件不会产生重复文档。

## 八、知识点索引

| 知识点 | 对应文档 |
|---|---|
| ROW binlog、主从复制、最小权限 | [MySQL](/learn_database/MySQL) |
| 至少一次、ack/rollback、重试与幂等 | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| `search_after`、PIT、稳定排序 | [Elasticsearch](/learn_backend/java/微服务/Elasticsearch) |
| `SmartLifecycle` 与优雅停机 | [Spring](/learn_backend/java/基础/Spring) |
| 最终一致与可重建读模型 | [分布式基础](/learn_backend/java/微服务/分布式基础) |

## 九、完成清单

- [ ] MySQL 的 binlog 为 `ROW + FULL`
- [ ] Canal 使用专用最小权限账号，密码未提交 Git
- [ ] ES 故障时批次回滚，恢复后能补偿同步
- [ ] Canal 断线后搜索服务自动重连
- [ ] `sortId` 映射生效并完成索引重建
- [ ] PIT 游标连续翻页不重不漏
- [ ] 参数校验、i18n 错误和网关路由验证通过

## 十、面试追问

1. Canal 为什么要求 ROW binlog？`binlog_row_image=FULL` 在本实现中有什么作用？
2. 为什么必须处理成功后再 ack？失败后继续 ack 会发生什么？
3. 为什么重复消费不会产生重复 ES 文档？
4. 为什么不能按 `_id` 排序？`sortId` 为什么必须唯一？
5. `from+size`、`search_after`、PIT 和 scroll 分别适合什么场景？

参考：[Canal 1.1.8](https://github.com/alibaba/canal/releases)、[Elasticsearch 深分页与 PIT](https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html)、[Elasticsearch `_id` 限制](https://www.elastic.co/docs/reference/elasticsearch/mapping-reference/mapping-id-field)。
