---
order: 385
---

# MIME 类型

[[toc]]

## 基本概念

HTTP 请求/响应体中的数据格式由`Content-Type`头字段指定的 MIME 类型（如`application/json`、`multipart/form-data`）决定，它采用`type/subtype`格式明确告知通信双方如何解析数据，确保客户端和服务端能正确处理不同格式的内容。常见的 MIME 类型如下：

| **MIME 类型**                       | **用途**           | **示例场景**                   |
| ----------------------------------- | ------------------ | ------------------------------ |
| `text/html`                         | HTML 网页          | 网页渲染（`<html>...</html>`） |
| `text/css`                          | CSS 样式表         | 网页样式（`style.css`）        |
| `application/json`                  | JSON 数据          | API 响应（`{"name": "John"}`） |
| `application/javascript`            | JavaScript 代码    | 前端脚本（`app.js`）           |
| `image/jpeg`                        | JPEG 图片          | 照片（`.jpg`）                 |
| `image/png`                         | PNG 图片           | 透明背景图片（`.png`）         |
| `application/pdf`                   | PDF 文档           | 电子书/合同（`.pdf`）          |
| `application/x-www-form-urlencoded` | 表单提交（键值对） | `name=John&age=30`             |
| `multipart/form-data`               | 文件上传表单       | `<input type="file">`          |
| `application/octet-stream`          | 任意二进制文件     | 下载文件（`.exe`, `.zip`）     |

## 应用场景

### JSON 数据提交-application/json

- 用途 ​：用于传输 JSON 数据，可用于 API 接口、Web 应用等
- 数据格式 ​：JSON 格式的字符串

```bash
POST /api HTTP/1.1
Content-Type: application/json

{
  "name": "John",
  "age": 30
}
```

- 前端发送案例：

::: code-group

```js [方法1：Fetch API]
const data = {
  username: '张三',
  age: 25,
  hobbies: ['阅读', '编程'],
};

fetch('/api/user', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data), // 必须手动序列化
}).then((response) => response.json());
```

```js [方法2：Axios]
axios.post('/api/user', {
  username: '张三',
  age: 25,
}); // 自动设置Content-Type和序列化
```

:::

### 默认表单提交-application/x-www-form-urlencoded

- 用途 ​：HTTP ​ 默认的表单提交格式，适用于纯文本数据（无文件上传）
- 数据格式 ​：键值对编码为 key1=value1&key2=value2。特殊字符（如空格、中文）会被 URL 编码（如空格 →%20）

```bash
POST /submit HTTP/1.1
Content-Type: application/x-www-form-urlencoded

```

- 前端发送案例：

::: code-group

```html [方法1：原生HTML表单（默认行为）​]
<form action="/submit" method="post">
  <!-- 默认enctype即为x-www-form-urlencoded -->
  <input type="text" name="username" placeholder="用户名" />
  <input type="number" name="age" placeholder="年龄" />
  <button type="submit">提交</button>
</form>
```

```js [方法2：JavaScript（Fetch API）​]
const data = new URLSearchParams();
data.append('username', '张三'); // 自动处理中文编码
data.append('age', '30');

fetch('/submit', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: data, // 自动转为键值对字符串
});
```

:::

- 请求示例：

```bash
POST /submit HTTP/1.1
Content-Type: application/x-www-form-urlencoded

username=%E5%BC%A0%E4%B8%89&age=30  # 中文被URL编码
```

- 后端接受案例：

```js
const express = require('express');
const app = express();

// 需使用中间件解析urlencoded数据
app.use(express.urlencoded({ extended: true }));

app.post('/submit', (req, res) => {
  console.log(req.body); // { username: '张三', age: '30' }
  res.send('数据已接收');
});
```

### 文件上传-multipart/form-data

这里要重点介绍下`multipart/form-data`

- 用途 ​：专门用于文件上传或混合数据提交 ​（如表单含文件+文本）
- 格式 ​：将数据分割为多个 ​boundary（边界）分隔的部分，每部分可独立设置：

```bash
Content-Disposition: form-data; name="字段名"
Content-Type: 当前部分的数据类型（如image/png）
```

- 前端发送案例：

::: code-group

```html [方式一：原生HTML表单]
<form action="/upload" method="post" enctype="multipart/form-data">
  <input type="text" name="username" placeholder="用户名" />
  <input type="file" name="avatar" accept="image/*" />
  <button type="submit">提交</button>
</form>
```

```js [方式二：JavaScript（Fetch API）​]
const formData = new FormData();
formData.append('username', '张三'); // 文本字段
formData.append('avatar', fileInput.files[0]); // 文件字段

fetch('/upload', {
  method: 'POST',
  body: formData, // 无需手动设置Content-Type！
  // 浏览器会自动添加：
  // Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryxxx
}).then((response) => response.json());
```

:::

- 请求示例：

```bash
POST /upload HTTP/1.1
Content-Type: multipart/form-data; boundary=----WebKitFormBoundaryABC123

------WebKitFormBoundaryABC123
Content-Disposition: form-data; name="username"

张三
------WebKitFormBoundaryABC123
Content-Disposition: form-data; name="avatar"; filename="photo.jpg"
Content-Type: image/jpeg

<二进制文件数据>
------WebKitFormBoundaryABC123--
```

- 后端接收案例：

```js
const express = require('express');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // 文件存储目录

app.post('/upload', upload.single('avatar'), (req, res) => {
  console.log(req.body.username); // 文本字段
  console.log(req.file); // 文件信息（路径、大小等）
  res.send('上传成功');
});
```
