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

`vue`将虚拟节点划分为文本节点、元素节点、组件节点、`Fragment` 节点等四种类型，在`patch`方法中根据位运算来区分不同类型从而做不同的操作，本质上是策略模式的体现。

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

### 处理组件节点 processComponent

在`vue`中，组件是一个包含状态和渲染方法的对象，如下所示：

```js
const RenderComponent = {
  props: {
    address: String,
  },
  render() {
    return h(Fragment, {}, [
      h(Text, this.address),
      /*  h('button', { onClick: () => (this.address = '西安') }, '子组件修改'), */
    ]);
  },
};
const VueComponent = {
  props: {
    // defineProps()
    name: String,
    age: Number,
  },
  data() {
    return { flag: true, address: '北京' };
  },
  render(proxy) {
    // this 为组件的实例
    return h(Fragment, [
      h(
        'button',
        {
          onClick: () => (this.flag = !this.flag),
        },
        '点击',
      ),
      h(RenderComponent, { address: this.flag ? this.address : '上海' }),
    ]);
  },
};
render(
  // 组件被挂载到一个虚拟节点的type上
  h(VueComponent, {}),
  app,
);
```

其中

1. `props`主要用于声明组件可以接受的属性
2. `data`用于定义组件的状态
3. `render`方法用于渲染组件的结构，也就是生成组件对于的`subTree`。`render`函数接受一个`proxy`的代理对象，这个代理对象包含了状态已经属性用于在组件中进行使用

我们来看看源码：

```js
/**
 * 处理状态组件
 * @param n1 上一次的节点
 * @param n2 此次节点
 * @param container 挂载容器
 * @param anchor 锚点
 * @param parentComponent 父组件实例
 */
const processComponent = (n1, n2, container, anchor, parentComponent) => {
  // 若老节点不存在，表示为首次挂载
  if (n1 === null) {
    mountComponent(n2, container, anchor, parentComponent);
  } else {
    // 这里比较props的变化，实现响应式（n1和n2的变化追踪）
    updateComponent(n1, n2, parentComponent); // 不能使用patch，因为会死循环
  }
};
```

在这个处理组件中，其操作也分为：

