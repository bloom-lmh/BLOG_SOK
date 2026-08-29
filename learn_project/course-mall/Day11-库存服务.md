# Day 11 · 库存服务（扣减/回补 + 防超卖 + 乐观锁）

> **今天目标**：把 Day10 临时放在订单模块里的库存 SQL抽成 `mall-stock` 领域模块：订单内部调用原子扣减/回补，后台只开放有权限的库存查询/调整；同时用 `@Version` 学习乐观锁。

本日项目根目录统一为 `E:\CourseMall`。库存代码位于
`mall-stock\src\main\java`；Day11 仍由 `mall-user` 启动。

## 一、前置条件

- 已完成 **Day 01**（Maven 多模块骨架：`Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler` 都在 `mall-common`）
- 已完成 **Day 02**（17 张表已建好，`course.stock/version` 已存在）
- **MySQL 已启动**，能连上 `course_mall` 库
- Day10 下单已经使用 `UPDATE ... WHERE stock > 0` 防超卖；今天做的是**职责拆分、批量数量校验、乐观锁管理和并发验证**

## 二、今天完成后你会得到什么

1. 一个普通 jar 模块 `mall-stock`，由 `mall-user` 加载
2. 订单模块通过 Java 方法调用库存能力，同享本地事务
3. 后台接口：查库存 / 按版本调整库存（分别受 `stock:view`、`stock:adjust` 保护）
4. 一个**并发测试**：200 个线程同时抢 100 件库存，最后库存恰好是 0、成功恰好 100 次（证明不超卖）

## 三、先搞懂：为什么会「超卖」？

超卖的本质是一个经典的并发问题——**check-then-act（先检查再操作）的竞态**。先看 Day 10 那种「朴素写法」为什么不行：

```java
// ❌ 反例：会超卖，不要这么写
public void deductNaive(Long courseId, Integer count) {
    Course stock = courseStockMapper.selectById(courseId);       // 1. 查：stock = 1
    if (stock.getStock() < count) {
        throw new BizException(ErrorCode.STOCK_INSUFFICIENT);
    }
    stock.setStock(stock.getStock() - count);                    // 2. 改：stock = 0
    courseStockMapper.updateById(stock);                         // 3. 写回
}
```

问题出在：**第 1 步「查」和第 2 步「改」之间，别的线程可以插进来**。

- 线程 A 读到 `stock = 1`，通过检查
- 线程 B 也读到 `stock = 1`，也通过检查
- A 扣成 0，B 也扣成 0 → 实际只卖出 1 件，但两个人都「扣减成功」了，甚至库存被扣成负数

::: tip 💡 面试题：为什么「先查再改」会超卖？
**一句话**：`select` 和 `update` 是两个独立语句，中间有时间窗口，多线程会同时读到同一个「旧值」再各自写回，导致「检查通过了，但真正写的时候库存已经变了」。本质是 check-then-act 竞态（TOCTOU）。详见 [并发编程](/learn_backend/java/Java核心/并发编程)。
:::

解决思路有两条路，今天两条都给你，最后对比：

- **路线 A（乐观锁）**：更新时带上 `WHERE version = 旧值`，影响 0 行说明发生冲突；调用方根据业务决定刷新、报冲突或有限重试。
- **路线 B（原子 SQL）**：把「检查 + 扣减」合成一条 `UPDATE ... WHERE stock >= count`，交给数据库原子执行。是生产上扣库存最常用的做法。

## 四、步骤

### 步骤 1：核对 `stock` + `version` 字段

Day02 已把库存和版本号放进 `course`。只在旧数据库缺列时执行一次 Day10 的迁移，不要在 Day10、Day11 重复 `ALTER`。

> 如果你 Day 02 的 `schema.sql` 还没执行，直接把下面两列加进 `CREATE TABLE course` 的定义里；如果已经建好表了，执行 `ALTER`：

```sql
SHOW COLUMNS FROM course LIKE 'stock';
SHOW COLUMNS FROM course LIKE 'version';
UPDATE course SET stock = 100, version = 0 WHERE id = 1;
```

**为什么 `version` 能当乐观锁？**

