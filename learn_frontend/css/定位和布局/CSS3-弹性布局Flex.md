---
order: 90
---

# CSS3 弹性布局 Flex

[[toc]]
参考资料
[1]:https://blog.csdn.net/m0_57184906/article/details/139611434
[2]:https://juejin.cn/post/7019075844664459278?searchId=2025070816245330B1AABD6078E1D10722#heading-0

## 基本概念

弹性盒子是一种用于按行或按列布局元素的一维布局方法，元素可以膨胀以填充额外的空间，收缩以适应更小的空间，适用于任何元素上，如果一个元素使用了 flex 弹性布局（以下都会简称为：flex 布局），则会在内部形成 BFC，flex 布局已经得到了所有浏览器的支持，这意味着，现在就能放心，安全的使用这项技术。
![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708172736704.png)

### 容器和项目

所谓的容器/弹性盒子(flex container)就是应用了`display:flex;`和`display:inline-flex;`样式的元素，而元素的子元素就是容器的项目(flex item)。

::: tip BFC 机制
设为 Flex 布局的元素，会应用 flex 规则，子元素的`float`、`clear`和`vertical-align`属性将失效。
:::

### 主轴和交叉轴

容器默认存在两根轴：

- 水平的主轴（main axis），主轴的开始位置（与边框的交叉点）叫做 main start ，结束位置叫做 main end ；
- 垂直的交叉轴（cross axis）。交叉轴的开始位置叫做 cross start ，结束位置叫做 cross end 。

弹性布局中的元素默认沿着主轴排列

![主轴和交叉轴](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708164817036.png)

## 操作容器

### 改变主轴方向 flex-direction

flex-direction 属性决定主轴的方向（即项目的排列方向）

```css
flex-direction: row | row-reverse | column | column-reverse;
```

- row：默认值，主轴为水平方向，起点在左端
- row-reverse：主轴为水平方向，起点在右端
- column：主轴为垂直方向，起点在上端
- column-reverse：主轴为垂直方向，起点在下端

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708170256052.png)

### 控制主轴上元素排布-justify-content

justify-content 属性定义了项目在主轴上的对齐方式

```css
justify-content: flex-start | flex-end | center | space-around | space-between | space-between;
```

- flex-start（默认值）：左对齐
- flex-end：右对齐
- center： 居中
- space-around：每个项目两侧的间隔相等。
- space-between：两端对齐，项目之间的间隔都相等。
- space-evenly：每个项目的间隔与项目和容器之间的间隔是相等的。

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708173121975.png)

### 控制交叉轴上元素排布-align-items

align-items 属性定义项目在交叉轴上如何对齐

```css
align-items: flex-start | flex-end | center | baseline | stretch;
```

- flex-start：交叉轴的起点对齐。
- flex-end：交叉轴的终点对齐。
- center：交叉轴的中点对齐。
- baseline: 项目的第一行文字的基线对齐。
- stretch（默认值）: 如果项目未设置高度或设为 auto，将占满整个容器的高度。

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708173153187.png)

### 控制主轴元素换行规则-flex-wrap

默认情况下，项目都排在一条线（又称轴线）上。

```css
.main {
  width: 500px;
  height: 300px;
  background: skyblue;
  display: flex;
}

.main div {
  width: 100px;
  height: 100px;
  background: pink;
  font-size: 20px;
}
```

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708181401384.png)

`flex-wrap` 属性定义，如果一条轴线排不下，如何换行。

1. nowrap（默认）：不换行。

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708171231562.png)

2. wrap：换行，第一行在上方。

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708171322000.png)

3. wrap-reverse：换行，第一行在下方。

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708171332402.png)

### 控制主轴和换行的合成属性-flex-flow

`flex-flow` 属性是 `flex-direction` 属性和 `flex-wrap` 属性的简写形式，默认值为 `row nowrap`

```css
flex-flow: <flex-direction>|| <flex-wrap>;
```

### 控制多根轴线的对齐方式-align-content

在 Flex 布局中，​ 当 `flex-wrap: wrap` 导致换行时，会形成多根主轴，更准确的说法是：​ 产生了多个 Flex 行（Flex Lines）​，而 align-content 就是用来控制这些行在交叉轴上的对齐方式。
::: warning 注意
align-content 只有在 flex-wrap 不是 nowrap 时才生效。
:::

