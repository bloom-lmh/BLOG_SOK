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
 * @param parentComponent 父组件实例，用于provide和inject
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
    // 处理Fragment节点
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

文本节点就是孩子节点为文本内容的虚拟节点，比如:

```js
render(h(Text, null, 'Hello World'), app);
```

处理的逻辑如下：

```js
/**
 * @param n1 老虚拟节点
 * @param n2 新虚拟节点
 * @param container 要挂载父容器节点
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

::: tip 关于`host...`
这个方法其实就是`vue`默认的渲染器选项，具体可以看[渲染器](./渲染器)
:::

### 处理 Fragment 节点 processFragment

`Fragment`本质上就是一个文档片段，对于节点类型为`Fragment`的虚拟节点，不会创建真实的`dom`节点，而是将其子节点渲染到`container`容器中。

```js
/**
 * @description 针对Fragment节点的处理，这里处理的逻辑和普通元素基本一致，没有重写自己的mount和patch方法（mount传入的参数不同，patch只patchChildren）
 * @param n1 上一次渲染的vn
 * @param n2 本次传入的vn
 * @param container n2的container而不是n2.el
 * @param parentComponent 父元素的实例，用于provide和inject
 */
const processFragment = (n1, n2, container, anchor, parentComponent) => {
  if (n1 === null) {
    // 挂载孩子节点
    mountChildren(n2.children, container, anchor, parentComponent);
  } else {
    // 更新孩子节点
    patchChildren(n1, n2, container, anchor, parentComponent);
  }
};
```

挂载孩子节点方法请看 [mountChildren](./render函数.md#挂载孩子节点-mountchildren)
更新孩子节点方法请看 [patchChildren](./render函数.md#更新孩子节点-patchchildren)

### 处理元素节点 processElement

元素节点就是一般的类似于`div`这样的标签元素，比如：

```js {3-14}
render(
  // 组件被挂载到一个虚拟节点的type上
  h(
    'div',
    {
      style: {
        color: 'red',
      },
      onClick: () => {
        console.log('click');
      },
    },
    'hello world',
  ),
  app,
);
```

处理元素节点的逻辑如下：

```js
/**
 * 针对普通元素进行更新或初始化
 * @param n1 容器上挂载的vnode，用于判断是否是初始化（如果null则代表初始化）
 * @param n2 本次需要挂载或者更新的虚拟节点
 * @param container 本次被挂载的容器
 * @param anchor 锚点，用于diff算法插入的位置
 */
const processElement = (n1, n2, container, anchor, parentComponent) => {
  if (n1 === null) {
    // 初始化(或者n1和n2不是一个节点强制初始化)
    mountElement(n2, container, anchor, parentComponent); // 挂载元素
  } else {
    patchElement(n1, n2, container, anchor, parentComponent); // 非初始化，且复用节点更新
  }
};
```

挂载元素方法请见下面[mountElement](./render函数.md#挂载元素节点-mountelement)
更新元素方法请见下面[patchElement](./render函数.md#更新元素节点-patchelement)

### 处理组件节点

## 挂载相关操作

### 挂载孩子节点 mountChildren

```js
/**
 * 规范化childrens
 * @description 对于子childrens是数组且元素中有字符串和数字的情况，需要将这些数字和字符串转换为Text虚拟节点
 * @param children 虚拟节点的childrens
 * @returns 规范化后的的childrens
 */
const normalize = children => {
  if (Array.isArray(children)) {
    for (let i = 0; i < children.length; i++) {
      if (typeof children[i] === 'string' || typeof children[i] === 'number') {
        // 儿子是文本需要创建为Text虚拟节点
        children[i] = createVnode(Text, null, String(children[i]));
      }
    }
  }
  return children;
};

/**
 * 用于挂载子元素
 * @param children 虚拟节点的childrens
 * @param container 这些孩子节点要挂载的容器
 */
