# Day 27 · 容器化（Dockerfile + 镜像 + Compose 编排）

> **今天目标**：先把 `mall-user + mall-gateway + MySQL + Redis + Nacos` 做成可部署的纵向切片，再用同一模板扩展到 course/order/stock/payment/seckill/search。重点是可重复构建、非 root 运行、配置外置、健康检查和不泄露密钥。

## 一、前置条件

- 已完成 **Day 01 ~ Day 02**：Maven 多模块骨架 + 11 张表（`course_mall` 库）
- 已完成 **Day 13 + Day 16**：`mall-user`（8080）、`mall-gateway`（9000）注册到 Nacos，`curl http://localhost:9000/api/health` 能通
- 已安装 **Docker Desktop**（Windows），`docker -v` 能输出版本号。没装的话去官网下载 Docker Desktop，装完在设置里确认 WSL2 引擎已启用
- 本机已装的 MySQL 8.4 / Redis / Nacos 继续保留（IDEA 里开发用），今天的容器版跑在**不同的宿主机端口**上，互不冲突

## 二、今天完成后你会得到什么

1. `E:\CourseMall\mall-user\Dockerfile`、`E:\CourseMall\mall-gateway\Dockerfile`
2. `E:\CourseMall\deploy\docker-compose.yml`——首个纵向切片一键编排；其余服务按清单逐个加入
3. 一条命令启动或停止首个可部署纵向切片，并掌握扩展到其余服务的方法
4. 三个容器基础设施（MySQL/Redis/Nacos）数据用数据卷持久化，容器删了数据还在

## 三、步骤

### 步骤 1：先搞懂三个词——镜像、容器、编排

面试必问的 Docker 基础概念，先对上号：

| 概念 | 一句话 | 类比 |
|---|---|---|
| **镜像（Image）** | 一个只读的「模板」，包含运行程序需要的全部文件（代码 + 运行环境 + 配置） | 安装包 / 类（Class） |
| **容器（Container）** | 镜像的「运行实例」，可以启动、停止、删除，互相隔离 | 装好的软件 / 实例（Object） |
| **Dockerfile** | 描述「怎么把代码做成镜像」的脚本 | 构建说明书 |
| **Compose** | 描述「多个容器怎么一起跑、怎么组网」的编排文件 | 一键部署脚本 |

```
代码 ──docker build（读 Dockerfile）──► 镜像 ──docker run / compose up──► 容器
```

::: tip 💡 面试题：容器和虚拟机有什么区别？
**一句话**：虚拟机虚拟出**整台硬件**（每个 VM 有独立 Guest OS，GB 级、分钟级启动）；容器只虚拟**运行环境**（共享宿主机内核，MB 级、秒级启动）。本质区别是「隔离在哪一层」——VM 隔离在操作系统层，容器隔离在进程层（namespace + cgroup）。所以一台机器能跑的容器数远多于虚拟机数。详见 [Docker](/learn_maintenance/Docker)。
:::

::: tip 💡 面试题：Docker 镜像为什么是「分层」的？
**一句话**：Dockerfile 里每一行指令（FROM/COPY/RUN）都会生成一个只读镜像层，叠加成最终镜像；构建时**逐层缓存**——某层没变就直接用缓存，所以「把不常变的东西放前面、常变的放后面」能极大加速构建。这也解释了为什么「先拷 pom 再拷源码」的 Dockerfile 比「全部 COPY 进去」快得多。详见 [Docker](/learn_maintenance/Docker)。
:::

### 步骤 2：给 mall-user 写 Dockerfile（多阶段构建）

创建 `E:\CourseMall\mall-user\Dockerfile`：

