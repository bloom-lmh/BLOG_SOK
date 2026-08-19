# LangGraph

一句话定位：LangGraph 是 LangChain 官方推出的**图编排框架**，用「节点（Node）+ 边（Edge）」把 Agent 的每一步建模成一张**有状态的有向图**，解决传统链式调用（LangChain Chain）无法表达**循环、条件分支、多 Agent 协作、人机交互、断点恢复**等复杂流程的问题。它的底层借鉴了 Google Pregel 的 **BSP（Bulk Synchronous Parallel，整体同步并行）** 模型，每一步称为一个 **super-step**，用共享的 `State`（状态）+ `Reducer`（归约）在节点间传递和更新数据，用 `Checkpointer`（检查点）实现持久化与「时间旅行」。

---

## 基础篇

### 为什么需要 LangGraph

LangChain 的 Chain 是一条「写死的直线」：先查库、再总结、再生成，只能一条路走到黑。但真实的 Agent 工作流经常不是直线：

- 模型生成结果不满意，要**回到上一步重新生成**（循环）；
- 根据用户意图**走不同的分支**（条件判断）；
- 多个 Agent 之间**互相调用、互相等结果**（协作）；
- 流程跑到一半要**停下来等人确认**（human-in-the-loop）；
- 崩溃后要**从断点恢复**而不是重跑（持久化）。

LangGraph 把这些需求抽象成「图」：节点是处理步骤，边是控制流，图上有专门的 `State`（状态）在节点间传递和更新。

用一张对比图看清「链」和「图」的差异：

```
LangChain Chain（线性，只能顺序走）：
  A ──► B ──► C ──► D
  （一条路走到黑，无法回头、无法分叉、无法并行）

LangGraph（图，允许环、分支、汇合）：
        ┌──────────────┐
        │   agent 节点   │◄─────────┐
        └──────┬───────┘           │
               │ 条件判断           │ 工具结果回传
        ┌──────▼───────┐           │
        │   tool 节点    │──────────┘
        └──────────────┘
  （可以"调工具→再思考→再调工具"循环往复，直到满足条件才 END）
```

**为什么这一点至关重要**：Agent 的核心行为是「反复尝试直到完成」，天然带环。Chain 抽象不支持环，所以用 Chain 搭 Agent 只能靠「死循环 + 手动 break」硬凑，代码散在业务逻辑里、状态要自己维护、崩了没法恢复。LangGraph 用「图」把「循环」变成一等公民，这是它存在的根本原因。

::: tip 💡 面试题：为什么有了 LangChain 还需要 LangGraph？
LangChain 解决的是「组件化」——把 Prompt、模型、工具、检索器抽象成可组合的 Runnable/Chain；但它只能表达**线性（无环）**流程。Agent 需要「循环、分支、并行、断点恢复、人机协作」，这些 LangChain Chain 表达不了，所以需要 LangGraph 用「图」来做**编排**。一句话：LangChain 提供零件，LangGraph 负责把零件拼成会循环、会分叉的复杂流水线。
:::

### 三个核心概念

| 概念 | 对应现实 | 作用 |
| --- | --- | --- |
| State（状态） | 全局共享的「记事本」 | 所有节点读写同一份数据，是图内信息传递的载体 |
| Node（节点） | 一个函数 | 干一件具体的事：调模型、查库、调工具 |
| Edge（边） | 流程指向 | 决定下一步去哪，可以是固定边或条件边 |

```python
# 为什么要有 State：节点之间不能靠 return 传值（图是分散的、有循环的），
# 必须有一份所有节点都能读写的共享状态，才能保证信息在图中流动。
from typing import TypedDict

class State(TypedDict):
    question: str      # 用户问题
    answer: str        # 模型回答
```

**State 是 LangGraph 的「灵魂」**：它是唯一贯穿整个图、被所有节点共享的数据结构。节点函数不直接「调」下一个节点，而是「读写 State」——一个节点往 State 里写增量，图执行引擎负责把增量归约回 State，再决定下一个节点读到的 State 是什么。这种「节点解耦、状态共享」的设计，是图能支持循环、并行、持久化的基础。

### State 的三种定义方式

State 本质是一个「带类型的字典」，LangGraph 支持三种定义方式，选哪种看项目规范：

| 方式 | 写法 | 特点 | 适用 |
| --- | --- | --- | --- |
| TypedDict | `class State(TypedDict)` | 最轻量，无运行时校验 | 快速原型、简单状态 |
| dataclass | `@dataclass class State` | 可加默认值、方法 | 状态有默认值或行为 |
| Pydantic BaseModel | `class State(BaseModel)` | 带类型校验、序列化 | 生产级、需要校验 |

```python
from typing import TypedDict
from dataclasses import dataclass, field
from pydantic import BaseModel

# 方式一：TypedDict——为什么最常用：够轻，只是"类型标注"，不引入额外依赖
class State1(TypedDict):
    messages: list

# 方式二：dataclass——为什么用 field(default_factory)：list 是可变对象，
# 不能直接写 =[]（所有实例会共享同一个 list），必须用工厂函数每次新建
@dataclass
class State2:
    messages: list = field(default_factory=list)

# 方式三：Pydantic——为什么生产推荐：LangGraph 底层也依赖 Pydantic 做序列化，
# 用它定义 State 能自动获得校验和 JSON 序列化能力，checkpoint 落盘更稳
class State3(BaseModel):
    messages: list = []
```

三种方式在 LangGraph 内部最终都会转成统一的 schema（`StateSchema`），对执行引擎来说没有区别，选型只影响你写代码的体验和校验能力。

### 节点函数：返回值就是 State 的「增量」

节点是图里真正干活的函数，它的签名和返回值有严格约定，这是理解 LangGraph 的关键：

```python
# 节点的标准形态：接收整个 State，返回 State 的"增量"（一个 dict）
# 为什么返回 dict 而不是整个 State：LangGraph 只把返回的字段"归约"回 State，
# 节点只需声明"我改了哪几个字段"，不用关心 State 里还有哪些字段，避免互相覆盖。
def generate(state: State) -> dict:
    # state 是当前完整状态（只读）
    # 返回 {"answer": ...} 表示"把 answer 这个字段更新成这个值"
    return {"answer": "你好，我是 Agent"}
```

关于节点有几个必须记住的约定：

