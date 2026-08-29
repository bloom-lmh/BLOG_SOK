# Day 08 · 课程缓存（穿透 / 击穿 / 雪崩 + 一致性）

> **今天目标**：给「课程详情查询」加 Redis 缓存，把缓存三大经典问题——**穿透、击穿、雪崩**——以及**缓存与数据库的一致性**一次解决。这套写法是面试必考，也是秒杀（Day 19/20）的前置技能。

本日项目根目录统一为 `E:\CourseMall`。新增 Java 文件位于
`mall-course\src\main\java`；Day13 拆服务前，运行配置仍由 `mall-user` 提供。

## 一、前置条件

- 已完成 **Day 02**：`course` 表已建，种子数据（course id=1/2/3，`status=1`）已插入
- 已完成 **Day 06**：`mall-course` 模块已建，MyBatis-Plus 已配好，`Course` 实体 + `CourseMapper` 已建，课程 CRUD 能跑通
- **Redis 已装**（`localhost:6379`，Day 5 存验证码时应该已经连过）
- 已完成 **Day07**：公开课程详情返回 `CourseDetailVO`，Mapper XML 已过滤下架和逻辑删除数据

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

打开 `E:\CourseMall\mall-course\pom.xml`，只新增 Redis 编译依赖（运行时连接仍由唯一启动模块 `mall-user` 提供）：

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

### 步骤 2：配置 `application.yml`

继续修改 `mall-user/src/main/resources/application.yml`，不要在 `mall-course` 建第二份配置：

```yaml
spring:
  data:
    redis:
      host: ${COURSE_MALL_REDIS_HOST:127.0.0.1}
      port: ${COURSE_MALL_REDIS_PORT:6379}
      password: ${COURSE_MALL_REDIS_PASSWORD:}
      database: ${COURSE_MALL_REDIS_DATABASE:0}
```

::: tip 💡 面试题：Spring Boot 3 里 Redis 的配置前缀为什么是 `spring.data.redis` 而不是 `spring.redis`？
**一句话**：Spring Boot 2.x 用 `spring.redis.*`，**3.x 统一改成了 `spring.data.redis.*`**（和 `spring.data.mongodb` 等数据源前缀对齐）。很多老教程还是 `spring.redis`，照抄到 3.x 项目里会**静默失效**（连的还是默认 localhost）。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

### 步骤 3：确定缓存对象与 key 版本

缓存 Day07 的 `CourseDetailVO`，不缓存 Entity。key 使用 `course:detail:v1:{id}`：以后 VO 结构变化时升级为 `v2`，避免旧 JSON 反序列化失败。公开详情 SQL 已强制 `status=1 AND deleted_at IS NULL`，因此缓存中也只会出现可公开课程。

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

新建 `E:\CourseMall\mall-course\src\main\java\com\mall\course\service\CourseCacheService.java`：

