---
order: 22
---

# RESTful API

## RESTful API 简介

### 什么是 RESTful API

RESTful API 是一种特殊风格的接口，左边例子是传统风格，右边是 restful 风格

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260109193740936.png)

## RESTful API 的特点

### 路径规范

路径又称"终点"（endpoint），表示 API 的具体网址。

在 RESTful 架构中，每个网址代表一种资源（resource），所以网址中不能有动词，只能有名词，例如 get , add , edit，delete 等这些都不能有，而且所用的名词往往与数据库的表格名对应。一般来说，数据库中的表都是同种记录的"集合"（collection），所以 API 中的名词也应该使用复数。

举例来说，有一个 API 提供动物园（zoo）的信息，还包括各种动物和雇员的信息，则它的路径应该设计成下面这样。

- https://api.example.com/v1/zoos
- https://api.example.com/v1/animals
- https://api.example.com/v1/employees

### 请求方法规范

操作资源要与 HTTP 请求方法对应

- GET（SELECT）：从服务器取出资源（一项或多项）。
- POST（CREATE）：在服务器新建一个资源。
- PUT（UPDATE）：在服务器更新资源（客户端提供改变后的完整资源）。
- PATCH（UPDATE）：在服务器更新资源（客户端提供改变的属性）。
- DELETE（DELETE）：从服务器删除资源。

### 响应状态码规范

常见的状态码如下

- 200 OK - [GET]：服务器成功返回用户请求的数据，该操作是幂等的（Idempotent）。
- 201 CREATED - [POST/PUT/PATCH]：用户新建或修改数据成功。
- 202 Accepted - [*]：表示一个请求已经进入后台排队（异步任务）
- 204 NO CONTENT - [DELETE]：用户删除数据成功。
- 400 INVALID REQUEST - [POST/PUT/PATCH]：用户发出的请求有错误，服务器没有进行新建或修改数据的操作，该操作是幂等的。
- 401 Unauthorized - [*]：表示用户没有权限（令牌、用户名、密码错误）。
- 403 Forbidden - [*] 表示用户得到授权（与 401 错误相对），但是访问是被禁止的。
- 404 NOT FOUND - [*]：用户发出的请求针对的是不存在的记录，服务器没有进行操作，该操作是幂等的。
- 406 Not Acceptable - [GET]：用户请求的格式不可得（比如用户请求 JSON 格式，但是只有 XML 格式）。
- 410 Gone -[GET]：用户请求的资源被永久删除，且不会再得到的。
- 422 Unprocesable entity - [POST/PUT/PATCH] 当创建一个对象时，发生一个验证错误。
- 500 INTERNAL SERVER ERROR - [*]：服务器发生错误，用户将无法判断发出的请求是否成功。

状态码的完全列表参见[这里](http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html)。

### 版本号规范

应该将 API 的版本号放入 URL：`https://api.example.com/v1/`

## Json-server 工具快速搭建接口

json-server 本身是一个 JS 编写的工具包，可以快速搭建 RESTful API 服务

官方地址: [https://github.com/typicode/json-server](https://github.com/typicode/json-server)

操作步骤：

全局安装 json-server：`npm i -g json-server`

创建 JSON 文件（db.json），编写基本结构

```json
{
  "posts": [
    { "id": "1", "title": "a title" },
    { "id": "2", "title": "another title" }
  ],
  "comments": [
    { "id": "1", "text": "a comment about post 1", "postId": "1" },
    { "id": "2", "text": "another comment about post 1", "postId": "1" }
  ],
  "profile": {
    "name": "typicode"
  }
}
```

以 JSON 文件所在文件夹作为工作目录，执行如下命令：`json-server --watch db.json`

## 接口测试工具

介绍几个接口测试工具

- apipost [https://www.apipost.cn/](https://www.apipost.cn/) (中文)
- apifox [https://www.apifox.cn/](https://www.apifox.cn/) (中文)
- postman [https://www.postman.com/](https://www.postman.com/) (英文)

## API 文档

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260109194145189.png)

## 记账本项目开发 RESTful api

在 `routes` 下的 api 文件夹下新建 `account.js` 将原本和页面路由混合在一起的接口抽离出来

```js
var express = require('express');

var router = express.Router();

// 导入文档模型
const AccountModel = require('../../modules/AccountModle');
// 导入moment模块处理时间
const moment = require('moment');

// 获取账单列表
router.get('/list', function (req, res, next) {
  // 查询数据库数据
  AccountModel.find()
    .sort({ time: -1 })
    .exec((err, data) => {
      if (err) {
        res.json({
          code: '1001',
          msg: '查询账单列表失败',
          data: '',
        });
        return;
      }
      res.json({
        code: '0000',
        msg: '查询账单列表成功',
        data: data,
      });
    });
});

// 添加账单
router.post('/add', (req, res) => {
  // todo 表单数据合法性验证
  // 插入数据库
  AccountModel.create(
    {
      ...req.body,
      time: moment(req.body.time).toDate(),
    },
    (err, data) => {
      if (err) {
        res.json({ code: '1002', msg: '添加账单列表失败', data: '' });
        return;
      }
      res.json({ code: '0000', msg: '添加账单列表成功', data: '' });
    }
  );
});
// 根据id删除账单
router.delete('/delete/:id', (req, res) => {
  let { id } = req.params;
  AccountModel.deleteOne({ _id: id }, (err, data) => {
    if (err) {
      res.json({ code: '1003', msg: '账单删除失败', data: '' });
    }
    res.json({ code: '0000', msg: '账单删除成功', data: '' });
  });
});
// 获取单条数据
router.get('/get/:id', (req, res) => {
  let { id } = req.params;
  AccountModel.findById(id, (err, data) => {
    if (err) {
      res.json({ code: '1004', msg: '单条账单查询失败', data: '' });
      return;
    }
    res.json({ code: '0000', msg: '单条账单查询成功', data: data });
  });
});
// 更新账单接口
router.patch('/update/:id', (req, res) => {
  let { id } = req.params;
  AccountModel.updateOne({ _id: id }, req.body, (err, data) => {
    if (err) {
      res.json({ code: '1005', msg: '账单更新失败', data: '' });
      return;
    }
    // 获取更新后的结果
    AccountModel.findById(id, (err, data) => {
      if (err) {
        res.json({ code: '1004', msg: '账单查询失败', data: '' });
      }
      console.log(data);
      res.json({ code: '0000', msg: '账单更新成功', data: data });
    });
  });
});
module.exports = router;
```
