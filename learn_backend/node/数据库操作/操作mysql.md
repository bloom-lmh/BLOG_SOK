# 使用 mysql2

## 环境搭建

### 安装 mysql

不再做介绍

### 安装 mysql2

MySQL2 是适用于 Node.js 的 MySQL 客户端，专注于性能优化。支持 SQL 预处理、非 UTF-8 编码支持、二进制文件编码支持、压缩和 SSL 等等。MySQL2 可以跨平台使用，毫无疑问可以安装在 Linux、Mac OS 或 Windows 上。

```bash
npm install --save mysql2
```

## 创建连接

### 创建单个连接-createConnection

这个方法有两种使用方式（对应两种参数类型）：

1. 方式一：传入数据库的连接地址`connectionUrl: string`

::: code-group

```js [promise方式]
import mysql from 'mysql2/promise';

try {
  const connection = await mysql.createConnection('mysql://root:password@localhost:3306/test');
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const mysql = require('mysql2');

const connection = mysql.createConnection('mysql://root:password@localhost:3306/test');

connection.addListener('error', (err) => {
  console.log(err);
});
```

:::

2. 方式二：传入配置对象`config:ConnectionOptions`

::: code-group

```js [promise方式]
import mysql from 'mysql2/promise';

try {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'test',
    // port: 3306,
    // password: '',
  });
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  database: 'test',
  // port: 3306,
  // password: '',
});

connection.addListener('error', (err) => {
  console.log(err);
});
```

:::

其中`ConnectionOptions`配置对象如下：

````ts
export interface ConnectionOptions {
  /**
   * 如果将此选项设置为 `true`，DECIMAL 和 NEWDECIMAL 类型将作为数字返回（默认值：`false`）。
   */
  decimalNumbers?: boolean;

  /**
   * 用于认证的 MySQL 用户名。
   */
  user?: string;

  /**
   * 该 MySQL 用户的密码。
   */
  password?: string;

  /**
   * MySQL 用户密码的别名。在多重认证设置中（参考 "password2" 和 "password3"），
   * 这个命名更能体现其作为“第一要素”的含义。
   */
  password1?: string;

  /**
   * 第二要素认证密码。当 MySQL 用户账户的认证策略要求使用额外的、
   * 需要密码的认证方法时，此参数为必填项。
   * 参考文档：MySQL 多重认证文档
   */
  password2?: string;

  /**
   * 第三要素认证密码。当 MySQL 用户账户的认证策略要求使用两个额外的认证方法，
   * 且最后一个方法需要密码时，此参数为必填项。
   * 参考文档：MySQL 多重认证文档
   */
  password3?: string;

  /**
   * 此连接使用的数据库名称。
   */
  database?: string;

  /**
   * 连接的字符集。在 MySQL 的 SQL 层级中这被称为 'collation'（如 utf8_general_ci）。
   * 如果指定了 SQL 层级的字符集（如 utf8mb4），则使用该字符集的默认排序规则。
   * (默认值: 'UTF8_GENERAL_CI')
   */
  charset?: string;

  /**
   * 要连接的数据库主机名。（默认值: localhost）
   */
  host?: string;

  /**
   * 要连接的端口号。（默认值: 3306）
   */
  port?: number;

  /**
   * 用于 TCP 连接的源 IP 地址。
   */
  localAddress?: string;

  /**
   * 用于连接的 Unix 域套接字路径。使用此参数时，host 和 port 将被忽略。
   */
  socketPath?: string;

  /**
   * 用于存储本地日期的时区。（默认值: 'local'）
   */
  timezone?: string | 'local';

  /**
   * 在初始连接到 MySQL 服务器期间发生超时前的毫秒数。（默认值: 10 秒）
   */
  connectTimeout?: number;

  /**
   * 将对象字符串化，而不是转换为值。（默认值: 'false'）
   */
  stringifyObjects?: boolean;

  /**
   * 允许连接到要求使用旧版（不安全）认证方法的 MySQL 实例。（默认值: false）
   */
  insecureAuth?: boolean;

  /**
   * 通过指定一个返回可读流的函数，可以在发送本地文件时发送任意流。
   */
  infileStreamFactory?: (path: string) => Readable;

