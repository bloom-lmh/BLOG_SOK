# MyBatis-Plus

> **一句话定位**：MyBatis-Plus（简称 MP）是 [MyBatis](./MyBatis) 的增强工具，在 MyBatis 之上提供「通用 Mapper（BaseMapper）+ 条件构造器（Wrapper）+ 插件体系 + Service 层通用接口（IService）」，把单表 CRUD 从「手写 SQL + XML」变成「一行方法调用」，解决 MyBatis 单表增删改查重复劳动、代码臃肿的问题，**只做增强不做侵入，引入它不会影响 MyBatis 原有能力**。

---

## 0. 为什么需要 MyBatis-Plus（背景）

### 0.1 原生 MyBatis 的痛点

原生 [MyBatis](./MyBatis) 解决的是「JDBC 模板代码太多」的问题，但它依然是「半自动 ORM」：SQL 还是得你自己写。一个项目里，每个实体都要重复写下面这一整套东西：

```xml
<!-- UserMapper.xml：每一张表都要写一遍的样板代码 -->
<insert id="insert" parameterType="User">
    INSERT INTO user(name, age, email) VALUES(#{name}, #{age}, #{email})
</insert>

<select id="selectById" resultType="User">
    SELECT * FROM user WHERE id = #{id}
</select>

<update id="updateById" parameterType="User">
    UPDATE user SET name=#{name}, age=#{age}, email=#{email} WHERE id=#{id}
</update>

<delete id="deleteById">
    DELETE FROM user WHERE id = #{id}
</delete>
```

一套 `User` 就要 4 段 SQL，如果有 50 张表，就是 200 段几乎一模一样的代码。更麻烦的是：

- **字段一改，处处改**：表加一列，所有 insert/update 语句都要跟着补。
- **动态条件难拼**：`WHERE name=? AND age>? AND ...` 要手动写 `<if>` 判断，逻辑一多 XML 又臭又长。
- **分页、逻辑删除、乐观锁**这些通用能力，每张表都要自己实现一遍。

### 0.2 MyBatis-Plus 的定位

MyBatis-Plus 做的事情概括成一句话：**在保留 MyBatis 全部能力的前提下，把「单表 CRUD」这条最枯燥的路铺平**。

- **单表操作**：继承 `BaseMapper<T>`，`insert / selectById / updateById / deleteById` 全部现成，零 SQL。
- **复杂/多表操作**：依然回到 MyBatis 原生方式（XML / 注解）自己写 SQL——MP 不拦着你。
- **通用能力**：分页、逻辑删除、乐观锁、自动填充、多租户……全部做成「插件」按需装配。

这就是「只做增强不做侵入」的含义：MP 没有替换 MyBatis，它是在 MyBatis 的 `SqlSession` 之上又包了一层，你随时可以「退回」原生 MyBatis 写法。

### 0.3 版本与依赖选型

MyBatis-Plus 3.x 是当前主流版本，依赖命名随 Spring Boot 版本不同：

| Spring Boot 版本 | 依赖坐标 | 说明 |
| --- | --- | --- |
| Spring Boot 3.x（JDK 17+） | `mybatis-plus-spring-boot3-starter` | 适配 `jakarta.*` 命名空间 |
| Spring Boot 2.x（JDK 8+） | `mybatis-plus-boot-starter` | 适配 `javax.*` 命名空间 |

> 本文以 **Spring Boot 3.x + MyBatis-Plus 3.5.7** 为基准，老项目把依赖坐标和包名换成 `javax.*` 即可。

---

## 基础篇

### 1. 快速开始（五分钟跑通）

#### 1.1 引入依赖

```xml
<!-- 为什么用 spring-boot3-starter：跟随 Spring Boot 3 的 jakarta 命名空间，避免与 servlet 包冲突 -->
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
    <version>3.5.7</version>
</dependency>

<!-- 数据库驱动：以 MySQL 为例 -->
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
    <scope>runtime</scope>
</dependency>
```

#### 1.2 配置数据源

```yaml
spring:
  datasource:
    url: jdbc:mysql://localhost:3306/mp_demo?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8
    username: root
    password: 123456
    driver-class-name: com.mysql.cj.jdbc.Driver

mybatis-plus:
  configuration:
    # 下划线转驼峰：数据库列 user_name -> 实体字段 userName
    map-underscore-to-camel-case: true
    # 打印 SQL 日志（开发期调试用，生产建议关闭）
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl
  global-config:
    banner: false   # 关闭启动时的 MP 图标横幅
```

#### 1.3 建表

```sql
CREATE TABLE `user` (
    `id`          BIGINT       NOT NULL COMMENT '主键（雪花算法生成）',
    `name`        VARCHAR(50)  DEFAULT NULL COMMENT '姓名',
    `age`         INT          DEFAULT NULL COMMENT '年龄',
    `email`       VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
    `deleted`     TINYINT      DEFAULT 0 COMMENT '逻辑删除标记：0未删 1已删',
    `version`     INT          DEFAULT 0 COMMENT '乐观锁版本号',
    `create_time` DATETIME     DEFAULT NULL COMMENT '创建时间',
    `update_time` DATETIME     DEFAULT NULL COMMENT '更新时间',
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
```

#### 1.4 实体类

```java
@Data
@TableName("user")   // 表名默认就是 user，显式写出是规范习惯
public class User {

    @TableId(type = IdType.ASSIGN_ID)   // 主键：雪花算法生成全局唯一 Long
    private Long id;

    private String name;
    private Integer age;
    private String email;

    @TableLogic                        // 逻辑删除字段（后面高级篇细讲）
    private Integer deleted;

    @Version                           // 乐观锁版本号
    private Integer version;

    @TableField(fill = FieldFill.INSERT)          // 插入时自动填充
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)   // 插入+更新时自动填充
    private LocalDateTime updateTime;
}
```

#### 1.5 Mapper 接口

```java
@Mapper
// 为什么继承 BaseMapper：里面已经内置了 30+ 个单表 CRUD 方法，
// 你不需要写任何 SQL，单表操作直接调用即可
public interface UserMapper extends BaseMapper<User> {
    // 只有复杂/多表查询才需要在这里自定义方法
}
```

> 也可以在启动类上统一加 `@MapperScan("com.example.mapper")`，这样每个 Mapper 就不用逐个写 `@Mapper` 了。

#### 1.6 验证

```java
@SpringBootTest
class UserMapperTest {

    @Autowired
    private UserMapper userMapper;

    @Test
    void crud() {
        User user = new User();
        user.setName("张三");
        user.setAge(20);
        user.setEmail("zhangsan@qq.com");
        userMapper.insert(user);
        System.out.println("生成的主键 = " + user.getId()); // 雪花 ID，如 1741234567890123456
    }
}
```

跑通后，控制台会打印 MP 自动生成并执行的 SQL：`INSERT INTO user ( id, name, age, email, create_time ) VALUES ( ?, ?, ?, ?, ? )`——你一行 SQL 都没写。

---

### 2. 通用 CRUD（BaseMapper 全方法）

`BaseMapper<T>` 是 MP 的「地基」，它把单表增删改查全部内置。下面按操作类型成体系梳理，**每个方法都是现成可调用的，不需要写 SQL**。

#### 2.1 插入

| 方法 | 说明 | 使用场景 |
| --- | --- | --- |
| `int insert(T entity)` | 插入一条记录 | 通用新增，主键按 `@TableId` 策略自动回填到对象 |

```java
User user = new User();
user.setName("李四");
user.setAge(25);
int rows = userMapper.insert(user);
// 为什么能拿到主键：insert 后 MP 会把生成的雪花 ID 回填到实体 id 字段
System.out.println(user.getId());
```

#### 2.2 删除

| 方法 | 说明 | 使用场景 |
| --- | --- | --- |
| `int deleteById(Serializable id)` | 按主键删除 | 单个删除 |
| `int deleteBatchIds(Collection<?> ids)` | 按主键批量删除 | 勾选多条批量删 |
| `int deleteByMap(Map<String,Object> columnMap)` | 按列等值条件删除 | `where name='a' and age=1` |
| `int delete(Wrapper<T> wrapper)` | 按条件构造器删除 | 灵活条件删除 |

```java
userMapper.deleteById(1L);                                  // DELETE FROM user WHERE id=1
userMapper.deleteBatchIds(Arrays.asList(1L, 2L, 3L));      // DELETE FROM user WHERE id IN (1,2,3)

Map<String, Object> map = new HashMap<>();
map.put("name", "张三");
map.put("age", 20);
userMapper.deleteByMap(map);                                // 列等值条件删除
```

#### 2.3 修改

