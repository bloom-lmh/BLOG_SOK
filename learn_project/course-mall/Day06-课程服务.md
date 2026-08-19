# Day 06 · 课程服务（MyBatis-Plus：CRUD + 分类 + 分页 + 条件查询 + 逻辑删除）

> **今天目标**：新建 `mall-course` 课程服务模块，用 MyBatis-Plus 完成课程的「增删改查 + 分类 + 分页 + 条件查询 + 逻辑删除」——今天是你第一次在项目里接数据库，重点是搞懂 MyBatis-Plus 是怎么「少写 SQL」的。

## 一、前置条件

- 已完成 **Day 01**（Maven 多模块骨架，`mall-common` 里有 `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`）
- 已完成 **Day 02**（`course_mall` 库建好，`course` 表和 `category` 表 + 种子数据已插入）

> ⚠️ 本天所有代码都复用 Day 02 已经建好的表结构，**不要再建新表**。

## 二、今天完成后你会得到什么

```
E:\course-mall\
├─ pom.xml                                    # 改：加 mall-course 模块 + MyBatis-Plus 版本管理
└─ mall-course/                               # 新增：课程服务
   ├─ pom.xml
   └─ src/main/java/com/mall/course/
      ├─ MallCourseApplication.java           # 启动类
      ├─ config/
      │  ├─ MybatisPlusConfig.java            # 分页插件
      │  └─ MyMetaObjectHandler.java          # 自动填充 create_time/update_time
      ├─ entity/Course.java                   # 课程实体（@TableLogic）
      ├─ entity/Category.java                 # 分类实体
      ├─ mapper/CourseMapper.java             # 继承 BaseMapper，零 SQL
      ├─ mapper/CategoryMapper.java
      ├─ service/ + service/impl/             # IService + ServiceImpl
      ├─ dto/CourseQuery.java                 # 分页 + 条件查询入参
      ├─ vo/CategoryTreeVO.java               # 分类树返回对象
      └─ controller/                          # 对外接口
```

## 三、先搞懂：MyBatis-Plus 到底解决了什么

Day 01/02 我们写了 `Result`、建了 11 张表，但**还没写过一条 SQL**。传统 MyBatis 要「手写 XML + 手写 SQL」，一个简单的 `SELECT * FROM course WHERE id = ?` 都要写 5 行 XML。表越多，这种样板越多。

MyBatis-Plus（简称 MP）在 MyBatis 之上做了增强：**只要你的实体类继承 `BaseMapper`，它就自动帮你生成单表的 CRUD**——`selectById`、`insert`、`updateById`、`deleteById` 全都不用自己写。它不改变 MyBatis 底层，只是帮你「生成那些重复的 SQL」。

::: tip 💡 面试题：MyBatis-Plus 和 MyBatis 是什么关系？用 MP 还要不要 MyBatis？
**一句话**：MP 是 MyBatis 的增强框架，底层还是 MyBatis。MP 帮你把**单表**的 CRUD 和条件拼接自动化，但你依然可以在同一个工程里写 MyBatis 的 XML 来搞定**复杂多表 SQL**。所以答案是「都要」——MP 解决重复劳动，MyBatis 解决复杂查询。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) 和 [MyBatis](/learn_backend/java/基础/MyBatis)。
:::

## 四、步骤

### 步骤 1：父工程 `pom.xml` 加模块 + 版本管理

打开 `E:\course-mall\pom.xml`，做两处修改：

**① `<modules>` 里加 `mall-course`：**

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-course</module>   <!-- 新增 -->
</modules>
```

**② `<properties>` 加 MP 版本、`<dependencyManagement>` 加 MP 依赖：**

```xml
<properties>
    <java.version>17</java.version>
    <mybatis-plus.version>3.5.7</mybatis-plus.version>   <!-- 新增：MP 版本统一管 -->
</properties>

<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
            <version>${project.version}</version>
        </dependency>
        <!-- 新增：MP 版本在父工程统一管，子模块引用时不用写版本号 -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
            <version>${mybatis-plus.version}</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

> 为什么用 `mybatis-plus-spring-boot3-starter`？因为本项目是 Spring Boot 3.x，MP 针对 Spring Boot 3 单独出了这个 starter（旧的 `mybatis-plus-boot-starter` 是给 Spring Boot 2 用的，不兼容）。

### 步骤 2：新建 `mall-course` 模块 `pom.xml`

