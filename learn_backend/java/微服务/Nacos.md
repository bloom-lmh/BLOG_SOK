# Nacos

> 一句话定位：Nacos（**Na**ming and **Co**nfiguration **S**ervice）是阿里巴巴开源、后捐献给 Apache 基金会的「注册中心 + 配置中心」二合一微服务基础组件，用一套组件同时解决微服务架构里「服务之间如何互相发现地址」和「配置如何集中管理、动态刷新」两大问题。

---

## 基础篇

### 1. 背景：微服务架构的两大痛点

单体应用拆成微服务后，立刻冒出两个绕不开的问题：

1. **服务发现难**：订单服务要调用用户服务，用户服务的 IP 和端口会随着「扩容、缩容、重启、机器故障」不断变化。如果还在代码里写死地址，一旦实例变动就全部失效。我们需要一个「电话簿」，让调用方随时能查到对方最新的地址。
2. **配置分散难**：几十上百个服务，每个都有一堆配置（数据库地址、开关、超时时间）。散落在各服务本地，改一个配置要改 N 个服务、重启 N 次，还容易改错。

Nacos 就是为解决这两个痛点而生的一体化组件：

| 能力 | 解决的问题 | 对标老方案 |
| --- | --- | --- |
| 服务注册与发现（Naming） | 服务实例自动注册、调用方自动感知地址变化 | 替代 Eureka、Zookeeper、Consul |
| 配置管理（Configuration） | 配置集中存放、动态下发、无需重启生效 | 替代 Spring Cloud Config、Apollo |
| 服务健康检查 | 自动剔除不健康实例 | 内置于注册中心 |

一句话总结：**Nacos 一个组件顶「注册中心 + 配置中心」两个组件**，这是它和 Eureka / Zookeeper 最大的区别——后两者只做注册发现，配置还得再上一套 Config。

::: tip 💡 面试题：Nacos 和 Eureka 最本质的区别是什么？
一句话结论：Nacos 是「注册中心 + 配置中心」二合一，且同时支持 AP 和 CP 两种一致性模型，而 Eureka 只做注册发现、只有 AP。
一句话原因：Nacos 名字（Naming and Configuration Service）直接点明它同时管「命名」和「配置」，一套组件覆盖了 Eureka + Config 的职责。展开说，Eureka 只有 AP 模式、自我保护机制还会保留已下线的服务；Nacos 临时实例走 AP、持久实例和配置走 CP（Raft），一致性和可用性可以按场景切换，这是架构选型时的关键差异。
:::

### 2. Nacos 核心能力全景

一个 Nacos Server 对外同时提供两类能力：

```
                        ┌─────────────────────────────┐
                        │          Nacos Server       │
                        │      (端口 8848 / 9848)      │
                        └──────────────┬──────────────┘
                                       │
              ┌────────────────────────┴────────────────────────┐
              │                                                 │
      ┌───────▼────────┐                                ┌───────▼────────┐
      │  Naming 服务    │                                │  Config 服务   │
      │  (服务注册发现)  │                                │   (配置管理)    │
      └───────┬────────┘                                └───────┬────────┘
              │                                                 │
   ┌──────────┼──────────┐                          ┌──────────┼──────────┐
   │          │          │                          │          │          │
注册实例   心跳保活   服务发现                       发布配置   监听变更   历史回滚
(Register) (Beat)   (Subscribe)                    (Publish) (Listener) (History)
```

- **服务注册发现**：服务启动时把 `服务名 + IP + 端口 + 元数据` 上报，调用方实时拿到可用的实例列表。
- **配置管理**：配置统一放在 Nacos，应用启动时拉取、运行中监听变更，改配置不用重启。
- **分级管理模型**：Namespace（环境隔离）→ Group（业务分组）→ Service / DataId（具体服务 / 配置）。

### 3. Nacos 的组成与架构

Nacos 的完整体系分三块：

| 组件 | 说明 |
| --- | --- |
| Nacos Server | 部署在独立服务器上的服务端，保存注册表与配置数据，可集群部署 |
| Nacos Client | 集成在业务应用里的客户端（`nacos-client`），负责注册、心跳、拉取配置 |
| 存储层 | 内嵌 Derby（默认，单机）+ 可选外部 MySQL（集群/生产必备） |

生产环境的标准拓扑：

```
        ┌───────────┐  ┌───────────┐  ┌───────────┐
        │  Nacos-1  │  │  Nacos-2  │  │  Nacos-3  │   ← 集群，Raft 选主 + Distro 同步
        └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
              └────────┬─────┴────────┬─────┘
                       │              │
                  ┌────▼──────────────▼────┐
                  │      MySQL (持久层)     │   ← 集群模式下数据落库
                  └─────────────────────────┘
```

> 单机模式默认用内嵌 Derby 存储，数据放在 `nacos/data` 目录；**集群模式必须配外部 MySQL**，否则各节点数据不一致。

### 4. 环境搭建与部署

#### 4.1 下载与启动（单机）

```bash
# 1. 下载（以 2.x 为例，1.x 用法类似）
#    https://github.com/alibaba/nacos/releases

# 2. 解压后进入目录，单机模式启动
#    Linux / Mac
sh startup.sh -m standalone
#    Windows
startup.cmd -m standalone

# 3. 访问控制台（默认账号密码都是 nacos）
#    http://localhost:8848/nacos
```

启动后，浏览器打开 `http://localhost:8848/nacos`，用 `nacos / nacos` 登录，就能看到控制台的「服务管理」「配置管理」两个主菜单。

#### 4.2 集群部署要点

生产环境用 `cluster.conf` 配置节点列表，并把数据源切到 MySQL：

