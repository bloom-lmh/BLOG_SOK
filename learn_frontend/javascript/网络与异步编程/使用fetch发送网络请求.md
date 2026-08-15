---
order: 131
---

# fetch 异步请求

[[toc]]

## 基本概念

fetch 是 XMLHttpRequest 的替代方案，它提供了一种更简单、更强大的方式来发起 HTTP 请求。

## 基本使用

- 调用 `fetch()`,传入要获取内容的 URL 地址
- 在 HTTP 响应开始到达时取得第 1 步异步返回的响应对象，然后调用这个响应对象的某个方法，读取响应体
- 取得第 2 步异步返回的响应体，按需要处理它

### 获取 HTTP 状态码、响应头和网络错误

`fetch`返回的期约解决为一个 `Response` 对象。这个对象的 `status` 属性是 `HTTP` 状态码，如表示成功的 200 或表示`Not Found`的 404 ( `statusText` 中则是与数值状态码对应的标准英文描述)。更方便的是 `Response` 对象的 `ok` 属性，它在 `status`为 200 或在 200 和 299 之间时是 true,在其他情况下是 false.

```js
fetch('http://127.0.0.1:8080/data/users.json').then((response) => {
  console.log(response.status); // 200
  console.log(response.ok); // true
});
```

当服务器开始发送响应时，`fetch()`只要一收到 HTTP 状态码和响应头就会解决它的期约，但此时通常还没收到完整的响应体。虽然响应体尚不完整，但已经可以在流程的第二步检查头部了。`Response` 对象的 `headers` 属性是一个 `Headers` 对象。

- `has()`方法可以测试某个头部是否存在
- `get()`方法可以取得某个头部的值。

HTTP 头部的名字是不区分大小写的，且是可以迭代的

```js
fetch('http://127.0.0.1:8080/data/users.json').then((response) => {
  console.log(response.headers instanceof Headers); // 是一个Headers对象
  console.log(response.headers.get('Content-Type')); // json 数据类型
  console.log(response.headers.has('Content-Length')); // 判断是否有某属性数据长度
  for (let [key, value] of response.headers.entries()) {
    console.log(key, value);
  }
  // accept-ranges bytes
  // cache-control max-age=3600
  // connection keep-alive
  // content-length 365
  // content-type application/json; charset=UTF-8
  // date Thu, 17 Jul 2025 02:03:52 GMT
  // etag W/"9288674231462248-365-2025-07-17T01:58:47.040Z"
  // keep-alive timeout=5
  // last-modified Thu, 17 Jul 2025 01:58:47 GMT
});
```

### 设置请求参数

可以使用 URL 对象来动态的设置参数

```js
let url = new URL('http://127.0.0.1:8080/data/users.json');
url.searchParams.append('id', '1');
fetch(url).then((response) => {
  console.log(response.ok);
});
```

### 设置请求头部

请求头是一个`Headers`对象，可以设置请求头部。

```js
let authHeaders = new Headers();

// 除非建立的是HTTPS连接，否则不要使用Basic认证。
authHeaders.set('Authorization', `Basic ${btoa(`${username}:${password}`)}`);

fetch('/api/users/', { headers: authHeaders })
  .then((response) => response.json())
  .then((usersList) => displayAllUsers(usersList));
```

当然也可以先创建`Request`对象然后传给`fetch()`方法。

```js
let request = new Request('/api/users/', { headers });
fetch(request).then((response) => response.json());
```

### 解析响应体

`fetch()`只要一收到 HTTP 状态码和响应头就会解决它的期约，但此时通常还没收到完整的响应体。所以解析响应体也是个异步的过程，下面的几个方法都可以解析响应体并返回一个新的期约对象。

- `json()`方法可以解析响应体为 JSON 对象
- `text()`方法可以解析响应体为文本
- `formData()`方法可以解析响应体为 FormData 对象，如果 Response 响应体是以`multipart/form-data`格式编码的，应该使用这个方法
- `blob()`方法可以解析响应体为 Blob 对象，Blob 对象可以用来处理二进制数据，如保存文件
- `arrayBuffer()`方法可以解析响应体为 `ArrayBuffer` 对象，`ArrayBuffer` 对象可以用来处理二进制数据

