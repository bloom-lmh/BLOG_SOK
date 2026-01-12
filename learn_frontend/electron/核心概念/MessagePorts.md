# MessagePorts

## 何为通道消息

`MessagePort` 通道消息是是一种“通信协议”。它允许允许你在两个进程建立一个私有的、双向的、点对点的通信通道。一旦通道建立，数据就可以直接在两端流动，无需主进程再做中间人转发

::: tip 与使用 `preload` 来进行通信的区别

| 特性     | 传统 IPC (`ipcRenderer.invoke/send`) | MessagePort (消息端口)           |
| :------- | :----------------------------------- | :------------------------------- |
| 通信模式 | 请求-响应 或 广播                    | 点对点 (Peer-to-Peer)            |
| 通信路径 | 必须经过主进程中转                   | 建立连接后，两端直接通信         |
| 性能开销 | 每次消息都要经过主进程，开销大       | 建立后轻量级，适合高频数据流     |
| 典型场景 | 点击按钮保存文件、读取配置           | 视频流传输、聊天室、高频数据推送 |

:::

## 基本使用

`MessagePort` 总是成对出现的，就像电话的两头，总体步骤如下：

1. 创建通道：你会得到 `port1` 和 `port2`。
2. 分发端口：把 `port1` 留给自己，把 `port2` 通过传统的 IPC 方式发送给另一端（利用 `postMessage` 的 `transfer` 参数）。
3. 建立连接：另一端收到 `port2` 后，调用 `start()` 方法（在 Electron 主进程中通常需要手动调用）。
4. 直接对话：现在，你在 `port1` 上发消息，`port2` 会收到；`port2` 回复，`port1` 也能收到。全程不经过主路由！

> 注意：下面的代码对 preload.js 做了简写

### 渲染进程和主进程通信

::: code-group

```js [渲染进程]
// 创建通道，
const channel = new MessageChannel();

// 一个通道有两个端口
const port1 = channel.port1;
const port2 = channel.port2;

// port2向port1发送消息会将排队等待，直到一个监听器注册为止。
port2.postMessage({ answer: 42 });

// 将 port1 对象通过传统ipc来发给主进程。 类似的，我们也可以发送、
// MessagePorts 到其他 frames, 或发送到 Web Workers, 等.
ipcRenderer.postMessage('port', null, [port1]);
```

```js [主进程]
// 在主进程中，我们接收端口对象。
ipcMain.on('port', (event) => {
  // 当我们在主进程中接收到 MessagePort 对象, 它就成为了 MessagePortMain.
  const port = event.ports[0];

  // MessagePortMain 使用了 Node.js 风格的事件 API, 而不是
  // web 风格的事件 API. 因此使用 .on('message', ...) 而不是 .onmessage = ...
  port.on('message', (event) => {
    // 收到的数据是： { answer: 42 }
    const data = event.data;
  });

  // MessagePortMain 阻塞消息直到 .start() 方法被调用
  port.start();
});
```

:::

### 在两个渲染进程之间建立 MessageChannel

在这个示例中，主进程设置了一个 MessageChannel，然后将每个端口发送给不同的渲染进程。 这样可以让渲染进程彼此之间发送消息，而无需使用主进程作为中转。

::: code-group

```js [主进程]
const { BrowserWindow, app, MessageChannelMain } = require('electron');

app.whenReady().then(async () => {
  // 创建窗口
  const mainWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      preload: 'preloadMain.js',
    },
  });

  const secondaryWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      preload: 'preloadSecondary.js',
    },
  });

  // 建立通道
  const { port1, port2 } = new MessageChannelMain();

  // webContents准备就绪后，使用postMessage向每个webContents发送一个端口。
  mainWindow.once('ready-to-show', () => {
    mainWindow.webContents.postMessage('port', null, [port1]);
  });

  secondaryWindow.once('ready-to-show', () => {
    secondaryWindow.webContents.postMessage('port', null, [port2]);
  });
});
```

```js [预加载脚本]
const { ipcRenderer } = require('electron');

ipcRenderer.on('port', (e) => {
  // 接收到端口，使其全局可用。
  window.electronMessagePort = e.ports[0];

  window.electronMessagePort.onmessage = (messageEvent) => {
    // 处理消息
  };
});
```

```js [渲染器进程]
// elsewhere in your code to send a message to the other renderers message handler
window.electronMessagePort.postMessage('ping');
```

:::

### Worker 进程

在这个示例中，你的应用程序有一个作为隐藏窗口存在的 Worker 进程。 你希望应用程序页面能够直接与 Worker 进程通信，而不需要通过主进程进行中继，以避免性能开销。

::: code-group

```js [主进程]
const { BrowserWindow, app, ipcMain, MessageChannelMain } = require('electron');

app.whenReady().then(async () => {
  // Worker 进程是一个隐藏的 BrowserWindow
  // 它具有访问完整的Blink上下文（包括例如 canvas、音频、fetch()等）的权限
  const worker = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true },
  });
  await worker.loadFile('worker.html');

  // main window 将发送内容给 worker process 同时通过 MessagePort 接收返回值
  const mainWindow = new BrowserWindow({
    webPreferences: { nodeIntegration: true },
  });
  mainWindow.loadFile('app.html');

  // 在这里我们不能使用 ipcMain.handle() , 因为回复需要传输
  // MessagePort.
  // 监听从顶级 frame 发来的消息
  mainWindow.webContents.mainFrame.ipc.on('request-worker-channel', (event) => {
    // 建立新通道  ...
    const { port1, port2 } = new MessageChannelMain();
    // ... 将其中一个端口发送给 Worker ...
    worker.webContents.postMessage('new-client', null, [port1]);
    // ... 将另一个端口发送给主窗口
    event.senderFrame.postMessage('provide-worker-channel', null, [port2]);
    // 现在主窗口和工作进程可以直接相互通信，无需经过主进程！
  });
});
```

