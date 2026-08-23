# Day 05 · 接口契约、Dio 网络层与统一错误模型

> **今天目标**：对齐 Java 后端 `Result<T>`，统一处理业务错误、HTTP 错误、超时、断网和响应解析。页面以后不直接调用 `Dio.get()`。

## 一、安装和代码生成

```bash
flutter pub add dio json_annotation
flutter pub add --dev build_runner json_serializable
dart run build_runner build --delete-conflicting-outputs
```

## 二、统一响应契约

假设后端统一格式：

```json
{
  "code": 200,
  "message": "success",
  "data": {},
  "traceId": "01J..."
}
```

`lib/core/network/api_envelope.dart`：

```dart
import 'package:json_annotation/json_annotation.dart';

part 'api_envelope.g.dart';

@JsonSerializable(genericArgumentFactories: true)
class ApiEnvelope<T> {
  const ApiEnvelope({
    required this.code,
    required this.message,
    this.data,
    this.traceId,
  });

  final int code;
  final String message;
  final T? data;
  final String? traceId;

  factory ApiEnvelope.fromJson(
    Map<String, dynamic> json,
    T Function(Object? json) fromJsonT,
  ) =>
      _$ApiEnvelopeFromJson(json, fromJsonT);

  T requireData() {
    final value = data;
    if (value == null) {
      throw const FormatException('成功响应缺少 data');
    }
    return value;
  }
}
```

Dart 静态类型不能自动保证网络 JSON 正确。`json_serializable` 减少手写解析，但边界处仍需校验必填字段和异常值。

## 三、DTO 与领域模型不要混为一体

`lib/features/course/data/models/course_page_dto.dart`：

```dart
import 'package:json_annotation/json_annotation.dart';

part 'course_page_dto.g.dart';

class DecimalStringConverter implements JsonConverter<String, Object> {
  const DecimalStringConverter();

  @override
  String fromJson(Object json) => json.toString();

  @override
  Object toJson(String value) => value;
}

@JsonSerializable()
class CourseSummaryDto {
  const CourseSummaryDto({
    required this.id,
    required this.title,
    required this.price,
    required this.sales,
    this.coverUrl,
    this.teacherName,
  });

  final int id;
  final String title;
  final String? coverUrl;

  @DecimalStringConverter()
  final String price;

  final int sales;
  final String? teacherName;

  factory CourseSummaryDto.fromJson(Map<String, dynamic> json) =>
      _$CourseSummaryDtoFromJson(json);

  Map<String, dynamic> toJson() => _$CourseSummaryDtoToJson(this);
}

@JsonSerializable()
class CoursePageDto {
  const CoursePageDto({
    required this.records,
    required this.current,
    required this.size,
    required this.total,
    required this.pages,
  });

  final List<CourseSummaryDto> records;
  final int current;
  final int size;
  final int total;
  final int pages;

  factory CoursePageDto.fromJson(Map<String, dynamic> json) =>
      _$CoursePageDtoFromJson(json);
}
```

金额用十进制字符串或最小货币单位整数，不在客户端使用 `double` 做结算。订单最终金额由服务端计算。

DTO 描述传输格式；领域模型描述 App 真正使用的数据。后端字段变更时，Repository 可以在映射层兜住，不让所有 Widget 跟着改。

## 四、统一异常

`lib/core/error/app_exception.dart`：

```dart
enum AppExceptionKind {
  business,
  unauthorized,
  forbidden,
  timeout,
  network,
  server,
  invalidResponse,
  cancelled,
  unknown,
}

class AppException implements Exception {
  const AppException({
    required this.kind,
    required this.message,
    this.code,
    this.statusCode,
    this.traceId,
    this.cause,
  });

  final AppExceptionKind kind;
  final String message;
  final int? code;
  final int? statusCode;
  final String? traceId;
  final Object? cause;

  @override
  String toString() => 'AppException($kind, $message, traceId: $traceId)';
}
```

UI 不展示 `DioException [connection timeout]` 这种技术文本，而是根据 `kind` 映射为“网络连接超时，请重试”。详细 cause 只进入脱敏日志和监控。

## 五、创建 Dio

`lib/core/network/dio_factory.dart`：

