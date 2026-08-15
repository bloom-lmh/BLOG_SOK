---
order: 122
---

# URL API

URL 类不是 ECMA 的标准，但是已经被 Node 和浏览器实现。传入的参数可以是完整的 URL 路径，也可以是第一个参数是相对路径，第二个参数是这个相对路径对应的绝对路径

```js
// 使用构造器创建URL对象
// 直接使用绝对路径
let u1 = new URL('http://www.example.com/dogs?name=xiaom#fragment');
// 使用相对路径和相对路径对应的绝对路径
let u2 = new URL('../cats', 'http://www.example.com/dogs');
// 获取URL的属性，其它属性请查询官网
console.log(u1.origin); // 这个属性是只读属性若有端口则会加上端口 =>http://www.example.com
console.log(u1.search); // 这个属性是可读写属性  =>?name=xiaom
// 修改查询属性
u1.search = 'q=test';
console.log(u1.search); // ?name=xiaom 被替换为了?q=test
// 对于href属性比较特殊，他可以读取，读的时候相当于调用了toString方法，写的时候相当于调用了构造函数，返回新字符串的解析器
console.log(u1.href); // http://www.example.com/dogs?q=test#fragment

// 比search更好用的是searchParams属性，这个属性指向一个URLSearchParams对象
// 这个对象可以添加查询字段，进行更加丰富的操作
let urlParams = u2.searchParams;
urlParams.append('name', '小兰');
urlParams.append('age', 17);
console.log(u2.href); // http://www.example.com/cats?name=%E5%B0%8F%E5%85%B0&age=17

// 当然也可以这样
let u3 = new URL('http://www.example.com/dogs');
let up = new URLSearchParams();
up.append('s', 1);
up.append('a', 2);
up.set('a', 3);
u3.search = up.toString();
console.log(u3.href); // http://www.example.com/dogs?s=1&a=3
```
