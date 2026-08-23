# Day 17 · LangChain、LCEL 与可组合 Chain

> **今天目标**：使用 LangChain 1.x 的 LCEL 把 Prompt、模型适配器和输出解析器组合成可测试的 Chain。仍复用我们自己的 `ChatModel`，不绑定某家厂商。

## 一、更新依赖（完整内容）

`requirements.txt`：

```text
fastapi[standard-no-fastapi-cloud-cli]==0.141.1
pydantic-settings==2.15.0
httpx2==2.10.0
aiosqlite==0.22.1
chromadb==1.5.9
langchain==1.3.14
pytest==9.1.1
```

```powershell
python -m pip install -r requirements.txt
```

## 二、LCEL Chain（完整代码）

创建 `app/agent/lcel_chain.py`：

```python
from functools import lru_cache

from langchain_core.messages import BaseMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompt_values import ChatPromptValue
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnableLambda, RunnableSerializable

from app.llm.base import ChatMessage, ChatModel
from app.llm.factory import get_chat_model


def to_app_message(message: BaseMessage) -> ChatMessage:
    role_map = {
        "system": "system",
        "human": "user",
        "ai": "assistant",
        "tool": "tool",
    }
    role = role_map.get(message.type, "user")
    return ChatMessage(role=role, content=str(message.content))  # type: ignore[arg-type]


class LearningCoachChain:
    def __init__(self, model: ChatModel) -> None:
        self.model = model
        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    "你是软件学习教练。结合给定上下文解释概念，先通俗后专业。",
                ),
                (
                    "human",
                    "学习上下文：{context}\n\n问题：{question}",
                ),
            ]
        )

        async def call_model(prompt_value: ChatPromptValue) -> str:
            messages = [
                to_app_message(message) for message in prompt_value.to_messages()
            ]
            return await self.model.complete(messages)

        model_runnable = RunnableLambda(call_model)
        self.chain: RunnableSerializable = prompt | model_runnable | StrOutputParser()

    async def ainvoke(self, question: str, context: str = "无") -> str:
        return await self.chain.ainvoke({"question": question, "context": context})


@lru_cache
def get_learning_chain() -> LearningCoachChain:
    return LearningCoachChain(get_chat_model())
```

`prompt | model | parser` 中的 `|` 被 LCEL 重载为“把前一步输出传给后一步”，不是 Python 原生管道。

## 三、Chain API（完整代码）

创建 `app/api/routes/chains.py`：

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.lcel_chain import LearningCoachChain, get_learning_chain
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/chains", tags=["LangChain"])


class ExplainRequest(BaseModel):
    question: str = Field(min_length=2, max_length=1000)
    context: str = Field(default="无", max_length=4000)


class ExplainData(BaseModel):
    answer: str


@router.post("/explain", response_model=ApiResponse[ExplainData])
async def explain(
    body: ExplainRequest,
    chain: Annotated[LearningCoachChain, Depends(get_learning_chain)],
) -> ApiResponse[ExplainData]:
    answer = await chain.ainvoke(body.question, body.context)
    return ApiResponse(data=ExplainData(answer=answer))
```

将 `app/api/router.py` 完整替换为：

```python
from fastapi import APIRouter

from app.api.routes.agent import router as agent_router
from app.api.routes.chains import router as chains_router
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
api_router.include_router(chains_router)
```

## 四、测试（完整代码）

创建 `tests/test_lcel_chain.py`：

```python
import pytest

from app.agent.lcel_chain import LearningCoachChain
from app.llm.fake import FakeChatModel


@pytest.mark.anyio
async def test_lcel_chain_passes_prompt_to_model() -> None:
    chain = LearningCoachChain(FakeChatModel())

    answer = await chain.ainvoke(
        question="什么是依赖注入？",
        context="我已经学习了 Spring Bean",
    )

    assert "依赖注入" in answer
    assert "Spring Bean" in answer
```

## 五、运行验证

```powershell
python -m pytest
python -m uvicorn app.main:app --reload
```

::: tip 💡 面试题：用了 LangChain 后还需要自己的模型适配层吗？
需要。业务层保留稳定接口可以隔离框架和厂商变化；LangChain 用于组合能力，而不是让整个项目依赖它的所有抽象。
:::

## 六、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| LCEL | 用可组合 Runnable 声明数据流 |
| PromptTemplate | 把变量安全填入消息模板 |
| RunnableLambda | 把普通/异步函数包装成 Runnable |
| OutputParser | 把模型输出转换为目标结构 |
| `ainvoke` | 异步执行一次 Chain |

## 七、✅ 回填清单

- [ ] LangChain 安装成功
- [ ] `/chains/explain` 返回答案
- [ ] Chain 仍使用项目自有 ChatModel
- [ ] 能解释 `|` 的数据流
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 八、下次我会追问

1. LCEL 相比手写顺序调用有什么价值？
2. 为什么不直接在业务代码到处使用 ChatOpenAI？
3. `invoke`、`ainvoke`、`stream` 有什么区别？
4. OutputParser 为什么仍要处理解析失败？
