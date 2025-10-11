# 扩展 pinia

[[toc]]

## 介绍

由于有了底层 API 的支持，Pinia store 现在完全支持扩展。以下是你可以扩展的内容：

- 为 store 添加新的属性
- 定义 store 时增加新的选项
- 为 store 增加新的方法
- 包装现有的方法
- 改变甚至取消 action
- 实现副作用，如本地存储
- 仅应用插件于特定 store

## 插件

### 定义 pinia 插件

Pinia 插件是一个函数，可以选择性地返回要添加到 store 的属性。它接收一个可选参数，即 context。

```ts
export function myPiniaPlugin(context) {
  context.pinia; // 用 `createPinia()` 创建的 pinia。
  context.app; // 用 `createApp()` 创建的当前应用(仅 Vue 3)。
  context.store; // 该插件想扩展的 store
  context.options; // 定义传给 `defineStore()` 的 store 的可选对象。
  // ...
}
```

然后用 `pinia.use()` 将这个函数传给 pinia：

```ts
pinia.use(myPiniaPlugin);
```

::: warning 插件应用的时机
插件只会应用于在 pinia 传递给应用后创建的 store，否则它们不会生效。
:::

### store 上添加属性

#### 方式一

插件最简单的例子是通过返回一个对象将一个静态属性添加到所有 store。比如下面的例子：
所有 store 都有`secret`属性，值为`'the cake is a lie'`。

```ts
import { createPinia } from 'pinia';

// 创建的每个 store 中都会添加一个名为 `secret` 的属性。
// 在安装此插件后，插件可以保存在不同的文件中
function SecretPiniaPlugin() {
  return { secret: 'the cake is a lie' };
}

const pinia = createPinia();
// 将该插件交给 Pinia
pinia.use(SecretPiniaPlugin);

// 在另一个文件中
const store = useStore();
store.secret; // 'the cake is a lie'
```

#### 方式二

当然你也可以直接在 store 上设置该属性，但可以的话，请使用返回对象的方法，这样它们就能被 devtools 自动追踪到：

```ts
pinia.use(({ store }) => {
  store.hello = 'world';
});
```

这对添加全局对象很有用，如路由器、modal 或 toast 管理器。

#### 追踪属性

任何由插件返回的属性都会被 devtools 自动追踪，所以如果你想在 devtools 中调试 hello 属性，为了使 devtools 能追踪到 hello，请确保在 dev 模式下将其添加到 `store._customProperties` 中：

```ts
// 上文示例
pinia.use(({ store }) => {
  store.hello = 'world';
  // 确保你的构建工具能处理这个问题，webpack 和 vite 在默认情况下应该能处理。
  if (process.env.NODE_ENV === 'development') {
    // 添加你在 store 中设置的键值
    store._customProperties.add('hello');
  }
});
```

#### 属性自动解包

值得注意的是，每个 store 都被 reactive 包装过，所以可以自动解包任何它所包含的 `Ref(ref()、computed()...)`。

```ts
const sharedRef = ref('shared');
pinia.use(({ store }) => {
  // 每个 store 都有单独的 `hello` 属性
  store.hello = ref('secret');
  // 它会被自动解包
  store.hello; // 'secret'

  // 所有的 store 都在共享 `shared` 属性的值
  store.shared = sharedRef;
  store.shared; // 'shared'
});
```

- 每一个 store 上都有`shared`属性，且所有 store 共享
- 每一个 store 上都有`hello`属性，且每个 store 都有自己的`hello`属性（不共享）

::: tip store 上的属性和 state 的区别
state 是每个 store 私有的、声明式的状态容器，由 Pinia 管理，支持 SSR、热更新、devtools 等。而这里挂载的 `hello` 和 `shared` 是直接附加在 store 实例上的响应式属性，绕过了 Pinia 的状态管理系统
:::

### store 的 state 上添加属性

如果你想给 store 添加新的 state 属性或者在服务端渲染的激活过程中使用的属性，你必须同时在两个地方添加它。

- 在 `store`上，然后你才可以用 `store.myState` 访问它。
- 在 `store.$state` 上，然后你才可以在 devtools 中使用它，并且，在 SSR 时被正确序列化(serialized)。

除此之外，你肯定也会使用 ref()(或其他响应式 API)，以便在不同的读取中共享相同的值：

```ts
import { toRef, ref } from 'vue';

pinia.use(({ store }) => {
  // 为了正确地处理 SSR，我们需要确保我们没有重写任何一个
  // 现有的值
  if (!store.$state.hasOwnProperty('hasError')) {
    // 在插件中定义 hasError，因此每个 store 都有各自的
    // hasError 状态
    const hasError = ref(false);
    // 在 `$state` 上设置变量，允许它在 SSR 期间被序列化。
    store.$state.hasError = hasError;
  }
  // 我们需要将 ref 从 state 转移到 store
  // 这样的话,两种方式：store.hasError 和 store.$state.hasError 都可以访问
  // 并且共享的是同一个变量
  // 查看 https://cn.vuejs.org/api/reactivity-utilities.html#toref
  store.hasError = toRef(store.$state, 'hasError');

  // 在这种情况下，最好不要返回 `hasError`
  // 因为它将被显示在 devtools 的 `state` 部分
  // 如果我们返回它，devtools 将显示两次。
});
```

解释：

- 上面为每一个 store 的 state 上添加了`hasError`属性，且每个 store 都有自己的`hasError`属性（不共享）
- 我们使用 `toRef` 函数将 `store.$state.hasError` 转移到 `store.hasError`，这样两种方式都可以访问到它，并且共享的是同一个变量。

也就是说 store 和 state 都有
