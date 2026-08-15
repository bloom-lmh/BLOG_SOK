---
order: 55
---

# 依赖追踪原理

## 依赖收集与代理模式

现在我们已经使用`effect`(观察者模式)解决了数据驱动视图变化的问题，那么这种观察者和被观察者之间的依赖关系是在什么时候又是如何被建立的呢？这里就要引入依赖收集的概念了。在 vue3 中使用了代理模式来实现观察者（`effect`）和被观察者（`model`）之间的自动绑定。其绑定发生的时机是在模板首次渲染以及数据更新重渲染时。当我们访问代理数据时，会触发代理对象的`get`陷阱从而实现依赖追踪建立被观察者与观察者之间的关系。

## 创建响应式代理对象-reactive

现在我们来看看 `reactive` 函数的实现：

```js {22}
// 响应式对象缓存
const reactiveMap = new WeakMap();
/**
 * 创建响应式对象
 * @param target 目标对象
 */
function createReactiveObject(target: any) {
  // reactive只能代理对象
  if (!isObject(target)) {
    return target;
  }
  // 已经代理则不再代理
  if (target[ReactiveFlags.IS_REACTIVE]) {
    return target;
  }
  // 优先走缓存
  const existProxy = reactiveMap.get(target);
  if (existProxy) {
    return existProxy;
  }
  // 代理对象为响应式对象
  let proxy = new Proxy(target, mutableHandlers);
  // 标记对象已经被代理
  proxy[ReactiveFlags.IS_REACTIVE] = true;
  // 根据对象缓存代理后的结果
  reactiveMap.set(target, proxy);
  // 返回
  return proxy;
}
/**
 * 创建响应式对象
 * @param target 目标对象
 */
export function reactive(target: any) {
  return createReactiveObject(target);
}
```

这里`createReactiveObject`主要做了两件事：

1. 使用`Proxy`包装目标对象为响应式对象（代理模式）
2. 标记并缓存这个响应式对象

## 代理 GET 和 SET 方法-mutableHandlers

`Proxy`构造函数要求第二个参数传入处理器对象，是对具体操作的拦截处理，我们来看看`mutableHandlers`的实现：

```js {14,18-20},34,36-39}
export const mutableHandlers: ProxyHandler<any> = {
  /**
   * 获取属性值
   * @param target 目标对象
   * @param key 属性名
   * @param recevier Proxy 或者继承 Proxy 的对象
   */
  get(target, key, recevier) {
    // 已代理对象ReactiveFlags.IS_REACTIVE属性一定为true
    if (key === ReactiveFlags.IS_REACTIVE) {
      return true;
    }
    // 访问属性时做依赖收集
    track(target, key);
    // 返回属性值
    let res = Reflect.get(target, key, recevier);
    // 如果key是对象的话，需要继续代理
    if (isObject(res)) {
      return reactive(res);
    }
    return res;
  },
  /**
   * 设置属性值
   * @param target 目标对象
   * @param key 属性名
   * @param value 属性值
   * @param recevier Proxy 或者继承 Proxy 的对象
   */
  set(target, key, value, recevier) {
    // 老值
    let oldVlue = target[key];
    // 设置属性值
    let result = Reflect.set(target, key, value, recevier);
    // 如果老值和新值不同，触发重新更新
    if (oldVlue !== value) {
      // 老值和新值不同，触发重新更新
      trigger(target, key, value, oldVlue);
    }
    return result;
  },
};
```

在`get`方法中，我们主要做了两件事：

1. 访问属性时调用`track`函数做依赖收集
2. 对于对象属性值，调用`reactive`函数递归的创建响应式对象

在`set`方法中，我们也主要做了两件事：

1. 设置属性值
2. 如果老值和新值不同，调用`trigger`函数触发更新

![响应式原理](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251130201145342.png)

## 依赖收集-track

> <span style="color:red; font-weight:bold;">观察者和被观察者的关系就是在此刻被自动的建立起来的</span>

在讲`track`函数之前我们需要完善下`ReactiveEffect`类：

