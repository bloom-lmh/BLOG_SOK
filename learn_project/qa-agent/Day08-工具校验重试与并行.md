# Day 08 · 工具参数校验、超时、重试与并行调用

> **今天目标**：为工具执行增加生产级保护：参数错误可读、单工具超时、仅对临时故障重试、多个互不依赖的工具并行执行。

## 一、工具异常与执行器（完整代码）

创建 `app/tools/executor.py`：

```python
import asyncio
from dataclasses import dataclass

from pydantic import ValidationError

from app.agent.planner import PlannedToolCall
from app.tools.base import ToolRegistry


class RetryableToolError(RuntimeError):
    """网络抖动、503 等短暂错误才允许使用。"""


@dataclass(frozen=True)
class ToolExecution:
    call: PlannedToolCall
    ok: bool
    result: object | None
    error: str | None
    attempts: int


class ToolExecutor:
    def __init__(
        self,
        registry: ToolRegistry,
        *,
        timeout_seconds: float = 5.0,
        max_retries: int = 1,
    ) -> None:
        self.registry = registry
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries

    async def execute_one(self, call: PlannedToolCall) -> ToolExecution:
        try:
            tool = self.registry.get(call.name)
        except ValueError as exc:
            return ToolExecution(call, False, None, str(exc), attempts=0)

        for attempt in range(1, self.max_retries + 2):
            try:
                result = await asyncio.wait_for(
                    tool.invoke(call.arguments),
                    timeout=self.timeout_seconds,
                )
                return ToolExecution(call, True, result, None, attempt)
            except ValidationError as exc:
                # 参数错误重试没有意义，模型必须改参数。
                return ToolExecution(
                    call,
                    False,
                    None,
                    f"参数校验失败：{exc.errors()}",
                    attempt,
                )
            except asyncio.TimeoutError:
                return ToolExecution(
                    call,
                    False,
                    None,
                    f"工具执行超过 {self.timeout_seconds} 秒",
                    attempt,
                )
            except RetryableToolError as exc:
                if attempt > self.max_retries:
                    return ToolExecution(call, False, None, str(exc), attempt)
                # 指数退避；真实项目再加入随机抖动 jitter。
                await asyncio.sleep(0.1 * (2 ** (attempt - 1)))
            except Exception as exc:
                # 未知异常不盲目重试，避免重复扣款/重复写入。
                return ToolExecution(call, False, None, str(exc), attempt)

        raise AssertionError("循环一定会在前面返回")

    async def execute_many(
        self,
        calls: list[PlannedToolCall],
    ) -> list[ToolExecution]:
        # gather 保持结果顺序与 calls 一致，同时并发执行协程。
        return list(await asyncio.gather(*(self.execute_one(call) for call in calls)))
```

自动重试必须保守：查询通常可重试；创建订单、支付等写操作只有具备幂等键时才能安全重试。

## 二、替换 Agent 调用循环（完整代码）

将 `app/agent/tool_agent.py` 完整替换为：

```python
import json
from dataclasses import dataclass

from app.agent.planner import PlannedToolCall, Planner
from app.core.errors import AppError
from app.tools.executor import ToolExecutor


@dataclass(frozen=True)
class ToolTrace:
    name: str
    arguments: dict[str, object]
    result: object | None
    ok: bool
    error: str | None
    attempts: int


@dataclass(frozen=True)
class AgentResult:
    answer: str
    traces: list[ToolTrace]


class ToolCallingAgent:
    def __init__(
        self,
        planner: Planner,
        executor: ToolExecutor,
        max_iterations: int = 5,
    ) -> None:
        self.planner = planner
        self.executor = executor
        self.max_iterations = max_iterations

    async def run(self, question: str) -> AgentResult:
        messages: list[dict[str, object]] = [
            {
                "role": "system",
                "content": (
                    "需要精确数据时使用工具；不得虚构工具结果。"
                    "工具失败时解释失败，不要伪造成功。"
                ),
            },
            {"role": "user", "content": question},
        ]
        traces: list[ToolTrace] = []

        for _ in range(self.max_iterations):
            decision = await self.planner.decide(
                messages,
                self.executor.registry.schemas(),
            )
            if not decision.tool_calls:
                return AgentResult(decision.answer, traces)

            messages.append(
                {
                    "role": "assistant",
                    "content": decision.answer,
                    "tool_calls": [
                        self._wire_call(call) for call in decision.tool_calls
                    ],
                }
            )

            executions = await self.executor.execute_many(decision.tool_calls)
            for execution in executions:
                wire_result = (
                    execution.result if execution.ok else {"error": execution.error}
                )
                traces.append(
                    ToolTrace(
                        name=execution.call.name,
                        arguments=execution.call.arguments,
                        result=execution.result,
                        ok=execution.ok,
                        error=execution.error,
                        attempts=execution.attempts,
                    )
                )
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": execution.call.call_id,
                        "name": execution.call.name,
                        "content": json.dumps(wire_result, ensure_ascii=False),
                    }
                )

        raise AppError("AGENT_MAX_ITERATIONS", "Agent 超过最大工具调用轮数", 422)

    @staticmethod
    def _wire_call(call: PlannedToolCall) -> dict[str, object]:
        return {
            "id": call.call_id,
            "type": "function",
            "function": {
                "name": call.name,
                "arguments": json.dumps(call.arguments, ensure_ascii=False),
            },
        }
```

## 三、替换 Agent 工厂（完整代码）

`app/agent/factory.py`：