| 方法 | 说明 | 使用场景 |
| --- | --- | --- |
| `int updateById(T entity)` | 按主键更新，**只更新非 null 字段** | 通用按主键改 |
| `int update(T entity, Wrapper<T> wrapper)` | 按条件更新 | 批量改某类数据 |

```java
User user = userMapper.selectById(1L);
user.setAge(30);
userMapper.updateById(user);   // UPDATE user SET age=30 WHERE id=1
// 为什么只更新非 null 字段：实体里 null 的字段会被忽略，不会把 name 覆盖成 null
```

> **重要**：`updateById` 默认「空值不更新」。如果想把某个字段显式改成 `null`，需要给该字段加 `@TableField(updateStrategy = FieldStrategy.IGNORED)`，或使用 `UpdateWrapper` 的 `set` 方法。

#### 2.4 查询

| 方法 | 返回类型 | 说明 | 使用场景 |
| --- | --- | --- | --- |
| `selectById(Serializable id)` | `T` | 按主键查一条 | 详情页 |
| `selectBatchIds(Collection<?> ids)` | `List<T>` | 按主键批量查 | `where id in (...)` |
| `selectByMap(Map<String,Object> map)` | `List<T>` | 按列等值查 | 简单等值条件 |
| `selectOne(Wrapper<T> wrapper)` | `T` | 查一条（多结果会抛异常） | 唯一约束查询 |
| `selectCount(Wrapper<T> wrapper)` | `Long` | 统计条数 | 列表总数 |
| `selectList(Wrapper<T> wrapper)` | `List<T>` | 按条件查多条 | 列表页 |
| `selectMaps(Wrapper<T> wrapper)` | `List<Map>` | 查多条返回 Map | 只取部分列/聚合 |
| `selectObjs(Wrapper<T> wrapper)` | `List<Object>` | 只返回第一列 | 只取 id 列表 |
| `selectPage(Page<T> page, Wrapper<T> w)` | `IPage<T>` | 分页查询 | 分页列表 |

```java
User u = userMapper.selectById(1L);                     // 按主键查
List<User> list = userMapper.selectList(null);          // 传 null 表示无条件，查全部

// selectMaps：只需要 name 和 age 两列，且想拿 Map 处理时
QueryWrapper<User> qw = new QueryWrapper<>();
qw.select("name", "age");                               // 只查两列
List<Map<String, Object>> maps = userMapper.selectMaps(qw);

// selectObjs：只拿所有 id
List<Object> ids = userMapper.selectObjs(null);         // [1, 2, 3, ...]
```

#### 2.5 小结

`BaseMapper` 把 90% 的单表 CRUD 覆盖掉了。**判断一个操作能不能用 BaseMapper 搞定，就看它是不是「单表、按主键或简单条件」**；一旦涉及多表 join、子查询、聚合统计，就回到 Mapper 里自定义方法写原生 SQL。

---

### 3. 条件构造器 Wrapper（重点中的重点）

Wrapper 是拼「动态查询条件」的核心工具。它的本质是：**用 Java 链式调用的方式，帮你拼出 `WHERE` 后面的 SQL 片段**，避免手写一堆 `<if>` 判断。

#### 3.1 Wrapper 家族：四种怎么选

| 类型 | 字段写法 | 是否可写 set（更新） | 使用场景 |
| --- | --- | --- | --- |
| `QueryWrapper<T>` | 字符串列名 `"name"` | 否 | 纯查询，图省事 |
| `LambdaQueryWrapper<T>` | 方法引用 `User::getName` | 否 | **推荐**，编译期校验字段名 |
| `UpdateWrapper<T>` | 字符串列名 | 是 | 更新时带 set |
| `LambdaUpdateWrapper<T>` | 方法引用 | 是 | **推荐**，更新时带 set |

> **为什么优先用 Lambda 版本**：`User::getAge` 是方法引用，字段名由编译器从实体上解析，一旦数据库字段或实体字段改名，编译直接报错；而字符串 `"age"` 写错了是运行时才暴露的「静默 bug」。

#### 3.2 条件方法速查（成体系）

以下方法来自 `AbstractWrapper`，`QueryWrapper` 和 `LambdaQueryWrapper` 都拥有：

**比较运算**

| 方法 | SQL 片段 | 示例 |
| --- | --- | --- |
| `eq(R column, Object val)` | `= ?` | `.eq(User::getName, "张三")` |
| `ne(R column, Object val)` | `<> ?` | `.ne(User::getAge, 18)` |
| `gt(R column, Object val)` | `> ?` | `.gt(User::getAge, 18)` |
| `ge(R column, Object val)` | `>= ?` | `.ge(User::getAge, 18)` |
| `lt(R column, Object val)` | `< ?` | `.lt(User::getAge, 60)` |
| `le(R column, Object val)` | `<= ?` | `.le(User::getAge, 60)` |

**模糊 / 范围**

| 方法 | SQL 片段 | 示例 |
| --- | --- | --- |
| `like(R c, Object v)` | `LIKE '%v%'` | `.like(User::getEmail, "gmail")` |
| `notLike(R c, Object v)` | `NOT LIKE '%v%'` | |
| `likeLeft(R c, Object v)` | `LIKE '%v'` | 后缀匹配 |
| `likeRight(R c, Object v)` | `LIKE 'v%'` | 前缀匹配 |
| `between(R c, v1, v2)` | `BETWEEN v1 AND v2` | `.between(User::getAge, 18, 30)` |
| `notBetween(R c, v1, v2)` | `NOT BETWEEN` | |
| `in(R c, Collection<?>)` | `IN (?,?)` | `.in(User::getId, ids)` |
| `in(R c, Object... v)` | `IN (?,?)` | `.in(User::getId, 1, 2, 3)` |
| `notIn(R c, Collection<?>)` | `NOT IN` | |
| `isNull(R c)` / `isNotNull(R c)` | `IS NULL` / `IS NOT NULL` | |

**逻辑连接 / 分组**

| 方法 | 说明 |
| --- | --- |
| `and(Consumer<Param>)` | 把括号内的条件用 AND 连接，如 `and(w -> w.gt(...).lt(...))` |
| `or()` | 后面的条件改用 OR 连接 |
| `or(Consumer<Param>)` | 括号内条件整体 OR |
| `nested(Consumer<Param>)` | 显式加一层括号（等价 and 的嵌套） |
| `groupBy(R... columns)` | `GROUP BY` |
| `having(String sqlHaving, Object... params)` | `HAVING` |
| `orderByAsc(R... columns)` | `ORDER BY ... ASC` |
| `orderByDesc(R... columns)` | `ORDER BY ... DESC` |
| `orderBy(boolean condition, boolean isAsc, R... cols)` | 条件排序 |

**灵活扩展（慎用）**

| 方法 | 说明 |
| --- | --- |
| `apply(String sql, Object... params)` | 直接拼一段 SQL 片段，如 `apply("date_format(create_time,'%Y') = {0}", "2026")` |
| `last(String lastSql)` | 在最后追加，如 `last("limit 1")`（**有 SQL 注入风险**） |
| `select(String... columns)` | 指定查询列（QueryWrapper 专用） |
| `func(Consumer<Children>)` | 条件分支的语法糖，见 3.5 |

#### 3.3 基本示例

```java
LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
wrapper.eq(User::getName, "张三")                 // where name = '张三'
       .gt(User::getAge, 18)                     //   and age > 18
       .like(User::getEmail, "gmail")            //   and email like '%gmail%'
       .orderByDesc(User::getCreateTime);        //   order by create_time desc

List<User> list = userMapper.selectList(wrapper);
```

生成的 SQL：

```sql
SELECT id,name,age,email,deleted,version,create_time,update_time
FROM user
WHERE name = '张三' AND age > 18 AND email LIKE '%gmail%'
ORDER BY create_time DESC
```

#### 3.4 动态条件：`condition` 参数

实际项目里，查询条件是「有才拼、没有就不拼」的。所有条件方法第一个参数都能传一个 `boolean condition`：

```java
// 前端传了 name 才拼 name 条件，传了 age 区间才拼 age 条件
LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
wrapper.eq(StringUtils.hasText(name), User::getName, name)
       .between(ageStart != null && ageEnd != null, User::getAge, ageStart, ageEnd)
       .orderByDesc(User::getCreateTime);
// 为什么第一个参数是 boolean：为 false 时这段条件直接跳过，避免 null 条件污染 SQL
```

#### 3.5 复杂嵌套条件

需求：查询「（姓张 且 年龄 > 18）或（邮箱不为空 且 年龄 < 60）」的用户。

```java
LambdaQueryWrapper<User> wrapper = new LambdaQueryWrapper<>();
wrapper.and(w -> w.like(User::getName, "张").gt(User::getAge, 18))
       .or(w -> w.isNotNull(User::getEmail).lt(User::getAge, 60));
```

