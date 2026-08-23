# Day 22 · 国际化、主题偏好、无障碍与平板适配

> **今天目标**：让 App 能被更多用户正确使用。完成官方 l10n、日期金额本地化、主题切换、动态字体、读屏和宽屏导航。

## 一、启用官方国际化

```bash
flutter pub add decimal
```

`pubspec.yaml`：

```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  intl: any

flutter:
  generate: true
```

`l10n.yaml`：

```yaml
arb-dir: lib/l10n
template-arb-file: app_zh.arb
output-localization-file: app_localizations.dart
output-class: AppLocalizations
nullable-getter: false
```

`lib/l10n/app_zh.arb`：

```json
{
  "@@locale": "zh",
  "appTitle": "课程商城",
  "login": "登录",
  "coursePrice": "价格：{price}",
  "@coursePrice": {
    "placeholders": {
      "price": {"type": "String"}
    }
  },
  "courseCount": "{count, plural, =0{暂无课程} =1{1 门课程} other{{count} 门课程}}",
  "@courseCount": {
    "placeholders": {
      "count": {"type": "int"}
    }
  }
}
```

`lib/l10n/app_en.arb` 使用相同 key。不要在代码里用字符串拼接生成句子，不同语言的语序和复数规则不同。

## 二、接入 MaterialApp

```dart
MaterialApp.router(
  onGenerateTitle: (context) =>
      AppLocalizations.of(context).appTitle,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  locale: ref.watch(localeProvider),
  theme: AppTheme.light(),
  darkTheme: AppTheme.dark(),
  themeMode: ref.watch(themeModeProvider),
  routerConfig: ref.watch(routerProvider),
);
```

业务组件：

```dart
final l10n = AppLocalizations.of(context);
Text(l10n.courseCount(courses.length));
```

## 三、金额和时间本地化

```dart
String formatPrice({
  required String decimalAmount,
  required String locale,
  String currency = 'CNY',
}) {
  final value = Decimal.parse(decimalAmount);
  return NumberFormat.simpleCurrency(
    locale: locale,
    name: currency,
  ).format(value.toDouble());
}

String formatLocalTime(DateTime utcTime, String locale) {
  return DateFormat.yMMMd(locale).add_Hm().format(
        utcTime.toLocal(),
      );
}
```

金额结算仍不使用 double；这里转 double 仅用于最终格式化展示。若金额可能极大或精度要求高，使用 decimal 支持的格式化方案。

后端时间统一 ISO 8601 + 时区/UTC，App 解析后按用户时区展示。

## 四、主题与语言偏好

```dart
class ThemeModeController extends AsyncNotifier<ThemeMode> {
  static const _key = 'appearance.theme_mode';

  @override
  Future<ThemeMode> build() async {
    final prefs = await SharedPreferences.getInstance();
    return switch (prefs.getString(_key)) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  Future<void> setMode(ThemeMode mode) async {
    state = AsyncData(mode);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, mode.name);
  }
}
```

选择项包括“跟随系统、浅色、深色”。主题只是普通偏好，不需要 Secure Storage。

## 五、动态字体不能被禁用

不要这样：

```dart
MediaQuery(
  data: MediaQuery.of(context).copyWith(
    textScaler: TextScaler.noScaling,
  ),
  child: app,
);
```

正确做法：

- 让容器随内容增长；
- 关键按钮允许多行或扩大高度；
- 使用 `Expanded/Flexible/Wrap`；
- 在系统最大字体下测试；
- 极端排版可对局部组件使用合理上限，但不能全局剥夺用户设置。

## 六、语义与键盘焦点

```dart
Semantics(
  label: '${course.title}，学习进度 ${course.progressPercent}%',
  button: true,
  child: InkWell(
    onTap: onOpen,
    child: LearningCourseCardContent(course: course),
  ),
);
```

规则：

- IconButton 必须有 tooltip；
- 图片区分信息图和装饰图；
- Loading 使用 liveRegion；
- 同一元素不要被读屏重复朗读；
- 焦点顺序符合视觉顺序；
- 表单错误与对应输入框关联；
- 不只靠颜色表达状态；
- 动画尊重 `disableAnimations`。

## 七、减少动画

```dart
final reduceMotion =
    MediaQuery.maybeOf(context)?.disableAnimations ?? false;

AnimatedSwitcher(
  duration: reduceMotion
      ? Duration.zero
      : const Duration(milliseconds: 200),
  child: child,
);
```

闪烁、自动播放和大幅位移动画要谨慎，既影响无障碍也影响性能。

## 八、宽屏和平板导航

```dart
class AdaptiveAppShell extends StatelessWidget {
  const AdaptiveAppShell({
    required this.selectedIndex,
    required this.onSelect,
    required this.child,
    super.key,
  });

  final int selectedIndex;
  final ValueChanged<int> onSelect;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 720;
        if (wide) {
          return Scaffold(
            body: Row(
              children: [
                NavigationRail(
                  selectedIndex: selectedIndex,
                  onDestinationSelected: onSelect,
                  destinations: const [
                    NavigationRailDestination(
                      icon: Icon(Icons.home_outlined),
                      label: Text('首页'),
                    ),
                    NavigationRailDestination(
                      icon: Icon(Icons.school_outlined),
                      label: Text('学习'),
                    ),
                  ],
                ),
                const VerticalDivider(width: 1),
                Expanded(child: child),
              ],
            ),
          );
        }

        return Scaffold(
          body: child,
          bottomNavigationBar: NavigationBar(
            selectedIndex: selectedIndex,
            onDestinationSelected: onSelect,
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                label: '首页',
              ),
              NavigationDestination(
                icon: Icon(Icons.school_outlined),
                label: '学习',
              ),
            ],
          ),
        );
      },
    );
  }
}
```

真实代码把导航 label 也替换为 l10n。RTL 语言使用 `EdgeInsetsDirectional`、`AlignmentDirectional`，避免写死 left/right。

::: tip 💡 面试题：国际化为什么不仅是“把中文翻译成英文”？
还包括复数、语序、日期、数字、货币、时区、RTL、字体和布局长度变化。
:::

## 九、测试矩阵

- 简体中文、英文；
- 12/24 小时制；
- 浅色、深色、高对比度；
- 最小和最大字体；
- 320dp 手机、普通手机、平板、横屏；
- TalkBack、VoiceOver；
- 减少动态效果；
- RTL 测试 Locale。

## 十、知识点索引

- ARB、gen_l10n、ICU plural。
- Locale、时区、货币格式。
- 动态字体、Semantics、焦点。
- ThemeMode 持久化。
- 响应式断点和 RTL。

## 十一、完成清单

- [ ] 所有用户文案来自 l10n
- [ ] 时间和金额按 Locale 展示
- [ ] 主题可跟随系统并持久化
- [ ] 最大字体无关键内容截断
- [ ] 手机和平板使用合适导航

## 十二、明天我会问你

1. 为什么不能用字符串拼接做国际化句子？
2. 动态字体为什么不应全局锁死？
3. RTL 布局为什么推荐 Directional API？
