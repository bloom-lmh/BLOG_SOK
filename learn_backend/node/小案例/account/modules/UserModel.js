// 导入mongoose
const mongoose = require('mongoose')

// 创建book文档模型的对象
let UserSchema = new mongoose.Schema({
  username: String,
  password: String
})

//创建模型对象  对文档操作的封装对象
let UserModel = mongoose.model('user', UserSchema)

// 导出模型对象
module.exports = UserModel
