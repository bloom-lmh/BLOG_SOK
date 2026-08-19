# Spring Boot

> **一句话定位**：Spring Boot 是 Spring 生态的「脚手架」，用**约定优于配置 + 自动配置 + 起步依赖 + 内嵌容器**帮你把一堆繁琐的 XML/依赖/部署配置自动化，让你几行代码就能跑起一个独立可部署的 Web 应用。

Spring Boot 解决的核心痛点：**配置地狱**。传统的 Spring 项目要手写大量 XML、手动管理几十个依赖版本、还要打包成 WAR 丢进外部 Tomcat；Spring Boot 把这些都「默认化」，你只需要关心业务。

---

## 基础篇

### 1. 为什么会有 Spring Boot

#### 1.1 背景：传统 Spring 的三大痛点

在 Spring Boot 出现之前（2014 年之前），用 Spring 搭建一个 Web 项目要经历以下繁琐步骤：

1. **依赖地狱**：要引入 `spring-core`、`spring-context`、`spring-webmvc`、`spring-tx` 等十几个 jar 包，每个都要手动指定版本号，版本之间还容易冲突（比如 `spring-webmvc` 5.3 配 `spring-core` 5.0 就报 `NoSuchMethodError`）。
2. **配置地狱**：要写 `web.xml`（配置 DispatcherServlet）、`applicationContext.xml`（配置 bean）、`spring-mvc.xml`（配置视图解析器、注解扫描）一大堆 XML。
3. **部署麻烦**：开发完要打成 WAR 包，丢进外部的 Tomcat 容器，Tomcat 还要单独安装、配置、版本要和代码里的 `javax.servlet` 匹配。

```xml
<!-- 传统 Spring MVC 项目：web.xml 要手写这么多 -->
<web-app>
    <servlet>
        <servlet-name>dispatcher</servlet-name>
        <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
        <init-param>
            <param-name>contextConfigLocation</param-name>
            <param-value>classpath:spring-mvc.xml</param-value>
        </init-param>
        <load-on-startup>1</load-on-startup>
    </servlet>
    <servlet-mapping>
        <servlet-name>dispatcher</servlet-name>
        <url-pattern>/</url-pattern>
    </servlet-mapping>
</web-app>
```

Spring Boot 的目标就是：**把这三大痛点全部默认化**，让开发者「开箱即用」。

#### 1.2 定义

Spring Boot 不是一个全新的框架，而是**基于 Spring 的快速开发脚手架**（Pivotal 团队 2014 年发布），它遵循四个核心设计理念：

| 核心理念 | 含义 | 对应解决的问题 |
| --- | --- | --- |
| **约定优于配置**（Convention over Configuration） | 大量默认约定，没写配置就用默认值 | 配置地狱 |
| **自动配置**（Auto Configuration） | 根据 classpath 里的依赖自动装配 Bean | 配置地狱 |
| **起步依赖**（Starter） | 一个依赖聚合一组功能所需的全部 jar | 依赖地狱 |
| **内嵌容器**（Embedded Server） | 把 Tomcat 打进 jar，`java -jar` 直接跑 | 部署麻烦 |

#### 1.3 小结

一句话：Spring Boot = Spring + 自动配置 + starter + 内嵌容器，本质是「把 Spring 的最佳实践固化下来」，让开发者专注业务。

---

### 2. 起步依赖（Starter）

#### 2.1 定义

每个 starter 都是一个**依赖聚合包**，把一个功能所需的所有依赖（以及它们的**兼容版本**）打包在一起。你只引入一个 starter，就不用再手动管它下面几十个依赖的版本冲突。

#### 2.2 为什么 starter 能统一版本：parent + BOM

Starter 本身不管理版本，版本统一靠两层机制：

```xml
<!-- 为什么不用手动写版本号：spring-boot-starter-parent 统一管理了所有依赖版本 -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
    <relativePath/>
</parent>

<dependencies>
    <!-- web 起步依赖：自动引入 spring-webmvc + 内嵌 tomcat + jackson + validation -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <!-- 测试起步依赖：自动引入 JUnit5 + spring-test + Mockito + AssertJ -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

`spring-boot-starter-parent` 内部又继承了 `spring-boot-dependencies`（一个超大 BOM，即 Bill Of Materials），里面用 `<dependencyManagement>` 声明了所有第三方依赖的**兼容版本**。

```
spring-boot-starter-parent (3.2.0)
    └─ 继承 spring-boot-dependencies (BOM，版本仲裁中心)
         ├─ spring-webmvc → 6.1.x
         ├─ tomcat → 10.1.x
         ├─ jackson → 2.15.x
         ├─ mysql-connector-j → 8.2.x
         └─ ... 几百个依赖版本都在这统一声明
```

> 关键点：**BOM 里用 `<dependencyManagement>` 声明版本，子项目用 `<dependencies>` 引入时不写版本号，Maven 会到 BOM 里查**。这就是「版本仲裁」。

#### 2.3 常用 Starter 速查

| Starter | 作用 | 引入的关键依赖 |
| --- | --- | --- |
| `spring-boot-starter-web` | Web 开发 | `spring-webmvc` + 内嵌 Tomcat + Jackson |
| `spring-boot-starter-webflux` | 响应式 Web | `spring-webflux` + Netty |
| `spring-boot-starter-test` | 测试 | JUnit5 + Mockito + AssertJ + spring-test |
| `spring-boot-starter-data-jpa` | ORM 框架 JPA | Hibernate + spring-data-jpa |
| `spring-boot-starter-data-redis` | 集成 Redis | spring-data-redis + Lettuce |
| `spring-boot-starter-jdbc` | JDBC + 连接池 | spring-jdbc + HikariCP |
| `spring-boot-starter-security` | 集成 [Spring Security](./Spring%20Security) | spring-security-* |
| `spring-boot-starter-validation` | 参数校验（`@Valid`） | hibernate-validator |
| `spring-boot-starter-aop` | 切面编程 | spring-aop + aspectjweaver |
| `spring-boot-starter-amqp` | 集成 RabbitMQ | spring-rabbit |
| `spring-boot-starter-mail` | 发送邮件 | spring-mail + jakarta.mail |
| `spring-boot-starter-actuator` | 监控与健康检查 | micrometer + actuator |
| `spring-boot-starter-cache` | 缓存抽象 | spring-context-support |
| `spring-boot-starter-thymeleaf` | 模板引擎 | thymeleaf |

#### 2.4 自定义 Starter 命名规范

Spring Boot 官方约定两个命名规则，**别混用**：

- **官方 Starter**：`spring-boot-starter-{name}`，例如 `spring-boot-starter-web`
- **第三方/自定义 Starter**：`{name}-spring-boot-starter`，例如 `mybatis-spring-boot-starter`

#### 2.5 小结

Starter 的底层就两件事：**依赖聚合**（把相关 jar 打包） + **版本仲裁**（BOM 统一版本），它是「引入一个依赖就配好一套功能」的载体。

---

### 3. 快速入门：一个完整可运行的项目

#### 3.1 完整 pom.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>demo</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>demo</name>

    <properties>
        <java.version>17</java.version>   <!-- Spring Boot 3 要求 JDK 17+ -->
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <!-- 为什么必须有这个插件：它负责把依赖+内嵌容器打成一个可执行 Fat Jar -->
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

#### 3.2 启动类

```java
package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// @SpringBootApplication 是三个注解的合体，详见原理篇
@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        // 为什么用 run 而不是 new：run 会完整执行「启动流程」（见原理篇），new 只是一个空对象
        SpringApplication.run(DemoApplication.class, args);
    }
}
```

#### 3.3 Controller + Service

```java
package com.example.demo.controller;

