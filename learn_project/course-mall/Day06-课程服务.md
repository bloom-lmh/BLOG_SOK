# Day 06 · 课程服务（MyBatis-Plus：CRUD + 分类 + 分页 + 条件查询 + 逻辑删除）

> **今天目标**：新建 `mall-course` 课程领域模块，用 MyBatis-Plus 完成课程的「增删改查 + 分类 + 分页 + 条件查询 + 逻辑删除」。Day01～Day12 采用**模块化单体**：代码按 Maven 模块拆分，但只启动 `mall-user`，这样课程接口才能复用 Day04 的 JWT 认证、权限和统一异常处理。

本日项目根目录统一为 `E:\CourseMall`。`com/mall/course/...` Java 文件位于
`mall-course\src\main\java`，`com/mall/common/...` 位于 `mall-common\src\main\java`。

## 一、前置条件

- 已完成 **Day 01～Day05**（统一响应、i18n、参数校验、JWT 认证与 RBAC 权限已可用）
- 已完成 **Day 02**（`course_mall` 库建好，`course` 表和 `category` 表 + 种子数据已插入）

> ⚠️ 本天所有代码都复用 Day 02 已经建好的表结构，**不要再建新表**。

## 二、今天完成后你会得到什么

```
E:\CourseMall\
├─ pom.xml                                    # 改：加 mall-course 模块 + MyBatis-Plus 版本管理
├─ mall-user/                                 # 唯一启动模块，依赖 mall-course
└─ mall-course/                               # 新增：课程领域模块（不单独启动）
   ├─ pom.xml
   └─ src/main/java/com/mall/course/
      ├─ config/
      │  └─ MybatisPlusConfig.java            # 分页插件
      ├─ entity/Course.java                   # 课程实体（deleted_at 逻辑删除）
      ├─ entity/Category.java                 # 分类实体
      ├─ mapper/CourseMapper.java             # 继承 BaseMapper，零 SQL
      ├─ mapper/CategoryMapper.java
      ├─ service/ + service/impl/             # 业务校验与 CRUD
      ├─ dto/                                 # 保存、修改、分页查询入参
      ├─ converter/CourseConverter.java        # MapStruct 转换
      ├─ vo/                                  # CourseVO / CategoryTreeVO
      └─ controller/                          # 对外接口
```

审计填充器位于唯一启动模块 `mall-user/config`，安全工具位于 `mall-user/security`；它们不放进 `mall-course` 的目录树。

## 三、先搞懂：MyBatis-Plus 到底解决了什么

Day 02 我们建了 17 张表。传统 MyBatis 往往需要手写 Mapper 方法、XML 和 SQL，一个简单的单表 CRUD 也会产生很多样板代码。

MyBatis-Plus（简称 MP）在 MyBatis 之上做了增强：**只要你的实体类继承 `BaseMapper`，它就自动帮你生成单表的 CRUD**——`selectById`、`insert`、`updateById`、`deleteById` 全都不用自己写。它不改变 MyBatis 底层，只是帮你「生成那些重复的 SQL」。

::: tip 💡 面试题：MyBatis-Plus 和 MyBatis 是什么关系？用 MP 还要不要 MyBatis？
**一句话**：MP 是 MyBatis 的增强框架，底层还是 MyBatis。MP 帮你把**单表**的 CRUD 和条件拼接自动化，但你依然可以在同一个工程里写 MyBatis 的 XML 来搞定**复杂多表 SQL**。所以答案是「都要」——MP 解决重复劳动，MyBatis 解决复杂查询。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) 和 [MyBatis](/learn_backend/java/基础/MyBatis)。
:::

## 四、步骤

### 步骤 1：父工程加模块，启动模块依赖课程模块

打开 `E:\CourseMall\pom.xml`，先加入模块和版本管理：

**① `<modules>` 里加 `mall-course`：**

```xml
<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-course</module>   <!-- 新增 -->
</modules>
```

**② `<properties>` 加统一版本、`<dependencyManagement>` 管理内部模块和第三方依赖：**

```xml
<properties>
    <java.version>17</java.version>
    <mybatis-plus.version>3.5.7</mybatis-plus.version>
    <mapstruct.version>1.6.3</mapstruct.version>
    <lombok-mapstruct-binding.version>0.2.0</lombok-mapstruct-binding.version>
    <swagger-annotations.version>2.2.19</swagger-annotations.version>
</properties>

<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-common</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-course</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
            <version>${mybatis-plus.version}</version>
        </dependency>
        <dependency>
            <groupId>org.mapstruct</groupId>
            <artifactId>mapstruct</artifactId>
            <version>${mapstruct.version}</version>
        </dependency>
        <dependency>
            <groupId>io.swagger.core.v3</groupId>
            <artifactId>swagger-annotations-jakarta</artifactId>
            <version>${swagger-annotations.version}</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

然后在**唯一启动模块** `mall-user/pom.xml` 中加入：

```xml
<dependency>
    <groupId>com.mall</groupId>
    <artifactId>mall-course</artifactId>
