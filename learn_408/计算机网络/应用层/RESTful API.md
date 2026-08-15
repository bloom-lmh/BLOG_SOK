---
order: 383
---

# RESTful API

[[toc]]

## RESTful API 核心概念

REST​（Representational State Transfer）是一种架构风格，​ 不是协议或标准，其核心原则包括：

- 资源导向：所有数据/服务抽象为资源（如 /users、/products），每个资源有唯一标识符（URI）
- 统一接口：使用统一的接口，对资源进行操作，如 GET、POST、PUT、DELETE
- 无状态性：服务端不保存客户端的状态，每次请求都需要包含所有必要的信息
- 可缓存性：客户端可以对响应进行缓存，减少响应时间
- 分层系统：客户端无需关心是否直接连接最终服务器（可经代理/CDN）

## HTTP 与 RESTful 的关系

HTTP 是 REST 的实现载体，REST 是一种设计理念，而 HTTP 协议天然支持 REST 的核心原则：

- HTTP 的 GET/POST/PUT/DELETE 对应对资源的 CRUD 操作
- HTTP 的 URI 标识资源路径
- HTTP 头支持缓存控制（如 ETag、Last-Modified）
