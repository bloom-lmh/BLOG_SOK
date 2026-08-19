# Elasticsearch

> 一句话定位：Elasticsearch（简称 ES）是基于 Apache Lucene 构建的**分布式实时搜索与分析引擎**，把「海量数据的全文搜索、模糊匹配、相关性排序、实时聚合统计」这件事做成了开箱即用的分布式服务——这是关系型数据库 `LIKE '%xx%'` 做不到、也做不快的场景。

## 基础篇

### 为什么需要 ES：从 MySQL 的搜索痛点说起

先别急着看 ES 有什么，先看传统关系型数据库（以 MySQL 为例）为什么「搜不动」。假设电商系统里有一张商品表，用户想搜「华为手机」，最直觉的写法是：

```sql
SELECT * FROM goods
WHERE title LIKE '%华为手机%'
  OR description LIKE '%华为手机%';
```

这段 SQL 背后的三个致命问题：

| 痛点 | 具体表现 | 后果 |
| --- | --- | --- |
| 走不了索引 | `LIKE '%关键词%'` 以 `%` 开头，B+ 树最左前缀失效 | 全表扫描，几百万行逐行比对 |
| 无法分词 | 「华为手机」是一个整体，用户搜「华为 手机」或「华为 P40」就搜不到 | 召回率极低，体验差 |
| 没有相关性排序 | 命中就返回，无法按「哪个更像用户想要的」排序 | 结果一堆，最相关的排后面 |
| 做不了聚合 | 想实时统计「各价格区间的销量分布」，SQL 要写半天还很慢 | 无法支撑实时报表、看板 |

一句话总结：**MySQL 擅长「精确地存、精确地取」，不擅长「模糊地找、按相关性排、实时地算」。**

### ES 是什么：定义与定位

**Elasticsearch** 是一个基于 Lucene 的、**分布式的、近实时的**搜索引擎，底层把 Lucene 的倒排索引能力封装成 HTTP 服务，屏蔽了 Lucene 原生 API 的复杂度，并补齐了 Lucene 天生不具备的**分布式、高可用、水平扩展**能力。

- **诞生背景**：2010 年由 Shay Banon 发布。他最早做的是 Lucene 之上的搜索框架 Compass，后来意识到分布式搜索的通用需求，重写为 Elasticsearch。背后的公司 Elastic 于 2012 年成立。
- **技术栈**：Java 编写，核心依赖 Apache Lucene；数据以 JSON 存储，通过 RESTful API 交互（HTTP + JSON），天然跨语言。
- **名字含义**：Elastic（弹性伸缩）+ search（搜索），指它「能弹性扩容的搜索能力」。

ES 的能力边界，一句话拆成四块：

```
Elasticsearch 的四大能力
├── 全文搜索：分词 + 倒排索引 + 相关性打分（BM25）
├── 结构化分析：聚合 Aggregation，实时 group by / 统计 / 直方图
├── 日志与监控：搭配 Logstash + Kibana 组成 ELK 栈，实时分析日志
└── 地理位置与推荐：geo 查询、completion 自动补全、向量检索（新版本）
```

### ES 与关系型数据库的对照

理解 ES 最快的方式，是把它的概念「翻译」成你熟悉的关系型数据库概念。核心对照表如下：

| ES 概念 | 类比 MySQL | 说明 |
| --- | --- | --- |
| Cluster（集群） | 数据库集群 | 一个或多个节点组成的整体，默认名 `elasticsearch` |
| Node（节点） | 一台数据库实例 | 集群里的一个 ES 进程，默认启动即加入同名集群 |
| Index（索引） | Database | 一类文档的逻辑集合，一个业务建一个索引 |
| Type（类型） | Table | **7.x 起已废弃，8.x 移除**，一个索引只有一个 `_doc` |
| Document（文档） | Row | 一条 JSON 记录，ES 操作的最小单位 |
| Field（字段） | Column | 文档里的一个属性，有类型和是否分词的定义 |
| Mapping（映射） | 表结构 DDL | 定义字段类型、分词器、是否建索引 |
| Shard（分片） | 水平分表 | 把索引切分，分散到不同节点，支持水平扩展 |
| Replica（副本） | 从库/备库 | 分片的冗余备份，高可用 + 分摊读 |
| Segment（段） | - | Lucene 底层不可变的倒排索引文件 |

> 注意一个**方向上的差异**：MySQL 是「先定义表结构再插数据」（强 Schema）；ES 默认是 **Schema on Write 动态映射**——你直接 POST 一个 JSON 进去，ES 会自动推断字段类型建好索引，之后再写入会沿用已固化的映射。

### 核心概念逐个展开

#### Index（索引）

- **背景**：关系型库用「库 + 表」组织数据；ES 用「索引」组织一类文档。
- **定义**：索引是「一类文档」的集合，同时也是一个**物理存储单元**（对应磁盘上一组 Lucene 文件）。一个索引由若干分片组成，分片可分布在多台机器上。
- **规则**：索引名必须小写，不能以 `_`、`-`、`+` 开头，不能包含 `\ / * ? " < > | 空格 , #` 等字符。

#### Document（文档）

- **定义**：一条 JSON 记录。ES 里所有数据都以文档形式存在，是最小的读写单位。
- **规则**：每个文档在被写入时会被分配一个唯一 `_id`（不指定则自动生成 UUID），文档不可「原地更新」，更新本质是删除旧文档 + 写入新文档。

#### Field 与数据类型

字段是文档里的一个属性，每个字段有确定的类型。常用类型在「高级篇」Mapping 一节详细展开，先记住最核心的一组：

| 类型 | 说明 | 是否分词 | 典型场景 |
| --- | --- | --- | --- |
| `text` | 全文文本 | **分词** | 商品标题、文章正文 |
| `keyword` | 精确字符串 | 不分词 | 订单号、状态码、手机号、标签 |
| `long` / `integer` / `short` / `byte` | 整数 | - | 数量、ID |
| `double` / `float` / `half_float` | 浮点数 | - | 价格、评分 |
| `date` | 日期 | - | 下单时间、日志时间 |
| `boolean` | 布尔 | - | 是否删除 |
| `object` / `nested` | 嵌套对象 | - | 复杂 JSON 结构 |

#### Shard 与 Replica（分片与副本）

这是 ES 分布式能力的核心，单独讲透。

- **Shard（主分片）**：把一个索引的数据「切开」，每个分片是一个独立的 Lucene 实例，可落在不同节点上，解决「单机放不下、单机算不动」的问题。
- **Replica（副本分片）**：每个主分片的冗余备份。主分片挂了，副本顶上去（高可用）；读请求也能分摊到副本（读扩展）。

