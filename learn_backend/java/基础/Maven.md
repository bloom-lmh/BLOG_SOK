# Maven

> 一句话定位：Maven 是 Java 项目的事实标准**构建工具 + 依赖管理工具**，在 `pom.xml` 解决「依赖从哪下载、项目怎么编译打包、生命周期如何自动化」三大问题，让你不用手动拷 jar 包、不用手写编译脚本，一套「约定优于配置」规范统一了所有 Java 项目的构建方式。

## 基础篇

### 1. Maven 到底解决了什么问题

在没有 Maven 的年代，Java 项目开发会遇到三大痛点，Maven 就是冲着它们来的：

| 痛点     | 手动做法                                         | Maven 的做法                                                      |
| -------- | ------------------------------------------------ | ----------------------------------------------------------------- |
| 依赖管理 | 手动下载 jar 拷进 `lib/` 目录，版本冲突全靠肉眼  | 在 `pom.xml` 声明坐标，自动从仓库下载，还能传递依赖、自动调解冲突 |
| 构建流程 | 每个项目自己写 `build.sh` / `ant` 脚本，各写各的 | 统一的生命周期：`clean → compile → test → package → install`      |
| 目录规范 | 每个人目录结构不一样，接手项目要猜               | 约定优于配置，`src/main/java` 放代码、`src/test/java` 放测试      |

> **Maven 的本质**可以一句话概括：构建工具+依赖管理工具。你只需要在 `pom.xml` 里声明「我要什么」，Maven 负责「怎么拿到、怎么构建」。

::: tip 💡 面试题：Maven 和 Gradle 的区别？
Maven 用 XML 配置、约定优于配置、生态最成熟；Gradle 用 Groovy/Kotlin 脚本、构建更快（增量构建 + 构建缓存）、更灵活，但学习成本更高。一句话结论：老项目和新项目主流仍是 Maven，大型/复杂构建才考虑 Gradle。
:::

### 2. 核心概念：坐标（GAV）

Maven 靠 **坐标** 唯一定位一个构件（jar 包），三个要素缺一不可：

- **groupId**：组织/公司域名倒写，如 `org.springframework`
- **artifactId**：项目/模块名，如 `spring-context`
- **version**：版本号，如 `5.3.30`

`groupId + artifactId + version` 组合起来就对应仓库里的一个唯一路径，这就是「依赖能精确下载」的根本原因。坐标和仓库物理路径的映射关系如下：

```
仓库根目录/
└── org/
    └── springframework/            ← groupId，点号(.)换成斜杠(/)
        └── spring-context/         ← artifactId
            └── 5.3.30/             ← version
                ├── spring-context-5.3.30.jar
                └── spring-context-5.3.30.pom
```

```xml
<dependency>
    <groupId>org.springframework</groupId>   <!-- 公司/组织，域名倒写，用于分组 -->
    <artifactId>spring-context</artifactId>   <!-- 具体模块名 -->
    <version>5.3.30</version>                  <!-- 版本号，锁定唯一构件 -->
</dependency>
```

除了 GAV 三要素，坐标其实还有两个**可选要素**：

| 要素         |     是否必填     | 含义                                     | 示例          |
| ------------ | :--------------: | ---------------------------------------- | ------------- |
| `groupId`    |       必填       | 组织/公司域名倒写                        | `com.alibaba` |
| `artifactId` |       必填       | 项目/模块名                              | `fastjson`    |
| `version`    |       必填       | 版本号                                   | `1.2.83`      |
| `packaging`  | 可选，默认 `jar` | 打包类型：`jar`/`war`/`pom`/`ear`        | `war`         |
| `classifier` |       可选       | 同版本下的附加构件（源码包、javadoc 包） | `sources`     |

### 3. 仓库体系（三类仓库）

Maven 下载依赖时按顺序查找，找到就停，找不到继续往下一级找：

```
你执行 mvn 构建
        │
        ▼
┌───────────────┐  有 → 直接使用并回填缓存
│  ① 本地仓库    │
│ ~/.m2/repo    │
└──────┬────────┘
       │ 没有
       ▼
┌───────────────┐  有 → 下载到本地仓库并缓存
│  ② 私服(远程)  │
│ Nexus/Artifactory│
└──────┬────────┘
       │ 没有
       ▼
┌───────────────┐  有 → 下载并缓存（本地 + 私服）
│  ③ 中央仓库    │
│ repo.maven.apache.org│
└───────────────┘
```

