# RocketMQ

> 一句话定位：RocketMQ 是阿里巴巴开源的高吞吐、低延迟、高可靠的分布式消息中间件，用于在微服务之间实现**异步解耦、削峰填谷、最终一致性传输**，是国产业务（电商、金融、物流）最主流、也是面试里对「消息队列」考察最细的 MQ。

RocketMQ 脱胎于阿里双十一的实战场景，经历了淘宝消息中间件 Notify、MetaQ 的演进，最终在 2016 年捐献给 Apache 基金会并成为顶级项目。它的设计目标非常明确：**用极低的延迟（毫秒级）支撑海量消息（单机百万级 TPS）的高可靠传输**，同时提供 Kafka 没有的「事务消息、延迟消息、顺序消息」等业务级能力。

---

## 基础篇

### 为什么需要消息队列

先看没有 MQ 的世界。假设一个下单接口，下单成功后要「扣库存、发短信、加积分、写日志」，如果都用同步调用：

```
用户 -> 下单服务 -> 扣库存(库存服务)
                -> 发短信(短信服务)
                -> 加积分(积分服务)
                -> 写日志(日志服务)
                全部完成才返回给用户
```

同步调用带来三个致命问题：

1. **耦合严重**：下单服务必须知道每个下游服务的地址和接口，任何一个下游挂了，下单就失败。
2. **削峰困难**：双十一瞬间几十万 QPS 打过来，库存服务、短信服务直接被压垮。
3. **响应慢**：下单要等所有下游处理完才能返回，链路耗时累加，用户体验差。

引入 MQ 后，架构变成「**异步 + 缓冲**」：

```
用户 -> 下单服务 -> 发消息到 MQ -> 立即返回「下单成功」
                                    ↓
                  MQ(Broker) 缓冲
                                    ↓
              库存消费者 / 短信消费者 / 积分消费者 各自异步拉取消费
```

| 场景 | 不用 MQ | 用 MQ |
|------|---------|-------|
| 下单后发短信/邮件 | 同步调用，下单接口变慢 | 异步通知，下单秒回 |
| 秒杀库存扣减 | 流量直击 DB，可能压垮 | MQ 缓冲，匀速消费 |
| 订单/库存/积分一致性 | 强耦合，一处挂全部挂 | 最终一致性解耦 |
| 日志收集 | 日志服务被拖垮 | 日志异步落盘，不阻塞业务 |
| 数据同步（如 ES 索引） | 同步写入，性能差 | 异步同步，最终一致 |

**MQ 的三大核心价值，一句话记：解耦、异步、削峰。**

::: tip 💡 面试题：为什么要用 MQ，不用行不行？
结论：行，但会牺牲解耦、异步、削峰三大能力。原因：MQ 本质是用「异步 + 缓冲」换「解耦 + 削峰」，代价是引入了**系统复杂度**（一致性、可用性、重复消费、消息丢失都要自己处理）。所以小流量、强一致场景不一定需要 MQ，引入前要评估收益是否大于代价。
:::

### MQ 选型对比

市场上主流 MQ 有 ActiveMQ、RabbitMQ、RocketMQ、Kafka、Pulsar，各有侧重：

| 维度 | ActiveMQ | RabbitMQ | RocketMQ | Kafka |
|------|----------|----------|----------|-------|
| 开发语言 | Java | Erlang | Java | Scala/Java |
| 单机吞吐 | 万级 | 万级 | **十万级~百万级** | **百万级** |
| 时效性 | ms 级 | us 级 | **ms 级** | ms 级 |
| 可用性 | 高（主从） | 高（主从） | **非常高（主从 + 分布式架构）** | 非常高（分布式） |
| 功能完备性 | 一般 | 一般 | **很全（事务、延迟、顺序、重试）** | 全（但事务消息较弱） |
| 社区活跃 | 低 | 高 | **中高（阿里主导）** | 高 |
| 消息丢失 | 低概率 | 低概率 | **理论上不丢（同步刷盘）** | 低概率 |
| 适用场景 | 老项目 | 中小型项目、路由灵活 | **业务消息、金融、电商** | **大数据、日志采集** |

**结论性的选择建议：**

- **大数据 / 日志采集 / 流式计算**：选 Kafka，吞吐最高，生态与 Flink/Spark 结合最好。
- **业务消息（订单、支付、事务、延迟、顺序）**：选 RocketMQ，功能最全，可靠性强。
- **中小项目、路由需求复杂（交换机/路由键）**：选 RabbitMQ，轻量简单、延迟极低。
- **ActiveMQ**：基本已被淘汰，历史遗留项目才用。

::: tip 💡 面试题：RocketMQ 和 Kafka 的区别？
结论：Kafka 主打高吞吐（日志/大数据），RocketMQ 主打高可靠 + 业务功能（事务/延迟/顺序消息）。原因：两者定位不同，Kafka 为了吞吐用「分区 + 顺序写」，但事务消息和延迟消息能力弱；RocketMQ 在保证吞吐的同时，额外实现了半消息、延迟级别、消息重试等业务特性，更适合电商金融场景。
:::

### RocketMQ 的发展与定位

了解历史有助于理解它「为什么长这样」：

- **2011 年前后**：阿里内部用 Notify、MetaQ 解决淘宝消息传输，是 RocketMQ 的前身。
- **2012 年**：MetaQ 3.0 发布，正式更名 RocketMQ，支持分布式、顺序消息、事务消息。
- **2016 年**：阿里将 RocketMQ 捐献给 Apache，2017 年成为 Apache 顶级项目（TLP）。
- **2019 年之后**：推出 4.x 稳定版，2021 年发布 5.x，引入 **gRPC 协议、Proxy 组件、自动故障转移**。

RocketMQ 5.x 相比 4.x 的主要变化：

| 能力 | 4.x | 5.x |
|------|-----|-----|
| 通信协议 | Remoting（私有协议） | gRPC（标准协议）+ 兼容 Remoting |
| 客户端 | Java 客户端直连 | 引入 **Proxy 代理层**，多语言客户端统一接入 |
| 主从切换 | 手动/依赖 Dledger | 自动故障转移（Controller 模式） |
| 消息类型 | 普通/顺序/延迟/事务 | 新增定时消息、事务消息增强 |

> 说明：本文以 **4.x 的经典存储模型 + 5.x 的部署演进**为主线，因为 4.x 的 CommitLog + ConsumeQueue 存储结构是面试考察的核心，5.x 在此之上增加了 Proxy 和 Controller，底层存储思想不变。

### 核心概念全景

RocketMQ 有 9 个必须掌握的核心概念，先建立整体印象：

| 概念 | 英文 | 一句话解释 | 类比 |
|------|------|-----------|------|
| Producer | 生产者 | 发消息的一方 | 寄件人 |
| Consumer | 消费者 | 收消息的一方 | 收件人 |
| Broker | 消息服务器 | 存储和转发消息，MQ 的心脏 | 快递中转站 |
| NameServer | 注册中心 | 记录 Broker 和 Topic 的路由信息 | 快递网点黄页 |
| Topic | 主题 | 一类消息的逻辑分类 | 快递单上的「品类」 |
| Tag | 标签 | Topic 下的二级分类 | 品类下的「子类」 |
| Message Queue | 消息队列 | Topic 的物理分区，默认 4 个 | 中转站的分拣线 |
| Group | 组 | 生产者组 / 消费者组 | 一组寄件人 / 一组收件人 |
| Message | 消息 | 传输的数据体 | 包裹本身 |

逐个展开：

**1. Producer（生产者）**：发送消息的一方。生产者在发送前会先从 NameServer 拉取路由，然后**直连 Broker** 发送。生产者可以指定消息发送到哪个 Topic、哪个 Queue。

**2. Consumer（消费者）**：消费消息的一方。RocketMQ 有两种消费者：
- **PushConsumer（推模式，实际是封装了拉的长轮询）**：Broker 有新消息主动推给消费者，编程简单，最常用。
- **PullConsumer（拉模式）**：消费者自己主动拉取，灵活但麻烦。

