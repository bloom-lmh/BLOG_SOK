# Java集合

> 一句话定位：Java 集合（Java Collections Framework，JCF）是 JDK 提供的一套**统一的数据结构容器与操作算法库**，用来存储、组织、遍历和操作一组对象。它解决了原生数组「长度固定、只支持下标访问、增删需要手动搬移、缺乏通用算法」的痛点，是后端日常开发中使用频率最高、同时也是面试考察最深的 Java 基础设施之一。

---

## 为什么需要集合框架：从数组的痛点说起

在集合框架诞生之前，Java 只能用**数组**来批量存储对象。数组存在四个先天缺陷，这四条正是集合框架的设计动机：

1. **长度固定**：`int[] a = new int[10]` 一旦创建，长度无法改变；想扩容只能自己 new 一个更大的数组再 `System.arraycopy`。
2. **操作繁琐**：插入、删除一个元素需要手动搬移后续所有元素，代码又臭又长，极易写错下标。
3. **功能单一**：没有现成的「判断是否存在」「排序」「去重」「键值映射」等能力，全部要自己造轮子。
4. **类型不安全**：`Object[]` 数组什么都能塞，取出来还要强转，运行时才报 `ClassCastException`。

集合框架用**接口 + 实现类 + 算法**三件套统一解决了这些问题：用接口定义「能做什么」，用实现类提供「各种数据结构的性能取舍」，用 `Collections` 工具类提供「排序/查找/同步」等通用算法。

```java
// 数组的痛点 vs 集合的优雅
// 数组：想存一个会增长的列表，必须自己管理扩容
String[] arr = new String[10];
// ... 满了怎么办？手动 new String[20]，再 copy，代码全是你自己写的

// 集合：一行搞定，扩容、遍历、判空全帮你做好
List<String> list = new ArrayList<>();
list.add("a");
list.add("b");
list.contains("a"); // 内置判断，无需手写 for 循环
```

### 集合框架三大件

| 组成 | 作用 | 代表 |
| --- | --- | --- |
| **接口（Interfaces）** | 定义一组抽象的数据结构契约 | `Collection`、`List`、`Set`、`Map`、`Queue` |
| **实现类（Implementations）** | 接口的具体数据结构实现，各有性能侧重 | `ArrayList`、`LinkedList`、`HashMap`、`TreeMap` |
| **算法（Algorithms）** | 对集合执行计算（排序、查找、洗牌、同步包装） | `Collections.sort`、`Collections.binarySearch` |

---

## 集合框架全景图

Java 集合分为两大体系：**`Collection`（单列集合，存单个元素）** 和 **`Map`（双列集合，存键值对）**。两者是并列的接口，没有继承关系。下面这张图是整个框架的核心骨架，后续所有章节都围绕它展开。

```
Iterable（接口，提供 iterator() 迭代能力）
   └── Collection（接口，单列集合根接口）
        ├── List（有序、可重复、有下标）
        │    ├── ArrayList       —— 动态数组，查询 O(1)
        │    ├── LinkedList      —— 双向链表，头尾增删 O(1)
        │    ├── Vector          —— 线程安全但已过时
        │    └── Stack          —— 继承 Vector，已过时
        ├── Set（无序、不可重复）
        │    ├── HashSet         —— 基于 HashMap，O(1)
        │    ├── LinkedHashSet   —— 基于 LinkedHashMap，记录插入顺序
        │    ├── TreeSet         —— 基于 TreeMap 红黑树，自动排序
        │    └── CopyOnWriteArraySet —— 并发 Set
        └── Queue（队列）
             ├── LinkedList      —— 也实现了 Deque，可当双向队列
             ├── PriorityQueue   —— 二叉堆实现的优先级队列
             ├── ArrayDeque      —— 数组实现的双端队列（推荐替代 Stack）
             └── Deque（接口，双端队列）

Map（接口，双列集合根接口，与 Collection 并列）
    ├── HashMap           —— 数组 + 链表 + 红黑树，最常用
    ├── LinkedHashMap     —— 有序 HashMap，可实现 LRU
    ├── TreeMap           —— 红黑树，按键排序
    ├── Hashtable         —— 线程安全但已过时
    ├── ConcurrentHashMap —— 并发场景主流
    └── Properties        —— 继承 Hashtable，用于配置文件
```

**两条记忆主线**：
- **Collection 这一支**：讲的是「一堆单个元素怎么放、怎么取」。
- **Map 这一支**：讲的是「键值对怎么存、怎么快速通过 key 找到 value」。

---

## 基础篇

### 一、Collection 接口：单列集合的根

`Collection` 是所有单列集合的顶层接口，定义了单列集合最通用的行为。`List`、`Set`、`Queue` 都继承自它。

#### 常用方法一览

| 方法 | 返回值 | 说明 | 使用场景 |
| --- | --- | --- | --- |
| `add(E e)` | `boolean` | 添加元素，成功返回 true | 通用添加 |
| `remove(Object o)` | `boolean` | 删除第一个匹配的元素 | 通用删除 |
| `contains(Object o)` | `boolean` | 是否包含某元素（内部调用 `equals`） | 判断是否存在 |
| `size()` | `int` | 元素个数 | 遍历边界 |
| `isEmpty()` | `boolean` | 是否为空 | 判空 |
| `clear()` | `void` | 清空所有元素 | 重置 |
| `iterator()` | `Iterator<E>` | 获取迭代器 | 遍历/删除 |
| `toArray()` | `Object[]` | 转数组 | 与数组 API 交互 |
| `addAll(Collection c)` | `boolean` | 批量添加 | 合并集合 |
| `removeAll(Collection c)` | `boolean` | 删除与 c 的交集（差集） | 集合运算 |
| `retainAll(Collection c)` | `boolean` | 仅保留与 c 的交集 | 求交集 |
| `containsAll(Collection c)` | `boolean` | 是否包含 c 的全部元素 | 包含判断 |

#### 迭代器 Iterator 的正确用法

`Iterator` 是遍历集合的「标准姿势」，也是理解 `fail-fast`（快速失败）机制的基础。它有三个核心方法：`hasNext()`、`next()`、`remove()`。

```java
Collection<String> c = new ArrayList<>(Arrays.asList("a", "b", "c"));

// 标准迭代写法：先 hasNext 再 next，绝不能反过来
Iterator<String> it = c.iterator();
while (it.hasNext()) {          // 先判断还有没有下一个
    String s = it.next();       // 再取下一个（指针后移）
    if ("b".equals(s)) {
        it.remove();            // 遍历中删除唯一安全的方式：迭代器自己的 remove
    }
}
```

::: tip 💡 面试题：遍历时删除元素为什么不能直接用 `collection.remove()`？
因为集合内部用 `modCount` 记录结构修改次数，迭代器创建时会快照一份 `expectedModCount`，每次 `next()` 都会校验两者是否一致。直接调 `collection.remove()` 会让 `modCount +1` 而 `expectedModCount` 不变，下次 `next()` 时抛出 `ConcurrentModificationException`。迭代器自己的 `remove()` 删除后会把两者同步，所以安全。
:::

```java
// 迭代器的 next() 源码（ArrayList.Itr 简化）
public E next() {
    checkForComodification();          // 每次取元素前先校验 modCount
    int i = cursor;
    if (i >= size) throw new NoSuchElementException();
    Object[] elementData = ArrayList.this.elementData;
    cursor = i + 1;
    return (E) elementData[lastRet = i];
}
final void checkForComodification() {
    // 集合被「非迭代器自身」修改过 -> 立刻失败，防止遍历到脏数据
    if (modCount != expectedModCount)
        throw new ConcurrentModificationException();
}
```

---

### 二、List：有序、可重复、有下标

`List` 在 `Collection` 基础上增加了「下标」概念：元素有确定的顺序（与插入顺序一致），可以有重复元素，可以通过下标随机访问。

#### List 独有方法

| 方法 | 说明 | 使用场景 |
| --- | --- | --- |
| `add(int index, E e)` | 在指定位置插入 | 任意位置插入 |
| `get(int index)` | 按下标取元素 | 随机访问 |
| `set(int index, E e)` | 按下标替换元素并返回旧值 | 更新指定位置 |
| `remove(int index)` | 按下标删除 | 删除指定位置 |
| `indexOf(Object o)` | 第一次出现的下标 | 查找位置 |
| `lastIndexOf(Object o)` | 最后一次出现的下标 | 查找位置 |
| `subList(int from, int to)` | 截取子列表（左闭右开） | 分页/切片 |

::: tip 💡 面试题：`remove(Object)` 和 `remove(int)` 为什么容易踩坑？
`List<Integer>` 中 `list.remove(1)` 会命中 `remove(int index)` 删除下标 1 的元素，而不是删除值为 1 的元素。原因是重载方法解析时，编译器优先选择参数类型精确匹配的版本（int 是原生类型，比 Integer 装箱更精确）。想删除值 1 必须写 `list.remove(Integer.valueOf(1))` 或 `list.remove((Object) 1)`。
:::

#### 2.1 ArrayList：动态数组

`ArrayList` 是最常用的 List 实现，**80% 的场景用它就够了**。它的本质是「会自己扩容的数组」。

**核心字段与结构**：

```java
// ArrayList 底层就是这一个数组（JDK 8 源码）
transient Object[] elementData;   // 真正存元素的地方
private int size;                 // 实际元素个数（注意：不是数组长度）

// 结构示意（size=4，数组长度=10）
// elementData: [a][b][c][d][ ][ ][ ][ ][ ][ ]
//                0  1  2  3  4 ...          9
//                |----- size=4 -----|
```

