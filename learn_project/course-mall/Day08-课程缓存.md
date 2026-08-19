# Day 08 · 课程缓存（穿透 / 击穿 / 雪崩 + 一致性）

> **今天目标**：给「课程详情查询」加 Redis 缓存，把缓存三大经典问题——**穿透、击穿、雪崩**——以及**缓存与数据库的一致性**一次解决。这套写法是面试必考，也是秒杀（Day 19/20）的前置技能。

## 一、前置条件

- 已完成 **Day 02**：`course` 表已建，种子数据（course id=1/2/3，`status=1`）已插入
- 已完成 **Day 06**：`mall-course` 模块已建，MyBatis-Plus 已配好，`Course` 实体 + `CourseMapper` 已建，课程 CRUD 能跑通
- **Redis 已装**（`localhost:6379`，Day 5 存验证码时应该已经连过）
- 假设 Day 6 的课程服务在 **`mall-course` 模块**（包 `com.mall.course`）。如果你当时建在了别的模块，把模块名/包名替换成你自己的即可。

> ⚠️ 本文代码只在 Day 6 基础上**新增缓存**，不重做 CRUD。如果你 Day 6 还没做完，先回去补完再进本天。

## 二、先搞懂：缓存解决了什么，又带来了什么

课程详情是典型的「读多写少」：用户疯狂刷课程页，但课程信息很少改。每次都查 MySQL，DB 压力大、响应慢。所以把课程详情缓存到 Redis。

但缓存不是「加上就完事」，它会引出三个经典问题：

| 问题 | 一句话定义 | 触发场景 | 本天解法 |
|---|---|---|---|
| **缓存穿透** | 查一个**数据库里根本不存在**的数据，缓存里也不会有，每次都穿透到 DB | 恶意请求不存在的 id、爬虫乱试 | 空值缓存（+ 布隆过滤器可选） |
| **缓存击穿** | 一个**热点 key** 过期瞬间，大量并发同时回源打 DB | 热门课程缓存刚好过期那一刻 | 互斥锁：同一时刻只放一个线程回源 |
| **缓存雪崩** | **大量 key 同一时刻集中过期**，DB 压力瞬间暴涨 | 缓存批量写、过期时间都设一样 | 过期时间加随机值（+ 预热/多级缓存） |

三个词长得像、场景完全不同，是面试高频送命题。下面边写边解决。

## 三、步骤

### 步骤 1：给 `mall-course` 加 Redis 依赖

打开 `E:\course-mall\mall-course\pom.xml`，在 `<dependencies>` 里**新增**下面这一条（其余 Day 6 已加，这里贴全方便对照）：

```xml
<dependencies>
    <!-- 依赖自己的公共模块 -->
    <dependency>
        <groupId>com.mall</groupId>
        <artifactId>mall-common</artifactId>
    </dependency>

    <!-- web：提供 HTTP 接口 -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>

    <!-- MyBatis-Plus（Day 6 已加）：注意是 boot3 专属 starter，别导成 mybatis-plus-boot-starter -->
    <dependency>
        <groupId>com.baomidou</groupId>
        <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
        <version>3.5.7</version>
    </dependency>

    <!-- MySQL 驱动（Day 6 已加）：版本由 Spring Boot 父工程锁定，不写 -->
    <dependency>
        <groupId>com.mysql</groupId>
        <artifactId>mysql-connector-j</artifactId>
        <scope>runtime</scope>
    </dependency>

    <!-- ===== 今天新增：Redis =====
         Spring Boot 3 的 Redis 启动器，自动配置 RedisTemplate / StringRedisTemplate -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-redis</artifactId>
    </dependency>
</dependencies>
```

### 步骤 2：配置 `application.yml`

`E:\course-mall\mall-course\src\main\resources\application.yml`：