**3. Broker（消息服务器）**：RocketMQ 的核心，负责消息的**存储、投递、查询、保证高可用**。一台 Broker 是一台物理机/容器，Broker 可以有 Master 和 Slave 之分。

**4. NameServer（注册中心）**：
- **无状态**：NameServer 之间互相不通信、不选举，每个都是独立的。
- **职责单一**：只维护「Topic → Broker/Queue」的路由映射，不存消息。
- **为什么不用 ZooKeeper**：ZooKeeper 是强一致（CP），有选举和主从，部署运维复杂；NameServer 无状态、轻量，挂了也不影响已建立的连接，更符合 MQ「高可用 + 简单」的诉求。

**5. Topic（主题）**：消息的逻辑分类，如 `order-topic`、`pay-topic`。生产者和消费者通过 Topic 对接。

**6. Tag（标签）**：Topic 的二级分类。一个 Topic 下可以有多个 Tag，如 `order-topic` 下有 `order-paid`、`order-shipped`。消费者可以按 Tag 过滤，避免订阅不需要的消息。

**7. Message Queue（消息队列）**：
- 一个 Topic 会被拆分成**多个队列**（默认 4 个），分布在不同 Broker 上。
- **队列是「并行度」和「顺序」的物理载体**：队列越多，可并行消费的粒度越细；同时队列内的消息是有序的。
- 一条消息会被写到**某个具体的队列**里。

**8. Group（组）**：
- **生产者组**：一组生产同一类消息的生产者，用于事务消息回查定位。
- **消费者组**：一组共同消费同一 Topic 的消费者，组内实现**负载均衡**——一条消息只被组内一个消费者消费。

**9. Message（消息）**：传输的数据体，包含 body（业务数据）、Topic、Tag、Key、属性等。

### 消息模型：Topic → Queue → Message

RocketMQ 的消息模型是三层结构，理解它才能理解后续的顺序、负载均衡：

```
                         Topic: order-topic
                     ┌──────────────┴──────────────┐
               Queue 0 (Broker-a)          Queue 1 (Broker-a)
               [m1][m2][m3]...             [m1][m2][m3]...
                     │                           │
               Queue 2 (Broker-b)          Queue 3 (Broker-b)
               [m1][m2][m3]...             [m1][m2][m3]...
```

关键规则：
- 一条消息只会落到**一个 Queue** 里。
- **同一个 Queue 内的消息是有序的**（先进先出）。
- 不同 Queue 之间的消息**没有顺序保证**。
- 生产者的**负载均衡** = 决定消息发到哪个 Queue（默认轮询）。
- 消费者的**负载均衡** = 决定哪个消费者消费哪个 Queue（Rebalance）。

### 部署架构

RocketMQ 经典部署由三部分组成，先看整体拓扑：

```
                      NameServer 集群（无状态，互不通信）
                    ┌─────────────────────────────────┐
                    │  NS1          NS2          NS3  │
                    └───▲───────────────▲─────────────┘
                        │ 路由注册/发现  │
        ┌───────────────┘               └───────────────┐
        │                                               │
   Producer                                      Consumer
        │                                               │
        └─────────── 直连（拉完路由后本地缓存） ──────────┘
                        │               ▲
                        ▼               │
              ┌─────────────────────────────────────┐
              │            Broker 集群               │
              │  Broker-Master ──── 同步/异步 ──→ Broker-Slave │
              │  (存储消息，接受读写)      (备份，主挂后可读) │
              └─────────────────────────────────────┘
```

部署要点：

1. **NameServer 集群**：部署 3 台即可（无状态，可水平扩），Broker/Producer/Consumer 都要配所有 NameServer 地址。
2. **Broker 主从**：Master 处理读写，Slave 同步备份。主挂后 Slave 可提升（4.x 手动/Dledger，5.x 自动）。
3. **路由发现**：Producer/Consumer 启动时从 NameServer 拉取路由，之后**本地缓存**，再**直连 Broker** 收发消息，不经过 NameServer。

::: tip 💡 面试题：NameServer 挂了会影响消息收发吗？
结论：不影响已经建立连接的收发，只影响新连接建立和路由变更感知。原因：Producer/Consumer 拿到路由后是本地缓存 + 直连 Broker 的，NameServer 只是「黄页」，查完地址就不需要了。这是 NameServer 无状态设计最大的好处——不引入 ZooKeeper 那种单点/选举复杂度，可用性更高。
:::

### 消息类型总览

RocketMQ 支持 6 大类消息，先看总表，高级篇逐个详解：

| 消息类型 | 一句话说明 | 典型场景 |
|----------|-----------|---------|
| 普通消息 | 最常用，支持同步/异步/单向发送 | 绝大多数业务 |
| 顺序消息 | 保证同一队列内消息按发送顺序被消费 | 订单状态流转、binlog |
| 延迟消息 | 投递后过指定时间才可被消费 | 超时关单、延迟通知 |
| 事务消息 | 保证「本地事务 + 发消息」最终一致 | 下单扣库存、转账 |
| 批量消息 | 一次发送多条消息 | 批量入库、日志 |
| 过滤消息 | 按 Tag 或 SQL 条件过滤消费 | 订阅部分消息 |

### 消费模式（集群 / 广播）

消费者有两种消费模式，这是高频考点：

**1. 集群模式（默认，CLUSTERING）**：
- 同一消费者组内的消费者**均分**消息，一条消息只被组内**一个**消费者消费。
- 用于「一条消息处理一次」的负载均衡场景。

**2. 广播模式（BROADCASTING）**：
- 组内**每个**消费者都收到全量消息，各自独立消费。
- 用于「每个实例都要处理」的场景，如刷新本地缓存、通知所有节点。

```java
// 设置消费模式
DefaultMQPushConsumer consumer = new DefaultMQPushConsumer("group_name");
consumer.setMessageModel(MessageModel.CLUSTERING);    // 集群模式（默认）
consumer.setMessageModel(MessageModel.BROADCASTING);  // 广播模式
```

| 维度 | 集群模式 | 广播模式 |
|------|---------|---------|
| 消息消费次数 | 组内只消费一次 | 组内每台都消费一次 |
| 消费进度存储 | Broker 端（组共享进度） | 消费者本地（各自维护） |
| 典型场景 | 订单处理、削峰 | 刷新缓存、全量通知 |
| 消息重投 | 支持 | 不支持（不重试） |

### 三种发送方式（同步 / 异步 / 单向）

生产者发送消息有三种方式，各有取舍：

| 发送方式 | 方法 | 是否等结果 | 可靠性 | 吞吐 | 场景 |
|---------|------|-----------|--------|------|------|
| 同步发送 | `send()` | 阻塞等返回 | 高 | 低 | 重要消息，需要确认结果 |
| 异步发送 | `send(callback)` | 不阻塞，回调通知 | 中 | 中 | 对时延敏感、可容忍短暂不一致 |
| 单向发送 | `sendOneway()` | 完全不等 | 低 | **最高** | 日志等不重要的消息 |

下面给一个完整可运行的同步发送示例（含完整 Maven 依赖）：

```xml
<!-- pom.xml 依赖 -->
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-client</artifactId>
    <version>4.9.8</version>
</dependency>
```

```java
import org.apache.rocketmq.client.producer.DefaultMQProducer;
import org.apache.rocketmq.client.producer.SendCallback;
import org.apache.rocketmq.client.producer.SendResult;
import org.apache.rocketmq.common.message.Message;

public class ProducerDemo {

    public static void main(String[] args) throws Exception {
        // 1. 创建生产者，指定生产者组
        DefaultMQProducer producer = new DefaultMQProducer("order-producer-group");
        // 2. 指定 NameServer 地址（多个用分号分隔）
        producer.setNamesrvAddr("127.0.0.1:9876");
        // 3. 启动生产者
        producer.start();

        String body = "订单已创建，订单号：1001";
        Message msg = new Message(
                "order-topic",   // Topic
                "order-paid",    // Tag
                "1001",          // Key：业务唯一键，用于定位消息和幂等
                body.getBytes()  // 消息体
        );

        // 同步发送：阻塞等待 Broker 返回结果，最可靠
        SendResult result = producer.send(msg);
        System.out.println("同步发送结果：" + result.getSendStatus()); // SEND_OK

        // 异步发送：不阻塞，通过回调接收结果
        producer.send(msg, new SendCallback() {
            @Override
            public void onSuccess(SendResult sendResult) {
                System.out.println("异步发送成功：" + sendResult.getMsgId());
            }
            @Override
            public void onException(Throwable e) {
                System.out.println("异步发送失败，需补偿：" + e.getMessage());
            }
        });

        // 单向发送：发完就走，不关心结果，吞吐最高，适合日志
        producer.sendOneway(msg);

        // 4. 关闭生产者（生产环境用 try/finally 或 JVM 钩子）
        producer.shutdown();
    }
}
```

