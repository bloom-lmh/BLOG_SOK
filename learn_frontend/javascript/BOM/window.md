---
order: 145
---

# BOM-windows

[[toc]]

## 尺寸

以下是分开整理的表格，分别展示 **窗口尺寸**、**屏幕尺寸** 和 **文档尺寸** 的获取方法：

### 屏幕尺寸

![屏幕](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614150818189.png)
| **属性/方法** | **描述** | **是否受多屏影响** | **示例** |
| ----------------------------------- | ------------------------------------------ | -------------------- | --------------------------------- |
| `screen.width` / `screen.height` | 获取显示器的物理分辨率（单位为设备像素）。 | ✅（多屏可能为负值） | `console.log(screen.width);` |
| `screen.availWidth` / `availHeight` | 获取屏幕可用区域（排除任务栏等系统 UI）。 | ✅ | `console.log(screen.availWidth);` |

### 窗口尺寸

![窗口](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614150839751.png)
| **属性/方法** | **描述** | **是否包含滚动条** | **示例** |
| ----------------------------------- | ----------------------------------------------------------- | ------------------ | --------------------------------- |
| `window.outerWidth` / `outerHeight` | 获取整个浏览器窗口的尺寸（包括地址栏、工具栏等浏览器 UI）。 | ✅ | `console.log(window.outerWidth);` |

### 视口尺寸

![视口](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614150854952.png)
视口坐标需要知道滚动条位置才可以进行计算，有以下几种方式获取滚动位置
| 属性 | 含义 | 包含内容 |
|------------------------|------------|--------|
| `window.innerWidth` | 视口尺寸 | 视口宽度，包括滚动条（不常用） |
| `document.documentElement.clientWidth` |视口尺寸|视口宽度不包含滚动条 |

### 文档尺寸

![视图与文档所包含的区域](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614150918166.png)
| **属性/方法** | **描述** | **是否包含滚动区域** | **是否包含边框/内边距** | **是否包含滚动条** |
| -------------------------------------- | ------------------------------------------------------------------------ | -------------------- | ----------------------- | ------------------ |
| `document.documentElement.scrollWidth` | 获取文档根元素（`<html>`）的实际内容宽度（包括超出视口的部分）。 | ✅ | ❌ | ❌ |
| `document.documentElement.clientWidth` | 获取视口可见宽度（不包括滚动条，但受 `box-sizing` 影响）。 | ❌ | ✅（仅内容+内边距） | ❌ |
| `document.documentElement.offsetWidth` | 获取文档根元素的布局宽度（包括内容+内边距+边框+垂直滚动条）。 | ❌（仅当前布局宽度） | ✅ | ✅ |
| `document.body.scrollWidth` | 获取 `<body>` 元素的实际内容宽度（历史遗留方法，可能受样式影响不准确）。 | ✅ | ❌ | ❌ |

### 元素尺寸

元素在页面中拥有多个描述几何数值的尺寸，下面截图进行了形象的描述。

| 属性                     | 含义     | 包含内容                                            |
| ------------------------ | -------- | --------------------------------------------------- |
| `element.offsetWidth`    | 视觉尺寸 | content + padding + border + scrollbar              |
| `element.clientWidth`    | 可用尺寸 | content + padding（行元素尺寸为 0，且不包含滚动条） |
| `element.scrollWidth`    | 内容尺寸 | content + padding + 溢出部分 + scrollbar            |
| `element.clientLeft/top` | 边框尺寸 | boder-left/top （若滚动条在左侧则包含滚动条宽度）   |

::: tip 文档尺寸
可以看到文档就是最大的元素 documentElement ，文档尺寸就是用上面的方法来获取的
:::

## 坐标

### 元素坐标

| 属性                      | 描述                                                                                      | 计算基准                          |
| ------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------- |
| `getBoundingClientRect()` | 返回元素在视口坐标及元素大小，不包括外边距，width/height 与 offsetWidth/offsetHeight 匹配 | 窗口坐标                          |
| `element.offsetLeft`      | 元素相对于祖先元素的 X 轴坐标                                                             | 基于 `offsetParent` 的定位        |
| `element.offsetTop`       | 元素相对于祖先元素的 Y 轴坐标                                                             | 同上，注意祖先的 `transform` 影响 |

### 坐标点元素

- element.elementsFromPoint 返回指定坐标点上的元素集合
- element.elementFromPoint 返回指定坐标点最底层的元素

:::code-group

```html [element.elementsFromPoint]
<style>
  div {
    width: 200px;
    height: 200px;
  }
</style>
<div></div>
<script>
  const info = document.elementsFromPoint(100, 100);
  console.log(info);
</script>
```

```html [element.elementFromPoint ]
<style>
  div {
    width: 200px;
    height: 200px;
  }
</style>
<div></div>
<script>
  const info = document.elementFromPoint(100, 100);
  console.log(info);
</script>
```

:::

## 滚动

### 元素滚动距离

| 属性/方法            | 类型 | 备注                 |
| -------------------- | ---- | -------------------- |
| `element.scrollLeft` | 属性 | 水平滚动条已滚动距离 |
| `element.scrollTop`  | 属性 | 垂直滚动条已滚动距离 |

### scrollBy

使用 scrollBy 滚动文档：每次会在上一次的基础上相加
behavior:smooth 为平滑滚动

```html
<style>
  body {
    height: 3000px;
    width: 3000px;
    overflow-x: scroll;
  }
</style>

<script type="module">
  setInterval(() => {
    document.documentElement.scrollBy({ left: 10, top: 30, behavior: 'smooth' });
  }, 100);
</script>
```

