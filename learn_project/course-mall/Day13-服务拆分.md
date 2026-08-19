# Day 13 · 服务拆分

> **今天目标**：把阶段一拆开的各个模块从「各跑各的孤岛」变成「互相认识的微服务」——引入 Nacos 注册中心，让 `mall-user`、`mall-course` 注册上去，跑通服务发现。

## 一、前置条件

- 已完成 **Day 1–12（阶段一）**：目前工程里已有 6 个模块：

| 模块 | 服务名 | 端口 | 职责（对应 Day） |
|---|---|---|---|
| `mall-common` | - | - | 公共模块：Result / ErrorCode / 全局异常（Day01） |
| `mall-user` | mall-user | 8080 | 用户、登录鉴权、验证码（Day03/04/05） |
| `mall-course` | mall-course | 8081 | 课程 CRUD、分类、缓存、文件（Day06/07/08/09） |
| `mall-order` | mall-order | 8082 | 订单、状态机（Day10） |
| `mall-stock` | mall-stock | ? | 库存扣减、乐观锁（Day11） |
| `mall-payment` | mall-payment | ? | 支付、回调幂等（Day12） |

- **JDK 17+、Maven 3.8+**（Day01 已确认）

> ⚠️ **动手前先核对一件事：端口不能撞。** Day10~12 的文档里，`mall-order`、`mall-stock`、`mall-payment` 三个服务都写了 `8082`——同一台机器三个进程不能占用同一个端口，后起的会报 `Port already in use`。今天接入 Nacos 前，先把它们错开（建议 order 8082、stock 8083、payment 8084），改各自 `application.yml` 的 `server.port` 即可。**这本身就是注册中心存在的意义之一：端口/IP 不再写死在调用方代码里，随便换。**

## 二、先想清楚：阶段一明明已经「拆了」，今天还拆什么？

回看阶段一：Day06 建了 `mall-course`、Day10 建了 `mall-order`、Day11 建了 `mall-stock`、Day12 建了 `mall-payment`——**代码层面早就按业务领域拆成了一个个独立应用**。但注意，这只是「拆了」，还不是「微服务」：

| 现象 | 说明 | 后果 |
|---|---|---|
| 模块各起各的 | 每个模块独立打包、独立启动 | 谁也不知道还有哪些服务在跑 |
| 互相调用靠写死地址 | 没有远程调用框架，真要调只能写 `http://localhost:8082/...` | 端口一改、一扩容，调用方全炸 |
| 没有全局视图 | 起没起、健康不健康，只能一个个 curl | 排障靠猜 |

所以今天要补的是拆分后**第一个、也是最关键的一块拼图：注册中心 + 服务发现**。服务启动时把自己的地址「报上去」（**注册**），调用方按服务名去注册中心「查地址」（**发现**）。今天只做注册 + 发现；真正按服务名远程调用，Day15 用 OpenFeign 做。

::: tip 💡 面试题：为什么要把单体拆成微服务？模块拆开了就等于微服务吗？
**一句话**：拆是为了**故障隔离、独立部署、按需扩容、技术解耦**；但「代码分成多个 jar」只解决了物理隔离，服务间怎么发现对方、怎么远程调用、怎么容错都没解决——**只有加上注册中心、远程调用、熔断限流这些治理组件，才叫微服务**，否则只是「多个互不认识的单体」。详见 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)。
:::

::: tip 💡 面试题：注册中心解决了什么问题？没有它服务怎么调用？
**一句话**：解决**服务注册与发现**——服务启动时把 IP:端口上报给注册中心（注册），调用方按服务名从注册表查到实例列表（发现）。没有它只能把地址写死在代码/配置里，服务一扩容、一重启、一换机器就全部失效。详见 [Nacos](/learn_backend/java/微服务/Nacos)。
:::

## 三、步骤

### 步骤 1：启动 Nacos Server（注册中心）

Nacos 官方下载（选 `nacos-server-2.3.2.zip`，不是源码包）：

- 下载地址：https://github.com/alibaba/nacos/releases
- 解压到本地，比如 `E:\nacos\`

进入 `bin` 目录，**单机模式**启动（学习阶段用单机，别用集群）：

```bash
# Windows
E:\nacos\bin\startup.cmd -m standalone

