# `package.json`详解

## 什么是 `package.json`？

`package.json` 是 Node.js 项目的核心配置文件，它是一个 **合法的 JSON 文件**（不是 JavaScript 对象字面量！），用于描述项目的元信息、依赖关系、脚本命令等。

> 如果你打算将包发布到 npm，那么 `name` 和 `version` 字段是 **必须的**；否则可选。

## 关键字段详解

### `name`（包名）

- 必须 ≤ 214 个字符（含作用域，如 `@myorg/mypkg`）。
- 不能以 `.` 或 `_` 开头。
- 不能包含大写字母（新包）。
- 必须是 URL 安全字符（因为会出现在 URL、命令行参数、文件夹名中）。
- 支持作用域包：`@myorg/mypackage`

::: tip 建议

- 不要与 Node.js 核心模块重名（如 `fs`, `http`）。
- 不要加 `js` 或 `node` 后缀（默认就是 JS）。
- 名称应简短且具描述性。
- 可通过 [npmjs.com](https://www.npmjs.com) 检查是否已被占用。
  :::

### `version`（版本号）

必须符合 [semver](https://semver.org/lang/zh-CN/) 规范（由 `node-semver` 解析）。每次发布变更都应更新版本号。
示例：`"1.2.3"`、`"0.1.0-beta.1"`

::: tip 提示

- `alpha`：内部测试版。通常是功能不完整、存在大量 `Bug` 的最初测试版本。示例：`1.0.0-alpha.1`, `1.0.0-alpha.2`
- `beta`：公开测试版。功能基本完整，但可能仍存在一些 `Bug`，提供给外部用户进行测试。比 `alpha`版本稳定。示例：`1.0.0-beta.1`, `1.0.0-beta.2`（您例子中的 `0.1.0-beta.1`也是）
- `rc`(Release Candidate)：发布候选版。这是最终的测试版本，如果没有发现重大问题，就会成为正式的稳定版。示例：`1.0.0-rc.1`, `1.0.0-rc.2`

:::

### `description`（描述）

字符串，用于在 `npm` 搜索中展示，帮助他人了解你的包。

### `keywords`（关键词）

字符串数组，提升在 npm 搜索中的可见性。示例：`["logger", "debug", "tool"]`

### `homepage`（主页）

项目官网或文档地址。示例：`"https://github.com/owner/project#readme"`

### `bugs`（问题反馈）

- 可以是对象或字符串：
  ```json
  {
    "url": "https://github.com/owner/project/issues",
    "email": "project@example.com"
  }
  ```
- 若只有 URL，也可简写为字符串：`"bugs": "https://github.com/.../issues"`

### `license`（许可证）

说明他人如何使用你的代码。使用 [SPDX 许可证标识符](https://spdx.org/licenses/)：

- 单一许可证：`"MIT"`、`"ISC"`、`"BSD-3-Clause"`
- 多许可证：`"(MIT OR Apache-2.0)"`
- 自定义许可证：`"SEE LICENSE IN LICENSE.txt"`（需在根目录提供该文件）
- 私有/不授权：`"UNLICENSED"`（注意不是 `UNLICENSE`）

> ⚠️ 旧格式（如 `{ "type": "MIT", "url": "..." }`）已废弃！

### `author` / `contributors`（作者与贡献者）

- `author`：单个人（对象或字符串）
- `contributors`：多人数组

格式示例：

```json
"author": "Barney Rubble <b@rubble.com> (http://barnyrubble.tumblr.com/)"
```

或

```json
"author": {
  "name": "Barney Rubble",
  "email": "b@rubble.com",
  "url": "http://barnyrubble.tumblr.com/"
}
```

---

### `files`（发布时包含的文件）

数组，指定哪些文件会被打包进 npm 包。类似 `.gitignore`，但逻辑相反：**列出要包含的文件**。默认为 `["*"]`（包含所有）。

**始终包含**（即使没列在 `files` 中）：

- `package.json`
- `README`（任意大小写/扩展名）
- `CHANGELOG` / `HISTORY`
- `LICENSE` / `LICENCE`
- `NOTICE`

**始终忽略**：

- `.git`, `.svn`, `.DS_Store`, `node_modules`, `package-lock.json`, `npm-debug.log` 等

> 可用 `.npmignore` 排除文件（优先级低于 `files`）

### `main`（主入口文件）

指定 `require("your-package")` 时加载的模块。相对于包根目录的路径。示例：`"main": "lib/index.js"`

### `browser`（浏览器入口）

当包用于浏览器环境时，替代 `main`。因为可能依赖 `window` 等 `Node.js` 不支持的全局变量。

### `bin`（命令行工具）

将脚本注册为全局或本地命令。
示例：

```json
"bin": {
  "mycli": "./bin/cli.js"
}
```

安装后可在终端运行 `mycli`。

**注意**：脚本首行必须有 shebang：`#!/usr/bin/env node`

### `directories`（目录结构提示）

元信息，目前无强制作用，但有助于工具识别结构：

- `lib`: 主代码目录
- `bin`: 可执行脚本目录（会自动注册到 `bin`）
- `man`: 手册页目录
- `doc`: 文档（Markdown）
- `example`: 示例代码
- `test`: 测试文件

> ⚠️ 若同时设了 `bin` 和 `directories.bin`，会报错！

---

### `repository`（代码仓库）

告知用户代码位置，便于贡献。支持 Git、SVN 等：

```json
"repository": {
  "type": "git",
  "url": "https://github.com/npm/cli.git"
}
```

支持简写：

- `"repository": "github:user/repo"`
- `"repository": "gitlab:user/repo"`

若 `package.json` 不在根目录（如 monorepo），可指定子目录：

```json
"repository": {
  "type": "git",
  "url": "https://github.com/facebook/react.git",
  "directory": "packages/react-dom"
}
```

---

### `scripts`（生命周期脚本）

定义在不同阶段运行的命令（如 `npm start`, `npm test`）。
常见脚本：`start`, `test`, `build`, `prepare`, `prepublishOnly` 等。

示例：

```json
"scripts": {
  "start": "node server.js",
  "test": "jest"
}
```

### `config`（脚本配置）

为脚本提供默认配置，可通过 `npm_package_config_<key>` 访问。用户可覆盖：`npm config set mypkg:port 3000`

示例：

```json
"config": { "port": "8080" }
```

### `dependencies`（生产依赖）

项目运行所必需的依赖。

版本范围支持多种语法：

- `"express": "^4.18.0"`（兼容 4.x）
- `"lodash": "~4.17.0"`（约等于，允许 patch 更新）
- `"react": "file:../local-react"`（本地路径）
- `"mylib": "git+https://github.com/user/repo.git#v1.0.0"`
- `"module": "user/repo"`（GitHub 简写）

> ❌ 不要把测试工具、编译器放这里！应放在 `devDependencies`

### `devDependencies`（开发依赖）

仅开发时需要（如测试框架、`Babel`、`TypeScript`）。发布后用户安装不会包含这些。

配合 `prepare` 脚本可实现“预编译”：

```json
"devDependencies": { "coffee-script": "~1.6.3" },
"scripts": { "prepare": "coffee -o lib/ -c src/" }
```

### `peerDependencies`（对等依赖）

用于插件场景：**声明你的包需要宿主环境提供某个依赖**。例如：`React` 插件需指定 `"peerDependencies": { "react": "^18.0.0" }`，`npm ≥3` 不会自动安装 `peerDependencies`，仅警告。

### `bundledDependencies`（打包依赖）

发布时将某些依赖 **一起打包进 tarball**。适用于离线分发或私有部署。
示例：

```json
"bundledDependencies": ["renderized", "super-streams"]
```

### `optionalDependencies`（可选依赖）

安装失败也不会中断整个过程。程序需自行处理缺失情况（`try/catch`）。
示例：某些 `native addon` 在某些平台无法编译。

### `engines`（引擎要求）

指定 `Node.js` 或 `npm` 的兼容版本：

```json
"engines": {
  "node": ">=14.0.0",
  "npm": ">=6.0.0"
}
```

- 默认是建议性的（除非用户开启 `--engine-strict`）。

> ⚠️ `engineStrict` 字段已在 npm 3+ 废弃！

### `os` / `cpu`（系统/架构限制）

白名单或黑名单操作系统/CPU 架构：

```json
"os": ["darwin", "linux"],
"cpu": ["x64", "!arm"]
```

### `private`（防止误发布）

设为 `true` 后，`npm publish` 会失败。 适用于私有项目。

---

### `publishConfig`（发布配置）

覆盖发布时的 npm 配置：

```json
"publishConfig": {
  "registry": "https://registry.internal.com/",
  "access": "restricted"  // 作用域包设为私有
}
```
