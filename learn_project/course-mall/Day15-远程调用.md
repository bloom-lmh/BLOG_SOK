# Day 15 · 远程调用（OpenFeign + LoadBalancer + 边界契约）

> **今天目标**：用 OpenFeign 替代拆分前的跨模块 Mapper 调用。订单服务通过内部 API 查课程快照、扣减/回补库存；调用方只依赖 DTO 契约，不共享 Entity 或 Mapper。

## 一、拆分前后的变化

```text
拆分前：OrderService -> CourseMapper / StockService（Java 本地调用）
拆分后：OrderService -> CourseClient / StockClient -> HTTP -> mall-course / mall-stock
```

HTTP 边界带来四个新问题：超时、网络失败、身份传播和分布式一致性。OpenFeign 只解决“如何发 HTTP”，不会自动解决后三个问题。

## 二、依赖与启动配置

`mall-order/pom.xml`：

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
<!-- OpenFeign 中的 LoadBalancer 是可选集成，要显式引入 -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-loadbalancer</artifactId>
</dependency>
```

`mall-order` 成为独立应用后，删除对 `mall-course` 和 `mall-stock` 的 Maven 依赖，并启用 Feign：

```java
@EnableFeignClients(basePackages = "com.mall.order.client")
@MapperScan("com.mall.order.mapper")
@SpringBootApplication(scanBasePackages = "com.mall")
public class MallOrderApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallOrderApplication.class, args);
    }
}
```

```yaml
server:
  port: 8082

spring:
  application:
    name: mall-order
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_SERVER_ADDR:127.0.0.1:8848}
    openfeign:
      client:
        config:
          mall-course:
            connectTimeout: 1000
            readTimeout: 2000
          mall-stock:
            connectTimeout: 1000
            readTimeout: 2000
```

`@FeignClient(name = "mall-course")` 未设置 `url` 时，Spring Cloud LoadBalancer 才会根据服务名从 Nacos 获取实例。一旦写死 `url=http://localhost:8081`，就绕过了服务发现和负载均衡。

## 三、定义内部 API 契约

新建不启动的 `mall-contract` 模块，只放服务间稳定 DTO；提供方和消费方都依赖它。**不把 `Course` Entity 放进去**，否则数据库字段一改，所有服务都被迫跟着发版。

`mall-contract` 只需 `jakarta.validation-api`，父 pom 要将它加入 `<modules>` 和 `<dependencyManagement>`；`mall-course`、`mall-stock`、`mall-order` 各自依赖它。

```java
// mall-contract/src/main/java/com/mall/contract/course/CourseSnapshotDTO.java
package com.mall.contract.course;

import java.math.BigDecimal;

public record CourseSnapshotDTO(
        Long id,
        String title,
        String cover,
        BigDecimal price,
        Integer status) {
}
```

```java
// mall-contract/src/main/java/com/mall/contract/stock/StockChangeRequest.java
package com.mall.contract.stock;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record StockChangeRequest(
        @NotNull @Positive Long courseId,
        @NotNull @Positive Integer quantity,
        @NotBlank @Size(max = 64) String requestId) {
}
```

`requestId` 是库存写接口的幂等键：远程调用超时时，调用方并不知道下游到底有没有执行成功。

## 四、课程/库存服务提供内部端点

`mall-course` 使用真实数据库，不再写一份内存假课程：

```java
@Validated
@RestController
@RequestMapping("/internal/courses")
@RequiredArgsConstructor
public class InternalCourseController {
    private final CourseService courseService;

    @GetMapping("/{id}/snapshot")
    @PreAuthorize("isAuthenticated()")
    public Result<CourseSnapshotDTO> snapshot(@PathVariable @Positive Long id) {
        return Result.ok(courseService.getPurchasableSnapshot(id));
    }
}
```

```java
@Validated
@RestController
@RequestMapping("/internal/stocks")
@RequiredArgsConstructor
public class InternalStockController {
    private final StockService stockService;

    @PostMapping("/deductions")
    @PreAuthorize("isAuthenticated()")
    public Result<Void> deduct(@Valid @RequestBody StockChangeRequest request) {
        stockService.deduct(request.courseId(), request.quantity(), request.requestId());
        return Result.ok();
    }

    @PostMapping("/restorations")
    @PreAuthorize("isAuthenticated()")
    public Result<Void> restore(@Valid @RequestBody StockChangeRequest request) {
        stockService.restore(request.courseId(), request.quantity(), request.requestId());
        return Result.ok();
    }
}
```

`StockService` 必须用 `requestId` + 唯一索引记录已执行的扣减/回补，否则任何网络重试都可能重复扣库存。Day23 会用最终一致方案完善整条下单链路。

## 五、Feign Client

```java
package com.mall.order.client;

import com.mall.common.result.Result;
import com.mall.contract.course.CourseSnapshotDTO;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

@FeignClient(name = "mall-course", path = "/internal/courses")
public interface CourseClient {
    @GetMapping("/{id}/snapshot")
    Result<CourseSnapshotDTO> getSnapshot(@PathVariable("id") Long id);
}
```