创建 `E:\course-mall\mall-course\pom.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.mall</groupId>
        <artifactId>course-mall</artifactId>
        <version>1.0.0</version>
    </parent>

    <artifactId>mall-course</artifactId>

    <dependencies>
        <!-- 复用 Day01 的 Result/ErrorCode/全局异常 -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <!-- MyBatis-Plus（Spring Boot 3 专用 starter）：版本由父工程管，不写 -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
        </dependency>
        <!-- MySQL 驱动：runtime 表示只在运行时需要，编译期不用 -->
        <dependency>
            <groupId>com.mysql</groupId>
            <artifactId>mysql-connector-j</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <optional>true</optional>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

::: tip 💡 面试题：`mysql-connector-j` 的 `<scope>runtime</scope>` 是什么意思？
**一句话**：`runtime` 表示「编译阶段不需要、运行时才需要」——你的代码里没有 `import com.mysql...`，只是运行时 JDBC 要通过驱动连接数据库，所以只在运行期引入。好处是它不会传递给依赖方、不污染编译期。详见 [Maven](/learn_backend/java/基础/Maven)。
:::

### 步骤 3：`application.yml` 配置数据源 + MP

创建 `E:\course-mall\mall-course\src\main\resources\application.yml`：

```yaml
server:
  port: 8081          # mall-user 占了 8080，课程服务用 8081

spring:
  application:
    name: mall-course
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    # course_mall 是 Day02 建的库；serverTimezone 和 allowPublicKeyRetrieval 是老版本 MySQL 驱动的常见坑
    url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
    username: root
    password: 你的MySQL密码        # ← 改成你自己的

mybatis-plus:
  configuration:
    # 驼峰 ↔ 下划线自动映射：实体 courseId ↔ 表字段 course_id（默认就是 true，写出来让你知道）
    map-underscore-to-camel-case: true
    # 控制台打印 SQL，开发期看 MP 到底生成了什么 SQL，调试完可以关掉
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl
  global-config:
    db-config:
      # 逻辑删除全局配置：告诉 MP「deleted 字段 = 逻辑删除标记」
      logic-delete-field: deleted   # 实体里叫 deleted 的字段
      logic-delete-value: 1         # 删除后置为 1
      logic-not-delete-value: 0     # 未删除是 0
```

### 步骤 4：启动类 + MP 配置类

启动类 `E:\course-mall\mall-course\src\main\java\com\mall\course\MallCourseApplication.java`：

```java
package com.mall.course;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// scanBasePackages = "com.mall"：和 Day01 一样，扫到 mall-common 的全局异常处理器
// @MapperScan：把 mapper 接口交给 MyBatis 生成代理实现（否则每个 Mapper 都要写 @Mapper 注解）
@SpringBootApplication(scanBasePackages = "com.mall")
@MapperScan("com.mall.course.mapper")
public class MallCourseApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallCourseApplication.class, args);
    }
}
```

分页插件配置 `E:\course-mall\mall-course\src\main\java\com\mall\course\config\MybatisPlusConfig.java`：

```java
package com.mall.course.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MybatisPlusConfig {

    // 分页不是 MP 的「默认能力」，必须手动注册这个拦截器才会生效
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        // PaginationInnerInterceptor 负责在 SQL 后面拼 LIMIT，并额外执行一条 count 查询
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}
```

自动填充配置 `E:\course-mall\mall-course\src\main\java\com\mall\course\config\MyMetaObjectHandler.java`：

```java
package com.mall.course.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

// 自动填充：insert 时自动塞 create_time/update_time，update 时自动塞 update_time
// 这样业务代码里就不用每次手动 set 时间了
@Component
public class MyMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        // strictInsertFill 只在「字段为 null」时才填充，不会覆盖你显式传入的值
        this.strictInsertFill(metaObject, "createTime", LocalDateTime.class, LocalDateTime.now());
        this.strictInsertFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        this.strictUpdateFill(metaObject, "updateTime", LocalDateTime.class, LocalDateTime.now());
    }
}
```

::: tip 💡 面试题：MyBatis-Plus 的分页为什么必须手动配 `PaginationInnerInterceptor`？
**一句话**：MP 的分页是「插件式」的，不注册拦截器就不生效——因为分页本质是拦截到你的 SQL 后干两件事：① 额外执行一条 `SELECT COUNT(*)` 拿总条数；② 在原 SQL 末尾拼 `LIMIT offset, size`。你没配插件，`page()` 拿到的就是全量数据而不是一页。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 5：课程实体 `Course.java`

创建 `E:\course-mall\mall-course\src\main\java\com\mall\course\entity\Course.java`：

```java
package com.mall.course.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
// @TableName：实体 ↔ 表名映射。表名和类名不叫 course 时（比如加前缀 t_course）必须写
@TableName("course")
public class Course {

