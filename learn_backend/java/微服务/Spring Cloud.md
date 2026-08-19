# Spring Cloud

> 一句话定位：Spring Cloud 是一套基于 Spring Boot 的微服务治理工具集，用「注册发现、远程调用、配置中心、熔断限流、网关、链路追踪、分布式事务」这一整套组件，解决微服务架构下服务之间「怎么发现彼此、怎么互相调用、怎么统一配置、怎么防止雪崩、怎么统一入口」的共性问题，让开发者不必重复造轮子。

## 基础篇

### 1. 微服务架构演进：从单体到微服务

要理解 Spring Cloud，先要理解「微服务架构为什么会出现」。任何技术都不是凭空产生的，Spring Cloud 的出现，根源在于**单体架构在业务规模变大后撑不住了**。

#### 1.1 单体架构（Monolithic / All in One）

最早的 Web 应用，通常是把所有功能——订单、用户、商品、支付、库存——全部写在一个项目里，打成一个 war/jar 包，部署到一台服务器上。

```
┌─────────────────────────────────────────────┐
│             单体应用（一个 war 包）             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │ 订单模块 │ │ 用户模块 │ │ 商品模块 │  ...    │
│  └─────────┘ └─────────┘ └─────────┘         │
│        共享同一个数据库、同一个 JVM 进程          │
└─────────────────────────────────────────────┘
```

单体架构的**优点**非常明显：开发简单、部署简单、调用就是本地方法调用（没有网络开销）、事务天然一致。创业初期，单体架构是最合理的选择。

但当业务增长，单体架构的**缺点**开始暴露：

| 问题 | 具体表现 |
| --- | --- |
| **耦合严重** | 改一个模块要重新编译、部署整个应用，一处改动全量发布 |
| **无法单独扩展** | 订单模块是热点，但只能整个应用一起水平扩展，资源浪费 |
| **技术栈锁死** | 全项目必须用同一种语言、同一个框架版本，想升级很痛苦 |
| **故障牵连** | 一个模块 OOM 或死循环，可能拖垮整个 JVM 进程 |
| **开发效率下降** | 代码库越来越大，编译越来越慢，多人协作冲突频繁 |

#### 1.2 架构演进历程

架构不是一步到位跳到微服务的，中间经历了几个阶段：

| 阶段 | 形态 | 解决的问题 | 引入的新问题 |
| --- | --- | --- | --- |
| 单体架构 | 一个应用一个包 | —（最原始） | 耦合、无法扩展 |
| 垂直拆分 | 按业务拆成几个独立应用（如订单系统、用户系统） | 代码层面解耦 | 应用间有重复代码，数据无法互通 |
| SOA（面向服务架构） | 把公共能力抽成服务，通过 ESB 企业服务总线通信 | 服务复用 | ESB 太重、中心化、学习成本高 |
| **微服务** | 按业务域拆成小而自治的服务，轻量通信 | 真正独立开发、部署、扩展 | 分布式带来的治理难题 |

一句话总结：**架构演进的本质，是「拆分粒度」从粗到细、「服务自治」从无到有的过程**，微服务是这条路上目前最成熟的落地方案。

#### 1.3 微服务拆开之后的新问题

微服务把「一个大问题」拆成了「很多个小问题」，但拆完之后，**每个服务之间是隔离的，怎么协同**又成了一组全新的问题。这正是 Spring Cloud 存在的意义：

| 微服务带来的新问题 | 解决方案 | 对应组件 |
| --- | --- | --- |
| 服务多了，怎么知道彼此的地址？ | 服务注册与发现 | Nacos / Eureka |
| 服务间怎么互相调用？ | 声明式远程调用 | OpenFeign |
| 配置散落在每个服务里，怎么统一管理？ | 配置中心 | Nacos Config |
| 一个服务挂了，怎么不让它拖垮整条链路？ | 熔断限流降级 | Sentinel |
| 外部请求怎么统一入口、统一鉴权？ | API 网关 | Gateway |
| 跨服务、跨库的数据怎么保持一致？ | 分布式事务 | Seata |
| 一次请求经过多个服务，怎么定位问题？ | 链路追踪 | SkyWalking / Sleuth |
| 服务间调用怎么削峰、解耦？ | 消息驱动 | RocketMQ |

::: tip 💡 面试题：微服务架构有什么优缺点？
一句话结论：优点是独立开发部署、按需扩展、技术栈灵活、故障隔离；缺点是引入了分布式固有的复杂度（网络、一致性、运维）。
一句话原因：微服务把「单体内部的模块调用」变成了「跨网络的远程调用」，网络不可靠、数据不一致、节点故障这三大分布式难题随之而来。
一句话展开：所以微服务不是银弹，小项目上微服务往往是过度设计，先评估业务规模和团队能力再决定是否拆分。
:::

### 2. Spring Cloud 是什么

#### 2.1 定义与定位

**Spring Cloud 不是一个单一框架，而是一套「微服务治理的组件集合 + 接口规范」**。它基于 Spring Boot 的自动装配能力，把注册发现、远程调用、配置、熔断、网关等能力做成了一个个「开箱即用」的 starter。

关键要理解两点：

1. **它是「规范 + 实现」的生态**：Spring Cloud 定义了很多抽象接口（如 `DiscoveryClient`、`LoadBalancerClient`、`ConfigClient`），第三方厂商（Netflix、Alibaba）提供具体实现。这跟 Java 的「接口 + 实现类」是同一个思想。
2. **它依赖 Spring Boot**：Spring Cloud 本身就是一堆「Spring Boot starter」，靠 Boot 的自动装配机制把组件无缝接入应用。

```
         Spring Cloud（微服务治理规范 + 组件集合）
        ┌────────────────────────────────────────┐
        │  DiscoveryClient  LoadBalancer  ...    │  ← 抽象接口（规范）
        └────────────────────────────────────────┘
              ↑ 实现            ↑ 实现
        ┌──────────┐      ┌──────────────┐
        │  Nacos   │      │   Eureka     │        ← 具体实现
        └──────────┘      └──────────────┘
                   ↓ 依赖
        ┌────────────────────────────┐
        │        Spring Boot          │        ← 自动装配、内嵌容器
        └────────────────────────────┘
```

#### 2.2 Spring Cloud 与 Spring Boot 的关系

这是面试高频题，很多同学分不清两者的边界：

| 维度 | Spring Boot | Spring Cloud |
| --- | --- | --- |
| 定位 | 快速构建**单个** Spring 应用 | 微服务治理，解决**多个服务之间**的协作 |
| 核心能力 | 自动装配、内嵌容器、起步依赖 | 注册发现、远程调用、配置、熔断、网关 |
| 依赖关系 | 独立使用 | 依赖 Spring Boot，本质是一组「Boot starter」 |
| 版本约束 | 有独立版本号（2.x / 3.x） | 版本必须与 Boot 版本严格对应 |
| 关注点 | 「怎么把一个应用写好」 | 「怎么把很多应用管好」 |

一句话记忆：**Spring Boot 负责「造好一辆车」，Spring Cloud 负责「管好一个车队」**——前者解决单车的制造问题，后者解决车队之间的调度、通信、监控问题。

