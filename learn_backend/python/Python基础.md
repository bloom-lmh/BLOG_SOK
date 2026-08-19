# Python基础

一句话定位：Python 是一门**语法简洁、动态类型、解释执行**的高级编程语言，靠「易读易写 + 海量三方库生态」解决快速开发后端服务、自动化脚本、数据处理与 AI 应用的问题。

---

## 基础篇

### 1. 变量与对象模型

Python 里的「变量」和 C/Java 有本质区别：**变量不是存放数据的盒子，而是贴在对象上的名字标签（引用）**。赋值语句 `a = 10` 真正做的是「在内存里创建一个整数对象 `10`，再让名字 `a` 指向它」。这背后是 Python 的核心设计——**一切皆对象**。

```python
# 变量赋值 = 贴标签：让名字指向对象，而不是"往盒子里装值"
name = "sok"          # str   —— 不可变
age = 18              # int   —— 不可变
score = 98.5          # float —— 不可变
is_ok = True          # bool  —— 注意首字母大写，是 int 的子类
nothing = None        # NoneType，表示"空"，类似 Java 的 null

# 用 id() 看对象内存地址，验证"赋值是引用"
a = 1000
b = a                 # b 和 a 指向同一个对象
print(id(a) == id(b)) # True —— 说明赋值只是复制引用，没有复制数据
```

**可变 vs 不可变**是整个 Python 面试和日常写代码最容易踩坑的地方，必须背下来：

| 类型 | 是否可变 | 是否有序 | 是否可哈希(能否作字典键) | 典型场景 |
|------|---------|---------|------------------------|---------|
| `int / float / bool` 数字 | 不可变 | — | 是 | 计算、计数 |
| `str` 字符串 | 不可变 | 有序 | 是 | 文本处理 |
| `bytes` 字节串 | 不可变 | 有序 | 是 | 二进制、网络传输 |
| `tuple` 元组 | 不可变 | 有序 | 是 | 不允许被改的数据、多返回值 |
| `list` 列表 | 可变 | 有序 | 否 | 存可增删改的一组数据 |
| `dict` 字典 | 可变 | 无序(3.7+保持插入序) | 否 | 键值对、对象映射、缓存 |
| `set` 集合 | 可变 | 无序 | 否 | 去重、交集并集 |
| `frozenset` 冻结集合 | 不可变 | 无序 | 是 | 需要不可变集合 / 作字典键 |

::: tip 💡 面试题：`is` 和 `==` 有什么区别？
结论：`is` 比较两个名字是否指向**同一个对象**（比内存地址），`==` 比较两个对象的**值是否相等**。
原因：`is` 判断的是身份（identity），`==` 走的是 `__eq__` 方法判断相等性，两者语义完全不同。
展开：`a is b` 等价于 `id(a) == id(b)`；日常比较值一律用 `==`，只有和 `None` 比较时才惯例用 `is`（如 `if x is None`），因为 `None` 是单例对象。
:::

```python
# is 与 == 的经典反直觉案例：小整数缓存
a = 256
b = 256
print(a is b)  # True  —— CPython 对小整数 [-5, 256] 做了缓存，复用同一对象

x = 257
y = 257
print(x is y)  # False（交互式下）—— 超出缓存范围，各自新建对象
# 结论：判断数值相等永远用 ==，不要依赖 is 的缓存行为
```

---

### 2. 数字类型

Python 只有 `int`、`float`、`complex`（复数）、`bool` 四种数字类型。相比 Java 的一大优势是 **`int` 任意精度**——整数不会溢出，底层用变长数组存储。

```python
# int 任意精度：多大都行，不会像 Java int 溢出
big = 10 ** 100          # 10 的 100 次方，Python 直接算
print(big)               # 一整串数字，无溢出

# bool 是 int 子类：True == 1，False == 0
print(True + True)       # 2
print(isinstance(True, int))  # True

# 数字运算与常用内建函数
print(7 // 2)            # 3  —— 整除（向下取整），注意和 / 的差异
print(7 / 2)             # 3.5 —— 真除法，永远返回 float
print(7 % 2)             # 1  —— 取模
print(2 ** 10)           # 1024 —— 幂运算
print(abs(-5))           # 5
print(round(3.14159, 2)) # 3.14 —— 四舍五入保留两位（注意银行家舍入）
print(divmod(10, 3))     # (3, 1) —— 同时得商和余数
```

---

### 3. 字符串

