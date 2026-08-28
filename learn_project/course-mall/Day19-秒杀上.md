# Day 19 · 秒杀上（分布式锁 + Redis 原子扣减 + 防超卖 + 限购）

> **今天目标**：新建 `mall-seckill` 秒杀服务，用 Redis 的**原子操作**（Lua 脚本扣库存）解决「超卖」，用 **SET NX EX 分布式锁 + 唯一索引**解决「一人多单」。今天只做「抢购」这一个功能，不做消息削峰和限流（那是 Day 20 的事）。

## 一、前置条件

- 已完成 **Day 01**：`mall-common` 里有 `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`
- 已完成 **Day 02**：`seckill_activity`、`seckill_order` 两张表已建好（**今天代码严格复用这两张表，不建新表**）
- 已完成 **Day 06**：MyBatis-Plus 的依赖和版本管理已在父 `pom.xml` 配好（`mybatis-plus-spring-boot3-starter` 3.5.7）
- 已完成 **Day 13**：Nacos 已启动、父 `pom.xml` 已引入 Spring Cloud Alibaba 的 BOM、`mall-user` / `mall-course` 已注册
- 已完成 **Day 10/11/12/16**：`mall-order`、`mall-stock`、`mall-payment`、`mall-gateway` 四个模块已存在（父 pom 里都有），本天只在 `<modules>` 里新增 `mall-seckill`，其余不动
- Redis 已装（本机 `localhost:6379`）

> `mall-seckill` 要依赖 Day16 抽取的 `mall-security`，独立验证 JWT 并构造 `SecurityContext`。只写 `@PreAuthorize` 但没有认证过滤链，不算完成安全接入。

> ⚠️ Day 02 的秒杀活动种子数据时间是「相对时间」（`NOW() ± 1 DAY`）。如果现在活动时间已经过期，先刷新一下：

```sql
UPDATE seckill_activity
SET start_time = NOW() - INTERVAL 1 DAY, end_time = NOW() + INTERVAL 1 DAY, status = 1
WHERE id = 1;
```

## 二、今天完成后你会得到什么

```
E:\course-mall\
├─ pom.xml                                     # 改：加 mall-seckill 模块
└─ mall-seckill/                               # 新增：秒杀服务（端口 8085）
   ├─ pom.xml
   └─ src/main/
      ├─ java/com/mall/seckill/
      │  ├─ MallSeckillApplication.java        # 启动类
      │  ├─ config/RedisConfig.java            # 扣库存 Lua 脚本 Bean
      │  ├─ lock/DistributedLock.java          # 手写分布式锁（SET NX EX）
      │  ├─ entity/SeckillActivity.java        # 复用 seckill_activity 表
      │  ├─ entity/SeckillOrder.java           # 复用 seckill_order 表
      │  ├─ mapper/SeckillActivityMapper.java
      │  ├─ mapper/SeckillOrderMapper.java
      │  ├─ service/SeckillService.java        # 核心：预热 + 抢购
      │  └─ controller/SeckillController.java
      └─ resources/application.yml
```

## 三、先搞懂：为什么秒杀不能用「先查再扣」

秒杀有两大难题：**超卖**（库存只有 1 件，卖出去 2 件）和**重复下单**（一个人疯狂点，下了 N 单）。先说超卖。

**为什么「先查库存，再扣减」会超卖？** 因为「查」和「扣」是两个动作：

```java
// ❌ 错误写法：非原子，并发下必超卖
Integer stock = redis.get("stock");   // 线程 A、B 同时查到 stock = 1
if (stock > 0) {
    redis.set("stock", stock - 1);    // A、B 都执行 set("stock", 0)，两个人都以为抢到了
}
```

两个线程同时 `get` 到 1，都判断 `> 0`，都去 `set` 成 0 —— 结果卖了 2 件，库存只有 1 件，**超卖 1 件**。这就是**竞态条件（race condition）**：多个线程读-改-写共享数据，中间没有互斥，结果取决于线程调度顺序。

**为什么不用 MySQL 直接扣？** MySQL 用「条件更新」确实能防超卖：

```sql
UPDATE seckill_activity SET stock_count = stock_count - 1
WHERE id = 1 AND stock_count > 0;   -- 行锁 + 条件，超卖不了
```