::: tip 💡 面试题：Spring Cloud 和 Spring Boot 是什么关系？
一句话结论：Spring Cloud 依赖 Spring Boot，是基于 Boot 自动装配能力构建的微服务治理组件集合。
一句话原因：Spring Cloud 的每个组件本质都是一个 Boot starter，靠 `spring.factories` / 自动装配类被无缝加载进应用。
一句话展开：因此两者的版本有严格的对应关系（见下文版本表），版本不匹配会直接报 `NoClassDefFoundError` 或自动装配失败。
:::

#### 2.3 Spring Cloud 生态的两大阵营

Spring Cloud 是「规范」，具体实现有两派：

| 阵营 | 代表组件 | 现状 |
| --- | --- | --- |
| Netflix 系（早期主流） | Eureka、Ribbon、Hystrix、Zuul | Eureka、Hystrix、Zuul 已停止维护，逐步被替换 |
| Alibaba 系（国内主流） | Nacos、Sentinel、Seata、RocketMQ | 功能更全、持续活跃，是国内生产环境首选 |

这里有个历史背景值得了解：Spring Cloud 早期核心组件几乎全部来自 Netflix 开源，但 Netflix 陆续宣布 Eureka 2.x、Hystrix、Ribbon、Zuul 进入维护模式（不再加新功能）。社区于是推出替代品（Gateway 替代 Zuul、Spring Cloud LoadBalancer 替代 Ribbon），国内则大量采用 Spring Cloud Alibaba 全家桶。

### 3. Spring Cloud 技术栈全景

#### 3.1 核心组件一览（面试必背）

| 功能域 | 作用 | Netflix 系 | Alibaba 系（主流） | 备注 |
| --- | --- | --- | --- | --- |
| 服务注册发现 | 服务自动登记、互相感知地址 | Eureka | **Nacos** | 微服务的「通讯录」 |
| 远程调用 | 像调本地方法一样调远程服务 | Feign | **OpenFeign** | 声明式 HTTP 调用 |
| 配置中心 | 配置集中管理、动态刷新 | Config | **Nacos Config** | 改配置不用重启 |
| 熔断限流降级 | 防止故障雪崩 | Hystrix | **Sentinel** | 微服务的「保险丝」 |
| API 网关 | 统一入口、路由、鉴权、限流 | Zuul | **Gateway** | 客户端唯一入口 |
| 负载均衡 | 把请求分摊到多个实例 | Ribbon | **LoadBalancer** | 常和调用/网关配合 |
| 分布式事务 | 跨服务数据一致性 | — | **Seata** | 解决跨库一致性 |
| 消息驱动 | 异步解耦、削峰 | Stream | **RocketMQ** | 服务间异步通信 |
| 链路追踪 | 一次请求的全链路定位 | Sleuth/Zipkin | **SkyWalking** | 排查分布式调用问题 |

#### 3.2 一张图看懂组件的协作关系

把各个组件放到一个真实的请求链路里，就能看清它们的定位：

```
  用户请求
     │
     ▼
┌─────────┐  2.路由/鉴权/限流   ┌────────────────────────────────────────┐
│ Gateway │ ──────────────────▶ │  order-service（服务消费者）           │
│  网关    │                     │   ┌──────────┐  3.Feign 远程调用      │
└─────────┘                     │   │ 订单服务  │ ──────────┐            │
     ▲                          │   └──────────┘           │            │
     │ 1.统一入口               └───────────────────────────┼────────────┘
     │                                                      ▼
     │                                              ┌──────────────┐
     │                                   4.负载均衡选实例 │ user-service  │
     │                                              │  （服务提供者） │
     │                                              └──────────────┘
     │                                                        ▲
     │   5.全部服务启动时注册、定时心跳                          │
     │   ┌──────────┐                                        │
     └──▶│  Nacos   │◀───────────────────────────────────────┘
         │ 注册/配置 │
         └──────────┘
```

这条链路涵盖了微服务的完整调用过程，每个编号对应一个组件的职责。理解了这张图，就理解了 Spring Cloud 全家桶的分工。

::: tip 💡 面试题：Spring Cloud 常用组件有哪些？
一句话结论：注册发现用 Nacos、调用用 OpenFeign、配置用 Nacos Config、熔断用 Sentinel、网关用 Gateway、事务用 Seata。
一句话原因：这套 Alibaba 组合是国内生产环境的主流实践，功能比已停止维护的 Netflix 组件更全、社区更活跃。
一句话展开：另外负载均衡用 Spring Cloud LoadBalancer（Ribbon 已停更），链路追踪常用 SkyWalking，消息用 RocketMQ。
:::

### 4. 版本对应与依赖管理

#### 4.1 版本命名规则

Spring Cloud 的版本号经历过一次「改朝换代」：

- **早期**：用伦敦地铁站名做发布序列（Angel → Brixton → Camden → Dalston → Edgware → Finchley → Greenwich → Hoxton）。
- **现在**：从 2020 年起改用**年份命名**（2020.0.x、2021.0.x …），更直观地体现发布年份。

用「发布序列（release train）」而不是简单版本号，是因为 Spring Cloud 是一个组件集合，每个子组件有自己的版本号，需要一个「总版本号」把一批相互兼容的子组件版本锁定在一起。

#### 4.2 版本对应关系（面试常被问版本踩坑）

**Spring Cloud、Spring Boot、Spring Cloud Alibaba 三者版本必须严格对应**，否则启动直接报错：

| Spring Cloud 版本 | 对应 Spring Boot 版本 | 对应 Spring Cloud Alibaba | 说明 |
| --- | --- | --- | --- |
| Hoxton | 2.2.x / 2.3.x | 2.2.x | 最后一个地铁站名版本 |
| 2020.0.x（Ilford） | 2.4.x / 2.5.x | 2021.1 | 切换年份命名的起点 |
| 2021.0.x（Jubilee） | 2.6.x / 2.7.x | 2021.0.5.0 | 国内用得最多的稳定组合 |
| 2022.0.x（Kilburn） | 3.0.x | 2022.0.0.0 | 适配 Spring Boot 3 / JDK 17 |
| 2023.0.x（Leyton） | 3.2.x | 2023.0.1.0 | 较新版本 |

> 记不住没关系，记住一条铁律：**先定 Spring Boot 版本，再按官方「版本适配表」反查 Spring Cloud 和 Alibaba 版本**，不要三个版本各自随便挑。

#### 4.3 BOM 与 dependencyManagement 的作用

引入 Spring Cloud 时，几乎都会看到 `dependencyManagement` + `scope=import` 的写法。为什么要这么写？

