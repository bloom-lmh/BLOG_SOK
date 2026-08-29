# Day 38 · 工作流实战（退款审批 + 大额分支 + 失败重试）

> **今天目标**：在 Day37 的 `mall-workflow` 中实现真实退款审批：用户申请 → 运营审核 → 大额主管复核 → 支付退款 → 订单更新 → 结果通知。

本日重点不是再学一次 Controller，而是处理三类真实问题：审批权限、外部退款幂等、流程与业务状态一致性。

## 一、退款流程

```text
用户申请
   |
运营审核 --拒绝--> 记录拒绝 --> 结束
   |
  通过
   |
金额 > 500 元？ --是--> 主管审批 --拒绝--> 记录拒绝 --> 结束
   |                         |
   否                       通过
   +-----------+-------------+
               |
       异步调用支付退款（失败重试）
               |
       更新订单 + 发布通知事件
               |
              结束
```

金额转换成“分”后再放流程变量，避免 BPMN 表达式里比较 double。500 元对应 `50000` 分。

`mall-workflow/pom.xml` 增加 Day21 已统一版本的 RocketMQ starter，供退款结果事件使用：

```xml
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-spring-boot-starter</artifactId>
    <version>2.3.1</version>
</dependency>
```

## 二、完整 BPMN

新建 `E:\CourseMall\mall-workflow\src\main\resources\processes\refund-approval.bpmn20.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:flowable="http://flowable.org/bpmn"
             targetNamespace="https://course-mall.example/process">
    <process id="refund-approval" name="退款审批流程" isExecutable="true">
        <startEvent id="start"/>
        <sequenceFlow id="f1" sourceRef="start" targetRef="operatorApproval"/>

        <userTask id="operatorApproval"
                  name="运营审核退款"
                  flowable:candidateGroups="ROLE_OPERATOR"/>
        <sequenceFlow id="f2" sourceRef="operatorApproval" targetRef="operatorDecision"/>

        <exclusiveGateway id="operatorDecision"/>
        <sequenceFlow id="operatorReject" sourceRef="operatorDecision" targetRef="rejectRefund">
            <conditionExpression xsi:type="tFormalExpression"><![CDATA[
                ${operatorApproved == false}
            ]]></conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="operatorPass" sourceRef="operatorDecision" targetRef="amountDecision">
            <conditionExpression xsi:type="tFormalExpression"><![CDATA[
                ${operatorApproved == true}
            ]]></conditionExpression>
        </sequenceFlow>

        <exclusiveGateway id="amountDecision"/>
        <sequenceFlow id="smallAmount" sourceRef="amountDecision" targetRef="executeRefund">
            <conditionExpression xsi:type="tFormalExpression"><![CDATA[
                ${refundAmountCents <= 50000}
            ]]></conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="largeAmount" sourceRef="amountDecision" targetRef="managerApproval">
            <conditionExpression xsi:type="tFormalExpression"><![CDATA[
                ${refundAmountCents > 50000}
            ]]></conditionExpression>
        </sequenceFlow>

        <userTask id="managerApproval"
                  name="主管复核大额退款"
                  flowable:candidateGroups="ROLE_ADMIN"/>
        <sequenceFlow id="f3" sourceRef="managerApproval" targetRef="managerDecision"/>

        <exclusiveGateway id="managerDecision"/>
        <sequenceFlow id="managerReject" sourceRef="managerDecision" targetRef="rejectRefund">
            <conditionExpression xsi:type="tFormalExpression"><![CDATA[
                ${managerApproved == false}
            ]]></conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="managerPass" sourceRef="managerDecision" targetRef="executeRefund">
            <conditionExpression xsi:type="tFormalExpression"><![CDATA[
                ${managerApproved == true}
            ]]></conditionExpression>
        </sequenceFlow>

        <serviceTask id="executeRefund"
                     name="执行支付退款"
                     flowable:async="true"
                     flowable:exclusive="true"
                     flowable:delegateExpression="${executeRefundDelegate}">
            <extensionElements>
                <flowable:failedJobRetryTimeCycle>R5/PT1M</flowable:failedJobRetryTimeCycle>
            </extensionElements>
        </serviceTask>
        <sequenceFlow id="f4" sourceRef="executeRefund" targetRef="notifySuccess"/>

        <serviceTask id="rejectRefund"
                     name="记录退款驳回"
                     flowable:delegateExpression="${rejectRefundDelegate}"/>
        <sequenceFlow id="f5" sourceRef="rejectRefund" targetRef="rejectedEnd"/>

        <serviceTask id="notifySuccess"
                     name="发布退款成功事件"
                     flowable:delegateExpression="${refundNotificationDelegate}"/>
        <sequenceFlow id="f6" sourceRef="notifySuccess" targetRef="successEnd"/>

        <endEvent id="successEnd" name="退款成功"/>
        <endEvent id="rejectedEnd" name="退款驳回"/>
    </process>
</definitions>
```

