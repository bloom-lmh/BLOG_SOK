# Day 30 · 复盘（端到端联调 + 简历项目描述 + 八股映射）

> **今天目标**：把 30 天的成果「变现」——① 用一条端到端联调链路验证整个系统贯通；② 把项目写成简历上能打的「项目描述」（STAR 法则 + 量化数据）；③ 把 30 天做过的每个功能映射成面试官会问的八股题，形成你自己的「项目 → 考点」对照表。今天不写新功能，今天是把项目变成面试战斗力。

## 一、前置条件

- 已完成 Day 01 ~ Day 29（至少完成到 Day 20，秒杀链路是联调的重点）
- MySQL / Redis / Nacos 已启动，网关 `curl http://localhost:9000/api/health` 能通
- 准备好一个笔记本（物理的也行）：今天产出的「联调记录」「简历描述」「八股映射表」都要沉淀下来

## 二、今天完成后你会得到什么

1. 一条跑通的完整业务链路（从注册到下单到支付，全部 curl 有响应记录）
2. 一段 200 字以内的「项目简介」+ 4 条「个人职责」+ 3 个「难点亮点」——直接贴简历
3. 一张「项目功能 → 面试考点 → 复习链接」对照表——面试前的冲刺地图
4. 项目 README + 干净的 git 提交记录——面试官看仓库的第一印象

## 三、步骤

### 步骤 1：端到端联调（把 30 天的功能串成一条链路）

按顺序执行下面的 curl（在 Git Bash 里），每一步都要看到预期返回。**这条链路本身就是你面试讲项目的「主线剧情」**：

```bash
# ─── 1. 入口健康检查（Day16 网关）───
curl http://localhost:9000/api/health

# ─── 2. 注册用户（Day03，走网关转发到 mall-user）───
curl -X POST http://localhost:9000/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"username":"lmh_final","password":"123456","phone":"13800138000","email":"lmh@test.com"}'

# ─── 3. 登录拿 token（Day04 JWT）───
# 把返回的 accessToken 复制下来，下面所有带鉴权的请求都要带
curl -X POST http://localhost:9000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"lmh_final","password":"123456"}'

# ─── 4. 查课程列表（Day06 MyBatis-Plus 分页 + 条件查询）───
curl "http://localhost:9000/api/course/list?categoryId=1&page=1&size=5"

# ─── 5. 查课程详情（Day08 Redis 缓存——连查两次，第二次快很多）───
curl http://localhost:9000/api/course/1
curl http://localhost:9000/api/course/1

# ─── 6. 下单（Day10 订单 + 状态机 + 事务扣库存）───
curl -X POST http://localhost:9000/api/order/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 你的token" \
  -d '{"courseId":1,"count":1}'

# ─── 7. 支付（Day12 沙箱支付 + 回调幂等）───
curl -X POST http://localhost:9000/api/pay/create \
  -H "Content-Type: application/json" \
  -d '{"orderNo":"上一步返回的订单号","payType":1}'
# 模拟支付平台回调（连调两次，验证幂等：第二次应该返回「重复回调被拦截」）
curl -X POST http://localhost:9000/api/pay/mock-success \
  -H "Content-Type: application/json" \
  -d '{"orderNo":"上一步返回的订单号"}'
curl -X POST http://localhost:9000/api/pay/mock-success \
  -H "Content-Type: application/json" \
  -d '{"orderNo":"上一步返回的订单号"}'

# ─── 8. 查订单（Day10 订单查询，状态应该已经是「已支付」）───
curl http://localhost:9000/api/order/订单ID -H "Authorization: Bearer 你的token"

# ─── 9. 秒杀（Day19/20 预扣减 + MQ 削峰）───
curl -X POST http://localhost:9000/api/seckill/1 \
  -H "Authorization: Bearer 你的token"

# ─── 10. 搜索课程（Day25 Elasticsearch 高亮搜索）───
curl "http://localhost:9000/api/search/course?keyword=Java"
```

