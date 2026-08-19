# Day 07 · 讲师分类（关联查询 + 一对一/一对多映射）

> **今天目标**：把讲师、分类的关联查询做出来——讲师详情带出他名下的所有课程（一对多）、课程详情带出讲师（一对一）、分类按 `parent_id` 组装成树（自关联）。核心学 MyBatis 的 `resultMap` + `association` / `collection` 关联映射。

## 一、前置条件

- **Day 01**：Maven 多模块骨架 + `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`（今天全部复用，不再重写）
- **Day 02**：11 张表已建，种子数据已插入（`category` 5 条、`teacher` 2 条、`course` 3 条），今天代码只查这 3 张表，**不另建表**
- **Day 06（课程服务）**：已引入 MyBatis-Plus + 数据源。如果你还没做 Day 06，本天「步骤 2」会完整补上 MyBatis-Plus 依赖和数据源配置，保证能**独立跑通**

> ⚠️ 阶段一是「单体」，所有业务先塞在 `mall-user` 一个模块里跑（Day 13 才按领域拆成 `mall-course` 等独立服务）。为了代码清晰，今天的讲师/分类/课程属于「课程域」，统一放 `com.mall.course` 包，和 `com.mall.user` 并列在 `mall-user` 模块下。`scanBasePackages = "com.mall"` 已经覆盖到它。

## 二、先搞懂：什么是「关联映射」，为什么需要它

数据库按范式拆成了多张表（Day 02），但业务查询要「跨表拼数据」。比如讲师详情页要同时显示「讲师信息 + 他名下的课程列表」，数据来自 `teacher` 和 `course` 两张表。

你有两种写法：

| 写法 | 怎么做 | 问题 |
|---|---|---|
| **手写多个查询，Service 里组装** | 查讲师 → 再查课程 → `teacher.setCourses(...)` | 能跑，但每个关联都手写一遍，代码啰嗦 |
| **resultMap 关联映射** | 声明 `resultMap`，用 `association` / `collection` 告诉 MyBatis「这个字段去那张表拿」 | MyBatis 自动组装，声明一次到处复用 |

今天学的就是第二种：**`association` 表示一对一，`collection` 表示一对多**。

::: tip 💡 面试题：MyBatis 里 `association` 和 `collection` 分别映射什么关系？
**一句话**：`association` 映射**一对一**（一个课程对应一个讲师），`collection` 映射**一对多**（一个讲师对应多个课程）。同一对「课程-讲师」关系，从课程看是一对一（association），从讲师看是一对多（collection）。详见 [MyBatis](/learn_backend/java/基础/MyBatis)。
:::

## 三、今天要实现的三个接口

| 接口 | 关联关系 | 用到的映射 |
|---|---|---|
| `GET /api/course/{id}` 课程详情 | 课程 → 讲师（一对一） | `association` |
| `GET /api/teacher/{id}` 讲师详情 | 讲师 → 课程列表（一对多） | `collection` |
| `GET /api/category/tree` 分类树 | 分类 → 子分类（自关联一对多） | 内存递归组装 |

## 四、步骤

### 步骤 1：回顾这 3 张表的关系

```
teacher(讲师)  1 ──── N  course(课程)   N ──── 1  category(分类)
                 teacher_id                category_id

category(分类)  自关联：parent_id 指向自己的 id（0 表示顶级分类）
```

- `course.teacher_id` 是逻辑外键，指向 `teacher.id` —— 一对一（一门课一个讲师）
- 反过来，一个讲师有多门课 —— 一对多
- `category.parent_id` 指向 `category.id` 自己 —— 自关联，构成树

### 步骤 2：引入 MyBatis-Plus + 数据源（Day 06 做了就核对一下）

在 `E:\course-mall\mall-user\pom.xml` 的 `<dependencies>` 里**新增**：

```xml
<!-- MyBatis-Plus：注意是 spring-boot3 专用 starter（不是 mybatis-plus-boot-starter，那是 Boot2 的） -->
<dependency>
    <groupId>com.baomidou</groupId>
    <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
    <version>3.5.7</version>
</dependency>
<!-- MySQL 驱动：版本由 Spring Boot 父工程锁定，不写版本号 -->
<dependency>
    <groupId>com.mysql</groupId>
    <artifactId>mysql-connector-j</artifactId>
</dependency>
```

