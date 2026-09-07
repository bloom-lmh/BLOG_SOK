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

| 核心理念                                          | 含义                                   | 对应解决的问题 |
| ------------------------------------------------- | -------------------------------------- | -------------- |
| **约定优于配置**（Convention over Configuration） | 大量默认约定，没写配置就用默认值       | 配置地狱       |
| **自动配置**（Auto Configuration）                | 根据 classpath 里的依赖自动装配 Bean   | 配置地狱       |
| **起步依赖**（Starter）                           | 一个依赖聚合一组功能所需的全部 jar     | 依赖地狱       |
| **内嵌容器**（Embedded Server）                   | 把 Tomcat 打进 jar，`java -jar` 直接跑 | 部署麻烦       |

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

| Starter                          | 作用                                        | 引入的关键依赖                           |
| -------------------------------- | ------------------------------------------- | ---------------------------------------- |
| `spring-boot-starter-web`        | Web 开发                                    | `spring-webmvc` + 内嵌 Tomcat + Jackson  |
| `spring-boot-starter-webflux`    | 响应式 Web                                  | `spring-webflux` + Netty                 |
| `spring-boot-starter-test`       | 测试                                        | JUnit5 + Mockito + AssertJ + spring-test |
| `spring-boot-starter-data-jpa`   | ORM 框架 JPA                                | Hibernate + spring-data-jpa              |
| `spring-boot-starter-data-redis` | 集成 Redis                                  | spring-data-redis + Lettuce              |
| `spring-boot-starter-jdbc`       | JDBC + 连接池                               | spring-jdbc + HikariCP                   |
| `spring-boot-starter-security`   | 集成 [Spring Security](./Spring%20Security) | spring-security-\*                       |
| `spring-boot-starter-validation` | 参数校验（`@Valid`）                        | hibernate-validator                      |
| `spring-boot-starter-aop`        | 切面编程                                    | spring-aop + aspectjweaver               |
| `spring-boot-starter-amqp`       | 集成 RabbitMQ                               | spring-rabbit                            |
| `spring-boot-starter-mail`       | 发送邮件                                    | spring-mail + jakarta.mail               |
| `spring-boot-starter-actuator`   | 监控与健康检查                              | micrometer + actuator                    |
| `spring-boot-starter-cache`      | 缓存抽象                                    | spring-context-support                   |
| `spring-boot-starter-thymeleaf`  | 模板引擎                                    | thymeleaf                                |

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

##### 基本规则

```yaml
# 1. key: value，冒号后必须有空格
# 2. 用缩进表示层级，缩进必须一致（通常 2 空格），不能用 Tab
# 3. 大小写敏感
# 4. # 开头是注释
# 5. --- 分隔多文档，... 表示文档结束
```

##### 数据类型

YAML 自动推断类型，但有时候需要引号避免歧义：

```yaml
# 字符串（不需要引号，但含特殊字符时必须加）
name: hello
name: "hello world"              # 双引号：支持转义符 \n \t
name: 'hello\nworld'             # 单引号：\n 原样输出，不转义

# 数字（直接写，自动识别类型）
count: 42
price: 19.99

# 布尔（注意：yes/no/on/off 在 YAML 里也是布尔值！）
enabled: true
enabled: false
# ⚠️ 坑：enabled: yes  会被解析为 true，不是字符串 "yes"

# null（~ 或 null 或空值）
value: ~
value: null
value:                         # 什么都不写也是 null

# 日期时间（ISO 8601 格式自动识别）
createTime: 2026-08-01
createTime: 2026-08-01T10:30:00+08:00
```

##### 对象（嵌套结构）

```yaml
# 写法一：缩进（推荐）
server:
  port: 8080
  servlet:
    context-path: /api

# 写法二：行内（等价，但可读性差）
server: {port: 8080, servlet: {context-path: /api}}
```

##### 数组 / List

```yaml
# 写法一：块序列（推荐，每个元素一行）
servers:
  - 127.0.0.1
  - 192.168.1.1
  - 10.0.0.1

# 写法二：行内（适合短数组）
servers: [127.0.0.1, 192.168.1.1, 10.0.0.1]

# 对象数组（每个 - 代表一个元素，缩进代表元素内部结构）
users:
  - name: 张三
    age: 25
    roles:                   # 内嵌数组
      - admin
      - user
  - name: 李四
    age: 30
    roles:
      - user
```

##### Map / 键值对

```yaml
# 写法一：缩进
config:
  timeout: 30
  retry: 3
  mode: strict

# 写法二：行内
config: {timeout: 30, retry: 3, mode: strict}
```

##### 多行字符串

```yaml
# | 保留换行（literal style）
# 适合脚本、SQL、配置文本
script: |
  SELECT * FROM user
  WHERE status = 1
  ORDER BY create_time DESC;

# > 折叠换行为空格（folded style）
# 适合长段落文字
description: >
  这是一个很长的描述文字，
  换行会被折叠成空格，
  段落之间空行才保留换行。

# 结尾控制符：
# |+ 保留末尾换行   |- 去掉末尾换行
# >+ 保留末尾换行   >- 去掉末尾换行
```

##### 锚点与引用（复用配置片段）

```yaml
# & 定义锚点，* 引用锚点，<< 合并
# 适合多个数据源只是库名不同时复用配置
default-ds: &defaultDs # &defaultDs 定义一个锚点（别名）
  username: root
  password: '123456'
  driver-class-name: com.mysql.cj.jdbc.Driver

spring:
  datasource:
    url: jdbc:mysql://localhost:3306/db1
    <<: *defaultDs # << 导入锚点内容，* 引用
    # 等价于把 username/password/driver-class-name 都粘过来
```

##### 常见坑

```yaml
# ⚠️ 坑1：冒号后没空格，YAML 当字符串处理
# key:value  → 这是一个普通字符串，不是 key-value 对！

# ⚠️ 坑2：Tab 缩进报错
# 缩进只能用空格，不能用 Tab 键

# ⚠️ 坑3：yes/no/on/off 被解析为布尔值
# country: no  → 解析为 false，不是字符串 "no"
# 正确写法：country: "no"

# ⚠️ 坑4：0 开头的数字被当八进制
# 旧版 YAML 规范：port: 0123  → 解析为 83（八进制转十进制）
# YAML 1.2 已修复，但保险起见：port: "0123"

# ⚠️ 坑5：密码含特殊字符，必须加引号
# password: abc@123  → @ 可能引起歧义
# password: "abc@123"
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

| 方式                                     | 适用场景     | 特点                                                                   |
| ---------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| `@Value("${x.y}")`                       | 单个属性     | 简单直接，但每个字段都要写一次，无法绑定复杂结构，不支持松散绑定       |
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
    timeout: '30'
    retry: '3'
  security:
    username: admin
    password: '123456'
```

#### 5.3 松散绑定（Relaxed Binding）

`@ConfigurationProperties` 的一大优势是**松散绑定**：配置文件的写法可以很随意，Spring 会自动归一化匹配。

| 配置写法                                | 是否匹配属性 `maxTimeout` |
| --------------------------------------- | ------------------------- |
| `myapp.max-timeout`（kebab-case，推荐） | ✅                        |
| `myapp.max_timeout`（snake-case）       | ✅                        |
| `myapp.maxTimeout`（camelCase）         | ✅                        |
| `myapp.MAX_TIMEOUT`（大写）             | ✅                        |

> `@Value` 不支持这种松散绑定，必须精确写 `@Value("${myapp.max-timeout}")`。

#### 5.4 @ConfigurationProperties 的三种注册方式

`@ConfigurationProperties` 本身只是一个「标记」——它告诉 Spring：**这个类要绑定配置文件里指定前缀的属性**。但谁来把这个类注册成 Bean？有三种方式，各自适用不同场景。

::: code-group

```java [方式一]
// 一个注解搞定：@ConfigurationProperties 负责绑定配置，
// @Component 负责把当前类注册为 Bean，两步合一
@Component
@ConfigurationProperties(prefix = "myapp")
public class MyAppProperties {
    private String name;
    private List<String> servers;
    private Map<String, String> config;
    private Security security = new Security();

    // getter/setter 必须保留（Spring 通过 setter 注入值）
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public List<String> getServers() { return servers; }
    public void setServers(List<String> servers) { this.servers = servers; }
    // ... 其余省略

    public static class Security {
        private String username;
        private String password;
        // getter/setter 省略
    }
}
```

```java [方式二]
// 配置类集中管理，属性类本身不 @Component
@ConfigurationProperties(prefix = "myapp")
public class MyAppProperties {
    private String name;
    private String url;
    // getter/setter 省略
}

// 在配置类上用 @EnableConfigurationProperties 显式注册
@Configuration
@EnableConfigurationProperties(MyAppProperties.class)
public class AppConfig {
    // 这样 MyAppProperties 就被注册成 Bean 了
    // 不需要在 MyAppProperties 上加 @Component

    @Bean
    public SomeBean someBean(MyAppProperties props) {
        // ↑ @Bean 方法的参数会自动注入容器中已有的 Bean
        // Spring 看到参数类型 MyAppProperties → 去容器里找该类型的实例 → 找到就注入
        // 所以不需要手动 new 也不用 @Autowired，参数直接可用
        return new SomeBean(props.getName());
    }
}
```

```java [方式三]
// 配置类 + 扫描包路径，批量注册
@ConfigurationProperties(prefix = "myapp")
public class MyAppProperties {
    private String name;
    private String url;
    // getter/setter 省略
}

@ConfigurationProperties(prefix = "third")
public class ThirdApiProperties {
    private String appKey;
    private String appSecret;
    // getter/setter 省略
}

// 扫描指定包下的所有 @ConfigurationProperties 类（无需 @Component）
@Configuration
@ConfigurationPropertiesScan("com.example.demo.config")
public class AppConfig {
    // 包下所有 @ConfigurationProperties 类自动注册为 Bean
}
```

:::

三种方式对比：

| 方式                                        | 优点                                                                                                                         | 缺点                                                                                            | 适用场景                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **方式一 `@Component`**                     | 最简洁，一个注解搞定                                                                                                         | ① 依赖隐式扫描，误改包路径可能丢失 ② 初始化顺序不可控，其他 Bean 可能注入到还没绑好值的属性对象 | 项目内部简单配置                                                             |
| **方式二 `@EnableConfigurationProperties`** | ① 显式注册，不依赖扫描，一眼看清哪些配置类生效 ② 保证属性绑定**先于** `@Bean` 方法执行，不会出现"还没绑好就被注入"的时序问题 | 多一个注解引用的步骤                                                                            | Spring Boot 官方源码写法（如 `RedisAutoConfiguration`），自定义 Starter 必用 |
| **方式三 `@ConfigurationPropertiesScan`**   | 批量注册，不用逐个写                                                                                                         | 需要额外配置扫描路径，仍然是隐式扫描                                                            | 有大量配置类需要统一管理时                                                   |

**方式二为什么更安全？**

核心区别：方式一靠 `@ComponentScan` 扫描注册，**谁扫到谁就是 Bean**——换个包路径、改个类名可能就丢了，而且初始化顺序不确定。方式二在 `@EnableConfigurationProperties` 注解里**显式引用类名**，同时保证属性绑定在 `@Bean` 方法之前完成——Spring 把这当成"配置类依赖的属性类"，优先初始化。

**实际项目怎么选？**

- **自己项目里的配置** → 方式① `@Component`，最省事
- **写自定义 Starter / 第三方库** → 方式② `@EnableConfigurationProperties`，属性类不注册，留给调用方决定是否启用
- **Spring Boot 源码怎么做的？** → 方式②，`RedisAutoConfiguration` 上 `@EnableConfigurationProperties(RedisProperties.class)`，`RedisProperties` 本身没有 `@Component`

#### 5.5 @ConfigurationProperties 与 JSR-303 校验的相互作用

为什么 `@ConfigurationProperties` 上的 `@NotNull` / `@Min` 能生效？这不是自动的，背后是一个明确的机制。

**关键：`@Validated` + `ConfigurationPropertiesBindingPostProcessor`**

```java
@Component
@ConfigurationProperties(prefix = "myapp")
@Validated                          // ← 激活 JSR-303 校验的开关
public class MyAppProperties {

    @NotNull(message = "名字不能为空")  // ← JSR-303 注解
    private String name;

    @Min(1)
    @Max(100)
    private Integer count;

    @NotNull
    private Security security = new Security();

    // getter/setter 省略...
    public static class Security {
        @NotBlank
        private String username;
        @NotBlank
        private String password;
        // getter/setter 省略...
    }
}
```

**机制流程（三步）：**

```
application.yml 配置值
    ↓ 【第一步】@ConfigurationProperties 通过 setter 把值绑到字段上
属性绑定完成
    ↓ 【第二步】ConfigurationPropertiesBindingPostProcessor（BeanPostProcessor）
    │         在 afterPropertiesSet() 阶段拦截
    ↓ 【第三步】检测到 @Validated → 调用 JSR-303 验证器（LocalValidatorFactoryBean）
    │         校验 @NotNull/@Min/@Max 等约束
    ↓         不通过 → 抛 ConfigurationPropertiesValidationException，启动失败
```

**为什么要 @Validated 而不是 @Valid？**

- `@Valid` 是 JSR-303 标准注解，用于**方法参数/返回值**的校验触发（如 `@Valid @RequestBody`）
- `@Validated` 是 Spring 对 `@Valid` 的增强，额外支持**类级别**校验触发 + 分组校验
- `ConfigurationPropertiesBindingPostProcessor` 检测的是 `Validated` 接口（`@Validated` 会让类实现此接口），而不是 `@Valid`

**源码简化：**

```java
// ConfigurationPropertiesBindingPostProcessor 核心逻辑（简化版）
@Override
public Object postProcessAfterInitialization(Object bean, String beanName) {
    if (bean instanceof Validated) {            // ← @Validated 让类实现 Validated 接口
        Validator validator = this.validator;    // ← 获取 JSR-303 验证器
        Set<ConstraintViolation<Object>> violations = validator.validate(bean);
        if (!violations.isEmpty()) {
            throw new ConfigurationPropertiesValidationException(violations);
            // ← 校验不通过，启动阶段直接报错，不会让配置错误的应用上线
        }
    }
    return bean;
}
```

**为什么设计成启动失败而不是运行时抛异常？**

配置错误属于**致命错误**——数据库密码配错了，运行起来再报错也没意义。Spring Boot 的原则是「fail-fast」：启动时发现配置不合法，直接启动失败，让运维人员立刻发现，而不是等到运行时才暴露。

**小结：**

