# setup 函数

## 介绍

`setup`函数实际上是组件的初始化函数或者是入口函数，它接受两个参数：

1. 组件的`props`：外界传来的所声明要接受的属性
2. `setup`上下文对象：其实就是对组件挂载时所需要用到的信息的封装，它包含了以下属性：
   - 父组件传来的未声明接受的额外属性`attrs`
   - 父组件传来的插槽`slots`
   - `emit`事件派发函数
   - `expose`组件实例要暴露的值

然后它的返回值也有两种情况：

1. 返回渲染器函数：这个函数会将组件对应的虚拟节点渲染出来，其优先级大于组件的`render`函数
2. 返回一般对象：这个对象表示组件初始化后的状态，会作为组件的`setupState`属性，然后在调用`render`函数时作为`proxy`参数的一部分传入

如下所示：

```ts
// 组件
const VueComponent = {
  // setup函数，接受两个参数，返回对象形式
  setup(props, ctx) {
    const a = ref(1);
    return {
      a: a.value,
    };
  },
  render(proxy) {
    return h('div', {}, proxy.a);
  },
};
```

`setup`函数是在组件首次挂载时的`setupComponent`方法中被调用，我们来看下源码：

::: code-group

```ts [2.设置组件实例] {26-42,45-46,48-54,63-66}
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
    // 调用setup函数并获取返回值
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

## 插槽实现

插槽是 Vue 组件的一种扩展机制，它允许子组件的部分内容在父组件中决定。对于插槽的实现而言，正是有了`setup`函数，才让实现插槽变得简单。在源码中其实就是做了两件事情：

1. 将要插入内容作为子组件的孩子（children）属性传入即可，
2. 子组件通过`setup`上下文对象访问父组件传来的插槽内容，然后渲染出来。

就这么简单，下面演示的是具名插槽、默认插槽和作用域插槽的实际使用：

```js
// 子组件
const RenderComponent = {
  // 通过setup上下文对象接受slots，这个slots是父组件传来的插槽内容
  setup(props, { slots, attrs }) {
    return () => {
      // 具名插槽：slots.footer() 父组件提供数据
      // 作用域插槽：slots.header(123)，子组件来提供数据
      // 默认插槽：slots.default()
      return h(Fragment, [slots.footer(), slots.header(123)], slots.default());
    };
  },
};
// 父组件
const VueComponent = {
  setup(props) {
    const a = ref(1);
    // 返回的对象作为render函数的参数
    return {
      a: a.value,
    };
  },
  render(proxy) {
    // 将插槽作为第三个参数传入，实际上就是子节点的children属性
    return h(RenderComponent, null, {
      header: t => h('header', {}, 'header' + t),
      footer: () => h('footer', {}, 'footer'),
      default: () => h('div', {}, proxy.a),
    });
  },
};
render(
  // 组件被挂载到一个虚拟节点的type上
  h(VueComponent, {}),
  app,
);
```

## emit 事件派发机制