::: tip 💡 面试题：Spring Boot 3.x 的 MyBatis-Plus 依赖为什么是 `mybatis-plus-spring-boot3-starter`，不是 `mybatis-plus-boot-starter`？
**一句话**：MyBatis-Plus 的自动配置类要匹配 Spring Boot 的版本——Boot 3 用的是 Jakarta EE（`jakarta.servlet`），Boot 2 用的是 `javax.servlet`，两者不兼容，所以分成了两个 starter。选错会报 `ClassNotFoundException: javax/servlet/...`。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

改 `E:\course-mall\mall-user\src\main\resources\application.yml`：

```yaml
server:
  port: 8080

spring:
  application:
    name: mall-user
  datasource:
    driver-class-name: com.mysql.cj.jdbc.Driver
    # serverTimezone 指定时区，否则可能报时区错误；allowPublicKeyRetrieval 允许客户端获取公钥
    url: jdbc:mysql://localhost:3306/course_mall?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai&useSSL=false&allowPublicKeyRetrieval=true
    username: root
    password: 你的密码          # ← 改成你自己的 MySQL root 密码

mybatis-plus:
  mapper-locations: classpath*:mapper/*.xml   # XML 映射文件的位置（步骤 4/5/6 会写这些 XML）
  configuration:
    map-underscore-to-camel-case: true        # 下划线转驼峰：create_time → createTime
    log-impl: org.apache.ibatis.logging.stdout.StdOutImpl   # 打印 SQL，验证「关联查询到底发了几条 SQL」时非常有用
  global-config:
    db-config:
      logic-delete-field: deleted             # 逻辑删除字段名
      logic-delete-value: 1                   # 已删除的值
      logic-not-delete-value: 0               # 未删除的值
```

新建配置类 `E:\course-mall\mall-user\src\main\java\com\mall\course\config\MybatisPlusConfig.java`：

```java
package com.mall.course.config;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

// @MapperScan：扫描这个包下的 Mapper 接口并注册成 Bean。不写的话每个 Mapper 接口都要单独标 @Mapper
@MapperScan("com.mall.course.mapper")
@Configuration
public class MybatisPlusConfig {

    // 分页插件：MyBatis-Plus 的分页是「物理分页」（拼 LIMIT），不装这个插件分页不生效
    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL));
        return interceptor;
    }
}
```

### 步骤 3：实体类（含「非表字段」）

关联查询的结果要装进实体，但关联来的字段（比如课程里的讲师、讲师里的课程列表）**不在本表**，要用 `@TableField(exist = false)` 标成「非表字段」，MyBatis-Plus 才不会在自动生成的 SQL 里带上它。

`E:\course-mall\mall-user\src\main\java\com\mall\course\entity\Teacher.java`：

```java
package com.mall.course.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName("teacher")   // 实体和表名对应
public class Teacher {
    @TableId(type = IdType.AUTO)   // 主键，数据库自增
    private Long id;
    private String name;
    private String avatar;
    private String intro;
    private String position;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    // 非表字段：讲师名下的课程列表（一对多），查询时用 collection 填充
    @TableField(exist = false)
    private List<Course> courses;
}
```

`E:\course-mall\mall-user\src\main\java\com\mall\course\entity\Course.java`：

```java
package com.mall.course.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("course")
public class Course {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long teacherId;
    private Long categoryId;
    private String title;
    private String cover;
    private BigDecimal price;        // 金额用 BigDecimal（Day 02 讲过，不能用 float/double）
    private BigDecimal originalPrice;
    private String description;
    private Integer status;
    private Integer viewCount;
    private Integer buyCount;
    @TableLogic                     // 逻辑删除字段：自动把 delete 变 update deleted=1
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    // 非表字段：课程对应的讲师（一对一），查询时用 association 填充
    @TableField(exist = false)
    private Teacher teacher;
}
```

`E:\course-mall\mall-user\src\main\java\com\mall\course\entity\Category.java`：

