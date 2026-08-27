# Day 01 · 项目搭建（Maven 多模块 + 统一返回 + 全局异常）

> **今天目标**：把「课程商城」的 Maven 多模块骨架搭起来，跑通一个接口，并建立「统一返回体」和「全局异常处理」两个基建。这两个基建后面每个模块都要用。

## 一、前置检查（先确认环境）

```bash
java -version   # 需要 17+（Spring Boot 3.x 要求）
mvn -version    # 需要 3.8+
```

> ⚠️ 如果你本机只有 JDK 8 / 11，**先告诉我**，我把版本降到 Spring Boot 2.7.x（语法差异不大，不影响学习）。

## 二、完成后你会得到这个结构

```
E:\course-mall\                    ← 代码放博客外（E 盘）
├─ pom.xml                         # 父工程：聚合 + 统一版本管理
├─ .gitignore
├─ mall-common/                    # 公共模块：Result、错误码、异常处理器
│  ├─ pom.xml
│  └─ src/main/java/com/mall/common/
└─ mall-user/                      # 用户服务（今天先跑通一个接口）
   ├─ pom.xml
   └─ src/main/java/com/mall/user/
```

## 三、步骤

### 步骤 1：父工程 `pom.xml`

在 `E:\course-mall\` 下创建 `pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <!-- 继承 Spring Boot 官方父工程：锁定所有 starter 的版本号，子模块无需再写版本 -->
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.5</version>
        <relativePath/>   <!-- 空 = 不从本地相对路径找父 pom，直接去仓库找 -->
    </parent>

    <groupId>com.mall</groupId>
    <artifactId>course-mall</artifactId>
    <version>1.0.0</version>
    <!-- packaging=pom：父工程不产出 jar，只负责管理/聚合子模块 -->
    <packaging>pom</packaging>

    <!-- 聚合：告诉 Maven「我有这些子模块」，mvn install 时会一次性构建它们 -->
    <modules>
        <module>mall-common</module>
        <module>mall-user</module>
    </modules>

    <properties>
        <java.version>17</java.version>
    </properties>

    <!-- 依赖管理：只声明版本、不真正引入；子模块要用时再引用，且不用写版本号 -->
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>com.mall</groupId>
                <artifactId>mall-common</artifactId>
                <version>${project.version}</version>   <!-- 引用当前工程的版本 1.0.0 -->
            </dependency>
        </dependencies>
    </dependencyManagement>
</project>
```

创建 `.gitignore`：

```
target/
.idea/
*.iml
.vscode/
```

::: tip 💡 面试题：`dependencyManagement` 和 `dependencies` 有什么区别？
**一句话**：`dependencyManagement` 声明项目需要的依赖及其版本、不实际引入依赖；`dependencies` 才真正把依赖拉进工程。所以子模块引用 `mall-common` 时不用写版本号，版本统一由父工程管。详见 [Maven](/learn_backend/java/基础/Maven)。
:::

### 步骤 2：公共模块 `mall-common`

`mall-common/pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <!-- 继承自定义父工程 course-mall -->
    <parent>
        <groupId>com.mall</groupId>
        <artifactId>course-mall</artifactId>
        <version>1.0.0</version>
    </parent>

    <artifactId>mall-common</artifactId>

    <dependencies>
        <!-- spring-web：提供 @RestControllerAdvice、HttpStatus 等，全局异常要用；版本由父工程锁定，所以不写 -->
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-web</artifactId>
        </dependency>
        <!-- slf4j-api：@Slf4j 生成的 log 字段需要 org.slf4j.Logger，spring-web 不会传递它，必须显式引入；版本由父工程锁定 -->
        <dependency>
            <groupId>org.slf4j</groupId>
            <artifactId>slf4j-api</artifactId>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>   <!-- 只在编译期生效，不传递给依赖方 -->
        </dependency>
    </dependencies>
</project>
```

统一返回体 `Result.java`（路径 `com/mall/common/result/Result.java`）：

```java
package com.mall.common.result;

import lombok.Data;

// @Data 自动生成 getter/setter，减少样板代码
@Data
public class Result<T> {
    private Integer code;      // 业务状态码：200 成功，其余表示各种错误
    private String message;    // 提示信息
    private T data;            // 泛型 T：让 Result 能包裹任意类型（用户、课程、订单都能复用）

    // 静态工厂方法：调用方写 Result.ok(xxx) 比 new Result() 再逐个 set 更简洁
    public static <T> Result<T> ok(T data) {
        Result<T> r = new Result<>();
        r.code = 200;
        r.message = "success";
        r.data = data;
        return r;
    }

    public static <T> Result<T> ok() {
        return ok(null);
    }

    public static <T> Result<T> fail(Integer code, String message) {
        Result<T> r = new Result<>();
        r.code = code;
        r.message = message;
        return r;
    }
}
```

错误码枚举 `ErrorCode.java`（`com/mall/common/result/ErrorCode.java`）：

```java
package com.mall.common.result;

