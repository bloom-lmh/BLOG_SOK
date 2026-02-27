# fs 模块

## 什么是 fs 模块

`fs` 全称为 `file system` ，称之为文件系统，是 `Node.js` 中的内置功能模块，可以对计算机中的文件进行操作。要使用`fs`模块首先需要引入该模块：
`const fs = require('fs');`

## 文件写入

## Node.js 文件写入方法汇总

| 语法                                       | 功能         | 参数说明                                                      | 返回值           |
| ------------------------------------------ | ------------ | ------------------------------------------------------------- | ---------------- |
| `fs.writeFile(file, data[, options])`      | 异步写入文件 | `file`: 文件路径<br>`data`: 写入数据<br>`options`: 编码等选项 | Promise（无）    |
| `fs.writeFileSync(file, data[, options])`  | 同步写入文件 | `file`: 文件路径<br>`data`: 写入数据<br>`options`: 编码等选项 | undefined        |
| `fs.appendFile(file, data[, options])`     | 异步追加写入 | `file`: 文件路径<br>`data`: 追加数据<br>`options`: 编码等选项 | Promise（无）    |
| `fs.appendFileSync(file, data[, options])` | 同步追加写入 | `file`: 文件路径<br>`data`: 追加数据<br>`options`: 编码等选项 | undefined        |
| `fs.createWriteStream(path[, options])`    | 创建写入流   | `path`: 文件路径<br>`options`: 流选项                         | WriteStream 对象 |

### 异步写入

```js
// 导入文件系统模块
const fs = require("fs");

// 将 『三人行，必有我师焉。』 写入到当前文件夹下的『座右铭.txt』文件中
fs.writeFile("./poem.txt", "三人行必有我师焉", (err) => {
    // 如果写入失败，则回调函数调用时，会传入错误对象，如果写入成功，会传入 null
    if (err) {
        console.log(err);
        return;
    }
    console.log("写入成功");
});
```

### 同步写入

```js
// 同步写入
try {
    fs.writeFileSync("./poem2.txt", "三人行必有我师焉");
} catch (e) {
    console.log(e);
}
```

### 异步追加写入

```js
// 异步步追加写入
fs.appendFile("./poem.txt", "择其善者而从之", (err) => {
    if (err) {
        console.log(err);
        return;
    }
    console.log("文件追加成功");
});
```

### 同步追加写入

```js
try {
    //同步追加写入
    fs.appendFileSync("./poem2.txt", "择其善者而从之");
} catch (e) {
    console.log(e);
}
```

### 流式写入

流式写入适合大文件写入或频繁写入的场景，具体参见stream 模块

```js
// 流式写入
const ws = fs.createWriteStream("./poem3.txt");
ws.write("小小环球有几个苍蝇碰壁");
ws.write("嗡嗡叫");
```

### 写入文件的场景

文件写入在许多应用中都有广泛的应用，以下是一些常见的使用场景：

- 配置文件更新：在应用程序中，你可能需要定期更新配置文件。通过文件写入，你可以轻松地将新的配置信息保存到文件中。
- 数据备份：数据备份是关键的数据管理实践，文件写入可用于将数据保存到本地文件，以便将来还原或迁移数据。
- 日志记录：应用程序的日志文件是排查问题和跟踪应用状态的重要工具。使用文件写入，你可以将日志信息持久化到文件中。
- 文件上传：在 Web 应用中，文件上传是常见的需求。通过文件写入，你可以将用户上传的文件保存到服务器上的特定位置。
- 数据导出：将数据导出到本地文件，以便与其他应用程序或系统共享。

## 文件读取

根据您提供的图片信息，我为您整理了 Node.js 文件读取方法的 Markdown 表格：

| 语法                                     | 功能         | 参数说明                                                                  | 返回值                      |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------- | --------------------------- |
| `fs.readFile(path[, options], callback)` | 异步读取文件 | `path`: 文件路径<br>`options`: 编码等选项（可选）<br>`callback`: 回调函数 | `undefined`                 |
| `fs.readFileSync(path[, options])`       | 同步读取文件 | `path`: 文件路径<br>`options`: 编码等选项（可选）                         | 文件内容（字符串或 Buffer） |
| `fs.createReadStream(path[, options])`   | 流式读取文件 | `path`: 文件路径<br>`options`: 编码等选项（可选）                         | `ReadStream` 对象           |

### 异步读取

