# Webpack

## webpack的基础使用

本质上，webpack 是一个用于现代 JavaScript 应用程序的静态模块打包工具。当 webpack 处理应用程序时，它会在内部从一个或多个入口点构建一个 依赖图(dependency graph)，然后将你项目中所需的每一个模块组合成一个或多个 bundles，它们均为静态资源，用于展示你的内容。

### 入口起点（entry point）

入口起点(entry point) 指示 webpack 应该使用哪个模块，来作为构建其内部依赖图(dependency graph) 的开始。进入入口起点后，webpack 会找出有哪些模块和库是入口起点（直接和间接）依赖的。
入口起点的默认值是 `./src/index.js`，但你可以通过在 `webpack configuration` 中配置 `entry` 属性，来指定一个（或多个）不同的入口起点。

#### 单个入口（简写）语法

用法：`entry: string | [string]`

```js
module.exports = {
    entry: "./path/to/my/entry/file.js",
};
```

#### 对象语法

用法：`entry: {[name: string]: string | [string]}`

```js
module.exports = {
    entry: {
        app: "./src/app.js",
        adminApp: "./src/adminApp.js",
    },
};
```

### 输出（output）

输出的概念：`output` 属性告诉 webpack 在哪里输出它所创建的 `bundle`，以及如何命名这些文件。主要输出文件的默认值是 `./dist/main.js`，其他生成文件默认放置在 `./dist` 文件夹中。
输出的配置：你可以通过在配置中指定一个 `output` 字段，来配置这些处理过程。

### loader

webpack 只能理解 JavaScript 和 JSON 文件，这是 webpack 开箱可用的自带能力。loader 让 webpack 能够去处理其他类型的文件，并将它们转换为有效模块，以供应用程序使用，以及被添加到依赖图中。
当要处理什么资源的时候就下载其对应的loade并进行注册就可以了，下面会介绍几个常用的loader

#### 样式资源处理

我们以处理sass资源为例
使用命令下载loader：`npm i sass-loader sass -D`

- `sass-loader`：负责将 Sass 文件编译成 css 文件
- `sass：sass-loader` 依赖 sass 进行编译

进行配置：对于sass文件的解析需要一组loader来配合才能完成解析，所以webpack也允许你在配置中设置一组loader来完成对该类文件的解析。

```js
// 导入node路径模块处理路径
const path = require("path");
// 进行配置
module.exports = {
    module: {
        rules: [
            {
                // 用来匹配 .css 结尾的文件
                test: /\.s[ac]ss$/,
                // use 数组里面 Loader 执行顺序是从右到左
                use: ["style-loader", "css-loader", "sass-loader"],
            },
        ],
    },
};
```

::: tip 提示
在一组loader中loader 从右到左（或从下到上）地取值(evaluate)/执行(execute)。比如在上面解析sass文件的示例中，就会从 `sass-loader` 开始执行，然后继续执行 `css-loader`，最后以 `style-loader` 为结束。
:::

当然为了你能更好的管理每个loader你也可以对每个loader使用对象形式进行配置，而非数组，比如下面的css-loader中就设置了options其他配置

```js
// 导入node路径模块处理路径
const path = require("path");
// 进行配置
module.exports = {
    module: {
        rules: [
            {
                test: /\.css$/,
                use: [{ loader: "style-loader" }, { loader: "sass-loader" }],
            },
        ],
    },
};
```

::: warning 注意
请记住，使用正则表达式匹配文件时，你不要为它添加引号。也就是说，`/.txt$/` 与 `'/.txt$/'` 或 `"/.txt$/"` 不一样。前者指示 webpack 匹配任何以 .txt 结尾的文件，后者指示 webpack 匹配具有绝对路径 '.txt' 的单个文件; 这可能不符合你的意图。
:::

#### 图片资源处理

过去在 Webpack4 时，我们处理图片资源通过 `file-loader` 和 `url-loader` 进行处理
现在 Webpack5 已经将两个 Loader 功能内置到 Webpack 里了，我们只需要简单配置即可处理图片资源

