---
order: 13
---

# zlib 模块

## 什么是 zlib 模块

zlib 模块是 node 中内置的关于如何处理文件压缩的模块，通过该模块可以实现对文件的压缩

## 为什么使用 zlib 模块

用户访问网站时，首先要发起请求将网页资源通过网络传递到浏览器解析后再展示给用户。如果页面资源过大，那么资源的在网络上传输就会花费很多时间，所以在传输时一般将放在前端服务器上的网页资源进行压缩后再进行传输，这样就可以加快网页在网络中的传输速度。如下方我们的 nginx 服务器作为前端服务器，浏览器发起请求从 nginx 服务器中获取页面

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260112171340046.png)

## 使用演示

```js
const http = require('http');
const fs = require('fs');
const zlib = require('zlib');
// 创建gizp对象
const gzip = zlib.createGzip();
// 创建
const server = http.createServer();
// 设置请求回调
server.on('request', (req, res) => {
  // 创建文件的读取流对象
  const readStream = fs.createReadStream('./note.txt');
  // 设置响应头的压缩类型Content-Encoding为gzip
  res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8', 'Content-Encoding': 'gzip' });
  // 读取流对象调用pipe将文件写入管道
  readStream.pipe(gzip).pipe(res);
});
server.listen(3000, () => console.log(`Example app listening on port 3000!`));
```

::: warning
压缩后需要在响应头中设置采用的压缩方式，即`'Content-Encoding': '对应压缩方式'`，这样浏览器才能正常解压缩和解析文件
:::
