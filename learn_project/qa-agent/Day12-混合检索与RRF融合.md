# Day 12 · BM25 混合检索与 RRF 融合

> **今天目标**：同时使用向量召回和关键词召回，再用 RRF 合并排名。这样既能找语义相近内容，也不会漏掉类名、订单号、错误码等精确词。

## 一、BM25（完整代码）

创建 `app/rag/bm25.py`：

```python
import math
import re
from collections import Counter

from app.rag.models import Chunk
from app.rag.vector_store import SearchHit

TOKEN_PATTERN = re.compile(r"[a-zA-Z0-9_.-]+|[\u4e00-\u9fff]")


def tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.casefold())


class BM25Retriever:
    def __init__(self, chunks: list[Chunk], k1: float = 1.5, b: float = 0.75) -> None:
        self.chunks = chunks
        self.k1 = k1
        self.b = b
        self.documents = [tokenize(chunk.text) for chunk in chunks]
        self.avg_length = (
            sum(len(document) for document in self.documents) / len(self.documents)
            if self.documents
            else 0.0
        )
        self.document_frequency = self._document_frequency()

    def _document_frequency(self) -> Counter[str]:
        frequency: Counter[str] = Counter()
        for document in self.documents:
            frequency.update(set(document))
        return frequency

    def search(self, query: str, top_k: int) -> list[SearchHit]:
        query_terms = tokenize(query)
        scored = [
            SearchHit(chunk=chunk, score=self._score(document, query_terms))
            for chunk, document in zip(self.chunks, self.documents, strict=True)
        ]
        return [
            hit
            for hit in sorted(scored, key=lambda item: item.score, reverse=True)
            if hit.score > 0
        ][:top_k]

    def _score(self, document: list[str], query_terms: list[str]) -> float:
        if not document or not self.chunks:
            return 0.0
        frequencies = Counter(document)
        score = 0.0

        for term in query_terms:
            df = self.document_frequency.get(term, 0)
            if df == 0:
                continue
            idf = math.log(1 + (len(self.chunks) - df + 0.5) / (df + 0.5))
            tf = frequencies[term]
            denominator = tf + self.k1 * (
                1 - self.b + self.b * len(document) / max(self.avg_length, 1)
            )
            score += idf * tf * (self.k1 + 1) / denominator
        return score
```

BM25 的 IDF 会降低“所有文档都出现的词”的权重，提高稀有且有区分度词项的权重。

## 二、RRF 混合检索（完整代码）

创建 `app/rag/hybrid.py`：

```python
from app.rag.bm25 import BM25Retriever
from app.rag.chroma_store import ChromaVectorStore
from app.rag.embeddings import Embedder
from app.rag.models import Chunk
from app.rag.vector_store import SearchHit


class HybridRetriever:
    def __init__(
        self,
        store: ChromaVectorStore,
        embedder: Embedder,
        rrf_k: int = 60,
    ) -> None:
        self.store = store
        self.embedder = embedder
        self.rrf_k = rrf_k

    def search(self, query: str, top_k: int = 5) -> list[SearchHit]:
        fetch_k = max(top_k * 3, 10)
        vector_hits = self.store.search(
            self.embedder.embed_query(query),
            fetch_k,
        )
        keyword_hits = BM25Retriever(self.store.all_chunks()).search(query, fetch_k)
        return self._rrf([vector_hits, keyword_hits], top_k)

    def _rrf(
        self,
        rankings: list[list[SearchHit]],
        top_k: int,
    ) -> list[SearchHit]:
        scores: dict[str, float] = {}
        chunks: dict[str, Chunk] = {}

        for ranking in rankings:
            for rank, hit in enumerate(ranking, start=1):
                chunk_id = hit.chunk.chunk_id
                chunks[chunk_id] = hit.chunk
                scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (self.rrf_k + rank)

        ordered = sorted(scores, key=scores.get, reverse=True)
        return [
            SearchHit(chunk=chunks[chunk_id], score=scores[chunk_id])
            for chunk_id in ordered[:top_k]
        ]
```

RRF 只利用“名次”而不是原始分数，因此不需要强行比较 BM25 分数和向量距离这两种不同量纲。

## 三、替换 RAG Service（完整代码）