```python
from functools import lru_cache

from app.agent.planner import OpenAICompatiblePlanner, RuleBasedPlanner
from app.agent.tool_agent import ToolCallingAgent
from app.core.config import get_settings
from app.core.errors import AppError
from app.tools.base import ToolRegistry
from app.tools.calculator import calculator_tool
from app.tools.course_catalog import course_search_tool
from app.tools.executor import ToolExecutor


@lru_cache
def get_tool_agent() -> ToolCallingAgent:
    settings = get_settings()
    registry = ToolRegistry([calculator_tool, course_search_tool])
    executor = ToolExecutor(
        registry,
        timeout_seconds=5.0,
        max_retries=1,
    )

    if settings.llm_provider == "fake":
        planner = RuleBasedPlanner()
    elif settings.llm_provider == "openai-compatible":
        if settings.llm_api_key is None:
            raise AppError("LLM_API_KEY_MISSING", "LLM_API_KEY 尚未配置", 500)
        planner = OpenAICompatiblePlanner(settings)
    else:
        raise AppError("UNKNOWN_LLM_PROVIDER", "不支持的模型提供方", 500)

    return ToolCallingAgent(planner, executor, max_iterations=5)
```

## 四、替换接口响应模型（完整代码）

将 `app/api/routes/agent.py` 完整替换为：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.factory import get_tool_agent
from app.agent.tool_agent import ToolCallingAgent
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/agent", tags=["Agent 工具调用"])


class AgentQuestion(BaseModel):
    question: str = Field(min_length=2, max_length=1000)


class ToolTraceData(BaseModel):
    name: str
    arguments: dict[str, object]
    result: object | None
    ok: bool
    error: str | None
    attempts: int


class AgentAnswerData(BaseModel):
    answer: str
    traces: list[ToolTraceData]


@router.post("/ask", response_model=ApiResponse[AgentAnswerData])
async def ask_agent(
    body: AgentQuestion,
    agent: Annotated[ToolCallingAgent, Depends(get_tool_agent)],
) -> ApiResponse[AgentAnswerData]:
    result = await agent.run(body.question)
    return ApiResponse(
        data=AgentAnswerData(
            answer=result.answer,
            traces=[ToolTraceData(**trace.__dict__) for trace in result.traces],
        )
    )
```

## 五、执行器测试（完整代码）

创建 `tests/test_tool_executor.py`：

```python
import asyncio
from uuid import uuid4

import pytest
from pydantic import BaseModel, Field

from app.agent.planner import PlannedToolCall
from app.tools.base import ToolDefinition, ToolRegistry
from app.tools.executor import RetryableToolError, ToolExecutor


class ValueArguments(BaseModel):
    value: int = Field(ge=0)


@pytest.mark.anyio
async def test_invalid_arguments_are_not_retried() -> None:
    tool = ToolDefinition("positive", "正数", ValueArguments, lambda value: value)
    executor = ToolExecutor(ToolRegistry([tool]), max_retries=3)
    call = PlannedToolCall(uuid4().hex, "positive", {"value": -1})

    result = await executor.execute_one(call)

    assert result.ok is False
    assert result.attempts == 1
    assert "参数校验失败" in str(result.error)


@pytest.mark.anyio
async def test_retryable_failure_is_retried() -> None:
    attempts = 0

    async def flaky(value: int) -> int:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RetryableToolError("临时不可用")
        return value

    tool = ToolDefinition("flaky", "临时失败", ValueArguments, flaky)
    executor = ToolExecutor(ToolRegistry([tool]), max_retries=1)
    call = PlannedToolCall(uuid4().hex, "flaky", {"value": 7})

    result = await executor.execute_one(call)

    assert result.ok is True
    assert result.result == 7
    assert result.attempts == 2


@pytest.mark.anyio
async def test_independent_tools_run_concurrently() -> None:
    active = 0
    maximum_active = 0

    async def observed(value: int) -> int:
        nonlocal active, maximum_active
        active += 1
        maximum_active = max(maximum_active, active)
        await asyncio.sleep(0.02)
        active -= 1
        return value

    tool = ToolDefinition("observed", "观察并发", ValueArguments, observed)
    executor = ToolExecutor(ToolRegistry([tool]))
    calls = [
        PlannedToolCall(uuid4().hex, "observed", {"value": value}) for value in (1, 2)
    ]

    results = await executor.execute_many(calls)

    assert [result.result for result in results] == [1, 2]
    assert maximum_active == 2
```

## 六、运行验证

```powershell
python -m pytest
python -m uvicorn app.main:app --reload
```

::: tip 💡 面试题：为什么不能遇到所有异常都自动重试？
参数错误重试不会变好；非幂等写操作重试可能重复扣款或重复下单；只有明确的瞬时故障且操作可安全重复时才重试。
:::

## 七、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| `asyncio.gather` | 并发等待多个互不依赖的协程 |
| 超时 | 给外部调用设置资源占用上限 |
| 指数退避 | 每次重试逐步延长等待时间 |
| 幂等 | 同一操作执行多次与一次效果相同 |
| 可观测 trace | 记录工具、参数、结果、次数和错误 |

## 八、✅ 回填清单

- [ ] 非法参数只执行一次
- [ ] 临时错误能成功重试
- [ ] 两个独立工具确实并发
- [ ] 超时能返回可读错误
- [ ] 接口 trace 包含 `ok/error/attempts`

完成时间：

是否跑通：

踩坑与疑问：

## 九、下次我会追问

1. 哪些工具可以并行，哪些必须串行？
2. 为什么参数错误不能重试？
3. 写操作安全重试需要什么条件？
4. 超时、取消和重试之间有什么关系？
