# Vue3 的设计思想和原理

[[toc]]

## 设计思想

1. 拆分模块：Vue3.0 更注重模块上的拆分，在 2.0 中无法单独使用部分模块。需要引入完整的 vue.js(例如只想使用响应式部分，但是需要引入完整的 vue.js),Vue3 中的模块之间耦合度低，模块可以独立使用。
2. 重写 API：vue2 中很多方法挂载到了实例中导致没有使用也会被打包（还有很多组件也是一样）。通过构建工具 Tree-shaking 机制实现按需引入，减少用户打包后体积。重写 API
3. 扩展更方便：vue3 允许自定义渲染器，扩展能力强。不会发生以前的事情，改写 ue 源码改造渲染方式。
4. 兼容性处理：依然保留 Vue2 的特色
5. 面向 ts：Vue2 采用 Flow 来进行类型检测(Vue2 中对 TS 支持并不友好)，vue3 源码采用 Typescript 来进行重写，对 Ts 的支持更加友好。

## 声明式架构

- 早在`JQuery`的时代编写的代码都是命令式的，命令式框架重要特点就是关注过程
- 声明式框架更加关注结果。命令式的代码封装到了 vuejs 中，过程靠 vuejs 来实现

:::code-group

```js [命令式]
const numbers = [1, 2, 3, 4, 5];
let total = 0;
for (let i = 0; i < numbers.length; i++) {
  total += numbers[i];
}
```

```js [声明式]
let total2 = numbers.reduce(function (memo, current) {
  return memo + current;
});
```

:::

## 采用虚拟 DOM

传统更新页面，拼接一个完整的字符串 `innerHTML` 全部重新渲染，添加虚拟 DOM 后，可以比较新旧虚拟节点，找到变化在进行更新。虚拟 DOM 就是一个对象，用来描述真实 DOM 的

```js
const vnode = {
  __v_isVNode: true,
  __v_skip: true,
  type,
  props,
  key: props && normalizeKey(props),
  ref: props && normalizeRef(props),
  children,
  component: null,
  el: null,
  patchFlag,
  dynamicProps,
  dynamicChildren: null,
  appContext: null,
};
```

## 区分编译时和运行时

我们需要有一个虚拟 DOM，调用渲染方法将虚拟 DOM 渲染成真实 DOM（缺点就是虚拟 DOM 编写麻烦）所以 Vue 专门写了一个编译时可以将模板编译成虚拟 DOM（在构建时进行编译性能更高，不需要在运行时进行编译）

## vue3 项目目录结构

![vue3的项目结构](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250911110057728.png)
