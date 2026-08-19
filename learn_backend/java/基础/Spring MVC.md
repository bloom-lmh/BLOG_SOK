# Spring MVC

> 一句话定位：Spring MVC 是 Spring 生态中专门处理 **Web 请求** 的 MVC 框架，核心思想是用一个 `DispatcherServlet`（前端控制器）把 HTTP 请求统一收口、按 URL 规则分发到对应的 Controller 方法，解决「如何把浏览器请求干净、可扩展地路由到后端业务方法，并把结果序列化回前端」的问题。

---

## 基础篇

### 1. 什么是 MVC？先搞懂这套设计模式

Spring MVC 的骨架是 MVC 设计模式。在正式讲框架之前，必须先理解 MVC 在解决什么问题。

#### 1.1 背景：不用 MVC 的原始 Servlet 开发有多痛苦

在早期的 Java Web 开发里，一个请求是这样处理的：写一个 `HttpServlet`，在 `doGet/doPost` 里手动解析参数、拼 SQL、拼 HTML。当页面一多，就会变成下面这种"上帝 Servlet"：

```java
// 反例：所有逻辑堆在一个 Servlet 里，页面越多越失控
@WebServlet("/user")
public class UserServlet extends HttpServlet {
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) {
        String action = req.getParameter("action");       // 靠一个 action 参数区分业务
        if ("add".equals(action)) {
            String name = req.getParameter("name");
            // 1. 解析参数（还要手动处理乱码、类型转换）
            // 2. 查数据库（业务逻辑写死在 Servlet 里）
            // 3. 拼 HTML 返回（视图也写死在 Servlet 里）
            resp.getWriter().write("<html><body>..." + name + "...</body></html>");
        } else if ("list".equals(action)) {
            // ... 又是一大段
        }
    }
}
```

问题很明显：**解析参数、业务逻辑、页面渲染三种完全不同的职责耦合在一个类里**，无法复用、无法测试、无法维护。

#### 1.2 定义：把一次交互拆成三个角色

MVC 把一次 Web 交互拆成三个职责单一的组件，各管一摊：

| 角色 | 全称 | 职责 | 在 Spring MVC 里的落点 |
| --- | --- | --- | --- |
| Model | 模型 | 承载业务数据，封装业务逻辑 | Service 层返回的实体、`Map`、`Model`、`ModelAndView` |
| View | 视图 | 把数据渲染成页面展示给用户 | 前后端分离后基本被 JSON 取代，视图交给前端框架 |
| Controller | 控制器 | 接收请求、调业务、决定返回什么 | `@Controller` / `@RestController` 标注的类 |

#### 1.3 特性：各层之间怎么配合

```text
浏览器请求
    │
    ▼
┌─────────────┐    调用     ┌─────────────┐   查询   ┌─────────────┐
│  Controller │ ──────────► │   Service   │ ───────► │  Mapper/DAO │
│ (接收参数)   │             │ (业务逻辑)   │          │ (数据访问)   │
└─────────────┘             └─────────────┘          └─────────────┘
    │  返回 Model(数据)
    ▼
┌─────────────┐
│    View     │  把 Model 渲染成 JSON / HTML 返回给浏览器
└─────────────┘
```

核心规则是"高内聚、低耦合"：Controller 不该写 SQL，View 不该写业务，Model 不该知道有 HTTP 这回事。这样任何一层都可以单独替换、单独测试。

::: tip 💡 面试题：为什么说「前后端分离后 Spring MVC 的 View 基本名存实亡」？
因为现代项目 Controller 大多返回 JSON（`@ResponseBody`），真正的视图渲染交给 Vue/React 等前端框架完成。结论是 Spring MVC 保留的是 **Model + Controller**，View 这一环退化成了「把 Java 对象序列化成 JSON 写进响应体」这件事。
:::

### 2. Spring MVC 的定位与历史

Spring MVC 不是凭空出现的，理解它的来龙去脉，面试时才能讲清楚"它为什么长这样"。

- **Servlet 时代**：每个请求手动写 Servlet，样板代码爆炸。
- **Struts 时代**：引入了 MVC 和拦截器，但配置繁琐、线程安全模型重、XML 满天飞。
- **Spring MVC**：作为 Spring 生态的一等公民，天然享受 IOC/DI，用注解取代 XML，把 Controller 变成普通 Bean。
- **Spring Boot 时代**：通过自动配置 + 内嵌 Tomcat，把 Spring MVC 的启动成本降到「一个 main 方法 + 一个 `@SpringBootApplication`」。
- **WebFlux**：Spring 5 推出的响应式 Web 框架，与 Spring MVC（基于 Servlet、同步阻塞模型）并存，面向高并发场景。

关键结论：**Spring MVC 是构建在 Servlet 规范之上的**，它自己不是 Servlet 容器，而是运行在 Tomcat/Jetty 等容器里的一个"调度中枢"。

### 3. 核心组件：一张"接力表"记住 Spring MVC

理解 Spring MVC，本质就是理解下面这张"接力表"——请求从进入 `DispatcherServlet` 到返回，每一棒都有专门组件负责。面试官问"Spring MVC 有哪些核心组件"，把这套背出来：

| 组件 | 接口/类 | 作用 | 类比 |
| --- | --- | --- | --- |
| `DispatcherServlet` | 前端控制器 | 接收所有请求，统一调度后续组件 | 公司前台/总调度 |
| `HandlerMapping` | 处理器映射器 | 根据 URL 找到对应的 Controller 方法 | 门牌号 → 找工位 |
| `HandlerAdapter` | 处理器适配器 | 真正去调用那个方法 | 通知具体员工干活 |
| `HandlerInterceptor` | 拦截器 | 方法执行前后做拦截（登录校验、日志） | 门口安检 |
| `ViewResolver` | 视图解析器 | 把逻辑视图名解析成真实视图 | "会议室"翻译成具体房间 |
| `HttpMessageConverter` | 消息转换器 | 请求/响应的序列化（Java 对象 ↔ JSON） | 翻译官 |
| `HandlerExceptionResolver` | 异常解析器 | 统一处理 Controller 抛出的异常 | 售后客服 |
| `MultipartResolver` | 文件上传解析器 | 解析 multipart/form-data 文件上传请求 | 快递分拣员 |
| `LocaleResolver` | 区域解析器 | 决定国际化语言 | 多语言前台 |

`DispatcherServlet` 是这套体系的"司令官"，其余组件都是它手里可插拔的策略接口（strategy pattern）。理解了这一点，后面原理篇讲"九大组件"就会豁然开朗。

### 4. 两种配置方式：XML 时代 vs 注解时代

#### 4.1 XML 配置（老项目，了解即可）

```xml
<!-- web.xml：注册 DispatcherServlet，这是老写法 -->
<servlet>
    <servlet-name>dispatcher</servlet-name>
    <servlet-class>org.springframework.web.servlet.DispatcherServlet</servlet-class>
    <!-- 指定 Spring MVC 配置文件位置 -->
    <init-param>
        <param-name>contextConfigLocation</param-name>
        <param-value>classpath:spring-mvc.xml</param-value>
    </init-param>
    <load-on-startup>1</load-on-startup>
</servlet>
<servlet-mapping>
    <servlet-name>dispatcher</servlet-name>
    <url-pattern>/</url-pattern>   <!-- 拦截所有请求 -->
</servlet-mapping>
```