> 为什么同步发送最可靠：因为 `send()` 会阻塞等待 Broker 的 `SEND_OK` 确认，只有 Broker 落盘（或写入内存）成功才返回；而 `sendOneway()` 连 Broker 收没收到都不知道，所以只能用于丢得起消息的场景。

对应消费者示例：

```java
import org.apache.rocketmq.client.consumer.DefaultMQPushConsumer;
import org.apache.rocketmq.client.consumer.listener.ConsumeConcurrentlyContext;
import org.apache.rocketmq.client.consumer.listener.ConsumeConcurrentlyStatus;
import org.apache.rocketmq.client.consumer.listener.MessageListenerConcurrently;
import org.apache.rocketmq.common.message.MessageExt;
import java.util.List;

public class ConsumerDemo {

    public static void main(String[] args) throws Exception {
        // 1. 创建消费者，指定消费者组（同组消费者负载均衡）
        DefaultMQPushConsumer consumer = new DefaultMQPushConsumer("order-consumer-group");
        // 2. 指定 NameServer
        consumer.setNamesrvAddr("127.0.0.1:9876");
        // 3. 订阅 Topic，* 表示订阅所有 Tag
        consumer.subscribe("order-topic", "*");
        // 4. 注册消息监听器（并发消费）
        consumer.registerMessageListener(new MessageListenerConcurrently() {
            @Override
            public ConsumeConcurrentlyStatus consumeMessage(
                    List<MessageExt> msgs, ConsumeConcurrentlyContext context) {
                for (MessageExt msg : msgs) {
                    // 拿到业务数据，执行业务逻辑
                    System.out.println("消费到消息：" + new String(msg.getBody()));
                }
                // 返回消费成功，Broker 才会推进消费进度
                return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
            }
        });
        // 5. 启动消费者
        consumer.start();
        System.out.println("消费者已启动");
    }
}
```

### 快速上手：Spring Boot 集成 RocketMQ

生产环境几乎都用 Spring Boot，官方提供了 starter：

```xml
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>2.2.3</version>
</dependency>
```

```yaml
# application.yml
rocketmq:
  name-server: 127.0.0.1:9876   # NameServer 地址
  producer:
    group: order-producer-group  # 生产者组
    send-message-timeout: 3000   # 发送超时
    retry-times-when-send-failed: 3  # 发送失败重试次数
```

```java
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class OrderService {

    @Autowired
    private RocketMQTemplate rocketMQTemplate;

    public void createOrder(Long orderId) {
        // 同步发送，destination 格式：topic:tag
        rocketMQTemplate.syncSend("order-topic:order-paid", "订单" + orderId + "已支付");
    }

    public void sendAsync(Long orderId) {
        // 异步发送
        rocketMQTemplate.asyncSend("order-topic:order-paid", "异步消息" + orderId, null);
    }

    public void sendDelay(Long orderId) {
        // 发送延迟消息：delayLevel 3 = 10 秒
        rocketMQTemplate.syncSend("order-topic:order-paid",
                org.apache.rocketmq.spring.support.RocketMQHeaders.SEND_STATUS,
                "延迟消息" + orderId,
                3000 /* 超时 */, 3 /* 延迟级别 */);
    }
}
```

```java
import org.apache.rocketmq.spring.annotation.RocketMQMessageListener;
import org.apache.rocketmq.spring.core.RocketMQListener;
import org.springframework.stereotype.Component;

@Component
// topic 订阅的主题，consumerGroup 消费者组
@RocketMQMessageListener(topic = "order-topic",
        consumerGroup = "order-consumer-group",
        selectorExpression = "order-paid")  // 只订阅 order-paid 这个 Tag
public class OrderPaidListener implements RocketMQListener<String> {
    @Override
    public void onMessage(String message) {
        // 处理业务逻辑
        System.out.println("收到支付消息：" + message);
    }
}
```

### 生产者核心参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `namesrvAddr` | - | NameServer 地址，多个用分号分隔 |
| `producerGroup` | - | 生产者组，事务消息回查依赖它 |
| `sendMsgTimeout` | 3000ms | 发送超时时间 |
| `retryTimesWhenSendFailed` | 2 | 同步发送失败重试次数 |
| `retryTimesWhenSendAsyncFailed` | 2 | 异步发送失败重试次数 |
| `compressMsgBodyOverHowmuch` | 4096 字节 | 消息体超过该大小自动压缩 |
| `maxMessageSize` | 4MB | 消息最大大小（默认 4M，可调大） |
| `retryAnotherBrokerWhenNotStoreOK` | false | 发送失败是否换 Broker 重试 |

### 消费者核心参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `consumerGroup` | - | 消费者组 |
| `consumeFromWhere` | CONSUME_FROM_LAST_OFFSET | 启动消费位置（末尾/开头/时间点） |
| `consumeThreadMin` / `consumeThreadMax` | 20 / 64 | 消费线程数范围 |
| `pullBatchSize` | 32 | 每次拉取的最大消息数 |
| `consumeMessageBatchMaxSize` | 1 | 每次回调处理的消息数 |
| `messageModel` | CLUSTERING | 消费模式（集群/广播） |
| `consumeTimeout` | 15min | 消费超时时间 |

---

## 高级篇

### 顺序消息：怎么保证顺序

**背景**：很多业务要求消息按顺序处理，比如「创建订单 → 支付 → 发货 → 完成」，如果消息乱序，可能出现「先发货后支付」的脏数据。

**核心思想**：**把需要有序的消息发到同一个队列，一个队列只被一个消费者串行消费。**

- 因为 RocketMQ 只保证**单个 Queue 内有序**，所以只要让同一业务的消息都进同一个 Queue，且这个 Queue 只被一个消费者线程串行处理，顺序就保证了。
- 代价是**牺牲并行度**：一个 Queue 串行消费，吞吐下降，所以只对真正需要有序的业务使用。

**全局顺序** = 只用 1 个队列；**局部顺序** = 同一业务键进同一队列（更常用）。

```java
import org.apache.rocketmq.client.producer.DefaultMQProducer;
import org.apache.rocketmq.client.producer.MessageQueueSelector;
import org.apache.rocketmq.client.producer.SendResult;
import org.apache.rocketmq.common.message.Message;
import org.apache.rocketmq.common.message.MessageQueue;
import java.util.List;

public class OrderlyProducer {

    public static void main(String[] args) throws Exception {
        DefaultMQProducer producer = new DefaultMQProducer("orderly-producer-group");
        producer.setNamesrvAddr("127.0.0.1:9876");
        producer.start();

        for (long orderId = 0; orderId < 100; orderId++) {
            Message msg = new Message("order-topic", "order-paid",
                    String.valueOf(orderId), ("订单" + orderId).getBytes());

            // 关键：用 MessageQueueSelector 按业务键路由到固定队列
            SendResult result = producer.send(msg, new MessageQueueSelector() {
                @Override
                public MessageQueue select(List<MessageQueue> mqs, Message msg, Object arg) {
                    Long orderId = (Long) arg;
                    // 为什么取模：让同一个 orderId 永远落在同一个队列，保证有序
                    int index = (int) (orderId % mqs.size());
                    return mqs.get(index);
                }
            }, orderId);

            System.out.println("发送到队列：" + result.getMessageQueue());
        }
        producer.shutdown();
    }
}
```

消费者端要用**顺序消费监听器**，并保证「一个队列同时只有一个线程在消费」：