字符串是**不可变**的序列：任何「修改」操作都会返回一个新字符串，原字符串不变。字符串格式化经历了 `%` → `str.format()` → `f-string` 三代演进，现在首选 f-string。

```python
name, age = "sok", 18

# 三代格式化写法（f-string 性能最好、可读性最强，3.6+ 推荐）
print("%s 今年 %d 岁" % (name, age))          # 老式 % 格式化
print("{} 今年 {} 岁".format(name, age))      # str.format
print(f"{name} 今年 {age} 岁")                 # f-string：可直接内嵌表达式
print(f"{age * 2 = }")                         # 调试神器：打印"表达式 = 值"

# 切片语法 [start:stop:step]，左闭右开，支持负数下标
s = "hello world"
print(s[0])        # 'h' —— 下标从 0 开始
print(s[-1])       # 'd' —— 负数下标从右往左
print(s[0:5])      # 'hello' —— 取 [0,5)，不含下标 5
print(s[6:])       # 'world' —— 省略 stop 表示到末尾
print(s[:5])       # 'hello' —— 省略 start 表示从头
print(s[::-1])     # 'dlrow olleh' —— step=-1 反向遍历，经典反转写法
print(s[::2])      # 'hlowrd' —— 每隔一个取一个
```

字符串常用方法成体系整理：

| 方法 | 作用 | 示例 |
|------|------|------|
| `upper()` / `lower()` | 转大/小写 | `"abc".upper()` → `"ABC"` |
| `strip()` / `lstrip()` / `rstrip()` | 去两端/左/右空白 | `"  hi  ".strip()` → `"hi"` |
| `split(sep)` | 按分隔符切成列表 | `"a,b,c".split(",")` → `["a","b","c"]` |
| `join(iterable)` | 用分隔符连接序列 | `",".join(["a","b"])` → `"a,b"` |
| `startswith(prefix)` / `endswith(suffix)` | 判断前后缀 | `"abc".startswith("a")` → `True` |
| `find(sub)` / `index(sub)` | 找子串位置（找不到前者 -1 后者报错） | `"abc".find("b")` → `1` |
| `replace(old, new)` | 替换子串 | `"aab".replace("a","c")` → `"ccb"` |
| `isdigit()` / `isalpha()` | 判断是否纯数字/纯字母 | `"123".isdigit()` → `True` |
| `format()` / f-string | 格式化 | 见上 |
| `zfill(n)` | 左侧补零到指定宽度 | `"7".zfill(3)` → `"007"` |

---

### 4. 列表 list

列表是**可变、有序**的序列，是 Python 最常用的容器。底层是**动态数组**（连续内存 + 自动扩容），所以按下标访问是 O(1)，尾部追加是均摊 O(1)，中间插入删除是 O(n)（原理篇会展开内存布局）。

```python
nums = [3, 1, 2]

# 增删改查四大操作
nums.append(4)          # 尾部追加一个 → [3, 1, 2, 4]
nums.insert(0, 0)       # 指定位置插入 → [0, 3, 1, 2, 4]
nums.extend([5, 6])     # 拼接另一个序列（逐个追加）
nums.remove(3)          # 删除第一个等于 3 的元素
popped = nums.pop()     # 弹出并返回最后一个元素（也支持 pop(下标)）
nums.sort()             # 原地排序（默认升序）
nums.reverse()          # 原地反转

# 危险操作：remove 删除不存在的元素会抛 ValueError
# nums.remove(999)      # ValueError: list.remove(x): x not in list
```

列表推导式是「遍历 + 过滤 + 变换」的语法糖，比手写 for 循环更 Pythonic、更快：

```python
# 列表推导式：一行完成"变换 + 过滤"
squares = [x * x for x in range(10)]            # 0~9 的平方
evens   = [x for x in range(20) if x % 2 == 0]  # 带过滤条件
pairs   = [(x, y) for x in "ab" for y in "12"]  # 多重循环，等价于嵌套 for

# 经典应用：处理一组数据
words = ["hello", "world", "python"]
lens = [len(w) for w in words]                   # [5, 5, 6]
```

---

### 5. 元组 tuple

元组是**不可变、有序**的序列，一旦创建就不能增删改元素。它靠「不可变」获得两个能力：**可哈希（能作字典键）** 和 **作为多返回值载体**。