```java
package com.mall.course.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.course.mapper.CourseMapper;
import com.mall.course.vo.CourseDetailVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
@RequiredArgsConstructor
public class CourseCacheService {

    private static final String CACHE_PREFIX = "course:detail:v1:";
    private static final String LOCK_PREFIX = "course:detail:lock:";
    private static final String NULL_MARK = "NULL";
    private static final long CACHE_TTL_MINUTES = 30;
    private static final int MAX_RETRY = 3;

    // 只有锁里的值仍等于自己的 token 才删除，比较与删除由 Lua 保证原子性。
    private static final DefaultRedisScript<Long> UNLOCK_SCRIPT = new DefaultRedisScript<>(
            "if redis.call('get', KEYS[1]) == ARGV[1] "
                    + "then return redis.call('del', KEYS[1]) else return 0 end",
            Long.class);

    private final CourseMapper courseMapper;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    /**
     * 查询课程详情（带缓存，穿透/击穿/雪崩三管齐下）
     */
    public CourseDetailVO getPublishedDetail(Long id) {
        try {
            CourseDetailVO detail = getWithMutex(id, 0);
            if (detail == null) {
                throw new BizException(ErrorCode.COURSE_NOT_FOUND, id);
            }
            return detail;
        } catch (RedisConnectionFailureException e) {
            // 缓存是加速层，不应因 Redis 临时不可用拖垮课程详情。
            log.error("Redis 不可用，课程详情降级查库，courseId={}", id, e);
            CourseDetailVO detail = courseMapper.selectCourseWithTeacher(id);
            if (detail == null) {
                throw new BizException(ErrorCode.COURSE_NOT_FOUND, id);
            }
            return detail;
        }
    }

    private CourseDetailVO getWithMutex(Long id, int retryCount) {
        String key = CACHE_PREFIX + id;

        String json = redisTemplate.opsForValue().get(key);
        if (json != null) {
            return NULL_MARK.equals(json) ? null : readJson(key, json);
        }

        String lockKey = LOCK_PREFIX + id;
        String lockToken = tryLock(lockKey);
        if (lockToken == null) {
            if (retryCount >= MAX_RETRY) {
                // 热点重建期间宁可快速失败，也不要让所有请求一起打穿数据库。
                throw new BizException(ErrorCode.SERVICE_UNAVAILABLE);
            }
            sleep(50);
            return getWithMutex(id, retryCount + 1);
        }

        try {
            // 抢到锁后必须 double-check，避免重复回源。
            json = redisTemplate.opsForValue().get(key);
            if (json != null) {
                return NULL_MARK.equals(json) ? null : readJson(key, json);
            }

            CourseDetailVO detail = courseMapper.selectCourseWithTeacher(id);
            if (detail == null) {
                redisTemplate.opsForValue().set(key, NULL_MARK, Duration.ofSeconds(60));
                return null;
            }

            long ttlMinutes = CACHE_TTL_MINUTES + ThreadLocalRandom.current().nextInt(10);
            redisTemplate.opsForValue().set(
                    key, writeJson(detail), Duration.ofMinutes(ttlMinutes));
            return detail;
        } finally {
            releaseLock(lockKey, lockToken);
        }
    }

    private String tryLock(String lockKey) {
        String token = UUID.randomUUID().toString();
        Boolean success = redisTemplate.opsForValue()
                .setIfAbsent(lockKey, token, Duration.ofSeconds(10));
        return Boolean.TRUE.equals(success) ? token : null;
    }

    private void releaseLock(String lockKey, String token) {
        redisTemplate.execute(UNLOCK_SCRIPT, List.of(lockKey), token);
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new BizException(ErrorCode.SERVICE_UNAVAILABLE);
        }
    }

    private String writeJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            throw new BizException(ErrorCode.SYSTEM_ERROR);
        }
    }

    private CourseDetailVO readJson(String key, String json) {
        try {
            return objectMapper.readValue(json, CourseDetailVO.class);
        } catch (JsonProcessingException e) {
            // 删除坏缓存，让后续请求可以重新构建。
            redisTemplate.delete(key);
            throw new BizException(ErrorCode.SYSTEM_ERROR);
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

### 步骤 6：一致性 —— 事务提交后再删缓存

缓存使用 Cache Aside：读时按需加载，写时先提交数据库，再删除缓存。关键是**不能在数据库事务尚未提交时删除**，否则并发读可能读取旧库值并重新写回缓存。

建立领域事件 `CourseChangedEvent.java`：

```java
package com.mall.course.event;

public record CourseChangedEvent(Long courseId) {
}
```

在 Day06 的 `CourseServiceImpl` 注入 `ApplicationEventPublisher`，并在新增、修改、删除成功后发布：

```java
private final ApplicationEventPublisher eventPublisher;

// create：save 成功并拿到主键后发布，清除之前可能缓存的 NULL。
eventPublisher.publishEvent(new CourseChangedEvent(course.getId()));

// update / delete：数据库操作成功后发布。
eventPublisher.publishEvent(new CourseChangedEvent(id));
```

在 `CourseCacheService` 增加监听器：

```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void evictAfterCommit(CourseChangedEvent event) {
    try {
        redisTemplate.delete(CACHE_PREFIX + event.courseId());
    } catch (RedisConnectionFailureException e) {
        // 数据库已经提交，缓存删除失败必须告警；TTL 最终会使旧值失效。
        log.error("课程缓存删除失败，courseId={}", event.courseId(), e);
    }
}
```

需要导入：

```java
import com.mall.course.event.CourseChangedEvent;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
```

这种方式把“提交数据库”和“删缓存”的先后关系写进框架回调，不需要用公共线程池 `CompletableFuture.runAsync` 猜一个 500ms 延迟。若要进一步保证删缓存消息绝不丢失，可在 Day21/26 使用 MQ、Outbox 或 Canal。

::: tip 💡 面试题：为什么要在 `AFTER_COMMIT` 删除缓存？
事务内执行 `UPDATE` 并不等于其他连接已经能看到新值。若提交前先删缓存，并发读会回源读到旧值再写回。`AFTER_COMMIT` 保证数据库新值先对外可见，再让下一次读重新构建缓存。
:::

### 步骤 7：Controller + 启动验证

不要再新建第二个 `CourseController`。把 Day07 公开详情接口的依赖和实现改为：

```java
private final CourseCacheService courseCacheService;