```properties
# conf/application.properties
spring.datasource.platform=mysql
db.num=1
db.url.0=jdbc:mysql://127.0.0.1:3306/nacos_config?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai
db.user=root
db.password=123456
```

启动脚本去掉 `-m standalone`，就是集群模式；再用 Nginx 对 `8848` 端口做反向代理，让客户端统一从 VIP 接入。

#### 4.3 端口说明（2.x 必记）

| 端口 | 用途 | 说明 |
| --- | --- | --- |
| 8848 | 主端口 | HTTP 控制台 + 1.x 通信 |
| 9848 | 客户端 gRPC | `8848 + 1000`，客户端长连接 |
| 9849 | 服务端 gRPC | 集群节点间通信 |

::: tip 💡 面试题：Nacos 2.x 为什么比 1.x 多出 9848 / 9849 两个端口？
一句话结论：2.x 把通信方式从「HTTP + UDP 推送」升级成了 gRPC 长连接，9848 给客户端连、9849 给集群节点互连。
一句话原因：gRPC 基于 HTTP/2 支持双向流和长连接，服务端能主动推数据，避免了 1.x 用 UDP 推送不可靠、HTTP 短连接开销大的问题。这也顺便解决了 1.x 客户端需要开放随机 UDP 端口才能收到推送的痛点。
:::

### 5. 快速接入：注册中心 + 配置中心

#### 5.1 引入依赖

配合 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) 和 [Spring Boot](/learn_backend/java/基础/Spring Boot) 使用：

```xml
<!-- Spring Cloud Alibaba 依赖管理 -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-alibaba-dependencies</artifactId>
            <version>2021.0.5.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<dependencies>
    <!-- 注册中心客户端 -->
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
    </dependency>
    <!-- 配置中心客户端 -->
    <dependency>
        <groupId>com.alibaba.cloud</groupId>
        <artifactId>spring-cloud-starter-alibaba-nacos-config</artifactId>
    </dependency>
    <!-- Spring Boot 2.4+ 移除了 bootstrap 默认加载，需显式引入 -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-bootstrap</artifactId>
    </dependency>
</dependencies>
```

> 为什么额外引入 `spring-cloud-starter-bootstrap`？因为 Spring Boot 2.4 之后默认不再加载 `bootstrap.yml`，而 Nacos 配置中心的地址必须「先于应用配置」拿到，所以要把它拉回来，或者在 `application.yml` 里用 `spring.config.import` 代替。

#### 5.2 注册中心配置

```yaml
# application.yml
server:
  port: 8081

spring:
  application:
    name: order-service        # 服务名 = 注册中心的唯一标识，必须全局唯一
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848   # Nacos 服务端地址，集群用逗号分隔
```

启动类加 `@EnableDiscoveryClient`（新版 Spring Cloud 通常可以省略，加了更明确）：

```java
@SpringBootApplication
@EnableDiscoveryClient   // 开启服务注册发现，新版可省略但建议显式声明
public class OrderApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderApplication.class, args);
    }
}
```

启动后到 Nacos 控制台「服务管理 → 服务列表」，就能看到 `order-service`，实例数 1。

#### 5.3 配置中心配置

```yaml
# bootstrap.yml：必须在应用启动最早期就加载，所以放 bootstrap 而不是 application
spring:
  application:
    name: order-service          # 决定默认 DataId 的前缀
  profiles:
    active: dev                  # 决定 DataId 中间的环境段
  cloud:
    nacos:
      config:
        server-addr: localhost:8848
        namespace: public        # 命名空间 ID，默认 public
        group: DEFAULT_GROUP     # 分组，默认 DEFAULT_GROUP
        file-extension: yaml     # 配置格式，支持 yaml/yml/properties/json
```

配置中心完整的「启动加载顺序」为：`bootstrap.yml → bootstrap.properties → application.yml → application.properties → Nacos 远程配置`，前面的先加载、后面的覆盖前面的同名项。

### 6. 配置中心三大核心概念：Namespace / Group / DataId

Nacos 用三级模型来唯一定位一份配置，从粗到细：

| 概念 | 作用 | 默认值 | 类比 |
| --- | --- | --- | --- |
| Namespace | 环境隔离，不同命名空间配置完全独立 | `public` | 完全独立的一个「房间」 |
| Group | 业务分组，同一命名空间内按业务再分类 | `DEFAULT_GROUP` | 房间里的「抽屉」 |
| DataId | 定位具体一份配置 | 由规则拼接 | 抽屉里的「文件」 |

```
Namespace（环境隔离）
 └─ Group（业务分组，默认 DEFAULT_GROUP）
     └─ DataId（一份具体配置，如 order-service-dev.yaml）
```

**DataId 拼接规则**（Nacos 客户端自动拼）：

```
${prefix}-${spring.profiles.active}.${file-extension}
   │             │                      │
   │             │                      └─ 配置格式：yaml / properties
   │             └─ 当前环境：dev / test / prod，为空时省略整个中段
   └─ 前缀：默认取 spring.application.name，可被 spring.cloud.nacos.config.prefix 覆盖
```

举例：

| 场景 | spring.application.name | profiles.active | file-extension | 最终 DataId |
| --- | --- | --- | --- | --- |
| 带环境 | order-service | dev | yaml | `order-service-dev.yaml` |
| 无环境 | order-service | (空) | yaml | `order-service.yaml` |
| 自定义前缀 | 无 | prod | properties | `my-config-prod.properties` |

