# Day 24 · 订单分表 PoC（ShardingSphere-JDBC）

> **今天目标**：不盲目把生产主链路直接分表，而是在 `mall-order` 中完成一个可验证的水平分表 PoC：订单按 `user_id` 路由到 4 张表，主键使用雪花 ID，用户查询只访问一个分片，并明确迁移、扩容和与 Seata 组合时的风险。

## 一、先做容量判断

真实项目不会因为“技术高级”就立刻分表。先观察单表数据量、索引命中率、慢查询、写入 TPS、备份和 DDL 时间；单表仍能稳定支撑时，分表只会提前引入跨分片查询、唯一约束、分页、迁移和事务复杂度。

本日作为面试项目的 **PoC 能力证明**。建议在 `feature/order-sharding-poc` 分支完成，不要未经压测就替换当前稳定主链路。

选择 `user_id` 作为分片键，是因为“我的订单”是高频查询，并且登录用户 ID 可以从 JWT 获取。相同用户始终落在同一张表：

```text
user_id % 4
0 -> orders_0
1 -> orders_1
2 -> orders_2
3 -> orders_3
```

## 二、必须理解的三个问题

### 1. 为什么不能继续使用数据库自增 ID

每张物理表都有独立的自增序列，`orders_0` 和 `orders_1` 都可能出现 `id=1`。因此主键必须由应用或分布式 ID 服务在写库前生成。

本项目直接使用 MyBatis-Plus 的 `IdType.ASSIGN_ID`。它会生成雪花风格的 `Long` ID；不再维护一份容易出错的手写算法。

```java
@TableId(type = IdType.ASSIGN_ID)
private Long id;
```

生产多实例还要确认 worker 标识分配策略，尤其是容器批量扩容场景。更严格的系统可以使用 Leaf、UidGenerator 或数据库号段服务。

### 2. 唯一索引不再是全局唯一

`orders_0.uk_order_no` 只能约束 `orders_0`。不同分表仍可能出现相同 `order_no`。因此：

- `id/order_no` 由全局唯一算法生成；
- 幂等键使用 `(user_id, request_id)`，同一用户一定落在同一分片，因此数据库唯一索引仍能兜底；
- 只拿 `order_no` 查询会广播所有分片。用户接口应同时携带从 JWT 获取的 `user_id`；支付回调等无用户上下文场景，生产上应维护 `order_route(order_no, user_id)` 路由表或在支付记录中保留 `user_id`。

### 3. 分表不是简单替换数据源

Day23 已引入 Seata。ShardingSphere 数据源与 Seata 数据源代理组合后，必须根据项目锁定版本做集成测试，不能假定两个 Starter 叠加就一定正确。今天先验证分片路由；最终主链路若同时启用两者，要按 ShardingSphere 当前官方的 Seata 事务配置接入，并验证正常提交、全局回滚和 `undo_log`。

## 三、建表

保存为 `E:\CourseMall\sql\day24-order-sharding.sql`。学习环境没有历史数据时可直接创建；有数据时禁止直接删旧表，迁移步骤见后文。

```sql
USE course_mall;

CREATE TABLE IF NOT EXISTS orders_0 (
    id           BIGINT         NOT NULL COMMENT '雪花ID',
    order_no     VARCHAR(64)    NOT NULL COMMENT '订单号',
    request_id   VARCHAR(64)    NOT NULL COMMENT '客户端幂等键',
    user_id      BIGINT         NOT NULL COMMENT '用户ID/分片键',
    total_amount DECIMAL(10, 2) NOT NULL,
    status       TINYINT        NOT NULL DEFAULT 0,
    pay_type     TINYINT        NULL,
    pay_time     DATETIME       NULL,
    deleted_at   DATETIME       NULL COMMENT '逻辑删除时间',
    create_time  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_no (order_no),
    UNIQUE KEY uk_user_request (user_id, request_id),
    KEY idx_user_create_time (user_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单分片0';

CREATE TABLE IF NOT EXISTS orders_1 LIKE orders_0;
CREATE TABLE IF NOT EXISTS orders_2 LIKE orders_0;
CREATE TABLE IF NOT EXISTS orders_3 LIKE orders_0;
```

