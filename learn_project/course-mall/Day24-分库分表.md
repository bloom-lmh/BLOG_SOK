# Day 24 · 分库分表（雪花 ID + ShardingSphere）

> **今天目标**：给订单表做水平分表改造——用**雪花算法**生成全局唯一的订单 ID（替代分表后会撞车的自增 ID），用 **ShardingSphere-JDBC** 把 `orders` 按 `user_id` 拆成 4 张物理表，跑通「下单自动路由到某张分表 + 按用户查订单只查对应分表」。

## 一、前置条件

- 已完成 **Day 01**（`mall-common` 里有 `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`）
- 已完成 **Day 02**（`course_mall` 库、`orders` 表已建好——今天按它的结构拆 4 张分表，**不另建新业务表**）
- 已完成 **Day 06**（MyBatis-Plus：`BaseMapper`、`@TableId`、`@TableLogic`、逻辑删除配置）
- 已完成 **Day 10**（`mall-order` 订单服务已存在，端口 8082——今天是**改造它**，不是新建模块）
- 已完成 **Day 11**（`course` 表有 `stock` 库存，下单流程要扣库存，验证前确认 `stock > 0`）
- MySQL 已启动，能连上 `course_mall` 库

## 二、今天完成后你会得到什么（改动点全景）

```
E:\course-mall\
├─ mall-common/src/main/java/com/mall/common/id/
│  └─ SnowflakeIdGenerator.java          # 新增：雪花算法（公共模块，全项目复用）
├─ mall-order/                           # Day 10 已有，今天只改 7 个文件
│  ├─ pom.xml                            # 改：加 ShardingSphere 依赖
│  └─ src/main/
│     ├─ java/com/mall/order/
│     │  ├─ config/IdConfig.java         # 新增：注册雪花 ID 生成器 Bean
│     │  ├─ entity/Order.java            # 改：@TableId(AUTO) → @TableId(INPUT)
│     │  ├─ mapper/OrderMapper.java      # 改：加 selectByUserId（带分片键的查询）
│     │  ├─ service/OrderService.java    # 改：下单改用雪花 ID，新增按用户查订单
│     │  └─ controller/OrderController.java  # 改：加「我的订单」查询接口
│     └─ resources/application.yml       # 改：spring.datasource → spring.shardingsphere
└─ sql/sharding_orders.sql               # 新增：4 张分表建表 SQL
```

## 三、先搞懂：为什么要分表 + 为什么自增 ID 会失效

**问题一：单表撑不住。** 订单这种表会无限增长，几千万、上亿行之后，即使索引做得好，B+ 树也会越来越深，单表读写、DDL（加字段）、备份都越来越慢。**水平分表**就是把一张大表按某个字段拆成 N 张结构相同的小表，把数据「摊开」。

**问题二：分表后，自增主键会撞车。** Day 02 的 `orders` 用 `AUTO_INCREMENT`。一旦拆成 `orders_0`、`orders_1`、`orders_2`、`orders_3` 四张表，每张表都有自己的自增序列——`orders_0` 里能长出一个 `id=1`，`orders_1` 里也能长出一个 `id=1`。**主键在全局范围内不再唯一**。

::: tip 💡 面试题：分库分表后为什么不能用数据库自增主键？
**一句话**：自增主键是「单表内唯一」，拆成多张表后每张表各自从 1 开始增长，**跨表必然重复**；分库后多个库的自增更是完全独立、无法协调。所以必须换成**应用侧生成的分布式 ID**（雪花算法等），在写库之前就把全局唯一的 id 定好。详见 [分库分表](/learn_database/分库分表)。
:::

**解决方案：雪花算法（Snowflake）。** Twitter 提出的分布式 ID 方案，用**一个 64 位的 long** 编码「时间 + 机器 + 序号」：

