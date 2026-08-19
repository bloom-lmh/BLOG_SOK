# LangChain

一句话定位：LangChain 是围绕大模型做应用开发的**编排框架**，把「提示词模板、模型调用、数据检索、链式编排、Agent 工具、记忆」等能力抽象成统一接口并用「链（Chain）」的方式拼装，解决直接用模型 SDK 写业务时逻辑散、难复用、难维护、难切换模型的问题。

## 基础篇

### 为什么需要 LangChain

在 LangChain 出现之前，开发者用各家模型 SDK 写 AI 应用，代码大致长这样：

```python
# 直接调 OpenAI SDK：只能"发一条消息、收一条回复"
from openai import OpenAI

client = OpenAI(api_key="sk-xxx")

prompt = "把下面的内容翻译成英文：" + user_input          # 字符串硬拼接
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": prompt}],
)
print(resp.choices[0].message.content)
```

这段代码能跑，但一进入真实业务，问题立刻暴露出来：

| 工程问题 | 原生 SDK 的痛点 | 需要的抽象 |
| --- | --- | --- |
| 提示词管理 | 每次字符串拼接，模板散落各处、无法复用 | 带变量的 Prompt 模板 |
| 结构化输出 | 模型返回自由文本，要自己写正则/JSON 解析 | Output Parser |
| 多步流程 | 先查库、再总结、再生成，逻辑写死在一堆 if 里 | Chain 编排 |
| 换模型 | OpenAI 换 DeepSeek，SDK 和消息格式全要改 | 统一 Model 接口 |
| 外部工具 | 让模型查天气、算数，要自己搭循环 | Agent + Tool |
| 多轮对话 | 模型无状态，历史要自己存、自己拼 | Memory |
| 可观测 | 看不到中间过程，出问题没法查 | Callback / 追踪 |

LangChain 的目标就是把这些**工程问题抽象成可复用的「积木」**，让开发者像搭乐高一样拼装应用，而不是每换一个模型、每加一个步骤就重写一遍。它本身不训练模型、也不是模型供应商，它是在「模型」和「业务」之间加的一层**编排胶水**。

::: tip 💡 面试题：LangChain 到底是什么？
LangChain 是 LLM 应用开发的**编排框架（Orchestration Framework）**，不是模型、不是数据库。它把提示词、模型调用、检索、工具、记忆抽象成组件，并用链式/图式方式组装，解决模型 SDK 之上那一层「业务编排」的复用与维护问题。
:::

### 核心模块总览

LangChain 把整个 LLM 应用拆成六大模块，每个模块各管一件事，模块之间可以自由组合：

| 模块 | 作用 | 一句话理解 | 对应目录 |
| --- | --- | --- | --- |
| Model I/O | 和模型打交道 | 格式化输入 → 调模型 → 解析输出 | `langchain_core.prompts` / `language_models` / `output_parsers` |
| Retrieval | 检索外部数据 | 加载 → 切分 → 向量化 → 检索 | `langchain_core.documents` / `retrievers` |
| Chains | 把组件串成流水线 | 上一个的输出自动成为下一个的输入 | `langchain.chains` |
| Agents | 让模型自主决定调哪个工具 | 模型当「大脑」，工具当「手脚」 | `langchain.agents` |
| Memory | 跨轮次记住上下文 | 存历史对话，下次调用注入 | `langchain.memory` |
| Callbacks | 埋点与可观测 | 在关键节点触发日志/追踪 | `langchain_core.callbacks` |

一张全景图说明它们的关系：

```
                 ┌─────────────────────────────────────────────┐
                 │                 你的应用                      │
                 └─────────────────────────────────────────────┘
                                         │
                 ┌───────────────────────▼───────────────────────┐
                 │              Chain / Agent 编排层             │
                 │        （LCEL 管道 | 把组件串起来）             │
                 └──┬──────────┬──────────┬──────────┬──────────┘
                    │          │          │          │
              ┌─────▼───┐ ┌────▼────┐ ┌───▼────┐ ┌───▼─────┐
              │ Prompt  │ │  Model  │ │ Tool   │ │Memory   │
              │ 模板    │ │  调用   │ │ 工具   │ │ 记忆    │
              └─────┬───┘ └────┬────┘ └───┬────┘ └───┬─────┘
                    │          │          │          │
              ┌─────▼──────────▼──────────▼──────────▼─────┐
              │         Retrieval / VectorStore 数据层      │
              │     Document → Chunk → Embedding → 检索     │
              └────────────────────────────────────────────┘
```

### 安装与环境准备

LangChain 采用**分包**策略，按需安装，避免一次性拉入全部依赖：

```bash
# 核心包：只包含最基础的抽象（Runnable、消息、BaseModel 等），没有具体实现
pip install langchain-core

# 主包：Chains、Agents、Memory 等高层封装
pip install langchain

# 社区集成包：各家模型、向量库、文档加载器的具体实现都在这里
pip install langchain-community

# 各家模型 SDK 适配（按需装，不必全装）
pip install langchain-openai      # OpenAI 系
pip install langchain-anthropic   # Claude 系
pip install langchain-deepseek    # DeepSeek
```

