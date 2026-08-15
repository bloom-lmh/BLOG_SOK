# find skills

## 什么是find skills

在明确`find skills`之前我们先要明确什么是`skills cli`。

`skills cli`是一个命令行工具，它可以帮助你快速找到你需要的技能,通常通过npx来临时下载并运行。

::: tip 为什么要使用npx
因为npx可以临时下载并运行npm包，而不需要全局安装,这样可以总是体验最新版本。
:::

而`find skills`只是个agent的找包技能

## 技能包下载到哪里呢

通常技能包有三种下载地方:

1. 全局下载: 下载到`.agent\skills`目录下这样你电脑上所有的`agent`都可以使用这些技能包
2. 针对某个`agent`下载: 对于一些技能你只希望某个`agent`可以使用，可以下载到`agent`的`.skills`目录下,比如`.codex\skills`下
3. 针对某个工程目录:就是将技能放到目录下,所有负责这个工程的`agent`都能使用
