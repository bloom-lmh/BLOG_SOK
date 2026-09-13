# MySQL 练习数据库

[[toc]]

这套练习库与 [MySQL 总览与核心原理](/learn_database/MySQL)、[SQL 语法与面试写题](/learn_database/MySQL-SQL语法与面试写题) 和 [SQL 优化实战](/learn_database/MySQL-SQL优化实战) 配套。业务背景是课程商城，另外加入员工组织、账户和百万级日志，覆盖基础 SQL、多表查询、事务锁与性能优化。

## 1. 下载与导入

<a href="/sql/mysql-course-practice.sql" download>下载完整建库脚本（mysql-course-practice.sql）</a>

脚本会执行：

```sql
DROP DATABASE IF EXISTS mysql_course_practice;
CREATE DATABASE mysql_course_practice;
```

因此它只应当用于练习，不能把数据库名改成真实项目库。

### 1.1 在 IDEA 中导入

1. 打开右侧 **Database**，连接本机 MySQL 8.4。
2. 打开 Query Console。
3. 选择并执行下载的 `mysql-course-practice.sql`。
4. 执行完成后刷新数据源，选择 `mysql_course_practice`。

### 1.2 使用命令行导入

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p
```

连接后执行：

```sql
SOURCE E:/BLOG_SOK/public/sql/mysql-course-practice.sql;
```

标准规模约 407 万行，导入需要几分钟，期间不要中断 MySQL。电脑配置较低时，在脚本顶部把以下变量缩小 10 倍：

```sql
SET @user_rows = 10000;
SET @course_rows = 2000;
SET @order_rows = 50000;
SET @login_log_rows = 80000;
SET @access_log_rows = 100000;
```

## 2. 数据结构

| 表 | 标准行数 | 关系与用途 |
| --- | ---: | --- |
| `department` | 12 | 部门基础数据 |
| `employee` | 5,000 | 部门一对多、员工自连接、工资统计 |
| `mall_user` | 100,000 | 用户筛选、函数、分组、逻辑删除 |
| `user_profile` | 80,000 | 与用户一对一，部分用户故意没有资料 |
| `account` | 10 | 转账事务、悲观锁、乐观锁 |
| `teacher` | 2,000 | 讲师与部门关联 |
| `category` | 24 | 三级分类树、递归 CTE |
| `course` | 20,000 | 课程查询、JSON、库存和版本号 |
| `course_chapter` | 80,000 | 课程与章节一对多 |
| `tag` / `course_tag` | 20 / 60,000 | 课程与标签多对多 |
| `orders` | 500,000 | 订单状态、时间和金额分析 |
| `order_item` | 1,000,000 | 订单明细、多表关联 |
| `payment` | 约 405,000 | 订单与支付一对一 |
| `login_log` | 800,000 | 已有联合索引的日志查询 |
| `access_log` | 1,000,000 | 故意只有主键，用来做索引优化实验 |

核心关系：

```text
department 1 ── N employee
department 1 ── N teacher
mall_user  1 ── 0..1 user_profile
mall_user  1 ── N orders 1 ── N order_item N ── 1 course
teacher    1 ── N course N ── 1 category
course     1 ── N course_chapter
course     N ── N tag（通过 course_tag）
orders     1 ── 0..1 payment
```

## 3. 基础 SQL 练习

先自己写，再在 IDEA 中执行验证；不要直接用图形界面生成 SQL。

### 3.1 DDL 与 DML

1. 查看练习库的全部表，并查看 `course` 的完整建表语句。
2. 创建一张 `course_favorite` 收藏表，包含主键、用户 ID、课程 ID、创建时间和联合唯一键。
3. 给收藏表增加 `source` 字段，再修改长度，最后删除该字段。
4. 插入一位用户，同时只明确填写必要字段。
5. 批量插入三条收藏数据。
6. 把指定用户的余额增加 100，并检查受影响行数。
7. 使用事务修改数据后执行 `ROLLBACK`，验证数据恢复。
8. 对用户进行逻辑删除，不执行物理 `DELETE`。
9. 比较 `DELETE`、`TRUNCATE`、`DROP` 对测试表的影响。

### 3.2 SELECT 与函数

1. 查询成都、重庆的正常用户，按注册时间倒序取前 20 条。
2. 查询从未登录过的用户，理解 `IS NULL`。
3. 查询价格在 50~100 元之间且已上架的课程。
4. 统计用户来自多少个不同城市。
5. 将手机号展示为 `138****0000` 的脱敏形式。
6. 使用 `CASE` 把课程状态转换为中文。
7. 分别使用 `CHAR_LENGTH()` 和 `LENGTH()` 查看中文名称的字符数与字节数。
8. 查询最近 30 天创建的订单，不要对 `create_time` 使用函数。
9. 按月份统计支付订单数量和金额。
10. 从 `course.attributes` 中提取 `language`、`certificate` 和 `hours`。
11. 将课程价格按四舍五入保留一位小数，再比较 `ROUND` 与 `TRUNCATE`。
12. 使用 `COALESCE` 给没有真实姓名的用户提供默认展示名称。

## 4. JOIN、子查询与聚合练习

1. 查询课程名称、讲师名称和分类名称。
2. 查询所有用户及其扩展资料，必须保留没有 `user_profile` 的用户。
3. 查询每门课程的章节数量和总时长。
4. 查询每门课程的全部标签，使用 `GROUP_CONCAT` 合并显示。
5. 查询员工及其直属领导名称，这是一次自连接。
6. 统计每个部门的人数、平均工资、最高工资和最低工资。
7. 查询工资高于全公司平均工资的员工。
8. 查询每个部门工资最高的员工，考虑最高工资并列。
9. 查询从未下单的用户，分别尝试 `NOT EXISTS` 和 `LEFT JOIN ... IS NULL`。
10. 查询购买过 MySQL 课程的用户，结果去重。
11. 查询至少购买过两门不同课程的用户。
12. 查询总消费超过 2000 元的用户，只统计 `PAID`、`FINISHED` 订单。
13. 查询销量高于本分类平均销量的课程。
14. 查询没有任何章节的课程。
15. 统计每个地区各订单状态的数量，使用条件聚合一次完成。

## 5. CTE 与窗口函数练习

1. 使用递归 CTE 查询“编程开发”下的全部子分类。
2. 查询每个分类销量最高的 3 门课程，使用 `ROW_NUMBER()`。
3. 比较 `ROW_NUMBER()`、`RANK()`、`DENSE_RANK()` 在并列销量下的结果。
4. 查询每个用户最近一笔订单。
5. 查询每天销售额以及从第一天开始的累计销售额。
6. 使用 `LAG()` 计算每日销售额相对前一天的增减。
7. 计算用户相邻两次登录之间的时间间隔。
8. 先用 CTE 汇总用户消费，再筛选消费排名前 100 的用户。

## 6. 事务与锁练习

这些练习需要打开两个 Query Console，分别当作事务 A、事务 B。

### 6.1 转账事务

实现账户 1 向账户 2 转账 100：

1. 开启事务。
2. 使用条件更新扣款，保证余额不能为负。
3. 检查影响行数，再给另一账户加款。
4. 全部成功才提交，否则回滚。

### 6.2 悲观锁

事务 A 执行：

```sql
START TRANSACTION;
SELECT * FROM account WHERE id = 1 FOR UPDATE;
```

事务 B 修改同一账户，观察阻塞；随后让事务 A `COMMIT`，观察事务 B 继续执行。

### 6.3 乐观锁与库存

使用课程的 `version` 字段完成条件更新：

```sql
UPDATE course
SET stock = stock - 1,
    version = version + 1