### scroll

使用 scroll 滚动到指定位置

```html
<style>
  body {
    height: 3000px;
  }
</style>

<script type="module">
  setTimeout(() => {
    document.documentElement.scroll({ top: 30, behavior: 'smooth' });
  }, 1000);
</script>
```

### scrollIntoView

options（可选 - 对象形式）

- behavior（可选）：滚动行为，可选 "smooth"（平滑滚动）或 "auto"（立即滚动，默认值）。
- block（可选）：垂直方向的对齐方式，可选 "start"（顶部对齐）、"center"（居中）、"end"（底部对齐）或 "nearest"（最近边缘，默认值）。
- inline（可选）：水平方向的对齐方式，可选 "start"、"center"、"end" 或 "nearest"（默认值）。

alignToTop（旧版 - 布尔值）

- true：元素顶部与视口顶部对齐（相当于 {block: "start"}）。
- false：元素底部与视口底部对齐（相当于 {block: "end"}）。

```html
<style>
  div {
    height: 2000px;
    background: red;
    border-top: solid 50px #efbc0f;
    border-bottom: solid 50px #1bb491;
  }
  span {
    border-radius: 50%;
    color: #fff;
    background: #000;
    width: 50px;
    height: 50px;
    display: block;
    text-align: center;
    line-height: 50px;
    position: fixed;
    top: 50%;
    right: 50px;
    border: solid 2px #ddd;
  }
</style>
<div id="app">hdcms.com</div>
<span>TOP</span>

<script>
  document.querySelector('span').addEventListener('click', () => {
    let app = document.querySelector('#app');
    app.scrollIntoView({ block: 'end', behavior: 'smooth' });
  });
</script>
```

## 相对元素

| **属性/方法**              | **说明**                                           | **特殊情况**                               |
| -------------------------- | -------------------------------------------------- | ------------------------------------------ |
| `element.getClientRects()` | 返回行级元素每行尺寸和位置组成的数组               | -                                          |
| `element.offsetParent`     | 返回拥有定位属性的父级，或`body`/`td`/`th`/`table` | 对于隐藏元素、`body`或`html`元素返回`null` |

## 相关事件

Window 对象代表浏览器窗口，提供了许多有用的事件。以下是常见的 window 事件及其用途：

### 加载 & 卸载事件

| 事件               | 触发时机                             | 示例用途                   |
| ------------------ | ------------------------------------ | -------------------------- |
| `load`             | 页面所有资源（图片、脚本等）加载完成 | 初始化页面、绑定事件       |
| `DOMContentLoaded` | DOM 树构建完成（不等待资源）         | 尽早执行脚本、提高用户体验 |
| `beforeunload`     | 页面即将卸载（关闭/刷新/跳转）       | 提示用户保存未提交的数据   |
| `unload`           | 页面正在卸载                         | 清理资源、发送统计数据     |

示例代码

```javascript
window.addEventListener('load', () => {
  console.log('所有资源加载完成');
});

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 已就绪');
});

window.addEventListener('beforeunload', e => {
  e.preventDefault();
  e.returnValue = '您有未保存的更改，确定离开吗？';
});
```

### 窗口大小 & 滚动事件

| 事件     | 触发时机     | 示例用途                      |
| -------- | ------------ | ----------------------------- |
| `resize` | 窗口大小改变 | 响应式布局调整                |
| `scroll` | 页面滚动时   | 懒加载、返回顶部按钮显示/隐藏 |

示例代码：

```javascript
window.addEventListener('resize', () => {
  console.log(`窗口尺寸：${window.innerWidth}x${window.innerHeight}`);
});

window.addEventListener('scroll', () => {
  if (window.scrollY > 100) {
    console.log('已滚动超过 100px');
  }
});
```

## 鼠标事件中的坐标

| 属性               | 说明                                          | 备注                            |
| ------------------ | --------------------------------------------- | ------------------------------- |
| x                  | 同 clientX，相对视口的 X 坐标（现代浏览器）   | 是 clientX 的别名               |
| y                  | 同 clientY，相对视口的 Y 坐标（现代浏览器）   | 是 clientY 的别名               |
| clientX            | 相对浏览器视口左上角的 X 坐标                 | 不随页面滚动改变                |
| clientY            | 相对浏览器视口左上角的 Y 坐标                 | 不随页面滚动改变                |
| screenX            | 相对物理屏幕左上角的 X 坐标                   | 多显示器环境下可能有负值        |
| screenY            | 相对物理屏幕左上角的 Y 坐标                   | 多显示器环境下可能有负值        |
| pageX              | 相对完整文档左上角的 X 坐标                   | 等于 clientX + 当前水平滚动距离 |
| pageY              | 相对完整文档左上角的 Y 坐标                   | 等于 clientY + 当前垂直滚动距离 |
| offsetX            | 相对事件目标元素(content box)左上角的 X 坐标  | 受目标元素的 padding 影响       |
| offsetY            | 相对事件目标元素(content box)左上角的 Y 坐标  | 受目标元素的 padding 影响       |
| layerX             | 相对最近定位祖先元素或文档的 X 坐标（非标准） | 行为不一致，不建议使用          |
| layerY             | 相对最近定位祖先元素或文档的 Y 坐标（非标准） | 行为不一致，不建议使用          |
| window.pageXOffset | 文档水平滚动的像素数（别名：window.scrollX）  | 只读属性                        |
| window.pageYOffset | 文档垂直滚动的像素数（别名：window.scrollY）  | 只读属性                        |