```
64 位 long 的结构（从高位到低位）：
┌─┬───────────────────────┬────────────┬────────────┬────────────────┐
│0│     41 位时间戳(毫秒)    │ 5位数据中心 │  5位机器ID  │  12位序列号     │
└─┴───────────────────────┴────────────┴────────────┴────────────────┘
 符号位(恒0)     时间戳                     机器标识        同一毫秒内的序号
```

- **符号位恒 0**：保证生成的 ID 是正数，能塞进 `BIGINT`（有符号 64 位）。
- **41 位时间戳**：不是从 1970 开始，而是从自定义「起始时间」开始算，省出高位、用更久（约 69 年）。
- **5+5 位机器标识**：数据中心 + 机器 ID，保证不同机器生成的 ID 不冲突（各 0~31）。
- **12 位序列号**：同一台机器同一毫秒内最多 4096 个，再多就等下一毫秒。

::: tip 💡 面试题：雪花算法为什么能「全局唯一」？它是不是有序的？
**一句话**：唯一性靠「机器标识不同 + 同毫秒序列号递增」双保险；有序性体现在**时间戳在高位**，同一台机器生成的 ID 是**趋势递增**（不是严格连续）——这对 InnoDB 主键友好，插入时基本是顺序写，减少页分裂。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

## 四、步骤

### 步骤 1：在 `mall-common` 写雪花算法 `SnowflakeIdGenerator`

放公共模块是为了全项目复用（订单、用户、秒杀订单以后都要用）。路径 `E:\course-mall\mall-common\src\main\java\com\mall\common\id\SnowflakeIdGenerator.java`：

```java
package com.mall.common.id;

// 雪花算法：生成全局唯一的 64 位分布式 ID。纯 Java 实现，不依赖任何框架。
public class SnowflakeIdGenerator {

    // 起始时间戳：2024-01-01 00:00:00 的毫秒值。
    // 为什么不用 1970？41 位时间戳从 1970 算只能用 69 年，从 2024 算能撑到 2093 年，
    // 等于把「已经过去的 54 年」省下来，给 ID 多留了容量。
    private static final long START_TIMESTAMP = 1704067200000L;

    // 各段占用的位数（经典配置：1 + 41 + 5 + 5 + 12 = 64）
    private static final long DATACENTER_ID_BITS = 5L;   // 数据中心：0~31
    private static final long WORKER_ID_BITS = 5L;       // 机器：0~31
    private static final long SEQUENCE_BITS = 12L;       // 序列号：同毫秒 0~4095

    // 各段最大值（用位运算算出来，比手写 31、4095 不易错）
    private static final long MAX_DATACENTER_ID = ~(-1L << DATACENTER_ID_BITS);   // 31
    private static final long MAX_WORKER_ID = ~(-1L << WORKER_ID_BITS);           // 31
    private static final long SEQUENCE_MASK = ~(-1L << SEQUENCE_BITS);            // 4095

    // 各段在 64 位里的「起始位置」（低位段靠右，位移少）
    private static final long WORKER_ID_SHIFT = SEQUENCE_BITS;                          // 12
    private static final long DATACENTER_ID_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS;     // 17
    private static final long TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS + DATACENTER_ID_BITS; // 22

    private final long datacenterId;
    private final long workerId;
    private long sequence = 0L;        // 当前毫秒内的序列号，跨毫秒归 0
    private long lastTimestamp = -1L;  // 上一次生成 ID 的时间戳，判断「同毫秒」还是「新毫秒」

    public SnowflakeIdGenerator(long workerId, long datacenterId) {
        // 参数越界会破坏唯一性（两个实例拿到同一个 workerId），必须在校验期拦住
        if (workerId < 0 || workerId > MAX_WORKER_ID) {
            throw new IllegalArgumentException("workerId 必须在 [0, 31] 之间");
        }
        if (datacenterId < 0 || datacenterId > MAX_DATACENTER_ID) {
            throw new IllegalArgumentException("datacenterId 必须在 [0, 31] 之间");
        }
        this.workerId = workerId;
        this.datacenterId = datacenterId;
    }

    // synchronized：保证 sequence / lastTimestamp 在多线程下不产生竞态。
    // ID 生成极快（纳秒级），锁竞争可忽略；比 CAS 自旋简单直观。
    public synchronized long nextId() {
        long timestamp = System.currentTimeMillis();

        // 时钟回拨检测：当前时间 < 上次时间，说明机器时钟被人往回拨了，
        // 继续生成会导致「时间戳倒退 → ID 可能重复」，这里直接抛错（生产可改为等待重试）
        if (timestamp < lastTimestamp) {
            throw new RuntimeException("时钟回拨，拒绝生成 ID，请检查服务器时间");
        }

        if (timestamp == lastTimestamp) {
            // 同一毫秒：序列号 +1，与掩码做与运算（相当于对 4096 取模）
            sequence = (sequence + 1) & SEQUENCE_MASK;
            if (sequence == 0) {
                // 同一毫秒的 4096 个号用完了，自旋等到下一毫秒
                while (timestamp <= lastTimestamp) {
                    timestamp = System.currentTimeMillis();
                }
            }
        } else {
            // 新的一毫秒：序列号从头开始
            sequence = 0L;
        }

        lastTimestamp = timestamp;

        // 三段「左移到位」后用 | 拼到一起（每段互不重叠，| 等价于相加）
        return ((timestamp - START_TIMESTAMP) << TIMESTAMP_SHIFT)
                | (datacenterId << DATACENTER_ID_SHIFT)
                | (workerId << WORKER_ID_SHIFT)
                | sequence;
    }
}
```