```dockerfile
# ============ 第 1 阶段：构建（builder） ============
# 为什么用 maven 官方镜像：镜像里自带 Maven + JDK 17，
# 宿主机（你的 Windows）不用装 JDK/Maven 也能完成构建——构建环境全部在容器里，人人一致
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build

# 多模块父 pom 会读取 modules 中所有子模块。为了避免漏拷 mall-security、
# mall-contract 等依赖模块导致 Maven 报错，这里复制经过 .dockerignore 过滤的完整仓库。
COPY . .

# -pl mall-user：只打包 mall-user 模块
# -am：同时把依赖的模块（mall-common）一起构建
# -DskipTests：镜像构建阶段跳过测试（单测在 CI/本地跑，不在打包镜像时跑）
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q package -pl mall-user -am -DskipTests

# ============ 第 2 阶段：运行（只留运行时） ============
# 为什么第 2 阶段换 JRE 镜像：构建阶段那个镜像有 Maven+JDK+缓存，几百 MB；
# 最终镜像只需要 JRE + jar，瘦身后只有约 200MB——这就是「多阶段构建」的意义
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# 运行阶段使用普通用户；curl 只用于 Actuator 健康检查。
RUN addgroup -S spring && adduser -S spring -G spring && apk add --no-cache curl

# 为什么 --from=builder：从第 1 阶段的产物里拷贝，而不是从宿主机拷贝
# *.jar 通配符：Spring Boot 打出来的 fat jar（含全部依赖），名字带版本号
COPY --from=builder --chown=spring:spring /build/mall-user/target/*.jar app.jar
USER spring

# 为什么 EXPOSE：声明容器要用的端口（文档性质，真正映射靠 docker run -p）
EXPOSE 8080

# 为什么用 ENTRYPOINT 而不是 CMD：
# docker run 后面追加的命令会「覆盖 CMD」，而 ENTRYPOINT 不会被覆盖——
# 保证这个容器启动后干的事永远是「跑这个 jar」，防止误操作把容器启动成别的
# -Duser.timezone=GMT+8：容器默认 UTC 时区，不设的话日志时间差 8 小时（经典坑）
ENTRYPOINT ["java", "-Duser.timezone=GMT+8", "-jar", "/app/app.jar"]
```

这里优先保证多模块构建不会漏文件，因此使用 `COPY . .`；`.dockerignore` 负责缩小上下文，
BuildKit 的 `/root/.m2` cache mount 负责复用 Maven 依赖。大型 CI 项目可以进一步为所有
子模块 POM 单独建立依赖缓存层，但必须把父 POM 中列出的模块 POM 全部复制，不能只复制
`mall-common` 和当前模块。

::: tip 💡 面试题：ENTRYPOINT 和 CMD 有什么区别？
**一句话**：`docker run 镜像 参数` 时，**追加的参数会替换 CMD 的内容，但会作为参数追加在 ENTRYPOINT 后面**。所以「固定执行的命令」用 ENTRYPOINT，「可变的默认参数」用 CMD。常见组合：`ENTRYPOINT ["java","-jar","app.jar"]` + `CMD ["--spring.profiles.active=dev"]`，这样 `docker run 镜像 --spring.profiles.active=prod` 可以覆盖默认参数。详见 [Docker](/learn_maintenance/Docker)。
:::

### 步骤 3：构建镜像

在 Git Bash 里执行：

```bash
cd /e/course-mall
# 为什么 -f 指定 Dockerfile：Dockerfile 放在模块目录里，但构建上下文必须是仓库根
# （多模块 Maven 需要父 pom 和 mall-common 的源码）
# 为什么 -t 指定名字：course-mall/mall-user 是「仓库名/镜像名」，1.0 是 tag（版本）
docker build -f mall-user/Dockerfile -t course-mall/mall-user:1.0 .
```

看到 `Successfully tagged course-mall/mall-user:1.0` 就成功了。检查：

```bash
docker images | grep course-mall
# 观察 SIZE：应该只有 200MB 左右。
# 如果 SIZE 有 700MB+，说明你的 Dockerfile 没有写多阶段（只有 FROM maven 一个阶段）
```

创建 `E:\CourseMall\mall-gateway\Dockerfile`，下面是完整内容：

