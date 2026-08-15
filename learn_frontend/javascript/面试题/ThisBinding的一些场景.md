---
order: 171
---

# ThisBinding

[[toc]]

## 函数调用时的 this

### 严格模式下

this 为 undefined

```js
'use strict';
function showThis() {
  console.log(this); // undefined
}

showThis(); // this 为 undefined
```

### 非严格模式下

this 为全局对象 (window/global)

```js
function showThis() {
  console.log(this); // Window (浏览器环境) / global (Node.js)
}

showThis(); // 默认绑定到全局对象
```

## 方法调用时的 this

当调用对象中的方法时，方法的调用上下文就是该对象

```js {6}
let calculator = {
  // 对象字面量
  operand1: 1,
  operand2: 1,
  add() {
    // 使用this引用包含对象calculator
    this.result = this.operand1 + this.operand2;
  },
};

calculator.add(); // 方法调用，计算1+1
console.log(calculator.result); // => 2
```

## 嵌套函数的 this

### 方法中有嵌套函数时

当方法中有嵌套函数时，嵌套函数不会继承对象方法的调用上下文

```js {4,10}
let o = {
  // 对象o
  m: function () {
    console.log(this === o); // => true: this 是对象o

    f(); // 函数声明f提升 调用嵌套函数f()

    function f() {
      // 嵌套函数f
      console.log(this === o); // => false: this 是全局对象或undefined
    }
  },
};

o.m(); // 在对象o上调用方法m
```

### 解决嵌套函数无法继承方法调用上下文的方案

解决嵌套函数无法继承方法调用上下文的方案有如下几种：

1. 把 this 值赋给变量 self：嵌套函数可以访问包裹方法中的变量

```js {5,12}
let o = {
  // 对象o
  m: function () {
    // 对象的方法m
    let self = this; // 把this值保存在变量中
    console.log(this === o); // => true: this 是对象o
    f(); // 调用嵌套函数f()

    function f() {
      // 嵌套函数f
      console.log(this === o); // => false: this 是全局对象或undefined
      console.log(self === o); // => true: self 是外部的this值
    }
  },
};

o.m(); // 在对象o上调用方法m
```

2. 使用箭头函数表达式作为嵌套函数:箭头函数不会创建自己的 this 上下文，而是**继承定义时所处上下文的 this 值**

```js
let o = {
  m: function () {
    // 箭头函数继承外部m方法的this
    const f = () => {
      console.log(this === o); // true (自动继承，定义时所处上下文是o)
    };
    // 由于不是函数声明而是箭头函数表达式所以必须要先定义再调用
    f();
  },
};
o.m();
```

3. 使用 bind 强制改变 this: 函数表达式使用立即执行函数创建一个匿名函数并通过 bind 改变 this

```js
let o = {
  m: function () {
    // 箭头函数继承外部m方法的this
    const f = `(` function () {
      this === o; // true，因为我们把这个函数绑定到了外部的this
    } `)`.bind(this);
    // 由于不是函数声明而是箭头函数表达式所以必须要先定义再调用
    f();
  },
};
o.m();
```

### 函数中有嵌套函数

函数中还有嵌套函数其 this 为 undefined（严格模式）或 window（非严格模式）

```js
function outer() {
  console.log(this); // 全局对象（浏览器中是 window）或 undefined（严格模式）

  function inner() {
    console.log(this); // 同上
  }
  inner();
}
outer();
```

## 构造函数调用时

如果函数或方法前加了 new 关键字，它就是一个构造函数
| 构造函数返回值情况 | this 指向 | instanceof 结果 | 最终返回的对象 |
| ------------------ | ------------ | --------------- | -------------------------- |
| 无返回值 | 新创建的对象 | true | this（新对象） |
| 返回原始值 | 新创建的对象 | true | this（新对象，忽略原始值） |
| 返回对象 | 返回的对象 | false | 返回的对象（覆盖 this） |

### 构造函数没有返回值或返回原始类型时

当构造函数没有返回值或者返回的是一个原始值，这个返回值会被忽略，此调用上下文 this 指向通过构造函数新创建的对象，然后默认返回这个 this，这个对象会继承构造函数.prototype 原型对象

1. 没有返回值