> 当前 PoC 只拆 `orders`，`order_item` 暂时仍是单表，业务层分别查询后组装，不做跨表 JOIN。生产继续扩容时，应给 `order_item` 增加 `user_id` 并按同一规则分片，再配置 binding tables，避免笛卡尔路由。

## 四、使用当前 ShardingSphere JDBC 驱动方式

当前官方文档对 Spring Boot 3 推荐使用 `shardingsphere-jdbc` 和 `ShardingSphereDriver`，分片规则放在独立 YAML 中。不要继续照搬旧版 `shardingsphere-jdbc-core-spring-boot-starter` 教程。

父工程统一版本：

```xml
<properties>
    <shardingsphere.version>5.5.2</shardingsphere.version>
</properties>
```

`mall-order/pom.xml`：

```xml
<dependency>
    <groupId>org.apache.shardingsphere</groupId>
    <artifactId>shardingsphere-jdbc</artifactId>
    <version>${shardingsphere.version}</version>
</dependency>
```

> 审计日期使用 5.5.2。以后升级先看官方迁移说明，并执行 `mvn dependency:tree` 检查 MyBatis、SnakeYAML、HikariCP 和 Seata 的冲突，不要遇到 `NoSuchMethodError` 就随意强行覆盖传递依赖。

## 五、配置数据源与分片规则

`mall-order/src/main/resources/application.yml`：

```yaml
spring:
  datasource:
    driver-class-name: org.apache.shardingsphere.driver.ShardingSphereDriver
    # environment 让独立 YAML 支持环境变量，不把数据库密码提交到 Git。
    url: jdbc:shardingsphere:classpath:sharding-orders.yaml?placeholder-type=environment
```

新建 `mall-order/src/main/resources/sharding-orders.yaml`：

```yaml
databaseName: course_mall_order

dataSources:
  ds0:
    dataSourceClassName: com.zaxxer.hikari.HikariDataSource
    driverClassName: com.mysql.cj.jdbc.Driver
    jdbcUrl: $${ORDER_DB_URL::jdbc:mysql://127.0.0.1:3306/course_mall?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true}
    username: $${ORDER_DB_USERNAME::root}
    password: $${ORDER_DB_PASSWORD::}

rules:
  - !SHARDING
    tables:
      orders:
        actualDataNodes: ds0.orders_$->{0..3}
        tableStrategy:
          standard:
            shardingColumn: user_id
            shardingAlgorithmName: orders_mod
    shardingAlgorithms:
      orders_mod:
        type: INLINE
        props:
          algorithm-expression: orders_$->{user_id % 4}

props:
  sql-show: true
```

IDEA 运行配置中至少添加：

```text
ORDER_DB_PASSWORD=你的本地数据库密码
```

`$${变量名::默认值}` 是 ShardingSphere JDBC URL 的环境变量占位符，不是 Spring 的 `${变量名:默认值}`。

## 六、实体、查询与接口改造

### 1. Entity 只负责持久化

```java
@Data
@TableName("orders")
public class Order {
    @TableId(type = IdType.ASSIGN_ID)
    private Long id;
    private String orderNo;
    private String requestId;
    private Long userId;
    private BigDecimal totalAmount;
    private Integer status;
    private Integer payType;
    private LocalDateTime payTime;

    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
```

### 2. 所有高频查询携带分片键

```java
public interface OrderMapper extends BaseMapper<Order> {

    @Select("""
            SELECT * FROM orders
            WHERE user_id = #{userId} AND deleted_at IS NULL
            ORDER BY create_time DESC
            LIMIT #{offset}, #{size}
            """)
    List<Order> selectPageByUserId(
            @Param("userId") Long userId,
            @Param("offset") long offset,
            @Param("size") int size);

    @Select("""
            SELECT * FROM orders
            WHERE user_id = #{userId} AND order_no = #{orderNo} AND deleted_at IS NULL
            """)
    Order selectOwnedOrder(
            @Param("userId") Long userId,
            @Param("orderNo") String orderNo);
}
```

不要提供 `/api/orders/user/{userId}` 让客户端指定用户。用户身份必须来自 JWT：