**为什么查询快（O(1)）**：数组是连续内存，`get(i)` 直接算地址 `首地址 + i × 元素大小`，一次内存访问搞定。

**为什么中间增删慢（O(n)）**：数组要求元素连续，中间插入需要把后续所有元素往后搬一格。

```java
// ArrayList.get 源码（JDK 8）：先检查下标越界，再直接数组取值
public E get(int index) {
    rangeCheck(index);              // 越界抛 IndexOutOfBoundsException
    return elementData(index);      // 就是 elementData[index]，O(1)
}
```

**构造与懒加载**：

```java
// 三种构造方式
new ArrayList<>();          // 1. 空参：elementData 指向共享的空数组，第一次 add 才扩容到 10
new ArrayList<>(20);        // 2. 指定容量：直接创建长度 20 的数组（推荐，避免频繁扩容）
new ArrayList<>(collection); // 3. 传入集合：按集合大小初始化并批量拷贝

// 空参构造的懒加载细节（JDK 8）
private static final Object[] DEFAULTCAPACITY_EMPTY_ELEMENTDATA = {}; // 共享的空数组
public ArrayList() {
    this.elementData = DEFAULTCAPACITY_EMPTY_ELEMENTDATA; // 此时长度是 0，不是 10！
}
```

::: tip 💡 面试题：`new ArrayList()` 的初始容量是多少？
**表面答案是 0**：空参构造只是让 `elementData` 指向一个长度为 0 的共享空数组，并没有立即分配 10 个空间。**第一次 `add` 时**才会通过 `grow()` 扩容到默认容量 10。这是 JDK 8 引入的懒加载优化，目的是避免大量空 ArrayList 白占内存。
:::

**扩容机制（grow 详解）**：

```java
// ArrayList.add 触发扩容的核心逻辑（JDK 8 源码简化 + 逐行注释）
private void add(E e, Object[] elementData, int s) {
    if (s == elementData.length)          // size 追平数组长度 -> 满了，先扩容
        elementData = grow();
    elementData[s] = e;                   // 放到末尾，size++ 
}

private Object[] grow() {
    return grow(size + 1);                // 至少需要能放下 size+1 个
}

private Object[] grow(int minCapacity) {
    int oldCapacity = elementData.length;
    // 关键：oldCapacity + (oldCapacity >> 1)，右移 1 位 = 除以 2，即扩容 1.5 倍
    // 选 1.5 倍是「空间浪费」和「扩容频率」的工程折中：太大浪费内存，太小频繁搬移
    int newCapacity = oldCapacity + (oldCapacity >> 1);
    if (newCapacity - minCapacity <= 0) {
        // 1.5 倍还不够用（例如从 0 开始，或一次性 addAll 很多元素）
        if (elementData == DEFAULTCAPACITY_EMPTY_ELEMENTDATA)
            newCapacity = Math.max(DEFAULT_CAPACITY, minCapacity); // 首次：至少 10
        else if (minCapacity < 0)
            throw new OutOfMemoryError();
        else
            newCapacity = minCapacity;     // 直接用所需的最小值
    }
    // 数组是定长的，「扩容」的本质 = 新建更大的数组 + 整体复制（开销 O(n)）
    return elementData = Arrays.copyOf(elementData, newCapacity);
}
```

```java
// 完整可运行示例：验证扩容
public class ArrayListGrowDemo {
    public static void main(String[] args) throws Exception {
        ArrayList<Integer> list = new ArrayList<>(); // 此刻容量为 0
        list.add(1);                                  // 第一次 add -> 扩容到 10
        System.out.println("容量=" + capacity(list)); // 输出 10

        for (int i = 2; i <= 11; i++) list.add(i);   // 加到第 11 个 -> 超过 10
        System.out.println("容量=" + capacity(list)); // 输出 15（10 * 1.5）
    }

    // 用反射读私有字段 elementData 的长度，观察容量变化
    static int capacity(ArrayList<?> list) throws Exception {
        java.lang.reflect.Field f = ArrayList.class.getDeclaredField("elementData");
        f.setAccessible(true);
        return ((Object[]) f.get(list)).length;
    }
}
```

**RandomAccess 标记接口**：`ArrayList` 实现了 `RandomAccess` 接口，这是一个**空接口（标记接口）**，作用是告诉使用者「这个 List 支持 O(1) 随机访问」。`Collections.binarySearch` 等算法会据此选择「下标二分」还是「迭代器遍历」两种策略。

```java
public interface RandomAccess {}   // 空接口，纯粹作为「能力标签」

// Collections.binarySearch 内部据此分支：
if (list instanceof RandomAccess) {
    return indexedBinarySearch(list, key);   // 数组式：直接按中点下标取，O(log n)
} else {
    return iteratorBinarySearch(list, key);  // 链表式：先迭代到中点再取，O(n log n)
}
```

#### 2.2 LinkedList：双向链表

`LinkedList` 底层是**双向链表**，同时实现了 `List` 和 `Deque` 接口，既能当列表用，也能当栈/队列用。

**核心结构：Node 节点**：

```java
// LinkedList 的节点定义（JDK 8 源码）
private static class Node<E> {
    E item;         // 当前节点的数据
    Node<E> next;   // 指向后一个节点
    Node<E> prev;   // 指向前一个节点
    Node(Node<E> prev, E element, Node<E> next) {
        this.item = element; this.next = next; this.prev = prev;
    }
}
// LinkedList 持有首尾两个指针
transient Node<E> first;   // 头节点
transient Node<E> last;    // 尾节点

// 结构示意（双向链表）
// first -> [A] <-> [B] <-> [C] <- last
//           ^               ^
//         prev=head       next=tail
```

**为什么头尾增删快（O(1)）**：链表节点通过指针串联，插入/删除只需改相邻节点的 `next`/`prev` 指针，不涉及搬移。

**为什么查询慢（O(n)）**：没有下标直达，`get(i)` 必须从头（或尾，取决于离哪端近）逐个遍历到目标位置。

```java
// LinkedList.get 源码：先判断离头近还是离尾近，再就近遍历
public E get(int index) {
    checkElementIndex(index);
    return node(index).item;
}
Node<E> node(int index) {
    if (index < (size >> 1)) {      // 目标在前半段：从头往后找
        Node<E> x = first;
        for (int i = 0; i < index; i++) x = x.next;
        return x;
    } else {                        // 目标在后半段：从尾往前找（这已是最优的 O(n/2)）
        Node<E> x = last;
        for (int i = size - 1; i > index; i--) x = x.prev;
        return x;
    }
}
```

#### 2.3 ArrayList vs LinkedList 对比

| 对比项 | ArrayList | LinkedList |
| --- | --- | --- |
| 底层结构 | 动态数组 `Object[]` | 双向链表 `Node` |
| 查询 `get(i)` | **O(1)**，下标直达 | O(n)，需遍历 |
| 头尾增删 | 头部增删 O(n)（搬移），尾部增删 O(1) 均摊 | **O(1)**，改指针 |
| 中间增删 | O(n)，搬移后续元素 | O(n)，先遍历定位再改指针 |
| 内存占用 | 连续内存，只存数据，但扩容有冗余 | 每个节点额外存 `prev`+`next` 两个指针 |
| 随机访问接口 | 实现 `RandomAccess` | 未实现 |
| 适用场景 | **查多写少**、有下标需求 | 频繁头尾增删、当队列/栈 |

::: tip 💡 面试题：ArrayList 和 LinkedList 谁更快？为什么实际开发几乎只用 ArrayList？
「增删快」的说法只对 **LinkedList 头尾增删**成立；中间增删两者都要 O(n) 定位，LinkedList 反而因为缓存不友好（节点分散在堆各处）实际更慢。而且现代 CPU 缓存让连续内存的数组遍历极快，LinkedList 的指针跳转会导致大量缓存未命中。所以除非明确「只在头部频繁增删」，否则默认用 ArrayList。
:::

#### 2.4 Vector 与 Stack：已过时的老古董

`Vector` 是 JDK 1.0 时代的线程安全 List，`Stack` 继承它实现了栈。两者都已过时：

| 对比项 | ArrayList | Vector |
| --- | --- | --- |
| 出现版本 | JDK 1.2 | JDK 1.0 |
| 线程安全 | 否 | 是（所有方法 `synchronized`） |
| 扩容 | 1.5 倍 | 2 倍 |
| 性能 | 高 | 低（每次操作都加锁，即使单线程） |
| 现状 | 主流 | 基本弃用 |

```java
// 为什么说 Vector 过时：方法级别加锁，粒度太粗、性能差
public synchronized boolean add(E e) { ... }  // Vector 每个方法都这样

// 现代替代方案：
// 1. 线程安全 List：用 Collections.synchronizedList 或 CopyOnWriteArrayList（读多写少）
// 2. 栈：用 ArrayDeque 替代 Stack（官方 Stack 注释里自己都建议用 Deque）
Deque<Integer> stack = new ArrayDeque<>();
stack.push(1); stack.push(2); stack.pop();   // 比 Stack 快，且无过时 API
```

---

### 三、Set：无序、不可重复

`Set` 的灵魂是**不可重复**：同一个元素（按 `equals` 判定）最多出现一次。`Set` 接口没有新增方法，完全复用 `Collection` 的方法，只是语义上强制了「去重」。

