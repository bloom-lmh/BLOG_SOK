# Day 07 · 登录注册、表单校验与异步提交

> **今天目标**：完成可用的登录/注册表单，处理输入校验、键盘、重复提交和服务端错误。今天先拿到 Token，Day 08 再实现完整会话生命周期。

## 一、登录契约

移动端建议后端返回：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "accessToken": "...",
    "refreshToken": "...",
    "expiresIn": 1800,
    "user": {
      "id": 1001,
      "nickname": "小林",
      "avatarUrl": null
    }
  }
}
```

不要仅返回永久 JWT。生产会话应使用短期 Access Token + 可撤销、可轮换的 Refresh Token。

`lib/features/auth/data/models/login_models.dart`：

```dart
import 'package:json_annotation/json_annotation.dart';

part 'login_models.g.dart';

@JsonSerializable()
class LoginRequestDto {
  const LoginRequestDto({
    required this.account,
    required this.password,
  });

  final String account;
  final String password;

  Map<String, dynamic> toJson() => _$LoginRequestDtoToJson(this);
}

@JsonSerializable()
class LoginResponseDto {
  const LoginResponseDto({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final int expiresIn;
  final UserDto user;

  factory LoginResponseDto.fromJson(Map<String, dynamic> json) =>
      _$LoginResponseDtoFromJson(json);
}
```

## 二、校验规则集中管理

`lib/features/auth/domain/auth_validators.dart`：

```dart
abstract final class AuthValidators {
  static String? account(String? raw) {
    final value = raw?.trim() ?? '';
    if (value.isEmpty) return '请输入手机号或邮箱';

    final phone = RegExp(r'^1[3-9]\d{9}$');
    final email = RegExp(
      r'^[^@\s]+@[^@\s]+\.[^@\s]+$',
    );
    if (!phone.hasMatch(value) && !email.hasMatch(value)) {
      return '手机号或邮箱格式不正确';
    }
    return null;
  }

  static String? password(String? value) {
    if (value == null || value.isEmpty) return '请输入密码';
    if (value.length < 8) return '密码至少 8 位';
    if (value.length > 64) return '密码不能超过 64 位';
    return null;
  }
}
```

客户端校验只为及时反馈，后端必须重新校验。不要在客户端强行 trim 密码，空格可能是合法字符。

## 三、Auth Service 与 Repository

```dart
class AuthApiService {
  AuthApiService(this._dio);

  final Dio _dio;

  Future<LoginResponseDto> login(LoginRequestDto request) async {
    final response = await _dio.post<Map<String, dynamic>>(
      '/api/user/login',
      data: request.toJson(),
    );
    final envelope = ApiEnvelope<LoginResponseDto>.fromJson(
      response.data!,
      (json) => LoginResponseDto.fromJson(
        json! as Map<String, dynamic>,
      ),
    );
    return envelope.requireData();
  }
}

abstract interface class AuthRepository {
  Future<LoginResult> login({
    required String account,
    required String password,
  });
}

class AuthRepositoryImpl implements AuthRepository {
  AuthRepositoryImpl(this._service);

  final AuthApiService _service;

  @override
  Future<LoginResult> login({
    required String account,
    required String password,
  }) async {
    final dto = await _service.login(
      LoginRequestDto(account: account.trim(), password: password),
    );
    return LoginResult(
      accessToken: dto.accessToken,
      refreshToken: dto.refreshToken,
      expiresIn: Duration(seconds: dto.expiresIn),
      userId: dto.user.id,
    );
  }
}
```

Repository 不记录密码，不打印请求对象。密码在请求完成后只留在 TextEditingController，页面离开时立即 dispose。

## 四、提交控制器

`lib/features/auth/presentation/login_controller.dart`：

```dart
class LoginController extends AsyncNotifier<void> {
  @override
  Future<void> build() async {}

  Future<LoginResult?> submit({
    required String account,
    required String password,
  }) async {
    if (state.isLoading) return null;

    state = const AsyncLoading();
    LoginResult? result;
    state = await AsyncValue.guard(() async {
      result = await ref.read(authRepositoryProvider).login(
            account: account,
            password: password,
          );
    });
    return state.hasError ? null : result;
  }
}

final loginControllerProvider =
    AsyncNotifierProvider<LoginController, void>(LoginController.new);
```

为什么返回 nullable：成功时交给 Day 08 的会话控制器保存 Token；失败信息保留在 `state.error`，页面统一展示。

## 五、完整登录页面

`lib/features/auth/presentation/login_page.dart`：

```dart
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({this.redirectTo, super.key});

  final String? redirectTo;

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _accountController = TextEditingController();
  final _passwordController = TextEditingController();
  final _accountFocus = FocusNode();
  final _passwordFocus = FocusNode();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _accountController.dispose();
    _passwordController.dispose();
    _accountFocus.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusManager.instance.primaryFocus?.unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final result = await ref.read(loginControllerProvider.notifier).submit(
          account: _accountController.text,
          password: _passwordController.text,
        );
    if (result == null || !mounted) return;

    await ref.read(sessionControllerProvider.notifier).acceptLogin(result);
    // 登录后跳转由 go_router redirect 统一完成。
  }

