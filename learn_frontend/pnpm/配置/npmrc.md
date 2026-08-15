---
order: 250
---

# npmrc

`.npmrc` 是一个配置文件，用于存储 **npm（Node Package Manager）** 和 **pnpm（Performant npm）** 的配置选项。它可以定义项目或用户的包管理行为，例如：

## .npmrc 文件的作用

- 配置 `npm/pnpm/yarn`\*\*`的行为（如`registry`、代理、认证等）。
- 可以存储 **全局配置**（用户级）或 **项目级配置**（项目目录下）。
- 支持环境变量，可以动态调整配置。

## .npmrc 文件的常见位置

| 位置                          | 作用                                 |
| ----------------------------- | ------------------------------------ |
| **全局配置** (`~/.npmrc`)     | 影响当前用户的所有 npm/pnpm 操作     |
| **项目级配置** (`./.npmrc`)   | 只影响当前项目（优先级高于全局配置） |
| **环境变量** (`NPM_CONFIG_*`) | 临时覆盖 `.npmrc` 的配置             |

## .npmrc 文件的常见配置项

```ini
# 设置 npm/pnpm 的 registry（镜像源）
registry=https://registry.npmjs.org/

# 设置代理（适用于公司内网）
proxy=http://proxy.example.com:8080
https-proxy=http://proxy.example.com:8080

# 设置认证（私有仓库）
//registry.npmjs.org/:_authToken=your-token-here

# 关闭严格 SSL 检查（不推荐，仅用于测试）
strict-ssl=false

# 设置 pnpm 的存储目录（默认 ~/.pnpm-store）
store-dir=~/.pnpm-store
```

## .npmrc 文件的优先级

1. **命令行参数**（如 `--registry=https://example.com`） >
2. **项目级 `.npmrc`**（`./.npmrc`） >
3. **用户级 `.npmrc`**（`~/.npmrc`） >
4. **全局 npm 配置**（`/etc/npmrc`）

## pnpm 和 npm 的区别

- **npm**：默认使用 `~/.npmrc` 和 `./.npmrc`。
- **pnpm**：兼容 `.npmrc`，但还支持 `pnpm-workspace.yaml` 和 `pnpm.config.js` 进行更灵活的配置。

## 总结

- `.npmrc` 是 npm/pnpm 的配置文件，用于定义包管理行为。
- 可以放在 **全局**（`~/.npmrc`）或 **项目目录**（`./.npmrc`）。
- 优先级：**命令行 > 项目级 > 用户级 > 全局**。
- pnpm 也支持 `.npmrc`，但还提供额外的配置方式（如 `pnpm-workspace.yaml`）。
