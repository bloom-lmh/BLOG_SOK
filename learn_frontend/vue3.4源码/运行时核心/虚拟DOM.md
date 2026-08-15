---
order: 60
---

# 虚拟 DOM

## 什么是虚拟 DOM？

虚拟 DOM 实际上是对真实 `DOM` 的一层抽象，其运行在内存中，并通过渲染器将其渲染成真实的 DOM。虚拟 DOM 的优势如下：

1. 性能优化：真实 `DOM` 的操作非常昂贵。虚拟 DOM 允许 `Vue` 在内存中进行计算，通过 `Diff` 算法找出新旧视图之间的最小差异，然后只将这些差异批量更新到真实 DOM 上，而不是像传统方式那样直接替换整个 `DOM` 树。

2. 跨平台能力：虚拟 `DOM` 是一个纯 `JavaScript` 对象，它不依赖于浏览器环境。这意味着 `Vue 3` 可以将虚拟 `DOM` 渲染为浏览器 `DOM`、服务端渲染`SSR`的字符串，甚至是原生移动组件，实现了一次编写，多端运行。

3. 声明式编程：它让你从繁琐的 `DOM` 操作（命令式）中解放出来。你只需要描述 UI 应该是什么样（基于状态），`Vue` 会自动处理 `DOM` 的改变。

## 虚拟 DOM 的结构

`Vue3` 的虚拟 DOM 结构如下：

```js
const vnode = {
  /**
   * 是否为虚拟节点标识
   */
  __v_isVnode: true,
  /**
   * 节点的类型
   * 1. 文本节点
   * 2. Fragment 节点
   * 3. 元素节点
   * 4. 如果是组件则为组件对象
   */
  type,
  /**
   * 该节点的属性
   */
  props,
  /**
   * 该节点的子节点
   */
  children,
  /**
   * 该节点的 key
   * 用于在列表更新时快速定位节点
   */
  key: props?.key,
  /**
   * 该虚拟节点对于的真实节点
   */
  el: null,
  /**
   * 与子节点与运算得出的该节点类型
   * @description 告诉渲染器（Renderer）“我这个节点大概长什么样”，以便执行正确的挂载或更新逻辑
   */
  shapeFlag,
  /**
   * 引用该节点的变量
   * @description 该虚拟节点渲染为真实节点后，会将该节点的真实节点保存到该变量上
   */
  ref: props?.ref,
  /**
   * 标志位，用于优化更新
   */
  patchFlag,
};
```

这里主要来讲一下节点类型`shapeFlag`和`type`。`shapeFlag`和`type`都是用来唯一标识这个虚拟节点类型的字段，不同类型的虚拟节点在渲染时会有不同的处理方法。

### type 字段

在 vue3 中，`type`有四种类型：

1. 文本节点：`Text`
2. 文档片段：`Fragment`
3. 元素节点：用标签字符串表示比如`div`
4. 组件节点：组件对象会赋给`type`属性

其中，`Text`和`Fragment`都是`Symbol`类型的标志：

```js
export const Text = Symbol('Text');
export const Fragment = Symbol('Fragment');
```

而组件节点类型是一个对象(这里不用去深究后续会讲到)，比如:

```js
{
  type: {
    const RenderComponent = {
      props: {
        address: String,
      },
      render() {
        return h(Fragment, {}, [h(Text, this.address)]);
      },
    };
  }
}
```

### shapeFlag 字段

`shapeFlag`和`type`的区别在于，`shapeFlag`用了二进制位来表示节点的类型，如下所示：