```xml
<!-- spring-mvc.xml：开启注解驱动 -->
<mvc:annotation-driven/>
<!-- 组件扫描，让 @Controller 生效 -->
<context:component-scan base-package="com.example.controller"/>
<!-- 视图解析器 -->
<bean class="org.springframework.web.servlet.view.InternalResourceViewResolver">
    <property name="prefix" value="/WEB-INF/jsp/"/>
    <property name="suffix" value=".jsp"/>
</bean>
```

#### 4.2 注解/Java Config 配置（现代项目主流）

现代项目（尤其 Spring Boot）不再写 XML，一切用注解 + Java 配置搞定。核心三件套：

```java
// 1. @Controller 标注处理器，@RequestMapping 标注映射关系
@RestController
@RequestMapping("/user")
public class UserController {
    @GetMapping("/{id}")
    public User get(@PathVariable Long id) { ... }
}

// 2. 通过 WebMvcConfigurer 定制 MVC 行为（替代 XML 里的 <mvc:...> 标签）
@Configuration
public class WebConfig implements WebMvcConfigurer {
    // 注册拦截器、配置跨域、静态资源映射、消息转换器……都在这
}

// 3. Spring Boot 里 @SpringBootApplication 已隐含 @EnableWebMvc 的能力，
//    自动装配 DispatcherServlet，无需任何 XML
```

### 5. 常用注解全景表

下面这套注解覆盖了 90%+ 的日常开发，每个都配示例和使用场景：

| 注解 | 作用 | 使用场景 |
| --- | --- | --- |
| `@Controller` | 声明一个 MVC 控制器类 | 返回视图（JSP/模板）的老项目 |
| `@RestController` | `@Controller` + `@ResponseBody` | 前后端分离，返回 JSON |
| `@RequestMapping` | 类/方法上通用映射（URL、方法、参数、头、媒体类型） | 需要精确控制的场景 |
| `@GetMapping` | 映射 GET 请求 | 查询接口 |
| `@PostMapping` | 映射 POST 请求 | 新增、表单提交 |
| `@PutMapping` | 映射 PUT 请求 | 全量更新 |
| `@DeleteMapping` | 映射 DELETE 请求 | 删除 |
| `@PatchMapping` | 映射 PATCH 请求 | 部分更新 |
| `@PathVariable` | 从 URL 路径取参数 | RESTful 风格 `/user/1` |
| `@RequestParam` | 从查询串/表单取参数 | `?name=xx` |
| `@RequestBody` | 从请求体（JSON）反序列化对象 | POST 传复杂 JSON |
| `@ResponseBody` | 返回值写进响应体 | 返回 JSON |
| `@RequestHeader` | 从请求头取值 | 取 `token`、`Content-Type` |
| `@CookieValue` | 从 Cookie 取值 | 取 `sessionId` |
| `@RequestAttribute` | 从请求属性域取值 | 取 forward 过来的数据 |
| `@SessionAttribute` | 从 Session 取值 | 取登录用户信息 |
| `@ModelAttribute` | 绑定模型数据/表单对象 | 表单回显、公共数据注入 |
| `@InitBinder` | 自定义数据绑定器 | 字段过滤、自定义类型转换 |
| `@ExceptionHandler` | 方法级异常处理 | 单控制器内兜底 |
| `@ControllerAdvice` | 全局异常/全局数据 | 全局兜底 |
| `@ResponseStatus` | 指定响应状态码 | 自定义异常映射 HTTP 状态码 |
| `@CrossOrigin` | 方法/类级跨域 | 简单跨域场景 |
| `@Valid` / `@Validated` | 触发参数校验 | 配合 JSR-303 校验 |

### 6. 参数绑定：前端数据怎么进到方法

参数绑定是 Spring MVC 最日常、也最容易被问"原理"的部分。按参数来源分四类：

#### 6.1 简单参数 `@RequestParam`

```java
// ?name=zhangsan&page=1&pageSize=10
@GetMapping("/list")
public List<User> list(@RequestParam("name") String name,
                       @RequestParam(value = "page", defaultValue = "1") int page,
                       @RequestParam(value = "pageSize", required = false) Integer pageSize) {
    // defaultValue 的作用：给分页参数兜底，防止前端漏传导致 400 或空指针
    // required = false 配合包装类型 Integer：允许不传，值为 null
    return userService.list(name, page, pageSize);
}
```

关键规则：
- `@RequestParam` 默认 `required = true`，参数缺失直接抛 `MissingServletRequestParameterException`（返回 400）。
- 基础类型建议用 `defaultValue` 兜底；可空字段用包装类型 + `required = false`。

#### 6.2 路径参数 `@PathVariable`

```java
// RESTful 风格：/user/1001
@GetMapping("/{id}")
public User getById(@PathVariable("id") Long id) {
    // 占位符 {id} 与方法参数名一致时，@PathVariable 的 value 可省略
    return userService.getById(id);
}

// 多级路径：/user/1001/orders/2002
@GetMapping("/{userId}/orders/{orderId}")
public Order getOrder(@PathVariable Long userId, @PathVariable Long orderId) { ... }
```

#### 6.3 JSON 对象 `@RequestBody`

```java
// 请求体：{"name":"zhangsan","age":20}
@PostMapping("/save")
public Result<Void> save(@RequestBody User user) {
    // @RequestBody 把请求体 JSON 反序列化成 User（依赖 HttpMessageConverter）
    userService.save(user);
    return Result.ok();
}
```

#### 6.4 请求头 / Cookie

```java
@GetMapping("/info")
public String info(@RequestHeader("Authorization") String token,
                   @CookieValue(name = "SESSIONID", required = false) String sessionId) {
    // 取 token 做鉴权、取 sessionId 追踪会话
    return userService.whoAmI(token);
}
```

#### 6.5 直接用 Servlet API 对象

Spring MVC 允许方法参数直接声明 Servlet 原生对象，框架会自动注入：

```java
@GetMapping("/meta")
public void meta(HttpServletRequest request, HttpServletResponse response, HttpSession session) {
    String ip = request.getRemoteAddr();   // 拿客户端 IP
    String ua = request.getHeader("User-Agent"); // 拿浏览器信息
}
```

::: tip 💡 面试题：`@RequestParam`、`@PathVariable`、`@RequestBody` 三者区别？
结论：取参来源不同。`@RequestParam` 从 URL 查询串（`?a=1`）或表单取**单个值**；`@PathVariable` 从 URL **路径段**（`/user/1`）取值，RESTful 用；`@RequestBody` 从**请求体**整体反序列化成对象（JSON）。GET 一般没请求体，所以 GET 用前两者，POST 传 JSON 用第三个。
:::

### 7. 返回值类型与响应

