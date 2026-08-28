# Day 25 · 搜索上（课程搜索 + 高亮 + 聚合 + 分页）

> **今天目标**：引入 Elasticsearch，新建 `mall-search` 搜索服务，把 MySQL 里的课程数据「全量同步」进 ES，并实现一个搜索接口——支持关键词全文检索、高亮、分类/价格聚合、分页。这是你第一次在项目里接搜索引擎，重点是搞懂「为什么搜索要用 ES 而不是 MySQL LIKE」。

## 一、前置条件

- 已完成 **Day 01**（`mall-common` 里的 `Result` / `ErrorCode` / `BizException` / `GlobalExceptionHandler`）
- 已完成 **Day 02**（`course` 表已建，3 条种子课程已插入）
- 已完成 **Day 06**（`mall-course` 课程服务，课程数据都在这）
- 已完成 **Day 13**（微服务拆分，Nacos 已跑通）
- 本机已装 **Docker**（今天用 Docker 跑 ES，Day 27 会正式讲 Docker 镜像/编排）

> ⚠️ MySQL 的课程数据仍由 `mall-course` 独占。`mall-search` 不能为了方便直接连接课程库；全量重建通过内部 API 拉取已发布课程，Day26 再接入增量同步。

## 二、今天完成后你会得到什么

```
E:\course-mall\
├─ pom.xml                                    # 改：modules 里加 mall-search
└─ mall-search/                               # 新增：搜索服务（端口 8086）
   ├─ pom.xml
   └─ src/main/java/com/mall/search/
      ├─ MallSearchApplication.java           # 启动类
      ├─ doc/CourseDoc.java                   # ES 文档（映射 + IK 分析器）
      ├─ feign/CourseClient.java              # 通过课程服务内部 API 获取重建数据
      ├─ repository/CourseDocRepository.java  # ES 的 CRUD（类比 BaseMapper）
      ├─ dto/CourseSearchQuery.java           # 搜索入参
      ├─ vo/CourseHitVO.java / CourseSearchResultVO.java / BucketVO.java
      ├─ service/SearchService.java           # 搜索 + 全量同步
      └─ controller/SearchController.java     # 公开搜索 + 管理端索引重建
```

## 三、先搞懂：搜索为什么不能靠 MySQL LIKE

Day 06 我们用 `wrapper.like(Course::getTitle, "高并发")` 做模糊查询，那为什么还要 ES？核心区别在**索引结构**：

| | MySQL `LIKE '%xx%'` | Elasticsearch |
|---|---|---|
| 底层 | B+ 树 + **全表扫描**（`%xx%` 前导模糊用不上索引） | **倒排索引** |
| 匹配方式 | 逐行字符串匹配 | 分词后查词典，直接定位到文档列表 |
| 相关性/高亮/聚合 | 没有 | `_score` 评分、高亮片段、聚合统计一次请求全有 |

**倒排索引**是 ES 快的根本原因：它不是「一行行找哪个标题包含关键词」，而是提前把「词 → 文档ID列表」建好。查询时先分词，再拿词直接查词典，O(1) 拿到文档列表，再做交集/并集。数据量一大，`LIKE '%高并发%'` 只能全表扫，几百万行会非常慢。

::: tip 💡 面试题：ES 和 MySQL 是什么关系？ES 能替代 MySQL 吗？
**一句话**：**定位不同、是互补不是替代**。MySQL 是 OLTP 关系型存储，强在**事务、精确查询、主键/索引查找**；ES 是搜索引擎，强在**倒排索引、全文检索、相关性排序、聚合分析**，但不适合做强一致事务（有刷新延迟、不做 ACID）。所以电商里「订单」存 MySQL、「搜索」走 ES。详见 [Elasticsearch](/learn_backend/java/微服务/Elasticsearch)、[MySQL](/learn_database/MySQL)。
:::

## 四、步骤

### 步骤 1：Docker 启动 ES + 装 IK 中文分词器

在命令行执行（Docker 已装前提下）：

```bash
# 1. 拉取并启动单节点 ES（开发环境关掉安全认证，省得配 https / 账号密码）
docker run -d --name es \
  -p 9200:9200 -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "xpack.security.enabled=false" \
  -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  docker.elastic.co/elasticsearch/elasticsearch:8.13.4

# 2. 确认 ES 起来了
curl http://localhost:9200

# 3. 安装 IK 中文分词器（版本必须和 ES 完全一致：8.13.4）
docker exec -it es ./bin/elasticsearch-plugin install https://get.infini.cloud/elasticsearch/analysis-ik/8.13.4

# 4. 重启 ES 让插件生效
docker restart es
```

