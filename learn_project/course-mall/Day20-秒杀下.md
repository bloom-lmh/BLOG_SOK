# Day 20 · 秒杀下（预扣减 + 消息削峰 + 限流）

> **今天目标**：把 Day 19 秒杀接口从「同步写库」升级成「Redis 预扣减 → 发 RocketMQ 消息异步落库 → 立即返回排队中」，用**消息队列削峰**保护数据库；再在入口加一层**令牌桶限流**，把并发压到系统能承受的范围。今天的技术点是 **削峰** 和 **限流**。

## 一、前置条件

- 已完成 **Day 19（秒杀上）**：`mall-seckill` 模块已建好（端口 **8082**），具备 `preload` 预热、`DistributedLock` 分布式锁、`RedisConfig` 里的扣库存 Lua Bean（`deductStockScript`）、限购（`seckill:user:` SETNX + `uk_user_activity` 唯一索引）
- 已完成 **Day 01**（`Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`）
- 已完成 **Day 02**（`seckill_activity` / `seckill_order` 两张表已建好，今天仍复用，不建新表）
- **Redis 已启动**（本机 `localhost:6379`）
- **RocketMQ 已启动**（NameServer + Broker，见步骤 1）

## 二、先搞懂：Day 19 的秒杀为什么还不够？

Day 19 已经把「防超卖」做到了 Redis 层（Lua 原子扣减），单次请求也很快。但它还有一个**致命问题没解决**——**扣减成功后，紧接着就是同步写数据库（insert seckill_order）**。

```
Day 19 的链路（同步）：
请求 → 限购检查 → Redis Lua 扣减 → 【同步 insert DB】→ 返回结果
                                    ↑
                         这一步是慢的、有锁竞争的、和 MySQL 连接池绑死的
```

秒杀的特点是**流量在几秒内暴涨**（比如 10 万人在 0 点同时点「抢」）。哪怕 Redis 扛住了，后面的 **MySQL 写库**也会在瞬间被 10 万个 insert 打垮——连接池耗尽、行锁竞争、响应超时、进而雪崩。**Redis 再快，也救不了被打爆的数据库。**

所以今天要解决两个问题：

1. **削峰（把洪峰削平）**：Redis 预扣减成功后，**不直接写库**，而是发一条消息到 RocketMQ，立刻返回「排队中」。订单由消费者**按自己的节奏**慢慢落库。MQ 在这里充当「蓄水池」——上游洪峰进来，下游平稳流出，数据库的瞬时压力被削掉。
2. **限流（把无效请求挡在门外）**：哪怕有削峰，10 万个请求都进 Redis、都发消息，压力也不小。更关键的是，秒杀里大量请求是「注定抢不到的」（库存就 100 件，第 101 个以后都是白忙）。限流在入口只放行「系统处理得过来」的量，其余直接快速拒绝。

> 顺带理清一个概念：**预扣减** = 扣库存发生在订单生成之前。Day 19 的 Lua 扣减其实已经是预扣减（先占住库存、再 insert 订单）；Day 20 的升级是——预扣减成功后，那个「生成订单」的动作不再由请求线程同步做，而是丢给 MQ 消费者异步做。

::: tip 💡 面试题：MQ 削峰和限流有什么区别？为什么两个都要做？
**一句话**：**限流是「拒绝」**——超出的请求直接挡在门外，压根不进来；**削峰是「缓冲」**——放行进来的请求先堆在 MQ 里，下游按能力慢慢消化。限流防的是「入口被冲垮」，削峰防的是「下游被冲垮」，两者一前一后，缺一不可。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

## 三、完成后你会得到什么

1. `mall-seckill` 引入 RocketMQ，秒杀接口改成「预扣减 → 发 MQ → 返回排队中」
2. 一个 MQ 消费者，异步把秒杀订单落库（靠 `uk_user_activity` 唯一索引做幂等）
3. 一个 Redis 令牌桶限流器，超量请求被直接拒绝
4. 整体架构变成下面这样：

