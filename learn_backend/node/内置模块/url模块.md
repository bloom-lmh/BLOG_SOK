# url 模块

## 介绍

前面我们给的案例中并没有涉及传参，那么如何接受参数呢？在 node 中给我们提供了 URL 模块用于和好的将参数解析出来

## 旧接口（已过时）

如何接受参数呢？在 `node` 中给我们提供了 `URL` 模块用于和好的将参数解析出来

| 命令                             | 含义           |
| -------------------------------- | -------------- |
| `parse(request.url).pathname`    | URL 路径       |
| `parse(request.url, true).query` | URL 查询字符串 |

### parse 获取 URL 路径

```js
const url = require('url');
const urlString = 'https://www.baidu.com:443/ad/index.html?id=8&name=mouse#tag=110';
// 获取路径
const parsedStr = url.parse(urlString);
console.log(parsedStr); // /ad/index.html
```

获取 `url` 对象要加 `true`，对象如下:

```js
Url {
  protocol: null,
  slashes: null,
  auth: null,
  host: null,
  port: null,
  hostname: null,
  hash: null,
  search: '?id=8&name=mouse',
  query: [Object: null prototype] { id: '8', name: 'mouse' },
  pathname: '/home',
  path: '/home?id=8&name=mouse',
  href: '/home?id=8&name=mouse'
}
```

### format 拼接 URL 路径

node 可以实现从 URL 字符串中解析路径以及将查询字符串转为 json 对象的功能，同时也能逆向将 url 对象转为 URL 字符串

```js
const url = require('url');

const obj = {
  protocol: 'https:',
  hostname: 'www.baidu.com',
  port: 443,
  pathname: '/ad/index.html',
  query: { id: '8', name: 'mouse' },
  hash: 'tag=110',
};

const str = url.format(obj);
console.log(str);
// 输出: https://www.baidu.com:443/ad/index.html?id=8&name=mouse#tag=110
```

### resolve 地址模块的拼接

```js
let a = url.resolve('/one/two/three', 'four');
console.log(a); // /one/two/four
let b = url.resolve('http://example.com/', '/one');
console.log(b); // http://example.com/one
let c = url.resolve('http://example.com/one', '/two');
console.log(c); // http://example.com/two
```

::: tip Tips
地址拼接时要注意，当解析到一个完整的绝对路径 URL 时会停止解析，所以第二个参数加斜杠会替换掉所有的路径和查询字符串，不加只会替换掉第一个参数最后一个`/`的内容
:::

## 新接口

### 获取 URL 对象

使用`new`来创建 URL 对象

```js
server.on('request', (req, res) => {
  const { url } = req;
  // 获取URL对象
  const myURL = new URL(url, 'http://127.0.0.1:3000');
});
```

url 对象如下：

```js
URL {
  href: 'http://127.0.0.1:3000/favicon.ico',
  origin: 'http://127.0.0.1:3000',
  protocol: 'http:',
  username: '',
  password: '',
  host: '127.0.0.1:3000',
  hostname: '127.0.0.1',
  port: '3000',
  pathname: '/favicon.ico',
  search: '',
  searchParams: URLSearchParams {},
  hash: ''
}
```

### 获取查询字符串

```js
server.on('request', (req, res) => {
  const { url } = req
  // 获取URL对象
  const myURL = new URL(url, 'http://127.0.0.1:3000')
  // 获取查询对象
  let queryParams = myURL.searchParams
  // 遍历查询对象
  for (var [key, value] of queryParams) {
    console.log(key + '=' + value)
  }
}
```

### fileURLToPath 文件路径

此函数可确保正确解码百分比编码字符，并确保跨平台有效的绝对路径字符串。

```js
const { fileURLToPath } = require('node:url');
new URL('file:///C:/path/').pathname; // Incorrect: /C:/path/
fileURLToPath('file:///C:/path/'); // Correct:   C:\path\ (Windows)

new URL('file://nas/foo.txt').pathname; // Incorrect: /foo.txt
fileURLToPath('file://nas/foo.txt'); // Correct:   \\nas\foo.txt (Windows)

new URL('file:///你好.txt').pathname; // Incorrect: /%E4%BD%A0%E5%A5%BD.txt
fileURLToPath('file:///你好.txt'); // Correct:   /你好.txt (POSIX)

new URL('file:///hello  world').pathname; // Incorrect: /hello%20world
fileURLToPath('file:///hello world'); // Correct:   /hello world (POSIX)
```
