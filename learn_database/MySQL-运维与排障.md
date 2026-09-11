# MySQL 运维与排障

这篇不是让你背成 DBA，而是让后端开发具备三种能力：**知道 MySQL 是否健康、能快速定位常见故障、知道数据如何备份和恢复**。

学习顺序：日志 → 监控与排障 → 备份恢复 → 主从复制 → 读写分离与高可用 → 分库分表。

> 本文按 MySQL 8.4 编写。网上常见的 `MASTER/SLAVE`、`RESET MASTER` 是旧语法；8.4 优先使用 `SOURCE/REPLICA`、`RESET BINARY LOGS AND GTIDS`。

## 1. 先认识运行环境

### 1.1 服务、配置和数据目录

MySQL 运维首先要分清三个东西：

| 对象 | 作用 | 常见位置 |
| --- | --- | --- |
| MySQL 服务 | 正在运行的 `mysqld` 进程 | Windows 服务 / Linux systemd |
| 配置文件 | 启动参数，如端口、日志和内存 | Windows `my.ini`；Linux `/etc/my.cnf` |
| 数据目录 | 表空间、redo、undo、binlog 等文件 | 用 `datadir` 查询，不要凭经验猜 |

```sql
SHOW VARIABLES WHERE Variable_name IN (
    'basedir', 'datadir', 'port', 'socket',
    'log_error', 'slow_query_log_file', 'log_bin_basename'
);

SELECT VERSION();
SELECT @@hostname, @@port, @@server_uuid;
```

```powershell
# Windows：先查真实服务名，再操作服务
Get-Service *mysql*
Start-Service MySQL84
Stop-Service MySQL84
Restart-Service MySQL84
```

```bash
# Linux
systemctl status mysqld
systemctl start mysqld
systemctl restart mysqld
journalctl -u mysqld --since "30 min ago"
```

修改配置前先执行 `SHOW VARIABLES` 确认当前值；修改后还要区分：

- `SET SESSION`：只影响当前连接。
- `SET GLOBAL`：影响之后新建的连接，重启后通常丢失。
- `SET PERSIST`：写入 `mysqld-auto.cnf`，重启后仍生效。
- 配置文件：适合基础设施统一管理；改完通常需要重启。

```sql
SET PERSIST slow_query_log = ON;
SET PERSIST long_query_time = 1;
```

## 2. 四类运行日志

先区分“数据库内部日志”和“运维可查看日志”：redo/undo 是 InnoDB 实现事务的内部日志；下面四类是运维时经常查看或配置的服务日志。

| 日志 | 默认状态 | 记录什么 | 主要用途 |
| --- | --- | --- | --- |
| 错误日志 `error log` | 开启 | 启停、崩溃恢复、严重错误、告警 | 服务起不来时第一个看 |
| 二进制日志 `binlog` | 8.x 通常开启 | DDL 与数据变更事件，不记录普通 SELECT | 主从复制、增量恢复、CDC |
| 慢查询日志 `slow log` | 通常关闭 | 超过阈值的 SQL | 找慢 SQL |
| 通用查询日志 `general log` | 关闭 | 客户端几乎所有语句和连接 | 临时审计/调试，不宜长期打开 |

### 2.1 错误日志

```sql
SHOW VARIABLES LIKE 'log_error';
```

遇到这些问题先看错误日志：

- MySQL 无法启动、端口被占用。
- 配置项拼错或值非法。
- InnoDB 崩溃恢复失败。
- 磁盘满、权限不足、文件损坏。
- 服务异常退出或频繁重启。

排障时不要只截最后一行，要从首次出现 `ERROR` 的位置向上看上下文；后面的异常经常只是第一个错误的连锁反应。

### 2.2 binlog

binlog 有三种格式：

| 格式 | 记录方式 | 特点 |
| --- | --- | --- |
| `ROW` | 记录每行如何变化 | 默认推荐，复制准确；日志较大 |
| `STATEMENT` | 记录原 SQL | 日志较小；非确定性 SQL 可能导致主从不一致 |
| `MIXED` | 两者混合 | 行为更难预测，实际项目较少主动选择 |

