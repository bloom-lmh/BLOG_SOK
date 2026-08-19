# Day 10 · 订单服务（下单 + 状态机 + 库存扣减）

> **今天目标**：新建 `mall-order` 订单服务模块，实现「下单」接口——在**同一个事务**里完成「创建订单 + 写明细快照 + 原子扣库存」，并用**枚举实现订单状态机**（含一次「取消订单」的合法流转演示）。

## 一、前置条件

- 已完成 **Day 01**（`mall-common` 里的 `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`，`scanBasePackages="com.mall"`）
- 已完成 **Day 02**（11 张表建好，`course_mall` 库，`course` / `orders` / `order_item` 已存在）
- 已完成 **Day 06**（MyBatis-Plus 已在项目里用起来）——但今天订单服务是**独立模块**，要自己引一遍 MyBatis-Plus 依赖
- MySQL 已启动，`user` 表里至少有一个测试用户（见步骤 1 的说明）

## 二、今天完成后你会得到什么

1. 一个新模块 `mall-order`（独立 Spring Boot 应用，端口 8082）
2. `POST /api/order/create` —— 下单：事务里创建订单 + 明细快照 + 扣库存
3. `POST /api/order/cancel/{orderNo}` —— 取消：演示状态机「待支付 → 已取消」+ 回补库存
4. `course` 表新增一个 `stock`（库存）字段
5. 一个 `OrderStatus` 枚举，把「订单状态怎么流转」固化下来，而不是散落的 `if (status == 0)` 魔法数字

## 三、步骤

### 步骤 1：给 `course` 表补一个 `stock` 字段（Day 02 漏了）

回看 Day 02 的 `course` 表结构——它**没有库存字段**。但今天要「扣库存」，Day 11 还要「防超卖 + 乐观锁」。所以第一步先补上，**不另建表**，直接在 `course` 上加一列：

```sql
-- 保存到 E:\course-mall\sql\day10-add-stock.sql，用 Navicat/命令行执行
USE `course_mall`;

-- stock：可售库存。INT 够用（课程不是实物，量级小）。
-- NOT NULL DEFAULT 100：老数据（Day02 插入的 3 门课）自动补 100，新插入的课默认也有 100。
ALTER TABLE `course`
    ADD COLUMN `stock` INT NOT NULL DEFAULT 100 COMMENT '库存（可售数量，Day10 下单扣减、Day11 乐观锁防超卖）' AFTER `price`;
```

> 注意：`seckill_activity.stock_count` 是「秒杀库存」，和这里的 `course.stock`（日常售卖库存）是两码事，别搞混。Day 19 秒杀用的是前者。

测试前确保有个用户可用（Day 03 注册接口会生成真实用户，今天先手动插一条即可）：

```sql
-- password 这里随便填（Day 04 才做登录校验）；正常应存 BCrypt 密文
INSERT INTO `user` (`username`, `password`, `nickname`) VALUES ('test', 'whatever', '测试用户');
-- 记住返回的自增 id，下面下单时用 userId=1
```

::: tip 💡 面试题：为什么直接给 `course` 加列，而不是建一张 `stock` 表？
**一句话**：课程和它的库存是 **1:1** 关系，库存就是课程的一个属性，加一列最简单、查询不用 join、扣减时天然和课程在同一行锁上；只有库存有**独立生命周期**（多仓库、多 SKU、流水账）才值得拆表。详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 2：新建 `mall-order` 模块（父 pom + 模块 pom + 启动类 + 配置）

**① 父工程 `E:\course-mall\pom.xml`**，在 `<modules>` 里加一行 `mall-order`：

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-course</module>   <!-- Day 06 加的课程服务 -->
    <module>mall-order</module>    <!-- 今天新增 -->
</modules>
```

**② 模块 pom `E:\course-mall\mall-order\pom.xml`**：

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
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <!-- MyBatis-Plus：注意是 boot3 专用 starter（Spring Boot 3.x 用普通 starter 会报错） -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
            <version>3.5.7</version>
        </dependency>
        <!-- MySQL 驱动（8.x 的 artifactId 是 mysql-connector-j，不是老版的 mysql-connector-java） -->
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

**③ 启动类 `E:\course-mall\mall-order\src\main\java\com\mall\order\MallOrderApplication.java`**：

```java
package com.mall.order;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// scanBasePackages="com.mall"：和 Day01 一样，把 mall-common 的全局异常处理器扫进来
@SpringBootApplication(scanBasePackages = "com.mall")
// @MapperScan：让 MyBatis-Plus 自动为 com.mall.order.mapper 包下的每个 Mapper 接口生成代理实现
@MapperScan("com.mall.order.mapper")
public class MallOrderApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallOrderApplication.class, args);
    }
}
```

**④ 配置 `E:\course-mall\mall-order\src\main\resources\application.yml`**：

```yaml
server:
  port: 8082              # mall-user=8080、mall-course=8081，这里用 8082；冲突就改

