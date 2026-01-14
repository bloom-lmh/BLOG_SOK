# Mock 函数

[[toc]]

## 基本概念

模拟函数允许你通过删除函数的实际实现来测试代码之间的连接，捕获对该函数的调用（以及传递的参数），在实例化构造函数时捕获实例，以及允许在测试时配置返回值。

## 基础 Mock 函数

```js
test('测试 mock 函数', () => {
  const mockFn = jest.fn();

  // 调用 mock 函数
  mockFn('hello', 42);

  // 验证调用情况
  expect(mockFn).toHaveBeenCalled();
  expect(mockFn).toHaveBeenCalledWith('hello', 42);
  expect(mockFn).toHaveBeenCalledTimes(1);
});
```

## Mock 返回值

### 固定返回值

```js
const mockFn = jest.fn().mockReturnValue('default');

test('测试返回值', () => {
  expect(mockFn()).toBe('default');
});
```

### 链式返回值

```js
const mockFn = jest.fn().mockReturnValueOnce('first').mockReturnValueOnce('second').mockReturnValue('default');

test('测试链式返回值', () => {
  expect(mockFn()).toBe('first');
  expect(mockFn()).toBe('second');
  expect(mockFn()).toBe('default');
  expect(mockFn()).toBe('default'); // 继续返回默认值
});
```

### Mock 实现

### 自定义实现

```js
const mockFn = jest.fn().mockImplementation((a, b) => a + b);

test('测试自定义实现', () => {
  expect(mockFn(1, 2)).toBe(3);
});
```

### 异步实现

```js
const asyncMock = jest.fn().mockResolvedValue('data');

test('测试异步实现', async () => {
  const result = await asyncMock();
  expect(result).toBe('data');
});
```

## Mock 模块

### 自动 mock

```js
jest.mock('axios'); // 自动 mock axios 模块

test('mock 模块', async () => {
  const axios = require('axios');
  axios.get.mockResolvedValue({ data: 'mock data' });

  const result = await axios.get('/api');
  expect(result.data).toBe('mock data');
});
```

### 手动 mock

```js
// __mocks__/user.js
module.exports = {
  getUser: jest.fn().mockReturnValue({ id: 1, name: 'Mock User' }),
};

// 测试文件
jest.mock('./user');

test('手动 mock', () => {
  const user = require('./user');
  expect(user.getUser()).toEqual({ id: 1, name: 'Mock User' });
});
```

::: warning 注意
mock 模块后对应模块的所有方法都将使用 mock 模块中的方法,比如我再下面的案例中使用了 mock 模拟`@/utils/envUtils`模块
:::

::: code-group

```js [mock模块]
// 模拟 EnvUtils 模块，优先于导入的模块
jest.mock('@/utils/envUtils', () => ({
  EnvUtils: {
    isTest: jest.fn(),
    currentEnv: jest.fn(() => 'test'),
  },
}));
```

```js [真实模块]
// 环境监测工具
export class EnvUtils {
  // 是否是测试环境
  static isTest(): boolean {
    // 同时检查 Jest 的全局变量
    return process.env.NODE_ENV === 'test' || typeof jest !== 'undefined' || process.env.JEST_WORKER_ID !== undefined;
  }
  static currentEnv(): string {
    return process.env.NODE_ENV || 'development';
  }
}
```

:::

那么所有用到这个模块方法的地方都会使用这个模拟的实现，而不会真的去导入模块。比如下面再测试中调用`ApiFactory.clear()`使用的是 mock 模块而不是真实模块的 EnvUtils 类的方法：

```js
beforeEach(() => {
  // 每个测试前重置 ApiFactory 的状态
  ApiFactory.clear();
  jest.clearAllMocks();
});
static clear() {
  // 使用 mock 模块的 EnvUtils 类
  if (!EnvUtils.isTest()) {
    throw new Error(
      `ApiFactory: clear() can only be used in test environment, not in ${EnvUtils.currentEnv()}`
    );
  }
  this.apiMaps.clear();
}
```

## Spy 函数

### 监视现有函数