```java
package com.mall.course.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName("category")
public class Category {
    @TableId(type = IdType.AUTO)
    private Long id;
    private Long parentId;      // 父分类 ID，0 表示顶级分类
    private String name;
    private Integer sort;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    // 非表字段：子分类列表（自关联一对多），在内存里递归组装
    @TableField(exist = false)
    private List<Category> children;
}
```

### 步骤 4：一对一 `association` —— 课程详情带出讲师

Mapper 接口 `E:\course-mall\mall-user\src\main\java\com\mall\course\mapper\CourseMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Course;
import org.apache.ibatis.annotations.Param;

public interface CourseMapper extends BaseMapper<Course> {

    // 自定义方法：查课程 + 讲师。SQL 写在 CourseMapper.xml（复杂关联 SQL 放 XML，比注解清晰）
    Course selectCourseWithTeacher(@Param("id") Long id);
}
```

XML 映射 `E:\course-mall\mall-user\src\main\resources\mapper\CourseMapper.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.mall.course.mapper.CourseMapper">

    <!-- resultMap：把 JOIN 出来的「平面行」折叠成「Course 里嵌一个 Teacher」的对象结构 -->
    <resultMap id="CourseWithTeacherMap" type="com.mall.course.entity.Course">
        <id property="id" column="id"/>
        <result property="teacherId" column="teacher_id"/>
        <result property="categoryId" column="category_id"/>
        <result property="title" column="title"/>
        <result property="cover" column="cover"/>
        <result property="price" column="price"/>
        <result property="originalPrice" column="original_price"/>
        <result property="description" column="description"/>
        <result property="status" column="status"/>
        <result property="viewCount" column="view_count"/>
        <result property="buyCount" column="buy_count"/>
        <result property="createTime" column="create_time"/>

        <!-- association：一对一。javaType 告诉 MyBatis 这个属性是哪个类 -->
        <association property="teacher" javaType="com.mall.course.entity.Teacher">
            <!-- 注意：teacher.id 直接复用 course 的 teacher_id 列，省一次 JOIN 也不用给 teacher 的 id 起别名 -->
            <id property="id" column="teacher_id"/>
            <result property="name" column="teacher_name"/>
            <result property="position" column="teacher_position"/>
            <result property="avatar" column="teacher_avatar"/>
            <result property="intro" column="teacher_intro"/>
        </association>
    </resultMap>

    <select id="selectCourseWithTeacher" resultMap="CourseWithTeacherMap">
        SELECT
            c.id, c.teacher_id, c.category_id, c.title, c.cover, c.price,
            c.original_price, c.description, c.status, c.view_count, c.buy_count, c.create_time,
            t.name     AS teacher_name,     -- 讲师列加 teacher_ 前缀别名，避免和课程列重名
            t.position AS teacher_position,
            t.avatar   AS teacher_avatar,
            t.intro    AS teacher_intro
        FROM course c
        LEFT JOIN teacher t ON t.id = c.teacher_id   -- LEFT JOIN：讲师可能为 null，也要查出课程
        WHERE c.id = #{id}
          AND c.deleted = 0                          -- 手动过滤逻辑删除（见下方面试题）
    </select>
</mapper>
```

::: tip 💡 面试题：`resultMap` 里 `<id>` 和 `<result>` 有什么区别？
**一句话**：`<id>` 声明主键列，MyBatis 用它判断「两行是不是同一个对象」——一对多查询 JOIN 出多行时，靠 `<id>` 相同的行折叠进同一个对象的 `collection` 里。所以**一对多映射里 `<id>` 必须写对**，写错会把多条数据当成多个对象。详见 [MyBatis](/learn_backend/java/基础/MyBatis)。
:::

::: tip 💡 面试题：为什么自定义 XML 里的 SQL 要手动写 `c.deleted = 0`？
**一句话**：`@TableLogic` 逻辑删除只在 MyBatis-Plus 的**包装器**（`selectList`、`selectPage` 等）生成的 SQL 里自动拼 `deleted=0`；你**手写的 XML SQL 不会自动拼**，不加这行会把已删除的课程也查出来。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 5：一对多 `collection` —— 讲师详情带出课程列表