```yaml
server:
  port: 8081               # mall-user 用了 8080，课程服务用 8081

spring:
  application:
    name: mall-course
  datasource:
    url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false
    username: root
    password: 你的密码        # 改成你自己的
    driver-class-name: com.mysql.cj.jdbc.Driver
  data:
    redis:
      host: localhost
      port: 6379
      # password: 有密码就填
      database: 0            # 用 0 号库（验证码/课程缓存先放一起，Day19 会按用途分库）

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true   # 下划线转驼峰：teacher_id → teacherId
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl  # 打印 SQL，方便看「到底有没有打到 DB」
  global-config:
    db-config:
      logic-delete-field: deleted        # 逻辑删除字段
      logic-delete-value: 1
      logic-not-delete-value: 0
```

::: tip 💡 面试题：Spring Boot 3 里 Redis 的配置前缀为什么是 `spring.data.redis` 而不是 `spring.redis`？
**一句话**：Spring Boot 2.x 用 `spring.redis.*`，**3.x 统一改成了 `spring.data.redis.*`**（和 `spring.data.mongodb` 等数据源前缀对齐）。很多老教程还是 `spring.redis`，照抄到 3.x 项目里会**静默失效**（连的还是默认 localhost）。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

### 步骤 3：`Course` 实体 + `CourseMapper`（Day 6 已建，贴出来对照）

这两样 Day 6 已经建好，这里贴出来是为了确认字段和表结构对得上（复用 Day 2 的 `course` 表，**不要另建表**）。

`com/mall/course/entity/Course.java`：

```java
package com.mall.course.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("course")   // 对应 Day 2 的 course 表，字段一一对应
public class Course {
    @TableId(type = IdType.AUTO)   // 主键自增
    private Long id;
    private Long teacherId;
    private Long categoryId;
    private String title;
    private String cover;
    private BigDecimal price;        // 金额用 BigDecimal，Day 2 已强调
    private BigDecimal originalPrice;
    private String description;
    private Integer status;          // 1上架 0下架
    private Integer viewCount;
    private Integer buyCount;
    @TableLogic                      // 逻辑删除：select 自动拼 deleted=0
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
```

`com/mall/course/mapper/CourseMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Course;
import org.apache.ibatis.annotations.Mapper;

// 继承 BaseMapper 后，selectById/updateById 等 CRUD 方法自带，不用写 SQL
@Mapper
public interface CourseMapper extends BaseMapper<Course> {
}
```

### 步骤 4：序列化方案 —— 为什么用 `StringRedisTemplate` + Jackson

缓存里存的是 `Course` 对象，Redis 只能存字节，所以要有序列化方案。这里选 `StringRedisTemplate`（value 都是 String）+ Jackson 手动转 JSON，而不是 `RedisTemplate<String,Object>` 默认配置。

```java
// 直接注入 Spring Boot 自动配置好的两个 bean，无需额外写 RedisConfig
@Resource
private StringRedisTemplate redisTemplate;   // key/value 都是 String
@Resource
private ObjectMapper objectMapper;           // Boot 自动配置的 Jackson，已支持 LocalDateTime/BigDecimal
```

::: tip 💡 面试题：为什么不直接用 `RedisTemplate` 的默认序列化？
**一句话**：`RedisTemplate` 默认用 **JDK 序列化**（`JdkSerializationRedisSerializer`），存进去是一堆 `\xAC\xED` 二进制——**人看不懂、体积大、要求类实现 Serializable、别的语言读不了**。所以生产上要么配成 JSON 序列化，要么像这里直接 `StringRedisTemplate` + Jackson 手动转。详见 [Redis](/learn_database/Redis)。
:::

### 步骤 5：核心 —— `CourseCacheService`（穿透/击穿/雪崩都在这）

新建 `E:\course-mall\mall-course\src\main\java\com\mall\course\service\CourseCacheService.java`。这是今天的心脏，逐段解释：