</dependency>
```

依赖方向必须是 `mall-user → mall-course → mall-common`，`mall-course` 不能反向依赖 `mall-user`，否则会形成 Maven 循环依赖。

> 为什么用 `mybatis-plus-spring-boot3-starter`？因为本项目是 Spring Boot 3.x，MP 针对 Spring Boot 3 单独出了这个 starter（旧的 `mybatis-plus-boot-starter` 是给 Spring Boot 2 用的，不兼容）。

### 步骤 2：新建 `mall-course` 模块 `pom.xml`

创建 `E:\CourseMall\mall-course\pom.xml`：

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
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <!-- 编译 @PreAuthorize；真正的过滤器链仍由 mall-user 配置 -->
        <dependency>
            <groupId>org.springframework.security</groupId>
            <artifactId>spring-security-core</artifactId>
        </dependency>
        <!-- MyBatis-Plus（Spring Boot 3 专用 starter）：版本由父工程管，不写 -->
        <dependency>
            <groupId>com.baomidou</groupId>
            <artifactId>mybatis-plus-spring-boot3-starter</artifactId>
        </dependency>
        <dependency>
            <groupId>org.mapstruct</groupId>
            <artifactId>mapstruct</artifactId>
        </dependency>
        <!-- OpenAPI 模型注解：CategoryVO 等返回对象使用 @Schema -->
        <dependency>
            <groupId>io.swagger.core.v3</groupId>
            <artifactId>swagger-annotations-jakarta</artifactId>
        </dependency>
        <dependency>
            <groupId>org.projectlombok</groupId>
            <artifactId>lombok</artifactId>
            <scope>provided</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <!-- 仅生成普通 jar；这里配置的是编译期代码生成，不是 Boot 可执行包插件 -->
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <configuration>
                    <annotationProcessorPaths>
                        <path>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok</artifactId>
                            <version>${lombok.version}</version>
                        </path>
                        <path>
                            <groupId>org.mapstruct</groupId>
                            <artifactId>mapstruct-processor</artifactId>
                            <version>${mapstruct.version}</version>
                        </path>
                        <path>
                            <groupId>org.projectlombok</groupId>
                            <artifactId>lombok-mapstruct-binding</artifactId>
                            <version>${lombok-mapstruct-binding.version}</version>
                        </path>
                    </annotationProcessorPaths>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

`mall-course` 没有启动类、MySQL 驱动和 `spring-boot-maven-plugin`。这些运行期能力由 `mall-user` 提供；它只是被打进最终应用的普通 jar。

::: tip 💡 面试题：Maven 多模块等于微服务吗？
不等于。Maven 模块只是**代码与依赖边界**；是否是微服务取决于它是否独立启动、独立部署并通过网络通信。Day01～Day12 是模块化单体，Day13 才开始拆成独立服务。
:::

### 步骤 3：在唯一启动模块补充 MP 配置

继续使用 `mall-user/src/main/resources/application.yml` 中 Day03 已配置的数据源，只补充 MP 配置；**不要在 `mall-course` 再建一套数据源配置**：

```yaml
mybatis-plus:
  configuration:
    map-underscore-to-camel-case: true
  global-config:
    db-config:
      # course 表使用 deleted_at：null=未删除，删除时写入数据库当前时间
      logic-delete-value: now()
      logic-not-delete-value: "null"