WHERE id = ?
  AND stock > 0
  AND version = ?;
```

通过受影响行数判断更新是否成功。思考为什么 `stock > 0` 解决超卖，而 `version` 解决并发覆盖。

### 6.4 隔离级别

用两个会话分别验证：

- READ COMMITTED 下两次快照读看到什么。
- REPEATABLE READ 下两次快照读看到什么。
- 普通 `SELECT` 与 `SELECT ... FOR UPDATE` 的区别。
- 长事务为什么会阻塞 DDL。

### 6.5 长事务与锁等待

在两个 Query Console 中复用 6.2 的 `SELECT ... FOR UPDATE`：让事务 A 暂不提交，观察事务 B 的 `UPDATE account` 等待；随后让 A 提交、B 回滚。再缩短 A 的事务持续时间重复一次，对比等待时间。说清楚：事务不提交时锁为什么不能释放，以及为什么不应在事务里等待远程接口。

## 7. SQL 优化实战

`access_log` 故意只创建主键。每次优化必须遵守：

```text
记录原 SQL 和参数
→ EXPLAIN / EXPLAIN ANALYZE
→ 记录扫描行数与耗时
→ 修改 SQL 或索引
→ 再次测量
→ 说明写入成本
```

### 7.1 单列索引与联合索引

1. 查询 `/api/orders` 在指定一天内的 500 错误，记录优化前计划。
2. 分别尝试单列索引和 `(path, http_status, created_at)` 联合索引。
3. 比较索引顺序不同对 `key_len`、扫描行数和排序的影响。
4. 删除低收益或重复索引，只保留最终方案。

### 7.2 索引失效

依次比较下面查询的执行计划：

```sql
-- 对索引列使用函数
WHERE DATE(created_at) = '2026-08-01'

