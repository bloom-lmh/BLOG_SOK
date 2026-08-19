# Day 28 · 反向代理（Nginx 反向代理 + 负载均衡 + HTTPS）

> **今天目标**：给 course-mall 装上生产级统一入口——用 Nginx 反向代理把外部流量转发给网关集群，用 `upstream` 对多个网关实例做负载均衡，并给入口配上 HTTPS。完成后对外只暴露 80/443 两个端口，后端 9000/8080 全部藏起来。

## 一、前置条件

- 已完成 **Day 01**（Maven 多模块骨架，`/api/health` 能通）
- 已完成 **Day 13 + Day 16**：`mall-user`（8080）、`mall-gateway`（9000）都注册到 Nacos，`curl http://localhost:9000/api/health` 能通
- 已完成 **Day 27（容器化）**：Docker Desktop 已装、能执行 `docker run`。如果 Day 27 的 Compose 编排还没做完，没关系——今天步骤 2 会用一条 `docker run` 独立把 Nginx 跑起来，不依赖 Day 27 的产物
- 确认 80 / 443 端口空闲（Windows 上 IIS、其他 Web 服务常占用 80，先 `netstat -ano | findstr :80` 查一下）

## 二、今天完成后你会得到什么

1. 一条完整的对外链路：`客户端 → Nginx(80/443) → 网关集群(9000/9001) → mall-user(8080)`
2. `E:\course-mall\deploy\nginx\` 下的完整 Nginx 配置 + 自签证书（这也是简历上「部署」部分的真实产物）
3. 亲眼看到负载均衡：连续请求在两个网关实例间轮询
4. HTTPS 入口 + HTTP 自动 301 跳转 HTTPS

## 三、步骤

### 步骤 1：先搞懂今天的三个动作分别解决什么问题

Day 16 我们做了 Gateway，对外暴露 `9000`；Day 13 起的服务在 `8080`、`8081`。如果直接把这个系统交给用户，会有三个问题：

| 今天要做的事 | 解决什么问题 | Nginx 里对应的配置 |
|---|---|---|
| **反向代理** | 客户端只认 Nginx 一个入口，后端 9000/8080 等端口全部藏起来（安全 + 客户端不用改地址）；SSL、日志等也统一在这做 | `location` + `proxy_pass` |
| **负载均衡** | 一台网关扛不住时加机器，Nginx 把请求分发给多台，单点变集群 | `upstream` |
| **HTTPS** | 客户端到 Nginx 这段网络不再明文传输，防窃听、防篡改 | `listen 443 ssl` + 证书 |

链路变化：

```
之前（Day16 之后）：  客户端 ──> :9000 网关 ──> :8080 mall-user     ← 网关端口暴露给外部
今天之后：           客户端 ──> :443 Nginx ──> 网关集群(9000/9001) ──> mall-user(8080)
                                       ↑ 80 端口收到 http 会 301 跳 443
```

::: tip 💡 面试题：正向代理和反向代理有什么区别？
**一句话**：看代理「站在谁的立场」——**正向代理代理客户端**（客户端主动配置代理，帮你访问外网，隐藏的是客户端身份），**反向代理代理服务端**（客户端无感知，只知道入口，隐藏的是后端服务器的真实地址和数量）。Nginx 在 course-mall 里是反向代理。详见 [Nginx](/learn_backend/java/微服务/Nginx)。
:::

::: tip 💡 面试题：Nginx 为什么能扛高并发？
**一句话**：因为它**不是**「一个连接一个线程」——Nginx 的 worker 进程用**事件驱动 + 异步非阻塞**（epoll 事件循环）同时看管成千上万个连接，哪个连接有数据才处理哪个，少量 worker 就能扛数万并发；而 Tomcat 默认线程模型下一个慢请求占一个线程，线程池满就雪崩。详见 [Nginx](/learn_backend/java/微服务/Nginx)。
:::

### 步骤 2：把 Nginx 跑起来（Docker 一条命令）

先建好配置文件目录：

```
E:\course-mall\deploy\nginx\          ← 今天的产物都放这里（Day27 的 deploy 目录下）
├─ conf.d\
│  └─ course-mall.conf                # 我们的全部配置写在「一个文件」里
└─ ssl\
   ├─ course-mall.crt                 # 证书（步骤 5 生成）
   └─ course-mall.key                 # 私钥（步骤 5 生成）