# macOS / Linux
sh startup.sh -m standalone
```

启动成功后访问控制台：`http://localhost:8848/nacos`，默认账号密码都是 `nacos`。

> ⚠️ 常见坑：Nacos 2.x 除了 8848（HTTP），还用了 **9848、9849 两个 gRPC 端口**（8848+1000、+1001）做客户端心跳和长连接。如果服务能起但注册不上，先检查这两个端口有没有被防火墙拦；云服务器要在安全组里放行 8848/9848/9849。

### 步骤 2：父 `pom.xml` 引入 Spring Cloud / Alibaba 的 BOM

打开 `E:\course-mall\pom.xml`。**重点一：`<modules>` 一个都不能少**（Day10~12 各文档贴的 pom 片段不全，以这份为准）；**重点二：`<dependencyManagement>` 里加两个 BOM**，之后子模块引 Nacos/Sentinel/Seata 都不用写版本号。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/>
    </parent>

    <groupId>com.mall</groupId>
    <artifactId>course-mall</artifactId>
    <version>1.0.0</version>
    <packaging>pom</packaging>

    <modules>
        <module>mall-common</module>
        <module>mall-user</module>
        <module>mall-course</module>
        <module>mall-order</module>
        <module>mall-stock</module>
        <module>mall-payment</module>
    </modules>

    <properties>
        <java.version>17</java.version>
        <!-- 版本统一放 properties 里，改一处全局生效 -->
        <spring-cloud.version>2023.0.1</spring-cloud.version>
        <spring-cloud-alibaba.version>2023.0.1.2</spring-cloud-alibaba.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <!-- 自己的公共模块 -->
            <dependency>
                <groupId>com.mall</groupId>
                <artifactId>mall-common</artifactId>
                <version>${project.version}</version>
            </dependency>

            <!-- Spring Cloud BOM：统一 nacos-discovery 等 Spring Cloud 组件的版本 -->
            <dependency>
                <groupId>org.springframework.cloud</groupId>
                <artifactId>spring-cloud-dependencies</artifactId>
                <version>${spring-cloud.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>

            <!-- Spring Cloud Alibaba BOM：统一 Nacos/Sentinel/Seata 等 Alibaba 组件的版本 -->
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

> 版本对应关系（面试常问）：**Spring Boot 3.2.x ↔ Spring Cloud 2023.0.x ↔ Spring Cloud Alibaba 2023.0.1.x**。三者的版本必须配套，否则会出现「class not found / 方法找不到」这类诡异启动报错。

::: tip 💡 面试题：BOM（`scope=import` 的 pom 依赖）和普通依赖有什么区别？
**一句话**：BOM 是一张「版本清单」，只声明各组件用哪个版本、**不真正引入任何 jar**；子模块要用 Nacos 时只写 `groupId:artifactId` 不写版本号，版本由这张清单统一锁定。好处是十几个子模块不会各写各的版本，升级时改父工程一处、全部生效。详见 [Maven](/learn_backend/java/基础/Maven)。
:::

### 步骤 3：`mall-user` 接入 Nacos 注册 + 加「服务发现」接口

**3.1 `mall-user/pom.xml`** 的 `<dependencies>` 里新增（其余依赖不动）：

```xml
<!-- Nacos 服务注册与发现：启动时自动把本服务注册到 Nacos（版本由父 BOM 管，所以不写） -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
```

**3.2 `mall-user/src/main/resources/application.yml`**：在原有的 `spring:` 下加这一段（datasource、redis、mybatis-plus 等已有配置**全部保留**）：

```yaml
spring:
  application:
    name: mall-user          # 注册到 Nacos 的服务名，服务发现时按这个名字找
  # ↓↓↓ 今天新增：Nacos 注册中心配置 ↓↓↓
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848   # Nacos 地址（默认 namespace=public、group=DEFAULT_GROUP，Day14 再细讲）
```

**3.3 新增「服务发现」接口 `DiscoveryController.java`（`com/mall/user/controller/DiscoveryController.java`）：**

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import org.springframework.cloud.client.ServiceInstance;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api")
public class DiscoveryController {

    // DiscoveryClient 是 Spring Cloud 对「服务发现」的统一抽象：
    // 不管底层是 Nacos / Eureka / Consul，代码都这么写，换注册中心不用改业务代码
    private final DiscoveryClient discoveryClient;

    // 构造器注入：和 Day06 一样，字段不可变 + 便于单测（Spring 官方推荐，优于 @Autowired 字段注入）
    public DiscoveryController(DiscoveryClient discoveryClient) {
        this.discoveryClient = discoveryClient;
    }

    @GetMapping("/discovery")
    public Result<List<String>> discovery() {
        List<String> result = new ArrayList<>();
        // getServices()：拿到注册中心里所有已注册的服务名
        for (String serviceId : discoveryClient.getServices()) {
            // getInstances(serviceId)：拿到该服务的所有实例（IP:端口），扩容后这里会是多个
            for (ServiceInstance instance : discoveryClient.getInstances(serviceId)) {
                result.add(serviceId + " -> " + instance.getHost() + ":" + instance.getPort());
            }
        }
        return Result.ok(result);
    }
}
```

::: tip 💡 面试题：`@EnableDiscoveryClient` 一定要加吗？为什么新版可以不加？
**一句话**：老版本（Spring Cloud 2020 之前）必须显式加 `@EnableDiscoveryClient` 才开启注册；Spring Cloud 2020+ 之后，引入了 `nacos-discovery` 依赖，自动装配就默认开启了注册，**不用手动加**（加了也没坏处）。这就是「约定优于配置」。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

::: tip 💡 面试题：`DiscoveryClient` 是 Nacos 的类吗？为什么不直接用 Nacos 的 API？
**一句话**：`DiscoveryClient` 是 Spring Cloud 定义的**接口抽象**（`getServices()` / `getInstances()`），Nacos、Eureka、Consul 各自提供实现。业务代码面向接口编程，**换注册中心只换依赖、不改一行业务代码**——这就是「面向接口编程」在微服务里的落地。详见 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)。
:::

### 步骤 4：`mall-course` 也接入 Nacos 注册

拆分是双向的：用户服务要能发现课程服务，两个都得注册。

**4.1 `mall-course/pom.xml`** 的 `<dependencies>` 里加同样的依赖：

```xml
<!-- Nacos 服务注册与发现（版本由父 BOM 管） -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
```

**4.2 `mall-course/src/main/resources/application.yml`**：同样在 `spring:` 下加注册中心配置（datasource 等已有配置保留）：

```yaml
spring:
  application:
    name: mall-course        # 服务名：Day15 的 @FeignClient(name = "mall-course") 用的就是它
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
```

> 课程接口不用动——Day06 写的 `/api/course/{id}`、`/api/course/page` 等全部保留原样。注册中心只是「多了一条自己上报地址的通道」，不侵入业务代码。

### 步骤 5：其余三个服务（order / stock / payment）顺带接入

`mall-order`、`mall-stock`、`mall-payment` 用**同一套两行改动**，今天一并接上（Day15 起它们互相调用时直接可用）：

1. 各自的 `pom.xml` 加 `spring-cloud-starter-alibaba-nacos-discovery`
2. 各自的 `application.yml` 在 `spring:` 下加：

```yaml
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
```

3. **先解决端口冲突**（见开头警告）：建议 order 8082、stock 8083、payment 8084，改各自的 `server.port`。

> 今天只要求 user + course 两个服务启动验证；order/stock/payment 接入后能正常启动、在 Nacos 控制台能看到即可。

### 步骤 6：启动验证

先整体编译（让父 BOM 生效、`mall-common` 进本地仓库）：

```bash
# 在 E:\course-mall\ 根目录
mvn clean install -DskipTests
```

然后开**两个终端**分别启动两个服务：

```bash
# 终端 1：用户服务
mvn -pl mall-user spring-boot:run

# 终端 2：课程服务
mvn -pl mall-course spring-boot:run
```

验证三个点：

```bash
# ① 服务发现：从 mall-user 能列出已注册的所有服务及实例地址
curl http://localhost:8080/api/discovery

# ② 拆进 mall-course 的课程接口照常工作（Day06 的接口，走真实 DB）
curl http://localhost:8081/api/course/1
```

预期 `①` 返回（能看到自己，说明**服务发现生效**）：

```json
{
  "code": 200,
  "message": "success",
  "data": [
    "mall-user -> 192.168.x.x:8080",
    "mall-course -> 192.168.x.x:8081"
  ]
}
```

预期 `②` 返回（Day02 种子数据里的第 1 门课，证明拆分后业务没坏）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "title": "Java 高并发实战",
    "price": 199.00
  }
}
```

③ 打开 Nacos 控制台 `http://localhost:8848/nacos` → 左侧「服务管理 → 服务列表」，能看到 `mall-user`、`mall-course`（以及接入成功的 order/stock/payment），每个服务健康实例数 ≥ 1。

::: tip 💡 面试题：服务注册上去后，Nacos 怎么知道它还「活着」？
**一句话**：客户端每隔 **5 秒**发一次心跳；Nacos **15 秒**没收到心跳就标记为「不健康」，**30 秒**没收到就从注册表摘除。所以服务宕机后，别的服务最多 30 秒内就不会再拿到它的地址。详见 [Nacos](/learn_backend/java/微服务/Nacos)。
:::

::: tip 💡 面试题：Nacos 是 AP 还是 CP？注册中心选型怎么考虑？
**一句话**：Nacos **默认实例（临时实例）是 AP**（可用性优先，注册表总能查到，但短暂可能不一致），也支持持久实例走 CP。Zookeeper 是 CP、Eureka 是 AP。注册中心场景**宁可短暂拿到稍旧的列表，也不能查不到服务**，所以优先 AP 的组件——这也是 Nacos/Eureka 比 Zookeeper 更适合做注册中心的原因。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

::: tip 💡 面试题：服务拆开了，数据库要不要跟着拆？
**一句话**：拆服务最忌讳的是**多个服务共享一张表**（order 服务直接 update course 表）——那等于把服务通过数据库又耦合回去了。正规做法是**每个服务有自己的库/表，数据归自己私有**，别的服务要数据只能调它的接口（Day15 OpenFeign 就这么干），做不到才考虑数据同步方案。本系列 Day15 之前各模块都连同一个库，Day15 起会用「走接口」替代「直接查表」。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| Nacos 注册中心、服务注册与发现、心跳、AP/CP | [Nacos](/learn_backend/java/微服务/Nacos) |
| 微服务拆分原则、DiscoveryClient 抽象 | [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) |
| CAP 理论、注册中心选型、数据库拆分 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| Maven BOM 依赖管理、多模块聚合 | [Maven](/learn_backend/java/基础/Maven) |
| 自动装配（`@EnableDiscoveryClient` 可不写）、构造器注入 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] Nacos Server 启动成功，控制台能登录：是 / 否
- [ ] 父 pom 6 个模块齐全 + 两个 BOM 生效，`mvn clean install` 不报错：是 / 否
- [ ] `curl /api/discovery` 能列出 `mall-user` 和 `mall-course` 及实例地址：是 / 否
- [ ] `curl /api/course/1` 返回种子数据第 1 门课：是 / 否
- [ ] Nacos 控制台能看到两个服务、实例健康：是 / 否
- [ ] order/stock/payment 端口已错开并接入 Nacos：是 / 否
- [ ] 踩坑记录（Nacos 起不来、注册不上、端口冲突、gRPC 端口被拦等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 阶段一明明已经把课程、订单拆成了独立模块，为什么今天才叫「服务拆分」？「模块拆开」和「微服务」之间差了什么？
2. `DiscoveryClient` 是 Nacos 的类还是 Spring Cloud 的抽象？面向它编程，换注册中心（比如换 Eureka）为什么不用改业务代码？
3. `@EnableDiscoveryClient` 为什么新版可以不加？背后是 Spring 的什么机制？（提示：自动装配 + 条件装配）
4. Nacos 怎么判断一个实例「健康/下线」？5s / 15s / 30s 三个时间分别指什么？服务宕机后多久别的服务拿不到它？
5. Nacos 是 AP 还是 CP？注册中心为什么通常选 AP 的组件？（提示：对比 Zookeeper，并想想这对 Day15 OpenFeign 负载均衡意味着什么）
