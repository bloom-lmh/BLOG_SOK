# MySQL SQL 优化实战

[[toc]]

SQL 优化不是“看到慢 SQL 就加索引”，而是一个可以验证的闭环：

配套数据：[MySQL 练习数据库](/learn_database/MySQL-练习数据库)。其中 `access_log` 有 100 万行且故意只保留主键，适合完成本篇的优化前后对比。

```text
发现慢 SQL
→ 固定参数与数据量
→ EXPLAIN / EXPLAIN ANALYZE 定位瓶颈
→ 改 SQL、索引或数据模型
→ 再次测量
→ 检查写入成本、锁和其他查询是否退化
```

## 1. 优化前先建立正确认识

### 1.1 优化目标不只有执行时间

需要同时观察：

- 响应时间：平均值、P95、P99。
- 吞吐量：每秒执行次数。
- 扫描行数与返回行数：扫描很多、返回很少通常有优化空间。
- CPU、磁盘 IO、内存临时表。
- 锁等待与事务持续时间。
- 优化对 INSERT、UPDATE、DELETE 的额外索引维护成本。

### 1.2 不要单凭一条规则判断好坏

- `type=ALL`：大表且只返回少量行时需要警惕；只有几十行的小表全扫可能最合理。
- `Using filesort`：表示额外排序，不表示一定写磁盘；小结果集内存排序通常没问题。
- `Using temporary`：表示使用内部临时结果，应结合数据量和是否落盘判断。
- “走索引”不等于快：命中表中 80% 的数据，随机回表可能比顺序全表扫描更慢。
- 索引不是越多越好：每个索引都会增加存储和写放大。

## 2. 找到真正值得优化的 SQL

### 2.1 慢查询日志

```sql
-- 查看当前配置
SHOW VARIABLES LIKE 'slow_query_log';
SHOW VARIABLES LIKE 'long_query_time';
SHOW VARIABLES LIKE 'slow_query_log_file';

-- 临时开启，重启后是否保留取决于配置文件
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 1;

-- 调试时可开启，生产环境谨慎：可能记录大量 SQL
SET GLOBAL log_queries_not_using_indexes = ON;
```

生产环境应写入 MySQL 配置文件并评估日志量：

```ini
[mysqld]
slow_query_log=ON
long_query_time=1
log_queries_not_using_indexes=OFF
```

`long_query_time` 不是越小越好。阈值过低会产生大量日志，应根据接口 SLA、采样周期和磁盘空间设置。

### 2.2 使用 sys Schema 看累计热点

慢日志适合发现单次慢查询，`sys` Schema 适合找“单次不慢但调用极多”的累计热点：

```sql
SELECT query,
       exec_count,
       total_latency,
       avg_latency,
       rows_examined,
       rows_sent
FROM sys.statement_analysis
ORDER BY total_latency DESC
LIMIT 20;
```

查找全表扫描较多的语句：

```sql
SELECT query,
       db,
       exec_count,
       total_latency,
       rows_examined,
       rows_sent
FROM sys.statements_with_full_table_scans
ORDER BY rows_examined DESC
LIMIT 20;
```

优化优先级通常是：

```text
业务影响大 × 调用频率高 × 单次成本高
```

不要只优化日志中最慢但一天只执行一次的后台报表。

## 3. EXPLAIN 应该怎么看

### 3.1 三种常用方式

```sql
-- 只展示优化器估算，不真正执行 SELECT
EXPLAIN
SELECT * FROM orders WHERE user_id = 1;

-- 树形计划，更容易看执行顺序
EXPLAIN FORMAT=TREE
SELECT * FROM orders WHERE user_id = 1;

-- 真正执行并输出实际耗时、实际行数和循环次数
EXPLAIN ANALYZE
SELECT * FROM orders WHERE user_id = 1;
```

`EXPLAIN ANALYZE` 会真实执行查询，不要直接对高风险修改语句或生产大查询随意使用。

### 3.2 传统 EXPLAIN 字段

