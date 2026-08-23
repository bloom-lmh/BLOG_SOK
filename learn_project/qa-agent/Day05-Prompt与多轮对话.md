# Day 05 · Prompt 管理与多轮对话

> **今天目标**：让同一个 `conversationId` 下的问题共享历史，并把系统 Prompt 从 Service 中独立出来。服务重启后记录会消失，Day06 再持久化。

## 一、创建目录

```powershell
New-Item -ItemType Directory -Force app\memory, app\prompts
New-Item -ItemType File -Force app\memory\__init__.py, app\prompts\__init__.py
```

## 二、内存会话仓库（完整代码）

创建 `app/memory/in_memory.py`：

```python
import asyncio
from functools import lru_cache

from app.llm.base import ChatMessage


class InMemoryConversationStore:
    """进程内会话存储；仅用于理解多轮对话和本地测试。"""

    def __init__(self) -> None:
        self._messages: dict[str, list[ChatMessage]] = {}
        self._lock = asyncio.Lock()

    async def append(self, conversation_id: str, message: ChatMessage) -> None:
        async with self._lock:
            self._messages.setdefault(conversation_id, []).append(message)

    async def list_messages(self, conversation_id: str) -> list[ChatMessage]:
        async with self._lock:
            # 返回副本，防止调用方绕过锁修改内部 list。
            return list(self._messages.get(conversation_id, []))

    async def clear(self, conversation_id: str) -> bool:
        async with self._lock:
            return self._messages.pop(conversation_id, None) is not None


@lru_cache
def get_conversation_store() -> InMemoryConversationStore:
    return InMemoryConversationStore()
```

这里的锁保护的是“同一 Python 进程里的并发修改”。多进程部署时每个进程仍有独立内存，因此生产环境不能靠它共享会话。

## 三、Prompt 构造器（完整代码）

创建 `app/prompts/qa.py`：

```python
from collections.abc import Sequence

from app.llm.base import ChatMessage

SYSTEM_PROMPT = """你是一名严谨的软件学习教练。

回答规则：
1. 先用一句话给结论，再解释原因。
2. 不确定时明确说“不确定”，不要编造。
3. Java/Python 概念优先联系用户写过的项目。
4. 用户追问“为什么”时解释机制和取舍。
"""


def build_qa_messages(
    history: Sequence[ChatMessage],
    question: str,
) -> list[ChatMessage]:
    return [
        ChatMessage(role="system", content=SYSTEM_PROMPT),
        *history,
        ChatMessage(role="user", content=question),
    ]
```

系统 Prompt 是行为约束，不是安全边界。权限校验、数据过滤必须由代码执行，不能只写一句“不要泄露”。

## 四、替换 QA Schema（完整代码）

`app/schemas/qa.py`：

```python
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class QuestionRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    conversation_id: str | None = Field(
        default=None,
        min_length=8,
        max_length=64,
        description="不传则由服务端创建",
    )

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("question 不能为空白字符")
        return cleaned


class AnswerData(BaseModel):
    conversation_id: str
    question: str
    answer: str
    provider: str


class MessageData(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str


class ConversationData(BaseModel):
    conversation_id: str
    messages: list[MessageData]
```

## 五、替换问答服务（完整代码）

`app/services/qa_service.py`：

```python
from collections.abc import AsyncIterator
from dataclasses import dataclass
from uuid import uuid4

from app.llm.base import ChatMessage, ChatModel
from app.llm.factory import get_chat_model
from app.memory.in_memory import (
    InMemoryConversationStore,
    get_conversation_store,
)
from app.prompts.qa import build_qa_messages


@dataclass(frozen=True)
class AnswerResult:
    conversation_id: str
    answer: str


class QAService:
    def __init__(
        self,
        model: ChatModel,
        store: InMemoryConversationStore,
    ) -> None:
        self.model = model
        self.store = store

    @property
    def provider_name(self) -> str:
        return self.model.provider_name

    @staticmethod
    def conversation_id(requested: str | None) -> str:
        return requested or uuid4().hex

    async def answer(
        self,
        question: str,
        requested_conversation_id: str | None,
    ) -> AnswerResult:
        conversation_id = self.conversation_id(requested_conversation_id)
        history = await self.store.list_messages(conversation_id)
        messages = build_qa_messages(history, question)
        answer = await self.model.complete(messages)

        await self.store.append(
            conversation_id,
            ChatMessage(role="user", content=question),
        )
        await self.store.append(
            conversation_id,
            ChatMessage(role="assistant", content=answer),
        )
        return AnswerResult(conversation_id=conversation_id, answer=answer)

    async def stream(
        self,
        question: str,
        conversation_id: str,
    ) -> AsyncIterator[str]:
        history = await self.store.list_messages(conversation_id)
        messages = build_qa_messages(history, question)
        chunks: list[str] = []

        async for chunk in self.model.stream(messages):
            chunks.append(chunk)
            yield chunk

        await self.store.append(
            conversation_id,
            ChatMessage(role="user", content=question),
        )
        await self.store.append(
            conversation_id,
            ChatMessage(role="assistant", content="".join(chunks)),
        )

    async def history(self, conversation_id: str) -> list[ChatMessage]:
        return await self.store.list_messages(conversation_id)

    async def clear(self, conversation_id: str) -> bool:
        return await self.store.clear(conversation_id)


def get_qa_service() -> QAService:
    return QAService(get_chat_model(), get_conversation_store())
```