`version` 就是一条记录的版本号。每次成功更新都把它 +1；若期间有人先更新，旧版本条件匹配不到，影响行数为 0。检测到冲突不代表一定自动重试：绝对值覆盖应让用户刷新，可安全重放的增量操作才考虑有限重试。

::: tip 💡 面试题：乐观锁和悲观锁的区别？各自适用场景？
**一句话**：乐观锁**不加锁**，靠版本号/CAS 在更新时校验冲突，冲突了重试，适合**读多写少、冲突概率低**（如库存、点赞数）；悲观锁**先加锁再操作**（`SELECT ... FOR UPDATE` 或 synchronized），全程阻塞别人，适合**冲突概率高、写多**的场景。乐观锁不阻塞、吞吐高，但冲突多时重试成本大。详见 [并发编程](/learn_backend/java/Java核心/并发编程)。
:::

### 步骤 2：创建 `mall-stock` 模块

**2.1 注册模块与依赖关系**。父工程 `<modules>` 加入：

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-course</module>
    <module>mall-order</module>
    <module>mall-stock</module>   <!-- 新增 -->
</modules>
```

父工程 `dependencyManagement` 增加 `mall-stock`，`mall-user` 增加对它的依赖。Day11 完成后再让 `mall-order` 依赖 `mall-stock`，并删除 Day10 临时的 `com.mall.order.mapper.CourseStockMapper`：

```xml
<!-- 父工程 dependencyManagement -->
<dependency>
    <groupId>com.mall</groupId>
    <artifactId>mall-stock</artifactId>
    <version>${project.version}</version>
</dependency>

<!-- mall-user/pom.xml 与 mall-order/pom.xml -->
<dependency>
    <groupId>com.mall</groupId>
    <artifactId>mall-stock</artifactId>
</dependency>
```

最终依赖方向是 `mall-user → mall-order → mall-stock → mall-course → mall-common`，不能反向依赖。

**2.2 新建 `mall-stock/pom.xml`**：

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

    <artifactId>mall-stock</artifactId>

    <dependencies>
        <!-- 复用 Day01 的 Result / ErrorCode / GlobalExceptionHandler -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
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
        <!-- MyBatis-Plus 的 Spring Boot 3 专用 starter：@Version 乐观锁插件就在这里 -->
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

`mall-stock` 是普通 jar，没有启动类、数据库驱动、独立 `application.yml` 和 Boot 打包插件。修改唯一启动类：

```java
@MapperScan({
        "com.mall.user.mapper",
        "com.mall.course.mapper",
        "com.mall.order.mapper",
        "com.mall.stock.mapper"
})
```

### 步骤 3：实体 + Mapper

**3.1 复用课程 Entity**

同一个应用里不要为 `course` 表再复制 `CourseStock` Entity。在 Day06 的 `Course.version` 上添加 `@Version`：

```java
@Version
private Integer version;
```

`Course` 已有 `id/title/stock/version/deletedAt`，库存模块直接复用。

**3.2 Mapper** `E:\CourseMall\mall-stock\src\main\java\com\mall\stock\mapper\CourseStockMapper.java`：

```java
package com.mall.stock.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Course;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface CourseStockMapper extends BaseMapper<Course> {

    // 路线 B：原子扣减。一条 SQL 同时完成「判断 + 扣减」，
    // 数据库层面保证原子性，天然防超卖。返回受影响行数：1=成功，0=库存不足
    @Update("""
            UPDATE course
            SET stock = stock - #{count}, version = version + 1
            WHERE id = #{courseId}
              AND stock >= #{count}
              AND status = 1
              AND deleted_at IS NULL
            """)
    int deductStock(@Param("courseId") Long courseId, @Param("count") int count);

    // 回补库存（取消订单/退款时把库存加回去）：无条件加回，同样把 version +1
    @Update("""
            UPDATE course
            SET stock = stock + #{count}, version = version + 1
            WHERE id = #{courseId} AND deleted_at IS NULL
            """)
    int restoreStock(@Param("courseId") Long courseId, @Param("count") int count);
}
```

> `BaseMapper<Course>` 的 `updateById` 用来演示路线 A；两个自定义 `@Update` 是订单链路使用的路线 B。

**3.3 在 Day06 的同一个 MP 拦截器中加入乐观锁**

```java
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;

