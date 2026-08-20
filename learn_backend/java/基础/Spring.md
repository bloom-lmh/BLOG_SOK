# Spring

> 一句话定位：Spring 是 Java 后端的事实标准**轻量级框架**，核心是 **IoC（控制反转）容器 + AOP（面向切面编程）**，解决「对象之间硬编码耦合、横切逻辑（日志/事务）散落各处、样板代码满天飞」的问题——让你通过配置/注解管理对象的生命周期，用动态代理无侵入地织入日志、事务等逻辑。

Spring 不是某一个功能，而是一套「生态底座」。它最核心的两个能力，是所有后续框架（Spring MVC、Spring Boot、Spring Cloud）的地基：

```
Spring 核心
├── IoC 容器（控制反转 / 依赖注入）—— 管对象的创建、装配、生命周期
│     ├── BeanFactory（最底层容器接口）
│     └── ApplicationContext（企业级增强容器，实际使用）
├── AOP（面向切面编程）—— 无侵入地给对象织入横切逻辑
│     ├── 动态代理：JDK 动态代理 / CGLIB
│     └── 典型落地：声明式事务、日志、权限、缓存
└── 一堆「基础设施」：Bean 生命周期、事件机制、类型转换、SpEL、资源加载…
```

---

## 基础篇

### 一、Spring 解决的核心痛点（背景）

传统 Java 开发里，对象之间的关系是「谁要用，谁自己 new」，导致三大问题：

1. **强耦合**：`UserService` 里写死 `new UserDaoImpl()`，想换成 `UserDaoImplV2` 就得改源码。
2. **难测试**：`UserService` 内部 new 出来的依赖没法替换成 Mock，单元测试做不起来。
3. **样板代码爆炸**：每个类都要手写「创建 → 装配 → 销毁」的代码，事务、日志在每个方法里复制粘贴。

```java
// 传统写法：UserService 自己 new 出依赖，强耦合、难替换、难测试
public class UserService {
    // 写死了具体实现，想换成 UserDaoImplV2 就得改源码重新编译
    private UserDao userDao = new UserDaoImpl();

    public void register(User user) {
        userDao.insert(user);          // 直接用，但依赖是硬编码的
    }
}
```

Spring 的思路是 **IoC：把「对象的创建和装配权」从程序员手里拿走，交给容器，你只管声明需要什么**：

```java
// Spring 写法：不 new，靠注解让容器把 UserDao 注入进来
@Service
public class UserService {
    @Autowired
    private UserDao userDao;   // 依赖由容器注入，代码只依赖接口，天然解耦
}
```

好处一句话：**对象之间解耦、易测试、易替换实现**。因为 `UserService` 只依赖 `UserDao` 接口，具体实现由容器决定，换实现只需改一处配置。

### 二、IoC 与 DI 的关系

这是面试必问的一对概念，本质是一体两面，但层次不同：

- **IoC（Inversion of Control，控制反转）**：是一种**设计思想**——「对象创建的控制权」从程序员手里，反转到容器（框架）手里。程序员从「主动 new」变成「被动接收」。
- **DI（Dependency Injection，依赖注入）**：是 IoC 的**具体实现方式**——容器在创建对象时，把它的依赖「注入」进去（构造器注入 / Setter 注入 / 字段注入）。

```
IoC（思想：控制权反转）
   └── 落地手段之一：DI（依赖注入）
         ├── 构造器注入
         ├── Setter 注入
         └── 字段注入
```

::: tip 💡 面试题：IoC 和 DI 有什么区别？
IoC 是思想，DI 是实现。一句话原因：IoC 说的是「控制权反转」这件事，DI 说的是「怎么把依赖塞进去」这个动作；此外 DI 也不是 IoC 的唯一实现（还有依赖查找 DL 等），两者层次不同，常被混着说。
:::

### 三、Bean 与容器的基本概念

先记住三个核心名词，后面所有内容都围绕它们：

| 名词 | 含义 | 一句话理解 |
|------|------|-----------|
| **Bean** | 被 Spring 容器创建、装配、管理的对象 | 你没 new 但能用的对象，基本都是 Bean |
| **容器** | `ApplicationContext`，负责 Bean 的创建/装配/生命周期/销毁 | 「Bean 工厂 + 一堆增强」 |
| **配置元数据** | 告诉容器「有哪些 Bean、怎么装配」的信息 | 来自 XML / 注解 / Java 配置类 |

**容器家族**（理解两个接口的关系）：

```
BeanFactory（最底层接口，懒加载，功能最简）
    └── ApplicationContext（继承并增强，实际开发都用它）
          ├── AnnotationConfigApplicationContext   —— 基于注解配置类启动
          ├── ClassPathXmlApplicationContext       —— 基于 XML 启动（老项目）
          └── AnnotationConfigServletWebServerApplicationContext —— Spring Boot 里用的
```

`ApplicationContext` 相比 `BeanFactory` 多做了这些增强（记住「企业级」三个字）：

- 国际化（MessageSource）、事件发布（EventPublisher）、资源加载（ResourceLoader）、AOP 集成、`@PostConstruct` 等注解处理。

```java
// 启动容器并取出 Bean：容器读取配置，自动完成创建与装配
ApplicationContext context = new AnnotationConfigApplicationContext(AppConfig.class);
UserService userService = context.getBean(UserService.class); // 容器已装配好，直接能用
userService.register(new User("张三"));
```

### 四、注册 Bean 的三种方式

Spring 支持三种配置方式，对应三代演进：**XML → 注解 → Java 配置类**，现代项目（尤其 Spring Boot）用后两种。

| 方式 | 写法 | 适用场景 |
|------|------|---------|
| XML | `<bean id="x" class="..."/>` | 老项目、需要频繁改配置不重编译的场景 |
| 注解 | `@Component` / `@Service` 等 | 自己写的业务类（最常用） |
| Java 配置类 | `@Configuration` + `@Bean` | 装配第三方库对象、需要动态构造的 Bean |

