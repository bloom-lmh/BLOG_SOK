# Day 03 · Material 3 设计系统、屏幕适配与无障碍

> **今天目标**：不急着堆页面，先建立颜色、字号、间距、组件状态和适配规则。后续业务页面只组合组件，不复制样式。

## 一、设计系统解决什么问题

没有设计系统时，项目很快会出现：

- 同一种蓝色有多个色值；
- 按钮高度和圆角各写各的；
- Loading、空数据、错误状态表现不一致；
- 小屏溢出、大字体被截断；
- 深色模式只能整体返工。

设计系统不是一张效果图，而是一组可复用约束：**Design Token + Theme + 基础组件 + 状态规范**。

## 二、定义基础 Token

`lib/app/theme/app_tokens.dart`：

```dart
import 'package:flutter/widgets.dart';

abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
}

abstract final class AppRadius {
  static const BorderRadius sm = BorderRadius.all(Radius.circular(8));
  static const BorderRadius md = BorderRadius.all(Radius.circular(12));
  static const BorderRadius lg = BorderRadius.all(Radius.circular(16));
}

abstract final class AppDuration {
  static const Duration fast = Duration(milliseconds: 150);
  static const Duration normal = Duration(milliseconds: 250);
}
```

不要把屏幕上每个数值都抽成常量。只抽取有语义、会复用的规则，否则 Token 会变成另一个杂物箱。

## 三、统一亮色和深色主题

`lib/app/theme/app_theme.dart`：

```dart
import 'package:flutter/material.dart';

import 'app_tokens.dart';

abstract final class AppTheme {
  static const Color _seed = Color(0xFF365CF5);

  static ThemeData light() {
    return _build(
      ColorScheme.fromSeed(
        seedColor: _seed,
        brightness: Brightness.light,
      ),
    );
  }

  static ThemeData dark() {
    return _build(
      ColorScheme.fromSeed(
        seedColor: _seed,
        brightness: Brightness.dark,
      ),
    );
  }

  static ThemeData _build(ColorScheme colors) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: colors,
      scaffoldBackgroundColor: colors.surface,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        margin: EdgeInsets.zero,
        elevation: 0,
        color: colors.surfaceContainerLow,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.all(Radius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surfaceContainerLow,
        border: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(12)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.all(Radius.circular(12)),
          ),
        ),
      ),
    );
  }
}
```

应用入口：

```dart
MaterialApp.router(
  title: 'CourseMall',
  theme: AppTheme.light(),
  darkTheme: AppTheme.dark(),
  themeMode: ThemeMode.system,
  routerConfig: router,
);
```

业务组件使用 `Theme.of(context).colorScheme.primary`，不要直接写固定颜色。语义色应该来自 `ColorScheme`：

- `primary`：主要操作；
- `error`：失败、危险操作；
- `surfaceContainer*`：卡片和分层背景；
- `onPrimary/onSurface`：对应背景上的文字。

::: tip 💡 面试题：为什么不能在每个 Widget 中硬编码颜色？
硬编码无法统一换肤，也无法保证深色模式下的对比度；语义色让组件表达用途而不是具体色值。
:::

## 四、可复用按钮必须包含完整状态

`lib/core/widgets/app_primary_button.dart`：

```dart
import 'package:flutter/material.dart';

class AppPrimaryButton extends StatelessWidget {
  const AppPrimaryButton({
    required this.label,
    required this.onPressed,
    this.loading = false,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: label,
      enabled: onPressed != null && !loading,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        child: AnimatedSwitcher(
          duration: AppDuration.fast,
          child: loading
              ? const SizedBox.square(
                  key: ValueKey('loading'),
                  dimension: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(label, key: const ValueKey('label')),
        ),
      ),
    );
  }
}
```

按钮的 `loading` 状态同时阻止重复点击。创建订单等关键操作仍需后端幂等，按钮禁用不能代替服务端防重。

## 五、页面状态组件

`lib/core/widgets/async_state_views.dart`：