```
                 ┌──────────────────────────────────────────────────────────┐
10万请求 ─限流──▶│ 每秒只放行 N 个（令牌桶）                                  │
                 │    ↓ 限购检查（一人一单）                                  │
                 │    ↓ Redis Lua 预扣减（抢到资格就扣）                      │
                 │    ↓ 发 RocketMQ 消息 ──▶ 立即返回「排队中」（毫秒级）      │
                 └──────────────────────────────────────────────────────────┘
                                            │ 消息堆积（蓄水池）
                                            ▼
                           消费者按自己的节奏（受控并发）落库 seckill_order
```

## 四、步骤

### 步骤 1：准备 RocketMQ 环境

RocketMQ 是 Apache 的分布式消息中间件，架构上分 **NameServer**（注册中心，管路由）和 **Broker**（真正存消息的）。

**方式一 · 本地二进制**（Windows）：

```bash
# 1. 下载二进制包（4.9.x，zip）：https://rocketmq.apache.org/download
# 2. 解压后设置环境变量 ROCKETMQ_HOME = 解压目录（如 D:\rocketmq-4.9.7）
# 3. 启动 NameServer（默认端口 9876）
mqnamesrv.cmd
# 4. 另开一个终端，启动 Broker
mqbroker.cmd -n localhost:9876
```

**方式二 · Docker**（更省事，装好 Docker 就用这个）：

```bash
docker run -d --name rmqnamesrv -p 9876:9876 apache/rocketmq:5.3.0 sh mqnamesrv
docker run -d --name rmqbroker -p 10911:10911 -p 10909:10909 \
  -e "NAMESRV_ADDR=rmqnamesrv:9876" apache/rocketmq:5.3.0 sh mqbroker
```

> ⚠️ 版本配对说明：今天引入的 `rocketmq-spring-boot-starter 2.3.1` 底层用的是 rocketmq-client **5.x**。5.x 客户端官方保证向下兼容 4.9.x Broker（本地二进制方式没问题），但 Docker 建议直接用 5.x 镜像，最省心。
>
> ⚠️ 启动成功的判断：NameServer 日志打印 `The Name Server boot success`、Broker 日志打印 `boot success`；或者用 `netstat -ano | findstr :9876` 确认端口被监听（9876 是 TCP 端口，`curl` 不通是正常的，别误判为启动失败）。

### 步骤 2：引入 RocketMQ 依赖 + 配置

打开 `E:\course-mall\mall-seckill\pom.xml`，在 `<dependencies>` 里加：

```xml
<!-- RocketMQ 的 Spring Boot 启动器：提供 RocketMQTemplate（发消息）和 @RocketMQMessageListener（收消息）
     版本必须显式写 2.3.x：Spring Boot 父工程不管 RocketMQ 的版本号；
     且 2.2.x 及以下基于 javax.*，和 Spring Boot 3（jakarta.*）不兼容，只有 2.3.x 能用 -->
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>2.3.1</version>
</dependency>
```

> 父 `pom.xml` 不用改：RocketMQ starter 不是 Spring Cloud Alibaba 的组件，版本直接写在子模块里即可。

`E:\course-mall\mall-seckill\src\main\resources\application.yml` **完整内容**（在 Day 19 基础上追加 RocketMQ 配置，其余原样保留）：

```yaml
server:
  port: 8082              # 和 Day19 一致，端口不变

spring:
  application:
    name: mall-seckill
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
    username: root
    password: 你的MySQL密码        # ← 改成你自己的
  data:
    redis:
      host: localhost
      port: 6379
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848

mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl

# ↓↓↓ 今天新增：RocketMQ 配置 ↓↓↓
rocketmq:
  name-server: 127.0.0.1:9876     # NameServer 地址
  producer:
    group: seckill-producer-group # 生产者组：同一业务的生产者归一组，方便统一管理
```