```js {7}
function Person(name) {
  this.name = name;
  // 没有 return，默认返回 this（新创建的对象）
}

const alice = new Person('Alice');
console.log(alice.name); // "Alice"
console.log(alice instanceof Person); // true
```

- new Person("Alice") 创建了一个新对象 {}，并让 this 指向它。
- this.name = name 给这个新对象添加了 name 属性。
- 由于没有 return，默认返回 this，即新创建的对象 { name: "Alice" }。
- alice instanceof Person 为 true，因为 alice 是从 Person.prototype 继承的

2. 返回原始值

```js {7}
function Dog(name) {
  this.name = name;
  return 123; // 返回原始值，会被忽略
}

const myDog = new Dog('Buddy');
console.log(myDog.name); // "Buddy"
console.log(myDog instanceof Dog); // true
```

- 虽然 return 123，但 JavaScript 会忽略原始值（非对象），仍然返回 this。
- 所以 myDog 仍然是 { name: "Buddy" }，并且 instanceof Dog 为 true。

### 构造函数返回对象时

当构造函数有返回值且返回一个对象时，构造函数的调用上下文 this 指向的就是返回的这个对象

```js{7}
function Car(brand) {
  this.brand = brand;
  return { brand: 'Tesla' }; // 返回一个对象
}

const myCar = new Car('Toyota');
console.log(myCar.brand); // "Tesla"（不是 "Toyota"）
console.log(myCar instanceof Car); // false
```

- new Car("Toyota") 本应返回 { brand: "Toyota" }，但由于 return { brand: "Tesla" }，这个对象会覆盖默认的 this。
- 最终 myCar 是 { brand: "Tesla" }，而不是 { brand: "Toyota" }。
- myCar instanceof Car 为 false，因为它不是从 Car.prototype 继承的。

## 改变 this 的三种方式（函数间接调用）

下面三个方法都能改变函数执行时的 this
| 特性 | call | apply | bind |
|--------------------|-------------------------------------|-------------------------------------|-------------------------------------|
| **作用** | 立即调用函数，指定 `this` 和参数 | 立即调用函数，指定 `this` 和参数数组 | 返回绑定 `this` 和参数的新函数 |
| **语法** | `func.call(thisArg, arg1, arg2...)` | `func.apply(thisArg, [argsArray])` | `func.bind(thisArg, arg1, arg2...)` |
| **参数传递** | 逐个参数传递 | 数组形式传递 | 逐个参数传递（可部分绑定） |
| **执行时机** | 立即执行 | 立即执行 | 返回新函数，需手动调用 |
| **返回值** | 原函数的返回值 | 原函数的返回值 | 绑定后的新函数 |
| **是否改变原函数** | 否 | 否 | 否 |
| **使用场景** | 明确参数个数时 | 参数数量动态时 | 需要延迟执行或固定 `this` |
| **与 `new` 交互** | 可配合 `new` | 可配合 `new` | 绑定的 `this` 会被 `new` 覆盖 |
| **性能** | 无额外开销 | 无额外开销 | 每次调用生成新函数 |
| **现代替代** | 展开运算符（`...args`） | 展开运算符（`...args`） | 箭头函数（自动绑定外层 `this`） |

### call 方法

```js
const person = {
  name: 'Alice',
  greet: function (greeting, punctuation) {
    console.log(`${greeting}, ${this.name}${punctuation}`);
  },
};

const anotherPerson = { name: 'Bob' };

// 使用 call 改变 this 指向,此时greet方法的this是anotherPerson对象
person.greet.call(anotherPerson, 'Hello', '!'); // 输出: Hello, Bob!
```

### apply 方法

```js
function introduce(language, hobby) {
  console.log(`I'm ${this.name}, I code in ${language} and love ${hobby}`);
}

const developer = { name: 'Charlie' };

// 使用 apply 改变 this 指向，此时introduce函数的this是developer对象
introduce.apply(developer, ['JavaScript', 'gaming']);
// 输出: I'm Charlie, I code in JavaScript and love gaming
```

### bind 方法

```js
const car = {
  brand: 'Toyota',
  showInfo: function (model, year) {
    console.log(`This is a ${year} ${this.brand} ${model}`);
  },
};

const anotherCar = { brand: 'Honda' };

