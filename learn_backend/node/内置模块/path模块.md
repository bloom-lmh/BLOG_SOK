# path 模块

## 简介

`node:path` 模块提供了用于处理文件和目录路径的实用工具。可以通过以下方式访问它：

```js
const path = require('node:path');
```

## Windows 和 POSIX 下的不同行为

`node:path` 模块的默认行为会根据运行 Node.js 应用程序的操作系统而有所不同。具体来说，当在 Windows 操作系统上运行时，`node:path` 模块会假定使用的是 Windows 风格的路径。
因此，在 POSIX 和 Windows 系统上使用 `path.basename()` 可能会产生不同的结果：

::: code-group

```js [On POSIX]
path.basename('C:\\temp\\myfile.html');
// Returns: 'C:\\temp\\myfile.html'
```

```js [On Windows]
path.basename('C:\\temp\\myfile.html');
// Returns: 'myfile.html'
```

:::

> 这会造成一些问题：比如你正在 macOS 上开发一个工具，但这个工具要处理 Windows 风格的路径字符串，而 path.basename(winPath);返回: 'C:\\Users\\Alice\\document.txt'，这会导致你的工具在 macOS 上运行时无法正确处理路径。

为了在任何操作系统上处理 Windows 文件路径时获得一致的结果，请使用 `path.win32`：

```js
path.win32.basename('C:\\temp\\myfile.html');
// Returns: 'myfile.html'
```

为了在任何操作系统上处理 POSIX 文件路径时获得一致的结果，请使用 `path.posix`：

```js
path.posix.basename('/tmp/myfile.html');
// Returns: 'myfile.html'
```

## 获取文件名-basename

| 功能                                                                                       | 参数                                                                                        | 返回值                    |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------- |
| 返回路径的最后一个部分（文件名），类似于 Unix 的 basename 命令，末尾的目录分隔符将被忽略。 | 1. **path** `<string>` - 要处理的文件路径<br>2. **suffix** `<string>` (可选) - 要移除的后缀 | `<string>` 处理后的文件名 |

```js
path.basename('/foo/bar/baz/asdf/quux.html');
// Returns: 'quux.html'

path.basename('/foo/bar/baz/asdf/quux.html', '.html');
// Returns: 'quux'
```

::: warning basename 区分大小写

尽管 Windows 通常以不区分大小写的方式处理文件名（包括文件扩展名），但此函数并非如此。例如，`C:\\foo.html` 和 `C:\\foo.HTML` 指向同一个文件，但 `basename` 函数会严格区分大小写的字符串：

```js
path.win32.basename('C:\\foo.html', '.html');
// Returns: 'foo'

path.win32.basename('C:\\foo.HTML', '.html');
// Returns: 'foo.HTML'
```

:::

如果 path 不是字符串，或者提供了 suffix 但其不是字符串，则会抛出一个 TypeError

## 提供平台多个路径分割符-delimiter

| 功能                     | 返回值                                                                |
| ------------------------ | --------------------------------------------------------------------- |
| 返回当前平台的路径分隔符 | windows 平台上返回的路径分割符为`;` posix 平台上返回的路径分割符为`:` |

::: code-group

```js [On Windows]
console.log(process.env.PATH);
// Prints: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin'

process.env.PATH.split(path.delimiter);
// Returns: ['/usr/bin', '/bin', '/usr/sbin', '/sbin', '/usr/local/bin']
```

```js [On POSIX]
console.log(process.env.PATH);
// Prints: 'C:\Windows\system32;C:\Windows;C:\Program Files\node\'

process.env.PATH.split(path.delimiter);
// Returns ['C:\\Windows\\system32', 'C:\\Windows', 'C:\\Program Files\\node\\']
```

:::

## 获取目录名-dirname

| 功能                                                                    | 参数                                   | 返回值              |
| ----------------------------------------------------------------------- | -------------------------------------- | ------------------- |
| 返回路径的目录名，类似于 Unix 的 dirname 命令。尾部的目录分隔符会被忽略 | **path** `<string>` - 要处理的文件路径 | `<string>` 目录路径 |

