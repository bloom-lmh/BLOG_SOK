---
order: 100
---

# CSS 性能优化

[[toc]]

## :star: 优化思路综述

想要实现 css 优化，有下面几点思路：

1. 首屏关键 css 内联：减少网络开销
2. 非关键 CSS 异步加载：要比预解析线程还要提前的对 css 资源进行异步加载,否则体现不出优化效果
   - 通过 rel 设置为 `preload` 或 `alternate`
   - 通过 media 设置为`noexit`或 `print` 等非当前设备类型对应的 css 资源
3. 加快 css 等文件资源的传输
   - 压缩 css 文件（打包工具）
   - 采用精灵图
   - 对小图片采用 base64
4. 提高网络层面效率
   - DNS 预解析：`rel = "dns-prefetch"`
   - 预先建立 TCP 链接+DNS 预解析：`rel = "preconnect"`
5. 从浏览器渲染原理的角度
   - 多使用合成线程来完成动画处理，调用 GPU 加速
   - 减少重排和重绘
   - 将易变元素提高到单独图层
6. 从 css 解析的角度：减少 css 样式嵌套

## 内联首屏关键 CSS

页面重要内容的渲染实现影响着用户体验。所以为了加快首屏渲染实现，对于一些样式采用内联
关于为什么内联 CSS 能够提高首屏的渲染效率，原因如下：

1. 浏览器接受到 HTML 文件
2. 预解析线程开始快速扫描 HTML，异步下载资源
3. 主渲染线程开始解析 HTML 文件为 DOM 树
   - 遇到内联 CSS 直接开始解析 CSS 为 CSSOM 树（CSSOM 构建会抢占优先级）
   - 遇到 link 外联的 CSS 文件
     - 若下载完毕，则继续解析 CSSOM 树
     - 若没有下载完成，会暂停解析 CSSOM 树继续解析 HTML 为 DOM 树
4. 最终构建出 DOM 树和 CSSOM 树
5. 合并 DOM 树和 CSSOM 树为渲染树

所以如果 link 对应的 css 文件没有下载下来不会阻塞 DOM 树的构建但是会阻塞 CSSOM 树的构建，进而影响渲染树的构建，从而影响首屏渲染。为了提高首屏渲染效率，我们可以将关键样式内联，从而减少在网络的时间损耗

## 异步加载非关键 CSS 资源

::: tip :star: 预加载扫描器

在讲下面几种方式的时候需要先了解预加载扫描器,因为我们会问为什么有了预加载扫描器后还需要这几种方式来触发异步加载资源。
首先来看预加载扫描器的缺点：

- 仅扫描静态 HTML​：无法处理动态插入的`<link>`（如通过 document.createElement）
- ​ 滞后约 1-3 个 Token​：主线程解析到`<link>`时，预解析线程可能尚未扫描到该位置

其次再来看预加载器的优先级：

- ​ 默认优先级限制 ​：普通`<link rel="stylesheet">`仅获 Medium 优先级
- preload 强制提升至 Highest 优先级

当主线程解析到`<link rel="preload">`时：

- 立即暂停预解析线程当前任务
- 优先调度网络线程下载该资源
- 资源下载完成后，​ 不阻塞渲染 ​（除非是显式渲染阻塞资源）

**总结：下面的方案都是通过主线程来开启高优先级的异步资源加载，优化点就在于主线程会比预解析线程更快的开启异步资源加载**
:::

### 设置 link 标签的 rel 属性

#### rel 属性设置为 preload

作用 ​：强制浏览器提前加载高优先级资源(如首屏 CSS/JS/字体),不阻塞渲染但提前获取内容。
具体使用：

```html
<!-- 预加载关键CSS -->
<link rel="preload" href="critical.css" as="style" onload="this.rel='stylesheet'" />

<!-- 预加载JS（异步执行） -->
<link rel="preload" href="main.js" as="script" onload="this.onload=null;this.rel='preload'" />
```

#### rel 属性设置为 alternate

alternate 会将样式伪装成备用样式表，对它的加载不会阻塞主线程，而是异步下载，加载后切换为正式样式表即可

```html
<link rel="alternate stylesheet" href="styles.css" onload="this.rel='stylesheet'" />

<!-- JS实现 -->
<script>
  const link = document.createElement('link');
  link.rel = 'alternate stylesheet';
  link.href = 'styles.css';
  link.onload = () => (link.rel = 'stylesheet');
  document.head.appendChild(link);
</script>
```

### 设置媒体查询值 media

设置媒体查询值为其它设备类型，浏览器会认为当前样式不适合改设备，会在不阻塞页面的情况下进行下载（当然优先级很低）。只需要加载完后，将 media 的值设置为 `screen` 或 `all` 即可，从而让浏览器开始解析 css。一般来说将 media 值设为`noexis`比较好
具体实现如下：

```html
<!-- HTML中直接声明 -->
<link rel="stylesheet" href="styles.css" media="noexis" onload="this.media='all'" />

<!-- 或JS动态处理 -->
<script>
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'styles.css';
  link.media = 'noexis';
  // 资源下载后恢复媒体类型
  link.onload = () => (link.media = 'all');
  document.head.appendChild(link);
</script>
```

::: warning 恢复媒体类型
必须添加 onload 事件恢复媒体类型为 all 或 screen，否则浏览器不会将样式应用到屏幕显示
:::

## 加快资源加载速度

### dns-prefetch（DNS 预解析）

作用 ​：提前解析第三方资源的域名 DNS，消除 DNS 查询延迟。

```html
<!-- 预解析CDN域名 -->
<link rel="dns-prefetch" href="https://cdn.example.com" />
```

::: warning 注意
对同域资源无效（浏览器已缓存 DNS），适合谷歌字体、统计分析等第三方域名
:::

### preconnect（预连接）

作用 ​：提前完成 DNS 解析 + TCP 握手 + TLS 协商（全链路优化），比 dns-prefetch 更彻底。
适用场景 ​：

```html
<!-- 预连接API服务器 -->
<link rel="preconnect" href="https://api.example.com" crossorigin />
```

## 减少动态导入@import 的使用

css 样式文件有两种引入方式，一种是`Link`元素，另一种是`@import`

- 每个`@import`都会导致解析-下载-解析的串行链式反应
- 浏览器必须等待每个`@import`文件完全下载并解析后，才能继续处理父文件

## 减少 CSS 文件大小

利用 `webpack、vite、rollup` 等模块化工具，将 css 代码进行压缩，使文件变小，大大降低了浏览器的加载时间

## 优化 CSS 选择器

css 匹配的规则是从右往左开始匹配，例如`#markdown.content h3`匹配规则如下：

- 先找到 `h3` 标签元素
- 然后去除祖先不是`.content` 的`h3` 标签元素
- 最后去除祖先不是`#markdown` 的`h3` 标签元素

如果嵌套的层级更多，页面中的元素更多，那么匹配所要花费的时间代价自然更高。所以我们在编写选择器的时候，可以遵循以下规则：

- 不要嵌套使用过多复杂选择器，最好不要三层以上
- 使用 `id`选择器就没必要再进行嵌套
- `·`通配符和属性选择器效率最低，避免使用

## 减少重排和重绘

尽量使用 transform 等在合成线程中作用的动画，避免重排重绘
具体去看 [重排重绘章节](/learn_frontend/browser/browser基础/重排和重绘)

## 图片资源优化

1. 采用精灵图：减少 HTTP 请求
2. 把 icon 等小图片转换为 base64 编码
