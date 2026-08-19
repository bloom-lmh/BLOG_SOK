# Docker

一句话定位：Docker 是一个开源的**容器化平台**，它把应用及其运行所需的代码、依赖、运行时、配置全部打包成一个标准化的「镜像」，然后在隔离的「容器」里运行，解决「我这能跑、你那不行」的环境不一致问题和部署繁琐问题，实现**一次构建、到处运行**。

---

## 基础篇

### 1. 为什么会有 Docker：背景与要解决的问题

在 Docker 出现之前，部署一个应用要面对一串经典难题：

1. **环境不一致**：开发用 JDK 8，生产是 JDK 11；本地 `npm` 版本、系统依赖库、配置文件都不一样，代码明明没问题，换个机器就报错。
2. **部署繁琐**：手动装依赖、改配置、启动服务、处理冲突，每一步都可能出错，且难以自动化。
3. **资源浪费**：一台服务器只能跑一个应用（怕互相影响），CPU、内存大量闲置；想隔离又得上虚拟机，开销巨大。
4. **不可迁移**：应用和它依赖的环境深度绑定在某一台机器上，扩容、迁移、回滚都困难。

Docker 的答案是：**把应用和它运行需要的一切打包成一个不可变的镜像（Image），在宿主机上用容器（Container）隔离运行**。镜像在哪台机器上展开，跑出来的结果都一样。这背后依赖的是 Linux 内核两大能力——**Namespace（隔离）**和 **Cgroups（资源限制）**，而不是像虚拟机那样虚拟一整套硬件和操作系统。

> 一句话记住：**Docker 不是新的虚拟化技术，而是把 Linux 已有的内核隔离能力（Namespace + Cgroups）打包成一套好用易迁移的应用交付格式。**

---

### 2. 核心三件套：镜像 / 容器 / 仓库

Docker 的世界里有三个必须分清楚的概念：

| 概念 | 英文 | 作用 | 类比 | 特点 |
|------|------|------|------|------|
| 镜像 | Image | 只读的静态模板，打包了代码 + 依赖 + 运行环境 + 启动命令 | 类（Class） | 不可变、可分层、可复用、可分享 |
| 容器 | Container | 镜像的运行实例，彼此隔离，有独立文件系统、网络、进程 | 对象（实例） | 可创建/启动/停止/删除，状态可变 |
| 仓库 | Registry | 存放和分发镜像的地方，如 Docker Hub | 代码仓库 | 有公有/私有，镜像由「仓库名:标签」定位 |

它们的关系可以用一张流转图表示：

```
        docker build                docker run
  Dockerfile ---------> 镜像 Image ---------> 容器 Container
                           |                       |
                        docker push              docker start/stop
                           v
                    仓库 Registry（Docker Hub / 私有）
                           |
                        docker pull
                           v
                       另一台机器的本地镜像
```

- **镜像是模板，容器是实例**：一个 `nginx` 镜像可以跑出 10 个彼此独立的 nginx 容器。
- **镜像不可变**：容器里改文件、装软件，改的是容器自己的「可写层」，镜像本身不变。
- **仓库是枢纽**：`docker pull` 从仓库拉镜像，`docker push` 把本地镜像推上去。

---

### 3. Docker 与虚拟机的本质区别

这是面试和理解的基石，不能只背表格，要理解「隔离发生在哪一层」。

| 对比项 | Docker 容器 | 虚拟机（VM） |
|--------|------------|--------------|
| 隔离级别 | **进程级**，共享宿主机内核 | **硬件级**，每台有完整 Guest OS |
| 启动速度 | 秒级（本质是启动一个进程） | 分钟级（要启动一整个 OS） |
| 资源占用 | 小（MB 级镜像、内存按需） | 大（GB 级，每个 VM 一套 OS） |
| 性能损耗 | 极低（近乎原生） | 有虚拟化开销（CPU 指令翻译、内存双层映射） |
| 隔离强度 | 较弱（共享内核，内核漏洞会波及） | 强（完全独立的 OS） |
| 可移植性 | 极强（镜像格式统一） | 较弱（受虚拟化平台绑定） |

**结构对比图：**

```
【虚拟机】                           【容器】
┌──────────────┐                 ┌──────────────┐
│   App A      │                 │   App A      │
├──────────────┤                 ├──────────────┤
│  Bins/Libs   │                 │  Bins/Libs   │
├──────────────┤                 ├──────────────┤
│  Guest OS    │  ← 每台一套      │  （无 Guest OS）│
├──────────────┤                 ├──────────────┤
│  Hypervisor  │  ← 虚拟硬件层    │  Docker 引擎  │
├──────────────┤                 ├──────────────┤
│   Host OS    │                 │   Host OS    │
├──────────────┤                 ├──────────────┤
│  物理硬件     │                 │  物理硬件     │
└──────────────┘                 └──────────────┘
```

::: tip 💡 面试题：Docker 容器和虚拟机有什么区别？
结论：容器共享宿主机内核、进程级隔离、秒级启动、占用小；虚拟机有独立 Guest OS、硬件级隔离、隔离更彻底但更重。
原因：容器只隔离进程视角和资源（Namespace + Cgroups），虚拟机要虚拟整个操作系统和硬件。
展开：所以容器启动快、密度高（一台机器能跑几百个容器），但隔离安全性弱于虚拟机——宿主内核一旦有漏洞，所有容器都受影响；而虚拟机的 Guest OS 崩溃不会影响其他虚拟机。生产上常是「虚拟机跑 Docker」叠加使用，兼顾隔离性和密度。
:::

---

### 4. 镜像管理命令（成体系）

镜像命令围绕「获取 → 查看 → 构建 → 打标签 → 推送/拉取 → 删除」展开。