  /**
   * 确定是否应将列值转换为原生的 JavaScript 类型。
   *
   * @default true
   *
   * 不推荐（并且未来可能会移除或更改）禁用类型转换，但目前你可以在连接或查询级别这样做。
   *
   * ---
   *
   * 你也可以指定一个函数来自己执行类型转换：
   * ```ts
   * (field: Field, next: () => unknown) => {
   *   return next();
   * }
   * ```
   *
   * ---
   *
   * **警告：**
   *
   * 你必须在自定义的 typeCast 回调中使用以下三个字段函数之一来调用解析器。
   * 这些函数只能调用一次：
   *
   * ```js
   * field.string(); // 字符串
   * field.buffer(); // 缓冲区
   * field.geometry(); // 几何值
   * ```

   * 这些是以下方法的别名：
   *
   * ```js
   * parser.parseLengthCodedString(); // 解析长度编码的字符串
   * parser.parseLengthCodedBuffer(); // 解析长度编码的缓冲区
   * parser.parseGeometryValue(); // 解析几何值
   * ```
   *
   * 你可以通过查看 `RowDataPacket.prototype._typeCast` 来确定需要使用哪个字段函数。
   */
  typeCast?: TypeCast;

  /**
   * 自定义查询格式化函数。
   */
  queryFormat?: (query: string, values: any) => void;

  /**
   * 当处理数据库中的大数字（BIGINT 和 DECIMAL 列）时，你应该启用此选项。
   * (默认值: false)
   */
  supportBigNumbers?: boolean;

  /**
   * 同时启用 supportBigNumbers 和 bigNumberStrings 会强制大数字（BIGINT 和 DECIMAL 列）
   * 始终作为 JavaScript String 对象返回（默认值: false）。
   * 仅启用 supportBigNumbers 但保留 bigNumberStrings 禁用状态时，大数字仅在无法通过
   * [JavaScript Number 对象](https://262.ecma-international.org/5.1/#sec-8.5) 准确表示时
   * 才会作为 String 对象返回（即数值超出了 [-2^53, +2^53] 范围），否则将作为 Number 对象返回。
   * 如果禁用了 supportBigNumbers，此选项将被忽略。
   */
  bigNumberStrings?: boolean;

  /**
   * 强制日期类型（TIMESTAMP, DATETIME, DATE）作为字符串返回，而不是转换为 JavaScript Date 对象。
   * 可以是布尔值，也可以是要保持为字符串的类型名称数组。
   *
   * (默认值: false)
   */
  dateStrings?: boolean | Array<'TIMESTAMP' | 'DATETIME' | 'DATE'>;

  /**
   * 这将在 stdout 上打印所有 incoming（入站）和 outgoing（出站）的数据包。
   * 你也可以通过传递要调试的类型（字符串）数组来限制调试的数据包类型；
   *
   * (默认值: false)
   */
  debug?: any;

  /**
   * 在 Error 上生成堆栈跟踪，以包含库入口的调用位置（“长堆栈跟踪”）。
   * 对大多数调用会有轻微的性能损失。（默认值: true）
   */
  trace?: boolean;

  /**
   * 允许每个查询执行多个 MySQL 语句。使用此功能需谨慎，因为它会使你面临 SQL 注入攻击的风险。
   * (默认值: false)
   */
  multipleStatements?: boolean;

  /**
   * 要使用的连接标志列表，除了默认标志外。也可以用来将默认标志列入黑名单。
   */
  flags?: Array<string>;

  /**
   * 包含 ssl 参数的对象，或包含 ssl 配置文件名称的字符串。
   */
  ssl?: string | SslOptions;

  /**
   * 将每一行作为数组返回，而不是作为对象。
   * 当你有重复的列名时，这很有用。
   * 这也可以在 `QueryOption` 对象中设置，以应用于单个查询。
   */
  rowsAsArray?: boolean;

  /**
   * 在套接字上启用 keep-alive（保持活动）。（默认值: true）
   */
  enableKeepAlive?: boolean;

  /**
   * 如果启用了 keep-alive，用户可以提供初始延迟时间。（默认值: 0）
   */
  keepAliveInitialDelay?: number;

  // 以下属性在上述文档中未包含详细的 JSDoc 注释，因此仅保留字段名。
  // 它们通常对应于底层驱动或特定实现的高级配置。
  charsetNumber?: number;
  compress?: boolean;
  authSwitchHandler?: (data: any, callback: () => void) => any;
  connectAttributes?: { [param: string]: any };
  isServer?: boolean;
  maxPreparedStatements?: number;
  namedPlaceholders?: boolean;
  nestTables?: boolean | string;
  passwordSha1?: string;
  pool?: any;
  stream?: any;
  uri?: string;
  connectionLimit?: number;
  maxIdle?: number;
  idleTimeout?: number;
  Promise?: any;
  queueLimit?: number;
  waitForConnections?: boolean;
  disableEval?: boolean;
  authPlugins?: {
    [key: string]: AuthPlugin;
  };

