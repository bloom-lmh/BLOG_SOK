---
order: 168
---

# new 操作符

[[toc]]

## 基本概念

### 构造函数的基本使用

在 JavaScript 中，new 操作符用于创建一个给定构造函数的实例对象

从上面可以看出：

- new 通过构造函数`Person`创建出来的实例可以访问到构造函数中的属性
- new 通过构造函数`Person`创建出来的实例可以访问到构造函数原型链中的属性（即实例与构造函数通过原型链连接了起来）

```js
// 定义Person构造函数
function Person(name, age) {
  this.name = name;
  this.age = age;
}

// 在原型上添加sayName方法
Person.prototype.sayName = function () {
  console.log(this.name);
};

// 创建Person实例
const person1 = new Person('Tom', 20);

// 输出实例信息
console.log(person1); // Person {name: "Tom", age: 20}

// 调用实例方法
person1.sayName(); // 'Tom'
```

### 显示返回基本数据类型

现在给构造函数显示的加上返回值，并且返回值是一个基本数据类型

```js
function Test() {
  this.name = name;
  return 1;
}
const t = new Test('xxx');
console.log(t.name); // xxx
```

可以发现构造函数返回一个原始值，但是这个返回值并没有作用

### 显示返回对象

现在给构造函数显示的加上返回值，并且返回值是一个对象

```js
function Test() {
  this.name = name;
  return { age: 18 };
}
const t = new Test('xxx');
console.log(t.age); // 18
```

可以发现构造函数返回了一个对象，那么这个返回值会被正常的使用

## 使用 new 关键字的流程

从上面介绍中，我们可以看到 new 关键字主要做了以下的工作：

- 创建一个新的对象 `obj`
- 将对象与构建函数通过原型链连接起来
- 将构建函数中的 `this` 绑定到新建的对象 `obj` 上
- 根据构建函数返回类型作判断，如果是原始值则被忽略，如果是返回对象，需要正常处理

![new 操作符流程](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250709102332477.png)

## 手写 new 操作符

```js
function _new(Func, ...args) {
  let obj = {};
  Object.setPrototypeOf(obj, Func.prototype);
  result = Func.apply(obj, args);
  // 判断显示返回的是对象还是基本数据类型
  return typeof result === 'object' ? result : obj;
}

function Person(name, age) {
  this.name = name;
  this.age = age;
}
Person.prototype.sayHello = function () {
  console.log('Hello, my name is ' + this.name + ', I am ' + this.age + 'years old.');
};
let p1 = _new(Person, 'Tom', 20);
console.log(p1); // { name: 'Tom', age: 20 }
p1.sayHello(); // Hello, my name is Tom, I am 20years old.
```