| 实现类 | 底层 | 增删查复杂度 | 是否有序 |
| --- | --- | --- | --- |
| HashSet | HashMap | O(1) | 无序 |
| LinkedHashSet | LinkedHashMap | O(1) | 按插入顺序 |
| TreeSet | TreeMap（红黑树） | O(log n) | 按元素大小排序 |

#### 3.1 HashSet：基于 HashMap 的去重神器

`HashSet` 内部**委托一个 `HashMap`** 实现，把元素当作 key，value 是一个固定的占位对象 `PRESENT`。

```java
// HashSet 的底层真相（JDK 8 源码）
private transient HashMap<E,Object> map;
private static final Object PRESENT = new Object();  // 所有 key 共用的假 value

public boolean add(E e) {
    // 复用 HashMap.put：key 已存在返回旧值(非null)，key 新增返回 null
    return map.put(e, PRESENT) == null;  // 返回 true 表示「真的加进去了」
}
public boolean contains(Object o) { return map.containsKey(o); }  // 判断存在即判断 key
```

```java
// 完整示例：HashSet 去重 + 判存
Set<Integer> set = new HashSet<>();
set.add(1);   // true
set.add(1);   // false，1 已存在，不会重复加入
set.add(2);   // true
System.out.println(set);          // [1, 2]
System.out.println(set.contains(2)); // true，O(1) 判存
```

#### 3.2 equals 与 hashCode 契约：Set/Map 的地基

**为什么重写 `equals` 必须重写 `hashCode`？** 这是整个哈希类集合的基石问题。因为 `HashMap`/`HashSet` 的查找分两步：

```
查找 key 的两步定位
1. 先算 key.hashCode()，再散列到桶下标 -> 快速缩小范围到「一个桶」
2. 桶内再逐个用 equals() 精确比对 -> 确定「到底是不是同一个对象」
```

如果两个对象 `equals` 相等但 `hashCode` 不同，第一步就会把它们散列到**不同的桶**，第二步的 `equals` 根本没机会执行——于是「明明相等」的两个对象被当成不同的，去重、查找全部失效。

```java
// 反例：只重写 equals 不重写 hashCode，去重失效
class User {
    String name;
    User(String name) { this.name = name; }

    @Override public boolean equals(Object o) {          // 按 name 判等
        if (this == o) return true;
        if (!(o instanceof User)) return false;
        return name.equals(((User) o).name);
    }
    // ❌ 没重写 hashCode！两个 name 相同的 User，hashCode 默认按内存地址算，必然不同
}

// 结果：两个逻辑相等的对象被散列到不同桶，HashSet 认为它们是不同元素
Set<User> set = new HashSet<>();
set.add(new User("张三"));
set.add(new User("张三"));   // ❌ 去重失效，set 里现在有两个「张三」
System.out.println(set.size()); // 输出 2（错误！本应是 1）
```

**equals 与 hashCode 的三大契约**（来自 `Object` 的 Javadoc，必须背）：

1. `equals` 相等的两个对象，`hashCode` **必须相等**。
2. `hashCode` 相等的两个对象，`equals` **不一定相等**（允许哈希冲突）。
3. 重写 `equals` 就必须重写 `hashCode`（否则违反第 1 条）。

```java
// 正确写法：equals 和 hashCode 一起重写，字段保持一致
class User {
    String name;
    User(String name) { this.name = name; }

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof User)) return false;
        return name.equals(((User) o).name);
    }
    @Override public int hashCode() {
        return Objects.hash(name);   // 用同一个字段参与 hashCode，保证与 equals 一致
    }
}
// 现在 set.size() 正确输出 1
```

::: tip 💡 面试题：两个对象 `hashCode` 相同，`equals` 一定相同吗？
**不一定。** `hashCode` 相同只代表它们落在同一个哈希桶里（哈希冲突），最终是否相等还要看桶内的 `equals` 比对。反过来才对：`equals` 相同则 `hashCode` 必然相同。这就是为什么说「hashCode 是粗筛，equals 是精筛」。
:::

#### 3.3 LinkedHashSet 与 TreeSet

- **LinkedHashSet**：底层是 `LinkedHashMap`，在 HashSet 基础上用双向链表记录了**插入顺序**，适合「既要去重、又要保持插入顺序」的场景。
- **TreeSet**：底层是 `TreeMap`（红黑树），元素**自动按大小排序**，适合「需要有序且去重」的场景，但代价是增删查从 O(1) 降到 O(log n)。

```java
// LinkedHashSet：保持插入顺序
Set<String> linked = new LinkedHashSet<>();
linked.add("b"); linked.add("a"); linked.add("c");
System.out.println(linked);  // [b, a, c]  —— 严格按插入顺序

// TreeSet：自动排序
Set<String> tree = new TreeSet<>();
tree.add("b"); tree.add("a"); tree.add("c");
System.out.println(tree);    // [a, b, c]  —— 按自然顺序

// TreeSet 自定义排序：降序
Set<Integer> desc = new TreeSet<>((a, b) -> b - a);  // 传入 Comparator
```

---

### 四、Queue 与 Deque：队列与双端队列

#### 4.1 Queue 接口：两类方法，别混用

`Queue` 的方法分为两组，核心区别是**「操作失败时是抛异常还是返回特殊值」**：

| 操作 | 抛异常版 | 返回特殊值版 | 特殊值含义 |
| --- | --- | --- | --- |
| 入队（队尾） | `add(e)` | `offer(e)` | offer 失败返回 false |
| 出队（队头） | `remove()` | `poll()` | poll 空队列返回 null |
| 查看队头 | `element()` | `peek()` | peek 空队列返回 null |

```java
Queue<Integer> q = new LinkedList<>();
q.offer(1); q.offer(2);   // 入队：1 在前 2 在后
q.peek();                 // 1，只看不取
q.poll();                 // 1，取出并移除队头
q.poll();                 // 2
q.poll();                 // null，空队列返回 null（而不是抛异常）
```

#### 4.2 PriorityQueue：优先级队列

`PriorityQueue` 是一个**二叉堆**实现的优先级队列，出队顺序不是「先进先出」，而是**按优先级（元素大小）出队**：每次 `poll()` 都是当前最小的元素。适合 TopK、任务调度等场景。

```java
// 默认小顶堆：每次 poll 取出最小元素
PriorityQueue<Integer> pq = new PriorityQueue<>();
pq.offer(5); pq.offer(1); pq.offer(3);
System.out.println(pq.poll()); // 1（最小先出）
System.out.println(pq.poll()); // 3
System.out.println(pq.poll()); // 5

// 大顶堆：传 Comparator 反转，用于「求前 K 大」
PriorityQueue<Integer> maxHeap = new PriorityQueue<>((a, b) -> b - a);
```

#### 4.3 Deque 与 ArrayDeque：栈和队列的统一

`Deque`（双端队列）两端都能进出，**官方推荐用它替代 `Stack`**。`ArrayDeque` 是数组实现的双端队列，无容量限制、性能优于 `LinkedList`，是首选实现。

```java
// 当栈用：push/pop 都在头部
Deque<Integer> stack = new ArrayDeque<>();
stack.push(1); stack.push(2);   // 2 在栈顶
stack.pop();                    // 2，后进先出

// 当队列用：offer 尾进，poll 头出
Deque<Integer> queue = new ArrayDeque<>();
queue.offer(1); queue.offer(2);
queue.poll();                   // 1，先进先出

// 双端操作：两端都能进出
queue.offerFirst(0);  // 头插
queue.offerLast(3);   // 尾插
queue.pollFirst();    // 取头
queue.pollLast();     // 取尾
```

---

## 高级篇

### 五、Map 体系总览

`Map` 是与 `Collection` 并列的另一大根接口，存储「键值对」（key-value），通过 key 快速查找 value。**key 不可重复**（新值覆盖旧值），value 可重复。

| 实现类 | 底层 | 是否有序 | 线程安全 | 使用场景 |
| --- | --- | --- | --- | --- |
| HashMap | 数组 + 链表 + 红黑树 | 无序 | 否 | 最通用的键值存储 |
| LinkedHashMap | HashMap + 双向链表 | 按插入/访问顺序 | 否 | LRU 缓存、保持顺序 |
| TreeMap | 红黑树 | 按 key 排序 | 否 | 需要 key 有序的场景 |
| Hashtable | 数组 + 链表 | 无序 | 是（过时） | 基本不用 |
| ConcurrentHashMap | 数组 + 链表 + 红黑树 | 无序 | 是 | 并发场景主流 |

**Map 常用方法一览**：

| 方法 | 说明 | 使用场景 |
| --- | --- | --- |
| `put(K, V)` | 插入键值对，返回旧值 | 写入 |
| `get(K)` | 按键取值，不存在返回 null | 读取 |
| `getOrDefault(K, V)` | 取值，不存在返回默认值 | 避免判空 |
| `containsKey(K)` | 是否含某 key | 判断存在 |
| `containsValue(V)` | 是否含某 value | 判断存在 |
| `remove(K)` | 删除键值对，返回被删 value | 删除 |
| `keySet()` | 所有 key 的 Set | 遍历 key |
| `values()` | 所有 value 的集合 | 遍历 value |
| `entrySet()` | 所有键值对 | 遍历整个 Map |
| `putIfAbsent(K, V)` | 不存在才放入（JDK 8） | 幂等写入 |
| `computeIfAbsent(K, fn)` | 不存在才计算并放入（JDK 8） | 惰性初始化 |
| `merge(K, V, fn)` | 合并新旧值（JDK 8） | 计数/累加 |

