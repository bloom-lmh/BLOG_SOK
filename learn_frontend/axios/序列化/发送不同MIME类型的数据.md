---
order: 266
---

# 发送不同 MIME 类型的数据

[[toc]]

## 发送 JSON 数据

默认情况下，axios 将 JavaScript 对象序列化为 JSON。

```js
axios.post('/foo', { bar: 123 });
```

## 发送表单数据

浏览器环境下：

::: code-group

```js [使用 URLSearchParams]
const params = new URLSearchParams();
params.append('param1', 'value1');
params.append('param2', 'value2');
axios.post('/foo', params);
```

```js [使用 qs 库]
import qs from 'qs';
const data = { bar: 123 };
const options = {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  data: qs.stringify(data),
  url,
};
axios(options);
```

:::
node 环境下：
::: code-group

```js [使用 querystring 库]
const querystring = require('querystring');
axios.post('/foo', querystring.stringify({ bar: 123 }));
```

```js [使用 url]
const url = require('url');
const params = new url.URLSearchParams({ foo: 'bar' });
axios.post('http://something.com/', params.toString());
```

```js [使用 qs 库]
const qs = require('qs');
axios.post('/foo', qs.stringify({ bar: 123 }));
```

:::

::: tip node 下序列化嵌套字符串
如果你需要对嵌套对象进行字符串化，则 qs 库更可取，因为 querystring 方法在该用例 (https://github.com/nodejs/node-v0.x-archive/issues/1665) 中存在已知问题
:::

## 发送多部分表单数据

```js [使用 FormData]
const form = new FormData();
form.append('my_field', 'my value');
form.append('my_buffer', new Blob([1, 2, 3]));
form.append('my_file', fileInput.files[0]);

axios.post('https://example.com', form);
```