```js
// 导入node路径模块处理路径
const path = require("path");
// 进行配置
module.exports = {
  module: {
    rules: [
      {
        test: /\.(png|jpe?g|gif|webp)$/,
        type: "asset",
        // 小于10kb的图片会被base64处理 优点：减少请求数量 缺点：base64后图片体积变得更大
        parser: {
          dataUrlCondition: {
            maxSize: 10 * 1024
          }
          generator: {
            // 将图片文件输出到 static/imgs 目录中
            // 将图片文件命名 [hash:8][ext][query]
            // [hash:8]: hash值取8位
            // [ext]: 使用之前的文件扩展名
            // [query]: 添加之前的query参数
            filename: "static/imgs/[hash:8][ext][query]",
          },
        }
      },
    ],
  },
};
```

此时输出的图片文件就只有两张，有一张图片以 data URI 形式内置到 js 中了 （注意：需要将上次打包生成的文件清空，再重新打包才有效果）

#### 图标资源处理

对于图标文件资源的处理，webpack已经内置了它的loader所以不需要进行下载了，其使用过程如下：
下载图标：打开阿里巴巴矢量图标库，选择想要的图标添加到购物车，统一下载到本地，
然后添加图标到项目：将下载的图标文件解压，并将文件放入src目录

- `iconfont.ttf`放入`src/fonts/`中
- `iconfont.css`放入`src/css/`中，但注意字体文件路径需要修改

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260212175551104.png)

在项目中引入图标资源，也就是`/css/iconfont.css`

```js
// 导入node路径模块处理路径
const path = require("path");
// 进行配置
module.exports = {
    module: {
        rules: [
            {
                // 检查图标资源文件
                test: /\.(ttf|woff2?)$/,
                type: "asset/resource",
                // 将打包好的字体图标文件放入dist下面的static/media目录中
                generator: {
                    filename: "static/media/[hash:8][ext][query]",
                },
            },
        ],
    },
};
```

补充：`type: "asset/resource"`和`type: "asset"`的区别： 过去在 Webpack4 时，我们处理图片资源通过 `file-loader` 和 `url-loader` 进行处理

1. `type: "asset/resource"` 表示指定使用`file-loader`, 将文件转化成 Webpack 能识别的资源，不可进行base64等处理
2. `type: "asset"` 相当指定使用`url-loader`, 将文件转化成 Webpack 能识别的资源，同时小于某个大小的资源会处理成 data URI （base64）形式

#### 其他资源处理

开发中可能还存在一些其他资源，如音视频等，我们也一起处理了

```js
// 导入node路径模块处理路径
const path = require("path");
// 进行配置
module.exports = {
    module: {
        rules: [
            {
                // 就是在处理字体图标资源基础上增加其他文件类型，统一处理即可
                test: /\.(ttf|woff2?|map4|map3|avi)$/,
                type: "asset/resource",
                generator: {
                    filename: "static/media/[hash:8][ext][query]",
                },
            },
        ],
    },
};
```

#### JS兼容性处理

有人可能会问，js 资源 Webpack 不是已经处理了吗，为什么我们还要处理呢？
原因是 Webpack 对 js 处理是有限的，只能编译 js 中 ES 模块化语法，不能编译其他语法，导致 一些低版本的浏览器是无法识别es6以上的js代码的，bable主要用于将 ES6 语法编写的代码转换为向后兼容的 JavaScript 语法，以便能够运行在当前和旧版本的浏览器或其他环境中，其使用步骤如下

1. 安装loader：`npm i babel-loader @babel/core @babel/preset-env -D`
2. 创建Babel配置文件，Bable的配置文件有多种写法，我们以 `babel.config.js` 配置文件为例：

```js
module.exports = {
    // 预设
    presets: [],
};
```

presets 预设简单理解：就是预先定义好的一组常用的用于处理某种情景的Babel 插件, 扩展 Babel 功能

- `@babel/preset-env`: 一个智能预设，允许您使用最新的 JavaScript。
- `@babel/preset-react`：一个用来编译 React jsx 语法的预设
- `@babel/preset-typescript`：一个用来编译 TypeScript 语法的预设

3. 注册Bable

```js
module.exports = {
    module: {
        rules: [
            {
                test: /\.js$/,
                // 排除node_modules代码不编译
                exclude: /node_modules/,
                // 使用Bable插件
                loader: "babel-loader",
            },
        ],
    },
};
```

#### CSS兼容性处理

1. 下载loader：`npm i postcss-loader postcss postcss-preset-env -D`
2. 进行配置：