Controller 方法的返回值可以有多种形态，Spring MVC 会根据类型做不同处理：

| 返回类型 | 处理方式 | 场景 |
| --- | --- | --- |
| `String` | 当作逻辑视图名，交给 `ViewResolver` 解析 | 返回 JSP/Thymeleaf 页面 |
| `ModelAndView` | 同时携带数据和视图 | 既要渲染视图又要带数据 |
| `void` | 无返回值，靠 `response` 手动写出 | 下载文件等流式响应 |
| 任意对象（配合 `@ResponseBody`） | 序列化成 JSON 写进响应体 | 前后端分离主流 |
| `ResponseEntity<T>` | 可精确控制状态码、响应头、响应体 | 需要自定义 HTTP 状态/头 |
| `HttpEntity<T>` | 同 `ResponseEntity`，但不能控制状态码 | 只需自定义响应头 |

#### 7.1 返回 JSON（最常用）

```java
@RestController
public class UserController {
    @GetMapping("/user/{id}")
    public User get(@PathVariable Long id) {
        return userService.getById(id); // 返回值自动被 HttpMessageConverter 转成 JSON
    }
}
```

#### 7.2 `ResponseEntity` 精确控制响应

```java
@GetMapping("/export")
public ResponseEntity<byte[]> export() {
    byte[] bytes = reportService.exportExcel();
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
    headers.setContentDispositionFormData("attachment", "report.xlsx"); // 触发浏览器下载
    // ResponseEntity 允许你自定义状态码 + 响应头 + 响应体，比裸 byte[] 灵活
    return new ResponseEntity<>(bytes, headers, HttpStatus.OK);
}
```

#### 7.3 重定向与转发

```java
@PostMapping("/login")
public String login(@RequestParam String username, @RequestParam String password) {
    boolean ok = authService.login(username, password);
    if (ok) {
        return "redirect:/index";   // 重定向：302，URL 会变，重新发请求
    }
    return "forward:/loginPage";    // 转发：服务器内部跳转，URL 不变，request 共享
}
```

- `redirect:` 是客户端行为，浏览器收到 302 后重新请求新地址，**请求参数不会自动带过去**（除非拼进 URL 或用 FlashMap）。
- `forward:` 是服务器内部行为，一次请求内完成，**request 域数据共享**。

### 8. 静态资源处理

Spring MVC 默认把 `/` 映射给 `DispatcherServlet`，导致静态资源（css/js/图片）也可能被它拦截，找不到就 404。解决方式有几种：

```java
// Spring Boot 默认已有静态资源映射：/static、/public、/resources、/META-INF/resources
// 如果需要自定义，用 WebMvcConfigurer：
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 把 /files/** 的请求映射到磁盘目录 E:/upload
        registry.addResourceHandler("/files/**")
                .addResourceLocations("file:E:/upload/");
    }
}
```

::: tip 💡 面试题：为什么 Spring MVC 要单独处理静态资源？
因为 `DispatcherServlet` 的映射路径通常是 `/`，会拦截所有请求（包括静态资源）。如果静态资源没有对应的 `HandlerMapping`，就会 404。解决方式要么让容器默认 Servlet 处理静态资源，要么像 Spring Boot 那样显式配置 `ResourceHandler` 把静态资源路径映射到真实位置。
:::

### 9. 拦截器 HandlerInterceptor

拦截器是 Spring MVC 自己的一套"切面"，在 Controller 方法执行前后插入逻辑，最典型的应用是登录校验。

```java
@Component
public class LoginInterceptor implements HandlerInterceptor {

    // preHandle：方法执行前。返回 false 直接拦截，不再往下走
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 为什么在 preHandle 校验 token：登录态必须在业务方法执行前判断，
        // 否则未登录用户也能进入核心业务逻辑，校验就失去意义
        String token = request.getHeader("Authorization");
        if (token == null || !tokenService.isValid(token)) {
            throw new UnauthorizedException("未登录"); // 抛异常交给全局异常处理器统一返回
        }
        return true; // 放行
    }

    // postHandle：方法执行后、视图渲染前（此时已拿到 ModelAndView）
    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler,
                           ModelAndView modelAndView) {
        // 可以对返回的数据做统一加工
    }

    // afterCompletion：整个请求完成后执行（资源清理、日志记录）
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        // 为什么放清理逻辑在这：无论前面是否抛异常，afterCompletion 都会执行
    }
}
```

注册拦截器（务必注册，否则拦截器不生效）：

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new LoginInterceptor())
                .addPathPatterns("/**")            // 拦截所有
                .excludePathPatterns("/login", "/register", "/static/**"); // 放行登录注册和静态资源
    }
}
```

### 10. 过滤器 vs 拦截器 vs AOP

这是超高频对比题，三者的职责边界要能画清楚：

| 对比项 | 过滤器 Filter | 拦截器 Interceptor | Spring AOP |
| --- | --- | --- | --- |
| 归属 | Servlet 规范（Java EE） | Spring MVC 框架 | Spring 框架 |
| 能否拿到 Spring Bean | 不能直接注入（在容器外） | 可以（本身是 Spring 组件） | 可以 |
| 拦截范围 | 所有请求（含静态资源） | 只拦 Spring MVC 处理的请求 | 拦截 Bean 方法（不限于 Controller） |
| 执行时机 | 在 `DispatcherServlet` 之前 | `DispatcherServlet` 之后、Controller 之前 | 方法调用前后（动态代理） |
| 粒度 | 粗（按 URL） | 中（按 URL + 方法） | 细（按方法 + 注解 + 表达式） |
| 典型场景 | 编码、跨域、日志、XSS 过滤 | 登录校验、权限、性能统计 | 事务、缓存、日志切面 |

```text
请求 → Filter → DispatcherServlet → Interceptor(preHandle) → Controller 方法 → Interceptor(postHandle) → 视图 → Interceptor(afterCompletion) → Filter → 响应
```

::: tip 💡 面试题：Filter、Interceptor、AOP 谁先执行？
结论：**Filter 最先**。Filter 在 Servlet 容器层就拦截（`DispatcherServlet` 本身也是一个 Servlet，还没轮到它）；Interceptor 要等请求进入 `DispatcherServlet` 之后才生效；AOP 则是在 Controller 方法真正被调用时（通过动态代理）才触发。所以顺序是 Filter → Interceptor → AOP。
:::

### 11. 全局异常处理

不要在每个 Controller 里写 try-catch，用 `@RestControllerAdvice` + `@ExceptionHandler` 统一兜底。

```java
@RestControllerAdvice // 全局拦截所有 Controller 抛出的异常，并把返回值序列化成 JSON
public class GlobalExceptionHandler {

    // 业务异常：返回业务状态码 + 提示
    @ExceptionHandler(BusinessException.class)
    public Result<Void> handleBusiness(BusinessException e) {
        // 统一返回 Result 包装：前端拿到固定结构 {code,msg,data}，解析逻辑只需写一次
        return Result.error(e.getCode(), e.getMessage());
    }

