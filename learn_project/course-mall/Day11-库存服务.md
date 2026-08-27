# Day 11 · 库存服务（扣减/回补 + 防超卖 + 乐观锁）

> **今天目标**：把 Day10 临时放在订单模块里的库存 SQL抽成 `mall-stock` 领域模块：订单内部调用原子扣减/回补，后台只开放有权限的库存查询/调整；同时用 `@Version` 学习乐观锁。

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
    CourseStock stock = courseStockMapper.selectById(courseId);  // 1. 查：stock = 1
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

- **路线 A（乐观锁）**：给表加 `version` 字段，更新时带上 `WHERE version = 旧值`，谁先把版本号 +1 谁成功，失败的重新读、重试。这是今天的**主线**。
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

`version` 就是一条记录的「版本号」。每次成功更新都把它 +1。更新语句带上 `WHERE version = 旧值`，如果期间有别人更新过（version 已经 +1 了），这条 `WHERE` 就匹配不到行 → 影响行数为 0 → 说明「我读到的数据过期了」，重试即可。

::: tip 💡 面试题：乐观锁和悲观锁的区别？各自适用场景？
**一句话**：乐观锁**不加锁**，靠版本号/CAS 在更新时校验冲突，冲突了重试，适合**读多写少、冲突概率低**（如库存、点赞数）；悲观锁**先加锁再操作**（`SELECT ... FOR UPDATE` 或 synchronized），全程阻塞别人，适合**冲突概率高、写多**的场景。乐观锁不阻塞、吞吐高，但冲突多时重试成本大。详见 [并发编程](/learn_backend/java/Java核心/并发编程)。
:::

### 步骤 2：创建 `mall-stock` 模块

**2.1 先把模块注册进父工程**。打开 `E:\course-mall\pom.xml`，在 `<modules>` 里加一行：

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-stock</module>   <!-- 新增 -->
</modules>
```

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
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <!-- MyBatis-Plus 的 Spring Boot 3 专用 starter：@Version 乐观锁插件就在这里 -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
            <version>3.5.5</version>
        </dependency>
        <!-- MySQL 驱动（版本由父工程 BOM 管理，不用写） -->
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
        <!-- 测试：并发测试要用 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
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

**2.3 启动类** `E:\course-mall\mall-stock\src\main\java\com\mall\stock\MallStockApplication.java`：

```java
package com.mall.stock;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// scanBasePackages = "com.mall"：和 Day01 一样，扫到 mall-common 里的全局异常处理器
// @MapperScan：告诉 MyBatis 去哪里找 Mapper 接口（不写的话每个接口上要单独标 @Mapper）
@SpringBootApplication(scanBasePackages = "com.mall")
@MapperScan("com.mall.stock.mapper")
public class MallStockApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallStockApplication.class, args);
    }
}
```

**2.4 配置** `E:\course-mall\mall-stock\src\main\resources\application.yml`：

```yaml
server:
  port: 8082                     # 8080 是 mall-user，库存服务用 8082

spring:
  application:
    name: mall-stock
  datasource:
    url: jdbc:mysql://localhost:3306/course_mall?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8&allowPublicKeyRetrieval=true
    username: root
    password: 你的密码             # ⚠️ 改成你自己的 MySQL root 密码
    driver-class-name: com.mysql.cj.jdbc.Driver

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true   # 下划线列名自动映射驼峰字段（create_time → createTime）
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 打印 SQL，方便看乐观锁的 WHERE version
```

### 步骤 3：实体 + Mapper

**3.1 实体** `E:\course-mall\mall-stock\src\main\java\com\mall\stock\entity\CourseStock.java`：

```java
package com.mall.stock.entity;

import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import lombok.Data;

// @TableName("course")：库存实体直接映射 Day02 的 course 表，不另建表
// 只声明和库存相关的字段即可（MyBatis-Plus 只操作这些字段，其余字段不碰）
@Data
@TableName("course")
public class CourseStock {
    @TableId
    private Long id;            // 课程ID（主键）

    private String title;       // 课程标题（查询回显用）

    private Integer stock;      // 库存数量

    // @Version：乐观锁版本号。更新时 MyBatis-Plus 会自动：
    //   SET version = version + 1   AND  WHERE version = 读到的旧值
    @Version
    private Integer version;
}
```

**3.2 Mapper** `E:\course-mall\mall-stock\src\main\java\com\mall\stock\mapper\CourseStockMapper.java`：

```java
package com.mall.stock.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.stock.entity.CourseStock;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Update;

public interface CourseStockMapper extends BaseMapper<CourseStock> {

    // 路线 B：原子扣减。一条 SQL 同时完成「判断 + 扣减」，
    // 数据库层面保证原子性，天然防超卖。返回受影响行数：1=成功，0=库存不足
    @Update("UPDATE course SET stock = stock - #{count}, version = version + 1 " +
            "WHERE id = #{courseId} AND stock >= #{count}")
    int deductStock(@Param("courseId") Long courseId, @Param("count") int count);

