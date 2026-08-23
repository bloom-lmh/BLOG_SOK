# Day 26 · 多模式 Agent 工作台、文档上传与引用展示

> **今天目标**：把聊天页升级为项目演示工作台：支持流式对话、RAG 问答、整合 Agent 三种模式，并能上传并索引文档、展示路由、课程工具结果和引用来源。

## 一、替换页面（完整代码）

将 `app/static/index.html` 完整替换为：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="CourseMall QA Agent 工作台" />
    <title>CourseMall Agent Workspace</title>
    <link rel="stylesheet" href="/static/styles.css" />
    <link rel="stylesheet" href="/static/workspace.css" />
  </head>
  <body>
    <div class="app-shell">
      <aside class="sidebar workspace-sidebar">
        <div class="brand">
          <span class="brand-mark">C</span>
          <div>
            <strong>CourseMall</strong>
            <small>Agent Workspace</small>
          </div>
        </div>

        <button id="new-chat" class="new-chat" type="button">＋ 新对话</button>

        <section class="side-section">
          <label for="mode">运行模式</label>
          <select id="mode">
            <option value="stream">流式普通问答</option>
            <option value="rag">RAG 知识库</option>
            <option value="coach" selected>整合 Agent</option>
          </select>
          <p id="mode-help">自动选择 RAG、MCP 课程工具或直接回答。</p>
        </section>

        <section class="side-section">
          <span class="side-label">知识库文档</span>
          <form id="upload-form" class="upload-form">
            <label class="file-picker" for="document-file">
              <strong>选择 Markdown / TXT</strong>
              <small id="file-name">最大 2 MB，UTF-8</small>
            </label>
            <input id="document-file" type="file" accept=".md,.txt,text/plain,text/markdown" required />
            <button id="upload-button" type="submit">上传并索引</button>
          </form>
          <p id="upload-status" class="upload-status">尚未上传</p>
        </section>

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
            <p class="eyebrow">INTERVIEW-READY PROJECT</p>
            <h1>CourseMall 智能学习工作台</h1>
          </div>
          <nav class="top-links" aria-label="辅助链接">
            <a href="/docs" target="_blank" rel="noreferrer">Swagger</a>
            <a href="/openapi.json" target="_blank" rel="noreferrer">OpenAPI</a>
          </nav>
        </header>

        <section id="messages" class="messages" aria-live="polite">
          <article class="message assistant">
            <div class="avatar">AI</div>
            <div class="message-content">
              <div class="bubble">
                你好。你可以先上传学习资料，再选择 RAG 或整合 Agent 提问；
                回答下方会展示真实路由、引用和课程工具结果。
              </div>
            </div>
          </article>
        </section>

        <div class="composer-wrap">
          <form id="chat-form" class="composer">
            <div class="active-mode">
              <span>当前模式</span>
              <strong id="active-mode-label">整合 Agent</strong>
            </div>
            <label class="sr-only" for="question">输入问题</label>
            <textarea
              id="question"
              rows="1"
              maxlength="2000"
              placeholder="例如：根据项目文档推荐 Spring 课程"
              required
            ></textarea>
            <div class="composer-actions">
              <span id="char-count">0 / 2000</span>
              <button id="stop-button" class="stop" type="button" hidden>停止</button>
              <button id="send-button" class="send" type="submit">发送</button>
            </div>
          </form>
          <p class="disclaimer">引用表示检索来源，不自动保证模型结论完全正确。</p>
        </div>
      </main>
    </div>

    <script src="/static/app.js" defer></script>
  </body>
</html>
```

## 二、工作台增量样式（完整代码）

创建 `app/static/workspace.css`。它只负责 Day26 新组件，Day25 的 `styles.css` 保持不变：

```css
.workspace-sidebar {
  overflow-y: auto;
}

.side-section {
  padding-top: 18px;
  border-top: 1px solid var(--line);
}

.side-section label,
.side-label {
  display: block;
  margin-bottom: 9px;
  color: #b8c3d7;
  font-size: 12px;
  font-weight: 700;
}