```java
package com.mall.course.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.course.entity.Course;
import com.mall.course.mapper.CourseMapper;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

@Slf4j
@Service
public class CourseCacheService {

    private static final String CACHE_PREFIX = "course:detail:";      // 缓存 key 前缀，区分用途
    private static final String LOCK_PREFIX  = "course:lock:";        // 互斥锁 key 前缀
    private static final long   CACHE_TTL_MINUTES      = 30;          // 正常缓存过期时间（分钟）
    private static final long   CACHE_NULL_TTL_SECONDS = 60;          // 空值缓存过期时间（秒，要短）
    private static final String NULL_MARK = "NULL";                   // 空值占位标记

    @Resource
    private CourseMapper courseMapper;
    @Resource
    private StringRedisTemplate redisTemplate;
    @Resource
    private ObjectMapper objectMapper;

    /**
     * 查询课程详情（带缓存，穿透/击穿/雪崩三管齐下）
     */
    public Course getCourseById(Long id) {
        return getCourseById(id, 0);
    }

    private Course getCourseById(Long id, int retryCount) {
        String key = CACHE_PREFIX + id;

        // ── 第 1 步：先查缓存 ──
        String json = redisTemplate.opsForValue().get(key);
        if (json != null) {
            // 命中「空值缓存」：说明 DB 里根本没这 id，直接返回 null，别再打 DB（防穿透）
            return NULL_MARK.equals(json) ? null : readJson(json, Course.class);
        }

        // ── 第 2 步：缓存未命中，尝试加互斥锁（防击穿）──
        String lockKey = LOCK_PREFIX + id;
        if (!tryLock(lockKey)) {
            // 没抢到锁 = 别的线程正在回源重建缓存
            if (retryCount >= 3) {
                // 重试 3 次仍拿不到：降级直接查库，避免请求无限堆积
                log.warn("获取缓存锁失败，降级直查 DB，courseId={}", id);
                return courseMapper.selectById(id);
            }
            sleep(50);                       // 等 50ms，让抢到锁的线程先把缓存建好
            return getCourseById(id, retryCount + 1);
        }

        try {
            // ── 第 3 步：抢到锁后 double-check ──
            // 防止「上一把锁的持有者刚建好缓存释放锁，下一批线程又进来重复回源」
            json = redisTemplate.opsForValue().get(key);
            if (json != null) {
                return NULL_MARK.equals(json) ? null : readJson(json, Course.class);
            }

            // ── 第 4 步：查数据库 ──
            Course course = courseMapper.selectById(id);
            if (course == null) {
                // 穿透：DB 里没有 → 缓存一个空值标记，过期时间设短（60s）
                // 这样 60s 内恶意请求都打在 Redis 上，不再穿透到 DB
                redisTemplate.opsForValue().set(key, NULL_MARK, CACHE_NULL_TTL_SECONDS, TimeUnit.SECONDS);
                return null;
            }

            // ── 第 5 步：回写缓存，过期时间加随机值（防雪崩）──
            // 30~39 分钟随机：避免大量 key 在同一分钟集体过期、请求瞬间全砸向 DB
            long ttlMinutes = CACHE_TTL_MINUTES + ThreadLocalRandom.current().nextInt(10);
            redisTemplate.opsForValue().set(key, writeJson(course), ttlMinutes, TimeUnit.MINUTES);
            return course;
        } finally {
            releaseLock(lockKey);   // 无论成功失败，都要释放锁，否则别的线程会一直等
        }
    }

    /**
     * 加互斥锁：SETNX（setIfAbsent）只有 key 不存在时才设置成功，
     * 天然原子，保证并发下只有一个线程拿到锁。带 10s 过期，防止线程崩溃锁永远不释放。
     */
    private boolean tryLock(String lockKey) {
        return Boolean.TRUE.equals(
                redisTemplate.opsForValue().setIfAbsent(lockKey, "1", 10, TimeUnit.SECONDS));
    }

    private void releaseLock(String lockKey) {
        redisTemplate.delete(lockKey);
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();   // 恢复中断标记，不吞异常
        }
    }

    private String writeJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "对象序列化失败");
        }
    }

    private <T> T readJson(String json, Class<T> clazz) {
        try {
            return objectMapper.readValue(json, clazz);
        } catch (JsonProcessingException e) {
            throw new BizException(ErrorCode.SYSTEM_ERROR.getCode(), "缓存反序列化失败");
        }
    }
}
```