::: tip 💡 面试题：Namespace、Group、DataId 分别管什么？为什么需要三层？
一句话结论：Namespace 做环境隔离、Group 做业务分组、DataId 定位具体一份配置，三层从粗到细逐级定位。
一句话原因：生产、测试、开发如果共用一套配置中心，就必须用 Namespace 做到「彻底隔离」，否则测试环境改个配置可能污染线上。Group 则用来在同一个环境内按「订单域 / 用户域」分组，DataId 才具体到某服务某环境的一份文件，三级协作既隔离又灵活。
:::

### 7. 配置管理 OpenAPI 与常见操作

Nacos 提供了完整的 HTTP OpenAPI，运维脚本和灰度发布都靠它。常用接口：

| 接口路径 | 方法 | 作用 |
| --- | --- | --- |
| `/nacos/v1/cs/configs` | POST | 发布配置 |
| `/nacos/v1/cs/configs` | GET | 获取配置 |
| `/nacos/v1/cs/configs` | DELETE | 删除配置 |
| `/nacos/v1/cs/configs/listener` | POST | 监听配置变更（长轮询） |
| `/nacos/v1/cs/history` | GET | 查询配置历史版本 |
| `/nacos/v1/cs/history/previous` | GET | 回滚到上一个版本 |

发布配置示例：

```bash
curl -X POST "http://localhost:8848/nacos/v1/cs/configs" \
  -d "dataId=order-service-dev.yaml" \
  -d "group=DEFAULT_GROUP" \
  -d "content=server.port: 8081" \
  -d "type=yaml"
```

获取配置示例：

```bash
curl "http://localhost:8848/nacos/v1/cs/configs?dataId=order-service-dev.yaml&group=DEFAULT_GROUP"
```

### 8. 注册中心 OpenAPI

| 接口路径 | 方法 | 作用 |
| --- | --- | --- |
| `/nacos/v1/ns/instance` | POST | 注册实例 |
| `/nacos/v1/ns/instance/beat` | PUT | 发送心跳 |
| `/nacos/v1/ns/instance/list` | GET | 查询实例列表 |
| `/nacos/v1/ns/instance` | PUT | 修改实例（如调权重） |
| `/nacos/v1/ns/instance` | DELETE | 注销实例 |
| `/nacos/v1/ns/service/list` | GET | 查询服务列表 |

注册一个实例示例：

```bash
curl -X POST "http://localhost:8848/nacos/v1/ns/instance" \
  -d "serviceName=order-service" \
  -d "ip=192.168.1.10" \
  -d "port=8081"
```

### 9. 基础篇小结

- Nacos = **注册中心 + 配置中心** 二合一，一套组件解决「服务发现」和「配置管理」两个问题。
- 三大核心概念：**Namespace（环境）→ Group（分组）→ DataId（配置）**，三级逐级定位。
- 默认端口 **8848**，2.x 新增 **9848（客户端 gRPC）/ 9849（服务端 gRPC）**。
- 集群模式必须配**外部 MySQL**；单机模式内嵌 Derby。
- 配置中心地址必须写在 **bootstrap.yml**（先于应用配置加载）。
- DataId 拼接规则：`${prefix}-${profile}.${file-extension}`。

---

## 高级篇

### 1. 服务实例的分级存储模型

Nacos 服务端的注册表不是一张平铺的表，而是按层级组织的树状结构：

```
Namespace（环境，如 public / dev / prod）
 └─ Group（分组，默认 DEFAULT_GROUP）
     └─ Service（一个微服务，如 order-service）
         └─ Cluster（集群，同一服务可按机房/地域再分，如 SH / BJ）
             └─ Instance（具体实例，IP:Port + 权重 + 元数据 + 健康状态）
```

这五级每一层都有实际用途：

| 层级 | 用途 | 典型场景 |
| --- | --- | --- |
| Namespace | 环境隔离 | dev / test / prod 数据互不可见 |
| Group | 业务分组 | 同一环境按业务域划分 |
| Service | 服务维度 | 一个微服务的所有实例 |
| Cluster | 就近访问 | 同机房优先，避免跨地域调用 |
| Instance | 具体节点 | 真正承载流量的 IP:Port |

**Cluster（集群）的核心作用**：让调用方「优先调同集群的实例」。比如用户服务在上海和北京各部署一组，订单服务在上海，调用时优先选上海的实例，避免跨机房网络延迟。这就是「就近访问 / 同集群优先」的实现基础，配合负载均衡规则使用。

配置一个实例归属到某集群：

```yaml
spring:
  cloud:
    nacos:
      discovery:
        cluster-name: SH   # 该实例所属集群名，负载均衡可据此做同集群优先
```

### 2. 临时实例 vs 持久实例（重点）

这是 Nacos 区别于 Eureka/Zookeeper 的核心设计，也是高频面试点。

| 维度 | 临时实例（Ephemeral） | 持久实例（Persistent） |
| --- | --- | --- |
| 保活方式 | 客户端主动发心跳 | Nacos 服务端主动探测 |
| 心跳协议 | HTTP / gRPC 心跳 | TCP / HTTP 主动探测 |
| 挂了之后 | 超时**自动剔除** | 标记**不健康**，不剔除 |
| 一致性模型 | AP（最终一致，Distro） | CP（强一致，Raft） |
| 适用场景 | 普通业务微服务（默认） | 数据库、中间件等核心组件 |
| 数据存储 | 主要在内存 | 落盘 + 内存 |

```yaml
spring:
  cloud:
    nacos:
      discovery:
        ephemeral: true   # true=临时实例(默认)，false=持久实例
```

为什么这样设计？理解背后的取舍：