```js
// 异步读取文件
fs.readFile("./poem.txt", "utf-8", (err, data) => {
    if (err) {
        console.log(err);
        return;
    }
    console.log(data);
});
```

### 同步读取

```js
try {
    // 同步读取
    let data = fs.readFileSync("./poem.txt");
    console.log(data.toString());
} catch (e) {
    console.log(e);
}
```

### 流式读取

流式读取是一块一块的读，每次读取 65536 个字节，也就是 64KB，每读一块会调用一次回调函数，具体参见stream 模块

```js
// 导入文件系统模块
const fs = require("fs");
// 导入进程管理模块
const process = require("process");
// 方式一  创建流式读取文件对象
let rs = fs.createReadStream("./poem.txt");
// 创建流式写入文件读写
let ws = fs.createWriteStream("./poemCopy.txt");
// 写入文件
rs.on("data", (chunk) => {
    ws.write(chunk);
});
rs.on("end", () => {
    console.log(process.memoryUsage().rss);
});
// 方式二 直接交给管道
rs.pipe(ws);
```

### 文件读取场景

- 上传文件
- 读取配置文件

### 实现文件的复制

先读取文件再写入就可以实现文件的复制，以下采用流式文件读取为例

```js
// 导入文件系统模块
const fs = require("fs");

// 实现文件复制
// 创建流式读取文件对象
let rs = fs.createReadStream("./poem.txt");
// 创建流式写入文件读写
let ws = fs.createWriteStream("./poemCopy.txt");
// 写入文件
rs.on("data", (chunk) => {
    ws.write(chunk);
});
rs.on("end", () => {
    console.log("文件复制完毕");
});
```

## 文件移动与重命名

| 语法                                    | 功能                 | 参数说明                                                                                               |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `fs.rename(oldPath, newPath, callback)` | 异步移动或重命名文件 | 1. **oldPath** - 文件当前的路径<br>2. **newPath** - 文件新的路径<br>3. **callback** - 操作后的回调函数 |
| `fs.renameSync(oldPath, newPath)`       | 同步移动或重命名文件 | 参数与 `fs.rename` 大体一致，只是没有 callback 参数                                                    |

### 异步移动或重命名文件

```js
// 文件异步移动和重重命名
fs.rename("./poemCopy2", "./poem4.txt", (err) => {
    if (err) {
        console.log(err);
        return;
    }
    console.log("文件移动和重命名成功");
});
```

### 同步移动或重命名文件

```js
try {
    // 文件同步移动和重命名
    fs.renameSync("./poemCopy2.txt", "./poem5.txt");
} catch (error) {
    console.log(error);
}
```

## 文件删除

| 语法                        | 功能         | 参数说明                                                     |
| --------------------------- | ------------ | ------------------------------------------------------------ |
| `fs.unlink(path, callback)` | 异步删除文件 | 1. **path** - 文件路径<br>2. **callback** - 操作后的回调函数 |
| `fs.unlinkSync(path)`       | 同步删除文件 | 参数与 `fs.unlink` 大体一致，只是没有 callback 参数          |

> 14 版本后可采用 fs.rm 删除文件

### 异步删除文件

```JavaScript
// 导入文件系统模块
const fs = require('fs')

fs.unlink('./poem.txt', err => {
  if (err) {
    console.log(err)
    return
  }
  console.log('文件删除成功')
})
// 或者采用fs.rm
```

### 同步删除文件

```JavaScript
try {
  fs.unlinkSync('./poem.txt')
} catch (error) {
  console.log(error)
}
```

## 文件夹操作

| 语法                                    | 功能           | 参数说明                                                                                                    |
| --------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| `fs.mkdir(path[, options], callback)`   | 异步创建文件夹 | 1. **path** - 要创建的文件夹路径<br>2. **options** - 配置选项（可选）<br>3. **callback** - 操作后的回调函数 |
| `fs.mkdirSync(path[, options])`         | 同步创建文件夹 | 参数与 `fs.mkdir` 大体一致，只是没有 callback 参数                                                          |
| `fs.readdir(path[, options], callback)` | 异步读取文件夹 | 1. **path** - 要读取的文件夹路径<br>2. **options** - 配置选项（可选）<br>3. **callback** - 操作后的回调函数 |
| `fs.readdirSync(path[, options])`       | 同步读取文件夹 | 参数与 `fs.readdir` 大体一致，只是没有 callback 参数                                                        |
| `fs.rmdir(path[, options], callback)`   | 异步删除文件夹 | 1. **path** - 要删除的文件夹路径<br>2. **options** - 配置选项（可选）<br>3. **callback** - 操作后的回调函数 |
| `fs.rmdirSync(path[, options])`         | 同步删除文件夹 | 参数与 `fs.rmdir` 大体一致，只是没有 callback 参数                                                          |

