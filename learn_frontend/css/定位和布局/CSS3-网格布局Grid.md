---
order: 91
---

# Grid 布局

[[toc]]

参考资料 [菜鸟教程](https://www.runoob.com/css3/css-grid.html) [Gopal 掘金博客](https://juejin.cn/post/6854573220306255880?searchId=20250531160123DF2B18F341EC27959009#heading-6)

## 网格容器（Grid Container）

所谓的网格容器就是应用了 `display: grid` 或 `display: inline-grid` 样式的元素，元素的子元素就是网格项目。

| 属性         | **display: grid**      | **display: inline-grid**             |
| ------------ | ---------------------- | ------------------------------------ |
| 外部表现     | 块级元素（独占一行）   | 行内块元素（与其他行内元素共处一行） |
| 宽度行为     | 默认撑满父容器宽度     | 宽度由内容决定（类似 inline-block）  |
| 典型应用场景 | 全屏布局、页面主体结构 | 行内复杂组件（如导航菜单、图标排列） |

::: tip BFC 机制
设为 Grid 布局的元素，会应用 grid 布局规则，子元素的`float`、`clear`和`vertical-align`属性将失效
:::

## 网格轨道（Grid Track）

一个网格轨道就是一整行或一整列。下图中 One、Two、Three 组成了一个行轨道，One、Four 则是一个列轨道

<!-- ![网格轨道](https://s3.bmp.ovh/imgs/2025/05/31/9e6c7d2fb9834123.png) -->

![网格轨道](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152445119.png)

### 显示指定网格容器划分行/列轨道数及其所划分行/列轨道高度/宽度-grid-template-[columns/rows] | grid-template

- grid-template-columns： 这个属性定义网格容器划分多少个列轨道及每个列轨道的宽度
- grid-template-rows ：这个属性定义网格容器划分多少个行轨道及每个行轨道的高度
- grid-template： 是上面两个属性的简写

```css
.wrapper {
  display: grid;
  /*  声明了三列，宽度分别为 200px 100px 200px */
  grid-template-columns: 200px 100px 200px;
  grid-gap: 5px;
  /*  声明了两行，行高分别为 50px 50px  */
  grid-template-rows: 50px 50px;
  /* 声明一个150px的行轨道和三个由元素自己决定宽度的列轨道 */
  grid-template: 150px / auto auto auto;
}
```

<!-- ![指定网格容器划分行/列轨道数及其行/列轨道高度/宽度](https://s3.bmp.ovh/imgs/2025/05/31/12bf4c18a99c9f40.png) -->

![指定网格容器划分行/列轨道数及其行/列轨道高度/宽度](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152456120.png)

### :star:隐式指定行/列轨道的默认高度/宽度-grid-auto-[columns/rows]

- grid-auto-columns 这个属性能够指定列轨道的默认宽度，会被 grid-template-columns 覆盖(若有)
- grid-auto-rows 这个属性能够指定行轨道的默认高度，会被 grid-template-rows 覆盖(若有)

:::tip 使用场景
定义隐式列轨道的默认宽度（当网格项目超出显式定义的列时生效）,比如如下所示：

```html {4-5}
<style>
  .grid {
    display: grid;
    grid-auto-rows: 80px; /* 下面的三个元素，会创建三个行轨道，每个行轨道80px，同时要注意当设置row-gap时会有间隔*/
  }
</style>
<div class="grid">
  <div>项目1</div>
  <div>项目2</div>
  <div>项目3</div>
  <!-- 超出显式定义的轨道，触发隐式轨道 -->
</div>
```

:::

::: danger 一些小细节
当使用 grid-auto-rows 指定了默认（隐式）的行轨道高度时，多出元素会按照这个标准（高度）创建行轨道，但是一定要注意，如果此时指定了 row-gap，row-gap 依然会生效。这在使用 grid 进行瀑布流布局时会很容易忽视
:::

### 设置网格容器所有轨道及其间隙的对齐方式-justify-content & align-content

- justify-content ：当 ​ 网格总宽度 < 容器宽度 ​ 时，控制所有列轨道（及其间隙）组成的网格整体在容器中的水平对齐方式。
- align-content ：当 ​ 网格总高度 < 容器高度 ​ 时，控制所有行轨道（及其间隙）组成的网格整体在容器中的垂直对齐方式。

比如下面就是容器宽度大于网格总宽度

```css
.grid-container {
  display: grid;
  grid-template-columns: 100px 100px;
  width: 500px; /* 容器宽度 > 网格总宽度（200px） */
  justify-content: center; /* 将整个网格水平居中 */
}
```

其可能的值如下：
| 属性值 | 作用（`justify-content`） | 作用（`align-content`） |
| --------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `start` | 网格整体靠容器**左端**对齐 | 网格整体靠容器**顶部**对齐 |
| `end` | 网格整体靠容器**右端**对齐 | 网格整体靠容器**底部**对齐 |
| `center` | 网格整体在容器中**水平居中** | 网格整体在容器中**垂直居中** |
| `stretch` | 网格轨道**拉伸**以填满容器宽度（需未固定尺寸） | 网格轨道**拉伸**以填满容器高度（需未固定尺寸） |
| `space-around` | 剩余空间均匀分配到轨道**周围**（首尾空间为中间一半） | 剩余空间均匀分配到轨道**周围**（首尾空间为中间一半） |
| `space-between` | 剩余空间均匀分配到轨道**之间**（首尾贴边） | 剩余空间均匀分配到轨道**之间**（首尾贴边） |
| `space-evenly` | 剩余空间**完全均匀**分配（包括首尾） | 剩余空间**完全均匀**分配（包括首尾） |

![对齐方式1](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152511609.png)

![对齐方式2](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152523370.png)

## 轨道间隙（Track Gap）​​

每个网格轨道之间可以有间隙

![行列间距](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152536760.png)

### 指定列轨道之间的间距-column-gap | grid-column-gap（废弃）

这个属性设置列轨道之间的间隙

```css {4}
.wrapper-1 {
  display: grid;
  grid-template-columns: 200px 100px 100px;
  grid-column-gap: 20px; /* 列轨道间距为20px  */
}
```

### 指定行轨道之间的间距-row-gap | grid-row-gap（废弃）

这个属性设置行轨道之间的间隙

```css {4}
.wrapper-1 {
  display: grid;
  grid-template-columns: 200px 100px 100px;
  grid-row-gap: 10px; /* 行轨道间距为10px  */
}
```

### 指定行列轨道之间的间距-gap/grid-gap（废弃）

是 row-gap 和 column-gap 的简写

```css {4}
.wrapper {
  display: grid;
  grid-template-columns: 200px 100px 100px;
  grid-gap: 10px 20px; /* 行轨道间距为10px 列轨道间距为20px */
}
```

## 轨道函数和参数

### 自适应单位-auto

作用：浏览器根据可用空间和内容自动计算尺寸，​ 可能扩展也可能收缩。

1. 自动分配列宽

```html
<style>
  .grid-container {
    display: grid;
    grid-template-columns: auto auto; /* 两列宽度均自适应内容 */
    gap: 10px;
    border: 1px solid #ccc;
  }
  .item {
    background: lightblue;
    padding: 10px;
  }
</style>
<div class="grid-container">
  <div class="item">短文本</div>
  <div class="item">这是一段较长的文本内容</div>
</div>
```

效果 ​：

- 两列宽度分别由内容决定（第一列较窄，第二列较宽）。
- 总宽度超出容器时，auto 列会等比例收缩。

2. auto 与固定宽度混合

```css
grid-template-columns: 100px auto 200px; /* 固定 + 自适应 + 固定 */
```

效果 ​：中间列自动填充剩余空间，内容增多时会扩展，挤压其他列空间有限。

### 等分单位-fr

作用：fr 等分单位，可以将容器的可用空间分成想要的多个等分空间。利用这个特性，我们能够轻易实现一个等分响应式。grid-template-columns: 1fr 1fr 1fr 表示容器分为三等分

### 快速生成重复的网格轨道-repeat 函数

作用：快速生成重复的网格轨道，替代手动书写多个相同值，使代码更简洁。

```css
.container {
  display: grid;
  grid-template-columns: repeat(2, 50px 100px); /* 等价于 50px 100px 50px 100px */
}
```

效果如下：

- 生成了四列
- 宽度分别为 50px 100px 50px 100px

### 动态填充参数-auto-fill/fit

- auto-fill​：尽可能多填充轨道（即使空轨道也会保留空间）。
- auto-fit​：自动折叠空轨道，分配剩余空间给有效内容。

### 定义网格轨道的最小和最大尺寸范围-minmax

作用：定义网格轨道的 ​ 最小和最大尺寸范围，实现灵活响应式布局。

```css
.container {
  grid-template-columns: minmax(100px, 1fr) minmax(200px, 2fr);
}
```

上面的效果如下

- 第一列：宽度不小于 100px，最大按 1fr 比例扩展。
- 第二列：宽度不小于 200px，最大按 2fr 比例扩展。

### 限制轨道尺寸不超过指定值-fit-content

限制轨道尺寸不超过指定值，同时允许内容收缩。

```css
.container {
  grid-template-columns: fit-content(300px) 1fr;
}
```

- 第一列宽度由内容决定，但不超过 300px。
- 第二列占据剩余空间。

### 基于内容自动计算轨道尺寸-min-content & max-content

作用 ​：基于内容自动计算轨道尺寸。

| 函数        | 行为                                                           |
| ----------- | -------------------------------------------------------------- |
| min-content | 轨道尺寸收缩到内容的最小宽度（如文本不换行时的最长单词长度）。 |
| max-content | 轨道尺寸扩展至内容的理想宽度（如文本不换行时的全部内容长度）。 |

```css
.container {
  grid-template-columns: min-content max-content;
}
```

​ 效果 ​：

- 第一列宽度由最窄内容（如一个单词）决定。
- 第二列宽度由全部内容（如长句子）决定。

## 网格线（Grid Line）

确定网络轨道区域的线就是网格线，比如下图中 1 和 2 水平两条线确定了 one、two、three 组成的行规道。m 列有 m + 1 根垂直的网格线，n 行有 n + 1 跟水平网格线。

<!-- ![网格线](https://s3.bmp.ovh/imgs/2025/05/31/9dc59e07a799bfb3.png) -->

![网格线](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152551260.png)

## 网格项目/元素（Grid Item）

网格容器的直接子元素就是网格项目，一个网格项目占一个网格区域
:::code-group

```html [html]
<div class="wrapper">
  <div class="one item">One</div>
  <div class="two item">Two</div>
  <div class="three item">Three</div>
  <div class="four item">Four</div>
  <div class="five item">Five</div>
  <div class="six item">Six</div>
</div>
```

```css [css]
.wrapper {
  margin: 60px;
  /* 声明一个容器 */
  display: grid;
  /*  声明列的宽度  */
  grid-template-columns: repeat(3, 200px);
  /*  声明行间距和列间距  */
  grid-gap: 20px;
  /*  声明行的高度  */
  grid-template-rows: 100px 200px;
}
.one {
  background: #19caad;
}
.two {
  background: #8cc7b5;
}
.three {
  background: #d1ba74;
}
.four {
  background: #bee7e9;
}
.five {
  background: #e6ceac;
}
.six {
  background: #ecad9e;
}
.item {
  text-align: center;
  font-size: 200%;
  color: #fff;
}
```

:::

<!-- ![网格项目](https://s3.bmp.ovh/imgs/2025/05/31/47e1e6ee8019650a.png) -->

![网格项目](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152601822.png)

### 控制网格项目填充顺序-grid-auto-flow

- column：列优先填充元素
- row：行优先填充元素

```html {6}
<style>
  .grid-container {
    display: grid;
    grid-template-columns: auto auto auto;
    grid-template-rows: auto auto;
    grid-auto-flow: column; /* 或row */
    grid-gap: 10px;
    background-color: #2196f3;
    padding: 10px;
  }
  .grid-container > div {
    background-color: rgba(255, 255, 255, 0.8);
    text-align: center;
    padding: 20px 0;
    font-size: 30px;
  }
</style>
<div class="grid-container">
  <div class="item1">1</div>
  <div class="item2">2</div>
  <div class="item3">3</div>
  <div class="item4">4</div>
</div>
```

<!-- ![列优先填充](https://s3.bmp.ovh/imgs/2025/05/31/dc0cd894f7499a8e.png)
![行优先填充](https://s3.bmp.ovh/imgs/2025/05/31/c6435ed56ffbbebd.png) -->

![列优先填充](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152613895.png)
![行优先填充](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152622944.png)
::: tip 补充
在实际应用中，我们可能想尽可能填满空白，这个时候可以设置 grid-auto-flow: row dense，表示尽可能填满表格。
:::

### 指定网格项目从哪列/行网格线开始和结束-grid-[column/row]-[start/end] | grid-[column/row] | grid-area

- grid-column-start：1; ： 指定网格项目从第 1 个网格线开始到下一个网格线结束
- grid-column：1 / 2 指定网格项目跨越从第 1 个网格线开始到第 2 个网格线结束
- grid-column：1 / span 2 指定网格项目跨越从第 1 个网格线开始到第 3 个网格线结束、
- grid-area：2 / 1 / span 2 / span 3； 表示网格从第 2 行第 1 列开始，横跨两行三列是 grid-row-start, grid-column-start, grid-row-end, 和 grid-column-end 的简写属性

比如如下所示：

![网格项目](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152633381.png)

```html {5,16,21,25}
<style>
  .grid-container {
    display: grid;
    grid-template-columns: auto auto auto auto;
    grid-gap: 10px; /* 注意 当跨轨道时会将gap包含进去 */
    background-color: #2196f3;
    padding: 10px;
  }

  .grid-container > div {
    background-color: rgba(255, 255, 255, 0.8);
    text-align: center;
    padding: 20px 0;
    font-size: 30px;
  }
  /* 第一个项目占据2-4列 */
  .item1 {
    grid-column-start: 2;
    grid-column-end: 4;
  }
  /* 第二个项目占据1-3行 */
  .item2 {
    grid-row: 1 / 3;
  }
  /* 第三个项目从4列开始 跨越两个单元格占据1-3行 */
  .item3 {
    grid-column-start: 4;
    grid-row: 1 / span 2;
  }
</style>
<div class="grid-container">
  <div class="item1">1</div>
  <div class="item2">2</div>
  <div class="item3">3</div>
  <div class="item4">4</div>
  <div class="item5">5</div>
</div>
```

::: danger 注意事项
注意 当跨轨道时会将 gap 包含进去,计算时不要忽略了
:::

### 网格元素命名及其引用-grid-area & grid-template-areas

使用 grid-area 可以为网格元素命名，使用 grid-template-areas 可以引用元素命名并设置该元素跨越的区域
比如如下的代码

```html {20-23}
<style>
  .item1 {
    grid-area: header;
  }
  .item2 {
    grid-area: menu;
  }
  .item3 {
    grid-area: main;
  }
  .item4 {
    grid-area: right;
  }
  .item5 {
    grid-area: footer;
  }

  .grid-container {
    display: grid;
    grid-template-areas:
      'header header header header header header'
      'menu main main main right right'
      'menu footer footer footer footer footer';
    grid-gap: 10px;
    background-color: #2196f3;
    padding: 10px;
  }

  .grid-container > div {
    background-color: rgba(255, 255, 255, 0.8);
    text-align: center;
    padding: 20px 0;
    font-size: 30px;
  }
</style>
<div class="grid-container">
  <div class="item1">Header</div>
  <div class="item2">Menu</div>
  <div class="item3">Main</div>
  <div class="item4">Right</div>
  <div class="item5">Footer</div>
</div>
```

![网格元素命名](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152646158.png)
:::tip 补充
`.` 号表示没有名称的网格项。比如如下

```css
.item1 {
  grid-area: myArea;
}
.grid-container {
  grid-template-areas: 'myArea myArea . . .';
}
```

:::

## 网格单元格（Grid Cell）

行轨道与列轨道交织的区域构成了网格单元格，网格单元格是构成网格的最小单元。

### 设置所有单元格内网格元素的排列方式-justify-items | align-items | place-items

- justify-items：控制所有网格项（grid item）在网格单元格（grid cell）内的水平对齐方式，适用于网格项宽度 < 单元格宽度时产生的富余空间分配。
- align-items：控制所有网格项（grid item）在网格单元格（grid cell）内的垂直对齐方式，适用于网格项高度 < 单元格高度时产生的富余空间分配。
- place-items:是上面两个属性的复合属性

其属性值包括如下：

| 属性值  | 效果描述                         | 可视化示例（单元格内） |
| ------- | -------------------------------- | ---------------------- |
| start   | 网格项靠单元格左侧对齐           | [元素]（左对齐）       |
| end     | 网格项靠单元格右侧对齐           | [ 元素 ]（右对齐）     |
| center  | 网格项水平居中                   | [ 元素 ]               |
| stretch | 默认值，网格项拉伸填满单元格宽度 | [元素充满]             |

代码演示如下：

```css
.wrapper,
.wrapper-1,
.wrapper-2,
.wrapper-3 {
  display: grid;
  grid-template-columns: 100px 200px 100px;
  grid-gap: 5px;
  grid-auto-rows: 50px;
  justify-items: start;
}
.wrapper-1 {
  justify-items: end;
}
.wrapper-2 {
  justify-items: center;
}
.wrapper-3 {
  justify-items: stretch;
}
```

1. start：对齐单元格的起始边缘

![start：对齐单元格的起始边缘图](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152700291.png)

2. end：对齐单元格的结束边缘

![end：对齐单元格的结束边缘图](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152715039.png) 3. center：单元格内部居中

![center：单元格内部居中图](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152728170.png) 4. stretch：拉伸，占满单元格的整个宽度（默认值）

![stretch：拉伸，占满单元格的整个宽度（默认值）图](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152738481.png)
::: tip 与 justify-content 的区别
justify-items 仅作用于单元格内部，不影响网格轨道（grid track）的尺寸。
而 justify-content 作用域网格容器内部
:::

### 设置单个单元格内网格元素的排列方式- justify-self | align-self | place-self

- justify-self：控制单个网格项（grid item）在网格单元格（grid cell）内的水平对齐方式，适用于网格项宽度 < 单元格宽度时产生的富余空间分配。
- align-self：控制单个网格项（grid item）在网格单元格（grid cell）内的垂直对齐方式，适用于网格项高度 < 单元格高度时产生的富余空间分配。
- place-self:是上面两个属性的复合属性

```css
.item {
  justify-self: start;
}
.item-1 {
  justify-self: end;
}
.item-2 {
  justify-self: center;
}
.item-3 {
  justify-self: stretch;
}
```

::: tip 与 justify-items 的区别
justify-self 是设置单个单元格内的网格项的水平对齐方式，而 justify-items 是对所有网格单元格内的网格项进行设置。justify-self 的设置会覆盖 justify-items 的设置
:::

## 网格区域（Grid Area）

由一个或多个网络单元格构成的区域叫做网格区域。

## 响应式布局实现

### fr 实现等分响应式

fr 等分单位，可以将容器的可用空间分成想要的多个等分空间。利用这个特性，我们能够轻易实现一个等分响应式。grid-template-columns: 1fr 1fr 1fr 表示容器分为三等分

```css
.wrapper {
  margin: 50px;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-gap: 10px 20px;
  grid-auto-rows: 50px;
}
```

![等分单位-fr](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/17389592bf7e44dd~tplv-t2oaga2asx-jj-mark_3024_0_0_0_q75.awebp)

### repeat + auto-fit 实现自动加列

等分布局并不只有 Grid 布局才有，像 flex 布局也能轻松实现，接下来看看更高级的响应式
上面例子的始终都是三列的，但是需求往往希望我们的网格能够固定列宽，并根据容器的宽度来改变列的数量。这个时候，我们可以用到上面提到 repeat() 函数以及 auto-fit 关键字。grid-template-columns: repeat(auto-fit, 200px) 表示固定列宽为 200px，数量是自适应的，只要容纳得下，就会往上排列，代码以及效果实现如下：

```css
.wrapper {
  margin: 50px;
  display: grid;
  grid-template-columns: repeat(auto-fit, 200px);
  grid-gap: 10px 20px;
  grid-auto-rows: 50px;
}
```

![auto-fill/fit](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/grid2.awebp)

### repeat+auto-fit+minmax 去掉右侧空白

上面看到的效果中，右侧通常会留下空白，这是我们不希望看到的。如果列的宽度也能在某个范围内自适应就好了。minmax() 函数就帮助我们做到了这点。将 grid-template-columns: repeat(auto-fit, 200px) 改成 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)) 表示列宽至少 200px，如果还有空余则一起等分。代码以及效果如下所示：

```css
.wrapper {
  margin: 50px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  grid-gap: 10px 20px;
  grid-auto-rows: 50px;
}
```

![repeat+auto-fit+minmax 去掉右侧空白图](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/grid3.awebp)

::: tip 如何理解呢？
假设容器宽度为 900px，结果 ​：4 列，每列宽度 (900 - 60)/4 = 210px（符合 ≥200px）。
:::

### repeat+auto-fit+minmax-span-dense 解决空缺问题

似乎一切进行得很顺利，但是某天 UI 来说，每个网格元素的长度可能不相同，这也简单，通过 span 关键字进行设置网格项目的跨度，grid-column-start: span 3，表示这个网格项目跨度为 3。具体的代码与效果如下所示：

```css
.item-3 {
  grid-column-start: span 3;
}
```

![repeat+auto-fit+minmax-span-dense 解决空缺问题1](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/grid4.awebp)
不对，怎么右侧又有空白了？原来是有一些长度太长了，放不下，这个时候就到我们的 dense 关键字出场了。grid-auto-flow: row dense 表示尽可能填充，而不留空白，代码以及效果如下所示：

```css
.wrapper,
.wrapper-1 {
  margin: 50px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  grid-gap: 10px 20px;
  grid-auto-rows: 50px;
}

.wrapper-1 {
  grid-auto-flow: row dense;
}
```

![repeat+auto-fit+minmax-span-dense 解决空缺问题2](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/grid5.awebp)

## 瀑布流布局实现

```html {47}
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>瀑布流布局</title>
    <style>
      .container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
        gap: 10px; /* 注意gap包含有row-gap需要减去row-gap */
        grid-auto-rows: 1px; /* 隐式行高为1px */
      }
      .item {
        border-radius: 8px;
        overflow: hidden;
        background: #f0f0f0;
        grid-column-end: span 1;
      }
      .item img {
        width: 100%;
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <!-- 示例图片，实际使用时替换为您的图片路径 -->
      <div class="item"><img src="../../../images/0001.png" alt="" /></div>
      <div class="item"><img src="../../../images/0002.png" alt="" /></div>
      <!-- ... -->
    </div>

    <script>
      function calculateRowSpan() {
        const itemEls = document.querySelectorAll('.item');
        // 默认每一行的高度
        const defaultRowHeight = 1;
        // row-gap的高度
        const rowGapHeight = 10;
        itemEls.forEach(itemEl => {
          // 获取图片
          const imageEl = itemEl.querySelector('img');
          // 获取图片高度
          const imgElHeight = imageEl.getBoundingClientRect().height;
          // 计算总所跨行数,注意所跨行数要把每行gap算在里面
          const totalRowSpan = Math.ceil(imgElHeight / (defaultRowHeight + rowGapHeight));
          // 动态设置所跨行数
          itemEl.style.gridRowEnd = `span ${totalRowSpan}`;
        });
      }
      window.addEventListener('load', calculateRowSpan);
      window.addEventListener('resize', calculateRowSpan);
    </script>
  </body>
</html>
```

::: tip 小技巧
当计算跨越行数时，采用 （默认行高+gap） 来作为一个基本单元来计算需要跨越多少行
如 `const totalRowSpan = Math.ceil(imgElHeight / (defaultRowHeight + rowGapHeight));`
:::
