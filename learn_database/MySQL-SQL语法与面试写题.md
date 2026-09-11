# MySQL SQL 语法与面试写题

[[toc]]

这篇只解决一件事：**看到业务题目，能够稳定地把它翻译成正确 SQL**。建议先遮住答案手写，再用样例数据验证边界条件。

配套数据：[MySQL 练习数据库](/learn_database/MySQL-练习数据库)。导入后可直接使用课程商城、员工、订单和日志数据验证本篇 SQL。

## 1. 写 SQL 的固定步骤

拿到题目先不要急着写 `SELECT`，依次回答五个问题：

1. **结果粒度是什么**：一行代表用户、订单、课程，还是“用户 + 日期”？
2. **数据来自哪些表**：确定主表以及表之间是一对一还是一对多。
3. **先过滤什么**：时间、状态、逻辑删除等明细条件放 `WHERE` 或 `ON`。
4. **是否需要聚合或排名**：聚合用 `GROUP BY`，保留明细并排名用窗口函数。
5. **最终输出什么**：只选择需要的列，最后再排序、分页。

全文使用这些简化表：

| 表 | 关键字段 |
| --- | --- |
| `mall_user` | `id, username, status, create_time` |
| `course` | `id, category_id, teacher_id, title, price, stock, status` |
| `orders` | `id, user_id, order_no, total_amount, status, pay_time, create_time` |
| `order_item` | `id, order_id, course_id, quantity, unit_price` |
| `login_log` | `id, user_id, login_time` |
| `department` | `id, name` |
| `employee` | `id, dept_id, name, salary` |

## 2. SELECT 与逻辑执行顺序

### 2.1 完整骨架

```sql
SELECT DISTINCT select_list
FROM table_source
JOIN other_table ON join_condition
WHERE row_condition
GROUP BY group_columns
HAVING group_condition
ORDER BY sort_columns
LIMIT offset, page_size;
```

SQL 的主要逻辑执行顺序是：

```text
FROM / JOIN
→ ON
→ WHERE
→ GROUP BY
→ HAVING
→ SELECT
→ DISTINCT
→ ORDER BY
→ LIMIT
```

这能解释为什么同层 `WHERE` 通常不能使用 `SELECT` 刚定义的别名：执行 `WHERE` 时别名还没生成。

```sql
-- 错误：WHERE 执行时 total 尚不存在
SELECT quantity * unit_price AS total
FROM order_item
WHERE total > 100;

-- 正确：重复表达式，或者放到子查询/CTE 后再过滤
SELECT quantity * unit_price AS total
FROM order_item
WHERE quantity * unit_price > 100;
```

### 2.2 WHERE 常用条件

```sql
-- 比较与范围
SELECT * FROM course WHERE price >= 99 AND price < 199;
SELECT * FROM course WHERE price BETWEEN 99 AND 199; -- 两端都包含

-- 集合
SELECT * FROM orders WHERE status IN ('PAID', 'FINISHED');

-- 前缀匹配通常可以使用 B+ 树索引
SELECT * FROM course WHERE title LIKE 'Java%';

-- NULL 不能使用 = 或 != 判断
SELECT * FROM orders WHERE pay_time IS NULL;
SELECT * FROM orders WHERE pay_time IS NOT NULL;
```

SQL 使用三值逻辑：`TRUE / FALSE / UNKNOWN`。任何值与 `NULL` 做普通比较，结果通常都是 `UNKNOWN`。

```sql
-- 错误
WHERE pay_time = NULL

-- 正确
WHERE pay_time IS NULL
```

### 2.3 AND 与 OR 的优先级

`AND` 优先于 `OR`，复杂条件必须主动加括号：

```sql
-- 要求：已支付或已完成，并且金额大于 100
SELECT *
FROM orders
WHERE status IN ('PAID', 'FINISHED')
  AND total_amount > 100;

-- 等价的显式写法
WHERE (status = 'PAID' OR status = 'FINISHED')
  AND total_amount > 100;
```

### 2.4 时间范围使用左闭右开

不要对时间列套 `DATE()`，也不要手写一天最后一毫秒：

```sql
-- 推荐：能自然包含全天，也便于使用 create_time 索引
SELECT *
FROM orders
WHERE create_time >= '2026-09-01 00:00:00'
  AND create_time <  '2026-09-02 00:00:00';

-- 不推荐：对索引列使用函数
WHERE DATE(create_time) = '2026-09-01';
```

