# Day 29 · Docker、Compose、Redis 与可重复部署

> **今天目标**：把 API、数据库迁移和 Redis 放进可重复启动的容器环境。任何安装了 Docker 的电脑都能用一条命令启动项目，不依赖本机 Python 包状态。

## 一、最终运行结构

```text
浏览器 → qa-agent:8000
              ├─ FastAPI / LangGraph / MCP Client
              ├─ /app/data：SQLite、Chroma、上传文档
              └─ redis:6379：缓存与限流
```

SQLite/Chroma 适合单 API 实例演示。真正横向扩容时，业务库应换 PostgreSQL，向量库换可共享服务，不能让多个实例同时依赖各自本地文件。

## 二、确认生产依赖（完整内容）

`requirements.txt` 最终内容：

```text
fastapi[standard-no-fastapi-cloud-cli]==0.141.1
pydantic-settings==2.15.0
httpx2==2.10.0
aiosqlite==0.22.1
chromadb==1.5.9
langchain==1.3.14
langgraph==1.2.10
mcp[cli]==2.0.0
sqlalchemy[asyncio]==2.0.52
alembic==1.19.1
redis==8.1.0
pytest==9.1.1
```

## 三、容器入口（完整代码）

创建 `app/entrypoint.py`：

```python
import os
import sys

from alembic import command
from alembic.config import Config


def main() -> None:
    # 容器每次启动先把数据库升级到代码所需版本。
    command.upgrade(Config("alembic.ini"), "head")

    host = os.getenv("UVICORN_HOST", "0.0.0.0")
    port = os.getenv("UVICORN_PORT", "8000")
    args = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        host,
        "--port",
        port,
        "--proxy-headers",
    ]
    # exec 用 Uvicorn 替换当前进程，让 Docker 的停止信号能正确送达。
    os.execv(sys.executable, args)


if __name__ == "__main__":
    main()
```

不要在多个副本同时启动时无条件执行复杂数据迁移；生产环境通常把 Alembic 作为独立发布步骤或单独 migration job。

## 四、Dockerfile（完整内容）

创建 `Dockerfile`：

```dockerfile
FROM python:3.10-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN addgroup --system appgroup \
    && adduser --system --ingroup appgroup appuser

COPY requirements.txt ./
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt

COPY --chown=appuser:appgroup . .

RUN mkdir -p /app/data/uploads /app/data/chroma \
    && chown -R appuser:appgroup /app/data

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=25s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=2)" || exit 1

CMD ["python", "-m", "app.entrypoint"]
```

关键点：

- 使用固定 Python 3.10 基础镜像，与本地学习版本一致。
- 先复制 `requirements.txt`，让 Docker 利用依赖层缓存。
- 使用非 root 用户运行应用。
- 数据写入 `/app/data`，由命名卷持久化。
- 容器健康不等于业务完全可用；这里先做进程级 liveness。

## 五、构建忽略文件（完整内容）

创建 `.dockerignore`：

```text
.git
.github
.idea
.vscode
.venv
__pycache__
*.py[cod]
.pytest_cache
.mypy_cache
.ruff_cache
.coverage
htmlcov
.env
data
tests
*.md
```

不要把 `.env`、本地数据库、向量库和虚拟环境发送到 Docker 构建上下文。

## 六、Docker Compose（完整内容）

创建 `compose.yml`：

```yaml
name: qa-agent

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    image: qa-agent:local
    ports:
      - "8000:8000"
    environment:
      APP_ENV: production
      DEBUG: "false"
      SQLALCHEMY_DATABASE_URL: sqlite+aiosqlite:////app/data/app.db
      DATABASE_PATH: /app/data/qa_agent.db
      UPLOAD_DIR: /app/data/uploads
      CHROMA_PATH: /app/data/chroma
      CACHE_BACKEND: redis
      REDIS_URL: redis://redis:6379/0
      LLM_PROVIDER: ${LLM_PROVIDER:-fake}
      LLM_MODEL: ${LLM_MODEL:-fake-model}
      LLM_BASE_URL: ${LLM_BASE_URL:-https://api.deepseek.com/v1}
      LLM_API_KEY: ${LLM_API_KEY:-}
    volumes:
      - qa_data:/app/data
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  redis:
    image: redis:8-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

volumes:
  qa_data:
  redis_data:
```

Redis 没有映射到宿主机端口，因为只有 API 容器需要访问它。少暴露一个端口，就少一个误配置和攻击入口。

## 七、生产环境变量模板（完整内容）

创建 `.env.production.example`：

```dotenv
# compose.yml 会读取这些变量。复制为 .env 后再填真实密钥。
LLM_PROVIDER=fake
LLM_MODEL=fake-model
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=
```

切换真实模型时：

```powershell
Copy-Item .env.production.example .env
# 编辑 .env，填写真实密钥；.env 已在 .gitignore 中。
```

## 八、构建、启动与排错

首次启动：

```powershell
docker compose -f compose.yml up --build -d
docker compose -f compose.yml ps
docker compose -f compose.yml logs -f api
```

验证：

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health
Start-Process http://127.0.0.1:8000
```

检查 Redis 缓存计数：

```powershell
docker compose -f compose.yml exec redis redis-cli DBSIZE
docker compose -f compose.yml exec redis redis-cli SCAN 0 MATCH 'answer:*' COUNT 100
```

停止但保留数据：

```powershell
docker compose -f compose.yml down
```

只有明确想删除 SQLite、Chroma 和 Redis 数据时才执行：

```powershell
docker compose -f compose.yml down --volumes
```

`--volumes` 会删除命名卷中的数据，属于破坏性操作。

## 九、部署验收清单

```powershell
# 1. 容器都是 healthy/running
docker compose -f compose.yml ps

# 2. 迁移已到 head
docker compose -f compose.yml exec api alembic current

# 3. 运行容器内测试（镜像默认忽略 tests，因此本地 CI 执行完整测试）
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health

# 4. 相同问题第二次命中 Redis 缓存
$body = @{ question = '推荐 Python 课程' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/cached-coach/ask -ContentType 'application/json' -Body $body
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/cached-coach/ask -ContentType 'application/json' -Body $body
```

::: tip 💡 面试题：Docker 解决了什么，没解决什么？
它统一应用运行环境和交付方式；但不会自动解决数据库扩容、密钥管理、监控、备份、高可用和安全更新，这些仍需部署平台与运维设计。
:::

## 十、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| Image | 不可变的应用文件和运行环境模板 |
| Container | Image 的运行实例 |
| Volume | 独立于容器生命周期的持久数据 |
| Compose | 声明并编排多个本地服务 |
| Healthcheck | 让运行平台判断进程是否健康 |
| 非 root | 降低容器被攻破后的权限范围 |

## 十一、✅ 回填清单

- [ ] 镜像成功构建
- [ ] API 和 Redis 都健康
- [ ] Alembic 自动升级到 head
- [ ] 重启容器后数据仍存在
- [ ] 相同问题第二次命中 Redis

完成时间：

是否跑通：

踩坑与疑问：

## 十二、下次我会追问

1. 为什么依赖文件要先于源码 COPY？
2. 为什么容器内不应使用 root 用户？
3. `down` 和 `down --volumes` 有什么区别？
4. SQLite/Chroma 为什么限制横向扩容？
5. 生产迁移为什么更适合独立 job？