> ⚠️ 两个常见坑：① 镜像较大（约 1GB），首次 `docker run` 会下载很久；② Docker Desktop 内存要给到 4GB 以上，否则 ES 起不来（`ES_JAVA_OPTS` 已压到 512m 减少压力）。

**为什么必须装 IK？** ES 默认的 `standard` 分词器是按「空格 + 标点」切词的，它对英文友好（`Java high concurrency` → `java`/`high`/`concurrency`），但对中文会把「高并发」切成「高」「并」「发」三个单字——搜「高并发」和搜「并高」都可能命中，相关度完全失真。IK 是按中文词库切词的，是中文搜索的事实标准。

> （可选）想可视化看索引，可再起一个 Kibana：`docker run -d --name kibana -p 5601:5601 -e "ELASTICSEARCH_HOSTS=http://host.docker.internal:9200" docker.elastic.co/kibana/kibana:8.13.4`，浏览器开 `http://localhost:5601`。今天用 curl 验证就够了，Kibana 不装也行。

### 步骤 2：父工程 `pom.xml` 加模块

打开 `E:\course-mall\pom.xml`，在 `<modules>` 里加一行 `<module>mall-search</module>`。下面是本系列到目前为止的**完整模块清单**，先和你本地 pom 核对一遍——**重点：已有的模块一行都别删**（漏掉哪个，`mvn install` 就会跳过它），今天真正的改动只有 `mall-search` 这一行：

```xml
<modules>
    <module>mall-common</module>    <!-- 公共模块 -->
    <module>mall-user</module>      <!-- 用户服务 -->
    <module>mall-course</module>    <!-- 课程服务 -->
    <module>mall-stock</module>     <!-- 库存服务 -->
    <module>mall-payment</module>   <!-- 支付服务 -->
    <module>mall-gateway</module>   <!-- 网关 -->
    <module>mall-seckill</module>   <!-- 秒杀服务 -->
    <module>mall-order</module>     <!-- 订单服务（Day24 已分表） -->
    <module>mall-search</module>    <!-- 今天新增：搜索服务 -->
</modules>
```

> 注意：`spring-boot-starter-data-elasticsearch` 的版本由 Spring Boot 父工程 BOM 统一锁定（3.2.5），**不需要**像 MyBatis-Plus 那样在 `<dependencyManagement>` 里再声明一次。所以今天父 pom 只加这一行。

### 步骤 3：新建 `mall-search` 模块

**3.1 `mall-search/pom.xml`：**

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

    <artifactId>mall-search</artifactId>

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
        <!-- Spring Data Elasticsearch：自动装配 ElasticsearchClient + 支持 ElasticsearchRepository -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
        </dependency>
        <!-- 搜索服务不能跨库读取课程表：通过 Feign 调课程服务的内部 API -->
        <dependency>
            <groupId>com.mall</groupId>
            <artifactId>mall-contract</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-openfeign</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-starter-loadbalancer</artifactId>
        </dependency>
        <!-- Nacos 注册：微服务架构下网关/前端按服务名发现它 -->
        <dependency>
            <groupId>com.alibaba.cloud</groupId>
            <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
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

**3.2 `application.yml`（`mall-search/src/main/resources/application.yml`）：**

```yaml
server:
  port: 8086              # 8085 已分配给 mall-seckill

spring:
  application:
    name: mall-search
  cloud:
    nacos:
      discovery:
        server-addr: ${NACOS_SERVER_ADDR:127.0.0.1:8848}
  elasticsearch:
    uris: ${ELASTICSEARCH_URIS:http://127.0.0.1:9200}
    username: ${ELASTICSEARCH_USERNAME:}
    password: ${ELASTICSEARCH_PASSWORD:}
```

**3.3 启动类（`com/mall/search/MallSearchApplication.java`）：**

```java
package com.mall.search;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.data.elasticsearch.repository.config.EnableElasticsearchRepositories;

// scanBasePackages = "com.mall"：和 Day01 一样，扫到 mall-common 的全局异常处理器
// @EnableElasticsearchRepositories：扫描 ES 的 Repository 接口，生成代理实现
@SpringBootApplication(scanBasePackages = "com.mall")
@EnableElasticsearchRepositories(basePackages = "com.mall.search.repository")
@EnableFeignClients
public class MallSearchApplication {
    public static void main(String[] args) {
        SpringApplication.run(MallSearchApplication.class, args);
    }
}
```

### 步骤 4：ES 文档 `CourseDoc`（映射 + IK 分析器）

