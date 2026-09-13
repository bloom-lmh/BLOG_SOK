# MySQL

一句话定位：MySQL 是互联网行业最主流的关系型数据库（RDBMS），用 SQL 把结构化数据组织成二维表来存储，解决「数据持久化 + 强一致性 + 复杂关联查询 + 高并发读写」的问题，是绝大多数后端系统的默认存储底座。

## 目录

- [SQL 语法与面试写题](/learn_database/MySQL-SQL语法与面试写题)：JOIN、子查询、窗口函数与高频手写 SQL
- [SQL 优化实战](/learn_database/MySQL-SQL优化实战)：慢 SQL 定位、执行计划、索引设计与改写验证
- [MySQL 练习数据库](/learn_database/MySQL-练习数据库)：课程商城业务数据、事务锁实验与百万级 SQL 优化数据
- [MySQL 运维与排障](/learn_database/MySQL-运维与排障)：运行日志、线上排障、备份恢复、复制、读写分离与高可用
- [基础篇](#基础篇)：逻辑架构、存储引擎、数据类型、SQL 体系、常用函数、索引、事务与隔离级别
- [高级篇](#高级篇)：SQL 优化、EXPLAIN、日志、MVCC、锁、主从与高可用、视图、存储程序、常用工具
- [原理篇](#原理篇)：InnoDB 存储结构、页与行格式字节级布局、Buffer Pool、崩溃恢复、事务实现原理
- [面试常问](#面试常问)
- [相关知识](#相关知识)

---

## 基础篇

### 1. 认识 MySQL 与整体架构

**定义**：MySQL 是一个 C/S 架构的关系型数据库管理系统。客户端通过 MySQL 协议发送 SQL，服务端负责理解 SQL、制定执行方案，并把具体的数据访问交给存储引擎。

#### 1.0 四个基础概念

| 概念 | 含义 | 关系 |
| --- | --- | --- |
| 数据库 DB | 按结构组织并持久化保存的数据集合 | 一个 MySQL 实例可以管理多个数据库 |
| 数据库管理系统 DBMS | 管理数据库的软件 | MySQL、PostgreSQL、Oracle 都是 DBMS |
| 关系型数据库 RDBMS | 使用二维表、关系、约束和 SQL 管理数据的 DBMS | MySQL 属于 RDBMS |
| SQL | 操作关系型数据库的标准语言 | 用于定义结构、增删改查、权限和事务控制 |

关系模型中，一张表由列和行组成：列描述属性及类型，行表示一条记录；主键唯一标识一行，外键或逻辑外键表示表之间的关系。

先记住整个架构最核心的一句话：

> **Server 层负责“理解 SQL、决定怎么执行”，存储引擎负责“真正读写数据”。**

#### 1.1 整体分层

```text
客户端
JDBC / mysql-cli / Navicat
        │
        ▼
Server 层（所有存储引擎共用）
连接器 → 解析与语义检查 → 优化器 → 执行器
        │
        ▼ 统一的存储引擎接口
存储引擎层（按表选择、可以替换）
InnoDB / MyISAM / MEMORY / CSV / ARCHIVE ...
        │
        ▼
内存与磁盘中的数据页、索引和日志
```

这两层的职责边界一定要分清：

| Server 层 | 存储引擎层（以 InnoDB 为例） |
| --- | --- |
| 建立连接、认证、权限管理 | 数据页和表空间 |
| SQL 解析、名称解析、语义检查 | B+Tree 索引的组织和访问 |
| SQL 改写与执行计划优化 | Buffer Pool |
| 调度执行并返回结果 | 事务、MVCC、行锁 |
| binlog、函数、存储过程、触发器、视图 | redo log、undo log、崩溃恢复 |

::: warning 查询缓存不属于现代 MySQL 的执行主链
旧版本会在解析 SQL 前检查查询缓存，但表发生任何修改都可能导致相关缓存失效，维护成本很高。查询缓存及其配置项已在 MySQL 8.0.3 移除，因此学习 MySQL 8 时，执行流程直接记为：**连接 → 解析 → 优化 → 执行 → 存储引擎**。
:::

#### 1.2 连接器：建立并管理会话

客户端先通过 TCP、Unix Socket 等方式和 MySQL 建立连接。连接器主要负责：

1. 建立连接并完成握手。
2. 校验用户名、密码和认证插件。
3. 建立当前会话，维护字符集、时区、事务隔离级别等会话状态。
4. 校验当前账号是否具有相应权限。
5. 管理连接空闲、断开和最大连接数。

```text
Java 应用
  ↓ DataSource / HikariCP 从连接池借连接
MySQL 连接器
  ↓ 认证成功后建立 Session
后续 SQL 复用该连接执行
```

注意：Spring Boot 中常说的 HikariCP 是**客户端连接池**。它缓存并复用已经建立的数据库连接，避免每条 SQL 都重新进行 TCP 握手和身份认证，并不是 MySQL Server 内部的查询缓存。

#### 1.3 解析与语义检查：判断 SQL“写得对不对”

为了便于理解，很多资料把这一阶段统一称为“分析器”，内部可以继续拆成：

| 阶段 | 作用 | 示例 |
| --- | --- | --- |
| 词法分析 | 把 SQL 拆成关键字、表名、列名、常量等 Token | 识别 `SELECT`、`course`、`id` |
| 语法分析 | 检查 Token 的组合是否符合 SQL 语法，生成语法树 | `SELEC * FROM course` 会报语法错误 |
| 名称解析/语义检查 | 根据数据字典解析表、列、别名和类型 | 表不存在、列不存在、列名歧义 |

例如：

```sql
SELECT title FROM course WHERE id = 10;
```

这一阶段会确定：这是查询语句；查询的是 `course` 表；需要读取 `title` 和 `id` 两列；这些对象是否真实存在、引用是否合法。

#### 1.4 优化器：决定 SQL“怎么执行”

同一句 SQL 可能有很多种执行方法。例如两张表连接时，可以先查课程表，也可以先查教师表；查询课程时，可以走主键索引、普通索引或者全表扫描。

优化器会根据统计信息和成本估算选择执行计划，主要决定：

- 使用哪个索引，还是全表扫描。
- 多表连接时的连接顺序。
- 使用哪种 Join 算法和访问路径。
- 条件能否下推、子查询能否改写。
- 是否需要排序、临时表和去重。

```sql
EXPLAIN SELECT title FROM course WHERE id = 10;
```

`EXPLAIN` 展示的是优化器选出的执行计划。优化器只是选择它认为成本最低的方案，并不保证永远选到实际运行最快的方案；统计信息过旧或数据分布不均时，也可能选错。

#### 1.5 执行器：按照执行计划调度执行

执行器不直接理解磁盘中的页结构，它根据执行计划调用存储引擎提供的统一接口，例如：

- 按主键或索引查找一行。
- 获取下一行。
- 插入、修改或删除一行。
- 创建和提交事务。

存储引擎返回记录后，执行器继续完成 Server 层过滤、表达式计算、聚合等工作，最后按照 MySQL 通信协议把结果返回客户端。

#### 1.6 一条 `SELECT` 的完整过程

```text
SELECT title FROM course WHERE id = 10;

① 连接器：使用当前数据库连接和会话接收 SQL
② 解析阶段：识别表、列、条件，完成语法和语义检查
③ 优化器：判断 id 是主键，选择主键索引访问
④ 执行器：按照计划调用 InnoDB 的索引查询接口
⑤ InnoDB：先在 Buffer Pool 查找数据页
   ├─ 命中：直接通过 B+Tree 定位记录
   └─ 未命中：从磁盘读取数据页到 Buffer Pool，再定位记录
⑥ InnoDB 把记录交给执行器，执行器把 title 返回客户端
```

#### 1.7 一条 `UPDATE` 的完整过程

```text
UPDATE user SET name = '张三' WHERE id = 1;

① 连接器：接收 SQL，确认当前连接和账号可用
② 解析阶段：解析表、列、赋值和 WHERE 条件
③ 优化器：选择主键索引定位 id = 1
④ 执行器：调用 InnoDB 的更新接口
⑤ InnoDB：读取数据页、加必要的锁、记录 undo、修改 Buffer Pool 中的数据页并产生 redo
⑥ 提交事务时：Server 层 binlog 与 InnoDB redo log 通过两阶段提交保持一致
⑦ 执行器向客户端返回受影响行数
```

##### “写 undo → 改内存 → redo prepare”到底是什么意思

假设把账户余额从 `100` 改为 `80`：

```text
① 把数据页读入 Buffer Pool
② 生成 undo 记录：保存足以把 80 恢复为 100 的回滚信息
③ 修改 Buffer Pool 中的数据页：balance 变为 80，该页成为脏页
④ 同时生成 redo 记录：保存崩溃后如何重做这次页修改

事务提交阶段：
⑤ redo log 刷盘并标记 prepare
⑥ Server 层写入并按配置刷盘 binlog
⑦ redo log 标记 commit
⑧ 脏数据页以后由后台线程异步刷回表空间
```

所以“改内存”不是只修改 Java 变量，而是修改 MySQL **Buffer Pool 中的数据页副本**。此时磁盘表空间里的数据页可能还是旧值：

- 事务要回滚：根据 `undo log` 执行反向修改。
- 事务已提交但数据页还没刷盘就宕机：重启后根据 `redo log` 恢复。
- `prepare → binlog → commit`：保证 InnoDB 的 redo 和 Server 层 binlog 对同一个事务保持一致。

更严谨地说，redo 记录是在修改数据页过程中不断生成的；`prepare` 是**事务提交阶段**对 redo 的状态标记，不是每修改一行才开始生成 redo。

::: tip 💡 面试题：一条 SQL 在 MySQL 中如何执行？
客户端先通过连接器建立会话；Server 层完成 SQL 解析和语义检查，优化器生成执行计划，执行器按照计划调用存储引擎接口；InnoDB 通过 Buffer Pool 和 B+Tree 读写数据，并用事务、锁和日志保证并发安全与持久性。
:::

#### 1.8 安装、启动和连接

MySQL 可以通过本机服务、Docker 或云数据库运行。学习环境建议使用 MySQL 8.x，并让项目、命令行和 IDEA 数据源连接同一个实例，避免“代码连的是 A，客户端看的却是 B”。

```powershell
# Windows：服务名以本机实际名称为准
Get-Service *mysql*
Start-Service MySQL84
Stop-Service MySQL84
```

```bash
# Linux systemd
systemctl status mysqld
systemctl start mysqld
systemctl stop mysqld

# 客户端连接；-p 后不要直接写密码，避免出现在命令历史中
mysql -h 127.0.0.1 -P 3306 -u root -p
```

常用图形客户端有 IntelliJ IDEA Database、DataGrip、Navicat 和 DBeaver。图形界面只是代替你输入连接参数并展示结果，底层仍然通过 MySQL 协议发送 SQL。

---

### 2. 存储引擎：真正管理数据的模块

#### 2.1 什么是存储引擎

存储引擎是 MySQL Server 内部一个**可插拔的数据访问模块**。它不是独立数据库，也通常不是单独进程，而是运行在 `mysqld` 中，通过统一接口接受执行器的调用。

可以把它理解为：

```text
Server 层：我要找到 course 表中 id = 10 的记录
        ↓ 调用统一接口
InnoDB：我知道数据页放在哪里、B+Tree 怎么走、是否要读磁盘
        ↓
返回记录给 Server 层
```

Server 层只提出“读取、插入、更新、删除哪条记录”，具体怎样组织文件、怎样建立索引、怎样加锁和恢复数据，由存储引擎决定。

#### 2.2 存储引擎负责什么

不同存储引擎可以采用完全不同的实现策略，通常需要负责：

1. **数据的物理存储**：数据放在什么文件、表空间和数据页中。
2. **索引组织**：使用 B+Tree、哈希还是不支持索引。
3. **缓存管理**：数据页和索引页怎样缓存在内存中。
4. **并发控制**：支持表锁还是行锁，怎样处理并发读写。
5. **事务能力**：是否支持提交、回滚、隔离级别和 MVCC。
6. **日志与恢复**：是否能够在宕机后恢复未落盘的数据。
7. **特定能力**：外键、全文索引、空间索引等是否支持。

下面这些不是存储引擎的主要职责：

- 不负责解析 SQL 语法。
- 不负责决定多表 Join 的整体执行计划。
- 不负责 JDBC、用户名密码认证。
- `binlog` 属于 Server 层，不属于 InnoDB。

#### 2.3 为什么说存储引擎“可插拔”

MySQL 为存储引擎定义了统一接口，因此：

- 同一个 MySQL 实例可以安装和支持多个引擎。
- 同一个数据库中的不同表可以选择不同引擎。
- 一张普通表在同一时刻只使用一种存储引擎。
- 上层应用仍然使用 SQL，一般不需要了解底层文件格式。

```sql
CREATE TABLE course (...) ENGINE = InnoDB;
CREATE TABLE temp_data (...) ENGINE = MEMORY;
```

这里两张表属于同一个数据库，但数据存储方式、事务能力和锁机制可能完全不同。

#### 2.4 MySQL 常见存储引擎

| 引擎 | 核心特点 | 典型用途/限制 |
| --- | --- | --- |
| `InnoDB` | 默认引擎；支持事务、行级锁、MVCC、外键和崩溃恢复 | 常规业务表的首选 |
| `MyISAM` | 不支持事务和外键，主要使用表级锁 | 旧系统或只读/读多写少场景；新业务通常不选 |
| `MEMORY` | 数据保存在内存中，访问快；服务重启后数据丢失 | 非关键的临时数据；不能代替 Redis |
| `CSV` | 表数据直接保存为 CSV 文本，不支持索引 | 与能读写 CSV 的程序交换数据 |
| `ARCHIVE` | 高压缩、适合追加和归档；不支持普通索引 | 很少查询的历史、审计数据 |
| `BLACKHOLE` | 接收写入但不保存数据，查询永远为空 | 特殊复制、日志转发和测试场景 |
| `MERGE` | 把结构相同的多个 MyISAM 表作为一张表访问 | 兼容旧系统，现代业务很少使用 |
| `FEDERATED` | 通过网络访问远程 MySQL 表，本地不保存数据 | 特殊远程表访问；默认通常未启用 |
| `NDB`/`NDBCLUSTER` | 面向 MySQL NDB Cluster 的分布式存储引擎 | 集群、高可用场景；不是普通单机 MySQL 的默认组件 |

实际安装支持哪些引擎，不要凭表格猜，直接执行：

```sql
SHOW ENGINES;
```

结果中的 `Support` 常见值：

| 值 | 含义 |
| --- | --- |
| `DEFAULT` | 已支持，并且是默认引擎 |
| `YES` | 已支持，但不是默认引擎 |
| `NO` | 当前版本或安装没有启用 |
| `DISABLED` | 编译或安装了，但被配置禁用 |

#### 2.5 为什么业务表通常选择 InnoDB

课程商城中的用户、课程、订单、支付记录都应该使用 InnoDB，因为它同时提供：

- 事务：订单创建失败时可以整体回滚。
- 行级锁：不同用户操作不同行时可以并发执行。
- MVCC：大量读取不必总是阻塞写入。
- redo log：已提交事务在宕机后可以恢复。
- undo log：支持回滚和一致性读取。
- 聚簇索引：主键查询效率高。
- 外键能力：虽然互联网项目常使用逻辑外键，但引擎本身支持外键约束。

#### 2.6 InnoDB 与 MyISAM 高频对比

| 对比项 | InnoDB（默认） | MyISAM |
| --- | --- | --- |
| 事务 | 支持 | 不支持 |
| 并发控制 | 支持行级锁，也有表级锁 | 主要是表级锁 |
| MVCC | 支持 | 不支持 |
| 外键 | 支持 | 不支持 |
| 崩溃恢复 | redo log、doublewrite 等机制 | 能力弱，异常后可能需要修复 |
| 索引组织 | 聚簇索引，主键叶子节点存整行 | 数据与索引分离 |
| 缓存 | Buffer Pool 缓存数据页和索引页 | Key Cache 主要缓存索引块 |
| `COUNT(*)` | 不维护精确总行数，需要执行统计 | 保存表行数，无条件统计可直接读取 |
| 适用场景 | 事务、高并发、可靠性要求高的业务 | 旧系统或特殊只读场景 |

::: tip 💡 面试题：什么是存储引擎？为什么通常选择 InnoDB？
存储引擎是 MySQL 中真正负责数据和索引存储、事务、锁与崩溃恢复的可插拔模块。业务系统通常选择 InnoDB，因为它支持事务、行级锁、MVCC 和崩溃恢复，能够满足高并发业务对一致性与可靠性的要求。
:::

#### 2.7 查看、指定和切换引擎

```sql
-- 查看当前实例支持的引擎
SHOW ENGINES;

-- 查看默认存储引擎
SHOW VARIABLES LIKE 'default_storage_engine';

-- 查看表使用的引擎
SHOW TABLE STATUS LIKE 'course';

-- 建表时指定引擎
CREATE TABLE demo (
    id BIGINT PRIMARY KEY,
    name VARCHAR(100) NOT NULL
) ENGINE = InnoDB;

-- 修改已有表的引擎：会重建表，大表操作要谨慎
ALTER TABLE demo ENGINE = InnoDB;
```

参考：[MySQL 8.4 支持的存储引擎](https://dev.mysql.com/doc/refman/8.4/en/storage-engines.html)、[可插拔存储引擎架构](https://dev.mysql.com/doc/refman/8.4/en/pluggable-storage.html)。

---

### 3. 数据类型

**背景**：数据类型决定了取值范围、存储空间、计算精度和索引体积。选择原则不是“能存就行”，而是用满足业务范围的最小、最准确类型。

MySQL 数据类型可以分成五类：

| 分类 | 常见类型 | 主要用途 |
| --- | --- | --- |
| 数值类型 | `TINYINT`、`INT`、`BIGINT`、`DECIMAL`、`DOUBLE` | 数量、状态、金额、统计值 |
| 字符串与二进制类型 | `CHAR`、`VARCHAR`、`TEXT`、`BINARY`、`BLOB` | 文本、编码、二进制内容 |
| 日期时间类型 | `DATE`、`TIME`、`DATETIME`、`TIMESTAMP`、`YEAR` | 日期和时间 |
| JSON 类型 | `JSON` | 半结构化扩展数据 |
| 空间类型 | `POINT`、`LINESTRING`、`POLYGON`、`GEOMETRY` | 地理坐标和空间数据 |

#### 3.1 数值类型

##### 整数类型

| 类型 | 字节 | 有符号范围 | `UNSIGNED` 范围 | 常见场景 |
| --- | ---: | --- | --- | --- |
| `TINYINT` | 1 | -128 ~ 127 | 0 ~ 255 | 状态、等级、小范围枚举 |
| `SMALLINT` | 2 | -32768 ~ 32767 | 0 ~ 65535 | 年份、小范围计数 |
| `MEDIUMINT` | 3 | -8388608 ~ 8388607 | 0 ~ 16777215 | 中等规模计数，使用较少 |
| `INT` / `INTEGER` | 4 | 约 -21 亿 ~ 21 亿 | 0 ~ 约 42 亿 | 普通计数、业务整数 |
| `BIGINT` | 8 | 约 ±922 亿亿 | 0 ~ 约 1844 亿亿 | 主键、订单 ID、雪花 ID |

```sql
status TINYINT NOT NULL DEFAULT 1 COMMENT '状态：1正常，0禁用',
stock  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '库存',
id     BIGINT NOT NULL COMMENT '雪花主键'
```

- `UNSIGNED` 表示不允许负数，并扩大正数上限；Java 没有与 MySQL 无符号整数完全对应的常用类型，读取前仍要确认范围。
- `BOOLEAN` / `BOOL` 在 MySQL 中是 `TINYINT(1)` 的同义写法，数据库实际仍保存 `0` 或 `1`。
- `INT(11)` 中的 `11` 曾表示显示宽度，不决定存储范围；整数显示宽度和 `ZEROFILL` 已在 MySQL 8 中弃用，不要再用于新项目。

##### 精确小数与近似小数

| 类型 | 是否精确 | 含义 | 常见场景 |
| --- | --- | --- | --- |
| `DECIMAL(M,D)` / `NUMERIC(M,D)` | 是 | `M` 是总位数，`D` 是小数位数 | 金额、利率、财务数据 |
| `FLOAT` | 否 | 单精度浮点数 | 对精度要求不高的测量值 |
| `DOUBLE` | 否 | 双精度浮点数 | 科学计算、统计近似值 |

```sql
price      DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
score_rate DOUBLE DEFAULT NULL
```

`DECIMAL(10,2)` 最多保存 10 位数字，其中 2 位小数，例如 `99999999.99`。Java 中通常映射为 `BigDecimal`。

::: tip 💡 面试题：存金额为什么不用 FLOAT/DOUBLE，要用 DECIMAL？
一句话结论：浮点数是二进制近似存储，无法精确表示十进制小数，会丢精度；DECIMAL 以字符串/定点方式存储，精确到分。原因：0.1 在二进制里是无限循环小数，浮点存储必然有舍入误差，累加后误差放大。展开：金额、利率等场景必须用 `DECIMAL(10,2)`，绝不能用 `double`（Java 里对应的也是 `BigDecimal`，见 [Java集合](/learn_backend/java/Java核心/Java集合) 里的精度讨论）。
:::

##### 位类型

`BIT(M)` 保存位值，`M` 的范围是 1~64。它适合真正需要位运算的标志集合；普通业务布尔值使用 `TINYINT` 更直观。

#### 3.2 字符串与二进制类型

##### `CHAR` 与 `VARCHAR`

| 类型 | 特点 | 常见场景 |
| --- | --- | --- |
| `CHAR(n)` | 定长，长度稳定时空间与比较行为更可预测，最多 255 字符 | 国家码、固定编码、哈希值 |
| `VARCHAR(n)` | 变长，只保存实际内容并额外记录长度 | 用户名、邮箱、标题、URL |

```sql
country_code CHAR(2),
phone        VARCHAR(20),
title        VARCHAR(200)
```

手机号是否用 `CHAR(11)` 要看业务：如果永远只支持中国大陆手机号可以；若考虑国际区号、脱敏字符或格式变化，`VARCHAR(20)` 更稳妥。`VARCHAR(n)` 的 `n` 是**字符数**，实际字节数还受字符集影响；InnoDB 单行还受到约 65KB 行大小限制。

##### 大文本与大二进制

| 文本类型 | 最大长度（约） | 二进制对应类型 | 常见场景 |
| --- | ---: | --- | --- |
| `TINYTEXT` | 255 B | `TINYBLOB` | 很短的附加文本 |
| `TEXT` | 64 KB | `BLOB` | 简介、正文片段 |
| `MEDIUMTEXT` | 16 MB | `MEDIUMBLOB` | 较长富文本 |
| `LONGTEXT` | 4 GB | `LONGBLOB` | 超大文本，实际使用要慎重 |

- `TEXT` 按字符集保存文本；`BLOB` 保存原始字节，不进行字符集比较。
- 图片、视频和普通附件通常放对象存储，数据库只保存 URL、对象 key、大小和类型；否则会让备份、复制和查询变重。
- `BINARY(n)` / `VARBINARY(n)` 适合保存固定或可变长度的原始字节，例如二进制摘要。

##### `ENUM` 与 `SET`

| 类型 | 含义 | 建议 |
| --- | --- | --- |
| `ENUM('A','B')` | 一列只能选择一个预定义值 | 值极稳定时可用；频繁新增状态会涉及 DDL |
| `SET('A','B')` | 一列可选择多个预定义值 | 查询和扩展不直观，业务系统通常改用关联表 |

状态字段在 Java 项目中更常使用 `TINYINT + Java enum + CHECK/业务校验`，扩展性通常比数据库 `ENUM` 更好。

#### 3.3 日期时间类型

| 类型 | 范围 | 说明 |
| --- | --- | --- |
| `DATE` | 1000-01-01 ~ 9999-12-31 | 只有日期，如生日、课程日期 |
| `TIME` | -838:59:59 ~ 838:59:59 | 时间或持续时长，不只是一天中的时刻 |
| `DATETIME` | 1000-01-01 00:00:00 ~ 9999-12-31 | 日期时间，保存原始值，不做时区转换 |
| `TIMESTAMP` | 1970-01-01 ~ 2038-01-19 左右 | 保存时按会话时区转 UTC，读取时再转换 |
| `YEAR` | 1901 ~ 2155 | 单独保存年份，使用较少 |

```sql
create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

- `DATETIME(3)`、`TIMESTAMP(6)` 中的数字表示秒的小数精度，范围为 0~6。
- 业务系统普遍使用 `DATETIME` 保存本地业务时间；跨时区系统要统一约定 UTC，并在应用层转换。
- 时间范围查询使用左闭右开：`create_time >= '2026-09-01' AND create_time < '2026-10-01'`。

#### 3.4 JSON 类型

`JSON` 会校验输入是否为合法 JSON，并采用适合快速读取成员的内部格式；它适合字段不固定、查询频率不高的扩展属性，不应替代正常的关系模型。

```sql
CREATE TABLE course_extra (
    course_id BIGINT PRIMARY KEY,
    attributes JSON NOT NULL
);

INSERT INTO course_extra VALUES
(1, JSON_OBJECT('level', 'beginner', 'tags', JSON_ARRAY('Java', 'Spring')));

-- -> 返回 JSON，->> 返回去掉引号后的文本
SELECT attributes->>'$.level' AS level
FROM course_extra
WHERE course_id = 1;
```

高频检索的 JSON 成员应抽成普通列，或者建立生成列/多值索引；否则条件查询和约束管理会越来越困难。

#### 3.5 空间类型

| 类型 | 表示什么 | 示例场景 |
| --- | --- | --- |
| `POINT` | 一个坐标点 | 门店经纬度 |
| `LINESTRING` | 一条线 | 行驶轨迹 |
| `POLYGON` | 一个区域 | 配送范围 |
| `GEOMETRY` | 任意受支持的几何对象 | 通用空间数据 |

普通课程商城暂时用不到，涉及“附近门店、配送范围、地图围栏”时再学习空间索引和 `ST_Distance_Sphere()`。

#### 3.6 Java 项目中的类型映射

| MySQL | Java 常用类型 | 示例 |
| --- | --- | --- |
| `TINYINT` / `INT` | `Integer` | 状态、库存 |
| `BIGINT` | `Long` | 主键、用户 ID |
| `DECIMAL` | `BigDecimal` | 价格、金额 |
| `CHAR` / `VARCHAR` / `TEXT` | `String` | 标题、简介 |
| `DATE` | `LocalDate` | 生日、日期 |
| `DATETIME` / `TIMESTAMP` | `LocalDateTime` / `Instant` | 创建时间、绝对时间点 |
| `JSON` | DTO、`JsonNode` 或字符串 | 扩展属性 |

#### 3.7 选择类型的实战原则

1. 金额用 `DECIMAL`，Java 用 `BigDecimal`。
2. 主键优先 `BIGINT`，为数据增长和分布式 ID 留空间。
3. 能用数值表示的状态不要用长字符串；但不要为了省 1~2 字节牺牲可读性。
4. 固定长度才用 `CHAR`，大多数普通文本用 `VARCHAR`。
5. 大文本、JSON 不要参与高频排序和联合索引；高频查询字段应单独建列。
6. 类型、长度和字符集必须与关联列一致，否则 JOIN 可能发生隐式转换并影响索引。
7. `NOT NULL + 合理默认值` 能减少三值逻辑，但“未知”和“空值”确有业务含义时应保留 `NULL`。

参考：[MySQL 8.4 Data Types](https://dev.mysql.com/doc/refman/8.4/en/data-types.html)。

---

### 4. SQL 分类与常用语句体系

SQL（Structured Query Language）是操作关系型数据库的语言。常见教程将它分成 DDL、DML、DQL、DCL 四类，再补充事务控制 TCL。

::: warning 先纠正一个概念
`DML` 的全称是 **Data Manipulation Language（数据操纵语言）**，不是“数据库管理语言”。另外，MySQL 官方手册把 `SELECT` 也放在 Data Manipulation Statements 中；但国内教学和面试通常把查询单独称为 `DQL`。两种分类不冲突，面试时按下面这套回答即可。
:::

| 分类 | 中文 | 解决什么问题 | 必须掌握的语句 |
| --- | --- | --- | --- |
| DDL | 数据定义语言 | 定义数据库对象和表结构 | `CREATE`、`ALTER`、`DROP`、`TRUNCATE`、`RENAME` |
| DML | 数据操纵语言 | 新增、修改、删除表中数据 | `INSERT`、`UPDATE`、`DELETE` |
| DQL | 数据查询语言 | 从表中查询数据 | `SELECT`、`WHERE`、`JOIN`、`GROUP BY`、`HAVING`、`ORDER BY`、`LIMIT` |
| DCL | 数据控制语言 | 管理用户、角色和权限 | `GRANT`、`REVOKE` |
| TCL | 事务控制语言 | 控制事务提交和回滚 | `START TRANSACTION`、`COMMIT`、`ROLLBACK`、`SAVEPOINT` |

下面覆盖日常开发中最常用的 SQL；复杂 JOIN、子查询、窗口函数和面试手写题见 [SQL 语法与面试写题](/learn_database/MySQL-SQL语法与面试写题)。

#### 4.0 SQL 通用书写规则

- SQL 关键字通常不区分大小写，但建议关键字大写、库表字段小写。
- 一条语句以分号 `;` 结束；字符串使用单引号 `'text'`。
- 库名、表名、字段名需要转义时使用反引号，例如 `` `order` ``，不要把双引号当成通用字符串写法。
- 单行注释可用 `-- `（两个短横线后必须有空白）或 `#`，多行注释使用 `/* ... */`。
- 命名统一使用小写下划线，不使用关键字、空格和中文名称。

#### 4.1 DDL：数据定义语言

DDL 操作的是数据库对象的**结构和元数据**，例如数据库、表、字段、索引、视图，而不是普通业务数据。

##### 创建和选择数据库

```sql
-- 创建数据库并明确字符集、排序规则
CREATE DATABASE IF NOT EXISTS course_mall
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_0900_ai_ci;

-- 切换当前数据库
USE course_mall;

-- 查看创建数据库时的完整定义
SHOW CREATE DATABASE course_mall;

-- 删除数据库及其中全部对象，生产环境执行前必须确认目标和备份
DROP DATABASE IF EXISTS course_mall_test;
```

##### 创建表

```sql
CREATE TABLE `user` (
    `id`          BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `username`    VARCHAR(50)   NOT NULL COMMENT '用户名',
    `phone`       CHAR(11)      DEFAULT NULL COMMENT '手机号',
    `balance`     DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '余额',
    `status`      TINYINT       NOT NULL DEFAULT 1 COMMENT '状态：1正常，0禁用',
    `create_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_username` (`username`),
    KEY `idx_phone` (`phone`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COMMENT = '用户表';
```

常用约束：

| 约束 | 作用 | 示例 |
| --- | --- | --- |
| `PRIMARY KEY` | 主键，唯一且非空 | `PRIMARY KEY (id)` |
| `NOT NULL` | 不允许空值 | `username VARCHAR(50) NOT NULL` |
| `UNIQUE` | 值不能重复 | `UNIQUE KEY uk_username (username)` |
| `DEFAULT` | 未传值时使用默认值 | `status TINYINT DEFAULT 1` |
| `CHECK` | 校验数据条件，MySQL 8.0.16+ 真正执行 | `CHECK (price >= 0)` |
| `AUTO_INCREMENT` | 自动生成递增整数值，一个表只能有一个且必须被索引 | `id BIGINT AUTO_INCREMENT` |
| `FOREIGN KEY` | 维护引用完整性 | `FOREIGN KEY (user_id) REFERENCES user(id)` |

互联网项目常使用“逻辑外键”：数据库中保留 `user_id`，由业务代码保证关联关系，不创建物理外键，以减少表之间的强耦合。但这并不等于外键没有价值，小型系统和强一致场景仍可使用。

##### 修改表结构

```sql
-- 增加字段
ALTER TABLE user ADD COLUMN email VARCHAR(100) DEFAULT NULL COMMENT '邮箱';

-- 修改字段类型和约束
ALTER TABLE user MODIFY COLUMN username VARCHAR(100) NOT NULL;

-- 修改字段名并同时重新声明类型
ALTER TABLE user CHANGE COLUMN phone mobile CHAR(11) DEFAULT NULL;

-- 删除字段
ALTER TABLE user DROP COLUMN email;

-- 添加和删除索引
ALTER TABLE user ADD INDEX idx_status_create_time (status, create_time);
ALTER TABLE user DROP INDEX idx_status_create_time;

-- 修改表名
RENAME TABLE user TO sys_user;
```

##### `DELETE`、`TRUNCATE`、`DROP` 的区别

| 语句 | 分类 | 删除内容 | 保留表结构 | 支持 `WHERE` | 能否常规回滚 |
| --- | --- | --- | --- | --- | --- |
| `DELETE FROM user WHERE ...` | DML | 满足条件的数据行 | 是 | 是 | InnoDB 事务中可以 |
| `TRUNCATE TABLE user` | DDL | 全部数据，通常重置自增值 | 是 | 否 | 不可以，会隐式提交 |
| `DROP TABLE user` | DDL | 表结构和全部数据 | 否 | 否 | 不可以，会隐式提交 |

MySQL 8 支持原子 DDL，表示一条 DDL 要么完整成功、要么完整失败；但它仍然会隐式提交事务，**不代表可以通过 `ROLLBACK` 撤销 DDL**。

::: tip 💡 面试题：DDL 有哪些？
DDL 用于定义数据库对象，常用语句是 `CREATE`、`ALTER`、`DROP`、`TRUNCATE` 和 `RENAME`。它主要修改库、表、字段和索引结构，多数 DDL 会隐式提交，不能通过普通事务回滚。
:::

#### 4.2 DML：数据操纵语言

DML 操作表中的业务数据，核心就是 `INSERT`、`UPDATE`、`DELETE`。

##### 插入数据

```sql
-- 单行插入：明确写出字段名，不依赖表字段顺序
INSERT INTO user (username, phone, balance)
VALUES ('张三', '13800138000', 100.00);

-- 批量插入：比循环发送多条 INSERT 减少网络和解析开销
INSERT INTO user (username, phone)
VALUES ('user_a', '13800000001'),
       ('user_b', '13800000002'),
       ('user_c', '13800000003');

-- 从查询结果插入另一张表
INSERT INTO user_backup (id, username, phone)
SELECT id, username, phone
FROM user
WHERE status = 0;

-- 唯一键冲突时更新：常用于幂等写入
INSERT INTO user (username, phone)
VALUES ('张三', '13800138000') AS new
ON DUPLICATE KEY UPDATE phone = new.phone;
```

`INSERT IGNORE` 会把部分错误降级为警告，容易掩盖脏数据；除非明确知道要忽略哪些错误，否则不要把它当成通用幂等方案。

##### 更新数据

```sql
-- 根据主键更新
UPDATE user
SET balance = balance - 50,
    update_time = NOW()
WHERE id = 1;

-- 条件更新：余额足够才扣减，可用于保证库存/余额不被扣成负数
UPDATE user
SET balance = balance - 50
WHERE id = 1
  AND balance >= 50;
```

更新后要检查受影响行数：返回 `1` 表示成功，返回 `0` 可能是记录不存在或业务条件不成立。

##### 删除数据

```sql
-- 物理删除
DELETE FROM user WHERE id = 1;

-- 逻辑删除：真实项目更常见
UPDATE user
SET deleted_at = NOW()
WHERE id = 1
  AND deleted_at IS NULL;
```

::: danger DML 安全底线
执行 `UPDATE` 和 `DELETE` 前先写同条件的 `SELECT`，确认命中范围；生产操作必须检查 `WHERE`，大批量修改要分批执行并关注锁、事务大小和 binlog 压力。
:::

::: tip 💡 面试题：DML 有哪些？
DML 用来操作表中的业务数据，核心是 `INSERT`、`UPDATE` 和 `DELETE`。在 InnoDB 事务中，DML 可以通过 `ROLLBACK` 回滚。
:::

#### 4.3 DQL：数据查询语言

DQL 的核心是 `SELECT`。日常查询可以按下面的固定骨架书写：

```sql
SELECT [DISTINCT] 字段或表达式
FROM 表
[JOIN 表 ON 连接条件]
[WHERE 行过滤条件]
[GROUP BY 分组字段]
[HAVING 分组过滤条件]
[ORDER BY 排序字段 ASC | DESC]
[LIMIT 偏移量, 返回行数];
```

##### 基础查询和别名

```sql
-- 避免在业务代码中使用 SELECT *，明确需要的字段
SELECT id, username, balance
FROM user;

-- AS 设置结果列别名；表别名可以省略 AS
SELECT u.username AS user_name,
       u.balance * 100 AS balance_cent
FROM user u;

-- DISTINCT 对整个结果字段组合去重
SELECT DISTINCT status FROM user;
```

##### `WHERE` 常用条件

```sql
SELECT id, username
FROM user
WHERE status = 1
  AND balance >= 100
  AND id IN (1, 2, 3)
  AND create_time BETWEEN '2026-01-01' AND '2026-12-31'
  AND username LIKE '张%'
  AND phone IS NOT NULL;
```

| 条件 | 含义 | 注意 |
| --- | --- | --- |
| `=、<>、>、>=、<、<=` | 比较 | SQL 的不等于通常写 `<>` 或 `!=` |
| `AND、OR、NOT` | 逻辑组合 | `AND` 优先级高于 `OR`，复杂条件加括号 |
| `IN (...)` | 属于给定集合 | 集合很大时考虑临时表或关联查询 |
| `BETWEEN a AND b` | 闭区间 `[a,b]` | 时间范围通常推荐左闭右开，避免边界问题 |
| `LIKE 'abc%'` | 前缀模糊匹配 | 前缀固定时可能使用索引；`'%abc'` 通常难以走普通索引 |
| `IS NULL` | 判断空值 | 不能写 `= NULL`，因为结果不是 `TRUE` |

时间范围推荐：

```sql
-- 查询 2026 年数据：左闭右开，能覆盖带时分秒的数据
WHERE create_time >= '2026-01-01'
  AND create_time <  '2027-01-01';
```

##### 聚合、分组和过滤

常见聚合函数：`COUNT`、`SUM`、`AVG`、`MAX`、`MIN`。

```sql
SELECT status,
       COUNT(*) AS user_count,
       SUM(balance) AS total_balance,
       AVG(balance) AS avg_balance
FROM user
WHERE deleted_at IS NULL
GROUP BY status
HAVING COUNT(*) >= 10;
```

- `WHERE` 在分组前过滤数据行，不能直接使用聚合结果。
- `HAVING` 在分组后过滤分组结果，常用于 `COUNT(*) > 10`。
- `COUNT(*)` 统计行数；`COUNT(phone)` 只统计 `phone` 非 `NULL` 的行。

##### 排序和分页

```sql
-- 排序字段相同时再按 id 排序，保证翻页顺序稳定
SELECT id, username, create_time
FROM user
WHERE status = 1
ORDER BY create_time DESC, id DESC
LIMIT 20 OFFSET 0;

-- MySQL 也支持 LIMIT offset, size
LIMIT 0, 20;
```

深分页 `LIMIT 100000, 20` 需要扫描并丢弃大量数据，后续应使用覆盖索引、延迟关联或基于上一页最大 id 的游标分页。

##### JOIN 关联查询

| JOIN 类型 | 含义 |
| --- | --- |
| `INNER JOIN` | 只保留左右两表都匹配的记录 |
| `LEFT JOIN` | 左表全部保留，右表匹配不到的字段填 `NULL` |
| `RIGHT JOIN` | 右表全部保留，左表匹配不到的字段填 `NULL` |
| `CROSS JOIN` | 笛卡尔积，左右每行两两组合 |
| `FULL OUTER JOIN` | MySQL 不直接支持，可根据业务用 `UNION` 组合 |

```sql
-- 隐式内连接：能运行，但连接条件容易遗漏，新代码不推荐
SELECT u.username, o.order_no
FROM user u, orders o
WHERE u.id = o.user_id;

-- 显式内连接：连接关系写在 ON 中，结构更清楚
SELECT u.username, o.order_no
FROM user u
INNER JOIN orders o ON o.user_id = u.id;
```

```sql
-- 查询所有用户及其订单；没有订单的用户也保留
SELECT u.id,
       u.username,
       o.order_no,
       o.amount
FROM user u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 1;
```

连接条件写在 `ON` 中；如果对右表字段的过滤写进 `WHERE`，可能把 `LEFT JOIN` 实际变成 `INNER JOIN`：

```sql
-- 仍然保留没有已支付订单的用户
LEFT JOIN orders o
       ON o.user_id = u.id
      AND o.status = 'PAID';
```

##### 子查询、集合操作和条件判断

```sql
-- IN：用户是否存在订单
SELECT id, username
FROM user
WHERE id IN (SELECT user_id FROM orders);

-- EXISTS：只判断相关记录是否存在
SELECT u.id, u.username
FROM user u
WHERE EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.user_id = u.id
);

-- UNION 去重；UNION ALL 不去重，通常性能更好
SELECT phone AS contact FROM user
UNION ALL
SELECT phone AS contact FROM teacher;

-- CASE 条件表达式
SELECT username,
       CASE status
           WHEN 1 THEN '正常'
           WHEN 0 THEN '禁用'
           ELSE '未知'
       END AS status_name
FROM user;
```

##### SQL 书写顺序与逻辑执行顺序

```text
书写顺序：SELECT → FROM/JOIN → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT
逻辑顺序：FROM/JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT
```

这解释了为什么 `WHERE` 不能直接使用同层 `SELECT` 才产生的别名，而 `ORDER BY` 通常可以使用。

::: tip 💡 面试题：WHERE 和 HAVING 有什么区别？
`WHERE` 在分组前过滤原始数据行，不能直接使用聚合函数；`HAVING` 在 `GROUP BY` 后过滤分组结果，常用于对 `COUNT`、`SUM` 等聚合结果设置条件。
:::

#### 4.4 DCL：数据控制语言

DCL 用于管理账号、角色和权限。真实项目遵循**最小权限原则**：应用账号只获得所需数据库和表的权限，不要直接使用 `root` 连接业务系统。

```sql
-- 创建只能从指定网段连接的业务账号
CREATE USER 'course_app'@'10.0.%'
IDENTIFIED BY 'ReplaceWithStrongPassword';

-- 修改账号密码
ALTER USER 'course_app'@'10.0.%'
IDENTIFIED BY 'AnotherStrongPassword';

-- 授予课程商城库的常用读写权限
GRANT SELECT, INSERT, UPDATE, DELETE
ON course_mall.*
TO 'course_app'@'10.0.%';

-- 查看账号已有权限
SHOW GRANTS FOR 'course_app'@'10.0.%';

-- 撤销删除权限
REVOKE DELETE
ON course_mall.*
FROM 'course_app'@'10.0.%';

-- 删除账号
DROP USER 'course_app'@'10.0.%';
```

MySQL 8 使用 `CREATE USER` 创建账号、`GRANT` 授权；执行这些标准账号管理语句后不需要再手动执行 `FLUSH PRIVILEGES`。只有直接修改授权表等特殊情况才可能需要刷新。

账号由 `'用户名'@'主机范围'` 共同确定：`localhost` 只允许本机，`10.0.%` 表示指定网段，`%` 表示任意主机。生产业务账号不要随意使用 `%`。

| 常用权限 | 允许的操作 |
| --- | --- |
| `SELECT` | 查询数据 |
| `INSERT`、`UPDATE`、`DELETE` | 写入、修改、删除数据 |
| `CREATE`、`ALTER`、`DROP` | 创建和修改数据库对象 |
| `INDEX` | 创建或删除索引 |
| `EXECUTE` | 执行存储过程/函数 |
| `ALL PRIVILEGES` | 指定层级的全部可授予权限，业务账号慎用 |

常见权限层级：

```text
*.*                     全局权限
course_mall.*           数据库级权限
course_mall.course      表级权限
course_mall.course(title) 列级权限
```

::: tip 💡 面试题：DCL 有哪些？
DCL 主要通过 `GRANT` 授予权限、`REVOKE` 撤销权限，并配合 `CREATE USER`、`DROP USER` 和角色管理实现数据库访问控制；业务账号应遵循最小权限原则。
:::

#### 4.5 TCL：事务控制语句

```sql
START TRANSACTION;

UPDATE account SET balance = balance - 100 WHERE id = 1;
UPDATE account SET balance = balance + 100 WHERE id = 2;

COMMIT;
-- 任一步失败时执行 ROLLBACK;
```

保存点允许回滚事务的一部分：

```sql
START TRANSACTION;
UPDATE account SET balance = balance - 100 WHERE id = 1;

SAVEPOINT after_debit;
UPDATE account SET balance = balance + 100 WHERE id = 2;

ROLLBACK TO SAVEPOINT after_debit;
COMMIT;
```

MySQL 默认开启 `autocommit`，未显式开启事务时，每条语句通常作为一个独立事务自动提交。Spring 项目一般通过 `@Transactional` 管理事务，而不是在业务代码中手写 `COMMIT`。

#### 4.6 常用管理与诊断语句

这些语句不必硬塞进 DDL/DML/DQL/DCL，它们属于 MySQL 常用管理或工具语句：

```sql
SHOW DATABASES;                 -- 查看数据库
SHOW TABLES;                    -- 查看当前库中的表
SHOW CREATE TABLE course;       -- 查看完整建表语句
SHOW INDEX FROM course;         -- 查看索引
SHOW ENGINES;                   -- 查看存储引擎
SHOW PROCESSLIST;               -- 查看当前连接和正在执行的语句

DESCRIBE course;                -- 查看字段结构，可简写为 DESC course
EXPLAIN SELECT * FROM course;   -- 查看执行计划
USE course_mall;                -- 切换数据库
```

#### 4.7 CTE（公用表表达式）

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
| 性能 | 由优化器决定是否改写/物化 | 同样由优化器决定，不保证只执行一次 |
| 调试 | 不直观 | 可以先查 CTE 本身看中间结果 |

**小结**：CTE 的核心价值是「把复杂查询拆成可命名的步骤」，非递归 CTE 替代子查询提升可读性，递归 CTE 解决树形查询（分类、菜单、组织架构）——这是 MySQL 8.0 的一大亮点，也是面试中「查分类树」的标准答案。**指定层数加 `WHERE cte.level < N` 即可**，写在递归成员里提前打断比外面过滤更高效。

#### 4.8 约束、表关系与多表查询补充

##### 外键及更新/删除行为

```sql
ALTER TABLE orders
ADD CONSTRAINT fk_orders_user
FOREIGN KEY (user_id) REFERENCES user(id)
ON UPDATE RESTRICT
ON DELETE RESTRICT;

ALTER TABLE orders DROP FOREIGN KEY fk_orders_user;
```

| 行为 | 父表记录被修改/删除时怎么处理 |
| --- | --- |
| `RESTRICT` / `NO ACTION` | 有子表引用时拒绝操作，MySQL 中二者效果基本相同 |
| `CASCADE` | 自动更新或删除子表对应记录 |
| `SET NULL` | 子表外键设为 `NULL`，要求该字段允许为空 |

物理外键能从数据库层保证引用完整性，但增加表之间的耦合。互联网项目常保留 `user_id` 这类逻辑外键，不创建约束，由应用和数据治理保证一致性；是否使用要根据项目规模和一致性要求决定。

##### 三种表关系

| 关系 | 建模方式 | 课程商城示例 |
| --- | --- | --- |
| 一对多 | 在“多”的一方保存外键 | `course.teacher_id`：一个讲师有多门课程 |
| 多对多 | 建立中间表，通常用两个外键组成唯一键 | `user_course(user_id, course_id)`：用户与已购课程 |
| 一对一 | 任意一方保存外键并增加 `UNIQUE` | 用户表与用户实名详情表 |

```sql
CREATE TABLE user_course (
    id        BIGINT PRIMARY KEY,
    user_id   BIGINT NOT NULL,
    course_id BIGINT NOT NULL,
    UNIQUE KEY uk_user_course (user_id, course_id)
);
```

##### 自连接

自连接是同一张表扮演两个角色。例如员工表中的 `manager_id` 仍然指向员工表：

```sql
SELECT e.name AS employee_name,
       m.name AS manager_name
FROM employee e
LEFT JOIN employee m ON m.id = e.manager_id;
```

##### 子查询分类

| 分类 | 子查询结果 | 常用运算符 |
| --- | --- | --- |
| 标量子查询 | 一行一列 | `=、>、<` |
| 列子查询 | 多行一列 | `IN、NOT IN、ANY、ALL` |
| 行子查询 | 一行多列 | `(a,b) = (...)` |
| 表子查询 | 多行多列 | 放在 `FROM` 中作为派生表 |
| 相关子查询 | 内层引用外层当前行 | `EXISTS`、`NOT EXISTS` |

```sql
-- 标量：高于平均价格的课程
SELECT id, title, price
FROM course
WHERE price > (SELECT AVG(price) FROM course);

-- 列：购买过指定课程集合的用户
SELECT id, username
FROM user
WHERE id IN (SELECT user_id FROM orders WHERE status = 'PAID');

-- ALL：价格高于该分类中的每一门课程（即高于其中最大值）
SELECT id, title, price
FROM course
WHERE price > ALL (
    SELECT price FROM course WHERE category_id = 10
);

-- ANY/SOME：价格高于该分类中的至少一门课程
SELECT id, title, price
FROM course
WHERE price > ANY (
    SELECT price FROM course WHERE category_id = 10
);

-- 行：同时匹配讲师和分类
SELECT *
FROM course
WHERE (teacher_id, category_id) = (
    SELECT teacher_id, category_id FROM course WHERE id = 1
);

-- 表：先聚合订单，再与用户关联
SELECT u.id, u.username, x.total_amount
FROM user u
JOIN (
    SELECT user_id, SUM(amount) AS total_amount
    FROM orders
    GROUP BY user_id
) x ON x.user_id = u.id;

-- 相关子查询：只返回至少有一个已支付订单的用户
SELECT u.id, u.username
FROM user u
WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = u.id AND o.status = 'PAID'
);
```

`EXISTS` 表示“是否存在”，找到第一条匹配记录即可停止；`IN` 表示“值是否属于集合”。现代 MySQL 优化器可能把二者都改写成半连接，不能只背“EXISTS 一定更快”，应该查看执行计划和数据分布。

**小结**：SQL 常按 DDL、DML、DQL、DCL、TCL 五类理解。它们是后续 SQL 优化、索引调优和事务学习的基础。记住「WHERE 在分组前、HAVING 在分组后、LIMIT 最后」，能解释很多「条件写错位置」的 bug。

参考：[MySQL 8.4 SQL Statements](https://dev.mysql.com/doc/refman/8.4/en/sql-statements.html)、[Data Definition Statements](https://dev.mysql.com/doc/refman/8.4/en/sql-data-definition-statements.html)、[Transactional and Locking Statements](https://dev.mysql.com/doc/en/sql-transactional-statements.html)。

---

### 5. 常用函数

函数接收参数并返回一个结果，可以出现在 `SELECT`、`WHERE`、`ORDER BY`、`GROUP BY` 等位置。先掌握字符串、数值、日期、流程控制和聚合函数，就能覆盖绝大多数业务 SQL。

#### 5.1 字符串函数

| 函数 | 作用 | 示例结果 |
| --- | --- | --- |
| `CONCAT(a,b,...)` | 拼接字符串；任一参数为 `NULL` 时结果为 `NULL` | `CONCAT('Course','Mall')` → `CourseMall` |
| `CONCAT_WS(sep,a,b,...)` | 使用分隔符拼接，并跳过 `NULL` | `CONCAT_WS('-', '2026', '09', '11')` |
| `LOWER(s)` / `UPPER(s)` | 转小写/大写 | `LOWER('SQL')` → `sql` |
| `CHAR_LENGTH(s)` | 字符数 | 中文一个字算一个字符 |
| `LENGTH(s)` | 字节数 | `utf8mb4` 中文通常占 3 个字节 |
| `SUBSTRING(s,pos,len)` | 截取字符串，位置从 1 开始 | `SUBSTRING('CourseMall',1,6)` → `Course` |
| `LEFT(s,n)` / `RIGHT(s,n)` | 取左/右侧 n 个字符 | `LEFT('13800138000',3)` → `138` |
| `TRIM(s)` | 去除首尾空格 | `TRIM(' Java ')` → `Java` |
| `LPAD(s,n,pad)` / `RPAD(...)` | 左/右填充到指定长度 | `LPAD('7',3,'0')` → `007` |
| `REPLACE(s,from,to)` | 替换所有匹配文本 | `REPLACE('a-b','-','_')` → `a_b` |
| `LOCATE(substr,s)` | 返回子串起始位置，找不到返回 0 | `LOCATE('Mall','CourseMall')` → `7` |

```sql
-- 生成展示名称并对手机号脱敏
SELECT CONCAT_WS(' - ', title, teacher_name) AS display_name,
       CONCAT(LEFT(phone, 3), '****', RIGHT(phone, 4)) AS masked_phone
FROM course_view;
```

#### 5.2 数值函数

| 函数 | 作用 | 示例 |
| --- | --- | --- |
| `ABS(x)` | 绝对值 | `ABS(-10)` → `10` |
| `CEIL(x)` / `CEILING(x)` | 向上取整 | `CEIL(1.1)` → `2` |
| `FLOOR(x)` | 向下取整 | `FLOOR(1.9)` → `1` |
| `ROUND(x,d)` | 四舍五入保留 d 位 | `ROUND(12.345,2)` → `12.35` |
| `TRUNCATE(x,d)` | 直接截断到 d 位 | `TRUNCATE(12.345,2)` → `12.34` |
| `MOD(x,y)` / `x % y` | 取余 | `MOD(7,4)` → `3` |
| `POW(x,y)` | 幂运算 | `POW(2,3)` → `8` |
| `RAND()` | 生成 `[0,1)` 随机数 | 测试数据、随机排序 |

```sql
-- 折扣价只用于展示；真正结算仍应在 Java 中用 BigDecimal 明确舍入规则
SELECT id, title, ROUND(price * 0.8, 2) AS discount_price
FROM course;

-- 生成 6 位演示验证码；真实验证码应由应用层安全随机数生成器产生
SELECT LPAD(FLOOR(RAND() * 1000000), 6, '0');
```

`ORDER BY RAND()` 会为大量记录生成随机值并排序，只适合小表或测试数据，不能用来随机抽取大表记录。

#### 5.3 日期时间函数

| 函数 | 作用 | 示例 |
| --- | --- | --- |
| `CURDATE()` / `CURRENT_DATE` | 当前日期 | `2026-09-11` |
| `CURTIME()` / `CURRENT_TIME` | 当前时间 | `21:30:00` |
| `NOW()` / `CURRENT_TIMESTAMP` | 当前日期时间 | `2026-09-11 21:30:00` |
| `YEAR(d)` / `MONTH(d)` / `DAY(d)` | 提取年月日 | `YEAR(NOW())` |
| `DATE_ADD(d, INTERVAL n unit)` | 增加时间 | `DATE_ADD(NOW(), INTERVAL 7 DAY)` |
| `DATE_SUB(d, INTERVAL n unit)` | 减少时间 | `DATE_SUB(NOW(), INTERVAL 30 MINUTE)` |
| `DATEDIFF(a,b)` | 相差天数，结果是 `a-b` | `DATEDIFF('2026-09-11','2026-09-01')` → `10` |
| `TIMESTAMPDIFF(unit,a,b)` | 按指定单位计算 `b-a` | 计算分钟、月份、年龄 |
| `DATE_FORMAT(d,fmt)` | 日期转字符串 | `DATE_FORMAT(NOW(),'%Y-%m-%d')` |
| `STR_TO_DATE(s,fmt)` | 字符串转日期 | `STR_TO_DATE('2026/09/11','%Y/%m/%d')` |
| `LAST_DAY(d)` | 返回所在月份最后一天 | 月末统计 |

```sql
-- 最近 30 天创建的课程：对常量计算，保留 create_time 原值，方便使用索引
SELECT id, title
FROM course
WHERE create_time >= DATE_SUB(NOW(), INTERVAL 30 DAY);

-- 计算课程上线天数
SELECT title, DATEDIFF(CURDATE(), DATE(publish_time)) AS online_days
FROM course;

-- 按月统计（展示方便，但函数作用在列上通常不能直接利用普通索引定位）
SELECT DATE_FORMAT(create_time, '%Y-%m') AS month_key,
       COUNT(*) AS order_count
FROM orders
GROUP BY DATE_FORMAT(create_time, '%Y-%m');
```

#### 5.4 流程控制与空值函数

| 函数/表达式 | 作用 |
| --- | --- |
| `IF(condition,a,b)` | 条件为真返回 a，否则返回 b，MySQL 特有 |
| `IFNULL(value,default)` | value 为 `NULL` 时返回默认值 |
| `COALESCE(a,b,c,...)` | 返回第一个非 `NULL` 值，标准 SQL，优先掌握 |
| `NULLIF(a,b)` | a=b 返回 `NULL`，否则返回 a |
| `CASE ... WHEN ... THEN ... ELSE ... END` | 多分支判断，标准 SQL、可移植性最好 |

```sql
-- 简单 CASE：与一个值逐项比较
SELECT title,
       CASE status
           WHEN 1 THEN '已上架'
           WHEN 0 THEN '已下架'
           ELSE '未知'
       END AS status_name
FROM course;

-- 搜索 CASE：每个 WHEN 都是独立条件
SELECT title,
       CASE
           WHEN price = 0 THEN '免费'
           WHEN price < 100 THEN '入门价'
           ELSE '精品课'
       END AS price_level
FROM course;

-- 防止除零：当 total_count=0 时先转 NULL，最终返回 0
SELECT COALESCE(success_count / NULLIF(total_count, 0), 0) AS success_rate
FROM task_stat;
```

#### 5.5 聚合函数

| 函数 | 作用 | `NULL` 行为 |
| --- | --- | --- |
| `COUNT(*)` | 统计结果行数 | 行存在就统计 |
| `COUNT(column)` | 统计该列非 `NULL` 的行数 | 忽略 `NULL` |
| `SUM(column)` | 求和 | 忽略 `NULL` |
| `AVG(column)` | 平均值 | 忽略 `NULL` |
| `MAX(column)` / `MIN(column)` | 最大值/最小值 | 忽略 `NULL` |
| `GROUP_CONCAT(column)` | 把组内值拼成一个字符串 | 忽略 `NULL`，长度受系统变量限制 |

```sql
SELECT category_id,
       COUNT(*) AS course_count,
       COALESCE(SUM(buy_count), 0) AS total_buy_count,
       GROUP_CONCAT(title ORDER BY buy_count DESC SEPARATOR '、') AS titles
FROM course
WHERE deleted_at IS NULL
GROUP BY category_id;
```

#### 5.6 类型转换函数

```sql
SELECT CAST('123' AS UNSIGNED);                    -- 字符串转无符号整数
SELECT CAST(price AS CHAR);                        -- 数值转字符串
SELECT CAST('2026-09-11' AS DATE);                 -- 字符串转日期
SELECT CONVERT('CourseMall' USING utf8mb4);        -- 转换字符集
```

类型不一致会触发隐式转换，可能改变比较结果并导致索引无法有效定位。关联列、查询参数和数据库列应尽量使用相同类型。

#### 5.7 JSON 函数

| 函数 | 作用 |
| --- | --- |
| `JSON_OBJECT(k,v,...)` | 构造 JSON 对象 |
| `JSON_ARRAY(v,...)` | 构造 JSON 数组 |
| `JSON_EXTRACT(doc,path)` / `->` | 提取 JSON 值 |
| `JSON_UNQUOTE(...)` / `->>` | 提取为普通字符串 |
| `JSON_SET(doc,path,value)` | 新增或替换指定路径 |
| `JSON_REMOVE(doc,path)` | 删除指定路径 |
| `JSON_CONTAINS(doc,candidate,path)` | 判断是否包含指定 JSON 值 |

```sql
SELECT attributes->>'$.level' AS level
FROM course_extra;

UPDATE course_extra
SET attributes = JSON_SET(attributes, '$.level', 'advanced')
WHERE course_id = 1;
```

#### 5.8 窗口函数

窗口函数会在**保留原始行**的同时，对一组相关记录计算排名、累计值或前后值；这与 `GROUP BY` 聚合后只保留一行不同。

```sql
-- 每个分类内按销量排名
SELECT id,
       title,
       category_id,
       buy_count,
       ROW_NUMBER() OVER (
           PARTITION BY category_id
           ORDER BY buy_count DESC, id
       ) AS row_no,
       RANK() OVER (
           PARTITION BY category_id
           ORDER BY buy_count DESC
       ) AS sales_rank
FROM course;
```

常用窗口函数有 `ROW_NUMBER()`、`RANK()`、`DENSE_RANK()`、`LAG()`、`LEAD()`，以及 `SUM(...) OVER (...)`。面试手写题见 [SQL 语法与面试写题](/learn_database/MySQL-SQL语法与面试写题)。

::: warning 函数与索引
`WHERE YEAR(create_time)=2026` 把函数作用在索引列上，普通索引通常不能直接按原始值定位。改成范围条件：`create_time >= '2026-01-01' AND create_time < '2027-01-01'`。如果业务必须按表达式高频查询，可考虑函数索引或生成列索引。
:::

参考：[MySQL 8.4 Functions and Operators](https://dev.mysql.com/doc/refman/8.4/en/functions.html)。

---

### 6. 索引

#### 6.1 什么是索引，为什么需要它

**背景**：没有可用索引时，查询可能要逐行扫描整张表。索引的本质是「**帮助快速定位记录的数据结构**」：例如 B+ 树索引能按键值缩小扫描范围，避免大量无关数据访问。

**定义**：索引可以用不同结构组织；InnoDB 的普通索引主要使用 B+ 树。聚簇索引的叶子节点本身保存整行数据，不能说所有索引都“独立于数据之外”。索引会占空间，写入时还要维护，因此不是越多越好。

**为什么选 B+ 树而不是别的结构**：

| 数据结构 | 是否适用 | 原因 |
| --- | --- | --- |
| 哈希表 | 适合特定场景 | 等值查找快，但不支持范围查询和按索引排序；哈希冲突仍需进一步比较 |
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

##### Hash 索引：适合等值查询，但不是 InnoDB 的常规索引

Hash 索引先对索引键计算哈希值，再定位到相应位置；多个键可能落到同一位置，需要继续比较原值。这种结构适合 `=`、`<=>` 等等值查找，但键值没有顺序，因此不能像 B+ 树那样支持 `>`、`BETWEEN`、按索引 `ORDER BY`；联合 Hash 索引也不能只靠最左边一部分字段定位。

在 MySQL 中要分清两种情况：

1. **MEMORY 表的显式 Hash 索引**：可以主动指定 `USING HASH`；MEMORY 表的数据不适合保存课程商城的持久业务数据。
2. **InnoDB 自适应哈希索引（AHI）**：InnoDB 观察热点 B+ 树访问后，可能在内部自动为部分索引页建立哈希加速结构；它不是开发者在 `CREATE INDEX` 时创建的 Hash 索引。MySQL 8.4 默认关闭，可通过 `SHOW VARIABLES LIKE 'innodb_adaptive_hash_index';` 查看，是否开启要结合真实负载测试。

```sql
-- 仅演示 MEMORY 引擎的显式 Hash 索引；普通 InnoDB 业务表不要照搬
CREATE TABLE hash_lookup_demo (
    id INT NOT NULL,
    value VARCHAR(30),
    INDEX idx_id USING HASH (id)
) ENGINE = MEMORY;
```

面试记一句：**B+ 树兼顾等值、范围与排序；Hash 主要服务等值。InnoDB 业务索引是 B+ 树，AHI 只是可选的内部加速机制。**

参考：[MySQL 8.4 B-Tree 与 Hash 索引对比](https://dev.mysql.com/doc/refman/8.4/en/index-btree-hash.html)、[MEMORY 引擎索引](https://dev.mysql.com/doc/refman/8.4/en/memory-storage-engine.html)、[InnoDB 自适应哈希索引](https://dev.mysql.com/doc/refman/8.4/en/innodb-adaptive-hash.html)。

#### 6.2 聚簇索引 vs 二级索引（回表）

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

#### 6.3 联合索引与最左前缀原则

**联合索引**：多个列组成一个索引，如 `INDEX idx(a, b, c)`。它是按 `a → b → c` 的顺序依次排序的：先按 a 排序，a 相同再按 b 排序，再按 c 排序。

**最左前缀原则**：联合索引 `(a, b, c)` 的物理排序可以支持以 `(a)`、`(a,b)`、`(a,b,c)` 为连续前缀的访问方式，但不是真的建立了三个独立索引。查询通常从最左列开始连续匹配，才能高效确定扫描区间：

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
-- ⚠️ 通常只能用 user_id 确定扫描区间；create_time 仍可能参与 ICP 过滤
SELECT * FROM orders WHERE user_id = 1 AND create_time > '2025-01-01';
```

**建联合索引的实用原则**：

1. 先根据真实查询里的 `WHERE + ORDER BY/GROUP BY + SELECT` 设计，而不是只看单列区分度。
2. 通常把稳定的等值条件放前面，把范围条件放在需要继续定位的列之后；范围列后的列仍可能参与 ICP 或覆盖索引，但通常不能继续缩小 B+ 树扫描区间。
3. 高频排序/分组要考虑索引顺序，查询列可酌情放在末尾形成覆盖索引，但不要为了覆盖把索引做得过宽。
4. 低区分度列不适合单独建索引，但与其他列组成联合索引仍可能很有价值，例如 `(status, create_time)` 服务“按状态查询最近数据”。

#### 6.4 索引失效的常见场景（背这 7 条）

| 场景 | 反例 | 说明 |
| --- | --- | --- |
| 1. 索引列做函数/运算 | `WHERE YEAR(create_time) = 2025` | 索引存的是原始值，运算后无法匹配 |
| 2. 隐式类型转换 | `WHERE phone = 13800138000`（phone 是 varchar） | MySQL 会把列转成数字，触发全表扫描 |
| 3. 前置模糊 | `WHERE name LIKE '%张'` | 左侧通配符破坏有序性，`LIKE '张%'` 可以走 |
| 4. 不满足最左前缀 | `WHERE b = 1`（索引是 (a,b,c)） | 通常不能直接利用该索引定位；MySQL 8 某些场景可能选择 Skip Scan |
| 5. OR 的部分条件无合适索引 | `WHERE id = 1 OR name = 'x'` | 可能全表扫描；两边都有索引时也可能使用 Index Merge |
| 6. 低选择性范围条件 | `WHERE status != 1` / `NOT IN (...)` | 不是语法上失效，而是命中行太多时全表扫描成本更低 |
| 7. `IS NULL`/`IS NOT NULL` 命中太多 | 视数据分布而定 | 两者都可以走索引，是否使用由成本和数据分布决定 |

```sql
-- 定位是否走索引：看 type 是否 ALL、key 是否 NULL
EXPLAIN SELECT * FROM orders WHERE YEAR(create_time) = 2025;   -- type=ALL 全表扫描
EXPLAIN SELECT * FROM orders WHERE create_time >= '2025-01-01'; -- type=range 走索引
```

#### 6.5 索引下推（Index Condition Pushdown，ICP）

**背景**：MySQL 5.6 之前，联合索引中「索引列」无法完全过滤的记录要回表后再判断，白白多了很多回表。ICP 让存储引擎在**索引层面**就把能用索引列的过滤条件先过滤掉，减少回表次数。

```sql
-- 联合索引 (name, age)，查询 name 范围 + age 过滤
SELECT * FROM user WHERE name LIKE '张%' AND age = 20;

-- 无 ICP：先用 name 范围拿所有记录，全部回表，再过滤 age
-- 有 ICP：在索引里就把 age=20 过滤掉，只有符合条件的才回表
```

`EXPLAIN` 的 `Extra` 出现 `Using index condition` 就说明用了 ICP。

#### 6.6 索引分类与管理语法

| 索引 | 特点 | 示例 |
| --- | --- | --- |
| 主键索引 | 唯一且非空，InnoDB 的聚簇索引 | `PRIMARY KEY (id)` |
| 唯一索引 | 保证非 `NULL` 值不重复 | `UNIQUE INDEX uk_phone(phone)` |
| 普通索引 | 只提高查询效率，不保证唯一 | `INDEX idx_status(status)` |
| 联合索引 | 多列按顺序组成一个索引 | `INDEX idx_user_status(user_id,status)` |
| 全文索引 | 面向自然语言文本搜索 | `FULLTEXT INDEX ft_content(content)` |
| 空间索引 | 加速空间数据查询 | `SPATIAL INDEX sp_location(location)` |

```sql
-- 创建索引
CREATE UNIQUE INDEX uk_user_phone ON user(phone);
CREATE INDEX idx_order_user_status_time
    ON orders(user_id, status, create_time DESC);

-- 查看索引
SHOW INDEX FROM orders;

-- 删除索引
DROP INDEX idx_order_user_status_time ON orders;
-- 或 ALTER TABLE orders DROP INDEX idx_order_user_status_time;
```

#### 6.7 前缀索引

长字符串直接建完整索引会占用大量空间。前缀索引只索引前 n 个字符：

```sql
CREATE INDEX idx_user_email_prefix ON user(email(12));

-- 比较不同前缀长度的选择性，越接近 1 区分度越高
SELECT COUNT(DISTINCT LEFT(email, 12)) / COUNT(*) AS selectivity
FROM user;
```

前缀索引更小，但不能完整覆盖原字段，通常无法直接满足按完整字段的覆盖查询和排序。应在索引大小与选择性之间取平衡。

#### 6.8 索引设计原则

1. 为高频 `WHERE`、`JOIN ON`、`ORDER BY`、`GROUP BY` 字段设计索引。
2. 优先根据完整查询设计联合索引，避免给每个字段各建一个单列索引。
3. 联合索引通常把稳定等值条件放前面，再考虑范围和排序；最终仍以执行计划和实测为准。
4. 选择性很低的字段通常不单独建索引，但 `(status, create_time)` 这类组合仍可能服务明确查询。
5. 使用覆盖索引减少回表，但不要为了覆盖塞入过多大字段。
6. 主键应短、稳定、非空并尽量有序；二级索引叶子节点会保存主键，主键过大会放大所有索引。
7. 索引不是越多越好：每个索引都会占空间，并增加 `INSERT/UPDATE/DELETE` 的维护成本。
8. 上线索引前检查重复索引、慢 SQL、数据分布和写入压力，建立后用 `EXPLAIN ANALYZE` 验证收益。

#### 6.9 SQL 索引提示

```sql
SELECT id, username
FROM user USE INDEX (idx_user_status)
WHERE status = 1;

SELECT id, username
FROM user IGNORE INDEX (idx_user_status)
WHERE status = 1;

SELECT id, username
FROM user FORCE INDEX (idx_user_status)
WHERE status = 1;
```

| 提示 | 含义 |
| --- | --- |
| `USE INDEX` | 建议优化器只在指定索引集合中选择，但仍可全表扫描 |
| `IGNORE INDEX` | 不考虑指定索引 |
| `FORCE INDEX` | 强烈要求使用指定索引，认为全表扫描代价很高 |

索引提示是最后手段，不是常规优化方案。数据分布和 MySQL 版本变化后，今天正确的强制索引可能变成错误选择；应先更新统计信息、检查索引和改写 SQL，再通过实测决定是否使用。

---

### 7. 事务与隔离级别

#### 7.1 什么是事务，ACID 是什么

**背景**：转账「A 扣 100、B 加 100」这两步要么都成功、要么都失败，不能扣了 A 的钱却没加到 B 头上。事务就是把一组操作打包成**一个不可分割的最小执行单元**。

**定义**：事务是数据库的一组操作，要么全部执行成功，要么全部回滚，是并发控制和崩溃恢复的基本单位。

**ACID 四特性（面试必背，且要知道靠什么实现）**：

| 特性 | 含义 | 靠什么实现 |
| --- | --- | --- |
| 原子性 Atomicity | 一组操作要么全成功、要么全失败 | **undo log**（回滚日志） |
| 一致性 Consistency | 事务前后数据都满足约束（状态合法） | 由 A + I + D 共同保证，是最终目标 |
| 隔离性 Isolation | 并发事务互不干扰 | **MVCC + 锁** |
| 持久性 Durability | 事务提交后数据永久保存 | **redo log**（重做日志） |

#### 7.2 并发带来的问题与四种隔离级别

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

#### 7.3 MVCC 的版本链（基础理解）

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

### 8. 锁的基础认识

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

> **关键认知**：InnoDB 的记录锁加在索引记录上。如果 `UPDATE/DELETE` 没有合适索引，就会扫描并锁住大量记录，效果可能接近锁表，因此特别容易引发锁等待和死锁。

**基础篇小结**：到这里已经掌握 MySQL 的「骨架」——架构分层、引擎选择、数据类型、SQL 五分类、常用函数、B+ 树索引、事务与隔离级别、锁的概念。下一步进入高级篇，把这些概念串成「一条 SQL 从优化到落盘再到主从同步」的完整闭环。

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
| `type` | **访问类型（重要但不能单独下结论）** | `ALL` 表示全表扫描；小表或返回大量数据时可能是合理计划 |
| `key` | 实际使用的索引 | `NULL` 表示没走索引，等于全表扫描 |
| `rows` | 优化器**预估**要扫描的行数 | 越小越好，与 `type=ALL` 一起看最能发现问题 |
| `key_len` | 索引实际用到的字节数 | 越大说明联合索引用到的列越多（越左前缀匹配越充分） |
| `Extra` | 额外信息 | `Using index`/`Using filesort` 等关键线索 |
| `id` | 查询块标识 | 用于区分查询层级，不能单独当作真实执行顺序；复杂 SQL 看 `FORMAT=TREE` 或 `EXPLAIN ANALYZE` |
| `select_type` | 查询类型 | `SIMPLE`/`PRIMARY`/`SUBQUERY`/`DERIVED`/`UNION` |
| `possible_keys` | 可能用到的索引 | 候选，可能为空 |
| `ref` | 与索引比较的是常量还是列 | `const` 或 `表.列名` |
| `filtered` | 通过本表条件后预计保留的百分比 | 结合 `rows` 看，预计流向下一步的行数约为 `rows × filtered%` |

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
| `Using temporary` | 需要内部临时结果，常见于分组、去重和 UNION | ⚠️ 关注数据量和是否落盘，不代表一定有问题 |
| `Using filesort` | 未按索引顺序直接返回，需要额外排序 | ⚠️ 小结果集内存排序很正常，大结果集才重点优化 |
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

**小结**：EXPLAIN 先看访问方式与索引，再看预计扫描行数和额外操作。出现 `ALL`、`key=NULL`、`Using filesort/temporary` 只是调查线索，必须结合表大小、返回比例以及 `EXPLAIN ANALYZE` 的实际行数和耗时判断。

---

### 2. SQL 优化实战

**背景**：掌握了 EXPLAIN，就有了「诊断工具」，这一节讲「治病的套路」——从定位慢 SQL，到索引优化、深分页、count、join 等高频实战场景。

本节是核心速览；完整的诊断流程、准确的执行计划解读和十类改写案例见 [SQL 优化实战](/learn_database/MySQL-SQL优化实战)。

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
5. **让过滤后结果集更小的一侧尽早参与 JOIN**，并给被查找一侧的连接列建立索引；通常由优化器按成本选择顺序。
6. **深分页用游标**（`WHERE id > 上次id`）替代大偏移 `LIMIT`。
7. **`IN` / `EXISTS` 先保证语义正确，再看执行计划**；MySQL 8 可能将两者改写成半连接，不能只背“谁大用谁”。
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
- 无条件统计行数优先写 `COUNT(*)`，语义最清楚；`COUNT(列)` 只统计非 NULL。InnoDB 会按成本选择较小的可用索引扫描，不能靠把 `*` 改成 `1` 获得稳定性能提升。
- 精确计数慢时，可用 `information_schema.tables` 的 `table_rows` 拿**估算值**，或用 Redis 计数器维护精确值。

```sql
-- 估算行数（不精确，但快）
SELECT table_rows FROM information_schema.tables WHERE table_name = 'orders';
```

#### 2.5 JOIN 优化

- **关注过滤后的结果集，而不是表的物理大小**：优化器通常会选择成本更低的连接顺序。真正关键的是尽早减少参与连接的行数。
- **被驱动表的 join 列必须有索引**：否则对被驱动表每行匹配都要全表扫（`Extra` 出现 `Using join buffer`）。
- **`IN` vs `EXISTS`**：两者语义不同，尤其 `NOT IN` 遇到 NULL 会产生 UNKNOWN；MySQL 8 还能把子查询优化成半连接，应以 `EXPLAIN ANALYZE` 的实际计划为准。

```sql
-- 被驱动表 o.user_id 建索引后，join 才高效
EXPLAIN SELECT * FROM user u INNER JOIN orders o ON u.id = o.user_id;
-- 看 rows：驱动表 rows 小、被驱动表走 eq_ref/ref 才是健康状态
```

::: tip 💡 面试题：JOIN 优化要点？什么是小表驱动大表？
一句话结论：尽早过滤出较小结果集，并让另一侧连接列具备合适索引。原因：连接成本取决于参与匹配的行数和单次匹配成本，而不只是两张表谁的物理行数更少；最终用 `EXPLAIN ANALYZE` 验证优化器的选择。
:::

#### 2.6 SQL 执行频率与耗时定位

```sql
-- 查看服务启动以来各种语句的执行次数
SHOW GLOBAL STATUS LIKE 'Com_______';

-- 查看当前会话是否支持旧版 profiling
SELECT @@have_profiling;
SET profiling = 1;
SHOW PROFILES;
SHOW PROFILE FOR QUERY 1;
```

`SHOW PROFILE` 属于旧式诊断手段，新项目优先使用慢查询日志、`EXPLAIN ANALYZE`、Performance Schema 和 `sys` schema：

```sql
-- 汇总执行次数、总延迟、平均延迟和扫描行数较高的语句
SELECT query,
       exec_count,
       total_latency,
       avg_latency,
       rows_examined
FROM sys.statement_analysis
ORDER BY total_latency DESC
LIMIT 20;
```

#### 2.7 INSERT 与大批量导入优化

```sql
-- 1. 多值批量插入，减少网络往返和 SQL 解析
INSERT INTO course_tag(course_id, tag_id)
VALUES (1, 10), (1, 11), (1, 12);

-- 2. 多批次写入时放进一个合理大小的事务，避免每条都单独提交
START TRANSACTION;
INSERT INTO course_tag(course_id, tag_id) VALUES (2, 10), (2, 11);
INSERT INTO course_tag(course_id, tag_id) VALUES (3, 10), (3, 11);
COMMIT;

-- 3. 文件导入通常比大量 INSERT 更快
LOAD DATA LOCAL INFILE 'D:/data/course.csv'
INTO TABLE course
FIELDS TERMINATED BY ','
OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 LINES;
```

实战原则：

1. 使用批量参数，而不是 Java 循环发送单条 SQL。
2. 每批大小要受 SQL 长度、内存、锁持有时间和 `max_allowed_packet` 约束，常从 500~1000 行压测。
3. 尽量按主键顺序写入，减少聚簇索引页分裂和随机 IO。
4. 大导入使用 `LOAD DATA`，但 `LOCAL` 涉及客户端文件读取权限，只在可信环境启用。

#### 2.8 主键优化

- 主键应尽量**短**：所有二级索引叶子节点都保存主键，主键越大，全部索引越大。
- 主键应**稳定**：不要更新主键，否则相当于移动聚簇索引记录，并修改相关二级索引。
- 主键应尽量**递增或趋势递增**：自增 ID、雪花 ID 通常比随机 UUID 更利于顺序写入。
- 不要使用身份证号、手机号等有业务含义且可能变化的数据作为主键。
- 分布式系统不能跨库依赖单库自增时，可使用雪花 ID、号段模式或数据库序列服务。

随机字符串主键会让新记录频繁插入 B+ 树中间位置，增加页分裂、数据移动和索引体积；如果必须使用 UUID，可考虑有序 UUID，并评估 `BINARY(16)` 存储。

#### 2.9 ORDER BY 与 GROUP BY 优化

```sql
CREATE INDEX idx_course_status_time
    ON course(status, create_time DESC, id DESC);

-- WHERE 等值匹配最左列，后续列顺序与 ORDER BY 一致，可利用索引有序性
SELECT id, title, create_time
FROM course
WHERE status = 1
ORDER BY create_time DESC, id DESC
LIMIT 20;
```

- 排序字段的顺序、方向要与索引兼容；混合升降序可在 MySQL 8 中建立降序索引。
- `Using filesort` 表示不能直接利用索引顺序，需要额外排序；它不一定是磁盘排序，也不代表一定慢，应结合行数判断。
- `GROUP BY` 同样可能利用联合索引的有序性；先用 `WHERE` 缩小数据，再按真实分组顺序设计索引。
- 不要为了消除一次小结果集排序建立低收益索引，索引会增加写成本。

#### 2.10 UPDATE 与 DELETE 优化

```sql
-- 条件列有唯一/普通索引时，存储引擎能快速定位并只锁必要范围
UPDATE course
SET status = 0
WHERE id = 1001;

-- 大批量历史数据分批删除，避免超大事务
DELETE FROM operation_log
WHERE create_time < '2025-01-01'
ORDER BY id
LIMIT 1000;
```

1. 更新和删除条件必须有合适索引，否则会扫描并锁住大量记录。
2. 修改前先用同条件 `SELECT` 验证范围，并检查受影响行数。
3. 大更新/删除拆批提交，减少 undo、redo、binlog、锁等待和主从延迟。
4. 避免频繁更新索引列；更新索引列不仅改数据，还要维护对应 B+ 树。
5. 需要防并发覆盖时使用版本号条件更新，并以影响行数判断是否成功。

**小结**：SQL 优化是一套「定位（慢日志）→ 诊断（执行计划与锁等待）→ 修改（索引/SQL/模型）→ 实测 → 回归」的闭环。常见根因是扫描行数过多、随机回表、排序聚合成本高或锁等待，而不是简单的“没有索引”。

---

### 3. 三大日志与两阶段提交

以 MySQL 8.4、InnoDB 表、开启 binlog 的普通事务为例。先记住分工：**undo 负责撤销和旧版本，redo 负责崩溃后修复数据页，binlog 负责复制和基于备份的时间点恢复**。三者不是同一份日志，也不在同一时刻才开始写。

下面的“写日志”要区分三件事：**生成记录 → 写入内存缓冲/缓存 → 写入文件并刷盘（fsync）**。执行 SQL 时生成日志，不等于每条 SQL 都立刻把所有日志刷到磁盘。

#### 3.1 redo log（重做日志，InnoDB 引擎层）

- **记录什么**：InnoDB 数据页、undo 页等底层修改的重做信息。它不是原始 SQL，也不是“整行旧值”；可以粗略理解为“某个页需要重做哪些改动”。
- **何时产生**：执行 `UPDATE`、`INSERT`、`DELETE` 并修改页时就产生 redo 记录。InnoDB 先在一次内部 **mini-transaction（mtr）** 中收集相关页的记录；mtr 结束时把整组记录放入内存 **log buffer**。后台 log writer 写文件，log flusher 负责刷盘。这里的 mtr 是“页操作的小原子单元”，**不是**用户写的 `START TRANSACTION ... COMMIT`。
- **WAL 的准确含义**：**数据页刷到磁盘之前，相应的 redo 必须先持久化**。内存中的数据页可以先被修改；WAL 不是“必须先把 redo 刷盘，才能改内存”。
- **为什么快**：先顺序写 redo，让随机分布的数据页以后再刷盘。脏页甚至可能在事务提交前刷盘，所以磁盘数据页上出现未提交的修改也不奇怪；宕机后还会用 undo 撤销它。
- **存在哪**：log buffer 在内存；MySQL 8.4 的 redo 文件通常在 `datadir/#innodb_redo/#ib_redoN`。总容量主要由 `innodb_redo_log_capacity` 控制；旧资料常写的 `innodb_log_file_size` / `innodb_log_files_in_group` 不应再当作 8.4 的首选配置。
- **为什么会复用空间**：LSN（日志序列号）持续递增；checkpoint 表示此前的必要脏页已落盘，相关旧 redo 才能回收空间。因此 redo **不是备份**，不能靠它恢复一周前误删的数据。

假设 `UPDATE account SET balance = 80 WHERE id = 1` 已提交，但更新后的数据页仍在 Buffer Pool：此时突然断电，重启时 InnoDB 从 checkpoint 后检查 redo，把还没落到数据文件的页修改重做出来。**redo 修复的是页，不负责判断“这笔事务该不该保留”；提交状态还要结合事务/两阶段提交信息。**

##### redo 记录到底长什么样？

它是**二进制记录流**，不能像应用日志那样打开看到 `UPDATE account ...`。MySQL 8.4 的 redo 文件由 log block 组成；一个 block 为 512 字节，含头部、记录数据、校验信息。单条页修改记录会包含**操作类型、表空间 ID、页号、具体操作所需的二进制内容**。源码里能看到 `MLOG_REC_UPDATE_IN_PLACE` 这样的操作类型，但不是说每次 `UPDATE` 都只生成这一条记录。

下面是**帮助理解的伪记录，不是从 redo 文件读出的真实文本或固定字段布局**：

```text
SQL: UPDATE account SET balance = 80 WHERE id = 1;

某个 mtr 的 redo 记录组（例如 LSN 600～680）：
  记录 A：type=某种 undo 页修改，space_id=9， page_no=5，   payload=<二进制操作参数>
  记录 B：type=MLOG_REC_UPDATE_IN_PLACE，space_id=42，page_no=123，payload=<二进制更新内容>

磁盘数据页：space_id=42、page_no=123，仍是 balance=100、page_LSN=500
内存数据页：同一页已经是 balance=80，记录了较新的修改 LSN
```

这里的 `space_id + page_no` 相当于“哪一个数据页”；`type + payload` 相当于“对这个页做什么”。**主键 `id=1`、旧值 `100`、新值 `80` 不一定以这几个可读字段直接躺在 redo 中**；旧值主要由 undo 保留。一个 SQL 可能改聚簇索引页、二级索引页、undo 页等，因此可对应多条 redo，甚至多个 mtr。LSN 是 redo 流的位置编号，上面的数字只为演示，**不是单条记录固定自带的 `LSN` 字段**。

##### UPDATE 时先写 redo，还是先改数据？

把“写”拆开就不矛盾了。以一次成功提交的更新为例：

```text
① 找到记录，准备 undo（以后可能要从 80 撤销回 100）
② 修改 Buffer Pool 中的页，同时在 mtr 内收集“如何重做页修改”的 redo
③ mtr 结束：这一组 redo 进入内存 log buffer；页被标脏
④ 后台线程：log buffer → redo 文件 → fsync（时点受配置/提交等待影响）
⑤ 数据页刷盘：可以晚于 COMMIT，也可能在提交前；刷盘前必须保证对应 redo 已持久化
```

所以，**不是“先把 redo 文件写好，再执行内存 UPDATE”**。WAL（预写日志）要求的是 **④ 必须早于对应数据页的⑤**，而不是④必须早于②。提交事务且采用安全刷盘配置时，即便⑤还没发生，MySQL 也能用已持久化的 redo 找回这次更新。对应的 [InnoDB 源码说明](https://dev.mysql.com/doc/dev/mysql-server/8.4.11/PAGE_INNODB_REDO_LOG.html)明确写到：mtr 收集页修改记录，结束后成组写入 log buffer；刷数据页的线程要等待 redo 刷到该页最新修改的 LSN。

##### 宕机后拿到这些 redo，具体怎么处理？

继续使用上面的页和 LSN，假设 redo 组 `600～680` 已刷盘、磁盘页仍停在 `page_LSN=500`：

1. **找起点**：MySQL 重启时读取最近的 checkpoint LSN，从那里向后扫描 redo 文件；检查日志块和记录组是否完整，不把尾部残缺记录当成有效操作。
2. **找目标页**：解析出 `space_id=42、page_no=123`，把对应数据页读进 Buffer Pool。
3. **决定是否重放**：磁盘页的 LSN 仍是 500，落后于这组修改，就对该页应用 redo，使它达到修改后的状态（示意为 `balance=80`）。若页已经刷过、LSN 足够新，就不再重复应用；这就是恢复能够安全重复检查的关键。
4. **决定事务结果**：**redo 重放不等于事务最终提交**。如果这笔事务已提交，保留 80；如果宕机时仍未提交，InnoDB 再沿 undo 撤销，余额回到 100；如果卡在 redo prepare 与 binlog 之间，按后文的两阶段提交规则判定。
5. **之后刷页**：恢复后的内存页按正常刷盘机制写回表空间，redo 在 checkpoint 推进后才可复用。

再看一个反例：如果②已改内存，但对应 redo **只在内存 log buffer、尚未持久化**，事务也没提交，此时断电就不要求保存这次修改；WAL 保证对应的脏数据页也不会在缺少持久 redo 的情况下安全落盘。**如果已向客户端确认提交，却因把 `innodb_flush_log_at_trx_commit` 调成低持久性配置而尚未刷 redo，机器断电后就可能丢最近的事务。**

> 你可以用 `SHOW GLOBAL STATUS` 观察当前、已刷盘、checkpoint 的 LSN（见 3.8），但这只显示进度数字；**普通 SQL 不能把某次 UPDATE 的 redo 直接打印成上面的伪记录**。不要手工修改 redo 文件验证恢复。

#### 3.2 binlog（归档日志，Server 层）

- **记录什么**：Server 层记录数据变更的事件；`ROW` 格式记行变更事件，`STATEMENT` 格式记语句，`MIXED` 混用。`SELECT` 不写入 binlog；ROW 格式的具体前后镜像受 `binlog_row_image` 等配置影响。
- **何时产生**：执行事务中的变更语句时，事件先放进该会话的 **binlog cache**（太大时可能借助临时文件）；事务 `COMMIT` 时，Server 层才把完整事务写入 binlog 文件。`ROLLBACK` 的纯 InnoDB 事务不会把这些未提交变更作为已提交事务发布出去。非事务表另当别论。
- **存在哪**：缓存先在内存/临时文件；正式 binlog 位于 `log_bin_basename` 指定的前缀位置，通常在 `datadir` 下，形成 `binlog.000001`、`binlog.000002` 等文件和索引文件。它是追加/轮转的，不像 redo 那样循环覆盖；保留时间与归档策略需要单独管理。
- **怎么用**：从库接收并重放事件；需要恢复到某个时间点时，**先恢复全量备份，再回放备份之后、目标时间之前的 binlog**。binlog 不是事务内 `ROLLBACK` 的工具。

| 格式 | 记录内容 | 优点 | 缺点 |
| --- | --- | --- | --- |
| `statement` | 记录 SQL 语句本身 | 通常较小 | 依赖不确定行顺序或执行环境的语句可能使复制结果不一致 |
| `row`（默认） | 记录受影响行的变更事件 | 复制结果更确定 | 通常比 statement 大 |
| `mixed` | 默认 statement，特殊场景切 row | 折中 | 复杂 |

例如没有确定排序的 `UPDATE ... LIMIT` 就可能依赖实际访问顺序；学习时先理解 ROW 与 STATEMENT 记录的对象不同。

#### 3.3 undo log（回滚日志，InnoDB 引擎层）

- **记录什么**：足以撤销本事务对聚簇索引记录的修改的信息。可以粗略理解为：`INSERT` 要能删除新行，`DELETE` 要能恢复旧行，`UPDATE` 要能恢复旧值；实际记录并非总是“复制一整行”。
- **何时产生**：InnoDB 修改行时，**在可回滚的修改发生前准备相应 undo 记录**，随后修改 Buffer Pool 中的数据页。undo 所在页的修改也会产生 redo，以便崩溃后仍能完成必要的回滚（用户临时表的 undo 有例外）。
- **存在哪**：不是一个名叫 `undo.log` 的文本文件。普通 InnoDB 表的 undo 放在回滚段所在的 **undo tablespace** 中；MySQL 8.4 默认有 `innodb_undo_001`、`innodb_undo_002`，位于 `innodb_undo_directory`，未配置时通常在 `datadir`。
- **怎么用**：事务主动 `ROLLBACK` 时，沿 undo 记录反向撤销；快照读需要旧版本时，沿记录上的回滚指针找到合适版本。事务提交后，不再需要用该事务的 undo 做主动回滚，但旧版本**不能立刻全部删除**：仍可能有旧 ReadView 需要它，之后由 purge 清理。

例如余额 `100 → 80` 后主动回滚：InnoDB 根据 undo 把余额恢复为 `100`；这个“恢复”的页修改本身也会产生 redo。**undo 是操作的反向依据，不是简单把整个文件倒着执行一遍。**

#### 3.4 一条 UPDATE：三份日志分别在什么时候写？

假设原值为 `100`，事务执行 `UPDATE account SET balance = 80 WHERE id = 1`，随后 `COMMIT`。这里的顺序是**教学用的逻辑阶段**；InnoDB 内部日志写入、刷盘和批量提交可以交错，不要把它当成逐行源码调用顺序。

| 阶段 | 内存/缓存里发生什么 | 何时持久化、去哪 |
| --- | --- | --- |
| ① 执行 UPDATE | 读入页；准备 undo；把 Buffer Pool 中的值改为 80；为 undo 页和数据页生成 redo；Server 收集 binlog 事件 | undo 页、数据页之后刷到各自表空间；redo 先进入 log buffer，binlog 先进入 binlog cache |
| ② COMMIT：prepare | InnoDB 将事务置于准备提交状态 | 确保对应 redo 的 prepare 状态按配置写入/刷盘到 redo 文件 |
| ③ COMMIT：写 binlog | Server 把整个事务的 binlog cache 写入正式 binlog | `sync_binlog=1` 时提交前同步到磁盘；同一批事务可 group commit |
| ④ COMMIT：引擎提交 | InnoDB 完成提交并记录相应提交状态；之后返回成功 | redo 记录与脏页的刷盘时点不是同一回事，脏数据页可稍后落盘 |
| ⑤ 后台工作 | 刷脏页、推进 checkpoint；不再需要的 undo 由 purge 清理 | 数据页/undo 页在表空间中；旧 redo 可复用，binlog 按保留策略归档/清理 |

**关键：执行 UPDATE 时已经有 undo/redo/binlog cache 的工作；“redo prepare → binlog → redo commit”说的是提交决策，不是三大日志从零开始产生的顺序。**

#### 3.5 三日志对比

| 日志 | 谁负责 | 主要记录 | 正式存储 | 解决的问题 |
| --- | --- | --- | --- | --- |
| **undo** | InnoDB | 撤销操作所需的信息、旧版本 | undo tablespace | 主动/崩溃回滚，MVCC |
| **redo** | InnoDB | 页修改的重做信息 | `#innodb_redo` 中的 redo 文件 | 宕机后修复尚未落盘的页 |
| **binlog** | Server | 已提交事务的数据变更事件 | 按 `log_bin_basename` 轮转的文件 | 复制、从备份做时间点恢复 |

#### 3.6 主动回滚与宕机恢复：到底怎么执行？

**主动 `ROLLBACK`**：当前事务在内存里已经把余额改成 80，但未提交。InnoDB 按 undo 撤销到 100，生成相应 redo，释放事务持有的锁；事务的 binlog cache 中的 InnoDB 变更不会作为已提交事务写入 binlog。别把 “回滚” 理解为“删掉刚写的 redo”。

**MySQL 进程/机器意外中断**：重启时 InnoDB 从 checkpoint 后读取 redo，把需要的页修改**向前重放**到可恢复状态。这些修改可能既包含已提交事务，也包含未提交事务；接着按事务状态处理：该提交的保留，未完成/该回滚的事务用 undo 撤销。恢复未完成事务可能在服务恢复期间继续进行，不能简单理解为“只重放已提交 redo”。

| 宕机时机 | 重启后的事务结果（正常持久化配置下） |
| --- | --- |
| UPDATE 执行中、尚未提交 | 必要时 redo 恢复页，再根据 undo 回滚；客户端未得到成功 |
| 已提交、数据页还没刷盘 | redo 补齐数据页；事务仍然是已提交 |
| 已进入 prepare，binlog 事务不完整 | 回滚 prepared 事务 |
| 已进入 prepare，完整 binlog 已持久化，但 InnoDB 尚未完成 commit | 根据 binlog 中的事务标识（XID）决定提交 prepared 事务 |

**不要混淆两种“恢复”**：重启后从 redo/undo 恢复的是**本机崩溃前的事务状态**，通常自动完成；从备份加 binlog 恢复的是**误删、磁盘损坏后的历史时间点**，需要备份和运维操作。redo 不能代替备份，binlog 也不能代替 undo。

#### 3.7 为什么还需要“两阶段提交”？

redo 属于 InnoDB、binlog 属于 Server。如果“本机认定已提交”却没有完整 binlog，从库/备份回放看不到该事务；反过来 binlog 有事务而本机回滚，也会不一致。因此 MySQL 在**事务提交阶段**协调两者：

```text
InnoDB redo: prepare（我已准备好，宕机后也能找回这个事务）
       ↓
Server binlog: 写入完整事务，并按 sync_binlog 策略刷盘
       ↓
InnoDB redo: commit（最终提交）
```

若恰好在中间崩溃，重启时 Server 扫描 binlog 中**完整有效的事务**及 XID：对应 prepared 事务若有完整 binlog 就提交，没有就回滚，并丢弃 binlog 末尾不完整部分。这里的 2PC 是 **MySQL 内部协调 binlog 与 InnoDB 的提交**，不要和业务里的“跨多个服务/数据库的分布式事务”混成一件事。

持久性还有前提：常见安全配置是 `innodb_flush_log_at_trx_commit=1` 与 `sync_binlog=1`。降低刷盘频率可能提高吞吐，但机器/操作系统崩溃时会有最近事务丢失或日志不一致风险；即使用安全值，也依赖存储设备正确执行刷盘。

#### 3.8 只读查看本机配置与日志位置

```sql
SHOW VARIABLES WHERE Variable_name IN (
  'datadir', 'innodb_undo_directory', 'innodb_redo_log_capacity',
  'log_bin', 'log_bin_basename', 'binlog_format',
  'innodb_flush_log_at_trx_commit', 'sync_binlog'
);

SHOW BINARY LOGS; -- 列出正式 binlog 文件；需相应权限
SELECT FILE_NAME FROM performance_schema.innodb_redo_log_files;
SHOW GLOBAL STATUS WHERE Variable_name IN (
  'Innodb_redo_log_current_lsn',
  'Innodb_redo_log_flushed_to_disk_lsn',
  'Innodb_redo_log_checkpoint_lsn'
);
SELECT NAME, SPACE_TYPE
FROM information_schema.INNODB_TABLESPACES
WHERE SPACE_TYPE = 'Undo';
```

路径以查询到的本机配置为准；权限不足时部分查询可能报错。**不要直接编辑、删除 redo/undo/binlog 文件来“测试恢复”**，要在独立练习库用 `START TRANSACTION`、`UPDATE`、`ROLLBACK` 和两个会话观察可见性。

::: tip 💡 面试题：一条 UPDATE 如何保证能回滚、断电后能恢复、主从一致？
一句话：执行时产生 undo 和 redo，并把变更暂存到 binlog cache；提交阶段协调 redo prepare、完整 binlog、InnoDB commit。主动回滚靠 undo；宕机后先用 redo 修复页，再撤销未提交事务；主从/时间点恢复依赖 binlog。
:::

官方资料：[Redo Log](https://dev.mysql.com/doc/refman/8.4/en/innodb-redo-log.html)、[InnoDB redo 源码说明](https://dev.mysql.com/doc/dev/mysql-server/8.4.11/PAGE_INNODB_REDO_LOG.html)、[Redo 记录头源码](https://dev.mysql.com/doc/dev/mysql-server/8.4.11/mtr0log_8ic.html)、[Undo Logs](https://dev.mysql.com/doc/refman/8.4/en/innodb-undo-logs.html)、[The Binary Log](https://dev.mysql.com/doc/refman/8.4/en/binary-log.html)、[InnoDB Recovery](https://dev.mysql.com/doc/refman/8.4/en/innodb-recovery.html)。

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

先固定一张用于对照的 ReadView：**事务 30 此前已修改过另一行，现在做普通 SELECT**；此时事务 20、25、30 仍活跃，下一笔将分配的事务 ID 为 35。

```text
ReadView {
  creator_trx_id = 30
  m_ids          = [20, 25, 30]
  min_trx_id     = 20
  max_trx_id     = 35
}
```

```
1. trx_id == creator_trx_id            → 自己改的，可见 ✅
2. trx_id <  min_trx_id                → 生成 ReadView 前已提交，可见 ✅
3. trx_id >= max_trx_id                → 生成 ReadView 后才启动，不可见 ❌
4. min_trx_id <= trx_id < max_trx_id   → 落在活跃区间：
   - trx_id 在 m_ids 中（未提交）      → 不可见 ❌
   - trx_id 不在 m_ids 中（已提交）     → 可见 ✅
不可见则顺着 roll_ptr 找上一个旧版本，重复上述判断。
```

把数字代入上面的规则：

| 某版本的 `trx_id` | 命中哪条规则 | 能否看见 |
| --- | --- | --- |
| 30 | 规则 1：自己修改 | ✅ |
| 18 | 规则 2：`18 < 20`，快照前已提交 | ✅ |
| 36 | 规则 3：`36 >= 35`，快照后才出现 | ❌ |
| 25 | 规则 4：在 `[20,35)` 内，且在 `m_ids` 中 | ❌ |
| 23 | 规则 4：在 `[20,35)` 内，但不在 `m_ids` 中 | ✅ |

例如余额这一行的版本链是 `70（trx_id=36）→ 80（trx_id=25）→ 90（trx_id=23）`。事务 30 沿链依次跳过 70 和 80，最终读到 **90**。即使事务 25 后来提交，只要事务 30 在 RR 下复用这张 ReadView，80 对它仍不可见；36 是更晚启动的事务，也不可见。`trx_id=30` 的“自己修改”规则可用另一行理解，不必硬塞进这条余额版本链。

**用一句话概括**：普通快照读能看自己修改的版本，也能看 ReadView 生成时已经提交的版本；看不到的就沿 `roll_ptr` 找更旧的版本。

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
| **全局读锁** | `FLUSH TABLES WITH READ LOCK` 让整个实例只读，常用于特定备份场景，会阻塞业务写入 |

```sql
-- 全局只读锁：当前会话断开或显式解锁后释放
FLUSH TABLES WITH READ LOCK;
UNLOCK TABLES;
```

对 InnoDB 做逻辑备份通常优先使用 `mysqldump --single-transaction` 获取一致性快照，避免全局读锁长期阻塞写入；它不适用于不支持事务的表。

**关键认知**：InnoDB 的记录锁是加在索引记录上的。`UPDATE/DELETE` 的条件没有合适索引时，会扫描并锁住大量记录，效果可能接近锁表，极易引发锁等待和死锁；这不是把锁类型直接“升级成表锁”。

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
3. **给 WHERE 条件设计合适索引**，避免扫描并锁住大量记录。
4. 尽量用一次性锁住所有需要的资源（`SELECT ... FOR UPDATE` 提前加锁）。

::: tip 💡 面试题：死锁是怎么产生的？如何避免？
一句话结论：死锁是两个事务互相等待对方持有的锁形成循环等待；InnoDB 用死锁检测回滚其中一个来打破。原因：加锁顺序不一致 + 持锁时间过长导致。展开：避免方法是「统一加锁顺序、缩短事务、让 WHERE 使用合适索引」。
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

### 8. 视图

视图是保存在数据库中的 `SELECT` 定义。查询视图时才根据定义产生结果，因此它通常是“虚拟表”，不是一份独立复制的数据。

#### 8.1 创建、查询、修改和删除

```sql
-- 只暴露允许前端后台查询的课程字段
CREATE OR REPLACE VIEW v_course_public AS
SELECT id, title, cover, price, teacher_id, category_id
FROM course
WHERE status = 1
  AND deleted_at IS NULL
WITH CASCADED CHECK OPTION;

SELECT * FROM v_course_public WHERE category_id = 10;
SHOW CREATE VIEW v_course_public;

ALTER VIEW v_course_public AS
SELECT id, title, cover, price
FROM course
WHERE status = 1
WITH CASCADED CHECK OPTION;

DROP VIEW IF EXISTS v_course_public;
```

`WITH CHECK OPTION` 要求通过视图新增或修改后的记录仍满足视图条件：

| 检查方式 | 含义 |
| --- | --- |
| `LOCAL` | 只检查当前视图自身条件 |
| `CASCADED` | 同时检查当前视图及依赖的底层视图条件，默认方式 |

#### 8.2 视图能否更新

简单的单表视图通常可更新；包含下面结构的视图通常不可直接更新：聚合函数、`DISTINCT`、`GROUP BY`、`HAVING`、`UNION`、窗口函数以及某些复杂 JOIN/子查询。

视图的价值主要是：

1. 封装复杂查询，统一复用口径。
2. 只暴露部分行和列，配合权限增强数据安全。
3. 给调用方提供相对稳定的查询接口，降低底层表变化的影响。

视图不会天然提升性能；复杂视图层层嵌套反而会让执行计划难读，应像普通 SQL 一样使用 `EXPLAIN` 验证。

---

### 9. 存储过程、存储函数与触发器

它们都是把 SQL 逻辑保存在 MySQL 服务端的数据库对象。面试需要会基本语法，Java 微服务项目则应谨慎使用：复杂业务逻辑放在数据库里，会增加版本管理、单元测试、调试、迁移和扩容难度。

#### 9.1 存储过程

存储过程通过 `CREATE PROCEDURE` 创建，使用 `CALL` 调用；它可以返回结果集，也可以通过 `OUT/INOUT` 参数传回值。

```sql
DELIMITER //

CREATE PROCEDURE p_course_stat(
    IN p_category_id BIGINT,
    OUT p_course_count INT
)
BEGIN
    SELECT COUNT(*)
    INTO p_course_count
    FROM course
    WHERE category_id = p_category_id
      AND deleted_at IS NULL;
END //

DELIMITER ;

CALL p_course_stat(10, @course_count);
SELECT @course_count;

SHOW CREATE PROCEDURE p_course_stat;
DROP PROCEDURE IF EXISTS p_course_stat;
```

`DELIMITER` 是 MySQL 客户端命令，用来临时更换语句结束符，避免过程体内部的分号提前结束 `CREATE PROCEDURE`；它不是存储过程语法本身。

##### 参数模式

| 模式 | 作用 |
| --- | --- |
| `IN` | 调用方传入，只作为输入，默认模式 |
| `OUT` | 过程内部赋值，调用后传回 |
| `INOUT` | 调用前有值，过程可修改并传回 |

##### 三类变量

```sql
-- 系统变量：影响 MySQL 或当前会话行为
SELECT @@global.max_connections;
SELECT @@session.transaction_isolation;
SET SESSION sql_safe_updates = 1;

-- 用户变量：当前连接内有效，以 @ 开头，不必声明
SET @course_count = 0;
SELECT COUNT(*) INTO @course_count FROM course;

-- 局部变量：只能在 BEGIN...END 中使用，必须 DECLARE
DECLARE current_count INT DEFAULT 0;
```

`DECLARE` 必须写在当前 `BEGIN...END` 块的开头，并且声明顺序通常是：局部变量 → 游标 → 条件处理器。

##### 条件与循环

```sql
IF score >= 85 THEN
    SET level_name = '优秀';
ELSEIF score >= 60 THEN
    SET level_name = '及格';
ELSE
    SET level_name = '不及格';
END IF;

CASE
    WHEN price = 0 THEN SET price_level = '免费';
    WHEN price < 100 THEN SET price_level = '入门价';
    ELSE SET price_level = '精品课';
END CASE;
```

| 循环 | 特点 | 退出方式 |
| --- | --- | --- |
| `WHILE condition DO ... END WHILE` | 先判断再执行，可能一次不执行 | 条件变为假 |
| `REPEAT ... UNTIL condition END REPEAT` | 先执行再判断，至少执行一次 | `UNTIL` 为真 |
| `[label:] LOOP ... END LOOP` | 无条件循环 | `LEAVE label` |

`ITERATE label` 类似 Java 的 `continue`，`LEAVE label` 类似带标签的 `break`。

##### 游标与条件处理器

游标用于逐行读取查询结果。能使用集合 SQL 一次完成时，不要使用游标，因为逐行处理通常更慢。

```sql
DELIMITER //

CREATE PROCEDURE p_collect_course_titles(IN p_category_id BIGINT)
BEGIN
    DECLARE done BOOLEAN DEFAULT FALSE;
    DECLARE v_title VARCHAR(200);

    DECLARE course_cursor CURSOR FOR
        SELECT title FROM course WHERE category_id = p_category_id;

    -- FETCH 没有下一行时设置 done=true，然后继续执行
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    OPEN course_cursor;

    read_loop: LOOP
        FETCH course_cursor INTO v_title;
        IF done THEN
            LEAVE read_loop;
        END IF;

        -- 在这里处理当前行；示例只输出
        SELECT v_title;
    END LOOP;

    CLOSE course_cursor;
END //

DELIMITER ;
```

条件处理器语法：

```sql
DECLARE CONTINUE HANDLER FOR NOT FOUND ...;
DECLARE EXIT HANDLER FOR SQLEXCEPTION ...;
```

- `CONTINUE`：处理异常后继续执行。
- `EXIT`：处理异常后退出当前 `BEGIN...END` 块。
- 常用条件有 `NOT FOUND`、`SQLWARNING`、`SQLEXCEPTION`，也可以指定 `SQLSTATE`。

#### 9.2 存储函数

存储函数必须通过 `RETURN` 返回一个值，可以像内置函数一样出现在表达式中。

```sql
DELIMITER //

CREATE FUNCTION f_course_level(p_price DECIMAL(10,2))
RETURNS VARCHAR(20)
DETERMINISTIC
NO SQL
BEGIN
    RETURN CASE
        WHEN p_price = 0 THEN '免费'
        WHEN p_price < 100 THEN '入门价'
        ELSE '精品课'
    END;
END //

DELIMITER ;

SELECT title, f_course_level(price) AS price_level
FROM course;

DROP FUNCTION IF EXISTS f_course_level;
```

`DETERMINISTIC` 表示相同输入总会得到相同结果；还可按实际行为声明 `NO SQL`、`READS SQL DATA` 等特征。开启 binlog 时，创建未正确声明特征的存储函数可能需要额外权限或 `log_bin_trust_function_creators` 配置，不要为了绕过校验随意修改生产全局变量。

| 对比 | 存储过程 | 存储函数 |
| --- | --- | --- |
| 调用 | `CALL procedure(...)` | 在 SQL 表达式中调用 |
| 返回 | 可返回结果集或通过 `OUT` 参数返回多个值 | 必须 `RETURN` 一个值 |
| 主要用途 | 执行一组数据库操作 | 封装可复用计算 |

#### 9.3 触发器

触发器绑定到表，在 `INSERT`、`UPDATE`、`DELETE` 的 `BEFORE` 或 `AFTER` 时机自动执行。MySQL 触发器是行级触发器：一次更新 100 行，就会触发 100 次。

| 事件 | `OLD` | `NEW` |
| --- | --- | --- |
| `INSERT` | 不可用 | 新记录 |
| `UPDATE` | 修改前记录 | 修改后记录 |
| `DELETE` | 删除前记录 | 不可用 |

```sql
CREATE TABLE course_audit (
    id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    course_id    BIGINT NOT NULL,
    old_status   TINYINT,
    new_status   TINYINT,
    operate_time DATETIME NOT NULL
);

DELIMITER //

CREATE TRIGGER trg_course_after_update
AFTER UPDATE ON course
FOR EACH ROW
BEGIN
    INSERT INTO course_audit(course_id, old_status, new_status, operate_time)
    VALUES (NEW.id, OLD.status, NEW.status, NOW());
END //

DELIMITER ;

SHOW TRIGGERS;
DROP TRIGGER IF EXISTS trg_course_after_update;
```

触发器适合非常简单、必须贴近数据的数据审计或约束补充。复杂业务不建议放触发器：它是隐式执行，容易出现性能抖动、递归依赖、排查困难和主从复制影响；业务审计通常更适合应用事件、消息队列或 binlog CDC。

参考：[MySQL 8.4 Stored Objects](https://dev.mysql.com/doc/en/stored-objects.html)、[Using Views](https://dev.mysql.com/doc/refman/8.4/en/views.html)。

---

### 10. 系统数据库与常用工具

#### 10.1 四个系统数据库

| 数据库 | 作用 |
| --- | --- |
| `mysql` | 用户、权限、时区等系统数据，不能随意手改 |
| `information_schema` | 库、表、列、索引等元数据的只读视图 |
| `performance_schema` | 采集语句、等待、锁、内存等运行性能数据 |
| `sys` | 对 Performance Schema 的结果进行更易读的汇总 |

#### 10.2 命令行工具

| 工具 | 主要用途 | 常用示例 |
| --- | --- | --- |
| `mysql` | 连接数据库、执行 SQL | `mysql -h127.0.0.1 -P3306 -uroot -p course_mall` |
| `mysqladmin` | 查看状态、执行简单管理命令 | `mysqladmin -uroot -p status` |
| `mysqlbinlog` | 查看和按时间/位置读取 binlog | `mysqlbinlog binlog.000001` |
| `mysqlshow` | 快速查看库、表和字段信息 | `mysqlshow -uroot -p course_mall` |
| `mysqldump` | 逻辑备份库或表 | `mysqldump -uroot -p --single-transaction course_mall > backup.sql` |
| `mysqlimport` | 从文本文件批量导入表 | `mysqlimport --local -uroot -p course_mall course.txt` |

```sql
-- 在 mysql 客户端中导入 SQL 文件
SOURCE E:/backup/course_mall.sql;
```

InnoDB 在线逻辑备份常加 `--single-transaction`，以一致性快照导出并减少锁表影响；若还要备份存储过程、事件和触发器，要检查 `--routines`、`--events`、`--triggers` 选项。生产恢复必须定期演练，只有“备份成功”日志而没有恢复验证不算可靠备份。

---

### 高级篇小结

- SQL 优化 = 慢日志定位 + EXPLAIN/ANALYZE 诊断 + 针对性修改 + 实测与回归，不能只靠是否走索引下结论。
- 三大日志分工：redo 崩溃恢复、binlog 主从复制、undo 回滚 + MVCC；两阶段提交保证 redo/binlog 一致。
- MVCC = 版本链 + ReadView，RC 每次读新建 ReadView，RR 复用第一个；快照读不加锁、当前读加锁。
- 锁体系核心：Record/Gap/Next-Key 三兄弟，间隙锁防幻读；记录锁加在索引记录上，缺少合适索引会扫描并锁住大量记录。
- 高可用演进：主从读写分离 → 半同步/MHA 故障切换 → 分库分表。
- 数据库对象：视图封装查询；存储过程/函数/触发器要会读写基本语法，但 Java 微服务中谨慎承载复杂业务。

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
| 持久性 D | redo log + WAL | 提交时按配置持久化 redo；数据页可以稍后刷盘 |
| 隔离性 I | MVCC + 锁 | 读走快照，写加锁 |
| 一致性 C | 以上三者 | 是最终目标，不是单独机制 |

#### 5.2 一条 UPDATE 的完整生命周期（回顾）

```sql
UPDATE account SET balance = balance - 50 WHERE id = 1;
```

```text
执行阶段：定位并锁定记录 → 生成 undo → 修改 Buffer Pool 页并生成 redo
                                 → 变更事件暂存 binlog cache
提交阶段：redo prepare → 完整 binlog 写入/按配置刷盘 → InnoDB commit
之后：返回成功；脏页按需刷盘，旧 undo 待不再被快照读使用后清理
```

**WAL 的“先写”指的是数据页落盘前，相关 redo 必须先持久化**，不是内存页修改前必须先刷 redo；redo 也不是到 prepare 阶段才开始生成。具体回滚与崩溃分支见前面的“三大日志与两阶段提交”。

::: tip 💡 面试题：一条 UPDATE 从执行到落盘经历了什么？
一句话结论：执行时生成 undo/redo 并暂存 binlog 事件；提交时协调 redo prepare、完整 binlog 和 InnoDB commit。回滚靠 undo，崩溃修复页靠 redo，复制靠 binlog；数据页不必等到提交就刷盘，也不要求提交时立刻刷盘。
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
- **Q：为什么没有索引的更新看起来像锁表？** A：InnoDB 的记录锁加在索引记录上；条件无法有效定位时会扫描并锁住大量记录，效果可能接近锁表，但并非直接升级为表锁。
- **Q：死锁怎么处理？** A：InnoDB 检测等待图回滚一个事务；避免方法是统一加锁顺序、缩短事务、加索引。

**日志与崩溃恢复**

- **Q：redo log 和 binlog 区别？** A：redo 是 InnoDB 物理日志、循环写、崩溃恢复；binlog 是 Server 逻辑日志、追加写、主从复制。
- **Q：两阶段提交为什么？** A：保证 redo 和 binlog 一致，避免主从不一致；流程是 redo prepare → binlog → redo commit。
- **Q：doublewrite 解决什么？** A：页断裂——16KB 页写一半宕机损坏，先顺序写副本再写真实位置，损坏时用副本恢复。

**SQL 优化**

- **Q：EXPLAIN 看什么？** A：先看访问方式、实际索引、预计扫描行数和 Extra，再用 `EXPLAIN ANALYZE` 对照实际耗时、行数与循环次数；`ALL/filesort/temporary` 是线索，不是必然错误。
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
