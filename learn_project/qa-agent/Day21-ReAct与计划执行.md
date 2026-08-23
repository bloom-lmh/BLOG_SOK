# Day 21 · ReAct、Plan-and-Execute 与终止条件

> **今天目标**：让 Agent 先生成可检查的步骤，再逐步调用工具，最后根据观察结果回答。全程保留计划和工具轨迹，并设置最大步骤数，防止无限循环。

## 一、先理解两种思路

- **ReAct**：模型反复进行“思考 → 行动 → 观察”，适合下一步依赖上一轮结果的开放任务。
- **Plan-and-Execute**：先列出计划，再依次执行，适合步骤较明确、需要展示进度的任务。

本项目先实现确定性的 Plan-and-Execute。这样不配置 API Key 也能跑通，并且计划、工具参数和终止条件都容易测试。真实模型接入后，只需替换 `build_plan()`，不要改执行器。

## 二、计划执行图（完整代码）

创建 `app/agent/plan_execute.py`：

```python
import re
from functools import lru_cache
from typing import TypedDict
from uuid import uuid4

from langgraph.graph import END, START, StateGraph

from app.agent.planner import PlannedToolCall
from app.llm.base import ChatMessage, ChatModel
from app.llm.factory import get_chat_model
from app.tools.base import ToolRegistry
from app.tools.calculator import calculator_tool
from app.tools.course_catalog import course_search_tool
from app.tools.executor import ToolExecutor


class PlanItem(TypedDict):
    step: int
    title: str
    tool_name: str | None
    arguments: dict[str, object]


class ExecutionTrace(TypedDict):
    step: int
    tool_name: str
    arguments: dict[str, object]
    ok: bool
    result: object | None
    error: str | None


class PlanExecuteState(TypedDict, total=False):
    question: str
    plan: list[PlanItem]
    current_step: int
    observations: list[str]
    traces: list[ExecutionTrace]
    answer: str


class PlanExecuteAgent:
    def __init__(
        self,
        model: ChatModel,
        executor: ToolExecutor,
        max_steps: int = 5,
    ) -> None:
        self.model = model
        self.executor = executor
        self.max_steps = max_steps
        self.graph = self._build_graph()

    def _build_graph(self):
        builder = StateGraph(PlanExecuteState)
        builder.add_node("plan", self.plan)
        builder.add_node("execute", self.execute)
        builder.add_node("synthesize", self.synthesize)

        builder.add_edge(START, "plan")
        builder.add_edge("plan", "execute")
        builder.add_conditional_edges(
            "execute",
            self.after_execute,
            {"continue": "execute", "finish": "synthesize"},
        )
        builder.add_edge("synthesize", END)
        return builder.compile()

    async def plan(self, state: PlanExecuteState) -> PlanExecuteState:
        steps = self.build_plan(state["question"])
        if len(steps) > self.max_steps:
            steps = steps[: self.max_steps]
        return {
            "plan": steps,
            "current_step": 0,
            "observations": [],
            "traces": [],
        }

    def build_plan(self, question: str) -> list[PlanItem]:
        """本地规则规划器；后续可替换为模型的结构化输出。"""
        steps: list[PlanItem] = []

        candidates = re.findall(r"[\d\s()+\-*/%.]+", question)
        expression = next(
            (
                value.strip()
                for value in candidates
                if any(char.isdigit() for char in value)
                and any(operator in value for operator in "+-*/%")
            ),
            None,
        )
        if expression:
            steps.append(
                PlanItem(
                    step=len(steps) + 1,
                    title="计算表达式",
                    tool_name="calculator",
                    arguments={"expression": expression},
                )
            )

        if "课程" in question:
            keyword = (
                question.replace("课程", "")
                .replace("搜索", "")
                .replace("推荐", "")
                .strip()
            ) or "Python"
            steps.append(
                PlanItem(
                    step=len(steps) + 1,
                    title="查询课程目录",
                    tool_name="search_courses",
                    arguments={"keyword": keyword, "limit": 5},
                )
            )

        if not steps:
            steps.append(
                PlanItem(
                    step=1,
                    title="直接整理已有信息",
                    tool_name=None,
                    arguments={},
                )
            )
        return steps

    async def execute(self, state: PlanExecuteState) -> PlanExecuteState:
        index = state["current_step"]
        item = state["plan"][index]
        observations = list(state["observations"])
        traces = list(state["traces"])

        if item["tool_name"] is None:
            observations.append("这个问题不需要外部工具，可以直接回答。")
        else:
            call = PlannedToolCall(
                call_id=uuid4().hex,
                name=item["tool_name"],
                arguments=item["arguments"],
            )
            execution = await self.executor.execute_one(call)
            traces.append(
                ExecutionTrace(
                    step=item["step"],
                    tool_name=item["tool_name"],
                    arguments=item["arguments"],
                    ok=execution.ok,
                    result=execution.result,
                    error=execution.error,
                )
            )
            if execution.ok:
                observations.append(
                    f"步骤 {item['step']} {item['title']}：{execution.result}"
                )
            else:
                observations.append(
                    f"步骤 {item['step']} {item['title']}失败：{execution.error}"
                )

        return {
            "current_step": index + 1,
            "observations": observations,
            "traces": traces,
        }

    def after_execute(self, state: PlanExecuteState) -> str:
        if state["current_step"] < len(state["plan"]):
            return "continue"
        return "finish"

    async def synthesize(self, state: PlanExecuteState) -> PlanExecuteState:
        observations = "\n".join(state["observations"])
        answer = await self.model.complete(
            [
                ChatMessage(
                    role="system",
                    content=(
                        "你是学习助手。只能基于工具观察结果回答；"
                        "工具失败时要明确说明，不得伪造结果。"
                    ),
                ),
                ChatMessage(
                    role="user",
                    content=(
                        f"原问题：{state['question']}\n\n执行观察：\n{observations}"
                    ),
                ),
            ]
        )
        return {"answer": answer}

    async def run(self, question: str) -> PlanExecuteState:
        return await self.graph.ainvoke({"question": question})


@lru_cache
def get_plan_execute_agent() -> PlanExecuteAgent:
    registry = ToolRegistry([calculator_tool, course_search_tool])
    executor = ToolExecutor(registry, timeout_seconds=5.0, max_retries=1)
    return PlanExecuteAgent(get_chat_model(), executor, max_steps=5)
```