1. **入参**：完整 State（或 State 的子集，用 `input` 参数指定时）。
2. **返回值**：一个 dict，只包含「要更新的字段」，LangGraph 会把它**归约**进全局 State。
3. **可以返回 `None` 或空 dict**：表示「我不改任何状态」，常用于只有副作用的节点（如发日志）。
4. **不能返回 None 以外的非 dict**：节点返回的必须是 dict（或 `None`/`Command`）。

::: tip 💡 面试题：LangGraph 的节点函数为什么返回 dict 而不是整个 State？
因为多个节点（尤其是并行节点）可能同时写 State，如果每个节点都返回「完整 State」，后写的会把先写的整个覆盖掉。返回「增量 dict」后，由执行引擎用每个字段的 **reducer** 决定「怎么合并」，字段之间互不干扰——这是并发安全的根本设计。
:::

### 快速上手：StateGraph

```python
from langgraph.graph import StateGraph, START, END

# 1. 定义图，绑定 State 类型
graph = StateGraph(State)

# 2. 定义节点：本质就是"接收 State、返回 State 的增量"的函数
#    为什么返回 dict 而不是整个 State：LangGraph 默认只把返回的字段合并进 State，
#    这样节点不用管 State 里还有哪些字段，避免互相覆盖。
def generate(state: State):
    return {"answer": "你好，我是 Agent"}

# 3. 加节点、连边
graph.add_node("generate", generate)
graph.add_edge(START, "generate")   # START 是内置起始节点
graph.add_edge("generate", END)     # END 是内置结束节点

# 4. 编译成可执行的应用
app = graph.compile()
result = app.invoke({"question": "你好"})
# result = {"question": "你好", "answer": "你好，我是 Agent"}
```

这段代码揭示了 LangGraph 的完整生命周期，值得拆开讲：

```
1. 建图阶段（build）     add_node / add_edge 只是"声明"了图的结构，还没执行
2. 编译阶段（compile）   LangGraph 把声明的结构编译成可执行的 Pregel 应用
                         做了三件事：校验图合法性、计算节点依赖、绑定 checkpointer
3. 执行阶段（invoke）    真正按 super-step 模型驱动节点运行，返回最终 State
```

**为什么要有「编译」这一步**：`add_node` 只是注册节点、`add_edge` 只是声明边，此时图还是「死的」数据结构。`compile()` 把这张结构图翻译成「可执行的执行计划」——比如校验是否存在没有入口的孤立节点、计算每个节点的依赖关系（为 super-step 规划做准备）。这种「先声明后编译」的模式，和 TensorFlow 的「先建计算图再执行」是同一个思想。

### 固定边 vs 条件边：让流程会「分叉」

固定边只能「A 之后一定去 B」，条件边则是「A 之后根据结果决定去 B 还是 C」：

```python
from langgraph.graph import StateGraph, START, END

# 为什么用条件边：Agent 必须根据模型输出动态决定下一步，
# 比如"路由类 Agent"要根据问题类型分发到不同的处理节点。
def route(state: State) -> str:
    # 返回的字符串必须对应某个已注册节点名（或 END）
    return "node_a" if "算数" in state["question"] else "node_b"

graph = StateGraph(State)
graph.add_node("node_a", handler_a)
graph.add_node("node_b", handler_b)
graph.add_edge(START, "node_a")

# add_conditional_edges：根据 route 的返回值选择下一跳
graph.add_conditional_edges("node_a", route, {"node_a": "node_a", "node_b": "node_b"})
graph.add_edge("node_b", END)
```

条件边是 Agent 实现「动态规划」能力的核心。路由函数（`route`）的返回值必须是「已注册的节点名」或 `END`，LangGraph 会在运行时调用它，根据当前 State 决定下一跳。

**条件边的本质**：固定边在编译时就确定了「A→B」，条件边则把「下一步去哪」延迟到运行时，由 State 的内容动态决定。这对应了 Agent 的「自主性」——每一步根据当前观察（State）决定下一步动作。

::: tip 💡 面试题：LangGraph 里的边有哪几种？
固定边（`add_edge`）和条件边（`add_conditional_edges`）两种。固定边无条件跳转，条件边由一个路由函数根据 State 返回的节点名决定下一跳，这是实现 Agent 动态规划能力的关键。
:::

### 最简完整示例：一个会「来回」的 Agent 循环

把基础概念串起来，写一个最小但**能循环**的 Agent，理解 LangGraph 和普通函数调用的本质区别：

```python
from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict):
    count: int          # 当前执行了几轮
    done: bool          # 是否该结束了

def step(state: State):
    # 为什么每轮 count+1：模拟"做了一次尝试"，真实 Agent 这里是调一次模型/工具
    return {"count": state["count"] + 1}

def should_continue(state: State) -> str:
    # 为什么用 count 判断：模拟"反复尝试直到成功"的循环，
    # 真实 Agent 这里判断"模型是否还需要调工具"
    return "end" if state["count"] >= 3 else "step"

graph = StateGraph(State)
graph.add_node("step", step)
graph.add_edge(START, "step")
# 条件边指向自己 = 循环；返回 END = 结束
graph.add_conditional_edges("step", should_continue, {"step": "step", "end": END})

app = graph.compile()
result = app.invoke({"count": 0, "done": False})
# result = {"count": 3, "done": False}
```

这段代码的关键在 `add_conditional_edges("step", should_continue, ...)` 里 `"step": "step"` 这一项——它让 `step` 节点**指回自己**，形成一个环。这就是 LangGraph 表达「循环」的方式：**条件边允许指向自身或上游节点**，于是图可以「绕圈」，直到某个条件满足才走向 `END`。

### 核心术语速查表

在进入高级篇前，先把 LangGraph 的高频术语一次性对齐，后面会反复用到：

| 术语 | 含义 | 类比 |
| --- | --- | --- |
| State | 图内共享的状态（带类型的 dict） | 全局记事本 |
| Node | 处理步骤（函数），读写 State | 流水线工位 |
| Edge | 控制流（固定边 / 条件边） | 传送带 |
| Reducer | 决定「字段增量怎么合并回 State」的函数 | 合并规则 |
| Checkpointer | 把每一步 State 持久化的组件 | 存档点 |
| Checkpoint | 某一个时刻的 State 快照 | 游戏存档 |
| Thread | 一条独立会话，用 `thread_id` 标识 | 会话 ID |
| Super-step | 一轮「规划→并行执行→归约」的循环 | 一轮迭代 |
| Send | 从节点动态派发子任务（并行扇出） | 分发任务单 |
| Interrupt | 在指定节点前/后暂停，等人介入 | 审批闸口 |

