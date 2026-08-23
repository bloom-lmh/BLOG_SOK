# Day 38 · 工作流实战（课程审核 + 退款审批）

> **今天目标**：用 Day37 的 Flowable 基础，实现两个完整业务流程：① 课程上架审核（讲师提交 → 运营审核 → 上架/驳回）；② 退款审批（用户申请 → 审核 → 退款/拒绝）。

## 一、前置条件

- 已完成 Day 37（Flowable 基础能跑通）

## 二、步骤

### 步骤 1：退款审批流程 BPMN

`src/main/resources/processes/refund-approve.bpmn20.xml`：

```xml
<process id="refund-approve" name="退款审批流程" isExecutable="true">

    <startEvent id="start"/>

    <!-- 用户提交退款申请 -->
    <userTask id="apply-refund" name="申请退款"
              flowable:assignee="${userId}"/>

    <!-- 运营审核 -->
    <userTask id="approve-refund" name="审核退款"
              flowable:candidateGroups="OPERATOR"/>

    <!-- 金额分支：超过 500 需要主管审批 -->
    <exclusiveGateway id="amount-gateway"/>

    <!-- 主管审批（大额退款） -->
    <userTask id="manager-approve" name="主管审批"
              flowable:candidateGroups="ADMIN"/>

    <!-- 自动退款 -->
    <serviceTask id="auto-refund" name="自动退款"
                 flowable:delegateExpression="${refundDelegate}"/>

    <!-- 通知用户 -->
    <serviceTask id="notify-user" name="通知用户"
                 flowable:delegateExpression="${notifyDelegate}"/>

    <endEvent id="end-pass" name="退款成功"/>
    <endEvent id="end-reject" name="退款驳回"/>

    <sequenceFlow id="f1" sourceRef="start" targetRef="apply-refund"/>
    <sequenceFlow id="f2" sourceRef="apply-refund" targetRef="approve-refund"/>
    <sequenceFlow id="f3" sourceRef="approve-refund" targetRef="amount-gateway"/>
    <sequenceFlow id="f4" sourceRef="amount-gateway" targetRef="manager-approve">
        <conditionExpression>${amount > 500}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="f5" sourceRef="amount-gateway" targetRef="auto-refund">
        <conditionExpression>${amount <= 500}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="f6" sourceRef="manager-approve" targetRef="auto-refund">
        <conditionExpression>${approved == true}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="f7" sourceRef="manager-approve" targetRef="end-reject">
        <conditionExpression>${approved == false}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="f8" sourceRef="auto-refund" targetRef="notify-user"/>
    <sequenceFlow id="f9" sourceRef="notify-user" targetRef="end-pass"/>
</process>
```

### 步骤 2：退款流程 Service

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class RefundWorkflowService {

    private final RuntimeService runtimeService;
    private final TaskService taskService;
    private final OrderService orderService;

    // 用户发起退款申请
    public String startRefund(Long orderId, Long userId, String reason) {
        Orders order = orderService.getById(orderId);

        Map<String, Object> variables = new HashMap<>();
        variables.put("orderId", orderId);
        variables.put("userId", String.valueOf(userId));
        variables.put("amount", order.getTotalAmount().doubleValue());
        variables.put("reason", reason);

        ProcessInstance instance = runtimeService
            .startProcessInstanceByKey("refund-approve", variables);

        // 自动完成「申请退款」节点（用户已经提交了申请）
        Task applyTask = taskService.createTaskQuery()
            .processInstanceId(instance.getId())
            .taskAssignee(String.valueOf(userId))
            .singleResult();
        taskService.complete(applyTask.getId());

        log.info("退款流程启动，订单：{}，实例ID：{}", orderId, instance.getId());
        return instance.getId();
    }

    // 审核退款
    public void approveRefund(String taskId, boolean approved, String comment) {
        Map<String, Object> variables = new HashMap<>();
        variables.put("approved", approved);
        variables.put("comment", comment);
        taskService.recordTaskComment(taskId, comment);
        taskService.complete(taskId, variables);
    }

    // 查询流程进度
    public List<CommentVO> getProcessHistory(String processInstanceId) {
        // 历史任务
        List<HistoricTaskInstance> tasks = historyService
            .createHistoricTaskInstanceQuery()
            .processInstanceId(processInstanceId)
            .finished()
            .orderByHistoricTaskInstanceEndTime().asc()
            .list();

        return tasks.stream().map(task -> new CommentVO(
            task.getName(),
            task.getAssignee(),
            task.getEndTime()
        )).collect(Collectors.toList());
    }
}
```

### 步骤 3：自动退款 Delegate

```java
@Component("refundDelegate")
@RequiredArgsConstructor
public class RefundDelegate implements JavaDelegate {

    private final OrderService orderService;
    private final PaymentService paymentService;

    @Override
    public void execute(DelegateExecution execution) {
        Long orderId = (Long) execution.getVariable("orderId");
        // 调用第三方支付退款接口
        paymentService.refund(orderId);
        // 更新订单状态
        orderService.updateStatus(orderId, 3); // 3 = 已退款
        log.info("订单 {} 退款成功", orderId);
    }
}
```

### 步骤 4：通知用户 Delegate

```java
@Component("notifyDelegate")
@RequiredArgsConstructor
public class NotifyDelegate implements JavaDelegate {

    private final SimpMessagingTemplate messagingTemplate;

    @Override
    public void execute(DelegateExecution execution) {
        Long orderId = (Long) execution.getVariable("orderId");
        // WebSocket 实时推送退款结果
        messagingTemplate.convertAndSendToUser(
            String.valueOf(execution.getVariable("userId")),
            "/queue/order",
            "订单 " + orderId + " 退款处理完成"
        );
    }
}
```

### 步骤 5：退款审批 Controller

```java
@RestController
@RequestMapping("/api/refund")
@RequiredArgsConstructor
public class RefundController {

    private final RefundWorkflowService refundWorkflowService;

    // 用户申请退款
    @PostMapping("/apply")
    public Result<String> applyRefund(@RequestBody RefundApplyDTO dto) {
        return Result.ok(refundWorkflowService.startRefund(
            dto.getOrderId(), UserContext.getUserId(), dto.getReason()));
    }

    // 运营审核退款
    @PostMapping("/approve")
    public Result<Void> approveRefund(@RequestBody RefundApproveDTO dto) {
        refundWorkflowService.approveRefund(dto.getTaskId(), dto.getApproved(), dto.getComment());
        return Result.ok();
    }

    // 查看流程进度
    @GetMapping("/progress/{processInstanceId}")
    public Result<List<CommentVO>> progress(@PathVariable String processInstanceId) {
        return Result.ok(refundWorkflowService.getProcessHistory(processInstanceId));
    }
}
```

::: tip 💡 面试题：工作流引擎如何保证流程不丢不重？
**一句话**：Flowable 所有流程状态持久化在 `ACT_*` 表里（每个节点流转都写数据库事务），服务挂了重启后从数据库恢复流程状态。任务完成和流程流转在同一个事务里，要么都成功要么都回滚，不会出现「任务完成了但流程没流转」的情况。
:::

::: tip 💡 面试题：工作流中的排他网关（ExclusiveGateway）和并行网关有什么区别？
**一句话**：排他网关是「走一条」（条件分支，只走满足条件的那条路），并行网关是「同时走多条」（多个分支并发执行，全部完成后汇合再继续）。退款审批里金额分支用排他网关，因为只需要走一条审批路径。
:::

## 三、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 退款申请 → 审核 → 自动退款全流程跑通：是 / 否
- [ ] 金额分支（大额走主管审批）正确：是 / 否
- [ ] 流程进度查询正常：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：