# vue3 开发环境搭建

[[toc]]

## 搭建 monorepo 环境

### 什么是 Monorepo

`Monorepo` 是管理项目代码的一个方式，指在一个项目仓库(repo)中管理多个模块/包(package)。vue3 源码采用 `monorepo` 方式进行管理，将模块拆分到 package 目录中。

- 一个仓库可维护多个模块，不用到处找仓库
- 方便版本管理和依赖管理，模块之间的引用，调用都非常方便

### 全局安装 pnpm

Vue3 中使用`pnpm workspace`来实现`monorepo`（pnpm 是快速、节省磁盘空间的包管理器。主要采用符号链接的方式管理模块），所以我们需要先安装全局 pnpm

```bash
# 全局安装pnpm
npm install -g pnpm
# 初始化配置文件
pnpm init -y
```

### 创建.npmrc 文件

pnpm 为了防止幽灵依赖所以安装的依赖默认不会提升到 node_modules 下，需要在`.npmrc` 文件中添加`shamefully-hoist=true`配置。

> 这里您可以尝试一下安装`Vue3,pnpm install vue@next`此时默认情况下 vue3 中依赖的模块不会被提升到 node_modules 下。添加羞耻的提升可以将 Vue3,所依赖的模块提升到 node_modules 中

### 添加模块并配置 workspace

在 packages 中添加 reactivity 和 shared 模块，来模拟 vue3 源码的两个模块，并添加工作区配置文件`pnpm-workspace.yaml`

```bash
Vue3
 ├── package.json
 ├── packages
 │   ├── reactivity
 │   │   ├── package.json
 │   │   └── src
 │   │       └── index.ts
 │   └── shared
 │       ├── package.json
 │       └── src
 │           └── index.ts
 ├── pnpm-lock.yaml
 └── pnpm-workspace.yaml
```

`pnpm-workspace.yaml`中需要指定模块所在的目录

```bash
packages:
  - 'packages/*' # 包所在目录

```

::: warning 为模块添加构建信息
我们需要为模块的 package.json 文件中添加`buildOptions`字段，用于指定模块的构建信息，如`name`、`format`等。
比如在 reactivity 模块的`package.json`中添加下面的信息，后续构建配置的时候会读取`package.json`中的构建信息来进行打包

```json
"buildOptions": {
  "name": "VueReactivity",
  "formats": [
    "global",
    "cjs",
    "esm-bundler"
  ]
},
```

:::

## 配置构建环境

### 安装依赖

安装所需依赖：`pnpm install typescript esbuild minimist -w`

- `typescript`：TypeScript 编译器
- `esbuild`：打包工具
- `minimist`：命令行参数解析库

### 初始化 ts 配置

```json
{
  "compilerOptions": {
    "outDir": "dist", // 输出的目录
    "sourceMap": true, // 采用sourcemap
    "target": "es2016", // 目标语法
    "module": "esnext", // 模块格式
    "moduleResolution": "node", // 模块解析方式
    "strict": false, // 严格模式
    "resolveJsonModule": true, // 解析json模块
    "esModuleInterop": true, // 允许通过es6语法引入commonjs模块
    "jsx": "preserve", // jsx不转义
    "lib": ["esnext", "dom"], // 支持的类库 esnext及dom
    "baseUrl": ".",
    "paths": {
      "@vue/*": ["packages/*/src"]
    }
  }
}
```

### 配置 esbuild

配置 esbuild 的目的在于在开发环境下进行打包,我们需要编写脚本`scripts/dev.js`

```js
const { resolve } = require('path');
const { build } = require('esbuild');
const args = require('minimist')(process.argv.slice(2));

const target = args._[0] || 'reactivity';
const format = args.f || 'global';
const pkg = require(resolve(__dirname, `../packages/${target}/package.json`));

const outputFormat = format.startsWith('global') ? 'iife' : format === 'cjs' ? 'cjs' : 'esm';
const outfile = resolve(__dirname, `../packages/${target}/dist/${target}.${format}.js`);

(async () => {
  // 创建构建上下文
  const ctx = await build({
    entryPoints: [resolve(__dirname, `../packages/${target}/src/index.ts`)],
    outfile,
    bundle: true,
    sourcemap: true,
    format: outputFormat,
    globalName: pkg.buildOptions?.name,
    platform: format === 'cjs' ? 'node' : 'browser',
    logLevel: 'info',
  });

  const watcher = await ctx.watch();

  console.log('watching~~~');

  // 可选：监听错误事件
  watcher.on('change', () => {
    console.log('rebuild~~~');
  });
})();
```

然后在 package.json 中添加脚本执行命令

```json
"scripts": {
    "dev": "node scripts/dev.js reactivity"
},
```