三个包的分层关系，是理解 LangChain 架构的关键：

```
langchain          ← 高层封装（Chain / Agent / Memory）
     │
langchain-core     ← 核心抽象（Runnable / Message / BaseLanguageModel / BaseTool）
     │
langchain-community + langchain-<provider>  ← 具体实现（各家模型、向量库、加载器）
```

::: tip 💡 面试题：为什么要拆成 langchain-core / langchain / langchain-community 三个包？
为了**解耦核心抽象与具体实现**。`langchain-core` 定义接口（如 `BaseLanguageModel`、`Runnable`），第三方只要实现这些接口就能接入，不用依赖 LangChain 全家桶；`langchain-community` 集中放易变、数量庞大的集成实现，避免核心包臃肿。这也是 LangChain 能支持上百家模型和向量库的原因。
:::

### Model I/O 三件套

Model I/O 是 LangChain 最基础的模块，它把「调模型」这件事拆成标准三段：**格式化输入（Prompt）→ 调模型（Model）→ 解析输出（Parser）**。

```
用户输入 ──▶ Prompt 模板 ──▶ Model ──▶ Output Parser ──▶ 结构化结果
            （填变量）     （生成）     （解析成对象）
```

```python
# 为什么分三段：模型只认"字符串 prompt"、只吐"字符串结果"，
# 业务要的是"带变量的模板"和"结构化对象"，所以要有模板和解析器。

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import StrOutputParser

# 1. Prompt 模板：占位符让同一套话术复用给不同输入，避免字符串拼接
prompt = ChatPromptTemplate.from_template("把下面的内容翻译成{lang}：{text}")

# 2. 模型：统一接口，换模型只改这一行，业务代码不动
model = ChatOpenAI(model="gpt-4o-mini")

# 3. 输出解析器：把模型返回的 AIMessage 转成纯字符串
parser = StrOutputParser()

# 用 LCEL 的 | 管道符串起来：前一个输出自动成为后一个输入
chain = prompt | model | parser

result = chain.invoke({"lang": "英文", "text": "你好世界"})
print(result)  # "Hello world"
```

### Prompt 模板详解

Prompt 模板解决的是「同一套话术，输入不同变量」的复用问题。LangChain 里有几类模板：

| 模板类型 | 输入/输出 | 适用场景 |
| --- | --- | --- |
| `PromptTemplate` | 纯字符串模板 | 最简单的占位符替换 |
| `ChatPromptTemplate` | 消息列表模板 | 需要区分 system / user / assistant 角色 |
| `MessagesPlaceholder` | 预留一段消息列表 | 注入历史对话、多轮记忆 |
| `FewShotPromptTemplate` | 带示例的模板 | 给模型演示「输入→输出」范式（few-shot） |

**字符串模板 `PromptTemplate`**：

```python
from langchain_core.prompts import PromptTemplate

# 为什么用 {} 占位符：把"可变内容"和"固定话术"分离，
# 后续传入不同变量就能复用同一模板
template = PromptTemplate.from_template("给一个 {age} 岁的小孩解释什么是{concept}")

prompt_str = template.format(age=5, concept="黑洞")
print(prompt_str)  # "给一个 5 岁的小孩解释什么是黑洞"
```

**消息模板 `ChatPromptTemplate`**（最常用，因为现代模型都带角色）：

```python
from langchain_core.prompts import ChatPromptTemplate

# 为什么用角色元组：system 设定人设/规则，user 是用户输入，
# 角色区分让模型明确"哪些是约束、哪些是要处理的内容"
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一位严谨的技术讲师，回答务必给出示例。"),
    ("user", "请讲解：{topic}"),
])

messages = prompt.format_messages(topic="LCEL")
# 得到 [SystemMessage(...), HumanMessage("请讲解：LCEL")]
```

**带历史消息的模板 `MessagesPlaceholder`**（多轮对话的关键）：

```python
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

# 为什么用 MessagesPlaceholder：多轮对话时历史消息数量不定，
# 不能在模板里写死，而是留一个"槽位"，运行时把历史消息列表塞进去
prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个乐于助人的助手。"),
    MessagesPlaceholder("history"),        # 历史消息从这里注入
    ("user", "{input}"),
])
```

### 三种模型类型

LangChain 把「模型」统一抽象成几种基类，业务代码面向接口编程，不关心底层是哪家：

| 类型 | 输入 | 输出 | 例子 | 基类 |
| --- | --- | --- | --- | --- |
| LLM | 纯文本字符串 | 纯文本字符串 | 老的 `text-davinci-003` | `BaseLLM` |
| ChatModel | 消息列表（角色+内容） | 消息列表 | `gpt-4o`、`deepseek-chat`、`claude` | `BaseChatModel` |
| Embeddings | 文本 | 向量 | `text-embedding-3` | `Embeddings` |

现在**几乎都用 ChatModel**，因为它带角色（system/user/assistant），能更精细地控制模型行为，且各家新模型基本都走 chat 接口。