```

生产式项目不要长期使用 `StdOutImpl` 打 SQL，它绕过日志框架。需要排查 SQL 时临时把 `com.mall` / MyBatis 日志级别调为 `DEBUG`。

### 步骤 4：让 `mall-user` 扫描课程模块

修改 Day03 的 `MallUserApplication`：

```java
package com.mall.user;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.mall")
@MapperScan({"com.mall.user.mapper", "com.mall.course.mapper"})
public class MallUserApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallUserApplication.class, args);
    }
}
```

`scanBasePackages = "com.mall"` 会扫描课程模块中的 Controller、Service 和配置类；`@MapperScan` 则专门让 MyBatis 为两个模块的 Mapper 创建代理。

再在 Day04 的 `SecurityConfig` 白名单中加入公开读取接口（需要导入 `org.springframework.http.HttpMethod`）：

```java
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/user/login", "/api/user/register", "/doc.html", "/v3/api-docs/**").permitAll()
    .requestMatchers(HttpMethod.GET,
            "/api/courses/**", "/api/categories/**", "/api/teachers/**").permitAll()
    .anyRequest().authenticated())
```

只放行课程前台的 GET 查询；后台写接口仍需 JWT，并继续由 `@PreAuthorize` 校验具体权限。

分页插件配置 `E:\CourseMall\mall-course\src\main\java\com\mall\course\config\MybatisPlusConfig.java`：

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

Day01～Day12 只有 `mall-user` 是启动模块，而且当前登录人的 `LoginUser` 也属于用户模块。因此安全工具和审计填充器暂时放在启动模块，不能放进不依赖 Spring Security 的 `mall-common`，也不能让 `mall-course` 反向依赖 `mall-user`。

安全工具 `E:\CourseMall\mall-user\src\main\java\com\mall\user\security\SecurityUtils.java`：

```java
package com.mall.user.security;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** 获取当前请求认证用户的安全工具类。 */
public final class SecurityUtils {
    private SecurityUtils() {
    }

    public static Long getCurrentUserIdOrNull() {
        Authentication authentication =
                SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof LoginUser loginUser)) {
            return null;
        }
        return loginUser.getId();
    }
}
```

自动填充配置 `E:\CourseMall\mall-user\src\main\java\com\mall\user\config\MyMetaObjectHandler.java`：

```java
package com.mall.user.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.mall.user.security.SecurityUtils;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/** 为带有 MyBatis-Plus 填充标记的实体写入时间和操作人。 */
@Component
public class MyMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        LocalDateTime now = LocalDateTime.now();
        Long userId = SecurityUtils.getCurrentUserIdOrNull();

        strictInsertFill(metaObject, "createTime", LocalDateTime.class, now);
        strictInsertFill(metaObject, "updateTime", LocalDateTime.class, now);
        if (userId != null) {
            strictInsertFill(metaObject, "createdBy", Long.class, userId);
            strictInsertFill(metaObject, "updatedBy", Long.class, userId);
        }
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        // 更新字段必须覆盖旧值；strictUpdateFill 遇到实体中已有值时不会覆盖
        setFieldValByName("updateTime", LocalDateTime.now(), metaObject);

        Long userId = SecurityUtils.getCurrentUserIdOrNull();
        if (userId != null) {
            setFieldValByName("updatedBy", userId, metaObject);
        }
    }
}
```

这里暂时不抽 `BaseEntity`：`course/category/teacher` 有四个完整审计字段，`user/orders` 却只有 `updated_by`，关系表又只有 `created_by`。强行继承一个基类会让实体声明数据库中不存在的列。Day16 新建 `mall-security` 后，再把跨服务的当前用户能力迁入该模块。

::: tip 💡 面试题：MyBatis-Plus 的分页为什么必须手动配 `PaginationInnerInterceptor`？
**一句话**：MP 的分页是「插件式」的，不注册拦截器就不生效——因为分页本质是拦截到你的 SQL 后干两件事：① 额外执行一条 `SELECT COUNT(*)` 拿总条数；② 在原 SQL 末尾拼 `LIMIT offset, size`。你没配插件，`page()` 拿到的就是全量数据而不是一页。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 5：课程实体 `Course.java`

创建 `E:\CourseMall\mall-course\src\main\java\com\mall\course\entity\Course.java`：

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
    private Integer stock;
    @Version
    private Integer version;

    private String description;    // TEXT 长文本，用 String 接收即可
    private Integer status;        // 1上架 0下架
    private Integer viewCount;     // 浏览量
    private Integer buyCount;      // 购买量

    // 与 Day02 的 deleted_at 一致：null 表示有效，删除时写入当前时间。
    @TableField("deleted_at")
    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;

    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    // fill = FieldFill.INSERT：insert 时由 MyMetaObjectHandler 自动填充
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    // fill = FieldFill.INSERT_UPDATE：insert 和 update 时都填充
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}
```

::: tip 💡 面试题：`@TableLogic` 逻辑删除的底层原理是什么？
**一句话**：声明 `@TableLogic(value = "null", delval = "now()")` 后，MP 会把 `deleteById` 改写成类似 `UPDATE course SET deleted_at=now() WHERE id=? AND deleted_at IS NULL`，并给 MP 生成的查询追加 `deleted_at IS NULL`。**注意**：自定义 XML SQL 要自己处理逻辑删除条件。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 6：`CourseMapper` —— 零 SQL 拿到全套 CRUD