Mapper 接口 `E:\course-mall\mall-user\src\main\java\com\mall\course\mapper\TeacherMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Teacher;
import org.apache.ibatis.annotations.Param;

public interface TeacherMapper extends BaseMapper<Teacher> {

    // 查讲师 + 他名下的所有课程（一对多）
    Teacher selectTeacherWithCourses(@Param("id") Long id);
}
```

XML 映射 `E:\course-mall\mall-user\src\main\resources\mapper\TeacherMapper.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.mall.course.mapper.TeacherMapper">

    <resultMap id="TeacherWithCoursesMap" type="com.mall.course.entity.Teacher">
        <id property="id" column="id"/>
        <result property="name" column="name"/>
        <result property="position" column="position"/>
        <result property="avatar" column="avatar"/>
        <result property="intro" column="intro"/>

        <!-- collection：一对多。用 ofType 指定集合里装的元素类型（不是 javaType！） -->
        <collection property="courses" ofType="com.mall.course.entity.Course">
            <!-- 课程列都加了 course_ 前缀，避免和讲师的 id/name 等列重名 -->
            <id property="id" column="course_id"/>
            <result property="title" column="course_title"/>
            <result property="cover" column="course_cover"/>
            <result property="price" column="course_price"/>
            <result property="status" column="course_status"/>
        </collection>
    </resultMap>

    <select id="selectTeacherWithCourses" resultMap="TeacherWithCoursesMap">
        SELECT
            t.id, t.name, t.position, t.avatar, t.intro,
            c.id     AS course_id,
            c.title  AS course_title,
            c.cover  AS course_cover,
            c.price  AS course_price,
            c.status AS course_status
        FROM teacher t
        LEFT JOIN course c ON c.teacher_id = t.id AND c.deleted = 0
        WHERE t.id = #{id}
    </select>
</mapper>
```

**为什么这里只发了 1 条 SQL？** 这是「**嵌套结果映射**」：一条 `LEFT JOIN` 查出所有行（讲师 + 他的每门课一行），MyBatis 再按 `<id>`（讲师 id）把属于同一个讲师的多行课程折叠成一个 `List<Course>`。讲师有几门课，结果集就有几行，但**网络往返只有一次**。

::: tip 💡 面试题：`<collection>` 里为什么是 `ofType` 而不是 `javaType`？
**一句话**：`javaType` 指定属性本身的类型（`List`），而 `ofType` 指定**集合里元素的类型**（`Course`）——`List` 是泛型，MyBatis 需要知道里面装什么才能逐行映射。所以 `collection` 用 `ofType`，`association` 用 `javaType`。详见 [MyBatis](/learn_backend/java/基础/MyBatis)。
:::

::: tip 💡 面试题：什么是 N+1 问题？怎么避免？
**一句话**：用「**嵌套查询**」（`<collection>` 里写 `select="xxx"` 再发一条 SQL 查课程）时，查 N 个讲师会先发 1 条查讲师、再发 N 条查各自的课程，共 N+1 条 SQL。改成「**嵌套结果映射**」（一条 JOIN）就能压成 1 条。如果业务真需要懒加载，也只在「确实要访问课程时才查」的场景用嵌套查询 + `fetchType="lazy"`。详见 [MyBatis](/learn_backend/java/基础/MyBatis)。
:::

> 补充：N+1 问题的「嵌套查询」长这样（今天**不采用**，仅对比理解）——
>
> ```xml
> <resultMap id="lazyMap" type="com.mall.course.entity.Teacher">
>     <!-- select 指向另一个查询语句的 id，column=id 把当前行的 id 当参数传过去 -->
>     <collection property="courses" column="id"
>                 select="com.mall.course.mapper.CourseMapper.selectByTeacherId"
>                 fetchType="lazy"/>   <!-- lazy：访问 teacher.getCourses() 时才真的查课程 -->
> </resultMap>
> ```
>
> 查 10 个讲师就会发 1 + 10 = 11 条 SQL。所以「列表页」场景优先用 JOIN 的嵌套结果映射。

### 步骤 6：自关联分类树 —— `parent_id` 组装成树

分类表是**自关联**：`parent_id` 指向自己的 `id`。树形结构一般有两种做法：① SQL 递归（`WITH RECURSIVE`）；② 一次查出所有分类，在内存里组装。分类数据量小、几乎不变，用**内存组装**最简单也最快（还能配合缓存）。