import com.example.demo.service.UserService;
import com.example.demo.entity.User;
import org.springframework.web.bind.annotation.*;

@RestController                     // = @Controller + @ResponseBody，返回 JSON 而不是视图
@RequestMapping("/user")            // 类级别路径前缀，避免每个方法重复写
public class UserController {

    private final UserService userService;

    // 为什么用构造器注入：字段不可变、方便测试、避免循环依赖，是官方推荐方式
    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping("/{id}")            // REST 风格，明确 HTTP 方法
    public User getUser(@PathVariable Long id) {   // 从 URL 路径取参数
        return userService.getById(id);
    }

    @PostMapping
    public Result save(@RequestBody User user) {   // 从请求体 JSON 反序列化成对象
        return Result.ok(userService.save(user));
    }
}
```

#### 3.4 小结

一个完整 Web 项目 = 一个 `@SpringBootApplication` 启动类 + 若干 `@RestController`，其余全部由自动配置接管。这就是 Spring Boot 的核心体验。

---

### 4. 配置文件

#### 4.1 配置文件位置与优先级

默认读取 `src/main/resources/` 下的 `application.yml`（或 `application.properties`），两者可以共存，**`.properties` 优先级高于 `.yml`**（因为加载顺序 `.properties` 在后）。

#### 4.2 YAML 语法要点

```yaml
# 1. key: value，冒号后必须有空格
# 2. 用缩进表示层级，不能用 Tab，只能用空格
# 3. 大小写敏感
server:
  port: 8080        # 修改端口，默认就是 8080

spring:
  application:
    name: demo-app
  datasource:       # 数据源配置，自动注入 HikariCP 连接池
    url: jdbc:mysql://localhost:3306/demo?useSSL=false&serverTimezone=Asia/Shanghai
    username: root
    password: "123456"
    driver-class-name: com.mysql.cj.jdbc.Driver

# 数组写法一（行内）
my:
  tags: [java, spring, boot]

# 数组写法二（块序列）
my:
  tags:
    - java
    - spring
    - boot
```

#### 4.3 配置占位符

配置里可以引用其他配置项、系统属性、随机数：

```yaml
app:
  name: demo
  # 引用上面的 name，加默认值
  description: ${app.name:default-desc}
  # 引用环境变量，不存在则用默认值
  db-host: ${DB_HOST:localhost}
  # 随机数
  secret: ${random.uuid}
  port: ${random.int(1024,65535)}
```

#### 4.4 小结

配置文件解决「配置与代码分离」，支持 YAML/Properties 两种格式、占位符、随机值，是外部化配置的第一入口。

---

### 5. 配置绑定：@Value 与 @ConfigurationProperties

#### 5.1 两种方式对比

| 方式 | 适用场景 | 特点 |
| --- | --- | --- |
| `@Value("${x.y}")` | 单个属性 | 简单直接，但每个字段都要写一次，无法绑定复杂结构，不支持松散绑定 |
| `@ConfigurationProperties(prefix = "x")` | 一组相关配置 | 按前缀批量绑定，支持 `List`/`Map`/嵌套对象，支持松散绑定 + JSR303 校验 |

#### 5.2 @ConfigurationProperties 完整示例

```java
package com.example.demo.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.Map;

// 为什么用 @ConfigurationProperties：一个类把一组配置收拢，注入一次即可复用
@Component
@ConfigurationProperties(prefix = "myapp")
public class MyAppProperties {
    private String name;
    private List<String> servers;      // 直接绑定 yml 里的数组
    private Map<String, String> config; // 绑定 map
    private Security security = new Security();  // 嵌套对象

    // getter/setter 必须保留，否则属性无法注入
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    // ... 其余 getter/setter 省略

    public static class Security {
        private String username;
        private String password;
        // getter/setter
    }
}
```

```yaml
myapp:
  name: my-app
  servers:
    - 127.0.0.1
    - 192.168.1.1
  config:
    timeout: "30"
    retry: "3"
  security:
    username: admin
    password: "123456"
```

#### 5.3 松散绑定（Relaxed Binding）

`@ConfigurationProperties` 的一大优势是**松散绑定**：配置文件的写法可以很随意，Spring 会自动归一化匹配。

| 配置写法 | 是否匹配属性 `maxTimeout` |
| --- | --- |
| `myapp.max-timeout`（kebab-case，推荐） | ✅ |
| `myapp.max_timeout`（snake-case） | ✅ |
| `myapp.maxTimeout`（camelCase） | ✅ |
| `myapp.MAX_TIMEOUT`（大写） | ✅ |

> `@Value` 不支持这种松散绑定，必须精确写 `@Value("${myapp.max-timeout}")`。

#### 5.4 @ConfigurationProperties 的三种注册方式

```java
// 方式一：@Component 直接交给 Spring 管理（最常用）
@Component
@ConfigurationProperties(prefix = "myapp")
public class MyAppProperties { }

// 方式二：在配置类上 @EnableConfigurationProperties 启用（无需 @Component）
@Configuration
@EnableConfigurationProperties(MyAppProperties.class)
public class AppConfig { }

// 方式三：@ConfigurationPropertiesScan 扫描指定包
@ConfigurationPropertiesScan("com.example.demo.config")
@Configuration
public class AppConfig { }
```

#### 5.5 小结

`@Value` 适合零散单值，`@ConfigurationProperties` 适合成组配置（推荐后者做可复用配置模块），配合松散绑定和校验是 Spring Boot 配置绑定的标准姿势。

---

### 6. 常用注解体系

#### 6.1 组件注解（分层）

| 注解 | 作用 | 等价关系 |
| --- | --- | --- |
| `@Component` | 通用组件 | 基础 |
| `@Service` | 业务层 | `@Component` 的语义化别名 |
| `@Repository` | 数据访问层 | `@Component` + 异常翻译 |
| `@Controller` | 控制层（返回视图） | `@Component` 的语义化别名 |
| `@RestController` | 控制层（返回 JSON） | `@Controller` + `@ResponseBody` |
| `@Configuration` | 配置类 | `@Component`，但会被 CGLIB 增强保证单例 |

#### 6.2 依赖注入注解

| 注解 | 作用 | 说明 |
| --- | --- | --- |
| `@Autowired` | 按类型注入 | 默认必填，`required=false` 可空 |
| `@Resource` | 按名称再按类型注入 | JDK 原生，Spring 兼容 |
| `@Qualifier` | 配合 `@Autowired` 按名称限定 | 多个同类型 Bean 时消歧 |
| `@Value` | 注入配置/字面量 | `@Value("${x}")` / `@Value("#{1+1}")` |

#### 6.3 请求映射注解

```java
@GetMapping    // 等价 @RequestMapping(method=GET)
@PostMapping   // 等价 @RequestMapping(method=POST)
@PutMapping    // 更新
@DeleteMapping // 删除
@PatchMapping  // 部分更新
```

#### 6.4 参数绑定注解

| 注解 | 作用 | 示例 |
| --- | --- | --- |
| `@PathVariable` | 取路径参数 | `/user/{id}` → `@PathVariable Long id` |
| `@RequestParam` | 取查询参数 | `?name=x` → `@RequestParam String name` |
| `@RequestBody` | 取请求体 JSON | 反序列化为对象 |
| `@RequestHeader` | 取请求头 | `@RequestHeader("token") String token` |
| `@CookieValue` | 取 Cookie | `@CookieValue("JSESSIONID") String sid` |
| `@ModelAttribute` | 表单/对象绑定 | 传统表单提交 |

```java
@GetMapping("/search")
public List<User> search(
        @RequestParam(value = "keyword", required = false, defaultValue = "") String keyword,
        @RequestParam(defaultValue = "1") Integer page,
        @RequestParam(defaultValue = "10") Integer size) {
    return userService.search(keyword, page, size);
}
```

#### 6.5 小结

Spring Boot 的注解体系本质是 Spring 的注解，Spring Boot 只是「组合」了它们（如 `@RestController`），并配上自动配置让注解无需额外 XML 就能生效。

---

### 7. 多环境配置（Profile）

#### 7.1 定义

开发、测试、生产环境配置不同，用 `spring.profiles.active` 切换，实现「同一套代码，不同环境不同配置」。

#### 7.2 完整示例

```yaml
# application.yml —— 公共配置（所有环境共享）
spring:
  application:
    name: demo-app
  profiles:
    active: dev          # 指定激活哪个环境，通常由启动参数 -Dspring.profiles.active=prod 覆盖

