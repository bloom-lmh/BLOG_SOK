---
order: 88
---

# BFC 机制

[[toc]]

## 什么是 BFC 机制

BFC（块格式化上下文，Block Formatting Context）是 CSS 中用于**控制块级元素布局的一种机制/规则**。它通过创建一个独立的渲染区域，让内部元素与外部元素隔离，从而避免布局时的相互干扰。以下是 BFC 的核心机制：

- 内部的盒子会在垂直方向上一个接一个的放置
- 对于同一个 BFC 的俩个相邻的盒子的 margin 会发生重叠，与方向无关。
- 每个元素的左外边距与包含块的左边界相接触（从左到右），即使浮动元素也是如此
- BFC 的区域不会与 float 的元素区域重叠
- 计算 BFC 的高度时，浮动子元素也参与计算，解决父元素因子元素浮动导致的塌陷
- BFC 就是页面上的一个隔离的独立容器，容器里面的子元素不会影响到外面的元素，反之亦然

BFC 目的是形成一个相对于外界完全独立的空间，让内部的子元素不会影响到外部的元素。但是空间内部的元素需要遵循该机制进行布局。

## 如何触发 BFC 机制

- 根元素，即 HTML 元素
- 浮动元素：float 值为 left、right
- overflow 值不为 visible,为 auto、scroll、hidden
- display 的值为 inline-block、inltable-cell、table-caption、table、inline-table、flex、inline-
  flex、grid、inline-grid
- position 的值为 absolute:或 fixed

## BFC 的应用场景

- 隔离布局 ​：BFC 内部元素的布局不会影响外部元素，反之亦然。
- 包含浮动元素 ​：父元素触发 BFC 后，可以包裹住内部浮动子元素，避免高度塌陷。
- 阻止外边距重叠（Margin Collapse）​​：同一 BFC 内的相邻块级元素垂直外边距会合并，但不同 BFC 之间不会。
- 避免与浮动元素重叠 ​：BFC 区域不会与外部浮动元素重叠，常用于实现自适应两栏布局。

### 解决浮动导致父元素塌陷

当父元素中子元素采用浮动时，浮动元素将不会参与高度计算导致父元素塌陷，如图所示：
![浮动导致父元素塌陷](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152057407.png)
其解决方案为将父元素变为 BFC 区域，则此时父元素触发 BFC 后，可以包裹住内部浮动子元素，避免高度塌陷。
:::code-group

```html [浮动导致父元素塌陷]
<style>
  .father {
    border: 1px solid saddlebrown;
  }
  .son {
    width: 100px;
    height: 100px;
    background-color: blueviolet;
    float: left;
  }
</style>
<body>
  <div class="father">
    <div class="son"></div>
  </div>
</body>
```

```html [使用BFC让浮动子元素也参与高度计算] {4}
<style>
  .father {
    border: 1px solid saddlebrown;
    overflow: hidden;
  }
  .son {
    width: 100px;
    height: 100px;
    background-color: blueviolet;
    float: left;
  }
</style>
<body>
  <div class="father">
    <div class="son"></div>
  </div>
</body>
```

:::
下面为解决后的效果：
![BFC解决浮动元素塌陷](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152112786.png)

### 解决 margin 合并问题

当 BFC 中两个块级元素都采用了 margin，那么两个块级连接处的 margin 将会塌陷，如图所示：
![margin 塌陷](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152136460.png)
解决方案为将一个元素外套一个元素，并触发这个元素为 BFC 区域，这时候由于 BFC 区域与外界不想关联，margin 并不会重合
:::code-group

```html [margin 塌陷]
<style>
  .son {
    width: 100px;
    height: 100px;
    background-color: blueviolet;
    margin: 10px;
  }
</style>
<body>
  <div class="son"></div>
  <div class="son"></div>
</body>
```

```html [使用BFC让浮动子元素也参与高度计算] {2-4,13-15}
<style>
  .wrap {
    overflow: hidden;
  }
  .son {
    width: 100px;
    height: 100px;
    background-color: blueviolet;
    margin: 10px;
  }
</style>
<body>
  <div class="wrap">
    <div class="son"></div>
  </div>
  <div class="son"></div>
</body>
```

:::
解决后的效果图:
![解决margin塌陷](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152206867.png)

### 解决浮动元素与非浮动元素重叠的问题

由于元素的左边距与包含它们的块的左边界会相接触且这一条件在元素浮动的情况下也成立导致浮动元素与非浮动元素重叠

解决方案也很简单，就是将 main 元素采用 bfc 机制，浮动元素无法与 BFC 区域重叠，因为 BFC 元素与外界隔离
如下所示：
![浮动元素与非浮动元素重叠](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152225335.png)
:::code-group

```html [浮动元素与非浮动元素重叠]
<style>
  .aside {
    width: 100px;
    height: 100px;
    float: left;
    background-color: rgb(43, 83, 226);
  }
  .main {
    width: 200px;
    height: 200px;
    background-color: blueviolet;
  }
</style>
<body>
  <div class="aside"></div>
  <div class="main"></div>
</body>
```

```html [使用BFC让浮动元素与非浮动元素不重叠] {12}
<style>
  .aside {
    width: 100px;
    height: 100px;
    float: left;
    background-color: rgb(43, 83, 226);
  }
  .main {
    width: 200px;
    height: 200px;
    background-color: blueviolet;
    overflow: hidden;
  }
</style>
<body>
  <div class="aside"></div>
  <div class="main"></div>
</body>
```

:::
解决后的效果如图所示:
![浮动元素与非浮动元素不重叠](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152242596.png)
::: tip 浮动的一些规则

- 普通块级元素的内容会避开浮动元素，但盒子默认被覆盖。
- 浮动元素想要覆盖块级元素必须放在要覆盖的块级元素前

:::
