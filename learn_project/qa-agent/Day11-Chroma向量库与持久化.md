# Day 11 · Chroma 向量库与持久化索引

> **今天目标**：把 Day10 的进程内向量库替换为 Chroma。服务重启后向量仍存在，并支持按文档删除、幂等重建和元数据过滤。

## 一、更新依赖（完整内容）

`requirements.txt`：

```text
fastapi[standard-no-fastapi-cloud-cli]==0.141.1
pydantic-settings==2.15.0
httpx2==2.10.0
aiosqlite==0.22.1
chromadb==1.5.9
pytest==9.1.1
```

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

在 `.env.example` 末尾增加：

```dotenv
CHROMA_PATH=data/chroma
CHROMA_COLLECTION=qa_agent_chunks
```

把以下目录加入 `.gitignore`：

```text
data/chroma/
data/*.db
```

## 三、Chroma Store（完整代码）

创建 `app/rag/chroma_store.py`：

```python
from pathlib import Path

import chromadb

from app.rag.models import Chunk
from app.rag.vector_store import SearchHit


class ChromaVectorStore:
    def __init__(self, path: Path, collection_name: str) -> None:
        path.mkdir(parents=True, exist_ok=True)
        self.client = chromadb.PersistentClient(path=str(path))
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
        )

    def upsert(self, chunks: list[Chunk], embeddings: list[list[float]]) -> None:
        if len(chunks) != len(embeddings):
            raise ValueError("chunks 和 embeddings 数量必须一致")
        if not chunks:
            return

        self.collection.upsert(
            ids=[chunk.chunk_id for chunk in chunks],
            embeddings=embeddings,
            documents=[chunk.text for chunk in chunks],
            metadatas=[self._metadata(chunk) for chunk in chunks],
        )

    def search(self, query_embedding: list[float], top_k: int) -> list[SearchHit]:
        if self.collection.count() == 0:
            return []

        result = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, self.collection.count()),
            include=["documents", "metadatas", "distances"],
        )
        return self._query_result_to_hits(result)

    def all_chunks(self) -> list[Chunk]:
        result = self.collection.get(include=["documents", "metadatas"])
        chunks: list[Chunk] = []
        for chunk_id, text, metadata in zip(
            result["ids"],
            result["documents"] or [],
            result["metadatas"] or [],
            strict=True,
        ):
            chunks.append(self._chunk(chunk_id, text, metadata))
        return chunks

    def delete_document(self, document_id: str) -> None:
        self.collection.delete(where={"document_id": document_id})

    def count(self) -> int:
        return self.collection.count()

    @staticmethod
    def _metadata(chunk: Chunk) -> dict[str, str | int | float | bool]:
        return {
            "document_id": chunk.document_id,
            "source_name": chunk.source_name,
            "chunk_index": chunk.index,
            "start": chunk.start,
            "end": chunk.end,
            **chunk.metadata,
        }

    def _query_result_to_hits(self, result: dict) -> list[SearchHit]:
        ids = result["ids"][0]
        documents = (result["documents"] or [[]])[0]
        metadatas = (result["metadatas"] or [[]])[0]
        distances = (result["distances"] or [[]])[0]

        return [
            SearchHit(
                chunk=self._chunk(chunk_id, text, metadata),
                # 距离越小越相似；转换为 0~1 附近的“越大越好”分数。
                score=1.0 / (1.0 + float(distance)),
            )
            for chunk_id, text, metadata, distance in zip(
                ids,
                documents,
                metadatas,
                distances,
                strict=True,
            )
        ]

    @staticmethod
    def _chunk(chunk_id: str, text: str, metadata: dict) -> Chunk:
        known_keys = {
            "document_id",
            "source_name",
            "chunk_index",
            "start",
            "end",
        }
        custom_metadata = {
            str(key): str(value)
            for key, value in metadata.items()
            if key not in known_keys
        }
        return Chunk(
            chunk_id=chunk_id,
            document_id=str(metadata["document_id"]),
            source_name=str(metadata["source_name"]),
            index=int(metadata["chunk_index"]),
            text=text,
            start=int(metadata["start"]),
            end=int(metadata["end"]),
            metadata=custom_metadata,
        )
```