```java
// 方式一：XML（老项目遗留，了解即可）
// <bean id="userService" class="com.example.UserService">
//     <property name="userDao" ref="userDao"/>
// </bean>

// 方式二：注解（日常业务类，扫描即注册）
@Service
public class UserService { }

// 方式三：Java 配置类（装配第三方/需要手动 new 的对象）
@Configuration
public class AppConfig {
    @Bean
    public RestTemplate restTemplate() {   // 第三方类没法加 @Component，只能在这里手动注册
        return new RestTemplate();
    }
}
```

### 五、注册 Bean 的常用注解

| 注解 | 含义 | 典型场景 |
|------|------|---------|
| `@Component` | 通用组件注解 | 不属于下面三层的工具类 |
| `@Service` | 业务层组件 | Service 层 |
| `@Repository` | 数据访问层组件 | DAO 层 |
| `@Controller` | 控制层组件 | MVC 的 Controller |
| `@Configuration` + `@Bean` | 配置类里手动注册 Bean | 装配第三方库对象 |
| `@ComponentScan` | 指定扫描哪个包 | 自定义扫描路径（默认扫启动类所在包） |

后四个（`@Service`、`@Repository`、`@Controller`）本质都是 `@Component` 的「语义化别名」，只是让人一眼看出分层，功能上等价。唯一的实质差异在 `@Repository`：

::: tip 💡 面试题：`@Repository` 和 `@Component` 有什么区别？
功能上几乎等价，但 `@Repository` 多了一层「异常翻译」——Spring 会把 DAO 层抛出的底层 JDBC/SQL 异常自动翻译成 Spring 统一的 `DataAccessException`。一句话原因：持久层异常种类多（各数据库驱动不同），Spring 用 `PersistenceExceptionTranslationPostProcessor` 统一翻译，方便上层只捕获一种异常。
:::

### 六、依赖注入的三种方式（及推荐）

```java
@Service
public class UserService {

    // 方式一：字段注入（@Autowired 加在字段上）
    // 优点：代码最简洁；缺点：隐藏依赖、依赖可变、不便单测、易造成循环依赖
    @Autowired
    private UserDao userDao;

    private final OrderDao orderDao;

    // 方式二：构造器注入（强烈推荐）
    // 原因：依赖不可变(final)、创建时必须注入齐全、单测能直接 new 传入 mock
    // Spring 4.3+ 只有一个构造器时，@Autowired 可以省略
    public UserService(OrderDao orderDao) {
        this.orderDao = orderDao;
    }

    // 方式三：Setter 注入，适合「可选依赖」（没有也能工作的依赖）
    private LogDao logDao;

    @Autowired
    public void setLogDao(LogDao logDao) {
        this.logDao = logDao;
    }
}
```

::: tip 💡 面试题：Spring 推荐用哪种注入方式，为什么？
推荐构造器注入。一句话原因：依赖能被 `final` 修饰保证不可变，创建对象时必须注入全部依赖，避免出现「字段为 null 的半成品对象」，也更方便单测；而字段注入虽然最简洁，但会隐藏依赖、且用 `@Autowired` 反射注入字段破坏了不可变性。
:::

### 七、`@Autowired` 与 `@Resource` 的区别

这是最高频对比题之一：

| 对比项 | `@Autowired` | `@Resource` |
|-------|-------------|-------------|
| 来源 | Spring 提供（`org.springframework.beans.factory.annotation`） | JDK 自带（`jakarta.annotation`，原 javax） |
| 匹配方式 | 默认**按类型**，多个同类型时再按名字 | 默认**按名字**，找不到名字再按类型 |
| 能否指定名字 | 配合 `@Qualifier` | 自带 `name` 属性 |
| 是否必填 | 默认必填，可用 `required = false` 设为可选 | 默认必填 |

```java
// 按类型匹配有多个候选 Bean 时，用 @Qualifier 指定 bean 名兜底
@Autowired
@Qualifier("userDaoMysql")
private UserDao userDao;

// @Resource 直接按名字指定，等价于上面两句
@Resource(name = "userDaoMysql")
private UserDao userDao;

// 如果某个候选想设为「默认优先」，在候选 Bean 上标 @Primary，就不用到处写 @Qualifier
@Primary
@Service
public class UserDaoMysql implements UserDao { }
```

**匹配流程**（面试手绘用）：`@Autowired` 先按类型找 —— 只有 1 个候选就直接注入；有多个候选，再按字段名/参数名匹配 Bean 名；还是分不清就报 `NoUniqueBeanDefinitionException`，此时用 `@Qualifier` 或 `@Primary` 兜底。

### 八、Bean 的作用域（scope）

`@Scope` 控制容器为这个 Bean 创建几个实例，默认**单例**：

| 作用域 | 含义 | 生命周期 | 典型场景 |
|--------|------|---------|---------|
| `singleton`（默认） | 整个容器只有一个实例 | 随容器启动创建，随容器关闭销毁 | 无状态 Service、DAO |
| `prototype` | 每次获取都新建一个 | 容器只负责创建，不负责销毁 | 有状态的临时对象 |
| `request` | 每个 HTTP 请求一个实例 | 请求结束销毁 | Web 场景的请求级数据 |
| `session` | 每个会话一个实例 | 会话结束销毁 | 购物车、登录态 |
| `application` | 整个 Web 应用一个 | 应用销毁时销毁 | Web 应用级全局对象 |

```java
@Service
@Scope("prototype")   // 为什么用 prototype：该对象带可变状态，不能全项目共享同一个实例
public class OrderStatefulService {
    private String currentOrderId;   // 有状态字段，单例会导致多线程串数据
}
```