::: tip 💡 面试题：RocketMQ 里 NameServer 和 Broker 分别是什么角色？
**一句话**：**NameServer 是注册中心**（类似微服务的 Nacos），记录哪些 Broker 活着、Topic 路由在哪；**Broker 是真正收发消息的服务器**。生产者/消费者先问 NameServer「我要的 Topic 在哪个 Broker」，再去连对应的 Broker。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

### 步骤 3：定义秒杀消息 + 生产者

**3.1 消息体** `E:\course-mall\mall-seckill\src\main\java\com\mall\seckill\mq\SeckillMessage.java`：

```java
package com.mall.seckill.mq;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

// 消息体要能序列化（rocketmq-spring-boot-starter 默认用 Jackson 转 JSON 传输）
// @NoArgsConstructor 必须有：Jackson 反序列化需要一个无参构造器
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SeckillMessage implements Serializable {
    private Long userId;       // 谁抢的
    private Long activityId;   // 哪一场秒杀
    private String orderNo;    // 预生成的订单号（下单动作还没发生，先把号定下来）
}
```

**3.2 生产者** `E:\course-mall\mall-seckill\src\main\java\com\mall\seckill\mq\SeckillMqProducer.java`：

```java
package com.mall.seckill.mq;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class SeckillMqProducer {

    private static final String TOPIC = "seckill-order-topic";   // 秒杀下单主题

    private final RocketMQTemplate rocketMQTemplate;   // 由 starter 自动装配，直接用

    /** 发送秒杀下单消息。syncSend = 同步发送，等 Broker 确认后才返回，简单可靠 */
    public void send(SeckillMessage message) {
        rocketMQTemplate.syncSend(TOPIC, message);
        log.info("已发送秒杀消息：{}", message.getOrderNo());
    }
}
```

### 步骤 4：改造秒杀接口 —— 预扣减 → 发 MQ → 立即返回（今天的核心）

相比 Day 19，`SeckillService` 只改三处，其余（`preload` 预热、`RedisConfig` 的 Lua Bean、`DistributedLock`、实体、Mapper）**全部原样保留**：

| 改动 | Day 19 | Day 20 |
|---|---|---|
| ① 入口加限流 | 无 | 令牌桶，超量直接 429 |
| ② 扣减成功后 | 同步 `insert` 写库 | 发 MQ，异步落库 |
| ③ 返回值 | `String`（订单号） | `SeckillResult`（订单号 + 状态「排队中」） |

> 注意：`SeckillService` 不再注入 `SeckillOrderMapper`——写库的动作挪到消费者里去了。旧文件里那个 `orderMapper` 字段和 `insert` 逻辑删掉，别留着（留一个没用到的注入字段，启动时还会白白占一个 Bean）。

`E:\course-mall\mall-seckill\src\main\java\com\mall\seckill\service\SeckillService.java`（完整可替换 Day 19 的旧文件）：

