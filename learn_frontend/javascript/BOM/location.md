---
order: 146
---

# window-location

[[toc]]

`location` 是浏览器对象模型(BOM)的核心对象之一，提供了当前文档的 URL 信息和控制页面导航的方法。

## `location` 对象属性

| 属性       | 说明                     | 示例值                                           |
| ---------- | ------------------------ | ------------------------------------------------ |
| `href`     | 完整的 URL 字符串        | `"https://example.com:8080/path?q=test#section"` |
| `protocol` | 协议（包含冒号）         | `"https:"`                                       |
| `host`     | 主机名+端口              | `"example.com:8080"`                             |
| `hostname` | 主机名（不含端口）       | `"example.com"`                                  |
| `port`     | 端口号                   | `"8080"`                                         |
| `pathname` | URL 路径（以/开头）      | `"/path"`                                        |
| `search`   | 查询字符串（以?开头）    | `"?q=test"`                                      |
| `hash`     | 片段标识符（以#开头）    | `"#section"`                                     |
| `origin`   | 协议+主机名+端口（只读） | `"https://example.com:8080"`                     |

## `location` 对象方法

### 页面导航方法

```javascript
// 1. 加载新页面（会在浏览器历史中创建记录）
location.assign('https://example.com/newpage');

// 2. 替换当前页面（不会创建历史记录）
location.replace('https://example.com/replaced');
```

### 重新加载页面方法

```js
// 3. 重新加载当前页面
location.reload(); // 可能从缓存加载
location.reload(true); // 强制从服务器重新加载
```

## 常见应用场景

### 与 URL 配合使用

```javascript
// 传统方式
function getQueryParam(name) {
  const search = location.search.substring(1);
  const params = new URLSearchParams(search);
  return params.get(name);
}

// 现代方式（使用URL API）
const url = new URL(location.href);
console.log(url.searchParams.get('q'));
```

### 修改 URL 而不刷新页面

```javascript
// 修改hash,会创建新的条目（常用于单页应用路由）
location.hash = '#new-section';
// 新式的使用的是history的state来实现的
```

### 安全跳转

```javascript
// 检查协议是否为HTTPS
if (location.protocol !== 'https:') {
  location.replace(`https://${location.host}${location.pathname}`);
}
```