`@ConfigurationProperties` 负责绑值，`@Validated` 负责开关，`ConfigurationPropertiesBindingPostProcessor` 负责串联——三者在 **Bean 初始化后阶段**完成「绑定 → 校验」的流水线，确保配置在应用启动时就验证完毕。

#### 5.6 小结

`@Value` 适合零散单值，`@ConfigurationProperties` 适合成组配置（推荐后者做可复用配置模块），配合松散绑定和校验是 Spring Boot 配置绑定的标准姿势。

---

### 6. 常用注解体系

#### 6.1 组件注解（分层）

| 注解              | 作用                | 等价关系                                |
| ----------------- | ------------------- | --------------------------------------- |
| `@Component`      | 通用组件            | 基础                                    |
| `@Service`        | 业务层              | `@Component` 的语义化别名               |
| `@Repository`     | 数据访问层          | `@Component` + 异常翻译                 |
| `@Controller`     | 控制层（返回视图）  | `@Component` 的语义化别名               |
| `@RestController` | 控制层（返回 JSON） | `@Controller` + `@ResponseBody`         |
| `@Configuration`  | 配置类              | `@Component`，但会被 CGLIB 增强保证单例 |

#### 6.2 依赖注入注解

| 注解         | 作用                         | 说明                                  |
| ------------ | ---------------------------- | ------------------------------------- |
| `@Autowired` | 按类型注入                   | 默认必填，`required=false` 可空       |
| `@Resource`  | 按名称再按类型注入           | JDK 原生，Spring 兼容                 |
| `@Qualifier` | 配合 `@Autowired` 按名称限定 | 多个同类型 Bean 时消歧                |
| `@Value`     | 注入配置/字面量              | `@Value("${x}")` / `@Value("#{1+1}")` |

#### 6.3 请求映射注解

```java
@GetMapping    // 等价 @RequestMapping(method=GET)
@PostMapping   // 等价 @RequestMapping(method=POST)
@PutMapping    // 更新
@DeleteMapping // 删除
@PatchMapping  // 部分更新
```

#### 6.4 参数绑定注解

| 注解              | 作用          | 示例                                    |
| ----------------- | ------------- | --------------------------------------- |
| `@PathVariable`   | 取路径参数    | `/user/{id}` → `@PathVariable Long id`  |
| `@RequestParam`   | 取查询参数    | `?name=x` → `@RequestParam String name` |
| `@RequestBody`    | 取请求体 JSON | 反序列化为对象                          |
| `@RequestHeader`  | 取请求头      | `@RequestHeader("token") String token`  |
| `@CookieValue`    | 取 Cookie     | `@CookieValue("JSESSIONID") String sid` |
| `@ModelAttribute` | 表单/对象绑定 | 传统表单提交                            |

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

::: code-group

```yaml [application.yml]
# 公共配置（所有环境共享）
spring:
  application:
    name: demo-app
  profiles:
    active: dev # 指定激活哪个环境，通常由启动参数覆盖

server:
  port: 8080
```

```yaml [application-dev.yml]
# 开发环境（本地库，密码写死没关系）
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/demo_dev
    username: root
    password: 'root'
server:
  port: 8080
```

```yaml [application-test.yml]
# 测试环境
spring:
  datasource:
    url: jdbc:mysql://test-db:3306/demo_test
```

```yaml [application-prod.yml]
# 生产环境——账号密码不写死，从环境变量/配置中心读取
spring:
  datasource:
    url: jdbc:mysql://prod-db:3306/demo
    username: ${DB_USERNAME} # ← 运行时取环境变量 DB_USERNAME
    password: ${DB_PASSWORD} # ← 运行时取环境变量 DB_PASSWORD
server:
  port: 8080
```

:::

##### 关于 `${DB_USERNAME}` 的解释

这是 **配置占位符**（Placeholder），不是 YAML 语法，而是 Spring Boot 的 `Environment` 在解析配置时做的变量替换：

```
${DB_USERNAME}
   ↓ Spring 解析时，按以下顺序查找（找到第一个就停）
   ├─ ① 命令行参数：--DB_USERNAME=xxx
   ├─ ② 环境变量：DB_USERNAME=xxx（Windows set / Linux export）
   ├─ ③ application.yml 里其他配置项
   ├─ ④ JVM 系统属性：-DDB_USERNAME=xxx
   └─ ⑤ 默认值：${DB_USERNAME:root} 冒号后是默认值
```

**为什么生产要这么写？**

- 密码写在代码里 = 硬编码，git 提交后所有人都能看到，泄露风险大
- 环境变量在操作系统层面，只有部署人员能设置，代码仓库里不存密码
- 更专业的做法是配合配置中心（Nacos Config / Spring Cloud Config），由配置中心统一管理，运行时动态注入

#### 7.3 三种激活方式

```bash
# 方式一：配置文件里写死（开发常用）
# spring.profiles.active=dev

# 方式二：启动参数（部署常用，优先级最高）
java -jar demo.jar --spring.profiles.active=prod

# 方式三：环境变量
# SPRING_PROFILES_ACTIVE=prod
```

#### 7.4 激活多个 Profile

```bash
# 同时激活 dev 和 swagger 两个 profile
java -jar demo.jar --spring.profiles.active=dev,swagger
```

```yaml
# 配置文件里也可以写多个
spring:
  profiles:
    active: dev, swagger
```

#### 7.5 Profile 的覆盖规则

```
application.yml（公共配置，优先级最低）
    ↓ 被覆盖
application-dev.yml（环境专属，覆盖公共配置）
    ↓ 被覆盖
命令行参数 --spring.profiles.active=prod（优先级最高）
```

**具体哪个配置最终生效：**

```
# application.yml 公共
server:
  port: 8080        # ← 公共

# application-dev.yml 开发
server:
  port: 8081        # ← 覆盖公共，dev 环境最终端口 8081

# application-prod.yml 生产
server:
  port: 8080        # ← 覆盖公共，prod 环境最终端口 8080
```

#### 7.6 多文档 YAML（一个文件写多个 Profile）

Spring Boot 支持在一个 `application.yml` 里用 `---` 分隔，定义多个环境的配置，适合小项目：

```yaml
# 公共配置
spring:
  application:
    name: demo-app

server:
  port: 8080

---
# 开发环境
spring:
  config:
    activate:
      on-profile: dev # 注意：Spring Boot 2.4+ 用这个，不是 spring.profiles
server:
  port: 8081

---
# 生产环境
spring:
  config:
    activate:
      on-profile: prod
server:
  port: 8080
  shutdown: graceful
```

> **注意：** Spring Boot 2.4 以后，多文档 YAML 里的 profile 声明从 `spring.profiles` 改成了 `spring.config.activate.on-profile`，旧写法 `spring.profiles: dev` 在 2.4+ 会警告。

#### 7.7 Profile 分组（Spring Boot 2.4+）

可以把多个 profile 归为一组，激活一个组就激活一组 profile：

```yaml
# application.yml
spring:
  profiles:
    group:
      # 组名: 要激活的 profile 列表
      dev: dev, dev-db, dev-redis, dev-log # 激活 dev 组 = 同时激活 4 个
      test: test, test-db, test-redis
      prod: prod, prod-db, prod-redis, prod-log
```

```bash
# 激活 dev 组，自动激活 dev + dev-db + dev-redis + dev-log
java -jar demo.jar --spring.profiles.active=dev
```

#### 7.8 包含其他 Profile（spring.profiles.include）

```yaml
# application-dev.yml
spring:
  profiles:
    include: dev-db, dev-redis # 激活 dev 时，自动额外激活 dev-db 和 dev-redis


# 等价于手动激活 dev, dev-db, dev-redis
```

#### 7.9 @Profile 注解

```java
@Component
@Profile("dev")   // 这个 Bean 只在 dev 环境创建
public class DevOnlyService {
    public void init() {
        System.out.println("开发环境初始化...");
    }
}

@Component
@Profile("!dev")  // 非 dev 环境（! 表示取反）
public class ProdOnlyService {
    public void init() {
        System.out.println("非开发环境初始化...");
    }
}
```

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

#### 7.10 Profile 条件表达式

```java
@Component
@Profile("dev | test")        // dev 或 test 环境生效
public class DevOrTestService { }

@Component
@Profile("dev & swagger")     // dev 且 swagger 同时激活才生效
public class DevWithSwaggerService { }

@Component
@Profile("!prod")             // 非 prod 环境生效
public class NonProdService { }
```

#### 7.11 Profile 与日志配合

```yaml
# application-dev.yml
logging:
  level:
    com.example: DEBUG
  pattern:
    console: '%d{HH:mm:ss.SSS} %highlight(%-5level) %cyan(%logger{50}) - %msg%n'  # 彩色

# application-prod.yml
logging:
  level:
    com.example: WARN
    org.springframework: WARN
  file:
    name: /var/log/app/app.log
  pattern:
    file: '%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n'
```

```xml
<!-- logback-spring.xml 里也支持分环境 -->
<springProfile name="dev">
    <logger name="com.example" level="DEBUG"/>
    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
    </root>
</springProfile>

<springProfile name="prod">
    <logger name="com.example" level="WARN"/>
    <root level="WARN">
        <appender-ref ref="FILE"/>
        <appender-ref ref="ERROR_FILE"/>
    </root>
</springProfile>
```

#### 7.12 小结

| 功能                      | 说明                          | 适用场景         |
| ------------------------- | ----------------------------- | ---------------- |
| `application-{env}.yml`   | 按文件分离                    | 常规项目，推荐   |
| 多文档 YAML `---`         | 一个文件多个环境              | 小项目，配置简单 |
| Profile 分组              | 一组 profile 批量激活         | 微服务多组件     |
| `@Profile`                | 按环境创建 Bean               | 环境特有的 Bean  |
| `spring.profiles.include` | 激活时自动包含                | 解耦公共子配置   |
| `spring.profiles.group`   | 2.4+ 新特性，推荐替代 include | 分组管理         |

Profile 是「环境隔离」的官方方案，配合「外部化配置」在生产环境做到**配置与代码彻底分离**，是 DevOps 实践的基础。

---

### 8. 日志配置（完整版）

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

#### 8.2 日志级别（从低到高）

| 级别    | 数值 | 说明                     | 生产建议                  |
| ------- | ---- | ------------------------ | ------------------------- |
| `TRACE` | 0    | 最细粒度，跟踪每一步执行 | ❌ 关闭，只在本地调试     |
| `DEBUG` | 1    | 调试信息，开发阶段看     | ❌ 关闭，量太大           |
| `INFO`  | 2    | 关键业务节点信息         | ✅ 开启，确认系统运行正常 |
| `WARN`  | 3    | 潜在问题，但不影响服务   | ✅ 开启，需要关注         |
| `ERROR` | 4    | 错误、异常，需要处理     | ✅ 必须开启               |

**级别过滤规则：** 设置了 `INFO` 级别，只会打印 `INFO` / `WARN` / `ERROR`，`DEBUG` 和 `TRACE` 被过滤掉。在真实的开发场景中会与Profile进行配合。不同环境日志打印级别不同

#### 8.3 application.yml 配置日志（推荐方式）

Spring Boot 支持直接在 `application.yml` 里配置日志，**不需要写 logback-spring.xml** 就能满足大部分场景：

```yaml
# application.yml 日志配置全解
logging:
  level:
    root: INFO # 全局日志级别
    com.example: DEBUG # 指定包级别（覆盖全局）
    com.example.mapper: TRACE # MyBatis SQL 日志，打印完整 SQL
    org.springframework.web: WARN # 屏蔽 Spring 框架的 INFO 日志

  # 日志分组：把多个包/类归为一组，统一设置级别
  # 格式：组名: 包名1, 包名2, 包名3
  group:
    mybatis: com.example.mapper, com.example.dao
    web: org.springframework.web, org.springframework.web.servlet

  pattern:
    console: '%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n'
    file: '%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n'

  file:
    name: logs/app.log # 日志文件路径
    max-size: 100MB # 每个文件最大 100MB
    max-history: 30 # 保留 30 天
    total-size-cap: 2GB # 总日志大小上限
```

**日志分组**（`logging.group`）具体怎么用：

```yaml
# 第一步：定义分组——把多个包名收进一个组
# 格式：group.组名: 包名1, 包名2, 包名3
logging:
  group:
    # 自定义分组
    mybatis: com.example.mapper, com.example.dao, org.mybatis.spring
    web: org.springframework.web, org.springframework.web.servlet
    third-party: org.springframework, org.hibernate, org.apache, com.netflix

  # 第二步：用组名设级别，一行控制整个组
  level:
    root: INFO # 全局默认 INFO
    mybatis: TRACE # 整个 mybatis 组（3 个包）全部 TRACE，看完整 SQL
    web: WARN # 整个 web 组，只报 WARN 以上
    third-party: WARN # 所有第三方库，只报 WARN 以上
    com.example: DEBUG # 自己代码 DEBUG


# 等价于手动写了这么多行：
# logging.level.com.example.mapper: TRACE
# logging.level.com.example.dao: TRACE
# logging.level.org.mybatis.spring: TRACE
# logging.level.org.springframework.web: WARN
# logging.level.org.springframework.web.servlet: WARN
# logging.level.org.springframework: WARN
# logging.level.org.hibernate: WARN
# logging.level.org.apache: WARN
# logging.level.com.netflix: WARN
```

**Spring Boot 内置的预定义分组（可以直接用）：**

| 分组名 | 包含的包                                                                                                                                                                                                | 默认级别 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `web`  | `org.springframework.core.codec, org.springframework.http, org.springframework.web, org.springframework.boot.actuate.endpoint.web, org.springframework.boot.web.servlet.ServletContextInitializerBeans` | INFO     |
| `sql`  | `org.springframework.jdbc, org.hibernate, org.jooq, org.mybatis.spring`                                                                                                                                 | INFO     |

所以你可以直接写：

```yaml
logging:
  level:
    sql: TRACE # 查看所有 SQL 日志（包括 MyBatis + Hibernate 的 SQL）
    web: WARN # 屏蔽 Spring Web 的 INFO 日志，只看 WARN 以上
```

#### 8.4 日志占位符详解（% 开头的符号）

`%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n` 这个 pattern 里每个符号的含义：

