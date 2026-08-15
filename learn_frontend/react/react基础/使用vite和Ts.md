---
order: 319
---

# 使用 vite 和 ts

[[toc]]

## 基于 Vite 创建开发环境

Vite 是一个框架无关的前端工具链，可以快速的生成一个 React + TS 的开发环境，并且可以提供快速的开发体验`npm create vite@latest react-ts-pro -- --template react-ts`

1. `npm create vite@latest` 固定写法 （使用最新版本 vite 初始化项目）
2. `react-ts-pro` 项目名称 （可以自定义）
3. `-- --template react-ts` 指定项目模版位 `react+ts`

## useState 与 TypeScript

### useState-自动推导

通常 React 会根据传入 `useState` 的默认值来自动推导类型,不需要显式标注类型
说明：

1. `value`: 类型为 `boolean`
2. `toggle`: 参数类型为 `boolean`也就是说你传入 `false` 后 `value` 被推导为 `boolean` 类型，在 `toggle` 中也不能传递非 `boolean` 类型来改变 `value` 的值

```js {}
import { useState } from 'react';

function App() {
  const [value, toggle] = useState(false); // [!code focus]
  const changeValue = () => {
    toggle('传递了错误类型'); // 不可以将字符串传给boolean类型 [!code focus]
  };
  return <>this is app{value}</>;
}

export default App;
```

### useState-传递泛型参数

`useState`本身是一个泛型函数，可以传入具体的自定义类型

1. 限制 `useState` 函数参数的初始值必须满足类型为： `User | () => User`
2. 限制 `setUser` 函数的参数必须满足类型为：`User | () => User | undefined`
3. `user` 状态数据具备 `User` 类型相关的类型提示

```ts
import { useState } from 'react';
type User = {
  name: string;
  age: number;
};
function App() {
  // 传入user后有智能提示
  const [user, setUser] = useState<User>({
    name: 'jack',
    age: 18,
  });

  const changeUser = () => {
    setUser({
      name: 'seta',
      age: 28,
    });
  };
  return (
    <>
      this is app <br />
      name :{user.name} <br />
      age: {user.age}
      <button onClick={changeUser}>改变用户信息</button>
    </>
  );
}
```

### useState-初始值为 null

当我们不知道状态的初始值是什么，将 `useState` 的初始值为 `null` 是一个常见的做法，可以通过具体类型联合 `null` 来做显式注解

1. 限制 `useState` 函数参数的初始值可以是 `User | null`
2. 限制 `setUser` 函数的参数类型可以是 `User | null`

## 事件与 TypeScript

为事件回调添加类型约束需要使用 `React` 内置的泛型函数来做，比如最常见的鼠标点击事件和表单输入事件：
通过泛型函数约束了整个事件回调函数的类型，主要是为了约束事件参数 `e` 的类型

## Props 与 TypeScript

### props 与 TypeScript - 基础使用

为组件 `prop` 添加类型，本质是给函数的参数做类型注解(添加类型约束)，可以使用 `type` 对象类型或者 `interface` 接口来做注解
比如:`Button` 组件只能传入名称为 `className` 的 `prop` 参数和 `title` 参数，类型为 `string`, 且为必填

```ts
type ButtonProps = {
  className: string;
  title: string;
};
const Button = (props: ButtonProps) => {
  const { className, title } = props;
  return <button className={className}>{title}</button>;
};
function App() {
  return (
    <>
      this is app <br />
      <Button className='test' title='按钮' />
    </>
  );
}

export default App;
```

### props 与 TypeScript - 为事件 prop 添加类型

组件经常执行类型为函数的 `prop` 实现子传父，这类 `prop` 重点在于函数参数类型的注解
说明：

1. 在组件内部调用时需要遵守类型的约束，参数传递需要满足要求
2. 绑定 `prop` 时如果绑定内联函数直接可以推断出参数类型，否则需要单独注解匹配的参数类型

### props 与 TypeScript - 为 children 添加类型

`children` 是一个比较特殊的 `prop`, 支持多种不同类型数据的传入，需要通过一个内置的 `ReactNode` 类型来做注解

```js
type ButtonProps = {
  className: string,
  children: React.ReactNode, //[!code focus]
};
const Button = (props: ButtonProps) => {
  const { className, children } = props;
  return <button className={className}>{children}</button>;
};
function App() {
  return (
    <>
      this is app <br />
      <Button className='test'>
        <span>点我</span>
      </Button>
    </>
  );
}

export default App;
```

注解之后，`children` 可以是多种类型，包括：`React.ReactElement` 、`string`、`number`、`React.ReactFragment` 、`React.ReactPortal` 、`boolean`、 `null` 、`undefined`

### props 与 TypeScript - 为事件 prop 添加类型

组件经常执行类型为函数的 `prop` 实现子传父，这类 `prop` 重点在于函数参数类型的注解
说明：

1. 在组件内部调用时需要遵守类型的约束，参数传递需要满足要求
2. 绑定 `prop` 时如果绑定内联函数直接可以推断出参数类型，否则需要单独注解匹配的参数类型

```js
type SonProps = {
  onGetMsg?: (msg: string) => void,
};
function Son(props: SonProps) {
  const { onGetMsg } = props;
  const clickHandler = () => {
    onGetMsg?.('子组件传来的消息');
  };
  return <button onClick={clickHandler}>sendMsg</button>;
}
function App() {
  const onGetMsg = (msg: string) => {
    console.log(msg);
  };
  return (
    <>
      this is app <br />
      <Son onGetMsg={onGetMsg} />
    </>
  );
}

export default App;
```

## useRef 与 TypeScript

获取 `dom` 的场景，可以直接把要获取的 `dom` 元素的类型当成泛型参数传递给 `useRef`,可以推导出`.current` 属性的类型

```js{4,11}
import { useEffect, useRef } from 'react';

function App() {
  const domRef = useRef < HTMLInputElement > null;
  useEffect(() => {
    domRef.current?.focus;
  }, []);
  return (
    <>
      this is app <br />
      <input type='text' ref={domRef} />
    </>
  );
}

export default App;
```

把 `useRef` 当成引用稳定的存储器使用的场景可以通过泛型传入联合类型来做，比如定时器的场景：

```js
import { useEffect, useRef } from 'react';

function App() {
  const timerRef = (useRef < number) | (undefined > undefined);
  useEffect(() => {
    timerRef.current = setInterval(() => {
      console.log('1');
    }, 1000);
    return () => {
      clearInterval(timerRef.current);
    };
  }, []);
  return <>this is app</>;
}

export default App;
```