在 `application.yml` 将 `flowable.async-executor-activate` 改为 `true`。异步 ServiceTask 会产生 Job；失败后按 `R5/PT1M` 最多重试 5 次、每次间隔 1 分钟，最终进入死信表并触发告警。

## 三、业务接口契约

退款的订单所有权、支付状态和可退金额由 `mall-order` 判断，Flowable 不直接查订单库。

`client/OrderRefundClient.java`：

```java
package com.mall.workflow.client;

import com.mall.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@FeignClient(name = "mall-order", path = "/internal/refunds")
public interface OrderRefundClient {
    @PostMapping("/orders/{orderId}/apply")
    Result<RefundSnapshot> apply(
            @PathVariable Long orderId,
            @RequestParam Long userId,
            @RequestParam String reason);

    @PostMapping("/orders/{orderId}/rejected")
    Result<Void> markRejected(
            @PathVariable Long orderId,
            @RequestParam String reason);

    @PostMapping("/orders/{orderId}/succeeded")
    Result<Void> markSucceeded(@PathVariable Long orderId);

    record RefundSnapshot(
            Long orderId,
            String orderNo,
            Long userId,
            long refundAmountCents) {
    }
}
```

`client/PaymentRefundClient.java`：

```java
package com.mall.workflow.client;

import com.mall.common.result.Result;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient(name = "mall-payment", path = "/internal/payments")
public interface PaymentRefundClient {
    @PostMapping("/refunds")
    Result<RefundResult> refund(@RequestBody RefundCommand command);

    record RefundCommand(
            String idempotencyKey,
            String orderNo,
            long amountCents) {
    }

    record RefundResult(String refundNo, String status) {
    }
}
```

支付服务必须以 `idempotencyKey` 建唯一索引；Flowable Job 重试时重复请求只查询/返回同一笔退款，绝不能再次退款。

## 四、申请与审批 DTO

`dto/RefundApplyRequest.java`：

```java
package com.mall.workflow.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "退款申请请求")
public record RefundApplyRequest(
        @Schema(description = "订单 ID", example = "10001")
        @NotNull Long orderId,
        @Schema(description = "退款原因", example = "课程内容与描述不符")
        @NotBlank @Size(max = 500) String reason) {
}
```

`dto/RefundApprovalRequest.java`：

```java
package com.mall.workflow.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "退款审批请求")
public record RefundApprovalRequest(
        @Schema(description = "是否同意退款", example = "true")
        @NotNull Boolean approved,
        @Schema(description = "审批意见", example = "核实无误，同意退款")
        @Size(max = 500) String comment) {
}
```

## 五、退款流程 Service

`service/RefundWorkflowService.java`：

```java
package com.mall.workflow.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.security.ResourcePrincipal;
import com.mall.workflow.client.OrderRefundClient;
import com.mall.workflow.dto.RefundApplyRequest;
import com.mall.workflow.dto.RefundApprovalRequest;
import lombok.RequiredArgsConstructor;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class RefundWorkflowService {
    private static final String PROCESS_KEY = "refund-approval";

    private final RuntimeService runtimeService;
    private final TaskService taskService;
    private final OrderRefundClient orderClient;

    @Transactional
    public String apply(Long userId, RefundApplyRequest request) {
        String businessKey = "refund:order:" + request.orderId();
        if (runtimeService.createProcessInstanceQuery()
                .processDefinitionKey(PROCESS_KEY)
                .processInstanceBusinessKey(businessKey)
                .active()
                .count() > 0) {
            throw new BizException(ErrorCode.ORDER_REFUND_DENIED);
        }

        OrderRefundClient.RefundSnapshot snapshot = requireData(
                orderClient.apply(request.orderId(), userId, request.reason().trim()));
        Map<String, Object> variables = Map.of(
                "orderId", snapshot.orderId(),
                "orderNo", snapshot.orderNo(),
                "userId", snapshot.userId().toString(),
                "refundAmountCents", snapshot.refundAmountCents(),
                "applyReason", request.reason().trim());
        ProcessInstance instance = runtimeService.startProcessInstanceByKey(
                PROCESS_KEY, businessKey, variables);
        return instance.getId();
    }

    @Transactional
    public void approve(
            String taskId,
            RefundApprovalRequest request,
            Authentication authentication) {
        Task task = taskService.createTaskQuery().taskId(taskId).singleResult();
        if (task == null) {
            throw new BizException(ErrorCode.WORKFLOW_TASK_NOT_FOUND);
        }

        String requiredAuthority;
        String resultVariable;
        if ("operatorApproval".equals(task.getTaskDefinitionKey())) {
            requiredAuthority = "ROLE_OPERATOR";
            resultVariable = "operatorApproved";
        } else if ("managerApproval".equals(task.getTaskDefinitionKey())) {
            requiredAuthority = "ROLE_ADMIN";
            resultVariable = "managerApproved";
        } else {
            throw new BizException(ErrorCode.WORKFLOW_TASK_ACCESS_DENIED);
        }
        boolean allowed = authentication.getAuthorities().stream()
                .anyMatch(value -> requiredAuthority.equals(value.getAuthority()));
        if (!allowed) {
            throw new BizException(ErrorCode.WORKFLOW_TASK_ACCESS_DENIED);
        }

        ResourcePrincipal principal = (ResourcePrincipal) authentication.getPrincipal();
        if (task.getAssignee() == null) {
            taskService.claim(taskId, principal.id().toString());
        } else if (!task.getAssignee().equals(principal.id().toString())) {
            throw new BizException(ErrorCode.WORKFLOW_TASK_ACCESS_DENIED);
        }

        if (request.comment() != null && !request.comment().isBlank()) {
            taskService.addComment(
                    taskId, task.getProcessInstanceId(), request.comment().trim());
        }
        Map<String, Object> variables = new HashMap<>();
        variables.put(resultVariable, request.approved());
        variables.put(task.getTaskDefinitionKey() + "By", principal.id().toString());
        if (!request.approved()) {
            variables.put("rejectReason",
                    request.comment() == null || request.comment().isBlank()
                            ? "审批未通过"
                            : request.comment().trim());
        }
        taskService.complete(taskId, variables);
    }

    private <T> T requireData(com.mall.common.result.Result<T> result) {
        if (result == null || result.getData() == null) {
            throw new BizException(ErrorCode.SERVICE_UNAVAILABLE);
        }
        return result.getData();
    }
}
```