```python
# 元组的创建与"单元素元组"陷阱
t1 = (1, 2, 3)
t2 = (1,)          # 单元素元组必须加逗号
t3 = (1)           # 这不是元组！只是加了括号的 int，值还是 1
print(type(t2), type(t3))  # <class 'tuple'> <class 'int'>

# 解包：一个等号同时给多个变量赋值
a, b, c = (1, 2, 3)
x, *rest = (1, 2, 3, 4)     # * 收走剩余元素：x=1, rest=[2,3,4]

# 元组作字典键（列表不行）
cache = {(1, 2): "坐标已缓存"}
print(cache[(1, 2)])         # "坐标已缓存"
```

---

### 6. 字典 dict

字典是**键值对**容器，键必须可哈希（不可变对象），查找/插入/删除都是**均摊 O(1)**。Python 3.7 起字典**保证按插入顺序遍历**，3.6 是 CPython 实现细节，3.7 成为语言规范。

```python
d = {"name": "sok", "age": 18}

# 安全取值：get 带默认值，避免 KeyError
print(d.get("name"))          # "sok"
print(d.get("gender", "未知")) # "未知" —— 键不存在返回默认值而不是报错

# 直接下标取值：键不存在会抛 KeyError
# d["gender"]                 # KeyError: 'gender'

# 增删改与合并
d["gender"] = "男"            # 增 / 改（键存在就覆盖）
d.setdefault("city", "深圳")   # 键不存在才设置，存在则原样返回
popped = d.pop("age")          # 删除并返回值
merged = {**d, "age": 20}      # 字典解包合并（3.5+）

# 遍历三种姿势
for k in d:                print("键", k)
for v in d.values():       print("值", v)
for k, v in d.items():     print("键值对", k, v)   # 最常用
```

字典推导式与常用模式：

```python
# 字典推导式：把一个可迭代对象变成字典
squares = {x: x * x for x in range(5)}   # {0:0, 1:1, 2:4, 3:9, 4:16}

# 反转键值（值唯一时）
inv = {v: k for k, v in squares.items()}
```

---

### 7. 集合 set

集合是**无序、元素唯一**的容器，基于哈希表实现，元素同样必须可哈希。核心用途是**去重**和**集合运算**。

```python
s = {1, 2, 3}
s.add(4)              # 加一个
s.remove(2)           # 删除（不存在抛 KeyError）
s.discard(99)         # 删除（不存在不报错，更安全）

# 去重：一行搞定
nums = [1, 2, 2, 3, 3, 3]
unique = list(set(nums))   # [1, 2, 3]

# 集合运算（求交集、并集、差集）
a, b = {1, 2, 3}, {2, 3, 4}
print(a & b)     # {2, 3}  —— 交集
print(a | b)     # {1,2,3,4} —— 并集
print(a - b)     # {1}     —— 差集（a 有 b 没有）
print(a ^ b)     # {1, 4}  —— 对称差集（只在一边出现的）
```

---

### 8. 流程控制

Python 用**缩进**表示代码块（不靠大括号），缩进必须一致，通常用 4 个空格。这是 Python 语法最显著的特征。

```python
# if / elif / else：没有 switch-case，用 elif 链替代
score = 85
if score >= 90:
    grade = "A"
elif score >= 80:
    grade = "B"        # 命中这一支
else:
    grade = "C"
print(grade)           # "B"

# 三元表达式（条件表达式）
msg = "及格" if score >= 60 else "不及格"

# for 循环：遍历任何可迭代对象
for i in range(5):            # range(5) 生成 0~4
    print(i)

# for 遍历带下标：enumerate
for idx, val in enumerate(["a", "b", "c"]):
    print(idx, val)           # 0 a / 1 b / 2 c

# while 循环
n = 3
while n > 0:
    n -= 1

# break 跳出整个循环，continue 跳过本轮
for i in range(10):
    if i == 3:
        continue
    if i == 8:
        break
```

::: tip 💡 面试题：Python 的 `range` 返回什么？为什么省内存？
结论：`range` 返回一个惰性的 `range` 对象（序列），不是真正的列表，只在遍历时逐个产出数字。
原因：`range(1000000)` 不占 100 万个 int 的内存，而是存 start/stop/step 三个字段，迭代时按公式计算下一个值。
展开：这是「惰性求值」思想，`range`、生成器、`map`/`filter` 对象都遵循这一思想，是 Python 处理大数据的基础。
:::

---

### 9. 函数

函数是组织代码的基本单位。Python 函数是**一等公民**：可以赋值给变量、作为参数传递、作为返回值返回——这是装饰器、闭包等高级特性的基础。

