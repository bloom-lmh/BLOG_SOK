# Day 37 · Flowable 入门（可部署 BPMN + 待办 + 安全审批）

> **今天目标**：新增 `mall-workflow:8090`，跑通“课程提交审核 → 运营审批 → 通过后上架/驳回”完整流程，并保证 taskId 不能成为越权审批凭证。

工作流引擎保存的是流程状态和审计轨迹，业务数据库仍保存课程真实状态。Flowable 不是用来替代所有 `if/else`，而是处理跨角色、长时间、需要追踪和经常调整的流程。

## 一、新建模块

`E:\CourseMall\pom.xml` 增加：

```xml
<module>mall-workflow</module>
```

`E:\CourseMall\mall-workflow\pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>com.mall</groupId>
        <artifactId>course-mall</artifactId>
        <version>1.0.0</version>
    </parent>
    <artifactId>mall-workflow</artifactId>
    <dependencies>
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-security</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <dependency>
            <groupId>org.flowable</groupId>
            <artifactId>flowable-spring-boot-starter-process</artifactId>
            <version>${flowable.version}</version>
        </dependency>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-openfeign</artifactId>
        </dependency>
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
        </dependency>
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <scope>provided</scope>
        </dependency>
    </dependencies>
</project>
```

父 POM properties 统一声明版本，子模块不要自行漂移：

```xml
<flowable.version>7.0.0</flowable.version>
```

`MallWorkflowApplication.java` 使用 `@SpringBootApplication(scanBasePackages = "com.mall")` 和 `@EnableFeignClients`。配置：

```yaml
server:
  port: 8090
spring:
  application:
    name: mall-workflow
  datasource:
    url: jdbc:mysql://127.0.0.1:3306/course_mall_workflow?useUnicode=true&characterEncoding=UTF-8&serverTimezone=Asia/Shanghai&nullCatalogMeansCurrent=true
    username: ${MYSQL_USERNAME}
    password: ${MYSQL_PASSWORD}
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_ADDR:127.0.0.1:8848}
flowable:
  database-schema-update: true
  async-executor-activate: false
  process-definition-location-prefix: classpath*:/processes/
jwt:
  secret: ${JWT_SECRET}
security:
  resource:
    enabled: true
```

开发环境可让 Flowable 自动建 `ACT_*` 表；生产环境应使用官方 SQL/Flyway 管理版本，将 `database-schema-update` 设为 `false`，避免应用启动时擅自改库。

## 二、可直接部署的 BPMN

新建 `E:\CourseMall\mall-workflow\src\main\resources\processes\course-review.bpmn20.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="https://course-mall.example/process">
    <process id="course-review" name="课程审核流程" isExecutable="true">
        <startEvent id="start" name="开始"/>
        <sequenceFlow id="f1" sourceRef="start" targetRef="operatorReview"/>

        <userTask id="operatorReview"
                  name="运营审核课程"
                  flowable:candidateGroups="ROLE_OPERATOR"/>
        <sequenceFlow id="f2" sourceRef="operatorReview" targetRef="decision"/>

        <exclusiveGateway id="decision" name="审核结果"/>
        <sequenceFlow id="approvedFlow" sourceRef="decision" targetRef="publishCourse">
            <conditionExpression xsi:type="tFormalExpression"><![CDATA[
                ${approved == true}
            ]]></conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="rejectedFlow" sourceRef="decision" targetRef="rejectedEnd">
            <conditionExpression xsi:type="tFormalExpression"><![CDATA[
                ${approved == false}
            ]]></conditionExpression>
        </sequenceFlow>

        <serviceTask id="publishCourse"
                     name="自动上架课程"
                     flowable:delegateExpression="${publishCourseDelegate}"/>
        <sequenceFlow id="f3" sourceRef="publishCourse" targetRef="approvedEnd"/>

        <endEvent id="approvedEnd" name="审核通过"/>
        <endEvent id="rejectedEnd" name="审核驳回"/>
    </process>
</definitions>
```

用户已经通过 HTTP 提交课程，所以流程启动后直接进入“运营审核”，不再额外创建一个“讲师提交”待办。BPMN 中的候选组必须与 JWT 的 authority 命名一致，本项目统一使用 `ROLE_OPERATOR`。

## 三、DTO 与待办 VO

`dto/CompleteCourseReviewRequest.java`：

```java
package com.mall.workflow.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "完成课程审核任务请求")
public record CompleteCourseReviewRequest(
        @Schema(description = "是否审核通过", example = "true")
        @NotNull(message = "{validation.workflow.approved.not-null}") Boolean approved,
        @Schema(description = "审核意见", example = "内容完整，同意上架")
        @Size(max = 500, message = "{validation.workflow.comment.size}") String comment) {
}
```

`vo/WorkflowTaskVO.java`：

```java
package com.mall.workflow.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

@Schema(description = "工作流待办任务")
public record WorkflowTaskVO(
        @Schema(description = "任务 ID")
        String taskId,
        @Schema(description = "BPMN 节点 Key")
        String taskDefinitionKey,
        @Schema(description = "任务名称")
        String taskName,
        @Schema(description = "流程实例 ID")
        String processInstanceId,
        @Schema(description = "业务键")
        String businessKey,
        @Schema(description = "任务创建时间")
        Instant createTime) {
}
```