| 命令 | 作用 | 示例 | 使用场景 |
|------|------|------|----------|
| `docker pull 镜像:标签` | 从仓库拉镜像 | `docker pull nginx:1.25` | 部署前先把镜像下载到本地 |
| `docker images` | 列出本地镜像 | `docker images` | 查看本地有哪些镜像、多大 |
| `docker images -a` | 含中间层全部列出 | `docker images -a` | 排查层缓存、看构建残留 |
| `docker build -t 名:标签 .` | 用 Dockerfile 构建 | `docker build -t myapp:v1 .` | 交付自己的应用 |
| `docker tag 源 目标` | 给镜像打新标签 | `docker tag myapp:v1 myapp:latest` | 推送前改成仓库规范名 |
| `docker rmi 镜像` | 删除镜像 | `docker rmi nginx:1.25` | 清理不再用的镜像 |
| `docker image prune` | 清理悬空镜像 | `docker image prune -f` | 构建后清理 `<none>` 中间镜像 |
| `docker push 镜像` | 推送到仓库 | `docker push repo/myapp:v1` | 发布给团队或生产 |
| `docker save -o 文件 镜像` | 导出为 tar 包 | `docker save -o nginx.tar nginx` | 离线环境分发镜像 |
| `docker load -i 文件` | 从 tar 导入 | `docker load -i nginx.tar` | 离线环境导入镜像 |
| `docker inspect 镜像` | 查看镜像元数据 | `docker inspect nginx` | 看暴露端口、环境变量、分层 |
| `docker history 镜像` | 查看构建历史/分层 | `docker history nginx` | 分析镜像层大小，优化体积 |

镜像名规范：`[仓库地址/]名称[:标签]`，例如 `harbor.example.com/team/myapp:1.2.3`。标签默认 `latest`，但生产**强烈建议显式打版本号**，避免 `latest` 漂移导致不可预期。

```bash
# 完整的一次镜像流转示例
docker pull nginx:1.25            # 1. 拉取指定版本
docker images                     # 2. 确认已存在
docker tag nginx:1.25 myapp:web   # 3. 打自己的标签
docker save -o web.tar myapp:web  # 4. 导出，发给离线机器
# 在离线机器上：
docker load -i web.tar            # 5. 导入
```

---

### 5. 容器命令与生命周期状态机

容器有明确的生命周期状态，理解状态机才能看懂 `docker ps -a` 里的各种状态。

```
                 docker run / create
                    │
                    v
              ┌───────────┐   docker start    ┌───────────┐
              │  Created  │ ────────────────> │  Running  │
              └───────────┘                   └───────────┘
                                                 │    │
                          docker stop(优雅,发SIGTERM) │    │ 主进程自己退出
                                                 v    v
              ┌───────────┐   docker restart  ┌───────────┐
              │  Exited   │ <──────────────── │  Paused   │ ← docker pause/unpause
              └───────────┘                   └───────────┘
                    │
                docker rm
                    v
                 （被删除，消失）
```

- `Created`：容器对象已创建，但进程还没启动。
- `Running`：主进程（PID 1）在运行。
- `Exited`：主进程退出（正常退出或被杀）。
- `Paused`：进程被暂停（`docker pause`），文件系统、内存原样保留。
- `stop` 是**优雅停机**（先发 SIGTERM 给 PID 1，超时再 SIGKILL）；`kill` 是直接发信号。

容器命令全表：

| 命令 | 作用 | 示例 | 使用场景 |
|------|------|------|----------|
| `docker run [参数] 镜像` | 创建并启动容器 | `docker run -d -p 8080:80 nginx` | 最常用，创建+启动一步到位 |
| `docker create 镜像` | 只创建不启动 | `docker create nginx` | 先建好，稍后再 start |
| `docker start 容器` | 启动已停止容器 | `docker start web` | 重启 Exited 容器 |
| `docker stop 容器` | 优雅停止 | `docker stop web` | 正常下线 |
| `docker restart 容器` | 重启 | `docker restart web` | 应用更新后重启 |
| `docker kill 容器` | 强制停止（发信号） | `docker kill -s SIGKILL web` | 卡死时强制结束 |
| `docker rm 容器` | 删除容器 | `docker rm web` | 清理不用容器 |
| `docker rm -f 容器` | 强制删除运行中容器 | `docker rm -f web` | 不用先 stop 再 rm |
| `docker ps` | 列出运行中容器 | `docker ps` | 看当前跑着什么 |
| `docker ps -a` | 列出所有容器 | `docker ps -a` | 看含已停止的容器 |
| `docker logs -f 容器` | 跟踪日志 | `docker logs -f --tail 100 web` | 看应用输出、排障 |
| `docker exec -it 容器 bash` | 进入容器执行 | `docker exec -it web /bin/sh` | 进容器排查 |
| `docker attach 容器` | 附着到主进程 | `docker attach web` | 连到容器标准输入输出 |
| `docker cp 源 目标` | 与容器互拷文件 | `docker cp web:/etc/nginx/nginx.conf .` | 取出/放入文件 |
| `docker inspect 容器` | 查看容器详情 | `docker inspect web` | 看 IP、挂载、网络、配置 |
| `docker stats` | 实时资源占用 | `docker stats` | 监控 CPU/内存 |
| `docker top 容器` | 看容器内进程 | `docker top web` | 排查进程状态 |
| `docker rename 旧 新` | 重命名容器 | `docker rename web web2` | 改名 |

`docker run` 参数是本篇重点，先给一个速查表，后续章节逐个展开原理：

