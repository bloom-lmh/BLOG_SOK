# Seata

> 一句话定位：Seata（**S**imple **E**xtensible **A**utonomous **T**ransaction **A**rchitecture）是阿里巴巴开源、后捐献给 Apache 基金会的**分布式事务解决方案**，解决微服务架构下「一个业务操作要跨多个服务、多个数据库，如何保证数据最终一致」的问题，最常用的 AT 模式用「两阶段提交 + 反向补偿（undo_log 回滚日志）」以零业务侵入的方式实现最终一致性。

---

## 基础篇

### 1. 背景：从本地事务到分布式事务

在讲 Seata 之前，必须先把「问题是怎么产生的」讲清楚，否则后面所有机制都会显得没有来由。

#### 1.1 单体应用里的本地事务

单体应用里，一个「下单」操作通常包含几步：插订单、扣库存、扣余额。这些操作全部落在**同一个数据库**里，用一个**本地事务**（ACID）就能保证一致性：

```java
// 单体应用：一个本地事务搞定，要么全成功要么全回滚
@Service
public class OrderService {

    @Transactional   // 本地事务：JDBC 连接上 BEGIN → 多条 SQL → COMMIT / ROLLBACK
    public void createOrder(Order order) {
        orderMapper.insert(order);          // ① 插入订单
        stockMapper.decrease(order.getGoodsId(), 1);  // ② 扣库存
        accountMapper.decrease(order.getUserId(), 100); // ③ 扣余额
        // 任何一步抛异常，前面的操作全部随本地事务回滚
    }
}
```

关键点在于：这三步共享**同一个数据库连接（Connection）**，数据库的本地事务能保证这个连接上的所有操作要么全部提交、要么全部回滚。

#### 1.2 拆成微服务后，本地事务失效了

微服务化之后，「插订单」在订单服务、「扣库存」在库存服务、「扣余额」在账户服务，每个服务有**自己独立的数据库**。此时：

```
单体时代：
  订单 + 库存 + 余额  ── 同一个数据库、同一个连接 ── 一个本地事务管得住

微服务时代：
  订单服务 ── 订单库    （本地事务只能管订单库）
  库存服务 ── 库存库    （本地事务只能管库存库）
  账户服务 ── 账户库    （本地事务只能管账户库）
        ↑ 三个库、三个连接、三个各自独立的事务，谁也管不了谁
```

于是出现经典的「数据不一致」场景：

```
① 订单服务：insert 订单            → 成功提交
② 库存服务：扣减库存                → 成功提交
③ 账户服务：扣减余额                → 失败！余额不足
结果：订单和库存都已经扣了，钱没扣成 —— 数据不一致
```

订单服务成功提交后，它的本地事务已经结束，**无法回滚**；账户服务失败也只能回滚自己，管不到订单和库存。这就是**分布式事务**要解决的问题：**让跨多个服务、多个数据库的一组操作，仍然像单个本地事务一样，要么全部成功、要么全部回滚（至少最终一致）**。

::: tip 💡 面试题：为什么微服务拆开后本地事务就失效了？
一句话结论：因为本地事务绑定的是「单个数据库连接」，而微服务把一次业务操作拆到了多个服务、多个独立的数据库连接上。
一句话原因：本地事务的 ACID 是由数据库在**一个连接**上保证的，跨服务后每个服务各自开一个连接、各自一个事务，数据库层面天然无法跨界协调。所以要引入一个「第三方协调者」在应用层把多个本地事务串成一个全局事务，这正是 Seata 干的事。
:::

### 2. 理论基础：CAP 与 BASE

理解 Seata 各模式为什么这样设计，必须先理解分布式系统的两个基石理论。详细内容见 [分布式基础](/learn_backend/java/微服务/分布式基础)，这里只讲和 Seata 直接相关的部分。

#### 2.1 CAP 定理

分布式系统在网络分区（Partition tolerance）发生时，一致性（Consistency）和可用性（Availability）只能二选一：

| 字母 | 含义 | 通俗解释 |
| --- | --- | --- |
| C（Consistency） | 一致性 | 所有节点同一时刻读到相同数据 |
| A（Availability） | 可用性 | 每个请求都能得到响应（哪怕不是最新数据） |
| P（Partition tolerance） | 分区容错 | 网络断了系统仍能运行 |

网络分区在分布式环境下**无法避免**（P 必须选），所以系统只能在 **CP**（强一致，牺牲可用性）和 **AP**（保证可用，最终一致）之间取舍。

#### 2.2 BASE 理论

CAP 太绝对，工程上退而求其次用 BASE，本质是**对 AP 的落地**：

- **BA（Basically Available）**：基本可用，允许短暂降级。
- **S（Soft State）**：软状态，允许中间状态（各节点数据暂时不同步）。
- **E（Eventually Consistent）**：最终一致性，过一段时间数据最终一致。

#### 2.3 Seata 各模式落在哪里

| 模式 | 一致性取向 | 对应 CAP | 说明 |
| --- | --- | --- | --- |
| AT | 最终一致 | 偏 AP | 一阶段就提交释放锁，靠补偿收敛到一致 |
| TCC | 最终一致 | 偏 AP | 无锁，业务自己保证补偿 |
| Saga | 最终一致 | 偏 AP | 长流程，正向补偿 |
| XA | 强一致 | 偏 CP | 数据库层 2PC，全程锁资源 |

::: tip 💡 面试题：Seata 解决的是 CAP 里的哪个问题？
一句话结论：AT / TCC / Saga 偏向 AP（可用性 + 最终一致），XA 模式偏向 CP（强一致）。
一句话原因：分布式下强一致必然全程锁资源、性能极差，绝大多数互联网业务容忍短暂不一致，所以默认推荐 AT 模式，用「先提交 + 事后补偿」换高并发和低延迟，只在银行转账这类必须强一致的场景才用 XA。
:::

### 3. 分布式事务方案全景：为什么选 Seata

在 Seata 之前，业界已经有多种分布式事务方案，各有优劣，理解它们的痛点才能理解 Seata 的价值。

| 方案 | 一致性 | 性能 | 侵入性 | 典型问题 |
| --- | --- | --- | --- | --- |
| 2PC / XA | 强一致 | 差 | 无 | 全程锁资源、同步阻塞、单点故障 |
| TCC | 最终一致 | 好 | 高 | 业务要写三个方法，空回滚/幂等/悬挂 |
| 本地消息表 | 最终一致 | 好 | 中 | 耦合本地表，各业务各实现 |
| 事务消息（RocketMQ） | 最终一致 | 好 | 中 | 只适合「本地事务 + 发消息」的异步场景 |
| 最大努力通知 | 最终一致 | 好 | 中 | 不保证可靠，需要重试兜底 |
| **Seata（AT 模式）** | 最终一致 | 较好 | **无** | 需要建 undo_log 表、依赖全局锁 |

关键洞察：**TCC 性能好但侵入性强，XA 无侵入但性能差**。Seata 的 AT 模式想同时拿到两边的优点——**业务零侵入（像 XA 一样透明）+ 性能较好（一阶段就提交释放本地锁）**，靠的是「代理数据源自动记录回滚日志 + 全局锁」。

### 4. Seata 的三大角色与整体架构

Seata 借鉴了 XA 的「协调者 + 参与者」思想，定义了三个核心角色：

| 角色 | 全称 | 是谁 | 职责 |
| --- | --- | --- | --- |
| TC | Transaction Coordinator 事务协调者 | Seata Server（独立部署） | 维护全局事务和分支事务状态，驱动全局事务提交或回滚 |
| TM | Transaction Manager 事务管理器 | 业务入口服务 | 定义全局事务范围：开启、提交、回滚全局事务 |
| RM | Resource Manager 资源管理器 | 参与事务的各个服务 | 管理分支事务：注册分支、执行本地事务、上报状态 |

一句话记忆：**TM 负责开启/结束全局事务，RM 负责执行分支事务并向 TC 上报，TC 统一裁决全局提交还是全局回滚。**

三者交互的完整拓扑：

```
        ┌─────────────────────────────────────────────────────┐
        │                  TC（Seata Server）                 │
        │        维护全局事务表 + 分支事务表 + 全局锁表         │
        │           决定：全局提交 or 全局回滚                  │
        └───────────────┬─────────────────────┬───────────────┘
                        │ 注册/上报分支状态     │ 通知二阶段（提交/回滚）
              ┌─────────▼─────────┐   ┌─────────▼─────────┐
              │  TM + RM（入口服务）│   │  RM（参与者服务）    │
              │  开启全局事务，       │   │  执行分支本地事务    │
              │  发起远程调用         │   │  写 undo_log        │
              └─────────────────────┘   └─────────────────────┘
                         │
                         │ 远程调用（XID 透传）
                         ▼
              ┌─────────────────────┐
              │  RM（更多参与者服务）  │
              └─────────────────────┘
```

