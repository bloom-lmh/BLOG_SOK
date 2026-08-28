# Day 07 · 讲师分类（关联查询 + 一对一/一对多映射）

> **今天目标**：把讲师、分类的关联查询做出来——讲师详情带出他名下的所有课程（一对多）、课程详情带出讲师（一对一）、分类按 `parent_id` 组装成树（自关联）。核心学 MyBatis 的 `resultMap` + `association` / `collection` 关联映射。

## 一、前置条件

- **Day 01**：Maven 多模块骨架 + `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`（今天全部复用，不再重写）
- **Day 02**：17 张表已建，种子数据已插入（`category`、`teacher`、`course`），今天只查询这 3 张表
- **Day 06（课程模块）**：`mall-course` 已被 `mall-user` 依赖，MP、分页、DTO/VO 和公开课程接口已跑通

> ⚠️ Day01～Day12 是**模块化单体**：课程代码继续放在 `mall-course`，只由 `mall-user` 启动。不要复制一份课程代码到 `mall-user`，也不要新增第二个启动类。

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
| `GET /api/courses/{id}` 课程详情 | 课程 → 讲师（一对一） | `association` |
| `GET /api/teachers/{id}` 讲师详情 | 讲师 → 课程列表（一对多） | `collection` |
| `GET /api/categories/tree` 分类树 | 分类 → 子分类（自关联一对多） | Day06 已完成 |

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

### 步骤 2：复用 Day06 配置，只增加 XML 扫描位置

在唯一启动模块 `mall-user/src/main/resources/application.yml` 的现有 MP 配置中补充：

```yaml
mybatis-plus:
  mapper-locations: classpath*:/mapper/**/*.xml
```

`classpath*:` 会同时扫描启动模块和依赖 jar（`mall-course`）中的 XML。Day06 的数据源、分页插件、`deleted_at` 逻辑删除配置都保留，不重复创建。

### 步骤 3：Entity 保持纯净，关联结果使用 VO

不要为了返回接口而给 `Course` Entity 加 `Teacher teacher`，也不要给 `Teacher` Entity 加 `List<Course>`。Entity 只映射本表；关联查询直接映射到 VO，更符合 Day06 的 DTO / Entity / VO 边界。

讲师实体 `mall-course/src/main/java/com/mall/course/entity/Teacher.java`：

```java
package com.mall.course.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("teacher")
public class Teacher {
    @TableId(type = IdType.AUTO)
    private Long id;
    private String name;
    private String avatar;
    private String intro;
    private String position;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
```

建立 `TeacherVO`、`CourseSummaryVO`、`CourseDetailVO`、`TeacherDetailVO`：

```java
package com.mall.course.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Data
public class TeacherVO {
    private Long id;
    private String name;
    private String avatar;
    private String intro;
    private String position;
}

@Data
public class CourseSummaryVO {
    private Long id;
    private String title;
    private String cover;
    private BigDecimal price;
    private Integer status;
}

@Data
public class CourseDetailVO {
    private Long id;
    private Long categoryId;
    private String title;
    private String cover;
    private BigDecimal price;
    private BigDecimal originalPrice;
    private String description;
    private TeacherVO teacher;
}

@Data
public class TeacherDetailVO extends TeacherVO {
    private List<CourseSummaryVO> courses = new ArrayList<>();
}
```

> 上面四个 `public` 类在项目中要分别放进四个同名 `.java` 文件；这里并排展示只是为了节省篇幅。

### 步骤 4：一对一 `association` —— 课程详情带出讲师

Mapper 接口 `E:\CourseMall\mall-course\src\main\java\com\mall\course\mapper\CourseMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Course;
import com.mall.course.vo.CourseDetailVO;
import org.apache.ibatis.annotations.Param;

public interface CourseMapper extends BaseMapper<Course> {

    // 自定义方法：查课程 + 讲师。SQL 写在 CourseMapper.xml（复杂关联 SQL 放 XML，比注解清晰）
    CourseDetailVO selectCourseWithTeacher(@Param("id") Long id);
}
```

