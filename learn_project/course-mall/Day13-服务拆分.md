# Day 13 · 服务拆分

> **今天目标**：把 Day01～Day12 的模块化单体真正拆成独立进程，先完成 `mall-user` 和 `mall-course` 的独立启动、数据边界与 Nacos 注册。Day15 再用 OpenFeign 替代原来的 Java 模块直接调用。

本日项目根目录统一为 `E:\CourseMall`。启动类和配置分别放在对应模块的
`src\main\java`、`src\main\resources`，不再依赖 `mall-user` 扫描业务模块。

## 一、前置条件

- 已完成 **Day 1–12（阶段一）**：已有 6 个 Maven 模块，但它们共享一个 Spring 容器，只有 `mall-user` 是启动模块。

| 模块 | 服务名 | 端口 | 职责（对应 Day） |
|---|---|---|---|
| `mall-common` | - | - | 公共模块：Result / ErrorCode / 全局异常（Day01） |
| `mall-user` | mall-user | 8080 | 用户、登录鉴权、验证码（Day03/04/05） |
| `mall-course` | mall-course | 8081 | 课程 CRUD、分类、缓存、文件（今天先拆） |
| `mall-order` | mall-order | 8082 | 订单、状态机（Day15 完成远程依赖后再启动） |
| `mall-stock` | mall-stock | 8083 | 库存扣减、乐观锁（Day15 再启动） |
| `mall-payment` | mall-payment | 8084 | 支付、回调幂等（Day15/23 继续改造） |

- **JDK 17+、Maven 3.8+**（Day01 已确认）

> ⚠️ 今天只要求 `mall-user:8080` 和 `mall-course:8081` 独立运行。不要在一天里强行启动所有服务：订单、库存和支付仍有本地 Mapper 依赖，在 Day15 改成远程调用前不能假装已完成微服务拆分。

## 二、先想清楚：阶段一明明已经「拆了」，今天还拆什么？

回看阶段一：Day06 建了 `mall-course`、Day10 建了 `mall-order`、Day11 建了 `mall-stock`、Day12 建了 `mall-payment`。它们是**模块**，不是独立应用：

| 现象 | 说明 | 后果 |
|---|---|---|
| 只有一个启动类 | 所有 Bean 在同一个 Spring 容器 | 不能独立部署/扩容 |
| Java 直接依赖 | order 直接注入 course/stock Mapper | 一旦拆进程就无法注入 |
| 共享事务与 SecurityContext | 本地调用可共享线程上下文 | HTTP 调用后不再自动传播 |

所以今天先做两件事：建立真实的进程边界，再用 Nacos 完成注册/发现。远程调用、身份传播和分布式事务会分别在 Day15、Day16 和 Day23 处理。

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
        <spring-cloud-alibaba.version>2023.0.1.0</spring-cloud-alibaba.version>
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

> 本课程锁定 **Spring Boot 3.2.5 + Spring Cloud 2023.0.1 + Spring Cloud Alibaba 2023.0.1.0**，与官方 2023.x 版本映射保持一致。不要只单独升级 Nacos/Sentinel starter；升级时必须重新核对三套版本矩阵。

::: tip 💡 面试题：BOM（`scope=import` 的 pom 依赖）和普通依赖有什么区别？
**一句话**：BOM 是一张「版本清单」，只声明各组件用哪个版本、**不真正引入任何 jar**；子模块要用 Nacos 时只写 `groupId:artifactId` 不写版本号，版本由这张清单统一锁定。好处是十几个子模块不会各写各的版本，升级时改父工程一处、全部生效。详见 [Maven](/learn_backend/java/基础/Maven)。
:::

### 步骤 2.5：先建立真实服务边界

`mall-course` 从普通 jar 变为独立应用，要同时做四件事：

1. 新增 `MallCourseApplication`、`spring-boot-maven-plugin`、MySQL 驱动和自己的 `application.yml`。
2. `mall-user` 删除对 `mall-course` 的 Maven 依赖，否则仍会把课程 Bean 打进用户服务。
3. 两个服务可以暂时连同一个 MySQL 实例，但只能访问自己拥有的表。本日起禁止跨服务 Mapper/表直接调用。
4. 工程只共享稳定的基础类（`Result`、`ErrorCode`等）；不把 Course Entity 搬到 `mall-common`。

```java
package com.mall.course;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

@EnableMethodSecurity
@MapperScan("com.mall.course.mapper")
@SpringBootApplication(scanBasePackages = "com.mall")
public class MallCourseApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallCourseApplication.class, args);
    }
}
```

`scanBasePackages = "com.mall"` 是为了扫到 `mall-common` 的异常处理等 Bean，不代表可以依赖其他业务服务。`@MapperScan` 只扫本服务 Mapper，防止跨边界误注入。

