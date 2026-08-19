# Day 29 · 压测优化（JMeter 压测 + 慢 SQL 定位 + 性能调优）

> **今天目标**：给 course-mall 做一次真正的性能测试——用 JMeter 压 `mall-course` 的课程查询接口，拿到基线 QPS；然后按「压测 → 找瓶颈 → 优化 → 复测」的闭环走一遍：开 MySQL 慢查询日志定位慢 SQL、用 EXPLAIN 分析加索引、调连接池和线程池，最后复测看 QPS 提升。完成后你拥有一份「压测报告」，这会是简历上最有说服力的性能优化素材。

## 一、前置条件

- 已完成 **Day 06 + Day 08**：`mall-course`（8081）有课程查询接口 + Redis 缓存（`/api/course/{id}` 走缓存）
- 已完成 **Day 02**：`course_mall.course` 表有种子数据（今天会给它灌 10 万条模拟数据来暴露慢 SQL）
- 本机 MySQL 8.4 已启动；Redis 已启动
- 下载 **JMeter**（apache-jmeter 官网下载 zip，解压到 `E:\tools\apache-jmeter`；跑 JMeter 需要 JAVA_HOME，用 IDEA 自带的 JBR 即可，或者直接双击 `bin\jmeter.bat` 时它自动探测）

## 二、今天完成后你会得到什么

1. 一份可复用的 JMeter 测试计划（`.jmx` 文件，git 提交它）
2. 一条完整的性能优化闭环：**基线 QPS → 慢 SQL 定位 → 加索引 → 复测 QPS 提升**
3. 一份压测报告（模板见步骤 8），面试讲性能优化时按它讲
4. 会看 EXPLAIN 执行计划——这是 MySQL 面试必考

## 三、步骤

### 步骤 1：先搞懂压测的四个核心指标

面试官问「你压测过吗」，先报指标再讲过程。四个指标必须张口就来：

| 指标 | 含义 | 你该关注的阈值（本地单机参考） |
|---|---|---|
| **QPS**（每秒查询数） | 每秒成功处理的请求数，衡量吞吐 | 越高越好；对比优化前后用 |
| **TPS**（每秒事务数） | 每秒完成的事务数（一次下单可能包含多个请求 = 1 个事务） | 写接口看 TPS，读接口看 QPS |
| **RT**（响应时间） | 从发请求到收响应的耗时，看平均、P95、**P99** | P99 < 200ms 算健康，毛刺看 P99 |
| **错误率** | 失败请求 / 总请求 | 压测中必须为 0 才有意义 |

::: tip 💡 面试题：QPS 和 TPS 有什么区别？
**一句话**：**QPS 是「每秒请求数」，TPS 是「每秒事务数」**——一个事务可能由多个请求组成（比如一次下单 = 扣库存请求 + 创建订单请求 + 发消息），所以 TPS 通常 ≤ QPS。读接口（查课程）两者基本相等，面试时说「我压的接口是纯查询，QPS≈TPS」即可。详见 [并发编程](/learn_backend/java/Java核心/并发编程)。
:::

::: tip 💡 面试题：为什么压测要看 P99 而不是只看平均 RT？
**一句话**：平均 RT 会被大量快请求「平均掉」——100 个请求里 99 个 10ms、1 个 5s，平均才 60ms，看起来很美，但那 1 个慢请求就是用户骂你的原因。**P99 = 99% 的请求都在这个时间以内**，它暴露「最慢的那批请求」有多慢。生产监控（如 SkyWalking 的 P99 曲线）盯的就是它。详见 [并发编程](/learn_backend/java/Java核心/并发编程)。
:::

### 步骤 2：给 course 表灌 10 万条数据（没有数据量，压测就是压空气）

真实系统慢 SQL 全是因为「数据量大了索引没跟上」。先用存储过程灌数据：

```sql
-- 在 course_mall 库执行（为什么用存储过程灌：一条 INSERT 10 万次太慢，批量循环快得多）
-- 为什么造数据要造「分散」的：category_id 取 1~5 随机、价格随机，
-- 模拟真实分布的查询场景（如果全是同一分类，查询选择性太低，索引效果失真）
DELIMITER $$
CREATE PROCEDURE gen_course_data()
BEGIN
    DECLARE i INT DEFAULT 1;
    WHILE i <= 100000 DO
        INSERT INTO course (title, teacher_id, category_id, price, original_price, cover, description, status, deleted, create_time, update_time)
        VALUES (
            CONCAT('测试课程-', i, '-Java进阶'),        -- 标题带序号，方便构造各种查询
            (i % 2) + 1,                                 -- teacher_id 在 1/2 之间循环
            (i % 5) + 1,                                 -- category_id 在 1~5 之间循环
            ROUND(10 + (i % 500) * 0.99, 2),             -- 价格 10~505 随机分布
            ROUND(20 + (i % 500) * 1.99, 2),
            'https://cdn.example.com/cover.jpg',
            '压测用数据',
            1, 0, NOW(), NOW()
        );
        SET i = i + 1;
    END WHILE;
END$$
DELIMITER ;
CALL gen_course_data();
-- 用完删除存储过程，不留垃圾
DROP PROCEDURE gen_course_data;
```

