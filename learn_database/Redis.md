# Redis

一句话定位：Redis 是一个基于内存的高性能 Key-Value 存储系统，用单线程执行命令 + IO 多路复用 + 丰富的数据结构，解决「高并发下的快速读写、缓存、分布式协调」问题，常被用作缓存、分布式锁、计数器、排行榜和消息队列。

## 目录

- [基础篇](#基础篇)：Redis 是什么、为什么快、五大数据类型、过期与淘汰、事务
- [高级篇](#高级篇)：缓存三大问题、缓存一致性、持久化、主从/哨兵/集群、分布式锁
- [原理篇](#原理篇)：单线程模型、底层数据结构、对象系统、内存淘汰算法、持久化与集群原理
- [面试常问](#面试常问)

---

## 基础篇

### 1. Redis 是什么

**背景**：传统的关系型数据库（如 MySQL）把数据存在磁盘上，一次查询要走磁盘 IO，毫秒级延迟；当业务流量上来（秒杀、微博热点、排行榜），单靠数据库扛不住，数据库很容易被「打崩」。

**定义**：Redis（Remote Dictionary Server，远程字典服务）是 Salvatore Sanfilippo（网名 antirez）用 C 语言写的一个开源、基于内存、支持多种数据结构的 NoSQL 键值数据库。

**特性**：

- **纯内存**：数据存在内存里，读写都是纳秒/微秒级，比磁盘快几个数量级。
- **数据结构丰富**：不止是 String，还有 Hash、List、Set、ZSet、Bitmap、HyperLogLog、Geo、Stream 等。
- **单线程执行命令**：命令执行串行化，天然避免并发写竞争，不需要加锁。
- **支持持久化**：虽然是内存数据库，但可以把数据落到磁盘（RDB / AOF），重启不丢数据。
- **支持主从、哨兵、集群**：横向扩展和高可用。
- **原子操作**：单条命令是原子的，还支持 Lua 脚本把多条命令打包成原子操作。

**典型应用场景**：

| 场景 | 说明 | 用的结构 |
| --- | --- | --- |
| 缓存 | 缓存热点数据，减轻 DB 压力 | String / Hash |
| 分布式锁 | 多个服务争抢同一把锁 | String + `SET NX EX` |
| 计数器 | 点赞数、浏览量原子自增 | String `INCR` |
| 排行榜 | 按分数排序 | ZSet |
| 消息队列 | 简单异步解耦 | List / Stream |
| 共同好友/去重 | 集合运算 | Set |
| 限流 | 接口调用频率限制 | String + Lua / ZSet |
| 分布式会话 | 存储登录态 session | String / Hash |

**小结**：Redis 的本质是「把数据结构从磁盘搬到内存，并暴露成远程服务」。它解决的核心问题是**高性能读写**，同时通过丰富的数据结构承担了缓存之外的很多分布式中间件职责。

---

### 2. 安装与启动

**Linux 安装（源码或包管理器）**：

```bash
# 方式一：apt / yum 直接装
sudo apt-get install redis-server        # Ubuntu / Debian
sudo yum install redis                   # CentOS

# 方式二：源码编译（可以拿到最新版）
wget https://download.redis.io/releases/redis-7.0.0.tar.gz
tar xzf redis-7.0.0.tar.gz
cd redis-7.0.0
make && make install
```

**启动方式**：

```bash
# 前台启动（会占用终端）
redis-server

# 指定配置文件启动（生产推荐）
redis-server /etc/redis/redis.conf

# 后台启动：在 redis.conf 里把 daemonize 改成 yes
redis-server /etc/redis/redis.conf

# 客户端连接
redis-cli -h 127.0.0.1 -p 6379 -a 密码
```

**关键配置文件项**（`redis.conf`）：

| 配置项 | 含义 | 常用值 |
| --- | --- | --- |
| `bind` | 允许访问的网卡地址 | `0.0.0.0` 表示所有网卡 |
| `port` | 端口 | `6379` |
| `daemonize` | 是否后台运行 | `yes` |
| `requirepass` | 访问密码 | 生产必设 |
| `maxmemory` | 最大内存，超过触发淘汰 | `4gb` 等 |
| `maxmemory-policy` | 淘汰策略 | `allkeys-lru` |
| `appendonly` | 是否开启 AOF | `yes` |
| `appendfsync` | AOF 刷盘策略 | `everysec` |

> 生产环境的三个必改项：**设密码**（`requirepass`）、**限制内存**（`maxmemory`）、**配置淘汰策略**（`maxmemory-policy`）。

---

### 3. 为什么 Redis 快

三个核心原因，缺一不可：

1. **纯内存操作**：数据全在内存，读写是内存寻址，纳秒级；磁盘 IO 是毫秒级，差了 4~5 个数量级。
2. **单线程执行命令**：没有线程上下文切换、没有多线程加锁/解锁的开销，也天然避免了数据竞争（注意：这里的「单线程」指的是**执行命令**的线程；Redis 6.0 之后网络 IO 读写引入了多线程，但命令执行仍是单线程串行）。
3. **IO 多路复用**：一个线程用 epoll 同时监听成千上万个 socket，谁有事件处理谁，而不是阻塞在一个连接上干等。

此外还有几个「隐性」提速点：

- 底层数据结构高度优化（SDS、跳表、压缩列表等），很多操作是 O(1) 或 O(log n)。
- 局部性原理 + 高效的协议（RESP 简单文本协议，解析快）。
- 用 C 语言编写，贴近硬件。

::: tip 💡 面试题：Redis 为什么快？
一句话结论：内存存储 + 单线程无锁 + IO 多路复用。原因：数据在内存访问快；单线程省去线程切换和锁竞争；epoll 多路复用让一个线程能扛住海量并发连接。展开：Redis 的瓶颈通常不在 CPU 而在内存和网络带宽，所以单线程模型在命令执行层面反而更高效；真正需要警惕的是 CPU 密集的大 key 操作（如 `KEYS *`）。
:::

---

### 4. 五大数据类型

#### 4.1 String（字符串）

**背景**：最简单的类型，一个 key 对应一个字符串值，是缓存场景的主力。

**定义**：String 类型的 value 可以是字符串、整数或浮点数，最大能存 512MB。底层用 SDS（简单动态字符串）存储，不是 C 原生字符串。

**特性**：

- 支持「字符串」和「数字」两种视角：存数字时可以 `INCR/DECR` 原子自增。
- 二进制安全：value 里可以放任意字节（图片、序列化对象），不会因为 `\0` 截断。
- 单条命令原子：`INCR` 是原子的，不用怕并发。

**常用命令**：

| 命令 | 作用 | 示例 |
| --- | --- | --- |
| `SET key value [EX s] [NX/XX]` | 设置值，可带过期/互斥 | `SET user:1 zhangsan EX 3600` |
| `GET key` | 获取值 | `GET user:1` |
| `INCR / DECR` | 整数自增/自减 | `INCR page:view` |
| `INCRBY / DECRBY` | 按步长增减 | `INCRBY stock -1` |
| `SETNX` | 不存在才设置（分布式锁老写法） | `SETNX lock:1 uuid` |
| `SETEX` | 设置并带过期时间 | `SETEX code:1 60 123456` |
| `MSET / MGET` | 批量设置/获取 | `MGET a b c` |
| `APPEND` | 追加字符串 | `APPEND log "xxx"` |
| `GETSET` | 设置并返回旧值 | `GETSET key newval` |
| `SETBIT / GETBIT / BITCOUNT` | 位操作 | `BITCOUNT online:today` |

**示例**：

```bash
# 1. 缓存对象：存 JSON 字符串，带过期时间
SET user:1 '{"name":"zhangsan","age":18}' EX 3600   # EX 3600：1 小时后过期

# 2. 计数器：原子自增，天然线程安全
INCR page:view:article:100          # 浏览 +1
INCRBY user:1:fans 10               # 粉丝 +10

# 3. 分布式锁：NX 保证互斥，EX 防止死锁
SET lock:order:100 uuid-xxxx NX EX 30   # 只有 key 不存在时才设置成功

# 4. 批量读写：减少网络往返（RTT）
MSET user:1 zs user:2 ls user:3 ww
MGET user:1 user:2 user:3

# 5. 位图统计签到
SETBIT sign:2024:01 1 1             # 1 号用户签到
SETBIT sign:2024:01 2 1
BITCOUNT sign:2024:01               # 统计签到人数
```

**小结**：String 是 Redis 的「万金油」，缓存、计数器、分布式锁、位图统计都用它。关键记住：`INCR` 原子自增做计数、`SET ... NX EX` 做锁、`MGET/MSET` 批量化。

#### 4.2 Hash（哈希）

**背景**：存对象时如果用 String 存整个 JSON，更新某个字段要整体序列化再写回；Hash 可以把对象的字段拆成 field-value，按字段读写。

**定义**：Hash 是一个 String 类型的 field-value 映射表，特别适合存储对象（如用户信息：name、age、email 各是一个 field）。

**底层结构**：数据量小时用压缩列表（ziplist）或 listpack，数据量大时转为哈希表（hashtable）。两个转换条件：`hash-max-ziplist-entries`（默认 512）和 `hash-max-ziplist-value`（默认 64 字节）。

**特性**：

- 按字段读写，更新某个字段不用整体重写。
- 单个 Hash 可存 2^32 - 1 个 field。
- 适合「对象」这种结构化的数据，比 String 存 JSON 更细粒度。

**常用命令**：

| 命令 | 作用 | 示例 |
| --- | --- | --- |
| `HSET key field value` | 设置单个字段 | `HSET user:1 name zs` |
| `HMSET` | 设置多个字段（旧，新用 HSET 多参数） | `HSET user:1 name zs age 18` |
| `HGET` | 获取单个字段 | `HGET user:1 name` |
| `HGETALL` | 获取所有字段和值（大 Hash 慎用） | `HGETALL user:1` |
| `HINCRBY` | 字段数值自增 | `HINCRBY user:1 age 1` |
| `HDEL` | 删除字段 | `HDEL user:1 age` |
| `HEXISTS` | 判断字段是否存在 | `HEXISTS user:1 name` |
| `HLEN` | 字段数量 | `HLEN user:1` |
| `HKEYS / HVALS` | 所有字段名 / 所有值 | `HKEYS user:1` |

**示例**：

```bash
# 存对象
HSET user:1001 name zhangsan age 18 email zs@qq.com

# 只改年龄，不影响其他字段（对比 String 存 JSON 要整体重写）
HINCRBY user:1001 age 1

# 读部分字段
HMGET user:1001 name age
```

**小结**：Hash 是「对象存储」的正解，字段级读写避免了整体序列化。但注意 `HGETALL` 在大 Hash 下会阻塞主线程，生产建议用 `HSCAN` 分批取。

#### 4.3 List（列表）

**背景**：需要一个「有序、可两端插入、可截取一段」的结构，比如最新消息列表、简单消息队列。

**定义**：List 是一个双向链表，元素有序、可重复，可以在头部（左）和尾部（右）插入/弹出。

**底层结构**：Redis 3.2 之前用「双向链表 + 压缩列表」混合；3.2 之后统一用 **quicklist**（由多个 ziplist/listpack 节点串起来的双向链表），兼顾内存紧凑和两端操作 O(1)。

**特性**：

- 有序、可重复。
- 两端操作 O(1)（`LPUSH/RPUSH/LPOP/RPOP`）。
- 支持按索引范围截取 `LRANGE`（O(n) 但常用）。
- 可以做简单消息队列：`LPUSH + RPOP` 或 `RPUSH + LPOP`，但要注意可靠消费要配合 `BRPOP` 阻塞。

**常用命令**：

| 命令 | 作用 | 示例 |
| --- | --- | --- |
| `LPUSH / RPUSH` | 左/右插入 | `RPUSH msg "hello"` |
| `LPOP / RPOP` | 左/右弹出 | `RPOP msg` |
| `LRANGE key start stop` | 取范围内元素 | `LRANGE msg 0 -1` |
| `LLEN` | 列表长度 | `LLEN msg` |
| `LINDEX` | 按下标取 | `LINDEX msg 0` |
| `LREM` | 删除指定元素 | `LREM msg 0 "hello"` |
| `LTRIM` | 只保留一段（裁剪） | `LTRIM msg 0 99` |
| `BRPOP / BLPOP` | 阻塞弹出（超时） | `BRPOP queue 10` |

**示例**：

```bash
# 最新 10 条消息
RPUSH news "msg1" "msg2" "msg3"      # 新消息从尾部插入
LRANGE news 0 9                       # 取最新 10 条
LTRIM news 0 99                       # 只保留最新 100 条，防止无限增长

# 阻塞消息队列：生产者 RPUSH，消费者 BRPOP（队列空时阻塞等待，超时 10s）
RPUSH queue:task "task1"
BRPOP queue:task 10                   # 有消息立刻弹出，没有则阻塞最多 10 秒
```

**小结**：List 是有序可重复的双向链表，两端操作 O(1)，适合「最新列表」和「简单队列」。做队列要留意：`LPOP` 空轮询浪费 CPU，用 `BRPOP` 阻塞等待；可靠性要求高的话，直接上 Stream 或专业 MQ（如 RocketMQ）。

#### 4.4 Set（集合）

**背景**：需要「去重」和「集合运算」（交集、并集、差集），比如共同好友、抽奖去重。

**定义**：Set 是无序、元素唯一的字符串集合。

**底层结构**：元素都是整数且数量少时用整数集合（intset），否则用哈希表（hashtable）。

**特性**：

- 元素唯一，自动去重。
- 无序。
- 支持交并差集合运算，且是服务端完成，省网络传输。
- 增删查 O(1)。

**常用命令**：

| 命令 | 作用 | 示例 |
| --- | --- | --- |
| `SADD` | 添加元素 | `SADD tag:1 "redis"` |
| `SMEMBERS` | 所有元素（大集合慎用） | `SMEMBERS tag:1` |
| `SISMEMBER` | 判断是否存在 | `SISMEMBER tag:1 "redis"` |
| `SREM` | 删除元素 | `SREM tag:1 "redis"` |
| `SCARD` | 元素数量 | `SCARD tag:1` |
| `SINTER` | 交集 | `SINTER set1 set2` |
| `SUNION` | 并集 | `SUNION set1 set2` |
| `SDIFF` | 差集 | `SDIFF set1 set2` |
| `SPOP` | 随机弹出（抽奖） | `SPOP lottery` |
| `SRANDMEMBER` | 随机取不删 | `SRANDMEMBER lottery 3` |

**示例**：

```bash
# 共同好友（交集）
SADD friends:zs ls ww zl
SADD friends:ls zs ww qq
SINTER friends:zs friends:ls        # 共同好友：ww

# 抽奖：随机弹出获奖者（弹出即从池子里移除，天然不重复）
SADD lottery user1 user2 user3 user4
SPOP lottery                         # 随机抽一个
SRANDMEMBER lottery 2                # 随机抽 2 个但不删除

# 去重：IP 集合
SADD visited:ips 1.2.3.4 1.2.3.4 5.6.7.8   # 重复的自动去重
SCARD visited:ips                    # 2
```

**小结**：Set 的核心是「去重 + 集合运算」，共同好友、点赞去重、抽奖、标签都用它。大集合的 `SMEMBERS`、`SINTER` 会阻塞，注意用 `SSCAN` 或控制集合规模。

#### 4.5 ZSet（有序集合）

**背景**：既要去重、又要按某个「分数」排序，比如排行榜、延迟队列（按时间戳排序）。

**定义**：ZSet 是 Set 的「有序版」，每个元素关联一个 double 类型的 score，按 score 从小到大排序；score 相同按元素字典序排。

**底层结构**：同时用「跳表（skiplist）+ 哈希表」实现——跳表支持按 score 范围快速查找和排名，哈希表支持按 member 快速定位（O(1)）。数据量小时也用 ziplist/listpack。

**特性**：

- 元素唯一，按 score 排序。
- 支持按分数范围、按排名范围查询。
- 支持排名（rank）、分数（score）双向查询。
- 增删查都是 O(log n)。

**常用命令**：

| 命令 | 作用 | 示例 |
| --- | --- | --- |
| `ZADD key score member` | 添加/更新元素 | `ZADD rank 95 zs` |
| `ZRANGE key start stop` | 按排名升序取 | `ZRANGE rank 0 2` |
| `ZREVRANGE` | 按排名降序取 | `ZREVRANGE rank 0 2` |
| `ZRANGEBYSCORE` | 按分数范围取 | `ZRANGEBYSCORE rank 80 100` |
| `ZSCORE` | 查某个元素的分数 | `ZSCORE rank zs` |
| `ZRANK / ZREVRANK` | 查排名（升/降） | `ZREVRANK rank zs` |
| `ZINCRBY` | 分数自增 | `ZINCRBY rank 5 zs` |
| `ZREM` | 删除元素 | `ZREM rank zs` |
| `ZCARD` | 元素数量 | `ZCARD rank` |
| `ZCOUNT` | 分数区间元素数 | `ZCOUNT rank 60 100` |

**示例**：

```bash
# 排行榜：分数高的排前面
ZADD rank 95 zs 88 ls 91 ww
ZREVRANGE rank 0 2 WITHSCORES    # 降序取前 3：zs(95) ww(91) ls(88)
ZREVRANK rank zs                 # zs 排名：0（第 1 名）
ZINCRBY rank 10 ls               # ls 加分 10，变成 98 跳到第一

# 延迟队列：score 存「执行时间戳」，轮询到期任务
ZADD delay_queue 1700000000 task1 1700000100 task2
ZRANGEBYSCORE delay_queue 0 1700000050   # 取出当前时间之前到期的任务
```

**小结**：ZSet 是「去重 + 排序」的合体，排行榜、延迟队列、带权重的标签都是经典场景。核心是 score 排序 + 跳表支撑的 O(log n) 范围查询和排名。

#### 五大数据类型总结

| 类型 | 底层结构 | 特点 | 典型场景 |
| --- | --- | --- | --- |
| String | SDS | 万能，支持数字自增 | 缓存、计数器、分布式锁 |
| Hash | 哈希表 / listpack | 字段级读写 | 存对象 |
| List | quicklist | 有序可重复，两端 O(1) | 最新列表、简单队列 |
| Set | 哈希表 / intset | 无序去重，集合运算 | 共同好友、抽奖 |
| ZSet | 跳表 + 哈希表 | 去重 + 按分数排序 | 排行榜、延迟队列 |

---

### 5. 其他高频命令与数据结构

#### 5.1 通用命令

| 命令 | 作用 | 示例 |
| --- | --- | --- |
| `KEYS pattern` | 按模式匹配 key（生产禁用，阻塞） | `KEYS user:*` |
| `SCAN cursor [MATCH p] [COUNT n]` | 游标分批遍历 key | `SCAN 0 MATCH user:* COUNT 100` |
| `EXISTS key` | 判断 key 是否存在 | `EXISTS user:1` |
| `DEL key` | 删除 key | `DEL user:1` |
| `TYPE key` | 看 key 的类型 | `TYPE user:1` |
| `EXPIRE key s` | 设置过期时间（秒） | `EXPIRE code 60` |
| `TTL key` | 剩余过期时间（-1 无过期，-2 不存在） | `TTL code` |
| `RENAME` | 重命名 | `RENAME a b` |

::: tip 💡 面试题：为什么生产环境禁用 `KEYS *`？
一句话结论：`KEYS *` 会一次性遍历所有 key，时间复杂度 O(n)，会阻塞主线程。原因：Redis 单线程执行命令，`KEYS` 扫描期间其他命令都得排队等待。展开：key 数量大时会导致整个 Redis 卡死，正确做法是用 `SCAN` 游标分批遍历，或者用 Set 自己维护索引。
:::

#### 5.2 Bitmap（位图）

用 String 的位操作实现，一个 bit 表示一个状态，适合签到、活跃用户统计，极省内存。

```bash
SETBIT sign:2024:01:01 10001 1     # 用户 10001 签到
BITCOUNT sign:2024:01:01           # 当天签到总人数
GETBIT sign:2024:01:01 10001       # 用户 10001 是否签到
```

#### 5.3 HyperLogLog（基数统计）

统计「不重复元素的数量」（UV），只需要 12KB 内存，误差约 0.81%，适合对精度不敏感的海量去重统计。

```bash
PFADD uv:page1 user1 user2 user3
PFADD uv:page1 user2 user4
PFCOUNT uv:page1                   # 约 4（去重后的独立用户数）
```

#### 5.4 Geo（地理位置）

基于 ZSet 实现经纬度存储和附近人查找。

```bash
GEOADD cities 116.40 39.90 beijing 121.47 31.23 shanghai
GEODIST cities beijing shanghai km          # 两城市距离
GEOSEARCH cities FROMMEMBER beijing BYRADIUS 500 km   # 北京 500km 内城市
```

---

### 6. 过期策略与内存淘汰

#### 6.1 过期键删除策略（三件套）

Redis 对「设置了过期时间且已过期」的 key，不是到期立刻删，而是用三种策略组合：

1. **惰性删除（lazy）**：访问某个 key 时，先检查是否过期，过期了就删再返回空。省 CPU，但长期不访问的过期 key 会残留。
2. **定期删除（active）**：Redis 默认每 100ms 执行一次 `activeExpireCycle`，随机抽取一部分带过期时间的 key 检查并删除过期项。折中方案，避免 CPU 和内存两端极端。
3. **内存淘汰策略**：内存写满时的兜底，按策略强制淘汰。

**为什么不全量定时删除？** 定时遍历所有 key 太耗 CPU，会把单线程主线程占满。所以用「惰性 + 定期」平衡，最后靠「淘汰策略」兜底。

#### 6.2 内存淘汰策略（8 种）

| 策略 | 作用范围 | 淘汰规则 | 说明 |
| --- | --- | --- | --- |
| `noeviction` | — | 不淘汰 | 默认，写满报错 |
| `allkeys-lru` | 所有 key | 最近最少使用 | **最常用**，缓存场景首选 |
| `allkeys-lfu` | 所有 key | 使用频率最低 | Redis 4.0+ |
| `allkeys-random` | 所有 key | 随机 | 少用 |
| `volatile-lru` | 设了过期的 key | 最近最少使用 | 仅淘汰带过期时间的 |
| `volatile-lfu` | 设了过期的 key | 使用频率最低 | — |
| `volatile-ttl` | 设了过期的 key | 即将过期的 | — |
| `volatile-random` | 设了过期的 key | 随机 | — |

**怎么选**：

- 纯缓存场景：`allkeys-lru`（或 `allkeys-lfu`），缓存就是可以被淘汰的。
- 数据有部分要持久、部分是缓存：`volatile-lru`，只淘汰标记了过期的缓存数据。

```bash
# redis.conf 里配置
maxmemory 4gb
maxmemory-policy allkeys-lru
```

::: tip 💡 面试题：LRU 和 LFU 有什么区别？
一句话结论：LRU 按「最近有没有被访问」淘汰，LFU 按「被访问的次数/频率」淘汰。原因：LRU 只关注时间维度，LFU 额外关注频率维度。展开：LRU 的缺点是「偶发热点」可能把长期热点挤掉（比如某 key 一小时前被访问 1000 次，但刚刚被一个只访问 1 次的新 key 顶掉）；LFU 统计访问频率，更适合有稳定热点的场景。
:::

---

### 7. 事务

**背景**：需要把多条命令当「一组」执行，要么都执行、要么都不执行，保证原子性。

**定义**：Redis 事务用 `MULTI` 开启、`EXEC` 执行、`DISCARD` 放弃、`WATCH` 乐观锁。特点是**不保证原子性回滚**（某条命令出错，之前的命令不会回滚），且事务期间命令是排队执行、不立即执行。

**机制流程**：

1. `MULTI` 开启事务，进入「命令队列」状态。
2. 后续命令只入队不执行，返回 `QUEUED`。
3. `EXEC` 一次性顺序执行队列里所有命令；`DISCARD` 清空队列放弃。
4. 事务执行期间，其他客户端的命令不会插进来（单线程保证执行时不被打断）。

**示例**：

```bash
MULTI
SET a 1
INCR a
GET a
EXEC               # 依次执行，结果：OK、2、"2"

MULTI
SET b 1
DISCARD            # 放弃，b 不会被设置
```

**`WATCH` 乐观锁**：监视某个 key，如果在 `EXEC` 之前该 key 被其他客户端改过，则整个事务执行失败。

```bash
WATCH balance                 # 监视余额
MULTI
DECRBY balance 100
EXEC                          # 如果 balance 被并发改过，EXEC 返回 nil（事务未执行）
```

**小结**：Redis 事务是「打包执行」而非传统数据库的 ACID 事务，适合「一组命令不被打断地执行」。它不提供回滚，出错命令只影响自身；更复杂的原子操作建议用 Lua 脚本（Lua 在服务端执行，天然原子且能写逻辑）。

::: tip 💡 面试题：Redis 事务为什么没有回滚？
一句话结论：Redis 追求简单和高性能，出错一般是编程错误，回滚机制会拖慢引擎。原因：Redis 事务的命令在 EXEC 前就入队，命令语法错误能提前发现，但运行时错误（如对 String 执行 INCR）难以预判。展开：Redis 选择「不保证回滚」换来了极简的实现和更快的执行速度。
:::

---

### 8. 发布订阅（Pub/Sub）

**背景**：需要一对多的消息广播，比如实时通知、聊天室。

**定义**：发布者往 channel 发消息，所有订阅了该 channel 的客户端都能收到。

**命令**：

| 命令 | 作用 |
| --- | --- |
| `SUBSCRIBE channel` | 订阅频道 |
| `PUBLISH channel msg` | 向频道发消息 |
| `PSUBSCRIBE pattern` | 按模式订阅（如 `news.*`） |
| `UNSUBSCRIBE` | 取消订阅 |

**缺点**：消息**不做持久化**，订阅者离线期间的消息会丢失；消息**没有确认机制**，可能重复/丢失。所以 Pub/Sub 只适合「实时、可丢」的广播场景，可靠消息用 Stream 或 MQ。

---

### 基础篇小结

- Redis 是**内存 KV 数据库**，快的原因是「内存 + 单线程 + 多路复用」。
- 五大数据类型各有分工：String 万能、Hash 存对象、List 有序、Set 去重、ZSet 排序。
- 过期用「惰性 + 定期 + 淘汰」三件套，缓存场景淘汰策略选 `allkeys-lru`。
- 事务是「打包执行」不保证回滚，复杂原子操作用 Lua。

---

## 高级篇

### 1. 缓存三大问题（穿透 / 击穿 / 雪崩）

缓存三大问题是缓存架构最经典的面试题，本质是「缓存和数据库之间出现不一致访问模式时，如何保护数据库」。

| 问题 | 现象 | 原因 | 解决方案 |
| --- | --- | --- | --- |
| 缓存穿透 | 查不到的数据每次都打到 DB | 请求不存在的 key，缓存永远没值 | 布隆过滤器 / 空值缓存 |
| 缓存击穿 | 单个热点 key 过期瞬间，大量请求打到 DB | 热点 key 失效，高并发同时重建 | 互斥锁重建 / 逻辑过期 |
| 缓存雪崩 | 大量 key 同时过期或 Redis 宕机，DB 被打崩 | 批量过期 / 实例故障 | 过期时间加随机值 / 多级缓存 / 高可用 |

#### 1.1 缓存穿透

**定义**：用户请求的 key 既不在缓存也不在数据库（比如恶意请求 `id=-1` 或不存在的数据），每次请求都绕过缓存直接打到数据库。

**解决方案**：

**方案一：空值缓存**——查询 DB 发现不存在时，也在缓存里写一个「空值」并设短过期时间，后续相同请求直接命中空值。

```java
// 缓存穿透：空值缓存兜底
String val = redis.get(key);
if (val != null) return val;
// 命中空值标记，说明之前确认过不存在，直接返回 null
if (redis.exists(key + ":null")) return null;

// 查 DB
Object db = db.query(key);
if (db == null) {
    redis.set(key + ":null", "", 60);   // 短时间缓存"空"，60s 内不再打 DB
    return null;
}
redis.set(key, db, 3600);
return db;
```

**方案二：布隆过滤器（Bloom Filter）**——在缓存和 DB 之前加一层布隆过滤器，key 存在才放行；不存在的 key 直接拦截。布隆过滤器「不存在一定不存在，存在可能误判」，能拦截绝大多数非法 key。

```java
// 使用 Redisson 的布隆过滤器
RBloomFilter<String> filter = redisson.getBloomFilter("user-filter");
filter.tryInit(100_0000L, 0.03);          // 预计 100 万元素，误判率 3%
filter.add("user:1001");

// 请求时先过布隆过滤器
if (!filter.contains(key)) return null;    // 一定不存在，直接拦截
```

::: tip 💡 面试题：空值缓存和布隆过滤器怎么选？
一句话结论：空值缓存简单但 key 变体多时内存浪费，布隆过滤器更省内存但有一定误判率。原因：空值缓存给「每个不存在的 key」都占一个缓存条目；布隆过滤器用位数组一次性标记所有存在 key。展开：空值缓存适合「不存在 key 数量有限」的场景；海量恶意随机 key 用布隆过滤器，配合短过期空值双保险。
:::

#### 1.2 缓存击穿

**定义**：某个**热点 key**（比如秒杀商品详情）在过期瞬间，大量并发请求同时涌入，此时缓存失效，所有请求都去查 DB 并回写缓存，数据库瞬间被压垮。

**解决方案**：

**方案一：互斥锁重建**——只允许一个请求去查 DB 重建缓存，其他请求等待或返回旧值。

```java
// 互斥锁重建缓存：只有一个线程去查 DB
public String getWithLock(String key) {
    String val = redis.get(key);
    if (val != null) return val;

    String lockKey = "lock:" + key;
    try {
        // 用 SET NX EX 抢锁，抢到锁的线程负责重建缓存
        boolean gotLock = redis.set(lockKey, "1", "NX", "EX", 30);
        if (gotLock) {
            Object db = db.query(key);
            redis.set(key, db, 3600);
            return String.valueOf(db);
        } else {
            Thread.sleep(50);                 // 没抢到锁，稍等重试
            return getWithLock(key);          // 递归重试（可换成循环）
        }
    } finally {
        redis.del(lockKey);                   // 释放锁
    }
}
```

**方案二：逻辑过期**——不设物理过期时间，value 里存一个「逻辑过期时间戳」，读到过期数据先返回旧值，后台异步重建。适合对一致性要求不高、但绝不能阻塞的「高并发热点」场景。

```java
// 逻辑过期：热点 key 永不过期，value 里存过期时间戳
class CacheData { Object data; long expireAt; }

public String getLogic(String key) {
    CacheData cd = redis.get(key);
    if (cd == null) return null;
    if (cd.expireAt > System.currentTimeMillis()) {
        return String.valueOf(cd.data);       // 未逻辑过期，直接返回
    }
    // 已逻辑过期：先返回旧值，后台异步重建
    executor.submit(() -> {
        boolean gotLock = redis.set("lock:" + key, "1", "NX", "EX", 30);
        if (gotLock) {
            redis.set(key, new CacheData(db.query(key), now + 3600_000));
            redis.del("lock:" + key);
        }
    });
    return String.valueOf(cd.data);           // 返回旧值，不阻塞用户
}
```

::: tip 💡 面试题：缓存击穿用互斥锁还是逻辑过期？
一句话结论：互斥锁强一致但会短暂阻塞，逻辑过期最终一致但不阻塞。原因：互斥锁让并发请求串行等一个重建；逻辑过期先返回旧值、后台异步更新。展开：秒杀这种「读多、热点集中」用逻辑过期；对数据一致性敏感（如价格）用互斥锁。
:::

#### 1.3 缓存雪崩

**定义**：大量 key 在**同一时间**过期，或者 Redis 实例宕机，导致所有请求同时落到 DB，数据库被打崩。

**解决方案**：

1. **过期时间加随机值**：`EX + random`，避免同一批 key 同时过期。
2. **多级缓存**：本地缓存（Caffeine）+ Redis + DB，层层兜底。
3. **高可用 + 限流降级**：Redis 做主从/哨兵/集群，同时接口加限流和熔断。
4. **永不过期 + 后台刷新**：热点数据不设过期，用定时任务或异步线程刷新。

```java
// 过期时间加随机值，避免雪崩
int ttl = 3600 + new Random().nextInt(600);   // 1 小时 + 0~10 分钟随机
redis.set(key, val, ttl);
```

::: tip 💡 面试题：缓存穿透、击穿、雪崩怎么区分？
一句话结论：穿透是「查不存在的 key」，击穿是「单个热点 key 失效」，雪崩是「大量 key 同时失效或实例宕机」。原因：三者失效对象不同——穿透和 key 是否真实存在有关，击穿和雪崩区别在「一个热点」还是「一批 key」。展开：穿透靠布隆过滤器/空值缓存，击穿靠互斥锁/逻辑过期，雪崩靠随机过期时间/高可用/限流。
:::

---

### 2. 缓存一致性

**背景**：缓存和数据库是两份数据，写操作时如何保证两者一致，是缓存架构的经典难题。

#### 2.1 Cache Aside（旁路缓存，最常用）

- **读**：先查缓存，命中返回；未命中查 DB，回填缓存。
- **写**：**先更新 DB，再删除缓存**（删除而不是更新！）。

```java
// 写：先更新 DB，再删缓存
public void update(Object newVal) {
    db.update(newVal);         // 1. 先更新数据库
    redis.del(key);            // 2. 再删除缓存
}
```

**为什么删缓存而不是更新缓存？**

- 更新缓存可能写入「并发脏值」：两个写请求 A、B，A 先更新缓存为旧值，B 后更新缓存为新值，顺序错乱会留下旧值。
- 删除缓存则让下次读「自然地」回填最新数据，避免了写缓存的顺序问题。
- 缓存里很多数据是「读多写少」，删了下次读再构建即可，不更新也省资源。

#### 2.2 先删缓存再改 DB 的问题

如果「先删缓存 → 再改 DB」，中间会有并发读把旧数据回填缓存：

```
请求A（写）       请求B（读）
   |                |
 删缓存            |
   |             读缓存 miss
   |              查 DB（旧值）
   |                |
   |             回填缓存（旧值）  ← 脏数据
 改 DB（新值）       |
```

所以标准 Cache Aside 是「先更新 DB，再删缓存」。

#### 2.3 延迟双删（Double Delete）

即使「先更新 DB 再删缓存」，理论上仍有极小概率脏数据：读请求在「更新 DB 前」查了旧值，在「删缓存之后」才回填，把旧值写回。**延迟双删**就是在更新 DB 后删一次缓存，延迟几百毫秒再删一次，把可能回填的旧值再删掉。

```java
public void updateDoubleDelete(Object newVal) {
    db.update(newVal);              // 更新 DB
    redis.del(key);                 // 第一次删缓存
    // 延迟再删一次，兜底并发回填的旧值
    Thread.sleep(300);              // 生产用延时队列或线程池，别 sleep 主线程
    redis.del(key);                 // 第二次删缓存
}
```

#### 2.4 监听 binlog 异步删缓存（最终一致）

对一致性要求高的场景，可以监听 MySQL 的 binlog（Canal），DB 变更后异步删除缓存。优点是不侵入业务代码、延迟低。

```
业务写 DB → MySQL 生成 binlog → Canal 监听 → 删除 Redis 缓存
```

**小结**：没有绝对一致的方案，本质是在「一致性」和「性能/复杂度」之间取舍。主流是 **Cache Aside（先更新 DB 再删缓存）+ 延迟双删/重试**；极强一致要求用 binlog 订阅 + 消息队列兜底。

::: tip 💡 面试题：为什么「先更新 DB 再删缓存」比「先删缓存再更新 DB」好？
一句话结论：先删缓存再更新 DB，中间并发读会把旧值回填成脏数据，且脏数据会残留到下次过期。原因：删缓存后到更新 DB 前有个窗口期，此时读请求会查旧 DB 并回填。展开：先更新 DB 再删缓存，窗口期是「更新 DB 后到删缓存前」，读到的旧值会在删缓存时被清掉，脏数据生命周期更短。
:::

---

### 3. 持久化：RDB vs AOF

**背景**：Redis 是内存数据库，进程退出内存数据就没了，需要机制把数据落到磁盘，重启能恢复。

#### 3.1 RDB（Redis DataBase，快照）

**定义**：在某个时间点把内存数据快照，序列化成二进制文件 `dump.rdb`。

**触发方式**：

| 触发 | 说明 |
| --- | --- |
| `save` | 主线程同步执行快照，期间阻塞所有命令，生产禁用 |
| `bgsave` | fork 子进程执行快照，主进程继续服务，生产用这个 |
| 自动触发 | `save 900 1` 等配置：900 秒内 1 次写就触发 |

**配置**：

```bash
save 900 1        # 900 秒内至少 1 次修改，触发 bgsave
save 300 10       # 300 秒内至少 10 次修改
save 60 10000     # 60 秒内至少 10000 次修改
dbfilename dump.rdb
```

**优点**：文件小、恢复快、适合冷备。

**缺点**：两次快照之间宕机会丢失这段时间的数据（取决于触发间隔）。

#### 3.2 AOF（Append Only File，命令日志）

**定义**：把每条写命令追加到 `appendonly.aof` 文件末尾，重启时重放命令恢复数据。

**刷盘策略 `appendfsync`**：

| 策略 | 说明 | 丢失 | 性能 |
| --- | --- | --- | --- |
| `always` | 每条命令都同步刷盘 | 几乎不丢 | 最慢 |
| `everysec` | 每秒刷一次 | 最多丢 1s | 折中，默认推荐 |
| `no` | 交给操作系统刷 | 丢失不可控 | 最快 |

**优点**：丢失数据少（`everysec` 最多 1 秒）。

**缺点**：文件大（记录所有写命令）、恢复慢。

**AOF 重写（rewrite）**：AOF 文件会越来越大，重写会 fork 子进程，把当前内存数据生成一份**精简版** AOF（比如多次 `INCR` 合并成一条 `SET`），减小文件体积。

```bash
auto-aof-rewrite-percentage 100   # 文件比上次重写后增长 100% 触发
auto-aof-rewrite-min-size 64mb    # 最小 64MB 才触发重写
```

#### 3.3 RDB + AOF 混合（Redis 4.0+，生产首选）

AOF 文件前半部分是 RDB 快照，后半部分是快照之后的 AOF 增量命令，兼顾「恢复快」和「丢失少」。

```bash
appendonly yes
aof-use-rdb-preamble yes    # 开启混合持久化
```

| | RDB | AOF |
| --- | --- | --- |
| 机制 | 定期内存快照 | 追加写命令日志 |
| 文件 | 小、紧凑 | 大 |
| 恢复速度 | 快 | 慢 |
| 数据丢失 | 两次快照间可能丢 | 最多 1s（everysec） |
| 触发 | `save`/`bgsave` | `appendfsync` |

::: tip 💡 面试题：RDB 和 AOF 怎么选？
一句话结论：生产用「RDB + AOF 混合」：RDB 冷备、AOF 保证低丢失。原因：RDB 文件小恢复快但可能丢数据，AOF 丢失少但文件大恢复慢，混合两者兼顾。展开：纯缓存场景（数据可重建）甚至可以关闭持久化；对数据可靠性有要求的场景开启混合模式。
:::

---

### 4. 主从复制

**背景**：单机 Redis 有单点故障、读压力大两个问题，需要多个节点分担。

**定义**：一个主节点（master）负责写，多个从节点（slave/replica）同步主节点数据并分担读请求，实现读写分离和数据冗余。

**配置**：

```bash
# 从节点 redis.conf 配置（或在运行时用命令）
replicaof 192.168.1.100 6379     # 指定主节点
# 主节点若设了密码，从节点还要配：
masterauth 密码
```

**作用**：

- 读写分离：主写从读，扛读压力。
- 数据冗余：主挂了从节点有备份。
- 是「哨兵」和「集群」高可用的基础。

::: tip 💡 面试题：主从复制的数据一致性是强一致吗？
一句话结论：不是，Redis 主从是异步复制，存在主从延迟。原因：主节点写完后不等待从节点确认就返回客户端。展开：从节点可能落后主节点几毫秒到几秒，读从节点可能读到旧数据；需要强一致读的场景只能读主节点。
:::

---

### 5. 哨兵（Sentinel）

**背景**：主从复制解决了读压力和备份，但主节点挂了不能自动切换，需要人工介入。

**定义**：哨兵是一个独立的进程，监控主从节点，主节点故障时自动从从节点里选一个新主，实现**高可用（HA）**。

**哨兵职责**：

1. **监控**：定期 PING 主从节点，判断是否存活。
2. **通知**：节点故障时通知管理员或其他程序。
3. **自动故障转移**：主节点故障时，选举一个从节点升级为新主。
4. **配置提供者**：客户端通过哨兵获取当前主节点地址。

**主观下线与客观下线**：

- **主观下线（sdown）**：单个哨兵认为节点不可达（PING 超时）。
- **客观下线（odown）**：多数哨兵（quorum）都认为主节点不可达，才触发故障转移。

**故障转移流程**：

```
1. 多个哨兵判定主节点客观下线（odown）
2. 哨兵之间投票选出一个「领头哨兵」（Raft 选举）
3. 领头哨兵从健康的从节点里选新主（优先级高的、复制偏移量大的、runid 小的）
4. 通知其他从节点复制新主
5. 原主恢复后降级为从节点
```

::: tip 💡 面试题：哨兵如何选新主节点？
一句话结论：按「优先级 > 复制偏移量 > runid」排序选最合适的从节点。原因：优先级是人工配置的权重，偏移量代表数据新旧，runid 作为最终 tie-breaker。展开：优先选 `replica-priority` 低（优先级高）的从节点；相同则选复制偏移量最大（数据最新）的；还相同选 runid 字典序最小的。
:::

---

### 6. 集群（Cluster）

**背景**：主从/哨兵解决高可用，但数据都集中在主节点，单机内存有上限；需要「分片」把数据分布到多个节点，突破单机容量。

**定义**：Redis Cluster 把数据按 key 哈希到 16384 个槽（slot），槽分布在多个主节点上，实现数据分片 + 高可用。

**数据分布**：

- 16384 个哈希槽（slot）。
- 每个 key 通过 `CRC16(key) % 16384` 计算所属槽。
- 每个主节点负责一部分槽。

```
CRC16("user:1001") % 16384 = 12345  → 落在负责 12345 这个槽的节点
```

**请求重定向**：客户端请求的 key 不在当前节点时，节点返回 `MOVED`，客户端跳转到正确节点。

```
客户端 → 节点A：GET user:1001
节点A  → 客户端：MOVED 12345 192.168.1.101:6379   （去节点B）
客户端 → 节点B：GET user:1001
```

**集群特点**：

- 每个主节点有从节点做备份，主挂后从升级，实现高可用。
- 支持横向扩容：增加节点后重新分配槽。
- 多 key 操作（`MSET`、`SINTER`）要求 key 在同一槽，否则报错（可用 `{}` 哈希标签强制同槽）。

```bash
# 用 {} 让多个 key 落在同一个槽，支持跨 key 操作
MSET user:{1001}:name zs user:{1001}:age 18
```

::: tip 💡 面试题：为什么 Redis Cluster 是 16384 个槽？
一句话结论：16384 够分且心跳包更小。原因：槽数量太少分片粒度粗，太多则节点间心跳传播槽信息的数据量大。展开：16384 用 2KB 位图就能表示槽分布，节点间 gossip 心跳只需要携带紧凑的槽位图，兼顾分片粒度和通信开销。
:::

---

### 7. 分布式锁

**背景**：单体应用用 JVM 的 `synchronized`/`ReentrantLock` 就能锁住，但微服务多实例部署后，这些锁只在单机内存有效，需要一把「跨进程、跨机器」的锁。

#### 7.1 用 Redis 手写分布式锁

两个核心要点：

1. **原子加锁**：`SET key value NX EX 30`（`NX` 不存在才设置，保证互斥；`EX` 设过期时间，防止持锁宕机死锁）。
2. **唯一 value + Lua 释放**：value 存随机值（UUID），释放时校验 value 是自己才删，用 Lua 保证「判断 + 删除」原子，防止误删别人的锁。

```bash
# 加锁：NX 保证互斥，EX 30 防止死锁
SET lock:order:1 "uuid-xxxx" NX EX 30

# 释放锁：Lua 保证"校验归属 + 删除"两步原子执行
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
```

```java
// Java 版手写分布式锁
public boolean tryLock(String key, String value, long expire) {
    // SET key value NX EX expire：N 不存在才设、X 设置成功返回 OK
    String res = jedis.set(key, value, SetParams.setParams().nx().ex(expire));
    return "OK".equals(res);
}

public void unlock(String key, String value) {
    // Lua 脚本保证「判断归属 + 删除」原子
    String lua = "if redis.call('get', KEYS[1]) == ARGV[1] then " +
                 "return redis.call('del', KEYS[1]) else return 0 end";
    jedis.eval(lua, Collections.singletonList(key), Collections.singletonList(value));
}
```

#### 7.2 手写锁的两个坑

1. **业务超时锁被释放**：业务执行超过 `EX 30`，锁过期被别人抢走，导致并发。→ 用 Redisson 看门狗自动续期。
2. **误删别人的锁**：A 的锁过期，B 抢到锁，A 回来删锁把 B 的锁删了。→ 释放时校验 value 归属。

#### 7.3 Redisson 分布式锁

Redisson 是 Redis 官方推荐的 Java 客户端，封装了分布式锁、看门狗续期、可重入、公平锁等。

```java
RLock lock = redisson.getLock("lock:order:1");
try {
    // 尝试加锁：默认看门狗自动续期（30s 会不断续期到业务完成）
    if (lock.tryLock(10, TimeUnit.SECONDS)) {
        // 业务逻辑
    }
} finally {
    if (lock.isHeldByCurrentThread()) {
        lock.unlock();
    }
}
```

**看门狗（Watchdog）机制**：默认锁 30 秒，看门狗线程每 10 秒检查，如果业务还没执行完就自动把过期时间续到 30 秒，避免「业务超时锁被释放」。

::: tip 💡 面试题：Redis 分布式锁为什么要加过期时间？
一句话结论：防止持锁线程宕机后锁永不释放导致死锁。原因：加锁和释放不在同一进程，任何异常（宕机、GC 停顿、网络断）都可能让释放逻辑没执行。展开：过期时间作为兜底，即使持锁方异常也能自动释放，代价是「业务超时锁提前释放」的风险，用看门狗续期缓解。
:::

#### 7.4 红锁（RedLock）

**背景**：单节点 Redis 分布式锁，如果主从切换（主挂了数据还没同步到从）可能导致锁丢失。红锁用多个独立 Redis 节点提高锁的可靠性。

**思想**：在 N 个独立 Redis 实例上分别加锁，成功超过半数（N/2+1）才算加锁成功。

```java
RedissonRedLock redLock = new RedissonRedLock(
    redissonClient1.getLock("lock:order"),
    redissonClient2.getLock("lock:order"),
    redissonClient3.getLock("lock:order"));
redLock.tryLock(10, TimeUnit.SECONDS);   // 3 个实例至少 2 个加锁成功
```

> 红锁有争议（Martin Kleppmann 指出红锁在时钟跳变、GC 停顿下仍有问题）。绝大多数业务场景用「单节点 + 看门狗」就够了，红锁用于对锁可靠性有极端要求的场景。

---

### 8. 布隆过滤器

**背景**：需要快速判断一个元素「是否可能存在」，且不能把所有数据都存下来（海量数据场景）。

**定义**：布隆过滤器是一种空间效率极高的概率型数据结构，用位数组 + 多个哈希函数，判断一个元素「**一定不存在**」或「**可能存在**」。

**特性**：

- **误判率**：可能把不存在的判断为存在（假阳性），但绝不会把存在的判断为不存在。
- **省内存**：判断 1 亿元素是否存在只需约几百 MB。
- **不支持删除**（计数布隆过滤器可近似删除）。

**原理**：元素经过 k 个哈希函数映射到位数组的 k 个位置，置 1；判断时看这 k 个位置是否都为 1。

```
添加 "redis"：hash1→位3, hash2→位7, hash3→位11，把 3/7/11 置 1
判断 "redis"：看位 3/7/11 是否都为 1 → 是，可能存在
判断 "mysql"：看对应位置 → 有一个为 0 → 一定不存在
```

**使用（Redisson）**：

```java
RBloomFilter<String> bloom = redisson.getBloomFilter("idempotent");
bloom.tryInit(100_0000L, 0.03);     // 预计 100 万元素，误判率 3%
bloom.add("order:1001");
boolean exists = bloom.contains("order:1001");   // 一定存在 / 可能存在
```

**典型场景**：缓存穿透防护、爬虫 URL 去重、垃圾邮件过滤、幂等判断。

---

### 9. Lua 脚本与 Pipeline

#### 9.1 Lua 脚本

把多条命令写成一个 Lua 脚本，**在 Redis 服务端原子执行**（脚本执行期间其他命令排队），适合「需要多条命令原子 + 有逻辑判断」的场景（如分布式锁释放、限流）。

```lua
-- 限流：固定窗口计数器
-- KEYS[1] 计数 key，ARGV[1] 限制次数，ARGV[2] 过期时间
local current = redis.call('INCR', KEYS[1])
if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[2])   -- 第一次访问才设过期
end
if current > tonumber(ARGV[1]) then
    return 0                                   -- 超过限制，拒绝
end
return 1                                       -- 放行
```

**优点**：原子、减少网络往返（多条命令一次发送）、服务端执行。**缺点**：脚本写死难以调试、会阻塞主线程（脚本执行期间别的命令排队），所以脚本要短、避免死循环。

#### 9.2 Pipeline（管道）

把多条命令打包一次发送，减少网络往返（RTT），**但不保证原子性**（命令是依次执行，中间可能插入其他客户端命令）。

```java
// Pipeline：一次发多条命令，减少 RTT
Pipeline p = jedis.pipelined();
for (int i = 0; i < 1000; i++) {
    p.set("key:" + i, "value" + i);
}
p.sync();   // 一次性发送并接收结果
```

::: tip 💡 面试题：Lua 脚本和 Pipeline 的区别？
一句话结论：Lua 原子、Pipeline 不原子但更快。原因：Lua 脚本整体在服务端原子执行；Pipeline 只是批量发送命令减少网络往返，命令仍是独立执行。展开：需要「多命令原子 + 逻辑判断」用 Lua；单纯批量读写提速用 Pipeline。
:::

---

### 高级篇小结

- 缓存三大问题本质是「异常访问模式打穿缓存」，分别用布隆过滤器/空值、互斥锁/逻辑过期、随机过期/高可用应对。
- 缓存一致性主流是 **Cache Aside：先更新 DB 再删缓存**，强一致用 binlog 订阅兜底。
- 持久化生产用 **RDB + AOF 混合**。
- 高可用三板斧：主从（读写分离）→ 哨兵（自动切换）→ 集群（分片扩容）。
- 分布式锁核心：`SET NX EX` + Lua 释放 + 看门狗续期。

---

## 原理篇

### 1. 单线程模型与 IO 多路复用

#### 1.1 Redis 的「单线程」到底指什么

Redis 的「单线程」指的是**命令执行在一个线程里串行完成**。准确说 Redis 内部有多个线程，但核心的「读取命令 → 解析 → 执行 → 写回结果」这个主流程由主线程完成。Redis 6.0 之后，**网络 IO 读写**（socket 的读和写）引入了 IO 线程池，但**命令执行仍然是单线程**。

**为什么不用多线程执行命令？**

1. 命令执行都是微秒级内存操作，CPU 不是瓶颈，瓶颈在内存和网络。
2. 多线程会引入锁竞争、线程上下文切换、数据一致性问题，得不偿失。
3. 单线程天然保证命令原子、数据无竞争，代码简单、可维护。

#### 1.2 事件驱动 + IO 多路复用

Redis 用**事件驱动模型**：主线程用 IO 多路复用同时监听多个 socket，哪个 socket 有事件（可读/可写）就处理哪个，而不是阻塞等一个连接。

```
                    ┌─────────────────────────┐
                    │      Redis 主线程         │
                    │                         │
  多个客户端 socket ──►  epoll_wait 监听所有 fd   │
  ┌─────────┐      │                         │
  │ client1 │──┐   │  有事件就取出处理：          │
  ├─────────┤  │   │  ① 读命令 → ② 执行 → ③ 写回  │
  │ client2 │──┼──►│  （全程内存操作，微秒级）      │
  ├─────────┤  │   │                         │
  │ client3 │──┘   │                         │
  └─────────┘      └─────────────────────────┘
```

**epoll 的工作流程**：

1. 主线程把所有客户端 socket 注册到 epoll 实例。
2. `epoll_wait` 阻塞等待，内核在有 socket 可读/可写时唤醒并返回就绪的 fd 列表。
3. 主线程遍历就绪 fd，逐个「读命令 → 执行 → 写回」。
4. 处理完再回到 `epoll_wait` 等待下一批事件。

**为什么叫「多路复用」**：一个线程（一路）同时监视多个 socket（多路）的 IO 就绪状态，做到「一个线程扛住海量连接」。

::: tip 💡 面试题：Redis 单线程为什么还这么快？多线程不是更快吗？
一句话结论：Redis 的瓶颈是内存和网络而非 CPU，单线程避免了锁和上下文切换开销。原因：命令执行都是微秒级内存操作，多线程反而引入锁竞争和线程切换成本。展开：Redis 6.0 只在网络读写引入多线程（因为网络 IO 相对耗时），命令执行仍是单线程串行，这是为了不破坏原子性和简单性。
:::

#### 1.3 单线程的隐患：大 key 阻塞

正因为单线程，任何一条耗时命令都会阻塞所有其他命令。以下操作生产要禁用或谨慎：

| 危险操作 | 问题 | 替代方案 |
| --- | --- | --- |
| `KEYS *` | O(n) 遍历所有 key | `SCAN` 游标遍历 |
| `HGETALL` 大 Hash | 一次返回全部字段 | `HSCAN` 分批 |
| 大范围 `LRANGE 0 -1` | 大 List 全量返回 | 分页 `LRANGE 0 99` |
| `SINTER` 大集合 | 集合运算耗 CPU | 控制规模 / 提前计算 |
| 大 value 的 `DEL` | 释放大内存会阻塞 | Redis 4.0+ 异步删除 `UNLINK` |

---

### 2. 底层数据结构（源码级）

Redis 的每种对象都由底层数据结构支撑。理解这些结构的内存布局，是理解 Redis 高效和内存优化的关键。

#### 2.1 SDS（Simple Dynamic String，简单动态字符串）

**背景**：C 原生字符串用 `char*`，获取长度要 O(n) 遍历，且不能存 `\0`（二进制不安全），追加可能缓冲区溢出。Redis 自己实现 SDS 解决这些问题。

**SDS 结构（Redis 3.2 后有多种 header，以 sdshdr8 为例）**：

```
┌─────────┬─────────┬─────────┬──────────────┬─────────┐
│  len    │  alloc  │  flags  │   buf[]      │  '\0'   │
│ (已用长度)│(分配容量)│(类型标记)│  (实际字节数据) │(兼容结尾)│
└─────────┴─────────┴─────────┴──────────────┴─────────┘
  1 byte   1 byte    1 byte     len bytes      1 byte
```

- `len`：已使用的字节数，获取长度 O(1)。
- `alloc`：分配的总容量（不含结尾 `\0`）。
- `flags`：标记 header 类型（sdshdr5/8/16/32/64，按长度选最小的）。
- `buf`：实际数据，末尾额外留一个 `\0` 是为了兼容 C 字符串函数。

**SDS 的三大优化**：

1. **O(1) 获取长度**：`STRLEN` 直接读 `len` 字段，不用遍历。
2. **二进制安全**：用 `len` 记录长度而不是靠 `\0` 判断结束，value 里可以存任意二进制（图片、序列化对象）。
3. **空间预分配 + 惰性释放**：减少内存重分配次数。

**空间预分配规则（重点）**：

```
修改后 len < 1MB：alloc = 2 * len          （扩容时翻倍）
修改后 len >= 1MB：alloc = len + 1MB       （扩容时多给 1MB）
```

**惰性空间释放**：缩短字符串时，不立即回收内存，用 `alloc - len` 记录空闲空间，下次增长时复用，避免频繁 `realloc`。

**小结**：SDS = `len + alloc + flags + buf`，核心是「记录长度 O(1)、二进制安全、预分配减少重分配」。

::: tip 💡 面试题：为什么 Redis 用 SDS 而不用 C 字符串？
一句话结论：SDS 记录长度，做到 O(1) 获取长度、二进制安全、预分配减少重分配。原因：C 字符串靠 `\0` 结尾，求长度要遍历，且不能存二进制。展开：SDS 的预分配（翻倍/加 1MB）和惰性释放大幅减少 `realloc` 次数，是 Redis 高性能的原因之一。
:::

#### 2.2 Dict（哈希表）

**背景**：Hash、Set 和 Redis 全局的 key 空间都用哈希表存储，是 Redis 最核心的结构之一。

**结构**：Redis 的哈希表用「链地址法」解决冲突，核心是 `dict` → `dictht`（两个哈希表，用于渐进式 rehash）→ `dictEntry`（节点）。

```
dict
 ├─ dictht ht[0]   ← 当前使用的哈希表
 ├─ dictht ht[1]   ← rehash 时的新表（平时为空）
 └─ rehashidx      ← -1 表示不在 rehash；>=0 表示正在 rehash 到哪个桶

dictht
 ├─ dictEntry **table   ← 桶数组（指针数组）
 ├─ size                ← 桶数量（2 的幂）
 ├─ sizemask            ← size - 1，用于 hash & sizemask 定位桶
 └─ used                ← 已存节点数

dictEntry（节点，链地址法解决冲突）
 ├─ key                 ← 键
 ├─ v (union)           ← 值（可以是 ptr / uint64 / int64）
 └─ next                ← 指向下一个冲突节点
```

**哈希冲突解决**：`hash(key) & sizemask` 定位桶，冲突的节点用 `next` 指针串成单向链表（头插法）。

```
table[0] ──► [entry1] ──► [entry2] ──► NULL   ← 冲突的 entry 串成链表
table[1] ──► NULL
table[2] ──► [entry3] ──► NULL
```

**渐进式 rehash（重点）**：当负载因子（`used / size`）超过阈值，需要扩容（扩容到 2 倍），Redis **不一次性搬完**，而是：

1. 分配新表 `ht[1]`（新 size），设 `rehashidx = 0`。
2. 每次增删改查时，顺手把 `ht[0]` 当前 `rehashidx` 指向的桶搬到 `ht[1]`，`rehashidx++`。
3. 全部搬完后，`ht[1]` 变 `ht[0]`，释放旧表，`rehashidx = -1`。

**为什么渐进式？** 一次性 rehash 大量 key 会阻塞主线程（单线程），渐进式把搬迁平摊到每次操作，避免卡顿。

**触发条件**：

- 扩容：负载因子 >= 1，且没有执行 `bgsave`/`bgrewriteaof` 时；有后台任务时 >= 5 才扩容（避免写时复制的内存开销）。
- 缩容：负载因子 < 0.1。

::: tip 💡 面试题：Redis 的哈希表如何解决冲突和扩容？
一句话结论：链地址法解决冲突，渐进式 rehash 扩容避免阻塞。原因：冲突节点用链表串起来；扩容时用双表（ht[0]/ht[1]）分多次搬迁。展开：渐进式 rehash 把搬迁平摊到每次操作，配合 `rehashidx` 记录进度，避免单线程一次性搬迁大量 key 导致卡顿。
:::

#### 2.3 Skiplist（跳表）

**背景**：ZSet 需要「按 score 范围查找、查排名」，用哈希表做不到有序，用红黑树实现复杂，跳表是「有序 + 实现简单 + 查询 O(log n)」的折中。

**结构**：跳表是「多层的链表」，底层是完整有序链表，上层是下层的「索引」，越高层节点越少。

```
Level 3:  head ───────────────────────► 45 ──────────► NULL
Level 2:  head ───────► 15 ───────────► 45 ──► 60 ──► NULL
Level 1:  head ─► 5 ───► 15 ──► 30 ────► 45 ──► 60 ──► 75 ──► NULL
```

**查找流程**：从最高层开始，向右找，遇到比目标大的就降一层继续，直到找到或到最底层。

```
查 30：head(最高层) → 45 大于 30，降一层 → 15 小于 30 右移 → 45 大于 30 降一层
      → 15 右移 → 30 找到 ✓
```

**Redis 跳表节点（zskiplistNode）**：

```c
typedef struct zskiplistNode {
    sds ele;                     // 元素（member）
    double score;                // 分数
    struct zskiplistNode *backward;  // 后退指针（用于反向遍历）
    struct zskiplistLevel {
        struct zskiplistNode *forward;  // 前进指针
        unsigned long span;             // 跨度（到下一个节点的步数，用于算 rank）
    } level[];                   // 多层索引
} zskiplistNode;
```

**为什么跳表而不是红黑树？** 跳表实现简单、支持范围查找、更适合 Redis 这种「内存 + 简单高效」的场景。两者查询都是 O(log n)，但跳表代码更短、更容易维护。

**小结**：跳表 = 多层索引链表，每层节点随机抽取，查询从上往下、从左往右，O(log n)；`span` 字段让它能快速算排名。

#### 2.4 压缩列表（ziplist）与 listpack

**背景**：小数据量时如果用哈希表/链表，每个节点都带大量指针开销（前向、后向指针），内存浪费。ziplist/listpack 用连续内存紧凑存储，省内存。

**ziplist 内存布局**：

```
┌────────┬────────┬────────┬──────┬──────┬──────┬────────┐
│ zlbytes│ zltail │ zllen  │ entry│ entry│ ...  │ zlend  │
│(总字节数)│(尾偏移) │(节点数) │  节点 │  节点 │      │(0xFF)  │
└────────┴────────┴────────┴──────┴──────┴──────┴────────┘
```

**每个 entry 的布局**：

```
┌──────────────┬──────────────┬────────────┐
│ prevlen      │ encoding     │ data       │
│(前一个节点长度)│(编码+数据长度) │(实际数据)   │
└──────────────┴──────────────┴────────────┘
```

**ziplist 的致命问题：连锁更新**。`prevlen` 记录前一个节点的长度，当某个节点长度从 <254 变到 >=254 时，`prevlen` 从 1 字节变 5 字节，会导致后面节点都要跟着调整，最坏 O(n²)。Redis 7.0 用 **listpack** 彻底替代了 ziplist。

**listpack 的改进**：entry 不再存「前一个节点长度」，而是记录「当前节点长度」，从根本上消除了连锁更新。

```
listpack entry:
┌──────────────┬──────────────┬────────────┐
│ encoding     │ data         │ backlen    │
│(编码+数据长度)│(实际数据)     │(当前entry总长，逆向遍历用)│
└──────────────┴──────────────┴────────────┘
```

**小结**：ziplist/listpack 是「连续内存紧凑存储」，小数据量省内存；listpack 通过「记录自身长度」解决了 ziplist 的连锁更新问题。

#### 2.5 Quicklist（快速列表）

**背景**：List 既要两端 O(1) 操作（链表优势），又要内存紧凑（ziplist 优势）。Quicklist 把两者结合。

**结构**：quicklist 是一个双向链表，每个节点是一个 ziplist/listpack。

```
quicklist
 └─► [ziplist1] ◄──► [ziplist2] ◄──► [ziplist3] ◄──► ...
     (多个 entry)     (多个 entry)     (多个 entry)
```

- 链表保证两端插入/删除 O(1)。
- 每个节点里的 ziplist 保证内存紧凑。
- `list-max-ziplist-size` 控制每个 ziplist 的大小。

#### 2.6 Intset（整数集合）

**背景**：Set 里全是整数时，用哈希表存浪费，用紧凑的整数数组更省内存。

**结构**：连续内存的整数数组，按值升序排列。

```
┌──────────┬──────────┬────────────────────────┐
│ encoding │ length   │ contents[]             │
│(编码类型) │(元素个数) │ (升序的整数数组)         │
└──────────┴──────────┴────────────────────────┘
```

- `encoding`：`INTSET_ENC_INT16 / INT32 / INT64`，选最小的能装下所有元素的编码。
- 插入大整数时自动升级编码（如 int16 → int32），**升级后不会降级**。

#### 2.7 数据结构选择规则总结

| 对象 | 小数据量 | 大数据量（或条件） |
| --- | --- | --- |
| String | SDS | SDS |
| Hash | listpack（<512 且 value <64B） | hashtable |
| List | quicklist（始终） | quicklist |
| Set | intset（全整数且 <512） | hashtable |
| ZSet | listpack（<128 且 value <64B） | skiplist + hashtable |

---

### 3. 对象系统（redisObject）

**背景**：Redis 每种 value 外面包了一层 `redisObject`，统一管理类型、编码、过期等信息。

```c
typedef struct redisObject {
    unsigned type:4;      // 类型：string/list/hash/set/zset
    unsigned encoding:4;  // 编码（底层实现）：int/embstr/raw/ziplist/hashtable 等
    unsigned lru:24;      // LRU 时间 或 LFU 计数（用于淘汰策略）
    int refcount;         // 引用计数（对象共享）
    void *ptr;            // 指向实际数据的指针
} redisObject;
```

**关键字段**：

- `type`：对象类型（5 大类）。
- `encoding`：底层实现（如 String 有 `int`/`embstr`/`raw` 三种编码）。
- `lru`：24 位，淘汰策略用——LRU 存「上次访问时间戳」，LFU 拆成「16 位时间 + 8 位频率」。
- `refcount`：引用计数，用于对象共享（如 0~9999 的整数共享）。

**String 的三种编码**：

| 编码 | 条件 | 说明 |
| --- | --- | --- |
| `int` | value 是整数 | 直接存 `ptr` 里，不额外分配内存 |
| `embstr` | 短字符串（<=44 字节） | redisObject 和 SDS 连续分配一块内存 |
| `raw` | 长字符串 | redisObject 和 SDS 分开分配 |

`embstr` 的优势：一次内存分配，且数据在连续内存，缓存友好、释放快。

---

### 4. 内存淘汰算法原理（LRU / LFU）

#### 4.1 Redis 的 LRU 实现

Redis 不维护严格 LRU（精确 LRU 要维护双向链表 + 哈希表，内存开销大），而是**近似 LRU**：随机抽 N 个 key，淘汰其中「最近最少使用」的那个。

**为什么近似？** 精确 LRU 每个 key 都要维护链表节点，内存翻倍；近似 LRU 用 `redisObject.lru` 存访问时间戳，抽样淘汰即可，实测效果接近精确 LRU。

```
淘汰流程（allkeys-lru）：
1. 内存超过 maxmemory，触发淘汰
2. 随机抽 N 个 key（maxmemory-samples，默认 5）
3. 比较它们的 lru（最近访问时间戳），淘汰最旧的
4. 重复直到内存降到阈值以下
```

#### 4.2 Redis 的 LFU 实现

`redisObject.lru` 的 24 位在 LFU 模式下拆成两段：

```
lru 24 位：
┌──────────────────────┬──────────────┐
│  高 16 位：lastDecrTime │  低 8 位：logc │
│  (上次衰减的时间戳)      │  (对数访问频次) │
└──────────────────────┴──────────────┘
```

- **logc**：对数计数，访问一次 `logc += 1/(因子)`，避免高频 key 计数溢出，也体现「频率」而非「次数」。
- **衰减**：随着时间推移，`logc` 会衰减（长时间不访问，频率降低），由 `lfu-decay-time` 控制。

**LRU vs LFU**：LRU 只记「最近一次访问时间」，LFU 记「访问频率」。LFU 能区分「偶发高访问」和「长期高访问」，更适合有稳定热点的场景。

---

### 5. 持久化原理深入

#### 5.1 RDB：fork + 写时复制（Copy On Write）

**bgsave 的完整流程**：

```
1. 主进程调用 fork() 创建子进程
2. fork 时，父子进程共享同一块内存（页表指向相同物理内存，标记只读）
3. 子进程遍历内存数据，生成 RDB 快照
4. 期间主进程继续处理写命令：
   - 写命令要修改内存时，触发「写时复制」
   - 内核把要修改的内存页复制一份给主进程，子进程读的还是旧数据
5. 子进程写完 RDB 后退出，主进程替换旧 RDB 文件
```

**写时复制（COW）的意义**：fork 快（只复制页表不复制数据），快照期间主进程不停服务，内存只额外占用「被修改的页」。

::: tip 💡 面试题：bgsave 期间为什么主进程还能继续写？
一句话结论：fork 子进程 + 写时复制，父子进程共享内存，写操作触发 COW 复制后才分离。原因：fork 时父子的页表指向同一物理内存，快照读旧数据，主进程写时内核复制被修改的页。展开：这样快照期间不阻塞服务，额外内存开销 = 快照期间被修改的数据量。
:::

#### 5.2 AOF 重写（rewrite）

**背景**：AOF 记录每条写命令，文件越来越大（比如 `INCR` 100 次就有 100 条命令），重写把「当前数据」精简成最少命令。

**流程**：

```
1. fork 子进程，子进程根据当前内存数据生成一份精简 AOF（如 100 次 INCR → 1 次 SET）
2. 重写期间主进程继续写，把新写命令同时写：
   a. 旧的 AOF 缓冲区（保证旧文件完整）
   b. AOF 重写缓冲区（记录重写期间的新命令）
3. 子进程写完精简 AOF，主进程把重写缓冲区的增量命令追加到新文件
4. 用新 AOF 原子替换旧 AOF
```

**为什么 fork 而不是主线程直接写？** 避免重写期间阻塞主线程服务。

---

### 6. 主从复制原理深入

#### 6.1 复制的三个阶段

```
阶段一：建立连接
  slave → master：PSYNC <replid> <offset>   （请求同步）

阶段二：数据同步（分全量/增量）
  全量同步（首次或 offset 落后太多）：
    1. master 执行 bgsave 生成 RDB，发送给 slave
    2. master 把期间的写命令存到 replication buffer，RDB 发完后发送
    3. slave 加载 RDB，再重放 buffer 里的命令
  增量同步（offset 接近）：
    master 把「复制积压缓冲区（repl_backlog）」里 offset 之后的命令发给 slave

阶段三：命令传播
  master 每执行写命令，异步发送给所有 slave
  slave 执行并更新自己的 offset
```

#### 6.2 复制积压缓冲区（repl_backlog）

master 维护一个固定大小的环形缓冲区，记录最近写过的命令。slave 断开重连后，如果 offset 还在 backlog 范围内，就走增量同步（只补断开的命令）；否则走全量同步。

```
repl_backlog（环形缓冲区）:
┌─────────────────────────────────────────────┐
│ cmd1 │ cmd2 │ cmd3 │ ... │ cmdN │ (覆盖旧)   │
└─────────────────────────────────────────────┘
        ▲                    ▲
    slave offset         master offset
```

**replid + offset**：主节点有唯一 `replid`（复制 ID），`offset` 是复制的偏移量。slave 用 `replid` 判断「连的是不是同一个主」，用 `offset` 判断「差多少数据」。

#### 6.3 为什么主从复制是异步的

master 写完命令后，不等待 slave 确认就返回客户端（异步复制）。好处是写性能不受 slave 影响；代价是主从延迟、故障时可能丢「尚未同步到 slave」的数据。

---

### 7. Sentinel 选举机制

#### 7.1 客观下线（odown）判定

- 每个哨兵 PING 主节点，`down-after-milliseconds` 超时则标记「主观下线（sdown）」。
- 当多数哨兵（达到 `quorum`）都认为主节点主观下线，则标记「客观下线（odown）」，开始故障转移。

#### 7.2 领头哨兵选举（Raft）

客观下线后，哨兵之间用 **Raft 协议**投票选出「领头哨兵」负责故障转移。

```
1. 每个哨兵投自己一票，向其他哨兵请求投票
2. 先收到请求的哨兵投票给该请求（一轮只投一票）
3. 得到超过半数（N/2+1）选票的哨兵成为「领头哨兵」
4. 若一轮没选出，则等待重试
```

#### 7.3 新主节点选举规则

领头哨兵从健康从节点里按以下优先级选新主：

1. `replica-priority` 小的（优先级高）优先。
2. 相同则选复制偏移量 `offset` 最大的（数据最新）。
3. 再相同选 `runid` 字典序最小的。

```
选举规则：priority 小 > offset 大 > runid 小
```

---

### 8. Redis Cluster 原理

#### 8.1 数据分片：16384 个槽

```
key → CRC16(key) & 16383 → slot（0 ~ 16383）
```

每个主节点负责一部分槽。节点间用 **gossip 协议**传播节点状态和槽归属信息。

#### 8.2 请求重定向

```
GET user:1001
  ↓
节点A 计算：slot = CRC16(user:1001) % 16384 = 12345
  ↓
节点A 不负责 12345，返回：MOVED 12345 192.168.1.101:6379
  ↓
客户端连到节点B，重发命令
```

**MOVED 与 ASK**：

- `MOVED`：槽永久迁移到别的节点（客户端更新槽映射缓存）。
- `ASK`：槽正在迁移中（临时重定向，客户端不改缓存）。

#### 8.3 槽迁移与扩容

```
扩容：新节点加入 → 部分槽从旧节点迁移到新节点
迁移一个槽：源节点把该槽的 key 逐个搬到目标节点，用 ASK 过渡
```

#### 8.4 集群的局限

- 多 key 操作（`MSET`、`SINTER`）要求所有 key 在同一槽，否则报错（用 `{}` 哈希标签强制同槽）。
- 事务、Lua 脚本里涉及的 key 也要在同一槽。
- 客户端需要支持集群协议（如 Jedis Cluster、Lettuce Cluster）。

::: tip 💡 面试题：Redis Cluster 的 MOVED 和 ASK 有什么区别？
一句话结论：MOVED 表示槽已永久迁走，客户端要更新映射；ASK 表示槽迁移中，只是临时重定向。原因：两者发生时机不同，MOVED 是迁移完成后，ASK 是迁移进行中。展开：收到 MOVED 客户端会缓存新的槽映射；ASK 是一次性的，客户端下次仍会先访问原节点。
:::

---

### 原理篇小结

- Redis 单线程 + epoll 多路复用，命令执行串行化保证原子，真正要防的是大 key 阻塞。
- 底层结构：SDS（O(1) 长度 + 预分配）、dict（链地址 + 渐进 rehash）、skiplist（O(log n) 有序）、ziplist/listpack（紧凑存储）、quicklist（链表 + ziplist）。
- 对象系统 redisObject 统一管理类型/编码/淘汰信息。
- 淘汰：近似 LRU（抽样）和 LFU（对数计数 + 衰减）。
- 持久化：RDB 用 fork + COW 不阻塞，AOF 重写压缩文件。
- 主从异步复制，哨兵用 Raft 选举领头 + 优先级选新主，集群用 16384 槽分片。