    // @TableId(type = IdType.AUTO)：主键策略 = 数据库自增。
    // 后面 Day24 分库分表时，自增会重复，要改成 IdType.ASSIGN_ID（雪花算法）
    @TableId(type = IdType.AUTO)
    private Long id;

    private Long teacherId;        // 逻辑外键 → teacher.id（Day07 做关联查询）
    private Long categoryId;       // 逻辑外键 → category.id

    private String title;
    private String cover;

    // 金额字段用 BigDecimal：呼应 Day02 的 DECIMAL(10,2)。
    // 用 double/float 会精度丢失，钱相关的字段永远用 BigDecimal
    private BigDecimal price;
    private BigDecimal originalPrice;

    private String description;    // TEXT 长文本，用 String 接收即可
    private Integer status;        // 1上架 0下架
    private Integer viewCount;     // 浏览量
    private Integer buyCount;      // 购买量

    // @TableLogic：逻辑删除标记字段。声明后，MP 的 delete 会变成 update deleted=1，
    // 所有的 select 会自动拼上 where deleted=0（详见下面面试题）
    @TableLogic
    private Integer deleted;

    // fill = FieldFill.INSERT：insert 时由 MyMetaObjectHandler 自动填充
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // fill = FieldFill.INSERT_UPDATE：insert 和 update 时都填充
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
```

::: tip 💡 面试题：`@TableLogic` 逻辑删除的底层原理是什么？
**一句话**：声明 `@TableLogic` 后，MP 会把你调的 `deleteById` **改写成 `UPDATE course SET deleted=1 WHERE id=?`**（不是真删），并在你后续所有 `select` 的 WHERE 里**自动拼上 `deleted=0`**，让你「查不到已删的」。所以逻辑删除 = 「假删 + 查询自动过滤」。**但注意**：这个自动过滤只对 MP 生成的 SQL 生效，你自己手写的 XML 里写 `SELECT * FROM course` 不会自动加 `deleted=0`，得手动拼。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 6：`CourseMapper` —— 零 SQL 拿到全套 CRUD

创建 `E:\course-mall\mall-course\src\main\java\com\mall\course\mapper\CourseMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Course;

// 继承 BaseMapper<Course> 后，selectById/insert/updateById/deleteById 等十几个方法自动就有了
// 这就是「少写 SQL」的核心：单表 CRUD 全部免费
public interface CourseMapper extends BaseMapper<Course> {
    // 复杂多表查询（Day07 的讲师关联）可以在这里自定义方法 + XML
}
```

### 步骤 7：`CourseService` + `CourseServiceImpl`

接口 `E:\course-mall\mall-course\src\main\java\com\mall\course\service\CourseService.java`：

```java
package com.mall.course.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.mall.course.entity.Course;

// IService 是 Service 层的增强接口，在 BaseMapper 之上又包了一层，
// 提供 save/updateById/removeById/page 等更「业务化」的方法
public interface CourseService extends IService<Course> {
}
```

实现类 `E:\course-mall\mall-course\src\main\java\com\mall\course\service\impl\CourseServiceImpl.java`：

```java
package com.mall.course.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mall.course.entity.Course;
import com.mall.course.mapper.CourseMapper;
import com.mall.course.service.CourseService;
import org.springframework.stereotype.Service;

// ServiceImpl<CourseMapper, Course>：泛型第一个是 Mapper，第二个是实体。
// 继承后，this.list() / this.page() / this.getById() 等方法直接用
@Service
public class CourseServiceImpl extends ServiceImpl<CourseMapper, Course> implements CourseService {
}
```

::: tip 💡 面试题：为什么 MP 要分 `BaseMapper`（Mapper 层）和 `IService`（Service 层）两层？只用 Mapper 不行吗？
**一句话**：两层职责不同。`BaseMapper` 是**贴近 SQL 的原子操作**（selectById、insert）；`IService` 在其上封装了**带业务语义的批量/链式操作**（saveBatch 批量插入、getOne、page 分页、还有事务相关的 saveOrUpdate）。小项目只用 Mapper 也行，但分层能让你在 Service 层做事务、批量等扩展而不污染 Mapper。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 8：分页入参 DTO + 课程 Controller

分页/条件查询入参 `E:\course-mall\mall-course\src\main\java\com\mall\course\dto\CourseQuery.java`：

```java
package com.mall.course.dto;

import lombok.Data;

import java.math.BigDecimal;

// 查询条件对象：把「分页 + 筛选条件」打包成一个入参，而不是 Controller 里写一堆 @RequestParam
@Data
public class CourseQuery {
    private long pageNum = 1;       // 页码，默认第 1 页
    private long pageSize = 10;     // 每页条数，默认 10
    private String title;           // 标题（模糊匹配）
    private Long categoryId;        // 分类（精确匹配）
    private Integer status;         // 状态：1上架 0下架
    private BigDecimal minPrice;    // 最低价
    private BigDecimal maxPrice;    // 最高价
}
```

Controller `E:\course-mall\mall-course\src\main\java\com\mall\course\controller\CourseController.java`：

```java
package com.mall.course.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mall.common.result.Result;
import com.mall.course.dto.CourseQuery;
import com.mall.course.entity.Course;
import com.mall.course.service.CourseService;
import org.springframework.web.bind.annotation.*;

// 复用 Day01 的 Result，返回统一 JSON 结构
@RestController
@RequestMapping("/api/course")
public class CourseController {

