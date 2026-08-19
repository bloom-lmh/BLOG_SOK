# MCP

一句话定位：MCP（Model Context Protocol，模型上下文协议）是 Anthropic 在 2024 年 11 月开源的**开放标准协议**，它用「USB 接口」的方式统一了「大模型应用连接外部工具 / 数据源」这件事——任何 AI 应用（Host）只要支持 MCP，就能即插即用地连上任何实现了 MCP 的 Server，从而解决过去「N 个 AI 应用 × M 个数据源 = N×M 套定制连接器」的集成爆炸问题，让模型真正获得「读数据 + 做动作」的能力。

---

## 基础篇

### 为什么需要 MCP：M×N 集成爆炸

在没有 MCP 之前，AI 应用接入一个工具 / 数据源的做法是「谁用谁写」：

```
            数据源 A       数据源 B       数据源 C       数据源 D
           (Google Drive)  (Slack)      (数据库)       (GitHub)
  应用 1 ──────┼──────────────┼──────────────┼──────────────┼────── 一套定制代码
  应用 2 ──────┼──────────────┼──────────────┼──────────────┼────── 再一套定制代码
  应用 3 ──────┼──────────────┼──────────────┼──────────────┼────── 又一套定制代码

  集成工作量 = N(应用) × M(数据源) = 每加一个都要重写一次
```

以现实为例：Claude 接 Google Drive 要写一个插件，ChatGPT 接 Google Drive 要再写一个，你自研的 Agent 接 Google Drive 还要再写一个。三份代码做的事情几乎一样（鉴权、拉文件、转格式），却要写三遍、维护三遍。

MCP 的思路是**反转这个模型**：把「数据源 / 工具」封装成**标准 Server**，把「应用怎么连」标准化为**统一协议**，于是：

```
            数据源 A       数据源 B       数据源 C       数据源 D
              │              │              │              │
              ▼              ▼              ▼              ▼
          [MCP Server A] [MCP Server B] [MCP Server C] [MCP Server D]
              │              │              │              │
              └──────────────┴──────┬───────┴──────────────┘
                                    │  统一 MCP 协议（一次对接）
                                    ▼
                        [任何支持 MCP 的 AI 应用]

  集成工作量 = N(应用) + M(数据源) = 每加一个只写一次，之后处处复用
```

这就是 MCP 的核心价值：**把「M×N 的笛卡尔积」降成「M+N 的线性加和」**。每个数据源 / 工具写一次 Server，所有支持 MCP 的应用都能直接连；反过来，一个新应用只要实现 MCP Client，就能复用市面上所有现成的 Server。

| 对比维度 | 传统做法（每对一写） | MCP 做法（标准协议） |
| --- | --- | --- |
| 集成复杂度 | N×M（笛卡尔积） | N+M（线性） |
| 新增一个数据源 | 每个应用都要改 | 只写一个 Server |
| 新增一个应用 | 要对接所有数据源 | 复用现有 Server |
| 维护成本 | 每份定制代码各自维护 | Server 一处维护 |
| 生态复用 | 几乎无复用 | 社区共享、开源即用 |

::: tip 💡 面试题：MCP 解决的核心问题是什么？
MCP 解决「N 个 AI 应用 × M 个工具 / 数据源」的 M×N 集成爆炸：把集成复杂度从笛卡尔积（N×M）降为线性加和（N+M），做到「工具 / 数据源一次封装成 Server，任何支持 MCP 的应用即插即用」。类比 USB：设备（数据源）写一次驱动（Server），主机（AI 应用）插上就能用。
:::

### MCP 的精神鼻祖：LSP

MCP 这个思路不是凭空发明的，它的直接灵感来源是微软的 **LSP（Language Server Protocol，语言服务器协议）**。理解 LSP 就能秒懂 MCP 的动机。

- LSP 解决的：以前 VSCode / Vim / Emacs / IDEA 每个编辑器都要为每种语言（Java、Python、Rust…）各写一套「语法高亮 + 补全 + 跳转定义」插件，M 编辑器 × N 语言 = M×N 套插件。
- LSP 的解法：把「语言智能」抽成一个标准的 Language Server（每个语言写一个），编辑器只实现一个 LSP Client，就能对接所有语言。
- MCP 就是把 LSP 的这套思想从「编辑器 ↔ 语言」搬到「AI 应用 ↔ 工具 / 数据」：Server 封装能力，Client 统一对接，协议标准化。

所以面试问到「MCP 和 LSP 什么关系」时，一句话：**MCP 是「AI 时代的 LSP」，两者都靠「标准协议 + 一次开发处处复用」来消灭 M×N 集成爆炸**。

| 维度 | LSP（语言服务器协议） | MCP（模型上下文协议） |
| --- | --- | --- |
| 提出方 | 微软（2016） | Anthropic（2024） |
| 服务对象 | 代码编辑器 / IDE | AI 应用 / LLM |
| Server 封装 | 一种编程语言的智能（补全、跳转） | 一个工具 / 数据源的能力 |
| 解决的问题 | M 编辑器 × N 语言 | N 应用 × M 工具 / 数据源 |
| 底层协议 | JSON-RPC | JSON-RPC（同款） |

### 什么是 MCP

MCP 的正式定义可以用一句话概括：**一套基于 JSON-RPC 2.0 的、Client-Server 架构的开放协议，规范了「AI 应用如何发现、调用外部工具 / 数据」的全部交互**。

拆解这一定义里的三个关键词：