@Bean
public MybatisPlusInterceptor mybatisPlusInterceptor() {
    MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
    interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
    interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
    return interceptor;
}
```

不要再声明第二个 `MybatisPlusInterceptor` Bean；分页、乐观锁等内部插件按顺序放进同一个拦截器。

### 步骤 4：核心 —— StockService（原子扣减 / 回补 + 乐观锁调整）

先补充库存版本冲突错误码：

```java
// ErrorCode
STOCK_VERSION_CONFLICT(409206, MessageKeys.Course.STOCK_VERSION_CONFLICT),

// MessageKeys.Course + 三份 messages*.properties
public static final String STOCK_VERSION_CONFLICT = "course.stock-version-conflict";
course.stock-version-conflict=库存已被其他操作修改，请刷新后重试
```

建立后台调整 DTO 与返回 VO：

```java
package com.mall.stock.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record StockAdjustDTO(
        @NotNull(message = "{common.param-error}")
        @Min(value = 0, message = "{common.param-error}") Integer stock,
        @NotNull(message = "{common.param-error}")
        @Min(value = 0, message = "{common.param-error}") Integer version) {
}
```

```java
package com.mall.stock.vo;

public record StockVO(Long courseId, String title, Integer stock, Integer version) {
}
```

`E:\CourseMall\mall-stock\src\main\java\com\mall\stock\service\StockService.java`：

```java
package com.mall.stock.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.course.entity.Course;
import com.mall.stock.dto.StockAdjustDTO;
import com.mall.stock.mapper.CourseStockMapper;
import com.mall.stock.vo.StockVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor   // 生成「所有 final 字段」的构造器，替代 @Autowired 字段注入（更推荐）
public class StockService {

    private final CourseStockMapper courseStockMapper;

    public StockVO query(Long courseId) {
        Course course = requireCourse(courseId);
        return toVO(course);
    }

    /** 订单内部调用：原子判断并扣减，不开放成任意用户可调用的 HTTP 接口。 */
    public void deduct(Long courseId, int count) {
        validateCount(count);
        int rows = courseStockMapper.deductStock(courseId, count);
        if (rows == 0) {
            throw new BizException(ErrorCode.STOCK_INSUFFICIENT);
        }
    }

    /** 订单取消/退款内部调用；幂等性由订单状态原子流转保证。 */
    public void restore(Long courseId, int count) {
        validateCount(count);
        int rows = courseStockMapper.restoreStock(courseId, count);
        if (rows == 0) {
            throw new BizException(ErrorCode.COURSE_NOT_FOUND, courseId);
        }
    }

    /** 后台绝对值调整：使用客户端读到的 version 做并发冲突检测。 */
    public StockVO adjust(Long courseId, StockAdjustDTO dto) {
        Course course = requireCourse(courseId);
        if (!dto.version().equals(course.getVersion())) {
            throw new BizException(ErrorCode.STOCK_VERSION_CONFLICT);
        }
        course.setStock(dto.stock());
        if (courseStockMapper.updateById(course) == 0) {
            throw new BizException(ErrorCode.STOCK_VERSION_CONFLICT);
        }
        return toVO(course);
    }

    private Course requireCourse(Long courseId) {
        Course course = courseStockMapper.selectById(courseId);
        if (course == null) {
            throw new BizException(ErrorCode.COURSE_NOT_FOUND, courseId);
        }
        return course;
    }

    private void validateCount(int count) {
        if (count <= 0) {
            throw new BizException(ErrorCode.PARAM_ERROR);
        }
    }

