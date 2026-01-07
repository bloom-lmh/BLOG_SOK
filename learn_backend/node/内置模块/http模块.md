# http 模块

## 创建 HTTP 服务

通过 http 模块我们能够很快的创建 http 服务

```js
// 导入http模块
const http = require('http');
// 创建服务对象
const server = http.createServer();
// 当接受到请求时调用回调函数处理请求
server.on('request', (req, res) => {
  res.end();
});
// 服务对象设置监听3000端口，监听成功后执行回调函数
server.listen(3000, () => {
  console.log('服务已启动');
});
```

### 端口占用解决方法

端口号被占用：`Error: listen EADDRINUSE: address already in use :::3000`

- 关闭当前正在运行监听端口的服务 （ 使用较多）
- 修改为其他端口号

HTTP 协议默认端口是 80 。HTTPS 协议的默认端口是 443, HTTP 服务开发常用端口有 3000，8080，8090，9000 等

::: tip 提示
Tips：如果端口被其他程序占用，可以使用资源监视器找到占用端口的程序，然后根据 PID 使用任务管理器关闭对应的程序
:::

### 服务启动工具

为了解决修改代码频繁重启导致的时间浪费，可以借助工具在修改后自动重启服务器，这里推荐两个工具 `nodemon` 或者 `node-dev`。

1. 使用全局下载这两个工具

- `npm i -g nodemon `
- `npm i -g node-dev `

2. 然后使用`nodemon`或`node-dev`来启动项目（例`nodemon ./index.js`）

## http 服务中的两个重要对象

`request`对`象是`node`帮我们封装好了的包含了请求信息以及相关方法的对象，通过该对象我们能够很好的处理请求报文。`request`对象常用属性和方法如下：

| 语法                                                                      | 功能     |
| ------------------------------------------------------------------------- | -------- |
| `request.method`                                                          | 请求方法 |
| `request.httpVersion`                                                     | 请求版本 |
| `request.url`                                                             | 请求路径 |
| `request.headers`                                                         | 请求头   |
| `request.on('data', function(chunk){}); request.on('end', function(){});` | 请求体   |

```js
// 获取资源路径，请求方法，htt版本，请求头
const { url, method, httpVersion, headers } = request;
console.log(url); // /home?id=8&name=mouse
console.log(method); // GET
console.log(httpVersion); // 1.1
console.log(headers);
```

::: warning 注意

- `request.url` 只能获取**路径以及查询字符串**，无法获取 `URL` 中的域名以及协议的内容
- `request.headers` 将请求信息转化成一个对象，并将属性名都转化成了小写
- 如果访问网站的时候，只填写了 IP 地址或者是域名信息，此时请求的路径为`/`
- 关于 `favicon.ico`这个请求是属于浏览器自动发送的请求

:::

## response 对象

`response`对象也是`node`帮我们封装好了的包含了响应信息以及相关方法的对象，通过该对象我们能够很好的操作响应报文。`response`对象常用属性和方法如下：

| 语法                                                         | 功能             |
| ------------------------------------------------------------ | ---------------- |
| `response.statusCode`                                        | 设置响应状态码   |
| `response.statusMessage （ 用的非常少）`                     | 设置响应状态描述 |
| `response.setHeader('头名', '头值')`                         | 设置响应头信息   |
| `response.write('xx')  response.end('xxx')`                  | 设置响应体       |
| `response.writeHead(statusCode[, statusMessage][, headers])` | 自定义响应报文   |

## queryString 处理查询字符串

### parse 查询字符串转换为对象

`parse`能够将查询字符串转换为对象

```js
const querystring = require('querystring');