::: tip 💡 面试题：单例 Bean 是线程安全的吗？
不一定。单例只是「一个容器一个实例」，不代表线程安全；若单例 Bean 里有无状态方法（局部变量、不可变依赖），则安全；若有可变成员变量（如 `private int count`），多个线程同时访问就会出并发问题。一句话原因：线程安全取决于「共享实例里有没有可变共享状态」，和单例本身无关，所以单例 Bean 里不要存可变状态，必要时用 `ThreadLocal` 或换 `prototype`。
:::

---

## 高级篇

### 九、AOP：面向切面编程

**背景/定义**：日志、事务、权限校验这类「横切关注点」散落在每个方法里，重复且难维护（改个日志格式要动几百个方法）。AOP 把它们抽成「切面」，无侵入地织入目标方法，业务代码里再也看不到这些重复逻辑。

核心术语先记一张表：

| 术语 | 含义 | 类比 |
|------|------|------|
| 切面（Aspect） | 横切逻辑的集合，一个类 | 一个「日志模块」 |
| 连接点（JoinPoint） | 所有能被拦截的点（方法） | 程序里的每个方法 |
| 切入点（Pointcut） | 真正要拦截的连接点（表达式筛选） | 被 `@Log` 标记的方法 |
| 通知（Advice） | 拦截后执行的逻辑 + 时机 | `before/after` 方法 |
| 目标对象（Target） | 被代理的原始对象 | UserService |
| 织入（Weaving） | 把切面逻辑应用到目标对象的过程 | 「贴胶带」的动作 |

**五种通知类型**（时机的不同）：

| 通知 | 注解 | 执行时机 | 典型用途 |
|------|------|---------|---------|
| 前置 | `@Before` | 目标方法前 | 参数校验、权限 |
| 后置 | `@AfterReturning` | 目标方法正常返回后 | 结果加工、缓存 |
| 异常 | `@AfterThrowing` | 目标方法抛异常后 | 异常记录、告警 |
| 最终 | `@After` | 目标方法结束后（无论成功失败） | 资源释放、日志 |
| 环绕 | `@Around` | 目标方法前后都包住（最强大） | 耗时统计、事务、分布式锁 |

```java
// 定义切面：给 service 包下所有方法自动记录执行耗时，业务代码零侵入
@Aspect
@Component
public class LogAspect {

    // 切入点表达式：service 包下任意类的任意方法
    @Pointcut("execution(* com.example.service.*.*(..))")
    public void serviceLayer() {}

    // 环绕通知：既能拿到方法参数/结果，又能统计耗时
    @Around("serviceLayer()")
    public Object log(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.currentTimeMillis();
        Object result = pjp.proceed();   // 放行，真正执行目标方法（不调这句目标方法就不执行）
        long cost = System.currentTimeMillis() - start;
        System.out.println(pjp.getSignature() + " 耗时 " + cost + "ms");
        return result;                   // 必须返回目标方法的结果，否则调用方拿到 null
    }
}
```

**切点表达式（Pointcut 语法）**，背会这个模板：

```
execution(修饰符? 返回类型 包.类.方法(参数) 异常?)
execution(* com.example.service.*.*(..))
         │              │        │ │  └─ (..) 任意参数
         │              │        │ └──── * 任意方法名
         │              │        └────── * 任意类名（service 包下所有类）
         │              └─────────────── 包路径
         └────────────────────────────── 返回类型 * 任意
```

常用示例：

| 表达式 | 含义 |
|--------|------|
| `execution(* com.example.service.*.*(..))` | service 包下所有类的所有方法 |
| `execution(* com.example..*.*(..))` | com.example 及所有子包 |
| `execution(* com.example.service.UserService.get*(..))` | UserService 里 get 开头的方法 |
| `execution(public * *(..))` | 所有 public 方法 |
| `@annotation(com.example.Log)` | 所有标注了 `@Log` 的方法 |

### 十、AOP 的底层：JDK 动态代理 vs CGLIB

Spring AOP 的本质是**动态代理**，根据目标对象有没有实现接口自动二选一（`AopProxy` 工厂决定）：

| 对比项 | JDK 动态代理 | CGLIB |
|-------|-------------|-------|
| 前提 | 目标类**必须实现接口** | 目标类**无需接口**（通过继承生成子类） |
| 原理 | 基于接口，`InvocationHandler` 反射调用 | 基于字节码，生成目标类的子类覆写方法 |
| 局限 | 只能代理接口方法 | 无法代理 `final` 类 / `final`/`private` 方法 |
| 性能 | 创建代理快、运行稍慢（反射） | 创建代理慢、运行稍快（直接调用） |
| Spring 5 默认 | 有接口时用 JDK 代理 | 无接口时用 CGLIB（Spring Boot 2.x 起默认全部 CGLIB） |

```java
// JDK 动态代理核心（手写版，帮助理解 Spring AOP 的原理）
public class JdkProxyDemo {
    public static void main(String[] args) {
        UserService target = new UserServiceImpl();   // 目标对象

        // 用 Proxy 动态生成一个实现了 UserService 接口的代理对象
        UserService proxy = (UserService) Proxy.newProxyInstance(
            target.getClass().getClassLoader(),        // 类加载器
            target.getClass().getInterfaces(),         // 必须实现接口，这是 JDK 代理的前提
            (obj, method, args2) -> {                  // InvocationHandler：方法调用统一走这里
                System.out.println("before: " + method.getName());
                Object result = method.invoke(target, args2); // 反射调用真实方法
                System.out.println("after: " + method.getName());
                return result;
            }
        );
        proxy.register(new User("张三"));  // 调用的是代理对象，前后被织入了日志
    }
}
```

::: tip 💡 面试题：JDK 动态代理和 CGLIB 的区别？
JDK 动态代理要求目标类实现接口，基于反射（`InvocationHandler`）；CGLIB 通过继承生成子类，无需接口但不能代理 final 方法。一句话原因：JDK 代理靠接口约束行为，CGLIB 靠子类覆写方法，两者的适用前提和限制天然不同——这也解释了为什么 final 方法没法被 AOP 拦截。
:::