spring:
  application:
    name: mall-order
  datasource:
    url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
    username: root        # 换成你自己的
    password: root        # 换成你自己的
    driver-class-name: com.mysql.cj.jdbc.Driver

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true   # 下划线列名 <-> 驼峰字段自动映射（order_no -> orderNo）
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 打印 SQL，方便看扣库存到底执行了啥
  global-config:
    db-config:
      logic-delete-field: deleted       # 逻辑删除字段
      logic-delete-value: 1             # 已删=1
      logic-not-delete-value: 0         # 正常=0
```

::: tip 💡 面试题：为什么 MyBatis-Plus 在 Spring Boot 3 下要用 `mybatis-plus-spring-boot3-starter`？
**一句话**：Spring Boot 3 的包名从 `javax.*` 换到了 `jakarta.*`，老 starter 的自动配置类引用的是 `javax`，在 Boot 3 下会 `ClassNotFound`；`-boot3` 后缀的 starter 才适配了 `jakarta`。同理 MySQL 驱动 8.x 的 artifactId 也从 `mysql-connector-java` 改成了 `mysql-connector-j`。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 3：实体 + Mapper（Order / OrderItem / Course + 原子扣减 SQL）

**实体 `Order`**（映射 `orders` 表，路径 `com/mall/order/entity/Order.java`）：

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
// 表名是 orders：因为 order 是 SQL 保留字，Day02 建表时表名就带了 s
@TableName("orders")
public class Order {
    @TableId(type = IdType.AUTO)   // 主键自增（Day24 分库分表时换雪花ID）
    private Long id;
    private String orderNo;        // 订单号，对用户可见，唯一索引防重
    private Long userId;
    private BigDecimal totalAmount;// 金额用 BigDecimal，别用 double（精度丢失）
    private Integer status;        // 订单状态机：0待支付 1已支付 2已取消 3已退款
    private Integer payType;       // 支付方式，Day12 支付对接才用
    private LocalDateTime payTime;
    // @TableLogic：MyBatis-Plus 自动把 delete 变成 update deleted=1、把 select 自动拼 deleted=0
    @TableLogic
    private Integer deleted = 0;
    // create_time / update_time 不映射：Day02 建表时给了 DEFAULT CURRENT_TIMESTAMP，
    // 插入时字段为 null 会被 MyBatis-Plus 省略，让数据库默认值兜底（见下面注释）
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

**实体 `Course`**（订单服务只关心课程的这几个字段，`com/mall/order/entity/Course.java`）：

```java
package com.mall.order.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;

@Data
@TableName("course")
public class Course {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String title;
    private String cover;
    private BigDecimal price;      // 售价
    private Integer status;        // 1已上架 0下架
    private Integer stock;         // 库存（步骤1刚加的列）
}
```

> 为什么订单服务里要再建一个「精简版」`Course` 实体？因为 `mall-order` 是独立应用，不能依赖 `mall-course` 的类；它只需要读 `course` 表里的价格/标题/库存，就只映射自己关心的几列，其余字段不映射。

**三个 Mapper**（`com/mall/order/mapper/`）：

```java
package com.mall.order.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.order.entity.Order;

