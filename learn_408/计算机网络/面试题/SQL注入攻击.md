---
order: 355
---

# SQL 注入

[[toc]]

## 基本概念

Sq 注入攻击，是通过将恶意的 Sq1 查询或添加语句插入到应用的输入参数中，再在后台 Sql 服务器上解析执行进行的攻击

## 攻击条件

- 应用程序使用字符串拼接方式构造 SQL 语句
- 用户输入被直接拼接到 SQL 语句中
- 数据库用户权限过高

## 攻击案例

1. sql 语句使用字符串拼接

```sql
query = "SELECT * FROM users WHERE username = '" + username + "' AND password = '" + password + "'"

```

2. 攻击输入 ​：

```js
用户名：admin' --
密码：任意
```

3. 最终 SQL​：

```sql
SELECT * FROM users WHERE username = 'admin' --' AND password = '任意'
```