## 3. CASE WHEN：SQL 中的条件表达式

### 3.1 把状态码转成文字

```sql
SELECT order_no,
       CASE status
           WHEN 'UNPAID' THEN '待支付'
           WHEN 'PAID' THEN '已支付'
           WHEN 'FINISHED' THEN '已完成'
           ELSE '未知状态'
       END AS status_name
FROM orders;
```

### 3.2 条件聚合

一次扫描同时统计多个状态：

```sql
SELECT user_id,
       COUNT(*) AS order_count,
       SUM(status = 'PAID') AS paid_count,
       SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) AS paid_amount
FROM orders
GROUP BY user_id;
```

在 MySQL 中布尔表达式 `status = 'PAID'` 可以按 `1/0` 求和；面试中写标准 `CASE WHEN` 可读性更通用。

## 4. 聚合与 GROUP BY

### 4.1 常用聚合函数

| 函数 | 含义 | NULL 行为 |
| --- | --- | --- |
| `COUNT(*)` | 统计行数 | 统计所有行 |
| `COUNT(column)` | 统计列值数量 | 忽略 NULL |
| `SUM(column)` | 求和 | 忽略 NULL |
| `AVG(column)` | 平均值 | 忽略 NULL |
| `MAX/MIN` | 最大/最小值 | 忽略 NULL |

```sql
SELECT user_id,
       COUNT(*) AS order_count,
       COUNT(pay_time) AS paid_time_not_null_count,
       COALESCE(SUM(total_amount), 0) AS total_amount
FROM orders
GROUP BY user_id;
```

`SUM()` 没有可计算行时可能返回 `NULL`，接口需要数字时可用 `COALESCE(value, 0)`。

### 4.2 WHERE 与 HAVING

```sql
-- 查询 2026 年支付订单总额超过 1000 的用户
SELECT user_id, SUM(total_amount) AS paid_amount
FROM orders
WHERE status = 'PAID'
  AND pay_time >= '2026-01-01'
  AND pay_time <  '2027-01-01'
GROUP BY user_id
HAVING SUM(total_amount) > 1000;
```

- `WHERE`：分组前过滤明细行，应尽量提前过滤。
- `HAVING`：分组后过滤聚合结果。

### 4.3 ONLY_FULL_GROUP_BY

MySQL 8 默认要求：没有参与聚合的选择列，应当出现在 `GROUP BY` 中或能由分组列唯一确定。

```sql
-- 有歧义：一个 user_id 有很多订单，MySQL 不知道返回哪个 order_no
SELECT user_id, order_no, COUNT(*)
FROM orders
GROUP BY user_id;

-- 正确：结果粒度明确为用户
SELECT user_id, COUNT(*) AS order_count
FROM orders
GROUP BY user_id;
```

不要通过关闭 `ONLY_FULL_GROUP_BY` 掩盖结果不确定的问题。

## 5. JOIN：面试最容易写错的部分

### 5.1 INNER JOIN 与 LEFT JOIN

```sql
-- 只保留有订单的用户
SELECT u.id, u.username, o.order_no
FROM mall_user u
JOIN orders o ON o.user_id = u.id;

-- 保留所有用户，没有订单时右表字段为 NULL
SELECT u.id, u.username, o.order_no
FROM mall_user u
LEFT JOIN orders o ON o.user_id = u.id;
```

### 5.2 LEFT JOIN 条件放 ON 还是 WHERE

需求：查询所有用户以及各自已支付订单。

```sql
-- 正确：右表条件放 ON，没有已支付订单的用户仍会保留
SELECT u.id, u.username, o.order_no
FROM mall_user u
LEFT JOIN orders o
       ON o.user_id = u.id
      AND o.status = 'PAID';

-- 容易写错：WHERE 排除了 o 为 NULL 的行，LEFT JOIN 退化成 INNER JOIN
SELECT u.id, u.username, o.order_no
FROM mall_user u
LEFT JOIN orders o ON o.user_id = u.id
WHERE o.status = 'PAID';
```

记忆：

- `ON` 决定右表哪些行参与匹配。
- `WHERE` 对连接完成后的结果再次过滤。

### 5.3 一对多 JOIN 为什么产生重复行

一个订单有三个订单项，连接后订单自然出现三行。这不是数据库重复，而是结果粒度变成了“订单项”。

