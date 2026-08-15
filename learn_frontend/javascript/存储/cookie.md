---
order: 136
---

# Cookie

[[toc]]

## 基本概念

### 什么是 Cookie？

- Cookie 是浏览器为特定网页或网站保存的少量命名数据。
- Cookie 是为服务端编程而设计的，在最低的层级上作为 HTTP 协议的扩展实现。
- Cookie 数据会**自动**在浏览器与 Web 服务器之间传输，因此服务器端脚本可以读写存储在客户端的 `Cookie` 值。

一个 Cookie 字符串是由多个名/值对组成，每个名/值对之间用分号和空格分隔。如下所示：
`username=John%20Doe; expires=Wed, 01 Jan 2025 00:00:00 GMT; path=/; domain=example.com; Secure; HttpOnly; SameSite=Lax`

### 浏览器对 Cookie 的限制

- 单个 Cookie 最大 4KB
- 每个域名下的 Cookie 数量有限 ​（通常 20~50 个，不同浏览器不同）

## Cookie 的属性

### 安全性相关属性

`JavaScript`中的`Cookie`并不以任何形式进行加密， 无论怎么说都是不安全的，但是可以通过下面两个属性来进行设置。

#### `Secure` 属性

作用 ​：确保 Cookie 只能通过 HTTPS 安全连接传输
特性 ​：

- 防止 Cookie 在非加密的 HTTP 连接中传输
- 可有效防止中间人攻击（MITM）
- 在本地开发环境（localhost）中，即使没有 HTTPS 也能工作

设置方式 ​：

```js
document.cookie = 'name=value; Secure';
// 或服务器端（Node.js/Express）
res.cookie('name', 'value', { secure: true });
```

#### `HttpOnly` 属性

作用 ​：防止 JavaScript 通过 document.cookie 访问 Cookie，也就是说前端只能将这个 cookie 用于 http 中进行传输
特点：

- 只能由服务器设置（不能通过 JavaScript 设置）
- 有效防御 XSS（跨站脚本）攻击
- 浏览器会自动在请求中包含这些 Cookie

设置方式 ​（仅服务器端）：

```js
// Express 示例
res.cookie('sessionID', 'abc123', { httpOnly: true });
```

#### SameSite 属性

默认情况下，浏览器在跨站请求时会自动携带目标站点的 Cookie（包括 AJAX 请求、表单提交、图片加载等）

::: tip 什么是跨站请求
跨站请求是指从一个网站（源站）发起的对另一个网站（目标站）的请求。判断是否跨站的关键是看协议+域名+端口是否完全相同：

常见的跨站请求场景:

1. 链接跳转：比如从 `www.a.com` 跳转到 `www.b.com`
2. 表单提交：比如 `www.a.com` 的表单提交到 `www.b.com`
3. 脚本请求：比如 `www.a.com` 的脚本请求 `www.b.com` 的资源
4. 图片请求：`<img src="https://bank.com/logout">`

:::
::: tip 什么是自动携带目标站点的 Cookie
当从`www.a.com`访问`www.b.com`时浏览器会自动的带上`www.b.com`目标站点的 Cookie
当从`www.c.com`访问`www.b.com`时浏览器也会自动的带上`www.b.com`目标站点的 Cookie
这回导致跨站请求伪造
:::

作用：控制跨站请求时是否发送 Cookie
可选值 ​：

- `Strict` - 完全禁止跨站发送，仅仅允许同站请求比如：用户在 `a.com` 浏览，点击链接到 `a.com/page`会发送 cooike
- `Lax` - 允许部分安全跨站请求（默认值）
- `None` - 允许跨站发送（必须同时设置 Secure）

示例 ​：

```js
document.cookie = 'name=value; SameSite=Lax';
```

### 生命周期相关属性

Cookie 默认的生命期很短，它们存储的值只在浏览器会话期间存在，用户退出浏览器后就会丢失这里和 `sessionStorage` 一样。但是可以通过下面的属性进行设置

#### max-age 属性

作用 ​：设置 Cookie 的有效期（以秒为单位）
特性 ​：

- 比 expires 更现代的替代方案
- 指定从设置时刻开始的存活秒数
- 设置为 0 或负数会立即删除 Cookie

示例 ​：

```js
document.cookie = 'name=value; max-age=3600'; // 1小时后过期
// 或服务器端
res.cookie('name', 'value', { maxAge: 3600000 }); // Express 使用毫秒
```

#### expires 属性

作用 ​：设置 `Cookie` 的过期时间（`GMT/UTC` 格式）
特性 ​：

- 指定具体的过期日期时间
- 如果不设置，Cookie 就是会话 Cookie（浏览器关闭时删除）
- 时间格式必须符合 RFC 1123 标准

示例 ​：

```js
const date = new Date();
date.setTime(date.getTime() + 7 * 24 * 60 * 60 * 1000); // 7天后过期

document.cookie = `name=value; expires=${date.toUTCString()}`;
// 或服务器端
res.cookie('name', 'value', { expires: new Date(Date.now() + 900000) });
```

::: tip 关于 expires 和 max-age
两者任意设置一个都可以删除 cookie
:::

