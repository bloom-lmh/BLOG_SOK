# diff 算法

## 简介

在 `Vue 3.4` 中，当新旧子节点均为数组时，会采用 `diff` 策略进行更新：

- 1. 使用双指针 `i` 和 `e1` 和 `e2` 遍历数组，以及最长递增子序列确定最小更新数组的左右边界。
- 2. 相同类型的节点（`key`和类型相同）则复用`dom`元素仅仅调用`patch`方法更新属性和孩子节点

## 具体实现

源码如下：

```js {14-15,28,42,56,}
/**
 * 全量diff更新，仅限两个儿子都是数组的情况
 * @param c1 旧节点的孩子节点
 * @param c2 新节点的孩子节点
 * @param el 孩子节点对应的父节点
 * @description 在diff算法中会使用两个指针（一头一尾），以及最长递增子序列算法来确定最小的dom操作范围
 */
const patchKeyedChildren = (c1, c2, el, parentComponent) => {
  // i指针用于记录开始的索引
  let i = 0;
  // e1 e2 指针用于记录尾部索引
  let e1 = c1.length - 1; // 第一数组的尾部索引
  let e2 = c2.length - 1; // 第二数组的尾部索引
  // 双指针确定最小更新边界
  // i指针从前开始比较，确定最小更新数组的左边界
  while (i <= e1 && i <= e2) {
    const n1 = c1[i];
    const n2 = c2[i];
    // 节点类型相同则表示是同一个节点，只不过属性和儿子可能有变化，更新当前节点的属性和儿子
    if (isSameVnode(n1, n2)) {
      patch(n1, n2, el);
    } else {
      // 节点类型不同，则退出记录左边界
      break;
    }
    i++;
  }
  // e1 e2 指针从尾开始进行比较，确定最小更新数组的右边界
  while (i <= e1 && i <= e2) {
    const n1 = c1[e1];
    const n2 = c2[e2];
    // 节点类型相同则表示是同一个节点，只不过属性和儿子可能有变化，更新当前节点的属性和儿子
    if (isSameVnode(n1, n2)) {
      patch(n1, n2, el);
    } else {
      // 节点类型不同，则退出记录右边界
      break;
    }
    e1--;
    e2--;
  }
  // 情况一：节点增加的情况处理
  if (i > e1) {
    if (i <= e2) {
      // 有插入的部分
      let nextPos = e2 + 1; // 当前下一个元素是否存在
      let anchor = c2[nextPos]?.el;
      while (i <= e2) {
        // 增加 e1 - e2 之间的所有增加的节点
        patch(null, c2[i], el, anchor);
        i++;
      }
    }
  }
  // 情况二：节点减少的情况处理
  else if (i > e2) {
    if (i <= e1) {
      while (i <= e1) {
        // 删除 e2 - e1 之间所有的多余节点
        unmount(c1[i], parentComponent);
        i++;
      }
    }
  } else {
    // 以上确认不变化的节点，并且对插入和删除进行了处理
    // 情况三：最终比对乱序的情况
    let s1 = i;
    let s2 = i;
    // 做一个映射表，用于快速查找，看老的是否再新的里面，没有就删除，有的就更新
    const keyToNewIndexMap = new Map();
    // 倒序插入的个数
    let toBePatched = e2 - s2 + 1;
    // 填充映射表
    let newIndexToOldMapIndex = new Array(toBePatched).fill(0);
    // 建立新节点的映射表
    for (let i = s2; i <= e2; i++) {
      const vnode = c2[i];
      keyToNewIndexMap.set(vnode.key, i);
    }
    // 建立老节点在老数组中对应的索引位置
    for (let i = s1; i <= e1; i++) {
      const vnode = c1[i];
      // 查询老节点对应新节点的索引
      let newIndex = keyToNewIndexMap.get(vnode.key);
      // keyToNewIndexMap里面找不到老节点对应相同类型的新节点的索引，表示新节点数组种没有保留该老节点则删除
      if (newIndex === undefined) {
        unmount(vnode, parentComponent);
      } else {
        // 找到了则记录老节点在老数组中的索引，加一是为了防止0索引
        newIndexToOldMapIndex[newIndex - s2] = i + 1;
        // 更新
        patch(vnode, c2[newIndex], el);
      }
    }
    // 调整顺序，我们可以按照新的队列 倒序插入 往参照物前插入
    // 计算最长递增子序列（最长的连续序列）
    let increasingSeq = getSequence(newIndexToOldMapIndex);
    let j = increasingSeq.length;
    // 倒序插入
    for (let i = toBePatched; i > 0; i--) {
      // 插入锚点
      let newIndex = s2 + i;
      let anchor = c2[newIndex + 1]?.el;
      const vnode = c2[newIndex];
      // 说明是新增的元素
      if (!c2[newIndex].el) {
        // 创建插入
        patch(null, vnode, el, anchor);
      } else {
        if (i === increasingSeq[j]) {
          j--; // 做了diff算法的优化
        } else {
          hostInsert(vnode, el, anchor); // 接着倒序插入
        }
      }
    }
  }
};
```

### 情况一：节点增加的情况

![节点增加的情况](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251210154458847.png)

可以看到上图为节点减少的情况：

