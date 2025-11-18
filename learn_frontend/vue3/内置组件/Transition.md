# Transition

## 基本概念

### 什么是 Transition？

`<Transition>` 是一个内置组件，它会为其包裹的元素添加进入和离开动画（过渡效果）。

### 触发进入和离开的条件

进入或离开可以由以下的条件之一触发：

- 由 `v-if` 所触发的切换
- 由 `v-show` 所触发的切换
- 由特殊元素 `<component>` 切换的动态组件
- 改变特殊的 `key` 属性

::: tip 原理
当一个 `<Transition>` 组件中的元素被插入或移除时，会发生下面这些事情：

1. Vue 会自动检测目标元素是否应用了 CSS 过渡或动画。如果是，则一些 CSS 过渡 class 会在适当的时机被添加和移除。
2. 如果有作为监听器的 `JavaScript` 钩子，这些钩子函数会在适当时机被调用。
3. 如果没有探测到 CSS 过渡或动画、也没有提供 `JavaScript` 钩子，那么 DOM 的插入、删除操作将在浏览器的下一个动画帧后执行。

:::

### 基本用法

:::code-group

```vue [模板]
<button @click="show = !show">Toggle</button>
<Transition>
  <!-- 单个元素 -->
  <p v-if="show">hello</p>
</Transition>
```

```css [样式]
/* 下面我们会解释这些 class 是做什么的 */
.v-enter-active,
.v-leave-active {
  transition: opacity 0.5s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
```

:::

::: warning 注意
`<Transition>` 仅支持单个元素或组件作为其插槽内容。如果内容是一个组件，这个组件必须仅有一个根元素。
:::

## 基于 CSS 的过渡效果

### CSS 过渡 class

一共有 6 个应用于进入与离开过渡效果的 CSS class。

![6 个应用于进入与离开过渡效果的 CSS class](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251118150716636.png)

1. `v-enter-from`：进入动画的起始状态。在元素插入之前添加，在元素插入完成后的下一帧移除。
2. `v-enter-active`：进入动画的生效状态。应用于整个进入动画阶段。在元素被插入之前添加，在过渡或动画完成之后移除。这个 class 可以被用来定义进入动画的持续时间、延迟与速度曲线类型。
3. `v-enter-to`：进入动画的结束状态。在元素插入完成后的下一帧被添加 (也就是 `v-enter-from` 被移除的同时)，在过渡或动画完成之后移除。
4. `v-leave-from`：离开动画的起始状态。在离开过渡效果被触发时立即添加，在一帧后被移除。
5. `v-leave-active`：离开动画的生效状态。应用于整个离开动画阶段。在离开过渡效果被触发时立即添加，在过渡或动画完成之后移除。这个 class 可以被用来定义离开动画的持续时间、延迟与速度曲线类型。
6. `v-leave-to`：离开动画的结束状态。在一个离开动画被触发后的下一帧被添加 (也就是 `v-leave-from` 被移除的同时)，在过渡或动画完成之后移除。

::: tip 用演员来理解

1. 进场过程串联起来就是：演员在侧幕 (`v-enter-from`) -> 开始走向舞台中央 (`v-enter-active`生效) -> 走到舞台中央站定 (`v-enter-to`)。
2. 演员在舞台中央 (`v-leave-from`) -> 开始走向侧幕 (`v-leave-active`生效) -> 走进侧幕消失 (`v-leave-to`)

简单理解就是：以什么样的方式(active)，从这个状态(from)到另一个状态(to)。
:::

### 为过渡效果命名

我们可以给 `<Transition>` 组件传一个 `name prop` 来声明一个过渡效果名，这样`<Transition>`中的元素就会以这个名字作为前缀来的 class 作为过渡效果而不是 `v` 作为前缀：

```vue
<Transition name="fade">
  ...
</Transition>
```