| 参数 | 作用 | 示例 |
|------|------|------|
| `-d` / `--detach` | 后台运行 | `-d` |
| `-i` / `-t` | 交互式 + 分配终端 | `-it` |
| `--name` | 命名容器 | `--name web` |
| `-p 宿主:容器` | 端口映射 | `-p 8080:80` |
| `-v 宿主:容器` | 挂载数据卷 | `-v /data:/var/lib/mysql` |
| `-e` / `--env` | 注入环境变量 | `-e MYSQL_ROOT_PASSWORD=root` |
| `--env-file` | 从文件读环境变量 | `--env-file .env` |
| `--network` | 指定网络 | `--network my-net` |
| `--restart` | 重启策略 | `--restart=always` |
| `--memory` / `--cpus` | 资源限制 | `--memory=512m --cpus=1.0` |
| `--rm` | 退出即删（不留 Exited） | `--rm` |
| `--hostname` | 设置容器主机名 | `--hostname app1` |
| `--entrypoint` | 覆盖入口 | `--entrypoint /bin/sh` |

```bash
# 一个信息完整的启动示例
docker run -d \
  --name web \
  --restart=always \
  -p 8080:80 \
  -e ENV=prod \
  --memory=512m \
  --cpus=1.0 \
  -v /srv/web:/usr/share/nginx/html:ro \
  nginx:1.25
```

---

### 6. Dockerfile 详解（每一条指令）

Dockerfile 是构建镜像的「配方」，每一条指令默认生成一个镜像层。下面把常用指令按「用途 → 语法 → 说明」系统梳理。

| 指令 | 作用 | 示例 | 说明 |
|------|------|------|------|
| `FROM` | 指定基础镜像 | `FROM python:3.11-slim` | 必须第一条（`ARG` 除外），决定起点 |
| `WORKDIR` | 设置工作目录 | `WORKDIR /app` | 不存在会自动创建，后续指令相对它执行 |
| `COPY` | 复制文件到镜像 | `COPY . .` | 推荐用它而非 `ADD`，语义清晰 |
| `ADD` | 复制 + 自动解压/下载 | `ADD app.tar.gz /app/` | 有 tar 自动解压、支持 URL，但行为隐晦 |
| `RUN` | 构建时执行命令 | `RUN pip install -r req.txt` | 每执行一次多一层，尽量合并 |
| `ENV` | 设置环境变量 | `ENV APP_PORT=8000` | 构建和运行都生效 |
| `ARG` | 构建参数 | `ARG VERSION=1.0` | 仅构建期可用，`--build-arg` 传入 |
| `EXPOSE` | 声明监听端口 | `EXPOSE 8000` | 文档用途，真正映射靠 `-p` |
| `CMD` | 默认启动命令 | `CMD ["uvicorn","main:app"]` | 可被 `docker run` 覆盖 |
| `ENTRYPOINT` | 固定入口 | `ENTRYPOINT ["python"]` | 不被 `docker run` 覆盖，除非 `--entrypoint` |
| `VOLUME` | 声明匿名卷挂载点 | `VOLUME /var/lib/mysql` | 数据写到这，默认持久化 |
| `USER` | 切换运行用户 | `USER appuser` | 避免以 root 运行，安全最佳实践 |
| `HEALTHCHECK` | 健康检查 | `HEALTHCHECK CMD curl -f localhost/ || exit 1` | 供编排系统判断容器是否就绪 |
| `LABEL` | 加元数据标签 | `LABEL maintainer="team"` | 组织、版本、负责人信息 |

`CMD` 与 `ENTRYPOINT` 的三种写法及区别，是高频考点：

```dockerfile
# 写法一：shell 形式（会包一层 /bin/sh -c，注意无法收到前台信号）
CMD echo hello

# 写法二：exec 形式（推荐，进程直接作为 PID 1，能正确接收 SIGTERM）
CMD ["echo", "hello"]

# 写法三：ENTRYPOINT 定主程序，CMD 定默认参数
ENTRYPOINT ["java", "-jar", "app.jar"]
CMD ["--server.port=8080"]
# docker run 时传参 --server.port=9090 会覆盖 CMD，ENTRYPOINT 不变
```

::: tip 💡 面试题：Dockerfile 里 CMD 和 ENTRYPOINT 有什么区别？
结论：CMD 提供**可被覆盖**的默认命令，ENTRYPOINT 是**固定入口**，两者配合时 ENTRYPOINT 定主程序、CMD 定默认参数。
原因：`docker run 镜像 参数` 会整体替换 CMD，但不会替换 ENTRYPOINT（除非显式 `--entrypoint`）。
展开：所以「镜像即命令」的常见做法是 `ENTRYPOINT` 写死主程序（如 `java -jar app.jar`），`CMD` 提供默认参数（如 `--server.port=8080`），运行时想改端口只需追加参数即可，非常灵活。另外 exec 形式（JSON 数组）让进程直接作为 PID 1，能正确接收 `docker stop` 发出的 SIGTERM 优雅退出，而 shell 形式会多包一层 `/bin/sh`，信号传递有问题。
:::

完整可运行示例（一个 Python 后端）：

```dockerfile
# 1. 选择精简基础镜像：slim 体积小，带完整 pip 能力
FROM python:3.11-slim

# 2. 设置环境变量，避免 Python 写 .pyc、开启无缓冲输出（日志实时可见）
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# 3. 工作目录：后续 COPY/RUN/CMD 都在 /app 下执行
WORKDIR /app

# 4. 先只复制依赖清单并安装——为什么？依赖变更频率低，
#    这一层会被缓存，改代码不会触发重装依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. 再复制源码（放在依赖层之后，源码天天变也只重建最后一层）
COPY . .

# 6. 创建非 root 用户运行（安全）
RUN adduser --disabled-password --gecos "" appuser
USER appuser

# 7. 声明端口（文档用途）
EXPOSE 8000

# 8. 健康检查：让编排系统知道容器是否真的就绪
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# 9. exec 形式启动，进程直接是 PID 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

构建与运行：

```bash
docker build -t myapp:1.0 .        # -t 打标签，. 是构建上下文
docker build -f Dockerfile.prod .  # 用指定文件名
docker run -d -p 8000:8000 myapp:1.0
```

---

### 7. 数据卷 Volume：让数据活得比容器久

容器是无状态、可随意删除的——**容器一删，里面的文件全没了**。但数据库、上传文件、日志必须持久化，这就靠「挂载」把宿主机目录/卷接到容器里。

三种挂载方式的本质区别：

| 类型 | 语法 | 谁管路径 | 特点 | 适用场景 |
|------|------|----------|------|----------|
| 命名卷 Volume | `-v 卷名:容器路径` | Docker 管理（`/var/lib/docker/volumes/`） | 官方推荐、跨主机可插件化 | 数据库数据、生产持久化 |
| 匿名卷 | `-v 容器路径` | Docker 自动生成随机名 | 生命周期随容器 | Dockerfile 里 `VOLUME` 声明的 |
| 绑定挂载 bind mount | `-v /宿主绝对路径:容器路径` | 用户自己指定 | 直接映射、可能被容器写坏 | 开发时挂代码、挂配置 |

```bash
# 1. 命名卷（推荐）：数据由 Docker 托管
docker volume create db_data
docker run -d -v db_data:/var/lib/mysql mysql:8

