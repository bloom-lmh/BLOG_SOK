var express = require('express')

var router = express.Router()
// 导入登录检测中间件
const checkLoginMiddleWare = require('../../middlewares/checkLoginMiddleWare')

// 导入文档模型
const AccountModel = require('../../modules/AccountModel')
// 导入moment模块处理时间
const moment = require('moment')

// 获取账单列表
router.get('/list', checkLoginMiddleWare, function (req, res, next) {
  // 查询数据库数据
  AccountModel.find()
    .sort({ time: -1 })
    .exec((err, data) => {
      if (err) {
        res.json({
          code: '1001',
          msg: '查询账单列表失败',
          data: ''
        })
        return
      }
      res.json({
        code: '0000',
        msg: '查询账单列表成功',
        data: data
      })
    })
})

// 添加账单
router.post('/add', checkLoginMiddleWare, (req, res) => {
  // todo 表单数据合法性验证
  // 插入数据库
  AccountModel.create(
    {
      ...req.body,
      time: moment(req.body.time).toDate()
    },
    (err, data) => {
      if (err) {
        res.json({ code: '1002', msg: '添加账单列表失败', data: '' })
        return
      }
      res.json({ code: '0000', msg: '添加账单列表成功', data: '' })
    }
  )
})
// 根据id删除账单
router.delete('/delete/:id', checkLoginMiddleWare, (req, res) => {
  let { id } = req.params
  AccountModel.deleteOne({ _id: id }, (err, data) => {
    if (err) {
      res.json({ code: '1003', msg: '账单删除失败', data: '' })
    }
    res.json({ code: '0000', msg: '账单删除成功', data: '' })
  })
})
// 获取单条数据
router.get('/get/:id', checkLoginMiddleWare, (req, res) => {
  let { id } = req.params
  AccountModel.findById(id, (err, data) => {
    if (err) {
      res.json({ code: '1004', msg: '单条账单查询失败', data: '' })
      return
    }
    res.json({ code: '0000', msg: '单条账单查询成功', data: data })
  })
})
// 更新账单接口
router.patch('/update/:id', checkLoginMiddleWare, (req, res) => {
  let { id } = req.params
  AccountModel.updateOne({ _id: id }, req.body, (err, data) => {
    if (err) {
      res.json({ code: '1005', msg: '账单更新失败', data: '' })
      return
    }
    // 获取更新后的结果
    AccountModel.findById(id, (err, data) => {
      if (err) {
        res.json({ code: '1004', msg: '账单查询失败', data: '' })
      }
      console.log(data)
      res.json({ code: '0000', msg: '账单更新成功', data: data })
    })
  })
})
module.exports = router