把上面每一步的输出截图/复制存起来，命名 `联调记录.md` 放进 `E:\course-mall\deploy\`。

::: tip 💡 面试题：自我介绍时怎么讲项目？
**一句话**：**别按技术点罗列，按业务链路讲**——「这是一个课程电商系统，我从零做了后端：用户注册登录（JWT）→ 课程浏览（Redis 缓存、ES 搜索）→ 下单（事务、状态机）→ 支付（沙箱、幂等）→ 秒杀（Redis 预扣减 + MQ 削峰），中期把单体拆成了微服务（Nacos/Feign/Gateway/Sentinel），后期做了容器化部署和压测优化」。30 秒讲完主线，然后等面试官挑他感兴趣的点深挖——**他问哪个点，你就讲哪个点的文档**。
:::

### 步骤 2：写简历项目描述（STAR 法则）

面试官看简历项目只关心三件事：**你做了什么、遇到什么难点、解决了什么**。用 STAR（情境-任务-行动-结果）组织：

**① 项目简介（放在项目名下面，80~150 字）：**

> **课程商城 course-mall**：独立开发的微服务电商后端（课程售卖场景）。Spring Boot 3 + Spring Cloud Alibaba 全家桶，包含用户、课程、订单、支付、秒杀、搜索 6 大模块。核心亮点：Redis 预扣减 + RocketMQ 削峰支撑秒杀 QPS 3000+（JMeter 实测），Seata AT 解决下单扣库存的分布式事务一致性，Canal 同步 MySQL → Elasticsearch 实现课程搜索，Docker Compose 一键部署。Git 提交 100+ 次，30 天完成。

**② 个人职责（4 条，动词开头 + 技术名词 + 效果）：**

1. 设计 11 张表的数据库模型（DECIMAL 金额、逻辑删除、BIGINT 主键），用 MyBatis-Plus 完成 6 大模块 CRUD 与条件分页查询
2. 实现 JWT + Spring Security 无状态鉴权，双 token 刷新机制；验证码防刷（图形验证码 + 60s 限频）
3. 设计秒杀链路：Lua 脚本原子预扣减 + RocketMQ 异步下单削峰 + 分布式锁防超卖，压测验证 QPS 3000+
4. 主导性能优化：慢查询日志 + EXPLAIN 定位全表扫描，联合索引优化后列表接口 QPS 提升 9 倍（280→2600）

**③ 难点亮点（3 个，每个用「难点 → 方案 → 结果」一句话）：**

1. **秒杀超卖**：高并发下库存扣减竞态 → Redis Lua 原子扣减 + DB 唯一索引兜底 → 0 超卖，QPS 3000+
2. **分布式事务**：下单扣库存跨服务一致性 → Seata AT 模式 + 订单状态机兜底 → 异常回滚 100% 有效
3. **缓存一致性**：课程详情缓存与 DB 一致 → Cache Aside + 延迟双删 + 互斥锁防击穿 → 缓存命中率 95%+

::: tip 💡 面试题：简历上项目写「分布式」「高并发」这些词，面试官会怎么拷打你？
**一句话**：**你写的每个技术名词都是面试官的出题点**——写了 Seata 就会被问「AT 模式和 TCC 的区别、回滚原理」；写了 RocketMQ 就会被问「消息丢失、重复消费、顺序消息」。所以原则是：**写上去的必须是你能讲 3 分钟的**（原理 + 为什么 + 踩坑），讲不了的删掉或降级为「了解」。这也是为什么这 30 天的每篇文档末尾都有追问——那些就是面试官会问的。
:::

### 步骤 3：八股映射总表（项目 → 考点 → 复习链接）

把 30 天的功能映射成面试考点。**面试前三天，每天过一遍这张表**：

| 阶段 | 你做了什么 | 面试官会问什么（高频） | 复习链接 |
|---|---|---|---|
| 一·单体 | MyBatis-Plus 完成 CRUD/分页 | 分页插件原理？逻辑删除怎么实现的？为什么不用物理删除？ | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)、[MySQL](/learn_database/MySQL) |
| 一·单体 | JWT + Spring Security 登录鉴权 | JWT 三段结构？无状态鉴权怎么注销用户？JWT 和 Session 区别？ | [Spring Security](/learn_backend/java/基础/Spring Security) |
| 一·单体 | Redis 缓存课程详情 | 穿透/击穿/雪崩分别怎么解决？缓存和 DB 一致性？延迟双删？ | [Redis](/learn_database/Redis) |
| 一·单体 | 下单事务 + 状态机 | @Transactional 失效场景？事务隔离级别？状态机为什么用状态机？ | [Spring](/learn_backend/java/基础/Spring)、[MySQL](/learn_database/MySQL) |
| 一·单体 | 支付沙箱 + 回调幂等 | 重复回调怎么防？幂等的几层设计？为什么回调要验签？ | [MySQL](/learn_database/MySQL)、[Redis](/learn_database/Redis) |
| 二·微服务 | Nacos 注册 + 配置中心 | 注册中心原理？AP/CP 选型？配置动态刷新原理？ | [Nacos](/learn_backend/java/微服务/Nacos) |
| 二·微服务 | OpenFeign 远程调用 | Feign 原理（动态代理）？超时重试怎么配？为什么「只认服务名」？ | [OpenFeign](/learn_backend/java/微服务/OpenFeign) |
| 二·微服务 | Gateway 网关统一入口 | 网关作用？路由断言/过滤器？为什么网关用 WebFlux？ | [Gateway](/learn_backend/java/微服务/Gateway) |
| 二·微服务 | Sentinel 熔断限流 | blockHandler vs fallback？流控算法？Sentinel 和 Hystrix 区别？ | [Sentinel](/learn_backend/java/微服务/Sentinel) |
| 三·高并发 | 秒杀 Redis 预扣减 + Lua | 为什么用 Lua？分布式锁怎么保证不误删？超卖怎么兜底？ | [Redis](/learn_database/Redis)、[分布式基础](/learn_backend/java/微服务/分布式基础) |
| 三·高并发 | RocketMQ 削峰 + 幂等 | 消息丢失三端怎么保证？重复消费怎么解决？顺序消息？事务消息？ | [RocketMQ](/learn_backend/java/微服务/RocketMQ) |
| 三·高并发 | Seata 分布式事务 | AT 模式原理（undo_log）？和 TCC 区别？和 MQ 最终一致性对比？ | [Seata](/learn_backend/java/微服务/Seata) |
| 三·高并发 | 雪花 ID + ShardingSphere 分表 | 雪花 ID 结构？为什么分表？分表后跨表查询怎么办？ | [分库分表](/learn_database/分库分表) |
| 三·高并发 | ES 搜索 + Canal 同步 | 倒排索引原理？为什么 ES 快？Canal 同步原理？深分页怎么优化？ | [Elasticsearch](/learn_backend/java/微服务/Elasticsearch) |
| 四·部署 | Docker 容器化 + Compose | 镜像分层？容器和虚拟机区别？多阶段构建？ | [Docker](/learn_maintenance/Docker) |
| 四·部署 | Nginx 反代 + 负载均衡 | 正向/反向代理区别？负载均衡算法？Nginx 为什么高并发？ | [Nginx](/learn_backend/java/微服务/Nginx) |
| 四·部署 | JMeter 压测 + 慢 SQL 优化 | QPS/TPS 区别？P99 为什么重要？EXPLAIN 怎么看？索引失效场景？ | [MySQL](/learn_database/MySQL)、[并发编程](/learn_backend/java/Java核心/并发编程) |

### 步骤 4：模拟面试 30 题（按频率排序，先背这些）

面试官问项目时，80% 会落到下面这些问题。**每题都能在对应文档的「追问」和知识库文章里找到答案**：

**Java 基础 / 集合 / 并发（10 题）**
1. HashMap 底层结构？为什么线程不安全？和 ConcurrentHashMap 区别？→ [Java集合](/learn_backend/java/Java核心/Java集合)
2. JVM 内存区域？垃圾回收算法？CMS/G1 区别？→ [JVM](/learn_backend/java/Java核心/JVM)
3. synchronized 和 ReentrantLock 区别？锁升级过程？→ [并发编程](/learn_backend/java/Java核心/并发编程)
4. volatile 的作用？可见性和有序性怎么保证？→ [并发编程](/learn_backend/java/Java核心/并发编程)
5. 线程池 7 个参数？拒绝策略？为什么不用 Executors 默认的？→ [并发编程](/learn_backend/java/Java核心/并发编程)

**MySQL / Redis（10 题）**
6. 索引为什么用 B+ 树不用 B 树/哈希？→ [MySQL](/learn_database/MySQL)
7. 事务隔离级别？MVCC 原理？→ [MySQL](/learn_database/MySQL)
8. 一条 SQL 执行过程？慢 SQL 怎么定位？→ [MySQL](/learn_database/MySQL)
9. Redis 为什么快？持久化 RDB/AOF？→ [Redis](/learn_database/Redis)
10. Redis 缓存穿透/击穿/雪崩？→ [Redis](/learn_database/Redis)

**微服务 / 中间件（10 题）**
11. 微服务的优缺点？什么时候该拆？→ [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)
12. 注册中心的原理？Nacos 的 AP/CP？→ [Nacos](/learn_backend/java/微服务/Nacos)
13. 服务雪崩？熔断/限流/降级的区别？→ [Sentinel](/learn_backend/java/微服务/Sentinel)
14. MQ 消息不丢失/不重复？→ [RocketMQ](/learn_backend/java/微服务/RocketMQ)
15. 分布式事务的几种方案？→ [Seata](/learn_backend/java/微服务/Seata)

::: tip 💡 面试题：八股怎么背效率最高？
**一句话**：**不要背孤立知识点，背「项目场景 + 知识点」的组合**——比如别只背「缓存击穿」，而是背「我的课程详情接口用了互斥锁 + double-check 解决击穿，因为秒杀时热点课程会被瞬间打爆，原理是……」。面试官听到的是「你真做过」，而不是「你背过」。这正是「项目驱动面试冲刺」的意义。
:::

### 步骤 5：项目收尾（面试官会看你的仓库）

```bash
cd /e/course-mall
# 1. README：项目简介 + 技术栈 + 模块架构图（文字版）+ 启动方式 + 接口清单
#    面试官打开仓库第一眼就是 README，要让人 3 分钟看懂你做了什么

