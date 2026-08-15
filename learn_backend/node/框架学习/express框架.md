---
order: 17
---

# express 框架

## 什么是 express 框架

`express` 是一个基于 Node.js 平台的极简、灵活的 WEB 应用开发框架。[官方网址](https://www.expressjs.com.cn/)

简单来说，`express` 是一个封装好的工具包，封装了很多功能，便于我们开发 WEB 应用（HTTP 服务）

## express 的使用

### express 的下载

`express` 本身是一个 npm 包，所以可以通过 npm 安装

```bash
npm init
npm i express
```

### express 初体验

大家可以按照这个步骤进行操作：

1. 创建 JS 文件，键入如下代码

```js
// 1.导入 express
const express = require('express');

// 2. 创建应用对象
const app = express();

// 3. 创建路由,当遇到get请求且url路径为/home时调用回调函数进行请求处理
app.get('/home', (req, res) => {
  res.end('express hello');
});

// 4. 监听端口 启动服务
app.listen(3000, () => {
  console.log('服务已经启动, 端口监听为 3000...');
});
```

2. 命令行下执行该脚本

```bash
node <文件名>
# 或者
nodemon <文件名>
```

3. 然后在浏览器就可以访问 http://127.0.0.1:3000/home 👌

## express 路由

### 什么是路由

官方定义： 路由确定了应用程序如何响应客户端对特定端点的请求

> 说白了就是请求与服务的映射。规定了什么样的请求该去调用什么样的服务。

### 路由的使用

一个路由的组成有请求方法， 路径和回调函数组成，`express` 中提供了一系列方法，可以很方便的使用路由，使用格式如下：

`app.<method>(path，callback)`

```js
//导入 express
const express = require('express');
//创建应用对象
const app = express();
//创建 get 路由
app.get('/home', (req, res) => {
  res.send('网站首页');
});
//首页路由
app.get('/', (req, res) => {
  res.send('我才是真正的首页');
});
//创建 post 路由
app.post('/login', (req, res) => {
  res.send('登录成功');
});
//匹配所有的请求方法
app.all('/search', (req, res) => {
  res.send('1 秒钟为您找到相关结果约 100,000,000 个');
});
//自定义 404 路由
app.all('*', (req, res) => {
  res.send('<h1>404 Not Found</h1>');
});
// 自定义404路由的其它方式
app.use(function (req, res, next) {
  next(createErrpr(404));
});
app.listen(3000, () => {
  console.log('服务启动');
});
```

### 获取请求参数

`express` 框架封装了一些 API 来方便获取请求报文中的数据，并且兼容原生 HTTP 模块的获取方式

```js
//导入 express
const express = require('express');
//创建应用对象
const app = express();
//获取请求的路由规则
app.get('/request', (req, res) => {
  //1. 获取报文的方式与原生 HTTP 获取方式是兼容的
  console.log(req.method);
  console.log(req.url);
  console.log(req.httpVersion);
  console.log(req.headers);
  //2. express 独有的获取报文的方式
  //获取查询字符串
  console.log(req.query); // 『相对重要』
  // 获取指定的请求头
  console.log(req.get('host'));
  res.send('请求报文的获取');
});
//启动服务
app.listen(3000, () => {
  console.log('启动成功....');
});
```

### 获取路由参数

路由参数指的是 URL 路径中的参数（数据）`:id`是占位符，实际前端传来的 id 最终会记录到`req.params`中

```js
app.get('/:id.html', (req, res) => {
  res.send('商品详情, 商品 id 为' + req.params.id);
});
```

### 小案例

准备 `json` 数据

```json
{
  "singers": [
    {
      "id": 1,
      "name": "John Doe",
      "age": 30,
      "email": "johndoe@example.com",
      "isEmployed": true,
      "skills": ["Java", "Python", "JavaScript"],
      "address": {
        "street": "123 Main St",
        "city": "Anytown",
        "state": "CA",
        "zipCode": "12345"
      }
    },
    {
      "id": 2,
      "name": "Jane Smith",
      "age": 25,
      "email": "janesmith@example.com",
      "isEmployed": false,
      "skills": ["C++", "Ruby", "Markdown"],
      "address": {
        "street": "456 Elm St",
        "city": "Othertown",
        "state": "NY",
        "zipCode": "54321"
      }
    }
  ]
}
```

根据 id 来渲染数据

```js
//导入 express
const express = require('express');
// 获取json数据
const { singers } = require('./singers.json');

//创建应用对象
const app = express();
//创建 get 路由
app.get('/:id.html', (req, res) => {
  // 获取路由参数
  let { id } = req.params;
  // 在数组中寻找对应id的数据
  let result = singers.find((item) => {
    if (item.id === Number(id)) {
      return true;
    }
  });
  if (!result) {
    res.statusCode = 500;
    res.end('404');
  }
  res.end(`<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Document</title>
    </head>
    <body>
      <h2>${result.name}</h2>
      <span>${result.email}</span>
    </body>
  </html>`);
});

app.listen(3000, () => {
  console.log('服务启动');
});
```

## 设置响应

### 设置响应报文

```js
app.get('/respond', (req, res) => {
  // 原生方法
  res.statusCode = 500;
  res.setHeader('aa', 'bb');
  res.statusMessage = 'love';
  res.write('hello express');
  res.end('response');

  // express方法
  res.status(500).set('aa', 'bb');
  res.send('网站首页');
});
```

### 网页重定向

```js
app.get('/respond', (req, res) => {
  // 网页重定向
  res.redirect('https://www.baidu.com');
});
```

![网页重定向](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260107112718447.png)

### 下载文件

```js
app.get('/respond', (req, res) => {
  // 下载文件
  res.download('./singers.json');
});
```

![下载文件](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260107112805094.png)

### 响应 json

```js
app.get('/respond', (req, res) => {
  // 响应json
  res.json({
    name: 'xiaomin',
    age: 18,
  });
});
```

![响应 json](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260107112841424.png)

### 响应静态资源

```js
app.get('/respond', (req, res) => {
   // 静态资源文件
    res.sendFile(__dirname + '/index.html')
  })
})
```

![响应静态资源](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260107112930089.png)

## 中间件

### 中间件介绍

什么是中间件：中间件（`Middleware`）本质是一个回调函数，中间件函数可以像路由回调一样访问请求对象（`request`） ， 响应对象（`response`）。

中间件的作用：中间件的作用就是使用函数封装公共操作，简化代码。比如我可以使用全局中间件在每个请求来的时候记录 `url`，`ip` 等生成访问日志等。在响应时设置字符集为 `utf-8` 等

中间件的类型：

- 全局中间件：也就类似于 JAVAWEB 中的过滤器链，在请求到达路由之前拦截请求做点什么，在响应到达客户端之前拦截响应，做点什么
- 路由中间件：也就类似于 JAVAWEB 中的拦截器，在请求到达接口前做些什么，在响应离开接口后做些什么

### 全局中间件

#### 全局中间件的执行流程

每一个请求到达服务端之后都会执行全局中间件函数

![全局中间件的执行流程](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260107113508082.png)

::: tip Tips
全局中间件是利用的是过滤器链的设计模式，可以有多个，但上一个处理函数需要使用 `next()`调用过滤器链的下一个处理函数，也就是要放行请求
:::

#### 全局中间件的使用

声明中间件函数

```js
// 定义全局中间件函数
function recordMiddleleware(req, res, next) {
  ...
  // 放行当前请求
  next()
}
```

使用全局中间件

```js
// 注册全局中间件
app.use(recordMiddleleware);
```

声明时可以直接将匿名函数传递给 `use`

```js
app.use(function (request, response, next) {
   ...
   next();
})
```

多个全局中间件，`express` 允许使用 `app.use()` 定义多个全局中间件

```js
app.use(function (request, response, next) {
  console.log('定义第一个中间件');
  next();
});
app.use(function (request, response, next) {
  console.log('定义第二个中间件');
  next();
});
```

### 路由中间件

如果只需要对某一些路由进行功能封装，则就需要路由中间件，调用格式如下：

```js
// 定义路由中间件函数
let checkCodeMiddleware = (req, res, next) => {
  // 判断URl中是否code = 521
  if (req.query.code === '521') {
    next();
  } else {
    res.send('暗号错误');
  }
};
// 设置响应报文的两种方法
app.get('/home', checkCodeMiddleware, (req, res) => {
  res.send('前台首页');
});
app.get('/admin', checkCodeMiddleware, (req, res) => {
  res.send('后台首页');
});
```

::: tip Tips
使用路由中间件可以实现权限身份鉴定
:::

### 使用路由中间件可以实现权限身份鉴定

`express` 内置处理静态资源的中间件。静态资源中间件可以设置静态资源根目录，并且自动设置响应静态资源的 MIME 类型，从而简化代码的编写

```js
//导入 express
const express = require('express');
//创建应用对象
const app = express();
// 静态资源中间件,设置静态资源根目录，并自动设置mime类型
app.use(express.static(__dirname + '/public'));

app.listen(3000, () => {
  console.log('服务启动');
});
```

::: warning 注意

1. `index.html` 文件为默认打开的资源
2. 如果静态资源与路由规则同时匹配，谁先匹配谁就响应
3. 路由响应动态资源，静态资源中间件响应静态资源
4. 如果你的静态资源存放在多个目录下面，你可以多次调用 `express.static` 中间件

:::

### 第三方中间件

#### 获取请求体数据 `body-parser`

`express` 可以使用 `body-parser` 包处理请求体

1. 安装：`npm i body-parser`

2. 导入 body-parser 包：`const bodyParser = require('body-parser');`

3. 获取中间件函数

```js
// 处理 querystring 格式的请求体
let urlParser = bodyParser.urlencoded({extended:false}));
// 处理 JSON 格式的请求体
let jsonParser = bodyParser.json();
```

4. 使用中间件：设置路由中间件，然后使用 `request.body` 来获取请求体数据

```js
//导入 express
const express = require('express');
//创建应用对象
const app = express();
// 导入获取请求体中间件
const bodyParser = require('body-parser');
// 创建解析JSON格式的中间件
const jsonParser = bodyParser.json();
// 创建解析queryString的中间件
const urlencodedparser = bodyParser.urlencoded({ extended: false });
// 获取登录页面
app.get('/login', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.post('/login', urlencodedparser, (req, res) => {
  console.log(req.body);
  //用户名
  console.log(req.body.username);
  //密码
  console.log(req.body.password);
  res.send('获取用户数据');
});
app.listen(3000, () => {
  console.log('服务启动');
});
```

获取到的请求体数据：

```js
[Object: null prototype] { username: 'admin', userpass: '123456' }
```

### 使用中间件实现防盗链

#### 防盗链简介

什么是防盗链：防盗链就是防止外部网站盗用本网站资源，对本网站加以保护的一种措施

防盗链的原理：当从一个网站网页向另一个网站发起请求时，请求报文的请求头中的 `Referer` 字段会记录发起请求的网页的协议域名和端口。服务器通过检测 `Referer` 字段的值，来判断请求是否来自规定域名，从而实现资源防盗。所以关键在于获取 `Referer` 字段

#### express 实现防盗链

```js
//导入 express
const express = require('express');
//创建应用对象
const app = express();

// 定义防盗链中间件
const HotlinkProtection = (req, res, next) => {
  // 获取Referer
  let referer = req.get('referer');
  if (referer) {
    // 实例化
    let url = new URL(referer);
    // 获取hostname
    let hostname = url.hostname;
    console.log(hostname);
    // 判断是否合法域名
    if (hostname !== '127.0.0.1') {
      res.status(404).send('<h1>404 Not Found</h1>');
    }
  }
  next();
};
app.use(HotlinkProtection);
// 设置静态资源中间件
app.use(express.static(__dirname + '/public'));
app.listen(3000, () => {
  console.log('服务启动');
});
```

## Router 模块化

### Router 简介

express 中的 Router 是一个完整的中间件和路由系统，是专门管理路由信息的对象。可以看做是一个小型的 app 对象。它能够对路由进行模块化，更好的管理路由

### Router 使用

创建独立的 JS 文件（`homeRouter.js`）,后台模块

```js
const express = require('express');

// 创建路由对象
const router = express.Router();

// 后台
router.get('/admin', (req, res) => {
  res.send('后台首页');
});

router.get('/setting', (req, res) => {
  res.send('后台设置首页');
});
// 导出router对象
module.exports = router;
```

创建独立的 JS 文件（`adminRouter.js`），前台模块

```js
const express = require('express');

// 创建路由对象
const router = express.Router();

// 后台
router.get('/home', (req, res) => {
  res.send('前台首页');
});

router.get('/search', (req, res) => {
  res.send('内容搜索');
});
// 导出router对象
module.exports = router;
```

主文件，导入路由模块

```js
const express = require('express');

// 创建应用对象
const app = express();
// 导入静态资源模块
const adminRouter = require('./routes/adminRouter');
// 导入动态资源模块
const homeRouter = require('./routes/homeRouter');
// 使用静态资源模块
app.use(adminRouter);
// 使用动态资源模块
app.use(homeRouter);
app.listen(3000, () => {
  console.log('服务启动');
});
```

### 为路由路径设置前缀

在 homeRouter 下的路由的路径前缀都会变为以`/home`开头

```js
app.use('/home', homeRouter);
```

比如`homeRouter`中的文件为

```js
router.get('/admin', (req, res) => {
  res.send('后台首页');
});
```

实际上为

```js
router.get('/home/admin', (req, res) => {
  res.send('后台首页');
});
```