1. **本地仓库**：默认在 `~/.m2/repository`，第一次下载后缓存，之后离线可用。可以通过 `settings.xml` 里的 `<localRepository>` 修改位置。
2. **私服（远程仓库）**：公司内网搭的 Nexus / Artifactory，缓存中央仓库并托管内部构件，提升下载速度、保证内网可用、还能发布公司内部私有构件。
3. **中央仓库**：Maven 官方维护的公共仓库，绝大部分开源依赖都在这。

优先级：`本地仓库 → 私服 → 中央仓库`。如果本地没有、私服也没有，就去中央仓库拉，同时回填到本地缓存（以及私服缓存）。

::: tip 💡 面试题：`SNAPSHOT` 和 `RELEASE` 版本的区别？
SNAPSHOT 是开发中的不稳定版本，每次构建都会去仓库拉最新，适合开发期联调；RELEASE 是稳定版本，本地缓存后不再重复下载。一句话原因：SNAPSHOT 允许重复覆盖，RELEASE 一旦发布就不允许改，保证构建可复现。
:::

### 4. 依赖 scope（作用域）

`<scope>` 决定依赖在什么阶段可见、是否会传递，最常用的几个：

| scope             | 编译期 | 测试期 | 运行期 | 是否传递 | 典型例子                                 |
| ----------------- | :----: | :----: | :----: | :------: | ---------------------------------------- |
| `compile`（默认） |   ✅   |   ✅   |   ✅   |    ✅    | spring-context、common-lang              |
| `provided`        |   ✅   |   ✅   |   ❌   |    ❌    | servlet-api、lombok                      |
| `runtime`         |   ❌   |   ✅   |   ✅   |    ✅    | mysql-connector-java                     |
| `test`            |   ❌   |   ✅   |   ❌   |    ❌    | junit                                    |
| `system`          |   ✅   |   ✅   |   ✅   |    ❌    | 本地 jar，需配 systemPath（不推荐）      |
| `import`          |  特殊  |   —    |   —    |    —     | 只能用于 dependencyManagement 中引入 BOM |

```xml
<dependency>
    <groupId>javax.servlet</groupId>
    <artifactId>javax.servlet-api</artifactId>
    <version>4.0.1</version>
    <scope>provided</scope>
    <!-- provided：编译/测试需要，但部署到 Tomcat 时容器已提供，不能打进 war 里，
         否则会和容器自带的 servlet-api 冲突 -->
</dependency>
```

理解 scope 的关键：**「编译期可见」决定你能不能 import 它的类，「运行期可见」决定打包/部署后能不能用**。比如 `runtime` 的 mysql 驱动，你写代码时根本不会 import 它，但它必须在运行期被加载，所以编译期不可见、运行期可见。

### 5. 依赖传递与冲突（面试核心）

依赖是**传递的**：A 依赖 B，B 依赖 C，那么 C 也会进入 A 的依赖树。传递会带来两个问题——版本冲突，Maven 用两条规则解决：

```
A
├── B (1.0)
│   └── C (2.0)        ← 距离 C 有 2 层
└── D (1.0)
    └── C (1.5)        ← 距离 C 有 2 层，和上面层级相同

结论：B 和 D 都依赖 C，版本不同
```

- **最短路径优先（nearest definition）**：同一个 C 被 B 和 D 分别依赖（版本不同），选依赖层级更浅的那个。层级就是「从 A 走到 C 经过几条边」。
- **先声明优先（first declaration）**：路径长度一样时，谁在 `pom.xml` 里先声明就用谁的版本。

::: tip 💡 面试题：依赖冲突的默认调解规则？
两条：**最短路径优先**（依赖层级浅的版本生效）、**先声明优先**（层级相同时，谁在 pom 里先出现用谁）。一句话原因：Maven 必须自动化地选一个版本，否则构建无法继续，这两条规则是可复现的确定性规则。
:::

解决冲突的两个常用手段：

```xml
<!-- 1. 排除某个传递依赖，常用于排除冲突的日志/旧版本 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <exclusions>
        <exclusion>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-tomcat</artifactId>
        </exclusion>
    </exclusions>
</dependency>

<!-- 2. 直接声明目标版本，Maven 的「就近/先声明」会优先采用它 -->
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>fastjson</artifactId>
    <version>1.2.83</version>
</dependency>
```

::: tip 💡 面试题：遇到依赖冲突怎么排查和解决？
用 `mvn dependency:tree` 看依赖树定位冲突版本，再用 `<exclusion>` 排除或直接锁定版本。一句话原因：Maven 靠最短路径/先声明规则自动选版，但这些规则未必选出你想要的版本，必须手动干预。
:::