| 字段 | 含义 | 重点 |
| --- | --- | --- |
| `table` | 当前访问的表或派生结果 | 确认当前执行节点 |
| `type` | 访问方式 | `const/ref/range` 常见；`ALL` 需结合表大小判断 |
| `possible_keys` | 优化器认为可能使用的索引 | 候选不代表最终选择 |
| `key` | 实际选择的索引 | `NULL` 表示没有使用索引访问 |
| `key_len` | 实际使用的索引前缀长度 | 可辅助判断联合索引用了几部分，不能只看数值大小 |
| `ref` | 与索引比较的常量或列 | 如 `const`、`表名.列名` |
| `rows` | 预计扫描行数 | 是估算值，不是实际值 |
| `filtered` | 预计通过本表条件的百分比 | 流向下一步约为 `rows × filtered%` |
| `Extra` | 排序、临时表、覆盖索引等信息 | 结合数据量分析 |

访问类型常见顺序：

```text
system > const > eq_ref > ref > range > index > ALL
```

这个顺序只能作为认识访问方式的参考，不能当成机械评分表。最终应关注实际扫描行数、循环次数和耗时。

### 3.3 EXPLAIN ANALYZE 重点

典型节点会包含：

```text
actual time=0.050..1.200 rows=100 loops=1
```

- 第一个时间：产生第一行前的耗时。
- 第二个时间：该节点执行完成的平均耗时。
- `rows`：每次循环实际产生的平均行数。
- `loops`：节点执行次数。

粗略判断节点总工作量时，需要把 `rows` 和 `loops` 一起看。嵌套循环内层即使单次很快，执行几十万次也可能成为瓶颈。

### 3.4 估算与实际差距很大

如果 `EXPLAIN` 预计 10 行，实际却扫描 10 万行，优化器可能因为统计信息过旧或数据分布倾斜选错计划。

```sql
-- 更新表和索引统计信息
ANALYZE TABLE orders;

-- 对分布倾斜且缺少合适索引的列建立直方图
ANALYZE TABLE orders
UPDATE HISTOGRAM ON status WITH 64 BUCKETS;

-- 删除直方图
ANALYZE TABLE orders
DROP HISTOGRAM ON status;
```

直方图帮助优化器估算数据分布，但不能替代索引。

## 4. 联合索引应该如何设计

### 4.1 从查询形状出发

假设高频接口是：

```sql
SELECT id, order_no, total_amount, create_time
FROM orders
WHERE user_id = ?
  AND status = ?
  AND create_time >= ?
ORDER BY create_time DESC
LIMIT 20;
```

可考虑：

```sql
CREATE INDEX idx_orders_user_status_time
ON orders(user_id, status, create_time DESC);
```

推导过程：

1. `user_id`、`status` 是等值条件，放在前面缩小范围。
2. `create_time` 同时承担范围和排序，放在等值列之后。
3. `id` 主键值会自动存在 InnoDB 二级索引叶子中。
4. 是否把其他查询列加入索引形成覆盖，要权衡索引宽度和写入成本。

### 4.2 范围条件后的列完全没用吗

联合索引 `(a, b, c)`：

```sql
WHERE a = 1 AND b > 10 AND c = 5
```

通常：

- `a` 和 `b` 用于确定 B+ 树扫描区间。
- `c` 通常不能继续缩小扫描区间。
- 但 `c` 仍可能通过索引下推 ICP 在索引层过滤，也可能用于覆盖索引。

所以更准确的说法是“范围条件后通常停止继续构造连续索引区间”，不是“后面的索引列彻底失效”。

### 4.3 区分度不是唯一排序标准

```sql
SELECT COUNT(DISTINCT status) / COUNT(*) FROM orders;
```

单独给 `status` 建索引通常价值有限，但 `(status, create_time)` 对“查询某状态的最近订单”可能非常有效。联合索引列顺序首先服务真实查询，再考虑区分度。

### 4.4 覆盖索引

```sql
CREATE INDEX idx_orders_user_time_amount
ON orders(user_id, create_time, total_amount);

SELECT create_time, total_amount
FROM orders
WHERE user_id = 1;
```

查询所需字段都在二级索引中，无需回到聚簇索引取整行，`Extra` 常出现 `Using index`。

