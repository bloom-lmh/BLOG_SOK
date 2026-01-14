# joi 校验库

[[toc]]

## 起步

### 简介

joi 是 Node.js 平台上一个强大的验证库，它可以帮助我们验证用户输入，并提供友好的错误提示。

### 安装

```bash
npm install joi
```

## 基本使用

```js
import Joi = require('joi');

const schema1 = Joi.string().messages({
  'string.base': '必须是字符串',
  'string.empty': '不能为空',
});
console.log(schema1.validate(1).error);

const schema2 = schema1
  .pattern(/[a-z]+/) // 至少包含一个小写字母
  .min(3)
  .max(5)
  .messages({
    'string.pattern.base': '必须包含小写字母',
    'string.min': '长度不能小于3',
    'string.max': '长度不能大于5',
  });

const result = schema2.validate('1211111', { abortEarly: false });
console.log(result.error?.details);
```

::: tip 提示

1. 每次的链式调用`.` 都会返回一个新的 `schema` 实例。
2. `schema.validate(value)`可以验证传入的值是否符合 `schema` 定义的规则，如果不符合，则返回一个 `error` 对象。
3. `schema.validate(value,options)`,`options` 可以指定当前 `schema` 的校验行为，比如`abortEarly`为`false`时，遇到错误不会立即返回而是累积起来设置到`error`对象中。
4. `messages` 中可以自定义错误提示信息。但是要注意，当没返回一个具体`schema`实例时每一次的`messages`都会覆盖掉之前的设置。

:::

## 进阶使用

### Joi 常用错误类型代码

以下是 Joi 中常见的 错误类型代码（Error Types）

| 错误代码                | 触发场景                                           | 示例消息（默认）                                 |
| ----------------------- | -------------------------------------------------- | ------------------------------------------------ |
| `'string.base'`         | 输入值不是字符串类型                               | `"must be a string"`                             |
| `'string.empty'`        | 字符串为空                                         | `"cannot be empty"`                              |
| `'string.min'`          | 字符串长度小于限制                                 | `"length must be at least {#limit} characters"`  |
| `'string.max'`          | 字符串长度超过限制                                 | `"length must be less than {#limit} characters"` |
| `'string.pattern.base'` | 字符串不匹配正则表达式                             | `"fails to match the required pattern"`          |
| `'number.base'`         | 输入值不是数字类型                                 | `"must be a number"`                             |
| `'number.min'`          | 数字小于最小值                                     | `"must be greater than or equal to {#limit}"`    |
| `'number.max'`          | 数字超过最大值                                     | `"must be less than or equal to {#limit}"`       |
| `'array.base'`          | 输入值不是数组类型                                 | `"must be an array"`                             |
| `'array.min'`           | 数组长度小于限制                                   | `"must contain at least {#limit} items"`         |
| `'array.max'`           | 数组长度超过限制                                   | `"must contain less than {#limit} items"`        |
| `'object.base'`         | 输入值不是对象类型                                 | `"must be an object"`                            |
| `'object.unknown'`      | 对象包含未声明的字段                               | `"is not allowed"`                               |
| `'any.required'`        | 必填字段未提供                                     | `"is required"`                                  |
| `'any.invalid'`         | 输入值在禁用列表中（如 `.invalid('blacklist')`）   | `"contains an invalid value"`                    |
| `'any.only'`            | 输入值不在允许列表中（如 `.valid('a', 'b')`）      | `"must be one of [a, b]"`                        |
| `'alternatives.match'`  | 输入值不匹配 `alternatives.try()` 中的任何备选方案 | `"does not match any of the allowed types"`      |
| `'date.base'`           | 输入值不是有效日期                                 | `"must be a valid date"`                         |

### 模板变量（动态填充）

| 变量         | 作用                             | 示例                 |
| ------------ | -------------------------------- | -------------------- |
| "{#label} "  | 字段名（默认 `"value"`）         | "字段 {#label} 无效" |
| "{#value} "  | 当前输入值                       | "输入值：{#value}"   |
| "{#limit} "  | 规则限制值（如 `min(3)` 中的 3） | "最小长度 {#limit}"  |
| "{#pattern}" | 正则表达式（用于 `pattern`）     | "需匹配 {#pattern}"  |

### 如何使用这些错误代码？

```javascript
const schema = Joi.string()
  .min(3)
  .max(10)
  .pattern(/^[a-z]+$/)
  .messages({
    'string.base': '必须是字符串',
    'string.min': '长度不能小于 {#limit}',
    'string.pattern.base': '只能包含小写字母',
    'any.invalid': '不能是保留字',
  });
```
