# store 三要素

[[toc]]

## state

### 定义 state

在大多数情况下，`state` 都是你的 `store` 的核心。人们通常会先定义能代表他们 `APP` 的 `state`。在 `Pinia` 中，`state` 被定义为一个返回初始状态的函数。这使得 `Pinia` 可以同时支持服务端和客户端。

```ts
import { defineStore } from 'pinia';

const useStore = defineStore('storeId', {
  // 为了完整类型推理，推荐使用箭头函数
  state: () => {
    return {
      // 所有这些属性都将自动推断出它们的类型
      count: 0,
      name: 'Eduardo',
      isAdmin: true,
      items: [],
      hasChanged: true,
    };
  },
});
```

::: tip Vue2 种添加新属性
如果你使用的是 `Vue 2`，你在 state 中创建的数据与 Vue 实例中的 data 遵循同样的规则，即 state 对象必须是清晰的，当你想向其添加新属性时，你需要调用 `Vue.set()`
:::

### state 类型定义

你并不需要做太多努力就能使你的 `state` 兼容 TS。确保启用了 `strict`，或者至少启用了 `noImplicitThis`，`Pinia` 将自动推断您的状态类型！ 但是，在某些情况下，您应该帮助它进行一些转换：

```typescript
const useStore = defineStore('storeId', {
  state: () => {
    return {
      // 用于初始化空列表
      userList: [] as UserInfo[],
      // 用于尚未加载的数据
      user: null as UserInfo | null,
    };
  },
});

interface UserInfo {
  name: string;
  age: number;
}
```

如果你愿意，你可以用一个接口定义 state，并添加 `state()` 的返回值的类型。

```ts
interface State {
  userList: UserInfo[];
  user: UserInfo | null;
}

const useStore = defineStore('storeId', {
  state: (): State => {
    return {
      userList: [],
      user: null,
    };
  },
});

interface UserInfo {
  name: string;
  age: number;
}
```

### 访问 state

#### 组合式 API 用法

默认情况下，你可以通过 store 实例访问 state，直接对其进行读写

```ts
const store = useStore();
store.count++;
```

注意，新的属性如果没有在 `state()` 中被定义，则不能被添加。它必须包含初始状态。例如：如果 `secondCount` 没有在 state() 中定义，我们无法执行 `store.secondCount = 2`。

#### 选项式 API 用法

1. 映射为只读计算属性:如果你不能使用组合式 API，但你可以使用 `computed`，`methods`，...，那你可以使用 `mapState()` 辅助函数将 state 属性映射为只读的计算属性：

```ts
import { mapState } from 'pinia'
import { useCounterStore } from '../stores/counter'

export default {
  computed: {
    // 可以访问组件中的 this.count
    // 与从 store.count 中读取的数据相同
    ...mapState(useCounterStore, ['count'])
    // 与上述相同，但将其注册为 this.myOwnName
    ...mapState(useCounterStore, {
      myOwnName: 'count',
      // 你也可以写一个函数来获得对 store 的访问权
      double: store => store.count * 2,
      // 它可以访问 `this`，但它没有标注类型...
      magicValue(store) {
        return store.someGetter + this.count + this.double
      },
    }),
  },
}
```

2. 映射为可变属性：如果你想修改这些 state 属性 (例如，如果你有一个表单)，你可以使用 `mapWritableState()` 作为代替。但注意你不能像 `mapState()` 那样传递一个函数：

```ts
import { mapWritableState } from 'pinia'
import { useCounterStore } from '../stores/counter'

export default {
  computed: {
    // 可以访问组件中的 this.count，并允许设置它。
    // this.count++
    // 与从 store.count 中读取的数据相同
    ...mapWritableState(useCounterStore, ['count'])
    // 与上述相同，但将其注册为 this.myOwnName
    ...mapWritableState(useCounterStore, {
      myOwnName: 'count',
    }),
  },
}
```

### 重置 state

使用选项式 API 时，你可以通过调用 store 的 `$reset()` 方法将 state 重置为初始值。