::: tip 💡 面试题：雪花算法最大的坑是什么？「时钟回拨」为什么危险？
**一句话**：雪花 ID 的递增性依赖机器时钟单调递增；时钟被往回拨（NTP 校时、人工改时间、虚拟机时钟漂移）后，新 ID 的时间戳比旧的还小，**可能生成出和过去重复的 ID**。常见对策：① 检测到回拨直接拒绝/抛错（上面代码）；② 回拨幅度小就「等」到追平；③ 用美团 Leaf 等方案把时间戳持久化，重启也能续上。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

### 步骤 2：父 pom + `mall-order` pom 加 ShardingSphere 依赖

**① 父工程 `E:\course-mall\pom.xml`**：`mall-order` 模块 Day 10 已注册过，`<modules>` 不用动，只加版本管理和依赖管理：

```xml
<properties>
    <java.version>17</java.version>
    <mybatis-plus.version>3.5.7</mybatis-plus.version>
    <!-- ShardingSphere-JDBC 版本：5.5.0 官方支持 Spring Boot 3.x（Boot 3.2 必须 ≥ 5.4.1） -->
    <shardingsphere.version>5.5.0</shardingsphere.version>
</properties>

<dependencyManagement>
    <dependencies>
        <!-- ... 已有的 mall-common / MP / Spring Cloud BOM 等不动，新增下面这条 ... -->
        <dependency>
            <groupId>org.apache.shardingsphere</groupId>
            <artifactId>shardingsphere-jdbc-core-spring-boot-starter</artifactId>
            <version>${shardingsphere.version}</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

**② `E:\course-mall\mall-order\pom.xml`**：`mybatis-plus-spring-boot3-starter`、`mysql-connector-j` Day 10 都加过了，今天只新增：

```xml
<!-- ShardingSphere-JDBC：核心。它运行时生成一个 DataSource 替身（ShardingSphereDataSource），
     拦截所有 SQL，按分片规则改写成分表的真实 SQL。版本由父工程管，这里不写 -->
<dependency>
    <groupId>org.apache.shardingsphere</groupId>
    <artifactId>shardingsphere-jdbc-core-spring-boot-starter</artifactId>
