# MapStruct · DTO / VO / PO 概念与转换

> **一句话定位**：MapStruct 是一个**编译期 Bean 映射工具**，自动生成 DTO ↔ PO 的转换代码，解决「对象之间属性拷贝」的样板代码。它和 Lombok 是黄金搭档——Lombok 生成 getter/setter，MapStruct 用它们做转换，都在编译期完成，运行时零开销。

---

## 目录

- [一、DTO / VO / PO 概念](#一dto--vo--po-概念)
  - [1. 三层对象的分工](#1-三层对象的分工)
  - [2. 为什么分层](#2-为什么分层)
  - [3. 分层的核心价值](#3-分层的核心价值)
  - [4. 典型流转链路](#4-典型流转链路)
- [二、为什么需要转换工具](#二为什么需要转换工具)
  - [1. 手写转换的痛点](#1-手写转换的痛点)
  - [2. 常见方案对比](#2-常见方案对比)
- [三、MapStruct 使用](#三mapstruct-使用)
  - [1. 引入依赖](#1-引入依赖)
  - [2. 基础映射](#2-基础映射)
  - [3. 多个对象合并](#3-多个对象合并)
  - [4. 集合转换](#4-集合转换)
  - [5. `@MappingTarget`：更新已有对象](#5-mappingtarget更新已有对象)
  - [6. 自定义填值：`default` 与 `expression`](#6-自定义填值default-与-expression)
  - [7. `unmappedTargetPolicy`：未映射字段的编译级别](#7-unmappedtargetpolicy未映射字段的编译级别)
- [四、MapStruct + Lombok 配合](#四mapstruct--lombok-配合)
- [五、项目中的典型用法](#五项目中的典型用法)
- [六、小结](#六小结)

---

## 一、DTO / VO / PO 概念

### 1. 三层对象的分工

后端项目里，数据在不同层之间流转，各层有自己专属的对象结构：

| 对象 | 全称 | 在哪层用 | 职责 |
| --- | --- | --- | --- |
| **PO** | Persistent Object | DAO / Mapper 层 | 与数据库表**一一对应**，一个字段对应表一列 |
| **DTO** | Data Transfer Object | Service / Controller 层 | 承载**接口的入参和出参**，不暴露数据库结构 |
| **VO** | View Object | Controller 层（返回给前端） | 专门给前端展示用的，可能组合多个 PO 的数据 |

### 2. 为什么分层？

不分层的后果——**直接把 PO 返回给前端**：

```java
// User PO：数据库表结构，里面有 password 字段
public class User {
    private Long id;
    private String username;
    private String password;    // ← 密码不能返回给前端！
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
```

分层后：

```java
// PO：对应数据库，一个字段都不能少
public class UserPO {
    private Long id;
    private String username;
    private String password;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

// VO：给前端看，只暴露需要的字段
public class UserVO {
    private Long id;
    private String username;
    // 没有 password，没有 createdAt/updatedAt
}

// DTO：接收前端请求参数，可能包含校验注解
public class UserDTO {
    @NotBlank(message = "用户名不能为空")
    private String username;

    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 20, message = "密码长度 6-20")
    private String password;
}
```

### 3. 分层的核心价值

| 价值 | 说明 |
| --- | --- |
| **安全** | PO 的 `password` 字段不会意外泄露给前端 |
| **解耦** | 数据库表结构变了，只改 PO，不影响前端接口 |
| **灵活** | VO 可以组合多个 PO 的数据（如订单 VO 包含商品名 + 用户名的冗余字段） |
| **校验** | DTO 上加 `@NotNull` 等校验注解，不影响 PO 的实体定义 |

### 4. 典型流转链路

```
前端请求 JSON
    ↓
UserDTO（接收参数，校验）
    ↓
Service 层：DTO → PO（转成数据库实体）
    ↓
UserPO（操作数据库）
    ↓
Service 层：PO → VO（转成前端展示结构）
    ↓
UserVO（返回给前端）
```

---

## 二、为什么需要转换工具

### 1. 手写转换的痛点

```java
// 每写一个接口，都要手写这样的转换代码：
public UserVO toVO(UserPO po) {
    UserVO vo = new UserVO();
    vo.setId(po.getId());
    vo.setUsername(po.getUsername());
    vo.setNickname(po.getNickname());
    // ... 几十个字段，每个都要写一次
    return vo;
}

public UserPO toPO(UserDTO dto) {
    UserPO po = new UserPO();
    po.setUsername(dto.getUsername());
    po.setPassword(passwordEncoder.encode(dto.getPassword()));  // 特殊处理
    // ...
    return po;
}
```

**问题**：几十个字段的 PO → VO 转换，每个字段都要写 `setXxx(po.getXxx())`，枯燥、易漏、难维护。字段增删时要改所有转换方法。

### 2. 常见方案对比

| 方案 | 原理 | 性能 | 优缺点 |
| --- | --- | --- | --- |
| **手写 setter** | 每个字段手动赋值 | ⭐⭐⭐⭐⭐ 最快 | 写死人，易漏，但最可控 |
| **BeanUtils.copyProperties** | 运行时反射拷贝 | ⭐⭐ 慢 | 一行代码，但反射慢、类型不匹配时静默失败、字段名不同不行 |
| **MapStruct** | 编译期生成 setter 代码 | ⭐⭐⭐⭐⭐ 和手写一样快 | 编译期生成，零反射，类型安全，推荐 |

**MapStruct 和手写一样快**——因为它生成的 `.class` 文件里就是普通的 `setXxx(getXxx())` 代码，和手写没区别。反射方案（BeanUtils）在调用量大的时候有明显性能差距。

---

## 三、MapStruct 使用

### 1. 引入依赖

```xml
<dependency>
    <groupId>org.mapstruct</groupId>
    <artifactId>mapstruct</artifactId>
    <version>1.5.5.Final</version>
</dependency>

<!-- 注解处理器，编译期生成实现类 -->
<dependency>
    <groupId>org.mapstruct</groupId>
    <artifactId>mapstruct-processor</artifactId>
    <version>1.5.5.Final</version>
    <scope>provided</scope>    <!-- 只在编译期需要，和 Lombok 一样 -->
</dependency>
```

### 2. 基础映射

```java
// 定义一个转换器接口：MapStruct 编译期自动生成实现类
@Mapper(componentModel = "spring")   // 生成为 Spring Bean，可 @Autowired 注入
public interface UserConverter {

    // 字段名相同时，自动映射（无需额外配置）
    UserVO toVO(UserPO po);

    // 字段名不同时，用 @Mapping 指定
    @Mapping(source = "password", target = "password", ignore = true)  // 忽略密码
    @Mapping(source = "createTime", target = "createdAt", dateFormat = "yyyy-MM-dd HH:mm:ss")
    UserVO toVOWithMapping(UserPO po);
}
```

**编译后自动生成的代码（可以反编译看到）：**

```java
// MapStruct 在编译期生成了这个实现类
@Component
public class UserConverterImpl implements UserConverter {

    @Override
    public UserVO toVO(UserPO po) {
        if (po == null) return null;
        UserVO vo = new UserVO();
        vo.setId(po.getId());
        vo.setUsername(po.getUsername());
        // ... 全部字段自动赋值
        return vo;
    }
}
```

### 3. 多个对象合并

```java
// 把多个 PO 合并成一个 VO
@Mapper(componentModel = "spring")
public interface OrderConverter {

    @Mapping(source = "order.id", target = "orderId")
    @Mapping(source = "user.username", target = "userName")
    @Mapping(source = "product.title", target = "productName")
    OrderVO toVO(OrderPO order, UserPO user, ProductPO product);
}
```

### 4. 集合转换

```java
@Mapper(componentModel = "spring")
public interface UserConverter {

    // 单个对象
    UserVO toVO(UserPO po);

    // 集合：List<UserPO> → List<UserVO>，一行搞定
    List<UserVO> toVOList(List<UserPO> poList);
}
```

### 5. `@MappingTarget`：更新已有对象

普通转换方法会创建一个新对象：

```java
Course toEntity(CourseSaveDTO source);
```

参数添加 `@MappingTarget` 后，MapStruct 不再创建新对象，而是把来源对象的数据写入调用方传入的已有对象：

```java
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface CourseConverter {

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "viewCount", ignore = true)
    @Mapping(target = "buyCount", ignore = true)
    @Mapping(target = "stock", ignore = true)
    @Mapping(target = "version", ignore = true)
    @Mapping(target = "deletedAt", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "updatedBy", ignore = true)
    @Mapping(target = "createTime", ignore = true)
    @Mapping(target = "updateTime", ignore = true)
    void updateEntity(CourseSaveDTO source, @MappingTarget Course target);
}
```

两个参数的职责：

- `CourseSaveDTO source`：数据来源，MapStruct 从中读取字段。
- `@MappingTarget Course target`：修改目标，MapStruct 直接调用它的 setter。

业务代码先查询数据库中的原对象，再把允许修改的字段覆盖进去：

```java
Course course = courseMapper.selectById(id);
courseConverter.updateEntity(dto, course);
courseMapper.updateById(course);
```

MapStruct 生成的实现大致如下：

```java
@Override
public void updateEntity(CourseSaveDTO source, Course target) {
    if (source == null) {
        return;
    }
    if (source.getTitle() != null) {
        target.setTitle(source.getTitle());
    }
    if (source.getPrice() != null) {
        target.setPrice(source.getPrice());
    }
}
```

`NullValuePropertyMappingStrategy.IGNORE` 表示来源字段为 `null` 时保留目标对象原值，因此常用于部分更新。`id`、库存、版本号和审计字段通过 `ignore = true` 禁止 MapStruct 修改，分别交给数据库、专用业务和审计填充器处理。

> 如果字段需要区分“没有传”和“明确修改为 `null`”，不能只依赖该策略；同时，更新 DTO 的可选数字字段应使用 `Integer/Long` 等包装类型，基本类型 `int/long` 无法表达“没有传”。

### 6. 自定义填值：`default` 与 `expression`

普通字段靠 MapStruct **自动映射**；需要特殊逻辑的字段，有两种「让 converter 自己填」的方式：`default` 方法（按类型自动调用）和 `expression`（按字段精确取值）。

#### 6.1 `default`：自定义转换方法（按类型自动调用）

```java
@Mapper(componentModel = "spring")
public interface UserConverter {

    UserPO toPO(UserDTO dto);

    // 自定义转换方法：加密密码
    // MapStruct 编译时看到这个方法，在 toPO 里自动调用它处理 password 字段
    default String encodePassword(String password) {
        return passwordEncoder.encode(password);
    }
}
```

> ⚠️ **注意上面的写法有隐患**：`componentModel = "spring"` 的接口里，`default` 方法无法注入 `PasswordEncoder`（接口里不能有字段）。要真正注入依赖，得用 `abstract class`（见 6.2 的例子）。而且 `password` 如果同时标的 `ignore=true`，这个 `default` 方法根本不会被调用（见第 7 节「unmappedTargetPolicy 与 ignore」）。

**`default` 的触发规则（重点）**：它按**类型**匹配——只要「源类型 → 目标类型」对得上，MapStruct 就会自动插入调用。所以 `default String encodePassword(String s)` 会影响**所有 String→String 的字段**（除非某字段有更精确的 `@Mapping`）。优点是一次定义全部复用；坑是**可能误伤**别的类型相同的字段。

#### 6.2 `expression`：表达式填值（按字段精确取值）

`expression` 让某个目标字段**不靠自动映射，而是执行一段 Java 代码来取值**。适合「转换器内部就能直接算出值」的场景（如当前时间、拼接、格式化）。

```java
@Mapper(componentModel = "spring")
public abstract class UserConverter {   // 用 abstract class，不是 interface

    protected final PasswordEncoder passwordEncoder;

    public UserConverter(PasswordEncoder passwordEncoder) {
        this.passwordEncoder = passwordEncoder;
    }

    // expression：把 this 对象作为目标源，表达式里可直接调方法
    @Mapping(target = "createTime", expression = "java(LocalDateTime.now())")
    @Mapping(target = "password",   expression = "java(passwordEncoder.encode(dto.getPassword()))")
    public abstract UserPO toPO(UserDTO dto);
}
```

**`expression` 的规则（务必注意）**：

1. **必须 `java(...)` 包裹**，且**括号内不能有分号 `;`**——只能是单个表达式。
2. 表达式里**能访问**：源对象参数名（如 `dto`）、`this`（所以能调 converter 里的方法/字段，如上面的 `passwordEncoder`）。
3. 表达式里**不能访问**：局部变量、未 `import` 的类（`LocalDateTime` 需在类里 import）。
4. 适合「**一句话能算出来的值**」；逻辑复杂就提取成 `default` 方法再在 `expression` 里调用。

**两种方式的区别**：

| | `default` 方法 | `expression = "java(...)"` |
| --- | --- | --- |
| 怎么触发 | **隐式、按类型自动** | **显式、按字段精确指定** |
| 作用范围 | 所有「源 & 目标类型」匹配的字段 | 只作用于 `@Mapping` 指定的那个字段 |
| 优点 | 写一次，全类型复用 | 指哪打哪，不会误伤 |
| 坑 | 可能误伤其他同类型字段 | 一个字段一行，字段多了啰嗦 |

**和 `ignore` + 外部手写对比（项目实际方案）**：

| 方式 | 谁填 | 适用 |
| --- | --- | --- |
| `expression = "java(...)"` | **converter 自己**（转换内算出来） | createTime 想用 `now()`、密码在转换里加密 |
| `default` 自定义方法 | converter 内部，但依赖注入受限 | 简单、无需依赖的计算 |
| `ignore = true` + 业务层手动 set | **外部代码**（Service / 数据库） | createTime 让数据库 `DEFAULT` 填、密码在业务层加密 |

项目选 `ignore` + Service 手写的原因：converter 保持「纯字段拷贝器」，`password`/`status` 归业务层、`createTime`/`id` 归数据库，特殊字段靠 `@Mapping(ignore=true)` 显式声明「谁填」而不是塞进 converter。

### 7. `unmappedTargetPolicy`：未映射字段的编译级别

**`unmapped`** = 目标类里有、但源里找不到对应字段的属性。比如 `UserPO` 有 `password`、`createTime`，而 `UserDTO` 没有——这些就是 "unmapped target fields"（未被映射的目标字段）。

`unmappedTargetPolicy` 决定对这些字段，编译时报什么：

| 值 | 效果 | 场景 |
| --- | --- | --- |
| `IGNORE`（默认） | 静默跳过，不报错不警告 | 宽松，但漏字段看不出 |
| `WARN` | 打印警告，不中断编译 | 提醒但不阻塞 |
| **`ERROR`** | **编译直接失败**，强制你显式处理 | 最严格，安全敏感场景 |

```java
// 项目里推荐 ERROR：目标字段漏处理 → 编译失败，而不是悄悄留 null
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface UserConverter {
    // 因 ERROR，凡是下面没显式 ignore、DTO 里也没有的字段，编译必失败
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "password", ignore = true)
    UserPO toPO(UserDTO dto);
}
```

**`ignore` 与 `unmappedTargetPolicy` 的配合（重点）**：

- `ignore = true` 的含义是「**这个字段我自己处理**」（转成目标后保持零值/空，由数据库或业务代码另填），见 [Day03](/learn_project/course-mall/Day03-用户服务) 的 `UserConverter`。
- 有了 `ERROR`，**每个不想映射的字段都必须显式 `@Mapping(ignore=true)`**，否则编译失败。这就是用「编译期强制报错」逼你把字段处理写清楚，防止「新增了敏感字段却悄悄漏映射」。

> 💡 `unmappedTargetPolicy` 只管**目标类**的字段。如果目标类里**根本没有**某个字段（比如 `UserVO` 没有 `password`），那不叫 unmapped，MapStruct 不会报错——所以 `toVO` 那边不用管 password。

---

## 四、MapStruct + Lombok 配合

两个编译期工具，分工明确，不冲突：

```
编译期：
Lombok 生成 getter/setter → MapStruct 用这些 getter/setter 生成转换代码
                                                                    ↓
                                    .class 里：setXxx(getXxx()) 已真实存在
运行时：
零反射，零开销，和手写一样快
```

```java
// Lombok 生成 getter/setter
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserPO {
    private Long id;
    private String username;
    private String password;
    private LocalDateTime createdAt;
}

// MapStruct 使用这些 getter/setter 做转换
@Mapper(componentModel = "spring")
public interface UserConverter {
    UserVO toVO(UserPO po);
    List<UserVO> toVOList(List<UserPO> poList);
}
```

---

## 五、项目中的典型用法

```java
@Service
public class UserService {

    private final UserMapper userMapper;
    private final UserConverter userConverter;

    public UserService(UserMapper userMapper, UserConverter userConverter) {
        this.userMapper = userMapper;
        this.userConverter = userConverter;
    }

    public UserVO getById(Long id) {
        // ① 查询 PO（数据库对象）
        UserPO po = userMapper.selectById(id);

        // ② 转成 VO（返回给前端）
        // 不用手写 setter，一行搞定
        return userConverter.toVO(po);
    }

    public List<UserVO> listAll() {
        List<UserPO> poList = userMapper.selectList(null);
        return userConverter.toVOList(poList);  // 集合也一行
    }

    public void create(UserDTO dto) {
        // ③ DTO 转 PO 写入数据库
        UserPO po = userConverter.toPO(dto);
        // 特殊处理（如加密密码）在 converter 的自定义方法里处理
        userMapper.insert(po);
    }
}
```

---

## 六、小结

| 概念 | 说明 |
| --- | --- |
| **PO** | 数据库表映射，一个字段对应一列 |
| **DTO** | 接口入参，承载校验逻辑 |
| **VO** | 接口出参，只暴露前端需要的数据 |
| **MapStruct** | 编译期生成 PO↔DTO↔VO 转换代码，零反射，类型安全 |

**相关工具**：[Lombok](Lombok)（生成 getter/setter，MapStruct 的转换依赖它）