### 异步创建目录

```JavaScript
// 异步创建目录
fs.mkdir('./a/b/c', { recursive: true }, err => {
  if (err) {
    console.log(err)
    return
  }
  console.log('目录创建成成功')
})
```

### 同步创建目录

```JavaScript
// 异步创建目录
fs.mkdir('./a/b/c', { recursive: true }, err => {
  if (err) {
    console.log(err)
    return
  }
  console.log('目录创建成成功')
})
```

### 异步读取文件夹

```JavaScript
// 异步获取目录
fs.readdir('./', (err, data) => {
  if (err) {
    console.log(err)
    return
  }
  console.log(data)
})
```

### 同步读取文件夹

```JavaScript
// 同步获取目录
try {
  fs.readdirSync('./')
} catch (error) {
  console.log(error)
}
```

### 异步删除文件夹

```JavaScript
// 异步删除目录
// fs.rmdir('./a', { recursive: true }, err => {
//   if (err) {
//     console.log(err)
//     return
//   }
//   console.log('文件删除成功')
// })
// 推荐使用rm删除
fs.rm('./a', { recursive: true }, err => {
  if (err) {
    console.log(err)
    return
  }
  console.log('文件删除成功')
})
```

### 同步删除文件夹

```JavaScript
// 同步删除目录
try {
  fs.rmdirSync('./dir1')
} catch (error) {
  console.log(error)
}
```

## 查看资源状态

| 语法                                 | 功能             | 参数说明                                                                                                         |
| ------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| `fs.stat(path[, options], callback)` | 异步获取文件状态 | 1. **path** - 文件路径<br>2. **options** - 选项配置（可选）<br>3. **callback** - 回调函数                        |
| `fs.statSync(path[, options])`       | 同步获取文件状态 | 1. **path** - 文件路径<br>2. **options** - 选项配置（可选）<br>参数与 `fs.stat` 大体一致，只是没有 callback 参数 |

### 异步获取文件状态

```JavaScript
// 异步获取文件状态
fs.stat('./fs_copy.js', (err, data) => {
  if (err) {
    console.log(err)
    return
  }
  console.log(data)
})

```

### 同步获取文件状态

```JavaScript
// 同步获取文件状态
try {
  let data = fs.statSync('./fs_copy.js')
  console.log(data)
} catch (error) {
  console.log(error)
}

```

文件信息对象

```JavaScript
Stats {
  dev: 2992188473,          // 设备 ID（标识该文件所在的设备/磁盘分区）
  mode: 33206,              // 文件类型和权限位（如普通文件、目录、可读/写/执行等）
  nlink: 1,                 // 硬链接数量（指向该 inode 的文件名数量）
  uid: 0,                   // 文件所有者的用户 ID（Unix/Linux 系统；Windows 上通常为 0）
  gid: 0,                   // 文件所有者的组 ID（Unix/Linux；Windows 上通常为 0）
  rdev: 0,                  // 如果是特殊设备文件（如 /dev/tty），表示设备号；普通文件为 0
  blksize: 4096,            // 文件系统 I/O 的最优块大小（单位：字节），用于高效读写
  ino: 6192449487674145,    // inode 编号（文件在文件系统中的唯一标识）
  size: 692,                // 文件的实际字节大小（仅对普通文件有意义；目录通常为 0 或固定值）
  blocks: 1,                // 文件占用的 512 字节块数（注意：不是 blksize！用于计算磁盘占用）

  // 时间戳（毫秒精度）
  atimeMs: 1703838782258.854,   // 最后访问时间（Access Time）—— 单位：毫秒（自 Unix 纪元）
  mtimeMs: 1703838781786.4355,  //  最后修改时间（Modify Time）—— 内容被修改的时间
  ctimeMs: 1703838781786.4355,  // 状态变更时间（Change Time）—— 元数据（如权限、所有者）变更时间（Linux/macOS）；在 Windows 上等同于 birthtime
  birthtimeMs: 1703837945052.1543, //  文件创建时间（Birth Time / Creation Time）
}
```

判断是否文件和目录

```JavaScript
  console.log(data.isDirectory())
  console.log(data.isFile())
```
