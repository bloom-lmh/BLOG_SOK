# Day 14 · 配置中心（Nacos Config + 多环境 + 动态刷新）

> **今天目标**：把 `mall-user` 的可动态业务配置放到 Nacos，实现集中管理、环境隔离和动态刷新。连接 Nacos 的最小配置仍留在本地，密码/私钥由环境变量或专用密钥系统注入。

## 一、前置条件

- 已完成 **Day 13（服务拆分 + Nacos 注册）**：Nacos Server 已启动，`mall-user` 已注册到 Nacos，控制台 `http://localhost:8848/nacos`（账号密码 `nacos/nacos`）能登录
- Day 13 已在父 `pom.xml` 引入 **Spring Cloud Alibaba `2023.0.1.0` BOM**，所以今天新增的 nacos-config 依赖不写版本号
- `mall-user` 已依赖 `spring-cloud-starter-alibaba-nacos-discovery`（注册中心和配置中心是两回事，今天再加配置中心的 starter）

> ⚠️ 如果 Nacos 没启动，先回 Day 13 用 `startup.cmd -m standalone` 拉起来。今天每一步都依赖它在线。

## 二、今天完成后你会得到什么

1. `mall-user` 启动时自动从 Nacos 拉配置（Data ID `mall-user.yaml`）
2. 一个 `ConfigController`，能用两种方式（`@Value` / `@ConfigurationProperties`）读出 Nacos 里的配置
3. 改 Nacos 配置 → 不重启应用 → 接口返回新值（动态刷新）
4. `dev` / `prod` 两个 namespace，一行启动参数切换环境

## 三、步骤

### 步骤 1：先想清楚——配置中心到底解决什么问题

单体只有一份 `application.yml`，改配置重启一下就完事。但 Day 13 把服务拆开后，配置的痛点就来了：

| 痛点 | 具体表现 |
|---|---|
| 配置散落 | 每个服务各一份配置文件，几十个服务散在几十个目录里，改一个 DB 地址要改几十份 |
| 改完要重启 | 配置写在本地文件里，改了必须重新打包、重新发布、逐个实例重启 |
| 环境难隔离 | dev / prod 的差异靠注释、靠改名、靠人工记忆，容易把测试库地址带到生产 |
| 敏感信息进仓库 | 密码、密钥直接写在代码里，谁 clone 代码谁就能看到 |

**配置中心**把这些集中到 Nacos：服务启动时去拉配置，配置变更时服务端推送给客户端，环境用 namespace 物理隔离。

::: tip 💡 面试题：为什么微服务需要配置中心？
**一句话**：解决「配置散落、改配置要重启、环境难隔离、敏感信息进代码仓库」四大痛点——配置集中托管，改一处全局生效、动态刷新、多环境一键切换。详见 [Nacos](/learn_backend/java/微服务/Nacos)。
:::

### 步骤 2：引入 nacos-config 依赖

打开 `E:\course-mall\mall-user\pom.xml`，在 `<dependencies>` 里**新增**：

```xml
<!-- Nacos 配置中心：从 Nacos 拉配置 + 监听配置变更。
     版本由 Day13 在父 pom 引入的 Spring Cloud Alibaba BOM 统一锁定，所以不写版本号 -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-config</artifactId>
</dependency>
```

::: tip 💡 面试题：`nacos-config` 和 `nacos-discovery` 是同一个 starter 吗？
**一句话**：不是。`nacos-discovery` 管**服务注册与发现**（把服务注册上去、从注册表查实例列表），`nacos-config` 管**配置管理**（从 Nacos 拉配置、监听配置变更）。职责完全独立，两个都要用时分别引入。详见 [Nacos](/learn_backend/java/微服务/Nacos)。
:::

### 步骤 3：改造 `application.yml` —— 告诉应用「配置去哪读」

改 `E:\course-mall\mall-user\src\main\resources\application.yml`：

```yaml
server:
  port: 8080

spring:
  application:
    name: mall-user                # 应用名：同时是配置 Data ID 的默认前缀
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_SERVER_ADDR:127.0.0.1:8848}
      config:
        server-addr: ${NACOS_SERVER_ADDR:127.0.0.1:8848}
        namespace: ${NACOS_NAMESPACE:dev}
        group: ${NACOS_GROUP:DEFAULT_GROUP}
  config:
    import:
      # 从 Nacos 导入配置：拼出来的 Data ID = mall-user.yaml
      # optional: 前缀表示「拉不到也不报错、不阻塞启动」（步骤 6 有面试题）
      - optional:nacos:${spring.application.name}.yaml
```

