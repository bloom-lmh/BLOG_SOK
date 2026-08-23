// ===== Logback 内部设计简化版：XML 配置怎么变成对象的 =====
// 运行：javac LogbackInternalDemo.java && java LogbackInternalDemo

import java.util.ArrayList;
import java.util.List;

// ===== 1. 日志事件 =====
class LogEvent {
    final int level;      // 0=TRACE 1=DEBUG 2=INFO 3=WARN 4=ERROR
    final String msg;
    final long time = System.currentTimeMillis();

    LogEvent(int level, String msg) {
        this.level = level;
        this.msg = msg;
    }

    @Override
    public String toString() {
        String[] names = {"TRACE", "DEBUG", "INFO", "WARN", "ERROR"};
        return time + " [" + names[level] + "] " + msg;
    }
}

// ===== 2. Filter：职责链节点 =====
enum FilterReply { DENY, NEUTRAL, ACCEPT }

interface Filter {
    FilterReply decide(LogEvent event);
}

// 按级别过滤：>= 指定级别才放行
class ThresholdFilter implements Filter {
    private final int minLevel;
    ThresholdFilter(int minLevel) { this.minLevel = minLevel; }

    @Override
    public FilterReply decide(LogEvent event) {
        if (event.level >= minLevel) {
            return FilterReply.NEUTRAL;  // 放行，继续传给下一个 filter
        } else {
            return FilterReply.DENY;     // 拒绝，丢弃
        }
    }
}

// ===== 3. Encoder：格式化 =====
interface Encoder {
    String encode(LogEvent event);
}

class PatternLayoutEncoder implements Encoder {
    private final String pattern;

    PatternLayoutEncoder(String pattern) { this.pattern = pattern; }

    @Override
    public String encode(LogEvent event) {
        String[] names = {"TRACE", "DEBUG", "INFO", "WARN", "ERROR"};
        // 把 pattern 里的 %msg 替换成实际消息，%-5level 替换成级别
        return pattern
            .replace("%msg", event.msg)
            .replace("%-5level", String.format("%-5s", names[event.level]))
            .replace("%level", names[event.level]);
    }
}

// ===== 4. Appender：输出目的地 =====
abstract class Appender {
    String name;
    Encoder encoder;
    List<Filter> filters = new ArrayList<>();

    void addFilter(Filter f) { filters.add(f); }
    void setEncoder(Encoder e) { this.encoder = e; }

    // 核心方法：先走 Filter 链，再编码，再输出
    void append(LogEvent event) {
        // 第一步：职责链 —— 依次调用每个 Filter
        for (Filter filter : filters) {
            FilterReply reply = filter.decide(event);
            if (reply == FilterReply.DENY) {
                // System.out.println("    " + name + ": Filter 拒绝了 " + event.msg);
                return;  // 职责链中断，丢弃
            }
            if (reply == FilterReply.ACCEPT) {
                break;   // 直接放行，跳过剩余 Filter
            }
            // NEUTRAL：继续下一个 Filter
        }

        // 第二步：Encoder 把对象转成字符串
        String output = encoder != null ? encoder.encode(event) : event.toString();

        // 第三步：输出到具体目的地
        write(output);
    }

    abstract void write(String output);
}

// 控制台 Appender
class ConsoleAppender extends Appender {
    @Override
    void write(String output) {
        System.out.println("    [控制台] " + output);
    }
}

// 文件 Appender
class FileAppender extends Appender {
    @Override
    void write(String output) {
        System.out.println("    [文件] " + output);
    }
}

// ===== 5. Logger：日志器，持有 Appender 列表 =====
class Logger {
    private final String name;
    private final List<Appender> appenderList = new ArrayList<>();

    Logger(String name) { this.name = name; }

    void addAppender(Appender appender) { appenderList.add(appender); }

    void log(int level, String msg) {
        LogEvent event = new LogEvent(level, msg);
        // 观察者模式：通知所有 Appender
        for (Appender appender : appenderList) {
            appender.append(event);
        }
    }

