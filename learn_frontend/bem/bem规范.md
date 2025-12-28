# BEM 规范

## BEM 简介

### 什么 BEM

BEM 是 `Block`（块）、`Element`（元素）、`Modifier`（修饰符）的简写，是一种组件化的 CSS 命名方法和规范，由俄罗斯 `Yandex` 团队所提出。使用 BEM 主要是为了将用户界面划分成独立的块，使开发更为简单和快速，有利于团队协作，方便维护。

### 为什么要选择 BEM

很多新手在开始写网页时，在命名方面可能都比较随心所欲。但是在一个正式的项目中，会有很多开发人员同时进行开发，如果每个开发人员都用自己的一套命名，这样会造成命名的识别度和一致性成为很大的问题，还会造成命名污染。这时使用 BEM 命名方法就可以很好的解决这个问题。
当然使用 BEM 还有很多其他的好处，例如每个块之间都是独立的，因此不会遇到层叠带来的问题。且这些块可以多次重用，可以减少必须维护的 css 代码量等。

## BEM 的使用

### BEM 命名规则

- 块名称为其元素和修饰符定义了命名空间。
- 块名称与元素名称之间用双下划线\_\_分隔。
- 块名称与修饰符或元素与修饰符之间用双连字符--分隔。
- 命名一般使用小写字母。
- 单词之间可以使用-分隔。

命名约定的模式有如下几种：其中`block`代表了更高级别的抽象或组件，`block__element`代表`.block`的后代，用于形成一个完整的 block 的整体，`block--modifier`代表`block`的不同状态或不同版本。使用两个连字符和下划线时为了让自己定义的块可以用单个连字符来界定。

比如按钮盒子假如是块的话（使用`.btn-box`来修饰），那么按钮就是按钮区这个块中的元素（可以使用`.btn-box__btn`来修饰）,那么红色的按钮中的红色就是修饰符（使用`.btn-box__btn—red`来修饰）

### Block

Block 是一个功能独立的页面组件，可重复使用，也支持嵌套。我们平时浏览的网页，都是由”块“构成的。每个块的块名必须是唯一的，用于明确指出它所描述的是哪个块。例如某个块的名字为 head，那我们就能够根据这个块名推测出这应该是一个头部块，位于网页的头部。

在使用块时，块不应影响其环境，也就是不应设置块的外部几何形状或位置。需要注意的是块应该是独立的，当在页面中添加，删除，或者是移动某个块时，不需要对块进行修改。

下面一共有 3 个块，分别是`top`、`search-form`、`bottom`，块之间可以嵌套：

```html
<div class="top">
  <form class="search-form">搜索</form>
</div>
<div class="bottom">底部</div>
```

我们在实际应用中，需要保证每个块都是独立的。举个例子说明，例如我们将`top`块中的`search-form`块移动到`bottom`块中，想要保证整体不会乱，就需要`search-form`块的 CSS 必须是独立的。如果我们在写 CSS 时，直接将`search-form`块嵌套在 top 块下是不好的：

```css
/*错误写法*/
.top .search-form {
  ...;
} /*表示只有在top块内的search-form块才会应用此CSS样式*/
.bottom {
}
```

这样的话，后续如果我们要在 HTML 代码中移动`search-form`块（或重用）到`bottom`块中时，页面样式肯定是会乱的，这样又增加了我们的工作量。我们一开始就应该考虑好后续可能会出现的情况，所以不会这样写 CSS。
正确写法如下所示：

```css
/*正确写法*/
.top {
  ...;
}
.bottom {
}
.search-form {
  ...;
}
```

### Element

元素是块的组成部分，是依赖上下文的。元素的名称用于描述它是什么，而不是它的状态。元素在所属的块中指定位置时，才能表现出应有的功能。
元素之间可以彼此嵌套，一个元素总是一个模块的一部分，而不是另一个元素的一部分，这意味着元素的名称不能被定义为 `block__elem1__elem2` 这样的层次结构。
示例：

```html
<div class="top">
  <!--top块中的search-for块-->
  <form class="search-form">
    <!--在search-form块中的input元素-->
    <input class="search-form__input" />
    <!--在search-form块中的button元素-->
    <button class="search-form__button">搜索按钮</button>
  </form>
</div>
```

此时我们编写 CSS 代码时，可以将`search-form__input`和`search-form__button`放在`search-form`块中。

```css
.search-form .search-form__input {
  ...;
}
.search-form .search-form__button {
  ...;
}
```

### Modifier

修饰符可以与块、元素一起工作。我们经常需要在已经定义好的块或者元素上，做一些小调整来满足特定的小功能。通常是外观或行为有些许改变，这时可以使用修饰符来处理。注意，修饰符不能单独使用，而且必须绑定在对应的块或元素上，不能混搭。
为什么修饰符一定要包含块名或元素名呢？