- **临时实例**追求「可用性优先」。微服务经常弹性扩缩容、故障漂移，实例挂了就应该尽快从列表里摘掉，否则调用方会把流量打到死节点。用「客户端心跳 + 超时剔除」最简单可靠，即使短暂误判也比「一直留着死节点」强。
- **持久实例**追求「稳定性优先」。数据库这类组件是有状态、需要人工介入的，不能因为网络抖动一次探测失败就把它从列表删掉——否则调用方直接找不到数据库。所以挂了只标记「不健康」，由运维决定是否下线。

::: tip 💡 面试题：Nacos 临时实例和持久实例有什么区别？
一句话结论：临时实例靠客户端心跳、超时自动剔除；持久实例靠服务端探测、异常只标记不健康不剔除。
一句话原因：临时实例对应「无状态、可随时替换」的普通微服务，追求可用性；持久实例对应「有状态、不能误删」的核心组件，追求稳定性。更深一层，两者还映射到不同的一致性模型——临时实例走 AP（Distro 协议），持久实例走 CP（Raft 协议）。
:::

### 3. 权重（weight）与优雅下线

#### 3.1 权重

- 权重范围 **0 ~ 1**，值越大，被客户端负载均衡选中的概率越高。
- 常用于**灰度发布**：新版本实例先把权重调小，只放 5% 流量验证，稳定后再逐步调大。
- 可通过控制台或 OpenAPI 动态调整，无需重启实例。

```bash
# 把某实例权重调成 0.2（只承接约 20% 流量）
curl -X PUT "http://localhost:8848/nacos/v1/ns/instance" \
  -d "serviceName=order-service" \
  -d "ip=192.168.1.10" \
  -d "port=8081" \
  -d "weight=0.2"
```

#### 3.2 优雅下线

目标：**「下线即丢请求」→「下线不丢一个请求」**。标准做法：

1. 先把实例权重调成 **0**，让它不再接收新请求；
2. 等已在处理的请求自然处理完（配合服务端优雅停机 `server.shutdown=graceful`）；
3. 再从注册中心注销该实例，完成下线。

这样就避免了「直接杀进程 → 在途请求失败 → 上游报错」的问题。

```yaml
server:
  shutdown: graceful          # Spring Boot 优雅停机
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s   # 等待在途请求处理完的最长时间
```

### 4. 配置动态刷新：@RefreshScope 深入

配置中心最大的价值就是「改配置不用重启」。Nacos 动态刷新的完整链路：

```
改 Nacos 配置
   │
   ▼
Nacos Server 推送变更（gRPC 长连接 / 长轮询）
   │
   ▼
客户端 ConfigService 收到变更
   │
   ▼
发布 RefreshEvent 事件
   │
   ▼
@RefreshScope 标记的 Bean 被销毁并重新创建（重新读 @Value / @ConfigurationProperties）
```

#### 4.1 使用 @Value + @RefreshScope

```java
@RestController
@RefreshScope   // 关键：让这个 Bean 进入"可刷新"作用域，配置变更时会被重建
public class ConfigController {

    // 配置变更后，Bean 重建，这个字段重新注入新值
    @Value("${pattern.dateformat:yyyy-MM-dd HH:mm:ss}")
    private String dateformat;

    @GetMapping("/now")
    public String now() {
        // 为什么每次取都能拿到新值？因为 Bean 重建后 dateformat 已经更新了
        return LocalDateTime.now().format(DateTimeFormatter.ofPattern(dateformat));
    }
}
```

#### 4.2 使用 @ConfigurationProperties（更推荐）

对于成组的配置，用 `@ConfigurationProperties` 更规范，也天然支持刷新（配合 `@RefreshScope` 或直接注册为 bean）：

```java
@Component
@ConfigurationProperties(prefix = "pattern")   // 绑定前缀，字段名自动映射
@RefreshScope
public class PatternProperties {
    private String dateformat = "yyyy-MM-dd HH:mm:ss";
    // getter / setter 省略
}
```

```yaml
# Nacos 上的配置内容
pattern:
  dateformat: "yyyy/MM/dd"
```

::: tip 💡 面试题：Nacos 配置动态刷新靠什么注解？原理是什么？
一句话结论：靠 `@RefreshScope` 配合 `@Value` / `@ConfigurationProperties`，配置变更时重建 Bean 读取新值。
一句话原因：`@RefreshScope` 让 Bean 属于「RefreshScope」这个特殊作用域，Spring Cloud 收到 Nacos 推送的变更后会发 RefreshEvent，清空该作用域缓存并重新实例化这些 Bean。核心不是「改字段值」，而是「销毁旧 Bean、新建 Bean、重新注入」，所以必须配合可重新读配置的注入方式使用。
:::

### 5. 配置优先级与多配置文件

#### 5.1 三种配置来源的优先级

在 Nacos 配置中心里，一份配置可以是「主配置」「共享配置」「扩展配置」：

| 类型 | 配置方式 | 用途 | 优先级 |
| --- | --- | --- | --- |
| 主配置 | 自动按 DataId 规则 | 当前服务自己的配置 | 最高 |
| 扩展配置 extension-configs | 显式指定 DataId | 该服务专属的额外配置 | 中 |
| 共享配置 shared-configs | 显式指定 DataId | 多个服务共享的公共配置 | 低 |

加载顺序是 `shared → extension → 主配置`，**后加载的优先级更高**，所以最终生效顺序：主配置 > 扩展配置 > 共享配置。

```yaml
# bootstrap.yml：配置多个来源
spring:
  application:
    name: order-service
  cloud:
    nacos:
      config:
        server-addr: localhost:8848
        file-extension: yaml
        shared-configs:                    # 共享配置（所有服务都能引用，如公共开关）
          - data-id: common.yaml
            group: DEFAULT_GROUP
            refresh: true                  # 是否参与动态刷新
        extension-configs:                 # 扩展配置（本服务专属的补充配置）
          - data-id: order-extra.yaml
            group: DEFAULT_GROUP
            refresh: true
```

