---
order: 7
---

# stream 模块

`stream`是 Node.js 提供的又一个仅在服务区端可用的 fs 中的子模块，目的是支持“流”这种数据结构

## 输入&输出

输入：将数据从外部设备或者外存输入到内存；
输出：将数据从内存输出到外存或外部设备

## 什么是流式读取

> 就是对生产消费模式的实现

流式读取不像是 `readFile` 一次将整个文件读入内存。流式读取是一块一块的读，每次读取 65536 个字节，也就是 64KB，每读一块会调用一次回调函数。所以流式读取适合大文件读取

## 流式读取实现

在 Node.js 中，流式读取已经被封装好了，我们只需要响应流的事件就可以了：

1. `data`事件表示读取了一块数据，触发回调消费这个数据
2. `end`事件表示这个流已经到末尾了，没有数据可以读取了
3. `error`事件表示出错了。

```JavaScript
var fs = require('fs');

// 打开sample.txt文件的输入流
var rs = fs.createReadStream('sample.txt', 'utf-8');

rs.on('data', function (chunk) {
    console.log('DATA:')
    console.log(chunk);
});

rs.on('end', function () {
    console.log('END');
});

rs.on('error', function (err) {
    console.log('ERROR: ' + err);
});

```

## 流式写入实现

要以流的形式写入文件，只需要不断调用`write()`方法，最后以`end()`结束：

```JavaScript
var fs = require('fs');

var ws1 = fs.createWriteStream('output1.txt', 'utf-8');
ws1.write('使用Stream写入文本数据...\n');
ws1.write('END.');
ws1.end();
```

## 管道读取写入

`pipe`有些像语法糖，传入一个写入流对象，当读取到一块数据时自动的调用这个写入流来写入数据。

```JavaScript
const fs = require('fs')

const readstream = fs.createReadStream('./1.txt')
const writestream = fs.createWriteStream('./2.txt')

readstream.pipe(writestream)
```