生成的 SQL：

```sql
WHERE ( name LIKE '张%' AND age > 18 )
   OR ( email IS NOT NULL AND age < 60 )
```

#### 3.6 UpdateWrapper / LambdaUpdateWrapper

更新场景下，用 `UpdateWrapper` 可以直接拼 `set` 片段，不需要先查实体：

```java
// 需求：把年龄大于 30 的用户邮箱清空（直接按条件更新，不用先 select）
LambdaUpdateWrapper<User> uw = new LambdaUpdateWrapper<>();
uw.set(User::getEmail, null)          // set email = null
  .gt(User::getAge, 30);              // where age > 30
userMapper.update(null, uw);
```

#### 3.7 小结

- 查询用 `LambdaQueryWrapper`，更新用 `LambdaUpdateWrapper`，字段一律用方法引用。
- 所有条件方法都支持 `condition` 参数实现「动态拼接」。
- 复杂逻辑用 `and / or / nested` 组合出带括号的嵌套条件。
- `apply / last` 是最后的逃生门，能不用就不用，避免 SQL 注入。

---

### 4. 分页插件

分页是列表页最高频的操作。MP 的分页不是内置默认开启的，**必须手动注册 `PaginationInnerInterceptor` 插件**。

#### 4.1 注册分页插件

```java
@Configuration
public class MybatisPlusConfig {

    @Bean
    // 为什么必须手动注册分页插件：MyBatis-Plus 3.x 后分页是独立插件，
    // 不注册的话 Page 参数会被当成普通参数忽略，不会真的分页（查回全表）
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();

        PaginationInnerInterceptor pagination = new PaginationInnerInterceptor(DbType.MYSQL);
        pagination.setMaxLimit(500L);        // 单页最大 500 条，防止恶意传超大 pageSize 拖垮数据库
        pagination.setOverflow(false);       // 超过最大页时是否回到首页（false 表示不处理）
        interceptor.addInnerInterceptor(pagination);

        return interceptor;
    }
}
```

#### 4.2 使用

```java
// 分页查询：第 1 页，每页 10 条，按年龄降序
Page<User> page = new Page<>(1, 10);
Page<User> result = userMapper.selectPage(page,
        new LambdaQueryWrapper<User>().orderByDesc(User::getAge));

result.getRecords();   // 当前页数据 List<User>
result.getTotal();     // 总条数
result.getPages();     // 总页数
result.getCurrent();   // 当前页码
result.getSize();      // 每页大小
```

#### 4.3 分页参数对象常用字段

| 字段/方法 | 说明 |
| --- | --- |
| `current` | 当前页（从 1 开始） |
| `size` | 每页条数 |
| `total` | 总条数（查 count 得到） |
| `pages` | 总页数（自动计算） |
| `records` | 当前页数据 |
| `optimizeCountSql` | 是否优化 count SQL（默认 true，去掉 order by 提速） |

#### 4.4 多表分页

分页也能和自定义 SQL 结合：只要 Mapper 方法第一个参数是 `Page`，返回值是 `IPage`，MP 就会自动帮你做 count + limit 改写：

```java
public interface UserMapper extends BaseMapper<User> {
    // 自定义多表分页查询，第一个参数是 Page，返回 IPage，MP 自动分页
    IPage<UserVO> selectUserPage(Page<UserVO> page, @Param("deptId") Long deptId);
}
```

```xml
<!-- UserMapper.xml -->
<select id="selectUserPage" resultType="com.example.vo.UserVO">
    SELECT u.*, d.name AS deptName
    FROM user u LEFT JOIN dept d ON u.dept_id = d.id
    WHERE u.dept_id = #{deptId}
</select>
```

> **要点**：自定义分页 SQL 里**不要再自己写 `limit`**，MP 的分页插件会统一在最后追加 `LIMIT ?,?`；你自己写了反而会错位。

---

### 5. 常用注解（成体系）

MP 用注解做「实体类 <-> 数据库表/字段」的映射与行为控制。下面是全部核心注解。

#### 5.1 映射类注解

| 注解 | 作用 | 示例 |
| --- | --- | --- |
| `@TableName("t_user")` | 指定表名 | 类名 `User` 默认映射表 `user`，实际表叫 `t_user` 时用它纠正 |
| `@TableId(value="id", type=IdType.ASSIGN_ID)` | 标记主键 + 指定主键策略 | 主键字段 |
| `@TableField("user_name")` | 指定列名 | 字段 `userName` 默认映射 `user_name`，不一致时纠正 |
| `@TableField(exist = false)` | 声明「不是数据库字段」 | 统计数、临时字段、冗余字段 |
| `@TableField(select = false)` | 查询时不查该列 | 大字段（如富文本正文），列表页不查 |
| `@TableField(condition = SqlCondition.LIKE)` | 自定义该字段默认查询条件 | 拼接条件时默认用 LIKE |
| `@TableField(fill = FieldFill.INSERT)` | 声明自动填充时机 | 见高级篇「自动填充」 |
| `@TableField(typeHandler = XxxTypeHandler.class)` | 指定类型处理器 | 自定义类型与 JDBC 类型互转 |
| `@TableField(updateStrategy = FieldStrategy.IGNORED)` | 更新策略 | 允许把该字段更新为 null |

#### 5.2 行为类注解

| 注解 | 作用 |
| --- | --- |
| `@TableLogic` | 逻辑删除标记 |
| `@Version` | 乐观锁版本号 |
| `@OrderBy(asc = false)` | 该字段默认参与排序 |
| `@KeySequence("seq_name")` | Oracle 等数据库序列主键 |
| `@InterceptorIgnore` | 忽略某些插件（如多租户） |

#### 5.3 完整实体示例

```java
@Data
@TableName("t_user")                       // 表名映射
public class User {

    @TableId(type = IdType.ASSIGN_ID)      // 主键：雪花算法
    private Long id;

    @TableField("user_name")               // 列名映射：user_name
    private String userName;

    @TableField(exist = false)             // 不是数据库字段：只用于展示
    private String deptName;

    @TableField(select = false)            // 默认查询不查：内容很大，列表页用不上
    private String resume;

    @TableLogic
    private Integer deleted;

    @Version
    private Integer version;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}
```

---

### 6. 主键策略（IdType）

主键生成是数据表设计的第一道坎。MP 通过 `@TableId(type = ...)` 提供多种策略。

#### 6.1 策略速查

| IdType | 说明 | 适用场景 |
| --- | --- | --- |
| `ASSIGN_ID` | **默认**，雪花算法生成 Long | 分布式系统、分库分表 |
| `ASSIGN_UUID` | 生成 32 位 UUID（去掉中划线） | 需要字符串主键的场景 |
| `AUTO` | 数据库自增 | 单库、主键从 1 递增 |
| `INPUT` | 手动输入 | 由业务生成主键（如订单号） |
| `NONE` | 无主键策略 | 交给全局配置决定 |

```java
// 全局配置主键策略（不逐个写 @TableId 时生效）
mybatis-plus:
  global-config:
    db-config:
      id-type: assign_id
```

#### 6.2 雪花算法简述

雪花算法（Snowflake）是 Twitter 开源的分布式 ID 生成算法，MP 默认用它。它生成一个 64 位的 `Long`：

```
┌─┬───────────────────────┬──────────────────────┬────────────┐
│1│        41 bit         │      10 bit          │   12 bit   │
│符│      时间戳(毫秒)      │  机器标识(5+5)       │  序列号     │
│号│  (可用约 69 年)        │ datacenter+worker    │ 同毫秒内   │
│位│                       │  可部署 1024 台机器    │ 最多 4096  │
└─┴───────────────────────┴──────────────────────┴────────────┘
  1(符号位，恒为0) + 41 + 10 + 12 = 64 bit
```

特点：

- **趋势递增**：按时间戳排序，整体是递增的，利于索引。
- **全局唯一**：不同机器 + 序列号保证同一毫秒内也不冲突。
- **不依赖数据库**：纯内存生成，性能极高。

::: tip 💡 面试题：MyBatis-Plus 默认主键为什么用雪花算法？
因为雪花算法生成的是**分布式环境全局唯一、趋势递增**的 Long 型 ID，不需要数据库自增、不依赖单库，天然适配分库分表；而数据库自增 ID 在多库多表下会冲突，UUID 虽唯一但无序、不利于索引。雪花算法用「时间戳 + 机器标识 + 序列号」三段位组合，在单机内存里就能生成，性能与唯一性兼顾。
:::

---

### 7. Service 层通用接口（IService / ServiceImpl）