```
一个索引 = N 个主分片（Primary Shard）+ 每个主分片的 M 个副本（Replica）
                    ┌─────────────── 索引（Index）───────────────┐
                    │  P0  │  P1  │  P2  │  P3  │  ...  │  Pn-1 │   ← N 个主分片
                    │ R0 R0│ R1 R1│ R2 R2│ R3 R3│       │Rn-1Rn-1│   ← 每个主分片 M 个副本
                    └────────────────────────────────────────────┘
```

两条**必须背下来的规则**：

1. **主分片数在索引创建后不可修改**（副本数可随时改）。因为文档路由到哪个分片，是 `hash(_id) % 主分片数` 算出来的，改了主分片数，路由公式就崩了，所有数据要重新分布。
2. **一个主分片和它的副本，永远不能落在同一个节点上**（否则节点挂了主备一起死，副本失去意义）。

::: tip 💡 面试题：主分片数量为什么创建后就不能改了？
结论：因为分片路由依赖 `hash(_id) % 主分片数` 这个固定公式，改主分片数会导致所有文档「重新搬家」，且旧路由全部失效。
原因：分片是数据的物理切分单元，数量决定了数据怎么分散；副本只是冗余，可以随时增减不影响路由。所以建索引前要根据数据量预估好主分片数。
:::

### 安装与启动

开发环境最快的方式是用 Docker 拉一个单节点：

```bash
# 拉取并启动单节点 ES（8.x；7.x 用 elasticsearch:7.17.x）
docker run -d \
  --name es \
  -p 9200:9200 -p 9300:9300 \
  -e "discovery.type=single-node" \
  -e "ES_JAVA_OPTS=-Xms512m -Xmx512m" \
  -e "xpack.security.enabled=false" \
  docker.elastic.co/elasticsearch/elasticsearch:8.10.0
```

- **9200 端口**：HTTP REST API，供客户端 / Kibana 访问。
- **9300 端口**：节点间内部通信（transport），集群里节点互相发现、同步用。

启动后验证：

```bash
# 查看集群基本信息（版本、集群名、节点名）
curl http://localhost:9200
# 查看集群健康状态：green / yellow / red
curl http://localhost:9200/_cluster/health
```

ES 的所有操作都是 HTTP 请求，**方法对应动作**：

| HTTP 方法 | 动作 | 类比 |
| --- | --- | --- |
| `GET` | 查询 / 读取 | SELECT |
| `POST` | 新增 / 部分更新（不指定 id 自动生成） | INSERT / 部分 UPDATE |
| `PUT` | 新增 / 覆盖（指定 id） | UPSERT |
| `DELETE` | 删除 | DELETE |
| `HEAD` | 判断是否存在 | EXISTS |

### 索引的增删改查

索引是文档的容器，先学会操作索引本身：

```bash
# 1. 创建索引（带分片和副本设置）
PUT /goods
{
  "settings": {
    "number_of_shards": 3,      # 主分片数：创建后不可改，要预估
    "number_of_replicas": 1     # 副本数：可随时改
  }
}

# 2. 查看索引信息
GET /goods

# 3. 查看所有索引
GET /_cat/indices?v

# 4. 删除索引（危险操作，谨慎）
DELETE /goods
```

### 文档的增删改查（CRUD）

ES 文档操作完整示例：

```bash
# ============ 新增文档 ============
# PUT 指定 id：幂等，重复执行是覆盖（有 id 就更新，无 id 就插入）
PUT /goods/_doc/1
{
  "title": "华为 Mate 60 Pro 手机",
  "brand": "华为",
  "price": 6999.00,
  "stock": 100,
  "on_sale": true,
  "create_time": "2024-01-01T10:00:00"
}

# POST 不指定 id：每次生成新 id（自动生成 UUID）
POST /goods/_doc
{
  "title": "小米 14 手机",
  "brand": "小米",
  "price": 3999.00
}

# ============ 查询文档 ============
# 按 id 精确查一条
GET /goods/_doc/1

# 判断文档是否存在（返回 200 或 404）
HEAD /goods/_doc/1

# ============ 更新文档 ============
# 全量覆盖：PUT 带 id，整个文档被替换（没传的字段就丢了）
PUT /goods/_doc/1
{
  "title": "华为 Mate 60 Pro 手机（改）",
  "brand": "华为",
  "price": 6599.00
  # 注意：stock、on_sale、create_time 会被清掉！
}

# 局部更新：POST _update，只改指定字段，其余保留
POST /goods/_update/1
{
  "doc": {
    "price": 6299.00,
    "stock": 50
  }
}

# ============ 删除文档 ============
DELETE /goods/_doc/1
```

> 注意：`PUT /goods/_doc/1` 是**全量覆盖**，`POST /goods/_update/1` 才是**局部更新**。面试常问二者区别。

### 批量操作 _bulk

一条一条写效率太低，批量导入用 `_bulk`，一次请求带上多个操作：

```bash
# _bulk 语法：每个操作占两行（action 行 + 数据行），换行符结尾
POST /goods/_bulk
{ "index": { "_id": "1" } }
{ "title": "华为手机", "brand": "华为", "price": 6999 }
{ "index": { "_id": "2" } }
{ "title": "小米手机", "brand": "小米", "price": 3999 }
{ "index": { "_id": "3" } }
{ "title": "苹果手机", "brand": "苹果", "price": 9999 }

# 批量删除
POST /goods/_bulk
{ "delete": { "_id": "1" } }
{ "delete": { "_id": "2" } }
```

`_bulk` 支持四种 action：

| action | 作用 |
| --- | --- |
| `index` | 新增/覆盖（有 id 就覆盖） |
| `create` | 仅新增，id 已存在则报错 |
| `update` | 局部更新 |
| `delete` | 删除 |

### 基础篇小结

- ES 是**分布式全文搜索引擎**，解决 MySQL `LIKE` 做不了的模糊搜索、相关性排序、实时聚合。
- 核心概念：Index ≈ 数据库、Document ≈ 行、Mapping ≈ 表结构、Shard 负责切分扩展、Replica 负责高可用。
- 所有操作走 HTTP REST API，方法对应动作；文档操作分 `PUT`（覆盖）和 `POST _update`（局部更新）。
- 两条铁律：**主分片数创建后不可改**；**主分片与副本不能同节点**。

## 高级篇

### Mapping 映射：字段类型与定义

Mapping 就是 ES 的「表结构」，定义每个字段的类型、是否分词、用什么分词器。它是搜索准确率的**根基**——类型定义错了，后面查询、排序、聚合全跟着错。

#### 动态映射 vs 显式映射

- **动态映射（Dynamic Mapping）**：不提前定义，直接 POST 文档，ES 根据 JSON 自动推断类型。省事，但容易推断错（比如字符串到底该是 `text` 还是 `keyword`）。
- **显式映射（Explicit Mapping）**：先定义好字段类型，再写数据。可控、可预测，生产环境推荐。

