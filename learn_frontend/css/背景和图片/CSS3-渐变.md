---
order: 83
---

# 渐变

[[toc]]

CSS3 渐变（gradients）可以让你在两个或多个指定的颜色之间显示平稳的过渡。

## 线性渐变 - linear-gradient

语法：`background: linear-gradient([方向], 颜色停止点1, 颜色停止点2, ...);`

- 角度：to right（从左到右）、45deg（45 度角）
- 默认：to bottom（从上到下）

::: tip 颜色停止点

```css
div {
  background: linear-gradient(
    to right,
    red 0%,
    yellow 20%,
    /* 红→黄过渡仅在前20% */ blue 80% /* 黄→蓝过渡占60%空间 */
  );
}
```

:::

```html
<style>
  #grad1 {
    height: 200px;
    background-image: linear-gradient(45deg, red, yellow, blue); /* [!code focus] */
  }
</style>
<div id="grad1"></div>
```

![linear-gradient](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250616202841045.png)

## 径向渐变-radial-gradient

语法：`background: radial-gradient([形状] [大小] [at 位置], 颜色停止点1, 颜色停止点2, ...);`

- 形状：circle（圆形）、ellipse（椭圆，默认）
- 大小：closest-side、farthest-corner（默认）
- 位置：at center（默认）、at top right 等

```html
<style>
  #grad1 {
    height: 150px;
    width: 200px;
    background-color: red; /* 浏览器不支持的时候显示 */
    background-image: radial-gradient(red, green, blue); /* 标准的语法（必须放在最后） */
  }
</style>
<div id="grad1"></div>
```

![径向渐变](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250616204009405.png)

下面是设置径向渐变的大小

- farthest-corner (默认) : 指定径向渐变的半径长度为从圆心到离圆心最远的角
- closest-side ：指定径向渐变的半径长度为从圆心到离圆心最近的边
- closest-corner ： 指定径向渐变的半径长度为从圆心到离圆心最近的角
- farthest-side ：指定径向渐变的半径长度为从圆心到离圆心最远的边

```html
<style>
  #grad1 {
    height: 150px;
    width: 150px;
    background-color: red; /* 浏览器不支持的时候显示 */
    background-image: radial-gradient(closest-side at 60% 55%, red, yellow, black);
  }

  #grad2 {
    height: 150px;
    width: 150px;
    background-color: red; /* 浏览器不支持的时候显示 */
    background-image: radial-gradient(farthest-side at 60% 55%, red, yellow, black);
  }

  #grad3 {
    height: 150px;
    width: 150px;
    background-color: red; /* 浏览器不支持的时候显示 */
    background-image: radial-gradient(closest-corner at 60% 55%, red, yellow, black);
  }

  #grad4 {
    height: 150px;
    width: 150px;
    background-color: red; /* 浏览器不支持的时候显示 */
    background-image: radial-gradient(farthest-corner at 60% 55%, red, yellow, black);
  }
</style>
<p><strong>closest-side：</strong></p>
<div id="grad1"></div>

<p><strong>farthest-side：</strong></p>
<div id="grad2"></div>

<p><strong>closest-corner：</strong></p>
<div id="grad3"></div>

<p><strong>farthest-corner（默认）：</strong></p>
<div id="grad4"></div>
```

![镜像渐变大小设置](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250616204538349.png)

## 重复的线性渐变-repeating-linear-gradient

语法：`background: repeating-linear-gradient([方向], 颜色停止点1, 颜色停止点2, ...);`

颜色停止点需定义长度才会重复

```html
<style>
  #grad1 {
    height: 200px;
    background-image: repeating-linear-gradient(45deg, red, blue 7%, green 10%);
  }
</style>
<p>45 度线性渐变，从红色到蓝色：</p>
<div id="grad1"></div>
```

![重复的线性渐变](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250616205428474.png)

## 重复的径向渐变-repeating-radial-gradient

语法：`background: repeating-radial-gradient([形状] [at 位置], 颜色停止点1, 颜色停止点2, ...);`

```html
<style>
  #grad1 {
    height: 200px;
    background-image: repeating-radial-gradient(red, yellow 10%, green 15%);
  }
</style>
<h3>重复的径向渐变</h3>
<div id="grad1"></div>
```

![重复的径向渐变](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250616205801443.png)