---

## 高级篇

基础篇搭起的是「能跑」的图，高级篇解决的是「能上生产」的图。真实 Agent 系统里，循环怎么安全收敛、状态怎么持久化、多 Agent 怎么协作、人怎么介入，都是工程硬骨头，这一篇逐个展开。

### 循环：ReAct Agent 的本质

ReAct（思考→行动→观察→再思考）天生是「循环」结构，这是 Chain 表达不了、图天然能表达的：

```python
# 为什么需要循环：Agent 可能要多次调用工具才能得到答案，
# 所以"调工具"和"生成回答"两个节点要能来回跳，直到模型说"可以结束了"。
def should_continue(state: State) -> str:
    # 模型判断还要不要继续调工具
    if state.get("needs_tool"):
        return "tool"      # 回去继续调工具（形成循环）
    return "end"           # 结束

graph.add_conditional_edges(
    "agent",               # 从 agent 节点出发
    should_continue,       # 路由函数
    {"tool": "tool", "end": END},
)
graph.add_edge("tool", "agent")   # 工具执行完，回到 agent 继续思考（闭环）
```

这张图读作：`agent → 判断 → (tool → agent) 循环 → END`，就是一个标准的 Agent 主循环。

完整的 ReAct 循环在 LangGraph 里长这样：

```
        ┌───────────────────────────────────────┐
        │                 START                   │
        └──────────────────┬────────────────────┘
                           ▼
                  ┌────────────────┐
                  │  agent 节点      │  模型输出：要么"调工具"，要么"直接回答"
                  │  （思考/生成）    │
                  └───────┬────────┘
                          │ 条件边 should_continue
              ┌───────────┴───────────┐
              ▼                       ▼
      "needs_tool"                 "end"
              │                       │
              ▼                       ▼
     ┌────────────────┐            ┌─────┐
     │  tool 节点       │──────┐     │ END │
     │ （执行工具调用）   │      │     └─────┘
     └────────────────┘      │ 固定边回传结果
              └──────────────┘
```