```bash
# 显式定义 mapping
PUT /goods
{
  "mappings": {
    "properties": {
      "title":   { "type": "text",     "analyzer": "ik_max_word" },  # 标题：分词，用 IK 细粒度
      "brand":   { "type": "keyword" },                              # 品牌：精确匹配，不分词
      "price":   { "type": "double" },                               # 价格：数值，可排序聚合
      "stock":   { "type": "integer" },
      "on_sale": { "type": "boolean" },
      "create_time": { "type": "date", "format": "yyyy-MM-dd HH:mm:ss||yyyy-MM-dd||epoch_millis" }
    }
  }
}
```

#### 字段类型全表

| 类型 | 说明 | 是否分词 | 能否排序/聚合 | 典型场景 |
| --- | --- | --- | --- | --- |
| `text` | 全文文本，被分析器切词 | **分词** | 否（默认禁用 fielddata） | 标题、正文 |
| `keyword` | 精确字符串，原样存储 | 不分词 | 能 | 订单号、状态、标签 |
| `long`/`integer`/`short`/`byte` | 整数 | - | 能 | 数量、ID |
| `double`/`float`/`half_float`/`scaled_float` | 浮点 | - | 能 | 价格、评分 |
| `date` | 日期，底层存毫秒时间戳 | - | 能 | 时间字段 |
| `boolean` | true/false | - | 能 | 开关、是否 |
| `object` | 嵌套 JSON 对象，内部字段被扁平化 | - | - | 一般嵌套 |
| `nested` | 独立文档数组，保持数组内关联 | - | - | 数组对象需要精确匹配时 |
| `geo_point` | 经纬度坐标 | - | - | 附近门店、LBS |
| `ip` | IPv4/IPv6 | - | 能 | 访问 IP |
| `binary` | Base64 二进制 | - | 否 | 图片等（不建议） |

#### text 与 keyword：最易混的一对

这是面试必问、生产必踩的坑，单独讲：

| 维度 | `text` | `keyword` |
| --- | --- | --- |
| 是否分词 | 分词（写入时切词建倒排） | 不分词（整串原样存） |
| 用途 | 全文模糊搜索 | 精确匹配、排序、聚合 |
| 搜索方式 | `match` | `term` |
| 示例 | `title: "华为 Mate 60"` | `order_no: "SO20240101001"` |

**最佳实践**：一个字段既要全文搜又要精确聚合时，用 `fields` 子字段，一次写入两种索引：

```bash
PUT /goods/_mapping
{
  "properties": {
    "brand": {
      "type": "text",                    # 主字段：text，支持全文搜索
      "fields": {
        "keyword": { "type": "keyword", "ignore_above": 256 }  # 子字段：keyword，支持精确聚合
      }
    }
  }
}
# 查询时：brand 用 match 搜全文，brand.keyword 用 term 精确匹配/聚合
```

::: tip 💡 面试题：text 和 keyword 有什么区别？什么时候用哪个？
结论：text 会分词、用于全文搜索；keyword 不分词、整串精确匹配，用于排序、聚合和精确过滤。
原因：两者建立倒排索引的方式不同——text 把一个词切分成多个 term，keyword 把整串当成一个 term。所以搜「苹果手机」这种模糊匹配用 text，匹配订单号、状态码这种精确值用 keyword。
:::

### 分词器（Analyzer）深入

全文搜索的核心动作是「先分词再匹配」，分词的质量直接决定搜索的召回率和准确率。

#### 一个分析器的三段式结构

每个 Analyzer 由三个组件按顺序串起来：

```
输入文本 ──► Character Filter（字符过滤器，可选，预处理字符）
         ──► Tokenizer（分词器，必选，把文本切成一个个词/token）
         ──► Token Filter（词元过滤器，可选，对切好的词再加工）
         ──► 输出 token 列表
```

- **Character Filter**：在分词前对原始字符做处理，如去掉 HTML 标签、把 `&` 转成 `and`。
- **Tokenizer**：核心切词逻辑，如按空格、按标点、按词典切分。
- **Token Filter**：对切出的词做后处理，如转小写、去停用词（的、了、是）、同义词扩展、拼音转换。

#### 内置常用分词器

| 分词器 | 切词规则 | 特点 | 场景 |
| --- | --- | --- | --- |
| `standard` | 按 Unicode 规则按词切分，转小写 | 默认，英文友好，中文按字切 | 英文文本 |
| `simple` | 按非字母切分，转小写 | 简单粗暴 | 简单英文 |
| `whitespace` | 只按空格切 | 不转小写 | 精确按空格 |
| `keyword` | 不切分，整串当一个词 | 相当于不分词 | 精确匹配 |
| `ik_max_word` | 词典最细粒度切分 | 召回率高 | 建索引 |
| `ik_smart` | 词典粗粒度切分 | 准确率高 | 搜索 |
| `pinyin` | 转拼音 | 拼音搜索 | 人名、商品拼音 |

#### 查看分词结果：_analyze API

写搜索前，先用 `_analyze` 看看一个文本到底被切成什么样，这是排查「搜不到」的利器：

```bash
# 查看 standard 分词结果（中文会被按单个字切，效果差）
GET /_analyze
{ "analyzer": "standard", "text": "我是中国人" }
# 结果：我 / 是 / 中 / 国 / 人

# 查看 IK 分词结果（需先安装 ik 插件）
GET /_analyze
{ "analyzer": "ik_smart", "text": "我是中国人" }
# ik_smart 结果：我 / 是 / 中国人

GET /_analyze
{ "analyzer": "ik_max_word", "text": "中华人民共和国国歌" }
# ik_max_word 结果：中华人民共和国 / 中华人民 / 中华 / 华人 / 人民共和国 / 人民 / 共和国 / 共和 / 国 / 国歌
```

#### ik_smart 与 ik_max_word 的取舍

两者都是 IK 分词器提供的策略，区别在**切分粒度**：

- `ik_max_word`：**最细粒度**，把文本切成尽可能多的词。用于**建索引**（写入时多切几个词，搜索时更容易命中，召回率高）。
- `ik_smart`：**粗粒度**，尽量切成有意义的完整词。用于**搜索**（查询词切得准，准确率高）。

#### 自定义分词器

生产环境经常要「IK + 拼音 + 停用词」组合使用，通过自定义 analyzer 实现：

```bash
PUT /goods
{
  "settings": {
    "analysis": {
      "analyzer": {
        "ik_pinyin": {                        # 自定义分析器名
          "type": "custom",
          "tokenizer": "ik_max_word",        # 主分词：IK 最细粒度
          "filter": ["pinyin_filter", "lowercase"]
        }
      },
      "filter": {
        "pinyin_filter": { "type": "pinyin", "keep_first_letter": true, "keep_full_pinyin": false }
      }
    }
  }
}
```

