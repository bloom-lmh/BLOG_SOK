---
order: 147
---

# BOM - history

`history` 是浏览器对象模型(BOM)的重要组成部分，它提供了与浏览器会话历史记录交互的接口，允许开发者以编程方式导航和操作浏览历史。
[[toc]]

## :star:history 条目

在解释 history 对象属性和方法之前有必要说明什么是条目

### 什么是条目

历史条目是浏览器历史记录栈的基本信息单元,每个历史条目包含以下关键信息：

| **类别**           | **包含内容**                                                                                                | **备注**                      |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **URL 信息**       | - 完整 URL（协议+域名+路径+查询参数+hash）<br>（例：`https://example.com/products?id=123#details`）         | 核心标识，必须存储            |
| **文档状态**       | - DOM 结构快照（部分浏览器通过 bfcache 实现）<br>- 滚动条位置（自动保存）<br>- 表单输入值（部分浏览器保留） | 恢复页面时保持用户交互状态    |
| **状态对象 state** | - `pushState()`/`replaceState()` 存储的 JSON 数据<br>（最大 2-10MB，浏览器差异）                            | 开发者可控，用于 SPA 状态管理 |
| **元信息**         | - 时间戳<br>- 引荐来源（referrer）<br>- 安全上下文（HTTPS 状态）                                            | 用于分析和安全验证            |

### :star:条目创建机制

| 方法/场景                | 创建新历史记录条目 | 触发 popstate | 页面刷新     |
| ------------------------ | ------------------ | ------------- | ------------ |
| `history.pushState()`    | 是                 | 否            | 否           |
| `history.replaceState()` | 否                 | 否            | 否           |
| 常规`<a>`链接点击        | 是                 | 不适用        | 是           |
| `location.hash` 变化     | 是(仅 hash 不同时) | 是            | 否           |
| `location.replace()`     | 否                 | 不适用        | 是           |
| `location.href` 赋值     | 是                 | 不适用        | 是           |
| 表单提交                 | 是                 | 是            | 传统表单交互 |

### 条目激活过程

当用户点击后退/前进按钮时,对应`history.back()/history.go()`

- 浏览器从历史栈中取出对应条目
- 恢复 URL 显示
- 尝试从 bfcache 恢复完整页面状态（若可用）
- 触发 `popstate` 事件（`Hash` 变化则触发 `hashchange`）

### 条目销毁

- 关闭浏览器标签页
- 超过历史记录最大限制（通常 50-100 条）
- 调用 location.replace()替换当前条目

### 条目和页面的关系

- 一个新页面对应可以多个条目，每个条目是页面不同状态下的映射
- 改变 hash 或通过 pushState 会为一个页面添加新的条目
- 状态 state 是页面信息的一种还有其它页面信息一起构成条目

## history 对象属性

### length

返回当前会话中的历史记录条目数（只读）

### :star: history.state 对象

1. history.state 是浏览器 History API 提供的核心功能之一，用于在无刷新页面导航 ​（如单页应用 SPA）中存储和传递状态数据。
2. ​**state 是一个 JavaScript 对象**，可以存储任意可序列化的数据（如 `{ page: "home", id: 123 }`）。它与当前的历史记录条目绑定，**当用户前进/后退时，对应的 state 会被恢复**。
3. state 对象不会因为刷新而丢失，它保存着页面相关信息

## history 对象方法

### 导航方法

| 方法        | 描述                                                                  |
| ----------- | --------------------------------------------------------------------- |
| `back()`    | 后退到上一个页面（相当于点击浏览器的后退按钮）                        |
| `forward()` | 前进到下一个页面（相当于点击浏览器的前进按钮）                        |
| `go(n)`     | 从当前页面跳转到历史记录中的第 n 个页面（正数前进，负数后退，0 刷新） |

```javascript
// 后退一页
history.back();

// 前进一页
history.forward();

// 前进/后退多页
history.go(-2); // 后退两页
history.go(1); // 前进一页
```

### 管理状态方法

| 方法             | 描述                               |
| ---------------- | ---------------------------------- |
| `pushState()`    | 向历史记录添加新条目（不刷新页面） |
| `replaceState()` | 替换当前历史记录条目（不刷新页面） |

:::code-group

```javascript [pushState]
// 添加新历史记录
history.pushState(
  { page: 'products' }, // 状态对象
  'Products Page', // 标题（大多数浏览器忽略）
  '/products', // 可选的URL
);
```

```javascript [replaceState]
// 替换当前历史记录
history.replaceState({ page: 'updated' }, 'Updated Page', '/updated');
```

:::

## history 相关事件

### popstate 事件

触发时机

- 用户点击浏览器的 ​ 前进（→）​​ 或 ​ 后退（←）​​ 按钮。
- 调用 history.back()、history.forward() 或 history.go(n) 时。
- ​**pushState() 和 replaceState() 不会触发 popstate**​（它们只是修改历史记录）。

使用示例

```js
window.addEventListener('popstate', event => {
  console.log('当前状态:', event.state); // 获取关联的 state 对象
  console.log('当前 URL:', location.href); // 获取最新 URL
});
```

### hashchange 事件

触发时机

- URL 的哈希（# 部分）发生变化 ​（如 `<a href="#section1">` 或 location.hash = "#new"）。
- 适用于 ​ 基于哈希的路由（Hash-based Routing）​。

使用示例

```js
// 1. 修改哈希（触发 hashchange）
location.hash = '#about';

// 2. 监听哈希变化
window.addEventListener('hashchange', () => {
  if (location.hash === '#about') {
    console.log('跳转到关于页');
  }
});
```

## 实际应用场景

1. 单页应用(SPA)路由
2. 滚动位置恢复
