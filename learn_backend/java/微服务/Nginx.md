# Nginx

> 一句话定位：Nginx 是一个高性能、高并发的 **HTTP 服务器 + 反向代理服务器 + 负载均衡器**，核心解决「单机扛不住、流量要分发、静态资源要加速、后端地址要隐藏」这四类问题，是后端部署、微服务网关入口和面试中「反向代理 + 负载均衡 + 高并发」的标配技术。

## 基础篇

### 一、背景：为什么会有 Nginx

在了解 Nginx 之前，先搞清楚它要解决的原始问题。2004 年前后，俄罗斯程序员 Igor Sysoev 在用 Apache 承载一个访问量很大的网站（Rambler）时，发现传统 Web 服务器面对一个经典难题——**C10K 问题**：

> C10K：单机同时维护 **1 万个并发连接** 时，传统「一个连接一个线程/进程」的模型会撑不住。

| 服务器 | 并发模型 | 问题 |
| --- | --- | --- |
| Apache（老版本 prefork） | 每连接一个进程/线程 | 1 万个连接就要 1 万个线程，内存、上下文切换直接爆炸 |
| Tomcat（Servlet 容器） | 线程池 + 阻塞 IO | 线程数有限，慢请求会占满线程导致雪崩 |
| **Nginx** | **事件驱动 + 异步非阻塞 + 多进程** | 少量 worker 进程复用事件，单机轻松扛数万并发 |

Nginx 的核心思路是：**不靠「人多」扛并发，靠「一个人同时盯着很多事」扛并发**。一个 worker 进程在用户态用一个「事件循环」同时监听成千上万个连接，哪个连接有数据了才处理哪个，没有数据就让它挂在那儿，不阻塞、不占线程。

```
传统阻塞模型：每个连接一个线程，连接在等数据时线程只能干等着（阻塞）
  连接1 ──> 线程1 (阻塞等待中……)
  连接2 ──> 线程2 (阻塞等待中……)
  连接3 ──> 线程3 (阻塞等待中……)
  ...一万个连接 = 一万个线程 = 内存爆炸

Nginx 事件模型：一个 worker 用事件循环同时看管所有连接
  连接1 ─┐
  连接2 ─┼─> worker 进程（epoll 事件循环）──> 只有「有事件」的连接才被处理
  连接3 ─┘      ↑ 谁有数据谁处理，没数据就挂着，不阻塞不占线程
  连接N ───────┘
```

这一设计让 Nginx 从诞生起就自带「高性能」基因，这也是后面所有原理篇内容的起点。

### 二、Nginx 是什么 + 核心特性

**定义**：Nginx（engine x）是一个开源的、高性能的 HTTP 和反向代理服务器，也可以作为邮件代理服务器和通用的 TCP/UDP 反向代理服务器。

它最常见的三个身份：

| 身份 | 作用 | 典型场景 |
| --- | --- | --- |
| **静态 Web 服务器** | 直接返回 HTML/JS/CSS/图片等静态文件 | 前端静态资源托管、CDN 源站 |
| **反向代理服务器** | 客户端 → Nginx → 后端应用（Tomcat/Node/Go），隐藏后端 | 微服务统一入口 |
| **负载均衡器** | 把请求按策略分发到多台后端 | 多实例集群扩容 |

**核心特性**（面试常考的「为什么选 Nginx」）：

1. **高并发**：基于事件驱动 + 异步非阻塞，单机可支撑数万乃至十万级并发连接。
2. **低内存占用**：少量 worker 进程，每个 worker 内存开销小；对比 Apache prefork 每连接一线程。
3. **高可用 / 热部署**：支持 `nginx -s reload` 平滑重载配置、不停机升级。
4. **可扩展**：模块化架构，官方 + 第三方模块丰富（如 `ngx_http_lua_module` 可内嵌 Lua）。
5. **功能全面**：反向代理、负载均衡、动静分离、限流、缓存、HTTPS、gzip 压缩一应俱全。
6. **跨平台**：Linux / macOS / Windows 均可运行，生产环境以 Linux 为主。

### 三、正向代理 vs 反向代理

这是整个 Nginx 认知的地基，也是面试第一高频题。关键看**代理「站在谁的立场上」**。

| 维度 | 正向代理（Forward Proxy） | 反向代理（Reverse Proxy） |
| --- | --- | --- |
| 代理对象 | 代理**客户端** | 代理**服务器** |
| 站在谁的角度 | 客户端（用户） | 服务端（企业） |
| 谁发起 | 客户端主动配置代理地址 | 客户端无感知，服务端部署 |
| 客户端知道目标吗 | 知道要访问的目标（如 google.com） | 只知道自己访问了 Nginx，不知道背后是谁 |
| 典型场景 | 科学上网、公司内网访问外网、爬虫换 IP | 负载均衡、隐藏后端 IP、统一 SSL、灰度发布 |
| 隐藏的是 | 客户端真实身份 | 后端真实地址和数量 |

用图理解「正向代理是『我替你找别人』，反向代理是『别人来找我，我再分给后面的兄弟』」：

```
【正向代理】客户端知道目标，但自己够不着，找代理帮忙
  客户端 ──请求"我要访问 google.com"──> 正向代理 ──> google.com
   (身份被隐藏)                          (真正发起请求)

【反向代理】客户端只知道入口，背后有多少台、在哪里都不关心
  客户端 ──请求"www.test.com"──> Nginx(反向代理) ──> 后端 10.0.0.1
                                                     └─> 后端 10.0.0.2
  (只知道 Nginx 一个入口)                 (后端地址和数量被隐藏)
```

**小结**：两者本质都是「代理」，区别在于**代理的方向和立场**——正向代理替客户端找服务端，反向代理替服务端挡在客户端前面。Nginx 最常用的是**反向代理**。

### 四、安装与目录结构

#### 4.1 Linux 安装（以 CentOS / Ubuntu 为例）

```bash
# CentOS / RHEL
yum install -y epel-release
yum install -y nginx

# Ubuntu / Debian
apt update
apt install -y nginx

# 源码编译安装（需要自定义模块或特定版本时用，生产一般不这么干）
# ./configure --prefix=/usr/local/nginx --with-http_ssl_module --with-http_gzip_static_module
# make && make install
```

#### 4.2 安装后的目录结构（面试会问「配置文件在哪」）

