# @at-root

[[toc]]

## @at-root 的作用

`@at-root`可以使被嵌套的选择器或属性跳出嵌套，就是将选择器放到根节点而不是作为子节点，比如有以下嵌套：

::: code-group

```scss [普通嵌套]
.parent {
  font-size: 12px;
  .child {
    font-size: 14px;
    .son {
      font-size: 16px;
    }
  }
}
```

```css [编译结果]
.parent {
  font-size: 12px;
}
.parent .child {
  font-size: 14px;
}
.parent .child .son {
  font-size: 16px;
}
```

:::

使用`@at-root`可以作用某个选择器使其跳出嵌套,比如让`.child`和`.son`跳出`.parent`选择器

::: code-group

```scss [使用@at-root]
.parent {
  font-size: 12px;
  @at-root .child {
    font-size: 14px;
    @at-root .son {
      font-size: 16px;
    }
  }
}
```

```scss [编译结果]
.parent {
  font-size: 12px;
}
.child {
  font-size: 14px;
}
.son {
  font-size: 16px;
}
```

:::

还有让`.child-1`和`.child-2`跳出`.parent` 选择器

::: code-group

```scss [使用@at-root]
.parent {
  font-size: 12px;
  @at-root {
    .child-1 {
      font-size: 14px;
    }
    .child-2 {
      font-size: 16px;
    }
  }
}
```

```scss [编译结果]
.parent {
  font-size: 12px;
}
.child-1 {
  font-size: 14px;
}
.child-2 {
  font-size: 16px;
}
```

:::

## &模拟@at-root 作用

::: code-group

```scss [&的使用]
.foo {
  & .bar {
    color: gray;
  }
}

.foo {
  & {
    color: gray;
  }
}

.foo {
  .bar & {
    color: gray;
  }
}
```

```css [编译结果]
.foo .bar {
  color: gray;
}

.foo {
  color: gray;
}

.bar .foo {
  color: gray;
}
```

:::
这跟前面加`@at-root`效果是一样的

## 使用@at-root 结合#{&}实现 BEM 效果

BEM 完整命名规则：`block-name__element-name--modifier-name` (也可以换成驼峰式命名)
官方网站最新推出：`block-name__element-name_modifier-name`
比如 BEM 的一则样式：

```scss
.block {
  width: 1000px;
}
.block__element {
  font-size: 12px;
}
.block--modifier {
  font-size: 14px;
}
.block__element--modifier {
  font-size: 16px;
}
```

实现

```scss
.block {
  width: 1000px;
  @at-root #{&}__element {
    font-size: 12px;
    @at-root #{&}--modifier {
      font-size: 16px;
    }
  }
  @at-root #{&}--modifier {
    font-size: 14px;
  }
}

//或

.block {
  width: 1000px;
  @at-root {
    #{&}__element {
      font-size: 12px;
      @at-root #{&}--modifier {
        font-size: 16px;
      }
    }
    #{&}--modifier {
      font-size: 14px;
    }
  }
}

// 实现上也能直接用&实现
.block {
  width: 1000px;
  &__element {
    font-size: 12px;
    &--modifier {
      font-size: 16px;
    }
  }
  &--modifier {
    font-size: 14px;
  }
}
```

## @at-root (without: …)和@at-root (with: …)的使用

默认`@at-root`只会跳出选择器嵌套，而不能跳出`@media`或`@support`，如果要跳出这两种，则需使用`@at-root (without: media)`，`@at-root (without: support)`。这个语法的关键词有四个：

1. `all`（表示所有）
2. `rule`（表示常规 css）
3. `media`（表示 media）
4. `supports`（表示 supports）
