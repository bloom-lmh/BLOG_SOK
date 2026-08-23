# Day 20 · 图片选择、预签名直传、进度与隐私

> **今天目标**：完成头像上传，覆盖相册/相机权限、文件校验、对象存储预签名直传、取消、进度和 Android 进程恢复。

## 一、为什么不用 App 直接拿 OSS Secret

生产上传链路：

```text
App 选图
 → 后端申请 upload ticket
 → 后端鉴权并生成短期预签名 URL
 → App 直传对象存储
 → App 通知后端确认资源
 → 后端校验并更新头像
```

好处：

- Secret 只在服务端；
- 大文件不占用 Spring 应用带宽；
- URL 短期有效且限制对象路径、类型、大小；
- 上传和业务资源绑定分开。

## 二、选择图片

```bash
flutter pub add image_picker mime crypto
```

```dart
class AvatarPicker {
  AvatarPicker(this._picker);

  final ImagePicker _picker;

  Future<XFile?> pickFromGallery() {
    return _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 90,
      requestFullMetadata: false,
    );
  }

  Future<XFile?> takePhoto() {
    return _picker.pickImage(
      source: ImageSource.camera,
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 90,
      requestFullMetadata: false,
    );
  }
}
```

只在用户点击“拍照”时申请相机权限。iOS `Info.plist` 必须提供清晰的用途说明。Android 新系统照片选择器通常不需要广泛读取整个相册权限。

## 三、Android 丢失数据恢复

系统可能在图片选择 Activity 期间杀死 App。启动时处理：

```dart
Future<XFile?> recoverLostImage(ImagePicker picker) async {
  final response = await picker.retrieveLostData();
  if (response.isEmpty) return null;
  if (response.exception != null) {
    throw response.exception!;
  }
  final files = response.files;
  return files == null || files.isEmpty ? null : files.first;
}
```

相机产生的文件可能位于临时缓存，不能假设永久存在。若要稍后上传，先复制到 App 管理的临时任务目录。

## 四、客户端预校验

```dart
Future<UploadCandidate> validateAvatar(XFile file) async {
  final length = await file.length();
  const maxBytes = 5 * 1024 * 1024;
  if (length <= 0 || length > maxBytes) {
    throw const FormatException('头像大小必须在 5MB 以内');
  }

  final contentType = lookupMimeType(
    file.name,
    headerBytes: await file.openRead(0, 32).expand((e) => e).toList(),
  );
  const allowed = {'image/jpeg', 'image/png', 'image/webp'};
  if (contentType == null || !allowed.contains(contentType)) {
    throw const FormatException('仅支持 JPG、PNG、WebP');
  }

  return UploadCandidate(
    file: file,
    size: length,
    contentType: contentType,
  );
}
```

扩展名和客户端 MIME 都可伪造，服务端/对象处理服务必须重新检查魔数、解码图片、限制像素和重编码。

## 五、申请预签名上传

```http
POST /api/uploads/presign

{
  "purpose": "AVATAR",
  "fileName": "avatar.jpg",
  "contentType": "image/jpeg",
  "size": 183220
}
```

返回：

```json
{
  "uploadId": "upl_01...",
  "uploadUrl": "https://bucket.example.com/...",
  "method": "PUT",
  "requiredHeaders": {
    "Content-Type": "image/jpeg"
  },
  "expiresAt": "2026-08-23T20:45:00+08:00"
}
```

对象 Key 由服务端生成，例如 `avatars/{userScope}/{uuid}.jpg`，绝不直接使用用户文件名拼路径。

## 六、使用裸 Dio 直传

上传预签名 URL 的 Dio 不添加业务 API 的 Authorization 拦截器，否则多余 Header 可能导致签名不匹配。

```dart
class ObjectStorageUploader {
  ObjectStorageUploader(this._uploadDio);

  final Dio _uploadDio;

  Future<void> upload({
    required UploadCandidate candidate,
    required UploadTicket ticket,
    required CancelToken cancelToken,
    required void Function(double progress) onProgress,
  }) async {
    await _uploadDio.putUri<void>(
      ticket.uploadUrl,
      data: candidate.file.openRead(),
      options: Options(
        headers: {
          ...ticket.requiredHeaders,
          Headers.contentLengthHeader: candidate.size,
        },
        contentType: candidate.contentType,
      ),
      cancelToken: cancelToken,
      onSendProgress: (sent, total) {
        if (total > 0) onProgress(sent / total);
      },
    );
  }
}
```

上传页支持：

- 0–100% 进度；
- 取消；
- 失败后重新申请过期 ticket；
- 切后台时按平台能力暂停/恢复；
- 完成前不更新正式头像。

## 七、确认上传

```http
POST /api/uploads/{uploadId}/complete

{
  "purpose": "AVATAR"
}
```

服务端确认对象存在、大小、Hash、真实 MIME 和图像解码，通过后：

1. 安全重编码，移除 EXIF/GPS；
2. 生成多尺寸头像；
3. 更新用户 avatar resourceId；
4. 异步删除旧资源；
5. 返回带版本的新 CDN URL。

```dart
final avatar = await uploadRepository.complete(ticket.uploadId);
ref.invalidate(currentUserProvider);
imageCache.evict(NetworkImage(avatar.url.toString()));
```

更推荐 URL 中包含资源版本或内容 Hash，避免靠清全局缓存。

::: tip 💡 面试题：为什么 PUT 上传成功后还要 complete 接口？
对象存储成功只代表字节存在；业务后端还要校验文件、绑定用户资源、生成缩略图并更新数据库。
:::

## 八、隐私与安全

- 默认不读取 GPS/EXIF；
- 不申请与功能无关的整库相册权限；
- 对象存储 Bucket 默认私有；
- 预签名 URL 短期、单对象、限方法；
- CDN 展示 URL 与上传 URL 分离；
- 防止图片炸弹、超大像素和恶意 SVG；
- 图片处理在隔离进程/服务中限制 CPU、内存和超时；
- 日志不打印预签名 URL。

## 九、知识点索引

- 系统照片选择器与运行时权限。
- XFile、临时文件和进程恢复。
- 预签名 URL、直传、上传确认。
- MIME/魔数、EXIF、图像重编码。
- 取消、进度、缓存版本。

## 十、完成清单

- [ ] 权限按需申请且用途文案清楚
- [ ] Android 能恢复丢失的选择结果
- [ ] 客户端和服务端都有类型/大小校验
- [ ] App 不含对象存储 Secret
- [ ] 上传完成后服务端确认并更新头像

## 十一、明天我会问你

1. 为什么不能把 OSS Secret 放进 App？
2. 客户端已经校验 MIME，服务端为什么还要再校验？
3. 对象上传成功和业务头像更新成功为什么分两步？