    // 参数校验异常：把校验失败信息友好地返回
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public Result<Void> handleValid(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldError().getDefaultMessage();
        return Result.error(400, msg);
    }

    // 兜底异常：任何没被上面的 handler 接住的异常都走这里
    @ExceptionHandler(Exception.class)
    public Result<Void> handleOther(Exception e) {
        log.error("未捕获异常", e); // 为什么这里要打日志：兜底异常往往意味着 bug，需要留痕排查
        return Result.error(500, "服务器开小差了");
    }
}
```

关键点：`@ExceptionHandler` 的匹配规则是「找最精确的异常类型」，所以 `BusinessException` 和 `Exception` 可以共存，前者优先。

---

## 高级篇

### 12. 拦截器的三个方法执行顺序（深入版）

`HandlerInterceptor` 的三个回调方法有严格的执行顺序，这是理解"为什么登录校验写在 preHandle"的关键。

```text
请求进来
   │
   ▼
preHandle()  ──────────────► 返回 false？ ──► 请求到此为止，直接返回（postHandle 不执行）
   │ 返回 true
   ▼
Controller 业务方法执行
   │
   ▼
postHandle()   // 方法执行后、视图渲染前，此时能拿到 ModelAndView
   │
   ▼
视图渲染 / 结果序列化
   │
   ▼
afterCompletion()  // 整个请求完成后，无论前面是否抛异常都会执行
```

#### 12.1 多拦截器的执行顺序

注册多个拦截器时，`preHandle` 按注册顺序**正序**执行，`postHandle` 和 `afterCompletion` 按**逆序**执行，像栈一样：

```text
拦截器 A、B、C 依次注册：
preHandle:      A → B → C
Controller:     ...
postHandle:     C → B → A
afterCompletion: C → B → A
```

```text
为什么是"正进逆出"：
A.preHandle ──► B.preHandle ──► C.preHandle ──► Controller
      ◄────────── ◄────────── ◄──────────
A.afterCompletion ◄─ B.afterCompletion ◄─ C.afterCompletion
```

这种"栈式"设计保证了：如果 C 在 `preHandle` 返回 false 拦住了请求，那么只有已经放行过的 A、B 会执行 `afterCompletion` 做清理，C 自己不会执行，逻辑对称。

#### 12.2 拦截器源码链路（进阶）

拦截器能"在方法前后插逻辑"，底层是 `HandlerExecutionChain` 把 Handler 和拦截器链打包，`DispatcherServlet` 在 `doDispatch` 里按顺序调用：

```java
// org.springframework.web.servlet.DispatcherServlet#doDispatch 的关键片段（简化）
HandlerExecutionChain chain = getHandler(request);          // 拿到 handler + 拦截器链
HandlerAdapter ha = getHandlerAdapter(handler);

if (!chain.applyPreHandle(request, response)) return;       // ① 正序执行 preHandle，false 则中断
ModelAndView mv = ha.handle(request, response, handler);    // ② 真正调用 Controller
chain.applyPostHandle(request, response, mv);               // ③ 逆序执行 postHandle
processDispatchResult(request, response, chain, mv, ex);    // ④ 视图渲染 / 异常处理
chain.triggerAfterCompletion(request, response, ex);        // ⑤ 逆序执行 afterCompletion
```

### 13. 统一响应结构 + ResponseBodyAdvice

后端接口统一返回 `{ code, msg, data }`，前端好处理、也方便排障。

#### 13.1 定义统一响应体

```java
public class Result<T> {
    private int code;      // 状态码：0 成功，非 0 失败
    private String msg;    // 提示信息
    private T data;        // 业务数据

    // 静态工厂方法：成功 / 失败，避免到处 new Result() 重复设值
    public static <T> Result<T> ok(T data) {
        Result<T> r = new Result<>();
        r.code = 0; r.msg = "success"; r.data = data;
        return r;
    }
    public static <T> Result<T> error(int code, String msg) {
        Result<T> r = new Result<>();
        r.code = code; r.msg = msg;
        return r;
    }
    // getter/setter 省略
}
```

#### 13.2 用 ResponseBodyAdvice 全局包装（可选进阶）

如果不想每个方法都写 `Result.ok(xxx)`，可以用 `ResponseBodyAdvice` 在序列化前统一包装：

```java
@RestControllerAdvice
public class GlobalResponseAdvice implements ResponseBodyAdvice<Object> {

    @Override
    public boolean supports(MethodParameter returnType, Class converterType) {
        // 为什么需要 supports 判断：避免把已经是 Result 的返回值二次包装成 Result<Result>
        return !returnType.getParameterType().equals(Result.class);
    }

    @Override
    public Object beforeBodyWrite(Object body, MethodParameter returnType, MediaType type,
                                  Class converterType, ServerHttpRequest request, ServerHttpResponse response) {
        // 在 HttpMessageConverter 写响应体之前，把原始返回对象包进 Result
        return Result.ok(body);
    }
}
```

### 14. HttpMessageConverter：对象和 JSON 怎么互转

`@ResponseBody` / `@RequestBody` 真正干活的是 `HttpMessageConverter` 这一策略接口。

#### 14.1 接口定义

```java
public interface HttpMessageConverter<T> {
    boolean canRead(Class<?> clazz, MediaType mediaType);   // 能否把请求体读成 clazz
    boolean canWrite(Class<?> clazz, MediaType mediaType);  // 能否把 clazz 写成响应体
    List<MediaType> getSupportedMediaTypes();               // 支持的媒体类型
    T read(Class<? extends T> clazz, HttpInputMessage inputMessage) throws IOException;
    void write(T t, MediaType contentType, HttpOutputMessage outputMessage) throws IOException;
}
```

#### 14.2 常见实现

| 实现类 | 支持的媒体类型 | 作用 |
| --- | --- | --- |
| `StringHttpMessageConverter` | `text/plain` | 字符串读写 |
| `MappingJackson2HttpMessageConverter` | `application/json` | Jackson 处理 JSON（Spring Boot 默认） |
| `GsonHttpMessageConverter` | `application/json` | Gson 处理 JSON |
| `ByteArrayHttpMessageConverter` | 全类型 | 字节流（文件下载） |
| `FormHttpMessageConverter` | `application/x-www-form-urlencoded` | 表单 |
| `ResourceHttpMessageConverter` | 全类型 | 资源下载 |

#### 14.3 序列化流程（画出来）

```text
Controller 返回 User 对象（带 @ResponseBody）
    │
    ▼
RequestMappingHandlerAdapter 遍历所有 HttpMessageConverter
    │
    ▼
找到 canWrite(User.class, application/json) 为 true 的转换器
    │
    ▼
MappingJackson2HttpMessageConverter.write()
    │ 内部调用 Jackson 的 ObjectMapper.writeValue()
    ▼