| 占位符        | 含义                          | 示例输出                              |
| ------------- | ----------------------------- | ------------------------------------- |
| `%d{pattern}` | 日期时间，`{}` 里写格式       | `2026-08-22 14:30:15.123`             |
| `%thread`     | 当前线程名                    | `http-nio-8080-exec-1`                |
| `%-5level`    | 日志级别，左对齐占5位         | `INFO ` / `ERROR`                     |
| `%logger{50}` | Logger 名（类名），最长50字符 | `c.e.demo.controller.HelloController` |
| `%msg`        | 日志内容                      | `hello 接口被调用`                    |
| `%n`          | 换行符（跨平台自动识别）      | `\n`                                  |
| `%L`          | 代码行号（⚠️ 有性能开销）     | `42`                                  |
| `%M`          | 方法名（⚠️ 有性能开销）       | `hello`                               |
| `%X{key}`     | MDC 值（见下文链路追踪）      | `trace-123`                           |

> 线上环境避免用 `%L` 和 `%M`，它们通过**获取堆栈**来推断行号/方法名，高并发下性能损耗明显。

#### 8.5 logback-spring.xml 完整配置（高级控制）

当 `application.yml` 不够用时（比如要区分控制台/文件格式、异步日志、按大小滚动的组合策略），才需要用 `logback-spring.xml`。

**为什么必须叫 `logback-spring.xml` 而不是 `logback.xml`？**

- `logback.xml` — Spring 不参与解析，不支持 `<springProfile>` 标签，无法分环境
- `logback-spring.xml` — Spring 接管解析，支持 `<springProfile>` 分环境控制

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
    <!-- 变量：避免重复写 pattern -->
    <property name="LOG_PATTERN" value="%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] %-5level %logger{50} - %msg%n"/>
    <property name="LOG_PATH" value="logs"/>

    <!-- ① 控制台输出（开发用，带颜色） -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <!-- 彩色日志需要 Logback 的 ColorConverter -->
            <pattern>%d{HH:mm:ss.SSS} %highlight(%-5level) %cyan(%logger{50}) - %msg%n</pattern>
        </encoder>
    </appender>

    <!-- ② 文件输出，按天 + 按大小滚动 -->
    <appender name="FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_PATH}/app.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>${LOG_PATH}/app.%d{yyyy-MM-dd}.%i.log</fileNamePattern>
            <maxFileSize>100MB</maxFileSize>     <!-- 单个文件上限 -->
            <maxHistory>30</maxHistory>           <!-- 保留 30 天 -->
            <totalSizeCap>2GB</totalSizeCap>      <!-- 总日志上限 -->
        </rollingPolicy>
        <encoder>
            <pattern>${LOG_PATTERN}</pattern>
        </encoder>
    </appender>

    <!-- ③ 错误日志单独输出（只记 ERROR 级别，方便排查） -->
    <appender name="ERROR_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
        <file>${LOG_PATH}/error.log</file>
        <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
            <fileNamePattern>${LOG_PATH}/error.%d{yyyy-MM-dd}.%i.log</fileNamePattern>
            <maxFileSize>100MB</maxFileSize>
            <maxHistory>60</maxHistory>            <!-- 错误日志保留更久 -->
        </rollingPolicy>
        <encoder>
            <pattern>${LOG_PATTERN}</pattern>
        </encoder>
        <!-- 关键：只接收 ERROR 级别 -->
        <filter class="ch.qos.logback.classic.filter.ThresholdFilter">
            <level>ERROR</level>
        </filter>
    </appender>

    <!-- ④ 异步日志（生产必备，避免日志 I/O 拖慢业务线程） -->
    <appender name="ASYNC_FILE" class="ch.qos.logback.classic.AsyncAppender">
        <queueSize>1024</queueSize>               <!-- 队列大小，满了丢日志不阻塞 -->
        <discardingThreshold>0</discardingThreshold> <!-- 队列满时是否丢弃 TRACE/DEBUG -->
        <neverBlock>true</neverBlock>             <!-- 队列满时业务线程不阻塞，直接丢弃日志 -->
        <appender-ref ref="FILE"/>
    </appender>

    <!-- 分环境控制 -->
    <springProfile name="dev">
        <logger name="com.example" level="DEBUG"/>
        <root level="INFO">
            <appender-ref ref="CONSOLE"/>
            <appender-ref ref="ASYNC_FILE"/>
        </root>
    </springProfile>

    <springProfile name="prod">
        <!-- 生产环境只输出 WARN 及以上，减少日志量 -->
        <logger name="com.example" level="WARN"/>
        <root level="WARN">
            <appender-ref ref="ASYNC_FILE"/>
            <appender-ref ref="ERROR_FILE"/>
        </root>
    </springProfile>
</configuration>
```

**Logback 配置标签详解：**

| 标签              | 作用                                          | 类比         |
| ----------------- | --------------------------------------------- | ------------ |
| `<configuration>` | 根标签，整份配置的入口                        | 房子的地基   |
| `<property>`      | 定义变量，后面用 `${变量名}` 引用，避免重复写 | 全局变量     |
| `<appender>`      | 定义日志输出目的地（控制台/文件/网络等）      | 水管出口     |
| `<encoder>`       | 把日志事件转成字符串，指定输出格式（pattern） | 打印机       |
| `<rollingPolicy>` | 定义文件滚动策略（什么时候切文件、怎么命名）  | 定时换日志本 |
| `<filter>`        | 过滤日志事件，符合条件的才放行                | 筛子         |
| `<logger>`        | 设置某个包/类的日志级别和 Appender            | 精准控制     |
| `<root>`          | 设置全局默认日志级别和 Appender               | 兜底方案     |
| `<springProfile>` | 分环境配置（只有 `logback-spring.xml` 支持）  | 环境开关     |

所谓的滚动策略就是：文件满了或者新的一天 → 切分文件

#### 8.6 异步日志（生产必备）

同步日志：业务线程执行 `log.info()` → 写入磁盘 → 阻塞等待 I/O 完成 → 返回。高并发下磁盘 I/O 会成为瓶颈。

异步日志：业务线程把日志事件丢进**内存队列**就返回，后台线程批量写入磁盘。

```yaml
# 异步日志的 application.yml 配置
logging:
  logback:
    rollingpolicy:
      max-file-size: 100MB
      max-history: 30
      total-size-cap: 2GB
  # 异步日志底层用 Logback 的 AsyncAppender，见上面 XML 配置
```

**异步日志的风险：**

- 队列满时丢日志（`neverBlock=true` 时业务线程不阻塞，但日志被丢弃）
- 应用崩溃时队列中未写入的日志丢失
- 所以异步日志只适合 INFO/WARN，**ERROR 日志建议同步写入**，确保不丢

#### 8.7 日志对象和Logback流程

日志事件是一个 Java 对象（`ILoggingEvent`），里面存了时间、线程名、级别、消息、异常堆栈等信息。

```json
// 日志事件对象（ILoggingEvent）
{
    time: 2026-08-22 17:17:45.950,
    thread: "http-nio-8080-exec-1",
    level: "INFO",
    logger: "com.example.OrderService",
    message: "订单创建成功",
    ...
}

// Encoder 根据 pattern 转成字符串
"17:17:45.950 [http-nio-8080-exec-1] INFO  c.e.OrderService - 订单创建成功\n"
//                                                          ↑ 写到文件/控制台
```

然后日志事件会发给不同的Appender监听者本质是监听者模式的运用。`<appender>` 标签对应一个独立的对象，每个 Appender 对象内部自己维护自己的 Filter 链和 Encoder。不是 Filter 组成一条链，而是每个 Appender 都有一条独立的 Filter 链

```bash
log.info("xxx")
    ↓
创建 LoggingEvent
    ↓
Logger 遍历 appenderList
    │
    ├─ ConsoleAppender
    │   ├─ Filter链 → 通过 → Encoder → 控制台
    │
    ├─ FileAppender
    │   ├─ Filter链 → 通过 → Encoder → 文件
    │
    └─ AsyncAppender  ← 注意：不走 Filter，直接进队列
        ├─ 丢进内存队列（无 Filter 判断）
        └─ 后台线程取出 → 持有实际的 Appender（如 FILE）
            ├─ Filter链 → 通过 → Encoder → 文件
```

#### 8.8 MDC 链路追踪（Mapped Diagnostic Context）

MDC 是 SLF4J 提供的线程级上下文 Map，**把同一个请求的所有日志关联起来**。

```java
@Component
public class TraceFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) {
        try {
            // ① 把 traceId 放 MDC（每个请求生成一个唯一 ID）
            String traceId = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
            MDC.put("traceId", traceId);

            // ② 业务代码里用 log.info 不用传 traceId，自动带出来
            chain.doFilter(request, response);
        } finally {
            // ③ 必须清理，否则线程复用导致 traceId 串号
            MDC.clear();
        }
    }
}
```

```yaml
# pattern 里加 %X{traceId} 输出 MDC 的值
logging:
  pattern:
    console: '%d{HH:mm:ss.SSS} [%X{traceId}] [%thread] %-5level %logger{50} - %msg%n'
```

输出效果：

```
14:30:15.123 [a1b2c3d4e5f67890] [http-nio-8080-exec-1] INFO  c.e.demo.OrderService - 创建订单
14:30:15.456 [a1b2c3d4e5f67890] [http-nio-8080-exec-1] WARN  c.e.demo.PaymentService - 支付超时
                                                    ↑ 同一个 traceId，说明是同一个请求
```

::: tip
实际是乱的只是按照traceId做了过滤
:::

#### 8.9 动态调整日志级别（生产排查利器）

生产出问题时，重启服务改日志级别代价太大。Spring Boot Actuator 支持**运行时动态调级别**：

```bash
# 把某个包的日志级别动态调成 DEBUG，排查完再调回去
curl -X POST http://localhost:8080/actuator/loggers/com.example \
  -H "Content-Type: application/json" \
  -d '{"configuredLevel": "DEBUG"}'

# 调回去
curl -X POST http://localhost:8080/actuator/loggers/com.example \
  -d '{"configuredLevel": null}'
```

```yaml
# 暴露 loggers 端点才能动态调
management:
  endpoints:
    web:
      exposure:
        include: loggers
```

#### 8.10 切换 Log4j2（当 Logback 不够用时）

**为什么换 Log4j2？** Log4j2 的异步日志性能极好（无锁环形缓冲区，零 GC），高并发场景比 Logback 快 10 倍以上。

```xml
<!-- 排除 Logback，引入 Log4j2 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <exclusions>
        <exclusion>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-logging</artifactId>
        </exclusion>
    </exclusions>
</dependency>

<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-log4j2</artifactId>
</dependency>
```

```xml
<!-- log4j2-spring.xml（放在 resources 下） -->
<?xml version="1.0" encoding="UTF-8"?>
<Configuration>
    <Appenders>
        <Console name="Console" target="SYSTEM_OUT">
            <PatternLayout pattern="%d{HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n"/>
        </Console>
        <!-- 异步日志用无锁环形缓冲区，性能极高 -->
        <Async name="AsyncFile">
            <AppenderRef ref="RollingFile"/>
        </Async>
    </Appenders>
    <Loggers>
        <Root level="INFO">
            <AppenderRef ref="Console"/>
        </Root>
    </Loggers>
</Configuration>
```

#### 8.11 小结

日志配置的核心要点：

1. **日常用 `application.yml` 配日志级别就够了**，别上来就写 `logback-spring.xml`
2. **生产必须用异步日志**，避免日志 I/O 拖慢业务线程
3. **MDC + traceId** 是实现日志链路追踪的必备手段，微服务排障全靠它
4. **`logback-spring.xml` 支持 `<springProfile>`** 分环境，`logback.xml` 不支持
5. **错误日志单独文件**，避免从海量 INFO 里翻 ERROR
6. **动态调级别**是生产排障神器，配合 Actuator 开箱即用

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

| 注解                           | 生效条件                        | 典型场景                      |
| ------------------------------ | ------------------------------- | ----------------------------- |
| `@ConditionalOnClass`          | classpath 存在指定类            | 引入 redis 才配 RedisTemplate |
| `@ConditionalOnMissingClass`   | classpath 不存在指定类          | 缺类时走降级配置              |
| `@ConditionalOnBean`           | 容器中存在指定 Bean             | 依赖别的 Bean 才创建          |
| `@ConditionalOnMissingBean`    | 容器中不存在指定 Bean           | 给用户留覆盖口子              |
| `@ConditionalOnProperty`       | 配置项存在且匹配指定值          | 用开关控制功能                |
| `@ConditionalOnWebApplication` | 是 Web 应用（Servlet/Reactive） | 只有 Web 才配相关 Bean        |
| `@ConditionalOnExpression`     | SpEL 表达式为 true              | 复杂条件判断                  |
| `@ConditionalOnResource`       | 存在指定资源文件                | 有某配置文件才加载            |
| `@ConditionalOnJava`           | JDK 版本满足要求                | 按 JDK 版本分支               |

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

用 Bean Validation 规范（JSR-303/JSR-380，通常由 Hibernate Validator 实现）给字段或方法参数添加约束，再配合 `@Valid`/`@Validated` 自动校验入参。

#### 4.2 常用校验注解

| 注解                | 作用                                  |
| ------------------- | ------------------------------------- |
| `@NotNull`          | 不能为 null                           |
| `@NotEmpty`         | 不能为 null 且长度 > 0（字符串/集合） |
| `@NotBlank`         | 不能为 null 且去掉首尾空格后长度 > 0  |
| `@Size(min, max)`   | 长度/大小在范围内                     |
| `@Min` / `@Max`     | 数值范围                              |
| `@Positive`         | 数值必须大于 0，允许为 null            |
| `@PositiveOrZero`   | 数值必须大于或等于 0，允许为 null      |
| `@Email`            | 邮箱格式                              |
| `@Pattern(regexp)`  | 正则匹配                              |
| `@Past` / `@Future` | 过去/未来时间                         |

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

`@Positive` 通常用于校验单个数值字段或方法参数：

```java
@Validated
@RestController
public class CourseController {

    @GetMapping("/{id}")
    public Result<CourseVO> getCourse(
            @NotNull(message = "{common.id-required}")
            @Positive(message = "{common.id-positive}")
            @PathVariable Long id) {
        return Result.ok(courseService.getCourseById(id));
    }
}
```

```properties
common.id-required=ID 不能为空
common.id-positive=ID 必须大于 0
```

- `@NotNull` 负责校验“不能为空”。
- `@Positive` 负责校验“非空时必须大于 0”，它本身不会拒绝 `null`。
- DTO 字段由方法参数上的 `@Valid` 触发；`@PathVariable`、`@RequestParam` 这类单个方法参数的约束，Controller 上要添加 `@Validated`。
- Spring Boot 3 的导包是 `jakarta.validation.constraints.Positive`。

#### 4.3 如何提取校验错误

`@Valid @RequestBody` 校验失败时，Spring MVC 会抛出
`MethodArgumentNotValidException`。在全局异常处理器中通过
`BindingResult` 取得错误：

```java
@ExceptionHandler(MethodArgumentNotValidException.class)
public Result<Void> handleMethodArgumentNotValid(
        MethodArgumentNotValidException e) {

    String message = e.getBindingResult()
            .getFieldErrors()
            .stream()
            .findFirst()
            .map(DefaultMessageSourceResolvable::getDefaultMessage)
            .orElse(ErrorCode.PARAM_ERROR.getMessageKey());

    return Result.fail(
            ErrorCode.PARAM_ERROR.getCode(),
            message);
}
```

这段代码的执行顺序：

```text
e.getBindingResult()     获取本次参数绑定、校验的完整结果
    ↓