server:
  port: 8080
```

```yaml
# application-dev.yml —— 开发环境（本地库）
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/demo_dev
    username: root
    password: "root"
server:
  port: 8080
```

```yaml
# application-test.yml —— 测试环境
spring:
  datasource:
    url: jdbc:mysql://test-db:3306/demo_test
```

```yaml
# application-prod.yml —— 生产环境（线上库，账号密码走配置中心/环境变量）
spring:
  datasource:
    url: jdbc:mysql://prod-db:3306/demo
    username: ${DB_USERNAME}   # 生产密码不写死，从环境变量/配置中心读取
    password: ${DB_PASSWORD}
server:
  port: 8080
```

#### 7.3 三种激活方式

```bash
# 方式一：配置文件里写死（开发常用）
# spring.profiles.active=dev

# 方式二：启动参数（部署常用，优先级最高）
java -jar demo.jar --spring.profiles.active=prod

# 方式三：环境变量
# SPRING_PROFILES_ACTIVE=prod
```

#### 7.4 指定 profile 的 Bean

```java
@Configuration
public class DataSourceConfig {

    @Bean
    @Profile("dev")   // 只有 dev 环境才创建这个 Bean
    public DataSource devDataSource() {
        return new HikariDataSource();
    }

    @Bean
    @Profile("prod")  // 只有 prod 环境才创建
    public DataSource prodDataSource() {
        return new HikariDataSource();
    }
}
```

#### 7.5 小结

Profile 是「环境隔离」的官方方案，配合「外部化配置」在生产环境做到**配置与代码彻底分离**，是 DevOps 实践的基础。

---

### 8. 日志配置

#### 8.1 默认日志框架

Spring Boot 默认使用 **SLF4J（门面） + Logback（实现）**，无需任何配置即可使用。

```java
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@RestController
public class HelloController {
    // 为什么用 SLF4J 而不是 Logback：SLF4J 是门面接口，换实现不用改代码
    private static final Logger log = LoggerFactory.getLogger(HelloController.class);

    @GetMapping("/hello")
    public String hello() {
        log.info("hello 接口被调用");      // 生产环境不要用 System.out.println
        log.debug("debug 日志");
        return "hello";
    }
}
```

#### 8.2 logback-spring.xml 完整配置

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- 控制台输出 -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- 文件输出，按天滚动 -->
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>logs/app.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.TimeBasedRollingPolicy">
            <fileNamePattern>logs/app.%d{yyyy-MM-dd}.log</fileNamePattern>
            <maxHistory>30</maxHistory>   <!-- 保留 30 天 -->
        </rollingPolicy>
        <encoder>
            <pattern>%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- 分环境控制日志级别 -->
    <springProfile name="dev">
        <logger name="com.example" level="DEBUG"/>
    </springProfile>
    <springProfile name="prod">
        <logger name="com.example" level="INFO"/>
    </springProfile>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="FILE"/>
    </root>
</configuration>
```

#### 8.3 小结

日志用 SLF4J + Logback，配置文件命名为 `logback-spring.xml` 才能使用 `<springProfile>` 分环境标签。

---

## 高级篇

### 1. 配置文件加载顺序（完整版）

同一个配置项可以在多处出现，Spring Boot 按优先级从高到低读取（**后者覆盖前者，高覆盖低**）：

```
高优先级 ──────────────────────────────────────────────────────────►
1. Devtools 全局配置（~/.spring-boot-devtools.properties，仅开发）
2. @TestPropertySource 注解（测试用）
3. 命令行参数 --server.port=9090（最高优先级，生产最常用）
4. SPRING_APPLICATION_JSON 内联 JSON
5. ServletConfig 初始化参数
6. ServletContext 初始化参数
7. JNDI 属性（java:comp/env）
8. Java 系统属性 System.getProperties()
9. 操作系统环境变量
10. application-{profile}.yml（环境专属，jar 外部）
11. application.yml（公共，jar 外部）
12. application-{profile}.yml（环境专属，jar 内部）
13. application.yml（公共，jar 内部）
14. @PropertySource 注解加载的配置
15. 默认配置（SpringApplication.setDefaultProperties）
低优先级 ──────────────────────────────────────────────────────────►
```

> 记忆口诀：**命令行 > 环境变量 > jar 外部 > jar 内部 > 默认**。且 `jar 外部` 高于 `jar 内部`，这是「不重新打包就能改线上配置」的关键。

::: tip 💡 面试题：多环境配置加载顺序是什么？
命令行参数 > 环境变量 > profile 专属配置 > 公共 application.yml，高优先级覆盖低优先级——因为 Spring Boot 用 `PropertySource` 列表按顺序读取，越靠前优先级越高（`PropertySource` 列表里 index 越小越先匹配到）。
:::

---

### 2. 条件注解（自动配置的基石）

#### 2.1 定义

`@ConditionalOnXxx` 控制一个 Bean 在**满足条件时才创建**，是「按需自动装配」的底层机制。自动配置类之所以能「引入了依赖就生效、没引入就跳过」，全靠条件注解。

#### 2.2 常用条件注解全集

| 注解 | 生效条件 | 典型场景 |
| --- | --- | --- |
| `@ConditionalOnClass` | classpath 存在指定类 | 引入 redis 才配 RedisTemplate |
| `@ConditionalOnMissingClass` | classpath 不存在指定类 | 缺类时走降级配置 |
| `@ConditionalOnBean` | 容器中存在指定 Bean | 依赖别的 Bean 才创建 |
| `@ConditionalOnMissingBean` | 容器中不存在指定 Bean | 给用户留覆盖口子 |
| `@ConditionalOnProperty` | 配置项存在且匹配指定值 | 用开关控制功能 |
| `@ConditionalOnWebApplication` | 是 Web 应用（Servlet/Reactive） | 只有 Web 才配相关 Bean |
| `@ConditionalOnExpression` | SpEL 表达式为 true | 复杂条件判断 |
| `@ConditionalOnResource` | 存在指定资源文件 | 有某配置文件才加载 |
| `@ConditionalOnJava` | JDK 版本满足要求 | 按 JDK 版本分支 |