// BaseMapper 自带 selectById / insert / updateById 等 CRUD，不用写 XML
public interface OrderMapper extends BaseMapper<Order> {
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
import com.mall.order.entity.Course;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface CourseMapper extends BaseMapper<Course> {

    // 扣库存：一条 UPDATE 完成「判断 + 扣减」，这是防超卖的关键（步骤5有详解）
    // WHERE stock > 0 保证库存不会扣成负数
    @Update("UPDATE course SET stock = stock - 1 WHERE id = #{courseId} AND stock > 0")
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
        throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "未知订单状态: " + code);
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
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(),
                    "非法状态流转: " + this.desc + " -> " + target.desc);
        }
        return target;
    }
}
```

::: tip 💡 面试题：状态机为什么要用枚举管，而不是到处写 `if (status == 0)` 和魔法数字？
**一句话**：① 枚举把「有哪些状态、合法流转有哪些」**收口在一处**，改规则只改一个文件；② `status == 0` 里的 `0` 是魔法数字，时间一长没人记得 0 是啥；③ 非法流转（比如「已支付想直接取消」）会在 `transitionTo` 被**统一拦截**，而不是靠每个调用方自觉判断。这是**状态模式**最简的一种落地。详见 [Spring](/learn_backend/java/基础/Spring)。
:::

### 步骤 5：下单 Service —— 事务 + 快照 + 原子扣库存

新建 `com/mall/order/dto/CreateOrderRequest.java`：

```java
package com.mall.order.dto;

import lombok.Data;

@Data
public class CreateOrderRequest {
    private Long userId;     // 下单用户。Day04 起 userId 应该从 JWT 里取，今天先显式传，方便测试
    private Long courseId;   // 要买的课程
}
```

新建 `com/mall/order/service/OrderService.java`：

```java
package com.mall.order.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.order.dto.CreateOrderRequest;
import com.mall.order.entity.Course;
import com.mall.order.entity.Order;
import com.mall.order.entity.OrderItem;
import com.mall.order.enums.OrderStatus;
import com.mall.order.mapper.CourseMapper;
import com.mall.order.mapper.OrderItemMapper;
import com.mall.order.mapper.OrderMapper;
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
    private final CourseMapper courseMapper;

    // 下单：创建订单 + 写明细快照 + 扣库存，三者要么全成功、要么全回滚 —— 靠 @Transactional 保证原子性
    @Transactional(rollbackFor = Exception.class)
    public Order createOrder(CreateOrderRequest request) {
        // 1. 查课程。价格/标题必须从 DB 取，绝不能用前端传来的值，否则价格可被篡改（改成 0.01 白嫖）
        Course course = courseMapper.selectById(request.getCourseId());
        if (course == null) {
            throw new BizException(ErrorCode.NOT_FOUND.getCode(), "课程不存在");
        }
        if (course.getStatus() == null || course.getStatus() != 1) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "课程已下架，无法购买");
        }

        // 2. 先扣库存（fail-fast：库存不足直接抛异常，后续订单都别建了）
        //    扣减用一条原子 UPDATE，具体为什么能防超卖看下面的面试题
        int deducted = courseMapper.deductStock(course.getId());
        if (deducted == 0) {
            // 返回 0 行 = 库存不足（stock 已经是 0 了），抛异常触发回滚
            throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "库存不足，下单失败");
        }

        // 3. 生成订单号：时间戳 + 用户id + 随机数。Day24 分库分表时换成雪花ID
        String orderNo = generateOrderNo(request.getUserId());

        // 4. 组装订单主表，初始状态 = 待支付
        Order order = new Order();
        order.setOrderNo(orderNo);
        order.setUserId(request.getUserId());
        order.setTotalAmount(course.getPrice());
        order.setStatus(OrderStatus.PENDING_PAYMENT.getCode());
        orderMapper.insert(order);   // 主键回填：insert 后 order.getId() 就有值了

        // 5. 组装订单明细 —— 存「快照」：把下单那一刻的标题/封面/价格固化下来
        OrderItem item = new OrderItem();
        item.setOrderId(order.getId());
        item.setCourseId(course.getId());
        item.setCourseTitle(course.getTitle());
        item.setCourseCover(course.getCover());
        item.setPrice(course.getPrice());
        orderItemMapper.insert(item);

        log.info("下单成功 orderNo={}, courseId={}, amount={}", orderNo, course.getId(), course.getPrice());
        return order;
    }

    // 取消订单：待支付 -> 已取消，并回补库存。演示「状态机流转 + 事务」两个技术点
    @Transactional(rollbackFor = Exception.class)
    public Order cancelOrder(String orderNo) {
        Order order = orderMapper.selectOne(
                new LambdaQueryWrapper<Order>().eq(Order::getOrderNo, orderNo));
        if (order == null) {
            throw new BizException(ErrorCode.NOT_FOUND.getCode(), "订单不存在");
        }

        // 状态机校验：只有「待支付」能流转到「已取消」，其他状态在这里被拦住
        OrderStatus current = OrderStatus.of(order.getStatus());
        OrderStatus target = current.transitionTo(OrderStatus.CANCELLED);

        // 回补库存（取消的是单课程订单，取该订单明细里的课程 id 回补）
        OrderItem item = orderItemMapper.selectOne(
                new LambdaQueryWrapper<OrderItem>().eq(OrderItem::getOrderId, order.getId()));
        if (item != null) {
            courseMapper.restoreStock(item.getCourseId());
        }

        order.setStatus(target.getCode());
        orderMapper.updateById(order);
        return order;
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
import com.mall.order.entity.Order;
import com.mall.order.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/order")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping("/create")
    public Result<Order> create(@RequestBody CreateOrderRequest request) {
        // 这里直接返回 Order 实体方便演示；生产上一般转 VO，避免把数据库字段全暴露给前端
        return Result.ok(orderService.createOrder(request));
    }

    @PostMapping("/cancel/{orderNo}")
    public Result<Order> cancel(@PathVariable String orderNo) {
        return Result.ok(orderService.cancelOrder(orderNo));
    }
}
```

启动验证（在 `E:\course-mall\` 根目录）：

```bash
mvn clean install -DskipTests
mvn -pl mall-order spring-boot:run
```

下单（先确认 `user` 表有 userId=1，`course` 表有 courseId=1 且 stock>0）：

```bash
curl -X POST http://localhost:8082/api/order/create \
  -H "Content-Type: application/json" \
  -d "{\"userId\":1,\"courseId\":1}"
