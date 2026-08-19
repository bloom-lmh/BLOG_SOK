# FastAPI

一句话定位：FastAPI 是基于 Starlette 和 Pydantic 的现代 Python Web 框架，靠「类型注解自动生成文档 + 原生异步」解决高性能 API 开发、参数校验与接口文档三大痛点。

## 基础篇

### 一、FastAPI 是什么

#### 1. 背景：Python Web 框架的演进痛点

在 FastAPI 出现之前，Python 做 Web 开发主要有两条路线：

- **同步路线**（Flask / Django）：上手简单、生态成熟，但默认是「一请求一线程」模型，遇到大量 I/O（数据库查询、调第三方接口）时线程池会被吃满，高并发下吞吐上不去。
- **异步路线**（aiohttp / Sanic）：基于 `asyncio` 事件循环，性能高，但「参数校验 + 接口文档」得自己拼，而且 async 语法对新手不友好。

FastAPI 想同时解决三件事：

| 痛点 | 传统方案 | FastAPI 的方案 |
|------|---------|---------------|
| 参数校验 | 手写 `if` 判断、用第三方库 | Pydantic 模型 + 类型注解自动校验 |
| 接口文档 | 手写 swagger / postman 导出 | 自动生成 OpenAPI，`/docs` 直接调试 |
| 高并发性能 | 异步框架 + 手工搭建 | 原生 async，性能比肩 Node/Go |

#### 2. 定义

FastAPI 是一个用于构建 API 的现代、快速（高性能）的 Web 框架，它站在两个巨人肩膀上：

- **Starlette**：提供 HTTP 层能力（路由、中间件、WebSocket、请求/响应对象），它是 ASGI 框架。
- **Pydantic**：提供数据层能力（类型校验、序列化、JSON Schema 生成）。

FastAPI 本身只做「胶水」：用 Python 的类型注解（type hints）把「路由函数的参数签名」自动翻译成「参数解析 + 校验 + 文档」。

#### 3. 核心特性

- **快**：性能与 Node.js、Go 同级别，是 Python 框架里最快的之一（基于 Starlette + Pydantic，Pydantic v2 底层是 Rust 写的）。
- **自动文档**：自动生成 OpenAPI（Swagger）规范，`/docs` 可视化调试，`/redoc` 只读文档。
- **基于标准类型注解**：无需学新的 DSL，用的就是 Python 3.6+ 的类型提示。
- **原生异步**：`async def` 直接跑在事件循环，也兼容同步 `def`。
- **依赖注入**：`Depends` 让鉴权、DB 连接等公共逻辑复用、可测试。

---

### 二、环境搭建与最小应用

#### 1. 安装

```bash
# 1. 创建虚拟环境（隔离项目依赖，避免污染全局 Python）
python -m venv venv

# 2. 激活虚拟环境（Windows 用 venv\Scripts\activate，Linux/Mac 用 source venv/bin/activate）
# Windows:
venv\Scripts\activate

# 3. 安装 FastAPI + ASGI 服务器
pip install fastapi uvicorn[standard]
# uvicorn[standard] 会带上 uvloop(性能加速)、httptools(HTTP解析加速) 等可选依赖
```

> 说明：FastAPI 只负责「应用逻辑」，真正对外提供服务（接收 HTTP 请求）的是 **ASGI 服务器**，最常用的是 Uvicorn。

#### 2. 最小应用

```python
# main.py
from fastapi import FastAPI

app = FastAPI()  # 创建应用实例，是整个服务的入口，所有路由都挂载在它上面

@app.get("/")                 # 装饰器把 URL 路径 "/" 和函数 read_root 绑定
def read_root():
    return {"hello": "world"} # 返回 dict，FastAPI 会自动转成 JSON 响应
```

#### 3. 启动服务

```bash
# main:app 表示「模块 main 里的变量 app」，--reload 表示代码改动自动重启（仅开发环境用）
uvicorn main:app --reload

# 常用参数说明
# --host 0.0.0.0  让服务监听所有网卡，外部可访问（默认 127.0.0.1 只本机）
# --port 8000     端口（默认 8000）
# --workers 4     进程数（生产环境多进程，注意与 --reload 冲突）
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

启动后访问：

- `http://127.0.0.1:8000/` → `{"hello":"world"}`
- `http://127.0.0.1:8000/docs` → Swagger UI（可在线点按钮调试接口）
- `http://127.0.0.1:8000/redoc` → ReDoc 只读文档
- `http://127.0.0.1:8000/openapi.json` → 自动生成的 OpenAPI 规范原文

#### 4. FastAPI 构造参数

```python
app = FastAPI(
    title="我的 API",             # 文档标题
    description="项目描述",        # 文档描述
    version="1.0.0",             # 版本号
    docs_url="/docs",            # Swagger 文档地址（设为 None 可关闭）
    redoc_url="/redoc",          # ReDoc 文档地址
    openapi_url="/openapi.json", # OpenAPI 规范地址
)
```

---

### 三、路由系统

#### 1. 路径操作装饰器

FastAPI 用装饰器把「HTTP 方法 + URL 路径」绑定到函数。所谓「路径操作」= 路径（Path）+ 操作（HTTP 方法）。

| HTTP 方法 | 装饰器 | 语义 | 典型场景 |
|-----------|--------|------|---------|
| GET | `@app.get("/x")` | 查询/读取 | 获取资源列表、详情 |
| POST | `@app.post("/x")` | 创建 | 新增一条记录 |
| PUT | `@app.put("/x/{id}")` | 整体更新 | 替换整个资源 |
| PATCH | `@app.patch("/x/{id}")` | 局部更新 | 只改部分字段 |
| DELETE | `@app.delete("/x/{id}")` | 删除 | 删除资源 |

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/items")                 # 查：列表
def list_items():
    return [{"id": 1}, {"id": 2}]

@app.get("/items/{item_id}")       # 查：详情（路径参数）
def get_item(item_id: int):
    return {"id": item_id}

@app.post("/items")                # 增
def create_item():
    return {"msg": "创建成功"}

@app.put("/items/{item_id}")       # 改：整体更新
def update_item(item_id: int):
    return {"msg": f"更新 {item_id}"}

@app.delete("/items/{item_id}")    # 删
def delete_item(item_id: int):
    return {"msg": f"删除 {item_id}"}
```

> 提示：装饰器里的 `item_id` 必须在函数签名里出现，否则 FastAPI 无法注入。

#### 2. 路径匹配规则

- **路径参数**用花括号 `{参数名}` 声明，支持类型转换。
- 路径匹配是**顺序敏感**的：先注册的路由先匹配。因此固定路径要写在动态路径前面：

```python
@app.get("/items/me")          # 必须写在 /items/{id} 前面
def read_me():
    return {"id": "me"}

@app.get("/items/{item_id}")   # 否则 /items/me 会被当成 item_id="me" 匹配到这条
def read_item(item_id: str):
    return {"id": item_id}
