// ===== 门面接口（SLF4J 的 Logger 类比） =====
public interface Logger {
    void info(String msg);
    void error(String msg);
    void debug(String msg);
}

// ===== 工厂（SLF4J 的 LoggerFactory 类比） =====
public class LoggerFactory {
    // 静态绑定：编译时决定用哪个实现（SLF4J 也是编译时绑定的）
    private static final String IMPL_CLASS = "LogbackLogger";

    public static Logger getLogger(Class<?> clazz) {
        switch (IMPL_CLASS) {
            case "LogbackLogger":
                return new LogbackLogger(clazz);
            case "Log4j2Logger":
                return new Log4j2Logger(clazz);
            default:
                return new JdkLogger(clazz);
        }
    }
}

// ===== 实现一：Logback =====
public class LogbackLogger implements Logger {
    private final Class<?> clazz;
    public LogbackLogger(Class<?> clazz) { this.clazz = clazz; }

    @Override
    public void info(String msg) {
        System.out.println("[Logback][INFO] " + clazz.getSimpleName() + " - " + msg);
    }
    @Override
    public void error(String msg) {
        System.err.println("[Logback][ERROR] " + clazz.getSimpleName() + " - " + msg);
    }
    @Override
    public void debug(String msg) {
        System.out.println("[Logback][DEBUG] " + clazz.getSimpleName() + " - " + msg);
    }
}

// ===== 实现二：Log4j2 =====
public class Log4j2Logger implements Logger {
    private final Class<?> clazz;
    public Log4j2Logger(Class<?> clazz) { this.clazz = clazz; }

    @Override
    public void info(String msg) {
        System.out.println("[Log4j2][INFO] " + clazz.getSimpleName() + " - " + msg);
    }
    @Override
    public void error(String msg) {
        System.err.println("[Log4j2][ERROR] " + clazz.getSimpleName() + " - " + msg);
    }
    @Override
    public void debug(String msg) {
        System.out.println("[Log4j2][DEBUG] " + clazz.getSimpleName() + " - " + msg);
    }
}

// ===== 使用方：你的业务代码 =====
public class OrderService {
    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public void createOrder(String orderId) {
        log.info("创建订单: " + orderId);
        log.debug("订单详情: xxx");
    }

    public void cancelOrder(String orderId) {
        try {
            // 业务逻辑...
        } catch (Exception e) {
            log.error("取消订单失败: " + orderId);
        }
    }
}

// ===== 桥接 JUL =====
public class JulOverSlf4jBridge extends java.util.logging.Logger {
    private final Logger slf4jLogger;

    public JulOverSlf4jBridge(String name) {
        super(name, null);
        this.slf4jLogger = LoggerFactory.getLogger(name);
    }

    @Override
    public void info(String msg) {
        slf4jLogger.info(msg);
    }
}