**XID（全局事务 ID）** 是关键：TM 开启全局事务时生成一个全局唯一的 XID，通过远程调用（如 [OpenFeign](/learn_backend/java/微服务/OpenFeign) 的请求头、Dubbo 的 RpcContext）透传给下游，下游 RM 拿到 XID 才知道自己属于哪个全局事务。

### 5. Seata 的组成与部署架构

Seata 完整体系分两部分：

| 组件 | 说明 | 部署方式 |
| --- | --- | --- |
| Seata Server（TC） | 独立部署的事务协调者，维护事务状态、全局锁 | 单独进程，可集群 |
| Seata Client（TM/RM） | 集成在业务服务里的客户端，自动代理数据源、拦截 SQL | 以 starter 依赖引入 |

生产环境的标准拓扑（TC 高可用 + 注册到 Nacos + 配置存 Nacos）：

```
              ┌────────────┐   ┌────────────┐   ┌────────────┐
              │ Seata-1    │   │ Seata-2    │   │ Seata-3    │   ← TC 集群
              └─────┬──────┘   └─────┬──────┘   └─────┬──────┘
                    └──────────┬─────┴──────────┬─────┘
                               │ 注册到 Nacos     │ 配置从 Nacos 拉取
                     ┌─────────▼─────────────────▼─────────┐
                     │          Nacos（注册 + 配置中心）       │
                     └──────────────────────────────────────┘
                               │
                     ┌─────────▼─────────────────────────┐
                     │   业务服务集群（TM/RM 客户端）        │
                     │  order-service / stock-service ... │
                     └────────────────────────────────────┘
```

> TC 本身也是「无状态 + 状态可持久化」的，全局事务状态默认持久化到 `file`（文件）或 `db`（数据库），所以 TC 可以集群部署，通过 Nacos 做服务发现，客户端任选一个 TC 连接即可。

#### 5.1 下载与启动 TC（单机）

```bash
# 1. 下载 Seata Server（以 1.5+ 为例）
#    https://seata.io/zh-cn/download/seata-server
#    https://github.com/apache/incubator-seata/releases

# 2. 解压后进入目录，启动
#    Linux / Mac
sh bin/seata-server.sh -p 8091 -h 127.0.0.1 -m file
#    Windows
bin\seata-server.bat -p 8091 -h 127.0.0.1 -m file
```

| 启动参数 | 默认值 | 说明 |
| --- | --- | --- |
| `-p, --port` | 8091 | TC 对外服务端口 |
| `-h, --host` | 本机 IP | TC 绑定地址 |
| `-m, --storeMode` | file | 事务状态存储模式：`file` / `db` / `redis` |

#### 5.2 TC 注册到 Nacos（集群/生产必备）

修改 `conf/application.yml`，让 TC 把自身注册到 [Nacos](/learn_backend/java/微服务/Nacos)，客户端才能通过服务发现找到 TC：

```yaml
# conf/application.yml（Seata Server 侧）
seata:
  registry:
    type: nacos                       # 注册中心类型
    nacos:
      application: seata-server       # TC 在 Nacos 里的服务名
      server-addr: 127.0.0.1:8848
      group: DEFAULT_GROUP
      namespace: ""
      username: nacos
      password: nacos
  config:
    type: nacos                       # 配置中心类型（TC 自己的配置也从 Nacos 拉）
    nacos:
      server-addr: 127.0.0.1:8848
      group: SEATA_GROUP
      namespace: ""
      data-id: seataServer.properties
  store:
    mode: db                          # 生产用 db，事务状态持久化，支持 TC 集群
    db:
      datasource: druid
      db-type: mysql
      url: jdbc:mysql://127.0.0.1:3306/seata?useSSL=false&serverTimezone=Asia/Shanghai
      user: root
      password: 123456
```

> 生产环境强烈建议 `store.mode=db`（用 MySQL 存全局事务状态），否则 `file` 模式数据在单机文件里，TC 宕机或集群节点间无法共享状态。

### 6. 快速接入：五分钟跑通一个 AT 分布式事务

以「下单减库存」场景为例，展示 Seata AT 模式的最小闭环。

#### 6.1 引入依赖

```xml
<!-- 订单服务 和 库存服务 都要引入 -->
<dependencies>
    <!-- Seata 客户端（Spring Cloud Alibaba 版） -->
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-seata</artifactId>
    </dependency>
    <!-- 服务发现：让客户端能找到 TC -->
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    </dependency>
</dependencies>
```

#### 6.2 配置文件

```yaml
# application.yml（业务服务侧）
seata:
  registry:
    type: nacos
    nacos:
      server-addr: localhost:8848
      application: seata-server      # 和 TC 注册到 Nacos 的服务名一致
      group: DEFAULT_GROUP
      namespace: ""
  config:
    type: nacos
    nacos:
      server-addr: localhost:8848
      group: SEATA_GROUP
      data-id: seataServer.properties
  tx-service-group: my_test_tx_group  # 事务分组，对应 TC 的 service.vgroupMapping
  service:
    vgroup-mapping:
      my_test_tx_group: default       # 事务分组映射到 TC 集群
```

#### 6.3 建 undo_log 表（每个业务库都要建）

AT 模式的核心依赖，**参与分布式事务的每个数据库都必须建这张表**：

```sql
-- 每个业务库（订单库、库存库）都要执行
CREATE TABLE IF NOT EXISTS `undo_log` (
    `id`            BIGINT(20)   NOT NULL AUTO_INCREMENT,
    `branch_id`     BIGINT(20)   NOT NULL COMMENT '分支事务 id',
    `xid`           VARCHAR(100) NOT NULL COMMENT '全局事务 id',
    `context`       VARCHAR(128) NOT NULL COMMENT '上下文（序列化）',
    `rollback_info` LONGBLOB     NOT NULL COMMENT '回滚日志（before/after 快照）',
    `log_status`    INT(11)      NOT NULL COMMENT '日志状态：0正常 1已回滚',
    `log_created`   DATETIME     NOT NULL COMMENT '创建时间',
    `log_modified`  DATETIME     NOT NULL COMMENT '修改时间',
    `ext`           VARCHAR(100) DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_undo_log` (`xid`, `branch_id`)   -- 一个分支只对应一条回滚日志
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COMMENT ='AT 模式回滚日志表';
```

#### 6.4 业务代码：TM 加 `@GlobalTransactional`

```java
// 订单服务（TM，全局事务的发起方）
@Service
public class OrderServiceImpl {

    @Autowired
    private OrderMapper orderMapper;

    @Autowired
    private StockClient stockClient;   // Feign 客户端，调库存服务

    // 关键：@GlobalTransactional 开启一个全局事务，生成 XID 并透传给下游
    @GlobalTransactional(name = "create-order", rollbackFor = Exception.class, timeoutMills = 30000)
    @Transactional   // 本地事务照常，两个注解配合：本地事务管本库，全局事务管跨库
    public void createOrder(Order order) {
        orderMapper.insert(order);                    // ① 本地：插订单（本地事务）
        stockClient.deduct(order.getGoodsId(), 1);    // ② 远程：扣库存（Feign 调用，XID 透传）
        // 库存服务若抛异常，全局事务回滚，订单也会被反向补偿删掉
    }
}
```

```java
// 库存服务（RM，参与者）
@Service
public class StockServiceImpl {

    @Autowired
    private StockMapper stockMapper;