```

::: tip 💡 面试题：为什么固定路由要写在动态路由前面？
结论：因为 Starlette 的路由是按注册顺序线性匹配的，`/items/me` 会先命中 `/items/{item_id}`。
原因：`{item_id}` 是通配任意值的，若写在前面，`me` 会被当作 `item_id` 的值，导致永远走不到固定路由。
:::

---

### 四、请求参数

FastAPI 靠「参数出现在哪里 + 是什么类型」自动识别参数来源，这是它最核心的设计。

#### 1. 三种参数来源的判断规则

| 参数位置 | 声明方式 | 示例 | 必填性 |
|---------|---------|------|-------|
| 路径参数 | 出现在 URL 路径 `{}` 里 | `@app.get("/x/{id}")` | 必填（路径缺了无法匹配） |
| 查询参数 | 普通类型注解（非 Pydantic 模型） | `q: str = None` | 有默认值可选，无默认值必填 |
| 请求体 | Pydantic 模型类型注解 | `item: Item` | 由模型字段决定 |

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float

# 完整演示三种参数同时出现
@app.post("/items/{item_id}")
def create_item(
    item_id: int,        # ① 路径参数：URL 里 {item_id}
    item: Item,          # ② 请求体：JSON body 解析成 Item 模型
    q: str = None,       # ③ 查询参数：?q=xxx
):
    return {"item_id": item_id, "item": item, "q": q}
# 请求示例：POST /items/5?q=hi   body: {"name":"可乐","price":3.5}
```

#### 2. 路径参数（Path）

```python
from fastapi import FastAPI, Path

app = FastAPI()

@app.get("/items/{item_id}")
def read_item(item_id: int = Path(...)):
    # 为什么用 Path(...)？"..." 表示「必填」，同时给类型 int 附加了额外校验
    return {"item_id": item_id}

@app.get("/files/{file_path:path}")   # :path 声明「路径可包含 /」
def read_file(file_path: str):
    # 为什么用 :path？默认路径参数不含斜杠，:path 让它能匹配 /files/a/b/c.txt
    return {"file_path": file_path}
```

#### 3. 查询参数（Query）

查询参数是 URL 里 `?` 后面的键值对。单个函数可以有任意多个查询参数。

```python
from typing import Optional
from fastapi import FastAPI, Query

app = FastAPI()

@app.get("/search")
def search(
    q: str = Query(default="", max_length=50),   # 默认空串，最长 50 字符
    page: int = Query(default=1, ge=1),          # 页码，最小 1
    size: int = Query(default=20, ge=1, le=100), # 每页条数，1~100
    sort: Optional[str] = None,                  # 可选排序字段（不传就是 None）
):
    return {"q": q, "page": page, "size": size, "sort": sort}
```

#### 4. 请求体（Body + Pydantic 模型）

```python
from fastapi import FastAPI, Body
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str
    price: float
    tags: list[str] = []     # 默认空列表，表示可选

@app.post("/items")
def create_item(item: Item):
    # 为什么能自动解析？FastAPI 发现 item 是 Pydantic 模型，就从 JSON body 里解析并校验
    return {"item": item}
```

**多个请求体参数**：默认一个函数只能有一个「模型参数」当作请求体，多个时需要 `Body(embed=True)`：

```python
class User(BaseModel):
    username: str

class Item(BaseModel):
    name: str

@app.put("/items/{item_id}")
def update_item(
    item_id: int,
    item: Item = Body(...),
    user: User = Body(...),        # 两个模型都是请求体的一部分
    importance: int = Body(...),   # 单个标量也要用 Body 声明，否则会被当成查询参数
):
    return {"item_id": item_id, "item": item, "user": user, "importance": importance}
# 请求体结构：{"item": {...}, "user": {...}, "importance": 5}
```

#### 5. 请求头与 Cookie

```python
from fastapi import FastAPI, Header, Cookie

app = FastAPI()

@app.get("/info")
def read_info(
    user_agent: str = Header(default=None),   # 请求头 User-Agent
    x_token: str = Header(default=None),      # 自定义请求头 X-Token
    session_id: str = Cookie(default=None),   # Cookie 里的 session_id
):
    return {"user_agent": user_agent, "x_token": x_token, "session_id": session_id}
```

> 注意：Header/Cookie 里的参数名若含 `-`（如 `user-agent`），Python 变量名要用下划线 `user_agent`，FastAPI 会自动做映射。

---

### 五、Pydantic 模型详解

Pydantic 是 FastAPI 的「数据校验引擎」，负责把外部输入（JSON、表单）转成类型安全的对象。

#### 1. BaseModel 基础

```python
from pydantic import BaseModel

class User(BaseModel):
    name: str            # 必填字段
    age: int = 18        # 有默认值 => 可选字段
    email: str | None = None  # 可空字段（3.10+ 语法，等价 Optional[str]）

# 构造时自动校验
user = User(name="sok")
print(user.name)              # "sok"
print(user.age)               # 18（使用默认值）

# 类型自动转换：字符串 "25" 会被转成 int 25
user2 = User(name="bob", age="25")
print(type(user2.age))        # <class 'int'>

# 校验失败会抛 ValidationError
try:
    User(name="x", age="不是数字")   # 无法转 int，报错
except Exception as e:
    print("校验失败", e)
```

#### 2. 常用字段类型

| Python 类型 | 含义 | 示例 |
|------------|------|------|
| `str` | 字符串 | `name: str` |
| `int` / `float` | 整数 / 浮点 | `price: float` |
| `bool` | 布尔 | `is_active: bool` |
| `list[T]` | 列表，元素为 T | `tags: list[str]` |
| `dict[str, T]` | 字典 | `meta: dict[str, int]` |
| `set[T]` / `tuple` | 集合 / 元组 | `ids: set[int]` |
| `T | None` / `Optional[T]` | 可空 | `email: str \| None` |
| `Enum` | 枚举（限定取值） | 见下方 |
| `datetime` | 时间 | `created_at: datetime` |
| `UUID` | 唯一标识 | `id: UUID` |
| `EmailStr` | 邮箱（需 `email-validator`） | `email: EmailStr` |

#### 3. Field 约束

`Field` 是给字段附加校验规则的核心工具。

```python
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str = Field(min_length=1, max_length=50)        # 长度 1~50
    price: float = Field(gt=0, le=9999)                    # 大于 0，小于等于 9999
    stock: int = Field(ge=0)                               # 库存非负
    description: str = Field(default="", description="商品描述")  # description 会进文档
    tags: list[str] = Field(default_factory=list)          # 为什么 default_factory？避免共享同一个可变默认值

product = Product(name="手机", price=4999.0, stock=10)
print(product.model_dump())   # 转成 dict（旧版是 .dict()，已废弃）
```

#### 4. 枚举字段

```python
from enum import Enum
from pydantic import BaseModel

class Status(str, Enum):      # 继承 str，序列化时会变成字符串
    active = "active"
    inactive = "inactive"

class User(BaseModel):
    status: Status = Status.active

print(User(status="active"))   # 合法
# User(status="deleted")        # 会报错：deleted 不是合法枚举值
```

#### 5. 嵌套模型

