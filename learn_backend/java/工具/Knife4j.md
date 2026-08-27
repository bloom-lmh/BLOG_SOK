# Knife4j：接口文档与 Apifox 同步

## 1. 它解决什么问题

在 Spring Boot 项目里，四个名字经常混在一起：

```text
Spring MVC Controller
        ↓ springdoc 扫描
OpenAPI JSON（机器可读的接口契约）
        ├──→ Knife4j：给开发者看的接口文档页面
        └──→ Apifox：导入接口、生成请求并进行测试
```

- **OpenAPI**：描述接口路径、请求方式、参数和响应的数据格式。
- **springdoc**：读取 Spring MVC 路由和 OpenAPI 注解，生成 `/v3/api-docs`。
- **Knife4j**：把 OpenAPI 数据展示成更易用的文档页面，默认入口是 `/doc.html`。
- **Apifox**：读取同一份 OpenAPI 数据，批量生成可调试的接口。

所以 Controller 才是接口的事实来源，不需要在 Knife4j 和 Apifox 里各手写一遍。

## 2. Spring Boot 3 接入

CourseMall 使用 Spring Boot 3 和 JDK 17，因此引入 Jakarta 版本：

```xml
<dependency>
    <groupId>com.github.xiaoymin</groupId>
    <artifactId>knife4j-openapi3-jakarta-spring-boot-starter</artifactId>
    <version>4.5.0</version>
</dependency>
```

这个 starter 已经包含 `springdoc-openapi`，不要再重复引入另一个 springdoc starter，否则容易产生版本冲突。

`application.yml`：

```yaml
springdoc:
  api-docs:
    path: /v3/api-docs
  group-configs:
    - group: mall-user
      paths-to-match:
        - /api/**
      packages-to-scan:
        - com.mall.user.controller

knife4j:
  enable: true
  setting:
    language: zh_cn
```

配置含义：

- `group`：文档分组名，同时形成 `/v3/api-docs/mall-user` 地址。
- `paths-to-match`：只收集 `/api/**` 路由。
- `packages-to-scan`：只扫描当前服务的 Controller，避免把无关端点混进来。
- `knife4j.enable`：开启 Knife4j 增强功能。

## 3. 配置文档基本信息

```java
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI mallUserOpenApi() {
        return new OpenAPI().info(new Info()
                .title("CourseMall 用户服务 API")
                .description("课程商城用户注册、登录与用户资料接口")
                .version("v1.0.0"));
    }
}
```

## 4. 给接口添加说明

```java
@RestController
@RequestMapping("/api/user")
@Tag(name = "用户接口", description = "用户注册与用户信息查询")
public class UserController {

    @Operation(summary = "用户注册")
    @PostMapping("/register")
    public Result<Long> register(@Valid @RequestBody UserRegisterDTO dto) {
        // ...
    }

    @Operation(summary = "按 ID 查询用户")
    @GetMapping("/{id}")
    public Result<UserVO> getById(
            @Parameter(description = "用户 ID", example = "1")
            @PathVariable Long id) {
        // ...
    }
}
```

DTO 字段需要补充说明时使用 `@Schema`：

```java
@Schema(description = "用户注册请求")
public class UserRegisterDTO {

    @Schema(description = "登录名", example = "zhangsan")
    private String username;
}
```

注解不是生成接口的前提：`@GetMapping`、`@PostMapping` 已足以被扫描；这些 OpenAPI 注解主要用于改善名称、说明和示例。

## 5. 启动后怎么用

| 用途 | 地址 |
|---|---|
| Knife4j 文档页面 | `http://localhost:8080/doc.html` |
| 全部 OpenAPI JSON | `http://localhost:8080/v3/api-docs` |
| `mall-user` 分组 JSON | `http://localhost:8080/v3/api-docs/mall-user` |

Knife4j 页面适合阅读和临时调试；团队接口测试、环境变量、测试用例放在 Apifox 中管理。

## 6. Apifox 一次性导入全部接口

1. 启动 Spring Boot 服务。
2. 在浏览器确认 `/v3/api-docs/mall-user` 能返回 JSON。
3. Apifox 选择“导入项目”，或进入项目后选择“项目设置 → 导入数据”。
4. 数据格式选择 **OpenAPI/Swagger**。
5. 输入 `http://localhost:8080/v3/api-docs/mall-user` 并执行导入。
6. 将本地环境的前置 URL 设置为 `http://localhost:8080`。

以后新增 Controller 接口，只需再次从相同 URL 同步。导入前先查看变更预览；已有接口的用例和自定义说明不要无脑覆盖。

## 7. Spring Security 与生产环境

Day04 开启 Spring Security 后，开发环境需要放行文档资源：

```java
.requestMatchers(
        "/doc.html",
        "/webjars/**",
        "/v3/api-docs/**",
        "/swagger-ui.html",
        "/swagger-ui/**"
).permitAll()
```

生产环境通常关闭文档：

```yaml
# application-prod.yml
springdoc:
  api-docs:
    enabled: false
  swagger-ui:
    enabled: false

knife4j:
  enable: false
```

## 8. 常见问题

### `/doc.html` 是 404

检查是否使用了 Spring Boot 3 对应的 `knife4j-openapi3-jakarta-spring-boot-starter`，以及依赖是否成功下载。

### 页面能打开，但没有业务接口

检查 `packages-to-scan` 是否写成 Controller 的真实包名，`paths-to-match` 是否覆盖实际路由。

### `/v3/api-docs/**` 返回 401 或 403

Spring Security 拦住了文档接口，把上面的文档资源加入开发环境白名单。

### Apifox 导入后接口地址不对

OpenAPI 负责描述接口路径，Apifox 环境负责服务器地址。把本地环境前置 URL 设为 `http://localhost:8080`。

## 9. 面试一句话

项目使用 springdoc 根据 Spring MVC Controller 生成 OpenAPI 3 契约，Knife4j 负责在线文档展示，Apifox 从同一份契约同步接口并维护测试用例；生产环境关闭文档端点。

参考：[Knife4j 快速开始](https://doc.xiaominfo.com/docs/quick-start)、[Knife4j 版本选择](https://doc.xiaominfo.com/docs/quick-start/start-knife4j-version)、[springdoc-openapi](https://springdoc.org/)。
