# 定义和使用 store

[[toc]]

## 定义 store

### defineStore 函数

在 `pinia` 中，我们通过 `defineStore` 方法来定义一个 `store`，它接收两个参数：

1. `id` :要求是一个独一无二的名字，用于区分不同的 `store`
2. `state`:可以是`Setup` 函数或 `Option` 对象

为了养成习惯性的用法，将返回的函数命名为 `use...` 是一个符合组合式函数风格的约定

```ts
import { defineStore } from 'pinia';

//  `defineStore()` 的返回值的命名是自由的
// 但最好含有 store 的名字，且以 `use` 开头，以 `Store` 结尾。
// (比如 `useUserStore`，`useCartStore`，`useProductStore`)
// 第一个参数是你的应用中 Store 的唯一 ID。
export const useAlertsStore = defineStore('alerts', {
  // 其他配置...
});
```

### 两种定义方式

#### 选项式-Option Store

与 Vue 的选项式 API 类似，我们也可以传入一个带有 `state`、`actions` 与 `getters` 属性的 `Option` 对象

```ts
export const useCounterStore = defineStore('counter', {
  // 有哪些状态
  state: () => ({ count: 0, name: 'Eduardo' }),
  // 以什么角度来获取状态
  getters: {
    doubleCount: state => state.count * 2,
  },
  // 引发状态变更的方法
  actions: {
    increment() {
      this.count++;
    },
  },
});
```

你可以认为 `state` 是 `store` 的数据 (data)，`getters` 是 `store` 的计算属性 (`computed`)，而 `actions` 则是方法 (`methods`)。

#### 组合式-Setup Store

也存在另一种定义`store`的语法,也就是组合式

```ts
export const useCounterStore = defineStore('counter', () => {
  // ref就是状态
  const count = ref(0);
  // computed() 就是 getters
  const name = ref('Eduardo');
  const doubleCount = computed(() => count.value * 2);
  // function() 就是 actions
  function increment() {
    count.value++;
  }

  return { count, name, doubleCount, increment };
});
```

在 `Setup Store` 中：

- `ref()` 就是 state 属性
- `computed()` 就是 getters
- `function()` 就是 actions

::: warning 注意
注意，要让 `pinia` 正确识别 `state`，你必须在 `setup store` 中返回 `state` 的所有属性，你不能在 `store` 中使用私有属性。不完整返回会影响 `SSR` ，开发工具和其他插件的正常运行。
:::

#### 如何选择

两种状态定义方式各有优劣，在不同的场景下，我们应该选择不同的方式。

`Setup store` 比 `Option Store` 带来了更多的灵活性，因为你可以在一个 `store` 内创建侦听器，并自由地使用任何组合式函数。不过，请记住，使用组合式函数会让 SSR 变得更加复杂。
`Setup store` 也可以依赖于全局提供的属性，比如路由。任何应用层面提供的属性都可以在 `store` 中使用 `inject()` 访问，就像在组件中一样：

```ts
import { inject } from 'vue';
import { useRoute } from 'vue-router';
import { defineStore } from 'pinia';

export const useSearchFilters = defineStore('search-filters', () => {
  const route = useRoute();
  // 这里假定 `app.provide('appProvided', 'value')` 已经调用过
  const appProvided = inject('appProvided');

  // ...

  return {
    // ...
  };
});
```

::: tip 提示
不要返回像 route 或 appProvided (上例中)之类的属性，因为它们不属于 store，而且你可以在组件中直接用 useRoute() 和 inject('appProvided') 访问。
:::

### 关于理解组合式和选项式

1. 理解选项式：所谓的选项式就是通过配置的方式指定有哪些状态，有哪些引发状态变更的方法，以及如何获取状态的方法。
2. 理解组合式:所谓的组合式就是通过函数来封装相关状态及其逻辑。重点在“相关”二字上。选项式最大的问题就是状态和逻辑是分散的，通过组合式可以将相关状态和逻辑封装在一起，并通过闭包的方式导出，使得逻辑更集中、更易于维护。

:::code-group

