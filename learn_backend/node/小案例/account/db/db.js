//导入 mongoose
const mongoose = require('mongoose')
// 导入配置文件
const config = require('../config/config')
// 导出db
module.exports = function (success, error) {
  // 为error设置默认值
  if (typeof error !== 'function') {
    error = () => {
      console.log('连接失败')
    }
  }
  //连接 mongodb 服务                        数据库的名称
  mongoose.connect(`mongodb://${config.DBHOST}:${config.DBPORT}/${config.DBNAME}`)

  // 设置连接成功的回调  once 一次   事件回调函数只执行一次
  mongoose.connection.once('open', success)
  // 设置连接失败的回调
  mongoose.connection.on('error', error)
  // 设置连接关闭的回调
  mongoose.connection.on('close', () => {
    console.log('连接关闭')
  })
}
