# Day 07 · Function Calling、工具注册与调用循环

> **今天目标**：让 Agent 不只“生成文字”，还能选择并执行计算器、课程搜索工具，再根据工具结果回答。Fake Planner 保证零 API Key 可运行，真实模型走兼容 Function Calling 协议。

## 一、创建目录

```powershell
New-Item -ItemType Directory -Force app\agent, app\tools
New-Item -ItemType File -Force app\agent\__init__.py, app\tools\__init__.py
```

## 二、工具抽象（完整代码）

创建 `app/tools/base.py`：

```python
import inspect
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

ToolHandler = Callable[..., Any]


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    arguments_model: type[BaseModel]
    handler: ToolHandler

    def openai_schema(self) -> dict[str, object]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.arguments_model.model_json_schema(),
            },
        }

    async def invoke(self, arguments: dict[str, object]) -> object:
        # 模型生成的参数仍然不可信，执行前必须再用 Pydantic 校验。
        validated = self.arguments_model.model_validate(arguments)
        result = self.handler(**validated.model_dump())
        if inspect.isawaitable(result):
            return await result
        return result


class ToolRegistry:
    def __init__(self, tools: list[ToolDefinition]) -> None:
        self._tools = {tool.name: tool for tool in tools}
        if len(self._tools) != len(tools):
            raise ValueError("工具名称不能重复")

    def schemas(self) -> list[dict[str, object]]:
        return [tool.openai_schema() for tool in self._tools.values()]

    def get(self, name: str) -> ToolDefinition:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise ValueError(f"工具不存在：{name}") from exc
```

模型只会看到名称、描述和 JSON Schema；真正执行哪个 Python 函数，由服务端注册表决定，模型不能提交任意函数名后直接执行系统代码。

## 三、安全计算器（完整代码）

创建 `app/tools/calculator.py`：

```python
import ast
import operator
from collections.abc import Callable

from pydantic import BaseModel, Field

from app.tools.base import ToolDefinition


class CalculatorArguments(BaseModel):
    expression: str = Field(
        min_length=1,
        max_length=100,
        description="只包含数字、括号和基本运算符的算式",
    )


BINARY_OPERATORS: dict[type[ast.operator], Callable[[float, float], float]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}

UNARY_OPERATORS: dict[type[ast.unaryop], Callable[[float], float]] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def _evaluate(node: ast.AST) -> float:
    if isinstance(node, ast.Expression):
        return _evaluate(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return float(node.value)
    if isinstance(node, ast.BinOp) and type(node.op) in BINARY_OPERATORS:
        left = _evaluate(node.left)
        right = _evaluate(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 10:
            raise ValueError("指数绝对值不能超过 10")
        return BINARY_OPERATORS[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and type(node.op) in UNARY_OPERATORS:
        return UNARY_OPERATORS[type(node.op)](_evaluate(node.operand))
    raise ValueError("表达式包含不允许的语法")


def calculate(expression: str) -> dict[str, float | str]:
    tree = ast.parse(expression, mode="eval")
    return {"expression": expression, "result": _evaluate(tree)}


calculator_tool = ToolDefinition(
    name="calculator",
    description="计算加减乘除、取模和小指数幂；不要用于执行代码",
    arguments_model=CalculatorArguments,
    handler=calculate,
)
```

绝对不能直接写 `eval(expression)`：模型和用户输入都不可信，`eval` 可以执行任意 Python 代码。

## 四、课程搜索工具（完整代码）

创建 `app/tools/course_catalog.py`：

```python
from pydantic import BaseModel, Field

from app.tools.base import ToolDefinition

COURSES = [
    {"id": 1, "title": "Spring Boot 项目实战", "level": "初级"},
    {"id": 2, "title": "Spring Cloud 微服务", "level": "进阶"},
    {"id": 3, "title": "Python 与 FastAPI", "level": "初级"},
    {"id": 4, "title": "RAG 与 LangGraph", "level": "进阶"},
]


class CourseSearchArguments(BaseModel):
    keyword: str = Field(min_length=1, max_length=50)
    limit: int = Field(default=5, ge=1, le=10)


def search_courses(keyword: str, limit: int = 5) -> list[dict[str, object]]:
    normalized = keyword.casefold()
    return [
        course for course in COURSES if normalized in str(course["title"]).casefold()
    ][:limit]


course_search_tool = ToolDefinition(
    name="search_courses",
    description="按照关键词搜索课程商城中的课程",
    arguments_model=CourseSearchArguments,
    handler=search_courses,
)
```

今天先使用本地课程数据，等 Java CourseMall 接口稳定后，只替换 `handler`，工具 Schema 和 Agent 不变。

