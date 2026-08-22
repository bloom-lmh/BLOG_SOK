# Quartz 分布式定时任务

> **一句话定位**：Quartz 是一个功能丰富的**分布式任务调度框架**，解决 `@Scheduled` 的局限——多实例重复执行、运行时动态管理、持久化、失败重试。

---

## 目录

- [一、什么时候需要 Quartz](#一什么时候需要-quartz)
- [二、引入依赖](#二引入依赖)
- [三、核心概念](#三核心概念)
- [四、完整示例](#四完整示例)
- [五、动态管理](#五动态管理运行时修改暂停恢复)
- [六、集群模式](#六集群模式多实例不重复执行)
- [七、@Scheduled vs Quartz 怎么选](#七scheduled-vs-quartz-怎么选)

---

## 一、什么时候需要 Quartz

`@Scheduled` 的局限：

| 问题 | @Scheduled | Quartz |
| --- | --- | --- |
| 多实例重复执行 | ❌ 每个实例都执行，需自己加分布式锁 | ✅ 集群模式，任务只在一个节点执行 |
| 动态管理 | ❌ 写死在代码里，改 cron 要重启 | ✅ 运行时暂停/恢复/修改/删除 |
| 持久化 | ❌ 重启后丢任务信息 | ✅ 任务信息存数据库，重启不丢 |
| 失败重试 | ❌ 没内置机制 | ✅ 配置失败后自动重试 |

**典型场景：** 定时生成报表、定时对账、定时清理过期数据——这些任务不能每个实例都跑一遍，也不能改了 cron 就重启。

---

## 二、引入依赖

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-quartz</artifactId>
</dependency>
```

---

## 三、核心概念

```
Job        = 要执行的任务（你的业务逻辑）
Trigger    = 什么时候执行（Cron 表达式 / 简单间隔）
Scheduler  = 调度器，管理 Job + Trigger 的注册和运行
JobDetail  = Job 的详细信息（名字、分组、参数）
```

---

## 四、完整示例

```java
// 第一步：定义 Job（任务逻辑）
public class ReportJob implements QuartzJobBean {

    @Autowired
    private ReportService reportService;

    @Override
    protected void executeInternal(JobExecutionContext context) {
        // 定时生成的业务逻辑
        reportService.generateDailyReport();
    }
}
```

```java
// 第二步：配置 JobDetail + Trigger
@Configuration
public class QuartzConfig {

    @Bean
    public JobDetail reportJobDetail() {
        return JobBuilder.newJob(ReportJob.class)
                .withIdentity("dailyReport", "reportGroup")  // 名字 + 分组
                .storeDurably()                              // 没有 Trigger 时也保留
                .build();
    }

    @Bean
    public Trigger reportTrigger() {
        return TriggerBuilder.newTrigger()
                .forJob(reportJobDetail())                    // 绑定哪个 Job
                .withIdentity("dailyReportTrigger", "reportGroup")
                .withSchedule(CronScheduleBuilder.cronSchedule("0 0 2 * * ?"))  // 每天凌晨2点
                .build();
    }
}
```

---

## 五、动态管理（运行时修改/暂停/恢复）

```java
@Service
public class QuartzService {

    private final Scheduler scheduler;

    public QuartzService(Scheduler scheduler) {
        this.scheduler = scheduler;
    }

    // 暂停任务
    public void pauseJob(String name, String group) {
        scheduler.pauseJob(JobKey.jobKey(name, group));
    }

    // 恢复任务
    public void resumeJob(String name, String group) {
        scheduler.resumeJob(JobKey.jobKey(name, group));
    }

    // 修改 cron 表达式（不重启，立即生效）
    public void reschedule(String triggerName, String triggerGroup, String cron) {
        TriggerKey key = TriggerKey.triggerKey(triggerName, triggerGroup);
        Trigger newTrigger = TriggerBuilder.newTrigger()
                .withIdentity(key)
                .withSchedule(CronScheduleBuilder.cronSchedule(cron))
                .build();
        scheduler.rescheduleJob(key, newTrigger);  // 替换旧触发器
    }

    // 删除任务
    public void deleteJob(String name, String group) {
        scheduler.deleteJob(JobKey.jobKey(name, group));
    }
}
```

---

## 六、集群模式（多实例不重复执行）

Quartz 集群通过数据库表实现任务抢占：

```yaml
spring:
  quartz:
    job-store-type: jdbc          # 任务信息存数据库
    jdbc:
      initialize-schema: always   # 自动建 Quartz 需要的 11 张表
    properties:
      org.quartz.scheduler:
        instanceName: ClusterScheduler
        instanceId: AUTO           # 自动生成实例 ID
      org.quartz.jobStore:
        class: org.quartz.impl.jdbcjobstore.JobStoreTX
        driverDelegateClass: org.quartz.impl.jdbcjobstore.StdJDBCDelegate
        isClustered: true         # 开启集群模式
        clusterCheckinInterval: 20000  # 20 秒检查一次集群状态
```

**集群原理：** 多个实例共用一个数据库，每个实例定期更新自己的心跳时间（`QRTZ_SCHEDULER_STATE` 表）。任务触发时，实例尝试获取数据库锁（`QRTZ_LOCKS` 表），谁拿到锁谁执行，其他实例跳过。

---

## 七、@Scheduled vs Quartz 怎么选

| 场景 | 选哪个 |
| --- | --- |
| 单机、定时固定、不改 crontab | `@Scheduled` |
| 多实例、需要管理界面、改 crontab 不重启 | Quartz |
| 简单任务、不想引入数据库 | `@Scheduled` |
| 失败后要重试、任务之间有依赖 | Quartz |

---

## 相关知识

- [Cron 表达式](Spring%20Boot#72-cron-表达式完全指南) — Spring Boot 定时任务的 Cron 写法
- [Spring Boot 定时任务](Spring%20Boot#7-定时任务) — `@Scheduled` 基础用法