```js
module.exports = {
    module: {
        rules: [
            {
                // 用来匹配 .css 结尾的文件
                test: /\.css$/,
                // use 数组里面 Loader 执行顺序是从右到左
                use: [
                    style.loader,
                    "css-loader",
                    {
                        loader: "postcss-loader",
                        options: {
                            postcssOptions: {
                                plugins: [
                                    "postcss-preset-env", // 能解决大多数样式兼容性问题
                                ],
                            },
                        },
                    },
                ],
            },
        ],
    },
};
```

::: tip 提示
我们可以在 package.json 文件中添加 `browserslist` 来控制样式的兼容性做到什么程度。

```js
{
  // 其他省略
  "browserslist": ["ie >= 8"]
}
```

这样，`postcss-loader` 会自动根据 `browserslist` 选择性的添加 CSS 前缀，以达到兼容性的目的。

以上为了测试兼容性所以设置兼容浏览器 ie8 以上。
实际开发中我们一般不考虑旧版本浏览器了，所以我们可以这样设置：

```js
{
  // 其他省略
  "browserslist": ["last 2 version", "> 1%", "not dead"]
}
```

:::

### 插件（plugin）

插件的概念：loader 用于转换某些类型的模块，而插件则可以用于执行范围更广的任务。包括：打包优化，资源管理，注入环境变量。
插件的使用：想要使用一个插件，你只需要 `require()` 它，然后把它添加到 `plugins` 数组中。多数插件可以通过选项(option)自定义插件行为。你也可以在一个配置文件中因为不同目的而多次使用同一个插件，这时需要通过使用 new 操作符来创建一个插件实例。

#### bundle自动注入

插件：`HtmlWebpackPlugin`
作用：`html-webpack-plugin` 为应用程序生成一个 HTML 文件，并自动将生成的所有 bundle 注入到此文件中。
常用的配置：

```js
// 导入HtmlWebpackPlugin
const HtmlWebpackPlugin = require("html-webpack-plugin");
module.exports = {
    plugins: [
        new HtmlWebpackPlugin({
            // 在进行打包时，以 public/index.html 为模板创建和html文件
            // 新的html文件有两个特点：1. 内容和源文件一致 2. 自动引入打包生成的js等资源
            template: path.resolve(__dirname, "../public/index.html"),
        }),
    ],
};
```

#### 代码格式化检查

在开发中，团队对代码格式是有严格要求的，我们不能由肉眼去检测代码格式，需要使用专业的工具来检测。针对代码格式，我们使用 Eslint 来完成
通常来说是先完成 Eslint，检测代码格式无误后，再由 Babel 做代码兼容性处理

安装命令：`npm i eslint-webpack-plugin eslint -D`
插件作用：`ESLintWebpackPlugin`该插件是可组装的 JavaScript 和 JSX 检查工具。也就是说它是用来检测 js 和 jsx 语法的工具，可以配置各项功能，我们使用 Eslint，关键是写 Eslint 配置文件，里面写上各种 rules 规则，将来运行 Eslint 时就会以写的规则对代码进行检查

我们以 `.eslintrc.js` 配置文件为例：

```js
module.exports = {
    // 解析选项
    parserOptions: {
        ecmaVersion: 6, // ES 语法版本
        sourceType: "module", // ES 模块化
        ecmaFeatures: {
            // ES 其他特性
            jsx: true, // 如果是 React 项目，就需要开启 jsx 语法
        },
    },
    // 具体检查规则
    rules: {
        semi: "error", // 禁止使用分号
        "array-callback-return": "warn", // 强制数组方法的回调函数中有 return 语句，否则警告
        "default-case": [
            "warn", // 要求 switch 语句中有 default 分支，否则警告
            { commentPattern: "^no default$" }, // 允许在最后注释 no default, 就不会有警告了
        ],
        eqeqeq: [
            "warn", // 强制使用 === 和 !==，否则警告
            "smart", // https://eslint.bootcss.com/docs/rules/eqeqeq#smart 除了少数情况下不会有警告
        ],
    },
    // 继承其他规则
    extends: [],
    // ...
    // 其他规则详见：https://eslint.bootcss.com/docs/user-guide/configuring
};
```

::: tip rule 规则

- "off" 或 0 - 关闭规则
- "warn" 或 1 - 开启规则，使用警告级别的错误：warn (不会导致程序退出)
- "error" 或 2 - 开启规则，使用错误级别的错误：error (当被触发的时候，程序会退出)

