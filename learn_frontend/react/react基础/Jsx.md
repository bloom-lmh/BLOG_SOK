# Jsx

本课程学习网站
https://www.yuque.com/fechaichai/qeamqf/xbai87
[[toc]]

## 什么是 jsx

JSX 是 JavaScript 和 XML（HTML）的缩写，表示在 JS 代码中编写 HTML 模版结构,它是 React 中编写 UI 模版的方式
JSX 并不是标准的 JS 语法，它是 JS 的语法扩展，浏览器本身不能识别，需要通过解析工具 Babel 做解析之后才能在浏览器中运行
::: tip
也就是将 xml 标签解析为虚拟 DOM，然后将虚拟 DOM 渲染为真实的 DOM，这样将 html 标签用 xml 代替，就既可以享受 HTML 的声明式模版写法以及 JS 的可编程能力
:::

## jsx 的基本使用

### 表达式渲染

在 JSX 中可以通过 大括号语法{} 识别 JavaScript 中的表达式，比如常见的变量、函数调用、方法调用等等

1. 使用引号传递字符串
2. 使用 JavaScript 变量
3. 函数调用和方法调用
4. 使用 JavaScript 对象

```js
function getData() {
  return '使用函数';
}
const num = 1;
function App() {
  return (
    <div className='App'>
      {getData()}
      {'字符串'}
      {num}
      <div style={{ color: 'red' }}>使用js对象</div>
    </div>
  );
}
```

### 列表渲染

```js{9-17}
const list = [
  { id: 1001, name: "小明" },
  { id: 1002, name: "小兰" },
  { id: 1003, name: "小化" },
];
function App() {
  return (
    <div className="App">
      <ul>
        {list.map((item) => {
          return (
            <li key={item.id}>
              id:{item.id},name:{item.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

### 条件渲染

在 React 中，可以通过逻辑与运算符&&、三元表达式（?:）实现基础的条件渲染

```js{16-18}
const isLogin = false;
const isShow = true;
const articleType = 1;
function article() {
  if (articleType === 0) {
    return <div>无图文章</div>;
  } else if (articleType === 1) {
    return <div>单列文章</div>;
  } else {
    return <div>双列文章</div>;
  }
}
function App() {
  return (
    <div className="App">
      {isShow && <span>展示详情</span>}
      {isLogin ? <span>登录成功</span> : <span>登录失败</span>}
      {article()}
    </div>
  );
}

export default App;
```

### 事件绑定

::: code-group

```js [不传参数]{7}
function App() {
  const handleClick = () => {
    console.log('button点击了');
  };
  return (
    <div className='App'>
      <button onClick={handleClick}>click me</button>
    </div>
  );
}
```

```js [传参]{7}
function App() {
  const handleClick = (name, e) => {
    console.log('name:', name, e);
  };
  return (
    <div className='App'>
      <button onClick={e => handleClick('jack', e)}>click me</button>
    </div>
  );
}
```

:::

## 组件

### 组件和模块的区别

1. 模块就是抽取的 js 文件，是对 js （逻辑/行为）的复用
2. 组件就是 html\css\js 的集合，是对 html\css\js （标签样式行为）的复用

### React 中的组件

在 React 中，一个组件就是**首字母大写的函数**，内部存放了组件的逻辑和视图 UI, 渲染组件只需要把组件当成标签书写即可。

```js
function Button() {
  return <button>点我</button>;
}
function App() {
  return (
    <div className='App'>
      {/* 自闭和 */}
      <Button />
      {/* 成对标签 */}
      <Button></Button>
    </div>
  );
}
```

## useState

### 什么是 useState

`useState` 是一个 React Hook（函数），它允许我们向组件添加一个状态变量, 从而控制影响组件的渲染结果
::: tip
状态变量就是被代理了的变量，useState 有点像 Vue 的 ref 函数和 reactive 的作用。
</br>
和普通 JS 变量本质不同的是，状态变量一旦发生变化组件的视图 UI 也会跟着变化（数据驱动视图）
:::

### 修改状态的规则

注意直接修改 `count` 变量不会触发试图的更新，必须使用 `setCount` 来修改 `count` 才会触发试图更新

### 基本使用

::: code-group

```js [对普通变量进行代理]{7,10}
import { useState } from 'react';

function App() {
  // 1.调用useState添加一个状态变量
  // count 状态变量
  // setCount 修改状态变量的方法
  const [count, setCount] = useState(0);
  // 2.点击事件回调
  const handleClick = () => {
    setCount(count + 1);
  };
  return (
    <div className='App'>
      <button onClick={handleClick}>{count}</button>
    </div>
  );
}
```

```js{8-11,4-6}[对对象进行代理]
import { useState } from "react";

function App() {
  const [person, setPerson] = useState({
    name: "jack",
  });
  const handleClick = () => {
    setPerson({
      ...person,
      name: "rise",
    });
  };
  return (
    <div className="App">
      <h1>{person.name}</h1>
      <button onClick={handleClick}>修改人名</button>
    </div>
  );
}
```

```js [对数组进行代理]{6}
import { useState } from 'react';
const defaultList = [1, 2, 3, 4];
const App = () => {
  const [commentList, setCommentList] = useState(defaultList);
  const handleDelete = id => {
    setCommentList(commentList.filter(item => item.id !== 1));
  };
};
```

:::

## 组件基础样式控制

### 原生方式

::: code-group

```js [app.js]{7-8}
import './style.css';
import { useState } from 'react';
function App() {
  const [type, setType] = useState(false);
  return (
    <div>
      <h1 className={`foo ${type && 'zoo'}`}>标题</h1>
      <button style={{ fontSize: '20px', color: 'red' }}>修改人名</button>
    </div>
  );
}
```

```css [style.css]
.foo {
  color: blue;
}
.zoo {
  font-size: 12px;
}
```

:::

### 使用 classnames 包

使用 classnames 包可以实现更加优雅的样式控制：`npm install classnames`

```js{7-9}
import classNames from "classnames";
<span
  key={tab.type}
  onClick={() => {
    handelTabChange(tab.type);
  }}
  className={classNames("nav-item", {
    active: tabType === tab.type,
  })}
>
  {tab.text}
</span>;
```

## 受控表单绑定

```js{7-13}
import "./style.css";
import { useState } from "react";
function App() {
  const [value, setValue] = useState("");
  return (
    <div>
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        type="text"
      />
    </div>
  );
}
```

## 获取 DOM

```js{4,7-9,12-14}
import { useRef } from "react";
function App() {
  // 1.使用Ref来创建ref对象，绑定到dom标签上
  const inputRef = useRef(null);
  // 2. dom可用时，ref.curren获取dom
  // 渲染完毕之后dom生成之后才可以使用
  const showDom = () => {
    console.log(inputRef.current);
  };
  return (
    <div>
      <input type="text" ref={inputRef} />
      <button onClick={showDom}>获取DOM</button>
    </div>
  );
}
```
