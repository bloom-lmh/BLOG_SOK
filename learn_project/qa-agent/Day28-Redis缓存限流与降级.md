# Day 28 · Redis 缓存、限流、内存降级与缓存一致性

> **今天目标**：为高成本 Agent 接口增加响应缓存和固定窗口限流；提供内存与 Redis 两种实现，默认不安装 Redis 服务也能运行，部署时只改配置。

## 一、更新依赖（完整内容）

将 `requirements.txt` 完整替换为：

```text
fastapi[standard-no-fastapi-cloud-cli]==0.141.1
pydantic-settings==2.15.0
httpx2==2.10.0
aiosqlite==0.22.1
chromadb==1.5.9
langchain==1.3.14
langgraph==1.2.10
mcp[cli]==2.0.0
sqlalchemy[asyncio]==2.0.52
alembic==1.19.1
redis==8.1.0
pytest==9.1.1
```

```powershell
python -m pip install -r requirements.txt
```

## 二、替换配置（完整代码）

将 `app/core/config.py` 完整替换为：

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
    sqlalchemy_database_url: str = "sqlite+aiosqlite:///data/app.db"
    memory_compact_threshold: int = 12
    memory_keep_recent: int = 6

    chroma_path: Path = Path("data/chroma")
    chroma_collection: str = "qa_agent_chunks"

    llm_provider: str = "fake"
    llm_model: str = "fake-model"
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_api_key: SecretStr | None = None
    llm_timeout_seconds: float = 30.0

    cache_backend: str = "memory"
    redis_url: str = "redis://localhost:6379/0"
    answer_cache_ttl_seconds: int = 300
    rate_limit_requests: int = 20
    rate_limit_window_seconds: int = 60

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
DATABASE_PATH=data/qa_agent.db
SQLALCHEMY_DATABASE_URL=sqlite+aiosqlite:///data/app.db
MEMORY_COMPACT_THRESHOLD=12
MEMORY_KEEP_RECENT=6

CHROMA_PATH=data/chroma
CHROMA_COLLECTION=qa_agent_chunks

LLM_PROVIDER=fake
LLM_MODEL=fake-model
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=
LLM_TIMEOUT_SECONDS=30

CACHE_BACKEND=memory
REDIS_URL=redis://localhost:6379/0
ANSWER_CACHE_TTL_SECONDS=300
RATE_LIMIT_REQUESTS=20
RATE_LIMIT_WINDOW_SECONDS=60
```

本地默认 `memory`，因此今天无需先安装 Redis 服务。Day29 Docker Compose 会切换为 `redis`。

## 三、统一缓存接口（完整代码）

创建 `app/core/cache.py`：

```python
import asyncio
import json
from collections.abc import Callable
from functools import lru_cache
from time import monotonic
from typing import Protocol

from redis.asyncio import Redis

from app.core.config import get_settings
from app.core.errors import AppError


class CacheBackend(Protocol):
    async def get_json(self, key: str) -> object | None:
        """读取 JSON 值；不存在或过期时返回 None。"""

    async def set_json(
        self,
        key: str,
        value: object,
        ttl_seconds: int,
    ) -> None:
        """写入带过期时间的 JSON 值。"""

    async def increment(self, key: str, ttl_seconds: int) -> int:
        """原子递增计数，并在首次写入时设置过期时间。"""


