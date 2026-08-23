// ===== AsyncAppender 内部机制：队列里到底存的什么？ =====
// 运行：javac AsyncQueueDemo.java && java AsyncQueueDemo

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;

class LogEvent {
    final String threadName;
    final String level;
    final String msg;

    LogEvent(String level, String msg) {
        this.threadName = Thread.currentThread().getName();
        this.level = level;
        this.msg = msg;
    }

    @Override
    public String toString() {
        return "LogEvent{" + level + ", " + msg + ", thread=" + threadName + "}";
    }
}

// 异步 Appender：业务线程只丢队列，后台线程写文件
class AsyncAppender {
    // 队列里存的是：日志事件对象（LogEvent），不是字符串！
    private final BlockingQueue<LogEvent> queue = new ArrayBlockingQueue<>(5);
    private volatile boolean running = true;

    AsyncAppender() {
        // 启动后台线程，不断从队列取事件
        Thread worker = new Thread(() -> {
            while (running) {
                try {
                    // 从队列取出日志事件对象
                    LogEvent event = queue.take();
                    // 然后才进行 Filter -> Encoder -> 写文件
                    Thread.sleep(10); // 模拟磁盘 I/O
                    System.out.println("    [后台线程] 写入文件: " + event);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }, "async-worker");
        worker.setDaemon(true);
        worker.start();
    }

    // 业务线程调这个方法：只丢队列，不阻塞
    void append(LogEvent event) {
        boolean offered = queue.offer(event);
        // offer 返回 false 表示队列满了
        if (!offered) {
            System.out.println("    [业务线程] 队列满了，丢弃: " + event.msg);
        } else {
            System.out.println("    [业务线程] 丢进队列: " + event.msg);
        }
    }

    void stop() { running = false; }
}

public class AsyncQueueDemo {
    public static void main(String[] args) throws Exception {
        System.out.println("===== AsyncAppender 队列机制 =====\n");
        System.out.println("队列里存的是：LogEvent 对象（不是字符串！）\n");

        AsyncAppender appender = new AsyncAppender();

        // 模拟业务线程快速写日志
        String[] logs = {"订单创建成功", "库存不足", "支付超时", "用户登录", "SQL慢查询"};

        for (String log : logs) {
            System.out.println("业务线程: log.info(\"" + log + "\")");
            appender.append(new LogEvent("INFO", log));
            Thread.sleep(2); // 业务线程连续产生日志
        }

        Thread.sleep(200); // 等后台线程处理完
        appender.stop();

        System.out.println("\n===== 总结 =====");
        System.out.println("""
            丢队列 = 把 LogEvent 对象放进内存里的 BlockingQueue
            好处：业务线程只花 0.0001ms 丢队列，不花 10ms 等磁盘 I/O
            风险：队列满了会丢日志（neverBlock=true 时）
            """);
    }
}