getFieldErrors()         获取所有字段错误：List<FieldError>
    ↓
stream().findFirst()     只取第一个错误：Optional<FieldError>
    ↓
map(...)                 取出 FieldError 的 defaultMessage
    ↓
orElse(...)              没有字段错误时使用“参数错误”消息 key
```

方法引用：

```java
DefaultMessageSourceResolvable::getDefaultMessage
```

等价于：

```java
fieldError -> fieldError.getDefaultMessage()
```

`FieldError` 继承了 `DefaultMessageSourceResolvable`，所以能够调用
`getDefaultMessage()`。

如果暂时不熟悉 Stream，可以写成完全等价的普通代码：

```java
FieldError firstError =
        e.getBindingResult().getFieldError();

String message;
if (firstError != null) {
    message = firstError.getDefaultMessage();
} else {
    message = ErrorCode.PARAM_ERROR.getMessageKey();
}

return Result.fail(
        ErrorCode.PARAM_ERROR.getCode(),
        message);
```

假设 DTO 是：

```java
public class UserRegisterDTO {

    @NotBlank(
            message = "{validation.user.username.not-blank}")
    private String username;
}
```

请求传入空用户名后，生成的 `FieldError` 大致是：

```text
FieldError {
    objectName: "userRegisterDTO",
    field: "username",
    rejectedValue: "",
    bindingFailure: false,
    codes: [
        "NotBlank.userRegisterDTO.username",
        "NotBlank.username",
        "NotBlank.java.lang.String",
        "NotBlank"
    ],
    arguments: [...],
    defaultMessage: "用户名不能为空"
}
```

常用数据：

| 方法 | 得到什么 |
| --- | --- |
| `getObjectName()` | 被校验的 DTO 名称 |
| `getField()` | 出错字段，例如 `username` |
| `getRejectedValue()` | 用户提交但被拒绝的值 |
| `getCodes()` | Spring 生成的错误代码候选数组 |
| `getDefaultMessage()` | 最终提示，例如“用户名不能为空” |
| `isBindingFailure()` | 是否属于类型转换失败，而不是注解校验失败 |

如果校验注解写的是：

```java
@NotBlank(
        message = "{validation.user.username.not-blank}")
```

并且 Validator 已连接 `MessageSource`，那么
`getDefaultMessage()` 通常拿到的是已经翻译后的“用户名不能为空”，不是
`{validation.user.username.not-blank}`。

::: warning 不要直接把整个 FieldError 返回给前端
`rejectedValue` 可能包含密码、手机号等敏感信息。接口通常只返回
`field` 和 `defaultMessage`，CourseMall 当前只返回第一个
`defaultMessage`。
:::

官方数据结构：[Spring FieldError](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/validation/FieldError.html)

#### 4.4 分组校验

**解决的问题：** 同一个 DTO 在不同接口中校验规则不同。比如新增用户时 id 必须为空（由数据库自增），更新用户时 id 不能为空。

```java
// 第一步：定义分组接口（空接口，只做标记）
public interface AddGroup {}
public interface UpdateGroup {}

// 第二步：在 DTO 字段上指定 groups
public class UserDTO {
    // 新增时 id 必须为空，更新时 id 不能为空
    @Null(groups = AddGroup.class, message = "新增时 id 必须为空")
    @NotNull(groups = UpdateGroup.class, message = "更新时 id 不能为空")
    private Long id;

    @NotBlank(groups = {AddGroup.class, UpdateGroup.class}, message = "姓名不能为空")  // 两组都要
    private String name;

    @Email(groups = UpdateGroup.class, message = "邮箱格式不对")  // 只有更新时才校验邮箱
    private String email;
}

// 第三步：在 Controller 上指定用哪个分组
@PostMapping("/add")
public Result add(@Validated(AddGroup.class) @RequestBody UserDTO user) {
    // 只校验加了 groups = AddGroup.class 的字段
    // id → @Null 校验；name → @NotBlank 校验；email → 不校验（没加 AddGroup 分组）
    return Result.ok(userService.add(user));
}

@PostMapping("/update")
public Result update(@Validated(UpdateGroup.class) @RequestBody UserDTO user) {
    // 只校验加了 groups = UpdateGroup.class 的字段
    // id → @NotNull 校验；name → @NotBlank 校验；email → @Email 校验
    return Result.ok(userService.update(user));
}
```

**不指定 groups 时**：默认是 `Default` 分组，只校验没写 `groups` 的字段（或写了 `groups = Default.class` 的字段）。

**注意：** 用 `@Validated` 指定分组后，**没写 `groups` 的字段（即 Default 分组）不会被校验**。所以如果既有分组字段又有通用字段，要在通用字段上加 `groups = {AddGroup.class, Default.class}`。

#### 4.5 嵌套校验

**解决的问题：** 一个 DTO 里嵌套了另一个对象，需要递归校验子对象的字段。

##### 案例一：不分组（简单嵌套）

```java
// 场景：创建订单，订单里有用户信息，都要校验
public class OrderDTO {
    @NotNull(message = "订单号不能为空")
    private String orderNo;

    @NotNull(message = "用户信息不能为空")
    @Valid                         // ← 关键：递归校验 UserInfo 里的字段
    private UserInfo userInfo;
}

public class UserInfo {
    @NotBlank(message = "姓名不能为空")
    private String name;

    @Phone(message = "手机号格式不对")
    private String phone;
}
```

```java
@PostMapping("/create")
// @Valid 触发校验 → 遇到 @Valid → 递归进入 UserInfo 校验 name 和 phone
public Result create(@Valid @RequestBody OrderDTO order) {
    return Result.ok(orderService.create(order));
}
```

**没加 `@Valid` 会怎样？** 外层 `OrderDTO` 的 `@NotNull` 生效，但 `UserInfo` 里的 `@NotBlank`、`@Phone` 全部不校验——子对象被当黑盒，不会递归进去。

##### 案例二：有分组（嵌套 + 分组校验）

```java
// 场景：新增时所有字段必填，更新时用户信息可选
public interface AddGroup {}
public interface UpdateGroup {}

public class OrderDTO {
    @Null(groups = AddGroup.class, message = "新增时 id 为空")
    @NotNull(groups = UpdateGroup.class, message = "更新时 id 不能为空")
    private Long id;

    @Valid                         // ← 触发嵌套校验，分组会传播进来
    @NotNull(groups = AddGroup.class)
    private UserInfo userInfo;
}

public class UserInfo {
    @NotBlank(groups = AddGroup.class, message = "姓名不能为空")
    @NotBlank(groups = UpdateGroup.class, message = "姓名不能为空")
    private String name;

    @Phone(groups = AddGroup.class, message = "手机号格式不对")  // 新增时才校验手机号
    private String phone;
}
```

```java
@PostMapping("/add")
// @Validated 指定分组 → 传播给 @Valid → 子对象只校验加了 AddGroup 的字段
public Result add(@Validated(AddGroup.class) @RequestBody OrderDTO order) {
    // 校验：id → @Null；userInfo → @NotNull + @Valid 递归
    //      UserInfo.name → @NotBlank；UserInfo.phone → @Phone
    return Result.ok(orderService.add(order));
}

@PostMapping("/update")
public Result update(@Validated(UpdateGroup.class) @RequestBody OrderDTO order) {
    // 校验：id → @NotNull；userInfo → 不校验（没加 UpdateGroup）
    //      UserInfo.name → @NotBlank；UserInfo.phone → 不校验
    return Result.ok(orderService.update(order));
}
```

**关键点：** `@Validated` 指定的分组会自动传播给 `@Valid` 标记的子对象。但**子对象里的字段也必须加对应的 `groups`**，否则默认是 `Default` 分组，和传入的分组不匹配，会被跳过。

##### @Valid 和 @Validated 的区别

| 对比     | @Valid（JSR-303 标准）       | @Validated（Spring 的） |
| -------- | ---------------------------- | ----------------------- |
| 分组校验 | ❌ 不支持                    | ✅ 支持（指定 groups）  |
| 嵌套校验 | ✅ 支持（递归触发子对象）    | ❌ 不触发嵌套           |
| 来源     | Jakarta Bean Validation 规范 | Spring 的注解           |

#### 4.6 自定义校验注解

当内置注解不够用时（如校验手机号、身份证、枚举值），可以自定义：

**三步实现：**

```java
// 第一步：自定义注解
@Target({FIELD})                                           // 贴在字段上
@Retention(RUNTIME)
@Constraint(validatedBy = PhoneValidator.class)            // 指定校验器，由它完成校验逻辑
public @interface Phone {
    String message() default "手机号格式不正确";              // 校验失败时的提示
    Class<?>[] groups() default {};                         // 分组校验，必须加
    Class<? extends Payload>[] payload() default {};        // 元数据，必须加
}
```

```java
// 第二步：实现校验器
public class PhoneValidator implements ConstraintValidator<Phone, String> {

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;                     // null 交给 @NotNull 判断，不在这里判空
        }
        return value.matches("^1[3-9]\\d{9}$");  // 校验手机号
    }
}
```

```java
// 第三步：使用
public class UserDTO {
    @NotBlank(message = "手机号不能为空")
    @Phone(message = "手机号格式不对")        // ← 自定义注解，像内置注解一样用
    private String phone;
}
```

**原理：** Spring 启动时扫描 `@Constraint` 注解，把校验器注册到 Validator 的映射表中。校验时根据注解类型找到对应的 `ConstraintValidator` 实例，调用 `isValid()` 方法判断。

**常用场景：**

| 场景     | 校验逻辑                        |
| -------- | ------------------------------- |
| 手机号   | `^1[3-9]\\d{9}$`                |
| 身份证   | `^\\d{17}[\\dXx]$` + 校验位算法 |
| 枚举值   | 检查值是否在枚举定义范围内      |
| 敏感词   | 遍历黑名单列表                  |
| 金额精度 | 检查小数点后不超过 2 位         |

#### 4.7 跨字段校验：@AssertTrue

前面所有注解都是「单字段」——一个注解只校验自己的字段，管不了字段和字段之间的关系。但业务里经常要校验「组合条件」：`minPrice ≤ maxPrice`、开始时间早于结束时间、两次输入的密码一致。

JSR-303 内置的 `@AssertTrue` 解决这个：**贴在一个无参 `boolean` 方法上，校验时自动调用，返回 `true` 通过、`false` 拒绝**。校验逻辑写在方法体里，天然能同时读到多个字段：

```java
public class CourseQueryDTO {
    private BigDecimal minPrice;
    private BigDecimal maxPrice;

    @AssertTrue(message = "{common.param-error}")
    public boolean isPriceRangeValid() {            // 无参 boolean 方法，命名用 isXxx 属性风格
        return minPrice == null || maxPrice == null   // 先判空，null 交给 @NotNull 负责
                || minPrice.compareTo(maxPrice) <= 0; // 两个字段都非空才比较大小
    }
}
```

三个要点：

| 要点 | 说明 |
| --- | --- |
| 为什么用方法而不是注解字段 | 字段级注解只能看「这一个值」；跨字段要同时读两个字段，只能写进一个方法体 |
| 为什么不用自定义校验器 | `@AssertTrue` 本身就是内置约束注解，方法体就是校验逻辑，不用像 4.6 那样写「注解 + ConstraintValidator」两个类 |
| 为什么要先判空 | `minPrice == null` 短路放行，null 交给 `@NotNull`；不判空时只要一个字段为 null，`compareTo` 直接 NPE |

触发机制和普通注解完全一样：接口参数 `@Valid @RequestBody CourseQueryDTO` 校验时会一并执行，失败照样抛 `MethodArgumentNotValidException`（由全局异常处理器接住）；`message` 写 `{key}` 就是走国际化（见 16.7）。

面试一句话：**单字段校验用字段注解，跨字段校验用 `@AssertTrue` 挂在方法上**——`minPrice/maxPrice` 这类成对入参就是标准用法。

#### 4.8 小结

参数校验把「非法参数」挡在业务逻辑之外，`@Valid`（单层）+ `@Validated`（分组/嵌套）+ 自定义注解 + 全局异常处理器组合使用是标准姿势。

---

### 5. 拦截器与过滤器

#### 5.1 过滤器（Filter）vs 拦截器（Interceptor）

| 维度                  | 过滤器 Filter                | 拦截器 Interceptor            |
| --------------------- | ---------------------------- | ----------------------------- |
| 归属                  | Servlet 规范                 | Spring MVC                    |
| 作用范围              | 所有请求（含静态资源）       | 进入 Controller 的请求        |
| 能否拿到 Spring Bean  | 不能直接拿（需手动从容器取） | 能（就是 Spring 管理的 Bean） |
| 能否拿到 Handler 方法 | 不能                         | 能（`HandlerMethod`）         |
| 典型场景              | 编码、CORS、日志             | 登录鉴权、权限、性能统计      |

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

> Spring MVC 启动时遍历所有 WebMvcConfigurer Bean，逐个调用 `addInterceptors()`、`addCorsMappings()` 等方法

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

**InterceptorRegistry 配置项（registry 的链式调用）：**

| 方法                            | 作用                                     | 示例                                                    |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| `addPathPatterns("/**")`        | 拦截哪些路径                             | `addPathPatterns("/api/**", "/admin/**")`               |
| `excludePathPatterns("/login")` | 排除哪些路径（不拦截）                   | `excludePathPatterns("/login", "/register", "/css/**")` |
| `order(1)`                      | 多个拦截器时的执行顺序，数字越小越先执行 | `order(0)` 最先执行                                     |

#### 5.3 小结

鉴权、日志、性能统计这类「横切关注点」，优先用拦截器（能拿 Spring Bean 和 Handler）；编码、CORS 这类更底层的事用过滤器。

---

### 6. CORS 跨域配置

#### 6.1 定义

前后端分离架构下，前端域名（`http://localhost:5173`）和后端域名（`http://localhost:8080`）不同，浏览器同源策略会拦截跨域请求。CORS（Cross-Origin Resource Sharing）是 W3C 标准，通过 **HTTP 响应头**告诉浏览器「允许这个跨域请求」。