const mountChildren = (children, container, anchor, parentComponent) => {
  // 把children数组中的字符串或数字变为真实的文本虚拟节点
  normalize(children);
  // 遍历children，递归挂载每个子元素
  if (Array.isArray(children)) {
    for (let i = 0; i < children.length; i++) {
      patch(null, children[i], container, anchor, parentComponent);
    }
  } else {
    // 子元素是单个虚拟节点
    patch(null, children, container, anchor, parentComponent);
  }
};
```

### 挂载元素节点 mountElement

```js
/**
 * 挂载操作，子元素也全都是挂载初始化.
 * 由于传入processElement的n1为空或者n1和n2不是同一个节点，所以这里需要挂载新的节点，即初始化操作
 * @param vnode n2即本次需要处理的虚拟节点
 * @param container 本次被挂载的容器
 * @param anchor 锚点，在全量diff中目前似乎没有用处
 * @description 挂载元素，主要是创建真实dom，设置属性，插入到容器中，处理过渡动画
 */
const mountElement = (vnode, container, anchor, parentComponent) => {
  // 解构虚拟节点，并依次处理对应的属性
  const { type, children, props, shapeFlag, transition } = vnode;
  // 第一次渲染的时候让虚拟节点和真实dom创建关联
  // 第二次渲染新的vnode，可以和上一次的vnode作对比，之后更新对应的el元素
  // ---创建真实dom---
  let el = (vnode.el = hostCreateElement(type));
  // ---处理属性(props)---
  if (props) {
    // 将属性挂载到真实dom上
    for (let key in props) {
      hostPatchProp(el, key, null, props[key]);
    }
  }
  // --处理子元素(childrens)--
  // 将vnode身上的shapeFlags和实际的文本节点的shapeFlages进行与运算，如果不为0，则儿子元素肯定是文本节点
  // 原因是位运算的特点，如果做与运算结果大于0，说明A包含B或者B包含A，而shapeFlags本身就是或运算出来的
  // 子元素是文本节点（非数组）
  if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
    // 设置文本。你可以简单理解为给el这个dom的innnerText赋值
    hostSetElementText(el, children);
  } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
    // 子元素是数组，递归挂载子元素
    // 既然子元素是数组（虚拟节点数组），当然要继续处理下去喽，当然使用for+patch就行了，但是这里单独多拉出来一个方法，是为了更好的逻辑分离
    mountChildren(children, el, anchor, parentComponent); //
  }

  // ---挂载到容器---
  hostInsert(el, container);
};
```

## 更新相关方法

### 更新元素节点 patchElement

当老节点存在且和新节点类型相同的时候会调用这个方法执行节点更新操作

1. 更新属性
2. 更新子节点（全量`diff`）

```js
/**
 *
 * @param oldProps n1的props即老属性
 * @param newProps n2的props即新属性
 * @param el 传入的dom，即n1.el和n2.el，它俩被链接了其实是一个
 * @example
 * {
 *     style: {
 *         color: 'red',
 *         fontSize: '16px'
 *     },
 *     onClick: () => {
 *         console.log('click');
 *     }
 * }
 *
 * {
 *     style: {
 *         color: 'blue',
 *         fontSize: '18px'
 *     },
 *     onClick: () => {
 *         console.log('click');
 *     }
 * }
 */
const patchProps = (oldProps, newProps, el) => {
  // 新的要全部生效
  for (let key in newProps) {
    hostPatchProp(el, key, oldProps[key], newProps[key]);
  }
  // 老的有新的没有，需要删除
  for (let key in oldProps) {
    if (!(key in newProps)) {
      hostPatchProp(el, key, oldProps[key], null);
    }
  }
};

/**
 * 更新操作，diff算法就是在这里处理的，必须满足n1不为null(非初始化挂载且n1和n2是一个节点（type和key相同））
 * @param n1 上一次挂载的虚拟节点
 * @param n2 此次挂载的虚拟节点
 * @description 依次对 dom、props、children 进行比较更新。
 */