#### 5.2 本地配置 vs 远程配置

整体优先级（高 → 低）：

```
命令行参数
  > Nacos 远程配置（主配置 > 扩展 > 共享）
    > 本地 application.yml / properties
      > 本地 bootstrap.yml / properties（仅提供启动所需的最小配置）
```

> 实践中常把「会频繁变动、需要动态刷新」的配置放 Nacos，「几乎不变、启动必需」的（如 Nacos 地址本身）放 bootstrap/本地。

### 6. 配置的历史版本与回滚

配置中心要敢让人改，就必须能「后悔」：

| 操作 | 说明 |
| --- | --- |
| 历史版本 | 每次发布都会存一份历史，可查看任意版本内容 |
| 回滚 | 控制台一键回滚到某个历史版本（本质是重新发布该版本内容） |
| 灰度发布 | 按 IP / 标签把配置先推给部分实例，验证后再全量 |

回滚 OpenAPI：

```bash
# 回滚到上一个版本
curl "http://localhost:8848/nacos/v1/cs/history/previous?dataId=order-service-dev.yaml&group=DEFAULT_GROUP"
```

### 7. 命名空间与权限（RBAC）

- **命名空间**：创建后得到一个唯一 ID（UUID），客户端配置 `namespace` 指向它，实现环境隔离。
- **鉴权**：生产环境务必开启 `nacos.core.auth.enabled=true`，用账号/角色/权限控制谁能改哪些 namespace 的配置，防止误操作污染线上。

```properties
# nacos 服务端 application.properties
nacos.core.auth.enabled=true
nacos.core.auth.system.type=nacos
```

### 8. 客户端常用配置项速查

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `spring.cloud.nacos.discovery.server-addr` | 无 | 服务端地址 |
| `spring.cloud.nacos.discovery.ephemeral` | true | 是否临时实例 |
| `spring.cloud.nacos.discovery.cluster-name` | DEFAULT | 集群名 |
| `spring.cloud.nacos.discovery.weight` | 1 | 实例权重 |
| `spring.cloud.nacos.discovery.namespace` | public | 命名空间 |
| `spring.cloud.nacos.discovery.group` | DEFAULT_GROUP | 分组 |
| `spring.cloud.nacos.config.server-addr` | 无 | 配置中心地址 |
| `spring.cloud.nacos.config.file-extension` | properties | 配置文件格式 |
| `spring.cloud.nacos.config.namespace` | public | 命名空间 |
| `spring.cloud.nacos.config.group` | DEFAULT_GROUP | 分组 |
| `spring.cloud.nacos.config.prefix` | spring.application.name | DataId 前缀 |
| `spring.cloud.nacos.config.shared-configs` | 无 | 共享配置列表 |
| `spring.cloud.nacos.config.extension-configs` | 无 | 扩展配置列表 |

### 9. 与 Spring Cloud 生态的整合

Nacos 在整个 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) 微服务体系中处于「地基」位置，向上支撑其它组件：

```
                     ┌──────────────────────────┐
                     │   Gateway（网关，入口）      │
                     └────────────┬─────────────┘
                                  │ 从 Nacos 发现下游服务
                     ┌────────────▼─────────────┐
                     │   OpenFeign（远程调用）     │ ← 服务名 → 通过 Nacos 解析成 IP:Port
                     └────────────┬─────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
     ┌──────▼──────┐       ┌──────▼──────┐       ┌──────▼──────┐
     │    Nacos     │       │  Sentinel   │       │    Seata    │
     │ 注册+配置中心  │       │ 限流熔断     │       │ 分布式事务   │
     └─────────────┘       └─────────────┘       └─────────────┘
```

- [OpenFeign](/learn_backend/java/微服务/OpenFeign)：通过服务名调用，实际地址由 Nacos 解析 + 负载均衡选出。
- [Gateway](/learn_backend/java/微服务/Gateway)：网关把请求按服务名路由，同样依赖 Nacos 做服务发现。
- [Sentinel](/learn_backend/java/微服务/Sentinel)：限流规则等配置可存到 Nacos，实现规则动态下发。
- [Seata](/learn_backend/java/微服务/Seata)：事务协调器可通过 Nacos 注册发现。

负载均衡默认由 Spring Cloud LoadBalancer 完成（替代了老 Ribbon）：

```java
@Bean
@LoadBalanced   // 让 RestTemplate 支持"服务名 -> 实际地址"，配合 Nacos 服务发现
public RestTemplate restTemplate() {
    return new RestTemplate();
}
```

### 10. 高级篇小结

- 实例按 **Namespace → Group → Service → Cluster → Instance** 五级管理，Cluster 用于同集群就近访问。
- **临时实例走 AP、自动剔除；持久实例走 CP、只标记不健康**，这是 Nacos 最核心的设计取舍。
- 权重 0~1 用于灰度发布；优雅下线 = 权重调 0 → 等在途请求 → 注销。
- 动态刷新靠 `@RefreshScope`，本质是「重建 Bean 重新注入」。
- 配置优先级：主配置 > 扩展配置 > 共享配置；远程 > 本地 application > 本地 bootstrap。

---

## 原理篇

### 1. 注册中心完整工作原理

从「服务启动」到「被调用」，一条完整链路分四步：

```
┌────────────┐  ①注册   ┌──────────────────────────┐
│ 服务提供者  │ ───────► │        Nacos Server       │
│ Provider   │          │   内存注册表(实例列表)       │
└────────────┘          └──────────┬───────────────┘
      │                            │ ②心跳保活(每5s)
      │  ◄───────────────────────  │
      │        ③服务发现(定时拉取+本地缓存)
      │                            │
┌────────────┐  ④变更推送(长连接)   │
│ 服务消费者  │ ◄────────────────── │
│ Consumer   │                     │
└────────────┘                     └──────────────────┘
```

