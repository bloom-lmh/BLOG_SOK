---
order: 135
---

# localStorage 和 sessionStorage

[[toc]]

## 存储的作用域

客户端存储是按照来源隔离的，因此来自一个站点的页面不能读取来自另一个站点的页面存储的数据。但来自同一站点的两个页面可以共享存储的数据，并将其作为一种通信机制。

## 存储安全与隐私

浏览器存储技术都不涉及加密，恶意软件(如后门程序)访问到，所以不能存储重要的信息

## Storage 对象

Window 对象的 `localStorage` 和 `sessionStorage` 属性引用的是 `Storage` 对象。Storage 对象与普通 JavaScript 对象非常类似，只不过

- Storage 对象的属性值必须是字符串；
- Storage 对象是持久化的，除非手动删除；

::: tip 存储非字符串的其它类型
如果你想存储非字符串的其它类型，可以先将其转换为字符串，再存储。例如，可以将对象转换为 JSON 字符串，再存储。

```js
// 存对象
const user = { name: 'John', age: 30 };
localStorage.setItem('user', JSON.stringify(user));

// 取对象
const storedUser = JSON.parse(localStorage.getItem('user'));
console.log(storedUser.name); // "John"
```

:::

## Storage 对象的操作

### 增删改查

```js
// 设置项
localStorage.setItem('name', 'John');
localStorage.setItem('token', '@niaocxas1as23');
localStorage.setItem('permissions', '[admin, user]');
// 获取项
console.log(localStorage.getItem('name'));
// 删除项
localStorage.removeItem('name');
delete localStorage.token;
// 清空所有项
localStorage.clear();
```

### 遍历

遍历 Storage 对象和遍历普通对象一样，可以使用 `for...in` 循环等。

```js
for (let key in localStorage) {
  console.log(key, localStorage.getItem(key));
}
```

## Storage 事件

当同源下的其他页面修改 localStorage 时，当前页面可通过 storage 事件监听变化：

- key:写入或删除项的键或名字。如果调用了 `clear()`方法，这个属性的值为 null
- newValue:保存变化项的新值（如果有）。如果调用了 `removeItem()`，这个属性不存在。
- oldValue:保存变化的或被删除的已有项的旧值。如果添加了一个新属性（没有旧值），这个
  属性不存在。
- storageArea:通常是 `localstorage` 对象。
- url:导致这次存储变化的脚本所在文档的 URL （字符串）。

```js
window.addEventListener('storage', event => {
  console.log(`键 ${event.key} 被修改`);
  console.log(`旧值: ${event.oldValue}`);
  console.log(`新值: ${event.newValue}`);
});
```

::: tip 作用
如果用户要求网站停止执行动画，网站可以把该偏好保存在 localStorage 中，以便未来访问时遵行。通过存储这个偏好，它会生成一个事件，让其他显示相同网站的窗口也能遵守这个要求
:::

## 存储周期和作用域

### 存储周期

localStorage 和 sessionStorage 的存储周期不同：

- localStorage 存储在本地，除非手动删除，否则永久存在；
- sessionStorage 存储在会话期间，页面关闭后清空；

### 作用域

localStorage 和 sessionStorage 的作用域:

- 非同源文档之间相互隔离：所有同源文档都共享相同的 `localstorage` 数据（与实际访问`localstorage` 的脚本的来源无关）。同源文档可以相互读取对方的数据，可以重写对方的数据。但非同源文档的数据相互之间是完全隔离的，既读不到也不能重写（**即便它们运行的脚本来自同一台第三方服务器**）。
- 浏览器之间相互隔离：`localstorage` 的作用域也受浏览器实现的限制。如果你使用 Firefox 访问某个网站，然后又使用 Chrome 访问，那么第一次访问时存储的任何数据都无法在第二次访问时存取
