---
order: 155
---

# ES3 执行上下文 EC

[[toc]]
参考文献：https://juejin.cn/post/6844904158957404167?searchId=20250709105732CE426CA51C06E30C3923#heading-1

## 什么是执行上下文

执行上下文其实就是代码的运行环境，记录着代码运行时的各类信息，包括变量、函数、作用域链、this 等。每当进入一个新的执行环境，就会产生一个新的执行上下文，并将其压入执行栈。当代码执行完毕，相应的执行上下文也会从执行栈中弹出。

::: tip 理解执行上下文对象
其实执行上下文对象就是记录着代码运行时的环境信息的数据结构，是对执行环境的一种抽象。好比操作系统的 PCB（Process Control Block）一样，记录着进程的运行信息。
文章中默认执行上下文就是指的执行上下文对象。
:::

## ES3 执行上下文的类型

1. 全局执行上下文：这是默认或者说是最基础的执行上下文，一个程序中只会存在一个全局上下文，它在整个 javascript 脚本的生命周期内都会存在于执行堆栈的最底部不会被栈弹出销毁。全局上下文会生成一个全局对象（以浏览器环境为例，这个全局对象是 window），并且将 this 值绑定到这个全局对象上。

2. 函数执行上下文：每当一个函数被调用时，都会创建一个新的函数执行上下文（不管这个函数是不是被重复调用的）

3. Eval 函数执行上下文：执行在 eval 函数内部的代码也会有它属于自己的执行上下文，但由于并不经常使用 eval，所以在这里不做分析。

![执行上下文](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/Snipaste_2025-07-09_11-09-17.png)

## ES3 执行上下文的结构

执行上下文是一个抽象的概念，我们可以将它理解为一个 object ，一个执行上下文里包括以下内容：

### 变量对象（variable object 简称 VO）

> 原文：Every execution context has associated with it a > variable object. Variables and functions declared in the source text are added as properties of the variable object. For function code, parameters are added as properties of the variable object.

变量对象是执行上下文中用于存储变量、函数声明和函数参数的数据结构。每个执行环境文都有一个变量对象。

#### 全局执行上下文的变量对象

全局执行执行上下文的变量对象始终存在，即 window（浏览器）或 global（Node.js）

#### 函数执行上下文的变量对象及其创建过程

函数执行执行上下文也会有对应的变量对象，只不过这个变量对象是在函数被定义（解析阶段）且在具体的函数代码运行之前才会创建的，并按照下面的步骤进行创建:

1. 用 arguments 初始化变量对象
2. 添加函数声明（Function Declaration）到变量对象中
3. 添加变量声明（Variable Declaration）

![函数执行上下文的变量对象创建过程](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250709141808445.png)
比如：在 `example(1, 2)` 被调用时

```js
function example(a, b) {
  var x = 10;
  function inner() {}
  console.log(arguments); // { 0: 1, 1: 2, length: 2 }
}
example(1, 2);
```

会按照步骤会创建 Vo 对象：

::: code-group

```js [1.参数初始化]
VO = {
  arguments: { 0: 1, 1: 2, length: 2 },
  a: 1, // 形参 a
  b: 2, // 形参 b
};
```

```js [2.函数声明]
VO = {
    arguments: { 0: 1, 1: 2, length: 2 },
    a: 1,
    b: 2,
    inner: <function inner() {}>
};
```

```js [3.变量声明]
VO = {
    arguments: { 0: 1, 1: 2, length: 2 },
    a: 1,
    b: 2,
    inner: <function inner() {}>,
    x: undefined
};
```

:::

创建出的变量对象如下：

```js
VO = {
    arguments: { 0: 1, 1: 2, length: 2 },
    a: 1,
    b: 2,
    inner: <function inner() {}>,
    x: undefined
};
```

::: warning 注意
有一点需要注意，只有函数声明（function declaration）会被加入到变量对象中，而函数表达式（function expression）会被忽略。
:::

```js
// 这种叫做函数声明，会被加入变量对象
function a() {}

// b 是变量声明，也会被加入变量对象，但是作为一个函数表达式 _b 不会被加入变量对象
var b = function _b() {};
```

#### 全局执行上下文和函数执行上下文的变量对象的区别

全局执行上下文和函数执行上下文中的变量对象还略有不同，它们之间的差别简单来说：

1. 全局上下文中的变量对象就是全局对象，以浏览器环境来说，就是 window 对象。
2. 函数执行上下文中的变量对象内部定义的属性，是不能被直接访问的，只有当函数被调用时，变量对象（VO）被激活为活动对象（AO）时，我们才能访问到其中的属性和方法。

### 活动对象（activation object 简称 AO）

> 原文：When control enters an execution context for function code, an object called the activation object is created and associated with the execution context. The activation object is initialised with a property with name arguments and attributes { DontDelete }. The initial value of this property is the arguments object described below. The activation object is then used as the variable object for the purposes of variable instantiation.

函数被调用进入执行阶段时，原本不能访问的变量对象被激活成为一个活动对象，自此，我们可以访问到其中的各种属性。

::: tip 活动对象和变量对象之间的关系
其实变量对象和活动对象是一个东西，只不过处于不同的状态和阶段而已。
:::

### 作用域链（scope chain）