```dockerfile
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
COPY . .
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B -q package -pl mall-gateway -am -DskipTests

FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN addgroup -S spring && adduser -S spring -G spring && apk add --no-cache curl
COPY --from=builder --chown=spring:spring /build/mall-gateway/target/*.jar app.jar
USER spring
EXPOSE 9000
ENTRYPOINT ["java", "-Duser.timezone=GMT+8", "-jar", "/app/app.jar"]
```

```bash
docker build -f mall-gateway/Dockerfile -t course-mall/mall-gateway:1.0 .
```

在仓库根目录新建 `E:\CourseMall\.dockerignore`，避免把构建产物、Git 历史、
本地密钥和日志发送进 Docker 构建上下文：

```text
.git
.idea
**/target
**/logs
deploy/.env
*.log
```

### 步骤 4：先单独跑一次容器（理解容器网络）

在写 Compose 之前，先手动 `docker run` 一次 mall-user，把「容器网络」这个坑踩明白：

```bash
# 先看看容器里的 localhost 是谁：容器有自己的网络命名空间，
# 容器里的 localhost:3306 是「容器自己」，不是你的 Windows
docker run --rm course-mall/mall-user:1.0

# 你会看到启动失败：连不上 MySQL（localhost:3306 在容器里不存在）
# 解法 1（手动跑时用）：Docker Desktop 提供 host.docker.internal 指向宿主机
# 同时用环境变量覆盖数据源地址（Spring Boot 的环境变量优先级高于 application.yml）
docker run --rm -p 8080:8080 \
  -e SPRING_DATASOURCE_URL="jdbc:mysql://host.docker.internal:3306/course_mall?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8" \
  -e SPRING_DATASOURCE_USERNAME=course_mall_app \
  -e SPRING_DATASOURCE_PASSWORD="$MYSQL_APP_PASSWORD" \
  -e SPRING_DATA_REDIS_HOST=host.docker.internal \
  -e SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR=host.docker.internal:8848 \
  course-mall/mall-user:1.0
```

此时 `curl http://localhost:8080/api/health` 应该能通（连的是宿主机上的 MySQL/Redis/Nacos）。

::: tip 💡 面试题：为什么 Spring Boot 在容器里连 MySQL 要改配置？环境变量为什么能覆盖 application.yml？
**一句话**：Spring Boot 的配置有优先级顺序：**命令行参数 > 环境变量 > application.yml > 默认值**。容器里 `localhost` 指向容器自己，所以必须用环境变量把地址改掉；而环境变量能覆盖 yml 正是「配置外置」的体现——**同一份镜像，换一组环境变量就能跑在不同环境**（开发连 dev 库、生产连 prod 库，不用重新打包）。这就是 12-Factor App 的第三因子「配置存于环境」。详见 [Spring Boot](/learn_backend/java/基础/Spring Boot)。
:::

### 步骤 5：写 docker-compose.yml（一键编排全部基础设施）

创建 `E:\CourseMall\deploy\docker-compose.yml`：