class MemoryCacheBackend:
    def __init__(
        self,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self.clock = clock
        self.values: dict[str, tuple[float, str]] = {}
        self.counters: dict[str, tuple[float, int]] = {}
        self.lock = asyncio.Lock()

    async def get_json(self, key: str) -> object | None:
        async with self.lock:
            item = self.values.get(key)
            if item is None:
                return None
            expires_at, payload = item
            if expires_at <= self.clock():
                self.values.pop(key, None)
                return None
            return json.loads(payload)

    async def set_json(
        self,
        key: str,
        value: object,
        ttl_seconds: int,
    ) -> None:
        payload = json.dumps(value, ensure_ascii=False)
        async with self.lock:
            self.values[key] = (
                self.clock() + ttl_seconds,
                payload,
            )

    async def increment(self, key: str, ttl_seconds: int) -> int:
        async with self.lock:
            now = self.clock()
            item = self.counters.get(key)
            if item is None or item[0] <= now:
                value = 1
                expires_at = now + ttl_seconds
            else:
                expires_at, old_value = item
                value = old_value + 1
            self.counters[key] = (expires_at, value)
            return value


class RedisCacheBackend:
    def __init__(self, url: str) -> None:
        self.client = Redis.from_url(url, decode_responses=True)

    async def get_json(self, key: str) -> object | None:
        payload = await self.client.get(key)
        return json.loads(payload) if payload is not None else None

    async def set_json(
        self,
        key: str,
        value: object,
        ttl_seconds: int,
    ) -> None:
        await self.client.set(
            key,
            json.dumps(value, ensure_ascii=False),
            ex=ttl_seconds,
        )

    async def increment(self, key: str, ttl_seconds: int) -> int:
        # 单条 INCR 在 Redis 内是原子的；第一次计数时补上窗口过期时间。
        value = int(await self.client.incr(key))
        if value == 1:
            await self.client.expire(key, ttl_seconds)
        return value


@lru_cache
def get_cache_backend() -> CacheBackend:
    settings = get_settings()
    if settings.cache_backend == "memory":
        return MemoryCacheBackend()
    if settings.cache_backend == "redis":
        return RedisCacheBackend(settings.redis_url)
    raise AppError(
        "UNKNOWN_CACHE_BACKEND",
        f"不支持的缓存实现：{settings.cache_backend}",
        500,
    )
```

内存实现只适合单进程；启动多个 Uvicorn worker 后，每个进程都有自己的计数器和缓存。Redis 才能让多实例共享状态。

## 四、限流依赖（完整代码）

创建 `app/core/rate_limit.py`：

```python
from hashlib import sha256
from typing import Annotated

from fastapi import Depends, Request

from app.core.cache import CacheBackend, get_cache_backend
from app.core.config import Settings, get_settings
from app.core.errors import AppError


async def enforce_rate_limit(
    request: Request,
    cache: Annotated[CacheBackend, Depends(get_cache_backend)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    raw_identity = request.headers.get("X-User-Id") or (
        request.client.host if request.client else "unknown"
    )
    identity = sha256(raw_identity.encode("utf-8")).hexdigest()[:24]
    key = f"rate:coach:{identity}"
    current = await cache.increment(
        key,
        settings.rate_limit_window_seconds,
    )
    if current > settings.rate_limit_requests:
        raise AppError(
            "RATE_LIMIT_EXCEEDED",
            "请求过于频繁，请稍后再试",
            429,
        )
    request.state.rate_limit_remaining = settings.rate_limit_requests - current
```

固定窗口简单易懂，但窗口交界处可能短时间放过两倍请求。要求更平滑时可改滑动窗口或令牌桶。

## 五、带缓存的 Coach 服务（完整代码）

创建 `app/services/cached_coach.py`：

```python
from functools import lru_cache
from hashlib import sha256

from app.agent.integrated_graph import (
    IntegratedCoachGraph,
    get_integrated_coach_graph,
)
from app.core.cache import CacheBackend, get_cache_backend
from app.core.config import get_settings


class CachedCoachService:
    def __init__(
        self,
        graph: IntegratedCoachGraph,
        cache: CacheBackend,
        ttl_seconds: int,
    ) -> None:
        self.graph = graph
        self.cache = cache
        self.ttl_seconds = ttl_seconds

    @staticmethod
    def cache_key(question: str) -> str:
        normalized = " ".join(question.casefold().split())
        digest = sha256(normalized.encode("utf-8")).hexdigest()
        # v1 是缓存命名空间。Prompt 或知识库版本变化时应升级它。
        return f"answer:v1:{digest}"

    async def ask(self, question: str) -> tuple[dict[str, object], bool]:
        key = self.cache_key(question)
        cached = await self.cache.get_json(key)
        if isinstance(cached, dict):
            return cached, True

        state = await self.graph.run(question)
        data: dict[str, object] = {
            "route": state["route"],
            "answer": state["answer"],
            "citations": state.get("citations", []),
            "courses": state.get("courses", []),
        }
        await self.cache.set_json(key, data, self.ttl_seconds)
        return data, False


@lru_cache
def get_cached_coach_service() -> CachedCoachService:
    settings = get_settings()
    return CachedCoachService(
        get_integrated_coach_graph(),
        get_cache_backend(),
        settings.answer_cache_ttl_seconds,
    )
```

真实 RAG 的缓存键还应包含 `knowledge_base_revision`，否则文档更新后可能在 TTL 内继续返回旧答案。

## 六、缓存接口（完整代码）

创建 `app/api/routes/cached_coach.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.rate_limit import enforce_rate_limit
from app.schemas.common import ApiResponse
from app.services.cached_coach import (
    CachedCoachService,
    get_cached_coach_service,
)

router = APIRouter(prefix="/cached-coach", tags=["缓存与限流"])


class CachedCoachRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1500)


class CachedCoachData(BaseModel):
    route: str
    answer: str
    citations: list[dict[str, object]]
    courses: list[dict[str, object]]
    cached: bool


@router.post("/ask", response_model=ApiResponse[CachedCoachData])
async def ask_cached_coach(
    body: CachedCoachRequest,
    service: Annotated[
        CachedCoachService,
        Depends(get_cached_coach_service),
    ],
    _: Annotated[None, Depends(enforce_rate_limit)],
) -> ApiResponse[CachedCoachData]:
    result, cached = await service.ask(body.question)
    return ApiResponse(
        data=CachedCoachData(
            route=str(result["route"]),
            answer=str(result["answer"]),
            citations=list(result["citations"]),
            courses=list(result["courses"]),
            cached=cached,
        )
    )
```

将 `app/api/router.py` 完整替换为：

```python
from fastapi import APIRouter

from app.api.routes.agent import router as agent_router
from app.api.routes.approval import router as approval_router
from app.api.routes.cached_coach import router as cached_coach_router
from app.api.routes.chains import router as chains_router
from app.api.routes.conversations import router as conversations_router
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
api_router.include_router(conversations_router)
api_router.include_router(cached_coach_router)
```

## 七、缓存与服务测试（完整代码）

创建 `tests/test_cache.py`：

```python
import pytest

from app.core.cache import MemoryCacheBackend
from app.services.cached_coach import CachedCoachService


@pytest.mark.anyio
async def test_memory_cache_expires() -> None:
    now = [100.0]
    cache = MemoryCacheBackend(clock=lambda: now[0])
    await cache.set_json("key", {"value": 1}, ttl_seconds=10)

    assert await cache.get_json("key") == {"value": 1}
    now[0] = 111.0
    assert await cache.get_json("key") is None


@pytest.mark.anyio
async def test_fixed_window_counter_resets() -> None:
    now = [100.0]
    cache = MemoryCacheBackend(clock=lambda: now[0])

    assert await cache.increment("rate:user", 10) == 1
    assert await cache.increment("rate:user", 10) == 2
    now[0] = 111.0
    assert await cache.increment("rate:user", 10) == 1


class StubGraph:
    def __init__(self) -> None:
        self.calls = 0

    async def run(self, question: str) -> dict:
        self.calls += 1
        return {
            "route": "direct",
            "answer": f"回答：{question}",
            "citations": [],
            "courses": [],
        }


@pytest.mark.anyio
async def test_same_question_hits_answer_cache() -> None:
    graph = StubGraph()
    service = CachedCoachService(
        graph,  # type: ignore[arg-type]
        MemoryCacheBackend(),
        ttl_seconds=60,
    )

    first, first_cached = await service.ask("什么是 RAG？")
    second, second_cached = await service.ask("  什么是   rag？ ")

    assert first == second
    assert first_cached is False
    assert second_cached is True
    assert graph.calls == 1
```

## 八、运行与验收

不启动 Redis，先验证内存模式：

```powershell
python -m pytest tests/test_cache.py -q
python -m uvicorn app.main:app --reload
```

连续请求两次相同问题：

```powershell
$body = @{ question = '推荐 Python 课程' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/cached-coach/ask -ContentType 'application/json' -Body $body
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/cached-coach/ask -ContentType 'application/json' -Body $body
```

第一次 `cached=false`，第二次应为 `cached=true`。超过限流阈值后返回 HTTP 429。

::: tip 💡 面试题：缓存 Agent 答案最大的风险是什么？
知识库、Prompt、模型或用户权限变化后，旧答案可能失效或越权复用。因此缓存键要包含版本和权限维度，并设置合理 TTL 与主动失效机制。
:::

## 九、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Cache Aside | 先查缓存，未命中再计算并回填 |
| TTL | 数据允许在缓存中存活的时间 |
| 固定窗口限流 | 在一个时间窗口内限制计数 |
| INCR | Redis 原子递增，适合共享计数 |
| 缓存穿透 | 大量不存在的键持续打到后端 |
| 缓存一致性 | 源数据变化后及时失效旧缓存 |

## 十、✅ 回填清单

- [ ] 无 Redis 时内存模式可运行
- [ ] 相同问题第二次命中缓存
- [ ] TTL 到期后重新计算
- [ ] 超过阈值返回 429
- [ ] 能说明多实例为什么需要 Redis

完成时间：

是否跑通：

踩坑与疑问：

## 十一、下次我会追问

1. Cache Aside 的读流程是什么？
2. 内存缓存为什么不适合多 worker？
3. 固定窗口限流有什么边界问题？
4. RAG 文档更新后怎样避免旧缓存？
5. Redis 故障时应该 fail-open 还是 fail-closed？