-- 改写为左闭右开范围
WHERE created_at >= '2026-08-01'
  AND created_at <  '2026-08-02'

-- 前置模糊与后置模糊
WHERE path LIKE '%orders'
WHERE path LIKE '/api/order%'
```

再使用 `mall_user.phone` 比较字符串参数与数字参数，观察隐式类型转换是否影响索引。

### 7.3 覆盖索引与回表

1. 为 `(path, http_status, created_at)` 建立联合索引。
2. 比较查询索引内字段与 `SELECT *` 的执行计划。
3. 观察 `Extra` 中 `Using index`、`Using index condition` 的区别。
4. 判断是否值得为了覆盖查询把 `cost_ms` 加入索引。

### 7.4 深分页

比较：

```sql
SELECT * FROM access_log ORDER BY id LIMIT 800000, 20;

-- @last_id 必须是上一页最后一条记录的实际 id，不是页码或 OFFSET
SELECT * FROM access_log
WHERE id > @last_id
ORDER BY id
LIMIT 20;
```

先从上一页结果中取出最后一条的 `id`，赋给 `@last_id` 后再执行第二条 SQL。再写一次“先查 ID、再延迟关联回表”的分页方案，并说明游标分页为什么不能随意跳到第 1000 页。

### 7.5 排序、分组和统计

1. 查询某路径最近的 100 条日志，设计能同时服务过滤和排序的索引。
2. 按 `path` 统计调用次数和平均耗时，观察是否出现临时表或额外排序。
3. 查询最慢的 20 次请求，判断 `cost_ms` 单列索引是否值得创建。
4. 比较 `COUNT(*)`、`COUNT(user_id)` 的结果和含义。
5. 使用 `orders` 比较已有 `(status, create_time)` 索引与不符合最左前缀的查询。

### 7.6 写入代价

1. 记录 `access_log` 当前索引数量。
2. 用不同 ID 范围分别执行单条 `INSERT` 和多值 `INSERT`，比较同样行数的耗时；控制每批大小。
3. 创建多个实验索引后批量插入 10 万行，记录耗时。
4. 删除无用索引后重复测试。
5. 总结为什么索引能加速读取，却会增加空间、页分裂和写入维护成本。

### 7.7 JOIN 优化

用 `mall_user` JOIN `orders` 查询禁用用户的订单：先比较 `u.status = 0` 与 `u.status = 1` 的过滤后行数；再用 `EXPLAIN ANALYZE` 观察 JOIN 顺序、扫描行数与循环次数。确认 `orders.user_id` 的索引是否被使用，并解释为什么“物理表小”不等于“过滤后参与 JOIN 的结果集小”。

### 7.8 `IN` 与 `EXISTS`

分别用 `IN`、`EXISTS` 查询“至少有一笔已支付订单的用户”，先核对两种写法的结果，再比较执行计划；额外构造含 `NULL` 的子查询，观察 `NOT IN` 与 `NOT EXISTS` 的差异。不要只凭 SQL 写法断定谁更快。

### 7.9 大表在线 DDL

仅在练习库的百万行 `access_log` 上尝试添加 `user_id` 索引：先估算表大小、检查已有索引，再测试 MySQL 原生 `ALGORITHM=INPLACE, LOCK=NONE` 是否可用，并观察执行时间和会话状态。在线 DDL 仍可能短暂等待元数据锁；了解 `gh-ost`、`pt-online-schema-change` 的适用场景即可，不要求在本机安装。实验后删除新建的索引。

## 8. 使用建议

- 做基础 SQL 时主要使用 `mall_user`、`employee`、`course` 和 `orders`。
- 做 JOIN 时先画出结果粒度和表关系，再写 `FROM/JOIN`。
- 做优化时主要使用 `access_log`，不要一开始就把索引全部加好。
- 每次优化保留“优化前 SQL、执行计划、改动、优化后结果”四项证据。
- 写完 SQL 可以直接发给我，我按面试官方式只检查语义、边界和执行计划，不先给答案。
