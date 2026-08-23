# Day 01 · Python 环境与 FastAPI 工程骨架

> **今天目标**：亲手创建 `E:\qa-agent`，理解最基础的 Python 项目结构，跑通健康检查接口和自动化测试。今天不接大模型，先确保工程底座可靠。

## 一、今天完成后你会得到什么

你会得到一个真正能启动、能访问 Swagger、能运行测试的 FastAPI 项目：

```text
E:\qa-agent\
├─ .env.example
├─ .gitignore
├─ pyproject.toml
├─ requirements.txt
├─ app\
│  ├─ __init__.py
│  ├─ main.py
│  ├─ api\
│  │  ├─ __init__.py
│  │  ├─ router.py
│  │  └─ routes\
│  │     ├─ __init__.py
│  │     └─ health.py
│  ├─ core\
│  │  ├─ __init__.py
│  │  └─ config.py
│  └─ schemas\
│     ├─ __init__.py
│     └─ common.py
└─ tests\
   ├─ __init__.py
   └─ test_health.py
```

本系列采用 **一个项目逐日演进**：Day02 会直接在今天的项目上继续开发。文档中只要要求新增或修改文件，就会给出该文件的完整内容，不会用 `...` 省略。

## 二、先认识 6 个 Python 概念

你有 Java/TypeScript 基础，可以先这样对应：

| Python | 可以暂时类比 | 含义 |
| --- | --- | --- |
| `.py` 文件 | Java 类文件 / TS 模块 | 一个 Python 模块，可以放类、函数和变量 |
| `def` | Java/TS 函数声明 | 定义函数 |
| `class` | Java/TS 的 `class` | 定义类 |
| `import` | Java `import` / TS `import` | 使用其他模块的内容 |
| `@app.get(...)` | TS 装饰器 / Spring `@GetMapping` | 给函数附加路由元信息，框架扫描后注册接口 |
| 缩进 | Java 的 `{}` | Python 用缩进表示代码块，通常固定 4 个空格 |

Python 语句末尾通常不写分号。缩进不是排版习惯，而是语法；下面两行的层级不同：

```python
def say_hello() -> str:
    return "hello"  # 这行属于函数体，所以必须缩进
```

`-> str` 是返回值的类型提示。它主要帮助 IDE、静态检查和读代码的人，不等同于 Java 编译期的强制类型检查。

## 三、创建项目和虚拟环境

打开 PowerShell，逐行执行：

```powershell
Set-Location E:\
New-Item -ItemType Directory -Path qa-agent
Set-Location E:\qa-agent

# venv 会在当前项目创建一套隔离的 Python 依赖环境。
py -3.10 -m venv .venv

# 如果当前 PowerShell 禁止执行激活脚本，只对当前窗口临时放开。
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1

python --version
python -m pip install --upgrade pip
```

激活成功后，命令行开头通常会出现 `(.venv)`。

::: tip 💡 面试题：为什么每个 Python 项目都要使用虚拟环境？
虚拟环境把解释器依赖隔离在项目内，避免项目 A 升级某个包后破坏项目 B，也让依赖版本能够被准确复现。
:::

## 四、创建目录和空文件

继续在 `E:\qa-agent` 中执行：

```powershell
New-Item -ItemType Directory -Force -Path `
  app\api\routes, `
  app\core, `
  app\schemas, `
  tests

New-Item -ItemType File -Force -Path `
  app\__init__.py, `
  app\api\__init__.py, `
  app\api\routes\__init__.py, `
  app\core\__init__.py, `
  app\schemas\__init__.py, `
  tests\__init__.py
```

`__init__.py` 可以暂时保持空白。它明确告诉 Python：这个目录是一个可导入的包。现代 Python 在部分场景可以没有它，但初学阶段保留，导入行为更清楚、工具兼容性也更稳定。

## 五、依赖文件（完整内容）

创建 `requirements.txt`：

```text
fastapi[standard-no-fastapi-cloud-cli]==0.141.1
pydantic-settings==2.15.0
httpx2==2.10.0
pytest==9.1.1
```

这三个依赖分别负责：

- `FastAPI`：Web API 框架；`standard-no-fastapi-cloud-cli` 会同时安装本地开发需要的 Uvicorn、HTTPX 等常用依赖。
- `pydantic-settings`：从环境变量和 `.env` 文件读取配置。
- `httpx2`：FastAPI/Starlette 当前测试客户端使用的 HTTP 客户端。
- `pytest`：自动化测试框架。

安装依赖：

```powershell
python -m pip install -r requirements.txt
```

为什么固定版本？因为“我这里能跑”不够，换一台电脑重新安装也应该得到相同的主要依赖版本。以后升级依赖要单独升级并重新执行测试。

## 六、项目工具配置（完整内容）

创建 `pyproject.toml`：

```toml
[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
addopts = "-q"
```

含义：