```dart
import 'package:dio/dio.dart';

import '../../app/config/app_environment.dart';
import '../error/app_exception.dart';

Dio createDio(AppEnvironment environment) {
  final dio = Dio(
    BaseOptions(
      baseUrl: environment.apiBaseUrl.toString(),
      connectTimeout: const Duration(seconds: 8),
      sendTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: const {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    ),
  );

  dio.interceptors.add(
    InterceptorsWrapper(
      onResponse: (response, handler) {
        final body = response.data;
        if (body is Map<String, dynamic>) {
          final code = body['code'];
          if (code is int && code != 200) {
            return handler.reject(
              DioException(
                requestOptions: response.requestOptions,
                response: response,
                type: DioExceptionType.badResponse,
                error: AppException(
                  kind: code == 401
                      ? AppExceptionKind.unauthorized
                      : AppExceptionKind.business,
                  message: body['message']?.toString() ?? '请求失败',
                  code: code,
                  statusCode: response.statusCode,
                  traceId: body['traceId']?.toString(),
                ),
              ),
            );
          }
        }
        handler.next(response);
      },
      onError: (error, handler) {
        if (error.error is AppException) {
          return handler.next(error);
        }

        final mapped = mapDioException(error);
        handler.next(
          error.copyWith(error: mapped),
        );
      },
    ),
  );

  if (environment.enableHttpLog) {
    dio.interceptors.add(
      LogInterceptor(
        requestBody: false,
        responseBody: false,
        requestHeader: false,
        responseHeader: false,
      ),
    );
  }

  return dio;
}

AppException mapDioException(DioException error) {
  final kind = switch (error.type) {
    DioExceptionType.connectionTimeout ||
    DioExceptionType.sendTimeout ||
    DioExceptionType.receiveTimeout =>
      AppExceptionKind.timeout,
    DioExceptionType.connectionError => AppExceptionKind.network,
    DioExceptionType.cancel => AppExceptionKind.cancelled,
    DioExceptionType.badResponse => switch (error.response?.statusCode) {
        401 => AppExceptionKind.unauthorized,
        403 => AppExceptionKind.forbidden,
        >= 500 => AppExceptionKind.server,
        _ => AppExceptionKind.business,
      },
    _ => AppExceptionKind.unknown,
  };

  return AppException(
    kind: kind,
    message: switch (kind) {
      AppExceptionKind.timeout => '网络连接超时，请稍后重试',
      AppExceptionKind.network => '网络不可用，请检查连接',
      AppExceptionKind.server => '服务暂时不可用',
      AppExceptionKind.unauthorized => '登录状态已失效',
      AppExceptionKind.forbidden => '没有操作权限',
      AppExceptionKind.cancelled => '请求已取消',
      _ => '请求失败，请稍后重试',
    },
    statusCode: error.response?.statusCode,
    cause: error,
  );
}
```

日志默认不打印请求体、响应体和 Header，避免密码、手机号、Token 泄露。需要调试某个接口时，也只能在 dev 环境临时开启并做字段脱敏。

::: tip 💡 面试题：HTTP 200 是否一定代表业务成功？
不一定。很多后端用 HTTP 200 承载统一响应，真正业务结果还要检查 `code`；理想情况下同时合理使用 HTTP 状态码。
:::

## 六、通过 Provider 注入

`lib/core/network/dio_provider.dart`：

```dart
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final dioProvider = Provider<Dio>((ref) {
  final environment = ref.watch(environmentProvider);
  final dio = createDio(environment);
  ref.onDispose(dio.close);
  return dio;
});
```

测试时可以：

```dart
ProviderScope(
  overrides: [
    dioProvider.overrideWithValue(fakeDio),
  ],
  child: const CourseMallApp(),
);
```

这就是依赖注入的实际价值：生产连接真实 HTTP，测试注入可控替身。

## 七、Service 只负责远程通信

`lib/features/course/data/services/course_api_service.dart`：

```dart
class CourseApiService {
  CourseApiService(this._dio);

  final Dio _dio;

  Future<CoursePageDto> fetchPage({
    required int page,
    required int size,
    int? categoryId,
    String? keyword,
    CancelToken? cancelToken,
  }) async {
    final response = await _dio.get<Map<String, dynamic>>(
      '/api/course/page',
      queryParameters: {
        'current': page,
        'size': size,
        if (categoryId != null) 'categoryId': categoryId,
        if (keyword != null && keyword.isNotEmpty) 'keyword': keyword,
      },
      cancelToken: cancelToken,
    );

    final body = response.data;
    if (body == null) {
      throw const AppException(
        kind: AppExceptionKind.invalidResponse,
        message: '服务端返回为空',
      );
    }

    final envelope = ApiEnvelope<CoursePageDto>.fromJson(
      body,
      (json) => CoursePageDto.fromJson(
        json! as Map<String, dynamic>,
      ),
    );
    return envelope.requireData();
  }
}
```

搜索输入变化或页面销毁时可以调用 `CancelToken.cancel()`，避免旧请求返回后覆盖新结果。取消是正常控制流，UI 不应弹“请求失败”。

## 八、接口对齐清单

与 Java 后端联调前确认：

| 项目 | 必须统一 |
| --- | --- |
| 分页参数 | `current/size` 还是 `page/pageSize` |
| 分页下标 | 从 0 还是从 1 开始 |
| 时间 | ISO 8601，并明确时区 |
| 金额 | 十进制字符串或分单位整数 |
| 空值 | 缺字段、null、空数组的含义 |
| 错误 | HTTP 状态、业务 code、message、traceId |
| 命名 | snake_case 或 camelCase |
| 幂等 | Header 名称与有效期 |

推荐后端接入 OpenAPI，Day 26 再做契约生成与漂移检查。

## 九、知识点索引

- DTO、领域模型、Repository 的边界。
- Dio Interceptor、CancelToken、超时。
- HTTP 错误与业务错误。
- 泛型 JSON 反序列化。
- Provider override 与可测试依赖注入。

## 十、完成清单

- [ ] 页面代码不直接创建 Dio
- [ ] 业务错误和网络错误能被区分
- [ ] dev 日志不包含 Token、密码和完整响应体
- [ ] 课程分页 JSON 能生成 DTO
- [ ] 请求支持超时和主动取消

## 十一、明天我会问你

1. DTO 和领域模型为什么要分开？
2. HTTP 200 时为什么仍可能抛业务异常？
3. CancelToken 解决了什么竞态问题？
