---
order: 23
---

# node 中使用 mongodb

## 环境准备

### 下载 MongoDB

[下载地址](https://www.mongodb.com/try/download/community)

建议选择 zip 类型， 通用性更强

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260109201435384.png)

将压缩包移动到 `C:\Program Files` 下，然后解压。创建`C:\data\db` 目录，mongodb 会将数据默认保存在这个文件夹

### MongoDB 配置环境变量

配置 MONGODB_HOME 作为文件根目录

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260109201521526.png)

将 bin 目录配置到环境变量

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260109201530677.png)

运行命令 mongod，看到最后的 `waiting for connections` 则表明服务已经启动成功

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260109201544486.png)

开启新窗口，然后可以使用 mongo 命令连接本机的 mongodb 服务，在此就可以在这个界面使用命令行操作数据库了

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260109201554274.png)

## MongoDB 介绍

### 什么是 MongoDB 数据库

MongoDB 是一个基于分布式文件存储的数据库。由 C++语言编写。旨在为 WEB 应用提供可扩展的高性能数据存储解决方案。

MongoDB 是一个介于关系数据库和非关系数据库之间的产品，是非关系数据库当中功能最丰富，最像关系数据库的。它支持的数据结构非常松散，是类似 json 的[bson](https://baike.baidu.com/item/bson/0?fromModule=lemma_inlink)格式，因此可以存储比较复杂的数据类型。Mongo 最大的特点是它支持的查询语言非常强大，其语法有点类似于面向对象的查询语言，几乎可以实现类似关系数据库单表查询的绝大部分功能，而且还支持对数据建立索引。

[MongoDB 开发者平台](https://www.mongodb.com/)

### MongoDB 的使用原理

所谓面向集合，意思是数据被分组存储在数据集中，被称为一个集合。每个集合在数据库中都有一个唯一的标识名，并且可以包含无限数目的文档。集合的概念类似关系型数据库里的表，不同的是它不需要定义任何模式（schema）。Nytro MegaRAID 技术中的闪存高速缓存算法，能够快速识别数据库内大数据集中的热数据，提供一致的性能改进。

模式自由，意味着对于存储在 mongodb 数据库中的文件，我们不需要知道它的任何结构定义，即不需要模式的定义，结构可以随时变化。如果需要的话，你完全可以把不同结构的文件存储在同一个数据库里。

存储在集合中的文档，被存储为[键-值对](https://baike.baidu.com/item/键-值对/14818783?fromModule=lemma_inlink)的形式。键用于唯一标识一个文档，为字符串类型，而值则可以是各种复杂的文件类型。我们称这种存储形式为[BSON](https://baike.baidu.com/item/BSON/0?fromModule=lemma_inlink)（Binary Serialized Document Format）。

总结起来 MongoDB 的三个重要概念为

1. 数据库（database） 数据库是一个数据仓库，数据库中可以存放很多集合
2. 集合（collection） 集合类似于 JS 中的数组，在集合中可以存放很多文档，也就是类似于 MYSQL 的表，不同的是它不需要定义任何模式（schema)
3. 文档（document） 文档是数据库中的最小单位，类似于 JS 中的对象，也就是 MYSQL 的元组

一般情况下，一个项目使用一个数据库，一个集合会存储同一种类型的数据

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260109202100727.png)

JSON 文件示例：

大家可以通过 JSON 文件来理解 Mongodb 中的概念。一个 JSON 文件好比是一个数据库，一个 Mongodb 服务下可以有 N 个数据库。JSON 文件中的一级属性的数组值好比是集合；数组中的对象好比是文档；对象中的属性有时也称之为字段

```json
// 一个数据库
{
  // accounts集合
  "accounts": [
    // accounts集合的一个文档（对象）
    {
      "id": "3-YLju5f3",
      "title": "买电脑",
      "time": "2023-02-08"
    },
    // accounts集合的一个文档（对象）
    {
      "id": "3-YLju5f4",
      "title": "请女朋友吃饭",
      "time": "2023-02-08"
    }
  ],
  // users集合
  "users": [
    // users集合的一个文档（对象）
    {
      "id": 1,
      "name": "zhangsan",
      "age": 18
    },
    // users集合的一个文档（对象）
    {
      "id": 2,
      "name": "lisi",
      "age": 20
    }
  ]
}
```

### 使用场景

MongoDB 已经在多个站点部署，其主要场景如下：

1. 网站实时数据处理。它非常适合实时的插入、更新与查询，并具备网站实时数据存储所需的复制及高度伸缩性。
2. 缓存。由于性能很高，它适合作为信息基础设施的缓存层。在系统重启之后，由它搭建的持久化缓存层可以避免下层的数据源过载。
3. 高伸缩性的场景。非常适合由数十或数百台服务器组成的数据库，它的路线图中已经包含 MapReduce 引擎的内置支持。

不适用的场景如下：

1. 要求高度事务性的系统。
2. 传统的商业智能应用。
3. 复杂的跨文档（表）级联查询。

## 命令行交互

[官方文档](https://mongoing.com/docs/)

### 数据库命令

| 命令                           | 意义                                                 |
| ------------------------------ | ---------------------------------------------------- |
| `mongo`                        | 连接数据库                                           |
| `show dbs`                     | 显示所有的数据库                                     |
| `use 数据库名`                 | 切换到指定的数据库，如果数据库不存在会自动创建数据库 |
| `db`                           | 显示当前所在的数据库                                 |
| `use 库名` `db.dropDatabase()` | 删除当前数据库                                       |

### 集合相关命令

| 命令                                    | 意义                                               |
| --------------------------------------- | -------------------------------------------------- |
| `db.createCollection('集合名称')`       | 创建集合，mongodb 会使用集合的名称的复数来创建集合 |
| `show collections`                      | 显示当前数据库中的所有集合                         |
| `db.集合名.drop()`                      | 删除某个集合                                       |
| `db.集合名.renameCollection('newName')` | 重命名集合                                         |

::: warning 注意

mongodb 会使用集合的名称的复数来创建集合，即若遇到单数名词在创建时也会自动转为复数

:::

### 文档命令

| 命令                                                                                  | 意义     |
| ------------------------------------------------------------------------------------- | -------- |
| `db.集合名.insert(文档对象);`                                                         | 插入文档 |
| `db.集合名.find(查询条件)` `_id 是 mongodb 自动生成的唯一编号，用来唯一标识文档`      | 查询文档 |
| `db.集合名.update(查询条件,新的文档) db.集合名.update({name:'张三'},{$set:{age:19}})` | 更新文档 |
| `db.集合名.remove(查询条件)`                                                          | 删除文档 |

## Mongoose

### Mongoose 的简介

什么是 mongoose ：Mongoose 是一个对象文档模型库，也就是操作 mongodb 的软件。[官网](https://mongoosejs.net/)

作用：方便使用代码操作 mongodb 数据库

### Mongoose 使用流程

#### 下载并导入 mongoose 模块

下载：`npm i mongoose`
导入：`const mongoose = require('mongoose')`

#### 创建连接

```js
// 创建链接
mongoose.connect('mongodb://127.0.0.1:27017/test');
// 设置连接成功的回调
mongoose.connection.on('open', () => {
  console.log('连接成功');
});
// 4.设置连接失败的回调,这里推荐使用once，而非on是因为once只执行一次
mongoose.connection.once('error', () => {
  console.log('连接失败');
});
// 5.设置连接关闭的回调
mongoose.connection.on('close', () => {
  console.log('关闭连接');
});
```

#### 创建文档模型

```js
//  创建文档的模式
let BookSchema = new mongoose.Schema({
  name: String,
  author: String,
  price: Number,
});
// 创建文档模型对象，该对象能够完成对文档的操作
let BookModel = mongoose.model('books', BookSchema);
//  新增文档
BookModel.create(
  {
    name: '西游记',
    author: '吴承恩',
    price: 19.9,
  },
  (err, data) => {
    if (err) {
      console.log(err);
      return;
    }
    console.log(data);
    mongoose.disconnect();
  }
);
```

### Mongoose 的字段类型

文档中常用的字段类型：

| 字段类型 | 描述                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| String   | 字符串                                                                        |
| Number   | 数字                                                                          |
| Boolean  | 布尔值                                                                        |
| Array    | 数组，也可以使用 [] 来标识                                                    |
| Date     | 日期                                                                          |
| Buffer   | Buffer 对象                                                                   |
| Mixed    | 任意类型，需要使用 mongoose.Schema.Types.Mixed 指定                           |
| ObjectId | 对象 ID，需要使用 mongoose.Schema.Types.ObjectId 指定（可做外键进行级联查询） |
| Decimal  | 128 高精度数字，需要使用 mongoose.Schema.Types.Decimal128 指定                |

### Mongoose 的字段验证

::: code-group

```json [字段必填]
name: {
  type: String,
  require: true
},
```

```json [默认值]
author: {
  type: String,
  default: '匿名'
},
```

```json [枚举值]
type: {
  type: String,
  enum: ['言情', '恐怖']
},
```

```json [唯一值]
name: {
  type: String,
  require: true,
  unique: true
},
```

:::

::: warning 注意
unique 需要重建集合才能有效果。永远不要相信用户的输入
:::

### Mongoose 的 CRUD 操作

#### 创建文档模型

```js
//1. 安装 mongoose
//2. 导入 mongoose
const mongoose = require('mongoose');

//设置 strictQuery 为 true
mongoose.set('strictQuery', true);

//3. 连接 mongodb 服务                        数据库的名称
mongoose.connect('mongodb://127.0.0.1:27017/bilibili');

//4. 设置回调
// 设置连接成功的回调  once 一次   事件回调函数只执行一次
mongoose.connection.once('open', () => {
  //5. 创建文档的结构对象
  //设置集合中文档的属性以及属性值的类型
  let BookSchema = new mongoose.Schema({
    name: String,
    author: String,
    price: Number,
    is_hot: Boolean,
  });

  //6. 创建模型对象  对文档操作的封装对象
  let BookModel = mongoose.model('novel', BookSchema);

  //7. 新增
  BookModel.insertMany(
    [
      {
        name: '西游记',
        author: '吴承恩',
        price: 19.9,
        is_hot: true,
      },
      {
        name: '红楼梦',
        author: '曹雪芹',
        price: 29.9,
        is_hot: true,
      },
      {
        name: '三国演义',
        author: '罗贯中',
        price: 25.9,
        is_hot: true,
      },
      {
        name: '水浒传',
        author: '施耐庵',
        price: 20.9,
        is_hot: true,
      },
      {
        name: '活着',
        author: '余华',
        price: 19.9,
        is_hot: true,
      },
      {
        name: '狂飙',
        author: '徐纪周',
        price: 68,
        is_hot: true,
      },
      {
        name: '大魏能臣',
        author: '黑男爵',
        price: 9.9,
        is_hot: false,
      },
      {
        name: '知北游',
        author: '洛水',
        price: 59,
        is_hot: false,
      },
      {
        name: '道君',
        author: '跃千愁',
        price: 59,
        is_hot: false,
      },
      {
        name: '七煞碑',
        author: '游泳的猫',
        price: 29,
        is_hot: false,
      },
      {
        name: '独游',
        author: '酒精过敏',
        price: 15,
        is_hot: false,
      },
      {
        name: '大泼猴',
        author: '甲鱼不是龟',
        price: 26,
        is_hot: false,
      },
      {
        name: '黑暗王者',
        author: '古羲',
        price: 39,
        is_hot: false,
      },
      {
        name: '不二大道',
        author: '文刀手予',
        price: 89,
        is_hot: false,
      },
      {
        name: '大泼猴',
        author: '甲鱼不是龟',
        price: 59,
        is_hot: false,
      },
      {
        name: '长安的荔枝',
        author: '马伯庸',
        price: 45,
        is_hot: true,
      },
      {
        name: '命运',
        author: '蔡崇达',
        price: 59.8,
        is_hot: true,
      },
      {
        name: '如雪如山',
        author: '张天翼',
        price: 58,
        is_hot: true,
      },
      {
        name: '三体',
        author: '刘慈欣',
        price: 23,
        is_hot: true,
      },
      {
        name: '秋园',
        author: '杨本芬',
        price: 38,
        is_hot: true,
      },
      {
        name: '百年孤独',
        author: '范晔',
        price: 39.5,
        is_hot: true,
      },
      {
        name: '在细雨中呼喊',
        author: '余华',
        price: 25,
        is_hot: true,
      },
    ],
    (err, data) => {
      //判断是否有错误
      if (err) {
        console.log(err);
        return;
      }
      //如果没有出错, 则输出插入后的文档对象
      console.log(data);
      //8. 关闭数据库连接 (项目运行过程中, 不会添加该代码)
      mongoose.disconnect();
    }
  );
});

// 设置连接错误的回调
mongoose.connection.on('error', () => {
  console.log('连接失败');
});

//设置连接关闭的回调
mongoose.connection.on('close', () => {
  console.log('连接关闭');
});
```

#### 添加文档

::: code-group

```js [添加一个文档]
BookModel.create(
  {
    name: '独游',
    author: '酒精过敏',
    price: 15,
    is_hot: false,
  },
  (err, data) => {
    if (err) {
      console.log('插入失败');
      return;
    }
    console.log(data);
  }
);
```

```js [添加多条文档]
 BookModel.insertMany([
  {
    name: '在细雨中呼喊',
    author: '余华',
    price: 25,
    is_hot: true
  }], (err, data) => {
    //判断是否有错误
    if (err) {
      console.log(err);
      return;
    }
    //如果没有出错, 则输出插入后的文档对象
    console.log(data);
    //8. 关闭数据库连接 (项目运行过程中, 不会添加该代码)
    mongoose.disconnect();
  });
});
```

:::

#### 删除文档

::: code-group

```js [删除一条数据]
// 删除一条数据
BookModel.deleteOne({ _id: '659963b32be940cb5860b280' }, (err, data) => {
  if (err) {
    console.log('删除失败');
    return;
  }
  console.log(data);
});
```

```js [删除多条数据]
// 批量删除
BookModel.deleteMany({ is_hot: false }, (err, data) => {
  if (err) {
    console.log('删除失败');
    return;
  }
  console.log(data);
});
```

:::

#### 更新文档

::: code-group

```js [更新一条数据]
// 更新一条数据
BookModel.updateOne({ name: '红楼梦' }, { price: 9.9 }, (err, data) => {
  if (err) {
    console.log('删除失败');
    return;
  }
  console.log(data);
});
```

```js [批量更新数据]
// 批量更新数据
BookModel.updateMany({ author: '余华' }, { is_hot: true }, (err, data) => {
  if (err) {
    console.log('删除失败');
    return;
  }
  console.log(data);
});
```

:::

#### 查询文档

::: code-group

```js [根据条件查询单条]
// 查询单条数据
BookModel.findOne({ name: '狂飙' }, (err, data) => {
  if (err) {
    console.log('删除失败');
    return;
  }
  console.log(data);
});
```

```js [根据id查询]
// 根据ID查询单条数据
BookModel.findById('659963b32be940cb5860b284', (err, data) => {
  if (err) {
    console.log('删除失败');
    return;
  }
  console.log(data);
});
```

```js [批量查询]
// 查询全部
console.log(BookModel.find());
// 条件查询
console.log(BookModel.find({ author: '余华' }));
```

:::

### 条件控制

#### 运算符

在 mongodb 不能 `> < >= <= !==` 等运算符，需要使用替代符号

| 运算符 | 替代符号 |
| ------ | -------- |
| >      | $gt      |
| <      | $lt      |
| ≤      | $lt      |
| <=     | $lt      |
| !==    | $ne      |

比如查询价格小于 20 的图书

```js
// 查询价格小于20的图书
BookModel.find({ price: { $lt: 20 } }, (err, data) => {
  if (err) {
    console.log('查询失败');
    return;
  }
  console.log(data);
});
```

#### 逻辑运算

| 运算符 | 替代符号 |
| ------ | -------- | --- | --- |
|        |          |     | $or |
| &&     | $and     |

1. 查询作者为余华或者作者为曹雪芹的图书

```js
// 查询作者为余华或者作者为曹雪芹的图书
BookModel.find({ $or: [{ author: '余华' }, { author: '曹雪芹' }] }, (err, data) => {
  if (err) {
    console.log('查询失败');
    return;
  }
  console.log(data);
});
```

2. 查询价格大于 30 小于 70 的图书

```js
// 方式一
let condition = { $and: [{ price: { $gt: 30 } }, { price: { $lt: 70 } }] };
// 方式二
BookModel.find({ price: { $gt: 30, $lt: 70 } }, (err, data) => {
  if (err) {
    console.log('查询失败');
    return;
  }
  console.log(data);
});
```

#### 正则匹配

条件中可以直接使用 JS 的正则语法，通过正则可以进行模糊查询
:::code-group

```js [方式一]
BookModel.find({ name: /三/ }, (err, data) => {
  if (err) {
    console.log('查询失败');
    return;
  }
  console.log(data);
});
```

```js [方式二]
BookModel.find({ name: new RegExp('三') }, (err, data) => {
  if (err) {
    console.log('查询失败');
    return;
  }
  console.log(data);
});
```

:::

### 个性化读取

#### 字段筛选

只查询某些字段，0:不要的字段，1:要的字段。该例子中 id 不查询，那么要查询

```js
BookModel.find()
  .select({ _id: 0, name: 1 })
  .exec((err, data) => {
    if (err) {
      console.log('读取失败');
      return;
    }
    console.log(data);
  });
// 设置连接错误的回调
mongoose.connection.on('error', () => {
  console.log('连接失败');
});
```

#### 数据排序

-1 ：降序 1：升序

```js
BookModel.find()
  .select({ _id: 0, name: 1 })
  .sort({ name: -1 })
  .exec((err, data) => {
    if (err) {
      console.log('读取失败');
      return;
    }
    console.log(data);
  });
```

#### 数据截取

`skip` 跳过 `limit` 限定

```js
// 数据截取,跳过前两条后再查询两条
BookModel.find()
  .skip(2)
  .limit(2)
  .exec((err, data) => {
    if (err) {
      console.log('读取失败');
      return;
    }
    console.log(data);
  });
```

### 模块化

#### 封装数据库初始化文件

::: code-group

```js [config.js]
// 配置文件
module.exports = {
  DBHOST: '127.0.0.10',
  DBPORT: 27017,
  DBNAME: 'bilibli',
};
```

```js [db.js]
//导入 mongoose
const mongoose = require('mongoose');
// 导入配置文件
const config = require('../config/config');
// 导出db
module.exports = function (success, error) {
  // 为error设置默认值
  if (typeof error !== 'function') {
    error = () => {
      console.log('连接失败');
    };
  }
  //连接 mongodb 服务                        数据库的名称
  mongoose.connect(`mongodb://${config.DBHOST}:${config.DBPORT}}/${config.DBNAME}`);

  // 设置连接成功的回调  once 一次   事件回调函数只执行一次
  mongoose.connection.once('open', success);
  // 设置连接失败的回调
  mongoose.connection.on('error', error);
  // 设置连接关闭的回调
  mongoose.connection.on('close', () => {
    console.log('连接关闭');
  });
};
```

:::

#### 封装文档操作模型

```js
// 导入mongoose
const mongoose = require('mongoose');

// 创建book文档模型的对象
let BookSchema = new mongoose.Schema({
  name: String,
  author: String,
  price: Number,
  is_hot: Boolean,
});

//创建模型对象  对文档操作的封装对象
let BookModel = mongoose.model('novel', BookSchema);

// 导出模型对象
module.exports = BookModel;
```

#### 导入模块并使用

```js
// 导入mongoose
const mongoose = require('mongoose');
// 导入db
const db = require('./db/db');
// 导入文档操作对象
const BookModel = require('./modules/BookModel');
// 调用db完成功能
db(
  () => {
    console.log('连接成功');
    // 插入一条数据
    BookModel.create(
      {
        name: '独游',
        author: '酒精过敏',
        price: 15,
        is_hot: false,
      },
      (err, data) => {
        if (err) {
          console.log('插入失败');
          return;
        }
        console.log(data);
      }
    );
  },
  () => {
    console.log('连接失败');
  }
);
```

### mongo 的图形化管理工具

我们可以使用图形化的管理工具来对 Mongodb 进行交互，这里演示两个图形化工具

1. Robo 3T 免费 [https://github.com/Studio3T/robomongo/releases](https://github.com/Studio3T/robomongo/releases)

2. Navicat 收费 [https://www.navicat.com.cn/](https://www.navicat.com.cn/)

### 记账本项目接入数据库

```js
var express = require('express');
var router = express.Router();
// 导入文档模型
const AccountModel = require('../modules/AccountModle');
// 导入moment模块处理时间
const moment = require('moment');
// 获取账单列表
router.get('/list', function (req, res, next) {
  // 获取数据
  // let accounts = db.get('accounts').value()
  AccountModel.find()
    .sort({ time: -1 })
    .exec((err, data) => {
      if (err) {
        res.status(500).send('列表读取失败');
      }
      res.render('list', { accounts: data, moment: moment });
    });
});
// 添加账单表单
router.get('/account', function (req, res, next) {
  res.render('create');
});

// 添加账单
router.post('/account', (req, res) => {
  // 插入数据库
  AccountModel.create(
    {
      ...req.body,
      time: moment(req.body.time).toDate(),
    },
    (err, data) => {
      if (err) {
        res.render('fail', { msg: '添加失败', url: '/account' });
      }
      res.render('success', { msg: '添加成功', url: '/account' });
    }
  );
});
// 删除账单
router.get('/account/:id', (req, res) => {
  let id = req.params.id;
  AccountModel.deleteOne({ _id: id }).exec((err, data) => {
    (err, data) => {
      if (err) {
        res.render('fail', { msg: '删除失败', url: '/account' });
      }
      res.render('success', { msg: '删除成功', url: '/account' });
    };
  });
});
module.exports = router;
```