#### 2.3 完整示例

```java
@Configuration
public class RedisConfig {

    @Bean
    // 为什么加条件注解：只有 classpath 存在 RedisTemplate 类（即引入了 redis starter）才创建，
    // 否则项目没引入 Redis 时会因为缺类直接启动失败
    @ConditionalOnClass(name = "org.springframework.data.redis.core.RedisTemplate")
    @ConditionalOnMissingBean(name = "redisTemplate")  // 用户自定义了就用用户的，不覆盖
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        template.setKeySerializer(new StringRedisSerializer());
        template.setValueSerializer(new GenericJackson2JsonRedisSerializer());
        return template;
    }

    @Bean
    // 用配置项当开关：application.yml 里写 myapp.cache.enabled=true 才启用
    @ConditionalOnProperty(prefix = "myapp.cache", name = "enabled", havingValue = "true")
    public CacheManager cacheManager() {
        return new ConcurrentMapCacheManager();
    }
}
```

#### 2.4 自定义条件注解

```java
// 自定义：只有 Windows 系统才生效
public class OnWindowsCondition implements Condition {
    @Override
    public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
        return context.getEnvironment().getProperty("os.name").contains("Windows");
    }
}

@Configuration
public class MyConfig {
    @Bean
    @Conditional(OnWindowsCondition.class)
    public Object windowsBean() {
        return new Object();
    }
}
```

#### 2.5 小结

条件注解是「约定优于配置」的技术落地：默认给一套配置，用户不满意时用 `@ConditionalOnMissingBean` 留覆盖口子，符合「开闭原则」。

---

### 3. 全局异常处理（完整版）

#### 3.1 定义

用 `@RestControllerAdvice` 统一拦截 Controller 抛出的异常，返回统一结构，避免每个接口写 try-catch。

#### 3.2 完整实现

```java
package com.example.demo.common;

import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice      // 为什么用它：全局拦截所有 Controller 抛出的异常，集中处理
public class GlobalExceptionHandler {

    // 捕获自定义业务异常
    @ExceptionHandler(BizException.class)
    public Result<Void> handleBiz(BizException e) {
        // 为什么返回统一 Result：前端约定一个固定 JSON 结构，便于统一解析和错误提示
        return Result.fail(e.getCode(), e.getMessage());
    }

    // 参数校验失败（@RequestBody + @Valid 场景）
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<Void> handleValid(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldError().getDefaultMessage();
        return Result.fail(400, msg);
    }

    // 参数校验失败（表单绑定场景）
    @ExceptionHandler(BindException.class)
    public Result<Void> handleBind(BindException e) {
        String msg = e.getBindingResult().getFieldError().getDefaultMessage();
        return Result.fail(400, msg);
    }

    // 兜底异常：捕获所有没被上面 handler 匹配的异常
    @ExceptionHandler(Exception.class)
    public Result<Void> handleException(Exception e) {
        // 为什么兜底要打日志：这是系统出 bug 的信号，必须记录堆栈用于排查
        log.error("系统异常", e);
        return Result.fail(500, "系统繁忙，请稍后再试");
    }
}
```

#### 3.3 自定义业务异常 + 统一响应体

```java
// 业务异常：携带错误码和提示信息
public class BizException extends RuntimeException {
    private final Integer code;
    public BizException(Integer code, String message) {
        super(message);
        this.code = code;
    }
    public Integer getCode() { return code; }
}

// 统一响应体：前端只认这个结构
public class Result<T> {
    private Integer code;
    private String msg;
    private T data;

    public static <T> Result<T> ok(T data) { return new Result<>(200, "success", data); }
    public static <T> Result<T> fail(Integer code, String msg) { return new Result<>(code, msg, null); }
    // 构造器 + getter/setter 省略
}
```

#### 3.4 小结

全局异常处理 = `@RestControllerAdvice` + 多个 `@ExceptionHandler`，核心价值是「异常处理逻辑与业务逻辑解耦」，并保证前端拿到**统一响应结构**。

---

### 4. 参数校验（Validation）

#### 4.1 定义

用 JSR-303（Hibernate Validator 实现）在实体字段上加注解，配合 `@Valid`/`@Validated` 自动校验入参。

#### 4.2 常用校验注解

| 注解 | 作用 |
| --- | --- |
| `@NotNull` | 不能为 null |
| `@NotEmpty` | 不能为 null 且长度 > 0（字符串/集合） |
| `@NotBlank` | 不能为 null 且去掉首尾空格后长度 > 0 |
| `@Size(min, max)` | 长度/大小在范围内 |
| `@Min` / `@Max` | 数值范围 |
| `@Email` | 邮箱格式 |
| `@Pattern(regexp)` | 正则匹配 |
| `@Past` / `@Future` | 过去/未来时间 |

```java
public class UserDTO {
    @NotNull(message = "id 不能为空")
    private Long id;

    @NotBlank(message = "姓名不能为空")
    @Size(min = 2, max = 20, message = "姓名长度 2-20")
    private String name;

    @Email(message = "邮箱格式不正确")
    private String email;

    @Min(value = 0, message = "年龄不能为负数")
    @Max(value = 150, message = "年龄不合法")
    private Integer age;
}
```

```java
@PostMapping
// @Valid 触发校验，校验失败抛 MethodArgumentNotValidException，被全局异常处理器接住
public Result save(@Valid @RequestBody UserDTO user) {
    return Result.ok(userService.save(user));
}
```

#### 4.3 分组校验与嵌套校验

```java
// 分组：新增和更新校验规则不同
public interface AddGroup {}
public interface UpdateGroup {}

public class UserDTO {
    @Null(groups = AddGroup.class, message = "新增时 id 必须为空")
    @NotNull(groups = UpdateGroup.class, message = "更新时 id 不能为空")
    private Long id;
}

@PostMapping
public Result add(@Validated(AddGroup.class) @RequestBody UserDTO user) { ... }
```

#### 4.4 小结

参数校验把「非法参数」挡在业务逻辑之外，`@Valid`（单层）+ `@Validated`（分组/嵌套）+ 全局异常处理器组合使用是标准姿势。

---

### 5. 拦截器与过滤器

#### 5.1 过滤器（Filter）vs 拦截器（Interceptor）

| 维度 | 过滤器 Filter | 拦截器 Interceptor |
| --- | --- | --- |
| 归属 | Servlet 规范 | Spring MVC |
| 作用范围 | 所有请求（含静态资源） | 进入 Controller 的请求 |
| 能否拿到 Spring Bean | 不能直接拿（需手动从容器取） | 能（就是 Spring 管理的 Bean） |
| 能否拿到 Handler 方法 | 不能 | 能（`HandlerMethod`） |
| 典型场景 | 编码、CORS、日志 | 登录鉴权、权限、性能统计 |

#### 5.2 登录鉴权拦截器完整示例

