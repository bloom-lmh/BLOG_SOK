---
order: 118
---

# Error 类

[[toc]]

## 创建 Error 对象

Js 的 throw 和 catch 方法能够抛出和捕获任何类型的 js 值，包括原始值。但是通常用于抛出错误对象时使用。Js 中定义了 Error 类对象，这个对象包含有 name 和 message 属性，name 属性表示错误类的名字，message 属性由用户传入。实际上 Node 和浏览器还给 Error 类添加了 stack 属性，这个记录了创建 Error 类对象时的 js 调用站的栈跟踪信息。

::: tip 栈追踪信息的起始点
使用 Error 对象的一个主要原因就是在创建 Error 对象时，该对象能够捕获 JavaScript 的栈状态,所以栈跟踪信息会展示创建 Error 对象的地方，而不是 throw 语句抛出它的地方
:::

## 系统定义的 Error 子类

Js 中定义了一些 Error 类的子类，这些类表达了常见的一些错误。比如：`EvalError, RangeError, ReferenceError, SyntaxError,TypeError 和 URIError`

## 自定义 Error 子类

作为开发者我们可以自定义一些 Error 类来表示一些错误

```js
// 自定义一个Error类
class HttpsError extends Error {
  constructor(status, statusText, url) {
    super(`${status} ${statusText} ${url}`);
    this.status = status;
    this.statusText = statusText;
    this.url = url;
  }
  // 访问器属性
  get name() {
    return 'HTTPError';
  }
}

let error = new HttpsError(404, 'Not Found', 'https://exanple.com/');
console.log(error.name);
console.log(error.message);
console.log(error.name);
```
