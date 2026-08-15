---
order: 173
---

# SPA 单页面路由实现

[[toc]]

## 基于 Hash

### 实现思路

1. 当改变页面 `hash`值改变的时候，不会导致页面刷新，而仅仅会触发`haschange`事件的回调
2. 在`haschange`事件的回调函数中，根据页面 hash 的内容，做出不同的页面更新操作
3. `render`函数中会根据`path`和路由表查询出对应的组件，然后渲染到`·`router-view`

### 代码实现

:::code-group

```bash [目录结构]
小案例
 ├── index.html
 ├── main.ts
 └── src
     ├── HashRouter.ts
     └── pages
         ├── About.ts
         └── Details.ts
```

```ts [HashRouter.ts] {67-70,35-56,8}
export class HashRouter {
  /**
   * @name routes
   * @type {Array}
   * @access private
   * @description 路由表
   */
  private routes: Array<{ path: string; component: Object }>;
  /**
   * @name currentUrl
   * @type {string}
   * @access private
   * @default ''
   * @description 当前路径
   */
  private currentUrl: string = '';
  constructor(routes: Array<{ path: string; component: Object }>) {
    this.routes = routes;
    this.addEvent();
  }
  /**
   * @name navigate
   * @function
   * @param {string} path
   * @description 导航
   */
  navigate(path: string) {
    location.hash = path;
  }
  /**
   * @name render
   * @function
   * @description 渲染函数
   */
  render() {
    // 获取当前页面hash
    this.currentUrl = location.hash.replace('#', '/') || '/';
    if (this.routes && this.routes.length > 0) {
      // 查找对应的路由项
      const route = this.routes.find(route => route.path === this.currentUrl);
      if (route) {
        // 获取router view组件
        const viewEl = document.querySelector('router-view');
        if (viewEl) {
          const htmlString = (route.component as Object & { template(): string }).template();
          viewEl.innerHTML = htmlString;
        } else {
          console.warn('缺少<router-view></router-view>元素');
        }
      } else {
        throw new Error(
          `路径${this.currentUrl}下不存在组件！请在路由中声明 {path:${this.currentUrl},component:XX}`,
        );
      }
    }
  }

  /**
   * @name addEvent
   * @function
   * @description 添加事件
   */
  addEvent() {
    window.addEventListener('load', () => {
      this.render();
    });
    // hash改变会触发haschange事件，然后根据hash更新页面
    window.addEventListener('hashchange', () => {
      this.render();
    });
  }
}
```

```ts [About.ts]
export class About {
  template(): string {
    return `
      <div>关于</div>
    `;
  }
}
```

```ts [Details.ts]
export class Details {
  template(): string {
    return `
       <div>详情页</div>
    `;
  }
}
```

```ts [main.ts]
import { Details } from './src/pages/Details';
import { About } from './src/pages/About';
import { HashRouter } from './src/HashRouter';
const routes = [
  {
    path: '/details',
    component: new Details(),
  },
  {
    path: '/about',
    component: new About(),
  },
];
new HashRouter(routes);
```

```html [index.html]
<body>
  主页
  <a href="#about">关于</a>
  <a href="#details">详情</a>
  <router-view></router-view>
  <script src="./main.ts"></script>
</body>
```

:::

## 基于 History

### 实现思路

其思路和 hash 很相似，只不过不再使用`location.hash`来改变路径而使用`history.pushState()`来改变路径
这两个方法的共同点都是只改变路径而不刷新页面

1. `navigate` 方法中使用`history.pushState()`来改变路径，并存储 `path`，然后路径变化后手动调用 render 更新页面（这个方法不会触发`popstate事件`,所以需要主动调用 render 方法）
2. 当页面回退`history.back()`或前进`history.go()`时将会触发`popstate事件`，这时候在`popstate事件`回调函数中通过`e.state.path`来获取回退到的页面条目对应`path`，然后传入 render 函数中更新页面
3. `render`函数中会根据`path`和路由表查询出对应的组件，然后渲染到`·`router-view`

### 实现代码

:::code-group

```bash [目录结构]
小案例
 ├── index.html
 ├── main.ts
 └── src
     ├── HistoryRouter.ts
     └── pages
         ├── About.ts
         └── Details.ts
```

```ts [HistoryRouter.ts] {27-44,51-56,65-70,8}
export class HistoryRouter {
  /**
   * @name routes
   * @type {Array}
   * @access private
   * @description 路由表
   */
  private routes: Array<{ path: string; component: Object }>;
  /**
   * @name currentUrl
   * @type {string}
   * @access private
   * @description 当前路径
   */
  private currentUrl: string;
  constructor(routes: Array<{ path: string; component: Object }>) {
    this.routes = routes;
    this.addEvent();
  }
  /**
   * @name render
   * @function
   * @param {string} path
   * @throws {Error}
   * @description 渲染函数
   */
  render(path: string) {
    if (this.routes && this.routes.length > 0) {
      // 查找对应的路由项
      const route = this.routes.find(route => route.path === path);
      if (route) {
        // 获取router view组件
        const viewEl = document.querySelector('router-view');
        if (viewEl) {
          const htmlString = (route.component as Object & { template(): string }).template();
          viewEl.innerHTML = htmlString;
        } else {
          console.warn('缺少<router-view></router-view>元素');
        }
      } else {
        throw new Error(`路径${path}下不存在组件！请在路由中声明 {path:${path},component:XX}`);
      }
    }
  }
  /**
   * @name navigate
   * @function
   * @param {string} path
   * @description 导航
   */
  navigate(path: string) {
    // 1. 每个url路径对应一个条目，该方法不会引发页面重新渲染但是会改变url,且能够存储path值
    history.pushState({ path }, '', path);
    // 2. 渲染页面
    this.render(path);
  }

  /**
   * @name addEvent
   * @function
   * @description 添加事件
   */
  addEvent() {
    // 页面回退或前进的时候会触发popstate事件
    window.addEventListener('popstate', e => {
      // 回退时会弹出条目，获取条目中state的相关信息
      const path = e.state && e.state.path;
      // 更新页面
      this.render(path);
    });
  }
}
```

```ts [About.ts]
export class About {
  template(): string {
    return `
      <div>关于</div>
    `;
  }
}
```

```ts [Details.ts]
export class Details {
  template(): string {
    return `
       <div>详情页</div>
    `;
  }
}
```

```ts [main.ts]
import { Details } from './src/pages/Details';
import { About } from './src/pages/About';
import { HashRouter } from './src/HashRouter';
import { HistoryRouter } from './src/HistoryRouter';
const routes = [
  {
    path: '/details',
    component: new Details(),
  },
  {
    path: '/about',
    component: new About(),
  },
];
const router = new HistoryRouter(routes);
const btnEls: NodeList = document.querySelectorAll('button');
[...btnEls].forEach(btn => {
  btn.addEventListener('click', (e: Event) => {
    const path = (e.target as HTMLButtonElement).getAttribute('to');
    path && router.navigate(path);
  });
});
```

```html [index.html]
<body>
  主页
  <button to="/about">关于</button>
  <button to="/details">详情</button>
  <button onclick="back()">回退</button>
  <router-view></router-view>
  <script src="./main.ts"></script>
  <script>
    function back() {
      history.back();
    }
  </script>
</body>
```

:::