```python
# 函数定义：类型注解只做提示，不强制校验（区别于 Java 的强类型）
def greet(name: str, greeting: str = "你好") -> str:
    """打招呼。 -> str 表示返回值类型，仅是提示。"""
    return f"{greeting}，{name}"

# 可变参数：*args 收多余"位置参数"成元组，**kwargs 收多余"关键字参数"成字典
def log(*args, **kwargs):
    print("位置参数:", args)       # 元组
    print("关键字参数:", kwargs)    # 字典

log(1, 2, 3, level="info", tag="api")   # args=(1,2,3) kwargs={'level':'info','tag':'api'}

# 函数是一等公民：可以赋值、传参、返回
def add(a, b):
    return a + b

f = add                 # 函数赋值给变量
print(f(1, 2))          # 3
```

#### 参数传递的「坑」：可变默认参数

```python
# 反例：默认参数是可变对象时，会在定义时只创建一次，被所有调用共享
def bad_append(item, buf=[]):        # buf 在函数定义时创建一次
    buf.append(item)
    return buf

print(bad_append(1))   # [1]
print(bad_append(2))   # [1, 2]  —— 意外！上一次的结果还在

# 正解：默认参数用 None，函数体内再创建
def good_append(item, buf=None):
    if buf is None:
        buf = []
    buf.append(item)
    return buf
```

#### 参数传递机制：传的是「对象的引用」

```python
# 关键结论：Python 既不是"值传递"也不是"引用传递"，而是"传对象引用"
def modify(num, lst):
    num += 1          # int 不可变，+= 创建新对象，不影响外部
    lst.append(99)    # list 可变，直接改内部，外部可见

n, my_list = 1, [1, 2]
modify(n, my_list)
print(n, my_list)     # 1 [1, 2, 99] —— num 没变，list 变了
```

#### 变量作用域与闭包

```python
# LEGB 作用域规则：Local → Enclosing(闭包) → Global → Builtin
x = "global"          # 全局变量

def outer():
    x = "outer"       # 闭包变量
    def inner():
        # nonlocal 修改"外层函数"的变量；global 修改"全局"变量
        nonlocal x
        x = "inner"   # 修改 outer 里的 x
    inner()
    return x

print(outer())        # "inner"

# lambda：匿名函数，适合简单表达式（不能含语句、多行逻辑）
double = lambda n: n * 2
print(double(5))      # 10

# 常见场景：配合 sorted 的 key 参数
users = [("sok", 18), ("bob", 25), ("amy", 20)]
users.sort(key=lambda u: u[1])   # 按年龄排序
```

---

### 10. 类与面向对象

Python 支持完整面向对象，但风格比 Java 更灵活（鸭子类型、魔术方法、无强制访问控制）。

```python
class Dog:
    legs = 4                    # 类变量：所有实例共享（相当于 Java 静态变量）

    def __init__(self, name):   # 构造方法：创建实例时自动调用
        self.name = name        # 实例变量：每个实例独立（相当于 Java 成员变量）

    def bark(self):             # self 必须显式写出，相当于 Java 的 this
        return f"{self.name} 在叫"

d1, d2 = Dog("旺财"), Dog("小黑")
print(d1.name, d2.name)   # 旺财 小黑 —— 实例变量互不影响
print(d1.legs, d2.legs)   # 4 4 —— 共享类变量
```

#### 封装、继承、多态

```python
class Animal:
    def __init__(self, name):
        self._name = name         # 单下划线：约定"受保护"，靠自觉不靠强制
        self.__secret = "内部"     # 双下划线：名称改写为 _Animal__secret，模拟私有

    def speak(self):
        raise NotImplementedError  # 抽象方法：子类必须实现

class Cat(Animal):
    def speak(self):               # 重写（override）父类方法
        return f"{self._name} 喵喵叫"

class Duck(Animal):
    def speak(self):
        return f"{self._name} 嘎嘎叫"

# 多态：同一方法名，不同对象不同表现
animals = [Cat("咪咪"), Duck("唐老鸭")]
for a in animals:
    print(a.speak())               # 咪咪 喵喵叫 / 唐老鸭 嘎嘎叫
```

#### 实例方法 / 类方法 / 静态方法

