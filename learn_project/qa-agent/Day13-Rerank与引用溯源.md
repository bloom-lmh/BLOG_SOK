# Day 13 · Rerank、上下文拼装与引用溯源

> **今天目标**：对召回候选进行二次排序，并把进入 Prompt 的 Chunk 编号为 `[1] [2]`。最终答案可以展示来源，而不是让用户盲信模型。

## 一、轻量 Reranker（完整代码）

创建 `app/rag/reranker.py`：

```python
from app.rag.bm25 import tokenize
from app.rag.vector_store import SearchHit


class HeuristicReranker:
    """无外部模型的可测试重排器。

    生产环境可替换为 CrossEncoder/Rerank API，接口保持不变。
    """

    def rerank(
        self,
        query: str,
        hits: list[SearchHit],
        top_n: int,
    ) -> list[SearchHit]:
        query_terms = set(tokenize(query))
        rescored: list[SearchHit] = []

        for hit in hits:
            chunk_terms = set(tokenize(hit.chunk.text))
            overlap = len(query_terms & chunk_terms) / max(len(query_terms), 1)
            # 保留召回分，同时提高精确词重叠候选。
            score = 0.4 * hit.score + 0.6 * overlap
            rescored.append(SearchHit(chunk=hit.chunk, score=score))

        return sorted(
            rescored,
            key=lambda item: item.score,
            reverse=True,
        )[:top_n]
```

## 二、引用与上下文构造（完整代码）

创建 `app/rag/citations.py`：

```python
from dataclasses import dataclass

from app.rag.vector_store import SearchHit


@dataclass(frozen=True)
class Citation:
    citation_id: int
    chunk_id: str
    document_id: str
    source_name: str
    chunk_index: int
    preview: str
    score: float


@dataclass(frozen=True)
class GroundedContext:
    text: str
    citations: list[Citation]


def build_grounded_context(
    hits: list[SearchHit],
    max_characters: int = 6000,
) -> GroundedContext:
    sections: list[str] = []
    citations: list[Citation] = []
    used = 0

    for hit in hits:
        citation_id = len(citations) + 1
        header = (
            f"[{citation_id}] source={hit.chunk.source_name} "
            f"chunk={hit.chunk.index} id={hit.chunk.chunk_id}"
        )
        section = f"{header}\n{hit.chunk.text}"
        if sections and used + len(section) > max_characters:
            break

        sections.append(section)
        used += len(section)
        citations.append(
            Citation(
                citation_id=citation_id,
                chunk_id=hit.chunk.chunk_id,
                document_id=hit.chunk.document_id,
                source_name=hit.chunk.source_name,
                chunk_index=hit.chunk.index,
                preview=hit.chunk.text[:160],
                score=hit.score,
            )
        )

    return GroundedContext(text="\n\n".join(sections), citations=citations)
```

引用必须来源于“实际进入模型上下文”的 Chunk，不能把召回但因长度截断而未使用的内容也返回给用户。

## 三、把重排接进服务（完整代码）

将 `app/rag/service.py` 完整替换为：

```python
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings
from app.rag.chroma_store import ChromaVectorStore
from app.rag.embeddings import Embedder, HashingEmbedder
from app.rag.hybrid import HybridRetriever
from app.rag.ingestion import find_uploaded_document
from app.rag.loaders import load_text_document
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
        self.retriever = HybridRetriever(store, embedder)
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
        candidates = self.retriever.search(query, top_k=max(top_k * 4, 20))
        return self.reranker.rerank(query, candidates, top_n=top_k)


@lru_cache
def get_rag_service() -> RAGService:
    settings = get_settings()
    embedder = HashingEmbedder()
    store = ChromaVectorStore(settings.chroma_path, settings.chroma_collection)
    return RAGService(settings.upload_dir, embedder, store)
```

## 四、测试（完整代码）

创建 `tests/test_citations.py`：

```python
from app.rag.citations import build_grounded_context
from app.rag.models import Chunk
from app.rag.reranker import HeuristicReranker
from app.rag.vector_store import SearchHit


def hit(chunk_id: str, text: str, score: float) -> SearchHit:
    chunk = Chunk(chunk_id, "doc", "spring.md", 0, text, 0, len(text))
    return SearchHit(chunk=chunk, score=score)


def test_reranker_promotes_exact_terms() -> None:
    hits = [
        hit("semantic", "框架会自动创建对象", 0.9),
        hit("exact", "Spring Boot 自动配置创建 Bean", 0.5),
    ]

    ranked = HeuristicReranker().rerank(
        "Spring Boot 自动配置 Bean",
        hits,
        top_n=2,
    )

    assert ranked[0].chunk.chunk_id == "exact"


def test_citation_numbers_match_context() -> None:
    context = build_grounded_context(
        [hit("c1", "第一段", 0.8), hit("c2", "第二段", 0.7)]
    )

    assert "[1]" in context.text and "[2]" in context.text
    assert [item.citation_id for item in context.citations] == [1, 2]
    assert context.citations[0].chunk_id == "c1"


def test_context_budget_excludes_unused_citation() -> None:
    context = build_grounded_context(
        [hit("c1", "A" * 100, 0.8), hit("c2", "B" * 100, 0.7)],
        max_characters=150,
    )

    assert len(context.citations) == 1
    assert "[2]" not in context.text
```

## 五、运行验证

```powershell
python -m pytest
```

::: tip 💡 面试题：召回和重排有什么区别？
召回从大规模语料快速找候选，强调不漏；重排在小候选集上使用更精细特征，强调排序准确，两者延迟和成本目标不同。
:::

## 六、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Recall | 从全库快速取得候选 |
| Rerank | 对少量候选精细重新排序 |
| Grounding | 要求答案基于给定上下文 |
| Citation | 将答案证据映射回来源 Chunk |
| Context budget | 限制送入模型的总上下文长度 |

## 七、✅ 回填清单

- [ ] 重排能提升精确命中候选
- [ ] 上下文含稳定 `[n]` 编号
- [ ] Citation 能定位文档和 Chunk
- [ ] 超出预算的 Chunk 不出现在引用列表
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 八、下次我会追问

1. 为什么不直接对全库运行 Reranker？
2. 引用为什么必须对应实际上下文？
3. Reranker 的 `top_n` 如何选择？
4. 有引用是否就能证明答案一定正确？
