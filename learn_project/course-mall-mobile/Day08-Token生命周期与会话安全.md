# Day 08 · Token 生命周期、自动刷新与安全退出

> **今天目标**：实现冷启动恢复、Access Token 注入、401 单飞刷新、刷新失败退出。会话是一台状态机，不是“把 JWT 存起来”。

## 一、Token 保存策略

```bash
flutter pub add flutter_secure_storage
```

| 数据 | 保存位置 | 原因 |
| --- | --- | --- |
| Access Token | 内存 | 短期使用，减少磁盘暴露 |
| Refresh Token | Secure Storage | 冷启动恢复，需要系统加密存储 |
| 用户公开资料 | 内存/普通缓存 | 不属于凭证 |
| 密码 | 不保存 | 服务端也只存密码哈希 |

Secure Storage 使用 Keychain/Keystore，安全性高于 SharedPreferences，但不能抵御已完全控制的越狱/Root 设备。服务端仍要支持撤销、轮换和异常检测。

## 二、安全存储封装

`lib/core/storage/token_store.dart`：

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class TokenStore {
  TokenStore(this._storage);

  static const _refreshTokenKey = 'session.refresh_token';
  final FlutterSecureStorage _storage;

  Future<void> saveRefreshToken(String token) {
    return _storage.write(key: _refreshTokenKey, value: token);
  }

  Future<String?> readRefreshToken() {
    return _storage.read(key: _refreshTokenKey);
  }

  Future<void> clear() {
    return _storage.delete(key: _refreshTokenKey);
  }
}

final tokenStoreProvider = Provider<TokenStore>((ref) {
  return TokenStore(const FlutterSecureStorage());
});
```

不要在 Key 名里放用户信息；不要为方便调试把 Token 再复制到普通日志或 SharedPreferences。

## 三、会话状态机

```text
booting ──无 refresh──> anonymous
   │
   └──刷新成功──> authenticated

authenticated ──401──> refreshing ──成功──> authenticated
                                  └─失败──> anonymous
authenticated ──主动退出────────────────> anonymous
```

`lib/features/auth/domain/session_state.dart`：

```dart
sealed class SessionState {
  const SessionState();
}

class SessionBooting extends SessionState {
  const SessionBooting();
}

class SessionAnonymous extends SessionState {
  const SessionAnonymous();
}

class SessionAuthenticated extends SessionState {
  const SessionAuthenticated({
    required this.user,
    required this.accessToken,
  });

  final CurrentUser user;
  final String accessToken;
}
```

Access Token 只存在 `SessionAuthenticated` 中。真实项目还可加入 `SessionRefreshing`，但刷新期间一般继续展示旧页面并由请求队列等待。

## 四、刷新使用“裸 Dio”

带鉴权拦截器的 Dio 如果拿去调用刷新接口，401 后可能递归刷新。使用两个实例：

- `plainDio`：登录、刷新等公共请求；
- `apiDio`：普通业务请求，附带 AuthInterceptor。

`lib/features/auth/data/token_manager.dart`：

```dart
class TokenManager {
  TokenManager({
    required Dio plainDio,
    required TokenStore tokenStore,
  })  : _plainDio = plainDio,
        _tokenStore = tokenStore;

  final Dio _plainDio;
  final TokenStore _tokenStore;

  String? _accessToken;
  Future<String?>? _refreshing;

  String? get accessToken => _accessToken;

  Future<void> acceptLogin(LoginResult result) async {
    _accessToken = result.accessToken;
    await _tokenStore.saveRefreshToken(result.refreshToken);
  }

  Future<String?> restoreOrRefresh() => refresh();

  Future<String?> refresh() {
    return _refreshing ??= _refreshAndReset();
  }

