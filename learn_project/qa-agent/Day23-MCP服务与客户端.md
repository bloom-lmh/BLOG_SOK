# Day 23 · MCP Server、Client、Tool、Resource 与 Prompt

> **今天目标**：把 CourseMall 工具发布成标准 MCP 服务，并用官方 Client 做内存集成测试。完成后，支持 MCP 的 IDE 或 Agent Host 都能发现并调用这些能力。

::: warning 版本说明
本章使用当前稳定的 **MCP Python SDK 2.x**：服务端类是 `MCPServer`，不是旧教程里的 `FastMCP`。Python 需要 3.10+。
:::

## 一、MCP 到底解决什么问题

MCP 不是模型，也不是另一个 HTTP 业务接口。它是一套让 Agent Host 发现和调用外部能力的协议：

| 角色 | 本项目中的例子 |
| --- | --- |
| Host | IDE、桌面 AI 应用、我们自己的 Agent |
| Client | Host 内负责连接 MCP Server 的组件 |
| Server | 我们编写的 CourseMall MCP 服务 |
| Tool | 计算、搜索课程等可执行动作 |
| Resource | 课程目录等可读取数据 |
| Prompt | 可复用的提问模板 |

Tool 由模型选择，Resource 由应用加载，Prompt 由用户主动选择。三者不要混成一种东西。

## 二、更新依赖（完整内容）

将 `requirements.txt` 完整替换为：

```text
fastapi[standard-no-fastapi-cloud-cli]==0.141.1
pydantic-settings==2.15.0
httpx2==2.10.0
aiosqlite==0.22.1
chromadb==1.5.9
langchain==1.3.14
langgraph==1.2.10
mcp[cli]==2.0.0
pytest==9.1.1
```

```powershell
python -m pip install -r requirements.txt
mcp version
```

## 三、CourseMall MCP Server（完整代码）

创建 `app/mcp_server.py`：

```python
import json

from mcp.server import MCPServer
from pydantic import BaseModel

from app.tools.calculator import calculate as safe_calculate
from app.tools.course_catalog import COURSES
from app.tools.course_catalog import search_courses as search_local_courses


class CalculationResult(BaseModel):
    expression: str
    result: float


class CourseItem(BaseModel):
    id: int
    title: str
    level: str


class CourseSearchResult(BaseModel):
    courses: list[CourseItem]
    total: int


mcp = MCPServer(
    "CourseMall Tools",
    version="1.0.0",
    instructions=(
        "提供安全计算和课程目录查询。搜索课程是只读操作，不要把搜索结果当作已经购买。"
    ),
)


@mcp.tool()
def add(a: int, b: int) -> int:
    """将两个整数相加，用于验证 MCP 调用链路。"""
    return a + b


@mcp.tool()
def calculate(expression: str) -> CalculationResult:
    """安全计算只含数字、括号和基本运算符的表达式。"""
    value = safe_calculate(expression)
    return CalculationResult(
        expression=str(value["expression"]),
        result=float(value["result"]),
    )


@mcp.tool()
def search_courses(keyword: str, limit: int = 5) -> CourseSearchResult:
    """按标题关键词搜索课程；limit 必须在 1 到 10 之间。"""
    if not 1 <= limit <= 10:
        raise ValueError("limit 必须在 1 到 10 之间")
    rows = search_local_courses(keyword, limit)
    courses = [CourseItem.model_validate(row) for row in rows]
    return CourseSearchResult(courses=courses, total=len(courses))


@mcp.resource("course://catalog")
def course_catalog() -> str:
    """返回 CourseMall 当前课程目录的 JSON 文本。"""
    return json.dumps(COURSES, ensure_ascii=False)


@mcp.prompt()
def learning_question(topic: str, level: str = "初学者") -> str:
    """生成一个适合当前水平的学习提问模板。"""
    return (
        f"请面向{level}解释 {topic}：先用生活化比喻，再给准确术语，"
        "最后结合 CourseMall 项目说明应用场景。"
    )


if __name__ == "__main__":
    # 默认 stdio。Host 会启动此进程，并通过 stdin/stdout 传输 MCP 消息。
    mcp.run()
```

`MCPServer` 会从函数名、docstring 和类型注解自动生成工具描述与 JSON Schema，但输入仍必须按不可信数据处理；真正的业务权限不能只依赖 Schema。

