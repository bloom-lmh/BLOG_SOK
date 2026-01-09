// 导入mongoose
const mongoose = require('mongoose')

// 创建Account文档模型的对象
let AccountSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  // 时间
  time: Date,
  // 类型
  type: {
    type: Number,
    default: -1
  },
  // 金额
  account: {
    type: Number,
    require: true
  },
  // 备注
  remarks: {
    type: String
  }
})

//创建模型对象  对文档操作的封装对象,第一个参数为集合名,第二个参数为文档模式对象
let AccountModel = mongoose.model('account', AccountSchema)

// 导出模型对象
module.exports = AccountModel
