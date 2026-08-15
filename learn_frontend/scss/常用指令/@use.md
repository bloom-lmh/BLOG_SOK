---
order: 306
---

# @use

[[toc]]

## 何为@use

从其他 Sass 样式表加载 `mixin，function` 和变量，并将来自多个样式表的 CSS 组合在一起，`@use` 加载的样式表被称为“模块”，多次引入只包含一次。

::: tip 和@import 的区别
@use 也可以看作是对`@import`的增强。其语法为：`@use '<url>' [as alias|namespace]`
:::

## 加载普通 SCSS、CSS

use 下面的`_common.scss`

```scss
$font-size: 14px !default;
* {
  margin: 0;
  padding: 0;
  font-size: $font-size;
  color: #333;
}

@function column-width($col, $total) {
  @return percentage($col/$total);
}

@mixin bgColor($bg-color: #f2f2f2) {
  background-color: $bg-color;
}
```

use 下面的`about.css`

```css
h1 {
  font-size: 24px;
}
```

使用

```scss
@use 'use/common';
@use 'use/about';
```

## 模块别名

通过模块命名可以解决命名空间冲突的问题
新增`_global.scss`

```scss
$font-size: 28px;
@mixin base($color: #f00) {
  color: $color;
}

.gclass {
  background-color: #f00;
}
```

`@import` 的方式：当多次重复使用模块式会导致属性出现多次，后面的属性会覆盖前面的属性

```scss
@import 'use/common';
@import 'use/global';
@import 'use/global';
body {
  font-size: $font-size;
  @include base('#FFF');
  @include base('#000');
  width: column-width(3, 12);
  @include bgColor('#F00');
}
```

![@import](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251009150131041.png)

`@use` 的方式：通过为模块起别名的方式能够很好的避免属性重复的问题

```scss
@use 'use/common';
@use 'use/global' as g1;
@use 'use/global' as g2;
body {
  font-size: common.$font-size;
  @include g1.base('#FFF');
  @include g2.base('#000');
  width: common.column-width(3, 12);
  @include common.bgColor('#F00');
}
```

通过`@use` 引入的样式默认把文件名作为模块名使用，你可以通过 as 的形式重新取一个别名

## 取消别名(慎用)

可以`@use "<url>" as *` 来取消命名空间，这种方式加载的模块被提升为全局模块

```scss
@use 'use/common';
@use 'use/global' as *;
@use 'use/global' as g2;
body {
  font-size: $font-size;
  @include base('#FFF');
  @include g2.base('#000');
  width: common.column-width(3, 12);
  @include common.bgColor('#F00');
}
```

## 定义私有成员

如果加载的模块内部有变量只想在模块内使用，可使用`-`或`_`定义在变量头即可，例如：

```scss
$-font-size: 14px;
* {
  margin: 0;
  padding: 0;
  font-size: $-font-size;
  color: #333;
}
```

在外部模块使用私有变量会报错

```scss
@use 'use/common';
@use 'use/global' as *;
@use 'use/global' as g2;
body {
  font-size: common.$-font-size; // 报错 Error: Private members can't be accessed from outside their modules.
  @include base('#FFF');
  @include g2.base('#000');
}
```

## 修改默认值

通过`!default`能为变量定义默认值
`common.scss`文件

```scss
$font-size: 14px !default;
* {
  margin: 0;
  padding: 0;
  font-size: $font-size;
  color: #333;
}
```

`@use`引入时可通过`with(...)`修改默认值

```scss
@use 'use/common' with (
  $font-size: 18px
);
common.$font-size: 28px; // 也可能通过这种方式覆盖
body {
  font-size: common.$font-size;
}
```

![@use](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251009150814790.png)

## 默认加载 index.scss

创建`use/_index.scss`文件：可以视为汇总文件

```scss
@use 'common' with (
  $font-size: 16px
);
@use 'global' as *;
@use 'global' as g2;
common.$font-size: 28px; // 也可能通过这种方式覆盖
body {
  font-size: common.$font-size;
  @include base('#FFF');
  @include g2.base('#000');
}
```

在 index.scss 文件中默认引入

```scss
@use 'use';
// 等价于@use 'use/index';
```

## @use 使用总结

- `@use` 引入同一个文件多次，不会重复引入，而`@import` 会重复引入
- `@use` 引入的文件都是一个模块，默认以文件名作为模块名，可通过 `as alias` 取别名
- `@use` 引入多个文件时，每个文件都是单独的模块，相同变量名不会覆盖，通过模块名访问，而`@import` 变量会被覆盖
- `@use` 方式可通过 `@use 'xxx' as *`来取消命名空间，建议不要这么做
- `@use` 模块内可通过`-` 或`_`来定义私有成员，也就是说 `_`或者`-`开头的 `Variables mixins functions` 不会被引入
- `@use` 模块内变量可通过`！default` 定义默认值，引入时可通用 `with（...）`的方式修改
- 可定义`-index.scss` 或`_index.scss` 来合并多个 `scss` 文件，它是`@use` 默认加载的文件
