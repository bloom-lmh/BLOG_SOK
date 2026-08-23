# Day 25 · 原生前端与 SSE 流式聊天

> **今天目标**：不引入前端框架，先用 HTML、CSS、JavaScript 做一个真正可演示的聊天页；使用 `fetch + ReadableStream` 消费 POST SSE，并支持停止生成、会话续聊和错误提示。

## 一、为什么不用 EventSource

浏览器原生 `EventSource` 只方便发 GET，而问答需要把问题放在 POST JSON 请求体中。因此本项目使用：

```text
fetch(POST) → response.body → TextDecoder → 解析 event/data → 更新消息
```

## 二、创建静态资源目录

```powershell
New-Item -ItemType Directory -Force app\static
```

## 三、聊天页面（完整代码）

创建 `app/static/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="CourseMall QA Agent 学习助手" />
    <title>CourseMall AI Coach</title>
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">C</span>
          <div>
            <strong>CourseMall</strong>
            <small>AI Learning Coach</small>
          </div>
        </div>

        <button id="new-chat" class="new-chat" type="button">＋ 新对话</button>

        <div class="session-card">
          <span>当前会话</span>
          <code id="conversation-id">尚未创建</code>
        </div>

        <div class="sidebar-footer">
          <span class="status-dot"></span>
          <span id="connection-status">准备就绪</span>
        </div>
      </aside>

      <main class="chat-panel">
        <header class="topbar">
          <div>
            <p class="eyebrow">QA AGENT</p>
            <h1>把复杂技术讲明白</h1>
          </div>
          <a href="/docs" target="_blank" rel="noreferrer">API 文档</a>
        </header>

        <section id="messages" class="messages" aria-live="polite">
          <article class="message assistant">
            <div class="avatar">AI</div>
            <div class="bubble">
              你好，我是 CourseMall 学习助手。可以问我 Java、Python、RAG
              或 Agent 项目问题。
            </div>
          </article>
        </section>

        <div class="composer-wrap">
          <form id="chat-form" class="composer">
            <label class="sr-only" for="question">输入问题</label>
            <textarea
              id="question"
              rows="1"
              maxlength="2000"
              placeholder="输入问题，Enter 发送，Shift + Enter 换行"
              required
            ></textarea>
            <div class="composer-actions">
              <span id="char-count">0 / 2000</span>
              <button id="stop-button" class="stop" type="button" hidden>
                停止
              </button>
              <button id="send-button" class="send" type="submit">发送</button>
            </div>
          </form>
          <p class="disclaimer">AI 可能出错，关键结论请结合源码和文档验证。</p>
        </div>
      </main>
    </div>

    <script src="/static/app.js" defer></script>
  </body>
</html>
```

## 四、页面样式（完整代码）

创建 `app/static/styles.css`：

