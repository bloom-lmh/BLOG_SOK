# Day 04 · go_router、底部导航、登录守卫与 Deep Link

> **今天目标**：建立可扩展路由树，支持底部 Tab 保持状态、详情页、登录拦截和 Deep Link。权限判断集中在路由层，页面不各写一遍。

## 一、路由分区

```text
/splash
/login
/register

/home                    ┐
/category                │ StatefulShellRoute：底部四个 Tab
/learning                │
/profile                 ┘

/course/:courseId
/search
/orders
/orders/:orderNo
/payment/result
/player/:lessonId
```

公开页面：主页、分类、搜索、课程详情、登录注册。

受保护页面：学习中心、个人中心、订单、支付、播放器。最终是否有课程权限仍由后端判断，路由守卫只解决“是否已登录”。

## 二、会话状态先抽象成接口

Day 08 会接入安全 Token。今天先定义路由只关心的状态：

`lib/features/auth/presentation/session_controller.dart`：

```dart
import 'package:flutter/foundation.dart';

enum SessionStatus { booting, anonymous, authenticated }

class RouterSessionListenable extends ChangeNotifier {
  SessionStatus _status = SessionStatus.booting;

  SessionStatus get status => _status;

  void setStatus(SessionStatus value) {
    if (_status == value) return;
    _status = value;
    notifyListeners();
  }
}
```

这里继承 `ChangeNotifier` 是因为 `GoRouter.refreshListenable` 需要 `Listenable`。Day 08 可以由 Riverpod 会话控制器驱动它，不需要把全部业务状态改成 ChangeNotifier。

## 三、配置根路由和四个 Tab

`lib/app/router/app_router.dart`：

```dart
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/presentation/session_controller.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _homeNavigatorKey = GlobalKey<NavigatorState>();
final _categoryNavigatorKey = GlobalKey<NavigatorState>();
final _learningNavigatorKey = GlobalKey<NavigatorState>();
final _profileNavigatorKey = GlobalKey<NavigatorState>();

GoRouter createRouter(RouterSessionListenable session) {
  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/splash',
    refreshListenable: session,
    redirect: (context, state) {
      final status = session.status;
      final location = state.matchedLocation;

      if (status == SessionStatus.booting) {
        return location == '/splash' ? null : '/splash';
      }

      if (location == '/splash') {
        return status == SessionStatus.authenticated ? '/home' : '/home';
      }

      final protected = _isProtected(location);
      if (status == SessionStatus.anonymous && protected) {
        final from = Uri.encodeComponent(state.uri.toString());
        return '/login?from=$from';
      }

      if (status == SessionStatus.authenticated && location == '/login') {
        final from = state.uri.queryParameters['from'];
        return _safeInternalLocation(from) ?? '/home';
      }

      return null;
    },
    errorBuilder: (context, state) => NotFoundPage(error: state.error),
    routes: [
      GoRoute(
        path: '/splash',
        builder: (_, __) => const SplashPage(),
      ),
      GoRoute(
        path: '/login',
        builder: (_, state) => LoginPage(
          redirectTo: state.uri.queryParameters['from'],
        ),
      ),
      GoRoute(
        path: '/register',
        builder: (_, __) => const RegisterPage(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return AppScaffold(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            navigatorKey: _homeNavigatorKey,
            routes: [
              GoRoute(
                path: '/home',
                builder: (_, __) => const HomePage(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _categoryNavigatorKey,
            routes: [
              GoRoute(
                path: '/category',
                builder: (_, __) => const CategoryPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _learningNavigatorKey,
            routes: [
              GoRoute(
                path: '/learning',
                builder: (_, __) => const LearningPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _profileNavigatorKey,
            routes: [
              GoRoute(
                path: '/profile',
                builder: (_, __) => const ProfilePage(),
              ),
            ],
          ),
        ],
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/course/:courseId',
        builder: (_, state) {
          final id = int.tryParse(state.pathParameters['courseId'] ?? '');
          return id == null
              ? const InvalidParameterPage(message: '课程编号无效')
              : CourseDetailPage(courseId: id);
        },
      ),
      GoRoute(
        parentNavigatorKey: _rootNavigatorKey,
        path: '/orders/:orderNo',
        builder: (_, state) => OrderDetailPage(
          orderNo: state.pathParameters['orderNo']!,
        ),
      ),
    ],
  );
}

bool _isProtected(String location) {
  return location == '/learning' ||
      location == '/profile' ||
      location.startsWith('/orders') ||
      location.startsWith('/payment') ||
      location.startsWith('/player');
}

String? _safeInternalLocation(String? value) {
  if (value == null) return null;
  final uri = Uri.tryParse(value);
  if (uri == null || uri.hasScheme || uri.host.isNotEmpty) return null;
  if (!uri.path.startsWith('/')) return null;
  return uri.toString();
}
```