```java
package com.mall.seckill.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.seckill.entity.SeckillActivity;
import com.mall.seckill.lock.DistributedLock;
import com.mall.seckill.mapper.SeckillActivityMapper;
import com.mall.seckill.mq.SeckillMessage;
import com.mall.seckill.mq.SeckillMqProducer;
import com.mall.seckill.util.RateLimiter;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;

@Slf4j
@Service
@RequiredArgsConstructor
public class SeckillService {

    private static final int LIMIT_CAPACITY = 1000;   // 限流桶容量：最多能「攒」多少令牌（允许的最大突发量）
    private static final int LIMIT_RATE = 1000;       // 每秒放行 1000 个请求

    private final StringRedisTemplate redis;
    private final SeckillActivityMapper activityMapper;
    private final DistributedLock lock;
    private final SeckillMqProducer seckillMqProducer;
    private final RateLimiter rateLimiter;
    // Day19 RedisConfig 里注册的扣库存 Lua Bean（deductStockScript），今天原样复用
    private final DefaultRedisScript<Long> deductStockScript;

    /** 预热：把活动的总库存从 MySQL 加载到 Redis（Day19 已有，不变） */
    public int preload(Long activityId) {
        String lockKey = "lock:preload:" + activityId;
        String token = lock.tryLock(lockKey, Duration.ofSeconds(10));
        if (token == null) {
            throw new BizException(500, "预热正在进行中，请勿重复触发");
        }
        try {
            SeckillActivity activity = activityMapper.selectById(activityId);
            if (activity == null) {
                throw new BizException(ErrorCode.NOT_FOUND);
            }
            // setIfAbsent：只有 key 不存在才写入，避免「重复预热」把已扣减的库存重置回原值
            String stockKey = "seckill:stock:" + activityId;
            redis.opsForValue().setIfAbsent(stockKey, String.valueOf(activity.getStockCount()));
            return activity.getStockCount();
        } finally {
            lock.unlock(lockKey, token);   // 无论成败都要释放锁，否则死锁
        }
    }

    /**
     * 抢购（Day20 版）。相比 Day19 只改三处：
     *   ① 入口加令牌桶限流（挡住系统处理不过来的请求）
     *   ② 预扣减成功后不再同步 insert，改发 MQ 异步落库（削峰）
     *   ③ 返回值从 String 变成 SeckillResult（订单号 + 状态）
     */
    public SeckillResult doSeckill(Long activityId, Long userId) {
        // 0. 限流（Day20 新增）：令牌桶，每秒最多 LIMIT_RATE 个请求通过，超出的直接拒绝。
        //    放在最前面，把「注定抢不到的无效请求」挡在 Redis 和 MQ 之外。
        if (!rateLimiter.tryAcquire("seckill:limit:" + activityId, LIMIT_CAPACITY, LIMIT_RATE)) {
            throw new BizException(429, "请求过于频繁，请稍后再试");
        }

        // 1. 查活动 + 校验时间窗口（Day19 已有，保留）
        SeckillActivity activity = activityMapper.selectById(activityId);
        if (activity == null) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        LocalDateTime now = LocalDateTime.now();
        if (now.isBefore(activity.getStartTime()) || now.isAfter(activity.getEndTime())) {
            throw new BizException(400, "秒杀未开始或已结束");
        }

        // 2. 限购「一人一单」：Redis SETNX 去重标记（Day19 已有，key 不变）
        String userKey = "seckill:user:" + activityId + ":" + userId;
        Boolean first = redis.opsForValue().setIfAbsent(userKey, "1", Duration.ofDays(1));
        if (!Boolean.TRUE.equals(first)) {
            throw new BizException(400, "你已抢购过该活动，每人限购一单");
        }

        // 3. Redis 预扣减（Day19 的 Lua 脚本原样复用）：
        //    「预」= 扣减发生在订单生成之前——先在 Redis 里把库存占住，订单等会儿才建。
        //    返回值约定（见 Day19 RedisConfig）：-1 = 未预热；0 = 库存不足；1 = 扣减成功
        String stockKey = "seckill:stock:" + activityId;
        Long r = redis.execute(deductStockScript, List.of(stockKey));
        if (r == null || r == -1) {
            redis.delete(userKey);   // 没抢到 → 回滚限购标记，允许用户重试
            throw new BizException(500, "活动库存未预热，请先预热");
        }
        if (r == 0) {
            redis.delete(userKey);
            throw new BizException(400, "手慢了，库存已抢光");
        }

        // 4. 发 MQ（Day20 核心改动）：把「写库」这件慢事丢给消费者异步做，请求线程立即返回。
        String orderNo = generateOrderNo();
        try {
            seckillMqProducer.send(new SeckillMessage(userId, activityId, orderNo));
        } catch (Exception e) {
            // 一致性补救：Redis 已扣减、消息没发出去 → 用户「抢到了」但订单永远不落库。
            // 这里回补库存 + 清限购标记，让用户能重试。
            // ⚠️ 但如果进程在「扣减成功后、发消息前」恰好宕机，这个 catch 根本进不来——
            //    那才是真正的难题，RocketMQ 事务消息（Day21）就是为它准备的。
            log.error("发送秒杀消息失败，回补库存：activityId={} userId={}", activityId, userId, e);
            redis.opsForValue().increment(stockKey);
            redis.delete(userKey);
            throw new BizException(500, "系统繁忙，请重试");
        }

        // 5. 立即返回「排队中」：用户拿到的是「抢购成功」，订单由消费者在后台慢慢出
        return new SeckillResult(orderNo, "排队中，正在出单");
    }

    /** 预生成订单号：时间戳 + 随机数（Day24 会换成雪花算法分布式 ID） */
    private String generateOrderNo() {
        return "SK" + System.currentTimeMillis() + ThreadLocalRandom.current().nextInt(1000, 9999);
    }

    /** 秒杀返回体：给前端一个订单号和出单状态 */
    @Data
    @AllArgsConstructor
    public static class SeckillResult {
        private String orderNo;
        private String status;
    }
}
```