```js
const obj = {
  method: () => 'original',
};

test('使用 spy', () => {
  const spy = jest.spyOn(obj, 'method');

  obj.method.mockReturnValueOnce('mocked');
  expect(obj.method()).toBe('mocked');

  spy.mockRestore(); // 恢复原始实现
  expect(obj.method()).toBe('original');
});
```

比如下面 inject 内部会调用`console.warn`,但实际测试会被替换为 mock 函数

```ts
test('1.5.10. 注入时类型不匹配会报警告', () => {
  // 1. 创建 spy 监听 console.warn
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {
    console.log('inject内部调用的是mock warn函数');
  });
  class Test {
    @Inject('testClass')
    test3!: Test3;
  }
  expect(warnSpy).toHaveBeenCalled();
  warnSpy.mockRestore(); // 恢复原始实现
});
```

## Mock 清除和重置

```js
const mockFn = jest.fn();

// 每次测试后清除 mock 状态
afterEach(() => {
  mockFn.mockClear();
});

// 或完全重置 mock
mockFn.mockReset();
```

## 高级用法

### Mock 函数名称

```js
const mockFn = jest.fn().mockName('myMockFunction');
```

### Mock 函数实现细节

```js
const mockFn = jest.fn((a, b) => a * b);

test('测试实现细节', () => {
  mockFn(2, 3);
  expect(mockFn.mock.results[0].value).toBe(6);
});
```

关于.mock 属性

```js
// 该函数被精确调用了一次
expect(someMockFunction.mock.calls).toHaveLength(1);

// 函数第一次调用的第一个参数是 'first arg'
expect(someMockFunction.mock.calls[0][0]).toBe('first arg');

// 函数第一次调用的第二个参数是 'second arg'
expect(someMockFunction.mock.calls[0][1]).toBe('second arg');

// 函数第一次调用的返回值是 'return value'
expect(someMockFunction.mock.results[0].value).toBe('return value');

// 函数被调用时的 this 上下文是 element 对象
expect(someMockFunction.mock.contexts[0]).toBe(element);

// 该函数被实例化了恰好两次
expect(someMockFunction.mock.instances.length).toBe(2);

// 该函数第一次实例化返回的对象
// 具有一个值为 'test' 的 name 属性
expect(someMockFunction.mock.instances[0].name).toBe('test');

// 函数最后一次调用的第一个参数是 'test'
expect(someMockFunction.mock.lastCall[0]).toBe('test');
```

### mock 定时器

`mock`可以劫持定时器来手动推进定时器任务

- 使用`advanceTimersByTime`手动推进
- 使用`runOnlyPendingTimers`只执行到下一个定时器任务
- 使用`runAllTimers`自动执行所有任务

```js
// 劫持axios函数，此后axios变为了mock函数
jest.mock('axios');
// axios声明为mock方法
const mockedAxios = axios as jest.MockedFunction<typeof axios>;
// 劫持定时器，需要手动推荐定时器时间
jest.useFakeTimers();

test.only('5.2 启用请求重发功能，并使用默认值', async () => {
  const mockResponse = { message: 'http://localhost:8000/list/xm/1' };
  // 模拟：失败、失败、成功
  mockedAxios
    .mockRejectedValueOnce(new Error('Network Error'))
    .mockRejectedValueOnce(new Error('Network Error'))
    .mockResolvedValueOnce(mockResponse );
  @HttpApi('http://localhost:8000')
  class UserApi {
    @Get({
      url: '/list/:name/:id',
      retry: true,
    })
    async getUsers(@PathParam('id') id: string, @PathParam('name') name: string): Promise<any> {}
  }
  const userApi = new UserApi();
  const resultPromise = userApi.getUsers('1', 'xm');
  // 第一次请求（立即执行）
  await Promise.resolve(); // 让微任务队列执行
   // 第一次重试（100ms）
  jest.advanceTimersByTime(100);
  await Promise.resolve(); // 确保 Promise 回调执行
  // 第二次重试（200ms）
  jest.advanceTimersByTime(200);
  await Promise.resolve();
  // 第三次重试（10000ms）
  jest.advanceTimersByTime(10000);
  await Promise.resolve();
  const result = await resultPromise;
  expect(mockedAxios).toHaveBeenCalledTimes(3);
  expect(result).toEqual(mockResponse);
}, 35_000);
```
