---
order: 317
---

# Hook

[[toc]]

## 什么是 Hook

React Hooks 的核心本质就是**逻辑的复用与封装。它们通过将组件中的状态逻辑、副作用逻辑等抽离成可复用的函数**，解决了 Class 组件时代逻辑难以复用、组件嵌套过深（"Wrapper Hell"）等问题
::: tip 在开发中组件抽象原则为

1. 智能组件负责数据的获取
2. UI 组件负责数据渲染

:::

## 自定义 Hook

自定义 Hook 是以 use 打头的函数，通过自定义 Hook 函数可以用来实现逻辑的封装和复用

```js{3-13}
import { useEffect, useState } from "react";
// 自定义hook函数
function useToggle() {
  const [value, setValue] = useState(true);

  const handleToggle = () => {
    setValue(!value);
  };
  return {
    value,
    handleToggle,
  };
}
function App() {
  // 使用自定义hook
  const { value, handleToggle } = useToggle();
  return (
    <div>
      {value && <div>this is div</div>}
      <button onClick={handleToggle}>toggle</button>
    </div>
  );
}
```

封装自定义 hook 通用思路总结

1. 声明一个以 use 打头的函数
2. 在函数体内封装可复用的逻辑（只要是可复用的逻辑）
3. 把组件中用到的状态或者回调 return 出去（以对象或者数组）
4. 在哪个组件中要用到这个逻辑，就执行这个函数，解构出来状态和回调进行使用

## React Hooks 使用规则

1. 只能在组件中或者其他自定义 Hook 函数中调用
2. 只能在组件的顶层调用，不能嵌套在 **if、for、其他函数中**
   比如

```js{15-23}
import { useState } from "react";
// 自定义hook函数
function useToggle() {
  const [value, setValue] = useState(true);

  const handleToggle = () => {
    setValue(!value);
  };
  return {
    value,
    handleToggle,
  };
}
function App() {
  // 下面是hook的错误用法
  // 1.不能在if中使用
  if (Math.random() > 0.5) {
    const { value, handleToggle } = useToggle();
  }
  // 2. 不能在for循环中使用
  for (let i = 0; i < 2; i++) {
    const { value, handleToggle } = useToggle();
  }
  return (
    <div>
      {value && <div>this is div</div>}
      <button onClick={handleToggle}>toggle</button>
    </div>
  );
}
```
