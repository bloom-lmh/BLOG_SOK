# Day 03 · 用户服务（注册/查询 + 参数校验 + 全局异常）

> **今天目标**：把「用户服务」跑通——实现**注册**和**按 id 查询**两个接口，重点是**参数校验**（`@Valid` + 校验注解）和**全局异常**（校验失败、用户名重复时返回统一 JSON）。这是你第一次写「Controller → Service → Mapper」完整三层，也是后面所有业务模块的模板。

## 一、前置条件

- 已完成 Day 01（`mall-common` / `mall-user` 骨架、`Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler` 已就位，`scanBasePackages = "com.mall"`）
- 已完成 Day 02（`course_mall` 库、`user` 表已建好，`uk_username` 唯一索引已生效）
- MySQL 可连（本机 `8.4.7`），记好 root 密码

> 今天**只动 `user` 一张表**，不新建表。字段、索引严格复用 Day 02 的设计。

## 二、完成后你会得到这些新增/修改

```
E:\course-mall\
├─ mall-user/
│  ├─ pom.xml                        # 修改：加 MyBatis-Plus + 校验 + MySQL + BCrypt
│  └─ src/main/
│     ├─ java/com/mall/user/
│     │  ├─ MallUserApplication.java   # 修改：加 @MapperScan
│     │  ├─ controller/UserController.java   # 新增：注册 + 查询接口
│     │  ├─ service/UserService.java         # 新增：接口
│     │  ├─ service/impl/UserServiceImpl.java# 新增：实现
│     │  ├─ mapper/UserMapper.java            # 新增：BaseMapper
│     │  ├─ entity/User.java                  # 新增：实体，映射 user 表
│     │  ├─ dto/UserRegisterDTO.java          # 新增：注册入参 + 校验注解
│     │  └─ vo/UserVO.java                    # 新增：查询出参（不含密码）
│     └─ resources/application.yml    # 修改：加数据源 + SQL 日志
└─ mall-common/
   └─ .../exception/GlobalExceptionHandler.java  # 修改：加参数校验异常处理
```

## 三、步骤

### 步骤 1：引入依赖 + 数据源配置

先改 `mall-user/pom.xml`，在 `<dependencies>` 里**追加**（Day 01 已有的 `mall-common`、`spring-boot-starter-web` 不动）：

```xml
<!-- 参数校验：提供 @Valid/@NotBlank 等注解 + Hibernate Validator 实现 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>

<!-- MyBatis-Plus（Spring Boot 3 专用 starter）。版本要显式写，因为没继承 MP 的父工程 -->
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
    <version>3.5.7</version>
</dependency>

<!-- MySQL 驱动。版本由 Spring Boot 父工程锁定，不用写 -->
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <scope>runtime</scope>
</dependency>

<!-- 只要 BCrypt 密码加密，不引入完整 Spring Security（那会默认开启登录拦截，Day 4 才上） -->
<dependency>
    <groupId>org.springframework.security</groupId>
    <artifactId>spring-security-crypto</artifactId>
</dependency>
```

::: tip 💡 面试题：为什么今天只引 `spring-security-crypto`，不引完整的 `spring-boot-starter-security`？
**一句话**：`spring-boot-starter-security` 会**自动装配认证过滤器链**，把没登录的请求全部拦下来（默认跳登录页），今天只想要「BCrypt 加密密码」这一项能力，所以只引 `spring-security-crypto` 这一个加密库。完整 Security 留到 Day 4 登录鉴权。详见 [Spring Security](/learn_backend/java/基础/Spring Security)。
:::

再改 `mall-user/src/main/resources/application.yml`：

```yaml
server:
  port: 8080

spring:
  application:
    name: mall-user
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    # allowPublicKeyRetrieval=true 是 MySQL 8 的坑：caching_sha2_password 认证需要客户端允许取公钥，不写会连不上
    url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
    username: root
    password: 你的MySQL密码      # ← 改成你自己的 root 密码

mybatis-plus:
  configuration:
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 控制台打印 SQL，开发期验证用，上线要删
```

### 步骤 2：实体 `User`（映射 `user` 表）

`com/mall/user/entity/User.java`：