    @Transactional   // 本地事务，配合 Seata 代理数据源自动记录 undo_log
    public void deduct(Long goodsId, int count) {
        int rows = stockMapper.deduct(goodsId, count);
        if (rows == 0) {
            throw new RuntimeException("库存不足");   // 抛异常 → 通知全局事务回滚
        }
    }
}
```

`@GlobalTransactional` 的常用属性：

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `name` | 空 | 全局事务名称，便于排查 |
| `timeoutMills` | 60000（可配置） | 全局事务超时时间（毫秒），超时自动回滚 |
| `rollbackFor` | 运行时异常默认回滚 | 指定哪些异常触发全局回滚 |
| `noRollbackFor` | 空 | 指定哪些异常不触发回滚 |
| `propagation` | REQUIRED | 事务传播行为 |

### 7. 四种事务模式全景对比

Seata 提供四种事务模式，面试必考，先建立整体认知：

| 维度 | AT | TCC | Saga | XA |
| --- | --- | --- | --- | --- |
| 侵入性 | 无（业务零改动） | 高（写 Try/Confirm/Cancel） | 中（写正向补偿） | 无 |
| 性能 | 中（有全局锁） | 高（无锁） | 高（无锁） | 低（全程锁资源） |
| 一致性 | 最终一致 | 最终一致 | 最终一致 | 强一致 |
| 回滚方式 | undo_log 反向补偿 | Cancel 业务撤销 | 正向补偿（发反向操作） | 数据库 rollback |
| 中间状态可见性 | 短暂可见 | 不可见（预留） | 可见 | 不可见 |
| 适用场景 | 默认首选，绝大多数业务 | 性能敏感核心链路 | 长流程、老系统、外部接口 | 必须强一致的场景 |
| 数据库要求 | 支持本地事务即可 | 支持本地事务即可 | 支持本地事务即可 | 需支持 XA 协议 |

选型决策树：

```
需要分布式事务？
 ├─ 要求强一致（如资金转账，可接受慢） ──────────→ XA
 ├─ 默认场景，不想改业务代码 ────────────────────→ AT
 ├─ 性能极度敏感，愿意改造业务 ──────────────────→ TCC
 └─ 长流程 / 老系统无法改造 / 调外部接口 ────────→ Saga
```

### 8. 基础篇小结

- **问题来源**：微服务把一次业务操作拆到多个服务、多个数据库，本地事务（绑定单个连接）失效，产生数据不一致。
- **理论基础**：CAP（P 必选，C/A 二选一）+ BASE（放弃强一致换最终一致），Seata 的 AT/TCC/Saga 偏 AP，XA 偏 CP。
- **三大角色**：TC（协调者，Seata Server）裁决全局事务；TM（入口服务）开启/结束全局事务；RM（参与者）执行分支事务并上报。
- **核心串联**：TM 生成 XID → 透传给下游 RM → RM 注册分支、执行本地事务并写 undo_log → TC 统一裁决提交或回滚。
- **接入三板斧**：引入 starter 依赖 → 配置 registry/config/tx-service-group → 每个业务库建 `undo_log` 表 + 入口方法加 `@GlobalTransactional`。
- **四种模式**：默认 AT（无侵入 + undo_log 补偿）、TCC（高性能 + 业务补偿）、Saga（长流程 + 正向补偿）、XA（强一致 + 慢）。

---

## 高级篇

### 1. AT 模式深入：一阶段和二阶段到底发生了什么

AT（Automatic Transaction）是 Seata 的默认模式，名字里的 "Automatic" 强调**自动**——业务代码零侵入，回滚日志由框架自动记录、自动补偿。理解 AT 模式，就是理解它的「一阶段」和「二阶段」。

#### 1.1 一阶段：业务 SQL + 回滚日志在同一本地事务提交

一阶段的核心动作，**在每个 RM（参与者）内部**完成：

```
一阶段（RM 内部，一个本地事务）
┌────────────────────────────────────────────────────────────┐
│ ① 注册分支事务：向 TC 注册 branchId，拿到全局锁候选权        │
│ ② 解析 SQL：代理数据源拦截业务 SQL，解析出表名、主键、前后镜像 │
│ ③ 执行业务 SQL：UPDATE 库存 SET 数量 = 数量 - 1（正常执行）  │
│ ④ 写 undo_log：把「改前镜像(beforeImage) + 改后镜像(afterImage)」│
│                序列化后写入 undo_log 表                      │
│ ⑤ 提交本地事务：业务 SQL 和 undo_log 在同一个事务里一起提交    │
│ ⑥ 上报状态：向 TC 上报「分支事务一阶段完成」                  │
└────────────────────────────────────────────────────────────┘
```

关键点：**第 ⑤ 步就提交了本地事务**。这意味着本地锁和数据库连接被立即释放，这就是 AT 性能优于 XA 的根本原因——XA 的一阶段要「执行但不提交」，锁资源要一直憋到二阶段。

#### 1.2 二阶段：全局裁决

所有分支的一阶段都完成后，TM 向 TC 发起全局提交或回滚，TC 再通知各 RM 执行二阶段：

```
二阶段（TC 驱动，各 RM 执行）
  全局提交（所有分支都成功）：
    TC → RM：删除该分支对应的 undo_log 记录（异步、极快）
    ↓ 因为本地事务已经提交了，无需再做什么，删掉回滚日志即可

  全局回滚（任一分支失败）：
    TC → RM：按 undo_log 里的 beforeImage 反向补偿
    ↓ 执行逆向 SQL，把数据改回一阶段之前的样子
```

用一段伪 SQL 直观感受反向补偿：

```sql
-- 一阶段：业务 SQL
UPDATE stock SET count = count - 1 WHERE goods_id = 1001;
-- 此时 count 从 10 变成 9，beforeImage 记录了旧值 10