但问题是 **MySQL 是磁盘 IO**，单机撑死几千 QPS，秒杀一开闸几十万 QPS 打过来，数据库直接被打挂。所以经典做法是：**把热点库存提前放到内存（Redis），用 Redis 的原子操作扛住高 QPS**。Redis 单机 QPS 十万级，差距是两个数量级。

::: tip 💡 面试题：Redis 为什么能防超卖？「原子操作」到底是什么？
**一句话**：Redis 是**单线程**处理命令的，一条命令（或一个 Lua 脚本）执行期间不会被其他命令插队，所以「判断 + 扣减」如果合并成**一条命令**，就是原子的，不会出现两个线程同时读到同一个旧值。详见 [Redis](/learn_database/Redis)、[并发编程](/learn_backend/java/Java核心/并发编程)。
:::

::: tip 💡 面试题：防超卖为什么用 Lua 脚本，而不是 Redis 的分布式锁？
**一句话**：Lua 脚本是**单命令原子**，无加解锁开销、无死锁、无锁过期问题；分布式锁有加解锁的网络开销，还有「锁过期了业务没执行完」「误删别人的锁」等一堆坑。**能用单条原子命令搞定的，就别上分布式锁**——分布式锁留给「没法用单命令原子化的多步业务」（比如「扣库存 + 调用户服务 + 发消息」这种跨服务多步流程）。详见 [Redis](/learn_database/Redis)、[分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

## 四、步骤

### 步骤 1：父 `pom.xml` 加模块

打开 `E:\course-mall\pom.xml`，`<modules>` 里加一行：

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-course</module>    <!-- Day 06 加的课程服务 -->
    <module>mall-order</module>     <!-- Day 10 加的订单服务 -->
    <module>mall-stock</module>     <!-- Day 11 加的库存服务 -->
    <module>mall-payment</module>   <!-- Day 12 加的支付服务 -->
    <module>mall-gateway</module>   <!-- Day 16 加的网关 -->
    <module>mall-seckill</module>   <!-- 新增 -->
</modules>
```

> 父 `pom.xml` 不用加任何新的 `<dependencyManagement>`：MyBatis-Plus 版本 Day 06 已管，Spring Cloud Alibaba BOM Day 13 已管，Redis 依赖的版本由 `spring-boot-starter-parent` 锁定。这就是把版本统一收口在父工程的好处。

### 步骤 2：新建 `mall-seckill` 模块（pom + 启动类 + 配置）

**2.1 `mall-seckill/pom.xml`：**

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

    <artifactId>mall-seckill</artifactId>

    <dependencies>
        <!-- 复用 Day01 的 Result/ErrorCode/全局异常 -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <!-- Redis 客户端：库存扣减、限购标记、分布式锁都靠它（版本由父工程锁定） -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-redis</artifactId>
        </dependency>
        <!-- MyBatis-Plus：读 seckill_activity / 写 seckill_order（版本 Day06 已管，不写） -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
        </dependency>
        <!-- MySQL 驱动 -->
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
        <!-- Nacos 服务注册（Day13 已引入 BOM） -->
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
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

::: tip 💡 面试题：`spring-boot-starter-data-redis` 默认用什么 Redis 客户端？为什么？
**一句话**：Spring Boot 2.x 起默认用 **Lettuce**（不是老牌的 Jedis）。Lettuce 基于 Netty、**线程安全**（一个连接多线程共享）、支持连接池和异步/响应式，更适合高并发；Jedis 是同步阻塞、每个线程要一个连接，并发高时要自己管理连接池。详见 [Redis](/learn_database/Redis)。
:::

**2.2 启动类 `MallSeckillApplication.java`（`com/mall/seckill/MallSeckillApplication.java`）：**

```java
package com.mall.seckill;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

// scanBasePackages = "com.mall"：和 Day01 一样，扫到 mall-common 的全局异常处理器
@SpringBootApplication(scanBasePackages = "com.mall")
@MapperScan("com.mall.seckill.mapper")   // 秒杀模块自己的 Mapper 包
@EnableMethodSecurity
public class MallSeckillApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallSeckillApplication.class, args);
    }
}
```

**2.3 配置文件 `mall-seckill/src/main/resources/application.yml`：**

```yaml
server:
  port: 8085