// 枚举：把「魔法数字」变成有名字的常量，避免到处写 500、401 这种看不懂的数字
public enum ErrorCode {
    SUCCESS(200, "success"),
    PARAM_ERROR(400, "参数错误"),
    UNAUTHORIZED(401, "未登录"),
    FORBIDDEN(403, "无权限"),
    NOT_FOUND(404, "资源不存在"),
    SYSTEM_ERROR(500, "系统繁忙，请稍后再试");

    private final Integer code;      // final：枚举常量一旦创建不可变
    private final String message;

    ErrorCode(Integer code, String message) {
        this.code = code;
        this.message = message;
    }

    public Integer getCode() { return code; }
    public String getMessage() { return message; }
}
```

业务异常 `BizException.java`（`com/mall/common/exception/BizException.java`）：

```java
package com.mall.common.exception;

import com.mall.common.result.ErrorCode;

// 继承 RuntimeException：非受检异常，业务代码里 throw 时不用强制 try-catch 或声明
public class BizException extends RuntimeException {
    private final Integer code;

    public BizException(ErrorCode errorCode) {
        super(errorCode.getMessage());   // 把 message 传给父类，getMessage() 能拿到
        this.code = errorCode.getCode();
    }

    public BizException(Integer code, String message) {
        super(message);
        this.code = code;
    }

    public Integer getCode() { return code; }
}
```

全局异常处理器 `GlobalExceptionHandler.java`（`com/mall/common/exception/GlobalExceptionHandler.java`）：

```java
package com.mall.common.exception;

import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
// @RestControllerAdvice = @ControllerAdvice + @ResponseBody：
// 拦截所有 Controller 抛出的异常，并把返回值直接序列化成 JSON
@RestControllerAdvice
public class GlobalExceptionHandler {

    // 精确匹配：BizException 走这里，能拿到业务自定义的 code 和 message
    @ExceptionHandler(BizException.class)
    public Result<Void> handleBiz(BizException e) {
        log.warn("业务异常: {}", e.getMessage());
        return Result.fail(e.getCode(), e.getMessage());
    }

    // 兜底：没被上面匹配到的异常（NPE、SQL 异常等）统一返回 500，避免把堆栈暴露给前端
    @ExceptionHandler(Exception.class)
    public Result<Void> handleOther(Exception e) {
        log.error("系统异常", e);
        return Result.fail(ErrorCode.SYSTEM_ERROR.getCode(), ErrorCode.SYSTEM_ERROR.getMessage());
    }
}
```

::: tip 💡 面试题：全局异常处理器为什么能「拦截」所有 Controller 的异常？
**一句话**：`@RestControllerAdvice` 本质是 AOP 切面——Spring 在调用 Controller 方法时套了一层代理，方法抛异常会被代理捕获，再按 `@ExceptionHandler` 声明的类型匹配到对应处理方法。比每个接口自己 `try-catch` 好在：代码不重复、异常出口统一。详见 [Spring AOP](/learn_backend/java/基础/Spring)。
:::

### 步骤 3：用户服务 `mall-user`

`mall-user/pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.mall</groupId>
        <artifactId>course-mall</artifactId>
        <version>1.0.0</version>
    </parent>

    <artifactId>mall-user</artifactId>

    <dependencies>
        <!-- 依赖自己的公共模块（版本由父工程 dependencyManagement 管理，这里不写版本号） -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <!-- web 启动器：内嵌 Tomcat + Spring MVC，让应用能对外提供 HTTP 接口 -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <!-- 打可执行 jar 的插件：mvn package 后能 java -jar 直接运行 -->
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

启动类 `MallUserApplication.java`（`com/mall/user/MallUserApplication.java`）：

```java
package com.mall.user;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// scanBasePackages 是关键：mall-common 的全局异常处理器在 com.mall.common 包下，
// 默认只扫启动类所在包 com.mall.user，必须显式扩大到 com.mall 才能扫到它
@SpringBootApplication(scanBasePackages = "com.mall")
public class MallUserApplication {
    public static void main(String[] args) {
        // run() 做了三件事：启动内嵌 Tomcat → 扫描装配所有 Bean → 挂载所有 Controller 路由
        SpringApplication.run(MallUserApplication.class, args);
    }
}
```

::: tip 💡 面试题：`@SpringBootApplication` 由哪几个注解组成？`scanBasePackages` 不写会怎样？
**一句话**：它是 `@Configuration` + `@EnableAutoConfiguration` + `@ComponentScan` 三合一。`@ComponentScan` 默认只扫启动类所在包，不写 `scanBasePackages` 就扫不到 `com.mall.common` 下的异常处理器，接口报错会变成默认的白页/堆栈而不是统一 JSON。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

配置文件 `mall-user/src/main/resources/application.yml`：

```yaml
server:
  port: 8080 # 应用端口

spring:
  application:
    name: mall-user # 应用名，后面注册到 Nacos 时就是服务名
```

接口 `HealthController.java`（`com/mall/user/controller/HealthController.java`）：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