```python
from pydantic import BaseModel

class Address(BaseModel):
    city: str
    street: str

class User(BaseModel):
    name: str
    address: Address          # 模型嵌套，JSON 里对应嵌套对象

user = User(name="sok", address={"city": "北京", "street": "中关村"})
print(user.address.city)      # "北京"
```

#### 6. 模型配置 model_config

```python
from pydantic import BaseModel

class User(BaseModel):
    name: str
    age: int
    model_config = {
        "str_strip_whitespace": True,  # 自动去除字符串首尾空格
        "extra": "forbid",             # 出现未声明字段时报错（默认 ignore 忽略）
    }

# User(name="  sok  ", age=18, other=1)  # other 未声明，会报错
```

**常用 `model_config` 项：**

| 配置项 | 值 | 作用 |
|-------|-----|------|
| `extra` | `"ignore"` / `"forbid"` / `"allow"` | 多余字段：忽略 / 报错 / 保留 |
| `str_strip_whitespace` | `bool` | 字符串去首尾空格 |
| `str_to_lower` / `str_to_upper` | `bool` | 字符串转小写/大写 |
| `validate_assignment` | `bool` | 属性赋值时是否再校验 |
| `use_enum_values` | `bool` | 枚举是否存为值而非枚举对象 |

#### 7. 序列化与常用方法

```python
user = User(name="sok", age=18)

user.model_dump()            # dict 形式
user.model_dump_json()       # JSON 字符串
User.model_validate({"name": "sok", "age": 18})   # 从 dict 构造并校验（旧版 parse_obj）
User.model_json_schema()     # 生成 JSON Schema（FastAPI 自动文档靠这个）
```

::: tip 💡 面试题：Pydantic 为什么能同时做校验和文档生成？
结论：因为 BaseModel 声明时就把「字段名 + 类型 + 约束」存成了元数据，校验和 JSON Schema 都从同一份元数据推导。
原因：Pydantic 在类创建时解析字段的注解与 Field，生成一份字段描述，校验器用它判断输入，`model_json_schema()` 用它导出 OpenAPI 用的 JSON Schema，一鱼两吃。
:::

---

### 六、参数校验约束（Query / Path / Body 通用）

`Query`、`Path`、`Body` 三个函数接受完全相同的校验参数，只是声明「参数来源」不同。

| 校验参数 | 含义 | 示例 |
|---------|------|------|
| `default` | 默认值（位置参数） | `Query("默认")` |
| `...` | 必填 | `Path(...)` |
| `min_length` / `max_length` | 字符串最小/最大长度 | `Query(min_length=3)` |
| `ge` / `le` | 数值 ≥ / ≤ | `Query(ge=0)` |
| `gt` / `lt` | 数值 > / < | `Query(gt=0)` |
| `regex` / `pattern` | 正则匹配 | `Query(pattern="^a.*")` |
| `alias` | 参数别名（URL 用别的名字） | `Query(alias="item-query")` |
| `title` / `description` | 文档标题/描述 | `Query(description="说明")` |
| `deprecated` | 标记废弃 | `Query(deprecated=True)` |
| `include_in_schema` | 是否出现在文档 | `Query(include_in_schema=False)` |

```python
from fastapi import FastAPI, Query

app = FastAPI()

@app.get("/items")
def list_items(
    # alias 让 URL 参数名是 item-query，但 Python 变量名是 item_query
    item_query: str = Query(default="", alias="item-query", max_length=10),
):
    return {"item_query": item_query}
# 请求：GET /items?item-query=abc
```

---

### 七、响应模型 response_model

`response_model` 声明「响应的数据结构」，FastAPI 会用它做三件事：**过滤多余字段、做响应校验、生成响应文档**。

```python
from pydantic import BaseModel
from fastapi import FastAPI

app = FastAPI()

class UserIn(BaseModel):
    username: str
    password: str          # 密码字段（内部使用）

class UserOut(BaseModel):
    username: str
    # 注意：没有 password

@app.post("/users", response_model=UserOut)
def create_user(user: UserIn):
    # 即使返回了 password，response_model 也会把它过滤掉
    return {"username": user.username, "password": user.password}
# 响应只返回 {"username": "xxx"}，password 被剥掉，避免泄露敏感信息
```

**常用响应相关参数：**

| 参数 | 作用 |
|------|------|
| `response_model` | 响应数据结构（过滤 + 校验 + 文档） |
| `response_model_exclude` | 额外排除的字段（如 `{"password"}`） |
| `response_model_include` | 只保留的字段 |
| `response_model_exclude_unset` | 排除「未显式设置」的字段 |
| `response_model_exclude_none` | 排除值为 None 的字段 |

---

### 八、状态码与响应

```python
from fastapi import FastAPI, status

app = FastAPI()

# status_code 声明默认响应码
@app.post("/items", status_code=status.HTTP_201_CREATED)
def create_item():
    return {"msg": "创建成功"}    # 默认 200，这里改成 201 Created

# 直接返回 Response 可完全自定义
from fastapi import Response, JSONResponse

@app.get("/raw")
def raw():
    return Response(content="纯文本", media_type="text/plain")

@app.get("/json")
def custom_json():
    return JSONResponse(
        content={"code": 0, "msg": "ok"},
        status_code=200,
        headers={"X-Custom": "hello"},
    )
```

**常用状态码（`fastapi.status`）：**

| 常量 | 数值 | 含义 |
|------|------|------|
| `HTTP_200_OK` | 200 | 成功 |
| `HTTP_201_CREATED` | 201 | 创建成功 |
| `HTTP_204_NO_CONTENT` | 204 | 无内容（删除常用） |
| `HTTP_400_BAD_REQUEST` | 400 | 请求错误 |
| `HTTP_401_UNAUTHORIZED` | 401 | 未认证 |
| `HTTP_403_FORBIDDEN` | 403 | 无权限 |
| `HTTP_404_NOT_FOUND` | 404 | 资源不存在 |
| `HTTP_422_UNPROCESSABLE_ENTITY` | 422 | 校验失败（FastAPI 默认） |
| `HTTP_500_INTERNAL_SERVER_ERROR` | 500 | 服务器内部错误 |

---

### 九、异常处理 HTTPException

`HTTPException` 用于主动抛出 HTTP 错误，FastAPI 会把它转成统一结构的 JSON 响应。

```python
from fastapi import FastAPI, HTTPException

app = FastAPI()

items = {1: "可乐", 2: "薯片"}

@app.get("/items/{item_id}")
def read_item(item_id: int):
    if item_id not in items:
        # 主动抛 404，客户端收到 {"detail": "商品不存在"}
        raise HTTPException(status_code=404, detail="商品不存在")
    return {"name": items[item_id]}
```

**默认错误响应结构**：`{"detail": "..."}`。你可以加 `headers` 附加响应头：

```python
raise HTTPException(status_code=404, detail="不存在", headers={"X-Error": "not-found"})
```

---

### 十、依赖注入 Depends（基础）

依赖注入是 FastAPI 的灵魂特性。`Depends` 把「公共逻辑」从路由函数里抽出来，谁需要就声明依赖它。

