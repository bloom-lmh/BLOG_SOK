# Day 22 · 多 Agent 路由、并行协作与结果汇总

> **今天目标**：把 Java、Python 和项目咨询拆成三个专业 Agent，由 Supervisor 选择一个或多个 Agent，并行处理跨领域问题，最后统一汇总。

## 一、什么时候值得用多 Agent

多 Agent 不是“Agent 越多越高级”。只有当领域、权限或上下文确实需要隔离时才拆分。本项目拆分的理由是：

- Java Agent 只加载 Spring/JVM 相关提示词和资料。
- Python Agent 只负责 Python/FastAPI/AI Agent。
- Project Agent 只负责 CourseMall 的需求和工程决策。
- Supervisor 只做路由和汇总，不承担所有专业知识。

## 二、多 Agent 协调器（完整代码）

创建 `app/agent/multi_agent.py`：

```python
import asyncio
from dataclasses import dataclass
from functools import lru_cache

from app.llm.base import ChatMessage, ChatModel
from app.llm.factory import get_chat_model


@dataclass(frozen=True)
class SpecialistReply:
    agent: str
    domain: str
    answer: str


@dataclass(frozen=True)
class MultiAgentResult:
    selected_agents: list[str]
    replies: list[SpecialistReply]
    answer: str


class SpecialistAgent:
    def __init__(
        self,
        name: str,
        domain: str,
        instruction: str,
        model: ChatModel,
    ) -> None:
        self.name = name
        self.domain = domain
        self.instruction = instruction
        self.model = model

    async def run(self, question: str) -> SpecialistReply:
        answer = await self.model.complete(
            [
                ChatMessage(role="system", content=self.instruction),
                ChatMessage(role="user", content=question),
            ]
        )
        return SpecialistReply(
            agent=self.name,
            domain=self.domain,
            answer=answer,
        )


class MultiAgentCoordinator:
    def __init__(self, model: ChatModel) -> None:
        self.model = model
        self.agents = {
            "java": SpecialistAgent(
                name="java_agent",
                domain="Java / Spring",
                instruction=(
                    "你是 Java 与 Spring 教练。回答要结合后端工程实践，"
                    "不确定时明确说明，不回答 Python 专属实现。"
                ),
                model=model,
            ),
            "python": SpecialistAgent(
                name="python_agent",
                domain="Python / AI Agent",
                instruction=(
                    "你是 Python、FastAPI 与 AI Agent 教练。"
                    "面向 Python 初学者解释，但保留准确术语。"
                ),
                model=model,
            ),
            "project": SpecialistAgent(
                name="project_agent",
                domain="CourseMall 项目",
                instruction=(
                    "你是 CourseMall 架构师。关注需求、接口、数据一致性、"
                    "安全、测试和可落地性。"
                ),
                model=model,
            ),
        }

    def route(self, question: str) -> list[str]:
        normalized = question.casefold()
        selected: list[str] = []

        java_keywords = (
            "java",
            "spring",
            "jvm",
            "mybatis",
            "线程",
            "bean",
        )
        python_keywords = (
            "python",
            "fastapi",
            "langchain",
            "langgraph",
            "agent",
            "装饰器",
        )
        project_keywords = (
            "coursemall",
            "商城",
            "课程",
            "订单",
            "支付",
            "项目",
        )

        if any(keyword in normalized for keyword in java_keywords):
            selected.append("java")
        if any(keyword in normalized for keyword in python_keywords):
            selected.append("python")
        if any(keyword in normalized for keyword in project_keywords):
            selected.append("project")

        return selected or ["python"]

    async def run(self, question: str) -> MultiAgentResult:
        selected = self.route(question)
        replies = list(
            await asyncio.gather(
                *(self.agents[name].run(question) for name in selected)
            )
        )

        evidence = "\n\n".join(
            f"[{reply.agent} / {reply.domain}]\n{reply.answer}" for reply in replies
        )
        final_answer = await self.model.complete(
            [
                ChatMessage(
                    role="system",
                    content=(
                        "你是 Supervisor。合并专家结果，删除重复内容；"
                        "如果专家意见冲突，要把冲突和取舍写清楚。"
                    ),
                ),
                ChatMessage(
                    role="user",
                    content=f"用户问题：{question}\n\n专家结果：\n{evidence}",
                ),
            ]
        )
        return MultiAgentResult(
            selected_agents=selected,
            replies=replies,
            answer=final_answer,
        )


@lru_cache
def get_multi_agent_coordinator() -> MultiAgentCoordinator:
    return MultiAgentCoordinator(get_chat_model())
```