XML 映射 `E:\CourseMall\mall-course\src\main\resources\mapper\CourseMapper.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.mall.course.mapper.CourseMapper">

    <!-- 关联查询直接映射 VO，不污染 Course Entity -->
    <resultMap id="CourseWithTeacherMap" type="com.mall.course.vo.CourseDetailVO">
        <id property="id" column="id"/>
        <result property="categoryId" column="category_id"/>
        <result property="title" column="title"/>
        <result property="cover" column="cover"/>
        <result property="price" column="price"/>
        <result property="originalPrice" column="original_price"/>
        <result property="description" column="description"/>

        <!-- association：一对一。javaType 告诉 MyBatis 这个属性是哪个类 -->
        <association property="teacher" javaType="com.mall.course.vo.TeacherVO">
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
            c.original_price, c.description,
            t.name     AS teacher_name,     -- 讲师列加 teacher_ 前缀别名，避免和课程列重名
            t.position AS teacher_position,
            t.avatar   AS teacher_avatar,
            t.intro    AS teacher_intro
        FROM course c
        LEFT JOIN teacher t ON t.id = c.teacher_id   -- LEFT JOIN：讲师可能为 null，也要查出课程
        WHERE c.id = #{id}
          AND c.deleted_at IS NULL                   -- 自定义 XML 必须手动过滤逻辑删除
          AND c.status = 1                           -- 公开详情不返回草稿/下架课程
    </select>
</mapper>
```

::: tip 💡 面试题：`resultMap` 里 `<id>` 和 `<result>` 有什么区别？
**一句话**：`<id>` 声明主键列，MyBatis 用它判断「两行是不是同一个对象」——一对多查询 JOIN 出多行时，靠 `<id>` 相同的行折叠进同一个对象的 `collection` 里。所以**一对多映射里 `<id>` 必须写对**，写错会把多条数据当成多个对象。详见 [MyBatis](/learn_backend/java/基础/MyBatis)。
:::

::: tip 💡 面试题：为什么自定义 XML 里的 SQL 要手动写 `c.deleted_at IS NULL`？
**一句话**：`@TableLogic` 只会改写 MyBatis-Plus 生成的 SQL；你手写的 XML 不会自动追加逻辑删除条件，不写就可能查出已删除课程。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 5：一对多 `collection` —— 讲师详情带出课程列表

Mapper 接口 `E:\CourseMall\mall-course\src\main\java\com\mall\course\mapper\TeacherMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Teacher;
import com.mall.course.vo.TeacherDetailVO;
import org.apache.ibatis.annotations.Param;

public interface TeacherMapper extends BaseMapper<Teacher> {

    // 查讲师 + 他名下的所有课程（一对多）
    TeacherDetailVO selectTeacherWithCourses(@Param("id") Long id);
}
```

XML 映射 `E:\CourseMall\mall-course\src\main\resources\mapper\TeacherMapper.xml`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "http://mybatis.org/dtd/mybatis-3-mapper.dtd">
<mapper namespace="com.mall.course.mapper.TeacherMapper">

    <resultMap id="TeacherWithCoursesMap" type="com.mall.course.vo.TeacherDetailVO">
        <id property="id" column="id"/>
        <result property="name" column="name"/>
        <result property="position" column="position"/>
        <result property="avatar" column="avatar"/>
        <result property="intro" column="intro"/>

        <!-- collection：一对多。用 ofType 指定集合里装的元素类型（不是 javaType！） -->
        <collection property="courses" ofType="com.mall.course.vo.CourseSummaryVO">
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
        LEFT JOIN course c ON c.teacher_id = t.id
                          AND c.deleted_at IS NULL
                          AND c.status = 1
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

分类树沿用 Day06 的 `CategoryService.tree()` 和 `CategoryTreeVO`，不再复制第二套 Entity、Mapper 和 Controller。关联查询课程与讲师时，只要按需带出分类 ID；分类树仍采用“两遍遍历 + Map 索引”的 O(n) 组装方式。

::: tip 💡 面试题：树形结构有哪些实现方式？各自适用什么场景？
**一句话**：① **内存组装**（一次查出全量、`groupingBy` 挂接）——数据量小、几乎不变时最简单；② **SQL 递归**（MySQL 8 的 `WITH RECURSIVE`）——数据量小到中、层级深时用；③ **闭包表 / 路径枚举**——数据量大、频繁树形查询时用。分类这种小表用内存组装 + 缓存即可。详见 [MySQL](/learn_database/MySQL)。
:::

### 步骤 7：Service + Controller 串联，启动验证

在 Day06 的 `CourseService` 增加：

```java
CourseDetailVO getPublishedDetail(Long id);
```

在 `CourseServiceImpl` 增加实现：

```java
@Override
public CourseDetailVO getPublishedDetail(Long id) {
    CourseDetailVO detail = courseMapper.selectCourseWithTeacher(id);
    if (detail == null) {
        throw new BizException(ErrorCode.COURSE_NOT_FOUND, id);
    }
    return detail;
}
```

讲师 Service 接口与实现：

```java
package com.mall.course.service;

import com.mall.course.vo.TeacherDetailVO;

public interface TeacherService {
    TeacherDetailVO detail(Long id);
}
```