示例中的页面类由对应 Day 创建。核心是路由结构和守卫，不要把所有页面实现塞进路由文件。

::: tip 💡 面试题：为什么登录后的 from 参数必须校验？
如果允许任意外部 URL，攻击者可能构造开放重定向诱导用户跳往钓鱼站点；这里只允许 App 内部绝对路径。
:::

## 四、底部导航保持各 Tab 状态

`StatefulShellRoute.indexedStack` 会为每个 Tab 保留独立 Navigator。用户从主页进入筛选页，再切去“我的学习”并回来，主页分支的栈和滚动位置可以保留。

`lib/app/router/app_scaffold.dart`：

```dart
class AppScaffold extends StatelessWidget {
  const AppScaffold({
    required this.navigationShell,
    super.key,
  });

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: NavigationBar(
        selectedIndex: navigationShell.currentIndex,
        onDestinationSelected: (index) {
          navigationShell.goBranch(
            index,
            initialLocation: index == navigationShell.currentIndex,
          );
        },
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: '首页'),
          NavigationDestination(icon: Icon(Icons.grid_view), label: '分类'),
          NavigationDestination(icon: Icon(Icons.school_outlined), label: '学习'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: '我的'),
        ],
      ),
    );
  }
}
```

## 五、go、push、replace 怎么选

- `context.go('/home')`：切换到一个新位置，适合 Tab 和重置流程。
- `context.push('/course/12')`：在当前栈上压入详情页，可返回。
- `context.replace('/login')`：替换当前页，适合不允许返回的流程。
- `context.pop()`：弹出当前页。

业务代码优先传稳定 ID，不通过 `extra` 传完整课程对象。`extra` 在冷启动 Deep Link 时不存在，也不利于恢复。

## 六、Deep Link 设计

统一使用 HTTPS App Link：

```text
https://m.coursemall.com/course/12
https://m.coursemall.com/orders/CM20260823001
```

平台配置：

- Android 配置 intent-filter，并在域名部署 `.well-known/assetlinks.json`；
- iOS 开启 Associated Domains，并部署 `apple-app-site-association`；
- 自定义 scheme `coursemall://` 可作为支付回跳兼容方案，但不应作为唯一公开链接。

Deep Link 入口永远只接收 ID，进入页面后重新向服务端取数并鉴权。不要相信链接携带的“已购买”“价格”等字段。

## 七、知识点索引

- Navigator 2.0 与声明式路由。
- ShellRoute、嵌套 Navigator、Tab 状态保持。
- 路由级登录守卫与资源级服务端鉴权。
- Deep Link、Android App Links、iOS Universal Links。
- 路由参数校验与开放重定向防护。

## 八、完成清单

- [ ] 四个 Tab 可切换且各自状态保留
- [ ] 未登录访问学习中心会跳转登录
- [ ] 登录后能回到原目标页
- [ ] 非法课程 ID 显示可理解错误，而不是崩溃
- [ ] 外部 `from` URL 被拒绝

## 九、明天我会问你

1. 路由守卫为什么不能代替后端权限校验？
2. `go` 和 `push` 有什么区别？
3. Deep Link 为什么只传 ID，不传“是否已购买”？
