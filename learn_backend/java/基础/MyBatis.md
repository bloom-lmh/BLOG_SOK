# MyBatis

> 一句话定位：MyBatis 是一个 **半自动 ORM 持久层框架**，把 SQL 与 Java 方法绑定起来，解决原生 JDBC 里「手写连接、拼接参数、遍历结果集」又臭又长且容易出错的问题，让你把精力专注在 SQL 本身。

---

## 基础篇

### 1. 为什么会有 MyBatis：JDBC 的痛点

任何框架都不是凭空出现的，MyBatis 要解决的就是「用 JDBC 操作数据库太痛苦」这件事。先看一段最朴素的 JDBC 代码，体会一下它的痛点：

```java
// 原生 JDBC 的完整流程：又臭又长，而且到处都是坑
public User findUserById(Long id) {
    Connection conn = null;
    PreparedStatement ps = null;
    ResultSet rs = null;
    User user = null;
    try {
        // 痛点 1：手动加载驱动、手动建连接，连接资源要自己管
        Class.forName("com.mysql.cj.jdbc.Driver");
        conn = DriverManager.getConnection("jdbc:mysql://localhost:3306/test", "root", "root");

        // 痛点 2：SQL 硬编码在 Java 字符串里，改一条 SQL 要重新编译整个类
        String sql = "SELECT id, user_name, age FROM user WHERE id = ?";
        ps = conn.prepareStatement(sql);

        // 痛点 3：参数要手动一个个 set，多一个少一个都对不上位
        ps.setLong(1, id);

        rs = ps.executeQuery();

        // 痛点 4：结果集要手动遍历、手动封装，字段一多代码就爆炸
        if (rs.next()) {
            user = new User();
            user.setId(rs.getLong("id"));
            user.setUserName(rs.getString("user_name")); // 列名还要手写字符串
            user.setAge(rs.getInt("age"));
        }
    } catch (Exception e) {
        e.printStackTrace();
    } finally {
        // 痛点 5：连接、语句、结果集都要手动 close，忘了就内存泄漏
        try { if (rs != null) rs.close(); } catch (Exception e) {}
        try { if (ps != null) ps.close(); } catch (Exception e) {}
        try { if (conn != null) conn.close(); } catch (Exception e) {}
    }
    return user;
}
```

把这几个痛点抽象出来，就是一张表格：

| JDBC 的麻烦 | 具体表现 | MyBatis 的解法 |
| --- | --- | --- |
| 连接管理繁琐 | 每次都要加载驱动、建连接、关连接 | 内置连接池，自动管理连接生命周期 |
| SQL 硬编码 | SQL 写在 Java 字符串里，改动要重新编译 | SQL 抽到 XML / 注解，改 SQL 不用重新编译 |
| 参数绑定易错 | `?` 占位符手动 `setXxx`，错位难排查 | `#{参数}` 自动绑定，安全防注入 |
| 结果集封装枯燥 | 手动遍历 `ResultSet` 封 POJO | 自动把查询结果映射成 POJO |
| 资源释放易漏 | 连接/语句/结果集都要手动 close | 框架统一管理资源释放 |

::: tip 💡 面试题：为什么说 MyBatis 是「半自动」ORM？
**结论**：因为它需要你自己写 SQL（不像 Hibernate 全自动生成），但结果映射、参数绑定是自动的。

**原因**：ORM 的全称是 Object Relational Mapping（对象关系映射），「全自动」ORM（如 Hibernate）连 SQL 都替你生成，你只需操作对象；而 MyBatis 只帮你完成「参数绑定 + 结果映射」这两件体力活，SQL 的编写与优化权始终握在开发者手里。

**展开**：半自动的好处是 SQL 可控、方便 DBA 调优、复杂查询（多表、报表、分页）写起来没有「框架翻译」带来的性能损耗；代价是开发量略大。所以对性能敏感、SQL 复杂的业务，MyBatis 比全自动 ORM 更合适。
:::

### 2. MyBatis 是什么、能做什么

**背景**：MyBatis 的前身是 Apache 的开源项目 iBatis，2010 年迁移到 Google Code 并改名 MyBatis，2013 年迁到 GitHub。它不是一个「数据库连接池」，也不是一个「完整的数据库中间件」，而是一个把「Java 方法 ↔ SQL 语句」对应起来的映射层。

**定义**：MyBatis 是一款优秀的持久层框架，它封装了 JDBC 的几乎所有细节，通过「XML 配置」或「注解」的方式，把 POJO 与数据库表之间建立起映射关系，让开发者通过调用 Mapper 接口的方法即可完成增删改查。

**它不做什么**：MyBatis 不管数据库连接池（交给 Druid / HikariCP）、不管事务框架（交给 Spring）、不管 SQL 优化（那是你的活），它只专注一件事——**执行你写好的 SQL，并把结果映射成对象**。

```text
                    ┌────────────────────────────────────────┐
                    │            MyBatis 的职责边界            │
                    │                                        │
  Java 方法 ───────►│  参数绑定  ──►  执行 SQL  ──►  结果映射   │───────► POJO 对象
  (Mapper 接口)     │                                        │
                    └────────────────────────────────────────┘
                              ▲                    ▲
                              │                    │
                         你写 SQL            你定义映射规则
                     (XML 或注解)          (resultType / resultMap)
```

### 3. 核心对象与整体架构

MyBatis 运行时的核心对象只有少数几个，理解它们是理解整个框架的钥匙：

| 对象 | 作用 | 生命周期 | 类比 |
| --- | --- | --- | --- |
| `SqlSessionFactoryBuilder` | 读取配置、构建 `SqlSessionFactory` | 用完即丢，一次性 | 造工厂的工人 |
| `SqlSessionFactory` | 生产 `SqlSession`，持有全部配置 | 应用启动创建，全局唯一 | 工厂 |
| `SqlSession` | 一次数据库会话，负责执行 SQL | 用一次关一次（Spring 托管） | 一次会话 / 一次连接 |
| `Executor` | 真正的执行器，负责执行 SQL 与缓存 | 随 `SqlSession` 创建 | 车间里的机器 |
| `MappedStatement` | 封装一条 SQL 的所有信息（SQL、参数、结果映射） | 配置解析时创建，全局缓存 | 生产图纸 |
| `Mapper 接口` | 声明 SQL 方法，由动态代理生成实现 | 随项目存在 | 产品说明书 |

```text
                        MyBatis 核心对象依赖关系

   SqlSessionFactoryBuilder
          │  build()
          ▼
   SqlSessionFactory  ────── 持有 ──────►  Configuration（全局配置）
          │ openSession()                        │
          ▼                                      │ 含 MappedStatement Map
      SqlSession                                │
          │ getMapper() / selectOne()           │
          ▼                                      │
       Executor  ◄──────── 持有引用 ──────────────┘
          │
          ├──► StatementHandler   （创建 Statement、设置参数）
          ├──► ParameterHandler   （参数绑定）
          └──► ResultSetHandler   （结果集映射）
```

::: tip 💡 面试题：SqlSessionFactory 和 SqlSession 的关系？
**结论**：`SqlSessionFactory` 是工厂，全局只有一个；`SqlSession` 是它生产的产品，每个业务请求一个。

**原因**：工厂持有解析好的全部配置（`Configuration`），构建成本高、且配置不可变，所以全局唯一；而 `SqlSession` 代表一次数据库会话，绑定一个连接和一个事务边界，用完必须关闭归还连接。

**展开**：在 Spring 集成环境下，`SqlSession` 的生命周期由 `SqlSessionTemplate` / `SqlSessionManager` 托管，业务代码甚至感知不到它的存在，这也是「整合 Spring 后不用自己关 SqlSession」的根本原因。
:::

### 4. 快速入门：一个完整可运行的最小工程

下面给出一套**从零到能跑**的 MyBatis 工程，理解每一行的「为什么」，比背配置更重要。

#### 4.1 引入依赖（pom.xml）

```xml
<dependencies>
    <!-- 为什么引入 mybatis 本身：提供 SqlSessionFactory、动态代理、映射等核心能力 -->
    <dependency>
        <groupId>org.mybatis</groupId>
        <artifactId>mybatis</artifactId>
        <version>3.5.16</version>
    </dependency>
    <!-- 为什么用 mysql-connector-j 而不是 mysql-connector-java：
         新版驱动改了坐标名，两者功能一致，选新不选旧 -->
    <dependency>
        <groupId>com.mysql</groupId>
        <artifactId>mysql-connector-j</artifactId>
        <version>8.4.0</version>
    </dependency>
</dependencies>
```

#### 4.2 实体类 User

```java
package com.example.entity;

// 为什么属性用包装类型 Long 而不是 long：
// 数据库字段可能为 NULL，基本类型 long 无法表示 null，映射会抛异常
public class User {
    private Long id;
    private String userName;   // 对应数据库列 user_name（驼峰映射后自动对应）
    private Integer age;
    private String email;

    // 为什么要有无参构造：MyBatis 反射实例化对象时默认走无参构造，缺少会导致实例化失败
    public User() {}

    // getter / setter 省略……（实际项目中用 Lombok 的 @Data 替代）
}
```

#### 4.3 全局配置文件 mybatis-config.xml

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE configuration
        PUBLIC "-//mybatis.org//DTD Config 3.0//EN"
        "https://mybatis.org/dtd/mybatis-3-config.dtd">
<configuration>
    <!-- 为什么开驼峰映射：数据库习惯 user_name，Java 习惯 userName，开了以后自动对应，
         省去每个字段都写 resultMap 的麻烦 -->
    <settings>
        <setting name="mapUnderscoreToCamelCase" value="true"/>
    </settings>

    <!-- 类型别名：为什么配别名——resultType 里就能写 User 而不是全限定名 com.example.entity.User -->
    <typeAliases>
        <package name="com.example.entity"/>
    </typeAliases>

    <!-- 环境配置：为什么叫 environments（复数）——可以配多套环境（开发/测试/生产）切换 -->
    <environments default="development">
        <environment id="development">
            <!-- 为什么用 JDBC 事务管理：独立使用 MyBatis 时没有 Spring，由 JDBC 自己 commit/rollback -->
            <transactionManager type="JDBC"/>
            <!-- 为什么用 POOLED 数据源：内置连接池，避免每次请求都新建连接 -->
            <dataSource type="POOLED">
                <property name="driver" value="com.mysql.cj.jdbc.Driver"/>
                <property name="url" value="jdbc:mysql://localhost:3306/test?useUnicode=true&amp;characterEncoding=utf8"/>
                <property name="username" value="root"/>
                <property name="password" value="root"/>
            </dataSource>
        </environment>
    </environments>

    <!-- 注册映射文件：为什么必须注册——MyBatis 要读这些 XML 才能知道 SQL 在哪 -->
    <mappers>
        <mapper resource="mapper/UserMapper.xml"/>
    </mappers>