```python
from langchain_openai import ChatOpenAI
from langchain_openai import OpenAIEmbeddings

# ChatModel：输出的是 AIMessage 对象，不是裸字符串
model = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)
resp = model.invoke("你好")
print(type(resp))            # <class 'langchain_core.messages.ai.AIMessage'>
print(resp.content)          # 真正的文本在 .content 里

# Embeddings：文本 -> 浮点向量，用于检索/相似度
emb = OpenAIEmbeddings(model="text-embedding-3-small")
vec = emb.embed_query("什么是 LangChain")
print(len(vec))              # 1536，维度由模型决定
```

### 消息的四种角色

ChatModel 的输入输出是「消息列表」，每条消息都有 `role` 和 `content`：

| 消息类 | 角色 | 含义 | 谁产生 |
| --- | --- | --- | --- |
| `SystemMessage` | system | 设定人设、规则、边界（优先级最高） | 开发者 |
| `HumanMessage` | user | 用户输入 | 用户 |
| `AIMessage` | assistant | 模型回复 | 模型 |
| `ToolMessage` | tool | 工具执行结果 | 工具 |

```python
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

# 为什么 ToolMessage 单独一类：Agent 调工具后，工具结果必须以
# 明确的"tool 角色"回传，模型才能把结果和之前的调用对应起来（靠 tool_call_id）
tool_result = ToolMessage(
    content="北京今天晴，25度",
    tool_call_id="call_abc123",   # 对应模型那次工具调用的 id
)
```

### Output Parser 详解

模型吐出来的是自由文本，但业务要的是结构化对象。Output Parser 就是「文本 → 结构」的桥梁：

| Parser | 把输出解析成 | 适用场景 |
| --- | --- | --- |
| `StrOutputParser` | 纯字符串 | 直接展示文本 |
| `JsonOutputParser` | dict（自动 JSON 解析） | 想让模型返回 JSON |
| `PydanticOutputParser` | Pydantic 对象（带 schema 校验） | 需要强类型、字段校验 |
| `CommaSeparatedListOutputParser` | 字符串列表 | 让模型返回逗号分隔的列表 |

**结构化输出（面试高频）**，用 `PydanticOutputParser` 把「想要的格式」告诉模型：

```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

# 1. 用 Pydantic 定义"想要的结构"
class Joke(BaseModel):
    setup: str = Field(description="笑话的铺垫")
    punchline: str = Field(description="笑话的包袱")

# 2. 解析器会自动生成"格式说明"拼进 prompt，模型照此输出
parser = PydanticOutputParser(pydantic_object=Joke)

prompt = ChatPromptTemplate.from_messages([
    ("system", "回答必须符合下面的格式要求：\n{format_instructions}"),
    ("user", "给我讲个程序员笑话"),
]).partial(format_instructions=parser.get_format_instructions())

model = ChatOpenAI(model="gpt-4o-mini")
chain = prompt | model | parser

joke = chain.invoke({})
print(type(joke))          # <class '__main__.Joke'>
print(joke.punchline)      # 直接按字段访问，且经过 Pydantic 校验
```

::: tip 💡 面试题：怎么让大模型稳定返回结构化数据？
三个层次：① 用 `PydanticOutputParser`/`JsonOutputParser` 把格式要求写进 prompt；② 用模型自带的 **JSON 模式 / Function Calling** 约束输出 token 必须符合 schema；③ 用 Pydantic 在代码侧二次校验，不合规就重试。底层最可靠的是 Function Calling 的结构化输出，因为它从 token 采样层面就限制了格式。
:::

### LCEL：LangChain 表达语言

LCEL（LangChain Expression Language）是 LangChain 的核心语法，用 `|`（管道符）把组件串起来，类似 Unix 管道：

```python
chain = prompt | model | parser
# 读作：prompt 的输出 → model 的输入 → parser 的输入
```

它最重要的两个特性是**可组合**和**可流式**。所有组件都遵循同一个 `Runnable` 协议，因此拥有统一的方法族：

| 方法 | 作用 | 说明 |
| --- | --- | --- |
| `invoke(input)` | 同步调用，拿完整结果 | 最常用 |
| `stream(input)` | 流式输出，逐 token 返回 | 打字机效果 |
| `batch(inputs)` | 批量处理，内部并发 | 提高吞吐 |
| `ainvoke(input)` | 异步调用 | asyncio 场景 |
| `astream(input)` | 异步流式 | 异步逐 token |
| `abatch(inputs)` | 异步批量 | 异步并发 |
| `with_fallbacks(...)` | 失败回退到备用链 | 容错 |
| `with_config(...)` | 运行时注入配置/回调 | 埋点 |

```python
# 同一个 chain，四种调用方式
chain = prompt | model | parser

chain.invoke({"lang": "英文", "text": "你好"})      # 同步
for chunk in chain.stream({"lang": "英文", "text": "你好"}):   # 流式
    print(chunk, end="", flush=True)                # 逐 token 打印

chain.batch([{"lang": "英文", "text": "你好"},
             {"lang": "英文", "text": "世界"}])      # 批量
```

### 三个常用 Runnable 工具

LCEL 提供了一批「管道配件」，让编排更灵活：

