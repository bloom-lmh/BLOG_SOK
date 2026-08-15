---
order: 121
---

# Math API

[[toc]]

::: code-group

```js [ES6之前]
Math.pow(2, 53); //=>9007199254740992:2的53次方
Math.round(0.6); //=>1.0：舍入到最接近的整数
Math.ceil(0.6); //=>1.0：向上舍入到一个整数
Math.floor(0.6); //=>0.0：向下舍入到一个整数
Math.abs(-5); //=>5：绝对值
Math.max(x, y, z); //返回最大的参数
Math.min(x, y, z); //返回最小的参数
Math.random(); //伪随机数x，其中0≤×<1.0
Math.PI; //T：圆周率
Math.E; //e：自然对数的底数
Math.sqrt(3); //=>3**0.5:3的平方根
Math.pow(3, 1 / 3); //=>3**（1/3）:3的立方根
Math.sin(0); //三角函数：还有Math.cos、Math.atan等
Math.log(10); //10的自然对数
Math.log(100) / Math.LN10; //以10为底100的对数
Math.log(512) / Math.LN2; //以2为底512的对数
Math.exp(3); //Math.E的立方
```

```js [ES6之后]
Math.cbrt(27); //=>3：立方根
Math.hypot(3, 4); //=>5：所有参数平方和的平方根
Math.log10(100); //=>2:以10为底的对数
Math.log2(1024); //=>10：以2为底的对数
Math.log1p(x); //（1+x）的自然对数；精确到非常小的x
Math.expm1(x); //Math.exp（x)-1;Math.log1p（）的逆运算
Math.sign(x); //对<、==或>0的参数返回-1、0或1
Math.imul(2, 3); //=>6：优化的32位整数乘法
Math.clz32(0xf); //=>28：32位整数中前导0的位数
Math.trunc(3.9); //=>3：剪掉分数部分得到整数
Math.fround(x); //舍入到最接近的32位浮点数
Math.sinh(x); //双曲线正弦，还有Math.cosh（）和Math.tanh（）
Math.asinh(x); //双曲线反正弦，还有Math.acosh（）和Math.atanh（）
```

:::
