# Day 09 · RAG 文档加载、清洗与重叠切分

> **今天目标**：把已上传的 UTF-8 文档转换成稳定、可追踪的 Chunk。今天不做向量检索，先把 RAG 的数据入口做正确。

## 一、RAG 为什么要切分

整篇文档直接送给模型有三个问题：超出上下文、检索粒度太粗、无关内容增加幻觉。切分时又不能完全割裂上下文，所以相邻 Chunk 保留少量重叠。

```text
原文 → 清洗 → Chunk 1
             └──重叠── Chunk 2
                        └──重叠── Chunk 3
```

## 二、创建目录

```powershell
New-Item -ItemType Directory -Force app\rag
New-Item -ItemType File -Force app\rag\__init__.py
```

## 三、RAG 数据模型（完整代码）

创建 `app/rag/models.py`：

```python
from dataclasses import dataclass, field


@dataclass(frozen=True)
class SourceDocument:
    document_id: str
    source_name: str
    text: str
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Chunk:
    chunk_id: str
    document_id: str
    source_name: str
    index: int
    text: str
    start: int
    end: int
    metadata: dict[str, str] = field(default_factory=dict)
```

`frozen=True` 表示对象创建后字段不可重新赋值，减少索引过程中意外修改 ID 或正文的风险。

## 四、文档加载器（完整代码）

创建 `app/rag/loaders.py`：

```python
import re
from pathlib import Path

from app.core.errors import AppError
from app.rag.models import SourceDocument

ALLOWED_SUFFIXES = {".txt", ".md"}


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u0000", "")
    # 行尾空白删除；连续 3 个以上空行压缩成 2 个。
    text = "\n".join(line.rstrip() for line in text.splitlines())
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def load_text_document(path: Path, document_id: str) -> SourceDocument:
    if path.suffix.lower() not in ALLOWED_SUFFIXES:
        raise AppError("UNSUPPORTED_DOCUMENT", "只支持 txt/md 文档", 415)

    try:
        raw = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise AppError("INVALID_ENCODING", "文档不是 UTF-8 编码", 400) from exc

    text = normalize_text(raw)
    if not text:
        raise AppError("EMPTY_DOCUMENT", "文档内容为空", 400)

    return SourceDocument(
        document_id=document_id,
        source_name=path.name,
        text=text,
        metadata={"suffix": path.suffix.lower()},
    )
```

## 五、重叠切分器（完整代码）

创建 `app/rag/splitter.py`：

```python
from hashlib import sha256

from app.rag.models import Chunk, SourceDocument


class OverlappingTextSplitter:
    def __init__(self, chunk_size: int = 600, overlap: int = 100) -> None:
        if chunk_size < 100:
            raise ValueError("chunk_size 不能小于 100")
        if overlap < 0 or overlap >= chunk_size:
            raise ValueError("overlap 必须大于等于 0 且小于 chunk_size")
        self.chunk_size = chunk_size
        self.overlap = overlap

    def split(self, document: SourceDocument) -> list[Chunk]:
        text = document.text
        chunks: list[Chunk] = []
        start = 0

        while start < len(text):
            hard_end = min(start + self.chunk_size, len(text))
            end = self._natural_boundary(text, start, hard_end)
            content = text[start:end].strip()

            if content:
                index = len(chunks)
                digest = sha256(
                    f"{document.document_id}:{index}:{content}".encode()
                ).hexdigest()[:24]
                chunks.append(
                    Chunk(
                        chunk_id=digest,
                        document_id=document.document_id,
                        source_name=document.source_name,
                        index=index,
                        text=content,
                        start=start,
                        end=end,
                        metadata=dict(document.metadata),
                    )
                )

            if end >= len(text):
                break
            # 至少前进 1 个字符，避免极端文本导致死循环。
            start = max(end - self.overlap, start + 1)

        return chunks

    def _natural_boundary(self, text: str, start: int, hard_end: int) -> int:
        if hard_end >= len(text):
            return len(text)

        minimum = start + self.chunk_size // 2
        candidates = [
            text.rfind(separator, minimum, hard_end)
            for separator in ("\n\n", "\n", "。", "！", "？", ". ")
        ]
        boundary = max(candidates)
        return boundary + 1 if boundary >= minimum else hard_end
```