**依赖隔离的另一个开关：`<optional>`**

`<optional>true</optional>` 解决的是另一个问题——**不是版本冲突，而是「我不想把这个依赖传给我的依赖方」**。默认依赖是传递的：A 依赖 B，B 依赖 C，那 C 也会进入 A 的依赖树。给 C 标 `optional` 后，C 仍能被 B 自己用，但**不会再顺着传递链流到 A**。

```xml
<!-- mall-common 里的 lombok：自己编译要用（@Data 展开成 getter/setter），
     但 lombok 是「编译期工具」，编译完就没用了，不该传染给依赖我的模块 -->
<dependency>
    <groupId>org.projectlombok</groupId>
    <artifactId>lombok</artifactId>
    <optional>true</optional>
</dependency>
```

为什么 lombok 要标 optional：lombok 只在**编译期**工作（注解处理器把 `@Data` 展开成真实方法写入字节码），**运行期不需要**。标 optional 后，依赖 mall-common 的模块不会「被动沾光」拿到 lombok，需要就自己显式声明——这就是「依赖最小化 / 依赖隔离」。

`<optional>` 和两个容易混的概念对照：

| 标签                        | 控制什么                     | 一句话                                    |
| --------------------------- | ---------------------------- | ----------------------------------------- |
| `<optional>true</optional>` | **要不要传给下游依赖方**     | 「我编译要用，但不传染给我的依赖方」      |
| `<scope>provided</scope>`   | **在哪个阶段存在**           | 「编译/测试要，运行期由环境提供，别打包」 |
| `<exclusion>`               | **排除别人传进来的某个依赖** | 「我不要你给我带的这个库」                |

方向不同：`optional` 是「我不往外传」，`exclusion` 是「我拒绝别人传进来的」，`provided` 是「运行时环境会给我」。

::: tip 💡 面试题：`<optional>` 和 `<scope>provided</scope>` 有什么区别？
**一句话**：两者都能让依赖「不进最终产物、不传给下游」，但语义不同——`provided` 强调「**运行环境已经提供了**（如 Tomcat 提供 servlet-api）」，`optional` 强调「**这个依赖是编译期工具，不该传递**（如 lombok）」。实际项目里 lombok 两种写法都常见，但讲清楚语义区别是加分项。
:::

### 6. 约定优于配置：标准目录结构

Maven 默认一套目录结构，所有项目通用，这是「接手项目不用猜」的基础：

```
my-project/
├── pom.xml                      ← 项目对象模型，一切配置的入口
└── src/
    ├── main/                    ← 主代码
    │   ├── java/                ← 业务 Java 源码
    │   │   └── com/example/App.java
    │   ├── resources/           ← 主资源（配置文件、mapper xml 等），打包进 classpath 根
    │   │   └── application.properties
    │   └── webapp/              ← web 项目（war）的 JSP、WEB-INF/web.xml
    └── test/                    ← 测试代码
        ├── java/                ← 测试源码
        └── resources/           ← 测试资源
└── target/                      ← 构建产物（编译后的 class、jar/war），clean 会删除
```

这套结构不用配置就能被 Maven 识别，`mvn compile` 自动编译 `src/main/java` 到 `target/classes`，`mvn test` 自动编译 `src/test/java`。

### 7. 一个完整的 pom.xml 骨架

把上面的概念串起来，一个标准的 `pom.xml` 长这样（含全部关键节点）：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             http://maven.apache.org/xsd/maven-4.0.0.xsd">

    <modelVersion>4.0.0</modelVersion>   <!-- POM 模型版本，固定 4.0.0 -->

    <!-- ① 项目自身坐标 -->
    <groupId>com.example</groupId>
    <artifactId>mall-order</artifactId>
    <version>1.0.0-SNAPSHOT</version>
    <packaging>jar</packaging>           <!-- jar/war/pom，默认 jar -->

    <!-- ② 项目信息（可选，展示/打包元数据） -->
    <name>mall-order</name>
    <description>订单模块</description>

    <!-- ③ 统一版本变量，下面用 ${xxx} 引用，改一处全项目生效 -->
    <properties>
        <java.version>1.8</java.version>
        <spring.version>5.3.30</spring.version>
        <maven.compiler.source>8</maven.compiler.source>
        <maven.compiler.target>8</maven.compiler.target>
    </properties>

    <!-- ④ 依赖 -->
    <dependencies>
        <dependency>
            <groupId>org.springframework</groupId>
            <artifactId>spring-context</artifactId>
            <version>${spring.version}</version>   <!-- 引用 properties 里定义的变量 -->
        </dependency>
    </dependencies>

    <!-- ⑤ 构建配置：插件 + 资源 -->
    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
            </plugin>
        </plugins>
    </build>
