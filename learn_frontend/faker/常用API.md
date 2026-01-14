# 常用 API

## 基础设置

### 初始化 & 本地化

```javascript
import { Faker } from '@faker-js/faker';

// 初始化（默认英语）
const faker = new Faker({
  locale: 'zh_CN', // 设置为中文
  randomizer: customRandomizer, // 可选：自定义随机源
});

// 动态切换语言
faker.locale = 'en'; // 切换为英语
```

### 随机种子（可重现性）

```javascript
faker.seed(123); // 固定随机序列，确保每次生成相同数据
```

---

## 常用数据生成模块

### 人物信息（`person`）

```javascript
faker.person.firstName(); // "张伟"（中文）
faker.person.lastName(); // "李"
faker.person.fullName(); // "王小明"
faker.person.gender(); // "男" 或 "女"
faker.person.jobTitle(); // "前端工程师"
```

### 地址（`location`）

```javascript
faker.location.city(); // "北京市"
faker.location.street(); // "朝阳区建国路88号"
faker.location.zipCode(); // "100000"
faker.location.country(); // "中国"
```

### 联系方式（`phone` / `internet`）

```javascript
faker.phone.number(); // "13800138000"
faker.internet.email(); // "zhangsan@example.com"
faker.internet.userName(); // "user_123"
faker.internet.password(); // "aBc!@#123"
```

### 日期 & 时间（`date`）

```javascript
faker.date.past(); // 随机过去日期，如 2023-05-15
faker.date.future(); // 随机未来日期
faker.date.birthdate(); // 随机生日（默认18-80岁）
```

### 金融 & 商业（`finance` / `commerce`）

```javascript
faker.finance.amount(); // "123.45"（随机金额）
faker.finance.creditCard(); // "4556-1234-5678-9012"
faker.commerce.product(); // "手机"
faker.commerce.price(); // "99.99"
```

### 文本 & 内容（`lorem` / `helpers`）

```javascript
faker.lorem.sentence(); // "这是一个随机句子。"
faker.lorem.paragraph(); // 生成一段文本
faker.helpers.arrayElement(['A', 'B', 'C']); // 随机选择数组元素
```
