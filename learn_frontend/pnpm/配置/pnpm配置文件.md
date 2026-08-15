---
order: 249
---

# pnpm 配置文件

[[toc]]
以下仅仅列出常用的配置项,`pnpm` 从命令行、环境变量、`pnpm-workspace.yaml` 和 `.npmrc` 文件获取其配置

## 依赖解析与提升

### 依赖链接方式-​nodeLinker

定义应使用什么链接器来安装 Node 包

- `isolated` - 依赖从 `node_modules/.pnpm` 处的虚拟存储进行符号链接。
- `hoisted` - 创建了一个没有符号链接的扁平 `node_modules`。与 `npm` 或 `Yarn Classic` 创建的 `node_modules` 相同。当使用此设置时，`Yarn` 的库之一用于提升。

### 是否提升依赖-hoist

当 `true` 时，所有依赖都提升到 `node_modules/.pnpm/node_modules`。这使得 `node_modules` 内的所有包都可以访问未列出的依赖。

### 更新配置-updateConfig.ignoreDependencies

有时你无法更新依赖。例如，最新版本的依赖开始使用 `ESM`，但你的项目尚未使用 `ESM`。令人烦恼的是，当运行 `pnpm update --latest` 时，这样的包总是会被 `pnpm outdated` 命令打印出来并更新。但是，你可以在 `ignoreDependencies` 字段中列出你不想升级的软件包：

```yaml
updateConfig:
  ignoreDependencies:
    - load-json-file
```

还支持模式，因此你可以忽略某个范围内的任何包：`@babel/*`。

### 哪些依赖被提升-hoistPattern

告诉 `pnpm` 哪些包应该提升到 `node_modules/.pnpm/node_modules`。默认情况下，所有包都会被吊起 - 但是，如果你知道只有某些有缺陷的包具有幻像依赖，则可以使用此选项专门提升幻像依赖（推荐）。
::: tip 幻想依赖
幻像依赖是指幽灵依赖
:::
例如：

```bash
hoistPattern:
- "*eslint*"
- "*babel*"
```

你还可以使用 `!` 从提升中排除模式。
例如：

```bash
hoistPattern:
- "*types*"
- "!@types/react"
```

## 依赖锁定与安装

### 锁定文件-lockfile

当设置为 `false` 时，`pnpm` 将不会读取或生成 `pnpm-lock.yaml` 文件。

## 工作区

### 允许工作区内的包相互链接-linkWorkspacePackages

如果启用此功能，本地可用的软件包将链接到 `node_modules`，而不是从注册表下载。这在 `monorepo` 中非常方便。如果你还需要将本地包链接到子依赖，则可以使用 `deep` 设置。否则，将从注册表下载并安装软件包。但是，仍然可以使用 `workspace`: 范围协议链接工作区包。

假设你的 `Monorepo` 项目结构如下，其中 `web-app`依赖 `shared-ui`包：

```bash
my-monorepo/
├── packages/
│   ├── shared-ui/     # 一个共享的组件包
│   │   ├── package.json  # 版本是 "1.0.0"
│   │   └── ...
│   └── web-app/       # 主应用
│       ├── package.json  # 依赖项写着 "shared-ui": "^1.0.0"
│       └── ...
├── pnpm-workspace.yaml  # 定义工作区的配置文件
└── ...
```

1. `linkWorkspacePackages: false`：`web-app`会像普通项目一样，从配置的 `npm  registry（如 npmjs.com）`去查找并下载 `shared-ui@^1.0.0`这个包。

::: tip 提示
如果你希望模拟非 `Monorepo` 环境，或者确保依赖的包必须是已经正式发布到线上的版本时使用。在大多数 `Monorepo` 开发中，这很不方便，因为你需要先 `publishshared-ui`，才能更新 `web-app`的依赖。
:::

2. `linkWorkspacePackages: true`：`pnpm` 会识别到工作区内本身就有一个 `shared-ui` 包，并且其版本 "1.0.0"符合 `web-app` 要求的 "^1.0.0"范围。于是，`pnpm` 不会去网上下载，而是在 `web-app/node_modules` 里创建一个符号链接，直接指向本地的 `../packages/shared-ui` 目录。你在 `shared-ui`里改任何代码，在 `web-app`中会立刻生效，无需发布和重新安装

3. `linkWorkspacePackages: deep`：在 `true` 的基础上，功能更进一步。它不仅会链接直接依赖，还会递归检查并链接子依赖 ​（即依赖的依赖）中属于工作区的包。如果 `web-app`依赖 `A`，而 `A`又依赖你工作区里的 `B`。当设置为 `deep`时，不仅 `A`会被链接（如果是工作区包），`A` 内部的 `B` 也会被链接到本地版本。

### 优先使用工作区内的包-preferWorkspacePackages

如果启用此功能，则工作区中的本地包优先于注册表中的包，即使注册表中存在较新版本的包也是如此。
仅当工作区不使用 `saveWorkspaceProtocol` 时，此设置才有用。

### 使用 `workspace:*`协议

即使 `link-workspace-packages`设置为 `false`，你仍然可以通过在 `package.json`中显式使用 `workspace:`协议来链接特定的包。
例如，在 `web-app/package.json`中：

```json
{
  "dependencies": {
    "shared-ui": "workspace:*"
  }
}
```

## 网络与注册表

### 设置包注册表的镜像源-registry

`npm` 包注册表的基本 `URL`（包括尾部斜杠）。
应用于指定范围的包的 `npm` 注册表。例如，设置 `@babel:registry=https://example.com/packages/npm/` 将强制当你使用 `pnpm add @babel/core` 或任何 `@babel` 范围的包时，将从 `https://example.com/packages/npm` 而不是默认注册表获取该包。

### 私有仓库的认证令牌-auth-token

定义访问指定注册表时要使用的身份验证承载令牌。例如：

```bash
//registry.npmjs.org/:_authToken=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

你还可以使用环境变量。例如：

```bash
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

或者你可以直接使用环境变量，根本不更改 `.npmrc`：

```bash
npm_config_//registry.npmjs.org/:_authToken=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```