把 User 序列化成 JSON 字符串写进 HttpServletResponse 的输出流
```

::: tip 💡 面试题：接口返回日期为什么会变成一串数字或时区错乱？
结论：因为 Jackson 默认把 `Date` 序列化成时间戳（毫秒数），且默认用 UTC 时区，导致展示成 8 小时偏差。解决：在字段上标注 `@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "GMT+8")` 显式指定格式和时区，或全局配置 Jackson 的日期格式。
:::

#### 14.4 自定义消息转换器

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        // 自定义 Jackson 转换器：全局统一日期格式，比在每个字段加 @JsonFormat 省事
        MappingJackson2HttpMessageConverter converter = new MappingJackson2HttpMessageConverter();
        ObjectMapper om = new ObjectMapper();
        om.setDateFormat(new SimpleDateFormat("yyyy-MM-dd HH:mm:ss"));
        om.setTimeZone(TimeZone.getTimeZone("GMT+8"));
        converter.setObjectMapper(om);
        converters.add(0, converter); // 加到最前面，优先级最高
    }
}
```

### 15. 参数校验 JSR-303

不要用 `if (name == null || name.isEmpty())` 手写校验，用注解声明式校验。

```java
// 实体上加校验注解（JSR-303 / Jakarta Validation）
public class User {
    @NotBlank(message = "用户名不能为空")
    private String name;

    @Min(value = 0, message = "年龄不能为负数")
    @Max(value = 150, message = "年龄不合法")
    private Integer age;

    @Email(message = "邮箱格式错误")
    private String email;
}

@RestController
public class UserController {
    @PostMapping("/save")
    public Result<Void> save(@Valid @RequestBody User user) {
        // @Valid 触发校验：不通过时抛 MethodArgumentNotValidException，
        // 由全局异常处理器捕获，把 message 返回给前端
        userService.save(user);
        return Result.ok();
    }
}
```

#### 15.1 分组校验

同一个实体在不同接口的校验规则可能不同（新增要校验 id，更新不要），用分组：

```java
public class User {
    public interface AddGroup {}     // 新增分组标记接口
    public interface UpdateGroup {}  // 更新分组标记接口

    @Null(groups = AddGroup.class, message = "新增时 id 必须为空")
    @NotNull(groups = UpdateGroup.class, message = "更新时 id 不能为空")
    private Long id;

    @NotBlank(message = "用户名不能为空") // 未指定 groups，默认组，两个接口都校验
    private String name;
}

@PostMapping("/save")
public Result<Void> save(@Validated(User.AddGroup.class) @RequestBody User user) { ... }

@PutMapping("/update")
public Result<Void> update(@Validated(User.UpdateGroup.class) @RequestBody User user) { ... }
```

#### 15.2 自定义校验注解

```java
// 1. 自定义注解
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PhoneValidator.class) // 关联校验器
public @interface Phone {
    String message() default "手机号格式错误";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

// 2. 校验器
public class PhoneValidator implements ConstraintValidator<Phone, String> {
    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return value != null && value.matches("^1[3-9]\\d{9}$");
    }
}
```

### 16. 跨域 CORS

前后端分离时，前端（`localhost:3000`）调后端（`localhost:8080`）会触发浏览器同源策略拦截。三种解决方式：

#### 16.1 局部：`@CrossOrigin`

```java
@RestController
@RequestMapping("/user")
@CrossOrigin(origins = "http://localhost:3000", maxAge = 3600)
public class UserController { ... }
```

#### 16.2 全局：`WebMvcConfigurer`

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")                    // 所有接口
                .allowedOrigins("http://localhost:3000")
                .allowedMethods("GET", "POST", "PUT", "DELETE")
                .allowedHeaders("*")
                .allowCredentials(true)               // 允许携带 Cookie
                .maxAge(3600);
    }
}
```

#### 16.3 原理：靠响应头

跨域的本质是浏览器在响应头里检查 `Access-Control-Allow-Origin` 等字段，服务端只要在响应里带上这些头，浏览器就放行：

```text
请求：OPTIONS /user  （预检请求 preflight，询问是否允许跨域）
响应头：
  Access-Control-Allow-Origin: http://localhost:3000
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE
  Access-Control-Allow-Headers: Content-Type, Authorization
```

### 17. 文件上传与下载

#### 17.1 上传

```java
@PostMapping("/upload")
public Result<String> upload(@RequestParam("file") MultipartFile file) throws IOException {
    // MultipartFile 是 Spring 对上传文件的抽象，底层靠 MultipartResolver 解析 multipart 请求
    String originalName = file.getOriginalFilename(); // 原始文件名
    String ext = originalName.substring(originalName.lastIndexOf(".")); // 后缀
    // 为什么用 UUID 重命名：防止用户上传同名文件互相覆盖，也防止路径穿越
    String newName = UUID.randomUUID().toString() + ext;
    file.transferTo(new File("E:/upload/" + newName)); // 落盘
    return Result.ok("/files/" + newName);
}
```

```yaml
# Spring Boot 配置文件：限制上传大小
spring:
  servlet:
    multipart:
      max-file-size: 10MB       # 单个文件上限
      max-request-size: 20MB    # 整个请求上限
```

#### 17.2 下载

```java
@GetMapping("/download/{name}")
public ResponseEntity<Resource> download(@PathVariable String name) {
    Resource file = new FileSystemResource("E:/upload/" + name);
    return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + name + "\"")
            .contentType(MediaType.APPLICATION_OCTET_STREAM)
            .body(file);
}
```

### 18. 异步请求：Callable / DeferredResult / SSE

Spring MVC 基于 Servlet，默认是同步阻塞模型——一个请求占一个线程。遇到耗时操作（调用第三方、长轮询），可以用异步请求释放容器线程。

#### 18.1 Callable：把耗时任务丢到别的线程池

```java
@GetMapping("/callable")
public Callable<String> callable() {
    // 返回 Callable：容器线程立刻释放，业务在线程池里执行，完成后由框架再写响应
    return () -> {
        TimeUnit.SECONDS.sleep(2); // 模拟耗时操作
        return "处理完成";
    };
}
```

#### 18.2 DeferredResult：跨线程/跨服务回写结果

```java
@GetMapping("/deferred")
public DeferredResult<String> deferred() {
    DeferredResult<String> result = new DeferredResult<>(5000L); // 超时 5 秒
    // 把 result 交给另一个线程/消息队列，稍后 setResult 写回响应
    executor.submit(() -> {
        String data = remoteService.slowCall();
        result.setResult(data); // 完成时才写响应，线程早已释放
    });
    return result;
}
```

#### 18.3 SSE：服务端推送

```java
@GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter stream() {
    SseEmitter emitter = new SseEmitter();
    executor.execute(() -> {
        try {
            for (int i = 0; i < 10; i++) {
                emitter.send("消息 " + i); // 每次 send 推一条给前端
                TimeUnit.SECONDS.sleep(1);
            }
            emitter.complete();
        } catch (Exception e) {
            emitter.completeWithError(e);
        }
    });
    return emitter;
}
```

::: tip 💡 面试题：Spring MVC 是同步还是异步模型？
结论：**默认同步阻塞**。它是基于 Servlet 规范的，每个请求占用一个 Tomcat 线程直到处理完成。需要异步时，可以返回 `Callable` / `DeferredResult` / `SseEmitter`，让容器线程先释放、业务在别处执行，从而提高吞吐。真正全异步（事件驱动、非阻塞 IO）是 Spring WebFlux 的活，不是 Spring MVC 的主场。
:::

### 19. 内容协商 ContentNegotiation

同一个 URL，客户端想要不同格式（JSON / XML），Spring MVC 通过内容协商决定返回哪种。

```java
@GetMapping(value = "/user/{id}", produces = {MediaType.APPLICATION_JSON_VALUE, MediaType.APPLICATION_XML_VALUE})
public User get(@PathVariable Long id) { ... }
```

协商依据（优先级从高到低）：URL 扩展名（`.json`）→ 请求参数（`?format=xml`）→ `Accept` 请求头。实际项目中 JSON 一统天下，内容协商主要用于老系统兼容。

### 20. WebMvcConfigurer：定制 MVC 的一站式入口

Spring MVC 把几乎所有可扩展点都集中在 `WebMvcConfigurer` 接口里，掌握它就能应对各种定制需求：

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override public void addInterceptors(InterceptorRegistry registry) { /* 拦截器 */ }
    @Override public void addCorsMappings(CorsRegistry registry) { /* 跨域 */ }
    @Override public void addResourceHandlers(ResourceHandlerRegistry registry) { /* 静态资源 */ }
    @Override public void addViewControllers(ViewControllerRegistry registry) { /* 无逻辑页面跳转 */ }
    @Override public void extendMessageConverters(List<HttpMessageConverter<?>> converters) { /* 消息转换器 */ }
    @Override public void addFormatters(FormatterRegistry registry) { /* 类型格式化 */ }
    @Override public void configureAsyncSupport(AsyncSupportConfigurer configurer) { /* 异步配置 */ }
}
```

