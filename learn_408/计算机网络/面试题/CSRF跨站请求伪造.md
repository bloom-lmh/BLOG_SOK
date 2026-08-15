---
order: 354
---

# CSRF 跨站请求伪造

[[toc]]

## 基本概念

CSRF（Cross-Site Request Forgery，跨站请求伪造）是一种利用 Web 应用身份验证机制的漏洞进行攻击的方式。以下是关于 CSRF 的详细介绍：

## 执行原理

1. 用户登录信任网站 A，获取用户凭证
2. 在保持会话的同时，用户访问危险网站 B
3. 网站 B 强制用户浏览器向网站 A 发起请求（自动携带目标网站的 cookie ）
4. 网站 A 认为这是用户合法请求 → 执行恶意操作

::: tip 关键在于自动携带机制
浏览器会自动携带目标站点的 Cookie，而不管当前显示的是哪个网站的页面。比如：

1. 我在 `www.ex1.com` 访问 `www.baidu.com` ，那么浏览器就会携带 `www.baidu.com` 的 Cookie
2. 我在 `www.ex2.com` 访问 `www.baidu.com`，浏览器也会携带 `www.baidu.com` 的 Cookie

:::

![执行原理](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/a.png)

## :star:防御措施

CSRF 本质利用的是浏览器携带 Cookie 的机制：对目标网站的访问会携带目标网站的 Cookie 而与源站点是哪一个没有关系
所以防御措施很简单

### 防止不明外域访问

#### 同源检测

后端会对发送请求的源地址（`Origin/Referer`）进行检测，必须是合法源地址才会采纳请求

- 可作为辅助防御手段
- Referer 可能被篡改或缺失
- 需要维护白名单

服务端验证

```js
// 中间件实现
const allowedOrigins = ['https://yourdomain.com', 'https://api.yourdomain.com'];

app.use((req, res, next) => {
  const origin = req.get('Origin');
  const referer = req.get('Referer');

  if (req.method !== 'GET') {
    const requestSource = origin || referer;
    if (
      !requestSource ||
      !allowedOrigins.some((domain) => requestSource.startsWith(domain))
    ) {
      return res.status(403).send('非法请求来源');
    }
  }
  next();
});
```

#### 设置 SameSite Cookie 属性 ​

设置 Cookie 的安全性属性

```js
// 服务器设置Cookie时（以Node.js为例）
res.cookie('sessionid', 'xxxxxx', {
  httpOnly: true,
  secure: true,
  sameSite: 'Strict', // 或 'Lax'
});
```

- Strict：完全禁止跨站携带 Cookie（即使是 www.a.com → www.b.com 的合法链接也不允许）
- Lax：宽松模式（默认值），允许安全的跨站 GET 请求携带 Cookie（如普通链接跳转），但是不允许 POST 请求携带 Cookie（防止 CSRF 攻击）。
- None：允许跨站请求携带 Cookie，但是不设置 SameSite 属性。

### 提交时附加文本域信息

#### 同步令牌模式（token 方式）

服务器生成一个随机令牌（Token）返回给客户端，要求客户端在每个表单提交或状态变更请求中携带该令牌。

- 最常用的防御方式
- 需要确保 Token 的随机性和保密性
- 攻击者无法获取或预测 Token 值

::: code-group

```js [后端实现 (Node.js/Express)]
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const app = express();

// 会话管理
app.use(
  session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true, httpOnly: true },
  })
);

// 生成CSRF Token
const generateToken = () => crypto.randomBytes(32).toString('hex');

// 中间件：为每个会话生成并存储Token
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateToken();
  }
  next();
});

// 渲染包含CSRF Token的表单
app.get('/form', (req, res) => {
  res.send(`
    <form action="/submit" method="POST">
      <input type="hidden" name="_csrf" value="${req.session.csrfToken}">
      <input type="text" name="data">
      <button type="submit">提交</button>
    </form>
  `);
});

// 验证CSRF Token
app.post('/submit', (req, res) => {
  if (req.body._csrf !== req.session.csrfToken) {
    return res.status(403).send('CSRF Token验证失败');
  }
  res.send('表单提交成功');
});

app.listen(3000);
```

```html [前端实现 (HTML)]
<!-- 由服务端渲染的表单 -->
<form action="/submit" method="POST">
  <input type="hidden" name="_csrf" value="服务器生成的Token" />
  <input type="text" name="data" />
  <button type="submit">提交</button>
</form>
```

:::

#### 双重 Cookie 验证

双重 Cookie 验证原理：

1. 服务端：

   - 生成一个 ​​ 随机 CSRF Token​​（如 csrf_token = "abc123xyz"）
   - 设置 ​​ 两个 Cookie​​：
     - Cookie 1（HttpOnly）​​：sessionid=user123（用于会话管理）。
     - Cookie 2（非 HttpOnly）​​：csrftoken=abc123xyz（用于 CSRF 防护）。
   - 返回响应，并设置 Cookie：

