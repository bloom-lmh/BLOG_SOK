# 组件通信-v-model

[[toc]]

## 基本用法

从 Vue `3.4` 开始，推荐的实现方式是使用 `defineModel()` 宏，`v-model` 可以在组件上使用以实现双向绑定,：

:::code-group

```vue [父组件]
<script setup>
import Child from './Child.vue';
import { ref } from 'vue';

const msg = ref('Hello World!');
</script>

<template>
  <h1>{{ msg }}</h1>
  <Child v-model="msg" />
</template>
```

```vue [子组件]
<script setup>
const model = defineModel();
</script>

<template>
  <span>My input</span>
  <input v-model="model" />
</template>
```

:::

`defineModel()` 返回的值是一个 ref。它可以像其他 ref 一样被访问以及修改，不过它能起到在父组件和当前变量之间的双向绑定的作用：
它的 `.value` 和父组件的 `v-model` 的值同步；当它被子组件变更了，会触发父组件绑定的值一起更新。所以上面的案例子组件的输入值发生变化会同步到父组件的 `msg` 变量中。

## 底层机制

`v-model`本质上就是一个语法糖（便利宏），是 props 和 emit 的语法糖，props 可以实现父子组件通信，emit 可以实现子父组件通信，两张组合就能实现双向绑定，对于上面的内容编译器将其展开为以下内容：

- 一个名为 `modelValue` 的 prop，本地 ref 的值与其同步；
- 一个名为 `update:modelValue` 的事件，当本地 ref 的值发生变更时触发。

```html
<script setup>
  // 首先定义props
  const props = defineProps(['modelValue']);
  // 然后以props加上前缀update作为事件名
  const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <input :value="props.modelValue" @input="emit('update:modelValue', $event.target.value)" />
</template>
```

然后，父组件中的 `v-model="foo"` 将被编译为：

```html
<Child :modelValue="foo" @update:modelValue="$event => (foo = $event)" />
```

::: tip 总结
`definelModel()`底层就是`defineProps`+`defineEmits`的组合，它声明了一个名为 `modelValue` 的 prop，本地 ref 的值与其同步；一个名为 `update:modelValue` 的事件，当本地 ref 的值发生变更时触发。
:::

## defineModel 传递选项

因为 `defineModel` 声明了一个 prop，你可以通过给 `defineModel` 传递选项，来声明底层 prop 的选项：

```js
// 使 v-model 必填
const model = defineModel({ required: true });

// 提供一个默认值
const model = defineModel({ default: 0 });
```

::: warning
如果为 `defineModel prop` 设置了一个 default 值且父组件没有为该 prop 提供任何值，会导致父组件与子组件之间不同步。在下面的示例中，父组件的 myRef 是 undefined，而子组件的 model 是 1：

```vue
<script setup>
const model = defineModel({ default: 1 });
</script>
```

```vue
<script setup>
const myRef = ref();
</script>

<template>
  <Child v-model="myRef"></Child>
</template>
```

:::

## 多个 model 绑定

利用刚才在 `v-model` 的参数小节中学到的指定参数与事件名的技巧，我们可以在单个组件实例上创建多个 `v-model` 双向绑定。
组件上的每一个 v-model 都会同步不同的 prop，而无需额外的选项：

```vue
<UserName v-model:first-name="first" v-model:last-name="last" />
```

```vue
<script setup>
const firstName = defineModel('firstName');
const lastName = defineModel('lastName');
</script>

<template>
  <input type="text" v-model="firstName" />
  <input type="text" v-model="lastName" />
</template>
```

## 处理 v-model 修饰符

在学习输入绑定时，我们知道了 v-model 有一些内置的修饰符，例如 `.trim，.number` 和 `.lazy`。在某些场景下，你可能想要一个自定义组件的 v-model 支持自定义的修饰符。我们来创建一个自定义的修饰符 `capitalize`，它会自动将 v-model 绑定输入的字符串值第一个字母转为大写：

```vue
<MyComponent v-model.capitalize="myText" />
```

通过像这样解构 `defineModel()` 的返回值，可以在子组件中访问添加到组件 v-model 的修饰符：

```vue
<script setup>
const [model, modifiers] = defineModel();

// 访问到父组件指定的capitalize修饰符
console.log(modifiers); // { capitalize: true }
</script>

<template>
  <input type="text" v-model="model" />
</template>
```

为了能够基于修饰符选择性地调节值的读取和写入方式，我们可以给 `defineModel()` 传入 get 和 set 这两个选项。这两个选项在从模型引用中读取或设置值时会接收到当前的值，并且它们都应该返回一个经过处理的新值。下面是一个例子，展示了如何利用 set 选项来应用 `capitalize` (首字母大写) 修饰符：

```vue
<script setup>
const [model, modifiers] = defineModel({
  set(value) {
    if (modifiers.capitalize) {
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
    return value;
  },
});
</script>

<template>
  <input type="text" v-model="model" />
</template>
```