const patchElement = (n1, n2, container, anchor, parentComponent) => {
  // 对dom元素的复用，创建引用连接，确保el修改后会对n2，n1产生影响
  let el = (n2.el = n1.el);
  let oldProps = n1.props || {};
  let newProps = n2.props || {};

  // --- props比较 ---
  // hostPatchProp 只针对一个属性进行处理 class style event attr等，所以要封装patchProps
  patchProps(newProps, oldProps, el); // 比完父级比子级，一级一级比较

  // 全量diff
  // --- 比较孩子节点children ---
  patchChildren(n1, n2, el, anchor, parentComponent);
};
```

### 更新孩子节点 patchChildren

以下是 `patchChildren` 处理新旧子节点（`children`）时的几种情况：

| 新子节点类型           | 旧子节点类型           | 操作方式                         |
| ---------------------- | ---------------------- | -------------------------------- |
| 文本                   | 数组                   | 删除所有旧子节点，设置新文本内容 |
| 文本                   | 文本                   | 直接更新文本内容                 |
| 文本                   | 空（`null/undefined`） | 设置新文本内容                   |
| 数组                   | 数组                   | 使用 diff 算法进行高效更新       |
| 数组                   | 文本                   | 清除旧文本，挂载新子节点数组     |
| 数组                   | 空（`null/undefined`） | 挂载新子节点数组                 |
| 空（`null/undefined`） | 数组                   | 删除所有旧子节点                 |
| 空（`null/undefined`） | 文本                   | 清空旧文本内容                   |
| 空（`null/undefined`） | 空                     | 无需任何操作                     |

```js
/**
 * 节点的孩子节点比较更新
 * @param n1 老虚拟节点
 * @param n2 新虚拟节点
 * @param el n1和n2的el，即真实dom
 * @param parentComponent 父组件实例，用于provide和inject
 */
const patchChildren = (n1, n2, el, anchor, parentComponent) => {
  // 获取老节点的childrens
  const c1 = n1.children;
  // 获取新节点的childrens，并标准化，防止出现字符串的文本
  const c2 = normalize(n2.children);
  // 获取n1节点的形状
  const prevShapeFlag = n1.shapeFlag;
  // 获取n2节点的形状
  const shapeFlag = n2.shapeFlag;

  // 根据子节点的不同情况进行处理
  // 新的是文本
  if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
    // 老数组；移除老的
    if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      unmountChildren(c1, parentComponent);
    }
    // 老的是文本或空；内容不相同替换
    if (c1 !== c2) {
      hostSetElementText(el, c2);
    }
  } else {
    // 老为数组
    if (prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      //  新为数组
      if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 全量diff算法 两个数组比较
        patchKeyedChildren(c1, c2, el, parentComponent);
      } else {
        // 老数组，新非数组；移除老节点
        unmountChildren(c1, parentComponent);
      }
    }
    // 老的不要数组
    else {
      if (prevShapeFlag & ShapeFlags.TEXT_CHILDREN) {
        // 老文本，新为null
        hostSetElementText(el, '');
      }
      if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 老文本，新数组
        mountChildren(c2, el, anchor, parentComponent);
      }
    }
  }
};
```

全量`diff`算法请参见[diff 算法](./diff算法.md)

## 卸载相关方法

### 卸载节点 unmount

这个方法是卸载的入口，它会根据传入的虚拟节点的形状，调用不同的卸载方法，比如：

```js
/**
 * 卸载虚拟节点及其子节点
 * @param vnode 传入的虚拟节点，它是来自它挂载的容器（container）身上的_vnode属性
 * @param parentComponent 父组件实例，用于provide和inject
 */
const unmount = (vnode, parentComponent) => {
  // 获取虚拟节点的形状，对于的真实的dom元素el
  const { shapeFlag, el } = vnode;
  // 封装卸载方法
  const performRemove = () => {
    hostRemove(vnode.el);
  };
  // 如果节点为Fragment，则递归卸载子节点
  if (vnode.type === Fragment) {
    unmountChildren(vnode.children, parentComponent);
  }
  // 如果节点是组件
  else if (shapeFlag & ShapeFlags.COMPONENT) {
    unmount(vnode.component.subTree, parentComponent);
  }
  // 如果节点是Teleport
  else if (shapeFlag & ShapeFlags.TELEPORT) {
    vnode.type.remove(vnode, unmountChildren);
  }
  // 其他情况，直接移除节点
  else {
    performRemove();
  }
};
```

### 卸载子节点 unmountChildren

```js
/**
 * @description 卸载子元素
 * @param children 孩子节点
 * @param parentComponent 父元素
 */
const unmountChildren = (children, parentComponent) => {
  for (let i = 0; i < children.length; i++) {
    let child = children[i];
    unmount(child, parentComponent);
  }
};
```
