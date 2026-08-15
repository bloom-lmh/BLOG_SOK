---
order: 279
---

# Class 与 Style 绑定

## 介绍

和绑定其它属性一样，我们也可以用 `v-bind` 指令来绑定 `class` 和 `style` 属性。Vue 专门为 `class` 和 `style` 的 `v-bind` 用法提供了特殊的功能增强。除了字符串外，表达式的值也可以是对象或数组。

## 绑定 class 属性

### 绑定字符串

如果你只想绑定一个字符串到 `class` 属性上，可以直接将字符串用双引号括起来：

```vue
<div :class="'active'"></div>
```

最终的 `class` 值为 `"active"`。

### 绑定对象

你可以将一个对象绑定到 `class` 属性上，对象中值为`true`的属性键名会保留下来作为`class`名，比如：

::: code-group

```vue [形式一]
<!-- 最终class为"active" -->
<div v-bind:class="{ active: isActive, 'text-danger': hasError }"></div>

<script scoped>
const isActive = ref(true);
const hasError = ref(false);
</script>
```

```vue [形式二]
<!-- 最终的class为"active" -->
<div :class="classObject"></div>

<script scoped>
const classObject = reactive({
  active: true,
  'text-danger': false,
});
</script>
```

:::
当然你也可以使用计算属性，只要返回的是一个对象即可：

```vue
<div :class="classObject"></div>
<script scoped>
const isActive = ref(true);
const error = ref(null);

const classObject = computed(() => ({
  active: isActive.value && !error.value,
  'text-danger': error.value && error.value.type === 'fatal',
}));
</script>
```

::: tip 属性合并
`:class` 指令也可以和一般的 `class attribute` 共存，比如

```vue
<div class="static" :class="{ active: isActive, 'text-danger': hasError }"></div>
<script scoped>
const isActive = ref(true);
const hasError = ref(true);
</script>
```

最终的渲染为：

```html
<div class="static active text-danger"></div>
```

:::

### 绑定数组

你也可以将一个数组绑定到 `class` 属性上，数组中的每一项都作为一个 `class` 名，比如：

```vue
<div :class="[isActive ? activeClass : '', errorClass]"></div>
<script>
const isActive = ref(true);
const activeClass = 'active';
const errorClass = 'text-danger';
</script>
```

`errorClass`会一直保留，而 `activeClass` 会根据 `isActive` 的值而切换。所以最终的渲染结果为:

```html
<div class="active text-danger"></div>
```

::: tip 数组中嵌套对象
当采用上面的形式时如果出现多个依赖条件的 class ，会有些冗长。因此也可以在数组中嵌套对象：

```vue
<div :class="[{ [activeClass]: isActive }, errorClass]"></div>
```

:::

### 在组件上使用

在组件上使用时会展现出透传的特性。

1. 当组件只有单个根节点时：传递给组件的 `class`属性会自动应用到根节点上，并与该元素上已有的 `class` 合并。
2. 当组件有多个根节点时：你将需要指定哪个根元素来接收这个 class。你可以通过组件的 `$attrs` 属性来指定接收的元素：

```vue
<!-- MyComponent 模板使用 $attrs 时 -->
<p :class="$attrs.class">Hi!</p>
<span>This is a child component</span>
```

## 绑定 style 属性

`style` 属性的绑定和 `class` 属性的绑定类似，也可以用对象或数组来绑定样式。

### 绑定对象

你可以将一个对象绑定到 `style` 属性上，对象中的属性会应用到`style`属性中
::: code-group

```vue [形式一]
<!-- 最终style为"color:red;font-size:14px" -->
<div v-bind:style="{ color: activeColor, fontSize: fontSize + 'px' }"></div>

<script>
const activeColor = ref('red');
const fontSize = ref(14);
</script>
```

```vue [形式二]
<!-- 最终的style为"color:red;font-size:14px" -->
<div :style="styleObject"></div>

<script>
const styleObject = reactive({
  color: 'red',
  fontSize: '14px',
});
</script>
```

:::

同样的和绑定`class`属性类似:

1. 如果样式对象需要更复杂的逻辑，也可以使用返回样式对象的计算属性。
2. `:style` 指令也可以和常规的 `style attribute` 共存，就像 `:class`。

::: tip 属性的键的形式
尽管推荐使用 `camelCase`，但 `:style` 也支持 `kebab-cased` 形式的 CSS 属性 key (对应其 CSS 中的实际名称)，例如：

```vue
<div :style="{ 'font-size': fontSize + 'px' }"></div>
```

:::

### 绑定数组

我们还可以给 `:style` 绑定一个包含多个样式对象的数组。这些对象会被合并后渲染到同一元素上：

```vue
<div :style="[baseStyles, overrideStyles]"></div>
```

### 自动前缀

当你在 `:style` 中使用了需要浏览器特殊前缀的 CSS 属性时，Vue 会自动为他们加上相应的前缀。Vue 是在运行时检查该属性是否支持在当前浏览器中使用。如果浏览器不支持某个属性，那么将尝试加上各个浏览器特殊前缀，以找到哪一个是被支持的。

### 样式多值

你可以对一个样式属性提供多个 (不同前缀的) 值，举例来说：

```vue
<div :style="{ display: ['-webkit-box', '-ms-flexbox', 'flex'] }"></div>
```

数组仅会渲染浏览器支持的最后一个值。在这个示例中，在支持不需要特别前缀的浏览器中都会渲染为 `display: flex`。
