---
order: 94
---

# CSS3 媒体查询

[[toc]]

## CSS2 媒体类型

CSS2 中引入了 `@media` 规则，它让为不同媒体类型定义不同样式规则成为可能。例如：
您可能有一组用于计算机屏幕的样式规则、一组用于打印机、一组用于手持设备，甚至还有一组用于电视，等等。

```html
<!-- 当检测到设备为屏幕时应用这个规则 -->
<link rel="stylesheet" media="screen" href="screen.css" />
<!-- 当检测到设备为打印时应用这个规则 -->
<link rel="stylesheet" media="print" href="print.css" />
```

一些媒体类型如下：
| 值 | 设备类型 |
|-------------|--------------------------------------|
| All | 所有设备 |
| Braille | 盲人用点字法触觉回馈设备 |
| Embossed | 盲文打印机 |
| Handheld | 便携设备 |
| Print | 打印用纸或打印预览视图 |
| Projection | 各种投影设备 |
| Screen | 电脑显示器 |
| Speech | 语音或音频合成器 |
| Tv | 电视机类型设备 |
| Tty | 使用固定密度字母栅格的媒介（如电传打字机和终端） |

不幸的是，除了打印媒体类型（大多数浏览器只实现了 screen 和 print）之外，其它媒体类型从未得到过设备的大规模支持。

## CSS3 媒体查询

CSS3 中的媒体查询扩展了 CSS2 媒体类型的概念：它们并不根据设备类型来应用样式，而是关注设备的特性来应用样式。媒体查询要检查的特性包括：

- 视口的宽度和高度
- 设备的宽度和高度
- 方向（平板电脑/手机处于横向还是纵向模式）
- 分辨率

### :star: 媒体查询的基本语法

媒体查询由一种媒体类型组成，并可包含一个或多个表达式，这些表达式可以解析为 true 或 false。

```css
@media not|only mediatype and (expressions) {
  CSS-Code;
}
```

如果指定的媒体类型与正在显示文档的设备类型匹配，并且媒体查询中的所有表达式均为 true，则查询结果为 true。当媒体查询为 true 时，将应用相应的样式表或样式规则，并遵循正常的级联规则。
::: tip not 和 only

1.  使用 not 否定查询条件

```css
@media not print and (color) {
  /* 不是打印设备，并且支持颜色的设备才应用此样式 */
}
```

2. 使用 only 避免旧版浏览器误读

```html
<link rel="stylesheet" media="only screen and (max-width: 600px)" href="mobile.css" />
```

:::

### 媒体查询的使用位置

1. 在 `<style>` 标签中使用（内联样式）:适用于页面局部样式调整。

```html
<style>
  @media (max-width: 600px) {
    .facet_sidebar {
      display: none;
    }
  }
</style>
```

2. 通过 `<link>` 引入外部样式表（分离样式）: 适用于大型项目或需要完全分离不同设备样式的场景。

```html
<link rel="stylesheet" media="mediatype and|not|only (expressions)" href="print.css" />
<link rel="stylesheet" media="(max-width: 800px)" href="mobile.css" />
<link rel="stylesheet" media="(min-width: 801px)" href="desktop.css" />
```

### 典型断点设置（Breakpoints）

| 设备类型       | 推荐断点范围                               |
| -------------- | ------------------------------------------ |
| 移动端（竖屏） | `max-width: 576px`                         |
| 移动端（横屏） | `min-width: 576px` 和 `max-width: 768px`   |
| 平板           | `min-width: 768px` 和 `max-width: 1024px`  |
| 小型桌面       | `min-width: 1024px` 和 `max-width: 1200px` |
| 大型桌面       | `min-width: 1200px`                        |

```css
/* 移动端样式 */
@media (max-width: 767px) {
  ...;
}

/* 平板样式 */
@media (min-width: 768px) and (max-width: 1024px) {
  ...;
}

/* 桌面样式 */
@media (min-width: 1025px) {
  ...;
}
```

::: tip bootstrape 断点设置
很多主流响应式框架（如 Bootstrap、Foundation）都基于媒体查询构建了网格系统和组件样式，例如 Bootstrap 的栅格系统使用以下断点：

- xs: < 576px
- sm: ≥ 576px
- md: ≥ 768px
- lg: ≥ 992px
- xl: ≥ 1200px
- xxl: ≥ 1400px

这些框架底层其实就是通过媒体查询实现了不同尺寸下的布局切换。

:::

## :star: 总结

1. CSS2 引入了媒体类型，让根据不同设备应用不同样式成为了可能。但是浏览器支持不好
2. CSS3 扩展了 CSS2 的媒体类型，引入了媒体查询，它可以根据设备的特性（如屏幕宽度、高度、分辨率、方向等）来应用不同的样式规则,让根据不同设备特性来来应用不同的样式成为可能。
3. 媒体查询的作用是实现响应式网页布局、针对不同分辨率设备提供优化的视觉效果、提升移动端和桌面端用户的体验、动态适应浏览器窗口大小变化。
4. 媒体查询的基本语法为`@media not|only mediatype and (expressions) { CSS-Code; }` 只有类型匹配且表达式都为 true 时，才会应用相应的样式表或样式规则。not 和 only 是可选的
5. 基本断点设置：移动端（竖屏）：`max-width: 576px`；移动端（横屏）：`min-width: 576px` 和 `max-width: 768px`；平板：`min-width: 768px` 和 `max-width: 1024px`；小型桌面：`min-width: 1024px` 和 `max-width: 1200px`；大型桌面：`min-width: 1200px`
