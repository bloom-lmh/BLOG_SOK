---
order: 386
---

# HTTP 协议的应用

[[toc]]

## 协商缓存

### 什么是协商缓存

协商缓存（`Conditional Caching`）是 HTTP 缓存的一种策略，它通过客户端和服务端的通信来判断资源是否可复用，从而减少不必要的网络传输。其核心思想是：如果资源没变，就直接用本地缓存；如果变了，再下载新的。
::: warning 注意
协商缓存浏览器已实现不需要再手动实现，只需要进行状态码验证，如果是 304 表示资源未修改，则使用本地缓存，否则重新请求。
:::

### 协商缓存的两种实现方式

#### `Last-Modified` & `If-Modified-Since`

1. 首次请求 ​：服务端返回 `Last-Modified`（资源最后修改时间）

```bash
HTTP/1.1 200 OK
Last-Modified: Wed, 21 Oct 2025 07:28:00 GMT
```

2. ​ 后续请求 ​：浏览器自动在请求头中添加 `If-Modified-Since`（值为上次的 `Last-Modified`）。

```bash
GET /data HTTP/1.1
If-Modified-Since: Wed, 21 Oct 2025 07:28:00 GMT
```

3. 服务端响应

```bash
如果资源的`Last-Modified`时间与`If-Modified-Since​`一致表示资源未修改​ → 返回 304 Not Modified（无响应体，省流量）。
如果 ​已修改​ → 返回 200 OK 和新数据。
```

::: tip 理解
比如你修改了用户数据，那么会记录操作时间，这个时间就是`If-Modified-Since​`
:::

#### `ETag` & `If-None-Match`

1. 首次请求 ​：服务端返回 ETag（资源的唯一标识，如哈希值）。

```bash
HTTP/1.1 200 OK
ETag: "33a64df551425fcc55e4d42a148795d9"
```

2. 后续请求 ​：浏览器自动添加 `If-None-Match`（值为上次的 `ETag`）。

```bash
GET /data HTTP/1.1
If-None-Match: "33a64df551425fcc55e4d42a148795d9"
```

3. 服务端响应 ​：

```bash
如果 ETag ​匹配​ → 304 Not Modified。
如果 ​不匹配​ → 200 OK 和新数据。
```

![协商缓存](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250807145952267.png)

::: tip 强制缓存
而强制缓存不需要发送请求到服务端，根据请求头`expires`和`cache-control`判断是否命中强缓存强制缓存与协商缓存的流程图如下所示：
:::

## 会话状态

## 防盗链