    private final CourseService courseService;

    // 构造器注入：Spring 推荐的方式，字段不可变 + 便于单测
    public CourseController(CourseService courseService) {
        this.courseService = courseService;
    }

    // 1. 新增课程
    @PostMapping
    public Result<Course> save(@RequestBody Course course) {
        // save() 会自动塞 createTime/updateTime（步骤 4 的填充器），然后 insert
        courseService.save(course);
        return Result.ok(course);
    }

    // 2. 按 ID 查询
    @GetMapping("/{id}")
    public Result<Course> getById(@PathVariable Long id) {
        // 因为 @TableLogic，这个 getById 生成的 SQL 会自动带 where deleted=0
        return Result.ok(courseService.getById(id));
    }

    // 3. 更新课程
    @PutMapping
    public Result<Void> update(@RequestBody Course course) {
        // updateById 只更新非 null 字段；updateTime 自动刷新
        courseService.updateById(course);
        return Result.ok();
    }

    // 4. 删除课程（逻辑删除！）
    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable Long id) {
        // 因为 @TableLogic，这行实际执行的是 UPDATE course SET deleted=1 WHERE id=?
        courseService.removeById(id);
        return Result.ok();
    }

    // 5. 条件分页查询（今天最核心的接口）
    @GetMapping("/page")
    public Result<Page<Course>> page(CourseQuery query) {
        // LambdaQueryWrapper：用「方法引用」拼条件，避免手写列名字符串
        LambdaQueryWrapper<Course> wrapper = new LambdaQueryWrapper<>();

        // 第一个参数是 boolean 条件：条件不成立（值为 null）时，这个条件不参与拼接
        wrapper.like(query.getTitle() != null, Course::getTitle, query.getTitle())        // title like '%xx%'
               .eq(query.getCategoryId() != null, Course::getCategoryId, query.getCategoryId()) // category_id = ?
               .eq(query.getStatus() != null, Course::getStatus, query.getStatus())      // status = ?
               .ge(query.getMinPrice() != null, Course::getPrice, query.getMinPrice())   // price >= ?
               .le(query.getMaxPrice() != null, Course::getPrice, query.getMaxPrice())   // price <= ?
               .orderByDesc(Course::getCreateTime);                                       // 按创建时间倒序

        // page(new Page<>(页码, 每页数), wrapper)：执行 count + limit 两条 SQL
        Page<Course> page = courseService.page(new Page<>(query.getPageNum(), query.getPageSize()), wrapper);
        return Result.ok(page);
    }
}
```

::: tip 💡 面试题：`LambdaQueryWrapper` 和 `QueryWrapper` 有什么区别？为什么推荐用 Lambda 的？
**一句话**：`QueryWrapper` 靠**字符串**写列名（`wrapper.eq("category_id", 1)`），列名写错编译器发现不了，改表字段名时也要全局搜字符串；`LambdaQueryWrapper` 靠**方法引用**写列名（`wrapper.eq(Course::getCategoryId, 1)`），编译器能检查字段是否存在，重构改字段名时 IDE 一起改，**类型安全**。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

::: tip 💡 面试题：`wrapper.eq(condition, ...)` 里第一个 `boolean` 参数是干什么的？
**一句话**：它是「条件是否拼接」的开关。当 `query.getCategoryId() == null`（前端没传这个筛选条件）时，`eq` 这条条件就直接跳过，不会生成 `WHERE category_id = null` 这种错误 SQL。这样你就不用写一堆 `if (xx != null) { wrapper.eq(...) }` 了，代码更简洁。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 9：分类 `Category`（list + 树形）

课程分类是「自关联」表（`parent_id` 指向自己的 `id`，见 Day02），今天做两个接口：平铺列表（课程表单下拉用）+ 树形（后台菜单用）。

实体 `E:\course-mall\mall-course\src\main\java\com\mall\course\entity\Category.java`：

```java
package com.mall.course.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("category")
public class Category {
    @TableId(type = IdType.AUTO)
    private Long id;

