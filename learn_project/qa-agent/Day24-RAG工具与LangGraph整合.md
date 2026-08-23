# Day 24 · MCP + RAG + LangGraph 完整整合

> **今天目标**：让 LangGraph 根据问题选择知识库、MCP 课程工具或两者并行，再统一生成答案。至此，前面独立学习的 RAG、工具协议和工作流真正进入同一条业务链路。

## 一、今天的调用关系

```text
用户问题
   ↓
LangGraph 分类
   ├─ rag ─────→ RAG Pipeline ─┐
   ├─ catalog ─→ MCP Client ───┤→ 汇总回答
   ├─ both ────→ 两者并行 ─────┘
   └─ direct ──→ 普通模型回答
```

MCP Server 不直接调用模型；它只发布能力。LangGraph 里的应用代码通过 MCP Client 调用它，这个边界是面试中需要说清楚的。

## 二、MCP Gateway（完整代码）

创建 `app/mcp_gateway.py`：

```python
from mcp import Client
from mcp.server import MCPServer

from app.mcp_server import mcp


class CourseMCPGateway:
    def __init__(self, server: MCPServer) -> None:
        self.server = server

    async def search_courses(
        self,
        keyword: str,
        limit: int = 5,
    ) -> list[dict[str, object]]:
        async with Client(self.server) as client:
            result = await client.call_tool(
                "search_courses",
                {"keyword": keyword, "limit": limit},
            )

        if result.is_error:
            message = result.content[0].text if result.content else "未知 MCP 错误"
            raise RuntimeError(f"MCP 课程搜索失败：{message}")

        payload = result.structured_content or {}
        courses = payload.get("courses", [])
        if not isinstance(courses, list):
            raise RuntimeError("MCP 返回的 courses 格式错误")
        return [dict(item) for item in courses if isinstance(item, dict)]


def get_course_mcp_gateway() -> CourseMCPGateway:
    return CourseMCPGateway(mcp)
```

Gateway 的作用是隔离 MCP SDK 数据类型。图和 API 只看到普通 Python 字典，将来从进程内 MCP 改成远程 URL 时，业务层不需要重写。

## 三、整合工作流（完整代码）

创建 `app/agent/integrated_graph.py`：

