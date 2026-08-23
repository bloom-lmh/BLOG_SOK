# Day 06 · SQLite 会话记忆、摘要压缩与用户长期记忆

> **今天目标**：把会话从进程内存迁移到 SQLite；长对话只保留最近消息，并把旧消息压缩成摘要；同时保存用户偏好。重启服务后数据仍存在。

## 一、更新依赖（完整内容）

将 `requirements.txt` 完整替换为：

```text
fastapi[standard-no-fastapi-cloud-cli]==0.141.1
pydantic-settings==2.15.0
httpx2==2.10.0
aiosqlite==0.22.1
pytest==9.1.1
```

安装新增依赖：

```powershell
python -m pip install -r requirements.txt
```

## 二、替换配置（完整代码）

`app/core/config.py`：

```python
from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "QA Agent"
    app_env: str = "dev"
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    upload_dir: Path = Path("data/uploads")
    max_upload_bytes: int = 2 * 1024 * 1024
    database_path: Path = Path("data/qa_agent.db")
    memory_compact_threshold: int = 12
    memory_keep_recent: int = 6

    llm_provider: str = "fake"
    llm_model: str = "fake-model"
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_api_key: SecretStr | None = None
    llm_timeout_seconds: float = 30.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

在 `.env.example` 末尾增加：

```dotenv
DATABASE_PATH=data/qa_agent.db
MEMORY_COMPACT_THRESHOLD=12
MEMORY_KEEP_RECENT=6
```

## 三、SQLite 记忆仓库（完整代码）

创建 `app/memory/sqlite_store.py`：

```python
import asyncio
from functools import lru_cache
from pathlib import Path

import aiosqlite

from app.core.config import get_settings
from app.llm.base import ChatMessage