</project>
```

---

## 高级篇

### 8. 生命周期与插件

Maven 有三套**独立的生命周期**，互相不依赖（`mvn clean install` 是依次执行两套）：

- **clean**：清理，`mvn clean` 删除 `target` 目录。
- **default**：构建核心，从 `compile` 到 `package`、`install`、`deploy`。
- **site**：生成项目站点文档（用得少）。

每个生命周期由一串 **phase（阶段）** 组成，执行后面的 phase 会自动先执行前面的（类似「台阶」，上第 N 级台阶必然经过前 N-1 级）。default 生命周期最常用的几个 phase：

```
validate → initialize → generate-sources → process-sources → generate-resources
→ process-resources → compile → process-classes → generate-test-sources
→ process-test-sources → generate-test-resources → process-test-resources
→ test-compile → process-test-classes → test → prepare-package → package
→ pre-integration-test → integration-test → post-integration-test
→ verify → install → deploy
```

日常只记这条核心链就够了：

```
compile → test → package → install → deploy
```

| 命令          | 作用                                        |      执行到的 phase      |
| ------------- | ------------------------------------------- | :----------------------: |
| `mvn clean`   | 清理 target                                 |  clean 生命周期的 clean  |
| `mvn compile` | 编译 `src/main/java` 到 `target/classes`    |         compile          |
| `mvn test`    | 编译 + 跑单元测试                           | test（会先执行 compile） |
| `mvn package` | 编译 + 测试 + 打成 jar/war 包               |         package          |
| `mvn install` | 打包 + 安装到本地仓库（供本机其他项目引用） |         install          |
| `mvn deploy`  | 打包 + 发布到私服（供其他机器引用）         |          deploy          |

**phase 本身不做实际工作，真正干活的是插件（plugin）的 goal**。每个 phase 会绑定若干个 goal，执行到该 phase 时触发这些 goal。核心绑定关系如下：

| phase          | 绑定的插件 goal（default 打包类型）               |
| -------------- | ------------------------------------------------- |
| `compile`      | `maven-compiler-plugin:compile`                   |
| `test-compile` | `maven-compiler-plugin:testCompile`               |
| `test`         | `maven-surefire-plugin:test`                      |
| `package`      | `maven-jar-plugin:jar`（或 war/spring-boot 打包） |
| `install`      | `maven-install-plugin:install`                    |
| `deploy`       | `maven-deploy-plugin:deploy`                      |

> 理解关键：**phase 是「动作的编排顺序」，goal 是「真正执行的原子操作」**。你可以用 `mvn 插件:goal` 直接跑某个 goal（如 `mvn dependency:tree` 就是直接调 `maven-dependency-plugin` 的 `tree` goal，不经过任何 phase）。

```xml
<!-- 配置插件：锁定 maven-compiler-plugin 的版本并指定 JDK 版本，
     避免不同机器用默认 JDK 编译导致 class 版本不一致 -->
<build>
    <plugins>
        <plugin>
            <groupId>org.apache.maven.plugins</groupId>
            <artifactId>maven-compiler-plugin</artifactId>
            <version>3.11.0</version>
            <configuration>
                <source>8</source>  <!-- 源码按 Java 8 语法编译 -->
                <target>8</target>  <!-- 产出 Java 8 字节码 -->
            </configuration>
        </plugin>
    </plugins>
</build>
```

### 9. 常用插件速查

插件是 Maven 能力的来源，除了默认绑定的，这些是最常用的：

| 插件                       | 常用 goal                    | 场景                         |
| -------------------------- | ---------------------------- | ---------------------------- |
| `maven-compiler-plugin`    | `compile` / `testCompile`    | 编译源码，配置 JDK 版本      |
| `maven-surefire-plugin`    | `test`                       | 运行单元测试                 |
| `maven-jar-plugin`         | `jar`                        | 打普通 jar 包                |
| `maven-war-plugin`         | `war`                        | 打 war 包                    |
| `spring-boot-maven-plugin` | `repackage`                  | Spring Boot 打可执行 fat jar |
| `maven-install-plugin`     | `install`                    | 安装到本地仓库               |
| `maven-deploy-plugin`      | `deploy`                     | 发布到私服                   |
| `maven-dependency-plugin`  | `tree` / `copy-dependencies` | 看依赖树、拷贝依赖           |
| `maven-resources-plugin`   | `resources`                  | 拷贝 resources 到 classpath  |

Spring Boot 项目打包可执行 jar 的关键（`repackage` 把依赖也塞进 jar，生成「fat jar」）：

```xml
<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
            <!-- 执行 repackage goal：把 main-class 指向启动类，并把依赖 jar 解包进 BOOT-INF/lib，
                 这样 java -jar app.jar 就能直接跑，不用单独配 classpath -->
            <executions>
                <execution>
                    <goals>
                        <goal>repackage</goal>
                    </goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