这里使用规则做 Supervisor 路由，是为了结果稳定、可测试、零费用。生产项目可以让模型输出结构化路由结果，但必须保留允许的 Agent 白名单。

## 三、多 Agent API（完整代码）

创建 `app/api/routes/multi_agent.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.multi_agent import (
    MultiAgentCoordinator,
    get_multi_agent_coordinator,
)
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/multi-agent", tags=["多 Agent"])


class MultiAgentRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1500)


class SpecialistReplyData(BaseModel):
    agent: str
    domain: str
    answer: str


class MultiAgentData(BaseModel):
    selected_agents: list[str]
    replies: list[SpecialistReplyData]
    answer: str


@router.post("/ask", response_model=ApiResponse[MultiAgentData])
async def ask_multi_agent(
    body: MultiAgentRequest,
    coordinator: Annotated[
        MultiAgentCoordinator,
        Depends(get_multi_agent_coordinator),
    ],
) -> ApiResponse[MultiAgentData]:
    result = await coordinator.run(body.question)
    return ApiResponse(
        data=MultiAgentData(
            selected_agents=result.selected_agents,
            replies=[SpecialistReplyData(**reply.__dict__) for reply in result.replies],
            answer=result.answer,
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
```

## 四、测试并行路由（完整代码）

创建 `tests/test_multi_agent.py`：

```python
import asyncio
from collections.abc import AsyncIterator, Sequence

import pytest

from app.agent.multi_agent import MultiAgentCoordinator
from app.llm.base import ChatMessage


class ObservedChatModel:
    provider_name = "observed-fake"

    def __init__(self) -> None:
        self.active = 0
        self.maximum_active = 0

    async def complete(self, messages: Sequence[ChatMessage]) -> str:
        self.active += 1
        self.maximum_active = max(self.maximum_active, self.active)
        await asyncio.sleep(0.02)
        self.active -= 1
        return messages[-1].content

    async def stream(
        self,
        messages: Sequence[ChatMessage],
    ) -> AsyncIterator[str]:
        yield await self.complete(messages)


def test_router_selects_java_agent() -> None:
    coordinator = MultiAgentCoordinator(ObservedChatModel())

    assert coordinator.route("Spring Bean 的生命周期是什么？") == ["java"]


def test_router_has_safe_default() -> None:
    coordinator = MultiAgentCoordinator(ObservedChatModel())

    assert coordinator.route("怎么安排今天的学习？") == ["python"]


@pytest.mark.anyio
async def test_cross_domain_question_runs_specialists_concurrently() -> None:
    model = ObservedChatModel()
    coordinator = MultiAgentCoordinator(model)

    result = await coordinator.run(
        "比较 Java Spring 与 Python FastAPI，并说明在课程商城中的用途"
    )

    assert result.selected_agents == ["java", "python", "project"]
    assert {reply.agent for reply in result.replies} == {
        "java_agent",
        "python_agent",
        "project_agent",
    }
    assert model.maximum_active == 3
    assert result.answer
```

## 五、运行与预期结果

```powershell
python -m pytest tests/test_multi_agent.py -q
python -m uvicorn app.main:app --reload
```

```powershell
$body = @{ question = '比较 Spring Boot 与 FastAPI 在 CourseMall 中的职责' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/multi-agent/ask -ContentType 'application/json' -Body $body
```

响应应包含 `java`、`python`、`project` 三个路由结果及 Supervisor 的最终答案。

::: tip 💡 面试题：多 Agent 的代价是什么？
调用次数、延迟、费用、上下文同步和排错复杂度都会增加。领域不需要隔离时，一个带工具的 Agent 通常更简单。
:::

## 六、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Supervisor | 负责路由、协调和结果汇总 |
| Specialist | 只处理一个受限领域的 Agent |
| Fan-out | 将一个问题分发给多个独立节点 |
| Fan-in | 收集多个节点结果后统一合并 |
| 白名单路由 | 模型只能选择已注册的 Agent |

## 七、✅ 回填清单

- [ ] Java 问题只路由到 Java Agent
- [ ] 跨领域问题能选中多个 Agent
- [ ] 多个 Specialist 并行执行
- [ ] Supervisor 返回统一答案
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 八、下次我会追问

1. 什么情况下一个 Agent 比多个 Agent 更合适？
2. Supervisor 为什么仍需要白名单？
3. Fan-out 与 Fan-in 分别是什么？
4. 多 Agent 如何共享信息又避免上下文污染？
