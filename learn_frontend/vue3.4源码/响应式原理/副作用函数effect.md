# 副作用函数 effect

从观察者模式的角度入手，有一个非常重要的概念叫`effect`，这个`effect`从字面意思来理解就是影响（副作用），是 vue 对数据变化时产生的一系列副作用的抽象描述。比如：

- 数据变化后我们要更新视图
- 数据变化后我们要重新发起请求
- 数据变化后我们要触发某些其它副作用
- ...

![观察者模式](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251128105700835.png)

也就是说这个 `effect` 其实就是一个抽象的观察者(Observer)，是对当数据变了我要做什么的具体逻辑的封装。我们来看一个具体的`effect`源码实现：

```js {8,10-17}
// 记录当前激活的effect
export let activeEffect;

/**
 * ReactiveEffect 类
 * @description 是观察者，监听数据变化而调用run方法执行逻辑
 */
export class ReactiveEffect {
  // ...

  /**
   * @param fn 是当数据首次使用时触发的函数
   * @param scheduler 是数据变化时触发的函数
   */
  constructor(public fn: Function, public scheduler: Function) {}

  /**
   * run函数是执行effect具体逻辑的函数
   * @returns 返回执行effect函数的结果
   */
  run() {
    try {
      // 记录当前激活的effect
      activeEffect = this;
      // 如果是激活的，则需要做依赖收集
      return this.fn(); // 触发传入effect里的函数
    } finally {
       // ...
    }
  }
}
```

可以看到这个 `ReactiveEffect`创建时会传入两个函数，这两个函数就是观察者要执行的具体逻辑。只不过这两个函数的执行时机不同：

1.  `fn` 函数：这个函数是当数据首次使用时触发，是主要逻辑
2.  `scheduler` 函数：这个函数是当数据变化时触发

我们来看一个具体的案例来模拟手动触发观察者执行`run`函数：

> 这个案例中，先执行`effect run` 函数渲染出`Hello Vue`，当 1 秒后更新数据，再次触发将触发 `effect run` 函数，这个函数会将 `app.innerHTML` 设为 `Hello React`

```js
import { ReactiveEffect } from './runtime-dom.js';
let str = 'Hello Vue';
const effect = new ReactiveEffect(
  () => {
    app.innerHTML = str;
  },
  () => {
    effect.run();
  },
);
effect.run();
setTimeout(() => {
  str = 'Hello React';
  effect.run();
}, 1000);
```