// @RestController = @Controller + @ResponseBody：方法的返回值直接序列化成 JSON 写回响应体
@RestController
@RequestMapping("/api")   // 类级路径前缀，所有接口都挂在 /api 下
public class HealthController {

    @GetMapping("/health")   // 完整路径 = /api + /health = /api/health
    public Result<Map<String, Object>> health() {
        // HashMap：key-value 无序存储，这里只是临时组装返回数据；想保证顺序可用 LinkedHashMap
        Map<String, Object> info = new HashMap<>();
        info.put("service", "mall-user");
        info.put("time", LocalDateTime.now().toString());   // 新时间 API，线程安全且不可变
        return Result.ok(info);
    }
}
```

### 步骤 4：启动验证

在 `E:\course-mall\` 根目录执行：

```bash
mvn clean install -DskipTests        # 先整体编译安装（把 mall-common 装进本地仓库）
mvn -pl mall-user spring-boot:run    # 启动用户服务
```

浏览器或 curl 访问：

```bash
curl http://localhost:8080/api/health
```

预期返回：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "service": "mall-user",
    "time": "2026-08-19T20:30:00.123"
  }
}
```

## 三·补充：六位业务错误码设计（生产级演进）

Day01 的 `ErrorCode` 用的是简单码（`400`/`404`/`500`）。生产级项目会把错误码设计成**六位数字**，把「HTTP 状态 + 业务域 + 域内序号」压进一个数字里：

```
409101
│  │ └─ 域内序号 01（该域的第几个错误）
│  └─── 业务域 1（用户域）
└────── HTTP 状态 409 Conflict
```

**含义：用户域的第 1 号错误，HTTP 语义是 409 冲突。**

### 为什么这么设计（三个价值）

**① 错误码自带 HTTP 语义，前端零映射**
看到 `409xxx` 知道是冲突、`401xxx` 未认证、`403xxx` 无权限、`404xxx` 不存在。前端拦截器**按前 3 位统一处理**（如 401 全部跳登录页），不用维护一张「码 → HTTP 状态」的映射表。

**② 定位快：一个码 = 域 + 第几条**
码里直接编码业务域（1=用户、2=课程、3=订单……），配合「域内错误清单」，看到 `409101` 立刻去用户域错误表查第 01 条。

**③ 码是稳定的 key，文案走 i18n**
错误码本身**不变**，变的只是文案。前端展示码对应文案、后端日志记录原始码，两边对得上：

```properties
# messages_zh_CN.properties
409101=用户名已存在
# messages_en_US.properties
409101=Username already exists
```

### 和 Day01 现有代码怎么接

当前 `ErrorCode` 是「码 + 文案绑定」：

```java
public enum ErrorCode {
    NOT_FOUND(404, "资源不存在");
}
```

生产化演进是「**码与文案解耦**」——枚举只存码用，`message` 交给 `MessageSource` 按当前语言解析（i18n），`GlobalExceptionHandler` 统一转译：

```java
public enum ErrorCode {
    USERNAME_DUPLICATE(409101);   // 只存码，不绑死文案

    private final Integer code;
    ErrorCode(Integer code) { this.code = code; }
    public Integer getCode() { return code; }
}
```

```java
// GlobalExceptionHandler 里：码 + i18n key 解析成本地化文案
@ExceptionHandler(BizException.class)
public Result<Void> handleBiz(BizException e) {
    String msg = messageSource.getMessage(
            String.valueOf(e.getCode()), null,
            e.getMessage(), LocaleContextHolder.getLocale());
    return Result.fail(e.getCode(), msg);
}
```

一句话：**码给前端 / 日志用，文案给用户看**，两套解耦。Day03 的「用户名已存在」用 4xx 业务码其实语义不准——它是「409 资源冲突」，生产化后应返回 `409101`。

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点                       | 对应知识文档                                        |
| ---------------------------------- | --------------------------------------------------- |
| Maven 父子工程、依赖管理           | [Maven](/learn_backend/java/基础/Maven)             |
| `@SpringBootApplication`、自动装配 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| `@RestControllerAdvice` 切面拦截   | [Spring](/learn_backend/java/基础/Spring)           |
| `HashMap` 无序存储                 | [Java集合](/learn_backend/java/Java核心/Java集合)   |

## 五、✅ 完成后回填

- [✅ ] 完成时间：`__2026__年_8_月_21_日`
- [✅] 启动成功，`/api/health` 返回了预期 JSON：是 / 否
- [✅ ] 踩坑记录（缺环境、报错等）：lombok Slf4j 无法导入
- [✅ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. `dependencyManagement` 和 `dependencies` 有什么区别？为什么 `mall-common` 在 `mall-user` 里引用时不用写版本号？
2. `@SpringBootApplication` 由哪几个注解组成？`scanBasePackages = "com.mall"` 不写会发生什么？
3. 全局异常处理器为什么能「拦截」所有 Controller 抛的异常？它和 `try-catch` 比好在哪？
