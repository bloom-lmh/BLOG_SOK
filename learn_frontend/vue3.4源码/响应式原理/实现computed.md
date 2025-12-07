# 实现 computed

`computed`能够实现对属性的计算，当依赖的属性变化时，它会重新计算。`computed`需要传入一个`getter`函数或者是一个`{ get, set }`对象。然后返回一个`ComputedRefImpl`对象,实现如下：

```js
/**
 * computed函数
 * @param getterOrOptions 计算属性的getter函数或者{get,set}对象
 */
export function computed(getterOrOptions) {
  // 如果是一个函数直接作为getter函数
  let onlyGetter = isFunction(getterOrOptions);
  let getter;
  let setter;
  // 只有getter
  if (onlyGetter) {
    getter = onlyGetter;
    setter = () => {};
  } else {
    // 有get和set
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }
  // 创建 ComputedRefImpl对象
  return new ComputedRefImpl(getter, setter); // 计算属性ref
}
```

可以看到最后返回了一个`ComputedRefImpl`对象，这个对象和`RefImpl`类似，这个对象内部的实现很容易猜到，从观察者模式的角度来看，无非是数据变化的时候重新调用`getter`函数计算新值。于是我们可以同样和将其封装为`effect`对象，当数据发生变化的时候会执行`Getter`函数即可。
同时需注意在看`ComputedRefImpl`的实现前需要再完善下`ReactiveEffect`类：

```js {4-7,54}
/**
 * 脏值枚举
 */
export enum DirtyLevels {
  Dirty = 4, // 脏值，意味着取值要运行计算属性
  NoDirty = 0, // 不脏，不允行
}
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
   * 是否为脏值
   * @description 脏值意味着取值要运行计算属性，不脏值意味着不需要运行，这样可以用于`computed`的性能优化和值缓存。如果没有这个值那么每次取值都会重新计算。
   */
  _dirtyLevel = DirtyLevels.Dirty;

  /**
   * 是否脏值
   */
  public get dirty() {
    return this._dirtyLevel === DirtyLevels.Dirty;
  }

  /**
   * 设置是否脏值
   */
  public set dirty(v) {
    this._dirtyLevel = v ? DirtyLevels.Dirty : DirtyLevels.NoDirty;
  }

  /**
   * @param fn 是当数据首次使用时触发的函数
   * @param scheduler 是数据变化时触发的函数
   */
  constructor(public fn: Function, public scheduler: Function) {}

  /**
   * 执行副作用处理逻辑
   */
  run() {
    // 每次运行后，effect变为no_dirty
    this._dirtyLevel = DirtyLevels.NoDirty;
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
      // 触发传入effect里的函数，如果是激活的，则需要做依赖收集
      return this.fn();
    } finally{
      this._running--;
       // 本来想着收集完依赖之后就将这个全局变量置空，但是考虑到如果effect嵌套了，内部effect执行完就置空了，如果还有接下来的逻辑尴尬了收集不了剩下的依赖了
      postCleanEffect(activeEffect);
      // 将上次最后的effect保存，待此次结束后返回避免丢失
      activeEffect = lastEffect;
    }
  }
}
```

在`ReactiveEffect`类中主要添加了：

1. `_dirtyLevel`属性：用于标识当前的 `effect` 是否脏，脏值意味着取值要运行计算属性，不脏值意味着不需要运行，这样可以用于`computed`的性能优化和值缓存。如果没有这个值那么每次取值都会重新计算。
2. `postCleanEffect`函数：用于清理依赖，当依赖的长度比之前小时，说明有依赖被清除，需要重新收集依赖。

同时我们还需要完善下`triggerEffect`函数：

```js
export function triggerEffect(dep) {
  // 将属性里收集的所有effect依次执行
  for (const effect of dep.keys()) {
    // 触发更新需要将值变为脏值，这样下次取`computed`值的时候才会重新计算
    if (effect._dirtyLevel < DirtyLevels.Dirty) {
      effect._dirtyLevel = DirtyLevels.Dirty;
    }
    if (!effect._running) {
      // 如果不是正在执行，才能执行
      if (effect.scheduler) {
        effect.scheduler(); // 执行回调函数，重新运行run
      }
    }
  }
}
```

`ComputedRefImpl`类实现如下：

```js
/**
 * 计算属性返回对象
 */
class ComputedRefImpl {
  /**
   * 计算的值
   */
  public _value;
  /**
   * 计算属性对应的effect
   */
  public effect;
  /**
   * 计算属性对应的依赖
   */
  public dep;
  /**
   * 构造函数
   * @param getter 计算属性的getter函数
   * @param setter 计算属性的setter函数
   */
  constructor(getter, public setter) {
    //创建一个effect
    this.effect = new ReactiveEffect(
      // 会传入先前计算的值，在getter中还需要进行依赖收集
      () => getter(this._value),
      () => {
        // 计算属性依赖发生改变后，将值effect变为脏值
        triggerRefValue(this);
      }
    );
  }
  /**
   * 取计算属性值
   */
  get value() {
    // 如果dirty为true，说明依赖的值发生了变化，需要重新计算
    if (this.effect.dirty) {
      // 当访问计算属性时才调用getter函数做计算，本质上是惰性求值
      this._value = this.effect.run();
      // 该RemImpl要收集依赖到dep
      trackRefValue(this);
    }
    return this._value;
  }
  /**
   * 设置计算属性值
   */
  set value(newValue) {
    // 这个就是ref的setter
    this.setter(newValue);
  }
}
/**
 * 建立ref对象和effect的映射关系
 * @param ref 要建立映射的ref对象
 */
export function trackRefValue(ref) {
  if (activeEffect) {
    // 建立ref和effect的双向关联
    trackEffect(activeEffect, (ref.dep = ref.dep || createDep(() => (ref.dep = undefined), 'undefined')));
  }
}
/**
 * 触发ref对象依赖更新
 */
export function triggerRefValue(ref) {
  let dep = ref.dep;
  if (dep) {
    // 触发依赖更新
    triggerEffect(dep);
  }
}
```

在`ComputedRefImpl`中有几个关键点：

1. 惰性求值：只有当计算属性被访问时，且值为脏值的时候才会调用`getter`函数进行计算，而不是在创建`ComputedRefImpl`对象时就立即调用。
2. 依赖收集：当计算属性被访问时，调用`effect.run`方法执行`getter`函数，此时会访问里面的响应式数据触发依赖收集，同时自身也会将`effect`收集到自己的`dep`中。
3. 依赖更新：当设置源数据时，会调用`scheduler`函数，而`scheduler`函数中会把对应`effect`变为脏，这样下次取值的时候才会重新计算。
4. 脏值的本质就是锁