## 四、课程服务内部客户端

`client/CourseWorkflowClient.java`：

```java
package com.mall.workflow.client;

import com.mall.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "mall-course", path = "/internal/courses")
public interface CourseWorkflowClient {
    @PostMapping("/{courseId}/mark-reviewing")
    Result<Void> markReviewing(
            @PathVariable Long courseId,
            @RequestParam Long teacherId);

    @PostMapping("/{courseId}/publish-after-review")
    Result<Void> publishAfterReview(@PathVariable Long courseId);

    @PostMapping("/{courseId}/reject-after-review")
    Result<Void> rejectAfterReview(@PathVariable Long courseId);
}
```

这三个内部接口必须由 Day16 的内部服务鉴权保护，并按“当前状态 + courseId”幂等更新。工作流重试调用 publish 时，第二次应返回成功而不是重复副作用。

## 五、启动流程、查询待办、完成审批

`service/CourseReviewWorkflowService.java`：

```java
package com.mall.workflow.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.security.ResourcePrincipal;
import com.mall.workflow.client.CourseWorkflowClient;
import com.mall.workflow.dto.CompleteCourseReviewRequest;
import com.mall.workflow.vo.WorkflowTaskVO;
import lombok.RequiredArgsConstructor;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CourseReviewWorkflowService {
    private static final String PROCESS_KEY = "course-review";
    private static final String REVIEW_TASK = "operatorReview";

    private final RuntimeService runtimeService;
    private final TaskService taskService;
    private final HistoryService historyService;
    private final CourseWorkflowClient courseClient;

    @Transactional
    public String start(Long courseId, Long teacherId) {
        String businessKey = "course:" + courseId;
        long running = runtimeService.createProcessInstanceQuery()
                .processDefinitionKey(PROCESS_KEY)
                .processInstanceBusinessKey(businessKey)
                .active()
                .count();
        if (running > 0) {
            throw new BizException(ErrorCode.CONFLICT);
        }

        courseClient.markReviewing(courseId, teacherId);
        Map<String, Object> variables = Map.of(
                "courseId", courseId,
                "teacherId", teacherId.toString());
        ProcessInstance instance = runtimeService.startProcessInstanceByKey(
                PROCESS_KEY, businessKey, variables);
        return instance.getId();
    }

    public List<WorkflowTaskVO> todo(Authentication authentication) {
        List<String> groups = authentication.getAuthorities().stream()
                .map(Object::toString)
                .toList();
        List<Task> tasks = taskService.createTaskQuery()
                .taskCandidateGroupIn(groups)
                .active()
                .orderByTaskCreateTime()
                .desc()
                .list();
        return tasks.stream().map(this::toVO).toList();
    }

    @Transactional
    public void complete(
            String taskId,
            CompleteCourseReviewRequest request,
            Authentication authentication) {
        Task task = taskService.createTaskQuery().taskId(taskId).singleResult();
        if (task == null) {
            throw new BizException(ErrorCode.WORKFLOW_TASK_NOT_FOUND);
        }
        if (!REVIEW_TASK.equals(task.getTaskDefinitionKey())) {
            throw new BizException(ErrorCode.WORKFLOW_TASK_ACCESS_DENIED);
        }
        assertCandidate(authentication, task);

        ResourcePrincipal principal = (ResourcePrincipal) authentication.getPrincipal();
        if (task.getAssignee() == null) {
            // claim 是带并发控制的；被其他人抢先签收会失败。
            taskService.claim(taskId, principal.id().toString());
        } else if (!task.getAssignee().equals(principal.id().toString())) {
            throw new BizException(ErrorCode.WORKFLOW_TASK_ACCESS_DENIED);
        }

        if (request.comment() != null && !request.comment().isBlank()) {
            taskService.addComment(
                    taskId,
                    task.getProcessInstanceId(),
                    request.comment().trim());
        }
        Map<String, Object> variables = new HashMap<>();
        variables.put("approved", request.approved());
        variables.put("reviewerId", principal.id().toString());
        taskService.complete(taskId, variables);

        if (!request.approved()) {
            Long courseId = (Long) runtimeOrHistoryVariable(
                    task.getProcessInstanceId(), "courseId");
            courseClient.rejectAfterReview(courseId);
        }
    }

    private void assertCandidate(Authentication authentication, Task task) {
        boolean operator = authentication.getAuthorities().stream()
                .anyMatch(value -> "ROLE_OPERATOR".equals(value.getAuthority()));
        if (!operator) {
            throw new BizException(ErrorCode.WORKFLOW_TASK_ACCESS_DENIED);
        }
    }

    private Object runtimeOrHistoryVariable(String processInstanceId, String name) {
        Object value = runtimeService.getVariable(processInstanceId, name);
        if (value != null) {
            return value;
        }
        return historyService.createHistoricVariableInstanceQuery()
                .processInstanceId(processInstanceId)
                .variableName(name)
                .singleResult()
                .getValue();
    }

    private WorkflowTaskVO toVO(Task task) {
        ProcessInstance instance = runtimeService.createProcessInstanceQuery()
                .processInstanceId(task.getProcessInstanceId())
                .singleResult();
        return new WorkflowTaskVO(
                task.getId(),
                task.getTaskDefinitionKey(),
                task.getName(),
                task.getProcessInstanceId(),
                instance == null ? null : instance.getBusinessKey(),
                task.getCreateTime().toInstant());
    }
}
```