#### annotationProcessorPaths：Lombok 与 MapStruct 的编译协作

**问题背景**：Lombok 和 MapStruct 都是编译期工具，且 MapStruct 依赖 Lombok 的产物——Lombok 先生成 getter/setter，MapStruct 再用它们生成转换器实现类（`UserConverterImpl`）。如果处理器的顺序/可见性不对，编译就报错。

**标准配置**（Spring Boot 3 + MapStruct 的推荐姿势）：

```xml
<build>
    <plugins>
        <!-- Lombok 先生成 getter/setter，MapStruct 再据此生成转换实现 -->
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
                        <version>0.2.0</version>
                    </path>
                </annotationProcessorPaths>
            </configuration>
        </plugin>
    </plugins>
</build>
```

**`annotationProcessorPaths` 做什么**：

1. **显式指定处理器 jar 从哪来**——不再让 javac 从 classpath 里瞎翻注解处理器，而是明确给出三个 jar。
2. **顺序有讲究**——Provider（Lombok，产 getter/setter）在前，Consumer（MapStruct，消费它们）在后，配合 binding 桥接。

**严格说不是"线性两阶段"**：javac 的注解处理是**轮次制（round-based）**，同一轮多个 processor 一起被调用、产出新源码再触发下一轮，循环直到没有新东西。但方向没错——MapStruct 必须等到 Lombok 的 getter/setter 存在才能干活，这是事实上的依赖关系。

**`lombok-mapstruct-binding` 是最容易被漏的一环**：只有 Lombok + MapStruct 两个 jar 时，MapStruct 的 processor 去「读」被注解的类找可映射的属性，但它**默认看不到 Lombok 生成的 getter/setter**（那些是编译中间产物），于是报经典错误：

```
error: Unknown property "username" in result type User
```

`lombok-mapstruct-binding` 就是这座桥：让 MapStruct 的 processor 感知 Lombok 生成的产物，把 `@Data` 类里的字段当成可用属性。**没有它，顺序再对也白搭。**

> 旧写法是把 Lombok 放 `<dependencies>` + `<scope>provided</scope>`，让 javac 从 classpath 自动发现处理器——但那样顺序不可控、容易踩坑。用 `annotationProcessorPaths` 显式声明是当前推荐做法（对应 Day03 的 `mall-user/pom.xml`）。

### 10. 聚合与继承（多模块项目）

真实项目大多是**多模块**的，靠聚合和继承组织，两者职责不同但常一起用：

- **继承（parent）**：子模块 `<parent>` 指向父 pom，复用父 pom 里的依赖版本、插件、`properties`，避免每个模块重复配置。
- **聚合（modules）**：父 pom 用 `<modules>` 列出所有子模块，在父目录执行一次 `mvn install` 会按依赖顺序构建所有模块。

**两者区别一句话**：继承是「子模块向上复用父 pom 的配置」，聚合是「父 pom 向下统一触发子模块的构建」。一个 pom 可以既是别人的 parent，又是多个 module 的聚合根。

```xml
<!-- 父 pom：既是 parent（统一管理），也是聚合根（统一构建） -->
<groupId>com.example</groupId>
<artifactId>mall-parent</artifactId>
<version>1.0.0</version>
<packaging>pom</packaging>   <!-- 父工程必须是 pom 打包类型 -->

<modules>
    <module>mall-common</module>
    <module>mall-user</module>
    <module>mall-order</module>
</modules>
```

子模块这样继承：

```xml
<parent>
    <groupId>com.example</groupId>
    <artifactId>mall-parent</artifactId>
    <version>1.0.0</version>
    <relativePath/>   <!-- 从本地相对路径找父 pom，而不是去仓库找 -->
</parent>
<artifactId>mall-user</artifactId>
```

**版本统一管理**是 parent 最大的价值——父 pom 用 `<dependencyManagement>` 只声明版本不真正引入，子模块引入时省掉 version：

