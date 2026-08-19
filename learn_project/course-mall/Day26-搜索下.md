# Day 26 · 搜索下（Canal 同步 + 深分页优化）

> **今天目标**：把「MySQL → ES」从 Day 25 的手动全量同步升级为 Canal 监听 binlog 的自动增量同步（改库自动进索引），并把搜索分页从 `from+size` 升级为 `search_after` 游标分页——解决深分页翻不动、超 10000 条直接报错的问题。

## 一、前置条件

- 已完成 **Day 25（搜索上）**：`mall-search` 模块已建好（端口 8082），Spring Data Elasticsearch 已接入（ES 8.13 + IK 分词器），`course` 索引已建，搜索/高亮/聚合接口跑通
- 已完成 **Day 02**（`course` 表 + 种子数据）、**Day 06**（`mall-course` 的课程 CRUD 接口）
- MySQL 8.4、JDK 17+、Maven 3.8+（Day 01 已确认）

> ⚠️ 今天复用 Day 02 的 `course` 表 + Day 25 的 `course` 索引，**不新建表、不新建索引、不改 application.yml**（Canal 连接参数先写死在代码常量里，生产再放 Nacos Config）。

## 二、今天完成后你会得到什么

1. MySQL 开启 binlog（ROW 格式）+ 一个 Canal 专用账号
2. Canal Server 跑起来，订阅 `course_mall.course` 表
3. `mall-search` 里的 `CanalSyncService`：MySQL 里**增/改/删/下架课程，ES 自动跟着变**
4. 一个 `search_after` 深分页接口，翻页不再受 `max_result_window=10000` 限制

```
E:\course-mall\
└─ mall-search/                              # Day25 已建，今天在里面加代码
   ├─ pom.xml                                # 改：加 canal.client 依赖
   └─ src/main/java/com/mall/search/
      ├─ sync/CanalSyncService.java          # 新增：Canal 客户端 + 同步逻辑（核心①）
      ├─ vo/SearchPageVO.java                # 新增：带游标的分页返回体
      ├─ service/CourseSearchService.java    # 新增：search_after 深分页查询（核心②）
      └─ controller/CourseSearchController.java  # 新增：深分页接口
```

## 三、先搞懂：两个问题各是什么

### 3.1 为什么需要 Canal？——MySQL 是「源」，ES 是「副本」

Day 25 已把课程导进 ES。但 ES 只是搜索引擎：课程数据都在 MySQL，ES 文档只是「搜索用副本」，两边必须一致，否则用户会搜到下架的课、看到旧价格。

**最朴素的做法是「双写」**：改课程时先写 MySQL 再写 ES。问题：

| 双写的坑 | 具体表现 |
|---|---|
| 一致性问题 | 写 MySQL 成功、写 ES 失败 → 两边不一致，且没有补偿机制 |
| 代码侵入 | 每个改课程的入口（上下架/改价/改名/删除）都要记得同步 ES，漏一处就脏 |
| 顺序问题 | 并发改同一门课，先改的请求可能后到 ES，旧数据覆盖新数据 |

**Canal 的思路是「旁路同步」**：业务代码完全不用改，只写 MySQL。Canal **伪装成 MySQL 的从库（slave）**，用主从复制协议订阅 binlog（记录所有数据变更的日志），解析出每一行的增删改，推给我们的同步程序写 ES。

```
业务代码 ──写──▶ MySQL ──binlog──▶ Canal Server ──推送──▶ CanalSyncService ──写──▶ ES
  (只管写库)          (主从复制协议)        (11111 端口)          (upsert/delete)
```

binlog 有延迟（通常毫秒~秒级），所以 ES 和 MySQL 是**最终一致**，不是强一致——这是 ES 方案必须接受的取舍。