```xml
<dependencyManagement>
    <dependencies>
        <!-- 引入 Spring Cloud Alibaba 的版本依赖清单（BOM） -->
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-alibaba-dependencies</artifactId>
            <version>2021.0.5.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
        <!-- 同时引入 Spring Cloud 官方 BOM -->
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-dependencies</artifactId>
            <version>2021.0.5</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

**为什么用 `dependencyManagement` 而不是直接写依赖？** 因为 BOM（Bill of Materials，物料清单）本身不引入任何 jar 包，它只是声明了「每个组件该用什么版本」。真正的依赖在 `<dependencies>` 里写，**不写版本号**，版本由 BOM 统一约束。这样做的三个好处：

1. **避免版本冲突**：几十个组件如果各写各的版本，很容易出现同一个类有两个版本（依赖冲突），BOM 保证整套版本是官方验证过能一起跑的。
2. **升级省事**：升级时只需改 BOM 的版本号一处，所有子组件版本跟着升级。
3. **子工程继承**：父工程定义好 BOM，子模块直接写依赖不写版本，管理集中。

#### 4.4 完整的父工程 pom 示例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <!-- 父工程：统一管理 Spring Boot / Spring Cloud / Alibaba 版本 -->
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>2.7.9</version>
        <relativePath/>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>cloud-demo</artifactId>
    <version>1.0.0</version>
    <packaging>pom</packaging>

    <properties>
        <java.version>11</java.version>
        <spring-cloud.version>2021.0.5</spring-cloud.version>
        <spring-cloud-alibaba.version>2021.0.5.0</spring-cloud-alibaba.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.cloud</groupId>
                <artifactId>spring-cloud-dependencies</artifactId>
                <version>${spring-cloud.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
            <dependency>
                <groupId>com.alibaba.cloud</groupId>
                <artifactId>spring-cloud-alibaba-dependencies</artifactId>
                <version>${spring-cloud-alibaba.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
</project>
```

### 5. 快速入门：搭建第一个微服务

光讲理论太虚，下面用一个最小的例子把「注册 + 调用」跑通。假设有两个服务：

- **user-service**：用户服务（服务提供者），提供一个查询用户的接口。
- **order-service**：订单服务（服务消费者），通过 OpenFeign 调用 user-service。

```
order-service ──(Feign 调用 user-service)──▶ user-service
      │                                          │
      └──────────── 都注册到 Nacos ───────────────┘
```

#### 5.1 服务提供者 user-service

```xml
<!-- user-service 的依赖：web + nacos 注册发现 -->
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    </dependency>
</dependencies>
```

```yaml
# application.yml
server:
  port: 8081
spring:
  application:
    name: user-service            # 服务名，就是注册到 Nacos 的唯一标识
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848   # Nacos 地址
```

```java
// 启动类：加 @EnableDiscoveryClient 开启服务发现（新版可省略，默认开启）
@SpringBootApplication
public class UserApplication {
    public static void main(String[] args) {
        SpringApplication.run(UserApplication.class, args);
    }
}
```

```java
// 提供一个查询用户的接口，供 order-service 调用
@RestController
@RequestMapping("/user")
public class UserController {

    @GetMapping("/{id}")
    public User getUser(@PathVariable Long id) {
        // 真实项目里这里查数据库，此处简化返回
        return new User(id, "张三", 18);
    }

    // 内部静态类只用于演示
    public static class User {
        private Long id;
        private String name;
        private Integer age;
        // 省略构造器与 getter/setter
        public User(Long id, String name, Integer age) {
            this.id = id; this.name = name; this.age = age;
        }
        public Long getId() { return id; }
        public String getName() { return name; }
        public Integer getAge() { return age; }
    }
}
```

启动后，user-service 会把 `user-service`（服务名）+ `192.168.x.x:8081`（地址）注册到 Nacos。

#### 5.2 服务消费者 order-service

```xml
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-openfeign</artifactId>
    </dependency>
</dependencies>
```

```java
// 启动类：加 @EnableFeignClients 开启 Feign 客户端扫描
@SpringBootApplication
@EnableFeignClients
public class OrderApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderApplication.class, args);
    }
}
```

```java
// 定义 Feign 客户端接口，@FeignClient 的值是「目标服务名」，不是 IP
@FeignClient("user-service")
public interface UserClient {

    @GetMapping("/user/{id}")
    User getUserById(@PathVariable("id") Long id);

    public static class User {
        private Long id;
        private String name;
        private Integer age;
        // 省略 getter/setter（反序列化需要，不能省）
        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public Integer getAge() { return age; }
        public void setAge(Integer age) { this.age = age; }
    }
}
```

```java
// 订单接口，注入 Feign 客户端，像调本地方法一样调远程服务
@RestController
@RequestMapping("/order")
public class OrderController {

    private final UserClient userClient;

    public OrderController(UserClient userClient) {
        this.userClient = userClient;
    }

    @GetMapping("/{userId}")
    public String getOrderWithUser(@PathVariable Long userId) {
        User user = userClient.getUserById(userId);   // 关键：这里实际发起了 HTTP 请求
        return "订单关联用户：" + user.getName();
    }
}
```

#### 5.3 跑通之后发生了什么

1. 两个服务启动，各自把「服务名 + IP:端口」注册到 Nacos。
2. 浏览器访问 `http://localhost:8082/order/1`。
3. order-service 的 `UserClient.getUserById` 被调用，Feign 发现目标服务名是 `user-service`，去 Nacos 拿实例列表，选一个真实地址，发起 `GET http://<user-service实例>/user/1`。
4. user-service 返回 JSON，Feign 反序列化成 `User` 对象，order-service 组装响应返回。

整个过程，**order-service 的代码里没有写任何 user-service 的 IP 和端口**——这就是注册中心 + 声明式调用带来的「解耦」。

::: tip 💡 面试题：`@FeignClient("user-service")` 里写的是什么？
一句话结论：写的是「服务名」而不是 IP 地址，真正地址由注册中心 + 负载均衡在运行时动态解析。
一句话原因：这样才能做到 user-service 扩缩容、换机器时，order-service 一行代码都不用改。
:::

### 6. 服务拆分原则

微服务的第一道坎不是技术，而是「怎么拆」。拆得不好，微服务反而比单体更难维护。几条常用原则：

| 原则 | 说明 |
| --- | --- |
| **单一职责** | 一个服务只做一件事，按业务域（订单、用户、商品）拆分，而不是按技术层拆 |
| **高内聚低耦合** | 变化频率一致的功能放一起，服务间尽量少依赖 |
| **数据隔离** | 每个服务有自己的数据库，服务间不直接连别人的库（避免分布式事务的根源之一） |
| **合理粒度** | 一开始别拆太细，服务太少没意义、太多则运维爆炸，先粗后细逐步演进 |
| **避免循环依赖** | A 调 B、B 又调 A 是坏味道，尽量让依赖单向 |

一句话总结拆分哲学：**拆分的目的是「让团队能独立交付、让服务能独立扩展」，如果拆完反而需要频繁联调、互相等发布，就说明拆错了。**

## 高级篇

### 7. 服务注册与发现（深入）

服务注册与发现是整个微服务架构的「基石」，没有它，后面的调用、负载均衡、网关全都无从谈起。详细机制和配置见 [Nacos](/learn_backend/java/微服务/Nacos)，这里讲通用原理。

#### 7.1 为什么不能写死地址

在没有注册中心的世界里，order-service 调用 user-service 只能把地址写死在配置里：

```yaml
user-service:
  url: http://192.168.1.100:8081   # 写死 IP 和端口
```

一旦 user-service 扩容加了一台机器、或者做了迁移换了 IP，order-service 的配置就要跟着改，还要重启。服务几十上百个时，这种「硬编码地址」会变成维护灾难。

注册中心要解决的就是这个「**地址动态感知**」的问题。

#### 7.2 三个核心动作

一个注册中心本质上就是「**数据存储 + 健康检查 + 变更通知**」三件事的组合：