```dart
import 'package:flutter/material.dart';

class AppLoadingView extends StatelessWidget {
  const AppLoadingView({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Semantics(
        label: '正在加载',
        liveRegion: true,
        child: CircularProgressIndicator(),
      ),
    );
  }
}

class AppEmptyView extends StatelessWidget {
  const AppEmptyView({
    required this.message,
    this.onAction,
    this.actionLabel,
    super.key,
  });

  final String message;
  final VoidCallback? onAction;
  final String? actionLabel;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.inbox_outlined, size: 48),
            const SizedBox(height: AppSpacing.md),
            Text(message, textAlign: TextAlign.center),
            if (onAction != null && actionLabel != null) ...[
              const SizedBox(height: AppSpacing.lg),
              OutlinedButton(
                onPressed: onAction,
                child: Text(actionLabel!),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class AppErrorView extends StatelessWidget {
  const AppErrorView({
    required this.message,
    required this.onRetry,
    super.key,
  });

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return AppEmptyView(
      message: message,
      actionLabel: '重新加载',
      onAction: onRetry,
    );
  }
}
```

列表页至少要设计首次 Loading、下拉刷新、加载更多、空数据、可重试错误、局部失败六种状态。

## 六、屏幕适配规则

移动端不要按设计稿宽度整体缩放。推荐规则：

1. 水平边距使用固定 Token；
2. 内容宽度用约束，而不是读取后计算每个像素；
3. 列表用 `ListView/SliverList`；
4. 横屏、平板通过断点改变列数；
5. 使用 `SafeArea` 避开刘海和系统手势区。

`lib/core/widgets/adaptive_content.dart`：

```dart
import 'package:flutter/material.dart';

class AdaptiveContent extends StatelessWidget {
  const AdaptiveContent({
    required this.child,
    this.maxWidth = 720,
    super.key,
  });

  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Align(
        alignment: Alignment.topCenter,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: maxWidth),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            child: child,
          ),
        ),
      ),
    );
  }
}
```

课程网格根据可用宽度决定列数：

```dart
LayoutBuilder(
  builder: (context, constraints) {
    final columns = switch (constraints.maxWidth) {
      >= 900 => 4,
      >= 600 => 3,
      _ => 2,
    };

    return GridView.builder(
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: columns,
        crossAxisSpacing: AppSpacing.md,
        mainAxisSpacing: AppSpacing.md,
        childAspectRatio: .72,
      ),
      itemCount: courses.length,
      itemBuilder: (_, index) => CourseCard(course: courses[index]),
    );
  },
);
```

## 七、大字体与无障碍

- 不全局锁死 `textScaler`；
- 文字容器尽量不写固定高度；
- 图标按钮提供 `tooltip`；
- 图片提供语义描述，纯装饰图设 `excludeFromSemantics: true`；
- 触摸区域尽量不小于 48×48；
- 错误不要只用红色表达，还要有文本或图标；
- 用 TalkBack/VoiceOver 实机走一遍登录和购买流程。

错误示例：

```dart
SizedBox(height: 40, child: Text(longTitle)); // 大字体时容易截断
```

更稳妥：

```dart
Text(
  longTitle,
  maxLines: 2,
  overflow: TextOverflow.ellipsis,
);
```

## 八、知识点索引

- Material 3、ColorScheme、ThemeData。
- `const` Widget 与不可变配置。
- LayoutBuilder、约束布局、SafeArea。
- Semantics、动态字体、可访问触摸区域。
- 组件的 Loading/Disabled/Error 状态设计。

## 九、完成清单

- [ ] 亮色、深色主题均可运行
- [ ] 页面中没有散落的品牌色和随意间距
- [ ] 按钮支持正常、禁用、加载状态
- [ ] 320dp 小屏和大字体模式无溢出
- [ ] TalkBack/VoiceOver 能识别主要按钮

## 十、明天我会问你

1. Flutter 为什么不建议按设计稿宽度整体缩放？
2. `ColorScheme.primary` 比硬编码蓝色好在哪里？
3. 按钮禁用为什么不能替代订单接口幂等？