```

启动容器（在 Git Bash 执行）：

```bash
docker run -d --name course-mall-nginx \
  -p 80:80 -p 443:443 \
  -v "E:/course-mall/deploy/nginx/conf.d:/etc/nginx/conf.d:ro" \
  -v "E:/course-mall/deploy/nginx/ssl:/etc/nginx/ssl:ro" \
  nginx:1.27
```

关键点（为什么这么写）：

- **`-p 80:80 -p 443:443`**：把容器的 80/443 映射到宿主机，外部流量才能进来。此时 `http://localhost` 打的就是 Nginx 了。
- **挂载 `conf.d` 而不是改主配置**：官方镜像的 `/etc/nginx/nginx.conf` 里已经有一句 `include /etc/nginx/conf.d/*.conf;`，所以我们只要把自己的配置文件扔进 `conf.d` 目录即可。改配置 = 改宿主机文件 → `docker exec course-mall-nginx nginx -s reload`，不用进容器。
- **`:ro`**：只读挂载，防止容器内进程误改宿主机配置。
- **本机服务还没容器化怎么办**：Day 27 之前服务都是用 `mvn spring-boot:run` 跑在 Windows 上的，而 Nginx 现在跑在容器里——容器访问宿主机的服务要用 Docker Desktop 提供的特殊域名 **`host.docker.internal`**（指代宿主机）。所以今天 upstream 里写 `host.docker.internal:9000`。如果 Day 27 已把服务全部容器化、和 Nginx 在同一个 Compose 网络里，就把这里换成 Compose 服务名（如 `gateway:9000`）。

::: tip 💡 面试题：容器里访问宿主机的服务为什么不能写 `localhost`？
**一句话**：容器有自己独立的网络命名空间，容器内的 `localhost` 是容器自己，不是宿主机。Docker Desktop 提供了 `host.docker.internal` 这个特殊 DNS 名指向宿主机；Linux 服务器上则要用 `--add-host=host.docker.internal:host-gateway` 或直接把服务也容器化走同一网络。详见 [Docker](/learn_maintenance/Docker)。
:::

> 备选方案：如果不想用 Docker，去 nginx.org 下载 **nginx for Windows** 的 zip 解压即可（如 `C:\nginx`），配置内容完全一样，只是 upstream 里的 `host.docker.internal` 换成 `localhost`，启动用 `nginx.exe`、重载用 `nginx -s reload`。下文以 Docker 方式为准。

### 步骤 3：反向代理——把流量统一交给网关

写第一版 `E:\course-mall\deploy\nginx\conf.d\course-mall.conf`（先只做反向代理，负载均衡和 HTTPS 后面逐步加）：

```nginx
# ===== 定义「后端网关」：upstream 就是一组可以转发过去的服务器 =====
upstream mall-gateway {
    # 网关入口：今天先配单实例，步骤 4 再加第二个演示负载均衡
    server host.docker.internal:9000;
}

server {
    listen 80;                    # 先监听 80，步骤 5 改成 443
    server_name localhost;

    # 所有 /api/ 开头的请求，转发给上面的网关组
    location /api/ {
        proxy_pass http://mall-gateway;   # 注意：末尾没有斜杠！路径会原样透传

        # ---- 下面四个头是「透传客户端真实信息」，每个都有用 ----
        proxy_set_header Host $host;                              # 1. 原样带上客户端请求的域名
        proxy_set_header X-Real-IP $remote_addr;                  # 2. 真实客户端 IP（直接连 Nginx 的那一端）
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; # 3. 完整的 IP 链：把客户端 IP 追加到已有的 XFF 后面
        proxy_set_header X-Forwarded-Proto $scheme;               # 4. 原始协议 http/https（SSL 终止在 Nginx，后端默认以为都是 http）
    }
}
```

关键点（为什么这么写）：