```java
@Component
public class LoginInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 为什么在 preHandle 拦截：请求还没进 Controller，最省性能
        String token = request.getHeader("token");
        if (token == null || !tokenService.isValid(token)) {
            response.setStatus(401);
            return false;   // 返回 false 表示不放行
        }
        // 把用户信息放进 ThreadLocal，后续业务可取
        UserContext.setUserId(tokenService.parseUserId(token));
        return true;  // 放行
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        // 为什么必须清理：线程池复用线程，不清会导致用户信息串号（内存泄漏/数据错乱）
        UserContext.remove();
    }
}
```

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final LoginInterceptor loginInterceptor;
    public WebConfig(LoginInterceptor loginInterceptor) {
        this.loginInterceptor = loginInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(loginInterceptor)
                .addPathPatterns("/**")          // 拦截所有
                .excludePathPatterns("/login", "/register");  // 放行登录注册
    }
}
```

#### 5.3 小结

鉴权、日志、性能统计这类「横切关注点」，优先用拦截器（能拿 Spring Bean 和 Handler）；编码、CORS 这类更底层的事用过滤器。

---

### 6. 定时任务

#### 6.1 定义

用 `@Scheduled` 让方法按 Cron 表达式定时执行。

```java
@Configuration
@EnableScheduling   // 开启定时任务
public class ScheduleConfig {
}

@Component
public class TaskJob {

    // cron 表达式：秒 分 时 日 月 周
    @Scheduled(cron = "0 0 2 * * ?")   // 每天凌晨 2 点执行
    public void dailyReport() { }

    @Scheduled(fixedDelay = 5000)   // 上次执行结束后 5 秒再执行
    public void fixedDelayTask() { }

    @Scheduled(fixedRate = 5000)    // 固定每 5 秒执行（上次开始算起）
    public void fixedRateTask() { }
}
```

> `fixedDelay` 与 `fixedRate` 的区别：`fixedDelay` 从**上次执行完**开始计时，`fixedRate` 从**上次开始**计时（若任务执行超时，会等执行完再触发下次）。

#### 6.2 小结

定时任务适合轻量级调度；分布式环境下要配合 [Redis 分布式锁](./../learn_database) 或 [Nacos](../微服务/Nacos) 等避免多实例重复执行。

---

### 7. 异步任务

```java
@Configuration
@EnableAsync   // 开启异步
public class AsyncConfig {
    // 自定义线程池（生产环境必须配，否则用默认的 SimpleAsyncTaskExecutor 会无限创建线程）
    @Bean("taskExecutor")
    public ThreadPoolTaskExecutor taskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10);
        executor.setMaxPoolSize(50);
        executor.setQueueCapacity(200);
        executor.setThreadNamePrefix("async-");
        executor.initialize();
        return executor;
    }
}

@Service
public class EmailService {
    @Async("taskExecutor")   // 指定线程池执行，不阻塞主线程
    public void sendEmail(String to, String content) {
        // 耗时的发邮件逻辑
    }
}
```

---

### 8. Actuator 监控与健康检查

#### 8.1 定义

`spring-boot-starter-actuator` 提供生产级监控端点（健康检查、指标、环境信息等），是运维的基础设施。

#### 8.2 完整配置

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,loggers   # 暴露哪些端点
        exclude: env,beans                      # 排除敏感端点
  endpoint:
    health:
      show-details: always    # 显示健康详情（组件状态）
  health:
    redis:
      enabled: false          # 关闭某个健康检查项
```

#### 8.3 常用端点

| 端点 | 作用 |
| --- | --- |
| `/actuator/health` | 健康状态（UP/DOWN） |
| `/actuator/info` | 应用信息（版本等） |
| `/actuator/metrics` | 指标列表（内存、线程、HTTP） |
| `/actuator/env` | 环境属性（敏感，慎暴露） |
| `/actuator/loggers` | 动态调整日志级别 |
| `/actuator/beans` | 容器中所有 Bean |

#### 8.4 自定义健康检查

```java
@Component
public class MyHealthIndicator implements HealthIndicator {
    @Override
    public Health health() {
        // 探测依赖服务是否可用，不可用返回 DOWN，配合监控告警
        boolean ok = checkDependency();
        return ok ? Health.up().build() : Health.down().withDetail("reason", "依赖服务不可用").build();
    }
}
```

#### 8.5 小结

Actuator 是「应用可观测性」的入口，生产环境要**谨慎暴露端点**（env、beans 等会泄露敏感信息），通常配合 Prometheus + Grafana 做监控大盘。

---

### 9. 优雅停机

```yaml
server:
  shutdown: graceful       # 开启优雅停机

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s   # 最多等 30 秒
```

> 优雅停机的过程：收到关闭信号 → 停止接收新请求 → 等正在处理的请求完成 → 关闭线程池 → 释放连接池 → 关闭容器。相比直接 `kill -9` 能避免**正在处理的请求被截断**。

---

### 10. 热部署（DevTools）

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <scope>runtime</scope>
    <optional>true</optional>
</dependency>
```

DevTools 通过**双类加载器**（base classloader 加载三方 jar，restart classloader 加载项目代码）实现「改了代码只重启 restart 层」，速度快。生产环境自动禁用。

---

### 11. 事务管理

```java
@Service
public class OrderService {

    // @Transactional 开启声明式事务：方法抛 RuntimeException 自动回滚
    @Transactional(rollbackFor = Exception.class)  // 指定所有异常都回滚（默认只回滚 RuntimeException）
    public void createOrder(Order order) {
        orderMapper.insert(order);
        stockService.deduct(order.getGoodsId(), order.getNum());  // 扣库存
        // 如果上面抛异常，两条 SQL 一起回滚，保证数据一致性
    }
}
```

::: tip 💡 面试题：@Transactional 失效的几种场景？
① 同类内部方法自调用（`this.method()` 绕过了代理）；② 方法不是 public；③ 异常被 try-catch 吞掉；④ 抛的是受检异常且没指定 `rollbackFor`；⑤ 存储引擎不支持事务（如 MyISAM）——核心原因是 Spring 事务靠 AOP 动态代理实现，只有**通过代理对象调用**才会触发事务切面。
:::

---

### 12. 单元测试

```java
@SpringBootTest                 // 启动完整容器
@AutoConfigureMockMvc            // 配置 MockMvc
public class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    public void testGetUser() throws Exception {
        mockMvc.perform(get("/user/1"))
               .andExpect(status().isOk())
               .andExpect(jsonPath("$.name").value("张三"));
    }

    @Test
    @MockBean   // 用 Mock 替代真实 Bean，隔离外部依赖
    public void testWithMock(UserService userService) { }
}
```

---

## 原理篇

### 1. @SpringBootApplication 三合一（源码结构）

#### 1.1 源码拆解

```java
// @SpringBootApplication 源码（简化）
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@SpringBootConfiguration      // ① 标记这是配置类
@EnableAutoConfiguration      // ② 开启自动配置，核心
@ComponentScan(               // ③ 组件扫描
    excludeFilters = { @Filter(type = FilterType.CUSTOM, classes = TypeExcludeFilter.class) }
)
public @interface SpringBootApplication {
    // 可以覆盖默认的包扫描路径、排除自动配置类等
    @AliasFor(annotation = ComponentScan.class, attribute = "basePackages")
    String[] scanBasePackages() default {};
}
```

三个子注解的分工：

| 注解 | 作用 | 底层本质 |
| --- | --- | --- |
| `@SpringBootConfiguration` | 标记当前类是配置类 | `@Configuration` 的别名 |
| `@EnableAutoConfiguration` | 开启自动配置 | `@Import(AutoConfigurationImportSelector.class)` |
| `@ComponentScan` | 扫描启动类所在包及子包 | 默认扫描启动类包下的 `@Component/@Service/@Controller` |

#### 1.2 为什么启动类必须放在「根包」

`@ComponentScan` 默认扫描的是**启动类所在的包及子包**。如果把启动类放在 `com.example` 包下，而业务代码在 `com.example.user` 下就能扫到；但若启动类放在 `com.example.app`，业务代码在 `com.example.user` 就**扫不到**，导致 Bean 注入失败（`NoSuchBeanDefinitionException`）。

```
com.example                ← 启动类放这里（根包）
├── DemoApplication.java
├── controller/
├── service/
└── mapper/
     ↑ 全部能被扫描到

