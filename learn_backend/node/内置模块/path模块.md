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

## 提供平台路径分割符-delimiter

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
