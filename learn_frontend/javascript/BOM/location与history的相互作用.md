---
order: 148
---

# 深入理解 `history` 与 `location` 的关系及相互影响

[[toc]]

`history` 和 `location` 是浏览器 BOM（Browser Object Model）中两个核心对象，它们共同管理浏览器的导航和 URL 状态，但在功能上有明确分工，同时也会相互影响。以下是详细解析：

## 核心概念对比

| 特性                 | `history` 对象                                             | `location` 对象                                               |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| **作用**             | 管理浏览器会话历史记录（前进/后退）                        | 读写当前页面的 URL 信息                                       |
| **关键方法/属性**    | `pushState()`, `replaceState()`, `go()`, `back()`, `state` | `href`, `assign()`, `replace()`, `reload()`, `hash`, `search` |
| **是否触发页面跳转** | `pushState/replaceState` **不跳转**                        | `location.href=` **会跳转**                                   |
| **是否发网络请求**   | ❌ 否                                                      | ✅ 是（除非仅修改 hash）                                      |
| **典型用途**         | SPA 无刷新路由                                             | 页面跳转、URL 参数解析                                        |

## `location` 如何影响 `history`

### `location.href=` 或 `location.assign()`

- **行为**： 跳转到新 URL，**必定新增一条历史记录**（相当于 `history.pushState` + 强制页面刷新）。
- **示例**：
  ```javascript
  location.href = '/new-page'; // 新增记录，触发页面加载
  ```
- **对 `history` 的影响**： 历史栈长度 +1，`history.state` 为新页面的初始值（通常为 `null`）。

::: tip 关于历史栈

历史栈中的每个条目（entry）包含以下信息：

- ​URL​ - 访问的页面地址
- ​State 对象 ​ - 关联的状态数据（可选）
- 文档状态 ​ - 页面的快照（在某些浏览器实现中）

:::

### `location.replace()`

- **行为**：  
  替换当前历史记录（无刷新时类似 `history.replaceState`，但会强制跳转）。
- **示例**：
  ```javascript
  location.replace('/login'); // 替换当前记录，触发页面加载
  ```
- **对 `history` 的影响**：  
  历史栈长度不变，当前条目被替换，`history.state` 丢失。

### `location.reload()`

- **行为**：  
  重新加载当前页面，**保留当前历史记录**。
- **对 `history` 的影响**：  
  `history.state` 保持不变（若之前通过 `pushState` 设置过）。

### 修改 `location.hash`

- **行为**：  
  仅修改 URL 的哈希部分（`#` 后内容），**不触发页面刷新**（除非监听 `hashchange` 事件）。
- **示例**：
  ```javascript
  location.hash = '#section-2'; // 不会新增历史记录
  ```
- **对 `history` 的影响**：
  - 默认情况下**新增一条历史记录**（类似 `pushState`）。
  - 若希望不新增记录，需配合 `history.replaceState`：
    ```javascript
    history.replaceState(null, '', `#${newHash}`);
    ```

---

## `history` 如何影响 `location`

### `history.pushState()`

- **行为**：  
  修改 URL 和 `state`，**不改变 `location` 的其他属性**（如 `search`、`hash`）。
- **关键点**：
  - `location.href` 会同步更新为新 URL。
  - `location.pathname`/`location.search` 等属性也会响应变化。
- **示例**：
  ```javascript
  history.pushState({ id: 1 }, '', '/product?page=2');
  console.log(location.pathname); // "/product"
  console.log(location.search); // "?page=2"
  ```

### `history.replaceState()`

- **行为**：  
  替换当前 URL 和 `state`，**不触发 `location` 的跳转逻辑**。
- **对 `location` 的影响**：
  - `location` 的所有相关属性（`href`、`pathname` 等）立即更新。
  - 页面不会重新加载。

### 用户手动前进/后退

- **行为**：  
  通过 `history.back()`/`forward()` 或浏览器按钮导航时：
  - `location` 自动更新为目标 URL。
  - 若目标 URL 有 `state`，会触发 `popstate` 事件。
- **示例**：
  ```javascript
  window.addEventListener('popstate', event => {
    console.log(location.href); // 显示切换后的 URL
    console.log(event.state); // 显示关联的 state
  });
  ```