```js
path.dirname('/foo/bar/baz/asdf/quux');
// Returns: '/foo/bar/baz/asdf'
```

## 获取文件扩展名-extname

| 功能                                                                                                                                                                          | 参数                                   | 返回值                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------- |
| 返回路径的扩展名，从路径最后一个部分的最后一个`.`（点）字符开始到字符串末尾。如果路径的最后一部分中没有`.`，或者除了路径的基本名称的第一个字符之外没有`.`字符，则返回空字符串 | **path** `<string>` - 要处理的文件路径 | `<string>` 扩展名（包含点）或空字符串 |

```js
path.extname('index.html');
// Returns: '.html'

path.extname('index.coffee.md');
// Returns: '.md'

path.extname('index.');
// Returns: '.'

path.extname('index');
// Returns: ''

path.extname('.index');
// Returns: ''

path.extname('.index.md');
// Returns: '.md'
```

## 格式化路径对象-format

这个方法将会将一个路径对象转换为路径字符串。它相当于是 `path.parse()` 方法的逆操作。这个对象含有如下属性：

```js
{
  dir:'目录名',
  base:'文件名',
  name:'文件名（不含目录和扩展名）',
  ext:'文件扩展名',
  root:'根目录'
}
```

这些属性都有优先级，即某些属性出现时其它一些属性会被忽略

- 如果 `dir` 存在，则 `root` 会被忽略
- 如果 `base` 存在，则 `name` 和 `ext` 会被忽略

如下所示：

```js
// If `dir`, `root` and `base` are provided,
// `${dir}${path.sep}${base}`
// will be returned. `root` is ignored.
path.format({
  root: '/ignored',
  dir: '/home/user/dir',
  base: 'file.txt',
});
// Returns: '/home/user/dir/file.txt'

// `root` will be used if `dir` is not specified.
// If only `root` is provided or `dir` is equal to `root` then the
// platform separator will not be included. `ext` will be ignored.
path.format({
  root: '/',
  base: 'file.txt',
  ext: 'ignored',
});
// Returns: '/file.txt'

// `name` + `ext` will be used if `base` is not specified.
path.format({
  root: '/',
  name: 'file',
  ext: '.txt',
});
// Returns: '/file.txt'

// The dot will be added if it is not specified in `ext`.
path.format({
  root: '/',
  name: 'file',
  ext: 'txt',
});
// Returns: '/file.txt'
```

## 路径模式匹配-matchesGlob

| 功能                             | 参数                                                                                    | 返回值                       |
| -------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------- |
| 判断路径是否匹配指定的 glob 模式 | 1. **path** `<string>` - 要匹配的路径<br>2. **pattern** `<string>` - 要检查的 glob 模式 | `<boolean>` 路径是否匹配模式 |

```js
path.matchesGlob('/foo/bar', '/foo/*'); // true
path.matchesGlob('/foo/bar*', 'foo/bird'); // false
```

::: tip 常见的 glob 模式
`glob` 模式（也称通配符模式）是一种用于匹配文件路径或字符串的简单模式匹配语法，常用于命令行工具（如 Unix shell、Windows CMD/PowerShell）以及各种编程语言（如 Python 的 `glob` 模块）中。