  /**
   * 强制 JSON 作为字符串返回。
   *
   * (默认值: false)
   */
  jsonStrings?: boolean;

  gracefulEnd?: boolean;
}
````

### 创建连接池-createPool

这个方法用于创建连接池，可以复用连接，提高性能。它的使用和`createConnection`类似，只不过扩展了配置项。

1. 方式一：传入数据库的连接地址`connectionUrl: string`

::: code-group

```js [promise方式]
import mysql from 'mysql2/promise';

try {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    database: 'test',
    // port: 3306,
    // password: '',
  });
  const connection = await pool.getConnection();
  // ... some query

  connection.release();
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  database: 'test',
  // port: 3306,
  // password: '',
});

pool.getConnection(function (err, connection) {
  if (err instanceof Error) {
    console.log(err);
    return;
  }

  // ... some query

  connection.release();
});
```

:::

2. 方式二：传入配置对象`config: PoolOptions`

::: code-group

```js [promise方式]
import mysql from 'mysql2/promise';

try {
  const pool = mysql.createPool('mysql://root:password@localhost:3306/test');
  const connection = await pool.getConnection();
  // ... some query

  connection.release();
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const mysql = require('mysql2');

const pool = mysql.createPool('mysql://root:password@localhost:3306/test');

pool.getConnection(function (err, connection) {
  if (err instanceof Error) {
    console.log(err);
    return;
  }

  // ... some query

  connection.release();
});
```

:::

::: warning 注意
完成时别忘了通过以下方式释放连接：

- `pool.releaseConnection(connection)`
- `connection.release()`

:::

`PoolOptions` 扩展了来自 `ConnectionOptions`:

```ts
export interface PoolOptions extends ConnectionOptions {
  /**
   * 确定当没有可用连接且已达到连接限制时，连接池的行为。
   * 如果为 true，连接池将把连接请求加入队列，并在有连接可用时调用它。
   * 如果为 false，连接池将立即返回一个错误。
   * (默认值: true)
   */
  waitForConnections?: boolean;

  /**
   * 一次可以创建的最大连接数。
   * 这是连接池的上限，控制着最多能同时存在多少个数据库连接。
   * (默认值: 10)
   */
  connectionLimit?: number;

  /**
   * 最大空闲连接数。
   * 控制连接池中保持空闲状态的连接数量上限。
   * (默认值: 与 `connectionLimit` 相同)
   */
  maxIdle?: number;

  /**
   * 空闲连接的超时时间，单位为毫秒。
   * 如果一个连接空闲了超过这个时间，它可能会被连接池关闭以释放资源。
   * (默认值: 60000，即 60 秒)
   */
  idleTimeout?: number;

  /**
   * 获取连接的请求队列的最大长度。
   * 当连接池耗尽时，新的获取连接请求会被排队。如果队列长度超过了这个值，getConnection 将返回错误。
   * 如果设置为 0，则对排队的请求数量没有限制。
   * (默认值: 0)
   */
  queueLimit?: number;
}
```

### 连接池集群-createPoolCluster

简单来说，如果 `createPool` 是一个仓库里有很多把钥匙（连接），那么 `createPoolCluster` 就是一个管理系统，管理着多个不同仓库（可能是主库、从库、不同地区的库）的钥匙

使用方法也很简单就是使用`add`方法来添加连接池，然后使用`getConnection`方法来获取连接。

1. 方式一：`add(组：字符串，连接Uri：字符串)`

::: code-group

```js [promise方式]
import mysql from 'mysql2/promise';

try {
  const poolCluster = mysql.createPoolCluster();

  poolCluster.add('clusterA', 'mysql://root:password@localhost:3306/test');
  // poolCluster.add('clusterB', '...');

  const connection = await poolCluster.getConnection('clusterA');
  // ... some query

  connection.release();
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const mysql = require('mysql2');

const poolCluster = mysql.createPoolCluster();

poolCluster.add('clusterA', 'mysql://root:password@localhost:3306/test');
// poolCluster.add('clusterB', '...');

poolCluster.getConnection('clusterA', function (err, connection) {
  if (err instanceof Error) {
    console.log(err);
    return;
  }

  // ... some query

  connection.release();
});
```

:::

::: warning 注意
完成时别忘了通过以下方式释放连接：`connection.release()`
:::

2. 方式二：`add(组：字符串，配置对象：PoolOptions)`

::: code-group