### 十一、声明式事务

**背景**：JDBC 时代事务要靠手写 `conn.setAutoCommit(false)` / `commit()` / `rollback()` 样板代码，稍漏一处就出 bug。Spring 把事务抽成「AOP 切面」，用一行 `@Transactional` 搞定。

```java
// @Transactional 注解在方法/类上，方法抛运行时异常会自动回滚
@Service
public class OrderService {

    @Transactional(rollbackFor = Exception.class)   // 显式指定所有异常都回滚
    public void createOrder(Order order) {
        orderDao.insert(order);                        // 第 1 步：写订单
        stockDao.decrease(order.getGoodsId(), 1);      // 第 2 步：扣库存
        // 任何一步抛异常，前面已执行的操作整体回滚（默认只回滚 RuntimeException）
    }
}
```

**事务传播行为（propagation）**：描述「一个事务方法被另一个事务方法调用时，事务怎么传递」。7 种记住常用的 3 种：

| 传播行为 | 含义 | 典型场景 |
|---------|------|---------|
| `REQUIRED`（默认） | 有事务就加入，没有就新建 | 绝大多数场景 |
| `REQUIRES_NEW` | 总是新开独立事务，挂起当前事务 | 子操作独立提交/回滚，不受外层影响 |
| `NESTED` | 嵌套事务，外层回滚内层也回滚，内层回滚外层不受影响（用 savepoint 实现） | 需部分回滚的复杂业务 |
| `SUPPORTS` | 有就加入，没有就非事务运行 | 只读查询 |
| `NOT_SUPPORTED` | 强制非事务运行，挂起当前事务 | 不想被事务包裹的操作 |
| `MANDATORY` | 必须在事务中，否则抛异常 | 强一致性要求 |
| `NEVER` | 必须在非事务中，否则抛异常 | 特殊约束 |

```java
@Service
public class OrderService {

    @Autowired
    private LogService logService;

    // REQUIRES_NEW：日志必须独立提交，即使主流程回滚，日志也要落库
    @Transactional(rollbackFor = Exception.class)
    public void createOrder(Order order) {
        orderDao.insert(order);
        logService.recordLog("下单");   // 这个方法里是 REQUIRES_NEW，独立事务
        // 假设这里抛异常回滚，recordLog 的日志已经独立提交，不会被回滚
    }
}

@Service
class LogService {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordLog(String msg) {
        logDao.insert(msg);   // 独立事务，不受外层回滚影响
    }
}
```

**事务隔离级别（isolation）**，对应数据库四大隔离级别，解决「脏读/不可重复读/幻读」：

| 隔离级别 | 解决脏读 | 解决不可重复读 | 解决幻读 | 默认 |
|---------|:---:|:---:|:---:|------|
| `READ_UNCOMMITTED` | ❌ | ❌ | ❌ | — |
| `READ_COMMITTED` | ✅ | ❌ | ❌ | Oracle/PostgreSQL |
| `REPEATABLE_READ` | ✅ | ✅ | ❌ | MySQL 默认 |
| `SERIALIZABLE` | ✅ | ✅ | ✅ | 性能最差 |

```java
// 一般用数据库默认隔离级别即可，特殊情况才显式指定
@Transactional(isolation = Isolation.READ_COMMITTED, timeout = 5)  // timeout 秒数，超时回滚
public void transfer() { }
```

::: tip 💡 面试题：`@Transactional` 失效的常见场景有哪些？
① 方法内 `this.xxx()` 自调用（绕过了代理）；② 方法不是 `public`；③ 异常被 `try-catch` 吞掉；④ 抛的是**受检异常**却没配 `rollbackFor`；⑤ 类没被 Spring 管理（没加 `@Service`）；⑥ 数据库引擎不支持事务（如 MyISAM）。一句话原因：Spring 事务靠 AOP 代理实现，自调用/私有方法不走代理，而默认只对运行时异常回滚。
:::

### 十二、编程式事务 vs 声明式事务

| 对比项 | 声明式事务（`@Transactional`） | 编程式事务（`TransactionTemplate`） |
|-------|------------------------------|-------------------------------------|
| 写法 | 一行注解 | 手写事务开启/提交/回滚 |
| 粒度 | 方法级（粗粒度） | 代码块级（细粒度） |
| 侵入性 | 无侵入，推荐 | 有侵入，代码里混入事务逻辑 |
| 适用 | 99% 的场景 | 需要「部分代码在事务外」等精细控制时 |

```java
// 编程式事务：某些场景需要「先查再决定是否开启事务」时更灵活
@Service
public class OrderService {
    @Autowired
    private TransactionTemplate txTemplate;

    public void createOrder(Order order) {
        txTemplate.execute(status -> {   // 在事务代码块里执行，抛异常自动回滚
            orderDao.insert(order);
            stockDao.decrease(order.getGoodsId(), 1);
            return null;
        });
    }
}
```

### 十三、`@Value` 与 `@ConfigurationProperties`

这两个是「把配置注入 Bean」的常用手段，详细展开见 [Spring Boot](/learn_backend/java/基础/Spring Boot) 的配置文件章节：

| 方式 | 适用场景 | 特点 |
|------|---------|------|
| `@Value("${x.y}")` | 单个属性 | 简单直接，但每个字段都要写一次，无法绑定复杂结构 |
| `@ConfigurationProperties(prefix = "x")` | 一组相关配置 | 按前缀批量绑定，支持 `List`/`Map`/嵌套对象 |

```java
@Component
public class AppConfig {
    @Value("${app.name}")            // 注入单个属性，字段多时要写很多遍
    private String appName;

    @Value("${app.timeout:3000}")    // 冒号后面是默认值，配置缺失时兜底
    private long timeout;
}
```

---

