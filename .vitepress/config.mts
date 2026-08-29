import path from "path";
import { text } from "stream/consumers";
import { defineConfig } from "vitepress";
// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'SOK',
  description: 'Seasons on the Keyboard',

  themeConfig: {
    search: { provider: 'local' },
    outline: {
      level: 'deep', // 只显示 H2 和 H3
      label: '目录',
    },
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '首页', link: '/' },
      {
        text: '前端知识',
        items: [
          {
            text: 'CSS',
            link: '/learn_frontend/css/盒模型及其样式设置/盒模型',
          },
          {
            text: 'SCSS',
            link: '/learn_frontend/scss/基本介绍',
          },
          {
            text: 'Javascript',
            link: '/learn_frontend/javascript/语法基础/数据类型',
          },
          {
            text: 'Typescript',
            link: '/learn_frontend/typescript/起步/基本介绍',
          },
          {
            text: 'Axios',
            link: '/learn_frontend/axios/起步/基本介绍',
          },
          {
            text: 'Vue3',
            items: [
              {
                text: 'vue3',
                link: '/learn_frontend/vue3/起步/简介',
              },
              {
                text: 'vue3.4源码',
                link: '/learn_frontend/vue3.4源码/响应式原理/前言',
              },
              {
                text: 'pinia',
                link: '/learn_frontend/pinia/基本概念',
              },
            ],
          },
          {
            text: 'React',
            items: [
              {
                text: 'React基础',
                link: '/learn_frontend/react/react基础/Jsx',
              },
            ],
          },
          {
            text: '版本库管理',
            items: [
              {
                text: 'Git',
                link: '/learn_frontend/git/最佳实践',
              },
              {
                text: 'husky',
                link: '/learn_frontend/git/最佳实践',
              },
              {
                text: 'lint-staged',
                link: '/learn_frontend/git/最佳实践',
              },
              {
                text: 'commitizen',
                link: '/learn_frontend/git/最佳实践',
              },
            ],
          },
          {
            text: '多端开发',
            items: [
              {
                text: 'electron',
                link: '/learn_frontend/electron/核心概念/起步.md',
              },
            ],
          },
          {
            text: '打包工具',
            items: [
              {
                text: 'rollup',
                link: '/learn_frontend/rollup/起步/基本概念',
              },
              {
                text: 'webpack',
                link: '/learn_frontend/webpack/webpack',
              },
            ],
          },
          {
            text: '包管理器',
            items: [
              {
                text: 'pnpm',
                link: '/learn_frontend/pnpm/基本介绍/初衷',
              },
            ],
          },
          {
            text: '架构方案',
            items: [
              {
                text: 'monorepo架构',
                link: '/learn_frontend/monorepo/monorepo工程管理',
              },
            ],
          },
          {
            text: '开发规范',
            items: [
              {
                text: 'BEM 命名规则',
                link: '/learn_frontend/norms/bem规范',
              },
              {
                text: 'prettier',
                link: '/learn_frontend/norms/prettier',
              },
            ],
          },
          {
            text: '单元测试',
            items: [
              {
                text: 'jest',
                link: '/learn_frontend/jest/起步/基本介绍',
              },
            ],
          },
          {
            text: '小工具',
            items: [
              {
                text: '视频播放器dplayer',
                link: '/learn_frontend/tools/视频播放器dplayer',
              },
              {
                text: '图片查看器v-viewer',
                link: '/learn_frontend/tools/图片查看器v-viewer',
              },
            ],
          },
          {
            text: '数据mock',
            items: [
              {
                text: 'msw',
                link: '/learn_frontend/msw/模拟HTTP/起步',
              },
              {
                text: 'faker',
                link: '/learn_frontend/faker/起步',
              },
            ],
          },
          {
            text: '命令行交互',
            items: [
              {
                text: 'minimist',
                link: '/learn_frontend/minimist/minimist',
              },
            ],
          },
          {
            text: '浏览器原理',
            items: [
              {
                text: '浏览器渲染原理',
                link: '/learn_frontend/browser/browser基础/浏览器渲染原理',
              },
            ],
          },
        ],
      },
      {
        text: '后端',
        items: [
          {
            text: 'node',
            link: '/learn_backend/node/基础知识/简介与安装',
          },
          {
            text: 'Java',
            link: '/learn_backend/java/基础/Maven',
          },
          {
            text: 'Python',
            link: '/learn_backend/python/Python基础',
          },
        ],
      },
      {
        text: '项目实战',
        items: [
          {
            text: '路线总览',
            link: '/learn_project/00-路线总览',
          },
          {
            text: '课程商城 (Java)',
            link: '/learn_project/course-mall/Day01-项目搭建',
          },
          {
            text: '课程商城 (Flutter)',
            link: '/learn_project/course-mall-mobile/Day01-需求架构与环境',
          },
          {
            text: '智能问答 Agent (Python)',
            link: '/learn_project/qa-agent/Day01-环境与工程骨架',
          },
        ],
      },
      {
        text: '数据库',
        items: [
          {
            text: 'MySQL',
            link: '/learn_database/MySQL',
          },
          {
            text: 'Redis',
            link: '/learn_database/Redis',
          },
          {
            text: '分库分表',
            link: '/learn_database/分库分表',
          },
        ],
      },
      {
        text: '运维',
        link: '/learn_maintenance/Docker',
      },
      {
        text: '软件架构',
        items: [
          {
            text: 'DesignPattern',
            link: '/learn_sofrwareArchitecture/designPattern/designPattern基础/设计模式七大原则',
          },
        ],
      },
      {
        text: '408',
        items: [
          {
            text: '数据结构',
            link: '/learn_408/数据结构/线性结构/顺序表',
          },
          {
            text: '计算机网络',
            link: '/learn_408/计算机网络/面试题/XSS跨站脚本攻击',
          },
        ],
      },
      {
        text: 'AI',
        items: [
          {
            text: 'claude code',
            link: '/learn_ai/claude code/基本介绍.md',
          },
          {
            text: 'AI Agent',
            link: '/learn_ai/agent/LLM基础',
          },
        ],
      },
      {
        text: '算法',
        link: '/learn_algorithm/数组.md',
      },
      { text: '分享生活', link: '/shred_life/森海塞尔momentum4' },
    ],

    sidebar: {
      '/learn_backend/java/': [
        {
          text: 'Java核心',
          items: [
            { text: '枚举', link: '/learn_backend/java/Java核心/枚举' },
            { text: '注解', link: '/learn_backend/java/Java核心/注解' },
            { text: '异常', link: '/learn_backend/java/Java核心/异常' },
            { text: 'Java集合', link: '/learn_backend/java/Java核心/Java集合' },
            { text: 'JVM', link: '/learn_backend/java/Java核心/JVM' },
            { text: '并发编程', link: '/learn_backend/java/Java核心/并发编程' },
          ],
        },
        {
          text: '基础',
          items: [
            { text: 'Maven', link: '/learn_backend/java/基础/Maven' },
            { text: 'Spring', link: '/learn_backend/java/基础/Spring' },
            { text: 'Spring MVC', link: '/learn_backend/java/基础/Spring MVC' },
            { text: 'MyBatis', link: '/learn_backend/java/基础/MyBatis' },
            {
              text: 'Spring Boot',
              link: '/learn_backend/java/基础/Spring Boot',
            },
            {
              text: 'MyBatis-Plus',
              link: '/learn_backend/java/基础/MyBatis-Plus',
            },
            {
              text: 'Spring Security',
              link: '/learn_backend/java/基础/Spring Security',
            },
          ],
        },
        {
          text: '微服务',
          items: [
            {
              text: 'Spring Cloud',
              link: '/learn_backend/java/微服务/Spring Cloud',
            },
            { text: 'Nacos', link: '/learn_backend/java/微服务/Nacos' },
            { text: 'OpenFeign', link: '/learn_backend/java/微服务/OpenFeign' },
            { text: 'Gateway', link: '/learn_backend/java/微服务/Gateway' },
            { text: 'Sentinel', link: '/learn_backend/java/微服务/Sentinel' },
            { text: 'Seata', link: '/learn_backend/java/微服务/Seata' },
            { text: 'RocketMQ', link: '/learn_backend/java/微服务/RocketMQ' },
            { text: 'Nginx', link: '/learn_backend/java/微服务/Nginx' },
            {
              text: 'Elasticsearch',
              link: '/learn_backend/java/微服务/Elasticsearch',
            },
            {
              text: '分布式基础',
              link: '/learn_backend/java/微服务/分布式基础',
            },
          ],
        },
        {
          text: '工具',
          items: [
            { text: 'RedisTemplate', link: '/learn_backend/java/工具/RedisTemplate' },
            { text: 'Lombok', link: '/learn_backend/java/工具/Lombok' },
            { text: 'MapStruct', link: '/learn_backend/java/工具/MapStruct' },
            { text: 'Knife4j', link: '/learn_backend/java/工具/Knife4j' },
            { text: 'Quartz', link: '/learn_backend/java/工具/Quartz' },
          ],
        },
      ],
      '/learn_backend/python/': [
        { text: 'Python基础', link: '/learn_backend/python/Python基础' },
        { text: 'FastAPI', link: '/learn_backend/python/FastAPI' },
      ],
      '/learn_database/': [
        { text: 'MySQL', link: '/learn_database/MySQL' },
        { text: 'Redis', link: '/learn_database/Redis' },
        { text: '分库分表', link: '/learn_database/分库分表' },
      ],
      '/learn_maintenance/': [
        { text: 'Docker', link: '/learn_maintenance/Docker' },
      ],
      '/learn_project/course-mall/': [
        { text: '路线总览', link: '/learn_project/00-路线总览' },
        { text: '每日面试', link: '/learn_project/每日面试' },
        {
          text: '课程商城 (Java)',
          collapsed: true,
          items: [
            {
              text: 'Day01 项目搭建',
              link: '/learn_project/course-mall/Day01-项目搭建',
            },
            {
              text: 'Day02 数据库设计',
              link: '/learn_project/course-mall/Day02-数据库设计',
            },
            {
              text: 'Day03 用户服务',
              link: '/learn_project/course-mall/Day03-用户服务',
            },
            {
              text: 'Day04 登录认证与授权',
              link: '/learn_project/course-mall/Day04-登录鉴权',
            },
            {
              text: 'Day05 验证码与会话续期',
              link: '/learn_project/course-mall/Day05-验证码',
            },
            {
              text: 'Day06 课程服务',
              link: '/learn_project/course-mall/Day06-课程服务',
            },
            {
              text: 'Day07 讲师分类',
              link: '/learn_project/course-mall/Day07-讲师分类',
            },
            {
              text: 'Day08 课程缓存',
              link: '/learn_project/course-mall/Day08-课程缓存',
            },
            {
              text: 'Day09 文件上传',
              link: '/learn_project/course-mall/Day09-文件上传',
            },
            {
              text: 'Day10 订单服务',
              link: '/learn_project/course-mall/Day10-订单服务',
            },
            {
              text: 'Day11 库存服务',
              link: '/learn_project/course-mall/Day11-库存服务',
            },
            {
              text: 'Day12 支付对接',
              link: '/learn_project/course-mall/Day12-支付对接',
            },
            {
              text: 'Day13 服务拆分',
              link: '/learn_project/course-mall/Day13-服务拆分',
            },
            {
              text: 'Day14 配置中心',
              link: '/learn_project/course-mall/Day14-配置中心',
            },
            {
              text: 'Day15 远程调用',
              link: '/learn_project/course-mall/Day15-远程调用',
            },
            {
              text: 'Day16 网关',
              link: '/learn_project/course-mall/Day16-网关',
            },
            {
              text: 'Day17 熔断限流',
              link: '/learn_project/course-mall/Day17-熔断限流',
            },
            {
              text: 'Day18 治理收尾',
              link: '/learn_project/course-mall/Day18-治理收尾',
            },
            {
              text: 'Day19 秒杀上',
              link: '/learn_project/course-mall/Day19-秒杀上',
            },
            {
              text: 'Day20 秒杀下',
              link: '/learn_project/course-mall/Day20-秒杀下',
            },
            {
              text: 'Day21 MQ上',
              link: '/learn_project/course-mall/Day21-MQ上',
            },
            {
              text: 'Day22 MQ下',
              link: '/learn_project/course-mall/Day22-MQ下',
            },
            {
              text: 'Day23 分布式事务',
              link: '/learn_project/course-mall/Day23-分布式事务',
            },
            {
              text: 'Day24 分库分表',
              link: '/learn_project/course-mall/Day24-分库分表',
            },
            {
              text: 'Day25 搜索上',
              link: '/learn_project/course-mall/Day25-搜索上',
            },
            {
              text: 'Day26 搜索下',
              link: '/learn_project/course-mall/Day26-搜索下',
            },
            {
              text: 'Day27 容器化',
              link: '/learn_project/course-mall/Day27-容器化',
            },
            {
              text: 'Day28 反向代理',
              link: '/learn_project/course-mall/Day28-反向代理',
            },
            {
              text: 'Day29 压测优化',
              link: '/learn_project/course-mall/Day29-压测优化',
            },
            {
              text: 'Day30 复盘',
              link: '/learn_project/course-mall/Day30-复盘',
            },
            {
              text: 'Day31 WebSocket基础',
              link: '/learn_project/course-mall/Day31-WebSocket基础',
            },
            {
              text: 'Day32 WebSocket实战',
              link: '/learn_project/course-mall/Day32-WebSocket实战',
            },
            {
              text: 'Day33 视频上传',
              link: '/learn_project/course-mall/Day33-视频上传',
            },
            {
              text: 'Day34 视频播放',
              link: '/learn_project/course-mall/Day34-视频播放',
            },
            {
              text: 'Day35 直播房间',
              link: '/learn_project/course-mall/Day35-直播房间',
            },
            {
              text: 'Day36 直播互动',
              link: '/learn_project/course-mall/Day36-直播互动',
            },
            {
              text: 'Day37 Flowable入门',
              link: '/learn_project/course-mall/Day37-Flowable入门',
            },
            {
              text: 'Day38 工作流实战',
              link: '/learn_project/course-mall/Day38-工作流实战',
            },
            {
              text: 'Day39 OAuth2与OIDC',
              link: '/learn_project/course-mall/Day39-OAuth2与OIDC第三方登录',
            },
          ],
        },
      ],
      '/learn_project/course-mall-mobile/': [
        { text: '路线总览', link: '/learn_project/00-路线总览' },
        { text: '每日面试', link: '/learn_project/每日面试' },
        {
          text: '课程商城 (Flutter)',
          collapsed: false,
          items: [
            { text: 'Day01 需求架构与环境', link: '/learn_project/course-mall-mobile/Day01-需求架构与环境' },
            { text: 'Day02 工程规范与多环境', link: '/learn_project/course-mall-mobile/Day02-工程规范与多环境' },
            { text: 'Day03 设计系统与适配', link: '/learn_project/course-mall-mobile/Day03-设计系统与适配' },
            { text: 'Day04 路由与权限边界', link: '/learn_project/course-mall-mobile/Day04-路由导航与权限边界' },
            { text: 'Day05 Dio 网络层', link: '/learn_project/course-mall-mobile/Day05-接口契约与Dio网络层' },
            { text: 'Day06 Riverpod 状态管理', link: '/learn_project/course-mall-mobile/Day06-Riverpod状态管理与依赖注入' },
            { text: 'Day07 登录注册与表单', link: '/learn_project/course-mall-mobile/Day07-登录注册与表单校验' },
            { text: 'Day08 Token 生命周期', link: '/learn_project/course-mall-mobile/Day08-Token生命周期与会话安全' },
            { text: 'Day09 首页分类与分页', link: '/learn_project/course-mall-mobile/Day09-首页分类与课程分页' },
            { text: 'Day10 搜索筛选与竞态', link: '/learn_project/course-mall-mobile/Day10-搜索筛选与竞态处理' },
            { text: 'Day11 课程详情与章节', link: '/learn_project/course-mall-mobile/Day11-课程详情章节收藏与分享' },
            { text: 'Day12 订单创建与幂等', link: '/learn_project/course-mall-mobile/Day12-订单确认创建与幂等' },
            { text: 'Day13 订单取消与退款', link: '/learn_project/course-mall-mobile/Day13-订单中心取消与退款' },
            { text: 'Day14 支付回跳与核验', link: '/learn_project/course-mall-mobile/Day14-支付回跳与结果核验' },
            { text: 'Day15 学习中心与进度', link: '/learn_project/course-mall-mobile/Day15-学习中心与进度总览' },
            { text: 'Day16 视频与进度上报', link: '/learn_project/course-mall-mobile/Day16-视频播放HLS与进度上报' },
            { text: 'Day17 STOMP 实时消息', link: '/learn_project/course-mall-mobile/Day17-STOMP实时消息与重连' },
            { text: 'Day18 推送与 Deep Link', link: '/learn_project/course-mall-mobile/Day18-推送通知与DeepLink' },
            { text: 'Day19 Drift 离线队列', link: '/learn_project/course-mall-mobile/Day19-离线缓存Drift与任务队列' },
            { text: 'Day20 图片直传与权限', link: '/learn_project/course-mall-mobile/Day20-图片选择直传与权限' },
            { text: 'Day21 生物识别与平台通道', link: '/learn_project/course-mall-mobile/Day21-生物识别生命周期与平台通道' },
            { text: 'Day22 国际化与无障碍', link: '/learn_project/course-mall-mobile/Day22-国际化深色模式与无障碍' },
            { text: 'Day23 性能与内存', link: '/learn_project/course-mall-mobile/Day23-性能分析启动与内存' },
            { text: 'Day24 移动端安全审计', link: '/learn_project/course-mall-mobile/Day24-移动端安全审计与威胁模型' },
            { text: 'Day25 单元与 Widget 测试', link: '/learn_project/course-mall-mobile/Day25-单元Widget与网络测试' },
            { text: 'Day26 集成与 OpenAPI', link: '/learn_project/course-mall-mobile/Day26-集成测试与OpenAPI契约' },
            { text: 'Day27 Sentry 与链路', link: '/learn_project/course-mall-mobile/Day27-Sentry日志链路与埋点' },
            { text: 'Day28 Flavor 与双端构建', link: '/learn_project/course-mall-mobile/Day28-Flavors签名与双平台构建' },
            { text: 'Day29 CI/CD 与灰度', link: '/learn_project/course-mall-mobile/Day29-CICD灰度发布与回滚' },
            { text: 'Day30 验收与面试答辩', link: '/learn_project/course-mall-mobile/Day30-验收简历与面试答辩' },
          ],
        },
      ],
      '/learn_project/qa-agent/': [
        { text: '路线总览', link: '/learn_project/00-路线总览' },
        { text: '每日面试', link: '/learn_project/每日面试' },
        {
          text: '智能问答 Agent (Python)',
          collapsed: false,
          items: [
            {
              text: 'Day01 环境与工程骨架',
              link: '/learn_project/qa-agent/Day01-环境与工程骨架',
            },
            { text: 'Day02 FastAPI 路由与模型', link: '/learn_project/qa-agent/Day02-FastAPI路由与数据模型' },
            { text: 'Day03 中间件异常与上传', link: '/learn_project/qa-agent/Day03-中间件异常与文件上传' },
            { text: 'Day04 LLM 与流式输出', link: '/learn_project/qa-agent/Day04-接入LLM与流式输出' },
            { text: 'Day05 Prompt 与多轮对话', link: '/learn_project/qa-agent/Day05-Prompt与多轮对话' },
            { text: 'Day06 会话记忆与摘要', link: '/learn_project/qa-agent/Day06-会话记忆与摘要压缩' },
            { text: 'Day07 Function Calling', link: '/learn_project/qa-agent/Day07-FunctionCalling工具循环' },
            { text: 'Day08 工具重试与并行', link: '/learn_project/qa-agent/Day08-工具校验重试与并行' },
            { text: 'Day09 文档加载与切分', link: '/learn_project/qa-agent/Day09-RAG文档加载与切分' },
            { text: 'Day10 Embedding 与检索', link: '/learn_project/qa-agent/Day10-Embedding与语义检索' },
            { text: 'Day11 Chroma 持久化', link: '/learn_project/qa-agent/Day11-Chroma向量库与持久化' },
            { text: 'Day12 混合检索与 RRF', link: '/learn_project/qa-agent/Day12-混合检索与RRF融合' },
            { text: 'Day13 Rerank 与引用', link: '/learn_project/qa-agent/Day13-Rerank与引用溯源' },
            { text: 'Day14 完整 RAG 链路', link: '/learn_project/qa-agent/Day14-完整RAG问答链路' },
            { text: 'Day15 查询改写与多路召回', link: '/learn_project/qa-agent/Day15-查询改写与多路召回' },
            { text: 'Day16 RAG 评估与回归', link: '/learn_project/qa-agent/Day16-RAG评估与回归测试' },
            { text: 'Day17 LangChain 与 LCEL', link: '/learn_project/qa-agent/Day17-LangChain与LCEL' },
            { text: 'Day18 结构化输出与观测', link: '/learn_project/qa-agent/Day18-结构化输出与回调观测' },
            { text: 'Day19 LangGraph 状态图', link: '/learn_project/qa-agent/Day19-LangGraph状态图' },
            { text: 'Day20 Checkpoint 与人工确认', link: '/learn_project/qa-agent/Day20-Checkpoint与人工确认' },
            { text: 'Day21 ReAct 与计划执行', link: '/learn_project/qa-agent/Day21-ReAct与计划执行' },
            { text: 'Day22 多 Agent 协作', link: '/learn_project/qa-agent/Day22-多Agent路由与协作' },
            { text: 'Day23 MCP 服务与客户端', link: '/learn_project/qa-agent/Day23-MCP服务与客户端' },
            { text: 'Day24 RAG + MCP + LangGraph', link: '/learn_project/qa-agent/Day24-RAG工具与LangGraph整合' },
            { text: 'Day25 SSE 流式聊天前端', link: '/learn_project/qa-agent/Day25-SSE流式聊天前端' },
            { text: 'Day26 多模式工作台', link: '/learn_project/qa-agent/Day26-多模式工作台与引用展示' },
            { text: 'Day27 SQLAlchemy 与迁移', link: '/learn_project/qa-agent/Day27-SQLAlchemy会话持久化与迁移' },
            { text: 'Day28 Redis 缓存与限流', link: '/learn_project/qa-agent/Day28-Redis缓存限流与降级' },
            { text: 'Day29 Docker Compose 部署', link: '/learn_project/qa-agent/Day29-DockerCompose部署与健康检查' },
            { text: 'Day30 CI 与面试答辩', link: '/learn_project/qa-agent/Day30-CI验收与面试答辩' },
          ],
        },
      ],
      '/learn_project/': [
        {
          text: '项目导航',
          items: [
            { text: '路线总览', link: '/learn_project/00-路线总览' },
            { text: '每日面试', link: '/learn_project/每日面试' },
            { text: '课程商城 (Java)', link: '/learn_project/course-mall/Day01-项目搭建' },
            { text: '课程商城 (Flutter)', link: '/learn_project/course-mall-mobile/Day01-需求架构与环境' },
            { text: '智能问答 Agent (Python)', link: '/learn_project/qa-agent/Day01-环境与工程骨架' },
          ],
        },
      ],
      '/learn_ai/agent/': [
        { text: 'LLM基础', link: '/learn_ai/agent/LLM基础' },
        { text: 'Function Calling', link: '/learn_ai/agent/Function Calling' },
        { text: 'RAG', link: '/learn_ai/agent/RAG' },
        { text: '向量数据库', link: '/learn_ai/agent/向量数据库' },
        { text: 'LangChain', link: '/learn_ai/agent/LangChain' },
        { text: 'LangGraph', link: '/learn_ai/agent/LangGraph' },
        { text: 'MCP', link: '/learn_ai/agent/MCP' },
        { text: 'Agent编排', link: '/learn_ai/agent/Agent编排' },
        { text: '流式输出', link: '/learn_ai/agent/流式输出' },
      ],
      '/learn_ai/claude code': [
        {
          text: '基本介绍',
          link: '/learn_ai/claude code/基本介绍',
        },
        {
          text: '工作原理',
          link: '/learn_ai/claude code/工作原理',
        },
      ],
      '/learn_backend/node': [
        {
          text: '基础知识',
          items: [
            {
              text: '简介与安装',
              link: '/learn_backend/node/基础知识/简介与安装',
            },
            {
              text: '模块化开发',
              link: '/learn_backend/node/基础知识/模块化开发',
            },
            {
              text: '包管理工具',
              link: '/learn_backend/node/基础知识/包管理工具',
            },
            {
              text: '网络基础',
              link: '/learn_backend/node/基础知识/网络基础',
            },
          ],
        },
        {
          text: '内置模块',
          items: [
            {
              text: 'event',
              link: '/learn_backend/node/内置模块/event模块',
            },
            {
              text: 'fs模块',
              link: '/learn_backend/node/内置模块/fs模块',
            },
            {
              text: 'stream模块',
              link: '/learn_backend/node/内置模块/stream模块',
            },
            {
              text: 'path模块',
              link: '/learn_backend/node/内置模块/path模块',
            },
            {
              text: 'http模块',
              link: '/learn_backend/node/内置模块/http模块',
            },
            {
              text: 'url模块',
              link: '/learn_backend/node/内置模块/url模块',
            },
            {
              text: 'crypto模块',
              link: '/learn_backend/node/内置模块/crypto模块',
            },
            {
              text: 'buffer模块',
              link: '/learn_backend/node/内置模块/buffer模块',
            },
            {
              text: 'zlib模块',
              link: '/learn_backend/node/内置模块/zlib模块',
            },
            {
              text: 'os模块',
              link: '/learn_backend/node/内置模块/os模块',
            },
            {
              text: 'websockt模块',
              link: '/learn_backend/node/内置模块/websockt模块',
            },
          ],
        },
        {
          text: '框架学习',
          items: [
            {
              text: 'express框架',
              link: '/learn_backend/node/框架学习/express框架',
            },
            {
              text: 'ejs模板引擎',
              link: '/learn_backend/node/框架学习/ejs模版引擎',
            },
            {
              text: 'socket.io框架',
              link: '/learn_backend/node/框架学习/socketio框架',
            },
          ],
        },
        {
          text: '开发实践',
          items: [
            {
              text: '会话控制',
              link: '/learn_backend/node/开发实践/会话控制',
            },
            {
              text: '业务分层',
              link: '/learn_backend/node/开发实践/业务分层',
            },
            {
              text: 'RESTFUL',
              link: '/learn_backend/node/开发实践/RESTFUL',
            },
          ],
        },
        {
          text: '数据库操作',
          items: [
            {
              text: '操作mongodb',
              link: '/learn_backend/node/数据库操作/操作mongodb',
            },
            {
              text: '操作mysql',
              link: '/learn_backend/node/数据库操作/操作mysql',
            },
            {
              text: '操作redis',
              link: '/learn_backend/node/数据库操作/操作redis',
            },
          ],
        },
        {
          text: '小案例',
          items: [
            {
              text: '文件上传',
              link: '/learn_backend/node/小案例/文件上传',
            },
            {
              text: '记账本',
              link: '/learn_backend/node/小案例/记账本',
            },
          ],
        },
        {
          text: '小工具',
          items: [
            {
              text: '参数校验库joi',
              link: '/learn_backend/node/小工具/参数校验库joi',
            },
          ],
        },
      ],
      '/shred_life/森海塞尔momentum4': [
        {
          text: '森海塞尔momentum4',
          link: '/shred_life/森海塞尔momentum4',
        },
      ],
      '/learn_frontend/electron/': [
        {
          text: '核心概念',
          items: [
            {
              text: '起步',
              link: '/learn_frontend/electron/核心概念/起步.md',
            },
            {
              text: '进程模型',
              link: '/learn_frontend/electron/核心概念/进程模型',
            },

            {
              text: '预加载脚本',
              link: '/learn_frontend/electron/核心概念/预加载脚本',
            },
            {
              text: '上下文隔离机制',
              link: '/learn_frontend/electron/核心概念/上下文隔离机制',
            },
            {
              text: '进程通信',
              link: '/learn_frontend/electron/核心概念/进程通信',
            },
            {
              text: '进程沙盒化',
              link: '/learn_frontend/electron/核心概念/进程沙盒化',
            },
            {
              text: 'MessagePorts',
              link: '/learn_frontend/electron/核心概念/MessagePorts',
            },

            {
              text: '打包分发程序',
              link: '/learn_frontend/electron/核心概念/打包分发程序',
            },
            {
              text: '发布和更新',
              link: '/learn_frontend/electron/核心概念/发布和更新',
            },
          ],
        },
        {
          text: '案例',
          items: [],
        },
        {
          text: '小工具',
          items: [
            {
              text: '通信和窗口管理工具electron-toolkit',
              link: '/learn_frontend/electron/工具/electron-toolkit',
            },
            {
              text: '持久化存储用户设置electron-store',
              link: '/learn_frontend/electron/工具/electron-store',
            },
          ],
        },
      ],
      '/learn_frontend/git/': [
        {
          text: '最佳实践',
          link: '/learn_frontend/git/最佳实践',
        },
        {
          text: '常用命令',
          link: '/learn_frontend/git/常用命令',
        },
        {
          text: '配置管理',
          link: '/learn_frontend/git/配置管理',
        },
        {
          text: '提交规范',
          link: '/learn_frontend/git/提交规范',
        },
        {
          text: '团队协作',
          link: '/learn_frontend/git/团队协作',
        },
        {
          text: '跨团队开发',
          link: '/learn_frontend/git/跨团队开发',
        },
        {
          text: 'GIT原理',
          link: '/learn_frontend/git/GIT原理',
        },
      ],
      '/learn_frontend/vue3.4源码': [
        {
          text: '项目架构',
          items: [
            {
              text: '设计思想和原理',
              link: '/learn_frontend/vue3.4源码/项目架构/设计思想和原理',
            },
            {
              text: 'monorepo架构',
              link: '/learn_frontend/vue3.4源码/项目架构/monorepo架构',
            },
          ],
        },
        {
          text: '响应式原理',
          items: [
            {
              text: '前言',
              link: '/learn_frontend/vue3.4源码/响应式原理/前言',
            },
            {
              text: '副作用函数effect',
              link: '/learn_frontend/vue3.4源码/响应式原理/副作用函数effect',
            },
            {
              text: '依赖追踪',
              link: '/learn_frontend/vue3.4源码/响应式原理/依赖追踪track',
            },
            {
              text: '实现ref',
              link: '/learn_frontend/vue3.4源码/响应式原理/实现ref',
            },
            {
              text: '实现computed',
              link: '/learn_frontend/vue3.4源码/响应式原理/实现computed',
            },
            {
              text: '实现watch和watchEffect',
              link: '/learn_frontend/vue3.4源码/响应式原理/实现watch和watchEffect',
            },
            {
              text: '总结响应式原理',
              link: '/learn_frontend/vue3.4源码/响应式原理/响应式原理总结',
            },
          ],
        },
        {
          text: '运行时核心',
          items: [
            {
              text: '虚拟DOM',
              link: '/learn_frontend/vue3.4源码/运行时核心/虚拟DOM',
            },
            {
              text: '渲染器',
              link: '/learn_frontend/vue3.4源码/运行时核心/渲染器',
            },
            {
              text: 'render函数',
              link: '/learn_frontend/vue3.4源码/运行时核心/render函数',
            },
            {
              text: 'diff算法',
              link: '/learn_frontend/vue3.4源码/运行时核心/diff算法',
            },
            {
              text: 'setup函数',
              link: '/learn_frontend/vue3.4源码/运行时核心/setup函数',
            },

            {
              text: '依赖注入实现',
              link: '/learn_frontend/vue3.4源码/运行时核心/依赖注入实现',
            },
            {
              text: '生命周期原理',
              link: '/learn_frontend/vue3.4源码/运行时核心/生命周期原理',
            },
            {
              text: '模板引用ref',
              link: '/learn_frontend/vue3.4源码/运行时核心/模板引用ref',
            },
            {
              text: '内置组件',
              link: '/learn_frontend/vue3.4源码/运行时核心/内置组件',
            },
            {
              text: '异步组件',
              link: '/learn_frontend/vue3.4源码/运行时核心/异步组件',
            },
            {
              text: '指令实现',
              link: '/learn_frontend/vue3.4源码/运行时核心/指令实现',
            },
            {
              text: '编译优化',
              link: '/learn_frontend/vue3.4源码/运行时核心/编译优化',
            },
            {
              text: '靶向更新',
              link: '/learn_frontend/vue3.4源码/运行时核心/靶向更新',
            },
          ],
        },
        {
          text: '编译核心',
          items: [
            {
              text: '编译原理',
              link: '/learn_frontend/vue3.4源码/编译核心/编译原理',
            },
          ],
        },
      ],
      '/learn_frontend/css/': [
        {
          text: '盒模型及其样式设置',
          collapsed: true,
          items: [
            {
              text: '盒模型',
              link: '/learn_frontend/css/盒模型及其样式设置/盒模型',
            },
            {
              text: '包含块',
              link: '/learn_frontend/css/盒模型及其样式设置/包含块',
            },
            {
              text: '边框和轮廓',
              link: '/learn_frontend/css/盒模型及其样式设置/边框和轮廓',
            },
            {
              text: '溢出效果',
              link: '/learn_frontend/css/盒模型及其样式设置/溢出效果',
            },
            {
              text: '元素隐藏的几种方式',
              link: '/learn_frontend/css/盒模型及其样式设置/元素隐藏的几种方式',
            },
          ],
        },
        {
          text: '文本字体',
          collapsed: true,
          items: [
            {
              text: '文本字体',
              link: '/learn_frontend/css/文本字体/文本字体',
            },
            {
              text: '字体图标引入方式',
              link: '/learn_frontend/css/文本字体/字体图标引入方式',
            },
          ],
        },
        {
          text: '背景和图片',
          collapsed: true,
          items: [
            {
              text: '背景',
              link: '/learn_frontend/css/背景和图片/背景',
            },
            {
              text: 'CSS3-图片',
              link: '/learn_frontend/css/背景和图片/CSS3-图片',
            },
            {
              text: 'CSS3-渐变',
              link: '/learn_frontend/css/背景和图片/CSS3-渐变',
            },
          ],
        },
        {
          text: '变换和动画',
          collapsed: true,
          items: [
            {
              text: 'CSS3-变换',
              link: '/learn_frontend/css/变换和动画/CSS3-变换',
            },
            {
              text: 'CSS3-过渡和动画',
              link: '/learn_frontend/css/变换和动画/CSS3-过渡和动画',
            },
          ],
        },
        {
          text: '定位和布局',
          collapsed: true,
          items: [
            {
              text: '关于浮动',
              link: '/learn_frontend/css/定位和布局/关于浮动',
            },
            {
              text: '定位',
              link: '/learn_frontend/css/定位和布局/定位',
            },
            {
              text: 'BFC机制',
              link: '/learn_frontend/css/定位和布局/BFC机制',
            },

            {
              text: '元素居中方法',
              link: '/learn_frontend/css/定位和布局/元素居中的方法',
            },

            {
              text: 'CSS3-弹性布局Flex',
              link: '/learn_frontend/css/定位和布局/CSS3-弹性布局Flex',
            },
            {
              text: 'CSS3-网格布局Gird',
              link: '/learn_frontend/css/定位和布局/CSS3-网格布局Grid',
            },
            {
              text: '常见布局方案',
              link: '/learn_frontend/css/定位和布局/常见布局方案',
            },
          ],
        },
        {
          text: '响应式',
          collapsed: true,
          items: [
            {
              text: '响应式设计',
              link: '/learn_frontend/css/响应式/响应式设计',
            },
            {
              text: 'CSS3-媒体查询',
              link: '/learn_frontend/css/响应式/CSS3-媒体查询',
            },
          ],
        },
        {
          text: '元素选择',
          collapsed: true,
          items: [
            {
              text: '选择器',
              link: '/learn_frontend/css/元素选择/选择器',
            },
          ],
        },
        {
          text: '变量',
          collapsed: true,
          items: [{ text: '变量', link: '/learn_frontend/css/变量/变量' }],
        },
        {
          text: '面试题',
          collapsed: true,
          items: [
            {
              text: '设备像素',
              link: '/learn_frontend/css/面试题/设备像素',
            },
            {
              text: 'em和rem等的区别',
              link: '/learn_frontend/css/面试题/em和rem等的区别',
            },
            {
              text: 'chrome中设置小于12px字体',
              link: '/learn_frontend/css/面试题/chrome小于12px字体的方式有哪些',
            },
            {
              text: 'css性能优化',
              link: '/learn_frontend/css/面试题/css性能优化',
            },
          ],
        },
        {
          text: '小案例',
          collapsed: true,
          items: [
            {
              text: '视差滚动',
              link: '/learn_frontend/css/小案例/视差滚动',
            },
            {
              text: '画一个三角形',
              link: '/learn_frontend/css/小案例/画一个三角形',
            },
          ],
        },
      ],
      '/learn_frontend/javascript/': [
        {
          text: '语法基础',
          collapsed: true,
          items: [
            {
              text: '数据类型',
              link: '/learn_frontend/javascript/语法基础/数据类型',
            },
            {
              text: '类型转换',
              link: '/learn_frontend/javascript/语法基础/类型转换',
            },
            {
              text: '表达式与操作符',
              link: '/learn_frontend/javascript/语法基础/表达式与操作符',
            },
          ],
        },
        {
          text: '面向对象',
          collapsed: true,
          items: [
            {
              text: '对象',
              link: '/learn_frontend/javascript/面向对象/对象',
            },
            {
              text: '数组基础',
              link: '/learn_frontend/javascript/面向对象/数组基础',
            },
            {
              text: '数组进阶',
              link: '/learn_frontend/javascript/面向对象/数组进阶',
            },
            {
              text: '函数基础',
              link: '/learn_frontend/javascript/面向对象/函数基础',
            },
            {
              text: '函数进阶',
              link: '/learn_frontend/javascript/面向对象/函数进阶',
            },
            {
              text: '原型链',
              link: '/learn_frontend/javascript/面向对象/原型链',
            },
            {
              text: '多种继承方式',
              link: '/learn_frontend/javascript/面向对象/多种继承方式',
            },
            {
              text: '类的本质',
              link: '/learn_frontend/javascript/面向对象/类的本质',
            },
          ],
        },

        {
          text: '标准库',
          collapsed: true,
          items: [
            {
              text: '映射与集合',
              link: '/learn_frontend/javascript/标准库/映射与集合',
            },
            {
              text: '定型数组',
              link: '/learn_frontend/javascript/标准库/定型数组',
            },
            {
              text: '正则表达式',
              link: '/learn_frontend/javascript/标准库/正则表达式',
            },
            {
              text: '日期与时间',
              link: '/learn_frontend/javascript/标准库/日期与时间',
            },
            {
              text: 'Error类',
              link: '/learn_frontend/javascript/标准库/Error类',
            },
            {
              text: 'JSON 序列化与解析',
              link: '/learn_frontend/javascript/标准库/JSON 序列化与解析',
            },
            {
              text: '字符串相关操作',
              link: '/learn_frontend/javascript/标准库/字符串相关操作',
            },
            {
              text: 'Math API',
              link: '/learn_frontend/javascript/标准库/Math API',
            },
            {
              text: 'URL API',
              link: '/learn_frontend/javascript/标准库/URL API',
            },
            {
              text: '定时器',
              link: '/learn_frontend/javascript/标准库/定时器',
            },
          ],
        },
        {
          text: '元编程',
          collapsed: true,
          items: [
            {
              text: '元编程',
              link: '/learn_frontend/javascript/元编程/元编程',
            },
          ],
        },
        {
          text: '事件',
          collapsed: true,
          items: [
            {
              text: '事件基础',
              link: '/learn_frontend/javascript/事件/事件基础',
            },
            {
              text: '事件循环',
              link: '/learn_frontend/javascript/事件/事件循环',
            },
            {
              text: '新事件循环',
              link: '/learn_frontend/javascript/事件/新事件循环',
            },
          ],
        },
        {
          text: '网络与异步编程',
          collapsed: true,
          items: [
            {
              text: '基于回调的异步编程技术',
              link: '/learn_frontend/javascript/网络与异步编程/基于回调的异步编程技术',
            },
            {
              text: '基于期约链的异步编程技术',
              link: '/learn_frontend/javascript/网络与异步编程/基于期约链的异步编程技术',
            },
            {
              text: '手写Promise',
              link: '/learn_frontend/javascript/网络与异步编程/手写Promise',
            },
            {
              text: '使用fetch发送网络请求',
              link: '/learn_frontend/javascript/网络与异步编程/使用fetch发送网络请求',
            },
            {
              text: '同源策略',
              link: '/learn_frontend/javascript/网络与异步编程/同源策略',
            },
          ],
        },
        {
          text: '迭代器和生成器',
          collapsed: true,
          items: [
            {
              text: '迭代器和生成器',
              link: '/learn_frontend/javascript/迭代器生成器/迭代器和生成器',
            },
            {
              text: '异步迭代器和生成器',
              link: '/learn_frontend/javascript/迭代器生成器/异步迭代器与生成器',
            },
          ],
        },
        {
          text: '存储',
          collapsed: true,
          items: [
            {
              text: 'localStorage和sessionStorage',
              link: '/learn_frontend/javascript/存储/localStorage和sessionStorage',
            },
            {
              text: 'cookie',
              link: '/learn_frontend/javascript/存储/cookie',
            },
            {
              text: 'IndexedDB',
              link: '/learn_frontend/javascript/存储/IndexedDB',
            },
          ],
        },
        {
          text: '模块化',
          collapsed: true,
          items: [
            {
              text: '模块化',
              link: '/learn_frontend/javascript/模块化/模块化',
            },
          ],
        },
        {
          text: 'DOM',
          collapsed: true,
          items: [
            {
              text: '节点的基本操作',
              link: '/learn_frontend/javascript/DOM/节点的基本操作',
            },
            {
              text: '节点属性的基本操作',
              link: '/learn_frontend/javascript/DOM/节点属性的基本操作',
            },
            {
              text: '元素内容的基本操作',
              link: '/learn_frontend/javascript/DOM/元素内容的基本操作',
            },
            {
              text: '节点样式的基本操作',
              link: '/learn_frontend/javascript/DOM/节点样式的基本操作',
            },
            {
              text: '进阶知识',
              link: '/learn_frontend/javascript/DOM/进阶知识',
            },
            {
              text: 'DOM补充',
              link: '/learn_frontend/javascript/DOM/补充知识',
            },
          ],
        },
        {
          text: 'BOM',
          collapsed: true,
          items: [
            {
              text: 'window',
              link: '/learn_frontend/javascript/BOM/window',
            },
            {
              text: 'location',
              link: '/learn_frontend/javascript/BOM/location',
            },
            {
              text: 'history',
              link: '/learn_frontend/javascript/BOM/history',
            },
            {
              text: 'location与history的相互作用',
              link: '/learn_frontend/javascript/BOM/location与history的相互作用',
            },
            {
              text: 'screen',
              link: '/learn_frontend/javascript/BOM/screen',
            },
            {
              text: 'navigator',
              link: '/learn_frontend/javascript/BOM/navigator',
            },

            {
              text: 'BOM补充',
              link: '/learn_frontend/javascript/BOM/补充知识',
            },
          ],
        },
        {
          text: 'ES6-ES13',
          collapsed: true,
          items: [
            {
              text: 'ES6新特性',
              link: '/learn_frontend/javascript/ES6-ES13新特性/ES6新特性',
            },
          ],
        },
        {
          text: '内存管理',
          collapsed: true,
          items: [
            {
              text: '垃圾回收机制',
              link: '/learn_frontend/javascript/内存管理/垃圾回收机制',
            },
          ],
        },
        {
          text: '多线程',
          collapsed: true,
          items: [
            {
              text: 'Web Worker',
              link: '/learn_frontend/javascript/多线程/Web Worker',
            },
          ],
        },
        {
          text: '执行上下文',
          collapsed: true,
          items: [
            {
              text: 'ES3执行上下文',
              link: '/learn_frontend/javascript/执行上下文/ES3执行上下文',
            },
            {
              text: 'ES5执行上下文',
              link: '/learn_frontend/javascript/执行上下文/ES5执行上下文',
            },
            {
              text: '作用域问题',
              link: '/learn_frontend/javascript/执行上下文/作用域问题',
            },
            {
              text: 'ThisBinding',
              link: '/learn_frontend/javascript/执行上下文/ThisBinding',
            },
          ],
        },
        {
          text: '未来阅读建议',
          collapsed: true, // 默认折叠
          items: [
            {
              text: '二进制API',
              link: '/learn_frontend/javascript/未来阅读建议/二进制API',
            },
            {
              text: '移动设备API',
              link: '/learn_frontend/javascript/未来阅读建议/移动设备API',
            },
            {
              text: '媒体API',
              link: '/learn_frontend/javascript/未来阅读建议/媒体API',
            },
            {
              text: 'performance',
              link: '/learn_frontend/javascript/未来阅读建议/performance',
            },
            {
              text: 'ServiceWorker',
              link: '/learn_frontend/javascript/未来阅读建议/ServiceWorker',
            },
            {
              text: '加密及相关API',
              link: '/learn_frontend/javascript/未来阅读建议/加密及相关API',
            },
            {
              text: 'webAssembly',
              link: '/learn_frontend/javascript/未来阅读建议/webAssembly',
            },
          ],
        },
        {
          text: '面试题',
          collapsed: true,
          items: [
            {
              text: '编程风格',
              link: '/learn_frontend/javascript/面试题/编程风格',
            },

            {
              text: '防抖节流',
              link: '/learn_frontend/javascript/面试题/防抖节流',
            },
            {
              text: 'new操作符',
              link: '/learn_frontend/javascript/面试题/new操作符',
            },
            {
              text: '深拷贝和浅拷贝',
              link: '/learn_frontend/javascript/面试题/深拷贝和浅拷贝',
            },
            {
              text: '类型检测',
              link: '/learn_frontend/javascript/面试题/类型检测',
            },

            {
              text: 'ThisBinding的一些场景',
              link: '/learn_frontend/javascript/面试题/ThisBinding的一些场景',
            },
          ],
        },

        {
          text: '小案例',
          collapsed: true,
          items: [
            {
              text: '实现轮播图的两种方式',
              link: '/learn_frontend/javascript/小案例/实现轮播图',
            },
            {
              text: '实现SPA路由',
              link: '/learn_frontend/javascript/小案例/实现SPA路由',
            },
            {
              text: '实现拖拽',
              link: '/learn_frontend/javascript/小案例/(待完成)实现拖拽',
            },
            {
              text: '懒加载的实现方案',
              link: '/learn_frontend/javascript/小案例/懒加载的实现方案',
            },
          ],
        },
      ],
      '/learn_frontend/typescript/': [
        {
          text: '起步',
          collapsed: true,
          items: [
            {
              text: '环境搭建',
              link: '/learn_frontend/typescript/起步/环境搭建',
            },
            {
              text: '基本介绍',
              link: '/learn_frontend/typescript/起步/基本介绍',
            },
          ],
        },
        {
          text: '常用类型',
          collapsed: true,
          items: [
            {
              text: '原始类型',
              link: '/learn_frontend/typescript/常用类型/原始类型',
            },
            {
              text: '特殊类型',
              link: '/learn_frontend/typescript/常用类型/特殊类型',
            },
            {
              text: '字面量类型',
              link: '/learn_frontend/typescript/常用类型/字面量类型',
            },
            {
              text: '对象类型',
              link: '/learn_frontend/typescript/常用类型/对象类型',
            },
            {
              text: '枚举类型',
              link: '/learn_frontend/typescript/常用类型/枚举类型',
            },
            {
              text: '元组类型',
              link: '/learn_frontend/typescript/常用类型/元组类型',
            },
            {
              text: '接口类型',
              link: '/learn_frontend/typescript/常用类型/接口类型',
            },
            {
              text: 'Class类型',
              link: '/learn_frontend/typescript/常用类型/Class类型',
            },
            {
              text: '泛型类型',
              link: '/learn_frontend/typescript/常用类型/泛型类型',
            },
            {
              text: '索引类型',
              link: '/learn_frontend/typescript/常用类型/索引类型',
            },
            {
              text: '映射类型',
              link: '/learn_frontend/typescript/常用类型/映射类型',
            },
            {
              text: '类型别名',
              link: '/learn_frontend/typescript/常用类型/类型别名',
            },
            {
              text: '联合类型',
              link: '/learn_frontend/typescript/常用类型/联合类型',
            },
            {
              text: '交叉类型',
              link: '/learn_frontend/typescript/常用类型/交叉类型',
            },
          ],
        },
        {
          text: '类型机制',
          collapsed: true,
          items: [
            {
              text: '类型兼容性机制',
              link: '/learn_frontend/typescript/类型机制/类型兼容性机制',
            },
            {
              text: '类型断言机制',
              link: '/learn_frontend/typescript/类型机制/类型断言机制',
            },
            {
              text: '类型推断机制',
              link: '/learn_frontend/typescript/类型机制/类型推断机制',
            },
          ],
        },
        {
          text: '工具类型',
          collapsed: true,
          items: [
            {
              text: '类型操作符',
              link: '/learn_frontend/typescript/工具类型/类型操作符',
            },
            {
              text: '常用的工具类型',
              link: '/learn_frontend/typescript/工具类型/常用的工具类型',
            },
            {
              text: '工具类型的底层实现',
              link: '/learn_frontend/typescript/工具类型/工具类型的底层实现',
            },
          ],
        },
        {
          text: '高级类型',
          collapsed: true,
          items: [
            {
              text: '条件类型',
              link: '/learn_frontend/typescript/高级类型/条件类型',
            },
            {
              text: '联合分布',
              link: '/learn_frontend/typescript/高级类型/联合分布',
            },
            {
              text: '推断类型',
              link: '/learn_frontend/typescript/高级类型/推断类型',
            },
          ],
        },
        {
          text: '装饰器',
          collapsed: true,
          items: [
            {
              text: '元数据',
              link: '/learn_frontend/typescript/装饰器/元数据',
            },
            {
              text: '装饰器',
              link: '/learn_frontend/typescript/装饰器/装饰器',
            },
          ],
        },
        {
          text: '工程化',
          collapsed: true,
          items: [
            {
              text: '类型声明文件定义',
              link: '/learn_frontend/typescript/工程化/类型声明文件定义',
            },
            {
              text: 'tsconfig详解',
              link: '/learn_frontend/typescript/工程化/tsconfig',
            },
          ],
        },
      ],
      '/learn_frontend/jest/': [
        {
          text: 'jest测试工具',
          collapsed: true,
          items: [
            {
              text: '起步',
              collapsed: true,
              items: [
                {
                  text: '基本介绍',
                  link: '/learn_frontend/jest/起步/基本介绍',
                },
                {
                  text: '命令参数',
                  link: '/learn_frontend/jest/起步/命令参数',
                },
                {
                  text: '配置',
                  link: '/learn_frontend/jest/起步/配置',
                },
              ],
            },
            {
              text: '核心概念',
              collapsed: true,
              items: [
                {
                  text: '常用匹配器',
                  link: '/learn_frontend/jest/核心概念/常用匹配器',
                },
                {
                  text: '匹配器概览',
                  link: '/learn_frontend/jest/核心概念/匹配器概览',
                },
                {
                  text: '异步代码测试',
                  link: '/learn_frontend/jest/核心概念/异步代码测试',
                },
                {
                  text: '钩子函数',
                  link: '/learn_frontend/jest/核心概念/钩子函数',
                },
                {
                  text: 'Mock函数',
                  link: '/learn_frontend/jest/核心概念/mock函数',
                },
              ],
            },
            {
              text: '实践案例',
              collapsed: true,
              items: [
                {
                  text: '最佳实践',
                  link: '/learn_frontend/jest/实践案例/最佳实践',
                },
              ],
            },
          ],
        },
      ],
      '/learn_frontend/msw/': [
        {
          text: 'HTTP模拟',
          items: [
            {
              text: '起步',
              link: '/learn_frontend/msw/模拟HTTP/起步',
            },
            {
              text: '断言谓词',
              link: '/learn_frontend/msw/模拟HTTP/断言谓词',
            },
            {
              text: '响应解析器',
              link: '/learn_frontend/msw/模拟HTTP/响应解析器',
            },
          ],
        },
        {
          text: 'WS模拟',
          collapsed: true,
          items: [],
        },
      ],
      '/learn_frontend/faker/': [
        {
          text: '起步',
          link: '/learn_frontend/faker/起步',
        },
        {
          text: '本地化',
          link: '/learn_frontend/faker/本地化',
        },
        {
          text: '随机器',
          link: '/learn_frontend/faker/随机器',
        },
        {
          text: '唯一值',
          link: '/learn_frontend/faker/唯一值',
        },
        {
          text: '常用API',
          link: '/learn_frontend/faker/常用API',
        },
      ],
      '/learn_frontend/rollup/': [
        {
          text: '起步',
          items: [
            {
              text: '基本概念',
              link: '/learn_frontend/rollup/起步/基本概念',
            },
            {
              text: '核心概念',
              link: '/learn_frontend/rollup/起步/核心概念',
            },
            {
              text: '基本使用',
              link: '/learn_frontend/rollup/起步/基本使用',
            },

            {
              text: '命令行接口',
              link: '/learn_frontend/rollup/起步/命令行接口',
            },
            {
              text: 'JavaScript API',
              link: '/learn_frontend/rollup/起步/JavascriptAPI',
            },
          ],
        },
        {
          text: '插件',
          items: [
            {
              text: '插件',
              link: '/learn_frontend/rollup/插件/插件',
            },
          ],
        },
        {
          text: '配置选项',
          items: [
            {
              text: '输入配置选项',
              link: '/learn_frontend/rollup/配置/输入配置选项',
            },
            {
              text: '输出配置选项',
              link: '/learn_frontend/rollup/配置/输出配置选项',
            },
            {
              text: '监视配置选项',
              link: '/learn_frontend/rollup/配置/监视配置选项',
            },
            {
              text: '其它配置选项',
              link: '/learn_frontend/rollup/配置/其它配置选项',
            },
            {
              text: '包配置',
              link: '/learn_frontend/rollup/配置/包配置',
            },
          ],
        },
      ],
      '/learn_frontend/pnpm/': [
        {
          text: '基本介绍',
          items: [
            {
              text: '初衷',
              link: '/learn_frontend/pnpm/基本介绍/初衷',
            },
            {
              text: '特性比较',
              link: '/learn_frontend/pnpm/基本介绍/特性比较',
            },
            {
              text: '安装',
              link: '/learn_frontend/pnpm/基本介绍/安装',
            },
          ],
        },
        {
          text: '用法',
          items: [
            {
              text: '命令行接口',
              link: '/learn_frontend/pnpm/用法/命令行接口',
            },
            {
              text: '配置',
              link: '/learn_frontend/pnpm/用法/配置',
            },
            {
              text: '过滤',
              link: '/learn_frontend/pnpm/用法/过滤',
            },
          ],
        },
        {
          text: '命令',
          items: [
            {
              text: '管理依赖',
              link: '/learn_frontend/pnpm/命令/管理依赖',
            },
            {
              text: '修补依赖',
              link: '/learn_frontend/pnpm/命令/修补依赖',
            },
            {
              text: '检查依赖',
              link: '/learn_frontend/pnpm/命令/检查依赖',
            },
            {
              text: '运行脚本',
              link: '/learn_frontend/pnpm/命令/运行脚本',
            },
            {
              text: '管理环境',
              link: '/learn_frontend/pnpm/命令/管理环境',
            },
            {
              text: '其它',
              link: '/learn_frontend/pnpm/命令/其它',
            },
          ],
        },
        {
          text: '配置',
          items: [
            {
              text: '包清单文件',
              link: '/learn_frontend/pnpm/配置/包清单文件',
            },
            {
              text: 'package.json',
              link: '/learn_frontend/pnpm/配置/package详解',
            },
            {
              text: 'pnpm配置文件',
              link: '/learn_frontend/pnpm/配置/pnpm配置文件',
            },
            {
              text: 'npmrc配置文件',
              link: '/learn_frontend/pnpm/配置/npmrc',
            },
          ],
        },
        {
          text: '特性',
          items: [
            {
              text: '工作区',
              link: '/learn_frontend/pnpm/特性/工作区',
            },
            {
              text: '目录',
              link: '/learn_frontend/pnpm/特性/目录',
            },
          ],
        },
      ],
      '/learn_frontend/axios/': [
        {
          text: '起步',
          collapsed: true,
          items: [
            {
              text: '基本介绍',
              link: '/learn_frontend/axios/起步/基本介绍',
            },
            {
              text: '发送请求的几种方式',
              link: '/learn_frontend/axios/起步/发送请求的几种方式',
            },
          ],
        },

        {
          text: '配置',
          collapsed: true,
          items: [
            {
              text: '配置方式及其优先级',
              link: '/learn_frontend/axios/配置/配置方式及其优先级',
            },
            {
              text: '基础配置',
              link: '/learn_frontend/axios/配置/基础配置',
            },
            {
              text: '数据处理',
              link: '/learn_frontend/axios/配置/数据处理',
            },
            {
              text: '请求处理',
              link: '/learn_frontend/axios/配置/请求处理',
            },
            {
              text: '响应处理',
              link: '/learn_frontend/axios/配置/响应处理',
            },
            {
              text: '进度监控',
              link: '/learn_frontend/axios/配置/进度监控',
            },
            {
              text: '安全相关',
              link: '/learn_frontend/axios/配置/安全相关',
            },
            {
              text: '高级网络配置',
              link: '/learn_frontend/axios/配置/高级网络配置',
            },
            {
              text: '自定义',
              link: '/learn_frontend/axios/配置/自定义',
            },
            {
              text: '全部配置概览',
              link: '/learn_frontend/axios/配置/全部配置概览',
            },
          ],
        },
        {
          text: '拦截器',
          collapsed: true,
          items: [
            {
              text: '拦截器',
              link: '/learn_frontend/axios/拦截器/拦截器',
            },
          ],
        },
        {
          text: '序列化',
          collapsed: true,
          items: [
            {
              text: '发送不同MIME类型的数据',
              link: '/learn_frontend/axios/序列化/发送不同MIME类型的数据',
            },
            {
              text: '自动序列化机制',
              link: '/learn_frontend/axios/序列化/自动序列化机制',
            },
          ],
        },
      ],
      '/learn_frontend/pinia/': [
        {
          text: '基本概念',
          link: '/learn_frontend/pinia/基本概念.md',
        },
        {
          text: '定义和使用store',
          link: '/learn_frontend/pinia/定义和使用store',
        },
        {
          text: 'store三要素',
          link: '/learn_frontend/pinia/store三要素',
        },
        {
          text: '扩展pinia',
          link: '/learn_frontend/pinia/扩展pinia',
        },
      ],
      '/learn_frontend/vue3/': [
        {
          text: '起步',
          collapsed: true,
          items: [
            {
              text: '简介',
              link: '/learn_frontend/vue3/起步/简介',
            },
            {
              text: '选项式和组合式',
              link: '/learn_frontend/vue3/起步/选项式和组合式',
            },
            {
              text: '应用实例',
              link: '/learn_frontend/vue3/起步/应用实例',
            },
            {
              text: '模板语法',
              link: '/learn_frontend/vue3/起步/模板语法',
            },
          ],
        },

        {
          text: '操作DOM',
          collapsed: true,
          items: [
            {
              text: '模板引用',
              link: '/learn_frontend/vue3/操作DOM/模板引用',
            },
          ],
        },
        {
          text: '指令',
          collapsed: true,
          items: [
            {
              text: '指令基本概念',
              link: '/learn_frontend/vue3/指令/指令基本概念',
            },
            {
              text: '内置指令',
              link: '/learn_frontend/vue3/指令/内置指令',
            },
          ],
        },
        {
          text: '控制样式',
          collapsed: true,
          items: [
            {
              text: 'Class与Style绑定',
              link: '/learn_frontend/vue3/控制样式/Class与Style绑定',
            },
          ],
        },
        {
          text: '组件',
          collapsed: true,
          items: [
            {
              text: '组件基础',
              link: '/learn_frontend/vue3/组件/组件基础',
            },
            {
              text: '组件通信-props',
              link: '/learn_frontend/vue3/组件/组件通信-props',
            },
            {
              text: '组件通信-事件',
              link: '/learn_frontend/vue3/组件/组件通信-事件',
            },
            {
              text: '组件通信-v-model',
              link: '/learn_frontend/vue3/组件/组件通信-v-model',
            },
            {
              text: '组件通信-provide',
              link: '/learn_frontend/vue3/组件/组件通信-provide',
            },
            {
              text: '动态组件',
              link: '/learn_frontend/vue3/组件/动态组件',
            },
            {
              text: '透传',
              link: '/learn_frontend/vue3/组件/透传',
            },
            {
              text: '插槽',
              link: '/learn_frontend/vue3/组件/插槽',
            },
            {
              text: '异步组件',
              link: '/learn_frontend/vue3/组件/异步组件',
            },
          ],
        },
        {
          text: '内置组件',
          collapsed: true,
          items: [
            {
              text: 'Transition',
              link: '/learn_frontend/vue3/内置组件/Transition',
            },
            {
              text: 'TransitionGroup',
              link: '/learn_frontend/vue3/内置组件/TransitionGroup',
            },
            {
              text: 'Teleport',
              link: '/learn_frontend/vue3/内置组件/Teleport',
            },
            {
              text: 'KeepAlive',
              link: '/learn_frontend/vue3/内置组件/KeepAlive',
            },
            {
              text: 'Suspense',
              link: '/learn_frontend/vue3/内置组件/Suspense',
            },
          ],
        },
        {
          text: '生命周期',
          collapsed: true,
          items: [],
        },
        {
          text: '响应式',
          collapsed: true,
          items: [
            {
              text: 'ref和reactive',
              link: '/learn_frontend/vue3/响应式/ref和reactive',
            },
            {
              text: '计算属性',
              link: '/learn_frontend/vue3/响应式/计算属性',
            },
            {
              text: '监听器',
              link: '/learn_frontend/vue3/响应式/监听器',
            },
          ],
        },
        {
          text: '路由',
          collapsed: true,
          items: [],
        },
        {
          text: '插件',
          collapsed: true,
          items: [],
        },
      ],
      '/learn_frontend/scss/': [
        {
          text: '基本介绍',
          link: '/learn_frontend/scss/基本介绍',
        },
        {
          text: '环境搭建',
          link: '/learn_frontend/scss/环境搭建',
        },
        {
          text: '扩展语法',
          link: '/learn_frontend/scss/扩展语法.md',
        },
        {
          text: '变量',
          link: '/learn_frontend/scss/变量',
        },
        {
          text: '常用指令',
          items: [
            {
              text: '@import',
              link: '/learn_frontend/scss/常用指令/@import',
            },
            {
              text: '@extend',
              link: '/learn_frontend/scss/常用指令/@extend',
            },
            {
              text: '@forward',
              link: '/learn_frontend/scss/常用指令/@forward',
            },
            {
              text: '@mixin',
              link: '/learn_frontend/scss/常用指令/@mixin',
            },
            {
              text: '@use',
              link: '/learn_frontend/scss/常用指令/@use',
            },
            {
              text: '@at-root',
              link: '/learn_frontend/scss/常用指令/@at-root',
            },
          ],
        },
        {
          text: '函数',
          link: '/learn_frontend/scss/函数',
        },
        {
          text: '流程控制',
          link: '/learn_frontend/scss/流程控制',
        },
      ],
      '/learn_frontend/react/': [
        {
          text: 'react基础',
          collapsed: true,
          items: [
            {
              text: 'Jsx',
              link: '/learn_frontend/react/react基础/Jsx',
            },
            {
              text: '组件通信',
              link: '/learn_frontend/react/react基础/组件通信',
            },
            {
              text: '组件生命周期',
              link: '/learn_frontend/react/react基础/组件生命周期',
            },
            {
              text: '类组件',
              link: '/learn_frontend/react/react基础/类组件',
            },
            {
              text: 'Router',
              link: '/learn_frontend/react/react基础/Router',
            },
            {
              text: 'Redux',
              link: '/learn_frontend/react/react基础/Redux',
            },
            {
              text: 'zustand',
              link: '/learn_frontend/react/react基础/zustand',
            },
            {
              text: 'Hook',
              link: '/learn_frontend/react/react基础/Hook',
            },
            {
              text: '优化方案',
              link: '/learn_frontend/react/react基础/优化方案',
            },
            {
              text: '使用vite和Ts',
              link: '/learn_frontend/react/react基础/使用vite和Ts',
            },
            {
              text: '极客园小项目',
              link: '/learn_frontend/react/react基础/极客园小项目',
            },
          ],
        },
      ],
      '/learn_frontend/browser/': [
        {
          text: '浏览器基础',
          collapsed: true,
          items: [
            {
              text: '浏览器渲染原理',
              link: '/learn_frontend/browser/browser基础/浏览器渲染原理',
            },
            {
              text: '重排和重绘',
              link: '/learn_frontend/browser/browser基础/重排和重绘',
            },
          ],
        },
      ],
      '/learn_algorithm/': [
        {
          text: '数组',
          link: '/learn_algorithm/数组',
        },
        {
          text: '队列',
          link: '/learn_algorithm/队列',
        },
      ],
      '/learn_sofrwareArchitecture/designPattern/': [
        {
          text: '设计模式基础',
          collapsed: true,
          items: [
            {
              text: '设计模式工具UML',
              link: '/learn_sofrwareArchitecture/designPattern/designPattern基础/设计模式工具UML',
            },
            {
              text: '设计模式七大原则',
              link: '/learn_sofrwareArchitecture/designPattern/designPattern基础/设计模式七大原则',
            },
            {
              text: '23种设计模式概述',
              link: '/learn_sofrwareArchitecture/designPattern/designPattern基础/23种设计模式概述',
            },
          ],
        },
        {
          text: '23种设计模式-创建型',
          collapsed: true,
          items: [
            {
              text: '总结创建型模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-创建型/总结创建型模式',
            },
            {
              text: '简单工厂模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-创建型/简单工厂模式',
            },
            {
              text: '单例模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-创建型/单例模式',
            },
            {
              text: '工厂方法模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-创建型/工厂方法模式',
            },
            {
              text: '抽象工厂方法模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-创建型/抽象工厂方法模式',
            },
          ],
        },
        {
          text: '23种设计模式-结构型',
          collapsed: true,
          items: [
            {
              text: '代理模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-结构型/代理模式',
            },
            {
              text: '桥接模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-结构型/桥接模式',
            },
            {
              text: '适配器模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-结构型/适配器模式',
            },
            {
              text: '装饰器模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-结构型/装饰器模式',
            },
          ],
        },
        {
          text: '23种设计模式-行为型',
          collapsed: true,
          items: [
            {
              text: '命令模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-行为型/命令模式',
            },
            {
              text: '观察者模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-行为型/观察者模式',
            },
            {
              text: '发布订阅模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-行为型/发布订阅模式',
            },
            {
              text: '迭代器模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-行为型/迭代器模式',
            },
            {
              text: '职责链模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-行为型/职责链模式',
            },
            {
              text: '策略模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-行为型/策略模式',
            },
            {
              text: '模板方法模式',
              link: '/learn_sofrwareArchitecture/designPattern/23种设计模式-行为型/模板方法模式',
            },
          ],
        },
      ],
      '/learn_408/数据结构/': [
        {
          text: '线性结构',
          collapsed: true,
          items: [
            {
              text: '线性表',
              link: '/learn_408/数据结构/线性结构/线性表',
            },
            {
              text: '顺序表',
              link: '/learn_408/数据结构/线性结构/顺序表',
            },
            {
              text: '链表',
              link: '/learn_408/数据结构/线性结构/链表',
            },
          ],
        },
      ],
      '/learn_408/计算机网络/': [
        {
          text: '面试题',
          collapsed: true,
          items: [
            {
              text: 'XSS跨站脚本攻击',
              link: '/learn_408/计算机网络/面试题/XSS跨站脚本攻击',
            },
            {
              text: 'CSRF跨站请求伪造',
              link: '/learn_408/计算机网络/面试题/CSRF跨站请求伪造',
            },
            {
              text: 'SQL注入攻击',
              link: '/learn_408/计算机网络/面试题/SQL注入攻击',
            },
          ],
        },
        {
          text: '物理层',
          collapsed: true,
          items: [
            {
              text: '基本概念',
              link: '/learn_408/计算机网络/物理层/基本概念',
            },
            {
              text: '传输介质',
              link: '/learn_408/计算机网络/物理层/传输介质',
            },
            {
              text: '核心设备',
              link: '/learn_408/计算机网络/物理层/核心设备',
            },
            {
              text: '核心协议',
              link: '/learn_408/计算机网络/物理层/核心协议',
            },

            {
              text: '协议数据单元',
              link: '/learn_408/计算机网络/物理层/协议数据单元',
            },
          ],
        },
        {
          text: '数据链路层',
          collapsed: true,
          items: [
            {
              text: '基本概念',
              link: '/learn_408/计算机网络/数据链路层/基本概念',
            },
            {
              text: '传输介质',
              link: '/learn_408/计算机网络/数据链路层/传输介质',
            },
            {
              text: '核心设备',
              link: '/learn_408/计算机网络/数据链路层/核心设备',
            },
            {
              text: '核心协议',
              link: '/learn_408/计算机网络/数据链路层/核心协议',
            },

            {
              text: '协议数据单元',
              link: '/learn_408/计算机网络/数据链路层/协议数据单元',
            },
          ],
        },
        {
          text: '网络层',
          collapsed: true,
          items: [
            {
              text: '基本概念',
              link: '/learn_408/计算机网络/网络层/基本概念',
            },

            {
              text: '核心设备',
              link: '/learn_408/计算机网络/网络层/核心设备',
            },
            {
              text: '核心协议',
              link: '/learn_408/计算机网络/网络层/核心协议',
            },

            {
              text: '协议数据单元',
              link: '/learn_408/计算机网络/网络层/协议数据单元',
            },
          ],
        },
        {
          text: '传输层',
          collapsed: true,
          items: [
            {
              text: '基本概念',
              link: '/learn_408/计算机网络/传输层/基本概念',
            },
            {
              text: 'TCP和UDP协议',
              link: '/learn_408/计算机网络/传输层/TCP和UDP协议',
            },
            {
              text: 'TCP三次握手和四次挥手',
              link: '/learn_408/计算机网络/传输层/TCP三次握手和四次挥手',
            },

            {
              text: '协议数据单元',
              link: '/learn_408/计算机网络/传输层/协议数据单元',
            },
          ],
        },
        {
          text: '会话层',
          collapsed: true,
          items: [
            {
              text: '基本概念',
              link: '/learn_408/计算机网络/会话层/基本概念',
            },
            {
              text: '核心协议',
              link: '/learn_408/计算机网络/会话层/核心协议',
            },

            {
              text: '协议数据单元',
              link: '/learn_408/计算机网络/会话层/协议数据单元',
            },
          ],
        },
        {
          text: '表示层',
          collapsed: true,
          items: [
            {
              text: '基本概念',
              link: '/learn_408/计算机网络/表示层/基本概念',
            },
            {
              text: '核心协议',
              link: '/learn_408/计算机网络/表示层/核心协议',
            },

            {
              text: '协议数据单元',
              link: '/learn_408/计算机网络/表示层/协议数据单元',
            },
          ],
        },
        {
          text: '应用层',
          collapsed: true,
          items: [
            {
              text: 'DNS解析与优化',
              link: '/learn_408/计算机网络/应用层/DNS解析与优化',
            },
            {
              text: 'HTTP和HTTPS协议',
              link: '/learn_408/计算机网络/应用层/HTTP和HTTPS协议',
            },
            {
              text: 'RESTful API',
              link: '/learn_408/计算机网络/应用层/RESTful API',
            },
            {
              text: 'HTTP不同请求方式',
              link: '/learn_408/计算机网络/应用层/HTTP不同请求方式',
            },
            {
              text: 'HTTP请求体与MIME类型',
              link: '/learn_408/计算机网络/应用层/HTTP请求体与MIME类型',
            },
            {
              text: 'HTTP协议的应用',
              link: '/learn_408/计算机网络/应用层/HTTP协议的应用',
            },
            {
              text: '跨域的解决方案',
              link: '/learn_408/计算机网络/应用层/跨域的解决方案',
            },
            {
              text: 'GET和POST请求的区别',
              link: '/learn_408/计算机网络/应用层/GET和POST请求的区别',
            },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' },
    ],
  },
  markdown: {
    lineNumbers: true,
    breaks: true,
    math: true,
  },
  vite: {
    resolve: {
      alias: {
        // 配置路径别名
        '@': path.resolve(__dirname, '../'),
      },
    },
  },
});
