# Day 04 · 接入 LLM、适配器模式与 SSE 流式输出

> **今天目标**：支持本地 Fake 模型和任意 OpenAI 兼容模型；同一个问答接口可以普通返回，也可以逐字流式返回。默认配置不需要 API Key，复制后即可运行测试。

## 一、今天的设计

```text
QAService
   ↓ 只依赖 ChatModel 协议
┌──────────────┬──────────────────────┐
│ FakeChatModel│ OpenAICompatibleModel│
│ 本地可测试   │ DeepSeek/OpenAI/本地服务 │
└──────────────┴──────────────────────┘
```

业务层不应到处写模型厂商 SDK。把厂商差异封装在适配器里，未来换模型只改配置。

## 二、创建目录

```powershell
New-Item -ItemType Directory -Force app\llm
New-Item -ItemType File -Force app\llm\__init__.py
```

## 三、替换配置（完整代码）

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

    # 默认 fake，保证没有密钥也能启动和测试。
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

将 `.env.example` 完整替换为：

```dotenv
APP_NAME=QA Agent
APP_ENV=dev
APP_VERSION=0.1.0
API_V1_PREFIX=/api/v1
DEBUG=true

UPLOAD_DIR=data/uploads
MAX_UPLOAD_BYTES=2097152

# 无密钥先用 fake；接真实模型时改为 openai-compatible。
LLM_PROVIDER=fake
LLM_MODEL=fake-model
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=
LLM_TIMEOUT_SECONDS=30
```

## 四、模型协议（完整代码）

创建 `app/llm/base.py`：

```python
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

Role = Literal["system", "user", "assistant", "tool"]


@dataclass(frozen=True)
class ChatMessage:
    role: Role
    content: str


class ChatModel(Protocol):
    """所有聊天模型适配器必须满足的最小协议。"""

    provider_name: str

    async def complete(self, messages: Sequence[ChatMessage]) -> str:
        """一次性返回完整答案。"""

    def stream(self, messages: Sequence[ChatMessage]) -> AsyncIterator[str]:
        """逐块返回答案。"""
```

`Protocol` 类似 Java 接口，但实现类不必显式写 `implements`；只要拥有相同属性和方法，就满足这个协议。

## 五、本地 Fake 模型（完整代码）

创建 `app/llm/fake.py`：

```python
import asyncio
from collections.abc import AsyncIterator, Sequence

from app.llm.base import ChatMessage


class FakeChatModel:
    """无网络、结果确定，专门用于本地开发和自动化测试。"""

    provider_name = "fake"

    async def complete(self, messages: Sequence[ChatMessage]) -> str:
        question = self._last_user_message(messages)
        return f"[本地测试答案] 你问的是：{question}"

    async def stream(
        self,
        messages: Sequence[ChatMessage],
    ) -> AsyncIterator[str]:
        answer = await self.complete(messages)
        # 按字符切只是为了稳定演示；真实模型由服务端决定 chunk 大小。
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

## 六、OpenAI 兼容适配器（完整代码）

创建 `app/llm/openai_compatible.py`：

```python
import json
from collections.abc import AsyncIterator, Sequence

import httpx2

from app.core.errors import AppError
from app.llm.base import ChatMessage