除了 Mapper 层，MP 还提供了 Service 层的通用接口 `IService<T>` 和实现类 `ServiceImpl<M,T>`，把「事务封装 + 批量操作 + 链式查询」再往上推一层。

#### 7.1 基本用法

```java
// ① Service 接口：继承 IService
public interface UserService extends IService<User> {
    // 复杂业务方法自己写
    boolean register(User user);
}

// ② Service 实现：继承 ServiceImpl，泛型是 <Mapper, 实体>
@Service
public class UserServiceImpl extends ServiceImpl<UserMapper, User> implements UserService {

    @Override
    public boolean register(User user) {
        // save 来自 IService，内部就是调用 mapper.insert
        return save(user);
    }
}
```

#### 7.2 IService 常用方法（成体系）

| 分类 | 方法 | 说明 |
| --- | --- | --- |
| 保存 | `save(T)` / `saveBatch(Collection<T>)` | 单条/批量保存（批处理，性能优于循环 insert） |
| 保存或更新 | `saveOrUpdate(T)` / `saveOrUpdateBatch(Collection<T>)` | 有主键就更新，没主键就插入 |
| 删除 | `removeById(id)` / `removeBatchByIds(ids)` | 按主键删 |
| 更新 | `updateById(T)` / `updateBatchById(Collection<T>)` | 按主键更新（空值不更新） |
| 查询 | `getById(id)` | 按主键查一条 |
| 查询 | `listByIds(ids)` / `list()` / `list(Wrapper)` | 列表查询 |
| 查询 | `count()` / `count(Wrapper)` | 统计 |
| 查询 | `page(Page, Wrapper)` | 分页 |
| 查询 | `getOne(Wrapper, boolean throwEx)` | 查一条，可控制在多条时是否抛异常 |
| 链式 | `lambdaQuery()` / `lambdaUpdate()` | 返回链式构造器（见 7.3） |

```java
// saveBatch：批量插入 1 万条，MP 内部会分批 flush，性能远高于循环单条 insert
List<User> users = IntStream.range(0, 10000)
        .mapToObj(i -> new User("用户" + i, 20 + i % 30, "u" + i + "@qq.com"))
        .collect(Collectors.toList());
userService.saveBatch(users);
```

#### 7.3 链式查询 / 更新（LambdaQueryChainWrapper）

`IService` 的 `lambdaQuery()` 返回链式构造器，可以一路点到底：

```java
// 链式查询：条件 + 排序 + 分页 + 直接出结果
List<User> list = userService.lambdaQuery()
        .gt(User::getAge, 18)
        .like(User::getName, "张")
        .orderByDesc(User::getCreateTime)
        .list();                                    // 结尾方法：list() / one() / count() / page()

// 链式更新：直接拼 set，无需先查
boolean ok = userService.lambdaUpdate()
        .set(User::getEmail, null)
        .gt(User::getAge, 60)
        .update();
```

> **Mapper 层 `BaseMapper` 和 Service 层 `IService` 的关系**：`ServiceImpl` 内部组合了 `BaseMapper`，`IService` 的方法最终都转发到 `BaseMapper`。选哪个用？**简单单表操作直接用 Service 层（省事 + 有批量能力），需要精细控制或自定义 SQL 时用 Mapper 层**。

---

## 高级篇

### 1. 逻辑删除

#### 1.1 背景：为什么需要逻辑删除

「删除」在很多业务里不是物理删除数据，而是「标记删除」。比如订单、用户、财务流水，一旦物理删除，就再也查不到历史记录，出了纠纷无法追溯。逻辑删除就是：**删除时只把标记字段改掉，数据还留在表里，查询时自动过滤掉已删除的数据**。

#### 1.2 配置与使用

```yaml
# application.yml 全局配置（推荐）
mybatis-plus:
  global-config:
    db-config:
      logic-delete-field: deleted      # 全局逻辑删除字段名
      logic-delete-value: 1            # 已删除的值
      logic-not-delete-value: 0        # 未删除的值
```

```java
// 实体字段上加 @TableLogic（若已配置全局 logic-delete-field，可省注解）
@TableLogic
private Integer deleted;
```

#### 1.3 效果演示

```java
userMapper.deleteById(1L);
// 底层 SQL 被改写为：UPDATE user SET deleted = 1 WHERE id = 1 AND deleted = 0
// 而不是 DELETE FROM user WHERE id = 1

User u = userMapper.selectById(1L);
// 底层 SQL：SELECT ... FROM user WHERE id = 1 AND deleted = 0
// 已删除的数据查不到了（自动过滤）
```

逻辑删除后所有自动 SQL 的变化：

| 操作 | 物理删除 | 逻辑删除后 |
| --- | --- | --- |
| 删除 | `DELETE FROM user WHERE id=?` | `UPDATE user SET deleted=1 WHERE id=? AND deleted=0` |
| 查询 | `SELECT ... WHERE id=?` | `SELECT ... WHERE id=? AND deleted=0` |
| 更新 | `UPDATE ... WHERE id=?` | `UPDATE ... WHERE id=? AND deleted=0` |

#### 1.4 注意事项

- 逻辑删除字段**不要**加到唯一索引上——已删除数据的逻辑删除值相同，会导致唯一约束冲突。
- 逻辑删除**只是标记**，要真正物理删除需手写 SQL（`DELETE FROM user WHERE id=?`）。
- 分页、`selectList`、`count` 等所有自动 SQL 都会自动拼接 `deleted=0`。

::: tip 💡 面试题：逻辑删除是怎么实现的？
MP 在生成 SQL 前通过「SQL 注入器 + 拦截器」统一改写：`delete` 语句被替换成 `update` 语句，`select/update` 语句自动追加 `deleted=0` 的过滤条件。它本质是**在 SQL 执行前做了一次字符串级改写**，对业务代码完全透明。
:::

---

### 2. 乐观锁

#### 2.1 背景：并发更新覆盖问题

场景：两个人同时打开同一个订单页面，A 改了金额保存，B 改了备注保存。B 保存时会把 A 的金额改动覆盖掉（因为 B 手里是旧数据）。解决并发更新的两种思路：

- **悲观锁**：读取时就 `SELECT ... FOR UPDATE` 加锁，别人改不了（性能差，锁冲突）。
- **乐观锁**：加一个 `version` 版本号字段，更新时校验版本号，版本号变了说明别人改过，本次更新失败（无锁，性能好）。

MP 提供的是乐观锁方案，通过 `@Version` + 插件实现。

#### 2.2 配置与使用

```java
@Configuration
public class MybatisPlusConfig {
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();

        // 乐观锁插件
        interceptor.addInnerInterceptor(new OptimisticLockerInnerInterceptor());
        // 分页插件（可共存）
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}
```

```java
// 实体字段
@Version
private Integer version;    // 数据库默认 0，每次更新自动 +1
```

#### 2.3 完整使用流程

```java
// ① 先查出数据（拿到当前 version = 0）
User user = userMapper.selectById(1L);

// ② 修改字段
user.setAge(20);

// ③ 更新：底层 SQL 自动带 version 校验
// UPDATE user SET age=20, version=version+1 WHERE id=1 AND version=0
int rows = userMapper.updateById(user);

// 为什么判断 rows==0：如果别人已经改过，version 已经变成 1，
// 上面的 WHERE version=0 匹配不到任何行，rows=0，说明发生了并发冲突
if (rows == 0) {
    throw new RuntimeException("数据已被他人修改，请刷新后重试");
}
```

#### 2.4 乐观锁执行时序图

```
线程A                            线程B
  │                                │
  │ selectById -> version=0        │
  │                                │ selectById -> version=0
  │ setAge(20)                     │ setName("B")
  │ update ... where version=0 ✓   │
  │ (version 变成 1)               │
  │                                │ update ... where version=0 ✗（影响 0 行）
  │                                │ -> 发现冲突，提示重试
```

#### 2.5 注意事项

- `version` 字段数据库必须有**默认值**（如 0），否则首次更新 `version=null` 会失败。
- 乐观锁只对 `updateById(entity)` 和 `update(entity, wrapper)` 生效（entity 里带 version 才校验）。
- 用 `UpdateWrapper` 拼 `set` 时，乐观锁不会自动生效，需手动处理。

::: tip 💡 面试题：乐观锁的底层原理？
MP 的乐观锁依赖 `OptimisticLockerInnerInterceptor`：在 `update` 语句执行前，拦截器读取实体里的 `@Version` 字段旧值，把它拼进 `WHERE` 子句，同时在 `SET` 子句里让 `version = version + 1`。这样只有「版本号未变」的那次更新能成功，其余更新影响 0 行，由业务层判断失败重试。核心就是用「版本号 CAS」的乐观并发控制替代数据库行锁。
:::