### 21. 拦截器与 AOP 的关系（再辨析）

很多同学分不清拦截器和 AOP。核心区别一句话：**拦截器只能拦 Controller 的请求，AOP 能拦任意 Bean 的任意方法**。

```text
Interceptor：按 URL 维度，拦住"一次 HTTP 请求"，能拿到 request/response
AOP：按方法维度，拦住"一个 Bean 方法"，能拿到方法入参/返回值/切点注解
```

实际选择：
- 需要登录态、request/response、按 URL 放行 → 拦截器。
- 需要事务、缓存、日志、权限注解（`@PreAuthorize`）→ AOP。

---

## 原理篇

### 22. 一次请求的完整流转（doDispatch 源码级）

这是面试最爱让口述的题目。前面基础篇给了 6 步简化版，这里下到源码级，完整拆解 `DispatcherServlet.doDispatch()`。

#### 22.1 类层次结构

```text
javax.servlet.http.HttpServlet （Servlet 规范）
        ▲
        │ 继承
HttpServletBean            （Spring，读 init-param 配置）
        ▲
FrameworkServlet           （Spring，处理 WebApplicationContext 初始化）
        ▲
DispatcherServlet         （Spring MVC 核心，分发请求）
```

`DispatcherServlet` 本质就是一个 Servlet，`service()` 方法由 `FrameworkServlet` 统一实现，最终委托到 `DispatcherServlet.doDispatch()`。

#### 22.2 doDispatch 完整流程（带源码对应）

```java
protected void doDispatch(HttpServletRequest request, HttpServletResponse response) throws Exception {
    HttpServletRequest processedRequest = request;
    HandlerExecutionChain mappedHandler = null;
    boolean multipartRequestParsed = false;

    try {
        ModelAndView mv = null;
        Exception dispatchException = null;

        // ① 检查是否是文件上传请求，是则解析 multipart
        processedRequest = checkMultipart(request);
        multipartRequestParsed = (processedRequest != request);

        // ② 通过 HandlerMapping 找到 handler + 拦截器链
        mappedHandler = getHandler(processedRequest);
        if (mappedHandler == null) {
            noHandlerFound(processedRequest, response); // 找不到 handler → 404
            return;
        }

        // ③ 通过 HandlerAdapter 找到能"执行"这个 handler 的适配器
        HandlerAdapter ha = getHandlerAdapter(mappedHandler.getHandler());

        // ④ 前置拦截：正序执行 preHandle，返回 false 则中断
        if (!mappedHandler.applyPreHandle(processedRequest, response)) {
            return;
        }

        // ⑤ 真正调用 Controller 方法（内部完成参数解析 + 返回值处理）
        mv = ha.handle(processedRequest, response, mappedHandler.getHandler());

        // ⑥ 应用默认视图名 + 后置拦截：逆序执行 postHandle
        applyDefaultViewName(processedRequest, mv);
        mappedHandler.applyPostHandle(processedRequest, response, mv);
    }
    catch (Exception ex) {
        dispatchException = ex;
    }

    // ⑦ 处理结果：视图渲染 或 异常处理（这里也是全局异常处理器介入的地方）
    processDispatchResult(processedRequest, response, mappedHandler, mv, dispatchException);
}
```

#### 22.3 流程图（ASCII）

```text
        HTTP 请求
           │
           ▼
   ┌────────────────┐
   │ DispatcherServlet │  doDispatch()
   └────────────────┘
           │
           ├─ ① checkMultipart()     检查/解析文件上传
           ├─ ② getHandler()         遍历 HandlerMapping 找 HandlerExecutionChain
           ├─ ③ getHandlerAdapter()  找到支持该 handler 的 HandlerAdapter
           ├─ ④ applyPreHandle()     正序执行拦截器 preHandle
           ├─ ⑤ ha.handle()          调用 Controller（参数解析→方法执行→返回值处理）
           ├─ ⑥ applyPostHandle()    逆序执行拦截器 postHandle
           └─ ⑦ processDispatchResult()  视图渲染 / 异常处理 → afterCompletion
           │
           ▼
       HTTP 响应
```

::: tip 💡 面试题：`DispatcherServlet` 为什么叫"前端控制器"？
结论：因为它是整个框架唯一的 Servlet，接收所有请求并统一调度后续组件，符合 GoF 的「前端控制器（Front Controller）」设计模式——把所有请求先汇聚到一个统一的入口，再分发出去。好处是公共逻辑（鉴权、编码、日志）只需在这一处处理，避免散落各 Servlet。
:::

### 23. DispatcherServlet 初始化流程（九大组件）

`DispatcherServlet` 在 `initStrategies()` 里初始化九大组件（策略对象），这就是面试常问的"九大组件"。

#### 23.1 九大组件清单

