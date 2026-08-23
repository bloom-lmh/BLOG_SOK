// ===== 滚动策略演示：为什么需要切文件？ =====
// 运行：javac RollingPolicyDemo.java && java RollingPolicyDemo

import java.io.*;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

class RollingFileManager {
    private final String baseName;
    private final long maxSize;       // 单个文件最大字节数
    private final int maxHistory;     // 保留天数
    private long currentSize = 0;
    private int fileIndex = 0;
    private String currentDate;
    private final List<String> archiveFiles = new ArrayList<>();

    RollingFileManager(String baseName, long maxSize, int maxHistory) {
        this.baseName = baseName;
        this.maxSize = maxSize;
        this.maxHistory = maxHistory;
        this.currentDate = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        archiveFiles.add(baseName + "." + currentDate + ".0.log");
    }

    void write(String logLine) {
        int lineBytes = logLine.getBytes().length;

        // 检查是否要切文件
        if (currentSize + lineBytes > maxSize) {
            rollOver();  // 切文件！
        }

        currentSize += lineBytes;
        // 模拟写入
        System.out.println("  写入: " + baseName + " (" + currentSize + "/" + maxSize + " 字节)");
    }

    // 切文件：把当前文件归档，新建一个文件继续写
    private void rollOver() {
        fileIndex++;
        // 同一天内，文件序号递增
        String archiveName = baseName + "." + currentDate + "." + fileIndex + ".log";
        archiveFiles.add(archiveName);
        currentSize = 0;
        System.out.println("\n  ★ 文件满了！切分 → " + archiveName + "\n");
    }

    // 模拟新的一天：日期变了也要切
    void newDay() {
        currentDate = LocalDate.now().plusDays(fileIndex + 1).format(DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        fileIndex = 0;
        currentSize = 0;
        String newFile = baseName + "." + currentDate + ".0.log";
        archiveFiles.add("【新的一天】" + newFile);
        System.out.println("\n  ★ 新的一天！切分 → " + newFile + "\n");
    }

    void showArchive() {
        System.out.println("\n=== 归档文件列表 ===");
        for (String f : archiveFiles) {
            System.out.println("  " + f);
        }
        // 模拟删除过期文件
        System.out.println("\n  (超过 " + maxHistory + " 天的文件自动删除)");
    }
}

public class RollingPolicyDemo {
    public static void main(String[] args) {
        System.out.println("===== 滚动策略模拟 =====");
        System.out.println("假设: 每个文件最大 30 字节，保留 3 天\n");

        // 不滚动：一个文件写到死
        System.out.println("--- 不滚动 ---");
        System.out.println("  app.log 从项目启动写到今天 → 几个 GB");
        System.out.println("  打开卡死，grep 搜个关键词等半天\n");

        // 滚动
        System.out.println("--- 滚动 ---");
        RollingFileManager log = new RollingFileManager("app.log", 30, 3);

        // 写几条日志，模拟文件满
        for (int i = 1; i <= 5; i++) {
            String msg = "第" + i + "条日志: 订单创建成功 #" + i;
            System.out.println("  log.info(\"" + msg + "\")");
            log.write(msg + "\n");
        }

        // 模拟新的一天
        log.newDay();
        log.write("第6条日志: 新的一天\n");

        log.write("第7条日志: 继续写入\n");
        log.write("第8条日志: 再写一条\n");

        log.showArchive();

        System.out.println("\n===== 总结 =====");
        System.out.println("""
            滚动策略 = 文件满了/新的一天 → 关掉旧文件，开新文件写
            效果：
              app.2026-08-20.0.log  ← 8月20日第1个文件
              app.2026-08-20.1.log  ← 8月20日第2个（同一天满了）
              app.2026-08-21.0.log  ← 新的一天
              app.log               ← 当前正在写的

            好处：
              1. 每个文件小，打开快
              2. 按时间/名字好找
              3. 自动删旧的，不占磁盘
            """);
    }
}