```java
package com.mall.user.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

// @Data 自动生成 getter/setter
// @TableName 指定表名；不写时 MP 默认把类名 User 映射到表 user（驼峰转下划线），这里显式写更清晰
@TableName("user")
public class User {

    // @TableId(type = IdType.AUTO)：主键用数据库自增，插入后 MP 会把生成的主键回填到 id
    @TableId(type = IdType.AUTO)
    private Long id;

    private String username;   // 登录名，唯一（靠 DB 的 uk_username 索引保证）
    private String password;   // 只存 BCrypt 密文，绝不存明文
    private String nickname;
    private String avatar;
    private String phone;
    private String email;
    private Integer status;    // 1 启用 0 禁用

    // @TableLogic 逻辑删除：MP 把 delete 自动改成 update deleted=1，
    // 把 select/selectCount 自动拼上 where deleted=0，不用手写
    @TableLogic
    private Integer deleted;

    private LocalDateTime createTime;   // 数据库 DEFAULT CURRENT_TIMESTAMP 自动填
    private LocalDateTime updateTime;
}
```

::: tip 💡 面试题：`@TableLogic` 逻辑删除做了什么？它对应 Day 02 的哪个字段？
**一句话**：它把「删数据」变成「改 `deleted` 标记」，并且**查询自动过滤 `deleted=1` 的记录**。这就是 Day 02 设计里 `deleted TINYINT` 字段的作用——数据可恢复、历史订单可追溯。MyBatis-Plus 在 Day 6 会详细展开。
:::

### 步骤 3：Mapper `UserMapper`

`com/mall/user/mapper/UserMapper.java`：

```java
package com.mall.user.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.user.entity.User;
import org.apache.ibatis.annotations.Mapper;

// 继承 BaseMapper<User>：insert / selectById / selectCount 等 CRUD 全部现成，今天一行 SQL 都不用写
@Mapper
public interface UserMapper extends BaseMapper<User> {
}
```

### 步骤 4：注册入参 DTO + 校验注解

`com/mall/user/dto/UserRegisterDTO.java`：

```java
package com.mall.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

// DTO = Data Transfer Object：专门接收前端传来的注册参数，并在这里做「第一道」校验
// 注意 import 是 jakarta.validation —— Spring Boot 3 已从 javax 迁移到 jakarta（Java EE → Jakarta EE）
@Data
public class UserRegisterDTO {

    @NotBlank(message = "用户名不能为空")
    @Size(min = 3, max = 20, message = "用户名长度须在 3~20 之间")
    @Pattern(regexp = "^[a-zA-Z0-9_]+$", message = "用户名只能包含字母、数字、下划线")
    private String username;

    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 20, message = "密码长度须在 6~20 之间")
    private String password;

    @NotBlank(message = "昵称不能为空")
    private String nickname;

    @Email(message = "邮箱格式不正确")
    private String email;

    @Pattern(regexp = "^1[3-9]\\d{9}$", message = "手机号格式不正确")
    private String phone;
}
```

::: tip 💡 面试题：`@NotBlank`、`@NotEmpty`、`@NotNull` 有什么区别？
**一句话**：`@NotNull` 只校验「不是 null」；`@NotEmpty` 校验「不是 null 且不是空串/空集合」；`@NotBlank` 最严格，在 `@NotEmpty` 基础上还要求「至少有一个非空白字符」。所以 `"   "`（三个空格）能通过 `@NotNull` 和 `@NotEmpty`，但过不了 `@NotBlank`。校验字符串一般用 `@NotBlank`。
:::

::: tip 💡 面试题：Spring Boot 3 里校验注解是 `javax.validation` 还是 `jakarta.validation`？
**一句话**：`jakarta.validation`。Java EE 捐给 Eclipse 基金会后改名 Jakarta EE，包名从 `javax.*` 迁到 `jakarta.*`，Spring Boot 2 用 `javax`、Boot 3 用 `jakarta`，import 错了直接编译失败。
:::

### 步骤 5：Service 接口 + 实现

接口 `com/mall/user/service/UserService.java`：

