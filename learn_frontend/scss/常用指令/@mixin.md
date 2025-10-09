# @Mixin 混合指令详解

## 何为混合指令

混合指令（`Mixin`）用于定义可重复使用的样式，避免了使用无语意的 `class`，比如 `.float-left`。混合指令可以包含所有的 `CSS` 规则，绝大部分 `Sass` 规则，甚至通过参数功能引入变量，输出多样化的样式。
`mixin` 是可以重用的一组 CSS 声明。`mixin` 有助于减少重复代码，只需声明一次，就可在文件中引用。可以看出，`mixin` 类似变量，不同的是变量存储值，`mixin` 存储一组 css 声明。`mixin` 可以传入参数

::: tip 理解混入
其实`@mixin`相当定义了一个可复用对象
`@include` 相当于调用这个对象，并将其(`...`)展开到调用处
:::

## 基本使用

:::code-group

```scss [@mixin定义混入代码]
// 定义页面一个区块基本的样式
@mixin block {
  width: 96%;
  margin-left: 2%;
  border-radius: 8px;
  border: 1px #f6f6f6 solid;
}
```

```scss [@include使用混入]
// 使用混入：就是将定义的混合代码块展开到`@include` 标记的位置
.container {
  .block {
    @include block;
  }
}
```

```css [编译后]
.container .block {
  width: 96%;
  margin-left: 2%;
  border-radius: 8px;
  border: 1px #f6f6f6 solid;
}
```

:::

## 嵌入选择器

:::code-group

```scss [定义嵌套选择式的混入代码]
// 定义警告字体样式,下划线（_）与横线（-）是一样的
@mixin warning-text {
  .warn-text {
    font-size: 12px;
    color: rgb(255, 253, 123);
    line-height: 180%;
  }
}
```

```scss [使用嵌套选择式的混入]
// 使用混入
.container {
  @include warning-text;
}
```

```css [编译后]
.container .warn-text {
  font-size: 12px;
  color: #fffd7b;
  line-height: 180%;
}
```

:::

## 使用变量

:::code-group

```scss [定义带参数的混入代码]
// 定义块元素内边距
@mixin block-padding($top, $right, $bottom, $left) {
  padding-top: $top;
  padding-right: $right;
  padding-bottom: $bottom;
  padding-left: $left;
}
```

```scss [方式一：按照参数顺序赋值]
// 按照参数顺序赋值
.container {
  @include block-padding(10px, 20px, 30px, 40px);
}
```

```scss [方式二：指定参数名赋值]
// 可指定参数赋值
.container {
  @include block-padding($left: 20px, $top: 10px, $bottom: 10px, $right: 30px);
}
```

:::

::: warning 存在问题
只想设置两个边必须指定 4 个值
:::

## 变量默认值

指定默认值就是为了解决所有参数必须要传的问题

::: code-group

```scss [指定参数默认值]
// 定义块元素内边距，参数指定默认值
@mixin block-padding($top: 0, $right: 0, $bottom: 0, $left: 0) {
  padding-top: $top;
  padding-right: $right;
  padding-bottom: $bottom;
  padding-left: $left;
}
```

```scss [使用混入]
// 可指定参数赋值
.container {
  // 不带参数
  //@include block-padding;

  //按顺序指定参数值
  //@include block-padding(10px,20px);

  //给指定参数指定值
  @include block-padding($left: 10px, $top: 20px);
}
```

:::

## 可变参数

当需要传递多个参数的时候可以以数组的方式来进行接收

::: code-group

```scss [定义可变参数的混入代码]
/** 
    *定义线性渐变
    *@param $direction  方向
    *@param $gradients  颜色过度的值列表
 */
@mixin linear-gradient($direction, $gradients...) {
  // 获取数组下标第一个元素
  background-color: nth($gradients, 1);
  background-image: linear-gradient($direction, $gradients);
}
```

```scss [使用混入]
.table-data {
  @include linear-gradient(to right, #f00, orange, yellow);
}
```

```css [编译后]
@charset "UTF-8";
/** 
 * 定义线性渐变
 * @param $direction  方向
 * @param $gradients  颜色过度的值列表
 */
.container {
  background-color: #f00;
  background-image: -webkit-gradient(linear, left top, right top, from(#f00), color-stop(orange), to(yellow));
  background-image: linear-gradient(to right, #f00, orange, yellow);
}
```

:::