跨服务调用不可能与 Flowable 本地数据库组成一个普通 ACID 事务。Day38 采用“业务接口幂等 + 流程重试 + 状态对账”，而不是声称一个 `@Transactional` 能包住所有微服务。

## 六、三个 Delegate

`delegate/ExecuteRefundDelegate.java`：

```java
package com.mall.workflow.delegate;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.common.result.Result;
import com.mall.workflow.client.OrderRefundClient;
import com.mall.workflow.client.PaymentRefundClient;
import lombok.RequiredArgsConstructor;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

@Component("executeRefundDelegate")
@RequiredArgsConstructor
public class ExecuteRefundDelegate implements JavaDelegate {
    private final PaymentRefundClient paymentClient;
    private final OrderRefundClient orderClient;

    @Override
    public void execute(DelegateExecution execution) {
        Long orderId = longVariable(execution, "orderId");
        String orderNo = execution.getVariable("orderNo").toString();
        long amount = longVariable(execution, "refundAmountCents");
        String idempotencyKey = "flowable-refund:" + execution.getProcessInstanceId();

        Result<PaymentRefundClient.RefundResult> response = paymentClient.refund(
                new PaymentRefundClient.RefundCommand(idempotencyKey, orderNo, amount));
        PaymentRefundClient.RefundResult result = response == null ? null : response.getData();
        if (response == null || !Integer.valueOf(200).equals(response.getCode())
                || result == null || !"SUCCEEDED".equals(result.status())) {
            // 抛异常让 Flowable Job 重试，不要吞掉后继续到成功节点。
            throw new BizException(ErrorCode.PAYMENT_REFUND_FAILED);
        }
        Result<Void> orderResponse = orderClient.markSucceeded(orderId);
        if (orderResponse == null || !Integer.valueOf(200).equals(orderResponse.getCode())) {
            throw new BizException(ErrorCode.SERVICE_UNAVAILABLE);
        }
        execution.setVariable("refundNo", result.refundNo());
    }

    private long longVariable(DelegateExecution execution, String name) {
        return Long.parseLong(execution.getVariable(name).toString());
    }
}
```

`delegate/RejectRefundDelegate.java`：

```java
package com.mall.workflow.delegate;

import com.mall.workflow.client.OrderRefundClient;
import lombok.RequiredArgsConstructor;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

@Component("rejectRefundDelegate")
@RequiredArgsConstructor
public class RejectRefundDelegate implements JavaDelegate {
    private final OrderRefundClient orderClient;

    @Override
    public void execute(DelegateExecution execution) {
        Long orderId = Long.valueOf(execution.getVariable("orderId").toString());
        Object comment = execution.getVariable("rejectReason");
        orderClient.markRejected(orderId, comment == null ? "审批未通过" : comment.toString());
    }
}
```

`delegate/RefundNotificationDelegate.java`：

