# Day 37 · Flowable 工作流入门（BPMN + 流程部署 + 任务审批）

> **今天目标**：把 Flowable 工作流引擎集成到项目里，跑通「定义流程 → 部署 → 启动实例 → 任务审批」全链路。

## 一、前置条件

- 已完成 Day 01~Day 30（至少项目骨架能跑通）

## 二、核心概念

### 工作流引擎解决什么问题

```
没有工作流：
  代码里写死 if/else 判断流程状态
  OrderService:
    if (status == "待审核") { ... }
    else if (status == "审核通过") { ... }
    else if (status == "已退款") { ... }
  → 流程变了要改代码、重新部署

有工作流：
  流程定义在 XML/BPMN 文件里，引擎负责流转
  代码只调用引擎 API：启动流程、完成任务、查询待办
  → 流程变了只改 BPMN 图，不改代码
```

### BPMN 是什么

BPMN（Business Process Model and Notation）是一种流程图标准，用图形描述业务流程。Flowable 解析 BPMN 文件，按图执行流程流转。

### 核心对象

| 对象 | 含义 | 类比 |
|---|---|---|
| **流程定义** (ProcessDefinition) | 流程的模板/BPMN 文件 | 类的 Class 对象 |
| **流程实例** (ProcessInstance) | 一次具体的流程运行 | `new` 出来的对象 |
| **任务** (Task) | 流程中需要人处理的节点 | 待办事项 |
| **执行** (Execution) | 流程流转的当前指针 | 程序计数器 |

## 三、步骤

### 步骤 1：添加依赖

```xml
<dependency>
    <groupId>org.flowable</groupId>
    <artifactId>flowable-spring-boot-starter</artifactId>
    <version>7.0.0</version>
</dependency>
```

Flowable 启动后会自动建 60+ 张内部表（`ACT_*`），不需要手动建。

### 步骤 2：画 BPMN 流程图——课程审核流程

在 `src/main/resources/processes/` 下创建 `course-review.bpmn20.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             targetNamespace="http://www.course-mall.com/flowable">

    <process id="course-review" name="课程审核流程" isExecutable="true">

        <startEvent id="start" name="开始"/>

        <!-- 讲师提交课程 -->
        <userTask id="submit-course" name="提交课程"
                  flowable:assignee="${teacherId}"/>

        <!-- 运营审核 -->
        <userTask id="review-course" name="运营审核"
                  flowable:candidateGroups="OPERATOR"/>

        <!-- 排他网关：审核结果分支 -->
        <exclusiveGateway id="review-gateway"/>

        <!-- 审核通过 → 上架 -->
        <serviceTask id="publish-course" name="上架课程"
                     flowable:delegateExpression="${publishCourseDelegate}"/>

        <!-- 审核不通过 → 通知讲师修改 -->
        <userTask id="modify-course" name="修改课程"
                  flowable:assignee="${teacherId}"/>

        <endEvent id="end-pass" name="审核通过"/>
        <endEvent id="end-reject" name="最终驳回"/>

        <!-- 连线 -->
        <sequenceFlow id="flow1" sourceRef="start" targetRef="submit-course"/>
        <sequenceFlow id="flow2" sourceRef="submit-course" targetRef="review-course"/>
        <sequenceFlow id="flow3" sourceRef="review-course" targetRef="review-gateway"/>
        <sequenceFlow id="flow4" sourceRef="review-gateway" targetRef="publish-course">
            <conditionExpression>${approved == true}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="flow5" sourceRef="review-gateway" targetRef="modify-course">
            <conditionExpression>${approved == false}</conditionExpression>
        </sequenceFlow>
        <sequenceFlow id="flow6" sourceRef="publish-course" targetRef="end-pass"/>
        <sequenceFlow id="flow7" sourceRef="modify-course" targetRef="review-course"/>
    </process>
</definitions>
```

### 步骤 3：流程 Service

`com/mall/user/service/WorkflowService.java`：

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkflowService {

    private final ProcessEngine processEngine;
    private final RuntimeService runtimeService;
    private final TaskService taskService;

    // 启动课程审核流程
    public String startCourseReview(Long courseId, Long teacherId) {
        Map<String, Object> variables = new HashMap<>();
        variables.put("courseId", courseId);
        variables.put("teacherId", String.valueOf(teacherId));

        // 启动流程实例，返回实例 ID
        ProcessInstance instance = runtimeService
            .startProcessInstanceByKey("course-review", variables);
        log.info("启动课程审核流程，实例ID：{}", instance.getId());
        return instance.getId();
    }

    // 查询某人的待办任务
    public List<TaskVO> getTodoTasks(String userId) {
        List<Task> tasks = taskService.createTaskQuery()
            .taskAssignee(userId)          // 直接指派给该用户的
            .or()
            .taskCandidateUser(userId)     // 或该用户是候选人
            .list();

        return tasks.stream().map(task -> {
            TaskVO vo = new TaskVO();
            vo.setTaskId(task.getId());
            vo.setTaskName(task.getName());
            vo.setProcessInstanceId(task.getProcessInstanceId());
            return vo;
        }).collect(Collectors.toList());
    }

    // 完成任务
    public void completeTask(String taskId, Map<String, Object> variables) {
        taskService.complete(taskId, variables);
        log.info("任务完成：{}", taskId);
    }
}
```

### 步骤 4：Controller

```java
@RestController
@RequestMapping("/api/workflow")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowService workflowService;

    // 讲师提交课程，启动审核流程
    @PostMapping("/course/{courseId}/submit")
    public Result<String> submitCourse(@PathVariable Long courseId) {
        Long teacherId = UserContext.getUserId();
        return Result.ok(workflowService.startCourseReview(courseId, teacherId));
    }

    // 运营查看待办任务
    @GetMapping("/todo")
    public Result<List<TaskVO>> todo() {
        return Result.ok(workflowService.getTodoTasks(UserContext.getUserIdStr()));
    }

    // 完成审核任务
    @PostMapping("/task/{taskId}/complete")
    public Result<Void> complete(@PathVariable String taskId,
                                 @RequestBody Map<String, Object> variables) {
        workflowService.completeTask(taskId, variables);
        return Result.ok();
    }
}
```

### 步骤 5：ServiceTask——自动上架

```java
@Component("publishCourseDelegate")
public class PublishCourseDelegate implements JavaDelegate {
    @Override
    public void execute(DelegateExecution execution) {
        Long courseId = (Long) execution.getVariable("courseId");
        // 调用课程服务：审核通过 → 自动上架
        courseService.publish(courseId);
        log.info("课程 {} 审核通过，自动上架", courseId);
    }
}
```

::: tip 💡 面试题：工作流引擎的核心价值是什么？
**一句话**：把业务流程从代码里抽出来，变成可配置的 BPMN 图。流程变了只改图不改代码，业务人员也能看懂流程。同时引擎自动记录流程轨迹（谁在什么时候做了什么），天然支持审计和追溯。
:::

::: tip 💡 面试题：Flowable 和 Activiti 有什么区别？
**一句话**：Flowable 是 Activiti 核心团队出走后的分支，API 几乎一样。Flowable 更活跃、bug 更少、7.x 版本支持微服务编排。国内用 Flowable 的越来越多，选型优先 Flowable。
:::

## 四、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 流程定义部署成功，Flowable 表自动建好：是 / 否
- [ ] 启动审核流程 → 完成审批任务 → 流程流转正常：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：