```

预期返回（`status=0` 待支付，`totalAmount` 是课程 1 的价格 199.00）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "orderNo": "20260819213045123123456123456",
    "userId": 1,
    "totalAmount": 199.00,
    "status": 0,
    "deleted": 0
  }
}
```

验证三件事：

1. **明细快照**：`SELECT * FROM order_item;` 能看到 `course_title`、`price` 已固化。
2. **库存扣减**：`SELECT stock FROM course WHERE id=1;` 比下单前少了 1。
3. **状态机 + 回补**（用返回的 orderNo 取消）：

```bash
curl -X POST http://localhost:8082/api/order/cancel/20260819213045123123456123456
```

取消后 `orders.status` 变 `2`（已取消），`course.stock` 又 +1 回去。再取消一次同一个订单 → 返回「非法状态流转: 已取消 -> 已取消」，证明状态机拦住了非法流转。

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| `@Transactional` 事务、回滚、AOP 代理 | [Spring](/learn_backend/java/基础/Spring) |
| 订单状态机（枚举 + 状态流转校验） | [Spring](/learn_backend/java/基础/Spring) |
| 原子 `UPDATE` 防超卖、InnoDB 行锁、TOCTOU | [并发编程](/learn_backend/java/Java核心/并发编程)、[MySQL](/learn_database/MySQL) |
| MyBatis-Plus `BaseMapper`、`@TableLogic`、`@MapperScan` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| `BigDecimal` 金额精度、`DECIMAL` 列 | [MySQL](/learn_database/MySQL) |
| 唯一索引 `uk_order_no` 防重复下单 | [MySQL](/learn_database/MySQL) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `course` 表 `stock` 字段加成功：是 / 否
- [ ] `mall-order` 启动成功，下单接口返回 `status=0` 的订单：是 / 否
- [ ] 下单后 `course.stock` 减 1、`order_item` 有快照：是 / 否
- [ ] 取消订单后 `status=2` 且 `stock` 回补 +1；二次取消报「非法状态流转」：是 / 否
- [ ] 踩坑记录（依赖版本、表名保留字、JSON 传参等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. `@Transactional` 底层是怎么实现「要么全成功要么全失败」的？为什么 `BizException` 抛出去会触发回滚？（提示：AOP 代理 + `RuntimeException` 默认回滚）
2. 扣库存为什么必须是 `UPDATE ... WHERE stock > 0` 一条 SQL？如果改成「先 `SELECT` 判断、再 `UPDATE`」会发生什么（并发场景）？
3. 状态机用枚举实现，比直接写 `if (status == 0)` 好在哪？「已支付」的订单想直接「取消」，你的代码会在哪一行拦住它？
4. 为什么 `order_item` 要存 `course_title` / `price` 的快照，而不是只存 `courseId` 去关联查？
5. 如果 `OrderService` 里一个 `@Transactional` 方法去调用**同类里另一个** `@Transactional` 方法，内层事务还生效吗？为什么？（提示：`this` 调用绕过了代理）