</dependency>
```

> 踩坑预警：ShardingSphere 的 jdbc core 内置了 MyBatis，版本和 MP 3.5.7 要求的 mybatis 可能不一致。如果启动报 `NoSuchMethodError` / `ClassNotFound` 的 mybatis 相关错，在 `mall-order/pom.xml` 里显式加一条 `<dependency>org.mybatis:mybatis:3.5.16</dependency>` 对齐即可。

::: tip 💡 面试题：ShardingSphere 有 JDBC、Proxy 两种形态，今天用哪种？区别是什么？
**一句话**：`ShardingSphere-JDBC` 是一个 **jar 包**，以数据源形式嵌进应用（今天用的），改了规则要重新部署应用，但无额外组件、延迟低；`ShardingSphere-Proxy` 是**独立中间件进程**，应用连它就像连 MySQL，可多应用共享、动态改规则，但多一跳网络。单应用/小团队常用 JDBC，多应用统一治理常用 Proxy。详见 [分库分表](/learn_database/分库分表)。
:::

### 步骤 3：建 4 张分表（完整复用 Day 02 的 `orders` 结构）

把下面 SQL 存成 `E:\course-mall\sql\sharding_orders.sql`，用 Navicat / 命令行执行。**唯一的结构变化**：主键 `id` 去掉 `AUTO_INCREMENT`（ID 改由雪花算法生成），其余字段与 Day 02 的 `orders` 完全一致——`pay_type`、`pay_time`、`deleted` 都要保留，否则 Day 10 的实体映射会缺列。

```sql
-- =====================================================
-- 订单表水平分表：orders → orders_0 ~ orders_3（按 user_id % 4 路由）
-- 保存路径：E:\course-mall\sql\sharding_orders.sql
-- =====================================================
USE `course_mall`;

DROP TABLE IF EXISTS `orders_0`;
CREATE TABLE `orders_0` (
    `id`           BIGINT        NOT NULL                COMMENT '主键（雪花ID，不再是自增）',
    `order_no`     VARCHAR(64)   NOT NULL                COMMENT '订单号（对用户可见）',
    `user_id`      BIGINT        NOT NULL                COMMENT '下单用户（分片键）',
    `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00   COMMENT '订单总金额',
    `status`       TINYINT       NOT NULL DEFAULT 0      COMMENT '订单状态：0待支付 1已支付 2已取消 3已退款',
    `pay_type`     TINYINT       DEFAULT NULL            COMMENT '支付方式：1支付宝 2微信',
    `pay_time`     DATETIME      DEFAULT NULL            COMMENT '支付成功时间',
    `deleted`      TINYINT       NOT NULL DEFAULT 0      COMMENT '逻辑删除（MyBatis-Plus @TableLogic 会用到，不能省）',
    `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),
    KEY `idx_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单表分片0';

-- orders_1 / _2 / _3：CREATE TABLE ... LIKE 直接复制结构，只改表名和注释
DROP TABLE IF EXISTS `orders_1`;
CREATE TABLE `orders_1` LIKE `orders_0`;
ALTER TABLE `orders_1` COMMENT='订单表分片1';

DROP TABLE IF EXISTS `orders_2`;
CREATE TABLE `orders_2` LIKE `orders_0`;
ALTER TABLE `orders_2` COMMENT='订单表分片2';

DROP TABLE IF EXISTS `orders_3`;
CREATE TABLE `orders_3` LIKE `orders_0`;
ALTER TABLE `orders_3` COMMENT='订单表分片3';
```

> Day 10~12 产生的测试订单还在旧的单表 `orders` 里。ShardingSphere 启用后**只读写 `orders_0`~`orders_3`**，不会再碰旧 `orders` 表。生产上要按 `user_id % 4` 把旧数据导入各分表；今天学习阶段直接删掉旧表或留着都不影响验证。

::: tip 💡 面试题：分表后，`uk_order_no` 唯一索引还能保证「订单号全局唯一」吗？
**一句话**：**不能**——唯一索引只作用在单张物理表内，`orders_0` 和 `orders_1` 里可以各有一条 `order_no` 相同的记录。跨分表的唯一性必须靠**生成规则**保证（今天订单号直接用雪花 ID 拼接，几乎不会重复），这就是分库分表后「全局唯一约束失效」的典型代价。详见 [分库分表](/learn_database/分库分表)。
:::

