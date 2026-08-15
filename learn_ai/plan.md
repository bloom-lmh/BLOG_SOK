# AI 6个月转型计划

这是一份以 `前端 / 软件工程 -> AI 应用工程` 为主线的 6 个月学习计划。主目标是先补 Python、后端和 AI 应用开发能力，再逐步进入 RAG、Agent、MCP、LangGraph 与面试准备；每周总投入按 15-20 小时估算，优先保证有代码产出。

## 资料库

| 模块 | 主资料 | 用法 |
| --- | --- | --- |
| Python 入门 | [Python 官方教程中文](https://docs.python.org/zh-cn/3/tutorial/) | 查语法、补基础 |
| Python 视频课 | [CS50 Python](https://cs50.harvard.edu/python) | 跟练习，建立手感 |
| FastAPI | [FastAPI 中文教程](https://fastapi.tiangolo.com/zh/tutorial/) | 学接口开发 |
| HTTP 基础 | [MDN HTTP Overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview) | 补网络请求基础 |
| 参数校验 | [Pydantic Docs](https://docs.pydantic.dev/latest/concepts/models/) | 学请求体和校验 |
| SQL / Postgres | [PostgreSQL Tutorial](https://www.postgresql.org/docs/current/tutorial.html) | 补数据库基础 |
| SQL 课程 | [CS50 SQL](https://cs50.harvard.edu/sql/) | 跟着做 SQL 练习 |
| Docker | [Docker Get Started](https://docs.docker.com/get-started/) | 项目容器化和部署 |
| LLM 基础 | [Hugging Face LLM Course 中文](https://huggingface.co/learn/llm-course/zh-CN/chapter1/1) | 建立大模型基础认知 |
| OpenAI 文档 | [OpenAI Docs](https://platform.openai.com/docs/overview) | 学 prompt、streaming、tools |
| Anthropic Tool Use | [Anthropic Tool Use Docs](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview) | 学工具调用和 Agent 基础能力 |
| Embedding | [Embeddings Guide](https://platform.openai.com/docs/guides/embeddings) | 学向量表示和语义检索 |
| Retrieval / RAG | [Retrieval Guide](https://platform.openai.com/docs/guides/retrieval) | 学 RAG 基础 |
| 向量库 | [pgvector](https://github.com/pgvector/pgvector) | 做本地向量检索 |
| Agent | [HF Agents Course 中文](https://huggingface.co/learn/agents-course/zh-CN/unit0/introduction) | 学工作流和多步任务 |
| MCP | [Anthropic MCP Docs](https://docs.anthropic.com/en/docs/mcp) | 学模型如何连接外部工具与上下文 |
| LangGraph | [LangGraph Docs](https://docs.langchain.com/langgraph) | 学 Agent 工作流编排 |
| LangChain | [LangChain Docs](https://docs.langchain.com/oss/python/langchain/overview) | 作为快速搭建与对比框架参考 |
| Claude Code SDK | [Claude Code SDK Docs](https://docs.anthropic.com/en/docs/claude-code/sdk) | 学官方 Agent SDK 的使用方式 |
| Claude Agent 源码阅读 | [claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python) | 学消息流、工具接口与工程组织方式 |
| ML 基础 | [Google ML Crash Course](https://developers.google.com/machine-learning/crash-course) | 补训练与评估基础 |
| PyTorch | [PyTorch Learn the Basics](https://docs.pytorch.org/tutorials/beginner/basics/intro.html) | 跑通训练流程 |
| 深度学习快览 | [60 Minute Blitz](https://docs.pytorch.org/tutorials/beginner/deep_learning_60min_blitz.html) | 快速过一遍训练核心 |
| Transformer 认知 | [Stanford CS224N](https://web.stanford.edu/class/cs224n/) | 面试时补底层认知 |
| 前端整合 | [Next.js Learn](https://nextjs.org/learn) | 用 TS 做 AI 前端 |
| TS AI 集成 | [Vercel AI SDK Docs](https://vercel.com/docs/ai-sdk) | 做流式聊天和交互 |

## 总体里程碑

| 月份 | 重点 | 产出 |
| --- | --- | --- |
| 第1个月 | Python + FastAPI + SQL + Docker 入门 | 一个基础 API 项目 |
| 第2个月 | LLM 基础、Prompt、Streaming、聊天应用 | AI 文本工具 + 聊天助手 v1 |
| 第3个月 | Embedding、检索、RAG | 知识库问答系统 v1 |
| 第4个月 | Agent、Tool Use、MCP、LangGraph、结构化输出 | 自建智能体 v1 + 垂直场景 AI 项目 |
| 第5个月 | ML / PyTorch / Transformer 基础 + Agent 架构补充 | 小型训练实验 + 面试笔记 + Agent 架构笔记 |
| 第6个月 | 项目打磨、简历、部署、投递 | 2 个主项目 + 1 个小项目 + 简历 |

## 24周周计划

| 周次 | 学习重点 | 去哪里学 | 本周任务 | 过关标准 |
| --- | --- | --- | --- | --- |
| 1 | Python 语法、变量、函数、循环 | Python 官方教程 1-5 章 + CS50 Python 前几讲 | 写 3 个小脚本：计算器、文本统计、JSON 读写 | 能独立写函数和循环 |
| 2 | 列表、字典、文件、异常、模块 | Python 官方教程后续 + CS50 Python | 写脚本：批量处理 txt / csv 文件 | 会读写文件，会 try/except |
| 3 | 面向对象、venv、pip、项目结构 | Python 官方教程 + 自己动手建项目 | 新建一个 Python 项目，整理依赖 | 会建环境、装包、跑脚本 |
| 4 | FastAPI 路由、请求参数、返回值 | FastAPI 教程前半 + MDN HTTP | 做 hello api 和 notes api | 会 GET / POST，能打开接口文档 |
| 5 | Pydantic、校验、错误处理 | FastAPI 请求体部分 + Pydantic | 给 notes api 加校验和错误处理 | 会定义 schema |
| 6 | SQL、Postgres、CRUD | PostgreSQL Tutorial + CS50 SQL | 建表、插入、查询、更新、删除 | 会最基本 CRUD |
| 7 | Python 接数据库、接口改造 | FastAPI 教程相关章节 | 把 notes api 接到 Postgres | 接口数据能落库 |
| 8 | Docker 基础、服务容器化 | Docker Get Started | 给 API 和数据库加 Docker | 本地一条命令起服务 |
| 9 | LLM 基础、token、prompt | HF LLM Course 第 1 章 + OpenAI prompting | 命令行版文本总结器 | 能用 API 做总结和改写 |
| 10 | system prompt、few-shot、参数 | OpenAI prompting | 做网页版 AI 文本工具 | 前后端打通 |
| 11 | streaming、聊天基础 | OpenAI streaming + Next.js / Vercel AI SDK | 做聊天助手 v1 | 页面支持流式输出 |
| 12 | 多轮对话、历史记录 | OpenAI 相关聊天文档 | 给聊天助手加会话管理 | 能连续对话 |
| 13 | function calling / tools | OpenAI function calling + Anthropic Tool Use | 给聊天助手加 1-2 个工具 | 模型能调工具再回答 |
| 14 | embedding 基础、相似度检索 | Embeddings Guide | 做 embedding demo | 会做相似文本检索 |
| 15 | top-k、向量检索链路 | Retrieval Guide + pgvector | 做语义搜索 demo | query 能返回相关片段 |
| 16 | RAG 项目 v1 | Retrieval Guide + LLM Course 检索章节 | 开始知识库问答系统 | 支持上传文档和问答 |
| 17 | 文档切块、引用、召回优化 | Retrieval Guide 相关示例 | 给 RAG 加引用来源 | 回答有证据片段 |
| 18 | 项目打磨、部署 | Docker + FastAPI 部署文档 | 部署 RAG 项目 | 有可演示版本 |
| 19 | Agent 概念、任务分解、单工具 Agent | HF Agents Course Unit 0-1 + Anthropic Tool Use | 做一个单工具 Agent demo | 能解释 Agent 和普通 prompt 的区别，并跑通一次工具调用 |
| 20 | MCP、结构化输出、LangGraph 入门 | Anthropic MCP Docs + LangGraph Docs + OpenAI structured outputs | 给 Agent 接 1 个 MCP / tool，并做一个工作流 demo | 能完成至少一条多步工作流 |
| 21 | 自建智能体项目 v1 | LangGraph Docs + Claude Code SDK Docs | 做垂直场景 AI 项目 v1 | 能自己设计一条完整 Agent 链路，并完成一个可演示版本 |
| 22 | PyTorch 张量、模型、训练循环 | PyTorch Learn the Basics | 做一个文本分类小实验 | 跑通训练和验证 |
| 23 | Transformer、Attention、RAG vs 微调、Agent 架构阅读 | CS224N 选学 + Transformer 论文摘要 + Claude Agent 源码阅读 | 整理面试讲稿和 Agent 架构笔记 | 5 分钟讲清核心概念，并说明一个真实 Agent 系统由哪些部分组成 |
| 24 | 简历、README、模拟面试、投递 | 回看项目和资料 | 完成项目说明、简历和投递清单 | 达到可投递状态 |

## 2026年4月2日-2026年4月7日计划

| 日期 | 星期 | 当天重点 | 学习资料 | 具体任务 | 当天产出 | 完成标准 | 预计用时 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-04-02 | 星期四 | Python 环境搭建与语法起步 | Python 官方教程 1-2 章；CS50 Python 起步部分 | 安装 Python；创建虚拟环境；跑通 `hello world`；学习变量、字符串、输入输出、基础运算 | 本地 Python 环境；`hello.py`；一份当天笔记 | 能独立运行 Python 脚本；知道如何激活虚拟环境；能写简单输入输出程序 | 2.5 小时 |
| 2026-04-03 | 星期五 | 函数、条件、循环 | Python 官方教程 3-5 章；CS50 Python 对应内容 | 学习 `if`、`for`、`while`、函数定义与参数；完成一个命令行计算器脚本 | `calculator.py` | 能把重复逻辑封装成函数；计算器至少支持加减乘除中的 2-3 个操作；能解释 `if` 和循环的基本用法 | 3 小时 |
| 2026-04-04 | 星期六 | 小脚本练习与本周整理 | Python 官方教程数据结构入门部分；回看前两天笔记 | 写一个文本统计脚本；统计字符数、单词数或行数；整理本周代码文件；补一个简短 README 或学习记录 | `text_stats.py`；本周代码目录；简短 README / 笔记 | 能独立读取文本并输出统计结果；代码和笔记有基本整理；本周产出可回看 | 3.5 小时 |
| 2026-04-05 | 星期日 | 周复盘与下周准备 | 回看 Python 官方教程已学部分；回看本周代码 | 复盘本周学会了什么、卡点是什么；列出下周 3 个最重要任务；准备 1 个 `.json` 示例文件和 1 个 `.txt` 示例文件，供下周练习使用 | 一份周复盘；`sample.json`；`sample.txt` | 能说清本周已经掌握和还不会的内容；下周任务明确；下周练习样例文件准备好 | 2 小时 |
| 2026-04-06 | 星期一 | 文件读写与 JSON 处理 | Python 官方教程文件部分；Python `json` 模块基础用法 | 学习文件打开、读取、写入；练习 JSON 的读取和写回；完成一个简单 JSON 读写脚本 | `json_io.py` | 能读写本地 `.txt` 和 `.json` 文件；知道字符串、字典、列表在 JSON 场景里的基本转换 | 3 小时 |
| 2026-04-07 | 星期二 | 异常处理与 notes api 预备 | Python 官方教程异常部分；FastAPI 中文教程起步部分（只做预习） | 学习 `try/except`；给 JSON 读写脚本补异常处理；设计一个最小 notes 数据结构；预习 FastAPI 的启动方式和接口长什么样 | 带异常处理的 `json_io.py`；一份 notes 数据结构草稿 | 能用 `try/except` 处理常见文件错误；能写出 notes 的基础字段；知道 FastAPI 后续要解决什么问题 | 3 小时 |