::: tip 💡 面试题：为什么搜索「中国人」有时搜不到「中国」命中的文档？
结论：因为索引和查询使用的分词器不一致，导致同一个文本被切成了不同的词，倒排索引对不上。
原因：比如字段写入时用 `ik_max_word` 切成「中国 / 国人」，查询词「中国人」用 `ik_smart` 切成「中国人」，term 对不上就搜不到。索引端和查询端的分词器要**配合**：通常索引用细粒度、查询用粗粒度。
:::

### 查询 DSL 体系

ES 的查询用一种 JSON 结构表达，叫 **Query DSL（Domain Specific Language）**。核心分三大类：**全文查询**、**精确查询**、**组合查询**。

#### 全文查询（会分词、会打分）

| 查询 | 作用 | 特点 |
| --- | --- | --- |
| `match` | 单字段全文匹配 | 分词后匹配，有相关性打分 |
| `match_phrase` | 短语匹配 | 词必须相邻、顺序一致 |
| `multi_match` | 多字段全文匹配 | 一个词在多个字段里找 |
| `match_all` | 匹配所有文档 | 无条件，配合 filter 用 |
| `query_string` | 类似 Lucene 查询语法 | 支持 AND/OR/通配符，最灵活也最危险 |

```bash
# match：分词后匹配，默认 OR 逻辑，命中词越多分越高
GET /goods/_search
{ "query": { "match": { "title": "华为手机" } } }
# 会切成「华为」「手机」两个词，命中任一个都算，两个都命中分更高

# match_phrase：短语匹配，词序相邻才命中
GET /goods/_search
{ "query": { "match_phrase": { "title": "华为手机" } } }
# 只有 title 里出现连续的「华为手机」才命中

# multi_match：同时搜标题和描述
GET /goods/_search
{
  "query": {
    "multi_match": {
      "query": "华为手机",
      "fields": ["title^3", "description"]   # ^3 表示 title 权重是 description 的 3 倍
    }
  }
}
```

#### 精确查询（不分词、不打分）

| 查询 | 作用 | 特点 |
| --- | --- | --- |
| `term` | 精确值匹配 | 不分词，完全相等才命中 |
| `terms` | 多值精确匹配 | 命中任一个值 |
| `range` | 范围查询 | 数值、日期范围 |
| `exists` | 字段是否存在 | 判断字段有没有值 |
| `prefix` | 前缀匹配 | 不分词，前缀搜索 |
| `wildcard` | 通配符匹配 | `*` `?`，慎用，性能差 |
| `ids` | 按 _id 批量查 | 类似 where id in (...) |
| `fuzzy` | 模糊匹配 | 纠错，容忍拼写错误 |

```bash
# term：精确匹配，keyword 字段用
GET /goods/_search
{ "query": { "term": { "brand.keyword": "华为" } } }

# terms：in 查询
GET /goods/_search
{ "query": { "terms": { "brand.keyword": ["华为", "小米"] } } }

# range：价格在 4000 到 7000 之间
GET /goods/_search
{
  "query": {
    "range": { "price": { "gte": 4000, "lte": 7000 } }
  }
}

# exists：有 create_time 字段的文档
GET /goods/_search
{ "query": { "exists": { "field": "create_time" } } }
```

#### 组合查询 bool

`bool` 是把多个查询条件组合起来的核心，几乎每个真实查询都会用到：

| 子句 | 含义 | 是否打分 | 必须满足 |
| --- | --- | --- | --- |
| `must` | 必须满足，类似 AND | **打分** | 是 |
| `filter` | 必须满足，类似 AND | 不打分（可缓存） | 是 |
| `should` | 应该满足，类似 OR | 打分 | 看 `minimum_should_match` |
| `must_not` | 必须不满足，类似 NOT | 不打分 | 是（取反） |

```bash
GET /goods/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "title": "手机" } }        # 1. 标题必须含「手机」，参与打分
      ],
      "filter": [
        { "term": { "on_sale": true } },         # 2. 必须在售（精确过滤，不打分）
        { "range": { "price": { "gte": 3000, "lte": 8000 } } }  # 3. 价格区间（不打分）
      ],
      "should": [
        { "match": { "brand": "华为" } },         # 4. 满足越多，得分越高（加分项）
        { "match": { "brand": "苹果" } }
      ],
      "must_not": [
        { "term": { "stock": 0 } }               # 5. 排除无库存
      ],
      "minimum_should_match": 1                  # should 至少满足 1 个
    }
  }
}
```

### query context vs filter context

同一个查询，放在 `must`（query 上下文）还是 `filter`（filter 上下文）里，行为完全不同：

| 维度 | query 上下文 | filter 上下文 |
| --- | --- | --- |
| 是否算相关性分 `_score` | 算 | 不算（得分恒为 0 或 1） |
| 结果是否可缓存 | 不缓存 | 可缓存（bit set，快） |
| 性能 | 相对慢 | 快 |
| 回答的问题 | 「这个结果有多匹配」 | 「这个结果满不满足条件」 |

**最佳实践**：精确条件（状态、是否删除、时间范围、ID 集合）一律放 `filter`，需要排名的全文匹配放 `must`。

### 排序、分页、高亮、字段过滤

搜索结果默认按 `_score` 降序，还可配合排序、分页、高亮一起用：

```bash
GET /goods/_search
{
  "query": { "match": { "title": "手机" } },
  "sort": [
    { "price": { "order": "asc" } },       # 先按价格升序
    { "_score": { "order": "desc" } }      # 价格相同再按相关度降序
  ],
  "from": 0,                               # 起始位置（第 0 条起）
  "size": 10,                              # 返回条数
  "highlight": {                           # 高亮命中词
    "fields": { "title": {} },
    "pre_tags": ["<em>"], "post_tags": ["</em>"]
  },
  "_source": ["title", "price", "brand"]   # 只返回需要的字段（省带宽）
}
```

- **`from + size`**：浅分页没问题，深分页有性能陷阱（见原理篇「深分页」）。
- **`_source` 过滤**：只返回指定字段，减少传输体积，是最简单的性能优化。

### 聚合（Aggregation）体系

聚合是 ES 的「group by」，把搜索结果按维度统计。分三类：

1. **Bucket（分桶）**：把文档分到不同「桶」里，类似 group by。
2. **Metric（指标）**：对桶内文档算数值，如 avg、sum、max、min、count。
3. **Pipeline（管道）**：对聚合结果再聚合，如环比、移动平均。

#### Bucket 聚合

| 聚合 | 作用 | 场景 |
| --- | --- | --- |
| `terms` | 按字段值分桶 | 各品牌销量、各状态订单数 |
| `range` | 按数值区间分桶 | 价格区间分布 |
| `date_histogram` | 按时间粒度分桶 | 按天/小时的趋势图 |
| `histogram` | 按数值固定间隔分桶 | 评分 0-1-2-3-4-5 分布 |
| `nested` | 对嵌套对象聚合 | 数组对象 |

#### Metric 聚合