**配套控制器** `E:\course-mall\mall-seckill\src\main\java\com\mall\seckill\controller\SeckillController.java`（只改抢购接口的返回泛型，路径、参数、`preload` 全部不变）：

```java
package com.mall.seckill.controller;

import com.mall.common.result.Result;
import com.mall.seckill.service.SeckillService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/seckill")
public class SeckillController {

    private final SeckillService seckillService;

    public SeckillController(SeckillService seckillService) {
        this.seckillService = seckillService;
    }

    // 预热接口不变（Day19 已有，原样保留）
    @PostMapping("/preload/{activityId}")
    public Result<Integer> preload(@PathVariable Long activityId) {
        return Result.ok(seckillService.preload(activityId));
    }

    // 抢购：唯一改动是返回泛型从 Result<String> 变成 Result<SeckillResult>
    @PostMapping("/{activityId}")
    public Result<SeckillService.SeckillResult> seckill(@PathVariable Long activityId,
                                                        @RequestParam Long userId) {
        return Result.ok(seckillService.doSeckill(activityId, userId));
    }
}
```

**为什么「预扣减 + 发 MQ」能让接口变快？**

因为第 3 步之前都是纯 Redis 操作（内存、单线程、微秒级），第 4 步的写库被挪到 MQ 消费者里异步执行了。请求线程不再等待 MySQL 的 insert，做完 Redis 就返回，吞吐量上一个数量级。

::: tip 💡 面试题：为什么「预扣减」比「下单时扣库存」更适合秒杀？
**一句话**：预扣减把「抢资格」和「生成订单」拆开——**抢资格**只在 Redis 里做（快、扛得住高并发），**生成订单**放异步慢慢做（慢、但不需要快）。用户在毫秒级拿到「抢没抢到」的结果，数据库也不用承受洪峰。代价是一致性问题（Redis 扣了但 DB 没落成功怎么办），那是 Day 21 事务消息、Day 23 分布式事务要解决的。详见 [Redis](/learn_database/Redis)。
:::

### 步骤 5：消费者 —— 异步落库（削峰的关键）

消息发出去后，谁来真正写数据库？消费者。它跑在同一个服务里，但以**独立线程、受控并发**去消费，天然比「每个请求线程都去抢 MySQL 连接」平稳。

`E:\course-mall\mall-seckill\src\main\java\com\mall\seckill\mq\SeckillOrderConsumer.java`：