```xml
<!-- 父 pom：只锁版本，不引入依赖 -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.alibaba</groupId>
            <artifactId>fastjson</artifactId>
            <version>1.2.83</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

```xml
<!-- 子模块：不写 version，版本由父 pom 统一控制 -->
<dependencies>
    <dependency>
        <groupId>com.alibaba</groupId>
        <artifactId>fastjson</artifactId>
    </dependency>
</dependencies>
```

::: tip 💡 面试题：`<dependencies>` 和 `<dependencyManagement>` 的区别？
`dependencies` 会真正引入依赖；`dependencyManagement` 只是声明版本供子模块继承，本身不引入。一句话原因：前者是「用」，后者是「管」，多模块项目中靠后者统一版本、避免版本不一致。
:::

### 11. 属性、dependencyManagement 与 import 型 BOM

统一版本有三种方式，从简单到高级：

```xml
<!-- 方式一：properties 变量 -->
<properties>
    <fastjson.version>1.2.83</fastjson.version>
</properties>
<dependencies>
    <dependency>
        <groupId>com.alibaba</groupId>
        <artifactId>fastjson</artifactId>
        <version>${fastjson.version}</version>
    </dependency>
</dependencies>
```

```xml
<!-- 方式二：dependencyManagement 锁版本（多模块共享，最常用） -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.alibaba</groupId>
            <artifactId>fastjson</artifactId>
            <version>1.2.83</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

```xml
<!-- 方式三：import 别人的 BOM（如 Spring Boot 的 spring-boot-dependencies）
     一次性引入它管理的全部版本，不用自己逐个维护 -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-dependencies</artifactId>
            <version>2.7.18</version>
            <type>pom</type>
            <scope>import</scope>   <!-- import：把该 pom 的 dependencyManagement 整体导入 -->
        </dependency>
    </dependencies>
</dependencyManagement>
```

BOM（Bill of Materials，物料清单）就是「一堆依赖版本的清单」，import 型 scope 让这份清单可被复用——这是 Spring Boot 生态统一管理成百上千依赖版本的基石。

### 12. 常用命令速查

| 命令                                          | 作用                                                   |
| --------------------------------------------- | ------------------------------------------------------ |
| `mvn clean`                                   | 清理 target 目录                                       |
| `mvn compile`                                 | 编译源码                                               |
| `mvn test`                                    | 运行单元测试                                           |
| `mvn package`                                 | 打包（jar/war），会先编译+测试                         |
| `mvn package -DskipTests`                     | 打包但跳过测试（`skipTests` 跳过执行，仍编译测试代码） |
| `mvn install`                                 | 打包并安装到本地仓库                                   |
| `mvn install -Dmaven.test.skip=true`          | 安装到本地仓库，且连测试代码都不编译                   |
| `mvn deploy`                                  | 打包并发布到私服                                       |
| `mvn dependency:tree`                         | 打印依赖树，排查冲突                                   |
| `mvn dependency:tree -Dincludes=com.alibaba`  | 只看某个 groupId 的依赖树                              |
| `mvn -pl mall-user -am package`               | 只构建指定模块（`-am` 连带它依赖的模块）               |
| `mvn -pl mall-user -amd package`              | 只构建指定模块（`-amd` 连带依赖它的模块）              |
| `mvn -DskipTests -T 4 package`                | 4 线程并行构建（多模块加速）                           |
| `mvn clean install -Dmaven.test.skip=true -U` | 强制更新快照依赖（`-U`）并跳过测试                     |

`-DskipTests` 和 `-Dmaven.test.skip=true` 的区别：

| 参数                     | 是否编译测试代码 | 是否运行测试 |
| ------------------------ | :--------------: | :----------: |
| `-DskipTests`            |     ✅ 编译      |  ❌ 不运行   |
| `-Dmaven.test.skip=true` |    ❌ 不编译     |  ❌ 不运行   |

### 13. settings.xml 与全局配置

`settings.xml` 是**用户级/全局级**配置（区别于项目级的 `pom.xml`），主要配镜像、仓库地址、账号密码等环境相关的东西。位置有两个：

- 全局：`${M2_HOME}/conf/settings.xml`
- 用户：`~/.m2/settings.xml`（优先，通常改这个）

关键配置项：

