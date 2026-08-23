# Day 02 · FastAPI 路由、请求校验与分层

> **今天目标**：新增第一个问答接口，理解 Router、Schema、Service 的职责。今天仍使用本地回答器，所以没有 API Key 也能完整运行。

## 一、今天新增的结构

```text
app/
├─ api/routes/qa.py          # HTTP 参数和响应
├─ schemas/qa.py             # 请求/响应的数据模型
└─ services/qa_service.py    # 业务逻辑
tests/test_qa.py
```

依赖方向固定为：`route → service`，而不是把全部逻辑写在接口函数里。

## 二、创建空包

```powershell
New-Item -ItemType Directory -Force app\services
New-Item -ItemType File -Force app\services\__init__.py
```

## 三、问答数据模型（完整代码）

创建 `app/schemas/qa.py`：

```python
from pydantic import BaseModel, Field, field_validator


class QuestionRequest(BaseModel):
    """POST /qa/ask 的 JSON 请求体。"""

    question: str = Field(
        min_length=2,
        max_length=2000,
        description="用户问题",
        examples=["Spring Boot 自动配置的原理是什么？"],
    )

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        # 长度校验挡不住只包含空格的字符串，所以主动 strip。
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("question 不能为空白字符")
        return cleaned


class AnswerData(BaseModel):
    question: str
    answer: str
    provider: str
```

`BaseModel` 会完成 JSON → Python 对象的转换和校验。校验失败时 FastAPI 自动返回 HTTP 422，不需要手写大量 `if`。

## 四、业务服务（完整代码）

创建 `app/services/qa_service.py`：

```python
class QAService:
    """问答业务服务。

    Day04 会把本地规则替换为可插拔 LLM；接口层不需要因此重写。
    """

    provider_name = "local-rule"

    async def answer(self, question: str) -> str:
        lowered = question.lower()

        if "spring" in lowered:
            return (
                "Spring 会读取类、方法上的注解元信息，再由相应的处理器"
                "注册 Bean、路由或配置。具体问题可继续追问。"
            )
        if "python" in lowered:
            return "Python 用缩进表示代码块；类型提示主要帮助阅读和静态检查。"

        return f"我收到了你的问题：{question}。Day04 接入大模型后会生成真实答案。"


def get_qa_service() -> QAService:
    """FastAPI 依赖函数；后续测试时可以替换实现。"""

    return QAService()
```

这里的方法写成 `async def`，是为了以后调用模型 API 时可以 `await` 网络请求，而不用改动接口签名。

## 五、问答路由（完整代码）

创建 `app/api/routes/qa.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.schemas.common import ApiResponse
from app.schemas.qa import AnswerData, QuestionRequest
from app.services.qa_service import QAService, get_qa_service

router = APIRouter(prefix="/qa", tags=["智能问答"])


@router.post(
    "/ask",
    response_model=ApiResponse[AnswerData],
    status_code=status.HTTP_200_OK,
    summary="提交问题",
)
async def ask_question(
    body: QuestionRequest,
    service: Annotated[QAService, Depends(get_qa_service)],
) -> ApiResponse[AnswerData]:
    answer = await service.answer(body.question)

    return ApiResponse(
        data=AnswerData(
            question=body.question,
            answer=answer,
            provider=service.provider_name,
        )
    )
```

## 六、替换总路由（完整代码）

将 `app/api/router.py` **完整替换**为：

```python
from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.qa import router as qa_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(qa_router)
```

最终地址由两段前缀组成：主应用的 `/api/v1` + QA Router 的 `/qa` + 方法的 `/ask`。

## 七、自动化测试（完整代码）

创建 `tests/test_qa.py`：

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_ask_question_returns_answer() -> None:
    response = client.post(
        "/api/v1/qa/ask",
        json={"question": "Python 的缩进有什么作用？"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["code"] == 0
    assert payload["data"]["provider"] == "local-rule"
    assert "缩进" in payload["data"]["answer"]


def test_ask_question_rejects_blank_text() -> None:
    response = client.post(
        "/api/v1/qa/ask",
        json={"question": "   "},
    )

    assert response.status_code == 422


def test_ask_question_rejects_missing_field() -> None:
    response = client.post("/api/v1/qa/ask", json={})

    assert response.status_code == 422
```

## 八、运行验证

```powershell
python -m pytest
python -m uvicorn app.main:app --reload
```

请求：

```powershell
$body = @{ question = 'Python 的缩进有什么作用？' } | ConvertTo-Json
Invoke-RestMethod `
  -Uri 'http://127.0.0.1:8000/api/v1/qa/ask' `
  -Method Post `
  -ContentType 'application/json; charset=utf-8' `
  -Body $body
```

预期 `data.provider` 为 `local-rule`，并返回包含“缩进”的答案。

::: tip 💡 面试题：为什么不能把业务逻辑全部写进 Controller/Router？
Router 应只处理 HTTP 边界；业务放进 Service 后可以被命令行、任务队列和测试复用，也更容易替换外部依赖。
:::

## 九、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Pydantic | 根据类型提示校验并序列化数据 |
| `Field` | 声明字段约束和接口文档信息 |
| 依赖注入 | 框架负责创建并传入服务对象 |
| `async def` | 定义可等待的协程函数 |
| 分层 | Router 管 HTTP，Service 管业务，Schema 管契约 |

## 十、✅ 回填清单

- [ ] 新增文件均使用完整代码，没有省略导入
- [ ] `/docs` 能看到“智能问答”分组
- [ ] 正常问题返回 200
- [ ] 空问题返回 422
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十一、下次我会追问

1. Pydantic 校验失败为什么返回 422，而不是 500？
2. `Depends` 相比在函数里直接 `QAService()` 有什么好处？
3. 为什么 Service 现在就写成异步方法？
4. Router、Schema、Service 各自负责什么？