| 目录/文件 | 作用 |
| --- | --- |
| `/etc/nginx/nginx.conf` | 主配置文件（源码编译则在 `/usr/local/nginx/conf/`） |
| `/etc/nginx/conf.d/*.conf` | 子配置目录，主配置里 `include` 引入，按 server 拆分 |
| `/usr/share/nginx/html/` | 默认静态资源目录 |
| `/var/log/nginx/` | 访问日志 `access.log`、错误日志 `error.log` |
| `/usr/sbin/nginx` | 可执行文件（命令本体） |
| `/var/run/nginx.pid` | 记录 master 进程 PID 的文件 |

> 面试小点：nginx.conf 里 `pid`、`error_log`、`include conf.d/*.conf` 这些指令都指向这些默认路径，改目录时要成对改。

### 五、常用命令（成体系 + 使用场景）

| 命令 | 作用 | 使用场景 |
| --- | --- | --- |
| `nginx` | 启动服务（读默认配置） | 首次启动 |
| `nginx -c /path/nginx.conf` | 用指定配置文件启动 | 多套配置、测试环境 |
| `nginx -t` | 检查配置语法是否正确 | **改完配置必先跑**，避免 reload 失败 |
| `nginx -t -c /path/nginx.conf` | 检查指定配置文件 | 指定配置 + 语法校验 |
| `nginx -s stop` | 立即停止（强杀） | 紧急停机，会中断正在处理的请求 |
| `nginx -s quit` | 优雅停止（处理完当前请求再退） | 计划内停机、发版前 |
| `nginx -s reload` | 平滑重载配置（不停机） | **最常用**，改配置后热加载 |
| `nginx -s reopen` | 重新打开日志文件 | 日志切割后让 Nginx 写新文件 |
| `nginx -V` | 查看版本 + 编译参数 + 已加载模块 | 排查「某模块到底装没装」 |
| `nginx -s version` / `-v` | 查看版本号 | 确认版本 |
| `kill -HUP <master pid>` | 等价于 reload 的底层信号 | 脚本化管理 |

```bash
# 标准「改配置 → 校验 → 热加载」三段式（生产铁律）
vim /etc/nginx/nginx.conf
nginx -t           # 先校验，语法错了会报错并提示行号
nginx -s reload    # 校验通过再热加载，全程不中断服务

# 查看编译了哪些模块（排查 stream、ssl 等能力是否支持）
nginx -V
```

### 六、核心配置结构（Nginx 配置的地图）

Nginx 配置文件是一个「层层嵌套的块结构」，面试常问「某个指令写在哪一层」。层级从外到内是：

```
main(全局块)
 ├── events        # 网络连接相关
 ├── http          # 所有 HTTP 相关配置
 │    ├── server   # 虚拟主机（一个域名/端口一个 server）
 │    │    ├── location   # 路由匹配（处理一类 URI）
 │    │    └── location
 │    └── server
 └── stream        # 四层(TCP/UDP)代理，与 http 平级
```

| 层级 | 指令示例 | 作用 |
| --- | --- | --- |
| **main 全局块** | `worker_processes`、`user`、`error_log`、`pid` | 影响整体运行，与用户权限、进程数、日志有关 |
| **events** | `worker_connections`、`use epoll` | 网络连接模型、单个 worker 的最大连接数 |
| **http** | `upstream`、`include`、`gzip`、`sendfile` | 所有 http 相关配置的总容器 |
| **server** | `listen`、`server_name`、`root` | 虚拟主机：一个域名/端口一个 server |
| **location** | `proxy_pass`、`root`、`index` | 按 URI 匹配规则处理请求，最灵活的一层 |

完整可运行示例（每一行注释「为什么」）：

```nginx
# ===== main 全局块：影响整体 =====
user  nginx;                     # 用 nginx 用户运行 worker，不用 root 更安全
worker_processes  auto;          # worker 进程数，auto=自动按 CPU 核数，多核充分利用
error_log  /var/log/nginx/error.log warn;   # 错误日志级别：debug/info/notice/warn/error
pid        /var/run/nginx.pid;   # master 进程 PID 文件位置，nginx -s 靠它发信号

# ===== events 块：网络连接 =====
events {
    use epoll;                   # Linux 下用 epoll 多路复用（高性能的关键）
    worker_connections  1024;    # 每个 worker 最多同时维护 1024 个连接
}

# ===== http 块：HTTP 服务总容器 =====
http {
    include       /etc/nginx/mime.types;   # 引入 MIME 类型表，让浏览器识别文件类型
    default_type  application/octet-stream; # 未知类型按二进制流处理（触发下载）

    sendfile       on;           # 高效传输文件：内核态直接拷贝，减少用户态中转
    keepalive_timeout  65;       # 客户端长连接保持时间，减少 TCP 三次握手

    gzip  on;                    # 开启 gzip 压缩，减小响应体积

    upstream backend {           # 定义后端服务器组（负载均衡目标）
        server 10.0.0.1:8080 weight=3;   # weight=3：这台机器权重高，多分流量
        server 10.0.0.2:8080 weight=1;
    }

    include /etc/nginx/conf.d/*.conf;   # 引入子配置，按域名拆成多个文件

    server {                     # 虚拟主机
        listen       80;         # 监听 80 端口
        server_name  www.test.com;  # 这个 server 匹配的域名

        location / {             # 匹配所有以 / 开头的请求
            proxy_pass http://backend;   # 反向代理转发到 backend 组
        }
    }
}
```

**小结**：配置的核心逻辑是「**块决定作用范围，location 决定怎么处理**」。记住这条链：`全局 → events → http → server → location`，越往里越具体、越高的优先级。

### 七、location 匹配规则（面试必考，优先级必须背下来）

`location` 是 Nginx 里最灵活也最容易配错的指令。它的匹配有一套完整优先级，先记结论：

**优先级从高到低：`=`（精确）> `^~`（前缀且不再看正则）> `~` / `~*`（正则）> 无符号（普通前缀，最长匹配）**

| 符号 | 含义 | 优先级 | 说明 |
| --- | --- | --- | --- |
| `=` | 精确匹配 | 最高 | URI 完全相等才命中，命中立即返回 |
| `^~` | 前缀匹配 | 次高 | 前缀命中后**不再匹配正则**，直接采用 |
| `~` | 正则匹配（区分大小写） | 中 | 按**配置文件书写顺序**依次匹配，先命中先用 |
| `~*` | 正则匹配（不区分大小写） | 中 | 同上，忽略大小写 |
| （无符号） | 普通前缀匹配 | 低 | 取**最长前缀**，若无正则命中才用它 |

