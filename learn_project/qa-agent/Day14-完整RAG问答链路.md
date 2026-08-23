# Day 14 · 完整 RAG 问答链路

> **今天目标**：串起“检索→重排→上下文→模型生成→引用返回”的完整 Pipeline，并提供 `/rag/ask` 接口。Fake 模型下依然能完整测试。

## 一、RAG Pipeline（完整代码）

创建 `app/rag/pipeline.py`：

```python
import re
from dataclasses import dataclass
from functools import lru_cache

from app.llm.base import ChatMessage, ChatModel
from app.llm.factory import get_chat_model
from app.rag.citations import Citation, build_grounded_context
from app.rag.service import RAGService, get_rag_service


@dataclass(frozen=True)
class RAGAnswer:
    question: str
    answer: str
    citations: list[Citation]
    retrieved_chunks: int
    grounded: bool


class RAGPipeline:
    def __init__(self, service: RAGService, model: ChatModel) -> None:
        self.service = service
        self.model = model

    async def ask(self, question: str, top_k: int = 5) -> RAGAnswer:
        hits = self.service.search(question, top_k)
        if not hits:
            return RAGAnswer(
                question=question,
                answer="知识库中没有检索到相关资料，我暂时无法回答。",
                citations=[],
                retrieved_chunks=0,
                grounded=False,
            )

        context = build_grounded_context(hits)
        messages = [
            ChatMessage(
                role="system",
                content=(
                    "你是知识库问答助手。只能根据用户提供的资料回答；"
                    "每个事实后使用 [1]、[2] 形式标注来源；"
                    "资料不足时明确说明，不允许使用记忆补全。"
                ),
            ),
            ChatMessage(
                role="user",
                content=f"问题：{question}\n\n资料：\n{context.text}",
            ),
        ]
        answer = await self.model.complete(messages)
        valid_ids = {citation.citation_id for citation in context.citations}
        mentioned_ids = {int(value) for value in re.findall(r"\[(\d+)]", answer)}

        return RAGAnswer(
            question=question,
            answer=answer,
            citations=context.citations,
            retrieved_chunks=len(hits),
            grounded=bool(mentioned_ids) and mentioned_ids <= valid_ids,
        )


@lru_cache
def get_rag_pipeline() -> RAGPipeline:
    return RAGPipeline(get_rag_service(), get_chat_model())
```

`grounded=True` 只能说明引用编号格式有效，不代表事实一定正确。真正评估还要检查“答案中的主张是否被引用内容支持”。

## 二、替换 Fake 模型（完整代码）

将 `app/llm/fake.py` 完整替换为：

```python
import asyncio
from collections.abc import AsyncIterator, Sequence

from app.llm.base import ChatMessage


class FakeChatModel:
    provider_name = "fake"

    async def complete(self, messages: Sequence[ChatMessage]) -> str:
        question = self._last_user_message(messages)

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

## 三、替换 RAG 路由（完整代码）

将 `app/api/routes/rag.py` 完整替换为：

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.rag.ingestion import preview_chunks
from app.rag.pipeline import RAGPipeline, get_rag_pipeline
from app.rag.service import RAGService, get_rag_service
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/rag", tags=["RAG"])


class ChunkData(BaseModel):
    chunk_id: str
    index: int
    text: str
    start: int
    end: int


class ChunkPreviewData(BaseModel):
    document_id: str
    total: int
    chunks: list[ChunkData]


class IndexData(BaseModel):
    document_id: str
    indexed_chunks: int


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    top_k: int = Field(default=5, ge=1, le=20)


class SearchHitData(BaseModel):
    chunk_id: str
    document_id: str
    source_name: str
    text: str
    score: float


class RAGAskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=10)


class CitationData(BaseModel):
    citation_id: int
    chunk_id: str
    document_id: str
    source_name: str
    chunk_index: int
    preview: str
    score: float


class RAGAnswerData(BaseModel):
    question: str
    answer: str
    citations: list[CitationData]
    retrieved_chunks: int
    grounded: bool


@router.get(
    "/documents/{document_id}/preview",
    response_model=ApiResponse[ChunkPreviewData],
)
async def preview_document_chunks(
    document_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    chunk_size: int = Query(default=600, ge=100, le=2000),
    overlap: int = Query(default=100, ge=0, le=500),
) -> ApiResponse[ChunkPreviewData]:
    chunks = preview_chunks(settings.upload_dir, document_id, chunk_size, overlap)
    return ApiResponse(
        data=ChunkPreviewData(
            document_id=document_id,
            total=len(chunks),
            chunks=[
                ChunkData(
                    chunk_id=chunk.chunk_id,
                    index=chunk.index,
                    text=chunk.text,
                    start=chunk.start,
                    end=chunk.end,
                )
                for chunk in chunks
            ],
        )
    )


@router.post(
    "/documents/{document_id}/index",
    response_model=ApiResponse[IndexData],
)
async def index_document(
    document_id: str,
    service: Annotated[RAGService, Depends(get_rag_service)],
) -> ApiResponse[IndexData]:
    count = service.index_document(document_id)
    return ApiResponse(data=IndexData(document_id=document_id, indexed_chunks=count))


@router.post("/search", response_model=ApiResponse[list[SearchHitData]])
async def search(
    body: SearchRequest,
    service: Annotated[RAGService, Depends(get_rag_service)],
) -> ApiResponse[list[SearchHitData]]:
    return ApiResponse(
        data=[
            SearchHitData(
                chunk_id=hit.chunk.chunk_id,
                document_id=hit.chunk.document_id,
                source_name=hit.chunk.source_name,
                text=hit.chunk.text,
                score=round(hit.score, 6),
            )
            for hit in service.search(body.query, body.top_k)
        ]
    )


@router.post("/ask", response_model=ApiResponse[RAGAnswerData])
async def ask_knowledge_base(
    body: RAGAskRequest,
    pipeline: Annotated[RAGPipeline, Depends(get_rag_pipeline)],
) -> ApiResponse[RAGAnswerData]:
    result = await pipeline.ask(body.question, body.top_k)
    return ApiResponse(
        data=RAGAnswerData(
            question=result.question,
            answer=result.answer,
            citations=[CitationData(**item.__dict__) for item in result.citations],
            retrieved_chunks=result.retrieved_chunks,
            grounded=result.grounded,
        )
    )
```

