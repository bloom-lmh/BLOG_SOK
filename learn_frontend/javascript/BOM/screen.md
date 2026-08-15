---
order: 149
---

# screen

[[toc]]

## 概念

screen 是浏览器对象模型（BOM）的一部分，提供用户屏幕的物理信息（如分辨率、色彩深度）。以下是其核心属性和用法：

## 关键属性

| **属性**             | **说明**                          | **类型** | **典型值示例**                    |
| -------------------- | --------------------------------- | -------- | --------------------------------- |
| `screen.width`       | 屏幕的总宽度（像素）              | `number` | `1920`                            |
| `screen.height`      | 屏幕的总高度（像素）              | `number` | `1080`                            |
| `screen.availWidth`  | 屏幕可用宽度（减去任务栏/ Dock）  | `number` | `1920`                            |
| `screen.availHeight` | 屏幕可用高度                      | `number` | `1040`                            |
| `screen.colorDepth`  | 色彩深度（位数）                  | `number` | `24`（16.7 百万色）               |
| `screen.pixelDepth`  | 像素深度（通常等于 `colorDepth`） | `number` | `24`                              |
| `screen.orientation` | 屏幕方向（需浏览器支持）          | `object` | `{ angle: 0, type: "landscape" }` |
