# Day 02 · 数据库设计（建表 SQL + 索引设计）

> **今天目标**：把「课程商城」的核心表设计出来并建好。表结构不是随便建——每个字段、每个索引背后都有「为什么要这样」的理由，这些就是面试会问的点。

## 一、前置条件

- 已完成 Day 01（Maven 多模块骨架能跑通）
- MySQL 已装（本机 `8.4.7` ✅，已确认）

## 二、整体设计：11 张表，分 3 个域

| 域 | 表 | 作用 |
|---|---|---|
| **基础域** | `user` 用户 | 登录、鉴权、个人信息 |
| | `category` 分类 | 课程分类（支持父子，做树形） |
| | `teacher` 讲师 | 讲师信息 |
| | `course` 课程 | 课程主体（价格、上下架、浏览量） |
| | `chapter` 章节 | 课程下面的章 |
| | `lesson` 课时 | 章节下面的课（视频） |
| **交易域** | `orders` 订单 | 订单主表 |
| | `order_item` 订单明细 | 订单里的商品快照 |
| | `payment` 支付 | 支付记录 |
| **秒杀域** | `seckill_activity` 秒杀活动 | 秒杀场次 + 库存 |
| | `seckill_order` 秒杀订单 | 秒杀成功记录（限购） |

::: tip 💡 面试题：为什么订单要拆成 `orders`（主表）+ `order_item`（明细表）？
**一句话**：一个订单可能买多件商品，明细表承载「这个订单买了哪些、每件多少钱」。拆开后，订单状态（支付/取消）和商品快照（title/price）各归各的表，扩展和查询都清晰。更重要的是——**明细表存的是商品「快照」**：下单那一刻的标题、价格固化下来，之后课程改价/改名不影响历史订单。
:::

## 三、建库 + 建表 SQL

> 把下面的 SQL 存成 `E:\course-mall\sql\schema.sql`（代码目录里），用 Navicat / DataGrip / 命令行执行即可。分 3 段，方便你一段段看。

### 3.1 建库

```sql
-- =====================================================
-- 课程商城 course-mall · 数据库设计
-- MySQL 8.4 · InnoDB · utf8mb4
-- 保存路径：E:\course-mall\sql\schema.sql
-- =====================================================

CREATE DATABASE IF NOT EXISTS `course_mall`
    DEFAULT CHARACTER SET utf8mb4      -- utf8mb4 能存 emoji，utf8 不行
    COLLATE utf8mb4_general_ci;

USE `course_mall`;

-- 本项目不建物理外键：微服务/分库分表场景下，物理外键会导致跨库约束失效、锁竞争，
-- 关系一律用「逻辑外键」（字段 + 代码保证）。这是大厂主流做法。
SET FOREIGN_KEY_CHECKS = 0;
```

### 3.2 基础域（6 张表）

```sql
-- ---------------------------------------------------------
-- 1. 用户表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `user`;
CREATE TABLE `user` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键，自增；Day24 分库分表时会换成雪花ID',
    `username`    VARCHAR(50)  NOT NULL                COMMENT '登录名（唯一）',
    `password`    VARCHAR(100) NOT NULL                COMMENT '密码（BCrypt 加密后的密文，绝不存明文）',
    `nickname`    VARCHAR(50)  DEFAULT NULL            COMMENT '昵称',
    `avatar`      VARCHAR(255) DEFAULT NULL            COMMENT '头像 URL',
    `phone`       VARCHAR(20)  DEFAULT NULL            COMMENT '手机号',
    `email`       VARCHAR(50)  DEFAULT NULL            COMMENT '邮箱',
    `status`      TINYINT      NOT NULL DEFAULT 1      COMMENT '状态：1启用 0禁用',
    `deleted`     TINYINT      NOT NULL DEFAULT 0      COMMENT '逻辑删除：0正常 1已删（MyBatis-Plus 会自动处理）',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_username` (`username`)              -- 唯一索引：登录名不能重复，也加速按用户名查询
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';