| 方法类型 | 装饰器 | 第一个参数 | 能否访问实例 | 典型场景 |
|---------|--------|-----------|------------|---------|
| 实例方法 | 无 | `self` | 能 | 操作具体实例的状态 |
| 类方法 | `@classmethod` | `cls` | 能访问类，不能访问实例 | 工厂方法、操作类变量 |
| 静态方法 | `@staticmethod` | 无 | 都不能 | 与类相关的工具函数 |

```python
class User:
    def __init__(self, name):
        self.name = name

    @classmethod
    def from_dict(cls, d):      # 类方法：常见作"工厂方法"构造实例
        return cls(d["name"])

    @staticmethod
    def is_valid(name):         # 静态方法：与实例无关的校验逻辑
        return len(name) >= 2

u = User.from_dict({"name": "sok"})
print(u.name, User.is_valid("s"))   # sok False
```

#### 魔术方法（双下划线方法）

魔术方法是 Python 实现「运算符重载」和「对象协议」的机制，如 `__init__`、`__str__`、`__repr__`、`__len__`、`__eq__` 等。

```python
class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y

    def __str__(self):       # print / str() 时调用，给人看的
        return f"Point({self.x}, {self.y})"

    def __repr__(self):      # 交互式/调试时调用，应尽量能"还原对象"
        return f"Point({self.x}, {self.y})"

    def __add__(self, other):  # 重载 + 运算符
        return Point(self.x + other.x, self.y + other.y)

    def __eq__(self, other):   # 重载 ==，不定义则默认按身份比较
        return self.x == other.x and self.y == other.y

p1 = Point(1, 2) + Point(3, 4)
print(p1)                  # Point(4, 6)
print(p1 == Point(4, 6))   # True
```

::: tip 💡 面试题：`__new__` 和 `__init__` 有什么区别？
结论：`__new__` 负责**创建对象**（分配内存、返回实例），`__init__` 负责**初始化对象**（给实例属性赋值）。
原因：调用 `Point(1,2)` 时先执行 `__new__` 拿到实例，再执行 `__init__` 初始化它，两者职责分离。
展开：`__new__` 是类方法、先执行；`__init__` 是实例方法、随后执行。因为 `__new__` 控制实例创建，常被用来实现**单例模式**（缓存并复用同一个实例）。
:::

```python
# 用 __new__ 实现单例：保证一个类只有一个实例
class Singleton:
    _instance = None
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:          # 第一次才真正创建
            cls._instance = super().__new__(cls)
        return cls._instance               # 之后都返回同一个实例

s1, s2 = Singleton(), Singleton()
print(s1 is s2)          # True —— 同一个对象
```

---

### 11. 模块与包

- **模块**：一个 `.py` 文件就是一个模块，`import` 导入，作用域隔离。
- **包**：一个含 `__init__.py` 的目录，用于组织多个模块（Python 3.3+ 后 `__init__.py` 可省略，成为命名空间包）。

```python
import math              # 导入整个模块
from math import pi, sqrt  # 只导入某个名字
import math as m         # 起别名，避免重名

print(m.sqrt(16))        # 4.0
print(pi)                # 3.14159...

# 自定义模块：my_module.py 里写 def hello(): ...
# from my_module import hello
```

`if __name__ == "__main__"` 是模块机制的核心惯用法：模块既可以被**直接运行**，也可以被**导入**，用它区分两种场景。

```python
# 写在模块末尾：直接运行该文件时执行，被 import 时不执行
def main():
    print("程序启动")

if __name__ == "__main__":
    main()   # 直接 python xxx.py 时才跑；被别的模块 import 时跳过
```

---

### 12. 异常处理

Python 用异常机制处理错误，所有异常继承自 `BaseException`，常见业务异常继承自 `Exception`。

```
BaseException
 ├── SystemExit          # sys.exit() 触发，一般不捕获
 ├── KeyboardInterrupt   # Ctrl+C
 └── Exception           # 绝大多数异常都在这下面
      ├── ValueError
      ├── TypeError
      ├── ZeroDivisionError
      ├── KeyError
      ├── IndexError
      ├── FileNotFoundError
      └── ...
```

```python
try:
    result = 1 / 0                  # 触发 ZeroDivisionError
except ZeroDivisionError as e:      # 捕获特定异常（从具体到宽泛）
    print("除零错误", e)
except Exception as e:              # 兜底捕获其他异常
    print("其它异常", e)
else:
    print("没异常才执行")            # 可选：try 成功才走这里
finally:
    print("无论如何都执行")           # 必走：释放资源（文件/连接/锁）

# raise 主动抛异常；自定义异常只需继承 Exception
class BizError(Exception):
    pass

def pay(amount):
    if amount <= 0:
        raise BizError("金额必须大于 0")   # 主动抛出

try:
    pay(-1)
except BizError as e:
    print("业务异常:", e)            # 业务异常: 金额必须大于 0
```