::: tip 💡 面试题：`setIfAbsent`（SETNX）为什么能保证并发下只有一个线程回源？
**一句话**：SETNX 是 Redis 的**原子命令**——「key 不存在才 set，存在就返回失败」，中间不可能被别的线程插进来。所以并发下多个线程同时 `setIfAbsent(lockKey)`，**只有第一个返回 true**，其余都返回 false 走重试/降级。详见 [Redis](/learn_database/Redis)。
:::

::: tip 💡 面试题：空值缓存能防穿透，那「空值」的过期时间为什么必须设短？
**一句话**：空值缓存本质是把「这个 id 不存在」这个结论临时存起来，如果设太长，一旦该数据**后来真的被创建了**（比如运营新增了 id=999 的课程），前台会一直拿到「不存在」的旧结论。设短（60s）就是「防住瞬时穿透」和「及时纠正」之间的平衡。布隆过滤器是另一种方案（见文末追问）。
:::

### 步骤 6：一致性 —— 更新时删缓存 + 延迟双删

缓存和 DB 的数据可能不一致，核心就一条：**先改数据库，再删缓存**（Cache Aside 模式），再加「延迟双删」兜底。

在 `CourseCacheService` 里继续加：

```java
    /**
     * 更新课程：保证缓存和数据库一致
     */
    @Transactional   // 改库要加事务（Day 10 会细讲事务）
    public void updateCourse(Course course) {
        // 1. 先改数据库
        courseMapper.updateById(course);

        // 2. 再删缓存（顺序不能反，见下面面试题）
        deleteCache(course.getId());

        // 3. 延迟双删：500ms 后再删一次，兜底并发窗口里「旧值被读线程写回缓存」
        //    生产上要用专门线程池异步做，这里用 CompletableFuture 演示
        CompletableFuture.runAsync(() -> {
            sleep(500);
            deleteCache(course.getId());
        });
    }

    private void deleteCache(Long id) {
        redisTemplate.delete(CACHE_PREFIX + id);
    }
```

::: tip 💡 面试题：为什么「先改数据库、再删缓存」，顺序不能反？
**一句话**：如果**先删缓存再改库**，删完到改库成功之间有个窗口，这窗口里来的读请求会查到**旧库值**并把它写回缓存 → 脏数据。反过来「先改库再删缓存」窗口小得多，而且即使删缓存失败，最坏结果是缓存旧到自然过期，还能靠 TTL 兜底。所以主流是 **Cache Aside：读按需缓存、写先更库后删缓存**。详见 [Redis](/learn_database/Redis)。
:::

::: tip 💡 面试题：「延迟双删」到底在删什么？为什么删两次？
**一句话**：极端并发下「先更库后删缓存」也有极小窗口——线程 A 读到旧库值 → 线程 B 更库删缓存 → 线程 A 把旧值写回缓存，脏数据就出现了。**延迟双删**在更库删缓存之后，再**延迟一小段时间删第二次**，把这种「旧值写回」的脏数据再清掉一次。彻底解决靠 **Canal 监听 binlog** 异步刷缓存（Day 26）。
:::

### 步骤 7：Controller + 启动验证

新建 `E:\course-mall\mall-course\src\main\java\com\mall\course\controller\CourseController.java`：

