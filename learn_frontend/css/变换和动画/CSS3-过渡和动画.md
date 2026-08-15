---
order: 85
---

# CSS3-过渡和动画

[[toc]]

## 过渡

所谓的过渡就是元素从一种样式逐渐变换到另一种样式的过程。CSS3 提供了 transition 属性来实现过渡效果。

- transition-property：过渡对应属性
- transition-duration：过渡持续时间
- transition-timing-function：过渡的速度曲线
- transition-delay：过渡延迟时间
- transition：简写属性，可以同时设置多个属性

```css
/* 过渡属性 */
.box {
  width: 100px;
  height: 100px;
  background-color: red;
  /* 过渡属性 */
  transition-property: width, height;
  /* 过渡持续时间 */
  transition-duration: 1s;
  /* 过渡的速度曲线 */
  transition-timing-function: linear;
  /* 过渡延迟时间 */
  transition-delay: 0s;
}

/* 过渡效果 */
.box:hover {
  width: 200px;
  height: 200px;
  background-color: blue;
}
```

可以同时设置多个属性的过渡

```css
div {
  transition: width 2s, height 2s, transform 2s;
  -webkit-transition: width 2s, height 2s, -webkit-transform 2s;
}
```

过渡时间曲线

- linear：匀速
- ease：默认值，开始慢，结束快
- ease-in：开始快，结束慢
- ease-out：开始慢，结束快
- ease-in-out：开始慢，结束慢，中间快
- cubic-bezier(n,n,n,n)：自定义贝塞尔曲线，n 取值范围 0-1

## 动画

动画就是元素从一种样式逐渐变换到另一种样式的过程，但是动画可以重复播放，而且可以设置动画的持续时间、速度曲线、延迟时间等。

- @keyframes 规则：定义动画
- animation-name：动画名称
- animation-duration：动画持续时间
- animation-timing-function：动画的速度曲线
- animation-delay：动画延迟时间
- animation-iteration-count：动画播放次数
- animation-direction：动画播放方向
- animation-fill-mode：动画结束后状态
- animation-play-state：动画播放状态
- animation: name duration timing-function delay iteration-count direction fill-mode play-state;

```css
/* 动画属性 */
.box {
  width: 100px;
  height: 100px;
  background-color: red;
  /* 动画名称 */
  animation-name: move;
  /* 动画持续时间 */
  animation-duration: 2s;
  /* 动画的速度曲线 */
  animation-timing-function: linear;
  /* 动画延迟时间 */
  animation-delay: 0s;
  /* 动画播放次数 */
  animation-iteration-count: infinite;
  /* 动画播放方向 */
  animation-direction: alternate;
  /* 动画结束后状态 */
  animation-fill-mode: forwards;
}

/* 动画效果 */
@keyframes move {
  from {
    width: 100px;
    height: 100px;
    background-color: red;
  }
  to {
    width: 200px;
    height: 200px;
    background-color: blue;
  }
}

.box:hover {
  animation-play-state: paused;
}
```

可以同时设置多个属性的动画

```css
div {
  animation: move 2s, rotate 2s;
  -webkit-animation: move 2s, rotate 2s;
}

@keyframes move {
  from {
    width: 100px;
    height: 100px;
    background-color: red;
  }
  to {
    width: 200px;
    height: 200px;
    background-color: blue;
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
```