- 因为每一个块都会建立独立的命名空间，可以有效的减少命名冲突。
- 可以显示说明该修饰符所对应的块或元素，防止混淆。
- 不包含块名或元素名，使用修饰符就必须使用组合选择器，这会增加样式权重使其难以覆盖。

示例：例如当我们添加多个按钮时，一个红色按钮、一个绿色按钮、一个蓝色按钮、一个黄色按钮：

```html
<div class="banner__btn">
  <button class=".button .banner__btn--red"></button>
  <button class=".button .banner__btn--green"></button>
  <button class=".button .banner__btn--blue"></button>
  <button class=".button .banner__btn--yellow"></button>
</div>
```

CSS 代码如下所示：

```css
.banner__btn--red {
  background-color: red;
}
.banner__btn--green {
  background-color: green;
}
.banner__btn--blue {
  background-color: blue;
}
.banner__btn--yellow {
  background-color: yellow;
}
```

## BEM 使用技巧

### 什么时候使用 BEM

当我们使用 BEM 方法命名时，我们要知道哪些东西是应该使用 BEM 格式的。因为并不是每个地方都应该使用`BEM`命名方式，只有当需要明确关联性的模块关系时，才需要使用 `BEM` 格式。
例如仅仅是单独的公共样式，像定义字体大小：

```css
.f16 {
  font-size: 16px;
}
.f18 {
  font-size: 18px;
}
```

### 使用混合拆分样式

在 BEM 中，位置和布局样式通过父级块来进行设置。这就需要通过混合组合块与元素，组合多个实体（块、元素、修饰符都被称作 BEM 实体）的表现与样式，同时不耦合代码。示例：

```html
<!-- top 块 -->
<div class="top">
  <!-- search-form块混合top块的search-form元素 -->
  <form class="search-form top__search-form">搜索</form>
</div>
```

这样就通过混合的方式把位置样式从块中剥离了，可以在`.top__search-form`中设置表单的位置或浮动等样式，保持了 `search-form`块的样式独立，对其完整样式代码进行了解耦。在传统的命名方式中，我们经常通过嵌套的方式，如`.top .search-form`来对局部样式进行调整。但是这样做会改变选择器的权重。在 BEM 的思想中，保持选择器扁平和低权重是一个准则。
因此在使用 BEM 命名时需要格外注意遵循它的工作方式：

- 不在块里设置位置、布局相关的样式，只设置基本样式。
- 通过混合的方式，在作为父级块的元素时设置布局样式。
- 适时拆分元素为独立的块，解耦样式并形成新的命名空间。

### 适时使用嵌套选择器

那是不是说，我们使用 BEM 命名方式时，不能嵌套选择器呢？也不完全时这样。BEM 只是建议尽量保持嵌套层级越低越好，因为 CSS 的权重问题很多人处理不好，最终很可能导致不停的嵌套或为了增加权重而进行的无意义嵌套和 `!important`，这无疑增加了代码的耦合。
可能你会想问，那到底什么时候用嵌套，当你需要通过块状态对内部元素进行调整时，就非常适合使用嵌套啦。示例：

```css
.search-form .search-form__input {
}
.nav_content_dark .nav_item {
}
```

### 开闭原则

开放封闭原则是所有面向对象原则的核心，是说软件实体应该是可扩展，而不可修改的。即对扩展是开放的，而对修改是封闭的。如果将这个原则应用到 BEM 的使用上，就是说我们应该使用`modifier`去拓展`block`或`element`的样式，而不应该去修改`block`或`element`的基础样式。
例如有两个按钮，如下所示：

```html
<div>
  <button class="btn">正确</button>
  <button class="btn">错误</button>
</div>

<style>
  .btn {
    font-size: 16px;
    color: white;
    border: none;
    padding: 10px 8px;
    display: inline-block;
    background-color: green;
  }
</style>
```

如果要将名为错误的按钮的背景颜色改为红色，我们需要给`.btn`加一个`modifier`，而不是直接去修改`.btn`的样式：

```html
<div>
  <button class="btn">正确</button>
  <button class="btn btn--error">错误</button>
</div>

.btn{ font-size:16px; color:white; border:none; padding:10px 8px; display: inline-block; background-color:green; }
.btn--error{ background-color:red; }
```

## 总结

- `block`就是命名空间，就是前端独立划分的模块
- `element`就是标识是元素是什么，是按钮还是输入框
- `modifier`就是表示元素的状态，比如这个按钮是红色还是黄色，是禁用还是启用