spring:
  application:
    name: mall-seckill    # 注册到 Nacos 的服务名
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: ${SECKILL_DB_URL:jdbc:mysql://127.0.0.1:3306/course_mall?useUnicode=true&characterEncoding=utf8mb4&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true}
    username: ${SECKILL_DB_USERNAME:root}
    password: ${SECKILL_DB_PASSWORD}
  data:
    redis:
      host: ${REDIS_HOST:127.0.0.1}
      port: 6379
      password: ${REDIS_PASSWORD:}
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_SERVER_ADDR:127.0.0.1:8848}

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 打印 SQL，方便调试
```

### 步骤 3：实体 + Mapper（严格复用 Day02 的两张表）

秒杀活动实体 `com/mall/seckill/entity/SeckillActivity.java`：

```java
package com.mall.seckill.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("seckill_activity")   // 复用 Day02 的秒杀活动表，不建新表
public class SeckillActivity {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long courseId;         // 逻辑外键 → course.id
    private BigDecimal seckillPrice;  // 秒杀价（DECIMAL(10,2) → BigDecimal）
    private Integer stockCount;    // 总库存（预热时会加载到 Redis）
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private Integer status;        // 0未开始 1进行中 2已结束
    private LocalDateTime createTime;
    // 注意：seckill_activity 表没有 deleted 字段，所以不写 @TableLogic
}
```

秒杀订单实体 `com/mall/seckill/entity/SeckillOrder.java`：

```java
package com.mall.seckill.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("seckill_order")   // 复用 Day02 的秒杀订单表
public class SeckillOrder {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long userId;
    private Long activityId;
    private String orderNo;      // 关联订单号
    private LocalDateTime createTime;
    // 关键：这张表的联合唯一索引 uk_user_activity(user_id, activity_id) 是「一人一单」的数据库层兜底
}
```

两个 Mapper（零 SQL，继承 `BaseMapper` 即可）：

`com/mall/seckill/mapper/SeckillActivityMapper.java`：

```java
package com.mall.seckill.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.seckill.entity.SeckillActivity;

public interface SeckillActivityMapper extends BaseMapper<SeckillActivity> {
}
```

`com/mall/seckill/mapper/SeckillOrderMapper.java`：

```java
package com.mall.seckill.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.seckill.entity.SeckillOrder;

public interface SeckillOrderMapper extends BaseMapper<SeckillOrder> {
}
```

### 步骤 4：Redis 原子扣库存 —— Lua 脚本（防超卖的核心）

`com/mall/seckill/config/RedisConfig.java`：

```java
package com.mall.seckill.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.script.DefaultRedisScript;

@Configuration
public class RedisConfig {

    // 扣库存 Lua 脚本：把「判断库存」+「扣减」合并成一个脚本，Redis 一次性执行完，中间不被打断
    // 返回值约定：-1 = 库存 key 不存在（未预热）；0 = 库存不足；1 = 扣减成功
    public static final String DEDUCT_STOCK_LUA =
        "local stock = redis.call('GET', KEYS[1]) " +   // 读当前库存（key 不存在时返回 false）
        "if not stock then return -1 end " +            // 没预热 → 返回 -1
        "if tonumber(stock) <= 0 then return 0 end " +  // 库存不足 → 返回 0，拒绝
        "redis.call('DECR', KEYS[1]) " +                // 库存够 → 原子扣减 1
        "return 1 ";                                    // 返回 1，成功

    // 把脚本声明成 Bean：DefaultRedisScript 会缓存编译后的 SHA，避免每次抢购都重新解析脚本文本
    @Bean
    public DefaultRedisScript<Long> deductStockScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setScriptText(DEDUCT_STOCK_LUA);
        script.setResultType(Long.class);   // 脚本返回的是整数，映射成 Java 的 Long
        return script;
    }
}
```

::: tip 💡 面试题：Lua 脚本在 Redis 里为什么是原子的？
**一句话**：Redis 是**单线程**执行命令的，它会把一个 Lua 脚本当成**一整条命令**去执行，脚本执行期间其他客户端的命令都得排队。所以「GET 判断 + DECR 扣减」这个脚本里的两步，不可能被别的线程插到中间。如果不用 Lua、分开写 `GET` 再 `SET`，两步之间就可能插入别的命令，产生竞态 → 超卖。详见 [Redis](/learn_database/Redis)。
:::

### 步骤 5：手写分布式锁 —— SET NX EX + Lua 释放

`com/mall/seckill/lock/DistributedLock.java`：

```java
package com.mall.seckill.lock;

