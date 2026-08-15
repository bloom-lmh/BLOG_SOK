---
order: 158
---

# ThisBinding

[[toc]]

## This 绑定的时机

- this 是在函数调用时（执行阶段）动态绑定的\*\*，而不是在函数定义时。也就是在执行上下文对象创建时绑定
- this 的确定应该由当前执行上下文来决定

::: tip 区别于作用域
作用域链是在函数定义时确定的
:::

## 从执行上下文理解 This 绑定的几种情况

### 全局执行上下文

- ​**this 指向全局对象**​（浏览器中是 window，Node.js 中是 global）。
- 严格模式（"use strict"）下为 undefined。

```js
console.log(this); // 全局对象（如 window）
```

### 函数执行上下文

#### 情况 1：默认绑定（直接调用）​

- 严格模式为 undefined
- 非严格模式为全局对象

```js
function foo() {
  console.log(this); // 全局对象（非严格模式）
}
foo(); // 默认绑定
```

#### 情况 2：隐式绑定（方法调用）​

this 指向调用者

```js
const obj = {
  name: 'Alice',
  sayHi() {
    console.log(this.name); // "Alice"（this = obj）
  },
};
obj.sayHi(); // 隐式绑定
```

#### 情况 3：显式绑定（call/apply/bind）​

```js
function greet() {
  console.log(this.name);
}
const person = { name: 'Bob' };
greet.call(person); // "Bob"（显式绑定）
```

#### 情况 4：new 绑定（构造函数）​

this 指向创建的或返回的对象

```js
function Person(name) {
  this.name = name; // this = 新创建的对象
}
const alice = new Person('Alice');
console.log(alice.name); // "Alice"
```

#### 情况 5：箭头函数（词法 this）​

箭头函数 this 继承自词法作用域链中父级的 this

```js
const obj = {
  name: 'Alice',
  sayHi: () => {
    console.log(this); // 继承外层 this（可能是 window）
  },
};
obj.sayHi(); // 箭头函数的 this 不随调用方式改变！
```

### （嵌套函数）执行上下文栈（Call Stack）与 this

JavaScript 使用 ​ 执行上下文栈 ​ 管理函数调用：

- 每次调用函数时，会创建一个新的执行上下文，并推入栈顶。
- 执行完毕后，该上下文从栈中弹出。
- ​**this 的值由当前栈顶的执行上下文决定**。

obj.foo() 调用时：

- foo 的执行上下文入栈，this = obj。
- bar() 是直接调用，默认绑定到全局对象。

## 绑定的优先级

new 绑定优先级>显示绑定优先级>隐式绑定优先级>默认绑定优先级