Chroma 的 `ids/embeddings/documents/metadatas` 是平行数组，同一索引位置共同组成一条记录，长度必须一致。

## 四、替换 RAG Service（完整代码）

`app/rag/service.py`：

```python
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings
from app.rag.chroma_store import ChromaVectorStore
from app.rag.embeddings import Embedder, HashingEmbedder
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

    def index_document(self, document_id: str) -> int:
        path = find_uploaded_document(self.upload_dir, document_id)
        document = load_text_document(path, document_id)
        chunks = self.splitter.split(document)
        embeddings = self.embedder.embed_texts([chunk.text for chunk in chunks])

        # 先删后写，避免文档缩短后残留旧 Chunk。
        self.store.delete_document(document_id)
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
        store=ChromaVectorStore(
            settings.chroma_path,
            settings.chroma_collection,
        ),
    )
```

生产环境更新索引不能简单“先删后写”，因为中间失败会丢索引。更稳妥的是写入新版本集合，完成后原子切换别名。

## 五、测试（完整代码）

创建 `tests/test_chroma_store.py`：

```python
from pathlib import Path

from app.rag.chroma_store import ChromaVectorStore
from app.rag.embeddings import HashingEmbedder
from app.rag.models import Chunk


def chunk(chunk_id: str, document_id: str, text: str) -> Chunk:
    return Chunk(
        chunk_id=chunk_id,
        document_id=document_id,
        source_name=f"{document_id}.md",
        index=0,
        text=text,
        start=0,
        end=len(text),
    )


def test_chroma_persists_and_filters_document(tmp_path: Path) -> None:
    embedder = HashingEmbedder()
    first = ChromaVectorStore(tmp_path / "chroma", "test_chunks")
    chunks = [
        chunk("c1", "doc-java", "Spring Bean 自动配置"),
        chunk("c2", "doc-python", "Python FastAPI 路由"),
    ]
    first.upsert(chunks, embedder.embed_texts([item.text for item in chunks]))

    # 创建新 Store 实例，模拟服务重启。
    second = ChromaVectorStore(tmp_path / "chroma", "test_chunks")
    hits = second.search(embedder.embed_query("Spring Bean"), top_k=1)
    assert second.count() == 2
    assert hits[0].chunk.chunk_id == "c1"

    second.delete_document("doc-java")
    assert [item.document_id for item in second.all_chunks()] == ["doc-python"]
```

## 六、运行验证

```powershell
python -m pytest
```

索引一次后停止并重启 FastAPI，再调用 `/rag/search`，仍应能检索到数据。

::: tip 💡 面试题：为什么向量记录还要保存原文和元数据？
向量只用于相似度计算；生成答案、展示引用、按租户/权限过滤都需要原文和可过滤元数据。
:::

## 七、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| PersistentClient | 把 Chroma 数据持久化到目录 |
| upsert | 相同 ID 存在时更新，不存在时插入 |
| metadata filter | 按文档、租户、权限等缩小候选集 |
| 距离与相似度 | 距离越小，相似度通常越高 |
| 索引版本 | Embedding 或切分策略变化时应重建并切换版本 |

## 八、✅ 回填清单

- [ ] Chroma 依赖安装成功
- [ ] 索引后重启仍能搜索
- [ ] 同一文档重复索引不会无限增加记录
- [ ] 按 `document_id` 能删除
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 九、下次我会追问

1. upsert 和 insert 有什么区别？
2. 为什么要保存 metadata？
3. 生产重建索引为什么不应直接先删旧数据？
4. Chroma 适合什么规模，何时考虑 Milvus/Elasticsearch？