import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

// 手写 Redis 分布式锁。生产环境一般用 Redisson，这里手写是为了让你搞懂底层原理：
// 分布式锁本质就是「SET key value NX EX」—— NX 保证互斥、EX 保证锁不永久占用
@Component
public class DistributedLock {

    // 释放锁的 Lua：先比较 value 是不是自己的，是自己的才 DEL（比较 + 删除，原子完成）
    private static final String UNLOCK_LUA =
        "if redis.call('GET', KEYS[1]) == ARGV[1] then " +
        "  return redis.call('DEL', KEYS[1]) " +
        "else return 0 end";

    private static final DefaultRedisScript<Long> UNLOCK_SCRIPT =
            new DefaultRedisScript<>(UNLOCK_LUA, Long.class);

    private final StringRedisTemplate redis;

    public DistributedLock(StringRedisTemplate redis) {
        this.redis = redis;
    }

    /**
     * 加锁。成功返回「token」（本次锁的唯一标识，释放时要用），失败返回 null。
     * 三个参数缺一不可：
     *   NX —— 只有 key 不存在才能 set 成功，保证互斥（只有一个线程拿到锁）
     *   EX —— 锁有过期时间，避免持锁线程宕机后锁永远不释放（死锁）
     *   value —— 用 UUID 标识「这把锁是谁加的」，释放时校验防止误删别人的锁
     */
    public String tryLock(String key, Duration expire) {
        String value = UUID.randomUUID().toString();
        Boolean ok = redis.opsForValue().setIfAbsent(key, value, expire);   // 底层就是 SET key value NX EX
        return Boolean.TRUE.equals(ok) ? value : null;
    }

    /**
     * 释放锁。必须「先比较 value 再 DEL」，并且要在一个 Lua 脚本里原子完成。
     * 反例：如果直接 DEL，A 的锁到期被 Redis 自动删了、B 又拿到了锁，
     * 这时 A 姗姗来迟执行 DEL，会把 B 的锁误删 —— 造成两个线程同时进临界区。
     */
    public void unlock(String key, String value) {
        redis.execute(UNLOCK_SCRIPT, List.of(key), value);
    }
}
```

::: tip 💡 面试题：分布式锁的 `SET key value NX EX` 三个参数分别解决什么？
**一句话**：`NX`（not exists）保证**互斥**——只有 key 不存在才加锁成功；`EX`（过期时间）保证**不死锁**——持锁线程宕机后锁自动释放；`value`（UUID）保证**能安全释放**——释放时校验是自己的锁才删。三个少了任何一个，锁都有致命缺陷。详见 [Redis](/learn_database/Redis)。
:::

::: tip 💡 面试题：分布式锁有哪些坑？Redisson 是怎么解决的？
**一句话**：三大坑——① **锁过期**：业务没执行完锁就过期了，别人又能进来；② **不可重入**：同一个线程第二次加锁会把自己锁死；③ **误删**：锁过期后被别人拿到，自己释放时把别人的删了。Redisson 用「看门狗（watchdog）」自动续期解决①，用 Hash 结构 + 计数解决②，用唯一 value 校验解决③。这就是为什么生产上用 Redisson 而不是手写。详见 [Redis](/learn_database/Redis)。
:::

### 步骤 6：核心业务 `SeckillService`（预热 + 抢购）

`com/mall/seckill/service/SeckillService.java`：

```java
package com.mall.seckill.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.seckill.entity.SeckillActivity;
import com.mall.seckill.entity.SeckillOrder;
import com.mall.seckill.lock.DistributedLock;
import com.mall.seckill.mapper.SeckillActivityMapper;
import com.mall.seckill.mapper.SeckillOrderMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

// 秒杀是纯业务逻辑（不是 CRUD），所以不套 IService/ServiceImpl 那套，直接用 @Service
@Service
public class SeckillService {

