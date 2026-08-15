---
order: 18
---

# ejs 模板引擎

## ejs 介绍

什么是模板引擎：模板引擎是分离用户界面和业务数据的一种技术
什么是 EJS：EJS 是一个高效的 Javascript 的模板引擎

[官方网站](https://ejs.bootcss.com/)

## ejs 初体验

1. 下载安装 EJS：`npm i ejs --save`

代码示例

::: code-group

```html [ejs文件]
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <h2>我爱你 <%= china %></h2>
  </body>
</html>
```

```js [js文件]
// 导入fs
const fs = require('fs');
// 字符串
let china = '中国';
// 读取html文件
let str = '';
try {
  str = fs.readFileSync('./01_html.html').toString();
} catch (error) {
  console.log(error);
}

// 使用ejs 渲染，对于有<%= china %>的地方就会被填上china值
let result = ejs.render(str, { china: china });

console.log(result);
```

:::

## ejs 常用语法

### 输出内容

`<%= 要输出的变量 %>`

### 循环输出

::: code-group

```html [ejs模板]
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <ul>
      <% xiyou.forEach(item=> {%>
      <li><%= item %></li>
      <% }) %>
    </ul>
  </body>
</html>
```

```js [js文件]
// 导入ejs
const ejs = require('ejs');

// 导入fs
const fs = require('fs');
// 字符串
let xiyou = ['唐生', '猪八戒', '孙悟空'];
let html = '';
try {
  html = fs.readFileSync('./02_html.html').toString();
} catch (error) {
  console.log(error);
}

// 使用ejs 渲染
let result = ejs.render(html, { xiyou: xiyou });

console.log(result);
```

:::

### 条件渲染

::: code-group

```html [ejs模板]
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <% if(isLogin){ %>
    <span>欢迎登录</span>
    <% }else{ %>
    <span>登录失败</span>
    <% } %>
  </body>
</html>
```

```js [js文件]
// 导入ejs
const ejs = require('ejs');

// 导入fs
const fs = require('fs');

let isLogin = true;

let html = '';
try {
  html = fs.readFileSync('./03_html.html').toString();
} catch (error) {
  console.log(error);
}
// 使用ejs 渲染
let result = ejs.render(html, { isLogin });

console.log(result);
```

:::

## express 中使用 ejs

### 初体验

在 `views` 文件下创建 `ejs` 模板文件，文件为 `home.ejs`

```js
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <%= title%>
  </body>
</html>
```

编写 js 文件

```js
// 导入express
const express = require('express');
const app = express();
const port = 3000;

// 导入ejs
const ejs = require('ejs');

// 导入path模块
const path = require('path');
// 1.设置模板引擎
app.set('view engine', 'ejs');

// 2.设置模板文件存放位置
app.set('views', path.resolve(__dirname, './views'));

// 创建路由
app.get('/home', (req, res) => {
  // 3.render响应
  let title = '希望';
  res.render('home', { title });
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
```

::: tip 关于 set 函数
set 函数是 express 用来设置配置的函数，第一个参数是配置项，第二个参数是配置值。

```js
const express = require('express');
const path = require('path'); // 用于处理路径
const app = express();

// ─────────────────────────────────────────────────────
// 1. 视图 (View) 相关配置
// ─────────────────────────────────────────────────────

// 设置视图文件存放的目录
// 默认就是 'views'，如果放在其他文件夹（如 'templates'）则需要指定
app.set('views', path.join(__dirname, 'views'));

// 设置默认的模板引擎
// 这样在 res.render('index') 时，Express 会自动查找 index.ejs 并使用 EJS 引擎解析
app.set('view engine', 'ejs');

// 设置是否缓存视图模板（编译后的函数）
// 生产环境建议开启 (true) 以提升性能，开发环境设为 false 可以实时看到模板修改效果
app.set('view cache', false);

// ─────────────────────────────────────────────────────
// 2. 网络与安全 (Network & Security) 相关配置
// ─────────────────────────────────────────────────────

// 控制是否在 HTTP 响应头中显示 "X-Powered-By: Express"
// 出于安全考虑（避免暴露技术栈），通常建议在生产环境中关闭
app.set('x-powered-by', false);

// 配置 ETag (实体标签) 行为
// true: 启用（默认，强校验）
// false: 禁用
// 'strong': 强校验
// 'weak': 弱校验
app.set('etag', true);

// 配置反向代理信任设置
// 如果你的应用部署在 Nginx 或负载均衡器后面，设为 true 可以让 req.ip 获取真实的客户端 IP
// 也可以设为 'loopback' (仅信任 localhost) 或具体的 IP 数组
app.set('trust proxy', false); // 开发环境通常关闭

// ─────────────────────────────────────────────────────
// 3. 路由 (Routing) 相关配置
// ─────────────────────────────────────────────────────

// 路由是否区分大小写
// false: /user 和 /User 被视为同一个路由 (默认)
// true: /user 和 /User 被视为不同路由
app.set('case sensitive routing', false);

// 路由是否严格匹配
// false: /user 和 /user/ 会被路由到同一个处理函数 (默认)
// true: /user 和 /user/ 被视为不同路径，需要分别定义
app.set('strict routing', false);

// ─────────────────────────────────────────────────────
// 4. 查询参数解析配置
// ─────────────────────────────────────────────────────

// 设置查询字符串的解析方式
// 'extended': 使用 qs 库，支持深层嵌套对象 (如 color[name]=blue)
// 'simple': 使用 querystring 库，不支持深层嵌套 (如 color=blue)
app.set('query parser', 'extended');

// ─────────────────────────────────────────────────────
// 5. 环境配置 (通常建议通过系统环境变量设置，框架会自动读取，但也可以手动覆盖)
// ─────────────────────────────────────────────────────

// 设置当前运行环境
// 这会影响内置中间件的行为（例如错误处理中间件在 development 环境下会输出堆栈信息）
// 通常不需要手动设置，Express 会自动读取 process.env.NODE_ENV
app.set('env', process.env.NODE_ENV || 'development');

// ─────────────────────────────────────────────────────
// 6. 自定义配置 (任意键值对)
// ─────────────────────────────────────────────────────
// 这些不是 Express 的内置指令，但你可以用 set/get 来存储应用级的配置
app.set('myAppTitle', '我的博客系统');
app.set('uploadDir', path.join(__dirname, 'public/uploads'));

// 启动服务器
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);

  // 演示如何获取自定义配置
  console.log(`应用名称: ${app.get('myAppTitle')}`);
});
```

:::

### 使用 express-generator 工具

使用该工具可以快速创建好支持 ejs 的项目骨架

1. 全局安装 express-generator：`npm i -g express-generator`
2. 使用 express 命令创建项目：`express -e [文件位置]`
3. 初始化依赖`npm i`
4. 启动项目：在 package.json 文件更改启动命令为 nodemon 使用 `npm start` 启动
