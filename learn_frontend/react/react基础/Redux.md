# redux

[[toc]]

## 什么是 redux

Redux 是 React 最常用的集中状态管理工具，类似于 Vue 中的 Pinia（Vuex），可以独立于框架运行。集中式状态管理能方便所有组件共享状态信息

## 如何使用 redux

使用步骤：

1. 定义一个 `reducer` 函数 （根据当前想要做的修改返回一个新的状态）
2. 使用 `createStore` 方法传入 `reducer` 函数 生成一个 `store` 实例对象
3. 使用 `store` 实例的 `subscribe` 方法 订阅数据的变化（数据一旦变化，可以得到通知）
4. 使用 `store` 实例的 `dispatch` 方法提交 action 对象 触发数据变化（告诉 `reducer` 你想怎么改数据）
5. 使用 `store` 实例的 `getState` 方法 获取最新的状态数据更新到视图中

## Redux 管理数据流程梳理

为了职责清晰，数据流向明确，Redux 把整个数据修改的流程分成了三个核心概念，分别是：`state`、`action` 和 `reducer`

1. `state` - 一个对象 存放着我们管理的数据状态
2. `action` - 一个对象 用来描述你想怎么改数据
3. `reducer` - 一个函数 根据 action 的描述生成一个新的 `state`

## react 中使用 redux

### 需要安装的两个工具

在 React 中使用 redux，官方要求安装俩个其他插件 - Redux Toolkit 和 react-redux

1. `Redux Toolkit（RTK）`- 官方推荐编写 Redux 逻辑的方式，是一套工具的集合集，简化书写方式
2. `react-redux` - 用来 链接 Redux 和 React 组件 的中间件

安装他们`npm i @reduxjs/toolkit react-redu`

### store 目录结构设计

1. 通常集中状态管理的部分都会单独创建一个单独的 `store` 目录
2. 应用通常会有很多个子 `store` 模块，所以创建一个 `modules` 目录，在内部编写业务分类的子 `store`
3. `store` 中的入口文件 `index.js` 的作用是组合 `modules` 中所有的子模块，并导出 `store`

### 基本使用

创建如下目录

```bash
src
 ├── App.js
 ├── index.js
 └── store
     ├── index.js
     └── modules
         ├── channelStore.js
         └── counterStore.js
```

1. 使用 React Toolkit 创建 `counterStore`

::: code-group

```js [counterStore.js]
import { createSlice } from '@reduxjs/toolkit';

// 1. 创建状态
const counterStore = createSlice({
  name: 'counter',
  initialState: {
    count: 0,
  },
  // 对会对状态进行什么样的操作的行为的封装
  reducers: {
    increment(state) {
      state.count++;
    },
    decrement(state) {
      state.count--;
    },
  },
});
// 2. 解构出action
const { increment, decrement } = counterStore.actions;
// 3. 获取reducer
const reducer = counterStore.reducer;

// 按需到处actionCreater
export { increment, decrement };
// 默认到处reducer
export default reducer;
```

```js [channelStore.js]
import { createSlice } from '@reduxjs/toolkit';
import axios from 'axios';
// 1. 创建状态
const channelStore = createSlice({
  name: 'channel',
  initialState: {
    channelList: [],
  },
  reducers: {
    setChannels(state, action) {
      state.channelList = action.payload;
    },
  },
});
// 2. 解构出action
const { setChannels } = channelStore.actions;
// 3. 获取reducer
const reducer = channelStore.reducer;

// 异步请求部分
const fetchChannelList = () => {
  return async dispatch => {
    const res = await axios.get('http://geek.itheima.net/v1_0/channels');
    dispatch(setChannels(res.data.data.channels));
  };
};
// 按需到处fetchChannelList
export { fetchChannelList };
// 默认到处reducer
export default reducer;
```

:::

2.  导出 store

```js
// store/index.js
import { configureStore } from '@reduxjs/toolkit';
// 导入子模块reducer
import counterReducer from './modules/counterStore';
import channelReducer from './modules/channelStore';
const store = configureStore({
  reducer: {
    counter: counterReducer,
    channel: channelReducer,
  },
});
export default store;
```

3.  为 React 注入 `store`

`react-redux` 负责把 `Redux` 和 `React` 链接 起来，内置 `Provider` 组件 通过 `store` 参数把创建好的 `store` 实例注入到应用中，链接正式建立

```js
// index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import store from './store';
import { Provider } from 'react-redux';
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Provider store={store}>
    <App />
  </Provider>,
);
```

4.  React 组件使用 `store` 中的数据

在 React 组件中使用 `store` 中的数据，需要用到一个 钩子函数 - `useSelector`，它的作用是把 `store` 中的数据映射到组件中，使用样例如下：

