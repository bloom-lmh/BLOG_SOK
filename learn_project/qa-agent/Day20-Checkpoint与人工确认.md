# Day 20 · Checkpoint、ThreadId、Interrupt 与人工确认

> **今天目标**：高风险工具执行前暂停图，保存状态并等待用户批准；之后使用同一 `thread_id` 恢复，而不是从头执行。

## 一、审批图（完整代码）

创建 `app/agent/approval_graph.py`：

```python
from functools import lru_cache
from typing import Literal, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt


class ApprovalState(TypedDict, total=False):
    action: str
    risk: Literal["low", "high"]
    approved: bool
    status: Literal["pending", "executed", "rejected"]
    result: str


class ApprovalGraph:
    def __init__(self) -> None:
        builder = StateGraph(ApprovalState)
        builder.add_node("review", self.review)
        builder.add_node("execute", self.execute)
        builder.add_node("reject", self.reject)
        builder.add_edge(START, "review")
        builder.add_conditional_edges(
            "review",
            self.after_review,
            {"execute": "execute", "reject": "reject"},
        )
        builder.add_edge("execute", END)
        builder.add_edge("reject", END)

        # 教学环境使用内存 Checkpointer；Day29 部署时应换持久化实现。
        self.graph = builder.compile(checkpointer=InMemorySaver())

    def review(self, state: ApprovalState) -> ApprovalState:
        if state["risk"] == "low":
            return {"approved": True, "status": "pending"}

        approved = interrupt(
            {
                "question": "是否批准执行高风险操作？",
                "action": state["action"],
                "risk": state["risk"],
            }
        )
        return {"approved": bool(approved), "status": "pending"}

    def after_review(self, state: ApprovalState) -> Literal["execute", "reject"]:
        return "execute" if state.get("approved") else "reject"

    def execute(self, state: ApprovalState) -> ApprovalState:
        # 这里只模拟执行。真正接订单/退款工具时还要权限、审计和幂等。
        return {
            "status": "executed",
            "result": f"已执行：{state['action']}",
        }

    def reject(self, state: ApprovalState) -> ApprovalState:
        return {"status": "rejected", "result": "用户拒绝执行"}

    def start(self, thread_id: str, action: str, risk: str) -> dict:
        config = {"configurable": {"thread_id": thread_id}}
        return self.graph.invoke(
            {"action": action, "risk": risk, "status": "pending"},
            config=config,
        )

    def resume(self, thread_id: str, approved: bool) -> dict:
        config = {"configurable": {"thread_id": thread_id}}
        return self.graph.invoke(Command(resume=approved), config=config)


@lru_cache
def get_approval_graph() -> ApprovalGraph:
    return ApprovalGraph()
```

调用 `interrupt()` 的节点恢复时会从该节点重新执行，因此中断前的外部副作用必须幂等，不能先扣款再询问批准。

## 二、审批 API（完整代码）

创建 `app/api/routes/approval.py`：

```python
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.agent.approval_graph import ApprovalGraph, get_approval_graph
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/approvals", tags=["人工确认"])


class ApprovalStartRequest(BaseModel):
    action: str = Field(min_length=2, max_length=500)
    risk: Literal["low", "high"]
    thread_id: str | None = None


class ApprovalResumeRequest(BaseModel):
    approved: bool


class ApprovalData(BaseModel):
    thread_id: str
    status: str
    interrupt: dict | None = None
    result: str | None = None


def to_data(thread_id: str, state: dict) -> ApprovalData:
    interrupts = state.get("__interrupt__", [])
    interrupt_payload = interrupts[0].value if interrupts else None
    status = "waiting_approval" if interrupts else state.get("status", "unknown")
    return ApprovalData(
        thread_id=thread_id,
        status=status,
        interrupt=interrupt_payload,
        result=state.get("result"),
    )


@router.post("/start", response_model=ApiResponse[ApprovalData])
async def start_approval(
    body: ApprovalStartRequest,
    graph: Annotated[ApprovalGraph, Depends(get_approval_graph)],
) -> ApiResponse[ApprovalData]:
    thread_id = body.thread_id or uuid4().hex
    state = graph.start(thread_id, body.action, body.risk)
    return ApiResponse(data=to_data(thread_id, state))


@router.post("/{thread_id}/resume", response_model=ApiResponse[ApprovalData])
async def resume_approval(
    thread_id: str,
    body: ApprovalResumeRequest,
    graph: Annotated[ApprovalGraph, Depends(get_approval_graph)],
) -> ApiResponse[ApprovalData]:
    state = graph.resume(thread_id, body.approved)
    return ApiResponse(data=to_data(thread_id, state))
```

将 `app/api/router.py` 完整替换为：

```python
from fastapi import APIRouter

from app.api.routes.agent import router as agent_router
from app.api.routes.approval import router as approval_router
from app.api.routes.chains import router as chains_router
from app.api.routes.documents import router as documents_router
from app.api.routes.graph import router as graph_router
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
api_router.include_router(graph_router)
api_router.include_router(approval_router)
```

## 三、测试（完整代码）

创建 `tests/test_approval_graph.py`：

```python
from uuid import uuid4

from app.agent.approval_graph import ApprovalGraph


def test_low_risk_action_executes_without_interrupt() -> None:
    graph = ApprovalGraph()
    state = graph.start(uuid4().hex, "查询课程", "low")

    assert state["status"] == "executed"


def test_high_risk_action_waits_and_can_resume() -> None:
    graph = ApprovalGraph()
    thread_id = uuid4().hex

    waiting = graph.start(thread_id, "为订单退款", "high")
    assert waiting["__interrupt__"][0].value["risk"] == "high"

    finished = graph.resume(thread_id, approved=True)
    assert finished["status"] == "executed"


def test_rejected_action_is_not_executed() -> None:
    graph = ApprovalGraph()
    thread_id = uuid4().hex
    graph.start(thread_id, "删除知识库", "high")

    finished = graph.resume(thread_id, approved=False)

    assert finished["status"] == "rejected"
    assert "拒绝" in finished["result"]
```

## 四、运行验证

```powershell
python -m pytest
```

::: tip 💡 面试题：`thread_id` 在 LangGraph 中起什么作用？
它是 Checkpoint 的会话游标；同一 ID 用于读取并恢复同一条执行状态，不同 ID 表示互相隔离的运行。
:::

## 五、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Checkpoint | 保存每一步状态以便恢复和审计 |
| `thread_id` | 定位某条持久化执行线程 |
| `interrupt` | 动态暂停并向外部请求输入 |
| `Command(resume=...)` | 把人工输入送回暂停位置 |
| 幂等副作用 | 节点重放时不能重复造成业务损失 |

## 六、✅ 回填清单

- [ ] 低风险操作直接执行
- [ ] 高风险操作返回 waiting_approval
- [ ] 同一 thread_id 能批准恢复
- [ ] 拒绝后不执行操作
- [ ] 全部测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 七、下次我会追问

1. 为什么恢复时必须使用同一 thread_id？
2. 中断前为什么不能执行非幂等副作用？
3. InMemorySaver 在多实例部署有什么问题？
4. 哪些业务工具必须增加人工确认？