```yaml
# deploy/docker-compose.yml —— 首个纵向切片；敏感值从同目录 .env 读取
# 为什么用 Compose：五个容器要一起启动、互相通信（业务服务要连 mysql/redis/nacos），
# Compose 帮我们做三件事：组网（同一个 compose 网络内可以用「服务名」互相访问）、
# 按依赖顺序启动、一条命令整体管理
name: course-mall

services:
  # ---------- 基础设施 1：MySQL ----------
  mysql:
    image: mysql:8.4
    container_name: course-mall-mysql
    environment:
      # 为什么密码用环境变量传：不写死在镜像/文件里，换环境改一行配置即可
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?请在deploy/.env配置}
      TZ: Asia/Shanghai
    ports:
      # 为什么映射成 3307 而不是 3306：你本机 Windows 上已经装了 MySQL 占着 3306，
      # 容器再映射 3306 会端口冲突。宿主机 3307 → 容器 3306
      - "127.0.0.1:3307:3306"
    volumes:
      # 为什么挂数据卷：容器删除后 /var/lib/mysql 里的数据会一起消失，
      # 挂到命名卷 mysql-data 后，容器删了重建数据还在（生产必须这么做）
      - mysql-data:/var/lib/mysql
      # 为什么挂 init.sql：官方镜像约定，/docker-entrypoint-initdb.d 下的 .sql
      # 会在「数据卷为空」的首次启动时自动执行——建库建表不用手动进容器操作
      - ./mysql/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    # 为什么改 command：默认字符集是 latin1，中文会乱码；这里顺手改掉
    command: --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    healthcheck:
      # 为什么加 healthcheck：depends_on 只保证「容器启动了」，不保证「MySQL 就绪了」。
      # 用 mysqladmin ping 检测真正就绪，业务服务用 condition: service_healthy 等它
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -p\"$${MYSQL_ROOT_PASSWORD}\""]
      interval: 5s
      timeout: 3s
      retries: 20

  # ---------- 基础设施 2：Redis ----------
  redis:
    image: redis:7.2
    container_name: course-mall-redis
    ports:
      - "127.0.0.1:6380:6379"          # 仅绑定本机，不暴露到局域网
    volumes:
      - redis-data:/data     # Redis 数据持久化目录
    # 为什么 appendonly yes：开启 AOF 持久化，容器重启后缓存数据不丢
    command: redis-server --appendonly yes

  # ---------- 基础设施 3：Nacos ----------
  nacos:
    image: nacos/nacos-server:v2.3.2
    container_name: course-mall-nacos
    environment:
      MODE: standalone                  # 单机模式（生产集群才用 cluster）
      NACOS_AUTH_ENABLE: "false"        # 只允许本机开发；生产必须开启鉴权并限制网络
    ports:
      - "127.0.0.1:8848:8848"   # 本地开发控制台
      - "127.0.0.1:9848:9848"   # gRPC 客户端端口——Spring Cloud Alibaba 2.2.x+ 客户端必须能连它，
                      # 只映射 8848 服务会注册失败（高频踩坑点）

  # ---------- 业务服务 1：mall-user ----------
  mall-user:
    build:
      context: ..                 # 为什么 context 是上级目录：构建上下文=仓库根（同步骤 3 的道理）
      dockerfile: mall-user/Dockerfile
    image: course-mall/mall-user:1.0
    container_name: course-mall-mall-user
    depends_on:
      mysql:
        condition: service_healthy   # 等 MySQL 真正就绪（配合 healthcheck）才启动
      redis:
        condition: service_started
      nacos:
        condition: service_started
    environment:
      # 为什么这里写 mysql:3306 而不是 localhost：
      # Compose 把五个容器放进同一个网络，容器之间用「服务名」互访——mysql 就是那台 MySQL
      SPRING_DATASOURCE_URL: "jdbc:mysql://mysql:3306/course_mall?useSSL=false&serverTimezone=Asia/Shanghai&characterEncoding=utf8&allowPublicKeyRetrieval=true"
      SPRING_DATASOURCE_USERNAME: course_mall_app
      SPRING_DATASOURCE_PASSWORD: ${MYSQL_APP_PASSWORD:?请在deploy/.env配置}
      SPRING_DATA_REDIS_HOST: redis
      SPRING_DATA_REDIS_PORT: "6379"
      SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR: nacos:8848
      SPRING_CLOUD_NACOS_CONFIG_SERVER_ADDR: nacos:8848
      COURSE_MALL_JWT_SECRET: ${COURSE_MALL_JWT_SECRET:?请在deploy/.env配置}
      TZ: Asia/Shanghai
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://127.0.0.1:8080/actuator/health/readiness"]
      interval: 10s
      timeout: 3s
      retries: 12

  # ---------- 业务服务 2：mall-gateway ----------
  mall-gateway:
    build:
      context: ..
      dockerfile: mall-gateway/Dockerfile
    image: course-mall/mall-gateway:1.0
    container_name: course-mall-mall-gateway
    depends_on:
      nacos:
        condition: service_started
      mall-user:
        condition: service_started
    environment:
      # 网关只连 Nacos（路由 lb:// 走服务发现），不需要数据库
      SPRING_CLOUD_NACOS_DISCOVERY_SERVER_ADDR: nacos:8848
      COURSE_MALL_JWT_SECRET: ${COURSE_MALL_JWT_SECRET:?请在deploy/.env配置}
      TZ: Asia/Shanghai
    restart: unless-stopped
    read_only: true
    tmpfs:
      - /tmp
    ports:
      - "9000:9000"

# 声明命名卷：为什么不用 bind mount（宿主机目录）——
# 命名卷由 Docker 管理（Windows 上路径问题少、性能好），生产环境推荐命名卷
volumes:
  mysql-data:
  redis-data:
```