::: tip 💡 面试题：`finally` 里的 `return` 会覆盖 `try` 里的 `return` 吗？
结论：会。`finally` 的 `return` 会覆盖前面所有 `return` 的返回值，所以 `finally` 里应避免写 `return`。
原因：`return` 表达式的值先被求值暂存，但 `finally` 块在真正返回前最后执行，其 `return` 直接取代暂存值。
展开：若 `finally` 没有 `return` 而只有 `print`，则不影响原返回值。这是面试常考的细节坑。
:::

---

## 高级篇

### 1. 迭代器与生成器

理解「可迭代 / 迭代器 / 生成器」三者的关系，是理解 Python 内存高效处理数据的关键。

- **可迭代对象（Iterable）**：实现了 `__iter__`，能被 `for` 遍历，如 list、str、dict。
- **迭代器（Iterator）**：实现了 `__iter__` 和 `__next__`，是「按需逐个产出」的对象。
- **生成器（Generator）**：一种特殊的迭代器，用 `yield` 或生成器表达式创建，惰性求值。

```python
# 迭代协议：iter() 获取迭代器，next() 逐个取值
lst = [1, 2, 3]
it = iter(lst)          # list 是可迭代对象，iter() 拿到迭代器
print(next(it))         # 1
print(next(it))         # 2
print(next(it))         # 3
# next(it)              # 取完再取抛 StopIteration（for 循环自动处理该异常）

# 生成器函数：执行到 yield 暂停并返回值，下次 next() 从暂停处继续
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        yield a         # 暂停并产出 a，函数状态被保留
        a, b = b, a + b

g = fib(5)
print(list(g))          # [0, 1, 1, 2, 3]

# 生成器表达式：类似列表推导式，但用圆括号、惰性产出
squares_gen = (x * x for x in range(10))
print(next(squares_gen))   # 0 —— 每次只算一个，不一次性占用内存
```

**生成器省内存的量化对比**（为什么处理大数据必须用生成器）：

```python
import sys

# 列表推导式：一次性把所有结果放到内存
big_list = [x * x for x in range(1000000)]
print(sys.getsizeof(big_list))   # 约 8MB（100 万个 int 引用 + 列表开销）

# 生成器表达式：只存一个"当前状态"，几乎不占额外内存
big_gen = (x * x for x in range(1000000))
print(sys.getsizeof(big_gen))    # 约 200 字节左右
```

::: tip 💡 面试题：列表推导式和生成器表达式有什么区别？
结论：列表推导式**一次性**生成整个列表、占用大量内存；生成器表达式**惰性**按需产出、几乎不占内存。
原因：生成器用 `yield`/迭代协议逐个计算下一个值，不预先把所有结果存进内存。
展开：内存敏感场景（读大文件、无限序列、百万级数据）必须用生成器；需要多次随机访问元素时用列表。
:::

#### yield from：委托子生成器

```python
def gen_a():
    yield 1
    yield 2

def gen_b():
    yield 0
    yield from gen_a()   # 把 gen_a 的产出"转交"到当前位置
    yield 3

print(list(gen_b()))     # [0, 1, 2, 3]
```

---

### 2. 装饰器

装饰器本质是「**接收函数、返回新函数**」的高阶函数，用于在**不修改原函数代码**的前提下增强其功能（日志、鉴权、计时、缓存）。它是闭包的最经典应用。

```python
import functools
import time

def log_time(func):
    # @functools.wraps 把原函数的 __name__/__doc__ 等元信息拷贝到 wrapper，方便调试
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)      # 真正调用原函数
        cost = time.perf_counter() - start
        print(f"{func.__name__} 耗时 {cost:.6f}s")
        return result
    return wrapper

@log_time                     # 等价于 greet = log_time(greet)
def greet(name):
    """打个招呼"""
    return f"hello {name}"

print(greet("sok"))
print(greet.__name__)          # "greet" —— 有 wraps 才是原函数名，否则是 "wrapper"
```

#### 带参数的装饰器（三层嵌套）

```python
def repeat(times):              # 最外层接收"装饰器参数"
    def decorator(func):        # 中间层接收"被装饰函数"
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for _ in range(times):
                func(*args, **kwargs)
        return wrapper
    return decorator

@repeat(3)                      # 重复调用 3 次
def say():
    print("hi")

say()                           # 打印 3 次 hi
```