创建 `E:\course-mall\mall-search\src\main\java\com\mall\search\doc\CourseDoc.java`：

```java
package com.mall.search.doc;

import lombok.Data;
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;
import org.springframework.data.elasticsearch.annotations.Setting;

@Data
// @Document：声明这是一个 ES 文档，indexName = 索引名，createIndex = 启动时若索引不存在则自动创建
@Document(indexName = "course", createIndex = true)
// 单机开发把副本设 0：单节点没有别的节点可放副本，副本=1 会让集群一直是 yellow（不健康提示）
@Setting(shards = 1, replicas = 0)
public class CourseDoc {

    @Id
    private Long id;

    // _id 不能用于排序；保留一份启用 doc_values 的业务 ID 给 Day26 search_after 使用。
    @Field(type = FieldType.Long)
    private Long sortId;

    // text 类型：会分词、建倒排索引，支持全文检索
    // analyzer（索引时）/ searchAnalyzer（查询时）分开设：两边粒度可以不同（见下面面试题）
    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String title;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String description;

    // keyword + index=false：只存不索引（封面只用于返回展示，不参与搜索，省索引空间）
    @Field(type = FieldType.Keyword, index = false)
    private String cover;

    // Long/Double/Integer：数值类型，支持 range 查询和 terms 聚合
    @Field(type = FieldType.Long)
    private Long categoryId;

    @Field(type = FieldType.Long)
    private Long teacherId;

    @Field(type = FieldType.Double)
    private Double price;

    @Field(type = FieldType.Integer)
    private Integer status;

    @Field(type = FieldType.Integer)
    private Integer viewCount;

    @Field(type = FieldType.Integer)
    private Integer buyCount;

    // 创建时间只用于展示，用 keyword 存格式化后的字符串即可（不参与搜索/排序）
    @Field(type = FieldType.Keyword)
    private String createTime;
}
```

::: tip 💡 面试题：`analyzer` 和 `searchAnalyzer` 为什么分开设？`ik_max_word` 和 `ik_smart` 有什么区别？
**一句话**：**索引和查询的分词粒度可以不同**。`ik_max_word` 是**细粒度**（穷尽所有可能的词元，如「高并发实战」切成「高并发/并发/实战」等），`ik_smart` 是**粗粒度**（最合理的切分，只切「高并发/实战」）。**索引时用 max_word 提高召回**（多切一些词，搜到你的概率更大），**查询时用 smart 提高精准**（别把用户输入切太碎导致误命中）。详见 [Elasticsearch](/learn_backend/java/微服务/Elasticsearch)。
:::

::: tip 💡 面试题：`text` 和 `keyword` 类型有什么区别？什么时候用哪个？
**一句话**：`text` 会**分词**、建倒排索引，用于**全文检索**（标题、简介这类要模糊匹配的长文本）；`keyword` **不分词**、整值存储，用于**精确匹配/聚合/排序**（分类ID、状态、订单号这类「要么相等要么不等」的值）。分词字段做聚合会按词元分桶（结果错乱），所以聚合字段一定要用 keyword 或数值类型。
:::

> ⚠️ 命名坑：Spring Data Elasticsearch 默认用 **Java 属性名（驼峰）** 作为 ES 字段名，**不会**像 MyBatis-Plus 那样自动转下划线。所以索引里字段叫 `categoryId`（不是 `category_id`），下面查询代码里也全部写驼峰。

### 步骤 5：`CourseDocRepository`（类比 BaseMapper）

创建 `E:\course-mall\mall-search\src\main\java\com\mall\search\repository\CourseDocRepository.java`：

```java
package com.mall.search.repository;

import com.mall.search.doc.CourseDoc;
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;

// 和 MyBatis-Plus 的 BaseMapper 一个思路：继承 ElasticsearchRepository 后，
// save / saveAll / findById / deleteAll 等基础方法自动就有，不用自己写。
// 今天用它做「全量同步」（写入）；复杂的搜索（高亮/聚合）用下面的 ElasticsearchClient 直接拼 DSL
public interface CourseDocRepository extends ElasticsearchRepository<CourseDoc, Long> {
}
```

### 步骤 6：搜索入参 DTO + 返回 VO（4 个类，一次建齐）

入参 `CourseSearchQuery.java`（`com/mall/search/dto/CourseSearchQuery.java`）：

