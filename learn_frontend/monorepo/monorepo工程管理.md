# monorepo 工程管理

[[toc]]

## mutirepo vs monorepo

![monorepo vs multirepo](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251023155226534.png)
常见 monorepo 管理工具： **pnpm**、npm、Yarn、Lerna、Nx、Turborepo、Rush、...

## pnpm monorepo

### 初始化工程

1. 创建 pnpm 的配置文件

```shell
touch pnpm-workspace.yaml
```

在 `pnpm-workspace.yaml` 文件中配置：

```yaml
# pnpm-workspace.yaml

packages:
  - 'packages/*'
  - 'apps/*'
```

::: tip 一般来说

- 所有公共基建类的库都放在 `packages` 目录下
- 所有业务应用都放在 `apps` 目录下
- 文档性的工程都放在 `docs` 目录下

:::

2. 执行工程级命令，在工作区添加包管理文件`package.json`

```shell
pnpm --workspace-root init
# 或
pnpm -w init
```

注意：`--workspace-root` 或 `-w` 参数指定工作区根目录，默认是当前目录。

3. 执行子包命令，在子包目录下执行命令，为子包添加包管理文件`package.json`

```shell
# 进入子目录中执行
pnpm init
# 或者
pnpm -C 子包路径 init
```

::: tip 子包命名空间
子包的`package.json`里面添加名字，这个是包的唯一标识

```json
{
  "name": "@scope/子包名"
}
```

:::

### 环境版本锁定

一般来说在一个项目的开发中需要统一使用一套环境，比如 `Node.js` 版本、`npm` 版本、`pnpm` 版本等，需要在根工程进行：

```json
// package.json
"engines": {
  "node": ">=22.14.0",
  "npm": ">=10.9.2",
  "pnpm": ">=10.15.1"
}
```

如果`pnpm`的版本与`"engines"`中指定的版本不一致，会提示警告

```yaml
# .npmrc
engine-strict=true
```

当配置这个字段后，表示严格检查，`pnpm`会检查当前环境的版本是否符合要求，如果不符合就会报错退出。

## TypeScript

在工作区下安装 `typescript` 依赖：

```shell
pnpm -Dw add typescript @types/node
```

创建 `tsconfig.json` 文件：

```shell
touch tsconfig.json
```

添加配置：
::: code-group

```json [工作区配置]
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "module": "esnext",
    "target": "esnext",
    "types": [],
    "lib": ["esnext"],
    "sourceMap": true,
    "declaration": true,
    "declarationMap": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "strict": true,
    "verbatimModuleSyntax": false,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "noUncheckedSideEffectImports": true,
    "moduleDetection": "force",
    "skipLibCheck": true
  },
  "exclude": ["node_modules", "dist"]
}
```

```json [子包1配置]
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "lib": ["esnext"]
  },
  "include": ["src"]
}
```

```json [子包2配置]
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "lib": ["esnext", "DOM"]
  },
  "include": ["src"]
}
```

:::

## 代码风格与质量检查

### prettier

`prettier`安装：

```shell
pnpm -Dw add prettier
```

`prettier`配置:

```shell
touch prettier.config.js
```

```js
// prettier.config.js
/**
 * @type {import('prettier').Config}
 * @see https://www.prettier.cn/docs/options.html
 */
export default {
  // 指定最大换行长度
  printWidth: 120,
  // 缩进制表符宽度 | 空格数
  tabWidth: 2,
  // 使用制表符而不是空格缩进行 (true：制表符，false：空格)
  useTabs: false,
  // 结尾不用分号 (true：有，false：没有)
  semi: true,
  // 使用单引号 (true：单引号，false：双引号)
  singleQuote: false,
  // 在对象字面量中决定是否将属性名用引号括起来 可选值 "<as-needed|consistent|preserve>"
  quoteProps: 'as-needed',
  // 在JSX中使用单引号而不是双引号 (true：单引号，false：双引号)
  jsxSingleQuote: false,
  // 多行时尽可能打印尾随逗号 可选值"<none|es5|all>"
  trailingComma: 'none',
  // 在对象，数组括号与文字之间加空格 "{ foo: bar }" (true：有，false：没有)
  bracketSpacing: true,
  // 将 > 多行元素放在最后一行的末尾，而不是单独放在下一行 (true：放末尾，false：单独一行)
  bracketSameLine: false,
  // (x) => {} 箭头函数参数只有一个时是否要有小括号 (avoid：省略括号，always：不省略括号)
  arrowParens: 'avoid',
  // 指定要使用的解析器，不需要写文件开头的 @prettier
  requirePragma: false,
  // 可以在文件顶部插入一个特殊标记，指定该文件已使用 Prettier 格式化
  insertPragma: false,
  // 用于控制文本是否应该被换行以及如何进行换行
  proseWrap: 'preserve',
  // 在html中空格是否是敏感的 "css" - 遵守 CSS 显示属性的默认值， "strict" - 空格被认为是敏感的 ，"ignore" - 空格被认为是不敏感的
  htmlWhitespaceSensitivity: 'css',
  // 控制在 Vue 单文件组件中 <script> 和 <style> 标签内的代码缩进方式
  vueIndentScriptAndStyle: false,
  // 换行符使用 lf 结尾是 可选值 "<auto|lf|crlf|cr>"
  endOfLine: 'auto',
  // 这两个选项可用于格式化以给定字符偏移量（分别包括和不包括）开始和结束的代码 (rangeStart：开始，rangeEnd：结束)
  rangeStart: 0,
  rangeEnd: Infinity,
};
```

