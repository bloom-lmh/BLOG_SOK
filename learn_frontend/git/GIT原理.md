# GIT 原理

[学习网站](https://learngitbranching.js.org/?locale=zh_CN)

## 一些心得总结

本质上来说玩`git`就是在玩指针，分支指针维护着分支中的提交记录，而`HEAD`指针则相当于工作指针，指向当前分支的最新提交记录，一般来说`HEAD`指针指向分支指针，但也可分离，常用的操作指针的命令如下：

- `git commit` → 移动当前分支指针（HEAD 间接跟随）
- `git checkout <branch>` → 让 HEAD 指向该分支（切换上下文）
- `git checkout <commit>` → 让 HEAD 直接指向该 commit（分离状态）
- `git branch -f <name> <target>` → 手动移动分支指针
- `git rebase -i <commit>` → 将当前分子到某个提交的节点变基到某个提交下

## 文件追踪

只要一个文件曾经被提交过（即存在于当前 `HEAD` 提交中），它就会被`Git`所追踪，并监控其变化
文件追踪或者说`git status` 命令背后的原理，就是拿当前的工作区、暂存区的文件和`HEAD`指向的最新提交版本文件进行比较，从而得出：

1. 哪些被追踪文件发送了变化（提交过，但是又发生了变化，但没有提交暂存区）
2. 哪些文件是新增的、从未被 `Git` 跟踪过的（即不在 `HEAD` 中，也未被 `git add`）
3. 哪些改动（包括新文件或已跟踪文件的修改）已被暂存，将包含在下次提交中

除非你显式地用 `git rm` 把它从 `Git` 中删除。

## 提交记录

### 差异化比对

`Git` 仓库中的提交的记录保存的是你的目录下所有文件的快照。就像是把整个目录复制，然后再粘贴一样，但比复制粘贴优雅许多！`Git` 希望提交记录尽可能地轻量，因此在你每次进行提交时，它并不会盲目地复制整个目录。条件允许的情况下，它会将当前版本与仓库中的上一个版本进行对比，并把所有的差异打包到一起作为一个提交记录。

### parent 节点

`Git` 保存了提交的历史记录。所以大多数提交记录的上面都有 `parent` 节点。比如下面图中初始提交 `C0` 和其后可能包含某些有用修改的提交 `C1`，当提交了 `C2` 后，`C2` 的父节点就是上次提交的 `C1`

![parent 节点](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215093117777.png)

## 分支

### 分支的本质

> 一句话概述：分支的本质就是创建一个指向某个提交的分支指针，并始终指向该分支的最新的提交，其作用在于防止丢失分支引用。

`Git` 的分支也非常轻量。它们只是简单地指向某个提交记录 —— 仅此而已。也就是说即使创建再多的分支也不会造成储存或内存上的开销，并且按逻辑分解工作到不同的分支要比维护那些特别臃肿的分支简单多了。所以推荐使用分支。

::: tip 从指针的角度理解分支
分支的本质就是创建一个指向某个提交的分支指针，并在此基础上维护新工作，分支指针始终指向该分支的最新的提交。比如上面的`main`实际上就是一个指向主分支的指针。
对于分支只要记住使用分支其实就相当于在说：我想基于这个提交以及它所有的 `parent` 提交进行新的工作。
:::

### 新建分支

> 一句话概述：新建分支本质上就是要基于某一提交及其所有父提交开辟一个新的工作路径，这个分支指针始终指向这个工作路径的最新提交，防止丢失。

接下来，我们将要创建一个到名为 `newImage` 的分支。输入命令`git branch newImage`。看到了吗，创建分支就是这么容易！新创建的分支 `newImage` 指向的是提交记录 `C1`。然后我们输入`git commit`，做一些新的提交。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215100921233.png" 
     style="width: 100%; height: auto; display: block;">

为什么 `main` 分支前进了，但 `newImage` 分支还待在原地呢？！这是因为我们没有“在”这个新分支上，看到 `main` 分支上的那个星号（\*）了吗？这表示当前所在的分支是 `main`。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215101131819.png" 
     style="width: 100%; height: auto; display: block;">

### 切换分支

> 一句话概述：切换分支的本质就是改变 HEAD (工作)指针，让其指向当前要操作的分支指针，进而指向分支的最新提交。

现在咱们告诉 `Git` 我们想要切换到新的分支上，输入命令`git checkout newImage`。然后再提交，这时我们的修改已经保存到新的分支里了。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215103052390.png" 
     style="width: 100%; height: auto; display: block;">

::: warning 新的分支切换指令
在 `Git 2.23` 版本中，引入了一个名为 `git switch` 的新命令，最终会取代 `git checkout`，因为 `checkout` 作为单个命令有点超载（它承载了很多独立的功能）。 由于现在很多人还无法使用 `switch`，本次课程仍然使用 `checkout` 而不是 `switch`， 但是如果你想尝试一下新命令，我们的应用也是支持的！并且你可以从这里学到[更多](https://git-scm.com/docs/git-switch)关于新命令的内容。
:::

::: tip 创建分支时切换
如果你想创建一个新的分支同时切换到新创建的分支的话，可以通过 `git checkout -b <your-branch-name>` 来实现。
:::

### 分支合并(git merge)

> 一句话概述：`git merge` 的本质就是创建一个新的提交记录，该提交记录同时指向合并为它的多个源提交记录。

我们已经知道如何提交以及如何使用分支了。接下来咱们看看如何将两个分支合并到一起。就是说我们新建一个分支，在其上开发某个新功能，开发完成后再合并回主线。

咱们先来看一下第一种方法 —— `git merge`。在 Git 中合并两个分支时会产生一个特殊的提交记录，它有两个 `parent` 节点。翻译成自然语言相当于：“我要把这两个 `parent` 节点本身及它们所有的祖先都包含进来。”

我们准备了两个分支，每个分支上各有一个独有的提交。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215104612843.png" 
     style="width: 100%; height: auto; display: block;">

这意味着没有一个分支包含了我们修改的所有内容。咱们通过合并这两个分支来解决这个问题。我们要把 `bugFix` 合并到 `main` 里，输入命令`git merge bugFix`。看见了吗？`main` 现在指向了一个拥有两个 `parent` 节点的提交记录

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215105656443.png" 
     style="width: 100%; height: auto; display: block;">

这里引入了颜色搭配。每个分支都有不同的颜色，而每个提交记录的颜色是所有包含该提交记录的分支的颜色混合之后的颜色。所以，`main` 分支的颜色被混入到所有的提交记录，但 `bugFix` 没有。所以下面咱们咱们再把 `main` 分支合并到 `bugFix`：

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215110940637.png" 
     style="width: 100%; height: auto; display: block;">

因为 `main` 继承自 `bugFix`，Git 什么都不用做，只是简单地把 `bugFix` 移动到 `main` 所指向的那个提交记录。现在所有提交记录的颜色都一样了，这表明每一个分支都包含了代码库的所有修改

### 分支合并(git rebase)

> 一句话概述：`git rebase`的本质就是把一个分支上的提交记录复制到另一个分支上，然后把原分支上的提交记录删除。

第二种合并分支的方法是 `git rebase`。`Rebase` 实际上就是取出一系列的提交记录，“复制”它们，然后在另外一个地方逐个的放下去。`Rebase` 的优势就是可以创造更线性的提交历史，这听上去有些难以理解。如果只允许使用 `Rebase` 的话，代码库的提交历史将会变得异常清晰。

还是先准备两个分支还是准备了两个分支；注意当前所在的分支是 `bugFix`（星号标识的是当前分支）。我们想要把 `bugFix` 分支里的工作直接移到 `main` 分支上。移动以后会使得两个分支的功能看起来像是按顺序开发，但实际上它们是并行开发的。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215114617903.png" 
     style="width: 100%; height: auto; display: block;">

输入命令`git rebase main`。现在 `bugFix` 分支上的工作在 `main` 的最顶端，同时我们也得到了一个更线性的提交序列。注意，提交记录 `C3` 依然存在（树上那个半透明的节点），而 `C3` 是我们 `Rebase` 到 `main` 分支上的 `C3` 的副本。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215114828971.png" 
     style="width: 100%; height: auto; display: block;">

现在唯一的问题就是 `main` 还没有更新，下面咱们就来更新它吧。现在我们切换到了 `main` 上。把它 `rebase` 到 `bugFix` 分支上。然后输入命令`git rebase bugFix`。由于 `bugFix` 继承自 `main`，所以 Git 只是简单的把 `main` 分支的引用向前移动了一下而已。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215115219487.png" 
     style="width: 100%; height: auto; display: block;">

## 提交树上移动 HEAD 指针

在接触 `Git` 更高级功能之前，我们有必要先学习在你项目的提交树上前后移动的几种方法。一旦熟悉了如何在 `Git` 提交树上移动，你驾驭其它命令的能力也将水涨船高！

### HEAD 的本质

> 一句话概述：HEAD 其实就是你的工作指针，指向你正在其基础上进行工作的提交记录。而分支指针是记录分支最新提价用的

`HEAD` 是一个对当前所在分支的符号引用 —— 也就是指向你正在其基础上进行工作的提交记录。大多数修改提交树的 `Git` 命令都是从改变 `HEAD` 的指向开始的。

### 移动 HEAD 指针

从本质来讲`checkout`指令就是用来切换`HEAD`指针的指向的命令，比如

1. `git checkout <branch-name>`就是切换`HEAD`指针指向对应分支名的分支指针。
2. `git checkout <commit-id>`就是切换`HEAD`指针指向`commit-id`对应的提交记录。

### 分离 HEAD

> 一句话概述：让 HEAD 不再默认指向当前分支指针，进而指向提交记录，而是直接指向具体提交记录

`HEAD` 通常情况下是指向分支名的，比如在命令执行之前的状态如下所示：`HEAD` 指向 `main`， `main` 指向 `C1`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215143451779.png" 
     style="width: 100%; height: auto; display: block;">

分离的 `HEAD` 就是让其指向了某个具体的提交记录而不是分支名。比如我输入命令`git checkout C1`，此时`HEAD`就不再指向分支名`main`，而是指向具体的提交记录`C1`：

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215144125118.png" 
     style="width: 100%; height: auto; display: block;">

::: tip 理解
很简单，其实就是把 `HEAD` 指向了一个具体的提交记录，而不是指向一个分支名。
:::

### 相对引用^&~

> 一句话概述：相对于当前 HEAD 指向的提交记录，HEAD 指针上移多少个提交记录。`^` 符号用来表示上一个提交记录，`~<num>` 符号用来表示上多个提交记录。

`HEAD`指针通过指定提交记录哈希值的方式在 `Git` 中移动不太方便。在实际应用时，并没有像本程序中这么漂亮的可视化提交树供你参考，所以你就不得不用 `git log` 来查查看提交记录的哈希值。哈希值在真实的 `Git` 世界中共 `40` 位（基于 `SHA-1`）。例如提交记录的哈希值可能是 `fed2da64c0efc5293610bdd892f82a58e8cbc5d8`。当然 `GIT` 支持简写，只需要哈希值前面几位就可以唯一标识一个提交记录。但这还不是很方便。所以`GIT`提供了相对引用符号`^`。

- 使用 `^` 向上移动 1 个提交记录
- 使用 `~<num>` 向上移动多个提交记录，如 `~3`

这些符号是相对当前`HEAD`所指向的位置，移动的是`HEAD`指针，比如我希望下面的图中 `HEAD` 指针指向`C1`提交记录

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215150555207.png" 
     style="width: 100%; height: auto; display: block;">

那么我们可以输入命令`git checkout main^`，即`HEAD`指针相对于当前指向的`C2`上移一个提交记录指向`C1`：

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215151134184.png" 
     style="width: 100%; height: auto; display: block;">

`^`一个一个的移动实在太麻烦了，所以我们可以使用`~<num>`来表示多个提交记录，比如`git checkout main~4`表示`HEAD`指针相对于当前指向上移四个提交记录，比如我希望下图中`C4`直接移动到`C1`：

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215155052637.png" 
     style="width: 100%; height: auto; display: block;">

输入命令：`git checkout HEAD~4`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215155400968.png" 
     style="width: 100%; height: auto; display: block;">

### 强制修改分支位置

> 一句话概述：让分支指针强行移动到某个提交记录上。基本语法为`git branch -f 要移动的分支指针 目标位置`

我使用相对引用最多的就是移动分支。可以直接使用 `-f` 选项让分支指向另一个提交。
比如我希望将`main`分支强制指向`C1`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215155908969.png" 
     style="width: 100%; height: auto; display: block;">

输入命令:`git branch -f main HEAD~3`，该命令会将 `main` 分支强制指向 `HEAD` 的第 `3` 级 `parent` 提交。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215160053398.png" 
     style="width: 100%; height: auto; display: block;">

下面有一个有趣的案例：需要你在左边的提交树上移动指针，变为右边的形式

![有趣的案例](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215162322031.png)

```bash
$ git checkout c1
$ git branch -f main c6
$ git branch -f bugFix c0
```

## 撤销变更

在 `Git` 里撤销变更的方法很多。和提交一样，撤销变更由底层部分（暂存区的独立文件或者片段）和上层部分（变更到底是通过哪种方式被撤销的）组成。我们这个应用主要关注的是后者。主要有两种方法用来撤销变更 —— 一是 `git reset`，还有就是 `git revert`。接下来咱们逐个进行讲解。

### git reset

> 一句话概述：`git reset`其实就相当于将更改撤回到工作区上，但是不会删除提交记录，它的指针是向后移动的。

`git reset` 通过把分支记录回退几个提交记录来实现撤销改动。你可以将这想象成“改写历史”。`git reset` 向上移动分支，原来指向的提交记录就跟从来没有提交过一样。比如我要将 main 分支回退到从 `c2` 回退到 `c1`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215164512384.png" 
     style="width: 100%; height: auto; display: block;">

输入命令：`git reset HEAD~1`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215164650273.png" 
     style="width: 100%; height: auto; display: block;">

此时 `Git` 把 `main` 分支移回到 `C1`；现在我们的本地代码库根本就不知道有 `C2` 这个提交了。

::: tip 后续被撤销的提交记录
`git reset` 并不会真正删除提交记录，而是将 `HEAD` 指针指向新的位置。因此，被撤销的提交记录仍然存在，只是 `HEAD` 指针指向了新的位置。 在`reset`后， `C2` 所做的变更还在，但是处于未加入暂存区状态。
:::

### git revert

> 一句话概述：`git revert`是一种更加强大的撤销更改的方法，它会创建一个新的提交记录，撤销掉原来的提交记录，并将撤销后的结果提交到当前分支，它的指针是继续向前推进的。

虽然在你的本地分支中使用 `git reset` 很方便，但是这种“改写历史”的方法对大家一起使用的远程分支是无效的！为了撤销更改并分享给别人，我们需要使用 `git revert`。来看演示：

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215164512384.png" 
     style="width: 100%; height: auto; display: block;">

输入命令：`git revert HEAD`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215173024629.png" 
     style="width: 100%; height: auto; display: block;">

在我们要撤销的提交记录后面居然多了一个新提交！这是因为新提交记录 `C2` 引入了更改 —— 这些更改刚好是用来撤销 `C2` 这个提交的。也就是说 `C2` 的状态与 `C1` 是相同的。
`revert` 之后就可以把你的更改推送到远程仓库与别人分享啦。

> 案例：分别撤销 `local` 分支和 `pushed` 分支上的最近一次提交。共需要撤销两个提交（每个分支一个）。`pushed` 是远程分支，`local` 是本地分支

![案例](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215173730345.png)

::: tip 什么时候用`git reset`和`git revert`？

- `git reset` 适用于你在本地分支上撤销更改
- `git revert` 适用于远程分支撤销更改

:::

::: warning 注意
你需要时刻的关注`HEAD`指针的位置，因为撤销是基于`HEAD`指针进行的
:::

## 整理提交记录

到现在我们已经学习了 `Git` 的基础知识，然而，接下来要讨论的这个话题是“整理提交记录” —— 开发人员有时会说“我想要把这个提交放到这里, 那个提交放到刚才那个提交的后面”, 而接下来就讲的就是它的实现方式，非常清晰、灵活，还很生动。

### git cherry-pick

> 一句话概述：其实就和字面意思摘樱桃一样，将多个提交节点摘下来挂载到当前的`HEAD`后

如果你想将一些提交复制到当前所在的位置（`HEAD`）下面的话， `Cherry-pick` 是最直接的方式了。命令形式为: `git cherry-pick <commit-id>...`。

比如这里有一个仓库, 我们想将 `side` 分支上的工作复制到 `main` 分支，你立刻想到了之前学过的 `rebase` 了吧？但是咱们还是看看 `cherry-pick` 有什么本领吧。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251216155734618.png" 
     style="width: 100%; height: auto; display: block;">

输入命令：`git cherry-pick C2 C4`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251216155734618.png" 
     style="width: 100%; height: auto; display: block;">

我们只需要提交记录 `C2` 和 `C4`，所以 `Git` 就将被它们抓过来放到当前分支下了。 就是这么简单!

> 案例：把三个提交挂载到`main`后

![案例](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251216160410772.png)

输入命令:`git cherry-pick c3 c4 c7`

### 交互式 rebase

> 一句话概述：交互式变基节点

当你知道你所需要的提交记录（并且还知道这些提交记录的哈希值）时, 用 `cherry-pick` 再好不过了 —— 没有比这更简单的方式了。但是如果你不清楚你想要的提交记录的哈希值时, 我们可以利用交互式的 `rebase`。交互式 `rebase` 指的是使用带参数 `--interactive` 的 `rebase` 命令, 简写为 `-i`。它会打开一个 `UI` 界面并列出将要被复制到目标分支的备选提交记录

> 在实际使用时，所谓的 UI 窗口一般会在文本编辑器 —— 如 Vim —— 中打开一个文件

当 `rebase UI`界面打开时, 你能做`3`件事:

- 调整提交记录的顺序（通过鼠标拖放来完成）
- 删除你不想要的提交（通过切换 pick 的状态来完成，关闭就意味着你不想要这个提交记录）
- 合并提交。

比如你需要将 `main` 分支上的 `c5` 和 `c4` 变基到 `c1` 下面:

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251216164348595.png" 
     style="width: 100%; height: auto; display: block;">

输入命令：`git rebase -i HEAD~4`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251216170043822.png" 
     style="width: 100%; height: auto; display: block;">

## 提交技巧

### 如何优雅的进行分支合并

> 一句话概述：多用 `rebase` 而不是 `merge`，`rebase`可以让提交树更加的干净

来看一个在开发中经常会遇到的情况：我正在解决某个特别棘手的 Bug，为了便于调试而在代码中添加了一些调试命令并向控制台打印了一些信息。这些调试和打印语句都在它们各自的提交记录里。最后我终于找到了造成这个 Bug 的根本原因，之后我们需要把 bugFix 分支里的工作合并回 main 分支了。你可以选择通过 fast-forward 快速合并到 main 分支上，比如如下所示：

![原始分支图](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251223204004407.png)

输入命令直接进行合并：`git checkout main` && `git merge bugFix`进行快速合并，如下所示：

![直接合并的效果](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251223204242255.png)

你会发现这样的话 main 分支就会包含我这些调试语句了，实际上更好的方式应该是使用以下两种方式来进行：

1. 输入`git rebase -i HEAD~3` && `git branch -f main HEAD`，最终的提交分支树为

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251223210002868.png)

2. 或输入`git checkout main` && `git cherry-pick c4`也能达到同样的效果

### 如何优雅的修改上一次提交

接下来这种情况也是很常见的：你之前在 newImage 分支上进行了一次提交，然后又基于它创建了 caption 分支，然后又提交了一次。此时你想对某个以前的提交记录进行一些小小的调整。比如设计师想修改一下 newImage 中图片的分辨率，尽管那个提交记录并不是最新的了。

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251224100812954.png)
最终结果为：