#### 6.2 两种配置方式

**方式一：全局 CORS（推荐，一劳永逸）**

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")                    // 允许所有路径
                .allowedOriginPatterns("*")            // 允许所有来源（生产环境要指定具体域名）
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")  // 允许的 HTTP 方法
                .allowedHeaders("*")                   // 允许所有请求头
                .allowCredentials(true)                // 允许携带 Cookie
                .maxAge(3600);                         // 预检请求缓存时间（秒），减少 OPTIONS 请求
    }
}
```

**CorsRegistry 配置项：**

| 方法                            | 作用                                      | 示例                                                                  |
| ------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `addMapping("/**")`             | 允许哪些路径跨域                          | `addMapping("/api/**")`                                               |
| `allowedOriginPatterns("*")`    | 允许哪些来源域名                          | `allowedOriginPatterns("http://localhost:5173", "https://admin.com")` |
| `allowedMethods("GET", "POST")` | 允许哪些 HTTP 方法                        | `allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")`           |
| `allowedHeaders("*")`           | 允许哪些请求头                            | `allowedHeaders("token", "Content-Type")`                             |
| `allowCredentials(true)`        | 是否允许携带 Cookie                       | 需要 Cookie 时设 true，且不能和 `allowedOrigins("*")` 同时用          |
| `maxAge(3600)`                  | 预检请求缓存时间（秒），减少 OPTIONS 请求 | `maxAge(3600)` 一小时内不发 OPTIONS                                   |

**方式二：Controller 级别（精准控制）**

```java
@RestController
@RequestMapping("/api")
// 精确指定某个 Controller 允许跨域
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class ApiController {
    // 也可以加在方法上，只允许某个接口跨域
    @CrossOrigin(origins = "https://admin.example.com")
    @GetMapping("/sensitive")
    public String sensitive() { return "敏感数据"; }
}
```

#### 6.3 预检请求（OPTIONS）

```
浏览器发 POST/PUT/DELETE 请求前，先发一个 OPTIONS 预检请求问服务器「允不允许」
    ↓
服务器返回 CORS 响应头（Access-Control-Allow-Origin 等）
    ↓
浏览器检查响应头，允许 → 发真实请求；不允许 → 拦截并报 CORS 错误
```

**为什么 `maxAge` 重要：** 每次真实请求前都发一个 OPTIONS，浪费性能。设置 `maxAge(3600)` 后，1 小时内不再发预检请求。

#### 6.4 生产环境注意事项

```java
// 生产环境必须指定具体域名，不能用 *
// allowedOriginPatterns("*")  ← 生产不能这么写
//
// 正确做法：用配置项控制
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Value("${cors.allowed-origins:http://localhost:5173}")
    private String[] allowedOrigins;

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(allowedOrigins)  // 从配置读取
                .allowedMethods("GET", "POST")
                .allowCredentials(true);
    }
}
```

```yaml
# application-dev.yml
cors:
  allowed-origins: http://localhost:5173,http://localhost:3000

# application-prod.yml
cors:
  allowed-origins: https://admin.example.com,https://www.example.com
```

#### 6.5 小结

CORS 本质是**后端通过 HTTP 响应头告诉浏览器「这个跨域请求我允许」**，配置要点：`allowedOrigins` 生产环境写具体域名、`allowCredentials` 需要 Cookie 时设为 true、`maxAge` 减少预检请求次数。

### 7. 定时任务

#### 7.1 定义

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

#### 7.2 Cron 表达式完全指南

**什么是 Cron？** 一个字符串，指定什么时候执行。格式：`秒 分 时 日 月 周`

```
 ┌────── 秒（0-59）
 │ ┌───── 分（0-59）
 │ │ ┌──── 时（0-23）
 │ │ │ ┌─── 日（1-31）
 │ │ │ │ ┌── 月（1-12）
 │ │ │ │ │ ┌─ 周（0-7，0和7都代表周日）
 │ │ │ │ │ │
 * * * * * *
```

**特殊字符：**

| 符号 | 含义                     | 示例                                         |
| ---- | ------------------------ | -------------------------------------------- |
| `*`  | 任意值（每）             | `*` 在「分」位 = 每分钟                      |
| `?`  | 不指定（日和周互斥时用） | 日期里写 `?` 表示不关心日期，让「周」来控制  |
| `-`  | 范围                     | `10-15` 在「时」位 = 10点到15点              |
| `,`  | 枚举                     | `1,3,5` 在「周」位 = 周一三五                |
| `/`  | 步长                     | `0/5` 在「分」位 = 从0分开始每5分钟          |
| `L`  | 最后（Last）             | `L` 在「日」位 = 当月最后一天，`6L` 最后周五 |
| `W`  | 最近工作日               | `15W` 在「日」位 = 15号最近的周一到周五那天  |
| `#`  | 第几个                   | `3#2` 在「周」位 = 当月第2个周三             |

**常用示例速查：**

| 表达式              | 含义                          |
| ------------------- | ----------------------------- |
| `0 0 2 * * ?`       | 每天凌晨 2 点                 |
| `0 0 2 * * 1-5`     | 工作日（周一到周五）凌晨 2 点 |
| `0 0/5 * * * ?`     | 每 5 分钟                     |
| `0 0 */2 * * ?`     | 每 2 小时                     |
| `0 0 9-18 * * ?`    | 每天 9 点到 18 点每小时整点   |
| `0 30 9 * * 1-5`    | 工作日每天 9:30               |
| `0 0 0 1 * ?`       | 每月 1 号凌晨 0 点            |
| `0 0 3 ? * 1`       | 每周一凌晨 3 点               |
| `0 0 1 1 * ?`       | 每年 1 月 1 日凌晨 1 点       |
| `0 0/30 9-17 * * ?` | 每天 9-17 点之间每 30 分钟    |
| `0 15 10 L * ?`     | 每月最后一天 10:15            |
| `0 0 2 ? * 6L`      | 每月最后一个周五凌晨 2 点     |
| `0 0 2 ? * 3#1`     | 每月第一个周三凌晨 2 点       |

**注意：**

- `日` 和 `周` 不能同时指定，必须一个写 `?`。比如 `0 0 2 1 * ?` 表示每月1号2点，周写 `?`；`0 0 2 ? * 1` 表示每周一2点，日写 `?`。
- 写错了不会报错，但任务不执行，日志里也看不到错误——这是最坑的地方。

#### 7.3 小结

`@Scheduled` 适合轻量级调度；分布式环境下要配合 [Redis 分布式锁](/learn_database/Redis) 或 [Nacos](../微服务/Nacos) 等避免多实例重复执行。

---

### 8. 异步任务

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

### 9. Actuator 监控与健康检查

#### 8.1 定义

`spring-boot-starter-actuator` 提供生产级监控端点（健康检查、指标、环境信息等），是运维的基础设施。

#### 8.2 完整配置

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,loggers # 暴露哪些端点
        exclude: env,beans # 排除敏感端点
  endpoint:
    health:
      show-details: always # 显示健康详情（组件状态）
  health:
    redis:
      enabled: false # 关闭某个健康检查项
```

#### 8.3 常用端点

| 端点                | 作用                         |
| ------------------- | ---------------------------- |
| `/actuator/health`  | 健康状态（UP/DOWN）          |
| `/actuator/info`    | 应用信息（版本等）           |
| `/actuator/metrics` | 指标列表（内存、线程、HTTP） |
| `/actuator/env`     | 环境属性（敏感，慎暴露）     |
| `/actuator/loggers` | 动态调整日志级别             |
| `/actuator/beans`   | 容器中所有 Bean              |

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

### 10. 优雅停机

```yaml
server:
  shutdown: graceful # 开启优雅停机

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s # 最多等 30 秒
```

> 优雅停机的过程：收到关闭信号 → 停止接收新请求 → 等正在处理的请求完成 → 关闭线程池 → 释放连接池 → 关闭容器。相比直接 `kill -9` 能避免**正在处理的请求被截断**。

---

### 11. 热部署（DevTools）

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

### 12. 事务管理

#### 12.1 @Transactional 完整参数

```java
@Service
public class OrderService {

    @Transactional(
        // 指定哪些异常触发回滚（默认只回滚 RuntimeException 和 Error）
        rollbackFor = Exception.class,
        // 指定哪些异常不触发回滚
        noRollbackFor = {IllegalArgumentException.class},

        // 事务传播行为
        propagation = Propagation.REQUIRED,     // 默认：有事务就用当前的，没有就新建
        // 事务隔离级别
        isolation = Isolation.READ_COMMITTED,   // MySQL 默认，可重复读

        // 超时时间（秒），超时抛异常回滚
        timeout = 30,

        // 只读事务优化（查询时用，告诉数据库不需要加锁）
        readOnly = false
    )
    public void createOrder(Order order) {
        orderMapper.insert(order);
        stockService.deduct(order.getGoodsId(), order.getNum());
    }
}
```

#### 12.2 事务传播行为（Propagation）

**解决的问题：** 方法 B 调方法 A，A 有事务，B 也有事务——B 是加入 A 的事务，还是挂起 A 自己开一个新的？

```java
@Service
public class OrderService {
    @Transactional
    public void createOrder(Order order) {
        orderMapper.insert(order);
        // ↓ 这个方法的事务怎么处理？取决于 propagation
        logService.log("创建订单", order.getId());
    }
}

@Service
public class LogService {
    @Transactional(propagation = Propagation.REQUIRES_NEW)  // 独立事务，不随主事务回滚
    public void log(String action, Long bizId) {
        logMapper.insert(new Log(action, bizId));
    }
}
```

| 传播行为           | 含义                               | 场景                             |
| ------------------ | ---------------------------------- | -------------------------------- |
| `REQUIRED`（默认） | 有事务就加入，没有就新建           | 普通业务方法                     |
| `REQUIRES_NEW`     | 挂起当前事务，新建一个独立事务     | 操作日志（日志不能随主业务回滚） |
| `NESTED`           | 在嵌套事务中执行（JDBC savepoint） | 批量处理中的部分回滚             |
| `SUPPORTS`         | 有事务就加入，没有就非事务执行     | 查询方法                         |
| `NOT_SUPPORTED`    | 以非事务方式执行                   | 不关心事务的方法                 |
| `MANDATORY`        | 必须已有事务，否则抛异常           | 严格要求有事务的方法             |
| `NEVER`            | 必须没有事务，否则抛异常           | 测试用                           |

**`REQUIRES_NEW` 最典型的场景：** 操作日志。你下单失败回滚了，但「下单失败」这个日志本身必须记录，不能跟着回滚。

#### 12.3 事务隔离级别（Isolation）

**解决的问题：** 多个事务并发操作同一行数据时，可能出现的问题。

| 问题       | 含义                                   | 能否避免                 |
| ---------- | -------------------------------------- | ------------------------ |
| 脏读       | 读到另一个事务未提交的数据             | `READ_COMMITTED` 可避免  |
| 不可重复读 | 同一个事务两次读同一行，结果不一样     | `REPEATABLE_READ` 可避免 |
| 幻读       | 同一个事务两次查询范围数据，行数不一样 | `SERIALIZABLE` 可避免    |

| 隔离级别                        | 脏读    | 不可重复读 | 幻读    | 性能 |
| ------------------------------- | ------- | ---------- | ------- | ---- |
| `READ_UNCOMMITTED`              | ❌ 可能 | ❌ 可能    | ❌ 可能 | 最好 |
| `READ_COMMITTED`                | ✅ 避免 | ❌ 可能    | ❌ 可能 | 较好 |
| `REPEATABLE_READ`（MySQL 默认） | ✅ 避免 | ✅ 避免    | ❌ 可能 | 中等 |
| `SERIALIZABLE`                  | ✅ 避免 | ✅ 避免    | ✅ 避免 | 最差 |

```java
@Transactional(isolation = Isolation.READ_COMMITTED)
public void updatePrice(Long id, BigDecimal price) {
    // 只能读到其他事务已提交的数据，不会读到「正在改但还没提交」的脏数据
}
```

**实际项目怎么选：** 绝大多数项目用 `READ_COMMITTED`（读已提交）。MySQL 默认 `REPEATABLE_READ` 但大多数项目会改成 `READ_COMMITTED`，因为性能更好且够用。

#### 12.4 声明式事务 vs 编程式事务

| 方式               | 写法                           | 优点                   | 缺点           |
| ------------------ | ------------------------------ | ---------------------- | -------------- |
| **声明式**（推荐） | 加 `@Transactional` 注解       | 最简洁，声明即生效     | 控制粒度不够细 |
| **编程式**         | `TransactionTemplate` 显式调用 | 精细控制，适合复杂事务 | 代码多         |

```java
// 声明式——简单，日常够用
@Transactional
public void createOrder(Order order) {
    orderMapper.insert(order);
    stockService.deduct(order.getGoodsId(), order.getNum());
}

// 编程式——细粒度控制，比如部分成功也算成功
@Service
public class OrderService {
    private final TransactionTemplate transactionTemplate;

    public OrderService(TransactionTemplate transactionTemplate) {
        this.transactionTemplate = transactionTemplate;
    }

    public void batchCreate(List<Order> orders) {
        for (Order order : orders) {
            // 每个订单独立事务，一个失败不影响其他
            transactionTemplate.execute(status -> {
                try {
                    orderMapper.insert(order);
                    stockService.deduct(order.getGoodsId(), order.getNum());
                    return null;
                } catch (Exception e) {
                    status.setRollbackOnly();  // 手动标记回滚
                    log.error("订单处理失败", e);
                    return null;
                }
            });
        }
    }
}
```

#### 12.5 @Transactional 失效的七种场景

| 场景                    | 原因                                                                      | 解决                                                                                       |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| ① 同类内部自调用        | `this.method()` 绕过了代理对象，AOP 切面不触发                            | 注入自己 `@Autowired OrderService self`，用 `self.method()`                                |
| ② 方法不是 public       | `@Transactional` 只对 public 方法生效                                     | 改成 public                                                                                |
| ③ 异常被 try-catch 吞掉 | 没抛出去，事务管理器不知道有异常                                          | 不要吞异常，或手动 `TransactionAspectSupport.currentTransactionStatus().setRollbackOnly()` |
| ④ 抛的是受检异常        | 默认只回滚 RuntimeException，受检异常（如 `FileNotFoundException`）不回滚 | 加 `rollbackFor = Exception.class`                                                         |
| ⑤ 存储引擎不支持事务    | MyISAM 不支持事务，MySQL 用 InnoDB                                        | 检查 `ENGINE=InnoDB`                                                                       |
| ⑥ 方法被 final 修饰     | 动态代理无法重写 final 方法                                               | 去掉 final                                                                                 |
| ⑦ 不同线程里的事务      | 事务和线程绑定，新线程没有原事务的 Connection                             | 事务内不要开新线程                                                                         |

**自调用问题的解决方案：**

```java
@Service
public class OrderService {
    // 注入自己（Spring 允许循环依赖，但只限构造器注入）
    @Autowired
    private OrderService self;