| 通配符               | 含义                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `*`                  | 匹配任意数量（包括零个）的任意字符（不包括路径分隔符 `/` 或 `\`） |
| `?`                  | 匹配任意单个字符                                                  |
| `[abc]`              | 匹配方括号内的任意一个字符（例如 `a`、`b` 或 `c`）                |
| `[a-z]`              | 匹配指定范围内的任意一个字符（例如小写字母 a 到 z）               |
| `[!abc]` 或 `[^abc]` | 匹配**不在**方括号中的任意一个字符                                |

:::

## 是否绝对路径-isAbsolute

| 功能                         | 参数                               | 返回值                         |
| ---------------------------- | ---------------------------------- | ------------------------------ |
| 判断给定路径是否为绝对路径。 | **path** `<string>` - 要检查的路径 | `<boolean>` 路径是否为绝对路径 |

::: warning 注意
此方法仅检查路径字面量是否为绝对路径，因此不能安全用于防范路径遍历攻击。如果给定的路径是零长度字符串，将返回 false
:::

::: code-group

```js [On POSIX]
path.isAbsolute('/foo/bar'); // true
path.isAbsolute('/baz/..'); // true
path.isAbsolute('/baz/../..'); // true
path.isAbsolute('qux/'); // false
path.isAbsolute('.'); // false
```

```js [On Windows]
path.isAbsolute('//server'); // true
path.isAbsolute('\\\\server'); // true
path.isAbsolute('C:/foo/..'); // true
path.isAbsolute('C:\\foo\\..'); // true
path.isAbsolute('bar\\baz'); // false
path.isAbsolute('bar/baz'); // false
path.isAbsolute('.'); // false
```

:::

::: tip 关于什么是绝对路径

- POSIX 系统：以 `/` 开头
- Windows 系统：通常以盘符 + 冒号 + 反斜杠开头

:::

## 路径片段拼接-join

| 功能                                                                               | 参数                                   | 返回值                        |
| ---------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------- |
| 使用平台特定的分隔符作为定界符将所有给定的路径片段连接在一起，然后规范化生成的路径 | **...paths** `<string>` - 路径片段序列 | `<string>` 连接后的规范化路径 |

::: warning 注意
零长度的路径段将被忽略。如果拼接后的路径字符串为空（即长度为零），则返回 '.'，表示当前工作目录
:::

```js
path.join('/foo', 'bar', 'baz/asdf', 'quux', '..');
// Returns: '/foo/bar/baz/asdf'

path.join('foo', {}, 'bar');
// Throws 'TypeError: Path must be a string. Received {}'
```

可以看到`..`表示上级目录，会对前面已经拼接的路径产生作用

## 标准化路径-normalize

| 功能                                      | 参数                                 | 返回值                    |
| ----------------------------------------- | ------------------------------------ | ------------------------- |
| 规范化给定的路径，并解析 '..' 和 '.' 片段 | **path** `<string>` - 要规范化的路径 | `<string>` 规范化后的路径 |

当发现多个连续的路径段分隔符时（例如，在 POSIX 系统上为 /，在 Windows 上为 \ 或 /），它们会被替换为单个平台特定的路径段分隔符（POSIX 上为 /，Windows 上为 \）。结尾的分隔符将被保留。比如：

```js
path.win32.normalize('C:////temp\\\\/\\/\\/foo/bar');
// Returns: 'C:\\temp\\foo\\bar'
```

在 POSIX 系统上，此函数所应用的规范化操作并不严格遵循 POSIX 规范。例如，该函数会将开头的两个正斜杠 `//` 替换为单个斜杠 `/`，将其视为普通的绝对路径；然而，某些 POSIX 系统对以恰好两个正斜杠开头的路径赋予了特殊含义。同样，此函数执行的其他替换操作（例如移除 `..` 段）可能会改变底层系统对路径的解析方式。

::: code-group

```js [On POSIX]
path.normalize('/foo/bar//baz/asdf/quux/..');
// Returns: '/foo/bar/baz/asdf'
```

```js [On Windows]
path.normalize('C:\\temp\\\\foo\\bar\\..\\');
// Returns: 'C:\\temp\\foo\\'
```

:::

如果路径为空字符串（长度为零），则返回 '.'，表示当前工作目录。

## 路径解析-parse

| 功能                                                             | 参数                               | 返回值                        |
| ---------------------------------------------------------------- | ---------------------------------- | ----------------------------- |
| 返回一个对象，其属性表示路径的重要元素。尾部的目录分隔符会被忽略 | **path** `<string>` - 要解析的路径 | `<Object>` 包含路径元素的对象 |

其路径对象如下：

```js
{
  dir:'目录名',
  base:'文件名',
  name:'文件名（不含目录和扩展名）',
  ext:'文件扩展名',
  root:'根目录'
}
```