    // 回补库存（取消订单/退款时把库存加回去）：无条件加回，同样把 version +1
    @Update("UPDATE course SET stock = stock + #{count}, version = version + 1 " +
            "WHERE id = #{courseId}")
    int restoreStock(@Param("courseId") Long courseId, @Param("count") int count);
}
```

> `BaseMapper<CourseStock>` 继承了 `selectById` / `updateById` 等方法，这就是路线 A 乐观锁要用的。而上面两个 `@Update` 是自定义 SQL，走的是路线 B。

**3.3 乐观锁插件配置** `E:\course-mall\mall-stock\src\main\java\com\mall\stock\config\MybatisPlusConfig.java`：

```java
package com.mall.stock.config;

import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.OptimisticLockerInnerInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MybatisPlusConfig {

    // 注册乐观锁插件：不注册的话，@Version 字段不会生效，
    // updateById 就退化成了「不检查版本号」的普通更新（又会超卖）
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        return interceptor;
    }
}
```

### 步骤 4：核心 —— StockService（扣减 / 回补 + 乐观锁 + 重试）

`E:\course-mall\mall-stock\src\main\java\com\mall\stock\service\StockService.java`：

```java
package com.mall.stock.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.stock.entity.CourseStock;
import com.mall.stock.mapper.CourseStockMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor   // 生成「所有 final 字段」的构造器，替代 @Autowired 字段注入（更推荐）
public class StockService {

    private static final int MAX_RETRY = 3;   // 乐观锁冲突最多重试次数

    private final CourseStockMapper courseStockMapper;

    /**
     * 路线 A：乐观锁扣减（MyBatis-Plus @Version）+ 冲突重试
     *
     * 思路：读 → 改 → 写，写的时候带上「我读到的版本号」，
     * 如果版本号变了（别人抢先改了），updateById 返回 0，重新读最新值再试。
     */
    public void deductByOptimisticLock(Long courseId, Integer count) {
        for (int i = 1; i <= MAX_RETRY; i++) {
            CourseStock stock = courseStockMapper.selectById(courseId);
            if (stock == null) {
                throw new BizException(ErrorCode.NOT_FOUND.getCode(), "课程不存在");
            }
            if (stock.getStock() < count) {
                throw new BizException(400, "库存不足");
            }
            // 关键：这里 set 的是「读到那一刻」的库存；version 是 select 读到的旧值。
            // 调用 updateById 时，乐观锁插件会自动拼上 WHERE version = 旧值 并把 version+1
            stock.setStock(stock.getStock() - count);
            int rows = courseStockMapper.updateById(stock);
            if (rows == 1) {
                log.info("乐观锁扣减成功 courseId={} count={}", courseId, count);
                return;
            }
            // rows == 0：说明这行数据的 version 已经被别的线程改掉了 → 冲突 → 重试
            log.warn("乐观锁冲突，第 {} 次重试 courseId={}", i, courseId);
        }
        // 重试 3 次还是失败：说明并发太激烈，直接抛错让用户稍后再试（而不是无限自旋）
        throw new BizException(500, "系统繁忙，请稍后再试");
    }

    /**
     * 路线 B：原子 SQL 扣减（生产推荐）
     *
     * 把「判断库存够不够 + 扣减」合成一条 SQL，由数据库保证原子性，
     * 没有「先查再改」的窗口，也就不存在超卖。返回 0 就是库存不足。
     */
    public void deductByAtomicSql(Long courseId, Integer count) {
        int rows = courseStockMapper.deductStock(courseId, count);
        if (rows == 0) {
            throw new BizException(400, "库存不足");
        }
    }

    /** 回补库存：订单取消/退款时调用，把库存加回去 */
    public void restoreStock(Long courseId, Integer count) {
        int rows = courseStockMapper.restoreStock(courseId, count);
        if (rows == 0) {
            throw new BizException(ErrorCode.NOT_FOUND.getCode(), "课程不存在");
        }
    }
}
```

**为什么乐观锁失败要「重试」，而不是直接报错？**

乐观锁的冲突不是「业务错误」，而是「刚好和别人撞了一下」。重试就是重新读最新值、再试一次。撞车的概率通常很低，重试几次基本都能成功。但也不能无限重试（自旋会占 CPU、拖长请求），所以设上限 `MAX_RETRY = 3`，超过就抛「系统繁忙」让用户重来。

::: tip 💡 面试题：MyBatis-Plus 的 `@Version` 乐观锁底层到底做了什么？
**一句话**：`updateById` 时，乐观锁插件自动把 SQL 变成 `UPDATE ... SET version = version + 1, ... WHERE id = ? AND version = 读到的旧值`，然后看**影响行数**——等于 1 说明版本没变、更新成功；等于 0 说明版本已经被别人改了、更新失败。这就是 CAS（Compare-And-Swap）思想在数据库层的落地。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

::: tip 💡 面试题：扣库存这个场景，原子 SQL（`WHERE stock >= n`）和乐观锁哪个更好？
**一句话**：**单纯扣减**用原子 SQL 更好——一条语句、无重试、无冲突、性能最高；乐观锁更**通用**，适合「读出来后还要做复杂业务判断再写回」的场景（比如先算优惠再改多个字段）。所以生产上「扣库存」几乎都用原子 SQL，乐观锁是理解并发控制的通用底座。详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 5：Controller + 并发测试

**5.1 控制器** `E:\course-mall\mall-stock\src\main\java\com\mall\stock\controller\StockController.java`：

```java
package com.mall.stock.controller;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.stock.entity.CourseStock;
import com.mall.stock.mapper.CourseStockMapper;
import com.mall.stock.service.StockService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/stock")
@RequiredArgsConstructor
public class StockController {