```
① 注册（Register）：服务启动时上报「服务名 + IP + 端口 + 元数据」
② 心跳（Heartbeat）：服务定时上报，证明自己还活着
③ 发现（Discovery）：调用方拉取服务实例列表，并本地缓存
```

| 动作 | 发起方 | 频率（Nacos 为例） | 作用 |
| --- | --- | --- | --- |
| 注册 | 服务提供者 | 启动时 | 把自己的地址登记进注册中心 |
| 心跳 | 服务提供者 | 每 5 秒一次 | 续约，证明实例存活 |
| 服务发现 | 服务消费者 | 启动时拉取 + 定时同步 | 拿到可用的实例列表 |
| 剔除 | 注册中心 | 心跳超时（15s 不健康，30s 剔除） | 摘掉挂掉的实例 |

#### 7.3 完整的注册发现时序

```
 服务提供者            注册中心            服务消费者
     │                   │                   │
     │── ①注册(服务名+IP)──▶│                   │
     │── ②心跳(每5s) ─────▶│                   │
     │                   │                   │
     │                   │◀── ③拉取服务列表 ────│
     │                   │── 返回实例列表 ─────▶│
     │                   │                   │
     │                   │── ④实例变化推送 ────▶│  (列表更新)
     │                   │                   │
     │◀──────────── ⑤调用（选一个实例发起请求）──────────│
```

#### 7.4 关键设计：本地缓存

这是微服务高可用非常重要的一环，也是面试高频点：

> **消费者会把服务列表缓存在本地**，即使注册中心短暂不可用，已缓存的列表仍能支撑调用，只是感知不到「新上线的实例」和「新下线的实例」。

为什么要这样设计？因为注册中心是调用链路上的一个「查询点」，如果每次调用都实时去注册中心查列表，注册中心一挂整个系统就瘫痪。本地缓存让「**注册中心的可用性**」和「**业务调用的可用性**」解耦了。

### 8. 服务调用与负载均衡

服务发现了「有哪些实例可用」，但一次调用只能选一个实例，这就轮到**负载均衡**登场。详细调用方式见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)。

#### 8.1 从服务名到真实地址

一次 Feign 调用的完整解析过程：

```
@FeignClient("user-service")
      │
      ▼
1. 拿到服务名 "user-service"
      │
      ▼
2. 去注册中心查询实例列表
   [192.168.1.100:8081, 192.168.1.101:8081, 192.168.1.102:8081]
      │
      ▼
3. 负载均衡器按策略选一个实例
   例如选到 192.168.1.101:8081
      │
      ▼
4. 把 http://user-service/user/1 替换成 http://192.168.1.101:8081/user/1
      │
      ▼
5. 发起真正的 HTTP 请求
```

#### 8.2 负载均衡的两种形式

| 形式 | 位置 | 说明 |
| --- | --- | --- |
| 客户端负载均衡 | 服务消费者内部 | Feign + LoadBalancer，消费者自己选实例，无额外网络跳转 |
| 服务端负载均衡 | 网关 / Nginx | 请求先到一个统一入口，由它转发到下游，多一跳 |

Spring Cloud 里，Feign 集成的负载均衡属于**客户端负载均衡**：每个消费者自己维护一份实例列表，自己选，不经过中间转发节点。

#### 8.3 常用负载均衡算法（表格总览）

| 算法 | 核心思想 | 适用场景 |
| --- | --- | --- |
| 轮询 RoundRobin | 依次轮流分配 | 各实例性能一致 |
| 随机 Random | 随机挑一个 | 简单，分布均匀 |
| 加权轮询 WeightedRoundRobin | 按权重比例分配 | 实例性能不一致 |
| 加权随机 WeightedRandom | 按权重随机 | 实例性能不一致 |
| 最少连接 LeastConnection | 挑当前连接数最少的 | 长连接、耗时不一的请求 |
| 一致性哈希 ConsistentHash | 同一 key 固定落到同一实例 | 有会话亲和、缓存命中需求 |