```js
/**
 * ShapeFlags 是 Vue 3 中用于标识 VNode（虚拟节点）类型的位标志（bit flags）。
 * 通过位运算（如 &、|）可以高效地判断或组合多个类型特征。
 */
export enum ShapeFlags {
    /**
     * 表示这是一个普通的 DOM 元素（如 div、span 等）。
     * 二进制：0b0000000001（十进制：1）
     */
    ELEMENT = 1,

    /**
     * 表示这是一个函数式组件（Functional Component）。
     * 函数式组件是无状态、无实例、无生命周期的纯函数组件。
     * 二进制：0b0000000010（十进制：2）
     */
    FUNCTIONAL_COMPONENT = 1 << 1, // 即 2

    /**
     * 表示这是一个有状态的组件（Stateful Component），即常规的选项式或组合式组件。
     * 它拥有响应式状态、生命周期等特性。
     * 二进制：0b0000000100（十进制：4）
     */
    STATEFUL_COMPONENT = 1 << 2, // 即 4

    /**
     * 表示该 VNode 的子节点是文本（字符串）。
     * 例如：h('div', 'Hello') 中的 'Hello'。
     * 二进制：0b0000001000（十进制：8）
     */
    TEXT_CHILDREN = 1 << 3, // 即 8

    /**
     * 表示该 VNode 的子节点是一个数组（多个子节点）。
     * 例如：h('ul', [h('li', '1'), h('li', '2')])
     * 二进制：0b0000010000（十进制：16）
     */
    ARRAY_CHILDREN = 1 << 4, // 即 16

    /**
     * 表示该 VNode 的子节点是具名插槽（slots），通常用于组件接收插槽内容。
     * 子节点以对象形式存储，键为插槽名称。
     * 二进制：0b0000100000（十进制：32）
     */
    SLOTS_CHILDREN = 1 << 5, // 即 32

    /**
     * 表示这是一个 Teleport 组件（传送门），用于将子节点渲染到 DOM 树的其他位置。
     * 例如：<Teleport to="#modal">...</Teleport>
     * 二进制：0b0001000000（十进制：64）
     */
    TELEPORT = 1 << 6, // 即 64

    /**
     * 表示这是一个 Suspense 组件，用于处理异步依赖（如异步组件加载）。
     * 可显示 fallback 内容直到子组件准备就绪。
     * 二进制：0b0010000000（十进制：128）
     */
    SUSPENSE = 1 << 7, // 即 128

    /**
     * 表示该组件应该被 keep-alive 缓存（即将进入缓存状态）。
     * 用于 <keep-alive> 包裹的组件，在切换时保留其状态。
     * 二进制：0b0100000000（十进制：256）
     */
    COMPONENT_SHOULD_KEEP_ALIVE = 1 << 8, // 即 256

    /**
     * 表示该组件当前已被 keep-alive 缓存（处于激活/缓存中）。
     * 二进制：0b1000000000（十进制：512）
     */
    COMPONENT_KEPT_ALIVE = 1 << 9, // 即 512

    /**
     * 通用组件标志：涵盖所有类型的组件（函数式 + 有状态）。
     * 通过位或运算组合 FUNCTIONAL_COMPONENT 和 STATEFUL_COMPONENT。
     * 值为 2 | 4 = 6（二进制：0b0000000110）
     */
    COMPONENT = ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT
}
```

这使得它不仅能表示该虚拟节点的类型还能表示该节点的子节点的结构，它只需要与孩子节点的`shapeFlag`进行与或运算即可。例如，一个包含多个子元素的 `<div>`，它的 `shapeFlag` 可能是 `1 | 16`（即 `17`），表示它既是普通元素，又有数组类型的子节点。

::: tip 关于位运算

关于位运算如下所示：

| 运算符 | 名称               | 描述与规则                                                                  |
| :----- | :----------------- | :-------------------------------------------------------------------------- |
| &      | 按位与 (AND)       | 对应位都是 1 时，结果才为 1；否则为 0。（有 0 则 0）                        |
| \|     | 按位或 (OR)        | 对应位有一个为 1，结果就为 1；否则为 0。（有 1 则 1）                       |
| ^      | 按位异或 (XOR)     | 对应位相同时为 0，不同时为 1。（同 0 异 1）                                 |
| ～     | 按位取反 (NOT)     | 0 变 1，1 变 0。（连符号位一起取反）                                        |
| <<     | 左移 (Left Shift)  | 各位向左移动 n 位，右边补 n 个 0。相当于乘以 $2^n$。                        |
| >>     | 右移 (Right Shift) | 各位向右移动 n 位，左边补“符号位”（正数补 0，负数补 1）。相当于除以 $2^n$。 |

例如：`1=0001, 2=0010, 4=0100, 8=1000`。把它们用 `|` 合并，互不干扰，下面用一个权限的案例来进行表示：

```js
// 定义状态（必须是 2 的幂或通过左移生成）
const READ = 1; // 0001
const WRITE = 2; // 0010
const DELETE = 4; // 0100

// 组合权限：用户拥有读和写权限
const userPermission = READ | WRITE; // 0001 | 0010 = 0011 (值为 3)

// 检查权限：判断用户是否有写权限
if (userPermission & WRITE) {
  // 0011 & 0010 = 0010 (结果不为 0，说明有权限)
  console.log('允许写入');
}
```

也就是说只要节点的`shapeFlag`与`ShapeFlags`的某项相与不为`0`，就可以判断该节点或子节点是该类型的节点。
:::

## 创建虚拟节点 createVNode