    private StockVO toVO(Course course) {
        return new StockVO(course.getId(), course.getTitle(),
                course.getStock(), course.getVersion());
    }
}
```

后台“把库存设为 80”属于**绝对值修改**，发生版本冲突时不能自动重试，否则可能覆盖别人刚设置的新值；正确做法是返回 409，让前端刷新后由用户重新决定。只有“库存 +1”这类可安全重放的交换式操作才适合自动重试。

::: tip 💡 面试题：MyBatis-Plus 的 `@Version` 乐观锁底层到底做了什么？
**一句话**：`updateById` 时，乐观锁插件自动把 SQL 变成 `UPDATE ... SET version = version + 1, ... WHERE id = ? AND version = 读到的旧值`，然后看**影响行数**——等于 1 说明版本没变、更新成功；等于 0 说明版本已经被别人改了、更新失败。这就是 CAS（Compare-And-Swap）思想在数据库层的落地。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

::: tip 💡 面试题：扣库存这个场景，原子 SQL（`WHERE stock >= n`）和乐观锁哪个更好？
**一句话**：**单纯扣减**用原子 SQL 更好——一条语句、无重试、无冲突、性能最高；乐观锁更**通用**，适合「读出来后还要做复杂业务判断再写回」的场景（比如先算优惠再改多个字段）。所以生产上「扣库存」几乎都用原子 SQL，乐观锁是理解并发控制的通用底座。详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 5：Controller + 并发测试

**5.1 后台控制器** `E:\CourseMall\mall-stock\src\main\java\com\mall\stock\controller\StockAdminController.java`：

```java
package com.mall.stock.controller;

import com.mall.common.result.Result;
import com.mall.stock.dto.StockAdjustDTO;
import com.mall.stock.service.StockService;
import com.mall.stock.vo.StockVO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/stocks")
public class StockAdminController {

    private final StockService stockService;

    @PreAuthorize("hasAuthority('stock:view')")
    @GetMapping("/{courseId}")
    public Result<StockVO> query(
            @Positive(message = "{common.id-required}") @PathVariable Long courseId) {
        return Result.ok(stockService.query(courseId));
    }

    @PreAuthorize("hasAuthority('stock:adjust')")
    @PutMapping("/{courseId}")
    public Result<StockVO> adjust(
            @Positive(message = "{common.id-required}") @PathVariable Long courseId,
            @Valid @RequestBody StockAdjustDTO dto) {
        return Result.ok(stockService.adjust(courseId, dto));
    }
}
```

扣减/回补没有 HTTP 入口，因为它们只能由下单、取消、退款等业务流程调用。Day11 完成后修改 Day10 `OrderService`：

```java
private final com.mall.course.mapper.CourseMapper courseMapper; // 查询课程与快照
private final StockService stockService;

// 下单
stockService.deduct(course.getId(), 1);

// 取消成功后
stockService.restore(item.getCourseId(), 1);
```

删除 Day10 临时的 `com.mall.order.mapper.CourseStockMapper`。由于所有模块仍在同一应用、同一数据源中，订单方法外层的 `@Transactional` 仍会同时回滚订单、明细和库存。

**5.2 并发测试**放在启动模块：`E:\CourseMall\mall-user\src\test\java\com\mall\stock\StockConcurrencyTest.java`。这样 `@SpringBootTest` 能找到唯一的 `MallUserApplication`：

```java
package com.mall.stock;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mall.common.exception.BizException;
import com.mall.course.entity.Course;
import com.mall.stock.mapper.CourseStockMapper;
import com.mall.stock.service.StockService;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest
@Slf4j
class StockConcurrencyTest {

    @Autowired
    private StockService stockService;
    @Autowired
    private CourseStockMapper courseStockMapper;