```xml
<settings>
    <!-- ① 本地仓库位置 -->
    <localRepository>D:/maven/repo</localRepository>

    <!-- ② 镜像：把某个仓库的请求重定向到镜像（国内常用阿里云加速中央仓库） -->
    <mirrors>
        <mirror>
            <id>aliyun</id>
            <mirrorOf>central</mirrorOf>   <!-- 只镜像 central 仓库 -->
            <name>aliyun central</name>
            <url>https://maven.aliyun.com/repository/central</url>
        </mirror>
    </mirrors>

    <!-- ③ 私服账号：deploy 发布时认证用 -->
    <servers>
        <server>
            <id>my-nexus</id>
            <username>admin</username>
            <password>admin123</password>
        </server>
    </servers>

    <!-- ④ profile：按环境切换配置（通过 -P 激活） -->
    <profiles>
        <profile>
            <id>jdk8</id>
            <activation>
                <activeByDefault>true</activeByDefault>
            </activation>
            <properties>
                <maven.compiler.source>8</maven.compiler.source>
                <maven.compiler.target>8</maven.compiler.target>
            </properties>
        </profile>
    </profiles>
</settings>
```

::: tip 💡 面试题：`pom.xml` 和 `settings.xml` 有什么区别？
`pom.xml` 是**项目级**配置，随项目走（依赖、插件、构建）；`settings.xml` 是**用户/环境级**配置，随机器走（仓库地址、镜像、账号、本地仓库路径）。一句话原因：账号密码、内网镜像这些是环境信息，不能写进开源的项目文件里。
:::

---

## 原理篇

### 14. 依赖解析的完整流程

从「pom 里声明一个依赖」到「真正拿到 jar」，Maven 内部是这样跑的：

```
pom.xml 声明依赖
        │
        ▼
┌─────────────────────────┐
│ 1. 收集直接依赖           │ 解析 <dependencies>，拿到 GAV
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ 2. 读取依赖的 pom         │ 每个依赖也有自己的 pom，里面有它依赖的东西（传递依赖）
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ 3. 递归构建依赖树         │ 深度优先，逐层展开，记录每个节点 + 层级
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ 4. 依赖调解（冲突裁决）    │ 同一构件多版本 → 最短路径优先 → 先声明优先
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ 5. scope 裁剪             │ 按 scope 过滤：test 不传递、provided 不传递等
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ 6. 定位仓库路径            │ GAV → groupId/artifactId/version 目录 + 文件名
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│ 7. 下载并缓存              │ 本地 → 私服 → 中央仓库，命中即缓存到本地
└─────────────────────────┘
```

### 15. 依赖调解规则详解（源码级）

依赖冲突裁决是 Maven 面试最爱问的「原理」，对应 Maven 源码里的两个核心方法，逻辑如下：

```
传入：一个构件 artifact，多个候选版本
        │
        ▼
   取「依赖路径最短」的版本
        │
   只有一条？ ──是──▶ 直接用
        │否
        ▼
   多条最短路径的版本还不同？
        │
   取「在 pom 里最先声明」的那个（先声明优先）
```

用具体例子验证规则：

```
场景一（最短路径优先）：
  A
  ├── B (1.0)
  │   └── C (2.0)      ← C 距离 A：2 层
  └── C (1.5)          ← C 距离 A：1 层（最短）
  → 最终 C 选 1.5，因为 1 层 < 2 层

场景二（先声明优先）：
  A
  ├── B (1.0)
  │   └── C (2.0)      ← 距离 2 层
  └── D (1.0)
      └── C (1.5)      ← 距离 2 层，层级相同
  → 最终 C 选 2.0，因为 B 在 pom 里声明在 D 前面
```

::: tip 💡 面试题：为什么「先声明优先」而不是「后声明优先」？
因为 Maven 解析依赖是**顺序扫描 pom** 的，遇到第一个满足「最短路径」的候选就直接返回，后面相同层级的不会覆盖前面的。一句话原因：算法上它边遍历边取「第一个命中」，天然就是「先声明优先」。
:::

### 16. phase 与 goal 的绑定机制

生命周期本质是**一张「phase → goal 列表」的映射表**，Maven 启动时根据打包类型（jar/war）装载默认绑定，再叠加 pom 里 `<build><plugins>` 的显式配置。

```
mvn package
    │
    ▼
找到 default 生命周期，定位 phase = "package"
    │
    ▼
要执行 package，先顺序执行它之前的所有 phase：
    validate → ... → compile → ... → test → ... → package
    │
    ▼
每个 phase 执行时，取出它绑定的 goal 列表：
    compile  → [maven-compiler-plugin:compile]
    test     → [maven-surefire-plugin:test]
    package  → [maven-jar-plugin:jar]
    │
    ▼
按顺序执行每个 goal（每个 goal 就是插件的 Mojo 类的一个方法）
```

