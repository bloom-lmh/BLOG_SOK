# RedisTemplate

> 一句话定位：Spring Data Redis 提供的 Redis 客户端模板类——把六大数据结构的命令封装成 `opsForXxx().方法()` 的 Java API，替你管好连接池、序列化和异常翻译。你写 `valueOps.set(k, v)`，它帮你发 `SET k v`。

---

## 基础篇

### 1. 解决什么问题

直接用底层客户端（Jedis / Lettuce）要自己管：连接获取归还、参数转字节、异常处理。RedisTemplate 统一包了三层：

| 它替你做的事 | 具体是什么 |
| --- | --- |
| 连接管理 | 底层 Lettuce 连接池，自动获取归还 |
| 序列化 | key/value 对象 ↔ 字节的转换（可配策略，见高级篇） |
| 异常翻译 | Redis 异常统一转成 Spring 的 `DataAccessException` 体系 |

### 2. 两个模板怎么选

| 模板 | 泛型 | 适用 |
| --- | --- | --- |
| `RedisTemplate<String, Object>` | value 可以是任意对象 | 存对象（配 JSON 序列化器） |
| `StringRedisTemplate` | key/value 都是 String | 计数器、验证码、锁这类纯字符串场景 |

`StringRedisTemplate` Boot 已自动配置好，直接注入就能用；`RedisTemplate<String, Object>` 默认的序列化器有坑（见高级篇），项目里都会自己重配一个 Bean。

### 3. 依赖与配置

```xml
<!-- Boot 3.x，底层默认 Lettuce -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-redis</artifactId>
</dependency>
```

```java
@Configuration
public class RedisConfig {

    @Bean
    @ConditionalOnMissingBean(name = "redisTemplate")   // 你没配我才配——自动配置同一套路
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        // key 用 String 序列化（人可读），value 用 JSON 序列化（可读、跨语言）
        template.setKeySerializer(RedisSerializer.string());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        template.setHashKeySerializer(RedisSerializer.string());
        template.setHashValueSerializer(new GenericJackson2JsonRedisSerializer());
        template.afterPropertiesSet();
        return template;
    }
}
```

```yaml
spring:
  data:
    redis:
      host: localhost
      port: 6379
      # password: xxx
      lettuce:
        pool:
          max-active: 8      # 连接池需要 commons-pool2 依赖
```

### 4. opsForValue · String 操作（最常用）

```java
ValueOperations<String, Object> ops = redisTemplate.opsForValue();

ops.set("user:1001", userJSON);                       // SET
ops.set("captcha:13800", "246810", 5, TimeUnit.MINUTES);  // SET + EX 过期
ops.get("user:1001");                                 // GET

ops.setIfAbsent("lock:order:1", uuid, 30, TimeUnit.SECONDS);  // SET NX EX，分布式锁加锁
ops.increment("seckill:stock:1");                     // INCR，原子自增（值必须是纯数字）
ops.multiSet(Map.of("k1", "v1", "k2", "v2"));         // MSET 批量
List<Object> list = ops.multiGet(List.of("k1", "k2"));   // MGET 批量
```

### 5. opsForHash · Hash 操作

```java
HashOperations<String, Object, Object> ops = redisTemplate.opsForHash();

ops.put("cart:user:1001", "course:1", "2");           // HSET 单字段
ops.putAll("cart:user:1001", Map.of("course:2", "1"));  // HMSET 多字段
ops.get("cart:user:1001", "course:1");                // HGET 单字段
ops.entries("cart:user:1001");                        // HGETALL，拿整个 Map
ops.increment("cart:user:1001", "course:1", 1);       // HINCRBY，数量 +1
ops.delete("cart:user:1001", "course:1");             // HDEL 删字段
```

### 6. opsForList · List 操作

```java
ListOperations<String, Object> ops = redisTemplate.opsForList();

ops.leftPush("danmaku:1", "弹幕内容");                 // LPUSH 头插
ops.range("danmaku:1", 0, 9);                         // LRANGE 最新 10 条
ops.trim("danmaku:1", 0, 99);                         // LTRIM 只留最新 100 条
ops.rightPop("queue:order", 10, TimeUnit.SECONDS);    // BRPOP 阻塞消费队列
```

### 7. opsForSet · Set 操作

```java
SetOperations<String, Object> ops = redisTemplate.opsForSet();

ops.add("fans:1001", "u1", "u2");                     // SADD
ops.isMember("fans:1001", "u1");                      // SISMEMBER 判断存在
ops.intersect("fans:1001", "fans:1002");              // SINTER 共同好友
ops.difference("fans:1001", "fans:1002");             // SDIFF 差集（方向：A 有 B 没有）
ops.pop("lottery:1");                                 // SPOP 随机弹出（抽奖）
```

### 8. opsForZSet · ZSet 操作（排行榜核心）

```java
ZSetOperations<String, Object> ops = redisTemplate.opsForZSet();

ops.add("hot:search", "话题A", 95.0);                  // ZADD，score 是热度
ops.incrementScore("hot:search", "话题A", 1);          // ZINCRBY，热度 +1
ops.reverseRange("hot:search", 0, 9);                 // ZREVRANGE 热度 Top10（分数从高到低）
ops.rangeByScore("delay:queue", 0, System.currentTimeMillis());  // ZRANGEBYSCORE 到期的延迟任务
ops.rank("hot:search", "话题A");                       // ZRANK 排名（低到高），reverseRank 反之
```

### 9. 通用操作 · 直接调 redisTemplate

