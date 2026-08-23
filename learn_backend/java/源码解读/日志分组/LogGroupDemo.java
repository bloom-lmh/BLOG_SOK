// ===== 日志分组演示：为什么需要分组 =====
import java.util.Arrays;
import java.util.List;

class GroupLogger {
    private final String groupName;
    private final List<String> packages;
    private int level;

    GroupLogger(String groupName, String[] packages, int level) {
        this.groupName = groupName;
        this.packages = Arrays.asList(packages);
        this.level = level;
    }

    void setLevel(int level) { this.level = level; }
    int getLevel() { return level; }

    void printAll() {
        System.out.println("  组 [" + groupName + "] 包含: " + packages + "，级别=" + levelName(level));
    }

    static String levelName(int level) {
        return switch (level) {
            case 0 -> "TRACE"; case 1 -> "DEBUG";
            case 2 -> "INFO";  case 3 -> "WARN";
            case 4 -> "ERROR"; default -> "UNKNOWN";
        };
    }
}

public class LogGroupDemo {
    public static void main(String[] args) {
        System.out.println("============================================");
        System.out.println("没有分组时，你要写多少行？");
        System.out.println("============================================");
        System.out.println("""
            logging:
              level:
                org.springframework: WARN
                org.hibernate: WARN
                org.apache: WARN
                org.mybatis: WARN
                com.netflix: WARN
            # 5 个包就要写 5 行
            """);

        System.out.println("============================================");
        System.out.println("有分组，一行搞定");
        System.out.println("============================================");
        System.out.println("""
            logging:
              group:
                third-party: org.springframework, org.hibernate, org.apache, org.mybatis, com.netflix
              level:
                third-party: WARN    # 一行搞定上面 5 个包
            """);

        System.out.println("============================================");
        System.out.println("分组效果演示");
        System.out.println("============================================");
        GroupLogger thirdParty = new GroupLogger("third-party",
            new String[]{"org.springframework", "org.hibernate", "org.apache"},
            Logger.WARN);
        thirdParty.printAll();

        System.out.println("\nSpring Boot 启动:");
        System.out.println("  [INFO] o.s.b.Startup - Started Application  ← ✗ 不出");
        System.out.println("  [WARN] o.h.engine - Dialect resolved: MySQL8  ← ✓ 出");
        System.out.println("  [INFO] c.e.OrderService - 订单创建成功        ← ✓ 出（自己代码不受影响）");
    }
}