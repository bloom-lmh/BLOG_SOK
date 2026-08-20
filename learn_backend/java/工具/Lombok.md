# Lombok

> 一句话定位：Lombok 是一个**编译期代码生成库**，通过在类上加注解（如 `@Data`、`@Builder`），让编译器在编译时自动生成 getter/setter/构造器/日志等样板代码——「你只写字段，剩下交给编译期」。它解决的痛点是 Java 里海量的样板代码（一个 POJO 一半代码是 getter/setter）。

---

## 基础篇

### 1. Lombok 解决什么问题

Java 一个实体类，字段 5 个，手写 getter/setter/toString/构造器要 100+ 行。Lombok 用注解代替：

```java
// 手写：100+ 行样板代码
public class User {
    private String name;
    private Integer age;
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Integer getAge() { return age; }
    public void setAge(Integer age) { this.age = age; }
    // toString、equals、hashCode、构造器... 继续几十行
}
```

```java
// Lombok：4 行，其余编译期生成
@Data
public class User {
    private String name;
    private Integer age;
}
```

关键认知：**Lombok 生成的代码在 `.class` 文件里是真实存在的**，只是不在 `.java` 源码里出现——所以它不是运行时反射生成，而是编译期就把代码写进了字节码。

### 2. 常用注解速查表

| 注解 | 生成什么 | 使用场景 |
|---|---|---|
| `@Getter` / `@Setter` | 单个字段的 get/set | 只要一部分 |
| `@Data` | getter/setter + toString + equals/hashCode + 无参构造 | **POJO 最常用**（本项目 Result、User 都用它） |
| `@ToString` | toString 方法 | 打印对象 |
| `@EqualsAndHashCode` | equals + hashCode | 去重、Set/HashMap 的 key |
| `@NoArgsConstructor` | 无参构造器 | 框架反射实例化需要 |
| `@AllArgsConstructor` | 全参构造器 | 手动 new 对象传所有字段 |
| `@RequiredArgsConstructor` | 只对 `final` / `@NonNull` 字段生成构造器 | 配合 final 字段做构造器注入 |
| `@Builder` | 建造者模式（链式构建） | 复杂对象构建 |
| `@Accessors(chain = true)` | setter 返回 this（链式 set） | 链式赋值 |
| `@Slf4j` | 生成 `log` 日志对象 | 每个类打日志 |
| `@Value` | 不可变类（字段全 final + 全参构造 + getter） | DTO/值对象 |

### 3. `@Data` 到底生成了什么

`@Data` 是一个**组合注解**，等价于同时加：

```
@Getter + @Setter + @ToString + @EqualsAndHashCode + @RequiredArgsConstructor
```

注意两点：

- **它生成的是 `@RequiredArgsConstructor`，不是 `@NoArgsConstructor`**——即只对 `final` 字段生成构造器。如果类里**没有 final 字段**，这个构造器就是无参的；有 final 字段，就没有无参构造了。
- 这就是为什么很多实体类会 `@Data` 后面**再补一个 `@NoArgsConstructor`**——框架（Jackson 反序列化、MyBatis 映射）常常需要无参构造来反射实例化。

```java
@Data
@NoArgsConstructor          // 显式补无参构造，避免 @Data 没生成
public class Course {
    private Long id;
    private String title;
    private BigDecimal price;
}
```

### 4. `@Slf4j` 日志注解

```java
@Slf4j
public class GlobalExceptionHandler {
    public void handle(Exception e) {
        log.error("系统异常", e);   // log 是 Lombok 生成的，等价于手写 LoggerFactory.getLogger(...)
    }
}
```

原理：`@Slf4j` 在编译期给类注入一个 `private static final Logger log = LoggerFactory.getLogger(当前类.class);`。要换日志实现（log4j2）就用 `@Log4j2`，同理还有 `@Slf4j`（logback 默认）、`@Log4j`、`@CommonsLog` 等。

### 5. 构造器三兄弟的区别

最容易混的一组，尤其 `@RequiredArgsConstructor` 和「构造器注入」的配合：

| 注解 | 生成的构造器 | 典型用途 |
|---|---|---|
| `@NoArgsConstructor` | 无参 | Jackson/MyBatis 反射实例化 |
| `@AllArgsConstructor` | 所有字段作参数 | 手动 new 全量赋值 |
| `@RequiredArgsConstructor` | 只有 `final` + `@NonNull` 字段 | **构造器注入** |