`prettier`忽略项：

```shell
touch .prettierignore
```

```yaml
# .prettierignore
# 打包后的文件不需要格式化...
dist
public
.local
node_modules
pnpm-lock.yaml
```

`prettier`脚本命令：

```json
"scripts":{
    //......其他省略
    // 这些后缀名的文件使用 prettier 进行格式化
    "lint:prettier": "prettier --write \"**/*.{js,ts,mjs,cjs,json,tsx,css,less,scss,vue,html,md}\"",
}
```

执行命令：

```shell
pnpm run lint:prettier
pnpm lint:prettier
```

### ESLint

::: tip `EsLint` 和 `Prettier` 的区别
`ESLint` 用于代码质量检查，`Prettier` 用于代码风格检查，他们之间有交集但不完全相同
:::

```shell
pnpm -Dw add eslint@latest @eslint/js globals typescript-eslint eslint-plugin-prettier eslint-config-prettier eslint-plugin-vue
```

| 类别                 | 库名                                               |
| -------------------- | -------------------------------------------------- |
| **核心引擎**         | `eslint`                                           |
| **官方规则集**       | `@eslint/js`                                       |
| **全局变量支持**     | `globals`                                          |
| **TypeScript 支持**  | `typescript-eslint`                                |
| **类型定义（辅助）** | `@types/node`                                      |
| **Prettier 集成**    | `eslint-plugin-prettier`, `eslint-config-prettier` |
| **Vue.js 支持**      | `eslint-plugin-vue`                                |

配置:

```shell
touch eslint.config.js
```

```js
import { defineConfig } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintPluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

const ignores = ['**/dist/**', '**/node_modules/**', '.*', 'scripts/**', '**/*.d.ts'];

export default defineConfig(
  // 通用配置
  {
    ignores, // 忽略项
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended, eslintConfigPrettier], // 继承规则
    plugins: {
      prettier: eslintPluginPrettier,
    },
    languageOptions: {
      ecmaVersion: 'latest', // ecma语法支持版本
      sourceType: 'module', // 模块化类型
      parser: tseslint.parser, // 解析器
    },
    rules: {
      // 自定义
    },
  },
  // 子项目1配置
  {
    ignores,
    files: ['apps/frontend/**/*.{ts,js,tsx,jsx,vue}', 'packages/components/**/*.{ts,js,tsx,jsx,vue}'],
    extends: [...eslintPluginVue.configs['flat/recommended'], eslintConfigPrettier],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  // 子项目2配置
  {
    ignores,
    files: ['apps/backend/**/*.{ts,js}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
```

::: tip eslint 理解
其实 `eslintjs` 本身就是一个规则引擎，它会读取配置文件，然后根据规则对代码进行校验，校验的结果会输出到控制台，如果校验不通过，则会报错。
比如我们要求使用 `es6` 语法，而你使用 `es5` 语法，`eslintjs` 就会报错。
:::

脚本命令:

```json
"scripts":{
    //......其他省略
    "lint:eslint": "eslint",
}
```

### 拼写检查

比如有些关键字单词拼写错误，`main`写成`mian`，可以使用 `cspell` 进行检查：
vscode 插件： `Code Spell Checker`

安装:

```shell
pnpm -Dw add cspell @cspell/dict-lorem-ipsum
```

配置:

```shell
touch cspell.json
```