    private final StringRedisTemplate redis;
    private final SeckillActivityMapper activityMapper;
    private final SeckillOrderMapper orderMapper;
    private final DistributedLock lock;
    private final DefaultRedisScript<Long> deductStockScript;   // 步骤 4 注入的 Lua 脚本 Bean

    public SeckillService(StringRedisTemplate redis,
                          SeckillActivityMapper activityMapper,
                          SeckillOrderMapper orderMapper,
                          DistributedLock lock,
                          DefaultRedisScript<Long> deductStockScript) {
        this.redis = redis;
        this.activityMapper = activityMapper;
        this.orderMapper = orderMapper;
        this.lock = lock;
        this.deductStockScript = deductStockScript;
    }

    /**
     * 预热：把活动的总库存从 MySQL 加载到 Redis。
     * 用分布式锁防止「多个实例同时预热」造成重复写（虽然 setIfAbsent 本身也幂等，但锁能保证逻辑只走一遍）。
     */
    public int preload(Long activityId) {
        String lockKey = "lock:preload:" + activityId;
        String token = lock.tryLock(lockKey, Duration.ofSeconds(10));
        if (token == null) {
            throw new BizException(ErrorCode.SECKILL_BUSY);
        }
        try {
            SeckillActivity activity = activityMapper.selectById(activityId);
            if (activity == null) {
                throw new BizException(ErrorCode.NOT_FOUND);
            }
            // setIfAbsent：只有 key 不存在才写入，避免「重复预热」把已扣减的库存重置回原值
            // 库存 key 不设 TTL：它代表「剩余库存」，必须贯穿整场活动；活动结束由清理任务删除
            String stockKey = "seckill:stock:" + activityId;
            redis.opsForValue().setIfAbsent(stockKey, String.valueOf(activity.getStockCount()));
            return activity.getStockCount();
        } finally {
            lock.unlock(lockKey, token);   // 无论成败都要释放锁，否则死锁
        }
    }

    /**
     * 抢购核心。三步各司其职：
     *   ① 限购（一人一单）→ Redis SETNX 去重标记
     *   ② 防超卖        → Lua 脚本原子扣库存
     *   ③ 兜底          → seckill_order 唯一索引 uk_user_activity
     */
    public String doSeckill(Long activityId, Long userId) {
        // 1. 查活动 + 校验时间窗口（活动数据量小，直接查 DB）
        SeckillActivity activity = activityMapper.selectById(activityId);
        if (activity == null) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        LocalDateTime now = LocalDateTime.now();
        if (now.isBefore(activity.getStartTime()) || now.isAfter(activity.getEndTime())) {
            throw new BizException(now.isBefore(activity.getStartTime())
                    ? ErrorCode.SECKILL_NOT_STARTED : ErrorCode.SECKILL_ENDED);
        }

        // 2. 限购「一人一单」第一道防线：Redis SETNX 去重标记（原子的 SET NX）
        //    同一用户同一活动，只有第一个请求能写成功，后续并发请求全返回 false 直接拒绝
        String userKey = "seckill:user:" + activityId + ":" + userId;
        Boolean first = redis.opsForValue().setIfAbsent(userKey, "1", Duration.ofDays(1));
        if (!Boolean.TRUE.equals(first)) {
            throw new BizException(ErrorCode.SECKILL_DUPLICATE_ORDER);
        }

        // 3. 防超卖核心：Lua 脚本原子扣库存（GET 判断 + DECR 扣减，一次执行完）
        String stockKey = "seckill:stock:" + activityId;
        Long r = redis.execute(deductStockScript, List.of(stockKey));
        if (r == null || r == -1) {
            redis.delete(userKey);   // 没买到，回滚限购标记，允许后续重试
            throw new BizException(ErrorCode.SECKILL_BUSY);
        }
        if (r == 0) {
            redis.delete(userKey);
            throw new BizException(ErrorCode.SECKILL_SOLD_OUT);
        }

        // 4. 落库写秒杀订单（真实项目这里发 MQ 异步生成正式订单，Day20 做）
        //    第二道防线：seckill_order 的唯一索引 uk_user_activity 在 DB 层兜底，
        //    即使 Redis 标记丢失/重启，重复下单也会被唯一索引拦住
        String orderNo = generateOrderNo(userId);
        try {
            SeckillOrder order = new SeckillOrder();
            order.setUserId(userId);
            order.setActivityId(activityId);
            order.setOrderNo(orderNo);
            orderMapper.insert(order);
        } catch (DuplicateKeyException e) {
            // 唯一索引兜底触发：说明 Redis 标记已丢失（如 Redis 重启），但 DB 挡住了重复单。
            // 此时要把刚才扣掉的库存还回去 + 清掉标记，保证库存不凭空少 1
            redis.opsForValue().increment(stockKey);
            redis.delete(userKey);
            throw new BizException(ErrorCode.SECKILL_DUPLICATE_ORDER);
        }

        return orderNo;
    }