### 步骤 4：`application.yml` 改造——数据源换成 ShardingSphere

改 `E:\course-mall\mall-order\src\main\resources\application.yml`。**关键动作**：删掉 Day 10 的 `spring.datasource` 整段（数据源改由 ShardingSphere 创建），换成 `spring.shardingsphere`；`mybatis-plus` 的逻辑删除配置**保留不动**（`@TableLogic` 拼的 `WHERE deleted=0` 由 ShardingSphere 原样带到分表上，二者不冲突）：

```yaml
server:
  port: 8082              # Day 10 的端口，不变

spring:
  application:
    name: mall-order
  # 注意：ShardingSphere-JDBC 的配置都在 spring.shardingsphere 下（不是 spring.datasource！）
  # 它自己创建数据源，MyBatis-Plus 拿到的是它包的那层 ShardingSphereDataSource
  shardingsphere:
    mode:
      type: Standalone     # 单机模式：规则写在本地配置（多实例治理才用 Cluster 模式）
    props:
      sql-show: true       # 打印「逻辑 SQL + 真实 SQL」，验证路由结果的关键开关
    datasource:
      names: ds0           # 逻辑数据源名（今天只分表不分库，就一个；分库时才配 ds1、ds2...）
      ds0:
        type: com.zaxxer.hikari.HikariDataSource
        driver-class-name: com.mysql.cj.jdbc.Driver
        url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
        username: root
        password: 你的MySQL密码        # ← 改成你自己的
    rules:
      sharding:
        tables:
          orders:                            # 逻辑表名：代码里写的还是 orders，不用改
            # 真实数据节点：orders 对应 4 张物理表 orders_0 ~ orders_3
            actual-data-nodes: ds0.orders_$->{0..3}
            table-strategy:
              standard:                      # 标准分片策略：一个分片键，走精确路由
                sharding-column: user_id     # 分片键 = user_id
                sharding-algorithm-name: orders_mod
        sharding-algorithms:
          orders_mod:
            type: MOD                        # 取模算法：user_id % 分片数
            props:
              sharding-count: 4              # 对 4 取模 → 落在 orders_0 ~ orders_3

mybatis-plus:                   # ↓ 以下 Day 10 的配置原样保留
  configuration:
    map-underscore-to-camel-case: true
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl
  global-config:
    db-config:
      logic-delete-field: deleted
      logic-delete-value: 1
      logic-not-delete-value: 0
```

::: tip 💡 面试题：分片键（`sharding-column`）是怎么选的？选错会怎样？
**一句话**：分片键要选**查询最频繁、且能均匀打散数据的字段**。订单表最高频的查询是「我的订单」(`where user_id = ?`)，所以选 `user_id` 分片，按用户查订单能**精确路由到 1 张表**。如果选错（比如按 `status` 分），数据会严重倾斜（大部分订单都是「待支付」），常用查询还要广播到所有分表。详见 [分库分表](/learn_database/分库分表)。
:::

### 步骤 5：`Order` 实体改主键策略 + 注册雪花 ID Bean

改 `E:\course-mall\mall-order\src\main\java\com\mall\order\entity\Order.java`。**只有一行实质变化**：`@TableId(type = IdType.AUTO)` 换成 `IdType.INPUT`——主键由代码手动设置（雪花 ID），不让数据库自增（分表后自增会重复）。其余字段原样：