```java
package com.mall.seckill.mq;

import com.mall.seckill.entity.SeckillOrder;
import com.mall.seckill.mapper.SeckillOrderMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Component;

@Slf4j
@Component
// 声明这是一个 RocketMQ 消费者：监听 seckill-order-topic，属于 seckill-order-consumer-group
// 同一个 consumerGroup 下的多个实例会「负载均衡」地分摊消息（并发消费）
@RocketMQMessageListener(topic = "seckill-order-topic", consumerGroup = "seckill-order-consumer-group")
@RequiredArgsConstructor
public class SeckillOrderConsumer implements RocketMQListener<SeckillMessage> {

    private final SeckillOrderMapper seckillOrderMapper;

    @Override
    public void onMessage(SeckillMessage msg) {
        log.info("消费秒杀消息：userId={} activityId={} orderNo={}",
                msg.getUserId(), msg.getActivityId(), msg.getOrderNo());

        SeckillOrder order = new SeckillOrder();
        order.setUserId(msg.getUserId());
        order.setActivityId(msg.getActivityId());
        order.setOrderNo(msg.getOrderNo());

        try {
            seckillOrderMapper.insert(order);
        } catch (DuplicateKeyException e) {
            // 幂等：MQ 是「至少一次」投递，消息可能被重复消费。
            // seckill_order 表有 uk_user_activity(user_id, activity_id) 联合唯一索引，
            // 同人同活动第二次 insert 必然撞唯一索引 → 这里吞掉即可，不会重复下单。
            // 注意：吞掉而不是往外抛——如果抛出去，MQ 会当消费失败重试 16 次，白白浪费。
            log.warn("重复消息，已忽略：{}", msg.getOrderNo());
        }
    }
}
```

实体和 Mapper 是 Day 19 已建的，贴出来对照确认（**不用改**）：

`E:\course-mall\mall-seckill\src\main\java\com\mall\seckill\entity\SeckillOrder.java`：

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

`E:\course-mall\mall-seckill\src\main\java\com\mall\seckill\mapper\SeckillOrderMapper.java`：

```java
package com.mall.seckill.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.seckill.entity.SeckillOrder;

public interface SeckillOrderMapper extends BaseMapper<SeckillOrder> {
}
```

::: tip 💡 面试题：MQ 消费者怎么保证「重复消费不会重复下单」？
**一句话**：靠**数据库唯一索引做幂等**。MQ 至少一次投递，消息可能重复；但 `seckill_order` 的 `(user_id, activity_id)` 联合唯一索引保证同一人同一场只能插一行，第二次 insert 撞唯一索引抛 `DuplicateKeyException`，捕获后直接忽略即可。**幂等的终极兜底是数据库约束，不是靠应用层「先查再插」**（先查再插有并发窗口）。详见 [MySQL](/learn_database/MySQL)。
:::

::: tip 💡 面试题：消费者处理消息时抛异常会怎样？
**一句话**：RocketMQ 默认会按**退避策略重试，最多 16 次**（间隔递增），16 次后还失败就进死信队列（`%DLQ%`）。所以 `onMessage` 里「吞掉」`DuplicateKeyException` 是必要的——它不是业务失败而是幂等命中，不该触发重试；真正的失败（如数据库挂了）才应该抛出去让它重试。死信队列和「消息不丢失」是 Day 22 的内容。详见 [RocketMQ](/learn_backend/java/微服务/RocketMQ)。
:::

### 步骤 6：限流 —— Redis 令牌桶

削峰解决的是「放进来之后的压力」，限流解决的是「放多少进来」。今天实现最经典的**令牌桶算法**：桶里按固定速率（rate）往里放令牌，每个请求要拿走一个令牌，拿不到就被拒绝。

**为什么用 Redis 而不是本地变量做限流？** 因为秒杀服务未来可能是多实例部署，本地计数器只在单个 JVM 里生效，多实例加起来就放大了 N 倍。放 Redis 里，所有实例共享同一个桶，才是全局精确的限流。

`E:\course-mall\mall-seckill\src\main\java\com\mall\seckill\util\RateLimiter.java`：