```java
package com.mall.user.service;

import com.mall.user.dto.UserRegisterDTO;
import com.mall.user.vo.UserVO;

public interface UserService {
    // 注册成功返回新用户 id
    Long register(UserRegisterDTO dto);

    // 按 id 查询，返回裁剪后的 VO（不含密码）
    UserVO getById(Long id);
}
```

实现 `com/mall/user/service/impl/UserServiceImpl.java`：

```java
package com.mall.user.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.user.dto.UserRegisterDTO;
import com.mall.user.entity.User;
import com.mall.user.mapper.UserMapper;
import com.mall.user.service.UserService;
import com.mall.user.vo.UserVO;
import org.springframework.beans.BeanUtils;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class UserServiceImpl implements UserService {

    // 构造器注入（比 @Autowired 字段注入好：依赖明确、方便单测、不可变）
    private final UserMapper userMapper;
    private final BCryptPasswordEncoder passwordEncoder;

    public UserServiceImpl(UserMapper userMapper) {
        this.userMapper = userMapper;
        // BCrypt 默认强度 10，加密一次约 100ms——慢是故意的，就是为了拖慢暴力破解
        this.passwordEncoder = new BCryptPasswordEncoder();
    }

    @Override
    public Long register(UserRegisterDTO dto) {
        // ① 预检查：先查一次，给用户「友好」的快速反馈（比等数据库报错快、文案也好控）
        Long count = userMapper.selectCount(
                new LambdaQueryWrapper<User>().eq(User::getUsername, dto.getUsername()));
        if (count > 0) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "用户名已存在");
        }

        // ② 组装实体（密码先加密，绝不存明文）
        User user = new User();
        user.setUsername(dto.getUsername());
        user.setPassword(passwordEncoder.encode(dto.getPassword()));   // 明文 → BCrypt 密文
        user.setNickname(dto.getNickname());
        user.setEmail(dto.getEmail());
        user.setPhone(dto.getPhone());
        user.setStatus(1);   // 新用户默认启用

        // ③ 插入。并发下「先查再插」会漏（两个线程同时查到 count=0），
        //    所以真正的兜底是数据库的 uk_username 唯一索引 + 捕获重复键异常
        try {
            userMapper.insert(user);
        } catch (DuplicateKeyException e) {
            throw new BizException(ErrorCode.PARAM_ERROR.getCode(), "用户名已存在");
        }
        return user.getId();   // insert 后 MP 已把自增 id 回填进 user
    }

    @Override
    public UserVO getById(Long id) {
        User user = userMapper.selectById(id);
        if (user == null) {
            throw new BizException(ErrorCode.NOT_FOUND.getCode(), "用户不存在");
        }
        // 转 VO：裁剪掉 password，再把剩余字段拷过去
        UserVO vo = new UserVO();
        BeanUtils.copyProperties(user, vo);
        return vo;
    }
}
```

::: tip 💡 面试题：用户名查重，为什么「先查再插」在并发下会漏？唯一索引 + 捕获异常为什么可靠？
**一句话**：线程 A、B 同时 `selectCount` 都得到 `0`，然后都去 insert，最终插进两条相同 username。**应用层查重永远有竞态窗口**，而 `uk_username` 唯一索引是**数据库层的约束**——第二个 insert 一定被 MySQL 拒绝（报 1062），MyBatis 把它翻译成 `DuplicateKeyException`，我们捕获后转成友好提示。所以「先查」只是为了快速反馈，「唯一索引 + 异常兜底」才是真正防重。呼应 Day 02 的 `uk_username`。
:::

### 步骤 6：Controller

`com/mall/user/controller/UserController.java`：

```java
package com.mall.user.controller;

import com.mall.common.result.Result;
import com.mall.user.dto.UserRegisterDTO;
import com.mall.user.service.UserService;
import com.mall.user.vo.UserVO;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// @RestController = @Controller + @ResponseBody：每个方法的返回值都直接序列化成 JSON 写回
@RestController
@RequestMapping("/api/user")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    // POST：注册是「产生新资源」，语义上要用 POST（不是 GET，GET 不该有副作用）
    // @RequestBody：把请求体 JSON 反序列化成 UserRegisterDTO 对象
    // @Valid：触发 DTO 上的校验注解，校验失败会抛 MethodArgumentNotValidException，交给全局异常处理
    @PostMapping("/register")
    public Result<Long> register(@Valid @RequestBody UserRegisterDTO dto) {
        return Result.ok(userService.register(dto));
    }

    // GET：查询资源用 GET，符合 RESTful 语义
    // @PathVariable：从 URL 路径 /{id} 里取参数
    @GetMapping("/{id}")
    public Result<UserVO> getById(@PathVariable("id") Long id) {
        return Result.ok(userService.getById(id));
    }
}
```