-- 二阶段回滚：反向补偿（Seata 根据 beforeImage 自动生成）
UPDATE stock SET count = 10 WHERE goods_id = 1001;
-- 把 count 改回旧值 10，数据恢复
```

::: tip 💡 面试题：AT 模式一阶段就提交了，二阶段怎么回滚？
一句话结论：靠一阶段写入 undo_log 的 beforeImage 快照，二阶段执行逆向 SQL 把数据改回原状，而不是传统事务的 rollback。
一句话原因：一阶段已经 commit 了本地事务，数据库层面的 rollback 已经不可能，只能「再执行一条相反的 SQL」把数据改回去。这个「相反的 SQL」不是凭空生成的，而是框架在一阶段通过解析业务 SQL 得到 beforeImage（改前值）后自动构造的，所以业务代码不用写任何补偿逻辑。
:::

### 2. undo_log 表结构与回滚原理（重点）

`undo_log` 表是 AT 模式的灵魂，理解它的字段就理解了回滚的全部原理。

#### 2.1 表结构逐字段解析

```sql
CREATE TABLE IF NOT EXISTS `undo_log` (
    `id`            BIGINT(20)   NOT NULL AUTO_INCREMENT,
    `branch_id`     BIGINT(20)   NOT NULL,          -- 分支事务 id（TC 分配，全局唯一）
    `xid`           VARCHAR(100) NOT NULL,          -- 全局事务 id，定位属于哪个全局事务
    `context`       VARCHAR(128) NOT NULL,          -- 上下文序列化（如事务上下文、恢复元数据）
    `rollback_info` LONGBLOB     NOT NULL,          -- ★核心：before/after 快照序列化后的回滚日志
    `log_status`    INT(11)      NOT NULL,          -- 0=正常(待回滚) 1=已回滚完成
    `log_created`   DATETIME     NOT NULL,          -- 创建时间（用于 TC 超时清理）
    `log_modified`  DATETIME     NOT NULL,          -- 修改时间
    `ext`           VARCHAR(100) DEFAULT NULL,      -- 扩展字段
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_undo_log` (`xid`, `branch_id`)   -- 一个分支只有一条回滚日志
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
```

`rollback_info` 里存的是 **JSON 序列化的 UndoLog 对象**，核心结构：

```json
{
  "branchId": 123456789,
  "xid": "192.168.1.10:8091:2037623145",
  "sqlUndoLogs": [
    {
      "sqlType": "UPDATE",
      "tableName": "stock",
      "beforeImage": {
        "rows": [{"fields": [{"name": "id", "value": 1001}, {"name": "count", "value": 10}]}]
      },
      "afterImage": {
        "rows": [{"fields": [{"name": "id", "value": 1001}, {"name": "count", "value": 9}]}]
      }
    }
  ]
}
```

- **beforeImage（改前镜像）**：记录被修改行的**旧值**，回滚时用它恢复。
- **afterImage（改后镜像）**：记录被修改行的**新值**，用于校验（防止补偿时数据被别的全局事务改了）。

#### 2.2 三种 SQL 类型的镜像记录

| SQL 类型 | beforeImage | afterImage | 回滚方式 |
| --- | --- | --- | --- |
| INSERT | 无（新行） | 新插入行的完整数据 | 回滚 = DELETE 该行（按主键） |
| DELETE | 被删除行的完整数据 | 无（行已删） | 回滚 = INSERT 回原行 |
| UPDATE | 被改行的旧值 | 被改行的新值 | 回滚 = UPDATE 回旧值 |

```java
// 概念示意：框架内部的镜像生成逻辑（真实源码在 SQLRecognizer + Executor 里）
// UPDATE stock SET count = count - 1 WHERE goods_id = 1001
// ① 先 SELECT id, count FROM stock WHERE goods_id = 1001  → 得到 beforeImage（count=10）
// ② 执行业务 UPDATE                                       → count 变成 9
// ③ 再 SELECT id, count FROM stock WHERE goods_id = 1001  → 得到 afterImage（count=9）
// ④ 反向补偿 SQL 由 beforeImage 生成：UPDATE stock SET count = 10 WHERE id = 1001
```

### 3. 全局锁：写隔离与读隔离

AT 模式一阶段就提交了本地事务，此时数据对**其他全局事务已经可见**，可能引发脏写。Seata 用**全局锁（Global Lock）**解决写隔离问题。

#### 3.1 为什么需要全局锁

考虑两个全局事务并发操作同一行数据：

```
时间线：
  全局事务 A：一阶段把 count 从 10 改成 9（本地事务已提交，锁已释放）
  全局事务 B：一阶段把 count 从 9 改成 8（本地事务已提交）
  此时全局事务 A 因为别的原因回滚 → 要把 count 改回 10
  但 count 已经被 B 改成 8 了，A 的补偿会把 B 的修改覆盖掉 → 脏写！
```

问题的根源：**本地锁在一阶段提交时就释放了，两个全局事务能先后改同一行**。解决办法就是引入一层**跨越本地事务生命周期、跟随全局事务生命周期的全局锁**。

#### 3.2 全局锁的获取与释放

```
全局事务 A（改 stock.id=1001 这一行）：
  一阶段：先申请全局锁 lock(stock, 1001) → 拿到锁 → 执行业务 SQL → 提交本地事务
  二阶段（提交或回滚完成后）：释放全局锁 unlock(stock, 1001)

全局事务 B（也要改 stock.id=1001）：
  一阶段：申请全局锁 → 发现被 A 持有 → 重试等待，拿不到就超时回滚
```

全局锁存在 TC 端（内存 + 持久化到 `lock_table` 表），不是数据库锁：

```sql
-- TC 侧的全局锁表（Seata Server 初始化时创建）
CREATE TABLE `lock_table` (
    `row_key`        VARCHAR(128) NOT NULL,  -- 行锁键：表名+主键拼接，唯一标识一行
    `xid`            VARCHAR(128) DEFAULT NULL,
    `transaction_id` BIGINT(20) DEFAULT NULL, -- 全局事务 id
    `branch_id`      BIGINT(20) NOT NULL,     -- 分支事务 id
    `resource_id`    VARCHAR(256) DEFAULT NULL, -- 资源（数据库）标识
    `table_name`     VARCHAR(32) DEFAULT NULL,
    `pk`             VARCHAR(36) DEFAULT NULL,
    `gmt_create`     DATETIME DEFAULT NULL,
    `gmt_modified`   DATETIME DEFAULT NULL,
    PRIMARY KEY (`row_key`),
    KEY `idx_branch_id` (`branch_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
```

#### 3.3 读隔离：读未提交 vs 读已提交

Seata 的读隔离默认是**读未提交**（一阶段提交后数据即可见），可通过两种方式提升到读已提交：

| 方式 | 做法 | 原理 |
| --- | --- | --- |
| `SELECT ... FOR UPDATE` | 业务查询语句加 `FOR UPDATE` | 触发 Seata 申请全局锁，若该行被别的全局事务锁定则等待，保证读到的数据不会再被改 |
| 配置读已提交隔离 | 通过 `SELECT FOR UPDATE` 代理改写 | 框架层面统一处理 |

```java
// 读隔离示例：查询时加 FOR UPDATE，拿到全局锁，避免读到「即将被回滚」的数据
@GlobalTransactional
public void readWithLock(Long goodsId) {
    // 加 FOR UPDATE：Seata 会先申请这行的全局锁再查，拿不到锁就等
    Stock stock = stockMapper.selectForUpdate(goodsId);
}
```

::: tip 💡 面试题：Seata 的全局锁和数据库锁有什么区别？
一句话结论：全局锁是 Seata 在应用层（TC 端）实现的逻辑锁，跟随全局事务的生命周期；数据库锁是数据库引擎实现的物理锁，跟随本地事务的生命周期。
一句话原因：AT 模式一阶段就提交了本地事务，数据库锁随本地事务一起释放了，无法阻止两个全局事务先后改同一行。所以 Seata 额外在 TC 端维护一张 `lock_table`，用「表名 + 主键」做行级锁，锁的生命周期跨越整个全局事务，从一阶段拿到、到二阶段结束才释放，从而保证写隔离。
:::

### 4. AT 模式完整时序图

把一阶段、二阶段、全局锁、undo_log 串起来，看一次「下单减库存」的完整调用链：

```
TM(订单服务)              TC(Seata Server)              RM(库存服务)
    │                           │                            │
    │ 1. begin 开启全局事务       │                            │
    │ 生成 XID 并绑定当前线程      │                            │
    │──────────────────────────>│                            │
    │                           │                            │
    │ 2. 本地事务:insert 订单     │                            │
    │    + 写 undo_log          │                            │
    │    (分支一阶段)            │                            │
    │──────────────────────────>│ 注册分支 branchId           │
    │                           │                            │
    │ 3. Feign 调用，XID 透传 ────────────────────────────────>│
    │                           │                            │
    │                           │<────── 注册分支 branchId ───│
    │                           │                            │
    │                           │  4. 申请全局锁 lock(stock,1001)│
    │                           │<────────────────────────────│
    │                           │  (拿到锁)                    │
    │                           │                            │
    │                           │  5. 本地事务:扣库存 + undo_log │
    │                           │  6. 上报一阶段完成            │
    │                           │<────────────────────────────│
    │                           │                            │
    │ 7. commit / rollback(XID) │                            │
    │──────────────────────────>│  8. 通知分支二阶段            │
    │                           │────────────────────────────>│
    │                           │  (提交:删undo_log 或 回滚:反向补偿)│
    │                           │  9. 释放全局锁                │
    │                           │<────────────────────────────│
    │                           │                            │
    │ 10. 全局事务结束           │                            │
```

::: warning 关键理解
AT 模式的二阶段「提交」只是**异步删除 undo_log**，非常快，因为数据一阶段已经提交了；「回滚」才是重头戏，要按 beforeImage 反向补偿。所以 AT 模式「读多写少、提交多回滚少」的业务里性能很好。
:::

### 5. TCC 模式详解

TCC（Try-Confirm-Cancel）把业务拆成三个方法，**补偿逻辑由业务方自己实现**，无全局锁、无 undo_log，性能最好，但侵入性最强。

#### 5.1 三阶段职责

| 阶段 | 时机 | 作用 | 举例（扣库存） |
| --- | --- | --- | --- |
| Try | 一阶段 | 预留资源、做校验，不真正执行业务 | 冻结库存（available -1，frozen +1） |
| Confirm | 二阶段成功 | 确认提交，真正执行业务 | 真正扣减冻结（frozen -1） |
| Cancel | 二阶段失败 | 撤销预留，释放资源 | 释放冻结（frozen -1，available +1） |

```java
// TCC 接口：一个「扣库存」要写三个方法
public interface StockTcc {

    // Try：冻结库存（预留），此时还没真正扣
    @TwoPhaseBusinessAction(name = "deductStock", commitMethod = "confirm", rollbackMethod = "cancel")
    boolean tryDeduct(@BusinessActionContextParameter(paramName = "goodsId") Long goodsId,
                      @BusinessActionContextParameter(paramName = "count") int count);

    // Confirm：全局事务成功，真正扣减冻结的库存
    boolean confirmDeduct(BusinessActionContext context);

    // Cancel：全局事务失败，释放冻结的库存
    boolean cancelDeduct(BusinessActionContext context);
}
```

#### 5.2 TCC 的三大异常问题（面试必考）

TCC 因为「Try 先执行、Confirm/Cancel 后执行」，在分布式环境下会碰到三个经典问题：

| 问题 | 场景 | 危害 | 解决思路 |
| --- | --- | --- | --- |
| 空回滚 | Try 未执行（或未成功），Cancel 却执行了 | 错误地释放了本不存在的预留 | Cancel 前判断 Try 是否执行过，没执行过直接返回 |
| 幂等 | Confirm/Cancel 因网络重试被执行多次 | 重复扣减/重复释放 | 用事务控制表 + 状态字段去重，同一分支只生效一次 |
| 悬挂 | Cancel 先于 Try 执行（超时后 Cancel 到了，Try 才到） | 资源被错误取消，之后 Try 又预留导致数据错乱 | 记录 Try 状态，Cancel 发现 Try 未执行则「空回滚」并标记，晚到的 Try 直接拒绝 |

```sql
-- TCC 控制表（业务库）：每个分支的 TCC 状态都要落表，用于幂等/空回滚/悬挂
CREATE TABLE tcc_fence_log (
    xid        VARCHAR(128) NOT NULL,  -- 全局事务 id
    branch_id  BIGINT(20)   NOT NULL,  -- 分支事务 id
    action_name VARCHAR(64) NOT NULL,  -- TCC 动作名
    status     TINYINT(4)   NOT NULL,  -- 状态：1=Tried 2=Committed 3=Rollbacked 4=Suspended
    PRIMARY KEY (xid, branch_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
```

> Seata 提供了 **TCC Fence（TCC 防悬挂）** 组件，通过 AOP 自动维护这张控制表，业务方只需加 `@TwoPhaseBusinessAction`，就能自动防悬挂、幂等、空回滚，省去手写控制逻辑。

::: tip 💡 面试题：TCC 的空回滚、幂等、悬挂分别是什么？怎么解决？
一句话结论：空回滚是「Try 没执行 Cancel 却执行」；幂等是「Confirm/Cancel 被重复执行」；悬挂是「Cancel 先于 Try 执行」。
一句话原因：三者都源于分布式下网络超时和重试导致的「乱序 + 重复」。解决上统一靠「分支事务控制表 + 状态机」：Cancel 发现 Try 没执行就空回滚并标记悬挂，晚到的 Try 被拒绝；Confirm/Cancel 靠状态字段保证只生效一次。
:::

### 6. Saga 模式详解

Saga 是**一阶段直接提交，二阶段用「正向补偿」修正**的模式，没有 Try 阶段，也没有 undo_log。

```
Saga 流程：
  服务1 执行 A（提交） → 服务2 执行 B（提交） → 服务3 执行 C（失败）
  回滚：执行 C 的补偿 C' → 执行 B 的补偿 B' → 执行 A 的补偿 A'
  （补偿是「再发一个反向业务操作」，不是回滚数据库）
```

| 特点 | 说明 |
| --- | --- |
| 一阶段提交 | 每个参与者直接提交本地事务，无预留、无锁 |
| 补偿方式 | 为每个正向操作写一个反向补偿操作，失败时逆序执行补偿 |
| 中间状态可见 | 一阶段提交后中间状态对外可见（这是它的固有特性，非缺陷） |
| 适用场景 | 长流程（无法用短事务）、调老系统/外部接口（无法改造）、不能加 undo_log 的场景 |
| 缺点 | 补偿逻辑要业务自己写；中间状态可见，需业务容忍 |

Seata 的 Saga 支持**状态机 DSL**（用 JSON/YML 定义状态流转和补偿），也支持**注解方式**（类似 TCC）：

```java
// Saga 注解方式：定义正向方法和补偿方法
@SagaTransactional  // 标记参与 Saga 事务
public interface StockSaga {
    // 正向操作：真正扣库存
    void deduct(Long goodsId, int count);
    // 补偿操作：加回库存
    void compensateDeduct(Long goodsId, int count);
}
```

### 7. XA 模式详解

XA 是**数据库层的标准 2PC**，事务由数据库自己控制，实现强一致。

```
XA 两阶段提交：
  一阶段（prepare）：协调者让每个数据库执行 SQL 但不提交，数据库锁资源等待
  二阶段（commit/rollback）：全部 prepare 成功 → 全部 commit；有失败 → 全部 rollback
```

| 维度 | XA | AT |
| --- | --- | --- |
| 事务控制 | 数据库自己控制（原生 2PC） | Seata 应用层控制 |
| 一阶段 | 执行 SQL 但**不提交**，锁资源 | 执行 SQL **并提交**，写 undo_log |
| 二阶段提交 | 数据库 commit | 删 undo_log |
| 二阶段回滚 | 数据库 rollback | 按 undo_log 反向补偿 |
| 锁持有时间 | 长（一阶段到二阶段全程锁） | 短（一阶段提交即释放本地锁） |
| 性能 | 差 | 好 |
| 一致性 | 强一致 | 最终一致 |

```yaml
# 使用 XA 模式：在业务方法上指定数据源代理为 XA
seata:
  data-source-proxy-mode: XA   # 全局切换代理模式为 XA
```

### 8. Seata 客户端配置项速查

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `seata.registry.type` | 无 | 注册中心类型（nacos/eureka/zk/file...） |
| `seata.config.type` | 无 | 配置中心类型（nacos/file...） |
| `seata.tx-service-group` | 无 | 事务分组名，映射到 TC 集群 |
| `seata.service.vgroup-mapping.<group>` | default | 事务分组 → TC 集群的映射 |
| `seata.data-source-proxy-mode` | AT | 数据源代理模式：AT / XA |
| `seata.client.rm.report-success-enable` | true | 一阶段成功后是否上报（改为 false 可提升性能） |
| `seata.client.rm.lock.retry-interval` | 10ms | 全局锁重试间隔 |
| `seata.client.rm.lock.retry-times` | 30 | 全局锁重试次数 |
| `seata.client.rm.lock.retry-policy-branch-rollback-on-conflict` | true | 锁冲突是否回滚分支 |
| `seata.client.tm.commit-retry-count` | 5 | 提交重试次数 |
| `seata.client.tm.rollback-retry-count` | 5 | 回滚重试次数 |

### 9. 与 Spring Cloud 生态的整合

Seata 在 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) 体系中负责「分布式事务」这一环，依赖 [Nacos](/learn_backend/java/微服务/Nacos) 做 TC 的服务发现和配置：

```
                     ┌──────────────────────────┐
                     │   Gateway（网关，入口）      │
                     └────────────┬─────────────┘
                                  │
                     ┌────────────▼─────────────┐
                     │   OpenFeign（远程调用）     │ ← XID 通过请求头透传
                     └────────────┬─────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
     ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
     │    Nacos     │       │  Sentinel   │       │    Seata    │
     │ 注册+配置中心  │       │ 限流熔断     │       │ 分布式事务   │
     └─────────────┘       └─────────────┘       └─────────────┘
```

- [OpenFeign](/learn_backend/java/微服务/OpenFeign)：全局事务 XID 通过 Feign 请求头 `TX_XID` 透传给下游。
- [Sentinel](/learn_backend/java/微服务/Sentinel)：限流熔断可防止事务链路因慢调用雪崩。
- [Nacos](/learn_backend/java/微服务/Nacos)：TC 注册到 Nacos，客户端通过服务发现连 TC，配置也存 Nacos。
- [RocketMQ](/learn_backend/java/微服务/RocketMQ)：事务消息是 Seata 之外的另一种最终一致方案，两者可配合。

### 10. 生产环境最佳实践与常见坑

#### 10.1 常见坑

| 坑 | 现象 | 原因与解决 |
| --- | --- | --- |
| 忘记建 undo_log 表 | 一启动就报 `undo_log 表不存在` | 每个参与事务的业务库都要建 undo_log 表 |
| 表没有主键 | 回滚时报「主键缺失」 | AT 模式要求每张表必须有主键，回滚靠主键定位行 |
| XID 线程污染 | 两个请求的事务串台 | ThreadLocal 未清理，请求结束必须 `unbind()` |
| 异步线程丢 XID | 异步操作不在全局事务内 | ThreadLocal 不传子线程，需手动 bind |
| 全局锁死锁 | 两个全局事务互相等锁超时回滚 | 保证加锁顺序一致，避免交叉锁 |
| 大事务超时 | 长事务被强制回滚 | 合理设置 `timeoutMills`，拆分大事务 |
| 二阶段补偿覆盖他人修改 | 数据被错误改回 | 补偿前 Seata 会校验 afterImage，不一致则抛异常提示人工介入 |

#### 10.2 最佳实践

1. **事务边界要小**：`@GlobalTransactional` 方法内只做「必要的最小业务」，不要塞耗时操作（发邮件、调慢接口），否则全局锁持有时间长、易超时。
2. **下游异常要往上抛**：RM 里的业务异常必须抛出（不要吞掉），否则 TC 不知道分支失败，会错误地全局提交。
3. **幂等兜底**：AT 模式二阶段补偿本身有校验，但业务层仍建议做好幂等（如唯一索引），防止极端重试导致重复。
4. **读多写少场景才高效**：AT 模式适合「提交多、回滚少」的业务；如果频繁回滚，反向补偿开销大，考虑 TCC。
5. **监控 undo_log 膨胀**：undo_log 在提交后会被异步删除，但要定期清理「孤儿 undo_log」（TC 挂了残留的），可配 `undo_log 删除任务`。
6. **TC 高可用**：生产用 `store.mode=db` + TC 集群 + Nacos 注册，避免 TC 单点故障导致全局事务无法协调。

### 11. 高级篇小结

- **AT 一阶段**：业务 SQL + undo_log 在**同一本地事务提交**，释放本地锁；**二阶段**：提交则删 undo_log（快），回滚则按 beforeImage 反向补偿（重）。
- **undo_log 核心**：`rollback_info` 存 beforeImage（旧值，用于回滚）+ afterImage（新值，用于校验）；INSERT/DELETE/UPDATE 三种 SQL 镜像不同。
- **全局锁**：存在 TC 端 `lock_table`，用「表名+主键」做行锁，生命周期跨越全局事务，解决一阶段提交后的脏写。
- **读隔离**：默认读未提交，用 `SELECT ... FOR UPDATE` 提升到读已提交。
- **TCC**：Try/Confirm/Cancel 三方法，业务自补偿，无锁高性能但侵入强，三大问题是空回滚/幂等/悬挂。
- **Saga**：一阶段提交 + 正向补偿，适合长流程、老系统、外部接口。
- **XA**：数据库原生 2PC，强一致但全程锁资源性能差。

---

## 原理篇

### 1. AT 模式「无侵入」的秘密：代理数据源

AT 模式最神奇的地方在于：业务代码一行不改，却能做到自动记录回滚日志、自动反向补偿。这个「无侵入」的秘密藏在**代理数据源（DataSourceProxy）** 里。

#### 1.1 普通数据源 vs 代理数据源

```java
// 普通 Spring Boot 数据源：直接拿 java.sql.Connection 执行 SQL
//  Seata 通过 DataSourceProxy 把真实数据源包了一层
//
//  业务代码 -> DataSource.getConnection()
//                   ↓（被 Seata 替换）
//            DataSourceProxy.getConnection()
//                   ↓
//            ConnectionProxy（包装了真实 Connection）
//                   ↓ 拦截所有 SQL 执行
//            解析 SQL -> 记录前后镜像 -> 执行 -> 写 undo_log
```

```java
// Seata 核心类关系（源码结构示意）
public class DataSourceProxy extends AbstractDataSourceProxy {

    // 业务每次拿连接，实际返回的是被包装的 ConnectionProxy
    @Override
    public Connection getConnection() {
        return new ConnectionProxy(dataSource.getConnection());
    }
}

public class ConnectionProxy extends AbstractConnectionProxy {

    // 拦截 PreparedStatement 的创建，为后续 SQL 解析埋点
    @Override
    public PreparedStatement prepareStatement(String sql) {
        // 把真实 PreparedStatement 包装成 PreparedStatementProxy
        return new PreparedStatementProxy(this, targetPreparedStatement, sql);
    }
}
```

#### 1.2 一次 UPDATE 的完整拦截链路

```
业务代码：stockMapper.deduct(goodsId, 1)
   │
   ▼
ConnectionProxy.prepareStatement("UPDATE stock SET count = count - 1 WHERE goods_id = ?")
   │
   ▼
PreparedStatementProxy.execute()   ← 在这里拦截 SQL 执行
   │
   ▼
SQLRecognizerFactory：识别 SQL 类型（UPDATE/INSERT/DELETE）、表名、条件
   │
   ▼
BaseTransactionalExecutor（UpdateExecutor）：
   ① 执行前置查询 → 得到 beforeImage
   ② 执行业务 SQL
   ③ 执行后置查询 → 得到 afterImage
   ④ 构造 TableRecords 快照，序列化写入 undo_log
   │
   ▼
执行完成，返回业务结果
```

关键结论：**业务代码感知不到任何拦截**，因为 Seata 是在 JDBC 这一层（`Connection` / `PreparedStatement`）做代理，而 MyBatis/JPA 等 ORM 框架最终都要落到 JDBC 上，所以「包一层 JDBC」就能无侵入地覆盖所有数据库访问。

### 2. SQL 解析与镜像生成机制

反向补偿能正确执行的前提，是 Seata 能**从业务 SQL 里解析出足够信息**（表名、主键、改动值），并生成前后镜像。

#### 2.1 SQLRecognizer 的类型识别

Seata 用 `SQLRecognizerFactory` 根据 SQL 类型创建对应的识别器：

| SQL 类型 | 识别器 | 镜像策略 |
| --- | --- | --- |
| INSERT | InsertRecognizer | 只记 afterImage（新行），回滚 = DELETE |
| DELETE | DeleteRecognizer | 只记 beforeImage（被删行），回滚 = INSERT |
| UPDATE | UpdateRecognizer | 记 beforeImage + afterImage，回滚 = UPDATE |
| SELECT ... FOR UPDATE | SelectForUpdateRecognizer | 触发全局锁申请，不记镜像 |

#### 2.2 镜像生成的完整 SQL 流程（以 UPDATE 为例）

```sql
-- 业务 SQL：
UPDATE stock SET count = count - 1 WHERE goods_id = 1001 AND count > 0;

-- Seata 自动生成的前置查询（拿 beforeImage）：
-- 用「主键 + 唯一键」定位行，避免全表扫描
SELECT id, count FROM stock WHERE goods_id = 1001 AND count > 0 FOR UPDATE;
--  ↑ FOR UPDATE 是为了在本地事务内锁住这些行，防止并发读到中间态

-- 执行业务 SQL
UPDATE stock SET count = count - 1 WHERE goods_id = 1001 AND count > 0;

-- Seata 自动生成的后置查询（拿 afterImage）：
SELECT id, count FROM stock WHERE goods_id = 1001 AND count > 0;

-- 二阶段回滚时，根据 beforeImage 生成逆向 SQL：
UPDATE stock SET count = 10 WHERE id = 1001;
```

#### 2.3 TableRecords（表记录快照）的内存结构

Seata 把一张表的改动抽象成 `TableRecords`，内部是一行行的 `Row`，每个 `Row` 由若干 `Field` 组成：

```
TableRecords（表级快照）
 └─ TableMeta：表元数据（表名、主键名、字段列表）
     └─ Rows：被修改的行集合
         └─ Row：一行
             └─ Fields：字段集合
                 ├─ Field{ name:"id",    value:1001, keyType: PRIMARY_KEY }
                 └─ Field{ name:"count", value:10,   keyType: NULL }
```

其中 `Field.keyType` 标记字段类型（主键/普通字段），回滚时 Seata **只用主键字段定位行**，用其余字段恢复值——这就是为什么 AT 模式**要求每张表必须有主键**。

::: tip 💡 面试题：为什么 Seata AT 模式要求业务表必须有主键？
一句话结论：因为回滚时要用「主键」唯一定位被修改的行，执行 `UPDATE ... WHERE 主键 = ?` 恢复旧值。
一句话原因：beforeImage 里记录的字段值里，只有主键能保证全局唯一地定位到那一行；没有主键，Seata 无法生成精确的逆向 SQL，可能改错行或漏改，导致补偿失败。
:::

### 3. 全局锁的实现原理（深入）

全局锁不只是「一张表」，它背后有一套完整的申请、冲突处理、释放机制。

#### 3.1 行锁的 row_key 生成规则

```
row_key = resourceId + "^^^" + tableName + "^^^" + primaryKeyValue
示例：jdbc:mysql://127.0.0.1:3306/demo^^^stock^^^1001
      └──────── resourceId ────────┘  └table┘ └pk┘
```

锁的粒度是**行级**（表名 + 主键值），不同全局事务改不同行互不阻塞，改同一行才冲突。

#### 3.2 锁冲突的处理流程

```
RM 申请全局锁 lock(stock, 1001)
   │
   ▼
TC 检查 lock_table 里是否有相同的 row_key
   │
   ├─ 无冲突 → 插入锁记录，返回成功
   │
   └─ 有冲突（别的全局事务持有）→ 锁冲突
        │
        ▼
     按重试策略处理：
       ├─ 默认：每 10ms 重试一次，最多 30 次（约 300ms）
       ├─ 重试期间锁释放 → 拿到锁，继续
       └─ 重试超时 → 回滚当前分支，抛 LockConflictException
```

```yaml
# 全局锁重试相关配置
seata:
  client:
    rm:
      lock:
        retry-interval: 10      # 重试间隔（毫秒）
        retry-times: 30         # 重试次数
        retry-policy-branch-rollback-on-conflict: true  # 锁冲突超时是否回滚分支
```

#### 3.3 释放时机

| 时机 | 动作 |
| --- | --- |
| 全局提交完成 | 各分支释放自己的全局锁（TC 删除 lock_table 记录） |
| 全局回滚完成 | 各分支反向补偿后释放全局锁 |
| 全局事务超时 | TC 强制回滚并释放全局锁 |
| 分支异常 | 该分支释放自己的全局锁 |

### 4. 全局事务状态机与完整流程

TC 端维护全局事务的状态，整个生命周期是一个状态机：

```
                    TM:begin
                        │
                        ▼
                 ┌─────────────┐
                 │   BEGIN     │  ← 全局事务开启，生成 XID
                 └──────┬──────┘
                        │ 分支陆续注册、上报一阶段完成
                        ▼
                 ┌─────────────┐
                 │ COMMITTING  │  ← TM 发起 commit，进入提交中
                 └──────┬──────┘        │
                        │               │ TM 发起 rollback
                        │               ▼
                        │        ┌─────────────┐
                        │        │ ROLLBACKING │ ← 进入回滚中
                        │        └──────┬──────┘
                        │               │
                 ┌──────▼──────┐  ┌──────▼──────┐
                 │  COMMITTED  │  │ ROLLBACKED  │  ← 终态
                 └─────────────┘  └─────────────┘

（另有 TIMEOUT_ROLLBACKING / TIMEOUT_ROLLBACKED 处理超时回滚）
```

状态流转规则：

1. `BEGIN`：TM 调用 `begin` 后进入，等待分支注册。
2. `COMMITTING`：TM 调用 `commit` 后进入，TC 开始通知各分支删 undo_log。
3. `ROLLBACKING`：TM 调用 `rollback`（或任一分支失败、或超时）后进入，TC 通知各分支反向补偿。
4. `COMMITTED` / `ROLLBACKED`：终态，全局锁全部释放。

```java
// 源码结构示意：TC 端核心流程（DefaultCore / DefaultCoordinator）
public class DefaultCoordinator implements TransactionCoordinator {

    // 处理 TM 的全局事务请求
    public GlobalBeginResponse doGlobalBegin(...) { /* 生成 XID，登记全局事务 */ }
    public GlobalCommitResponse doGlobalCommit(...) { /* 标记 COMMITTING，异步通知分支删 undo_log */ }
    public GlobalRollbackResponse doGlobalRollback(...) { /* 标记 ROLLBACKING，通知分支反向补偿 */ }

    // 处理 RM 的分支事务请求
    public BranchRegisterResponse doBranchRegister(...) { /* 注册分支，返回 branchId */ }
    public BranchReportResponse doBranchReport(...) { /* 记录分支一阶段结果 */ }
}
```

### 5. AT 模式的隔离性深入：为什么是「读已提交」而非「可重复读」

Seata AT 模式官方给出的隔离级别是**读已提交（Read Committed）**。理解它的隔离能力边界，是面试的加分点。

#### 5.1 能防什么、不能防什么

| 并发问题 | AT 模式能否防止 | 手段 |
| --- | --- | --- |
| 脏写（两个全局事务改同一行） | 能 | 全局锁 |
| 脏读（读到别的事务未提交数据） | 部分 | 一阶段已提交，读未提交数据是设计使然 |
| 不可重复读 | 不能完全防 | 数据可能被并发全局事务修改 |
| 幻读 | 不能完全防 | 锁是行级，范围查询可能被插入新行 |

#### 5.2 为什么做不到「可重复读」

```
可重复读要求：同一事务内两次读同一行，结果一致。
AT 模式下：
  全局事务 A 一阶段提交后，全局事务 B 可以拿锁改这行并提交。
  全局事务 A 二阶段若再读这行，会读到 B 改后的值 → 不可重复读。
```

因为 AT 模式为了性能，一阶段就提交、只锁「行」，不做「多版本并发控制（MVCC）」，所以无法提供可重复读。这也是它和数据库隔离级别的本质区别——数据库靠 MVCC + 行锁，Seata 靠全局行锁。

### 6. TCC 三问题的原理剖析（深入）

第 5 节讲了「是什么」，这里下钻到「为什么会发生」和「状态机怎么解」。

#### 6.1 空回滚

```
场景：全局事务超时，TC 发起 Cancel
  但 RM 的 Try 请求因为网络延迟还在路上（尚未执行）
  Cancel 先到达 RM，此时 Try 根本没执行过
  → RM 执行 Cancel 会「释放一个本不存在的预留」，这就是空回滚
```

解决：RM 执行 Cancel 时查 `tcc_fence_log`，发现没有 `status=1(Tried)` 的记录，说明 Try 未执行，**直接空返回**，不做任何业务。

#### 6.2 悬挂

```
场景：空回滚的后续 —— Cancel 先执行（空回滚返回了），随后 Try 才到达
  RM 此时执行 Try，预留了资源
  但全局事务早已回滚，这个预留永远不会被 Confirm 或 Cancel
  → 资源被永久「挂」在那里，成为悬挂
```

解决：空回滚时把状态记为 `status=4(Suspended)`，晚到的 Try 看到 Suspended 状态，**直接拒绝执行**。

#### 6.3 幂等

```
场景：Confirm/Cancel 执行成功，但响应丢失，TC 超时重试
  Confirm/Cancel 被执行第二次
  → 重复扣减/重复释放，数据错乱
```

解决：Confirm/Cancel 执行前查状态，若已是 `Committed/Rollbacked` 则**直接返回**，保证只生效一次。

状态机汇总：

```
                  Try 到达
                      │
        ┌─────────────┼──────────────┐
        │             │              │
   status 无        status=4      status=1
   （首次）       （悬挂，拒绝）   （已 Try，幂等拒绝）
        │
        ▼
   执行 Try → status=1 (Tried)
        │
   ┌────┴────┐
 Confirm    Cancel
   │          │
   ▼          ▼
status=2    status=3
(Committed) (Rollbacked)
```

### 7. XA / AT / TCC 的本质差异（机制级对比）

三种模式本质是「把补偿职责放在哪里」的区别：

| 维度 | XA | AT | TCC |
| --- | --- | --- | --- |
| 补偿逻辑在哪 | 数据库（原生 2PC） | 框架（undo_log 自动补偿） | 业务（手写 Confirm/Cancel） |
| 一阶段是否提交 | 不提交（prepare） | 提交（写 undo_log） | 预留（Try） |
| 锁 | 数据库锁（全程持有） | 全局锁（行级） | 无锁（业务预留） |
| 回滚依据 | 数据库事务日志 | undo_log 快照 | 业务 Cancel 方法 |
| 一致性 | 强一致 | 最终一致 | 最终一致 |
| 隔离性 | 数据库隔离级别 | 读已提交 | 业务隔离 |

一句话记忆：**XA 把一致性交给数据库（强但慢），AT 把补偿交给框架（无侵入但最终一致），TCC 把补偿交给业务（快但侵入强）。**

### 8. Seata 源码模块结构

面试问到「Seata 源码结构」时，能画出模块图就是加分项：

```
seata
├─ server（TC 服务端）
│   ├─ server          # TC 启动、RPC 通信
│   ├─ core           # 核心事务逻辑：DefaultCoordinator、DefaultCore
│   ├─ store          # 状态持久化：file / db / redis
│   ├─ config         # 配置加载
│   └─ registry       # 注册中心接入：nacos / eureka / zk
├─ rm（资源管理器）
│   ├─ rm-datasource  # ★AT 模式核心：DataSourceProxy、undo_log 管理
│   └─ rm             # 分支事务管理
├─ tm（事务管理器）    # 全局事务开启/提交/回滚
├─ core（公共核心）    # 事务模型、异常、上下文
├─ spring             # Spring 集成
├─ spring-boot-starter
└─ spring-cloud-starter
```

AT 模式核心类速查：

| 类 | 职责 |
| --- | --- |
| `GlobalTransactionScanner` | 扫描 `@GlobalTransactional`，生成 AOP 代理 |
| `DataSourceProxy` | 代理数据源，返回 ConnectionProxy |
| `ConnectionProxy` / `PreparedStatementProxy` | 拦截 SQL 执行 |
| `SQLRecognizerFactory` | SQL 类型识别 |
| `BaseTransactionalExecutor` | 执行器基类：镜像生成、undo_log 写入 |
| `UndoLogManager` | undo_log 的插入、查询、删除、回滚 |
| `GlobalLockTemplate` | 全局锁模板（SELECT FOR UPDATE 用） |
| `DefaultCoordinator` | TC 端事务协调核心 |

### 9. XID 传播机制（事务上下文透传）

全局事务能跨服务串起来，关键在于 **XID（全局事务 ID）** 如何从一个服务传到另一个服务。理解这个机制，才能回答「Seata 怎么知道下游服务属于哪个全局事务」。

#### 9.1 XID 的生成与格式

TM 调用 `begin` 时，TC 生成一个全局唯一的 XID：

```
XID 格式：ip:port:transactionId
示例：192.168.1.10:8091:2037623145
      └─── TC 地址 ───┘ └──全局事务序号┘
```

#### 9.2 XID 的绑定与透传

```
入口服务（TM）
  ① @GlobalTransactional 拦截器调用 begin → 拿到 XID
  ② 把 XID 绑定到当前线程的 ThreadLocal（RootContext）
  ③ 业务代码里发起 Feign/Dubbo 远程调用
  ④ 拦截器把 XID 塞进请求头（Feign 的 TX_XID / Dubbo 的 RpcContext attachment）

下游服务（RM）
  ⑤ 过滤器/拦截器从请求头取出 XID
  ⑥ 把 XID 绑定到自己线程的 RootContext
  ⑦ 执行本地事务时，Seata 代理数据源发现 RootContext 有 XID → 注册分支、写 undo_log
  ⑧ 请求结束后清理 ThreadLocal，防止线程复用导致 XID 污染
```

#### 9.3 为什么用 ThreadLocal 而不是参数传递

| 方式 | 问题 |
| --- | --- |
| 显式参数传递 | 业务方法签名全要加 XID 参数，侵入性强，违背「零侵入」目标 |
| ThreadLocal | 线程上下文天然隔离，Seata 在拦截器层自动绑定/清理，业务无感知 |

但 ThreadLocal 有个坑：**线程复用会导致 XID 泄漏**。所以 Seata 必须在请求结束时（finally 块）`RootContext.unbind()`，否则线程池复用线程时，下一个请求会错误地继承上一个请求的 XID，造成事务串台。

```java
// 源码结构示意：RootContext 的绑定与清理
public class RootContext {
    private static final ThreadLocal<String> CONTEXT_HOLDER = new ThreadLocal<>();

    public static void bind(String xid) { CONTEXT_HOLDER.set(xid); }
    public static String getXID() { return CONTEXT_HOLDER.get(); }
    public static void unbind() { CONTEXT_HOLDER.remove(); }  // 必须 finally 清理
}
```

#### 9.4 异步线程的 XID 丢失问题

如果用线程池或 `@Async` 开新线程执行事务操作，ThreadLocal 不会自动传递到子线程，导致新线程拿不到 XID，Seata 认为它不属于任何全局事务，分支事务无法关联：

```
场景：TM 线程拿到 XID → 丢给线程池异步执行扣库存
  → 异步线程的 ThreadLocal 是空的 → 拿不到 XID → 扣库存不在全局事务内
```

解决：显式传递 XID，或用 Seata 提供的 `Runnable` 包装器：

```java
// 方式一：手动把 XID 带过去
String xid = RootContext.getXID();
executor.execute(() -> {
    RootContext.bind(xid);          // 子线程重新绑定
    try {
        stockMapper.deduct(goodsId, 1);
    } finally {
        RootContext.unbind();        // 用完清理
    }
});

// 方式二：用 Seata 提供的包装器（内部自动传播 XID）
// TccRunnable / SagaRunnable 等，或自定义实现
```

::: tip 💡 面试题：Seata 的 XID 是怎么在服务间传播的？
一句话结论：XID 绑定在 ThreadLocal（RootContext）里，通过远程调用框架的请求头（Feign 的 TX_XID、Dubbo 的 attachment）透传，下游拦截器取出后重新绑定。
一句话原因：用 ThreadLocal 才能做到业务零侵入——XID 的绑定和清理都在拦截器层完成，业务代码无感知。但要注意两个坑：一是请求结束必须 finally 清理，防止线程池复用导致 XID 串台；二是异步/新线程场景 ThreadLocal 不会自动传递，需要手动重新绑定。
:::

### 10. 原理篇小结

- **无侵入的秘密**：Seata 在 JDBC 层（`DataSourceProxy` / `ConnectionProxy`）做代理，ORM 最终都走 JDBC，所以包一层就能覆盖所有访问。
- **回滚依据**：SQL 解析（`SQLRecognizer`）→ 前后镜像（`TableRecords`/beforeImage/afterImage）→ 序列化进 `undo_log` → 回滚时按 beforeImage 生成逆向 SQL。
- **全局锁原理**：TC 端 `lock_table`，row_key = 资源 + 表名 + 主键，行级锁，生命周期跨越全局事务。
- **状态机**：BEGIN → COMMITTING/ROLLBACKING → COMMITTED/ROLLBACKED。
- **隔离级别**：读已提交（行级全局锁，无 MVCC）。
- **TCC 三问题**：空回滚/悬挂/幂等，统一靠「分支控制表 + 状态机」解决。
- **模式本质**：补偿职责放数据库（XA）/框架（AT）/业务（TCC）的区别。

---

## 面试常问

1. **Seata 的三大角色分别是什么？**
   结论：TC 协调者裁决全局事务，TM 管理器开启/结束全局事务，RM 资源管理器执行分支事务并上报。展开：TM 生成 XID 并透传，RM 拿到 XID 注册分支、执行本地事务写 undo_log，TC 汇总各分支状态后统一决定全局提交还是回滚。

2. **AT 模式的回滚原理？**
   结论：一阶段提交本地事务并写 undo_log 快照，二阶段失败时按 beforeImage 执行逆向 SQL 反向补偿。展开：一阶段已 commit 无法走传统 rollback，只能「再执行相反的 SQL」；这个逆向 SQL 是框架解析业务 SQL、记录改前镜像后自动生成的，所以业务零侵入。

3. **AT 模式和 TCC 模式的区别？**
   结论：AT 无侵入靠 undo_log 自动补偿、性能中等；TCC 业务自己写 Try/Confirm/Cancel、无锁性能高但侵入强。展开：AT 有全局锁可能锁冲突，TCC 无锁但有空回滚/幂等/悬挂三个问题；默认用 AT，性能敏感核心链路用 TCC。

4. **全局锁的作用和原理？**
   结论：防止两个全局事务同时改同一行数据造成脏写。展开：AT 一阶段就提交释放了本地锁，必须引入跟随全局事务生命周期的全局锁；全局锁存在 TC 端 lock_table，row_key = 表名 + 主键，行级粒度，冲突则重试等待、超时回滚。

5. **Seata 四种模式怎么选型？**
   结论：默认 AT，性能敏感核心链路用 TCC，长流程/老系统/外部接口用 Saga，必须强一致用 XA。展开：AT 零侵入覆盖绝大多数业务；TCC 无锁但改造大；Saga 无 Try 无 undo_log 适合无法改造的场景；XA 强一致但全程锁资源性能最差。

6. **Seata 为什么能做到业务零侵入？**
   结论：靠代理数据源在 JDBC 层拦截 SQL。展开：DataSourceProxy 包装真实数据源，ConnectionProxy/PreparedStatementProxy 拦截 SQL 执行，SQLRecognizer 解析类型、Executor 生成前后镜像写 undo_log；MyBatis/JPA 最终都走 JDBC，所以包一层就能全覆盖。

7. **TCC 的空回滚、悬挂、幂等是什么？**
   结论：空回滚是 Try 没执行 Cancel 却执行；悬挂是 Cancel 先于 Try 执行；幂等是 Confirm/Cancel 被重复执行。展开：三者源于分布式网络超时/重试导致的乱序与重复，统一靠分支控制表 + 状态机解决，Seata 的 TCC Fence 组件可自动防悬挂。

8. **Seata AT 模式是什么隔离级别？**
   结论：读已提交，不是可重复读。展开：AT 一阶段就提交、只做行级全局锁、无 MVCC，所以只能防脏写、防部分脏读，无法保证可重复读和幻读；这是它用性能换最终一致的必然结果。

相关阅读：[分布式基础](/learn_backend/java/微服务/分布式基础) · [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) · [Nacos](/learn_backend/java/微服务/Nacos) · [OpenFeign](/learn_backend/java/微服务/OpenFeign) · [Sentinel](/learn_backend/java/微服务/Sentinel) · [RocketMQ](/learn_backend/java/微服务/RocketMQ) · [Spring Boot](/learn_backend/java/基础/Spring Boot) · [MySQL](/learn_database/MySQL) · [并发编程](/learn_backend/java/Java核心/并发编程) · [JVM](/learn_backend/java/Java核心/JVM)