```js [promise方式]
import mysql from 'mysql2/promise';

try {
  const poolCluster = mysql.createPoolCluster();

  poolCluster.add('clusterA', {
    host: 'localhost',
    user: 'root',
    database: 'test',
    // port: 3306,
    // password: '',
  });
  // poolCluster.add('clusterB', '...');

  const connection = await poolCluster.getConnection('clusterA');
  // ... some query

  connection.release();
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const mysql = require('mysql2');

const poolCluster = mysql.createPoolCluster();

poolCluster.add('clusterA', {
  host: 'localhost',
  user: 'root',
  database: 'test',
  // port: 3306,
  // password: '',
});
// poolCluster.add('clusterB', '...');

poolCluster.getConnection('clusterA', function (err, connection) {
  if (err instanceof Error) {
    console.log(err);
    return;
  }

  // ... some query

  connection.release();
});
```

:::

## 基本操作

### 插入

1. 方式一直接传入 sql 语句，基本语法：`query(sql: 字符串)`

::: code-group

```js [promise方式]
try {
  const sql = 'INSERT INTO `users`(`name`, `age`) VALUES ("Josh", 19), ("Page", 45)';

  const [result, fields] = await connection.query(sql);

  console.log(result);
  console.log(fields);
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const sql = 'INSERT INTO `users`(`name`, `age`) VALUES ("Josh", 19), ("Page", 45)';

connection.query(sql, (err, result, fields) => {
  if (err instanceof Error) {
    console.log(err);
    return;
  }

  console.log(result);
  console.log(fields);
});
```

:::

- `result`：插入后会返回一个 `ResultSetHeader` 对象，该对象提供有关服务器执行的操作的详细信息。
- `fields`：字段包含有关操作的额外元数据（如果可用）

::: info
用于查询的连接(`.query()`) 可通过`createConnection`, `createPoo`l 或`createPoolCluster`方法获取。
:::

`ResultSetHeader` 对象如下：

```js
/**
 * 结果集头部接口
 * 描述了数据库写操作（如 INSERT, UPDATE, DELETE）返回的元数据信息。
 */
declare interface ResultSetHeader {
  /**
   * 构造函数引用
   * 用于标识该对象的类型，值通常为 'ResultSetHeader'。
   */
  constructor: {
    name: 'ResultSetHeader',
  };

  /**
   * 影响的行数
   * 表示该 SQL 语句成功修改了多少行数据。
   * 对于 INSERT 语句，通常表示插入的行数。
   * 对于 UPDATE 语句，表示被更新的行数（即使值未变也算）。
   * 对于 DELETE 语句，表示被删除的行数。
   */
  affectedRows: number;

  /**
   * 字段数量
   * 表示该查询结果包含的列数。
   * 在写操作中，这个值通常较小或为 0，但在某些包含 RETURNING 子句的查询中可能有值。
   */
  fieldCount: number;

  /**
   * 详细信息字符串
   * 包含 MySQL 服务器返回的额外信息。
   * 例如："Records: 3 Duplicates: 0 Warnings: 0"。
   * 可用于调试复杂的 SQL 执行情况。
   */
  info: string;

  /**
   * 插入的 ID
   * 如果表有自增主键（AUTO_INCREMENT），执行 INSERT 语句后，这里会返回最新插入行的 ID。
   * 如果没有自增 ID，通常返回 0。
   */
  insertId: number;

  /**
   * 服务器状态
   * 一个整数，表示 MySQL 服务器的内部状态标志。
   * 通常用于底层库判断事务状态（如是否在事务中）、是否有更大数据包等。
   * 常见值含义需查阅 MySQL 协议文档。
   */
  serverStatus: number;

  /**
   * 警告状态
   * 表示执行过程中产生的警告数量。
   * 如果 SQL 执行中有数据被截断或类型转换，此数值会增加。
   */
  warningStatus: number;

  /**
   * 已更改的行数
   *
   * @deprecated
   * 已废弃。未来的主要版本中可能会被移除。
   * 请改用 `affectedRows` 属性。
   *
   * 区别说明：
   * `changedRows` 仅计算那些**实际数据发生了变化**的行。
   * 例如：执行 UPDATE 将某行的 status 从 1 改为 1（值没变），`affectedRows` 会加 1，但 `changedRows` 不会加。
   */
  changedRows: number;
}
```

2. 方式二：传入 sql 语句和参数，基本语法：`query(sql: 字符串,options:QueryOptions)`，如下所示：

::: code-group