```java
package com.mall.search.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CourseSearchQuery {
    @Size(max = 100)
    private String keyword;      // 搜索关键词（对 title + description 全文检索）
    @Positive
    private Long categoryId;     // 分类筛选（精确过滤）
    @DecimalMin("0.0")
    private Double minPrice;     // 最低价
    @DecimalMin("0.0")
    private Double maxPrice;     // 最高价
    @Min(1)
    private int pageNum = 1;     // 页码，从 1 开始
    @Min(1)
    @Max(100)
    private int pageSize = 10;   // 每页条数

    @AssertTrue(message = "{search.price-range-invalid}")
    public boolean isPriceRangeValid() {
        return minPrice == null || maxPrice == null || minPrice <= maxPrice;
    }

    @AssertTrue(message = "{search.page-window-too-large}")
    public boolean isPageWindowValid() {
        return (long) pageNum * pageSize <= 10_000;
    }
}
```

命中项 `CourseHitVO.java`（`com/mall/search/vo/CourseHitVO.java`）：

```java
package com.mall.search.vo;

import lombok.Data;

@Data
public class CourseHitVO {
    private Long id;
    private String title;
    private String highlightTitle;        // 高亮后的标题（命中关键词时非空）
    private String description;
    private String highlightDescription;  // 高亮后的简介
    private String cover;
    private Long categoryId;
    private Double price;
    private Integer viewCount;
    private Integer buyCount;
    private Double score;                  // 相关度评分 _score（越大越相关）
}
```

聚合桶 `BucketVO.java`（`com/mall/search/vo/BucketVO.java`）：

```java
package com.mall.search.vo;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BucketVO {
    private String key;    // 聚合键（分类ID，或价格区间名如 "0-100"）
    private Long count;    // 该桶下的文档数
}
```

返回体 `CourseSearchResultVO.java`（`com/mall/search/vo/CourseSearchResultVO.java`）：

```java
package com.mall.search.vo;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class CourseSearchResultVO {
    private long total;                               // 命中总数（不受分页影响）
    private int pageNum;
    private int pageSize;
    private List<CourseHitVO> records;                // 当前页命中结果（含高亮）
    private Map<String, List<BucketVO>> aggregations; // 聚合结果：key=聚合名（byCategory/byPrice）
}
```

### 步骤 7：`SearchService` —— 搜索（全文 + 高亮 + 聚合 + 分页）

创建 `E:\course-mall\mall-search\src\main\java\com\mall\search\service\SearchService.java`。这是今天最核心的一步，直接用 `ElasticsearchClient` 拼 DSL，因为**高亮 + 聚合 + 分页要在一个请求里同时完成**，用底层客户端最直观：