# 2. 绑定挂载：开发时把宿主机代码目录映射进容器，改代码实时生效
docker run -d -v /home/user/project:/app -v /home/user/nginx.conf:/etc/nginx/nginx.conf:ro nginx

# 3. 卷命令
docker volume ls            # 列出所有卷
docker volume inspect db_data  # 看卷的真实宿主机路径
docker volume rm db_data    # 删除卷（容器不用时才能删）
docker volume prune         # 清理无主卷
```

`-v` 与 `--mount` 的对比（`--mount` 是更显式、更推荐的写法）：

```bash
# -v 短写法
docker run -d -v db_data:/var/lib/mysql:ro mysql:8

# --mount 长写法（key=value，语义更清晰，Docker 官方建议）
docker run -d --mount type=volume,source=db_data,target=/var/lib/mysql,readonly mysql:8
```

::: tip 💡 面试题：为什么要用数据卷？bind mount 和 volume 有什么区别？
结论：容器文件系统是临时的，容器删除数据即丢；数据卷把数据落到宿主机，实现持久化和共享。volume 由 Docker 托管、生命周期独立，bind mount 直接挂宿主机指定目录。
原因：容器被设计成「可随时销毁重建」的不可变运行单元，持久状态必须外置。
展开：命名卷在 Linux 下实际就是宿主机 `/var/lib/docker/volumes/卷名/_data` 目录，Docker 帮你统一管理、好备份好迁移；bind mount 则把宿主机任意目录映射进去，开发阶段方便，但生产上容器可以直接改宿主机文件，权限和安全要自己把控。
:::

---

### 8. 网络：容器之间如何通信

Docker 有四种网络模式，各自解决不同的通信问题：

| 模式 | 说明 | 特点 | 适用场景 |
|------|------|------|----------|
| `bridge`（默认） | 容器接在一个虚拟网桥 `docker0` 上 | 同网段容器互通，`-p` 才能对外 | 单机默认场景 |
| `host` | 直接共享宿主机网络栈 | 无 NAT、性能最好，端口直接是宿主机端口 | 追求极致网络性能 |
| `none` | 完全无网络 | 只有 lo 回环 | 安全隔离、自己配网络 |
| `container:名` | 共享另一个容器的网络栈 | 与目标容器同 IP | 边车（如日志收集器） |
| 自定义网络 | 用户自建 bridge/overlay | 支持**容器名 DNS 解析** | 多容器应用互相访问 |

```bash
# 查看网络
docker network ls

# 创建自定义 bridge 网络：同网络的容器可以用「容器名」互相访问（内置 DNS）
docker network create my-net

# 两个容器加入同一网络
docker run -d --network my-net --name app1 myapp
docker run -d --network my-net --name db mysql:8
# 此时 app1 里直接 ping db 就能通（因为 my-net 提供了名字解析）

# 网络命令
docker network inspect my-net   # 看网络详情、已接入容器及其 IP
docker network rm my-net        # 删除网络
docker network connect my-net web  # 把已有容器接进网络
docker network disconnect my-net web
```

端口映射 `-p` 的几种写法：

| 写法 | 含义 |
|------|------|
| `-p 8080:80` | 宿主机 8080 → 容器 80 |
| `-p 192.168.1.5:8080:80` | 绑定指定宿主 IP |
| `-p 8080:80/tcp` | 只映射 TCP（默认） |
| `-P` | 把 EXPOSE 声明的端口随机映射到宿主机高位端口 |

---

### 9. 容器资源限制（Cgroups 在命令层的体现）

容器默认**不限制资源**，一个容器就能吃光整机 CPU/内存。生产必须显式限制：

```bash
# 内存限制：--memory（硬限制）+ --memory-swap
docker run -d --memory=512m --memory-swap=1g nginx

# CPU 限制：--cpus（几核）或 --cpuset-cpus（绑定哪几核）
docker run -d --cpus=1.5 nginx
docker run -d --cpuset-cpus="0-1" nginx

# 重启策略：容器异常退出自动拉起
docker run -d --restart=always nginx
#   no(默认) / on-failure[:次数] / always / unless-stopped
```

---

## 高级篇

### 10. Docker Compose：一条命令编排整个应用栈

单容器用 `docker run` 没问题，但真实应用是 **Web + DB + 缓存 + 消息队列** 一组服务。逐个 `docker run`、还要手动建网络、管启动顺序，既繁琐又不可复现。Compose 用一份 YAML 描述**整个应用栈**，一条命令统一启动/停止。

一个贴近生产的完整示例：

```yaml
# docker-compose.yml
# Compose 规范版本（新版可省略 version 字段）
services:
  web:
    build: .                      # 用当前目录 Dockerfile 构建
    image: myapp:1.0             # 构建后打的镜像名
    container_name: web
    ports:
      - "8000:8000"              # 端口映射
    depends_on:
      db:
        condition: service_healthy  # 等 db 健康检查通过才启动（新版支持）
    environment:                 # 环境变量注入
      - DATABASE_URL=mysql://root:root@db:3306/mydb
    restart: unless-stopped
    networks:
      - backend

  db:
    image: mysql:8
    environment:
      - MYSQL_ROOT_PASSWORD=root
      - MYSQL_DATABASE=mydb
    volumes:
      - db_data:/var/lib/mysql   # 数据持久化
    healthcheck:                 # 健康检查供 depends_on 判断
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  redis:
    image: redis:7-alpine
    networks:
      - backend

