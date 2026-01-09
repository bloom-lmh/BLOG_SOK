var express = require('express')

var router = express.Router()
// 导入lowdb
// const low = require('lowdb')
// 导入lowdb模块
// const FileSync = require('lowdb/adapters/FileSync')
// const adapter = new FileSync(__dirname + '/../data/db.json')
// const db = low(adapter)
// 导入shortid
// let shortid = require('shortid')

// 导入文档模型
const AccountModel = require('../../modules/AccountModel')
// 导入moment模块处理时间
const moment = require('moment')

// 获取账单列表
router.get('/list', function (req, res, next) {
  // 获取数据
  // let accounts = db.get('accounts').value()
  AccountModel.find()
    .sort({ time: -1 })
    .exec((err, data) => {
      if (err) {
        res.status(500).send('列表读取失败')
      }
      res.render('list', { accounts: data, moment: moment })
    })
})
// 添加账单表单
router.get('/account', function (req, res, next) {
  res.render('create')
})

// 添加账单
router.post('/account', (req, res) => {
  // let id = shortid.generate()
  // let data = db
  //   .get('accounts')
  //   .unshift({ id: id, ...req.body })
  //   .write()
  // if (data) {
  //   res.render('success', { msg: '添加成功', url: '/account' })
  // } else {
  //   res.render('fail', { msg: '添加失败', url: '/account' })
  // }

  // 插入数据库
  AccountModel.create(
    {
      ...req.body,
      time: moment(req.body.time).toDate()
    },
    (err, data) => {
      if (err) {
        res.render('fail', { msg: '添加失败', url: '/account' })
      }
      res.render('success', { msg: '添加成功', url: '/account' })
    }
  )
})
// 删除账单
router.get('/account/:id', (req, res) => {
  let id = req.params.id

  // let data = db.get('accounts').remove({ id }).write()
  // if (data) {
  //   res.render('success', { msg: '删除成功', url: '/account' })
  // } else {
  //   res.render('fail', { msg: '删除失败', url: '/account' })
  // }
  AccountModel.deleteOne({ _id: id }).exec((err, data) => {
    ;(err, data) => {
      if (err) {
        res.render('fail', { msg: '删除失败', url: '/account' })
      }
      res.render('success', { msg: '删除成功', url: '/account' })
    }
  })
})
module.exports = router