    // 写法一：注入自己，用 self 调 → 走代理，事务生效
    public void batchProcess(List<Order> orders) {
        for (Order order : orders) {
            self.doSave(order);  // 走代理，@Transactional 生效
        }
    }

    @Transactional
    public void doSave(Order order) {
        orderMapper.insert(order);
    }

    // 写法二：AopContext（需要 @EnableAspectJAutoProxy(exposeProxy = true)）
    public void batchProcess2(List<Order> orders) {
        for (Order order : orders) {
            ((OrderService) AopContext.currentProxy()).doSave(order);
        }
    }
}
```

#### 12.6 事务与多线程

```java
@Service
public class OrderService {

    @Transactional
    public void createOrder(Order order) {
        orderMapper.insert(order);

        // ❌ 错误：新线程里的事务是独立的！
        new Thread(() -> {
            logService.log("创建订单", order.getId());  // 这行不在外面的事务里
        }).start();

        // ✅ 正确：事务内不要开新线程，或者把异步操作放到事务提交后
        // 用 @TransactionalEventListener 在事务提交后异步处理
    }
}
```

#### 12.7 事务只读优化

```java
// 查询时加 readOnly = true，告诉数据库不需要加锁，MySQL/ORM 可以做优化
@Transactional(readOnly = true)
public Order getById(Long id) {
    return orderMapper.selectById(id);
}
```

**readOnly 的实际作用：**

- MySQL：不需要加行锁，查询更快
- JPA：FlushMode 设为 MANUAL，不触发自动 flush
- JDBC：部分数据库驱动有优化

#### 12.8 事务原理（AOP + 动态代理）

Spring 事务底层就是 AOP 实现的，核心链路：

```
@Transactional
    ↓ Spring 解析注解
TransactionInterceptor（AOP 环绕通知）
    ↓ 实现 MethodInterceptor
invoke() 方法内部：
    ├─ ① 获取事务属性（propagation、isolation、rollbackFor 等）
    ├─ ② 开启事务（connection.setAutoCommit(false)）
    ├─ ③ try { method.invoke(目标对象, args) }  ← 执行你的业务代码
    ├─ ④ 没异常 → connection.commit()
    └─ ⑤ 有异常 → connection.rollback()
```

**关键点：事务和 Connection 绑定在同一线程上**

```java
// 事务管理器里维护了一个 ThreadLocal，存着当前线程的 Connection
public abstract class AbstractPlatformTransactionManager {
    // 每个线程一个事务状态
    private static final ThreadLocal<TransactionInfo> transactionInfoHolder =
        new ThreadLocal<>();

    protected void beginTransaction() {
        // 从数据源拿 Connection
        Connection conn = dataSource.getConnection();
        conn.setAutoCommit(false);  // 关闭自动提交
        // 把 Connection 绑到当前线程
        TransactionSynchronizationManager.bindResource(dataSource, conn);
    }
}
```

**这就解释了为什么新线程里事务不生效：**

```
主线程：                   新线程：
┌────────────────┐        ┌────────────────┐
│ Connection T1  │        │  没有 Connection │
│ @Transactional │        │  @Transactional │
│ orderMapper    │        │  logMapper      │
│   ↓ 用 T1 提交  │        │   ↓ 用新连接提交  │
└────────────────┘        └────────────────┘
    事务 A                     事务 B（独立）
```

**结合学过的 AOP 理解：**

```
没有 @Transactional 时：
  OrderService.createOrder()
    └─ orderMapper.insert()     ← 每条 SQL 自动提交

有 @Transactional 时：
  OrderServiceProxy（代理对象）
    ├─ connection.setAutoCommit(false)    ← 关闭自动提交
    ├─ orderMapper.insert()               ← 不提交
    ├─ stockService.deduct()              ← 不提交
    ├─ connection.commit()                ← 全部成功，提交
    └─ connection.rollback()              ← 有异常，全部回滚
```

**所以 @Transactional 的本质就是：** AOP 在方法前后加了 `begin` / `commit` / `rollback`，把多条 SQL 包在同一个数据库事务里，保证要么全部成功要么全部失败。

---

### 13. 单元测试（完整版）

#### 13.1 测试分层体系

Spring Boot 提供从简单到完整的三种测试模式：

| 方式     | 注解                              | 启动范围       | 速度  | 适用场景           |
| -------- | --------------------------------- | -------------- | ----- | ------------------ |
| 切片测试 | `@WebMvcTest` / `@DataJpaTest` 等 | 只启动某一层   | ⚡ 快 | 单元测试，隔离性强 |
| 完整测试 | `@SpringBootTest`                 | 启动完整容器   | 🐢 慢 | 集成测试           |
| 测试切片 | `@JsonTest` / `@RestClientTest`   | 只启动某个功能 | ⚡ 快 | 序列化/REST 客户端 |

#### 13.2 切片测试（推荐，更快）

**Controller 层测试：** 只启动 MVC 相关 Bean，不启动 Service/Repository

```java
@WebMvcTest(UserController.class)        // 只加载 UserController 一个 Controller
public class UserControllerTest {

    @Autowired
    private MockMvc mockMvc;              // 模拟 HTTP 请求，不启动真实 Tomcat

    @MockBean                             // Mock 替代真实 Service Bean
    private UserService userService;

    @Test
    public void testGetUser() throws Exception {
        // 准备 Mock 数据
        when(userService.getById(1L)).thenReturn(new User(1L, "张三"));

        // 执行 HTTP 请求 + 断言
        mockMvc.perform(get("/user/1"))
               .andExpect(status().isOk())                              // 状态码 200
               .andExpect(jsonPath("$.name").value("张三"))             // 响应体断言
               .andExpect(jsonPath("$.id").value(1));
    }
}
```

**Repository 层测试：** 只启动 JPA/MyBatis 相关 Bean

```java
@DataJpaTest                              // 只加载 JPA 相关 Bean，不启动完整容器
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)  // 用内嵌数据库替代真实库
public class UserRepositoryTest {

    @Autowired
    private UserRepository userRepository;

    @Test
    public void testFindByName() {
        userRepository.save(new User(null, "张三"));

        User user = userRepository.findByName("张三");

        assertThat(user).isNotNull();
        assertThat(user.getName()).isEqualTo("张三");
    }
}
```

#### 13.3 完整集成测试

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)  // 随机端口，避免冲突
@AutoConfigureMockMvc
public class OrderServiceIntegrationTest {

    @Autowired
    private TestRestTemplate restTemplate;        // 真实发 HTTP 请求（不是 MockMvc）

    @Autowired
    private OrderService orderService;

    @Test
    public void testCreateOrder() {
        // 真实调用，不走 Mock
        Order order = orderService.createOrder(1L, 2);

        assertThat(order).isNotNull();
        assertThat(order.getStatus()).isEqualTo(OrderStatus.CREATED);
    }

    @Test
    public void testApi() {
        // 通过真实 HTTP 调用测试 API 接口
        ResponseEntity<Result> response = restTemplate.exchange(
            "/api/order/1", HttpMethod.GET, null, Result.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
```

#### 13.4 常用测试注解

| 切片注解          | 加载的 Bean                     | 适用场景                  |
| ----------------- | ------------------------------- | ------------------------- |
| `@WebMvcTest`     | Controller、Filter、Interceptor | 测试 Controller 层        |
| `@DataJpaTest`    | JPA Repository、EntityManager   | 测试数据访问层            |
| `@JsonTest`       | Jackson/Gson 序列化             | 测试 JSON 序列化/反序列化 |
| `@RestClientTest` | RestTemplate 相关               | 测试 REST 客户端          |
| `@DataRedisTest`  | Redis 相关                      | 测试 Redis 操作           |

#### 13.5 @MockBean 与 @SpyBean

```java
@WebMvcTest(UserController.class)
public class UserControllerTest {

    @MockBean     // ① 完全 Mock：调用方法不执行真实逻辑，返回默认值
    private UserService userService;

    @SpyBean      // ② 部分 Mock：默认调用真实方法，可以指定某个方法 Mock
    private PaymentService paymentService;

    @Test
    public void testMock() {
        // MockBean：完全替代，不调用真实方法
        when(userService.getById(1L)).thenReturn(new User(1L, "张三"));

        // SpyBean：默认调用真实方法，但可以覆盖某个方法
        when(paymentService.refund(any())).thenReturn(true);  // 只 Mock refund 方法
    }
}
```

#### 13.6 测试数据库

```java
@SpringBootTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.ANY)  // 用 H2 替代 MySQL
public class DatabaseTest {
    // 测试时不需要连接真实 MySQL，用内嵌 H2 数据库，更快更隔离
}
```

```yaml
# 测试专用的配置 application-test.yml
spring:
  datasource:
    url: jdbc:h2:mem:testdb # 内存数据库，测试完自动销毁
    driver-class-name: org.h2.Driver
```

#### 13.7 小结

- **切片测试 > 完整集成测试**：切片测试只启动被测层，速度更快，优先用
- **`@MockBean` 隔离外部依赖**：不依赖数据库、第三方 API
- **`@SpringBootTest` 做集成验证**：验证各层协作，但慢，只在关键路径用

---

### 14. 自定义 Starter

#### 14.1 定义

自定义 Starter = 把你的自动配置逻辑打包成一个依赖，其他项目引入后直接生效。常用于公司内部封装的通用组件（日志、鉴权、RPC、MQ 初始化等）。

#### 14.2 Starter 的命名和结构

```
my-spring-boot-starter              ← ① 启动器（使用者引入的依赖）
├── pom.xml                         ← 依赖自动配置模块
└── src/main/java/...

my-spring-boot-autoconfigure        ← ② 自动配置模块（真正的配置逻辑）
├── pom.xml
├── src/main/java/
│   └── com/example/my/starter/
│       ├── MyProperties.java        ← 配置属性类
│       ├── MyService.java           ← 自动配置的 Bean
│       └── MyAutoConfiguration.java ← 自动配置类
└── src/main/resources/
    └── META-INF/
        └── spring/
            └── org.springframework.boot.autoconfigure.AutoConfiguration.imports  ← 注册自动配置类
```

#### 14.3 完整实现

**自动配置类：**

```java
// my-spring-boot-autoconfigure 模块
@AutoConfiguration                         // 标记自动配置类
@ConditionalOnClass(MyService.class)        // 有依赖才生效
@EnableConfigurationProperties(MyProperties.class)  // 绑定配置属性
public class MyAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean               // 使用者可以覆盖
    public MyService myService(MyProperties properties) {
        return new MyService(properties.getPrefix(), properties.getSuffix());
    }
}
```

**配置属性类：**

```java
@ConfigurationProperties(prefix = "my.starter")
public class MyProperties {
    private String prefix = "default-";     // 默认值
    private String suffix = "";

    // getter/setter
}
```

**注册自动配置：**

```properties
# META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.example.my.starter.MyAutoConfiguration
```

**spring-autoconfigure-metadata（可选，加速启动）：**

```properties
# META-INF/spring/org.springframework.boot.autoconfigure.auto-configuration.imports
# 加上条件过滤，避免每次启动都加载类判断
com.example.my.starter.MyAutoConfiguration=
  ConditionalOnClass=com.example.my.starter.MyService
```

#### 14.4 使用者引入

```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>my-spring-boot-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

```yaml
# 引入后，直接在 application.yml 里配置
my:
  starter:
    prefix: 'Hello-'
    suffix: '!'
```

#### 14.5 小结

自定义 Starter = 自动配置类 + 属性类 + `AutoConfiguration.imports` 注册，本质是把 Spring Boot 的自动配置机制封装成可复用的依赖包，是公司级组件复用的标准做法。

---

### 15. Spring Boot 事件机制

#### 15.1 定义

Spring Boot 内置了**事件驱动**机制，一个 Bean 发布事件，其他 Bean 监听并处理，实现**业务解耦**。

#### 15.2 内置事件（启动流程触发）

| 事件                                  | 触发时机                               | 常见用途       |
| ------------------------------------- | -------------------------------------- | -------------- |
| `ApplicationStartingEvent`            | 开始运行，还没创建容器                 | 初始化日志系统 |
| `ApplicationEnvironmentPreparedEvent` | Environment 已准备好                   | 检查环境变量   |
| `ApplicationStartedEvent`             | 容器刷新完成，ApplicationRunner 执行前 | 缓存预热       |
| `ApplicationReadyEvent`               | 应用就绪，可以提供服务                 | 注册到注册中心 |
| `ApplicationFailedEvent`              | 启动失败                               | 发送告警       |

#### 15.3 自定义事件（业务解耦）

**事件类：**

```java
// 事件：订单创建成功（从 ApplicationEvent 继承）
public class OrderCreatedEvent extends ApplicationEvent {
    private final Long orderId;
    private final Long userId;

    public OrderCreatedEvent(Object source, Long orderId, Long userId) {
        super(source);
        this.orderId = orderId;
        this.userId = userId;
    }

    public Long getOrderId() { return orderId; }
    public Long getUserId() { return userId; }
}
```

**发布事件：**

```java
@Service
public class OrderService {

    private final ApplicationEventPublisher eventPublisher;

    // 为什么用 ApplicationEventPublisher 注入而不是 ApplicationContext：
    // ApplicationEventPublisher 是父接口，更轻量，只暴露发布事件的能力
    public OrderService(ApplicationEventPublisher eventPublisher) {
        this.eventPublisher = eventPublisher;
    }

    public void createOrder(Order order) {
        // 业务逻辑...
        orderMapper.insert(order);

        // 发布事件：不关心谁会处理，后续加功能不用改这里
        eventPublisher.publishEvent(new OrderCreatedEvent(this, order.getId(), order.getUserId()));
    }
}
```

**监听事件（多种方式）：**

```java
@Component
public class OrderEventListeners {

    // 方式一：@EventListener 注解（推荐，最简单）
    @EventListener
    public void handleOrderCreated(OrderCreatedEvent event) {
        // 发短信通知用户
        smsService.send(event.getUserId(), "您的订单已创建：" + event.getOrderId());
    }