    private final StockService stockService;
    private final CourseStockMapper courseStockMapper;

    /** 查库存 */
    @GetMapping("/{courseId}")
    public Result<CourseStock> query(@PathVariable Long courseId) {
        CourseStock stock = courseStockMapper.selectById(courseId);
        if (stock == null) {
            throw new BizException(ErrorCode.NOT_FOUND.getCode(), "课程不存在");
        }
        return Result.ok(stock);
    }

    /** 扣减库存（生产走原子 SQL，乐观锁版本保留在同一 Service 里方便对照） */
    @PostMapping("/deduct")
    public Result<Void> deduct(@RequestParam Long courseId,
                               @RequestParam(defaultValue = "1") Integer count) {
        stockService.deductByAtomicSql(courseId, count);
        return Result.ok();
    }

    /** 回补库存（取消订单/退款） */
    @PostMapping("/restore")
    public Result<Void> restore(@RequestParam Long courseId,
                                @RequestParam(defaultValue = "1") Integer count) {
        stockService.restoreStock(courseId, count);
        return Result.ok();
    }
}
```

**5.2 并发测试**（证明不超卖）`E:\course-mall\mall-stock\src\test\java\com\mall\stock\StockConcurrencyTest.java`：

```java
package com.mall.stock;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.mall.common.exception.BizException;
import com.mall.stock.entity.CourseStock;
import com.mall.stock.mapper.CourseStockMapper;
import com.mall.stock.service.StockService;
import lombok.extern.slf4j.Slf4j;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
        courseStockMapper.update(null, new LambdaUpdateWrapper<CourseStock>()
                .eq(CourseStock::getId, courseId)
                .set(CourseStock::getStock, initialStock));

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
                    stockService.deductByAtomicSql(courseId, 1);
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
        endGate.await();         // 等全部跑完
        pool.shutdown();

        CourseStock after = courseStockMapper.selectById(courseId);
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

在 `E:\course-mall\` 根目录执行：

```bash
mvn clean install -DskipTests        # 编译安装（把 mall-stock 一起构建）
mvn -pl mall-stock spring-boot:run   # 启动库存服务
```

手动测接口：

```bash
# 查库存（课程 1 应该显示 stock=100）
curl http://localhost:8082/api/stock/1

# 扣减 2 件
curl -X POST "http://localhost:8082/api/stock/deduct?courseId=1&count=2"

# 回补 2 件
curl -X POST "http://localhost:8082/api/stock/restore?courseId=1&count=2"
```

跑并发测试（会打印 SQL，重点观察 `WHERE ... AND stock >= ?`）：

```bash
mvn -pl mall-stock -am test -Dtest=StockConcurrencyTest
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
- [ ] `course` 表已加 `stock` / `version` 字段，3 门课库存已设为 100：是 / 否
- [ ] `mall-stock` 模块启动成功（8082），`curl /api/stock/1` 能查到库存：是 / 否
- [ ] `deduct` / `restore` 接口手动 curl 都能正常扣减/回补：是 / 否
- [ ] 并发测试跑通，输出「成功 100 次，失败 100 次，剩余库存 0」：是 / 否
- [ ] 踩坑记录（连不上库、@Version 没生效、端口冲突等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. 「先查再改」为什么会在并发下超卖？check-then-act 竞态的具体时间窗口在哪？
2. MyBatis-Plus 的 `@Version` 到底改了什么 SQL？为什么它能靠「影响行数」判断出冲突？
3. 乐观锁和悲观锁的区别？库存扣减这种场景，为什么生产上更常用 `UPDATE ... WHERE stock >= n` 而不是乐观锁？
4. 乐观锁冲突了怎么办？为什么不无限重试，而是设一个重试上限？
5. 回补库存（`stock = stock + n`）会不会有「多回补」的风险？如果同一个退款请求被重复调用两次，会发生什么？（提示：引出「幂等」概念，为 Day 12 支付回调铺路）