### 步骤 3：做一个最简 JMeter 测试计划

JMeter 没有「写代码」，全是在 GUI 里右键搭组件，跟着点：

1. 双击 `bin\jmeter.bat` 打开 GUI
2. 右键「测试计划」→ Add → Threads → **Thread Group**（线程组 = 虚拟用户）
   - 线程数 `100`（模拟 100 个并发用户）
   - Ramp-up 时间 `10`（10 秒内陆续上线，别一上来全打）
   - 循环次数 `10`（每个线程跑 10 轮 → 总共 1000 个请求，样本量够看）
3. 右键线程组 → Add → Sampler → **HTTP Request**
   - 协议 http，服务器 `localhost`，端口 `8081`，方法 GET，路径 `/api/course/1`
4. 右键线程组 → Add → Listener → **聚合报告**（Aggregate Report）——看结果用
5. 点绿色 ▶ 运行，跑完看聚合报告的列：`Average`（平均 RT）、`99% Line`（P99）、`Throughput`（吞吐量，即 QPS）

记下这组数字：**这是你的基线**。假设类似：Average 15ms、P99 60ms、Throughput 3200/s（走了 Day08 的 Redis 缓存，所以 QPS 不错——缓存的价值这就看到了）。

::: tip 💡 面试题：压测的「并发数」和「QPS」是什么关系？为什么并发数不是越大越好？
**一句话**：并发数（线程数）是「同时在打的人数」，QPS 是「每秒实际完成多少请求」；**QPS = 并发数 ÷ 平均 RT**（利特尔法则）。并发数小时 QPS 上不去（资源闲着），并发数太大时 RT 暴涨、错误率飙升，QPS 反而掉——曲线是一个「先升后平/降」的拐点，压测的目标就是找到这个**拐点（系统容量上限）**。详见 [并发编程](/learn_backend/java/Java核心/并发编程)。
:::

### 步骤 4：命令行压测（可复现，写进报告）

GUI 适合调脚本，正式压测用命令行（不占 GUI 资源、结果存文件、可重复执行）：

```bash
cd /e/tools/apache-jmeter/bin
# 先在 GUI 里把测试计划保存为 course-cache-test.jmx，然后：
# -n 非 GUI 模式  -t 测试计划  -l 结果文件  -e -o 生成 HTML 报告
./jmeter.sh -n -t /e/course-mall/deploy/jmeter/course-cache-test.jmx -l result.jtl -e -o report
```

HTML 报告在 `report/index.html`，有完整的 QPS/RT/P99 曲线图——压测报告直接截图它。

### 步骤 5：压「不走缓存的接口」，暴露慢 SQL

上面的接口走缓存，测不出数据库的瓶颈。改一个**直接查库**的接口压：

新建测试计划 `course-list-test.jmx`，压这个接口（Day06 的课程列表接口，带筛选条件）：

```
GET http://localhost:8081/api/course/list?categoryId=1&page=1&size=10
```

100 并发 × 10 轮跑完，观察：Average 可能飙到 800ms+，Throughput 掉到 300/s 以下。**这就是数据库拖后腿的样子。**

### 步骤 6：开慢查询日志，把慢 SQL 揪出来

```sql
-- 为什么开慢查询日志：性能优化的第一步永远是「先找到是谁慢」，
-- 慢查询日志会记录所有执行时间超过阈值的 SQL，相当于给数据库装了个「行车记录仪」
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 0.1;   -- 超过 0.1 秒就记（默认 10 秒，太宽松抓不到）
-- 日志文件位置（Windows 默认在 datadir 下）：
SHOW VARIABLES LIKE 'slow_query_log_file';
```

重新跑一轮 JMeter 压测，然后打开慢查询日志文件，会看到大量类似：

```sql
# Time: 2026-08-19T22:31:05.123456Z
# Query_time: 0.512345  Lock_time: 0.000012
SELECT id, title, price ... FROM course
WHERE category_id = 1 AND deleted = 0
ORDER BY price DESC
LIMIT 10;
```

`Query_time: 0.51s`——就是它。