```java
package com.mall.workflow.delegate;

import com.mall.common.event.RefundSucceededEvent;
import lombok.RequiredArgsConstructor;
import org.apache.rocketmq.spring.core.RocketMQTemplate;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component("refundNotificationDelegate")
@RequiredArgsConstructor
public class RefundNotificationDelegate implements JavaDelegate {
    private final RocketMQTemplate rocketMQTemplate;

    @Override
    public void execute(DelegateExecution execution) {
        rocketMQTemplate.syncSend("refund-succeeded", new RefundSucceededEvent(
                execution.getProcessInstanceId(),
                Long.valueOf(execution.getVariable("orderId").toString()),
                execution.getVariable("orderNo").toString(),
                Long.valueOf(execution.getVariable("userId").toString()),
                execution.getVariable("refundNo").toString(),
                Instant.now()));
    }
}
```

新建
`E:\CourseMall\mall-common\src\main\java\com\mall\common\event\RefundSucceededEvent.java`：

```java
package com.mall.common.event;

import java.time.Instant;

public record RefundSucceededEvent(
        String eventId,
        Long orderId,
        String orderNo,
        Long userId,
        String refundNo,
        Instant succeededAt) {
}
```

Day32 的实时服务消费后向
`/user/queue/orders` 推送。通知失败不应回滚已经完成的第三方退款，生产用 Outbox 单独保证通知事件。

## 七、Controller 与历史轨迹

`controller/RefundWorkflowController.java`：

```java
package com.mall.workflow.controller;

import com.mall.common.result.Result;
import com.mall.security.ResourcePrincipal;
import com.mall.workflow.dto.RefundApplyRequest;
import com.mall.workflow.dto.RefundApprovalRequest;
import com.mall.workflow.service.RefundWorkflowService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/workflows/refunds")
@RequiredArgsConstructor
@Tag(name = "退款工作流", description = "退款申请与审批")
public class RefundWorkflowController {
    private final RefundWorkflowService workflowService;

    @Operation(summary = "发起退款申请")
    @PostMapping
    public Result<String> apply(
            @AuthenticationPrincipal ResourcePrincipal principal,
            @Valid @RequestBody RefundApplyRequest request) {
        return Result.ok(workflowService.apply(principal.id(), request));
    }

    @Operation(summary = "完成退款审批任务")
    @PostMapping("/tasks/{taskId}/complete")
    @PreAuthorize("hasAnyAuthority('ROLE_OPERATOR', 'ROLE_ADMIN')")
    public Result<Void> complete(
            @PathVariable String taskId,
            @Valid @RequestBody RefundApprovalRequest request,
            Authentication authentication) {
        workflowService.approve(taskId, request, authentication);
        return Result.ok();
    }
}
```

流程历史使用 `HistoryService.createHistoricTaskInstanceQuery()` 按
`processInstanceId` 查询，再用 `TaskService.getProcessInstanceComments()` 组合为时间线。对外查询前必须校验：申请人本人、审批角色或管理员；processInstanceId 也不能当作访问凭证。

## 八、故障演练与验收

必须跑四条路径：

1. 100 元：运营通过 → 直接退款成功。
2. 600 元：运营通过 → 主管通过 → 退款成功。
3. 运营/主管拒绝：不调用支付退款，订单进入 REFUND_REJECTED。
4. 支付服务暂时失败：Flowable Job 重试；恢复后同一 idempotencyKey 只产生一笔退款。

再验证：普通用户拿 taskId 无法审批；同订单不能启动两个活动退款流程；死信 Job 可在管理端看到并告警；订单状态与支付退款记录可通过定时对账修复。

::: tip 💡 面试题：为什么 Flowable 重试可能导致重复退款？
**一句话**：Job 可能在第三方已退款、但本地事务提交前失败，重试会再次调用第三方；因此退款命令必须携带稳定 idempotencyKey，支付服务和第三方渠道都按该键返回同一结果。
:::

## 九、知识点索引

| 知识点 | 本日实现 |
|---|---|
| 排他网关 | 审批结果、金额分支 |
| 异步 Job | 外部退款重试与死信 |
| 幂等 | processInstanceId 作为退款幂等键 |
| 跨服务一致性 | 重试、对账、状态机 |
| 权限 | 节点对应角色 + claim + 数据访问 |

## 十、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 小额、大额、拒绝三条流程均跑通：是 / 否
- [ ] 支付故障恢复后只退款一次：是 / 否
- [ ] 越权 taskId 被拒绝：是 / 否
- [ ] Flowable Job 重试与死信可观察：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：

## 十一、我下次会追问的问题

1. 为什么金额在流程变量里用“分”而不是 double？
2. Flowable 本地事务为什么管不到支付服务？
3. Job 重试如何与退款幂等配合？
4. 流程实例结束但通知失败，应该回滚退款吗？
5. 如何对账并修复订单状态与支付退款状态不一致？