```java
@FeignClient(name = "mall-stock", path = "/internal/stocks")
public interface StockClient {
    @PostMapping("/deductions")
    Result<Void> deduct(@RequestBody StockChangeRequest request);

    @PostMapping("/restorations")
    Result<Void> restore(@RequestBody StockChangeRequest request);
}
```

Feign 参数名要显式写在 `@PathVariable("id")` 中，不要依赖编译器是否保留参数名。

## 六、传播 Authorization 头

每个业务服务都要独立验证 JWT 并建立自己的 `SecurityContext`。Feign 调用时要把入站请求的 `Authorization` 原样传给下游：

```java
@Configuration
public class FeignAuthConfig {
    @Bean
    public RequestInterceptor authorizationRelayInterceptor() {
        return template -> {
            RequestAttributes attributes = RequestContextHolder.getRequestAttributes();
            if (!(attributes instanceof ServletRequestAttributes servletAttributes)) {
                return;
            }
            String authorization = servletAttributes.getRequest()
                    .getHeader(HttpHeaders.AUTHORIZATION);
            if (StringUtils.hasText(authorization)) {
                template.header(HttpHeaders.AUTHORIZATION, authorization);
            }
        };
    }
}
```

这个写法适用于同步 Servlet 调用。线程池、MQ 消费或定时任务没有用户请求上下文，需要单独的服务身份（OAuth2 Client Credentials/mTLS），不应伪造用户 Token。

## 七、改造订单业务

Day10 的 `OrderService` 删除 `CourseStockMapper` 和本地 `StockService` 注入，改为：

```java
private final CourseClient courseClient;
private final StockClient stockClient;

public OrderVO createOrder(Long userId, String requestId, CreateOrderRequest request) {
    CourseSnapshotDTO course = RemoteResult.unwrap(
            courseClient.getSnapshot(request.courseId()));
    if (!Integer.valueOf(1).equals(course.status())) {
        throw new BizException(ErrorCode.COURSE_OFFLINE);
    }

    // 价格/标题使用课程服务快照，绝不信任前端金额。
    stockClient.deduct(new StockChangeRequest(
            course.id(), 1, "deduct:" + requestId));
    // 然后创建订单和订单快照……
}
```

```java
public final class RemoteResult {
    private RemoteResult() {}

    public static <T> T unwrap(Result<T> result) {
        if (result == null || !Integer.valueOf(200).equals(result.getCode())) {
            throw new BizException(ErrorCode.SERVICE_UNAVAILABLE);
        }
        return result.getData();
    }
}
```

::: warning `@Transactional` 不能回滚远程库存
`mall-order` 的本地事务只管订单库。如果库存已扣减，订单入库随后失败，Spring 无法回滚另一个服务的事务。当前要在 `catch` 中用新的幂等键调回补接口作为过渡；Day21～23 改为可靠消息/分布式事务后，再形成完整最终一致链路。
:::

## 八、超时与重试原则

- `connectTimeout`：建立连接等待时间。
- `readTimeout`：连接建立后等待响应的时间。
- Feign 默认不重试。本课程**不开全局 `Retryer.Default`**，因为它会让扣库存等写请求被重复执行。
- 只对明确幂等的 GET，在熔断组件里做有界、带退避的重试。写请求要先完成幂等设计。

## 九、联调验收

```bash
mvn clean verify
mvn -pl mall-course spring-boot:run
mvn -pl mall-stock spring-boot:run
mvn -pl mall-order spring-boot:run
```

检查：

1. Nacos 能看到三个独立服务。
2. `mall-order` 的 Maven 依赖树中不再包含 `mall-course` / `mall-stock`。
3. 带 JWT 下单可以通过 Feign 查真实课程快照并扣库存。
4. 直接调内部接口不带 Token 返回 401，非法 DTO 返回参数错误。
5. 关闭 `mall-course`，订单服务在设定超时内失败，不会阻塞 60 秒。

## 十、知识点索引

| 知识点 | 文档 |
|---|---|
| OpenFeign、超时、请求头传播 | [OpenFeign](/learn_backend/java/微服务/OpenFeign) |
| Nacos + LoadBalancer | [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) |
| 幂等、最终一致性 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| `@Valid` / `@PreAuthorize` | [Spring Security](/learn_backend/java/基础/Spring Security) |

## 十一、✅ 完成后回填

- [ ] 服务间不共享 Entity/Mapper
- [ ] Feign + LoadBalancer 按服务名调用，未写死 URL
- [ ] 超时已显式配置，未对写接口开全局重试
- [ ] Authorization 可传到下游，下游 `@PreAuthorize` 生效
- [ ] 库存扣减/回补 DTO 有 `@Valid` 与幂等键

## 十二、面试追问

1. `@FeignClient(name = "mall-course")` 如何找到具体 IP 和端口？
2. 为什么微服务不应共享 Entity？DTO 契约如何做版本兼容？
3. `connectTimeout` 和 `readTimeout` 有什么区别？
4. 为什么不能给所有 Feign 调用开自动重试？
5. 为什么 `@Transactional` 无法回滚已经成功的远程库存扣减？
