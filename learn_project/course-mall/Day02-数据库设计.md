# Day 02 · 数据库设计（建表 SQL + 索引设计）

> **今天目标**：把「课程商城」的核心表设计出来并建好。表结构不是随便建——每个字段、每个索引背后都有「为什么要这样」的理由，这些就是面试会问的点。

## 一、前置条件

- 已完成 Day 01（Maven 多模块骨架能跑通）
- MySQL 已装（本机 `8.4.7` ✅，已确认）

## 二、整体设计：17 张表，分 4 个域

| 域         | 表                          | 作用                             |
| ---------- | --------------------------- | -------------------------------- |
| **基础域** | `user` 用户                 | 登录、鉴权、个人信息             |
|            | `category` 分类             | 课程分类（支持父子，做树形）     |
|            | `teacher` 讲师              | 讲师信息                         |
|            | `course` 课程               | 课程主体（价格、上下架、浏览量） |
|            | `chapter` 章节              | 课程下面的章                     |
|            | `lesson` 课时               | 章节下面的课（视频）             |
| **交易域** | `orders` 订单               | 订单主表                         |
|            | `order_item` 订单明细       | 订单里的商品快照                 |
|            | `payment` 支付              | 支付记录                         |
| **秒杀域** | `seckill_activity` 秒杀活动 | 秒杀场次 + 库存                  |
|            | `seckill_order` 秒杀订单    | 秒杀成功记录（限购）             |
| **权限域** | `menu` 菜单                 | 树形菜单（目录/菜单/按钮）       |
|            | `role` 角色                 | 角色（如管理员/讲师/运营）       |
|            | `permission` 权限           | 权限标识（如 `course:create`）   |
|            | `user_role` 用户-角色       | 用户关联角色                     |
|            | `role_permission` 角色-权限 | 角色有哪些权限                   |
|            | `role_menu` 角色-菜单       | 角色能看到哪些菜单               |

::: tip 💡 面试题：为什么订单要拆成 `orders`（主表）+ `order_item`（明细表）？

> 把下面的 SQL 存成 `E:\course-mall\sql\schema.sql`（代码目录里），用 Navicat / DataGrip / 命令行执行即可。分 3 段，方便你一段段看。

:::

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
    `deleted_at`  DATETIME     DEFAULT NULL             COMMENT '逻辑删除时间，NULL=未删 非NULL=已删',
    `updated_by`  BIGINT       DEFAULT NULL             COMMENT '最后修改人（逻辑外键 → user.id）',
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
    `created_by`  BIGINT      DEFAULT NULL             COMMENT '创建人（逻辑外键 → user.id）',
    `updated_by`  BIGINT      DEFAULT NULL             COMMENT '最后修改人（逻辑外键 → user.id）',
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
    `created_by`  BIGINT       DEFAULT NULL             COMMENT '创建人',
    `updated_by`  BIGINT       DEFAULT NULL             COMMENT '最后修改人',
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
    `stock`          INT            NOT NULL DEFAULT 100    COMMENT '日常可售库存（Day10/11 原子扣减与并发控制）',
    `version`        INT            NOT NULL DEFAULT 0      COMMENT '乐观锁版本号（Day11 使用）',
    `description`    TEXT                                   COMMENT '课程详情（富文本）',
    `status`         TINYINT        NOT NULL DEFAULT 0      COMMENT '状态：1已上架 0下架',
    `view_count`     INT            NOT NULL DEFAULT 0      COMMENT '浏览量（读多写多，可放 Redis 异步回写）',
    `buy_count`      INT            NOT NULL DEFAULT 0      COMMENT '购买量',
    `deleted_at`     DATETIME       DEFAULT NULL             COMMENT '逻辑删除时间，NULL=未删',
    `created_by`     BIGINT         DEFAULT NULL             COMMENT '创建人',
    `updated_by`     BIGINT         DEFAULT NULL             COMMENT '最后修改人',
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
    `created_by`  BIGINT       DEFAULT NULL             COMMENT '创建人',
    `updated_by`  BIGINT       DEFAULT NULL             COMMENT '最后修改人',
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
    `created_by`  BIGINT       DEFAULT NULL             COMMENT '创建人',
    `updated_by`  BIGINT       DEFAULT NULL             COMMENT '最后修改人',
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
    `request_id`   VARCHAR(64)   NOT NULL                COMMENT '客户端幂等键，同一用户重复提交时保持不变',
    `user_id`      BIGINT        NOT NULL                COMMENT '下单用户（逻辑外键 → user.id）',
    `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00   COMMENT '订单总金额',
    `status`       TINYINT       NOT NULL DEFAULT 0      COMMENT '订单状态机：0待支付 1已支付 2已取消 3已退款',
    `pay_type`     TINYINT       DEFAULT NULL            COMMENT '支付方式：1支付宝 2微信',
    `pay_time`     DATETIME      DEFAULT NULL            COMMENT '支付成功时间',
    `deleted_at`   DATETIME      DEFAULT NULL             COMMENT '逻辑删除时间，NULL=未删',
    `updated_by`   BIGINT        DEFAULT NULL             COMMENT '最后修改人（客服改退款状态等）',
    `create_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),               -- 订单号不能重复
    UNIQUE KEY `uk_user_request` (`user_id`, `request_id`), -- 数据库兜底防重复提交
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
    `pay_type`       TINYINT       NOT NULL                COMMENT '支付渠道：1沙箱/支付宝 2微信',
    `transaction_id` VARCHAR(64)   DEFAULT NULL            COMMENT '第三方支付流水号（如支付宝/微信返回的）',
    `amount`         DECIMAL(10,2) NOT NULL                COMMENT '支付金额',
    `status`         TINYINT       NOT NULL DEFAULT 0      COMMENT '支付状态：0待支付 1成功 2失败',
    `create_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),                 -- 一个订单只允许一张支付单
    UNIQUE KEY `uk_transaction_id` (`transaction_id`)      -- 一笔第三方流水不能绑定多个订单
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
    `created_by`    BIGINT        DEFAULT NULL             COMMENT '创建人',
    `updated_by`    BIGINT        DEFAULT NULL             COMMENT '最后修改人',
    `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
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