```java
// 完整示例：Map 常用操作
Map<String, Integer> map = new HashMap<>();
map.put("apple", 1);
map.put("apple", 2);                       // key 重复 -> 覆盖，返回旧值 1
map.get("apple");                          // 2
map.getOrDefault("banana", 0);             // 0，不存在的 key 给默认值
map.putIfAbsent("apple", 100);             // 已存在，不覆盖，仍为 2
map.computeIfAbsent("banana", k -> k.length()); // banana 不存在，计算 length=6 并放入
map.merge("apple", 3, Integer::sum);       // 合并：2 + 3 = 5

// 遍历 Map 的正确姿势（三种）
for (String key : map.keySet()) { }                    // 1. 遍历 key
for (Integer v : map.values()) { }                     // 2. 遍历 value
for (Map.Entry<String, Integer> e : map.entrySet()) {  // 3. 遍历键值对（最常用，可同时拿 key 和 value）
    System.out.println(e.getKey() + "=" + e.getValue());
}
```

---

### 六、HashMap：面试核心中的核心

`HashMap` 是整个 Java 集合里考察最深的类，没有之一。必须彻底掌握**数据结构演进、put 完整流程、hash 算法、扩容机制、树化条件、线程不安全原因**。

#### 6.1 数据结构演进：1.7 → 1.8

- **JDK 1.7**：`数组 + 链表`。链表插入用**头插法**（新元素插到链表头部）。
- **JDK 1.8**：`数组 + 链表 + 红黑树`。链表插入改为**尾插法**，并引入红黑树解决「链表过长导致查询退化」的问题。

```
JDK 1.8 HashMap 结构示意
table（Node 数组，长度 n，恒为 2 的幂）
[0] -> Node -> Node -> Node            （链表：长度 < 8）
[1] -> (空)
[2] -> TreeNode <-> TreeNode ...       （红黑树：链表长度 >= 8 且 n >= 64 时树化）
      （TreeNode 是红黑树节点，既有 left/right 又保留了 next 指针）
...
[n-1] -> Node
```

#### 6.2 关键字段与常量（背下来）

```java
// JDK 8 HashMap 的静态常量与字段（源码）
static final int DEFAULT_INITIAL_CAPACITY = 1 << 4;   // 默认初始容量 16
static final int MAXIMUM_CAPACITY     = 1 << 30;      // 最大容量（2^30，避免移位溢出）
static final float DEFAULT_LOAD_FACTOR = 0.75f;       // 默认负载因子 0.75
static final int TREEIFY_THRESHOLD   = 8;             // 链表长度 >= 8 触发树化
static final int UNTREEIFY_THRESHOLD = 6;             // 树节点 <= 6 退化为链表
static final int MIN_TREEIFY_CAPACITY = 64;           // 树化的另一个前提：数组长度 >= 64

transient Node<K,V>[] table;   // 真正的桶数组（懒加载，首次 put 才初始化）
transient int size;            // 键值对总数
int threshold;                 // 扩容阈值 = 容量 * 负载因子
final float loadFactor;        // 负载因子
```

#### 6.3 Node 与 TreeNode 节点结构

```java
// 普通链表节点（JDK 8 源码）
static class Node<K,V> implements Map.Entry<K,V> {
    final int hash;        // key 的哈希值（缓存下来，扩容时无需重算）
    final K key;
    V value;
    Node<K,V> next;        // 指向同桶下一个节点
}

// 红黑树节点：继承 Node，额外持有树的指针
static final class TreeNode<K,V> extends LinkedHashMap.Entry<K,V> {
    TreeNode<K,V> parent;  // 父节点
    TreeNode<K,V> left;    // 左孩子
    TreeNode<K,V> right;   // 右孩子
    TreeNode<K,V> prev;    // 删除时维护的双向链表指针
    boolean red;           // 红黑树的颜色标记
}
```

#### 6.4 hash 算法：为什么高低位要异或

```java
// HashMap 的 hash 函数（JDK 8 源码）
static final int hash(Object key) {
    int h;
    // 关键：h ^ (h >>> 16)，让高 16 位也参与运算
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

**为什么要 `h ^ (h >>> 16)`？** 因为最终定位下标用的是 `(n - 1) & hash`。当数组长度 n 较小时（如默认 16，`n-1 = 0b1111`），这个与运算**只用到 hash 的低 4 位**，高 28 位完全被忽略。如果 key 的 `hashCode` 高位变化大、低位变化小（很多整数就符合这个特征），就会大量碰撞到同一个桶。把高 16 位右移后与低 16 位异或，相当于**把高位的信息「折叠」进低位**，让低位更均匀，从而减少哈希冲突。

```java
// 定位下标的精髓：n 恒为 2 的幂
// n = 16 时，n-1 = 15 = 0b...00001111
// 任何 hash 与 0b1111 相与，结果一定落在 0~15 之间，且分布由 hash 低位决定
int index = (n - 1) & hash;   // 等价于 hash % n，但位运算比取模快得多
```

::: tip 💡 面试题：HashMap 的数组长度为什么必须是 2 的幂？
两个原因：**其一**，`(n - 1) & hash` 要能等价于 `hash % n`，前提就是 n 是 2 的幂——此时 `n-1` 的二进制是连续的一串 1，与运算结果恰好是「取 hash 的低 log2(n) 位」，既快又均匀；**其二**，扩容翻倍（`n << 1`）后依然是 2 的幂，可以配合 `hash & oldCap` 快速判断元素新位置（见 6.6），无需重算 hash。
:::

#### 6.5 put 完整流程（手绘必备）

```java
// HashMap.put -> putVal 的完整流程（JDK 8 源码简化 + 关键注释）
public V put(K key, V value) {
    return putVal(hash(key), key, value, false, true);
}

final V putVal(int hash, K key, V value, boolean onlyIfAbsent, boolean evict) {
    Node<K,V>[] tab; Node<K,V> p; int n, i;
    // ① 数组未初始化（懒加载）-> 先 resize 初始化
    if ((tab = table) == null || (n = tab.length) == 0)
        n = (tab = resize()).length;
    // ② 定位桶，桶为空 -> 直接放新节点
    if ((p = tab[i = (n - 1) & hash]) == null)
        tab[i] = newNode(hash, key, value, null);
    else {
        Node<K,V> e; K k;
        // ③ 桶首节点就是目标 key -> 记录待覆盖
        if (p.hash == hash && ((k = p.key) == key || (key != null && key.equals(k))))
            e = p;
        // ④ 桶是红黑树 -> 走树的插入逻辑
        else if (p instanceof TreeNode)
            e = ((TreeNode<K,V>)p).putTreeVal(this, tab, hash, key, value);
        // ⑤ 桶是链表 -> 遍历查找/尾插
        else {
            for (int binCount = 0; ; ++binCount) {
                if ((e = p.next) == null) {          // 到链表尾，尾插新节点
                    p.next = newNode(hash, key, value, null);
                    if (binCount >= TREEIFY_THRESHOLD - 1) // 插入后链表长度达到 8
                        treeifyBin(tab, hash);        // 尝试树化（还需数组长度 >= 64）
                    break;
                }
                if (e.hash == hash && ((k = e.key) == key || (key != null && key.equals(k))))
                    break;                            // 找到已存在的 key
                p = e;
            }
        }
        // ⑥ 命中已存在的 key -> 覆盖 value，返回旧值
        if (e != null) {
            V oldValue = e.value;
            if (!onlyIfAbsent || oldValue == null)
                e.value = value;
            return oldValue;
        }
    }
    ++modCount;
    // ⑦ 元素数超过阈值 -> 扩容
    if (++size > threshold)
        resize();
    return null;
}
```

**put 流程文字版（面试手绘顺序）**：

```
put(key, value)
   │
   ▼
① hash(key) = (h = key.hashCode()) ^ (h >>> 16)
   │
   ▼
② table 是否为 null/空？ ──是──> resize() 初始化
   │否
   ▼
③ 计算下标 i = (n-1) & hash，取出 tab[i]
   │
   ├── tab[i] 为空 ─────────────> 直接放入新 Node
   │
   ├── tab[i] 是 TreeNode ──────> 走红黑树插入 putTreeVal
   │
   └── tab[i] 是链表 ───────────> 遍历：
         ├── 找到相同 key ──────> 覆盖 value，返回旧值
         └── 遍历到尾没找到 ────> 尾插新节点
              └── 链表长度 >= 8 ─> treeifyBin（数组 < 64 则只扩容不树化）
   │
   ▼