| 聚合 | 作用 |
| --- | --- |
| `avg` / `sum` / `min` / `max` | 平均值 / 求和 / 最小值 / 最大值 |
| `stats` | 一次性返回 count、min、max、avg、sum |
| `cardinality` | 近似去重计数（类似 count(distinct)） |
| `value_count` | 计数 |
| `percentiles` | 百分位 |

#### 完整聚合示例

```bash
# 按品牌统计销量（terms + sum），并算平均价格（avg）
GET /goods/_search
{
  "size": 0,                                # 只要聚合结果，不要文档本身
  "aggs": {
    "by_brand": {                           # 聚合名（自定义）
      "terms": { "field": "brand.keyword", "size": 10 },   # 按品牌分桶
      "aggs": {                             # 桶内再嵌套聚合
        "total_stock": { "sum": { "field": "stock" } },
        "avg_price":   { "avg": { "field": "price" } }
      }
    }
  }
}

# 按天统计销量趋势
GET /goods/_search
{
  "size": 0,
  "aggs": {
    "sales_over_time": {
      "date_histogram": {
        "field": "create_time",
        "calendar_interval": "day",        # 按天分桶，也可 1h、1w、1M
        "format": "yyyy-MM-dd"
      },
      "aggs": {
        "daily_count": { "value_count": { "field": "brand.keyword" } }
      }
    }
  }
}
```

> 注意：`text` 字段默认**不能**用于聚合和排序（因为被分词了，没有单一值）。要对字符串聚合，用它的 `keyword` 子字段，或直接定义成 `keyword` 类型。

### 深分页问题与解决方案

`from + size` 翻到很深时（如第 10000 条）会非常慢，原因是：ES 要在**每个分片上都取出 `from + size` 条**，送到协调节点再全局排序取前 `size` 条，越深每个分片要取的数据越多。

```
深分页为什么慢：from=10000, size=10，3 个分片
每个分片都要取 10010 条 ──► 共 30030 条 ──► 协调节点排序 ──► 取第 10001~10010 条
                 ▲ 大量数据被取出又丢弃，纯浪费
```

**三种解法**：

| 方案 | 原理 | 优点 | 缺点 |
| --- | --- | --- | --- |
| `search_after` | 用上一页最后一条的排序值作游标 | 性能稳定，可实时翻页 | 只能顺序翻，不能跳页 |
| `scroll` | 生成快照游标 | 适合全量导出、批量处理 | 有状态，不适合实时交互 |
| 限制深度 | 业务上限制最多翻几页 | 最简单 | 治标不治本 |

```bash
# search_after：第一次查询不带 search_after，拿最后一条的 sort 值
GET /goods/_search
{
  "query": { "match": { "title": "手机" } },
  "sort": [ { "price": "asc" }, { "_id": "asc" } ],   # 排序字段要唯一，否则会漏数据
  "size": 10
}
# 拿到最后一条的 sort 值（如 [3999, "2"]），作为下一页的 search_after
GET /goods/_search
{
  "query": { "match": { "title": "手机" } },
  "sort": [ { "price": "asc" }, { "_id": "asc" } ],
  "search_after": [3999, "2"],                        # 从这个位置继续往后取
  "size": 10
}

# scroll：先开启快照，再滚动取数，最后清理
POST /goods/_search?scroll=1m
{ "size": 1000, "query": { "match_all": {} } }
# 返回 _scroll_id，后续用这个 id 滚动取
POST /_search/scroll
{ "scroll": "1m", "scroll_id": "上一步返回的_scroll_id" }
# 用完清理
DELETE /_search/scroll
{ "scroll_id": "上一步返回的_scroll_id" }
```

### 高级篇小结

- Mapping 决定字段类型与分词，`text` 分词用于搜索、`keyword` 精确用于排序聚合，需要两者兼顾用 `fields` 子字段。
- 分词器 = Character Filter + Tokenizer + Token Filter，中文用 IK；索引和查询分词器要配合。
- 查询分全文（`match` 等，打分）与精确（`term` 等，不打分），`bool` 组合 `must/filter/should/must_not`。
- 精确条件用 `filter`（可缓存），排名用 `query`；聚合替代 group by；深分页用 `search_after`/`scroll`。

## 原理篇

### 倒排索引：ES 快的本质

前面反复说「倒排索引」，这里下到数据结构层把它讲透。ES 全文搜索之所以快，全系于此。

#### 正排索引 vs 倒排索引

- **正排索引（Forward Index）**：文档 → 词。记录「这篇文档里有哪些词」，查询时要遍历所有文档一个个比对，慢。
- **倒排索引（Inverted Index）**：词 → 文档。提前把「这个词出现在哪些文档」建好，查询时按词直接命中，快。

```
文档集合：
  doc1：我爱学习 Java
  doc2：我爱 Java 编程
  doc3：Java 是世界上最好的语言

正排索引（文档 → 词）：
  doc1 -> [我, 爱, 学习, Java]
  doc2 -> [我, 爱, Java, 编程]
  doc3 -> [Java, 是, 世界, 上, 最好, 的, 语言]

倒排索引（词 → 文档）：
  我    -> [doc1, doc2]
  爱    -> [doc1, doc2]
  学习  -> [doc1]
  Java  -> [doc1, doc2, doc3]
  编程  -> [doc2]
  是    -> [doc3]
  ...
```

搜「Java」时，直接拿「Java」这个词查倒排索引，命中文档列表 `[doc1, doc2, doc3]`，**不用扫描任何一篇文档内容**——这就是全文搜索快的本质。

::: tip 💡 面试题：倒排索引为什么快？
结论：因为它把「按文档找词」变成了「按词找文档」，查询时按词直接定位命中文档列表，时间复杂度从 O(全部文档) 降到 O(命中文档数)。
原因：正排索引查询要遍历所有文档逐篇比对，倒排索引在写入时就预先建立了「词 → 文档列表」的映射，查询变成一次哈希/二分查找，天然免去全量扫描。
:::

#### 倒排索引的完整内部结构

一个词的倒排索引不只是「词 → 文档 id 列表」这么简单，完整的 Lucene 倒排索引由三部分组成：

```
倒排索引的三大结构
┌──────────────────────────────────────────────────────────┐
│ 1. Term Dictionary（词项字典）                            │
│    所有 term 的集合，按字典序排序，是「词 → 元数据」的索引  │
│    ┌──────────┬─────────────────────────────┐            │
│    │ term     │ docFreq（文档频率）            │            │
│    │ Java     │ 3                           │            │
│    │ 学习     │ 1                           │            │
│    │ 编程     │ 1                           │            │
│    └──────────┴─────────────────────────────┘            │
├──────────────────────────────────────────────────────────┤
│ 2. Term Index（词项索引，FST 内存结构）                    │
│    对 Term Dictionary 的「索引的索引」，加速 term 定位      │
│    用 FST（有限状态转换器）把 term 前缀压缩成有向图         │
│    常驻内存，查 term 先走这里，不用遍历整个字典             │
├──────────────────────────────────────────────────────────┤
│ 3. Posting List（倒排列表 / 倒排表）                      │
│    每个 term 对应一个「命中文档列表」，是真正存命中的地方   │
│    ┌────────────┬──────────────────────────────┐          │
│    │ 文档 id    │ 附加信息                       │          │
│    │ doc1       │ 位置、词频、偏移量（支持高亮）   │          │
│    │ doc2       │ ...                          │          │
│    └────────────┴──────────────────────────────┘          │
│    Posting List 里还带 Skip List（跳跃表）加速交集          │
└──────────────────────────────────────────────────────────┘
```

