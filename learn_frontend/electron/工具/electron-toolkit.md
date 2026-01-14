# electron-toolkit

## 简介

`@electron-toolkit` 是由社区维护的一套现代 Electron 开发工具包，旨在简化 Electron 应用的开发流程，提升安全性、类型安全性和开发效率。它由多个子模块组成，覆盖了从代码规范、IPC 通信、预加载脚本到 TypeScript 配置等各个方面。

## 核心理念

1. 安全第一：默认启用 `contextIsolation: true`，避免直接暴露 `require`。
2. 类型安全：支持 TypeScript，提供完整的类型定义。
3. 开箱即用：减少样板代码（如 IPC 注册、窗口创建）。
4. 与 Vite 深度集成：常用于 `create-electron-vite` 生成的项目中。

## 子模块

### 安全的暴露 Electron API

`@electron-toolkit/preload`主要用于在 `preload.js` 中安全地将 `Electron API`（如 `ipcRenderer`, `shell`）暴露给渲染进程，避免直接访问 `window.require`。

```js
// preload.ts
import { contextBridge } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// 将 Electron API 安全暴露给渲染进程
contextBridge.exposeInMainWorld('electron', electronAPI);
```

::: tip 提示

一般来说直接将`electronAPI`暴露给渲染器进程是十分危险的。但是使用`@electron-toolkit/preload`则可以这样进行暴露，因为自动处理 `contextIsolation: true` 下的安全问题。

:::

### 主进程实用工具-utils

`@electron-toolkit/utils` 提供了一些实用工具，如：

1. 窗口创建 (`createWindow`)
2. IPC 处理 (`handleIpc`)
3. 事件监听封装

```js
// main.ts
import { createWindow } from '@electron-toolkit/utils';
import { app, BrowserWindow } from 'electron';

const mainWindow = createWindow('main', {
  width: 1000,
  height: 700,
  show: false,
  webPreferences: {
    preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, // 或你的 preload 路径
  },
});

// 等页面加载完成再显示
mainWindow.on('ready-to-show', () => {
  mainWindow.show();
});

// 安全处理新窗口打开
mainWindow.webContents.setWindowOpenHandler((details) => {
  shell.openExternal(details.url);
  return { action: 'deny' };
});
```

它的特点如下：

- 自动处理 `ready-to-show` 事件
- 支持 `devTools` 自动开启（开发环境）
- 提供 `handleIpc` 简化 IPC 注册

### TypeScript 配置模板-tscconfig

`@electron-toolkit/tscconfig` 提供了 TypeScript 配置模板，可以快速配置 TypeScript 开发环境。这样可直接继承，无需手动配置 `types`, `moduleResolution`等复杂项。

```json
// tsconfig.json
{
  "extends": "@electron-toolkit/tsconfig",
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["dom", "dom.iterable", "dom.asynciterable", "scripthost", "dom.exception"]
  },
  "include": ["src/**/*"]
}
```

### 代码规范-eslint

为 Electron 项目提供统一的 ESLint 配置，支持：

- JavaScript / TypeScript
- Prettier 格式化
- Vue / React

```json
// .eslintrc.json
{
  "extends": ["@electron-toolkit/eslint-config"],
  "parserOptions": {
    "ecmaVersion": 2020
  }
}
```

### TypeScript 专用 ESLint

专为 TypeScript 项目设计的 ESLint 配置，包含：

- `@typescript-eslint/parser`
- 类型检查规则
- JSX 支持

```json
// .eslintrc.json
{
  "extends": ["@electron-toolkit/eslint-config-ts"]
}
```

### Prettier 集成-prettier

`@electron-toolkit/eslint-config-prettier`主要是结合 ESLint 和 Prettier，实现代码格式化与 linting 一体化。

```json
// .eslintrc.json
{
  "extends": ["@electron-toolkit/eslint-config-prettier"]
}
```

### 类型安全的 IPC 通信-ipc-typed

通过 TypeScript 接口定义 IPC 通道，实现类型安全的主渲染进程通信。

::: code-group

```ts [定义接口]
// types/ipc.d.ts
export interface IpcRequest {
  type: 'ping' | 'get-config';
  data?: any;
}

export interface IpcResponse {
  success: boolean;
  data?: any;
  error?: string;
}
```

```ts [主进程注册]
// main.ts
import { handleTypedIpc } from '@electron-toolkit/typed-ipc';

handleTypedIpc('ping', () => 'pong');
handleTypedIpc('get-config', () => ({ theme: 'dark' }));
```

```ts [渲染进程调用]
// renderer.ts
import { ipcRenderer } from '@electron-toolkit/preload';

// 类型安全调用
const res = (await ipcRenderer.invoke('get-config')) as { theme: string };
console.log(res.theme);
```

:::
