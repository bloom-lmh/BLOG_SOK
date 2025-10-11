# 组件通信-props

[[toc]]

## 父向子通信-props

`Props` 是一种特别的 `attributes`，你可以在组件上声明注册，通过它就能实现父向子组件传递数据。

### 为组件声明 props

一个组件需要显示声明它所能接受的 `props`，父组件可以通过 `props` 向子组件传递数据。在使用 `<script setup>` 的单文件组件中，props 可以使用 `defineProps()` 宏来声明：

```vue
<script setup>
const props = defineProps(['foo']);

console.log(props.foo);
</script>
```

在没有使用 `<script setup>` 的组件中，props 可以使用 props 选项来声明：

```js
export default {
  props: ['foo'],
  setup(props) {
    // setup() 接收 props 作为第一个参数
    console.log(props.foo);
  },
};
```

### Props 的几种定义方式

::: code-group

```js [数组形式]
export default {
  props: ['foo'],
  setup(props) {
    // setup() 接收 props 作为第一个参数
    console.log(props.foo);
  },
};
```

```js [对象形式]
// 使用 <script setup>
defineProps({
  title: String,
  likes: Number,
});
// 非 <script setup>
export default {
  props: {
    title: String,
    likes: Number,
  },
};
```

```vue [ts泛型形式]
<script setup lang="ts">
defineProps<{
  title?: string;
  likes?: number;
}>();
</script>
```

:::

::: tip 属性类型
对于以对象形式声明的每个属性，`key` 是 `prop` 的名称，而值则是该 `prop` 预期类型的**构造函数**。
:::

### 响应式 Props 解构（3.5+）

`defineProps()`定义的 Props 是一个`reactive`响应式的对象,也就是说解构后属性会失去响应性。在 3.4 及以下版本,foo 是一个实际的常量，永远不会改变。也就是说监听解构后的常量，`watchEffect`函数只会执行一次

```ts
const { foo } = defineProps(['foo']);

watchEffect(() => {
  // 在 3.5 之前只运行一次
  // 在 3.5+ 中在 "foo" prop 变化时重新执行
  console.log(foo);
});
```

在 3.5 及以上版本，当在同一个 `<script setup>` 代码块中访问由 defineProps 解构的变量时，Vue 编译器会自动在前面添加 props。因此，上面的代码等同于以下代码：

```ts
const props = defineProps(['foo']);

watchEffect(() => {
  // `foo` 由编译器转换为 `props.foo`
  console.log(props.foo);
});
```

### 动态 Props

至此，你已经见过了很多像这样的静态值形式的 props：

```vue
<BlogPost title="My journey with Vue" />
```

相应地，还有使用 v-bind 或缩写 : 来进行动态绑定的 props：

```vue
<!-- 根据一个变量的值动态传入 -->
<BlogPost :title="post.title" />

<!-- 根据一个更复杂表达式的值动态传入 -->
<BlogPost :title="post.title + ' by ' + post.author.name" />
```

### 单向数据流（如何改变子 props）

所有的 props 都遵循着单向绑定原则，props 因父组件的更新而变化，自然地将新的状态向下流往子组件，而不会逆向传递。这避免了子组件意外修改父组件的状态的情况(这会导致数据流混乱和难以理解)，所以你不应该在子组件中去更改一个 prop

```ts
const props = defineProps(['foo']);

// ❌ 警告！prop 是只读的！
props.foo = 'bar';
```

导致你想要更改一个 prop 的需求通常来源于以下两种场景：

1. prop 被用于传入初始值；而子组件想在之后将其作为一个局部数据属性。在这种情况下，最好是新定义一个局部数据属性，从 props 上获取初始值即可：

```ts
const props = defineProps(['initialCounter']);

// 计数器只是将 props.initialCounter 作为初始值
// 像下面这样做就使 prop 和后续更新无关了
const counter = ref(props.initialCounter);
```

2. 需要对传入的 prop 值做进一步的转换。在这种情况中，最好是基于该 prop 值定义一个计算属性：

```ts
const props = defineProps(['size']);

// 该 prop 变更时计算属性也会自动更新
const normalizedSize = computed(() => props.size.trim().toLowerCase());
```

::: tip 如何更改子组件中的 props
props 的传递都是单向的，所以我们不应该在子组件中去修改由父组件传来的属性。如果确实需要修改，应该通过事件或函数来影响父组件中的数据进而影响子组件的 props。后续子向父传递数据会讲到
:::

### Prop 类型与校验

要声明对 props 的校验，你可以向 defineProps() 宏提供一个带有 props 校验选项的对象，例如：