作用域规定了如何查找变量，也就是确定当前执行代码对变量的访问权限。当查找变量的时候，会先从当前上下文的变量对象中查找，如果没有找到，就会从父级（词法层面上的父级）执行上下文的变量对象中查找，一直找到全局上下文的变量对象，也就是全局对象。这样由多个执行上下文的变量对象构成的链表就叫做 作用域链。

函数的作用域在函数创建时（​ 函数被解析的阶段）就已经确定了。当函数创建时，会有一个名为 `[[scope]]` 的内部属性保存所有父变量对象到其中。当函数执行时，会创建一个执行上下文对象，然后通过复制函数的 `[[scope]]` 属性中的对象构建起执行环境的作用域链，然后，变量对象 VO 被激活生成 AO 并添加到作用域链的前端，完整作用域链创建完成：

```js
Scope = [AO].concat([[Scope]]);
```

当函数被调用时：

- 创建执行上下文（Execution Context）​。
- ​**复制 [[Scope]]**​ 到执行上下文的作用域链（Scope Chain）。
- 创建活动对象（AO）​​（存储参数、var 变量、函数声明等），并添加到作用域链的最前端。
- 执行代码时，变量查找顺序：当前 AO → 外层 [[Scope]] 链 → 直到全局 VO。

### 当前可执行代码块的调用者（this）

如果当前函数被作为对象方法调用或使用 `bind call apply` 等 API 进行委托调用，则将当前代码块的调用者信息（`this value`）存入当前执行上下文，否则默认为全局对象调用。
关于 this 的创建细节，有点烦，有兴趣的话可以进入专题学习。

### 执行上下文数据结构模拟

如果将上述一个完整的执行上下文使用代码形式表现出来的话，应该类似于下面这种：

```js
executionContext：{
    [variable object | activation object]：{
        arguments,
        variables: [...],
        funcions: [...]
    },
    scope chain: variable object + all parents scopes
    thisValue: context object
}
```

## ES3 执行上下文的生命周期

执行上下文的生命周期有三个阶段，分别是：

- 创建阶段
- 执行阶段
- 销毁阶段

### 创建阶段

函数执行上下文的创建阶段，发生在函数调用时且在执行函数体内的具体代码之前，在创建阶段，JS 引擎会做如下操作：

- 用当前函数的参数列表（arguments）初始化一个 “变量对象” 并将当前执行上下文与之关联 ，函数代码块中声明的 变量 和 函数 将作为属性添加到这个变量对象上。在这一阶段，会进行变量和函数的初始化声明，变量统一定义为 undefined 需要等到赋值时才会有确值，而函数则会直接定义。

::: tip 变量提升
有没有发现这段加粗的描述非常熟悉？没错，这个操作就是 变量声明提升（变量和函数声明都会提升，但是函数提升更靠前）。
:::

- 构建作用域链（前面已经说过构建细节）
- 确定 this 的值

### 执行阶段

执行阶段中，JS 代码开始逐条执行，在这个阶段，JS 引擎开始对定义的变量赋值、开始顺着作用域链访问变量、如果内部有函数调用就创建一个新的执行上下文压入执行栈并把控制权交出……

### 销毁阶段

一般来讲当函数执行完成后，当前执行上下文（局部环境）会被弹出执行上下文栈并且销毁，控制权被重新交给执行栈上一层的执行上下文。

::: tip 闭包的情况
闭包的定义：有权访问另一个函数内部变量的函数。简单说来，如果一个函数被作为另一个函数的返回值，并在外部被引用，那么这个函数就被称为闭包。

```js
function funcFactory() {
  var a = 1;
  return function () {
    alert(a);
  };
}

// 闭包
var sayA = funcFactory();
sayA();
```

当闭包的父包裹函数执行完成后，父函数本身执行环境的作用域链会被销毁，但是由于闭包的作用域链仍然在引用父函数的变量对象，导致了父函数的变量对象会一直驻存于内存，无法销毁，除非闭包的引用被销毁，闭包不再引用父函数的变量对象，这块内存才能被释放掉。过度使用闭包会造成 内存泄露 的问题，这块等到闭包章节再做详细分析。

:::

### ES3 执行上下文总结

对于 ES3 中的执行上下文，我们可以用下面这个列表来概括程序执行的整个过程：

1. 函数被调用
2. 在执行具体的函数代码之前，创建了执行上下文
3. 进入执行上下文的创建阶段：
   - 初始化作用域链
   - 用当前函数的参数列表（arguments）初始化一个 “变量对象”
   - 扫描上下文找到所有函数声明：
     - 对于每个找到的函数，用它们的原生函数名，在变量对象中创建一个属性，该属性里存放的是一个指向实际内存地址的指针
     - 如果函数名称已经存在了，属性的引用指针将会被覆盖
   - 扫描上下文找到所有 var 的变量声明：
     - 对于每个找到的变量声明，用它们的原生变量名，在变量对象中创建一个属性，并且使用 undefined 来初始化
     - 如果变量名作为属性在变量对象中已存在，则不做任何处理并接着扫描
   - 确定 this 值
4. 进入执行上下文的执行阶段：在上下文中运行/解释函数代码，并在代码逐行执行时分配变量值。