这里的状态只记录计划、当前位置、观察和结果。工具对象、HTTP Client 等运行时依赖仍放在 Agent 实例中，不写入 State。

## 三、计划执行 API（完整代码）

创建 `app/api/routes/planning.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.plan_execute import PlanExecuteAgent, get_plan_execute_agent
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/planning", tags=["计划执行 Agent"])


class PlanningRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1000)


class PlanItemData(BaseModel):
    step: int
    title: str
    tool_name: str | None
    arguments: dict[str, object]


class ExecutionTraceData(BaseModel):
    step: int
    tool_name: str
    arguments: dict[str, object]
    ok: bool
    result: object | None
    error: str | None


class PlanningResultData(BaseModel):
    answer: str
    plan: list[PlanItemData]
    traces: list[ExecutionTraceData]


@router.post("/run", response_model=ApiResponse[PlanningResultData])
async def run_plan(
    body: PlanningRequest,
    agent: Annotated[PlanExecuteAgent, Depends(get_plan_execute_agent)],
) -> ApiResponse[PlanningResultData]:
    state = await agent.run(body.question)
    return ApiResponse(
        data=PlanningResultData(
            answer=state["answer"],
            plan=[PlanItemData(**item) for item in state["plan"]],
            traces=[ExecutionTraceData(**item) for item in state["traces"]],
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
```

## 四、测试（完整代码）

创建 `tests/test_plan_execute.py`：

```python
import pytest

from app.agent.plan_execute import PlanExecuteAgent
from app.llm.fake import FakeChatModel
from app.tools.base import ToolRegistry
from app.tools.calculator import calculator_tool
from app.tools.course_catalog import course_search_tool
from app.tools.executor import ToolExecutor


def make_agent() -> PlanExecuteAgent:
    registry = ToolRegistry([calculator_tool, course_search_tool])
    return PlanExecuteAgent(
        FakeChatModel(),
        ToolExecutor(registry),
        max_steps=5,
    )


@pytest.mark.anyio
async def test_plan_executes_calculator() -> None:
    state = await make_agent().run("请计算 12 * (3 + 2)")

    assert state["plan"][0]["tool_name"] == "calculator"
    assert state["traces"][0]["result"] == {
        "expression": "12 * (3 + 2)",
        "result": 60.0,
    }
    assert state["answer"]


@pytest.mark.anyio
async def test_plan_can_use_two_tools_in_order() -> None:
    state = await make_agent().run("计算 6 * 7，并搜索 Python 课程")

    assert [item["tool_name"] for item in state["plan"]] == [
        "calculator",
        "search_courses",
    ]
    assert [trace["step"] for trace in state["traces"]] == [1, 2]


@pytest.mark.anyio
async def test_general_question_finishes_without_tool() -> None:
    state = await make_agent().run("什么是依赖注入？")

    assert state["plan"][0]["tool_name"] is None
    assert state["traces"] == []
    assert state["answer"]
```

## 五、运行与预期结果

```powershell
python -m pytest tests/test_plan_execute.py -q
python -m uvicorn app.main:app --reload
```

请求：

```powershell
$body = @{ question = '计算 12 * 5，并搜索 Python 课程' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/planning/run -ContentType 'application/json' -Body $body
```

你应看到两个计划步骤、两个 trace，以及最终答案。

::: tip 💡 面试题：ReAct 为什么必须有终止条件？
模型可能持续重复调用工具。最大步数、最大耗时、费用预算和重复调用检测共同构成 Agent 的“刹车系统”。
:::

## 六、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| ReAct | Reasoning + Acting + Observation 的循环 |
| Plan-and-Execute | 先规划，再逐步执行并汇总 |
| Observation | 工具返回给 Agent 的可信执行结果 |
| 终止条件 | 限制步骤、时间、费用和重复行为 |
| Trace | 面向排错和审计的执行轨迹 |

## 七、✅ 回填清单

- [ ] 计算任务生成 calculator 步骤
- [ ] 混合任务按顺序执行两个工具
- [ ] 普通问题不调用工具
- [ ] 响应中能看到 plan 和 traces
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 八、下次我会追问

1. ReAct 和 Plan-and-Execute 的主要区别是什么？
2. 为什么执行器不能完全相信规划器给出的参数？
3. 如何发现 Agent 正在重复调用同一工具？
4. 哪些信息应该放 State，哪些不应该？