④ size++ 后是否 > threshold ──是──> resize() 扩容
```

#### 6.6 resize 扩容详解

当 `size > threshold`（容量 × 0.75）时触发扩容，容量**翻倍**。扩容是 HashMap 最耗性能的操作，涉及重新散列所有元素，所以构造时应预设合适容量。

```java
// resize 核心逻辑（JDK 8 源码简化）
final Node<K,V>[] resize() {
    Node<K,V>[] oldTab = table;
    int oldCap = (oldTab == null) ? 0 : oldTab.length;
    int oldThr = threshold;
    int newCap, newThr = 0;

    if (oldCap > 0) {
        if (oldCap >= MAXIMUM_CAPACITY) {   // 已到上限，不再扩容
            threshold = Integer.MAX_VALUE;
            return oldTab;
        }
        newCap = oldCap << 1;               // 关键：容量翻倍
        // ...
    } else if (oldThr > 0) {
        newCap = oldThr;                    // 构造时指定了容量
    } else {
        newCap = DEFAULT_INITIAL_CAPACITY;  // 首次：16
        newThr = (int)(DEFAULT_LOAD_FACTOR * DEFAULT_INITIAL_CAPACITY); // 12
    }
    // ... 计算 newThr = newCap * loadFactor ...

    // 重新散列：遍历每个桶
    for (int j = 0; j < oldCap; ++j) {
        Node<K,V> e = oldTab[j];
        if (e != null) {
            oldTab[j] = null;
            if (e.next == null)                    // 单节点：直接重算下标
                newTab[e.hash & (newCap - 1)] = e;
            else if (e instanceof TreeNode)         // 红黑树：拆分
                ((TreeNode<K,V>)e).split(this, newTab, j, oldCap);
            else {                                  // 链表：拆成 lo / hi 两条
                // 关键位运算：hash & oldCap 判断新位置
                // 结果为 0 -> 留在原下标；结果非 0 -> 原下标 + oldCap
                Node<K,V> loHead = null, loTail = null;   // 低链：留原位
                Node<K,V> hiHead = null, hiTail = null;   // 高链：移位
                Node<K,V> next;
                do {
                    next = e.next;
                    if ((e.hash & oldCap) == 0) {   // 新增位是 0 -> 原位置不变
                        if (loTail == null) loHead = e; else loTail.next = e;
                        loTail = e;
                    } else {                        // 新增位是 1 -> 下标 + oldCap
                        if (hiTail == null) hiHead = e; else hiTail.next = e;
                        hiTail = e;
                    }
                } while ((e = next) != null);
                newTab[j] = loHead;              // 原下标放低链
                newTab[j + oldCap] = hiHead;     // 原下标+旧容量放高链
            }
        }
    }
    return newTab;
}
```

**1.8 扩容优化的核心：`hash & oldCap` 判断新位置**。容量翻倍后，新下标取决于 hash 中「新增的那一位」是 0 还是 1：

```
旧容量 oldCap = 16 = 0b10000，扩容后 newCap = 32 = 0b100000
定位从 (n-1) & hash 变成 (2n-1) & hash，多了一位参与运算

判断 hash 的「第 5 位」（从 0 数）：
  hash & oldCap == 0  -> 该位是 0 -> 新下标 = 原下标（原地不动）
  hash & oldCap != 0  -> 该位是 1 -> 新下标 = 原下标 + oldCap

例：oldCap=16，某元素原下标 3，hash=0b...0_00011
  hash & 16 = 0 -> 留原位 3
例：hash=0b...1_00011
  hash & 16 = 16 -> 移到 3 + 16 = 19
```

**JDK 8 相对 1.7 的扩容优势**：1.7 扩容时要对每个元素**重新计算完整 hash 和下标的取模**，1.8 只需一次 `hash & oldCap` 位判断，把「重算」降级为「二分」，大幅提升扩容性能。同时 1.8 用 `loHead/hiHead` 两条链就地重组，避免 1.7 头插法成环的问题（见第七章）。

#### 6.7 树化 treeifyBin 与退化 untreeify

**树化条件（两个必须同时满足）**：
1. 单个桶的链表长度 ≥ `TREEIFY_THRESHOLD`（8）。
2. 数组总长度 ≥ `MIN_TREEIFY_CAPACITY`（64）。

```java
// treeifyBin 源码（JDK 8 简化）
final void treeifyBin(Node<K,V>[] tab, int hash) {
    int n, index; Node<K,V> e;
    // 关键：数组长度不足 64 时，宁可扩容也不树化
    if (tab == null || (n = tab.length) < MIN_TREEIFY_CAPACITY)
        resize();                     // 扩容能让元素重新分散，比树化更划算
    else if ((e = tab[index = (n - 1) & hash]) != null) {
        // 把链表节点全部转成 TreeNode，再连成红黑树
        // ...
    }
}
```

**为什么树化阈值是 8、退化阈值是 6？** 根据**泊松分布**，负载因子 0.75 时，一个桶内链表长度达到 8 的概率约为千万分之一，说明此时哈希函数或数据分布已经异常，需要树化兜底把查询从 O(n) 降到 O(log n)。而退化阈值设为 6 而不是 8，是留出 2 个单位的**缓冲带**，避免元素在 8 附近反复增删导致「树化↔退化」来回抖动。

```java
// HashMap 源码注释中的泊松分布表（节选）
// 0: 0.6065, 1: 0.3032, 2: 0.0758, 3: 0.0126, 4: 0.0015
// 5: 0.0002, 6: 0.00001, 7: 0.0000003, 8: 0.00000006  <- 概率极低
```

#### 6.8 get 流程

```java
// HashMap.get 源码（JDK 8 简化）
public V get(Object key) {
    Node<K,V> e = getNode(hash(key), key);
    return e == null ? null : e.value;
}
final Node<K,V> getNode(int hash, Object key) {
    Node<K,V>[] tab; Node<K,V> first, e; int n; K k;
    if ((tab = table) != null && (n = tab.length) > 0 &&
        (first = tab[(n - 1) & hash]) != null) {     // 先定位桶，桶空直接 null
        if (first.hash == hash &&                    // 首节点命中
            ((k = first.key) == key || (key != null && key.equals(k))))
            return first;
        if ((e = first.next) != null) {
            if (first instanceof TreeNode)            // 树节点 -> 树查找 O(log n)
                return ((TreeNode<K,V>)first).getTreeNode(hash, key);
            do {                                      // 链表 -> 遍历 O(n)
                if (e.hash == hash &&
                    ((k = e.key) == key || (key != null && key.equals(k))))
                    return e;
            } while ((e = e.next) != null);
        }
    }
    return null;
}
```

**get 复杂度总结**：无冲突 O(1)；链表 O(n)（最坏）；红黑树 O(log n)（树化后兜底）。

---

### 七、HashMap 线程不安全：1.7 死循环与 1.8 数据丢失

HashMap 不是线程安全的，并发下会出两种经典问题（分版本）：

#### 7.1 JDK 1.7 头插法扩容导致死循环（环形链表）

1.7 的 `transfer`（扩容迁移）用**头插法**：遍历旧链表，逐个把节点**插到新链表头部**。头插法会**反转链表顺序**，多线程同时扩容时，两个线程对同一链表交替操作，可能把链表接成环，`get` 时陷入死循环、CPU 100%。

```
JDK 1.7 头插法成环示意（两个线程同时扩容同一桶）
旧链表： A -> B -> null
线程1 先挂起在 A，线程2 完成迁移后新链表为： B -> A -> null（头插反转了顺序）
线程1 恢复继续，又把 A 头插到新链表，指针交错后：
  A.next = B, B.next = A  —— 形成环 A <-> B
此时 get 遍历该桶 -> A -> B -> A -> B -> ... 死循环
```

#### 7.2 JDK 1.8 尾插法导致数据丢失

1.8 改成**尾插法**，避免了成环，但仍不安全：多线程 put 时，两个线程可能同时判断某桶为空、各自写入，后写覆盖先写，导致**元素丢失**；同时 `size++` 不是原子操作，计数也会不准确。

```java
// 多线程 put 数据丢失的根源（简化示意）
// 线程 A、B 同时执行到：if ((p = tab[i]) == null)  —— 都判断桶为空
// 然后各自 tab[i] = newNode(...)  —— 后写覆盖先写，A 的元素被 B 冲掉
// 且 size++ 两者都只加了一次，实际元素 2 个，size 却可能只记到 1
```

```java
// 复现演示：并发 put 导致 size 小于实际元素数（概率性）
public class HashMapNotSafe {
    public static void main(String[] args) throws InterruptedException {
        final Map<Integer, Integer> map = new HashMap<>();
        Thread t1 = new Thread(() -> { for (int i = 0; i < 10000; i++) map.put(i, i); });
        Thread t2 = new Thread(() -> { for (int i = 10000; i < 20000; i++) map.put(i, i); });
        t1.start(); t2.start();
        t1.join(); t2.join();
        // 期望 20000，实际常 < 20000（数据丢失）甚至抛出异常
        System.out.println("size = " + map.size());
    }
}
```

::: tip 💡 面试题：HashMap 为什么线程不安全？如何解决？
并发 `put` 会导致数据丢失（1.8 尾插法互相覆盖、size 不准），1.7 头插法扩容还会形成环形链表引发死循环。解决方案按推荐程度：**`ConcurrentHashMap`（首选，专为并发设计）** > `Collections.synchronizedMap`（包装加锁，性能一般）> `Hashtable`（过时，一把大锁全表串行）。
:::

---

### 八、ConcurrentHashMap：线程安全的 HashMap

这是「集合 + 并发」的交叉考点，与 [并发编程](/learn_backend/java/Java核心/并发编程) 强相关。核心目标：**在保证线程安全的前提下，最大化并发度**。

#### 8.1 1.7 分段锁 vs 1.8 CAS + synchronized

| 对比项 | JDK 1.7 ConcurrentHashMap | JDK 1.8 ConcurrentHashMap |
| --- | --- | --- |
| 数据结构 | Segment 数组 + HashEntry 链表 | Node 数组 + 链表 + 红黑树（同 HashMap） |
| 锁粒度 | 锁整个 Segment（分段锁，默认 16 段） | 只锁单个桶的头节点 |
| 并发度 | 固定为 Segment 数量（默认 16） | 理论上等于桶的数量 |
| 读操作 | 无锁（volatile） | 无锁（volatile） |
| 写操作 | 锁对应 Segment（ReentrantLock） | CAS 尝试 + 失败则 synchronized 锁桶头 |

```
JDK 1.7 分段锁结构（Segment 继承 ReentrantLock）
ConcurrentHashMap
  └── Segment[0]   —— 独立的 ReentrantLock，管一批桶
  │     └── HashEntry -> HashEntry -> ...（链表）
  ├── Segment[1]   —— 另一把锁，互不影响
  │     └── ...
  └── Segment[15]