- `pythonpath = ["."]`：测试时把项目根目录加入模块搜索路径，因此能执行 `from app.main import app`。
- `testpaths = ["tests"]`：只从 `tests` 目录收集测试。
- `-q`：减少测试输出噪声。

创建 `.gitignore`：

```text
# Python 生成的字节码和缓存
__pycache__/
*.py[cod]

# 本项目的虚拟环境
.venv/

# 测试、类型检查和覆盖率缓存
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/

# 本地配置和密钥，绝对不能提交
.env

# IDE 和系统文件
.idea/
.vscode/
.DS_Store
Thumbs.db
```

## 七、应用配置（完整代码）

创建 `.env.example`：

```dotenv
APP_NAME=QA Agent
APP_ENV=dev
APP_VERSION=0.1.0
API_V1_PREFIX=/api/v1
DEBUG=true
```

然后复制一份本地配置：

```powershell
Copy-Item .env.example .env
```

`.env.example` 可以提交 Git，因为它只展示配置项；`.env` 不能提交，因为后面会保存模型 API Key。

创建 `app/core/config.py`：

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """应用配置。

    BaseSettings 会先使用这里写的默认值，再让系统环境变量或 .env 覆盖它们。
    """

    app_name: str = "QA Agent"
    app_env: str = "dev"
    app_version: str = "0.1.0"
    api_v1_prefix: str = "/api/v1"
    debug: bool = True

    # Pydantic v2 的配置写法。
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """创建并缓存配置对象。

    配置在进程生命周期内基本不变，没有必要每次请求都重新读取 .env。
    """

    return Settings()
```

你现在只需理解：

- `Settings(BaseSettings)` 表示 `Settings` 继承 `BaseSettings`。
- `app_name: str` 表示变量名是 `app_name`，期望类型是字符串。
- `@lru_cache` 是装饰器；它让同样参数的函数结果被缓存。
- `get_settings()` 第一次调用创建对象，以后直接复用同一个对象。

::: tip 💡 面试题：为什么 API Key 不直接写进 Python 源码？
源码会进入 Git 历史、日志和代码审查系统，密钥一旦提交即使后来删除也可能泄露；应通过环境变量或密钥管理服务注入。
:::

## 八、统一响应模型（完整代码）

创建 `app/schemas/common.py`：

```python
from typing import Generic, TypeVar

from pydantic import BaseModel

# T 表示“暂时还不知道的具体数据类型”。
# 健康检查时它会变成 HealthData，以后问答接口时可以变成 AnswerData。
T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """所有成功接口共用的响应外壳。"""

    code: int = 0
    message: str = "success"
    data: T
```

这和 Java 的 `Result<T>` 是同一个思路：外层 `code/message` 固定，`data` 的类型由具体接口决定。

## 九、健康检查接口（完整代码）

创建 `app/api/routes/health.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import Settings, get_settings
from app.schemas.common import ApiResponse

# 这个 router 只管理“系统状态”相关接口。
router = APIRouter(prefix="/health", tags=["系统状态"])


class HealthData(BaseModel):
    """健康检查响应中的 data。"""

    status: str
    service: str
    version: str
    environment: str


@router.get(
    "",
    response_model=ApiResponse[HealthData],
    summary="健康检查",
)
async def health_check(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ApiResponse[HealthData]:
    """告诉调用方服务是否启动，并返回当前版本和环境。"""

    health = HealthData(
        status="UP",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
    )
    return ApiResponse(data=health)
```

重点理解这一行：

```text
@router.get("", response_model=ApiResponse[HealthData])
```

它和 Spring 的 `@GetMapping`、TypeScript 装饰器很像：装饰器把“GET 路由、响应类型”等元信息绑定到下面的函数。FastAPI 创建应用时读取这些信息并注册路由；真正收到请求后才调用 `health_check()`。

`Depends(get_settings)` 是 FastAPI 的依赖注入：FastAPI 在调用接口函数前先调用 `get_settings()`，再把返回的 `Settings` 对象传给参数 `settings`。

## 十、总路由（完整代码）

创建 `app/api/router.py`：

```python
from fastapi import APIRouter

from app.api.routes.health import router as health_router

# 汇总所有业务路由。以后新增 qa、documents、sessions 路由都从这里接入。
api_router = APIRouter()
api_router.include_router(health_router)
```

`as health_router` 是给导入对象起别名，避免项目里出现很多都叫 `router` 的变量后无法区分。

## 十一、应用入口（完整代码）

创建 `app/main.py`：

```python
from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    """应用工厂：集中创建和组装 FastAPI 应用。"""

    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        debug=settings.debug,
        description="支持 RAG、工具调用和工作流编排的智能问答 Agent。",
    )

    # 最终健康检查地址为 /api/v1/health。
    application.include_router(
        api_router,
        prefix=settings.api_v1_prefix,
    )

    @application.get("/", include_in_schema=False)
    async def root() -> dict[str, str]:
        return {
            "message": f"{settings.app_name} is running",
            "docs": "/docs",
        }

    return application