```sql
SHOW VARIABLES WHERE Variable_name IN (
    'log_bin', 'binlog_format', 'binlog_expire_logs_seconds',
    'sync_binlog', 'log_bin_basename', 'log_bin_index'
);

SHOW BINARY LOGS;
SHOW MASTER STATUS; -- 查看当前 binlog 文件和位点；8.4 仍可用于位点复制
```

查看文件内容要使用 `mysqlbinlog`，因为 binlog 是二进制文件：

```bash
mysqlbinlog --base64-output=DECODE-ROWS -vv binlog.000123
mysqlbinlog --start-datetime="2026-09-11 10:00:00" \
             --stop-datetime="2026-09-11 10:10:00" binlog.000123
```

清理时优先使用过期策略，不能直接在文件系统里删除 binlog：

```ini
[mysqld]
binlog_expire_logs_seconds=604800  # 保留 7 天
```

```sql
PURGE BINARY LOGS BEFORE '2026-09-01 00:00:00';
PURGE BINARY LOGS TO 'binlog.000120'; -- 删除目标文件之前的日志，不含目标文件
```

`RESET BINARY LOGS AND GTIDS` 会删除全部 binlog 并清空 GTID 历史，破坏恢复链和复制依据，日常清理禁止使用。MySQL 8.4 已不再支持旧命令 `RESET MASTER`。

### 2.3 慢查询日志

```ini
[mysqld]
slow_query_log=ON
slow_query_log_file=mysql-slow.log
long_query_time=1
min_examined_row_limit=100
log_slow_admin_statements=ON
# 只建议短时间诊断时打开，否则可能产生大量日志
log_queries_not_using_indexes=OFF
```

```sql
SHOW VARIABLES WHERE Variable_name IN (
    'slow_query_log', 'slow_query_log_file', 'long_query_time',
    'min_examined_row_limit', 'log_queries_not_using_indexes'
);

SHOW GLOBAL STATUS LIKE 'Slow_queries';
```

慢日志的正确用法是：

```text
慢日志发现候选 SQL
  → performance_schema / sys 看累计耗时和调用次数
  → EXPLAIN ANALYZE 看真实执行过程
  → 修改索引或 SQL
  → 用相同数据量回归验证
```

`long_query_time` 只看执行时间，不能发现“单次很快但每秒执行上万次”的 SQL，因此还要结合 `sys.statement_analysis`。

### 2.4 通用查询日志

```sql
SET GLOBAL log_output = 'FILE';
SET GLOBAL general_log = ON;

-- 完成短时诊断后立即关闭
SET GLOBAL general_log = OFF;
```

它会记录大量语句，明显增加 IO 和磁盘占用。线上只在限定时间内打开，不能把它当日常 SQL 日志。

## 3. 运行状态与容量监控

### 3.1 最少要关注哪些指标

| 分类 | 关键指标 | 异常意味着什么 |
| --- | --- | --- |
| 可用性 | 服务存活、连接是否成功 | 实例故障或网络故障 |
| 连接 | `Threads_connected`、`Threads_running`、`Max_used_connections` | 连接池泄漏、并发过高、SQL 阻塞 |
| 吞吐 | `Questions`、`Queries`、`Com_*` | QPS/TPS 突变 |
| InnoDB 缓存 | Buffer Pool 命中、脏页、空闲页 | 内存不足或刷盘压力大 |
| SQL | 慢 SQL 数、扫描行数、临时表、排序 | SQL/索引不合理 |
| 锁 | 锁等待、死锁、长事务 | 事务范围过大或访问顺序不一致 |
| 复制 | IO/SQL 线程、延迟、复制错误 | 从库不可用或数据落后 |
| 主机 | CPU、内存、磁盘空间、IOPS、网络 | 数据库之外的资源瓶颈 |

```sql
SHOW GLOBAL STATUS WHERE Variable_name IN (
    'Uptime', 'Threads_connected', 'Threads_running',
    'Max_used_connections', 'Questions', 'Slow_queries',
    'Created_tmp_tables', 'Created_tmp_disk_tables',
    'Innodb_buffer_pool_read_requests', 'Innodb_buffer_pool_reads',
    'Innodb_row_lock_waits', 'Innodb_deadlocks'
);

SHOW VARIABLES WHERE Variable_name IN (
    'max_connections', 'innodb_buffer_pool_size',
    'tmp_table_size', 'max_heap_table_size'
);
```