    private Long parentId;      // 父分类 ID，0 表示顶级分类（自关联）
    private String name;
    private Integer sort;       // 排序值，越小越靠前

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    // 注意：category 表没有 deleted 字段（Day02 设计），所以这里不写 @TableLogic
}
```

Mapper `E:\course-mall\mall-course\src\main\java\com\mall\course\mapper\CategoryMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Category;

public interface CategoryMapper extends BaseMapper<Category> {
}
```

Service 接口 `E:\course-mall\mall-course\src\main\java\com\mall\course\service\CategoryService.java`：

```java
package com.mall.course.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.mall.course.entity.Category;
import com.mall.course.vo.CategoryTreeVO;

import java.util.List;

public interface CategoryService extends IService<Category> {
    // 自定义方法：把平铺的分类列表组装成树（IService 里没有，需要自己写）
    List<CategoryTreeVO> tree();
}
```

Service 实现 `E:\course-mall\mall-course\src\main\java\com\mall\course\service\impl\CategoryServiceImpl.java`：

```java
package com.mall.course.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mall.course.entity.Category;
import com.mall.course.mapper.CategoryMapper;
import com.mall.course.service.CategoryService;
import com.mall.course.vo.CategoryTreeVO;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class CategoryServiceImpl extends ServiceImpl<CategoryMapper, Category> implements CategoryService {

    @Override
    public List<CategoryTreeVO> tree() {
        // list() 是 ServiceImpl 继承来的，等价于 SELECT * FROM category
        List<Category> all = this.list();

        // 第一步：把每个分类转成 VO，放进 map（key = id），方便 O(1) 找到父节点
        Map<Long, CategoryTreeVO> map = new HashMap<>();
        for (Category c : all) {
            CategoryTreeVO vo = new CategoryTreeVO();
            vo.setId(c.getId());
            vo.setParentId(c.getParentId());
            vo.setName(c.getName());
            vo.setSort(c.getSort());
            map.put(c.getId(), vo);
        }

        // 第二步：遍历，parentId == 0 的进根列表，否则挂到父节点的 children 下
        List<CategoryTreeVO> roots = new ArrayList<>();
        for (Category c : all) {
            CategoryTreeVO vo = map.get(c.getId());
            if (c.getParentId() == 0) {
                roots.add(vo);                       // 顶级分类
            } else {
                CategoryTreeVO parent = map.get(c.getParentId());
                if (parent != null) {                // 父节点可能被删，判空防 NPE
                    parent.getChildren().add(vo);
                }
            }
        }
        return roots;
    }
}
```

树返回对象 `E:\course-mall\mall-course\src\main\java\com\mall\course\vo\CategoryTreeVO.java`：

```java
package com.mall.course.vo;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class CategoryTreeVO {
    private Long id;
    private Long parentId;
    private String name;
    private Integer sort;
    // children：子分类列表，new 一个空列表避免前端拿到 null
    private List<CategoryTreeVO> children = new ArrayList<>();
}
```

Controller `E:\course-mall\mall-course\src\main\java\com\mall\course\controller\CategoryController.java`：

```java
package com.mall.course.controller;