- **`proxy_pass http://mall-gateway` 末尾不带斜杠**：不带 URI 时，请求路径**原样透传**。客户端请求 `/api/health` → Nginx 转发给网关的仍然是 `/api/health`，正好命中 Day16 网关里 `Path=/api/**` 的路由断言，再经 `lb://mall-user` 到用户服务。如果末尾加了斜杠 `/`，路径会被改写，规则完全不同（见下面的面试题）。
- **`X-Real-IP` 和 `X-Forwarded-For`**：Nginx 转发时，后端看到的 TCP 连接对端是 Nginx 的 IP。不配这些头，后端日志里所有请求都「来自 Nginx」，出问题没法排查、风控和限流也全部失效。
- **`X-Forwarded-Proto`**：步骤 5 之后 HTTPS 在 Nginx 层就终止了（解密后明文转发给后端），网关默认会以为请求都是 http。带上这个头，后端才知道「原始请求是 https」。

保存后重载配置并验证：

```bash
# 先检查语法（生产铁律：改完配置先 nginx -t，通过再 reload）
docker exec course-mall-nginx nginx -t

# 语法 OK 后热重载（不中断现有连接）
docker exec course-mall-nginx nginx -s reload
```

验证（前提：Nacos、mall-user、mall-gateway 都已启动，同 Day16）：

```bash
# 之前：直连网关 9000
curl http://localhost:9000/api/health

# 现在：走 Nginx 的 80 端口，返回应该一模一样
curl http://localhost/api/health
```

预期返回：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "service": "mall-user",
    "time": "2026-08-19T20:30:00.123"
  }
}
```

到这一步，「客户端 → 80 → Nginx 反代 → 9000 网关 → mall-user」整条链路已经通了。**后端端口不再暴露给外部**——这就是反向代理的核心价值。

::: tip 💡 面试题：`proxy_pass http://mall-gateway;` 和 `proxy_pass http://mall-gateway/;` 有什么区别？
**一句话**：末尾**不带 URI（斜杠）**时请求路径**原样透传**（`/api/health` → `/api/health`）；**带了 URI** 时，location 匹配到的那部分会被替换成 `proxy_pass` 里的 URI（`/api/health` → `/health`）。今天下游网关的路由就是按 `/api/**` 配的，所以**不能**加斜杠，加了网关会收不到 `/api` 前缀而 404。详见 [Nginx](/learn_backend/java/微服务/Nginx)。
:::

::: tip 💡 面试题：后端拿到的客户端 IP 为什么是 Nginx 的？怎么拿到真实 IP？
**一句话**：反向代理下后端看到的 TCP 连接对端就是 Nginx，所以 `request.getRemoteAddr()` 拿到的是 Nginx 的 IP；解法就是配 `X-Real-IP`（直连 IP）和 `X-Forwarded-For`（完整代理链），后端从这些头里取。这也是 XFF 头**可被伪造**的原因——它只是头，不是 TCP 事实。详见 [Nginx](/learn_backend/java/微服务/Nginx)。
:::

### 步骤 4：负载均衡——上游加一台网关，看请求轮询

一台网关是单点：它一挂，全站挂。负载均衡的思路是**起多台网关，Nginx 把请求轮流分发**。我们的 Nginx 前面已经挡了网关集群一层，网关到微服务之间还有 Nacos 的 `lb://` 客户端负载均衡（Day15/16 做过）——这就是经典的**两层负载均衡**。

#### 4.1 给网关加一个「自报家门」接口（验证负载均衡要用）

要亲眼看到请求被分到不同网关实例，得先让网关能「说出自己是谁」。在 `mall-gateway` 模块加一个接口，返回自己的端口：

新建 `E:\course-mall\mall-gateway\src\main\java\com\mall\gateway\controller\SelfController.java`：

```java
package com.mall.gateway.controller;

import com.mall.common.result.Result;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

import java.util.Map;

// 网关是 WebFlux 应用（Day16 讲过：没有 spring-boot-starter-web），
// 注解式 Controller 依然可用，但返回值要包成 Mono（响应式流）
@RestController
public class SelfController {

    // 读的是当前实例自己的端口：9000 实例返回 9000，9001 实例返回 9001
    @Value("${server.port}")
    private String port;

    @GetMapping("/gateway/self")
    public Mono<Result<Map<String, String>>> self() {
        return Mono.just(Result.ok(Map.of("instance", "mall-gateway", "port", port)));
    }
}
```