```java
package com.mall.seckill.util;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.util.Collections;

@Component
@RequiredArgsConstructor
public class RateLimiter {

    // 令牌桶 Lua 脚本：原子完成「按时间差补令牌 + 拿一个令牌」，避免「读-算-写」之间的并发窗口。
    // public：RateLimiterConfig 注册 Bean 时也要引用同一份脚本文本，所以不能 private
    public static final String TOKEN_BUCKET_LUA =
            "local key = KEYS[1]\n" +                          // 限流 key（存当前令牌数）
            "local capacity = tonumber(ARGV[1])\n" +           // 桶容量（最多能攒多少令牌）
            "local rate = tonumber(ARGV[2])\n" +               // 每秒补充令牌数
            "local now = tonumber(ARGV[3])\n" +                // 当前时间（毫秒）
            "local tokens = tonumber(redis.call('GET', key))\n" +
            "if tokens == nil then tokens = capacity end\n" +  // 首次访问：桶是满的（允许一波小突发）
            "local last = tonumber(redis.call('GET', key .. ':ts'))\n" +
            "if last == nil then last = now end\n" +
            "local refill = math.floor((now - last) / 1000 * rate)\n" +  // 距上次访问该补几个令牌
            "if refill > 0 then\n" +
            "  tokens = math.min(capacity, tokens + refill)\n" +         // 补令牌，但不超过桶容量
            "  redis.call('SET', key .. ':ts', tostring(now))\n" +
            "  redis.call('PEXPIRE', key .. ':ts', 60000)\n" +
            "end\n" +
            "if tokens >= 1 then\n" +                          // 拿得到一个令牌就放行
            "  redis.call('SET', key, tostring(tokens - 1))\n" +
            "  redis.call('PEXPIRE', key, 60000)\n" +          // 设过期，防止限流 key 越积越多
            "  return 1\n" +
            "else\n" +
            "  redis.call('PEXPIRE', key, 60000)\n" +          // 拒绝也续一下过期：冷门 key 无人访问后会被自然清理
            "  return 0\n" +                                   // 拿不到 → 拒绝
            "end";

    private final StringRedisTemplate redisTemplate;
    private final DefaultRedisScript<Long> tokenBucketScript;

    /** 尝试获取一个令牌。true=放行，false=限流拒绝 */
    public boolean tryAcquire(String key, int capacity, int rate) {
        Long result = redisTemplate.execute(
                tokenBucketScript,
                Collections.singletonList(key),
                String.valueOf(capacity),
                String.valueOf(rate),
                String.valueOf(System.currentTimeMillis())
        );
        return Long.valueOf(1L).equals(result);
    }
}
```

把 Lua 脚本注册成 Bean `E:\course-mall\mall-seckill\src\main\java\com\mall\seckill\config\RateLimiterConfig.java`：

```java
package com.mall.seckill.config;

import com.mall.seckill.util.RateLimiter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.core.script.DefaultRedisScript;

@Configuration
public class RateLimiterConfig {

    // 把令牌桶脚本注册成 Bean，方便注入。
    // 结果类型 Long：脚本 return 1/0，Redis 返回的是整数，映射成 Long
    @Bean
    public DefaultRedisScript<Long> tokenBucketScript() {
        DefaultRedisScript<Long> script = new DefaultRedisScript<>();
        script.setScriptText(RateLimiter.TOKEN_BUCKET_LUA);
        script.setResultType(Long.class);
        return script;
    }
}
```

::: tip 💡 面试题：令牌桶、漏桶、固定窗口计数器，三种限流算法有什么区别？
**一句话**：**固定窗口计数器**最简单（一个 key 计数，到点清零），但有「临界问题」——第 1 秒末尾和第 2 秒开头各 500 个请求，加起来 1000，却在瞬间同时涌进来；**漏桶**（请求先入桶，按固定速率流出）能强制匀速，但会「拖慢」突发流量；**令牌桶**（按速率补令牌，请求拿令牌）既限平均速率、又允许一定突发（桶里攒的令牌可被一次性拿走），是**最常用**的限流算法。详见 [Redis](/learn_database/Redis)。
:::

> 今天手写令牌桶是为了搞懂原理；生产上入口限流直接用 **Sentinel**（Day 17 用过）或网关层限流，别重复造轮子。

### 步骤 7：启动验证

```bash
# 在 E:\course-mall\ 根目录
mvn clean install -DskipTests          # 编译安装
mvn -pl mall-seckill spring-boot:run   # 启动秒杀服务（8082）
```

