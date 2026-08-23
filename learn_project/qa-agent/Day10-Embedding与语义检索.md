# Day 10 · Embedding、余弦相似度与语义检索

> **今天目标**：把 Chunk 转成向量，建立内存向量索引并完成 TopK 检索。默认 Hashing Embedding 无需下载模型，可稳定测试；它是工程替身，不是最终语义模型。

## 一、Embedding 是什么

Embedding 把文本映射成固定维度数字向量。含义越接近，向量方向通常越接近；检索时比较问题向量和 Chunk 向量。

## 二、本地 Embedding（完整代码）

创建 `app/rag/embeddings.py`：

```python
import math
import re
from hashlib import sha256
from typing import Protocol

TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9_]+|[\u4e00-\u9fff]")


class Embedder(Protocol):
    dimension: int

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """批量生成向量。"""

    def embed_query(self, text: str) -> list[float]:
        """生成查询向量。"""


class HashingEmbedder:
    """确定性、无模型依赖的教学/测试 Embedder。

    生产环境替换为真实多语言 Embedding 模型即可，Store 无需变化。
    """

    def __init__(self, dimension: int = 256) -> None:
        if dimension < 32:
            raise ValueError("dimension 不能小于 32")
        self.dimension = dimension

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)

    def _embed(self, text: str) -> list[float]:
        vector = [0.0] * self.dimension
        tokens = TOKEN_PATTERN.findall(text.casefold())

        for token in tokens:
            digest = sha256(token.encode()).digest()
            index = int.from_bytes(digest[:4], "big") % self.dimension
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[index] += sign

        norm = math.sqrt(sum(value * value for value in vector))
        if norm == 0:
            return vector
        return [value / norm for value in vector]
```

使用 Python 内置 `hash()` 不合适，因为它默认会在不同进程使用随机种子；SHA-256 可以让同一 token 的位置稳定。

## 三、内存向量库（完整代码）

创建 `app/rag/vector_store.py`：

```python
from dataclasses import dataclass

from app.rag.models import Chunk


@dataclass(frozen=True)
class SearchHit:
    chunk: Chunk
    score: float


@dataclass(frozen=True)
class VectorRecord:
    chunk: Chunk
    embedding: list[float]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        raise ValueError("向量维度不一致")
    # HashingEmbedder 已归一化，因此点积就是余弦相似度。
    return sum(a * b for a, b in zip(left, right, strict=True))


class InMemoryVectorStore:
    def __init__(self) -> None:
        self._records: dict[str, VectorRecord] = {}

    def upsert(self, chunks: list[Chunk], embeddings: list[list[float]]) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError("chunks 和 embeddings 数量必须一致")
        for chunk, embedding in zip(chunks, embeddings, strict=True):
            self._records[chunk.chunk_id] = VectorRecord(chunk, embedding)

    def search(self, query_embedding: list[float], top_k: int) -> list[SearchHit]:
        hits = [
            SearchHit(
                chunk=record.chunk,
                score=cosine_similarity(query_embedding, record.embedding),
            )
            for record in self._records.values()
        ]
        return sorted(hits, key=lambda hit: hit.score, reverse=True)[:top_k]

    def delete_document(self, document_id: str) -> None:
        self._records = {
            chunk_id: record
            for chunk_id, record in self._records.items()
            if record.chunk.document_id != document_id
        }

    def all_chunks(self) -> list[Chunk]:
        return [record.chunk for record in self._records.values()]

    def count(self) -> int:
        return len(self._records)
```

## 四、RAG 索引服务（完整代码）

创建 `app/rag/service.py`：