```sql
SELECT o.id, o.order_no, i.course_id
FROM orders o
JOIN order_item i ON i.order_id = o.id;
```

如果结果必须“一行一个订单”，应先聚合订单项：

```sql
SELECT o.id,
       o.order_no,
       COUNT(i.id) AS item_count,
       SUM(i.quantity * i.unit_price) AS item_amount
FROM orders o
JOIN order_item i ON i.order_id = o.id
GROUP BY o.id, o.order_no;
```

不要一看到重复就使用 `DISTINCT`，先确认自己需要的结果粒度。

### 5.4 半连接与反连接

只关心“有没有”，优先考虑 `EXISTS / NOT EXISTS`，不要 JOIN 后再去重。

```sql
-- 有已支付订单的用户
SELECT u.id, u.username
FROM mall_user u
WHERE EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.user_id = u.id
      AND o.status = 'PAID'
);

-- 从未下单的用户
SELECT u.id, u.username
FROM mall_user u
WHERE NOT EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.user_id = u.id
);
```

`NOT IN` 的子查询只要返回一个 `NULL`，整体判断就可能变为 `UNKNOWN`。反连接优先写 `NOT EXISTS`。

## 6. 子查询

### 6.1 标量子查询

子查询只返回一行一列：

```sql
SELECT *
FROM employee
WHERE salary > (SELECT AVG(salary) FROM employee);
```

### 6.2 派生表

子查询先形成临时结果，再由外层查询：

```sql
SELECT t.user_id, t.paid_amount
FROM (
    SELECT user_id, SUM(total_amount) AS paid_amount
    FROM orders
    WHERE status = 'PAID'
    GROUP BY user_id
) t
WHERE t.paid_amount > 1000;
```

### 6.3 相关子查询

内层引用外层当前行：

```sql
SELECT u.id, u.username
FROM mall_user u
WHERE EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.user_id = u.id
);
```

逻辑上像“外层每行询问一次内层”，但 MySQL 8 优化器可能把它改写为半连接，因此不要仅凭 SQL 外形判断性能，要看执行计划。

## 7. CTE：拆解复杂 SQL

CTE 使用 `WITH` 给中间结果命名，主要价值是可读性和复用，不保证一定物化或只执行一次。

```sql
WITH paid_stat AS (
    SELECT user_id,
           COUNT(*) AS order_count,
           SUM(total_amount) AS paid_amount
    FROM orders
    WHERE status = 'PAID'
    GROUP BY user_id
)
SELECT u.id, u.username, p.order_count, p.paid_amount
FROM mall_user u
JOIN paid_stat p ON p.user_id = u.id
WHERE p.paid_amount > 1000;
```

递归 CTE 适合分类树、菜单树和组织架构：

```sql
WITH RECURSIVE category_tree AS (
    SELECT id, parent_id, name, 1 AS level
    FROM category
    WHERE id = 1

    UNION ALL

    SELECT c.id, c.parent_id, c.name, t.level + 1
    FROM category c
    JOIN category_tree t ON c.parent_id = t.id
    WHERE t.level < 10
)
SELECT * FROM category_tree;
```

生产代码要限制最大层数，并保证数据中没有循环父子关系。

## 8. 窗口函数：保留明细同时统计或排名

`GROUP BY` 会把多行压成一行；窗口函数不会压缩明细行。

### 8.1 排名函数区别

假设工资为 `100, 100, 90`：

| 函数 | 排名结果 | 特点 |
| --- | --- | --- |
| `ROW_NUMBER()` | `1, 2, 3` | 每行编号唯一 |
| `RANK()` | `1, 1, 3` | 并列后跳号 |
| `DENSE_RANK()` | `1, 1, 2` | 并列后不跳号 |

```sql
SELECT id,
       dept_id,
       name,
       salary,
       DENSE_RANK() OVER (
           PARTITION BY dept_id
           ORDER BY salary DESC
       ) AS salary_rank
FROM employee;
```

### 8.2 每组前 N 名

窗口函数结果不能直接在同层 `WHERE` 使用，需要套 CTE 或子查询：

```sql
WITH ranked AS (
    SELECT e.*,
           DENSE_RANK() OVER (
               PARTITION BY dept_id
               ORDER BY salary DESC
           ) AS rn
    FROM employee e
)
SELECT *
FROM ranked
WHERE rn <= 3;
```

### 8.3 累计值