### 作用域相关属性

与 `localstorage` 和 `sessionstorage` 类似，Cookie 的可见性由文档来源决定，但也由文档路径决定。默认情况下，Cookie 关联着创建它的网页，以及**与该网页位于相同目录和子目录下**的其他网页，这些网页都可以访问它。
比如，如果网页`example.com/catalog/index.html`创建了一个 Cookie,则:

- 该 Cookie 对 `example.com/catalog/order.html` 和 `example.com/catalog/widgets/index.html`同样可见
- 但对 `example.com/about.html` 不可见。

::: tip 总结
**可以这么理解，它的作用域是同源的当前目录和子目录的网页。**
:::
Cookie 的默认作用域可以进行扩展。可以通过下面的属性设置 Cookie 的作用域，如：

#### path 属性

定义：指定 Cookie 适用的 URL 路径。

使用：只要其 URL 以你指定的路径前缀开头， 就可以共享该 Cookie。例如，如果 `example.com/catalog/widgets/index.html` 设置的 Cookie 将路径设置为 `**/catalog`,则该 Cookie 也对 `example.com/catalog/order.html` 可见。或者， 如果将路径设置为`*/`,那么该 Cookie 将对 `example.com` 域中的任何页面都可见，此时这个 Cookie 的作用域就跟 localStorage 一样。

#### domain 属性

定义：指定 Cookie 适用的域名。
使用：默认情况下，Cookie 的作用域按照文档来源区分。不过大网站可能需要跨子域名共享 Cookie.例如，`order.example.com`对应的服务器可能需要读取`catalog.example.com`设置的 Cookie 值。这时候就要用到 domain 属性了。如果 Cookie 是由`catalog.example.com`的页面设置的，且 path 属性被设置为`/`, domain 属性被设置为`.example.com`,则 Cookie 将对 `catalog.example.com`,`order.example.com`, 以及任何 `example.com` 名下的服务器有效。注意，不能将 Cookie 的域设置为服务器父域名之外的其他域名

## Cookie 相关操作

### 获取 Cookie

`document.Cookie` 属性返回一个包含与当前文档有关的所有 Cookie 的字符串。这个字符串是一个分号和空格分隔的名/值对所以要获取 Cookie 需要使用 split 来分割字符串，然后再通过键值对的方式获取。

```js
function getCookies() {
  const list = document.Cookie.split(';');
  const CookiesMap = new Map();
  for (let item of list) {
    if (!item.includes('=')) continue;
    const [key, value] = item.split('=');
    CookiesMap.set(key.trim(), decodeURIComponent(value.trim()));
  }
  return CookiesMap;
}
```

### 设置 Cookie

设置 Cookie 其实就是将键值对转换为字符串存入 Cookie 字符串当中，

```js
function setCookie(name, value, daysToLive = null) {
  let cookie = `${name}=${encodeURIComponent(value)}`;
  if (daysToLive !== null) {
    cookie += `; max-age=${daysToLive * 60 * 60 * 24}`;
  }
  // 直接赋值会覆盖同名Cookie,并向cookie中追加
  document.cookie = cookie;
}
```

::: warning Cookie 值的编码解码
但是注意 Cookie 值不能包含分号、逗号或空格，所以要用 `encodeURIComponent` 编码。读取是要用 `decodeURIComponent` 解码。
:::

### 清除 Cookie

有两种方式可以清除 Cookie：

- 设置 `expires` 属性为过去的时间，使得 Cookie 立即过期。

```js
function deleteCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}
```

- 设置 `max-age` 属性为 0，使得 Cookie 立即过期。

```js
function clearCookie(name) {
  setCookie(name, '', -1);
}
```

## :star:Cookie 和 Storage 的区别

| 对比维度     | Cookie                                                                 | localStorage                   | sessionStorage                 |
| ------------ | ---------------------------------------------------------------------- | ------------------------------ | ------------------------------ |
| **作用域**   | 可设置 `domain` 和 `path`（默认当前页+子页）                           | 同源（协议+域名+端口）         | 同源+同标签页                  |
| **生命周期** | 默认会话级，可通过 `expires/max-age` 设置过期时间                      | 永久存储（需手动清除）         | 会话级（标签页关闭即清除）     |
| **存储大小** | 单个 ≤4KB，每域名 ≤20~50 个                                            | 同源 5MB~10MB                  | 同源 5MB~10MB                  |
| **自动携带** | 每次 HTTP 请求自动携带（若匹配 `domain/path`）                         | 不自动携带                     | 不自动携带                     |
| **安全性**   | 可设 `Secure`（仅 HTTPS）、`HttpOnly`（防 XSS）、`SameSite`（防 CSRF） | 仅同源隔离，无加密             | 仅同源隔离，无加密             |
| **访问方式** | 通过 `document.cookie` 或 HTTP 头                                      | `localStorage.setItem()` API   | `sessionStorage.setItem()` API |
| **适用场景** | 身份验证（Token）、服务器需访问的数据                                  | 长期存储用户偏好、静态数据缓存 | 临时表单数据、单页应用状态管理 |