    private String generateOrderNo(Long userId) {
        // 简单订单号：时间戳 + 用户 + 随机数。Day24 会换成雪花算法（分布式唯一 ID）
        return "SK" + System.currentTimeMillis() + userId + ThreadLocalRandom.current().nextInt(1000, 9999);
    }
}
```

> ⚠️ 注意到没有：上面只对 `DuplicateKeyException` 做了「回补库存」的补偿。如果 insert 因为**其他原因**失败（比如 MySQL 挂了），库存已经被 Lua 扣掉了但订单没写成——库存会凭空少 1。生产上的解法是把「扣库存成功 → 写订单」改成**消息队列的最终一致**（扣了库存先发消息，消费者慢慢写订单，写失败进重试/死信），这正是 Day 20「消息削峰」要做的。今天先知道这个缺口在哪就行。

::: tip 💡 面试题：限购为什么是「Redis SETNX + MySQL 唯一索引」两层？只有一层会怎样？
**一句话**：**Redis SETNX 快但不持久**（Redis 重启/过期标记就没了），**MySQL 唯一索引慢但可靠**（约束在数据库层，永远生效）。所以用 Redis 做第一道「快速拦截」，MySQL 唯一索引做第二道「最终兜底」——即使 Redis 标记丢了，重复下单也会被 `uk_user_activity` 拦住。这就是「快速失败 + 可靠兜底」的组合拳。详见 [Redis](/learn_database/Redis)、[MySQL](/learn_database/MySQL)。
:::

### 步骤 7：接口 `SeckillController`

`com/mall/seckill/controller/SeckillController.java`：

```java
package com.mall.seckill.controller;

import com.mall.common.result.Result;
import com.mall.seckill.service.SeckillService;
import jakarta.validation.constraints.Positive;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/seckill")
@Validated
public class SeckillController {

    private final SeckillService seckillService;

    public SeckillController(SeckillService seckillService) {
        this.seckillService = seckillService;
    }

    // 预热：把活动库存加载到 Redis。真实项目由「活动开始前的定时任务」自动触发，Day20 会接
    @PostMapping("/preload/{activityId}")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<Integer> preload(@PathVariable @Positive Long activityId) {
        return Result.ok(seckillService.preload(activityId));
    }

    @PostMapping("/{activityId}")
    @PreAuthorize("isAuthenticated()")
    public Result<String> seckill(
            @PathVariable @Positive Long activityId,
            @AuthenticationPrincipal(expression = "id") Long userId) {
        return Result.ok(seckillService.doSeckill(activityId, userId));
    }
}
```

### 步骤 8：启动验证

先整体编译，然后启动秒杀服务：

```bash
# 在 E:\course-mall\ 根目录
mvn clean install -DskipTests
mvn -pl mall-seckill spring-boot:run
```

然后按顺序验证（前提：Redis、MySQL、Nacos 都启动，活动 id=1 已刷新时间）：

```bash
# ① 预热：把活动 1 的库存（100）加载到 Redis
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" "http://localhost:9000/api/seckill/preload/1"
# 预期：{"code":200,"data":100}

# ② 用户 1 第一次抢购 → 成功，返回订单号
curl -X POST -H "Authorization: Bearer <USER_TOKEN>" "http://localhost:9000/api/seckill/1"
# 预期：{"code":200,"data":"SK..."}

# ③ 用户 1 再抢一次 → 被限购拦截（Redis SETNX 失败）
curl -X POST -H "Authorization: Bearer <USER_TOKEN>" "http://localhost:9000/api/seckill/1"
# 预期：{"code":400,"message":"你已抢购过该活动，每人限购一单"}