1. **开放协议**：任何人都能实现 Server 或 Client，不受厂商绑定（虽然由 Anthropic 提出，但已开放给全行业，OpenAI、Google 等也先后跟进支持）。
2. **基于 JSON-RPC 2.0**：MCP 的消息格式直接复用了 JSON-RPC 2.0 的请求 / 响应 / 通知规范，没有自己发明一套 RPC（详见[原理篇](#底层协议-为什么是-json-rpc-20)）。
3. **Client-Server 架构**：Server 是「能力提供方」，Client 是「能力消费者」，二者通过标准消息交互，模型本身并不直接和 Server 说话。

用一个形式化定义把结构描述清楚：

```
Host 应用（Claude Desktop / IDE / 你的 Agent）
   │  内嵌多个 Client
   ├── Client 1 ──(MCP 协议)──► Server 1 ──► 数据源/工具 A
   ├── Client 2 ──(MCP 协议)──► Server 2 ──► 数据源/工具 B
   └── ...
```

核心思想一句话：**模型不需要知道「数据在 Google Drive 还是本地数据库」，它只需要看到「有哪些工具、怎么调用」，其余交给 MCP 标准化处理**。

### 五个核心角色

MCP 架构里有几个容易混淆的角色，面试常考「Host 和 Client 有什么区别」。先把它们彻底分清：

| 角色 | 谁 | 职责 | 数量关系 |
| --- | --- | --- | --- |
| Host（宿主） | Claude Desktop、IDE、你自己的应用 | 承载 AI 对话、管理多个 Client 的生命周期 | 一个 Host 管多个 Client |
| Client（客户端） | 应用内嵌的 MCP 客户端 | 与**某一个** Server 建立一对一连线，转发模型调用 | 一个 Client 连一个 Server |
| Server（服务端） | 工具 / 数据源提供方 | 暴露工具、资源、提示词，执行实际动作 | 一个 Server 对应一个数据源 |
| 传输层（Transport） | stdio / Streamable HTTP | 承载双方 JSON-RPC 消息的物理通道 | 每种传输一条通道 |

**最容易踩的认知误区**：Host 和 Client 不是一回事。Host 是「整个应用」（比如 Claude Desktop 这个程序），Client 是「应用内部和某个 Server 建立的那条连接」。一个 Claude Desktop 可以同时连着 GitHub Server、数据库 Server、文件系统 Server，每个连接背后是一个独立的 Client 实例。

一张典型调用链路（务必背下来）：

```
用户提问
   │
   ▼
[Host] Claude Desktop / 你的应用
   │   （承载对话、管理多个 Client）
   ├──────────────► [Client 1] ──(stdio/HTTP)──► [Server: GitHub]
   │                     ▲                              │
   │                     └──────── 转发模型调用 ─────────┘
   ├──────────────► [Client 2] ──(stdio/HTTP)──► [Server: 数据库]
   └──────────────► [Client 3] ──(stdio/HTTP)──► [Server: 文件系统]
```

链路概括为：`Host → Client → (MCP 协议) → Server → 真实数据源`。注意**模型（LLM）永远只和 Host 说话，从不直接连 Server**——Server 对模型是透明的。

### 三种原语：Server 能暴露什么

一个 MCP Server 对外暴露的能力被统一归纳为**三种原语（Primitive）**，这是 MCP 最核心的分类，面试必考：

| 原语 | 含义 | 是否有副作用 | 触发方式 | 例子 |
| --- | --- | --- | --- | --- |
| Tools（工具） | 可执行的操作，模型可主动调用 | 有（会改变世界） | 模型根据上下文主动发起调用 | 查天气、发邮件、执行 SQL、写文件 |
| Resources（资源） | 只读数据，供模型读上下文 | 无（纯读取） | 模型按需读取，或应用预加载 | 文件内容、数据库 schema、配置项 |
| Prompts（提示词） | 可复用的提示词模板 | 无 | 用户 / 应用选择触发 | 固定的「代码审查」「周报生成」模板 |

用一句话区分三者的定位：**Tools 让模型「做事」，Resources 让模型「读数据」，Prompts 让模型「复用固定话术」**。

- Tools 是对模型的「手」的扩展——模型决策「调哪个、传什么参」，真正执行在 Server 端。
- Resources 是对模型「上下文」的扩展——把模型不知道的数据（私有文件、schema）以结构化方式提供给它读。
- Prompts 是对「人」的快捷方式——把常用的提示词模板沉淀成可复用的入口，避免每次手打。

::: tip 💡 面试题：MCP 的三种原语分别是什么？各解决什么问题？
Tools（可执行操作，让模型「做事」）、Resources（只读数据，让模型「读数据」）、Prompts（可复用的提示词模板，让人「复用话术」）。三者共同构成 Server 对外暴露的能力面；判断标准很简单——有副作用的用 Tool，纯读数据的用 Resource，固定话术用 Prompt。
:::

### 协议生命周期：从握手到调用

一个 MCP Server 从被拉起，到模型成功调用它的工具，要经历一个严格的生命周期。这条流程是理解 MCP 工作方式的骨架：

```
① 启动        Client 启动 Server（stdio 下是拉起子进程；HTTP 下是建立连接）
      │
      ▼
② 握手        Client 发 initialize 请求，双方交换协议版本、各自的能力
      │
      ▼
③ 初始化确认  Client 发 initialized 通知，握手正式完成
      │
      ▼
④ 能力发现    Client 发 tools/list、resources/list、prompts/list，拿到能力清单
      │
      ▼
⑤ 注入模型    Client 把工具清单（name + description + inputSchema）拼进模型上下文
      │
      ▼
⑥ 模型决策    模型判断"需要调工具"，输出 {工具名, 参数 JSON}
      │
      ▼
⑦ 调用转发    Client 把调用封装成 tools/call 请求，发给 Server
      │
      ▼
⑧ 执行返回    Server 执行真实操作，把结果封装成 content 返回
      │
      ▼
⑨ 回填模型    Client 把结果作为工具消息喂回模型，模型生成最终回答
      │
      ▼
（如模型还需再调工具，则回到 ⑥ 循环，直到模型不再需要工具）
```

这九步里，**①~④ 是「连接建立期」，只发生一次；⑥~⑨ 是「调用循环期」，每次模型调工具都走一遍**。理解这个两阶段的划分，是理解 MCP 性能模型的关键（连接成本只付一次，调用成本每次付）。

### 一个最小的 MCP Server（带「为什么」注释）

下面用官方 Python SDK 的 FastMCP 写一个最小 Server，暴露一个工具、一个资源、一个提示词。**为什么选 FastMCP**：它把「手写 JSON-RPC 消息」这一层藏了起来，用装饰器直接把 Python 函数变成协议里的工具，是官方推荐的上手方式。

```python
from mcp.server.fastmcp import FastMCP

# 为什么先创建 FastMCP 实例：它是整个 Server 的"注册中心"，
# 后续所有 @mcp.tool / @mcp.resource / @mcp.prompt 都要挂到它上面
mcp = FastMCP("weather-server")

# 为什么用装饰器 @mcp.tool：FastMCP 会自动把「函数名、docstring、参数类型注解」
# 序列化成协议里的"工具描述"（name + description + inputSchema），
# Client 端据此告诉模型"有哪些工具、每个工具怎么调"。
# 注意 docstring 不是写给程序员看的注释，它是会真正发给模型、影响模型决策的"说明书"。
@mcp.tool()
def get_weather(city: str) -> str:
    """查询指定城市的天气"""   # 这段 docstring = 发给模型的工具 description
    return f"{city}今天晴，25度"

# 为什么 resource 用 URI 定位：Resources 是"地址可寻址的只读数据"，
# URI 让 Client 能精确地"读某一块数据"，而不是一次性全拉回来。
@mcp.resource("greeting://{name}")
def get_greeting(name: str) -> str:
    """返回对指定名字的问候"""
    return f"你好，{name}！"

# 为什么 prompt 返回的是字符串模板：Prompt 原语的意义是"沉淀可复用的话术"，
# 它返回一段提示词文本，由 Host 交给用户或直接发给模型。
@mcp.prompt()
def code_review(code: str) -> str:
    """生成一段代码审查的提示词"""
    return f"请审查以下代码，指出潜在 bug 和改进建议：\n\n{code}"

if __name__ == "__main__":
    mcp.run()   # 默认用 stdio 传输，作为子进程被 Client 拉起
```

几个关键点（面试常问「工具的描述信息从哪来」）：

- **函数名 → 工具名**（`name`）
- **docstring → 工具描述**（`description`），这是模型「决定调不调这个工具」的主要依据
- **类型注解 → 参数 schema**（`inputSchema`），模型据此生成合法的参数 JSON
- **返回值 → 工具的 content**，会作为工具结果回填给模型

### 一个最小的 MCP Client

有 Server 就要有 Client 来连。下面用官方 SDK 写一个走 stdio 的 Client，展示「连接 → 初始化 → 发现工具 → 调用工具」的完整流程：

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def main():
    # 为什么用 stdio_client：它负责"拉起子进程 + 管理 stdin/stdout 消息流"，
    # 返回一对 (read, write) 流，ClientSession 靠它们收发 JSON-RPC 消息。
    server_params = StdioServerParameters(
        command="python",            # 用哪个命令拉起 Server 子进程
        args=["weather_server.py"],  # Server 脚本路径
    )

    # 为什么用 async with：stdio_client 和 ClientSession 都是异步上下文管理器，
    # 保证连接和会话在异常时也能正确关闭，不泄漏子进程。
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            # 为什么先 initialize：必须完成协议握手，双方才确认版本和能力，
            # 否则后续所有请求都会被 Server 拒绝。
            await session.initialize()

            # 为什么先 list_tools 再调用：Client 需要先拿到 Server 的能力清单，
            # 才能把工具描述注入模型、也才知道有哪些工具可以调。
            tools = await session.list_tools()
            print("可用工具:", [t.name for t in tools.tools])

            # 为什么 call_tool 传的是 (name, arguments) 两个字段：
            # 协议规定 tools/call 的参数就是 {name, arguments}，arguments 是 JSON 对象。
            result = await session.call_tool("get_weather", {"city": "北京"})
            print("工具返回:", result.content)

asyncio.run(main())
```

::: tip 💡 面试题：MCP Client 连接 Server 后，第一步必须做什么？
第一步必须是 `initialize` 握手——Client 和 Server 交换协议版本与能力（capabilities），双方确认兼容后才进入可用状态；不初始化就发其他请求会被拒绝。初始化完成后 Client 才 `list_tools` 发现工具清单，再把工具描述注入模型。
:::

### 一次调用是怎么跑通的（端到端）

把上面 Client 和 Server 串起来，看模型从「收到问题」到「调用工具拿到答案」的完整链路：

1. **握手**：Client 启动 Server 子进程，双方 `initialize`、交换协议版本；
2. **能力协商**：Server 上报自己有哪些 tools / resources / prompts（`tools/list` 等）；
3. **注入模型**：Client 把这些工具的 `name + description + inputSchema` 拼进模型上下文（这一步本质就是 [Function Calling](/learn_ai/agent/Function Calling) 的 tools 参数）；
4. **模型调用**：模型判断需要查天气，输出 `get_weather({"city": "北京"})`，Client 把它封装成 `tools/call` 请求转发给 Server；
5. **返回结果**：Server 执行真实函数，把 `{"type": "text", "text": "北京今天晴，25度"}` 作为 content 返回，Client 回填给模型，模型生成最终回答「北京今天晴，25 度」。

一句话：**MCP 负责「工具怎么被发现、怎么被调用」的协议层，Function Calling 负责「模型怎么输出调用请求」的能力层，两者在「注入模型」这一步交汇**。

---

## 高级篇

基础篇搭起的是「能跑」的 MCP，高级篇解决「能用、好用、安全」。这一篇展开工程化的关键升级。

### Tools vs Resources：什么时候用哪个（再深入）

基础篇给了原则「有副作用用 Tool，纯读用 Resource」，但真实场景要更精细。核心区别在于**模型的使用方式**：

| 维度 | Tools | Resources |
| --- | --- | --- |
| 副作用 | 有（改变世界） | 无（只读） |
| 触发方式 | 模型主动调用 | 模型按需读取，或应用预加载 |
| 是否可寻址 | 否（靠名字调用） | 是（靠 URI 定位） |
| 返回内容 | 执行结果（文本 / 图片等） | 结构化数据（文件、schema） |
| 典型场景 | 发邮件、写文件、改数据库 | 读文档、读 schema、读配置 |
| 类比 | 一个「函数」 | 一个「文件 / 接口」 |

一个常被问到的辨析：**「查数据库」该用 Tool 还是 Resource？**

- 如果这个查询**只读、无副作用**，且结果应该让模型「当背景资料读」，可以用 Resource；
- 但更常见的是用 **Tool**——因为「查数据库」往往带参数（查哪张表、什么条件）、需要模型动态构造查询，这正是 Tool「模型按参数主动调用」的语义。

所以判断顺序建议：**先看有没有副作用（有 → Tool），再看是否需要模型动态传参（需要 → Tool），再看是不是「固定地址的只读数据」（是 → Resource）**。

### 三种原语的完整生命周期与消息

每种原语背后都对应一组协议方法，理解「原语 → 协议方法」的映射，是读懂 MCP 抓包的关键：

| 原语 | 发现方法 | 读取 / 调用方法 | 说明 |
| --- | --- | --- | --- |
| Tools | `tools/list` | `tools/call` | 列出工具清单 → 按名调用 |
| Resources | `resources/list` | `resources/read` | 列出资源 → 按 URI 读 |
| Prompts | `prompts/list` | `prompts/get` | 列出模板 → 按名取模板文本 |

注意一个设计细节：**发现（list）和获取（call/read/get）是分开的两步**。发现阶段只返回「元信息」（名字、描述、schema），不返回真实数据；真正要数据时才用第二组方法按需拉取。这避免了「把整个数据库全量 dump 给模型」的灾难，是 MCP 的按需取用设计。

### 两种传输方式（以及新规范的演进）

MCP 的传输层负责「JSON-RPC 消息怎么在物理上送达」，这是决定部署形态的关键选型：

| 传输 | 通信方式 | 进程模型 | 适用场景 | 隔离性 |
| --- | --- | --- | --- | --- |
| stdio | 标准输入输出（子进程） | Server 是 Client 的子进程 | 本地单机、Claude Desktop、命令行工具 | 强（每 Server 独立进程） |
| Streamable HTTP | HTTP POST（可选 SSE 流式响应） | Server 是独立服务 | 远程 Server、多客户端共享、云部署 | 弱（靠网络 + 鉴权隔离） |

**历史演进**（面试考「MCP 的 HTTP 传输怎么演进的」）：

```
旧（HTTP + SSE，2025-03 之前）：  两个端点，POST 发消息 + GET 长连接收 SSE 流
                                 缺点：双向流复杂、代理/负载均衡难适配

新（Streamable HTTP，2025-03-26 引入）：单一端点，POST 请求 + 可选 SSE 响应流
                                 优点：一个 URL 搞定，对普通 HTTP 基础设施友好
                                 2025-06-18 起成为"推荐传输"，HTTP+SSE 被标记废弃
```

所以现在新项目选 HTTP 传输时，**优先用 Streamable HTTP，不要再用老的 HTTP+SSE**。

传输选型的决策依据：

- **stdio**：Server 和 Client 在同一台机器、同一生命周期内，追求简单和进程隔离（比如 Claude Desktop 本地跑的工具、CLI 工具）。缺点是只能本机用、不能跨网络共享。
- **Streamable HTTP**：Server 要部署在云端、被多个 Client / 多台机器共享（比如团队共用的「公司知识库 Server」）。缺点是多了网络开销、鉴权、运维成本。

::: tip 💡 面试题：MCP 的 stdio 和 HTTP 传输怎么选？
stdio 用于本地单机（Server 是子进程、通过标准输入输出通信），隔离性好、简单，是默认形态；Streamable HTTP 用于远程 / 共享场景（单一 POST 端点，可跨机器、多客户端共享）。本地工具用 stdio，团队共享的云服务用 HTTP。注意 2025-06-18 规范把 Streamable HTTP 定为推荐传输，老的 HTTP+SSE 已废弃。
:::

### MCP vs Function Calling

MCP 常被拿来和 [Function Calling](/learn_ai/agent/Function Calling) 比，很多人以为它们是竞争关系，其实**它们根本不在同一层**。这是面试最高频的辨析题：

| | Function Calling | MCP |
| --- | --- | --- |
| 是什么 | 模型的一种**能力**（能按 schema 输出调用请求） | 一套**协议**（规范工具如何被暴露和连接） |
| 解决 | 模型「能不能调工具」 | 工具「怎么被统一接入、发现、传输」 |
| 关注点 | 模型输出 `{name, arguments}` 的格式 | Server 的发现、握手、生命周期、传输、权限 |
| 层次 | 模型能力层 | 连接 / 集成层 |
| 关系 | MCP 的 Tools 最终往往通过 Function Calling 落地 | 上层连接标准 |

用一张图说明两者的关系：

```
[模型] ──Function Calling（模型输出"我要调 get_weather，参数北京"）
   │
   ▼
[Host 应用] ──MCP 协议（把这次调用封装成 tools/call，发给正确的 Server）
   │
   ▼
[Server] 执行真实函数，返回结果
```

一句话：**Function Calling 是模型的「手」，MCP 是「插手的标准插座」**。MCP 定义的是「工具如何被发现、描述、传输、调用」的协议，而模型「决定调哪个工具、生成什么参数」这个动作本身，还是靠 Function Calling 完成。两者互补，不是二选一。

### MCP vs RAG vs 微调

MCP 和 [RAG](/learn_ai/agent/RAG)、微调解决的是不同维度的问题，放在一起对比能更清楚 MCP 的定位：

| 方案 | 给模型补什么 | 解决什么问题 | 是否改模型 |
| --- | --- | --- | --- |
| RAG | 外挂「知识」 | 模型不知道私有 / 最新知识 | 否 |
| MCP | 外挂「工具 + 数据源」 | 模型不能读数据、不能做动作 | 否 |
| 微调 | 内化「能力 / 风格」 | 模型不擅长某类任务 / 格式 | 是 |

注意 MCP 和 RAG 也不是互斥的：一个 Server 暴露的 Resource 可能就是给 RAG 用的知识源；一个 Agent 可能同时用 RAG 补上下文、用 MCP 工具做动作。它们解决的分别是「不知道」和「做不到」。

### 项目里怎么用（接入 Agent 框架）

真实项目里很少手写 Client，而是通过 Agent 框架的适配器，把 MCP Server 暴露的工具「变成」Agent 能用的工具。下面是 LangChain 的接法（保留原示例并扩展）：

```python
# 为什么这里只关心"有哪些工具"，不关心工具来自哪：
# 这就是 MCP 的价值——对 Agent 来说，本地工具和 MCP 工具是同一抽象，
# 换数据源只换 Server 实现，业务代码不动。
from langchain_mcp_adapters.client import MultiServerMCPClient

# 为什么用 MultiServerMCPClient：一个 Agent 往往要同时连多个数据源，
# 它统一管理多个 Server 的连接，一次性拿到所有工具。
client = MultiServerMCPClient({
    "weather": {
        "command": "python",          # stdio 方式：拉起 Server 子进程
        "args": ["weather_server.py"],
    },
    "github": {
        "url": "https://mcp.github.com/mcp",  # HTTP 方式：连远程 Server
        "transport": "streamable_http",
    },
})

async def load_tools():
    # get_tools() 把"所有 Server 的所有工具"拉平成一份 Agent 工具列表，
    # 交给 LangChain 的 Agent 用（本质是转成 Function Calling 的 tools）。
    tools = await client.get_tools()
    return tools
```

接入后，Agent 看到的就是一份「扁平的工具列表」，它不区分这些工具是本地函数还是远程 MCP Server 提供的——这正是 MCP 抽象的价值所在。

### 安全与权限（HITL 人机交互）

MCP 让模型能「做动作」，随之而来的最大风险是**模型调了一个有副作用的工具，可能造成不可逆的破坏**（误删数据、乱发邮件）。这是 MCP 面试里越来越重要的一块。

核心机制是**人在回路（HITL，Human-In-The-Loop）**：

| 机制 | 做法 | 解决的风险 |
| --- | --- | --- |
| 工具审批 | 高风险工具（删除、转账）调用前弹确认框 | 模型误调有副作用工具 |
| 权限声明 | Server 声明每个工具需要的权限，Host 校验 | 越权访问 |
| 沙箱隔离 | Server 跑在受限环境，限制文件 / 网络访问 | 工具本身被攻击利用 |
| 审计日志 | 记录每一次 tools/call | 事后追责、排查 |

工程经验：

- **有副作用 vs 无副作用分开**：读操作可以放权，写操作（尤其 delete、send）必须人工确认。
- **最小权限原则**：Server 只暴露完成任务所需的最少工具，不要图省事把「全能工具」全暴露。
- **不要硬编码密钥**：Server 的鉴权信息（API key）通过环境变量注入，别写死在代码或配置里。

### 常见坑与对策总表

| 坑 | 原因 | 对策 |
| --- | --- | --- |
| 工具描述写太差，模型不调 | description 太笼统，模型不知道该不该用 | 用「何时用、参数含义、返回什么」三要素写清 description |
| 结果过大撑爆上下文 | 工具一次性返回巨量数据 | Server 端截断 / 分页返回，返回摘要而非全量 |
| 模型连续空转调工具 | 工具结果不清晰，模型反复重试 | 让工具返回明确的成功 / 失败和下一步建议 |
| stdio 日志污染协议流 | Server 把 `print` 打到 stdout，和 JSON-RPC 消息混在一起 | 日志一律走 stderr，stdout 只留协议消息 |
| 版本不兼容 | Client 和 Server 协议版本不一致 | 握手时校验 `protocolVersion`，做兼容处理 |
| 工具调用超时 | 慢工具（大查询）阻塞整个链路 | 设置超时、异步执行、进度通知 |
| 参数 schema 不严格 | 模型生成非法参数 | 用 `inputSchema` 声明类型和必填项，Server 端二次校验 |

其中「stdio 日志污染」是最经典、最容易踩的一个：**stdio 传输下，stdout 是 JSON-RPC 消息的专用通道，任何 `print` 都会污染协议流导致解析失败，日志必须打到 stderr**。

### 框架 / 方案选型对比表

| 维度 | MCP（Anthropic 协议） | OpenAI Function Calling | A2A（Agent2Agent，Google） |
| --- | --- | --- | --- |
| 本质 | 连接「应用 ↔ 工具 / 数据」的协议 | 模型「输出调用请求」的能力 | 连接「Agent ↔ Agent」的协议 |
| 解决层次 | 集成层 | 能力层 | 协作层 |
| 适用对象 | AI 应用 ↔ 外部工具 | 单个模型 ↔ 单个函数 | 多个 Agent 之间互操作 |
| 是否厂商绑定 | 开放标准 | OpenAI 系能力（各家有对应实现） | Google 发起，开放 |
| 典型用法 | 统一接入海量工具 / 数据源 | 单个 Agent 内调函数 | 多 Agent 系统协作 |

结论：三者**层次不同、可以叠加**。一个系统里，可以用 MCP 统一接入外部工具，模型用 Function Calling 输出调用请求，多个 Agent 之间再用 A2A 协作。

::: tip 💡 面试题：MCP 和 A2A 的区别？
MCP 解决「AI 应用怎么连接工具 / 数据源」（应用 ↔ 工具），A2A（Agent2Agent）解决「Agent 之间怎么互相调用、协作」（Agent ↔ Agent）。一个是「模型与世界的接口」，一个是「模型与模型的接口」，层次不同、可叠加使用。
:::

### 生态现状

MCP 已经形成可观的生态，面试聊「你知道哪些 MCP Server」时可以参考：

| 类别 | 典型 MCP Server |
| --- | --- |
| 文件 / 系统 | Filesystem、Memory、Fetch |
| 数据库 | PostgreSQL、MySQL、Redis、SQLite |
| 开发 | GitHub、GitLab、Docker、Kubernetes |
| 办公 | Google Drive、Notion、Slack、Confluence |
| 搜索 / 浏览器 | Brave Search、Playwright（浏览器自动化） |
| 通用平台 | 云厂商（AWS / Azure）各自的 MCP Server |

这些 Server 大都开源、即插即用，正是 MCP「一次开发处处复用」价值的体现。开发语言上，官方 SDK 以 Python 和 TypeScript 为主，Java、Go、C# 也有社区 / 官方实现。

---

## 原理篇

基础篇讲「是什么、怎么用」，原理篇讲「协议到底怎么设计、字节层发生了什么」。这一篇下到 JSON-RPC 消息级别，把 MCP 的底层机制彻底讲透。

### 底层协议：为什么是 JSON-RPC 2.0

MCP 没有自己发明一套消息格式，而是直接复用了 **JSON-RPC 2.0**。理解这个选择，能回答「为什么 MCP 的消息长这样」。

JSON-RPC 2.0 是一种极简的 RPC 协议，只定义了四种消息类型：

| 消息类型 | 结构 | 是否有响应 |
| --- | --- | --- |
| 请求（Request） | `{jsonrpc, id, method, params}` | 必有响应 |
| 响应（Response） | `{jsonrpc, id, result}` | 请求的应答 |
| 错误（Error） | `{jsonrpc, id, error: {code, message}}` | 请求的失败应答 |
| 通知（Notification） | `{jsonrpc, method, params}`（无 id） | 无响应 |

**为什么选 JSON-RPC 2.0 而不是 gRPC / 自定义格式**（面试常问）：

1. **简单可读**：JSON 文本，任何语言都能轻松序列化 / 反序列化，调试时抓包直接可读；
2. **传输无关**：JSON-RPC 只定义消息格式，不绑定传输层，所以 MCP 能同时跑在 stdio 和 HTTP 上；
3. **有成熟的 `id` 关联机制**：靠 `id` 把异步的请求和响应一一对应起来，天然支持并发；
4. **生态成熟**：几乎所有语言都有现成的 JSON-RPC 库，Server / Client 实现成本低。

`id` 关联是理解 MCP 异步通信的关键：Client 可以同时发多个请求，每个带不同 `id`，Server 响应时带上相同的 `id`，Client 就能把「哪个响应对应哪个请求」对上。没有 `id` 的就是通知（如 `initialized`、日志），不期待响应。

### 消息格式的源码级拆解

一个完整的 JSON-RPC 请求和响应长这样（以 `tools/call` 为例）：

```json
// 请求：Client → Server，调用 get_weather 工具
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": {
    "name": "get_weather",
    "arguments": { "city": "北京" }
  }
}
```

```json
// 响应：Server → Client，返回执行结果
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "content": [
      { "type": "text", "text": "北京今天晴，25度" }
    ],
    "isError": false
  }
}
```

```json
// 错误响应：调用失败时返回 error 字段
{
  "jsonrpc": "2.0",
  "id": 7,
  "error": {
    "code": -32602,
    "message": "Invalid params: missing required field 'city'"
  }
}
```

几个值得注意的协议细节：

- **`content` 是一个数组**：一次工具调用可能返回多个内容块（一段文字 + 一张图），所以是数组而非单个字符串。
- **`isError` 字段**：区分「工具执行失败」（业务错误）和「协议层错误」（JSON-RPC error）。工具执行失败时 `isError: true` 但仍算一次成功的 RPC 响应，方便模型感知「这次调用没成功」并调整策略。
- **错误码沿用 JSON-RPC 标准**：如 `-32602` 表示「参数非法」，`-32601` 表示「方法不存在」，`-32603` 表示「内部错误」。

### 内容块（Content Block）的类型

MCP 的返回内容不是简单的字符串，而是一组**内容块（Content Block）**，每种类型有明确的 `type` 字段：

| 内容块类型 | 结构 | 用途 |
| --- | --- | --- |
| 文本 | `{"type": "text", "text": "..."}` | 普通文本结果（最常见） |
| 图片 | `{"type": "image", "data": "<base64>", "mimeType": "image/png"}` | 返回图片（图表、截图） |
| 资源 | `{"type": "resource", "resource": {"uri": "...", "text": "..."}}` | 内嵌返回一个资源 |
| 嵌入资源 | `{"type": "embedded_resource", ...}` | 引用而非复制资源内容 |

设计成「多类型内容块数组」的原因：**模型本身是多模态的，工具的返回也应该多模态**。比如一个「生成报表」的工具，可以返回一段文字说明 + 一张图表图片，两块一起回填给模型。

### 初始化握手机制（协议级）

握手机制是 MCP 最核心的协议流程之一，它解决了「Client 和 Server 互相不认识，怎么确认能配合」的问题。完整的握手消息序列：

```
Client                                    Server
  │ ① initialize 请求                        │
  │  {protocolVersion: "2025-06-18",         │
  │   capabilities: {...},                   │
  │   clientInfo: {name, version}}           │
  │─────────────────────────────────────────>│
  │                                          │
  │ ② initialize 响应                        │
  │  {protocolVersion: "2025-06-18",         │
  │   capabilities: {tools:{}, resources:{}},│
  │   serverInfo: {name, version},           │
  │   instructions: "..."}                   │
  │<─────────────────────────────────────────│
  │                                          │
  │ ③ initialized 通知（无 id，不期待响应）   │
  │─────────────────────────────────────────>│
  │                                          │
  │ 双方进入就绪状态，可以开始 list_tools 等   │
