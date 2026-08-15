---
order: 384
---

# HTTP 不同请求方式

[[toc]]

HTTP 协议定义了七种请求方式，分别为：

1. GET：用于获取资源，请求的数据会附在 URL 后面，以`?`分割 URL 和请求数据，如：`http://www.example.com/get.php?name=value`；
2. POST：用于提交数据，请求的数据会放在请求体中，如：`POST /post.php HTTP/1.1`；
3. PUT：用于上传文件，请求的数据会放在请求体中，如：`PUT /upload.php HTTP/1.1`；
4. DELETE：用于删除资源，请求的数据会附在 URL 后面，以`?`分割 URL 和请求数据，如：`http://www.example.com/delete.php?id=100`；
5. HEAD：用于获取资源的元信息，与 GET 类似，但不返回响应体，如：`HEAD /get.php?name=value HTTP/1.1`；
6. OPTIONS：用于获取服务器支持的 HTTP 请求方法，如：`OPTIONS /get.php HTTP/1.1`；
7. TRACE：用于追踪路径，用于测试或诊断，如：`TRACE /get.php HTTP/1.1`；
