# MySQL

一句话定位：MySQL 是互联网行业最主流的关系型数据库（RDBMS），用 SQL 把结构化数据组织成二维表来存储，解决「数据持久化 + 强一致性 + 复杂关联查询 + 高并发读写」的问题，是绝大多数后端系统的默认存储底座。

## 目录

- [基础篇](#基础篇)：逻辑架构、存储引擎、数据类型、SQL 体系、索引、事务与隔离级别
- [高级篇](#高级篇)：SQL 优化、EXPLAIN 执行计划、三大日志与两阶段提交、MVCC、锁体系、主从复制、高可用架构
- [原理篇](#原理篇)：InnoDB 存储结构、页与行格式字节级布局、Buffer Pool、崩溃恢复、事务实现原理
- [面试常问](#面试常问)
- [相关知识](#相关知识)

---

## 基础篇

### 1. 认识 MySQL 与整体架构

**背景**：一个系统从「内存里临时放数据」到「数据不能丢、能被并发读写、能查出关联结果」，就必须有一个可靠的存储组件。MySQL 凭借开源免费、稳定、生态完善（配套主从复制、分库分表、各种中间件），成了事实上的行业标准。

**定义**：MySQL 是一个 C/S 架构的关系型数据库管理系统（RDBMS），客户端通过 SQL 和它通信，服务端负责解析、优化、执行并把数据落到磁盘。

**MySQL 的逻辑架构（一条 SQL 的完整旅程）**

MySQL 采用「Server 层 + 存储引擎层」的分层设计，这也是理解它几乎所有高级特性的出发点：

```text
┌─────────────────────────── 客户端 ───────────────────────────┐
│  JDBC / mysql-cli / Navicat ...                              │
└─────────────────────────────┬─────────────────────────────────┘
                              ▼
┌─────────────────────────── Server 层（跨引擎通用）────────────┐
│  ① 连接器     —— 建立连接、身份认证、权限校验                 │
│  ② 查询缓存   —— MySQL 8.0 已移除（命中率低、失效频繁）        │
│  ③ 分析器     —— 词法分析 + 语法分析，生成「解析树」           │
│  ④ 优化器     —— 选索引、定 join 顺序，生成「执行计划」         │
│  ⑤ 执行器     —— 调引擎接口执行，返回结果                     │
├───────────────────────────────────────────────────────────────┤
│  内置工具：binlog、线程池、缓存、函数、存储过程 ...             │
└─────────────────────────────┬─────────────────────────────────┘
                              ▼
┌─────────────────────── 存储引擎层（可插拔）───────────────────┐
│  InnoDB（默认） / MyISAM / Memory / CSV / Archive ...          │
│  真正负责：数据落盘、索引组织、事务、锁、崩溃恢复                │
└───────────────────────────────────────────────────────────────┘
```

**每个环节做了什么（面试常考「一条 update 语句的执行过程」）**：

| 环节 | 职责 | 关键点 |
| --- | --- | --- |
| 连接器 | 管理连接、鉴权 | `wait_timeout`（默认 8h）空闲断开；用「连接池」复用避免频繁建连 |
| 分析器 | 词法/语法分析 | 表名、列名不存在会在此报错 |
| 优化器 | 决定「怎么查」 | 选哪个索引、多表 join 谁驱动谁，可用 `EXPLAIN` 看结果 |
| 执行器 | 调用引擎接口 | 先查权限，再逐行扫描/走索引 |

**一条 `UPDATE` 语句的完整执行过程（面试高频）**：

```text
UPDATE user SET name = '张三' WHERE id = 1;

① 连接器：建立连接、校验账号密码和权限
② 分析器：词法分析识别 UPDATE、表名 user、列 name/id；语法分析生成解析树
③ 优化器：决定用主键索引 id 定位这一行（而不是全表扫描）
④ 执行器：调 InnoDB 接口，按 id=1 找到这一行并更新
   └─ InnoDB 内部：写 undo log（旧值）→ 改内存 → 写 redo log（prepare）
⑤ 提交：写 binlog → redo log 置为 commit（两阶段提交，详见高级篇）
```

**小结**：分层带来的好处是「Server 层一套逻辑 + 引擎层可插拔」。后续讲的 redo log、锁、MVCC 都是 InnoDB 引擎层的，而 binlog 是 Server 层的——记住这个分层，三大日志的区别就顺理成章了。

---

### 2. 存储引擎：InnoDB vs MyISAM

**背景**：既然存储引擎是插件式的，不同引擎的取舍就成了第一道选择题。生产环境 99% 用 InnoDB，但面试一定要能讲清楚「为什么」。

**InnoDB 的核心特性**：

- 支持事务（ACID），用 redo log + undo log 支撑。
- 支持行级锁，并发能力远强于 MyISAM 的表锁。
- 支持外键约束。
- 崩溃恢复能力强：WAL + 双写缓冲（doublewrite）+ redo log。
- 索引组织表：主键索引的叶子节点直接存整行数据（聚簇索引）。
- 支持 MVCC，读写不互斥。

**MyISAM 的特点（为什么逐渐被淘汰）**：

- 不支持事务、不支持外键、只有表级锁。
- 查询性能在纯读场景曾优于 InnoDB（索引与数据分离、无 MVCC 开销）。
- 不支持崩溃自动恢复，宕机可能丢数据。
- 适合：只读报表、历史归档等几乎无写入的冷数据。

| 对比项 | InnoDB（默认） | MyISAM |
| --- | --- | --- |
| 事务 | ✅ 支持 | ❌ 不支持 |
| 行级锁 | ✅ 支持 | ❌ 仅表锁 |
| 外键 | ✅ 支持 | ❌ 不支持 |
| 崩溃恢复 | ✅ redo log + doublewrite | ❌ 依赖修复，易丢数据 |
| 索引组织 | 聚簇索引（数据即索引） | 非聚簇（索引与数据分离） |
| 全文索引 | 5.6 后支持 | 原生支持 |
| 数据存储 | `.ibd`（表空间） | `.MYD`（数据）+ `.MYI`（索引） |
| 缓存机制 | Buffer Pool 缓存数据与索引 | 只有索引缓存（key cache） |
| 行数统计 | 需 `COUNT(*)` 扫描 | 表里存了行数，直接返回 |
| 适用场景 | 高并发、需事务的生产库 | 只读、归档 |

::: tip 💡 面试题：InnoDB 和 MyISAM 的区别？
一句话结论：InnoDB 支持事务、行级锁和崩溃恢复，是生产默认引擎；MyISAM 只有表锁且无事务，只适合只读场景。原因：InnoDB 靠 redo log 保证崩溃不丢数据、靠行锁支撑高并发，MyISAM 追求极致读性能但牺牲了安全与并发。
:::

**如何指定 / 查看引擎**：

```sql
-- 建表时指定引擎
CREATE TABLE t (id INT PRIMARY KEY) ENGINE = InnoDB;

-- 查看表使用的引擎
SHOW TABLE STATUS LIKE 't';

-- 查看当前库支持的引擎
SHOW ENGINES;
```

---

### 3. 数据类型

**背景**：选对数据类型不只是「省点空间」，它直接决定索引效率、排序性能、精度是否丢失。很多「查询慢」的坑其实是字段类型选错了（比如用 varchar 存数字、用 text 存状态）。

**整数类型（int 系列）**：

| 类型 | 字节数 | 有符号范围 | 使用场景 |
| --- | --- | --- | --- |
| TINYINT | 1 | -128 ~ 127 | 状态、性别、布尔 |
| SMALLINT | 2 | -32768 ~ 32767 | 小范围计数 |
| MEDIUMINT | 3 | -8388608 ~ 8388607 | 中等数量 |
| INT | 4 | -2^31 ~ 2^31-1（约 ±21 亿） | 主键 id、用户 id |
| BIGINT | 8 | -2^63 ~ 2^63-1 | 订单号、雪花 id |

> `INT(11)` 里的 11 是**显示宽度**（配合 ZEROFILL 使用），不影响存储范围。8.0 已弃用显示宽度。

**字符串类型**：

| 类型 | 说明 | 场景 |
| --- | --- | --- |
| CHAR(n) | 定长，存不满补空格，最多 255 字符 | 固定长度如手机号、MD5、性别 |
| VARCHAR(n) | 变长，n 是最大字符数（字节受行大小限制） | 用户名、邮箱、可变文本 |
| TEXT | 大文本，最多 64KB，不能有默认值 | 文章正文、简介 |
| BLOB | 二进制大对象 | 存图片、文件（一般不建议存库里） |

**小数类型**：

| 类型 | 说明 | 场景 |
| --- | --- | --- |
| FLOAT/DOUBLE | 浮点数，有精度丢失 | 不需要精确的科学计算 |
| DECIMAL(M,D) | 定点数，精确，M 总位数 D 小数位 | 金额（必须用这个） |

::: tip 💡 面试题：存金额为什么不用 FLOAT/DOUBLE，要用 DECIMAL？
一句话结论：浮点数是二进制近似存储，无法精确表示十进制小数，会丢精度；DECIMAL 以字符串/定点方式存储，精确到分。原因：0.1 在二进制里是无限循环小数，浮点存储必然有舍入误差，累加后误差放大。展开：金额、利率等场景必须用 `DECIMAL(10,2)`，绝不能用 `double`（Java 里对应的也是 `BigDecimal`，见 [Java集合](/learn_backend/java/Java核心/Java集合) 里的精度讨论）。
:::

**日期时间类型**：

| 类型 | 范围 | 说明 |
| --- | --- | --- |
| DATE | 1000-01-01 ~ 9999-12-31 | 只有日期 |
| TIME | -838:59:59 ~ 838:59:59 | 只有时间 |
| DATETIME | 1000-01-01 00:00:00 ~ 9999-12-31 | 日期+时间，不依赖时区 |
| TIMESTAMP | 1970-01-01 ~ 2038-01-19 | 依赖时区，自动转 UTC 存储 |

> 优先用 `DATETIME`（范围大、不依赖时区）；`TIMESTAMP` 有 2038 年溢出问题且受时区影响，只适合需要「自动按客户端时区展示」的场景。

---

### 4. SQL 分类与常用语句体系

**背景**：SQL（Structured Query Language）是操作关系型数据库的统一语言，按功能分四大类，面试常考「DDL / DML / DQL / DCL 分别是什么」。

| 分类 | 全称 | 作用 | 常用关键字 |
| --- | --- | --- | --- |
| DDL | Data Definition Language | 定义结构（库/表/索引） | CREATE / ALTER / DROP / TRUNCATE |
| DML | Data Manipulation Language | 操作数据 | INSERT / UPDATE / DELETE |
| DQL | Data Query Language | 查询数据 | SELECT / WHERE / JOIN / GROUP BY |
| DCL | Data Control Language | 权限控制 | GRANT / REVOKE |

**DDL 建表完整示例**：

```sql
CREATE TABLE `user` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `username`    VARCHAR(50)  NOT NULL                COMMENT '用户名',
  `phone`       CHAR(11)     DEFAULT NULL            COMMENT '手机号',
  `balance`     DECIMAL(10,2) NOT NULL DEFAULT 0.00  COMMENT '余额',
  `status`      TINYINT      NOT NULL DEFAULT 0      COMMENT '状态 0正常 1禁用',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_phone` (`phone`),
  KEY `idx_status_create` (`status`, `create_time`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT = '用户表';
-- 为什么用 utf8mb4：utf8 在 MySQL 里其实是 utf8mb3，最多 3 字节，存不了 emoji（4 字节）
```

**DML 增删改**：

```sql
-- 插入
INSERT INTO user (username, phone, balance) VALUES ('张三', '13800138000', 100.00);
-- 批量插入（比逐条插入快得多，减少网络/解析开销）
INSERT INTO user (username, phone) VALUES ('a','1'), ('b','2'), ('c','3');

-- 更新（WHERE 条件必须带，否则全表更新）
UPDATE user SET balance = balance - 50 WHERE id = 1;

-- 删除（生产环境慎用 DELETE，大表用逻辑删除字段 status 标记）
DELETE FROM user WHERE id = 1;
-- 清空表（DDL，直接 drop 重建，比 DELETE 逐行删快，且自增 id 归零）
TRUNCATE TABLE user;
```

**DQL 查询全链路示例**：

```sql
-- SELECT 执行顺序（面试必背）：FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
SELECT u.status, COUNT(*) AS cnt
FROM user u
WHERE u.create_time >= '2025-01-01'     -- 先过滤
GROUP BY u.status                        -- 再分组
HAVING cnt > 100                         -- 分组后过滤（聚合条件放这，不能用 WHERE）
ORDER BY cnt DESC                        -- 再排序
LIMIT 10;                                -- 最后截取
```

**JOIN 关联查询（多表连接）**：

| JOIN 类型 | 含义 |
| --- | --- |
| INNER JOIN | 取两表交集（都满足条件） |
| LEFT JOIN | 左表全保留，右表匹配不到补 NULL |
| RIGHT JOIN | 右表全保留，左表匹配不到补 NULL |
| FULL JOIN | 并集（MySQL 不支持，用 UNION 模拟） |

```sql
-- 内连接：只查有订单的用户
SELECT u.username, o.order_no FROM user u INNER JOIN orders o ON u.id = o.user_id;
-- 左连接：所有用户都查出来，没订单的 order_no 为 NULL
SELECT u.username, o.order_no FROM user u LEFT JOIN orders o ON u.id = o.user_id;
```

#### 4.1 CTE（公用表表达式）

**背景**：复杂查询（递归树、多次引用同一子查询）用子查询嵌套很深，可读性差。CTE 把子查询提取到 `WITH` 子句里，命名后复用，让 SQL 像搭积木一样清晰。

**非递归 CTE（普通 CTE）**：给子查询取个名字，后面可以多次引用同一条 CTE：

```sql
-- 不用 CTE：子查询嵌套，读起来费劲
SELECT * FROM (
    SELECT user_id, COUNT(*) AS cnt FROM orders GROUP BY user_id
) t WHERE cnt > 5;

-- 用 CTE：把子查询先定义，再引用，逻辑层次分明
WITH order_cnt AS (
    SELECT user_id, COUNT(*) AS cnt FROM orders GROUP BY user_id
)
SELECT * FROM order_cnt WHERE cnt > 5;
```

**递归 CTE（`WITH RECURSIVE`）**：用于树形结构查询（分类树、菜单树、组织架构），标准 SQL 语法，MySQL 8.0+ 支持：

```sql
WITH RECURSIVE cte AS (
    -- ① 起点：anchor 成员，查根节点
    SELECT id, parent_id, name, 1 AS level
    FROM category WHERE id = 1
    UNION ALL
    -- ② 递归成员：每次 JOIN 上一轮结果，level + 1
    SELECT c.id, c.parent_id, c.name, cte.level + 1
    FROM category c JOIN cte ON c.parent_id = cte.id
    -- ③ 限制递归层数（可选）：到第 3 层就停止，避免无限递归
    WHERE cte.level < 3
)
SELECT * FROM cte;
```

**递归 CTE 的执行过程**：

| 轮次 | 做了什么 | 结果 |
| --- | --- | --- |
| 第 1 轮 | 执行 anchor 查询，`WHERE id = 1` | 根节点，level=1 |
| 第 2 轮 | 用第 1 轮的 `id`  JOIN `category.parent_id` | 子节点，level=2 |
| 第 3 轮 | 用第 2 轮的 `id` 再 JOIN | 孙子节点，level=3 |
| 第 4 轮 | `WHERE cte.level < 3` 不满足，停止 | 终止 |

**实用场景**：

```sql
-- 查出某个分类及其所有子分类（包括子子孙孙）的所有课程
WITH RECURSIVE cate_tree AS (
    SELECT id FROM category WHERE id = 1
    UNION ALL
    SELECT c.id FROM category c JOIN cate_tree ON c.parent_id = cate_tree.id
)
SELECT * FROM course WHERE category_id IN (SELECT id FROM cate_tree);
```

**CTE 与子查询的对比**：

| 对比 | 子查询 | CTE |
| --- | --- | --- |
| 可读性 | 嵌套深时难以理解 | 平铺定义，层次分明 |
| 复用 | 多次引用需重复写 | 定义一次，`WITH` 后可多次引用 |
| 递归 | ❌ 不支持 | ✅ `WITH RECURSIVE` 支持遍历树 |
| 性能 | 多次引用可能多次执行 | 优化器可能只执行一次 |
| 调试 | 不直观 | 可以先查 CTE 本身看中间结果 |

**小结**：CTE 的核心价值是「把复杂查询拆成可命名的步骤」，非递归 CTE 替代子查询提升可读性，递归 CTE 解决树形查询（分类、菜单、组织架构）——这是 MySQL 8.0 的一大亮点，也是面试中「查分类树」的标准答案。**指定层数加 `WHERE cte.level < N` 即可**，写在递归成员里提前打断比外面过滤更高效。

**小结**：SQL 是操作 MySQL 的唯一入口，四分类 + 执行顺序是后续 SQL 优化、索引调优的基础。记住「WHERE 在分组前、HAVING 在分组后、LIMIT 最后」，能解释很多「条件写错位置」的 bug。

---

### 5. 索引

#### 5.1 什么是索引，为什么需要它

**背景**：没有索引时，`SELECT * FROM t WHERE id = 100` 要逐行扫描整张表（全表扫描），数据量一大，磁盘 IO 次数就是性能灾难。索引的本质是「**为数据建立的一种排好序的、能快速定位的数据结构**」，用空间换时间，把 O(n) 的全表扫描降到 O(log n)。

**定义**：索引是一种独立于数据之外的、排好序的数据结构，InnoDB 默认用 B+ 树组织它。索引本身也占磁盘空间，且每次写数据都要同步维护索引（写放大），所以索引不是越多越好。

**为什么选 B+ 树而不是别的结构**：

| 数据结构 | 是否适用 | 原因 |
| --- | --- | --- |
| 哈希表 | ❌ | 只能等值查询，不支持范围、排序；且有哈希冲突 |
| 二叉搜索树 | ❌ | 数据量大时树会很高，磁盘 IO 次数 = 树高，性能差 |
| 红黑树 | ❌ | 每个节点只存 1 个 key，树依然偏高，且不利于磁盘预读 |
| B 树 | 一般 | 非叶子节点也存数据，同页能放的 key 更少，树更高 |
| **B+ 树** | ✅ | 非叶子节点只存 key，树矮；叶子节点双向链表，支持范围 |

**B+ 树结构（重点，务必能画出来）**：

```text
                        ┌─────────┐
                        │  [20 40] │        ← 根节点（只存 key + 指针）
                        └────┬────┬┘
                 ┌───────────┘    └────────────┐
                 ▼                              ▼
          ┌────────────┐                  ┌────────────┐
          │ [5  10  15] │                  │ [30  50  70]│   ← 非叶子节点（只存 key）
          └─┬──┬──┬──┬─┘                  └─┬──┬──┬──┬─┘
            ▼  ▼  ▼  ▼  ▼                    ▼  ▼  ▼  ▼  ▼
   ┌────────────────────────────────────────────────────────────┐
   │ [5]→[10]→[15]→[20]→[30]→[40]→[50]→[70]→[100]  ← 叶子节点  │
   │  存完整数据(聚簇) 或 主键值(二级)                           │
   │  ←——————— 双向链表串起来，支持范围扫描与排序 ———————→      │
   └────────────────────────────────────────────────────────────┘
```

**B+ 树的三个核心优势**：

1. **树矮**：非叶子节点不存数据，一个 16KB 的页能放更多 key（大约几百到上千个），三层能容纳上千万数据，磁盘 IO 最多 3 次。
2. **叶子节点有序且用双向链表连接**：范围查询 `BETWEEN`、`ORDER BY` 顺着链表扫即可，不用回退。
3. **查询稳定**：任何查询都必须走到叶子节点，IO 次数稳定（这点和 B 树不同，B 树可能在中间节点就命中）。

::: tip 💡 面试题：为什么索引要用 B+ 树而不是 B 树 / 哈希？
一句话结论：B+ 树「矮胖」且叶子节点是双向有序链表，同时兼顾等值查询、范围查询和排序。原因：非叶子节点只存索引不存数据，单页能装更多 key，树高最低、磁盘 IO 最少；哈希只支持等值、B 树中间节点存数据导致树更高。
:::

#### 5.2 聚簇索引 vs 二级索引（回表）

**聚簇索引（Clustered Index）**：InnoDB 把**整行数据**直接存在主键索引（聚簇索引）的叶子节点里，即「数据即索引」。一张表**有且只有一个**聚簇索引。

- 有主键 → 主键就是聚簇索引。
- 无主键 → 选第一个**非空唯一索引**作聚簇索引。
- 都没有 → InnoDB 生成隐藏的 `row_id`（6 字节）作聚簇索引。

**二级索引（辅助索引，Secondary Index）**：叶子节点存的是「索引列 + 主键值」，而不是整行数据。查完二级索引后，还要拿着主键值回到聚簇索引查一次，这个过程叫**回表**。

```text
-- 表结构：id 主键，name 有二级索引
SELECT * FROM user WHERE name = '张三';

  name 二级索引                       id 聚簇索引
┌──────────────┐  拿到主键 id=10    ┌─────────────────────┐
│ name  │ id   │ ────────────────▶ │ id=10 │ name 张三 ... │ ← 整行数据
│ 张三  │ 10   │       回表         └─────────────────────┘
└──────────────┘
```

**覆盖索引（Covering Index）—— 避免回表的核心优化**：

如果查询要的列**全部包含在二级索引里**，就不需要回表，`EXPLAIN` 的 `Extra` 会显示 `Using index`：

```sql
-- 建一个 (name, age) 联合索引
CREATE INDEX idx_name_age ON user(name, age);

-- 只查 name、age：索引里都有，覆盖索引，不回表 ✅
SELECT name, age FROM user WHERE name = '张三';

-- 查 name, age, email：email 不在索引里，必须回表 ❌
SELECT name, age, email FROM user WHERE name = '张三';
```

这就是为什么推荐「**给高频查询建联合索引、让查询只走索引不回表**」，而不是无脑 `SELECT *`。

#### 5.3 联合索引与最左前缀原则

**联合索引**：多个列组成一个索引，如 `INDEX idx(a, b, c)`。它是按 `a → b → c` 的顺序依次排序的：先按 a 排序，a 相同再按 b 排序，再按 c 排序。

**最左前缀原则**：联合索引 `(a, b, c)` 等价于建立了 `(a)`、`(a,b)`、`(a,b,c)` 三个索引。查询条件必须**从最左列开始连续匹配**才能走这个索引：

```sql
CREATE INDEX idx_order ON orders(user_id, status, create_time);

-- ✅ 能走索引（等值 + 等值 + 范围）
SELECT * FROM orders WHERE user_id = 1 AND status = 'paid' AND create_time > '2025-01-01';
-- ✅ 能走索引（只用了最左列 user_id）
SELECT * FROM orders WHERE user_id = 1;
-- ✅ 能走索引（user_id + status，中间没断）
SELECT * FROM orders WHERE user_id = 1 AND status = 'paid';
-- ❌ 不能走索引（跳过了最左列 user_id）
SELECT * FROM orders WHERE status = 'paid';
-- ❌ 只能用到 user_id 这一列（status 后面断了，create_time 用不上）
SELECT * FROM orders WHERE user_id = 1 AND create_time > '2025-01-01';
```

**建联合索引的实用口诀**：

1. 等值查询的列放最前，范围查询的列放最后。
2. 区分度高的列放前面（能过滤更多数据）。
3. 尽量避免用重复值多的列（如性别、状态）单独建索引。

#### 5.4 索引失效的常见场景（背这 7 条）

| 场景 | 反例 | 说明 |
| --- | --- | --- |
| 1. 索引列做函数/运算 | `WHERE YEAR(create_time) = 2025` | 索引存的是原始值，运算后无法匹配 |
| 2. 隐式类型转换 | `WHERE phone = 13800138000`（phone 是 varchar） | MySQL 会把列转成数字，触发全表扫描 |
| 3. 前置模糊 | `WHERE name LIKE '%张'` | 左侧通配符破坏有序性，`LIKE '张%'` 可以走 |
| 4. 破坏最左前缀 | `WHERE b = 1`（索引是 (a,b,c)） | 必须从最左列连续匹配 |
| 5. OR 连接非索引列 | `WHERE id = 1 OR name = 'x'` | name 没索引，只能全表扫描 |
| 6. 索引列比较 | `WHERE id != 1` / `NOT IN` | 优化器判断走索引收益低 |
| 7. 使用 `IS NULL`/`IS NOT NULL` 不当 | 视索引列数据分布而定 | 大部分非空时 `IS NOT NULL` 可能全表 |

```sql
-- 定位是否走索引：看 type 是否 ALL、key 是否 NULL
EXPLAIN SELECT * FROM orders WHERE YEAR(create_time) = 2025;   -- type=ALL 全表扫描
EXPLAIN SELECT * FROM orders WHERE create_time >= '2025-01-01'; -- type=range 走索引
```

#### 5.5 索引下推（Index Condition Pushdown，ICP）

**背景**：MySQL 5.6 之前，联合索引中「索引列」无法完全过滤的记录要回表后再判断，白白多了很多回表。ICP 让存储引擎在**索引层面**就把能用索引列的过滤条件先过滤掉，减少回表次数。

```sql
-- 联合索引 (name, age)，查询 name 范围 + age 过滤
SELECT * FROM user WHERE name LIKE '张%' AND age = 20;

-- 无 ICP：先用 name 范围拿所有记录，全部回表，再过滤 age
-- 有 ICP：在索引里就把 age=20 过滤掉，只有符合条件的才回表
```

`EXPLAIN` 的 `Extra` 出现 `Using index condition` 就说明用了 ICP。

---

### 6. 事务与隔离级别

#### 6.1 什么是事务，ACID 是什么

**背景**：转账「A 扣 100、B 加 100」这两步要么都成功、要么都失败，不能扣了 A 的钱却没加到 B 头上。事务就是把一组操作打包成**一个不可分割的最小执行单元**。

**定义**：事务是数据库的一组操作，要么全部执行成功，要么全部回滚，是并发控制和崩溃恢复的基本单位。

**ACID 四特性（面试必背，且要知道靠什么实现）**：

| 特性 | 含义 | 靠什么实现 |
| --- | --- | --- |
| 原子性 Atomicity | 一组操作要么全成功、要么全失败 | **undo log**（回滚日志） |
| 一致性 Consistency | 事务前后数据都满足约束（状态合法） | 由 A + I + D 共同保证，是最终目标 |
| 隔离性 Isolation | 并发事务互不干扰 | **MVCC + 锁** |
| 持久性 Durability | 事务提交后数据永久保存 | **redo log**（重做日志） |

#### 6.2 并发带来的问题与四种隔离级别

并发执行事务会带来三个经典问题：

- **脏读**：读到了别的事务**还没提交**的数据。
- **不可重复读**：同一事务内两次读同一行，结果不一致（中间被别的事务修改并提交）。
- **幻读**：同一事务内两次读「一个范围」，第二次多出/少了若干行（中间有别的事务插入/删除了行）。

SQL 标准定义了四种隔离级别，隔离性从低到高、性能从高到低：

| 隔离级别 | 脏读 | 不可重复读 | 幻读 |
| --- | --- | --- | --- |
| 读未提交 READ UNCOMMITTED | ✅ 可能 | ✅ 可能 | ✅ 可能 |
| 读已提交 READ COMMITTED | ❌ 解决 | ✅ 可能 | ✅ 可能 |
| 可重复读 REPEATABLE READ（**MySQL 默认**） | ❌ 解决 | ❌ 解决 | 基本解决（MVCC + 间隙锁） |
| 串行化 SERIALIZABLE | ❌ 解决 | ❌ 解决 | ❌ 解决 |

```sql
-- 查看当前隔离级别
SELECT @@transaction_isolation;
-- 查看全局隔离级别
SELECT @@global.transaction_isolation;
-- 设置隔离级别（会话级）
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

::: tip 💡 面试题：MySQL 默认隔离级别是什么？怎么解决幻读？
一句话结论：默认是「可重复读」（RR），靠 MVCC 快照读 + 间隙锁（next-key lock）解决幻读。原因：普通 `SELECT` 走 MVCC 读历史版本（快照读），不会被新插入的行影响；`SELECT ... FOR UPDATE` 走当前读，会加间隙锁锁住区间，阻止别的行插入。
:::

#### 6.3 MVCC 的版本链（基础理解）

**背景**：如果每次读都加锁，读写会互相阻塞，吞吐极低。MVCC（Multi-Version Concurrency Control，多版本并发控制）让**读不加锁、读写不互斥**，是 InnoDB 高并发的核心。

InnoDB 给每行记录加了两个**隐藏列**（原理篇会展开字节级细节）：

```text
┌────────────┬──────────────┬──────────────┬──────────────────────────┐
│ DB_ROW_ID  │ DB_TRX_ID    │ DB_ROLL_PTR  │  业务列（id / name ...）  │
│ 6 字节     │ 6 字节       │ 7 字节       │                          │
│ 隐藏主键   │ 最近修改的    │ 指向 undo log │                          │
│ (无主键时) │ 事务 id      │ 的旧版本     │                          │
└────────────┴──────────────┴──────────────┴──────────────────────────┘
```

每次修改一行，都会在 undo log 里生成一个旧版本，`DB_ROLL_PTR` 把这些旧版本串成一条**版本链**：

```text
当前记录（最新版本，trx_id=100）
   │ roll_pointer
   ▼
旧版本1（trx_id=90）
   │ roll_pointer
   ▼
旧版本2（trx_id=70）
   │ roll_pointer
   ▼
  NULL（最老）
```

读的时候，事务拿着自己的 **ReadView**（可见性判断规则，原理篇详述）顺着版本链找到一个「自己能看到」的版本，而不是死磕最新版本。这就实现了「不同事务看到不同版本的同一行数据」，彼此不阻塞。

**小结**：事务 + 隔离级别 + MVCC + 锁是 MySQL 并发控制的一整套体系。ACID 里，原子性靠 undo、持久性靠 redo、隔离性靠 MVCC+锁，四者最终指向一致性。

---

### 7. 锁的基础认识

**背景**：MVCC 解决「读」的并发，但「写」之间、读写之间仍需要锁来协调，否则两个事务同时改同一行就会互相覆盖。

**按粒度分**：

| 锁粒度 | 说明 | 冲突概率 | 并发度 |
| --- | --- | --- | --- |
| 表锁 | 锁整张表 | 高 | 低（MyISAM 只有这种） |
| 行锁 | 锁某几行 | 低 | 高（InnoDB 默认，靠索引定位） |
| 间隙锁 | 锁一个区间（不含记录本身） | 中 | 中 |
| next-key lock | 行锁 + 间隙锁 | 中 | 中 |

**按模式分**：

| 模式 | 说明 | 互斥 |
| --- | --- | --- |
| 共享锁 S | 读锁，允许别人也加 S | S 与 X 互斥 |
| 排他锁 X | 写锁，独占 | X 与 S、X 都互斥 |

```sql
-- 加共享锁（读锁）
SELECT * FROM user WHERE id = 1 LOCK IN SHARE MODE;  -- 8.0 后推荐 FOR SHARE
-- 加排他锁（写锁，当前读，会加 next-key lock）
SELECT * FROM user WHERE id = 1 FOR UPDATE;
```

> **关键认知**：InnoDB 的行锁是**加载索引上**的。如果 UPDATE 的 WHERE 条件没走索引，会退化成锁全表（把所有记录的行锁都加上）。这就是为什么「WHERE 没索引的更新」特别容易引发死锁和锁等待。

**基础篇小结**：到这里已经掌握 MySQL 的「骨架」——架构分层、引擎选择、数据类型、SQL 四分类、B+ 树索引、事务与隔离级别、锁的概念。下一步进入高级篇，把这些概念串成「一条 SQL 从优化到落盘再到主从同步」的完整闭环。

---

## 高级篇

### 1. EXPLAIN 执行计划详解

**背景**：一条 SQL 慢了，第一反应不是盲目加索引，而是先用 `EXPLAIN` 看「数据库到底打算怎么执行它」——走没走索引、扫了多少行、有没有临时表/文件排序。EXPLAIN 是 SQL 优化的显微镜，也是所有「为什么慢」问题的第一现场。

**基本用法**：

```sql
-- 只看执行计划，不真正执行
EXPLAIN SELECT * FROM orders WHERE user_id = 1 AND create_time > '2025-01-01';

-- 8.0 支持 EXPLAIN ANALYZE：会真实执行，并给出每一步实际耗时和扫描行数（比 EXPLAIN 更准）
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 1;
```

**核心字段速查表（按重要程度排序）**：

| 字段 | 含义 | 怎么看 |
| --- | --- | --- |
| `type` | **访问类型（最关键）** | 越靠前越好，最低要求 `range`，出现 `ALL` 要警惕 |
| `key` | 实际使用的索引 | `NULL` 表示没走索引，等于全表扫描 |
| `rows` | 优化器**预估**要扫描的行数 | 越小越好，与 `type=ALL` 一起看最能发现问题 |
| `key_len` | 索引实际用到的字节数 | 越大说明联合索引用到的列越多（越左前缀匹配越充分） |
| `Extra` | 额外信息 | `Using index`/`Using filesort` 等关键线索 |
| `id` | 查询序号 | 越大越先执行；相同 id 从上往下顺序执行 |
| `select_type` | 查询类型 | `SIMPLE`/`PRIMARY`/`SUBQUERY`/`DERIVED`/`UNION` |
| `possible_keys` | 可能用到的索引 | 候选，可能为空 |
| `ref` | 与索引比较的是常量还是列 | `const` 或 `表.列名` |
| `filtered` | 按条件过滤后剩余行数占比 | 越大越好（越接近 100 说明过滤效果好） |

#### 1.1 type 从优到劣（面试必背）

```
system > const > eq_ref > ref > range > index > ALL
```

| type | 含义 | 触发场景 |
| --- | --- | --- |
| `system` | 表只有一行（系统表） | 极少见 |
| `const` | 主键/唯一索引**等值**查询，最多命中一行 | `WHERE id = 1` |
| `eq_ref` | 唯一索引 **join**，被驱动表每行只匹配一行 | `JOIN ... ON a.id = b.uid` |
| `ref` | 非唯一索引等值查询 | `WHERE name = '张三'` |
| `range` | 索引**范围**扫描 | `WHERE id > 10` / `BETWEEN` / `IN` |
| `index` | 全索引扫描（遍历整个索引树） | 覆盖索引但没有过滤条件 |
| `ALL` | **全表扫描**（最差，要优化） | 没走索引 / 优化器判断走索引更慢 |

```sql
-- 对比体验 type 的变化
EXPLAIN SELECT * FROM user WHERE id = 1;               -- type=const
EXPLAIN SELECT * FROM user WHERE name = '张三';        -- type=ref（name 有普通索引）
EXPLAIN SELECT * FROM user WHERE age > 18;             -- type=range 或 ALL（age 没索引）
EXPLAIN SELECT * FROM user;                            -- type=ALL 全表
```

::: tip 💡 面试题：EXPLAIN 的 type 有哪些？const 和 ref 的区别？
一句话结论：从优到劣是 `system > const > eq_ref > ref > range > index > ALL`，const 是主键/唯一索引等值（最多一行），ref 是普通索引等值（可能多行）。原因：const 靠唯一性保证最多命中一行，ref 只是走普通索引、命中行数不唯一。
:::

#### 1.2 Extra 关键值（定位问题全靠它）

| Extra 值 | 含义 | 判断 |
| --- | --- | --- |
| `Using index` | 覆盖索引，只读索引不回表 | ✅ 最好 |
| `Using index condition` | 用了索引下推（ICP） | ✅ 较好 |
| `Using where` | 存储引擎返回后 Server 层再过滤 | ⚠️ 一般 |
| `Using temporary` | 用了临时表（`GROUP BY`/`DISTINCT`/`UNION` 没走索引） | ❌ 差，要优化 |
| `Using filesort` | 文件排序（`ORDER BY` 没走索引，需额外排序） | ❌ 差，要优化 |
| `Using join buffer` | join 被驱动表无索引，用内存缓冲做全表匹配 | ❌ 差 |

```sql
-- Using filesort：order by 的列没在索引里，MySQL 要额外排序
EXPLAIN SELECT * FROM orders ORDER BY create_time;          -- create_time 无索引 → Using filesort

-- 优化：给 order by 的列建索引，或建 (where列, order_by列) 联合索引
CREATE INDEX idx_create ON orders(create_time);
EXPLAIN SELECT * FROM orders ORDER BY create_time;          -- 走索引，无需 filesort
```

::: tip 💡 面试题：Extra 里的 Using filesort 和 Using temporary 是什么？怎么优化？
一句话结论：都是「没走索引导致额外排序/临时表」的信号，是慢 SQL 的常见元凶。原因：`ORDER BY`/`GROUP BY` 的列不在索引里时，MySQL 只能把结果拿出来单独排序或建临时表。展开：给排序/分组列建合适的联合索引，让数据在索引里天然有序，即可消除 filesort/temporary。
:::

**小结**：EXPLAIN 的核心是看三件事——`type` 是不是 `ALL`、`key` 是不是 `NULL`、`Extra` 有没有 `Using filesort/temporary`。三者任何一条命中，基本都能锁定慢 SQL 的根因。

---

### 2. SQL 优化实战

**背景**：掌握了 EXPLAIN，就有了「诊断工具」，这一节讲「治病的套路」——从定位慢 SQL，到索引优化、深分页、count、join 等高频实战场景。

#### 2.1 慢查询定位

```sql
-- 1. 开启慢查询日志
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 1;              -- 超过 1 秒的 SQL 记入慢日志
SET GLOBAL log_queries_not_using_indexes = ON;  -- 顺便记录「没走索引」的 SQL

-- 2. 查看慢日志文件路径
SHOW VARIABLES LIKE 'slow_query_log_file';

-- 3. 用 mysqldumpslow 汇总分析慢日志（按出现次数/耗时排序）
-- mysqldumpslow -s c -t 10 slow.log      # 出现次数最多的前 10 条
```

拿到慢 SQL 后用 EXPLAIN 分析，定位是「没走索引」还是「走了索引但扫描行数太多」还是「用了 filesort/temporary」。

#### 2.2 十大优化原则（面试能脱口而出几条）

1. **只查需要的列**，避免 `SELECT *`（利于覆盖索引、减少回表和网络传输）。
2. **索引列不做函数/运算/隐式转换**（会破坏索引匹配）。
3. **遵循最左前缀原则**建联合索引（等值列在前、范围列在后）。
4. **用覆盖索引**让查询只走索引不回表。
5. **小表驱动大表**做 join。
6. **深分页用游标**（`WHERE id > 上次id`）替代大偏移 `LIMIT`。
7. **`IN` / `EXISTS` 恰当选择**（外表大用 `EXISTS`，外表小用 `IN`）。
8. **大表加索引用在线 DDL**（`pt-osc`/`gh-ost`），避免锁表阻塞业务。
9. **尽量批量插入**，减少网络/解析开销。
10. **控制事务大小、避免长事务**（长事务占用 undo log 和锁，拖累并发）。

#### 2.3 深分页优化（高频面试 + 高频踩坑）

```sql
-- ❌ 差：offset 1000000 会先扫描并丢弃前 100 万行，越大越慢
SELECT * FROM orders ORDER BY id LIMIT 1000000, 10;

-- ✅ 好：记录上一次的 id，用主键直接定位（游标分页）
SELECT * FROM orders WHERE id > 1000000 ORDER BY id LIMIT 10;
```

**为什么 `LIMIT 1000000, 10` 慢**：MySQL 拿到结果后要「先取出前 1000010 行，再丢掉前 1000000 行」，offset 越大，被丢弃的行越多，扫描成本线性增长。而 `WHERE id > 1000000` 直接借助主键索引定位到 100 万之后，只扫 10 行。

::: tip 💡 面试题：深分页（LIMIT 1000000, 10）为什么慢？怎么优化？
一句话结论：大 offset 会扫描并丢弃大量无关行，offset 越大越慢；优化用「游标分页」`WHERE id > 上次最大值`。原因：`LIMIT m,n` 要先取 m+n 行再丢前 m 行；用主键定位则直接从 m 之后开始。展开：还可以用「延迟关联」先 `SELECT id` 定位主键再回表取数据，减少回表开销。
:::

#### 2.4 COUNT(*) 优化

- **MyISAM** 表里直接存了行数，`COUNT(*)` O(1) 返回；**InnoDB** 没有存，必须扫描（所以慢）。
- `COUNT(*)`、`COUNT(1)`、`COUNT(主键)` 性能几乎一样（都按行计数），`COUNT(列)` 会忽略 NULL，且若列无索引会更慢。
- 精确计数慢时，可用 `information_schema.tables` 的 `table_rows` 拿**估算值**，或用 Redis 计数器维护精确值。

```sql
-- 估算行数（不精确，但快）
SELECT table_rows FROM information_schema.tables WHERE table_name = 'orders';
```

#### 2.5 JOIN 优化

- **小表驱动大表**：让行数少的表做驱动表（外层），行数多的做被驱动表（内层）。优化器通常会自动选，但要能看懂 `EXPLAIN` 里的顺序。
- **被驱动表的 join 列必须有索引**：否则对被驱动表每行匹配都要全表扫（`Extra` 出现 `Using join buffer`）。
- **`IN` vs `EXISTS`**：外表大用 `EXISTS`（内层小表匹配到即返回），外表小用 `IN`（内层大表走索引）。

```sql
-- 被驱动表 o.user_id 建索引后，join 才高效
EXPLAIN SELECT * FROM user u INNER JOIN orders o ON u.id = o.user_id;
-- 看 rows：驱动表 rows 小、被驱动表走 eq_ref/ref 才是健康状态
```

::: tip 💡 面试题：JOIN 优化要点？什么是小表驱动大表？
一句话结论：让行数少的表做驱动表、被驱动表的连接列建索引，减少匹配次数。原因：驱动表每行都要去被驱动表匹配，驱动表越小、被驱动表走索引，整体 IO 越少。展开：小表驱动大表本质是「外层循环次数最少 + 内层查找 O(log n)」。
:::

**小结**：SQL 优化是一套「定位（慢日志 + EXPLAIN）→ 诊断（type/key/Extra）→ 对症（建索引/改写法/覆盖索引/游标分页）」的流程，没有万能药，但九成慢 SQL 都死在「没走索引」和「扫描行数太多」这两件事上。

---

### 3. 三大日志与两阶段提交

**背景**：InnoDB 为什么「崩溃不丢数据、能回滚、能做主从」？答案藏在三个日志里。这是理解 MySQL 持久性、原子性和高可用的钥匙，也是「一条 update 到底干了什么」的完整答案。

#### 3.1 redo log（重做日志，InnoDB 引擎层）

- **是什么**：物理日志，记录「对哪个数据页做了什么修改」（如「把 page 100 的偏移 200 处改成 xxx」）。
- **核心思想 WAL（Write-Ahead Logging，先写日志再写盘）**：更新时先把改动写 redo log 并刷盘，数据页稍后异步刷盘。这样即使中途宕机，重启后重放 redo log 就能恢复已提交但未落盘的数据。
- **为什么快**：数据页是随机写（慢），redo log 是顺序追加写（快）。先顺序写日志，再后台慢慢刷随机写的数据页，把随机 IO 变成顺序 IO。
- **循环写**：redo log 是固定大小的一组文件，写满后覆盖最旧的（`innodb_log_file_size`、`innodb_log_files_in_group` 配置）。所以它只能「恢复最近一段」，不能长期保存。

```
redo log（环形，固定大小）:
┌────────────────────────────────────────────┐
│  log file 1  │  log file 2  │  log file 3   │
└────────────────────────────────────────────┘
   write pos（写指针）          checkpoint（擦除点）
   两者之间是「待刷盘数据」，写满则需先 checkpoint 推进
```

#### 3.2 binlog（归档日志，Server 层）

- **是什么**：逻辑日志，记录 SQL 语句的原始逻辑（statement）或每行数据的变更（row）。
- **追加写**：不会覆盖，会一直增长（所以要做归档/清理）。
- **用途**：主从复制（从库重放 binlog）、数据恢复（按时间点回放）、数据同步（Canal 订阅做缓存一致性）。
- **三种格式**：

| 格式 | 记录内容 | 优点 | 缺点 |
| --- | --- | --- | --- |
| `statement` | 记录 SQL 语句本身 | 日志小 | 主从可能不一致（如 `NOW()`、`LIMIT` 无 order） |
| `row`（默认） | 记录每行改动前后 | 精确、可恢复 | 日志大 |
| `mixed` | 默认 statement，特殊场景切 row | 折中 | 复杂 |

```sql
-- 查看和设置 binlog 格式
SHOW VARIABLES LIKE 'binlog_format';
SET GLOBAL binlog_format = 'ROW';
-- 查看 binlog 内容（8.0）
SHOW BINLOG EVENTS IN 'binlog.000001';
```

#### 3.3 undo log（回滚日志，InnoDB 引擎层）

- **是什么**：逻辑日志，记录「修改前的旧值」（如 update 前把旧值 c=0 记到 undo）。
- **两个用途**：
  1. **事务回滚**：执行 `ROLLBACK` 时，用 undo 里的旧值把数据改回去（保证原子性）。
  2. **MVCC**：undo 里的旧版本串成「版本链」，供快照读找到可见的历史版本（保证隔离性）。
- undo log 本身也需要 redo log 保护（否则 undo 丢了也回滚不了）。

#### 3.4 三日志对比（面试必背）

| 日志 | 所在层 | 内容 | 写入方式 | 主要作用 |
| --- | --- | --- | --- | --- |
| **redo log** | InnoDB | 物理（页的修改） | 循环写 | 崩溃恢复、持久性 |
| **binlog** | Server | 逻辑（SQL/行变更） | 追加写 | 主从复制、归档恢复 |
| **undo log** | InnoDB | 逻辑（旧值） | 随机写 | 事务回滚、MVCC |

#### 3.5 两阶段提交（2PC）

**背景问题**：redo log 是 InnoDB 的，binlog 是 Server 层的，两者是两份独立的日志。如果「写 redo」和「写 binlog」不同步，宕机后主库（靠 redo 恢复）和从库（靠 binlog 恢复）就会数据不一致。两阶段提交就是保证这两份日志**要么都成功、要么都不成功**。

```
两阶段提交流程（一条 update 提交时）：
  ① 执行器：写 redo log，标记为 prepare（准备态）
  ② 执行器：写 binlog
  ③ 执行器：把 redo log 标记为 commit（提交态）
```

**为什么必须先 redo prepare 再 binlog 再 redo commit**（用反证法理解）：

- 若「先写 redo 成功、binlog 没写」就宕机 → 主库恢复后有这行数据，但从库（按 binlog）没有 → 主从不一致。
- 若「先写 binlog 成功、redo 没写」就宕机 → 从库有这行数据，主库恢复后没有 → 主从不一致。
- 两阶段提交后：宕机重启时，检查 redo 处于 `prepare` 状态的记录，**如果对应的 binlog 已完整写入，则提交；否则回滚**。这样主从始终一致。

```
崩溃恢复判断逻辑（简化伪代码）：
if redo 事务处于 prepare 态:
    if binlog 里能找到该事务的完整记录:
        提交（redo 置 commit，恢复数据）    // 从库会有，主库必须有
    else:
        回滚（丢弃）                       // 从库没有，主库也不能有
```

::: tip 💡 面试题：redo log 和 binlog 的区别？为什么要两阶段提交？
一句话结论：redo 是 InnoDB 物理日志、循环写、用于崩溃恢复；binlog 是 Server 逻辑日志、追加写、用于主从复制；两阶段提交是为了保证两份日志一致，避免主从不一致。原因：两者归属不同层、用途不同，提交时用「redo prepare → binlog → redo commit」的 2PC 保证原子性。
:::

---

### 4. MVCC 详解（ReadView 可见性算法）

**背景**：基础篇讲了 MVCC 的「版本链」概念，这里深入「**ReadView 到底怎么判断一个版本可见**」，这是 MVCC 的核心算法，也是「RC 和 RR 为什么表现不同」的根本原因。

#### 4.1 三个隐藏列与版本链（回顾 + 深化）

每次修改一行，InnoDB 都会在 undo log 里生成一个旧版本，行记录的 `DB_ROLL_PTR`（7 字节回滚指针）把这些旧版本串成链，`DB_TRX_ID`（6 字节）标记每个版本是由哪个事务修改的：

```
最新版本 trx_id=100 ──roll_ptr──► 旧版本 trx_id=90 ──roll_ptr──► 旧版本 trx_id=70 ──► NULL
（当前行数据）                     （undo log 记录）               （更老）
```

#### 4.2 ReadView 结构

快照读时，事务会生成一个 ReadView，它记录「**当前有哪些事务还没提交**」，据此判断版本链里哪些版本可见：

```
ReadView {
  m_ids[]        : 生成 ReadView 时，所有「活跃（未提交）」事务的 id 列表
  min_trx_id     : m_ids 中的最小值
  max_trx_id     : 下一个将被分配的事务 id（= 当前最大已分配 id + 1）
  creator_trx_id : 创建 ReadView 的事务自己的 id
}
```

#### 4.3 可见性判断算法（简化源码逻辑）

对于版本链上的某个版本，其修改事务 id 为 `trx_id`，判断规则：

```
1. trx_id == creator_trx_id            → 自己改的，可见 ✅
2. trx_id <  min_trx_id                → 生成 ReadView 前已提交，可见 ✅
3. trx_id >= max_trx_id                → 生成 ReadView 后才启动，不可见 ❌
4. min_trx_id <= trx_id < max_trx_id   → 落在活跃区间：
   - trx_id 在 m_ids 中（未提交）      → 不可见 ❌
   - trx_id 不在 m_ids 中（已提交）     → 可见 ✅
不可见则顺着 roll_ptr 找上一个旧版本，重复上述判断。
```

**用一句话概括**：一个版本只有「在 ReadView 生成那一刻，它的修改事务已经提交」才对当前事务可见。

#### 4.4 RC 与 RR 的本质区别：ReadView 生成时机

| 隔离级别 | ReadView 生成时机 | 后果 |
| --- | --- | --- |
| 读已提交 RC | **每次** SELECT 都生成新 ReadView | 别的事务提交后，下次能读到 → 出现不可重复读 |
| 可重复读 RR | 事务内**第一次** SELECT 生成，之后**复用** | 全程看到一致快照 → 解决不可重复读 |

```text
RR 下：事务 A 第一次 SELECT 生成 ReadView（记住那一刻的活跃事务）
之后即使别的事务提交了新版本，事务 A 仍按同一个 ReadView 判断 → 看到的还是旧快照
RC 下：每次 SELECT 都刷新 ReadView → 别的事务一提交，下次就能看到 → 数据会变
```

#### 4.5 快照读 vs 当前读

| 读类型 | 触发 | 机制 | 加锁 |
| --- | --- | --- | --- |
| 快照读 | 普通 `SELECT` | MVCC 读历史版本 | 不加锁 |
| 当前读 | `SELECT ... FOR UPDATE` / `FOR SHARE`、`UPDATE`/`DELETE`/`INSERT` | 读最新版本 | 加锁 |

**为什么 RR 能解决幻读**：快照读靠 MVCC（ReadView 固定，新插入的行不可见）；当前读靠**间隙锁**（锁住区间，别的事务插不进来）。

::: tip 💡 面试题：MVCC 的实现原理？RC 和 RR 的 ReadView 区别？
一句话结论：MVCC 用「undo log 版本链 + ReadView 可见性判断」让读不加锁也能看到一致的历史版本；RC 每次读都生成新 ReadView，RR 只用第一次的 ReadView。原因：ReadView 记录了「生成时哪些事务未提交」，据此判断版本链上每个版本是否可见。
:::

**小结**：MVCC = 版本链（数据来源）+ ReadView（可见性规则）。它解决了「读不加锁也能隔离」的问题，是 InnoDB 高并发读的核心，也是「RR 下可重复读」的根本机制。

---

### 5. 锁体系详解

**背景**：MVCC 解决了「读」的并发，但「写」之间、当前读之间仍要靠锁协调。InnoDB 的锁比「共享锁/排他锁」复杂得多，尤其是 RR 下解决幻读用的**间隙锁**，是面试重灾区。

#### 5.1 行锁三兄弟（Record / Gap / Next-Key）

| 锁 | 锁住范围 | 作用 |
| --- | --- | --- |
| **Record Lock 记录锁** | 锁一条索引记录本身 | 防止该行被并发修改 |
| **Gap Lock 间隙锁** | 锁索引记录之间的「间隙」（不含记录） | 防止别的事务在间隙里插入（**防幻读**） |
| **Next-Key Lock** | 记录锁 + 该记录前面的间隙锁 | 左开右闭区间，RR 下默认的行锁形态 |

```
索引记录:   1    5    9    13
间隙:     ( -∞ ,1 ) (1,5) (5,9) (9,13) (13,+∞)

加 Next-Key Lock 在 5 上 → 锁住 (1,5] 这个区间
  = Record Lock(锁 5 这条记录) + Gap Lock(锁 (1,5) 这个间隙，防止插入 2/3/4)
```

#### 5.2 加锁规则（RR 隔离级别下）

| 查询类型 | 加锁结果 |
| --- | --- |
| 等值查询命中**唯一索引** | 只加 Record Lock（精确锁那一行） |
| 等值查询命中**非唯一索引** | 加 Next-Key Lock（锁记录 + 前后间隙，防止幻读） |
| 范围查询 | 给扫描过的区间加 Next-Key Lock |

```sql
-- 当前读，会加锁（快照读不加）
SELECT * FROM user WHERE id = 5 FOR UPDATE;      -- 唯一索引等值 → Record Lock
SELECT * FROM user WHERE age = 20 FOR UPDATE;    -- 非唯一索引等值 → Next-Key Lock
SELECT * FROM user WHERE id > 5 FOR UPDATE;      -- 范围 → Next-Key Lock 区间
```

::: tip 💡 面试题：间隙锁（Gap Lock）解决什么问题？什么时候加？
一句话结论：间隙锁锁住「索引记录之间的空隙」，防止别的事务在空隙里插入数据，从而解决 RR 下的幻读。原因：幻读的本质是「别的事务插入了新行」，间隙锁不让它插进来。展开：间隙锁只在 RR 及以上隔离级别生效，RC 下没有间隙锁（所以 RC 用 MVCC 解决不了当前读的幻读）。
:::

#### 5.3 其他常见锁

| 锁 | 说明 |
| --- | --- |
| **意向锁 IS/IX** | 表级锁，标识「表里某几行被加了共享/排他锁」，用于表锁与行锁的兼容性快速判断 |
| **自增锁 AUTO-INC** | 插入自增主键时，保证并发插入的自增值唯一（8.0 有优化，插入完即释放） |
| **MDL 元数据锁** | 保护表结构：DML 加 MDL 读锁，DDL 加 MDL 写锁；**长事务不提交会阻塞 DDL** |
| **表锁** | 锁整张表，MyISAM 只有这种；InnoDB 也支持手动 `LOCK TABLES` |

**关键认知**：InnoDB 的**行锁是加在索引上的**。如果 UPDATE/DELETE 的 WHERE 条件没走索引，行锁退化成「锁全表所有记录的行锁」，极易引发锁等待和死锁。

#### 5.4 死锁

**产生**：两个事务互相持有对方需要的锁，形成循环等待。

```text
事务A：先锁 id=1，再要锁 id=2
事务B：先锁 id=2，再要锁 id=1
  A 持有 1 等 2，B 持有 2 等 1 → 死锁 💀
```

**InnoDB 怎么处理**：

1. **死锁检测**：维护「等待图」，发现环就主动回滚其中一个事务（回滚代价小的）。
2. **锁等待超时**：`innodb_lock_wait_timeout`（默认 50s），等不到就超时报错。

**避免死锁的实用方法**：

1. 按**固定的顺序**访问表和行（都先锁 id 小的）。
2. 事务尽量**短小**，减少持锁时间。
3. **给 WHERE 加索引**，避免锁全表。
4. 尽量用一次性锁住所有需要的资源（`SELECT ... FOR UPDATE` 提前加锁）。

::: tip 💡 面试题：死锁是怎么产生的？如何避免？
一句话结论：死锁是两个事务互相等待对方持有的锁形成循环等待；InnoDB 用死锁检测回滚其中一个来打破。原因：加锁顺序不一致 + 持锁时间过长导致。展开：避免方法是「统一加锁顺序、缩短事务、WHERE 加索引避免锁全表」。
:::

#### 5.5 乐观锁 vs 悲观锁

| 方案 | 思路 | 实现 | 适用 |
| --- | --- | --- | --- |
| 悲观锁 | 认为冲突会发生，先加锁再操作 | `SELECT ... FOR UPDATE` | 写冲突频繁 |
| 乐观锁 | 认为冲突不常发生，提交时校验 | 版本号/时间戳 `WHERE version = ?` | 读多写少 |

```sql
-- 悲观锁：先锁住这行再改
SELECT balance FROM account WHERE id = 1 FOR UPDATE;
UPDATE account SET balance = balance - 50 WHERE id = 1;

-- 乐观锁：用版本号 CAS，失败重试
UPDATE account SET balance = balance - 50, version = version + 1
WHERE id = 1 AND version = 5;   -- 如果 version 变了，影响行数为 0，说明被并发改过
```

---

### 6. 主从复制

**背景**：单机 MySQL 有「读压力大、单点故障」两个问题。主从复制用「一主多从」实现读写分离和数据冗余，是所有高可用方案的地基。

#### 6.1 复制原理（三个线程）

```
Master：
  └─ binlog dump 线程：从库连接上来后，把主库的 binlog 变更推送给从库

Slave：
  ├─ IO 线程：接收主库的 binlog，写到本地的 relay log（中继日志）
  └─ SQL 线程：读取 relay log，重放其中的 SQL，完成数据同步
```

```
复制流程：
1. 从库执行 CHANGE MASTER，记录主库地址和 binlog 位点
2. 从库 IO 线程连主库，主库起 binlog dump 线程推 binlog
3. 从库 IO 线程写 relay log
4. 从库 SQL 线程重放 relay log
5. 从库更新自己的数据，与主库保持一致
```

#### 6.2 复制模式

| 模式 | 说明 | 特点 |
| --- | --- | --- |
| **异步复制**（默认） | 主库写完不等待从库确认 | 性能好，但故障可能丢数据 |
| **半同步复制** | 主库至少等一个从库确认「收到 binlog」才返回 | 减少丢失，性能略降 |

#### 6.3 主从延迟的原因与解决（高频）

**延迟原因**：

1. 从库是**单线程重放**（MySQL 5.7 前 SQL 线程只有 1 个），主库并发写，从库串行重放，追不上。
2. **大事务**：一个大事务在从库要重放很久。
3. 从库配置比主库低、从库还要扛读流量。
4. 网络延迟。

**解决**：

1. **并行复制 MTS**（5.7 后）：SQL 线程多线程重放（`slave_parallel_workers`）。
2. **半同步复制**：降低数据丢失和延迟。
3. 大事务拆分。
4. 读写分离时，对**强一致读强制走主库**（或主库读 + 从库延迟兜底）。

::: tip 💡 面试题：主从复制的原理？主从延迟怎么处理？
一句话结论：主库 binlog dump 线程推送 binlog，从库 IO 线程写 relay log、SQL 线程重放实现同步；延迟靠并行复制、半同步、拆分大事务解决。原因：主库并发写、从库串行重放是延迟的根源。展开：强一致读要读主库，不能读可能有延迟的从库。
:::

---

### 7. 高可用架构

**背景**：主从解决了读压力和备份，但「主库挂了怎么办」「数据量太大单库扛不住怎么办」需要更高阶的架构。

#### 7.1 常见架构演进

```
单体 MySQL
   │ 读压力大 / 需要备份
   ▼
一主多从 + 读写分离（写主读从）
   │ 主库单点故障
   ▼
主从 + 自动切换（MHA / MGR / 云 RDS 高可用版）
   │ 单库数据量/并发上限
   ▼
分库分表（水平拆分） + 主从（每个分片再带从库）
```

#### 7.2 各方案对比

| 方案 | 解决什么 | 关键点 |
| --- | --- | --- |
| 主从复制 | 读扩展、数据冗余 | 读写分离，有主从延迟 |
| 半同步复制 | 降低主从延迟和丢数据 | 至少一个从确认 |
| MHA | 主库故障自动切换 | 选新主 + 补齐 binlog，减少丢数据 |
| MGR（组复制） | 多主/高可用，基于 Paxos | 强一致，但配置复杂 |
| 分库分表 | 突破单库容量/并发上限 | 数据水平拆分，见 [分库分表](/learn_database/分库分表) |

**读写分离的坑**：主从延迟导致「刚写入立刻读从库读到旧值」。解决方案：写后立即读走主库、或强制路由主库、或容忍短暂延迟。

::: tip 💡 面试题：MySQL 高可用怎么设计？
一句话结论：主从 + 读写分离扛读，MHA/半同步做故障切换，数据量再大就分库分表。原因：先解决读扩展，再解决单点故障，最后解决容量上限。展开：强一致读走主库，从库只服务能容忍延迟的读。
:::

---

### 高级篇小结

- SQL 优化 = 慢日志定位 + EXPLAIN 诊断（type/key/Extra）+ 对症下药（建索引/覆盖索引/游标分页）。
- 三大日志分工：redo 崩溃恢复、binlog 主从复制、undo 回滚 + MVCC；两阶段提交保证 redo/binlog 一致。
- MVCC = 版本链 + ReadView，RC 每次读新建 ReadView，RR 复用第一个；快照读不加锁、当前读加锁。
- 锁体系核心：Record/Gap/Next-Key 三兄弟，间隙锁防幻读，行锁加载索引上，没索引锁全表。
- 高可用演进：主从读写分离 → 半同步/MHA 故障切换 → 分库分表。

---

## 原理篇

### 1. InnoDB 存储结构（表空间 → 段 → 区 → 页 → 行）

**背景**：理解了 InnoDB 的物理存储结构，才能理解「为什么页大小是 16KB」「为什么说 B+ 树一个节点就是一个页」「什么是页断裂」。这是从「会用」到「懂原理」的分水岭。

**五级结构**：

```
表空间 tablespace（.ibd 文件，一张表一个或共享）
  └─ 段 segment（叶子节点段、非叶子节点段、回滚段、数据段）
       └─ 区 extent（固定 1MB = 64 个连续页，用于大块分配）
            └─ 页 page（默认 16KB，IO 最小单位，也是 B+ 树节点）
                 └─ 行 row（真实数据）
```

- **页**是 InnoDB 磁盘 IO 的最小单位，也是 B+ 树的「一个节点」。这就是「一个 16KB 页能放几百个 key」这句话的物理含义。
- **区**是 64 个连续页（1MB），连续分配减少随机 IO；大表为省空间会先分配碎片页。
- **段**按用途区分：叶子节点段（存数据）、非叶子节点段（存索引）、回滚段（存 undo）。

```
为什么一个节点 = 一个页：
B+ 树磁盘上的每个节点就是读一次磁盘（一次 IO），
节点大小 = 页大小 = 16KB，所以「树高 = 磁盘 IO 次数」，
树越矮 IO 越少 → 这就是 B+ 树选「矮胖」的根本原因。
```

---

### 2. 页结构与行格式（字节级布局）

**背景**：面试常问「一行数据占多少字节」「varchar 到底怎么存」，答案都在页和行格式的字节级布局里。

#### 2.1 页结构（16KB 的组成）

```
┌──────────────────────────────┐
│ File Header        (38 字节) │  页类型、页号、上一页/下一页指针、LSN
│ Page Header        (56 字节) │  页内记录数、槽数、空闲空间起始等
│ Infimum + Supremum (26 字节) │  最小记录 / 最大记录（虚拟记录，边界）
│ User Records      （动态）   │  实际用户数据行，按主键有序排列
│ Free Space        （动态）   │  空闲空间，插入时从这里分配
│ Page Directory    （动态）   │  槽数组，二分查找定位记录
│ File Trailer       (8 字节)  │  校验和 + LSN，检测页是否完整
└──────────────────────────────┘
```

**Page Directory 的作用**：把记录分组，每组一个槽，槽里存「组内最大记录的位置」，查找时用**二分法**先定位到组，再组内顺序找，把页内查找从 O(n) 降到 O(log n)。

#### 2.2 行格式（Compact 为例）

```
Compact 行格式（字节级）：
┌──────────────────────────────────────────────────────────────┐
│ 变长字段长度列表（逆序）│ NULL 位图 │ 记录头(5 字节) │
│ 列1数据 │ 列2数据 │ ...                                    │
│ 隐藏列：DB_TRX_ID(6B) │ DB_ROLL_PTR(7B) │ [DB_ROW_ID(6B)] │
└──────────────────────────────────────────────────────────────┘
```

**各部分含义**：

| 部分 | 说明 |
| --- | --- |
| 变长字段长度列表 | 记录每个 VARCHAR 等变长字段的**实际长度**，逆序存放（靠近记录头的是最后一列的长度） |
| NULL 位图 | 用 bit 标记哪些列是 NULL（NULL 列不存数据，省空间） |
| 记录头 | 含 `next_record`（指向下一条记录的偏移）、是否删除标记等 |
| 隐藏列 | `DB_TRX_ID` 事务 id、`DB_ROLL_PTR` 回滚指针、`DB_ROW_ID`（无主键时才生成） |

**行格式对比**：

| 行格式 | 特点 |
| --- | --- |
| Redundant | 老格式，MySQL 5.0 之前 |
| **Compact** | 紧凑，5.1 后默认，支持变长字段 |
| **Dynamic** | 5.7 后默认，大字段溢出时只存 20 字节指针（BLOB/TEXT 更高效） |
| Compressed | 在 Dynamic 基础上支持页压缩 |

```text
为什么 varchar(10) 存 1 个字符比存 10 个字符省空间：
VARCHAR 是变长存储，实际只占「字符真实字节数 + 1~2 字节长度标记」，
不像 CHAR(10) 定长，存 1 个字符也占满 10 个字符的空间（补空格）。
```

::: tip 💡 面试题：一行数据在磁盘上占多少字节？varchar 是怎么存的？
一句话结论：一行 = 变长长度列表 + NULL 位图 + 记录头 + 各列数据 + 隐藏列（事务id 6B + 回滚指针 7B）。原因：变长字段用「长度列表」记录真实长度，NULL 用位图标记，隐藏列支撑 MVCC。展开：所以算行大小要把隐藏列也算进去，这也是「一个页能放多少行」的估算依据。
:::

---

### 3. Buffer Pool（缓冲池）

**背景**：InnoDB 的数据都在磁盘，但磁盘太慢。Buffer Pool 是内存里缓存数据页和索引页的区域，MySQL 读写的性能大头都靠它。它本质上和操作系统的页缓存是一个思想。

#### 3.1 结构（三个链表）

```
Buffer Pool（内存页缓存）
  ├─ Free List（空闲链表）：还没被使用的空闲页
  ├─ LRU List（LRU 链表）：已缓存的页，按冷热分区管理
  └─ Flush List（脏页链表）：被修改但还没刷盘的脏页
```

- **读**：先查 Buffer Pool，命中直接返回；未命中从磁盘读页放进去。
- **写**：先改 Buffer Pool 里的页（变成脏页），先写 redo log，脏页**异步**刷盘。

#### 3.2 LRU 冷热分离（重点）

**背景问题**：预读或全表扫描会把大量「用一次就不再用」的页塞进 Buffer Pool，把真正热点的数据挤出去（LRU 污染）。

**解决方案**：LRU 链表按 5:3 分为两段——前 5/8 是**热区（young）**，后 3/8 是**冷区（old）**：

```
┌──────────────────────────────┬───────────────────────┐
│  热区 young（5/8）            │  冷区 old（3/8）        │
│  经常被访问的热数据            │  刚读入的数据先放这      │
└──────────────────────────────┴───────────────────────┘
        ▲                          ▲
      LRU 头                    中间点（midpoint）
```

- 新读入的页**先放冷区头部**，只有「在冷区待够一定时间（`innodb_old_blocks_time`，默认 1s）再被访问」才会晋升到热区。
- 这样全表扫描/预读的页还没「转正」就被淘汰，不会污染热区。

#### 3.3 Change Buffer（写缓冲）

**背景**：写二级索引时，如果目标页不在 Buffer Pool，直接读盘再写会带来随机 IO。Change Buffer 把「对二级索引的修改」先记下来，等目标页真正读入 Buffer Pool 时再合并（merge）。

- **适用**：二级索引的 INSERT/UPDATE/DELETE，且页不在 Buffer Pool。
- **不适用**：唯一索引（因为要读盘校验唯一性，无法缓冲）。
- **意义**：把「随机读盘再写」变成「缓冲延迟合并」，减少随机 IO。

#### 3.4 脏页刷盘时机

1. **redo log 快满**：必须刷脏页推进 checkpoint（否则 redo 写满阻塞写）。
2. **Buffer Pool 内存不足**：淘汰页时若被淘汰的是脏页，先刷盘。
3. **空闲时**：后台线程慢慢刷。
4. **正常关闭**：全部刷盘。

::: tip 💡 面试题：Buffer Pool 的 LRU 为什么要冷热分离？脏页什么时候刷盘？
一句话结论：冷热分离防止「全表扫描/预读」污染热区，把用一次的数据和热点数据分开；脏页在 redo 快满、内存不足、空闲、关闭时刷盘。原因：新读入的页先放冷区，待够时间再晋升，避免一次性读取把热数据挤掉。
:::

---

### 4. 崩溃恢复

**背景**：InnoDB 凭什么「宕机不丢已提交数据」？靠 redo log 重放 + doublewrite 双写保护，这一节讲清两者的原理。

#### 4.1 redo log 重放

- 事务提交时 redo log 已落盘（保证持久性），但数据页可能还没刷盘（还在 Buffer Pool）。
- 宕机重启后，重放 redo log 里「已提交但数据页未落盘」的记录，把数据恢复到崩溃前状态。
- 用 **LSN（日志序列号）** 记录 redo 写到了哪里、数据页刷到了哪里，两者比较就知道哪些要重放。

```
LSN 比较：
redo log 的 LSN  >  数据页的 LSN   →  说明该页的修改还没刷盘，需要重放
redo log 的 LSN  <= 数据页的 LSN   →  已落盘，跳过
```

#### 4.2 doublewrite（双写缓冲）

**背景问题**：**页断裂（torn page）**——InnoDB 的页是 16KB，但操作系统/磁盘一次 IO 可能只写 4KB（扇区），如果刷脏页时写到一半宕机，这个 16KB 页就「一半新一半旧」损坏了，而 redo log 是物理日志（记录页内偏移的修改），无法修复一个「结构损坏」的页。

**解决方案**：刷脏页时先顺序写到磁盘上的 doublewrite buffer（连续 128 个页 = 2MB），再写回真实数据页位置。若写真实位置时宕机导致页损坏，重启后从 doublewrite buffer 找到完整副本恢复。

```
doublewrite 流程：
1. 脏页先顺序写入 doublewrite buffer（连续磁盘区域，快）
2. 再写回表空间里每个页的真实位置（随机写，可能页断裂）
3. 若第 2 步宕机页损坏 → 重启时用 doublewrite buffer 的副本覆盖修复
```

**为什么 doublewrite 能解决问题**：它相当于给「随机写数据页」加了一层「先顺序写一份完整副本」的保护，页断裂时还有个完整备份可恢复。

::: tip 💡 面试题：doublewrite 是什么？解决什么问题？
一句话结论：doublewrite 是刷脏页前先顺序写一份完整副本，解决「页断裂」导致的页损坏。原因：16KB 的页可能写一半宕机，物理 redo log 无法修复结构损坏的页。展开：宕机后从 doublewrite buffer 恢复完整页，再配合 redo log 重放，保证数据不丢。
:::

---

### 5. 事务实现原理（redo/undo 协同）

**背景**：基础篇说了 ACID 各靠什么实现，这里把「一条 update 从执行到落盘」的完整链路串起来，把 redo/undo/binlog 放到一起看它们如何协同。

#### 5.1 ACID 与日志的对应关系（回顾）

| 特性 | 靠什么 | 机制 |
| --- | --- | --- |
| 原子性 A | undo log | 回滚时用旧值还原 |
| 持久性 D | redo log + WAL | 提交即落盘，崩溃重放恢复 |
| 隔离性 I | MVCC + 锁 | 读走快照，写加锁 |
| 一致性 C | 以上三者 | 是最终目标，不是单独机制 |

#### 5.2 一条 UPDATE 的完整生命周期（源码级流程）

```sql
UPDATE account SET balance = balance - 50 WHERE id = 1;
```

```
① 执行器：调用 InnoDB 接口，通过主键索引在 Buffer Pool 找到 id=1 这一行
② 记录 undo log：把旧值 balance=100 写入 undo log（用于回滚和 MVCC）
③ 修改内存数据页：把 Buffer Pool 里的 balance 改成 50（页变脏页）
④ 写 redo log（prepare 态）：记录「对某页某偏移做了什么修改」
⑤ 写 binlog：记录这条 update 的逻辑（row 格式记录前后值）
⑥ redo log 置为 commit 态（两阶段提交完成）
⑦ 返回客户端「成功」
⑧ 后台异步：脏页刷盘、undo log 回收、redo log 循环推进 checkpoint
```

**为什么先写 undo 再改数据**：如果先改数据后写 undo，写 undo 时宕机，数据已经改了却没记录旧值，就无法回滚了。先记 undo 保证「任何时候都能退回旧值」。

**为什么先写 redo 再改数据（WAL）**：redo 记录「要改成什么」，数据页改的是内存，redo 先落盘，即使内存改完没刷盘就宕机，也能用 redo 重放恢复。顺序是先写 redo（prepare）→ 改内存 → 写 binlog → redo commit。

::: tip 💡 面试题：一条 UPDATE 从执行到落盘经历了什么？
一句话结论：找行 → 写 undo（旧值）→ 改内存页 → 写 redo（prepare）→ 写 binlog → redo 置 commit，返回成功后脏页异步落盘。原因：undo 保证能回滚，redo 保证崩溃能恢复，两阶段提交保证主从一致。
:::

#### 5.3 事务提交的 group commit（组提交）

为了提高性能，多个事务的 binlog 刷盘和 redo 刷盘可以「攒一批一起刷」（`binlog_group_commit_sync_delay` 等参数控制），把多次 fsync 合并成一次，提升写吞吐。

---

### 原理篇小结

- InnoDB 存储五级结构：表空间 → 段 → 区 → 页 → 行，页 16KB 是 IO 最小单位、也是 B+ 树节点。
- 页结构含 Page Directory 支持页内二分查找；行格式含变长长度列表、NULL 位图、隐藏列。
- Buffer Pool 用冷热分离 LRU 防止污染，Change Buffer 缓冲二级索引写，脏页按需刷盘。
- 崩溃恢复靠 redo 重放（LSN 判断）+ doublewrite（防页断裂）。
- 事务实现 = undo（回滚）+ redo（持久化）+ binlog（复制），两阶段提交串起 redo 与 binlog。

---

## 面试常问

> 以下是把全篇精华压成「一句话到三句话」的速记版，适合面试前快速过一遍。

**架构与引擎**

- **Q：MySQL 逻辑架构分几层？** A：Server 层（连接、分析、优化、执行）和存储引擎层（可插拔），binlog 在 Server 层，redo/undo 在 InnoDB 引擎层。
- **Q：InnoDB 和 MyISAM 区别？** A：InnoDB 支持事务、行级锁、崩溃恢复，是生产默认；MyISAM 只支持表锁、无事务，适合只读归档。
- **Q：一条 SQL 的执行过程？** A：连接器 → 分析器 → 优化器（定执行计划）→ 执行器（调引擎接口），InnoDB 内部走 redo/undo/binlog。

**索引**

- **Q：为什么索引用 B+ 树？** A：树矮（IO 少）、叶子节点有序双向链表（支持范围）、查询稳定（都要走到叶子）。
- **Q：聚簇索引和二级索引区别？** A：聚簇索引叶子存整行数据（一表一个），二级索引叶子存「索引列 + 主键」，查完回表。
- **Q：什么是回表、覆盖索引？** A：二级索引查完拿主键回聚簇索引查整行叫回表；查询列全在二级索引里就不回表，叫覆盖索引。
- **Q：最左前缀原则？** A：联合索引 (a,b,c) 等价于 (a)、(a,b)、(a,b,c)，查询必须从最左列连续匹配才能走索引。
- **Q：索引失效的常见场景？** A：列上做函数/运算、隐式类型转换、前置模糊 `LIKE '%x'`、破坏最左前缀、OR 连非索引列。

**事务与 MVCC**

- **Q：ACID 各靠什么实现？** A：原子性靠 undo log，持久性靠 redo log，隔离性靠 MVCC + 锁，一致性由前三者共同保证。
- **Q：四种隔离级别及区别？** A：读未提交 / 读已提交 / 可重复读（默认）/ 串行化，隔离性递增、并发性递减。
- **Q：MVCC 原理？** A：undo log 版本链 + ReadView 可见性判断，读不加锁也能看到一致历史版本。
- **Q：RC 和 RR 的 ReadView 区别？** A：RC 每次读都生成新 ReadView（会不可重复读），RR 复用第一次的 ReadView（解决不可重复读）。
- **Q：快照读和当前读？** A：普通 SELECT 是快照读（MVCC 不加锁）；FOR UPDATE/UPDATE/DELETE 是当前读（读最新、加锁）。

**锁**

- **Q：Record/Gap/Next-Key Lock 区别？** A：Record 锁一行，Gap 锁区间（防幻读），Next-Key = 记录 + 间隙（RR 默认）。
- **Q：间隙锁解决什么？** A：锁住索引记录之间的空隙，防止插入，解决 RR 下当前读的幻读。
- **Q：为什么行锁会锁全表？** A：行锁加载索引上，UPDATE 的 WHERE 没走索引时，退化成锁所有记录。
- **Q：死锁怎么处理？** A：InnoDB 检测等待图回滚一个事务；避免方法是统一加锁顺序、缩短事务、加索引。

**日志与崩溃恢复**

- **Q：redo log 和 binlog 区别？** A：redo 是 InnoDB 物理日志、循环写、崩溃恢复；binlog 是 Server 逻辑日志、追加写、主从复制。
- **Q：两阶段提交为什么？** A：保证 redo 和 binlog 一致，避免主从不一致；流程是 redo prepare → binlog → redo commit。
- **Q：doublewrite 解决什么？** A：页断裂——16KB 页写一半宕机损坏，先顺序写副本再写真实位置，损坏时用副本恢复。

**SQL 优化**

- **Q：EXPLAIN 看什么？** A：type（不能是 ALL）、key（不能是 NULL）、Extra（不能有 filesort/temporary）。
- **Q：深分页怎么优化？** A：大 offset 要丢弃大量行，用 `WHERE id > 上次id` 游标分页或延迟关联。
- **Q：Buffer Pool 冷热分离为什么？** A：防止全表扫描/预读污染热区，新页先放冷区、待够时间再晋升。

**主从与高可用**

- **Q：主从复制原理？** A：主库 dump 线程推 binlog，从库 IO 线程写 relay log、SQL 线程重放。
- **Q：主从延迟怎么解决？** A：并行复制、半同步、拆分大事务，强一致读走主库。

---

## 相关知识

- [Redis](/learn_database/Redis)：同为数据库，Redis 是内存 KV + 缓存，常与 MySQL 组成「缓存 + 数据库」架构，缓存三大问题、缓存一致性都和 MySQL 强相关。
- [分库分表](/learn_database/分库分表)：MySQL 单库容量/并发到上限后的水平拆分方案，是主从复制之后的下一步演进。
- [Java集合](/learn_backend/java/Java核心/Java集合)：JDK 里的数据结构（HashMap 的哈希冲突、TreeMap 的红黑树）与 MySQL 的索引/B+ 树对比理解。
- [并发编程](/learn_backend/java/Java核心/并发编程)：Java 的锁、CAS、乐观锁/悲观锁思想，与 MySQL 的行锁、MVCC、乐观锁对照。
- [JVM](/learn_backend/java/Java核心/JVM)：JVM 内存模型与 Buffer Pool、LRU 等「内存缓存」思想相通。
- [MyBatis](/learn_backend/java/基础/MyBatis)：Java 操作 MySQL 的主流 ORM 框架，SQL 与索引优化最终落地在这里。
- [Seata](/learn_backend/java/微服务/Seata)：分布式事务框架，理解 MySQL 本地事务的 ACID 是理解 Seata（AT/XA）的前置。
- [RocketMQ](/learn_backend/java/微服务/RocketMQ)：MySQL binlog 常配合 MQ 做数据同步和缓存一致性（Canal + MQ 方案）。
- [分布式基础](/learn_backend/java/微服务/分布式基础)：CAP、一致性、分布式锁等概念，是 MySQL 主从、分库分表、分布式事务的理论背景。
