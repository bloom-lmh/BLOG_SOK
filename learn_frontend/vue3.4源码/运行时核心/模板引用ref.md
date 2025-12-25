# 模板引用 ref

## 介绍

来我们先来看看官方对模板引用的介绍：模板引用就是使用一个`ref`属性，在元素**实例被挂载后**，用它来承接这个元素的真实 DOM 元素或组件实例：

1. 如果这个元素是一个组件那么`ref`属性会返回组件实例。
2. 如果这个元素是一个原生元素，那么`ref`属性会返回原生元素的真实 DOM 元素。

::: warning 注意
如果一个子组件使用的是选项式 API 或没有使用 `<script setup>`，被引用的组件实例和该子组件的 this 完全一致。这意味着父组件对子组件的每一个属性和方法都有完全的访问权。
有一个例外的情况，使用了 `<script setup>` 的组件是默认私有的：一个父组件无法访问到一个使用了 `<script setup>` 的子组件中的任何东西，除非子组件在其中通过 `defineExpose` 宏显式暴露
:::

还有`ref`可以绑定为函数，这样元素每次更新时都会调用这个函数，并且传入这个元素的真实 DOM 元素或组件实例。

```html
<input :ref="(el) => { /* 将 el 赋值给一个数据属性或 ref 变量 */ }" />
```

## 示例

```js
// 子组件
const ChildComponent = {
  props: {
    a: Number,
  },
  setup(props, { emit, attrs, expose, slots }) {
    // ref只能访问子组件暴露的对象
    expose({
      a: 200,
    });
    return () => {
      return h('div', {}, props.a);
    };
  },
};
// 父组件
const ParentComponent = {
  setup(props, { emit, attrs, expose, slots }) {
    const comp = ref(null);
    // 子组件挂载后才能获取
    onMounted(() => {
      // 200
      console.log(comp.value.a);
    });
    return () => {
      // 在子组件使用ref获取
      return h(ChildComponent, { a: 100, ref: comp });
    };
  },
};
render(
  // 组件被挂载到一个虚拟节点的type上
  h(ParentComponent, {}),
  app,
);
```

## 源码解析

其实这个实现起来十分的简单，就是在每一次 patch 操作完成的时候，如果这个节点有`ref`属性就将其赋值给`ref`属性。我们来看一下源码实现：

```js
/**
 * 渲染走这里，更新也走这里
 * @param n1 容器上（container）的_vnode，即上次渲染中_vnode，这个值可能为null，代表是初次渲染
 * @param n2 本次传入的vnode，如果是初次渲染则正常渲染，如果n1有值，那么n2将会和n1进行diff比较更新
 * @param container 挂载的容器
 * @param anchor 锚点默认为null
 * @returns
 */
const patch = (n1, n2, container, anchor = null, parentComponent = null) => {
  // ...省略一些细节
  // 获取ref属性
  const { ref } = n2;
  if (ref !== null) {
    // n2 是dom元素还是组件，还是组件有expose
    setRef(ref, n2);
  }
};

/**
 * 设置ref属性
 * @param rawRef 父组件绑定的ref属性
 * @param vnode 虚拟节点
 */

function setRef(rawRef, vnode) {
  // 1. 内部 如果ref放到组件上，值得是组件的实例，如果当前组件有expose，值得是expose
  // 2. 如果放到dom元素上，值得是dom元素
  let value =
    vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT ? vnode.component.exposed || vnode.component.proxy : vnode.el;
  if (isRef(rawRef)) {
    rawRef.value = value;
  }
  // 若是函数则调用并传入rawRef
  if (isFunction(rawRef)) {
    rawRef(value);
  }
}
```