覆盖索引适合高频只读接口，但索引越宽，占用空间越多，页能容纳的记录越少，写入维护成本也越高。

### 4.5 前缀索引

长字符串可考虑前缀索引：

```sql
CREATE INDEX idx_user_email_prefix
ON mall_user(email(20));
```

选择合适长度前先比较区分度：

```sql
SELECT COUNT(DISTINCT email) / COUNT(*) AS full_selectivity,
       COUNT(DISTINCT LEFT(email, 10)) / COUNT(*) AS prefix_10,
       COUNT(DISTINCT LEFT(email, 20)) / COUNT(*) AS prefix_20
FROM mall_user;
```

前缀索引节省空间，但通常不能直接覆盖完整字符串，也可能影响排序能力。

### 4.6 冗余与重复索引

已有联合索引 `(user_id, status)` 时，单列索引 `(user_id)` 往往冗余；但 `(status)` 不是它的左前缀，不能简单删除。

可以先把待删除索引设为不可见，观察业务是否退化：

```sql
ALTER TABLE orders
ALTER INDEX idx_old INVISIBLE;

-- 确认无影响后再删除
DROP INDEX idx_old ON orders;
```

不可见索引仍会被写入维护，只是不参与普通优化器选路，因此只适合灰度验证。

## 5. 索引“失效”场景的准确解释

### 5.1 索引列套函数

```sql
-- 不利于直接使用 create_time 索引定位
SELECT *
FROM orders
WHERE DATE(create_time) = '2026-09-11';

-- 改成原始列范围
SELECT *
FROM orders
WHERE create_time >= '2026-09-11 00:00:00'
  AND create_time <  '2026-09-12 00:00:00';
```

如果业务必须按表达式查询，也可以评估生成列或函数索引，但优先保持查询简单。

### 5.2 隐式类型转换

`phone` 是 `VARCHAR`：

```sql
-- 风险：数据库可能对列做数值转换
WHERE phone = 13800138000

-- 正确：参数类型与列类型一致
WHERE phone = '13800138000'
```

Java/MyBatis 中也要保证 JDBC 参数类型与数据库列类型一致。

### 5.3 LIKE

```sql
WHERE title LIKE 'Java%'   -- 通常可做前缀范围扫描
WHERE title LIKE '%Java'   -- 普通 B+ 树通常无法从左侧定位
```

包含搜索不要强行依赖普通索引，应根据场景考虑全文索引或 Elasticsearch。

### 5.4 OR

```sql
WHERE user_id = 1 OR order_no = 'A001'
```

如果两列都有合适索引，MySQL 可能使用 Index Merge；如果代价仍高，可以验证 `UNION ALL` 改写：

```sql
SELECT * FROM orders WHERE user_id = 1
UNION ALL
SELECT * FROM orders
WHERE order_no = 'A001'
  AND user_id <> 1;
```

第二段排除重复语义。是否更快必须通过执行计划和实测确认。

### 5.5 `!=`、`NOT IN`、`IS NULL`

这些条件不是语法上必然导致索引失效：

- `IS NULL`、`IS NOT NULL` 可以用于索引范围访问。
- `!=` 或 `NOT IN` 如果命中绝大多数行，优化器通常认为全表扫描更便宜。
- 最终选择取决于数据分布、返回比例和成本估算。

## 6. 高频慢 SQL 改写

### 6.1 深分页

```sql
-- 大 offset：扫描并丢弃前面的结果
SELECT id, order_no, create_time
FROM orders
ORDER BY id
LIMIT 1000000, 20;

-- 游标分页：适合继续向后翻页
SELECT id, order_no, create_time
FROM orders
WHERE id > 1000000
ORDER BY id
LIMIT 20;
```

不能改产品分页协议时，可使用延迟关联，先在窄索引中定位主键：

```sql
SELECT o.*
FROM orders o
JOIN (
    SELECT id
    FROM orders
    ORDER BY id
    LIMIT 1000000, 20
) page_ids ON page_ids.id = o.id
ORDER BY o.id;
```