1. 通过 `i` 指针从前往后遍历确定了左边界为 `i=3`
2. 通过 `e1` 和 `e2` 指针从后往前遍历确定了右边界为 `e1=1`，`e2=4`
3. 由于 `i > e1` 所以进入情况一，增加 `e1 - e2` 之间的所有增加的节点，此时 `i=3`，`e1=1`，`e2=4`，所以增加了 `c2[2]` 、 `c2[3]`和 `c2[4]`

```js
// 情况一：节点增加的情况处理
if (i > e1) {
  if (i <= e2) {
    // 有插入的部分
    let nextPos = e2 + 1; // 当前下一个元素是否存在
    let anchor = c2[nextPos]?.el;
    while (i <= e2) {
      // 增加 e1 - e2 之间的所有增加的节点
      patch(null, c2[i], el, anchor);
      i++;
    }
  }
}
```

### 情况二：节点减少的情况

![节点减少的情况](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251210152512619.png)

可以看到上图为节点减少的情况：

1. 通过 `i` 指针从前往后遍历确定了左边界为 `i=2`
2. 通过 `e1` 和 `e2` 指针从后往前遍历确定了右边界为 `e1=3`，`e2=1`
3. 由于 `i > e2` 所以进入情况二，删除 `e2 - e1` 之间所有的多余节点，此时 `i=3，e1=3，e2=1`，所以删除了 `c1[3]` 和 `c1[2]`

```js
// 情况二：节点减少的情况处理
else if (i > e2) {
  if (i <= e1) {
    while (i <= e1) {
      // 删除 e2 - e1 之间所有的多余节点
      unmount(c1[i], parentComponent);
      i++;
    }
  }
}
```

### 情况三：节点位置的乱序的情况

![节点位置的乱序的情况](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20251210173753368.png)

可以看到上图为节点位置的乱序的情况，这类情况比较的复杂：

1. 通过 `i` 指针从前往后遍历确定了左边界为 `s1=s2=i=2`
2. 通过 `e1` 和 `e2` 指针从后往前遍历确定了右边界为 `e1=5`，`e2=5`
3. 计算需要调整顺序的元素个数`toBePatched=4`
4. 初始化映射表 `keyToNewIndexMap`，用于建立边界中元素`defc`在新子节点数组中的索引位置映射，比如`d->2;e->3;f->4;c->5`
5. 建立`newIndexToOldMapIndex`，用于建立旧子节点数组中对应边界中元素在边界数组中的索引位置和在旧字节点数组中的索引位置映射，比如`3`号索引下的值位为`2`，表示新子节点数组对应的边界数组中的`c`元素在第`3`号位置，旧子节点数组对应的边界数组的`c`元素在第`2`号位置。这里加一是为了防止 `0` 索引的情况，因为没有的元素默认为`0`会导致歧义。
6. 然后根据 `newIndexToOldMapIndex`来计算最长递增子序列，尽可能不改变连续序列
7. 然后从后往前插入乱序的元素

```js
else {
// 以上确认不变化的节点，并且对插入和删除进行了处理
// 情况三：最终比对乱序的情况
let s1 = i;
let s2 = i;
// 做一个映射表，用于快速查找，看老的是否再新的里面，没有就删除，有的就更新
const keyToNewIndexMap = new Map();
// 倒序插入的个数
let toBePatched = e2 - s2 + 1;
// 填充映射表
let newIndexToOldMapIndex = new Array(toBePatched).fill(0);
// 建立新节点的映射表
for (let i = s2; i <= e2; i++) {
  const vnode = c2[i];
  keyToNewIndexMap.set(vnode.key, i);
}
// 建立老节点在老数组中对应的索引位置
for (let i = s1; i <= e1; i++) {
  const vnode = c1[i];
  // 查询老节点对应新节点的索引
  let newIndex = keyToNewIndexMap.get(vnode.key);
  // keyToNewIndexMap里面找不到老节点对应相同类型的新节点的索引，表示新节点数组种没有保留该老节点则删除
  if (newIndex === undefined) {
    unmount(vnode, parentComponent);
  } else {
    // 找到了则记录老节点在老数组中的索引，加一是为了防止0索引
    newIndexToOldMapIndex[newIndex - s2] = i + 1;
    // 更新
    patch(vnode, c2[newIndex], el);
  }
}
// 调整顺序，我们可以按照新的队列 倒序插入 往参照物前插入
// 计算最长递增子序列（最长的连续序列）
let increasingSeq = getSequence(newIndexToOldMapIndex);
let j = increasingSeq.length;
// 倒序插入
for (let i = toBePatched; i > 0; i--) {
  // 插入锚点
  let newIndex = s2 + i;
  let anchor = c2[newIndex + 1]?.el;
  const vnode = c2[newIndex];
  // 说明是新增的元素
  if (!c2[newIndex].el) {
    // 创建插入
    patch(null, vnode, el, anchor);
  } else {
    if (i === increasingSeq[j]) {
      j--; // 做了diff算法的优化
    } else {
      hostInsert(vnode, el, anchor); // 接着倒序插入
    }
  }
}
```

## 最长递增子序列

## 优化策略

值得注意的是，纯静态节点在编译阶段已被 `hoist`（提升）并跳过 `patch` 过程，因此实际参与 `diff` 的通常是动态节点或混合节点。