# 声明命名卷
volumes:
  db_data:

# 声明网络
networks:
  backend:
```

Compose 常用命令表：

| 命令 | 作用 | 使用场景 |
|------|------|----------|
| `docker compose up -d` | 后台启动全部服务（缺则先构建） | 首次/日常启动 |
| `docker compose up -d --build` | 强制重新构建再启动 | 改了代码后 |
| `docker compose down` | 停止并删除容器/网络 | 整体下线 |
| `docker compose down -v` | 连数据卷一起删（危险！） | 彻底清理测试环境 |
| `docker compose ps` | 查看栈内容器状态 | 快速看状态 |
| `docker compose logs -f [服务]` | 跟踪日志 | 排障 |
| `docker compose exec 服务 bash` | 进入某服务容器 | 排查 |
| `docker compose restart 服务` | 重启指定服务 | 单服务重启 |
| `docker compose build` | 只构建镜像不启动 | 预热镜像 |
| `docker compose config` | 校验/展开配置 | 排查配置错误 |

::: tip 💡 面试题：depends_on 能保证依赖服务完全就绪吗？
结论：不能。depends_on 只保证「启动顺序」，不保证依赖服务真正可用（如数据库已能接受连接）。
原因：Compose 判断的是容器「已启动」，而不是服务「已就绪」——MySQL 容器起来后还要几秒初始化。
展开：新版本 Compose 支持 `condition: service_healthy` 配合 `healthcheck`，等健康检查通过再启动下游；传统做法是在应用里加重试逻辑（连不上就重试），或加 `entrypoint` 等待脚本。二者叠加最稳。
:::

---

### 11. 多阶段构建：把编译和运行分开

很多语言要编译才能跑（Go、Java、前端）。如果直接在镜像里装编译器+依赖，最终镜像会带上大量只构建期才需要的东西。多阶段构建用**多个 `FROM`** 把「构建」和「运行」分到不同阶段，最后只复制产物。

```dockerfile
# ===== 阶段一：builder（含完整工具链，体积大，但只用于构建）=====
FROM golang:1.21 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download              # 先下依赖，利用缓存
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# ===== 阶段二：runtime（只有运行产物，极小）=====
FROM alpine:3.19
RUN apk add --no-cache ca-certificates  # 仅运行时需要的证书
WORKDIR /app
COPY --from=builder /app/main .        # 从 builder 阶段复制编译产物
USER nobody
EXPOSE 8080
CMD ["./main"]
```

前端构建同样适用（构建阶段 `npm run build`，运行阶段用 nginx 托管静态文件）：

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

::: tip 💡 面试题：多阶段构建有什么用？
结论：把编译期和运行期环境分离，最终镜像只保留运行产物，大幅减小体积、缩小攻击面、加快传输。
原因：构建阶段需要的编译器、SDK、依赖只在中间层存在，不会被 `COPY` 进运行镜像。
展开：比如 Go 项目用 `golang` 镜像编译后，运行镜像可以只用几 MB 的 `alpine` 甚至 `scratch`（空镜像），对比单阶段动辄几百 MB，体积可缩小一个数量级。体积小意味着拉取快、部署快、暴露面小。
:::

---

### 12. 镜像优化：让镜像又小又快

镜像体积和层数直接影响拉取速度、部署速度、攻击面。优化手段成体系如下：

| 手段 | 做法 | 收益 |
|------|------|------|
| 选小基础镜像 | `alpine`（~5MB）、`slim`、`distroless`、`scratch` | 体积成倍下降 |
| 多阶段构建 | 编译与运行分离 | 去除编译工具链 |
| 合并 RUN 指令 | 用 `&&` 连接、`\` 换行，一条 RUN 一层 | 减少层数 |
| 利用层缓存 | 先 COPY 依赖再 COPY 源码 | 改代码不重装依赖 |
| `.dockerignore` | 排除 `.git`、`node_modules`、日志、缓存 | 缩小构建上下文 |
| 清理包管理器缓存 | `apt-get clean` / `pip --no-cache-dir` | 去中间残留 |
| 固定基础镜像版本 | 用 `python:3.11-slim` 而非 `latest` | 可复现、安全 |

```dockerfile
# 合并 RUN 的正确姿势：一条 RUN 完成安装+清理，只产生一层
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*   # 清理缓存，防止残留进镜像
```

`.dockerignore` 示例：

```
.git
node_modules
*.log
.env
Dockerfile
.dockerignore
```

---

### 13. 私有仓库与镜像分发

生产环境镜像通常不进公共 Docker Hub，而是自建私有仓库。

```bash
# 1. 用 registry 官方镜像快速起一个私有仓库
docker run -d -p 5000:5000 --name registry \
  -v registry_data:/var/lib/registry \
  registry:2

# 2. 打标签：仓库地址作为镜像名前缀
docker tag myapp:1.0 localhost:5000/myapp:1.0

# 3. 推送
docker push localhost:5000/myapp:1.0

