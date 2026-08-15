# [代码交接code relay](https://github.com/yan5xu/code-relay)

> 一句话理解：给 AI Agent 搭一个可恢复上下文、可交接、可控权限、支持多仓库的工作环境，相当于外化的工作记录，用于缓解其内部的上下文压力

## 什么是code relay

其实就是一个`agent`的工作日志，交班说明，其作用在于

1. 防失忆：AI 每次新开会话都会忘记之前做过什么。`Code Relay` 用 `HANDOFF.md` / `CHECKPOINT.md` 这类文件，把当前进度、下一步、注意事项保存下来。
2. 防上下文爆掉：对话太长时，很多 `Agent` 会自动压缩上下文，重要信息可能丢失。`Code Relay` 不靠自动压缩，而是主动写交接文档，让上下文可控。
3. 让 AI 有固定工作流：AI 不再是你问一句它做一句，而是知道：
    - 启动先读什么
    - 任务定义在哪里
    - 进度记在哪里
    - 结束时要怎么交接
4. 支持多仓库一起看：不只是看一个 `repo`。它可以把前端、后端、脚本、基础设施等多个仓库组织在一个工作区里，让 AI 知道它们之间的关系。

## 几个核心概念

1. `Boot Sequence`：AI 启动后先按顺序读配置。相当于开机自检 + 恢复现场。
2. `HANDOFF / CHECKPOINT`：就是交接文档。当一次会话做不完，就把当前状态写进去，下次继续读它。
3. `SCOPE`：限定 AI 允许写哪些文件。防止它乱改不该改的内容。
4. `Worktree`：每个任务单独一个 git 工作目录。不同任务互不干扰，更安全。

## 如何配置

配置 Code Relay，本质上就是 3 步：

### 1. 选模式

1. GitHub 模式：适合你们已经用 `GitHub Issue / Project` 管任务
    - 任务存在 `GitHub Issue` 里
    - 进度写在 `Issue comment` 里
    - 适合团队协作

2. Local 模式：适合你想全部放本地文件里，不依赖 GitHub。
    - 任务存在本地 `PROGRAM.md`
    - 进度写在本地 `STATUS.yml` 和 `HANDOFF.md`
    - 可以用 `SCOPE.yml` 控制 AI 可写范围
    - 更适合个人、离线、实验项目

### 2. 复制模板

1. `GitHub` 模式：把 `github/` 里的内容复制到你的工作区根目录。
2. `Local` 模式：把 `local/` 里的内容复制到你的工作区根目录。

```bash
your-project/
├── AGENTS.md
└── orchestrator/
    ├── ALWAYS/
    │   ├── BOOT.md
    │   ├── CORE.md
    │   ├── DEV-FLOW.md
    │   ├── SUB-AGENT.md
    │   └── RESOURCE-MAP.yml
    └── PROGRAMS/

```

### 3. 先配置最关键的文件

真正需要你手动关心的，主要是这几个：

1. `AGENTS.md`：这是入口文件（一般模板已经写好了，通常不需要大改）。作用是告诉 AI：
    - 先读哪些文件
    - 用什么顺序启动
    - 工作协议是什么

2. `orchestrator/ALWAYS/RESOURCE-MAP.yml`：这是最重要的配置之一,你可以把它理解成整个项目的地图。作用是告诉 AI：
    - 这个工作区里有哪些仓库
    - 每个仓库是干什么的
    - 技术栈是什么
    - 仓库之间有什么关系
    - 用到了哪些基础设施

```yaml
workspace:
    name: my-project
    mode: local

repos:
    - name: frontend
      path: ./repos/frontend
      stack: React + Vite
      purpose: 用户前端界面

    - name: backend
      path: ./repos/backend
      stack: Node.js + Express
      purpose: API 服务

infrastructure:
    - name: postgres
      type: database
      purpose: 主业务数据库

relationships:
    - from: frontend
      to: backend
      type: calls-api

    - from: backend
      to: postgres
      type: uses-db
```

3.  Local 模式下的任务目录：如果你选的是 Local 模式，每个任务都要有一个目录，例如：

```bash
orchestrator/PROGRAMS/P-2026-001/
├── PROGRAM.md # 写任务目标。相当于“需求说明”。
├── STATUS.yml # 写任务当前状态。相当于“进度条”
├── SCOPE.yml # 限制 AI 可改范围。这是 Local 模式很有用的一点。
└── workspace/
    └── HANDOFF.md # 这是交接文档。一次会话结束时更新它，下次继续时先读它。
```

这 4 个文件分别干嘛：

::: code-group

```md [PROGRAM.md]
# P-2026-001

## 目标

给用户管理页面增加搜索功能。

## 验收标准

- 可以按用户名搜索
- 可以按邮箱搜索
- 搜索结果支持分页
```

```yaml [STATUS.yml]
id: P-2026-001
status: in_progress
owner: agent
progress:
    done:
        - 已确认用户列表接口位置
        - 已完成前端搜索框
    doing:
        - 对接后端搜索参数
    next:
        - 增加分页联动
```

```yaml [SCOPE.yml]
# AI 可以改用户相关页面和接口
write_allowed:
    - ./repos/frontend/src/pages/users/**
    - ./repos/frontend/src/components/users/**
    - ./repos/backend/src/routes/users/**
# 不能碰基础设施、环境变量等危险区域
write_denied:
    - ./repos/infra/**
    - ./.env
    - ./node_modules/**
```

```md [workspace/HANDOFF.md]
# HANDOFF

## 已完成

- 前端搜索框已接入页面
- 后端接口已支持 keyword 参数

## 进行中

- 分页与搜索联动还有 bug

## 下一步

- 修复翻页后搜索条件丢失的问题
- 补充接口测试

## 注意事项

- 后端使用 query 参数 `keyword`
- 前端分页状态在切页时会重置，需要保留搜索条件
```

:::

::: tip why github模式不需要PROGRAMS文件呢？

其实都是内置在了`Issue`等地方,如下：

- `PROGRAM.md -> GitHub Issue` 内容
- `STATUS.yml -> Project Board` 状态
- `HANDOFF.md -> Issue comment` 里的 ## HANDOFF
- `SCOPE.yml -> Issue` 或配置里约定的改动范围

所以 GitHub 模式本质上和 Local 模式一样，只是把“任务和状态”从本地文件换成了 GitHub。
:::