:::

::: tip extends 继承
开发中一点点写 rules 规则太费劲了，所以有更好的办法，继承现有的规则。

- Eslint 官方的规则：`eslint:recommended`
- Vue Cli 官方的规则：`plugin:vue/essential`
- React Cli 官方的规则：`react-app`

```js
// 例如在React项目中，我们可以这样写配置
module.exports = {
    extends: ["react-app"],
    rules: {
        // 我们的规则会覆盖掉react-app的规则
        // 所以想要修改规则直接改就是了
        eqeqeq: ["warn", "smart"],
    },
};
```

rules中的规则会覆盖掉所继承的规则
:::

注册eslint：在`webpack.config.js`中注册eslint插件，并指定eslint配置文件

```js
// 导入node路径模块处理路径
const path = require("path");
// 导入eslint插件
const ESLintWebpackPlugin = require("eslint-webpack-plugin");
// 进行配置
module.exports = {
    plugins: [
        // 注册插件
        new ESLintWebpackPlugin({
            // 指定打包时检查文件的根目录
            context: path.resolve(__dirname, "src"),
        }),
    ],
    mode: "development",
};
```

该插件能够在进行打包时，对文件进行ESlint规范的检查，默认对整个项目进行检查。

::: tip 和vscode的eslint插件的区别
该插件和vscode安装的eslint插件不是一样的，vscode安装的eslint插件是在编译前进行eslint检查，也就是提前进行检查避免在编译时才发现过多的问题。
:::
对于vscode的eslint插件来说，会对项目全部文件进行eslint规范检查，所以我们需要设置忽略文件来忽略对某些文件的检查。下面以忽略dist文件为例：

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260212181345109.png)

#### css文件抽取

css 文件目前被打包到 js 文件中，当 js 文件加载时，会创建一个 `style` 标签来生成样式,这样对于网站来说，会出现闪屏现象，用户体验不好
我们应该是单独的 Css 文件，通过 `link`标签加载性能才好

下载插件：`npm i mini-css-extract-plugin -D`
进行配置：

```js
// 导入插件
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
// 进行配置
module.exports = {
  {
     // 用来匹配 .css 结尾的文件
     test: /\.css$/,
     // use 数组里面 Loader 执行顺序是从右到左
     use: [MiniCssExtractPlugin.loader, "css-loader"],
  },
  plugins: [
    // 提取css成单独文件
    new MiniCssExtractPlugin({
      // 定义输出文件名和目录
      filename: "static/css/main.css",
    }),
  ],
};
```

#### css 压缩

下载命令：`npm i css-minimizer-webpack-plugin -D`
进行配置：

```js
const path = require("path");
// 导入css压缩插件
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
// 进行配置
module.exports = {
    plugins: [
        // css压缩
        new CssMinimizerPlugin(),
    ],
};
```

#### 资源复制插件

当要在页面使用网站图标.ico时，默认.ico文件不会被打包到dist目录下，这时候可以使用CopyPlugin插件来完成对该资源的复制
下载：`npm install copy-webpack-plugin --save-dev`
使用配置：

```js
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
    plugins: [
        // 注册复制静态资源插件，针对无法打包的静态资源
        new CopyPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, "../public"),
                    to: "../dist",
                    globOptions: {
                        // 忽略要复制的文件
                        ignore: ["**/index.html"],
                    },
                },
            ],
        }),
    ],
};
```

### 模式（mode）

#### 开发、生产模式的切换

我们分别准备两个配置文件来放不同的配置

```bash
├── webpack-test (项目根目录)
    ├── config (Webpack配置文件目录)
         ├── webpack.dev.js(开发模式配置文件)
         └── webpack.prod.js(生产模式配置文件)

```

#### 配置运行指令

为了方便运行不同模式的指令，我们将指令定义在 package.json 中 scripts 里面，以键值对的方式注册

```json
// package.json
{
    // 其他省略
    "scripts": {
        "start": "npm run dev",
        "dev": "npx webpack serve --config ./config/webpack.dev.js",
        "build": "npx webpack --config ./config/webpack.prod.js"
    }
}
```

以后启动指令：

- 开发模式：`npm start` 或 `npm run dev`
- 生产模式：`npm run build`

#### 配置共用