  Future<String?> _refreshAndReset() async {
    try {
      final refreshToken = await _tokenStore.readRefreshToken();
      if (refreshToken == null) return null;

      final response = await _plainDio.post<Map<String, dynamic>>(
        '/api/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      final tokens = parseRefreshResponse(response.data!);
      _accessToken = tokens.accessToken;

      // Refresh Token rotation：服务端每次刷新都下发新值。
      await _tokenStore.saveRefreshToken(tokens.refreshToken);
      return tokens.accessToken;
    } catch (_) {
      await clear();
      return null;
    } finally {
      _refreshing = null;
    }
  }

  Future<void> clear() async {
    _accessToken = null;
    await _tokenStore.clear();
  }
}
```

`_refreshing` 让同时到达的多个 401 共用一次刷新请求，称为 **single-flight**。否则五个接口一起过期会发五次 refresh，Token 轮换时还可能互相覆盖。

::: tip 💡 面试题：为什么 Refresh Token 要轮换？
每次使用后废弃旧 Token，可缩短被盗 Refresh Token 的可利用窗口；服务端还能检测旧 Token 被重复使用并撤销整条会话链。
:::

## 五、鉴权拦截器

`lib/core/network/auth_interceptor.dart`：

```dart
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required Dio dio,
    required TokenManager tokenManager,
    required Future<void> Function() onSessionExpired,
  })  : _dio = dio,
        _tokenManager = tokenManager,
        _onSessionExpired = onSessionExpired;

  final Dio _dio;
  final TokenManager _tokenManager;
  final Future<void> Function() _onSessionExpired;

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) {
    final token = _tokenManager.accessToken;
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException error,
    ErrorInterceptorHandler handler,
  ) async {
    final options = error.requestOptions;
    final isUnauthorized = error.response?.statusCode == 401;
    final alreadyRetried = options.extra['authRetried'] == true;
    final isRefreshCall = options.path.endsWith('/api/auth/refresh');

    if (!isUnauthorized || alreadyRetried || isRefreshCall) {
      return handler.next(error);
    }

    final newToken = await _tokenManager.refresh();
    if (newToken == null) {
      await _onSessionExpired();
      return handler.next(error);
    }

    options.extra['authRetried'] = true;
    options.headers['Authorization'] = 'Bearer $newToken';

    try {
      final response = await _dio.fetch<dynamic>(options);
      handler.resolve(response);
    } on DioException catch (retryError) {
      handler.next(retryError);
    }
  }
}
```

每个请求最多自动重试一次。刷新接口本身不能再触发刷新，避免无限循环。

## 六、冷启动恢复和路由联动

```dart
class SessionController extends AsyncNotifier<SessionState> {
  @override
  Future<SessionState> build() async {
    final tokenManager = ref.read(tokenManagerProvider);
    final accessToken = await tokenManager.restoreOrRefresh();
    if (accessToken == null) return const SessionAnonymous();

    final user = await ref.read(authRepositoryProvider).fetchCurrentUser();
    return SessionAuthenticated(
      user: user,
      accessToken: accessToken,
    );
  }

  Future<void> acceptLogin(LoginResult result) async {
    await ref.read(tokenManagerProvider).acceptLogin(result);
    final user = await ref.read(authRepositoryProvider).fetchCurrentUser();
    state = AsyncData(
      SessionAuthenticated(user: user, accessToken: result.accessToken),
    );
  }

  Future<void> logout() async {
    try {
      await ref.read(authRepositoryProvider).logout();
    } finally {
      await ref.read(tokenManagerProvider).clear();
      state = const AsyncData(SessionAnonymous());
      ref.invalidate(currentUserProvider);
    }
  }
}
```

主动退出即使后端暂时不可用，也必须清掉本地凭证。后端 Refresh Token 会在过期后失效；联网时优先调用撤销接口。

Day 04 的路由刷新器监听该 Provider：

```dart
ref.listen(sessionControllerProvider, (_, next) {
  final status = switch (next.valueOrNull) {
    SessionAuthenticated() => SessionStatus.authenticated,
    SessionAnonymous() => SessionStatus.anonymous,
    _ => SessionStatus.booting,
  };
  routerSession.setStatus(status);
});
```

## 七、后端必须配合

1. Access Token 短过期时间；
2. Refresh Token 保存哈希或会话记录，可撤销；
3. Refresh Token rotation 和重放检测；
4. Logout 撤销当前会话；
5. 密码修改后可撤销所有设备；
6. 从 JWT 获取 `userId`，不信任请求体；
7. 登录、刷新接口限流并记录安全审计。

## 八、知识点索引

- Access/Refresh Token 分工。
- Keychain、Keystore 与 Secure Storage。
- Token rotation、撤销、重放检测。
- Dio 拦截器重试与 single-flight。
- 冷启动会话恢复和状态机。

## 九、完成清单

- [ ] Access Token 只在内存
- [ ] Refresh Token 只进 Secure Storage
- [ ] 并发 401 只发起一次刷新
- [ ] 每个业务请求最多重试一次
- [ ] 退出时即使断网也清空本地会话

## 十、明天我会问你

1. 为什么不把 Access Token 和 Refresh Token 都放 SharedPreferences？
2. 什么是 single-flight，解决了哪种竞态？
3. 刷新失败后为什么必须清理本地状态？
