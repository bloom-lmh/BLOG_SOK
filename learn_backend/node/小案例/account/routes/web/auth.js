var express = require('express')
// 导入MD5进行加密
var md5 = require('md5')
// 创建路由对象
var router = express.Router()

//导入 用户的模型
const UserModel = require('../../modules/UserModel')
// 路由注册页面
router.get('/reg', (req, res) => {
  res.render('auth/reg')
})
// 路由处理注册请求
router.post('/reg', (req, res) => {
  console.log(req.body)
  // todo注册信息合法性校验
  UserModel.create({ ...req.body, password: md5(req.body.password) }, (err, data) => {
    if (err) {
      res.render('fail', { msg: '注册失败', url: '/reg' })
      return
    }
    res.render('success', { msg: '注册成功', url: '/login' })
  })
})
// 路由登录页面
router.get('/login', (req, res) => {
  res.render('auth/login')
})

// 路由处理登录请求
router.post('/login', (req, res) => {
  // 获取用户名密码
  let { username, password } = req.body
  console.log(username)
  // 根据用户名查询用户
  UserModel.findOne({ username: username }, (err, data) => {
    if (err) {
      res.render('fail', { msg: '用户不存在，登录失败', url: '/login' })
    }
    // 用户名存在比较密码
    if (md5(password) !== data.password) {
      res.render('fail', { msg: '密码错误，登录失败', url: '/login' })
    }

    // 记录Session中的用户名和id作为访问接口的依据
    req.session.username = data.username
    req.session._id = data._id

    res.render('success', { msg: '登录成功', url: '/account' })
  })
})
// 退出登录
router.get('/logout', (req, res) => {
  // 清除session
  req.session.destroy(() => {
    res.render('success', { msg: '退出成功', url: '/login' })
  })
})
module.exports = router