创建 `E:\CourseMall\mall-course\src\main\java\com\mall\course\mapper\CourseMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Course;
import org.apache.ibatis.annotations.Select;

// 继承 BaseMapper<Course> 后，selectById/insert/updateById/deleteById 等十几个方法自动就有了
// 这就是「少写 SQL」的核心：单表 CRUD 全部免费
public interface CourseMapper extends BaseMapper<Course> {
    // BaseMapper 只处理 Course 单表；跨表存在性校验需要自定义 SQL。
    @Select("SELECT COUNT(*) FROM teacher WHERE id = #{teacherId}")
    long countTeacherById(Long teacherId);
}
```

### 步骤 7：建立 DTO、VO、分页响应和 MapStruct 转换

真实项目不要让 Controller 直接接收或返回 Entity：Entity 对应数据库，DTO 对应输入契约，VO 对应输出契约。这样前端不能篡改 `buyCount`、`deletedAt` 等内部字段，表结构变化也不会直接破坏 API。

先在 `mall-common` 建立通用分页结果 `PageResult.java`：

```java
package com.mall.common.page;

import java.util.List;

/**
 * 稳定的分页响应，避免把 MyBatis-Plus 的 Page 实现细节暴露给前端。
 */
public record PageResult<T>(List<T> records, long total, long pageNum, long pageSize) {
    public PageResult {
        records = records == null ? List.of() : List.copyOf(records);
    }
}
```

保存参数 `CourseSaveDTO.java`：

```java
package com.mall.course.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/** 课程新增、完整修改时允许客户端提交的字段。 */
@Data
public class CourseSaveDTO {

    @NotNull(message = "{validation.course.teacher-id.not-null}")
    private Long teacherId;

    @NotNull(message = "{validation.course.category-id.not-null}")
    private Long categoryId;

    @NotBlank(message = "{validation.course.title.not-blank}")
    private String title;

    private String cover;

    @NotNull(message = "{validation.course.price.not-null}")
    @DecimalMin(value = "0.00", message = "{validation.course.price.min}")
    private BigDecimal price;

    @DecimalMin(value = "0.00", message = "{validation.course.price.min}")
    private BigDecimal originalPrice;

    private String description;

    @Min(value = 0, message = "{common.param-error}")
    @Max(value = 1, message = "{common.param-error}")
    private Integer status;
}
```

查询参数 `CourseQuery.java`：

```java
package com.mall.course.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

import java.math.BigDecimal;

/** 课程分页与筛选条件。 */
@Data
public class CourseQuery {

    @Min(value = 1, message = "{common.page-invalid}")
    private long pageNum = 1;

    @Min(value = 1, message = "{common.size-invalid}")
    @Max(value = 100, message = "{common.size-invalid}")
    private long pageSize = 10;

    private String title;
    private Long categoryId;

    @Min(value = 0, message = "{common.param-error}")
    @Max(value = 1, message = "{common.param-error}")
    private Integer status;

    @DecimalMin(value = "0.00", message = "{validation.course.price.min}")
    private BigDecimal minPrice;

    @DecimalMin(value = "0.00", message = "{validation.course.price.min}")
    private BigDecimal maxPrice;

    @AssertTrue(message = "{common.param-error}")
    public boolean isPriceRangeValid() {
        return minPrice == null || maxPrice == null || minPrice.compareTo(maxPrice) <= 0;
    }
}
```

返回对象 `CourseVO.java`：

```java
package com.mall.course.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/** 前台和后台可见的课程信息，不暴露逻辑删除字段。 */
@Data
public class CourseVO {
    private Long id;
    private Long teacherId;
    private Long categoryId;
    private String title;
    private String cover;
    private BigDecimal price;
    private BigDecimal originalPrice;
    private String description;
    private Integer status;
    private Integer viewCount;
    private Integer buyCount;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
```

转换器 `CourseConverter.java`：

```java
package com.mall.course.converter;

import com.mall.course.dto.CourseSaveDTO;
import com.mall.course.entity.Course;
import com.mall.course.vo.CourseVO;
import org.mapstruct.BeanMapping;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.ReportingPolicy;

import java.util.List;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface CourseConverter {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "viewCount", constant = "0")
    @Mapping(target = "buyCount", constant = "0")
    @Mapping(target = "stock", constant = "100")
    @Mapping(target = "version", constant = "0")
    @Mapping(target = "deletedAt", ignore = true)
    @Mapping(target = "createTime", ignore = true)
    @Mapping(target = "updateTime", ignore = true)
    Course toEntity(CourseSaveDTO source);

    CourseVO toVO(Course source);

    List<CourseVO> toVOList(List<Course> sources);

    @BeanMapping(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "viewCount", ignore = true)
    @Mapping(target = "buyCount", ignore = true)
    @Mapping(target = "stock", ignore = true)
    @Mapping(target = "version", ignore = true)
    @Mapping(target = "deletedAt", ignore = true)
    @Mapping(target = "createTime", ignore = true)
    @Mapping(target = "updateTime", ignore = true)
    void updateEntity(CourseSaveDTO source, @MappingTarget Course target);
}
```