```java
import org.apache.rocketmq.client.consumer.DefaultMQPushConsumer;
import org.apache.rocketmq.client.consumer.listener.ConsumeOrderlyContext;
import org.apache.rocketmq.client.consumer.listener.ConsumeOrderlyStatus;
import org.apache.rocketmq.client.consumer.listener.MessageListenerOrderly;
import org.apache.rocketmq.common.message.MessageExt;
import java.util.List;

public class OrderlyConsumer {

    public static void main(String[] args) throws Exception {
        DefaultMQPushConsumer consumer = new DefaultMQPushConsumer("orderly-consumer-group");
        consumer.setNamesrvAddr("127.0.0.1:9876");
        consumer.subscribe("order-topic", "*");

        // 顺序消费监听器：保证同一队列的消息串行处理
        consumer.registerMessageListener(new MessageListenerOrderly() {
            @Override
            public ConsumeOrderlyStatus consumeMessage(
                    List<MessageExt> msgs, ConsumeOrderlyContext context) {
                for (MessageExt msg : msgs) {
                    System.out.println("顺序消费：" + new String(msg.getBody()));
                }
                return ConsumeOrderlyStatus.SUCCESS;
            }
        });
        consumer.start();
    }
}
```

> 为什么顺序消费要加锁：顺序消费内部会对**队列加锁**，保证同一队列的消息同一时刻只被一个消费者线程处理；如果消费失败，会阻塞重试（不会跳过），从而严格保序。

::: tip 💡 面试题：RocketMQ 怎么保证消息顺序？
结论：生产端用 MessageQueueSelector 把同一业务键路由到同一队列，消费端用 MessageListenerOrderly 对该队列串行消费。原因：RocketMQ 只保证单队列有序，所以顺序的本质是「收敛到单队列 + 单消费者串行」。注意这是**局部顺序**，全局顺序要用单队列，吞吐会大幅下降。
:::

### 延迟消息

**背景**：很多场景需要「过一段时间再处理」，比如下单 30 分钟未支付自动关单、预约提醒。

RocketMQ 的延迟消息**不支持任意时间精度**，而是内置了 **18 个延迟级别**：

| 级别 | 延迟时间 | 级别 | 延迟时间 |
|------|---------|------|---------|
| 1 | 1s | 10 | 6m |
| 2 | 5s | 11 | 7m |
| 3 | 10s | 12 | 8m |
| 4 | 30s | 13 | 9m |
| 5 | 1m | 14 | 10m |
| 6 | 2m | 15 | 20m |
| 7 | 3m | 16 | 30m |
| 8 | 4m | 17 | 1h |
| 9 | 5m | 18 | 2h |

```java
Message msg = new Message("order-topic", "order-timeout",
        orderId, "订单超时未支付".getBytes());
msg.setDelayTimeLevel(16); // 16 对应 30 分钟，超时关单
producer.send(msg);
```

Spring Boot 版：

```java
// RocketMQTemplate 发送延迟消息：第 4 个参数是延迟级别
rocketMQTemplate.syncSend("order-topic:order-timeout",
        "订单超时", 3000, 16); // 16 = 30 分钟
```

::: tip 💡 面试题：延迟消息的实现原理？
结论：Broker 把延迟消息先存到内部主题 `SCHEDULE_TOPIC_XXXX`，由定时任务扫描到期后再投递到目标 Topic。原因：延迟消息不能直接投递，否则消费者会立刻收到；先「暂存 + 定时扫描」是通用的延迟队列实现方式。代价是只能选内置的 18 个级别，做不到任意精度。
:::

### 事务消息（半消息）

**背景**：这是 RocketMQ 区别于 Kafka 的核心能力。问题在于「本地事务」和「发消息」无法天然原子——可能出现「本地事务提交了但消息没发出去」或「消息发出去了但本地事务回滚了」。

RocketMQ 用**半消息（Half Message）+ 回查（Check）**解决：

```
        Producer                          Broker                     Consumer
           │                                │                            │
           │ 1.发送半消息(事务消息)          │                            │
           │───────────────────────────────>│ 暂存，不投递给消费者        │
           │                                │                            │
           │ 2.执行本地事务                  │                            │
           │   (扣库存/写订单)               │                            │
           │                                │                            │
           │ 3a.本地事务成功 -> 提交半消息     │                            │
           │───────────────────────────────>│ 半消息转正，投递给消费者────>│
           │                                │                            │
           │ 3b.本地事务失败 -> 回滚半消息     │                            │
           │───────────────────────────────>│ 删除半消息，不投递          │
           │                                │                            │
           │                                │ 4.若长时间未收到提交/回滚    │
           │<────────────── 回查(check) ─────│ 回调生产者确认本地事务状态    │
           │                                │                            │
```

完整 Java 示例：

```java
import org.apache.rocketmq.client.producer.LocalTransactionState;
import org.apache.rocketmq.client.producer.TransactionListener;
import org.apache.rocketmq.client.producer.TransactionMQProducer;
import org.apache.rocketmq.client.producer.TransactionSendResult;
import org.apache.rocketmq.common.message.Message;
import org.apache.rocketmq.common.message.MessageExt;

public class TransactionProducer {

    public static void main(String[] args) throws Exception {
        TransactionMQProducer producer = new TransactionMQProducer("tx-producer-group");
        producer.setNamesrvAddr("127.0.0.1:9876");

        // 设置事务监听器：本地事务逻辑 + 回查逻辑
        producer.setTransactionListener(new TransactionListener() {

            @Override
            public LocalTransactionState executeLocalTransaction(Message msg, Object arg) {
                // 执行本地事务（如扣库存、写订单）
                try {
                    // ... 本地事务代码，如 orderService.createOrder()
                    System.out.println("本地事务执行成功");
                    return LocalTransactionState.COMMIT_MESSAGE;   // 提交半消息
                } catch (Exception e) {
                    return LocalTransactionState.ROLLBACK_MESSAGE;  // 回滚半消息
                }
            }

            @Override
            public LocalTransactionState checkLocalTransaction(MessageExt msg) {
                // Broker 回查：根据业务键查本地事务最终状态
                String orderId = msg.getKeys();
                // boolean done = orderService.isOrderCreated(orderId);
                boolean done = true;
                return done ? LocalTransactionState.COMMIT_MESSAGE
                            : LocalTransactionState.ROLLBACK_MESSAGE;
            }
        });

        producer.start();

        Message msg = new Message("order-topic", "order-paid",
                "1001", "订单已支付".getBytes());
        // 发送事务消息：先发半消息
        TransactionSendResult result = producer.sendMessageInTransaction(msg, null);
        System.out.println("事务消息状态：" + result.getLocalTransactionState());
    }
}
```

::: tip 💡 面试题：为什么需要半消息？
结论：因为「本地事务」和「消息投递」无法天然原子，半消息先占位不投递，等本地事务结果，再用回查兜底，实现最终一致。原因：如果先发消息再执行本地事务，事务回滚了消息却已经投递；如果先执行事务再发消息，消息可能发不出去。半消息让消息「先不落地」，把决定权交给本地事务结果。
:::

### 消息过滤（Tag / SQL92）

**背景**：一个 Topic 下可能有多种业务消息，消费者只关心其中一部分。RocketMQ 支持两种过滤：

**1. Tag 过滤（推荐，性能好）**：

```java
// 消费者只订阅 order-paid 这个 Tag
consumer.subscribe("order-topic", "order-paid");
// 订阅多个 Tag，用 || 分隔
consumer.subscribe("order-topic", "order-paid||order-cancel");
```

**2. SQL92 过滤（更灵活，但需 Broker 开启）**：

```yaml
# broker.conf 开启 SQL 过滤
enablePropertyFilter=true
```

```java
// 按消息属性过滤，例如只消费价格大于 100 的消息
consumer.subscribe("order-topic",
        MessageSelector.bySql("price > 100 and user = 'vip'"));
```

发送时设置属性：

```java
Message msg = new Message("order-topic", "order-paid", body);
msg.putUserProperty("price", "200");
msg.putUserProperty("user", "vip");
```

