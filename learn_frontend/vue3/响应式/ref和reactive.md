# 响应式基础

[[toc]]
所谓的响应式就是状态变更触发视图更新

## reactive 函数

### 定义深层次响应式对象

作用：reactive 函数可以定义一个响应式对象。
语法：`let 响应式对象= reactive(源对象)。`
返回值：返回一个 Proxy 的实例对象，简称：响应式对象

::: warning 注意

- reactive 函数只能处理对象，不能处理基本数据类型。
- reactive 定义的响应式数据是**深层次**的，对象中的嵌套对象也会被 reactive 函数处理。

:::

```js {13-14}
import { isProxy, reactive, ref } from 'vue';
// 定义响应式对象userList 其内部元素也是响应式代理对象
const userList = reactive([
  {
    id: 1,
    name: '张三',
  },
  {
    id: 2,
    name: '李四',
  },
]);
console.log(isProxy(userList)); // true 对象本身是响应式对象
console.log(isProxy(userList[0])); // => true 对象内部的对象也是响应式对象
```

### 局限性

#### 只能处理对象

1. 只能处理对象，不能处理基本数据类型。

#### 解构后的属性失去响应式

2. 解构后的属性不再具有响应式：当我们将响应式对象的原始类型属性解构为本地变量时，或者将该属性传递给函数时，我们将丢失响应性连接：

```js
const state = reactive({ count: 0 });

// 当解构时，count 已经与 state.count 断开连接
let { count } = state;
// 不会影响原始的 state
count++;

// 该函数接收到的是一个普通的数字
// 并且无法追踪 state.count 的变化
// 我们必须传入整个对象以保持响应性
callSomeFunction(state.count);
```

#### 不能替换整个对象

3. 不能替换整个对象:由于 reactive 会返回 proxy 对象，对于对象来说一般保持的是对象的引用，所以如果替换了响应式对象，那么原来的响应式对象将会失去连接

```js
let state = reactive({ count: 0 });

// 上面的 ({ count: 0 }) 引用将不再被追踪
// (响应性连接已丢失！)
state = reactive({ count: 1 });
```

## ref 函数

### 定义响应式基本类型变量

作用：ref 函数可以将基本数据类型变量变为响应式的。
语法：`let xxx = ref(基本数据类型)`
返回值：一个`RefImpl`的实例对象，简称 ref 对象或 ref，**ref 对象的 value 属性是响应式的**

```js {3}
const count = ref(0);
console.log(count); // { value: 0 }
console.log(count.value); // 0
count.value++;
console.log(count.value); // 1
```

### 定义深层次响应式对象

作用：ref 函数可以将对象变为响应式，且也是深层次的响应式对象。
语法：`let xxx = ref(对象)`
返回值：一个`RefImpl`的实例对象，简称 ref 对象或 ref，**ref 对象的 value 属性是响应式的**

```js {11}
const userList = ref([
  {
    id: 1,
    name: '张三',
  },
  {
    id: 2,
    name: '李四',
  },
]);
console.log(userList.value); // [{id: 1, name: '张三'}, {id: 2}]
// 可以看出调用了reactive函数，因为是proxy对象
console.log(isProxy(userList.value)); // true
```

::: tip 关于为什么 ref 函数可以处理对象
ref 在处理对象的时候也是调用了 reactive 函数，所以 ref 也可以处理对象且是深层次的响应式对象。
:::

### ref 对象的解包

在 vue 中 ref 对象是一个包装对象，其中的 value 属性是响应式的，ref 对象本身不是响应式的。所以使用 ref 对象时必须要用`.value` 来获取值，否则会报错。但是有一些场景不需要使用`.value`来获取值，这就叫做解包。下列列出了几种解包相关场景:

#### ref 对象作为深层次响应对象的属性时会自动解包

一个 ref 会在作为响应式对象的属性被访问或修改时自动解包。换句话说，它的行为就像一个普通的属性：

```js
const count = ref(0);
const state = reactive({
  count,
});
// 自动解包，不再需要value
console.log(state.count); // 0
// 自动解包
state.count = 1;
console.log(count.value); // 1
```

::: warning 注意
只有当嵌套在一个深层响应式对象内时，才会发生 ref 解包。当其作为**浅层响应式对象**的属性被访问时不会解包。
:::

#### ref 对象在数组和集合中不会自动解包

与 reactive 对象不同的是，当 ref 作为响应式数组或原生集合类型 (如 Map) 中的元素被访问时，它不会被解包：

```js
const books = reactive([ref('Vue 3 Guide')]);
// 这里需要 .value
console.log(books[0].value);

const map = reactive(new Map([['count', ref(0)]]));
// 这里需要 .value
console.log(map.get('count').value);
```

#### 在模板中顶级的 ref 对象会自动解包

在模板渲染上下文中，只有顶级的 ref 属性才会被解包。非顶级的 ref 属性只有是文本插值的最终计算值时才会自动解包。
在下面的例子中，count 和 object 是顶级属性，但 object.id 不是：

```vue
<template>
  <div>
    {/* count作为顶级属性，会自动解包 ，结果为 1 */}
    {{ count }}
    {/* object.id 不是顶级属性，但是单独出现，会自动解包，结果为 1 */}
    {{ object.id }}
    {/* object.id 作为顶级属性, 但是不是单独出现，不会自动解包 ,结果为 [object Object]1 */}
    {{ object.id + 1 }}
    {/* object.id解构为一个顶级属性 ,结果为 1 */}
    {{ id + 1 }}
  </div>
</template>
<script>
// 顶级的ref
const count = ref(0);
// 非顶级的ref
const object = { id: ref(1) };
</script>
```
