---
order: 5
---

# event 模块

## 订阅事件

```js
// 导入event模块
const EventEmitter = require('events');
// 创建事件对象
const events = new EventEmitter();
// 订阅事件
events.on('play', data => {
  console.log(data);
});
```

## 发布事件

```js
// 发布事件
events.emit('play', { name: 'zangsan' });
```