---

### 3. 自动填充

#### 3.1 背景

`create_time`、`update_time`、`create_by` 这类「审计字段」几乎是每张表的标配。如果每个接口都手动 `setCreateTime(now())`，既啰嗦又容易漏。自动填充就是：**在 insert/update 时，由 MP 统一帮你填上这些字段**。

#### 3.2 实现 MetaObjectHandler

```java
@Component
public class MyMetaObjectHandler implements MetaObjectHandler {

    // 插入时触发
    @Override
    public void insertFill(MetaObject metaObject) {
        // strictInsertFill：字段没有值时才填充（有值不覆盖）
        this.strictInsertFill(metaObject, "createTime", LocalDateTime.class, LocalDateTime.now());
        this.strictInsertFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
        // 也可填当前登录用户
        this.strictInsertFill(metaObject, "createBy", String.class, getCurrentUser());
    }

    // 更新时触发
    @Override
    public void updateFill(MetaObject metaObject) {
        this.strictUpdateFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
    }
}
```

#### 3.3 实体字段声明填充时机

```java
@TableField(fill = FieldFill.INSERT)           // 仅在 insert 时填充
private LocalDateTime createTime;

@TableField(fill = FieldFill.INSERT_UPDATE)    // insert 和 update 都填充
private LocalDateTime updateTime;
```

`FieldFill` 枚举：

| 枚举值 | 填充时机 |
| --- | --- |
| `DEFAULT` | 不填充 |
| `INSERT` | 插入时 |
| `UPDATE` | 更新时 |
| `INSERT_UPDATE` | 插入和更新时 |

#### 3.4 strictFill 的几种变体

| 方法 | 说明 |
| --- | --- |
| `strictInsertFill(metaObject, fieldName, type, val)` | 严格填充：目标字段为空才填 |
| `strictUpdateFill(metaObject, fieldName, type, val)` | 严格填充：目标字段为空才填 |
| `fillStrategy(metaObject, fieldName, val)` | 直接填充（按字段策略） |
| `setFieldValByName(fieldName, val, metaObject)` | 无条件设置 |

> **strict 与普通填充的区别**：`strictInsertFill` 只在字段为 `null` 时才填充，如果业务已经手动 set 了值，就不会被覆盖；普通 `fillStrategy` 则可能覆盖。

---

### 4. 代码生成器

当表特别多（几十上百张）时，手写实体/Mapper/Service 也很累。MP 提供代码生成器，连接数据库后一键生成全套 CRUD 代码。

#### 4.1 FastAutoGenerator（3.5.x 新写法）

```java
public class CodeGenerator {
    public static void main(String[] args) {
        // 为什么用 FastAutoGenerator：3.5 之后的新 API，链式配置，替代老版 AutoGenerator
        FastAutoGenerator.create(
                "jdbc:mysql://localhost:3306/mp_demo?useSSL=false&serverTimezone=Asia/Shanghai",
                "root",
                "123456")
            // 全局配置
            .globalConfig(builder -> builder
                    .author("你的名字")           // 生成代码的 @author 注释
                    .outputDir("D:/generated")   // 输出目录
                    .disableOpenDir())           // 生成后不自动打开目录
            // 包配置
            .packageConfig(builder -> builder
                    .parent("com.example")        // 父包名
                    .moduleName("user")           // 模块名
                    .mapper("mapper")
                    .service("service")
                    .entity("entity"))
            // 策略配置
            .strategyConfig(builder -> builder
                    .addInclude("user", "dept")   // 要生成的表（不写则生成全部表）
                    .entityBuilder()
                    .enableLombok()               // 实体用 Lombok
                    .enableTableFieldAnnotation() // 字段生成 @TableField 注解
                    .logicDeleteColumnName("deleted")  // 逻辑删除字段
                    .versionColumnName("version")      // 乐观锁字段
                    .controllerBuilder()
                    .enableRestStyle())           // Controller 生成 REST 风格
            .execute();   // 执行生成
    }
}
```

> 代码生成器一般作为**开发脚手架工具**使用，生成后再手动调整业务代码，不建议在生产环境反复生成覆盖。

---

### 5. 多租户 / 数据权限隔离

SaaS 系统里，多个租户（企业）共用同一套表和数据库，需要保证「A 租户只能看到 A 的数据」。MP 用 `TenantLineInnerInterceptor` 实现「行级租户隔离」，即**在所有 SQL 上自动追加 `tenant_id = ?` 条件**。

```java
@Bean
public MybatisPlusInterceptor mybatisPlusInterceptor() {
    MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();

    // 多租户插件
    interceptor.addInnerInterceptor(new TenantLineInnerInterceptor(new TenantLineHandler() {
        // 获取当前租户 ID（通常从登录上下文/ThreadLocal 取）
        @Override
        public Expression getTenantId() {
            return new LongValue(LoginUserHolder.getTenantId());
        }
        // 哪些表需要租户隔离（返回 true 则追加 tenant_id 条件）
        @Override
        public boolean ignoreTable(String tableName) {
            return "sys_config".equals(tableName);  // 公共配置表不隔离
        }
    }));
    return interceptor;
}
```

效果：查询 `SELECT * FROM order WHERE ...` 会被自动改写为 `SELECT * FROM order WHERE ... AND tenant_id = 1001`，业务代码无需关心租户过滤。

::: tip 💡 面试题：多租户是怎么隔离数据的？
MP 的多租户插件在 SQL 执行前解析 AST 语法树，找到需要隔离的表，在 `WHERE` 后追加 `tenant_id = 当前租户` 条件。这是「共享数据库、共享表」的隔离方案，成本最低，但要求每张业务表都有 `tenant_id` 字段，且所有查询都要走 MP 的拦截器（原生手写 SQL 若绕过 MP 则不会被隔离）。
:::

---

### 6. 自定义 TypeHandler（类型处理器）

#### 6.1 背景

数据库里存的 JSON 字符串，想映射成 Java 的 `List` / 对象；或者 Java 的枚举想存成 `int` 或 `String`。默认映射搞不定时，就需要自定义 `TypeHandler` 在「Java 类型 <-> JDBC 类型」之间做转换。

#### 6.2 示例：List<String> 与 JSON 互转

```java
@MappedTypes(List.class)
@MappedJdbcTypes(JdbcType.VARCHAR)
public class ListStringTypeHandler extends BaseTypeHandler<List<String>> {

    // 写入数据库：Java List -> JSON 字符串
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, List<String> parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setString(i, JSON.toJSONString(parameter));   // ["a","b","c"]
    }

    // 从结果集读取：JSON 字符串 -> Java List
    @Override
    public List<String> getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return parse(rs.getString(columnName));
    }

    @Override
    public List<String> getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return parse(rs.getString(columnIndex));
    }

    @Override
    public List<String> getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return parse(cs.getString(columnIndex));
    }

    private List<String> parse(String json) {
        return json == null ? null : JSON.parseArray(json, String.class);
    }
}
```

```java
// 实体字段上声明使用该 TypeHandler
@TableField(typeHandler = ListStringTypeHandler.class)
private List<String> tags;   // 数据库存 JSON 字符串，Java 里是 List
```

---

### 7. 自定义 SQL 与多表查询

MP 的 `BaseMapper` 只解决单表，**多表 join、复杂统计必须自己写 SQL**，这是 MP 官方明确的边界。自定义方式有两种：注解和 XML。

#### 7.1 注解方式（简单 SQL）

```java
public interface UserMapper extends BaseMapper<User> {

    // 简单多表/自定义查询，用 @Select 注解即可
    @Select("SELECT u.*, d.name AS dept_name FROM user u LEFT JOIN dept d ON u.dept_id = d.id WHERE u.id = #{id}")
    UserVO selectUserWithDept(@Param("id") Long id);
}
```

#### 7.2 XML 方式（复杂 SQL，推荐）

```yaml
mybatis-plus:
  mapper-locations: classpath*:/mapper/**/*.xml   # 指定 XML 位置
```

```xml
<!-- resources/mapper/UserMapper.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.example.mapper.UserMapper">

    <!-- 复杂多表 + 动态条件查询 -->
    <select id="selectUserPage" resultType="com.example.vo.UserVO">
        SELECT u.id, u.name, u.age, d.name AS dept_name
        FROM user u
        LEFT JOIN dept d ON u.dept_id = d.id
        <where>
            <if test="deptId != null">
                AND u.dept_id = #{deptId}
            </if>
            <if test="name != null and name != ''">
                AND u.name LIKE CONCAT('%', #{name}, '%')
            </if>
        </where>
        ORDER BY u.create_time DESC
    </select>
</mapper>
```