::: tip 💡 面试题：`@RestController` 和 `@Controller` 有什么区别？`@ResponseBody` 做了什么？
**一句话**：`@RestController = @Controller + @ResponseBody`。`@Controller` 方法返回值默认走视图解析（找同名页面），加 `@ResponseBody` 才把返回值直接写进响应体；`@RestController` 直接就是「返回 JSON」，前后端分离项目里基本都用它。详见 [Spring MVC](/learn_backend/java/基础/Spring MVC)。
:::

::: tip 💡 面试题：为什么注册用 `POST`、查询用 `GET`？
**一句话**：RESTful 约定「GET 幂等、只读，不产生副作用；POST 用于创建资源」。注册会向数据库写入新用户，用 GET 会导致爬虫/预加载/刷新误触发重复注册；查询是只读的，用 GET 才能被缓存、被书签收藏。
:::

### 步骤 7：启动类加 `@MapperScan`

把 Day 01 的 `MallUserApplication.java` 改一下：

```java
package com.mall.user;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.mall")
// @MapperScan：让 MP 扫描到 UserMapper 并生成代理实现；不写就得在每个 Mapper 接口上加 @Mapper
@MapperScan("com.mall.user.mapper")
public class MallUserApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallUserApplication.class, args);
    }
}
```

> 说明：`@MapperScan` 和 `@Mapper` 二选一即可。`@MapperScan` 扫一个包、一处配置管所有 Mapper，模块 Mapper 多了以后更省事，所以用这个；`@Mapper` 是加在单个接口上。

### 步骤 8：扩展全局异常处理器

Day 01 的 `GlobalExceptionHandler` 已经能处理 `BizException` 和兜底 `Exception`。今天要补上「参数校验失败」的出口——校验异常如果不处理，会返回 Spring 默认的 400 错误体，而不是我们的统一 `Result` 结构。

改 `com/mall/common/exception/GlobalExceptionHandler.java`，**在类里追加**两个方法：

```java
package com.mall.common.exception;

import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BizException.class)
    public Result<Void> handleBiz(BizException e) {
        log.warn("业务异常: {}", e.getMessage());
        return Result.fail(e.getCode(), e.getMessage());
    }

    // ===== 下面两个是今天新增：参数校验失败的统一出口 =====

    // @RequestBody + @Valid 校验失败抛这个（body 里是 JSON）
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<Void> handleValid(MethodArgumentNotValidException e) {
        // 把所有字段错误拼成一条提示，多个错误时用分号隔开
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));
        return Result.fail(ErrorCode.PARAM_ERROR.getCode(), msg);
    }

    // 表单提交 / Query 参数（@ModelAttribute 或方法参数直接 @Valid）校验失败抛这个
    @ExceptionHandler(BindException.class)
    public Result<Void> handleBind(BindException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(FieldError::getDefaultMessage)
                .collect(Collectors.joining("; "));
        return Result.fail(ErrorCode.PARAM_ERROR.getCode(), msg);
    }

    @ExceptionHandler(Exception.class)
    public Result<Void> handleOther(Exception e) {
        log.error("系统异常", e);
        return Result.fail(ErrorCode.SYSTEM_ERROR.getCode(), ErrorCode.SYSTEM_ERROR.getMessage());
    }
}
```

::: tip 💡 面试题：为什么 `@RequestBody` 校验失败抛 `MethodArgumentNotValidException`，而表单/Query 参数抛 `BindException`？
**一句话**：`@RequestBody` 是先做 JSON 反序列化，再对对象做校验，失败抛的是 `MethodArgumentNotValidException`（`BindException` 的子类）；表单/Query 参数是 MVC 数据绑定时边绑定边校验，失败直接抛 `BindException`。所以两者都要接，漏一个就会有一类校验失败返回默认错误体。
:::