| 过滤方式 | 优点 | 缺点 | 适用 |
|---------|------|------|------|
| Tag 过滤 | 性能好，Broker 端 hash 匹配 | 只能按 Tag 一个维度 | 大多数场景 |
| SQL 过滤 | 支持多属性组合条件 | 性能略差，需开启配置 | 复杂过滤条件 |

### 批量消息

**背景**：单条发送有网络开销，批量发送能显著提升吞吐，适合日志、批量导入场景。

```java
List<Message> messages = new ArrayList<>();
for (int i = 0; i < 10; i++) {
    messages.add(new Message("batch-topic", "tag", ("消息" + i).getBytes()));
}
// 批量发送
producer.send(messages);
```

**注意**：批量消息**必须是同一个 Topic**，且总大小不能超过限制（默认 4MB，可通过 `maxMessageSize` 调整）。若批次过大，需要自己分批发送。

### 消息重试与死信队列

**背景**：消费者处理消息可能失败（如临时性 DB 抖动），RocketMQ 会自动重试，避免消息丢失。但无限重试又会阻塞队列，所以有上限。

**重试机制**：
- 消费失败时返回 `RECONSUME_LATER`，消息进入重试队列 `%RETRY%消费者组`。
- 重试间隔**按延迟级别递增**：10s → 30s → 1m → 2m → 3m → ... → 10m → 20m → 30m → 1h → 2h。
- 默认最大重试 **16 次**。

```java
consumer.registerMessageListener(new MessageListenerConcurrently() {
    @Override
    public ConsumeConcurrentlyStatus consumeMessage(
            List<MessageExt> msgs, ConsumeConcurrentlyContext context) {
        try {
            // 执行业务逻辑
            processOrder(msgs);
            return ConsumeConcurrentlyStatus.CONSUME_SUCCESS; // 成功，推进进度
        } catch (Exception e) {
            // 失败返回 RECONSUME_LATER，让 MQ 稍后重试
            return ConsumeConcurrentlyStatus.RECONSUME_LATER;
        }
    }
});
```

**死信队列（DLQ）**：
- 超过 16 次重试仍失败，消息进入死信队列 `%DLQ%消费者组`。
- 死信队列的消息**不再自动消费**，需要人工介入，防止一直阻塞后续消息。

::: tip 💡 面试题：死信队列是什么，有什么用？
结论：消费重试超过上限（默认 16 次）仍失败的消息进入死信队列（DLQ），人工处理，避免阻塞后续消息。原因：如果失败消息无限重试，会占用队列头部导致后续消息无法消费（消息堆积），所以用「有限重试 + 死信」隔离问题消息，保证整体吞吐。
:::

### 消息幂等

**背景**：消息丢失靠重发补偿，但重发会带来**重复消费**。RocketMQ 本身不保证「恰好一次」，只保证「至少一次」，所以幂等是使用者的必答题。

**核心思路**：用唯一业务键去重。消息的唯一 ID（`msgId`）或业务 Key（如订单号）作为幂等键。

```java
consumer.registerMessageListener(new MessageListenerConcurrently() {
    @Override
    public ConsumeConcurrentlyStatus consumeMessage(
            List<MessageExt> msgs, ConsumeConcurrentlyContext context) {
        for (MessageExt msg : msgs) {
            String orderId = msg.getKeys(); // 业务唯一键
            // 用 Redis setnx 实现幂等：只有首次才返回 true
            Boolean first = redisTemplate.opsForValue()
                    .setIfAbsent("order:consumed:" + orderId, "1",
                            30, TimeUnit.MINUTES);
            if (!Boolean.TRUE.equals(first)) {
                // 为什么直接返回成功：消息已经处理过，跳过避免重复扣款
                continue;
            }
            // 首次消费，执行业务
            deductStock(orderId);
        }
        return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
    }
});
```

**幂等的几种实现方式**：

| 方式 | 原理 | 适用 |
|------|------|------|
| Redis `setnx` | 首次写入成功才处理，有 TTL 自动过期 | 通用，最常用 |
| 数据库唯一索引 | 唯一键约束，重复插入报错 | 强一致场景 |
| 数据库状态字段 | `update ... where status = '未处理'`，影响行数为 1 才处理 | 有状态流转的场景 |
| 本地去重表 | 消费前查去重表 | 单体/低并发 |

### 消息不丢失：三端兜底

消息不丢失是可靠性最高频的考察点，要从**生产、存储、消费**三个环节分别保证：

| 环节 | 风险 | 保证手段 |
|------|------|----------|
| 生产者发送 | 发出去但丢了 | 同步发送 + 确认 `SEND_OK` + 失败重试 |
| Broker 存储 | 落盘前宕机 | 同步刷盘 + 主从同步复制 |
| 消费者消费 | 拿到没处理完就丢 | 处理成功才返回 `CONSUME_SUCCESS`，否则重试 |

**生产端**：用同步发送，确认 `SEND_OK` 才认为发送成功；失败自动重试（默认 2 次）。

**Broker 端**：配置同步刷盘 + 同步复制（金融级），保证消息真正落盘且主从都有备份。

**消费端**：一定要在**业务处理成功后**才返回 `CONSUME_SUCCESS`，否则返回 `RECONSUME_LATER` 触发重试。

::: tip 💡 面试题：如何保证消息不丢失？
结论：三端兜底——生产端同步发送 + 确认 + 重试，Broker 端同步刷盘 + 同步复制，消费端处理成功才确认。原因：消息从生产到消费要经过三个节点，任何一个节点都可能丢，必须全链路保证。注意「同步刷盘 + 同步复制」最可靠但最慢，普通业务用「异步刷盘 + 异步复制」即可，金融级才全同步。
:::

### 消费模式深度：推 vs 拉 vs 长轮询

这是理解 RocketMQ 高性能消费的关键。

**推模式（Push）的问题**：Broker 主动推送，但不知道消费者的处理能力，推得太快会把消费者压垮。

**拉模式（Pull）的问题**：消费者主动拉，但如果没消息就空转，频繁拉取浪费资源；拉得太慢又导致消息延迟。

**RocketMQ 的方案：长轮询（Long Polling）**，本质是「拉 + 挂起」，兼具推的及时性和拉的可靠性：

```
消费者发起 Pull 请求
        │
        ▼
Broker 收到请求
        │
   ┌────┴────┐
   │ 有消息？ │
   └────┬────┘
   有   │   没有
        │     │
        │     ▼
        │  把请求挂起 15 秒（PullRequestHoldService）
        │     │
        │     │ 期间有新消息 -> 立即返回
        │     │ 15 秒超时 -> 返回空，消费者再拉
        ▼     │
   立即返回消息
```

- **长轮询的好处**：没有消息时消费者不会空转，有新消息时能几乎实时返回（像推一样快），同时消费速度由消费者自己控制（不会过载）。
- 挂起时长默认 **15 秒**（`longPollingEnable`、`shortPollingTimeMills` 可配）。

::: tip 💡 面试题：RocketMQ 是推模式还是拉模式？
结论：默认是「拉模式 + 长轮询」的封装（PushConsumer 内部是拉）。原因：纯推会压垮消费者，纯拉会空转浪费资源；长轮询把拉请求挂起 15 秒，有新消息立即返回，没消息超时后再拉，兼顾及时性和可控性。
:::

### 负载均衡

**生产者的负载均衡**：决定消息发到 Topic 的哪个队列。默认是**轮询**（按顺序轮流发到每个队列），也支持自定义（如前面的 `MessageQueueSelector` 按业务键路由）。

**消费者的负载均衡（Rebalance）**：决定哪个消费者消费哪个队列。Rebalance 在消费者启动、增减、定时（默认 20s）时触发。常用分配策略：

| 策略 | 类 | 说明 |
|------|-----|------|
| 平均分配 | `AllocateMessageQueueAveragely` | 队列平均分给消费者（默认） |
| 环形平均 | `AllocateMessageQueueAveragelyByCircle` | 环形轮流分配 |
| 一致性哈希 | `AllocateMessageQueueConsistentHash` | 按一致性哈希分配，扩缩容影响小 |
| 机房优先 | `AllocateMachineRoomNearby` | 优先分配同机房的队列 |