## 五、Planner（完整代码）

创建 `app/agent/planner.py`：

```python
import json
import re
from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

import httpx2

from app.core.config import Settings
from app.core.errors import AppError


@dataclass(frozen=True)
class PlannedToolCall:
    call_id: str
    name: str
    arguments: dict[str, object]


@dataclass(frozen=True)
class PlannerDecision:
    answer: str
    tool_calls: list[PlannedToolCall]


class Planner(Protocol):
    async def decide(
        self,
        messages: list[dict[str, object]],
        tool_schemas: list[dict[str, object]],
    ) -> PlannerDecision:
        """决定直接回答，还是调用一个或多个工具。"""


class RuleBasedPlanner:
    """本地确定性 Planner，让完整工具循环不依赖付费模型。"""

    async def decide(
        self,
        messages: list[dict[str, object]],
        tool_schemas: list[dict[str, object]],
    ) -> PlannerDecision:
        last = messages[-1]
        if last["role"] == "tool":
            result = json.loads(str(last["content"]))
            return PlannerDecision(answer=f"工具结果：{result}", tool_calls=[])

        question = str(last["content"])
        expression = re.search(r"[-+*/%().\d\s]{3,}", question)
        if expression and any(char.isdigit() for char in expression.group()):
            return PlannerDecision(
                answer="",
                tool_calls=[
                    PlannedToolCall(
                        call_id=uuid4().hex,
                        name="calculator",
                        arguments={"expression": expression.group().strip()},
                    )
                ],
            )

        if "课程" in question:
            keyword = (
                question.replace("课程", "").replace("搜索", "").strip() or "Python"
            )
            return PlannerDecision(
                answer="",
                tool_calls=[
                    PlannedToolCall(
                        call_id=uuid4().hex,
                        name="search_courses",
                        arguments={"keyword": keyword, "limit": 5},
                    )
                ],
            )

        return PlannerDecision(
            answer="这个问题不需要工具，我可以直接回答。",
            tool_calls=[],
        )


class OpenAICompatiblePlanner:
    def __init__(self, settings: Settings) -> None:
        self.endpoint = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
        self.model = settings.llm_model
        self.api_key = settings.llm_api_key.get_secret_value()  # type: ignore[union-attr]
        self.timeout = settings.llm_timeout_seconds

    async def decide(
        self,
        messages: list[dict[str, object]],
        tool_schemas: list[dict[str, object]],
    ) -> PlannerDecision:
        try:
            async with httpx2.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.endpoint,
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": self.model,
                        "messages": messages,
                        "tools": tool_schemas,
                        "tool_choice": "auto",
                        "temperature": 0,
                    },
                )
                response.raise_for_status()
                message = response.json()["choices"][0]["message"]
        except (httpx2.HTTPError, KeyError, IndexError) as exc:
            raise AppError("PLANNER_FAILED", "工具规划模型调用失败", 502) from exc

        calls = [
            PlannedToolCall(
                call_id=item["id"],
                name=item["function"]["name"],
                arguments=json.loads(item["function"]["arguments"]),
            )
            for item in message.get("tool_calls", [])
        ]
        return PlannerDecision(answer=message.get("content") or "", tool_calls=calls)
```

## 六、Agent 调用循环（完整代码）

创建 `app/agent/tool_agent.py`：

```python
import json
from dataclasses import dataclass

from app.agent.planner import PlannedToolCall, Planner
from app.core.errors import AppError
from app.tools.base import ToolRegistry


@dataclass(frozen=True)
class ToolTrace:
    name: str
    arguments: dict[str, object]
    result: object


@dataclass(frozen=True)
class AgentResult:
    answer: str
    traces: list[ToolTrace]


class ToolCallingAgent:
    def __init__(
        self,
        planner: Planner,
        registry: ToolRegistry,
        max_iterations: int = 5,
    ) -> None:
        self.planner = planner
        self.registry = registry
        self.max_iterations = max_iterations

    async def run(self, question: str) -> AgentResult:
        messages: list[dict[str, object]] = [
            {
                "role": "system",
                "content": "需要精确数据时使用工具；不得虚构工具结果。",
            },
            {"role": "user", "content": question},
        ]
        traces: list[ToolTrace] = []

        for _ in range(self.max_iterations):
            decision = await self.planner.decide(messages, self.registry.schemas())
            if not decision.tool_calls:
                return AgentResult(answer=decision.answer, traces=traces)

            messages.append(
                {
                    "role": "assistant",
                    "content": decision.answer,
                    "tool_calls": [
                        self._wire_call(call) for call in decision.tool_calls
                    ],
                }
            )

            # Day08 会改为并行、超时、重试执行。
            for call in decision.tool_calls:
                tool = self.registry.get(call.name)
                result = await tool.invoke(call.arguments)
                traces.append(ToolTrace(call.name, call.arguments, result))
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.call_id,
                        "name": call.name,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )

        raise AppError(
            "AGENT_MAX_ITERATIONS",
            "Agent 超过最大工具调用轮数",
            422,
        )

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

必须设置最大轮数，防止模型在“调用工具→仍不满意→继续调用”中无限循环并消耗费用。

## 七、依赖装配与接口（完整代码）

创建 `app/agent/factory.py`：

```python
from functools import lru_cache