</configuration>
```

#### 4.4 Mapper 接口

```java
package com.example.mapper;

public interface UserMapper {
    // 接口只有方法声明，没有实现类——为什么能调用？
    // 因为 MyBatis 会用 JDK 动态代理给它生成一个实现（原理篇详解）
    User getById(Long id);
}
```

#### 4.5 映射文件 UserMapper.xml

```xml
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE mapper
        PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN"
        "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
<!-- namespace 为什么必须等于接口全限定名：它是「接口方法 ↔ 本条 SQL」绑定的唯一标识 -->
<mapper namespace="com.example.mapper.UserMapper">
    <!-- id 为什么必须等于接口方法名：MyBatis 靠 namespace + id 定位到这条 SQL -->
    <!-- resultType 为什么写 User 不写全限定名：因为上面配了 typeAliases 包别名 -->
    <select id="getById" resultType="User">
        SELECT id, user_name, age, email FROM user WHERE id = #{id}
    </select>
</mapper>
```

#### 4.6 测试运行

```java
public class MyBatisTest {
    public static void main(String[] args) {
        // 1. 读取全局配置，构建 SqlSessionFactory
        // 为什么用 try-with-resources 包 reader：InputStream 也要关，避免资源泄漏
        try (Reader reader = Resources.getResourceAsReader("mybatis-config.xml")) {
            SqlSessionFactory factory = new SqlSessionFactoryBuilder().build(reader);

            // 2. 打开一个会话
            // 为什么用 try-with-resources 包 SqlSession：它实现了 AutoCloseable，用完自动关
            try (SqlSession session = factory.openSession()) {
                // 3. 拿到 Mapper 的代理对象，直接调用方法
                UserMapper mapper = session.getMapper(UserMapper.class);
                User user = mapper.getById(1L);
                System.out.println(user);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

### 5. 核心配置详解（mybatis-config.xml 全项）

配置文件里的标签有**固定顺序**，写错顺序会报错。完整顺序如下：

```text
configuration（配置）
├── properties（属性，可被 ${} 引用）
├── settings（全局设置，影响运行行为，最常用）
├── typeAliases（类型别名）
├── typeHandlers（类型处理器）
├── objectFactory（对象工厂）
├── plugins（插件 / 拦截器）
├── environments（环境）
│   ├── environment
│   │   ├── transactionManager（事务管理器）
│   │   └── dataSource（数据源）
├── databaseIdProvider（多数据库厂商标识）
└── mappers（映射器注册）
```

#### 5.1 properties：外部化配置

```xml
<!-- 为什么用 properties：把数据库账号密码从配置文件里抽出来，方便不同环境切换、避免硬编码 -->
<properties resource="jdbc.properties"/>
```

```properties
# jdbc.properties
jdbc.driver=com.mysql.cj.jdbc.Driver
jdbc.url=jdbc:mysql://localhost:3306/test
jdbc.username=root
jdbc.password=root
```

```xml
<!-- 引用：用 ${} 取值，注意 ${} 在这里是配置占位符，不是 SQL 里的字符串拼接 -->
<dataSource type="POOLED">
    <property name="driver" value="${jdbc.driver}"/>
    <property name="url" value="${jdbc.url}"/>
    <property name="username" value="${jdbc.username}"/>
    <property name="password" value="${jdbc.password}"/>
</dataSource>
```

#### 5.2 settings：最常用的全局设置

| 设置项 | 默认值 | 作用 | 是否建议开启 |
| --- | --- | --- | --- |
| `mapUnderscoreToCamelCase` | false | 数据库下划线列名 `user_name` 自动映射到 `userName` | ✅ 强烈建议开 |
| `logImpl` | 未配置 | 指定日志实现（STDOUT_LOGGING / SLF4J 等） | 开发时开 STDOUT_LOGGING |
| `lazyLoadingEnabled` | false | 是否开启延迟加载 | 按需开 |
| `aggressiveLazyLoading` | false | 开启后调用任意方法都触发加载全部懒属性 | ❌ 保持 false |
| `cacheEnabled` | true | 是否开启二级缓存总开关 | 按需 |
| `localCacheScope` | SESSION | 一级缓存作用范围（SESSION / STATEMENT） | 默认即可 |
| `useGeneratedKeys` | false | 是否允许 JDBC 自动生成主键（配合 insert 回填） | ✅ 建议开 |
| `defaultStatementTimeout` | 未设置 | SQL 默认超时秒数 | 按需 |
| `multipleResultSetsEnabled` | true | 允许单条语句返回多个结果集 | 默认 |
| `mapUnderscoreToCamelCase` 同类还有 `callSettersOnNulls` | false | 字段为 null 时是否调用 setter | 默认 |

```xml
<settings>
    <!-- 为什么这几个是最常用的：驼峰映射省事、日志方便排查、自动回填主键是刚需 -->
    <setting name="mapUnderscoreToCamelCase" value="true"/>
    <setting name="logImpl" value="STDOUT_LOGGING"/>
    <setting name="useGeneratedKeys" value="true"/>
</settings>
```

#### 5.3 typeAliases：类型别名

```xml
<!-- 方式一：整个包扫描，类名（首字母大小写均可）就是别名 -->
<typeAliases>
    <package name="com.example.entity"/>
</typeAliases>

<!-- 方式二：单个类显式命名，为什么用它——给长类名起个短别名，或处理包下多同名类冲突 -->
<typeAliases>
    <typeAlias type="com.example.entity.User" alias="User"/>
</typeAliases>
```

MyBatis 已经内置了一批常见类型的别名（`int`→`Integer`、`string`→`String`、`map`→`Map`、`list`→`List` 等），所以 `resultType="int"` 这种写法能直接成立。

#### 5.4 environments：环境与事务、数据源

```xml
<!-- transactionManager 两种类型 -->
<!-- JDBC：直接使用 JDBC 的提交/回滚，独立使用 MyBatis 时用这个 -->
<!-- MANAGED：不提交不回滚，把事务交给容器（如 Spring）管理，整合 Spring 时用这个 -->
<transactionManager type="JDBC"/>

<!-- dataSource 三种类型 -->
<!-- UNPOOLED：每次请求都新建连接，性能差，仅测试用 -->
<!-- POOLED：内置连接池，复用连接，独立使用时首选 -->
<!-- JNDI：从容器（如 Tomcat）的 JNDI 里取数据源，配合 Web 容器用 -->
<dataSource type="POOLED"/>
```

### 6. Mapper 映射文件详解

映射文件是 MyBatis 的「主战场」。先看四个基础 CRUD 标签：

| 标签 | 作用 | 常用属性 |
| --- | --- | --- |
| `<select>` | 查询 | `id` `resultType` `resultMap` `parameterType` |
| `<insert>` | 插入 | `id` `useGeneratedKeys` `keyProperty` |
| `<update>` | 更新 | `id` `parameterType` |
| `<delete>` | 删除 | `id` `parameterType` |
| `<sql>` | 定义可复用的 SQL 片段 | `id` |
| `<include>` | 引用 SQL 片段 | `refid` |

```xml
<mapper namespace="com.example.mapper.UserMapper">

    <!-- insert 回填主键：useGeneratedKeys 让 JDBC 把自增主键读回来，
         keyProperty 指定回填到哪个属性，省去 insert 后再查一遍主键 -->
    <insert id="insert" useGeneratedKeys="true" keyProperty="id">
        INSERT INTO user(user_name, age, email) VALUES (#{userName}, #{age}, #{email})
    </insert>

    <update id="update">
        UPDATE user SET user_name = #{userName}, age = #{age} WHERE id = #{id}
    </update>

    <delete id="deleteById">
        DELETE FROM user WHERE id = #{id}
    </delete>

    <!-- 为什么 resultType 用基本类型别名 int：单列统计查询直接返回标量，不用包装对象 -->
    <select id="count" resultType="int">
        SELECT COUNT(*) FROM user
    </select>
</mapper>
```

::: tip 💡 面试题：insert 后如何拿到自增主键？
**结论**：`useGeneratedKeys="true"` + `keyProperty="id"`，让 JDBC 回读自增主键并回填到对象属性。

**原因**：MySQL 的自增主键是数据库生成的，Java 侧插入时并不知道；`useGeneratedKeys` 开启后，MyBatis 会调用 `Statement.getGeneratedKeys()` 把数据库返回的主键读回来。

**展开**：对于不支持自增回读的数据库（如 Oracle），要用 `<selectKey>` 在插入前后查询序列值。Spring Boot 项目里也可全局配置 `mybatis.configuration.use-generated-keys=true`。
:::

### 7. `#{}` 和 `${}` —— 面试必考

这是 MyBatis 最容易被问到的一个点，必须从「底层机制」层面吃透：

| 对比项 | `#{id}` | `${name}` |
| --- | --- | --- |
| 底层机制 | 预编译 `?` 占位符（PreparedStatement） | 字符串直接拼接进 SQL |
| 是否防 SQL 注入 | ✅ 安全 | ❌ 有注入风险 |
| 编译时机 | SQL 编译一次，参数后续传入 | 每次拼接都重新编译 SQL |
| 适用场景 | 一切「值」参数（默认用这个） | 表名、列名、`ORDER BY`、动态 SQL 片段 |

```xml
<!-- 为什么参数用 #{}：预编译把参数当「值」处理，恶意输入只会被当作一个普通字符串，
     而不会改变 SQL 结构；例如 id 传 "1 OR 1=1" 只会查 id='1 OR 1=1' 这条不存在的记录 -->
<select id="getById" resultType="User">
    SELECT * FROM user WHERE id = #{id}
</select>

<!-- 为什么排序用 ${}：ORDER BY 后面不能放 ? 占位符（占位符只能替代「值」，
     不能替代表名/列名这种「标识符」），所以只能拼接；必须自行做白名单校验 -->
<select id="listOrderBy" resultType="User">
    SELECT * FROM user ORDER BY ${sortColumn} DESC
</select>
```

```java
// 安全的动态排序：先做白名单校验，拒绝非法列名，再交给 ${} 拼接
private static final Set<String> ALLOWED_COLUMNS = Set.of("id", "user_name", "age", "create_time");

public List<User> listByOrder(String sortColumn) {
    if (sortColumn == null || !ALLOWED_COLUMNS.contains(sortColumn)) {
        throw new IllegalArgumentException("非法排序字段: " + sortColumn);
    }
    return mapper.listOrderBy(sortColumn);
}
```

::: tip 💡 面试题：`#{}` 和 `${}` 的区别？
**结论**：`#{}` 是预编译占位符、能防 SQL 注入；`${}` 是字符串拼接、有注入风险。

**原因**：`#{}` 走的是 `PreparedStatement` 的参数绑定，SQL 结构在编译阶段就固定了，参数值永远只是「值」；`${}` 则是先把参数拼进 SQL 字符串再整体编译，恶意内容会被当成 SQL 的一部分执行。

**展开**：所以传值一律用 `#{}`，只有表名/列名/排序字段这种「占位符替代不了标识符」的场景才用 `${}`，且必须配合白名单校验，杜绝用户输入直接进入 `${}`。
:::

### 8. 参数获取的多种方式

MyBatis 传参的规则是面试常考项，核心规则一句话：**单个参数用任意名都能取，多个参数必须显式命名**。

| 传参方式 | XML 里怎么取 | 适用场景 |
| --- | --- | --- |
| 单个基本类型 | `#{任意名}` | 最常见，`#{id}` `#{name}` 都行 |
| 单个 POJO / Map | `#{属性名}` / `#{key}` | 参数多时封装成对象 |
| 多个参数 | `#{arg0}` `#{arg1}` 或 `#{param1}` `#{param2}` | 不推荐，可读性差 |
| 多个参数 + `@Param` | `#{param名}` | ✅ 推荐，见名知义 |
| 数组 / List | `<foreach>` 遍历 | 批量查询 / 批量插入 |

```java
// 为什么多个参数要加 @Param：Java 编译后方法参数名会丢失（未开启 -parameters 编译参数），
// 运行时只能拿到 arg0/arg1/param1/param2 这种无意义名字；
// 加 @Param 显式命名，XML 里才能用有意义的 #{username} 取值
User findByAccount(@Param("username") String username, @Param("password") String password);
```

```xml
<select id="findByAccount" resultType="User">
    SELECT * FROM user WHERE user_name = #{username} AND password = #{password}
</select>
```

```java
// 传 Map：为什么用 Map——参数完全动态、不确定有多少个时，用 Map 兜底
Map<String, Object> param = new HashMap<>();
param.put("name", "张三");
param.put("age", 18);
mapper.listByMap(param);
```

```xml
<select id="listByMap" resultType="User">
    SELECT * FROM user
    <where>
        <if test="name != null">AND user_name = #{name}</if>
        <if test="age != null">AND age = #{age}</if>
    </where>
</select>
```

::: tip 💡 面试题：MyBatis 多参数时为什么必须用 @Param？
**结论**：因为 Java 编译默认会抹掉方法的参数名，运行时 MyBatis 无法通过反射拿到 `username` 这样的名字。

**原因**：MyBatis 通过反射解析方法参数，若未开启 `-parameters` 编译选项，参数名信息会丢失，只能退化为 `arg0`/`arg1` 这种位置参数；`@Param` 注解把名字写进了字节码的注解表里，运行时稳定可读。

**展开**：JDK 8+ 开启 `-parameters` 编译选项、或用 Spring Boot 的 `ParameterNameDiscoverer` 也能拿到真实参数名，但显式 `@Param` 是最稳妥、可读性最好的方案。
:::

### 9. 结果映射基础

#### 9.1 自动映射与驼峰

```xml
<!-- 开了 mapUnderscoreToCamelCase 后，下面这行查询无需任何 resultMap，
     user_name 会自动对应到 userName 属性 -->
<select id="getById" resultType="User">
    SELECT id, user_name, age FROM user WHERE id = #{id}
</select>
```

自动映射的规则：列名（去掉下划线、转驼峰）与属性名**完全一致**时自动映射。有「别名」时也能用，例如：

```xml
<!-- 为什么用别名：SQL 里给列起个别名，让别名直接等于 Java 属性名，省去 resultMap -->
<select id="list" resultType="User">
    SELECT id, user_name AS userName, age FROM user
</select>
```

#### 9.2 resultType 与 resultMap 的选择

| 对比 | `resultType` | `resultMap` |
| --- | --- | --- |
| 用法 | 直接写返回类型 | 引用一个 `<resultMap>` 定义 |
| 是否自动映射 | 按同名规则自动映射 | 可显式指定每一列 |
| 适用 | 简单查询、列名与属性名一致 | 列名对不上、关联查询、复杂嵌套 |

### 10. 动态 SQL 全集

动态 SQL 是 MyBatis 最强大的功能，解决的是「查询条件可填可不填」「批量操作」这类「SQL 结构不固定」的问题。MyBatis 用 **OGNL 表达式**来求值 `<if test>` 里的条件。

#### 10.1 `<if>` + `<where>`：可选条件

```xml
<select id="listByCondition" resultType="User">
    SELECT * FROM user
    <!-- 为什么用 <where>：它会智能地去掉开头多余的 AND/OR，
         且当所有条件都不满足时，连 WHERE 关键字本身都不输出（避免 SELECT * FROM user WHERE 空） -->
    <where>
        <!-- test 里是 OGNL 表达式：判断 name 既不为 null 也不为空字符串 -->
        <if test="name != null and name != ''">
            AND user_name LIKE CONCAT('%', #{name}, '%')
        </if>
        <if test="age != null">
            AND age = #{age}
        </if>
    </where>
</select>
```

#### 10.2 `<choose>` / `<when>` / `<otherwise>`：多选一

```xml
<select id="listByPriority" resultType="User">
    SELECT * FROM user
    <where>
        <!-- 为什么用 choose：相当于 Java 的 if/else if/else，多个条件只命中第一个成立的 -->
        <choose>
            <when test="name != null and name != ''">
                AND user_name = #{name}
            </when>
            <when test="age != null">
                AND age = #{age}
            </when>
            <otherwise>
                AND status = 1
            </otherwise>
        </choose>
    </where>
</select>
```

#### 10.3 `<trim>`：自定义修剪（where / set 的底层实现）

```xml
<!-- <trim> 是 <where> 和 <set> 的通用底层，用 prefix/suffix/prefixOverrides/suffixOverrides 控制拼接 -->
<select id="listByTrim" resultType="User">
    SELECT * FROM user
    <!-- prefix="WHERE"：前缀补 WHERE；prefixOverrides="AND |OR "：去掉开头多余的 AND/OR -->
    <trim prefix="WHERE" prefixOverrides="AND |OR ">
        <if test="name != null">AND user_name = #{name}</if>
        <if test="age != null">AND age = #{age}</if>
    </trim>
</select>
```

#### 10.4 `<set>`：动态更新，避免多余的逗号

```xml
<update id="updateSelective">
    UPDATE user
    <!-- 为什么用 <set>：动态更新时只更新非空字段，
         <set> 会自动去掉末尾多余的逗号，避免 UPDATE user SET user_name=?, 这种语法错误 -->
    <set>
        <if test="userName != null">user_name = #{userName},</if>
        <if test="age != null">age = #{age},</if>
        <if test="email != null">email = #{email},</if>
    </set>
    WHERE id = #{id}
</update>
```

#### 10.5 `<foreach>`：集合遍历（批量查询 / 批量插入）

```xml
<!-- 批量查询：foreach 把集合拼成 (?, ?, ?)，open/separator/close 分别控制括号、分隔符、结尾 -->
<select id="listByIds" resultType="User">
    SELECT * FROM user WHERE id IN
    <foreach collection="ids" item="id" open="(" separator="," close=")">
        #{id} <!-- 每个元素都走 #{} 预编译，既安全又高效 -->
    </foreach>
</select>
```

```xml
<!-- 批量插入：一条 INSERT 多组 VALUES，为什么比循环单条 insert 快——减少网络往返和语句编译次数 -->
<insert id="batchInsert">
    INSERT INTO user(user_name, age) VALUES
    <foreach collection="list" item="u" separator=",">
        (#{u.userName}, #{u.age})
    </foreach>
</insert>
```

```java
// 批量插入的接口定义：@Param 命名集合，XML 里 collection="list" 对应
int batchInsert(@Param("list") List<User> users);
```

::: tip 💡 面试题：foreach 里 collection 该写什么名字？
**结论**：单参数 List 写 `list`，单参数数组写 `array`，单参数 Map 写 Map 的 key，多参数用 `@Param` 指定的名字。

**原因**：MyBatis 对单参数集合有默认命名约定——List 会被命名为 `list`、数组命名为 `array`、Map 则用 key 名；这是框架在参数解析阶段埋好的默认值。

**展开**：用 `@Param("ids")` 显式命名后，XML 里就该写 `collection="ids"`，与类型无关；显式命名比依赖默认约定更不易出错，推荐始终用 `@Param`。
:::

#### 10.6 `<sql>` + `<include>`：SQL 片段复用

```xml
<!-- 为什么抽 SQL 片段：多个查询共用同一批列，改一处就能全局生效，避免漏改 -->
<sql id="Base_Column_List">
    id, user_name, age, email
</sql>

<select id="getById" resultType="User">
    SELECT <include refid="Base_Column_List"/> FROM user WHERE id = #{id}
</select>

<select id="list" resultType="User">
    SELECT <include refid="Base_Column_List"/> FROM user
</select>
```

#### 10.7 `<bind>`：OGNL 表达式变量

```xml
<!-- 为什么用 bind：把重复的 OGNL 表达式算一次存成变量；
     这里 CONCAT 在 OGNL 里不通用，用 bind 统一成 'xxx%' 再 LIKE -->
<select id="listByName" resultType="User">
    <bind name="pattern" value="'%' + name + '%'"/>
    SELECT * FROM user WHERE user_name LIKE #{pattern}
</select>
```

#### 10.8 `<script>`：在注解里写动态 SQL

```java
// 为什么用 <script>：注解里本来只能写静态 SQL，
// 包一层 <script> 标签后就能在注解中使用 if/foreach 等动态标签
@Select("<script>" +
        "SELECT * FROM user" +
        "<where>" +
        "  <if test='name != null'>AND user_name = #{name}</if>" +
        "</where>" +
        "</script>")
List<User> listByName(@Param("name") String name);
```

### 基础篇小结

到这里，你已经掌握了 MyBatis 的「常规用法」：配置、CRUD、参数绑定、结果映射、动态 SQL。这些能力足以应对 80% 的日常开发。但还有一批「进阶能力」——关联查询、延迟加载、缓存、插件——它们才是区分「会用」和「精通」的分水岭，见高级篇。

---

## 高级篇

### 1. resultMap 详解：显式掌控映射

当「列名和属性名对不上」「需要关联查询」「需要构造器注入」时，`resultType` 的自动映射就力不从心了，这时就要上 `resultMap`。它就像一张「列 ↔ 属性」的对照表。

```xml
<!-- resultMap 的「为什么」：连表/别名查询后列名和属性名对不上，
     靠它显式指定每一列怎么映射到哪个属性 -->
<resultMap id="UserMap" type="User">
    <!-- 主键用 <id> 标签：为什么单独区分主键——MyBatis 用主键做缓存的 key，
         标识主键有助于缓存命中与比较性能 -->
    <id property="id" column="id"/>
    <!-- 普通列用 <result>：property 是 Java 属性，column 是数据库列 -->
    <result property="userName" column="user_name"/>
    <result property="age" column="age"/>
</resultMap>

<select id="getById" resultMap="UserMap">
    SELECT id, user_name, age FROM user WHERE id = #{id}
</select>
```

`resultMap` 的子元素全览：

| 子元素 | 作用 |
| --- | --- |
| `<id>` | 标识主键映射，利于缓存与比较 |
| `<result>` | 普通列 → 属性映射 |
| `<constructor>` | 用构造器注入（指定 `arg` 顺序） |
| `<association>` | 一对一关联（单个对象） |
| `<collection>` | 一对多关联（集合） |
| `<discriminator>` | 鉴别器，根据某列值动态选择映射 |

```xml
<!-- constructor：为什么用构造器映射——实体类只提供了有参构造时，
     必须用 <constructor> 按参数顺序注入 -->
<resultMap id="UserMap2" type="User">
    <constructor>
        <idArg column="id" javaType="long"/>
        <arg column="user_name" javaType="String"/>
    </constructor>
</resultMap>
```

### 2. 关联映射：一对一 / 一对多 / 多对多

关联查询有两种写法：**嵌套结果**（一次连表查询出全部数据）和**嵌套查询**（先查主表，再按需查子表）。面试重点通常是「嵌套查询的 N+1 问题」。

| 关系 | 标签 | 说明 | 典型例子 |
| --- | --- | --- | --- |
| 一对一 | `<association>` | 一个订单对应一个用户 | Order → User |
| 一对多 | `<collection>` | 一个用户对应多个订单 | User → `List<Order>` |
| 多对一 | `<association>` | 反过来看就是多对一 | Order → User |
| 多对多 | `<collection>` + 中间表 | 学生和课程 | Student → `List<Course>` |

#### 2.1 一对一（association，嵌套结果）

```xml
<!-- 嵌套结果：一条连表 SQL 把所有数据查出来，再靠 resultMap 拆分成对象 -->
<resultMap id="OrderWithUser" type="Order">
    <id property="id" column="id"/>
    <result property="amount" column="amount"/>
    <!-- association 一对一：javaType 指定目标对象类型，下面再写子映射 -->
    <association property="user" javaType="User">
        <id property="id" column="user_id"/>
        <result property="userName" column="user_name"/>
    </association>
</resultMap>

<select id="getOrderWithUser" resultMap="OrderWithUser">
    SELECT o.id, o.amount, u.id AS user_id, u.user_name
    FROM orders o LEFT JOIN user u ON o.user_id = u.id
    WHERE o.id = #{id}
</select>
```

#### 2.2 一对多（collection，嵌套结果）

```xml
<resultMap id="UserWithOrders" type="User">
    <id property="id" column="id"/>
    <result property="userName" column="user_name"/>
    <!-- collection 一对多：ofType 指定集合里元素的类型（注意不是 javaType，javaType 是集合本身类型） -->
    <collection property="orders" ofType="Order">
        <id property="id" column="order_id"/>
        <result property="amount" column="amount"/>
    </collection>
</resultMap>

<select id="getUserWithOrders" resultMap="UserWithOrders">
    SELECT u.id, u.user_name, o.id AS order_id, o.amount
    FROM user u LEFT JOIN orders o ON u.id = o.user_id
    WHERE u.id = #{id}
</select>
```

#### 2.3 嵌套查询与 N+1 问题

```xml
<!-- 嵌套查询：先查 user，再根据 user_id 去查 orders（分成两条 SQL） -->
<resultMap id="UserWithOrders2" type="User">
    <id property="id" column="id"/>
    <!-- select：指定子查询语句的 id；column：把当前行的哪一列作为参数传给子查询 -->
    <collection property="orders" ofType="Order"
                select="com.example.mapper.OrderMapper.listByUserId"
                column="id"/>
</resultMap>

<select id="getUserWithOrders2" resultMap="UserWithOrders2">
    SELECT id, user_name FROM user WHERE id = #{id}
</select>
```

```text
N+1 问题示意图（查询 N 个用户及其订单）：

  主查询：SELECT * FROM user            → 得到 N 行（1 次查询）
  子查询：每个用户再查一次订单
         SELECT * FROM orders WHERE user_id = 1   → 1 次
         SELECT * FROM orders WHERE user_id = 2   → 1 次
         ... 共 N 次

  总查询次数 = 1 + N，数据量一大就慢得离谱
```

::: tip 💡 面试题：MyBatis 关联查询的 N+1 问题怎么解决？
**结论**：用「嵌套结果」代替「嵌套查询」——一条连表 SQL 查出全部数据，再用 resultMap 拆分，彻底消除 N+1 次查询。

**原因**：N+1 的根源是「嵌套查询」把一次查询拆成了 1 次主查询 + N 次子查询，每次子查询都有独立的网络往返和 SQL 编译开销；「嵌套结果」则用 JOIN 一次拿全数据，只付出一次查询成本。

**展开**：如果数据量极大、JOIN 本身成为瓶颈，也可保留嵌套查询但配合**延迟加载**（用到订单时才查订单），让子查询按需触发；此外批量场景可用 `<foreach>` 一次性查回所有订单再内存分组。
:::

### 3. 延迟加载（懒加载）

延迟加载解决的是「关联对象可能根本用不到，却每次都连表查出来」的浪费。它依赖代理对象，只有真正访问关联属性时才发 SQL。

```xml
<!-- 全局开启延迟加载 -->
<settings>
    <!-- lazyLoadingEnabled：开启懒加载，关联属性用到时才查询 -->
    <setting name="lazyLoadingEnabled" value="true"/>
    <!-- aggressiveLazyLoading：3.4.1+ 默认 false，false 才是「按需加载」；
         设为 true 会导致调用任意方法都触发全部懒属性加载，是常见性能坑 -->
    <setting name="aggressiveLazyLoading" value="false"/>
    <!-- lazyLoadTriggerMethods：默认 equals/clone/hashCode/toString 会触发加载 -->
    <setting name="lazyLoadTriggerMethods" value=""/>
</settings>
```

```java
// 延迟加载示例：user.getOrders() 被真正调用时才发第二条 SQL
User user = mapper.getUserWithOrders2(1L);
System.out.println(user.getUserName()); // 只查了 user，此时 orders 未加载
List<Order> orders = user.getOrders();   // 访问 orders 属性，才触发查询订单
```

::: tip 💡 面试题：MyBatis 延迟加载的原理？
**结论**：MyBatis 返回的是关联属性的**代理对象**，第一次访问该属性时才触发真实的子查询。

**原因**：开启懒加载后，`ResultLoader` 会把需要懒加载的关联属性替换成 Javassist/CGLIB 生成的代理，代理内部持有 `ResultLoaderMap` 记录「这个属性还没加载」；当调用 `getOrders()` 时，代理拦截到访问，才执行 `select` 指向的子查询并填充真实数据。

**展开**：延迟加载默认基于动态代理（可用 `proxyFactory` 切换 CGLIB 或 Javassist）；它与二级缓存、Spring 事务边界有交互（懒加载触发的 SQL 发生在会话已关闭之后会报错），所以延迟加载要和「延长 SqlSession 生命周期」配合使用。
:::

### 4. 注解开发

简单 SQL 用注解就近声明，复杂动态 SQL 仍建议 XML。注解是 XML 的等价物，二者可以混用。

```java
@Mapper
public interface UserMapper {

    // 为什么简单查询用注解：一两行的 SQL 不值得单独开一个 XML 文件，注解就近声明更清爽
    @Select("SELECT * FROM user WHERE id = #{id}")
    User getById(Long id);

    // @Insert 回填主键：useGeneratedKeys + keyProperty 等价于 XML 里的两个属性
    @Insert("INSERT INTO user(user_name, age) VALUES(#{userName}, #{age})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int insert(User user);

    @Update("UPDATE user SET user_name = #{userName} WHERE id = #{id}")
    int update(User user);

    @Delete("DELETE FROM user WHERE id = #{id}")
    int deleteById(Long id);

    // 注解版 resultMap：@Results 对应 <resultMap>，@One 对应 association，@Many 对应 collection
    @Select("SELECT * FROM orders WHERE id = #{id}")
    @Results({
        @Result(id = true, property = "id", column = "id"),
        @Result(property = "amount", column = "amount"),
        @Result(property = "user", column = "user_id",
                one = @One(select = "com.example.mapper.UserMapper.getById"))
    })
    Order getOrderWithUser(Long id);
}
```

| XML 标签 | 对应注解 |
| --- | --- |
| `<select>` | `@Select` |
| `<insert>` | `@Insert` |
| `<update>` | `@Update` |
| `<delete>` | `@Delete` |
| `<resultMap>` | `@Results` / `@Result` |
| `<association>` | `@One` |
| `<collection>` | `@Many` |
| `<result>` | `@Result` |
| `<selectKey>` | `@SelectKey` |
| 动态 SQL | `@SelectProvider` 等四类 Provider |

```java
// @SelectProvider：注解里写不了复杂动态 SQL，交给 Provider 类拼字符串
@SelectProvider(type = UserSqlProvider.class, method = "listByCondition")
List<User> listByCondition(User query);

// Provider 类：用 SqlBuilder 或自己拼 SQL 字符串
public class UserSqlProvider {
    public String listByCondition(User q) {
        return new SQL() {{
            SELECT("*");
            FROM("user");
            if (q.getAge() != null) WHERE("age = #{age}");
        }}.toString();
    }
}
```

::: tip 💡 面试题：注解和 XML 怎么选？
**结论**：简单、固定的 SQL 用注解；复杂、动态的 SQL 用 XML。

**原因**：注解就近声明、可读性好，但 Java 字符串里拼接动态 SQL 很痛苦（要手写 `<script>` 或 Provider）；XML 对动态标签、SQL 片段复用、连表映射的支持更完整，且改 SQL 不用重新编译。

**展开**：生产项目的主流是「XML 为主、注解为辅」，或干脆用 MyBatis-Plus 的 BaseMapper 免写基础 CRUD，复杂 SQL 再落到 XML。
:::

### 5. 分页查询

MyBatis 本身不提供物理分页，只提供逻辑分页和「交给插件」两种思路。

| 方案 | 原理 | 优点 | 缺点 |
| --- | --- | --- | --- |
| `RowBounds` | 逻辑分页：查出全部，再内存截取 | 简单 | 数据量大时内存爆炸，不推荐 |
| SQL 手写 `LIMIT` | 物理分页，SQL 里写 `LIMIT #{offset}, #{size}` | 高效 | 每个查询都要手写 |
| PageHelper 插件 | 拦截 SQL，自动追加 `LIMIT` | 一行代码分页，最常用 | 需引入依赖 |

```xml
<!-- 手写 LIMIT 分页：物理分页，只查需要的那一页 -->
<select id="listByPage" resultType="User">
    SELECT * FROM user ORDER BY id LIMIT #{offset}, #{size}
</select>
```

```java
// PageHelper 用法：startPage 后紧跟的第一个查询会被自动分页
PageHelper.startPage(pageNum, pageSize);
List<User> users = mapper.listAll();
PageInfo<User> pageInfo = new PageInfo<>(users); // 包装出总数、总页数等信息
long total = pageInfo.getTotal();
```

```java
// RowBounds 逻辑分页：为什么几乎不用——它先查全量数据再截取，数据多时拖垮内存和数据库
List<User> users = session.selectList("listAll", null, new RowBounds(0, 10));
```

::: tip 💡 面试题：MyBatis 分页的几种方式及优劣？
**结论**：逻辑分页（RowBounds）查全量再截取、不推荐；物理分页（手写 LIMIT 或 PageHelper 插件）只查一页、推荐。

**原因**：逻辑分页把「过滤」放在了内存里，数据库仍然返回全部行，IO 和内存开销与总数据量成正比；物理分页则把 `LIMIT` 下推到 SQL，数据库只返回目标页。

**展开**：PageHelper 的原理是「拦截 Executor 的查询方法，从 ThreadLocal 取出分页参数，改写即将执行的 SQL 追加 LIMIT」，属于典型的 MyBatis 插件应用，见下文插件原理。
:::

### 6. 批量操作

批量插入/更新有几种做法，性能差异巨大：

| 方案 | 机制 | 性能 | 适用 |
| --- | --- | --- | --- |
| 循环单条 `insert` | 每条独立往返 | 慢 | 数据极少 |
| `<foreach>` 拼多条 VALUES | 一条 SQL 多组值 | 快，但有 SQL 长度上限 | 几千条内 |
| `ExecutorType.BATCH` | JDBC 批处理，攒够批量提交 | 最快，不受 SQL 长度限制 | 海量数据 |

```java
// ExecutorType.BATCH：为什么最快——复用同一个 PreparedStatement 攒批，
// 由 JDBC 的 addBatch/executeBatch 一次性提交，减少往返和解析
try (SqlSession session = factory.openSession(ExecutorType.BATCH)) {
    UserMapper mapper = session.getMapper(UserMapper.class);
    for (int i = 0; i < 10000; i++) {
        mapper.insert(new User("user" + i, 18));
        if (i % 500 == 0) {
            session.flushStatements(); // 每 500 条刷一次，控制内存
        }
    }
    session.commit();
}
```

::: tip 💡 面试题：批量插入怎么选方案？
**结论**：几千条以内用 `<foreach>` 拼多条 VALUES；海量数据用 `ExecutorType.BATCH`。

**原因**：`<foreach>` 只需一次 SQL 编译、一次网络往返，但受 MySQL `max_allowed_packet` 和 SQL 长度限制；`BATCH` 走 JDBC 批处理，复用语句对象、分批提交，不受单条 SQL 长度限制。

**展开**：`BATCH` 模式默认不自动提交，需要手动 `flushStatements()` 和 `commit()`；Spring 环境下需用 `SqlSessionTemplate` 的 `SqlSessionFactory` 单独开 BATCH 会话，避免影响普通会话。
:::

### 7. 自定义 TypeHandler：处理枚举、JSON 等特殊类型

默认的 TypeHandler 只能处理基本类型与 String/Date 的映射。当实体里有「枚举」「JSON 字符串」「自定义类型」时，需要自定义 TypeHandler。

```java
// 场景：数据库存的是数字状态码，Java 里想用枚举表达
public enum Sex { MALE(1), FEMALE(2), UNKNOWN(3); }
```

```java
// 自定义 TypeHandler：实现 setParameter（写入）和 getResult（读取）两个方向
@MappedTypes(Sex.class)
@MappedJdbcTypes(JdbcType.INTEGER)
public class SexTypeHandler extends BaseTypeHandler<Sex> {
    // 写入数据库时：枚举 → 数字
    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, Sex parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setInt(i, parameter.getCode()); // 为什么用 code 存库：数字比字符串省空间、好比较
    }
    // 读取时：数字 → 枚举
    @Override
    public Sex getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return Sex.of(rs.getInt(columnName));
    }
    @Override
    public Sex getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return Sex.of(rs.getInt(columnIndex));
    }
    @Override
    public Sex getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return Sex.of(cs.getInt(columnIndex));
    }
}
```

```xml
<!-- 注册并使用：resultMap 里用 typeHandler 属性指定 -->
<resultMap id="UserMap" type="User">
    <id property="id" column="id"/>
    <result property="sex" column="sex" typeHandler="com.example.handler.SexTypeHandler"/>
</resultMap>
```

```yaml
# 或全局配置 type-handlers-package，自动扫描
mybatis:
  type-handlers-package: com.example.handler
```

### 8. MyBatis 插件 / 拦截器

插件是 MyBatis 的扩展机制，原理篇会详细讲「责任链 + 动态代理」，这里先看「怎么用」。

```java
// 一个统计 SQL 执行耗时的插件：拦截 Executor 的 query/update 方法
@Intercepts({
    @Signature(type = Executor.class, method = "query",
            args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class}),
    @Signature(type = Executor.class, method = "update",
            args = {MappedStatement.class, Object.class})
})
public class SqlCostInterceptor implements Interceptor {
    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        long start = System.currentTimeMillis();
        try {
            return invocation.proceed(); // 为什么必须调 proceed：把请求传给下一个拦截器/真实执行器
        } finally {
            long cost = System.currentTimeMillis() - start;
            // 从 MappedStatement 里拿到 SQL id，打印耗时
            MappedStatement ms = (MappedStatement) invocation.getArgs()[0];
            System.out.println(ms.getId() + " 耗时 " + cost + "ms");
        }
    }
}
```

```xml
<!-- 注册插件：写在 environments 之前 -->
<plugins>
    <plugin interceptor="com.example.plugin.SqlCostInterceptor"/>
</plugins>
```

### 9. 与 Spring / Spring Boot 整合

生产环境几乎不会裸用 MyBatis，都是放进 Spring 容器里管理。

```yaml
# Spring Boot + MyBatis 整合（mybatis-spring-boot-starter）
spring:
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    url: jdbc:mysql://localhost:3306/test?useUnicode=true&characterEncoding=utf8
    username: root
    password: root
    # 为什么用 HikariCP：Spring Boot 默认连接池，性能最好
    hikari:
      maximum-pool-size: 20

mybatis:
  mapper-locations: classpath:mapper/*.xml  # 映射文件位置，* 通配所有 XML
  type-aliases-package: com.example.entity   # 实体类别名
  configuration:
    map-underscore-to-camel-case: true       # 驼峰映射
```

```java
// 主启动类：@MapperScan 扫描所有 Mapper 接口，生成代理 bean 注入容器
@SpringBootApplication
@MapperScan("com.example.mapper") // 为什么加它：省去每个接口都写 @Mapper 注解
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

```java
// 业务里直接注入 Mapper 使用，SqlSession 的生命周期由 Spring 托管
@Service
public class UserService {
    private final UserMapper userMapper;
    public UserService(UserMapper userMapper) { this.userMapper = userMapper; }

    @Transactional // 为什么加事务注解：Spring 事务 + MyBatis 的 SqlSession 生命周期绑定
    public User getUser(Long id) {
        return userMapper.getById(id);
    }
}
```

::: tip 💡 面试题：Spring 整合 MyBatis 后，SqlSession 是线程安全的吗？
**结论**：`SqlSessionTemplate` 是线程安全的，Spring 用它代理了 `DefaultSqlSession`，保证每个线程拿到独立会话。

**原因**：裸的 `DefaultSqlSession` 非线程安全（内部持有一级缓存和执行器状态），不能跨线程共享；Spring 的 `SqlSessionTemplate` 内部用 `SqlSessionHolder` 绑定到当前事务/线程，每次调用都通过 `getSqlSession` 获取当前线程专属的会话，用完自动归还。

**展开**：这就是「Spring 里为什么不用手动 openSession/close」的原因——`SqlSessionTemplate` 把会话生命周期和 Spring 事务边界绑定，事务提交/回滚时自动管理会话。
:::

### 高级篇小结

高级篇覆盖了 resultMap 的精细映射、关联查询与 N+1 问题、延迟加载、注解开发、分页、批量、自定义 TypeHandler、插件、Spring 整合。这些能力解决的是「复杂业务建模」的问题。但要做到「面试能讲清、排查能定位」，还必须下到源码层，理解 MyBatis 到底怎么把这些东西串起来——见原理篇。

---

## 原理篇

原理篇回答三个贯穿面试的问题：**Mapper 接口没有实现类为什么能执行 SQL？**（动态代理）**一条 SQL 从调用到返回结果经历了什么？**（执行链路）**一级/二级缓存、插件、延迟加载底层怎么实现？**（源码机制）

### 1. 整体执行流程（完整链路）

先建立全貌，再逐段拆解。一条 `mapper.getById(1L)` 背后发生的事：

```text
 业务代码                       MyBatis 框架内部
────────────────────────────────────────────────────────────────────────
mapper.getById(1L)
      │
      ▼
┌─────────────┐   代理拦截    ┌──────────────────────────────┐
│ MapperProxy │ ───────────► │ 定位 MappedStatement (namespace+id)│
│ (动态代理)   │              └──────────────┬───────────────┘
└─────────────┘                              │
                                             ▼
                              ┌──────────────────────────────┐
                              │   SqlSession.selectOne(...)   │
                              └──────────────┬───────────────┘
                                             ▼
                              ┌──────────────────────────────┐
                              │   CachingExecutor（二级缓存）   │
                              │   CacheKey 命中？→ 直接返回      │
                              └──────────────┬───────────────┘
                                             ▼ 未命中
                              ┌──────────────────────────────┐
                              │   BaseExecutor（一级缓存）      │
                              │   localCache 命中？→ 直接返回    │
                              └──────────────┬───────────────┘
                                             ▼ 未命中
                              ┌──────────────────────────────┐
                              │   doQuery()：真正查库           │
                              │   ① 创建 StatementHandler       │
                              │   ② ParameterHandler 设参数     │
                              │   ③ Statement 执行 SQL          │
                              │   ④ ResultSetHandler 映射结果   │
                              └──────────────┬───────────────┘
                                             ▼
                                    存入一/二级缓存，返回结果
```

```text
四大对象的职责分工（一条 SQL 的四段流水线）：

  Executor ──► StatementHandler ──► ParameterHandler ──► JDBC Statement
       ▲                                                  │
       │                                                  ▼
  ResultSetHandler ◄──────── ResultSet ◄──────────────────┘
```

| 对象 | 一句话职责 | 核心接口方法 |
| --- | --- | --- |
| `Executor` | 调度者：缓存、事务、批处理 | `query` `update` `commit` `rollback` |
| `StatementHandler` | 创建并执行 Statement | `prepare` `parameterize` `query` `update` |
| `ParameterHandler` | 把参数设进 Statement | `setParameters` |
| `ResultSetHandler` | 把 ResultSet 映射成对象 | `handleResultSets` |
| `TypeHandler` | Java 类型 ↔ JDBC 类型互转 | `setParameter` `getResult` |

::: tip 💡 面试题：MyBatis 的 Mapper 接口没有实现类，为什么能执行 SQL？
**结论**：MyBatis 用 **JDK 动态代理**为 Mapper 接口生成代理对象，调用方法时代理去执行 XML 里对应的 SQL。

**原因**：`MapperProxyFactory` 用 `Proxy.newProxyInstance` 为接口生成一个 `MapperProxy` 代理实例，`MapperProxy` 实现了 `InvocationHandler`，所有方法调用都会被 `invoke` 拦截，然后根据 `接口全限定名 + 方法名` 拼出 `namespace + id`，从 `Configuration` 的 `mappedStatements` Map 里取出对应的 `MappedStatement` 执行。

**展开**：`MapperMethod` 会根据方法类型（增删改查）和参数、返回类型，选择合适的 `SqlSession` 方法（`selectOne`/`selectList`/`insert`/`update`/`delete`）执行；这就是「调用接口方法 = 执行 SQL」的完整闭环。
:::

### 2. 动态代理原理（MapperProxy）

这是 MyBatis 最核心的设计，面试官常让你现场讲清楚。

```java
// MapperProxyFactory 的核心逻辑（源码简化）
public class MapperProxyFactory<T> {
    private final Class<T> mapperInterface;
    private final Map<Method, MapperMethod> methodCache = new ConcurrentHashMap<>();

    // 生成代理对象：为什么用 Proxy.newProxyInstance——JDK 动态代理要求有接口，Mapper 恰好是接口
    protected T newInstance(MapperProxy<T> mapperProxy) {
        return (T) Proxy.newProxyInstance(
                mapperInterface.getClassLoader(),
                new Class[]{ mapperInterface },
                mapperProxy);
    }
}
```

```java
// MapperProxy.invoke 的核心流程（源码简化）
public Object invoke(Object proxy, Method method, Object[] args) {
    // Object 类的方法（toString/hashCode/equals）直接放行，不拦截
    if (Object.class.equals(method.getDeclaringClass())) {
        return method.invoke(this, args);
    }
    // 把「方法调用」包装成 MapperMethod（内部缓存，避免每次反射解析）
    MapperMethod mapperMethod = cachedMapperMethod(method);
    // 交给 SqlSession 执行
    return mapperMethod.execute(sqlSession, args);
}
```

```java
// MapperMethod.execute：根据 SQL 命令类型分派到不同的 SqlSession 方法
public Object execute(SqlSession sqlSession, Object[] args) {
    Object result;
    switch (command.getType()) {
        case INSERT:  result = rowCountResult(sqlSession.insert(command.getName(), param)); break;
        case UPDATE:  result = rowCountResult(sqlSession.update(command.getName(), param)); break;
        case DELETE:  result = rowCountResult(sqlSession.delete(command.getName(), param)); break;
        case SELECT:
            if (returnsVoid())       { sqlSession.select(command.getName(), param, ...); return null; }
            if (returnsMany())       result = sqlSession.selectList(command.getName(), param); break;
            if (returnsMap())        result = sqlSession.selectMap(command.getName(), param, ...); break;
            default:                 result = sqlSession.selectOne(command.getName(), param); break;
    }
    return result;
}
```

```text
动态代理调用链：

  接口方法调用 getById(1L)
        │
        ▼
  MapperProxy.invoke()          ← 代理拦截点
        │ 包装成 MapperMethod（含 SqlCommand + MethodSignature）
        ▼
  MapperMethod.execute()        ← 按 INSERT/UPDATE/DELETE/SELECT 分派
        │ 调 sqlSession.selectOne(namespace+id, param)
        ▼
  DefaultSqlSession.selectOne() ← 转成 selectList 再取第一条
        │ 调 executor.query(...)
        ▼
  Executor 体系（缓存 + 真正执行）
```

### 3. SqlSession 的创建与生命周期

```java
// SqlSessionFactoryBuilder.build 的简化流程
public SqlSessionFactory build(InputStream inputStream) {
    // 1. 用 XMLConfigBuilder 解析 mybatis-config.xml，得到 Configuration
    XMLConfigBuilder parser = new XMLConfigBuilder(inputStream, null, null);
    Configuration configuration = parser.parse(); // 这里会进一步解析每个 mapper XML
    // 2. 用 Configuration 构造 DefaultSqlSessionFactory
    return new DefaultSqlSessionFactory(configuration);
}
```

```java
// DefaultSqlSessionFactory.openSession 的简化流程
public SqlSession openSession() {
    // 1. 从 Configuration 取 Environment，拿到事务工厂
    Transaction tx = transactionFactory.newTransaction(dataSource, null, false);
    // 2. 根据配置的 ExecutorType 创建 Executor（默认 SimpleExecutor）
    Executor executor = configuration.newExecutor(tx, ExecutorType.SIMPLE);
    // 3. 包装成 DefaultSqlSession
    return new DefaultSqlSession(configuration, executor, false);
}
```

```text
Configuration 是 MyBatis 的「唯一真相源」（Single Source of Truth）：

  Configuration
  ├── mappedStatements：Map<String, MappedStatement>   key = namespace + "." + id
  ├── resultMaps：Map<String, ResultMap>               key = namespace + "." + resultMapId
  ├── caches：Map<String, Cache>                       二级缓存
  ├── typeHandlerRegistry：类型处理器注册表
  ├── typeAliasRegistry：别名注册表
  ├── mapperRegistry：Mapper 接口注册表
  └── interceptorChain：插件拦截链
```

### 4. Executor 体系（执行器）

`Executor` 是执行 SQL 的调度核心。它采用「抽象基类 + 三个子类 + 一个缓存装饰器」的结构：

```text
                       Executor（接口）
                           ▲
                    BaseExecutor（抽象基类：实现一级缓存、事务）
                    │         │
        ┌───────────┼─────────────────┐
        │           │                 │
  SimpleExecutor  ReuseExecutor  BatchExecutor        CachingExecutor
   （默认，每请求     （复用Statement） （批处理）          （装饰器，二级缓存）
    新建Statement）                                      │
                                                        ▼
                                                  装饰并包住上面的 BaseExecutor
```

| 执行器 | 特点 | 适用场景 |
| --- | --- | --- |
| `SimpleExecutor` | 每次执行都新建 Statement，用完关闭 | 默认，简单可靠 |
| `ReuseExecutor` | 复用同一 SQL 的 Statement | 同一 SQL 多次执行的场景 |
| `BatchExecutor` | 攒批、手动 flush，走 JDBC 批处理 | 批量插入/更新 |
| `CachingExecutor` | 装饰器，在 BaseExecutor 外层加二级缓存 | `cacheEnabled=true` 时自动启用 |

```java
// Configuration.newExecutor：根据 cacheEnabled 决定是否套 CachingExecutor（源码简化）
public Executor newExecutor(Transaction transaction, ExecutorType executorType) {
    Executor executor;
    if (ExecutorType.BATCH == executorType)      executor = new BatchExecutor(this, transaction);
    else if (ExecutorType.REUSE == executorType) executor = new ReuseExecutor(this, transaction);
    else                                         executor = new SimpleExecutor(this, transaction);
    // 为什么这里套装饰器：二级缓存是「横切关注点」，用装饰器模式加在外层，不改动 BaseExecutor 逻辑
    if (cacheEnabled) {
        executor = new CachingExecutor(executor);
    }
    // 为什么最后跑一遍插件链：让插件可以拦截到 Executor 的代理对象
    executor = (Executor) interceptorChain.pluginAll(executor);
    return executor;
}
```

::: tip 💡 面试题：MyBatis 的 Executor 有哪些类型，怎么切换？
**结论**：`SimpleExecutor`（默认）、`ReuseExecutor`（复用 Statement）、`BatchExecutor`（批处理）三种，外加 `CachingExecutor` 装饰器。

**原因**：三种 Executor 的差异在「Statement 的创建与提交策略」——Simple 用一次建一次，Reuse 复用同 SQL 的 Statement，Batch 攒批提交；这是典型的「策略模式」。

**展开**：切换方式：独立使用时 `factory.openSession(ExecutorType.BATCH)`；Spring 环境下配置 `mybatis.executor-type=batch` 或用 `SqlSessionTemplate` 单独开 BATCH 会话。二级缓存不是独立执行器，而是 `CachingExecutor` 装饰器。
:::

### 5. 四大对象：StatementHandler / ParameterHandler / ResultSetHandler / TypeHandler

#### 5.1 StatementHandler 体系

```text
                    StatementHandler（接口）
                           │
                RoutingStatementHandler（路由，按 statementType 分派）
                    │          │
        ┌───────────┼──────────────────┐
        │           │                  │
SimpleStatementHandler  PreparedStatementHandler  CallableStatementHandler
 （无参 Statement）       （预编译，最常用）          （存储过程）
```

`RoutingStatementHandler` 的构造器根据 `MappedStatement.getStatementType()` 决定用哪个实现，默认是 `PreparedStatementHandler`（对应 `#{}` 预编译）。

#### 5.2 ParameterHandler：参数绑定

```java
// DefaultParameterHandler.setParameters 的简化流程
public void setParameters(PreparedStatement ps) {
    List<ParameterMapping> parameterMappings = boundSql.getParameterMappings();
    for (int i = 0; i < parameterMappings.size(); i++) {
        ParameterMapping pm = parameterMappings.get(i);
        // 根据参数类型找到对应的 TypeHandler，完成 Java → JDBC 的转换
        TypeHandler typeHandler = pm.getTypeHandler();
        typeHandler.setParameter(ps, i + 1, value, jdbcType);
    }
}
```

#### 5.3 ResultSetHandler：结果映射

`DefaultResultSetHandler` 负责把 `ResultSet` 映射成目标对象，核心流程：

```text
handleResultSets()
   │ 遍历每个 ResultSet
   ▼
handleRowValues()
   │ 按行处理（嵌套结果 / 简单结果两种策略）
   ▼
getRowValue()
   │ 创建目标对象（ObjectFactory）
   ▼
applyAutomaticMappings()  ← 自动映射：列名/驼峰 → 属性名
   │ 或 applyPropertyMappings() ← 显式映射：按 resultMap 的定义
   ▼
返回对象集合
```

#### 5.4 TypeHandler：类型转换的基石

`TypeHandler` 是 MyBatis 里最不起眼但无处不在的组件，`#{}` 设参、`resultType` 取值都靠它。内置了 `IntegerTypeHandler`、`StringTypeHandler`、`DateTypeHandler` 等几十种。

```java
// StringTypeHandler 的简化实现，说明「设参/取值」双向转换
public class StringTypeHandler extends BaseTypeHandler<String> {
    public void setNonNullParameter(PreparedStatement ps, int i, String parameter, JdbcType jt)
            throws SQLException {
        ps.setString(i, parameter); // 写入：Java String → JDBC String
    }
    public String getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return rs.getString(columnName); // 读取：JDBC String → Java String
    }
    // ... 其余重载
}
```

### 6. 一级缓存原理（源码级）

一级缓存是「SqlSession 级别」的缓存，默认开启、无法全局关闭。

```text
一级缓存的内存结构：

  BaseExecutor
     └── localCache：PerpetualCache
                       └── cache：HashMap<CacheKey, Object>
                                     │
                              key 是 CacheKey 对象
```

```java
// BaseExecutor.query 的简化流程：一级缓存的读写都在这里
public <E> List<E> query(MappedStatement ms, Object parameter, RowBounds rowBounds,
                         ResultHandler resultHandler, CacheKey key, BoundSql boundSql) {
    // 1. 用 statementId + SQL + 参数 构造 CacheKey
    if (queryStack == 0 && ms.isFlushCacheRequired()) {
        clearLocalCache(); // 这条 SQL 配置了 flushCache=true，先清缓存
    }
    List<E> list;
    // 2. 先查一级缓存
    list = resultHandler == null ? (List<E>) localCache.getObject(key) : null;
    if (list != null) {
        return list; // 命中，直接返回，不发 SQL
    }
    // 3. 未命中，真正查库
    list = queryFromDatabase(ms, parameter, rowBounds, resultHandler, key, boundSql);
    return list;
}
```

```text
CacheKey 的构成（为什么能精确区分「同一条查询」）：

  CacheKey 由这几部分依次算 hash 得到：
   1. statementId        —— 是哪个 SQL（namespace.id）
   2. offset / limit     —— 分页范围（RowBounds）
   3. boundSql.getSql()  —— SQL 文本本身
   4. 每个参数的值        —— 参数不同 → 缓存不同
```

一级缓存的失效（清空）时机：

| 时机 | 触发点 | 原因 |
| --- | --- | --- |
| 执行 `insert/update/delete` | `BaseExecutor.update` 里 `clearLocalCache()` | 写操作后旧数据已失效 |
| 执行 `commit` / `rollback` | 提交/回滚时清空 | 会话边界结束 |
| 关闭 `SqlSession` | `close()` | 缓存随会话销毁 |
| `localCacheScope=STATEMENT` | 每次查询后清空 | 手动禁用一级缓存 |

```java
// BaseExecutor.update 里清空一级缓存（源码简化）
public int update(MappedStatement ms, Object parameter) {
    clearLocalCache(); // 为什么任何增删改都清空缓存：避免读到自己刚写之前的脏数据
    return doUpdate(ms, parameter);
}
```

::: tip 💡 面试题：MyBatis 一级缓存什么时候会读到脏数据？
**结论**：同一 `SqlSession` 内，两次查询之间若数据被「其他进程/会话」修改，第二次查询仍会命中本地缓存返回旧值。

**原因**：一级缓存是进程内存里的 HashMap，它无法感知数据库被别的连接改动了；只要本会话没执行过「写操作」或「commit/rollback」，缓存就不会失效，于是返回陈旧数据。

**展开**：所以一级缓存只在「同一会话内、无外部写入」的前提下才安全；在需要严格一致性的读场景，可设 `localCacheScope=STATEMENT` 禁用，或每次查询前 `clearCache()`。
:::

### 7. 二级缓存原理（源码级）

二级缓存是「namespace（Mapper）级别」的跨会话缓存，默认关闭，需 `<cache/>` 开启。

```text
二级缓存的结构（装饰器模式层层包裹）：

  <cache/> 配置后，每个 namespace 生成一个 Cache，实际是装饰器嵌套：
  
  SynchronizedCache（加锁）
       │ 包着
  LoggingCache（记录命中率日志）
       │ 包着
  SerializedCache（序列化）
       │ 包着
  LruCache（LRU 淘汰策略）
       │ 包着
  PerpetualCache（最底层：HashMap 存储）
```

```java
// CachingExecutor.query 的简化流程：二级缓存的读写
public <E> List<E> query(MappedStatement ms, Object parameter, RowBounds rowBounds,
                         ResultHandler resultHandler, CacheKey key, BoundSql boundSql) {
    Cache cache = ms.getCache(); // 取当前 namespace 的二级缓存
    if (cache != null) {
        flushCacheIfRequired(ms); // 配置了 flushCache 则先清
        List<E> list = (List<E>) tcm.getObject(cache, key); // 先查二级缓存
        if (list == null) {
            // 未命中 → 委派给真正的 Executor（内部走一级缓存 + 查库）
            list = delegate.query(ms, parameter, rowBounds, resultHandler, key, boundSql);
            tcm.putObject(cache, key, list); // 查完写回二级缓存
        }
        return list;
    }
    return delegate.query(...); // 没开二级缓存，直接委派
}
```

二级缓存与一级缓存的对比：

| 对比项 | 一级缓存 | 二级缓存 |
| --- | --- | --- |
| 作用范围 | `SqlSession` 级别 | `namespace`（Mapper）级别 |
| 默认开启 | ✅ 是，无法全局关闭 | ❌ 否，需 `<cache/>` 配置 |
| 存储位置 | `BaseExecutor.localCache` | `MappedStatement.cache` |
| 跨会话共享 | ❌ 不共享 | ✅ 共享 |
| 失效 | 增删改 / commit / close 时清空 | 提交事务时才写入，更新后需手动清 |
| 典型风险 | 同会话读到外部修改的旧值 | 多会话脏读、缓存与库不一致 |

```xml
<!-- 二级缓存开启与配置 -->
<cache
    eviction="LRU"        <!-- 淘汰策略：LRU/FIFO/SOFT/WEAK -->
    flushInterval="60000" <!-- 刷新间隔（毫秒） -->
    size="512"            <!-- 最多缓存对象数 -->
    readOnly="false"/>    <!-- readOnly=true 返回引用（性能好但可能被改）；false 返回拷贝（安全） -->
```

::: tip 💡 面试题：为什么 MyBatis 二级缓存容易脏读，生产环境为何少用？
**结论**：二级缓存是 namespace 级、跨会话共享的本地缓存，无法感知其他进程/其他 namespace 对同一张表的修改，导致缓存与数据库不一致。

**原因**：二级缓存的失效粒度是「单个 namespace 的写操作」，如果 A Mapper 改了 `user` 表，而 B Mapper 的二级缓存里也缓存了 `user` 表数据，B 的缓存不会自动失效，就会返回旧值；跨进程（多实例部署）更是完全失效。

**展开**：二级缓存的正确使用前提是「单机、单表被单个 namespace 独占、极少写」，一旦多表关联或多服务实例部署就很容易出错。所以多数团队对读一致性要求高的场景直接关掉二级缓存，改用 Redis 这类集中式缓存。
:::

### 8. 插件原理（拦截器 + 责任链 + 动态代理）

插件是 MyBatis 的扩展点，底层是「拦截器链 + JDK 动态代理」。理解它，就能理解 PageHelper 分页插件、乐观锁插件等一切插件。

```text
插件可拦截的四大对象（@Signature 的 type 只能填这四类）：

  1. Executor          —— 拦截查询/更新/提交（分页插件、慢 SQL 插件拦这里）
  2. StatementHandler  —— 拦截 SQL 的创建/执行（改写 SQL、加密插件拦这里）
  3. ParameterHandler  —— 拦截参数设置（脱敏插件拦这里）
  4. ResultSetHandler  —— 拦截结果集映射（结果加密插件拦这里）
```

```java
// InterceptorChain.pluginAll：给目标对象套上所有拦截器（源码简化）
public Object pluginAll(Object target) {
    for (Interceptor interceptor : interceptors) {
        target = interceptor.plugin(target); // 每经过一个插件，就多包一层代理
    }
    return target;
}
```

```java
// Plugin.wrap：核心就是 JDK 动态代理（源码简化）
public static Object wrap(Object target, Interceptor interceptor) {
    // 拿到插件 @Signature 声明的拦截点（类 + 方法 + 参数类型）
    Map<Class<?>, Set<Method>> signatureMap = getSignatureMap(interceptor);
    Class<?> type = target.getClass();
    // 取目标类实现的接口里、被 @Signature 命中的那些接口
    Class<?>[] interfaces = getAllInterfaces(type, signatureMap);
    if (interfaces.length > 0) {
        // 为什么用 Proxy.newProxyInstance：给目标对象生成代理，只有命中的方法才被拦截
        return Proxy.newProxyInstance(
                type.getClassLoader(), interfaces,
                new Plugin(target, interceptor, signatureMap));
    }
    return target;
}
```

```java
// Plugin.invoke：命中则走拦截器，未命中则放行（源码简化）
public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
    Set<Method> methods = signatureMap.get(method.getDeclaringClass());
    if (methods != null && methods.contains(method)) {
        // 命中：包装成 Invocation 交给拦截器，拦截器里调 proceed() 继续往下走
        return interceptor.intercept(new Invocation(target, method, args));
    }
    return method.invoke(target, args); // 未命中：直接放行
}
```

```text
插件的「责任链」是怎么串起来的：

  Executor 原始对象
      │ pluginAll 里逐个包代理
      ▼
  Plugin1 代理 ──► intercept() ──► invocation.proceed() ──► 下一个
      ▼
  Plugin2 代理 ──► intercept() ──► invocation.proceed() ──► 下一个
      ▼
  真实 Executor 方法执行
```

::: tip 💡 面试题：MyBatis 插件的原理是什么？
**结论**：插件 = 「拦截器链 + JDK 动态代理」，只能拦截 Executor、StatementHandler、ParameterHandler、ResultSetHandler 四大对象。

**原因**：`Configuration` 里维护一个 `InterceptorChain`，构建四大对象后统一调用 `pluginAll(target)`，为每个对象依次包上插件代理；`Plugin` 实现了 `InvocationHandler`，用 `@Intercepts` 声明的签名判断哪些方法要拦截，命中就走 `interceptor.intercept()`，通过 `invocation.proceed()` 形成责任链往下传递。

**展开**：PageHelper 分页插件正是拦截 `Executor.query`，从 `ThreadLocal` 取出分页参数、改写 `BoundSql` 追加 `LIMIT`。插件设计运用了**代理模式 + 责任链模式**，是 MyBatis 可扩展性的关键。
:::

### 9. 延迟加载原理（结果代理）

高级篇已经演示了用法，这里落到源码：延迟加载靠「结果对象属性被替换成代理」实现。

```text
延迟加载的机制：

  查询 user（不查 orders）
        │
        ▼
  ResultSetHandler 发现 orders 属性配置了 lazy（association/collection 有 select）
        │
        ▼
  用 ProxyFactory（默认 Javassist）生成代理对象，替代真实的 List<Order>
        │ 代理内部持有：ResultLoader + 待加载参数 + Configuration
        ▼
  user.getOrders() 被调用
        │
        ▼
  代理拦截 → 触发 ResultLoader.loadResult() → 执行子查询 → 填充真实数据
```

```java
// 关键配置
<settings>
    <setting name="lazyLoadingEnabled" value="true"/>   // 总开关
    <setting name="aggressiveLazyLoading" value="false"/> // false 才是「按需加载」
</settings>
```

::: tip 💡 面试题：MyBatis 延迟加载是怎么实现的？
**结论**：MyBatis 把需要懒加载的关联属性替换成代理对象，第一次访问该属性时才触发子查询并填充真实数据。

**原因**：`ResultLoaderMap` 记录哪些属性尚未加载；代理拦截到 `getOrders()` 后，调用 `ResultLoader.loadResult()` 执行 `select` 指向的子查询，拿到结果后替换掉代理，之后访问就直接返回真实数据。

**展开**：懒加载要求 `SqlSession` 在触发子查询时仍然存活，否则报 `SqlSession was already closed`；Spring 集成下需要用事务/`SqlSessionTemplate` 保证会话贯穿整个访问期，这也是延迟加载在 Spring 里常踩的坑。
:::

### 10. 设计模式总结

MyBatis 源码里到处都是经典设计模式，面试常问「MyBatis 用了哪些设计模式」：

| 设计模式 | 在 MyBatis 中的体现 |
| --- | --- |
| 建造者模式 | `SqlSessionFactoryBuilder` 一步步构建 `Configuration` / `SqlSessionFactory` |
| 工厂模式 | `SqlSessionFactory` 生产 `SqlSession`；`ObjectFactory` 生产 POJO |
| 动态代理模式 | `MapperProxy`、`Plugin` 都是 `InvocationHandler` 实现 |
| 装饰器模式 | `CachingExecutor` 装饰 `Executor`；二级缓存多层 `Cache` 装饰 |
| 策略模式 | `Executor` 三种实现、`StatementHandler` 三种实现 |
| 模板方法模式 | `BaseExecutor` 定义骨架（缓存/事务），子类实现 `doQuery`/`doUpdate` |
| 责任链模式 | `InterceptorChain` + `pluginAll` 串联插件 |
| 适配器模式 | `Log` 接口对 log4j/slf4j 等的适配 |
| 注册表模式 | `TypeHandlerRegistry`、`TypeAliasRegistry`、`MapperRegistry` |

```text
模板方法模式在 BaseExecutor 里的体现：

  BaseExecutor.query()（模板方法：定义「先查缓存、未命中再查库」的骨架）
       │
       ├── 查一级缓存（固定步骤）
       ├── 未命中 → queryFromDatabase()（固定步骤）
       │                │
       │                └── doQuery()（抽象方法，由子类实现）
       │                       │
       │              ┌────────┼──────────┐
       │              │        │          │
       │         Simple    Reuse      Batch
       │         Executor  Executor   Executor  ← 各自实现 doQuery
```

::: tip 💡 面试题：MyBatis 用了哪些设计模式？
**结论**：至少九种——建造者、工厂、动态代理、装饰器、策略、模板方法、责任链、适配器、注册表。

**原因**：MyBatis 的核心扩展点都靠设计模式支撑：Mapper 代理和插件靠「动态代理」，Executor/StatementHandler 的可替换性靠「策略模式 + 模板方法」，二级缓存和 CachingExecutor 靠「装饰器」，插件串联靠「责任链」。

**展开**：面试时不必全部背出，挑三个讲透即可——「动态代理（Mapper 怎么被执行）、装饰器（二级缓存/CachingExecutor）、模板方法（BaseExecutor 骨架）」是含金量最高的三个。
:::

---

## 面试常问

**1. MyBatis 是 ORM 吗？**
结论：是「半自动 ORM」——结果映射和参数绑定自动，但 SQL 要自己写。全自动 ORM（Hibernate）连 SQL 都生成，MyBatis 只做「参数绑定 + 结果映射」两件体力活，把 SQL 编写权留给开发者，换取可控性和性能。

**2. `#{}` 和 `${}` 的区别？**
结论：`#{}` 是预编译占位符、能防 SQL 注入；`${}` 是字符串拼接、有注入风险。传值一律用 `#{}`，只有表名/列名/排序字段这类占位符替代不了标识符的场景才用 `${}`，且必须白名单校验。

**3. Mapper 接口没有实现类，为什么能执行 SQL？**
结论：MyBatis 用 JDK 动态代理为 Mapper 接口生成代理对象。`MapperProxy` 拦截方法调用，用「接口全限定名 + 方法名」定位到 `MappedStatement`，再交给 `SqlSession` 执行，形成「调方法 = 执行 SQL」的闭环。

**4. 一级缓存和二级缓存的区别？**
结论：一级是 `SqlSession` 级、默认开启、无法全局关闭；二级是 `namespace` 级、默认关闭且可能脏读。一级缓存在同会话增删改/commit 时清空；二级跨会话共享，但无法感知其他 namespace 或进程对表的修改，生产环境对一致性要求高的场景通常关掉。

**5. 关联查询的 N+1 问题怎么解决？**
结论：用「嵌套结果」替代「嵌套查询」——一条 JOIN 查全量再拆分，消除 N 次子查询。也可保留嵌套查询但配延迟加载，让子查询按需触发；批量场景可用 `<foreach>` 一次查回再内存分组。

**6. MyBatis 的执行流程（口述链路）？**
结论：读配置构建 `SqlSessionFactory` → 开 `SqlSession` → 拿 `Mapper` 代理 → 定位 `MappedStatement` → `Executor`（先二级缓存再一级缓存）→ 未命中则 `StatementHandler` 建语句、`ParameterHandler` 设参、执行、`ResultSetHandler` 映射结果。这条链路能讲清楚，原理题基本都能串起来。

**7. MyBatis 插件的原理？**
结论：拦截器链 + JDK 动态代理，只能拦截 Executor、StatementHandler、ParameterHandler、ResultSetHandler 四大对象。`InterceptorChain.pluginAll` 给目标对象逐层包代理，命中 `@Signature` 声明的就拦截，`invocation.proceed()` 形成责任链传递（PageHelper 分页插件就是拦 Executor.query 改 SQL）。

**8. 字段名和列名不一致怎么解决？**
结论：开 `mapUnderscoreToCamelCase` 让 `user_name` 自动映射 `userName`，或写 `resultMap` 显式指定 `<id>`/`<result>`。简单场景开驼峰，复杂关联/别名场景用 resultMap。

---

## 相关链接

- [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) —— 在 MyBatis 之上的增强，免写基础 CRUD
- [Spring](/learn_backend/java/基础/Spring) —— 事务与依赖注入的宿主
- [Spring Boot](/learn_backend/java/基础/Spring Boot) —— 自动配置与整合 MyBatis
- [MySQL](/learn_database/MySQL) —— SQL 的来源与优化对象
- [JVM](/learn_backend/java/Java核心/JVM) —— 动态代理、反射、类加载的底层
- [Java集合](/learn_backend/java/Java核心/Java集合) —— 一级缓存底层 HashMap 与 CacheKey 的 hashCode
- [并发编程](/learn_backend/java/Java核心/并发编程) —— 二级缓存多线程脏读的并发根源
- [SQL注入攻击](/learn_408/计算机网络/面试题/SQL注入攻击) —— `${}` 拼接触发的安全漏洞