class OpenAICompatibleChatModel:
    """调用兼容 /chat/completions 协议的模型服务。"""

    provider_name = "openai-compatible"

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float,
    ) -> None:
        self.endpoint = f"{base_url.rstrip('/')}/chat/completions"
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def _payload(
        self,
        messages: Sequence[ChatMessage],
        *,
        stream: bool,
    ) -> dict[str, object]:
        return {
            "model": self.model,
            "messages": [
                {"role": message.role, "content": message.content}
                for message in messages
            ],
            "temperature": 0.2,
            "stream": stream,
        }

    @property
    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def complete(self, messages: Sequence[ChatMessage]) -> str:
        try:
            async with httpx2.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(
                    self.endpoint,
                    headers=self._headers,
                    json=self._payload(messages, stream=False),
                )
                response.raise_for_status()
                payload = response.json()
                return str(payload["choices"][0]["message"]["content"])
        except (httpx2.HTTPError, KeyError, IndexError, TypeError) as exc:
            raise AppError(
                code="LLM_REQUEST_FAILED",
                message="模型服务调用失败，请稍后重试",
                status_code=502,
            ) from exc

    async def stream(
        self,
        messages: Sequence[ChatMessage],
    ) -> AsyncIterator[str]:
        try:
            async with httpx2.AsyncClient(timeout=self.timeout_seconds) as client:
                async with client.stream(
                    "POST",
                    self.endpoint,
                    headers=self._headers,
                    json=self._payload(messages, stream=True),
                ) as response:
                    response.raise_for_status()

                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue

                        data = line.removeprefix("data:").strip()
                        if data == "[DONE]":
                            return

                        event = json.loads(data)
                        delta = event["choices"][0]["delta"].get("content")
                        if delta:
                            yield str(delta)
        except (httpx2.HTTPError, json.JSONDecodeError, KeyError, IndexError) as exc:
            raise AppError(
                code="LLM_STREAM_FAILED",
                message="模型流式连接失败",
                status_code=502,
            ) from exc
```

## 七、模型工厂（完整代码）

创建 `app/llm/factory.py`：

```python
from functools import lru_cache

from app.core.config import get_settings
from app.core.errors import AppError
from app.llm.base import ChatModel
from app.llm.fake import FakeChatModel
from app.llm.openai_compatible import OpenAICompatibleChatModel


@lru_cache
def get_chat_model() -> ChatModel:
    settings = get_settings()

    if settings.llm_provider == "fake":
        return FakeChatModel()

    if settings.llm_provider == "openai-compatible":
        if settings.llm_api_key is None or not settings.llm_api_key.get_secret_value():
            raise AppError(
                code="LLM_API_KEY_MISSING",
                message="LLM_API_KEY 尚未配置",
                status_code=500,
            )

        return OpenAICompatibleChatModel(
            base_url=settings.llm_base_url,
            api_key=settings.llm_api_key.get_secret_value(),
            model=settings.llm_model,
            timeout_seconds=settings.llm_timeout_seconds,
        )

    raise AppError(
        code="UNKNOWN_LLM_PROVIDER",
        message=f"不支持的模型提供方：{settings.llm_provider}",
        status_code=500,
    )
```

## 八、替换问答服务（完整代码）

`app/services/qa_service.py`：

```python
from collections.abc import AsyncIterator

from app.llm.base import ChatMessage, ChatModel
from app.llm.factory import get_chat_model

SYSTEM_PROMPT = (
    "你是一名严谨的软件学习教练。不知道时明确说不知道；回答先给结论，再解释原因。"
)


class QAService:
    def __init__(self, model: ChatModel) -> None:
        self.model = model

    @property
    def provider_name(self) -> str:
        return self.model.provider_name

    def _messages(self, question: str) -> list[ChatMessage]:
        return [
            ChatMessage(role="system", content=SYSTEM_PROMPT),
            ChatMessage(role="user", content=question),
        ]

    async def answer(self, question: str) -> str:
        return await self.model.complete(self._messages(question))

    def stream(self, question: str) -> AsyncIterator[str]:
        return self.model.stream(self._messages(question))


def get_qa_service() -> QAService:
    return QAService(get_chat_model())
```

## 九、替换问答路由（完整代码）

`app/api/routes/qa.py`：

```python
import json
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.errors import AppError
from app.schemas.common import ApiResponse
from app.schemas.qa import AnswerData, QuestionRequest
from app.services.qa_service import QAService, get_qa_service

router = APIRouter(prefix="/qa", tags=["智能问答"])


@router.post("/ask", response_model=ApiResponse[AnswerData])
async def ask_question(
    body: QuestionRequest,
    service: Annotated[QAService, Depends(get_qa_service)],
) -> ApiResponse[AnswerData]:
    answer = await service.answer(body.question)
    return ApiResponse(
        data=AnswerData(
            question=body.question,
            answer=answer,
            provider=service.provider_name,
        )
    )