**关键点**：你可以在 pom 里「自定义 phase 和 goal 的绑定」，把一个 goal 挂到某个 phase 上，这就是插件 `<executions>` 的作用。`spring-boot-maven-plugin` 的 `repackage` goal 默认就是额外绑定到 `package` phase 上，在 `maven-jar-plugin:jar` 之后执行，把普通 jar 改造成可执行 fat jar。

### 17. effective POM：最终生效的配置是怎么合并出来的

你写的 `pom.xml` 不是最终生效的，Maven 运行时会合并出一个 **effective POM**，合并来源有四层：

```
你的 pom.xml
    │ 向上继承
    ▼
父 pom（parent 的 pom.xml）
    │ 向上继承
    ▼
超级 POM（Super POM，Maven 内置）
    │
    └── 同时叠加 settings.xml 的 profile / 镜像配置

最终 = Super POM + 父 pom + 你的 pom + 激活的 profile
```

用命令查看某个项目最终生效的 POM（排查「我明明配了，为什么不生效」的利器）：

```bash
mvn help:effective-pom
```

::: tip 💡 面试题：Super POM 是什么？
Super POM 是 Maven 内置的「所有 pom 的祖宗」，它定义了默认目录结构、默认打包类型 jar、中央仓库地址、默认插件版本等。一句话原因：你看到的「约定优于配置」里那些默认值，其实都来自 Super POM。
:::

### 18. 多模块构建的排序与循环依赖

聚合项目执行 `mvn install` 时，Maven 不会盲目按 `<modules>` 声明的顺序构建，而是先做**依赖拓扑排序**：

```
modules 声明顺序：[mall-user, mall-order, mall-common]
实际依赖关系：mall-order 依赖 mall-common，mall-user 依赖 mall-common

拓扑排序后实际构建顺序：
  mall-common → mall-user / mall-order
  （mall-common 被依赖，必须先构建；user 和 order 无依赖可并行）
```

**循环依赖**会导致构建失败：A 依赖 B、B 依赖 A，拓扑排序无法完成，Maven 会报错 `The projects in the reactor contain a cyclic reference`。解决办法是抽公共模块打破环。

---

## 面试常问

1. **Maven 的生命周期有哪几个阶段？** 三套独立生命周期：clean（清理）、default（构建）、site（站点），default 核心阶段是 compile → test → package → install → deploy。执行后面的 phase 会自动先执行前面的。

2. **scope 有哪几种？** 常用 compile（默认）、provided、runtime、test，区别在于编译/测试/运行三个阶段是否可见、是否传递。理解关键：编译期可见决定能不能 import，运行期可见决定部署后能不能用。

3. **依赖冲突怎么解决？** 默认按最短路径优先、先声明优先选择版本，可用 `mvn dependency:tree` 定位后 `<exclusion>` 排除或直接锁定版本。

4. **`package` 和 `install` 的区别？** package 只打包到 target；install 额外把包装进本地仓库，供本机其他项目引用。

5. **`dependencyManagement` 是干什么的？** 父 pom 中统一声明依赖版本但不真正引入，子模块继承后引入依赖可省略 version，实现版本统一管理。

6. **聚合和继承的区别？** 继承是子模块向上复用父 pom 配置（parent）；聚合是父 pom 向下统一构建子模块（modules）。两者职责不同，常一起用。

7. **SNAPSHOT 和 RELEASE 的区别？** SNAPSHOT 不稳定、每次构建拉最新、可覆盖；RELEASE 稳定、缓存后不重复下载、不可改。构建可复现是选用 RELEASE 的核心原因。

8. **Spring Boot 为什么能打可执行 jar？** 靠 `spring-boot-maven-plugin` 的 `repackage` goal 额外绑定到 package phase，把依赖解包进 `BOOT-INF/lib` 并改写 main-class，生成 fat jar。

---

## 相关链接

- [Spring](/learn_backend/java/基础/Spring)：IoC 容器就是 Maven 拉下来的 spring-context 包干的事
- [Spring Boot](/learn_backend/java/基础/Spring Boot)：用 starter 和 parent 进一步封装了 Maven 依赖管理
- [Java 集合](/learn_backend/java/Java核心/Java集合)：JDK 源码同样由 Maven 管理构建
- [JVM](/learn_backend/java/Java核心/JVM)：Maven 编译产出的 class 文件就是 JVM 加载的字节码