`ReportingPolicy.ERROR` 会在遗漏字段映射时直接编译失败，能尽早发现 DTO/Entity 改字段后忘记同步转换器的问题。

### 步骤 8：在 Service 编排业务规则

接口 `CourseService.java` 不向 Controller 暴露 MP 的通用写方法，只公开本项目真正需要的业务用例：

```java
package com.mall.course.service;

import com.mall.common.page.PageResult;
import com.mall.course.dto.CourseQuery;
import com.mall.course.dto.CourseSaveDTO;
import com.mall.course.vo.CourseVO;

public interface CourseService {
    CourseVO create(CourseSaveDTO dto);
    CourseVO getPublished(Long id);
    PageResult<CourseVO> pagePublished(CourseQuery query);
    CourseVO getForAdmin(Long id);
    PageResult<CourseVO> pageForAdmin(CourseQuery query);
    void update(Long id, CourseSaveDTO dto);
    void delete(Long id);
}
```

实现类 `CourseServiceImpl.java`：

```java
package com.mall.course.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mall.common.exception.BizException;
import com.mall.common.page.PageResult;
import com.mall.common.result.ErrorCode;
import com.mall.course.converter.CourseConverter;
import com.mall.course.dto.CourseQuery;
import com.mall.course.dto.CourseSaveDTO;
import com.mall.course.entity.Course;
import com.mall.course.mapper.CategoryMapper;
import com.mall.course.mapper.CourseMapper;
import com.mall.course.service.CourseService;
import com.mall.course.vo.CourseVO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Objects;

@Service
@RequiredArgsConstructor
public class CourseServiceImpl extends ServiceImpl<CourseMapper, Course>
        implements CourseService {

    private final CourseMapper courseMapper;
    private final CategoryMapper categoryMapper;
    private final CourseConverter courseConverter;

    @Override
    @Transactional
    public CourseVO create(CourseSaveDTO dto) {
        validateReferences(dto);
        Course course = courseConverter.toEntity(dto);
        course.setStatus(Objects.requireNonNullElse(course.getStatus(), 0));
        if (!save(course)) {
            throw new BizException(ErrorCode.OPERATION_FAILED);
        }
        return courseConverter.toVO(course);
    }

    @Override
    public CourseVO getPublished(Long id) {
        Course course = requireCourse(id);
        // 前台把“下架”也表现为不存在，避免泄露未发布课程。
        if (!Objects.equals(course.getStatus(), 1)) {
            throw new BizException(ErrorCode.COURSE_NOT_FOUND, id);
        }
        return courseConverter.toVO(course);
    }

    @Override
    public PageResult<CourseVO> pagePublished(CourseQuery query) {
        return page(query, true);
    }

    @Override
    public CourseVO getForAdmin(Long id) {
        return courseConverter.toVO(requireCourse(id));
    }

    @Override
    public PageResult<CourseVO> pageForAdmin(CourseQuery query) {
        return page(query, false);
    }

    @Override
    @Transactional
    public void update(Long id, CourseSaveDTO dto) {
        Course course = requireCourse(id);
        validateReferences(dto);
        courseConverter.updateEntity(dto, course);
        if (!updateById(course)) {
            throw new BizException(ErrorCode.OPERATION_FAILED);
        }
    }

    @Override
    @Transactional
    public void delete(Long id) {
        requireCourse(id);
        if (!removeById(id)) {
            throw new BizException(ErrorCode.OPERATION_FAILED);
        }
    }

    private PageResult<CourseVO> page(CourseQuery query, boolean publishedOnly) {
        LambdaQueryWrapper<Course> wrapper = new LambdaQueryWrapper<Course>()
                .like(StringUtils.hasText(query.getTitle()), Course::getTitle, query.getTitle())
                .eq(query.getCategoryId() != null, Course::getCategoryId, query.getCategoryId())
                .eq(publishedOnly, Course::getStatus, 1)
                .eq(!publishedOnly && query.getStatus() != null,
                        Course::getStatus, query.getStatus())
                .ge(query.getMinPrice() != null, Course::getPrice, query.getMinPrice())
                .le(query.getMaxPrice() != null, Course::getPrice, query.getMaxPrice())
                .orderByDesc(Course::getCreateTime);

        Page<Course> result = this.page(
                Page.of(query.getPageNum(), query.getPageSize()), wrapper);
        return new PageResult<>(
                courseConverter.toVOList(result.getRecords()),
                result.getTotal(), result.getCurrent(), result.getSize());
    }

    private Course requireCourse(Long id) {
        Course course = getById(id);
        if (course == null) {
            throw new BizException(ErrorCode.COURSE_NOT_FOUND, id);
        }
        return course;
    }

    private void validateReferences(CourseSaveDTO dto) {
        if (categoryMapper.selectById(dto.getCategoryId()) == null) {
            throw new BizException(ErrorCode.CATEGORY_NOT_FOUND, dto.getCategoryId());
        }
        if (courseMapper.countTeacherById(dto.getTeacherId()) == 0) {
            throw new BizException(ErrorCode.TEACHER_NOT_FOUND, dto.getTeacherId());
        }
    }
}
```

