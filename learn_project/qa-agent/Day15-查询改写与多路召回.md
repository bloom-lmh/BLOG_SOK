# Day 15 · 查询改写、多查询召回与去重

> **今天目标**：解决用户问题过短、口语化或带代词的问题。把一个问题改写成多个检索查询，分别召回后融合并去重。

## 一、查询改写器（完整代码）

创建 `app/rag/query_rewriter.py`：

```python
import re
from dataclasses import dataclass

ALIASES = {
    "springboot": "Spring Boot",
    "自动装配": "自动配置",
    "依赖注入": "DI IoC",
    "向量库": "向量数据库",
    "大模型": "LLM",
}


@dataclass(frozen=True)
class RewriteResult:
    original: str
    queries: list[str]


class RuleBasedQueryRewriter:
    def rewrite(self, question: str, max_queries: int = 3) -> RewriteResult:
        cleaned = re.sub(
            r"^(请问|麻烦你|能不能|可以帮我|我想知道)[，,：:\s]*",
            "",
            question.strip(),
        )
        candidates = [question.strip(), cleaned]

        expanded = cleaned
        for source, target in ALIASES.items():
            expanded = re.sub(source, f"{source} {target}", expanded, flags=re.I)
        candidates.append(expanded)

        unique: list[str] = []
        for candidate in candidates:
            normalized = " ".join(candidate.split())
            if normalized and normalized not in unique:
                unique.append(normalized)

        return RewriteResult(original=question, queries=unique[:max_queries])
```

真实项目可以再使用 LLM 生成查询，但一定保留原始问题，避免改写错误后完全偏离用户意图。

## 二、多查询 Retriever（完整代码）

创建 `app/rag/multi_query.py`：

```python
from typing import Protocol

from app.rag.query_rewriter import RuleBasedQueryRewriter
from app.rag.vector_store import SearchHit


class Searchable(Protocol):
    def search(self, query: str, top_k: int) -> list[SearchHit]:
        """返回某个查询的候选。"""


class MultiQueryRetriever:
    def __init__(
        self,
        base_retriever: Searchable,
        rewriter: RuleBasedQueryRewriter,
        rrf_k: int = 60,
    ) -> None:
        self.base_retriever = base_retriever
        self.rewriter = rewriter
        self.rrf_k = rrf_k

    def search(self, question: str, top_k: int) -> list[SearchHit]:
        rewrite = self.rewriter.rewrite(question)
        scores: dict[str, float] = {}
        best_hit: dict[str, SearchHit] = {}

        for query in rewrite.queries:
            hits = self.base_retriever.search(query, max(top_k * 2, 10))
            for rank, hit in enumerate(hits, start=1):
                chunk_id = hit.chunk.chunk_id
                scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (self.rrf_k + rank)
                previous = best_hit.get(chunk_id)
                if previous is None or hit.score > previous.score:
                    best_hit[chunk_id] = hit

        ordered = sorted(scores, key=scores.get, reverse=True)
        return [
            SearchHit(chunk=best_hit[item].chunk, score=scores[item])
            for item in ordered[:top_k]
        ]
```

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
from app.rag.multi_query import MultiQueryRetriever
from app.rag.query_rewriter import RuleBasedQueryRewriter
from app.rag.reranker import HeuristicReranker
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
        hybrid = HybridRetriever(store, embedder)
        self.retriever = MultiQueryRetriever(hybrid, RuleBasedQueryRewriter())
        self.reranker = HeuristicReranker()

    def index_document(self, document_id: str) -> int:
        path = find_uploaded_document(self.upload_dir, document_id)
        document = load_text_document(path, document_id)
        chunks = self.splitter.split(document)
        embeddings = self.embedder.embed_texts([chunk.text for chunk in chunks])
        self.store.delete_document(document_id)
        self.store.upsert(chunks, embeddings)
        return len(chunks)

    def search(self, query: str, top_k: int = 5) -> list[SearchHit]:
        candidates = self.retriever.search(query, max(top_k * 3, 15))
        return self.reranker.rerank(query, candidates, top_n=top_k)


@lru_cache
def get_rag_service() -> RAGService:
    settings = get_settings()
    embedder = HashingEmbedder()
    store = ChromaVectorStore(settings.chroma_path, settings.chroma_collection)
    return RAGService(settings.upload_dir, embedder, store)
```

## 四、测试（完整代码）

创建 `tests/test_multi_query.py`：

```python
from app.rag.models import Chunk
from app.rag.multi_query import MultiQueryRetriever
from app.rag.query_rewriter import RuleBasedQueryRewriter
from app.rag.vector_store import SearchHit


def make_hit(chunk_id: str, score: float) -> SearchHit:
    text = f"content-{chunk_id}"
    return SearchHit(
        Chunk(chunk_id, "doc", "source.md", 0, text, 0, len(text)),
        score,
    )


class StubRetriever:
    def search(self, query: str, top_k: int) -> list[SearchHit]:
        if "Spring Boot" in query:
            return [make_hit("expanded", 0.8), make_hit("shared", 0.7)]
        return [make_hit("shared", 0.9), make_hit("original", 0.6)]


def test_rewriter_keeps_original_and_adds_alias() -> None:
    result = RuleBasedQueryRewriter().rewrite("请问 springboot 自动装配原理")

    assert result.queries[0] == "请问 springboot 自动装配原理"
    assert any("Spring Boot" in query for query in result.queries)


def test_multi_query_deduplicates_and_rewards_repeated_hit() -> None:
    retriever = MultiQueryRetriever(StubRetriever(), RuleBasedQueryRewriter())

    hits = retriever.search("请问 springboot 自动装配原理", top_k=3)

    ids = [hit.chunk.chunk_id for hit in hits]
    assert len(ids) == len(set(ids))
    assert ids[0] == "shared"
```

## 五、运行验证

```powershell
python -m pytest
```

::: tip 💡 面试题：查询改写最大的风险是什么？
语义漂移。改写可能把原问题理解错，所以应保留原查询、限制改写数量，并用离线评估判断召回是否真正提升。
:::

## 六、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Query Rewrite | 去口语、补别名、消解表达 |
| Multi Query | 用多个视角扩大召回 |
| 语义漂移 | 改写结果偏离原始意图 |
| 跨查询去重 | 相同 Chunk 只返回一次 |
| 融合奖励 | 多个查询都命中的候选获得更高排名 |

## 七、✅ 回填清单

- [ ] 原问题始终保留
- [ ] 别名能够扩展查询
- [ ] 多路结果正确去重
- [ ] 重复命中候选排名提升
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 八、下次我会追问

1. 为什么必须保留原始查询？
2. 查询越多召回一定越好吗？
3. 怎样发现语义漂移？
4. 多查询会增加哪些延迟和成本？