::: tip 💡 面试题：Spring 推荐构造器注入，和 Lombok 怎么配合？
**一句话**：用 `@RequiredArgsConstructor` + `final` 字段——Spring 会自动挑这个构造器注入依赖，Lombok 省掉手写构造器。**为什么推荐构造器注入**：依赖是 `final` 的不可变、必须显式传入（不能漏）、便于测试时手动 new 传 mock。对比 `@Autowired` 字段注入：字段注入可被偷偷改、测试要反射注入、还掩盖了「依赖过多」的坏味道。
:::

### 6. 链式编程：`@Accessors(chain = true)` vs `@Builder`

两个注解都能实现「链式」，但机制完全不同，这是面试高频：

#### 6.1 `@Accessors(chain = true)`：改 setter 的返回值

```java
@Accessors(chain = true)
@Data
public class User {
    private String name;
    private Integer age;
}

// setter 返回 this，所以能连着点
User u = new User().setName("兰茂豪").setAge(23);
```

默认 setter 返回 `void`，`chain = true` 让它返回 `this`（当前对象）。

#### 6.2 `@Builder`：建造者模式

```java
@Builder
public class User {
    private String name;
    private Integer age;
}

// builder 对象链式收集参数，最后 build 出目标对象
User u = User.builder().name("兰茂豪").age(23).build();
```

#### 6.3 关键区别：`@Accessors(chain=true)` 破坏 JavaBean 规范

**JavaBean 规范规定 setter 必须返回 `void`**。`chain = true` 让 setter 返回 `this`，破坏规范，会坑依赖「标准 setter」反射判断的框架：

| 工具 | 翻车现象 |
|---|---|
| `BeanUtils.copyProperties`（Spring/Apache） | 反射找「返回 void 的 setter」找不到 → 属性拷不过去 |
| MyBatis / MyBatis-Plus 结果映射 | 依赖标准 setter 反射注入 → 映射失败 |
| 部分 JSON 序列化库 | 误判字段 |

::: tip 💡 面试题：`@Accessors(chain=true)` 和 `@Builder` 有什么区别？为什么实体类慎用前者？
**一句话**：`@Accessors(chain=true)` 是**改 setter 返回类型为 this**，破坏了 JavaBean「setter 返回 void」的规范，会导致依赖标准 setter 的反射工具（BeanUtils、MyBatis-Plus 映射）失效；`@Builder` 是**独立的建造者模式**，不动 setter，所以安全。结论：**实体类（要接 MyBatis/JSON）慎用 `@Accessors(chain=true)`，需要链式用 `@Builder`**。
:::

---

## 高级篇

### 7. `@EqualsAndHashCode` 的继承坑

`@EqualsAndHashCode` 默认只用**本类字段**算 equals/hashCode，忽略父类字段，会导致「子类两个对象父类字段不同却 equals 判定相等」：

```java
@Data
@EqualsAndHashCode(callSuper = true)   // 关键：callSuper = true 才把父类字段算进去
public class SubClass extends BaseClass { ... }
```

- 不写 `callSuper = true`：只比较子类自己字段，**忽略父类**（继承场景的经典 bug）
- 写了：连父类 `equals` 一起调用，比较完整

规则：**类有继承关系时，`@EqualsAndHashCode` 要加 `callSuper = true`**。

### 8. `@Builder` 的坑

**坑 1：`@Builder` 不会生成无参构造器**——它只生成一个全参构造器，如果框架要无参构造（Jackson 反序列化）会报错：

```java
@Builder
@NoArgsConstructor        // 必须显式补
@AllArgsConstructor       // @Builder 需要全参构造器
public class User { ... }
```

**坑 2：默认值的坑**——`@Builder` 里字段初始化器的默认值**不生效**（builder 用的是全参构造器，绕过了字段初始化）。要默认值，用 `@Builder.Default`：

```java
@Builder
public class User {
    @Builder.Default          // 不加这个，builder 出来 status 是 null，不是 1
    private Integer status = 1;
}
```

### 9. 项目里的实际组合

回顾 course-mall 的用法（Day01 的 `Result`）：

```java
@Data
public class Result<T> { ... }        // 只 @Data：够用（无 final 字段、无继承）

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler { ... }   // @Slf4j 打日志
```

Day03 建 User 实体时的推荐组合：