Buffer Pool 粗略命中率：

```text
1 - Innodb_buffer_pool_reads / Innodb_buffer_pool_read_requests
```

命中率只能辅助判断，不能脱离业务访问模式机械追求某个百分比。

### 3.2 找当前正在执行的 SQL

```sql
SHOW FULL PROCESSLIST;

SELECT processlist_id,
       processlist_user,
       processlist_host,
       processlist_time,
       processlist_state,
       processlist_info
FROM performance_schema.threads
WHERE processlist_command <> 'Sleep'
ORDER BY processlist_time DESC;
```

- `Sleep` 很多：可能只是连接池保留连接，不一定有问题。
- `Threads_running` 持续很高：通常比连接总数高更危险，说明大量线程正在争抢 CPU/IO/锁。
- `Sending data` 不只是网络发送，也可能还在读取、过滤和构造结果。

必要时可以终止单个异常连接：

```sql
KILL QUERY 123;      -- 只终止当前语句，保留连接
KILL CONNECTION 123; -- 终止整个连接
```

执行前确认线程 ID、用户、来源和 SQL；不要批量误杀业务连接。

### 3.3 找累计最消耗资源的 SQL

```sql
SELECT query,
       exec_count,
       total_latency,
       avg_latency,
       rows_examined,
       rows_sent,
       tmp_disk_tables
FROM sys.statement_analysis
ORDER BY total_latency DESC
LIMIT 20;
```

选择优化目标时综合看：总耗时、平均耗时、执行次数、扫描/返回行数比、磁盘临时表，而不是只盯最慢的一次。

### 3.4 查长事务、锁等待和死锁

```sql
-- 未提交时间较长的事务
SELECT trx_id,
       trx_mysql_thread_id,
       trx_started,
       trx_state,
       trx_rows_locked,
       trx_rows_modified,
       trx_query
FROM information_schema.innodb_trx
ORDER BY trx_started;

-- 谁被谁阻塞；sys 已封装 performance_schema 的锁表
SELECT *
FROM sys.innodb_lock_waits
ORDER BY wait_age_secs DESC;

-- 最近一次死锁、事务和 Buffer Pool 摘要
SHOW ENGINE INNODB STATUS\G
```

排查锁等待时按这个顺序：

1. 在 `sys.innodb_lock_waits` 找等待者和阻塞者。
2. 查双方 SQL、事务开始时间和锁住的行数。
3. 判断是否为忘记提交、事务太长、更新条件无索引或加锁顺序不一致。
4. 紧急情况下先终止阻塞会话，再修代码；不能把“杀连接”当根治方案。

## 4. 常见故障排查 Runbook

### 4.1 应用连不上 MySQL

```text
1. 服务是否运行
2. IP 和端口是否监听
3. 用户名、密码、host 匹配规则是否正确
4. 防火墙、安全组、bind-address 是否放行
5. 连接数是否耗尽
6. TLS、认证插件和驱动版本是否兼容
7. 看错误日志确认服务端真实原因
```

```sql
SHOW VARIABLES LIKE 'max_connections';
SHOW GLOBAL STATUS LIKE 'Threads_connected';
SELECT user, host, plugin, account_locked FROM mysql.user;
```

### 4.2 CPU 突然升高

1. 看 `Threads_running` 是否同时升高。
2. `SHOW FULL PROCESSLIST` 找正在执行的 SQL。
3. `sys.statement_analysis` 找累计热点。
4. 对候选 SQL 执行 `EXPLAIN ANALYZE`。
5. 检查是否发生全表扫描、错误 JOIN、排序/聚合、执行计划变化或流量突增。

不要一上来就重启 MySQL。重启会丢失现场，而且问题很可能在流量回来后复现。

### 4.3 磁盘空间不足

优先排查：binlog、慢日志/通用日志、临时文件、备份文件、表空间增长。

```sql
SELECT table_schema,
       ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb
FROM information_schema.tables
GROUP BY table_schema
ORDER BY size_mb DESC;

SELECT table_schema, table_name,
       ROUND((data_length + index_length) / 1024 / 1024, 2) AS size_mb
FROM information_schema.tables
ORDER BY data_length + index_length DESC
LIMIT 20;
```