然后把 `/gateway/self` 加进 Day16 写的 `AuthGlobalFilter` 白名单（不加的话会被 JWT 拦截返回 401）：

```java
// 白名单：这些路径不用登录。health 是探活；login/register 是 Day3/4 的登录注册；
// /gateway/self 是今天加的「自报家门」接口，只用来观察负载均衡效果，不用登录
private static final Set<String> WHITE_LIST = Set.of(
        "/api/health",
        "/api/user/login",
        "/api/user/register",
        "/gateway/self"
);
```

#### 4.2 起两个网关实例

在 `E:\course-mall\` 根目录开两个终端：

```bash
# 终端 1：默认 9000（和平时一样）
mvn -pl mall-gateway spring-boot:run

# 终端 2：用命令行参数覆盖配置，起第二个实例到 9001
mvn -pl mall-gateway spring-boot:run "-Dspring-boot.run.arguments=--server.port=9001"
```

关键点：`--server.port=9001` 是**命令行参数覆盖 yml**——Spring Boot 配置优先级里，命令行参数 > 配置文件。两个实例会注册到 Nacos 同名服务 `mall-gateway` 下，这是正常的（同一服务的多实例）。

#### 4.3 upstream 加一台，验证轮询

修改 `course-mall.conf` 的 upstream：

```nginx
upstream mall-gateway {
    # 默认轮询：请求依次 9000 → 9001 → 9000 → 9001 ... 循环分发
    server host.docker.internal:9000;
    server host.docker.internal:9001;
}
```

再给 server 块加一条 location（`/gateway/self` 也转发给网关组）：

```nginx
    location /gateway/ {
        proxy_pass http://mall-gateway;   # 同样不带斜杠，原样透传 /gateway/self
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
```

重载后连续请求 6 次（Git Bash 的 for 循环）：

```bash
docker exec course-mall-nginx nginx -t && docker exec course-mall-nginx nginx -s reload

for i in 1 2 3 4 5 6; do curl -s http://localhost/gateway/self; echo; done
```

预期输出（`port` 在 9000 和 9001 之间交替，顺序可能有细微差别，但两个都会出现）：

```json
{"code":200,"message":"success","data":{"instance":"mall-gateway","port":"9000"}}
{"code":200,"message":"success","data":{"instance":"mall-gateway","port":"9001"}}
{"code":200,"message":"success","data":{"instance":"mall-gateway","port":"9000"}}
{"code":200,"message":"success","data":{"instance":"mall-gateway","port":"9001"}}
...
```

看到两个端口交替出现，就说明 Nginx 真的在把请求轮流分发给两台网关——这就是负载均衡。

#### 4.4 其他分发策略（面试要会背）

| 策略 | 写法 | 适合场景 |
|---|---|---|
| 轮询（默认） | 不写任何参数 | 后端机器性能一致（**我们项目用这个就够**） |
| 加权轮询 | `server x:9000 weight=3;` | 机器性能不均，性能好的多分流量 |
| IP 哈希 | `ip_hash;` | 需要「同一用户固定打同一台」的 session 粘滞场景 |
| 最少连接 | `least_conn;` | 请求耗时差异大，分给当前最闲的机器 |

尝试切换策略（改完 reload 再观察）：

```nginx
upstream mall-gateway {
    # 加权轮询：3:1，9000 拿到约 3/4 的请求
    server host.docker.internal:9000 weight=3;
    server host.docker.internal:9001 weight=1;

    # ip_hash：同一个客户端 IP 永远打到同一台
    # ip_hash;
}
```

> 我们项目用**默认轮询**即可：Day4 的 JWT 是**无状态**的，token 里带用户信息，任何一台网关都能处理，不需要 session 粘滞（`ip_hash`）。「负载均衡 + 有状态 session」才是需要 `ip_hash` 或 Redis 共享 session 的场景。

::: tip 💡 面试题：Nginx 怎么发现某台后端挂了？
**一句话**：Nginx 没有主动健康检查（那是商业版 Nginx Plus 的功能），它是**被动**的——转发失败达到 `max_fails` 次（默认 1），就在 `fail_timeout` 时间内（默认 10 秒）把该机器临时剔除，不再分发。写法：`server host.docker.internal:9001 max_fails=3 fail_timeout=30s;`。详见 [Nginx](/learn_backend/java/微服务/Nginx)。
:::

::: tip 💡 面试题：Nginx 的负载均衡和 Gateway 里 `lb://mall-user` 的负载均衡有什么区别？
**一句话**：是**两层**、两个位置——Nginx 是**服务端负载均衡**：客户端无感知，Nginx 站在入口替它分发（今天做的）；`lb://` 是**客户端负载均衡**：网关自己从 Nacos 拉服务实例列表，按策略挑一台直连。所以完整链路里做了两次 LB：`Nginx → 网关集群`（Nginx 分发）+ `网关 → mall-user 集群`（Nacos+LoadBalancer 分发）。详见 [Spring Cloud](/learn_backend/java/微服务/Spring Cloud)。
:::

### 步骤 5：HTTPS——自签证书 + 443 + HTTP 自动跳转

现在流量在「客户端 → Nginx」这段是**明文 HTTP**，任何中间人都能看到你传的 JWT token、密码。生产上必须加密。

#### 5.1 生成自签证书（Git Bash 自带 openssl）

```bash
cd /e/course-mall/deploy/nginx/ssl

# 一条命令生成「自签证书」：
# -x509         = 自签（没有 CA 背书，学习/内网用；生产要用 CA 签发的证书）
# -newkey rsa:2048 = 新生成 2048 位 RSA 私钥
# -nodes        = 私钥不加密（否则 Nginx 每次启动都要输密码）
# -days 365     = 有效期 1 年
# -subj "/CN=localhost" = 证书主体：CN 写你要用的域名
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout course-mall.key -out course-mall.crt \
  -days 365 -subj "/CN=localhost"
```

生成后 `ssl/` 目录下有两个文件：`course-mall.key`（私钥，**绝不能泄露/提交 git**）、`course-mall.crt`（证书，公开）。

#### 5.2 最终版配置：80 只做跳转，443 承载业务

`course-mall.conf` 最终版（替换之前的 server 块）：

```nginx
# ===== 后端网关集群 =====
upstream mall-gateway {
    server host.docker.internal:9000;
    server host.docker.internal:9001;
}

# ===== HTTP 入口：只做一件事——301 跳到 HTTPS =====
server {
    listen 80;
    server_name localhost;

    # $host = 请求里的域名，$request_uri = 路径+参数，拼起来原样重定向
    return 301 https://$host$request_uri;
}

# ===== HTTPS 入口：真正的业务流量走这里 =====
server {
    listen 443 ssl;
    server_name localhost;

    # 证书路径写的是「容器内」的路径（已挂载），不是宿主机路径
    ssl_certificate     /etc/nginx/ssl/course-mall.crt;
    ssl_certificate_key /etc/nginx/ssl/course-mall.key;

    # 只允许安全版本：禁用 SSLv3 / TLS1.0 / TLS1.1（都已被攻破）
    ssl_protocols TLSv1.2 TLSv1.3;

    location /api/ {
        proxy_pass http://mall-gateway;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # 解密后转发时告诉后端「原来是 https」
    }

    location /gateway/ {
        proxy_pass http://mall-gateway;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

重载：

```bash
docker exec course-mall-nginx nginx -t && docker exec course-mall-nginx nginx -s reload
```

#### 5.3 验证

```bash
# 1) HTTP 应该 301 跳到 https（-I 只显示响应头）
curl -I http://localhost/api/health
# → HTTP/1.1 301 Moved Permanently
# → Location: https://localhost/api/health

# 2) HTTPS 业务正常（-k = 自签证书不受信任，跳过校验；生产证书不用加 -k）
curl -k https://localhost/api/health
# → 和之前一样的 200 JSON

# 3) HTTPS 下的负载均衡依然生效
for i in 1 2 3 4; do curl -ks https://localhost/gateway/self; echo; done
# → port 在 9000/9001 交替
```

::: tip 💡 面试题：HTTPS 为什么安全？对称加密和非对称加密各扮演什么角色？
**一句话**：HTTPS = HTTP + TLS。TLS 握手时用**非对称加密**（公钥/私钥）安全地交换出一个「会话密钥」，之后的数据传输用这个密钥做**对称加密**——因为非对称安全但慢，对称快但密钥分发难，**混合使用**才既安全又高效。证书的作用是证明「这个公钥确实属于这个网站」。详见 [Nginx](/learn_backend/java/微服务/Nginx)。
:::

::: tip 💡 面试题：为什么浏览器访问自签证书的网站会警告「不安全」？
**一句话**：浏览器内置了一份「受信任的 CA 列表」，只有这些 CA 签发的证书才被信任；自签证书没有 CA 背书，浏览器无法确认「你真的是 localhost」，所以警告。生产环境的证书来源：云厂商免费证书（阿里云/腾讯云）或 Let's Encrypt，申请时验证域名归属，签发后浏览器就不再警告。
:::

### 步骤 6：总体验证清单

按顺序确认（Nacos → mall-user → 两个 gateway → Nginx）：

```bash
# ① 老链路还通（回归）：直连网关
curl http://localhost:9000/api/health

# ② 反向代理：走 Nginx 80，能拿到业务数据
curl http://localhost/api/health

# ③ 负载均衡：多次请求在两个网关实例间轮询
for i in 1 2 3 4 5 6; do curl -s http://localhost/gateway/self; echo; done

# ④ HTTPS：443 通，80 自动 301
curl -k https://localhost/api/health
curl -I http://localhost/api/health

# ⑤ 后端端口已隐藏：8080/9000 不再对外（本机测试仍可直连，生产网络层只放行 80/443）
```

## 四、知识点索引（今天涉及的，会陆续补全）

| 今天用到的点 | 对应知识文档 |
|---|---|
| Nginx 反向代理 / `proxy_pass` / location / 正向 vs 反向 | [Nginx](/learn_backend/java/微服务/Nginx) |
| `upstream` 负载均衡策略（轮询/加权/ip_hash/least_conn） | [Nginx](/learn_backend/java/微服务/Nginx) |
| Nginx 的 LB 与 Gateway `lb://` 的两层负载均衡 | [Gateway](/learn_backend/java/微服务/Gateway) |
| 服务端负载均衡 vs 客户端负载均衡 | [Spring Cloud](/learn_backend/java/微服务/Spring Cloud) |
| Docker 跑 Nginx：端口映射、目录挂载、容器网络 | [Docker](/learn_maintenance/Docker) |
| 负载均衡解决单点瓶颈、集群高可用 | [分布式基础](/learn_backend/java/微服务/分布式基础) |

## 五、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] `curl http://localhost/api/health` 走 Nginx 返回和直连 9000 一致：是 / 否
- [ ] 两个 gateway 实例（9000/9001）都启动，`/gateway/self` 连续请求能看到端口轮询：是 / 否
- [ ] `curl -k https://localhost/api/health` 通，`curl -I http://localhost/api/health` 返回 301：是 / 否
- [ ] 踩坑记录（80 被占用、host.docker.internal 不通、proxy_pass 加斜杠导致 404、证书路径写错等）：
- [ ] 疑问（有就写，我来答）：

## 六、我下次会追问的问题（做完先自己想想）

1. 正向代理和反向代理的区别是什么？course-mall 里的 Nginx 是哪种？客户端知不知道背后是 gateway 还是 mall-user？
2. Nginx 为什么能扛高并发？和 Tomcat 的线程模型比，核心区别在哪？
3. `proxy_pass http://mall-gateway` 和 `proxy_pass http://mall-gateway/` 有什么区别？今天为什么不能加末尾斜杠？
4. 一个请求从 `https://localhost/api/health` 进来，被「负载均衡」了几次？分别在哪一层、由谁做的？（提示：Nginx 分发网关集群 + 网关 lb:// 分发服务集群）
5. Nginx 配了 `X-Forwarded-For` 头，后端 Spring Boot 会自动识别吗？如果客户端伪造这个头会有什么后果？什么时候该信任它？