> **自定义方法命名规则**：Mapper 接口里的自定义方法名要和 XML 里的 `id` 完全一致，参数用 `@Param` 命名后才能在 XML 里引用。这是原生 MyBatis 的规则，MP 完全继承。

---

### 8. ActiveRecord 模式（可选）

MP 支持实体类直接继承 `Model<T>`，这样实体对象自带 CRUD 方法，无需注入 Mapper：

```java
@Data
@TableName("user")
public class User extends Model<User> {
    @TableId(type = IdType.ASSIGN_ID)
    private Long id;
    private String name;
    private Integer age;
}
```

```java
// 实体对象直接调用 CRUD，无需 userMapper
User user = new User();
user.setName("张三");
user.setAge(20);
user.insert();                       // 保存自己

User u = new User().selectById(1L);  // 按主键查
u.setAge(30);
u.updateById();                      // 更新自己
```

> **使用建议**：ActiveRecord 模式代码更简洁，但会让实体类「既承载数据又承载持久化逻辑」，与「贫血模型 + Service 层」的主流分层有冲突，**适合快速原型、小工具**，正式工程更推荐 Service + Mapper 分层。

---

### 9. Db 静态工具类（3.5.x 新增）

3.5.x 之后 MP 提供了 `Db` 静态工具类，**无需注入 Mapper/Service，直接传实体 Class 就能操作**，适合工具类、静态方法、非 Spring 容器环境下的快速 CRUD。

```java
import com.baomidou.mybatisplus.extension.toolkit.Db;

// 查询
User u = Db.getById(1L, User.class);
List<User> list = Db.lambdaQuery(User.class).gt(User::getAge, 18).list();

// 新增 / 更新 / 删除
Db.save(user);
Db.updateById(user);
Db.removeById(1L, User.class);

// 链式更新
Db.lambdaUpdate(User.class).set(User::getEmail, null).gt(User::getAge, 60).update();
```

> **注意**：`Db` 工具类内部依赖 `SqlSession`，需要在 Spring 容器初始化完成后使用；它本质上还是走 MP 的通用 Mapper 逻辑，只是省去了手动注入。

---

### 10. 批量操作与性能优化

#### 10.1 批量插入的正确姿势

```java
// ❌ 错误：循环单条 insert，1 万条要开 1 万个连接/事务
for (User u : list) { userMapper.insert(u); }

// ✅ 正确：saveBatch 内部用一条 SQL 批量提交（JDBC batch）
userService.saveBatch(list);   // 内部自动分批，每 1000 条 flush 一次
```

`saveBatch` 原理：底层用 JDBC 的 `PreparedStatement.addBatch()` + `executeBatch()`，一次性把多条 SQL 打包发给数据库，避免反复网络往返。

#### 10.2 常用性能优化项

| 优化项 | 做法 | 收益 |
| --- | --- | --- |
| 批量操作 | 用 `saveBatch / updateBatchById / removeBatchByIds` | 减少数据库往返 |
| 只查需要的列 | `wrapper.select("id","name")` | 减少数据传输 |
| 分页 count 优化 | `optimizeCountSql = true`（默认） | count 时去掉 order by 提速 |
| 避免全表更新/删除 | 加 `BlockAttackInnerInterceptor` 防呆 | 防止误操作全表 |
| 关闭 SQL 日志 | 生产环境去掉 `StdOutImpl` | 减少 IO 开销 |

#### 10.3 防全表更新/删除插件

```java
// 防止 update/delete 忘记带 where 条件导致全表更新/删除的「防呆」插件
interceptor.addInnerInterceptor(new BlockAttackInnerInterceptor());
```

加上后，`UPDATE user SET age=20`（无 where）这种 SQL 会直接抛异常，保护生产数据。

---

### 11. 全局配置项汇总

`application.yml` 中 MP 的常用配置成体系梳理：

```yaml
mybatis-plus:
  mapper-locations: classpath*:/mapper/**/*.xml        # XML 位置
  type-aliases-package: com.example.entity             # 实体包（XML 里可直接写类名）
  configuration:
    map-underscore-to-camel-case: true                 # 驼峰映射
    log-impl: org.apache.ibatis.logging.slf4j.Slf4jImpl # 日志实现
    call-setters-on-nulls: false                       # null 值是否调用 setter
  global-config:
    banner: false                                      # 关闭横幅
    db-config:
      id-type: assign_id                               # 全局主键策略
      table-prefix: t_                                 # 表前缀（实体 User -> 表 t_user）
      logic-delete-field: deleted                      # 逻辑删除字段
      logic-delete-value: 1
      logic-not-delete-value: 0
      update-strategy: not_null                        # 更新策略（默认非 null 才更新）
```

| 关键配置 | 作用 |
| --- | --- |
| `table-prefix: t_` | 全局表前缀，实体 `User` 自动映射 `t_user`，省去每个类写 `@TableName` |
| `update-strategy: not_null` | 默认「非 null 才更新」，即 `updateById` 空值不更新 |
| `map-underscore-to-camel-case` | 数据库 `user_name` 自动映射实体 `userName` |

---

## 原理篇

这一节深入 MP 的底层机制，理解「通用 CRUD 为什么能零 SQL」「条件构造器怎么变成 WHERE」「分页/逻辑删除/乐观锁插件如何改写 SQL」。这些是面试问原理时的高频区。

### 1. 整体架构：MP 与 MyBatis 的关系

MP 并没有替换 MyBatis，而是「站在 MyBatis 肩膀上」做了一层封装。看下面这张分层图：

```
┌─────────────────────────────────────────────────────────┐
│                    业务代码层                            │
│   UserService (IService) / UserMapper (BaseMapper)      │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                 MyBatis-Plus 增强层                      │
│  BaseMapper 通用方法 / Wrapper 条件构造 / 插件拦截器      │
│  (Pagination / OptimisticLocker / TenantLine / Logic)    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                 MyBatis 原生层                           │
│  SqlSessionFactory / MapperProxy / Executor / 插件       │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                 JDBC / 数据库                            │
└─────────────────────────────────────────────────────────┘
```

关键结论：

- `BaseMapper` 的通用方法，底层是 MP 通过 **MyBatis 的 `MapperRegistry`** 动态注册的 `MappedStatement`（每个方法对应一条预生成的 SQL）。
- MP 的「插件」本质是 MyBatis 的 **`Interceptor`（拦截器）**，在 SQL 执行前对 `BoundSql` / 参数做改写。
- 你随时可以在 Mapper 里写原生 MyBatis SQL，二者共存、互不干扰。

---

### 2. BaseMapper 通用方法为什么不用写 SQL（源码级）

这是 MP 最核心的问题：`UserMapper` 接口里明明什么都没写，为什么 `insert / selectById` 能直接调用？

答案藏在三个组件里：

1. **`AbstractMethod`**：每个通用方法对应一个子类，如 `Insert`、`SelectById`、`DeleteById`。它负责「生成一条 SQL 模板」并封装成 `MappedStatement`。
2. **`DefaultSqlInjector`**：SQL 注入器，启动时把 BaseMapper 里所有方法对应的 `AbstractMethod` 收集起来，逐个调用其 `injectMappedStatement()`。
3. **`MybatisConfiguration` / `MybatisMapperRegistry`**：MP 继承并替换了 MyBatis 的配置类，在解析 Mapper 时额外注册这些通用方法。

流程图：

```
应用启动
   │
   ▼
MybatisSqlSessionFactoryBean 构建 SqlSessionFactory
   │
   ▼
MybatisConfiguration.addMapper(UserMapper.class)
   │
   ▼
MybatisMapperRegistry.addMapper 解析 BaseMapper
   │
   ▼
SqlInjector.inspectInject(configuration, UserMapper.class)
   │
   ▼
遍历 BaseMapper 的所有方法（insert/selectById/deleteById/...）
   │
   ▼
每个 AbstractMethod.injectMappedStatement()
   │  （如 SelectById：生成 "SELECT ... FROM user WHERE id=?"）
   │  （表名从 @TableName 拿，列从实体字段映射拿）
   ▼
把生成的 MappedStatement 放进 Configuration.mappedStatements
   │
   ▼
调用 userMapper.selectById(1L) 时，走 MapperProxy 找到对应 MappedStatement 执行
```

核心源码 `SelectById.injectMappedStatement`（简化）：