不能直接删除 InnoDB 数据文件或正在使用的 binlog。先确认文件用途，再用 MySQL 命令或标准归档流程清理。

### 4.4 DDL 一直卡住

常见原因不是 DDL 本身慢，而是它在等待 **MDL 元数据锁**；一个长事务即使已经执行完 SQL，只要没提交，也可能挡住 `ALTER TABLE`。

```sql
SELECT * FROM sys.schema_table_lock_waits;
SELECT * FROM information_schema.innodb_trx ORDER BY trx_started;
```

生产变更建议：

- 先检查长事务和表大小。
- 明确指定可接受算法和锁级别，让不支持时直接失败，而不是悄悄阻塞业务。
- 大表使用在线 DDL 工具前必须在同版本、同数据量环境演练。

```sql
ALTER TABLE orders
ADD INDEX idx_user_created(user_id, create_time),
ALGORITHM=INPLACE,
LOCK=NONE;
```

不同 DDL、版本和表结构支持的算法不同；出现不支持错误后重新评估，不能盲目去掉限制上线。

## 5. 备份与恢复

### 5.1 先理解四组概念

| 维度 | 类型 | 说明 |
| --- | --- | --- |
| 备份内容 | 逻辑备份 | 导出 CREATE/INSERT 等逻辑内容，易迁移，恢复较慢 |
| 备份内容 | 物理备份 | 复制数据文件，速度快，通常更依赖版本和工具 |
| 数据范围 | 全量备份 | 某一时点的完整数据 |
| 数据范围 | 增量备份 | 只保存此后变化；MySQL 常用 binlog 实现 |
| 服务状态 | 热备 | 业务运行时备份 |
| 服务状态 | 冷备 | 停库后备份 |
| 恢复目标 | 全量恢复 | 恢复到备份时刻 |
| 恢复目标 | PITR | 全量备份 + binlog 恢复到指定时间点 |

### 5.2 mysqldump 逻辑备份

```bash
mysqldump -h 127.0.0.1 -P 3306 -u backup -p \
  --single-transaction \
  --routines --events --triggers \
  --set-gtid-purged=AUTO \
  --databases course_mall > course_mall_20260911.sql
```

重要参数：

- `--single-transaction`：为 InnoDB 获取一致性快照，避免长时间全局读锁。
- `--routines --events --triggers`：把存储过程、事件和触发器一起备份。
- 不要在命令行直接写密码，避免泄露到历史记录或进程列表。
- `mysqldump` 适合中小库；超大库通常使用物理备份或并行备份工具。

恢复：

```bash
mysql -h 127.0.0.1 -P 3306 -u root -p < course_mall_20260911.sql
```

### 5.3 时间点恢复 PITR

场景：每天 02:00 有全量备份，10:05 误删数据，希望恢复到 10:04:59。

```text
1. 恢复 02:00 的全量备份到隔离实例
2. 确定备份结束时的 binlog 起点
3. 用 mysqlbinlog 回放起点到 10:04:59 的变更
4. 校验数据
5. 按变更流程回迁或切换，不要直接覆盖生产库
```

```bash
mysqlbinlog \
  --start-position=154 \
  --stop-datetime="2026-09-11 10:04:59" \
  binlog.000123 binlog.000124 | mysql -u root -p
```

时间边界可能包含并发事务。更严格的恢复应先用 `mysqlbinlog -vv` 定位 GTID/事件位置，再按位置回放。

### 5.4 备份的验收标准

“文件生成成功”不等于“备份可用”。至少检查：

- 备份文件大小、校验和和保留周期。
- 备份是否包含所需数据库、对象和 binlog/GTID 坐标。
- 定期恢复到隔离环境并执行业务校验。
- 记录 RPO（最多允许丢多少数据）和 RTO（多久恢复服务）。
- 备份与生产实例隔离存储，并控制权限、加密和异地副本。

::: tip 💡 面试题：为什么一定要做恢复演练？
一句话结论：因为备份任务成功只证明文件被写出，不能证明文件完整、步骤正确且能在 RTO 内恢复；只有实际恢复并校验过的备份才可信。
:::