@router.post("/stream", response_class=StreamingResponse)
async def stream_answer(
    body: QuestionRequest,
    service: Annotated[QAService, Depends(get_qa_service)],
) -> StreamingResponse:
    async def events() -> AsyncIterator[str]:
        try:
            async for text in service.stream(body.question):
                data = json.dumps({"text": text}, ensure_ascii=False)
                yield f"event: token\ndata: {data}\n\n"

            yield "event: done\ndata: {}\n\n"
        except AppError as exc:
            data = json.dumps(
                {"code": exc.code, "message": exc.message},
                ensure_ascii=False,
            )
            # 响应一旦开始就不能再把 HTTP 状态改成 502，只能发 error 事件。
            yield f"event: error\ndata: {data}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
```

## 十、测试（完整代码）

将 `tests/test_qa.py` 完整替换为：

```python
import json

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_fake_model_answer_does_not_need_api_key() -> None:
    response = client.post(
        "/api/v1/qa/ask",
        json={"question": "什么是依赖注入？"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["provider"] == "fake"
    assert "什么是依赖注入" in response.json()["data"]["answer"]


def test_stream_returns_token_and_done_events() -> None:
    with client.stream(
        "POST",
        "/api/v1/qa/stream",
        json={"question": "解释 SSE"},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: token" in body
    assert "event: done" in body

    # Fake 模型按字符发送，每个字符都在独立 SSE 事件中，
    # 所以要解析 token 事件后再拼接，不能直接在原始事件流中查找 "SSE"。
    tokens: list[str] = []
    for block in body.replace("\r\n", "\n").split("\n\n"):
        lines = block.splitlines()
        if "event: token" not in lines:
            continue
        data_line = next(line for line in lines if line.startswith("data: "))
        tokens.append(json.loads(data_line.removeprefix("data: "))["text"])

    assert "SSE" in "".join(tokens)


def test_blank_question_uses_unified_validation_error() -> None:
    response = client.post("/api/v1/qa/ask", json={"question": " "})

    assert response.status_code == 422
    assert response.json()["code"] == "VALIDATION_ERROR"
```

## 十一、运行验证

保持 `.env` 中 `LLM_PROVIDER=fake`：

```powershell
python -m pytest
python -m uvicorn app.main:app --reload
```

流式请求：

```powershell
curl.exe -N `
  -H "Content-Type: application/json" `
  -d '{"question":"什么是 SSE？"}' `
  http://127.0.0.1:8000/api/v1/qa/stream
```

接真实兼容模型时修改 `.env` 并重启：

```dotenv
LLM_PROVIDER=openai-compatible
LLM_MODEL=你的模型名
LLM_BASE_URL=服务商给出的兼容地址/v1
LLM_API_KEY=你的密钥
```

::: warning
不要把真实 `.env`、API Key、完整请求头打印进日志或截图。
:::

::: tip 💡 面试题：SSE 和 WebSocket 怎么选？
SSE 是服务端到客户端的单向 HTTP 流，适合模型逐字输出、自动重连且实现简单；需要高频双向通信时再用 WebSocket。
:::

## 十二、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| 适配器模式 | 把不同模型厂商统一到 `ChatModel` 协议 |
| `Protocol` | 基于结构的接口约束 |
| 异步生成器 | `async for` 按需消费连续结果 |
| SSE | `text/event-stream` 中以空行分隔事件 |
| Fake | 让自动化测试不依赖网络和付费 API |

## 十三、✅ 回填清单

- [ ] Fake 模型下无 API Key 也能启动
- [ ] 普通问答接口返回完整答案
- [ ] 流式接口依次出现 `token` 和 `done`
- [ ] 能解释为什么流开始后不能修改 HTTP 状态码
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十四、下次我会追问

1. 为什么业务层不应直接依赖某一家模型 SDK？
2. Fake 模型对测试有什么价值？
3. SSE 为什么要设置 `Cache-Control` 和 `X-Accel-Buffering`？
4. 普通函数、协程和异步生成器有什么区别？
5. 为什么 API Key 使用 `SecretStr`？