关键点说明（为什么这么写）：

- **`spring.config.import` 是 Spring Cloud 2020+ 的推荐写法**：不再需要 `bootstrap.yml`，直接在主配置文件里声明「我还要从 Nacos 导入一份配置」。
- **Data ID 命名规则**：`{spring.application.name}.{扩展名}` → `mall-user.yaml`。扩展名直接写在 import 字符串里（`.yaml`），所以不用再配老式的 `file-extension`。
- **`namespace` 填的是「命名空间ID」不是名字**：Nacos 控制台建命名空间时要填「命名空间名」和「命名空间ID」两个字段，代码里认的是 **ID**。把名字填进去会报「config not found」，这是最经典的坑。

::: tip 💡 面试题：`bootstrap.yml` 和 `application.yml` 有什么区别？为什么新版本默认不加载 `bootstrap.yml`？
**一句话**：`bootstrap.yml` 属于「引导上下文」，在应用上下文启动**之前**加载，负责先连上配置中心把配置拉回来；`application.yml` 是应用上下文自己的配置。Spring Cloud 2020 起默认**移除了 bootstrap 上下文**，改用 `spring.config.import` 引入配置中心（加载顺序问题由框架内部保证）；老项目要继续用 `bootstrap.yml` 得额外引入 `spring-cloud-starter-bootstrap`。详见 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)。
:::

### 步骤 4：在 Nacos 控制台建命名空间 + 建配置

1. 浏览器打开 `http://localhost:8848/nacos`，登录（`nacos/nacos`）
2. 左侧 **命名空间** → **新建命名空间**：
   - 命名空间名：`dev`
   - 命名空间ID：`dev`（保持一样，方便记；**代码里用的是这个 ID**）
3. 左侧 **配置管理 → 配置列表** → 右上角切到 `dev` 命名空间 → 点 **+**（新建配置）
4. 按下面填好并**发布**：

| 字段 | 值 |
|---|---|
| Data ID | `mall-user.yaml` |
| Group | `DEFAULT_GROUP` |
| 配置格式 | `YAML` |
| 配置内容 | 见下面代码块 |

```yaml
# Nacos 里的配置内容（Data ID: mall-user.yaml，Group: DEFAULT_GROUP，dev 命名空间）
mall:
  user:
    welcome: 欢迎来到课程商城
    max-login-fail: 5
```

发布后，`mall-user` 启动时就会把 `mall.user.welcome`、`mall.user.max-login-fail` 这两个配置拉下来。

### 步骤 5：用代码读配置 —— `@ConfigurationProperties` vs `@Value`

新建配置类 `E:\course-mall\mall-user\src\main\java\com\mall\user\config\UserProperties.java`：

```java
package com.mall.user.config;

import lombok.Data;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;

@Data
@Component
@Validated
// @ConfigurationProperties(prefix)：按前缀 mall.user 批量绑定配置——
// welcome → mall.user.welcome，maxLoginFail → mall.user.max-login-fail
// （松散绑定：中划线和驼峰自动对应，这是 Spring Boot 的约定）
@ConfigurationProperties(prefix = "mall.user")
// @RefreshScope：Nacos 配置变更时，这个 bean 会被销毁重建、重新绑定最新值（步骤 6 细讲）
@RefreshScope
public class UserProperties {
    @NotBlank
    private String welcome;
    @Min(1)
    @Max(20)
    private Integer maxLoginFail;
}
```

新建控制器 `E:\course-mall\mall-user\src\main\java\com\mall\user\controller\ConfigController.java`：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import com.mall.user.config.UserProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.context.config.annotation.RefreshScope;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Profile("dev")
// 注意：@Value 字段直接写在这个 Controller 里，想让 @Value 也动态刷新，这个类同样要标 @RefreshScope
@RefreshScope
public class ConfigController {
    private final String welcome;
    private final UserProperties userProperties;