## 6. 主从复制

### 6.1 核心流程

```text
客户端提交事务
    ↓
Source 写 binlog
    ↓  replication receiver thread
Replica 接收并写 relay log
    ↓  replication applier thread(s)
Replica 重放事务并更新自身数据
```

复制默认是异步的：主库提交成功时，从库可能还没收到或应用事务，所以主从复制不等于强一致。

### 6.2 位点复制与 GTID

| 方式 | 如何标识进度 | 特点 |
| --- | --- | --- |
| 文件位点 | `binlog.000123:456789` | 直观，但切主和重新搭建较麻烦 |
| GTID | `server_uuid:transaction_id` | 每个事务全局唯一，可自动定位，推荐 |

GTID 的意义：不是让复制变同步，而是给事务一个稳定身份，减少手工查 binlog 文件和位点的工作，并避免同一 GTID 被重复执行。

```ini
# Source
[mysqld]
server-id=1
log-bin=mysql-bin
binlog_format=ROW
gtid_mode=ON
enforce_gtid_consistency=ON

# Replica
[mysqld]
server-id=2
relay-log=relay-bin
read_only=ON
super_read_only=ON
gtid_mode=ON
enforce_gtid_consistency=ON
```

### 6.3 GTID 复制搭建骨架

先用一致性快照把存量数据导入从库，再配置增量复制。生产环境还要配置 TLS、网络白名单和凭据管理。

```sql
-- Source：只允许指定网段访问，不要使用 root 做复制
CREATE USER 'repl'@'10.0.0.%' IDENTIFIED BY 'replace-with-strong-secret';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'10.0.0.%';

-- Replica
CHANGE REPLICATION SOURCE TO
    SOURCE_HOST = '10.0.0.10',
    SOURCE_PORT = 3306,
    SOURCE_USER = 'repl',
    SOURCE_PASSWORD = 'replace-with-strong-secret',
    SOURCE_AUTO_POSITION = 1,
    GET_SOURCE_PUBLIC_KEY = 1;

START REPLICA;
SHOW REPLICA STATUS\G
```

生产环境优先 TLS，而不是仅依赖 `GET_SOURCE_PUBLIC_KEY`。示例只展示核心配置，不应把真实密码提交到 Git。

### 6.4 如何判断复制是否健康

`SHOW REPLICA STATUS\G` 重点看：

| 字段 | 正常值/意义 |
| --- | --- |
| `Replica_IO_Running` | `Yes`，能从 Source 接收日志 |
| `Replica_SQL_Running` | `Yes`，能应用 relay log |
| `Last_IO_Error` | 最近接收错误，应为空 |
| `Last_SQL_Error` | 最近执行错误，应为空 |
| `Seconds_Behind_Source` | 粗略延迟；`NULL` 通常表示复制线程未正常工作 |
| `Retrieved_Gtid_Set` | 已接收的 GTID |
| `Executed_Gtid_Set` | 已执行的 GTID |

不要只看 `Seconds_Behind_Source=0`。它不是严格的端到端一致性证明，还要看两个线程状态、错误字段和 GTID 集合。

### 6.5 主从延迟

常见原因：

- 主库高并发写入，从库应用速度追不上。
- 大事务一次修改/删除太多行。
- 从库硬件弱、承担大量查询或存在慢 SQL。
- 从库发生锁等待、网络抖动。
- DDL 或单线程依赖限制了并行回放。

处理顺序：

1. 确认接收慢还是应用慢，以及是否有错误。
2. 找大事务、慢 SQL、锁等待和资源瓶颈。
3. 拆分大事务，优化从库查询，合理配置并行复制。
4. 强一致读取走主库；不能把“等待几秒再读”当可靠方案。

### 6.6 复制中断怎么办

不要直接执行“跳过一个事务”。先按错误类型处理：

- 网络/认证错误：修复网络、账号、TLS 和 Source 地址。
- 主键冲突/数据不存在：先查为什么主从数据已不一致，再决定重建还是修复。
- binlog 已被清理：从可靠快照重新搭建 Replica。
- 磁盘满：扩容或安全清理，确认 relay log/binlog 状态后再启动。