```

逐字段拆解 `initialize` 请求：

- **`protocolVersion`**：声明自己支持的协议版本（如 `2025-06-18`）。Server 收到后，若版本不兼容可以拒绝，这就是「版本协商」。
- **`capabilities`**：声明自己支持哪些**能力**（Client 可能声明支持 sampling，Server 声明支持 tools/resources/prompts）。这是「能力协商」。
- **`clientInfo` / `serverInfo`**：双方自报身份（名字 + 版本），用于日志、诊断和兼容判断。

为什么握手要「先请求、后通知」两步？因为 `initialize` 是一个**需要响应的请求**（Client 要拿到 Server 的版本和能力做决策），而 `initialized` 是一个**无需响应的通知**（Client 只是告知「我准备好了」）。两步分离让双方都能在「正式开工」前完成必要的初始化。

### 协议版本演进（2024-11-05 → 2025-06-18）

MCP 的协议版本是面试里「显得有深度」的一个考点。核心版本线：

| 版本 | 时间 | 主要变化 |
| --- | --- | --- |
| `2024-11-05` | 2024-11 | 首个公开稳定版，定义三种原语、stdio + HTTP+SSE 传输 |
| `2025-03-26` | 2025-03 | 引入 Streamable HTTP、OAuth 鉴权、更好的资源模板 |
| `2025-06-18` | 2025-06 | Streamable HTTP 定为推荐传输、新增 Elicitation（服务端请求用户输入）、工具注解 |

理解版本演进的关键结论：

1. **协议在快速迭代**，生产系统要锁定具体版本，握手时做兼容判断。
2. **HTTP 传输经历了「HTTP+SSE → Streamable HTTP」的简化**，方向是「更贴近普通 HTTP 基础设施」。
3. **Elicitation 的引入**意味着 MCP 从「单向（模型调工具）」走向「双向（Server 也能反向请求输入）」，越来越像一个完整的交互协议。

### 工具 Schema 如何驱动 Function Calling

这是 MCP 和 [Function Calling](/learn_ai/agent/Function Calling) 交汇的机制核心。MCP Server 上报的工具描述里有一个 `inputSchema`（JSON Schema），Client 会把它**原样映射**成模型 Function Calling 的 `tools` 参数里的 `parameters` 字段：

```
MCP Server 上报（tools/list 返回）：
  {
    "name": "get_weather",
    "description": "查询指定城市的天气",
    "inputSchema": {
      "type": "object",
      "properties": {
        "city": { "type": "string", "description": "城市名" }
      },
      "required": ["city"]
    }
  }

        │  Client 做一次近乎透明的映射
        ▼