```css
:root {
  color-scheme: dark;
  font-family:
    Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  color: #e8edf8;
  background: #080b12;
  --panel: #0e1420;
  --panel-soft: #131b2a;
  --line: rgba(255, 255, 255, 0.09);
  --muted: #8993a7;
  --accent: #72e2a7;
  --accent-dark: #123f2d;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  background:
    radial-gradient(circle at 70% 0%, rgba(44, 102, 89, 0.22), transparent 34%),
    #080b12;
}

button,
textarea {
  font: inherit;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}

.app-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 28px 20px;
  border-right: 1px solid var(--line);
  background: rgba(8, 11, 18, 0.9);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 13px;
  color: #06100b;
  font-weight: 900;
  background: var(--accent);
  box-shadow: 0 12px 34px rgba(114, 226, 167, 0.18);
}

.brand strong,
.brand small {
  display: block;
}

.brand small {
  margin-top: 3px;
  color: var(--muted);
}

.new-chat,
.send,
.stop {
  border: 0;
  border-radius: 12px;
  cursor: pointer;
}

.new-chat {
  padding: 12px 16px;
  color: #e8edf8;
  border: 1px solid var(--line);
  background: var(--panel-soft);
}

.new-chat:hover {
  border-color: rgba(114, 226, 167, 0.45);
}

.session-card {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.025);
}

.session-card span {
  display: block;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 12px;
}

.session-card code {
  display: block;
  overflow: hidden;
  color: #b7c1d5;
  text-overflow: ellipsis;
}

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  color: var(--muted);
  font-size: 13px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 14px var(--accent);
}

.chat-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px clamp(22px, 5vw, 72px);
  border-bottom: 1px solid var(--line);
}

.topbar h1,
.topbar p {
  margin: 0;
}

.topbar h1 {
  margin-top: 4px;
  font-size: clamp(20px, 2vw, 28px);
}

.eyebrow {
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
}

.topbar a {
  color: #b9c5da;
  text-decoration: none;
}

.messages {
  overflow-y: auto;
  padding: 38px clamp(22px, 9vw, 140px) 120px;
}

.message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  max-width: 850px;
  margin: 0 auto 24px;
}

.message.user {
  flex-direction: row-reverse;
}

.avatar {
  display: grid;
  flex: 0 0 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 11px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  background: var(--panel-soft);
}

.user .avatar {
  color: #dbe7ff;
}

.bubble {
  max-width: min(720px, calc(100vw - 120px));
  padding: 14px 17px;
  border: 1px solid var(--line);
  border-radius: 5px 16px 16px;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--panel);
}

.user .bubble {
  border-radius: 16px 5px 16px 16px;
  color: #eafff3;
  background: var(--accent-dark);
}

.bubble.error {
  color: #ffb6b6;
  border-color: rgba(255, 99, 99, 0.35);
}

.composer-wrap {
  padding: 0 clamp(22px, 9vw, 140px) 22px;
  background: linear-gradient(transparent, #080b12 28%);
}

.composer {
  max-width: 850px;
  margin: 0 auto;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--panel);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
}

.composer:focus-within {
  border-color: rgba(114, 226, 167, 0.5);
}

textarea {
  width: 100%;
  max-height: 180px;
  resize: none;
  color: #eef4ff;
  border: 0;
  outline: 0;
  background: transparent;
}

textarea::placeholder {
  color: #687286;
}

.composer-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}

#char-count {
  margin-right: auto;
  color: var(--muted);
  font-size: 12px;
}

.send,
.stop {
  padding: 9px 15px;
}

.send {
  color: #07100b;
  font-weight: 800;
  background: var(--accent);
}

.send:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.stop {
  color: #ffc4c4;
  background: rgba(255, 92, 92, 0.12);
}

.disclaimer {
  margin: 10px auto 0;
  color: #687286;
  text-align: center;
  font-size: 11px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 760px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    display: none;
  }

  .topbar {
    padding: 18px;
  }

  .messages {
    padding: 24px 14px 110px;
  }

  .composer-wrap {
    padding: 0 12px 12px;
  }

  .bubble {
    max-width: calc(100vw - 76px);
  }
}
```

## 五、SSE 客户端（完整代码）

创建 `app/static/app.js`：

```javascript
const elements = {
  form: document.querySelector("#chat-form"),
  input: document.querySelector("#question"),
  messages: document.querySelector("#messages"),
  send: document.querySelector("#send-button"),
  stop: document.querySelector("#stop-button"),
  newChat: document.querySelector("#new-chat"),
  conversationId: document.querySelector("#conversation-id"),
  status: document.querySelector("#connection-status"),
  charCount: document.querySelector("#char-count"),
};

const state = {
  conversationId: localStorage.getItem("qa.conversationId"),
  controller: null,
};

function setStatus(text) {
  elements.status.textContent = text;
}

function setBusy(busy) {
  elements.send.disabled = busy;
  elements.stop.hidden = !busy;
  elements.input.disabled = busy;
}

function updateConversationId(value) {
  state.conversationId = value;
  elements.conversationId.textContent = value || "尚未创建";
  if (value) {
    localStorage.setItem("qa.conversationId", value);
  } else {
    localStorage.removeItem("qa.conversationId");
  }
}

function addMessage(role, text = "") {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "YOU" : "AI";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  article.append(avatar, bubble);
  elements.messages.append(article);
  elements.messages.scrollTop = elements.messages.scrollHeight;
  return bubble;
}

function parseEventBlock(block) {
  let eventName = "message";
  const dataLines = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  return { eventName, data: dataLines.join("\n") };
}

async function consumeSse(response, handlers) {
  if (!response.body) {
    throw new Error("浏览器没有提供可读取的响应流");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    buffer = buffer.replaceAll("\r\n", "\n");

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary).trim();
      buffer = buffer.slice(boundary + 2);
      if (block) {
        const { eventName, data } = parseEventBlock(block);
        const payload = data ? JSON.parse(data) : {};
        handlers[eventName]?.(payload);
      }
      boundary = buffer.indexOf("\n\n");
    }

    if (done) break;
  }
}

async function sendQuestion(question) {
  const answerBubble = addMessage("assistant");
  state.controller = new AbortController();
  setBusy(true);
  setStatus("正在生成");

  try {
    const response = await fetch("/api/v1/qa/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        conversation_id: state.conversationId,
        user_id: "web-user",
      }),
      signal: state.controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`请求失败（${response.status}）：${detail}`);
    }

    await consumeSse(response, {
      metadata(payload) {
        updateConversationId(payload.conversationId);
      },
      token(payload) {
        answerBubble.textContent += payload.text;
        elements.messages.scrollTop = elements.messages.scrollHeight;
      },
      done() {
        setStatus("生成完成");
      },
      error(payload) {
        throw new Error(payload.message || "模型生成失败");
      },
    });
  } catch (error) {
    if (error.name === "AbortError") {
      answerBubble.textContent += "\n\n[已停止生成]";
      setStatus("已停止");
    } else {
      answerBubble.classList.add("error");
      answerBubble.textContent = error.message || "发生未知错误";
      setStatus("请求失败");
    }
  } finally {
    state.controller = null;
    setBusy(false);
    elements.input.focus();
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = elements.input.value.trim();
  if (!question || state.controller) return;

  addMessage("user", question);
  elements.input.value = "";
  elements.input.style.height = "auto";
  elements.charCount.textContent = "0 / 2000";
  await sendQuestion(question);
});

elements.input.addEventListener("input", () => {
  elements.input.style.height = "auto";
  elements.input.style.height = `${elements.input.scrollHeight}px`;
  elements.charCount.textContent = `${elements.input.value.length} / 2000`;
});

elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});

elements.stop.addEventListener("click", () => state.controller?.abort());

elements.newChat.addEventListener("click", () => {
  state.controller?.abort();
  updateConversationId(null);
  elements.messages.innerHTML = "";
  addMessage("assistant", "新对话已创建，你想学习什么？");
  setStatus("准备就绪");
});

updateConversationId(state.conversationId);
elements.input.focus();
```

