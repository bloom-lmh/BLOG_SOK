# Day 03 · TraceId、中间件、统一异常与文档上传

> **今天目标**：建立生产项目必备的 HTTP 基建，并支持安全上传 `.txt/.md` 知识文档。代码完成后，每个响应都有 TraceId，业务异常格式统一。

## 一、创建目录

```powershell
New-Item -ItemType Directory -Force data\uploads
```

## 二、替换配置（完整代码）

将 `app/core/config.py` 完整替换为：

```python
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "QA Agent"
    app_env: str = "dev"
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    upload_dir: Path = Path("data/uploads")
    max_upload_bytes: int = 2 * 1024 * 1024

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

## 三、业务异常（完整代码）

创建 `app/core/errors.py`：

```python
class AppError(Exception):
    """客户端能够理解的业务异常。"""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
```

创建 `app/core/http.py`：

```python
import logging
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.errors import AppError

logger = logging.getLogger(__name__)


def install_http_features(app: FastAPI) -> None:
    """集中安装中间件和异常处理器。"""

    @app.middleware("http")
    async def trace_middleware(request: Request, call_next):
        trace_id = request.headers.get("X-Trace-Id") or uuid4().hex
        request.state.trace_id = trace_id
        started = perf_counter()

        response = await call_next(request)
        response.headers["X-Trace-Id"] = trace_id

        elapsed_ms = (perf_counter() - started) * 1000
        logger.info(
            "request method=%s path=%s status=%s elapsed_ms=%.2f trace_id=%s",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
            trace_id,
        )
        return response

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": exc.code,
                "message": exc.message,
                "data": None,
                "traceId": getattr(request.state, "trace_id", None),
            },
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "code": "VALIDATION_ERROR",
                "message": "请求参数校验失败",
                "data": {"errors": exc.errors()},
                "traceId": getattr(request.state, "trace_id", None),
            },
        )
```

TraceId 用于把浏览器报错、网关日志和服务日志串起来；它不是用户 ID，也不能承载敏感信息。

## 四、文档保存服务（完整代码）

创建 `app/services/document_service.py`：

```python
import asyncio
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import Settings
from app.core.errors import AppError


@dataclass(frozen=True)
class SavedDocument:
    document_id: str
    original_name: str
    stored_name: str
    size: int


class DocumentService:
    allowed_suffixes = {".txt", ".md"}

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def save(self, upload: UploadFile) -> SavedDocument:
        original_name = Path(upload.filename or "").name
        suffix = Path(original_name).suffix.lower()

        if suffix not in self.allowed_suffixes:
            raise AppError(
                code="UNSUPPORTED_FILE_TYPE",
                message="只允许上传 .txt 或 .md 文件",
                status_code=415,
            )

        # 多读 1 字节，才能判断文件是否超过限制。
        content = await upload.read(self.settings.max_upload_bytes + 1)
        if len(content) > self.settings.max_upload_bytes:
            raise AppError(
                code="FILE_TOO_LARGE",
                message="文件不能超过 2MB",
                status_code=413,
            )

        try:
            content.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AppError(
                code="INVALID_ENCODING",
                message="文档必须使用 UTF-8 编码",
            ) from exc

        document_id = uuid4().hex
        stored_name = f"{document_id}{suffix}"
        self.settings.upload_dir.mkdir(parents=True, exist_ok=True)
        target = self.settings.upload_dir / stored_name
        # Path.write_bytes 是同步磁盘 I/O，放到工作线程避免阻塞事件循环。
        await asyncio.to_thread(target.write_bytes, content)

        return SavedDocument(
            document_id=document_id,
            original_name=original_name,
            stored_name=stored_name,
            size=len(content),
        )
```

保存时不用用户文件名作为磁盘路径，可以防止 `../../secret.txt` 这类路径穿越问题。

## 五、上传路由（完整代码）

创建 `app/api/routes/documents.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.schemas.common import ApiResponse
from app.services.document_service import DocumentService

router = APIRouter(prefix="/documents", tags=["知识文档"])


class UploadedDocumentData(BaseModel):
    document_id: str
    original_name: str
    size: int


@router.post("/upload", response_model=ApiResponse[UploadedDocumentData])
async def upload_document(
    file: Annotated[UploadFile, File(description="UTF-8 的 txt/md 文档")],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ApiResponse[UploadedDocumentData]:
    saved = await DocumentService(settings).save(file)
    return ApiResponse(
        data=UploadedDocumentData(
            document_id=saved.document_id,
            original_name=saved.original_name,
            size=saved.size,
        )
    )
```

## 六、替换总路由（完整代码）

`app/api/router.py`：

```python
from fastapi import APIRouter

from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.qa import router as qa_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(qa_router)
api_router.include_router(documents_router)
```

## 七、替换应用入口（完整代码）

`app/main.py`：

```python
from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings
from app.core.http import install_http_features


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        description="支持 RAG、工具调用和工作流编排的智能问答 Agent。",
    )

    install_http_features(application)
    application.include_router(api_router, prefix=settings.api_v1_prefix)

    @application.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "message": f"{settings.app_name} is running",
            "docs": "/docs",
        }

    return application


app = create_app()
```

## 八、测试（完整代码）

创建 `tests/test_documents.py`：

```python
from pathlib import Path

from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app

client = TestClient(app)


def test_upload_markdown_document() -> None:
    response = client.post(
        "/api/v1/documents/upload",
        files={
            "file": (
                "spring.md",
                "# Spring\n自动配置".encode(),
                "text/markdown",
            )
        },
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["original_name"] == "spring.md"
    assert data["size"] > 0

    # 测试后删除自己创建的文件，不污染项目。
    stored = get_settings().upload_dir / f"{data['document_id']}.md"
    Path(stored).unlink(missing_ok=True)


def test_upload_rejects_executable_file() -> None:
    response = client.post(
        "/api/v1/documents/upload",
        files={"file": ("bad.exe", b"MZ", "application/octet-stream")},
    )

    assert response.status_code == 415
    assert response.json()["code"] == "UNSUPPORTED_FILE_TYPE"
    assert response.headers["X-Trace-Id"]
```

## 九、运行验证

```powershell
python -m pytest
python -m uvicorn app.main:app --reload
```

上传一个文档：

```powershell
Invoke-RestMethod `
  -Uri 'http://127.0.0.1:8000/api/v1/documents/upload' `
  -Method Post `
  -Form @{ file = Get-Item '.\README.md' }
```

::: tip 💡 面试题：为什么既校验扩展名，还要限制大小和编码？
文件名不可信；大小限制防止内存/磁盘耗尽，编码校验保证后续切分和检索不会因非法字节失败。生产环境还应校验 MIME、病毒扫描并使用对象存储。
:::

## 十、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| 中间件 | 在路由前后统一处理所有请求 |
| TraceId | 跨系统关联一次请求的日志 |
| 异常处理器 | 将异常稳定映射为 HTTP 契约 |
| `UploadFile` | 使用临时文件/流处理上传，优于直接接收全部 `bytes` |
| 路径穿越 | 不能直接把用户文件名拼成保存路径 |

## 十一、✅ 回填清单

- [ ] 正常响应带 `X-Trace-Id`
- [ ] `.md` 文件上传成功
- [ ] `.exe` 返回 415 和统一错误体
- [ ] 大文件限制能解释清楚
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十二、下次我会追问

1. 中间件和依赖注入分别适合解决什么问题？
2. 为什么不能信任 `UploadFile.filename`？
3. TraceId 与用户 ID 有什么区别？
4. 为什么业务异常不能全部返回 HTTP 200？