- **Term Dictionary**：存所有词及词的元信息（如文档频率），按字典序排好，存在磁盘。
- **Term Index**：Term Dictionary 太大不能全放内存，于是用 **FST（Finite State Transducer，有限状态转换器）** 把 term 的前缀结构压缩成一个有向无环图，**极小、常驻内存**，查询时先查 FST 快速定位 term 在字典里的位置。FST 是 ES/Lucene 内存占用低的关键。
- **Posting List**：真正记录「词出现在哪些文档」的列表，为了支持短语匹配、高亮，还额外存了每个命中的**词频、位置、偏移量**。

#### 多词查询的交集：Skip List 跳跃表

搜「Java 编程」是两个词，需要把「Java」和「编程」两个 Posting List **取交集**。若两列表都很长，暴力归并慢，于是 Posting List 里加了 **Skip List（跳跃表）**，每隔一段记录一个跳跃点，归并时可以「跳着走」，把交集时间从 O(m+n) 降到接近 O(命中数)。

```
Posting List + Skip List 加速交集
  Java  -> [1, 3, 5, 7, 9, 11, 13, 15, ...]   (带跳跃点)
  编程  -> [2, 5, 6, 7, 10, 13, ...]

  归并时：Java 在 1，编程在 2；Java 跳到 3，再跳到 5 —— 命中 5
  跳过大量不可能命中的中间项，只走跳跃点，快
```

### Lucene 底层：Segment 与段合并

ES 的「近实时」「段不可变」「段合并」这些特性，都源自 Lucene 的 Segment 机制。

#### Segment 是什么

- **定义**：Segment（段）是 Lucene 最底层、**不可变**的倒排索引文件。一个索引由多个 Segment 组成。
- **不可变**：Segment 一旦生成就**只读不写**。这是 ES 能做到「写入不阻塞读取、天然并发安全」的根本原因。
- **删除是标记**：删除文档时不在 Segment 里物理删，而是在一个 `.del` 文件里标记「这个文档已删除」，查询时过滤掉，等到段合并时才真正物理删除。所以**删除后磁盘空间不会立刻释放**。

```
索引 = 多个不可变 Segment 的叠加
  Index ──► Segment1 (倒排索引, 只读)
         ├─► Segment2 (倒排索引, 只读)
         ├─► Segment3 (倒排索引, 只读)
         └─► ...（新写入 → 新 Segment；删除 → .del 标记）
```

#### 段合并（Segment Merge）

Segment 越写越多，小段太多会拖慢查询（要遍历多个段取结果合并），于是 Lucene 后台会自动把**多个小段合并成一个大段**：

- 合并时：真正物理删除被标记的文档、释放空间、去掉冗余。
- 合并是 IO 和 CPU 密集型操作，是 ES 偶发性能抖动的主因之一。
- 可用 `POST /index/_forcemerge?max_num_segments=1` 手动触发合并（一般只在数据导入完成后做一次）。

### 写入流程：为什么 ES 是「近实时」

这是 ES 最经典的原理题。文档从「写入」到「能被搜索」，中间有一段约 1 秒的延迟，因为数据要经过几个缓冲环节。完整流程如下：

```
                    写入流程（近实时 = 1s 左右可见）
                            ┌──────────────┐
  写入请求 ────────────────► │ 内存 Buffer   │  ① 先写内存缓冲，快
                            └──────┬───────┘
                                   │ 同时
                            ┌──────▼───────┐
                            │  Translog    │  ② 写事务日志，防止宕机丢数据
                            │ （磁盘日志）  │
                            └──────────────┘

   每 1 秒（refresh_interval，默认 1s）：
   内存 Buffer ──refresh──► 生成新 Segment ──► 进入「可搜索」状态（近实时的来源）

   满足 flush 条件（translog 到阈值 / 每 30min）：
   Segment 落盘 + 生成 commit point + 清空 translog（真正持久化）
```

分四步讲清：

1. **写 Buffer + Translog**：文档先写入**内存 Buffer**（快，但不持久、不可搜），**同时**追加到磁盘的 **Translog（事务日志）**。Translog 是「先写日志再写数据」的 WAL（Write-Ahead Log）思想，保证宕机后能重放恢复。
2. **Refresh（默认 1s）**：ES 每秒自动把内存 Buffer 刷成一个**新的 Segment**，Segment 一旦生成即可被搜索。所以写入的数据**最多延迟 1 秒才可搜索**——这就是「近实时（Near Real Time, NRT）」的由来。
3. **Flush（持久化）**：当 Translog 达到阈值（默认 512MB）或每隔 30 分钟，ES 执行 flush：把内存里的 Segment 真正 `fsync` 落盘、写入 commit point，然后**清空 Translog**。
4. **崩溃恢复**：宕机时，已 flush 的数据在 Segment 里，未 flush 的数据靠 Translog 重放恢复。

两个核心参数：

| 参数 | 默认 | 作用 | 调优方向 |
| --- | --- | --- | --- |
| `refresh_interval` | 1s | 多久刷一次 Segment 让数据可搜 | 批量导入时调大到 30s/60s，甚至 `-1` 关掉，导入完再恢复 |
| `translog.durability` | request | 每次写请求后 fsync translog | 异步批量导入可改 `async` 提吞吐，但可能丢最近数据 |

::: tip 💡 面试题：为什么说 ES 是「近实时」而不是「实时」？
结论：因为文档写入后先落在内存 Buffer，要等下一次 refresh（默认 1 秒）生成新 Segment 后才能被搜索，存在约 1 秒的可见性延迟。
原因：ES 用「每秒刷一个不可变 Segment」换取写入不阻塞读取和高吞吐，代价就是数据从「写进去」到「搜得到」有 1 秒左右的时间差，所以叫近实时而非实时。
:::

### 查询流程：两阶段 query then fetch

一个搜索请求从协调节点发出到返回结果，分两个阶段：

```
查询流程（两阶段）
第一阶段 query phase（收集打分排序后的 doc id）
  协调节点 ──广播查询──► 分片 P0 ──本地查询──► 返回 {doc id, sort 值, _score}
              │            分片 P1 ──本地查询──► 返回 {doc id, sort 值, _score}
              │            分片 R0（副本）──► 也可分担读
              ▼
        协调节点合并排序，取出全局前 N 个 doc id

第二阶段 fetch phase（按 doc id 取回完整文档）
  协调节点 ──按 doc id──► 对应分片 ──► 返回完整文档 JSON
              ▼
        协调节点组装最终结果返回客户端
```

