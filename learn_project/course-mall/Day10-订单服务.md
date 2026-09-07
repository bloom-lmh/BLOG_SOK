# Day 10 · 订单服务（下单 + 状态机 + 库存扣减）

> **今天目标**：新增 `mall-order` 订单领域模块，实现「幂等下单 + 明细快照 + 原子扣库存 + 本人取消」。Day01～Day12 仍只启动 `mall-user`，因此订单事务、JWT 当前用户和课程表操作都在同一个应用内完成。

本日项目根目录统一为 `E:\CourseMall`。订单代码位于
`mall-order\src\main\java`；模块化单体阶段仍由 `mall-user` 统一启动。

## 一、前置条件

- 已完成 **Day 01**（`mall-common` 里的 `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`，`scanBasePackages="com.mall"`）
- 已完成 **Day 02**（17 张表建好，`course` 已有 `stock/version`，`orders` 已有 `request_id` 幂等键）
- 已完成 **Day 04**（JWT 认证可从 `@AuthenticationPrincipal` 取得当前用户 ID）
- 已完成 **Day 06～08**（`mall-course`、MP、事务和缓存失效事件可用）

## 二、今天完成后你会得到什么

1. 一个普通 jar 模块 `mall-order`，由 `mall-user` 加载
2. `POST /api/orders` —— 从 JWT 取用户、用 `Idempotency-Key` 防重复下单
3. `POST /api/orders/{orderNo}/cancel` —— 只能取消自己的待支付订单
4. 原子状态更新，避免“支付成功”和“取消”并发覆盖
5. 一个 `OrderStatus` 枚举，把「订单状态怎么流转」固化下来，而不是散落的 `if (status == 0)` 魔法数字

## 三、步骤

### 步骤 1：核对 Day02 的并发与幂等字段

新建数据库直接使用 Day02 完整脚本；只有旧数据库缺列时才执行一次迁移：

```sql
USE `course_mall`;

-- 先用 SHOW COLUMNS 检查；已存在的列不要重复执行 ALTER。
ALTER TABLE `course`
    ADD COLUMN `stock` INT NOT NULL DEFAULT 100 COMMENT '日常可售库存' AFTER `original_price`,
    ADD COLUMN `version` INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER `stock`;

ALTER TABLE `orders`
    ADD COLUMN `request_id` VARCHAR(64) NOT NULL COMMENT '客户端幂等键' AFTER `order_no`,
    ADD UNIQUE KEY `uk_user_request` (`user_id`, `request_id`);
```

> 注意：`seckill_activity.stock_count` 是「秒杀库存」，和这里的 `course.stock`（日常售卖库存）是两码事，别搞混。Day 19 秒杀用的是前者。

::: tip 💡 面试题：为什么直接给 `course` 加列，而不是建一张 `stock` 表？
**一句话**：课程和它的库存是 **1:1** 关系，库存就是课程的一个属性，加一列最简单、查询不用 join、扣减时天然和课程在同一行锁上；只有库存有**独立生命周期**（多仓库、多 SKU、流水账）才值得拆表。详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 2：新建 `mall-order` 领域模块（不独立启动）

**① 父工程 `E:\CourseMall\pom.xml`** 加模块，并在 `dependencyManagement` 管理内部版本：

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-course</module>   <!-- Day 06 加的课程服务 -->
    <module>mall-order</module>    <!-- 今天新增 -->
</modules>

<dependencyManagement>
    <dependencies>
        <!-- 保留原有依赖，在其中追加 -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-order</artifactId>
            <version>${project.version}</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

在 `mall-user/pom.xml` 加入：

```xml
<dependency>
    <groupId>com.mall</groupId>
    <artifactId>mall-order</artifactId>
</dependency>
```

**② 普通 jar 模块 `E:\CourseMall\mall-order\pom.xml`**：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.mall</groupId>
        <artifactId>course-mall</artifactId>
        <version>1.0.0</version>
    </parent>

    <artifactId>mall-order</artifactId>

    <dependencies>
        <!-- 自己的公共模块：Result / ErrorCode / BizException / 全局异常 -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <!-- 模块化单体阶段复用 Course Entity；Day13 拆服务后改为远程 DTO -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-course</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-core</artifactId>
        </dependency>
        <!-- MyBatis-Plus：注意是 boot3 专用 starter（Spring Boot 3.x 用普通 starter 会报错） -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <scope>provided</scope>
        </dependency>
    </dependencies>