```
平均分配示意：8 个队列，3 个消费者
  消费者1 -> Queue 0,1,2
  消费者2 -> Queue 3,4,5
  消费者3 -> Queue 6,7
```

**Rebalance 带来的问题**：如果消费者数量变化，队列会被重新分配，可能引发「重复消费」（新消费者从旧 offset 开始）或「消息堆积」。所以**幂等**是必须的。

### 消息堆积与消费能力

**背景**：消费者处理速度跟不上生产速度，消息在 Broker 越堆越多，就是「消息堆积」。

**排查与处理思路**：

1. **定位堆积的队列**：看 Consumer 的消费进度落后了多少（`consumerOffset` 与 `maxOffset` 的差）。
2. **判断是消费慢还是生产快**：
   - 消费慢：增加消费者实例（集群模式下一个队列只能一个消费者消费，**消费者数不能超过队列数**）、提高消费线程数、优化消费逻辑。
   - 生产快：MQ 本身是缓冲，堆积不一定是问题，但长期堆积要扩容。
3. **临时处理堆积**：新建一个消费者组，从堆积点开始消费，把积压消息快速转发/处理掉。

::: tip 💡 面试题：消息堆积了怎么办？
结论：先定位是消费慢还是生产快，消费慢就加消费者实例（不超过队列数）或提高消费线程、优化逻辑，生产快就扩容 Broker。原因：集群模式下「一个队列同时只能被一个消费者消费」，所以消费者数量上限是队列数，单纯加机器可能无效，要先扩队列或优化单消费者处理能力。
:::

### 消息回溯

RocketMQ 支持按时间回溯消费历史消息，因为消息在 CommitLog 里默认保留 72 小时（可配 `fileReservedTime`）：

```java
// 按时间戳回溯：从 3 小时前开始消费
consumer.setConsumeTimestamp(UtilAll.timeMillisToHumanString3(
        System.currentTimeMillis() - 3 * 3600 * 1000));
```

回溯场景：消费逻辑写错了，需要重新消费过去几小时的消息。前提是消息还没被删除（还在保留期内）。

---

## 原理篇

原理篇是整个 RocketMQ 的「灵魂」，也是面试区分度最高的部分。核心就一句话：**RocketMQ 的高性能来自「顺序写 + 零拷贝 + 内存映射 + 异步刷盘」，高可靠来自「同步刷盘 + 主从复制 + 重试兜底」。**

### 存储设计总览

RocketMQ 没有用数据库，也没有照搬 Kafka 的「一个分区一个文件」，而是独创了 **CommitLog + ConsumeQueue + IndexFile** 三层存储结构：

```
                         写入路径
   Producer ──> 顺序追加写 CommitLog（所有 Topic 共用，一个文件顺序写）
                                    │
                     ┌──────────────┴──────────────┐
                     ▼                             ▼
             ConsumeQueue                     IndexFile
        （每个 Topic 每个队列一个）           （按消息 Key 索引）
         只存「消息在 CommitLog 的位置」      只存「Key -> 消息位置」
                     │                             │
                     ▼                             ▼
              Consumer 按队列消费            按 Key 查询消息
```

三个文件的分工：

| 文件 | 内容 | 作用 | 类比 |
|------|------|------|------|
| CommitLog | 所有消息的**原始数据**，顺序追加写 | 消息真实存储，保证顺序写 | 仓库货架 |
| ConsumeQueue | 只存「消息在 CommitLog 的 offset」的**索引** | 按队列快速定位消息，体积小可进内存 | 货架目录 |
| IndexFile | 只存「消息 Key → CommitLog offset」的**哈希索引** | 按 Key 查询消息 | 商品编号索引 |

**为什么要这样设计？** 这是 RocketMQ 和 Kafka 的核心差异点：

- **Kafka**：每个分区（Partition）一个独立文件，消息写在各自分区文件里。这样**一个 Topic 有多少分区就有多少文件**，分区多了会退化成随机写。
- **RocketMQ**：所有 Topic 的消息**顺序追加写同一个 CommitLog**，无论多少 Topic 都只有一个顺序写文件，**彻底避免了随机写**。ConsumeQueue 只是轻量索引。

::: tip 💡 面试题：为什么 RocketMQ 写消息快？
结论：所有消息顺序追加写同一个 CommitLog，把随机写变成了顺序写，磁盘顺序写吞吐可达 600MB/s 以上。原因：磁盘随机写要频繁寻道，而顺序写是连续落盘，速度接近内存；再配合内存映射和异步刷盘，性能极高。这是它区别于 Kafka（一个分区一个文件）的核心设计。
:::

### CommitLog 文件组织与字节级布局

**文件组织**：

- CommitLog 是物理文件，默认 **1GB 一个文件**，文件名就是文件起始的**物理偏移量**（20 位数字，不足补 0），如 `00000000000000000000`、`00000000001073741824`。
- 存储目录结构（默认 `~/store`）：

```
store/
├── commitlog/
│   ├── 00000000000000000000   # 第 1 个文件，1GB
│   ├── 00000000001073741824   # 第 2 个文件（offset 从 1GB 开始）
│   └── ...
├── consumequeue/
│   ├── order-topic/           # 每个 Topic 一个目录
│   │   ├── 0/                 # 队列 0
│   │   │   └── 00000000000000000000  # 队列的索引文件
│   │   ├── 1/                 # 队列 1
│   │   └── ...
│   └── ...
├── index/
│   └── 20240101120000000      # 索引文件，按创建时间命名
├── config/
│   └── consumerOffset.json    # 消费进度
└── abort                      # 正常关闭会删除，存在说明上次异常宕机
```

**消息在 CommitLog 中的字节级布局**（一条消息的存储格式）：

```
偏移量(字节)    字段                     大小       说明
─────────────────────────────────────────────────────────
0            totalSize                4 字节    整条消息总长度
4            magicCode                4 字节    魔数，标识消息
8            bodyCRC                  4 字节    消息体 CRC 校验
12           queueId                  4 字节    所属队列编号
16           flag                     4 字节    消息标志位
20           queueOffset              8 字节    在队列中的逻辑偏移
28           physicOffset             8 字节    在 CommitLog 的物理偏移
36           sysFlag                  4 字节    系统标志（如压缩、事务）
40           bornTimestamp            8 字节    生产时间戳
48           bornHost                 8 字节    生产者 IP:Port(4+4)
56           storeTimestamp           8 字节    存储时间戳
64           storeHost                8 字节    Broker IP:Port(4+4)
72           reconsumeTimes           4 字节    重试次数
76           preparedTransactionOffset 8 字节   事务消息：预提交偏移
84           bodyLength               4 字节    消息体长度
88           body                     N 字节    消息体（业务数据）
88+N         topicLength              1 字节    Topic 长度
89+N         topic                    M 字节    Topic 字符串
89+N+M       propertiesLength         2 字节    属性长度
91+N+M       properties               K 字节    属性（Key、Tag 等）
─────────────────────────────────────────────────────────
```

**关键设计点**：

- `totalSize` 在消息头部，读取时先读 4 字节就能知道整条消息长度，方便按条读取。
- `magicCode` 用于校验数据完整性（判断文件是否损坏）。
- `bodyCRC` 用于消息完整性校验。

### ConsumeQueue 逻辑队列（20 字节索引）

ConsumeQueue 不是真正的消息存储，而是**索引**。每个 `Topic` 的每个 `Queue` 对应一个 ConsumeQueue 文件，每个索引条目固定 **20 字节**：

```
ConsumeQueue 单条索引（20 字节）：
┌──────────────────┬────────────┬──────────────────┐
│ commitLogOffset  │    size    │  tagsHashCode    │
│ 8 字节            │  4 字节     │  8 字节          │
│ CommitLog 物理偏移 │ 消息大小    │ Tag 的哈希值     │
└──────────────────┴────────────┴──────────────────┘
```

**为什么这样设计？**

