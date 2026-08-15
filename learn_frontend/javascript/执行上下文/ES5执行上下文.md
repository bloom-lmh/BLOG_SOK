---
order: 156
---

# ES5 执行上下文 EC

[[toc]]
参考文献：https://juejin.cn/post/6844904158957404167?searchId=20250709105732CE426CA51C06E30C3923#heading-1

## 基本概念

`ES5` 规范又对 `ES3` 中执行上下文的部分概念做了调整，最主要的调整，就是去除了 `ES3` 中变量对象和活动对象，以 词法环境组件（ `LexicalEnvironment component`） 和 变量环境组件（ `VariableEnvironment component`） 替代。所以 ES5 的执行上下文结构上表示大概如下：

```js
ExecutionContext = {
  ThisBinding = <this value>,
  LexicalEnvironment = { ... },
  VariableEnvironment = { ... },
}

```

## ES5 中的词法环境

ES6 官方 中的词法环境定义：

> 词法环境是一种规范类型，基于 ECMAScript 代码的词法嵌套结构来定义标识符和具体变量和函数的关联。一个词法环境由环境记录器和一个可能的引用外部词法环境的空值组成。

简单来说 词法环境 是一种持有 标识符—变量映射 的结构。这里的 标识符 指的是变量/函数的名字，而 变量 是对实际对象（包含函数类型对象）或原始数据的引用。

> 这块看不懂没关系，你可以把它理解为 ES3 中的 变量对象，因为它们本质上做的是类似的事情，这里只是先把官方给出的定义放上来。这块概念比较烦：词法环境还分为两种，然后内部有个环境记录器还分两种，这些概念在后面会用列表的形式归纳整理出来详细说明。

## ES5 中的变量环境

变量环境 它也是一个 词法环境 ，所以它有着词法环境的所有特性。

之所以在 `ES5` 的规范力要单独分出一个变量环境的概念是为 `ES6` 服务的： 在 `ES6` 中，词法环境组件和 变量环境 的一个不同就是前者被用来存储函数声明和变量（`let 和 const`）绑定，而后者只用来存储 var 变量绑定。

> 在上下文创建阶段，引擎检查代码找出变量和函数声明，变量最初会设置为 undefined（var 情况下），或者未初始化（let 和 const 情况下）。这就是为什么你可以在声明之前访问 var 定义的变量（虽然是 undefined），但是在声明之前访问 let 和 const 的变量会得到一个引用错误。

## ES5 执行上下文的生命周期

### 创建阶段

创建阶段即函数被调用的时候，但未执行任何其内部代码之前，主要做三件事：

- 确定 this 的值，也称为 This Binding
- LexicalEnvironment（词法环境）组件被创建
- VariableEnvironment（变量环境）组件被创建

#### This Binding

确定 this 的值我们前面讲到过，this 的值是在执行的时候才能确定，定义的时候不能确定

::: tip 注意区分作用域链
作用域链是在函数定义的时候就已经确定了，this 是在执行的时候确定
:::

#### LexicalEnvironment（词法环境）组件

词法环境有两个组成部分：

- 全局环境：是一个没有外部环境的词法环境，其外部环境引用为 null，有一个全局对象，this 的值指向这个全局对象
- 函数环境：用户在函数中定义的变量被存储在环境记录中，包含了 arguments 对象，外部环境的引用可以是全局环境，也可以是包含内部函数的外部函数环境

伪代码如下：

```js
// ============== 全局执行上下文 ==============
GlobalExectionContext = {
  LexicalEnvironment: {
    EnvironmentRecord: {
      Type: "Object",       // 全局环境记录类型为对象式
      // 此处存储全局变量/函数绑定（如：var, function声明）
      // 示例：a: 10, foo: <function>
    },
    outer: null             // 全局环境无外部引用（作用域链顶端）
  }
}

// ============== 函数执行上下文 ==============
FunctionExectionContext = {
  LexicalEnvironment: {
    EnvironmentRecord: {
      Type: "Declarative",  // 函数环境记录类型为声明式
      // 此处存储函数局部变量/参数（如：let, const, arguments）
      // 示例：x: undefined, inner: <function>
    },
    outer: <Global or outer function environment reference>
    // 指向外层环境（形成作用域链）
  }
}
```