```java
package com.mall.order.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("orders")   // 写的是「逻辑表名」：ShardingSphere 会拦截 SQL，
                       // 把 orders 按 user_id 改写成 orders_0 / _1 / _2 / _3
public class Order {
    // IdType.INPUT：主键由代码手动设置（雪花 ID）。
    // 不再用 AUTO——分表后每张表各自自增，跨表必然重复
    @TableId(type = IdType.INPUT)
    private Long id;
    private String orderNo;        // 订单号，对用户可见
    private Long userId;           // 分片键：ShardingSphere 按 user_id % 4 路由
    private BigDecimal totalAmount;// 金额用 BigDecimal，呼应 Day02 的 DECIMAL(10,2)
    private Integer status;        // 0待支付 1已支付 2已取消 3已退款
    private Integer payType;       // 支付方式
    private LocalDateTime payTime;
    // @TableLogic：逻辑删除。ShardingSphere 只负责改表名，WHERE deleted=0 原样带到分表上
    @TableLogic
    private Integer deleted = 0;
}
```

新增 `E:\course-mall\mall-order\src\main\java\com\mall\order\config\IdConfig.java`：

```java
package com.mall.order.config;

import com.mall.common.id.SnowflakeIdGenerator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class IdConfig {

    // workerId / datacenterId 必须「每个服务实例唯一」：不同机器/不同实例不能撞，
    // 否则同一毫秒生成的序列号会相同 → ID 重复。
    // 生产上从配置中心/Nacos/Redis 动态分配；今天学习阶段先硬编码 (1, 1)。
    @Bean
    public SnowflakeIdGenerator snowflakeIdGenerator() {
        return new SnowflakeIdGenerator(1, 1);
    }
}
```

::: tip 💡 面试题：MyBatis-Plus 的 `IdType.ASSIGN_ID` 和今天手写的雪花算法是什么关系？
**一句话**：MP 的 `IdType.ASSIGN_ID` 内部就是用它自带的雪花算法（`DefaultIdentifierGenerator`）生成 ID，原理和今天手写的一模一样——生产上直接 `@TableId(type = IdType.ASSIGN_ID)` 一步到位。**今天手写是为了让你把 64 位结构、时钟回拨这些原理吃透**，这也是面试必问。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 6：改造 `OrderService` + `OrderMapper` + `OrderController`

**Mapper** `E:\course-mall\mall-order\src\main\java\com\mall\order\mapper\OrderMapper.java`——在原有空接口上新增一个方法：

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.order.entity.Order;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;

public interface OrderMapper extends BaseMapper<Order> {

    // 按用户查订单：WHERE 里带分片键 user_id，
    // ShardingSphere 能算出「该用户的数据在 orders_x」，只查 1 张表（精确路由）
    // 注意：SQL 里写的还是逻辑表名 orders，运行时会被替换成 orders_x
    @Select("SELECT * FROM orders WHERE user_id = #{userId} ORDER BY create_time DESC")
    List<Order> selectByUserId(@Param("userId") Long userId);
}
```

**Service** `E:\course-mall\mall-order\src\main\java\com\mall\order\service\OrderService.java`——改 `createOrder`，新增 `listByUserId`（`cancelOrder` 不动）：

```java
// 在类上加两个注入（其余代码不变）：
private final OrderMapper orderMapper;
private final OrderItemMapper orderItemMapper;
private final CourseMapper courseMapper;
private final SnowflakeIdGenerator snowflakeIdGenerator;   // ← 新增注入