**完整匹配流程**（把它当算法背下来）：

```
1. 遍历所有「前缀 location」，记下最长的那个前缀匹配项
2. 如果存在 = 精确匹配 → 立即用它，结束
3. 如果最长前缀匹配项带 ^~ → 用它，跳过所有正则，结束
4. 按书写顺序遍历所有正则 location（~ / ~*）：
      第一个匹配到的正则 → 用它，结束
5. 没有任何正则匹配 → 退回第 1 步记下的最长前缀匹配项
```

示例（建议跑一遍验证）：

```nginx
server {
    listen 80;
    server_name test.com;

    location = / {              # 只有精确 / 命中，其他都不走这里
        return 200 '精确匹配 /';
    }
    location ^~ /static/ {      # /static/ 开头，命中后不看正则
        root /data;             # 实际文件 /data/static/xxx
    }
    location ~ \.(jpg|png|gif)$ {   # 正则：图片后缀，区分大小写
        root /data/images;
    }
    location ~* \.(jpg|png|gif)$ {  # 正则：图片后缀，不区分大小写
        root /data/images_lower;
    }
    location / {                # 兜底：所有请求
        proxy_pass http://backend;
    }
}
```

几个容易踩的坑：

- **正则和 `^~` 同时存在**：`^~` 命中就「挡住」正则，很多人以为「正则一定比前缀优先」是错的。
- **正则之间的顺序**：多个正则都满足时，**不是最长匹配，而是最先写的那个**胜出。
- **`=` 和普通前缀**：`location = /` 和 `location /` 是不同的，前者只匹配根路径。

### 八、server_name 匹配（虚拟主机怎么选）

一个 Nginx 上跑多个域名，靠 `server_name` 区分请求该进哪个 server。匹配顺序：

```
1. 精确字符串匹配（如 server_name www.test.com）
2. 前面的通配符 *.test.com（匹配 www.test.com、a.test.com）
3. 后面的通配符 www.test.*（匹配 www.test.com、www.test.cn）
4. 正则匹配 ~^www\.\d+\.test\.com$
5. 都没匹配 → 用 listen 端口对应的「默认 server」（第一个定义的，或 default_server）
```

```nginx
server {
    listen 80 default_server;    # 明确指定为默认 server，兜底
    server_name _;               # _ 表示不关心域名，全收
    return 444;                  # 444 = 直接关闭连接，不回内容（防恶意域名解析）
}

server {
    listen 80;
    server_name www.test.com test.com;   # 一个 server 可配多个域名
    location / { ... }
}
```

### 九、静态资源服务器（root vs alias，必考的坑）

Nginx 作为静态服务器，核心是 `root` 和 `alias` 两个指令，它们拼路径的方式不同：

| 指令 | 拼路径规则 | 示例 |
| --- | --- | --- |
| `root` | 文件路径 = `root 路径 + 完整 URI` | `location /static/ { root /data; }` → `/static/a.png` 读 `/data/static/a.png` |
| `alias` | 文件路径 = `alias 路径 + (去掉 location 前缀后的 URI)` | `location /static/ { alias /data/images/; }` → `/static/a.png` 读 `/data/images/a.png` |

```nginx
# root：会带上 location 前缀 /static/
location /static/ {
    root /data;        # /static/a.png → /data/static/a.png
}

# alias：会丢掉 location 前缀 /static/，用 alias 路径替换
location /static/ {
    alias /data/images/;   # /static/a.png → /data/images/a.png
}

# 其他常用项
location / {
    root   /usr/share/nginx/html;   # 根目录
    index  index.html index.htm;    # 默认首页，按顺序找
    autoindex on;                   # 目录浏览（列表展示），生产一般关
}
```

> 面试小点：`alias` 末尾通常要带 `/`，否则拼接会出错（`/static/a.png` 会变成 `/data/imagesa.png`）。

::: tip 💡 面试题：root 和 alias 的区别？
`root` 会把 location 匹配到的前缀**拼进**文件路径里（`root路径 + 完整URI`），而 `alias` 是**替换**掉 location 前缀（`alias路径 + 去掉前缀后的URI`）。所以做「换个目录名映射」时用 `alias`，否则路径会多一段或对不上。
:::

## 高级篇

### 一、反向代理配置（proxy_pass 是核心中的核心）

反向代理是 Nginx 出场率最高的能力。核心指令是 `proxy_pass`，以及一堆 `proxy_*` 透传头。

#### 1.1 proxy_pass 带不带 URI 的区别（面试高频，必须吃透）

`proxy_pass` 后面的 URL 末尾**带不带 `/`（或路径）**，直接决定转发后的 URI 怎么拼：

| 写法 | 转发规则 | 示例（location /api/） |
| --- | --- | --- |
| `proxy_pass http://backend;` | 不带 URI：**原样透传完整 URI** | `/api/user` → `http://backend/api/user` |
| `proxy_pass http://backend/;` | 带 `/`：**用 `/` 替换 location 前缀** | `/api/user` → `http://backend/user` |
| `proxy_pass http://backend/v1;` | 带路径：**用路径替换 location 前缀** | `/api/user` → `http://backend/v1/user` |

```nginx
# 场景 A：后端接口路径和前端一致，原样透传（最常用，最不容易出错）
location /api/ {
    proxy_pass http://backend;    # /api/user/list → http://backend/api/user/list
}

# 场景 B：后端不想要 /api 前缀，剥掉它
location /api/ {
    proxy_pass http://backend/;   # /api/user/list → http://backend/user/list
}

# 场景 C：换成别的路径前缀（注意末尾斜杠！）
location /api/ {
    proxy_pass http://backend/v2/; # /api/user/list → http://backend/v2/user/list
}
```

> 特别提醒：`proxy_pass http://backend/v2;`（末尾无 `/`）会把 location 前缀 `/api/` 替换成 `/v2`，结果是 `/v2user/list`，**少了斜杠**，这是经典的「路径拼错」坑。写带路径的 proxy_pass 时，末尾该不该加 `/` 要默念一遍拼接规则。

#### 1.2 透传真实客户端信息（解决「后端拿到的是 Nginx 的 IP」）

Nginx 反代后，后端看到的来源 IP 默认是 Nginx 的 IP，要透传真实信息必须手动加头：