```js
let url = new URL('http://127.0.0.1:8080/data/users.json');
fetch(url)
  .then((response) => {
    return response.json();
  })
  .then((data) => {
    console.log(data);
  });
```

### :star:流式访问响应体

除了分别以某种形式返回完整响应体的 5 个异步响应方法，还可以流式访问响应体。在需要分块处理通过网络接收到的响应时可以采取这种方式。不过，流式访问响应体也可以用于显示进度条，以便用户看到下载进度。
`Response` 对象的 `body` 属性是一个 `ReadableStream` 对象

- 如果已经调用了 `text()`或`json()`等读取、解析和返回响应体的方法，那么`bodyUsed`属性会变成`true`,表示 `body` 流已经读完了
- 如果`bodyUsed`属性是`false`,那就意味着该流尚未被读取。此时，可以在`response.body`上调用`getReader()`获取流读取器对象，然后通过这个读取器对象的`read()`方法异步从流中读取文本块。
- 这个`read()`方法返回一个期约，解决为一个带有`done`和`value`属性的对象。如果响应体整个都读完了或者流被关闭了，`done`会变成`true`。 而`value`要么是下一个`Uint8Array`块，要么会在没有更多块时变成`undefined`。

```js
async function streamJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Network response failed: ${response.status} ${response.statusText}`
    );
  }

  // 获取数据总长度（可能为 null，需处理）
  const contentLength = response.headers.get('Content-Length');
  let receivedLength = 0;
  const chunks = []; // 存储接收到的二进制块

  const reader = response.body.getReader();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    chunks.push(value);
    // 获取当前块的字节长度
    receivedLength += value.length;

    // 如果 contentLength 存在，则显示进度
    if (contentLength) {
      console.log(
        `Received ${receivedLength} of ${contentLength} (${Math.round(
          (receivedLength / contentLength) * 100
        )}%)`
      );
    }
  }

  // 合并所有二进制块并解码为字符串
  const concatenated = new Uint8Array(receivedLength);
  let offset = 0;
  for (const chunk of chunks) {
    concatenated.set(chunk, offset);
    offset += chunk.length;
  }

  return JSON.parse(new TextDecoder().decode(concatenated));
}

// 使用示例
(async () => {
  try {
    const url = new URL('http://127.0.0.1:8080/data/users.json');
    const data = await streamJson(url);
    console.log('Parsed JSON:', data);
  } catch (error) {
    console.error('Error:', error);
  }
})();
```

### 指定请求方法和请求体

```js
fetch('http://127.0.0.1:8080/data/users.json', {
  method: 'Post',
  headers: {
    // 指定body中的数据类型，便于后端解析
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    name: 'John',
    age: 30,
  }),
}).then((res) => {
  if (res.ok) {
    console.log(res.json());
  } else {
    console.log('Network response failed');
  }
});
```

​POST 请求中传递参数的两种方法：

1. 使用 URLSearchParams（表单编码格式）​
   - 参数会被编码为 `name1=value1&name2=value2` 的形式。
   - 自动设置请求头 `Content-Type: application/x-www-form-urlencoded`。

```js
// 创建参数对象
const params = new URLSearchParams();
params.append('username', 'john');
params.append('password', '123456');

// 发送 POST 请求
fetch('https://api.example.com/login', {
  method: 'POST',
  body: params, // 自动编码为 "username=john&password=123456"
  headers: {
    // 注意：无需手动设置 Content-Type，浏览器会自动添加
  },
})
  .then((response) => response.json())
  .then((data) => console.log(data));
```

2. 使用 `FormData`（多部分表单数据格式）​
   - 适用于上传文件、二进制数据（如图片、视频）或混合文本+文件。
   - 参数会被编码为 `multipart/form-data` 格式，每个字段有独立的 `Content-Type`。
   - 自动生成边界字符串（如 `boundary=----WebKitFormBoundaryxxx`）。

::: code-group

```js [上传文本 + 文件]
const formData = new FormData();
formData.append('username', 'john');
formData.append('avatar', fileInput.files[0]); // 假设 fileInput 是文件输入框

fetch('https://api.example.com/upload', {
  method: 'POST',
  body: formData, // 自动处理 multipart 编码
  // 注意：无需手动设置 Content-Type，浏览器会自动添加
})
  .then((response) => response.json())
  .then((data) => console.log(data));