```json
{
  "import": ["@cspell/dict-lorem-ipsum/cspell-ext.json"],
  "caseSensitive": false,
  "dictionaries": ["custom-dictionary"],
  "dictionaryDefinitions": [
    {
      "name": "custom-dictionary",
      "path": "./.cspell/custom-dictionary.txt",
      "addWords": true
    }
  ],
  "ignorePaths": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/lib/**",
    "**/docs/**",
    "**/vendor/**",
    "**/public/**",
    "**/static/**",
    "**/out/**",
    "**/tmp/**",
    "**/*.d.ts",
    "**/package.json",
    "**/*.md",
    "**/stats.html",
    "eslint.config.mjs",
    ".gitignore",
    ".prettierignore",
    "cspell.json",
    "commitlint.config.js",
    ".cspell"
  ]
}
```

自定义字典:

```shell
mkdir -p ./.cspell && touch ./.cspell/custom-dictionary.txt
```

检查脚本:

```json
"lint:spellcheck": "cspell lint \"(packages|apps)/**/*.{js,ts,mjs,cjs,json,css,less,scss,vue,html,md}\""
```

## git 提交规范

`git` 仓库创建：

```shell
touch .gitignore
```

`.gitignore` 文件内容：

```yaml
# .gitignore
# Node
node_modules/
dist/
build/
.env
.env.*
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# IDE
.vscode/
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# OS
.DS_Store
Thumbs.db

# TypeScript
*.tsbuildinfo

# Misc
coverage/
*.local
*.cache
*.tmp

# Git
.git/
```

```shell
git init
```

### commitizen

安装：

```shell
pnpm -Dw add @commitlint/cli @commitlint/config-conventional commitizen cz-git
```