模型 Function Calling 的 tools 参数：
  {
    "type": "function",
    "function": {
      "name": "get_weather",
      "description": "查询指定城市的天气",
      "parameters": {   ← 就是上面的 inputSchema，几乎原样搬过去
        "type": "object",
        "properties": {
          "city": { "type": "string", "description": "城市名" }
        },
        "required": ["city"]
      }
    }
  }
```

为什么要用 **JSON Schema** 来描述参数？因为 JSON Schema 是「机器可读的参数契约」——模型靠它生成合法的参数 JSON，Server 靠它校验模型传的参数是否合法。**描述得越精确（类型、必填、取值范围、描述），模型调用得越准**。这也是「工具描述写不好模型就不调」的底层原因：`inputSchema` 和 `description` 是模型「看懂工具」的唯一依据。

### 传输层的机制：stdio vs Streamable HTTP

两种传输在字节层是怎么工作的，决定了它们的性能和安全特性。

**stdio 传输**：

```
Client 进程 ──fork/exec──► Server 子进程
     │                          │
     │── 写 JSON-RPC 消息到 stdin ──►│
     │◄── 从 stdout 读 JSON-RPC 响应 ──│
     │◄── 从 stderr 读日志（不进协议）──│

消息格式：一行一个 JSON（newline-delimited JSON），每个消息以换行符分隔
```

为什么 stdio 隔离性好：每个 Server 是独立子进程，进程崩溃不影响 Client 主进程，也天然共享了操作系统的进程隔离。代价是只能本机通信。

**Streamable HTTP 传输**：

```
Client ──HTTP POST──► http://server/mcp（单一端点）
     │    body: 一条 JSON-RPC 消息（Content-Type: application/json）
     │◄── 响应：普通 JSON（或 text/event-stream 的 SSE 流，用于长任务 / 流式输出）