class SQLiteMemoryStore:
    def __init__(
        self,
        database_path: Path,
        compact_threshold: int,
        keep_recent: int,
    ) -> None:
        self.database_path = database_path
        self.compact_threshold = compact_threshold
        self.keep_recent = keep_recent
        self._initialized = False
        self._init_lock = asyncio.Lock()

    async def initialize(self) -> None:
        if self._initialized:
            return

        async with self._init_lock:
            if self._initialized:
                return

            self.database_path.parent.mkdir(parents=True, exist_ok=True)
            async with aiosqlite.connect(self.database_path) as db:
                await db.executescript(
                    """
                    CREATE TABLE IF NOT EXISTS conversation_message (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id TEXT NOT NULL,
                        role TEXT NOT NULL,
                        content TEXT NOT NULL,
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE INDEX IF NOT EXISTS idx_message_conversation
                    ON conversation_message(conversation_id, id);

                    CREATE TABLE IF NOT EXISTS conversation_summary (
                        conversation_id TEXT PRIMARY KEY,
                        content TEXT NOT NULL,
                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                    );

                    CREATE TABLE IF NOT EXISTS user_memory (
                        user_id TEXT NOT NULL,
                        memory_key TEXT NOT NULL,
                        memory_value TEXT NOT NULL,
                        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_id, memory_key)
                    );
                    """
                )
                await db.commit()
            self._initialized = True

    async def append(self, conversation_id: str, message: ChatMessage) -> None:
        await self.initialize()
        async with aiosqlite.connect(self.database_path) as db:
            await db.execute(
                """
                INSERT INTO conversation_message(conversation_id, role, content)
                VALUES (?, ?, ?)
                """,
                (conversation_id, message.role, message.content),
            )
            await db.commit()
        await self.compact_if_needed(conversation_id)

    async def context(
        self,
        conversation_id: str,
    ) -> tuple[str | None, list[ChatMessage]]:
        await self.initialize()
        async with aiosqlite.connect(self.database_path) as db:
            summary_cursor = await db.execute(
                "SELECT content FROM conversation_summary WHERE conversation_id = ?",
                (conversation_id,),
            )
            summary_row = await summary_cursor.fetchone()

            message_cursor = await db.execute(
                """
                SELECT role, content
                FROM conversation_message
                WHERE conversation_id = ?
                ORDER BY id ASC
                """,
                (conversation_id,),
            )
            rows = await message_cursor.fetchall()

        summary = str(summary_row[0]) if summary_row else None
        messages = [ChatMessage(role=row[0], content=row[1]) for row in rows]
        return summary, messages

    async def compact_if_needed(self, conversation_id: str) -> None:
        await self.initialize()
        async with aiosqlite.connect(self.database_path) as db:
            count_cursor = await db.execute(
                "SELECT COUNT(*) FROM conversation_message WHERE conversation_id = ?",
                (conversation_id,),
            )
            count = int((await count_cursor.fetchone())[0])
            if count <= self.compact_threshold:
                return

            compact_count = count - self.keep_recent
            cursor = await db.execute(
                """
                SELECT id, role, content
                FROM conversation_message
                WHERE conversation_id = ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (conversation_id, compact_count),
            )
            rows = await cursor.fetchall()
            old_summary_cursor = await db.execute(
                "SELECT content FROM conversation_summary WHERE conversation_id = ?",
                (conversation_id,),
            )
            old_summary_row = await old_summary_cursor.fetchone()

            parts = [str(old_summary_row[0])] if old_summary_row else []
            parts.extend(f"{role}: {content[:300]}" for _, role, content in rows)
            summary = "\n".join(parts)[-4000:]

            await db.execute(
                """
                INSERT INTO conversation_summary(conversation_id, content)
                VALUES (?, ?)
                ON CONFLICT(conversation_id) DO UPDATE SET
                    content = excluded.content,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (conversation_id, summary),
            )
            await db.executemany(
                "DELETE FROM conversation_message WHERE id = ?",
                [(row[0],) for row in rows],
            )
            await db.commit()

    async def remember(self, user_id: str, key: str, value: str) -> None:
        await self.initialize()
        async with aiosqlite.connect(self.database_path) as db:
            await db.execute(
                """
                INSERT INTO user_memory(user_id, memory_key, memory_value)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id, memory_key) DO UPDATE SET
                    memory_value = excluded.memory_value,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (user_id, key, value),
            )
            await db.commit()

    async def profile(self, user_id: str) -> dict[str, str]:
        await self.initialize()
        async with aiosqlite.connect(self.database_path) as db:
            cursor = await db.execute(
                """
                SELECT memory_key, memory_value
                FROM user_memory
                WHERE user_id = ?
                ORDER BY memory_key
                """,
                (user_id,),
            )
            rows = await cursor.fetchall()
        return {str(key): str(value) for key, value in rows}

    async def clear(self, conversation_id: str) -> None:
        await self.initialize()
        async with aiosqlite.connect(self.database_path) as db:
            await db.execute(
                "DELETE FROM conversation_message WHERE conversation_id = ?",
                (conversation_id,),
            )
            await db.execute(
                "DELETE FROM conversation_summary WHERE conversation_id = ?",
                (conversation_id,),
            )
            await db.commit()


@lru_cache
def get_memory_store() -> SQLiteMemoryStore:
    settings = get_settings()
    return SQLiteMemoryStore(
        database_path=settings.database_path,
        compact_threshold=settings.memory_compact_threshold,
        keep_recent=settings.memory_keep_recent,
    )
```

SQL 参数必须使用 `?` 占位符绑定，不能用 f-string 拼接用户输入，否则会产生 SQL 注入。

## 四、替换 Prompt 构造器（完整代码）

`app/prompts/qa.py`：

```python
from collections.abc import Mapping, Sequence

from app.llm.base import ChatMessage

SYSTEM_PROMPT = """你是一名严谨的软件学习教练。
先给结论，再解释原因；不知道时明确说不知道，不得编造。
"""


def build_qa_messages(
    *,
    summary: str | None,
    profile: Mapping[str, str],
    history: Sequence[ChatMessage],
    question: str,
) -> list[ChatMessage]:
    context_parts = [SYSTEM_PROMPT]
    if profile:
        profile_text = "；".join(f"{key}={value}" for key, value in profile.items())
        context_parts.append(f"用户长期偏好：{profile_text}")
    if summary:
        context_parts.append(f"较早对话摘要：\n{summary}")

    return [
        ChatMessage(role="system", content="\n\n".join(context_parts)),
        *history,
        ChatMessage(role="user", content=question),
    ]
```

## 五、替换 QA Schema（完整代码）

`app/schemas/qa.py`：

```python
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class QuestionRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    conversation_id: str | None = Field(default=None, min_length=8, max_length=64)
    user_id: str = Field(default="anonymous", min_length=1, max_length=64)

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
    summary: str | None
    messages: list[MessageData]


class MemoryWriteRequest(BaseModel):
    key: str = Field(min_length=1, max_length=50)
    value: str = Field(min_length=1, max_length=500)


class UserMemoryData(BaseModel):
    user_id: str
    memories: dict[str, str]
```

## 六、替换问答服务（完整代码）

`app/services/qa_service.py`：

```python
from collections.abc import AsyncIterator
from dataclasses import dataclass
from uuid import uuid4

from app.llm.base import ChatMessage, ChatModel
from app.llm.factory import get_chat_model
from app.memory.sqlite_store import SQLiteMemoryStore, get_memory_store
from app.prompts.qa import build_qa_messages


@dataclass(frozen=True)
class AnswerResult:
    conversation_id: str
    answer: str


class QAService:
    def __init__(self, model: ChatModel, store: SQLiteMemoryStore) -> None:
        self.model = model
        self.store = store

    @property
    def provider_name(self) -> str:
        return self.model.provider_name

    @staticmethod
    def conversation_id(requested: str | None) -> str:
        return requested or uuid4().hex

    async def _messages(
        self,
        conversation_id: str,
        user_id: str,
        question: str,
    ) -> list[ChatMessage]:
        summary, history = await self.store.context(conversation_id)
        profile = await self.store.profile(user_id)
        return build_qa_messages(
            summary=summary,
            profile=profile,
            history=history,
            question=question,
        )

    async def answer(
        self,
        question: str,
        requested_conversation_id: str | None,
        user_id: str,
    ) -> AnswerResult:
        conversation_id = self.conversation_id(requested_conversation_id)
        messages = await self._messages(conversation_id, user_id, question)
        answer = await self.model.complete(messages)
        await self._save_turn(conversation_id, question, answer)
        return AnswerResult(conversation_id=conversation_id, answer=answer)

    async def stream(
        self,
        question: str,
        conversation_id: str,
        user_id: str,
    ) -> AsyncIterator[str]:
        messages = await self._messages(conversation_id, user_id, question)
        chunks: list[str] = []
        async for chunk in self.model.stream(messages):
            chunks.append(chunk)
            yield chunk
        await self._save_turn(conversation_id, question, "".join(chunks))

    async def _save_turn(
        self,
        conversation_id: str,
        question: str,
        answer: str,
    ) -> None:
        await self.store.append(
            conversation_id,
            ChatMessage(role="user", content=question),
        )
        await self.store.append(
            conversation_id,
            ChatMessage(role="assistant", content=answer),
        )

    async def history(
        self,
        conversation_id: str,
    ) -> tuple[str | None, list[ChatMessage]]:
        return await self.store.context(conversation_id)

    async def clear(self, conversation_id: str) -> None:
        await self.store.clear(conversation_id)


def get_qa_service() -> QAService:
    return QAService(get_chat_model(), get_memory_store())
```

将 `app/api/routes/qa.py` 完整替换为：

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
    result = await service.answer(
        body.question,
        body.conversation_id,
        body.user_id,
    )
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
            async for text in service.stream(
                body.question,
                conversation_id,
                body.user_id,
            ):
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
    summary, messages = await service.history(conversation_id)
    return ApiResponse(
        data=ConversationData(
            conversation_id=conversation_id,
            summary=summary,
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

## 七、长期记忆路由（完整代码）

创建 `app/api/routes/memory.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends

from app.memory.sqlite_store import SQLiteMemoryStore, get_memory_store
from app.schemas.common import ApiResponse
from app.schemas.qa import MemoryWriteRequest, UserMemoryData

router = APIRouter(prefix="/memory", tags=["用户记忆"])


@router.put("/{user_id}", response_model=ApiResponse[UserMemoryData])
async def remember_user_preference(
    user_id: str,
    body: MemoryWriteRequest,
    store: Annotated[SQLiteMemoryStore, Depends(get_memory_store)],
) -> ApiResponse[UserMemoryData]:
    await store.remember(user_id, body.key, body.value)
    return ApiResponse(
        data=UserMemoryData(
            user_id=user_id,
            memories=await store.profile(user_id),
        )
    )


@router.get("/{user_id}", response_model=ApiResponse[UserMemoryData])
async def get_user_memory(
    user_id: str,
    store: Annotated[SQLiteMemoryStore, Depends(get_memory_store)],
) -> ApiResponse[UserMemoryData]:
    return ApiResponse(
        data=UserMemoryData(
            user_id=user_id,
            memories=await store.profile(user_id),
        )
    )
```

将 `app/api/router.py` 完整替换为：

```python
from fastapi import APIRouter

from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.memory import router as memory_router
from app.api.routes.qa import router as qa_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(qa_router)
api_router.include_router(documents_router)
api_router.include_router(memory_router)
```

## 八、仓库测试（完整代码）

创建 `tests/test_memory_store.py`：

```python
from pathlib import Path

import pytest

from app.llm.base import ChatMessage
from app.memory.sqlite_store import SQLiteMemoryStore


@pytest.mark.anyio
async def test_memory_survives_new_store_instance(tmp_path: Path) -> None:
    database = tmp_path / "memory.db"
    first = SQLiteMemoryStore(database, compact_threshold=20, keep_recent=6)
    await first.append("c1", ChatMessage(role="user", content="我在学 Java"))

    second = SQLiteMemoryStore(database, compact_threshold=20, keep_recent=6)
    _, messages = await second.context("c1")

    assert messages[0].content == "我在学 Java"


@pytest.mark.anyio
async def test_old_messages_are_compacted(tmp_path: Path) -> None:
    store = SQLiteMemoryStore(
        tmp_path / "compact.db",
        compact_threshold=4,
        keep_recent=2,
    )

    for index in range(6):
        await store.append(
            "c2",
            ChatMessage(role="user", content=f"message-{index}"),
        )

    summary, recent = await store.context("c2")
    assert summary is not None
    assert len(recent) <= 4
    assert "message-0" in summary


@pytest.mark.anyio
async def test_long_term_memory_is_upserted(tmp_path: Path) -> None:
    store = SQLiteMemoryStore(tmp_path / "profile.db", 20, 6)
    await store.remember("u1", "answer_style", "简洁")
    await store.remember("u1", "answer_style", "详细")

    assert await store.profile("u1") == {"answer_style": "详细"}
```

创建 `tests/conftest.py`，明确只使用你已经安装的 asyncio 后端：

```python
import pytest


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
```

`pyproject.toml` 保持以下完整内容：

```toml
[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
addopts = "-q"
```

## 九、运行验证

```powershell
python -m pytest
python -m uvicorn app.main:app --reload
```

写入用户偏好：

```powershell
$body = @{ key = 'answer_style'; value = '先通俗后专业' } | ConvertTo-Json
Invoke-RestMethod `
  -Uri 'http://127.0.0.1:8000/api/v1/memory/user-1' `
  -Method Put `
  -ContentType 'application/json' `
  -Body $body
```

::: tip 💡 面试题：短期记忆、摘要、长期记忆有什么区别？
短期记忆保留当前会话最近原文；摘要压缩较早对话；长期记忆保存跨会话稳定的用户事实或偏好，三者生命周期和读取范围不同。
:::

## 十、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| SQLite | 单文件关系数据库，适合本地和单实例起步 |
| 参数绑定 | SQL 使用占位符，防止注入 |
| 摘要压缩 | 用信息损失换取更小上下文 |
| UPSERT | 主键冲突时更新已有记录 |
| 长期记忆 | 跨会话保存用户稳定偏好，并需支持删除与授权 |

## 十一、✅ 回填清单

- [ ] 重启服务后历史仍能查询
- [ ] 超过阈值后出现摘要且最近消息保留
- [ ] 用户偏好可新增和覆盖
- [ ] 数据库文件未提交 Git（把 `data/*.db` 加入 `.gitignore`）
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十二、下次我会追问

1. 为什么不能无限保存并发送全部消息？
2. SQLite 参数绑定如何防 SQL 注入？
3. 摘要压缩会损失什么，怎样评估？
4. 长期记忆涉及哪些隐私和删除权问题？
5. 为什么数据库操作要使用异步驱动？