```sql
WITH daily AS (
    SELECT DATE(pay_time) AS pay_date,
           SUM(total_amount) AS daily_amount
    FROM orders
    WHERE status = 'PAID'
    GROUP BY DATE(pay_time)
)
SELECT pay_date,
       daily_amount,
       SUM(daily_amount) OVER (
           ORDER BY pay_date
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
       ) AS cumulative_amount
FROM daily;
```

### 8.4 前一行与后一行

```sql
SELECT user_id,
       login_time,
       LAG(login_time) OVER (
           PARTITION BY user_id
           ORDER BY login_time
       ) AS previous_login_time
FROM login_log;
```

`LAG/LEAD` 常用于环比、相邻记录差值和连续行为判断。

## 9. INSERT、UPDATE、DELETE 实战

### 9.1 批量插入

```sql
INSERT INTO course (title, price, stock, status)
VALUES ('Java 基础', 99.00, 100, 1),
       ('MySQL 实战', 129.00, 80, 1);
```

批量插入能减少网络往返和 SQL 解析次数，但单批不能无限大，应控制事务和请求体大小。

### 9.2 Upsert

假设 `course_stock.course_id` 有唯一索引：

```sql
INSERT INTO course_stock (course_id, stock)
VALUES (1, 100) AS new
ON DUPLICATE KEY UPDATE stock = new.stock;
```

没有唯一键冲突就插入，有冲突就更新。是否适合业务要看“覆盖旧值”是否符合并发语义。

### 9.3 防止库存超卖的原子 SQL

```sql
UPDATE course
SET stock = stock - 1
WHERE id = 1
  AND stock > 0;
```

应用必须检查影响行数：

```text
影响 1 行：扣减成功
影响 0 行：课程不存在或库存不足
```

条件判断和扣减在同一条 SQL 中完成，比“先 SELECT 再 UPDATE”更安全。

### 9.4 JOIN UPDATE

```sql
UPDATE course c
JOIN teacher t ON t.id = c.teacher_id
SET c.status = 0
WHERE t.status = 0;
```

执行批量更新前先把相同的 `FROM/JOIN/WHERE` 改写成 `SELECT`，确认影响范围。

### 9.5 删除重复数据，保留最小 id

```sql
DELETE u1
FROM mall_user u1
JOIN mall_user u2
  ON u1.username = u2.username
 AND u1.id > u2.id;
```

删除完成后应补唯一索引，从结构上阻止重复再次出现：

```sql
ALTER TABLE mall_user
ADD UNIQUE KEY uk_username (username);
```

## 10. 高频面试 SQL

### 10.1 查询从未下单的用户

```sql
SELECT u.id, u.username
FROM mall_user u
WHERE NOT EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.user_id = u.id
);
```

### 10.2 查询每个用户最新一笔订单

```sql
WITH ranked AS (
    SELECT o.*,
           ROW_NUMBER() OVER (
               PARTITION BY user_id
               ORDER BY create_time DESC, id DESC
           ) AS rn
    FROM orders o
)
SELECT *
FROM ranked
WHERE rn = 1;
```

排序最后补 `id DESC`，避免两笔订单时间相同时结果不稳定。

### 10.3 查询第二高工资

```sql
WITH ranked AS (
    SELECT salary,
           DENSE_RANK() OVER (ORDER BY salary DESC) AS rn
    FROM employee
)
SELECT DISTINCT salary
FROM ranked
WHERE rn = 2;
```

用 `DENSE_RANK` 表示“第二个不同的工资值”；如果题目要第二行，应使用 `ROW_NUMBER`，必须先问清语义。

### 10.4 查询每个部门工资前三名

```sql
WITH ranked AS (
    SELECT e.*,
           DENSE_RANK() OVER (
               PARTITION BY dept_id
               ORDER BY salary DESC
           ) AS rn
    FROM employee e
)
SELECT d.name AS department_name,
       r.name AS employee_name,
       r.salary,
       r.rn
FROM ranked r
JOIN department d ON d.id = r.dept_id
WHERE r.rn <= 3
ORDER BY d.id, r.rn, r.id;
```

### 10.5 查找重复用户名

```sql
SELECT username, COUNT(*) AS duplicate_count
FROM mall_user
GROUP BY username
HAVING COUNT(*) > 1;
```

### 10.6 按天统计支付指标