# 4. 拉取
docker pull localhost:5000/myapp:1.0
```

企业级常用 **Harbor**（开源、带 Web 管理界面、RBAC 权限、镜像扫描、复制）。Docker Hub 登录/推送：

```bash
docker login                          # 登录 Docker Hub（或指定 harbor 地址）
docker tag myapp:1.0 user/myapp:1.0
docker push user/myapp:1.0
```

镜像命名规范（语义化版本）：`registry.example.com/team/service:1.2.3`，`1.2.3` 对应 `major.minor.patch`，配合 CI 每次构建打唯一 tag，杜绝 `latest` 漂移。

---

### 14. 容器日志与排障

```bash
# 日志：默认 json-file 驱动，输出到宿主机 /var/lib/docker/containers/<id>/<id>-json.log
docker logs --tail 100 -f web           # 只看最后 100 行并持续跟踪
docker logs --since 1h web              # 最近 1 小时
docker logs -t web                      # 带时间戳

# 日志驱动：生产常改成 json-file 限制大小，或 local / fluentd
docker run -d --log-driver json-file \
  --log-opt max-size=10m --log-opt max-file=3 nginx

# 排障三步
docker ps -a                 # 1. 看容器状态（Exited 说明崩了）
docker logs <id>             # 2. 看日志找报错
docker inspect <id>          # 3. 看配置/IP/挂载/退出码
docker exec -it <id> sh      # 4. 进容器内部查（网络、进程、文件）
```

---

## 原理篇

### 15. Docker 总体架构：client → daemon → containerd → runc

理解原理先看一条命令背后经过了谁：

```
   docker 命令（CLI / client）
        │  Unix Socket / REST API（/var/run/docker.sock）
        v
   dockerd（Docker 守护进程）—— 管理镜像、容器、网络、卷
        │  gRPC
        v
   containerd（容器运行时管理）—— 拉镜像、管镜像、管容器生命周期
        │
        v
   containerd-shim —— 常驻的中间进程，解耦 daemon 与容器，支持重启恢复
        │
        v
   runc（OCI 运行时）—— 真正用 Linux Namespace + Cgroups 创建容器进程
        v
   ═══════ 容器进程（你的应用）═══════
```

关键点：

- **client 与 daemon 分离**：`docker` 命令只是客户端，通过 `/var/run/docker.sock` 与守护进程 `dockerd` 通信，所以可以远程操作（`DOCKER_HOST` 指定）。
- **containerd** 是从 Docker 剥离出来的行业标准容器运行时管理组件（CNCF 项目），K8s 也直接用它。
- **runc** 是 OCI 标准的参考实现，负责单容器的「创建与启动」，创建完就退出，由 shim 继续守护。
- **shim** 是个小而常驻的进程，它夹在 containerd 和容器之间，即使 containerd 重启，容器进程也不受影响。

> 这个分层是**演进**的结果：早期 Docker 把镜像管理、运行时、编排全揉在一个单体里，后来逐步拆成符合 **OCI（Open Container Initiative）标准** 的独立组件，让 K8s、Podman 等都能复用同一套运行时。

---

### 16. 镜像分层与联合文件系统（OverlayFS）

镜像是分层的，这背后是**联合文件系统（UnionFS）**。Docker 默认使用 **OverlayFS**（新版用 Overlay2 存储驱动）。

**镜像结构：一层叠一层**

```
镜像 nginx:latest
┌─────────────────────────────────┐
│ Layer 5: CMD ["nginx"]         │ ← 启动命令层
├─────────────────────────────────┤
│ Layer 4: RUN ...配置 nginx     │ ← Dockerfile 每条指令一层
├─────────────────────────────────┤
│ Layer 3: COPY nginx.conf       │
├─────────────────────────────────┤
│ Layer 2: RUN apt-get install   │
├─────────────────────────────────┤
│ Layer 1: 基础镜像 debian       │ ← 最底层，可被其他镜像共享
└─────────────────────────────────┘
   全部是【只读层】（read-only layers）
```

**容器运行时的 OverlayFS 挂载结构：**

```
      ┌────────────────────────────────────┐
      │         merged（合并视图）           │ ← 容器看到的 / 文件系统
      │   = lowerdir 只读层 + upperdir 可写层 │
      └────────────────────────────────────┘
                    ▲ 合并
   ┌────────────────┼────────────────┐
   │ upperdir（可写层）   │  lowerdir（只读层们）│
   │ 记录所有「改动」     │ 镜像本身的层，共享   │
   │ 容器删除即丢         │ 多个容器共用         │
   └────────────────────┴─────────────────────┘
```

OverlayFS 的**写时复制（Copy-on-Write, CoW）**机制——这是理解「容器改动不污染镜像」的核心：

1. **读文件**：只在 merged 层里找，直接读，无开销。
2. **第一次写一个镜像已有的文件**：先把该文件从 lowerdir **复制** 到 upperdir（CoW 触发），再在 upperdir 的副本上写。这样只读层永远不变。
3. **删除文件**：在 upperdir 创建一个 **whiteout 文件**（字符设备 `0/0`）遮蔽下层同名文件。
4. **新建文件**：直接写在 upperdir。

::: tip 💡 面试题：镜像为什么是分层的？容器改文件为什么不影响镜像？
结论：分层让构建可缓存、存储可复用；容器改动只写在独立的可写层（写时复制），只读层永远不被修改。
原因：UnionFS（OverlayFS）把多个只读层 + 一个可写层叠加成单一视图，写操作通过 Copy-on-Write 落到可写层。
展开：所以同一个基础镜像（如 debian 层）可以被成千上万个镜像和容器共享，磁盘只存一份；删除容器只是丢掉上层那个可写层，镜像安然无恙。这也解释了为什么 `docker rmi` 时一个层可能被多个镜像引用，删不掉。
:::

---

### 17. 镜像在仓库里的存储格式（manifest / config / layers）

镜像在 Registry 里不是一个大文件，而是拆成三部分：

```
registry.example.com/nginx:1.25（一个「镜像引用」）
        │
        v
  ┌─────────────┐
  │  manifest   │ ← 索引文件：列出 config + 所有 layer 的 digest（sha256）
  └─────────────┘
     │           │
     v           v
  ┌──────────┐  ┌──────────────┐
  │  config  │  │  layers[]    │ ← 每一层是一个 tar 压缩包
  │ 元数据    │  │  layer1.digest│    通过 sha256 内容寻址
  │(Env/CMD/ │  │  layer2.digest│
  │ Expose)  │  │  layer3.digest│
  └──────────┘  └──────────────┘
