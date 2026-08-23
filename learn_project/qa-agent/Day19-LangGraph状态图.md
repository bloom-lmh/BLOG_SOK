# Day 19 · LangGraph StateGraph、节点、边与条件路由

> **今天目标**：用显式状态图编排“判断是否需要知识库→检索→回答”，替代不断增长的 `if/else`。每个节点只做一件事，状态在节点间传递。

## 一、更新依赖（完整内容）

`requirements.txt`：

```text
fastapi[standard-no-fastapi-cloud-cli]==0.141.1
pydantic-settings==2.15.0
httpx2==2.10.0
aiosqlite==0.22.1
chromadb==1.5.9
langchain==1.3.14
langgraph==1.2.10
pytest==9.1.1
```

```powershell
python -m pip install -r requirements.txt
```

## 二、问答状态图（完整代码）

创建 `app/agent/coach_graph.py`：

```python
from functools import lru_cache
from typing import Literal, TypedDict

from langgraph.graph import END, START, StateGraph

from app.llm.base import ChatMessage, ChatModel
from app.llm.factory import get_chat_model
from app.rag.citations import build_grounded_context
from app.rag.service import RAGService, get_rag_service


class CoachState(TypedDict, total=False):
    question: str
    route: Literal["rag", "direct"]
    context: str
    citation_ids: list[int]
    answer: str


class CoachGraph:
    def __init__(self, rag: RAGService, model: ChatModel) -> None:
        self.rag = rag
        self.model = model
        self.graph = self._build()

    def _build(self):
        builder = StateGraph(CoachState)
        builder.add_node("classify", self.classify)
        builder.add_node("retrieve", self.retrieve)
        builder.add_node("grounded_answer", self.grounded_answer)
        builder.add_node("direct_answer", self.direct_answer)

        builder.add_edge(START, "classify")
        builder.add_conditional_edges(
            "classify",
            self.after_classify,
            {"rag": "retrieve", "direct": "direct_answer"},
        )
        builder.add_edge("retrieve", "grounded_answer")
        builder.add_edge("grounded_answer", END)
        builder.add_edge("direct_answer", END)
        return builder.compile()

    async def classify(self, state: CoachState) -> CoachState:
        question = state["question"].casefold()
        knowledge_keywords = ("文档", "资料", "根据", "课程", "项目", "源码")
        route: Literal["rag", "direct"] = (
            "rag" if any(word in question for word in knowledge_keywords) else "direct"
        )
        return {"route": route}

    def after_classify(self, state: CoachState) -> Literal["rag", "direct"]:
        return state["route"]

    async def retrieve(self, state: CoachState) -> CoachState:
        hits = self.rag.search(state["question"], top_k=5)
        grounded = build_grounded_context(hits)
        return {
            "context": grounded.text,
            "citation_ids": [item.citation_id for item in grounded.citations],
        }

    async def grounded_answer(self, state: CoachState) -> CoachState:
        if not state.get("context"):
            return {"answer": "知识库没有相关资料，无法可靠回答。"}
        answer = await self.model.complete(
            [
                ChatMessage(
                    role="system",
                    content="只能根据资料回答，并使用 [n] 引用。",
                ),
                ChatMessage(
                    role="user",
                    content=f"问题：{state['question']}\n\n资料：\n{state['context']}",
                ),
            ]
        )
        return {"answer": answer}

    async def direct_answer(self, state: CoachState) -> CoachState:
        answer = await self.model.complete(
            [ChatMessage(role="user", content=state["question"])]
        )
        return {"answer": answer, "citation_ids": []}

    async def ainvoke(self, question: str) -> CoachState:
        return await self.graph.ainvoke({"question": question})


@lru_cache
def get_coach_graph() -> CoachGraph:
    return CoachGraph(get_rag_service(), get_chat_model())
```

State 应保存业务事实，而不是把数据库连接、HTTP Client 等不可序列化对象放进去；后续 Checkpoint 才能可靠持久化。

## 三、Graph API（完整代码）

创建 `app/api/routes/graph.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.coach_graph import CoachGraph, get_coach_graph
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/graph", tags=["LangGraph"])


class GraphQuestion(BaseModel):
    question: str = Field(min_length=2, max_length=1000)


class GraphAnswer(BaseModel):
    route: str
    answer: str
    citation_ids: list[int]


@router.post("/ask", response_model=ApiResponse[GraphAnswer])
async def ask_graph(
    body: GraphQuestion,
    graph: Annotated[CoachGraph, Depends(get_coach_graph)],
) -> ApiResponse[GraphAnswer]:
    state = await graph.ainvoke(body.question)
    return ApiResponse(
        data=GraphAnswer(
            route=state["route"],
            answer=state["answer"],
            citation_ids=state.get("citation_ids", []),
        )
    )
```

将 `app/api/router.py` 完整替换为：

```python
from fastapi import APIRouter

from app.api.routes.agent import router as agent_router
from app.api.routes.chains import router as chains_router
from app.api.routes.documents import router as documents_router
from app.api.routes.graph import router as graph_router
from app.api.routes.health import router as health_router
from app.api.routes.memory import router as memory_router
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
```

## 四、测试（完整代码）

创建 `tests/test_coach_graph.py`：

```python
import pytest

from app.agent.coach_graph import CoachGraph
from app.llm.fake import FakeChatModel


class EmptyRAG:
    def search(self, query: str, top_k: int = 5) -> list:
        return []


@pytest.mark.anyio
async def test_general_question_uses_direct_route() -> None:
    graph = CoachGraph(EmptyRAG(), FakeChatModel())  # type: ignore[arg-type]

    state = await graph.ainvoke("什么是 Python 装饰器？")

    assert state["route"] == "direct"
    assert "装饰器" in state["answer"]


@pytest.mark.anyio
async def test_project_question_uses_rag_and_refuses_without_context() -> None:
    graph = CoachGraph(EmptyRAG(), FakeChatModel())  # type: ignore[arg-type]

    state = await graph.ainvoke("根据项目文档解释订单幂等")

    assert state["route"] == "rag"
    assert "无法可靠回答" in state["answer"]
```

## 五、运行验证

```powershell
python -m pytest
```

::: tip 💡 面试题：什么时候用工作流，什么时候用自由 Agent？
步骤和合规边界明确时优先显式工作流；任务路径无法预先确定、需要模型自主选择工具时再使用 Agent，并设置权限和终止条件。
:::

## 六、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| State | 节点之间传递的共享业务数据 |
| Node | 接收状态并返回局部状态更新 |
| Edge | 声明执行顺序 |
| Conditional Edge | 根据状态选择下一节点 |
| Compile | 把图定义编译成可执行 Runnable |

## 七、✅ 回填清单

- [ ] 普通问题走 direct
- [ ] 项目资料问题走 rag
- [ ] 检索为空时拒答
- [ ] 能画出当前状态图
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 八、下次我会追问

1. 为什么 State 中不要放数据库连接？
2. 条件边和普通边有什么区别？
3. LangGraph 相比一长串 `if/else` 的价值是什么？
4. 路由节点由规则还是 LLM 实现，各有什么取舍？