比如，上方例子中被应用的 class 将会是 `fade-enter-active` 而不是 `v-enter-active`。这个 fade 过渡的 class 应该是这样：

```css
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
```

### CSS 的 animation

原生 CSS 动画和 CSS transition 的应用方式基本上是相同的，只有一点不同，那就是 `*-enter-from` 不是在元素插入后立即移除，而是在一个 `animationend` 事件触发时被移除。
对于大多数的 CSS 动画，我们可以简单地在 `*-enter-active` 和 `*-leave-active` class 下声明它们。下面是一个示例：

::: code-group

```vue [模板]
<Transition name="bounce">
  <p v-if="show" style="text-align: center;">
    Hello here is some bouncy text!
  </p>
</Transition>
```

```css [样式]
.bounce-enter-active {
  animation: bounce-in 0.5s;
}
.bounce-leave-active {
  animation: bounce-in 0.5s reverse;
}
@keyframes bounce-in {
  0% {
    transform: scale(0);
  }
  50% {
    transform: scale(1.25);
  }
  100% {
    transform: scale(1);
  }
}
```

:::

### 自定义过渡 class

你也可以向 `<Transition>` 传递以下的 `props` 来指定自定义的过渡 `class`：

- `enter-from-class`
- `enter-active-class`
- `enter-to-class`
- `leave-from-class`
- `leave-active-class`
- `leave-to-class`