```java
package com.mall.search.service;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch._types.aggregations.Aggregate;
import co.elastic.clients.elasticsearch._types.aggregations.LongTermsBucket;
import co.elastic.clients.elasticsearch._types.aggregations.RangeBucket;
import co.elastic.clients.elasticsearch._types.query_dsl.BoolQuery;
import co.elastic.clients.elasticsearch._types.query_dsl.Query;
import co.elastic.clients.elasticsearch._types.query_dsl.TextQueryType;
import co.elastic.clients.elasticsearch.core.SearchResponse;
import co.elastic.clients.elasticsearch.core.search.Hit;
import co.elastic.clients.json.JsonData;
import com.mall.common.exception.BizException;
import com.mall.common.result.ErrorCode;
import com.mall.search.doc.CourseDoc;
import com.mall.search.dto.CourseSearchQuery;
import com.mall.contract.course.CourseIndexDTO;
import com.mall.common.feign.RemoteResult;
import com.mall.search.feign.CourseClient;
import com.mall.search.repository.CourseDocRepository;
import com.mall.search.vo.BucketVO;
import com.mall.search.vo.CourseHitVO;
import com.mall.search.vo.CourseSearchResultVO;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class SearchService {

    private static final String INDEX = "course";

    private final ElasticsearchClient client;        // 底层客户端：拼复杂 DSL（高亮/聚合）
    private final CourseDocRepository repository;    // 高层仓库：全量同步的写入/清空
    private final CourseClient courseClient;         // 通过服务 API 获取课程，不跨库

    public SearchService(ElasticsearchClient client,
                         CourseDocRepository repository,
                         CourseClient courseClient) {
        this.client = client;
        this.repository = repository;
        this.courseClient = courseClient;
    }

    // ==================== 搜索 ====================
    public CourseSearchResultVO search(CourseSearchQuery q) {
        int from = (q.getPageNum() - 1) * q.getPageSize();   // 分页偏移量：跳过前 from 条
        try {
            SearchResponse<CourseDoc> response = client.search(s -> s
                    .index(INDEX)
                    .query(buildQuery(q))                     // ① 查询：must 全文 + filter 精确筛选
                    .highlight(h -> h                         // ② 高亮：命中片段用 <em> 包起来
                            .fields("title", f -> f.preTags("<em>").postTags("</em>").fragmentSize(100))
                            .fields("description", f -> f.preTags("<em>").postTags("</em>").fragmentSize(200)))
                    .aggregations("byCategory", a -> a        // ③ 聚合：按分类分组计数（等价 SQL GROUP BY）
                            .terms(t -> t.field("categoryId").size(20)))
                    .aggregations("byPrice", a -> a           // ④ 聚合：按价格区间分组计数
                            .range(r -> r.field("price").ranges(
                                    r1 -> r1.key("0-100").to("100"),
                                    r2 -> r2.key("100-200").from("100").to("200"),
                                    r3 -> r3.key("200+").from("200"))))
                    .from(from)                               // ⑤ 分页：from + size
                    .size(q.getPageSize()),
                    CourseDoc.class);

            return toResult(response, q);
        } catch (Exception e) {
            log.error("课程搜索失败 keyword={}", q.getKeyword(), e);
            throw new BizException(ErrorCode.SEARCH_UNAVAILABLE);
        }
    }

    // 拼查询条件：bool query 分「must（打分）」和「filter（过滤）」两类
    private Query buildQuery(CourseSearchQuery q) {
        BoolQuery.Builder bool = new BoolQuery.Builder();

        // must：参与相关度打分。关键词对标题+简介做多字段匹配，越相关 _score 越高
        if (q.getKeyword() != null && !q.getKeyword().isBlank()) {
            bool.must(m -> m.multiMatch(mm -> mm
                    .fields("title", "description")
                    .query(q.getKeyword())
                    .type(TextQueryType.BestFields)));
        }

        // filter：只过滤、不参与打分，且结果会被 ES 缓存，性能更好。分类/价格这类「精确筛选」一律用 filter
        if (q.getCategoryId() != null) {
            bool.filter(f -> f.term(t -> t.field("categoryId").value(q.getCategoryId())));
        }
        if (q.getMinPrice() != null || q.getMaxPrice() != null) {
            bool.filter(f -> f.range(r -> {
                r.field("price");
                if (q.getMinPrice() != null) r.gte(JsonData.of(q.getMinPrice()));
                if (q.getMaxPrice() != null) r.lte(JsonData.of(q.getMaxPrice()));
                return r;
            }));
        }

        return new Query.Builder().bool(bool.build()).build();
    }

    // 把 ES 响应转成 VO（hits + 聚合）
    private CourseSearchResultVO toResult(SearchResponse<CourseDoc> response, CourseSearchQuery q) {
        CourseSearchResultVO result = new CourseSearchResultVO();
        result.setTotal(response.hits().total().value());   // total().value() 是命中总数，不受分页影响
        result.setPageNum(q.getPageNum());
        result.setPageSize(q.getPageSize());

        List<CourseHitVO> records = new ArrayList<>();
        for (Hit<CourseDoc> hit : response.hits().hits()) {
            CourseDoc doc = hit.source();
            CourseHitVO vo = new CourseHitVO();
            vo.setId(Long.parseLong(hit.id()));   // 文档 id 存在 _id 元数据里，不在 _source，用 hit.id() 取
            vo.setTitle(doc.getTitle());
            vo.setDescription(doc.getDescription());
            vo.setCover(doc.getCover());
            vo.setCategoryId(doc.getCategoryId());
            vo.setPrice(doc.getPrice());
            vo.setViewCount(doc.getViewCount());
            vo.setBuyCount(doc.getBuyCount());
            vo.setScore(hit.score());              // _score：相关度评分，排序依据

            // 高亮：命中的字段会有 highlight 片段，取第一个片段作为高亮文本
            Map<String, List<String>> hl = hit.highlight();
            if (hl != null) {
                if (hl.get("title") != null && !hl.get("title").isEmpty()) {
                    vo.setHighlightTitle(hl.get("title").get(0));
                }
                if (hl.get("description") != null && !hl.get("description").isEmpty()) {
                    vo.setHighlightDescription(hl.get("description").get(0));
                }
            }
            records.add(vo);
        }
        result.setRecords(records);

        // 聚合解析：response.aggregations() 是 Map<聚合名, Aggregate>，按类型取桶
        Map<String, List<BucketVO>> aggMap = new HashMap<>();
        Map<String, Aggregate> aggs = response.aggregations();
        if (aggs != null) {
            // byCategory 是 long 字段的 terms 聚合 → lterms()，桶是 LongTermsBucket
            Aggregate byCategory = aggs.get("byCategory");
            if (byCategory != null && byCategory.isLterms()) {
                List<BucketVO> buckets = new ArrayList<>();
                for (LongTermsBucket bucket : byCategory.lterms().buckets().array()) {
                    buckets.add(new BucketVO(String.valueOf(bucket.key()), bucket.docCount()));
                }
                aggMap.put("byCategory", buckets);
            }
            // byPrice 是 range 聚合 → range()，桶是 RangeBucket
            Aggregate byPrice = aggs.get("byPrice");
            if (byPrice != null && byPrice.isRange()) {
                List<BucketVO> buckets = new ArrayList<>();
                for (RangeBucket bucket : byPrice.range().buckets().array()) {
                    buckets.add(new BucketVO(bucket.key(), bucket.docCount()));
                }
                aggMap.put("byPrice", buckets);
            }
        }
        result.setAggregations(aggMap);
        return result;
    }

    // ==================== 全量同步 ====================
    public long rebuild() {
        // 学习版先清空再分批拉取；生产改为“新索引构建完成后切别名”，避免空窗。
        repository.deleteAll();
        long afterId = 0L;
        long total = 0L;
        while (true) {
            List<CourseIndexDTO> batch = RemoteResult.unwrap(
                    courseClient.listForIndex(afterId, 500));
            if (batch.isEmpty()) {
                return total;
            }
            repository.saveAll(batch.stream().map(this::toDoc).toList());
            afterId = batch.get(batch.size() - 1).id();
            total += batch.size();
        }
    }

    private CourseDoc toDoc(CourseIndexDTO c) {
        CourseDoc doc = new CourseDoc();
        doc.setId(c.id());
        doc.setSortId(c.id());
        doc.setTitle(c.title());
        doc.setDescription(c.description());
        doc.setCover(c.cover());
        doc.setCategoryId(c.categoryId());
        doc.setTeacherId(c.teacherId());
        doc.setPrice(c.price().doubleValue());
        doc.setStatus(c.status());
        doc.setViewCount(c.viewCount());
        doc.setBuyCount(c.buyCount());
        doc.setCreateTime(c.createTime().toString());
        return doc;
    }
}
```