@GetMapping("/{id}")
public Result<CourseDetailVO> detail(
        @Positive(message = "{common.id-required}") @PathVariable Long id) {
    return Result.ok(courseCacheService.getPublishedDetail(id));
}
```

后台修改仍使用 Day06 的 `PUT /api/admin/courses/{id}`：它已有 `@Valid`、`@PreAuthorize("hasAuthority('course:edit')")` 和事务，成功后由本日事件监听器清缓存。

**启动验证**（在 `E:\CourseMall\` 根目录）：

```bash
mvn clean verify -DskipTests
mvn -pl mall-user -am spring-boot:run
```

```bash
# 1. 正常查询（种子数据 id=1 存在）
curl http://localhost:8080/api/courses/1

# 2. 穿透验证：查一个不存在的 id=99999
curl http://localhost:8080/api/courses/99999
#    返回 404，然后用 redis-cli 看：空值标记已经缓存了
redis-cli get course:detail:v1:99999
#    → 返回 "NULL"（说明没穿透到 DB）
```

```bash
# 3. 看缓存是否写入 + 过期时间是否随机（雪崩验证）
redis-cli --scan --pattern "course:detail:v1:*"
redis-cli ttl course:detail:v1:1    # 应该在 1800~2340 秒之间（30~39分钟随机）
```

**击穿验证**（手动比较难复现，用并发压测看 SQL 日志）：

```bash
# 先删掉 key 模拟「过期」，再开多个并发同时查同一个 id
redis-cli del course:detail:v1:1
# 用 JMeter 并发请求 http://localhost:8080/api/courses/1
# 看控制台 SQL 日志：只有一条 SELECT ... FROM course WHERE id=1，其余请求都等锁后命中缓存
```

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| Redis 缓存穿透/击穿/雪崩、SETNX、TTL | [Redis](/learn_database/Redis) |
| StringRedisTemplate、序列化、Jackson | [Redis](/learn_database/Redis) |
| MyBatis-Plus `BaseMapper`、逻辑删除 | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| `@TransactionalEventListener(AFTER_COMMIT)` | [Spring](/learn_backend/java/基础/Spring) |
| 唯一 token + Lua 原子释放互斥锁 | [Redis](/learn_database/Redis) |
| 缓存一致性、Cache Aside 模式 | [分布式基础](/learn_backend/java/微服务/分布式基础) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 只启动 `mall-user`，`GET /api/courses/1` 返回课程详情：是 / 否
- [ ] `redis-cli --scan --pattern "course:detail:v1:*"` 能看到缓存 key：是 / 否
- [ ] 查不存在的 id，`course:detail:v1:99999` 缓存了 `NULL`，且第二次请求不再打 DB：是 / 否
- [ ] 多个 key 的 `ttl` 不一样（随机过期生效）：是 / 否
- [ ] ADMIN 更新课程且事务提交后，缓存被删除：是 / 否
- [ ] 普通用户调用后台更新接口得到 403：是 / 否
- [ ] 踩坑记录（Redis 连不上、序列化报错、LocalDateTime 反序列化失败等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 缓存穿透、击穿、雪崩分别是什么？触发场景有什么不同？分别用什么方案解决？
2. `setIfAbsent`（SETNX）为什么能实现互斥锁？为什么锁值要用唯一 token，并用 Lua 比较后删除？
3. 为什么缓存要等数据库事务 `AFTER_COMMIT` 后再删除？如果删除失败，系统靠什么最终恢复？
4. 空值缓存防穿透，为什么过期时间必须设短？如果换成布隆过滤器，和空值缓存比各有什么优缺点？
5. 为什么缓存过期时间要加随机值？除了加随机值，雪崩还有哪些缓解手段？（提示：缓存预热、多级缓存、熔断降级）