| # | 组件 | 接口 | 默认实现（Spring Boot 下） | 作用 |
| --- | --- | --- | --- | --- |
| 1 | 处理器映射器 | `HandlerMapping` | `RequestMappingHandlerMapping` | URL → Handler |
| 2 | 处理器适配器 | `HandlerAdapter` | `RequestMappingHandlerAdapter` | 调用 Handler |
| 3 | 异常解析器 | `HandlerExceptionResolver` | `ExceptionHandlerExceptionResolver` | 处理异常 |
| 4 | 视图解析器 | `ViewResolver` | `ContentNegotiatingViewResolver` | 逻辑视图名 → 视图 |
| 5 | 请求转视图名 | `RequestToViewNameTranslator` | `DefaultRequestToViewNameTranslator` | 无视图名时生成 |
| 6 | 区域解析器 | `LocaleResolver` | `AcceptHeaderLocaleResolver` | 国际化 |
| 7 | 主题解析器 | `ThemeResolver` | `FixedThemeResolver` | 主题切换 |
| 8 | 文件上传解析器 | `MultipartResolver` | `StandardServletMultipartResolver` | multipart 解析 |
| 9 | Flash 属性管理 | `FlashMapManager` | `SessionFlashMapManager` | 重定向携带数据 |

#### 23.2 initStrategies 源码

```java
protected void initStrategies(ApplicationContext context) {
    initMultipartResolver(context);        // 文件上传
    initLocaleResolver(context);           // 国际化
    initThemeResolver(context);            // 主题
    initHandlerMappings(context);          // 处理器映射器
    initHandlerAdapters(context);          // 处理器适配器
    initHandlerExceptionResolvers(context);// 异常解析器
    initRequestToViewNameTranslator(context);// 请求转视图名
    initViewResolvers(context);            // 视图解析器
    initFlashMapManager(context);          // Flash 属性
}
```

每个 `initXxx` 的策略是统一的「先按类型从容器找，找不到就用默认实现」，这是典型的策略模式：**核心流程固定，具体策略可替换**。

### 24. HandlerMapping 原理：URL 怎么映射到方法

`HandlerMapping` 的核心实现是 `RequestMappingHandlerMapping`，它是「注解驱动」的产物。

#### 24.1 初始化：扫描 @Controller 和方法

```text
RequestMappingHandlerMapping 实现了 InitializingBean
        │
        ▼
afterPropertiesSet()
        │
        ▼
扫描 Spring 容器里所有 Bean，找出标注了 @Controller / @RequestMapping 的类和方法
        │
        ▼
对每个方法，解析 @RequestMapping 注解，生成 RequestMappingInfo
（包含：路径模式、请求方法、参数条件、请求头条件、consumes、produces）
        │
        ▼
把 方法 包装成 HandlerMethod，和 RequestMappingInfo 一起注册到 MappingRegistry
        │
        ▼
MappingRegistry 维护一个 Map<RequestMappingInfo, HandlerMethod> 和按路径组织的索引
```

#### 24.2 请求匹配

```text
请求进来，getHandler(request)
        │
        ▼
用 UrlPathHelper 提取请求路径 → 用 AntPathMatcher 做路径模式匹配（支持 * 和 **）
        │
        ▼
匹配到唯一的 RequestMappingInfo → 返回对应的 HandlerMethod + 拦截器
        │
        ▼
包装成 HandlerExecutionChain
```

```java
// AntPathMatcher 的路径通配符
/user/*       // 匹配 /user/1，但不匹配 /user/1/2
/user/**      // 匹配 /user/1、/user/1/2、/user/1/2/3（多级）
/user/{id}    // 路径变量，配合 @PathVariable 取 id
```

### 25. HandlerAdapter 原理：方法参数是怎么被"自动填好"的

这是 Spring MVC 最精巧的部分之一。`RequestMappingHandlerAdapter` 负责把 HTTP 请求里的数据，解析成 Controller 方法的入参。

#### 25.1 两个关键策略接口

```text
HandlerMethodArgumentResolver    → 参数解析器：把请求数据变成方法入参
HandlerMethodReturnValueHandler  → 返回值处理器：把方法返回值变成响应
```

#### 25.2 常用参数解析器

| 解析器 | 处理的参数类型/注解 | 说明 |
| --- | --- | --- |
| `RequestParamMethodArgumentResolver` | `@RequestParam` | 查询参数/表单 |
| `PathVariableMethodArgumentResolver` | `@PathVariable` | 路径变量 |
| `RequestHeaderMethodArgumentResolver` | `@RequestHeader` | 请求头 |
| `ServletRequestMethodArgumentResolver` | `HttpServletRequest` 等 Servlet 对象 | 原生对象 |
| `RequestResponseBodyMethodProcessor` | `@RequestBody` / `@ResponseBody` | JSON 读写 |
| `ModelAttributeMethodProcessor` | `@ModelAttribute` / 无注解复杂对象 | 表单绑定对象 |
| `ServletModelAttributeMethodProcessor` | 同上（Servlet 环境） | 表单绑定对象 |

#### 25.3 参数解析流程

```text
ha.handle() 调用 Controller 方法前
        │
        ▼
遍历方法的所有入参，对每个参数：
        │
        ▼
for (HandlerMethodArgumentResolver resolver : resolvers)
     if (resolver.supportsParameter(parameter))   // 找到能处理这个参数的解析器
        return resolver.resolveArgument(...);      // 用它解析出参数值
        │
        ▼
resolveArgument 内部通常涉及 WebDataBinder：
   1. 从 request 取原始值（字符串）
   2. 通过 ConversionService 做类型转换（String → Integer 等）
   3. 绑定到目标对象
   4. 触发校验（@Valid 时）
        │
        ▼
拿到完整入参 → 反射调用 Controller 方法
```

### 26. 类型转换与数据绑定：WebDataBinder

前端传过来的参数都是字符串，Spring MVC 怎么把它变成 `Integer`、`Date`、自定义对象？

```text
HTTP 请求（全部是字符串）
        │
        ▼
WebDataBinder
        │
        ├─ ConversionService  负责类型转换：String "20" → int 20
        ├─ PropertyEditor     老式类型转换（日期等）
        └─ Validator          负责校验（JSR-303）
        │
        ▼
目标对象 / 方法参数（正确的 Java 类型）
```

```java
// 自定义类型转换：把 "2026-08-19" 字符串转成 LocalDate
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addFormatters(FormatterRegistry registry) {
        registry.addFormatter(new LocalDateFormatter("yyyy-MM-dd"));
    }
}

// 或者在单个 Controller 里用 @InitBinder
@InitBinder
public void initBinder(WebDataBinder binder) {
    binder.setDisallowedFields("id"); // 禁止绑定 id 字段，防止前端篡改
    binder.addCustomFormatter(new LocalDateFormatter("yyyy-MM-dd"));
}
```

### 27. 全局异常处理原理

全局异常处理不是魔法，它背后是 `HandlerExceptionResolver` 这一策略接口在工作。

#### 27.1 异常解析器清单

| 解析器 | 作用 |
| --- | --- |
| `ExceptionHandlerExceptionResolver` | 处理 `@ExceptionHandler`（`@ControllerAdvice` 里的就是它） |
| `ResponseStatusExceptionResolver` | 处理 `@ResponseStatus` 注解的异常 |
| `DefaultHandlerExceptionResolver` | 处理框架内置异常（404、405、400 等） |

#### 27.2 处理流程