com.example
├── app
│   └── DemoApplication.java   ← 启动类放这里（错误）
└── user
    └── UserService.java       ← 扫描不到，报错！
```

#### 1.3 小结

`@SpringBootApplication` 是「配置类 + 自动配置 + 组件扫描」三合一的语法糖，拆开理解它，自动配置原理就懂了一半。

---

### 2. 自动配置原理（高频考点，完整机制）

#### 2.1 核心链路

```
@SpringBootApplication
   └─ @EnableAutoConfiguration
        └─ @Import(AutoConfigurationImportSelector.class)
             └─ AutoConfigurationImportSelector#selectImports()
                  └─ 读取 META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
                       └─ 加载所有自动配置类（如 DataSourceAutoConfiguration、RedisAutoConfiguration）
                            └─ 每个自动配置类用 @ConditionalOnXxx 判断是否生效
                                 └─ 生效的配置类里的 @Bean 被创建并放入容器
```

#### 2.2 演进：spring.factories → AutoConfiguration.imports

Spring Boot 2.7 之前，自动配置类写在 `META-INF/spring.factories`：

```properties
# spring.factories（旧版，2.7 之前）
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration,\
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
```

Spring Boot 2.7 之后，改用 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`（**每行一个类**，更简洁）：

```
# AutoConfiguration.imports（新版）
org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration
```

#### 2.3 一个自动配置类的完整解剖（以 RedisAutoConfiguration 为例）

```java
@AutoConfiguration                  // 标记是自动配置类
@ConditionalOnClass(RedisOperations.class)   // ① 有 RedisOperations 类（引入了 starter）才生效
@EnableConfigurationProperties(RedisProperties.class)  // ② 绑定 RedisProperties 配置
@Import({ LettuceConnectionConfiguration.class, ... }) // ③ 引入连接配置
public class RedisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(name = "redisTemplate")  // ④ 用户没自定义才用默认的
    public RedisTemplate<Object, Object> redisTemplate(RedisConnectionFactory factory) {
        // ⑤ 创建默认的 RedisTemplate
        RedisTemplate<Object, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        return template;
    }
}
```

自动配置类的标准「五件套」：

1. `@AutoConfiguration` / `@Configuration` 标记配置类
2. `@ConditionalOnClass` 判断依赖是否存在
3. `@EnableConfigurationProperties` 绑定配置属性类
4. `@ConditionalOnMissingBean` 给用户留覆盖口子
5. `@Bean` 创建默认 Bean

#### 2.4 完整时序（结合启动流程）

```
SpringApplication.run()
    └─ refreshContext()
         └─ AbstractApplicationContext#refresh()
              └─ invokeBeanFactoryPostProcessors()
                   └─ ConfigurationClassPostProcessor 处理 @Configuration
                        └─ 处理 @Import(AutoConfigurationImportSelector)
                             └─ AutoConfigurationImportSelector#getAutoConfigurationEntry()
                                  ├─ getCandidateConfigurations()  读取 AutoConfiguration.imports
                                  ├─ removeDuplicates()             去重
                                  ├─ getExclusions()                剔除 @SpringBootApplication(exclude=...)
                                  └─ filter()                        用 @ConditionalOnXxx 过滤
                                       └─ 满足条件的自动配置类 → 注册为 BeanDefinition
```

#### 2.5 排除某个自动配置

```java
// 方式一：注解排除
@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
public class DemoApplication { }

// 方式二：配置排除
// spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
```

::: tip 💡 面试题：Spring Boot 自动配置原理是什么？
启动类上的 `@EnableAutoConfiguration` 通过 `@Import(AutoConfigurationImportSelector.class)` 读取 `spring-boot-autoconfigure` 包里 `AutoConfiguration.imports` 文件列出的所有自动配置类，再由 `@ConditionalOnClass` 等条件注解按需过滤——因为只有满足条件的配置类才会真正生效，所以「引入了依赖就自动配好，没引入就跳过」，实现按需装配。
:::

---

### 3. SpringApplication.run() 启动流程（完整机制）

#### 3.1 源码入口

```java
public static ConfigurableApplicationContext run(Class<?> primarySource, String... args) {
    return run(new Class<?>[] { primarySource }, args);
}

public static ConfigurableApplicationContext run(Class<?>[] primarySources, String[] args) {
    // ① 创建 SpringApplication 对象（推断应用类型、加载初始化器和监听器）
    // ② 调用实例方法 run(args) 执行真正的启动
    return new SpringApplication(primarySources).run(args);
}
```

#### 3.2 new SpringApplication() 做了什么

```java
public SpringApplication(ResourceLoader resourceLoader, Class<?>... primarySources) {
    this.resourceLoader = resourceLoader;
    this.primarySources = new LinkedHashSet<>(Arrays.asList(primarySources));

    // ① 推断应用类型：根据 classpath 判断是 Servlet / Reactive / 普通应用
    this.webApplicationType = WebApplicationType.deduceFromClasspath();

    // ② 加载 BootstrapRegistryInitializer（引导注册初始化器）
    this.bootstrapRegistryInitializers = getBootstrapRegistryInitializersFromSpringFactories();

    // ③ 从 spring.factories 加载 ApplicationContextInitializer（上下文初始化器）
    setInitializers(getSpringFactoriesInstances(ApplicationContextInitializer.class));

    // ④ 从 spring.factories 加载 ApplicationListener（事件监听器）
    setListeners(getSpringFactoriesInstances(ApplicationListener.class));

    // ⑤ 推断 main 方法所在的启动类
    this.mainApplicationClass = deduceMainApplicationClass();
}
```

#### 3.3 run(args) 的完整流程

