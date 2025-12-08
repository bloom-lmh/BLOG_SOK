# render 函数

## 前言

前面介绍的`createRenderer`函数在传入渲染器选项后，最终返回一个包含`render`函数的对象，`render`函数能够实现将虚拟节点渲染到真实`dom`中。`render`函数的具体实现如下：

```js
/**
 *
 * @param vnode 要渲染的虚拟节点
 * @param container 虚拟节点需要挂载的真实dom容器，他身上在经历render之后会有一个_vnode属性，用于保存上一次的vnode，同时也用于标识这个dom曾经被挂载过虚拟节点
 */
const render = (vnode, container) => {
  // 本次没有虚拟节点要进行挂载
  if (vnode === null) {
    // 如果上次挂载过，则需要卸载上次的虚拟节点对应的真实dom
    if (container._vnode) {
      unmount(container._vnode, null);
    }
  } else {
    // 首次渲染或更新
    patch(container?._vnode || null, vnode, container);
    // 记录上一次渲染的vnode，以便于进行diff
    container._vnode = vnode;
  }
};
return {
  render,
};
```

可以看到`render` 函数中主要调用了两个内部的函数：

1. `patch`方法：用于首次渲染虚拟节点和后续`diff`更新虚拟节点进行
2. `unmount`：用于卸载上一次渲染的虚拟节点对应的真实`dom`

并且使用`container._vnode`记录上次渲染或更新的`vnode`，以便于进行`diff`更新。

## patch 方法

`patch`方法是渲染器的核心方法，主要负责首次渲染和更新逻辑，源码如下：

```js
/**
 * @param n1 节点一
 * @param n2 节点二
 * @returns Boolean
 * @description 判断两个虚拟节点是否相同，如果虚拟节点的type和key都相同则认为是相同的虚拟节点
 */
export function isSameVnode(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key; // 主要判断两者的type是否一致,除此之外就是key的判断
}
/**
 * 渲染走这里，更新也走这里
 * @param n1 容器上（container）的_vnode，即上次渲染中_vnode，这个值可能为null，代表是初次渲染
 * @param n2 本次传入的vnode，如果是初次渲染则正常渲染，如果n1有值，那么n2将会和n1进行diff比较更新
 * @param container 挂载的容器
 * @param anchor 锚点(应该插入到哪个元素的前面)默认为null
 */
const patch = (n1, n2, container, anchor = null, parentComponent = null) => {
  // 若前一次渲染的节点和本次渲染的节点相同，则跳过
  if (n1 === n2) {
    return;
  }
  // 若上一次渲染过，且上一次和本次渲染的虚拟节点不同，则卸载上一次渲染的虚拟节点
  if (n1 && !isSameVnode(n1, n2)) {
    // 卸载n1
    unmount(n1, parentComponent);
    // 当n1被卸载后，n1的值为null，代表上一次渲染的虚拟节点已经被卸载，此时n2会执行挂载逻辑而不是更新逻辑
    n1 = null;
  }
  // 获取节点类型，针对不同类型进行不同处理
  const { type, ref, shapeFlag } = n2;
  // 根据节点类型进行不同的处理
  switch (type) {
    // 处理文本节点
    case Text:
      processText(n1, n2, container);
      break;
    // // Fragment节点
    case Fragment:
      processFragment(n1, n2, container, anchor, parentComponent);
      break;
    default:
      // 处理元素节点
      if (shapeFlag & ShapeFlags.ELEMENT) {
        processElement(n1, n2, container, anchor, parentComponent);
      }
      // 处理Teleport组件
      else if (shapeFlag & ShapeFlags.TELEPORT) {
        // Teleport节点, 自己渲染更新
        type.process(n1, n2, container, anchor, parentComponent, {
          mountChildren,
          patchChildren,
          // 此方法可以将组件或者dom移动到指定位置
          move(vnode, container, anchor) {
            hostInsert(vnode.component ? vnode.component.subTree.el : vnode.el, container, anchor);
          },
        });
      }
      // 处理组件(包含了状态组件和函数组件)
      else if (shapeFlag & ShapeFlags.COMPONENT) {
        // 对组件的处理，需要注意的是vue3中的函数式组件已经弃用了，因为不节约性能
        processComponent(n1, n2, container, anchor, parentComponent);
      }
  }
};
```

### 处理文本节点 processText

```js
/**
 * @param n1 老虚拟节点
 * @param n2 新虚拟节点
 * @param container 要挂载的容器
 */
const processText = (n1, n2, container) => {
  // 若n1不存在，则执行挂载操作，否则执行更新操作
  if (n1 === null) {
    // 1. 以n2.children作为文本内容创建文本节点
    // 2. n2.el记录真实的文本节点
    // 3. 将节点插入到container下
    hostInsert((n2.el = hostCreateText(n2.children)), container);
  } else {
    // 如果n1存在，则说明是更新，则直接更新文本节点内容
    if (n1.children !== n2.children) {
      // 复用n1的dom节点，仅仅更新文本内容
      hostSetText((n2.el = n1.el), n2.children);
    }
  }
};
```

### 处理 Fragment 节点

### 处理元素节点

### 处理组件节点

## unmount 方法