| 指令 | 作用 | 说明 |
| --- | --- | --- |
| `proxy_set_header Host $host` | 透传原始 Host 域名 | 否则后端拿到的是 `backend` 这个 upstream 名 |
| `proxy_set_header X-Real-IP $remote_addr` | 传客户端真实 IP | `$remote_addr` 是直连 Nginx 的那一方 IP |
| `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` | 追加真实 IP 链 | 多级代理时保留完整链路 |
| `proxy_set_header X-Forwarded-Proto $scheme` | 传原始协议 http/https | 后端据此生成正确跳转链接 |
| `proxy_set_header Connection ""` | 清掉 Connection 头 | 配合 keepalive 复用后端连接 |

```nginx
location / {
    proxy_pass http://backend;
    proxy_set_header Host $host;                                    # 透传域名
    proxy_set_header X-Real-IP $remote_addr;                        # 单级代理拿 IP
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;    # 多级代理的完整链路
    proxy_set_header X-Forwarded-Proto $scheme;                     # http 还是 https
    proxy_connect_timeout 5s;      # 连接后端超时
    proxy_send_timeout 60s;        # 向后端发送数据超时
    proxy_read_timeout 60s;        # 从后端读响应超时
}
```

`X-Forwarded-For` 在多级代理下的链路：

```
客户端(1.2.3.4) → Nginx1(10.0.0.1) → Nginx2(10.0.0.2) → 后端
  XFF: 1.2.3.4                       XFF: 1.2.3.4, 10.0.0.1
  $proxy_add_x_forwarded_for = 已有的 XFF + 直连方 IP，所以会不断往后追加
```

::: tip 💡 面试题：后端拿到的 IP 是 Nginx 的怎么办？
因为 Nginx 反向代理后，后端 `getRemoteAddr()` 拿到的是 TCP 直连方 Nginx 的 IP。解决：Nginx 侧用 `proxy_set_header X-Real-IP $remote_addr` 和 `X-Forwarded-For $proxy_add_x_forwarded_for` 把真实 IP 透传，后端再在框架层（如 Spring 的 `RequestHeaderFilter` / 网关）解析这两个头。多级代理时注意只信任「最近一跳」的 XFF，否则可被伪造。
:::

### 二、负载均衡策略（成体系 + 每种都要会写）

Nginx 的负载均衡本质是：把请求按一定策略从 `upstream` 组里挑一台后端分发。策略有六大类：

| 策略 | 指令 | 特点 | 适用场景 |
| --- | --- | --- | --- |
| 轮询（默认） | 不写任何策略 | 依次轮流分发 | 后端机器性能一致 |
| 加权轮询 | `weight` | 按权重比例分发，权重高多分 | 机器性能不均 |
| IP 哈希 | `ip_hash` | 同 IP 固定打同一台 | 需要 session 粘滞 |
| 最少连接 | `least_conn` | 分给活跃连接最少的机器 | 请求耗时差异大 |
| 通用哈希 | `hash key consistent` | 按任意 key 哈希 | 需要自定义粘滞规则 |
| 随机 | `random [two]` | 随机/两次随机选最轻 | 简单压测、均衡度要求不高 |

#### 2.1 轮询 + 加权轮询

```nginx
upstream backend {
    # 默认轮询：一台一台依次分发
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
    server 10.0.0.3:8080;
}
```

```nginx
upstream backend {
    # 加权轮询：weight 默认 1，比例 3:2:1，性能好的机器多分流量
    server 10.0.0.1:8080 weight=3;   # 这台 4 核 8G，多扛
    server 10.0.0.2:8080 weight=2;
    server 10.0.0.3:8080 weight=1;   # 这台配置差，少分
}
```

#### 2.2 IP 哈希（session 粘滞）

```nginx
upstream backend {
    ip_hash;                          # 同一客户端 IP 永远打到同一台
    server 10.0.0.1:8080;
    server 10.0.0.2:8080;
}
```

> 注意：`ip_hash` 里一般不要再配 `weight`（会影响哈希结果的稳定性），且增删后端机器会导致一部分请求「漂移」到别的机器，session 会失效。

#### 2.3 最少连接 + 通用哈希

```nginx
upstream backend {
    least_conn;                       # 分给当前活跃连接数最少的机器
    server 10.0.0.1:8080 weight=2;    # 可结合 weight，按 weight 加权计算
    server 10.0.0.2:8080;
}
```

```nginx
upstream backend {
    hash $request_uri consistent;     # 按 URI 哈希（一致性哈希），同一 URL 固定一台
    server 10.0.0.1:8080;            # 适合缓存命中类场景：同一资源总在固定机器
    server 10.0.0.2:8080;
}
```

#### 2.4 后端状态参数（健康管理）

`server` 指令后还能带一堆状态参数，用来做**故障摘除**：

| 参数 | 作用 |
| --- | --- |
| `down` | 标记机器下线，不参与分发 |
| `backup` | 备份机，只有主机器全挂时才用 |
| `max_fails` | 允许失败次数（默认 1） |
| `fail_timeout` | 失败超时时间，超时后重试 |
| `max_conns` | 限制这台机器的最大连接数 |

```nginx
upstream backend {
    server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;  # 30 秒内失败 3 次就摘除
    server 10.0.0.2:8080 backup;                        # 备胎，主挂了顶上
    server 10.0.0.3:8080 down;                          # 临时下线，维护中
}
```

> 这是 Nginx **被动健康检查**（发请求发现失败才摘除）。Nginx 开源版没有主动探活，商业版 Nginx Plus 才有主动健康检查；开源要主动探活常用 `ngx_http_upstream_check_module`（Tengine/OpenResty）。

### 三、动静分离

「动静分离」是面试和生产的常见优化：**静态资源（HTML/JS/CSS/图片）由 Nginx 直接返回，动态请求（接口）转发给应用服务器**。目的：让 Nginx 扛它最擅长的静态文件，把 Tomcat 等应用服务器从静态 IO 里解放出来。

```nginx
server {
    listen 80;
    server_name www.test.com;

    # 动态请求：转发给后端应用
    location / {
        proxy_pass http://backend;      # 接口走 Tomcat
    }

    # 静态资源：Nginx 直接返回，并加缓存
    location ~* \.(html|css|js|jpg|jpeg|png|gif|ico|woff|woff2)$ {
        root /usr/share/nginx/html;     # 静态文件目录
        expires 7d;                     # 7 天缓存，浏览器本地缓存
        add_header Cache-Control "public, max-age=604800";  # 等价缓存头
    }
}
```