#### VariableEnvironment（变量环境）组件

变量环境也是一个词法环境，因此它具有上面定义的词法环境的所有属性
在 ES6 中，词法环境和变量环境的区别在于前者用于存储函数声明和变量（1et 和 const）绑定，而后者仅用于存储变量（var）绑定

举个例子

```js
let a = 20;
const b = 30;
var c;

function multiply(e, f) {
  var g = 20;
  return e * f * g;
}
c = multiply(10, 20);
```

执行上下文如下：

```js
// ============== 全局执行上下文 ==============
GlobalExectionContext = {
  ThisBinding: <Global Object>,  // 全局this指向window/global

  LexicalEnvironment: {          // 词法环境（处理let/const/class）
    EnvironmentRecord: {
      Type: "Object",            // 全局环境记录类型为对象式
      // 标识符绑定（let/const/function声明）
      a: <uninitialized>,        // let/const存在暂时性死区
      b: <uninitialized>,
      multiply: <func>           // 函数声明已初始化
    },
    outer: <null>                // 作用域链终点
  },

  VariableEnvironment: {         // 变量环境（处理var）
    EnvironmentRecord: {
      Type: "Object",
      // 标识符绑定（var声明）
      c: undefined,              // var变量提升并初始化为undefined
    },
    outer: <null>
  }
}

// ============== 函数执行上下文 ==============
FunctionExectionContext = {
  ThisBinding: <Global Object>,  // 函数this指向（此处为默认绑定）

  LexicalEnvironment: {
    EnvironmentRecord: {
      Type: "Declarative",       // 函数环境记录类型为声明式
      // 存储函数参数和局部变量
      Arguments: {0: 20, 1: 30, length: 2},  // 参数对象
    },
    outer: <GlobalLexicalEnvironment>  // 指向全局词法环境
  },

  VariableEnvironment: {
    EnvironmentRecord: {
      Type: "Declarative",
      // 存储函数内var声明
      g: undefined               // var变量提升
    },
    outer: <GlobalLexicalEnvironment>
  }
}
```

留意上面的代码，`Let`和`const`定义的变量 a 和 b 在创建阶段没有被赋值，但 var 声明的变量从在创建阶段被赋值为`undefined`这是因为，创建阶段，会在代码中扫描变量和函数声明，然后将函数声明存储在环境中,但变量会被初始化为`undefined`(var 声明的情况下)和保持 uninitialized(未初始化状态)（使用 Let 和 const 声明的情况下）这就是变量提升的实际原因

### 执行阶段

在这阶段，执行变量赋值、代码执行
如果 Javascript 引擎在源代码中声明的实际位置找不到变量的值，那么将为其分配`undefined`值

### 回收阶段

执行上下文出栈等待虚拟机回收执行上下文

## ES5 执行上下文总结

### 全局上下文的创建

程序启动，全局上下文被创建

1. 创建全局上下文的 词法环境

   - 创建 对象环境记录器 ，它用来定义出现在 全局上下文 中的变量和函数的关系（负责处理 let 和 const 定义的变量）
   - 创建 外部环境引用，值为 null

2. 创建全局上下文的 变量环境

   - 创建 对象环境记录器，它持有 变量声明语句 在执行上下文中创建的绑定关系（负责处理 var 定义的变量，初始值为 undefined 造成声明提升）
   - 创建 外部环境引用，值为 null

3. 确定 this 值为全局对象（以浏览器为例，就是 window ）

### 函数调用时函数上下文的创建

函数被调用，函数上下文被创建

1. 创建函数上下文的 词法环境

   - 创建 声明式环境记录器 ，存储变量、函数和参数，它包含了一个传递给函数的 arguments 对象（此对象存储索引和参数的映射）和传递给函数的参数的 length。（负责处理 let 和 const 定义的变量）
   - 创建 外部环境引用，值为全局对象，或者为父级词法环境（作用域）