```text
Controller 方法抛异常
        │
        ▼
doDispatch 捕获异常 → processDispatchResult()
        │
        ▼
调用 processHandlerException()
        │
        ▼
for (HandlerExceptionResolver resolver : resolvers)
     resolver.resolveException(request, response, handler, ex)
        │
        ▼
ExceptionHandlerExceptionResolver 找到匹配的 @ExceptionHandler 方法
（匹配规则：异常类型最精确优先，子类异常优先于父类）
        │
        ▼
调用该方法，返回 Result → 序列化写回响应
```

```java
// 异常匹配示例
@ExceptionHandler(BusinessException.class)  // 精确匹配 BusinessException
@ExceptionHandler(Exception.class)          // 兜底所有异常
// 当抛出 BusinessException 时，两个都能匹配，但选更精确的 BusinessException 那个
```

### 28. Spring Boot 是怎么自动装配 Spring MVC 的

Spring Boot 让 Spring MVC"零配置"，靠的是自动配置 + 内嵌容器。

#### 28.1 两大自动配置类

```text
DispatcherServletAutoConfiguration   → 自动创建并注册 DispatcherServlet
WebMvcAutoConfiguration              → 自动配置 HandlerMapping、HandlerAdapter、
                                        消息转换器、视图解析器、静态资源等
```

#### 28.2 内嵌 Tomcat

```text
Spring Boot 引入 spring-boot-starter-web
        │
        ▼
自带 spring-boot-starter-tomcat
        │
        ▼
ServletWebServerFactoryAutoConfiguration 创建 TomcatServletWebServerFactory
        │
        ▼
启动时 new Tomcat() → 把 DispatcherServlet 注册进去 → 启动内嵌 Tomcat
        │
        ▼
main 方法一跑，Web 服务就起来了（无需外部部署 war 包）
```

```java
// 对比：老式部署 war 到外部 Tomcat，vs Spring Boot 内嵌 Tomcat
// 老方式：打 war 包 → 扔进外部 Tomcat 的 webapps 目录 → Tomcat 加载 web.xml 里的 DispatcherServlet
// Spring Boot：内嵌 Tomcat 随应用一起启动，DispatcherServlet 由自动配置注册，无需 web.xml
```

### 29. Spring MVC 与 Servlet 的关系（一句话总结原理）

```text
Spring MVC 不是一个"替代 Servlet"的新东西，
而是运行在 Servlet 容器之上的一套"封装 + 分发"框架：

Servlet 容器（Tomcat）  → 调用 DispatcherServlet（它就是个 Servlet）
DispatcherServlet      → 分发到 Controller（普通 Bean，靠反射调用）
```

所以回答"Spring MVC 底层是什么"时，正确说法是：**Spring MVC 基于 Servlet 规范，核心是一个继承了 `HttpServlet` 的 `DispatcherServlet`，用 IOC 容器管理 Controller，用反射 + 策略模式完成分发、参数绑定、返回值处理和异常处理。**

---

## 面试常问

1. **Spring MVC 和 Spring Boot 是什么关系？**
   结论：Spring Boot 不是新框架，而是 Spring MVC 的"一键启动器"。它通过自动配置和内嵌 Tomcat，免去了 Spring MVC 繁琐的 XML/web.xml 配置，但底层跑的还是 Spring MVC 那套 `DispatcherServlet` 分发机制。

2. **`@RestController` 和 `@Controller` 的区别？**
   结论：`@RestController` = `@Controller` + `@ResponseBody`。前者方法返回值直接序列化进响应体（JSON）；后者返回值默认被当作视图名，交给视图解析器渲染页面。

3. **Spring MVC 一次请求的处理流程（口述）？**
   结论：请求先进 `DispatcherServlet`，依次经过「找 Handler（HandlerMapping）→ 找适配器（HandlerAdapter）→ 执行拦截器 preHandle → 调用 Controller → postHandle → 视图/JSON 渲染 → afterCompletion」。这套流程的核心源码是 `doDispatch()`。

4. **拦截器怎么实现登录校验？为什么写在 preHandle？**
   结论：在 `preHandle` 里取 token 校验，非法就返回 false 或抛异常拦截，合法返回 true 放行。写在 `preHandle` 是因为登录态必须在业务方法执行前判断，晚了就拦不住未登录请求。

5. **Filter、Interceptor、AOP 三者的区别和执行顺序？**
   结论：归属和粒度不同。Filter 属于 Servlet 规范，在 `DispatcherServlet` 之前按 URL 拦截；Interceptor 属于 Spring MVC，在 Controller 之前按 URL+方法拦截；AOP 属于 Spring，按方法（可注解+表达式）拦截任意 Bean。执行顺序 Filter → Interceptor → AOP。

6. **`@RequestParam`、`@PathVariable`、`@RequestBody` 的区别？**
   结论：取参来源不同。`@RequestParam` 取查询串/表单的单个值，`@PathVariable` 取 URL 路径段（RESTful），`@RequestBody` 把请求体 JSON 整体反序列化成对象。

7. **全局异常处理怎么配？底层原理？**
   结论：用 `@RestControllerAdvice` + `@ExceptionHandler` 按异常类型分别处理，返回统一 `Result`。底层是 `HandlerExceptionResolver` 策略接口，`ExceptionHandlerExceptionResolver` 找到最精确匹配的 `@ExceptionHandler` 方法执行。

8. **Spring MVC 是同步还是异步？如何提高并发？**
   结论：默认同步阻塞（基于 Servlet，一请求一线程）。可返回 `Callable`/`DeferredResult`/`SseEmitter` 释放容器线程提高吞吐；若要真正的非阻塞事件驱动模型，得用 Spring WebFlux。

---

## 相关链接

- [Spring](/learn_backend/java/基础/Spring) —— Spring MVC 的 IOC/DI 基础，理解 Bean 容器
- [Spring Boot](/learn_backend/java/基础/Spring Boot) —— 自动配置与内嵌容器，Spring MVC 的一键启动
- [MyBatis](/learn_backend/java/基础/MyBatis) —— Controller 调用的持久层框架
- [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) —— 持久层增强
- [Spring Security](/learn_backend/java/基础/Spring Security) —— 用 Filter 做认证授权，与拦截器对比
- [Maven](/learn_backend/java/基础/Maven) —— 依赖管理与构建
- [JVM](/learn_backend/java/Java核心/JVM) —— 理解 Spring 运行时的内存与类加载
- [并发编程](/learn_backend/java/Java核心/并发编程) —— 异步请求与线程池模型
- [Gateway](/learn_backend/java/微服务/Gateway) —— 网关，与 Spring MVC 的 Filter 拦截对比
- [RESTful API](/learn_408/计算机网络/应用层/RESTful API) —— 接口设计风格，@PathVariable/@RequestMapping 的基础
- [GET 和 POST 请求的区别](/learn_408/计算机网络/应用层/GET和POST请求的区别) —— 参数绑定背后的 HTTP 基础
- [HTTP 协议的应用](/learn_408/计算机网络/应用层/HTTP协议的应用) —— 请求/响应、状态码、请求头