## 原理篇

### 十四、Bean 的完整生命周期（面试必背）

一个 Bean 从创建到销毁，是一条「创建 → 使用 → 销毁」的主线，中间穿插了大量扩展点。先背主线：

```
【主线 5 步】实例化 → 属性填充 → 初始化 → 使用 → 销毁
```

**完整版流程**（每个环节都是一道面试题的答案）：

```
① 实例化（Instantiation）
     调用构造器，new 出对象 —— 此时属性还没注入，对象是"空壳"

② 属性填充（Populate）
     完成依赖注入（@Autowired、@Resource 等）
     ↓ 这阶段前后，BeanPostProcessor 的 postProcessBefore/AfterInitialization 不介入，
     ↓ 但 InstantiationAwareBeanPostProcessor 会在实例化前后、属性填充前后介入

③ 初始化前回调（Aware 系列 + BeanPostProcessor 前置）
     setBeanName() / setBeanFactory() / setApplicationContext() —— 让 Bean 感知到容器
     BeanPostProcessor.postProcessBeforeInitialization()

④ 初始化（Initialization）
     @PostConstruct 方法
       → InitializingBean.afterPropertiesSet()
         → 自定义 init-method

⑤ 初始化后回调
     BeanPostProcessor.postProcessAfterInitialization()  ← AOP 代理就是在这里生成的！

⑥ 使用（Bean 就绪，供业务调用）

⑦ 销毁（Destruction）
     @PreDestroy 方法
       → DisposableBean.destroy()
         → 自定义 destroy-method
```

```java
// 用一个类串起所有生命周期回调，顺序一目了然
@Component
public class OrderService implements InitializingBean, DisposableBean, BeanNameAware {

    public OrderService() {
        System.out.println("① 实例化：构造器");
    }

    @Autowired
    public void setOrderDao(OrderDao orderDao) {
        System.out.println("② 属性填充：依赖注入");
    }

    @Override
    public void setBeanName(String name) {
        System.out.println("③ 感知回调：setBeanName = " + name);
    }

    @PostConstruct
    public void init() {
        System.out.println("④ 初始化：@PostConstruct（最早）");
    }

    @Override
    public void afterPropertiesSet() {
        System.out.println("④ 初始化：afterPropertiesSet（其次）");
    }

    @PreDestroy
    public void preDestroy() {
        System.out.println("⑦ 销毁：@PreDestroy");
    }

    @Override
    public void destroy() {
        System.out.println("⑦ 销毁：DisposableBean.destroy");
    }
}
```

::: tip 💡 面试题：Bean 的初始化过程顺序？
构造器（实例化）→ 依赖注入（属性填充）→ `@PostConstruct` → `afterPropertiesSet`/init-method → 使用 → `@PreDestroy`/destroy-method（销毁）。一句话原因：实例化只是 new 出空壳对象，注入和初始化是后续独立阶段——先填依赖、再回调初始化（此时依赖已就绪，可以安全使用），顺序不能乱。
:::

### 十五、BeanPostProcessor：Spring 的「万能扩展点」

`BeanPostProcessor`（后置处理器）是理解 Spring 原理的关键，它会在**每个 Bean 初始化前后**统一拦截一次，是「容器级」的扩展点：

```java
public interface BeanPostProcessor {
    // 初始化前调用
    default Object postProcessBeforeInitialization(Object bean, String beanName) { return bean; }
    // 初始化后调用
    default Object postProcessAfterInitialization(Object bean, String beanName) { return bean; }
}
```

Spring 内部一堆核心功能都靠它实现，记住几个典型：

| 后置处理器 | 作用 |
|-----------|------|
| `AutowiredAnnotationBeanPostProcessor` | 处理 `@Autowired`、`@Value` 注入 |
| `CommonAnnotationBeanPostProcessor` | 处理 `@PostConstruct`、`@PreDestroy`、`@Resource` |
| `AbstractAutoProxyCreator` | **生成 AOP 代理**（在初始化后把 Bean 换成代理对象） |
| `ConfigurationClassPostProcessor` | 解析 `@Configuration` 配置类 |
| `AsyncAnnotationBeanPostProcessor` | 处理 `@Async` 异步方法 |

理解关键点：**为什么 `@PostConstruct` 不用配置就能生效？** 因为容器里预置了 `CommonAnnotationBeanPostProcessor`，它在 Bean 初始化前后扫描并回调这些注解方法——这就是「后置处理器」名字的由来。

### 十六、循环依赖与三级缓存（进阶高频）

**循环依赖**：A 依赖 B，B 又依赖 A，互相套娃。`new A()` 需要先 `new B()`，`new B()` 又需要先 `new A()`，直接 new 会无限递归死掉。

Spring 用**三级缓存**解决「单例 Bean 的非构造器循环依赖」（构造器循环依赖无解）：

| 缓存 | 名称 | 存的是什么 | 阶段 |
|------|------|-----------|------|
| 一级缓存 | `singletonObjects` | 完全初始化好的成品 Bean | 最终成品 |
| 二级缓存 | `earlySingletonObjects` | 提前暴露的「半成品」（属性未填完） | 中间态 |
| 三级缓存 | `singletonFactories` | 能生成早期 Bean 的工厂（`ObjectFactory`） | 刚 new 出来 |

**核心思想：先占位、后补全**——把「创建对象」拆成「实例化（new 出空壳）」和「初始化（填属性）」两步，在实例化后就提前把「半成品引用」暴露到缓存里，让互相依赖的双方能先拿到对方的早期引用。

```
创建 A 的完整过程：
  1. 实例化 A（new 出空壳，属性未填）—— 此时 A 的引用已经确定
  2. 把 A 的 ObjectFactory 放进三级缓存（singletonFactories）  ← 提前暴露
  3. 给 A 注入属性 B
       ↓ 发现 B 不存在，转去创建 B
  4. 实例化 B，把 B 的工厂放进三级缓存
  5. 给 B 注入属性 A
       ↓ 从三级缓存拿到 A 的早期引用（半成品），注入成功 → B 创建完成
  6. 回到 A，把 B 注入 A → A 创建完成
  7. A、B 都升级到一级缓存，三级缓存里的早期引用被清掉
```

