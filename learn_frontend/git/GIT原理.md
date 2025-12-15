# GIT 原理

[学习网站](https://learngitbranching.js.org/?locale=zh_CN)

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

现在 `bugFix` 分支上的工作在 `main` 的最顶端，同时我们也得到了一个更线性的提交序列。注意，提交记录 `C3` 依然存在（树上那个半透明的节点），而 `C3` 是我们 `Rebase` 到 `main` 分支上的 `C3` 的副本。输入`git rebase main`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215114828971.png" 
     style="width: 100%; height: auto; display: block;">

现在唯一的问题就是 `main` 还没有更新，下面咱们就来更新它吧。现在我们切换到了 `main` 上。把它 `rebase` 到 `bugFix` 分支上。然后输入命令`git rebase bugFix`。由于 `bugFix` 继承自 `main`，所以 Git 只是简单的把 `main` 分支的引用向前移动了一下而已。

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215115219487.png" 
     style="width: 100%; height: auto; display: block;">

## 提交树上移动

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

> 一句话概述：`git reset`其实就相当于将更改撤回到工作区上

`git reset` 通过把分支记录回退几个提交记录来实现撤销改动。你可以将这想象成“改写历史”。`git reset` 向上移动分支，原来指向的提交记录就跟从来没有提交过一样。比如我要将 main 分支回退到从 `c2` 回退到 `c1`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215164512384.png" 
     style="width: 100%; height: auto; display: block;">

输入命令：`git reset HEAD~1`

<img src="https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251215164650273.png" 
     style="width: 100%; height: auto; display: block;">

此时 `Git` 把 `main` 分支移回到 `C1`；现在我们的本地代码库根本就不知道有 `C2` 这个提交了。

> 在`reset`后， C2 所做的变更还在，但是处于未加入暂存区状态。

### git revert

虽然在你的本地分支中使用 `git reset` 很方便，但是这种“改写历史”的方法对大家一起使用的远程分支是无效的哦！

为了撤销更改并分享给别人，我们需要使用 git revert。来看演示：