这样你传入的这些 class 会覆盖相应阶段的默认 class 名。这个功能在你想要在 Vue 的动画机制下集成其他的第三方 CSS 动画库时非常有用，比如 [Animate.css](https://animate.style/)：

```vue
<!-- 假设你已经在页面中引入了 Animate.css -->
<Transition
  name="custom-classes"
  enter-active-class="animate__animated animate__tada"
  leave-active-class="animate__animated animate__bounceOutRight">
  <p v-if="show">hello</p>
</Transition>
```

### 同时使用 transition 和 animation

Vue 通过附加事件监听器，来监听 `transitionend` 或 `animationend`事件从而知道过渡或动画是否完成。如果同时使用了 CSS 过渡和动画，那么你需要显示的指定监听的事件类型，比如你给同一个元素同时加了过渡和动画你就需要指定 `type` 属性：

```css
.button {
  /* 过渡：用于鼠标悬停时颜色的缓慢变化 */
  transition: background-color 0.3s ease;
}
.button:hover {
  background-color: red;
}

/* 动画：用于被点击时的一个持续震动效果 */
@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
  }
  75% {
    transform: translateX(5px);
  }
}
.button.clicked {
  animation: shake 0.5s;
}
```

想象一下

1. 当这个元素需要被移除时，你同时定义了离场过渡和离场动画。那么 Vue 会听到两个信号：
2. 先听到某一个事件的结束信号（比如 `transitionend`）。
3. 过了一会儿，又听到另一个事件的结束信号（比如 `animationend`）。

这会导致第一个信号出现就终止第二个动画！

### 深层级过渡与显式过渡时长

尽管过渡 class 仅能应用在 `<Transition>` 的直接子元素上，但是还是可以使用深层级的 CSS 选择器，在深层级的元素上触发过渡效果，**也就是说通过 CSS 选择器，我们可以让里面的小套娃也有自己的动画**：

::: code-group

```vue [模板] {10-12}
<script setup>
import { ref } from 'vue';

const show = ref(true);
</script>

<template>
  <button @click="show = !show">Toggle</button>
  <Transition name="nested">
    <div v-if="show" class="outer">
      <div class="inner">Hello</div>
    </div>
  </Transition>
</template>
```

```css [样式]{11-24,26-40}
<style>
.outer, .inner {
	background: #eee;
  padding: 30px;
  min-height: 100px;
}

.inner {
  background: #ccc;
}
/* 父元素的样式过渡效果 start */
.nested-enter-active, .nested-leave-active {
	transition: all 0.3s ease-in-out;
}
.nested-leave-active {
  transition-delay: 0.25s;
}

.nested-enter-from,
.nested-leave-to {
  transform: translateY(30px);
  opacity: 0;
}
/* 父元素的样式过渡效果 end */

/* 子元素的过渡效果 start */
.nested-enter-active .inner,
.nested-leave-active .inner {
  transition: all 0.3s ease-in-out;
}
.nested-enter-active .inner {
	transition-delay: 0.25s;
}

.nested-enter-from .inner,
.nested-leave-to .inner {
  transform: translateX(30px);
  opacity: 0.001;
}
/* 子元素的过渡效果 end */
</style>
```

:::

但是现在有一个问题，默认情况下，Vue 监听的是根元素的结束信号。但在嵌套动画中：

1. 根元素的动画可能 `0.3` 秒就结束了
2. 内部元素的动画因为延迟了 `0.25` 秒，实际上在 `0.55` 秒后才结束
3. 如果 Vue 在 `0.3` 秒时收到根元素的结束信号就把整个元素移除，那内部元素的动画就被强行中断了！

在这种情况下，你可以通过向 `<Transition>` 组件传入 `duration prop` 来显式指定过渡的持续时间 (以毫秒为单位)。总持续时间应该匹配延迟加上内部元素的过渡持续时间：

```vue
<Transition :duration="550">...</Transition>
```

如果有必要的话，你也可以用对象的形式传入，分开指定进入和离开所需的时间：

```vue
<Transition :duration="{ enter: 500, leave: 800 }">...</Transition>
```

### 性能考量

尽量使用过渡来在合成线程中进行，利用`GPU`加速来提升动画的性能。

## JavaScript 钩子

### 钩子函数

你可以通过监听 `<Transition>` 组件事件的方式在过渡过程中挂上钩子函数：

```vue
<Transition
  @before-enter="onBeforeEnter"
  @enter="onEnter"
  @after-enter="onAfterEnter"
  @enter-cancelled="onEnterCancelled"
  @before-leave="onBeforeLeave"
  @leave="onLeave"
  @after-leave="onAfterLeave"
  @leave-cancelled="onLeaveCancelled">
  <!-- ... -->
</Transition>
```

这些钩子可以与 CSS 过渡或动画结合使用，也可以单独使用。

```js
// 在元素被插入到 DOM 之前被调用
// 用这个来设置元素的 "enter-from" 状态
function onBeforeEnter(el) {}

// 在元素被插入到 DOM 之后的下一帧被调用
// 用这个来开始进入动画
function onEnter(el, done) {
  // 调用回调函数 done 表示过渡结束
  // 如果与 CSS 结合使用，则这个回调是可选参数
  done();
}

// 当进入过渡完成时调用。
function onAfterEnter(el) {}

// 当进入过渡在完成之前被取消时调用
function onEnterCancelled(el) {}

// 在 leave 钩子之前调用
// 大多数时候，你应该只会用到 leave 钩子
function onBeforeLeave(el) {}

// 在离开过渡开始时调用
// 用这个来开始离开动画
function onLeave(el, done) {
  // 调用回调函数 done 表示过渡结束
  // 如果与 CSS 结合使用，则这个回调是可选参数
  done();
}

// 在离开过渡完成、
// 且元素已从 DOM 中移除时调用
function onAfterLeave(el) {}

// 仅在 v-show 过渡中可用
function onLeaveCancelled(el) {}
```

### 纯 JavaScript 过渡

在使用仅由 JavaScript 执行的动画时，最好是添加一个 `:css="false" prop`。这显式地向 Vue 表明可以跳过对 CSS 过渡的自动探测。除了性能稍好一些之外，还可以防止 CSS 规则意外地干扰过渡效果：

```vue {46-48}
<script setup>
import { ref } from 'vue';
import gsap from 'gsap';

const show = ref(true);

function onBeforeEnter(el) {
  gsap.set(el, {
    scaleX: 0.25,
    scaleY: 0.25,
    opacity: 1,
  });
}

function onEnter(el, done) {
  gsap.to(el, {
    duration: 1,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    ease: 'elastic.inOut(2.5, 1)',
    onComplete: done,
  });
}

function onLeave(el, done) {
  gsap.to(el, {
    duration: 0.7,
    scaleX: 1,
    scaleY: 1,
    x: 300,
    ease: 'elastic.inOut(2.5, 1)',
  });
  gsap.to(el, {
    duration: 0.2,
    delay: 0.5,
    opacity: 0,
    onComplete: done,
  });
}
</script>

<template>
  <button @click="show = !show">Toggle</button>

  <Transition @before-enter="onBeforeEnter" @enter="onEnter" @leave="onLeave" :css="false">
    <div class="gsap-box" v-if="show"></div>
  </Transition>
</template>

<style>
.gsap-box {
  background: #42b883;
  margin-top: 20px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
}
</style>
```

::: tip 一些 js 动画库

- [Anime.js](https://animejs.com/)
- [Gsap](https://gsap.com/)

:::

## :star:可复用过渡效果组件

得益于 Vue 的组件系统，过渡效果是可以被封装复用的。要创建一个可被复用的过渡，我们需要为 `<Transition>` 组件创建一个包装组件，并向内传入插槽内容：

```vue
<script>
// JavaScript 钩子逻辑...
</script>

<template>
  <!-- 包装内置的 Transition 组件 -->
  <Transition name="my-transition" @enter="onEnter" @leave="onLeave">
    <slot></slot>
    <!-- 向内传递插槽内容 -->
  </Transition>
</template>

<style>
/*
  必要的 CSS...
  注意：避免在这里使用 <style scoped>
  因为那不会应用到插槽内容上
*/
</style>
```

现在 `MyTransition` 可以在导入后像内置组件那样使用了：

```vue
<MyTransition>
  <div v-if="show">Hello</div>
</MyTransition>
```

## 出现时过渡

如果你想在某个节点初次渲染时应用一个过渡效果，你可以添加 `appear prop`：

```vue
<Transition appear>
  ...
</Transition>
```

## 元素间过渡

除了通过 `v-if / v-show` 切换一个元素，我们也可以通过 `v-if / v-else / v-else-if` 在几个组件间进行切换，只要确保任一时刻只会有一个元素被渲染即可：

```vue
<Transition>
  <button v-if="docState === 'saved'">Edit</button>
  <button v-else-if="docState === 'edited'">Save</button>
  <button v-else-if="docState === 'editing'">Cancel</button>
</Transition>
```

## 过渡模式

## 组件间过渡

`<Transition>` 也可以作用于动态组件之间的切换：

```vue
<Transition name="fade" mode="out-in">
  <component :is="activeComponent"></component>
</Transition>
```

## 动态过渡

`<Transition>` 的 props (比如 name) 也可以是动态的！这让我们可以根据状态变化动态地应用不同类型的过渡：

```vue
<Transition :name="transitionName">
  <!-- ... -->
</Transition>
```

这个特性的用处是可以提前定义好多组 CSS 过渡或动画的 `class`，然后在它们之间动态切换。

## 使用 Key Attribute 过渡

`<Transition>`组件需要看到元素的创建和销毁才能触发动画,如果只是文本内容变化，Vue 认为"元素还是同一个元素"，就不会触发进入/离开动画。

```vue
<span>{{ count }}</span>
```

有时为了触发过渡，你需要强制重新渲染 `DOM` 元素。以计数器组件为例,你需要用 key 来"欺骗" Vue：

```vue
<script setup>
import { ref } from 'vue';
const count = ref(0);

setInterval(() => count.value++, 1000);
</script>

<template>
  <Transition>
    <span :key="count">{{ count }}</span>
  </Transition>
</template>
```