// 将查询字符串解析为对象
let qs = 'name=xiao&address=xian';
console.log(querystring.parse(qs));
```

### stringify 对象转换为查询字符串

`stringify` 能够将对象转换为查询字符串

```js
// 将对象序列化为查询字符串
let student = {
  name: 'xiaomin',
  tel: 12312312,
};
console.log(querystring.stringify(student));
```

## 静态资源类型 MIME

媒体类型（通常称为 `Multipurpose Internet Mail Extensions` 或 `MIME` 类型 ）是一种标准，用来表示文档、文件或字节流的性质和格式。`HTTP` 服务可以设置响应头 `Content-Type` 来表明响应体的 `MIME` 类型，浏览器会根据该类型决定如何处理资源

### 常见的 MIME 类型

`mime` 类型结构：[type]/[subType]

| 文档 | 对应类型         |
| ---- | ---------------- |
| html | text/html        |
| css  | text/css         |
| js   | text/javascript  |
| png  | image/png        |
| jpg  | image/jpeg       |
| gif  | image/gif        |
| mp4  | video/mp4        |
| mp3  | audio/mpeg       |
| json | application/json |

::: tip 提示
对于未知的资源类型，可以选择 `application/octet-stream` 类型，浏览器在遇到该类型的响应时，会对响应体内容进行独立存储，也就是我们常见的下载效果
:::

### 封装 MIME 类型判断工具

对文件类型的判断通常采用 `path` 模块来进行具体操作为

1. 通过 `path.extname` 获取文件后缀
2. 去除后缀的.
3. 通过 `switch` 判断文件对应的 `MIME` 类型

```js
// 引入path模块
const path = require('path');
// 判断文件后缀对应mime
function mimes(filePath) {
  if (filePath === null || filePath === '') return '';
  let mimes = {
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    png: 'image/png',
    jpg: 'image/jpeg',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    json: 'application/json',
  };
  // 获取文件后缀
  let postfix = path.extname(filePath).slice(1);
  // 判断文件类型
  let type = mimes[postfix];
  return type ? type : 'application/octet-stream';
}
exports.mimes = mimes;
```

## 字符编码集的设置

对于字符编码集的设置可以在 html 的 meta 标签中也可以在请求头中设置。请求头设置的优先级高于 meta 标签。关于字符编码集的了解请看编码集。

但是一般的文件不需要设置字符编码集，因为会按照浏览器设置的字符编码集进行解析，所以一般字需要设置 html 文件的字符编码集即可，即`'text/html;charset=utf-8' `

## 对错误的处理

### 常见的错误代码

对于不同的错误有不同的响应信息。对于常见系统错误代码请参见[官方文档](https://nodejs.cn/api/v18/errors.html#erroraddress)

### 错误处理工具类的封装

```js
// 根据错误代码返回对应状态码
function renderStatus(errCode) {
  let resultObj = {
    code: 500,
    message: '',
  };
  switch (errCode) {
    // 文件操作权限不够
    case 'EACCES':
      resultObj.code = 405;
      resultObj.message = '文件操作权限不够';
      break;
    // 文件不存在
    case 'ENOENT':
      resultObj.code = 404;
      resultObj.message = '文件不存在';
      break;
    default:
      // 系统出错
      resultObj.code = 500;
      resultObj.message = '系统错';
      break;
  }
  return resultObj;
}