**循环的安全问题**：循环是 Agent 强大的来源，也是事故的来源。如果路由函数写错，图可能无限循环，把 token 和算力烧光。工程上必须设置**最大迭代次数**（max iterations），这一点会在[常见坑](#常见坑与避坑指南)里展开。

### Checkpointer：断点续跑与记忆

普通函数调用完就「失忆」，LangGraph 用 Checkpointer 把每一步的 State 持久化，带来两个能力：

1. **多轮记忆**：下次调用带上 `thread_id`，自动把历史 State 拼进来；
2. **断点恢复 / 时间旅行**：可以回到任意历史节点重放。

```python
from langgraph.checkpoint.memory import MemorySaver

app = graph.compile(checkpointer=MemorySaver())

# 为什么每次要传 thread_id：LangGraph 靠它区分不同会话，
# 同一个 thread_id 的多次 invoke 会自动串联成"有记忆"的多轮对话。
config = {"configurable": {"thread_id": "user-123"}}
app.invoke({"question": "我住北京"}, config)
app.invoke({"question": "帮我查明天天气"}, config)  # 还记得"我住北京"
```

**Checkpointer 的工作机制**（细节在[原理篇](#checkpointer-持久化原理checkpoint-是什么)展开）：每次 invoke 结束时，它把「当前 State + 下一步待执行节点」序列化成一个 **checkpoint** 存起来；下次同一 `thread_id` 调用时，先加载最近的 checkpoint 作为起点，新输入的 State 增量再归约上去。

::: tip 💡 面试题：LangGraph 如何实现多轮对话记忆？
靠 `checkpointer` + `thread_id`。checkpointer 把每次调用结束时的 State 持久化到存储，下次同一 `thread_id` 调用时自动加载历史 State，从而实现跨轮记忆和断点恢复。
:::

### 持久化后端选型：内存只是玩具

`MemorySaver` 存在进程内存里，进程一重启就全没了，只能用于开发调试。生产环境必须换成持久化存储：

| 后端 | 包 | 持久化 | 并发 | 适用场景 |
| --- | --- | --- | --- | --- |
| MemorySaver | `langgraph.checkpoint.memory` | 否（进程内） | 单线程 | 开发、测试、单元测试 |
| SqliteSaver | `langgraph-checkpoint-sqlite` | 是（本地文件） | 低并发 | 单机部署、小流量 |
| PostgresSaver | `langgraph-checkpoint-postgres` | 是（数据库） | 高并发 | 生产级、多实例、高可用 |
| 自定义 | 实现 `BaseCheckpointSaver` | 视实现 | 视实现 | 特殊存储需求 |

```python
# 生产环境为什么要换成 SQLite/Postgres 而不是 MemorySaver：
# MemorySaver 的数据在内存里，服务重启/多实例部署时记忆会丢失、无法共享，
# 落盘的 checkpointer 才能保证"换个进程还能接着聊"。
from langgraph.checkpoint.sqlite import SqliteSaver

with SqliteSaver.from_conn_string("checkpoints.db") as checkpointer:
    app = graph.compile(checkpointer=checkpointer)
```

**为什么生产必须持久化**：多轮对话的记忆、人机交互的「暂停点」、断点恢复，全都依赖 checkpoint。内存后端在单机重启、多实例负载均衡（用户这次请求打到实例 A、下次打到实例 B）时会「失忆」，只有共享的持久化存储才能保证会话连续性。

### Human-in-the-loop：流程中途等人

关键操作（付款、发邮件）需要人确认，用 `interrupt` 在指定节点前暂停：

```python
# 为什么需要 interrupt：某些高风险操作不能全自动，
# 必须把控制权交回给人，人确认后才继续往下走。
graph.add_node("approve", approve_fn)
graph.compile(checkpointer=MemorySaver(), interrupt_before=["approve"])

app.invoke({"question": "..."}, config)
# 执行到 approve 节点前会停下，返回当前 State
app.invoke(None, config)   # 人确认后，传 None 继续执行
```

Human-in-the-loop 有**三种粒度**，从粗到细：

| 方式 | 粒度 | 用法 | 场景 |
| --- | --- | --- | --- |
| `interrupt_before` | 节点前 | `compile(interrupt_before=["approve"])` | 每次进该节点前都停下 |
| `interrupt_after` | 节点后 | `compile(interrupt_after=["generate"])` | 每次出该节点后停下 |
| `interrupt()` 函数 | 节点内部 | 在节点里调用 `interrupt(...)` | 只在「运行时某个条件满足」时停 |

```python
from langgraph.types import interrupt, Command

# 为什么用节点内的 interrupt()：编译时的 interrupt_before 是"无条件"停，
# 但很多场景要"按条件"停——只有金额大于 1 万才需要人审，这时要在节点里动态决定。
def review_node(state):
    if state["amount"] > 10000:
        # interrupt 会暂停图执行，把信息返回给调用方等人决策
        decision = interrupt({"message": "金额过大，请人工确认", "amount": state["amount"]})
        # 人通过 Command(resume=...) 传入决定后，从这里继续往下执行
        return {"approved": decision == "yes"}
    return {"approved": True}
```

**暂停 ≠ 失败**：interrupt 的本质是「把图执行挂起，保存 checkpoint，把控制权交还调用方」，而不是抛异常。因为暂停点已经持久化，人可以随时恢复，甚至可以在暂停期间修改 State 再恢复——这是人机协作与断点恢复的统一机制。

### Send API：并行分发到多个子任务

一个节点要把任务「扇出」给 N 个子节点并行处理，再「扇入」汇总，用 `Send` 实现 map-reduce 式并行：

```python
from langgraph.types import Send

# 为什么用 Send：循环里 for 循环发 N 个 Send，
# LangGraph 会把这些子任务并行调度，最后统一汇合。
def fan_out(state):
    return [Send("worker", {"item": i}) for i in state["items"]]
```

`Send` 解决的是**「运行时才知道要并行多少路」**的难题。对比一下两种并行：

```
静态并行（编译时就定好几路）：
        ┌────► worker1 ────┐
  start─┼────► worker2 ────┼──► 汇总   （add_edge 写死三条边）
        └────► worker3 ────┘

动态并行（运行时才知道几路，用 Send）：
  start ──► fan_out 节点
              │  return [Send("worker", {"item": i}) for i in items]
              │  items 有 5 个 → 派发 5 个 worker 任务；有 100 个 → 派发 100 个
              ▼
        worker × N（并行）──► 每个 worker 结果归约回 State
```

完整示例：

```python
from typing import TypedDict, Annotated
from operator import add
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send

class State(TypedDict):
    items: list                      # 待处理的任务列表
    results: Annotated[list, add]    # 结果用 add 归约：每个 worker 的结果"追加"进来

def worker(state):
    # 每个 worker 处理自己那一份 item，返回"我这一份"的结果
    item = state["item"]             # Send 传来的 item
    return {"results": [f"处理了 {item}"]}

def fan_out(state):
    # 为什么用 Send 列表：有几个 item 就派发几个 worker，
    # 数量由运行时 state["items"] 决定，编译时无法写死
    return [Send("worker", {"item": item}) for item in state["items"]]

graph = StateGraph(State)
graph.add_node("fan_out", fan_out)
graph.add_node("worker", worker)
graph.add_edge(START, "fan_out")
# worker 处理完去哪：所有 worker 都完成后，图自然结束
graph.add_conditional_edges("fan_out", lambda s: "worker", {"worker": "worker"})
graph.add_edge("worker", END)

app = graph.compile()
result = app.invoke({"items": [1, 2, 3, 4, 5], "results": []})
# results 会包含 5 个"处理了 x"，顺序不定（并行执行）
```

::: tip 💡 面试题：Send 和 add_edge 的并行有什么区别？
`add_edge` 是**静态并行**——编译时就确定「这个节点连到哪几个节点」，路数是固定的；`Send` 是**动态并行（map-reduce 扇出）**——节点在运行时根据 State 返回 `Send` 列表，派发「多少个、带什么参数」的子任务都由运行时数据决定。Send 用于「遍历列表逐项并行处理」这类动态场景。
:::

### 子图（Subgraph）：把图当「函数」复用

当 Agent 越来越复杂，一张大图会变成「意大利面」，LangGraph 允许把一张编译好的图当作**一个节点**嵌进另一张图：

```python
# 为什么用子图：把"查天气"封装成一张独立子图，
# 主图只需把它当做一个节点调用，既模块化又复用。
subgraph = StateGraph(SubState).add_node(...).compile()   # 子图，独立编译

main = StateGraph(MainState)
main.add_node("weather", subgraph)   # 直接把编译好的子图当节点加进主图
```

子图解决两个工程问题：

1. **模块化**：复杂流程拆成可独立开发、独立测试的子图，主图只做编排；
2. **复用**：同一张子图可以在主图的不同位置复用（不同参数、不同入口）。

**状态映射**：子图和主图的 State 结构可能不同，加子图节点时可以指定 `input`/`output` 映射函数，把主图 State 的字段喂给子图、再把子图结果写回主图——这就是「接口适配」。

### 多 Agent 协作：Supervisor 模式

多个专职 Agent（一个写代码、一个做测试、一个做审查）怎么协作？经典做法是 **Supervisor（主管）模式**——一个主管 Agent 负责「分配任务、决定下一个谁干、判断是否完成」，各专职 Agent 作为子图：

```
                 ┌─────────────────────────┐
                 │     supervisor 节点       │  主管：读全局状态，决定下一步派谁
                 └──────────┬──────────────┘
              ┌─────────────┼─────────────────┐
              ▼             ▼                 ▼
        ┌──────────┐  ┌──────────┐      ┌──────────┐
        │ coder     │  │ tester    │      │ reviewer │   ← 三个专职 Agent（子图）
        └──────────┘  └──────────┘      └──────────┘
              │             │                 │
              └─────────────┼─────────────────┘
                            ▼
                    回到 supervisor（循环）
                    直到主管判断"任务完成" → END
```

```python
# 为什么用 supervisor：多 Agent 协作不能靠"写死顺序"，
# 因为不知道要先写代码还是先测试、要迭代几轮，
# 需要一个"主管"根据全局 State 动态调度，这就是条件边 + 循环的典型应用。
def supervisor_route(state) -> str:
    if state["need_coding"]:
        return "coder"
    if state["need_testing"]:
        return "tester"
    return "finish"

graph.add_conditional_edges(
    "supervisor",
    supervisor_route,
    {"coder": "coder", "tester": "tester", "finish": END},
)
# 三个专职 Agent 干完都回到 supervisor，让主管重新决策
for name in ["coder", "tester", "reviewer"]:
    graph.add_edge(name, "supervisor")
```

Supervisor 模式本质上就是「用一张图实现一个中央调度器」，它和多 Agent 框架（AutoGen、CrewAI）的思路一致，区别在于 LangGraph 把调度逻辑显式成图，可控性更强。

### 流式输出：逐 token 上屏

LangGraph 的 `stream` 支持多种模式，覆盖「看最终态」到「看每一步中间态」的不同需求：

```python
# 为什么用 stream 而不是 invoke：invoke 一次性返回最终 State，
# stream 能按 token/节点逐步吐结果，用户能实时看到 Agent 在"想什么、做什么"。
for event in app.stream({"question": "你好"}, config, stream_mode="values"):
    # stream_mode="values"：每次 State 变化就吐一次完整 State
    print(event)
```

| stream_mode | 吐出的内容 | 适用场景 |
| --- | --- | --- |
| `values` | 每次 State 变化后的完整 State | 看状态如何一步步演化 |
| `updates` | 每次 State 变化的「增量 dict」 | 只看每个节点改了什么 |
| `messages` | 模型吐出的 token 流（LLM 消息） | 逐字上屏的聊天界面 |
| `debug` | 详细的执行调试信息 | 排查调度问题 |
| `custom` | 节点里 `get_stream_writer()` 自定义输出 | 自定义流式协议 |

流式输出的底层依赖 LLM 的流式接口（详见[流式输出](/learn_ai/agent/流式输出)），LangGraph 负责把「图执行」和「token 流」桥接起来，让复杂 Agent 的中间过程也能实时可见。

### 常见坑与避坑指南

| 坑 | 原因 | 对策 |
| --- | --- | --- |
| 无限循环烧 token | 条件边路由函数写错，永远返回节点名 | 设最大迭代次数（`recursion_limit`）、加超时、监控 |
| 记忆丢失 | 用了 MemorySaver，进程重启就没 | 生产换 SqliteSaver/PostgresSaver |
| 状态被覆盖 | 列表字段没写 reducer，后写的覆盖先写的 | 列表用 `Annotated[list, add]` |
| thread_id 串号 | 不同用户复用了同一个 thread_id | 每个用户/会话生成唯一 thread_id |
| 并行结果顺序不定 | 多个 Send 并行，写入顺序随机 | 结果要排序，别依赖写入顺序 |
| 节点返回非 dict | 节点 return 了字符串等非 dict 对象 | 节点必须返回 dict / None / Command |
| 条件边返回未注册节点名 | 路由函数拼错节点名 | 返回值必须严格匹配 add_node 的名字 |
| checkpointer 不一致 | 编译时和调用时的 checkpointer 类型不同 | 保证 compile 与 invoke 用的是同一实例 |

```python
# 为什么要有 recursion_limit：循环 Agent 一旦路由逻辑出错就会死循环，
# 设上限让图跑满 N 步就抛异常，避免把 API 配额烧光。
app = graph.compile(checkpointer=MemorySaver())
result = app.invoke(input, config, config={"recursion_limit": 25})
```

### 框架/方案选型对比表

| 方案 | 流程表达 | 状态/记忆 | 多 Agent | 人机协作 | 适用 |
| --- | --- | --- | --- | --- | --- |
| LangChain Chain | 只有直线（无环） | 无内置 | 弱 | 弱 | 简单线性流程、快速原型 |
| 自己写 while 循环 | 能写，散在业务里 | 手动维护 | 手动 | 手动 | 极简单 Agent |
| LangGraph | 图（循环/分支/并行） | State + Checkpointer | 原生支持 | 原生 interrupt | 复杂 Agent、多 Agent、生产级 |
| AutoGen | 多 Agent 对话 | 有，但抽象度高 | 强（对话式） | 支持 | 研究型多 Agent 对话 |
| CrewAI | 角色化多 Agent | 有 | 强（角色分工） | 支持 | 快速搭多 Agent 协作 |
| Dify / Coze | 可视化编排 | 平台内置 | 弱~中 | 弱 | 低代码、业务人员 |

**核心判断**：流程一旦出现「循环、条件分叉、多 Agent、断点恢复、人机协作」中任意一个，就该上 LangGraph；否则 LangChain 的 Chain 就够用。需要「可视化拖拽」选 Dify/Coze，需要「多 Agent 对话式协作」可选 AutoGen/CrewAI，需要「底层可控、可观测、可持久化」选 LangGraph。

::: tip 💡 面试题：LangGraph 和 AutoGen / CrewAI 怎么选？
LangGraph 把编排逻辑显式成「图」，底层可控、可观测、可持久化、可精确控制状态流转，适合对流程有精确要求的工程化 Agent；AutoGen/CrewAI 把多 Agent 抽象成「对话/角色」，上手快但黑盒多、难精细控制。选型看「可控性优先」还是「开发速度优先」。
:::

### 生产级工程实践清单

把 LangGraph 真正上生产，除了功能，还要补齐这些工程项：

1. **持久化**：checkpointer 落库（SQLite/Postgres），保证多实例共享会话。
2. **可观测**：用 LangSmith / Langfuse 追踪每次执行的节点轨迹、耗时、token 消耗。
3. **超时与重试**：节点调用 LLM/工具加超时和重试，避免卡死。
4. **限流与配额**：对循环 Agent 设 `recursion_limit`，控制最大步数。
5. **结构化输出**：关键节点用 `with_structured_output` 约束模型输出 schema，减少解析错误。
6. **幂等**：工具调用尽量幂等，方便断点恢复后重放。
7. **版本化 State**：State schema 变更时做兼容（checkpoint 里存的是旧 schema），需迁移策略。

---

## 原理篇

基础篇讲「是什么、怎么用」，原理篇讲「为什么这么设计、底层发生了什么」。这一篇下到执行引擎层面，把 Super-step、Reducer、Send、持久化、时间旅行这几个核心机制彻底讲透。

### 执行引擎：Super-step 模型

LangGraph 的图执行借鉴了「BSP（Bulk Synchronous Parallel，整体同步并行）」思想，每一步称为一个 **super-step**：

1. **规划**：找出所有「入边条件都满足」的节点（可能有多个，构成一层）；
2. **执行**：并行执行这一层的所有节点，每个节点返回 State 的增量；
3. **归约**：用 reducer 把所有增量合并回全局 State；
4. 重复，直到没有可执行节点或到达 `END`。

这套模型让**并行、循环、条件分支**都能统一处理，是它比「线性 Chain」强大的根本。

用伪代码把 super-step 的执行循环精确描述：

```python
# LangGraph 执行引擎的伪代码（对应底层 Pregel 实现）
# 为什么叫"整体同步并行"：每一轮里，所有就绪节点"并行"执行（Bulk Parallel），
# 但它们的写入要等这一轮全部执行完，统一"同步"归约后再进入下一轮（Synchronous）。

def run(graph, state, config):
    step = 0
    # 待处理的任务队列，初始是 START 出发的节点
    tasks = graph.initial_tasks(state)

    while tasks and step < recursion_limit:
        step += 1
        # ---- 阶段一：规划（Plan）----
        # 找出本轮所有"就绪"的节点：它们的入边依赖都已被满足
        ready = [t for t in tasks if t.dependencies_satisfied(state)]

        # ---- 阶段二：执行（Apply/Execute）----
        # 并行执行所有就绪节点，各自产生 State 的"增量"
        writes = parallel_execute(ready, state)   # 每个节点返回一个 dict

        # ---- 阶段三：归约（Reduce）----
        # 把所有增量按字段的 reducer 合并回 State
        state = reduce_writes(state, writes)

        # ---- 阶段四：检查点（Checkpoint）----
        # 保存当前 State + 下一步待执行节点（供恢复/时间旅行）
        checkpoint(state, next_tasks)

        # 根据 State 和条件边，计算下一轮要执行的节点
        tasks = graph.next_tasks(state)

    return state
```

**super-step 的关键特征**：同一轮内的节点「互相看不到对方的写入」。节点 A 和节点 B 在同一轮并行执行时，它们读到的都是**上一轮结束时的 State**；它们各自的增量要等这一轮全部执行完，才统一归约进 State。这个「同步屏障」保证了并行执行的确定性——无论节点以什么顺序、什么并发度执行，最终 State 都是一样的。

```
时间轴示意（BSP 的"同步屏障"）：
  State_v0
     │
  ┌──┴───────────────┐   ← 第 1 个 super-step
  │ A、B、C 并行执行    │      它们都读 State_v0，互不可见
  └──┬───────────────┘
     ▼  归约（reducer 合并 A、B、C 的增量）
  State_v1
     │
  ┌──┴───────────────┐   ← 第 2 个 super-step
  │ D、E 并行执行       │      它们读 State_v1
  └──┬───────────────┘
     ▼
  State_v2 → END
```

### 为什么是 BSP 而不是普通图遍历

普通图遍历（DFS/BFS）是「单线程」的：一次只处理一个节点，处理完再找下一个。BSP 把「同一层就绪节点」打包成一轮**并行**执行，带来两个关键收益：

1. **并行性**：没有依赖关系的节点可以在同一 super-step 并行跑，天然利用多核/异步 I/O。
2. **确定性**：并行结果通过 reducer 统一归约，与调度顺序无关，执行结果可复现（对断点恢复、时间旅行至关重要）。

**代价**是「同步屏障」——每轮都要等最慢的节点执行完才能进入下一轮。但对 Agent 工作流来说，节点大多是「调 LLM」这种高延迟 I/O 操作，同步屏障的开销相对可忽略，换来的确定性和并行性收益更大。

### State 更新：Reducer 决定怎么合并

节点返回的 dict 怎么写回 State，由 State 字段的 **reducer** 决定：

| 写法 | 合并行为 | 适用场景 |
| --- | --- | --- |
| 默认（不写 reducer） | 直接覆盖 | 单值字段，如 answer |
| `Annotated[list, operator.add]` | 追加 | 消息历史、日志列表 |
| 自定义 reducer 函数 | 自定义逻辑 | 去重、取最大、覆盖规则 |

```python
from typing import Annotated
from operator import add

# 为什么 messages 用 add 而不是覆盖：
# 多轮对话里每个节点都往历史里"追加"消息，而不是把别人写的覆盖掉。
class State(TypedDict):
    messages: Annotated[list, add]   # 每次追加，不是覆盖
    answer: str                       # 默认覆盖
```

**Reducer 的签名约定**：

```python
# Reducer 本质是一个函数：reducer(当前值, 更新值) -> 合并后的值
# operator.add(旧列表, 新列表) = 旧列表 + 新列表，正好实现"追加"

# 自定义 reducer 示例：只保留最大值（比如"最高优先级"字段）
def keep_max(current, update):
    return max(current, update)

class State(TypedDict):
    priority: Annotated[int, keep_max]   # 多个节点写 priority 时，取最大
```

Reducer 解决的核心问题是**「并行写入冲突」**：同一个 super-step 里多个节点可能同时写 `messages`，没有 reducer 的话「谁最后写谁赢」，先写的结果就丢了。`add` reducer 让所有人的写入都「追加」保留，`keep_max` 让冲突按业务规则解决，而不是靠运气。

::: tip 💡 面试题：为什么 State 里的列表字段要写 `Annotated[list, add]`？
因为默认 reducer 是「直接覆盖」，多个节点（尤其并行节点）同时写同一个列表字段时，后写的会把先写的整个覆盖掉。用 `Annotated[list, add]` 指定「追加」语义，保证每次写入都累加而不是覆盖，这是多节点共享消息历史的标准写法。
:::

### Reducer 底层：Annotated 元数据如何被解析

`Annotated[list, add]` 为什么能被 LangGraph「读懂」？关键在于 Python 的 `typing.Annotated` 机制：

```
Annotated[list, add]
   │       │    │
   │       │    └── 第二参数：元数据（这里是 reducer 函数 add）
   │       └────── 第一参数：实际类型（list）
   └────────────── 完整类型 = 类型 + 元数据

LangGraph 在建 StateSchema 时，用 typing.get_type_hints(include_extras=True)
读取每个字段的 Annotated 元数据，把第二参数当作 reducer 注册进 schema。
```

所以 reducer 不是「运行时判断」出来的，而是**编译时从类型注解里解析**出来的。这也解释了为什么「忘记写 `Annotated`」会静默地用默认覆盖 reducer——不是报错，而是语义悄悄变了，这是个隐蔽的坑。

### Send 的调度原理：扇出与扇入

`Send` 看起来只是「返回一个列表」，但它在 super-step 模型里有一套精确的调度机制：

```
第 N 个 super-step：
  fan_out 节点执行，返回 [Send("worker", {item:1}), Send("worker", {item:2}), ...]
      │
      ▼ 引擎把每个 Send 转成一个"待处理任务"（task）
  ┌─────────────────────────────────────────┐
  │ task(worker, {item:1})                   │
  │ task(worker, {item:2})   ← 这些任务进队列 │
  │ task(worker, {item:3})                   │
  └─────────────────────────────────────────┘

第 N+1 个 super-step：
  所有 worker task 就绪，并行执行
      │
      ▼ 每个 worker 的结果按字段 reducer 归约回 State
  results = [worker(item=1), worker(item=2), worker(item=3)] 的归约
      │
      ▼ 所有 worker 完成后（扇入），图结束或进入下一节点
```

**关键点**：`Send` 派发的任务在**下一个 super-step**才执行（不是当前轮）。这保证了「扇出节点」和「它派发的 worker」之间有一个同步屏障，worker 读到的是扇出节点完成后的 State，语义清晰、无竞态。

### Checkpointer 持久化原理：Checkpoint 是什么

Checkpointer 存的不只是「State 快照」，而是**「能精确恢复执行现场」的完整上下文**。一个 checkpoint 包含：

```
Checkpoint 结构：
  ├── values：当前完整 State（所有字段归约后的结果）
  ├── next：下一步要执行的节点/任务列表（含 Send 派发的任务）
  ├── pending_writes：本轮尚未归约的增量（执行到一半时的中间态）
  ├── channel_versions：每个 State 字段的版本号（用于检测是否需要重算）
  └── checkpoint_id / parent_checkpoint_id：组成一条版本链（供时间旅行）
```

```python
# 查看 checkpoint 的内容
state = app.get_state(config)
print(state.values)   # 当前 State
print(state.next)     # 下一步待执行节点
print(state.config)   # 含 checkpoint_id

# 查看整条历史版本链
for snapshot in app.get_state_history(config):
    print(snapshot.config["configurable"]["checkpoint_id"], snapshot.values)
```

**为什么 checkpoint 要存「下一步待执行节点」**：只存 State 的话，恢复时不知道「执行到哪了、接下来该跑谁」。存了 `next`，恢复时才能从断点**精确续跑**，而不是从头重放。`parent_checkpoint_id` 把每次写入串成一条链，这是「时间旅行」的数据基础。

### 时间旅行（Time Travel）：回到过去、改写历史

「时间旅行」是 LangGraph 区别于普通 Agent 框架的标志能力——不只能「从断点恢复」，还能「回到任意历史时刻，改写状态后重新执行」：

```python
# 时间旅行的三步：查看历史 → 选定过去某时刻 → 从那里重放
# 1. 查看历史：拿到所有历史 checkpoint
history = list(app.get_state_history(config))
# history 按时间倒序，history[0] 是最新，history[-1] 是最早

# 2. 选定过去某个 checkpoint（比如倒数第 3 个）
target = history[2]
target_checkpoint_id = target.config["configurable"]["checkpoint_id"]

# 3. 从那个时刻重新执行（fork 出一条新分支）
forked_config = {
    "configurable": {
        "thread_id": "user-123",
        "checkpoint_id": target_checkpoint_id,   # 指定从哪个 checkpoint 出发
    }
}
result = app.invoke(None, forked_config)   # 从过去那点继续走
```

时间旅行实现「改写历史」的核心操作是 `update_state`——它可以在历史某个 checkpoint 上直接**覆写 State 字段**，然后从那里重新执行：

```python
# 为什么用 update_state 而不是直接改：checkpoint 是持久化的历史，
# 直接改内存没用，update_state 会"在历史版本上打补丁"，生成新版本。
app.update_state(target.config, {"answer": "手动修正后的答案"})
# 之后再 invoke(None, forked_config) 就从"修正后的历史"继续跑
```

**时间旅行的两大应用场景**：

1. **调试/回放**：Agent 某一步答错了，回到那一步，看「如果当时换个决策会怎样」。
2. **人工纠错 + 重放**：某个节点输出有问题，人手动修正 State 后，从修正点继续执行，不用从头重跑整个流程。

### 图编译过程：从声明到可执行

`add_node` / `add_edge` 只是「声明」，`compile()` 才是真正构建执行引擎。编译阶段做了这些事：

```
1. 解析 State schema
   └── 从类型注解里提取每个字段的类型 + reducer

2. 校验图合法性
   ├── 每个 add_edge 的目标节点必须已注册
   ├── 条件边路由函数返回的节点名必须存在
   └── 检查是否有"入度为 0"的孤立节点（除 START 外）

3. 计算节点依赖
   └── 建立每个节点的"入边"关系，供 super-step 规划判断"是否就绪"

4. 绑定 checkpointer / interrupt 配置
   └── 把持久化后端、暂停点配置注入执行引擎

5. 生成 Pregel 执行应用
   └── 输出一个可 invoke/stream 的 CompiledGraph
```

**为什么「编译」是 LangGraph 的关键设计**：它把「图的结构描述」和「图的执行」分离。结构描述可以序列化、可视化、做静态分析（比如提前发现死节点）；执行引擎只关心「按 super-step 模型跑」。这种分离也是它能支持「一个图编译后反复 invoke」「同一结构绑定不同 checkpointer」的原因。

### Pregel 执行模型详解

LangGraph 的底层执行引擎叫 **Pregel**（名字来自 Google 2010 年的大规模图计算论文），它把「图计算」抽象成「节点函数 + 消息传递 + 同步屏障」：

```
Pregel 三大核心思想（LangGraph 全部继承）：

1. 以节点为中心（vertex-centric）
   每个节点就是一个函数，只关心"我拿到什么输入、我产出什么输出"

2. 消息传递（message passing）
   节点间不直接调用，而是通过 State 的"增量"传递数据
   （reducer 就是"消息怎么合并"的规则）

3. 同步屏障（synchronization barrier）
   一轮 super-step 内并行执行，结束统一归约，再进入下一轮
```

为什么借鉴 Pregel 而不是「事件驱动」或「Actor 模型」？因为 **Agent 工作流的本质是「状态在图上流转」**，Pregel 的「共享状态 + 同步归约」模型天然匹配：状态怎么合并（reducer）、什么时候该停（没有就绪节点）、怎么并行（同一层就绪节点打包）都有清晰的语义，且结果可复现。

### 中断与恢复的底层机制

`interrupt` 暂停时，底层到底发生了什么：

```
正常执行：  super-step → super-step → super-step → ... → END
                                    ↑ 每个 super-step 后 checkpoint

interrupt 执行：
  super-step → super-step → [执行到 interrupt 前/节点内 interrupt()]
                              │
                              ▼
                    保存 checkpoint（含"当前被暂停、等 resume"的标记）
                              │
                    函数返回，控制权交还调用方（graph 处于"挂起"状态）
                              │
                    （期间人可以 inspect、甚至可以 update_state）
                              │
                    人调用 invoke(None, config) 或 Command(resume=...)
                              │
                              ▼
                    从 checkpoint 恢复，继续下一个 super-step → ... → END
```

**关键点**：中断点一定是一个 **checkpoint**（因为 `interrupt_before`/`interrupt_after` 强制在这些位置落 checkpoint），所以恢复是「精确续跑」而不是「从头再来」。这也是为什么「人机协作」和「断点恢复」在 LangGraph 里是**同一个机制的两个名字**——都是「checkpoint + 恢复」。

### 完整执行流程一张图

把前面所有机制串起来，看一次 `invoke` 从进来到出去的完整数据流：

```
用户输入 {question: "..."} + config {thread_id}
   │
   ▼
[1] 加载 checkpoint（同一 thread_id 若有历史，先恢复 State）
   │
   ▼
[2] 把新输入按 reducer 归约进 State
   │
   ▼
[3] 进入 super-step 循环
   │
   ├──► [3a 规划] 找所有"就绪"节点（入边依赖已满足）
   │
   ├──► [3b 执行] 并行执行就绪节点，各返回 State 增量 dict
   │            （若节点返回 Send 列表 → 转成下一轮的任务）
   │
   ├──► [3c 归约] 按字段 reducer 把增量合并回 State
   │
   ├──► [3d 检查点] 保存 checkpoint（values + next + 版本链）
   │
   ├──► [3e 判断] 若到达 END / 无就绪节点 / 触发 interrupt → 退出循环
   │
   └──── 否则回到 [3a]，进入下一 super-step
   │
   ▼
[4] 返回最终 State（或 interrupt 处的挂起 State）
```

理解这条数据流，就理解了 LangGraph 的全部执行机制：**super-step 是「调度粒度」、reducer 是「合并规则」、checkpoint 是「持久化单元」、Send 是「动态并行入口」、interrupt 是「人机边界」**。

### 复杂度与性能分析

理解 LangGraph 的性能特征，才能做合理的架构决策：

| 指标 | 说明 |
| --- | --- |
| super-step 数量 | 等于「图的最长路径长度 × 循环迭代次数」，每轮有同步屏障开销 |
| 单轮延迟 | 取决于该轮**最慢**的节点（LLM 调用通常是大头） |
| 并行度 | 同一 super-step 内就绪节点数，受 CPU/异步 I/O 能力限制 |
| checkpoint 开销 | 每个 super-step 落一次盘，State 大时序列化成本不可忽略 |
| token 成本 | 与循环迭代次数、State 中 messages 长度成正比 |

**核心性能结论**：

1. **延迟瓶颈在 LLM 调用**，不在图调度本身——图调度的开销相对 LLM 的秒级延迟可忽略。
2. **减少 super-step 数量**能降低总延迟：把「串行的多次 LLM 调用」尽量合并成「同一轮的并行调用」。
3. **控制 State 里的 messages 长度**：messages 是 token 成本的主要来源，用窗口记忆（只保留最近 N 轮）控制成本。
4. **checkpoint 有开销**：高吞吐场景可对「不需要恢复的中间步骤」跳过 checkpoint，只在关键节点落盘。

---

## 面试常问

- **Q：LangGraph 是什么？** 用节点和边把 Agent 工作流建模成有状态图，解决循环、分支、多 Agent、断点恢复等复杂编排问题。
- **Q：State、Node、Edge 分别是什么？** State 是共享状态（信息载体），Node 是处理步骤（函数），Edge 是控制流（决定下一步）。
- **Q：条件边怎么用？** `add_conditional_edges` 配一个路由函数，函数根据 State 返回节点名，决定下一跳。
- **Q：Checkpointer 有什么用？** 持久化每一步 State，配合 `thread_id` 实现多轮记忆和断点恢复。
- **Q：LangGraph 和 LangChain 的关系？** LangChain 提供组件（Prompt/模型/工具），LangGraph 提供编排（图执行引擎），复杂流程用 LangGraph、简单流程用 LangChain Chain。
- **Q：什么是 super-step？** LangGraph 借鉴 BSP 模型，每轮「规划就绪节点→并行执行→reducer 归约→检查点」称为一个 super-step，用于统一处理并行、循环、分支。
- **Q：Reducer 是干什么的？** 决定节点返回的增量 dict「怎么合并回 State」，默认覆盖，列表用 `Annotated[list, add]` 追加，也可自定义（去重、取最大）。
- **Q：Send 解决什么问题？** 实现「运行时才知道数量」的动态并行扇出（map-reduce），节点返回 `Send` 列表派发子任务，结果按 reducer 归约。
- **Q：时间旅行怎么实现？** 用 `get_state_history` 拿历史 checkpoint，指定 `checkpoint_id` 重新 invoke，或用 `update_state` 改写历史 State 后重放。
- **Q：Human-in-the-loop 怎么实现？** 用 `interrupt_before`/`interrupt_after` 在节点前后暂停，或在节点内调 `interrupt()` 按条件暂停，人通过 `Command(resume=...)` 恢复。
- **Q：为什么 State 的列表字段要写 Annotated？** 默认 reducer 是覆盖，并行写会互相覆盖；写 `Annotated[list, add]` 改成追加语义。
- **Q：MemorySaver 和数据库 checkpointer 的区别？** MemorySaver 存内存，进程重启即失忆，只用于开发；生产要换 SqliteSaver/PostgresSaver 持久化，支持多实例共享。
- **Q：怎么防止 Agent 无限循环？** 设 `recursion_limit` 限制最大执行步数，加超时和监控。

---

## 相关知识

- [LangChain](/learn_ai/agent/LangChain)：LangGraph 基于它，提供模型、工具等组件
- [Agent 编排](/learn_ai/agent/Agent编排)：多 Agent 编排模式与框架选型
- [Function Calling](/learn_ai/agent/Function Calling)：Agent 循环里工具调用的底层能力
- [LLM 基础](/learn_ai/agent/LLM基础)：理解 Prompt、模型、Token 等前置概念
- [流式输出](/learn_ai/agent/流式输出)：LangGraph 中逐 token 输出的实现
- [RAG](/learn_ai/agent/RAG)：Agent 检索问答的知识来源，常作为图中的一个节点
- [向量数据库](/learn_ai/agent/向量数据库)：RAG 检索节点的存储底座
- [MCP](/learn_ai/agent/MCP)：Agent 连接外部工具/服务的标准化协议