```ts [选项式]
// MouseTracker.vue
export default {
  data() {
    return {
      x: 0,
      y: 0,
      isHovering: false,
    };
  },
  methods: {
    updateMouse(e) {
      this.x = e.clientX;
      this.y = e.clientY;
    },
    showTooltip() {
      this.isHovering = true;
    },
    hideTooltip() {
      this.isHovering = false;
    },
  },
  mounted() {
    window.addEventListener('mousemove', this.updateMouse);
  },
  beforeUnmount() {
    window.removeEventListener('mousemove', this.updateMouse);
  },
  // 想象一下，如果还有更多功能（如键盘监听、窗口大小监听...）
  // 所有功能的 data、methods、lifecycle 都会混在一起
};
```

```ts [组合式]
// composables/useMouse.js (逻辑可复用！)
import { ref, onMounted, onUnmounted } from 'vue';

export function useMouse() {
  const x = ref(0);
  const y = ref(0);

  function update(e) {
    x.value = e.clientX;
    y.value = e.clientY;
  }

  onMounted(() => {
    window.addEventListener('mousemove', update);
  });

  onUnmounted(() => {
    window.removeEventListener('mousemove', update);
  });

  // 返回这个功能所需的一切
  return { x, y };
}

// composables/useTooltip.js
import { ref } from 'vue';

export function useTooltip() {
  const isHovering = ref(false);

  function show() {
    isHovering.value = true;
  }
  function hide() {
    isHovering.value = false;
  }

  return { isHovering, show, hide };
}

// MouseTracker.vue
import { useMouse } from '@/composables/useMouse';
import { useTooltip } from '@/composables/useTooltip';

export default {
  setup() {
    //  “组合”两个独立的逻辑单元
    const { x, y } = useMouse();
    const { isHovering, show, hide } = useTooltip();

    return {
      x,
      y,
      isHovering,
      show,
      hide,
    };
  },
};
```

:::

## 使用 Store

### useStore 函数

使用 `store` 非常简单，只需要通过 `useStore` 方法来获取到 `store` 实例，

```vue
<script setup>
import { useCounterStore } from '@/stores/counter'; // 在组件内部的任何地方均可以访问变量 `store` ✨ const store =
useCounterStore();
</script>
```

一旦 `store` 被实例化，你可以直接访问在 `store` 的 `state`、`getters` 和 `actions` 中定义的任何属性

### store 对象与解构时响应性丢失的问题

`store` 是一个用 `reactive` 包装的对象，这意味着不需要在 `getters` 后面写 `.value`。就像 `setup` 中的 `props` 一样，我们不能对它进行解构：

```vue
<script setup>
import { useCounterStore } from '@/stores/counter';
import { computed } from 'vue';

const store = useCounterStore();
// ❌ 下面这部分代码不会生效，因为它的响应式被破坏了
// 与 reactive 相同: https://vuejs.org/guide/essentials/reactivity-fundamentals.html#limitations-of-reactive
const { name, doubleCount } = store;
name; // 将会一直是 "Eduardo" //
doubleCount; // 将会一直是 0 //
setTimeout(() => {
  store.increment();
}, 1000);
// ✅ 而这一部分代码就会维持响应式
// 💡 在这里你也可以直接使用 `store.doubleCount`
const doubleValue = computed(() => store.doubleCount);
</script>
```

### 解构时保持响应性 -storeToRefs()

为了从 `store` 中提取属性时保持其响应性，你需要使用 `storeToRefs()`。它将为每一个响应式属性创建引用。当你只使用 `store` 的状态而不调用任何 `action` 时，它会非常有用。请注意，你可以直接从 `store` 中解构 `action`，因为它们也被绑定到 `store` 上：

```vue
<script setup>
import { storeToRefs } from 'pinia';
const store = useCounterStore();
// `name` 和 `doubleCount` 都是响应式引用
// 下面的代码同样会提取那些来自插件的属性的响应式引用
// 但是会跳过所有的 action 或者非响应式（非 ref 或者 非 reactive）的属性
const { name, doubleCount } = storeToRefs(store);
// 名为 increment 的 action 可以被解构
const { increment } = store;
</script>
```

::: warning 注意
`storeToRefs(store)`会跳过所有的 `action` 或者非响应式（非 `ref` 或者 非 `reactive`）的属性。
:::