module.exports = {
  renderStatus,
};
```

## HTTP 服务响应静态资源（综合案例）

前面我们已经了解了如何创建服务，并封装了静态资源 `mime` 和错误处理工具类以及字符编码集的设置，下面来实现按不同路径获取静态资源的案例

```js
// 导入http模块
const http = require('http');
// 导入文件模块
const fs = require('fs');
// 引入URL模块
const myURL = require('url');
// 引入状态码判断模块
const { renderStatus } = require('./modules/renderStatus');
// 引入mime判断模块
const { mimes } = require('./modules/renderMimes.js');
// 创建服务对象
const server = http.createServer();
// 当接受到请求时调用回调函数处理请求
server.on('request', (request, response) => {
  // 获取资源路径，请求方法
  const { url, method } = request;
  if (method !== 'GET') {
    response.statusCode = 405;
    response.end('Method Not Allowed');
  }
  let { pathname } = new URL(url, 'https://localhost');
  // 获取静态资源路径
  const filePath = myURL.fileURLToPath('file:///' + __dirname + '/page' + pathname);
  // 根据不同的静态资源路径获取不同的静态资源
  fs.readFile(filePath, (err, data) => {
    if (err) {
      let resultObj = renderStatus(err.code);
      response.writeHead(resultObj.code, { 'Content-Type': 'text/html;charset=utf-8' });
      response.end(resultObj.message);
      return;
    }
    // 获取所请求资源的MIME类型
    let type = mimes(filePath);
    let charset = '';
    if (type === 'html') {
      charset = 'utf-8';
    }
    response.writeHead(200, `Content-Type': ${type};+${charset}`);
    response.end(data);
  });
  // 自定义请求头
});
// 服务对象设置监听3000端口，监听成功后执行回调函数
server.listen(3000, () => {
  console.log('服务已启动');
});
```

## 解决跨域

### 使用 jsonp

#### 什么是 jsonp

JSONP 不是一门编程语言，也不是什么特别的技术，它更像一个漏洞，程序员可以利用这个漏洞，实现跨域传输数据。

JSONP 全称“JSON with Padding”，译为“带回调的 JSON”，它是 JSON 的一种使用模式。通过 JSONP 可以绕过浏览器的同源策略，进行跨域请求。

#### jsonp 的原理

在进行 `Ajax` 请求时，由于同源策略的影响，不能进行跨域请求，但是同源策略的让步让 `<script>` 标签的 `src` 属性却可以加载跨域的 JavaScript 脚本，JSONP 就是利用这一特性实现的。与普通的 `Ajax` 请求不同，在使用 JSONP 进行跨域请求时，服务器不再返回 JSON 格式的数据，而是返回一段调用某个函数的 JavaScript 代码，在 `src` 属性中调用，来实现跨域。

#### 实现步骤

通过 jsonp，我们可以避开浏览器的同源策略，从而进行跨域请求。jsonp 是利用 HTML 标签的 src 属性引用资源不受同源策影响的特性来实现的，实现步骤如下：

前端准备好要执行的回调函数，这里 `callback` 函数名为`fun1`

```js
// 回调函数名
let callback = 'fun1';
// 由于响应内容为函数调用语句及其参数所以当响应来时会执行下面的回调函数
function callback(data) {
  console.log(data);
}
```

通过动态创建 `script` 标签，其 `scr` 指向非同源的 `url`，并传递一个 `callback` 参数给服务端

```js
// 创建script标签对象
let oscript = document.createElement('script');
// 设置请求src地址，以回调函数名作为callback参数
oscript.src = `http://localhost/3000/api/jsonp?callback=${callback}`;
// 将标签推入body中，当页面加载就会发起请求
document.body.appendChild(oscript);
```

服务器接收到请求后返回一个以 `callback` 参数作为函数名的函数的调用和一系列参数给前端，也就是将`callback({ name: 'zhangsan', age: 18 })`返回前端

```js
const http = require('http');
const url = require('url');
const qs = require('querystring');
http
  .createServer((request, response) => {
    let { query, pathname } = url.parse(request.url);
    let callback = qs.parse(query).callback || 'anonumous';
    switch (pathname) {
      // 当接受到jsonp请求后会返回 callback({})形式的字符串，这会引起前端触发callback函数
      case '/api/jsonp':
        response.end(
          `${callback}(${JSON.stringify({
            name: 'zhangsan',
            age: 18,
          })})`
        );
        break;
    }
  })
  .listen(3000);
```

页面接收到响应后，发现是对回调函数的调用语句，于是立刻执行回调并对数据进行处理

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260107100621704.png)

```js
// 响应内容是调用 callback函数并传入{ name: 'zhangsan', age: 18 }参数
callback({ name: 'zhangsan', age: 18 });
```

注意：服务器返回的内容，必须是一段可执行的 JavaScript 代码，不能是其它内容。

### 后端配置响应头

由于跨域不是不允许浏览器发送请求而是浏览器会对响应报文进行拦截，所以通过后端来对响应头进行设置可以让响应报文不被浏览器拦截，从而解决跨域问题。也就是说后端都允许不同的源进行访问了浏览器自然也是放行的了

```js
res.writeHead(200, {
  'Access-Control-Allow-Origin': '*',
});
```

### 配置代理服务器

正向代理：用户端发请求给同源的代理服务器，此时代理服务器代理服务端，由代理服务器转发请求给后端服务器（代理服务器没有同源策略的限制）

反向代理：服务端响应数据给代理服务器，此时代理服务器代理客户端，收到响应后服务器再转发响应给同源浏览器

常见的代理服务器有 `nginx` 代理服务器，前端的 `devServer` 代理服务器

当然 `node` 也可以用 `http` 和 `https` 模块来手动搭建代理服务器，下面的案例是使用 https 模块搭建的正向代理服务器。
