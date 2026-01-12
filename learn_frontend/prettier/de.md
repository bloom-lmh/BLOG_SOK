# prettier 使用

## 简介

`Prettier` 是一款代码格式化工具，它会移除所有原始样式，并确保所有输出的代码都符合一致的风格。也就是在团队开发中保持代码风格的一致性。

## 命令行使用方式

prettier 的使用就三步：

1. 下载 prettier 到项目：`npm install --save-dev --save-exact prettier`
2. 配置 prettier：在项目根目录下创建 `.prettierrc`和 `.prettierignore` 文件，并配置相关选项。
3. 使用 prettier：运行 `npx prettier --write "src/**/*.{js,jsx,ts,tsx,json,md,css,scss,less}"`，prettier 会自动格式化所有匹配的文件。

::: tip 如果没有`.prettierignore` 文件
如果 Prettier 与运行它的目录位于同一位置且存在 `.gitignore` 文件，则 Prettier 将遵循该 `.gitignore` 中指定的规则。甚至您还可以基于 `.eslintignore`（如果您有的话）来设置您的 `.prettierignore`。
:::

::: warning 注意 npx 命令
npx 随附 npm 并允许您运行本地安装的工具。如果您忘记先安装 Prettier，npx 将临时下载最新版本然后执行。在使用 Prettier 时，这可不是个好主意，因为我们在每次发布时都会更改代码的格式化方式！因此，在您的 `package.json` 中锁定 Prettier 的特定版本非常重要。而且它还更快。
:::

同时还要注意`--write`会格式化并覆盖原文件，如果不想覆盖，仅仅展示哪些文件需要格式化，可以使用`--check`参数(这通常才 CI 流程中进行使用)

## 与编辑器配合使用

通过命令行来进行格式化是一种使用方式。但是它在开发完成后再进行格式化显然就无法享受良好的开发体验了，推荐在编写代码的过程中就进行格式化，这需要编译器的支持。这里以 vscode 为例。在 vscode 中使用 prettier 进行代码格式化，步骤如下：

1. 安装 prettier 插件：在 vscode 插件市场搜索 prettier 并安装。
2. 配置 vscode 格式化选项：在 vscode 的设置中搜索 `format on save` 并开启。
3. 保存文件时自动格式化：保存文件时，prettier 插件会有限读取你当前文件所在项目的 `.prettierrc` 文件，并自动格式化代码。如果没有 `.prettierrc` 文件，则会使用 vscode 中的全局配置和默认配置。

这样你就能做到在代码文件保存的时候进行格式化了

::: tip 编辑器不支持如何使用呢？
如果您的编辑器不支持 Prettier，您可以改用文件监视器运行 Prettier.比如：

```bash
npx onchange "**/*" -- npx prettier --write --ignore-unknown {{changed}}
```

:::

## 和 ESLint 集成

如果您使用 ESLint，请安装 `eslint-config-prettier` 以使 ESLint 和 Prettier 相互兼容。它会关闭所有不必要的或可能与 Prettier 冲突的 ESLint 规则。Stylelint 也有类似的配置：`stylelint-config-prettier`

## 和 Git 钩子配合使用

除了通过命令行运行 `Prettier()`、在 CI 中检查格式以及从编辑器中运行 Prettier 之外，许多人还喜欢将 Prettier 用作提交前的钩子。这样可以确保所有提交都已格式化，而无需等待 CI 构建完成。例如，您可以在每次提交前运行 Prettier，同时注意提交前的钩子有很多但是这里介绍一下最常用的两个：

1. 安装 husky 和 lint-staged:

```bash
npm install --save-dev husky lint-staged
npx husky init
node --eval "fs.writeFileSync('.husky/pre-commit','npx lint-staged\n')"
```

2. 将以下内容添加到您的 package.json:

```json
{
  "lint-staged": {
    "**/*": "prettier --write --ignore-unknown"
  }
}
```
