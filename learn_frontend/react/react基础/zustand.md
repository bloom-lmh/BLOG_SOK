---
order: 316
---

# zustand

[[toc]]

## 什么是 zustand

![zustand](https://s3.bmp.ovh/imgs/2025/04/28/9187c9563ce8216b.png)

## 基本使用

```js {2-12,15,18}
import { create } from 'zustand';
// 1. 创建store
// 1.1 函数参数必须返回一个对象 对象内部编写状态数据和方法
// 1.2 set是用来修改数据的专门方法必须调用它来修改数据
// 1.2.1 语法1：参数是函数，需要用到老数据的场景
// 1.2.2 语法2：参数是一个对象 set({count:100})
const useStore = create(set => {
  return {
    count: 0,
    inc: () => set(state => ({ count: state.count + 1 })),
  };
});
// 2.
function App() {
  const { count, inc } = useStore();
  return (
    <div>
      <button onClick={inc}>{count}</button>
    </div>
  );
}
export default App;
```

## zustand-异步支持

对于异步的支持不需要特殊的操作，直接在函数中编写异步逻辑，最后只需要调用 set 方法传入新状态即可

```js {4-16}
import { create } from 'zustand';
import { useEffect } from 'react';
const URL = 'http://geek.itheima.net/v1_0/channels';
const useStore = create(set => {
  return {
    channelList: [],
    fetchChannelList: async () => {
      const res = await fetch(URL);
      const jsonRes = await res.json();

      set({
        channelList: jsonRes.data.channels,
      });
    },
  };
});
function App() {
  const { channelList, fetchChannelList } = useStore();
  useEffect(() => {
    fetchChannelList();
  }, [fetchChannelList]);
  return (
    <div>
      <ul>
        {channelList.map(channel => (
          <li key={channel.id}>{channel.name}</li>
        ))}
      </ul>
    </div>
  );
}
export default App;
```

## zustand-切片模式

当单个 store 比较大的时候，可以采用 切片模式 进行模块拆分组合，类似于模块化
![zustand-切片模式](https://s3.bmp.ovh/imgs/2025/04/28/8901c04b13a13ce0.png)

```js {7,17,23-26}
import { create } from 'zustand';
import { useEffect } from 'react';

const URL = 'http://geek.itheima.net/v1_0/channels';

// Channel Store
const createChannelStore = set => ({
  channelList: [],
  fetchChannelList: async () => {
    const res = await fetch(URL);
    const jsonRes = await res.json();
    set({ channelList: jsonRes.data.channels });
  },
});

// Counter Store
const createCountStore = set => ({
  count: 0,
  inc: () => set(state => ({ count: state.count + 1 })),
});

// 合并 Store
const useStore = create((...a) => ({
  ...createChannelStore(...a),
  ...createCountStore(...a),
}));

function App() {
  const { channelList, fetchChannelList, count, inc } = useStore();

  useEffect(() => {
    fetchChannelList();
  }, [fetchChannelList]);

  return (
    <div>
      <button onClick={inc}>{count}</button>
      <ul>
        {channelList.map(channel => (
          <li key={channel.id}>{channel.name}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;
```