```bash
HTTP/1.1 200 OK
Set-Cookie: sessionid=user123; HttpOnly; Secure; SameSite=Lax
Set-Cookie: csrftoken=abc123xyz; Secure; SameSite=Lax
```

2. 客户端存储 Cookie​

3. 客户端发起请求：

   - 自动携带两个 Cookie（sessionid 和 csrftoken）
   - 同时，请求头或表单数据中也包含 csrftoken。

4. 服务端收到请求 ​​（如 POST /transfer）：

   - 检查请求是否携带两个 Cookie
   - 检查请求头或表单数据是否包含 csrftoken
   - 比较 ​​Cookie 中的 csrftoken​​ 和 ​​ 请求头/表单中的 csrftoken​​ 是否一致

::: tip 关键在于防范 XSS 攻击
双重 Cookie 验证的关键在于设置 SameSite 属性为 strict
因为如果 SameSite 的属性设置为 none，则可以跨站请求携带 Cookie,那么我就可以先获取到非 httpOnly 的 csrftoken，然后伪造请求绕过双重 Cookie 验证。
:::

::: code-group

```js [后端实现 (Node.js/Express)]
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const crypto = require('crypto');
const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
    origin: 'http://your-frontend.com',
    credentials: true,
  })
);

// 设置双Cookie
app.get('/csrf-token', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');

  // 安全Cookie（HttpOnly）
  res.cookie('CSRF_SECURE', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
  });

  // 可读Cookie
  res.cookie('CSRF_TOKEN', token, {
    httpOnly: false,
    secure: true,
    sameSite: 'Strict',
  });

  res.json({ message: '双Cookie已设置' });
});

// 验证双Cookie
app.post('/api/action', (req, res) => {
  const secureToken = req.cookies['CSRF_SECURE'];
  const clientToken = req.headers['x-csrf-token'];

  if (!secureToken || secureToken !== clientToken) {
    return res.status(403).json({ error: 'CSRF验证失败' });
  }

  res.json({ message: '操作成功', data: req.body });
});

app.listen(3000);
```

```js [前端实现 (Axios)]
// 获取CSRF Token的函数
function getCsrfToken() {
  const cookies = document.cookie.split('; ');
  const cookie = cookies.find((c) => c.startsWith('CSRF_TOKEN='));
  return cookie ? cookie.split('=')[1] : null;
}

// 发送请求
async function sendRequest() {
  const token = getCsrfToken();

  try {
    const response = await fetch('http://your-api.com/api/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      credentials: 'include',
      body: JSON.stringify({ action: 'some action' }),
    });

    const data = await response.json();
    console.log('请求成功', data);
  } catch (error) {
    console.error('请求失败', error);
  }
}

// 初始化时获取Token
fetch('http://your-api.com/csrf-token', { credentials: 'include' })
  .then(() => console.log('CSRF Token已准备'))
  .catch((err) => console.error('获取Token失败', err));
```

:::

#### Cookie-to-Header 模式

原理：

- 服务器设置一个可读的 CSRF Token Cookie（如 XSRF-TOKEN）
- 客户端 JavaScript 读取该 Cookie 并将其 Token 值放入自定义请求头（如 X-XSRF-TOKEN）
- 服务器验证请求头中的 Token 是否与 Cookie 中的 Token 匹配

::: code-group

```js [后端实现 (Node.js/Express)]
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const app = express();

app.use(cookieParser());
app.use(express.json());
app.use(
  cors({
    origin: 'http://your-frontend.com',
    credentials: true,
  })
);

// 设置CSRF Token Cookie
app.get('/csrf-token', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('XSRF-TOKEN', token, {
    httpOnly: false, // 允许前端读取
    secure: true,
    sameSite: 'Strict',
  });
  res.json({ message: 'CSRF Token已设置' });
});

// 验证CSRF Token
app.post('/api/data', (req, res) => {
  const cookieToken = req.cookies['XSRF-TOKEN'];
  const headerToken = req.headers['x-xsrf-token'];

  if (!cookieToken || cookieToken !== headerToken) {
    return res.status(403).json({ error: 'CSRF验证失败' });
  }

  res.json({ message: '请求成功', data: req.body });
});

app.listen(3000);
```

```js [前端实现 (Axios)]
import axios from 'axios';

// 配置Axios，自动携带CSRF Token
axios.defaults.xsrfCookieName = 'XSRF-TOKEN';
axios.defaults.xsrfHeaderName = 'X-XSRF-TOKEN';
axios.defaults.withCredentials = true;

// 先获取CSRF Token
axios
  .get('http://your-api.com/csrf-token')
  .then(() => {
    // 然后发送受保护的请求
    return axios.post('http://your-api.com/api/data', { data: 'some data' });
  })
  .then((response) => {
    console.log('请求成功', response.data);
  })
  .catch((error) => {
    console.error('请求失败', error);
  });
```

:::