</project>
```

`mall-order` 没有启动类、数据库驱动、独立端口和 Boot 打包插件。修改唯一启动类的 Mapper 扫描：

```java
@MapperScan({
        "com.mall.user.mapper",
        "com.mall.course.mapper",
        "com.mall.order.mapper"
})
```

::: tip 💡 面试题：为什么订单模块现在能直接参与本地事务？
因为它和课程模块运行在同一个 JVM、同一个 Spring 容器、同一个数据源与事务管理器中。Day13 拆成独立进程后，本地 `@Transactional` 不再覆盖远程服务，需要重新设计为远程调用和分布式一致性。
:::

### 步骤 3：实体 + Mapper（Order / OrderItem / Course + 原子扣减 SQL）

**实体 `Order`**（映射 `orders` 表，路径 `com/mall/order/entity/Order.java`）：

```java
package com.mall.order.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
// 表名是 orders：因为 order 是 SQL 保留字，Day02 建表时表名就带了 s
@TableName("orders")
public class Order {
    @TableId(type = IdType.AUTO)   // 主键自增（Day24 分库分表时换雪花ID）
    private Long id;
    private String orderNo;        // 订单号，对用户可见，唯一索引防重
    private String requestId;      // 同一用户重复请求时保持不变，唯一索引兜底幂等
    private Long userId;
    private BigDecimal totalAmount;// 金额用 BigDecimal，别用 double（精度丢失）
    private Integer status;        // 订单状态机：0待支付 1已支付 2已取消 3已退款
    private Integer payType;       // 支付方式，Day12 支付对接才用
    private LocalDateTime payTime;
    @TableField("deleted_at")
    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;
    // 下单人已经由 userId 表达；只记录客服、管理员等最后修改人
    @TableField(fill = FieldFill.UPDATE)
    private Long updatedBy;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
```

**实体 `OrderItem`**（映射 `order_item`，`com/mall/order/entity/OrderItem.java`）：

```java
package com.mall.order.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("order_item")
public class OrderItem {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long orderId;          // 逻辑外键 -> orders.id
    private Long courseId;         // 逻辑外键 -> course.id
    private String courseTitle;    // 快照：下单时标题
    private String courseCover;    // 快照：下单时封面
    private BigDecimal price;      // 快照：下单时成交价
    private LocalDateTime createTime;
}
```

订单模块直接复用 Day06 的 `com.mall.course.entity.Course`，不要再为同一张表复制第二个 Entity。Day13 拆成独立服务后，订单服务不再直连课程表，而会改成 OpenFeign 返回的内部 DTO。

**三个 Mapper**（`com/mall/order/mapper/`）：

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.order.entity.Order;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Options;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

// BaseMapper 自带 selectById / insert / updateById 等 CRUD，不用写 XML
public interface OrderMapper extends BaseMapper<Order> {

    @Insert("""
            INSERT IGNORE INTO orders
                (order_no, request_id, user_id, total_amount, status, create_time)
            VALUES
                (#{orderNo}, #{requestId}, #{userId}, #{totalAmount}, #{status}, #{createTime})
            """)
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insertIgnore(Order order);

    @Update("""
            UPDATE orders
            SET status = 2
            WHERE order_no = #{orderNo}
              AND user_id = #{userId}
              AND status = 0
              AND deleted_at IS NULL
            """)
    int cancelPending(@Param("orderNo") String orderNo, @Param("userId") Long userId);

    @Select("""
            SELECT COUNT(*)
            FROM orders o
            JOIN order_item i ON i.order_id = o.id
            WHERE o.user_id = #{userId}
              AND i.course_id = #{courseId}
              AND o.status = 1
              AND o.deleted_at IS NULL
            """)
    long countPaidCourse(@Param("userId") Long userId, @Param("courseId") Long courseId);
}
```

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.order.entity.OrderItem;

public interface OrderItemMapper extends BaseMapper<OrderItem> {
}
```

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Course;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface CourseStockMapper extends BaseMapper<Course> {

    // 扣库存：一条 UPDATE 完成「判断 + 扣减」，这是防超卖的关键（步骤5有详解）
    // WHERE stock > 0 保证库存不会扣成负数
    @Update("""
            UPDATE course
            SET stock = stock - 1
            WHERE id = #{courseId}
              AND stock > 0
              AND status = 1
              AND deleted_at IS NULL
            """)
    int deductStock(@Param("courseId") Long courseId);

    // 回补库存：取消/退款时 +1。今天先用简单版，Day11 会加乐观锁/版本号
    @Update("UPDATE course SET stock = stock + 1 WHERE id = #{courseId}")
    int restoreStock(@Param("courseId") Long courseId);
}
```

### 步骤 4：订单状态机（`OrderStatus` 枚举）

状态机 = **状态**（有哪些）+ **事件/流转**（哪个状态能到哪个状态）。把这两件事用枚举固化下来，比散落一地的 `if (status == 0)` 魔法数字强得多。

新建 `com/mall/order/enums/OrderStatus.java`：

```java
package com.mall.order.enums;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import lombok.Getter;

@Getter
public enum OrderStatus {
    PENDING_PAYMENT(0, "待支付"),
    PAID(1, "已支付"),
    CANCELLED(2, "已取消"),
    REFUNDED(3, "已退款");

    private final int code;
    private final String desc;

    OrderStatus(int code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    // int -> 枚举：把数据库里的 status 数字翻译成有名字的状态
    public static OrderStatus of(int code) {
        for (OrderStatus s : values()) {
            if (s.code == code) {
                return s;
            }
        }
        throw new BizException(ErrorCode.ORDER_STATUS_INVALID);
    }

    // 状态机核心：当前状态能否流转到 target。流转图如下：
    //   待支付(0) --支付成功(Day12)--> 已支付(1) --退款(Day12)--> 已退款(3)
    //       |--取消--> 已取消(2) [终态]
    public boolean canTransitionTo(OrderStatus target) {
        return switch (this) {
            case PENDING_PAYMENT -> target == PAID || target == CANCELLED;
            case PAID            -> target == REFUNDED;
            case CANCELLED, REFUNDED -> false;   // 终态，不能再流转
        };
    }

    // 校验并流转：非法流转直接抛业务异常，把「状态怎么走」的规则收口在这一个方法里
    public OrderStatus transitionTo(OrderStatus target) {
        if (!canTransitionTo(target)) {
            throw new BizException(ErrorCode.ORDER_STATUS_INVALID);
        }
        return target;
    }
}
```

::: tip 💡 面试题：状态机为什么要用枚举管，而不是到处写 `if (status == 0)` 和魔法数字？
**一句话**：① 枚举把「有哪些状态、合法流转有哪些」**收口在一处**，改规则只改一个文件；② `status == 0` 里的 `0` 是魔法数字，时间一长没人记得 0 是啥；③ 非法流转（比如「已支付想直接取消」）会在 `transitionTo` 被**统一拦截**，而不是靠每个调用方自觉判断。这是**状态模式**最简的一种落地。详见 [Spring](/learn_backend/java/基础/Spring)。
:::

### 步骤 5：下单 Service —— 事务 + 快照 + 原子扣库存

先补充库存不足错误码：

```java
// ErrorCode（课程域）
STOCK_INSUFFICIENT(409205, MessageKeys.Course.STOCK_INSUFFICIENT),

// MessageKeys.Course
public static final String STOCK_INSUFFICIENT = "course.stock-insufficient";

// messages.properties / messages_zh_CN.properties
course.stock-insufficient=课程库存不足

// messages_en.properties
course.stock-insufficient=Course inventory is insufficient
```

新建 `com/mall/order/dto/CreateOrderRequest.java`：

```java
package com.mall.order.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CreateOrderRequest {
    @NotNull(message = "{common.id-required}")
    private Long courseId;
}
```

建立 `OrderVO.java`，不要把 `deletedAt` 等数据库字段返回给前端：

```java
package com.mall.order.vo;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record OrderVO(
        Long id,
        String orderNo,
        BigDecimal totalAmount,
        Integer status,
        LocalDateTime createTime) {
}
```

新建 `com/mall/order/service/OrderService.java`：

```java
package com.mall.order.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.course.entity.Course;
import com.mall.order.dto.CreateOrderRequest;
import com.mall.order.entity.Order;
import com.mall.order.entity.OrderItem;
import com.mall.order.enums.OrderStatus;
import com.mall.order.mapper.CourseStockMapper;
import com.mall.order.mapper.OrderItemMapper;
import com.mall.order.mapper.OrderMapper;
import com.mall.order.vo.OrderVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
// @RequiredArgsConstructor：给 final 字段生成构造器，Spring 用构造器注入（比 @Autowired 字段注入好测试、更安全）
@RequiredArgsConstructor
public class OrderService {

    private final OrderMapper orderMapper;
    private final OrderItemMapper orderItemMapper;
    private final CourseStockMapper courseMapper;

    // 下单：创建订单 + 写明细快照 + 扣库存，三者要么全成功、要么全回滚 —— 靠 @Transactional 保证原子性
    @Transactional(rollbackFor = Exception.class)
    public OrderVO createOrder(Long userId, String requestId, CreateOrderRequest request) {
        // 同一用户重试同一个 Idempotency-Key，直接返回第一次的结果。
        Order replay = findByRequestId(userId, requestId);
        if (replay != null) {
            return replay(replay, request.getCourseId());
        }

        // 价格和标题必须查库，绝不能相信客户端传来的金额。
        Course course = courseMapper.selectById(request.getCourseId());
        if (course == null) {
            throw new BizException(ErrorCode.COURSE_NOT_FOUND, request.getCourseId());
        }
        if (!Integer.valueOf(1).equals(course.getStatus())) {
            throw new BizException(ErrorCode.COURSE_OFFLINE);
        }
        if (orderMapper.countPaidCourse(userId, course.getId()) > 0) {
            throw new BizException(ErrorCode.COURSE_ALREADY_OWNED);
        }

        // 先用唯一索引占住幂等键；并发重复请求只有一个能插入。
        Order order = new Order();
        order.setOrderNo(generateOrderNo(userId));
        order.setRequestId(requestId);
        order.setUserId(userId);
        order.setTotalAmount(course.getPrice());
        order.setStatus(OrderStatus.PENDING_PAYMENT.getCode());
        order.setCreateTime(LocalDateTime.now());
        if (orderMapper.insertIgnore(order) == 0) {
            Order concurrentReplay = findByRequestId(userId, requestId);
            if (concurrentReplay == null) {
                throw new BizException(ErrorCode.OPERATION_FAILED);
            }
            return replay(concurrentReplay, course.getId());
        }

        // 判断库存与扣减合并为一条原子 UPDATE，影响 0 行就是库存不足/课程不可售。
        if (courseMapper.deductStock(course.getId()) == 0) {
            throw new BizException(ErrorCode.STOCK_INSUFFICIENT);
        }

        OrderItem item = new OrderItem();
        item.setOrderId(order.getId());
        item.setCourseId(course.getId());
        item.setCourseTitle(course.getTitle());
        item.setCourseCover(course.getCover());
        item.setPrice(course.getPrice());
        orderItemMapper.insert(item);

        log.info("下单成功 orderNo={}, userId={}, courseId={}",
                order.getOrderNo(), userId, course.getId());
        return toVO(order);
    }

    // 取消订单：待支付 -> 已取消，并回补库存。演示「状态机流转 + 事务」两个技术点
    @Transactional(rollbackFor = Exception.class)
    public OrderVO cancelOrder(Long userId, String orderNo) {
        Order order = orderMapper.selectOne(
                new LambdaQueryWrapper<Order>()
                        .eq(Order::getOrderNo, orderNo)
                        .eq(Order::getUserId, userId));
        if (order == null) {
            // 不区分“不存在”和“属于别人”，避免泄露其他用户订单。
            throw new BizException(ErrorCode.ORDER_NOT_FOUND, orderNo);
        }

        // SQL 自带 status=0 条件：支付回调与取消并发时只会有一方成功。
        if (orderMapper.cancelPending(orderNo, userId) == 0) {
            throw new BizException(ErrorCode.ORDER_STATUS_INVALID);
        }

        OrderItem item = orderItemMapper.selectOne(
                new LambdaQueryWrapper<OrderItem>().eq(OrderItem::getOrderId, order.getId()));
        if (item == null || courseMapper.restoreStock(item.getCourseId()) != 1) {
            throw new BizException(ErrorCode.OPERATION_FAILED);
        }

        order.setStatus(OrderStatus.CANCELLED.getCode());
        return toVO(order);
    }

    private Order findByRequestId(Long userId, String requestId) {
        return orderMapper.selectOne(new LambdaQueryWrapper<Order>()
                .eq(Order::getUserId, userId)
                .eq(Order::getRequestId, requestId));
    }

    private OrderVO replay(Order order, Long requestedCourseId) {
        OrderItem item = orderItemMapper.selectOne(new LambdaQueryWrapper<OrderItem>()
                .eq(OrderItem::getOrderId, order.getId()));
        if (item == null || !requestedCourseId.equals(item.getCourseId())) {
            // 同一个幂等键不能用于不同业务请求。
            throw new BizException(ErrorCode.ORDER_DUPLICATE);
        }
        return toVO(order);
    }

    private OrderVO toVO(Order order) {
        return new OrderVO(order.getId(), order.getOrderNo(), order.getTotalAmount(),
                order.getStatus(), order.getCreateTime());
    }

    // 订单号生成：yyyyMMddHHmmssSSS + userId + 6位随机数。
    // ThreadLocalRandom：线程隔离的随机数，无锁竞争，比 new Random() 更适合高并发
    private String generateOrderNo(Long userId) {
        String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS"));
        int rand = ThreadLocalRandom.current().nextInt(100000, 999999);
        return timestamp + userId + rand;
    }
}
```

::: tip 💡 面试题：`@Transactional` 为什么能让「订单 + 明细 + 扣库存」要么全成功要么全失败？
**一句话**：`@Transactional` 本质是 **AOP 代理**——Spring 在调用这个方法前先开启一个数据库事务，方法正常返回就 `commit`，抛异常（`RuntimeException`，我们的 `BizException` 就是）就 `rollback`。事务里的多步操作共用**同一个数据库连接**，所以「插了订单、插了明细、却没扣成库存」这种情况，整段一起回滚，不会留下脏数据。事务管理器是 Spring Boot 检测到 DataSource 后自动装配的 `DataSourceTransactionManager`。详见 [Spring](/learn_backend/java/基础/Spring)。
:::

::: tip 💡 面试题：扣库存为什么写成 `UPDATE ... SET stock = stock - 1 WHERE stock > 0` 一条 SQL，而不是先 `SELECT` 出来判断再 `UPDATE`？
**一句话**：先查再改有「TOCTOU 竞态」——两个请求同时 `SELECT` 到 `stock=1`，都通过判断，都去 `UPDATE`，库存会被扣到 **-1（超卖）**。而一条带条件的 `UPDATE` 在 InnoDB 里会**先拿行锁再重新评估 WHERE**：第二个事务的 UPDATE 等第一个提交后，基于新值（stock 已变 0）再判断 `stock>0`，不满足就影响 0 行 → 抛「库存不足」。**判断和扣减在一次原子操作里完成**，天然防超卖。这也是 Day 11 乐观锁的基础。详见 [并发编程](/learn_backend/java/Java核心/并发编程)、[MySQL](/learn_database/MySQL)。
:::

::: tip 💡 面试题：为什么订单明细要存课程标题/价格的「快照」，而不是只存 `courseId` 再 join 去查？
**一句话**：课程会改价、改名、甚至下架删除。如果明细只存 `courseId`，历史订单查出来就是「当前」的标题和价格，数据全错。下单时把那一刻的 `title/cover/price` 固化进 `order_item`，之后课程怎么变都不影响历史订单。**订单里的金额、商品信息必须是不变量。** 详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 6：Controller + 验证

新建 `com/mall/order/controller/OrderController.java`：

```java
package com.mall.order.controller;

import com.mall.common.result.Result;
import com.mall.order.dto.CreateOrderRequest;
import com.mall.order.service.OrderService;
import com.mall.order.vo.OrderVO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
@RequestMapping("/api/orders")
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    public Result<OrderVO> create(
            @AuthenticationPrincipal(expression = "id") Long userId,
            @NotBlank(message = "{common.param-error}")
            @Size(max = 64, message = "{common.param-error}")
            @RequestHeader("Idempotency-Key") String requestId,
            @Valid @RequestBody CreateOrderRequest request) {
        return Result.ok(orderService.createOrder(userId, requestId, request));
    }

    @PostMapping("/{orderNo}/cancel")
    public Result<OrderVO> cancel(
            @AuthenticationPrincipal(expression = "id") Long userId,
            @NotBlank(message = "{common.param-error}")
            @Size(max = 64, message = "{common.param-error}")
            @PathVariable String orderNo) {
        return Result.ok(orderService.cancelOrder(userId, orderNo));
    }
}
```

启动验证（在 `E:\CourseMall\` 根目录）：

```bash
mvn clean verify -DskipTests
mvn -pl mall-user -am spring-boot:run
```

先登录获得 Token，再下单：

```bash
curl -X POST http://localhost:8080/api/orders \
  -H "Authorization: Bearer 你的TOKEN" \
  -H "Idempotency-Key: order-test-001" \
  -H "Content-Type: application/json" \
  -d "{\"courseId\":1}"
```

预期返回（`status=0` 待支付，`totalAmount` 是课程 1 的价格 199.00）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "orderNo": "20260819213045123123456123456",
    "totalAmount": 199.00,
    "status": 0,
    "createTime": "2026-08-27T21:30:45"
  }
}
```

验证三件事：

1. **明细快照**：`SELECT * FROM order_item;` 能看到 `course_title`、`price` 已固化。
2. **库存扣减**：`SELECT stock FROM course WHERE id=1;` 比下单前少了 1。
3. **幂等重试**：使用相同 Token、相同 `Idempotency-Key` 和相同 body 再请求一次，应返回同一订单，库存不再扣减。
4. **幂等冲突**：相同 `Idempotency-Key` 改成另一个 `courseId`，应返回 `ORDER_DUPLICATE`。
5. **状态机 + 回补**（用返回的 orderNo 取消）：

```bash
curl -X POST http://localhost:8080/api/orders/20260819213045123123456123456/cancel \
  -H "Authorization: Bearer 你的TOKEN"
```

取消后 `orders.status` 变 `2`，`course.stock` 回补。再次取消返回 `ORDER_STATUS_INVALID`；换另一个用户的 Token 取消则返回 `ORDER_NOT_FOUND`，证明所有权校验生效。

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| `@Transactional` 事务、回滚、AOP 代理 | [Spring](/learn_backend/java/基础/Spring) |
| 订单状态机（枚举 + 状态流转校验） | [Spring](/learn_backend/java/基础/Spring) |
| 原子 `UPDATE` 防超卖、InnoDB 行锁、TOCTOU | [并发编程](/learn_backend/java/Java核心/并发编程)、[MySQL](/learn_database/MySQL) |
| MyBatis-Plus `BaseMapper`、`@TableLogic`、`@MapperScan` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| `BigDecimal` 金额精度、`DECIMAL` 列 | [MySQL](/learn_database/MySQL) |
| 唯一索引 `uk_order_no` 保证订单号唯一 | [MySQL](/learn_database/MySQL) |
| `Idempotency-Key` + `uk_user_request` 幂等 | [MySQL](/learn_database/MySQL) |
| JWT 当前用户、所有权校验、`@PreAuthorize` | [Spring Security](/learn_backend/java/基础/Spring Security) |
| DTO 参数校验与 VO 隔离 Entity | [Spring Boot](/learn_backend/java/基础/Spring Boot) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `course.stock/version` 与 `orders.request_id` 字段存在：是 / 否
- [ ] 只启动 `mall-user`，携带 JWT 下单返回 `status=0`：是 / 否
- [ ] 请求体不传 userId，订单 userId 来自 JWT：是 / 否
- [ ] 相同幂等键重试返回同一订单且不重复扣库存：是 / 否
- [ ] 下单后 `course.stock` 减 1、`order_item` 有快照：是 / 否
- [ ] 取消订单后 `status=2` 且 `stock` 回补 +1；二次取消报「非法状态流转」：是 / 否
- [ ] 踩坑记录（依赖版本、表名保留字、JSON 传参等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. `@Transactional` 底层是怎么实现「要么全成功要么全失败」的？为什么 `BizException` 抛出去会触发回滚？（提示：AOP 代理 + `RuntimeException` 默认回滚）
2. 扣库存为什么必须是 `UPDATE ... WHERE stock > 0` 一条 SQL？如果改成「先 `SELECT` 判断、再 `UPDATE`」会发生什么（并发场景）？
3. 为什么 userId 不能由请求体提交？`@AuthenticationPrincipal(expression = "id")` 取到的值来自哪里？
4. 为什么 `order_item` 要存 `course_title` / `price` 的快照，而不是只存 `courseId` 去关联查？
5. `Idempotency-Key`、应用层查询和数据库唯一索引分别解决哪一层的重复提交？