// ============ createOrder 改造后 ============
@Transactional(rollbackFor = Exception.class)
public Order createOrder(CreateOrderRequest request) {
    // 1~2. 查课程 + 扣库存：完全不变（course 表不分片，ShardingSphere 对它的 SQL 原样放行）
    Course course = courseMapper.selectById(request.getCourseId());
    if (course == null) {
        throw new BizException(ErrorCode.NOT_FOUND.getCode(), "课程不存在");
    }
    if (course.getStatus() == null || course.getStatus() != 1) {
        throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "课程已下架，无法购买");
    }
    int deducted = courseMapper.deductStock(course.getId());
    if (deducted == 0) {
        throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "库存不足，下单失败");
    }

    // 3. 雪花 ID 生成主键 + 订单号（替代 Day 10 的「时间戳+随机数」订单号和自增主键）。
    //    id 在应用侧、写库之前就定好了：全局唯一 + 趋势递增。
    //    订单号直接复用雪花 ID，保证跨分表也几乎不会重复（uk_order_no 已管不住跨表唯一）
    long id = snowflakeIdGenerator.nextId();

    // 4. 组装订单。注意：id 是手动 set 的，insert 后无需再靠数据库回填主键
    Order order = new Order();
    order.setId(id);                              // ← 新增：手动设雪花主键
    order.setOrderNo("SN" + id);                  // ← 改动：雪花 ID 拼订单号
    order.setUserId(request.getUserId());
    order.setTotalAmount(course.getPrice());
    order.setStatus(OrderStatus.PENDING_PAYMENT.getCode());
    orderMapper.insert(order);   // ShardingSphere 看到 user_id=1，改写 INSERT INTO orders_1 ...

    // 5. 明细快照：order_item 不分片，setOrderId(order.getId()) 直接拿到上面生成的雪花 ID
    OrderItem item = new OrderItem();
    item.setOrderId(order.getId());
    item.setCourseId(course.getId());
    item.setCourseTitle(course.getTitle());
    item.setCourseCover(course.getCover());
    item.setPrice(course.getPrice());
    orderItemMapper.insert(item);

    log.info("下单成功 id={}, orderNo={}, userId={}", id, order.getOrderNo(), request.getUserId());
    return order;
}

