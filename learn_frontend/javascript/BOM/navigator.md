---
order: 150
---

# navigator 对象

## 介绍

navigator 是浏览器对象模型(BOM)中的一个重要对象，它提供了关于浏览器和系统环境的信息。以下是其主要属性和方法的详细介绍：

## 核心属性

| 属性            | 描述                 | 示例返回值                                      |
| --------------- | -------------------- | ----------------------------------------------- |
| `userAgent`     | 浏览器用户代理字符串 | `"Mozilla/5.0 (Windows NT 10.0...) Chrome/..."` |
| `platform`      | 操作系统平台         | `"Win32"`, `"MacIntel"`                         |
| `language`      | 浏览器首选语言       | `"zh-CN"`, `"en-US"`                            |
| `cookieEnabled` | 是否启用 Cookie      | `true`/`false`                                  |
| `onLine`        | 是否联网             | `true`/`false`                                  |

## 硬件/系统信息

| 属性                  | 描述                   | 示例值   |
| --------------------- | ---------------------- | -------- |
| `hardwareConcurrency` | CPU 逻辑核心数         | `4`, `8` |
| `deviceMemory`        | 设备内存(GB)           | `4`, `8` |
| `maxTouchPoints`      | 最大触摸点数(触屏设备) | `5`      |

## 媒体与设备方法

| 方法/属性      | 描述                  | 返回值类型                        |
| -------------- | --------------------- | --------------------------------- |
| `mediaDevices` | 访问摄像头/麦克风     | `MediaDevices` 对象               |
| `getBattery()` | 获取电池状态(Promise) | `{ level: 0.85, charging: true }` |
| `vibrate(ms)`  | 触发设备震动(移动端)  | `true` 或 `false`                 |

## 定位服务 (geolocation)

| 方法                   | 描述             | 参数说明                     |
| ---------------------- | ---------------- | ---------------------------- |
| `getCurrentPosition()` | 获取当前位置     | `success(position)`, `error` |
| `watchPosition()`      | 持续监听位置变化 | 返回监听 ID                  |

## 存储与网络

| 属性         | 描述         | 示例值                           |
| ------------ | ------------ | -------------------------------- |
| `storage`    | 存储管理接口 | `StorageManager` 对象            |
| `connection` | 网络连接信息 | `{ downlink: 10, type: "wifi" }` |

## 使用示例

```javascript
// 检测语言
console.log(navigator.language);

// 检查网络状态
if (navigator.onLine) {
  console.log('设备在线');
}

// 获取CPU核心数
console.log('CPU核心:', navigator.hardwareConcurrency);

// 请求位置权限
if ('geolocation' in navigator) {
  navigator.geolocation.getCurrentPosition(
    pos => console.log(pos.coords),
    err => console.error(err),
  );
}
```