**1. 预热库存**（用 Day 19 已有的预热接口，而不是手塞 Redis）：

```bash
curl -X POST "http://localhost:8082/api/seckill/preload/1"
# 预期：{"code":200,"data":100}
```

> 如果之前测试过 Day 19，先清掉旧状态再预热，避免「已参与过」的干扰：
> `redis-cli DEL seckill:stock:1 seckill:user:1:1 seckill:limit:1`

**2. 调用秒杀接口**（用户 1 抢活动 1）：

```bash
curl -X POST "http://localhost:8082/api/seckill/1?userId=1"
# 预期立即返回（毫秒级，不用等写库）：
# {"code":200,"data":{"orderNo":"SK172...","status":"排队中，正在出单"}}
```

**3. 观察消费者日志**，几秒内能看到：

```
消费秒杀消息：userId=1 activityId=1 orderNo=SK172...
```

**4. 查库确认订单已异步落库**：

```sql
SELECT * FROM seckill_order WHERE user_id = 1 AND activity_id = 1;
```

**5. 验证限流**：把 `SeckillService` 里的 `LIMIT_RATE` 临时改成 2（改代码重启），清理 key 后连发 10 次请求，观察只有前 2 个左右成功，后面全是 `{"code":429,"message":"请求过于频繁，请稍后再试"}`。

**6. 验证削峰效果**（核心）：用 Day 29 会学的 JMeter 压测，或简单用多线程脚本同时发 1000 个请求。观察：接口响应时间稳定在毫秒级，而 `seckill_order` 表的 insert 是「陆续」落库的，不是瞬间 1000 条同时写——这就是「蓄水池」把洪峰削平的直接证据。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| 消息队列削峰、异步解耦、至少一次投递、消费重试 | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| 令牌桶限流算法、Redis Lua 原子脚本 | [Redis](/learn_database/Redis) |
| 唯一索引做幂等、防重复插入 | [MySQL](/learn_database/MySQL) |
| 令牌桶 vs 漏桶 vs 计数器的并发思想 | [并发编程](/learn_backend/java/Java核心/并发编程) |
| `@RocketMQMessageListener`、`RocketMQTemplate` 自动装配 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| 生产级限流组件 Sentinel（Day17 已用） | [Sentinel](/learn_backend/java/微服务/Sentinel) |
| 削峰限流属于分布式架构的通用抗压手段 | [分布式基础](/learn_backend/java/微服务/分布式基础) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] RocketMQ 启动成功（NameServer/Broker 日志出现 boot success）：是 / 否
- [ ] 秒杀接口毫秒级返回「排队中」，且几秒后 `seckill_order` 表里出现了订单：是 / 否
- [ ] 连发多次请求，超量部分被 429 拒绝：是 / 否
- [ ] 踩坑记录（RocketMQ 启动失败、消息没被消费、限流没生效等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. 削峰到底「削」掉的是什么？为什么 Redis 扣减成功后不直接写库，而是发一条 MQ 消息？MQ 在这里扮演什么角色？
2. 限流和削峰的区别？为什么入口限流和 MQ 削峰都要做，只做一个行不行？
3. 令牌桶和漏桶的区别是什么？固定窗口计数器的「临界问题」具体是怎么回事？为什么限流器要放在 Redis 而不是本地变量？
4. MQ 消息被重复消费时，为什么不会重复下单？`uk_user_activity` 唯一索引在这里起了什么作用？「先查再插」为什么不行？消费者 `onMessage` 里为什么要「吞掉」`DuplicateKeyException` 而不是抛出去？
5. 如果 Redis 预扣减成功、但发 MQ 时异常，今天的代码是怎么补救的？如果进程在「扣减成功后、发消息前」恰好宕机，这个补救还来得及吗？RocketMQ 的什么特性能根治？（提示：为 Day 21 事务消息、Day 22 消息不丢失铺路）