    public ConfigController(
            @Value("${mall.user.welcome:默认欢迎语}") String welcome,
            UserProperties userProperties) {
        this.welcome = welcome;
        this.userProperties = userProperties;
    }

    @GetMapping("/config")
    @PreAuthorize("hasRole('ADMIN')")
    public Result<ConfigView> config() {
        return Result.ok(new ConfigView(
                welcome, userProperties.getWelcome(), userProperties.getMaxLoginFail()));
    }

    public record ConfigView(String valueWelcome, String propertiesWelcome, Integer maxLoginFail) {}
}
```

`/api/config` 只是学习用观测端点，所以限定 `dev + ADMIN`。真实项目不应返回数据库密码、JWT 秘钥、AccessKey 等配置值。

::: tip 💡 面试题：`@Value` 和 `@ConfigurationProperties` 有什么区别？为什么项目里更推荐后者？
**一句话**：`@Value` 是**逐个**注入、靠字符串拼 key、**没有类型校验**（把 `5` 配成字符串也可能不报错）；`@ConfigurationProperties` 是**按前缀批量绑定**、**类型安全**、支持 `List`/`Map` 等复杂结构和 `@Validated` 校验。配置项一多，后者更清晰、更不容易错。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

### 步骤 6：启动验证 + 动态刷新实验

先整体编译（把 `mall-common` 装进本地仓库、确认新依赖能下下来）：

```bash
# 在 E:\course-mall\ 根目录
mvn clean install -DskipTests
mvn -pl mall-user spring-boot:run
```

```bash
curl http://localhost:8080/api/config
```

预期返回：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "welcome(@Value)": "欢迎来到课程商城",
    "welcome(@ConfigurationProperties)": "欢迎来到课程商城",
    "maxLoginFail": 5
  }
}
```

**现在做动态刷新实验（今天的核心动作）**：

1. 回到 Nacos 控制台（dev 命名空间），把 `mall.user.welcome` 改成 `欢迎来到课程商城 V2`，**发布**
2. **不重启应用**，再 curl 一次 `/api/config`

`welcome` 变成了新值——这就是「改配置不重启」。

**为什么必须加 `@RefreshScope`？**

- Spring 的 bean 默认是**单例**：`@Value` 在 bean 创建的那一刻注入一次，之后就固定死了，改配置它也不会自己变。
- `@RefreshScope` 用 **CGLIB 代理**包一层：Nacos 配置变更事件到达时，把原 bean **销毁**，下次访问时**重建**，重建过程中重新执行 `@Value` 注入 / `@ConfigurationProperties` 绑定，于是拿到最新值。
- 所以规则很简单：**只有标了 `@RefreshScope` 的 bean 才会刷新**；不标，值永远不变。

::: tip 💡 面试题：为什么 `@Value` 不加 `@RefreshScope`，改了配置不生效？
**一句话**：bean 是单例，`@Value` 在容器启动时注入一次就固化；`@RefreshScope` 用 CGLIB 代理在配置变更时**销毁并重建 bean**，重建时才重新解析注入新值。详见 [Spring](/learn_backend/java/基础/Spring)。
:::

::: tip 💡 面试题：Nacos Config 的动态刷新和 Spring Cloud Config 的 `/actuator/refresh` 有什么区别？
**一句话**：Nacos Config 客户端**长轮询**监听配置变更，服务端一发布，客户端自动收到推送、自动刷新，全程无需人工干预；老版 Spring Cloud Config 是「拉」模型，必须**手动 POST `/actuator/refresh`** 才会刷新。
:::

::: tip 💡 面试题：`spring.config.import` 里的 `optional:` 前缀有什么用？
**一句话**：`optional:` 表示「这个配置源可选」——Nacos 连不上或配置不存在时**不阻塞启动**（没读到的 key 用默认值兜底）；不加它，拉不到配置会**直接启动失败（fail-fast）**。生产上通常「关键配置不加 optional（宁可启动失败暴露问题）、非关键配置加 optional」。
:::

### 步骤 7：多环境隔离 —— namespace + 启动参数切换

微服务上线前必须有 dev / prod 环境。Nacos 提供两种隔离手段，**最常用的是 namespace**：