```

关键设计：**内容寻址（content-addressable）**——每一层的文件名就是它的 `sha256` 摘要。好处：

- 相同内容只存一份（不同镜像共享同一 base 层就是靠这个）。
- 内容不可篡改（改了摘要就对不上）。
- 拉取时可按层并发下载、断点续传。

这也是为什么 `docker pull` 时能看到 `Already exists`——那一层本地已经有了，直接复用。

---

### 18. 隔离原理一：Namespace（七个命名空间）

Namespace 是 Linux 内核提供的**资源隔离**机制：给进程一组「独立视角」，让它在自己的命名空间里看到专属的 PID、网络、挂载点等，仿佛独占一台机器。

Docker 用到的 7 种 Namespace：

| Namespace | 隔离内容 | 效果 | 对应 docker 参数 |
|-----------|----------|------|------------------|
| PID | 进程号 | 容器内进程 PID 从 1 开始，看不到宿主机进程 | `--pid` |
| Mount | 挂载点 | 容器有独立文件系统视图 | 基础能力 |
| Network | 网络栈 | 独立网卡、IP、路由、端口 | `--network` |
| UTS | 主机名/域名 | 容器可设自己的 hostname | `--hostname` |
| IPC | 信号量/消息队列/共享内存 | 进程间通信隔离 | `--ipc` |
| User | 用户/组 ID | 容器内 root 映射到宿主机普通用户 | `--user` / userns |
| Cgroup | Cgroup 视图 | 容器只能看到自己的资源控制组 | 基础能力 |

**PID 命名空间示例**（直观理解「视角隔离」）：

```
宿主机（PID NS 全局）：
  PID 1   systemd
  PID 100 dockerd
  PID 5000  ─────┐
                 │  进入容器的 PID 命名空间
                 v
容器内（独立 PID NS）：
  PID 1    nginx（在容器里看是 1 号进程，实际是宿主机 5000）
  PID 10   nginx worker
```

> 每个容器启动时，`runc` 会为新进程创建/加入这些 Namespace。`docker exec` 进容器，本质是「加入」容器已有进程的 Namespace。

---

### 19. 隔离原理二：Cgroups（资源限制）

Namespace 负责「隔离」，但它**不限制资源用量**——一个容器可以写满 CPU、吃光内存。限制靠 **Cgroups（Control Groups）**：把进程归入一个「控制组」，给这个组设 CPU、内存、I/O 上限。

Cgroups 主要子系统：

| 子系统 | 控制资源 | docker 对应参数 |
|--------|----------|-----------------|
| cpu | CPU 使用量/权重 | `--cpus`、`--cpu-shares` |
| cpuset | 绑定具体 CPU 核 | `--cpuset-cpus` |
| memory | 内存上限 + OOM | `--memory`、`--memory-swap` |
| blkio | 磁盘 I/O | `--device-read-bps` 等 |
| devices | 设备访问权限 | `--device` |
| pids | 进程数上限 | `--pids-limit` |

**内存限制与 OOM 流程：**

```
容器进程申请内存
      │
      v
是否超过 cgroup memory.limit_in_bytes ？
      │ 未超                          │ 已超
      v                               v
  正常分配                     触发回收 → 仍不够 → OOM Killer 杀掉组内进程
                                                    │
                                                    v
                                            容器主进程被杀 → 容器 Exited（状态码 137）
```

> 状态码 **137 = 128 + 9（SIGKILL）**，看到容器退出码 137，多半是被 OOM Killer 杀掉了，`docker inspect` 看 `OOMKilled: true` 可确认。

Cgroups 有 **v1 与 v2** 两代：v1 各子系统独立目录树、层级混乱；v2 统一为单一层级、按 `subtree_control` 委托，新内核（默认）已切到 v2。命令层完全无感，但了解版本有助于在宿主机 `/sys/fs/cgroup` 里定位排查。

::: tip 💡 面试题：Namespace 和 Cgroups 分别解决什么问题？
结论：Namespace 解决「隔离」（各容器有独立视角），Cgroups 解决「限制」（控制 CPU/内存等资源用量），两者合起来才是完整容器。
原因：只隔离不限量，一个容器能拖垮整机；只限量不隔离，进程之间仍互相可见、互相干扰。
展开：Namespace 让容器「看起来」独立，Cgroups 让容器「真的」受约束。二者都是 Linux 内核原生能力，Docker 只是把创建 Namespace 和写入 Cgroup 的繁琐步骤封装成了 `docker run` 一条命令。
:::

---

### 20. 网络实现原理：veth pair、bridge 与 iptables

默认 bridge 网络模式下，容器网络是这样连起来的：

```
  容器A（172.17.0.2）              容器B（172.17.0.3）
       │ eth0                           │ eth0
       │                               │
    veth 对一端                       veth 对一端
       │                               │
   ────┴───────  docker0 网桥（172.17.0.1）────────
                     │
                     │ NAT（iptables MASQUERADE）
                     v
              宿主机网卡 eth0 → 外部网络
```

核心概念：

1. **veth pair（虚拟网线对）**：成对出现的虚拟网卡，一端插进容器的 Network Namespace 作为它的 `eth0`，另一端插在宿主机 `docker0` 网桥上。数据从一端进、另一端出，像一根网线。
2. **docker0 网桥**：宿主机上的虚拟交换机，把接上来的所有容器连到同一局域网（默认网段 `172.17.0.0/16`）。
3. **NAT（iptables）**：容器访问外网时，源地址被 SNAT 成宿主机 IP；外部访问容器时，`-p 8080:80` 靠 **DNAT** 把流量从宿主机 8080 转到容器 80。

端口映射的 DNAT 规则链（`-p 8080:80` 背后）：

```
外部请求 → 宿主机:8080
              │
              v
   iptables DOCKER 链（nat 表）：DNAT 到 172.17.0.2:80
              │
              v
   docker0 网桥 → veth → 容器 eth0（172.17.0.2:80）