```

为什么新规范用 Streamable HTTP 取代老的 HTTP+SSE：老方案要**两个端点**（一个 POST 发消息、一个 GET 开 SSE 长连接收流），对代理、负载均衡、鉴权都不友好；新方案收敛成**一个 POST 端点**，需要流式时用 SSE 作为响应体返回，更贴合常规 HTTP 服务形态。

### 采样（Sampling）：Server 反向请求模型

MCP 不是严格的「单向」协议——它有一个巧妙的能力叫**采样（Sampling）**，允许 Server 反过来请求 Client「帮我跑一次模型补全」。这打破了「只能模型调 Server」的直觉。

```
普通流程：  [模型] ──调工具──► [Server]
采样流程：  [Server] ──sampling/createMessage──► [Client] ──► [Host 的模型] ──返回补全──► [Server]
```

采样解决的真实场景：某个 Server 需要「对抓来的内容做摘要」「对代码做本地化改写」，但它自己不想（也不该）持有 API key 去调 LLM，于是**借用 Host 已经配好的模型**来完成。

关键点：

- 采样是 **Client 能力**（`capabilities.sampling`），Server 在握手时看到 Client 支持才会用；
- 对应协议方法是 `sampling/createMessage`，返回模型生成的文本；
- 它的意义在于**让「模型」成为 Server 可以调用的一个资源**，把 MCP 从「模型→工具」扩展成「模型↔工具」的双向能力。

::: tip 💡 面试题：MCP 的采样（Sampling）是什么？
Sampling 是 MCP 允许 Server 反向请求 Client 调用 LLM 的能力：Server 通过 `sampling/createMessage` 让 Host 用自己的模型做一次补全。它让「模型」成为 Server 可借用的资源，使 MCP 从单向（模型调工具）变成双向（Server 也能要模型干活），典型场景是 Server 需要摘要 / 改写内容又不想自己持有 API key。
:::

### 根目录（Roots）与 Elicitation

除了 Sampling，MCP 还有两个体现「双向 / 上下文注入」的机制：

- **Roots（根目录）**：Client 通过 `roots/list` 向 Server 暴露「当前工作上下文有哪些根路径」。这解决了一个真实问题——文件系统类 Server 需要知道「用户当前在哪个项目目录里」，才能读对文件。Roots 就是「Client 主动把环境上下文告诉 Server」的机制。
- **Elicitation（2025-06-18 新增）**：Server 通过 `elicitation/create` 反向请求「用户输入」。当 Server 执行到一半需要人提供额外信息（如「确认用哪个账号」「补充一个参数」）时，不再靠工具返回错误让模型转述，而是直接向用户要输入。这标志着 MCP 越来越像一个完整的「交互协议」而非纯「工具调用协议」。

### MCP 是「有状态」还是「无状态」

面试偶尔会问这个，答案要分传输讨论：

- **stdio 传输**：连接就是进程生命周期，天然「有状态」——握手、会话状态都在进程内存里，进程活着状态就在。
- **Streamable HTTP 传输**：HTTP 本身无状态，但 MCP 通过**会话 ID（session id）** 在多次 HTTP 请求间维持状态（握手后 Server 返回 session id，后续请求带上它）。

所以准确说法是：**MCP 是一个「有状态的会话协议」，其状态（握手结果、能力协商、分页游标）由连接（stdio）或会话 ID（HTTP）来维系**。理解这点有助于理解为什么 HTTP 模式下「断线重连」「会话过期」是需要处理的工程问题。

### 完整的协议消息流（一张图贯穿）

把前面所有机制串起来，看一个 Client 从启动到完成一次工具调用的全部协议消息：

```
[Client]                                                        [Server]
   │ ① initialize 请求（版本 + 能力 + 身份）                        │
   │─────────────────────────────────────────────────────────────>│
   │ ② initialize 响应（版本 + 能力 + 身份 + instructions）         │
   │<─────────────────────────────────────────────────────────────│
   │ ③ initialized 通知（无 id）                                   │
   │─────────────────────────────────────────────────────────────>│
   │ ④ tools/list 请求（发现工具）                                  │
   │─────────────────────────────────────────────────────────────>│
   │ ⑤ tools/list 响应（工具清单：name + description + inputSchema） │
   │<─────────────────────────────────────────────────────────────│
   │                                                               │
   │ ── 工具清单注入模型，模型决定调 get_weather ──                  │
   │                                                               │
   │ ⑥ tools/call 请求（name=get_weather, arguments={city:北京}）   │
   │─────────────────────────────────────────────────────────────>│
   │ ⑦ 执行真实函数，返回 content + isError                        │
   │<─────────────────────────────────────────────────────────────│
   │ ── 结果回填模型，模型生成最终回答 ──                            │
