---
order: 204
---

# tsconfig 配置讲解

[[toc]]

## 概述

### tsconfig.json 的作用

- `tsconfig.json` 文件所在目录就是 ts 项目所在目录
- `tsconfig.json` 指定了 tsc 编译器编译时的行为

### 加载 tsconfig.json 文件

一个项目可以通过以下方式之一来加载`tsconfig.json` 文件进行编译：

- 不带任何输入文件的情况下调用 tsc，编译器会从当前目录开始去查找 `tsconfig.json` 文件，逐级向上搜索父目录。
- 不带任何输入文件的情况下调用 tsc，且使用命令行参数`--project`（或-p）指定一个包含 `tsconfig.json` 文件的目录。

::: tip
当命令行上指定了输入文件时，`tsconfig.json` 文件会被忽略。
:::

## 顶级配置

### 继承配置

`tsconfig.json` 文件可以利用 `extends` 属性从另一个配置文件里继承配置。`extends`的值是一个字符串，包含指向另一个要继承文件的路径，在原文件里的配置先被加载，然后被来至继承文件里的配置重写。 如果发现循环引用，则会报错。
比如：
::: code-group

```json [base.json]
{
  "compilerOptions": {
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

```json [tsconfig.json]
{
  "extends": "./configs/base",
  "files": ["main.ts", "supplemental.ts"]
}
```

:::

### 精确指定要编译哪些 ts 文件-files

当你在 `tsconfig.json` 中设置了 `"files"` 数组后，TypeScript 编译器（tsc）将只处理这个数组里列出的文件。即使目录下有其他 .ts 文件，它们也不会被编译。

```js
{
  "compilerOptions": {
    // ... 其他编译选项
  },
  "files": [
    "src/main.ts",
    "src/utils/helper.ts",
    "typings/global.d.ts"
  ]
}
```

### 范围形式指定要编译哪些文件-include

指定一个文件路径的数组，这些路径使用 glob 通配符模式来匹配需要包含在编译过程中的文件

::: tip glob 通配符

- `*`：匹配除 `/` 或 `\` 外的任意字符（单个目录层级）。
- `**`：匹配任意层级的目录（递归）。
- `?`：匹配任意单个字符。

:::

::: warning `files`与`include`
`files`会和`include`进行合并,且包含的文件的引用也会被加载进来。比如`A.ts`引用了`B.ts`，`B.ts`也会被编译。因此 B.ts 不能被排除，除非引用它的`A.ts`在`exclude`列表中
:::

### 排除不需要编译的 ts 文件-exclude

指定一个文件路径的数组，这些路径使用通配符模式来匹配需要从编译过程中排除的文件。

::: warning `exclude`的默认行为

- `exclude`默认排除`outDir`和`node_modules`下的文件，且也会排除`include`所指定的文件，但是排除不了`files`指定的文件
- 编译器不会去引入那些可能做为输出的文件，比如，假设我们包含了`index.ts`，那么`index.d.ts`和`index.js`会被排除在外
  :::

### 编译输出目录-outDir

### 保存即编译-compileOnSave

如果 IDE 支持，那么你修改了 ts 文件后，按下保存文件,IDE 会自动在后台运行 TypeScript 编译器（tsc），根据 `tsconfig.json` 中的配置（如 `outDir`, target 等）将源代码编译成目标 JavaScript 文件（`.js`）、声明文件（`.d.ts`）等

## 编译选项

### 类型检查相关

以下是您列出的 TypeScript 编译选项的详细表格，这些选项都属于 `compilerOptions` 配置。

| 选项 (Option)                            | 默认值      | 作用说明                                                                                                                                                                                                                                                        |
| :--------------------------------------- | :---------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`allowUnreachableCode`**               | `undefined` | 允许代码中存在无法到达的代码（如 `return` 之后的语句）。如果为 `false` 或未设置，则会报告错误。设为 `true` 可禁用此检查。                                                                                                                                       |
| **`allowUnusedLabels`**                  | `undefined` | 允许代码中存在未使用的标签（label）。如果为 `false` 或未设置，则会报告未使用标签的错误。设为 `true` 可禁用此检查。                                                                                                                                              |
| **`alwaysStrict`**                       | `false`     | **已废弃**。旧版本中用于确保所有文件以严格模式解析。现在应使用 `strict` 或单独的 `strict` 子选项。                                                                                                                                                              |
| **`exactOptionalPropertyTypes`**         | `false`     | 使可选属性的类型更加精确。启用后，`obj.property` 的类型不会自动包含 `undefined`，除非显式声明为 `T \| undefined`。例如，`{ x?: number }` 中 `x` 的类型是 `number` 而不是 `number \| undefined`（访问时仍可能为 `undefined`）。                                  |
| **`noFallthroughCasesInSwitch`**         | `false`     | 禁止在 `switch` 语句中出现“贯穿”（fallthrough）情况。即，一个 `case` 块执行完后，如果没有 `break`, `return`, `throw` 等中断语句，编译器会报错，防止意外的逻辑错误。                                                                                             |
| **`noImplicitAny`**                      | `false`     | 禁止隐式的 `any` 类型。当 TypeScript 无法推断出变量或函数参数的类型时，它会默认使用 `any`。启用此选项后，这种情况会报错，强制你提供明确的类型注解。                                                                                                             |
| **`noImplicitOverride`**                 | `false`     | 要求在派生类中重写基类方法时必须使用 `override` 关键字。如果子类方法没有 `override` 修饰符但恰好与基类方法同名，会报错。有助于防止意外覆盖。                                                                                                                    |
| **`noImplicitReturns`**                  | `false`     | 检查函数是否在所有代码路径上都有返回值。如果函数有返回类型（非 `void`），但存在某些分支没有 `return` 语句，会报错。                                                                                                                                             |
| **`noImplicitThis`**                     | `false`     | 当 `this` 的类型为 `any` 时发出错误。有助于捕获由于 `this` 指向不明确而导致的潜在错误。                                                                                                                                                                         |
| **`noPropertyAccessFromIndexSignature`** | `false`     | 影响通过索引签名和点符号访问属性的行为。启用后，对于具有字符串索引签名的对象（如 `{ [k: string]: T }`），必须使用 `obj["prop"]` 形式访问属性，而不能使用 `obj.prop`，以避免拼写错误。                                                                           |
| **`noUncheckedIndexedAccess`**           | `false`     | 启用后，通过字符串索引访问对象（如 `obj["key"]`）的类型将自动包含 `undefined`。这更准确地反映了运行时行为（因为属性可能不存在），迫使你处理 `undefined` 的情况。                                                                                                |
| **`noUnusedLocals`**                     | `false`     | 报告未使用的局部变量（在函数内部声明但未使用的变量）的错误。                                                                                                                                                                                                    |
| **`noUnusedParameters`**                 | `false`     | 报告未使用的函数参数的错误。                                                                                                                                                                                                                                    |
| **`strict`**                             | `false`     | **总开关**。启用一组最严格的类型检查选项。设置为 `true` 相当于同时启用：`noImplicitAny`, `noImplicitThis`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `useUnknownInCatchVariables`。推荐在新项目中开启。 |
| **`strictBindCallApply`**                | `false`     | 启用对 `bind`, `call`, `apply` 方法的更严格的类型检查，确保传入的参数类型与目标函数匹配。                                                                                                                                                                       |
| **`strictFunctionTypes`**                | `false`     | 启用对函数参数的更严格的类型检查（协变/逆变规则）。影响函数类型的赋值兼容性判断。                                                                                                                                                                               |
| **`strictNullChecks`**                   | `false`     | **核心严格模式之一**。启用后，`null` 和 `undefined` 不再是所有类型的子类型。变量必须明确声明可以为 `null` 或 `undefined`（如 `string \| null`），否则不能赋值为 `null` 或 `undefined`。有效防止空指针错误。                                                     |
| **`strictPropertyInitialization`**       | `false`     | 要求类中的非静态属性在构造函数中或声明时被初始化。如果存在可能的未初始化路径，会报错。常与 `strictNullChecks` 一起使用。注意：如果属性是可选的（`?`）或明确标记为可能为 `undefined`，则不受此限制。                                                             |
| **`useUnknownInCatchVariables`**         | `false`     | 控制 `catch` 语句中错误变量的类型。启用前，类型是 `any`；启用后，类型是 `unknown`。`unknown` 更安全，要求你在使用错误对象前进行类型检查（如 `if (e instanceof Error)`）。                                                                                       |

### 模块处理相关

| 选项 (Option)              | 默认值                      | 作用说明                                                                                                                                                                                                                                                                                                     |
| :------------------------- | :-------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`allowUmdGlobalAccess`** | `false`                     | 允许从模块中访问在 UMD（Universal Module Definition）全局库中声明的变量。如果一个 UMD 库将自身挂载到全局对象（如 `window`），启用此选项后，你可以直接使用其导出的名字而不需要导入。通常不推荐使用，因为它破坏了模块的明确性。                                                                                |
| **`baseUrl`**              | `undefined`                 | 指定解析非相对模块名（如 `"myModule"` 或 `"components/Button"`）的**根目录**。配合 `paths` 使用可以实现路径别名（alias）。例如，设置为 `"src"` 后，`import 'utils/helpers'` 会去 `src/utils/helpers` 查找。                                                                                                  |
| **`module`**               | 取决于 `target`             | 指定生成代码的**模块系统**。常见值包括：`"commonjs"` (Node.js), `"es2015"` / `"es6"` (ES Modules), `"esnext"`, `"amd"`, `"system"`, `"umd"`, `"node16"`, `"nodenext"` 等。影响输出文件中的 `import`/`export` 语法。                                                                                          |
| **`moduleResolution`**     | 取决于 `module`             | 指定如何解析模块。主要模式：<br>• `"classic"`：旧版解析策略。<br>• `"node16"` / `"nodenext"`：对应 Node.js 的 ESM 和 CJS 解析规则，支持 `package.json` 中的 `"exports"` 和 `"imports"` 字段。<br>• `"node"`：经典的 Node.js 风格解析（最常用），遵循 `node_modules` 查找和 `package.json` 的 `"main"` 字段。 |
| **`moduleSuffixes`**       | `[]`                        | 允许你为模块解析添加自定义的后缀。例如，`["-native", ""]` 时，`import 'foo'` 会依次尝试查找 `foo-native.ts`, `foo-native.tsx`, `foo.ts`, `foo.tsx`。常用于平台特定文件（如 `component-native.tsx`, `component-web.tsx`）。                                                                                   |
| **`noResolve`**            | `false`                     | **已废弃**。旧版本中用于指示编译器不要包含某些文件。现在应使用 `types`、`files`、`include`/`exclude` 来精确控制文件包含。                                                                                                                                                                                    |
| **`paths`**                | `{}`                        | 配合 `baseUrl` 使用，定义模块名到实际路径的映射（路径别名）。支持通配符 (`*`)。极大提升大型项目中导入语句的可读性和可维护性。                                                                                                                                                                                |
| **`resolveJsonModule`**    | `false`                     | 允许导入 `.json` 文件。启用后，你可以 `import data from './data.json'`。TypeScript 会根据 JSON 内容推断其类型。需要模块加载器（如 Webpack）或 Node.js 支持才能运行。                                                                                                                                         |
| **`rootDir`**              | 推断自 `tsconfig.json` 位置 | 指定输入文件的**根目录**。编译器会据此计算输出文件的相对目录结构。通常与 `outDir` 配合使用。例如，`rootDir: "./src"`, `outDir: "./dist"`，则 `src/app/main.ts` 会被编译到 `dist/app/main.js`。                                                                                                               |
| **`rootDirs`**             | `[]`                        | 指定一个**虚拟目录**，由多个物理目录组成。编译器会将这些目录视为一个联合的源根目录。常用于合并不同来源的代码（如主代码和测试补丁）。允许在这些目录之间进行“虚拟”相对导入。                                                                                                                                   |
| **`typeRoots`**            | `["./node_modules/@types"]` | 指定类型声明文件（`.d.ts`）的搜索路径。默认是 `node_modules/@types`。如果设置为 `[]`，则禁用默认路径。如果设置为 `["./typings", "./vendor/types"]`，则只从这两个目录查找 `@types` 包。                                                                                                                       |
| **`types`**                | `[]` (表示包含所有)         | 明确指定要包含在项目中的 `@types` 包。例如，`["node", "jest"]` 表示只包含 `@types/node` 和 `@types/jest` 的类型。如果设置为空数组 `[]`，则不自动包含任何 `@types` 包（除非通过其他方式引用）。有效控制全局作用域中的类型污染。                                                                               |

### 输出相关

好的，以下是您要求的 TypeScript 编译选项的表格，已按您的要求分成两部分。

| 选项 (Option)              | 默认值  | 作用说明                                                                                                                                                                    |
| :------------------------- | :------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`allowJs`**              | `false` | 允许编译 JavaScript 文件（`.js`, `.jsx`）。如果项目中混合了 TS 和 JS 文件，启用此选项可以让 tsc 一并处理 JS 文件（例如进行类型检查或转译）。                                |
| **`checkJs`**              | `false` | 当 `allowJs` 启用时，此选项允许对 `.js` 文件进行类型检查。你可以在 JS 文件中使用 JSDoc 注释来提供类型信息，TypeScript 会据此进行错误检查。                                  |
| **`maxNodeModuleJsDepth`** | `0`     | 指定在 `node_modules` 中自动发现并编译 `.js` 文件的最大递归深度。仅当 `allowJs` 为 `true` 时有效。设为 `0` 表示禁用自动编译 `node_modules` 中的 JS 文件。通常保持默认即可。 |

### JS 支持

| 选项 (Option)                | 默认值           | 作用说明                                                                                                                                                                                                         |
| :--------------------------- | :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`declaration`**            | `false`          | 是否为 `.ts`/`.tsx` 文件生成对应的 **Declaration Files**（`.d.ts`）。这些文件只包含类型信息，用于库的发布，让其他项目可以进行类型推断。                                                                          |
| **`declarationDir`**         | `undefined`      | 指定生成的 `.d.ts` 声明文件的输出目录。如果不设置，则声明文件会和 JavaScript 输出文件放在同一个目录（由 `outDir` 或 `outFile` 决定）。                                                                           |
| **`declarationMap`**         | `false`          | 为生成的 `.d.ts` 文件创建 **source map** 文件（`.d.ts.map`）。这使得调试器可以将 `.d.ts` 文件中的类型信息映射回原始的 `.ts` 源码，便于调试类型定义。                                                             |
| **`downlevelIteration`**     | `false`          | 当目标 (`target`) 是 `ES5` 或更低版本时，为 `for...of` 循环、展开运算符 (`...`) 等使用更兼容的降级实现。它会引入辅助函数（如 `__values`, `__read`）以正确处理迭代器和解构。需要 `importHelpers` 配合以避免重复。 |
| **`emitBOM`**                | `false`          | 是否在生成的文件开头添加 **字节顺序标记 (Byte Order Mark, BOM)**。某些旧版 Windows 工具可能需要 BOM 来正确识别文件编码（如 UTF-8）。现代工具通常不需要。                                                         |
| **`emitDeclarationOnly`**    | `false`          | 如果为 `true`，则 **只生成 `.d.ts` 声明文件，不生成 `.js` 文件**。当你只想发布类型定义而不想重新编译源码时非常有用（例如 CI/CD 流程中单独生成类型包）。                                                          |
| **`importHelpers`**          | `false`          | 启用后，TypeScript 会从 `tslib` 库导入辅助函数（如 `__extends`, `__assign`, `__awaiter` 等），而不是在每个输出文件中重复生成这些函数。可以显著减小输出文件体积。**需要安装 `npm install tslib --save-dev`**。    |
| **`importsNotUsedAsValues`** | `"remove"`       | 控制未使用的导入语句的处理方式：<br>• `"remove"`: 删除未被用作值的导入（仅保留类型导入）。<br>• `"preserve"`: 保留所有导入，即使未使用。<br>• `"error"`: 将未使用的导入视为错误。                                |
| **`inlineSourceMap`**        | `false`          | 如果为 `true`，则将 source map 信息直接嵌入到生成的 `.js` 文件末尾（作为 data URI），而不是生成独立的 `.js.map` 文件。                                                                                           |
| **`inlineSources`**          | `false`          | 如果为 `true`，则将原始的 TypeScript 源码也嵌入到 source map 文件中。结合 `inlineSourceMap` 使用，可以实现完全自包含的调试信息。                                                                                 |
| **`mapRoot`**                | `undefined`      | 指定生成的 `.js.map` 文件的**运行时位置**。它会修改 `.js` 文件中 `sourceMappingURL` 的路径，使其指向正确的 `.map` 文件位置，常用于部署场景。                                                                     |
| **`newLine`**                | 平台相关         | 指定生成文件的换行符。可选值：`"crlf"` (Windows), `"lf"` (Unix/Linux/macOS)。                                                                                                                                    |
| **`noEmit`**                 | `false`          | 如果为 `true`，则 **不生成任何输出文件**（`.js`, `.d.ts`, `.map` 等）。但仍然会进行完整的类型检查。常用于只想检查类型错误而不关心输出的场景。                                                                    |
| **`noEmitHelpers`**          | `false`          | 如果为 `true`，则不生成任何编译辅助函数（如 `__extends`）。通常与 `importHelpers` 一起使用，确保辅助函数只从 `tslib` 导入。                                                                                      |
| **`noEmitOnError`**          | `false`          | 如果为 `true`，当编译过程中出现任何错误时，**完全停止输出任何文件**。防止错误代码被发布。                                                                                                                        |
| **`outDir`**                 | 推断自 `rootDir` | 指定编译后输出文件的**根目录**。所有生成的 `.js`, `.d.ts`, `.map` 等文件都会放在这里，并保持源码的相对目录结构。                                                                                                 |
| **`outFile`**                | `undefined`      | 将所有输入文件**合并并输出到单个文件**中。适用于模块系统为 `amd` 或 `system` 的场景。不能与 `outDir` 同时使用。                                                                                                  |
| **`preserveConstEnums`**     | `false`          | 如果为 `true`，则保留 `const enum` 的编译输出。默认情况下，`const enum` 会被内联，不生成任何 JS 代码。启用此选项会生成一个对象，以便在运行时反射枚举成员。                                                       |
| **`preserveValueImports`**   | `false`          | 防止移除那些仅用于类型的 `import` 语句（如 `import { Type } from 'mod';`）。如果模块有副作用，此选项可确保导入语句不会被意外删除。需要配合 `importsNotUsedAsValues` 使用。                                       |
| **`removeComments`**         | `false`          | 是否从生成的 `.js` 文件中移除所有注释。                                                                                                                                                                          |
| **`sourceMap`**              | `false`          | 是否为每个 `.ts` 文件生成对应的 **source map** 文件（`.js.map`）。这对于调试（在浏览器或 Node.js 调试器中调试原始 TS 代码）至关重要。                                                                            |
| **`sourceRoot`**             | `undefined`      | 指定 `.map` 文件中记录的源码（`.ts` 文件）的**运行时位置**。修改 `sources` 字段的路径，用于源码不在最终部署位置的情况（如 CI/CD 构建）。                                                                         |
| **`stripInternal`**          | `false`          | 如果为 `true`，则从生成的 `.d.ts` 声明文件中移除所有使用 `@internal` JSDoc 标记的 API。用于隐藏库的内部实现细节。                                                                                                |

### 互操作约束

| 选项 (Option)                          | 默认值                           | 作用说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| :------------------------------------- | :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`allowSyntheticDefaultImports`**     | `false` (Node), `true` (bundler) | 声明是否允许从没有默认导出（default export）的模块进行**合成的默认导入**。<br>• **场景**：许多 CommonJS 模块（如 Node.js 内置模块或旧版 npm 包）使用 `module.exports = function() { ... }`，在 ES6 模块中应通过 `import * as fs from 'fs'` 使用。但为了方便，开发者常想用 `import fs from 'fs'`。<br>• **作用**：此选项为 `true` 时，允许这种语法。它不会影响代码生成，仅用于类型检查。<br>• **注意**：实际运行时能否支持取决于你的模块加载器（Webpack, Babel, Node.js 等）。                                         |
| **`esModuleInterop`**                  | `false`                          | **这是一个“超级开关”**，旨在解决 ES 模块与 CommonJS 模块之间的互操作性问题。<br>• 启用后，会自动设置 `allowSyntheticDefaultImports` 为 `true`。<br>• 更重要的是，它会**修改代码生成**：当使用 `import fs from 'fs'` 导入一个 CommonJS 模块时，TypeScript 会生成额外的辅助代码（类似 `const fs_1 = require("fs"); const fs = (fs_1 && fs_1.__esModule ? fs_1.default : fs_1);`），使默认导入在运行时也能工作。<br>• **推荐**：在需要混合使用 ES 模块语法和 CommonJS 包的项目中（尤其是前端项目），强烈建议开启此选项。 |
| **`forceConsistentCasingInFileNames`** | `false`                          | 强制文件名大小写保持一致。<br>• 如果项目中同时存在 `User.ts` 和 `user.ts`（在不区分大小写的文件系统如 Windows 上可能），或导入语句的大小写与实际文件名不符（如 `import User from './user'` 但文件是 `User.ts`），启用此选项会报错。<br>• **目的**：防止在区分大小写的文件系统（如 Linux）上出现“文件找不到”的部署错误。**强烈建议在团队项目中开启**。                                                                                                                                                                 |
| **`isolatedModules`**                  | `false`                          | 要求每个文件都可以被**独立编译**。<br>• 启用后，会强制执行一些限制，例如：<br> - 禁止使用 `const enum`（因为它们需要跨文件内联）。<br> - 禁止使用 `namespace` 导出（除非在单个文件内）。<br>• **目的**：确保代码可以被像 Babel 这样的转译工具单独处理每个文件（不进行程序级分析）。如果你的构建流程包含 Babel 或其他非`tsc`的转译器，建议开启此选项以保证兼容性。                                                                                                                                                     |
| **`preserveSymlinks`**                 | `false`                          | 控制是否保留符号链接（symbolic links）的解析方式。<br>• 默认 (`false`)：Node.js 会解析符号链接，找到其指向的真实路径，然后从真实路径开始查找 `node_modules`。<br>• 设为 `true`：Node.js 会从符号链接所在的目录开始查找 `node_modules`，就像符号链接不存在一样。<br>• **用途**：主要用于特定的开发环境或工具链（如某些 monorepo 工具或测试环境），普通项目很少需要修改此设置。                                                                                                                                         |

### 向后兼容性

| 选项 (Option)                        | 默认值      | 作用说明                                                                                                                                                                                                                            |
| :----------------------------------- | :---------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`charset`**                        | `utf8`      | 指定输入文件的字符编码。**已废弃**。TypeScript 现在始终假定源文件为 UTF-8 编码，此选项被忽略。                                                                                                                                      |
| **`keyofStringsOnly`**               | `false`     | 限制 `keyof` 操作符的结果只包含字符串。启用后，`keyof T` 的类型将是 `string` 而不是 `"prop1" \| "prop2"` 这样的字符串字面量联合类型。**已废弃**。此行为不符合 `keyof` 的设计初衷（精确的属性名），现代代码应避免使用。              |
| **`noImplicitUseStrict`**            | `false`     | 禁止在生成的 JavaScript 文件顶部自动插入 `"use strict";` 指令。**已废弃**。现代模块系统（ESM, CommonJS）默认在严格模式下运行，无需此指令。此选项已无实际意义。                                                                      |
| **`noStrictGenericChecks`**          | `false`     | **已废弃**。旧版本中用于禁用泛型的严格检查。现在应使用更精细的控制选项。                                                                                                                                                            |
| **`out`**                            | `undefined` | **已废弃**。旧版选项，用于将多个输入文件合并输出到单个 `.js` 文件。功能已被 `outFile` 选项取代。                                                                                                                                    |
| **`suppressExcessPropertyErrors`**   | `false`     | 抑制对象字面量赋值时的“多余属性”错误。例如，`{ name: "Alice", age: 30 }` 赋值给 `{ name: string }` 类型时，`age` 是多余属性，默认会报错。启用此选项后，错误被抑制。**强烈不推荐使用**，因为它会掩盖潜在的拼写错误和类型不匹配问题。 |
| **`suppressImplicitAnyIndexErrors`** | `false`     | 抑制对可能为 `any` 的索引访问的错误。例如，当 TypeScript 无法推断索引签名的类型时，访问 `obj[key]` 可能会推断为 `any`，这可能导致运行时错误。启用此选项会忽略此类警告。**强烈不推荐使用**，它会降低类型安全性。                     |

### 语言和环境

以下是您列出的 TypeScript 编译选项的详细表格，这些选项主要涉及语言特性、JSX 支持、库定义和目标环境。

| 选项 (Option)                 | 默认值                    | 作用说明                                                                                                                                                                                                                                                                                                                                                                                   |
| :---------------------------- | :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`emitDecoratorMetadata`**   | `false`                   | 当使用装饰器（`@decorator`）时，是否为它们发出额外的类型元数据（通过 `reflect-metadata` polyfill）。此元数据可用于依赖注入、序列化等运行时反射场景。**需要 `experimentalDecorators` 同时启用**。                                                                                                                                                                                           |
| **`experimentalDecorators`**  | `false`                   | 启用对 **ES 装饰器**（Decorators）的实验性支持。装饰器语法（如 `@Component`, `@Injectable`）目前仍是 TC39 的提案，未正式纳入 ECMAScript 标准。启用此选项允许你在 TypeScript 中使用装饰器，但需注意其未来可能发生变化。                                                                                                                                                                     |
| **`jsx`**                     | `"preserve"`              | 指定 `.tsx` 文件中 JSX 代码的处理方式：<br>• `"preserve"`: 保留 JSX 语法，输出为 `.jsx` 文件，交给 Babel 等工具处理。<br>• `"react"`: 编译为 `React.createElement` 调用，输出 `.js` 文件。<br>• `"react-jsx"`: 使用新的 JSX 转换（`jsx`/`jsxs` 函数），需要 React 17+。<br>• `"react-jsxdev"`: 用于开发环境的 JSX 转换，包含额外调试信息。<br>• `"react-native"`: 保留 JSX，输出为 `.js`。 |
| **`jsxFactory`**              | `"React.createElement"`   | 当 `jsx` 为 `"react"` 时，指定用于创建 JSX 元素的工厂函数。例如，可设为 `"h"` 以配合 Preact (`import { h } from 'preact'`)。                                                                                                                                                                                                                                                               |
| **`jsxFragmentFactory`**      | `"React.Fragment"`        | 指定用于创建 JSX 片段（`<>...</>`）的工厂函数。默认为 `React.Fragment`，可改为其他库的等效函数。                                                                                                                                                                                                                                                                                           |
| **`jsxImportSource`**         | `"react"`                 | 与 `jsx: "react-jsx"` 或 `"react-jsxdev"` 配合使用。指定 JSX 转换所需的运行时函数（`jsx`, `jsxs`, `jsxDEV`）从哪个包导入。例如，设为 `"preact"` 时，会生成 `import { jsx as _jsx } from "preact/jsx-runtime"`。                                                                                                                                                                            |
| **`lib`**                     | 根据 `target` 推断        | 指定项目中包含的 **TypeScript 内置类型定义**（`.d.ts` 文件）。例如 `["es2021", "dom", "dom.iterable", "scripthost"]`。它告诉编译器你的代码可以使用哪些 API（如 `Promise`, `fetch`, `console`）。选择不正确的 `lib` 可能导致类型错误或缺少类型。                                                                                                                                            |
| **`moduleDetection`**         | `"auto"`                  | 控制 TypeScript 如何判断一个文件是否为模块（module）而非脚本（script）。<br>• `"auto"`: 基于 `import`/`export` 语句和 `package.json` 的 `"type"` 字段判断。<br>• `"legacy"`: 仅基于 `import`/`export` 语句（旧版行为）。<br>• `"force"`: 将所有 `.ts` 文件视为模块。                                                                                                                       |
| **`noLib`**                   | `false`                   | 如果为 `true`，则**不包含任何默认的内置类型定义**（如 `es5.d.ts`）。你需要手动通过 `lib` 选项指定所有需要的类型库。**极少使用**，通常用于非常特殊的环境。                                                                                                                                                                                                                                  |
| **`reactNamespace`**          | `"React"`                 | **已废弃**。旧版选项，用于指定 JSX 工厂函数的命名空间（当 `jsx` 为 `"react"` 时）。现在应使用 `jsxFactory`。                                                                                                                                                                                                                                                                               |
| **`target`**                  | `"es3"`                   | 指定编译生成的 JavaScript 代码的**目标版本**。常见值：`"es3"`, `"es5"`, `"es2016"`, `"es2020"`, `"es2022"`, `"esnext"`。它决定了生成代码的语法（如是否使用 `let`/`const`、箭头函数、可选链等）和是否需要 polyfill。                                                                                                                                                                        |
| **`useDefineForClassFields`** | `false` (旧), `true` (新) | 控制类字段（class fields）的编译方式。<br>• `true`: 使用 `Object.defineProperty` 定义字段，更符合 ES 标准提案，支持访问器（getter/setter）。<br>• `false`: 直接在构造函数中赋值 (`this.field = value`)。<br>**现代项目应设为 `true`**，以获得标准兼容的行为。                                                                                                                              |

### 编译诊断

这些选项都属于 **诊断和调试 (Diagnostics & Debugging)** 类别，主要用于**分析编译过程、排查问题或生成性能报告**，通常在开发、调试或优化构建流程时使用。

| 选项 (Option)             | 默认值      | 作用说明                                                                                                                                                                                                                              |
| :------------------------ | :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`diagnostics`**         | `false`     | 输出详细的编译器诊断信息。启用后，会在编译结束时显示一个摘要，包含：编译耗时、内存使用、输入/输出文件数量、错误/警告计数等。有助于快速了解编译的整体情况。                                                                            |
| **`explainFiles`**        | `false`     | 让编译器解释**为什么某个文件被包含在项目中**。编译时会列出每个被处理的文件，并说明其被包含的原因（例如：在 `files` 数组中、匹配 `include` 模式、是 `lib.d.ts` 的一部分等）。对于理解复杂的项目结构或排查意外包含的文件非常有用。      |
| **`extendedDiagnostics`** | `false`     | 输出比 `diagnostics` 更**详尽的性能和统计信息**。除了基础诊断外，还会显示各个编译阶段（如解析、绑定、检查、代码生成）的具体耗时、符号数量、AST 节点数量等。是深度性能分析的工具。                                                     |
| **`generateCpuProfile`**  | `undefined` | 在编译结束时生成一个 **CPU 性能分析文件**（`.cpuprofile`），记录编译过程中 CPU 的使用情况。该文件可以加载到 Chrome DevTools 的 Performance 面板中进行可视化分析，找出编译瓶颈。需要指定文件名，如 `"./profile.cpuprofile"`。          |
| **`listEmittedFiles`**    | `false`     | 输出编译器**实际生成的文件列表**（如 `.js`, `.d.ts`, `.map` 等）。对于确认输出内容、调试构建脚本或与打包工具集成很有帮助。                                                                                                            |
| **`listFiles`**           | `false`     | 输出编译器**处理的所有输入文件的完整路径列表**。这包括了所有通过 `files`, `include`, `references` 等方式引入的 `.ts`, `.tsx` 文件。用于验证项目配置是否正确包含了预期的源码。                                                         |
| **`traceResolution`**     | `false`     | 启用对**模块解析过程**的详细跟踪。编译时会打印出每一个 `import` 或 `require` 语句是如何被解析的，包括尝试查找的每一个路径、读取的 `package.json` 文件以及最终找到的文件。这是解决“模块未找到”或“解析了错误版本”等问题的终极调试工具。 |

### 监控选项

以下是您列出的 TypeScript 编译选项的详细表格。**请注意，这些选项属于 `tsconfig.json` 中的顶层配置，但它们是专门用于 `tsc --watch` 模式（文件监听模式）的，并且主要在 **Visual Studio 等特定 IDE 环境中使用。在标准的命令行 `tsc --watch` 或现代构建工具（如 Webpack, Vite）中，这些选项通常**被忽略或不适用**。

| 选项 (Option)                   | 默认值      | 作用说明                                                                                                                                                                                                                                                                                                                                                                                                                                |
| :------------------------------ | :---------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`watchFile`**                 | `undefined` | 指定监听单个文件变化的策略。可选值：<br>• `"fixedPollingInterval"`: 定期轮询文件修改时间。<br>• `"priorityPollingInterval"`: 轮询，但对某些文件（如 `node_modules` 外的源码）更频繁。<br>• `"dynamicPriorityPolling"`: 基于文件访问频率动态调整轮询间隔。<br>• `"useFsEvents"`: 使用操作系统原生文件系统事件（最高效）。<br>• `"useFsEventsOnParentDirectory"`: 监听父目录的事件。<br>• `undefined`: 让编译器根据环境自动选择最佳策略。 |
| **`watchDirectory`**            | `undefined` | 指定监听整个目录变化的策略。当无法为单个文件设置监听时使用。可选值与 `watchFile` 类似（`"fixedPollingInterval"`, `"dynamicPriorityPolling"`, `"useFsEvents"`, `"useFsEventsOnParentDirectory"`）。例如，在网络文件系统上可能需要轮询。                                                                                                                                                                                                  |
| **`fallbackPolling`**           | `undefined` | 当原生文件系统事件（如 `useFsEvents`）不可用或失败时，使用的后备轮询策略。可选值：`"fixedPollingInterval"`, `"priorityPollingInterval"`, `"dynamicPriorityPolling"`。                                                                                                                                                                                                                                                                   |
| **`synchronousWatchDirectory`** | `false`     | 如果为 `true`，则同步执行目录监听的初始化。这可能会阻塞其他操作，但能确保监听在继续前完全建立。通常保持 `false`（异步）以获得更好的性能。                                                                                                                                                                                                                                                                                               |
| **`excludeDirectories`**        | `[]`        | 在 `--watch` 模式下，指定要从文件监听中排除的**目录路径数组**。即使这些目录中的文件发生变化，也不会触发重新编译。可用于提升大型项目中监听进程的性能。                                                                                                                                                                                                                                                                                   |
| **`excludeFiles`**              | `[]`        | 在 `--watch` 模式下，指定要从文件监听中排除的**文件路径数组**。这些文件的变化不会触发重新编译。                                                                                                                                                                                                                                                                                                                                         |

## 最佳实践

```ts
{
  // 继承基础配置 (可选，推荐用于团队)
  // "extends": "@tsconfig/recommended/tsconfig.json",

  "compilerOptions": {
    /**********
     * 基础设置
     **********/
    "target": "ES2021",
    // 指定编译输出的JS版本。ES2021 覆盖了现代浏览器和Node.js 14+。
    // 如果需要支持更老的环境，请调整为 ES2018 或 ES2019。

    "lib": ["ES2021", "DOM", "DOM.Iterable", "ScriptHost"],
    // 包含的语言API。"ES2021" 提供现代JS特性，"DOM" 提供浏览器API。
    // Node.js项目可移除 "DOM" 相关项。

    "module": "ESNext",
    // 模块系统。"ESNext" 保留ES模块语法，让打包工具（Webpack/Vite）处理。
    // Node.js ESM项目可用 "Node16" 或 "NodeNext"。

    "moduleResolution": "Node16",
    // 模块解析策略。与 "module": "ESNext" 配合使用时，推荐 "Node16" 或 "NodeNext" 以支持 package.json 的 "exports"。
    // 兼容旧版可设为 "Node"。

    "allowSyntheticDefaultImports": true,
    // 允许从没有默认导出的模块进行默认导入（仅类型检查）。通常与 esModuleInterop 一起使用。

    "esModuleInterop": true,
    // 启用此选项可无缝使用 import React from 'react' 导入CommonJS模块。
    // 它会生成辅助代码确保运行时正确。强烈推荐开启。

    "forceConsistentCasingInFileNames": true,
    // 强制文件名大小写一致，防止在Linux服务器上因大小写导致的模块找不到错误。


    /**********
     * 严格性 (Type Safety)
     **********/
    "strict": true,
    // 开启所有严格的类型检查。这是高质量项目的基石。
    // 等价于同时开启：noImplicitAny, noImplicitThis, strictNullChecks, strictFunctionTypes, strictBindCallApply, strictPropertyInitialization, useUnknownInCatchVariables

    "skipLibCheck": true,
    // 跳过对 node_modules/@types 中声明文件的类型检查。
    // 可显著提升编译速度，且第三方类型通常是可信的。


    /**********
     * 模块与路径
     **********/
    "baseUrl": ".",
    // 解析非相对模块名的根目录。配合 paths 使用。

    "paths": {
      // 路径别名，提升导入语句的可读性和可维护性。
      "@/*": ["src/*"],
      "@/components/*": ["src/components/*"],
      "@/utils/*": ["src/utils/*"]
      // 根据项目结构调整
    },


    /**********
     * 输出控制
     **********/
    "outDir": "./dist",
    // 编译后文件的输出目录。

    "rootDir": "./src",
    // 源码根目录。编译器据此保持输出目录结构。

    "declaration": true,
    // 为每个TS文件生成 .d.ts 类型声明文件。发布npm包时必需。

    "declarationMap": true,
    // 为 .d.ts 文件生成 source map，便于调试类型。

    "sourceMap": true,
    // 为 .js 文件生成 source map，便于调试原始TS代码。

    "removeComments": true,
    // 移除输出文件中的注释。

    "emitDecoratorMetadata": false,
    // 是否为装饰器发出元数据。需要 reflect-metadata。仅在使用依赖注入等框架时开启。

    "experimentalDecorators": false,
    // 是否启用实验性的装饰器语法。仅在 Angular, NestJS 等框架中需要时开启。

    "jsx": "preserve",
    // JSX 处理方式。"preserve" 保留JSX语法，交由Babel等工具处理。React项目常用。
    // React 17+ 新运行时可考虑 "react-jsx"。


    /**********
     * 高级/其他
     **********/
    "useDefineForClassFields": true,
    // 使用 Object.defineProperty 定义类字段，符合ES标准。现代项目应开启。

    "isolatedModules": true,
    // 要求每个文件可独立编译。与Babel等工具兼容的必要条件。

    "importsNotUsedAsValues": "preserve",
    // 控制未使用的导入如何处理。"preserve" 保留所有导入，避免副作用丢失。
    // 也可设为 "remove" (默认) 或 "error"。

    "incremental": true,
    // 启用增量编译。tsc 会记录编译信息到缓存文件，加快后续编译速度。

    "composite": false
    // 是否为项目引用（Project References）构建做准备。大型单体库或monorepo中使用。
  },

  /**********
   * 项目范围
   **********/
  "include": [
    "src"
    // 明确包含的源码目录。比 exclude 更清晰。
  ],

  "exclude": [
    "node_modules",
    "dist",
    "build",
    "coverage",
    "tests/fixtures",
    "**/*.test.ts",
    "**/*.spec.ts"
    // 明确排除的目录和文件。即使在 include 范围内也会被忽略。
  ]
}
```