| 工具 | 作用 | 场景 |
| --- | --- | --- |
| `RunnablePassthrough` | 原样透传输入 | 保留原始问题、透传变量 |
| `RunnableLambda` | 包装一个普通函数 | 在管道里插入任意 Python 逻辑 |
| `RunnableParallel` | 并行执行多个分支并合并 | 同时查库、同时取多个变量 |
| `RunnableBranch` | 条件路由 | 根据输入走不同分支 |

```python
from langchain_core.runnables import RunnablePassthrough, RunnableLambda, RunnableParallel

# RunnableLambda：把普通函数变成管道组件
# 为什么需要它：不是所有逻辑都现成的组件，自定义函数也要能"插"进管道
uppercase = RunnableLambda(lambda x: x.upper())
chain = prompt | model | uppercase

# RunnablePassthrough：输入是什么，就原样输出什么（保留上下文）
chain2 = {"原始输入": RunnablePassthrough(), "大写": RunnableLambda(lambda x: x.upper())}

# RunnableParallel：大括号里多个分支并行执行，结果合并成一个 dict
chain3 = RunnableParallel({"翻译": translate_chain, "摘要": summary_chain})
```

---

## 高级篇

### Chains：把步骤串成流水线

Chain 是「有顺序的多步调用」。最简单的 `prompt | model | parser` 就是一个 Chain。复杂一点的如「检索问答链」，把多个上游结果并行取回、合并后交给模型：

```python
# 为什么用 RunnablePassthrough：retrieval 的结果要拼回原问题里，
# 而 original question 本身还要原样传给模板，所以用 passthrough 透传。
from langchain_core.runnables import RunnablePassthrough
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

prompt = ChatPromptTemplate.from_template(
    "根据下面的资料回答问题：\n{context}\n\n问题：{question}"
)

retrieval_chain = (
    {"context": retriever, "question": RunnablePassthrough()}  # 并行取 context 和 question
    | prompt        # 两个变量填进模板
    | model         # 生成
    | StrOutputParser()
)

retrieval_chain.invoke("什么是 LCEL？")
```

Chain 的本质是**组合**：把多个 `Runnable` 串成一个大的 `Runnable`，外层看到的就是一个整体，可以再被组合、被流式、被批量。

### 用 RunnableParallel 做并行

`RunnableParallel` 是大括号 `{...}` 语法糖，它会**并发执行**多个分支，然后把结果按 key 合并成一个 dict：

```python
from langchain_core.runnables import RunnableParallel

# 为什么并行：翻译和摘要互相独立，串行是浪费时间，
# 并行执行后结果合并成 {"翻译": ..., "摘要": ...}
multi = RunnableParallel(
    翻译=translate_chain,
    摘要=summary_chain,
)
result = multi.invoke("LangChain is a framework...")
```

### 检索问答链的两种官方封装

对于 RAG 场景，LangChain 提供了两个更上层的现成方法，底层仍是 LCEL：

| 方法 | 作用 | 说明 |
| --- | --- | --- |
| `create_stuff_documents_chain` | 把检索到的文档「塞」进 prompt 生成 | 最简单的 RAG 生成链 |
| `create_retrieval_chain` | 把检索器 + 生成链包成完整问答链 | 一步到位，返回含 `context` 和 `answer` |

```python
from langchain.chains import create_history_aware_retriever
from langchain.chains import create_retrieval_chain
from langchain.chains.combine_documents import create_stuff_documents_chain
from langchain_core.prompts import ChatPromptTemplate

# 1. 生成链：文档内容 + 问题 → 答案
qa_prompt = ChatPromptTemplate.from_messages([
    ("system", "只根据上下文回答，不知道就说不知道。\n上下文：{context}"),
    ("user", "{input}"),
])
qa_chain = create_stuff_documents_chain(model, qa_prompt)

# 2. 完整链：问题 → 检索 → 生成，返回 {"answer", "context"}
rag_chain = create_retrieval_chain(retriever, qa_chain)
answer = rag_chain.invoke({"input": "什么是 LCEL？"})
```

### Agents：让模型自己决定做什么

Chain 的流程是**写死的**（先 A 再 B），Agent 则是**把控制权交给模型**：模型根据用户输入，自己决定调用哪个工具、调用几次、什么时候停。

```
Chain：输入 → A → B → C → 输出     （流程固定）
Agent：输入 → 模型判断 → 调工具? → 是：执行工具 → 把结果喂回模型 → 再判断 → ... → 输出
                          ↘ 否：直接输出
```

```python
# 为什么需要 Agent：固定链无法应对"动态"需求——用户可能问天气、可能让查库、可能让算数，
# 只有让模型自主规划工具调用，才能覆盖开放式任务。
from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.tools import tool
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

@tool
def get_weather(city: str) -> str:
    """查询指定城市的天气"""   # 为什么写 docstring：它会被拼进 prompt 告诉模型"这工具能干啥"
    return f"{city}今天晴，25度"

prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个能调用工具的助手。"),
    MessagesPlaceholder("chat_history"),
    ("user", "{input}"),
    MessagesPlaceholder("agent_scratchpad"),   # 放模型中间思考/工具调用记录
])

agent = create_tool_calling_agent(model, [get_weather], prompt)
executor = AgentExecutor(agent=agent, tools=[get_weather])

executor.invoke({"input": "北京天气怎么样？"})
# 模型判断需要调用 get_weather("北京") → 拿到结果 → 生成自然语言回答
```