#### 1.1 注册（Register）

服务启动后，`NacosServiceRegistry` 把自身信息上报给 Nacos：

```java
// 客户端注册的本质：向 Server 提交一个 Instance
// 包含：服务名、IP、端口、集群名、权重、元数据、是否临时实例
Instance instance = new Instance();
instance.setServiceName("order-service");
instance.setIp("192.168.1.10");
instance.setPort(8081);
instance.setClusterName("SH");
instance.setWeight(1.0);
instance.setEphemeral(true);   // 临时实例
```

#### 1.2 心跳保活（Beat）

- **临时实例**：客户端主动发心跳，默认**每 5 秒一次**。
- Nacos 服务端 **15 秒**没收到心跳，标记为「不健康」；**30 秒**没收到，直接从注册表**剔除**。

```
时间轴：
0s        5s        10s       15s       30s
│──心跳──│──心跳──│──心跳──│────────│────────│
正常      正常      正常      ↓超时标记   ↓剔除
                            不健康     移除实例
```

这些阈值可配置：`nacos.naming.heart-beat-interval`（心跳间隔）、`nacos.naming.heart-beat-timeout`（不健康超时）、`nacos.naming.ip-delete-timeout`（剔除超时）。

#### 1.3 服务发现（Subscribe）

调用方从 Nacos 拉取实例列表并**本地缓存**，配合负载均衡选出目标实例。关键点：

- 客户端会**定时拉取**兜底（防止推送丢失），同时**接收服务端推送**做到实时更新。
- **本地缓存是可用性的最后保障**：即使 Nacos 集群短暂宕机，客户端还能用本地缓存的实例列表继续调用，只是感知不到新的变化。

#### 1.4 变更通知（Push）

实例列表变化时，服务端主动通知订阅者：

- **1.x**：UDP 推送 + 定时拉取兜底（UDP 不可靠，所以必须靠定时拉取补救）。
- **2.x**：gRPC 双向流长连接推送，可靠且实时。

::: tip 💡 面试题：Nacos 挂了，服务之间还能正常调用吗？
一句话结论：能。调用方本地缓存了实例列表，Nacos 宕机只是感知不到新变化，已缓存的地址依然可用。
一句话原因：Nacos 采用「拉取 + 本地缓存 + 推送」的设计，客户端内存里始终有一份最近一次拉到的实例快照，调用时不依赖实时连 Nacos。这也是注册中心要做的「可用性兜底」——注册中心故障不能反过来把整个调用链拖垮。但要注意：这段时间内新上线的实例调用方是感知不到的。
:::

### 2. 健康检查机制深入

两种实例对应两套健康检查，本质是「谁主动发起探测」的区别：

| 维度 | 临时实例 | 持久实例 |
| --- | --- | --- |
| 发起方 | 客户端 | 服务端 |
| 方式 | 客户端发心跳 | 服务端 TCP / HTTP 探测 |
| 判定 | 超时未收到心跳 → 不健康 → 剔除 | 探测失败 → 不健康（不剔除） |
| 恢复 | 心跳恢复自动重新健康 | 探测成功自动恢复健康 |

持久实例的服务端探测流程：

```
Nacos Server ──探测(TCP连接/HTTP请求)──► 持久实例
     │                                      │
     │         响应正常 ── 标记健康           │
     │         无响应   ── 标记不健康(保留)    │
     ▼                                      ▼
   定时器周期执行                          实例仍在列表，等待人工处理
```

### 3. AP 与 CP：为什么 Nacos 两种模式都能支持

CAP 理论里，分布式系统在「一致性（C）」「可用性（A）」「分区容错（P）」三者中，P 是必须满足的，剩下的 C 和 A 只能二选一权衡。

Nacos 的精妙之处在于**按数据类型切换**：

| 数据类型 | 一致性模型 | 一致性协议 | 取舍理由 |
| --- | --- | --- | --- |
| 临时实例 | AP（最终一致） | 自研 Distro 协议 | 实例变化频繁，可用性优先 |
| 持久实例 | CP（强一致） | Raft 协议 | 核心组件，一致性优先 |
| 配置数据 | CP（强一致） | Raft 协议 | 配置错了影响全站，必须强一致 |

```
                ┌──────────────────────────────┐
                │          Nacos Server         │
                │                              │
                │  临时实例数据 ──► Distro(AP)   │  ← 服务注册发现，容忍短暂不一致
                │                              │
                │  持久实例数据 ──► Raft(CP)     │  ← 核心组件，要强一致
                │  配置数据    ──► Raft(CP)     │  ← 配置要准，要强一致
                └──────────────────────────────┘
```

一句话记忆：**注册发现用 AP 保可用，配置管理用 CP 保一致**。

### 4. Distro 协议（自研 AP 一致性协议）

Distro 是 Nacos 为「临时实例」数据自研的 AP 协议，核心目标：**集群模式下各节点最终一致，同时保证写入高可用、读本地化**。

#### 4.1 核心设计：数据分片

Distro 把服务数据按 `namespace + group + serviceName` 做哈希，分片到不同节点，**每个节点只「负责」一部分服务的全量数据**：

```
服务集合哈希分片：
  order-service ──hash──► 节点 A 负责
  user-service  ──hash──► 节点 B 负责
  pay-service   ──hash──► 节点 C 负责
```

#### 4.2 写流程