  @override
  Widget build(BuildContext context) {
    final submitting = ref.watch(loginControllerProvider).isLoading;

    ref.listen(loginControllerProvider, (_, next) {
      next.whenOrNull(
        error: (error, stack) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(userMessage(error))),
          );
        },
      );
    });

    return Scaffold(
      appBar: AppBar(title: const Text('登录')),
      body: SafeArea(
        child: SingleChildScrollView(
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: AutofillGroup(
            child: Form(
              key: _formKey,
              autovalidateMode: AutovalidateMode.onUserInteraction,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextFormField(
                    controller: _accountController,
                    focusNode: _accountFocus,
                    autofillHints: const [
                      AutofillHints.username,
                      AutofillHints.email,
                      AutofillHints.telephoneNumber,
                    ],
                    keyboardType: TextInputType.emailAddress,
                    textInputAction: TextInputAction.next,
                    onFieldSubmitted: (_) => _passwordFocus.requestFocus(),
                    validator: AuthValidators.account,
                    decoration: const InputDecoration(labelText: '手机号或邮箱'),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  TextFormField(
                    controller: _passwordController,
                    focusNode: _passwordFocus,
                    obscureText: _obscurePassword,
                    autofillHints: const [AutofillHints.password],
                    textInputAction: TextInputAction.done,
                    onFieldSubmitted: (_) => _submit(),
                    validator: AuthValidators.password,
                    decoration: InputDecoration(
                      labelText: '密码',
                      suffixIcon: IconButton(
                        tooltip: _obscurePassword ? '显示密码' : '隐藏密码',
                        onPressed: () => setState(
                          () => _obscurePassword = !_obscurePassword,
                        ),
                        icon: Icon(
                          _obscurePassword
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  AppPrimaryButton(
                    label: '登录',
                    loading: submitting,
                    onPressed: submitting ? null : _submit,
                  ),
                  TextButton(
                    onPressed: () => context.push('/register'),
                    child: const Text('没有账号？去注册'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
```

## 六、注册还要处理什么

注册页面复用输入组件，但契约至少包含：

- 手机号/邮箱；
- 验证码（后端限流、防刷、过期控制）；
- 密码与确认密码；
- 用户协议和隐私政策勾选；
- 注册成功后是自动登录还是返回登录页。

验证码倒计时只是 UI；真正频率限制必须在 Redis/后端。错误提示不要暴露“某邮箱是否存在”等可被批量枚举的信息。

## 七、知识点索引

- Form、TextFormField、FocusNode、AutofillGroup。
- 客户端校验与服务端校验。
- AsyncNotifier 的提交状态与防重复点击。
- `mounted` 与异步返回后的 BuildContext 安全。
- 密码、验证码和账号枚举安全。

## 八、完成清单

- [ ] 账号和密码校验可用
- [ ] 键盘“下一项/完成”流程顺畅
- [ ] 提交期间按钮不可重复点击
- [ ] 错误展示为用户语言，不暴露堆栈
- [ ] 日志中没有密码和完整 Token

## 九、明天我会问你

1. 客户端已经校验，后端为什么还要再校验？
2. 异步提交后为什么要检查 `mounted`？
3. 禁用按钮是否足以防止重复登录或重复下单？