**为什么动静分离能提速**：
1. 静态文件直接由 Nginx 返回，省去「Nginx → 应用 → Nginx」的两跳和应用的 IO 处理。
2. `expires` 让浏览器缓存静态资源，二次访问不再发请求。
3. Nginx 处理静态文件的 `sendfile` + 零拷贝能力远强于应用服务器。

### 四、gzip 压缩

开启 gzip 后，Nginx 在返回响应前压缩文本类内容，体积可缩到原来的 20%~40%，显著减少传输时间（代价是消耗一点 CPU）。

```nginx
http {
    gzip on;                         # 开启压缩
    gzip_min_length 1k;              # 小于 1k 不压缩（压了反而开销大）
    gzip_comp_level 6;               # 压缩级别 1~9，6 是性价比平衡点
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml image/svg+xml;   # 只压这些文本类型
    gzip_vary on;                    # 加 Vary: Accept-Encoding，配合 CDN 缓存
    gzip_static on;                  # 优先用预先压好的 .gz 文件（需编译 --with-http_gzip_static_module）
}
```

| 指令 | 说明 |
| --- | --- |
| `gzip on` | 总开关 |
| `gzip_min_length` | 小于该字节数不压缩，避免小文件越压越大 |
| `gzip_comp_level` | 压缩级别，越高越省流量但越耗 CPU |
| `gzip_types` | 指定压缩的 MIME 类型，**图片/视频已压缩不用再压** |
| `gzip_vary on` | 加 `Vary: Accept-Encoding` 头，让缓存/CDN 区分压缩版本 |

### 五、HTTPS / SSL 配置

```nginx
server {
    listen 443 ssl http2;            # http2 需 Nginx 1.9.5+，提升加载性能
    server_name www.test.com;

    ssl_certificate     /etc/nginx/cert/fullchain.pem;   # 证书（含证书链）
    ssl_certificate_key /etc/nginx/cert/privkey.pem;     # 私钥
    ssl_protocols       TLSv1.2 TLSv1.3;                 # 只开安全的协议版本
    ssl_ciphers         HIGH:!aNULL:!MD5;                # 只允许高强度加密套件
    ssl_session_cache   shared:SSL:10m;                  # 会话缓存，加速 TLS 握手
    ssl_session_timeout 10m;

    location / {
        proxy_pass http://backend;
    }
}

# HTTP 自动跳转 HTTPS（最常见做法）
server {
    listen 80;
    server_name www.test.com;
    return 301 https://$host$request_uri;   # 301 永久重定向到 https
}
```

### 六、限流（Nginx 的三种限流武器）

限流是保护后端不被突发流量打垮的手段，Nginx 有三种：

| 限流方式 | 指令 | 维度 | 算法 |
| --- | --- | --- | --- |
| 请求速率限流 | `limit_req` | 每秒请求数（QPS） | 漏桶算法 |
| 并发连接限流 | `limit_conn` | 同时连接数 | 计数 |
| 下载带宽限流 | `limit_rate` | 每秒字节数 | 速率 |

#### 6.1 请求速率限流（limit_req，漏桶算法）

```nginx
# 定义限流规则：按客户端 IP 区分，共享内存 10M，每秒 10 个请求
limit_req_zone $binary_remote_addr zone=mylimit:10m rate=10r/s;

server {
    location /login/ {
        # 应用限流：burst=20 允许 20 个突发排队，nodelay 让突发不等待直接处理
        limit_req zone=mylimit burst=20 nodelay;
        proxy_pass http://backend;
    }
}
```

| 参数 | 说明 |
| --- | --- |
| `rate=10r/s` | 平均每秒 10 个请求，多余的超时返回 503 |
| `burst=20` | 允许瞬时 20 个突发请求排队（漏桶的「桶容量」） |
| `nodelay` | 突发请求不排队等待，立即处理（否则按 rate 慢慢放行） |

#### 6.2 并发连接限流 + 带宽限流

```nginx
limit_conn_zone $binary_remote_addr zone=addr:10m;

server {
    location /download/ {
        limit_conn addr 5;        # 同一 IP 最多 5 个并发连接
        limit_rate 100k;          # 每个连接限速 100KB/s（下载限速）
        proxy_pass http://backend;
    }
}
```

### 七、跨域 CORS

前后端分离时，浏览器会因「同源策略」拦截跨域请求，由 Nginx 统一加 CORS 头即可解决：

```nginx
location /api/ {
    add_header Access-Control-Allow-Origin $http_origin;        # 允许的来源（或 *）
    add_header Access-Control-Allow-Methods 'GET,POST,PUT,DELETE,OPTIONS';
    add_header Access-Control-Allow-Headers 'Content-Type,Authorization,token';
    add_header Access-Control-Allow-Credentials true;           # 允许携带 Cookie

    if ($request_method = OPTIONS) {
        return 204;    # 预检请求直接返回，不转后端
    }

    proxy_pass http://backend;
}
```

> 注意：`Access-Control-Allow-Origin` 配成 `*` 时不能同时配 `Access-Control-Allow-Credentials true`，浏览器会拒绝；带 Cookie 场景必须指定具体域名并加 `Vary: Origin`。

### 八、rewrite / return / 重定向

| 指令 | 作用 | 区别 |
| --- | --- | --- |
| `return` | 直接返回状态码/内容/跳转，**停止后续处理** | 更高效，优先用 |
| `rewrite` | URL 重写（内部跳转或 302/301 跳转） | 语法复杂，需配合正则 |
| `try_files` | 依次尝试文件是否存在 | 常用于前端 SPA 路由回退 |

```nginx
# 老域名 301 永久跳转新域名
server {
    listen 80;
    server_name old.test.com;
    return 301 http://www.test.com$request_uri;
}

# URL 重写：/user/123 → /user?id=123
location /user/ {
    rewrite ^/user/(\d+)$ /user?id=$1 last;   # last=重写后重新走 location 匹配
}

# SPA 前端路由回退：文件不存在都回退到 index.html（Vue/React 必备）
location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
}
```

`rewrite` 的 `last` / `break` / `redirect` / `permanent` 标志：

| 标志 | 含义 |
| --- | --- |
| `last` | 重写后**重新匹配 location**（像内部新请求） |
| `break` | 重写后**停止**，不再匹配其他 location，直接处理 |
| `redirect` | 302 临时跳转（浏览器地址栏变化） |
| `permanent` | 301 永久跳转（浏览器地址栏变化） |

### 九、缓存（proxy_cache，Nginx 做缓存中间层）

Nginx 可以对后端的响应做缓存，下次相同请求直接返回缓存，大幅减轻后端压力。