-- ---------------------------------------------------------
-- 2. 课程分类表（parent_id 自关联，做成树）
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `category`;
CREATE TABLE `category` (
    `id`          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    `parent_id`   BIGINT      NOT NULL DEFAULT 0       COMMENT '父分类ID，0 表示顶级分类（自关联实现多级）',
    `name`        VARCHAR(50) NOT NULL                COMMENT '分类名',
    `sort`        INT         NOT NULL DEFAULT 0       COMMENT '排序值，越小越靠前',
    `create_time` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_parent_id` (`parent_id`)                  -- 按父分类查子分类（树形查询）要走这个索引
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程分类表';

-- ---------------------------------------------------------
-- 3. 讲师表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `teacher`;
CREATE TABLE `teacher` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `name`        VARCHAR(50)  NOT NULL                COMMENT '讲师姓名',
    `avatar`      VARCHAR(255) DEFAULT NULL            COMMENT '头像 URL',
    `intro`       TEXT                                 COMMENT '讲师简介（长文本，用 TEXT）',
    `position`    VARCHAR(100) DEFAULT NULL            COMMENT '头衔，如「阿里高级工程师」',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='讲师表';

-- ---------------------------------------------------------
-- 4. 课程表（核心表）
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `course`;
CREATE TABLE `course` (
    `id`             BIGINT         NOT NULL AUTO_INCREMENT COMMENT '主键',
    `teacher_id`     BIGINT         NOT NULL                COMMENT '讲师ID（逻辑外键 → teacher.id）',
    `category_id`    BIGINT         NOT NULL                COMMENT '分类ID（逻辑外键 → category.id）',
    `title`          VARCHAR(100)   NOT NULL                COMMENT '课程标题',
    `cover`          VARCHAR(255)   DEFAULT NULL            COMMENT '封面 URL',
    `price`          DECIMAL(10,2)  NOT NULL DEFAULT 0.00   COMMENT '售价（元）。金额必须用 DECIMAL，不能用 float/double，否则精度丢失',
    `original_price` DECIMAL(10,2)  DEFAULT NULL            COMMENT '原价，用于展示划线价/秒杀对比',
    `description`    TEXT                                   COMMENT '课程详情（富文本）',
    `status`         TINYINT        NOT NULL DEFAULT 0      COMMENT '状态：1已上架 0下架',
    `view_count`     INT            NOT NULL DEFAULT 0      COMMENT '浏览量（读多写多，可放 Redis 异步回写）',
    `buy_count`      INT            NOT NULL DEFAULT 0      COMMENT '购买量',
    `deleted`        TINYINT        NOT NULL DEFAULT 0      COMMENT '逻辑删除',
    `create_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_category_id` (`category_id`),                  -- 按分类查课程
    KEY `idx_teacher_id`  (`teacher_id`),                   -- 按讲师查课程（关联查询）
    KEY `idx_status`      (`status`)                        -- 前台只查「已上架」的课程
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课程表';

-- ---------------------------------------------------------
-- 5. 章节表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `chapter`;
CREATE TABLE `chapter` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `course_id`   BIGINT       NOT NULL                COMMENT '所属课程（逻辑外键 → course.id）',
    `title`       VARCHAR(100) NOT NULL                COMMENT '章节标题',
    `sort`        INT          NOT NULL DEFAULT 0      COMMENT '章节排序',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_course_id` (`course_id`)                   -- 按课程查它的所有章节
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='章节表';

-- ---------------------------------------------------------
-- 6. 课时表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `lesson`;
CREATE TABLE `lesson` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `chapter_id`  BIGINT       NOT NULL                COMMENT '所属章节（逻辑外键 → chapter.id）',
    `title`       VARCHAR(100) NOT NULL                COMMENT '课时标题',
    `video_url`   VARCHAR(255) DEFAULT NULL            COMMENT '视频地址（Day9 文件上传后填充）',
    `duration`    INT          DEFAULT 0               COMMENT '时长（秒）',
    `sort`        INT          NOT NULL DEFAULT 0      COMMENT '排序',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_chapter_id` (`chapter_id`)                -- 按章节查课时
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='课时表';
```

### 3.3 交易域（3 张表）

```sql
-- ---------------------------------------------------------
-- 7. 订单主表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
    `id`           BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `order_no`     VARCHAR(64)   NOT NULL                COMMENT '订单号（唯一，对用户可见，如 20260819...）',
    `user_id`      BIGINT        NOT NULL                COMMENT '下单用户（逻辑外键 → user.id）',
    `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00   COMMENT '订单总金额',
    `status`       TINYINT       NOT NULL DEFAULT 0      COMMENT '订单状态机：0待支付 1已支付 2已取消 3已退款',
    `pay_type`     TINYINT       DEFAULT NULL            COMMENT '支付方式：1支付宝 2微信',
    `pay_time`     DATETIME      DEFAULT NULL            COMMENT '支付成功时间',
    `deleted`      TINYINT       NOT NULL DEFAULT 0      COMMENT '逻辑删除',
    `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),               -- 唯一索引：订单号不能重复，也防重复下单
    KEY `idx_user_id` (`user_id`)                        -- 「我的订单」按用户查
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单主表';

-- ---------------------------------------------------------
-- 8. 订单明细表（存商品快照）
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `order_item`;
CREATE TABLE `order_item` (
    `id`           BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `order_id`     BIGINT        NOT NULL                COMMENT '所属订单（逻辑外键 → orders.id）',
    `course_id`    BIGINT        NOT NULL                COMMENT '课程ID（逻辑外键 → course.id）',
    `course_title` VARCHAR(100)  NOT NULL                COMMENT '课程标题【快照】：下单时固化，之后课程改名不影响历史订单',
    `course_cover` VARCHAR(255)  DEFAULT NULL            COMMENT '封面【快照】',
    `price`        DECIMAL(10,2) NOT NULL                COMMENT '成交单价【快照】：下单时价格，改价不影响',
    `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_order_id` (`order_id`)                      -- 按订单查明细
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单明细表';

-- ---------------------------------------------------------
-- 9. 支付记录表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `payment`;
CREATE TABLE `payment` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `order_no`       VARCHAR(64)   NOT NULL                COMMENT '关联订单号',
    `transaction_id` VARCHAR(64)   DEFAULT NULL            COMMENT '第三方支付流水号（如支付宝/微信返回的）',
    `amount`         DECIMAL(10,2) NOT NULL                COMMENT '支付金额',
    `status`         TINYINT       NOT NULL DEFAULT 0      COMMENT '支付状态：0待支付 1成功 2失败',
    `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_order_no` (`order_no`)                       -- 回调时按订单号找支付记录
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付记录表';
```

### 3.4 秒杀域（2 张表）

```sql
-- ---------------------------------------------------------
-- 10. 秒杀活动表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `seckill_activity`;
CREATE TABLE `seckill_activity` (
    `id`            BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `course_id`     BIGINT        NOT NULL                COMMENT '秒杀课程（逻辑外键 → course.id）',
    `seckill_price` DECIMAL(10,2) NOT NULL                COMMENT '秒杀价（低于原价）',
    `stock_count`   INT           NOT NULL                COMMENT '秒杀库存（Day19 会用 Redis 原子扣减防超卖）',
    `start_time`    DATETIME      NOT NULL                COMMENT '开始时间',
    `end_time`      DATETIME      NOT NULL                COMMENT '结束时间',
    `status`        TINYINT       NOT NULL DEFAULT 0      COMMENT '状态：0未开始 1进行中 2已结束',
    `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_course_id` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀活动表';

-- ---------------------------------------------------------
-- 11. 秒杀订单表（限购：一人一单）
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `seckill_order`;
CREATE TABLE `seckill_order` (
    `id`          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`     BIGINT      NOT NULL                COMMENT '用户ID',
    `activity_id` BIGINT      NOT NULL                COMMENT '秒杀活动ID',
    `order_no`    VARCHAR(64) NOT NULL                COMMENT '关联订单号',
    `create_time` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    -- 联合唯一索引：同一个人对同一场活动只能下一单（限购的核心实现）
    UNIQUE KEY `uk_user_activity` (`user_id`, `activity_id`),
    KEY `idx_activity_id` (`activity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='秒杀订单表（限购）';

-- 建完恢复外键检查开关
SET FOREIGN_KEY_CHECKS = 1;
```

## 四、设计要点 & 面试追问

::: tip 💡 面试题：金额为什么用 `DECIMAL` 而不是 `float`/`double`？
**一句话**：`float`/`double` 是二进制浮点数，`0.1` 这种十进制小数无法精确表示（会变成 `0.100000001...`），累加会出误差。`DECIMAL` 是定点数，按字符串存储，精确到分。**钱相关的字段永远用 `DECIMAL`**。详见 [MySQL](/learn_database/MySQL)。
:::

::: tip 💡 面试题：为什么用「逻辑删除」（`deleted` 字段）而不是物理 `DELETE`？
**一句话**：① 数据是资产，误删可恢复；② 历史订单/统计要保留关联数据；③ `deleted=0` 加索引，查询时 `where deleted=0` 即可。MyBatis-Plus 的 `@TableLogic` 注解能自动把 `delete` 变成 `update deleted=1`、把 `select` 自动拼上 `deleted=0`。
:::

::: tip 💡 面试题：主键为什么用 `BIGINT` 自增？后期要换什么？
**一句话**：`BIGINT`（8 字节）容量大，自增简单有序。但**分库分表后自增会重复**，所以 Day 24 会换成**雪花算法生成的分布式 ID**（趋势递增、全局唯一）。所以现在就把主键定成 `BIGINT`，为后面留好升级空间。
:::

::: tip 💡 面试题：为什么不建物理外键（FOREIGN KEY）？
**一句话**：① 物理外键会有锁竞争、级联删除风险；② 微服务拆库后，跨库根本无法建物理外键；③ 分库分表后更不可能。所以大厂主流是「逻辑外键」——字段上保留关联 ID，一致性靠业务代码和事务保证。你现在写的 `teacher_id`、`course_id` 就是逻辑外键。
:::

::: tip 💡 面试题：`uk_user_activity` 联合唯一索引为什么能实现「限购一人一单」？
**一句话**：`(user_id, activity_id)` 组合唯一，意味着同一个 user 对同一场 activity 只能插入一行。第一个人下单成功，第二个人再下单时 insert 会因唯一索引冲突失败 → 天然防重复秒杀。比「先查再插」可靠，因为**唯一索引的约束在数据库层，并发下也不会漏**。
:::

## 五、种子数据（可选，方便开发测试）

```sql
-- 插入分类（父子树：后端 > Java / 数据库，AI > 大模型）
INSERT INTO `category` (`id`, `parent_id`, `name`, `sort`) VALUES
    (1, 0, '后端开发', 1),
    (2, 1, 'Java',    1),
    (3, 1, '数据库',   2),
    (4, 0, '人工智能', 2),
    (5, 4, '大模型',   1);

-- 插入讲师
INSERT INTO `teacher` (`id`, `name`, `position`, `intro`) VALUES
    (1, '张老师', '阿里高级工程师', '十年后端经验，专注高并发架构。'),
    (2, '李老师', '字节算法专家', '深耕大模型与推荐系统。');

-- 插入课程（price 用 DECIMAL，别写浮点）
INSERT INTO `course` (`id`, `teacher_id`, `category_id`, `title`, `price`, `original_price`, `status`, `description`) VALUES
    (1, 1, 2, 'Java 高并发实战',    199.00, 399.00, 1, '从 JUC 到分布式锁，彻底搞懂高并发。'),
    (2, 1, 3, 'MySQL 底层原理',     99.00,  199.00, 1, 'B+ 树、MVCC、锁机制一次讲透。'),
    (3, 2, 5, '大模型 Agent 开发',  299.00, 599.00, 1, 'RAG + Function Calling + LangGraph 实战。');

-- 插入秒杀活动（用相对时间方便测试）
INSERT INTO `seckill_activity` (`id`, `course_id`, `seckill_price`, `stock_count`, `start_time`, `end_time`, `status`) VALUES
    (1, 1, 99.00, 100, NOW() - INTERVAL 1 DAY, NOW() + INTERVAL 1 DAY, 1);

-- 注意：user 表不插种子数据——密码要 BCrypt 加密后存入，
-- 等 Day 3/4 注册、登录功能做好后，用接口注册第一个用户更真实。
```

## 六、执行方式

**方式一 · 命令行**（MySQL 已装）：

```bash
"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p < E:\course-mall\sql\schema.sql
```

**方式二 · 图形工具**：用 Navicat / DataGrip 连接 `localhost:3306`，新建查询，把 SQL 粘进去执行。

> 如果 root 密码忘了，Day 01 回填里告诉我，我帮你重置（不用重装）。

## 七、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 11 张表全部建成功，`SHOW TABLES;` 能看到：是 / 否
- [ ] 种子数据插入成功（category/teacher/course 有数据）：是 / 否
- [ ] 踩坑记录（连接报错、密码问题等）：
- [ ] 疑问（有就写，我来答）：

## 八、我下次会追问的问题（做完先自己想想）

1. 为什么订单要拆 `orders` + `order_item` 两张表？`order_item` 里为什么存 `course_title` 和 `price` 的「快照」而不是关联去查？
2. 金额字段为什么用 `DECIMAL(10,2)`？`DECIMAL(10,2)` 里的 `10` 和 `2` 分别代表什么？
3. 为什么不建物理外键？「逻辑外键」的一致性靠什么保证？
4. `uk_user_activity` 这个联合唯一索引为什么能防「一人多单」？它和「先查再插」比，为什么并发下更可靠？
5. 主键为什么用 `BIGINT`？分库分表后自增主键会遇到什么问题？（提示：为 Day 24 铺路）