![](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260112164728401.png)

#### 使用 rebase

我们可以通过下面的方法来克服困难：

1. 先用 `git rebase -i HEAD~2` 将提交重新排序，把我们想要修改的提交记录挪到最前
2. 然后用 `git commit --amend` 来进行一些小修改
3. 接着再用 `git rebase -i HEAD~2` 来将他们调回原来的顺序
4. 最后使用`git branch -f main`我们把 main 移到修改的最前端（用你自己喜欢的方法），就大功告成啦！

::: tip `git commit --amend`命令
`git commit --amend`命令我需要解释一下它的用途：

1. 修正提交信息（最常用）：你刚提交完发现写错了提交信息：

```js
# 修改提交信息（不改变代码）
git commit --amend -m "修复拼写错误：update user profile → updateUserProfile"
```

2. 补充遗漏的文件：你刚提交完发现漏了一些文件

```js
git add forgotten-file.js       # 先暂存遗漏的文件
# --no-edit 表示保持原提交信息不变。
git commit --amend --no-edit    # 把它合并进上一次提交，且不修改提交信息
```

3. 修改已提交的代码：你发现刚提交的代码有个小 bug，想直接“覆盖”那次提交

```js
# 修改文件
vim src/utils.js

# 暂存更改
git add src/utils.js

# 合并进上一次提交
git commit --amend --no-edit
```