::: tip 💡 面试题：为什么不用「双写」而用 Canal 同步？
**一句话**：双写有两个致命伤——**写 MySQL 成功、写 ES 失败时两边不一致且无法补偿**，以及**每个改数据的入口都要记得同步 ES、漏一处就脏**。Canal 订阅 binlog 旁路同步，业务代码零侵入，MySQL 是唯一数据源，ES 永远可以从 binlog 重放恢复。详见 [MySQL](/learn_database/MySQL)、[分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

::: tip 💡 面试题：Canal 为什么能「实时」拿到 MySQL 的数据变更？它是什么角色？
**一句话**：Canal 模拟主从复制里**从库（slave）的身份**，向 MySQL 发送 `COM_BINLOG_DUMP` 命令，MySQL 就会把 binlog 源源不断推给它——业务代码一行不用改，这就是「伪装成从库，白嫖主从复制协议」。详见 [MySQL](/learn_database/MySQL)。
:::

### 3.2 深分页为什么慢？——`from+size` 的代价

Day 25 的分页是 `from + size`。深分页（用户翻到第 500 页）会出两个问题：

1. **硬限制**：ES 默认 `index.max_result_window = 10000`，`from + size` 超过 10000 直接报错 `Result window is too large`。
2. **性能雪崩**：查询会打到**每个分片**。要拿 `from=10000, size=10`，协调节点必须让每个分片都返回 `from+size = 10010` 条，再把这 `10010 × 分片数` 条在内存里**合并、排序、丢掉前 10000 条**。`from` 越深，每个分片取越多、内存排序越重。

`search_after` 的思路是**放弃「跳页」，只保留「下一页」**：按某个**唯一字段**排序，第一页正常查，返回时带上最后一条的排序值当「游标」；查下一页时把游标传回，ES 直接从「这个游标之后」开始取——**不关心前面有多少条**，翻第 2 页和第 2000 页代价一样。

::: tip 💡 面试题：ES 深分页为什么慢？`from+size` 深翻页时协调节点在干什么？
**一句话**：为了返回这一页，协调节点要先让**每个分片都取 `from+size` 条**，再在内存里合并排序、丢掉前 `from` 条——`from` 越深，每个分片取的越多、内存排序越重；且 `from+size` 超过 `max_result_window`（默认 10000）直接报错。所以直接调大这个参数不是好办法（内存开销依然在）。详见 [Elasticsearch](/learn_backend/java/微服务/Elasticsearch)。
:::

::: tip 💡 面试题：`search_after` 和 `scroll` 有什么区别？各用在什么场景？
**一句话**：`search_after` 是**实时游标**——用上一条的排序值定位下一条，看到的是实时视图，适合用户**翻页**；`scroll` 是**快照**——首次查询时冻结结果集，之后数据变更不影响翻页，适合**全量导出**，但占服务端上下文、不能实时。所以「翻页用 search_after、导出用 scroll」。详见 [Elasticsearch](/learn_backend/java/微服务/Elasticsearch)。
:::

## 四、步骤

### 第一部分：Canal 同步

### 步骤 1：MySQL 开启 binlog（ROW 格式）

找到 MySQL 配置文件：Windows 下是 `C:\ProgramData\MySQL\MySQL Server 8.4\my.ini`（Linux 是 `/etc/my.cnf`），在 `[mysqld]` 段加：

```ini
[mysqld]
# 开启 binlog：主从复制 + Canal 同步的前提，不开就没有「变更日志」
log-bin=mysql-bin
# 必须 ROW 格式：记录「每行数据变更前后的值」，Canal 才能拿到具体字段变化。
# STATEMENT 格式只记 SQL 语句（如 UPDATE course SET view_count = view_count + 1），
# 语句里的 NOW()、view_count+1 运行时才确定，Canal 还原不出最终值
binlog-format=ROW
# 每个 MySQL 实例唯一，不能和 Canal Server 的 slaveId 重复
server-id=1
```

保存后**重启 MySQL 服务**（Windows：`services.msc` 里重启 MySQL 服务，或管理员命令行 `net stop mysql && net start mysql`）。

验证 binlog 已开启：

```sql
SHOW VARIABLES LIKE 'log_bin';        -- 应为 ON
SHOW VARIABLES LIKE 'binlog_format';  -- 应为 ROW
```

::: tip 💡 面试题：Canal 为什么要求 `binlog_format=ROW`？STATEMENT 格式为什么不行？
**一句话**：ROW 格式记录的是**每行数据变更前后的值**（`UPDATE course SET status=0 WHERE id=1` 会记下这行更新前后的完整内容），Canal 解析出来就能同步；STATEMENT 格式只记**SQL 语句本身**，语句里有 `NOW()`、`view_count+1` 这类运行时才确定的值，Canal 无法还原出最终结果。详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 2：为 Canal 建专用账号（只读 + 复制权限）

Canal 用「从库协议」拉 binlog，账号需要 `REPLICATION SLAVE`、`REPLICATION CLIENT` 权限。**不要用 root**（权限过大，也方便排障时区分连接来源）：

```sql
CREATE USER 'canal'@'%' IDENTIFIED BY 'canal';
GRANT SELECT, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'canal'@'%';
FLUSH PRIVILEGES;
```

> ⚠️ MySQL 8.4 默认使用 `caching_sha2_password` 认证。如果 Canal 日志报 `Access denied for user 'canal'`，见步骤 3 的排坑①。

### 步骤 3：下载并启动 Canal Server

- 下载：https://github.com/alibaba/canal/releases ，选 **`canal.deployer-1.1.8.tar.gz`**（deployer 是服务端；admin 是集群管理界面，今天不用）。1.1.8 适配了 MySQL 8.x 认证和 JDK 17，正好匹配本项目环境。
- 解压到本地，比如 `E:\canal\`（Windows 自带 `tar -xzf` 可解压）。

**3.1 改 `E:\canal\conf\example\instance.properties`**（`example` 是默认实例名，一个实例 = 一套「MySQL 源 + 过滤规则」）：

```properties
# Canal Server 自己的 slaveId，不能和 MySQL 的 server-id(1) 重复
canal.instance.mysql.slaveId=1234

# 连接的 MySQL 地址（本机）
canal.instance.master.address=127.0.0.1:3306

# 步骤 2 建的专用账号（Canal 只读 binlog，用最小权限账号）
canal.instance.dbUsername=canal
canal.instance.dbPassword=canal

# 只订阅 course 表。properties 文件里 \\ 会被解析成 \，
# 所以写 \\. 最终正则收到的才是 \.（转义的点号）。
# 不写过滤默认订阅全部表，无关表的 binlog 白白浪费解析性能
canal.instance.filter.regex=course_mall\\.course
```

**3.2 启动 Canal Server**：

```bash
# Windows
E:\canal\bin\startup.bat

# Linux / macOS
sh E:/canal/bin/startup.sh
```

验证：看日志 `E:\canal\logs\example\example.log`，出现 `start successful` 即成功；`E:\canal\logs\canal\canal.log` 无 ERROR 即正常。

> ⚠️ 排坑 ①（MySQL 8.4 认证）：报 `Access denied for user 'canal'` 是认证方式问题，二选一：**方案 A** 保持 canal 1.1.8（已适配新认证，一般不会再报）；**方案 B** 用老版本 canal 1.1.7 时（教程资料常见），需在 `my.ini` 的 `[mysqld]` 加 `mysql_native_password=ON` 重启 MySQL，并把步骤 2 的建账号 SQL 改成 `CREATE USER 'canal'@'%' IDENTIFIED WITH mysql_native_password BY 'canal';`。
>
> ⚠️ 排坑 ②：报 `Could not find first log file name in binary log index` —— 把 `instance.properties` 里 `canal.instance.master.journal.name` 和 `canal.instance.master.position` 两行**注释掉**，让 Canal 自己找最新位置。
>
> ⚠️ 排坑 ③：Canal 要求 Java 8+，本机 JAVA_HOME 指向 JDK 17 即可（startup 脚本会自动用 JAVA_HOME）。

### 步骤 4：`mall-search` 加 canal.client 依赖 + 确认无需改配置

打开 `E:\course-mall\mall-search\pom.xml`，在 `<dependencies>` 里加：

```xml
<!-- Canal 客户端：和 Canal Server 通信（Netty + Protobuf），拉取 binlog 变更事件。
     版本和服务端一致（1.1.8） -->
<dependency>
    <groupId>com.alibaba.otter</groupId>
    <artifactId>canal.client</artifactId>
    <version>1.1.8</version>
    <exclusions>
        <!-- 三个排除都是日志冲突：canal.client 的传递依赖带老版 log4j 1.x /
             slf4j-log4j12 / commons-logging，会和 Spring Boot 的 Logback 打架
             （多个日志绑定告警甚至启动报错） -->
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

**application.yml 今天不用改**：Canal 的连接参数（地址/端口/实例名）写在代码常量里，聚焦同步逻辑；生产环境应放 Nacos Config（Day 14 讲过）统一管理，改配置不用重启。

### 步骤 5：写同步服务 `CanalSyncService`（今天核心①）

**5.1 文档复用 Day 25 的 `CourseDoc`，一行不改。** 三个关键设计回顾：

- `@Document(indexName = "course")` + `@Id private Long id` —— id **复用 MySQL 主键**当 ES 文档 id。这是幂等 upsert 的前提：同一行同步多少次都只会覆盖同一条文档。
- 字段全部已映射（title/description 是 IK 分词的 text，categoryId/teacherId/price/status/viewCount/buyCount 是数值，cover/createTime 是 keyword），今天 `toCourseDoc` 里直接 set 即可。
- `@Id` 只写进 ES 的 `_id` 元数据、**不在 `_source` 里**——这个细节第二部分深分页会用到。

**5.2 新建 `CanalSyncService.java`（`com/mall/search/sync/CanalSyncService.java`）：**

```java
package com.mall.search.sync;

import com.alibaba.otter.canal.client.CanalConnector;
import com.alibaba.otter.canal.client.CanalConnectors;
import com.alibaba.otter.canal.protocol.CanalEntry;
import com.alibaba.otter.canal.protocol.Message;
import com.mall.search.doc.CourseDoc;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.stereotype.Component;

import java.net.InetSocketAddress;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class CanalSyncService {

    // 连接参数今天写死，聚焦同步逻辑；生产环境放 Nacos Config（Day14）统一管理
    private static final String CANAL_HOST = "127.0.0.1";
    private static final int CANAL_PORT = 11111;          // Canal Server 默认 RPC 端口
    private static final String DESTINATION = "example";  // 实例名，对应步骤 3 配置的目录
    // Java 字符串里 \\ 表示一个反斜杠，所以 \\. = 正则 \.（转义的点号）
    private static final String FILTER = "course_mall\\.course";

    private final ElasticsearchOperations esOperations;
    // volatile：stop() 在别的线程置 false，同步线程立刻可见，循环能干净退出
    private volatile boolean running = false;
    private Thread thread;

    public CanalSyncService(ElasticsearchOperations esOperations) {
        this.esOperations = esOperations;
    }

    // @PostConstruct：Bean 装配完成后启动同步线程。
    // 注意用 jakarta.annotation（Spring Boot 3 是 Jakarta EE 9+，javax.annotation 已废弃）
    @PostConstruct
    public void start() {
        thread = new Thread(this::syncLoop, "canal-sync-thread");
        thread.setDaemon(true);   // 守护线程：主进程退出时跟着退出，不会拖住 JVM
        thread.start();
    }

    @PreDestroy
    public void stop() {
        running = false;   // 置位后同步线程下一轮循环退出，连接在 finally 里关闭
    }

    private void syncLoop() {
        // newSingleConnector：连接单机 Canal Server；集群部署用 newClusterConnector
        CanalConnector connector = CanalConnectors.newSingleConnector(
                new InetSocketAddress(CANAL_HOST, CANAL_PORT), DESTINATION, "", "");
        int batchSize = 1000;   // 每批最多拉 1000 条变更，防止单批过大
        try {
            connector.connect();
            connector.subscribe(FILTER);   // 订阅 course_mall.course 的变更（与步骤 3 服务端过滤双保险）
            connector.rollback();          // 回滚到最近一次 ack 的位置：重启应用不重复消费、也不丢
            running = true;
            log.info("Canal 同步线程已启动，监听 {}", FILTER);
            while (running) {
                // getWithoutAck：拉一批但不自动确认。先处理、成功再 ack——
                // 处理中途进程挂了，重启后从上次 ack 的位置重新拉，不丢数据
                Message message = connector.getWithoutAck(batchSize);
                long batchId = message.getId();
                if (batchId == -1 || message.getEntries().isEmpty()) {
                    try {
                        Thread.sleep(1000);   // 没有变更，歇 1 秒再拉，避免空转占 CPU
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();  // 恢复中断标记，退出循环
                        break;
                    }
                    continue;
                }
                handleEntries(message.getEntries());
                connector.ack(batchId);   // 整批处理成功，确认消费（ack 是批量粒度）
            }
        } catch (Exception e) {
            // 同步线程异常不能把整个应用带崩：打日志即可，没 ack 的位置下次还能续上。
            // 生产上这里要包一层 while 重连：Canal/网络抖动后线程会自动退出，需自动恢复
            log.error("Canal 同步异常", e);
        } finally {
            connector.disconnect();
        }
    }

    private void handleEntries(List<CanalEntry.Entry> entries) {
        for (CanalEntry.Entry entry : entries) {
            // binlog 里有事务标记、DDL 等非行数据，今天只关心 ROWDATA（真正的行变更）
            if (entry.getEntryType() != CanalEntry.EntryType.ROWDATA) {
                continue;
            }
            CanalEntry.RowChange rowChange;
            try {
                rowChange = CanalEntry.RowChange.parseFrom(entry.getStoreValue());  // Protobuf 反序列化
            } catch (Exception e) {
                log.error("解析 binlog 失败", e);
                continue;
            }
            CanalEntry.EventType eventType = rowChange.getEventType();
            for (CanalEntry.RowData rowData : rowChange.getRowDatasList()) {
                if (eventType == CanalEntry.EventType.DELETE) {
                    syncDelete(rowData.getBeforeColumnsList());  // 删除：before 里有被删行的主键
                } else {
                    syncUpsert(rowData.getAfterColumnsList());   // INSERT/UPDATE：after 里有最新整行
                }
            }
        }
    }

    private void syncUpsert(List<CanalEntry.Column> columns) {
        Map<String, String> row = toMap(columns);
        String id = row.get("id");
        if (id == null) return;
        // 只有「已上架且未删除」的课程才进索引；下架/逻辑删除的从索引里移除，
        // 保证搜出来的永远是能买的课（下架在 binlog 里也是一条 UPDATE，走到这里）
        if ("1".equals(row.get("status")) && "0".equals(row.get("deleted"))) {
            esOperations.save(toCourseDoc(row));   // save = 幂等 upsert：文档 id 相同则覆盖
            log.info("课程 {} 已同步到 ES", id);
        } else {
            esOperations.delete(id, CourseDoc.class);
            log.info("课程 {} 已下架/删除，从 ES 移除", id);
        }
    }

    private void syncDelete(List<CanalEntry.Column> columns) {
        String id = toMap(columns).get("id");
        if (id == null) return;
        esOperations.delete(id, CourseDoc.class);
        log.info("课程 {} 已物理删除，从 ES 移除", id);
    }

    // Canal 返回的 Column 列表 → Map<列名, 值>：之后按列名取值，不用记位置下标
    private Map<String, String> toMap(List<CanalEntry.Column> columns) {
        Map<String, String> map = new HashMap<>();
        for (CanalEntry.Column column : columns) {
            // 注意：列名是数据库里的原名（下划线风格，如 category_id），值统一是字符串
            map.put(column.getName(), column.getValue());
        }
        return map;
    }

    // MySQL 行 → ES 文档。字段映射：course 表列名 → CourseDoc 属性（Day25 已全部映射）
    private CourseDoc toCourseDoc(Map<String, String> row) {
        CourseDoc doc = new CourseDoc();
        doc.setId(Long.valueOf(row.get("id")));
        doc.setTitle(row.get("title"));
        doc.setDescription(row.get("description"));
        doc.setCover(row.get("cover"));
        doc.setCategoryId(Long.valueOf(row.get("category_id")));
        doc.setTeacherId(Long.valueOf(row.get("teacher_id")));
        doc.setPrice(Double.valueOf(row.get("price")));   // DECIMAL(10,2) → "199.00" → 199.0
        doc.setStatus(Integer.valueOf(row.get("status")));
        doc.setBuyCount(Integer.valueOf(row.get("buy_count")));
        doc.setViewCount(Integer.valueOf(row.get("view_count")));
        // Canal 返回的 datetime 值本身就是 "yyyy-MM-dd HH:mm:ss" 字符串，与 Day25 的格式化格式一致
        doc.setCreateTime(row.get("create_time"));
        return doc;
    }
}
```

::: tip 💡 面试题：`getWithoutAck` + 处理完再 `ack`，这套「手动确认」是为了解决什么？
**一句话**：防止**消费中途失败丢数据**——如果拉一条就自动确认，同步程序在写 ES 前恰好崩溃，这条变更就丢了；改成「先拉、处理成功、再确认」，失败时**不 ack**，重启后从上次确认的位置重新拉。这和 RocketMQ 的消费确认是同一个思路。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

::: tip 💡 面试题：为什么 `save()` 就能做「同步」而不区分新增/更新？幂等性靠什么？
**一句话**：ES 的索引操作（index API）是**幂等 upsert**——`CourseDoc` 的 `@Id` 复用 MySQL 主键，文档 id 相同就覆盖旧文档、不存在就新建。所以 Canal 不用区分 INSERT 和 UPDATE，同一行同步多少遍结果都一样。若让 ES 自动生成 id，同一条数据同步两次就会变成两条重复文档。详见 [Elasticsearch](/learn_backend/java/微服务/Elasticsearch)。
:::

::: tip 💡 面试题：为什么同步线程用 `volatile running` + 守护线程？直接在 `@PostConstruct` 里跑循环会怎样？
**一句话**：`volatile` 保证 `stop()` 在别的线程置 `false` 后，同步线程立刻可见，循环能干净退出；`setDaemon(true)` 让同步线程不阻止 JVM 退出。如果在 `@PostConstruct` 里直接跑同步循环，会**阻塞 Spring Boot 启动流程**，应用永远起不来——所以必须单独起线程。详见 [并发编程](/learn_backend/java/Java核心/并发编程)。
:::

> 💡 进阶（面试加分项）：生产环境一般不用 Canal Client 直连，而是 **Canal Server → RocketMQ → 搜索服务**：Canal 把变更投到 MQ，搜索服务订阅消费。好处是 ① Canal 不用关心下游有几个消费者（搜索、缓存、数仓各订阅一份）；② MQ 自带重试和堆积能力，下游短暂宕机也不丢变更。今天直连是为了把「binlog → 解析 → 写 ES」链路学透，Day 21/22 学完 RocketMQ 后可自行升级。

### 步骤 6：验证 Canal 同步

启动顺序：MySQL（已开 binlog）→ Canal Server（步骤 3）→ ES（Day 25 起的容器）→ mall-search：

```bash
# 在 E:\course-mall\ 根目录
mvn clean install -DskipTests
mvn -pl mall-search spring-boot:run     # 启动搜索服务（端口 8082，和 Day25 一致）
```

看到日志 `Canal 同步线程已启动，监听 course_mall\.course` 即连接成功。

然后**在 MySQL 里改数据**，观察 ES 是否自动跟着变：

```sql
-- ① 改名：把课程 1 的标题改掉
UPDATE course SET title = 'Java 高并发实战（2026 新版）' WHERE id = 1;

-- ② 下架：把课程 2 下架（status=0），应该从 ES 里消失
UPDATE course SET status = 0 WHERE id = 2;

-- ③ 新增：插一门新课，应该自动出现在 ES
INSERT INTO course (teacher_id, category_id, title, price, original_price, status, description)
VALUES (1, 2, 'Canal 实战入门', 49.00, 99.00, 1, '从 binlog 到 ES 同步全流程。');
```

每次改完，用 curl 看 ES 里的实际数据：

```bash
# ① 看课程 1：title 字段应已自动更新
curl "http://localhost:9200/course/_doc/1"

# ② 看课程 2：应该查不到（下架被移除）
curl "http://localhost:9200/course/_doc/2"

# ③ 按标题搜：新课应该能搜到
curl "http://localhost:9200/course/_search?q=title:Canal"
```

预期：①②③ 都和 MySQL 的操作一一对应，**全程没有调用任何接口，只有 MySQL 一条 SQL**——这就是旁路同步的威力。

### 第二部分：深分页优化

### 步骤 7：用 `search_after` 替换 `from+size` 分页

**7.1 新建返回体 `SearchPageVO.java`（`com/mall/search/vo/SearchPageVO.java`）：**

```java
package com.mall.search.vo;

import lombok.Data;

import java.util.List;

// search_after 分页的返回体：和普通分页的区别是——
// 没有「页码/总页数」，多了一个 nextSearchAfter「游标」，前端拿它请求下一页
@Data
public class SearchPageVO<T> {
    private List<T> items;             // 本页数据
    private String nextSearchAfter;    // 下一页游标：本页最后一条的 _id；null 表示没有下一页
    private long total;                // 命中总数（只用于展示「共 x 条」，不参与翻页）
}
```

**7.2 新建 `CourseSearchService.java`（`com/mall/search/service/CourseSearchService.java`）：**

和 Day 25 一样直接用底层 `ElasticsearchClient` 拼 DSL。排序字段直接用 **`_id`**——它是每篇文档的天然唯一键，而且 `@Id` 默认只进 `_id` 元数据、不在 `_source` 里（索引里没有可排序的 `id` 字段），按 `_id` 排序**不需要改 Day 25 的映射、不需要重建索引**：

```java
package com.mall.search.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.FieldValue;
import co.elastic.clients.elasticsearch._types.SortOrder;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.search.doc.CourseDoc;
import com.mall.search.vo.SearchPageVO;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class CourseSearchService {

    private static final String INDEX = "course";
    private static final int MAX_PAGE_SIZE = 50;   // 防 size 传个几千把 ES 打爆

    private final ElasticsearchClient client;

    public CourseSearchService(ElasticsearchClient client) {
        this.client = client;
    }

    // search_after 游标分页。
    // afterId：上一页返回的游标（上一页最后一条的 _id，字符串）；null = 第一页
    public SearchPageVO<CourseDoc> searchAfter(String keyword, String afterId, int size) {
        int pageSize = Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
        try {
            SearchResponse<CourseDoc> response = client.search(s -> {
                s.index(INDEX)
                 // 和 Day25 一样：title 全文匹配关键词
                 .query(q -> q.match(m -> m.field("title").query(keyword)))
                 // 关键①：不用 from，只取 size+1 条——多取 1 条用来判断「还有没有下一页」，
                 // 所以不存在 from+size 超过 max_result_window 的限制
                 .size(pageSize + 1)
                 // 关键②：必须按唯一字段排序。_id 天然唯一，且不用改 Day25 已建好的映射
                 .sort(so -> so.field(f -> f.field("_id").order(SortOrder.Asc)));
                if (afterId != null && !afterId.isBlank()) {
                    // 关键③：游标 = 上一页最后一条的排序值。ES 直接从「_id > afterId」开始取，
                    // 前面有多少条完全不关心——翻第 2 页和第 2000 页代价一样。
                    // 注意 _id 本质是字符串，所以游标用 FieldValue.of(String) 传
                    s.searchAfter(List.of(FieldValue.of(afterId)));
                }
                return s;
            }, CourseDoc.class);

            return toPage(response, pageSize);
        } catch (Exception e) {
            // 复用 Day01 的 BizException + GlobalExceptionHandler，不把堆栈抛给前端
            throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "搜索服务异常: " + e.getMessage());
        }
    }

    private SearchPageVO<CourseDoc> toPage(SearchResponse<CourseDoc> response, int pageSize) {
        List<Hit<CourseDoc>> hits = response.hits().hits();
        SearchPageVO<CourseDoc> page = new SearchPageVO<>();
        page.setTotal(response.hits().total().value());

        boolean hasMore = hits.size() > pageSize;           // 取到了 size+1 条 → 后面还有
        List<Hit<CourseDoc>> current = hasMore ? hits.subList(0, pageSize) : hits;

        List<CourseDoc> items = new ArrayList<>();
        for (Hit<CourseDoc> hit : current) {
            items.add(hit.source());
        }
        page.setItems(items);

        if (hasMore) {
            // 下一页游标 = 本页最后一条的 _id 排序值（_id 是字符串，stringValue() 取）
            page.setNextSearchAfter(current.get(current.size() - 1).sort().get(0).stringValue());
        }
        return page;   // nextSearchAfter = null 表示没有下一页
    }
}
```

**7.3 新建 `CourseSearchController.java`（`com/mall/search/controller/CourseSearchController.java`）：**

```java
package com.mall.search.controller;

import com.mall.common.result.Result;
import com.mall.search.doc.CourseDoc;
import com.mall.search.service.CourseSearchService;
import com.mall.search.vo.SearchPageVO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/search")
public class CourseSearchController {

    private final CourseSearchService searchService;

    public CourseSearchController(CourseSearchService searchService) {
        this.searchService = searchService;
    }

    // 深分页接口：第一页不传 searchAfter，之后把返回的 nextSearchAfter 原样传回。
    // 游标是字符串（ES 的 _id 本质是字符串），全程不要转 Long
    @GetMapping("/course/search-after")
    public Result<SearchPageVO<CourseDoc>> searchAfter(
            @RequestParam String keyword,
            @RequestParam(required = false) String searchAfter,   // 游标：上一页最后一条的 _id
            @RequestParam(defaultValue = "10") int size) {
        return Result.ok(searchService.searchAfter(keyword, searchAfter, size));
    }
}
```

::: tip 💡 面试题：`search_after` 为什么能突破 10000 条限制？代价是什么？
**一句话**：它不用 `from`——ES 利用排序字段直接定位到游标之后的位置，取第 1 页和第 1000 页的代价一样（都只取 `size` 条），所以既快又不受 `max_result_window` 限制。代价是**不能跳页**：只能一页一页往后翻，没有「跳到第 50 页」。常见产品设计：前几页用 `from+size` 支持跳页，深翻页降级为 `search_after`（或只保留「上一页/下一页」）。详见 [Elasticsearch](/learn_backend/java/微服务/Elasticsearch)。
:::

::: tip 💡 面试题：`search_after` 的排序字段为什么必须唯一？为什么今天直接按 `_id` 排序？
**一句话**：排序字段不唯一（比如按 price），相同值的文档顺序不稳定，翻页会**漏数据或重复**。`_id` 天然唯一；而且 Day25 的 `@Id` 默认只写进 `_id` 元数据、不在 `_source` 里，索引里没有可排序的 `id` 字段——按 `_id` 排序就不用改映射、重建索引。生产上也可以给 id 加 `@Field` 注解写进映射后按 `id` 字段排序，效果一样。
:::

::: tip 💡 面试题：`search_after` 还有必要返回 total 吗？
**一句话**：默认 `track_total_hits` 会精确统计到 10000 条、超过后只返回下界（`relation: gte`）。展示「共 x 条」可以保留；如果产品不需要总数（无限流场景），设 `track_total_hits=false` 省掉这步统计，翻页更快。
:::

### 步骤 8：验证 search_after

先保证 `course` 索引里有足够数据翻页（种子课太少，多插几门）：

```sql
INSERT INTO course (teacher_id, category_id, title, price, original_price, status, description) VALUES
(1, 2, 'JVM 调优实战',      129.00, 259.00, 1, 'GC 日志、内存模型一次讲透。'),
(1, 2, 'Spring 源码解读',   169.00, 299.00, 1, 'IOC/AOP 源码级剖析。'),
(2, 5, 'RAG 应用开发',      199.00, 399.00, 1, '向量检索 + 大模型实战。'),
(2, 5, 'Prompt 工程精讲',    79.00, 159.00, 1, '写好提示词的方法论。');
```

> 这几条 INSERT 走的就是今天刚配好的 Canal 同步——**不用手动导数据**，等 1~2 秒后直接搜。

```bash
# 第一页：每页 2 条，不带游标
curl "http://localhost:8082/api/search/course/search-after?keyword=实战&size=2"
# 预期：items 2 条 + nextSearchAfter="4"（本页最后一条的 _id，按 id 升序）

# 第二页：把上一页返回的 nextSearchAfter 原样传回
curl "http://localhost:8082/api/search/course/search-after?keyword=实战&size=2&searchAfter=4"
# 预期：返回剩下的 1 条，nextSearchAfter=null（没有下一页了）
```

预期：两页合起来不重不漏（标题含「实战」的共 3 门：id=1 改名后的课程、id=4「Canal 实战入门」、id=5「JVM 调优实战」）；`nextSearchAfter=null` 就是最后一页。

对比实验（加深理解）：用 Day 25 的 `from+size` 接口深翻，或直接 `curl "http://localhost:9200/course/_search"` 带 `"from":10000,"size":10`，会收到 `Result window is too large` 报错——而 `search_after` 翻多少次都没事。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| 深分页、`search_after`、`max_result_window`、`_id` 排序 | [Elasticsearch](/learn_backend/java/微服务/Elasticsearch) |
| binlog、ROW 格式、主从复制协议、REPLICATION 权限 | [MySQL](/learn_database/MySQL) |
| 旁路同步、最终一致性、双写的一致性问题 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| 手动 ack 防丢消息、Canal → MQ 解耦（进阶） | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| `@PostConstruct`/`@PreDestroy`、Bean 生命周期、jakarta 包名 | [Spring](/learn_backend/java/基础/Spring) |
| 守护线程、`volatile`、后台线程 | [并发编程](/learn_backend/java/Java核心/并发编程) |
| `HashMap` 列名映射 | [Java集合](/learn_backend/java/Java核心/Java集合) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] MySQL 开启 binlog（`SHOW VARIABLES LIKE 'binlog_format'` 返回 ROW）：是 / 否
- [ ] Canal Server 启动成功，`example.log` 出现 `start successful`：是 / 否
- [ ] `mall-search` 启动时打印 `Canal 同步线程已启动`：是 / 否
- [ ] 改 MySQL 课程标题 → ES 里 `/course/_doc/{id}` 自动更新：是 / 否
- [ ] 下架课程（status=0）→ 自动从 ES 移除：是 / 否
- [ ] 新增课程 → 不调任何接口，自动出现在 ES：是 / 否
- [ ] `search-after` 接口连续翻页不重不漏，翻到 `nextSearchAfter=null` 结束：是 / 否
- [ ] 踩坑记录（binlog 没开、Canal 认证失败、日志冲突、游标传错等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. Canal 为什么能实时拿到 MySQL 的数据变更？它伪装成了 MySQL 的什么角色？为什么业务代码一行都不用改？
2. 为什么必须 `binlog_format=ROW`？STATEMENT 格式下 Canal 还能正常工作吗？举一个还原不出数据的例子。
3. 为什么双写（写 MySQL 同时写 ES）不如 Canal 旁路同步？「写 MySQL 成功、写 ES 失败」时两边数据会怎样？Canal 的 `getWithoutAck + ack` 保证了什么？
4. ES 的 `from+size` 深分页为什么慢？取 `from=10000, size=10` 时，每个分片要返回多少条？`max_result_window` 默认是多少？直接调大这个参数为什么不是好办法？
5. `search_after` 的排序字段为什么必须唯一？为什么今天直接按 `_id` 排序、游标用字符串传？`search_after` 和 `scroll` 的区别是什么？