```js
/**
 * run函数执行前初始化
 */
function preCleanEffect(effect) {
  effect._depsLength = 0;
  effect._trackId++; // 每次effect执行都是id+1，如果是一个effect执行，id就是相同
}
/**
 * 依赖清理函数
 * @param effect 要清除的effect
 */
function postCleanEffect(effect) {
  if (effect._depsLength < effect.deps.length) {
    for (let i = 0; i < effect._depsLength; i++) {
      cleanDepEffect(effect.deps[i], effect);
    }
    effect.deps.length = effect._depsLength;
  }
}
/**
 * ReactiveEffect 类
 * @description 是观察者，监听数据变化而调用run方法执行逻辑
 */
export class ReactiveEffect {
  /**
   * effect的run方法被调用的次数
   * @description 每一次调用run方法都会让这个值+1
   */
  _trackId = 0;
  /**
   * effect.deps 是一个数组，按顺序记录 effect 本次运行所依赖的 dep。
   * @description 通过 deps 实现 属性 → effect 和 effect → 对应的dep 的双向关联
   */
  deps = [];
  /**
   * 依赖的长度
   */
  _depsLength = 0;
  /**
   * running用于记录此时的effect是否正在执行避免递归调用
   */
  _running = 0;


  /**
   * @param fn 是当数据首次使用时触发的函数
   * @param scheduler 是数据变化时触发的函数
   */
  constructor(public fn: Function, public scheduler: Function) {}

  /**
   * 执行副作用处理逻辑
   */
  run() {
    //  // 不是激活的，执行后什么都不做
    if (!this.active) {
      return this.fn();
    }
    // 记录上次执行的effect用于追钟
    let lastEffect = activeEffect;
    try {
      // 记录当前执行的effect
      activeEffect = this;
      // 每次effect执行前，应当将上次的依赖清空，不然会越来越多
      preCleanEffect(this);
      // 标志着当前effect正在执行
      this._running++;
      // 如果是激活的，则需要做依赖收集
      return this.fn(); // 触发传入effect里的函数
    } finally{
      this._running--;
    }
  }
}
```

其中：

1. `_trackId`：记录 effect 执行次数，每次执行都会+1
2. `deps`：记录该 effect 对应属性的全部依赖 dep
3. `_depsLength`：依赖的长度

`track`函数是在`mutableHandlers`的`get`函数中被调用，主要用来做依赖收集，这个函数会在响应式对象的属性被访问时调用，调用时`track`函数会将访问的属性和当前激活的`effect`建立关联关系。

我们来看下`track`函数具体做了什么：

```js {33,38-42,45}
/**
 * 响应式对象属性和effect的映射
 * @description 依赖收集的结果，主要建立响应式对象与属性，属性和effect的映射关系
 */
const targetMap = new WeakMap();

/**
 * 创建依赖收集器
 * @param cleanup 清理函数
 * @param name 自定义的，源码里没有这里用来标识用于显示是为那个属性服务的收集effect
 */
export const createDep = (cleanup: Function, name: string) => {
  // 创建一个新的依赖收集器
  const dep = new Map() as any;
  // 挂载清理函数
  dep.cleanup = cleanup;
  // 挂载属性名
  dep.name = name;
  return dep;
};

/**
 * 依赖追踪函数
 * @param target 目标响应式对象
 * @param key 要建立映射的属性名
 */
export function track(target, key) {
  // activeEffect 是一个全局变量，记录着当前激活的effect对象
  if (activeEffect) {
    let depsMap = targetMap.get(target);
     // 如果没有建立过响应式对象和属性的映射关系则创建一个新的
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()));
    }
    let dep = depsMap.get(key);
    // 如果没有建立过属性和effect的映射关系则创建一个新的
    if (!dep) {
      depsMap.set(
        key,
        // 创建effect的依赖收集器，并提供属性和effect的映射关系的清理函数
        (dep = createDep(() => depsMap.delete(key), key))
      );
    }
     // 将当前的effect放入到dep（effect收集器）中，后续可以根据属性值的变化来触发此dep中所有的effect
    trackEffect(activeEffect, dep);
  }
}
```

可以看到在`track`函数中，建立了三级`map`映射表：

1. 第一级的`targetMap`：用来保存响应式对象和属性的映射关系
2. 第二级的`depsMap`：用来保存该对象的属性和它对应的`effect`的映射关系
3. 第三级的`dep`：用来保存属性关联的`effect`，这个 dep 也是由 map 来进行呈现，记录着属性对应的同一`effect`被收集的次数

这个`map`结构如下(伪代码形式)：

```js
// 第一层targetMap,建立响应式对象和属性的映射关系
targetMap ={
  target1=>{
    // 第二层depsMap,建立该对象的属性和effect的映射关系
    key1=> {
      // 第三层dep,记录属性关联的effect
      effect1=>1,
      effect2=>1
    },
    key2=> {
      effect1=>1,
      effect3=>1
    }
  },
  target2: {
     // ...
  }
}
```

然后我们再来看看`trackEffect`函数，这个函数是执行依赖收集和依赖更新的核心函数：