```html [worker.html]
<script>
  const { ipcRenderer } = require('electron');

  const doWork = (input) => {
    // 一些对CPU要求较高的任务
    return input * 2;
  };

  // 我们可能会得到多个 clients, 比如有多个 windows,
  // 或者假如 main window 重新加载了.
  ipcRenderer.on('new-client', (event) => {
    const [port] = event.ports;
    port.onmessage = (event) => {
      // 事件数据可以是任何可序列化的对象 (事件甚至可以
      // 携带其他 MessagePorts 对象!)
      const result = doWork(event.data);
      port.postMessage(result);
    };
  });
</script>
```

```html [app.html]
<script>
  const { ipcRenderer } = require('electron');

  // 我们请求主进程向我们发送一个通道
  // 以便我们可以用它与 Worker 进程建立通信
  ipcRenderer.send('request-worker-channel');

  ipcRenderer.once('provide-worker-channel', (event) => {
    // 一旦收到回复, 我们可以这样做...
    const [port] = event.ports;
    // ... 注册一个接收结果处理器 ...
    port.onmessage = (event) => {
      console.log('received result:', event.data);
    };
    // ... 并开始发送消息给 work!
    port.postMessage(21);
  });
</script>
```

:::

### 回复流

Electron 的内置 IPC 方法只支持两种模式：即发即弃(例如， send)，或请求-响应(例如， invoke)。 使用 MessageChannels，你可以实现一个“响应流”，其中单个请求可以返回一串数据。

::: code-group

```js [渲染进程]
const makeStreamingRequest = (element, callback) => {
  // MessageChannels 是轻量的
  // 为每个请求创建一个新的 MessageChannel 带来的开销并不大
  const { port1, port2 } = new MessageChannel();

  // 我们将端口的一端发送给主进程 ...
  ipcRenderer.postMessage('give-me-a-stream', { element, count: 10 }, [port2]);

  // ... 保留另一端。 主进程将向其端口发送消息
  // 并在完成后关闭它
  port1.onmessage = (event) => {
    callback(event.data);
  };
  port1.onclose = () => {
    console.log('stream ended');
  };
};

makeStreamingRequest(42, (data) => {
  console.log('got response data:', data);
});
// 我们会看到 "got response data: 42" 出现了10次
```

```js [主进程]
ipcMain.on('give-me-a-stream', (event, msg) => {
  // 渲染进程向我们发送了一个 MessagePort
  // 并期望得到响应
  const [replyPort] = event.ports;

  // 在这里，我们同步发送消息
  // 我们也可以将端口存储在某个地方，异步发送消息
  for (let i = 0; i < msg.count; i++) {
    replyPort.postMessage(msg.element);
  }

  // 当我们处理完成后，关闭端口以通知另一端
  // 我们不会再发送任何消息 这并不是严格要求的
  // 如果我们没有显式地关闭端口，它最终会被垃圾回收
  // 这也会触发渲染进程中的'close'事件
  replyPort.close();
});
```

:::

### 主进程和主页面之间进行通信

::: code-group

```js [main.js]
const { BrowserWindow, app, MessageChannelMain } = require('electron');

const path = require('node:path');

app.whenReady().then(async () => {
  // Create a BrowserWindow with contextIsolation enabled.
  const bw = new BrowserWindow({
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  bw.loadURL('index.html');

  // We'll be sending one end of this channel to the main world of the
  // context-isolated page.
  const { port1, port2 } = new MessageChannelMain();

  // 允许在另一端还没有注册监听器的情况下就通过通道向其发送消息 消息将排队等待，直到有一个监听器注册为止。
  port2.postMessage({ test: 21 });

  // 我们也可以接收来自渲染器主进程的消息。
  port2.on('message', (event) => {
    console.log('from renderer main world:', event.data);
  });
  port2.start();
  // 预加载脚本将接收此 IPC 消息并将端口
  // 传输到主进程。
  bw.webContents.postMessage('main-world-port', null, [port1]);
});
```

```js [preload.js]
const { ipcRenderer } = require('electron');

// 在发送端口之前，我们需要等待主窗口准备好接收消息 我们在预加载时创建此 promise ，以此保证
// 在触发 load 事件之前注册 onload 侦听器。
const windowLoaded = new Promise((resolve) => {
  window.onload = resolve;
});

ipcRenderer.on('main-world-port', async (event) => {
  await windowLoaded;
  // 我们使用 window.postMessage 将端口
  // 发送到主进程
  window.postMessage('main-world-port', '*', event.ports);
});
```

```html [index.html]
<script>
  window.onmessage = (event) => {
    // event.source === window 意味着消息来自预加载脚本
    // 而不是来自iframe或其他来源
    if (event.source === window && event.data === 'main-world-port') {
      const [port] = event.ports;
      // 一旦我们有了这个端口，我们就可以直接与主进程通信
      port.onmessage = (event) => {
        console.log('from main process:', event.data);
        port.postMessage(event.data.test * 2);
      };
    }
  };
</script>
```

:::