```js [promise方式]
try {
  const sql = 'INSERT INTO `users`(`name`, `age`) VALUES ("Josh", 19), ("Page", 45)';

  const [result, fields] = await connection.query({
    sql,
    // ... other options
  });

  console.log(result);
  console.log(fields);
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const sql = 'INSERT INTO `users`(`name`, `age`) VALUES ("Josh", 19), ("Page", 45)';

connection.query(
  {
    sql,
    // ... other options
  },
  (err, result, fields) => {
    if (err instanceof Error) {
      console.log(err);
      return;
    }

    console.log(result);
    console.log(fields);
  }
);
```

:::

`QueryOptions`对象可以包含以下属性：

````js
export interface QueryOptions {
  /**
   * 查询的 SQL 语句
   */
  sql: string;

  /**
   * 查询的参数值
   * 可以是单个值、数组或命名参数对象
   */
  values?: any | any[] | { [param: string]: any };

  /**
   * 覆盖连接级别设置的 namedPlaceholders 选项。
   * 用于控制是否启用命名占位符功能
   */
  namedPlaceholders?: boolean;

  /**
   * 每个操作都可以选择性地设置一个不活动超时时间。
   * 这允许你为操作指定适当的超时时间。
   * 需要注意的是，这些超时并非 MySQL 协议的一部分，而是通过客户端实现的超时操作。
   * 这意味着当达到超时时，发生超时的连接将被销毁，且无法再执行进一步的操作。
   */
  timeout?: number;

  /**
   * 该选项可以是布尔值或字符串。
   * 如果为 true，表字段将被嵌套为对象。
   * 如果为字符串（例如 '_'），表字段将被嵌套为 tableName_fieldName 的格式。
   */
  nestTables?: any;

  /**
   * 确定是否应将列值转换为原生的 JavaScript 数据类型。
   *
   * @default true
   *
   * 不推荐（并且未来可能会移除或更改）禁用类型转换，但目前你仍然可以在连接或查询级别禁用它。
   *
   * ---
   *
   * 你也可以指定一个函数来自定义类型转换逻辑：
   * ```ts
   * (field: Field, next: () => unknown) => {
   *   return next();
   * }
   * ```
   *
   * ---
   *
   * **警告：**
   *
   * 你必须在自定义的 typeCast 回调中，使用以下三个字段函数之一来调用解析器。
   * 这些函数只能调用一次：
   *
   * ```js
   * field.string(); // 获取字符串值
   * field.buffer(); // 获取缓冲区值
   * field.geometry(); // 获取几何图形值
   * ```
   *
   * 它们分别是以下方法的别名：
   *
   * ```js
   * parser.parseLengthCodedString();
   * parser.parseLengthCodedBuffer();
   * parser.parseGeometryValue();
   * ```
   *
   * 你可以通过查看 `RowDataPacket.prototype._typeCast` 来确定需要使用哪个字段函数。
   */
  typeCast?: TypeCast;

  /**
   * 覆盖连接级别设置的 rowsAsArray 选项。
   * 用于控制结果集是否以数组形式返回（而非对象形式）。
   */
  rowsAsArray?: boolean;

  /**
   * 通过指定一个返回可读流 (Readable Stream) 的函数，
   * 在发送本地文件系统文件时，可以发送任意流数据。
   */
  infileStreamFactory?: (path: string) => Readable;
}
````

### 查询

1. 方式一：传入 sql 语句，基本语法：`query(sql: 字符串)`

::: code-group

```js [promise方式]
try {
  const sql = 'SELECT * FROM `users` WHERE `name` = "Page" AND `age` > 45';

  const [rows, fields] = await connection.query(sql);

  console.log(rows);
  console.log(fields);
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const sql = 'SELECT * FROM `users` WHERE `name` = "Page" AND `age` > 45';

connection.query(sql, (err, rows, fields) => {
  if (err instanceof Error) {
    console.log(err);
    return;
  }

  console.log(rows);
  console.log(fields);
});
```

:::

- `rows`：行包含服务器返回的行
- `fields`：字段包含有关行的额外元数据（如果可用）

2. 方式二：传入 sql 语句和参数，基本语法：`query(sql: 字符串,options:QueryOptions)`，如下所示：

::: code-group

```js [promise方式]
try {
  const sql = 'SELECT * FROM `users` WHERE `name` = "Page" AND `age` > 45';

  const [rows, fields] = await connection.query({
    sql,
    // ... other options
  });

  console.log(rows);
  console.log(fields);
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const sql = 'SELECT * FROM `users` WHERE `name` = "Page" AND `age` > 45';

connection.query(
  {
    sql,
    // ... other options
  },
  (err, rows, fields) => {
    if (err instanceof Error) {
      console.log(err);
      return;
    }

    console.log(rows);
    console.log(fields);
  }
);
```