```ts
const store = useStore();
store.$reset();
```

在 `$reset()` 内部，会调用 `state()` 函数来创建一个新的状态对象，并用它替换当前状态
在 `Setup Stores` 中，您需要创建自己的 `$reset()` 方法：

```ts
export const useCounterStore = defineStore('counter', () => {
  const count = ref(0);

  function $reset() {
    count.value = 0;
  }

  return { count, $reset };
});
```

### 变更 state

#### 单个变更

```ts
const store = useStore();
store.count++;
```

#### 批量变更的两个方式

除了用 `store.count++` 直接改变 store，你还可以调用 `$patch` 方法。它允许你用一个 state 的补丁对象在同一时间更改多个属性：

```ts
store.$patch({
  count: store.count + 1,
  age: 120,
  name: 'DIO',
});
```

不过，用这种语法的话，有些变更真的很难实现或者很耗时：任何集合的修改（例如，向数组中添加、移除一个元素或是做 `splice` 操作）都需要你创建一个新的集合。因此，$patch 方法也接受一个函数来组合这种难以用补丁对象实现的变更。

```ts
store.$patch(state => {
  state.items.push({ name: 'shoes', quantity: 1 });
  state.hasChanged = true;
});
```

两种变更 store 方法的主要区别是，$patch() 允许你将多个变更归入 `devtools` 的同一个条目中。同时请注意，直接修改 `state`，`$patch()`也会出现在`devtools`中，而且可以进行`time travel` (在 Vue 3 中还没有)。

### 替换 state

你不能完全替换掉 store 的 state，因为那样会破坏其响应性。但是，你可以 patch 它。

```ts
// 这实际上并没有替换`$state`
store.$state = { count: 24 };
// 在它内部调用 `$patch()`：
store.$patch({ count: 24 });
```

你也可以通过变更 pinia 实例的 state 来设置整个应用的初始 state。这常用于 SSR 中的激活过程。

```ts
pinia.state.value = {};
```

### 订阅 state

## getters

### 定义 getters

Getter 完全等同于 store 的 state 的计算值。可以通过 `defineStore()` 中的 getters 属性来定义它们。推荐使用箭头函数，并且它将接收 state 作为第一个参数：

```ts
export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
  }),
  getters: {
    doubleCount: state => state.count * 2,
  },
});
```

### 访问其它 getter

有时也可能会在 Getters 种使用其他 getter,这时可以通过 this 访问到整个 store 实例

```ts
export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
  }),
  getters: {
    // 自动推断出返回类型是一个 number
    doubleCount(state) {
      return state.count * 2;
    },
    // 返回类型**必须**明确设置
    doublePlusOne(): number {
      // 整个 store 的 自动补全和类型标注 ✨
      return this.doubleCount + 1;
    },
  },
});
```

### :star: 向 getter 传递参数

Getter 只是幕后的计算属性，所以不可以向它们传递任何参数。不过，你可以从 getter 返回一个函数，该函数可以接受任意参数：

```ts
export const useUserListStore = defineStore('userList', {
  getters: {
    getUserById: state => {
      return userId => state.users.find(user => user.id === userId);
    },
  },
});
```

::: tip 性能优化
当你这样做时，getter 将不再被缓存。它们只是一个被你调用的函数。不过，你可以在 getter 本身中利用闭包缓存一些结果，虽然这种做法并不常见，但有证明表明它的性能会更好
:::

### 访问其他 store 的 getter

想要使用另一个 store 的 getter 的话，那就直接在 getter 内使用就好：

```ts
import { useOtherStore } from './other-store';

export const useStore = defineStore('main', {
  state: () => ({
    // ...
  }),
  getters: {
    otherGetter(state) {
      const otherStore = useOtherStore();
      return state.localData + otherStore.data;
    },
  },
});
```

## actions

### 定义 actions

Action 相当于组件中的 method。它们可以通过 defineStore() 中的 actions 属性来定义，并且它们也是定义业务逻辑的完美选择。