```
客户端写请求(注册/心跳/注销)
        │
        ▼
  随机/路由到某节点
        │
        ▼
  该节点判断：这个服务是否由「我」负责？
        │
   ┌────┴────┐
   │ 是      │ 否
   ▼         ▼
本地写入    转发给负责节点
   │              │
   ▼              ▼
异步同步给其它节点    负责节点本地写 + 同步
   │
   ▼
返回客户端成功（无需等其它节点确认，AP 体现）
```

#### 4.3 读流程

读请求直接**读本节点**数据，不跨节点，性能高。因为数据通过异步同步最终会一致，所以读到的可能是「稍旧」的数据——这正是 AP 的「最终一致」体现。

#### 4.4 故障接管

某节点宕机后，其负责的服务数据会被其他节点通过「校验和（checksum）比对」发现差异并接管同步，保证服务数据不丢。

### 5. Raft 协议（CP 一致性协议）

Raft 是 Nacos 用于「持久实例」和「配置数据」的强一致协议。它把一个一致性集群的问题拆成两个子问题：**Leader 选举** 和 **日志复制**。

#### 5.1 角色与选举

每个节点有三种角色：Leader（领导者）、Follower（跟随者）、Candidate（候选者）。

```
        启动时都是 Follower，等待 Leader 心跳
                    │
        心跳超时(随机 150~300ms，避免同时竞选)
                    │
              变成 Candidate，term+1，给自己投票，广播请求投票
                    │
        ┌───────────┴───────────┐
        │ 获得多数票(> N/2)      │ 收到更高 term 的 Leader
        ▼                       ▼
     成为 Leader             退回 Follower
```

#### 5.2 日志复制

```
写请求 ──► Leader 收到写
              │
              ▼
         Leader 把操作追加到本地日志(未提交)
              │
              ▼
         广播 AppendEntries 给所有 Follower
              │
              ▼
         Follower 落盘后回复 ACK
              │
              ▼
         Leader 收到「多数派」ACK（> N/2）
              │
              ▼
         标记提交，返回客户端成功，并通知 Follower 提交
```

关键：**必须多数派（超过一半节点）确认才算提交**，所以集群部署一般是奇数个节点（3/5/7），保证任意少数节点故障集群仍可写。

::: tip 💡 面试题：Nacos 的 AP 和 CP 是怎么做到的？底层用了什么协议？
一句话结论：临时实例用自研 Distro 协议实现 AP，持久实例和配置用 Raft 协议实现 CP。
一句话原因：两类数据对一致性的要求不同——临时实例变化频繁、容忍短暂不一致，用分片 + 异步同步的 Distro 换高可用；配置和持久实例必须强一致，用 Raft 的多数派提交保证。Nacos 把 CAP 的选择权下放到数据类型维度，而不是整个组件统一选一个，这是它比 Eureka（纯 AP）、Zookeeper（纯 CP）更灵活的地方。
:::

### 6. 数据一致性整体架构图

把上面的协议串起来，Nacos 集群的数据流全景：

```
                    ┌───────────────────────────────┐
                    │         客户端 (gRPC)          │
                    └──────────────┬────────────────┘
                                   │
              ┌────────────────────▼────────────────────┐
              │              Nacos Server 集群           │
              │                                         │
              │  ┌───────────────┐   ┌───────────────┐  │
              │  │ 临时实例数据     │   │ 配置/持久实例   │  │
              │  │  ┌─────────┐  │   │  ┌─────────┐  │  │
              │  │  │ Distro  │  │   │  │  Raft   │  │  │
              │  │  │ 分片+异步 │  │   │  │ 选举+复制│  │  │
              │  │  └─────────┘  │   │  └─────────┘  │  │
              │  └───────────────┘   └───────────────┘  │
              │                │                         │
              └────────────────┼─────────────────────────┘
                               │ 落盘
                    ┌──────────▼──────────┐
                    │   MySQL / Derby      │
                    └─────────────────────┘
```

### 7. 配置中心变更推送机制

配置中心「实时生效」的实现也经历了一次演进：

#### 7.1 1.x：HTTP 长轮询（Long Polling）

客户端通过 `/v1/cs/configs/listener` 发起长轮询，服务端**挂起请求约 30 秒**：

```
客户端 ──监听请求──► 服务端
                       │
                 30s 内配置是否变化？
                       │
              ┌────────┴────────┐
              │ 变了            │ 没变
              ▼                ▼
         立即返回新配置      挂满 30s 返回空
              │                │
              └────────┬───────┘
                       ▼
              客户端收到响应后「立刻」再发一次监听请求（周而复始）
```

> 为什么叫「长轮询」而不是「定时轮询」？定时轮询是客户端每 30s 问一次，长轮询是客户端一直挂着等，配置一变服务端立刻返回，延迟更低、请求更少。

#### 7.2 2.x：gRPC 长连接推送

2.x 把「长轮询」升级成 gRPC 双向流，服务端可以**主动 push** 变更，无需客户端反复发起：

```
客户端 ◄══════ gRPC 双向流(长连接) ══════► 服务端
  │                                            │
  │           配置变更 ── push ──►              │
  ▼                                            ▼
收到变更 → 刷新 Bean                      配置发布时主动推送
```

### 8. 源码模块结构

Nacos 源码按职责拆分（`nacos` 项目主要模块）：

| 模块 | 职责 |
| --- | --- |
| `nacos-naming` | 服务注册发现核心 |
| `nacos-config` | 配置管理核心 |
| `nacos-core` | 公共工具、一致性协议（Distro / Raft） |
| `nacos-client` | 客户端 SDK，业务应用引入的就是它 |
| `nacos-console` | 控制台 UI 后端 |
| `nacos-api` | 对外接口定义 |
| `nacos-auth` | 鉴权模块 |
| `nacos-istio` | 对接 Service Mesh（Istio） |