    void info(String msg) { log(2, msg); }
    void warn(String msg) { log(3, msg); }
    void error(String msg) { log(4, msg); }
}

// ===== 6. 配置解析器：模拟 Logback 解析 logback.xml =====
class LogbackConfigParser {
    // 模拟解析这个 XML：
    // <configuration>
    //     <appender name="CONSOLE" class="ConsoleAppender">
    //         <filter class="ThresholdFilter"><level>INFO</level></filter>
    //         <encoder><pattern>[%-5level] %msg</pattern></encoder>
    //     </appender>
    //     <appender name="FILE" class="FileAppender">
    //         <filter class="ThresholdFilter"><level>WARN</level></filter>
    //         <encoder><pattern>%level - %msg</pattern></encoder>
    //     </appender>
    //     <root level="INFO">
    //         <appender-ref ref="CONSOLE"/>
    //         <appender-ref ref="FILE"/>
    //     </root>
    // </configuration>
    static Logger parse() {
        // ===== 解析第一个 <appender> =====
        // <appender name="CONSOLE" class="ConsoleAppender">
        Appender console = new ConsoleAppender();
        console.name = "CONSOLE";
        //     <filter class="ThresholdFilter"><level>INFO</level></filter>
        console.addFilter(new ThresholdFilter(2));  // INFO
        //     <encoder><pattern>...</pattern></encoder>
        console.setEncoder(new PatternLayoutEncoder("[%-5level] %msg"));
        // </appender>

        // ===== 解析第二个 <appender> =====
        // <appender name="FILE" class="FileAppender">
        Appender file = new FileAppender();
        file.name = "FILE";
        //     <filter class="ThresholdFilter"><level>WARN</level></filter>
        file.addFilter(new ThresholdFilter(3));  // WARN
        //     <encoder><pattern>...</pattern></encoder>
        file.setEncoder(new PatternLayoutEncoder("%level - %msg"));
        // </appender>

        // ===== 解析 <root> =====
        // <root level="INFO">
        Logger root = new Logger("root");
        //     <appender-ref ref="CONSOLE"/>
        root.addAppender(console);
        //     <appender-ref ref="FILE"/>
        root.addAppender(file);
        // </root>

        return root;
    }
}

// ===== 7. 运行 =====
public class LogbackInternalDemo {
    public static void main(String[] args) {
        System.out.println("=== Logback 内部对象模型 ===");
        System.out.println("XML 配置：");
        System.out.println("""
            <appender name="CONSOLE" class="ConsoleAppender">
                <filter class="ThresholdFilter"><level>INFO</level></filter>
                <encoder><pattern>[%-5level] %msg</pattern></encoder>
            </appender>
            <appender name="FILE" class="FileAppender">
                <filter class="ThresholdFilter"><level>WARN</level></filter>
                <encoder><pattern>%level - %msg</pattern></encoder>
            </appender>
            """);

        System.out.println("=== 解析后的对象结构 ===");
        System.out.println("""
            root (Logger)
            ├── ConsoleAppender (name=CONSOLE)
            │   ├── ThresholdFilter(minLevel=INFO)   ← 职责链节点
            │   └── PatternLayoutEncoder(pattern=[%-5level] %msg)
            └── FileAppender (name=FILE)
                ├── ThresholdFilter(minLevel=WARN)    ← 职责链节点
                └── PatternLayoutEncoder(pattern=%level - %msg)
            """);

        Logger root = LogbackConfigParser.parse();

        System.out.println("=== 运行时 ===\n");

        String[] tests = {"订单创建成功", "库存不足", "支付接口调用失败"};
        int[] levels = {2, 3, 4};  // INFO, WARN, ERROR

        for (int i = 0; i < tests.length; i++) {
            System.out.println("log." + List.of("","","info","warn","error").get(levels[i]) + "(\"" + tests[i] + "\")");
            root.log(levels[i], tests[i]);
            System.out.println();
        }
    }
}