延迟关联仍要扫描 offset，只是减少了前一百万行的宽行回表成本，不如游标分页彻底。

### 6.2 ORDER BY 与 filesort

```sql
SELECT id, order_no, create_time
FROM orders
WHERE user_id = 1
ORDER BY create_time DESC
LIMIT 20;
```

索引：

```sql
CREATE INDEX idx_orders_user_time
ON orders(user_id, create_time DESC);
```

只有排序方向、索引顺序、过滤方式满足条件时，才能直接按索引顺序返回。即便出现 `Using filesort`，也要先看参与排序的行数，而不是见到就改。

### 6.3 GROUP BY 与临时表

```sql
SELECT user_id, COUNT(*)
FROM orders
WHERE create_time >= '2026-09-01'
GROUP BY user_id;
```

索引设计取决于主要目标：

- `(create_time, user_id)` 更利于先过滤时间范围。
- `(user_id, create_time)` 更利于按用户有序，但可能扫描更多时间外数据。

不存在脱离数据分布和业务范围的万能列顺序。报表查询很重时，应考虑汇总表、离线计算，而不是把所有压力交给在线库。

### 6.4 JOIN

```sql
SELECT u.id, o.order_no
FROM mall_user u
JOIN orders o ON o.user_id = u.id
WHERE u.status = 1;
```

检查：

1. `u.status` 是否能尽早过滤出较小结果集。
2. `orders.user_id` 是否有索引。
3. 字段类型、长度和字符集是否一致，避免隐式转换。
4. 一对多连接是否返回了超出需要的大量行。
5. `EXPLAIN ANALYZE` 内层节点的 `loops` 是否过高。

“小表驱动大表”中的“小”应理解为**过滤后的结果集小**，不是磁盘上物理行数少。MySQL 8 还可能选择 Hash Join，因此应相信实测计划，而不是强制连接顺序。

### 6.5 IN 与 EXISTS

```sql
-- 半连接语义
SELECT u.*
FROM mall_user u
WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.user_id = u.id
);

SELECT u.*
FROM mall_user u
WHERE u.id IN (
    SELECT o.user_id FROM orders o
);
```

MySQL 8 可能把两者都改写为半连接。选择原则：

1. 先表达正确业务语义。
2. `NOT IN` 必须特别处理 NULL，反连接优先 `NOT EXISTS`。
3. 对关键 SQL 比较实际执行计划，不背“外表大用 EXISTS”这类绝对口诀。

### 6.6 COUNT

```sql
SELECT COUNT(*) FROM orders WHERE status = 'PAID';
```

- `COUNT(*)` 表达统计行数，优先使用。
- `COUNT(column)` 忽略 NULL，语义不同。
- InnoDB 没有维护事务可见的精确总行数，需要扫描可见记录或索引。
- 高频精确大表计数可以维护汇总表或异步计数，但要明确一致性要求。
- `information_schema.tables.table_rows` 是估算值，不能冒充精确业务数据。

### 6.7 批量写入

```sql
INSERT INTO order_item(order_id, course_id, quantity, unit_price)
VALUES (?, ?, ?, ?),
       (?, ?, ?, ?),
       (?, ?, ?, ?);
```

批量写能减少网络往返与解析成本，但要控制：

- 单批行数和 SQL 大小。
- 单事务持续时间。
- redo/binlog 体积。
- 锁持有时间和失败重试成本。

## 7. 事务和锁导致的“慢”

### 7.1 SQL 本身很快，但一直等锁

```sql
SHOW FULL PROCESSLIST;

SELECT *
FROM performance_schema.data_lock_waits;

SHOW ENGINE INNODB STATUS;
```

如果执行时间主要花在锁等待，加索引不一定是唯一答案，还要找出持锁事务。

### 7.2 长事务的危害

- 长时间持有行锁和 MDL，阻塞其他事务及 DDL。
- 旧版本不能及时清理，undo 历史链增长。
- 主从复制重放大事务耗时，放大延迟。
- 回滚成本高。

优化方式：缩小事务范围，不在事务内做远程调用、文件上传、复杂计算或等待用户输入。