```ts
export const useCounterStore = defineStore('main', {
  state: () => ({
    count: 0,
  }),
  actions: {
    increment() {
      this.count++;
    },
    randomizeCounter() {
      this.count = Math.round(100 * Math.random());
    },
  },
});
```

类似 getter，action 也可通过 this 访问整个 store 实例，并支持完整的类型标注(以及自动补全 ✨)。不同的是，action 可以是异步的，你可以在它们里面 await 调用任何 API，以及其他 action！

```ts
import { mande } from 'mande';

const api = mande('/api/users');

export const useUsers = defineStore('users', {
  state: () => ({
    userData: null,
    // ...
  }),

  actions: {
    async registerUser(login, password) {
      try {
        this.userData = await api.post({ login, password });
        showTooltip(`Welcome back ${this.userData.name}!`);
      } catch (error) {
        showTooltip(error);
        // 让表单组件显示错误
        return error;
      }
    },
  },
});
```

### 访问其他 store 的 action

想要使用另一个 store 的话，那你直接在 action 中调用就好了：

```ts
import { useAuthStore } from './auth-store';

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    preferences: null,
    // ...
  }),
  actions: {
    async fetchUserPreferences() {
      const auth = useAuthStore();
      if (auth.isAuthenticated) {
        this.preferences = await fetchPreferences();
      } else {
        throw new Error('User must be authenticated');
      }
    },
  },
});
```

### 使用选项式 API 的用法

如果你使用的是选项式 API，你需要通过 `mapActions()` 辅助函数将 action 映射到组件的 methods 中：

```ts
import { mapActions } from 'pinia'
import { useCounterStore } from '../stores/counter'

export default {
  methods: {
    // 访问组件内的 this.increment()
    // 与从 store.increment() 调用相同
    ...mapActions(useCounterStore, ['increment'])
    // 与上述相同，但将其注册为this.myOwnName()
    ...mapActions(useCounterStore, { myOwnName: 'increment' }),
  },
}
```

### 订阅 action

你可以通过 `store.$onAction()` 来监听 action 和它们的结果。传递给它的回调函数会在 action 本身之前执行。after 表示在 promise 解决之后，允许你在 action 解决后执行一个回调函数。同样地，onError 允许你在 action 抛出错误或 reject 时执行一个回调函数。这些函数对于追踪运行时错误非常有用
这里有一个例子，在运行 action 之前以及 `action resolve/reject` 之后打印日志记录

```ts
const unsubscribe = someStore.$onAction(
  ({
    name, // action 名称
    store, // store 实例，类似 `someStore`
    args, // 传递给 action 的参数数组
    after, // 在 action 返回或解决后的钩子
    onError, // action 抛出或拒绝的钩子
  }) => {
    // 为这个特定的 action 调用提供一个共享变量
    const startTime = Date.now();
    // 这将在执行 "store "的 action 之前触发。
    console.log(`Start "${name}" with params [${args.join(', ')}].`);

    // 这将在 action 成功并完全运行后触发。
    // 它等待着任何返回的 promise
    after(result => {
      console.log(`Finished "${name}" after ${Date.now() - startTime}ms.\nResult: ${result}.`);
    });

    // 如果 action 抛出或返回一个拒绝的 promise，这将触发
    onError(error => {
      console.warn(`Failed "${name}" after ${Date.now() - startTime}ms.\nError: ${error}.`);
    });
  },
);

// 手动删除监听器
unsubscribe();
```

默认情况下，action 订阅器会被绑定到添加它们的组件上(如果 store 在组件的 setup() 内)。这意味着，当该组件被卸载时，它们将被自动删除。如果你想在组件卸载后依旧保留它们，请将 true 作为第二个参数传递给 action 订阅器，以便将其从当前组件中分离：

```vue
<script setup>
const someStore = useSomeStore();
// 此订阅器即便在组件卸载之后仍会被保留
someStore.$onAction(callback, true);
</script>
```