在 `deploy/.env.example` 只提交变量名，在本地复制成 `deploy/.env`；`.env` 必须加入 `.gitignore`：

```dotenv
MYSQL_ROOT_PASSWORD=请替换为本地强密码
MYSQL_APP_PASSWORD=请替换为应用账号密码
COURSE_MALL_JWT_SECRET=至少32字节且不要提交Git
```

`init.sql` 还要创建最小权限业务账号，业务容器不能使用 root：

```sql
CREATE USER IF NOT EXISTS 'course_mall_app'@'%' IDENTIFIED BY '<与MYSQL_APP_PASSWORD一致>';
GRANT SELECT, INSERT, UPDATE, DELETE ON course_mall.* TO 'course_mall_app'@'%';
```

本地 Compose 的环境变量替换不会自动改写 SQL 文件中的占位符。可用单独的初始化脚本读取环境变量，或首次启动后执行授权；不要把真实密码写入仓库中的 `init.sql`。

业务服务需引入 Actuator，并只暴露 `health/readiness`、`health/liveness`。Security 白名单只放行这两个探针路径，不要公开全部 `/actuator/**`。

纵向切片通过后，按相同模板加入并验收：`mall-course:8081`、`mall-order:8082`、`mall-stock:8083`、`mall-payment:8084`、`mall-seckill:8085`、`mall-search:8086`。内部服务不映射宿主机端口，仅 Gateway 映射 `9000`；ES、RocketMQ、Seata、Canal 使用独立 Compose profile，避免日常开发一次启动全部重型中间件。

::: tip 💡 面试题：`depends_on` 能保证 MySQL 先就绪吗？为什么还要 `healthcheck`？
**一句话**：`depends_on` 只保证「容器 A 在容器 B 之后启动」，但 MySQL 容器「启动了」不代表「数据库能接受连接了」（初始化数据、加载引擎还要几秒到几十秒）；`healthcheck` + `condition: service_healthy` 才是「等服务真正可用」——不配的话业务服务会在 MySQL 就绪前连库失败而崩溃重启。详见 [Docker](/learn_maintenance/Docker)。
:::

### 步骤 6：准备 init.sql，启动纵向切片

1. 把 **Day 02 的建库建表 SQL** 保存到 `E:\CourseMall\deploy\mysql\init.sql`（Day02 文档里的 11 张表 DDL，加一行 `CREATE DATABASE IF NOT EXISTS course_mall DEFAULT CHARACTER SET utf8mb4;` 和 `USE course_mall;`）
2. 启动（第一次会自动 build 两个业务镜像 + 拉三个基础镜像，耐心等几分钟）：

```bash
cd /e/course-mall/deploy
docker compose up -d          # -d：后台运行（detach）
docker compose ps             # 当前五个容器都应该 Up/healthy
```

3. 验证：

```bash
# 网关 → 用户服务链路通了吗
curl http://localhost:9000/api/health

# 容器里的 MySQL（映射在宿主机 3307）里有没有表
docker compose exec mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SHOW TABLES FROM course_mall"'

# Nacos 控制台 http://localhost:8848 能看到 mall-user 注册进来（IP 是容器网段 IP）
```