#### 类装饰器

```python
class CountCalls:
    def __init__(self, func):
        self.func = func
        self.count = 0
    def __call__(self, *args, **kwargs):   # 让实例可像函数一样调用
        self.count += 1
        print(f"第 {self.count} 次调用")
        return self.func(*args, **kwargs)

@CountCalls
def hello():
    return "world"

hello()
hello()    # 第 1 次调用 / 第 2 次调用
```

#### 装饰器实战场景

| 场景 | 说明 |
|------|------|
| 日志 | 自动打印函数名、入参、返回值 |
| 计时 | 统计函数耗时（性能分析） |
| 鉴权 | 校验登录态/权限，不通过则拦截 |
| 缓存 | 相同入参直接返回缓存结果（`functools.lru_cache`） |
| 重试 | 失败自动重试 N 次 |
| 参数校验 | 统一校验入参合法性 |

```python
# 内置装饰器：lru_cache 一行实现"记忆化"缓存
@functools.lru_cache(maxsize=128)
def fib_cached(n):
    if n < 2:
        return n
    return fib_cached(n - 1) + fib_cached(n - 2)

print(fib_cached(100))   # 递归斐波那契，靠缓存避免指数级重复计算
```

::: tip 💡 面试题：装饰器为什么能"不改原函数就增强功能"？
结论：装饰器把原函数包装进一个新的闭包函数，调用新函数时先执行增强逻辑，再调用原函数。
原因：Python 函数是一等公民，`@decorator` 语法糖等价于 `func = decorator(func)`，本质是函数替换。
展开：`@functools.wraps` 用于保留原函数的元信息（`__name__`、`__doc__`），否则 `func.__name__` 会变成 `wrapper`。
:::

---

### 3. 上下文管理器

`with` 语句配合实现了 `__enter__` / `__exit__` 的对象，**保证资源无论是否抛异常都会被释放**（文件、锁、数据库连接）。这是替代手动 `try/finally` 的优雅写法。

```python
# 打开文件必须用 with：即使块内抛异常也会自动关闭文件
with open("a.txt", "r", encoding="utf-8") as f:
    content = f.read()
# 出了 with 块，f 已自动 close，等价于在 finally 里调 f.close()
```

#### 自定义上下文管理器（两种写法）

```python
# 方式一：类实现 __enter__ / __exit__
class ManagedFile:
    def __init__(self, name):
        self.name = name
    def __enter__(self):                 # 进入 with 时调用，返回值赋给 as 后的变量
        self.file = open(self.name, "w")
        return self.file
    def __exit__(self, exc_type, exc_val, exc_tb):  # 离开时调用，必走
        self.file.close()
        return False        # False 表示"不吞异常"，异常继续往外抛

with ManagedFile("out.txt") as f:
    f.write("hello")
```

```python
# 方式二：@contextmanager 装饰器 + yield（更简洁）
import contextlib

@contextlib.contextmanager
def managed_file(name):
    f = open(name, "w")
    try:
        yield f              # yield 前是 __enter__，yield 后是 __exit__
    finally:
        f.close()

with managed_file("out.txt") as f:
    f.write("hello")
```

::: tip 💡 面试题：`with` 语句是怎么保证资源一定被释放的？
结论：`with` 在进入时调用 `__enter__`，无论块内是否抛异常，离开时都会调用 `__exit__`。
原因：编译器把 `with` 翻译成 `try/finally`，`__exit__` 放在 `finally` 里，所以异常时也执行。
展开：`__exit__` 返回 `True` 表示吞掉异常，返回 `False` 表示异常继续传播。文件、锁、连接这类需要"用完即关"的资源都应配合 `with`。
:::

---

### 4. 深拷贝与浅拷贝

理解「赋值、浅拷贝、深拷贝」三层区别，是避免数据被意外修改的必修课。

```python
import copy
a = [[1, 2], [3, 4]]

b = a                 # 赋值：b 和 a 指向同一个对象（复制引用）
c = a.copy()          # 浅拷贝：外层列表是新的，内层列表仍共享引用
d = copy.deepcopy(a)  # 深拷贝：递归复制所有层级，完全独立

c[0].append(99)       # 改 c 的内层列表，会同时影响 a（因为内层共享）
print(a)              # [[1, 2, 99], [3, 4]]  —— a 被"连累"了
print(d)              # [[1, 2], [3, 4]]      —— d 完全独立，不受影响
```