```java
public ConfigurableApplicationContext run(String... args) {
    long startTime = System.nanoTime();

    // ① 创建 BootstrapContext（引导上下文）
    DefaultBootstrapContext bootstrapContext = createBootstrapContext();

    // ② 让 java.awt.headless 生效
    configureHeadlessProperty();

    // ③ 获取 SpringApplicationRunListeners（运行监听器），发布 starting 事件
    SpringApplicationRunListeners listeners = getRunListeners(args);
    listeners.starting(bootstrapContext, this.mainApplicationClass);

    try {
        // ④ 封装命令行参数
        ApplicationArguments applicationArguments = new DefaultApplicationArguments(args);

        // ⑤ 准备环境 Environment（加载外部化配置：yml/properties/命令行/环境变量）
        ConfigurableEnvironment environment = prepareEnvironment(listeners, bootstrapContext, applicationArguments);

        // ⑥ 打印 Banner
        Banner printedBanner = printBanner(environment);

        // ⑦ 创建 ApplicationContext（根据类型创建对应容器）
        context = createApplicationContext();
        context.setApplicationStartup(this.applicationStartup);

        // ⑧ 准备上下文（注册 BeanDefinition、执行初始化器）
        prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner);

        // ⑨ 刷新容器 ★★★ 核心：这里会执行自动配置、创建所有单例 Bean、启动内嵌 Tomcat
        refreshContext(context);

        // ⑩ 刷新后钩子（空实现，留给扩展）
        afterRefresh(context, applicationArguments);

        // ⑪ 发布 started 事件
        listeners.started(context, timeTakenToStarted);

        // ⑫ 调用 ApplicationRunner / CommandLineRunner（应用启动后执行自定义逻辑）
        callRunners(context, applicationArguments);
    } catch (Throwable ex) {
        // ⑬ 启动失败，发布 failed 事件，抛出异常
        handleRunFailure(context, ex, listeners);
        throw new IllegalStateException(ex);
    }

    // ⑭ 发布 ready 事件，应用启动完成
    listeners.ready(context, timeTakenToReady);
    return context;
}
```

#### 3.4 refreshContext 内部（Spring 核心，重中之重）

```java
// AbstractApplicationContext#refresh() 是 Spring 容器启动的核心方法
public void refresh() {
    // 1. 准备刷新（记录启动时间、校验必要属性）
    prepareRefresh();

    // 2. 获取 BeanFactory，并加载所有 BeanDefinition
    ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

    // 3. 准备 BeanFactory（设置类加载器、注册内置处理器）
    prepareBeanFactory(beanFactory);

    try {
        // 4. BeanFactory 后置处理（留给子类扩展）
        postProcessBeanFactory(beanFactory);

        // 5. 调用 BeanFactoryPostProcessor（★ 自动配置在这里被解析注册）
        invokeBeanFactoryPostProcessors(beanFactory);

        // 6. 注册 BeanPostProcessor
        registerBeanPostProcessors(beanFactory);

        // 7. 初始化消息源（国际化）
        initMessageSource();

        // 8. 初始化事件广播器
        initApplicationEventMulticaster();

        // 9. 留给子类扩展（★ 内嵌 Tomcat 在这里启动）
        onRefresh();

        // 10. 注册监听器
        registerListeners();

        // 11. 实例化所有非懒加载的单例 Bean（★ 所有 @Bean/@Service 在这里被创建）
        finishBeanFactoryInitialization(beanFactory);

        // 12. 完成刷新（发布 ContextRefreshedEvent）
        finishRefresh();
    }
    catch (BeansException ex) {
        // 销毁已创建的 Bean
        destroyBeans();
        throw ex;
    }
}
```

#### 3.5 启动流程全景图（ASCII）

```
SpringApplication.run()
 │
 ├─ new SpringApplication()
 │    ├─ deduceFromClasspath()        推断应用类型（Servlet/Reactive/None）
 │    ├─ 加载 ApplicationContextInitializer
 │    └─ 加载 ApplicationListener
 │
 └─ run(args)
      ├─ 发布 starting 事件
      ├─ prepareEnvironment()          加载 yml/properties/命令行/环境变量
      ├─ createApplicationContext()    创建容器（Servlet → AnnotationConfigServletWebServerApplicationContext）
      ├─ prepareContext()              注册启动类 BeanDefinition
      ├─ refreshContext()  ★★★
      │    └─ refresh()
      │         ├─ invokeBeanFactoryPostProcessors()  ★ 自动配置在此解析
      │         ├─ registerBeanPostProcessors()
      │         ├─ onRefresh()                        ★ 内嵌 Tomcat 在此启动
      │         └─ finishBeanFactoryInitialization()  ★ 所有单例 Bean 实例化
      ├─ 发布 started 事件
      ├─ callRunners()                执行 ApplicationRunner/CommandLineRunner
      └─ 发布 ready 事件              启动完成
```

#### 3.6 两个自定义扩展点

```java
@Component
public class MyRunner implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) {
        // 应用启动完成后执行，适合做缓存预热、数据初始化
        cacheService.preheat();
    }
}

@Component
public class MyListener implements ApplicationListener<ContextRefreshedEvent> {
    @Override
    public void onApplicationEvent(ContextRefreshedEvent event) {
        // 容器刷新完成时触发
    }
}
```

#### 3.7 小结

启动流程可以概括为「**推断 → 环境 → 上下文 → 刷新 → 就绪**」五步，其中 `refresh()` 是 Spring 容器的核心（自动配置、Bean 实例化、内嵌容器启动都在这里发生）。

---

### 4. 内嵌容器原理

#### 4.1 为什么能直接 java -jar 运行

Spring Boot 默认内嵌 Tomcat，把「打 WAR 包丢外部容器」变成「打 JAR 包 `java -jar` 直接跑」。

```
传统方式：
  你的代码 → 打 WAR 包 → 丢进外部 Tomcat（独立安装）→ 启动

Spring Boot：
  你的代码 + 内嵌 Tomcat → 打成一个 Fat Jar → java -jar 直接跑
```

#### 4.2 内嵌容器的抽象层

Spring Boot 用 `ServletWebServerFactory` 接口抽象了「创建 Web 服务器」，不同容器是不同实现：

```
ServletWebServerFactory（接口）
├── TomcatServletWebServerFactory   ← 默认，内嵌 Tomcat
├── JettyServletWebServerFactory   ← 换 Jetty
└── UndertowServletWebServerFactory ← 换 Undertow
```

#### 4.3 换容器

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <exclusions>
        <!-- 为什么排除 tomcat 换 jetty：某些场景需要不同容器的连接模型或性能特性 -->
        <exclusion>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-tomcat</artifactId>
        </exclusion>
    </exclusions>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-jetty</artifactId>
</dependency>
```

#### 4.4 容器启动时机

内嵌 Tomcat 的启动发生在 `refresh()` 的 `onRefresh()` 方法里：

```
refresh()
  └─ onRefresh()
       └─ createWebServer()
            ├─ 获取 ServletWebServerFactory（自动配置注入）
            ├─ 获取 ServletContextInitializer
            └─ factory.getWebServer()  ← 真正启动 Tomcat，监听端口