### 7.3 更新条件没有索引

```sql
UPDATE orders
SET status = 'CLOSED'
WHERE order_no = 'A001';
```

如果 `order_no` 没有索引，InnoDB 需要扫描并对经过的索引记录加锁，效果可能接近锁住整表。更新与删除的过滤列不仅影响速度，也影响锁范围。

### 7.4 死锁不是靠无限重试解决

典型治理顺序：

1. 所有事务按一致顺序访问表和记录。
2. 为定位条件建立索引，缩小锁范围。
3. 缩短事务。
4. 捕获死锁异常后做有限次数、带退避的重试。
5. 保存死锁日志，定位业务访问顺序，而不是隐藏问题。

## 8. 表结构也决定 SQL 性能

### 8.1 字段类型

- 主外键类型必须一致，例如都使用 `BIGINT`。
- 金额使用 `DECIMAL`，不要使用浮点数。
- 状态使用能覆盖业务范围的整数或短字符串，不要滥用 `TEXT`。
- `VARCHAR` 长度不是越大越好，会影响行宽、临时表和索引长度。
- 字符集和排序规则不一致可能导致 JOIN 转换并影响索引。

### 8.2 主键

InnoDB 二级索引叶子会保存主键值，因此主键过长会放大所有二级索引。常用递增 `BIGINT` 或趋势递增的分布式 ID，避免完全随机的超长主键造成更多页分裂和空间开销。

### 8.3 范式与反范式

- 范式减少数据冗余，保证写入一致性。
- 反范式通过冗余字段或汇总表减少复杂 JOIN 和在线聚合。
- 是否冗余取决于读写比例、一致性要求和维护成本，不是“表越拆越专业”。

#### 函数依赖与 Armstrong 公理

**函数依赖** `X → Y` 表示：在一张表中，只要两行的 `X` 值相同，`Y` 值就必须相同。它描述的是**业务规则**，不是 Java 函数，也不能只凭当前几行数据恰好相同就断定依赖成立。

例如在课程信息表中，每门课程只归属一位讲师、每个讲师编号对应一位讲师时，有 `course_id → teacher_id` 和 `teacher_id → teacher_name`。

**Armstrong 公理**用于从已知函数依赖推导出必然成立的新依赖。设 `X`、`Y`、`Z` 都是字段集合：

| 公理 | 规则 | 用课程表理解 |
| --- | --- | --- |
| 自反律 | 若 `Y ⊆ X`，则 `X → Y` | `{course_id, teacher_id} → teacher_id` |
| 增广律 | 若 `X → Y`，则 `XZ → YZ` | `course_id → teacher_id`，所以 `{course_id, status} → {teacher_id, status}` |
| 传递律 | 若 `X → Y` 且 `Y → Z`，则 `X → Z` | `course_id → teacher_id → teacher_name`，所以 `course_id → teacher_name` |

这里的 `XZ` 表示把两组字段合在一起。还能从三条公理推出**合并律**（`X → Y` 且 `X → Z`，则 `X → YZ`）和**分解律**（`X → YZ`，则 `X → Y`、`X → Z`）；不需要把它们当作另外三条基本公理背诵。

**与表设计的关系**：如果把 `teacher_name` 重复存在每条课程记录里，讲师改名就要更新多行，容易产生更新异常。规范化时可拆成 `course(course_id, teacher_id, ...)` 和 `teacher(teacher_id, teacher_name, ...)`；若为了减少高频查询的 JOIN 而冗余讲师名，就是有意识地反范式设计，必须同时考虑冗余字段的更新一致性。Armstrong 公理帮助判断“哪些字段能决定哪些字段”，不是让数据库自动检查这些业务规则。