::: tip 💡 面试题：浅拷贝和深拷贝的区别？
结论：浅拷贝只复制**最外层**容器，内层可变对象仍共享引用；深拷贝**递归**复制所有层级，完全独立。
原因：浅拷贝新建一层容器，但内层元素仍是原对象的引用，改内层会互相影响；深拷贝用递归把每一层都复制。
展开：`list.copy()`、`copy.copy()`、`a[:]` 都是浅拷贝；`copy.deepcopy()` 才是深拷贝。对全是不可变元素的一维列表，浅拷贝和深拷贝表现一致。
:::

---

### 5. 多线程与 GIL

Python 标准库的 `threading` 模块提供多线程。但 CPython 有 **GIL（全局解释器锁）**，导致多线程在 CPU 密集型任务上无法真正并行。

```python
import threading
import time

def worker(name, delay):
    for i in range(3):
        time.sleep(delay)        # sleep 会释放 GIL，让其它线程有机会跑
        print(f"{name} 第 {i} 次执行")

# 创建并启动线程
t1 = threading.Thread(target=worker, args=("线程A", 0.5))
t2 = threading.Thread(target=worker, args=("线程B", 0.5))
t1.start()
t2.start()
t1.join()    # 等待 t1 结束
t2.join()    # 等待 t2 结束
print("所有线程结束")
```

#### 线程安全与锁

```python
counter = 0
lock = threading.Lock()

def increment():
    global counter
    for _ in range(100000):
        with lock:               # 加锁保证临界区原子性
            counter += 1

threads = [threading.Thread(target=increment) for _ in range(4)]
for t in threads:
    t.start()
for t in threads:
    t.join()
print(counter)                   # 400000 —— 不加锁会得到小于 400000 的随机值
```

#### 线程池

```python
from concurrent.futures import ThreadPoolExecutor

def square(n):
    return n * n

with ThreadPoolExecutor(max_workers=4) as pool:
    results = pool.map(square, range(10))    # 并发执行 square(0..9)

print(list(results))    # [0, 1, 4, 9, 16, ...]
```

::: tip 💡 面试题：为什么说 Python 多线程是"假并行"？
结论：GIL 使同一时刻只有一个线程执行 Python 字节码，多线程不能真正并行跑 CPU 密集型任务。
原因：GIL 是解释器级别的全局互斥锁，线程间只是串行交替切换（并发），而非多核同时执行（并行）。
展开：I/O 密集型任务（网络请求、文件读写、数据库）在等待 I/O 时会释放 GIL，多线程仍能显著提速；CPU 密集型需改用多进程 `multiprocessing`。
:::

---

### 6. 多进程与协程

**CPU 密集 → 多进程，I/O 密集 → 协程/asyncio**，是 Python 并发编程的核心选型结论。

#### 多进程 multiprocessing

每个进程有独立解释器和内存空间，不受 GIL 限制，能真正利用多核。

```python
from multiprocessing import Pool

def cpu_bound(n):
    return sum(i * i for i in range(n))

if __name__ == "__main__":      # 多进程必须在 main 下（避免递归 spawn）
    with Pool(processes=4) as pool:
        results = pool.map(cpu_bound, [10_000_000] * 4)
    print("完成")
```

#### asyncio 协程

协程是**单线程内**的并发，通过 `await` 主动让出控制权，用「事件循环」调度，特别适合高并发 I/O。

```python
import asyncio

async def fetch(url):            # async def 定义协程
    print(f"开始请求 {url}")
    await asyncio.sleep(1)       # await 挂起，让出控制权去跑别的协程
    print(f"完成请求 {url}")
    return f"{url} 的数据"

async def main():
    # 并发执行多个协程（gather 同时启动）
    results = await asyncio.gather(fetch("a"), fetch("b"), fetch("c"))
    print(results)

asyncio.run(main())    # 事件循环入口，3 个"请求"约 1 秒完成（而非 3 秒）
```

| 并发方式 | 适用场景 | 是否真正并行 | 开销 |
|---------|---------|------------|------|
| 多线程 threading | I/O 密集 | 否（受 GIL 限制） | 线程切换开销小 |
| 多进程 multiprocessing | CPU 密集 | 是（多核） | 进程开销大 |
| 协程 asyncio | 高并发 I/O | 否（单线程） | 极小，可上万并发 |