.side-section select {
  width: 100%;
  padding: 10px;
  color: #edf4ff;
  border: 1px solid var(--line);
  border-radius: 10px;
  outline: none;
  background: var(--panel-soft);
}

.side-section select:focus {
  border-color: rgba(114, 226, 167, 0.55);
}

.side-section p {
  margin: 9px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
}

.upload-form input[type="file"] {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
}

.file-picker {
  padding: 13px;
  border: 1px dashed rgba(255, 255, 255, 0.18);
  border-radius: 11px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.025);
}

.file-picker:hover {
  border-color: rgba(114, 226, 167, 0.55);
}

.file-picker strong,
.file-picker small {
  display: block;
}

.file-picker small {
  margin-top: 5px;
  color: var(--muted);
  font-weight: 400;
}

#upload-button {
  width: 100%;
  margin-top: 9px;
  padding: 9px;
  color: var(--accent);
  border: 1px solid rgba(114, 226, 167, 0.25);
  border-radius: 10px;
  cursor: pointer;
  background: rgba(114, 226, 167, 0.08);
}

#upload-button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.upload-status.success {
  color: var(--accent);
}

.upload-status.error {
  color: #ffaaaa;
}

.top-links {
  display: flex;
  gap: 18px;
}

.message-content {
  min-width: 0;
  max-width: min(720px, calc(100vw - 120px));
}

.message-content .bubble {
  max-width: none;
}

.result-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 10px;
}

.meta-chip {
  padding: 4px 8px;
  color: #a8b4c9;
  border: 1px solid var(--line);
  border-radius: 999px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.025);
}

.meta-chip.route {
  color: var(--accent);
  border-color: rgba(114, 226, 167, 0.28);
}

