# http 模块

## 基本介绍

这个模块既包含了客户端也包含了服务端的功能。当作为客户端的时候它需要发送请求，接收响应；当作为服务端的时候它需要接收请求，发送响应。

Nodejs 的 HTTP 设计的比较底层，它仅将消息解析为头部和正文，但不会进一步解析实际的头部内容或正文内容。HTTP 消息头如下：

```json
{
  "content-length": "123",
  "content-type": "text/plain",
  "connection": "keep-alive",
  "host": "example.com",
  "accept": "*/*"
}
```

## http 代理客户端