```java
package com.mall.course.controller;

import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.course.entity.Course;
import com.mall.course.service.CourseCacheService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/course")
public class CourseController {

    @Autowired
    private CourseCacheService courseCacheService;

    // 查详情：走缓存（穿透/击穿/雪崩都在这条链路里处理）
    @GetMapping("/{id}")
    public Result<Course> getById(@PathVariable Long id) {
        Course course = courseCacheService.getCourseById(id);
        if (course == null) {
            return Result.fail(ErrorCode.NOT_FOUND.getCode(), ErrorCode.NOT_FOUND.getMessage());
        }
        return Result.ok(course);
    }

    // 更新课程：更库后删缓存，保证一致性
    @PutMapping("/{id}")
    public Result<Void> update(@PathVariable Long id, @RequestBody Course course) {
        course.setId(id);   // 用路径里的 id 覆盖，防止被请求体篡改
        courseCacheService.updateCourse(course);
        return Result.ok();
    }
}
```

> 前台「是否上架（status=1）」的判断 Day 6 已经处理，这里聚焦缓存，不重复。

**启动验证**（在 `E:\course-mall\` 根目录）：

```bash
mvn clean install -DskipTests
mvn -pl mall-course spring-boot:run
```

```bash
# 1. 正常查询（种子数据 id=1 存在）
curl http://localhost:8081/api/course/1

# 2. 穿透验证：查一个不存在的 id=99999
curl http://localhost:8081/api/course/99999
#    返回 404，然后用 redis-cli 看：空值标记已经缓存了
redis-cli get course:detail:99999
#    → 返回 "NULL"（说明没穿透到 DB）
```

```bash
# 3. 看缓存是否写入 + 过期时间是否随机（雪崩验证）
redis-cli keys "course:detail:*"
redis-cli ttl course:detail:1    # 应该在 1800~2340 秒之间（30~39分钟随机）
```

**击穿验证**（手动比较难复现，用并发压测看 SQL 日志）：

```bash
# 先删掉 key 模拟「过期」，再开多个并发同时查同一个 id
redis-cli del course:detail:1
# 用 ab / JMeter 并发打 curl http://localhost:8081/api/course/1
# 看控制台 SQL 日志：只有一条 SELECT ... FROM course WHERE id=1，其余请求都等锁后命中缓存
```

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| Redis 缓存穿透/击穿/雪崩、SETNX、TTL | [Redis](/learn_database/Redis) |
| StringRedisTemplate、序列化、Jackson | [Redis](/learn_database/Redis) |
| MyBatis-Plus `BaseMapper`、逻辑删除 | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| `@Transactional` 事务、延迟双删 | [Spring](/learn_backend/java/基础/Spring) |
| `CompletableFuture` 异步 | [并发编程](/learn_backend/java/Java核心/并发编程) |
| 缓存一致性、Cache Aside 模式 | [分布式基础](/learn_backend/java/微服务/分布式基础) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-course` 启动成功，`curl /api/course/1` 返回课程 JSON：是 / 否
- [ ] `redis-cli keys "course:detail:*"` 能看到缓存 key：是 / 否
- [ ] 查不存在的 id，`course:detail:99999` 缓存了 `NULL`，且第二次请求不再打 DB：是 / 否
- [ ] 多个 key 的 `ttl` 不一样（随机过期生效）：是 / 否
- [ ] 更新课程后，缓存被删除（`redis-cli get` 返回空）：是 / 否
- [ ] 踩坑记录（Redis 连不上、序列化报错、LocalDateTime 反序列化失败等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 缓存穿透、击穿、雪崩分别是什么？触发场景有什么不同？分别用什么方案解决？
2. `setIfAbsent`（SETNX）为什么能实现互斥锁？这个锁有什么缺陷？（提示：锁是谁加的都分不清，释放时可能误删别人的锁——Day 19 会讲如何用 Lua/Redisson 解决）
3. 为什么「先改数据库、再删缓存」而不是反过来？「延迟双删」解决的是什么极端的并发窗口？
4. 空值缓存防穿透，为什么过期时间必须设短？如果换成布隆过滤器，和空值缓存比各有什么优缺点？
5. 为什么缓存过期时间要加随机值？除了加随机值，雪崩还有哪些缓解手段？（提示：缓存预热、多级缓存、熔断降级）