所谓的合并配置是指对于一些重复的配置可以将其封装为函数的形式，让其配置可复用

```js
// 获取处理样式的Loaders
const getStyleLoaders = (preProcessor) => {
    return [
        MiniCssExtractPlugin.loader,
        "css-loader",
        {
            loader: "postcss-loader",
            options: {
                postcssOptions: {
                    plugins: [
                        "postcss-preset-env", // 能解决大多数样式兼容性问题
                    ],
                },
            },
        },
        preProcessor,
    ].filter(Boolean);
};

module.exports = {
    module: {
        rules: [
            {
                // 用来匹配 .css 结尾的文件
                test: /\.css$/,
                // use 数组里面 Loader 执行顺序是从右到左
                use: getStyleLoaders(),
            },
            {
                test: /\.less$/,
                use: getStyleLoaders("less-loader"),
            },
            {
                test: /\.s[ac]ss$/,
                use: getStyleLoaders("sass-loader"),
            },
            {
                test: /\.styl$/,
                use: getStyleLoaders("stylus-loader"),
            },
        ],
    },
};
```

#### 合并配置

在实际情况下开发模式的配置和生产模式下的配置大致是相同的，所以我们完全可以将两个文件的配置进行合并。但是合并配置又会出现新的问题，就是webpack并不不知道哪些配置是在开发模式下使用，哪些配置是在生产模式下使用，在加载时会将这些合并后的配置一起进行加载，这显然是不行的。所以我们还需使用其它工具来完成对合并后不同模式下配置的区分，使其按模式加载。这里我们可以使用cross-env工具，这个工具会设置一个全局变量NODE_ENV，通过NODE_ENV我们就可以进行区分了
下载：`npm install --save-dev cross-env`
使用：

```json
{
    "scripts": {
        "start": "npm run dev",
        "dev": "cross-env NODE_ENV=development webpack serve --config ./config/webpack.config.js",
        "build": "cross-env NODE_ENV=production webpack --config ./config/webpack.config.js"
    }
}
```

可以看到我们在运行命令的时候就设置了环境变量NODE_ENV的值

- 当进行打包时（生产模式）：会设置`NODE_ENV=production`
- 启动服务时（开发模式）：会设置`NODE_ENV=development`
  这样我们就可以在配置中进行区分了

```js
// 导入环境变量NODE_ENV，已经在运行命令时进行设置了
const isProduction = process.env.NODE_ENV === 'production'

// 通过isProduction来区分生产模式和开发模式，生产模式下使用MiniCssExtractPlugin.loader，开发模式下使用style-loader
isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
```

## webpack的高级使用

### 提升开发体验

#### 编译代码映射源代码

在开发时我们运行的代码是经过 webpack 编译后的，例如下面这个样子：

```js
/*
 * ATTENTION: The "eval" devtool has been used (maybe by default in mode: "development").
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
/******/ (() => { // webpackBootstrap
/******/   "use strict";
/******/   var __webpack_modules__ = ({

/***/ "./node_modules/css-loader/dist/cjs.js!./node_modules/less-loader/dist/cjs.js!./src/less/index.less":
/*!**********************************************************************************************************!*\
  !*** ./node_modules/css-loader/dist/cjs.js!./node_modules/less-loader/dist/cjs.js!./src/less/index.less ***!
  \**********************************************************************************************************/
/***/ ((module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (__WEBPACK_DEFAULT_EXPORT__)\n/* harmony export */ });\n/* harmony import */ var _node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/noSourceMaps.js */ \"./node_modules/css-loader/dist/runtime/noSourceMaps.js\");\n/* harmony import */ var _node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../../node_modules/css-loader/dist/runtime/api.js */ \"./node_modules/css-loader/dist/runtime/api.js\");\n/* harmony import */ var _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(_node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1__);\n// Imports\n\n\nvar ___CSS_LOADER_EXPORT___ = _node_modules_css_loader_dist_runtime_api_js__WEBPACK_IMPORTED_MODULE_1___default()((_node_modules_css_loader_dist_runtime_noSourceMaps_js__WEBPACK_IMPORTED_MODULE_0___default()));\n// Module\n___CSS_LOADER_EXPORT___.push([module.id, \".box2 {\\n  width: 100px;\\n  height: 100px;\\n  background-color: deeppink;\\n}\\n\", \"\"]);\n// Exports\n/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (___CSS_LOADER_EXPORT___);\n\n\n//# sourceURL=webpack://webpack5/./src/less/index.less?./node_modules/css-loader/dist/cjs.js!./node_modules/less-loader/dist/cjs.js");

/***/ }),
// 其他省略
```