现在就可以来介绍创建虚拟节点的`createVNode`方法了，其源码如下所示：

```js
/**
 * @param type 传入的类型 可能是一个字符串（代表原生标签），也可能是一个Symbol（例如Fragment、Text）
 * @param props 传给该节点的属性参数（例如class，style等）
 * @param children 子元素（可能是一个数组也可能是一个文本）
 * @param patchFlag patchFlag是一个标识位，标识是否有动态节点，后期进行靶向更新时会用到
 * @description 标准的虚拟dom创建方法，h方法其实是基于createVnode重写的，就是因为重写才导致h方法的写法多种多样，但终归是调用createVnode，它的调用就是h方法的标准写法，因此它的参数也比较固定和单一
 * @returns vnode虚拟节点对象
 */
export function createVnode(type, props, children?, patchFlag?) {
  // 根据type来判断vnode的类型
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT /*元素*/
    : isTeleport(type)
    ? ShapeFlags.TELEPORT /*Teleport*/
    : isObject(type)
    ? ShapeFlags.STATEFUL_COMPONENT /*有状态组件*/
    : isFunction(type)
    ? ShapeFlags.FUNCTIONAL_COMPONENT /*函数式组件*/
    : 0; /* 文本节点 */

  // 虚拟节点
  const vnode = {
    __v_isVnode: true, // 标识该对象是虚拟节点
    type, // 节点类型
    props, // 节点属性
    children, // 子节点
    key: props?.key, // diff算法后面需要的key
    el: null, // 虚拟节点需要对应的真实节点是谁
    shapeFlag, // 节点的形状标识
    ref: props?.ref,
    patchFlag,
  };
  // ...省略了一些代码

  // 根据孩子节点来确定这个节点的形状标识
  if (children) {
    // 孩子节点是一个数组
    if (Array.isArray(children)) {
      vnode.shapeFlag |= ShapeFlags.ARRAY_CHILDREN;
    }
    // 第三个参数是对象说明是插槽
    else if (isObject(children)) {
      vnode.shapeFlag |= ShapeFlags.SLOTS_CHILDREN;
    }
    // 孩子节点是一个字符串，表示是文本节点
    else {
      children = String(children);
      vnode.shapeFlag |= ShapeFlags.TEXT_CHILDREN;
    }
  }
  return vnode;
}
```

## h 函数

`h`函数是`Vue`中用来创建虚拟节点的函数，是对`createVnode`方法的包装，它的源码如下所示：

```js
/**
 * 
 * @param type 同createVnode一致，字符串或者Symbol
 * @param propsOrChildren 可选，可能是props或者children；
 * @param children 可选 若存在一定是children
 * @returns  vnode虚拟节点对象
 * @description 重写createVnode，让参数更多样性
    h函数的参数有很多种：
    1. 1个 类型
    2. 2个 类型+props/childrens
    3. 3个 类型+props+childrens
    4. 3个以上 类型+props+children+children+...都是children

    思路：
    1. 两个参数 第二个参数可能是属性或者虚拟节点（__v_isVnode）
    2. 第二个参数就是数组 -> 儿子
    3. 其他情况就是属性
    4. 直接传递非对象 -> 文本
    5. 不能出现三个参数时，第二个参数不是属性
    6. 如果出现三个参数，后面都是儿子
 */
export function h(type, propsOrChildren?, children?) {
  // 获取参数长度
  let l = arguments.length;
  // 若参数长度为2，第二个参数可能是属性或者虚拟节点
  if (l === 2) {
    // 如果是对象，且不是数组，说明是属性或者虚拟节点
    if (isObject(propsOrChildren) && !Array.isArray(propsOrChildren)) {
      // 属性或者vn
      if (isVnode(propsOrChildren)) {
        // 如果第二参数是vnode（不包含vnode数组情况，所以要用数组框起来），说明属性为空
        return createVnode(type, null, [propsOrChildren]);
      } else {
        // 第二参数是属性
        return createVnode(type, propsOrChildren);
      }
    }
    // 第二个参数是vn数组或者文本
    return createVnode(type, null, propsOrChildren);
  } else {
    // 三个参数以上，后面都是儿子
    if (l > 3) {
      // 收集儿子
      children = Array.from(arguments).slice(2);
    } else if (l === 3 && isVnode(children)) {
      // 三个了必须考虑children究竟是vn数组还是vn，还是文本，文本不管他，如果是vn必须变成vn数组
      children = [children];
    }
    // 调用createVnode创建虚拟节点
    return createVnode(type, propsOrChildren, children);
  }
}
```