from app.agent.planner import OpenAICompatiblePlanner, RuleBasedPlanner
from app.agent.tool_agent import ToolCallingAgent
from app.core.config import get_settings
from app.core.errors import AppError
from app.tools.base import ToolRegistry
from app.tools.calculator import calculator_tool
from app.tools.course_catalog import course_search_tool


@lru_cache
def get_tool_agent() -> ToolCallingAgent:
    settings = get_settings()
    registry = ToolRegistry([calculator_tool, course_search_tool])

    if settings.llm_provider == "fake":
        planner = RuleBasedPlanner()
    elif settings.llm_provider == "openai-compatible":
        if settings.llm_api_key is None:
            raise AppError("LLM_API_KEY_MISSING", "LLM_API_KEY 尚未配置", 500)
        planner = OpenAICompatiblePlanner(settings)
    else:
        raise AppError("UNKNOWN_LLM_PROVIDER", "不支持的模型提供方", 500)

    return ToolCallingAgent(planner, registry)
```

创建 `app/api/routes/agent.py`：

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
    result: object


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
            traces=[
                ToolTraceData(
                    name=trace.name,
                    arguments=trace.arguments,
                    result=trace.result,
                )
                for trace in result.traces
            ],
        )
    )
```

将 `app/api/router.py` 完整替换为：

```python
from fastapi import APIRouter

from app.api.routes.agent import router as agent_router
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.memory import router as memory_router
from app.api.routes.qa import router as qa_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(qa_router)
api_router.include_router(documents_router)
api_router.include_router(memory_router)
api_router.include_router(agent_router)
```

## 八、测试（完整代码）

创建 `tests/test_tool_agent.py`：

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_agent_calls_safe_calculator() -> None:
    response = client.post(
        "/api/v1/agent/ask",
        json={"question": "帮我计算 12 * (3 + 2)"},
    )

    assert response.status_code == 200
    trace = response.json()["data"]["traces"][0]
    assert trace["name"] == "calculator"
    assert trace["result"]["result"] == 60.0


def test_agent_searches_courses() -> None:
    response = client.post(
        "/api/v1/agent/ask",
        json={"question": "搜索 Python 课程"},
    )

    trace = response.json()["data"]["traces"][0]
    assert trace["name"] == "search_courses"
    assert trace["result"][0]["title"] == "Python 与 FastAPI"


def test_calculator_rejects_code_execution() -> None:
    response = client.post(
        "/api/v1/agent/ask",
        json={"question": "计算 __import__('os').system('whoami')"},
    )

    # 规则 Planner 不会把这段识别为合法算式，因此不会执行任何系统代码。
    assert response.status_code == 200
    assert response.json()["data"]["traces"] == []
```

## 九、运行验证

```powershell
python -m pytest
python -m uvicorn app.main:app --reload
```

::: tip 💡 面试题：Function Calling 是模型直接执行函数吗？
不是。模型只输出“建议调用的工具名和参数”；应用必须校验权限与参数、执行受控函数，再把结果交回模型。
:::

## 十、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| JSON Schema | 向模型描述工具参数结构 |
| Tool Registry | 工具白名单及名称到函数的受控映射 |
| Agent Loop | 模型决策→工具执行→结果回传→再次决策 |
| AST | 解析表达式结构，避免危险 `eval` |
| 最大轮数 | 防止失控循环和费用爆炸 |

## 十一、✅ 回填清单

- [ ] 计算问题调用 `calculator`
- [ ] 课程问题调用 `search_courses`
- [ ] trace 能展示参数和结果
- [ ] 恶意 Python 表达式不会执行
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十二、下次我会追问

1. 模型为什么不能直接执行任意函数？
2. 工具参数为什么还要二次校验？
3. 为什么不能用 `eval` 实现计算器？
4. Agent 最大循环次数如何确定？
5. 工具描述写得不好会产生什么后果？