Agent 的关键是**工具描述要写清楚**——模型靠读工具的 docstring 和参数 schema 决定要不要调、怎么调。工具描述写得好坏，直接决定 Agent 的准确率。

### Tool 的三种定义方式

工具（Tool）是 Agent 的「手脚」，把普通 Python 函数变成模型能调用的工具：

| 方式 | 写法 | 特点 |
| --- | --- | --- |
| `@tool` 装饰器 | 直接装饰函数 | 最简洁，函数名/docstring 自动成为工具描述 |
| `StructuredTool.from_function` | 手动指定 schema | 参数复杂时更可控 |
| `BaseTool` 子类 | 继承并实现 `_run` | 需要完整自定义（状态、异步）时 |

```python
from langchain_core.tools import tool

@tool
def multiply(a: float, b: float) -> float:
    """两个数相乘，返回乘积"""        # docstring 是模型的"使用说明书"
    return a * b

# 工具最终会被序列化成 schema 发给模型：
print(multiply.args_schema.schema())   # {"a": float, "b": float}
print(multiply.description)            # "两个数相乘，返回乘积"
```

### AgentExecutor 的常用参数

`AgentExecutor` 是 Agent 的运行时，负责「跑循环、管重试、兜底」：

| 参数 | 作用 |
| --- | --- |
| `max_iterations` | 最多执行多少轮（防止死循环） |
| `handle_parsing_errors` | 模型输出无法解析时是否自动重试 |
| `verbose` | 打印中间过程（调试用） |
| `return_intermediate_steps` | 是否返回中间的工具调用记录 |
| `early_stopping_method` | 达到最大轮数时的处理策略（force/generate） |

### Memory：让对话有记忆

模型本身无状态，每次调用都「失忆」。Memory 就是把历史对话存起来，下次调用时注入，让多轮对话连贯。

| Memory 类型 | 做法 | 优点 | 问题 |
| --- | --- | --- | --- |
| `ConversationBufferMemory` | 全部历史都塞进去 | 信息最全 | 长对话撑爆上下文 |
| `ConversationBufferWindowMemory` | 只保留最近 N 轮 | 控制 token | 丢早期信息 |
| `ConversationSummaryMemory` | 用模型把历史压缩成摘要 | 省 token | 多一次调用、可能丢细节 |
| `ConversationSummaryBufferMemory` | 摘要 + 最近几轮混合 | 平衡 | 实现复杂 |
| `ConversationTokenBufferMemory` | 按 token 数截断 | 精确控 token | 仍可能截断语义 |

```python
from langchain.memory import ConversationBufferWindowMemory

# 为什么只保留最近 N 轮：上下文窗口有限，
# 保留全部历史会把 token 烧光，窗口记忆在"连贯"和"成本"之间折中
memory = ConversationBufferWindowMemory(k=3, return_messages=True)
```

::: tip 💡 面试题：Memory 的核心问题是什么？怎么解决？
核心问题是**上下文窗口有限，历史对话不能无限塞**。解法演进：窗口截断（丢早期信息）→ 摘要压缩（丢细节）→ 摘要+最近几轮混合 → 最终主流做法是**把历史存进数据库，由 LangGraph 的 Checkpointer 按 `thread_id` 管理**，需要时按需加载，不再依赖 Memory 这个老 API。
:::

### Retrieval：和 RAG 集成

LangChain 把 RAG 的整套流程封装成标准组件：

```
Document Loader → Text Splitter → Embeddings → VectorStore → Retriever
```

| 组件 | 作用 | 常见实现 |
| --- | --- | --- |
| Document Loader | 读 PDF、网页、数据库等原始数据 | `PyPDFLoader`、`WebBaseLoader`、`CSVLoader` |
| Text Splitter | 把长文档切成 chunk | `RecursiveCharacterTextSplitter`（最常用） |
| Embeddings | 文本转向量 | `OpenAIEmbeddings`、`HuggingFaceEmbeddings` |
| VectorStore | 存向量 + 相似度检索 | Chroma、FAISS、Milvus、pgvector |
| Retriever | 统一检索接口 | `vectorstore.as_retriever()` |

```python
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma

# 1. 加载
loader = TextLoader("公司手册.txt")
docs = loader.load()

# 2. 切分：chunk_size 控制每段大小，overlap 保留边界上下文
splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
chunks = splitter.split_documents(docs)

# 3. 向量化 + 入库
vectorstore = Chroma.from_documents(chunks, OpenAIEmbeddings())

# 4. 转成统一的检索器接口
retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
retriever.invoke("什么是 LangChain")   # 返回 top-5 相关文档
```

### 多轮对话的 RAG：检索改写

单轮 RAG 直接用用户问题检索即可，但多轮对话里用户可能说「那它和 X 有什么区别」，**不带上下文**，直接检索会失败。解法是先用模型把问题改写成一个「独立的完整问题」再检索：