JDK 1.8 细粒度锁结构（只锁单个桶）
Node[] table（volatile）
  [0] -> Node -> Node     （锁的就是 [0] 这个头节点）
  [1] -> (空)
  [2] -> TreeNode ...     （锁的是 [2] 这个头节点）
```

#### 8.2 1.8 put 流程：CAS + synchronized

```java
// JDK 8 ConcurrentHashMap.put 核心思路（简化）
final V putVal(K key, V value, boolean onlyIfAbsent) {
    if (key == null || value == null) throw new NullPointerException(); // 不允许 null
    int hash = spread(key.hashCode());   // spread 类似 HashMap 的 hash，扰动高低位
    for (Node<K,V>[] tab = table;;) {    // 自旋（死循环 + CAS 重试）
        Node<K,V> f; int n, i;
        if (tab == null || (n = tab.length) == 0)
            tab = initTable();           // 懒初始化（CAS 保证只初始化一次）
        else if ((f = tabAt(tab, i = (n - 1) & hash)) == null) {
            // ① 空桶：CAS 尝试直接放入，无锁、性能最高，失败则自旋重试
            if (casTabAt(tab, i, null, new Node<K,V>(hash, key, value)))
                break;
        }
        else if ((fh = f.hash) == MOVED)
            tab = helpTransfer(tab, f);  // ② 别的线程正在扩容，当前线程帮忙迁移
        else {
            // ③ 非空桶：synchronized 锁住桶的头节点，只锁这一个桶，粒度最细
            synchronized (f) {
                // 在链表或红黑树上查找/插入（逻辑同 HashMap）
            }
        }
    }
    addCount(1L, binCount);              // ④ 计数（分段计数，不直接 size++）
    return null;
}
```

**设计精髓**：
- **读操作无锁**：`Node.val` 和 `Node.next` 都用 `volatile` 修饰，`get` 直接读最新值，不用加锁。
- **写操作细粒度**：空桶用 CAS 无锁写入，非空桶只 `synchronized` 锁一个桶头，不同桶可并行写。
- **扩容协作**：发现 `MOVED` 节点时，当前线程会 `helpTransfer` 帮忙迁移，加速扩容。

```java
// get 无锁的原因：字段都 volatile
static class Node<K,V> implements Map.Entry<K,V> {
    final int hash;
    final K key;
    volatile V val;        // value 用 volatile，保证可见性
    volatile Node<K,V> next; // next 用 volatile
}
```

#### 8.3 计数：为什么不是简单的 size++

1.8 的 ConcurrentHashMap 没有用一个 `size` 字段，而是用 `baseCount` + `CounterCell[]` 分段计数：无竞争时 CAS 累加 `baseCount`；有竞争时每个线程落到不同的 `CounterCell` 上累加，最后求和。这样避免了所有线程抢同一个 `size` 字段造成的竞争。

```java
// 计数思想（简化）：分散热点，减少竞争
// baseCount    —— 无竞争时的计数
// counterCells —— 有竞争时各线程分摊累加，读 size 时求和
public int size() {
    long n = baseCount;
    for (CounterCell cell : counterCells) n += cell.value;  // 汇总
    return (int)n;
}
```

::: tip 💡 面试题：ConcurrentHashMap 和 Hashtable 的区别？
Hashtable 用一把大锁（`synchronized` 方法）锁住整个表，所有读写都串行，并发度极低；ConcurrentHashMap 1.8 只锁单个桶、读操作完全无锁（volatile），并发度远高于 Hashtable，且用 CAS + 分段计数进一步减少锁竞争。所以并发场景一律用 ConcurrentHashMap。
:::

---

### 九、LinkedHashMap：有序的 HashMap 与 LRU 缓存

`LinkedHashMap` 继承 `HashMap`，在 HashMap 基础上用一条**双向链表**维护了元素的「遍历顺序」。默认按**插入顺序**，开启 `accessOrder` 后按**访问顺序**（每次 get/put 都把该元素移到链表尾部），这是实现 LRU 缓存的基础。

```java
// LinkedHashMap 的节点：在 HashMap.Node 基础上多了 before/after 指针
static class Entry<K,V> extends HashMap.Node<K,V> {
    Entry<K,V> before, after;  // 双向链表指针，维护遍历顺序
}

// 构造：accessOrder = true 开启「按访问顺序」，get 也会改变顺序
new LinkedHashMap<>(16, 0.75f, true);  // accessOrder = true
```

```java
// 完整示例：用 LinkedHashMap 实现 LRU 缓存（力扣 146）
class LRUCache extends LinkedHashMap<Integer, Integer> {
    private final int capacity;
    LRUCache(int capacity) {
        // 关键三参数：容量、负载因子、accessOrder=true（按访问顺序）
        super(capacity, 0.75f, true);
        this.capacity = capacity;
    }
    // 重写钩子：当「最老的元素」该被淘汰时返回 true（访问顺序下，链表头就是最久未使用）
    @Override protected boolean removeEldestEntry(Map.Entry<Integer, Integer> eldest) {
        return size() > capacity;   // 超过容量就淘汰链表头部（最久未访问）
    }
    public int get(int key) { return getOrDefault(key, -1); }
}
// 用法：每次 get/put 都会把元素移到链表尾，链表头永远是「最久未使用」的，超容量即被淘汰
```

::: tip 💡 面试题：如何用 Java 集合实现 LRU 缓存？
继承 `LinkedHashMap`，构造时 `accessOrder` 传 `true`（按访问顺序排序），再重写 `removeEldestEntry` 让它在 `size() > 容量` 时返回 true。这样每次访问都会把元素移到链表尾部，链表头永远是「最久未使用」的元素，超容量时自动被淘汰。
:::

---

### 十、TreeMap 与 TreeSet：红黑树实现的有序集合

需要「按键排序」时用 `TreeMap`（底层是**红黑树**），它保证遍历顺序是 key 的升序。排序依据两种比较器：

| 排序方式 | 说明 | 实现位置 |
| --- | --- | --- |
| `Comparable` | 元素自己实现 `compareTo`，自然排序 | 元素类内部 |
| `Comparator` | 外部传入比较器，自定义排序，优先级更高 | 构造时传入 |

**优先级**：若构造时传了 `Comparator`，用它；否则用 key 自身的 `Comparable`。如果两者都没有，`put` 时会抛 `ClassCastException`。

```java
// 默认自然排序：Integer 实现了 Comparable，升序
Map<Integer, String> treeMap = new TreeMap<>();
treeMap.put(3, "c"); treeMap.put(1, "a"); treeMap.put(2, "b");
for (Map.Entry<Integer, String> e : treeMap.entrySet())
    System.out.print(e.getKey());   // 输出 1 2 3（自动升序）

// 自定义降序：Comparator 覆盖自然排序
Map<Integer, String> desc = new TreeMap<>((a, b) -> b - a);

// 自定义对象做 key 必须实现 Comparable，否则抛异常
class Person implements Comparable<Person> {
    int age;
    @Override public int compareTo(Person o) { return this.age - o.age; }
}
```

**TreeMap 的核心方法**（红黑树带来的「有序」能力，HashMap 没有）：

| 方法 | 说明 |
| --- | --- |
| `firstKey()` / `lastKey()` | 最小 / 最大 key |
| `lowerKey(k)` / `higherKey(k)` | 严格小于 / 大于 k 的最近 key |
| `floorKey(k)` / `ceilingKey(k)` | 小于等于 / 大于等于 k 的最近 key |
| `subMap(from, to)` | 左闭右开区间视图 |
| `headMap(k)` / `tailMap(k)` | 小于 / 大于等于 k 的视图 |

---

### 十一、Collections 工具类与线程安全包装

`Collections` 是集合框架的「算法工具箱」，提供排序、查找、同步包装、不可变包装等静态方法。

| 方法 | 说明 | 使用场景 |
| --- | --- | --- |
| `sort(list)` | 升序排序（元素需 Comparable） | 排序 |
| `sort(list, cmp)` | 按比较器排序 | 自定义排序 |
| `reverse(list)` | 反转顺序 | 逆序 |
| `shuffle(list)` | 随机打乱 | 洗牌 |
| `binarySearch(list, key)` | 二分查找（需先排序） | 有序查找 |
| `max(list)` / `min(list)` | 最大 / 最小值 | 极值 |
| `frequency(c, o)` | 统计出现次数 | 计数 |
| `swap(list, i, j)` | 交换两位置元素 | 交换 |
| `synchronizedList(list)` | 包装成线程安全的 List | 并发写 List |
| `synchronizedMap(map)` | 包装成线程安全的 Map | 并发写 Map |
| `unmodifiableList(list)` | 包装成只读 List | 返回不可变集合 |
| `emptyList()` | 返回空不可变 List | 避免返回 null |

```java
List<Integer> list = new ArrayList<>(Arrays.asList(3, 1, 2));
Collections.sort(list);                       // [1, 2, 3]
Collections.reverse(list);                    // [3, 2, 1]
Collections.shuffle(list);                    // 随机顺序
int idx = Collections.binarySearch(list, 2);  // 二分查找（前提：list 已排序）