:::

### 更新

更新操作和插入操作基本一致，只需将 `INSERT` 改为 `UPDATE` 即可。

### 删除

删除操作也和插入操作基本一致，只需将 `INSERT` 改为 `DELETE` 即可。

## 预编译语句

### 什么是预编译语句

预编译语句（Prepared Statements），也常被称为参数化查询，是应用程序与数据库交互时的一种高效且安全的机制。简单来说，它的核心思想是：“先编译 SQL 骨架，后填入数据执行”。

::: tip LRU 缓存
如果您再次执行相同的语句，它将从 LRU 缓存中获取，从而节省查询准备时间并带来更佳性能。
:::

### 对比字符串拼接方式

在传统的 SQL 查询中，我们通常是把 SQL 语句和用户输入的数据拼接成一个完整的字符串，然后发送给数据库执行。而预编译语句分为两步：

1. 编译阶段：应用程序先把带有占位符（如 `?` 或 `:name`）的 SQL 模板发送给数据库。数据库收到后，立刻对其进行语法解析、编译并生成执行计划。此时，SQL 的结构已经固定了。
2. 绑定阶段：应用程序再将用户的真实数据（如用户名、密码）发送给数据库。数据库将这些数据填入之前编译好的模板中执行

| 特性     | 字符串拼接 (不安全)                  | 预编译语句 (安全)                               |
| -------- | ------------------------------------ | ----------------------------------------------- |
| SQL 结构 | 在应用层拼接完成，数据库收到的是成品 | 在数据库端编译，结构在执行前已固化              |
| 数据处理 | 数据被视为 SQL 代码的一部分          | 数据被视为**纯参数**，不解析为代码              |
| 执行效率 | 每次都要解析、编译                   | 同样的 SQL 模板只需编译一次，可重复使用执行计划 |
| 安全性   | 极易受到 SQL 注入攻击                | 能有效防御绝大多数 SQL 注入                     |

### 自动准备并执行预编译语句

要想准备并使用预编译语句很简单。MySQL2 提供 `execute` 辅助工具，用于准备和执行语句。这个方法会先解析 SQL，生成执行计划并缓存（存于 Session），然后再执行。和`query`方法使用类似

1. 方式一：`execute(sql: string, values: any[])`

::: code-group

```js [promise方式]
try {
  const sql = 'INSERT INTO `users`(`name`, `age`) VALUES (?, ?), (?,?)';
  const values = ['Josh', 19, 'Page', 45];

  const [result, fields] = await connection.execute(sql, values);

  console.log(result);
  console.log(fields);
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const sql = 'INSERT INTO `users`(`name`, `age`) VALUES (?, ?), (?,?)';
const values = ['Josh', 19, 'Page', 45];

connection.execute(sql, values, (err, result, fields) => {
  if (err instanceof Error) {
    console.log(err);
    return;
  }

  console.log(result);
  console.log(fields);
});
```

:::

2. 方式二：`execute(options: QueryOptions)`

::: code-group

```js [promise方式]
try {
  const sql = 'INSERT INTO `users`(`name`, `age`) VALUES (?, ?), (?,?)';
  const values = ['Josh', 19, 'Page', 45];

  const [result, fields] = await connection.execute({
    sql,
    values,
    // ... other options
  });

  console.log(result);
  console.log(fields);
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
const sql = 'INSERT INTO `users`(`name`, `age`) VALUES (?, ?), (?,?)';
const values = ['Josh', 19, 'Page', 45];

connection.execute(
  {
    sql,
    values,
    // ... other options
  },
  (err, result, fields) => {
    if (err instanceof Error) {
      console.log(err);
      return;
    }

    console.log(result);
    console.log(fields);
  }
);
```

:::

3. 方式三：`execute(options：QueryOptions, values：any[])`

::: code-group

```js [promise方式]
try {
  const sql = 'INSERT INTO `users`(`name`, `age`) VALUES (?, ?), (?,?)';
  const values = ['Josh', 19, 'Page', 45];

  const [result, fields] = await connection.execute(
    {
      sql,
      // ... other options
    },
    values
  );

  console.log(result);
  console.log(fields);
} catch (err) {
  console.log(err);
}
```

```js [callback方式]
try {
  const sql = 'INSERT INTO `users`(`name`, `age`) VALUES (?, ?), (?,?)';
  const values = ['Josh', 19, 'Page', 45];

  const [result, fields] = await connection.execute(
    {
      sql,
      // ... other options
    },
    values
  );

  console.log(result);
  console.log(fields);
} catch (err) {
  console.log(err);
}
```

