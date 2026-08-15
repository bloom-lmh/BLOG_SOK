---
order: 99
---

# 让 Chrome 小于 12px 的字体

[[toc]]

## 背景

Chrome 中文版浏览器会默认设定页面的最小字号是 12px,英文版没有限制原由 Chrome 团队认为汉字小于 12px 就会增加识别难度

## 解决方案

### zoom

zoom 的字面意思是“变焦”，可以改变页面上元素的尺寸，属于真实尺寸.其支持的值类型有：

- zoom:50%,表示缩小到原来的一半
- zoom:0.5,表示缩小到原来的一半

使用 zoom 来”支持“12px 以下的字体代码如下：

```html
<!DOCTYPE html>
<html>
  <head>
    <style type="text/css">
      .span1 {
        font-size: 12px;
        display: inline-block;
        zoom: 0.8; /* 关键：通过zoom缩小80%，视觉等效10px */
      }
      .span2 {
        display: inline-block;
        font-size: 12px; /* 基准12px文字 */
      }
    </style>
  </head>
  <body>
    <span class="span1">测试10px</span>
    <span class="span2">测试12px</span>
  </body>
</html>
```

- 优点 ​：类似 transform 但影响整个元素（包括宽高）。
- 缺点 ​：仅部分浏览器支持（如旧版 Chrome），不推荐生产环境使用。

![zoom兼容性](https://image-bucket-1307756649.cos.ap-chengdu.myqcloud.com/image/20250713145241291.png)

### 使用 transform: scale()

针对 chrome 浏览器，加 webkit 前缀，用`transform:scale()`这个属性进行放缩
注意的是，使用 scāle 属性只对可以定义宽高的元素生效，所以，下面代码中将 span 元素转为行内块元素
实现代码如下：

```html
<!DOCTYPE html>
<html>
  <head>
    <style type="text/css">
      .span1 {
        font-size: 12px;
        display: inline-block;
        -webkit-transform: scale(0.8); /* Chrome/Safari专属缩放 */
      }
      .span2 {
        display: inline-block;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <span class="span1">测试10px</span>
    <span class="span2">测试12px</span>
  </body>
</html>
```

- 优点 ​：兼容性好，视觉上实现缩小效果。
- 缺点 ​：实际占位空间仍是 12px，需调整布局（如 transform-origin）避免元素重叠。

### 适用 webkit-text-size-adjust

该属性用来设定文字大小是否根据设备（浏览器）来自动调整显示大小属性值：

- `percentage`:字体显示的大小；
- `auto`:默认，字体大小会根据设备/浏览器来自动调整；
- `none`:字体大小不会自动调整

这样设置之后会有一个问题，就是当你放大网页时，一般情况下字体也会随着变大，而设置了以上代码后，字体只会显示你当前设置的字体大小，不会随着网页放大而变大了
所以，我们不建议全局应用该属性，而是单独对某一属性使用

> 需要注意的是，自从 chrome27 之后，就取消了对这个属性的支持。同时，该属性只对英文、数字生效，对中文不生效

## 总结

- zoom 非标属性，有兼容问题，缩放会改变了元素占据的空间大小，触发重排
- `-webkit-transform:scale()`大部分现代浏览器支持，并且对英文、数字、中文也能够生效，缩放不会改变了元素占据的空间大小，页面布局不会发生变化
- `-webkit-text-size-adjust`对谷歌浏览器有版本要求，在 27 之后，就取消了该属性的支持，并且只对英文、数字生效