```python
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings
from app.rag.embeddings import Embedder, HashingEmbedder
from app.rag.ingestion import find_uploaded_document
from app.rag.loaders import load_text_document
from app.rag.splitter import OverlappingTextSplitter
from app.rag.vector_store import InMemoryVectorStore, SearchHit


class RAGService:
    def __init__(
        self,
        upload_dir: Path,
        embedder: Embedder,
        store: InMemoryVectorStore,
    ) -> None:
        self.upload_dir = upload_dir
        self.embedder = embedder
        self.store = store
        self.splitter = OverlappingTextSplitter()

    def index_document(self, document_id: str) -> int:
        path = find_uploaded_document(self.upload_dir, document_id)
        document = load_text_document(path, document_id)
        chunks = self.splitter.split(document)
        embeddings = self.embedder.embed_texts([chunk.text for chunk in chunks])
        self.store.upsert(chunks, embeddings)
        return len(chunks)

    def search(self, query: str, top_k: int = 5) -> list[SearchHit]:
        return self.store.search(self.embedder.embed_query(query), top_k)


@lru_cache
def get_rag_service() -> RAGService:
    settings = get_settings()
    return RAGService(
        upload_dir=settings.upload_dir,
        embedder=HashingEmbedder(),
        store=InMemoryVectorStore(),
    )
```

Embedding 应批量计算。逐个远程请求会放大网络开销、限流概率和费用。

## 五、替换 RAG 路由（完整代码）

`app/api/routes/rag.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.rag.ingestion import preview_chunks
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
                    **{
                        "chunk_id": chunk.chunk_id,
                        "index": chunk.index,
                        "text": chunk.text,
                        "start": chunk.start,
                        "end": chunk.end,
                    }
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
    hits = service.search(body.query, body.top_k)
    return ApiResponse(
        data=[
            SearchHitData(
                chunk_id=hit.chunk.chunk_id,
                document_id=hit.chunk.document_id,
                source_name=hit.chunk.source_name,
                text=hit.chunk.text,
                score=round(hit.score, 6),
            )
            for hit in hits
        ]
    )
```

## 六、测试（完整代码）

创建 `tests/test_vector_search.py`：

```python
from pathlib import Path

from app.rag.embeddings import HashingEmbedder
from app.rag.service import RAGService
from app.rag.vector_store import InMemoryVectorStore


def test_index_and_search_returns_related_chunk(tmp_path: Path) -> None:
    document_id = "doc-vector"
    path = tmp_path / f"{document_id}.md"
    path.write_text(
        "Spring Boot 自动配置会根据条件创建 Bean。\n\nPython 使用缩进表示代码块。",
        encoding="utf-8",
    )
    service = RAGService(
        upload_dir=tmp_path,
        embedder=HashingEmbedder(),
        store=InMemoryVectorStore(),
    )

    indexed = service.index_document(document_id)
    hits = service.search("Spring Bean 自动配置", top_k=1)

    assert indexed >= 1
    assert hits[0].chunk.document_id == document_id
    assert "Spring" in hits[0].chunk.text


def test_same_text_produces_same_vector() -> None:
    embedder = HashingEmbedder()
    assert embedder.embed_query("Spring") == embedder.embed_query("Spring")
```

## 七、运行验证

```powershell
python -m pytest
```

调用顺序：上传文档 → `/rag/documents/{id}/index` → `/rag/search`。

::: warning
HashingEmbedder 只能提供词项近似，不是真正理解语义。它的价值是让开发、CI 和单元测试不依赖大模型；生产环境必须换真实 Embedding，并重新构建全部索引。
:::

::: tip 💡 面试题：为什么更换 Embedding 模型后必须重建索引？
不同模型的维度和向量空间不同，新查询向量不能与旧文档向量直接比较，即使维度碰巧相同也没有可比语义。
:::

## 八、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Embedding | 把文本编码成固定维度向量 |
| 余弦相似度 | 比较向量方向，弱化长度影响 |
| TopK | 返回分数最高的 K 个候选 |
| 批量向量化 | 降低远程调用开销 |
| 模型版本 | 模型、维度和预处理方式都属于索引版本 |

## 九、✅ 回填清单

- [ ] 文档能完成索引
- [ ] 查询能返回 TopK Chunk
- [ ] 同一文本向量稳定
- [ ] 能解释 HashingEmbedder 的局限
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十、下次我会追问

1. 余弦相似度与欧氏距离有什么差异？
2. 为什么 Embedding 要批量请求？
3. 更换模型后为什么旧向量不可复用？
4. 向量维度越高一定越好吗？