# Uvicorn 启动时会导入 app.main，再寻找这个名为 app 的对象。
app = create_app()
```

为什么写 `create_app()`，不把所有代码堆在全局？应用工厂便于测试时创建不同配置的应用，也让中间件、路由和生命周期资源的装配位置更清楚。

## 十二、自动化测试（完整代码）

创建 `tests/test_health.py`：

```python
from fastapi.testclient import TestClient

from app.main import app

# TestClient 不需要真的占用 8000 端口，就能向 FastAPI 应用发测试请求。
client = TestClient(app)


def test_root_returns_docs_address() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "message": "QA Agent is running",
        "docs": "/docs",
    }


def test_health_returns_service_status() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "code": 0,
        "message": "success",
        "data": {
            "status": "UP",
            "service": "QA Agent",
            "version": "0.1.0",
            "environment": "dev",
        },
    }
```

`assert 条件` 的意思是“我断言这个条件必须成立”。条件为假时，pytest 会把测试标记为失败。

运行测试：

```powershell
python -m pytest
```

预期结果：

```text
2 passed
```

## 十三、启动和验证

启动开发服务器：

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

命令中的 `app.main:app` 分成两部分：

- `app.main`：导入 `app/main.py` 模块。
- 冒号后的 `app`：使用文件底部创建的 `app = create_app()` 对象。

`--reload` 会在代码改变后重启开发服务器，只适合本地开发，生产环境不能这样运行。

另开一个 PowerShell 窗口验证：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
```

健康检查预期 JSON：

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "UP",
    "service": "QA Agent",
    "version": "0.1.0",
    "environment": "dev"
  }
}
```

浏览器打开：

- Swagger UI：`http://127.0.0.1:8000/docs`
- OpenAPI JSON：`http://127.0.0.1:8000/openapi.json`

如果 Swagger 中能看到“系统状态 / 健康检查”，说明路由装配成功。

## 十四、常见错误排查

### 1. `No module named 'app'`

你大概率没有在 `E:\qa-agent` 项目根目录执行命令。先运行：

```powershell
Set-Location E:\qa-agent
python -m uvicorn app.main:app --reload
```

### 2. 无法执行 `Activate.ps1`

只对当前 PowerShell 窗口放开：

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 3. `python` 不是 3.10

重新用明确版本创建虚拟环境：

```powershell
py -3.10 -m venv .venv
```

### 4. 8000 端口被占用

开发时临时换端口：

```powershell
python -m uvicorn app.main:app --reload --port 8001
```

## 十五、今天的工程边界

今天故意不接 LLM。一个 AI 项目仍然首先是软件工程：配置、路由、错误处理、测试、日志和部署都要可靠。Day04 才接入兼容 OpenAI 协议的模型 API，在没有 API Key 时也会保留可测试的本地假模型。

本项目最终会形成：

```text
客户端
  → FastAPI API 层
  → Agent 工作流（LangGraph）
      ├─ LLM
      ├─ RAG 检索
      ├─ 业务工具
      └─ 会话记忆
  → MySQL / Redis / 向量数据库
```

## 十六、知识点索引

| 知识点 | 今天需要掌握到什么程度 |
| --- | --- |
| Python 模块与包 | 知道 `.py` 是模块、带 `__init__.py` 的目录可作为包导入 |
| 虚拟环境 | 会创建、激活，知道它用于隔离依赖 |
| 类型提示 | 能读懂 `name: str`、`-> str`、`list[str]` |
| 装饰器 | 知道 `@router.get` 会给函数附加路由行为 |
| FastAPI 路由 | 知道 `APIRouter` 如何汇总进主应用 |
| Pydantic | 知道模型负责校验和序列化数据 |
| 依赖注入 | 能解释 `Depends(get_settings)` 的调用关系 |
| 自动化测试 | 会运行 pytest，能读懂基本 `assert` |

## 十七、✅ 回填清单

- [ ] 已在 `E:\qa-agent` 创建项目，没有把代码写进博客目录
- [ ] `python --version` 显示 Python 3.10.x
- [ ] 虚拟环境已激活，依赖安装成功
- [ ] `python -m pytest` 显示 `2 passed`
- [ ] `/api/v1/health` 返回 `status: UP`
- [ ] `/docs` 能打开并看到健康检查接口
- [ ] 能用自己的话解释 `app.main:app`

完成时间：

是否跑通：

遇到的问题：

仍然不理解的地方：

## 十八、下次我会追问

1. 为什么依赖要装进 `.venv`，不能所有项目共用系统 Python？
2. `@router.get` 和 Spring 的 `@GetMapping` 在思路上哪里相似？
3. `response_model` 除了生成文档，还能解决什么问题？
4. 为什么 `.env` 不能提交 Git，而 `.env.example` 可以？
5. `create_app()` 相比直接在全局堆代码有什么好处？

> 你把 Day01 跑通并告诉我后，我会先检查 `E:\qa-agent` 的实际代码，再给 Day02 的完整可运行实现。