```python
import asyncio
from functools import lru_cache
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from app.llm.base import ChatMessage, ChatModel
from app.llm.factory import get_chat_model
from app.mcp_gateway import CourseMCPGateway, get_course_mcp_gateway
from app.rag.pipeline import RAGPipeline, get_rag_pipeline

Route = Literal["rag", "catalog", "both", "direct"]


class IntegratedState(TypedDict, total=False):
    question: str
    route: Route
    rag_answer: str
    citations: list[dict[str, object]]
    courses: list[dict[str, object]]
    answer: str


class IntegratedCoachGraph:
    def __init__(
        self,
        rag: RAGPipeline,
        gateway: CourseMCPGateway,
        model: ChatModel,
    ) -> None:
        self.rag = rag
        self.gateway = gateway
        self.model = model
        self.graph = self._build_graph()

    def _build_graph(self):
        builder = StateGraph(IntegratedState)
        builder.add_node("classify", self.classify)
        builder.add_node("rag", self.retrieve_knowledge)
        builder.add_node("catalog", self.search_catalog)
        builder.add_node("both", self.retrieve_both)
        builder.add_node("direct", self.direct_answer)
        builder.add_node("synthesize", self.synthesize)

        builder.add_edge(START, "classify")
        builder.add_conditional_edges(
            "classify",
            self.after_classify,
            {
                "rag": "rag",
                "catalog": "catalog",
                "both": "both",
                "direct": "direct",
            },
        )
        builder.add_edge("rag", "synthesize")
        builder.add_edge("catalog", "synthesize")
        builder.add_edge("both", "synthesize")
        builder.add_edge("synthesize", END)
        builder.add_edge("direct", END)
        return builder.compile()

    async def classify(self, state: IntegratedState) -> IntegratedState:
        question = state["question"].casefold()
        knowledge_keywords = (
            "根据",
            "文档",
            "资料",
            "知识库",
            "原理",
            "源码",
        )
        catalog_keywords = (
            "推荐",
            "搜索",
            "有哪些课程",
            "课程价格",
            "购买课程",
        )
        needs_rag = any(word in question for word in knowledge_keywords)
        needs_catalog = any(word in question for word in catalog_keywords)

        if needs_rag and needs_catalog:
            route: Route = "both"
        elif needs_rag:
            route = "rag"
        elif needs_catalog:
            route = "catalog"
        else:
            route = "direct"
        return {"route": route}

    def after_classify(self, state: IntegratedState) -> Route:
        return state["route"]

    async def _rag_update(self, question: str) -> IntegratedState:
        result = await self.rag.ask(question, top_k=5)
        return {
            "rag_answer": result.answer,
            "citations": [citation.__dict__ for citation in result.citations],
        }

    @staticmethod
    def _course_keyword(question: str) -> str:
        for known_keyword in ("Spring", "Python", "RAG", "LangGraph"):
            if known_keyword.casefold() in question.casefold():
                return known_keyword
        return "Python"

    async def retrieve_knowledge(
        self,
        state: IntegratedState,
    ) -> IntegratedState:
        return await self._rag_update(state["question"])

    async def search_catalog(self, state: IntegratedState) -> IntegratedState:
        courses = await self.gateway.search_courses(
            self._course_keyword(state["question"]),
            limit=5,
        )
        return {"courses": courses}

    async def retrieve_both(self, state: IntegratedState) -> IntegratedState:
        rag_update, courses = await asyncio.gather(
            self._rag_update(state["question"]),
            self.gateway.search_courses(
                self._course_keyword(state["question"]),
                limit=5,
            ),
        )
        return {**rag_update, "courses": courses}

    async def synthesize(self, state: IntegratedState) -> IntegratedState:
        sections: list[str] = []
        if state.get("rag_answer"):
            sections.append(f"知识库结果：\n{state['rag_answer']}")
        if state.get("courses"):
            course_lines = "\n".join(
                f"- {course['title']}（{course['level']}）"
                for course in state["courses"]
            )
            sections.append(f"课程目录结果：\n{course_lines}")
        if not sections:
            sections.append("没有检索到可靠结果。")

        answer = await self.model.complete(
            [
                ChatMessage(
                    role="system",
                    content=(
                        "你是 CourseMall 学习助手。只基于给定结果回答；"
                        "知识说明和课程推荐要分开，不能把推荐说成购买结果。"
                    ),
                ),
                ChatMessage(
                    role="user",
                    content=(f"问题：{state['question']}\n\n" + "\n\n".join(sections)),
                ),
            ]
        )
        return {"answer": answer}

    async def direct_answer(self, state: IntegratedState) -> IntegratedState:
        answer = await self.model.complete(
            [ChatMessage(role="user", content=state["question"])]
        )
        return {"answer": answer, "citations": [], "courses": []}

    async def run(self, question: str) -> IntegratedState:
        return await self.graph.ainvoke({"question": question})


@lru_cache
def get_integrated_coach_graph() -> IntegratedCoachGraph:
    return IntegratedCoachGraph(
        rag=get_rag_pipeline(),
        gateway=get_course_mcp_gateway(),
        model=get_chat_model(),
    )
```

`both` 节点使用 `asyncio.gather()`，因为知识库查询和课程目录查询互不依赖。若第二步必须使用第一步结果，就不能并行。

## 四、整合 API（完整代码）

创建 `app/api/routes/integrated.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.integrated_graph import (
    IntegratedCoachGraph,
    get_integrated_coach_graph,
)
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/coach", tags=["整合问答"])


class IntegratedRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1500)


class IntegratedAnswerData(BaseModel):
    route: str
    answer: str
    citations: list[dict[str, object]]
    courses: list[dict[str, object]]


@router.post("/ask", response_model=ApiResponse[IntegratedAnswerData])
async def ask_integrated_coach(
    body: IntegratedRequest,
    graph: Annotated[
        IntegratedCoachGraph,
        Depends(get_integrated_coach_graph),
    ],
) -> ApiResponse[IntegratedAnswerData]:
    state = await graph.run(body.question)
    return ApiResponse(
        data=IntegratedAnswerData(
            route=state["route"],
            answer=state["answer"],
            citations=state.get("citations", []),
            courses=state.get("courses", []),
        )
    )
```

将 `app/api/router.py` 完整替换为：

