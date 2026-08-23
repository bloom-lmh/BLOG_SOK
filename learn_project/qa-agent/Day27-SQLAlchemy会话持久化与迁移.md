# Day 27 · SQLAlchemy 异步持久化、Repository 与 Alembic 迁移

> **今天目标**：把“会话列表和消息管理”升级为 SQLAlchemy 2.x 异步 ORM，并使用 Alembic 管理数据库结构版本。Day06 的原生 SQLite 记忆仍可保留；今天学习的是更适合持续演进的业务数据层。

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
pytest==9.1.1
```

```powershell
python -m pip install -r requirements.txt
```

## 二、替换应用配置（完整代码）

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
```

## 三、数据库基础设施（完整代码）

创建目录和空包文件：

```powershell
New-Item -ItemType Directory -Force app\db, migrations\versions
New-Item -ItemType File -Force app\db\__init__.py
```

创建 `app/db/base.py`：

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """所有 ORM Model 的共同父类。"""
```

创建 `app/db/session.py`：

```python
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings

settings = get_settings()
Path("data").mkdir(parents=True, exist_ok=True)

engine = create_async_engine(
    settings.sqlalchemy_database_url,
    echo=False,
    pool_pre_ping=True,
)

SessionFactory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
```

依赖函数控制事务边界：路由正常结束就提交，发生异常就回滚。Repository 只 `flush()`，不偷偷提交事务。

## 四、ORM Model（完整代码）

创建 `app/db/models.py`：

```python
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String(32),
        primary_key=True,
        default=lambda: uuid4().hex,
    )
    title: Mapped[str] = mapped_column(String(120), default="新对话")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
    )

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.id",
        lazy="selectin",
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"),
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
    )

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
```

`Mapped[...]` + `mapped_column()` 是 SQLAlchemy 2.x 的类型化声明。关系上的 `delete-orphan` 表示消息只能属于一个会话，删除会话时一并删除消息。

## 五、Repository（完整代码）

创建 `app/db/repositories.py`：

```python
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError
from app.db.models import Conversation, Message


class ConversationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def _query(self):
        return select(Conversation).options(selectinload(Conversation.messages))

    async def create(self, title: str) -> Conversation:
        conversation = Conversation(title=title)
        self.session.add(conversation)
        await self.session.flush()
        return await self.get(conversation.id)

    async def list_all(self) -> list[Conversation]:
        result = await self.session.scalars(
            self._query().order_by(Conversation.updated_at.desc())
        )
        return list(result.unique())

    async def get(self, conversation_id: str) -> Conversation:
        conversation = await self.session.scalar(
            self._query().where(Conversation.id == conversation_id)
        )
        if conversation is None:
            raise AppError(
                "CONVERSATION_NOT_FOUND",
                "会话不存在",
                404,
            )
        return conversation

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
    ) -> Conversation:
        conversation = await self.get(conversation_id)
        conversation.messages.append(Message(role=role, content=content))
        conversation.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        return await self.get(conversation_id)

    async def rename(self, conversation_id: str, title: str) -> Conversation:
        conversation = await self.get(conversation_id)
        conversation.title = title
        conversation.updated_at = datetime.now(timezone.utc)
        await self.session.flush()
        return await self.get(conversation_id)

    async def delete(self, conversation_id: str) -> None:
        conversation = await self.get(conversation_id)
        await self.session.delete(conversation)
        await self.session.flush()
```

## 六、请求和响应模型（完整代码）

创建 `app/schemas/conversation.py`：

```python
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ConversationCreate(BaseModel):
    title: str = Field(default="新对话", min_length=1, max_length=120)