::: tip 💡 面试题：bool query 里 `must` 和 `filter` 有什么区别？为什么分类/价格要用 filter？
**一句话**：`must` **参与相关度打分**（影响 `_score`，用于「关键词」这种要排序的匹配）；`filter` **只过滤、不参与打分**，且过滤结果会被 ES **缓存**，性能更好。所以「分类、价格区间」这类「要么命中要么不命中」的精确筛选用 filter，「关键词全文检索」用 must。详见 [Elasticsearch](/learn_backend/java/微服务/Elasticsearch)。
:::

::: tip 💡 面试题：ES 的高亮是怎么实现的？是前端拿到数据自己找关键词吗？
**一句话**：高亮片段由 ES 返回。前端若使用 HTML 渲染，只允许 `<em>` 等明确白名单标签并做消毒，不能把任意课程文本直接作为 HTML 插入，否则会产生 XSS。
:::

::: tip 💡 面试题：聚合（aggregation）和普通查询有什么区别？为什么说 ES 能「一次请求同时拿到 hits + 聚合」？
**一句话**：普通查询返回的是**文档列表**（hits），聚合返回的是**统计结果**（一个个「桶 bucket」，如每个分类有多少条，等价 SQL 的 `GROUP BY`）。ES 允许在一个 search 请求里**同时声明 query 和 aggregations**，一次网络往返同时拿到「本页命中结果」和「侧边栏的分类/价格统计」——MySQL 要发多次查询才能凑齐。详见 [Elasticsearch](/learn_backend/java/微服务/Elasticsearch)。
:::

### 步骤 8：用契约 DTO 获取重建数据

在 `mall-contract` 定义 `CourseIndexDTO`，只包含搜索索引需要的字段；它不是 `mall-course` 的 Entity：

```java
public record CourseIndexDTO(
        Long id,
        Long teacherId,
        Long categoryId,
        String title,
        String cover,
        BigDecimal price,
        String description,
        Integer status,
        Integer viewCount,
        Integer buyCount,
        LocalDateTime createTime) {
}
```

`mall-search` 通过 Feign 分批拉取：

```java
@FeignClient(name = "mall-course")
public interface CourseClient {

    @GetMapping("/internal/courses/search-documents")
    Result<List<CourseIndexDTO>> listForIndex(
            @RequestParam long afterId,
            @RequestParam int size);
}
```

