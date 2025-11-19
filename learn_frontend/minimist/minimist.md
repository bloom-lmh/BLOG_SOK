# Minimist

## 介绍

minimist 是一个解析命令行参数的库，它可以将命令行参数解析成一个对象。

## 起步

### 安装

```bash
npm install minimist
```

### 基本使用

`minimist`是一个函数它接收两个参数：

1. `args`：一个数组，包含了命令行参数（也就是`process.argv.slice(2)`）。
2. `opts`：一个对象，包含了选项参数的配置。，调用它解析命令行参数，并返回一个`argv`对象。

```javascript
// CommonJS
const minimist = require('minimist');
const argv = minimist(process.argv.slice(2), {});

// ES Module
import minimist from 'minimist';
const argv = minimist(process.argv.slice(2), {});
```

## process.argv

`process.argv`是一个数组，包含了 Node.js 进程启动时传入的所有命令行参数。比如执行`node ./scripts/dev.js "--input" "data.txt" "--output" "result.txt" "--force"`，`process.argv`的值如下：

```json
[
  "C:\\nvm4w\\nodejs\\node.exe",
  "E:\\dev_frontend\\ElfUI\\scripts\\dev.js",
  "--input",
  "data.txt",
  "--output",
  "result.txt",
  "--force"
]
```

1. 第一个元素是 Node.js 进程的可执行文件的路径。
2. 第二个元素是 Node.js 所执行脚本的路径。
3. 后续剩余的元素是命令行参数。

## minimist 函数解析规则

`minimist` 函数会按照如下规则解析第一个命令行参数`args`：

### 选项类型

`minimist`支持两种选项类型：

1. 单字符选项：短横线（`-`）开头的参数名表示一个单字符选项，比如`-a`表示`-a`选项
2. 长选项：两个短横线（`--`）开头的参数名表示一个长选项。比如`--foo`表示`--foo`选项

::: tip 单字符选项合并规则
多个短横线开头的参数名可以合并成一个长选项。比如:

1. `-abc`可以表示`-a -b -c`选项，`-abc --foo-bar`可以表示`-a -b -c --foo-bar`选项。
2. `-abc=123`可以表示`-a -b -c`其中`-c`选项的值为`123`，`-abc --foo-bar=456`可以表示`-a -b -c --foo-bar`选项的值为`456`。

:::

### 选项参数

1. 参数形式：选项参数可以跟在选项名后面，或跟在等号后面。比如`-a 123`表示`-a`选项的参数为`123`，`-b=456`表示`-b`选项的参数为`456`。
2. 参数值类型：选项参数可以是一个字符串，也可以是一个布尔值。对于布尔值的选项，如果没有指定参数，则默认为`true`。比如`-a`表示`-a`选项的参数为`true`，`-b`表示`-b`选项的参数为`true`。
3. 否定参数：选项参数前面可以加`no-`前缀表示否定参数。比如`--no-foo`表示`--foo`选项的参数为`false`。

对于这些参数，`minimist`函数会将它们解析成一个对象，并以键值对的形式出现。比如：

```bash
node./scripts/dev.js -a 123 -b 456 --foo bar --no-baz
```

解析结果：

```json
{
  "a": 123,
  "b": 456,
  "foo": "bar",
  "baz": false
}
```

### 非选项参数

对于没有破折号开头的参数，`minimist`函数会将它们视为非选项参数，并将它们组成一个数组，放到`_`键对应的数组中。比如：

```bash
node./scripts/dev.js 1 2 3
```

解析结果：

```json
{
  "_": ["1", "2", "3"]
}
```

## 选项配置

`minimist`函数的第二个参数`opts`是一个对象，它可以用来配置选项参数的解析规则。

### `opts.string`

声明哪些选项参数的值类型为字符串，`minimist` 尽可能尝试将其转换成字符串类型。

```javascript
const argv = require('minimist')(process.argv.slice(2), {
  string: ['port', 'host'], // 确保这些参数作为字符串
});

// 命令行：node app.js --port 8080
console.log(typeof argv.port); // "8080" (不是 number)
```

### `opts.boolean`

声明哪些选项参数的值类型为布尔值，`minimist` 尽可能尝试将其转换成布尔值类型。

```javascript
const argv = require('minimist')(process.argv.slice(2), {
  boolean: ['verbose', 'force'], // 确保这些参数作为布尔值
});

// 命令行：node app.js --verbose a --force 1
console.log(typeof argv.verbose); // "boolean" (不是 string)=>true
console.log(typeof argv.force); // "boolean" (不是 string) => true
```

### `opts.alias`

声明选项参数的别名，比如`--foo`选项的别名可以是`-f`，这样可以简化命令行输入。

```javascript
const argv = require('minimist')(process.argv.slice(2), {
  alias: {
    f: 'foo',
    b: 'bar',
  },
});

// 命令行：node app.js -f 123 -b 456
console.log(argv.foo); // 123
console.log(argv.bar); // 456
```

### `opts.default`

声明选项参数的默认值，如果没有指定该选项参数的值，则使用默认值。

```javascript
const argv = require('minimist')(process.argv.slice(2), {
  default: {
    port: 8080,
    host: 'localhost',
  },
});

// 命令行：node app.js
console.log(argv.port); // 8080
console.log(argv.host); // "localhost"
```

### `opts.stopEarly`

### `opts.unknown`

### -- 分割选项

<!-- ### -- 分割选项

对于`--` 后面的所有内容都会放到`--`键对应的数组中。比如：

```bash
# -- 后面的所有内容都特殊处理
node app.js --name John -- file1.txt --force file2.txt
```

解析结果：

```json
{
  "_": ["file1.txt", "file2.txt"],
  "name": "John",
  "force": true
} -->