:::

### 手动准备和取消准备语句

当然 MYSQL2 中也为你提供了手动准备或取消准备语句的方法：`prepare` / `unprepare`

- 准备预编译语句：`connection.prepare(sql)`
- 取消预编译语句：`connection.unprepare(sql)`

| 操作      | 更准确的解释                                       | 作用                                         |
| :-------- | :------------------------------------------------- | :------------------------------------------- |
| Prepare   | 数据库解析 SQL，生成执行计划并缓存（存于 Session） | 提升性能：后续执行只需传参数，不用重复解析。 |
| Unprepare | 释放数据库服务器端缓存的执行计划和句柄             | 释放资源：防止无用的执行计划占用数据库内存。 |

::: code-group

```js [准备并执行]
// 先解析SQL并缓存
connection.prepare('select ? + ? as tests', (err, statement) => {
  // 完成后生成句柄并执行
  statement.execute([1, 2], (err, rows, columns) => {
    // -> [ { tests: 3 } ]
  });
  // 关闭句柄
  statement.close();
});
```

```js [取消准备]
// 准备并执行
connection.execute('select 1 + ? + ? as result', [5, 6], (err, rows) => {});

// 取消准备，释放数据库服务器端缓存的执行计划和句柄
connection.unprepare('select 1 + ? + ? as result');
```

:::

### 相关配置

在创建连接的时候可以指定将在 `lru-cache` 中保留缓存的语句。默认大小为 16000，但您可以使用`maxPreparedStatements`选项进行覆盖。这样多余的语句从缓存中删除的时将被 closed.

## 与 Promise 结合使用

### promise 链式调用

::: code-group

```js [单个连接]
/* eslint-env es6 */
const mysql = require('mysql2/promise'); // or require('mysql2').createConnectionPromise
mysql
  .createConnection({
    /* same parameters as for non-promise createConnection */
  })
  .then((conn) => conn.query('select foo from bar'))
  .then(([rows, fields]) => console.log(rows[0].foo));
```

```js [连接池]
const pool = require('mysql2/promise').createPool({}); // or require('mysql2').createPoolPromise({}) or require('mysql2').createPool({}).promise()
pool
  .getConnection()
  .then((conn) => {
    const res = conn.query('select foo from bar');
    conn.release();
    return res;
  })
  .then((result) => {
    console.log(result[0][0].foo);
  })
  .catch((err) => {
    console.log(err); // any of connection time or query time errors from above
  });
```

:::

### ES7 Async Await

```js
async function example1() {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({ database: test });
  const [rows, fields] = await conn.execute('select ?+? as sum', [2, 2]);
  await conn.end();
}

async function example2() {
  const mysql = require('mysql2/promise');
  const pool = mysql.createPool({ database: test });
  // execute in parallel, next console.log in 3 seconds
  await Promise.all([pool.query('select sleep(2)'), pool.query('select sleep(3)')]);
  console.log('3 seconds after');
  await pool.end();
}
```

## 结合 ts 使用

### 导入 MYSQL2

您可以通过两种方式导入 MySQL2：

1. 通过将 esModuleInterop 选项设置为 trueintsconfig.json

```js
import mysql from 'mysql2';
import mysql from 'mysql2/promise';
```

2. 通过将`esModuleInterop`选项设置为`falseintsconfig.json`

```js
import * as mysql from 'mysql2';
import * as mysql from 'mysql2/promise';
```

### 连接配置

::: code-group

```js [单条连接]
import mysql, { ConnectionOptions } from 'mysql2';

const access: ConnectionOptions = {
  user: 'test',
  database: 'test',
};

const conn = mysql.createConnection(access);
```

```js [池连接]
import mysql, { PoolOptions } from 'mysql2';

const access: PoolOptions = {
  user: 'test',
  database: 'test',
};

const conn = mysql.createPool(access);
```

:::

### 输出类型

输出将是以下可能的类型：

1. 包含返回行的数组时返回`RowDataPacket[]`

```js
import mysql, { RowDataPacket } from 'mysql2';

const conn = mysql.createConnection({
  user: 'test',
  database: 'test',
});

// SELECT
conn.query<RowDataPacket[]>('SELECT 1 + 1 AS `test`;', (_err, rows) => {
  console.log(rows);
  /**
   * @rows: [ { test: 2 } ]
   */
});

// SHOW
conn.query<RowDataPacket[]>('SHOW TABLES FROM `test`;', (_err, rows) => {
  console.log(rows);
  /**
   * @rows: [ { Tables_in_test: 'test' } ]
   */
});
```

