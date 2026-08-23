// ===== MDC 演示：同一请求的日志聚在一起 =====
// 运行：javac MDCDemo.java && java MDCDemo

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 模拟 MDC：本质上就是一个 ThreadLocal<Map>
 * 每个线程有自己的 Map，互不干扰
 */
class MDC {
    // ThreadLocal：每个线程一份独立副本
    private static final ThreadLocal<Map<String, String>> map =
        ThreadLocal.withInitial(HashMap::new);

    static void put(String key, String value) {
        map.get().put(key, value);
    }

    static String get(String key) {
        return map.get().get(key);
    }

    static void clear() {
        map.remove();
    }
}

// 模拟 Logger：打印时自动带上 MDC 里的 traceId
class Logger {
    private final String name;

    Logger(String name) { this.name = name; }

    void info(String msg) {
        String traceId = MDC.get("traceId");
        String userId = MDC.get("userId");
        // 有 traceId 就打印，没有就不打
        if (traceId != null) {
            System.out.printf("[%s] [%s] [user=%s] %s - %s%n",
                Thread.currentThread().getName(), traceId, userId, name, msg);
        }
    }
}

// 模拟一个请求的处理
class RequestHandler implements Runnable {
    private final String requestId;
    private final Logger log = new Logger("OrderService");

    RequestHandler(String requestId) {
        this.requestId = requestId;
    }

    @Override
    public void run() {
        // 请求进来时：设置 traceId
        MDC.put("traceId", UUID.randomUUID().toString().substring(0, 8));
        MDC.put("userId", "user_" + requestId);

        // 同一个请求里的所有日志，traceId 相同
        log.info("收到下单请求");
        log.info("查询用户信息");
        log.info("扣减库存");
        log.info("创建订单成功");

        // 请求结束：清理 MDC，否则线程池复用会串号
        MDC.clear();
    }
}

public class MDCDemo {
    public static void main(String[] args) throws Exception {
        System.out.println("===== 没有 MDC：日志混在一起 =====");
        System.out.println("""
            [http-nio-1] 收到下单请求
            [http-nio-2] 收到下单请求    ← 谁的请求？
            [http-nio-1] 查询用户信息
            [http-nio-2] 查询用户信息    ← 分不清哪个日志属于哪个请求！
            """);

        System.out.println("===== 有 MDC：同一请求 traceId 相同 =====");
        System.out.println("");

        // 模拟两个请求并发处理
        Thread t1 = new Thread(new RequestHandler("1001"), "http-nio-1");
        Thread t2 = new Thread(new RequestHandler("1002"), "http-nio-2");

        t1.start();
        t2.start();

        t1.join();
        t2.join();

        System.out.println("\n===== 总结 =====");
        System.out.println("""
            MDC = Mapped Diagnostic Context（映射诊断上下文）
            本质：ThreadLocal<Map<String, String>>
            作用：同一请求的所有日志，traceId 相同 → 按 traceId 搜索就能串起来

            关键：
            - 请求进来时：MDC.put("traceId", uuid)
            - 请求结束时：MDC.clear()   ← 线程池复用，不清会串号
            """);
    }
}