候选组查询不是授权本身。完成任务时还要重新取 Task、检查节点类型、角色和 assignee；否则知道 taskId 的任意登录用户都可能审批。

### 自动上架 Delegate

`delegate/PublishCourseDelegate.java`：

```java
package com.mall.workflow.delegate;

import com.mall.workflow.client.CourseWorkflowClient;
import lombok.RequiredArgsConstructor;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

@Component("publishCourseDelegate")
@RequiredArgsConstructor
public class PublishCourseDelegate implements JavaDelegate {
    private final CourseWorkflowClient courseClient;

    @Override
    public void execute(DelegateExecution execution) {
        Object value = execution.getVariable("courseId");
        courseClient.publishAfterReview(Long.valueOf(value.toString()));
    }
}
```

远程调用失败就抛异常，让 Flowable 当前事务回滚，流程仍停在服务任务前。生产可启用异步 Job、重试次数与死信告警，不能 catch 后假装流程完成。

## 六、Controller

`controller/CourseReviewWorkflowController.java`：

```java
package com.mall.workflow.controller;

import com.mall.common.result.Result;
import com.mall.security.ResourcePrincipal;
import com.mall.workflow.dto.CompleteCourseReviewRequest;
import com.mall.workflow.service.CourseReviewWorkflowService;
import com.mall.workflow.vo.WorkflowTaskVO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/workflows/course-reviews")
@RequiredArgsConstructor
@Tag(name = "课程审核工作流", description = "课程提审、待办查询和审批")
public class CourseReviewWorkflowController {
    private final CourseReviewWorkflowService workflowService;

    @Operation(summary = "发起课程审核流程")
    @PostMapping("/{courseId}")
    @PreAuthorize("hasAnyAuthority('ROLE_TEACHER', 'ROLE_ADMIN')")
    public Result<String> start(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @PathVariable Long courseId) {
        return Result.ok(workflowService.start(courseId, principal.id()));
    }

    @Operation(summary = "查询我的课程审核待办")
    @GetMapping("/tasks")
    @PreAuthorize("hasAuthority('ROLE_OPERATOR')")
    public Result<List<WorkflowTaskVO>> todo(Authentication authentication) {
        return Result.ok(workflowService.todo(authentication));
    }

    @Operation(summary = "完成课程审核任务")
    @PostMapping("/tasks/{taskId}/complete")
    @PreAuthorize("hasAuthority('ROLE_OPERATOR')")
    public Result<Void> complete(
            @PathVariable String taskId,
            @Valid @RequestBody CompleteCourseReviewRequest request,
            Authentication authentication) {
        workflowService.complete(taskId, request, authentication);
        return Result.ok();
    }
}
```

Gateway 路由：

```yaml
- id: mall-workflow-api
  uri: lb://mall-workflow
  predicates:
    - Path=/api/workflows/**
```

## 七、验收

1. 启动后 `ACT_RE_PROCDEF` 有 `course-review` 定义。
2. 讲师提交后只有一个运行实例，重复提交返回冲突。
3. 普通用户查询/完成审批均为 403。
4. 两名运营并发 claim，同一任务最多一人成功。
5. 审核通过调用课程服务上架；远程服务失败时流程不结束。
6. 驳回后课程状态同步为“审核驳回”，历史中保留评论和 reviewerId。

::: tip 💡 面试题：流程变量和业务表是什么关系？
**一句话**：流程变量服务于路由和流程上下文，业务表才是业务事实；两者通过 businessKey 关联。不能把完整订单/课程对象长期塞进流程变量，否则数据重复、序列化脆弱且难保持一致。
:::

## 八、知识点索引

| 知识点 | 本日实现 |
|---|---|
| 流程定义/实例/任务 | BPMN、RuntimeService、TaskService |
| 业务关联 | `businessKey=course:{id}` |
| 候选组与签收 | candidateGroups + claim |
| 安全审批 | 角色、节点、assignee 三次检查 |
| 服务任务 | JavaDelegate 调幂等内部接口 |

## 九、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] BPMN 自动部署且无 XML 解析错误：是 / 否
- [ ] 重复启动同课程流程被拦截：是 / 否
- [ ] 非候选人无法凭 taskId 审批：是 / 否
- [ ] 通过、驳回和远程失败三条路径均验证：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：

## 十、我下次会追问的问题

1. 流程定义、实例、执行、任务分别是什么？
2. businessKey 为什么比只保存 processInstanceId 更好查？
3. candidateGroup、claim、assignee 分别代表什么？
4. 为什么 `@PreAuthorize` 后 Service 还要检查 Task？
5. JavaDelegate 远程调用如何做到可重试且幂等？