```python
from langchain.chains import create_history_aware_retriever

# 为什么需要改写：用户说"它呢"，指的是上一轮的某个东西，
# 模型要结合历史把它补全成"LangChain 和 LangGraph 有什么区别"
contextualize_prompt = ChatPromptTemplate.from_messages([
    MessagesPlaceholder("chat_history"),
    ("user", "{input}"),
    ("user", "把上面的问题改写成一个独立、完整的问题，不要回答它。"),
])
history_retriever = create_history_aware_retriever(model, retriever, contextualize_prompt)
```

### 流式输出

LangChain 的 `stream()` 让链逐 token 输出，实现打字机效果：

```python
chain = prompt | model | StrOutputParser()

# 为什么用 stream 而不是 invoke：长回答如果等全部生成完才显示，
# 用户会以为卡死了，流式让每个 token 一到就上屏，体验好得多
for chunk in chain.stream({"lang": "英文", "text": "你好世界"}):
    print(chunk, end="", flush=True)
```

### 多模型支持与切换

因为统一了 `BaseChatModel` 接口，切换模型只需改实例化那一行：

```python
# 换模型 = 换这一行，其余链式代码完全不变
from langchain_openai import ChatOpenAI
from langchain_deepseek import ChatDeepSeek

model = ChatOpenAI(model="gpt-4o-mini")      # OpenAI
# model = ChatDeepSeek(model="deepseek-chat")  # 换 DeepSeek
```

::: tip 💡 面试题：LangChain 怎么做到「换模型不改业务代码」？
靠**接口抽象**：所有 ChatModel 都实现 `BaseChatModel`（本质是 `Runnable`），统一 `invoke/stream/batch` 方法、统一消息格式。业务代码只依赖接口，不依赖具体厂商，所以换模型只改实例化处，链式编排零改动。
:::

---

## 原理篇

### Runnable 接口：一切组件的公约数

LangChain 能把 Prompt、Model、Parser、Retriever 自由用 `|` 拼接，根本原因是**它们都实现了同一个 `Runnable` 接口**。这个接口本质是一个「可调用 + 可组合」的抽象：

```python
# Runnable 核心抽象（简化示意）
class Runnable(ABC):
    def invoke(self, input, config=None) -> Any: ...      # 同步调用
    async def ainvoke(self, input, config=None) -> Any: ...# 异步调用
    def stream(self, input, config=None) -> Iterator: ...  # 流式
    def batch(self, inputs, config=None) -> list: ...      # 批量
    def __or__(self, other: "Runnable") -> Runnable: ...   # 管道符重载
    def __ror__(self, other: "Runnable") -> Runnable: ...  # 反向管道
```

因为大家都遵守同一个接口，所以任意两个 Runnable 都能「输出接输入」串起来，这是 LCEL 能成立的根本。`Runnable` 之于 LangChain，就像 `Iterator` 之于 Java 集合——是让整个生态可组合的「最小公约数」。

### LCEL 管道符的内部结构

`a | b` 并非魔法，它底层是 Python 的运算符重载，返回一个 `RunnableSequence`：

```
prompt | model | parser
        │
        ▼
RunnableSequence(
    first=RunnableSequence(first=prompt, last=model),
    last=parser
)
```

它的数据流是这样的：

```
        ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
input ─▶│   prompt    │────▶│    model    │────▶│   parser    │──▶ output
        │  (填变量)    │     │  (生成)      │     │  (解析)      │
        └─────────────┘     └─────────────┘     └─────────────┘
             dict              messages             str
```

每个上游的 `invoke` 输出，自动作为下游的 `invoke` 输入。`RunnableSequence` 自己也是个 `Runnable`，所以还能继续被拼进更大的链里——这就是「组合的递归性」。

**大括号 `{...}` 的本质**是 `RunnableParallel`：

```
{"context": retriever, "question": RunnablePassthrough()}
        │
        ▼
RunnableParallel(
    context  = retriever,                 # 分支一：去检索
    question = RunnablePassthrough(),      # 分支二：原样透传
)
```

`RunnableParallel` 会**并发**执行所有分支，等全部完成后再把结果按 key 合并成一个 dict 传给下游。

### Agent 工具调用的完整机制流程

Agent 之所以能「自主决定调工具」，底层依赖模型的 **Function Calling** 能力。完整流程如下：

```
1. 构建阶段
   工具的 docstring + 参数类型 ──序列化──▶ JSON Schema 数组
   [
     {"name": "get_weather", "description": "查询指定城市的天气",
      "parameters": {"type": "object", "properties": {"city": {"type": "string"}}}}
   ]

2. 第一轮推理
   prompt(含工具 schema) + 用户问题 ──▶ 模型返回 AIMessage
   模型不直接答，而是返回 tool_calls：
   AIMessage(content="", tool_calls=[{"name":"get_weather","args":{"city":"北京"},"id":"call_1"}])

3. 工具执行
   AgentExecutor 根据 tool_calls 调用真实函数：
   get_weather("北京") → "北京今天晴，25度"

4. 结果回填（关键）
   把工具结果包装成 ToolMessage，连同之前的 AIMessage 一起追加进消息列表：
   messages += [AIMessage(tool_calls=...), ToolMessage(content="北京今天晴，25度", tool_call_id="call_1")]

5. 第二轮推理
   把完整消息列表再次发给模型 → 模型结合工具结果，生成最终自然语言回答
```