流式回答必须在生成结束后保存完整答案；如果客户端中途断开，应决定保存“部分答案”还是标记失败，不能假装生成完整。

## 六、替换问答路由（完整代码）

`app/api/routes/qa.py`：

```python
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import StreamingResponse

from app.core.errors import AppError
from app.schemas.common import ApiResponse
from app.schemas.qa import (
    AnswerData,
    ConversationData,
    MessageData,
    QuestionRequest,
)
from app.services.qa_service import QAService, get_qa_service

router = APIRouter(prefix="/qa", tags=["智能问答"])


@router.post("/ask", response_model=ApiResponse[AnswerData])
async def ask_question(
    body: QuestionRequest,
    service: Annotated[QAService, Depends(get_qa_service)],
) -> ApiResponse[AnswerData]:
    result = await service.answer(body.question, body.conversation_id)
    return ApiResponse(
        data=AnswerData(
            conversation_id=result.conversation_id,
            question=body.question,
            answer=result.answer,
            provider=service.provider_name,
        )
    )


@router.post("/stream", response_class=StreamingResponse)
async def stream_answer(
    body: QuestionRequest,
    service: Annotated[QAService, Depends(get_qa_service)],
) -> StreamingResponse:
    conversation_id = service.conversation_id(body.conversation_id)

    async def events() -> AsyncIterator[str]:
        metadata = json.dumps(
            {"conversationId": conversation_id},
            ensure_ascii=False,
        )
        yield f"event: metadata\ndata: {metadata}\n\n"

        try:
            async for text in service.stream(body.question, conversation_id):
                data = json.dumps({"text": text}, ensure_ascii=False)
                yield f"event: token\ndata: {data}\n\n"
            yield "event: done\ndata: {}\n\n"
        except AppError as exc:
            data = json.dumps(
                {"code": exc.code, "message": exc.message},
                ensure_ascii=False,
            )
            yield f"event: error\ndata: {data}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=ApiResponse[ConversationData],
)
async def get_conversation(
    conversation_id: str,
    service: Annotated[QAService, Depends(get_qa_service)],
) -> ApiResponse[ConversationData]:
    messages = await service.history(conversation_id)
    return ApiResponse(
        data=ConversationData(
            conversation_id=conversation_id,
            messages=[
                MessageData(role=message.role, content=message.content)
                for message in messages
            ],
        )
    )


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_conversation(
    conversation_id: str,
    service: Annotated[QAService, Depends(get_qa_service)],
) -> Response:
    await service.clear(conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

## 七、测试（完整代码）

创建 `tests/test_conversation.py`：

```python
from uuid import uuid4

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_same_conversation_accumulates_messages() -> None:
    conversation_id = uuid4().hex

    for question in ("什么是 Bean？", "它什么时候创建？"):
        response = client.post(
            "/api/v1/qa/ask",
            json={
                "question": question,
                "conversation_id": conversation_id,
            },
        )
        assert response.status_code == 200

    history = client.get(f"/api/v1/qa/conversations/{conversation_id}").json()["data"][
        "messages"
    ]

    assert [message["role"] for message in history] == [
        "user",
        "assistant",
        "user",
        "assistant",
    ]


def test_server_creates_conversation_id() -> None:
    response = client.post(
        "/api/v1/qa/ask",
        json={"question": "什么是 Prompt？"},
    )

    assert len(response.json()["data"]["conversation_id"]) == 32


def test_delete_conversation_clears_history() -> None:
    conversation_id = uuid4().hex
    client.post(
        "/api/v1/qa/ask",
        json={"question": "测试问题", "conversation_id": conversation_id},
    )

    response = client.delete(f"/api/v1/qa/conversations/{conversation_id}")
    assert response.status_code == 204

    history = client.get(f"/api/v1/qa/conversations/{conversation_id}").json()["data"][
        "messages"
    ]
    assert history == []
```

## 八、运行验证

```powershell
python -m pytest
python -m uvicorn app.main:app --reload
```

连续两次请求时复用第一次返回的 `conversation_id`，再访问历史接口，应看到四条消息。

::: tip 💡 面试题：为什么不能把全部历史永久塞进 Prompt？
上下文窗口有限，历史越长延迟和费用越高，还会稀释当前问题；应采用最近窗口、摘要和长期记忆分层管理。
:::

## 九、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| 系统 Prompt | 描述角色和回答规则，不承担权限控制 |
| 多轮对话 | 同一会话把历史消息按顺序交给模型 |
| UUID | 服务端生成不易碰撞的会话标识 |
| `asyncio.Lock` | 保护进程内共享可变状态 |
| 防御性复制 | 不把内部 list 直接交给调用方修改 |

## 十、✅ 回填清单

- [ ] 首次请求能获得 `conversation_id`
- [ ] 第二次请求复用 ID 后历史为四条
- [ ] 删除接口返回 204
- [ ] 能解释内存存储为何不能用于多进程生产环境
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十一、下次我会追问

1. 系统 Prompt 为什么不是安全边界？
2. 为什么读取消息时要返回 list 副本？
3. 多进程部署后这个内存仓库会发生什么？
4. 流式回答中途断开时应该怎样记录状态？