所有 css 和 js 合并成了一个文件，并且多了其他代码。此时如果代码运行出错那么提示代码错误位置我们是看不懂的。一旦将来开发代码文件很多，那么很难去发现错误出现在哪里。所以我们需要更加准确的错误提示，来帮助我们更好的开发代码。

SourceMap（源代码映射）是一个用来生成源代码与构建后代码相映射的文件的方案。它会生成一个 `xxx.map` 文件，里面包含源代码和构建后代码每一行、每一列的映射关系。当构建后代码出错了，会通过 `xxx.map` 文件，从构建后代码出错位置找到映射后源代码出错位置，从而让浏览器提示源代码文件出错位置，帮助我们更快的找到错误根源。

通过查看Webpack DevTool 文档可知，SourceMap 的值有很多种情况.但实际开发时我们只需要关注两种情况即可：

1. 开发模式：

```js
cheap - module - source - map;
```

- 优点：打包编译速度快，只包含行映射
- 缺点：没有列映射

```js
module.exports = {
    // 其他省略
    mode: "development",
    devtool: "cheap-module-source-map",
};
```

2. 生产模式：

```js
source - map;
```

- 优点：包含行/列映射
- 缺点：打包编译速度更慢

```js
module.exports = {
    // 其他省略
    mode: "production",
    devtool: "source-map",
};
```

#### 提升打包构建速度

##### 热模块替换

所谓的热模块替换（HotModuleReplacement）就是指在程序运行中，替换、添加或删除模块，而无需重新加载整个页面。

因为在没有进行热模块页面替换时，只要我们修改了其中一个模块代码，Webpack 默认会将所有模块全部重新打包编译，速度很慢。所以我们需要做到修改某个模块代码，就只对这个模块代码需要重新打包编译，其他模块不变，这样打包速度就能很快。使用热模块替换我们需要进行下面的步骤。

首先我们要下载开发服务器&自动化工具，因为热模块替换是针对开发服务器而言的。在不使用开发服务自动化工具之前每次写完代码都需要手动输入指令才能编译代码，太麻烦了，我们希望一切自动化

下载命令：`npm i webpack-dev-server -D`
进行配置：

```js
module.exports = {
    // 开发服务器
    devServer: {
        host: "localhost", // 启动服务器域名
        port: "3000", // 启动服务器端口号
        open: true, // 是否自动打开浏览器
    },
};
```

运行命令`npx webpack serve`就可以开启项目

注意：并且当你使用开发服务器时，所有代码都会在内存中编译打包，并不会输出到 dist 目录下。开发时我们只关心代码能运行，有效果即可，至于代码被编译成什么样子，我们并不需要知道。

但是现在我们修改一个模块后会会重新将整个项目进行打包编译，这时候我们就可以开启HMR/热模块替换，开启热模块替换十分简单，仅仅需要在此之上添加一个配置

```js
module.exports = {
    // 其他省略
    devServer: {
        host: "localhost", // 启动服务器域名
        port: "3000", // 启动服务器端口号
        open: true, // 是否自动打开浏览器
        hot: true, // 开启HMR功能（只能用于开发环境，生产环境不需要了）
    },
};
```

此时 css 样式经过 style-loader 处理，已经具备 HMR 功能了。但是 js 还不行，需要对js进行单独的配置。

```js
// main.js
import count from "./js/count";
import sum from "./js/sum";
// 引入资源，Webpack才会对其打包
import "./css/iconfont.css";
import "./css/index.css";
import "./less/index.less";
import "./sass/index.sass";
import "./sass/index.scss";
import "./styl/index.styl";

const result1 = count(2, 1);
console.log(result1);
const result2 = sum(1, 2, 3, 4);
console.log(result2);

// 判断是否支持HMR功能
if (module.hot) {
    module.hot.accept("./js/count.js", function (count) {
        const result1 = count(2, 1);
        console.log(result1);
    });

    module.hot.accept("./js/sum.js", function (sum) {
        const result2 = sum(1, 2, 3, 4);
        console.log(result2);
    });
}
```

