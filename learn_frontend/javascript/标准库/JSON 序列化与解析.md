---
order: 119
---

# JSON 序列化与解析

[[toc]]

## 什么是序列化与解析

所谓的序列化就是指将内存中的数据结构转化为字符或字节序列用以保存或在网络上进行传输。解析就是将字符或字节序列还原为原来的数据结构。
JS 中序列化数据的最简单的方式就是使用一种称为 json 的序列化格式。就是用 json 格式的字符串来表示数据结构或者对象。只不过这个 json 字符串能够实现在网络上进行传输。说白了 json 就是 ECMAScript 下的一个标准，通过这个标准能够很好的实现数据的传输

## JS 中 json 支持的数据类型

对象序列化就是把对象的状态转换为字符串的过程，之后可以从中恢复对象的状态
函数`JSON.stringify()`和`JSON.parse()`。用于序列化和恢复 JavaScript 对象。
**JSON 语法是 JavaScript 语法的子集，不能表示所有 JavaScript 的值**。

- 可以序列化和恢复的值包括对象，数组、字符串、有限数值,true, false 和 null。
- `NaN`, `Infinity`和`-Infinity`会被序列化为 null。
- 日期对象会被序列化为 ISO 格式的日期字符串，但`JSON.parse()`会保持其字符串形式，不会恢复原始的日期对象。
- 函数、`RegExp`、`Symbol`和`Error`对象以及`undefined` 值不能被序列化或恢复。
- `JSON.stringify()`只序列化对象的可枚举自有可枚举属性。如果属性值无法序列化，则该属性会从输出的字符串中删除。

```js
let m = new Map([
  ['k1', 1],
  ['k2', 2],
]);
// js不支持对Map对象进行序列化
console.log(JSON.stringify(m)); //{}

let obj = {
  k1: 1,
  k2: 2,
};
// 对普通的对象进行序列化
console.log(JSON.stringify(obj)); // {"k1":1,"k2":2}
```

## 对象的深拷贝

有一个使用技巧就是使用 parse 和 stringify 能够实现对对象的深拷贝，即便效率比较低

```js
// 通过stringify和parse来实现对对象的深拷贝
function deepcopy(o) {
  return JSON.parse(JSON.stringify(o));
}
```

## 个性化的序列化

### stringify

语法：`JSON.stringify(value[, replacer [, space]])`

1. `value`：将要序列化成 一个 JSON 字符串的值。
2. `replacer` 可选：
   - 如果该参数是一个函数，则在序列化过程中，被序列化的值的每个属性都会经过该函数的转换和处理；
   - 如果该参数是一个数组，则只有包含在这个数组中的属性名才会被序列化到最终的 JSON 字符串中；
   - 如果该参数为 null 或者未提供，则对象所有的属性都会被序列化。
3. `space` 可选：指定缩进用的空白字符串，用于美化输出（pretty-print）；
   - 如果参数是个数字，它代表有多少的空格；上限为 10。该值若小于 1，则意味着没有空格；
   - 如果该参数为字符串（当字符串长度超过 10 个字母，取其前 10 个字母），该字符串将被作为空格；
   - 如果该参数没有提供（或者为 null），将没有空格。

::: code-group

```js [第二个参数为数组]
let o1 = {
  name: '小李',
  age: 17,
};
let s1 = JSON.stringify(o1);
console.log(s1);
// 序列化中仅仅保留age属性
let s2 = JSON.stringify(o1, ['age']);
console.log(s2); // {"age":17}
```

```js [第二个参数为replacer函数]
let s3 = JSON.stringify(o1, function (k, v) {
  // 返回的内容将会被作为新的属性值被序列化
  if (typeof v === 'string') {
    return '小兰';
  }
  // 当返回undefined的时候，这个属性值会被移除
  if (typeof v === 'number') {
    return undefined;
  }
  return v;
});
console.log(s3); // {"name":"小兰"}
```

```js [Symbol等会被忽略的值]
// 当遇到undefined、任意的函数以及 symbol 值
// 在序列化过程中会被忽略（出现在非数组对象的属性值中时）或者被转换成 null（出现在数组中时）。
// 函数、undefined 被单独转换时，会返回 undefined，如JSON.stringify(function(){}) or JSON.stringify(undefined).
let a1 = [undefined, function () {}, Symbol('name')];
console.log(JSON.stringify(a1)); // [null,null,null]
let o2 = {
  doSome() {},
  [Symbol('name')]: '小米',
};
console.log(JSON.stringify(o2)); // {}
```

```js [日期对象]
// 转换值如果有 toJSON() 方法，该方法定义什么值将被序列化。
// Date对象已经实现了toJSON方法，返回值和toISOString方法返回的值是一样的
let d1 = new Date();
let j1 = JSON.stringify(d1);
console.log(j1);
```

```js [NaN 和 Infinity]
// NaN 和 Infinity 格式的数值及 null 都会被当做 null。
console.log(JSON.stringify(NaN));
// 其他类型的对象，包括 Map/Set/WeakMap/WeakSet，仅会序列化可枚举的属性。
// 不可枚举的属性默认会被忽略：
JSON.stringify(
  Object.create(null, {
    x: { value: 'x', enumerable: false },
    y: { value: 'y', enumerable: true },
  }),
);
```

:::

### parse

对于 parse 函数来说，可以接受一个复活函数，如果指定了这个“复活”函数，该函数就会在解析输入字符串中的每个原始值时被调用(但解析包含这些原始值的对象和数组时不会调用)
调用这个函数时会给它传入两个参数。

- 第一个是属性名，可能是对象属性名，也可能是转换为字符串的数组索引。
- 第二个参数是该对象属性或数组元素对应的原始值。

复活函数的返回值会变成命名属性的新值

- 如果复活函数返回它的第二个参数，那么属性保持不变。
- 如果它返回 undefined,则想应的命名属性会从对象或数组中删除，即 JSON.parse() 返回给用户的对象中将不包含该属性。

```js
let obj = {
  name: '小明',
  age: 15,
};
let j1 = JSON.stringify(obj);
// 传入复活函数
let o1 = JSON.parse(j1, (k, v) => {
  // 返回value则不改变原始属性
  return v;
});
console.log(o1); // { name: '小明', age: 15 }

let d1 = new Date();
let s2 = JSON.stringify(d1);
console.log(s2);
let d2 = JSON.parse(s2, (k, v) => {
  //删除以下划线开头的属性和值
  if (k[0] === '_') return undefined;
  // 如果模式匹配则返回时间对象
  if (typeof v === 'string') {
    return new Date(v);
  }
});
console.log(d2); // 字符串的日期转换为了日期对象
```