```python
from fastapi import FastAPI, Depends

app = FastAPI()

# 这是一个「依赖函数」：封装公共逻辑
def common_parameters(q: str = None, skip: int = 0, limit: int = 10):
    # 依赖函数自己也可以有参数（这些参数会自动解析成查询参数）
    return {"q": q, "skip": skip, "limit": limit}

@app.get("/items/")
def read_items(commons: dict = Depends(common_parameters)):
    # 为什么用 Depends？common_parameters 的返回值会自动注入到 commons 参数
    return commons

@app.get("/users/")
def read_users(commons: dict = Depends(common_parameters)):
    # 同一个依赖被两个路由复用，公共逻辑只写一次
    return commons
```

**依赖能干什么：**

| 场景 | 说明 |
|------|------|
| 鉴权 | 从 token 解析用户，注入到路由 |
| 数据库连接 | 每个请求获取一个 DB 连接，用完释放 |
| 参数校验 | 复用一组查询参数的解析逻辑 |
| 权限校验 | 检查用户角色 |
| 分页 | 统一解析 page/size 参数 |

---

### 十一、中间件与 CORS

#### 1. 中间件（Middleware）

中间件在「请求进入路由前」和「响应返回客户端前」各执行一次，用于日志、耗时统计、全局处理等。

```python
import time
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def add_process_time(request: Request, call_next):
    # 为什么这里能拦截所有请求？中间件包裹在整个路由层之外
    start = time.time()
    response = await call_next(request)   # 调用后续的中间件链和路由
    process_time = time.time() - start
    response.headers["X-Process-Time"] = str(process_time)  # 响应出去前加个头
    return response

@app.get("/")
def root():
    return {"msg": "hello"}
```

#### 2. 跨域 CORS

前后端分离时，浏览器会因为「同源策略」拦截跨域请求，用 `CORSMiddleware` 放行。

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 允许的前端源（生产环境写死，别用 *）
    allow_credentials=True,                    # 允许携带 Cookie
    allow_methods=["*"],                       # 允许的 HTTP 方法
    allow_headers=["*"],                       # 允许的请求头
)
```

> 为什么生产环境不建议 `allow_origins=["*"]`？因为一旦允许任意源，任何网站都能调用你的接口，存在 CSRF 与数据泄露风险。

---

## 高级篇

### 一、异步编程 async/await

#### 1. 为什么需要异步

Web 服务大部分时间花在「等待 I/O」上（查数据库、调第三方 API、读写文件），而不是 CPU 计算。同步模型下，一个线程在等 I/O 时是空闲的，但线程数量有限，高并发时线程耗尽就雪崩。

异步模型用**事件循环**：一个线程内注册大量协程任务，某个任务 `await` 等待 I/O 时，事件循环立刻切换到别的任务，实现「单线程扛住上万并发」。

```python
import asyncio

async def fetch(name, delay):
    # await 让出控制权，事件循环去执行别的任务
    await asyncio.sleep(delay)
    return f"{name} done"

async def main():
    # 两个任务「并发」执行：总共只要 2 秒，而不是 1+2=3 秒
    results = await asyncio.gather(fetch("a", 1), fetch("b", 2))
    print(results)

asyncio.run(main())   # ["a done", "b done"]
```

#### 2. FastAPI 中的 async def

```python
import httpx
from fastapi import FastAPI

app = FastAPI()

@app.get("/async-demo")
async def async_demo():
    # 为什么 await？在等待 httpx 网络请求返回时，事件循环去处理其他请求
    async with httpx.AsyncClient() as client:
        r = await client.get("https://api.github.com/repos/fastapi/fastapi")
    return {"stars": r.json()["stargazers_count"]}
```

**关键规则：async 路由里不能用阻塞 I/O。**

```python
import time

@app.get("/bad")
async def bad():
    time.sleep(5)   # 阻塞！事件循环卡死 5 秒，所有请求都被拖住
    return {"msg": "slow"}

@app.get("/good")
async def good():
    await asyncio.sleep(5)   # 正确：用异步版 sleep，不阻塞事件循环
    return {"msg": "fast"}
```

::: tip 💡 面试题：FastAPI 里 `def` 和 `async def` 有什么区别？
结论：`async def` 路由直接在事件循环里跑，I/O 用 `await` 不阻塞；`def` 路由会被丢进线程池同步执行。
原因：同步函数内部一旦有阻塞调用会卡住事件循环，所以 FastAPI 检测到 `def` 时自动用 `run_in_threadpool` 把它放到独立线程里，避免影响其他异步请求。
:::

#### 3. 什么时候该用 async

| 场景 | 建议 |
|------|------|
| 大量网络 I/O、DB 查询 | 用 `async def` + 异步驱动 |
| CPU 密集型计算 | 用 `def`（丢线程池）或干脆异步框架不适合 |
| 调用第三方阻塞库（如 psycopg2） | 用 `def`，让它跑在线程池 |

---

### 二、依赖注入进阶

#### 1. 带 yield 的依赖（初始化 + 清理）

```python
from fastapi import FastAPI, Depends

app = FastAPI()

def get_db():
    # yield 之前 = 请求进入时的「初始化」
    db = "连接数据库"
    print("打开数据库连接")
    try:
        yield db   # 把 db 交给路由使用
    finally:
        # yield 之后 = 请求结束时的「清理」（即使路由抛异常也会执行）
        print("关闭数据库连接")

@app.get("/data")
def read_data(db: str = Depends(get_db)):
    return {"db": db}
```

> 注意：带 `yield` 的依赖，`yield` 之后的清理代码在**响应发送完成后**才执行（FastAPI 0.110+ 还可退出时带状态码）。

#### 2. 嵌套依赖（依赖的依赖）

```python
from fastapi import FastAPI, Depends

app = FastAPI()

def query_params(q: str = None):
    return q

def db_connection(query: str = Depends(query_params)):   # 依赖里再依赖
    return f"db + {query}"

@app.get("/nested")
def nested(db: str = Depends(db_connection)):
    return {"db": db}
# 依赖链：query_params -> db_connection -> 路由参数 db
```

#### 3. 类作为依赖

依赖也可以是「可调用对象」（类）。FastAPI 会实例化它并注入实例。

```python
from fastapi import FastAPI, Depends

app = FastAPI()

class Pagination:
    def __init__(self, page: int = 1, size: int = 10):
        self.page = page
        self.size = size
        self.offset = (page - 1) * size

@app.get("/list")
def list_items(p: Pagination = Depends(Pagination)):
    # 为什么能用类？类本身是可调用的，__init__ 参数自动解析为查询参数
    return {"page": p.page, "size": p.size, "offset": p.offset}
```

#### 4. 依赖缓存 use_cache

同一个请求里，相同依赖默认只执行一次（结果缓存）。

```python
from fastapi import FastAPI, Depends

app = FastAPI()

def get_value():
    print("执行依赖")   # 只打印一次
    return "v"

@app.get("/demo")
def demo(a: str = Depends(get_value), b: str = Depends(get_value)):
    # use_cache=True（默认）：get_value 只执行一次，a 和 b 拿同一份结果
    return {"a": a, "b": b}