```

::: tip 💡 面试题：Spring Boot 为什么能直接 `java -jar` 运行？
因为内嵌了 Tomcat 容器，`spring-boot-maven-plugin` 打包时把 Tomcat 和依赖都打进可执行 JAR，`java -jar` 启动时会自动拉起内嵌容器并加载应用——所以不再需要外部 Tomcat。
:::

---

### 5. 可执行 Fat Jar 原理（字节级结构）

#### 5.1 Fat Jar 的目录结构

`spring-boot-maven-plugin` 打的包不是普通 jar，而是「Fat Jar」（胖包），把依赖 + 应用代码 + 内嵌容器全部塞进去：

```
demo.jar
├── META-INF/
│   ├── MANIFEST.MF              ← 声明 Main-Class = JarLauncher
│   └── maven/...
├── org/springframework/boot/loader/   ← Spring Boot 的类加载器相关类
│   ├── JarLauncher.class
│   ├── LaunchedURLClassLoader.class
│   └── ...
├── BOOT-INF/
│   ├── classes/                  ← 应用自己的 .class 文件
│   │   └── com/example/demo/DemoApplication.class
│   ├── lib/                      ← 所有三方依赖 + 内嵌 Tomcat
│   │   ├── spring-boot-3.2.0.jar
│   │   ├── tomcat-embed-core-10.1.x.jar
│   │   └── ...
│   └── classpath.idx             ← 类路径索引
└── ...
```

#### 5.2 MANIFEST.MF 内容

```
Manifest-Version: 1.0
Main-Class: org.springframework.boot.loader.JarLauncher    ← 入口不是你的启动类！
Start-Class: com.example.demo.DemoApplication              ← 真正启动类放这
Spring-Boot-Version: 3.2.0
```

#### 5.3 启动机制：JarLauncher → LaunchedURLClassLoader

```
java -jar demo.jar
  └─ JVM 读取 MANIFEST.MF 的 Main-Class = JarLauncher
       └─ JarLauncher#main()
            ├─ 创建 LaunchedURLClassLoader（★ 能加载嵌套 jar 的特殊类加载器）
            ├─ 把 BOOT-INF/classes 和 BOOT-INF/lib/*.jar 加入类路径
            └─ 反射调用 Start-Class 的 main 方法
                 └─ DemoApplication.main()
                      └─ SpringApplication.run()  ← 回到正常启动流程
```

> 关键：**普通 JVM 的类加载器无法加载「嵌套 jar 里的 jar」**，Spring Boot 用 `LaunchedURLClassLoader` 突破了这一限制，这才是「能直接 java -jar 跑」的底层原因。

---

### 6. 外部化配置加载原理

#### 6.1 Environment 与 PropertySource

Spring Boot 把所有配置源抽象成 `PropertySource`，按顺序放进 `Environment` 的 `PropertySource` 列表里：

```
Environment
  └─ MutablePropertySources（PropertySource 列表，index 越小优先级越高）
       ├─ [0] CommandLinePropertySource      命令行参数 --server.port=9090
       ├─ [1] SystemEnvironmentPropertySource 环境变量
       ├─ [2] ProfileConfigPropertySource     application-prod.yml
       ├─ [3] ApplicationConfigPropertySource application.yml
       └─ [4] DefaultPropertySource          默认值
```

#### 6.2 取值流程

```java
// @Value("${server.port}") 的取值链路
@Value 注解
  └─ AutowiredAnnotationBeanPostProcessor 解析 ${server.port}
       └─ Environment#resolvePlaceholders("${server.port}")
            └─ PropertySourcesPropertyResolver#getProperty("server.port")
                 └─ 遍历 PropertySource 列表，从 index=0 开始找
                      └─ 第一个找到的返回（所以 index 小的优先级高，覆盖后面的）
```

#### 6.3 小结

配置加载的本质是「**一堆 PropertySource 按优先级排好序，取值时从高到低找第一个**」，理解了 `PropertySource` 就理解了「为什么命令行能覆盖 yml」。

---

### 7. Spring Boot 3 的新变化（Java 17 + Jakarta EE）

| 变化 | Spring Boot 2.x | Spring Boot 3.x |
| --- | --- | --- |
| 最低 JDK | JDK 8 | JDK 17 |
| 命名空间 | `javax.*` | `jakarta.*` |
| 配置清单 | `spring.factories` | `AutoConfiguration.imports` |
| 核心依赖 | Spring 5.x | Spring 6.x |
| 原生镜像 | 试验性 | GraalVM Native 成熟支持 |

> 迁移提示：从 2.x 升 3.x 时，`javax.servlet`、`javax.persistence` 等包名要改成 `jakarta.*`，这是最大的破坏性变更。

---

## 面试常问

1. **Spring Boot 自动配置原理？**
   结论：`@EnableAutoConfiguration` → `AutoConfigurationImportSelector` 读取 `AutoConfiguration.imports` 清单，再用 `@ConditionalOnXxx` 按需过滤。展开：只有 classpath 里存在对应依赖（`@ConditionalOnClass` 满足）的自动配置类才会真正生效，所以「引入依赖就自动配好，没引入就跳过」；配合 `@ConditionalOnMissingBean` 给用户留自定义覆盖的口子。

2. **@SpringBootApplication 由哪几个注解组成？**
   结论：`@SpringBootConfiguration`（配置类）+ `@EnableAutoConfiguration`（自动配置）+ `@ComponentScan`（组件扫描）三个。展开：第一个本质是 `@Configuration`，第二个是自动配置入口，第三个默认扫描启动类所在包及子包，这也是「启动类必须放根包」的原因。

3. **@Value 和 @ConfigurationProperties 区别？**
   结论：前者绑定单个属性，后者按前缀批量绑定一组/复杂结构。展开：`@ConfigurationProperties` 支持 `List`/`Map`/嵌套对象、松散绑定（kebab/snake/camel 都能匹配）和 JSR303 校验，适合做可复用配置模块；`@Value` 简单直接但能力弱。

4. **Spring Boot 配置文件加载顺序？**
   结论：命令行参数 > 环境变量 > jar 外部配置 > jar 内部配置 > 默认值，高优先级覆盖低优先级。展开：底层是 `Environment` 里一串按优先级排序的 `PropertySource`，取值时从 index 0 往后找第一个匹配的；「jar 外部 > jar 内部」是实现不重新打包改线上配置的关键。

5. **Spring Boot 和 Spring 有什么区别？**
   结论：Spring 是框架内核（IoC/DI/AOP），Spring Boot 是基于它的脚手架。展开：Spring Boot 用自动配置 + starter + 内嵌容器把 Spring 的配置和部署成本降到最低，本质是「固化最佳实践的 Spring」，没有 Spring Boot 时用 Spring 依然能干活，只是繁琐。

6. **Spring Boot 为什么能直接 java -jar 运行？**
   结论：内嵌 Tomcat + Fat Jar + 自定义类加载器三者配合。展开：`spring-boot-maven-plugin` 把依赖和内嵌容器打进 `BOOT-INF/lib`，`JarLauncher` 用 `LaunchedURLClassLoader` 加载嵌套 jar，再反射调用 `Start-Class` 的 main 方法拉起应用。

7. **SpringApplication.run() 的启动流程？**
   结论：推断应用类型 → 准备 Environment → 创建 ApplicationContext → refresh() 刷新容器 → 就绪。展开：`refresh()` 里依次执行「解析自动配置 → 启动内嵌容器 → 实例化所有单例 Bean」，是整个启动过程的核心；`ApplicationRunner`/`CommandLineRunner` 是启动完成后的扩展点。

8. **@Transactional 失效的场景？**
   结论：自调用、非 public、异常被吞、受检异常未指定 rollbackFor、存储引擎不支持事务。展开：核心是 Spring 事务靠 AOP 动态代理实现，只有通过代理对象调用才触发切面，`this.method()` 自调用绕过了代理。

---

**相关链接**：[Spring](./Spring) · [Spring MVC](./Spring%20MVC) · [MyBatis](./MyBatis) · [MyBatis-Plus](./MyBatis-Plus) · [Spring Security](./Spring%20Security) · [Maven](./Maven) · [Spring Cloud](../微服务/Spring%20Cloud) · [Nacos](../微服务/Nacos) · [JVM](../Java核心/JVM) · [并发编程](../Java核心/并发编程) · [Java 集合](../Java核心/Java集合)