// 同步包装：给普通集合套一层锁
List<Integer> syncList = Collections.synchronizedList(new ArrayList<>());
// 注意：遍历 synchronizedList 时仍需手动 synchronized，否则仍可能 CME
synchronized (syncList) {
    for (Integer i : syncList) { /* ... */ }
}

// 不可变包装：返回后调用 add/remove 会抛 UnsupportedOperationException
List<Integer> readonly = Collections.unmodifiableList(list);
```

---

### 十二、CopyOnWriteArrayList：读多写少的并发 List

`CopyOnWriteArrayList` 是 JUC 提供的并发 List，核心思想是**写时复制（Copy-On-Write, COW）**：读操作完全无锁，写操作（add/set/remove）时复制一份新数组、改完再整体替换旧数组的引用。

```java
// 核心字段与写操作（JDK 8 源码简化）
private transient volatile Object[] array;   // volatile 保证读可见性
private final transient ReentrantLock lock = new ReentrantLock();

public boolean add(E e) {
    final ReentrantLock lock = this.lock;
    lock.lock();                              // 写操作加锁，串行
    try {
        Object[] elements = getArray();
        int len = elements.length;
        Object[] newElements = Arrays.copyOf(elements, len + 1); // 复制 + 扩容
        newElements[len] = e;                  // 在新数组上改
        setArray(newElements);                 // 整体替换引用（volatile 发布）
        return true;
    } finally { lock.unlock(); }
}

public E get(int index) {
    return get(getArray(), index);             // 读操作无锁，直接读当前数组
}
```

**适用与不适用**：
- ✅ **读多写少**（如白名单、配置项）：读无锁、性能极高。
- ❌ **写频繁**：每次写都复制整个数组 O(n)，且数据是「最终一致」的——写完后其他线程可能还读着旧数组，**无法保证写操作的实时可见性**。

```java
// 迭代器是「快照」：遍历期间即使有写，也读的是旧数组，不会抛 CME
CopyOnWriteArrayList<Integer> cow = new CopyOnWriteArrayList<>(Arrays.asList(1, 2, 3));
for (Integer i : cow) {           // 拿到旧数组快照遍历
    cow.add(999);                 // 遍历中写，也不会抛 ConcurrentModificationException
}
```

---

## 原理篇

### 十三、HashMap 节点内存布局与字节级结构

深入到底层，HashMap 的 `table` 数组里存的全是**对象引用**（JVM 的 8 字节引用指针，开启指针压缩后 4 字节），真正结构在堆上。理解节点内存布局，才能理解「为什么数组长度是 2 的幂」这类问题的最终答案——它服务于一个目标：**用位运算代替取模，快速定位桶**。

```
HashMap 对象内存布局（简化，64 位 JVM 开启指针压缩）
HashMap 对象头（mark word 8B + klass 指针 4B + 长度等）
   └── table 引用 -> Node[] 数组对象
                    数组对象头（8B mark + 4B klass + 4B length）
                    [0] 引用(4B) -> Node 或 null
                    [1] 引用(4B)
                    ...
                    [n-1] 引用(4B)

Node 对象（链表节点）内存布局
   ┌─────────────────────────────┐
   │ 对象头：mark word (8B)      │  锁状态、GC 分代年龄
   │ 对象头：klass 指针 (4B)     │  指向 Node.class
   ├─────────────────────────────┤
   │ int hash   (4B)             │  缓存 key 的哈希，扩容复用
   │ K key      (4B 引用)        │  key 引用
   │ V value    (4B 引用)        │  value 引用
   │ Node next  (4B 引用)        │  同桶下一节点
   └─────────────────────────────┘

TreeNode 对象（红黑树节点）在 Node 基础上再增
   parent(4B) left(4B) right(4B) prev(4B) red(bool, 对齐 1B~4B)
```

**为什么缓存 hash？** 因为扩容后虽然下标变了，但 key 的 hash 值不变，缓存下来避免每次重算 `key.hashCode()`（可能很贵）。这也是 `(e.hash & oldCap)` 能在 resize 里直接用的前提。

### 十四、红黑树：结构与平衡机制

红黑树是一种**自平衡的二叉搜索树**，是 JDK 8 HashMap、TreeMap 的共同底层。它能保证最坏情况下查找/插入/删除都是 **O(log n)**。

#### 14.1 红黑树的五条性质（背下来）

1. 每个节点**非红即黑**。
2. **根节点是黑色**。
3. 每个**叶子节点（NIL/空节点）是黑色**。
4. 红色节点的**两个子节点都是黑色**（即不存在连续的红色节点）。
5. 从任一节点到其每个叶子的**所有路径都包含相同数目的黑色节点**（黑高相等）。

```
红黑树结构示意（黑=B，红=R）
              [10]B
             /    \
          [5]R    [20]R
          /  \     /  \
        [3]B [7]B [15]B [25]B
        / \
     [1]R [4]R
```

#### 14.2 为什么不用普通 BST 而用红黑树？

普通二叉搜索树（BST）在「顺序插入 1,2,3,4,5...」时，会退化成一条**链表**，查找从 O(log n) 退化为 O(n)。红黑树通过「变色 + 旋转」维持平衡，保证树高始终是 O(log n)，避免退化。

```
普通 BST 顺序插入退化成链表        红黑树通过旋转/变色维持平衡
   1                              平衡的多路分支，树高 O(log n)
    \                             最坏情况仍是 O(log n)
     2
      \
       3   -> 查找 3 要遍历整条链
        \
         4
```

#### 14.3 插入后的自平衡：变色 + 左旋 + 右旋

新插入的节点默认是**红色**（这样最不容易违反性质 5 黑高相等）。插入后若违反了「性质 4（不能有连续红）」，用三种操作修复：

```
左旋（以 P 为轴，把右孩子 R 转上来）      右旋（以 P 为轴，把左孩子 L 转上来）
      P                                       P
     / \                                     / \
    a   R              ->                    L   b
       / \                                 / \
      b   c                               a   b  -> 与左旋互为镜像
      （R 上移，P 变成 R 的左孩子）
```

```java
// TreeMap.put 后的自平衡入口（JDK 8 源码简化）
private void fixAfterInsertion(Entry<K,V> x) {
    x.color = RED;                     // 新节点先染红
    while (x != null && x != root && x.parent.color == RED) { // 父节点是红 -> 违规
        if (parentOf(x) == leftOf(parentOf(parentOf(x)))) {
            Entry<K,V> y = rightOf(parentOf(parentOf(x)));   // 叔叔节点
            if (colorOf(y) == RED) {          // 情况1：叔叔是红 -> 变色上推
                setColor(parentOf(x), BLACK);
                setColor(y, BLACK);
                setColor(parentOf(parentOf(x)), RED);
                x = parentOf(parentOf(x));
            } else {                          // 情况2/3：叔叔是黑 -> 旋转
                if (x == rightOf(parentOf(x))) {
                    x = parentOf(x);
                    rotateLeft(x);            // 先转成一条直线
                }
                setColor(parentOf(x), BLACK);
                setColor(parentOf(parentOf(x)), RED);
                rotateRight(parentOf(parentOf(x)));  // 再右旋平衡
            }
        } else { /* 对称情况 */ }
    }
    root.color = BLACK;                       // 根永远染黑
}
```

**小结**：红黑树用「最多两次旋转 + 若干次变色」就能恢复平衡，比 AVL 树旋转次数少，写入代价更低，所以 HashMap、TreeMap 都选它而非 AVL。

### 十五、PriorityQueue：二叉堆的内存布局

`PriorityQueue` 底层是一个**数组实现的二叉堆（binary heap）**，默认是小顶堆（父节点 ≤ 子节点）。

#### 15.1 数组如何表示一棵完全二叉树

```
逻辑上的小顶堆                物理上的数组存储
        [1]                     index:  0   1   2   3   4   5   6
       /   \                    value: [1] [3] [2] [7] [5] [8] [4]
     [3]   [2]
     / \   / \
   [7] [5][8] [4]

父子下标关系（关键公式）：
  父节点 i  -> 左孩子 2i+1，右孩子 2i+2
  子节点 i  -> 父节点 (i-1)/2
```

#### 15.2 入队（siftUp）与出队（siftDown）

```java
// 入队：加到数组末尾，然后「上浮」到正确位置
public boolean offer(E e) {
    // ... 数组满了先扩容（grow）
    siftUp(i, e);   // 从末尾往上比，比父小就交换，直到堆序满足
}
private void siftUp(int k, E x) {
    while (k > 0) {
        int parent = (k - 1) >>> 1;        // 父节点下标
        if (x.compareTo(queue[parent]) >= 0) break; // 已满足小顶堆，停止
        queue[k] = queue[parent];          // 父节点下移
        k = parent;
    }
    queue[k] = x;
}