```java
package com.mall.course.service.impl;

import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.course.mapper.TeacherMapper;
import com.mall.course.service.TeacherService;
import com.mall.course.vo.TeacherDetailVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class TeacherServiceImpl implements TeacherService {

    private final TeacherMapper teacherMapper;

    @Override
    public TeacherDetailVO detail(Long id) {
        TeacherDetailVO detail = teacherMapper.selectTeacherWithCourses(id);
        if (detail == null) {
            throw new BizException(ErrorCode.TEACHER_NOT_FOUND, id);
        }
        return detail;
    }
}
```

把 Day06 `CourseController` 的详情返回类型改为关联 VO：

```java
@GetMapping("/{id}")
public Result<CourseDetailVO> detail(
        @Positive(message = "{common.id-required}") @PathVariable Long id) {
    return Result.ok(courseService.getPublishedDetail(id));
}
```

新建公开讲师接口 `TeacherController.java`：

```java
package com.mall.course.controller;

import com.mall.common.result.Result;
import com.mall.course.service.TeacherService;
import com.mall.course.vo.TeacherDetailVO;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/teachers")
public class TeacherController {

    private final TeacherService teacherService;

    @GetMapping("/{id}")
    public Result<TeacherDetailVO> detail(
            @Positive(message = "{common.id-required}") @PathVariable Long id) {
        return Result.ok(teacherService.detail(id));
    }
}
```

这三个接口都是商城前台公开读取，因此不贴 `@PreAuthorize`；后台讲师写接口以后应放在 `/api/admin/teachers/**`，并使用 Day02 已入库的 `teacher:edit` 权限。

启动验证（在 `E:\CourseMall\` 根目录）：

```bash
mvn clean verify -DskipTests
mvn -pl mall-user -am spring-boot:run
```

逐个验证：

```bash
# 1. 课程详情（一对一：课程带讲师）——预期返回 course + 嵌套 teacher（张老师）
curl http://localhost:8080/api/courses/1

# 2. 讲师详情（一对多：讲师带 2 门课）——预期张老师 + courses 数组里 2 门课
curl http://localhost:8080/api/teachers/1

# 3. 分类树（自关联）——预期 2 个顶级分类：后端开发(含 Java/数据库)、人工智能(含 大模型)
curl http://localhost:8080/api/categories/tree
```

启动日志里看 SQL 就能验证关联映射对不对：`/api/teachers/1` 应该只打印 **1 条** JOIN 的 `SELECT`，而不是「1 条查讲师 + N 条查课程」。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| `resultMap` / `association` / `collection` 关联映射 | [MyBatis](/learn_backend/java/基础/MyBatis) |
| Entity 保持纯净、关联查询直接映射 VO | [MyBatis](/learn_backend/java/基础/MyBatis) |
| 嵌套结果映射 vs 嵌套查询、N+1 问题 | [MyBatis](/learn_backend/java/基础/MyBatis) |
| 逻辑删除 `@TableLogic`、物理分页插件 | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| 自关联树的内存组装（Stream `groupingBy`） | [Java集合](/learn_backend/java/Java核心/Java集合) |
| `@RestController`、`@PathVariable`、`@RequestParam` | [Spring MVC](/learn_backend/java/基础/Spring MVC) |
| 数据源自动装配、`@MapperScan` | [Spring Boot](/learn_backend/java/基础/Spring Boot) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `mvn clean install` 编译通过：是 / 否
- [ ] `/api/courses/1` 返回课程 + 嵌套的讲师（一对一生效）：是 / 否
- [ ] `/api/teachers/1` 返回讲师 + `courses` 数组（一对多生效）：是 / 否
- [ ] `/api/categories/tree` 返回父子分类（复用 Day06）：是 / 否
- [ ] 启动日志确认 `/api/teachers/1` 只发了 1 条 SQL（无 N+1）：是 / 否
- [ ] 踩坑记录（数据源连不上、别名冲突、XML namespace 写错等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. `association` 和 `collection` 分别映射什么关系？为什么「课程-讲师」这同一对关系，两个方向用的标签不一样？
2. `resultMap` 里的 `<id>` 是干什么用的？一对多映射里 `<id>` 写错会发生什么？
3. 什么是 N+1 问题？「嵌套结果映射」和「嵌套查询」分别是几条 SQL？各自适合什么场景？
4. `ofType` 和 `javaType` 有什么区别？为什么 `collection` 用 `ofType`？
5. 为什么自定义 XML 的 SQL 里要手动写 `c.deleted_at IS NULL`？`@TableLogic` 为什么在这里不生效？