class ConversationRename(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class MessageCreate(BaseModel):
    role: Literal["user", "assistant", "tool"]
    content: str = Field(min_length=1, max_length=20_000)


class MessageData(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    created_at: datetime


class ConversationData(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageData]
```

## 七、会话 CRUD API（完整代码）

创建 `app/api/routes/conversations.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import ConversationRepository
from app.db.session import get_db_session
from app.schemas.common import ApiResponse
from app.schemas.conversation import (
    ConversationCreate,
    ConversationData,
    ConversationRename,
    MessageCreate,
)

router = APIRouter(prefix="/conversations", tags=["持久化会话"])
Database = Annotated[AsyncSession, Depends(get_db_session)]


@router.post(
    "",
    response_model=ApiResponse[ConversationData],
    status_code=status.HTTP_201_CREATED,
)
async def create_conversation(
    body: ConversationCreate,
    db: Database,
) -> ApiResponse[ConversationData]:
    conversation = await ConversationRepository(db).create(body.title)
    return ApiResponse(data=ConversationData.model_validate(conversation))


@router.get("", response_model=ApiResponse[list[ConversationData]])
async def list_conversations(
    db: Database,
) -> ApiResponse[list[ConversationData]]:
    rows = await ConversationRepository(db).list_all()
    return ApiResponse(data=[ConversationData.model_validate(row) for row in rows])


@router.get(
    "/{conversation_id}",
    response_model=ApiResponse[ConversationData],
)
async def get_conversation(
    conversation_id: str,
    db: Database,
) -> ApiResponse[ConversationData]:
    row = await ConversationRepository(db).get(conversation_id)
    return ApiResponse(data=ConversationData.model_validate(row))


@router.post(
    "/{conversation_id}/messages",
    response_model=ApiResponse[ConversationData],
)
async def add_message(
    conversation_id: str,
    body: MessageCreate,
    db: Database,
) -> ApiResponse[ConversationData]:
    row = await ConversationRepository(db).add_message(
        conversation_id,
        body.role,
        body.content,
    )
    return ApiResponse(data=ConversationData.model_validate(row))


@router.patch(
    "/{conversation_id}",
    response_model=ApiResponse[ConversationData],
)
async def rename_conversation(
    conversation_id: str,
    body: ConversationRename,
    db: Database,
) -> ApiResponse[ConversationData]:
    row = await ConversationRepository(db).rename(
        conversation_id,
        body.title,
    )
    return ApiResponse(data=ConversationData.model_validate(row))


@router.delete(
    "/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_conversation(
    conversation_id: str,
    db: Database,
) -> Response:
    await ConversationRepository(db).delete(conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

将 `app/api/router.py` 完整替换为：

```python
from fastapi import APIRouter

from app.api.routes.agent import router as agent_router
from app.api.routes.approval import router as approval_router
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
```

## 八、Alembic 配置（全部是完整文件）

创建 `alembic.ini`：

```ini
[alembic]
script_location = %(here)s/migrations
prepend_sys_path = .
path_separator = os
sqlalchemy.url = sqlite+aiosqlite:///data/app.db
```

创建 `migrations/env.py`：

```python
import asyncio

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import get_settings
from app.db import models  # noqa: F401，确保 Model 注册进 metadata
from app.db.base import Base

config = context.config
config.set_main_option(
    "sqlalchemy.url",
    get_settings().sqlalchemy_database_url.replace("%", "%%"),
)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_async_migrations())
```

创建 `migrations/script.py.mako`，供以后生成迁移使用：

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision: str = ${repr(up_revision)}
down_revision: Union[str, Sequence[str], None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

创建第一份迁移 `migrations/versions/0001_create_conversations.py`：

```python
"""create conversations and messages

Revision ID: 0001_conversations
Revises:
Create Date: 2026-08-23
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_conversations"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("conversation_id", sa.String(length=32), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_messages_conversation_id",
        "messages",
        ["conversation_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_messages_conversation_id", table_name="messages")
    op.drop_table("messages")
    op.drop_table("conversations")
```

执行迁移：

```powershell
New-Item -ItemType Directory -Force data
alembic upgrade head
alembic current
```

日后修改 Model 的标准流程是：

```powershell
alembic revision --autogenerate -m "add message tokens"
# 人工检查生成的迁移，确认无误后再执行：
alembic upgrade head
```

自动生成不等于自动正确，尤其是列重命名、数据搬迁和删除字段，必须人工审查。

## 九、Repository 测试（完整代码）

创建 `tests/test_conversation_repository.py`：

```python
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.errors import AppError
from app.db.base import Base
from app.db.repositories import ConversationRepository


@pytest.mark.anyio
async def test_conversation_crud_and_cascade(tmp_path: Path) -> None:
    database = tmp_path / "repository.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database}")
    factory = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with factory() as session:
        repository = ConversationRepository(session)
        conversation = await repository.create("Spring 学习")
        await repository.add_message(
            conversation.id,
            "user",
            "什么是自动配置？",
        )
        renamed = await repository.rename(conversation.id, "自动配置复习")
        await session.commit()

        assert renamed.title == "自动配置复习"
        assert renamed.messages[0].content == "什么是自动配置？"

    async with factory() as session:
        repository = ConversationRepository(session)
        rows = await repository.list_all()
        assert len(rows) == 1
        await repository.delete(rows[0].id)
        await session.commit()

    async with factory() as session:
        repository = ConversationRepository(session)
        with pytest.raises(AppError) as error:
            await repository.get(conversation.id)
        assert error.value.status_code == 404

    await engine.dispose()
```

## 十、运行与验收

```powershell
alembic upgrade head
python -m pytest tests/test_conversation_repository.py -q
python -m uvicorn app.main:app --reload
```

创建会话：

```powershell
$body = @{ title = 'Spring 复习' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/conversations -ContentType 'application/json' -Body $body
```

::: tip 💡 面试题：为什么 Repository 不应该自行 commit？
一个业务操作可能写多个 Repository。事务应由更外层的 Unit of Work 或请求依赖统一提交/回滚，否则中途提交会破坏原子性。
:::

## 十一、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| AsyncSession | SQLAlchemy 异步会话，也是一次工作单元 |
| Repository | 封装领域数据访问，隔离 ORM 查询细节 |
| Transaction | 一组操作要么全部成功，要么全部回滚 |
| Alembic | 把数据库结构变化保存为可追踪迁移 |
| N+1 | 逐行额外查询关联数据造成的性能问题 |
| selectinload | 用额外批量查询预加载一对多关系 |

## 十二、✅ 回填清单

- [ ] `alembic upgrade head` 成功
- [ ] 会话 CRUD 接口可用
- [ ] 消息随会话一起加载
- [ ] 删除会话后消息级联删除
- [ ] Repository 测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十三、下次我会追问

1. ORM Model 和 Pydantic Model 为什么分开？
2. `flush` 与 `commit` 有什么区别？
3. 为什么迁移脚本必须提交到 Git？
4. 什么是 N+1，`selectinload` 怎么解决？
5. 自动生成迁移为什么仍需人工检查？

参考：[SQLAlchemy 2.0 文档](https://docs.sqlalchemy.org/en/20/)、[Alembic 官方文档](https://alembic.sqlalchemy.org/en/latest/)
