# Day 18 · Pydantic 结构化输出与 Chain 回调观测

> **今天目标**：让模型输出通过 Pydantic 解析为稳定 JSON，并通过 Callback 记录 Chain 的开始、结束、错误和耗时。

## 一、替换 Fake 模型（完整代码）

将 `app/llm/fake.py` 完整替换为：

```python
import asyncio
import json
from collections.abc import AsyncIterator, Sequence

from app.llm.base import ChatMessage


class FakeChatModel:
    provider_name = "fake"

    async def complete(self, messages: Sequence[ChatMessage]) -> str:
        system = next(
            (message.content for message in messages if message.role == "system"),
            "",
        )
        question = self._last_user_message(messages)

        if "只输出 JSON" in system:
            return json.dumps(
                {
                    "summary": "这是一个可验证的本地结构化答案",
                    "key_points": ["先理解概念", "再映射到项目"],
                    "difficulty": "beginner",
                    "confidence": 0.95,
                },
                ensure_ascii=False,
            )

        if "资料：" in question:
            clean_question = question.split("资料：", maxsplit=1)[0]
            clean_question = clean_question.removeprefix("问题：").strip()
            return f"[本地 RAG 测试答案] {clean_question}，答案依据知识库资料。[1]"

        return f"[本地测试答案] 你问的是：{question}"

    async def stream(
        self,
        messages: Sequence[ChatMessage],
    ) -> AsyncIterator[str]:
        answer = await self.complete(messages)
        for character in answer:
            await asyncio.sleep(0)
            yield character

    @staticmethod
    def _last_user_message(messages: Sequence[ChatMessage]) -> str:
        for message in reversed(messages):
            if message.role == "user":
                return message.content
        return ""
```

## 二、回调处理器（完整代码）

创建 `app/observability/chain_callback.py`，并先创建空的 `app/observability/__init__.py`：

```python
from time import perf_counter
from typing import Any
from uuid import UUID

from langchain_core.callbacks import BaseCallbackHandler


class TimingCallbackHandler(BaseCallbackHandler):
    def __init__(self) -> None:
        self.started: dict[UUID, float] = {}
        self.events: list[dict[str, Any]] = []

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self.started[run_id] = perf_counter()
        self.events.append({"event": "start", "runId": str(run_id)})

    def on_chain_end(
        self,
        outputs: Any,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        started = self.started.pop(run_id, perf_counter())
        self.events.append(
            {
                "event": "end",
                "runId": str(run_id),
                "elapsedMs": round((perf_counter() - started) * 1000, 3),
            }
        )

    def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: UUID,
        **kwargs: Any,
    ) -> None:
        self.started.pop(run_id, None)
        self.events.append(
            {
                "event": "error",
                "runId": str(run_id),
                "errorType": type(error).__name__,
            }
        )
```

日志中只记录类型、耗时和 ID，默认不记录完整 Prompt、文档正文和模型答案，避免泄露隐私。

## 三、结构化 Chain（完整代码）

创建 `app/agent/structured_chain.py`：

```python
from functools import lru_cache
from typing import Literal

from langchain_core.output_parsers import PydanticOutputParser
from langchain_core.prompt_values import ChatPromptValue
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda
from pydantic import BaseModel, Field

from app.agent.lcel_chain import to_app_message
from app.llm.base import ChatModel
from app.llm.factory import get_chat_model
from app.observability.chain_callback import TimingCallbackHandler


class LearningAnswer(BaseModel):
    summary: str = Field(min_length=1)
    key_points: list[str] = Field(min_length=1, max_length=5)
    difficulty: Literal["beginner", "intermediate", "advanced"]
    confidence: float = Field(ge=0, le=1)


class StructuredLearningChain:
    def __init__(self, model: ChatModel) -> None:
        parser = PydanticOutputParser(pydantic_object=LearningAnswer)
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "你是学习教练，只输出 JSON。\n{format_instructions}",
                ),
                ("human", "问题：{question}"),
            ]
        ).partial(format_instructions=parser.get_format_instructions())

        async def call_model(prompt_value: ChatPromptValue) -> str:
            return await model.complete(
                [to_app_message(item) for item in prompt_value.to_messages()]
            )

        self.chain = prompt | RunnableLambda(call_model) | parser

    async def ainvoke(
        self,
        question: str,
    ) -> tuple[LearningAnswer, list[dict]]:
        callback = TimingCallbackHandler()
        answer = await self.chain.ainvoke(
            {"question": question},
            config={"callbacks": [callback]},
        )
        return answer, callback.events


@lru_cache
def get_structured_chain() -> StructuredLearningChain:
    return StructuredLearningChain(get_chat_model())
```

## 四、替换 Chain API（完整代码）

将 `app/api/routes/chains.py` 完整替换为：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.lcel_chain import LearningCoachChain, get_learning_chain
from app.agent.structured_chain import (
    LearningAnswer,
    StructuredLearningChain,
    get_structured_chain,
)
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/chains", tags=["LangChain"])


class ExplainRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    context: str = Field(default="无", max_length=4000)


class ExplainData(BaseModel):
    answer: str


class StructuredData(BaseModel):
    answer: LearningAnswer
    events: list[dict]


@router.post("/explain", response_model=ApiResponse[ExplainData])
async def explain(
    body: ExplainRequest,
    chain: Annotated[LearningCoachChain, Depends(get_learning_chain)],
) -> ApiResponse[ExplainData]:
    answer = await chain.ainvoke(body.question, body.context)
    return ApiResponse(data=ExplainData(answer=answer))


@router.post("/structured", response_model=ApiResponse[StructuredData])
async def structured_answer(
    body: ExplainRequest,
    chain: Annotated[StructuredLearningChain, Depends(get_structured_chain)],
) -> ApiResponse[StructuredData]:
    answer, events = await chain.ainvoke(body.question)
    return ApiResponse(data=StructuredData(answer=answer, events=events))
```

## 五、测试（完整代码）

创建 `tests/test_structured_chain.py`：

```python
import pytest

from app.agent.structured_chain import StructuredLearningChain
from app.llm.fake import FakeChatModel


@pytest.mark.anyio
async def test_structured_output_is_pydantic_model() -> None:
    chain = StructuredLearningChain(FakeChatModel())

    answer, events = await chain.ainvoke("解释依赖注入")

    assert answer.difficulty == "beginner"
    assert answer.confidence == 0.95
    assert answer.key_points
    assert any(event["event"] == "end" for event in events)
```

## 六、运行验证

```powershell
python -m pytest
```

::: tip 💡 面试题：有 JSON Schema 为什么模型输出仍可能解析失败？
Schema 是约束提示，不同模型可能输出额外文字、字段缺失或类型错误；应用必须捕获解析异常，并决定重试、修复还是失败返回。
:::

## 七、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Structured Output | 将自由文本转为稳定业务对象 |
| Pydantic Parser | 解析同时完成字段校验 |
| Callback | 观察 Chain 生命周期而不侵入业务步骤 |
| Run ID | 关联一次链式执行中的事件 |
| 数据脱敏 | 默认不记录 Prompt、密钥和用户文档原文 |

## 八、✅ 回填清单

- [ ] `/chains/structured` 返回固定字段
- [ ] 无效 JSON 会解析失败而非静默吞掉
- [ ] events 中包含 start/end 和耗时
- [ ] 日志不包含 API Key 与完整 Prompt
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 九、下次我会追问

1. 结构化输出在哪些业务场景比文本更合适？
2. 解析失败应无限重试吗？
3. Callback 和中间件有什么区别？
4. 为什么可观测日志要默认脱敏？
