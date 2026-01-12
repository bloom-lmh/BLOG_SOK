# buffer 模块

## 什么是 Buffer 对象

Buffer 是一个类似于数组的对象，用于表示固定长度的字节序列，是面向字节流的
Buffer 本质是一段内存空间，专门用来处理二进制数据，对于存入数据是依照 Ascll 码进行转换

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260112170731262.png)

## Buffer 对象的特点

1. Buffer 大小固定且无法调整
2. Buffer 性能较好，可以直接对计算机内存进行操作
3. 每个元素的大小为 1 字节（byte）

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260112170827284.png)

## 创建 Buffer 对象的几种方法

```js
// 创建了一个长度为 10 字节的 Buffer，相当于申请了 10 字节的内存空间，每个字节的值为 0
let buffer1 = Buffer.alloc(10);
console.log(buffer1); // <Buffer 00 00 00 00 00 00 00 00 00 00>

// 创建了一个长度为 10 字节的 Buffer，buffer 中可能存在旧的数据, 可能会影响执行结果，所以叫unsafe
let buffer2 = Buffer.allocUnsafe(10);
console.log(buffer2); // <Buffer 00 00 00 00 00 00 00 00 00 00>

// 通过字符串创建Buffer
let buffer3 = Buffer.from('hello');
// h对应的Ascll码的十六进制是68，在内存中是二进制形式存储的，即01101000
console.log(buffer3); // <Buffer 68 65 6c 6c 6f>

// 通过数组创建Buffer
let buffer4 = Buffer.from([1, 2, 33, 44]);
console.log(buffer4); // <Buffer 01 02 21 2c>
```

## Buffer 转为字符串

```js
// 通过数组创建Buffer
let buffer4 = Buffer.from([105, 108, 111, 118, 101, 121, 111, 117]);
// 转为字符串 105对应的Ascll码是i
console.log(buffer4.toString()); // iloveyou
```

::: tip
`toString` 默认是按照 utf-8 编码方式进行转换的。
:::

## Buffer 的读写

```js
// 通过数组创建Buffer
let buffer4 = Buffer.from([105, 108, 111, 118, 101, 121, 111, 117]);
// 取Bufferd的第一个元素,十进制转为二进制1101001
console.log(buffer4[0].toString(2));
```

::: warning
如果修改的数值超过 255 ，则超过 8 位数据会被舍弃 ；
:::