1. **Query Phase**：协调节点把请求广播到相关分片（主分片或副本之一），每个分片在本地完成查询、算分、排序，返回的**不是完整文档，而是「文档 id + 排序值 + 得分」**。
2. **Fetch Phase**：协调节点把各分片返回的排序结果合并，确定全局前 N 个，再按 doc id 去对应分片**取回完整文档**，组装返回。

> 这正是 `from + size` 深分页慢的原因：query 阶段每个分片都要本地取 `from + size` 条参与全局排序，越深越浪费。

### 相关性打分：TF-IDF 到 BM25

搜索结果的 `_score` 是怎么算出来的？ES 5.0 之前默认 TF-IDF，5.0 起默认 **BM25**（Best Matching 25），是 TF-IDF 的改进版。

BM25 的核心思想：**一个词对一篇文档的得分，取决于「这个词在这篇文档里出现多频繁（词频 TF），同时这个词在整个语料里越稀有（逆文档频率 IDF）越有价值」，再用文档长度做归一化。**

```
BM25 评分三要素
├── TF（词频）：词在本文档出现越多，得分越高（但有饱和，不会无限涨）
├── IDF（逆文档频率）：词在整个索引里越稀有，权重越高（「的、了」权重低，「倒排索引」权重高）
└── 文档长度归一化：同样出现一次，短文档比长文档更相关
```

要点记忆：

- **TF 饱和**：BM25 对词频做了非线性压缩，一个词出现 100 次不会比出现 20 次得 5 倍的分数，避免长文档「刷词」作弊。
- **IDF 区分度**：停用词（的、是、在）几乎每篇都有，IDF 极低；专有名词（Elasticsearch、BM25）稀有，IDF 极高。
- 打分公式、字段权重（boost）、`function_score` 都能自定义，但默认 BM25 已够大多数场景。

### 集群架构与分布式原理

#### 节点角色

一个 ES 集群由不同角色的节点组成，一个节点可身兼多职：

| 角色 | 作用 | 说明 |
| --- | --- | --- |
| Master-eligible（候选主节点） | 负责集群管理 | 建删索引、分片分配、集群状态维护 |
| Data（数据节点） | 存数据、执行读写 | 存分片、跑查询聚合 |
| Ingest（摄取节点） | 数据预处理 | 写入前执行 pipeline（如解析、转换） |
| Coordinating（协调节点） | 转发请求 | 每个节点默认都是，负责请求分发与结果合并 |
| ML / Transform | 机器学习 / 数据转换 | 专门任务节点（较新版本） |

#### 文档路由：写入落到哪个分片

写入时，ES 用**路由公式**决定文档落到哪个主分片：

```
shard_num = hash(_routing) % number_of_primary_shards
            └── _routing 默认取 _id，也可自定义
```

- `_routing` 默认等于 `_id`，所以**同一个文档 id 永远路由到同一个分片**。
- 这也是「主分片数不可改」的底层原因：分片数是取模运算的分母，改了分母，所有文档的落点全变。

#### 主分片与副本的读写协调

```
读写协调
写请求 ──► 协调节点 ──► 主分片 P0（写入 + 同步） ──► 副本 R0（同步写入）
                        └── P0 写完，副本同步完成后才返回成功（默认）

读请求 ──► 协调节点 ──► 主分片 P0 或 副本 R0 任一（负载均衡，分摊读压力）
```

- **写**：先写主分片，主分片再把变更同步到副本，**副本同步完成才返回写成功**（默认 `wait_for_active_shards`），保证一致性。
- **读**：主分片和副本都能读，协调节点用轮询等方式分摊读压力，副本越多读吞吐越高。

#### 集群健康状态

| 状态 | 含义 | 是否可用 |
| --- | --- | --- |
| `green` | 所有主分片和副本都正常分配 | 完全健康 |
| `yellow` | 所有主分片正常，但有副本未分配 | 可读写，但副本缺失，有单点风险 |
| `red` | 有主分片未分配 | 部分数据不可读写 |

> 单节点部署时常见 `yellow`：因为副本和主分片不能同节点，副本无处安放，状态就是 yellow。这是**正常现象**，不是故障。

#### 主节点选举与脑裂

- **选举**：候选主节点之间通过投票选出主节点，需要**超过半数**（quorum，`候选主节点数 / 2 + 1`）同意才能成为主节点。
- **脑裂（Split Brain）**：网络分区把集群切成两块，各自选出主节点，形成两个主节点同时服务，导致数据不一致。ES 7.x 起用 quorum 选举规则自动规避：**少数派拿不到半数票，选不出主节点，自动放弃**。

::: tip 💡 面试题：什么是脑裂？ES 怎么避免？
结论：脑裂是网络分区导致集群出现多个主节点、各自写数据造成不一致；ES 通过「超过半数投票才能当主」的 quorum 机制规避。
原因：集群被网络切成两部分后，两边都想选出自己的主节点。ES 规定候选主节点必须获得「候选主节点数 / 2 + 1」的票数才能当选，少数派永远凑不够半数，选不出主节点，只能暂停服务，从而保证任意时刻只有一个主节点。
:::

### 乐观并发控制：version 与 seq_no

ES 是分布式系统，并发写同一文档需要并发控制。它不用悲观锁，用**乐观锁**：

| 机制 | 说明 |
| --- | --- |
| `_version` | 文档版本号，每次写 +1，写时指定版本号，不匹配则冲突 |
| `seq_no` | 每个分片内的单调递增序号，记录写入顺序 |
| `primary_term` | 主分片任期号，主分片每次切换 +1 |

```bash
# 乐观并发控制：指定 version，版本不匹配则写失败（返回 409 冲突）
PUT /goods/_doc/1?version=3
{ "title": "华为手机", "price": 6999 }

# 用 if_seq_no + if_primary_term 做更精确的并发控制（推荐）
PUT /goods/_doc/1?if_seq_no=10&if_primary_term=1
{ "title": "华为手机", "price": 6599 }
```

### 数据一致性模型总结

把前面的机制串起来，ES 的一致性到底如何：

| 维度 | 表现 |
| --- | --- |
| 写入可见性 | 近实时，约 1s 延迟（refresh 机制） |
| 写入可靠性 | Translog 保证崩溃后可恢复（WAL） |
| 主备一致性 | 写主同步副本后才返回成功，读可能读到旧值（弱一致/最终一致） |
| 并发控制 | 乐观锁（version / seq_no + primary_term） |

一句话：**ES 是「近实时 + 最终一致」的系统，牺牲了一点强一致，换来了高吞吐和水平扩展能力**。这也是它不能替代 MySQL 做「账户余额」这类强一致业务的原因。

