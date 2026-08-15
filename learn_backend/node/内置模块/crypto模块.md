---
order: 11
---

# crypto 模块

## 简介

`crypto` 模块的目的是为了提供通用的加密和哈希算法。用纯 JavaScript 代码实现这些功能不是不可能，但速度会非常慢。Nodejs 用 C/C++实现这些算法后，通过 `cypto` 这个模块暴露为 JavaScript 接口，这样用起来方便，运行速度也快。

## MD5

### 什么是 MD5

MD5（Message-Digest Algorithm 5），即消息摘要算法第五版，是一种被广泛使用的密码散列函数。

它的核心作用是将任意长度的数据（比如一段文字、一个文件），通过复杂的数学运算，转换成一个固定长度（128 位，即 16 字节）的十六进制字符串（通常表现为 32 位的字符串）。这个结果就像是数据的“数字指纹”

### 如何使用 MD5

```js
// 导入crypto
const crypto = require('crypto');
// 创建md5 hash算法
const hash = crypto.createHash('md5');
// 多次调用update
hash.update('hello world');
hash.update('exe');
// 打印加密后的16进制签名
console.log(hash.digest('hex'));
```

`update()`方法默认字符串编码为`UTF-8`，也可以传入 Buffer。

如果要计算 SHA1，只需要把`'md5'`改成`'sha1'`，就可以得到 SHA1 的结果`1f32b9c9932c02227819a4151feed43e131aca40`。

## Hmac

### 什么是 Hmac

Hmac 算法也是一种哈希算法，它可以利用 MD5 或 SHA1 等哈希算法。不同的是，Hmac 还需要一个密钥，这是为了防止用户设置密码过于简单，黑客利用彩虹表对比获取到数据库密码后进行撞库（几个网站都有相同密码，获取一个就知道其它几个）

### 如何使用 Hmac

```js
const crypto = require('crypto');

const hmac = crypto.createHmac('sha256', 'secret-key');

hmac.update('123456');

console.log(hmac.digest('hex')); // 80f7e22570...
```

只要密钥发生了变化，那么同样的输入数据也会得到不同的签名，因此，可以把 Hmac 理解为用随机数增强的哈希算法。

## AES

### 什么是 AES

AES 是一种常用的对称加密算法，加解密都用同一个密钥。crypto 模块提供了 AES 支持，但是需要自己封装好函数，便于使用

### 如何使用 AES

```js
const crypto = require('crypto');

function encrypt(key, iv, data) {
  let dep = crypto.createCipheriv('aes-128-cbc', key, iv);

  return dep.update(data, 'binary', 'hex') + dep.final('hex');
}

function decrypt(key, iv, crypted) {
  crypted = Buffer.from(crypted, 'hex').toString('binary');

  let dep = crypto.createDecipheriv('aes-128-cbc', key, iv);
  return dep.update(crypted, 'binary', 'utf8') + dep.final('utf8');
}
//16*8 = 128
let key = 'abcdef1234567890';
let iv = 'tbcdey1234567890';

let data = 'aaaa-kerwin';

let cryted = encrypt(key, iv, data);
console.log('加密结果-', cryted);

let decrypted = decrypt(key, iv, cryted);
console.log('解密结果-', decrypted);
```

可以看出，加密后的字符串通过解密又得到了原始内容。