Mapper 接口 `E:\course-mall\mall-user\src\main\java\com\mall\course\mapper\CategoryMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Category;

import java.util.List;

public interface CategoryMapper extends BaseMapper<Category> {

    // 查所有分类（不分页），返回后在 Service 里组装树
    List<Category> selectAll();
}
```

XML 映射 `E:\course-mall\mall-user\src\main\resources\mapper\CategoryMapper.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.mall.course.mapper.CategoryMapper">

    <!-- 结果简单，不用 resultMap，直接用 resultType；sort 升序保证子分类有序 -->
    <select id="selectAll" resultType="com.mall.course.entity.Category">
        SELECT id, parent_id, name, sort FROM category ORDER BY sort ASC, id ASC
    </select>
</mapper>
```

Service `E:\course-mall\mall-user\src\main\java\com\mall\course\service\CategoryService.java`：

```java
package com.mall.course.service;

import com.mall.course.entity.Category;
import com.mall.course.mapper.CategoryMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class CategoryService {

    @Autowired
    private CategoryMapper categoryMapper;

    public List<Category> tree() {
        List<Category> all = categoryMapper.selectAll();

        // 按 parent_id 分组：key=父分类id, value=它的直接子分类列表
        Map<Long, List<Category>> childrenMap = all.stream()
                .collect(Collectors.groupingBy(Category::getParentId));

        // 给每个分类塞进自己的子分类
        for (Category c : all) {
            c.setChildren(childrenMap.getOrDefault(c.getId(), Collections.emptyList()));
        }

        // 只返回顶级分类（parent_id = 0），它们的 children 已经在上面递归挂好了
        return all.stream()
                .filter(c -> c.getParentId() == 0L)
                .collect(Collectors.toList());
    }
}
```

::: tip 💡 面试题：树形结构有哪些实现方式？各自适用什么场景？
**一句话**：① **内存组装**（一次查出全量、`groupingBy` 挂接）——数据量小、几乎不变时最简单；② **SQL 递归**（MySQL 8 的 `WITH RECURSIVE`）——数据量小到中、层级深时用；③ **闭包表 / 路径枚举**——数据量大、频繁树形查询时用。分类这种小表用内存组装 + 缓存即可。详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 7：Service + Controller 串联，启动验证

课程 Service `E:\course-mall\mall-user\src\main\java\com\mall\course\service\CourseService.java`：

```java
package com.mall.course.service;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.course.entity.Course;
import com.mall.course.mapper.CourseMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CourseService {

    @Autowired
    private CourseMapper courseMapper;

    public Course detail(Long id) {
        Course course = courseMapper.selectCourseWithTeacher(id);
        if (course == null) {
            throw new BizException(ErrorCode.NOT_FOUND);   // 复用 Day01 的业务异常 + 全局异常处理器
        }
        return course;
    }
}
```

讲师 Service `E:\course-mall\mall-user\src\main\java\com\mall\course\service\TeacherService.java`：

```java
package com.mall.course.service;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.course.entity.Teacher;
import com.mall.course.mapper.TeacherMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class TeacherService {

    @Autowired
    private TeacherMapper teacherMapper;

    // 讲师详情：带出他名下的课程列表（一对多）
    public Teacher detail(Long id) {
        Teacher teacher = teacherMapper.selectTeacherWithCourses(id);
        if (teacher == null) {
            throw new BizException(ErrorCode.NOT_FOUND);
        }
        return teacher;
    }

    // 讲师列表：用 MyBatis-Plus 自带的物理分页（依赖步骤 2 装的分页插件）
    public IPage<Teacher> page(long pageNum, long pageSize) {
        return teacherMapper.selectPage(new Page<>(pageNum, pageSize), null);
    }
}
```

Controller `E:\course-mall\mall-user\src\main\java\com\mall\course\controller\TeacherController.java`：

