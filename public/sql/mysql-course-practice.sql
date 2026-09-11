-- MySQL 8.0/8.4 SQL 练习数据库
-- 主题：课程商城 + 员工组织 + 百万级访问日志
-- 注意：脚本会删除并重建 mysql_course_practice 数据库，请勿修改为业务库名称。

DROP DATABASE IF EXISTS mysql_course_practice;
CREATE DATABASE mysql_course_practice
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_0900_ai_ci;
USE mysql_course_practice;

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- 标准数据规模，适合练习 EXPLAIN 和索引优化。
-- 电脑配置较低时可把这些数值缩小 10 倍；单项最大不能超过 1000000。
SET @employee_rows = 5000;
SET @user_rows = 100000;
SET @teacher_rows = 2000;
SET @course_rows = 20000;
SET @order_rows = 500000;
SET @login_log_rows = 800000;
SET @access_log_rows = 1000000;

-- 0~9 种子表和 0~999999 数字视图，用集合运算批量造数，比逐行循环快。
CREATE TABLE helper_digit (
    n TINYINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE = InnoDB;

INSERT INTO helper_digit(n)
VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9);

CREATE VIEW v_helper_number AS
SELECT ones.n
       + tens.n * 10
       + hundreds.n * 100
       + thousands.n * 1000
       + ten_thousands.n * 10000
       + hundred_thousands.n * 100000 AS n
FROM helper_digit ones
CROSS JOIN helper_digit tens
CROSS JOIN helper_digit hundreds
CROSS JOIN helper_digit thousands
CROSS JOIN helper_digit ten_thousands
CROSS JOIN helper_digit hundred_thousands;

-- ============================================================
-- 1. 组织结构：适合基础查询、自连接、分组和子查询
-- ============================================================

CREATE TABLE department (
    id          INT          NOT NULL AUTO_INCREMENT,
    name        VARCHAR(50)  NOT NULL,
    region      VARCHAR(20)  NOT NULL,
    create_time DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_department_name (name)
) ENGINE = InnoDB COMMENT = '部门表';

INSERT INTO department(name, region)
VALUES ('技术研发部','成都'), ('产品设计部','成都'), ('市场运营部','重庆'),
       ('财务部','成都'), ('人力资源部','绵阳'), ('客户成功部','重庆'),
       ('内容中心','成都'), ('教学管理部','绵阳'), ('数据平台部','成都'),
       ('质量保障部','重庆'), ('法务部','成都'), ('战略合作部','绵阳');