```java
@Data
@NoArgsConstructor        // Jackson/MyBatis 反射实例化
@AllArgsConstructor       // 手动 new 全量
@Builder                  // 链式构建（而非 @Accessors(chain=true)）
public class User {
    private Long id;
    private String username;
    // ... 不要加 @Accessors(chain=true)，会坑 MyBatis-Plus 映射
}
```

---

## 原理篇

### 10. Lombok 的原理：编译期注解处理器（JSR 269）

Lombok 不是运行时反射，它工作在**编译期**：

```
.java 源码（带 @Data）
        │
        ▼ javac 编译
┌──────────────────────────────┐
│ 编译期注解处理器（Annotation  │   Lombok 的 processor 拦截 javac 的 AST
│ Processor, JSR 269 标准）     │──► 在抽象语法树上「插入」getter/setter 等节点
└──────────────────────────────┘
        │
        ▼
.class 字节码（getter/setter 已真实存在）
```

关键点：

1. **发生在编译期，不是运行时**——所以生成的代码在 `.class` 里真实存在，反编译能看到，运行时零开销。
2. **通过 JSR 269 标准**：Lombok 注册一个 `javax.annotation.processing.Processor`，在 javac 编译时被调用，直接**修改 AST（抽象语法树）**，往类里塞方法节点。这是「黑魔法」——它用的是 javac 的非公开内部 API，所以 JDK 大版本升级时 Lombok 常出现不兼容（需要升级 Lombok 版本）。

### 11. 为什么 Lombok 不进最终产物（呼应 `<optional>` / `<scope>`）

因为 Lombok 只在**编译期**工作，编译完生成的代码已经写进字节码，运行时不再需要 Lombok：

```
编译期：需要 Lombok（注解处理器要展开 @Data）
运行期：不需要（getter/setter 已生成，类里没有 Lombok 的引用）
```

所以 pom 里 lombok 要么标 `<optional>true</optional>`（不传给依赖方）、要么标 `<scope>provided</scope>`（运行期环境提供/不需要）——本质都是「**编译期工具，别带进运行时**」。详见 [Maven](/learn_backend/java/基础/Maven) 里 `<optional>` 和 `<scope>` 两节。

---

## 面试常问

- **Q：Lombok 的原理？** 编译期注解处理器（JSR 269），在 javac 编译时直接修改 AST，往类里插入方法节点；生成的代码在 `.class` 里真实存在，运行时零开销、不依赖 Lombok。

- **Q：Lombok 是运行时还是编译时？** 编译时。所以运行时不需要 Lombok，pom 里标 `optional` 或 `provided`。

- **Q：`@Data` 生成了什么？** getter/setter + toString + equals/hashCode + `@RequiredArgsConstructor`（只对 final/@NonNull 字段生成构造器，不是无参构造）。

- **Q：`@Data` 为什么还要补 `@NoArgsConstructor`？** 因为 `@Data` 生成的是 `@RequiredArgsConstructor`，有 final 字段时就没有无参构造；而 Jackson/MyBatis 反射实例化需要无参构造。

- **Q：`@Accessors(chain=true)` 和 `@Builder` 区别？** 前者改 setter 返回 this，破坏 JavaBean「setter 返回 void」规范，坑 BeanUtils/MyBatis-Plus 反射；后者是独立建造者模式，安全。实体类慎用前者。

- **Q：`@EqualsAndHashCode` 继承会有什么坑？** 默认只比较本类字段、忽略父类字段，继承场景要加 `callSuper = true`。

- **Q：`@Builder` 有什么坑？** 不生成无参构造（需补 `@NoArgsConstructor`）；字段默认值不生效（需 `@Builder.Default`）。

- **Q：构造器注入怎么做？** `@RequiredArgsConstructor` + `final` 字段，Spring 自动选这个构造器注入，省手写。

- **Q：Lombok 的缺点？** 依赖 javac 内部 API，JDK 升级要同步升 Lombok；团队要统一 IDE 装插件才能看到生成代码；调试时看不到生成的方法（要反编译）。

---

## 相关知识

- [Maven](/learn_backend/java/基础/Maven)：lombok 的 `optional` / `provided` 作用域在这里讲
- [Spring](/learn_backend/java/基础/Spring)：构造器注入、`@Autowired` 的对比
- [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)：为什么实体类不能用 `@Accessors(chain=true)`（结果映射依赖标准 setter）
- [Java集合](/learn_backend/java/Java核心/Java集合)：`equals/hashCode` 约定，与 `@EqualsAndHashCode` 呼应