::: tip 💡 面试题：为什么不把校验逻辑写在 Controller 里一个个 `if` 判断，而用注解 + 全局异常？
**一句话**：注解把校验规则写在字段上，声明式、可读性好；全局异常统一把校验失败转成 `Result` 结构。如果每个接口都手写 `if (username == null) return ...`，校验代码会散落几十处、返回格式也难统一。详见 [Spring MVC](/learn_backend/java/基础/Spring MVC)。
:::

### 步骤 9：启动验证

在 `E:\course-mall\` 根目录执行：

```bash
mvn clean install -DskipTests        # 先整体编译（mall-common 有改动，重新装进本地仓库）
mvn -pl mall-user spring-boot:run    # 启动用户服务
```

**① 注册成功**：

```bash
curl -X POST http://localhost:8080/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"username":"zhangsan","password":"123456","nickname":"张三","email":"zhangsan@qq.com","phone":"13800138000"}'
```

预期（`data` 是新用户 id）：

```json
{ "code": 200, "message": "success", "data": 1 }
```

**② 参数校验失败**（用户名太短 + 密码太短）：

```bash
curl -X POST http://localhost:8080/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"username":"ab","password":"123","nickname":"张三"}'
```

预期（400，提示拼在一起）：

```json
{ "code": 400, "message": "用户名长度须在 3~20 之间; 密码长度须在 6~20 之间", "data": null }
```

**③ 用户名重复**（再注册一次 `zhangsan`）：

```json
{ "code": 400, "message": "用户名已存在", "data": null }
```

**④ 按 id 查询**（注意：返回里**没有 password 字段**）：

```bash
curl http://localhost:8080/api/user/1
```

预期：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "id": 1,
    "username": "zhangsan",
    "nickname": "张三",
    "avatar": null,
    "phone": "13800138000",
    "email": "zhangsan@qq.com",
    "status": 1,
    "createTime": "2026-08-19T21:00:00"
  }
}
```

**⑤ 查不存在的用户**：

```bash
curl http://localhost:8080/api/user/999
```

预期：

```json
{ "code": 404, "message": "用户不存在", "data": null }
```

> 到这一步，去数据库 `SELECT id, username, password FROM user;` 看一眼：`password` 字段应该是一串 `$2a$10$...` 开头的 BCrypt 密文，不是 `123456`。这验证了「明文不落库」。

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| MVC 三层、`@RestController`/`@RequestBody`/`@PathVariable` | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| `@Valid` 参数校验、`jakarta.validation` 注解 | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| `spring-boot-starter-validation` 自动装配 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| `@RestControllerAdvice` 全局异常 | [Spring](/learn_backend/java/基础/Spring) |
| MyBatis-Plus `BaseMapper`/实体映射/`@TableLogic`（Day 6 详解） | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| BCrypt 密码加密 | [Spring Security](/learn_backend/java/基础/Spring Security) |
| `uk_username` 唯一索引防重 | [MySQL](/learn_database/MySQL) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 注册成功，`data` 返回了新用户 id：是 / 否
- [ ] 数据库里 `password` 是 BCrypt 密文（非明文）：是 / 否
- [ ] 参数校验失败返回 400 + 统一 JSON：是 / 否
- [ ] 用户名重复返回「用户名已存在」：是 / 否
- [ ] 按 id 查询返回体里**没有 password 字段**：是 / 否
- [ ] 踩坑记录（MySQL 连不上、版本报错等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. `@RestController` 和 `@Controller` 有什么区别？`@ResponseBody` 到底做了什么？
2. `@Valid` 和 `@Validated` 有什么区别？什么场景下必须用 `@Validated`（提示：分组校验）？
3. `@NotBlank`、`@NotEmpty`、`@NotNull` 三者区别？各举一个「能通过前两个、通不过后一个」的值。
4. 为什么 `@RequestBody` 校验失败抛 `MethodArgumentNotValidException`，而表单/Query 参数抛 `BindException`？
5. 用户名查重，为什么「先查再插」在并发下会漏？唯一索引 + 捕获 `DuplicateKeyException` 为什么能兜住？（呼应 Day 02 的 `uk_username`）