::: tip 💡 面试题：线上定位一个接口慢，你的排查步骤是什么？
**一句话**：**自上而下逐层定位**——① 先看链路追踪/监控（SkyWalking 的 P99 曲线）确认是哪个服务、哪个接口慢；② 看应用日志和 JVM（GC 频繁会导致 RT 毛刺）；③ 看数据库：开慢查询日志抓慢 SQL → `EXPLAIN` 看执行计划 → 决定加索引还是改 SQL；④ 再看中间件（Redis 慢日志、MQ 堆积）。面试官要的不是「我知道加索引」，而是**这套排查方法论**。详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 7：EXPLAIN 分析 + 加索引（今天的核心动作）

先看这条 SQL 现在是怎么执行的：

```sql
EXPLAIN SELECT id, title, price FROM course
WHERE category_id = 1 AND deleted = 0
ORDER BY price DESC
LIMIT 10;
```

看结果里最关键的三个字段：

| EXPLAIN 字段 | 现在的值 | 含义 |
|---|---|---|
| `type` | `ALL` | **全表扫描**——10 万行一行行翻，最差的级别 |
| `key` | `NULL` | 没用到任何索引 |
| `rows` | `100000` | 预估要扫 10 万行 |

加一个联合索引（category_id 过滤 + price 排序，正好覆盖这条 SQL）：

```sql
-- 为什么建 (category_id, price) 联合索引：WHERE 里用 category_id 过滤、ORDER BY 用 price 排序，
-- 联合索引按 (category_id, price) 组织数据，过滤完 category_id 后 price 天然有序，
-- 不用再 filesort 排序——「索引本身有序」是联合索引最大的价值
CREATE INDEX idx_category_price ON course(category_id, price);

-- 再加一个逻辑删除过滤用的（deleted 列区分度低，单独建意义不大，但配合联合索引可减少回表——这里先不加，留个思考点）
```

再 EXPLAIN 一次：

| 字段 | 加索引后 | 对比 |
|---|---|---|
| `type` | `ref`（或 `range`） | 走索引，比 ALL 快几个数量级 |
| `key` | `idx_category_price` | 用上了 |
| `rows` | `20000` 左右 | 只扫命中的行 |
| `Extra` | 无 `Using filesort` | 排序直接用索引顺序，省了一次内存排序 |

回 JMeter 重跑 `course-list-test.jmx`：Average 应该从 800ms 降到 50ms 以内，Throughput 翻十几倍。**这就是你压测报告里的核心数据对比。**

::: tip 💡 面试题：EXPLAIN 的 `type` 字段有哪些级别？哪个最好哪个最差？
**一句话**：从好到差：`system > const > eq_ref > ref > range > index > ALL`。`const` 是主键/唯一索引等值查询（最多一行）；`ref` 是非唯一索引等值匹配；`range` 是索引范围扫描；`index` 是「全索引扫描」（比全表稍好一点，但仍是大范围）；**`ALL` 是全表扫描，看到它就要警惕**。面试时至少要能说出这五档。详见 [MySQL](/learn_database/MySQL)。
:::

::: tip 💡 面试题：哪些写法会导致索引失效？
**一句话**：**① 对索引列做函数/运算**（`WHERE YEAR(create_time)=2026`、`WHERE price+1>100`）；**② 隐式类型转换**（字符串列用数字查，如 `WHERE phone=13800138000`）；**③ 前导模糊查询**（`LIKE '%Java'`）；**④ 联合索引不满足最左前缀**（建了 `(a,b)` 却只用 `b` 过滤）；**⑤ OR 连接非索引列**。详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 8：应用层调优清单（连接池 + 线程池）

数据库优化完，瓶颈可能转移到应用层。按顺序检查：

**① 连接池（HikariCP）**——`mall-course` 的 application.yml：

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20        # 为什么不是越大越好：每个连接在 MySQL 侧占内存+线程，
                                   # 池太大 → 数据库连接数耗尽、上下文切换开销大；
                                   # 池太小 → 线程等连接排队，RT 暴涨。
                                   # 经验公式：核数*2 + 磁盘数，压测调优验证
      connection-timeout: 3000     # 等连接超时 3 秒：宁可快速失败也不让用户无限等
      minimum-idle: 5              # 保底空闲连接，避免突发流量时现建连接的延迟
```

**② Tomcat 线程池**——同样在 application.yml：

```yaml
server:
  tomcat:
    threads:
      max: 200        # 默认 200。压测时线程不够 → 请求排队 → RT 涨
    accept-count: 100 # 队列满了之后，新请求直接拒绝（快速失败），防止雪崩