```python
# 用底层消息流还原 Agent 的一次工具调用（不看封装，看本质）
from langchain_core.messages import HumanMessage, ToolMessage

tools = [get_weather]
model_with_tools = model.bind_tools(tools)   # 把工具 schema 绑进模型

messages = [HumanMessage("北京天气怎么样？")]
ai_msg = model_with_tools.invoke(messages)   # 第 1 轮：模型决定调工具
print(ai_msg.tool_calls)                     # [{"name":"get_weather","args":{"city":"北京"},"id":"..."}]

# 手动执行工具，把结果以 ToolMessage 回填
result = get_weather.invoke(ai_msg.tool_calls[0]["args"])
messages.append(ai_msg)                       # 模型"要调工具"的那条消息
messages.append(ToolMessage(content=result, tool_call_id=ai_msg.tool_calls[0]["id"]))

final = model_with_tools.invoke(messages)     # 第 2 轮：结合结果生成回答
print(final.content)
```

::: tip 💡 面试题：Agent 工具调用的底层是什么？
底层是模型的 **Function Calling** 能力：工具被序列化成 JSON Schema 放进 prompt，模型输出不是文本而是 `tool_calls`（工具名+参数），框架执行工具后把结果以 `ToolMessage` 回填，再让模型生成最终回答。这就是「模型当大脑、框架当手脚」的完整闭环，本质是**多轮消息流转**。
:::

### AgentExecutor 的状态机

`AgentExecutor` 内部是一个「判断 → 执行 → 回填 → 再判断」的循环状态机：

```
                ┌─────────────────────────────────────────────┐
                │                                             │
  输入 ──▶ [模型推理] ── 有 tool_calls? ── 是 ──▶ [执行工具] ──┘
                │                                      │
                否                                    ToolMessage 回填
                │                                      │
                ▼                                      ▼
           生成最终回答 ◀── 否? ── 是否达到 max_iterations?
                │                    │
                │                    是 → 按 early_stopping 策略兜底
                ▼
              输出
```

关键设计点：

1. **`max_iterations` 防死循环**：模型可能反复调同一个工具停不下来，必须设上限。
2. **`handle_parsing_errors` 兜底**：模型偶尔会输出无法解析成 tool_calls 的格式，开启后自动重试。
3. **`agent_scratchpad`**：放模型中间的思考/工具调用记录，是「循环」里信息不断累积的载体。

### 流式输出是怎么实现的

`chain.stream()` 能逐 token 返回，机制分两层：

```
上游模型（SSE 流） ──▶ 生成器逐块 yield ──▶ 下游 Runnable 逐块传递 ──▶ StreamStrOutputParser 拼接输出
```

- **底层**：模型 API 支持流式（SSE / streaming），一次只返回一个 token 块。
- **框架层**：`Runnable.stream()` 返回一个**生成器（异步迭代器）**，上游每产出一个 token 块，就 `yield` 给下游。
- **末端**：`StrOutputParser` 把一块块 token 拼成可读文本实时输出，实现打字机效果。

```python
# 流式的本质：生成器逐块产出，而不是一次性返回
for chunk in chain.stream(...):
    print(chunk, end="")   # 每收到一个 token 块就打印
```

### Callback：可观测性机制

调试 LLM 应用最麻烦的是「看不到中间过程」。LangChain 用 **Callback** 机制在关键节点触发回调：

```
事件流：chain_start → llm_start → llm_new_token(×N) → llm_end → chain_end
                              ↑
                    每产生一个 token 触发一次
```

| 回调钩子 | 触发时机 |
| --- | --- |
| `on_chain_start` / `on_chain_end` | 链开始/结束 |
| `on_llm_start` / `on_llm_end` | 模型调用开始/结束 |
| `on_llm_new_token` | 每产生一个 token |
| `on_tool_start` / `on_tool_end` | 工具调用开始/结束 |

```python
from langchain_core.callbacks import BaseCallbackHandler

# 为什么用 Callback：不用改业务代码，就能在关键节点挂上"钩子"，
# 用来打日志、统计 token、上报到 LangSmith 等追踪平台
class MyHandler(BaseCallbackHandler):
    def on_llm_start(self, *args, **kwargs):
        print("模型开始调用")
    def on_llm_new_token(self, token, **kwargs):
        print(token, end="", flush=True)   # 逐 token 打印，等价于手动实现流式

chain.invoke({...}, config={"callbacks": [MyHandler()]})
```

::: tip 💡 面试题：怎么给 LangChain 应用做可观测/追踪？
用 **Callback 机制**：LangChain 在 chain/llm/tool 的关键节点触发 `on_llm_start`、`on_llm_new_token` 等回调，你只需实现 `BaseCallbackHandler` 并通过 `config={"callbacks": [...]}` 注入，即可无侵入地打日志、统计 token、接入 LangSmith 做全链路追踪。**Callback 就是 LangChain 的埋点机制**。
:::