## 四、Pipeline 测试（完整代码）

创建 `tests/test_rag_pipeline.py`：

```python
import pytest

from app.llm.fake import FakeChatModel
from app.rag.models import Chunk
from app.rag.pipeline import RAGPipeline
from app.rag.vector_store import SearchHit


class StubRAGService:
    def __init__(self, hits: list[SearchHit]) -> None:
        self.hits = hits

    def search(self, query: str, top_k: int = 5) -> list[SearchHit]:
        return self.hits[:top_k]


def make_hit() -> SearchHit:
    text = "Spring Boot 使用条件注解决定某个自动配置是否生效。"
    return SearchHit(
        chunk=Chunk("c1", "d1", "spring.md", 0, text, 0, len(text)),
        score=0.9,
    )


@pytest.mark.anyio
async def test_rag_answer_contains_valid_citation() -> None:
    pipeline = RAGPipeline(StubRAGService([make_hit()]), FakeChatModel())  # type: ignore[arg-type]

    result = await pipeline.ask("自动配置如何判断是否生效？")

    assert "[1]" in result.answer
    assert result.grounded is True
    assert result.citations[0].source_name == "spring.md"


@pytest.mark.anyio
async def test_empty_retrieval_does_not_call_model() -> None:
    pipeline = RAGPipeline(StubRAGService([]), FakeChatModel())  # type: ignore[arg-type]

    result = await pipeline.ask("不存在的问题")

    assert result.grounded is False
    assert result.citations == []
```

## 五、运行验证

```powershell
python -m pytest
```

::: tip 💡 面试题：RAG 为什么仍然可能产生幻觉？
可能检索错、上下文缺失、模型误读或无视约束；RAG 只是提供证据和降低幻觉，不能从机制上保证答案为真。
:::

## 六、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| RAG Pipeline | Retrieve→Rerank→Augment→Generate |
| 拒答 | 无可靠证据时不让模型自由发挥 |
| 引用校验 | 答案编号必须属于实际上下文 |
| Groundedness | 答案主张是否受到证据支持 |
| 依赖注入 | 测试可替换 Retriever 和模型 |

## 七、✅ 回填清单

- [ ] `/rag/ask` 能返回答案和 citations
- [ ] 无检索结果时直接拒答
- [ ] Fake 模型返回合法 `[1]`
- [ ] 无效引用不会标记 grounded
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 八、下次我会追问

1. RAG 四个阶段分别是什么？
2. 为什么检索为空时不应继续普通问答？
3. `grounded=True` 为什么仍不能证明答案正确？
4. 怎样防止 Prompt Injection 操纵资料区？