```nginx
http {
    # 定义缓存区：keys_zone 名称为 cache_one，共享内存 10M，磁盘最多 1G，1 天不用淘汰
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=cache_one:10m max_size=1g inactive=1d;

    server {
        location /api/ {
            proxy_cache cache_one;                       # 启用缓存
            proxy_cache_key $host$request_uri;           # 缓存键：域名+URI
            proxy_cache_valid 200 304 12h;               # 200/304 响应缓存 12 小时
            proxy_cache_valid 301 302 1h;
            proxy_cache_valid any 1m;                    # 其他状态缓存 1 分钟
            proxy_cache_bypass $arg_nocache;             # 带 ?nocache=1 时绕过缓存
            add_header X-Cache $upstream_cache_status;   # 响应头标注 HIT/MISS
            proxy_pass http://backend;
        }
    }
}
```

### 十、日志配置

```nginx
http {
    # 定义日志格式（main 为格式名）
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" $upstream_addr $upstream_response_time';

    access_log /var/log/nginx/access.log main;   # 访问日志 + 格式
    error_log  /var/log/nginx/error.log warn;    # 错误日志 + 级别
}
```

常用日志变量：

| 变量 | 含义 |
| --- | --- |
| `$remote_addr` | 客户端 IP |
| `$request` | 完整请求行（方法 + URI + 协议） |
| `$status` | 响应状态码 |
| `$body_bytes_sent` | 响应体大小 |
| `$http_user_agent` | 客户端 UA |
| `$upstream_addr` | 实际转发的后端地址（排查负载均衡很有用） |
| `$upstream_response_time` | 后端响应耗时 |

### 十一、四层反向代理（stream 模块，负载均衡 MySQL/Redis）

前面的负载均衡都是「七层 HTTP」。Nginx 也能做「四层 TCP/UDP」代理，用来负载均衡数据库、消息队列等非 HTTP 服务：

```nginx
stream {
    upstream mysql_backend {
        server 10.0.0.1:3306;
        server 10.0.0.2:3306;
    }

    server {
        listen 3306;                      # 对外监听 3306
        proxy_pass mysql_backend;         # 四层转发，不做 HTTP 解析
        proxy_connect_timeout 5s;
    }
}
```

| 对比 | 七层负载均衡（http） | 四层负载均衡（stream） |
| --- | --- | --- |
| 工作层 | 应用层（能看懂 HTTP 内容） | 传输层（只看 IP + 端口） |
| 能力 | 可按 URL/Header 路由、加头、缓存 | 只能按 IP:端口转发 |
| 性能 | 略低（要解析 HTTP） | 更高（纯转发） |
| 场景 | HTTP 接口、按路径分流 | MySQL、Redis、TCP 服务 |

## 原理篇

### 一、Master-Worker 多进程模型（Nginx 架构的骨架）

Nginx 不是单进程，也不是「每连接一线程」，而是一个 **master 进程 + 多个 worker 进程** 的多进程模型。

```
                        ┌─────────────────────────────┐
                        │        master 进程           │
                        │  - 读配置、绑定端口、管理 worker │
                        │  - 接收信号（reload/stop）     │
                        └──────────────┬──────────────┘
                                       │ fork 出多个子进程
              ┌────────────────┬───────┴───────┬────────────────┐
              ▼                ▼               ▼                ▼
        ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
        │ worker 1 │     │ worker 2 │     │ worker 3 │     │ worker 4 │
        │ 事件循环  │     │ 事件循环  │     │ 事件循环  │     │ 事件循环  │
        └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
             │                │                │                │
             └────────────────┴────────────────┴────────────────┘
                             共同监听 80 端口（通过共享 listen socket / reuseport）
                             真正处理请求、解析 HTTP、转发、返回响应
```

| 进程 | 职责 | 特点 |
| --- | --- | --- |
| **master** | 读取并校验配置、绑定端口、创建/管理 worker、处理信号 | 不处理业务请求，一个 Nginx 只有一个 master |
| **worker** | 真正处理请求：接受连接、解析 HTTP、代理、返回响应 | 数量通常 = CPU 核数（`worker_processes auto`），每个 worker **单线程**、**互相独立** |

**为什么 worker 数 = CPU 核数**：每个 worker 是一个独立进程、内部单线程跑事件循环，把它「钉」在一个 CPU 核上能避免线程切换开销；多于核数反而会增加进程切换成本。

**好处**：
1. **隔离性好**：一个 worker 崩溃不影响其他 worker，master 能把它重新拉起（高可用）。
2. **加锁少**：worker 之间共享内存少，锁竞争低。
3. **热部署**：reload 时 master 拉起新 worker、优雅退掉旧 worker，全程不停机。

### 二、事件驱动 + 异步非阻塞（Nginx 高性能的真正内核）

这是面试问「Nginx 为什么快」时的标准答案，也是理解 Nginx 的钥匙。

#### 2.1 先理解两种 IO 模型

**同步阻塞 IO（BIO，传统模型）**：一个连接一个线程，线程调用 `read()` 后「卡死」在那等数据，数据没来线程也不能干别的。

```
线程：read(连接1) → [阻塞等待数据...数据来了] → 处理 → read(连接1) → [继续阻塞等待]
                 ↑ 这段时间线程啥也干不了，白白占用
```

**异步非阻塞 + IO 多路复用（Nginx 模型）**：worker 把所有连接的 socket 设成「非阻塞」，然后用 `epoll` 一次性监听所有连接；哪个连接有数据到达，`epoll` 就返回哪个，worker 只处理「就绪」的连接。

```
worker 单线程事件循环：
  ┌─────────────────────────────────────────────┐
  │  1. epoll_wait(监听的 N 个连接)               │
  │  2. epoll 返回「有事件」的连接集合            │
  │  3. 逐个处理这些连接（读请求/转发/写响应）      │
  │  4. 回到第 1 步，继续 epoll_wait              │
  └─────────────────────────────────────────────┘
  关键：没数据的连接「挂在 epoll 里」，不占线程、不阻塞，只有「就绪」才被处理
```

#### 2.2 多路复用技术的演进

| 技术 | 复杂度 | 说明 |
| --- | --- | --- |
| `select` | O(n) | 每次都要遍历所有 fd，有 1024 上限 |
| `poll` | O(n) | 无 fd 上限，但仍需遍历 |
| `epoll` | O(1) | Linux 内核事件通知，只返回就绪的 fd，**Nginx 首选** |
| `kqueue` | O(1) | macOS/BSD 的 epoll 等价物 |