### 3.5 权限域（6 张表——RBAC + 菜单）

```sql
-- ---------------------------------------------------------
-- 12. 菜单表（树形结构，支持多级菜单）
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `menu`;
CREATE TABLE `menu` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `parent_id`   BIGINT       NOT NULL DEFAULT 0       COMMENT '父菜单ID，0 表示顶级（自关联实现树形）',
    `name`        VARCHAR(50)  NOT NULL                COMMENT '菜单名称',
    `path`        VARCHAR(200) DEFAULT NULL            COMMENT '路由路径（前端路由用）',
    `icon`        VARCHAR(100) DEFAULT NULL            COMMENT '图标名称',
    `sort`        INT          NOT NULL DEFAULT 0      COMMENT '排序值，越小越靠前',
    `type`        TINYINT      NOT NULL DEFAULT 0      COMMENT '类型：0目录 1菜单 2按钮',
    `permission`  VARCHAR(100) DEFAULT NULL            COMMENT '权限标识（按钮级权限，如 user:add）',
    `created_by`  BIGINT       DEFAULT NULL             COMMENT '创建人',
    `updated_by`  BIGINT       DEFAULT NULL             COMMENT '最后修改人',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_parent_id` (`parent_id`)                  -- 树形查询：按父 ID 查子菜单
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='菜单表';

-- ---------------------------------------------------------
-- 13. 角色表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `role`;
CREATE TABLE `role` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `name`        VARCHAR(50)  NOT NULL                COMMENT '角色名称',
    `code`        VARCHAR(50)  NOT NULL                COMMENT '角色编码（唯一，如 ADMIN / TEACHER / OPERATOR）',
    `description` VARCHAR(255) DEFAULT NULL            COMMENT '角色描述',
    `status`      TINYINT      NOT NULL DEFAULT 1      COMMENT '状态：1启用 0禁用',
    `created_by`  BIGINT       DEFAULT NULL             COMMENT '创建人',
    `updated_by`  BIGINT       DEFAULT NULL             COMMENT '最后修改人',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code` (`code`)                      -- 角色编码唯一，防重复
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色表';

-- ---------------------------------------------------------
-- 14. 权限表（定义系统中所有操作权限）
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `permission`;
CREATE TABLE `permission` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `name`        VARCHAR(50)  NOT NULL                COMMENT '权限名称',
    `code`        VARCHAR(100) NOT NULL                COMMENT '权限编码（如 course:create, order:view）',
    `type`        TINYINT      NOT NULL DEFAULT 0      COMMENT '类型：0模块 1功能 2操作',
    `parent_id`   BIGINT       NOT NULL DEFAULT 0      COMMENT '父权限ID（权限也支持树形，模块 > 功能 > 操作）',
    `created_by`  BIGINT       DEFAULT NULL             COMMENT '创建人',
    `updated_by`  BIGINT       DEFAULT NULL             COMMENT '最后修改人',
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_code` (`code`)                      -- 权限编码唯一，后端用编码做鉴权判断
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='权限表';