`@Transactional` 放在业务写方法上，不放 Controller；这样以后新增章节、标签等多条 SQL 时，仍能保持“要么全部成功，要么全部回滚”。

::: tip 💡 面试题：为什么 MP 要分 `BaseMapper`（Mapper 层）和 `IService`（Service 层）两层？只用 Mapper 不行吗？
**一句话**：两层职责不同。`BaseMapper` 是**贴近 SQL 的原子操作**（selectById、insert）；`IService` 在其上封装了**带业务语义的批量/链式操作**（saveBatch 批量插入、getOne、page 分页、还有事务相关的 saveOrUpdate）。小项目只用 Mapper 也行，但分层能让你在 Service 层做事务、批量等扩展而不污染 Mapper。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 9：公开查询与后台管理分开

前台只看已上架课程，不要求登录；后台接口要求登录，并通过 `@PreAuthorize` 做操作级授权。

公开接口 `CourseController.java`：

```java
package com.mall.course.controller;

import com.mall.common.page.PageResult;
import com.mall.common.result.Result;
import com.mall.course.dto.CourseQuery;
import com.mall.course.service.CourseService;
import com.mall.course.vo.CourseVO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 课程前台查询接口。 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/courses")
public class CourseController {

    private final CourseService courseService;

    @GetMapping
    public Result<PageResult<CourseVO>> page(@Valid @ModelAttribute CourseQuery query) {
        return Result.ok(courseService.pagePublished(query));
    }

    @GetMapping("/{id}")
    public Result<CourseVO> detail(
            @Positive(message = "{common.id-required}") @PathVariable Long id) {
        return Result.ok(courseService.getPublished(id));
    }
}
```

后台接口 `CourseAdminController.java`：

```java
package com.mall.course.controller;

import com.mall.common.page.PageResult;
import com.mall.common.result.Result;
import com.mall.course.dto.CourseQuery;
import com.mall.course.dto.CourseSaveDTO;
import com.mall.course.service.CourseService;
import com.mall.course.vo.CourseVO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 课程后台管理接口。 */
@Validated
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin/courses")
public class CourseAdminController {

    private final CourseService courseService;

    @PreAuthorize("hasAuthority('course:list')")
    @GetMapping
    public Result<PageResult<CourseVO>> page(@Valid @ModelAttribute CourseQuery query) {
        return Result.ok(courseService.pageForAdmin(query));
    }

    @PreAuthorize("hasAuthority('course:list')")
    @GetMapping("/{id}")
    public Result<CourseVO> detail(
            @Positive(message = "{common.id-required}") @PathVariable Long id) {
        return Result.ok(courseService.getForAdmin(id));
    }

    @PreAuthorize("hasAuthority('course:create')")
    @PostMapping
    public Result<CourseVO> create(@Valid @RequestBody CourseSaveDTO dto) {
        return Result.ok(courseService.create(dto));
    }

    @PreAuthorize("hasAuthority('course:edit')")
    @PutMapping("/{id}")
    public Result<Void> update(
            @Positive(message = "{common.id-required}") @PathVariable Long id,
            @Valid @RequestBody CourseSaveDTO dto) {
        courseService.update(id, dto);
        return Result.ok();
    }

    @PreAuthorize("hasAuthority('course:delete')")
    @DeleteMapping("/{id}")
    public Result<Void> delete(
            @Positive(message = "{common.id-required}") @PathVariable Long id) {
        courseService.delete(id);
        return Result.ok();
    }
}
```

`@Valid` 负责 DTO 内部字段，类上的 `@Validated` 让 `@PathVariable` / 查询参数上的约束生效；`@PreAuthorize` 依赖 Day04 的 `@EnableMethodSecurity` 和登录用户的权限列表。