@app.get("/demo2")
def demo2(
    a: str = Depends(get_value, use_cache=False),
    b: str = Depends(get_value, use_cache=False),
):
    # use_cache=False：不缓存，get_value 执行两次，两次可能返回不同值
    return {"a": a, "b": b}
```

#### 5. 依赖的 scope 作用域

```python
def get_user():
    yield "user"   # 请求级：每个请求独立的实例

app = FastAPI()

# 通过 app.dependency_overrides 覆盖依赖，测试时注入假数据
def fake_user():
    return "fake_user"

app.dependency_overrides[get_user] = fake_user
```

---

### 三、认证与安全

#### 1. 安全方案总览

FastAPI 提供 `fastapi.security` 模块，内置多种认证方案：

| 方案 | 类 | 场景 |
|------|-----|------|
| HTTP Basic | `HTTPBasic` / `HTTPBasicCredentials` | 简单的用户名密码（明文） |
| Bearer Token | `HTTPBearer` | 固定 token 认证 |
| OAuth2 密码模式 | `OAuth2PasswordBearer` + `OAuth2PasswordRequestForm` | 登录发 token 的标准流程 |
| API Key | `APIKeyHeader` / `APIKeyQuery` / `APIKeyCookie` | 第三方接口的 key 认证 |

#### 2. OAuth2 + JWT 完整流程

这是最常用的登录方案：客户端提交用户名密码 → 服务端校验 → 签发 JWT → 客户端带 token 访问受保护接口。

```python
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

# ============ 配置 ============
SECRET_KEY = "your-secret-key"      # 生产环境从环境变量读取，别硬编码
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# 模拟用户表
fake_users_db = {
    "sok": {
        "username": "sok",
        # 明文密码 "secret"，存的是哈希
        "hashed_password": "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
    }
}

class Token(BaseModel):
    access_token: str
    token_type: str

class User(BaseModel):
    username: str