// 使用 bind 创建新函数，目前只传递了model参数后续只用传递一个参数了
const boundFunc = car.showInfo.bind(anotherCar, 'Civic');
boundFunc(2022); // 输出: This is a 2022 Honda Civic
```

### 严格模式和非严格模式下的绑定 null 或 undefined

1. 非严格模式

```js
function test() {
  console.log(this);
}

test.call(null); // window
test.apply(undefined, []); // window
```

2. 严格模式

```js
'use strict';
function test() {
  console.log(this);
}

test.call(null); // null
test.apply(undefined, []); // undefined
```

## 函数隐式调用时的 this

### 属性访问器方法中的 this

在属性 getter/setter 中，this 指向当前操作的对象

```js
const obj = {
  _value: 0,
  get value() {
    console.log(this === obj); // true
    return this._value;
  },
  set value(v) {
    console.log(this === obj); // true
    this._value = v;
  },
};

obj.value; // getter 调用，this 指向 obj
obj.value = 5; // setter 调用，this 指向 obj
```

### 对象转换方法 valueOf/toString 中的 this

在 toString() 和 valueOf() 方法中，this 指向需要转换的对象

```js
const obj = {
  toString() {
    console.log(this === obj); // true
    return '[object Custom]';
  },
  valueOf() {
    console.log(this === obj); // true
    return 42;
  },
};

// 字符串上下文
'Object: ' + obj; // 调用 toString(), this 指向 obj

// 数值上下文
Number(obj); // 调用 valueOf(), this 指向 obj
```

### 迭代器方法中的 this

- `[Symbol.iterator]()` 方法中的 this 指向被迭代的对象
- 迭代器方法内部通常使用箭头函数保持 this 绑定

```js
const iterable = {
  [Symbol.iterator]() {
    console.log(this === iterable); // true
    return {
      next: () => {
        console.log(this === iterable); // true (箭头函数保留外层 this)
        return { done: true };
      },
    };
  },
};

for (const x of iterable) {
} // 调用 [Symbol.iterator](), this 指向 iterable
```

### 标签模板函数中的 this

- 标签函数的 this 绑定遵循普通函数规则
- 取决于调用上下文，默认绑定到全局对象或 undefined(严格模式)

```js
function tag(strings, ...values) {
  console.log(this === window); // true (非严格模式)
}

const obj = {
  method() {
    tag`template`; // this 取决于调用方式
  },
};

tag`template`; // this 指向全局对象(非严格模式)或undefined(严格模式)
obj.method(); // this 指向 obj
```

### 代理对象方法中的 this

- 代理陷阱函数(如 get)中的 this 指向处理器对象(handler)
- 通过代理调用的方法，其 this 指向代理对象而非目标对象

```js
const target = {
  method() {
    console.log(this === proxy); // true
  },
};

const proxy = new Proxy(target, {
  get(target, prop, receiver) {
    console.log(this === handler); // true (陷阱函数的 this)
    return Reflect.get(target, prop, receiver);
  },
});

proxy.method(); // 调用时 this 指向 proxy 而非 target
```

## 箭头函数调用时

箭头函数的 this 是从定义他们的上下文中继承的，而不会根据调用它们的对象来动态设置

比如这个防抖函数

```html {13,21,23}
<div>
  <input type="text" class="search" />
</div>
<script>
  // 防抖函数
  function debounce(fn, delay = 500) {
    let timer;
    return function (...args) {
      const context = this; // 获取当前调用的 this
      clearTimeout(timer);
      timer = setTimeout(() => {
        // 从父级上下文中继承 this
        console.log(this);
        fn.apply(context, args); // 使用当前调用的 this
      }, delay);
    };
  }
  const handleSearch = debounce(() => {
    console.log('我输入了,触发搜索');
  }, 1000);
  // handleSearch函数中的this是input元素
  document.querySelector('.search').addEventListener('input', handleSearch);
  // handleSearch函数中的this是window
  document.querySelector('.search').addEventListener('input', () => {
    handleSearch();
  });
</script>
```

## 事件回调函数中的 this

绑定事件的回调函数时

- 如果不使用箭头函数则是触发事件的元素对象
- 如果使用箭头函数则继承父级上下文的 this（window）

```html
<button id="btn">按钮</button>
<script>
  btn.addEventListener('click', function () {
    console.log(this); // btn元素
  });
  btn.addEventListener('click', () => {
    console.log(this); // window
  });
</script>
```