Chunk ID 由文档 ID、序号和正文计算。相同输入得到相同 ID，重复索引时可以做幂等覆盖。

## 六、切分服务（完整代码）

创建 `app/rag/ingestion.py`：

```python
from pathlib import Path

from app.core.errors import AppError
from app.rag.loaders import load_text_document
from app.rag.models import Chunk
from app.rag.splitter import OverlappingTextSplitter


def find_uploaded_document(upload_dir: Path, document_id: str) -> Path:
    matches = list(upload_dir.glob(f"{document_id}.*"))
    if len(matches) != 1:
        raise AppError("DOCUMENT_NOT_FOUND", "没有找到指定文档", 404)
    return matches[0]


def preview_chunks(
    upload_dir: Path,
    document_id: str,
    chunk_size: int,
    overlap: int,
) -> list[Chunk]:
    path = find_uploaded_document(upload_dir, document_id)
    document = load_text_document(path, document_id)
    return OverlappingTextSplitter(chunk_size, overlap).split(document)
```

## 七、预览接口（完整代码）

创建 `app/api/routes/rag.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.rag.ingestion import preview_chunks
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
    chunks = preview_chunks(
        settings.upload_dir,
        document_id,
        chunk_size,
        overlap,
    )
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
```

将 `app/api/router.py` 完整替换为：

```python
from fastapi import APIRouter

from app.api.routes.agent import router as agent_router
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.memory import router as memory_router
from app.api.routes.qa import router as qa_router
from app.api.routes.rag import router as rag_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(qa_router)
api_router.include_router(documents_router)
api_router.include_router(memory_router)
api_router.include_router(agent_router)
api_router.include_router(rag_router)
```

## 八、测试（完整代码）

创建 `tests/test_splitter.py`：

```python
from app.rag.models import SourceDocument
from app.rag.splitter import OverlappingTextSplitter


def test_splitter_creates_stable_overlapping_chunks() -> None:
    document = SourceDocument(
        document_id="doc-1",
        source_name="spring.md",
        text=("Spring Bean 的生命周期。\n\n" * 80).strip(),
    )
    splitter = OverlappingTextSplitter(chunk_size=160, overlap=30)

    first = splitter.split(document)
    second = splitter.split(document)

    assert len(first) > 1
    assert [chunk.chunk_id for chunk in first] == [chunk.chunk_id for chunk in second]
    assert first[1].start < first[0].end


def test_splitter_rejects_invalid_overlap() -> None:
    try:
        OverlappingTextSplitter(chunk_size=100, overlap=100)
    except ValueError as exc:
        assert "overlap" in str(exc)
    else:
        raise AssertionError("应当拒绝 overlap >= chunk_size")
```

## 九、运行验证

先上传文档并复制返回的 `document_id`，再访问：

```powershell
Invoke-RestMethod `
  'http://127.0.0.1:8000/api/v1/rag/documents/文档ID/preview?chunk_size=600&overlap=100'
```

::: tip 💡 面试题：Chunk 是越小越好吗？
不是。太小会割裂语义并增加召回数量，太大又会混入无关内容；需要结合文档结构、Embedding 模型和评估集调参。
:::

## 十、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| 文本清洗 | 统一换行、编码和无效字符 |
| Chunk | 检索和引用的最小语义单元 |
| overlap | 保留切分边界附近的上下文 |
| 稳定 ID | 支持重复索引幂等和引用追踪 |
| 元数据 | 保存来源、页码、章节等可过滤信息 |

## 十一、✅ 回填清单

- [ ] 上传文档后能预览 Chunk
- [ ] Chunk ID 重复运行保持一致
- [ ] 相邻 Chunk 存在重叠
- [ ] 非法 overlap 被拒绝
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十二、下次我会追问

1. 为什么切分前先清洗文本？
2. overlap 太大有什么副作用？
3. 为什么 Chunk ID 应稳定？
4. Markdown、PDF、代码文件应使用同一种切分策略吗？