-- ---------------------------------------------------------
-- 15. 用户-角色关联表（一个用户可以有多个角色）
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `user_role`;
CREATE TABLE `user_role` (
    `id`          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    `user_id`     BIGINT      NOT NULL                COMMENT '用户ID（逻辑外键 → user.id）',
    `role_id`     BIGINT      NOT NULL                COMMENT '角色ID（逻辑外键 → role.id）',
    `created_by`  BIGINT      DEFAULT NULL             COMMENT '授权操作人ID',
    `create_time` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_user_role` (`user_id`, `role_id`),  -- 同一个人不能重复分配同一个角色
    KEY `idx_role_id` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户-角色关联表';

-- ---------------------------------------------------------
-- 16. 角色-权限关联表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `role_permission`;
CREATE TABLE `role_permission` (
    `id`            BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    `role_id`       BIGINT      NOT NULL                COMMENT '角色ID',
    `permission_id` BIGINT      NOT NULL                COMMENT '权限ID',
    `created_by`    BIGINT      DEFAULT NULL             COMMENT '授权操作人ID',
    `create_time`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_role_permission` (`role_id`, `permission_id`),
    KEY `idx_permission_id` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-权限关联表';

-- ---------------------------------------------------------
-- 17. 角色-菜单关联表
-- ---------------------------------------------------------
DROP TABLE IF EXISTS `role_menu`;
CREATE TABLE `role_menu` (
    `id`          BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    `role_id`     BIGINT      NOT NULL                COMMENT '角色ID',
    `menu_id`     BIGINT      NOT NULL                COMMENT '菜单ID',
    `created_by`  BIGINT      DEFAULT NULL             COMMENT '授权操作人ID',
    `create_time` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_role_menu` (`role_id`, `menu_id`),
    KEY `idx_menu_id` (`menu_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色-菜单关联表';

-- 建完恢复外键检查开关
SET FOREIGN_KEY_CHECKS = 1;
```

## 四、设计要点 & 面试追问

::: tip 💡 面试题：金额为什么用 `DECIMAL` 而不是 `float`/`double`？
**一句话**：`float`/`double` 是二进制浮点数，`0.1` 这种十进制小数无法精确表示（会变成 `0.100000001...`），累加会出误差。`DECIMAL` 是定点数，按字符串存储，精确到分。**钱相关的字段永远用 `DECIMAL`**。详见 [MySQL](/learn_database/MySQL)。
:::

::: tip 💡 面试题：为什么用「逻辑删除」（`deleted_at`）而不是物理 `DELETE`？
**一句话**：① 数据是资产，误删可恢复；② 历史订单/统计要保留关联数据；③ `deleted_at IS NULL` 查未删记录。用时间戳比 `TINYINT` 更好——能知道什么时候删的，方便定期清理过期数据（`WHERE deleted_at < '2024-01-01'`）。
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

::: tip 💡 面试题：为什么要用 RBAC（角色-权限模型）而不是直接给用户分配权限？
**一句话**：直接给用户分配权限，每增加一个用户就要重复绑定一堆权限，而且权限变更要逐个改。RBAC 引入「角色」作为中间层：**角色是权限的集合，用户只关联角色**。这样新增用户只要给角色，权限变更只要改角色——管理成本和复杂度都大幅降低。这就是为什么需要 `user_role`、`role_permission`、`role_menu` 三张关联表。
:::

::: tip 💡 面试题：为什么加 `created_by` / `updated_by` 审计字段？
**一句话**：记录「谁创建了这个分类/课程」「谁最后修改的」，方便审计和责任追溯。`created_by` 在建表时写入，`updated_by` 每次修改时更新。`user` 表本身只加 `updated_by`（因为用户自己注册，`created_by` 无意义）。
:::

## 五、SQL 场景覆盖清单（17 张表能练到哪些 SQL）

> 这 17 张表覆盖了 80% 的电商后台查询场景，下面按 SQL 语法分类列出**你能练到的具体查询**。做 Day 时遇到相关场景，回来翻这个清单就行。

### 基本查询（SELECT / WHERE / ORDER BY / LIMIT）

```sql
-- 单表查询
SELECT * FROM course WHERE status = 1 ORDER BY create_time DESC;
SELECT * FROM course WHERE title LIKE '%Java%' LIMIT 10;

-- 分页
SELECT * FROM course WHERE status = 1 ORDER BY id LIMIT 0, 10;

-- 去重
SELECT DISTINCT status FROM course;

-- 条件分支
SELECT title,
       CASE WHEN price = 0 THEN '免费' ELSE '付费' END AS price_type
FROM course;
```

### 多表 JOIN（INNER / LEFT / RIGHT）

```sql
-- 两表 JOIN：课程 + 讲师
SELECT c.title, t.name AS teacher_name
FROM course c
JOIN teacher t ON c.teacher_id = t.id;

-- 三表 JOIN：课程 + 分类 + 讲师
SELECT c.title, cat.name AS category, t.name AS teacher
FROM course c
JOIN category cat ON c.category_id = cat.id
JOIN teacher t ON c.teacher_id = t.id;

-- LEFT JOIN：查没有章节的课程（异常数据排查）
SELECT c.title FROM course c
LEFT JOIN chapter ch ON c.id = ch.course_id
WHERE ch.id IS NULL;

-- 订单链路：订单 → 明细 → 课程快照
SELECT o.order_no, oi.course_title, oi.price, o.status
FROM orders o
JOIN order_item oi ON o.id = oi.order_id
WHERE o.user_id = 1;
```

### 聚合查询（COUNT / SUM / AVG / GROUP BY / HAVING）

```sql
-- 统计每个分类下的课程数
SELECT cat.name, COUNT(c.id) AS course_count
FROM category cat
LEFT JOIN course c ON cat.id = c.category_id
GROUP BY cat.id, cat.name;

-- 统计每个讲师的课程数和总销量
SELECT t.name, COUNT(c.id) AS course_count, SUM(c.buy_count) AS total_buy
FROM teacher t
LEFT JOIN course c ON t.id = c.teacher_id
GROUP BY t.id, t.name;

-- 统计每日订单数和总收入
SELECT DATE(create_time) AS day, COUNT(*) AS order_count, SUM(total_amount) AS revenue
FROM orders
WHERE status = 1
GROUP BY DATE(create_time)
ORDER BY day;

-- HAVING：筛选出课程数超过 2 个的分类
SELECT cat.name, COUNT(c.id) AS cnt
FROM category cat
JOIN course c ON cat.id = c.category_id
GROUP BY cat.id, cat.name
HAVING cnt > 2;
```

### 子查询（IN / EXISTS / 标量子查询）

```sql
-- WHERE IN：查属于「后端开发」分类及其子分类的所有课程
SELECT * FROM course
WHERE category_id IN (
    SELECT id FROM category WHERE parent_id = 1 OR id = 1
);

-- EXISTS：查有订单的用户
SELECT * FROM user u
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.user_id = u.id);

-- 标量子查询：查比平均价格高的课程
SELECT title, price FROM course
WHERE price > (SELECT AVG(price) FROM course WHERE status = 1);
```

### 窗口函数（ROW_NUMBER / RANK / LAG）

```sql
-- 按分类分组，给课程按销量排名
SELECT cat.name, c.title, c.buy_count,
       ROW_NUMBER() OVER (PARTITION BY c.category_id ORDER BY c.buy_count DESC) AS rn
FROM course c
JOIN category cat ON c.category_id = cat.id;

-- 每月订单收入 + 环比上月
SELECT DATE_FORMAT(create_time, '%Y-%m') AS month,
       SUM(total_amount) AS revenue,
       LAG(SUM(total_amount)) OVER (ORDER BY DATE_FORMAT(create_time, '%Y-%m')) AS prev_month
FROM orders
WHERE status = 1
GROUP BY DATE_FORMAT(create_time, '%Y-%m');
```

### 递归 CTE（WITH RECURSIVE）

```sql
-- 查「后端开发」(id=1) 及其所有子分类
WITH RECURSIVE cte AS (
    SELECT id, parent_id, name FROM category WHERE id = 1
    UNION ALL
    SELECT c.id, c.parent_id, c.name
    FROM category c JOIN cte ON c.parent_id = cte.id
)
SELECT * FROM cte;

-- 同理，查菜单树
WITH RECURSIVE cte AS (
    SELECT id, parent_id, name FROM menu WHERE id = 1
    UNION ALL
    SELECT m.id, m.parent_id, m.name
    FROM menu m JOIN cte ON m.parent_id = cte.id
)
SELECT * FROM cte;
```

### 联合查询（UNION）

```sql
-- 查免费课程 + 限时秒杀课程，合并展示
SELECT id, title, price, 'normal' AS type FROM course WHERE price = 0
UNION
SELECT c.id, c.title, sa.seckill_price, 'seckill'
FROM course c
JOIN seckill_activity sa ON c.id = sa.course_id
WHERE sa.status = 1;
```

### 事务与锁（SELECT ... FOR UPDATE）

```sql
-- 秒杀扣库存：先锁住行，防止超卖
START TRANSACTION;
SELECT stock_count FROM seckill_activity WHERE id = 1 FOR UPDATE;
-- 业务判断库存 > 0，扣减
UPDATE seckill_activity SET stock_count = stock_count - 1 WHERE id = 1;
COMMIT;
```

### 查询优化（EXPLAIN）

```sql
-- 看有没有走索引
EXPLAIN SELECT * FROM course WHERE title LIKE '%Java%';
EXPLAIN SELECT * FROM orders WHERE user_id = 1;
```

## 六、种子数据（可选，方便开发测试）

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

-- 插入角色（编码唯一，后面做权限判断用）
INSERT INTO `role` (`id`, `name`, `code`, `description`) VALUES
    (1, '超级管理员', 'ADMIN',    '系统管理员，拥有所有权限'),
    (2, '讲师',       'TEACHER',  '课程讲师，管理自己的课程'),
    (3, '运营',       'OPERATOR', '内容运营，管理分类和课程上下架');

-- 插入菜单（后台管理用）
INSERT INTO `menu` (`id`, `parent_id`, `name`, `path`, `icon`, `sort`, `type`, `permission`) VALUES
    (1,  0, '系统管理',   '/system',    'setting', 1, 0, NULL),
    (2,  1, '用户管理',   '/system/user',  'user',   1, 1, 'user:list'),
    (3,  1, '角色管理',   '/system/role',  'role',   2, 1, 'role:list'),
    (4,  1, '菜单管理',   '/system/menu',  'menu',   3, 1, 'menu:list'),
    (5,  0, '课程管理',   '/course',    'book',   2, 0, NULL),
    (6,  5, '课程列表',   '/course/list',  'list',   1, 1, 'course:list'),
    (7,  5, '分类管理',   '/course/category', 'category', 2, 1, 'category:list'),
    (8,  0, '订单管理',   '/order',     'order',  3, 0, NULL),
    (9,  8, '订单列表',   '/order/list',    'list',   1, 1, 'order:view');

-- 插入权限（编码作为后端鉴权点，如 @PreAuthorize("hasAuthority('course:create')")）
INSERT INTO `permission` (`id`, `name`, `code`, `type`, `parent_id`) VALUES
    (1,  '用户管理',   'user',         0, 0),
    (2,  '用户查询',   'user:list',    1, 1),
    (3,  '用户新增',   'user:add',     2, 1),
    (4,  '用户编辑',   'user:edit',    2, 1),
    (5,  '用户删除',   'user:delete',  2, 1),
    (6,  '课程管理',   'course',       0, 0),
    (7,  '课程查询',   'course:list',  1, 6),
    (8,  '课程新增',   'course:create', 2, 6),
    (9,  '课程编辑',   'course:edit',  2, 6),
    (10, '课程删除',   'course:delete', 2, 6),
    (11, '订单管理',   'order',        0, 0),
    (12, '订单查询',   'order:view',      1, 11),
    (13, '订单退款',   'order:refund',    2, 11),
    (14, '角色查询',   'role:list',       1, 1),
    (15, '菜单查询',   'menu:list',       1, 1),
    (16, '分配角色',   'user:role',       2, 1),
    (17, '分类查询',   'category:list',   1, 6),
    (18, '分类维护',   'category:edit',   2, 6),
    (19, '讲师查询',   'teacher:list',    1, 6),
    (20, '讲师维护',   'teacher:edit',    2, 6),
    (21, '文件管理',   'file',            0, 0),
    (22, '文件上传',   'file:upload',     2, 21),
    (23, '库存管理',   'stock',           0, 0),
    (24, '库存查询',   'stock:view',      1, 23),
    (25, '库存调整',   'stock:adjust',    2, 23),
    (26, '支付管理',   'payment',         0, 0),
    (27, '支付查询',   'payment:view',    1, 26),
    (28, '支付退款',   'payment:refund',  2, 26),
    (29, '秒杀管理',   'seckill',         0, 0),
    (30, '秒杀维护',   'seckill:manage',  2, 29),
    (31, '搜索管理',   'search',          0, 0),
    (32, '索引同步',   'search:sync',     2, 31),
    (33, '直播管理',   'live',            0, 0),
    (34, '直播维护',   'live:manage',     2, 33),
    (35, '工作流管理', 'workflow',        0, 0),
    (36, '任务审批',   'workflow:approve', 2, 35);

-- 权限必须分配给角色，只有 permission 数据而没有 role_permission 关联时，
-- Day04 虽然能登录，但 Authentication 中的权限集合为空，所有 @PreAuthorize 都会返回 403。
INSERT INTO `role_permission` (`role_id`, `permission_id`)
SELECT 1, id FROM `permission`;  -- ADMIN：全部权限

INSERT INTO `role_permission` (`role_id`, `permission_id`) VALUES
    (2, 7), (2, 8), (2, 9), (2, 17), (2, 19), (2, 22), (2, 34),
    (3, 7), (3, 9), (3, 17), (3, 18), (3, 19), (3, 20),
    (3, 22), (3, 30), (3, 32), (3, 36);

-- 注册用户后，把实际用户 ID 替换到这里再执行；一个用户可以同时拥有多个角色。
-- INSERT INTO `user_role` (`user_id`, `role_id`) VALUES (1, 1);
```

::: warning 权限联调前必须做
`@PreAuthorize("hasAuthority('course:create')")` 比较的是字符串。数据库里必须存在完全相同的 `permission.code`，并且当前用户要通过 `user_role → role_permission` 获得它。只插权限表、不建立角色关联，是“登录成功但所有后台接口都 403”的最常见原因。
:::

## 七、执行方式

**方式一 · 命令行**（MySQL 已装）：

```bash
"C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p < E:\CourseMall\sql\schema.sql
```

**方式二 · 图形工具**：用 Navicat / DataGrip 连接 `localhost:3306`，新建查询，把 SQL 粘进去执行。

> 如果 root 密码忘了，Day 01 回填里告诉我，我帮你重置（不用重装）。

## 八、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 17 张表全部建成功，`SHOW TABLES;` 能看到：是 / 否
- [ ] 种子数据插入成功（category/teacher/course 有数据）：是 / 否
- [ ] 踩坑记录（连接报错、密码问题等）：
- [ ] 疑问（有就写，我来答）：

## 九、我下次会追问的问题（做完先自己想想）

1. 为什么订单要拆 `orders` + `order_item` 两张表？`order_item` 里为什么存 `course_title` 和 `price` 的「快照」而不是关联去查？
2. 金额字段为什么用 `DECIMAL(10,2)`？`DECIMAL(10,2)` 里的 `10` 和 `2` 分别代表什么？
3. 为什么不建物理外键？「逻辑外键」的一致性靠什么保证？
4. `uk_user_activity` 这个联合唯一索引为什么能防「一人多单」？它和「先查再插」比，为什么并发下更可靠？
5. 主键为什么用 `BIGINT`？分库分表后自增主键会遇到什么问题？（提示：为 Day 24 铺路）
6. 为什么要用 RBAC 权限模型，而不是直接给用户分配权限？`user_role`、`role_permission`、`role_menu` 三张关联表各解决了什么问题？
7. 菜单表里的 `type` 字段（0目录 1菜单 2按钮）有什么用？权限标识 `course:create` 这种格式背后是什么设计思想？
8. `deleted`（TINYINT 0/1）和 `deleted_at`（DATETIME）两种逻辑删除方案，各有什么优缺点？MyBatis-Plus 怎么配置时间戳版本？
9. `created_by` / `updated_by` 审计字段解决了什么问题？`user` 表为什么只加 `updated_by` 而不加 `created_by`？