上面这样写会很麻烦，所以实际开发我们会使用其他 loader或者插件 来解决。
比如：`vue-loader`, `react-hot-loader`，`react-refresh-webpack-plugin`。

##### OneOf

在进行打包的时候，无论文件是否匹配到对应的loader都要检查一遍所有的 loader ，这会导致打包效率低下。在配置了OneOf后，当文件遇到了对应loader，并使用该loader进行处理后，就不会再检查后面其他的loader了。比如css文件在使用对应loader处理后就不会再往后检查less这一项了

```js
module.exports = {
    module: {
        rules: [
            {
                oneOf: [
                    {
                        // 用来匹配 .css 结尾的文件
                        test: /\.css$/,
                        // use 数组里面 Loader 执行顺序是从右到左
                        use: ["style-loader", "css-loader"],
                    },
                    {
                        test: /\.less$/,
                        use: ["style-loader", "css-loader", "less-loader"],
                    },
                ],
            },
        ],
    },
};
```

##### Include/Exclude

开发时我们需要使用第三方的库或插件，所有文件都下载到 node_modules 中了。而这些文件是不需要编译可以直接使用的。所以我们在对 js 文件处理时，要排除 node_modules 下面的文件。

- `include`：包含，只处理 xxx 文件
- `exclude`：排除，除了 xxx 文件以外其他文件都处理

```js
module.exports = {
    module: {
        rules: [
            {
                oneOf: [
                    {
                        test: /\.js$/,
                        // 排除node_modules代码不编译
                        // exclude: /node_modules/,
                        // 也可以用包含只对src下的进行进行编译
                        include: path.resolve(__dirname, "../src"),
                        loader: "babel-loader",
                    },
                ],
            },
        ],
    },
};
```

##### 缓存检查和编译结果

每次打包时 js 文件都要经过 Eslint 检查 和 Babel 编译，速度比较慢。
我们可以缓存之前的 Eslint 检查 和 Babel 编译结果，这样第二次打包时速度就会更快了。
对 Eslint 检查 和 Babel 编译结果进行缓存。

```js
const path = require("path");
const ESLintWebpackPlugin = require("eslint-webpack-plugin");
module.exports = {
  module: {
    rules: [
      {
        oneOf: [
          {
            test: /\.js$/,
            // exclude: /node_modules/, // 排除node_modules代码不编译
            include: path.resolve(__dirname, "../src"), // 也可以用包含
            loader: "babel-loader",
            options: {
              cacheDirectory: true, // 开启babel编译缓存
              cacheCompression: false, // 缓存文件不要压缩
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new ESLintWebpackPlugin({
      // 指定检查文件的根目录
      context: path.resolve(__dirname, "../src"),
      exclude: "node_modules", // 默认值
      cache: true, // 开启缓存
      // 缓存目录
      cacheLocation: path.resolve(__dirname,"../node_modules/.cache/.eslintcache"),
    }),
};
```

##### 多线程打包

当项目越来越庞大时，打包速度越来越慢，甚至于需要一个下午才能打包出来代码。这个速度是比较慢的。
我们想要继续提升打包速度，其实就是要提升 js 的打包速度，因为其他文件都比较少。
而对 js 文件处理主要就是 eslint 、babel、Terser 三个工具，所以我们要提升它们的运行速度。
我们可以开启多进程同时处理 js 文件，这样速度就比之前的单进程打包更快了。

1. 首先获取 CPU 的核数，因为每个电脑都不一样。我们启动线程的数量就是我们 CPU 的核数。

```js
// nodejs核心模块，直接使用
const os = require("os");
// cpu核数
const threads = os.cpus().length;
```

2. 下载包`npm i thread-loader -D`
3. 使用