```

```js [通过 HTML 表单初始化]
<form id="myForm">
  <input type="text" name="username" value="john">
  <input type="file" name="avatar">
</form>

<script>
  const form = document.getElementById('myForm');
  const formData = new FormData(form); // 直接通过表单初始化

  fetch('https://api.example.com/upload', {
    method: 'POST',
    body: formData
  });
</script>
```

:::

### :star: 跨域请求

出于安全考虑，浏览器通常不允许跨源网络请求(当然跨源请求图片和脚本是例外)。不过，利用`CORS (Cross-Origin Resource Sharing)`跨源资源共享,可以实现安全的跨源请求。在通过 `fetch()`请求跨源 URL 时，浏览器会为请求添加一个`Origin`头部(且不允许通过 `headers` 属性覆盖它的值)以告知服务器这个请求来自不同源的文档。如果服务器对这个请求的响应中包含恰当的`Access-Control-Allow-Origin`头部，则请求可以继续。否则，如果服务器没有明确允许请求，则 `fetch()`返回的期约会被拒绝

::: tip 关于跨域是否收到了消息
跨域其实请求发过去浏览器也受到了响应,只不过浏览器拦截了跨域请求的响应,并不会影响页面的正常运行,所以我们可以用`fetch()`获取到响应,并进行处理。
:::

### 中断请求

有时候我们可能想中断已经发出的`fetch()`请求，比如用户单击了取消按钮或者请求时间过长。
此时，`fetch API`支持使用`AbortController`和`AbortSignal`类来中断请求(这两个类定义了通用的中断机制，也能在其他 API 中使用)。使用步骤如下：

1. 创建 `AbortController` 对象。
2. 通过 `signal` 属性获取 `AbortSignal` 对象。
3. 在 `fetch()` 方法中传入 `signal` 对象。
4. 调用 `abort()` 方法来中断请求。

```js
/**
 * 这个函数与 fetch() 类似，但增加了对超时的支持
 * 即支持在 options 对象上设置 timeout 属性，
 * 如果在该属性指定的时间内没有完成，则会中断请求
 */
function fetchWithTimeout(url, options = {}) {
  if (options.timeout) {
    // 如果有 timeout 属性且值不是 0
    let controller = new AbortController(); // 创建中断控制器
    options.signal = controller.signal; // 设置 signal 属性

    // 启动计时器，在经过指定毫秒后发送中断信号
    // 注意：未考虑取消计时器（请求完成后调用 abort() 无影响）
    setTimeout(() => {
      controller.abort();
    }, options.timeout);
  }

  // 正常发送请求（可能已绑定 signal）
  return fetch(url, options);
}
```

## 其他的一些选项

fetch 函数的第二个参数还可以传入如下配置

### `cache` 属性

控制浏览器缓存行为，可选值：  
| 值 | 作用 |
|----------------|--------------------------------------------------------------------|
| `"default"` | 默认行为：缓存新鲜（fresh）则直接返回；腐败（stale）则重新校验后再返回。 |
| `"no-store"` | **完全忽略缓存**：请求不查缓存，响应不更新缓存。 |
| `"reload"` | **强制网络请求**：忽略缓存，但响应后更新缓存。 |
| `"no-cache"` | **强制重新校验**：无论缓存是否新鲜，必须向服务器校验有效性。 |
| `"force-cache"`| **优先使用缓存**：即使缓存已腐败，也直接返回缓存值。 |

### `redirect` 属性

控制重定向处理方式，可选值：  
| 值 | 作用 |
|-------------|--------------------------------------------------------------------|
| `"follow"` | **默认值**：自动跟随重定向，响应状态码不会是 `300-399`。 |
| `"error"` | **禁止重定向**：服务器返回重定向时，`fetch()` 直接拒绝（抛出错误）。 |
| `"manual"` | **手动处理**：返回 `300-399` 状态码的响应，需自行解析 `Location` 头跟进。 |

### `referrer` 属性

控制 HTTP 请求的 `Referer` 头部（注：拼写错误保留历史习惯）：

- **设置值**：指定一个相对 URL 字符串作为 `Referer` 头内容。
- **空字符串**：请求中省略 `Referer` 头部（隐私保护或减少冗余）。