盲目跳过事务会把显性错误变成隐性数据不一致。

## 7. 读写分离

```text
                    ┌─ 写、事务、强一致读 ─→ Source
应用 → 路由/代理层 ─┤
                    └─ 可容忍延迟的读 ───→ Replica 1 / Replica 2
```

### 7.1 它解决什么

- 把大量只读查询分摊到多个 Replica。
- 报表、搜索等重查询与主库事务写入隔离。
- Replica 可以作为备份和故障切换基础。

它不能提升主库写能力，也不能天然保证高可用和强一致。

### 7.2 最大问题：读到旧数据

```text
用户创建订单 → Source 提交成功
             → 立即跳转详情页，查询被路由到 Replica
             → Replica 尚未应用该事务，页面显示“订单不存在”
```

常用解决方案：

| 方案 | 适用场景 |
| --- | --- |
| 写后短时间内读主库 | 登录、下单后详情等最常用场景 |
| 同一事务全部走主库 | 事务中的读写 |
| 关键查询固定走主库 | 余额、库存、权限等强一致数据 |
| 等待指定 GTID 已应用 | 对一致性要求高且可接受等待 |
| 接受最终一致 | 商品列表、统计、推荐等 |

### 7.3 路由放在哪里

| 位置 | 示例 | 特点 |
| --- | --- | --- |
| 应用层 | Spring `AbstractRoutingDataSource`、ShardingSphere-JDBC | 灵活，但应用需要感知 |
| 代理层 | ProxySQL、ShardingSphere-Proxy | 多应用统一接入，增加代理运维成本 |
| 数据库集群客户端 | MySQL Router + InnoDB Cluster | 与官方高可用方案配套 |

PDF 中介绍的 MyCat 属于数据库代理中间件，理解其“逻辑库 → 路由 → 物理分片/实例”的思想即可。课程项目优先学习仍在活跃演进且 Java 生态更常见的 Apache ShardingSphere，详见[分库分表](/learn_database/分库分表)。

## 8. 高可用

必须区分三个概念：

| 能力 | 解决的问题 | 是否自动获得 |
| --- | --- | --- |
| 主从复制 | 把数据复制到别的实例 | 是 |
| 故障检测 | 判断主库是否真的不可用 | 否 |
| 自动切换 | 提升新主库并让应用改连 | 否 |

“一主一从”只是有副本，不等于高可用。完整高可用还需要：故障检测、选主/提升、流量切换、脑裂防护、数据一致性检查和回切方案。

常见方案：

| 方案 | 特点 |
| --- | --- |
| 异步复制 + Orchestrator/代理 | 生态成熟、可定制；需要自己设计切换流程 |
| 半同步复制 | 至少等待一个 Replica 收到日志，降低故障时丢数据窗口；不是完全同步 |
| Group Replication | 组成员协同、自动成员管理，是 InnoDB Cluster 的基础 |
| InnoDB Cluster + MySQL Router | 官方完整方案，提供集群管理与连接路由 |

面试回答故障切换时要主动提到两点：

1. 旧主恢复后必须隔离，防止两个主库同时写造成脑裂。
2. 提升前要比较复制进度，优先选择数据最新的 Replica；异步复制下仍可能丢失未同步事务。

## 9. 分库分表运维视角

PDF 的分库分表和 MyCat 内容应掌握这些核心，而不是背大量 XML：

1. 垂直拆分按业务/字段拆；水平拆分按行拆。
2. 分片键决定路由，查询不带分片键可能广播到所有分片。
3. 全局表/广播表适合体积小、更新少、各分片都要 JOIN 的字典数据。
4. 跨分片 JOIN、排序、分页、聚合和事务都会变复杂。
5. 扩容涉及双写、数据迁移、校验、切流和回滚，不只是增加一个节点。
6. 中间件监控至少包括：每个分片连接池、路由结果、执行耗时、失败率和数据倾斜。

具体算法、全局表、ShardingSphere 配置、分布式事务与扩容问题见[分库分表](/learn_database/分库分表)。

## 10. 账号与安全

### 10.1 最小权限