```js
/**
 * 清除依赖
 * @param dep 依赖收集器
 * @param effect 要清除的effect
 */
function cleanDepEffect(dep, effect) {
  // dep这个map中删除effect
  dep.delete(effect);
  // 如果map为空，就清理掉这个dep
  if (dep.size == 0) {
    dep.cleanup();
  }
}
/**
 * 收集effect，同时清除不再使用的旧依赖
 * @param effect 当前激活的effect
 * @param dep effect收集器
 * @description 建立双向关联，dep记录了属性对应的effect，而effect同时也记录与它有关联的属性的全部的dep
 * 在每次 effect 执行时，只保留当前活跃的依赖（dep），移除不再使用的旧依赖，避免内存泄漏和无效更新。
 */
export function trackEffect(effect, dep) {
  // 首次收集或新一轮的依赖收集
  // 只要这个属性被收集过了就会记录这次的effect版本号，再同一次版本号内的effect再进来就会===了
  if (effect._trackId !== dep.get(effect)) {
    // 如果属性没有关联过这个effect，则建立关联
    // 如果属性建立过关联，则更新effect版本号
    dep.set(effect, effect._trackId);
    // 每次effect run方法时_depsLength都会置为0，重头比较dep，对于同一个dep则复用，否则清除避免内存泄漏
    let oldDep = effect.deps[effect._depsLength];
    if (oldDep !== dep) {
      // 如果有老的依赖，则删除老的没有用到的依赖
      if (oldDep) {
        cleanDepEffect(oldDep, effect);
      }
      // 建立新的依赖
      effect.deps[effect._depsLength++] = dep;
    } else {
      effect._depsLength++;
    }
  }
}
```

`trackEffect`函数主要的作用就是：

1. 建立双向关联：`dep`记录了属性对应的`effect`，也就是观察者，当属性变化的时候会通知观察者执行，而`effect`同时也记录与它有关联的属性的全部的`dep`（也就是只要属性持有这个`effect`那么这个`effect`就持有这个属性的`dep`）这样做的目的在于方便清理依赖
2. 复用和清理 `dep`：对于同一个`dep`，尽最大限度的复用，当属性没有与`effect`产生关联时清除`dep`中对应的`effect`

我们来看一个案例，这个案例中`showName`一开始`true`所以会首先会渲染出`学生姓名：xm ,学生年龄：12`，然后 1 秒后，`showName`变为`false`，手动触发观察者执行（`effect.run()`）然后重新渲染为`学生年龄：12`:

```html
<div id="app"></div>
<script type="module">
  import { ReactiveEffect, reactive } from './runtime-dom.js';
  let student = reactive({
    name: 'xm',
    age: 12,
    showName: true,
  });
  const effect = new ReactiveEffect(
    () => {
      app.innerHTML = student.showName ? `学生姓名：${student.name} ,学生年龄：${student.age}` : `学生年龄：${student.age}`;
    },
    () => {
      effect.run();
    },
  );
  effect.run();
  setTimeout(() => {
    student.showName = false;
    effect.run();
  }, 1000);
```

在这个案例中，第一步`effect.run()`执行时，由于访问了响应式对象`student`的属性所以触发了`track`函数，进行了依赖收集，建立了属性和`effect`的映射关系，也就是如下所示：

![第一次依赖收集](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251201171525544.png)

当`setTimeout`函数执行时，`student.showName`变为`false`，`effect.run()`被调用，又重新触发了依赖收集：

![第二次依赖收集](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251201175553820.png)

## 依赖更新-trigger

`trigger`函数是在`mutableHandlers`的`set`函数中被调用，主要用来触发依赖更新，这个函数会在响应式对象的属性被设置时调用，调用时`trigger`函数会将属性对应的`effect`全部执行。

我们来看下`trigger`函数具体做了什么：

```js
/**
 * 触发依赖更新
 * @param target 目标响应式对象
 * @param key 要更新的属性名
 * @param newValue 新值
 * @param oldVlue 老值
 */
export function trigger(target, key, newValue, oldVlue) {
  // 获取响应式对象和属性的映射关系
  let depsMap = targetMap.get(target);
  if (!depsMap) {
    // 如果对整个对象都没有依赖直接返回
    return;
  }
  // 获取属性对应的effect
  let dep = depsMap.get(key);
  if (dep) {
    // 如果确实有对应的依赖，则执行其中的effect函数
    triggerEffect(dep);
  }
}
```

下面是`triggerEffect`函数：

```js
/**
 * dep是属性对应的所有的effect集合
 * @description 遍历dep中的effect，执行其中的run方法，其实就是通知观察者执行
 */
export function triggerEffect(dep) {
  // 将属性里收集的所有effect依次执行
  for (const effect of dep.keys()) {
    if (!effect._running) {
      // 如果不是正在执行，才能执行
      if (effect.scheduler) {
        // 执行回调函数，重新运行run方法
        effect.scheduler();
      }
    }
  }
}
```