### LangChain 的架构分层

从依赖关系看，LangChain 采用「核心抽象 + 社区实现」的分层：

```
┌──────────────────────────────────────────────────────┐
│  langchain（高层）：Chains / Agents / Memory / Retrieval │
├──────────────────────────────────────────────────────┤
│  langchain-core（抽象）：Runnable / Message / BaseModel │
│             BaseTool / BaseRetriever / Callbacks        │
├──────────────────────────────────────────────────────┤
│  langchain-community + langchain-<provider>（实现）     │
│     OpenAI/DeepSeek/Anthropic + Chroma/Milvus + Loaders │
└──────────────────────────────────────────────────────┘
```

这层设计让 LangChain 变成「接口标准 + 实现生态」：第三方只需实现 `langchain-core` 的接口即可无缝接入，这也是它能覆盖上百家模型和向量库的原因。

### LangChain vs LangGraph vs 原生 SDK

| 方案 | 流程表达 | 状态/记忆 | 适用 |
| --- | --- | --- | --- |
| 原生 SDK | 一次调用 | 无 | 简单的一次性调用 |
| LangChain Chain | 直线（顺序/并行） | 老 Memory API | 线性流程、RAG、简单 Agent |
| LangGraph | 图（循环/分支/并行/汇合） | State + Checkpointer | 复杂多分支、循环、多 Agent 协作 |

```python
# Chain 只能表达"直线"
chain = prompt | model | parser

# 一旦出现循环（Agent 反复调工具）、条件分支、断点恢复，就得上图
# LangGraph 用 StateGraph 把这些表达成有状态的有向图（详见 LangGraph 笔记）
```

**核心判断**：流程出现「循环、条件分叉、多 Agent、断点恢复、人机协作」中任意一个，就该上 [LangGraph](/learn_ai/agent/LangGraph)；否则 LangChain 的 Chain 就够用。

---

## 面试常问

- **Q：LangChain 是什么？** 大模型应用编排框架。把 Prompt、模型、检索、Agent、记忆抽象成组件并用链式（LCEL）组装，解决直接调 SDK 时逻辑散、难复用、难维护的问题。

- **Q：LCEL 的 `|` 是什么？** 把两个 Runnable 串成一个 `RunnableSequence`。底层是 Python 运算符重载，前者的 `invoke` 输出自动作后者的 `invoke` 输入，让组件自由组合、流式、批量，且组合结果仍是 Runnable 可继续拼。

- **Q：Chain 和 Agent 的区别？** Chain 流程固定、按写死的顺序执行；Agent 由模型自主决定调哪个工具、调几次、何时停。一句话：Chain 是「流程写死」，Agent 是「模型决策」。

- **Q：Agent 工具调用的底层机制？** 依赖 Function Calling：工具序列化成 JSON Schema 给模型，模型输出 `tool_calls`，框架执行工具后用 `ToolMessage` 回填，再让模型生成最终回答，本质是多轮消息流转。

- **Q：Memory 的作用和问题？** 存储并注入历史对话让多轮连贯。但全部塞入会撑爆上下文，所以有窗口截断、摘要压缩、摘要+窗口混合等策略，现代主流是用 LangGraph Checkpointer 按 `thread_id` 管理。

- **Q：LangChain 和 LangGraph 的区别？** LangChain 提供组件（Prompt/模型/工具）和线性 Chain，适合快速搭 RAG、简单 Agent；LangGraph 用有状态图处理循环、分支、多 Agent、断点恢复等复杂流程，两者常配合使用。

- **Q：怎么让模型稳定输出结构化数据？** 用 `PydanticOutputParser`/`JsonOutputParser` 把格式写进 prompt，或用模型的 JSON 模式/Function Calling 从采样层面约束格式，再用 Pydantic 在代码侧校验，不合规就重试。

- **Q：Callback 有什么用？** LangChain 的埋点机制。在 chain/llm/tool 关键节点触发回调，用于打日志、统计 token、接入 LangSmith 做全链路追踪，无需改动业务代码。

---

## 相关知识

- [RAG](/learn_ai/agent/RAG)：LangChain 把 RAG 各环节封装成标准组件
- [向量数据库](/learn_ai/agent/向量数据库)：LangChain 的 VectorStore 封装了它的读写
- [LLM 基础](/learn_ai/agent/LLM基础)：理解 Prompt、模型、Token 等前置概念
- [Agent 编排](/learn_ai/agent/Agent编排)：LangChain Agent 的进阶与多 Agent 协作
- [LangGraph](/learn_ai/agent/LangGraph)：处理复杂有状态流程的图编排框架
- [Function Calling](/learn_ai/agent/Function Calling)：Agent 工具调用的底层能力
- [MCP](/learn_ai/agent/MCP)：给 Agent 统一接入外部工具和数据源的标准协议
- [流式输出](/learn_ai/agent/流式输出)：LangChain 逐 token 输出的实现细节