`events` 块里的 `use epoll;` 就是指定用 epoll 这个最高效的多路复用实现。

#### 2.3 完整对比：Nginx vs Apache

| 维度 | Nginx | Apache（prefork/worker） |
| --- | --- | --- |
| 并发模型 | 少量 worker，每个单线程事件驱动 | 每连接一个进程/线程 |
| 1 万并发 | 少量 worker 轻松扛住 | 1 万个线程，内存爆炸 |
| 内存 | 占用小且稳定 | 随连接数线性增长 |
| 长连接/慢请求 | 不受影响（非阻塞） | 慢请求占满线程 |
| 动态处理 | 本身不跑业务，转给后端 | 可用模块跑 PHP 等 |

> 一句话总结：**Nginx 用「少量的进程 + 事件驱动」替代了「海量的线程 + 阻塞等待」**，所以并发高、内存省。

::: tip 💡 面试题：Nginx 为什么能扛高并发（C10K）？
因为 Nginx 采用 **master-worker 多进程 + 每个 worker 单线程事件驱动（epoll 异步非阻塞）** 的模型。一个 worker 用一个事件循环同时监听成千上万个连接，只有「就绪」的连接才被处理，没数据的连接挂在 epoll 里不占线程不阻塞；而传统模型是「一连接一线程」，1 万并发就要 1 万线程，内存和上下文切换直接崩掉。这就是它能单机解决 C10K 的根本原因。
:::

### 三、惊群问题与 accept_mutex / reuseport

#### 3.1 什么是惊群

多个 worker 进程共享同一个 listen socket，当一个新的 TCP 连接到来时，内核会「唤醒」所有在等待 `accept()` 的 worker，但最终只有一个 worker 能成功接受这个连接，其他 worker 被唤醒后发现没连接可接、又回去睡觉。这种「一个连接惊动一群 worker」的现象叫 **惊群（thundering herd）**，会造成无谓的 CPU 唤醒开销。

```
新连接到来
    │
    ▼
[唤醒] worker1 ──┐
[唤醒] worker2 ──┤ → 只有一个 accept() 成功，其余白醒一场
[唤醒] worker3 ──┘
```

#### 3.2 两种解决方案

| 方案 | 原理 | 说明 |
| --- | --- | --- |
| `accept_mutex` | 加一把互斥锁，同一时刻只让一个 worker 去 `accept()` | 老版本默认开启 |
| `reuseport` | 每个 worker 各自 bind 独立的 listen socket，内核按四元组哈希分发 | Nginx 1.9.1+ 支持，更优 |

```nginx
# 方案一：accept_mutex（老方式）
events {
    accept_mutex on;   # 串行化 accept，避免惊群
}

# 方案二：reuseport（推荐，Nginx 1.9.1+）
server {
    listen 80 reuseport;   # 每个 worker 一个独立监听 socket，内核负载均衡
}
```

> 现代 Nginx（1.11.3+）在 `reuseport` 开启时会自动关闭 `accept_mutex`，因为 reuseport 已经从内核层面把连接「分发」到各 worker 的独立队列，不存在抢同一把 socket 的惊群问题。

### 四、平滑升级 / reload 机制（热部署原理）

`nginx -s reload` 不停机更新配置，是 Nginx 高可用的重要能力。它靠 **信号 + master 重新 fork worker** 实现，全程不丢连接：

```
nginx -s reload
      │  向 master 发送 HUP 信号（等价 kill -HUP <master pid>）
      ▼
  master 进程
      │
      ├─ 1. 重新读取并校验配置文件（语法错则报错，保持原状不生效）
      ├─ 2. fork 一批「新 worker」，新 worker 用新配置
      ├─ 3. 新 worker 开始 accept 新连接
      ├─ 4. 给「旧 worker」发信号，让它处理完手上的请求后优雅退出
      ▼
  旧 worker 处理完存量连接 → 退出；新 worker 全面接管
  整个过程「新连接进新 worker，老连接在老 worker 上慢慢收尾」，不停机
```

各信号的对应关系（面试会问「这些命令底层发什么信号」）：

| 命令 | 底层信号 | 行为 |
| --- | --- | --- |
| `nginx -s stop` | TERM | 立即强杀，直接退出 |
| `nginx -s quit` | QUIT | 优雅退出，处理完再退 |
| `nginx -s reload` | HUP | 重读配置，热重启 worker |
| `nginx -s reopen` | USR1 | 重新打开日志文件（日志切割用） |

> 为什么 reload 前要先 `nginx -t`：因为 HUP 让 master 重读配置，如果配置有语法错误，reload 会失败、Nginx 保持旧配置运行，服务不受影响但你的修改没生效。

### 五、一次反向代理请求的完整流程（把前面的知识串起来）

把一次「客户端 → Nginx → 后端 → 返回」的请求拆开看，每个环节对应了前面的某个配置点：

```
① 客户端发起请求：GET http://www.test.com/api/user?id=1
      │
      ▼
② Nginx worker 通过 epoll 感知到「这个连接可读」事件
      │
      ▼
③ 匹配 server：根据 Host 头 = www.test.com，选中对应 server 块
      │
      ▼
④ 匹配 location：根据 URI = /api/user，按「= > ^~ > 正则 > 前缀」选中 location /api/
      │
      ▼
⑤ 按 proxy_pass 规则拼出后端地址（http://backend 组，保留 /api/user）
      │
      ▼
⑥ 从 upstream backend 组里按策略（轮询/加权/ip_hash/least_conn）选一台后端
      │
      ▼
⑦ 加上 proxy_set_header 透传头（Host、X-Real-IP、X-Forwarded-For...）
      │
      ▼
⑧ 建立与后端的连接，转发请求，等待后端响应（proxy_read_timeout 控制）
      │
      ▼
⑨ 拿到后端响应，可选做 gzip 压缩、加缓存（proxy_cache）、记录日志
      │
      ▼
⑩ 把响应写回客户端连接，worker 继续回到 epoll 等下一个事件
```

### 六、加权轮询（smooth weighted round-robin）底层算法

`upstream` 默认的加权轮询不是「简单的按比例硬轮」，而是 **平滑加权轮询**，保证权重高的机器「分散地」多拿请求，而不是「连续好几下都打同一台」。核心思想是维护 `current_weight` 变量：