import com.mall.common.result.Result;
import com.mall.course.entity.Category;
import com.mall.course.service.CategoryService;
import com.mall.course.vo.CategoryTreeVO;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/category")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    // 平铺列表：课程表单的「分类下拉框」用
    @GetMapping("/list")
    public Result<List<Category>> list() {
        return Result.ok(categoryService.list());
    }

    // 树形结构：后台的分类管理菜单用
    @GetMapping("/tree")
    public Result<List<CategoryTreeVO>> tree() {
        return Result.ok(categoryService.tree());
    }
}
```

::: tip 💡 面试题：分类表用 `parent_id` 自关联，怎么把平铺列表转成树？为什么不用递归？
**一句话**：核心是「两遍遍历 + HashMap 索引」——第一遍把所有节点按 id 放进 Map，第二遍根据 parentId 挂到父节点 children 下。**不用递归**是因为：递归每找一个父节点都要从头扫一遍列表，复杂度 O(n²)；而 HashMap 查找是 O(1)，整体 O(n)。数据量大时（几万条分类）差距巨大。详见 [Java集合](/learn_backend/java/Java核心/Java集合)。
:::

### 步骤 10：启动验证

在 `E:\course-mall\` 根目录执行：

```bash
mvn clean install -DskipTests            # 编译安装所有模块（含新的 mall-course）
mvn -pl mall-course spring-boot:run      # 启动课程服务（端口 8081）
```

依次用 curl 验证（前提：Day02 的种子数据已插入）：

```bash
# 1. 分页查询（无条件，第 1 页 10 条）
curl "http://localhost:8081/api/course/page"

# 2. 条件查询：标题含"高并发" + 分类 2（Java）
curl "http://localhost:8081/api/course/page?title=高并发&categoryId=2"

# 3. 条件查询：价格区间 100~300
curl "http://localhost:8081/api/course/page?minPrice=100&maxPrice=300"

# 4. 按 ID 查（注意看控制台日志，SQL 里自动带了 deleted=0）
curl "http://localhost:8081/api/course/1"

# 5. 逻辑删除课程 2，然后再次查询，发现查不到了
curl -X DELETE "http://localhost:8081/api/course/2"
curl "http://localhost:8081/api/course/2"      # 预期返回 data 为 null（被逻辑删除过滤掉了）

# 6. 分类树
curl "http://localhost:8081/api/category/tree"
```

重点观察：**第 5 步删除后**，去数据库里 `SELECT * FROM course WHERE id = 2`，会发现这条记录**还在**，只是 `deleted` 变成了 `1`——这就是逻辑删除。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| `BaseMapper` / `IService` / Wrapper / 分页 / `@TableLogic` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| MyBatis 底层、SQL 会话、映射 | [MyBatis](/learn_backend/java/基础/MyBatis) |
| starter 自动装配、`@Configuration` / `@Bean` | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| 构造器注入、Bean 管理 | [Spring](/learn_backend/java/基础/Spring) |
| `HashMap` 组装树、`List` | [Java集合](/learn_backend/java/Java核心/Java集合) |
| `DECIMAL` ↔ `BigDecimal`、索引 | [MySQL](/learn_database/MySQL) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mall-course` 启动成功，`/api/course/page` 返回了课程列表 JSON：是 / 否
- [ ] 逻辑删除跑通（删 id=2 后，库里记录还在、`deleted=1`，接口查不到）：是 / 否
- [ ] 条件查询跑通（title / categoryId / 价格区间任意组合都能筛）：是 / 否
- [ ] 分类树 `/api/category/tree` 返回了父子层级：是 / 否
- [ ] 踩坑记录（数据库连不上、密码、SQL 报错等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. `@TableLogic` 逻辑删除到底怎么实现的？为什么 `removeById` 变成 `UPDATE ... SET deleted=1`，而 `getById` 又自动带上了 `deleted=0`？你自己手写 XML 的 `SELECT * FROM course` 会自动加 `deleted=0` 吗？
2. MyBatis-Plus 的分页为什么必须手动配 `PaginationInnerInterceptor`？它内部做了哪两条 SQL？没配插件会是什么结果？
3. `LambdaQueryWrapper` 和 `QueryWrapper` 有什么区别？为什么推荐用 Lambda 的？`eq(condition, ...)` 第一个 boolean 参数有什么用？
4. 为什么 MP 要分 `BaseMapper`（Mapper）和 `IService`（Service）两层？各自职责是什么？只用 Mapper 能不能完成今天的功能？
5. 金额字段 `price` 在 Java 里为什么用 `BigDecimal` 而不是 `double`？呼应 Day02 的 `DECIMAL(10,2)`，说说用 `double` 会出什么实际问题。