    // 方式二：实现接口（需要 implements ApplicationListener<OrderCreatedEvent>）
    // @Component
    // public class EmailListener implements ApplicationListener<OrderCreatedEvent> {
    //     @Override
    //     public void onApplicationEvent(OrderCreatedEvent event) {
    //         // 发邮件
    //     }
    // }

    // 方式三：异步监听（不阻塞主流程）
    @EventListener
    @Async("taskExecutor")          // 配合 @EnableAsync 异步执行
    public void sendCoupon(OrderCreatedEvent event) {
        // 耗时操作：送积分、发优惠券
        couponService.send(event.getUserId());
    }

    // 方式四：条件监听（只有满足条件才处理）
    @EventListener(condition = "#event.orderId > 1000")
    public void vipOrderNotify(OrderCreatedEvent event) {
        // 大额订单特殊处理
    }
}
```

#### 15.4 执行流程

```
OrderService.createOrder()
  ↓
eventPublisher.publishEvent(event)
  ↓
ApplicationEventMulticaster（事件广播器）
  ├─ 同步调用 → SMSListener.handleOrderCreated()      ← 同一线程，阻塞
  ├─ 同步调用 → CouponListener.sendCoupon()            ← 除非 @Async
  └─ 同步调用 → VipOrderListener.vipOrderNotify()
```

> **同步 vs 异步：** 默认是同步的（发布者线程串行执行所有监听器）。如果监听器逻辑耗时，加 `@Async` 异步执行，但要注意事务边界——异步监听器里的事务是独立的。

#### 15.5 事务事件（@TransactionalEventListener）

```java
@Component
public class OrderEventListeners {

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)  // 事务提交后才执行
    public void handleAfterCommit(OrderCreatedEvent event) {
        // ① 事务已提交，数据已落库
        // ② 如果监听器抛异常，不会导致业务回滚
        // ③ 适合发 MQ 消息、发邮件等操作
        mqService.send("order.created", event.getOrderId());
    }
}
```

`TransactionPhase` 的四种选项：

| 阶段               | 说明                      |
| ------------------ | ------------------------- |
| `AFTER_COMMIT`     | 事务提交后执行（最常用）  |
| `AFTER_ROLLBACK`   | 事务回滚后执行            |
| `AFTER_COMPLETION` | 事务完成（无论提交/回滚） |
| `BEFORE_COMMIT`    | 事务提交前执行            |

#### 15.6 小结

事件机制实现「发布-监听」解耦，核心价值：**下单后发短信/送积分/发邮件，不需要在 OrderService 里写一行相关代码，新增功能只需加一个 @EventListener 方法**。

---

### 16. 国际化 i18n

#### 16.1 i18n 是什么

i18n 就是：**同一个消息 key，根据请求语言返回不同文字。**

例如客户端发送：

```http
Accept-Language: zh-CN
```

返回“用户名已存在”；发送：

```http
Accept-Language: en-US
```

返回“Username already exists”。

Spring 中的核心只有三个：

```text
Accept-Language
      ↓
LocaleResolver 解析当前语言
      ↓
MessageSource 从对应 properties 文件读取消息
```

#### 16.2 第一步：准备语言文件

CourseMall 的语言文件放在 `mall-common/src/main/resources`：

```text
messages.properties          # 默认兜底，CourseMall 使用中文
messages_zh_CN.properties    # 简体中文
messages_en.properties       # 英文，也能匹配 en-US、en-GB
```

`messages.properties`：

```properties
common.success=操作成功
user.username.exists=用户名已存在
course.not-found=课程 {0} 不存在
```

`messages_en.properties`：

```properties
common.success=Success
user.username.exists=Username already exists
course.not-found=Course {0} does not exist
```

注意：

- 每种语言必须使用相同的 key。
- `{0}` 表示第一个动态参数，`{1}` 表示第二个。
- 必须保留默认的 `messages.properties`，不能只有带语言后缀的文件。

#### 16.3 第二步：配置 Spring Boot

`application.yml`：

```yaml
spring:
  messages:
    # 对应 messages.properties 这个基础文件名
    basename: messages
    encoding: UTF-8
    # 不使用服务器操作系统的语言，避免本地和线上结果不同
    fallback-to-system-locale: false
```

如果语言文件放在 `resources/i18n` 目录中，则写：

```yaml
spring:
  messages:
    basename: i18n/messages
```

CourseMall 的文件就在 `resources` 根目录，所以使用 `messages` 即可。

#### 16.4 第三步：确定当前请求的语言

前后端分离项目推荐使用 `Accept-Language`：

```java
@Configuration
public class I18nConfig implements WebMvcConfigurer {

    private final MessageSource messageSource;

    public I18nConfig(MessageSource messageSource) {
        this.messageSource = messageSource;
    }

    @Bean
    public LocaleResolver localeResolver() {
        AcceptHeaderLocaleResolver resolver =
                new AcceptHeaderLocaleResolver();

        // 请求没有 Accept-Language 时，默认使用简体中文
        resolver.setDefaultLocale(Locale.SIMPLIFIED_CHINESE);
        return resolver;
    }

    @Bean
    public LocalValidatorFactoryBean validator() {
        LocalValidatorFactoryBean validator =
                new LocalValidatorFactoryBean();

        // 让 @Valid 也读取上面的 messages 文件
        validator.setValidationMessageSource(messageSource);
        return validator;
    }

    @Override
    public Validator getValidator() {
        return validator();
    }
}
```

之后 Spring 会自动把当前请求语言放进：

```java
Locale locale = LocaleContextHolder.getLocale();
```

通常不需要自己读取 `HttpServletRequest`。

#### 16.5 最基础的读取方式

`MessageSource` 的用法是：

```java
@Component
public class I18nMessageService {

    private final MessageSource messageSource;

    public I18nMessageService(MessageSource messageSource) {
        this.messageSource = messageSource;
    }

    public String get(String key, Object... args) {
        return messageSource.getMessage(
                key,
                args,
                LocaleContextHolder.getLocale());
    }
}
```

调用：

```java
String message1 = i18nMessageService.get(
        "user.username.exists");

String message2 = i18nMessageService.get(
        "course.not-found",
        88L);
```

结果：

```text
中文：用户名已存在
英文：Username already exists

中文：课程 88 不存在
英文：Course 88 does not exist
```

这就是 i18n 最核心的使用方法。

#### 16.6 CourseMall 中实际怎么使用

CourseMall 已经封装好了统一翻译，你平时写业务代码时不需要每次手动调用
`MessageSource`。

新增一个业务错误只做四步。

**第一步：增加消息 key**

```java
public static final class Course {
    public static final String NOT_FOUND = "course.not-found";
}
```

**第二步：在中英文文件中增加文本**

```properties
# messages.properties
course.not-found=课程 {0} 不存在

# messages_en.properties
course.not-found=Course {0} does not exist
```

**第三步：加入 ErrorCode**

```java
COURSE_NOT_FOUND(
        404201,
        MessageKeys.Course.NOT_FOUND
)
```

**第四步：业务中抛异常**

```java
Course course = courseMapper.selectById(courseId);

if (course == null) {
    throw new BizException(
            ErrorCode.COURSE_NOT_FOUND,
            courseId);
}
```

CourseMall 会在返回 JSON 前自动把 `course.not-found` 翻译为当前语言：

```json
{
  "code": 404201,
  "message": "课程 88 不存在",
  "data": null
}
```

所以你只需记住：

> **增加 key → 写中英文 → 绑定 ErrorCode → 抛 BizException。**

#### 16.7 参数校验怎么国际化

校验注解中的 key 要加 `{}`：

```java
public class UserRegisterDTO {

    @NotBlank(
            message = "{validation.user.username.not-blank}")
    @Size(
            min = 3,
            max = 20,
            message = "{validation.user.username.size}")
    private String username;
}
```

语言文件：

```properties
# messages.properties
validation.user.username.not-blank=用户名不能为空
validation.user.username.size=用户名长度必须在 3 到 20 个字符之间

# messages_en.properties
validation.user.username.not-blank=Username is required
validation.user.username.size=Username must contain 3 to 20 characters
```

这里要区分：

```java
// 参数校验：key 外面要有 {}
@NotBlank(message = "{validation.user.username.not-blank}")

// 业务异常：直接使用 ErrorCode，不写 {}
throw new BizException(ErrorCode.USERNAME_EXISTS);
```

#### 16.8 如何测试

中文：

```bash
curl -H "Accept-Language: zh-CN" \
     http://localhost:8080/api/test
```

英文：

```bash
curl -H "Accept-Language: en-US" \
     http://localhost:8080/api/test
```

Flutter 中可以在 Dio 拦截器里统一设置：

```dart
options.headers['Accept-Language'] =
    currentLocale.toLanguageTag();
```

#### 16.9 现在只需要记住这些

1. 文本写在 `messages*.properties`，Java 代码不要直接写中文提示。
2. 中英文文件的 key 必须一致。
3. 客户端通过 `Accept-Language` 决定语言。
4. 普通动态参数使用 `{0}`、`{1}`。
5. 校验注解写 `message = "{key}"`。
6. CourseMall 业务中直接抛 `BizException(ErrorCode, 参数)`。

::: tip 面试一句话
Spring MVC 通过 `LocaleResolver` 解析 `Accept-Language`，
`MessageSource` 根据 Locale 读取对应语言文件；CourseMall 将稳定的
ErrorCode 和消息 key 保留在业务层，在返回响应时统一翻译。
:::

官方参考：[Spring Boot 国际化](https://docs.spring.io/spring-boot/docs/3.2.5/reference/html/features.html#features.internationalization)

#### 16.10 本节完整总结

先记住完整执行链：

```text
Accept-Language
    → LocaleResolver 解析 Locale
    → Spring MVC 保存到 LocaleContextHolder

业务抛出 BizException（ErrorCode + messageKey + 参数）
    → GlobalExceptionHandler 转成 Result
    → ResultMessageAdvice 在返回 JSON 前统一翻译
    → I18nMessageService 调用 MessageSource
    → 从对应的 messages.properties 取得最终文本
```

各个类的职责：

1. `MessageSource` 是 Spring 的消息源。Spring Boot 根据
   `spring.messages.basename` 加载 `messages*.properties`，并将
   `MessageSource` 注册成 Bean。
2. `MessageKeys` 只是保存消息 key 常量，避免到处手写字符串，不是 Spring 必需组件。
3. `I18nMessageService` 是对 `MessageSource` 的项目级封装，统一处理当前 Locale、参数和默认值；它类似工具类，但作为 Bean 使用。
4. `LocaleResolver` 负责从 `Accept-Language` 解析 Locale；Spring MVC 再把结果绑定到 `LocaleContextHolder`，供当前请求使用。
5. `LocalValidatorFactoryBean` 负责创建并适配 Validator，使
   `@Valid`、`@Validated`、`@NotBlank` 等校验能够使用
   `MessageSource` 中的国际化提示。Spring Boot 通常已经自动配置，只有需要定制时才显式声明。
6. `ErrorCode` 保存稳定的业务码和 messageKey；`BizException` 携带错误码、messageKey 和占位参数，不直接保存某一种语言。
7. `GlobalExceptionHandler` 只负责把各种异常转换成统一的 `Result`。当然可以在
   `handleBiz()` 中翻译，但那只能覆盖业务异常，其他异常和正常响应还要重复处理。
8. `ResultMessageAdvice` 会在 Controller 或异常处理器执行完成后、Jackson 写出 JSON 前拦截所有 `Result`，因此适合作为统一翻译出口。

## 源码篇

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

| 注解                       | 作用                   | 底层本质                                               |
| -------------------------- | ---------------------- | ------------------------------------------------------ |
| `@SpringBootConfiguration` | 标记当前类是配置类     | `@Configuration` 的别名                                |
| `@EnableAutoConfiguration` | 开启自动配置           | `@Import(AutoConfigurationImportSelector.class)`       |
| `@ComponentScan`           | 扫描启动类所在包及子包 | 默认扫描启动类包下的 `@Component/@Service/@Controller` |

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

> **先记住结论**：Spring Boot 自动配置不是「看到某个依赖就直接 `new` 一个对象」，而是：
>
> **找到候选配置类 → 去重和排除 → 按条件过滤 → 导入满足条件的配置类 → 注册 BeanDefinition → 创建 Bean。**

#### 2.1 先用一个手写配置理解「自动配置」

如果不用自动配置，我们可能要自己写：

```java
@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Object> redisTemplate(
            RedisConnectionFactory connectionFactory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(connectionFactory);
        return template;
    }
}
```

这段代码做了两件事：

1. 声明一个配置类；
2. 声明一个 `RedisTemplate` Bean。

Spring Boot 自动配置做的事情，本质上和这段代码一样，只是这段配置由 Spring Boot 官方提前写好了，并且加上了很多「是否应该生效」的判断：

```java
@AutoConfiguration
@ConditionalOnClass(RedisOperations.class)
@ConditionalOnMissingBean(RedisTemplate.class)
public class RedisAutoConfiguration {

    @Bean
    public RedisTemplate<?, ?> redisTemplate(...) {
        // 官方帮我们创建默认 RedisTemplate
        return ...;
    }
}
```

因此，自动配置的本质不是魔法，而是：

> **官方提前写好配置类，Spring Boot 在启动时根据当前项目的依赖、配置和已有 Bean，决定哪些配置类应该导入。**

#### 2.2 自动配置的总入口

`@SpringBootApplication` 可以拆成三个重要部分：

```java
@SpringBootConfiguration
@EnableAutoConfiguration
@ComponentScan
public @interface SpringBootApplication {
}
```

其中自动配置真正的入口是 `@EnableAutoConfiguration`：

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@AutoConfigurationPackage
@Import(AutoConfigurationImportSelector.class)
public @interface EnableAutoConfiguration {
    Class<?>[] exclude() default {};
    String[] excludeName() default {};
}
```

这里最关键的是：

```java
@Import(AutoConfigurationImportSelector.class)
```

它**不是直接导入所有自动配置类**，而是先导入一个 `ImportSelector`。这个选择器会在启动过程中动态决定「到底要导入哪些配置类」。

可以把它理解成：

```text
@Import(配置类)       = 固定导入某个配置类
@Import(ImportSelector) = 启动时动态选择要导入的配置类
```

`@AutoConfigurationPackage` 负责保存启动类所在的基础包信息，主要给实体扫描等功能提供默认包；它不是自动配置候选类清单。

#### 2.3 第一阶段：找到自动配置候选类

Spring Boot 3.x 中，自动配置候选类记录在：