### 性能优化与调优体系

面试和实战都高频，把常用优化手段成体系列出来：

| 优化方向 | 手段 | 原理 |
| --- | --- | --- |
| 写入优化 | 用 `_bulk` 批量写 | 减少网络往返和刷新次数 |
| 写入优化 | 批量导入时调大 `refresh_interval` 甚至 `-1` | 减少 Segment 生成频率，省 IO |
| 写入优化 | 先关副本，导完再开 | 副本同步是额外开销，导完一次性补 |
| 查询优化 | 精确条件用 `filter` 不用 `must` | filter 可缓存，不打分 |
| 查询优化 | 用 `_source` 只返回需要的字段 | 减少传输和反序列化开销 |
| 查询优化 | 深分页用 `search_after`/`scroll` | 避免分片间大量取数排序 |
| 索引设计 | 主分片数合理预估 | 分片数过多或过少都影响性能 |
| 索引设计 | 冷热数据分离（hot/warm/cold） | 不同硬件成本分配合适节点 |
| 硬件/JVM | 堆内存设为物理内存的一半，且不超过 32GB | JVM 堆过大 GC 停顿长，压缩指针失效 |
| 硬件/JVM | 禁用 swap（`bootstrap.memory_lock=true`） | swap 到磁盘性能雪崩 |
| 硬件/JVM | 用 SSD | Segment 随机读依赖磁盘 IOPS |
| 段管理 | 导入完 `_forcemerge` 一次 | 减少小段，提升查询，释放删除空间 |

### 原理篇小结

- 倒排索引 = Term Dictionary + Term Index（FST 内存压缩）+ Posting List（带跳跃表），是全文搜索快的本质。
- Segment 不可变是「近实时」「删除标记」「段合并」的根源。
- 写入走 Buffer → Refresh（1s，近实时）→ Flush（落盘 + 清 Translog），Translog 保数据不丢。
- 查询走 query then fetch 两阶段；打分用 BM25；文档路由 `hash(_id) % 主分片数`；集群靠 quorum 选主防脑裂。
- ES 是近实时 + 最终一致，用乐观锁做并发控制，适合搜索分析、不适合强一致业务。

## 面试常问

**1. ES 和 MySQL 有什么区别？为什么搜索要用 ES？**
结论：MySQL 用 B+ 树做精确查询和事务，ES 用倒排索引做全文搜索和聚合，两者定位不同、常搭配使用。
展开：MySQL 的 B+ 树适合等值和前缀查询，`LIKE '%xx%'` 走不了索引只能全表扫描，也无法分词和相关性排序；ES 的倒排索引天然按「词」定位文档，全文搜索快几个数量级。所以 MySQL 存「源数据」，ES 做「搜索副本」，通过同步（Canal / Logstash / MQ）保持一致。

**2. 什么是倒排索引？**
结论：倒排索引是「词 → 文档列表」的映射，把「按文档找词」变成「按词找文档」，搜索时按词直接命中，避免全表扫描。
展开：正排索引记录「这篇文档有哪些词」，查询要遍历所有文档；倒排索引提前把「这个词出现在哪些文档」建好，查询一次哈希/二分定位即可。内部由 Term Dictionary、Term Index（FST 内存结构）、Posting List（带跳跃表）三部分组成。

**3. ES 为什么是「近实时」而不是「实时」？**
结论：文档写入先落内存 Buffer，要等下一次 refresh（默认 1 秒）生成新 Segment 后才能被搜索，有约 1 秒可见性延迟。
展开：ES 用「每秒刷一个不可变 Segment」换取写入不阻塞读取和高吞吐，代价是数据从写入到可搜索有约 1 秒延迟。同时写入会记录 Translog，崩溃后可恢复，保证不丢数据。

**4. text 和 keyword 的区别？term 和 match 的区别？**
结论：text 会分词、用于全文搜索，keyword 不分词、用于精确匹配/排序/聚合；term 不分词精确匹配，match 先分词再全文匹配。
展开：text 字段写入时被切词建立倒排索引，适合 `match` 查询；keyword 整串存成一个 term，适合 `term` 精确匹配和聚合。要兼顾两者，用 `fields` 子字段把同一字段同时建成 text 和 keyword。

**5. ES 的写入流程是怎样的？**
结论：文档写入内存 Buffer 并同步写 Translog，每秒 refresh 生成新 Segment 使其可搜索，满足条件时 flush 落盘并清空 Translog。
展开：Buffer 是内存暂存、快但不持久；Translog 是 WAL，崩溃后重放恢复；refresh 决定可见性（近实时来源）；flush 决定持久化（默认 translog 512MB 或 30min 触发）。

**6. 深分页为什么慢？怎么解决？**
结论：`from + size` 深分页时每个分片都要取 `from + size` 条再全局排序，越深越浪费；用 `search_after` 或 `scroll` 替代。
展开：query 阶段各分片本地取数、fetch 阶段再合并，深度大时大量数据取出又丢弃。search_after 用排序值做游标顺序翻页、性能稳定；scroll 生成快照适合全量导出。ES 默认 `max_result_window=10000` 限制 `from + size` 深度。

**7. ES 集群的脑裂是什么？怎么避免？**
结论：网络分区导致集群出现多个主节点、数据不一致；ES 用「超过半数投票才能当主」的 quorum 机制规避。
展开：集群被切分后两边都想选主，ES 规定候选主节点须获得「候选主节点数 / 2 + 1」票数才能当选，少数派凑不够半数、选不出主节点，从而保证任意时刻只有一个主节点。

**8. ES 如何保证高可用和数据一致性？**
结论：通过分片副本、Translog、乐观锁实现；一致性是「近实时 + 最终一致」而非强一致。
展开：副本在主分片挂了时顶上保证高可用；Translog 保证崩溃后数据可恢复；version / seq_no + primary_term 做乐观并发控制。ES 牺牲强一致换取高吞吐，所以不适合账户余额等强一致业务。

## 相关知识

- [分布式基础](/learn_backend/java/微服务/分布式基础)：ES 的分布式路由、副本、一致性模型，与 CAP 理论、分布式共识一脉相承。
- [MySQL](/learn_database/MySQL)：ES 与 MySQL 的分工——MySQL 存源数据做精确查询和事务，ES 做搜索副本。
- [Redis](/learn_database/Redis)：同为高性能数据组件，Redis 侧重缓存/计数/排行榜，ES 侧重搜索/聚合。
- [Nacos](/learn_backend/java/微服务/Nacos) · [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)：微服务体系中 ES 通常作为独立的搜索服务被调用，注册与发现依赖这些组件。
- [JVM](/learn_backend/java/Java核心/JVM)：ES 是 Java 程序，堆内存、GC 调优（堆不超过 32GB、禁用 swap）直接影响其性能。