```java
@Validated
@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public Result<PageResult<OrderVO>> mine(
            @AuthenticationPrincipal LoginUser loginUser,
            @RequestParam(defaultValue = "1") @Min(1) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return Result.ok(orderService.pageMine(loginUser.getId(), page, size));
    }

    @GetMapping("/{orderNo}")
    @PreAuthorize("isAuthenticated()")
    public Result<OrderVO> detail(
            @AuthenticationPrincipal LoginUser loginUser,
            @PathVariable @Pattern(regexp = "^[A-Za-z0-9]{10,64}$") String orderNo) {
        return Result.ok(orderService.detail(loginUser.getId(), orderNo));
    }
}
```

下单接口仍沿用 Day23：Body 只有 `courseId/count`，`userId` 来自 `LoginUser`，`requestId` 来自 `Idempotency-Key` 请求头。Service 在 `insert` 前设置 `userId`，ShardingSphere 才能计算目标表。

Service 返回 `OrderVO`，不要把 `Order` Entity 直接暴露给前端；转换继续使用 MapStruct。

## 七、验证路由

从网关请求，不绕过认证：

```bash
curl -X POST http://127.0.0.1:9000/api/orders \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -H "Idempotency-Key: shard-u1-001" \
  -H "Content-Type: application/json" \
  -d '{"courseId":1,"count":1}'

curl "http://127.0.0.1:9000/api/orders?page=1&size=20" \
  -H "Authorization: Bearer <USER_TOKEN>"
```

观察 `sql-show`：

```text
Logic SQL:  INSERT INTO orders ...
Actual SQL: ds0 ::: INSERT INTO orders_1 ...
```

验收必须覆盖：

1. 同一用户多次下单始终进入同一张表；
2. 不同用户能落入不同表；
3. “我的订单”只产生一条 `Actual SQL`；
4. 重复 `Idempotency-Key` 被 `(user_id, request_id)` 唯一索引拦截；
5. 非本人订单返回 404/业务错误，不能越权查询；
6. `page/size/orderNo` 非法时由 Validation 返回统一 i18n 错误。

## 八、迁移与扩容必须会讲

已有数据时采用“双写/回放 + 校验 + 灰度读 + 切换”的流程，不能直接 `DROP orders`：

1. 创建分片表并暂停结构变更；
2. 按 `user_id` 回放存量数据；
3. 用 binlog/CDC 同步迁移期间增量；
4. 按总数、金额汇总、抽样哈希校验；
5. 小流量灰度读分片表，观察错误率和延迟；
6. 全量切换后保留旧表一段时间，准备回滚。

从 4 张表改成 8 张时，简单 `% 8` 会让大量旧数据换位置。因此生产会使用一致性哈希、虚拟节点、范围分片，或通过迁移工具分批扩容。

## 九、知识点索引

| 知识点 | 对应文档 |
|---|---|
| 水平分表、路由、广播查询、扩容 | [分库分表](/learn_database/分库分表) |
| 雪花 ID、时钟回拨、worker 冲突 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| `ASSIGN_ID`、逻辑删除 | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| 分片索引与分页 | [MySQL](/learn_database/MySQL) |
| ShardingSphere + Seata 边界 | [Seata](/learn_backend/java/微服务/Seata) |

## 十、完成清单

- [ ] `orders_0`～`orders_3` 建表成功
- [ ] 数据库密码只来自环境变量
- [ ] `mall-order` 启动且分片规则加载成功
- [ ] 下单和“我的订单”都按 `user_id` 精确路由
- [ ] Controller 使用 JWT 用户、Validation 和 `@PreAuthorize`
- [ ] 重复幂等键、越权访问、非法分页参数测试通过
- [ ] 写下是否将 PoC 合并主线，以及容量数据依据

## 十一、面试追问

1. 为什么订单按 `user_id` 分片，而不是按 `status` 或 `order_no`？
2. 分表后数据库唯一索引为什么不再全局唯一？幂等键如何继续可靠？
3. 查询不带分片键会发生什么？支付回调只有 `order_no` 时如何定位分片？
4. 从 4 张表扩到 8 张为什么不能直接改取模数？如何迁移与回滚？
5. ShardingSphere 数据源与 Seata 同时使用时，为什么必须做组合集成测试？

参考：[ShardingSphere JDBC Spring Boot 3 配置](https://shardingsphere.apache.org/document/current/cn/user-manual/shardingsphere-jdbc/yaml-config/jdbc-driver/spring-boot/)、[环境变量占位符](https://shardingsphere.apache.org/document/current/cn/user-manual/shardingsphere-jdbc/yaml-config/jdbc-driver/known-implementation/)。