// ============ 新增：按用户查订单（验证「精确路由」的入口） ============
public List<Order> listByUserId(Long userId) {
    return orderMapper.selectByUserId(userId);
}
```

> 说明：`createOrder` 里原来 `generateOrderNo()` 的私有方法和 `ThreadLocalRandom` 导入可以删掉（不再使用）；`cancelOrder` 方法一行不改，但它有个「分表后遗症」见步骤 7 的面试题。

**Controller** `E:\course-mall\mall-order\src\main\java\com\mall\order\controller\OrderController.java`——新增一个查询接口：

```java
// 原有的 create / cancel 两个接口不动，新增：
@GetMapping("/user/{userId}")
public Result<List<Order>> listByUserId(@PathVariable Long userId) {
    return Result.ok(orderService.listByUserId(userId));
}
// 记得补 import：java.util.List、org.springframework.web.bind.annotation.GetMapping/PathVariable
```

### 步骤 7：启动验证

在 `E:\course-mall\` 根目录执行：

```bash
mvn clean install -DskipTests        # 编译安装所有模块
mvn -pl mall-order spring-boot:run   # 启动订单服务（端口 8082）
```

先确认 `course` 表有库存（测试前可重置）：`UPDATE course SET stock = 100 WHERE id = 1;`

用 4 个不同 `userId` 下单，让它们落到不同分表（`1%4=1 → orders_1`，`2%4=2 → orders_2`，`3%4=3 → orders_3`，`4%4=0 → orders_0`）：

```bash
curl -X POST http://localhost:8082/api/order/create -H "Content-Type: application/json" -d "{\"userId\":1,\"courseId\":1}"
curl -X POST http://localhost:8082/api/order/create -H "Content-Type: application/json" -d "{\"userId\":2,\"courseId\":1}"
curl -X POST http://localhost:8082/api/order/create -H "Content-Type: application/json" -d "{\"userId\":3,\"courseId\":1}"
curl -X POST http://localhost:8082/api/order/create -H "Content-Type: application/json" -d "{\"userId\":4,\"courseId\":1}"
```

**验证的关键在控制台日志**（`sql-show: true` 生效后，每条 SQL 打印两行）：

```
Logic SQL: INSERT INTO orders (id, order_no, user_id, total_amount, status, deleted) VALUES (?, ?, ?, ?, ?, ?)
Actual SQL: ds0 ::: INSERT INTO orders_1 (id, order_no, user_id, total_amount, status, deleted) VALUES (?, ?, ?, ?, ?, ?)
```

- `Logic SQL` 是代码里写的（逻辑表 `orders`），`Actual SQL` 是 ShardingSphere 改写后的（物理表 `orders_1`）——`userId=1` 的 INSERT 被改写进 `orders_1`，说明**取模路由生效**。
- 返回的 `id` 是一个 18~19 位的大数字（雪花 ID），不再是 1、2、3。

再验证「精确路由查询」：

```bash
curl http://localhost:8082/api/order/user/1   # 只返回 userId=1 的订单
```

日志里 `Actual SQL` 只出现了 `orders_1`，说明查询只打了 1 张表。最后去数据库抽查：`SELECT COUNT(*) FROM orders_1;` 只有 userId=1 的记录；`orders_0` 里只有 userId=4 的；`orders_2`、`orders_3` 同理。

::: tip 💡 面试题：如果查询不带 `user_id`（比如 Day 10 的 `cancelOrder` 按 `orderNo` 查订单），ShardingSphere 会怎么做？
**一句话**：分片键是 `user_id`，只给 `orderNo` 时 ShardingSphere **算不出数据在哪张表**，只能把这条 SQL **广播到 orders_0~orders_3 全部 4 张表**执行再合并结果——表越多越慢，这就是「分片键没带进查询」的代价。所以分表设计时，**高频查询的 WHERE 一定要带分片键**；你项目里 `cancelOrder` 就中招了（今天先接受，生产上会把 `userId` 一并传进来精确路由）。详见 [分库分表](/learn_database/分库分表)。
:::

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| 水平分表、分片键、取模算法、全局唯一约束失效 | [分库分表](/learn_database/分库分表) |
| 雪花算法、分布式 ID、时钟回拨 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| `@TableId` / `IdType.INPUT` / `ASSIGN_ID` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| 自增主键 vs 雪花 ID、B+ 树主键、页分裂 | [MySQL](/learn_database/MySQL) |
| `synchronized` 保证生成器线程安全 | [并发编程](/learn_backend/java/Java核心/并发编程) |
| ShardingSphere 数据源装配、`@Bean` | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| 父工程版本管理、依赖传递 | [Maven](/learn_backend/java/基础/Maven) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `sharding_orders.sql` 执行成功，`SHOW TABLES;` 能看到 `orders_0` ~ `orders_3`：是 / 否
- [ ] `mall-order` 启动成功（8082），无报错：是 / 否
- [ ] 4 个不同 `userId` 下单，控制台 `Actual SQL` 分别落到 `orders_0`~`orders_3`：是 / 否
- [ ] 返回的订单 `id` 是 18~19 位的雪花大数字（不再是自增小数字）：是 / 否
- [ ] `curl /api/order/user/1` 能查回 `userId=1` 的订单，且日志显示只查了 `orders_1`：是 / 否
- [ ] 踩坑记录（ShardingSphere 版本不兼容、mybatis 版本冲突、分片规则没生效、`spring.datasource` 没删导致两个数据源等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. 分表后为什么数据库自增主键会重复？雪花算法的 64 位分别是什么、各占几位？为什么说它是「趋势递增」而不是「严格递增」？趋势递增对 InnoDB 有什么好处？
2. 雪花算法有什么缺点？「时钟回拨」为什么会导致 ID 重复，你代码里是怎么处理的？生产上还有哪些对策？
3. 订单表为什么按 `user_id` 分片？Day 10 的 `cancelOrder` 按 `orderNo` 查订单，分表后这条 SQL 会怎么执行？为什么慢？生产上怎么改？
4. 分表后 `uk_order_no` 唯一索引为什么不能保证订单号「全局唯一」？你今天是怎么让订单号「几乎不重复」的？
5. 什么时候该「分表」、什么时候该「分库」？分库分表会带来哪些新问题（提示：跨分片 join、分布式事务 Day 23 的 Seata、全局唯一 ID、后续扩容怎么平滑加表）？