注意前端始终用 `textContent` 写消息，不用 `innerHTML` 渲染模型输出，因此不会直接执行模型返回的恶意 HTML。以后支持 Markdown 时必须使用可信解析器并做 HTML 清洗。

## 六、替换应用入口（完整代码）

将 `app/main.py` 完整替换为：

```python
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import get_settings
from app.core.http import install_http_features

STATIC_DIR = Path(__file__).parent / "static"


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
    application.mount(
        "/static",
        StaticFiles(directory=STATIC_DIR),
        name="static",
    )

    @application.get("/", include_in_schema=False)
    async def web_app() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    return application


app = create_app()
```

## 七、静态页面测试（完整代码）

Day01 的首页测试仍然期待 JSON，但首页现在已经升级为 Web 工作台。因此先将 `tests/test_health.py` 完整替换为：

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_serves_web_application() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert (
        "CourseMall Agent Workspace" in response.text
        or "CourseMall AI Coach" in response.text
    )


def test_health_still_returns_service_status() -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "UP"
```

再创建 `tests/test_web_ui.py`：

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_home_returns_chat_page() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "CourseMall AI Coach" in response.text
    assert 'id="chat-form"' in response.text


def test_static_assets_are_served() -> None:
    javascript = client.get("/static/app.js")
    stylesheet = client.get("/static/styles.css")

    assert javascript.status_code == 200
    assert "consumeSse" in javascript.text
    assert stylesheet.status_code == 200
    assert ".app-shell" in stylesheet.text
```

## 八、运行与验收

```powershell
python -m pytest tests/test_web_ui.py -q
python -m uvicorn app.main:app --reload
```

打开 `http://127.0.0.1:8000`，验证：

1. 输入问题后立即显示用户消息。
2. AI 文本逐字出现。
3. 刷新后仍沿用同一个 `conversation_id`。
4. “停止”按钮可以中止请求。
5. 手机宽度下页面不横向溢出。

::: tip 💡 面试题：POST SSE 为什么不用 EventSource？
`EventSource` 的标准使用方式是 GET，难以携带 JSON 请求体；`fetch` 能发 POST，并通过 `ReadableStream` 手动消费 SSE 数据帧。
:::

## 九、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| SSE | 服务端以事件帧持续向客户端推送文本 |
| ReadableStream | 浏览器逐块读取响应体 |
| TextDecoder | 把 UTF-8 字节块安全解码为字符串 |
| AbortController | 主动取消尚未结束的 fetch |
| XSS 防护 | 不把不可信模型输出直接写入 innerHTML |

## 十、✅ 回填清单

- [ ] 首页能正常加载
- [ ] POST SSE 可以逐字显示
- [ ] 停止生成有效
- [ ] conversation_id 能续用
- [ ] 静态资源测试通过

完成时间：

是否跑通：

踩坑与疑问：

## 十一、下次我会追问

1. SSE 与 WebSocket 的主要区别是什么？
2. 为什么一次 chunk 不一定等于一个完整事件？
3. AbortController 取消的是哪一层操作？
4. 为什么不能直接把模型回答写进 innerHTML？
