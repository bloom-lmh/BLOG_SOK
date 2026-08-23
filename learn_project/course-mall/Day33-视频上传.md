# Day 33 · 视频上传（分片 + 断点续传 + 秒传）

> **今天目标**：实现课程视频的大文件上传，支持分片上传、断点续传和秒传（MD5 校验）。理解大文件上传的核心问题和解决思路。

## 一、前置条件

- 已完成 Day 09（文件上传基础）
- 了解 OSS（阿里云/腾讯云对象存储）或本地存储均可

## 二、核心概念

### 大文件上传的三个问题

| 问题 | 解决方案 | 实现方式 |
|---|---|---|
| 文件太大，一次传不完 | 分片上传 | 前端切块，按序号上传，后端合并 |
| 传到一半断了 | 断点续传 | Redis 记录已传分片，续传只传未完成的 |
| 同一个文件重复上传 | 秒传 | 前端计算 MD5，后端查是否已存在，存在则跳过 |

### 分片上传流程

```
前端                                      后端
 │                                         │
 ├─ 1. 计算文件 MD5                         │
 ├─ 2. 请求初始化上传 ──────────────────►  │
 │    POST /api/video/init                  │ 返回 uploadId，Redis 记录任务状态
 │                                         │
 ├─ 3. 分片上传（可并发）                    │
 │    POST /api/video/upload/{uploadId}/{chunk}  │ 每片写入临时目录
 │    ...                                   │ Redis 标记已完成分片
 │                                         │
 ├─ 4. 合并请求 ────────────────────────►  │
 │    POST /api/video/merge/{uploadId}      │ 校验全部完成 → 合并文件 → 上传 OSS
 │                                         │ 返回视频 URL
```

## 三、步骤

### 步骤 1：添加上传相关依赖

```xml
<!-- 大文件处理 -->
<dependency>
    <groupId>commons-fileupload</groupId>
    <artifactId>commons-fileupload</artifactId>
</dependency>
```

### 步骤 2：初始化上传接口

`com/mall/user/controller/VideoUploadController.java`：

```java
@RestController
@RequestMapping("/api/video")
@RequiredArgsConstructor
public class VideoUploadController {

    private final VideoUploadService videoUploadService;

    // 初始化上传：返回 uploadId，标记任务开始
    @PostMapping("/init")
    public Result<InitUploadVO> initUpload(@RequestBody InitUploadDTO dto) {
        // dto: { fileName, fileSize, md5, totalChunks }
        return Result.ok(videoUploadService.init(dto));
    }

    // 分片上传
    @PostMapping("/upload/{uploadId}")
    public Result<ChunkVO> uploadChunk(
            @PathVariable String uploadId,
            @RequestParam("file") MultipartFile file,
            @RequestParam("chunk") int chunkIndex) {
        return Result.ok(videoUploadService.uploadChunk(uploadId, chunkIndex, file));
    }

    // 合并分片
    @PostMapping("/merge/{uploadId}")
    public Result<String> merge(@PathVariable String uploadId) {
        return Result.ok(videoUploadService.merge(uploadId));
    }
}
```

### 步骤 3：核心逻辑

`com/mall/user/service/VideoUploadService.java`：

```java
@Service
@RequiredArgsConstructor
@Slf4j
public class VideoUploadService {

    private final RedisTemplate<String, Object> redisTemplate;
    private final StringRedisTemplate stringRedisTemplate;
    private static final String UPLOAD_DIR = "E:/course-mall/videos/temp/";

    public InitUploadVO init(InitUploadDTO dto) {
        String uploadId = UUID.randomUUID().toString();

        // 秒传：MD5 相同且文件已存在，直接返回
        String existingUrl = checkMd5(dto.getMd5());
        if (existingUrl != null) {
            return new InitUploadVO(uploadId, true, existingUrl);
        }

        // Redis 记录上传任务状态
        Map<String, Object> taskInfo = new HashMap<>();
        taskInfo.put("fileName", dto.getFileName());
        taskInfo.put("fileSize", dto.getFileSize());
        taskInfo.put("md5", dto.getMd5());
        taskInfo.put("totalChunks", dto.getTotalChunks());
        redisTemplate.opsForHash().putAll("video:upload:" + uploadId, taskInfo);
        redisTemplate.expire("video:upload:" + uploadId, 24, TimeUnit.HOURS); // 24小时过期

        // 记录 MD5 索引（用于秒传判断）
        stringRedisTemplate.opsForValue().set("video:md5:" + dto.getMd5(), uploadId, 24, TimeUnit.HOURS);

        return new InitUploadVO(uploadId, false, null);
    }

    public ChunkVO uploadChunk(String uploadId, int chunkIndex, MultipartFile file) {
        // 写入临时目录
        String chunkPath = UPLOAD_DIR + uploadId + "/" + chunkIndex;
        File chunkFile = new File(chunkPath);
        chunkFile.getParentFile().mkdirs();
        file.transferTo(chunkFile);

        // 标记该分片已完成
        stringRedisTemplate.opsForSet().add("video:chunks:" + uploadId, String.valueOf(chunkIndex));

        return new ChunkVO(chunkIndex, true);
    }

    public String merge(String uploadId) {
        // 校验：所有分片是否已完成
        Map<Object, Object> taskInfo = redisTemplate.opsForHash().entries("video:upload:" + uploadId);
        int totalChunks = Integer.parseInt(taskInfo.get("totalChunks").toString());
        Long finishedChunks = stringRedisTemplate.opsForSet().size("video:chunks:" + uploadId);

        if (finishedChunks != totalChunks) {
            throw new BizException(400, "分片不完整，已传 " + finishedChunks + "/" + totalChunks);
        }

        // 合并分片
        String fileName = taskInfo.get("fileName").toString();
        String mergedPath = UPLOAD_DIR + uploadId + "/" + fileName;
        try (FileOutputStream fos = new FileOutputStream(mergedPath);
             FileChannel destChannel = fos.getChannel()) {
            for (int i = 0; i < totalChunks; i++) {
                try (FileInputStream fis = new FileInputStream(UPLOAD_DIR + uploadId + "/" + i);
                     FileChannel srcChannel = fis.getChannel()) {
                    srcChannel.transferTo(0, srcChannel.size(), destChannel);
                }
            }
        }

        // 上传到 OSS（Day9 对接），获取 URL
        String ossUrl = uploadToOss(mergedPath, fileName);

        // 清理临时文件和 Redis 记录
        // ...

        return ossUrl;
    }

    // 断点续传：查询已完成的片
    public Set<String> getFinishedChunks(String uploadId) {
        return stringRedisTemplate.opsForSet().members("video:chunks:" + uploadId);
    }
}
```

::: tip 💡 面试题：大文件上传怎么实现断点续传？
**一句话**：Redis 记录每个 uploadId 的已上传分片序号，续传时前端先查哪些片已传完，只传缺失的片。合并时校验分片完整性，全部到齐才合并。
:::

::: tip 💡 面试题：秒传是怎么实现的？
**一句话**：前端计算文件 MD5 发给后端，后端查 Redis/DB 是否有同 MD5 的文件——有则直接返回已有 URL，跳过上传。本质是「用 MD5 当文件的唯一指纹」。
:::

## 四、✅ 完成后回填

- [ ] 完成时间：`____年__月__日`
- [ ] 分片上传功能正常：是 / 否
- [ ] 断点续传（中断后重传只传未完成的分片）：是 / 否
- [ ] 秒传（同文件重传直接返回 URL）：是 / 否
- [ ] 踩坑记录：
- [ ] 疑问：