2. 当使用`rowsAsArray`选项为 true 时返回`RowDataPacket[][]`类型:

```js
import mysql, { RowDataPacket } from 'mysql2';

const conn = mysql.createConnection({
  user: 'test',
  database: 'test',
  rowsAsArray: true,
});

// SELECT
conn.query<RowDataPacket[]>(
  'SELECT 1 + 1 AS test, 2 + 2 AS test;',
  (_err, rows) => {
    console.log(rows);
    /**
     * @rows: [ [ 2, 4 ] ]
     */
  }
);

// SHOW
conn.query<RowDataPacket[]>('SHOW TABLES FROM `test`;', (_err, rows) => {
  console.log(rows);
  /**
   * @rows: [ [ 'test' ] ]
   */
});
```

3.  使用`multipleStatements`选项作为 true 多个查询时返回`RowDataPacket[][]`类型:

```js
import mysql, { RowDataPacket } from 'mysql2';

const conn = mysql.createConnection({
  user: 'test',
  database: 'test',
  multipleStatements: true,
});

const sql = `
  SELECT 1 + 1 AS test;
  SELECT 2 + 2 AS test;
`;

conn.query<RowDataPacket[][]>(sql, (_err, rows) => {
  console.log(rows);
  /**
   * @rows: [ [ { test: 2 } ], [ { test: 4 } ] ]
   */
});
```

- 当是使用`INSERT, UPDATE, DELETE, TRUNCATE`等语句将返回`ResultSetHeader`类型：

```js
import mysql, { ResultSetHeader } from 'mysql2';

const conn = mysql.createConnection({
  user: 'test',
  database: 'test',
});

const sql = `
  SET @1 = 1;
`;

conn.query <
  ResultSetHeader >
  (sql,
  (_err, result) => {
    console.log(result);
    /**
   * @result: ResultSetHeader {
      fieldCount: 0,
      affectedRows: 0,
      insertId: 0,
      info: '',
      serverStatus: 2,
      warningStatus: 0,
      changedRows: 0
    }
   */
  });
```

4. 对于多个`INSERT, UPDATE, DELETE, TRUNCATE`语句等，且当使用`multipleStatements`时 true 则返回`ResultSetHeader[]`类型：

```js
import mysql, { ResultSetHeader } from 'mysql2';

const conn = mysql.createConnection({
  user: 'test',
  database: 'test',
  multipleStatements: true,
});

const sql = `
  SET @1 = 1;
  SET @2 = 2;
`;

conn.query<ResultSetHeader[]>(sql, (_err, results) => {
  console.log(results);
  /**
   * @results: [
      ResultSetHeader {
        fieldCount: 0,
        affectedRows: 0,
        insertId: 0,
        info: '',
        serverStatus: 10,
        warningStatus: 0,
        changedRows: 0
      },
      ResultSetHeader {
        fieldCount: 0,
        affectedRows: 0,
        insertId: 0,
        info: '',
        serverStatus: 2,
        warningStatus: 0,
        changedRows: 0
      }
    ]
   */
});
```

## 事务

下面以转账为例来介绍事务：

```js
import mysql from 'mysql2/promise';

async function transfer(fromId: number, toId: number, amount: number) {
  // 1. 获取连接（如果是连接池，确保整个事务使用同一个 connection）
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    database: 'bank',
    password: 'your_password'
  });

  try {
    // 2. 开启事务
    await connection.beginTransaction();

    // 3. 扣款
    const [fromResult] = await connection.execute(
      'UPDATE accounts SET balance = balance - ? WHERE id = ?',
      [amount, fromId]
    );
    if ((fromResult as any).affectedRows === 0) {
      throw new Error('扣款账户不存在或余额不足');
    }

    // 4. 入账
    const [toResult] = await connection.execute(
      'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      [amount, toId]
    );
    if ((toResult as any).affectedRows === 0) {
      throw new Error('收款账户不存在');
    }

    // 5. 提交事务
    await connection.commit();
    console.log('转账成功！');

  } catch (err) {
    // 6. 出错则回滚
    await connection.rollback();
    console.error('事务回滚:', err.message);
    throw err; // 可选择向上抛出
  } finally {
    // 7. 关闭连接（如果是单连接）或释放回池（如果是连接池）
    await connection.end(); // 或 connection.release() 如果来自 pool
  }
}

// 调用
transfer(1, 2, 100).catch(console.error);
```