```css
align-content: flex-start | flex-end | center | space-between | space-around | stretch;
```

- flex-start：与交叉轴的起点对齐。
- flex-end：与交叉轴的终点对齐。
- center：与交叉轴的中点对齐。
- space-between：与交叉轴两端对齐，轴线之间的间隔平均分布。
- space-around：每根轴线两侧的间隔都相等。
- stretch（默认值）：轴线占满整个交叉轴。

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708182039965.png)

## 控制项目

### 控制项目顺序-order

order 属性定义项目的排列顺序。数值越小，排列越靠前，默认为 0，可以是负数。

```css
order: <integer>;
```

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708182459053.png)

### 为项目分配剩余空间-flex-grow

`flex-grow` flex 容器中剩余空间的多少应该分配给项目，也称为扩展规则。最终的项目的宽度为：自身宽度 + 容器剩余空间分配宽度，`flex-grow` 最大值是 1，超过 1 按照 1 来扩展
![flex-grow](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708182704279.png)

### 控制项目收缩规则-flex-shrink

flex-shrink 属性指定了 flex 元素的收缩规则。flex 元素仅在默认宽度之和大于容器的时候才会发生收缩，其收缩的大小是依据 flex-shrink 的值，默认值是 1

```css
flex-shrink: <number>;
/* default 1 */
```

默认情况下，第一个 div 宽度是 200，第二个 div 宽度是 300，两个相加应该超过父元素的 400，但是由于 flex-shrink 都设置为 1，将两个 div 都收缩在父元素中

```css
.item {
  width: 400px;
  height: 300px;
  background: skyblue;
  display: flex;
  padding: 5px;
}
.item div {
  height: 100px;
  font-size: 20px;
}
.item div:nth-child(1) {
  flex-shrink: 1;
  width: 200px;
  background: pink;
}
.item div:nth-child(2) {
  flex-shrink: 1;
  width: 300px;
  background: cadetblue;
}
```

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708184206361.png)

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708184217304.png)

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708184226638.png)

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708184232701.png)

那收缩后的子项宽度是怎么样计算的呢？实际上有一个公示：

- `(200+300)`所有子项的宽度的和 - `(400)`容器的宽度 = `(100)`
- 第一个子项的宽度占比：`2/5`，第二个子项的宽度占比：`3/5`
- 则第一个子项的的宽度为：`200 - 2/5 _ 100 = 160`，第二个子项的宽度为：`300 - 3/5 _ 100 = 240`

### 指定项目在主轴的初始大小-flex-basis

`flex-basis` 指定了子项在容器主轴方向上的初始大小，优先级高于自身的宽度 width

```css
flex-basis: 0 | 100% | auto | <length>;
```

宽度是 200，但是由于设置了 flex-basis: 300px; ，所以子项最终宽度是大于自身设置的宽度

```css
.item {
  width: 400px;
  height: 300px;
  background: skyblue;
  display: flex;
  padding: 5px;
}
.item div {
  height: 100px;
  font-size: 20px;
}
.item div {
  width: 200px;
  flex-basis: 300px;
  background: pink;
}
```

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708184458762.png)

### 项目成长、收缩和基础大小的合成属性-flex

flex 属性是 `flex-grow` , `flex-shrink` 和 `flex-basis` 的简写，默认值为 `0 1 auto`。后两个属性可选。

```css
flex: none | [ < 'flex-grow' >< 'flex-shrink' >? || < 'flex-basis' >];
```

### 设置单个项目的交叉轴对齐方式-align-self

`align-self` 属性允许单个项目有与其他项目不一样的对齐方式，可覆盖 `align-items` 属性。默认值为 auto ，表示继承父元素的 `align-items` 属性，如果没有父元素，则等同于 stretch 。

```css
align-self: auto | flex-start | flex-end | center | baseline | stretch;
```

```css
.item {
  width: 400px;
  height: 300px;
  background: skyblue;
  display: flex;
  padding: 5px;
}
.item div {
  height: 100px;
  font-size: 20px;
}
.item div {
  width: 200px;
  flex-basis: 300px;
}
.item div:nth-child(1) {
  background: pink;
  align-self: flex-start;
}
.item div:nth-child(2) {
  background: violet;
  align-self: center;
}
.item div:nth-child(3) {
  background: greenyellow;
  align-self: flex-end;
}
```

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250708185858860.png)