    @Test
    void deductConcurrently_shouldNotOversell() throws InterruptedException {
        Long courseId = 1L;
        int initialStock = 100;   // 库存 100
        int buyers = 200;         // 200 个线程同时抢

        // 重置库存，保证测试可重复执行
        courseStockMapper.update(null, new LambdaUpdateWrapper<Course>()
                .eq(Course::getId, courseId)
                .set(Course::getStock, initialStock));

        ExecutorService pool = Executors.newFixedThreadPool(50);
        // CountDownLatch：让 200 个线程「同时起跑」，制造真正的并发
        CountDownLatch startGate = new CountDownLatch(1);
        CountDownLatch endGate = new CountDownLatch(buyers);
        AtomicInteger success = new AtomicInteger(0);
        AtomicInteger fail = new AtomicInteger(0);

        for (int i = 0; i < buyers; i++) {
            pool.execute(() -> {
                try {
                    startGate.await();          // 等枪响
                    stockService.deduct(courseId, 1);
                    success.incrementAndGet();
                } catch (BizException e) {
                    fail.incrementAndGet();     // 库存不足，扣减失败（这是预期的）
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    endGate.countDown();
                }
            });
        }

        startGate.countDown();   // 枪响，200 个线程同时抢
        boolean finished = endGate.await(30, TimeUnit.SECONDS);
        pool.shutdownNow();
        assertTrue(finished, "并发任务 30 秒内未完成");

        Course after = courseStockMapper.selectById(courseId);
        log.info("成功 {} 次，失败 {} 次，剩余库存 {}", success.get(), fail.get(), after.getStock());

        // 核心断言：库存不能是负数；成功次数 = 库存量；失败次数 = 多出来的请求数
        assertEquals(initialStock, success.get());
        assertEquals(buyers - initialStock, fail.get());
        assertEquals(0, after.getStock());
    }
}
```

**这段测试为什么能「证明不超卖」？**

- 100 件库存、200 个人抢，如果没有并发保护，`success` 会 > 100（甚至库存被扣成负数）。
- 用原子 SQL 后，只有「库存还够」的那 100 次 `UPDATE` 能成功（`WHERE stock >= 1`），剩下 100 次匹配不到行 → 抛「库存不足」→ `fail` 计数。
- 所以断言 `success == 100`、`fail == 100`、`剩余库存 == 0` 三条全满足，才说明防超卖成立。

### 步骤 6：启动验证

在 `E:\CourseMall\` 根目录执行：

```bash
mvn clean verify -DskipTests
mvn -pl mall-user -am spring-boot:run
```

手动测接口：

```bash
# 查库存（需要 stock:view）
curl http://localhost:8080/api/admin/stocks/1 \
  -H "Authorization: Bearer 你的ADMIN_TOKEN"

# 用上一步返回的 version 调整库存；旧 version 重复提交应返回 409206
curl -X PUT http://localhost:8080/api/admin/stocks/1 \
  -H "Authorization: Bearer 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stock":80,"version":0}'
```

跑并发测试（会打印 SQL，重点观察 `WHERE ... AND stock >= ?`）：

```bash
mvn -pl mall-user -am test -Dtest=StockConcurrencyTest
```

预期测试输出：`成功 100 次，失败 100 次，剩余库存 0`，测试绿条通过。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| 乐观锁 / 悲观锁 / CAS / check-then-act 竞态 | [并发编程](/learn_backend/java/Java核心/并发编程) |
| MyBatis-Plus `@Version` 乐观锁插件 | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| 自定义 `@Update` 原子 SQL | [MyBatis](/learn_backend/java/基础/MyBatis) |
| `WHERE stock >= n` 原子扣减、行锁 | [MySQL](/learn_database/MySQL) |
| 事务、多线程并发安全 | [Spring](/learn_backend/java/基础/Spring) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `course` 表已有 `stock` / `version` 字段：是 / 否
- [ ] 只启动 `mall-user`，ADMIN 能查询和调整库存：是 / 否
- [ ] 普通用户访问库存后台接口返回 403：是 / 否
- [ ] 使用旧 version 重复调整返回 `STOCK_VERSION_CONFLICT`：是 / 否
- [ ] Day10 下单/取消改为调用 `StockService`，原临时 Mapper 已删除：是 / 否
- [ ] 并发测试跑通，输出「成功 100 次，失败 100 次，剩余库存 0」：是 / 否
- [ ] 踩坑记录（连不上库、@Version 没生效、端口冲突等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. 「先查再改」为什么会在并发下超卖？check-then-act 竞态的具体时间窗口在哪？
2. MyBatis-Plus 的 `@Version` 到底改了什么 SQL？为什么它能靠「影响行数」判断出冲突？
3. 乐观锁和悲观锁的区别？库存扣减这种场景，为什么生产上更常用 `UPDATE ... WHERE stock >= n` 而不是乐观锁？
4. 后台把库存“设为 80”发生版本冲突时，为什么不能自动重试并覆盖？哪些操作适合自动重试？
5. `stock = stock + n` 本身不幂等，为什么 Day10 的二次取消不会重复回补？幂等边界应该放在哪一层？