参考：[Carnegie Mellon University 数据库课程：函数依赖与 Armstrong 公理](https://www.cs.cmu.edu/~natassa/courses/15-415/S03/notes/17Norm2up.pdf)。

### 8.4 冷热数据

历史订单无限增长时，单靠索引不能解决全部问题。可以根据业务采用分区、归档表、冷热分离或分库分表，但这些属于数据生命周期设计，不能替代单条 SQL 的基本优化。

## 9. 上线前如何安全验证索引

### 9.1 先检查现有索引

```sql
SHOW CREATE TABLE orders;
SHOW INDEX FROM orders;
```

避免创建与现有索引重复或互相包含的索引。

### 9.2 比较修改前后

至少记录：

| 指标 | 修改前 | 修改后 |
| --- | --- | --- |
| 实际耗时 |  |  |
| 扫描行数 |  |  |
| 返回行数 |  |  |
| 是否回表 |  |  |
| 是否排序/临时表 |  |  |
| 写入耗时变化 |  |  |

使用相同参数、相近缓存状态和足够接近生产的数据量测试。只在空表或几十行数据上看计划没有代表性。

### 9.3 大表 DDL

```sql
ALTER TABLE orders
ADD INDEX idx_orders_user_time(user_id, create_time),
ALGORITHM=INPLACE,
LOCK=NONE;
```

MySQL 是否支持某个 `ALGORITHM/LOCK` 组合取决于版本和具体操作。大表变更要在测试环境确认，并评估 MDL、磁盘空间、复制延迟和回滚方案。生产环境还可能使用 gh-ost、pt-online-schema-change 或云数据库在线变更能力。

### 9.4 Hint 是最后手段

```sql
SELECT /*+ MAX_EXECUTION_TIME(1000) */ *
FROM orders
WHERE user_id = 1;
```

`FORCE INDEX`、连接顺序 Hint 等会把当前判断写死。数据分布变化后可能反而变慢，应先修正统计信息、SQL 和索引，只在有证据时使用 Hint。

## 10. 面试题：给你一条慢 SQL 怎么优化

可以按下面顺序回答：

1. **先确认现象**：接口耗时、调用频率、参数分布、数据量、是否稳定复现。
2. **定位 SQL**：APM、慢日志、Performance Schema/sys Schema。
3. **看执行计划**：先 `EXPLAIN`，必要时在安全环境使用 `EXPLAIN ANALYZE`。
4. **找主要成本**：扫描行数、回表、排序、临时表、JOIN 循环次数、锁等待。
5. **针对性修改**：联合/覆盖索引、谓词改写、减少返回列、游标分页、提前聚合或拆分查询。
6. **验证收益**：相同数据与参数比较实际耗时和扫描行数。
7. **评估副作用**：新增索引的写入成本、空间、锁范围、其他 SQL 执行计划和上线风险。

::: tip 💡 一句话回答
SQL 优化必须形成“定位—分析—修改—验证—回归”闭环。索引只是手段之一，最终依据是实际扫描量、耗时和业务影响，而不是是否出现某个 EXPLAIN 关键字。
:::

## 11. 一周面试复习顺序

1. 第一天：写完 [SQL 语法与面试写题](/learn_database/MySQL-SQL语法与面试写题) 中 10 道题。
2. 第二天：联合索引、最左前缀、回表、覆盖索引、ICP。
3. 第三天：会解释 `EXPLAIN` 和 `EXPLAIN ANALYZE`。
4. 第四天：深分页、JOIN、排序分组、COUNT 四类优化。
5. 第五天：事务隔离、MVCC、行锁、间隙锁、死锁。
6. 第六天：redo/undo/binlog、两阶段提交和崩溃恢复。
7. 第七天：随机抽 SQL 题手写，并用“慢 SQL 七步回答”模拟面试。

## 12. 官方参考

- [MySQL 8.4 SELECT 语法](https://dev.mysql.com/doc/refman/8.4/en/select.html)
- [MySQL 8.4 EXPLAIN 输出](https://dev.mysql.com/doc/refman/8.4/en/explain-output.html)
- [MySQL 8.4 SELECT 优化](https://dev.mysql.com/doc/refman/8.4/en/select-optimization.html)
- [MySQL 8.4 Range 与 Skip Scan](https://dev.mysql.com/doc/refman/8.4/en/range-optimization.html)
- [MySQL 8.4 sys Schema](https://dev.mysql.com/doc/refman/8.4/en/sys-schema.html)
