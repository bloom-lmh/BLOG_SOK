---
order: 84
---

# CSS3-2D/3D 变换

[[toc]]

[3D 变换编辑器](https://css-transform.moro.es/)
CSS3 变换可以对元素进行移动、缩放、转动、拉长或拉伸。

## 旋转的方向

CSS3 中如何确定旋转的方向是否为正向呢？
这里可以有左手法则，就是大拇指执行要围绕旋转的轴，其它四个手指的握住指向的方向就是旋转的正方向
![旋转的方向](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152323005.png)

## 基本变换-transform

:::tip 单位说明

- 长度单位：`px`、`em` 或 `%`
- 角度单位：`deg`
- 缩放系数：无单位数字（如 1.5 表示 1.5 倍）

:::

### 位移变换 (Translate)

| 函数语法               | 参数说明 | 示例用法                                    | 适用维度 |
| ---------------------- | -------- | ------------------------------------------- | -------- |
| `translate(x, y)`      | 2D 位移  | `transform: translate(10px, 20px);`         | 2D       |
| `translate3d(x, y, z)` | 3D 位移  | `transform: translate3d(10px, 20px, 30px);` | 3D       |
| `translateX(x)`        | X 轴位移 | `transform: translateX(50px);`              | 2D/3D    |
| `translateY(y)`        | Y 轴位移 | `transform: translateY(-5px);`              | 2D/3D    |
| `translateZ(z)`        | Z 轴位移 | `transform: translateZ(100px);`             | 3D       |

### 缩放变换 (Scale)

| 函数语法           | 参数说明 | 示例用法                             | 适用维度 |
| ------------------ | -------- | ------------------------------------ | -------- |
| `scale(x, y)`      | 2D 缩放  | `transform: scale(1.5, 0.8);`        | 2D       |
| `scale3d(x, y, z)` | 3D 缩放  | `transform: scale3d(1.2, 0.8, 1.5);` | 3D       |
| `scaleX(x)`        | X 轴缩放 | `transform: scaleX(2);`              | 2D/3D    |
| `scaleY(y)`        | Y 轴缩放 | `transform: scaleY(0.5);`            | 2D/3D    |
| `scaleZ(z)`        | Z 轴缩放 | `transform: scaleZ(2);`              | 3D       |

### 旋转变换 (Rotate)

| 函数语法                   | 参数说明 | 示例用法                               | 适用维度 |
| -------------------------- | -------- | -------------------------------------- | -------- |
| `rotate(angle)`            | 2D 旋转  | `transform: rotate(45deg);`            | 2D       |
| `rotate3d(x, y, z, angle)` | 3D 旋转  | `transform: rotate3d(1, 1, 0, 45deg);` | 3D       |
| `rotateX(angle)`           | X 轴旋转 | `transform: rotateX(30deg);`           | 3D       |
| `rotateY(angle)`           | Y 轴旋转 | `transform: rotateY(180deg);`          | 3D       |
| `rotateZ(angle)`           | Z 轴旋转 | `transform: rotateZ(90deg);`           | 2D/3D    |

### 倾斜变换 (Skew)

| 函数语法                 | 参数说明 | 示例用法                         | 适用维度 |
| ------------------------ | -------- | -------------------------------- | -------- |
| `skew(x-angle, y-angle)` | 2D 倾斜  | `transform: skew(20deg, 10deg);` | 2D       |
| `skewX(angle)`           | X 轴倾斜 | `transform: skewX(15deg);`       | 2D       |
| `skewY(angle)`           | Y 轴倾斜 | `transform: skewY(-5deg);`       | 2D       |

### 矩阵变换 (Matrix)

| 函数语法                 | 参数说明 | 示例用法                                                   | 适用维度 |
| ------------------------ | -------- | ---------------------------------------------------------- | -------- |
| `matrix(a,b,c,d,e,f)`    | 2D 矩阵  | `transform: matrix(1,0,0,1,50,50);`                        | 2D       |
| `matrix3d(n1,n2,...n16)` | 3D 矩阵  | `transform: matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,50,100,0,1);` | 3D       |

对于 2D 来说

$$
T = \begin{bmatrix}
\text{scaleX} & \text{skewY} & \text{translateX} \\
\text{skewX} & \text{scaleY} & \text{translateY} \\
0 & 0 & 1
\end{bmatrix}
$$

对于 3D 来说

$$
\begin{bmatrix}
[\text{scaleX}] & [\text{skewY}] & [\text{skewZ}] & [\text{translateX}] \\
[\text{skewX}] & [\text{scaleY}] & [\text{skewZ}] & [\text{translateY}] \\
[\text{skewX}] & [\text{skewY}] & [\text{scaleZ}] & [\text{translateZ}] \\
[\text{persX}] & [\text{persY}] & [\text{persZ}] & [\text{固定1}]
\end{bmatrix}
$$

:::tip 推荐使用 Martix 函数来实现任意变换

```js
const matrix = new DOMMatrix().scale(2, 2).translate(100, 100).rotate(45);
const box = document.querySelector('.box');
box.style.transform = matrix.toString();
```

:::

### 透视变换 (Perspective)

| 函数语法         | 参数说明 | 示例用法                         | 适用维度 |
| ---------------- | -------- | -------------------------------- | -------- |
| `perspective(n)` | 透视距离 | `transform: perspective(500px);` | 3D       |

后续会详细介绍

## :star:变换基本点改变-transform-origin

transform-origin 用于设置元素变换的基点位置。也就是设置变换时相对的 xyz 轴的位置或者说相对的坐标原点的位置。

其基本语法为`transform-origin: x-axis y-axis z-axis;`

| 参数       | 可选值                                                        | 默认值 | 述                                                                 |
| ---------- | ------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| **x-axis** | `left` \| `center` \| `right` \| `<length>` \| `<percentage>` | `50%`  | 水平方向基准点：<br>`left=0%`，` center=50%``right=100% `          |
| **y-axis** | `top` \| `center` \| `bottom` \| `<length>` \| `<percentage>` | `50%`  | 垂直方向基准点：<br>`top=0%`，` center=50%``bottom=100% `          |
| **z-axis** | `<length>` \| `<percentage>`                                  | `0`    | Z 轴偏移量（仅 3D 变换有效）：<br>正值为靠近观察者，负值远离观察者 |

![变换基本点](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152336609.png)
如果一个矩形，要想绕着底边中点圆心转动，实现步骤如下：

```css
transform-style: preserve-3d; /* 启用3D空间 */
transform-origin: 50% 100%; /* 底边中点 */
```

![底边中点](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152345677.png)
![示例图](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152356081.png)

## :star:变换顺序-transform-order

当旋转和位移一起使用的时候会出现一个问题就是旋转会让整个坐标系发生旋转，导致位移是沿着旋转后的坐标系进行的，当涉及 3D 变换的时候也会踹向那变换顺序的问题

## :star:透视属性-perspective

所谓的透视就是摄像机的视角

- perspective：所谓的透视效果就是近大远小效果，对于给定 perspective 的元素，会让其和子元素呈现透视效果，以此来模拟 3d
- perspectiveOrigin：视点的 xy 坐标，perspective 则是 z 坐标，三者可以再三维中确定 视点的唯一位置

```html
<style>
  body {
    width: 400px;
    height: 100vh;
    display: grid;
    grid-template-columns: auto auto;
    justify-content: space-around;
    align-items: center;
  }

  .box1 {
    width: 100px;
    height: 100px;
    background-color: blue;
    transform: rotateY(45deg);
  }
  .container2 {
    perspective: 200px;
  }
  .box2 {
    width: 100px;
    height: 100px;
    background-color: red;
    transform: rotateY(45deg);
  }
</style>
<div class="container1">
  <div class="box1">1</div>
</div>
<div class="container2">
  <div class="box2">2</div>
</div>
```

![透视属性](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152408111.png)
::: tip 透视叠加
perspective 如果设置在父元素上，子元素都会呈现近大远小的特点
如果子元素和父元素都设置了透视的值那么子元素的透视会叠加
:::

:::warning 注意事项

- perspective 的定义要在其他 3d 变换之前，否则无效 比如如果不设置 perspective 那么改变 translateZ 则没有效果，这个也很好理解，要首先确定眼睛所在的位置，在屏幕上的成像才会有此计算。
- 呈现 3d 效果的父元素要添加 transform-style：preserver-3d 属性。该属性定义该元素的子元素按照 3d 效果来呈现。

:::

## :star:变换组合-transform-style

规定被嵌套元素如何在 3D 空间中显示。

- flat：表示所有子元素在 2D 平面呈现。比如沿着 X 轴旋转的元素会覆盖后续元素而不是嵌入
- preserve-3d：默认父元素需要设置保留 3d 也就是 preserved-3d，这样才能保留 3d 效果，不然会以 2d 形式进行渲染，比如两个重叠的卡片，要求一个卡片旋转后嵌入另一个而不是覆盖另一个

```html
<style>
  .container {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: flex-start;
  }
  .container1 {
    width: 400px;
    height: 100px;
    display: grid;
    grid-template-columns: auto auto;
  }

  .box1 {
    background-color: rgb(177, 56, 188);
  }
  .box2 {
    background-color: rgb(120, 188, 56);
    transform: translateX(-50px) rotateX(45deg);
  }
  .container2 {
    width: 400px;
    height: 100px;
    display: grid;
    grid-template-columns: auto auto;
    transform-style: preserve-3d;
  }
  .box3 {
    background-color: brown;
  }
  .box4 {
    transform: translateX(-50px) rotateX(45deg);
    background-color: bisque;
  }
</style>
<div class="container">
  <div class="container1">
    <div class="box1">1</div>
    <div class="box2">2</div>
  </div>
  <div class="container2">
    <div class="box3">3</div>
    <div class="box4">4</div>
  </div>
</div>
```

![变换组合](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152419488.png)

## 背对元素的可见性-backface-visibility

![视点](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250614152429114.png)
还可以设置元素翻转后不可见也就是 backface-visible，当元素翻转过来后就不可见