2. 创建函数上下文的 变量环境

   - 创建 声明式环境记录器 ，存储变量、函数和参数，它包含了一个传递给函数的 arguments 对象（此对象存储索引和参数的映射）和传递给函数的参数的 length。（负责处理 var 定义的变量，初始值为 undefined 造成声明提升）
   - 创建 外部环境引用，值为全局对象，或者为父级词法环境（作用域）

3. 确定 this 值

### 进入函数执行阶段

进入函数执行上下文的执行阶段

1. 在上下文中运行/解释函数代码，并在代码逐行执行时分配变量值

   - 对词法环境中的变量（let/const 声明）进行赋值（此时才结束"暂时性死区"）
   - 对变量环境中的变量（var 声明）进行赋值（覆盖初始的 undefined 值）
   - 执行函数体内的可执行代码：
     - 遇到变量引用时，先在当前词法环境查找，未找到则通过外部环境引用链式查找
     - 遇到函数调用时，创建新的函数执行上下文并压入调用栈
   - 根据代码逻辑动态修改词法环境和变量环境中的绑定值

2. 如果遇到 return 语句或函数执行完毕
   - 返回值会被传递到调用上下文
   - 当前执行上下文被弹出调用栈
   - 相关内存空间进入可回收状态（除非形成闭包）

## 执行栈

当一段脚本运行起来的时候，可能会调用很多函数并产生很多函数执行上下文，那么问题来了，这些执行上下文该怎么管理呢？为了解决这个问题，`javascript` 引擎就创建了 “执行上下文栈” （`Execution context stack` 简称 ECS）来管理执行上下文。

顾名思义，执行上下文栈是栈结构的，因此遵循 LIFO（后进先出）的特性，代码执行期间创建的所有执行上下文，都会交给执行上下文栈进行管理。

当 JS 引擎开始解析脚本代码时，会首先创建一个全局执行上下文，压入栈底（这个全局执行上下文从创建一直到程序销毁，都会存在于栈的底部）。

每当引擎发现一处函数调用，就会创建一个新的函数执行上下文压入栈内，并将控制权交给该上下文，待函数执行完成后，即将该执行上下文从栈内弹出销毁，将控制权重新给到栈内上一个执行上下文。举个例子:

```js
// ============== 代码复刻 ==============
let a = 'Hello World!'; // 红色关键字 let

function first() {
  // 红色关键字 function
  console.log('Inside first function');

  second(); // 调用 second()

  console.log('Again inside first function');
}

function second() {
  // 红色关键字 function
  console.log('Inside second function');
}

first(); // 触发调用栈
console.log('Inside Global Execution Context');
```

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250709160252145.png)

简单分析一下流程：

- 创建全局上下文请压入执行栈
- f1rst 函数被调用，创建函数执行上下文并压入栈
- 执行 first 函数过程遇到 second 函数，再创建一个函数执行上下文并压入栈
- second 函数执行完毕，对应的函数执行上下文被推出执行栈，执行下一个执行上下文 first 函数
- f1st 函数执行完毕，对应的函数执行上下文也被推出栈中，然后执行全局上下文
- 所有代码执行完毕，全局上下文也会被推出栈中，程序结束

## 递归和栈溢出

在了解了调用栈的运行机制后，我们可以考虑一个问题，这个执行上下文栈可以被无限压栈吗？很显然是不行的，执行栈本身也是有容量限制的，当执行栈内部的执行上下文对象积压到一定程度如果继续积压，就会报 “栈溢出（`stack overflow`）” 的错误。栈溢出错误经常会发生在 递归 中。

## 尾递归优化

针对递归存在的 “爆栈” 问题，我们可以学习一下 尾递归优化。“递归” 我们已经了解了，那么 “尾” 是什么意思呢？“尾” 的意思是 “尾调用（Tail Call）”，即函数的最后一步是返回一个函数的运行结果

尾调用之所以与其他调用不同，就在于它的特殊的调用位置。尾调用由于是函数的最后一步操作，所以不需要保留外层函数的相关信息，因为调用位置、内部变量等信息都不会再用到了，只要直接用内层函数的调用记录，取代外层函数的调用记录就可以了，这样一来，运行尾递归函数时，执行栈永远只会新增一个上下文。
