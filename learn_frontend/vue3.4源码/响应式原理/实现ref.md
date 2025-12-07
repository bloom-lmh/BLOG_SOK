# 实现 ref

由于`vue3`采用`Proxy`而不是`Object.defineProperty`，所以它没有办法直接代理基本数据类型，对于基本数据类型的代理，`vue3`采用了访问器属性来实现。`vue3`定义了一个`RefImpl`类来包装基本数据，并提供`value`这个访问器属性来让用户使用。我们先来看看这个类的实现：

```js
/**
 * ref包装类
 * @description 包装原始数据为对象
 */
class RefImpl {
  /**
   * 是否为ref对象的标识
   */
  public __v_isRef = true;
  /**
   * 保存原始值
   */
  public _value;
  /**
   * 用于收集effect
   * @description 就是ref对象的观察者
   */
  public dep;

  /**
   * 构造函数
   * @param rawValue 原始值
   */
  constructor(public rawValue) {
    // 如果是对象则调用将对象转为响应式对象
    if (isObject(rawValue)) {
      this._value = toReactive(rawValue);
    } else {
      this._value = rawValue;
    }
  }
  /**
   * 通过value来访问这个数据
   * @example name.value
   */
  get value() {
    // 在访问时收集依赖
    trackRefValue(this);
    // 返回原始值
    return this._value;
  }
  /**
   * 通过value来设置这个数据
   * @example name.value = 'newName'
   */
  set value(newValue) {
    // 新老值不相等
    if (newValue !== this.rawValue) {
      // 更新原始值
      this.rawValue = newValue;
      this._value = newValue;
      // 通知依赖更新
      triggerRefValue(this);
    }
  }
}

```

可以看到这个`RefImpl`类主要是对原始值进行包装，并提供`value`属性来访问原始值，同时提供`set`方法来更新原始值并通知依赖更新。和`proxy`一样，在`get`方法中依然会进行依赖收集，在`set`方法中会进行依赖更新。`trackRefValue`函数实现如下：

```js
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
```

`triggerRefValue`函数实现如下：

```js
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

之后还需要提供对外函数`ref`，来创建`RefImpl`对象:

```js
/**
 * ref函数
 */
export function ref(value) {
  return createRef(value);
}

function createRef(value) {
  return new RefImpl(value);
}
```

::: tip 关于为什么要采用`proxy`来代替`defineProperty`

1. 监听能力更全面：`Object.defineProperty`是在操作对象的属性描述符对象，只能拦截对象已有属性的读取（`get`）和设置（`set`）,无法监听新增或删除属性（除非手动调用 `Vue.set` / `this.$set`）对数组的某些操作（如通过索引赋值、`length` 修改）支持不完善。而`proxy`可以监听到所有属性的操作，包括新增、删除、修改。
2. 性能与初始化开销：`Object.defineProperty`一次代理一个属性，所以对于对象需要深度递归进行劫持，开销大启动慢。而`Proxy`采用懒处理策略，只有在访问嵌套属性时才递归创建代理，初始化更快，内存占用更低

:::