::: tip 💡 面试题：`LambdaQueryWrapper` 和 `QueryWrapper` 有什么区别？为什么推荐用 Lambda 的？
**一句话**：`QueryWrapper` 靠**字符串**写列名（`wrapper.eq("category_id", 1)`），列名写错编译器发现不了，改表字段名时也要全局搜字符串；`LambdaQueryWrapper` 靠**方法引用**写列名（`wrapper.eq(Course::getCategoryId, 1)`），编译器能检查字段是否存在，重构改字段名时 IDE 一起改，**类型安全**。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

::: tip 💡 面试题：`wrapper.eq(condition, ...)` 里第一个 `boolean` 参数是干什么的？
**一句话**：它是「条件是否拼接」的开关。当 `query.getCategoryId() == null`（前端没传这个筛选条件）时，`eq` 这条条件就直接跳过，不会生成 `WHERE category_id = null` 这种错误 SQL。这样你就不用写一堆 `if (xx != null) { wrapper.eq(...) }` 了，代码更简洁。详见 [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus)。
:::

### 步骤 10：分类 `Category`（下拉选项 + 树形）

课程分类是「自关联」表（`parent_id` 指向自己的 `id`，见 Day02），今天做两个接口：平铺列表（课程表单下拉用）+ 树形（后台菜单用）。

实体 `E:\CourseMall\mall-course\src\main\java\com\mall\course\entity\Category.java`：

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
    private Long createdBy;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    // 注意：category 表没有 deleted 字段（Day02 设计），所以这里不写 @TableLogic
}
```

Mapper `E:\CourseMall\mall-course\src\main\java\com\mall\course\mapper\CategoryMapper.java`：

```java
package com.mall.course.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.mall.course.entity.Category;

public interface CategoryMapper extends BaseMapper<Category> {
}
```

Service 接口 `E:\CourseMall\mall-course\src\main\java\com\mall\course\service\CategoryService.java`：

```java
package com.mall.course.service;

import com.mall.course.vo.CategoryVO;
import com.mall.course.vo.CategoryTreeVO;

import java.util.List;