具体算法的源码级原理，放在 [原理篇](#13-负载均衡算法的源码级原理) 详细展开。

::: tip 💡 面试题：客户端负载均衡和服务端负载均衡有什么区别？
一句话结论：客户端负载均衡是「调用方自己选实例」，服务端负载均衡是「统一入口帮你转发」。
一句话原因：客户端负载均衡少一次网络跳转、更灵活，但每个调用方都要集成负载均衡逻辑；服务端负载均衡集中管理、对调用方透明，但多一跳、入口有单点风险。
:::

### 9. 配置中心（深入）

#### 9.1 配置管理的问题

微服务化之后，服务数量成倍增长，配置管理出现几个痛点：

1. **配置分散**：几十个服务的配置散落在各自的 `application.yml` 里，改一个全局配置（如数据库地址）要改几十处。
2. **改配置要重启**：本地配置写死在 jar 里，改一处就要重新打包部署。
3. **环境管理混乱**：dev / test / prod 三套配置容易搞混，甚至把测试配置发到生产。
4. **敏感信息暴露**：数据库密码等敏感配置跟代码一起进仓库，有泄露风险。

#### 9.2 配置中心解决什么

配置中心把配置从「本地文件」上移到「中心服务」，实现：

| 能力 | 说明 |
| --- | --- |
| 集中管理 | 所有服务配置统一存放、统一查看 |
| 动态刷新 | 改配置后推送到服务，**不用重启** |
| 环境隔离 | Namespace 区分 dev / test / prod |
| 版本管理 | 配置可回滚、可追溯变更历史 |
| 权限审计 | 谁能改、改了什么，有记录 |

Nacos 作为配置中心的详细用法（DataId / Group / Namespace、`@RefreshScope` 动态刷新）见 [Nacos](/learn_backend/java/微服务/Nacos)。

### 10. 熔断、降级、限流（深入）

熔断、降级、限流是三个常被混为一谈的概念，先把它们分清：

| 概念 | 触发时机 | 动作 | 目的 |
| --- | --- | --- | --- |
| **熔断** | 某依赖服务持续失败，达到阈值 | 熔断器打开，快速失败不再调它 | 保护自己，防止资源被耗尽 |
| **降级** | 某功能不可用或系统压力大 | 返回兜底数据（如「服务繁忙」） | 保住核心链路，牺牲次要功能 |
| **限流** | 请求量超过阈值 | 拒绝或排队多余请求 | 保护系统不被突发流量打垮 |

一句话区分：**限流是「主动挡在外面」，熔断是「失败多了就切断」，降级是「实在不行给个兜底」**。三者常配合使用，详细配置见 [Sentinel](/learn_backend/java/微服务/Sentinel)。

#### 10.1 服务雪崩是怎么发生的

熔断要解决的核心问题是「**服务雪崩**」。看一个逐步恶化的过程：

```
第 1 步：service D 挂了（比如数据库慢查询拖垮了 D）

   A → B → C → D ✗（挂了）
              ↘
第 2 步：C 调 D 的请求得不到响应，线程一直等待，占着不释放
   C 的线程池很快被打满

第 3 步：B 调 C 也开始超时，B 的线程也耗尽
   B 也开始拖慢、报错

第 4 步：A 调 B 也超时……
   最终整条链路全部不可用 —— 这就是「雪崩」
```

根本原因：**一个服务的故障，通过「线程等待」这个机制，逐级向上游传导**。上游服务把有限的线程资源耗在等待一个已经挂掉的下游上，最后自己也扛不住。

#### 10.2 熔断器怎么挡住雪崩

熔断器（Circuit Breaker）在调用方和下游之间加了一道「开关」，当下游持续失败时，直接切断调用，**快速失败**而不是傻等：

```
        ┌─────────────┐
 调用 ─▶ │  熔断器      │ ──▶ 下游服务
        │ (状态机)     │
        └─────────────┘
   正常时放行；失败多了直接拒绝，不调下游
```

熔断器的状态机在 [原理篇](#14-熔断器状态机原理) 用图详细展开。

### 11. API 网关

网关是所有外部请求的**统一入口**。它解决的是一组「横切关注点」问题——鉴权、限流、日志、跨域这些每个服务都要做一遍的重复逻辑，上收到一个地方统一处理。详细用法见 [Gateway](/learn_backend/java/微服务/Gateway)。

#### 11.1 为什么需要网关

| 没有网关的问题 | 网关如何解决 |
| --- | --- |
| 客户端要记住每个服务的地址 | 客户端只对一个入口 |
| 鉴权、限流等逻辑每个服务重复写 | 统一在网关做一次 |
| 请求可能经过多个服务，日志难追踪 | 网关统一记录入口日志 |
| 前端跨域问题每个服务各配一套 | 网关统一处理跨域 |

#### 11.2 网关与 Nginx 的分工

这是面试常被追问的点：

| 维度 | Gateway | Nginx |
| --- | --- | --- |
| 定位 | 应用层 API 网关 | 高性能反向代理 / Web 服务器 |
| 核心能力 | 业务级路由（按路径/头/参数）、统一鉴权、限流 | 流量转发、静态资源、四层/七层负载均衡 |
| 技术栈 | Java + WebFlux | C 语言，性能更强 |
| 典型位置 | 最外层 Nginx 之后、微服务之前 | 整个系统的最外层入口 |

实际项目中两者常配合：**Nginx 在最外层做流量接入和静态资源，Gateway 在内部做业务级路由和鉴权**。详见 [Gateway](/learn_backend/java/微服务/Gateway) 和 [Nginx](/learn_backend/java/微服务/Nginx)。

### 12. 分布式事务

单体应用里，多个表操作可以用数据库本地事务（`@Transactional`）保证 ACID。但拆成微服务后，一个业务可能跨多个服务、多个数据库，本地事务就管不住了。详细方案见 [Seata](/learn_backend/java/微服务/Seata) 和 [分布式基础](/learn_backend/java/微服务/分布式基础)。

#### 12.1 经典场景：下单扣库存

```
下单操作 = ① 创建订单（order-service，订单库）
         + ② 扣减库存（stock-service，库存库）

如果 ① 成功、② 失败：
  订单已创建，但库存没扣 → 数据不一致

本地事务管不住，因为两个操作在不同的服务、不同的数据库里。
```

#### 12.2 主流方案对比

| 方案 | 一致性 | 性能 | 侵入性 | 典型实现 |
| --- | --- | --- | --- | --- |
| 2PC（两阶段提交） | 强一致 | 差（同步阻塞） | 低 | XA 事务 |
| TCC（Try-Confirm-Cancel） | 强一致 | 中 | 高（业务要写三个方法） | Seata TCC |
| 消息最终一致性 | 最终一致 | 好 | 中 | RocketMQ 事务消息 |
| 本地消息表 | 最终一致 | 好 | 中 | 本地表 + 定时补偿 |
| AT 模式（Seata） | 最终一致 | 中 | 低（数据源代理自动回滚） | Seata AT |

一句话结论：**互联网业务大多容忍短暂不一致，选「最终一致」方案换高并发**，强一致的 2PC 因其阻塞和单点问题很少在核心链路上用。

### 13. 链路追踪

#### 13.1 为什么需要链路追踪

一个请求在微服务里可能横跨十几个服务：

```
用户下单请求
  → Gateway → order-service → user-service → user-db
                          ↘ stock-service → stock-db
                          ↘ 发送 MQ → 消息服务
```

一旦某个环节变慢或报错，**在海量的日志里定位是哪一跳出了问题**非常困难。链路追踪就是给这次请求分配一个**全局唯一 ID**，让它在所有服务间透传，把所有调用串联成一条完整的「调用链」。

#### 13.2 核心概念

| 概念 | 含义 |
| --- | --- |
| TraceId | 一次请求的全局唯一标识，贯穿整个调用链 |
| SpanId | 调用链上每一跳的标识，记录这一跳的开始、结束、耗时 |
| ParentSpanId | 上一跳的 SpanId，用于还原父子调用关系 |

#### 13.3 主流实现对比

| 方案 | 特点 | 现状 |
| --- | --- | --- |
| Spring Cloud Sleuth | Spring 官方轻量埋点，常配 Zipkin 展示 | 已进入维护模式，逐步被 Micrometer Tracing 取代 |
| Zipkin | 轻量链路追踪展示，界面简单 | 适合小规模 |
| SkyWalking | 字节码探针、无侵入、功能全（含 APM） | 国内生产主流 |

一句话结论：**Sleuth 负责「埋点」，Zipkin/SkyWalking 负责「收集和展示」**；新项目更推荐 SkyWalking，因为探针无侵入、功能更全。

### 14. 微服务常见坑与最佳实践

这是把前面所有组件串起来的「实战清单」，面试和落地都很有用：

| 坑 / 问题 | 后果 | 应对 |
| --- | --- | --- |
| 服务间地址硬编码 | 扩缩容要改代码 | 用注册中心 + 服务名调用 |
| 不配超时 | 慢服务拖垮线程池 | Feign 配 `connectTimeout` / `readTimeout` |
| 不做熔断限流 | 一个服务挂，全链路雪崩 | Sentinel 熔断降级 + 网关限流 |
| 同步调用过多 | 链路长、响应慢 | 能异步的用 MQ 解耦 |
| 分布式事务滥用 | 强一致方案拖垮性能 | 优先最终一致，本地事务能解决的不上分布式 |
| 配置写死在代码里 | 改配置要发版 | 上配置中心，动态刷新 |
| 不统一异常处理 | 各服务返回格式五花八门 | 网关统一异常响应结构 |
| 会话存本地 | 多实例间登录态不同步 | 会话集中存 Redis / 用 JWT 无状态 |

::: tip 💡 面试题：微服务里怎么保证接口幂等？
一句话结论：用唯一 token、唯一索引、状态机、Redis `setnx` 等手段，让同一个请求重复执行结果不变。
一句话原因：分布式环境下重试、重复点击、MQ 重复消费都不可避免，不幂等会导致重复扣款、重复下单。
一句话展开：完整方案见 [分布式基础](/learn_backend/java/微服务/分布式基础) 的幂等章节。
:::

## 原理篇

### 15. 服务治理的三大核心机制（深入）

前面高级篇讲了「是什么」，这一节下探到「底层怎么实现」。一个注册中心拆开看，就是三个机制的组合：

#### 15.1 数据存储模型

Nacos 把服务实例按层级组织（详细见 [Nacos](/learn_backend/java/微服务/Nacos)）：

```
Namespace（环境隔离，如 dev / prod）
 └─ Group（分组，默认 DEFAULT_GROUP）
     └─ Service（一个微服务，如 user-service）
         └─ Cluster（集群，如同服务在上海 / 北京机房）
             └─ Instance（具体 IP:Port + 元数据 + 权重）
```

这个层级模型的价值在于：**负载均衡可以做到「优先同集群」**——调用 user-service 时优先选本机房的实例，避免跨机房延迟。

#### 15.2 健康检查机制：临时实例 vs 持久实例

| 维度 | 临时实例（默认） | 持久实例 |
| --- | --- | --- |
| 保活方式 | **客户端主动发心跳** | **服务端主动探测** |
| 心跳协议 | 基于 TCP/HTTP 上报 | Nacos 服务端定时 ping |
| 挂掉后 | 超时自动剔除 | 标记为「不健康」，不剔除 |
| 适用场景 | 普通微服务 | 数据库、中间件等需手动管理的实例 |

为什么两种机制并存？因为普通微服务可以「挂了就自动下线」，但数据库这种核心中间件如果被误判「挂了」而剔除，会导致更严重的问题，所以持久实例只标不健康，由人介入处理。

#### 15.3 变更通知：拉取 vs 推送

注册中心把实例变化告诉消费者，有两种模式：

| 模式 | 机制 | 优缺点 |
| --- | --- | --- |
| 拉取（Pull） | 消费者定时轮询注册中心 | 简单，但有时延、有空轮询开销 |
| 推送（Push） | 注册中心主动推给消费者 | 实时，但需要维护长连接 |
| **长轮询/混合（Nacos 采用）** | 消费者发起长连接挂起，有变化立即返回 | 兼顾实时性和可靠性 |

再叠加前面说的**本地缓存**，就能理解 Nacos 的高可用设计：**即使注册中心集群整体不可用，消费者本地缓存 + 定时同步兜底，调用不中断**。

### 16. CAP 与注册中心的选型

注册中心是一个典型的分布式系统，绕不开 CAP 定理（完整理论见 [分布式基础](/learn_backend/java/微服务/分布式基础)）。

#### 16.1 注册中心对一致性到底有多高要求

关键洞察：**注册中心要的「一致性」其实很弱**。它只需要保证「最终能发现正确的实例列表」，中间短暂的不一致是可以容忍的——最多就是「多调了一次已经下线的实例」或「少发现了一个刚上线的实例」，这两个代价都很小。

但如果注册中心为了「强一致」而牺牲可用性，代价就大了：**注册中心一挂，所有服务的发现都停摆**。两害相权取其轻，注册中心普遍选 AP。

#### 16.2 各注册中心的取舍

| 注册中心 | 一致性模型 | 特点 | 现状 |
| --- | --- | --- | --- |
| Eureka | AP | 保证可用，节点间允许短暂不一致 | 已停止维护 |
| Zookeeper | CP | 强一致，但选举期间整个集群不可用 | 仍有使用 |
| Nacos | AP + CP 可切换 | 默认 AP，持久实例可配 CP | 主流 |

::: tip 💡 面试题：注册中心选 AP 还是 CP？
一句话结论：注册中心选 AP 更合适，因为「暂时读到不存在的服务」比「整个注册中心不可用」影响小得多。
一句话原因：服务列表允许短暂不一致（最多多调一次失败），但注册中心一旦不可用，所有服务将无法发现彼此，属于致命故障。
一句话展开：这也是 Eureka 放弃强一致、Nacos 默认 AP 的根本原因；Nacos 额外支持持久实例走 CP（Raft），兼顾配置中心这类需要强一致的场景。
:::

### 17. 负载均衡算法的源码级原理

这一节把常用的负载均衡算法讲到底层实现，面试常让手写轮询和加权轮询。

#### 17.1 轮询（RoundRobin）

核心是一个**原子计数器**，每次取模递增：

```java
public class RoundRobin {
    private final AtomicInteger counter = new AtomicInteger(0);
    private final List<Server> servers;

    public Server next() {
        // 取模保证 index 在 [0, servers.size) 内循环
        int index = counter.getAndIncrement() % servers.size();
        return servers.get(index);
    }
}
```

- `AtomicInteger` 保证并发安全（多个线程同时选实例，计数器不能重复或跳号）。
- `getAndIncrement()` 先取旧值再自增，配合取模实现「0,1,2,0,1,2…」的循环。

#### 17.2 加权轮询（Nginx 平滑加权算法）

当实例性能不一致时，需要「权重高的被选中的次数更多」。最简单的加权轮询是「按权重展开成列表再轮询」，但会有**权重大的实例连续被选中**的「毛刺」问题。Nginx 的**平滑加权轮询**解决了这个问题：

```java
public class SmoothWeightedRoundRobin {
    // 每个 server 记录：固定权重 weight + 动态权重 currentWeight
    static class WeightedServer {
        Server server;
        int weight;         // 固定权重（配置值）
        int currentWeight;  // 动态权重（每轮变化）
    }

    private final List<WeightedServer> servers;
    private int totalWeight;   // 所有 weight 之和

    public Server next() {
        WeightedServer best = null;
        // 第一步：每个实例 currentWeight += weight，同时找出 currentWeight 最大的
        for (WeightedServer ws : servers) {
            ws.currentWeight += ws.weight;
            if (best == null || ws.currentWeight > best.currentWeight) {
                best = ws;
            }
        }
        // 第二步：被选中的实例 currentWeight 减去 totalWeight（把它「扣下去」）
        best.currentWeight -= totalWeight;
        return best.server;
    }
}
```

以两个实例 A(weight=3)、B(weight=1) 为例，看 currentWeight 的变化（totalWeight=4）：

```
初始：A=0, B=0
第1轮：A=3, B=1 → 选 A → A=3-4=-1   → 结果 A
第2轮：A=2, B=2 → 选 A → A=2-4=-2   → 结果 A
第3轮：A=1, B=3 → 选 B → B=3-4=-1   → 结果 B
第4轮：A=4, B=0 → 选 A → A=0        → 结果 A
4 轮结果：A A B A，A 被选 3 次、B 被选 1 次，且分布均匀（没有 A A A B 的毛刺）
```

#### 17.3 随机（Random）与加权随机

```java
public class WeightedRandom {
    public Server next(List<Server> servers, List<Integer> weights) {
        // 1. 算总权重
        int total = weights.stream().mapToInt(Integer::intValue).sum();
        // 2. 在 [0, total) 取一个随机数
        int offset = ThreadLocalRandom.current().nextInt(total);
        // 3. 遍历，offset 落在哪个区段就选哪个实例
        for (int i = 0; i < servers.size(); i++) {
            offset -= weights.get(i);
            if (offset < 0) {
                return servers.get(i);
            }
        }
        return servers.get(servers.size() - 1);
    }
}
```

#### 17.4 一致性哈希（ConsistentHash）

普通哈希 `key % N` 在节点数 N 变化时，几乎所有 key 的落点都会变（缓存雪崩的根源）。一致性哈希把实例映射到一个「哈希环」上：

```
       0
      / \
  ...   ...
  |   hash环   |
  |           |
  \ ...   ... /
     1024

实例和 key 都算一个 hash 值落到环上
key 顺时针找最近的实例

加一个实例，只影响环上一小段 key 的迁移
```

实现要点（完整细节见 [分布式基础](/learn_backend/java/微服务/分布式基础)）：

```java
// 使用 TreeMap 实现 hash 环：key 是节点 hash 值，value 是实例
TreeMap<Long, Server> ring = new TreeMap<>();

// 每个物理实例挂多个虚拟节点，解决「节点少导致数据倾斜」的问题
for (Server s : servers) {
    for (int i = 0; i < 150; i++) {   // 150 个虚拟节点
        long hash = hash(s.ip + "#" + i);
        ring.put(hash, s);
    }
}

// 找 key 对应的实例：取 >= key.hash 的第一个节点（顺时针最近）
public Server get(String key) {
    long h = hash(key);
    Map.Entry<Long, Server> entry = ring.ceilingEntry(h);
    if (entry == null) {
        entry = ring.firstEntry();   // 超出环末端则回到起点
    }
    return entry.getValue();
}
```

- `ceilingEntry` 返回 hash 值 >= 给定值的最近节点，正好对应「顺时针找最近」。
- **虚拟节点**的作用：物理节点少时，节点在环上分布不均会导致数据倾斜，给每个物理节点挂多个虚拟节点，让分布更均匀。

#### 17.5 最少连接（LeastConnection）

适用于「请求耗时不一」的场景（轮询假设每个请求耗时相同，但实际有的请求要查库、有的只查缓存）：

```java
public Server leastConnection(List<Server> servers) {
    Server best = null;
    int min = Integer.MAX_VALUE;
    for (Server s : servers) {
        // 找当前活跃连接数最小的实例
        int active = s.getActiveConnections();
        if (active < min) {
            min = active;
            best = s;
        }
    }
    return best;
}
```

思想：**把新请求分配给「当前最闲」的实例**，避免某个慢请求霸占一个实例导致后续请求堆积。

### 18. 熔断器状态机原理

熔断器是一个经典的**三态状态机**（以 Hystrix / Sentinel 的通用设计为例）：

```
          ┌──────────────────────────────────────────┐
          │                                          │
          ▼                                          │
     ┌─────────┐   失败数达到阈值    ┌─────────┐       │
     │ CLOSED  │ ───────────────▶  │  OPEN   │       │
     │  关闭    │                   │  打开    │       │
     └─────────┘                   └────┬────┘       │
          ▲                            │            │
          │                            │ 等待熔断时长 │
          │                            ▼            │
          │                      ┌─────────┐        │
          │         放行一个试探请求 │HALF_OPEN│       │
          │                      │  半开    │        │
          │                      └────┬────┘        │
          │               试探成功      │ 试探失败     │
          └────────────────────────────┴────────────┘
```

三个状态的含义和转移条件：

| 状态 | 含义 | 行为 |
| --- | --- | --- |
| **CLOSED（关闭）** | 正常工作 | 请求正常放行，同时统计失败次数 |
| **OPEN（打开）** | 熔断触发 | 直接拒绝请求（快速失败），不调下游 |
| **HALF_OPEN（半开）** | 试探恢复 | 放行少量请求试探下游是否恢复 |

完整的机制流程：

1. **CLOSED 阶段**：请求正常放行，熔断器统计「失败比例 / 失败次数 / 慢调用比例」。当统计值在滑动窗口内超过阈值（如失败率 50%），状态切到 OPEN。
2. **OPEN 阶段**：所有请求被直接拒绝，**不调用下游**，保护下游也保护自己（线程不再被占用等待）。此时开始计时。
3. **经过熔断时长**（如 10 秒）后，状态切到 HALF_OPEN。
4. **HALF_OPEN 阶段**：放行一个（或少量）试探请求：
   - 试探**成功** → 认为下游已恢复，切回 CLOSED；
   - 试探**失败** → 认为下游还没好，切回 OPEN，重新计时。

关键点：**OPEN 阶段「快速失败」**是熔断器保护系统的核心——与其让每个请求都等 5 秒超时，不如立刻返回失败，把线程资源省下来。

::: tip 💡 面试题：熔断器的三个状态分别是什么？
一句话结论：CLOSED（正常放行）、OPEN（快速失败）、HALF_OPEN（试探恢复）。
一句话原因：失败达到阈值从 CLOSED 切 OPEN，熔断时长后从 OPEN 切 HALF_OPEN，试探成功回 CLOSED、失败回 OPEN。
一句话展开：这是防止服务雪崩的核心机制——OPEN 阶段快速失败，避免线程被一个挂掉的下游全部占满。
:::

### 19. 网关的非阻塞原理（WebFlux 线程模型）

Gateway 和老的 Zuul 1.x 最本质的区别在**线程模型**。详细配置见 [Gateway](/learn_backend/java/微服务/Gateway)。

#### 19.1 阻塞模型（Zuul 1.x / Servlet）

```
每个请求占用一个线程，线程从头到尾跟着请求走：

请求1 ──▶ [线程1] ────等待下游响应(阻塞)────▶ 返回
请求2 ──▶ [线程2] ────等待下游响应(阻塞)────▶ 返回
请求3 ──▶ [线程3] ────等待下游响应(阻塞)────▶ 返回
...
线程池 200 个线程 → 最多同时处理 200 个请求
```

问题：**线程数就是并发上限**，且每个线程大部分时间在「等待」下游响应（IO 阻塞），线程资源被严重浪费。

#### 19.2 非阻塞模型（Gateway / WebFlux）

Gateway 基于 **WebFlux + Reactor Netty**，底层是**事件驱动 + 少量线程**：

```
        少数几个事件循环线程（通常 = CPU 核数）
        ┌──────────────────────────────────┐
        │  Event Loop                       │
        │  收到请求 → 注册回调 → 继续处理下个 │
        │  IO 完成 → 触发回调 → 继续处理      │
        └──────────────────────────────────┘
   一个线程可以同时「挂起」成千上万个请求的 IO
```

核心思想：**线程不再傻等 IO**。请求发出后线程立刻去处理别的请求，等 IO 完成时通过事件回调继续处理。因此少量线程就能支撑很高的并发，线程数不再等于并发上限。

| 对比 | 阻塞（Servlet） | 非阻塞（WebFlux） |
| --- | --- | --- |
| 线程模型 | 一请求一线程 | 少量事件循环线程 |
| 并发能力 | 受线程池大小限制 | 高并发，线程开销小 |
| 资源消耗 | 线程上下文切换开销大 | 资源占用低 |
| 适用 | CPU 密集、同步逻辑简单 | IO 密集、高并发网关 |

一句话结论：**网关是高 IO 密集场景，天然适合非阻塞模型**，所以 Gateway 用 WebFlux 而非传统 Servlet。

### 20. Feign 的动态代理调用链

OpenFeign 的核心机制，是**JDK 动态代理**。完整用法见 [OpenFeign](/learn_backend/java/微服务/OpenFeign)，这里讲底层流程：

```
启动阶段（@EnableFeignClients）：
  1. 扫描所有标注 @FeignClient 的接口
  2. FeignClientFactoryBean 为每个接口生成代理对象（Proxy.newProxyInstance）
  3. 代理对象注册进 Spring 容器，可被 @Autowired 注入

调用阶段（userClient.getUserById(1L)）：
  4. 方法调用被 InvocationHandler.invoke() 拦截
  5. 解析接口方法上的注解（@GetMapping("/user/{id}") + @PathVariable）
  6. 组装出完整的 HTTP 请求（方法、路径、参数、请求头）
  7. 用服务名 "user-service" 去注册中心查实例列表
  8. 负载均衡选出一个真实实例，替换成 http://真实IP:端口/user/1
  9. 交给底层 Client 发出 HTTP 请求
 10. 拿到 JSON 响应，反序列化成方法返回值 User 对象
```

一句话理解：**接口是「说明书」，代理对象是「执行者」**，真正发 HTTP 请求的动作都发生在动态代理的 `invoke` 方法里。这也是为什么 `@FeignClient` 接口里不能写实现——因为实现是运行时动态生成的。

### 21. 配置动态刷新的原理

Nacos 配置中心能做到「改配置不重启」，背后的机制是 **`@RefreshScope` + 事件通知**。详细见 [Nacos](/learn_backend/java/微服务/Nacos)。

```
1. 应用启动时，从 Nacos 拉取远程配置，和本地配置合并
2. 标注 @RefreshScope 的 Bean 进入「可刷新」作用域（代理包装）
3. Nacos 上配置发生变化 → Nacos 推送变更事件给应用
4. 应用收到事件 → 触发 RefreshEvent
5. Spring 重建所有 @RefreshScope 的 Bean，读取新配置值
6. 下一次访问该 Bean，就是拿到新配置后的实例
```

关键点：**`@RefreshScope` 让 Bean 变成「可重建」的代理**。它本质是把 Bean 放进一个自定义作用域里，作用域销毁重建时，Bean 会重新从 `@Value` / 配置源读取最新值。这也是为什么只有标了 `@RefreshScope` 的 Bean 才会刷新——没标的 Bean 是单例，创建后不再重新读配置。

### 22. Spring Cloud 与 Dubbo 的区别

这是面试的「经典对比题」，本质是「HTTP 微服务治理体系」和「RPC 框架」的对比：

| 维度 | Spring Cloud | Dubbo |
| --- | --- | --- |
| 定位 | 完整的微服务治理全家桶 | 专注高性能 RPC 调用 |
| 生态 | 覆盖网关、配置、熔断、追踪 | 其它能力需拼第三方 |
| 通信协议 | HTTP / REST（文本、通用） | TCP + 私有二进制协议（更高效） |
| 调用风格 | 声明式 Feign，贴近 REST | 接口级 RPC，贴近本地方法 |
| 性能 | 较低（HTTP 开销 + JSON 序列化） | 较高（二进制序列化 + 长连接） |
| 跨语言 | 好（HTTP 通用） | 一般（协议私有） |
| 适用场景 | HTTP 场景、异构系统、云原生 | 内部高并发 RPC 调用 |

一句话记忆：**Spring Cloud 胜在生态全，Dubbo 胜在 RPC 性能强**，实际项目常二者结合——对外的 HTTP 接口走 Spring Cloud，内部的高并发调用走 Dubbo。

### 23. 微服务架构设计原则

把整篇文章的理论收敛成几条「军规」，面试答「怎么做微服务设计」时可以直接套用：

| 原则 | 一句话 |
| --- | --- |
| 单一职责 | 一个服务一个业务域，不做「万能服务」 |
| 数据自治 | 每个服务拥有自己的数据库，服务间只通过 API 通信 |
| 去中心化 | 无 ESB 中心总线，服务直接点对点通信 |
| 面向失败设计 | 默认「服务一定会挂」，用熔断、降级、重试、超时兜底 |
| 可观测 | 日志、指标、链路追踪三件套齐全 |
| 自动化运维 | 独立部署的前提是 CI/CD、容器化、监控自动化 |
| 演进式拆分 | 先单体后微服务，按需逐步拆分，不一步到位 |

这些原则背后都对应前面讲过的具体组件：面向失败设计对应 Sentinel，可观测对应链路追踪，去中心化对应注册中心 + 点对点调用。

## 面试常问

1. **Spring Cloud 是什么？** 一套基于 Spring Boot 的微服务治理组件集合，解决注册发现、远程调用、配置、熔断、网关、事务、追踪等共性问题。它不是单一框架，而是「接口规范 + 多种实现」的生态。

2. **Spring Cloud 和 Spring Boot 的区别？** Boot 负责快速构建单个应用（自动装配、内嵌容器），Cloud 依赖 Boot 并负责多个服务之间的治理。一句话：Boot 造好一辆车，Cloud 管好一个车队。

3. **常用组件有哪些，各解决什么问题？** Nacos 做注册发现 + 配置中心，OpenFeign 做声明式远程调用，Gateway 做统一网关，Sentinel 做熔断限流降级，Seata 做分布式事务，SkyWalking 做链路追踪。

4. **注册中心的作用和原理？** 服务启动时注册「服务名 + 地址」，定时心跳保活，调用方拉取实例列表做负载均衡并本地缓存。核心是「数据存储 + 健康检查 + 变更通知」三件事。

5. **注册中心选 AP 还是 CP，为什么？** 选 AP。因为服务列表允许短暂不一致（最多多调一次失败），但注册中心不可用会导致所有服务无法发现彼此。Nacos 默认 AP，持久实例可切 CP。

6. **熔断器是怎么工作的？** 三态状态机：失败达阈值从 CLOSED 切 OPEN（快速失败），熔断时长后切 HALF_OPEN（放试探请求），试探成功回 CLOSED、失败回 OPEN。作用是防止服务雪崩。

7. **客户端负载均衡有哪些算法？** 轮询、随机、加权轮询（平滑加权）、加权随机、最少连接、一致性哈希。加权轮询解决性能不均，一致性哈希解决扩缩容时缓存大规模失效。

8. **Spring Cloud 和 Dubbo 怎么选？** 要完整生态、HTTP 场景、异构系统选 Spring Cloud；要高性能内部 RPC 选 Dubbo。二者可组合：对外 HTTP 用 Cloud，对内高并发用 Dubbo。

## 相关知识

- [Nacos](/learn_backend/java/微服务/Nacos) —— 注册中心 + 配置中心的详细用法
- [OpenFeign](/learn_backend/java/微服务/OpenFeign) —— 声明式远程调用的完整配置
- [Gateway](/learn_backend/java/微服务/Gateway) —— 网关路由、断言、过滤器
- [Sentinel](/learn_backend/java/微服务/Sentinel) —— 熔断、降级、限流
- [Seata](/learn_backend/java/微服务/Seata) —— 分布式事务的 AT / TCC 模式
- [RocketMQ](/learn_backend/java/微服务/RocketMQ) —— 消息驱动的异步解耦
- [分布式基础](/learn_backend/java/微服务/分布式基础) —— CAP / BASE / 分布式 ID / 分布式锁 / 幂等
- [Nginx](/learn_backend/java/微服务/Nginx) —— 最外层流量入口与反向代理
- [JVM](/learn_backend/java/Java核心/JVM) —— 线程、内存模型等底层基础
- [并发编程](/learn_backend/java/Java核心/并发编程) —— 负载均衡、熔断器中的并发基础