- `@commitlint/cli 是 commitlint` 工具的核心。在提交代码时，自动检查 `commit message` 是否符合规范
- `@commitlint/config-conventional` 是基于 `conventional commits` 规范的配置文件。
- `commitizen` 提供了一个交互式撰写 `commit` 信息的插件,提供交互式命令行界面，引导你一步步填写符合规范的 `commit message`
- [cz-git](https://cz-git.qbb.sh/zh/guide/)是国人开发了这一款工具，工程性更强，自定义更高，交互性更好,是 `commitizen` 的一个适配器（adapter），专为 `Conventional Commits` 设计，提供更现代化、更友好的交互体验。

配置命令：

```json
// package.json
"scripts": {
  // 其他省略
	"commit": "git-cz"
},
"config": {
  "commitizen": {
    "path": "node_modules/cz-git"
  }
}
```

配置`cz-git`：

```shell
touch commitlint.config.js
```

```js
/** @type {import('cz-git').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // @see: https://commitlint.js.org/#/reference-rules
    'body-leading-blank': [2, 'always'],
    'footer-leading-blank': [1, 'always'],
    'header-max-length': [2, 'always', 108],
    'subject-empty': [2, 'never'],
    'type-empty': [2, 'never'],
    'subject-case': [0],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
        'wip',
        'workflow',
        'types',
        'release',
      ],
    ],
  },
  prompt: {
    types: [
      { value: 'feat', name: '✨ 新功能: 新增功能' },
      { value: 'fix', name: '🐛 修复: 修复缺陷' },
      { value: 'docs', name: '📚 文档: 更新文档' },
      { value: 'refactor', name: '📦 重构: 代码重构（不新增功能也不修复 bug）' },
      { value: 'perf', name: '🚀 性能: 提升性能' },
      { value: 'test', name: '🧪 测试: 添加测试' },
      { value: 'chore', name: '🔧 工具: 更改构建流程或辅助工具' },
      { value: 'revert', name: '⏪ 回滚: 代码回滚' },
      { value: 'style', name: '🎨 样式: 格式调整（不影响代码运行）' },
    ],
    scopes: ['root', 'backend', 'frontend', 'components', 'utils'],
    allowCustomScopes: true,
    skipQuestions: ['body', 'footerPrefix', 'footer', 'breaking'], // 跳过“详细描述”和“底部信息”
    messages: {
      type: '📌 请选择提交类型:',
      scope: '🎯 请选择影响范围 (可选):',
      subject: '📝 请简要描述更改:',
      body: '🔍 详细描述 (可选):',
      footer: '🔗 关联的 ISSUE 或 BREAKING CHANGE (可选):',
      confirmCommit: '✅ 确认提交?',
    },
  },
};
```

### husky

`husky` 可以帮助我们在 `git` 提交前后进行代码检查，比如代码风格检查、代码质量检查等，本质上就是`git hook`钩子。
安装`husky`

```shell
pnpm -Dw add husky
```

初始化：会生成 `.husky` 文件夹

```cmd
pnpx husky init
```

配置(pre-commit)：在提交前进行`prettier、eslint、spellcheck`检查

```cmd
#!/usr/bin/env sh
#
pnpm lint:prettier && pnpm lint:eslint && pnpm lint:spellcheck
```

配置命令:

```json
"scripts": {
  "prepare": "husky"
},
```

### lint-staged

`lint-staged` 可以帮助我们只检查当前暂存区的文件，而不是全部文件。
安装

```shell
pnpm -Dw add lint-staged
```

配置命令

```json
"scripts": {
  "precommit": "lint-staged"
},
```

配置文件

```js
// .lintstagedrc.js
export default {
  '*.{js,ts,mjs,cjs,json,tsx,css,less,scss,vue,html,md}': ['cspell lint'],
  '*.{js,ts,vue,md}': ['prettier --write', 'eslint'],
};
```

重新配置 husky

```cmd
#!/usr/bin/env sh
```

## 公共库打包

安装`rollup`

```shell
pnpm -Dw add rollup @rollup/plugin-node-resolve @rollup/plugin-commonjs rollup-plugin-typescript2 @rollup/plugin-terser @vitejs/plugin-vue rollup-plugin-postcss
```

- `@rollup/plugin-node-resolve`: 解析 node_modules 中的依赖
- `@rollup/plugin-commonjs`: 将 CommonJS 模块转为 ESM
- `rollup-plugin-typescript2`: 让 Rollup 支持 TS 编译
- `@rollup/plugin-terser`： 压缩和混淆
- `@vitejs/plugin-vue`： 支持 SFC 编译
- `rollup-plugin-postcss`： 处理 css 代码

配置：在工作区编写`scripts/build.ts`,这个`build.ts`
然后配置命令：

- `"build": "node ./scripts/build.js"`,
- `"dev": "node ./scripts/dev.js"`,

::: code-group

```js [build.base.js]
import path from 'node:path';
import URL from 'node:url';
import fs from 'node:fs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import vue from '@vitejs/plugin-vue';
import postcss from 'rollup-plugin-postcss';

const __filename = URL.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packages = ['utils', 'components'];

function getPackageRoots() {
  return packages.map(pkg => path.resolve(__dirname, '../packages', pkg));
}

async function packageJson(root) {
  const jsonPath = path.resolve(root, 'package.json');
  const content = await fs.promises.readFile(jsonPath, 'utf-8');
  return JSON.parse(content);
}

async function getRollupConfig(root) {
  const config = await packageJson(root);
  const tsconfig = path.resolve(root, 'tsconfig.json');
  const { name, formats } = config.buildOptions || {};
  const dist = path.resolve(root, './dist');
  const entry = path.resolve(root, './src/index.ts');
  const rollupOptions = {
    input: entry,
    sourcemap: true,
    external: ['vue'],
    plugins: [
      nodeResolve(),
      commonjs(),
      typescript({
        tsconfig,
        compilerOptions: {
          outDir: dist,
        },
      }),
      vue({
        template: {
          compilerOptions: {
            // 自定义转换函数，在生成 AST 时移除特定属性
            nodeTransforms: [
              node => {
                if (node.type === 1 /* NodeTypes.ELEMENT */) {
                  // 过滤掉所有 data-testid 属性
                  node.props = node.props.filter(prop => {
                    if (prop.type === 6 /* NodeTypes.ATTRIBUTE */) {
                      return prop.name !== 'data-testid';
                    }
                    return true;
                  });
                }
              },
            ],
          },
        },
      }),
      postcss(),
    ],
    dir: dist,
  };
  const output = [];
  for (const format of formats) {
    const outputItem = {
      format,
      file: path.resolve(dist, `index.${format}.js`),
      sourcemap: true,
      globals: {
        vue: 'Vue',
      },
    };
    if (format === 'iife') {
      outputItem.name = name;
    }
    output.push(outputItem);
  }
  rollupOptions.output = output;
  // watch options
  rollupOptions.watch = {
    include: path.resolve(root, 'src/**'),
    exclude: path.resolve(root, 'node_modules/**'),
    clearScreen: false,
  };
  return rollupOptions;
}

export async function getRollupConfigs() {
  const roots = getPackageRoots();
  const configs = await Promise.all(roots.map(getRollupConfig));
  const result = {};
  for (let i = 0; i < packages.length; i++) {
    result[packages[i]] = configs[i];
  }
  return result;
}

export function clearDist(name) {
  const dist = path.resolve(__dirname, '../packages', name, 'dist');
  if (fs.existsSync(dist)) {
    fs.rmSync(dist, { recursive: true, force: true });
  }
}
```

```js [build.js]
import { getRollupConfigs, clearDist } from './buildBase.js';
import { rollup } from 'rollup';
import terser from '@rollup/plugin-terser';

async function build() {
  const configs = await getRollupConfigs();
  for (const name in configs) {
    clearDist(name);
    const config = configs[name];
    console.log(`📦 正在打包: ${name}`);
    const bundle = await rollup({
      input: config.input,
      plugins: [...config.plugins, terser()],
      external: config.external,
    });
    const tasks = [];
    for (const output of config.output) {
      tasks.push(bundle.write(output));
    }
    await Promise.all(tasks);
    console.log(`✅ ${name} 打包完成`);
  }
}

build();
```

:::

当然你也可以编写开发阶段的脚本代码`dev.ts`

```ts
import { getRollupConfigs } from './buildBase.js';
import { watch } from 'rollup';

async function dev() {
  const configs = await getRollupConfigs();
  for (const name in configs) {
    const config = configs[name];
    const watcher = watch(
      config.output.map(o => ({
        input: config.input,
        plugins: config.plugins,
        external: config.external,
        output: o,
        watch: config.watch,
      })),
    );
    watcher.on('event', event => {
      if (event.code === 'START') {
        console.log(`👁️ 开始监听: ${name}`);
      } else if (event.code === 'ERROR') {
        console.error(`❌ ${name}打包失败:`, event.error);
      } else if (event.code === 'BUNDLE_START') {
        console.log(`📦 正在打包: ${name}`);
      } else if (event.code === 'BUNDLE_END') {
        console.log(`✅ ${name} 打包完成`);
      }
    });
  }
}

dev();
```

## 子包间依赖

通过`pnpm`的 `workspace` 依赖管理机制，可以实现子包间的依赖管理。

```json
{
  "foo": "workspace:*",
  "bar": "workspace:^1.0.0"
}
```

子包导入时需要使用在`package.json`中声明模块入口，以及类型文件所在位置。

```json
{
  "module": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

::: tip 注意
`module`是`es`模块化规范，如果是`commonjs`规范，则使用`main`字段。node 的包解析机制是默认查找`main`字段
:::

## 单元测试

使用`vitest`进行单元测试
安装：

```shell
pnpm -Dw add vitest @vitest/browser vitest-browser-vue vue
```

::: tip 解释

- `vitest` 是单元测试框架
- `@vitest/browser` 是浏览器环境的适配器，能够在测试中帮你打开浏览器看一些组件的
- `vitest-browser-vue` 是适配器的插件，用来支持 vue 组件的测试

:::

添加命令：

```json
"test": "vitest"
```

更改`tsconfig.json`

```json
"types": ["vitest/globals", "@vitest/browser/matchers"],
"lib": ["esnext", "DOM"],
```

安装 vscode 插件： `vitest`

编写测试脚本：比如测试一些 vue 组件

```ts
describe('Area.vue', () => {
  test('mounted', async () => {
    // 获取屏幕
    const screen = render(Area);
    screen.container.style.zoom = '2';
    const n1 = screen.getByTestId('n1');
    const n2 = screen.getByTestId('n2');
    const result = screen.getByTestId('result');
    expect((n1.element() as HTMLInputElement).value).toBe('1');
    expect((n2.element() as HTMLInputElement).value).toBe('2');
    expect(result.element().textContent).toBe('sum:3');
    await n1.fill('3');
    await n2.fill('4');
    expect(result.element().textContent).toBe('sum:7');
  });
});
```

## 发布

```json
"scripts":{
  "publish:utils":"pnpm --filter \"@monorepo/utils\ publish",
  "publish:components":"pnpm --filter \"@monorepo/components\ publish"
},
// 表示只发布dist而不发布源代码
"files":[
  "dist"
],
"publishConfig": {
    "access":"public"
}
```

::: tip filter
`--filter` 选项可以指定发布哪个包
:::

::: warning 和 publishConfig.directory 的区别

- `files`: 发布时以项目根目录的 `package.json` 为准，和`files` 字段指定的文件（如 `dist`）一同打包发布，包含 `package.json`。
- `publishConfig.directory` 发布时会直接发布`dist`目录

因此`publishConfig.directory` 易出错，因 `dist` 下通常无 `package.json`。
发布的本质是发布 `package.json` + 代码，推荐用 "`files`": `["dist"]`，简单安全
:::

## 版本管理

推荐使用 `lerna` 进行版本管理，它可以帮助我们管理多个包的版本，并自动生成 `changelog`。