```java
redisTemplate.delete("user:1001");                    // DEL
redisTemplate.delete(List.of("k1", "k2"));            // 批量 DEL
redisTemplate.hasKey("user:1001");                    // EXISTS
redisTemplate.expire("user:1001", 10, TimeUnit.MINUTES);  // EXPIRE 续期
redisTemplate.getExpire("user:1001");                 // TTL，-1 永不过期 / -2 不存在

// SCAN 代替 KEYS：KEYS * 会阻塞单线程，生产禁用；SCAN 游标分批，每次只扫一点
ScanOptions options = ScanOptions.scanOptions().match("user:*").count(100).build();
try (Cursor<String> cursor = redisTemplate.scan(options)) {
    cursor.forEachRemaining(System.out::println);
}
```

---

## 高级篇

### 10. execute 调 Lua 脚本

用 `DefaultRedisScript` 封装脚本文本 + 返回类型，`execute(script, keys, args...)` 传参——**第一个参数是脚本，第二个是 KEYS 列表，剩下全是可变参数变 ARGV**：

```java
// 锁释放脚本：校验归属 + 删除，原子
private static final DefaultRedisScript<Long> UNLOCK_SCRIPT = new DefaultRedisScript<>(
        "if redis.call('get',KEYS[1]) == ARGV[1] then " +
        "return redis.call('del',KEYS[1]) else return 0 end", Long.class);

Long result = redisTemplate.execute(UNLOCK_SCRIPT, List.of("lock:order:1"), uuid);
```

| Java 实参 | 脚本里取 |
| --- | --- |
| `UNLOCK_SCRIPT` | 脚本本身（等价 EVAL 的脚本段） |
| `List.of("lock:order:1")` | `KEYS[1]` |
| `uuid` | `ARGV[1]` |

::: tip 💡 面试题：execute 为什么把 keys 和 args 分开传，而不是全当参数？
**一句话**：集群模式下 Redis 要用 key 算槽位（CRC16 % 16384）决定路由到哪个节点，只有显式声明「哪些是 key」，代理/集群才能正确转发；混进 args 就没法路由了。所以官方规范要求脚本只操作 KEYS 里声明的 key。
:::

### 11. Pipeline · 批量省网络往返

```java
// 一次发送 N 条命令，N 次 RTT 变 1 次；注意：不保证原子性，中途可能插入别的命令
List<Object> results = redisTemplate.executePipelined(new RedisCallback<Object>() {
    public Object doInRedis(RedisConnection connection) {
        StringRedisConnection conn = (StringRedisConnection) connection;
        for (int i = 0; i < 1000; i++) {
            conn.set("key:" + i, "v" + i);
        }
        return null;    // 必须返回 null，结果由 executePipelined 收集
    }
});
```

和 Lua 的分工：**要原子选 Lua，只要快选 Pipeline**。

### 12. 序列化器对比（乱码问题的根源）

默认的 `RedisTemplate` 用 **JDK 序列化**，这就是你用客户端工具看到 value 是乱码 `\xac\xed\x00...` 的原因：

| 序列化器 | 特点 | 结论 |
| --- | --- | --- |
| JDK（默认） | 带 Java 类型信息，必须实现 `Serializable`；二进制乱码、体积大、跨语言不兼容 | 默认配置，**生产别用** |
| `GenericJackson2JsonRedisSerializer` | JSON 可读、体积小、跨语言；自动带 `@class` 字段记录类型（反序列化还原成原类型） | 存对象用它 |
| `RedisSerializer.string()` | 纯字符串 | key 一律用它 |

注意：换序列化器只对**新写入**的数据生效，旧数据格式不兼容，要清掉旧 key 或换 key 前缀。

---

## 面试常问

- **Q：RedisTemplate 和 StringRedisTemplate 的区别？** 泛型不同：前者 value 可以是任意对象（靠序列化器转换），后者 key/value 都是 String。两者序列化器独立配置，**互相看不到对方写的 key**（序列化格式不同，同名 key 读出来对不上）。

- **Q：默认 RedisTemplate 有什么坑？** JDK 序列化——客户端看到乱码、体积大、要求实现 Serializable、跨语言不兼容。解法：自定义 Bean 把 key 换 String、value 换 JSON 序列化器，或干脆用 StringRedisTemplate。

- **Q：分布式锁加锁怎么写才对？** `setIfAbsent(key, uuid, 30, TimeUnit.SECONDS)`——一条命令等价 `SET NX EX`，原子。**不要** `setIfAbsent` 再 `expire` 两步：中间宕机会死锁（对应分布式锁缺陷 2）。

- **Q：increment 有什么要求？** 值必须是能转成整数的字符串，否则报错；它是原子操作，天然适合计数器/秒杀预扣，不需要加锁。

- **Q：生产上为什么用 SCAN 不用 KEYS？** KEYS 一次遍历全库会阻塞单线程（几百万 key 卡几秒，所有请求排队）；SCAN 游标分批、每次 count 个，不阻塞。同理 HSCAN/SSCAN/ZSCAN。

- **Q：Lua 和 Pipeline 怎么选？** 要「多命令原子 + 逻辑判断」用 Lua；纯批量读写提速用 Pipeline（不原子、更快）。两者都省网络往返。

---

## 相关知识

- [Redis](/learn_database/Redis)：数据结构、缓存三大问题、分布式锁的原理篇在这边，本文只管 Java 侧怎么调
- [Lombok](/learn_backend/java/工具/Lombok)：`@RequiredArgsConstructor` + final 字段注入 RedisTemplate
- [Spring Security](/learn_backend/java/基础/Spring Security)：`@ConditionalOnMissingBean(name = "redisTemplate")` 与自动配置的关系