```text
META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

文件内容是「每行一个自动配置类的全限定类名」：

```text
org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration
```

这个文件通常位于 `spring-boot-autoconfigure` 或其他 Starter 的 jar 包中。项目启动时，Spring Boot 会从整个 classpath 中读取这些文件并合并候选类。

Spring Boot 3.2.5 源码中的核心代码可以概括为：

```java
protected List<String> getCandidateConfigurations(
        AnnotationMetadata metadata,
        AnnotationAttributes attributes) {

    return ImportCandidates
            .load(AutoConfiguration.class, getBeanClassLoader())
            .getCandidates();
}
```

注意这里的结果只是：

```text
[WebMvcAutoConfiguration,
 DataSourceAutoConfiguration,
 RedisAutoConfiguration, ...]
```

此时还没有创建 `RedisTemplate`、`DataSource` 等对象，只是拿到了「可能要用的配置类名单」。

##### 版本差异：`spring.factories` 和 `AutoConfiguration.imports`

| Spring Boot 版本 | 自动配置候选类位置                   | 格式                            |
| ---------------- | ------------------------------------ | ------------------------------- |
| 2.6 及以前       | `META-INF/spring.factories`          | 一个 key 对应多个类，用逗号分隔 |
| 2.7              | 开始支持 `AutoConfiguration.imports` | 每行一个类                      |
| 3.x              | 主要使用 `AutoConfiguration.imports` | 每行一个类                      |

旧格式：

```properties
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration,\
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
```

新格式：

```text
org.springframework.boot.autoconfigure.web.servlet.WebMvcAutoConfiguration
org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
```

#### 2.4 第二阶段：处理候选类、排除项和条件

`AutoConfigurationImportSelector` 的核心流程可以简化为：

```java
public String[] selectImports(AnnotationMetadata metadata) {
    // 自动配置被关闭时，什么也不导入
    if (!isEnabled(metadata)) {
        return new String[0];
    }

    AutoConfigurationEntry entry =
            getAutoConfigurationEntry(metadata);

    // 返回最终允许导入的配置类名
    return entry.getConfigurations().toArray(new String[0]);
}
```

`getAutoConfigurationEntry()` 的主要步骤是：

```text
1. 读取 @EnableAutoConfiguration 的属性
2. 加载 AutoConfiguration.imports 中的候选类
3. removeDuplicates()：去重
4. getExclusions()：收集排除项
   - @SpringBootApplication(exclude = ...)
   - @SpringBootApplication(excludeName = ...)
   - spring.autoconfigure.exclude
5. 删除排除的配置类
6. 使用 AutoConfigurationImportFilter 进行快速过滤
7. 返回最终配置类列表
```

对应源码中的方法链大致是：

```text
selectImports()
  └─ getAutoConfigurationEntry()
      ├─ getCandidateConfigurations()
      ├─ removeDuplicates()
      ├─ getExclusions()
      ├─ checkExcludedClasses()
      ├─ configurations.removeAll(exclusions)
      └─ getConfigurationClassFilter().filter(configurations)
```

这一阶段的重点是：

> `AutoConfigurationImportSelector` 负责选择和返回配置类名，不负责直接创建业务对象。

#### 2.5 第三阶段：条件注解决定配置是否生效

候选配置类通常会标注各种条件注解。条件注解的底层都是 Spring 的 `@Conditional`：

| 条件注解                       | 生效条件                 | 常见用途                               |
| ------------------------------ | ------------------------ | -------------------------------------- |
| `@ConditionalOnClass`          | classpath 中存在指定类   | 引入 Redis、MyBatis 等依赖时才启用配置 |
| `@ConditionalOnMissingClass`   | classpath 中不存在指定类 | 避免与某些依赖冲突                     |
| `@ConditionalOnBean`           | 容器中已经有指定 Bean    | 基于已有 Bean 继续配置                 |
| `@ConditionalOnMissingBean`    | 容器中没有指定 Bean      | 用户没配置时提供默认 Bean              |
| `@ConditionalOnProperty`       | 配置文件中的属性满足条件 | 通过开关控制功能                       |
| `@ConditionalOnWebApplication` | 当前是 Web 应用          | Web 场景专用配置                       |
| `@ConditionalOnExpression`     | SpEL 表达式为 `true`     | 复杂条件判断                           |

条件可以放在配置类上，也可以放在 `@Bean` 方法上：

```java
// 配置类条件不满足：整个配置类都不处理
@Configuration
@ConditionalOnClass(RedisOperations.class)
public class RedisAutoConfiguration {

    // 方法条件不满足：只跳过这个 Bean，其他 Bean 仍可能生效
    @Bean
    @ConditionalOnMissingBean(RedisTemplate.class)
    public RedisTemplate<?, ?> redisTemplate() {
        return ...;
    }
}
```

这是「引入依赖就生效、没引入就跳过」的真正原因：

```text
没有 spring-data-redis
    └─ RedisOperations 不存在
        └─ @ConditionalOnClass 不满足
            └─ RedisAutoConfiguration 不生效
                └─ RedisTemplate 不会自动创建
```

#### 2.6 以 Redis 自动配置为例完整走一遍

Spring Boot 3.2.5 中的 `RedisAutoConfiguration` 结构可以简化为：

```java
@AutoConfiguration
@ConditionalOnClass(RedisOperations.class)
@EnableConfigurationProperties(RedisProperties.class)
@Import({
        LettuceConnectionConfiguration.class,
        JedisConnectionConfiguration.class
})
public class RedisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(name = "redisTemplate")
    @ConditionalOnSingleCandidate(RedisConnectionFactory.class)
    public RedisTemplate redisTemplate(
            RedisConnectionFactory connectionFactory) {

        RedisTemplate template = new RedisTemplate();
        template.setConnectionFactory(connectionFactory);
        return template;
    }
}
```

启动时可以按下面的顺序理解：

```text
① 引入 spring-boot-starter-data-redis
       ↓
② classpath 中出现 RedisOperations、RedisConnectionFactory 等类
       ↓
③ 候选清单中找到 RedisAutoConfiguration
       ↓
④ @ConditionalOnClass(RedisOperations.class) 通过
       ↓
⑤ @EnableConfigurationProperties 绑定 spring.data.redis.* 配置
       ↓
⑥ @Import 导入 Lettuce/Jedis 连接配置
       ↓
⑦ 先得到 RedisConnectionFactory
       ↓
⑧ @ConditionalOnMissingBean 判断用户有没有自己的 redisTemplate
       ↓
⑨ 没有自定义 Bean，执行 @Bean 方法
       ↓
⑩ RedisTemplate 的 BeanDefinition 注册到容器，之后创建对象
```

这里最重要的是第 8 步：

```java
@ConditionalOnMissingBean(name = "redisTemplate")
```

它让自动配置遵循「默认提供，但允许用户覆盖」的原则。

如果用户自己写了：

```java
@Bean
public RedisTemplate<String, Object> redisTemplate() {
    RedisTemplate<String, Object> template = new RedisTemplate<>();
    // 自定义序列化器、连接工厂等
    return template;
}
```

那么自动配置中的 `@ConditionalOnMissingBean` 不满足，Spring Boot 就不会再创建自己的默认 `RedisTemplate`。

#### 2.7 配置类什么时候真正注册到容器？

前面需要区分两个概念：

| 阶段       | 做的事情                                   | 结果                 |
| ---------- | ------------------------------------------ | -------------------- |
| 选择阶段   | 找到并过滤自动配置类                       | 得到配置类名称       |
| 解析阶段   | 处理 `@Configuration`、`@Import`、条件注解 | 注册 BeanDefinition  |
| 实例化阶段 | 创建单例 Bean、注入依赖、执行后置处理器    | 得到真正的 Bean 对象 |

结合 `SpringApplication.run()`，主链路是：

```text
SpringApplication.run()
  └─ refreshContext()
      └─ AbstractApplicationContext.refresh()
          └─ invokeBeanFactoryPostProcessors()
              └─ ConfigurationClassPostProcessor
                  ├─ 解析 @Configuration
                  ├─ 解析 @ComponentScan
                  ├─ 解析 @Import
                  ├─ 执行 AutoConfigurationImportSelector
                  └─ 注册满足条件的配置类 BeanDefinition
          └─ registerBeanPostProcessors()
          └─ finishBeanFactoryInitialization()
              └─ 创建非懒加载单例 Bean
```

所以不要把下面两句话混为一谈：

```text
导入自动配置类       ≠ 立刻创建所有 Bean
注册 BeanDefinition  ≠ 已经完成对象实例化
```

自动配置类本身也是普通的 Spring 配置类。它最终还是通过 `@Bean`、`@Import`、组件扫描和依赖注入，参与 Spring 容器的正常生命周期。

#### 2.8 为什么自动配置不会覆盖用户配置？

自动配置一般会使用：

```java
@ConditionalOnMissingBean
```

同时，Spring Boot 会让用户配置优先于自动配置。这样就形成了：

```text
用户没有提供 Bean
    └─ 条件满足
        └─ 使用 Spring Boot 默认 Bean

用户已经提供 Bean
    └─ @ConditionalOnMissingBean 不满足
        └─ 跳过默认 Bean，使用用户 Bean
```

这就是 Spring Boot 的设计原则：

> **约定提供默认值，用户配置可以覆盖默认值。**

如果多个自动配置之间存在依赖关系，还会通过下面这些注解控制顺序：

```java
@AutoConfiguration(before = A.class)
@AutoConfiguration(after = B.class)
```

旧写法也可能看到：

```java
@AutoConfigureBefore(A.class)
@AutoConfigureAfter(B.class)
```

顺序很重要，因为 `@ConditionalOnMissingBean` 只能判断当前阶段已经处理过的 Bean 定义。

#### 2.9 排除某个自动配置

有时默认配置和项目需求冲突，可以主动排除：

```java
// 方式一：通过注解排除
@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
public class DemoApplication {
}
```

```yaml
# 方式二：通过配置文件排除
spring:
  autoconfigure:
    exclude:
      - org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
```

命令行也可以：

```bash
java -jar app.jar \
  --spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
```

排除的本质是：自动配置候选类已经被找到，但在 `getExclusions()` 阶段被移出最终导入列表。

#### 2.10 如何观察哪些自动配置生效了？

不要只根据启动日志猜。可以打开条件评估报告：

```yaml
debug: true
```

或者启动时传入：

```bash
java -jar app.jar --debug
```

日志里会出现 `CONDITIONS EVALUATION REPORT`，其中包含：

```text
Positive matches   ← 哪些自动配置匹配成功
Negative matches   ← 哪些自动配置没有匹配
Unconditional classes ← 无条件导入的配置
Exclusions         ← 被排除的配置
```

如果项目引入了 Actuator，也可以暴露条件端点：

```yaml
management:
  endpoints:
    web:
      exposure:
        include: conditions
```

然后访问：

```text
GET /actuator/conditions
```

这对排查「为什么 Bean 没有自动创建」非常有用，通常按下面顺序查：

1. 依赖是否真的在 classpath 中；
2. 自动配置类是否在 `AutoConfiguration.imports` 中；
3. 是否被 `exclude` 或 `spring.autoconfigure.exclude` 排除；
4. `@ConditionalOnClass`、`@ConditionalOnProperty` 是否满足；
5. 是否已经存在用户 Bean，导致 `@ConditionalOnMissingBean` 不满足；
6. 配置类是否因为包扫描范围错误而没有被处理。

#### 2.11 自定义 Starter 为什么也能自动配置？

自定义 Starter 只是在重复 Spring Boot 的这套约定：

```text
自动配置类
  ├─ @AutoConfiguration
  ├─ @ConditionalOnClass
  ├─ @EnableConfigurationProperties
  ├─ @ConditionalOnMissingBean
  └─ @Bean

注册文件
  └─ META-INF/spring/
      └─ org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

注册文件写入：

```text
com.example.starter.MyAutoConfiguration
```

其他项目引入 Starter 后，Spring Boot 就能从 classpath 找到这份文件，再按照同样的流程加载你的自动配置类。

#### 2.12 一句话面试答案

::: tip 💡 面试题：Spring Boot 自动配置原理是什么？
`@SpringBootApplication` 中的 `@EnableAutoConfiguration` 通过 `@Import` 导入 `AutoConfigurationImportSelector`。选择器从 `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` 中读取自动配置候选类，经过去重、排除和 `@ConditionalOnXxx` 条件过滤后，把满足条件的配置类导入 Spring 容器。配置类中的 `@Bean` 最终注册为 `BeanDefinition`，再由 Spring 完成依赖注入和 Bean 实例化。自动配置通常配合 `@ConditionalOnMissingBean`，因此用户自定义 Bean 可以覆盖默认 Bean。
:::

#### 2.13 源码追踪路线

面试官如果继续追问，可以按这条路线看源码：

```text
SpringApplication.run()
  └─ AbstractApplicationContext.refresh()
      └─ ConfigurationClassPostProcessor
          └─ ConfigurationClassParser
              └─ AutoConfigurationImportSelector
                  ├─ selectImports()
                  ├─ getAutoConfigurationEntry()
                  ├─ getCandidateConfigurations()
                  ├─ ImportCandidates.load()
                  ├─ getExclusions()
                  └─ getConfigurationClassFilter().filter()
```

Spring Boot 3.2.5 源码：

- [`EnableAutoConfiguration`](https://github.com/spring-projects/spring-boot/blob/v3.2.5/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/EnableAutoConfiguration.java)
- [`AutoConfigurationImportSelector`](https://github.com/spring-projects/spring-boot/blob/v3.2.5/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/AutoConfigurationImportSelector.java)
- [`RedisAutoConfiguration`](https://github.com/spring-projects/spring-boot/blob/v3.2.5/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/data/redis/RedisAutoConfiguration.java)

::: tip 💡 最容易混淆的三句话

1. `Starter` 主要负责引入依赖；自动配置类负责写配置逻辑。
2. `AutoConfigurationImportSelector` 负责选择配置类，不是直接创建所有 Bean。
3. `@ConditionalOnMissingBean` 是「默认配置可被用户覆盖」的关键。
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

| 变化     | Spring Boot 2.x    | Spring Boot 3.x             |
| -------- | ------------------ | --------------------------- |
| 最低 JDK | JDK 8              | JDK 17                      |
| 命名空间 | `javax.*`          | `jakarta.*`                 |
| 配置清单 | `spring.factories` | `AutoConfiguration.imports` |
| 核心依赖 | Spring 5.x         | Spring 6.x                  |
| 原生镜像 | 试验性             | GraalVM Native 成熟支持     |

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

```

```