### 步骤 7：日常管理命令（面试也会问）

```bash
docker compose ps                    # 查看容器状态
docker compose logs -f mall-user     # 追某个服务的日志（-f 持续输出）
docker exec -it course-mall-mysql bash   # 进容器内部（-it 交互式终端）
docker compose down                  # 停掉并删除全部容器（数据卷还在，数据不丢）
docker compose down -v               # ⚠️ 连数据卷一起删——数据全没了，慎用
docker compose up -d --build         # 改了代码后：重新构建镜像并启动
```

::: tip 💡 面试题：容器删了数据就没了，怎么保证数据持久化？
**一句话**：容器的「可写层」生命周期和容器一致，删容器即丢；解决办法是把数据写到 **volume（命名卷）或 bind mount（宿主机目录）** 里，这两种挂载的数据独立于容器生命周期。所以「MySQL/Redis 必须挂卷，无状态的业务服务不用挂卷」。详见 [Docker](/learn_maintenance/Docker)。
:::

::: tip 💡 面试题：Docker 的 bridge 网络是什么？为什么容器之间能用服务名互访？
**一句话**：bridge 是 Docker 默认的虚拟网络，同一网络内的容器互相连通且**自带内置 DNS**——容器名/服务名会被解析成容器 IP。所以 compose 里 `mysql:3306` 能连上 MySQL，本质是「DNS 解析成 IP」。外部访问容器则靠 `ports` 映射（宿主机端口 → 容器端口）。详见 [Docker](/learn_maintenance/Docker)。
:::

## 四、知识点索引

| 今天用到/会问到 | 去哪复习 |
|---|---|
| 镜像/容器/Dockerfile/Compose/网络/数据卷 | [Docker](/learn_maintenance/Docker) |
| 环境变量覆盖配置、配置优先级 | [Spring Boot](/learn_backend/java/基础/Spring Boot) |
| Nacos 注册发现（容器里的服务发现） | [Nacos](/learn_backend/java/微服务/Nacos) |
| MySQL 8.4 字符集、数据目录 | [MySQL](/learn_database/MySQL) |
| Redis AOF 持久化 | [Redis](/learn_database/Redis) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `docker build` 两个镜像成功、`docker images` 里 SIZE 约 200MB：是 / 否
- [ ] `docker compose up -d` 五个容器全部 Up：是 / 否
- [ ] `curl http://localhost:9000/api/health` 返回成功：是 / 否
- [ ] 容器 MySQL 里 `SHOW TABLES FROM course_mall` 能看到 11 张表：是 / 否
- [ ] `docker compose down` 后再 `up -d`，MySQL 数据还在（持久化验证）：是 / 否
- [ ] 踩坑记录（端口冲突、构建缓存不生效、Nacos 注册不上等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 你的 Dockerfile 为什么要写**两个 FROM**？如果只保留第一个 FROM（maven 镜像）直接跑 jar，会发生什么？（提示：镜像体积、安全性、攻击面）
2. 「先 COPY pom、再 COPY src」能加速构建的原理是什么？如果我把 `COPY . .` 放在最前面会怎样？（提示：分层缓存、缓存失效）
3. Compose 里业务服务连 MySQL 写的是 `mysql:3306`，这个 `mysql` 是怎么被解析成 IP 的？如果我把 MySQL 容器的 `container_name` 改成别的，`mysql:3306` 还连得上吗？
4. `depends_on` 和 `healthcheck + condition: service_healthy` 的区别是什么？你遇到过「服务启动了但数据库还没就绪」的报错吗？日志长什么样？
5. 为什么 MySQL/Redis 要挂数据卷，而 mall-user 不用挂？如果生产环境的 MySQL 没挂卷，删容器重建会是什么后果？（提示：数据全丢、找回难度）