| 手段 | 隔离粒度 | 用法 |
|---|---|---|
| **namespace** | 物理隔离（互不可见，不同 namespace 可以有相同 Data ID） | 每个环境一个 namespace，启动时指定 |
| **group** | 逻辑分组（同一 namespace 内再分） | 如 `DEFAULT_GROUP` / `BIZ_GROUP` |

**用 namespace 切环境**：

1. Nacos 控制台再建一个命名空间：命名空间名 `prod`、命名空间ID `prod`
2. 切到 `prod` 命名空间，建**同名** Data ID `mall-user.yaml`，内容不同：

```yaml
# prod 命名空间下的 mall-user.yaml：生产环境配置，内容和 dev 不同
mall:
  user:
    welcome: 欢迎来到课程商城（生产环境）
    max-login-fail: 3
```

3. 切换环境只改一个启动参数：

```bash
# dev 环境（本地默认）
mvn -pl mall-user spring-boot:run

# prod 环境：PowerShell 用环境变量注入，不改 jar
$env:NACOS_NAMESPACE="prod"
mvn -pl mall-user spring-boot:run
```

启动后再 `curl /api/config`，`welcome` 会变成「生产环境」那句。

> 实际部署时，`namespace` 用**环境变量**注入（`SPRING_CLOUD_NACOS_CONFIG_NAMESPACE=prod`）比写死在 yml 更安全——dev 和 prod 用同一份代码、同一个包，靠环境变量区分，从机制上杜绝「把 dev 配置打包到 prod」。

::: tip 💡 面试题：`namespace` 和 `group` 有什么区别？
**一句话**：`namespace` 做**环境隔离**（dev/test/prod 完全隔离、互不可见，不同 namespace 可以有相同的 Data ID）；`group` 做**同一环境内的业务/应用分组**（默认 `DEFAULT_GROUP`）。详见 [Nacos](/learn_backend/java/微服务/Nacos)。
:::

::: tip 💡 面试题：Nacos 远程配置和本地 `application.yml` 冲突时谁赢？
**一句话**：不要背“Nacos 永远覆盖本地”。最终值受 Spring Boot PropertySource 优先级、`spring.config.import` 顺序和命令行/环境变量影响。工程上避免同一 key 在多处重复定义，并在授权的管理环境中追踪配置来源。
:::

::: warning Nacos Config 不等于密钥管理系统
配置集中化不代表已加密。生产密码、JWT 签名私钥、OSS AccessKey 应由环境变量、Kubernetes Secret、Vault/KMS 等注入，并限制 Nacos 控制台权限。
:::

> 今天只给 `mall-user` 接了配置中心，把「怎么接」讲透。后面新增的 `mall-course`、订单服务等接入方式完全一样：加同一个依赖、写同一段 `spring.config.import`、建各自的 Data ID（如 `mall-course.yaml`）即可。Day 15 起就会用到这些配置。

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| Nacos Config 配置中心、动态刷新、长轮询 | [Nacos](/learn_backend/java/微服务/Nacos) |
| 微服务配置中心、`spring.config.import` | [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) |
| `@ConfigurationProperties`、松散绑定 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| `@RefreshScope` CGLIB 代理、bean 销毁重建 | [Spring](/learn_backend/java/基础/Spring) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-user` 启动成功，日志里能看到从 Nacos 拉到了 `mall-user.yaml`：是 / 否
- [ ] `curl /api/config` 返回了 `welcome` 和 `maxLoginFail`：是 / 否
- [ ] 改 Nacos 配置后**不重启**，`/api/config` 返回新值（动态刷新生效）：是 / 否
- [ ] dev / prod 两个 namespace 切换，`welcome` 不同：是 / 否
- [ ] 踩坑记录（namespace 填错、配置拉不到、启动报错等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 为什么微服务需要配置中心？它解决了哪几个痛点？
2. `@Value` 和 `@ConfigurationProperties` 有什么区别？为什么推荐后者？
3. 为什么 `@Value` 不加 `@RefreshScope`，改了配置不生效？`@RefreshScope` 底层是怎么实现「刷新」的？（提示：CGLIB 代理 + 销毁重建）
4. `namespace` 和 `group` 有什么区别？从 dev 切到 prod 具体怎么操作？
5. `optional:nacos:` 里的 `optional` 起什么作用？去掉它会怎样？Nacos 远程配置和本地 `application.yml` 冲突时谁赢？