```
对每个 server 维护：
  - weight（配置的权重）
  - effective_weight（动态权重，失败会下调）
  - current_weight（当前权重的累加值，初始 0）

每次选后端时：
  1. 所有 server 的 current_weight += effective_weight
  2. 选出 current_weight 最大的那台 server 作为本次目标
  3. 该 server 的 current_weight -= 所有 server 的 effective_weight 之和

示例：A(weight=4)、B(weight=2)、C(weight=1)，总权重=7
  初始:         A=0  B=0  C=0
  请求1: +权重   A=4  B=2  C=1  → 选 A，A-=7 → A=-3 B=2 C=1
  请求2: +权重   A=1  B=4  C=2  → 选 B，B-=7 → A=1  B=-3 C=2
  请求3: +权重   A=5  B=-1 C=3  → 选 A，A-=7 → A=-2 B=-1 C=3
  请求4: +权重   A=2  B=1  C=4  → 选 C，C-=7 → A=2  B=1  C=-3
  请求5: +权重   A=6  B=3  C=-2 → 选 A，A-=7 → A=-1 B=3  C=-2
  请求6: +权重   A=3  B=5  C=-1 → 选 B，B-=7 → A=3  B=-2 C=-1
  请求7: +权重   A=7  B=0  C=0  → 选 A，A-=7 → A=0  B=0  C=0  （回到原点）

  7 次请求的分配顺序：A B A C A B A → A 拿到 4 次、B 2 次、C 1 次，且 A 分散在中间不连续
```

> 好处：既保证最终比例严格等于权重比，又让高权重机器「均匀穿插」而不是「连续轰炸」，避免某台机器瞬间被连续打满。

### 七、sendfile 与零拷贝（静态文件快的底层原因）

Nginx 返回静态文件时用 `sendfile`，它的核心是**减少数据在内核态和用户态之间的拷贝次数**。

**传统方式（read + write，4 次拷贝 + 2 次内核切换）**：

```
磁盘 → 内核缓冲区 →(拷贝1)→ 用户缓冲区 →(拷贝2)→ socket 内核缓冲区 →(拷贝3)→ 网卡
                ↑ read 切到用户态        ↑ write 再切回内核态
```

**sendfile（2 次拷贝，数据不经过用户态）**：

```
磁盘 → 内核缓冲区 ──(sendfile)──> socket 内核缓冲区 → 网卡
        数据全程在内核态流转，不拷贝到用户态，不来回切换
```

```nginx
http {
    sendfile on;        # 开启零拷贝传输静态文件
    tcp_nopush on;      # 攒够一个包再发，减少网络包数量（配合 sendfile）
    tcp_nodelay on;     # 对 keepalive 连接立即发送小包，降低延迟
}
```

> `sendfile on` 是静态文件吞吐的开关；`tcp_nopush` 优化「大文件」的传输效率，`tcp_nodelay` 优化「小包交互」的响应延迟，两者不冲突、常一起开。

### 八、keepalive 与连接复用

HTTP/1.1 默认支持长连接，`keepalive` 配置的是「客户端到 Nginx」和「Nginx 到后端」两段连接的复用：

```nginx
http {
    # 客户端 → Nginx 的长连接
    keepalive_timeout 65;        # 长连接保持 65 秒
    keepalive_requests 100;      # 一条长连接上最多处理 100 个请求

    # Nginx → 后端 的长连接（复用后端连接，减少握手）
    upstream backend {
        server 10.0.0.1:8080;
        server 10.0.0.2:8080;
        keepalive 32;            # 每个 worker 与后端保持 32 条空闲长连接
    }

    server {
        location / {
            proxy_http_version 1.1;          # 必须 1.1 才能复用后端连接
            proxy_set_header Connection "";  # 清掉 Connection: close，让连接保持
            proxy_pass http://backend;
        }
    }
}
```

> 关键坑：默认 Nginx 用 HTTP/1.0 连后端，会「每次请求新建连接」。要复用后端连接必须 `proxy_http_version 1.1` + `proxy_set_header Connection ""` + upstream `keepalive` 三件套一起配，缺一个都不生效。

### 九、Nginx vs Tomcat vs Gateway（技术选型定位）

这是微服务面试里常被混在一起的三个词，本质是**不同层次**的东西：

| 技术 | 层次 | 定位 | 关系 |
| --- | --- | --- | --- |
| **Nginx** | 反向代理 / 静态服务器 | 流量入口、负载均衡、静态资源、四/七层代理 | 常在最外层 |
| **Gateway** | API 网关 | 业务级路由、鉴权、限流、熔断、协议转换 | 在 Nginx 之后、微服务之前 |
| **Tomcat** | Servlet 容器 | 跑 Java Web 应用，处理业务逻辑 | 是 Nginx/Gateway 的「后端」 |

典型微服务流量链路：

```
客户端 → Nginx(最外层：SSL、静态资源、四/七层负载均衡)
           → Gateway(业务网关：路由、鉴权、限流、熔断)
             → 具体微服务(Tomcat 承载的 Spring Boot 应用)
```

> 所以「Nginx 和 Gateway 谁替代谁」是伪命题：Nginx 偏**流量和网络层**，Gateway 偏**业务和应用层**，通常是 Nginx 在外、Gateway 在内、Tomcat 在最里层。相关：见 [Gateway](/learn_backend/java/微服务/Gateway)。

### 十、性能调优参数速查（生产可直接抄）

```nginx
user  nginx;                      # 非 root 运行，安全
worker_processes  auto;           # 进程数 = CPU 核数
worker_cpu_affinity auto;         # 把 worker 绑定到 CPU 核，减少切换

events {
    use epoll;                    # Linux 首选多路复用
    worker_connections  65535;    # 单 worker 最大连接数（受系统 ulimit -n 限制）
    multi_accept on;              # 一次 accept 多个连接，减少系统调用
}

http {
    sendfile on;                  # 零拷贝
    tcp_nopush on;                # 大文件传输优化
    tcp_nodelay on;               # 小包延迟优化
    keepalive_timeout 65;
    gzip on;                      # 压缩
    server_tokens off;            # 隐藏 Nginx 版本号，安全
    client_max_body_size 50m;     # 上传大小限制，防止大文件打爆
}
```

**关键公式（面试可能问）**：Nginx 最大并发连接数 = `worker_processes × worker_connections`。例如 `worker_processes 4`、`worker_connections 65535`，理论最大 4 × 65535 = 26 万连接（实际受系统文件描述符上限 `ulimit -n` 制约）。
