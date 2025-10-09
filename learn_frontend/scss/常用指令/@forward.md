# @forward

[[toc]]

## 何为@forward

通过 `@forward` 加载一个模块的成员，并将这些成员当作自己的成员对外暴露出去，类似于类似于 `es6` 的 `export ...`，通常用于跨多个文件组织 Sass 库

## 基本使用

假设你有以下文件结构：
::: code-group

```bash [项目目录]
sass/
├── _variables.scss
├── _mixins.scss
└── styles.scss
```

```scss [_variables.scss]
$primary-color: #007bff;
$font-size-base: 16px;
```

```scss [_mixins.scss]
@mixin center {
  display: flex;
  justify-content: center;
  align-items: center;
}
```

```scss [styles.scss 导出模块]
// 将 variables 和 mixins 转发出去
@forward 'variables';
@forward 'mixins';
```

```scss [在另一个文件中使用 main.scss]
@use 'styles'; // 使用入口文件

.button {
  color: styles.$primary-color;
  @include styles.center;
}
```

:::

## 仅转发部分内容

你可以控制哪些内容被转发，哪些被隐藏。

```scss
// 只转发 $primary-color，隐藏 $font-size-base
@forward 'variables' hide $font-size-base;

// 或者：只显示某些项
@forward 'variables' show $primary-color;
```

## 添加前缀（命名空间）

你可以为转发的内容添加前缀，避免命名冲突。

```scss
// 将 _mixins.scss 中的所有内容加上 `mixin-` 前缀
@forward 'mixins' as mixin-*;
```

这样，在使用时：

```scss
@use 'styles';

.button {
  @include styles.mixin-center; // 原来的 `center` 变成了 `mixin-center`
}
```

::: warning 注意
`as` 后面必须以 `*` 结尾，表示通配
:::

::: tip 小技巧
结合 show/hide 和 as

```scss
@forward 'mixins' as util-* show center;
```

这样，只转发 `center` 这个 mixin，并将其命名空间改为 `util-center`
:::