`app/rag/service.py`：

```python
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings
from app.rag.chroma_store import ChromaVectorStore
from app.rag.embeddings import Embedder, HashingEmbedder
from app.rag.hybrid import HybridRetriever
from app.rag.ingestion import find_uploaded_document
from app.rag.loaders import load_text_document
from app.rag.splitter import OverlappingTextSplitter
from app.rag.vector_store import SearchHit


class RAGService:
    def __init__(
        self,
        upload_dir: Path,
        embedder: Embedder,
        store: ChromaVectorStore,
    ) -> None:
        self.upload_dir = upload_dir
        self.embedder = embedder
        self.store = store
        self.splitter = OverlappingTextSplitter()
        self.retriever = HybridRetriever(store, embedder)

    def index_document(self, document_id: str) -> int:
        path = find_uploaded_document(self.upload_dir, document_id)
        document = load_text_document(path, document_id)
        chunks = self.splitter.split(document)
        embeddings = self.embedder.embed_texts([chunk.text for chunk in chunks])
        self.store.delete_document(document_id)
        self.store.upsert(chunks, embeddings)
        return len(chunks)

    def search(self, query: str, top_k: int = 5) -> list[SearchHit]:
        return self.retriever.search(query, top_k)


@lru_cache
def get_rag_service() -> RAGService:
    settings = get_settings()
    embedder = HashingEmbedder()
    store = ChromaVectorStore(settings.chroma_path, settings.chroma_collection)
    return RAGService(settings.upload_dir, embedder, store)
```

## 四、测试（完整代码）

创建 `tests/test_hybrid_retrieval.py`：

```python
from pathlib import Path

from app.rag.chroma_store import ChromaVectorStore
from app.rag.embeddings import HashingEmbedder
from app.rag.hybrid import HybridRetriever
from app.rag.models import Chunk


def make_chunk(chunk_id: str, text: str) -> Chunk:
    return Chunk(chunk_id, "doc", "guide.md", 0, text, 0, len(text))


def test_exact_error_code_is_recalled_by_bm25(tmp_path: Path) -> None:
    chunks = [
        make_chunk("c1", "支付失败错误码 PAY_409 表示订单已支付"),
        make_chunk("c2", "如何设计一个通用的支付系统"),
    ]
    embedder = HashingEmbedder()
    store = ChromaVectorStore(tmp_path / "chroma", "hybrid_test")
    store.upsert(chunks, embedder.embed_texts([chunk.text for chunk in chunks]))

    hits = HybridRetriever(store, embedder).search("PAY_409", top_k=1)

    assert hits[0].chunk.chunk_id == "c1"


def test_rrf_deduplicates_same_chunk(tmp_path: Path) -> None:
    chunk = make_chunk("same", "Spring Boot Bean")
    embedder = HashingEmbedder()
    store = ChromaVectorStore(tmp_path / "chroma", "dedupe_test")
    store.upsert([chunk], embedder.embed_texts([chunk.text]))

    hits = HybridRetriever(store, embedder).search("Spring Bean", top_k=5)

    assert [hit.chunk.chunk_id for hit in hits] == ["same"]
```

## 五、运行验证

```powershell
python -m pytest
```

::: tip 💡 面试题：为什么混合检索常优于纯向量检索？
向量检索擅长语义近似，BM25 擅长精确词、编号和专有名词；两路召回互补，RRF 再融合不同分数量纲。
:::

## 六、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| BM25 | 基于词频、文档频率和长度归一化的关键词排名 |
| 混合检索 | 同时进行稠密和稀疏召回 |
| RRF | 使用倒数名次融合多路排序 |
| fetch_k | 先扩大候选，再融合/重排 |
| 去重 | 同一 Chunk 多路命中只保留一份 |

## 七、✅ 回填清单

- [ ] 错误码能被关键词路线召回
- [ ] 语义查询仍能走向量路线
- [ ] 同一 Chunk 不重复返回
- [ ] 能解释 RRF 为什么不用原始分数
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 八、下次我会追问

1. BM25 中 IDF 解决什么问题？
2. 为什么两路分数不能直接相加？
3. `fetch_k` 太大有什么代价？
4. 混合检索仍可能漏召回哪些内容？
