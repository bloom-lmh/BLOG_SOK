# Redis

一句话定位：Redis 是一个基于内存的高性能 Key-Value 存储系统，用单线程执行命令 + IO 多路复用 + 丰富的数据结构，解决「高并发下的快速读写、缓存、分布式协调」问题，常被用作缓存、分布式锁、计数器、排行榜和消息队列。

## 目录

- [基础篇](#基础篇)：Redis 是什么、为什么快、五大数据类型、过期与淘汰、事务
- [基础篇练习](#基础篇练习)：8 个真实场景动手题 + 综合设计面
- [高级篇](#高级篇)：缓存三大问题、缓存一致性、持久化、主从/哨兵/集群、分布式锁
- [高级篇练习](#高级篇练习)：9 个场景题 + 秒杀方案压轴设计
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
- 局部性原理 + 高效的协议（RESP：一套纯文本的极简协议，比如一次回复就是一行 `+OK\r\n`，几乎零解析开销）。
- 用 C 语言编写，贴近硬件。

::: tip 💡 面试题：Redis 为什么快？
一句话结论：内存存储 + 单线程无锁 + IO 多路复用。原因：数据在内存访问快；单线程省去线程切换和锁竞争；epoll 多路复用让一个线程能扛住海量并发连接。展开：Redis 的瓶颈通常不在 CPU 而在内存和网络带宽，所以单线程模型在命令执行层面反而更高效；真正需要警惕的是 CPU 密集的大 key 操作（如 `KEYS *`）。
:::

---

### 4. 五大数据类型

#### 4.1 String（字符串）

**背景**：最简单的类型，一个 key 对应一个字符串值，是缓存场景的主力。

**定义**：String 类型的 value 可以是字符串、整数或浮点数，最大能存 512MB。底层用 SDS（简单动态字符串）存储，不是 C 原生字符串。

**SDS 是什么**：Redis 自己实现的字符串结构——在字符数据前面多存了「当前长度」和「已分配空间」两个字段。好处：① 求长度直接读字段，O(1)（C 字符串要从头数到 `\0`）；② 记录了空间大小，追加发现不够时按策略多分配一些（预分配），减少内存重分配次数；③ 按长度管理数据，中间存 `\0` 也没事（二进制安全）。结构源码见原理篇 2.1。

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

**压缩列表（ziplist）是什么**：一块**连续内存**把所有 field-value 首尾相接顺序存放——没有链表那种前后指针开销，极省内存；代价是查找只能从头往后扫（O(n)），但元素少时这点代价可以忽略。所以策略是「小表用 ziplist 换省内存，大表转哈希表换速度」，且转换单向、不回退。listpack 是 Redis 7 用来替代 ziplist 的改进版紧凑列表（修掉了「连锁更新」缺陷，见原理篇 2.4）。

**特性**：

- 按字段读写，更新某个字段不用整体重写。
- 单个 Hash 可存 2^32 - 1 个 field。
- 适合「对象」这种结构化的数据，比 String 存 JSON 更细粒度。

**常用命令**：

| 命令 | 作用 | 示例 |
| --- | --- | --- |
| `HSET key field value` | 设置单个字段 | `HSET user:1 name zs` |
| `HMSET` | 设置多个字段（旧写法，4.0+ 的 HSET 也支持多参数） | `HMSET user:1 name zs age 18` |
| `HGET` | 获取单个字段 | `HGET user:1 name` |
| `HGETALL` | 获取所有字段和值（大 Hash 慎用） | `HGETALL user:1` |
| `HINCRBY` | 字段数值自增 | `HINCRBY user:1 age 1` |
| `HDEL` | 删除字段 | `HDEL user:1 age` |
| `HEXISTS` | 判断字段是否存在 | `HEXISTS user:1 name` |
| `HLEN` | 字段数量 | `HLEN user:1` |
| `HKEYS / HVALS` | 所有字段名 / 所有值 | `HKEYS user:1` |

**示例**：

```bash
# 存对象（一次设多个字段用 HMSET；HSET 多参数要 Redis 4.0+，Windows 3.0 只支持单字段）
HMSET user:1001 name zhangsan age 18 email zs@qq.com

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

**整数集合（intset）是什么**：一个**排好序的整数数组**——里面没有哈希也没有链表，就是纯数组，内存极省，查找用二分 O(log n)。只要混进一个非整数元素、或元素数超过上限（默认 512），整个集合升级为哈希表（升级单向，不回退）。

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

**定义**：ZSet 是 Set 的「有序版」，每个元素关联一个 double 类型的 score，按 score 从小到大排序；score 相同按元素字典序排（字典序 = 字符串逐字节比较，"ai" 排在 "gaokao" 前面）。

**底层结构**：同时用「跳表（skiplist）+ 哈希表」实现——跳表支持按 score 范围快速查找和排名，哈希表支持按 member 快速定位（O(1)）。数据量小时也用 ziplist/listpack。

**跳表（skiplist）是什么**：**带多级索引的有序链表**。底层 L0 是完整的有序链表；每隔几个节点向上抽出一层「快车道」索引，越往上节点越稀疏。查找从顶层出发：能往右走就往右，不能就往下一层——每降一层都排除一大段，效果类似二分查找，把链表 O(n) 的查找降到 O(log n)：

```text
L2:  head ─────────────────► 38
L1:  head ────► 12 ─────────► 38
L0:  head ► 5 ► 12 ► 23 ► 38 ► 47 ► 55

查 47：L2 停在 38（右边没有更小的了）→ 降一层 → L1 又停在 38 → L0 走一步到 47
```

跳表节点还额外存了「跨度」（span：本层这一步跨过了几个节点），把查找沿途的跨度累加就直接得到排名——这就是 `ZRANK` 也是 O(log n) 的原因。**为什么用跳表不用红黑树**：查询同为 O(log n)，但跳表实现简单得多、范围查询天然支持、排名好算。完整源码结构见原理篇 2.3。

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

#### 5.2 Key 命名规范

Redis 的 key 没有目录结构，但生产上统一用「**冒号分层**」命名：`业务:对象:ID`。注意：**Redis 不解析冒号**，`cart:user:1001` 对它就是一个普通字符串，和 `cart_user_1001` 功能上没有任何区别——分层是人约定的，图的是人好读、命令好匹配。

**拆解**：

```text
cart:user:1001
 │    │   └── 具体对象 ID（哪个用户）
 │    └────── 对象类型（用户的什么东西）
 └─────────── 业务域（购物车）
```

读法：「购物车业务里，用户 1001 那一份」。类比 Java 的包名 `com.mall.user`、文件路径 `user/1001/cart`——都是「从大到小逐级收窄」。

**为什么不随便命名**：

| 好处 | 具体体现 |
| --- | --- |
| 天然防冲突 | 购物车、订单都要存用户 1001：`cart:user:1001`、`order:user:1001` 各归各位，永不互相覆盖 |
| 按前缀批量匹配 | `SCAN 0 MATCH cart:user:*` 一条模式捞出所有购物车 key，乱命名就做不到 |
| 自解释 | 排查时 `redis-cli` 里一眼看出这个 key 是干嘛的，不用翻代码 |
| 对齐公司规范 | 阿里《Java 开发手册》明确要求 `业务:对象:id` 格式，面试报出这条是加分项 |

**常见层级写法**：

```bash
captcha:13800001111         # 两层：业务:标识
user:profile:1001           # 三层：业务:对象:ID
lock:order:1001             # 分布式锁：业务:锁对象:ID
seckill:stock:1001          # 秒杀:库存:商品ID
hot:search                  # 单例数据，不需要 ID
sign:20260828               # 签到以「天」为 key，用户 ID 进 offset
```

规律：**最后一层是「这份数据的唯一标识」，不一定都是用户 ID**——签到以天为单位，库存以商品为单位。

**两条边界**：

- **别太长**：key 本身占内存，100 万个 key 每个 40 字节就是 40MB。层级控制在 2~4 段、每段用短单词。
- **别太怪**：分隔符统一用**一个冒号**，别 `cart-user-1001`、`cart::user::1001` 混着来——团队内不统一，模式匹配就废了。

::: tip 💡 面试题：Redis key 怎么设计？
一句话结论：`业务:对象:ID` 冒号分层，做到不冲突、可批量匹配、自解释，长度控制在几十字节内。原因：key 既是内存资源也是检索入口，好命名 = 好排查 + 好运维。展开：配合 `SCAN MATCH 前缀:*` 做批量迁移/清理；分隔符全团队统一；禁止无分层的大杂烩命名。
:::

#### 5.3 Bitmap（位图）

用 String 的位操作实现，一个 bit 表示一个状态，适合签到、活跃用户统计，极省内存。

```bash
SETBIT sign:2024:01:01 10001 1     # 用户 10001 签到
BITCOUNT sign:2024:01:01           # 当天签到总人数
GETBIT sign:2024:01:01 10001       # 用户 10001 是否签到
```

#### 5.4 HyperLogLog（基数统计）

统计「不重复元素的数量」（UV），只需要 12KB 内存，误差约 0.81%，适合对精度不敏感的海量去重统计。

```bash
PFADD uv:page1 user1 user2 user3
PFADD uv:page1 user2 user4
PFCOUNT uv:page1                   # 约 4（去重后的独立用户数）
```

#### 5.5 Geo（地理位置）

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

**先补一个概念：乐观锁**——假设并发冲突很少发生，所以**不预先加锁**，而是提交时校验「我要改的数据没被别人动过」，动过就放弃重来。对应的悲观锁是「先加锁再操作」，宁可牺牲性能也杜绝冲突。数据库的版本号方案、这里的 WATCH，都是乐观锁。

**`WATCH` 乐观锁**：监视某个 key，如果在 `EXEC` 之前该 key 被**任何客户端**改过（包括本客户端在事务外的修改——只有事务队列内的修改不算，那些 EXEC 时才真正执行），则整个事务放弃执行，业务层自行重试。这就是 Redis 版的乐观锁。

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

## 基础篇练习

8 个真实互联网场景 + 1 道综合设计面。基础篇读了不等于会了——这里的题目和 §4 的示例**方向相反**：示例是「这个类型能干嘛」，练习是「这个需求该用什么」。每题 5~10 分钟，全部练完约一个下午，练完你就有底气接住「说说 Redis 数据类型和场景」这道面试必考题。

**练习规则**：

1. 需求都是「产品话」，先自己想清楚用什么类型、什么命令，再去敲。
2. 每题必须在 redis-cli 里真实敲一遍，对照「🧪 验收」自查输出。
3. 全部敲完、验收通过，再展开「参考答案」；最后看「面试官追问」，能一句话答上来才算过。
4. 练完想被抽查，把题号报给教练，按面试官方式追问。

::: warning 版本与编码提示
练习按本机 Redis 3.0（Windows）命令集出题：一次设多个 Hash 字段用 `HMSET`（`HSET` 多参数是 4.0+）；未使用 `SMISMEMBER`、`ZPOPMIN` 等 5.x/6.x 命令。另外 Windows 控制台敲中文值容易乱码，所以命令里的值统一用英文（真实项目里 value 是 UTF-8 的 JSON，无此问题）。练习环境 key 少，`KEYS` 随便用；生产仍禁用。
:::

**key 命名约定**（所有练习沿用，完整规范见 §5.2）：`业务:对象:ID`，如 `captcha:13800001111`、`cart:user:1001`。

---

### 练习 1 · 短信验证码（考察：String + 过期）

📜 **需求**：你在给 App 登录页写验证码服务，产品要求：

- 验证码 5 分钟内有效
- 60 秒内不允许重复发送
- 校验通过后验证码立即作废，不能二次使用

📋 **任务**：

- Q1 手机号 `13800001111` 的验证码 `246810` 写入 Redis，5 分钟过期
- Q2 用户 59 秒后狂点「重新发送」。先想：如果只靠验证码这个 key 的 NX 语义做冷却，冷却期实际是多久？符合「60 秒」需求吗？——然后写出正确的实现（提示：冷却和有效期是两件事）
- Q3 用户提交 `246810`，校验通过后立刻作废（写出命令序列）
- Q4 设计题：为什么 key 用手机号，而不是用户 ID？

🧪 **验收**：

- Q1 后 `TTL captcha:13800001111` 返回 300 以内的整数
- Q2 冷却 key 的 `TTL` 递减；60 秒内再次写入冷却 key 返回 `(nil)`，过期后返回 `OK`
- Q3 作废后 `GET captcha:13800001111` 返回 `(nil)`，`TTL` 返回 `-2`

::: details 参考答案（敲完再看）
```bash
# Q1：验证码本体，5 分钟有效期
SET captcha:13800001111 246810 EX 300

# Q2：冷却期用独立 key。如果复用验证码 key 的 NX，「没过期就不能重发」
# 会把冷却拉长到 300 秒——不符合 60 秒需求，所以必须拆成两个 key
SET captcha:cooldown:13800001111 1 NX EX 60   # OK → 真正发送；nil → 冷却中，拒绝

# Q3：校验比对 + 删除作废
GET captcha:13800001111      # "246810"，和用户输入比对
DEL captcha:13800001111
```
Q4：验证码发生在**登录之前**，此时还没有用户身份，手机号是唯一拿得到的标识。key 跟着「业务唯一标识」走，不跟用户体系走。
:::

::: details 💡 面试官追问（先自答，再看答案）
**追问 1**：怎么实现「1 小时内校验错 5 次就锁定」？
→ 再加一个计数 key：校验失败 `INCR captcha:fail:13800001111`，第一次 INCR 后 `EXPIRE` 设 3600，值 ≥ 5 就拒绝校验。INCR 计数 + 惰性设过期是限流的最简形态（高级篇展开）。

**追问 2**：Q3 的 GET 和 DEL 是两条命令，中间夹了并发请求会怎样？
→ 存在竞态：两个请求同时 GET 到同一个码、都校验通过。要把「比对 + 删除」合成一个原子操作，用 Lua 脚本（高级篇第 9 节）。
:::

---

### 练习 2 · 用户主页缓存（考察：String vs Hash 选型）

📜 **需求**：微博用户主页卡片：昵称、头像 URL、粉丝数、简介。读多写少，但粉丝数涨得勤。

📋 **任务**：

- Q1 用 String 方案缓存用户 1001 的资料（存 JSON），1 小时过期
- Q2 用 Hash 方案存同一份数据，key 为 `user:profile:1001`
- Q3 粉丝数 +1：两个方案分别写出命令，体会哪个是原子操作
- Q4 设计题：两种方案各适合什么情况？给出对比维度

🧪 **验收**：

- Q1 `GET` 返回 JSON 串，`TTL` 约 3600
- Q3 String 方案要走「GET → 代码里改 → SET 写回」三步；Hash 方案一条命令完成且返回新值

::: details 参考答案（敲完再看）
```bash
# Q1 String：整对象 JSON
SET user:1001 '{"name":"laowang","avatar":"https://cdn/x.png","fans":1024,"bio":"coder"}' EX 3600

# Q2 Hash：字段级
HMSET user:profile:1001 name laowang avatar https://cdn/x.png fans 1024 bio coder

# Q3 粉丝数 +1
# String：GET 出来 → 代码里 fans+1 → SET 写回。三步、非原子，并发下互相覆盖丢更新
HINCRBY user:profile:1001 fans 1    # Hash：一条命令，原子，返回 (integer) 1025
```
Q4 对比：

| 维度 | String 存 JSON | Hash |
| --- | --- | --- |
| 读整个对象 | ✅ 一次拿全 | HGETALL（大 Hash 慎用） |
| 改单个字段 | ❌ 整体序列化回写，非原子 | ✅ HINCRBY/HSET 字段级原子 |
| 内存 | JSON 串紧凑 | field 名重复存储，略占 |

选型口诀：**读多改少用 String，字段级高频更新用 Hash**。
:::

::: details 💡 面试官追问（先自答，再看答案）
**String 存 JSON 最大的坑是什么？**
→ 更新单字段要「读出 → 反序列化 → 改 → 序列化 → 写回」，并发下两个写请求互相覆盖（丢更新），且序列化本身有 CPU 开销。所以「对象 + 高频改字段」别用 String。
:::

---

### 练习 3 · 电商购物车（考察：Hash）

📜 **需求**：淘宝购物车：加购、改数量、删商品、列表页展示、角标显示商品种类数。约定 key：`cart:user:1001`，field = 商品 ID，value = 数量。

📋 **任务**：

- Q1 加购商品 88 两件、商品 99 一件
- Q2 商品 88 又被加购 1 件——注意是**累加**，不是覆盖成 1
- Q3 删掉商品 99；列表页取全部；角标取种类数
- Q4 设计题：商品数量被减到 0 时，应该 HDEL 还是把 value 留成 0？为什么？

🧪 **验收**：

- Q2 后 `HGET cart:user:1001 88` 返回 `"3"`
- Q3 后 `HGETALL` 只剩 88 → 3，`HLEN` 返回 `1`

::: details 参考答案（敲完再看）
```bash
HMSET cart:user:1001 88 2 99 1     # Q1
HINCRBY cart:user:1001 88 1        # Q2：累加用 HINCRBY，返回 (integer) 3
HDEL cart:user:1001 99             # Q3
HGETALL cart:user:1001
HLEN cart:user:1001                # (integer) 1
```
Q4：HDEL。留 0 有三个坏处：`HLEN` 把 0 也算进种类数、`HGETALL` 回来还要代码过滤、列表页可能渲染出「0 件」的脏数据。删干净，语义才清晰。
:::

::: details 💡 面试官追问（先自答，再看答案）
**能只给购物车里某个商品（field）设过期吗？**
→ 不能。`EXPIRE` 只作用于整个 key，Hash 的 field 没有独立 TTL。「30 天不操作清空购物车」的做法：每次操作对整个 key `EXPIRE` 续期（滑动过期）。另外「选中状态、加购时间」这类附加信息，可以再开一个 `cart:meta:user:1001`，或把 field 的 value 扩成 JSON。
:::

---

### 练习 4 · 微博热搜榜（考察：ZSet）

📜 **需求**：热搜榜实时更新：话题每被搜索一次热度加分；榜单展示 Top10；点进话题要显示「当前第 N 名」。

📋 **任务**：

- Q1 三个话题入库：`ai_face` 1000 分、`gaokao` 980 分、`worldcup` 950 分，key 为 `hot:search`
- Q2 `worldcup` 被疯狂搜索，热度 +60——执行后谁排第一？
- Q3 取 Top10（连分数一起返回）；查 `gaokao` 现在排第几
- Q4 设计题：两个话题分数相同时，谁排前面？由什么决定？

🧪 **验收**：

- Q1 后 `ZCARD hot:search` 返回 `3`
- Q2 后 `ZREVRANGE hot:search 0 0` 返回 `"worldcup"`
- Q3 `ZREVRANK hot:search gaokao` 返回 `1`（页面显示「第 2 名」）

::: details 参考答案（敲完再看）
```bash
ZADD hot:search 1000 ai_face 980 gaokao 950 worldcup   # Q1
ZINCRBY hot:search 60 worldcup                          # Q2：950+60=1010，反超登顶
ZREVRANGE hot:search 0 9 WITHSCORES                     # Q3：Top10 带分数
ZREVRANK hot:search gaokao                              # 降序排名，0 = 第一名
```
Q4：ZSet 同分按 member 的**字典序**（二进制逐字节比较）排，跟插入先后无关。想让「后爆的话题」排前，可以把时间因素编进 score（如 score = 热度 × 系数 + 时间衰减），或给 member 加时间前缀。
:::

::: details 💡 面试官追问（先自答，再看答案）
**为什么不用 MySQL `ORDER BY heat DESC LIMIT 10`？**
→ 热搜是「高频写 + 高频读」：MySQL 每次读要排序、每次加分要更新索引，走磁盘；ZSet 在内存里插入 O(log n)、取榜近 O(1)，跳表天然为「按分数排序 + 排名」设计。排行榜是 ZSet 的招牌场景。
:::

---

### 练习 5 · 微信好友关系（考察：Set）

📜 **需求**：微信三件事：① 查两人的共同好友 ② 给用户推荐「可能认识的人」（好友的好友里我不认识的）③ 判断 A 是不是 B 的好友。

📋 **任务**：

- Q1 建数据：张三（zhangsan）好友 = lisi、wangwu、zhaoliu；李四（lisi）好友 = zhangsan、wangwu、qianqi
- Q2 查 zhangsan 和 lisi 的共同好友
- Q3 给 zhangsan 推荐「可能认识的人」——注意差集方向，反了推荐就错了
- Q4 判断 zhaoliu 是不是 zhangsan 的好友；并说说这个高频判断为什么放 Set 而不是查 MySQL

🧪 **验收**：

- Q2 返回 `"wangwu"`
- Q3 返回 `"qianqi"`
- Q4 返回 `(integer) 1`

::: details 参考答案（敲完再看）
```bash
SADD friends:zhangsan lisi wangwu zhaoliu    # Q1
SADD friends:lisi zhangsan wangwu qianqi

SINTER friends:zhangsan friends:lisi         # Q2 共同好友 → wangwu
SDIFF friends:lisi friends:zhangsan          # Q3 lisi 有、zhangsan 没有 → qianqi
SISMEMBER friends:zhangsan zhaoliu           # Q4 → 1
```
`SDIFF A B` = A 有 B 没有。方向写成 `SDIFF friends:zhangsan friends:lisi` 推荐的就是 zhaoliu——他本来就是你好友，推荐就穿帮了。
Q4：好友判断是高频点查，Set 在内存 O(1)；走 MySQL 是一次磁盘索引查询，刷一次朋友圈要判断 N 次，直接把 DB 打挂。
:::

::: details 💡 面试官追问（先自答，再看答案）
**SINTER 两个百万级大集合会怎样？**
→ 集合运算是服务端全量计算，单线程下会阻塞其他命令。生产要么控制参与运算的集合规模，要么用 `SINTERSTORE` 把结果落到 key 里、放从库或异步任务去算。
:::

---

### 练习 6 · B 站最新弹幕（考察：List）

📜 **需求**：视频弹幕栏：新弹幕排最上面；最多展示最新 50 条；不许让列表无限堆积撑爆内存。

📋 **任务**：

- Q1 三条弹幕依次飞进来：`nice`、`trendy`、`next_time`，要求后进来的排前面，key 为 `danmu:v1`
- Q2 写出取「最新 50 条」的命令（注意 LPUSH 之后下标 0 是谁）
- Q3 防堆积：砍掉第 50 条以外的所有历史
- Q4 设计题：被砍掉的弹幕去哪了？用户翻半年前的历史弹幕怎么办？

🧪 **验收**：

- Q1 后 `LRANGE danmu:v1 0 -1` 的顺序是 `next_time`、`trendy`、`nice`
- Q3 后 `LLEN danmu:v1` ≤ 50

::: details 参考答案（敲完再看）
```bash
LPUSH danmu:v1 nice           # Q1：LPUSH 头插，后进来的在下标 0
LPUSH danmu:v1 trendy
LPUSH danmu:v1 next_time

LRANGE danmu:v1 0 49          # Q2：最新 50 条
LTRIM danmu:v1 0 49           # Q3：只保留下标 0~49，其余真删
```
Q4：LTRIM 是真删，被砍的就没了——所以 Redis 里只放「最新 50 条的热数据」，全量弹幕在 MySQL。翻历史时回源 DB 分页查。**Redis 是热数据缓存，不是全量存储**，这是缓存设计的通用原则。
:::

::: details 💡 面试官追问（先自答，再看答案）
**List 当消息队列有什么坑？**
→ ① 消费者用 LPOP 轮询，队列空时空轮询白耗 CPU，应该用 BRPOP 阻塞等待；② 弹出即消失，消费者处理失败消息就丢了，没有 ack 机制——可靠队列用 Stream 或专业 MQ（RocketMQ/Kafka）。
:::

---

### 练习 7 · 秒杀库存预扣（考察：String 计数 + 事务）⭐

📜 **需求**：100 台 iPhone 秒杀，绝对不能超卖。这道题是基础篇通往高级篇的桥：先亲手制造超卖，再修好它。

📋 **任务**：

- Q1 库存预热进 Redis，key 为 `seckill:stock:1001`
- Q2 写出「扣 1 件库存」的命令——先想：这条命令本身怕并发吗？
- Q3 直觉方案是「先 GET 判断还剩 >0，再扣」。**开两个 cmd 窗口各连一个 redis-cli** 模拟并发：A 窗口 GET 到剩 1、还没来得及扣时，B 窗口也 GET 到 1，然后两边都执行扣减。说说发生了什么
- Q4 用 WATCH + MULTI 写出完整的乐观锁扣减，重演 Q3 的并发，验证不再超卖

🧪 **验收**：

- Q2 后 `GET seckill:stock:1001` 返回 `"99"`
- Q4 并发复现时，后执行的那个窗口 `EXEC` 返回 `(nil)`（事务放弃执行），库存永远不会变负数

::: details 参考答案（敲完再看）
```bash
# Q1/Q2
SET seckill:stock:1001 100
DECRBY seckill:stock:1001 1      # (integer) 99。单条命令原子，本身不怕并发

# Q4：乐观锁扣减（A 窗口）
WATCH seckill:stock:1001         # 盯住库存
GET seckill:stock:1001           # 业务判断：> 0 才继续
MULTI
DECRBY seckill:stock:1001 1
EXEC                             # 期间 B 窗口改过库存 → 返回 nil，放弃重来
```
```
# B 窗口在 A 的 GET 之后、EXEC 之前插入执行：
DECRBY seckill:stock:1001 1      # A 的 WATCH 感知到变化，A 的 EXEC 返回 (nil)
```
要点：超卖不发生在单条 DECRBY 上，而发生在**「检查 + 扣减」是两步**——检查时是 1，扣的时候可能已经被别人扣了。WATCH 把两步打包成「期间没人动过才执行」，失败就重试整个流程。
:::

::: details 💡 面试官追问（先自答，再看答案）
**WATCH 失败要在代码里写重试循环，很啰嗦，生产怎么做？**
→ 把「判断 >0 + 扣减」写进一段 Lua 脚本，Redis 服务端一次性原子执行，天然无竞态、无需重试。Lua 是高级篇第 9 节的内容，也是你接下来验证码「校验即删除」要用的工具。
:::

---

### 练习 8 · 抖音签到与视频 UV（考察：Bitmap / HyperLogLog）

📜 **需求**：① 每日签到：记录用户今天来没来，统计今天总签到人数；② 视频页 UV：一条 1 亿播放的视频，只关心「大概多少人看过」，允许极小误差。

📋 **任务**：

- Q1 用户 `10086` 今天（2026-08-27）签到了；查他今天签没签；统计今天签到总人数
- Q2 视频 `v1` 的 UV：zhangsan、lisi、wangwu、zhangsan（重复）看过，统计去重后的人数
- Q3 设计题：签到用 Set 也能做（`SADD sign:today 10086`），什么时候必须换成 Bitmap？算一笔内存账

🧪 **验收**：

- Q1 `GETBIT` 返回 `1`，`BITCOUNT` 返回 `1`
- Q2 `PFCOUNT` 返回 `3`（重复的 zhangsan 被去重）

::: details 参考答案（敲完再看）
```bash
SETBIT sign:20260827 10086 1     # Q1：offset = 用户 ID
GETBIT sign:20260827 10086       # 1
BITCOUNT sign:20260827           # 1

PFADD uv:v1 zhangsan lisi wangwu zhangsan   # Q2：故意重复
PFCOUNT uv:v1                    # 3
```
Q3 内存账：Bitmap 一个用户只花 1 bit，1 亿用户 ≈ 100000000 / 8 / 1024 / 1024 ≈ **12MB**；Set 存 1 亿个成员要好几个 GB。选型口诀：**稠密用 Bitmap，稀疏用 Set，海量去重可容忍 0.81% 误差用 HyperLogLog（固定 12KB）**。
:::

::: details 💡 面试官追问（先自答，再看答案）
**Bitmap 怎么实现「连续签到 7 天」？**
→ 每天一个 key（`sign:20260827`…`sign:20260902`），对同一个 offset 连续取 7 个 key 的位：全 1 即连续 7 天。批量判断用 `BITOP AND` 把 7 个 key 做按位与，结果里为 1 的 offset 就是全勤用户。
:::

---

### 练习 9 · 综合设计面（考察：全部）

📜 **形式**：面试官连珠炮。下面 10 个需求，每个 10 秒内说出「用什么类型 + 一句话理由」。全部答完再展开答案对一遍——这就是面试原题「说说 Redis 的数据类型和使用场景」的实战形态。

📋 **需求清单**：

1. 首页 Banner 轮播图缓存，读多改少
2. 购物车
3. 全站商品热销 Top100
4. 判断两个人是否互相关注
5. 最新 100 条系统公告
6. 1 亿用户「今天是否登录过」
7. 一篇文章的独立访客数（可容错）
8. 手机验证码 5 分钟有效
9. 秒杀扣库存防超卖
10. 查找 3 公里内的门店

::: details 参考答案（全部答完再看）
| # | 需求 | 选型 | 一句话理由 |
| --- | --- | --- | --- |
| 1 | Banner 缓存 | String 存 JSON | 读多改少整对象，一次读完 |
| 2 | 购物车 | Hash | 字段级数量，HINCRBY 原子累加 |
| 3 | 热销 Top100 | ZSet | 按分数排序，ZREVRANGE 直接取榜 |
| 4 | 是否互关 | Set | SISMEMBER O(1) 点查，SINTER 算共同关注 |
| 5 | 最新公告 | List + LTRIM | LPUSH 头插，LTRIM 只留 100 条 |
| 6 | 今日是否登录 | Bitmap | 1 人 1 bit，1 亿人约 12MB |
| 7 | 文章 UV | HyperLogLog | 固定 12KB，0.81% 误差可接受 |
| 8 | 验证码 | String + EX + NX | SET ... EX 300 存验证码，独立 key NX 限重发 |
| 9 | 秒杀防超卖 | Lua（WATCH 也可） | 「判断 + 扣减」必须原子，Lua 最省事 |
| 10 | 附近门店 | Geo | GEOADD 入库，GEOSEARCH BYRADIUS 按半径搜 |
:::

::: details 💡 终极检验：示范话术（背结构，不背原文）
**面试原题**：「讲讲 Redis 的常用数据类型和使用场景。」

**30 秒示范**：
「常用的是五种基本类型：String 做缓存和计数器，比如验证码就是 String 加 EX；Hash 存对象，比如购物车按商品 ID 存数量，用 HINCRBY 原子累加；List 做最新列表，配合 LTRIM 控制长度；Set 做去重和集合运算，比如共同好友；ZSet 做排行榜，跳表支撑 O(log n) 取 TopN。扩展类型里，Bitmap 做签到，HyperLogLog 统计 UV。这些在我项目里都落地过，验证码、Token 续期、排行榜都是我写的。」

结构拆解：**每类型 = 名字 + 场景，全程 30 秒**；最后一句主动把话题引向自己的项目——把面试官领到你最熟的主场，后面的问题就都在你射程内。
:::

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
- 每个 key 通过 `CRC16(key) % 16384` 计算所属槽（CRC16 是一种哈希算法，把任意 key 变成一个整数）。
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

## 高级篇练习

高级篇和基础篇不一样：面试官在这里考的不是「命令怎么敲」，而是「**出了事怎么办、方案怎么选**」。所以练习是两种形态混合——分布式锁、Lua、主从、持久化继续动手（redis-cli 就能玩，其中主从要再开一个 cmd 跑第二个 redis-server 实例，命令本章都给出）；三大问题的方案选型、缓存一致性时序、哨兵集群、压轴设计是**推演题**——拿张纸画时间轴、写方案、说理由，这才是高级篇的考试方式。

注意事项：Windows cmd 敲不了多行脚本，本章所有 `EVAL` 都是单行写法；动手题需要**两个 cmd 窗口各开一个 redis-cli**，用来扮演两个竞争的服务实例。

---

### 练习 1 · 缓存穿透（考察：空值缓存 + 布隆过滤器）

📜 **需求**：商品详情接口被攻击：请求携带根本不存在的商品 ID（如 `999999`），缓存永远 miss，每次都打到 MySQL，DB 快被打挂了。

📋 **任务**：

- Q1 复现穿透：`GET product:999999` 返回 nil（假装查 DB 也是 nil）。用「空值缓存」修复：把空结果也缓存住 60 秒。写出命令
- Q2 手搓玩具布隆过滤器：用 Bitmap + 给定的 3 个「哈希结果」模拟。添加商品 ID 1001，假设 h1=3、h2=7、h3=11，写出添加命令；再分别判断 1001（h=3,7,11）和 2002（h=4,8,12）是否存在，说出判断逻辑
- Q3 设计题：空值缓存和布隆过滤器怎么选？给三个对比维度

🧪 **验收**：

- Q1 后 `GET product:999999` 返回空串而非 nil，且带 TTL
- Q2 判 1001：三处 GETBIT 全 1 → 可能存在；判 2002：出现 0 → 一定不存在，直接拦下

::: details 参考答案（敲完再看）
```bash
# Q1 空值缓存：DB 查不到也写一个短过期的空标记
SET product:999999 "" EX 60
# 之后 GET 命中空串 → 直接返回「商品不存在」，不再回源 DB

# Q2 玩具布隆：位数组就是 Bitmap
SETBIT bloom:product 3 1
SETBIT bloom:product 7 1
SETBIT bloom:product 11 1
GETBIT bloom:product 3      # 1
GETBIT bloom:product 7      # 1
GETBIT bloom:product 11     # 1 → 全为 1：可能存在（有假阳性可能）
GETBIT bloom:product 4      # 2002 的位置有 0 → 一定不存在，拦下不打 DB
```
Q3 对比：

| | 空值缓存 | 布隆过滤器 |
| --- | --- | --- |
| 防护范围 | 只防「出现过的」无效 key | 所有不存在的 key，包括还没出现的 |
| 内存 | 每个无效 key 一条 | 固定位数组，极省 |
| 误判 | 无 | 有假阳性，判「存在」后仍要查 DB 兜底 |

选型：攻击 key 随机海量 → 布隆；少量固定无效 → 空值缓存；生产常两层叠加。
:::

::: details 💡 面试官追问（先自答，再看答案）
**布隆说「可能存在」时为什么还要查 DB？**
→ 假阳性：多个元素哈希碰撞会让不存在的 key 恰好位全 1。布隆只负责拦下「一定不存在」的绝大多数恶意请求，放行的走正常缓存 + DB 链路。
:::

---

### 练习 2 · 缓存击穿（考察：互斥锁 + 逻辑过期）

📜 **需求**：直播间爆款商品详情的缓存恰好过期的一瞬间，上万请求同时 miss，全部涌向 MySQL 重建缓存。

📋 **任务**：

- Q1 用互斥锁修：写出「抢到锁的请求去重建缓存，没抢到的不打 DB」的加锁命令（key：`lock:rebuild:product:1`，10 秒自动过期）
- Q2 两个窗口验证互斥：A 窗口加锁，B 窗口加同一把锁，观察返回值差异
- Q3 设计题：这把锁的 EX 设多久？设短了、设长了分别会出什么事？
- Q4 设计题：互斥锁和「逻辑过期」（缓存不设 TTL、value 里带过期时间，过期后异步重建）怎么选？

🧪 **验收**：

- Q2：A 返回 `OK`，B 返回 `(nil)`

::: details 参考答案（敲完再看）
```bash
SET lock:rebuild:product:1 "uuid-a" NX EX 10   # A 窗口 → OK，去查 DB 重建
SET lock:rebuild:product:1 "uuid-b" NX EX 10   # B 窗口 → (nil)，不查 DB，返回旧数据/稍后再试
```
Q3：设短了 → 重建还没完成锁先过期，第二个请求进来重复建缓存；设长了 → 重建的线程挂了，其他请求一直干等。按「重建耗时估算 × 余量」设，终极方案是看门狗自动续期（练习 5 的 Redisson）。
Q4：互斥锁保一致但牺牲可用性（没抢到就等）；逻辑过期保可用但短期返回旧数据。秒杀级热点用逻辑过期（用户不能等），一般热点互斥锁就够。
:::

::: details 💡 面试官追问（先自答，再看答案）
**为什么重建缓存的锁也要「唯一 value」？**
→ 和分布式锁同一个道理：A 的锁若过期，B 抢到锁，A 重建完直接删锁会误删 B 的。用 UUID 标识持锁人，释放前校验归属——练习 5 会亲手复现这个事故。
:::

---

### 练习 3 · 缓存雪崩（考察：过期随机化 + 多层防御）

📜 **需求**：凌晨的批量预热脚本给 10 万个商品 key 统一设了 `EXPIRE 3600`。一小时后这批 key **集体过期**，DB 瞬间接到了平时 20 倍的查询量。

📋 **任务**：

- Q1 复现：给 3 个 key 设相同 TTL，观察它们「同生共死」
- Q2 修复：用「基础 TTL + 随机偏移」重新设置（生产中偏移量由代码生成 random(0,300)），让过期点错开
- Q3 设计题：过期打散之外，雪崩还有哪几层防御？（提示：再从「Redis 整个挂了」的角度想一遍）
- Q4 一句话辨析：雪崩和击穿的区别

🧪 **验收**：

- Q2 后三个 key 的 TTL 互不相同

::: details 参考答案（敲完再看）
```bash
SET p:1 a
SET p:2 a
SET p:3 a
EXPIRE p:1 3600        # Q1：三个 key 同生共死——雪崩的种子
EXPIRE p:2 3600
EXPIRE p:3 3600

# Q2：错开过期点（生产用代码生成随机偏移，这里手动演示）
EXPIRE p:1 3600
EXPIRE p:2 3820
EXPIRE p:3 3660
```
Q3 防御清单（按层背）：① 过期时间加随机偏移，打散过期点；② 多级缓存（本地 Caffeine + Redis），Redis 挂了本地兜底；③ DB 前限流降级，宁可拒绝部分请求也不让 DB 挂；④ 高可用（主从 + 哨兵），别让缓存单点整体消失。
Q4：击穿是**一个**热点 key 过期（精准打击），雪崩是**一大批** key 同时失效或缓存整体宕机（面打击）。
:::

::: details 💡 面试官追问（先自答，再看答案）
**为什么批量预热是雪崩高发场景？**
→ 脚本循环里往往写死固定 TTL，10 万个 key 在同一秒到期。预热代码必须 `TTL = 基础值 + random(0,300)`，这是生产的肌肉记忆。
:::

---

### 练习 4 · 缓存一致性（考察：Cache Aside 时序推演）

📜 **需求**：商品价格更新。同事写了「先删缓存，再更新 DB」，上线后客服反馈：**改完价格，页面偶尔显示旧价格，而且旧价格一直不消失**。

📋 **任务**：

- Q1 推演：把下面的时间轴补完——谁在什么时刻把旧值放回了缓存？
  ```
  写请求A            读请求B
     删缓存
     ?               缓存 miss
     ?               查 DB
     更新 DB（新价）
     ?               ?
  ```
- Q2 写出正确顺序的伪代码（两行），并解释为什么是「删缓存」而不是「更新缓存」
- Q3 「先更新 DB 再删缓存」仍有极小概率脏数据，说出两个兜底方案
- Q4 判断题：删缓存这一步失败了（网络抖动）怎么办？

🧪 **验收**：

- Q1 能明确指出：B 的回填发生在 A 的「删缓存之后、更新 DB 完成之前」

::: details 参考答案（推演完再看）
Q1 补全：B 在缓存 miss 后查到**旧价**；此刻 A 还没来得及更新 DB；B 把旧价**回填缓存**；A 随后才把新价写进 DB——缓存里从此一直是旧价，直到下次过期。这就是客服现象的完整解释。
```java
// Q2 正确顺序（Cache Aside）
db.update(newVal);    // 1. 先更新 DB
redis.del(key);       // 2. 再删缓存
```
删而不是更：① 并发写 A、B 更新缓存的先后无法保证，可能留下旧值；② 删除让下次读自然回填最新值，天然幂等；③ 读多写少场景删了不用白构建。
Q3：**延迟双删**（更新 DB 后删一次，延迟几百毫秒再删一次，把并发回填的旧值清掉）；**监听 binlog（Canal）+ 消息队列异步删**，删除失败自动重试，保证最终一致。
Q4：删除操作进 MQ 重试直到成功（或 Canal 感知变更后异步删）。追求绝对强一致既没必要也不可能——缓存方案的本质是一致性和性能的取舍。
:::

::: details 💡 面试官追问（先自答，再看答案）
**为什么「先更新 DB 再删缓存」的脏数据窗口更小？**
→ 它的残余场景只剩「读请求在 DB 更新**前**查了旧值，又恰好在删缓存**后**才回填」——要求读请求的执行恰好横跨整个写过程，概率极低；而「先删后更」只要删缓存和改 DB 之间来一个读就中招。所以前者是默认选择，不是完美选择。
:::

---

### 练习 5 · 分布式锁（考察：SET NX EX + Lua 释放）⭐

📜 **需求**：订单服务双实例部署，生成订单号要防止重复。你在两个窗口里分别扮演实例 A 和实例 B——并亲手制造一次「误删别人的锁」事故，再修好它。

📋 **任务**：

- Q1 A 窗口加锁 `SET lock:order:no "uuid-a" NX EX 30`，B 窗口加同一把锁，观察结果差异
- Q2 复现事故：假设 A 业务超时、锁已过期被 B 抢到（`uuid-b`）；A 处理完回来**直接 DEL** 这把锁——B 的锁还在吗？互斥还被保证吗？
- Q3 修复：写出释放锁的正确姿势——一条命令完成「校验归属 + 删除」且原子
- Q4 设计题：业务真的会跑超过 30 秒，怎么办？（一个开源组件名 + 它的核心机制）

🧪 **验收**：

- Q1 B 返回 `(nil)`
- Q2 DEL 后 `GET lock:order:no` 返回 `(nil)`——B 的锁被 A 误删，互斥被破坏（事故复现成功）
- Q3 修复后：A 拿 `uuid-a` 释放返回 `0`（不是我的锁，不删）；B 拿 `uuid-b` 释放返回 `1`

::: details 参考答案（敲完再看）
```bash
# Q1
SET lock:order:no "uuid-a" NX EX 30    # A 窗口 → OK
SET lock:order:no "uuid-b" NX EX 30    # B 窗口 → (nil)

# Q2 复现误删：A 的锁 30 秒过期后
SET lock:order:no "uuid-b" NX EX 30    # B 抢到锁
DEL lock:order:no                       # A 回来无脑删 → 把 B 的锁删了！

# Q3 修复：Lua 把「校验 + 删除」变成原子（单行写法）
EVAL "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end" 1 lock:order:no uuid-a
```
要点：GET 和 DEL 两步之间锁可能易主，必须合成原子操作；value 用 UUID 标识持锁人，「是我的锁才删」。
Q4：**Redisson**——看门狗机制：默认锁 30 秒，后台线程每 10 秒检查一次，业务没跑完就把过期时间续回 30 秒。业务不超时锁永不过期，进程宕机锁 30 秒后自动释放（不会死锁），两头都兜住。
:::

::: details 💡 面试官追问（先自答，再看答案）
**锁为什么必须加 EX？不加会怎样？**
→ 加锁和释放不在同一进程，持锁方宕机 / GC 停顿 / 网络中断都会让释放逻辑没执行，锁永不释放 → 所有人干等 = 死锁。EX 是「兜底自杀机制」，代价是业务超时锁提前易主，用看门狗续期缓解。
:::

---

### 练习 6 · 持久化（考察：RDB 与 AOF 亲手验证）

📜 **需求**：生产事故预演——Redis 重启后数据还在吗？取决于持久化配置。亲手验证一次 RDB 恢复。

📋 **任务**：

- Q1 查当前持久化配置：RDB 的 save 规则、AOF 开没开、数据目录在哪（三条 CONFIG GET）
- Q2 写入标志 key `rdb:test hello`，手动触发一次 RDB 快照，去数据目录确认 `dump.rdb` 刚刚更新（看文件修改时间）
- Q3 关掉 redis-server 再重新启动，连上后 `GET rdb:test`——数据回来了吗？
- Q4 设计题：RDB 和 AOF 怎么选？生产推荐什么组合？

🧪 **验收**：

- Q2 能看到修改时间就在刚才的 `dump.rdb`
- Q3 重启后 `GET rdb:test` 返回 `"hello"`——RDB 恢复成功

::: details 参考答案（敲完再看）
```bash
CONFIG GET save           # "900 1 / 300 10 / 60 10000"：900 秒内改 1 次就触发 bgsave，以此类推
CONFIG GET appendonly     # "no"：AOF 默认关闭
CONFIG GET dir            # dump.rdb 的存放目录

SET rdb:test hello
BGSAVE                    # Background saving started
# 去 dir 指向的目录看 dump.rdb 的修改时间，就是刚刚
```
Q4：RDB 是某一时刻的完整快照——文件小、恢复快，但两次快照之间的数据宕机就丢；AOF 逐条记录写命令——最多丢 1 秒（everysec），但文件大、恢复慢。生产：**两者都开 + 4.0+ 混合持久化**（RDB 做主体 + 增量 AOF），兼顾恢复速度和丢数据窗口。
:::

::: details 💡 面试官追问（先自答，再看答案）
**BGSAVE 期间主进程还能处理写请求吗？**
→ 能。BGSAVE fork 子进程去做快照，主进程照常服务；靠**写时复制（COW）**——fork 后父子共享内存页，主进程要改某页才复制一份，子进程看到的永远是 fork 那一刻的数据视图。
:::

---

### 练习 7 · 主从复制（考察：真的挂一个从库）

📜 **需求**：读请求把单机 Redis 顶得吃力，加一个从库做读写分离。不用第二台机器——同一个 Redis 目录再起一个实例就行。

📋 **任务**：

- Q1 新开一个 cmd 窗口，在 Redis 目录用带参启动第二个实例：端口 6380，主库指向 6379（写出完整命令）
- Q2 验证复制：在 6379 上 `SET master:test hello`，去 6380 上 `GET`——能读到吗？
- Q3 验证从库只读：在 6380 上 `SET foo bar`，会发生什么？
- Q4 两个实例分别执行 `INFO replication`，说出各自的角色；并回答：主库挂了，从库会自动顶上吗？

🧪 **验收**：

- Q2 6380 读到 `"hello"`
- Q3 6380 返回 `READONLY` 错误
- Q4 6379 是 `role:master` 且带 `slave0`；6380 是 `role:slave` 且 `master_host:127.0.0.1`

::: details 参考答案（敲完再看）
```bash
# Q1 新窗口，进 redis 目录
redis-server.exe --port 6380 --slaveof 127.0.0.1 6379

# Q2 主写从读：6379 上 SET master:test hello，然后 6380 上：
GET master:test          # "hello"——复制同步过来了

# Q3 从库默认只读
SET foo bar              # (error) READONLY You can't write against a read only replica.

INFO replication         # 两边各跑一次，看 role
```
Q4：**不会自动顶上**。主从只负责复制数据，故障切换要靠**哨兵**（持续监控 + 自动选新主 + 通知客户端）。没有哨兵的主从架构，主挂了只能人工把从库升主。
:::

::: details 💡 面试官追问（先自答，再看答案）
**主从复制是强一致吗？**
→ 不是，**异步复制**：主库写成功立刻返回客户端，从库异步追赶——主库挂掉的瞬间可能丢最后一小段没同步完的数据。这是拿一致性换性能，也是红锁争议的技术根源（高级篇 §7.4）。
:::

---

### 练习 8 · 哨兵与集群（考察：Sentinel / Cluster 推演）

📜 **形式**：面试官连环问，这一题不动手——画图 + 推演作答，全部答完再看答案。

📋 **任务**：

- Q1 主观下线和客观下线的区别？为什么需要两级判定？（提示：一个哨兵说主挂了，可信吗？）
- Q2 哨兵从多个从库里选新主，按什么规则筛？
- Q3 三主三从的 Cluster 挂掉一个主节点，会发生什么？如果挂的主**没有**从库呢？
- Q4 客户端访问一个不归这个节点管的 key，会收到 MOVED——它和 ASK 的区别，一句话
- Q5 为什么是 16384 个槽，不是 65536？（答出「心跳包」这个关键词算过）

::: details 参考答案（全部推演完再看）
Q1：主观下线 = 单个哨兵认为主不可达（可能只是它自己网络抖了）；客观下线 = 达到 quorum 个数的哨兵**都**认为挂了才判定。两级判定防止单点误判触发无谓的主从切换。
Q2：晋升筛选顺序：**slave-priority 优先级高者优先 → 复制偏移量大者优先（数据最全）→ runid 小者优先**。先过滤掉断线和数据落后的。
Q3：挂的主有从库 → 集群自动把它的从库晋升为新主，集群继续服务；挂的主没有从库 → 这部分槽位没人服务，**整块不可用**（Cluster 要求槽完整才对外服务），需要尽快恢复节点或迁移槽。
Q4：MOVED = 槽**已经**迁到新节点，以后直接去新地址；ASK = 槽**正在**迁移中，本次去新地址试，下次还来问我。
Q5：集群节点心跳包里携带自己负责的槽位图，16384 位 = 2KB，65536 位 = 8KB，心跳太浪费带宽；且官方建议集群不超过 1000 个主节点，16384 个槽完全够分。
:::

::: details 💡 面试官追问（先自答，再看答案）
**哨兵和集群，我该用哪个？**
→ 解决的问题不同：**哨兵解决高可用**（主挂自动切），但不分片，容量还是单机上限；**集群解决容量与写扩展**（分片 + 16384 槽），顺带自带故障转移。数据量单机装得下 → 主从 + 哨兵；装不下 → 集群。
:::

---

### 练习 9 · Lua 脚本（考察：把「两步」变「一步」）⭐

📜 **需求**：前面已经两次撞上同一个竞态：练习 1 的「GET 比对 → DEL」和练习 7 的「GET 判断 → DECRBY」，两步之间都可能被插队。今天用 Lua 一次修干净——这个「校验即消费」模式你马上会在验证码服务里用到。

📋 **任务**：

- Q1 验证码版：先重新 `SET captcha:13800001111 246810 EX 300`，然后写一段单行 Lua：GET 验证码，**等于**用户输入就 DEL 并返回 1，否则返回 0（想清楚 numkeys、KEYS、ARGV 各是什么）
- Q2 库存版：`SET seckill:stock:1001 5`，写单行 Lua：库存转数字后 >0 就 DECRBY 1 并返回 1，否则返回 0（注意 Lua 里 GET 出来的是字符串，比较前要转数字）
- Q3 验证原子性：两个窗口对着同一个库存 key 疯狂执行 Q2 的脚本（合计 8 次以上），最后 `GET` 库存——会出现负数吗？对比练习 7 的 WATCH 写法，Lua 好在哪？
- Q4 辨析：Lua 和 Pipeline 都能「一次发多条」，本质区别是什么？

🧪 **验收**：

- Q1 输入正确 → 返回 `(integer) 1` 且 key 已删；输入错误 → `0` 且 key 还在
- Q3 两窗口合计最多成功 5 次，库存**恰好 0**，绝不出现负数

::: details 参考答案（敲完再看）
```bash
# Q1 验证码「比对 + 消费」原子版：1 个 key（numkeys=1），用户输入走 ARGV
EVAL "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end" 1 captcha:13800001111 246810

# Q2 库存「判断 + 扣减」原子版：tonumber 不能省，字符串没法和数字比大小
EVAL "local s=tonumber(redis.call('get',KEYS[1])) if s>0 then redis.call('decrby',KEYS[1],1) return 1 else return 0 end" 1 seckill:stock:1001
```
结构：`EVAL 脚本 numkeys KEYS... ARGV...`。业务 key 一律从 KEYS 传、业务参数从 ARGV 传，**别把 key 写死在脚本里**——集群模式下写死会导致路由错乱。
Q3：库存最终恰好 0，其余请求全返回 0。对比练习 7：WATCH 要在代码里写重试循环，Lua 在服务端天然原子、无需重试——这就是「多条命令 + 逻辑判断」的正解。
Q4：Lua 在服务端**原子**执行（脚本期间其他命令排队），适合有逻辑判断的互斥操作；Pipeline 只是把命令打包发送**省网络往返**，命令仍逐条独立执行、**不原子**。要原子用 Lua，要批量提速用 Pipeline。
:::

::: details 💡 面试官追问（先自答，再看答案）
**Lua 脚本执行期间 Redis 还能服务其他请求吗？**
→ 不能——脚本执行是阻塞的（单线程）。所以脚本必须短小、绝不能在里面循环遍历大集合，否则等于自己制造了一次 KEYS * 事故。
:::

---

### 练习 10 · 综合压轴 · 秒杀系统缓存方案（考察：全章）

📜 **形式**：面试压轴原题：「**设计一个商品秒杀系统的缓存方案**」。这一题把高级篇全部串起来。先自己拿纸写 10 分钟提纲，再展开骨架逐条对——漏了哪块，就回对应小节复习。

📋 **方案要覆盖（自查清单）**：

① 商品详情缓存用什么类型？② 缓存三大问题各怎么防？③ 商品改价后缓存怎么保持一致？④ 库存怎么扣才不超卖？⑤ 销量榜单怎么实时更新？⑥ 服务多实例部署，怎么防止重复下单？⑦ Redis 宕机怎么办？（持久化和高可用各说一层）

::: details 参考骨架（逐条对完再合上）
① 详情用 String 存 JSON（读多改少整对象）；库存数单独用一个 String key 存，方便原子扣减
② 穿透：商品 ID 先过布隆过滤器 + 空值缓存兜底；击穿：爆款重建缓存用互斥锁（秒杀级热点用逻辑过期）；雪崩：TTL 加随机偏移 + 本地多级缓存 + DB 前限流
③ Cache Aside：先更新 DB 再删缓存，延迟双删兜底；删除失败走 Canal/MQ 重试，保证最终一致
④ 库存用 Lua「判断 >0 + 扣减」原子执行（练习 9 的脚本），扣到 0 拒绝下单
⑤ 销量 ZSet `ZINCRBY` 实时加分，`ZREVRANGE` 取 TopN
⑥ 分布式锁 `SET NX EX` + UUID + Lua 释放；业务可能超时用 Redisson 看门狗
⑦ 持久化 RDB + AOF 混合，重启快速恢复；高可用主从 + 哨兵自动切换，数据量再大上集群分片
:::

::: details 💡 答题心法（背这个，不背答案本身）
每答一个点都补一句「为什么」：说布隆过滤器要带上「假阳性所以还要 DB 兜底」，说 Lua 要带上「两步命令之间会插队」，说主从要带上「异步复制所以主挂可能丢一点数据」。**面试官要的是 trade-off，不是名词堆砌**——名词谁都会背，说得出代价和边界才是 engineer。
:::

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

每个主节点负责一部分槽。节点间用 **gossip 协议**传播节点状态和槽归属信息（gossip = 流言协议：每个节点随机找几个邻居交换彼此知道的状态，像八卦传开一样，几轮之后全网达成一致）。

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
