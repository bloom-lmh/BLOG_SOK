var createError = require('http-errors');
// 导入express模块
var express = require('express');
// 导入path模块
var path = require('path');
// 导入cookie解析模块
var cookieParser = require('cookie-parser');
var logger = require('morgan');
// 导入express-session
const session = require('express-session');
// 导入connect-mongo工具
const MongoStore = require('connect-mongo');
// 导入db配置文件
const config = require('./config/config');
// 导入account api路由
var accountRouter = require('./routes/api/account');
// 导入account静态页面路由
var indexRouter = require('./routes/web/index');
// 导入登录注册路由
var authRouter = require('./routes/web/auth');

// 创建express应用
var app = express();

// 使用express-session全局中间件
app.use(
  session({
    // sid:session的id，该部分在用户首次登录后会作为cookie返回前端，以后每次前端请求接口时都会携带sid
    name: 'sid',
    // session的id的加密秘钥
    secret: 'atguigu',
    // 是否为每次请求都设置一个cookie用来存储session的id
    saveUninitialized: false,
    // 开启刷新session
    resave: true,
    // session存储配置
    store: MongoStore.create({
      mongoUrl: `mongodb://${config.DBHOST}/${config.DBNAME}`,
    }),
    // 设置响应的cookie的特性
    cookie: {
      // 开启后前端无法通过 JS 操作
      httpOnly: true,
      // 设置cookie的过期时间，同时也是对应session的过期时间 10分钟
      maxAge: 1000 * 60 * 10,
    },
  })
);

// 设置ejs视图引擎
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
// 使用请求体解析中间件
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// 使用静态资源中间件，配置静资源目录
app.use(express.static(path.join(__dirname, 'public')));

// 使用路由
app.use('/api/account', accountRouter);
app.use('/', indexRouter);
app.use(authRouter);
// 404页面全局中间件
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