注册中心核心类速查：

| 类 | 作用 |
| --- | --- |
| `ServiceManager` | 服务注册表管理器，内存中维护 Service 及其实例 |
| `DistroProtocol` | Distro 协议入口，处理分片与同步 |
| `RaftCore` / `JRaft` | Raft 一致性实现 |
| `NacosServiceRegistry` | 客户端注册器（Spring Cloud 集成层） |
| `NacosWatch` | 客户端定时拉取 + 监听变更 |

### 9. 原理篇小结

- 注册中心链路：**注册 → 心跳保活 → 服务发现（拉取+缓存）→ 变更推送**。
- 临时实例 **5s 心跳 / 15s 不健康 / 30s 剔除**；持久实例服务端探测、只标不健康。
- **AP（Distro）管临时实例，CP（Raft）管持久实例和配置**，CAP 按数据类型切换。
- Distro = 哈希分片 + 本地读 + 异步同步；Raft = 选举 + 多数派日志复制。
- 配置推送 1.x 用长轮询、2.x 用 gRPC 长连接。
- 客户端**本地缓存**是 Nacos 宕机后服务仍可调用的关键。

---

## 面试常问

### 1. Nacos 是什么？和 Eureka / Zookeeper 的区别？
**结论**：Nacos 是「注册中心 + 配置中心」二合一组件，同时支持 AP/CP；Eureka 只做注册发现且只有 AP，Zookeeper 只做注册发现且只有 CP。
**展开**：Nacos 一个组件覆盖了 Eureka + Config 的职责；一致性上它按数据类型切换——临时实例 AP、持久实例和配置 CP，比 Eureka（纯 AP，自我保护还会留死节点）和 Zookeeper（纯 CP，网络抖动会牺牲可用性）更灵活。

### 2. 临时实例和持久实例的区别？
**结论**：临时实例靠客户端心跳、超时自动剔除；持久实例靠服务端探测、异常只标记不健康不剔除。
**展开**：临时实例映射 AP、用于无状态微服务；持久实例映射 CP、用于数据库等有状态组件。核心是「保活发起方」和「挂了之后是否自动摘除」不同。

### 3. 配置动态刷新的实现原理？
**结论**：`@RefreshScope` + `@Value` / `@ConfigurationProperties`，配置变更时重建 Bean 重新注入。
**展开**：Nacos 通过长轮询（1.x）或 gRPC（2.x）把变更推给客户端，客户端发 RefreshEvent，Spring Cloud 清空 RefreshScope 缓存并重新实例化对应 Bean，本质是「销毁重建」而非「原地改值」。

### 4. Namespace / Group / DataId 的作用？
**结论**：Namespace 做环境隔离，Group 做业务分组，DataId 定位具体一份配置。
**展开**：三者从粗到细逐级定位；生产/测试用不同 Namespace 做到彻底隔离，防止测试改配置污染线上。DataId 默认拼接规则为 `${prefix}-${profile}.${file-extension}`。

### 5. Nacos 挂了，服务还能正常调用吗？
**结论**：能，客户端本地缓存了实例列表，只是感知不到新变化。
**展开**：服务发现采用「拉取 + 本地缓存 + 推送」，调用时读本地缓存不依赖实时连 Nacos；但宕机期间新上线/下线实例无法被感知，所以生产上 Nacos 本身也要集群部署保高可用。

### 6. Nacos 的 AP 和 CP 底层分别用什么协议？
**结论**：AP 用自研 Distro 协议（临时实例），CP 用 Raft 协议（持久实例和配置）。
**展开**：Distro 通过哈希分片 + 异步同步实现最终一致、本地读、高可用；Raft 通过 Leader 选举 + 多数派日志复制实现强一致。Nacos 把 CAP 的选择下沉到数据类型维度，是它区别于其它注册中心的核心设计。

### 7. Nacos 1.x 和 2.x 的通信有什么变化？
**结论**：1.x 用 HTTP + UDP 推送（不可靠需定时拉取兜底），2.x 改为 gRPC 双向流长连接，并新增 9848/9849 端口。
**展开**：gRPC 基于 HTTP/2 支持双向流，服务端能可靠主动推数据，解决了 UDP 推送丢包和客户端需开放随机端口的问题，性能和实时性都更好。

### 8. 什么是「优雅下线」，怎么做？
**结论**：先把实例权重调 0 停止接收新流量，等在途请求处理完再注销，避免下线丢请求。
**展开**：配合 Spring Boot `server.shutdown=graceful` 和 `timeout-per-shutdown-phase`；核心思路是「先摘流量、再停进程」，把下线对调用方的影响降到零。

---

## 延伸阅读

- [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)：Nacos 所在微服务体系的整体框架。
- [OpenFeign](/learn_backend/java/微服务/OpenFeign)：基于 Nacos 服务发现做声明式远程调用。
- [Gateway](/learn_backend/java/微服务/Gateway)：网关如何利用 Nacos 路由到下游服务。
- [Sentinel](/learn_backend/java/微服务/Sentinel)：限流熔断，规则可存 Nacos 动态下发。
- [Seata](/learn_backend/java/微服务/Seata)：分布式事务，事务协调器靠 Nacos 注册发现。
- [分布式基础](/learn_backend/java/微服务/分布式基础)：CAP 理论、一致性模型等前置知识。
- [Spring Boot](/learn_backend/java/基础/Spring Boot)：Nacos 客户端所依赖的启动与配置体系。
- [并发编程](/learn_backend/java/Java核心/并发编程)：理解 Raft/Distro 同步与线程模型的前置知识。