```yaml
server:
  port: 8081

spring:
  application:
    name: mall-course
  datasource:
    url: ${COURSE_DB_URL:jdbc:mysql://127.0.0.1:3306/course_mall}
    username: ${COURSE_DB_USERNAME:root}
    password: ${COURSE_DB_PASSWORD}
```

::: warning 拆分后 SecurityContext 不会跨 HTTP 传播
Day04 的 `Authentication` 只存在 `mall-user` 当前请求线程。`mall-course` 成为独立进程后，它不会自动拿到当前用户。Day16 会让网关保留 `Authorization` 头，每个业务服务仍独立验证 JWT 并构造自己的 `SecurityContext`，这样 `@PreAuthorize` 才真正有效。不能只相信可被客户端伪造的 `X-User-Id`。
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
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api")
@Profile("dev")
public class DiscoveryController {

    // DiscoveryClient 是 Spring Cloud 对「服务发现」的统一抽象：
    // 不管底层是 Nacos / Eureka / Consul，代码都这么写，换注册中心不用改业务代码
    private final DiscoveryClient discoveryClient;

    // 构造器注入：和 Day06 一样，字段不可变 + 便于单测（Spring 官方推荐，优于 @Autowired 字段注入）
    public DiscoveryController(DiscoveryClient discoveryClient) {
        this.discoveryClient = discoveryClient;
    }

    @GetMapping("/discovery")
    @PreAuthorize("hasRole('ADMIN')")
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

`/api/discovery` 会暴露服务名和内网地址，所以只在 `dev` 环境存在，且只允许管理员访问。

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

> 课程接口继续使用 Day06 定义的 `/api/courses/**` 和 `/api/admin/courses/**`。注册中心不改变业务 URL。

### 步骤 5：为后续服务预留端口，今天不强行启动

`mall-order`、`mall-stock`、`mall-payment` 的端口预留为 8082/8083/8084。但它们当前仍存在跨模块 Mapper 调用，不能只加启动类就宣称拆分完成。Day15 将按以下顺序改造：

1. 定义内部 API DTO，不共享 Entity。
2. 用 OpenFeign 替代跨领域 Mapper 注入。
3. 删除业务模块之间的 Maven 依赖。
4. 再加启动类、独立配置和 Nacos discovery。

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
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:8080/api/discovery

# ② 独立 mall-course 的公开课程接口照常工作（Day06 真实 DB）
curl http://localhost:8081/api/courses/1
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

③ 打开 Nacos 控制台 `http://localhost:8848/nacos` → 左侧「服务管理 → 服务列表」，能看到 `mall-user`、`mall-course`，每个服务健康实例数 ≥ 1。

::: tip 💡 面试题：服务注册上去后，Nacos 怎么知道它还「活着」？
**一句话**：Nacos 2.x/3.x Java 客户端主要通过 gRPC 长连接维护临时实例生命周期；兼容 HTTP 心跳模式时才使用心跳间隔、不健康超时和删除超时参数。`5s/15s/30s` 是常见默认值，不是所有版本和协议都固定不变。详见 [Nacos](/learn_backend/java/微服务/Nacos)。
:::

::: tip 💡 面试题：Nacos 是 AP 还是 CP？注册中心选型怎么考虑？
**一句话**：Nacos 不能简化成“它就是 AP”。临时服务使用面向 AP 的 Distro 路径，持久服务使用 CP 持久化路径；服务类型不同，一致性选择也不同。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

::: tip 💡 面试题：服务拆开了，数据库要不要跟着拆？
**一句话**：服务可以在学习阶段暂时使用同一个 MySQL 实例，但必须有明确表归属，禁止跨服务直接查改对方的表。成熟后再拆 schema/数据库；跨服务数据通过 API 或事件获取。详见 [分布式基础](/learn_backend/java/微服务/分布式基础)。
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
- [ ] 带管理员 Token 调 `/api/discovery` 能列出 `mall-user` 和 `mall-course`：是 / 否
- [ ] `curl /api/courses/1` 返回种子数据第 1 门课：是 / 否
- [ ] Nacos 控制台能看到两个服务、实例健康：是 / 否
- [ ] `mall-user` 已删除对 `mall-course` 的 Maven 依赖：是 / 否
- [ ] 踩坑记录（Nacos 起不来、注册不上、端口冲突、gRPC 端口被拦等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 阶段一明明已经把课程、订单拆成了独立模块，为什么今天才叫「服务拆分」？「模块拆开」和「微服务」之间差了什么？
2. `DiscoveryClient` 是 Nacos 的类还是 Spring Cloud 的抽象？面向它编程，换注册中心（比如换 Eureka）为什么不用改业务代码？
3. `@EnableDiscoveryClient` 为什么新版可以不加？背后是 Spring 的什么机制？（提示：自动装配 + 条件装配）
4. Nacos 2.x 的 gRPC 长连接和旧 HTTP 心跳模式有什么区别？为什么不能把 5s/15s/30s 当成固定规则？
5. Nacos 临时服务和持久服务分别使用什么一致性路径？