**源码结构（`DefaultSingletonBeanRegistry` 里的 `getSingleton` 核心逻辑，简化）**：

```java
// 从缓存拿 Bean：为什么分三级，因为要区分「成品/半成品/工厂」三种状态
protected Object getSingleton(String beanName, boolean allowEarlyReference) {
    Object singletonObject = this.singletonObjects.get(beanName);  // 一级：成品
    if (singletonObject == null && isSingletonCurrentlyInCreation(beanName)) {
        singletonObject = this.earlySingletonObjects.get(beanName); // 二级：半成品
        if (singletonObject == null && allowEarlyReference) {
            ObjectFactory<?> singletonFactory = this.singletonFactories.get(beanName); // 三级：工厂
            if (singletonFactory != null) {
                singletonObject = singletonFactory.getObject();   // 调用工厂拿到早期引用
                this.earlySingletonObjects.put(beanName, singletonObject); // 升级到二级
                this.singletonFactories.remove(beanName);         // 移除三级（防止重复创建）
            }
        }
    }
    return singletonObject;
}
```

::: tip 💡 面试题：为什么需要三级缓存，两级不够吗？
理论上「成品 + 半成品」两级也能解决普通循环依赖，第三级缓存（`ObjectFactory`）是为了**处理 AOP 代理**。一句话原因：如果 A 需要被 AOP 代理，那么提前暴露的应该是「代理后的对象」而不是原始半成品；但代理的生成时机较晚，于是先存一个能「按需生成代理」的工厂，等到真正需要早期引用时再决定是返回原始对象还是代理对象——这就是第三级存在的意义。
:::

**什么情况解决不了？** **构造器注入的循环依赖**。因为构造器注入要求「new 的时候就必须传依赖」，连「先 new 出空壳再填属性」的机会都没有，半成品都拿不出来，会直接抛 `BeanCurrentlyInCreationException`——这也是推荐构造器注入的另一个理由（逼你避免循环依赖）。

```java
// 反例：构造器循环依赖，Spring 直接抛异常，无解
@Service
public class A {
    public A(B b) { }   // new A 必须先有 B
}
@Service
public class B {
    public B(A a) { }   // new B 必须先有 A —— 死锁，谁都建不出来
}
```

### 十七、IoC 容器的初始化流程（refresh 方法）

`ApplicationContext` 的核心启动逻辑都在 `AbstractApplicationContext.refresh()` 里，理解它就能回答「Spring 启动到底做了什么」：

```java
// refresh() 的 12 个核心步骤（源码骨架，背下主线即可）
public void refresh() {
    // 1. 准备刷新：记录启动时间、初始化属性源
    prepareRefresh();

    // 2. 获取 BeanFactory：解析配置，把 Bean 定义（BeanDefinition）加载进来
    ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

    // 3. 准备 BeanFactory：注册一些内置组件、设置类加载器、SpEL 解析器
    prepareBeanFactory(beanFactory);

    // 4. 留扩展口：允许子类对 BeanFactory 做后置处理
    postProcessBeanFactory(beanFactory);

    // 5. 执行 BeanFactoryPostProcessor（如解析 @Configuration、@ComponentScan）
    invokeBeanFactoryPostProcessors(beanFactory);

    // 6. 注册 BeanPostProcessor（后置处理器，先注册但此时还没生效）
    registerBeanPostProcessors(beanFactory);

    // 7. 初始化国际化、事件广播器等基础设施
    initMessageSource();
    initApplicationEventMulticaster();
    onRefresh();

    // 8. 注册监听器
    registerListeners();

    // 9. ★ 实例化所有「非懒加载」的单例 Bean（这里才会真正 new 对象）
    finishBeanFactoryInitialization(beanFactory);

    // 10. 完成刷新、发布容器启动完成事件
    finishRefresh();
}
```

关键点记住三个：

- **Bean 定义 ≠ Bean 实例**：前 8 步只是把「Bean 的定义信息」（`BeanDefinition`）读进来存好，真正 new 对象在第 9 步 `finishBeanFactoryInitialization`。
- **`BeanDefinition` 是什么**：一个描述「怎么创建这个 Bean」的数据对象，含类名、作用域、是否懒加载、依赖、初始化方法等元信息。
- **后置处理器两兄弟**：`BeanFactoryPostProcessor`（在 Bean 创建**前**处理 Bean 定义，如解析 `@Configuration`）和 `BeanPostProcessor`（在 Bean 创建**过程中**处理 Bean 实例，如 AOP、注入注解）。

### 十八、AOP 的底层源码结构

Spring AOP 是一条「代理创建 + 拦截执行」的完整链路，面试问到「AOP 原理」时，按这个讲：

```
【代理创建阶段】
@Aspect 切面类
   → 被 @Aspect 注解解析成 Advisor（切面 = 一个 Advisor 链）
   → AbstractAutoProxyCreator（一个 BeanPostProcessor）
       在 Bean 初始化后 postProcessAfterInitialization 里：
       判断这个 Bean 是否命中任意切点 → 命中则创建代理
   → AopProxy 工厂二选一：
       JdkDynamicAopProxy（有接口） / CglibAopProxy（无接口）
   → 返回代理对象，替换容器里的原始 Bean

【方法执行阶段】
调用代理对象的方法
   → 进入 MethodInterceptor 链（把 @Before/@Around 等通知包装成的拦截器链）
   → 依次执行前置/环绕逻辑 → 反射调用真实方法 → 执行后置/最终逻辑
   → 返回结果
```