```java
package com.mall.course.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.mall.common.result.Result;
import com.mall.course.entity.Teacher;
import com.mall.course.service.TeacherService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/teacher")
public class TeacherController {

    @Autowired
    private TeacherService teacherService;

    @GetMapping("/{id}")          // /api/teacher/1
    public Result<Teacher> detail(@PathVariable Long id) {
        return Result.ok(teacherService.detail(id));
    }

    @GetMapping                    // /api/teacher?pageNum=1&pageSize=10
    public Result<IPage<Teacher>> list(@RequestParam(defaultValue = "1") long pageNum,
                                       @RequestParam(defaultValue = "10") long pageSize) {
        return Result.ok(teacherService.page(pageNum, pageSize));
    }
}
```

Controller `E:\course-mall\mall-user\src\main\java\com\mall\course\controller\CourseController.java`：

```java
package com.mall.course.controller;

import com.mall.common.result.Result;
import com.mall.course.entity.Course;
import com.mall.course.service.CourseService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/course")
public class CourseController {

    @Autowired
    private CourseService courseService;

    @GetMapping("/{id}")          // /api/course/1
    public Result<Course> detail(@PathVariable Long id) {
        return Result.ok(courseService.detail(id));
    }
}
```

Controller `E:\course-mall\mall-user\src\main\java\com\mall\course\controller\CategoryController.java`：

```java
package com.mall.course.controller;

import com.mall.common.result.Result;
import com.mall.course.entity.Category;
import com.mall.course.service.CategoryService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/category")
public class CategoryController {

    @Autowired
    private CategoryService categoryService;

    @GetMapping("/tree")          // /api/category/tree
    public Result<List<Category>> tree() {
        return Result.ok(categoryService.tree());
    }
}
```

启动验证（在 `E:\course-mall\` 根目录）：

```bash
mvn clean install -DskipTests        # 先整体编译安装
mvn -pl mall-user spring-boot:run    # 启动
```

逐个验证：

```bash
# 1. 课程详情（一对一：课程带讲师）——预期返回 course + 嵌套 teacher（张老师）
curl http://localhost:8080/api/course/1

# 2. 讲师详情（一对多：讲师带 2 门课）——预期张老师 + courses 数组里 2 门课
curl http://localhost:8080/api/teacher/1

# 3. 分类树（自关联）——预期 2 个顶级分类：后端开发(含 Java/数据库)、人工智能(含 大模型)
curl http://localhost:8080/api/category/tree
```

启动日志里看 SQL 就能验证关联映射对不对：`/api/teacher/1` 应该只打印 **1 条** JOIN 的 `SELECT`，而不是「1 条查讲师 + N 条查课程」。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| `resultMap` / `association` / `collection` 关联映射 | [MyBatis](/learn_backend/java/基础/MyBatis) |
| 嵌套结果映射 vs 嵌套查询、N+1 问题 | [MyBatis](/learn_backend/java/基础/MyBatis) |
| 逻辑删除 `@TableLogic`、物理分页插件 | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| 自关联树的内存组装（Stream `groupingBy`） | [Java集合](/learn_backend/java/Java核心/Java集合) |
| `@RestController`、`@PathVariable`、`@RequestParam` | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| 数据源自动装配、`@MapperScan` | [Spring Boot](/learn_backend/java/基础/Spring Boot) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mvn clean install` 编译通过：是 / 否
- [ ] `/api/course/1` 返回课程 + 嵌套的讲师（一对一生效）：是 / 否
- [ ] `/api/teacher/1` 返回讲师 + `courses` 数组 2 门课（一对多生效）：是 / 否
- [ ] `/api/category/tree` 返回 2 个顶级分类、各带子分类（树组装生效）：是 / 否
- [ ] 启动日志确认 `/api/teacher/1` 只发了 1 条 SQL（无 N+1）：是 / 否
- [ ] 踩坑记录（数据源连不上、别名冲突、XML namespace 写错等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. `association` 和 `collection` 分别映射什么关系？为什么「课程-讲师」这同一对关系，两个方向用的标签不一样？
2. `resultMap` 里的 `<id>` 是干什么用的？一对多映射里 `<id>` 写错会发生什么？
3. 什么是 N+1 问题？「嵌套结果映射」和「嵌套查询」分别是几条 SQL？各自适合什么场景？
4. `ofType` 和 `javaType` 有什么区别？为什么 `collection` 用 `ofType`？
5. 为什么自定义 XML 的 SQL 里要手动写 `c.deleted = 0`？`@TableLogic` 为什么在这里不生效？