```

自定义网络（`docker network create`）比默认 bridge 多的关键能力是**内置 DNS 服务**（127.0.0.11）：容器之间可以直接用**容器名**互相解析，这也是多容器应用推荐建自定义网络而非默认 bridge 的原因。

---

### 21. 存储驱动与挂载类型回顾

容器文件的「持久化」和「镜像分层」是两套东西，别混淆：

- **镜像分层（OverlayFS）**：解决「镜像怎么存、怎么共享、怎么写时复制」，是镜像文件系统。
- **挂载（volume / bind mount / tmpfs）**：解决「容器里哪些数据要持久化到宿主机」，是数据文件系统。

三种挂载在宿主机上的落点：

```
/var/lib/docker/
   ├── overlay2/          ← 镜像层 + 容器可写层（OverlayFS）
   │     ├── l/           （符号链接）
   │     ├── diff/        （每层实际文件）
   │     └── merged/      （运行中容器的合并视图）
   ├── containers/<id>/   ← 容器元数据 + 日志
   └── volumes/           ← 命名卷的宿主机目录
         └── 卷名/_data/  ← 卷的真实数据

/tmp 之类          ← tmpfs 挂载（内存盘，重启即丢，适合临时文件）
任意宿主机目录      ← bind mount
```

```bash
# 对照验证：inspect 查看容器的挂载与分层
docker inspect web | grep -A5 Mounts        # 看挂载
docker inspect web | grep -A3 GraphDriver   # 看 OverlayFS 各目录
```

---

### 22. 构建缓存原理：为什么改了代码不用重装依赖

`docker build` 会为每条指令生成一个缓存层，下次构建逐条比对：

```
构建流程（逐指令）：
  COPY requirements.txt .
      │  内容没变？
      │  ├─ 没变 → 命中缓存，直接复用这层（含它的 RUN 结果）
      │  └─ 变了 → 从这里开始，后续所有层全部失效重建
      v
  RUN pip install ...        ← 依赖没变时这步被缓存跳过
      │
      v
  COPY . .                   ← 源码变了，从这层开始重建（很快，因为依赖层已缓存）
```

**这就是「先 COPY 依赖、再 COPY 源码」的用意**：依赖清单变更频率远低于源码，把易变的放后面，能最大化缓存命中。

缓存失效的三个关键点：

1. 某层前的**任何一层**变了，后面全失效。
2. 指令内容或 COPY 的文件内容变了，该层失效。
3. `ARG` 值变了，用它的层失效。

```bash
# 完全不用缓存重新构建
docker build --no-cache -t myapp:1.0 .
```

---

## 面试常问

**Q1：镜像和容器的关系？**
结论：镜像是只读静态模板，容器是镜像的运行实例，一个镜像可跑出多个互相隔离的容器。
展开：类比「类与对象」。镜像由多个只读层叠加，容器是在其上再加一个可写层；容器删除只丢可写层，镜像不变。

**Q2：Docker 和虚拟机有什么区别？**
结论：容器进程级隔离、共享宿主机内核、秒级启动、占用小；虚拟机硬件级隔离、独立 OS、隔离更彻底但更重。
展开：容器靠 Linux 的 Namespace + Cgroups 实现，虚拟机靠 Hypervisor 虚拟硬件。容器密度高但隔离弱于虚拟机。

**Q3：Namespace 和 Cgroups 分别做什么？**
结论：Namespace 做隔离（独立视角），Cgroups 做资源限制（CPU/内存上限），二者合起来构成容器。
展开：只隔离会资源失控，只限制会互相干扰。Docker 把它们封装成 `docker run` 一条命令。

**Q4：Dockerfile 里 CMD 和 ENTRYPOINT 的区别？**
结论：CMD 是可被 `docker run` 覆盖的默认命令，ENTRYPOINT 是固定入口，两者配合时前者定主程序、后者定默认参数。
展开：exec 形式让进程直接成为 PID 1 能正确收 SIGTERM 优雅退出；shell 形式会多包一层 `/bin/sh`。

**Q5：为什么要用数据卷？bind mount 和 volume 的区别？**
结论：容器文件系统临时、删除即丢，数据卷把数据落到宿主机持久化。volume 由 Docker 托管，bind mount 挂宿主机指定目录。
展开：命名卷路径在 `/var/lib/docker/volumes/`，好备份好迁移；bind mount 灵活但安全和权限要自己把控。

**Q6：如何减小镜像体积？**
结论：多阶段构建、选小基础镜像、合并 RUN、用 `.dockerignore`、清理包缓存。
展开：多阶段把编译工具链挡在运行镜像之外，配合 `alpine`/`distroless` 可把体积缩一个数量级。

**Q7：容器之间如何通信？**
结论：放进同一个自定义网络，用容器名互相访问（内置 DNS），对外用 `-p` 端口映射。
展开：默认 bridge 网段互通用 IP，自定义网络多了名字解析；跨主机通信则需 overlay 网络。

**Q8：容器退出码 137 通常代表什么？**
结论：137 = 128 + 9（SIGKILL），通常是内存超限被 OOM Killer 杀掉。
展开：`docker inspect` 里 `OOMKilled: true` 可确认，解决方法是调大 `--memory` 或优化应用内存。

---

相关阅读：[Nginx](/learn_backend/java/微服务/Nginx) ｜ [MySQL](/learn_database/MySQL) ｜ [Redis](/learn_database/Redis) ｜ [Spring Boot](/learn_backend/java/基础/Spring Boot) ｜ [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)