# 2. 检查 git 状态：确认没有敏感信息（数据库密码、支付密钥）
git status
# 常见的坑：application.yml 里的真实密码提交上去了 → 改成环境变量占位符
# 密码改 ${MYSQL_PASSWORD:123456} 这种占位写法

# 3. 提交规范：30 天的提交记录本身就是「工作习惯」的证明
#    好的 message 长这样：feat(order): 下单事务 + 状态机 + 库存扣减
git log --oneline   # 看看你的提交历史，有没有「fix bug」「update」这种无效信息，重写不现实但下次注意
```

## 四、知识点索引

| 今天用到/会问到 | 去哪复习 |
|---|---|
| 全部项目考点对照表 | 见步骤 3 的映射总表（每行都有链接） |
| 面试高频 30 题 | 见步骤 4（每题都有链接） |
| Java 核心面试总复习 | [Java集合](/learn_backend/java/Java核心/Java集合)、[JVM](/learn_backend/java/Java核心/JVM)、[并发编程](/learn_backend/java/Java核心/并发编程) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 端到端联调 10 步全部跑通，输出 `联调记录.md`：是 / 否
- [ ] 简历项目描述写好（简介 100 字 + 职责 4 条 + 亮点 3 个）：是 / 否
- [ ] 八股映射总表过了一遍，每行都能说出来「我做了什么」：是 / 否
- [ ] 模拟 30 题里自测，每题能答 1 分钟以上：`____/30` 题
- [ ] 项目 README 写好了，git 提交记录干净：是 / 否
- [ ] 踩坑记录（联调中发现的问题，如服务没注册、token 过期等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 联调时你遇到的最难缠的一个问题是什么？怎么定位的？（这题面试必问，现在就准备一个真实的、有排查过程的答案）
2. 你的项目简介里写了「QPS 3000+」，面试官问「这个数字怎么来的？机器什么配置？」——你答得上来吗？（提示：Day29 的压测报告就是证据）
3. 如果面试官说「你的系统现在要扛双十一 10 倍流量，你打算怎么改造？」——你的答案按什么顺序说？（提示：从入口到出口：Nginx→网关→限流→缓存→MQ→DB→扩容，对照 30 天的架构演进）
4. 你的项目哪里体现了「团队协作」？如果面试官问「你这个项目有什么是别人做的」，你怎么回答？（提示：独立开发没问题，但要讲清楚「需求怎么拆、版本怎么管理」）
5. 项目里哪个技术点你「踩坑最深、印象最深」？能不能 3 分钟讲完？（提示：选一个你真正 debug 过的，比如 Nacos 9848 端口没映射导致注册失败、Docker 时区差 8 小时、jjwt 密钥长度不足……）

---

> 🎉 **30 天结束**。接下来进入第二个项目：**qa-agent（Python AI Agent）**——智能问答 Agent，RAG + Function Calling + LangGraph + MCP。它的路线同样在 [路线总览](/learn_project/00-路线总览)，知识库已在 `learn_ai/agent/` 备好。
