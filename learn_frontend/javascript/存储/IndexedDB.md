---
order: 137
---

# ​IndexedDB​

[[toc]]

## 基本概念

### IndexedDB 的作用域

同源策略：与 `localStorage` 类似，`IndexedDB` 的作用域限定为包含文档的来源
访问权限：同源网页可以互相访问对方的数据，不同源的网页则不能相互访问

### IndexedDB 的数量限制

数据库数量：每个来源可以有任意数量的 `IndexedDB` 数据库
命名规则：每个数据库的名字必须在当前来源下唯一

### 数据库结构

对象存储：数据库是对象存储（Object Store）的集合
数据格式：存储的对象使用结构化克隆算法序列化，支持复杂数据类型（Map、Set、定型数组等）

键要求：

- 每个对象必须有一个键，用于排序和检索(键必须唯一且有自然顺序（字符串、数值、Date 对象都有效）)
- 可以自动生成唯一键或指定键路径从对象属性提取键

### 索引机制

索引功能：可以在对象存储上定义索引，按对象其他属性值搜索
索引特点：索引一般不是唯一的，多个对象可能匹配一个键值

### 事务特性

原子性保证：查询和更新操作按事务分组，要么全部成功，要么全部失败
事务管理：比传统数据库 API 更简单

## 基本使用

### 数据库操作流程

1. 打开数据库：通过名称打开对应的数据库
2. 创建事务：创建事务对象
3. 查找对象存储：通过名称查找数据库中的对象存储
4. 执行操作：调用对象存储的方法进行查询或存储操作

```js
// 打开或创建数据库（版本1）
const request = indexedDB.open('EmployeeDB', 1);

request.onerror = event => {
  console.error('数据库打开失败:', event.target.error);
};

// 数据库结构初始化/升级
request.onupgradeneeded = event => {
  const db = event.target.result;

  // 创建员工对象存储（主键为id，自增）
  const employeeStore = db.createObjectStore('employees', {
    keyPath: 'id',
    autoIncrement: true,
  });

  // 创建索引（部门索引不唯一，工号索引唯一）
  employeeStore.createIndex('department', 'department', { unique: false });
  employeeStore.createIndex('employeeId', 'employeeId', { unique: true });

  console.log('数据库结构已初始化');
};
```

### 添加数据

```js
function addEmployee(db, employeeData) {
  // 创建读写事务
  const transaction = db.transaction(['employees'], 'readwrite');
  const store = transaction.objectStore('employees');

  // 添加数据
  const request = store.add(employeeData);

  request.onsuccess = () => {
    console.log('员工数据添加成功');
  };

  request.onerror = event => {
    console.error('添加失败:', event.target.error);
  };
}

// 使用示例
request.onsuccess = event => {
  const db = event.target.result;

  addEmployee(db, {
    name: '张三',
    department: '技术部',
    employeeId: 'TECH001',
    level: '高级工程师',
  });
};
```

### 查询方法

主键查询：使用对象存储的 `get()` 方法

```js
function getEmployeeById(db, id) {
  const transaction = db.transaction(['employees'], 'readonly');
  const store = transaction.objectStore('employees');

  const request = store.get(id);

  request.onsuccess = event => {
    const employee = event.target.result;
    console.log('查询结果:', employee);
  };
}
```

索引查询（按部门）:

```js
function getEmployeesByDepartment(db, department) {
  const transaction = db.transaction(['employees'], 'readonly');
  const store = transaction.objectStore('employees');
  const index = store.index('department');

  // 获取该部门所有员工
  const request = index.getAll(department);

  request.onsuccess = event => {
    console.log(`${department}员工列表:`, event.target.result);
  };
}
```

### 更新数据示例

```js
function updateEmployee(db, employee) {
  const transaction = db.transaction(['employees'], 'readwrite');
  const store = transaction.objectStore('employees');

  // 更新数据（需包含主键id）
  const request = store.put(employee);

  request.onsuccess = () => {
    console.log('员工数据更新成功');
  };
}
```