// 出队：取走堆顶（下标 0），把末尾元素移到堆顶，再「下沉」
public E poll() {
    E result = queue[0];       // 堆顶是最小元素
    E x = queue[--size];       // 末尾元素提上来
    siftDown(0, x);            // 从堆顶往下沉，比子大就交换
    return result;
}
private void siftDown(int k, E x) {
    int half = size >>> 1;
    while (k < half) {
        int child = (k << 1) + 1;          // 左孩子
        if (child + 1 < size && queue[child+1].compareTo(queue[child]) < 0)
            child = child + 1;             // 取左右孩子中较小的
        if (x.compareTo(queue[child]) <= 0) break;
        queue[k] = queue[child];           // 孩子上移
        k = child;
    }
    queue[k] = x;
}
```

**复杂度**：入队、出队都是 O(log n)，**取堆顶 `peek()` 是 O(1)**。这是求 TopK 的利器——维护一个大小为 K 的堆即可。

### 十六、fail-fast 快速失败机制深入

`fail-fast` 是 Java 集合遍历时的「安全阀」：迭代过程中一旦检测到集合被「非迭代器自身」修改，立即抛 `ConcurrentModificationException`，而不是继续遍历产出不可预期的脏数据。

#### 16.1 完整机制流程

```
集合内部维护 modCount 字段（记录结构修改次数）
add/remove/clear 等方法 -> modCount++
迭代器创建时 -> expectedModCount = modCount（快照）
迭代器每次 next()/remove() -> checkForComodification()
    if (modCount != expectedModCount) -> throw ConcurrentModificationException
迭代器自己的 remove() -> modCount++ 且 expectedModCount++（同步，所以安全）
```

```java
// ArrayList.Itr 的关键代码（JDK 8）
private class Itr implements Iterator<E> {
    int expectedModCount = modCount;      // 创建时快照

    public E next() {
        checkForComodification();         // 每次取前校验
        // ...
    }
    public void remove() {
        // ...
        ArrayList.this.remove(lastRet);   // 会 modCount++
        expectedModCount = modCount;      // 同步，下次校验通过
    }
    final void checkForComodification() {
        if (modCount != expectedModCount)
            throw new ConcurrentModificationException();
    }
}
```

#### 16.2 fail-fast vs fail-safe

| 对比 | fail-fast | fail-safe |
| --- | --- | --- |
| 代表集合 | ArrayList、HashMap、HashSet | CopyOnWriteArrayList、ConcurrentHashMap |
| 遍历时被修改 | 抛 ConcurrentModificationException | 不抛异常 |
| 实现原理 | modCount 计数校验 | 遍历「快照」或「弱一致性迭代器」 |
| 数据保证 | 严格一致（发现脏数据即失败） | 弱一致（可能读到旧数据） |

::: tip 💡 面试题：为什么 `for-each` 遍历中删除元素会抛 ConcurrentModificationException，而删除「倒数第二个」元素却不会？
因为 `for-each` 本质是迭代器，`next()` 里先检查 `modCount`，取完后再检查 `hasNext()`。删除倒数第二个元素时，`next()` 已经把游标推到最后一个元素并返回，此时 `hasNext()` 判断 `cursor != size` 发现「无下一个」直接退出循环，**没有触发下一次 `next()` 的校验**，所以侥幸不抛。但这是**未定义行为**，正确做法永远是用迭代器的 `remove()` 或 `removeIf`。
:::

### 十七、JDK 1.7 与 1.8 HashMap 完整对比

| 对比项 | JDK 1.7 | JDK 1.8 |
| --- | --- | --- |
| 数据结构 | 数组 + 链表 | 数组 + 链表 + 红黑树 |
| 链表插入方式 | 头插法 | 尾插法 |
| 扩容时机 | 先扩容后插入 | 先插入后扩容 |
| 哈希计算 | 多次扰动（4 次位运算 + 5 次异或） | 一次 `h ^ (h >>> 16)` |
| 扩容后元素位置 | 重新计算 hash 下标 | 原地 或「原下标 + 旧容量」 |
| 链表长度 > 8 | 仍是链表（O(n) 退化） | 树化为红黑树（O(log n)） |
| 并发扩容问题 | 死循环（头插法成环） | 数据丢失（尾插法覆盖） |
| 初始容量触发 | 构造时即分配 16 | 懒加载，首次 put 才分配 |

### 十八、源码级完整机制流程图

下面把 HashMap 最核心的「put → 扩容 → 树化」串成一条完整的机制流程，面试手绘按这个骨架走。

```
                    ┌─────────────────────────────┐
                    │   put(key, value)           │
                    └──────────────┬──────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │ hash(key)=h ^ (h>>>16)      │ 高位参与运算，减少冲突
                    └──────────────┬──────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │ table 为 null/空 ?          │──是──> resize() 初始化
                    └──────────────┬──────────────┘
                                   │否
                                   ▼
                    ┌─────────────────────────────┐
                    │ i = (n-1) & hash 定位桶     │ n 为 2 的幂，位运算取模
                    └──────────────┬──────────────┘
                                   ▼
              ┌───────────── tab[i] 是什么？ ─────────────┐
              │ 空桶                 │ 链表               │ 红黑树
              ▼                      ▼                    ▼
     ┌──────────────┐     ┌────────────────────┐   ┌─────────────┐
     │ 直接放 Node  │     │ 遍历找 key：        │   │ putTreeVal  │
     └──────────────┘     │  命中->覆盖 value    │   └─────────────┘
                          │  到尾没找到->尾插    │
                          │  链长>=8 -> treeify  │
                          └────────────────────┘
                                   ▼
                    ┌─────────────────────────────┐
                    │ size++ > threshold ?        │──是──> resize() 扩容
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                          resize() 容量翻倍
                    ┌─────────────────────────────┐
                    │ 遍历旧桶，按 hash & oldCap   │
                    │ ==0 -> 留原位               │
                    │ !=0 -> 原下标 + oldCap       │
                    │ 链表拆 lo/hi，树则 split     │
                    └─────────────────────────────┘
```

---

## 面试常问

1. **ArrayList 和 LinkedList 的区别？**
   结论：ArrayList 底层是动态数组、查询 O(1) 快、中间增删 O(n) 慢；LinkedList 底层是双向链表、头尾增删 O(1) 快、查询 O(n) 慢。展开：ArrayList 还实现了 `RandomAccess` 标记接口，支持随机访问；LinkedList 同时实现了 `Deque`，能当栈/队列。实际开发默认用 ArrayList，除非明确只在头部频繁增删。

2. **ArrayList 的扩容机制？**
   结论：默认懒加载，首次 `add` 才初始化为 10，之后按 **1.5 倍**（`oldCapacity + (oldCapacity >> 1)`）扩容。展开：扩容本质是 `Arrays.copyOf` 新建更大的数组再整体复制，代价 O(n)，所以应预设容量。1.5 倍是「空间浪费」与「扩容频率」的工程折中。

3. **HashMap 的底层结构？**
   结论：JDK 8 是「数组 + 链表 + 红黑树」。展开：定位下标用 `(n-1) & hash`（n 恒为 2 的幂）；链表长度 ≥ 8 且数组长度 ≥ 64 时链表树化为红黑树，把最坏查询从 O(n) 降到 O(log n)；扩容时容量翻倍，元素要么留原位要么移到「原下标 + 旧容量」。

4. **HashMap 的 put 流程？**
   结论：先算 hash → 定位桶 → 空桶直插 / 链表尾插或覆盖 / 红黑树插入 → 判断是否扩容。展开：hash 用 `h ^ (h>>>16)` 让高位参与运算；命中相同 key 则覆盖 value 并返回旧值；插入后 `size > threshold`（容量×0.75）就触发 `resize` 翻倍扩容。

5. **HashMap 为什么线程不安全？如何解决？**
   结论：并发 put 会数据丢失，1.7 头插法扩容还会死循环。展开：1.8 尾插法避免了死循环，但多线程同时写空桶会互相覆盖、`size` 不准确。解决方案首选 `ConcurrentHashMap`，其次 `Collections.synchronizedMap`，`Hashtable` 已过时。

6. **ConcurrentHashMap 如何保证线程安全？**
   结论：1.8 用「CAS + synchronized 锁单桶头节点」，读操作无锁。展开：空桶用 CAS 无锁写入，非空桶只锁一个桶头实现细粒度并发；`Node.val/next` 用 volatile 保证读可见性；计数用 `baseCount + CounterCell` 分段累加避免抢一个 size。

7. **为什么重写 equals 还要重写 hashCode？**
   结论：HashMap/HashSet 先按 `hashCode` 定位桶、桶内再用 `equals` 精确比对，两者缺一都会导致去重或查找失效。展开：若 equals 相等但 hashCode 不同，会被散列到不同桶，equals 根本没机会执行；契约要求 equals 相等则 hashCode 必须相等，因此必须成对重写。

8. **HashMap 的负载因子为什么是 0.75？**
   结论：0.75 是「空间利用率」和「哈希冲突概率」的平衡点。展开：太小（如 0.5）扩容太频繁、浪费内存；太大（如 1.0）桶越满、冲突越多、链表变长查询变慢。0.75 是大量实验得出的经验折中值，配合泊松分布分析，此时链长到 8 的概率约千万分之一。

---

**相关阅读**：[并发编程](/learn_backend/java/Java核心/并发编程)（ConcurrentHashMap 的锁机制与 CAS）· [JVM](/learn_backend/java/Java核心/JVM)（对象的 equals/hashCode 与内存布局）· [Maven](/learn_backend/java/基础/Maven)（Java 项目的依赖与构建）