```python
from fastapi import APIRouter

from app.api.routes.agent import router as agent_router
from app.api.routes.approval import router as approval_router
from app.api.routes.chains import router as chains_router
from app.api.routes.documents import router as documents_router
from app.api.routes.graph import router as graph_router
from app.api.routes.health import router as health_router
from app.api.routes.integrated import router as integrated_router
from app.api.routes.memory import router as memory_router
from app.api.routes.multi_agent import router as multi_agent_router
from app.api.routes.planning import router as planning_router
from app.api.routes.qa import router as qa_router
from app.api.routes.rag import router as rag_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(qa_router)
api_router.include_router(documents_router)
api_router.include_router(memory_router)
api_router.include_router(agent_router)
api_router.include_router(rag_router)
api_router.include_router(chains_router)
api_router.include_router(graph_router)
api_router.include_router(approval_router)
api_router.include_router(planning_router)
api_router.include_router(multi_agent_router)
api_router.include_router(integrated_router)
```

## 五、整合测试（完整代码）

创建 `tests/test_integrated_graph.py`：

```python
from dataclasses import dataclass, field

import pytest

from app.agent.integrated_graph import IntegratedCoachGraph
from app.llm.fake import FakeChatModel
from app.mcp_gateway import CourseMCPGateway
from app.mcp_server import mcp


@dataclass(frozen=True)
class StubRAGAnswer:
    answer: str = "Spring Boot 自动配置由条件注解决定是否生效。[1]"
    citations: list = field(default_factory=list)


class StubRAGPipeline:
    async def ask(self, question: str, top_k: int = 5) -> StubRAGAnswer:
        return StubRAGAnswer()


def make_graph() -> IntegratedCoachGraph:
    return IntegratedCoachGraph(
        rag=StubRAGPipeline(),  # type: ignore[arg-type]
        gateway=CourseMCPGateway(mcp),
        model=FakeChatModel(),
    )


@pytest.mark.anyio
async def test_catalog_question_calls_mcp_tool() -> None:
    state = await make_graph().run("推荐 Python 课程")

    assert state["route"] == "catalog"
    assert state["courses"][0]["title"] == "Python 与 FastAPI"
    assert state["answer"]


@pytest.mark.anyio
async def test_grounded_recommendation_uses_rag_and_mcp() -> None:
    state = await make_graph().run("根据项目文档推荐 Spring 课程")

    assert state["route"] == "both"
    assert "自动配置" in state["rag_answer"]
    assert state["courses"][0]["title"] == "Spring Boot 项目实战"


@pytest.mark.anyio
async def test_general_question_uses_direct_route() -> None:
    state = await make_graph().run("什么是依赖注入？")

    assert state["route"] == "direct"
    assert state["courses"] == []
    assert state["citations"] == []
```

## 六、运行与预期结果

```powershell
python -m pytest tests/test_integrated_graph.py -q
python -m uvicorn app.main:app --reload
```

```powershell
$body = @{ question = '根据项目文档推荐 Spring 课程' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/coach/ask -ContentType 'application/json' -Body $body
```

预期 `route` 为 `both`，响应同时包含知识库结果、课程列表和最终答案。

::: tip 💡 面试题：为什么在应用层再包一层 MCP Gateway？
它把协议 SDK 的连接和返回类型隔离在基础设施层。业务图只依赖稳定方法，便于测试，也方便把进程内连接切换为远程 Streamable HTTP。
:::

## 七、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Gateway | 隔离外部协议和业务代码 |
| Router | 根据意图选择 RAG、工具或直接回答 |
| 并行召回 | 对互不依赖的数据源同时发起请求 |
| 证据汇总 | 保留每种数据来源的语义边界 |
| 进程内 MCP | 不经网络，但仍走 MCP 协议调用链 |

## 八、✅ 回填清单

- [ ] 推荐问题调用 MCP 工具
- [ ] 文档问题调用 RAG
- [ ] 混合问题并行调用两者
- [ ] 普通问题走 direct
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 九、下次我会追问

1. MCP Server 会不会直接调用模型？
2. 为什么 Gateway 能降低耦合？
3. 哪两种任务可以并行执行？
4. 什么时候必须串行？
5. 如何保证最终答案没有混淆“资料事实”和“课程推荐”？