public interface CategoryService {
    List<CategoryVO> listOptions();
    List<CategoryTreeVO> tree();
}
```

Service 实现 `E:\CourseMall\mall-course\src\main\java\com\mall\course\service\impl\CategoryServiceImpl.java`：

```java
package com.mall.course.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.mall.course.entity.Category;
import com.mall.course.mapper.CategoryMapper;
import com.mall.course.service.CategoryService;
import com.mall.course.vo.CategoryVO;
import com.mall.course.vo.CategoryTreeVO;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class CategoryServiceImpl extends ServiceImpl<CategoryMapper, Category> implements CategoryService {

    @Override
    public List<CategoryVO> listOptions() {
        return listOrdered().stream().map(this::toVO).toList();
    }

    @Override
    public List<CategoryTreeVO> tree() {
        List<Category> all = listOrdered();

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

    private List<Category> listOrdered() {
        return lambdaQuery().orderByAsc(Category::getSort, Category::getId).list();
    }

    private CategoryVO toVO(Category category) {
        CategoryVO vo = new CategoryVO();
        vo.setId(category.getId());
        vo.setParentId(category.getParentId());
        vo.setName(category.getName());
        vo.setSort(category.getSort());
        return vo;
    }
}
```

下拉选项对象 `E:\CourseMall\mall-course\src\main\java\com\mall\course\vo\CategoryVO.java`：

```java
package com.mall.course.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 分类下拉选项。
 */
@Data
@Schema(description = "分类下拉选项")
public class CategoryVO {
    @Schema(description = "分类 ID", example = "1")
    private Long id;

    @Schema(description = "父分类 ID，0 表示顶级分类", example = "0")
    private Long parentId;

    @Schema(description = "分类名称", example = "Java 开发")
    private String name;

    @Schema(description = "排序值，越小越靠前", example = "1")
    private Integer sort;
}
```

树返回对象 `E:\CourseMall\mall-course\src\main\java\com\mall\course\vo\CategoryTreeVO.java`：

```java
package com.mall.course.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 分类树节点。
 */
@Data
@Schema(description = "分类树节点")
public class CategoryTreeVO {
    @Schema(description = "分类 ID", example = "1")
    private Long id;

    @Schema(description = "父分类 ID，0 表示顶级分类", example = "0")
    private Long parentId;

    @Schema(description = "分类名称", example = "后端开发")
    private String name;

    @Schema(description = "排序值，越小越靠前", example = "1")
    private Integer sort;

    @Schema(description = "子分类列表")
    private List<CategoryTreeVO> children = new ArrayList<>();
}
```

Controller `E:\CourseMall\mall-course\src\main\java\com\mall\course\controller\CategoryController.java`：

```java
package com.mall.course.controller;

import com.mall.common.result.Result;
import com.mall.course.service.CategoryService;
import com.mall.course.vo.CategoryVO;
import com.mall.course.vo.CategoryTreeVO;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/categories")
public class CategoryController {

    private final CategoryService categoryService;

    // 平铺列表：课程表单的「分类下拉框」用
    @GetMapping("/options")
    public Result<List<CategoryVO>> listOptions() {
        return Result.ok(categoryService.listOptions());
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

### 步骤 11：启动验证

在 `E:\CourseMall\` 根目录执行：

```bash
mvn clean verify -DskipTests
mvn -pl mall-user -am spring-boot:run    # 仍然只启动 mall-user，端口 8080
```

公开查询不需要 Token：

```bash
# 1. 只返回已上架课程
curl "http://localhost:8080/api/courses?pageNum=1&pageSize=10"

# 2. 条件查询
curl "http://localhost:8080/api/courses?title=高并发&categoryId=2&minPrice=100&maxPrice=300"

# 3. 参数校验：预期返回 PARAM_ERROR，而不是进入数据库
curl "http://localhost:8080/api/courses?pageSize=101"

# 4. 分类树
curl "http://localhost:8080/api/categories/tree"
```

后台写接口请在 Apifox 的 Auth 中填写 Day04/05 登录得到的 ADMIN Token，再验证：

```bash
# 不带 Token：预期 401；普通用户 Token：预期 403；ADMIN Token：预期成功
curl -X POST "http://localhost:8080/api/admin/courses" \
  -H "Authorization: Bearer 你的ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"teacherId":1,"categoryId":2,"title":"MP 实战课","price":99.00,"status":1}'

# 使用刚创建的测试课程 ID 验证逻辑删除，不要删除 Day02 的种子数据
curl -X DELETE "http://localhost:8080/api/admin/courses/刚创建的ID" \
  -H "Authorization: Bearer 你的ADMIN_TOKEN"
```

删除后执行 `SELECT id, deleted_at FROM course WHERE id = 刚创建的ID;`：记录仍在，但 `deleted_at` 已写入时间；再次调用公开详情应返回 `COURSE_NOT_FOUND`。

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| `BaseMapper` / `IService` / Wrapper / 分页 / `@TableLogic` | [MyBatis-Plus](/learn_backend/java/基础/MyBatis-Plus) |
| MyBatis 底层、SQL 会话、映射 | [MyBatis](/learn_backend/java/基础/MyBatis) |
| starter 自动装配、`@Configuration` / `@Bean` | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| 构造器注入、Bean 管理 | [Spring](/learn_backend/java/基础/Spring) |
| 模块化单体、Maven 模块依赖方向 | [Maven](/learn_backend/java/基础/Maven) |
| DTO 校验、`@Valid` / `@Validated` | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| `@EnableMethodSecurity` / `@PreAuthorize` | [Spring Security](/learn_backend/java/基础/Spring Security) |
| DTO / Entity / VO 与 MapStruct | [MapStruct](/learn_backend/java/工具/MapStruct) |
| Service 事务边界、`@Transactional` | [Spring](/learn_backend/java/基础/Spring) |
| `HashMap` 组装树、`List` | [Java集合](/learn_backend/java/Java核心/Java集合) |
| `DECIMAL` ↔ `BigDecimal`、索引 | [MySQL](/learn_database/MySQL) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 只启动 `mall-user`，`/api/courses` 成功返回课程列表：是 / 否
- [ ] `pageSize=101` 被参数校验拦截：是 / 否
- [ ] 无 Token / 无权限 / ADMIN Token 分别得到 401 / 403 / 成功：是 / 否
- [ ] 逻辑删除跑通（记录仍在、`deleted_at` 有值、接口查不到）：是 / 否
- [ ] 条件查询跑通（title / categoryId / 价格区间任意组合都能筛）：是 / 否
- [ ] 分类树 `/api/categories/tree` 返回了父子层级：是 / 否
- [ ] 踩坑记录（数据库连不上、密码、SQL 报错等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. Maven 模块化单体和微服务有什么区别？为什么 Day06 不能另起一个应用后还期待复用 Day04 的 `SecurityContext`？
2. `@TableLogic(value = "null", delval = "now()")` 会怎样改写删除与查询 SQL？自定义 XML 是否自动生效？
3. 为什么 Controller 要使用 DTO/VO，而不是直接收发 Entity？MapStruct 在这里解决了什么问题？
4. `@Valid`、`@Validated` 和 `@PreAuthorize` 分别在哪个阶段工作？缺少 `@EnableMethodSecurity` 会怎样？
5. 为什么公开课程列表必须强制 `status=1`，而后台列表才允许按状态筛选？
