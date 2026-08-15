---
order: 58
---

# 实现 watch/watchEffect

`watch`函数能够监听响应式数据的变化然后调用回调函数执行额外的副作用。从本质来讲还是观察者模式。回调函数就是观察者要执行的逻辑，被观察者就是响应式数据，本质上还是包装为`ReactiveEffect`对象。

```js {}
/**
 * watch函数
 * @param source 要监听的响应式数据,可以是响应式对象或者一个getter函数，最终被封装到ReactiveEffect对象中做第一个函数传入
 * @param cb 监听到数据变化时执行的回调函数，会作为ReactiveEffect的第二个参数传入
 */
export function watch(source, cb, options = {} as any) {
  return doWatch(source, cb, options);
}

// 其实watchEffect效果上就等于reactEffect，只不过中间多加了一层中转罢了；但是好像没有导出reactEffect作为一个函数，但是你可以通过使用effect，但是自定义scheduler来实现
export function watchEffect(getter, options = {} as any) {
  // 没有cb就是watchEffect
  return doWatch(getter, null, options);
  // 在watchEffect中，第一个参数既作为getter的收集源，也作为触发的scheduler
}

/**
 * 递归访问响应式对象属性,从而进行依赖收集
 * @param source 要访问的响应式对象
 * @param depth 遍历的深度
 * @param currentDepth 当前深度
 */
function traverse(source, depth, currentDepth = 0, seen = new Set()) {
  // 非对象直接返回
  if (!isObject(source)) {
    return source;
  }
  // 要递归的深度
  if (depth) {
    // 遍历到最大深度则返回
    if (currentDepth >= depth) {
      return source;
    }
    currentDepth++; // deep属性来确认遍历层数是否ok
  }
  // 避免循环依赖
  if (seen.has(source)) {
    // 放置递归遍历
    return source;
  }
  // 递归遍历每个属性
  for (let key in source) {
    seen.add(source);
    traverse(source[key], depth, currentDepth, seen);
  }
  return source;
}
/**
 * doWatch函数
 * @param source 要监听的响应式数据,可以是响应式对象或者一个getter函数，最终被封装到ReactiveEffect对象中做第一个函数传入
 * @param cb 监听到数据变化时执行的回调函数，会作为ReactiveEffect的第二个参数传入
 * @param options 选项
 */
function doWatch(source, cb, { deep, immediate }) {
  // 响应式getter函数，调用getter时触发依赖收集
  const reactiveGetter = (source) =>{
    // 这个函数会手动的遍历每一个属性，触发get陷阱从而进行依赖收集
     return traverse(source, deep === false ? 1 : undefined);
  }
  let getter;
  // 若source是响应式对象，则直接用reactiveGetter作为getter
  if (isReactive(source)) {
    // 调用getter时会遍历每个属性，从而触发get陷阱，进行依赖收集
    getter = () => reactiveGetter(source);
  } else if (isRef(source)) {
    // 考虑到ref可能是个对象，他会自动封装成reactive对象，这时需要对reactive对象进行深度的遍历进行依赖收集
    getter = () => {
      // 已经做了依赖收集
      const value = source.value;
      return isObject(value) ? reactiveGetter(value) : value;
    };
    // 若是函数则直接作为getter函数
  } else if (isFunction(source)) {
    getter = source;
  }
  // 记录老的值
  let oldValue;
  let clean;
  // 清理函数
  const onCleanup = (fn) => {
    // 清理副作用函数，常用于解决竞态问题
    clean = () => {
      fn();
      clean = undefined;
    };
  };
  // 封装callback，更新时调用，如果immediate为true，则立即执行
  const job = () => {
    if (cb) {
      // 重新或立即进行依赖收集，因为数据更新后，依赖可能发生了变化
      const newValue = effect.run();
      if (clean) {
        clean(); // 在执行回调前，先调用上一次的清理操作进行操作
      }
      // 执行回调传入老值和新值
      cb(newValue, oldValue, onCleanup);
      oldValue = newValue;
    } else {
      // 没有cb说明是watchEffect，所以第一个source一定是函数，且不用那种返回了所以也不需要newValue之类得了，只需要执行job也就是source函数即可
      effect.run();
    }
  };
  // 创建ReactiveEffect对象
  const effect = new ReactiveEffect(getter, job);
  // 如果cb存在
  if (cb) {
     // 立即执行一次回调函数
    if (immediate) {
      job();
    } else {
      // 否则触发getter，进行依赖收集
      oldValue = effect.run();
    }
  } else {
    effect.run();
  }
  const unwatch = () => effect.stop();
  return unwatch;
}

```

`watch`具体有几个注意点：

1. 实现`watch`的关键在于，手动的建立观察者模式。观察者就是`getter`函数
2. 如果不是立即执行，则先调用`getter`进行依赖收集，然后数据变化时再调用`scheduler`函数执行回调函数并重新收集依赖。如果是立即执行，则直接调用`scheduler`函数，并在其中做依赖收集。

`watchEffect`本质就是没有回调函数的`watch`，只不过它有一个默认的`scheduler`函数，就是执行`getter`函数。