1. 首次则挂载调用`mountComponent`方法，具体请看[mountComponent](./render函数.md#挂载组件-mountcomponent)
2. 非首次则更新调用`updateComponent`方法，具体请看[updateComponent](./render函数.md#更新组件-updatecomponent)

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

### 挂载组件 mountComponent

我们来看看挂载组件的源码：

```ts [挂载组件]
/**
 * 挂载组件
 * @param n2 提供的组件vnode
 * @param container 挂载的容器
 * @param anchor 锚点
 */
const mountComponent = (n2, container, anchor, parentComponent) => {
  // 1. 先创建组件实例（Instance） 并挂载到n2.component上
  const instance = (n2.component = createComponentInstance(n2, parentComponent));
  // 2. 给实例属性/插槽等赋值
  setupComponent(instance);
  // 3. 创建一个effect
  setupRenderEffect(instance, container, anchor, parentComponent);
};
```

对于挂载组件来说主要三个步骤

1. 创建组件实例，并记录到虚拟节点的`component`属性上
2. 给实例属性赋值(初始化组件实例)

::: code-group

```ts [1.创建组件实例]
/**
 * 创建组件实例
 * @param vnode 组件对应的虚拟节点
 * @returns 组件实例
 */
export function createComponentInstance(vnode, parent) {
  /**
   * 组件实例
   * @description 属性分为两种 $attrs(非响应式的) 和 props(响应式的)，所有外部传来的属性 - propsOptions = $attrs
   */
  const instance = {
    data: null, // 状态 state
    vnode, // 组件的对应的虚拟节点
    subTree: null, // 子树
    isMounted: false, // 是否挂载完成
    update: null, // 组件的更新函数
    props: {}, // 外界传入的属性
    attrs: {}, // 没有$，挂载在instance上的是没有$的，实际this却是有的，原因是因为用了proxy代理映射
    slots: {}, // 插槽，没有$
    propsOptions: vnode.type.props, // 组件声明允许接受的属性
    proxy: null, // 用来代理props，attrs，data让用户方便的访问
    setupState: {}, // setup返回的状态
    exposed: null, // 暴露给外部的属性
    parent, // 关联的父组件
    // 所有的组件provide都一样 ，parent = {...} , child = 引用对象
    provides: parent ? parent.provides : Object.create(null), // Object.create(null) 为了防止原型链上的属性干扰
    ctx: {} as any, // 如果是keepalive组件，就将dom api放入到这个属性上
  };
  return instance;
}
```

```ts [2.设置组件实例]
/**
 * @description 初始化组件
 * @param instance 组件实例
 */
export function setupComponent(instance) {
  // 解构组件对应的虚拟节点
  const { vnode } = instance;

  // -- 赋值属性 -- 这个props是外部传入的
  initProps(instance, vnode.props);

  // -- 赋值插槽 -- 其实就是 h(VueComponent,{},{})这第三个参数就是穿个组件的插槽，也就是组件的孩子节点就是插槽
  initSlots(instance, vnode.children);

  // -- 赋值代理对象 --
  // render(proxy)里的proxy就指向instance
  instance.proxy = new Proxy(instance, handler);
  // 获取组件的状态、render函数和setup函数
  const { data = () => {}, render, setup } = vnode.type;
  // setup函数本质上类似于render函数优先级要比render函数高
  if (setup) {
    // 如果写了setup函数比如：
    // const VueComponent = {
    //    setup(){...}
    //}
    // setup函数的上下文，会最终传给setup函数
    const setupContext = {
      attrs: instance.attrs,
      slots: instance.slots,
      expose: value => {
        instance.exposed = value;
      },
      // 派发事件函数
      emit(event, ...payload) {
        // 拼接完整的事件名
        const eventName = `on${event[0].toUpperCase() + event.slice(1)}`;
        // 获取props中的函数，这个函数可以是外界传入也可以是组件自身定义的
        const handler = instance.vnode.props[eventName];
        // 触发函数
        handler && handler(...payload);
      },
    };
    // 设置当前全局实例，便于setup函数执行时获取当前实例（生命周期中会用到）
    setCurrentInstance(instance);
    // setup函数的返回值
    const setupRes = setup(instance.props, setupContext);
    unsetCurrentInstance();
    // 如果setup返回的是函数，那么就是render函数
    if (isFunction(setupRes)) {
      instance.render = setupRes;
    } else {
      // 如果返回的是对象，那么就是setup暴露的状态setupState
      instance.setupState = proxyRefs(setupRes || {}); // 将返回的值做ref
    }
  }
  // data必须是一个getter函数
  if (!isFunction(data)) {
    console.warn('data必须是函数');
  } else {
    // data中可以拿到props
    instance.data = reactive(data.call(instance.proxy));
  }
  // setup优先级要高于render
  if (!instance.render) {
    instance.render = render;
  }
}
// 当前实例
export let currentInstance = null;
// 获取当前实例
export const getCurrentInstance = () => {
  return currentInstance;
};
// 设置当前实例
export const setCurrentInstance = instance => {
  currentInstance = instance;
};

export const unsetCurrentInstance = () => {
  currentInstance = null;
};
```

```ts [2.1设置属性]
/**
 * 初始化属性
 * @param instance 创建的组件实例
 * @param rawProps 外部传入的props
 * @description props是外部传入的属性比如 h(VueComponent, { name: '张三', age: 18 }) { name: '张三', age: 18 } 就是 props
 * 根据propsOptions 来区分props和$attrs，就是说外界传来的属性，组件可以声明接受哪些
 */
const initProps = (instance, rawProps) => {
  // 组件声明要接受的属性放这里
  const props = {};
  // 其余属性放这里
  const attrs = {};
  // 组件声明要接受的props 也就是defineProps定义的显示声明要接受的props
  const propsOptions = instance.propsOptions || {}; // 用户在组件中定义的
  if (rawProps) {
    for (let key in rawProps) {
      const value = rawProps[key];
      // 对于显示声明的props收集到实例的props属性中
      if (key in propsOptions) {
        props[key] = value;
      } else {
        // 非显示声明的收集到实例的attrs属性中
        attrs[key] = value;
      }
    }
  }
  // props 不需要深度代理，因为组件内部是不能改外部传进来的属性的，这里实际使用的是shallowReactive
  instance.props = reactive(props);
  // 虽说$attrs是非响应式的，到那时其实在开发环境下，它是响应式的（为了方便）
  instance.attrs = attrs;
};
```

```ts [2.2初始化插槽]
/**
 * @description 初始化插槽
 * @param instance 组件实例
 * @param children vn子元素（组件的children就是插槽）
 */
const initSlots = (instance, children) => {
  // 创建虚拟节点时第三个参数为对象表示是插槽
  if (instance.vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    instance.slots = children;
  } else {
    instance.slots = {};
  }
};
```

```ts [2.3代理属性]
// $attrs 映射表
const publicProperty = {
  $attrs: instance => instance.attrs, // 不能写成$attrs:instance.attrs哦，这样就写死了，还是要根据传入的target返回的
  $slots: instance => instance.slots,
};
// proxy 代理的handler
const handler = {
  /**
   * 获取组件上的属性
   * @param target 组件实例
   * @param key 要获取的属性名
   * @returns 对应属性的值
   * @description 方便获取组件上的属性，比如 this.xxx。你有没有发现在使用vue时不管时props传入属性还是自己定义的状态都能一视同仁的在模板中直接使用，对于选项式都可以this.xxx获取，实际上就是在这里进行实现的
   */
  get(target, key) {
    // 获取组件实例的状态 props和setupState
    const { data, props, setupState } = target;
    // 状态中有从状态中获取
    if (data && hasOwn(data, key)) {
      return data[key];
    }
    // props中有就从props中获取
    else if (props && hasOwn(props, key)) {
      return props[key];
    }
    // setupState中有就从setupState中获取
    else if (setupState && hasOwn(setupState, key)) {
      // setupState
      return setupState[key];
    }
    // 当要访问this.$attr 或 this.$slots时，返回对应的getter
    const getter = publicProperty[key];
    if (getter) {
      return getter(target);
    }
  },
  /**
   * 设置组件上的属性
   * @param target 组件实例
   * @param key 要设置的属性名
   * @param value 要设置的属性值
   */
  set(target, key, value) {
    const { data, props, setupState } = target;
    // 优先设置状态
    if (data && hasOwn(data, key)) {
      data[key] = value;
    }
    // 其次设置props
    else if (props && hasOwn(props, key)) {
      // 一般来说props虽然是响应式的但是不推荐直接赋值，应该使用函数来触发父组件更改这个props进而影响传入的props
      props[key] = value;
      console.warn('props是只读');
      return false;
    } else if (setupState && hasOwn(setupState, key)) {
      setupState[key] = value;
    }
    return true;
  },
};
```

:::

3. 创建一个 `effect`并执行

::: code-group

```ts [3.创建effect]
/**
 * @description 设置渲染effect
 * @param instance 组件实例
 * @param container 组件挂载的容器
 * @param anchor 锚点
 * @param parentComponent 父组件实例
 */
function setupRenderEffect(instance, container, anchor, parentComponent) {
  // 组件更新函数
  const componentUpdate = () => {
    // 拿到生命周期钩子（这里后续会将，可以跳过相关的代码）
    //const { bm, m, bu, u } = instance;
    // 如果组件第一次挂载
    if (!instance.isMounted) {
      // if (bm) {
      //   // 挂载前
      //   invokeArrayFns(bm);
      // }
      // 生成组件对应的虚拟节点subTree
      const subTree = renderComponent(instance);
      // 挂载这个subTree
      patch(null, subTree, container, anchor, instance);
      // 挂载完后标记该组件已经挂载完成
      instance.isMounted = true;
      instance.subTree = subTree;
      // if (m) {
      //   // 挂载后
      //   invokeArrayFns(m);
      // }
    } else {
      // 不是第一次挂载
      const { next } = instance;
      if (next) {
        // 分开两边写更新实在太变态，这里通过next来判断是否为属性或插槽更新
        // 更新属性和插槽
        updateComponentPreRender(instance, next);
      }
      // if (bu) {
      //   invokeArrayFns(bu);
      // }
      // 基于状态的组件更新
      const subTree = renderComponent(instance);
      patch(instance.subTree, subTree, container, anchor, instance); // 上一次的subTree和此次进行更新
      instance.subTree = subTree;
      // if (u) {
      //   invokeArrayFns(u);
      // }
    }
  };
  // 创建一个effect，scheduler是一个包装函数，这个函数主要用于
  const effect = new ReactiveEffect(componentUpdate, () => queueJob(update));
  const update = (instance.update = () => effect.run());
  // 直接执行effect，进行组件挂载
  update();
}
```

```ts [3.1渲染组件方法]
/**
 * 渲染组件
 * @param instance 组件实例
 * @returns 返回一个vnode（subTree）
 * @description 本质上就是调用组件的render函数创建虚拟节点树并返回根节点
 */
function renderComponent(instance) {
  // 获取组件实例的render函数等信息
  const { render, vnode, proxy, attrs, slots } = instance;
  // 对于状态组件
  if (vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
    // 调用渲染函数来创建组件对应的虚拟节点树，并传入proxy，这个proxy其实就是this，里面包含了组件接受的props和状态，方便在组件模板中进行使用
    return render.call(proxy, proxy);
  } else {
    // 函数式组件
    return vnode.type(attrs, { slots });
  }
}
```

:::

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

### 更新组件 updateComponent

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
