---
order: 185
---

# Class 类型

[[toc]]

TypeScript 全面支持 ES2015 中引入的 class 关键字，并为其添加了类型注解和其他语法（比如，可见性修饰符等）

## 类的基本组成

类中组成主要由以下几个部分

1. 类的属性
2. 类的构造器
3. 类的方法
4. 类的属性存取器

```ts
class Dog {
  public name: string; // ✅ 正确声明公有属性

  constructor(name: string) {
    // ✅ 正确构造函数
    this.name = name;
  }

  public sleep(): void {
    // ✅ 正确方法声明
    console.log('狗在睡觉');
  }

  get getName() {
    // ✅ 正确getter
    return this.name;
  }

  set setName(name: string) {
    // ✅ 正确setter
    this.name = name;
  }
}
```

## 类继承的两种方式

类继承的两种方式：

1. 通过 extends 来继承

```ts
class Animal {
  move(): void {
    console.log("Moving on!");

  }
}
class Dog extends Animal {
  sleep() {
    console.log("狗在睡觉");
  }
}
Dog dog = new Dog();
```

2. 通过 implements 来实现接口

```ts
interface singable {
  sing(): void;
}
class Person implements singable {
  sing(): void {
    console.log('唱歌');
  }
}
```

## 访问权限修饰符

可以使用 TS 的访问权限修饰符来控制 `class` 的方法或属性对于 `class` 外的代码是否可见。包括：

1. public：表示公有的、公开的，公有成员可以被任何地方访问，默认可见性。可以省略
2. protected：表示受保护的，仅对其声明所在类和子类中（非实例对象）可见。
3. private：表示私有的，只在当前类中可见，对实例对象以及子类也是不可见的。

非本类和子类想要访问受保护属性以及非本类想要访问私有属性只能够通过类提供的类属性存取器

```ts
class Person {
  // public：表示公有的、公开的，公有成员可以被任何地方访问，默认可见性。可以直接省略。
  public name: string;
  // protected：表示受保护的，仅对其声明所在类和子类中（非实例对象）可见。
  protected money: number;
  // private：表示私有的，只在当前类中可见，对实例对象以及子类也是不可见的。
  private _idea: string;

  // 构造器
  constructor(name: string, money: number, _idea: string) {
    this.name = name;
    this.money = money;
    this._idea = _idea;
  }
  // 访问私有属性
  get getIdea() {
    return this._idea;
  }
  // 设置访问私有属性
  set setIdea(_idea: string) {
    this._idea = _idea;
  }
}

class Male extends Person {
  // 构造器
  constructor(name: string, money: number, _idea: string) {
    super(name, money, _idea);
  }
  // 访问收受到保护属性
  get getMoney() {
    return this.money;
  }
}
let m: Male = new Male('小王', 1000, '小王此刻的想法');
// 在外部访问一些属性
// 1. 可以访问name 因为name是公开的的
console.log(m.name);
// 2. 不能直接访问_idea 因为_idea是私有属性只能本类内内部访问，但可以通过get方法来访问
console.log(m.getIdea);
// 3  不能直接访问money 因为money是受保护属性只能本类和子类内部进行访问，但可以通过get方法来访问
console.log(m.getMoney);
```

## 只读修饰符

readonly：表示只读，用来防止在构造函数之外对属性进行赋值。readonly 只能修饰属性不能修饰方法。

```ts
class Male {
  // readonly：表示只读，用来防止在构造函数之外对属性进行赋值
  readonly gender: 0 | 1 = 0;
}
let m: Male = new Male();
// 在外部访问一些属性
// 1. 可以访问gender
console.log(m.gender);
// 但不能修改gender 因为gender是只读的
// m.gender = 1
```

## 类级别属性和方法

所谓的类级别的属性和方法就是使用 static 关键字标识的属性和方法，这些属性和方法不需要实例化对象就可以进行访问。

```ts
class Pig {
  // 猪猪的年龄
  static age: number = 1;
  // 猪猪睡觉的方法
  static sleep(): void {
    console.log('小猪正在睡觉');
  }
}
console.log(Pig.age); // 1
Pig.sleep(); // 小猪正在睡觉
```