```java
public class SelectById extends AbstractMethod {
    @Override
    public MappedStatement injectMappedStatement(Class<?> mapperClass, Class<?> modelClass, TableInfo tableInfo) {
        // 拼 SQL：SELECT id,name,age,... FROM user WHERE id=?
        String sql = "SELECT %s FROM %s WHERE %s=#{%s}";
        String selectSql = String.format(sql,
                sqlSelectColumns(tableInfo, false),   // 所有列
                tableInfo.getTableName(),             // 表名
                tableInfo.getKeyColumn(),             // 主键列
                tableInfo.getKeyProperty());          // 主键属性
        // ... 把这条 SQL 注册成 MappedStatement
    }
}
```

> **一句话总结**：MP 在**启动时**根据实体类的 `@TableName`、`@TableId`、字段映射信息，**用代码模板拼出每张表的通用 SQL**，再动态注册进 MyBatis 的配置里。所以运行时调用 `selectById` 时，MyBatis 已经「有这条 SQL 可执行」了——这就是「零 SQL」的秘密。

---

### 3. 条件构造器原理：Wrapper 如何变成 WHERE

`LambdaQueryWrapper` 的 `.eq(User::getName, "张三")` 到底发生了什么？

#### 3.1 内部数据结构

所有条件方法最终都会把「条件片段」追加到一个内部容器里：

```
AbstractWrapper
   ├── expression : 保存 条件片段 的 MergeSegments（有序列表）
   │       ├── [EQ] name = ?
   │       ├── [AND] age > ?
   │       ├── [AND] email LIKE ?
   │       └── [ORDER_BY] create_time DESC
   ├── paramNameSeq : 参数占位符计数器（MPGENVAL1, MPGENVAL2 ...）
   └── paramNameValuePairs : 占位符 -> 实际值的映射
```

#### 3.2 Lambda 字段如何解析成列名

这是 `LambdaQueryWrapper` 的核心魔法。它用了 Java 的 **`SerializedLambda`** 机制：

1. `User::getName` 是一个可序列化的 Lambda 表达式（`SFunction<User, String>`）。
2. 通过 `LambdaUtils.extract()` 把它序列化成 `SerializedLambda`，从而拿到**方法名字符串** `getName`。
3. 去掉 `get` 前缀得到属性名 `name`，再转成数据库列名 `name`（或驼峰转下划线 `user_name`）。

```
User::getName
   │  可序列化 Lambda（SFunction）
   ▼
SerializedLambda { implMethodName = "getName" }
   │  截掉 get 前缀
   ▼
属性名 "name"
   │  驼峰转下划线（map-underscore-to-camel-case）
   ▼
列名 "name"
   │
   ▼
拼进 SQL：name = #{MPGENVAL1}
```

> **为什么 Lambda 版本编译期安全**：列名是从「方法引用」上反射解析出来的，字段一旦改名，`User::getName` 就会编译报错，天然杜绝了字符串写错的问题。

#### 3.3 最终 SQL 生成

执行 `selectList` 时，`Wrapper` 会把 `expression` 里的条件片段拼接成一个 `SqlSegment` 字符串，作为 `WHERE` 子句的一部分，交给 MyBatis 执行。参数用 `MPGENVALx` 占位符绑定（PreparedStatement 预编译，防注入）。

---

### 4. 插件拦截器原理：MybatisPlusInterceptor 责任链

MP 3.x 把所有能力（分页、乐观锁、多租户、逻辑删除）统一收敛到一个拦截器：`MybatisPlusInterceptor`。

#### 4.1 与旧版 MybatisPlusInterceptor 的区别

- **旧版**：每种能力一个独立拦截器（`PaginationInterceptor`、`OptimisticLockerInterceptor`…），需分别注册。
- **新版（3.4+）**：一个 `MybatisPlusInterceptor`，内部维护一个 `List<InnerInterceptor>`，按注册顺序组成**责任链**。

```java
public class MybatisPlusInterceptor implements Interceptor {
    private List<InnerInterceptor> interceptors = new ArrayList<>();

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        // 遍历内部拦截器，逐个处理（beforeQuery -> willDoQuery -> beforeQuery 链）
        for (InnerInterceptor interceptor : interceptors) {
            interceptor.beforeQuery(...);
        }
        Object result = invocation.proceed();   // 执行真正的 SQL
        return result;
    }
}
```

#### 4.2 责任链执行流程

```
用户调用 userMapper.selectPage(page, wrapper)
   │
   ▼
MybatisPlusInterceptor.intercept()
   │
   ├──> PaginationInnerInterceptor.willDoQuery()
   │       └─ 改写 SQL：追加 LIMIT ?,?，并额外发起一条 count 查询
   │
   ├──> OptimisticLockerInnerInterceptor（若有）
   │       └─ update 时拼 version 条件
   │
   ├──> TenantLineInnerInterceptor（若有）
   │       └─ 追加 tenant_id = ? 条件
   │
   ▼
MyBatis Executor 执行改写后的 SQL
```

> **注意顺序**：`addInnerInterceptor` 的顺序即执行顺序。分页插件通常放最前（先分页再套其他条件），乐观锁/多租户放后面。

---

### 5. 分页原理：PaginationInnerInterceptor 完整流程

分页插件是最值得研究的拦截器，因为它做了两件事：**改写主查询 + 额外发起 count 查询**。

#### 5.1 完整机制流程

```
① 拦截到 selectPage 方法调用
   │
   ▼
② 判断是否分页（方法第一个参数是否为 IPage）
   │
   ├─ 否 → 直接放行（不分页）
   │
   ▼
③ 发起 COUNT 查询（查总条数）
   │   原 SQL：SELECT u.* FROM user u WHERE age > 18 ORDER BY create_time DESC
   │   count SQL：SELECT COUNT(*) FROM user u WHERE age > 18
   │   （optimizeCountSql=true 时会去掉 ORDER BY，提升 count 性能）
   │
   ▼
④ 把总条数写回 Page.total，计算总页数
   │
   ▼
⑤ 改写主查询，追加 LIMIT
   │   原 SQL：SELECT ... WHERE age > 18 ORDER BY create_time DESC
   │   分页 SQL（MySQL）：SELECT ... WHERE age > 18 ORDER BY create_time DESC LIMIT 0,10
   │
   ▼
⑥ 执行分页 SQL，结果写回 Page.records，返回
```

#### 5.2 不同数据库的分页方言

分页插件根据 `DbType` 生成不同数据库的分页语法：

| 数据库 | LIMIT 语法 |
| --- | --- |
| MySQL / MariaDB | `LIMIT offset,size` |
| PostgreSQL | `LIMIT size OFFSET offset` |
| Oracle | `OFFSET ... ROWS FETCH NEXT ... ROWS ONLY`（或 ROWNUM 子查询） |
| SQL Server | `OFFSET ... FETCH NEXT ...` |
| 达梦 / 人大金仓 | 各自的方言实现 |

这就是 `new PaginationInnerInterceptor(DbType.MYSQL)` 里要指定 `DbType` 的原因——不同数据库拼的 LIMIT 语句不同。

#### 5.3 count 优化

`optimizeCountSql`（默认 true）会做两件优化：

1. **去掉 ORDER BY**：count 时排序无意义，去掉能显著提速。
2. **去掉不需要的 join/列**：只保留必要的表。

::: tip 💡 面试题：分页插件是怎么工作的？
分页插件 `PaginationInnerInterceptor` 拦截到分页方法后，**先对原 SQL 做一次 count 改写查总条数**（并去掉 order by 提速），把总数写入 `Page.total`；**再对原 SQL 追加 LIMIT 方言**查当前页数据写入 `Page.records`。本质是「一条 SQL 拆成 count + limit 两条」，加上对不同数据库的方言适配。这就是为什么分页方法第一个参数必须是 `IPage`，插件才认得出来。
:::

---

### 6. 雪花算法源码级原理

MP 的雪花算法实现类是 `com.baomidou.mybatisplus.core.toolkit.Sequence`。核心是**用一个 64 位 long，在内存里用位运算「切」出四段信息**。

#### 6.1 位布局（字节级）

```
  63                    22              12                0
  ┌──┬───────────────────┬──────────────┬─────────────────┐
  │符│   时间戳 (41bit)    │ 机器ID(10bit) │  序列号 (12bit)  │
  │号│                    │              │                 │
  └──┴───────────────────┴──────────────┴─────────────────┘
  bit63: 符号位，恒为 0（保证结果是正数）
  bit62~22: 时间戳差值（当前时间 - 固定起始时间），约 69 年容量
  bit21~12: 机器标识 = datacenterId(5bit) + workerId(5bit)，最多 1024 台机器
  bit11~0: 序列号，同一毫秒内递增，最多 4096 个/毫秒
```

#### 6.2 生成算法流程