## 四、使用 Inspector 手动验证

```powershell
mcp dev app/mcp_server.py
```

浏览器打开命令输出的 Inspector 地址，然后验证：

1. Tools 中能看到 `add`、`calculate`、`search_courses`。
2. 调用 `add(a=1, b=2)` 返回 `3`。
3. 调用 `search_courses(keyword="Python")` 返回一门课程。
4. Resources 中能读取 `course://catalog`。
5. Prompts 中能渲染 `learning_question`。

直接启动 stdio 服务的命令是：

```powershell
python -m app.mcp_server
```

此命令会一直等待 Host 发来协议消息，看起来“没有输出”是正常的，按 `Ctrl+C` 停止。

## 五、官方 Client 集成测试（完整代码）

创建 `tests/test_mcp_server.py`：

```python
import pytest
from mcp import Client

from app.mcp_server import mcp


@pytest.mark.anyio
async def test_mcp_lists_project_tools() -> None:
    async with Client(mcp) as client:
        result = await client.list_tools()

    names = {tool.name for tool in result.tools}
    assert {"add", "calculate", "search_courses"} <= names


@pytest.mark.anyio
async def test_mcp_calls_add_tool() -> None:
    async with Client(mcp) as client:
        result = await client.call_tool("add", {"a": 1, "b": 2})

    assert result.is_error is False
    assert result.structured_content == {"result": 3}


@pytest.mark.anyio
async def test_mcp_returns_structured_course_data() -> None:
    async with Client(mcp) as client:
        result = await client.call_tool(
            "search_courses",
            {"keyword": "Python", "limit": 5},
        )

    assert result.is_error is False
    assert result.structured_content is not None
    courses = result.structured_content["courses"]
    assert courses[0]["title"] == "Python 与 FastAPI"
```

`Client(mcp)` 是进程内传输：没有端口和子进程，但仍经过真实的协议发现、参数校验和工具调用链路，非常适合集成测试。

## 六、连接到支持 MCP 的 Host

不同 Host 的配置入口不同，但 stdio 配置核心相同。把下面两个路径替换成你电脑上的真实绝对路径：

```json
{
  "mcpServers": {
    "coursemall": {
      "command": "E:\\你的项目路径\\.venv\\Scripts\\python.exe",
      "args": ["-m", "app.mcp_server"],
      "cwd": "E:\\你的项目路径"
    }
  }
}
```

注意：stdio 模式下不要随意向标准输出 `print()`，否则可能污染协议流。应用日志写到标准错误或日志文件。

## 七、运行与预期结果

```powershell
python -m pytest tests/test_mcp_server.py -q
```

预期：3 个测试通过。你已经证明客户端能发现工具、调用工具并读取结构化结果，而不只是“服务能启动”。

::: tip 💡 面试题：MCP 和 Function Calling 有什么区别？
Function Calling 描述模型如何提出工具调用；MCP 还标准化了 Host、Client、Server 之间的能力发现、参数协议、传输和结果返回。两者可以一起使用。
:::

## 八、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| MCP Host | 用户直接交互、承载模型和 Client 的应用 |
| MCP Client | 与一个 MCP Server 建立协议连接 |
| MCP Server | 对外发布 Tool、Resource 和 Prompt |
| stdio | 本地 Host 启动子进程时常用的传输 |
| Streamable HTTP | 远程部署 MCP 服务的主流传输 |
| 能力发现 | Client 先获取 Server 支持的能力和 Schema |

## 九、✅ 回填清单

- [ ] 安装的是 MCP SDK 2.x
- [ ] Inspector 能看到三种 Primitive
- [ ] Client 能列出并调用工具
- [ ] 搜索结果包含 structured_content
- [ ] 能解释 MCP 与普通 HTTP API 的边界

完成时间：

是否跑通：

踩坑与疑问：

## 十、下次我会追问

1. Host、Client、Server 各自负责什么？
2. Tool、Resource、Prompt 分别由谁决定使用？
3. `Client(mcp)` 为什么适合集成测试？
4. stdio 模式为什么不能随便向 stdout 打日志？
5. MCP 是否替代了业务 REST API？

参考：[MCP Python SDK 官方文档](https://py.sdk.modelcontextprotocol.io/)