:::

#### 使用 cherry-pick

1. `git checkout main`：将`HEAD`指针切换到`main`分支
2. `git cherry-pick c2`：将`c2`摘下来接到 `HEAD` 指针后，并移动 `HEAD` 指针到`c2`下
3. `git commit --amend`：修改`c2`，并合并修改
4. `git cherry-pick c3`：将`c3`摘下来

## tag 标签操作

tag 标签主要用于标记一些重要的提交节点，比如软件发布新的大版本，或者是修正一些重要的 Bug 或是增加了某些新特性。它们并不会随着新的提交而移动。你也不能切换到某个标签上面进行修改提交，它就像是提交树上的一个锚点，标识了某个特定的位置。

### 锚点提交记录

比如对于下面的提交树。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260115153539745.png" 
     style="width: 100%; height: auto; display: block;">

我们先建立一个标签，指向提交记录 C1，表示这是我们 1.0 版本。输入`git tag v1 C1`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260115153723034.png" 
     style="width: 100%; height: auto; display: block;">

很容易对吧：我们将这个标签命名为 v1，并且明确地让它指向提交记录 C1，如果你不指定提交记录，Git 会用 HEAD 所指向的位置的提交记录作为默认值。

下面来看一个案例要，我们要在 C1 和 C2 上打上标签并且分离 HEAD

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260115160344313.png" 
     style="width: 100%; height: auto; display: block;">