1. **体积小**：每条消息在 ConsumeQueue 里只占 20 字节，而消息本身可能几 KB，索引体积是消息的几百分之一，**可以整体加载进内存（Page Cache）**。
2. **加速定位**：消费时先读 ConsumeQueue 拿到 `commitLogOffset`，再按偏移量直接定位到 CommitLog 读取消息，避免全表扫描。

**消费定位流程**：

```
消费者按队列消费
     │
     ▼
读 ConsumeQueue（队列 X 的索引文件）
     │  得到 commitLogOffset = 12345, size = 100
     ▼
按 offset 定位到 CommitLog 第 12345 字节
     │
     ▼
读取 100 字节，得到完整消息，投递给消费者
```

### IndexFile 哈希索引

IndexFile 用于**按消息 Key 查询**（如按订单号查消息）。结构是一个哈希表：

```
IndexFile 结构：
┌────────────────────────────────────────────┐
│  Header（40 字节）                          │
│   - beginTimestamp（最早消息时间）           │
│   - endTimestamp（最晚消息时间）             │
│   - beginPhyOffset / endPhyOffset          │
│   - hashSlotCount（默认 500 万个槽）         │
│   - indexCount（默认 2000 万个索引）         │
├────────────────────────────────────────────┤
│  Hash Slot（每个 4 字节，共 500 万）         │
│   存「该槽位链表的头 index 位置」             │
├────────────────────────────────────────────┤
│  Index 条目（每个 20 字节，共 2000 万）       │
│   存「keyHash + commitLogOffset + timestamp │
│        + 前一个同槽索引位置」                 │
└────────────────────────────────────────────┘
```

查询流程：`key 的 hash → 定位 hash slot → 遍历该槽的链表 → 找到对应 commitLogOffset → 读 CommitLog`。IndexFile 是**可选的**，只在需要按 Key 查询时才构建。

### 页缓存与零拷贝（mmap / sendfile）

RocketMQ 高性能的两个底层利器：

**1. 内存映射（mmap）**：RocketMQ 用 `mmap` 把磁盘文件映射到内存，读写文件就像读写内存一样，**避免了用户态和内核态之间的数据拷贝**。

**2. 零拷贝（sendfile / FileRegion）**：Broker 把消息发给消费者时，用 `FileRegion.transferTo()` 实现零拷贝：

```
传统 4 次拷贝：
磁盘 -> 内核缓冲区 -> 用户缓冲区 -> 内核 Socket 缓冲区 -> 网卡
      (1 DMA)     (2 CPU)      (3 CPU)         (4 DMA)

零拷贝（sendfile）2 次拷贝：
磁盘 -> 内核缓冲区 -> 网卡
      (1 DMA)     (2 DMA)   <- 不再经过用户态，省 2 次 CPU 拷贝
```

**为什么快**：数据不经过用户态，省掉了 CPU 拷贝，CPU 释放出来处理更多请求，吞吐大幅提升。

### 刷盘机制（同步 / 异步）

刷盘决定了「消息写到哪才算成功」，是**可靠性 vs 性能**的第一个权衡点：

```
                        消息到达 Broker
                              │
                              ▼
                      写入内存 Page Cache（页缓存）
                              │
                 ┌────────────┴────────────┐
                 │ 同步刷盘                 │ 异步刷盘
                 ▼                         ▼
        立即调用 fsync 刷盘           后台线程定时刷盘（默认 1s）
        落盘成功才返回 ACK          先返回 ACK，再慢慢落盘
                 │                         │
             不丢但慢                  快但宕机可能丢
```

| 维度 | 同步刷盘（SYNC_FLUSH） | 异步刷盘（ASYNC_FLUSH） |
|------|----------------------|----------------------|
| 刷盘时机 | 写内存后立刻 `fsync` | 后台定时刷（默认 1s） |
| 可靠性 | 高（不丢） | 低（宕机丢 1s 内的消息） |
| 性能 | 低 | 高 |
| 实现 | GroupCommitService 组提交 | FlushRealTimeService |
| 场景 | 金融、支付 | 普通业务（默认） |

> 同步刷盘的「组提交」优化：多条消息合并成一次 `fsync`，减少磁盘 I/O 次数，在保证可靠性的同时尽量提升吞吐。

### 主从复制（同步 / 异步）

刷盘是「单机可靠性」，主从复制是「集群可靠性」——Master 宕机后 Slave 是否还有数据：

| 维度 | 同步复制（SYNC_MASTER） | 异步复制（ASYNC_MASTER） |
|------|----------------------|----------------------|
| 复制时机 | Master 等 Slave 写完才返回 ACK | Master 写完即返回，Slave 异步同步 |
| 可靠性 | 高（主挂了数据还在 Slave） | 低（主挂了可能丢刚发的消息） |
| 延迟 | 高（要等 Slave） | 低 |
| 场景 | 金融级 | 普通业务（默认） |

**刷盘 + 复制是两个独立维度**，可以组合出四种可靠性等级：

| 组合 | 可靠性 | 性能 | 场景 |
|------|--------|------|------|
| 异步刷盘 + 异步复制 | 最低 | 最高 | 普通业务（默认） |
| 异步刷盘 + 同步复制 | 中 | 中 | 一般可靠要求 |
| 同步刷盘 + 异步复制 | 中 | 中 | 单机可靠为主 |
| 同步刷盘 + 同步复制 | **最高** | 最低 | 金融、支付 |

::: tip 💡 面试题：刷盘和主从复制有什么区别？
结论：刷盘是单机维度（消息是否真正落磁盘），主从复制是集群维度（Master 和 Slave 是否有备份），两者独立可组合。原因：刷盘解决「本机宕机丢不丢」，主从复制解决「Master 宕机数据还在不在」。金融级要「同步刷盘 + 同步复制」双保险，普通业务「异步刷盘 + 异步复制」即可。
:::

### 消息写入完整流程

把前面的机制串起来，看一条消息从生产到落盘的完整路径：

```
1. Producer 从 NameServer 拿到 Topic 的路由（有哪些 Broker、哪些队列）
2. Producer 选择一个队列（默认轮询），直连对应 Broker 发送
3. Broker 收到消息，写入 CommitLog（顺序追加写，mmap 内存映射）
4. 根据刷盘策略：
   - 同步刷盘 -> 立即 fsync 落盘
   - 异步刷盘 -> 写入 Page Cache 即返回，后台刷盘
5. 同时异步构建 ConsumeQueue 索引和 IndexFile 索引
6. 根据复制策略：
   - 同步复制 -> 等 Slave 同步完才返回 ACK
   - 异步复制 -> 立即返回 ACK，Slave 异步同步
7. Producer 收到 SEND_OK，发送成功
```

**为什么 ConsumeQueue 是「异步构建」**：因为如果同步构建索引，写 CommitLog 的性能会被索引拖慢；异步构建让主写入路径极简，只做「顺序写 + 刷盘」，索引由后台线程补齐，即使索引暂时缺失，也可以扫 CommitLog 兜底恢复。

### 消息消费完整流程

```
1. Consumer 从 NameServer 拿到路由，触发 Rebalance，分配到若干队列
2. Consumer 向 Broker 发起拉取请求（Pull）
3. Broker 查 ConsumeQueue 定位消息在 CommitLog 的位置
4. Broker 从 CommitLog 读消息（可能命中 Page Cache）
5. 有消息 -> 返回给 Consumer
   无消息 -> 挂起 15 秒（长轮询），有新消息立即返回
6. Consumer 执行消费逻辑
7. 成功 -> 提交消费进度（offset）到 Broker
   失败 -> 返回 RECONSUME_LATER，进入重试队列
```

### NameServer 路由原理

NameServer 是轻量级注册中心，它的机制简单但精妙：

```
Broker 启动
    │
    ▼ 每 30 秒向所有 NameServer 发送心跳（注册 Topic/队列信息）
NameServer 维护路由表（Broker -> Topic -> Queue）
    │
    ▼ 每 10 秒扫描，2 分钟未收到心跳的 Broker 被剔除
Producer/Consumer
    │
    ▼ 每 30 秒从 NameServer 拉取一次路由，本地缓存
    │
    ▼ 有路由变更 -> 通知 Producer/Consumer 更新
```

关键机制：