CREATE TABLE employee (
    id          BIGINT         NOT NULL,
    dept_id     INT            NOT NULL,
    manager_id  BIGINT         DEFAULT NULL COMMENT '直属领导，逻辑关联 employee.id',
    name        VARCHAR(50)    NOT NULL,
    gender      CHAR(1)        NOT NULL,
    position    VARCHAR(50)    NOT NULL,
    salary      DECIMAL(10,2)  NOT NULL,
    hire_date   DATE           NOT NULL,
    status      TINYINT        NOT NULL DEFAULT 1,
    create_time DATETIME       NOT NULL,
    PRIMARY KEY (id),
    KEY idx_employee_dept (dept_id),
    KEY idx_employee_manager (manager_id),
    KEY idx_employee_salary (salary),
    CONSTRAINT fk_employee_department
        FOREIGN KEY (dept_id) REFERENCES department(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE = InnoDB COMMENT = '员工表';

INSERT INTO employee(
    id, dept_id, manager_id, name, gender, position,
    salary, hire_date, status, create_time
)
SELECT n + 1,
       MOD(n, 12) + 1,
       CASE WHEN n < 12 THEN NULL ELSE MOD(n, 12) + 1 END,
       CONCAT('员工', LPAD(n + 1, 5, '0')),
       IF(MOD(n, 2) = 0, '男', '女'),
       CASE MOD(n, 6)
           WHEN 0 THEN 'Java开发工程师'
           WHEN 1 THEN '前端开发工程师'
           WHEN 2 THEN '测试工程师'
           WHEN 3 THEN '产品经理'
           WHEN 4 THEN '数据分析师'
           ELSE '运营专员'
       END,
       5000 + MOD(n * 137, 30000),
       DATE_ADD('2018-01-01', INTERVAL MOD(n * 17, 3000) DAY),
       IF(MOD(n, 25) = 0, 0, 1),
       DATE_ADD('2018-01-01 09:00:00', INTERVAL MOD(n * 17, 3000) DAY)
FROM v_helper_number
WHERE n < @employee_rows;

-- ============================================================
-- 2. 用户：适合 DML、NULL、函数、逻辑删除和一对一查询
-- ============================================================

CREATE TABLE mall_user (
    id              BIGINT         NOT NULL,
    username        VARCHAR(50)    NOT NULL,
    nickname        VARCHAR(50)    NOT NULL,
    email           VARCHAR(100)   NOT NULL,
    phone           VARCHAR(20)    NOT NULL,
    gender          TINYINT        DEFAULT NULL COMMENT '1男 2女 NULL未知',
    city            VARCHAR(30)    NOT NULL,
    level           TINYINT        NOT NULL DEFAULT 1,
    status          TINYINT        NOT NULL DEFAULT 1 COMMENT '1正常 0禁用',
    balance         DECIMAL(12,2)  NOT NULL DEFAULT 0.00,
    register_source VARCHAR(20)    NOT NULL,
    create_time     DATETIME       NOT NULL,
    last_login_time DATETIME       DEFAULT NULL,
    deleted_at      DATETIME       DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_mall_user_username (username),
    UNIQUE KEY uk_mall_user_email (email),
    UNIQUE KEY uk_mall_user_phone (phone),
    KEY idx_mall_user_status_time (status, create_time),
    KEY idx_mall_user_city_level (city, level)
) ENGINE = InnoDB COMMENT = '商城用户表';

INSERT INTO mall_user(
    id, username, nickname, email, phone, gender, city, level,
    status, balance, register_source, create_time, last_login_time, deleted_at
)
SELECT n + 1,
       CONCAT('user_', LPAD(n + 1, 6, '0')),
       CONCAT('用户', LPAD(n + 1, 6, '0')),
       CONCAT('user_', n + 1, '@example.com'),
       CONCAT('13', LPAD(n + 1, 9, '0')),
       CASE MOD(n, 10) WHEN 0 THEN NULL WHEN 1 THEN 2 ELSE 1 END,
       ELT(MOD(n, 10) + 1,
           '成都','重庆','绵阳','德阳','乐山','南充','宜宾','泸州','西安','武汉'),
       MOD(n, 5) + 1,
       IF(MOD(n, 20) = 0, 0, 1),
       ROUND(MOD(n * 7919, 500000) / 100, 2),
       ELT(MOD(n, 4) + 1, 'WEB', 'APP', 'WECHAT', 'ADMIN'),
       DATE_ADD('2023-01-01 00:00:00', INTERVAL MOD(n * 97, 1340) DAY),
       CASE WHEN MOD(n, 13) = 0 THEN NULL
            ELSE DATE_ADD('2026-01-01 00:00:00', INTERVAL MOD(n * 31, 250) DAY)
       END,
       CASE WHEN MOD(n, 97) = 0
            THEN DATE_ADD('2026-01-01 00:00:00', INTERVAL MOD(n, 200) DAY)
            ELSE NULL
       END
FROM v_helper_number
WHERE n < @user_rows;

CREATE TABLE user_profile (
    id          BIGINT        NOT NULL,
    user_id     BIGINT        NOT NULL,
    real_name   VARCHAR(50)   DEFAULT NULL,
    birthday    DATE          DEFAULT NULL,
    occupation  VARCHAR(50)   DEFAULT NULL,
    preferences JSON          NOT NULL,
    update_time DATETIME      NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_user_profile_user (user_id),
    CONSTRAINT fk_user_profile_user
        FOREIGN KEY (user_id) REFERENCES mall_user(id)
        ON UPDATE RESTRICT ON DELETE CASCADE
) ENGINE = InnoDB COMMENT = '用户扩展资料，一对一';

INSERT INTO user_profile(id, user_id, real_name, birthday, occupation, preferences, update_time)
SELECT n + 1,
       n + 1,
       IF(MOD(n, 7) = 0, NULL, CONCAT('真实姓名', n + 1)),
       DATE_ADD('1985-01-01', INTERVAL MOD(n * 19, 7300) DAY),
       ELT(MOD(n, 6) + 1, '学生', '开发工程师', '教师', '产品经理', '运营', '自由职业'),
       JSON_OBJECT(
           'theme', IF(MOD(n, 2) = 0, 'dark', 'light'),
           'language', IF(MOD(n, 10) = 0, 'en-US', 'zh-CN'),
           'emailNotice', MOD(n, 3) <> 0
       ),
       DATE_ADD('2026-01-01 00:00:00', INTERVAL MOD(n, 250) DAY)
FROM v_helper_number
WHERE n < @user_rows
  AND MOD(n, 5) <> 0;

CREATE TABLE account (
    id      BIGINT         NOT NULL,
    user_id BIGINT         NOT NULL,
    balance DECIMAL(12,2)  NOT NULL,
    version INT            NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uk_account_user (user_id),
    CONSTRAINT ck_account_balance CHECK (balance >= 0)
) ENGINE = InnoDB COMMENT = '账户表，供事务、锁和乐观锁练习';

INSERT INTO account(id, user_id, balance, version)
VALUES (1,1,10000.00,0), (2,2,8000.00,0), (3,3,6000.00,0),
       (4,4,5000.00,0), (5,5,3000.00,0), (6,6,2000.00,0),
       (7,7,1500.00,0), (8,8,1000.00,0), (9,9,500.00,0),
       (10,10,100.00,0);

-- ============================================================
-- 3. 课程：适合层级结构、关联、聚合、JSON 和多对多查询
-- ============================================================

CREATE TABLE category (
    id          BIGINT       NOT NULL,
    parent_id   BIGINT       DEFAULT NULL,
    name        VARCHAR(50)  NOT NULL,
    sort_no     INT          NOT NULL DEFAULT 0,
    status      TINYINT      NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY idx_category_parent (parent_id)
) ENGINE = InnoDB COMMENT = '课程分类表';

INSERT INTO category(id, parent_id, name, sort_no)
VALUES
    (1,NULL,'编程开发',1), (2,NULL,'人工智能',2), (3,NULL,'产品与设计',3),
    (4,1,'Java',1), (5,1,'前端',2), (6,1,'移动开发',3), (7,1,'数据库',4),
    (8,2,'Python',1), (9,2,'机器学习',2), (10,2,'大模型与Agent',3),
    (11,3,'产品经理',1), (12,3,'UI设计',2), (13,3,'交互设计',3),
    (14,4,'Spring Boot',1), (15,4,'Spring Cloud',2),
    (16,5,'Vue',1), (17,5,'React',2), (18,6,'Flutter',1),
    (19,7,'MySQL',1), (20,7,'Redis',2), (21,8,'FastAPI',1),
    (22,10,'RAG',1), (23,10,'LangGraph',2), (24,10,'MCP',3);

CREATE TABLE teacher (
    id          BIGINT         NOT NULL,
    dept_id     INT            NOT NULL,
    name        VARCHAR(50)    NOT NULL,
    title       VARCHAR(50)    NOT NULL,
    rating      DECIMAL(3,2)   NOT NULL,
    salary      DECIMAL(10,2)  NOT NULL,
    status      TINYINT        NOT NULL DEFAULT 1,
    create_time DATETIME       NOT NULL,
    PRIMARY KEY (id),
    KEY idx_teacher_dept (dept_id),
    KEY idx_teacher_rating (rating),
    CONSTRAINT fk_teacher_department
        FOREIGN KEY (dept_id) REFERENCES department(id)
) ENGINE = InnoDB COMMENT = '讲师表';

INSERT INTO teacher(id, dept_id, name, title, rating, salary, status, create_time)
SELECT n + 1,
       MOD(n, 12) + 1,
       CONCAT('讲师', LPAD(n + 1, 4, '0')),
       ELT(MOD(n, 4) + 1, '讲师', '高级讲师', '专家', '首席专家'),
       ROUND(3.50 + MOD(n * 17, 151) / 100, 2),
       8000 + MOD(n * 251, 32000),
       IF(MOD(n, 40) = 0, 0, 1),
       DATE_ADD('2020-01-01 09:00:00', INTERVAL MOD(n * 13, 2000) DAY)
FROM v_helper_number
WHERE n < @teacher_rows;

CREATE TABLE course (
    id             BIGINT         NOT NULL,
    teacher_id     BIGINT         NOT NULL,
    category_id    BIGINT         NOT NULL,
    title          VARCHAR(200)   NOT NULL,
    subtitle       VARCHAR(255)   DEFAULT NULL,
    price          DECIMAL(10,2)  NOT NULL,
    original_price DECIMAL(10,2)  NOT NULL,
    difficulty     VARCHAR(20)    NOT NULL,
    status         TINYINT        NOT NULL DEFAULT 0 COMMENT '0草稿 1上架 2下架',
    stock          INT            NOT NULL DEFAULT 0,
    version        INT            NOT NULL DEFAULT 0,
    rating         DECIMAL(3,2)   NOT NULL DEFAULT 0.00,
    view_count     INT UNSIGNED   NOT NULL DEFAULT 0,
    buy_count      INT UNSIGNED   NOT NULL DEFAULT 0,
    attributes     JSON           NOT NULL,
    published_at   DATETIME       DEFAULT NULL,
    create_time    DATETIME       NOT NULL,
    update_time    DATETIME       NOT NULL,
    deleted_at     DATETIME       DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_course_teacher (teacher_id),
    KEY idx_course_category_status (category_id, status),
    KEY idx_course_status_time (status, create_time),
    KEY idx_course_price (price),
    CONSTRAINT ck_course_stock CHECK (stock >= 0),
    CONSTRAINT fk_course_teacher
        FOREIGN KEY (teacher_id) REFERENCES teacher(id),
    CONSTRAINT fk_course_category
        FOREIGN KEY (category_id) REFERENCES category(id)
) ENGINE = InnoDB COMMENT = '课程表';

INSERT INTO course(
    id, teacher_id, category_id, title, subtitle, price, original_price,
    difficulty, status, stock, version, rating, view_count, buy_count, attributes,
    published_at, create_time, update_time, deleted_at
)
SELECT n + 1,
       MOD(n * 7, @teacher_rows) + 1,
       MOD(n * 11, 21) + 4,
       CONCAT(
           ELT(MOD(n, 10) + 1,
               'Java','Spring Boot','MySQL','Redis','Vue','React','Flutter','Python','RAG','AI Agent'),
           ' 实战课程 ', LPAD(n + 1, 5, '0')
       ),
       CONCAT('从基础到项目实战，第 ', n + 1, ' 期'),
       CASE WHEN MOD(n, 20) = 0 THEN 0.00
            ELSE ROUND(19.90 + MOD(n * 37, 18000) / 100, 2)
       END,
       ROUND(99.00 + MOD(n * 43, 30000) / 100, 2),
       ELT(MOD(n, 3) + 1, 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'),
       CASE WHEN MOD(n, 20) < 16 THEN 1 WHEN MOD(n, 20) < 18 THEN 0 ELSE 2 END,
       MOD(n * 37, 500),
       0,
       ROUND(3.50 + MOD(n * 29, 151) / 100, 2),
       MOD(n * 7919, 1000000),
       MOD(n * 3571, 50000),
       JSON_OBJECT(
           'language', IF(MOD(n, 8) = 0, 'en', 'zh'),
           'certificate', MOD(n, 3) = 0,
           'hours', MOD(n, 120) + 2
       ),
       CASE WHEN MOD(n, 20) < 16
            THEN DATE_ADD('2023-01-01 10:00:00', INTERVAL MOD(n * 23, 1300) DAY)
            ELSE NULL
       END,
       DATE_ADD('2022-01-01 09:00:00', INTERVAL MOD(n * 23, 1600) DAY),
       DATE_ADD('2025-01-01 09:00:00', INTERVAL MOD(n * 19, 600) DAY),
       CASE WHEN MOD(n, 233) = 0
            THEN DATE_ADD('2026-01-01 00:00:00', INTERVAL MOD(n, 200) DAY)
            ELSE NULL
       END
FROM v_helper_number
WHERE n < @course_rows;

-- 原价始终高于或等于售价，避免练习数据出现不合理价格。
UPDATE course
SET original_price = price + ROUND(20 + MOD(id * 17, 10000) / 100, 2);

CREATE TABLE course_chapter (
    id          BIGINT        NOT NULL,
    course_id   BIGINT        NOT NULL,
    title       VARCHAR(200)  NOT NULL,
    sort_no     INT           NOT NULL,
    duration    INT           NOT NULL COMMENT '秒',
    is_free     TINYINT       NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    KEY idx_chapter_course_sort (course_id, sort_no),
    CONSTRAINT fk_chapter_course
        FOREIGN KEY (course_id) REFERENCES course(id)
        ON DELETE CASCADE
) ENGINE = InnoDB COMMENT = '课程章节表';

INSERT INTO course_chapter(id, course_id, title, sort_no, duration, is_free)
SELECT c.id * 10 + d.n + 1,
       c.id,
       CONCAT('第', d.n + 1, '章：', ELT(d.n + 1, '基础入门', '核心原理', '项目实战', '部署与优化')),
       d.n + 1,
       900 + MOD(c.id * 31 + d.n * 97, 3600),
       IF(d.n = 0, 1, 0)
FROM course c
JOIN helper_digit d ON d.n < 4;

CREATE TABLE tag (
    id   BIGINT       NOT NULL,
    name VARCHAR(50)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_tag_name (name)
) ENGINE = InnoDB COMMENT = '标签表';

INSERT INTO tag(id, name)
VALUES (1,'后端'),(2,'前端'),(3,'移动端'),(4,'数据库'),(5,'微服务'),
       (6,'高并发'),(7,'面试'),(8,'项目实战'),(9,'零基础'),(10,'进阶'),
       (11,'源码'),(12,'性能优化'),(13,'AI'),(14,'Agent'),(15,'RAG'),
       (16,'云原生'),(17,'Docker'),(18,'消息队列'),(19,'安全'),(20,'架构');

CREATE TABLE course_tag (
    course_id BIGINT NOT NULL,
    tag_id    BIGINT NOT NULL,
    PRIMARY KEY (course_id, tag_id),
    KEY idx_course_tag_tag (tag_id)
) ENGINE = InnoDB COMMENT = '课程标签中间表，多对多';

INSERT INTO course_tag(course_id, tag_id)
SELECT c.id,
       MOD(c.id * 7 + d.n * 3, 20) + 1
FROM course c
JOIN helper_digit d ON d.n < 3;

-- ============================================================
-- 4. 交易：适合多表 JOIN、子查询、聚合和窗口函数
-- ============================================================

CREATE TABLE orders (
    id           BIGINT         NOT NULL,
    order_no     VARCHAR(32)    NOT NULL,
    user_id      BIGINT         NOT NULL,
    status       VARCHAR(16)    NOT NULL,
    total_amount DECIMAL(12,2)  NOT NULL,
    pay_type     VARCHAR(16)    DEFAULT NULL,
    region       VARCHAR(20)    NOT NULL,
    create_time  DATETIME       NOT NULL,
    pay_time     DATETIME       DEFAULT NULL,
    cancel_time  DATETIME       DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_orders_order_no (order_no),
    KEY idx_orders_user_time (user_id, create_time),
    KEY idx_orders_status_time (status, create_time),
    KEY idx_orders_pay_time (pay_time)
) ENGINE = InnoDB COMMENT = '订单表';

INSERT INTO orders(
    id, order_no, user_id, status, total_amount, pay_type,
    region, create_time, pay_time, cancel_time
)
SELECT n + 1,
       CONCAT('CM', DATE_FORMAT(DATE_ADD('2024-01-01', INTERVAL MOD(n, 980) DAY), '%Y%m%d'),
              LPAD(n + 1, 10, '0')),
       MOD(n * 97, @user_rows) + 1,
       CASE
           WHEN MOD(n, 100) < 12 THEN 'PENDING'
           WHEN MOD(n, 100) < 62 THEN 'PAID'
           WHEN MOD(n, 100) < 88 THEN 'FINISHED'
           WHEN MOD(n, 100) < 95 THEN 'CANCELED'
           ELSE 'REFUNDED'
       END,
       ROUND(19.90 + MOD(n * 3571, 80000) / 100, 2),
       CASE WHEN MOD(n, 100) < 12 OR (MOD(n, 100) >= 88 AND MOD(n, 100) < 95)
            THEN NULL
            ELSE ELT(MOD(n, 4) + 1, 'ALIPAY', 'WECHAT', 'CARD', 'BALANCE')
       END,
       ELT(MOD(n, 6) + 1, '四川', '重庆', '陕西', '湖北', '云南', '贵州'),
       DATE_ADD('2024-01-01 00:00:00',
                INTERVAL (MOD(n, 980) * 86400 + MOD(n * 37, 86400)) SECOND),
       CASE WHEN MOD(n, 100) >= 12 AND NOT (MOD(n, 100) >= 88 AND MOD(n, 100) < 95)
            THEN DATE_ADD(
                DATE_ADD('2024-01-01 00:00:00',
                         INTERVAL (MOD(n, 980) * 86400 + MOD(n * 37, 86400)) SECOND),
                INTERVAL (MOD(n * 13, 120) + 1) MINUTE
            )
            ELSE NULL
       END,
       CASE WHEN MOD(n, 100) >= 88 AND MOD(n, 100) < 95
            THEN DATE_ADD(
                DATE_ADD('2024-01-01 00:00:00',
                         INTERVAL (MOD(n, 980) * 86400 + MOD(n * 37, 86400)) SECOND),
                INTERVAL (MOD(n * 11, 120) + 1) MINUTE
            )
            ELSE NULL
       END
FROM v_helper_number
WHERE n < @order_rows;

CREATE TABLE order_item (
    id         BIGINT         NOT NULL,
    order_id   BIGINT         NOT NULL,
    course_id  BIGINT         NOT NULL,
    quantity   INT            NOT NULL,
    unit_price DECIMAL(10,2)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_item_order_course (order_id, course_id),
    KEY idx_order_item_course (course_id)
) ENGINE = InnoDB COMMENT = '订单明细表';

-- 每个订单生成两条不同课程明细，标准规模共 100 万行。
INSERT INTO order_item(id, order_id, course_id, quantity, unit_price)
SELECT (o.id - 1) * 2 + d.n + 1,
       o.id,
       MOD(o.id * 31 + d.n * 17, @course_rows) + 1,
       MOD(o.id + d.n, 3) + 1,
       ROUND(9.90 + MOD(o.id * 43 + d.n * 101, 30000) / 100, 2)
FROM orders o
JOIN helper_digit d ON d.n < 2;

-- 汇总明细金额回写订单头，保证订单总额与明细一致。
UPDATE orders o
JOIN (
    SELECT order_id, ROUND(SUM(quantity * unit_price), 2) AS item_total
    FROM order_item
    GROUP BY order_id
) i ON i.order_id = o.id
SET o.total_amount = i.item_total;

CREATE TABLE payment (
    id             BIGINT         NOT NULL,
    order_id       BIGINT         NOT NULL,
    transaction_no VARCHAR(40)    NOT NULL,
    channel        VARCHAR(16)    NOT NULL,
    amount         DECIMAL(12,2)  NOT NULL,
    status         VARCHAR(16)    NOT NULL,
    create_time    DATETIME       NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_payment_order (order_id),
    UNIQUE KEY uk_payment_transaction (transaction_no),
    KEY idx_payment_channel_time (channel, create_time)
) ENGINE = InnoDB COMMENT = '支付记录表';

INSERT INTO payment(id, order_id, transaction_no, channel, amount, status, create_time)
SELECT o.id,
       o.id,
       CONCAT('TX', LPAD(o.id, 18, '0')),
       o.pay_type,
       o.total_amount,
       IF(o.status = 'REFUNDED', 'REFUNDED', 'SUCCESS'),
       o.pay_time
FROM orders o
WHERE o.pay_time IS NOT NULL;

-- ============================================================
-- 5. 日志：一个有联合索引，一个故意只留主键供优化实验
-- ============================================================

CREATE TABLE login_log (
    id         BIGINT       NOT NULL,
    user_id    BIGINT       NOT NULL,
    ip         VARCHAR(45)  NOT NULL,
    device     VARCHAR(20)  NOT NULL,
    result     VARCHAR(16)  NOT NULL,
    login_time DATETIME     NOT NULL,
    PRIMARY KEY (id),
    KEY idx_login_log_user_time (user_id, login_time),
    KEY idx_login_log_result_time (result, login_time)
) ENGINE = InnoDB COMMENT = '登录日志表';

INSERT INTO login_log(id, user_id, ip, device, result, login_time)
SELECT n + 1,
       MOD(n * 53, @user_rows) + 1,
       CONCAT('10.', MOD(n, 255), '.', MOD(n * 7, 255), '.', MOD(n * 13, 255)),
       ELT(MOD(n, 4) + 1, 'ANDROID', 'IOS', 'WEB', 'PAD'),
       IF(MOD(n, 20) = 0, 'FAIL', 'SUCCESS'),
       DATE_ADD('2025-01-01 00:00:00',
                INTERVAL (MOD(n, 615) * 86400 + MOD(n * 29, 86400)) SECOND)
FROM v_helper_number
WHERE n < @login_log_rows;

CREATE TABLE access_log (
    id          BIGINT        NOT NULL,
    user_id     BIGINT        DEFAULT NULL,
    trace_id    CHAR(32)      NOT NULL,
    method      VARCHAR(10)   NOT NULL,
    path        VARCHAR(100)  NOT NULL,
    http_status SMALLINT      NOT NULL,
    cost_ms     INT           NOT NULL,
    ip          VARCHAR(45)   NOT NULL,
    created_at  DATETIME      NOT NULL,
    PRIMARY KEY (id)
) ENGINE = InnoDB COMMENT = '百万级访问日志；故意不建业务索引，供 EXPLAIN 和索引优化练习';

INSERT INTO access_log(
    id, user_id, trace_id, method, path, http_status, cost_ms, ip, created_at
)
SELECT n + 1,
       IF(MOD(n, 10) = 0, NULL, MOD(n * 97, @user_rows) + 1),
       MD5(CONCAT('trace-', n + 1)),
       IF(MOD(n, 10) < 8, 'GET', 'POST'),
       CASE
           WHEN MOD(n, 100) < 40 THEN '/api/courses'
           WHEN MOD(n, 100) < 60 THEN '/api/orders'
           WHEN MOD(n, 100) < 75 THEN '/api/users/profile'
           WHEN MOD(n, 100) < 88 THEN '/api/search'
           WHEN MOD(n, 100) < 96 THEN '/api/login'
           ELSE '/api/admin/statistics'
       END,
       CASE WHEN MOD(n, 100) < 92 THEN 200
            WHEN MOD(n, 100) < 96 THEN 400
            WHEN MOD(n, 100) < 99 THEN 500
            ELSE 429
       END,
       CASE WHEN MOD(n, 1000) = 0 THEN 3000 + MOD(n, 7000)
            ELSE 5 + MOD(n * 131, 800)
       END,
       CONCAT('172.16.', MOD(n * 7, 255), '.', MOD(n * 17, 255)),
       DATE_ADD('2025-01-01 00:00:00',
                INTERVAL (MOD(n, 615) * 86400 + MOD(n * 41, 86400)) SECOND)
FROM v_helper_number
WHERE n < @access_log_rows;

-- 更新优化器统计信息，方便 EXPLAIN 估算。
ANALYZE TABLE employee, mall_user, user_profile, account, teacher, course,
              course_chapter, course_tag, orders, order_item,
              payment, login_log, access_log;

-- 造数工具已经完成使命，删除后练习库只保留业务表。
DROP VIEW v_helper_number;
DROP TABLE helper_digit;

-- 导入完成后输出各表行数。
SELECT 'department' AS table_name, COUNT(*) AS row_count FROM department
UNION ALL SELECT 'employee', COUNT(*) FROM employee
UNION ALL SELECT 'mall_user', COUNT(*) FROM mall_user
UNION ALL SELECT 'user_profile', COUNT(*) FROM user_profile
UNION ALL SELECT 'account', COUNT(*) FROM account
UNION ALL SELECT 'teacher', COUNT(*) FROM teacher
UNION ALL SELECT 'category', COUNT(*) FROM category
UNION ALL SELECT 'course', COUNT(*) FROM course
UNION ALL SELECT 'course_chapter', COUNT(*) FROM course_chapter
UNION ALL SELECT 'course_tag', COUNT(*) FROM course_tag
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_item', COUNT(*) FROM order_item
UNION ALL SELECT 'payment', COUNT(*) FROM payment
UNION ALL SELECT 'login_log', COUNT(*) FROM login_log
UNION ALL SELECT 'access_log', COUNT(*) FROM access_log;