命令如下：

1. `git tag c2 v1`：为 c2 标签打上 v1 标签
2. `git tag c1 v0`：为 c1 标签打上 v0 标签
3. `git checkout C1`：切换 HEAD 到 C1

### 描述最近的锚点

> 一句话概述：Git Describe 能帮你在提交历史中移动了多次以后找到方向。

由于标签在代码库中起着“锚点”的作用，Git 还为此专门设计了一个命令用来描述离你最近的锚点（也就是标签），它就是 `git describe`！

`git describe` 的语法是：`git describe <ref>`,`<ref>` 可以是任何能被 Git 识别成提交记录的引用，如果你没有指定的话，Git 会使用你目前所在的位置（HEAD）。

它输出的结果是这样的：`<tag>-<numCommits>-g<hash>`

1. `tag` 表示的是离 `ref` 最近的标签
2. `numCommits` 是表示这个 `ref` 与 `tag` 相差有多少个提交记录
3. `hash` 表示的是你所给定的 `ref` 所表示的提交记录哈希值的前几位

当 `ref` 提交记录上有某个标签时，则只输出标签名称

比如下面的案例：

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20260115163024244.png" 
     style="width: 100%; height: auto; display: block;">

1. `git describe main` 会输出：`v1-2-gC2`
2. `git describe side` 会输出：`v2-1-gC4`