.evidence-panel {
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.evidence-panel h3 {
  margin: 0 0 9px;
  color: #cdd7e8;
  font-size: 12px;
}

.evidence-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.evidence-list li {
  padding: 9px;
  color: #9ea9bc;
  border-left: 2px solid rgba(114, 226, 167, 0.45);
  font-size: 12px;
  line-height: 1.55;
  background: rgba(114, 226, 167, 0.035);
}

.evidence-list strong {
  display: block;
  margin-bottom: 3px;
  color: #dce7f8;
}

.active-mode {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: var(--muted);
  font-size: 11px;
}

.active-mode strong {
  color: var(--accent);
}

@media (max-width: 760px) {
  .message-content {
    max-width: calc(100vw - 76px);
  }

  .top-links a:last-child {
    display: none;
  }
}
```

## 三、替换工作台逻辑（完整代码）

将 `app/static/app.js` 完整替换为：

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
  mode: document.querySelector("#mode"),
  modeHelp: document.querySelector("#mode-help"),
  activeModeLabel: document.querySelector("#active-mode-label"),
  uploadForm: document.querySelector("#upload-form"),
  uploadButton: document.querySelector("#upload-button"),
  documentFile: document.querySelector("#document-file"),
  fileName: document.querySelector("#file-name"),
  uploadStatus: document.querySelector("#upload-status"),
};

const modes = {
  stream: {
    label: "流式普通问答",
    help: "保留多轮会话并逐字显示回答。",
  },
  rag: {
    label: "RAG 知识库",
    help: "只根据已上传并索引的资料回答，同时返回引用。",
  },
  coach: {
    label: "整合 Agent",
    help: "自动选择 RAG、MCP 课程工具或直接回答。",
  },
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
  elements.mode.disabled = busy;
}

function updateConversationId(value) {
  state.conversationId = value;
  elements.conversationId.textContent = value || "尚未创建";
  if (value) localStorage.setItem("qa.conversationId", value);
  else localStorage.removeItem("qa.conversationId");
}

function addMessage(role, text = "") {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "YOU" : "AI";

  const content = document.createElement("div");
  content.className = "message-content";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  content.append(bubble);
  article.append(avatar, content);
  elements.messages.append(article);
  elements.messages.scrollTop = elements.messages.scrollHeight;
  return { bubble, content };
}

function addChip(container, text, extraClass = "") {
  const chip = document.createElement("span");
  chip.className = `meta-chip ${extraClass}`.trim();
  chip.textContent = text;
  container.append(chip);
}

function renderEvidence(content, title, items, renderItem) {
  if (!items?.length) return;
  const panel = document.createElement("section");
  panel.className = "evidence-panel";
  const heading = document.createElement("h3");
  heading.textContent = title;
  const list = document.createElement("ul");
  list.className = "evidence-list";

  for (const item of items) {
    const row = document.createElement("li");
    renderItem(row, item);
    list.append(row);
  }
  panel.append(heading, list);
  content.append(panel);
}

function renderResultDetails(content, data) {
  const meta = document.createElement("div");
  meta.className = "result-meta";
  if (data.route) addChip(meta, `路由：${data.route}`, "route");
  if (typeof data.grounded === "boolean") {
    addChip(meta, data.grounded ? "引用编号有效" : "未通过引用校验");
  }
  if (typeof data.retrieved_chunks === "number") {
    addChip(meta, `召回 ${data.retrieved_chunks} 个分块`);
  }
  if (meta.childElementCount) content.append(meta);

  renderEvidence(content, "引用来源", data.citations, (row, citation) => {
    const strong = document.createElement("strong");
    strong.textContent = `[${citation.citation_id}] ${citation.source_name}`;
    const text = document.createTextNode(citation.preview || citation.chunk_id || "");
    row.append(strong, text);
  });

  renderEvidence(content, "课程工具结果", data.courses, (row, course) => {
    const strong = document.createElement("strong");
    strong.textContent = course.title;
    row.append(strong, document.createTextNode(`难度：${course.level}`));
  });
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || payload?.detail || response.statusText;
    throw new Error(`请求失败（${response.status}）：${message}`);
  }
  return payload;
}

function parseEventBlock(block) {
  let eventName = "message";
  const dataLines = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) eventName = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  return { eventName, data: dataLines.join("\n") };
}

async function consumeSse(response, handlers) {
  if (!response.body) throw new Error("浏览器没有提供响应流");
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
        handlers[eventName]?.(data ? JSON.parse(data) : {});
      }
      boundary = buffer.indexOf("\n\n");
    }
    if (done) break;
  }
}

async function runStream(question, view) {
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
  if (!response.ok) throw new Error(`流式请求失败（${response.status}）`);

  await consumeSse(response, {
    metadata(data) {
      updateConversationId(data.conversationId);
    },
    token(data) {
      view.bubble.textContent += data.text;
      elements.messages.scrollTop = elements.messages.scrollHeight;
    },
    error(data) {
      throw new Error(data.message || "模型生成失败");
    },
  });
}

async function runRag(question, view) {
  const payload = await requestJson("/api/v1/rag/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, top_k: 5 }),
    signal: state.controller.signal,
  });
  view.bubble.textContent = payload.data.answer;
  renderResultDetails(view.content, payload.data);
}

async function runCoach(question, view) {
  const payload = await requestJson("/api/v1/coach/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal: state.controller.signal,
  });
  view.bubble.textContent = payload.data.answer;
  renderResultDetails(view.content, payload.data);
}

async function sendQuestion(question) {
  const view = addMessage("assistant");
  state.controller = new AbortController();
  setBusy(true);
  setStatus("正在执行");

  try {
    const runner = {
      stream: runStream,
      rag: runRag,
      coach: runCoach,
    }[elements.mode.value];
    await runner(question, view);
    setStatus("执行完成");
  } catch (error) {
    if (error.name === "AbortError") {
      view.bubble.textContent += "\n\n[已停止]";
      setStatus("已停止");
    } else {
      view.bubble.classList.add("error");
      view.bubble.textContent = error.message || "发生未知错误";
      setStatus("执行失败");
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

elements.uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = elements.documentFile.files[0];
  if (!file) return;

  elements.uploadButton.disabled = true;
  elements.uploadStatus.className = "upload-status";
  elements.uploadStatus.textContent = "正在上传…";

  try {
    const formData = new FormData();
    formData.append("file", file);
    const uploaded = await requestJson("/api/v1/documents/upload", {
      method: "POST",
      body: formData,
    });
    elements.uploadStatus.textContent = "正在切分并写入向量库…";
    const indexed = await requestJson(
      `/api/v1/rag/documents/${uploaded.data.document_id}/index`,
      { method: "POST" },
    );
    elements.uploadStatus.classList.add("success");
    elements.uploadStatus.textContent =
      `索引完成：${indexed.data.indexed_chunks} 个分块`;
  } catch (error) {
    elements.uploadStatus.classList.add("error");
    elements.uploadStatus.textContent = error.message || "上传失败";
  } finally {
    elements.uploadButton.disabled = false;
  }
});

elements.documentFile.addEventListener("change", () => {
  elements.fileName.textContent =
    elements.documentFile.files[0]?.name || "最大 2 MB，UTF-8";
});

elements.mode.addEventListener("change", () => {
  const selected = modes[elements.mode.value];
  elements.modeHelp.textContent = selected.help;
  elements.activeModeLabel.textContent = selected.label;
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
  addMessage("assistant", "新对话已创建。可以上传资料或直接提问。");
  setStatus("准备就绪");
});

updateConversationId(state.conversationId);
elements.mode.dispatchEvent(new Event("change"));
elements.input.focus();
```

所有来自模型、文件名、引用和工具的数据仍使用 DOM `textContent`/`createTextNode` 写入，不拼接 HTML 字符串。

## 四、替换静态页面测试（完整代码）

将 `tests/test_web_ui.py` 完整替换为：

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_home_contains_agent_workspace() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "CourseMall Agent Workspace" in response.text
    assert 'id="mode"' in response.text
    assert 'id="upload-form"' in response.text


def test_all_static_assets_are_served() -> None:
    for path, marker in (
        ("/static/app.js", "runCoach"),
        ("/static/styles.css", ".app-shell"),
        ("/static/workspace.css", ".evidence-panel"),
    ):
        response = client.get(path)
        assert response.status_code == 200
        assert marker in response.text
```

## 五、运行与验收

```powershell
python -m pytest tests/test_web_ui.py -q
python -m uvicorn app.main:app --reload
```

按顺序手测：

1. 上传一份 UTF-8 的 `.md` 文档，看到索引分块数量。
2. 切到 RAG，问题命中文档，看到引用卡片。
3. 切到整合 Agent，输入“推荐 Python 课程”，看到 `catalog` 路由和课程卡片。
4. 输入“根据项目文档推荐 Spring 课程”，看到 `both` 路由。
5. 接口失败时页面显示可读错误，不一直卡在加载状态。

::: tip 💡 面试题：为什么 UI 要展示 route、citations 和 tool result？
Agent 不应是无法排错的黑盒。展示执行依据能帮助开发调试、用户校验，也为后续审计和评估保留可观测数据。
:::

## 六、知识点索引

| 知识点 | 一句话掌握 |
| --- | --- |
| 多模式 UI | 同一界面演示普通问答、RAG 和 Agent |
| FormData | 浏览器上传文件使用的 multipart 请求体 |
| 可观测性 | 向用户或开发者展示路由、引用和工具结果 |
| 渐进增强 | 复用 Day25 页面，只增加工作台能力 |
| 安全渲染 | 不可信文本只作为文本节点写入 DOM |

## 七、✅ 回填清单

- [ ] 文档可以上传并索引
- [ ] 三种问答模式都能切换
- [ ] RAG 引用可以展示
- [ ] MCP 课程结果可以展示
- [ ] 错误和加载状态完整

完成时间：

是否跑通：

踩坑与疑问：

## 八、下次我会追问

1. 为什么上传后还要单独执行索引？
2. 路由可观测性对排错有什么帮助？
3. 前端为什么不能信任模型和文件名？
4. RAG 的引用编号有效是否代表答案一定正确？