```sql
CREATE USER 'course_app'@'10.0.1.%' IDENTIFIED BY 'replace-with-strong-secret';

GRANT SELECT, INSERT, UPDATE, DELETE
ON course_mall.*
TO 'course_app'@'10.0.1.%';

SHOW GRANTS FOR 'course_app'@'10.0.1.%';
```

- 应用账号不授予 `DROP`、`ALTER`、`GRANT OPTION` 等管理权限。
- 限定来源网段，不使用 `'%'` 暴露到所有主机。
- 禁止应用使用 root。
- 密码放密钥管理/环境变量，不写入源码和镜像。
- 管理连接和跨主机复制优先启用 TLS。

### 10.2 角色

```sql
CREATE ROLE 'course_readonly';
GRANT SELECT ON course_mall.* TO 'course_readonly';
GRANT 'course_readonly' TO 'analyst'@'10.0.2.%';
SET DEFAULT ROLE 'course_readonly' TO 'analyst'@'10.0.2.%';
```

角色用于把一组权限集中管理，避免每个用户重复授权。

## 11. 上线变更清单

### 上线前

- 有备份，并确认恢复步骤可用。
- 在同版本、接近生产数据量的环境执行过。
- 对 SQL 执行 `EXPLAIN ANALYZE`，确认索引和影响行数。
- DDL 评估算法、锁级别、磁盘临时空间和执行时长。
- DML 分批执行，准备回滚 SQL 或补偿方案。
- 确认复制延迟、磁盘余量和监控告警正常。

### 上线中

- 持续观察错误率、RT、CPU、IO、连接数、锁等待和复制延迟。
- 每批检查实际影响行数，异常立即停止后续批次。
- 不在客户端开着未提交事务离开。

### 上线后

- 校验行数、金额等关键业务数据。
- 检查慢 SQL、错误日志和复制状态。
- 保留变更记录和回滚窗口。

## 12. 面试高频速答

1. **MySQL 有哪些运维日志？** 主要有错误日志、binlog、慢查询日志和通用查询日志；redo/undo 是 InnoDB 事务内部日志。
2. **binlog 有什么用？** 记录数据变更，用于复制、增量恢复和 CDC；推荐 ROW 格式。
3. **如何定位线上慢 SQL？** 慢日志找候选，sys/performance_schema 看累计热点，EXPLAIN ANALYZE 定位扫描、回表、排序和估算偏差，修改后回归。
4. **备份为什么要加 binlog？** 全量备份只能恢复到备份时刻，之后的 binlog 可做 PITR，把数据恢复到故障前。
5. **主从复制流程？** Source 写 binlog，Replica 接收后写 relay log，再由 applier 线程重放。
6. **GTID 解决什么？** 用全局事务 ID 标识复制进度，简化搭建、切主和防重复应用；它不消除复制延迟。
7. **如何处理主从延迟？** 定位接收还是应用慢，处理大事务、慢 SQL、锁和资源瓶颈，开启合理并行复制；强一致读走主库。
8. **读写分离最大问题？** 异步复制会让从库短暂读到旧数据，写后读、余额/库存等强一致查询应走主库。
9. **一主一从等于高可用吗？** 不等于，还缺少故障检测、自动切换、路由、脑裂防护和一致性校验。
10. **数据库磁盘满怎么办？** 先定位 binlog、日志、备份、临时文件和表空间，按规范清理/扩容；不能直接删除数据库正在管理的数据文件。

## 13. 官方参考

- [MySQL 8.4：Backup and Recovery](https://dev.mysql.com/doc/refman/8.4/en/backup-and-recovery.html)
- [MySQL 8.4：Replication](https://dev.mysql.com/doc/refman/8.4/en/replication.html)
- [MySQL 8.4：GTID](https://dev.mysql.com/doc/refman/8.4/en/replication-gtids.html)
- [MySQL 8.4：SHOW REPLICA STATUS](https://dev.mysql.com/doc/refman/8.4/en/show-replica-status.html)
- [MySQL 8.4：Performance Schema Lock Tables](https://dev.mysql.com/doc/refman/8.4/en/performance-schema-lock-tables.html)
- [MySQL 8.4：RESET BINARY LOGS AND GTIDS](https://dev.mysql.com/doc/refman/8.4/en/reset-binary-logs-and-gtids.html)
