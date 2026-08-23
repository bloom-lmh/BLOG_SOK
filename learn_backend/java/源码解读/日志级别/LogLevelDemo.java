// ===== 日志级别演示：用控制台模拟 Spring Boot 的日志过滤 =====
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;

class Logger {
    static final int TRACE = 0;
    static final int DEBUG = 1;
    static final int INFO  = 2;
    static final int WARN  = 3;
    static final int ERROR = 4;

    private final String name;
    private final int currentLevel;

    Logger(String name, int level) {
        this.name = name;
        this.currentLevel = level;
    }

    void debug(String msg) {
        if (currentLevel <= DEBUG) print("DEBUG", msg);
    }
    void info(String msg) {
        if (currentLevel <= INFO) print("INFO", msg);
    }
    void warn(String msg) {
        if (currentLevel <= WARN) print("WARN", msg);
    }
    void error(String msg) {
        if (currentLevel <= ERROR) print("ERROR", msg);
    }

    private void print(String level, String msg) {
        String time = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss.SSS"));
        System.out.println(time + " [" + level + "] " + name + " - " + msg);
    }
}

public class LogLevelDemo {
    public static void main(String[] args) {
        System.out.println("============================================");
        System.out.println("场景一：Logger 设置为 INFO 级别（=生产环境）");
        System.out.println("============================================");
        Logger log = new Logger("OrderService", Logger.INFO);

        log.debug("数据库查询结果: 3条记录");      // ✗ 不打印
        log.info("订单 1001 创建成功");              // ✓ 打印
        log.warn("库存不足，商品: SKU-001");          // ✓ 打印
        log.error("支付接口调用失败，订单: 1001");    // ✓ 打印

        System.out.println("\n============================================");
        System.out.println("场景二：Logger 设置为 DEBUG 级别（=开发环境）");
        System.out.println("============================================");
        Logger log2 = new Logger("OrderService", Logger.DEBUG);
        log2.debug("数据库查询结果: 3条记录");       // ✓ 打印
        log2.info("订单 1001 创建成功");               // ✓ 打印
        log2.warn("库存不足");                          // ✓ 打印
        log2.error("支付接口调用失败");                 // ✓ 打印

        System.out.println("\n============================================");
        System.out.println("场景三：两个不同的类，不同的级别");
        System.out.println("============================================");
        Logger orderLog = new Logger("com.example.order", Logger.INFO);
        Logger sqlLog = new Logger("com.example.mapper", Logger.DEBUG);

        orderLog.info("订单创建成功");
        orderLog.debug("订单详情: xxx");   // ✗ 不出

        sqlLog.debug("SQL: SELECT * FROM order");  // ✓ 出
        sqlLog.info("查询耗时: 15ms");

        System.out.println("\n============================================");
        System.out.println("总结：TRACE < DEBUG < INFO < WARN < ERROR");
        System.out.println("设了 INFO，就只看 >= INFO 的，TRACE 和 DEBUG 被跳过");
        System.out.println("不同包可以设不同级别");
    }
}