核心概念是 **Advisor = Pointcut + Advice**：切点决定「拦谁」，通知决定「拦了之后做什么」，两者打包成一个 `Advisor` 注册到容器。Spring 会把 `@Aspect` 类解析成多个 `Advisor`，再用一个 `AdvisorChainFactory` 把它们串成拦截器链。

```java
// Spring AOP 的核心接口关系（源码结构示意）
public interface Advisor {
    Advice getAdvice();        // 通知：拦了之后做什么
    // Pointcut 通常通过 getPointcut() 由具体实现提供
}
public interface Pointcut {
    ClassFilter getClassFilter();      // 哪些类命中
    MethodMatcher getMethodMatcher();  // 哪些方法命中
}
// 环绕通知实现的拦截器，方法调用统一走 invoke
public interface MethodInterceptor extends Interceptor {
    Object invoke(MethodInvocation invocation) throws Throwable; // 递归执行拦截器链
}
```

::: tip 💡 面试题：AOP 的代理对象是在哪个阶段创建的？
在 Bean 生命周期的「初始化后」阶段，由 `AbstractAutoProxyCreator`（一个 `BeanPostProcessor`）在 `postProcessAfterInitialization` 里创建。一句话原因：代理要包裹「已经填好依赖、初始化完成」的原始对象，所以必须等初始化完成；创建出的代理对象会替换容器里的原始 Bean，之后你从容器拿到的就是代理对象。
:::

**AOP 的几个进阶点（面试高频）**：

**① 通知链 = 职责链模式**：前面说「多个通知串成拦截器链」，这个链的本质就是**职责链模式**——每个 `MethodInterceptor` 执行完自己的逻辑后，调用 `invocation.proceed()` 把控制权传给下一个：

```
MethodInterceptor1 ──proceed()──► MethodInterceptor2 ──proceed()──► 目标方法
      │ 前置逻辑                        │ 后置逻辑
      ◄────────────────────────────────┘ 逐层返回
```

::: tip 💡 面试题：AOP 的拦截器链是什么设计模式？
职责链模式——每个 `MethodInterceptor` 执行完自己的逻辑后调用 `proceed()` 传给下一个，直到执行目标方法再逐层返回，和 Servlet Filter 链、Spring Security 过滤链是同一模式。整体看「给 Bean 套代理」是代理模式，但链内部是职责链。
:::

**② 五种通知的执行顺序**（一个切面同时配多种通知时）：

```
正常：@Around前 → @Before → 目标方法 → @Around后 → @After → @AfterReturning
异常：@Around前 → @Before → 目标方法(抛异常) → @After → @AfterThrowing
```

`@After` 相当于 finally，无论正常还是异常都执行。

**③ 自调用失效（AOP 的经典局限）**：

```java
@Service
public class UserService {
    public void outer() {
        inner();   // ❌ 自调用：AOP 失效，事务/日志都不会生效
    }
    @Transactional
    public void inner() { ... }
}
```

原因：`outer()` 里 `this.inner()` 是直接调**原始对象**自己，没经过代理对象，AOP 拦不到。解法：把方法拆到另一个 Bean，或注入自己走代理调用。

::: tip 💡 面试题：为什么 `@Transactional` 自调用会失效？
Spring AOP 是运行期动态代理，事务靠代理拦截才开启；自调用（`this.inner()`）走的是原始对象而非代理对象，绕过了代理，所以事务注解不生效。
:::

**④ 织入时机与 Spring AOP vs AspectJ**：

| 织入时机 | 实现 | 说明 |
|---|---|---|
| 编译期织入 | AspectJ 编译器（ajc） | 编译时改字节码，最快，无需代理 |
| 类加载期织入 | AspectJ LTW | 类加载时改字节码 |
| 运行期织入 | Spring AOP | 运行时动态代理，最常用 |

| | Spring AOP | AspectJ |
|---|---|---|
| 实现 | 运行期动态代理 | 编译期/类加载期改字节码 |
| 能切的范围 | 只切**方法** | 字段、构造器、任意代码 |
| 性能 | 有代理开销 | 无代理开销 |
| 应用 | 90% 场景够用 | 极致性能 / 切非方法时 |

**⑤ 全局异常处理就是 AOP 的应用**：Day01 的 `GlobalExceptionHandler` 就是 AOP 落地：

```java
@RestControllerAdvice   // 特殊切面：拦截「异常」这个横切关注点
public class GlobalExceptionHandler {
    @ExceptionHandler(BizException.class)   // 切点 = 抛 BizException
    public Result<Void> handleBiz(BizException e) { ... }
    @ExceptionHandler(Exception.class)       // 切点 = 抛其他异常
    public Result<Void> handleOther(Exception e) { ... }
}
```

注意：`@ExceptionHandler` 是「按异常类型**匹配一个**」handler，不是链式传递——异常来了按继承关系找最精确的那个执行（和 Filter 链的逐个传递不同）。

### 十九、事务的底层原理：AOP + 事务管理器 + ThreadLocal

声明式事务的本质是「**AOP 切面 + 事务管理器**」，完整链路：

```
@Transactional 方法被调用
   → 命中 TransactionInterceptor（一个 MethodInterceptor，事务切面）
   → 从容器拿到 PlatformTransactionManager（如 DataSourceTransactionManager）
   → 开启事务：从连接池拿 Connection，setAutoCommit(false)
        ★ 把 Connection 绑定到 ThreadLocal（DataSourceUtils 实现），
          这样同一个线程里 DAO 用的都是同一个 Connection，才能共享事务
   → 执行业务方法（DAO 通过 DataSourceUtils 拿到 ThreadLocal 里的同一个 Connection）
   → 无异常：commit；有异常：rollback
   → 清理：解绑 ThreadLocal、归还 Connection
```