# ④ 用户 2 抢购 → 成功（库存从 100 扣到 99）
curl -X POST -H "Authorization: Bearer <ANOTHER_USER_TOKEN>" "http://localhost:9000/api/seckill/1"

# ⑤ 看 Redis 里的库存变化（应该从 100 → 99，只有 userId=1 和 userId=2 成功）
redis-cli GET seckill:stock:1
```

再验证**数据库层兜底**：去 MySQL 里查 `seckill_order` 表，应该有 2 条记录（userId=1、userId=2），且 `uk_user_activity` 唯一索引生效。你可以手动插入一条重复的 `(user_id=1, activity_id=1)` 试一下，会报唯一索引冲突。

**验证防超卖（重点）**：把库存调小，用并发工具打，验证「成功订单数 == 库存数」：

```bash
# 先把库存调成 10 方便观察，然后清掉 Redis 里的旧状态，重新预热
# SQL: UPDATE seckill_activity SET stock_count = 10 WHERE id = 1;
redis-cli DEL seckill:stock:1 seckill:user:1:1 seckill:user:1:2
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" "http://localhost:9000/api/seckill/preload/1"
```

然后用 ApacheBench 并发打（100 个请求、并发 20，模拟 100 个不同用户抢 10 件货，`userId` 用 `ab` 没法动态传，这里先用固定 userId 演示扣库存逻辑；**真正的并发防超卖压测放到 Day29 用 JMeter 做**，JMeter 能动态生成不同 userId）：

```bash
ab -n 100 -c 20 -H "Authorization: Bearer <USER_TOKEN>" -p post.txt "http://localhost:9000/api/seckill/1"
```

打完看结果：`redis-cli GET seckill:stock:1` 应该 **≥ 0**（绝不为负），`seckill_order` 里活动 1 的成功订单数**恰好等于扣掉的库存**。这就是「原子扣减」防住超卖的直接证据。

> ⚠️ 上面 `ab` 用固定 userId 只是演示库存扣减不会超卖；要验证「一人一单」的并发效果，需要不同 userId，留到 Day29 用 JMeter 统一压测（那时会把限购、防超卖一起测）。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| Redis 原子操作、Lua 脚本、SET NX EX 分布式锁、DECR | [Redis](/learn_database/Redis) |
| 竞态条件、超卖的根因 | [并发编程](/learn_backend/java/Java核心/并发编程) |
| 唯一索引兜底、`DuplicateKeyException` | [MySQL](/learn_database/MySQL) |
| `BaseMapper`、`selectById`/`insert` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| starter 自动装配、`@Bean`、Lettuce 客户端 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| 分布式锁在微服务中的作用、CAP 取舍 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| 父工程多模块聚合、版本统一收口 | [Maven](/learn_backend/java/基础/Maven) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-seckill` 启动成功，Nacos 控制台能看到 `mall-seckill` 服务：是 / 否
- [ ] 预热成功，`/api/seckill/preload/1` 返回库存 100：是 / 否
- [ ] 同一 userId 第二次抢购被拦截（限购生效）：是 / 否
- [ ] 库存扣减正确，`GET seckill:stock:1` 数值随成功订单递减、不为负：是 / 否
- [ ] `seckill_order` 表成功写入订单，重复插入会被唯一索引拦住：是 / 否
- [ ] 踩坑记录（Redis 连不上、脚本报错、唯一索引冲突等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. 防超卖为什么用 Lua 脚本「GET + DECR」而不是先 `GET` 再 `SET`？两条命令分开写会发生什么？（提示：竞态条件）
2. `SET key value NX EX` 三个参数分别解决什么问题？释放锁时为什么要「先比较 value 再 DEL」，直接 `DEL` 会有什么 bug？
3. 限购「一人一单」为什么是 Redis SETNX + MySQL 唯一索引两层？如果只有 Redis 这一层，什么情况下会失效？
4. Lua 脚本在 Redis 里为什么是原子的？Redis 单线程执行命令和「原子」之间是什么关系？
5. 分布式锁的三大坑（锁过期、不可重入、误删）分别是什么？Redisson 的「看门狗」解决的是哪个？（提示：为 Day20 消息削峰做铺垫）