`mall-course` 提供仅供内部重建使用的接口。查询条件必须包含 `status=1`、`deleted_at IS NULL`、`id > afterId`，并按 `id ASC LIMIT size`，避免 offset 深分页：

```java
@Validated
@RestController
@RequestMapping("/internal/courses")
@RequiredArgsConstructor
public class CourseInternalController {

    private final CourseService courseService;

    @GetMapping("/search-documents")
    @PreAuthorize("hasAuthority('search:sync')")
    public Result<List<CourseIndexDTO>> listForIndex(
            @RequestParam @PositiveOrZero long afterId,
            @RequestParam(defaultValue = "500") @Min(1) @Max(1000) int size) {
        return Result.ok(courseService.listForSearchIndex(afterId, size));
    }
}
```

Feign 继续复用 Day15 的 `Authorization` 请求头传递。即便接口只在内网，也不能因为路径以 `/internal` 开头就默认可信。

### 步骤 9：`SearchController`

创建 `E:\course-mall\mall-search\src\main\java\com\mall\search\controller\SearchController.java`：

```java
package com.mall.search.controller;

import com.mall.common.result.Result;
import com.mall.search.dto.CourseSearchQuery;
import com.mall.search.service.SearchService;
import com.mall.search.vo.CourseSearchResultVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@Validated
@RestController
@RequestMapping("/api/search")
@RequiredArgsConstructor
public class SearchController {

    private final SearchService searchService;

    @GetMapping("/courses")
    public Result<CourseSearchResultVO> search(@Valid CourseSearchQuery query) {
        return Result.ok(searchService.search(query));
    }

    @PostMapping("/admin/indexes/courses/rebuild")
    @PreAuthorize("hasAuthority('search:sync')")
    public Result<Long> rebuild() {
        return Result.ok(searchService.rebuild());
    }
}
```

::: tip 💡 面试题：数据为什么要「双写」MySQL 和 ES？两者一致性怎么保证？
**一句话**：**MySQL 是 source of truth（事务可靠、能精确查询），ES 只是搜索引擎（快、但不做事务）**。用户下单/改课都写 MySQL，ES 靠「全量 + 增量」同步数据用于检索。因为同步有延迟，两者是**最终一致**（短暂不一致可接受）。今天做的是手动**全量同步**，Day 26 的 Canal 监听 MySQL binlog 做**增量同步**，把「改一条课 → ES 跟着变」自动化。详见 [Elasticsearch](/learn_backend/java/微服务/Elasticsearch)、[分布式基础](/learn_backend/java/微服务/分布式基础)。
:::

在 `ErrorCode`、`messages.properties`、`messages_zh_CN.properties` 中补充：

```properties
search.unavailable=Search service is temporarily unavailable
search.index-rebuild-failed=Course index rebuild failed
search.price-range-invalid=Minimum price cannot be greater than maximum price
search.page-window-too-large=Use cursor pagination for deep pages
```

```properties
search.unavailable=搜索服务暂时不可用
search.index-rebuild-failed=课程索引重建失败
search.price-range-invalid=最低价格不能大于最高价格
search.page-window-too-large=深分页请使用游标分页
```

同时给管理员角色分配 `search:sync`。`mall-search` 必须启用 Day04 的资源服务器安全配置和 `@EnableMethodSecurity`，否则上面的 `@PreAuthorize` 不会执行。

### 步骤 10：启动验证

在 `E:\course-mall\` 根目录：

```bash
mvn clean install -DskipTests             # 编译安装所有模块（含新的 mall-search）
mvn -pl mall-search spring-boot:run       # 启动搜索服务（端口 8086）
```

> 启动顺序注意：先确认 ES 已起（步骤 1）、Nacos 已起（Day13），再启动本服务。启动时 Spring Data ES 会自动创建 `course` 索引并写入映射（因为 `createIndex = true`）。

依次 curl 验证：

```bash
# ① 先全量同步：把 MySQL 的 3 门课灌进 ES
curl -X POST "http://localhost:9000/api/search/admin/indexes/courses/rebuild" \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
# 预期返回 data = 3

# ② 关键词搜索 + 高亮（看 title 里 <em>高并发</em>）
curl "http://localhost:9000/api/search/courses?keyword=高并发"

# ③ 不带关键词 = match_all + 聚合（看 byCategory 和 byPrice 三个桶）
curl "http://localhost:9000/api/search/courses"