```ts
defineProps({
  // 基础类型检查
  // (给出 `null` 和 `undefined` 值则会跳过任何类型检查)
  propA: Number,
  // 多种可能的类型
  propB: [String, Number],
  // 必传，且为 String 类型
  propC: {
    type: String,
    required: true,
  },
  // 必传但可为 null 的字符串
  propD: {
    type: [String, null],
    required: true,
  },
  // Number 类型的默认值
  propE: {
    type: Number,
    default: 100,
  },
  // 对象类型的默认值
  propF: {
    type: Object,
    // 对象或数组的默认值
    // 必须从一个工厂函数返回。
    // 该函数接收组件所接收到的原始 prop 作为参数。
    default(rawProps) {
      return { message: 'hello' };
    },
  },
  // 自定义类型校验函数
  // 在 3.4+ 中完整的 props 作为第二个参数传入
  propG: {
    validator(value, props) {
      // The value must match one of these strings
      return ['success', 'warning', 'danger'].includes(value);
    },
  },
  // 函数类型的默认值
  propH: {
    type: Function,
    // 不像对象或数组的默认，这不是一个
    // 工厂函数。这会是一个用来作为默认值的函数
    default() {
      return 'Default function';
    },
  },
});
```

::: tip 自定义属性类型
校验选项中的 type 可以是下列这些原生构造函数：
`String、Number、Boolean、Array、Object、Date、Function、Symbol、Error`
另外，type 也可以是自定义的类或构造函数，Vue 将会通过 instanceof 来检查类型是否匹配。例如下面这个类：

```ts
class Person {
  constructor(firstName, lastName) {
    this.firstName = firstName;
    this.lastName = lastName;
  }
}

defineProps({
  author: Person,
});
```

:::

::: tip 可为 null 类型
如果该类型是必传但可为 null 的，你可以用一个包含 null 的数组语法：

```ts
defineProps({
  id: {
    type: [String, null],
    required: true,
  },
});
```

注意如果 type 仅为 null 而非使用数组语法，它将允许任何类型。
:::

### props 定义默认值

1. 对于基础类型，默认值是可选的，如果没有提供默认值，则 prop 的值将是 undefined（Boolean 类型会转为 false）。比如下面的案例

```ts
const props = const props = defineProps(['foo'])
```

2. 对于对象类型可以提供默认值，若没有传递或传递 undefined 都一定会使用默认值

```ts
defineProps({
  // Number 类型的默认值
  propE: {
    type: Number,
    default: 100,
  },
});
```

3. 对于使用泛型的`defineProps`可以使用`Volar / Vue - Official`提供的类型支持`ithDefaults`

```ts
<script setup lang="ts">
interface Props {
  name: string
  age?: number
  visible?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  age: 18,
  visible: true
})
</script>

```

### 补充细节与技巧

#### props 名字格式

如果一个 prop 的名字很长，应使用 camelCase 形式，因为它们是合法的 JavaScript 标识符，可以直接在模板的表达式中使用，也可以避免在作为属性 key 名时必须加上引号。

```ts
<span>{{ greetingMessage }}</span>;

defineProps({ greetingMessage: String });
```

虽然理论上你也可以在向子组件传递 props 时使用 camelCase 形式 (使用 DOM 内模板时例外)，但实际上为了和 HTML attribute 对齐，我们通常会将其写为 kebab-case 形式：

```html
<MyComponent greeting-message="hello" />
```

#### :star: 使用一个对象绑定多个 prop

```ts
const post = {
  id: 1,
  title: 'My Journey with Vue',
};
```

一般来说，当组件允许有多个可传入的属性时，父组件需要一个一个的书写这些属性

```vue
<BlogPost :id="post.id" v-bind:title="post.title" />
```

你可以使用不带参数的 v-bind 一次传入一个对象，这样就能简化书写方式,而这与上面的案例时等价的

```vue
<BlogPost v-bind="post" />
```

#### props 默认行为

- 所有 prop 默认都是可选的，除非声明了 required: true。
- 除 Boolean 外的未传递的可选 prop 将会有一个默认值 undefined。
- Boolean 类型的未传递 prop 将被转换为 false。这可以通过为它设置 default 来更改——例如：设置为 default: undefined 将与非布尔类型的 prop 的行为保持一致。
- 如果声明了 default 值，那么在 prop 的值被解析为 undefined 时，无论 prop 是未被传递还是显式指明的 undefined，都会改为 default 值。

::: tip 类型声明
如果使用了基于类型的 prop 声明 ，Vue 会尽最大努力在运行时按照 prop 的类型标注进行编译。举例来说，`defineProps<{ msg: string }>` 会被编译为 `{ msg: { type: String, required: true }}`。
:::

## 子向父通信-props

虽然 props 是单向的，但是利用一些手段也能影响父组件。比如：
父组件传递函数给子组件

```vue
<template>
  <div class="home-container">
    <Demo :fn="fn" />
  </div>
</template>
<script setup lang="ts">
function fn(value: string) {
  console.log(value); // 打印子组件传过来的值：我是子组件
}
</script>
```

子组件调用

```ts
const { fn } = defineProps({
  fn: Function,
});
fn('我是子组件');
```