::: code-group

```js [On POSIX]
path.parse('/home/user/dir/file.txt');
// Returns:
// { root: '/',
//   dir: '/home/user/dir',
//   base: 'file.txt',
//   ext: '.txt',
//   name: 'file' }
```

```js [On Windows]
path.parse('C:\\path\\dir\\file.txt');
// Returns:
// { root: 'C:\\',
//   dir: 'C:\\path\\dir',
//   base: 'file.txt',
//   ext: '.txt',
//   name: 'file' }
```

:::

## 两个路径的相对路径-relative

| 功能                                                                                                                                         | 参数                                                                 | 返回值              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------- |
| 根据当前工作目录返回从 from 到 to 的相对路径。如果 from 和 to 各自解析为相同的路径（在每个路径上调用 path.resolve() 后），则返回零长度字符串 | 1. **from** `<string>` - 起始路径<br>2. **to** `<string>` - 目标路径 | `<string>` 相对路径 |

如果传入的 from 或 to 为零长度字符串，则将使用当前工作目录来代替该零长度字符串。

::: tip 理解
其实很好理解就是 from 怎么样才能到 to
:::

::: code-group

```js [On POSIX]
path.relative('/data/orandea/test/aaa', '/data/orandea/impl/bbb');
// Returns: '../../impl/bbb'
```

```js [On Windows]
path.relative('C:\\orandea\\test\\aaa', 'C:\\orandea\\impl\\bbb');
// Returns: '..\\..\\impl\\bbb'
```

:::

## 拼接路径片段为绝对路径-resolve

| 功能                                 | 参数                                         | 返回值                      |
| ------------------------------------ | -------------------------------------------- | --------------------------- |
| 将一系列路径或路径片段解析为绝对路径 | **...paths** `<string>` - 路径或路径片段序列 | `<string>` 解析后的绝对路径 |

有以下的规则：

1. 给定的路径序列从右向左进行处理，依次将每个后续路径前置拼接，直到构造出一个绝对路径。
2. 如果在处理完所有给定的路径段之后仍未生成绝对路径，则使用当前工作目录。
3. 生成的路径会被规范化，并移除末尾的斜杠，除非该路径解析为根目录。
4. 长度为零的路径段将被忽略。
5. 如果没有传入任何路径段，`path.resolve()` 将返回当前工作目录的绝对路径。

```js
const result1 = path.resolve('foo', '/bar', 'zar');
console.log(result1); // E:\bar\zar \bar\zar已经构成了绝对路径

const result2 = path.resolve('foo', 'bar', 'zar');
console.log(result2); // E:\learn_frontend\NodeJS\foo\bar\zar 由于没有拼接为绝对路径，所以使用工作目录来进行拼接

const result3 = path.resolve('////bar', 'zar');
console.log(result3); // E:\bar\zar 会进行规范化
```

::: tip 理解
`resolve`就是用来将路径片段拼接为绝对路径的，当拼接为绝对路径后就会停止拼接，并且对于拼接的路径会进行标准化
:::

## 提供平台单个路径分割符-sep

提供平台具体的路径分割符

- `\` on Windows
- `/` on POSIX

在 Windows 上，正斜杠（`/`）和反斜杠（`\`）均可作为路径段分隔符使用；然而，路径相关的方法仅会添加反斜杠（`\`）。

##

| 功能                                                                                               | 参数                               | 返回值                      |
| -------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------- |
| 仅在 Windows 系统上，返回给定路径的等效命名空间前缀路径。如果 path 不是字符串，将返回未修改的 path | **path** `<string>` - 要转换的路径 | `<string>` 命名空间前缀路径 |

::: warning 注意和 delimeter 的区别
这个方法返回的是分割单个路径的路径分割符而`delimeter`返回的是分隔多个路径的路径分割符
:::

## 平台相关性方法-win32 和 posix

- `path.posix`：返回一个只包含 POSIX 平台相关的路径方法的对象。
- `path.win32`：返回一个只包含 Windows 平台相关的路径方法的对象。