```

这 7 步里，①~③ 是「连接建立」、④~⑤ 是「能力发现」、⑥~⑦ 是「工具调用」。理解这条消息流，就读懂了 MCP 抓包、排查问题的全部依据。

---

## 面试常问

- **Q：MCP 是什么？** 大模型应用连接外部工具和数据源的开放标准协议，类似「AI 界的 USB 接口」，由 Anthropic 2024 年提出，基于 JSON-RPC 2.0。
- **Q：它解决什么问题？** 消除 N 个应用 × M 个数据源的一对一定制集成（M×N 爆炸），把集成复杂度降为 N+M，一次开发处处复用。
- **Q：三个 / 五个核心角色？** 三原语（Tools / Resources / Prompts）；五角色（Host、Client、Server、传输层、模型）。
- **Q：三种原语？** Tools（可执行操作，有副作用）、Resources（只读数据）、Prompts（提示词模板）。
- **Q：Host 和 Client 的区别？** Host 是整个应用（如 Claude Desktop），Client 是应用内部与某个 Server 建立的那条一对一连接；一个 Host 管多个 Client。
- **Q：Client 和 Server 的关系？** Client 嵌入应用，负责与 Server 建立连线、转发模型调用；Server 暴露工具 / 数据并执行实际操作。
- **Q：MCP 和 Function Calling 的区别？** FC 是模型「能按 schema 输出调用请求」的能力（能力层），MCP 是「工具如何被发现、连接、传输」的协议（集成层），MCP 的 Tools 最终靠 FC 落地。
- **Q：MCP 和 RAG 的区别？** RAG 给模型外挂「知识」，MCP 给模型外挂「工具和数据源」；一个解决「不知道」，一个解决「做不到」，常配合使用。
- **Q：MCP 和 LSP 的关系？** MCP 是「AI 时代的 LSP」，都靠「标准协议 + 一次开发处处复用」消灭 M×N 集成爆炸，且都基于 JSON-RPC。
- **Q：MCP 和 A2A 的区别？** MCP 连「应用 ↔ 工具 / 数据」，A2A 连「Agent ↔ Agent」，一个是模型与世界的接口，一个是模型与模型的接口。
- **Q：为什么底层用 JSON-RPC 2.0？** 简单可读、传输无关、靠 id 关联异步请求响应、生态成熟，所以能同时跑在 stdio 和 HTTP 上。
- **Q：stdio 和 HTTP 传输怎么选？** 本地单机用 stdio（子进程、隔离好），远程 / 共享用 Streamable HTTP（单端点、可跨机）。
- **Q：初始化握手做什么？** Client 发 initialize 请求、Server 回 initialize 响应（交换版本 + 能力 + 身份），Client 再发 initialized 通知，完成版本和能力协商。
- **Q：工具的描述信息从哪来？** 从工具定义里的 name（函数名）、description（docstring）、inputSchema（参数类型）序列化而来，是模型「看懂工具」的唯一依据。
- **Q：Sampling 是什么？** Server 反向请求 Client 调 LLM 的能力，让 Server 借用 Host 的模型做补全，使 MCP 从单向变双向。
- **Q：Resources 和 Tools 怎么区分？** 有副作用 / 需模型动态传参用 Tool，固定地址的只读数据用 Resource。
- **Q：怎么保证 MCP 安全？** 高风险工具人机审批（HITL）、最小权限、沙箱隔离、审计日志、密钥走环境变量。
- **Q：stdio 传输的经典坑？** Server 的 print 会污染 stdout 的协议流导致解析失败，日志必须打到 stderr。

---

## 相关知识

- [Function Calling](/learn_ai/agent/Function Calling)：MCP 工具最终落地的底层能力（模型输出调用请求）
- [RAG](/learn_ai/agent/RAG)：与 MCP 互补，给模型外挂「知识」而非「工具」
- [LangChain](/learn_ai/agent/LangChain)：通过 `langchain_mcp_adapters` 把 MCP 工具接入链 / Agent
- [LangGraph](/learn_ai/agent/LangGraph)：把 MCP 工具接入 Agent 循环进行编排
- [Agent 编排](/learn_ai/agent/Agent编排)：多 Agent 系统如何组织和协作（A2A 的落地场景）
- [LLM 基础](/learn_ai/agent/LLM基础)：理解模型、上下文、工具调用等前置概念
- [MySQL](/learn_database/MySQL)：MCP Server 最常接的数据源之一（只读查询场景）
- [Redis](/learn_database/Redis)：MCP Server 常接的缓存 / 数据结构数据源