**为什么事务必须绑定线程？** 因为一次业务操作里 `OrderDao.insert()` 和 `StockDao.decrease()` 是两个 DAO 方法，如果各自从连接池拿不同 Connection，就变成两个独立事务，起不到「整体提交/回滚」的作用。所以 Spring 用 `ThreadLocal<Map<DataSource, Connection>>` 把「当前线程的事务连接」存起来，让同一线程内所有 DAO 共用同一个 Connection。

```java
// 简化理解：Spring 如何保证同一线程共享一个事务连接
public class DataSourceUtils {
    // 每个线程一个独立的连接副本，互不干扰
    private static final ThreadLocal<Map<DataSource, Connection>> connections = new ThreadLocal<>();

    public static Connection getConnection(DataSource ds) {
        // 同一线程第二次调用时，直接返回之前绑定的连接，保证是"同一个事务"
        return connections.get().computeIfAbsent(ds, d -> {
            Connection conn = d.getConnection();
            conn.setAutoCommit(false);   // 关闭自动提交，改由事务管理器控制
            return conn;
        });
    }
}
```

::: tip 💡 面试题：Spring 事务是如何实现的？
基于 AOP：`@Transactional` 被 `TransactionInterceptor` 拦截，从连接池拿 Connection 并 `setAutoCommit(false)`，把连接绑定到 `ThreadLocal`，业务方法执行完根据是否异常决定 commit 还是 rollback。一句话原因：事务要覆盖「多个 DAO 方法」，只能靠 AOP 包裹整个业务方法，再靠 ThreadLocal 让方法内所有数据库操作共享同一个连接。
:::

### 二十、单例 Bean 的线程安全

单例 Bean 是全局共享一个实例，线程安全取决于「有没有可变共享状态」：

| 场景 | 是否安全 | 说明 |
|------|:---:|------|
| 无状态 Bean（只有局部变量、不可变依赖） | ✅ 安全 | 每次调用数据都在栈上，互不干扰 |
| 有可变成员变量 | ❌ 不安全 | 多线程同时读写同一字段会串数据 |
| 用 `ThreadLocal` 隔离状态 | ✅ 安全 | 每个线程有自己的副本 |
| `prototype` 作用域 | ✅ 安全 | 每次调用都 new 新对象 |

```java
@Service
public class CounterService {
    private int count = 0;   // ❌ 危险：单例 + 可变成员变量，并发下会丢更新

    public void add() {
        count++;   // count++ 不是原子操作：读-改-写三步，多线程会互相覆盖
    }
}
// 解决：不要用成员变量存状态；或用 AtomicInteger；或用 ThreadLocal；或改成 prototype
```

---

## 面试常问

1. **什么是 IoC？** 把对象创建和装配的控制权交给容器，程序员不再自己 new，实现解耦。展开：IoC 是设计思想，DI 是它的实现方式，容器负责管理 Bean 的整个生命周期。

2. **AOP 的原理是什么？** 基于动态代理（JDK 代理或 CGLIB），在目标方法前后织入横切逻辑，无侵入增强。展开：`@Aspect` 被解析成 Advisor，`AbstractAutoProxyCreator` 在 Bean 初始化后生成代理对象，方法调用时走拦截器链。

3. **Bean 的默认作用域是什么？** 默认是单例（singleton），即一个容器里一个类只有一个实例，要注意它的线程安全问题。展开：单例不代表线程安全，关键在于 Bean 里有没有可变共享状态。

4. **`@Autowired` 按什么注入？** 默认按类型注入，同类型有多个候选时再按名字匹配，可用 `@Qualifier` 或 `@Primary` 指定。展开：`@Resource` 则相反，默认按名字。

5. **Spring 事务失效有哪些原因？** 自调用、非 public 方法、异常被吞、受检异常未配 `rollbackFor`。展开：根因是事务靠 AOP 代理实现，自调用/私有方法不走代理，且默认只对运行时异常回滚。

6. **Spring 如何解决循环依赖？** 通过三级缓存提前暴露「半成品」Bean 引用。展开：实例化后就把 `ObjectFactory` 放进三级缓存，依赖方先拿早期引用，等创建完成再升级到一级缓存；但构造器循环依赖无解。

7. **Bean 的生命周期？** 实例化 → 属性填充 → 初始化（`@PostConstruct` → `afterPropertiesSet` → init-method）→ 使用 → 销毁（`@PreDestroy` → destroy）。展开：每个阶段都有对应的扩展点（Aware、BeanPostProcessor），AOP 代理在初始化后生成。

8. **Spring 用了哪些设计模式？** 工厂模式（BeanFactory）、单例模式（默认作用域）、代理模式（AOP）、模板方法模式（`refresh()`/`JdbcTemplate`）、观察者模式（事件机制）、适配器模式（HandlerAdapter）。展开：理解设计模式能帮你更好地读懂 Spring 源码。

---

## 相关链接

- [Spring MVC](/learn_backend/java/基础/Spring MVC) —— 基于 Spring 容器的 Web 层框架
- [Spring Boot](/learn_backend/java/基础/Spring Boot) —— 自动配置 + starter，让 Spring 项目开箱即用
- [MyBatis](/learn_backend/java/基础/MyBatis) —— 持久层框架，常与 Spring 整合使用
- [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) —— MyBatis 的增强工具
- [Spring Security](/learn_backend/java/基础/Spring Security) —— 基于 Spring 的安全框架
- [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) —— 基于 Spring 的微服务全家桶
- [Seata](/learn_backend/java/微服务/Seata) —— 分布式事务，Spring 本地事务的延伸
- [JVM](/learn_backend/java/Java核心/JVM) —— 动态代理、字节码生成的底层基础
- [并发编程](/learn_backend/java/Java核心/并发编程) —— 单例 Bean 线程安全的底层知识
- [Java集合](/learn_backend/java/Java核心/Java集合) —— 容器相关的数据结构基础
- [Maven](/learn_backend/java/基础/Maven) —— Spring 项目的依赖与构建管理