```
生成 ID 时：
① 取当前毫秒时间戳 timestamp
   ├─ 若 timestamp < 上次时间戳 → 时钟回拨，抛异常
   ├─ 若 timestamp == 上次时间戳 → 序列号 +1
   │       └─ 序列号超过 4095 → 自旋等待下一毫秒
   └─ 若 timestamp > 上次时间戳 → 序列号归 0

② 拼装 64 位：
   id = (timestamp << 22)          // 时间戳左移 22 位
      | (datacenterId << 17)       // 数据中心左移 17 位
      | (workerId << 12)           // 工作机左移 12 位
      | sequence                   // 序列号占低 12 位
```

#### 6.3 优点与隐患

| 维度 | 结论 |
| --- | --- |
| 唯一性 | 时间戳 + 机器 + 序列号，全局唯一 |
| 有序性 | 时间戳在高位，整体趋势递增，利于 B+ 树索引 |
| 性能 | 纯内存位运算，单机每秒可生成数十万 ID |
| 隐患 | **时钟回拨**会导致 ID 重复；MP 默认策略遇到回拨会自旋等待或抛异常 |

> 关联阅读：雪花算法生成的 ID 作为主键，插入 [B+ 树索引](../Java核心/Java集合) 时是顺序追加，减少页分裂，比 UUID 随机插入性能好得多。

---

### 7. 逻辑删除原理：SQL 改写机制

逻辑删除不像分页那样是独立插件，它是在 **SQL 生成阶段**就完成了改写。机制分两层：

1. **删除改写**：`DeleteById` 等 `AbstractMethod` 发现实体带 `@TableLogic` 字段时，生成的 SQL 模板直接就是 `UPDATE ... SET deleted=1 WHERE ...`（不是 DELETE）。
2. **查询/更新追加**：`SelectById`、`SelectList`、`UpdateById` 等生成的 SQL 模板里，自动在 WHERE 后追加 `AND deleted=0`。

```
实体带 @TableLogic deleted 字段
   │
   ▼
启动时构建 TableInfo，识别出逻辑删除字段
   │
   ├──> 删除类方法（DeleteById）
   │       └─ SQL 模板 = UPDATE user SET deleted=1 WHERE id=? AND deleted=0
   │
   └──> 查询/更新类方法
           └─ SQL 模板 = SELECT ... WHERE ... AND deleted=0
```

> 所以逻辑删除**不需要单独注册插件**，它是在「生成 SQL 模板」这个更早的环节就做了处理，比拦截器更彻底。

---

### 8. 乐观锁原理：版本号 CAS

乐观锁靠 `OptimisticLockerInnerInterceptor` 拦截器实现，只在 `update` 时生效：

```
① 拦截 updateById / update 方法
   │
   ▼
② 从入参实体里取出 @Version 字段的旧值（versionOld）
   │
   ▼
③ 改写 SQL：
   ├─ SET 子句追加 version = version + 1
   └─ WHERE 子句追加 version = versionOld
   │
   ▼
④ 执行 SQL：
   UPDATE user SET age=20, version=version+1
   WHERE id=1 AND version=0
   │
   ▼
⑤ 影响行数 rows
   ├─ rows = 1 → 更新成功（版本号没人动过）
   └─ rows = 0 → 并发冲突（别人已改过，version 对不上）
```

关键点：**必须是「先 select 拿到旧 version，再 update」的用法**。如果直接用 `UpdateWrapper` 拼 `set`，拦截器拿不到实体里的 version 旧值，乐观锁就不生效。

---

### 9. 自动填充原理

自动填充依赖 `MetaObjectHandler` + `@TableField(fill=...)`：

```
① 插入/更新时，MP 通过反射拿到实体对应的 MetaObject（元对象）
   │
   ▼
② 遍历实体的每个字段
   │
   ▼
③ 检查字段的 @TableField(fill=...) 值
   │
   ├─ INSERT → 调用 MetaObjectHandler.insertFill()
   ├─ UPDATE → 调用 MetaObjectHandler.updateFill()
   └─ INSERT_UPDATE → 两者都调
   │
   ▼
④ insertFill/updateFill 里用 strictInsertFill 等 API 给字段赋值
   │
   ▼
⑤ 值写入实体，随 SQL 一起入库
```

`MetaObject` 是 MyBatis 的反射工具，能动态读写对象属性；MP 复用它来做「运行时字段赋值」。

---

### 10. 核心对象模型总结

MP 底层的几个关键对象，面试时能说出它们的关系会加分：

| 对象 | 作用 | 类比 |
| --- | --- | --- |
| `TableInfo` | 一张表/实体的元信息（表名、主键、字段列表、逻辑删除字段） | 表的「说明书」 |
| `TableFieldInfo` | 单个字段的元信息（列名、属性名、是否主键、填充时机） | 列的「说明书」 |
| `AbstractMethod` | 通用方法的 SQL 模板生成器（Insert/SelectById/...） | 每个 CRUD 的「工厂」 |
| `ISqlInjector` | SQL 注入器，启动时批量注入通用方法 | 通用方法的「装配线」 |
| `InnerInterceptor` | 内部拦截器接口（分页/乐观锁/多租户） | 能力插件的「统一接口」 |
| `MetaObjectHandler` | 自动填充处理器 | 审计字段的「填充器」 |

启动时序串起来就是：**扫描实体 → 构建 TableInfo（含所有字段）→ SqlInjector 依据 TableInfo 生成各 CRUD 的 MappedStatement → 运行时拦截器改写 SQL → 执行**。

---

## 面试常问

1. **MyBatis-Plus 和 MyBatis 的区别？**
   结论：MP 是 MyBatis 的增强，不是替代。它通过 `BaseMapper` 通用 Mapper、`Wrapper` 条件构造器、`IService` 通用 Service，让单表 CRUD 几乎不用写 SQL；同时「只做增强不做侵入」，复杂多表查询依然用原生 MyBatis 的 XML/注解写 SQL，二者共存。

2. **`LambdaQueryWrapper` 和 `QueryWrapper` 有什么区别？**
   结论：前者用方法引用（`User::getName`）传字段，编译期校验、字段改名会编译报错；后者用字符串（`"name"`）传字段，写错了运行时才暴露。推荐一律用 Lambda 版本，更安全。底层原理是 Lambda 通过 `SerializedLambda` 反射解析出方法名再映射列名。

3. **逻辑删除是怎么实现的？**
   结论：实体字段加 `@TableLogic` 后，MP 在生成 SQL 阶段就把 `delete` 改写为 `update deleted=1`，所有 `select/update` 自动追加 `deleted=0` 过滤。它不依赖拦截器，是在 SQL 模板生成环节就完成的改写，对业务透明。

4. **为什么分页插件不起作用 / 需要手动注册？**
   结论：MP 3.x 把分页收敛到 `PaginationInnerInterceptor` 插件里，默认不注册，`Page` 参数会被当普通参数忽略、查回全表。必须手动 `new MybatisPlusInterceptor()` 并 `addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL))` 注册后才真正分页。

5. **乐观锁的底层原理？**
   结论：`@Version` 字段 + `OptimisticLockerInnerInterceptor`，update 时把旧 version 拼进 `WHERE`，同时 `SET version=version+1`。只有版本号没被改的那次更新成功（rows=1），被改过则 rows=0，业务判断失败重试。本质是版本号 CAS，不加数据库锁，性能好。

6. **MP 怎么做多表/复杂查询？**
   结论：`BaseMapper` 只管单表，多表 join、复杂统计要回到 Mapper 接口里自定义方法，用 `@Select` 注解或 XML 写原生 SQL。分页也能和自定义 SQL 结合，方法第一个参数传 `Page`、返回 `IPage` 即可自动分页。

7. **MyBatis-Plus 的「零 SQL」原理是什么？**
   结论：启动时 `ISqlInjector` 依据实体类的 `@TableName/@TableId/字段映射` 元信息（TableInfo），用代码模板批量拼出每张表的通用 CRUD SQL，动态注册成 `MappedStatement` 放进 MyBatis 配置里；运行时调用就像调普通方法一样直接执行已注册的 SQL。这是「增强」而非「侵入」的根基。

8. **雪花算法作为主键有什么优缺点？**
   结论：优点是全局唯一、趋势递增（利于索引）、纯内存生成性能高、不依赖数据库，适合分布式/分库分表；缺点是依赖机器时钟，**时钟回拨**会导致 ID 重复。MP 默认 `ASSIGN_ID` 用它，遇到回拨会自旋等待或抛异常。

---

**相关链接**：[MyBatis](./MyBatis) · [Spring](./Spring) · [Spring Boot](./Spring%20Boot) · [Spring MVC](./Spring%20MVC) · [Maven](./Maven) · [Java 集合](../Java核心/Java集合) · [JVM](../Java核心/JVM) · [并发编程](../Java核心/并发编程)
