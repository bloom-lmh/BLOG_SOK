---
order: 15
---

# os模块

## 简介

os 模块提供了一些操作系统相关的实用方法。

## 相关方法

| 函数                     | 作用                                      | 返回值示例                                                                                                                             |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `os.EOL`                 | 操作系统相关的行末标志                    | `'\n'`（Linux/macOS）<br>`'\r\n'`（Windows）                                                                                           |
| `os.arch()`              | 返回 CPU 架构                             | `'x64'`, `'arm64'`, `'ia32'`                                                                                                           |
| `os.constants`           | 返回操作系统常量（错误码、信号等）        | `{ signals: { SIGINT: 2, ... }, errno: { EACCES: 13, ... } }`                                                                          |
| `os.cpus()`              | 返回每个逻辑 CPU 核心信息                 | `[ { model: 'Intel...', speed: 2800, times: { user: 12345, idle: 67890, ... } }, ... ]`                                                |
| `os.endianness()`        | 返回字节序（大端/小端）                   | `'LE'`（小端）或 `'BE'`（大端）                                                                                                        |
| `os.freemem()`           | 返回空闲系统内存量（字节）                | `8589934592`（约 8GB）                                                                                                                 |
| `os.homedir()`           | 返回当前用户主目录                        | `'/home/user'`（Linux）<br>`'C:\\Users\\user'`（Windows）                                                                              |
| `os.hostname()`          | 返回主机名                                | `'my-computer.local'`                                                                                                                  |
| `os.loadavg()`           | 返回 1/5/15 分钟系统平均负载（Unix 系统） | `[0.15, 0.25, 0.30]`（Windows 始终为 `[0, 0, 0]`）                                                                                     |
| `os.networkInterfaces()` | 返回网络接口信息                          | `{ eth0: [{ address: '192.168.1.5', netmask: '255.255.255.0', family: 'IPv4', mac: '...', internal: false }], lo: [...] }`             |
| `os.platform()`          | 返回操作系统平台标识                      | `'linux'`, `'darwin'`, `'win32'`, `'freebsd'`                                                                                          |
| `os.release()`           | 返回操作系统发行版本号                    | `'5.15.0-101-generic'`（Linux）<br>`'19.6.0'`（macOS）<br>`'10.0.19045'`（Windows）                                                    |
| `os.tmpdir()`            | 返回默认临时目录路径                      | `'/tmp'`（Linux/macOS）<br>`'C:\\Users\\user\\AppData\\Local\\Temp'`（Windows）                                                        |
| `os.totalmem()`          | 返回系统总内存（字节）                    | `17179869184`（约 16GB）                                                                                                               |
| `os.type()`              | 返回操作系统名称（来自 `uname`）          | `'Linux'`, `'Darwin'`, `'Windows_NT'`                                                                                                  |
| `os.uptime()`            | 返回系统运行时间（秒）                    | `3600`（表示已运行 1 小时）                                                                                                            |
| `os.userInfo([options])` | 返回当前用户信息                          | `{ username: 'alice', uid: 1000, gid: 1000, shell: '/bin/bash', homedir: '/home/alice' }`（Windows 中 `uid/gid = -1`, `shell = null`） |