# ④ 组合筛选：关键词 + 分类 + 价格区间
curl "http://localhost:9000/api/search/courses?keyword=Java&categoryId=2&minPrice=100&maxPrice=300"
```

> ⚠️ 刚同步完**立刻**搜索可能拿到 `total: 0`：ES 写入后要等一次 refresh（默认 `refresh_interval=1s`）才对搜索可见。若 ② 返回 0 条，等 1~2 秒再搜一次即可——这正是「近实时（Near Real-Time）」的含义，也是 ES 不能替代 MySQL 做强一致事务的一个体现。

预期 ② 返回（注意 `highlightTitle` 已把关键词包成 `<em>`）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "total": 1,
    "pageNum": 1,
    "pageSize": 10,
    "records": [
      {
        "id": 1,
        "title": "Java 高并发实战",
        "highlightTitle": "Java <em>高并发</em>实战",
        "score": 1.05,
        "categoryId": 2,
        "price": 199.0
      }
    ],
    "aggregations": {
      "byCategory": [ { "key": "2", "count": 1 } ],
      "byPrice": [ { "key": "100-200", "count": 1 } ]
    }
  }
}
```

预期 ③ 返回：`total = 3`（3 门课全部命中），聚合结果为：

```json
"aggregations": {
  "byCategory": [
    { "key": "2", "count": 1 },
    { "key": "3", "count": 1 },
    { "key": "5", "count": 1 }
  ],
  "byPrice": [
    { "key": "0-100", "count": 1 },
    { "key": "100-200", "count": 1 },
    { "key": "200+", "count": 1 }
  ]
}
```

预期 ④ 只返回 id=1 那一门（关键词 Java 命中标题 + 分类 2 + 价格 199 在区间内）。

还可以直接看 ES 侧验证索引：

```bash
curl "http://localhost:9200/_cat/indices?v"        # 能看到 course 索引
curl "http://localhost:9200/course/_search?pretty" # 能看到 3 条文档
```

## 五、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| 倒排索引、全文检索、高亮、聚合、分页、IK 分词器 | [Elasticsearch](/learn_backend/java/微服务/Elasticsearch) |
| Spring Data Elasticsearch 文档映射 / Repository | [Elasticsearch](/learn_backend/java/微服务/Elasticsearch) |
| ES 与 MySQL 定位、最终一致、双写同步 | [分布式基础](/learn_backend/java/微服务/分布式基础) |
| Feign 内部契约、服务数据所有权 | [OpenFeign](/learn_backend/java/微服务/OpenFeign) |
| Nacos 注册（微服务架构） | [Nacos](/learn_backend/java/微服务/Nacos) |
| Docker 跑 ES 中间件 | [Docker](/learn_maintenance/Docker) |
| `DECIMAL` ↔ `BigDecimal`（同步时转换） | [MySQL](/learn_database/MySQL) |

## 六、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] ES 容器启动成功，`curl http://localhost:9200` 有响应：是 / 否
- [ ] IK 分词器安装成功（`docker exec -it es ./bin/elasticsearch-plugin list` 能看到 ik）：是 / 否
- [ ] `mvn clean install` 通过，`mall-search` 启动成功：是 / 否
- [ ] 管理员调用 `POST /api/search/admin/indexes/courses/rebuild` 成功，普通用户返回 403：是 / 否
- [ ] `GET /api/search/courses?keyword=高并发` 返回结果且 `highlightTitle` 带 `<em>`：是 / 否
- [ ] 非法价格区间、分页窗口被 Validation 拦截：是 / 否
- [ ] 无关键词搜索能看到 `byCategory` / `byPrice` 聚合桶：是 / 否
- [ ] 组合筛选（关键词 + 分类 + 价格区间）能正确过滤：是 / 否
- [ ] 踩坑记录（ES 起不来、IK 版本不匹配、连接报错等）：
- [ ] 疑问（有就写，我来答）：

## 七、我下次会追问的问题（做完先自己想想）

1. 倒排索引是什么？为什么 ES 做全文检索比 MySQL 的 `LIKE '%xx%'` 快？（提示：词典 + 文档列表 vs 全表扫描）
2. `analyzer` 和 `searchAnalyzer` 为什么分开设？`ik_max_word` 和 `ik_smart` 各是什么粒度、分别用在索引还是查询？
3. bool query 里 `must` 和 `filter` 有什么区别？为什么「分类/价格」这类精确条件要用 filter 而不是 must？
4. 高亮是前端自己找关键词实现的吗？ES 返回的 `pre_tags`/`post_tags` 是干嘛的？
5. `from + size` 分页在翻到很深（比如第 1000 页）时会有什么性能问题？为什么？（提示：为 Day 26 的 `search_after` 深分页优化铺路）
