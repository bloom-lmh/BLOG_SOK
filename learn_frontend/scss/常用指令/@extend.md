---
order: 303
---

# @extend 继承指令详解

[[toc]]

## 不使用继承实现警告框

在设计网页的时候常常遇到这种情况：一个元素使用的样式与另一个元素完全相同，但又添加了额外的样式。通常会在 HTML 中给元素定义两个 class，一个通用样式，一个特殊样式。简而言之也就是通过继承通用样式然后再添加一些特殊的样式,接下来以警告框为例进行讲，解 4 种类型:

- `info`: 信息提示框
- `success`: 成功提示框
- `warning`: 警告提示框
- `error`: 错误提示框

所有警告框的基本样式（风格、字体大小、内边距、边框等...） ，因为我们通常会定义一个通用 `alert` 样式

```scss
.alert {
  padding: 15px;
  margin-bottom: 20px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
}
```

不同警告框单独风格：

```scss
.alert-info {
  color: #31708f;
  background-color: #d9edf7;
  border-color: #bce8f1;
}

.alert-success {
  color: #3c763d;
  background-color: #dff0d8;
  border-color: #d6e9c6;
}
.alert-warning {
  color: #8a6d3b;
  background-color: #fcf8e3;
  border-color: #faebcc;
}

.alert-danger {
  color: #a94442;
  background-color: #f2dede;
  border-color: #ebccd1;
}
```

这样使用：

```html
<div class="alert alert-info">信息！请注意这个信息。</div>

<div class="alert alert-success">成功！很好地完成了提交。</div>

<div class="alert alert-warning">警告！请不要提交。</div>

<div class="alert alert-danger">错误！请进行一些更改。</div>
```

效果：
![@extend](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251009144534636.png)

## 使用继承来实现警告框

基本样式我们没有变，主要是各个警告框单独的样式

```scss
.alert-info {
  @extend .alert;
  color: #31708f;
  background-color: #d9edf7;
  border-color: #bce8f1;
}

.alert-success {
  @extend .alert;
  color: #3c763d;
  background-color: #dff0d8;
  border-color: #d6e9c6;
}
.alert-warning {
  @extend .alert;
  color: #8a6d3b;
  background-color: #fcf8e3;
  border-color: #faebcc;
}

.alert-danger {
  @extend .alert;
  color: #a94442;
  background-color: #f2dede;
  border-color: #ebccd1;
}
```

这样编译后：

```scss
.alert,
.alert-info,
.alert-success,
.alert-warning,
.alert-danger {
  padding: 15px;
  margin-bottom: 20px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
}

.alert-info {
  color: #31708f;
  background-color: #d9edf7;
  border-color: #bce8f1;
}
.alert-success {
  color: #3c763d;
  background-color: #dff0d8;
  border-color: #d6e9c6;
}
.alert-warning {
  color: #8a6d3b;
  background-color: #fcf8e3;
  border-color: #faebcc;
}
.alert-danger {
  color: #a94442;
  background-color: #f2dede;
  border-color: #ebccd1;
}
```

使用时就不须要再写基本类了

```html
<div class="alert-info">信息！请注意这个信息。</div>

<div class="alert-success">成功！很好地完成了提交。</div>

<div class="alert-warning">警告！请不要提交。</div>

<div class="alert-danger">错误！请进行一些更改。</div>
```

## 使用多个@extend

```scss
.alert {
  padding: 15px;
  margin-bottom: 20px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
}

.important {
  font-weight: bold;
  font-size: 14px;
}

.alert-danger {
  @extend .alert;
  @extend .important;
  color: #a94442;
  background-color: #f2dede;
  border-color: #ebccd1;
}
```

## extend 多层继承

上面的方式还可以写成

```scss
.alert {
  padding: 15px;
  margin-bottom: 20px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
}

.important {
  @extend .alert;
  font-weight: bold;
  font-size: 14px;
}

.alert-danger {
  @extend .important;
  color: #a94442;
  background-color: #f2dede;
  border-color: #ebccd1;
}
```

## %占位符

你可能发现被继承的 `css` 父类并没有被实际应用，也就是说 `html` 代码中没有使用该类，它的唯一目的就是扩展其他选择器。对于该类，可能不希望被编译输出到最终的 `css` 文件中，它只会增加 `CSS` 文件的大小，永远不会被使用。这就是占位符选择器的作用。占位符选择器类似于类选择器，但是，它们不是以句点(`.`)开头，而是以百分号(`%`)开头。当在 `Sass` 文件中使用占位符选择器时，它可以用于扩展其他选择器，但不会被编译成最终的 `CSS`。之前的进行改写

```scss
%alert {
  padding: 15px;
  margin-bottom: 20px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
}
.alert-info {
  @extend %alert;
  color: #31708f;
  background-color: #d9edf7;
  border-color: #bce8f1;
}

.alert-success {
  @extend %alert;
  color: #3c763d;
  background-color: #dff0d8;
  border-color: #d6e9c6;
}

.alert-warning {
  @extend %alert;
  color: #8a6d3b;
  background-color: #fcf8e3;
  border-color: #faebcc;
}

.alert-danger {
  @extend %alert;
  color: #a94442;
  background-color: #f2dede;
  border-color: #ebccd1;
}
```

编译后：

```scss
.alert-info,
.alert-success,
.alert-warning,
.alert-danger {
  padding: 15px;
  margin-bottom: 20px;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 12px;
}

.alert-info {
  color: #31708f;
  background-color: #d9edf7;
  border-color: #bce8f1;
}
.alert-success {
  color: #3c763d;
  background-color: #dff0d8;
  border-color: #d6e9c6;
}
.alert-warning {
  color: #8a6d3b;
  background-color: #fcf8e3;
  border-color: #faebcc;
}
.alert-danger {
  color: #a94442;
  background-color: #f2dede;
  border-color: #ebccd1;
}
```