```sql
SELECT DATE(pay_time) AS pay_date,
       COUNT(*) AS paid_order_count,
       COUNT(DISTINCT user_id) AS paid_user_count,
       SUM(total_amount) AS paid_amount,
       AVG(total_amount) AS avg_order_amount
FROM orders
WHERE status = 'PAID'
  AND pay_time >= '2026-09-01'
  AND pay_time <  '2026-10-01'
GROUP BY DATE(pay_time)
ORDER BY pay_date;
```

过滤条件不对 `pay_time` 做函数，只有分组表达式使用 `DATE(pay_time)`。

### 10.7 查询连续登录至少三天的用户

```sql
WITH login_days AS (
    SELECT DISTINCT user_id, DATE(login_time) AS login_date
    FROM login_log
),
numbered AS (
    SELECT user_id,
           login_date,
           ROW_NUMBER() OVER (
               PARTITION BY user_id
               ORDER BY login_date
           ) AS rn
    FROM login_days
),
grouped AS (
    SELECT user_id,
           login_date,
           DATE_SUB(login_date, INTERVAL rn DAY) AS continuous_group
    FROM numbered
)
SELECT user_id,
       MIN(login_date) AS start_date,
       MAX(login_date) AS end_date,
       COUNT(*) AS continuous_days
FROM grouped
GROUP BY user_id, continuous_group
HAVING COUNT(*) >= 3;
```

原理：连续日期分别减去连续行号后，会得到相同日期，从而被分到同一组。

### 10.8 查询销量最高的三门课程

```sql
SELECT c.id,
       c.title,
       SUM(i.quantity) AS sales
FROM course c
JOIN order_item i ON i.course_id = c.id
JOIN orders o
  ON o.id = i.order_id
 AND o.status IN ('PAID', 'FINISHED')
GROUP BY c.id, c.title
ORDER BY sales DESC, c.id
LIMIT 3;
```

支付状态写在订单连接条件中，避免把未支付订单算入销量。

### 10.9 查询高于所在部门平均工资的员工

```sql
SELECT e.id, e.name, e.salary, e.dept_id
FROM employee e
JOIN (
    SELECT dept_id, AVG(salary) AS avg_salary
    FROM employee
    GROUP BY dept_id
) d ON d.dept_id = e.dept_id
WHERE e.salary > d.avg_salary;
```

也可以使用窗口函数：

```sql
WITH salary_stat AS (
    SELECT e.*,
           AVG(salary) OVER (PARTITION BY dept_id) AS avg_salary
    FROM employee e
)
SELECT *
FROM salary_stat
WHERE salary > avg_salary;
```

### 10.10 稳定的游标分页

仅按创建时间可能重复，使用 `(create_time, id)` 作为稳定游标：

```sql
SELECT id, order_no, create_time
FROM orders
WHERE (create_time, id) < ('2026-09-11 10:00:00', 5000)
ORDER BY create_time DESC, id DESC
LIMIT 20;
```

对应索引：

```sql
CREATE INDEX idx_orders_created_id
ON orders(create_time DESC, id DESC);
```

## 11. 写完 SQL 后的检查清单

1. 一行结果代表什么，是否因一对多 JOIN 意外放大？
2. `LEFT JOIN` 的右表条件是否错误地写进 `WHERE`？
3. `NULL` 是否使用 `IS NULL`，反连接是否避开了 `NOT IN + NULL`？
4. 时间范围是否左闭右开，是否避免在索引列上套函数？
5. 聚合列与非聚合列是否符合 `ONLY_FULL_GROUP_BY`？
6. 排名遇到并列时，应使用 `ROW_NUMBER`、`RANK` 还是 `DENSE_RANK`？
7. `ORDER BY` 是否有唯一列兜底，分页结果是否稳定？
8. 更新和删除是否有明确条件，并提前用 SELECT 验证范围？
9. 扣库存、抢名额等并发操作是否写成带条件的原子 SQL？
10. SQL 正确后，再使用 `EXPLAIN ANALYZE` 验证性能，不靠口诀猜测。

::: tip 💡 面试回答：现场 SQL 不会一步写完怎么办？
先说清结果粒度和表关系，写出最小可运行的 `FROM/JOIN/WHERE`，再逐层添加聚合、窗口和排序。面试官通常更看重边界条件、推导过程和结果正确性，而不是一次默写出最终答案。
:::

## 12. 下一步

SQL 能得到正确结果后，再进入 [MySQL SQL 优化实战](/learn_database/MySQL-SQL优化实战)，学习如何用慢日志与执行计划证明它是否高效。