```

**③ Redis 连接池**（如果用 Lettuce）：

```yaml
spring:
  data:
    redis:
      lettuce:
        pool:
          max-active: 16
          max-idle: 8
```

**④ 复测**：改完每项都重跑一轮 JMeter，把数据记进压测报告。

::: tip 💡 面试题：HikariCP 连接池的原理是什么？为什么说它快？
**一句话**：连接池本质是「**复用数据库连接**」——TCP 连接 + MySQL 认证握手很贵（几十毫秒级），池化后请求直接借用一个空闲连接、用完归还。HikariCP 快的三个点：① 无锁并发设计（ConcurrentBag 用 CAS）；② 极致精简（字节码级优化）；③ 连接对象用 `ProxyFactory` 生成轻量代理，不反射。Spring Boot 2+ 默认就是 HikariCP。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

### 步骤 9：写压测报告（简历素材）

`E:\course-mall\deploy\压测报告.md`：

```markdown
# course-mall 课程查询接口压测报告

## 一、压测环境
- 机器：Windows 11 单机（16G 内存 / 8 核）
- 版本：mall-course 0.0.1-SNAPSHOT、MySQL 8.4、Redis 7.2
- 数据量：course 表 10 万行
- 工具：JMeter 5.6（命令行模式，100 并发 × 10 轮 = 1000 样本）

## 二、结果对比

| 接口 | 优化前 QPS | 优化前 P99 | 优化后 QPS | 优化后 P99 | 提升 |
|---|---|---|---|---|---|
| /api/course/1（带缓存） | 3200 | 60ms | — | — | 基线 |
| /api/course/list（查库） | 280 | 1500ms | 2600 | 85ms | QPS 提升约 9 倍 |

## 三、做了什么
1. 慢查询日志定位：WHERE category_id=1 ORDER BY price DESC 全表扫描 10 万行
2. EXPLAIN 确认 type=ALL → 建联合索引 idx_category_price(category_id, price)
3. HikariCP 连接池调优：maximum-pool-size 10 → 20
4. Tomcat 线程池 accept-count 收紧，防止请求堆积

## 四、结论
（一句话总结 + 后续可做的事：分库分表已在 Day24 做过、读写分离可再聊）
```

## 四、知识点索引

| 今天用到/会问到 | 去哪复习 |
|---|---|
| 慢查询日志、EXPLAIN、索引失效、filesort | [MySQL](/learn_database/MySQL) |
| 缓存对 QPS 的价值、穿透/击穿/雪崩 | [Redis](/learn_database/Redis) |
| QPS/TPS、利特尔法则、线程池调优 | [并发编程](/learn_backend/java/Java核心/并发编程) |
| HikariCP、Tomcat 线程池配置 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| 分库分表（量级再大时的出路） | [分库分表](/learn_database/分库分表) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 灌入 10 万条数据：`SELECT COUNT(*) FROM course` = 100003 左右：是 / 否
- [ ] JMeter 压 `/api/course/1`（缓存命中）拿到基线 QPS：`______/s`
- [ ] 压 `/api/course/list` 发现慢 SQL，慢查询日志里看到 `Query_time > 0.1`：是 / 否
- [ ] `EXPLAIN` 优化前 `type=ALL`、优化后 `type=ref/range`：是 / 否
- [ ] 复测 QPS 提升记录：`____/s → ____/s`
- [ ] 压测报告写完并提交 git：是 / 否
- [ ] 踩坑记录（JMeter 启动不了、端口不通、慢查询日志找不到等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 你压 `/api/course/1` 时 QPS 高得离谱（几千），压 `/api/course/list` 却只有几百——**同样的接口，为什么差这么多？**（提示：Redis 单机 10 万 QPS vs MySQL 单机几千 QPS，架构上这说明什么？）
2. 联合索引 `(category_id, price)` 为什么能同时优化 WHERE 和 ORDER BY？如果 SQL 改成 `WHERE category_id=1 AND status=1 ORDER BY create_time DESC`，这个索引还有效吗？（提示：最左前缀 + 索引有序性）
3. 你建索引是在线直接 CREATE 的吗？如果生产库有 1000 万行，直接 CREATE INDEX 会发生什么？生产加索引的正确姿势是什么？（提示：锁表、gh-ost/pt-osc 在线 DDL）
4. 连接池 `maximum-pool-size` 为什么不是越大越好？如果 MySQL 的 `max_connections` 是 100，你 10 个服务每个池子配 50，会发生什么？（提示：连接数打满、报错 Too many connections）
5. 除了加索引和调连接池，接口再往上压，下一步的优化方向还有哪些？（提示：Redis 缓存已用、分库分表 Day24、读写分离、ES 分担读、CDN、MQ 削峰）