1. **心跳注册**：Broker 每 30s 上报一次自己的存活状态和 Topic 信息。
2. **定时剔除**：NameServer 每 10s 扫描，120s（2 分钟）没心跳的 Broker 标记为不可用。
3. **路由缓存**：Producer/Consumer 每 30s 拉取路由并本地缓存，收发消息时**直连 Broker**，不经过 NameServer。

::: tip 💡 面试题：NameServer 为什么不用 ZooKeeper？
结论：NameServer 无状态、轻量，挂了对已建立的连接无影响；ZooKeeper 是 CP 强一致、有选举，运维复杂。原因：MQ 路由信息不要求强一致（最终一致即可），用 ZooKeeper 是大材小用还引入单点风险；NameServer 集群互不通信、无选举，任何一台都能独立服务，可用性和运维简单度都更好。
:::

### 顺序消息原理（深层）

顺序消息的「队列加锁」机制，是保证「一个队列同时只被一个消费者消费」的底层原因：

```
顺序消费（MessageListenerOrderly）内部：
  消费者拉取队列消息时，先获取该队列的锁（ProcessQueue 的 consumeLock）
      │
      ├─ 拿到锁 -> 串行消费该队列消息
      │
      └─ 没拿到锁（别的消费者/线程在消费）-> 稍后重试

  消费成功后，提交 offset，释放锁
  消费失败 -> 阻塞重试，不跳过消息（严格保序）
```

- **生产端保序**：同一业务键 → 同一队列（MessageQueueSelector）。
- **消费端保序**：队列加锁，同一时刻只有一个消费者线程处理该队列。
- **失败不跳过**：顺序消费失败会一直重试，直到成功，因为跳过了就乱序了。

### 延迟消息原理（定时投递）

延迟消息的底层是「内部定时主题」：

```
发送延迟消息（delayLevel = 3，即 10 秒）
     │
     ▼
Broker 把消息存储到内部主题 SCHEDULE_TOPIC_XXXX
  （每个延迟级别对应一个队列：queue 0 = 1s, queue 1 = 5s, ...）
     │
     ▼
定时任务（ScheduleMessageService）每 1 秒扫描一次
  检查哪些消息到达投递时间
     │
     ├─ 到期 -> 重新投递到真实目标 Topic
     └─ 未到期 -> 继续等待
     │
     ▼
消费者从目标 Topic 正常消费
```

- `SCHEDULE_TOPIC_XXXX` 有 18 个队列，分别对应 18 个延迟级别。
- 定时任务每秒扫描，把到期消息投递到真实 Topic。
- **为什么不能任意精度**：因为内部是「定时扫描 + 级别队列」的粗粒度设计，只有 18 个档位。

### 事务消息原理（半消息 + 回查）

事务消息的底层机制是最精妙的部分：

```
发送事务消息
     │
     ▼
1. Producer 发送半消息（Half Message）
   Broker 把半消息存储到内部主题 RMQ_SYS_TRANS_HALF_TOPIC
   此时消费者看不到它（不会投递）
     │
     ▼
2. Producer 执行本地事务
     │
     ├─ 提交 -> Broker 把半消息写入真实 Topic，消费者可消费
     ├─ 回滚 -> Broker 删除半消息
     └─ 既不提交也不回滚（如生产者宕机）
           │
           ▼
3. Broker 回查机制（默认 60s 后首次回查，最多 15 次）
   回调 Producer 的 checkLocalTransaction()
   根据业务键查本地事务最终状态 -> 决定提交或回滚
```

**为什么需要回查**：如果 Producer 执行本地事务后宕机了，还没来得及提交/回滚半消息，Broker 就永远不知道结果。回查让 Broker 主动问 Producer「你的本地事务到底成没成」，Producer 根据业务键（如订单号）查数据库，返回最终状态。

::: tip 💡 面试题：事务消息如果一直回查失败怎么办？
结论：回查有上限（默认最多 15 次），超过后消息会被丢弃或进入人工处理。原因：无限回查会占用 Broker 资源，且如果本地事务确实没有结果（如数据库也挂了），回查也查不出来，只能靠告警和人工介入，这是最终一致性的兜底边界。
:::

### 高性能设计总结

RocketMQ 的高性能是多个机制叠加的结果，面试时能串起来讲就是加分项：

| 机制 | 作用 | 原理 |
|------|------|------|
| 顺序写 | 高吞吐写入 | 所有消息顺序追加写 CommitLog，避免随机写 |
| 内存映射 mmap | 少拷贝 | 文件映射到内存，读写直接操作内存 |
| 零拷贝 sendfile | 少拷贝 | 消息发送不经过用户态，省 CPU 拷贝 |
| 异步刷盘 | 高吞吐 | 不等待磁盘落盘就返回 |
| 长轮询 | 低延迟 + 省资源 | 拉请求挂起 15s，有新消息立即返回 |
| 文件预分配 | 减少扩容开销 | 提前分配下一个 CommitLog 文件 |
| ConsumeQueue 轻量索引 | 快速定位 | 20 字节索引，可进 Page Cache |

---

## 面试常问

1. **为什么要用 MQ，不用行不行？**
   结论：行，但会牺牲解耦、异步、削峰三大能力。
   展开：MQ 的核心价值是异步削峰，代价是引入一致性和可用性复杂度；小流量强一致场景不一定需要，引入前要评估收益是否大于代价。

2. **RocketMQ 和 Kafka 的区别，怎么选？**
   结论：Kafka 主打高吞吐（日志/大数据），RocketMQ 主打高可靠 + 业务功能（事务/延迟/顺序消息）。
   展开：两者定位不同，Kafka 用分区 + 顺序写优化吞吐但事务/延迟消息弱；RocketMQ 在保证吞吐的同时提供了半消息、延迟级别、重试等业务能力，更适合电商金融场景。

3. **RocketMQ 的架构组成？**
   结论：Producer（生产）、Consumer（消费）、Broker（存储转发）、NameServer（注册中心）四部分。
   展开：NameServer 无状态只存路由，Broker 主从存储消息，Producer/Consumer 从 NameServer 拉路由后直连 Broker 收发，不经过 NameServer。

4. **消息不丢失怎么保证？**
   结论：三端兜底——生产端同步发送 + 确认 + 重试，Broker 端同步刷盘 + 同步复制，消费端处理成功才确认。
   展开：消息要经过生产、存储、消费三个节点，任何一个都可能丢；「同步刷盘 + 同步复制」最可靠但最慢，普通业务异步即可，金融级才全同步。

5. **消息重复了怎么处理？**
   结论：靠业务幂等，用唯一业务键去重。
   展开：RocketMQ 只保证至少一次投递，不保证恰好一次；用 Redis `setnx`、数据库唯一索引或状态字段实现幂等，重复消息直接跳过。

6. **顺序消息怎么实现？**
   结论：生产端同一业务键路由到同一队列，消费端对该队列串行消费（加锁）。
   展开：RocketMQ 只保证单队列有序，顺序的本质是「收敛到单队列 + 单消费者串行」；这是局部顺序，全局顺序要用单队列，吞吐会大幅下降。

7. **死信队列是什么？**
   结论：消费重试超过上限（默认 16 次）仍失败的消息进入死信队列，人工处理。
   展开：失败消息无限重试会阻塞队列导致消息堆积，用「有限重试 + 死信」隔离问题消息；死信消息不再自动消费，需人工介入。

8. **为什么 RocketMQ 写消息快？**
   结论：所有消息顺序追加写同一个 CommitLog，把随机写变成顺序写。
   展开：磁盘顺序写吞吐可达 600MB/s 以上，接近内存速度；再配合 mmap 内存映射、零拷贝、异步刷盘，性能极高。

---

相关阅读：[分布式基础](/learn_backend/java/微服务/分布式基础) · [Seata](/learn_backend/java/微服务/Seata) · [Nacos](/learn_backend/java/微服务/Nacos) · [Sentinel](/learn_backend/java/微服务/Sentinel) · [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) · [Redis](/learn_database/Redis) · [并发编程](/learn_backend/java/Java核心/并发编程) · [JVM](/learn_backend/java/Java核心/JVM)