# ============ 工具函数 ============
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
# tokenUrl="token" 指向「签发 token 的路由」，Swagger 文档靠它找到登录入口
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})      # exp 是 JWT 标准字段：过期时间
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)):
    """从请求头 Authorization: Bearer <token> 解析用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的凭证",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")   # sub 是 JWT 标准字段：主体
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    return username

# ============ 应用 ============
app = FastAPI()

@app.post("/token", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # OAuth2PasswordRequestForm 解析 form 表单的 username/password
    user = fake_users_db.get(form_data.username)
    if not user or not verify_password(form_data.password, user["hashed_password"]):
        raise HTTPException(status_code=400, detail="用户名或密码错误")
    access_token = create_access_token(data={"sub": user["username"]})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/users/me")
async def read_me(username: str = Depends(get_current_user)):
    # 受保护接口：只有带合法 token 才能访问
    return {"username": username}
```

**测试流程：**

```bash
# 1. 拿 token
curl -X POST http://127.0.0.1:8000/token \
  -d "username=sok&password=secret"

# 2. 带 token 访问受保护接口
curl http://127.0.0.1:8000/users/me \
  -H "Authorization: Bearer <上一步返回的 access_token>"
```

#### 3. JWT 的三个组成部分

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzb2sifQ.5Xxxxxxxxxxxxxxxx
└────────┬────────┘ └───────┬───────┘ └─────────┬─────────┘
       header            payload             signature
```

- **header**：`{"alg": "HS256", "typ": "JWT"}`，声明签名算法。
- **payload**：`{"sub": "sok", "exp": 123456}`，携带业务数据（**不要放敏感信息**，payload 只是 Base64 编码，可被解码）。
- **signature**：用密钥对 `header.payload` 做 HMAC 签名，保证「没被篡改」。

::: tip 💡 面试题：JWT 是加密的吗？能放密码吗？
结论：JWT 只是「签名」不是「加密」，payload 可被任何人解码，绝不能放密码等敏感信息。
原因：签名只能验证数据没被篡改，不能防止数据被读取；要保密需要用 JWE 加密或干脆只存 user_id 这种标识。
:::

---

### 四、后台任务 BackgroundTasks

`BackgroundTasks` 用于在「响应已返回给客户端之后」执行耗时操作（发邮件、写日志、异步通知）。

```python
from fastapi import FastAPI, BackgroundTasks

app = FastAPI()

def write_log(message: str):
    # 这个函数会在响应发送后执行，不阻塞客户端
    with open("log.txt", "a") as f:
        f.write(message + "\n")

@app.post("/register")
def register(email: str, background: BackgroundTasks):
    background.add_task(write_log, f"新用户注册: {email}")   # 注册后台任务
    return {"msg": "注册成功"}    # 客户端立刻收到响应，日志后台慢慢写
```

**注意事项：**

- 后台任务在**同一个进程内**执行，服务重启会丢失，不适合「必须保证执行」的任务（那要用 Celery / RQ 等消息队列）。
- 适合轻量、非关键、耗时较短的异步动作。

---

### 五、文件上传与下载

#### 1. 文件上传 UploadFile

```python
from fastapi import FastAPI, UploadFile, File

app = FastAPI()

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # 为什么 UploadFile 适合大文件？它是异步流式读取，不会一次性把文件全塞进内存
    content = await file.read()     # 一次性读（小文件可以，大文件用下面分块读）
    return {"filename": file.filename, "size": len(content), "content_type": file.content_type}

@app.post("/upload-large")
async def upload_large(file: UploadFile = File(...)):
    with open(file.filename, "wb") as f:
        # 分块读写，大文件不会爆内存
        while chunk := await file.read(1024 * 1024):   # 每次读 1MB
            f.write(chunk)
    return {"filename": file.filename}

@app.post("/upload-multi")
async def upload_multi(files: list[UploadFile] = File(...)):
    # 多文件上传：参数声明成 list[UploadFile]
    return {"count": len(files)}
```

#### 2. 上传文件同时携带表单字段

```python
from fastapi import FastAPI, UploadFile, File, Form

app = FastAPI()

@app.post("/upload")
async def upload(
    file: UploadFile = File(...),
    title: str = Form(...),   # 表单字段用 Form 声明
):
    return {"title": title, "filename": file.filename}
```

#### 3. `File` 与 `UploadFile` 的区别

| 特性 | `File` | `UploadFile` |
|------|--------|-------------|
| 读取方式 | 同步读入内存（bytes） | 异步流式读取 |
| 内存占用 | 整个文件进内存 | 分块读，占用小 |
| 适合场景 | 小文件 | 大文件 / 需要流式处理 |
| 额外属性 | 无 | 有 filename、content_type |

#### 4. 文件下载

```python
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse

app = FastAPI()

@app.get("/download")
def download():
    # FileResponse：适合磁盘上已有的文件，自动处理 Content-Length 和 Range 断点续传
    return FileResponse(path="report.pdf", filename="我的报告.pdf")

@app.get("/download-stream")
def download_stream():
    # StreamingResponse：适合动态生成、数据不在磁盘的内容
    def generate():
        for i in range(10):
            yield f"第 {i} 行\n".encode("utf-8")   # 边生成边发送
    return StreamingResponse(generate(), media_type="text/plain")
```

---

### 六、WebSocket

FastAPI 原生支持 WebSocket，用于长连接、实时推送（聊天、实时行情）。

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()      # 接受连接（必须第一步）
    try:
        while True:
            data = await websocket.receive_text()     # 等客户端发消息
            await websocket.send_text(f"你说的是: {data}")  # 回消息
    except WebSocketDisconnect:
        print("客户端断开连接")
```

**前端连接示例：**

```javascript
const ws = new WebSocket("ws://127.0.0.1:8000/ws");
ws.onopen = () => ws.send("你好");
ws.onmessage = (e) => console.log(e.data);  // "你说的是: 你好"
```

---

### 七、生命周期事件（lifespan）

应用启动/关闭时要执行初始化（建数据库连接池）和清理（关闭连接），用 `lifespan` 管理。

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行：加载模型、建立连接池
    print("应用启动，初始化资源...")
    yield
    # 关闭时执行：释放资源
    print("应用关闭，清理资源...")

app = FastAPI(lifespan=lifespan)

@app.get("/")
def root():
    return {"msg": "hello"}
```

> 旧版 `@app.on_event("startup")` / `("shutdown")` 已废弃，推荐用 `lifespan`。

---

### 八、路由分组 APIRouter

项目变大后，把路由按模块拆分，用 `APIRouter` 聚合再挂载到主应用。

```python
# routers/users.py
from fastapi import APIRouter

router = APIRouter(prefix="/users", tags=["用户"])   # prefix 统一加前缀，tags 分文档组

@router.get("/")                 # 实际路径 /users/
def list_users():
    return [{"id": 1}]

@router.get("/{user_id}")        # 实际路径 /users/{user_id}
def get_user(user_id: int):
    return {"id": user_id}
```

```python
# main.py
from fastapi import FastAPI
from routers import users

app = FastAPI()
app.include_router(users.router)   # 挂载路由模块
```

**`include_router` 常用参数：**

| 参数 | 作用 |
|------|------|
| `prefix` | 再追加一层路径前缀 |
| `tags` | 文档分组标签 |
| `dependencies` | 该模块所有路由都注入的依赖（如统一鉴权） |
| `include_in_schema` | 是否进文档 |

---

### 九、自定义异常处理器与全局异常

#### 1. 自定义 HTTPException 的返回格式

```python
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # 为什么自定义？把默认 {"detail": ...} 改成项目统一结构 {"code":..,"msg":..}
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": exc.status_code, "msg": exc.detail},
    )
```

#### 2. 全局兜底异常

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # 捕获所有未处理异常，避免直接抛 500 堆栈给客户端
    return JSONResponse(status_code=500, content={"code": 500, "msg": "服务器内部错误"})
```

---

### 十、数据库集成（SQLAlchemy 异步）

```python
from fastapi import FastAPI, Depends
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# 1. 异步引擎（连 MySQL 用 mysql+aiomysql://...，连 PG 用 postgresql+asyncpg://...）
engine = create_async_engine("sqlite+aiosqlite:///test.db")
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

class Item(Base):
    __tablename__ = "items"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]

async def get_db():
    # 依赖注入：每个请求一个独立 session，用完关闭
    async with SessionLocal() as session:
        yield session

app = FastAPI()

@app.get("/items")
async def read_items(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Item))
    return result.scalars().all()
```

> 为什么用异步驱动？`await db.execute(...)` 在等数据库时让出事件循环，其他请求继续处理，避免阻塞。

---

### 十一、性能与部署要点

| 要点 | 说明 |
|------|------|
| 异步路由 + 异步 DB 驱动 | 最大化事件循环吞吐 |
| 生产用 `uvicorn --workers N` | 多进程，N 一般为 CPU 核数 |
| 前置 Nginx 反向代理 | 处理静态文件、负载均衡、TLS |
| 用 `gunicorn -k uvicorn.workers.UvicornWorker` | 进程管理更稳（Linux） |
| 避免 async 路由里放阻塞调用 | 阻塞 I/O 用 `def` 或 `run_in_threadpool` |

---

## 原理篇

### 一、底层技术栈全景

FastAPI 不亲自处理 HTTP，它是一层「聪明的胶水」，真正的活儿由三巨头分工：

```
                 ┌─────────────────────────────┐
                 │          FastAPI            │  ← 你的代码 + 类型注解
                 │  路由注册 / 参数解析 / 文档  │
                 └──────────────┬──────────────┘
                                │ 依赖
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐    ┌──────────────────┐    ┌──────────────────┐
│   Starlette   │    │     Pydantic     │    │      AnyIO       │
│  HTTP/路由/   │    │  校验/序列化/    │    │  跨异步库兼容层   │
│ 中间件/WS     │    │  JSON Schema     │    │ (asyncio/trio)    │
└───────┬───────┘    └──────────────────┘    └──────────────────┘
        │ ASGI 应用
        ▼
┌───────────────┐
│    Uvicorn    │  ← ASGI 服务器（uvloop + httptools 加速）
│ 接收TCP/HTTP  │
└───────────────┘
```

| 组件 | 角色 | 核心贡献 |
|------|------|---------|
| Starlette | ASGI 框架 | HTTP 协议解析、路由匹配、中间件栈、WebSocket、Request/Response |
| Pydantic | 数据层 | 请求体校验、类型转换、序列化、生成 JSON Schema |
| AnyIO | 兼容层 | 让代码同时支持 asyncio 和 trio 两种异步生态 |
| Uvicorn | ASGI 服务器 | 监听端口、解析 HTTP、把请求封装成 ASGI 事件喂给应用 |

---

### 二、ASGI 协议原理

#### 1. 什么是 ASGI

ASGI（Asynchronous Server Gateway Interface）是 Python 异步 Web 的标准接口，相当于「异步版的 WSGI」。它定义了两件事：

- 服务器如何调用应用（`scope` + `receive` + `send`）。
- 应用如何响应（通过 `send` 发送事件）。

#### 2. ASGI 应用的标准签名

```python
async def app(scope, receive, send):
    # scope：请求的元信息 dict（type、path、method、headers...）
    # receive：异步函数，用来「接收」客户端发来的数据（如请求体）
    # send：异步函数，用来「发送」事件给服务器（如响应头、响应体）
    ...
```

**`scope` 结构示例（HTTP 请求）：**

```python
{
    "type": "http",              # 事件类型：http / websocket / lifespan
    "http_version": "1.1",
    "method": "GET",             # 请求方法
    "path": "/items/1",          # 路径
    "raw_path": b"/items/1",
    "query_string": b"q=hi",     # 查询串（原始字节）
    "headers": [(b"host", b"localhost:8000")],  # 请求头（字节元组列表）
    "client": ("127.0.0.1", 12345),
    "server": ("127.0.0.1", 8000),
}
```

#### 3. ASGI 事件流（完整机制）

```
客户端                Uvicorn(服务器)              FastAPI(应用)
   │  HTTP 请求           │                            │
   │─────────────────────>│                            │
   │                      │  1. 构造 scope，调用 app(scope, receive, send)
   │                      │───────────────────────────>│
   │                      │  2. 应用 send http.response.start  (状态码+响应头)
   │                      │<───────────────────────────│
   │   HTTP 响应头         │                            │
   │<─────────────────────│                            │
   │                      │  3. 应用 send http.response.body  (响应体，可能多次)
   │                      │<───────────────────────────│
   │   HTTP 响应体         │                            │
   │<─────────────────────│                            │
   │                      │  4. 应用 send http.response.body 更多数据 / 结束
   │                      │<───────────────────────────│
```

#### 4. 手写一个最小 ASGI 应用

```python
async def app(scope, receive, send):
    assert scope["type"] == "http"
    # 发送响应开始事件（状态码 + 响应头）
    await send({
        "type": "http.response.start",
        "status": 200,
        "headers": [(b"content-type", b"application/json")],
    })
    # 发送响应体事件
    await send({
        "type": "http.response.body",
        "body": b'{"hello": "world"}',
    })
```

> 这就是 FastAPI/Starlette 的「地基」。FastAPI 的 `app` 本身就是一个 ASGI 应用，所以 Uvicorn 能直接跑它。

---

### 三、请求生命周期完整流程

一个请求从进来到出去，经历了以下完整链路：

```
客户端请求
   │
   ▼
┌───────────┐
│  Uvicorn  │ 解析 TCP -> HTTP，构造 scope + receive/send
└─────┬─────┘
      │ app(scope, receive, send)
      ▼
┌─────────────────────────────────────────────────────────┐
│                    中间件栈（洋葱模型）                    │
│  Middleware1 → Middleware2 → ... → 路由                    │
│  请求方向：外层先执行 → 内层 → 路由                        │
│  响应方向：路由 → 内层 → 外层（倒序）                      │
└────────────────────────┬────────────────────────────────┘
                         │ call_next() 逐层向内
                         ▼
              ┌────────────────────┐
              │  路由匹配 (Router) │  根据 method+path 找 endpoint 函数
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │  解析依赖树 Depends │  递归解析所有依赖，缓存结果
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │  参数解析与校验     │  读 scope/body，转成 Python 对象，Pydantic 校验
              │  (路径/查询/请求体) │
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │  执行路由函数       │  async def 直接跑 / def 丢线程池
              └─────────┬──────────┘
                        ▼
              ┌────────────────────┐
              │ 序列化响应          │  dict -> JSONResponse，response_model 过滤
              └─────────┬──────────┘
                        ▼
              响应沿中间件栈倒序返回 -> Uvicorn -> 客户端
```

**每一步对应的源码位置（概念层）：**

| 步骤 | 负责模块 |
|------|---------|
| 路由匹配 | Starlette `Router.app` → `route.matches()` |
| 依赖解析 | FastAPI `routing.get_request_handler` → `solve_dependencies()` |
| 参数校验 | FastAPI `dependencies.utils` → `request_params_to_args()` |
| 同步函数处理 | Starlette `concurrency.run_in_threadpool` |
| 序列化 | FastAPI `routing.serialize_response` |

---

### 四、依赖注入原理（Dependant 与依赖树）

#### 1. 依赖是如何被「发现」的

FastAPI 在**路由注册时**（应用启动）就分析函数签名，把每个 `Depends(...)` 的依赖函数拿出来，构建一棵「依赖树」，存到 `Dependant` 对象里。请求来了直接按树执行，不用运行时反复反射。

```python
# 依赖声明
def dep_a():
    return "a"

def dep_b(x: str = Depends(dep_a)):
    return f"b+{x}"

@app.get("/demo")
def demo(b: str = Depends(dep_b)):
    return b
```

对应的依赖树：

```
            demo（路由 endpoint）
              │
              ▼
          dep_b（依赖 1）
              │
              ▼
          dep_a（依赖 1-1）   ← 被 dep_b 依赖，先执行
```

#### 2. 解析执行流程

```
请求进入
   │
   ▼
solve_dependencies()
   │  递归遍历依赖树，深度优先
   ▼
对每个依赖：
   1. 解析它自己的参数（可能又依赖别的，递归）
   2. 调用依赖函数（或类）
   3. 若带 yield：进入时执行到 yield，返回值缓存到 sub_dependency
   4. 结果按 use_cache 缓存
   ▼
把每个路由参数对应的依赖结果，按参数名注入 endpoint 函数
   ▼
执行 endpoint
   ▼
响应完成后：逆序执行所有带 yield 依赖的「清理」部分
```

**关键对象 `Dependant`：**

| 字段 | 含义 |
|------|------|
| `call` | 依赖的可调用对象（函数/类） |
| `path_params` / `query_params` / `body_params` | 该依赖的参数来源分类 |
| `dependencies` | 它依赖的子 Dependant 列表 |
| `use_cache` | 是否缓存结果 |
| `security_scopes` | 安全作用域 |

#### 3. 依赖缓存的坑

```python
def gen():
    print("执行")
    return 1

@app.get("/demo")
def demo(a: int = Depends(gen), b: int = Depends(gen)):
    return {"a": a, "b": b}   # gen 只执行 1 次，a == b == 1
```

原因：`use_cache=True`（默认）会把依赖结果缓存在 `request.state` 级别的 `dependency_cache` 里，同一请求遇到相同依赖直接取缓存。

---

### 五、自动生成 OpenAPI 文档的原理

#### 1. 从类型注解到 JSON Schema

FastAPI 启动时遍历所有路由，把每个函数的参数注解转成 OpenAPI 结构。核心是 Pydantic 的 `model_json_schema()`：模型字段的类型和 Field 约束，能直接生成 JSON Schema。

```python
from pydantic import BaseModel, Field

class Item(BaseModel):
    name: str = Field(min_length=1)
    price: float = Field(gt=0)

print(Item.model_json_schema())
# {
#   "properties": {
#     "name":  {"title": "Name",  "type": "string", "minLength": 1},
#     "price": {"title": "Price", "type": "number", "exclusiveMinimum": 0}
#   },
#   "required": ["name", "price"],
#   "type": "object"
# }
```

#### 2. OpenAPI 的三大产物

```
                FastAPI 应用（类型注解 + 路由）
                          │
              启动时 app.openapi() 生成
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
 /openapi.json      /docs              /redoc
 (原始规范 JSON)  (Swagger UI 渲染)   (ReDoc 渲染)
```

| 地址 | 内容 |
|------|------|
| `/openapi.json` | 标准 OpenAPI 3.0 规范的 JSON |
| `/docs` | 前端用 swagger-ui 渲染该 JSON，可交互调试 |
| `/redoc` | 前端用 ReDoc 渲染该 JSON，只读文档 |

**核心思路**：文档不是「另外维护的一份」，而是「从代码签名里推导出来的」，所以代码改了文档自动同步，永远不会「文档过期」。

::: tip 💡 面试题：FastAPI 为什么能自动生成接口文档？
结论：因为类型注解和 Pydantic 模型里已经包含了字段名、类型、必填性、约束等元信息，FastAPI 启动时把这些元信息转成 OpenAPI 规范，再由 Swagger/ReDoc 前端渲染成页面。
原因：文档、校验、序列化三件事共享同一份类型元数据，是「单一数据源」设计，避免了文档与代码不一致的问题。
:::

---

### 六、同步与异步路由的执行原理

#### 1. 两种路由的底层分流

```python
from fastapi.routing import get_request_handler

def get_request_handler(...):
    is_coroutine = is_coroutine_callable(endpoint)

    async def app(request):
        if is_coroutine:
            # async def 路由：直接在事件循环里 await 执行
            raw_response = await run_endpoint_function(...)
        else:
            # def 路由：丢到线程池，避免阻塞事件循环
            raw_response = await run_in_threadpool(endpoint, **values)
        ...
```

#### 2. 执行模型对比（ASCII 图）

```
【async def 路由】                    【def 路由】
事件循环（主线程）                    事件循环（主线程）
   │                                     │
   ├─ 任务A: await 数据库(挂起) ─┐       ├─ 任务A: await run_in_threadpool()
   ├─ 任务B: await 网络(挂起) ──┤        │          │
   ├─ 任务C: 处理中 ─────────────┤        │          ▼ 丢给 anyio 线程池
   │                             │        │   线程池（独立线程）
   │  ← 三个任务在同一线程      │        │   └─ 同步执行 def 函数
   │     交替推进，充分利用 I/O │        │      （阻塞也影响不到事件循环）
   └─────────────────────────────┘        └───────────────
```

#### 3. `run_in_threadpool` 是什么

它来自 Starlette，底层是 AnyIO 的 `to_thread.run_sync`：

```python
# Starlette concurrency.py
from anyio.to_thread import run_sync

def run_in_threadpool(func, *args, **kwargs):
    ...
    return run_sync(func, *args, **kwargs)   # 在 worker 线程执行同步函数
```

作用：把同步函数丢到线程池，`await` 等它完成，这样事件循环不被阻塞。

**实战建议：**

| 情况 | 写法 | 原因 |
|------|------|------|
| 异步驱动 DB/HTTP | `async def` + `await` | 不占线程，吞吐最高 |
| 同步阻塞库（psycopg2、requests） | `def` | 自动进线程池，避免卡事件循环 |
| 异步函数里临时调用阻塞函数 | `await run_in_threadpool(func)` | 手动把阻塞调用挪出事件循环 |

---

### 七、参数解析原理（签名分析）

FastAPI 如何「一眼」分辨参数来自路径、查询还是请求体？答案在**启动时的签名分析**：

```
路由函数签名
   │
   ▼  逐参数分析
┌────────────────────────────────────────────────┐
│ 1. 参数名是否出现在 path 的 {} 里？             │
│    → 是：Path 参数（Path() 可加约束）            │
│ 2. 类型是不是 Pydantic BaseModel？              │
│    → 是：Body 请求体参数                         │
│ 3. 是否显式用了 Query/Path/Body/Header/Cookie？ │
│    → 按显式声明归类                              │
│ 4. 否则：标量类型 → Query 查询参数               │
└────────────────────────────────────────────────┘
```

```python
@app.post("/items/{item_id}")
def f(
    item_id: int,        # ① 名字在路径里 → Path
    item: Item,          # ② 是 BaseModel → Body
    q: str = None,       # ④ 标量，不在路径 → Query
    token: str = Header(None),   # ③ 显式 → Header
):
    ...
```

> 规则优先级：显式声明 > 模型判断 > 路径名判断 > 默认查询参数。

---

## 面试常问

### 1. FastAPI 相比 Flask / Django 有什么优势？
结论：自动生成交互式文档、原生异步高性能、用类型注解做参数校验，三者合一。
展开：Flask 是同步框架且参数校验和文档都要手动做；Django 重、异步支持弱。FastAPI 在 Starlette（异步）+ Pydantic（校验）之上，性能比肩 Node/Go，开发效率也高，适合做前后端分离的 API 服务。

### 2. 为什么 FastAPI 能自动生成接口文档？
结论：代码里的类型注解和 Pydantic 模型本身就是「字段元数据」，启动时转成 OpenAPI 规范再渲染成页面。
展开：Pydantic 的 `model_json_schema()` 能把模型转成 JSON Schema，FastAPI 汇总所有路由签名生成 `/openapi.json`，Swagger/ReDoc 只是前端渲染。文档和校验共享同一份元数据，永不失同步。

### 3. FastAPI 里 `def` 和 `async def` 有什么区别？
结论：`async def` 跑在事件循环里，I/O 用 `await` 不阻塞；`def` 被自动丢到线程池同步执行。
展开：同步函数一旦有阻塞调用会卡死整个事件循环，所以 FastAPI 用 `run_in_threadpool` 把它放到 anyio 线程池，避免影响其他请求。CPU 密集或调用阻塞库时用 `def`，异步 I/O 用 `async def`。

### 4. 依赖注入 Depends 有什么用？它的原理是什么？
结论：把鉴权、DB 连接等公共逻辑解耦复用；请求进来时 FastAPI 解析依赖树，按序执行并注入结果。
展开：路由注册时就分析签名构建 `Dependant` 依赖树，请求时 `solve_dependencies()` 递归执行、按 `use_cache` 缓存结果，再注入到 endpoint。带 `yield` 的依赖还能做「进入初始化、结束清理」。

### 5. Pydantic 的作用是什么？v2 为什么快？
结论：负责数据校验、类型转换、序列化和 JSON Schema 生成；v2 的校验核心是 Rust 写的 pydantic-core，速度提升 5~50 倍。
展开：FastAPI 用 Pydantic 模型声明请求体，构造时自动校验和类型转换，校验失败返回 422。v1 校验器是纯 Python，v2 用 Rust 重写，同时保持 API 兼容。

### 6. `UploadFile` 和 `File` 有什么区别？
结论：`File` 同步读入内存（bytes），适合小文件；`UploadFile` 异步流式读写，适合大文件。
展开：`UploadFile` 基于 SpooledTemporaryFile，超过阈值自动落盘，可 `await file.read()` 分块读取，不占爆内存，还额外提供 `filename`、`content_type` 属性。

### 7. 如何处理 CORS 跨域？
结论：用 `CORSMiddleware` 中间件配置允许的源、方法、请求头。
展开：前后端分离时浏览器同源策略会拦截跨域请求，服务端需在响应头返回 `Access-Control-Allow-Origin` 等字段。用 `allow_origins` 写死前端域名，别在生产用 `*`，避免任意网站调用接口。

### 8. JWT 认证的完整流程是什么？JWT 安全吗？
结论：客户端登录拿 token，之后每次请求带 `Authorization: Bearer <token>`，服务端解码验证后放行；JWT 只是签名不是加密，payload 可被解码。
展开：登录接口校验用户名密码后签发 JWT，受保护接口通过 `Depends(get_current_user)` 解码 token 拿用户身份。JWT 的 signature 防篡改但不保密，不能放密码，且默认无状态、无法主动吊销，可配合短过期时间和 refresh token。

---

相关阅读：[Python基础](/learn_backend/python/Python基础) ｜ [MySQL](/learn_database/MySQL) ｜ [Redis](/learn_database/Redis) ｜ [Docker](/learn_maintenance/Docker)