```js
// app.js
const { count } = useSelector(state => state.counter);
```

5. React 组件修改 store 中的数据

```js
// app.js
import { useDispatch, useSelector } from 'react-redux';
import { addToNum, decrement, increment } from './store/modules/counterStore';
import { useEffect } from 'react';
import { fetchChannelList } from './store/modules/channelStore';
function App() {
  const { count } = useSelector(state => state.counter);
  const { channelList } = useSelector(state => state.channel);
  const dispatch = useDispatch();
  // 使用useEffect触发异步请求
  useEffect(() => {
    dispatch(fetchChannelList());
  }, [dispatch]);
  return (
    <div>
      {count}
      <button onClick={() => dispatch(increment())}>+</button>
      <button onClick={() => dispatch(decrement())}>-</button>
      <button onClick={() => dispatch(addToNum(10))}>加到10</button>
      <button onClick={() => dispatch(addToNum(20))}>加到20</button>
      <ul>
        {channelList.map(item => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </div>
  );
}
export default App;
```

## useSelector 获取 redux 中的状态

### 什么是 useSelector

`useSelector` 是 `React-Redux` 提供的一个 Hook，用于从 `Redux store` 中提取和订阅 `state` 数据。它是连接 React 组件与 `Redux store` 的主要方式之一。

### 基础用法

```js
import { useSelector } from 'react-redux';

function MyComponent() {
  const counter = useSelector(state => state.counter);

  return <div>当前计数: {counter}</div>;
}
```

### 核心特性

1. ​ 选择器函数 ​：接收整个 `Redux state` 作为参数，返回你需要的部分
2. ​ 严格相等比较 ​：默认使用 `===` 比较前后结果，避免不必要的重渲染
3. ​ 自动订阅 ​：当 `Redux store` 更新时，会自动重新执行选择器
4. ​ 自动取消订阅 ​：组件卸载时自动清理订阅

### 高级用法

:::code-group

```js [返回对象多个值]
const { user, preferences } = useSelector(state => ({
  user: state.auth.user,
  preferences: state.settings.preferences,
}));
```

```js [使用比较函数控制重渲染]
import { shallowEqual } from 'react-redux';

const userData = useSelector(
  state => ({
    name: state.user.name,
    age: state.user.age,
  }),
  shallowEqual,
); // 浅比较替代严格相等
```

```js [使用 reselect 创建记忆化选择器]
import { createSelector } from 'reselect';

const selectUser = state => state.user;
const selectActiveUsers = createSelector([selectUser], user => user.filter(u => u.isActive));

function UserList() {
  const activeUsers = useSelector(selectActiveUsers);
  // ...
}
```

:::

## redux 调试工具

Google 安装 Redux DevTools

## 简单实现 redux

本质上就是发布订阅模式的运用

1. `state`：状态 （被监听者）
2. `action`：指定状态可以进行什么样的变化
3. `reducer`：具体执行 `action`，引发 `state` 变化（返回新 `state` 的方式）
4. `subscribe`: 实现订阅（添加监听者）
5. `dispatch`: 外界使用这个函数传入 `action` 来改变 `state` 的状态，进而引发监听者行为

不同的 reducer 具有处理不同 action 的能力，下面的代码实现了状态与行为的解耦

```js
function createStore(reducer, preloadedState) {
  let state = preloadedState; // 当前状态 （被观察者）
  let listeners = []; // 观察者列表（订阅者）
  // 获取当前状态
  const getState = () => state;
  // 订阅状态变化
  const subscribe = (listener) => {
    listeners.push(listener);
    // 返回取消订阅的函数
    return () => {
      listeners = listeners.filter((l) => l !== l
    };
  };
  // 派发action（触发状态变更并通知观察者）
  const dispatch = (action) => {
    state = reducer(state, action); // 通过 Reducer 计算新
    listeners.forEach((listener) => listener()); // 通知所
    return action;
  };
  // 初始化状态
  dispatch({ type: "@@redux/INIT" });
  return { getState, dispatch, subscribe };
}
// 计数处理reducer
function counterReducer(state = 0, action) {
  switch (action.type) {
    case "INCREMENT":
      return state + 1;
    case "DECREMENT":
      return state - 1;
    default:
      return state;
  }
}
```

## redux toolkit 简化了什么呢？

主要就是简化了 `action` 的创建，对于同步代码当你定义好 `reducer` 后就自动的创建了 `action`。但是对于异步操作你还是要写好 `action`
实际上你使用 `dispatch` 时需要传入 `action`，但真正引发状态变化的时你定义的 `reducer`