```js
const os = require("os");
const ESLintWebpackPlugin = require("eslint-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const TerserPlugin = require("terser-webpack-plugin");
// cpu核数
const threads = os.cpus().length;
module.exports = {
    module: {
        rules: [
            {
                oneOf: [
                    {
                        test: /\.js$/,
                        // exclude: /node_modules/, // 排除node_modules代码不编译
                        include: path.resolve(__dirname, "../src"), // 也可以用包含
                        use: [
                            {
                                loader: "thread-loader", // 开启多进程
                                options: {
                                    workers: threads, // 数量
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    },
    plugins: [
        new ESLintWebpackPlugin({
            // 指定检查文件的根目录
            context: path.resolve(__dirname, "../src"),
            exclude: "node_modules", // 默认值
            cache: true, // 开启缓存
            // 缓存目录
            cacheLocation: path.resolve(
                __dirname,
                "../node_modules/.cache/.eslintcache",
            ),
            threads, // 开启多进程
        }),
    ],
    optimization: {
        minimize: true,
        minimizer: [
            // css压缩也可以写到optimization.minimizer里面，效果一样的
            new CssMinimizerPlugin(),
            // 当生产模式会默认开启TerserPlugin，但是我们需要进行其他配置，就要重新写了
            new TerserPlugin({
                parallel: threads, // 开启多进程
            }),
        ],
    },
};
```

我们目前打包的内容都很少，所以因为启动进程开销原因，使用多进程打包实际上会显著的让我们打包时间变得很长。

#### 减少代码体积

##### Tree Shaking

Tree Shaking 是一个术语，通常用于描述移除 JavaScript 中的没有使用上的代码。就和其名字“树摇”一样，能够把枯枝百败叶摇下来。
开发时我们引入了一些工具函数库，或者引用第三方工具函数库或组件库。如果没有特殊处理的话我们打包时会引入整个库，但是实际上可能我们可能只用上极小部分的功能。这样将整个库都打包进来，体积就太大了。
Webpack 已经默认开启了这个功能，无需其他配置。

##### 减少Bable辅助代码

Babel 为编译的每个文件都插入了辅助代码，使代码体积过大！

Babel 对一些公共方法使用了非常小的辅助代码，比如 \_extend。默认情况下会被添加到每一个需要它的文件中。你可以将这些辅助代码作为一个独立模块，来避免重复引入。

`@babel/plugin-transform-runtime:` 禁用了 Babel 自动对每个文件的 runtime 注入，而是引入 `@babel/plugin-transform-runtime` 并且使所有辅助代码从这里引用。
下载包：`npm i @babel/plugin-transform-runtime -D`

```js
const path = require("path");
module.exports = {
    module: {
        rules: [
            {
                oneOf: [
                    {
                        test: /\.js$/,
                        // exclude: /node_modules/, // 排除node_modules代码不编译
                        include: path.resolve(__dirname, "../src"), // 也可以用包含
                        use: [
                            {
                                loader: "babel-loader",
                                options: {
                                    cacheDirectory: true, // 开启babel编译缓存
                                    cacheCompression: false, // 缓存文件不要压缩
                                    plugins: [
                                        "@babel/plugin-transform-runtime",
                                    ], // 减少代码体积
                                },
                            },
                        ],
                    },
                ],
            },
        ],
    },
};
```

##### 图片压缩

开发如果项目中引用了较多图片，那么图片体积会比较大，将来请求速度比较慢。我们可以对图片进行压缩，减少图片体积。
注意：如果项目中图片都是在线链接，那么就不需要了。本地项目静态图片才需要进行压缩。
下载插件：`npm i image-minimizer-webpack-plugin imagemin -D`
还有剩下包需要下载，有两种模式：

- 无损压缩：`npm install imagemin-gifsicle imagemin-jpegtran imagemin-optipng imagemin-svgo -D`（不太好下载需要多尝试几次）
- 有损压缩：`npm install imagemin-gifsicle imagemin-mozjpeg imagemin-pngquant imagemin-svgo -D`
  区别：有损/无损压缩的区别
  我们以无损压缩配置为例：

```js
const ImageMinimizerPlugin = require("image-minimizer-webpack-plugin");
module.exports = {
    optimization: {
        minimizer: [
            // 压缩图片
            new ImageMinimizerPlugin({
                minimizer: {
                    implementation: ImageMinimizerPlugin.imageminGenerate,
                    options: {
                        plugins: [
                            ["gifsicle", { interlaced: true }],
                            ["jpegtran", { progressive: true }],
                            ["optipng", { optimizationLevel: 5 }],
                            [
                                "svgo",
                                {
                                    plugins: [
                                        "preset-default",
                                        "prefixIds",
                                        {
                                            name: "sortAttrs",
                                            params: {
                                                xmlnsOrder: "alphabetical",
                                            },
                                        },
                                    ],
                                },
                            ],
                        ],
                    },
                },
            }),
        ],
    },
};
```
