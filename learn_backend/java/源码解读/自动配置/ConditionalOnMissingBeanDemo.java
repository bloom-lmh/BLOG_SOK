// ===== @ConditionalOnMissingBean 留覆盖口子 演示 =====
// 模拟：Spring Boot 默认配了一个 RedisTemplate，但你可以覆盖

import java.util.ArrayList;
import java.util.List;

// ===== 模拟 Spring 容器 =====
class BeanFactory {
    private final List<Object> beans = new ArrayList<>();

    void register(Object bean) {
        beans.add(bean);
    }

    boolean hasBean(Class<?> type) {
        return beans.stream().anyMatch(type::isInstance);
    }

    @SuppressWarnings("unchecked")
    <T> T getBean(Class<T> type) {
        return (T) beans.stream().filter(type::isInstance).findFirst().orElse(null);
    }
}

// ===== RedisTemplate 类 =====
class RedisTemplate {
    private final String serializer;

    RedisTemplate(String serializer) {
        this.serializer = serializer;
    }

    void set(String key, String value) {
        System.out.println("  Redis: " + key + "=" + value + " (序列化方式: " + serializer + ")");
    }
}

// ===== 模拟 Spring Boot 自动配置类 =====
class RedisAutoConfiguration {
    // 相当于 @ConditionalOnMissingBean
    // 规则：如果容器里还没有 RedisTemplate，就创建默认的
    RedisTemplate redisTemplate(BeanFactory factory) {
        if (!factory.hasBean(RedisTemplate.class)) {
            // 用户没自定义 -> 用默认的
            RedisTemplate template = new RedisTemplate("JDK序列化");
            System.out.println("  [自动配置] 容器里没有 RedisTemplate，创建默认的");
            factory.register(template);
            return template;
        }
        // 用户已经自定义了 -> 跳过，不覆盖
        System.out.println("  [自动配置] 用户已自定义 RedisTemplate，跳过");
        return factory.getBean(RedisTemplate.class);
    }
}

public class ConditionalOnMissingBeanDemo {
    public static void main(String[] args) {
        System.out.println("===== 场景一：用户没自定义（走默认）=====\n");
        BeanFactory factory1 = new BeanFactory();
        RedisAutoConfiguration autoConfig = new RedisAutoConfiguration();

        // 自动配置类执行
        RedisTemplate template1 = autoConfig.redisTemplate(factory1);

        // 用户使用
        template1.set("name", "张三");

        System.out.println("\n===== 场景二：用户自定义了（覆盖默认）=====\n");
        BeanFactory factory2 = new BeanFactory();

        // 用户先自己配了一个 RedisTemplate（用 JSON 序列化）
        RedisTemplate myTemplate = new RedisTemplate("JSON序列化");
        factory2.register(myTemplate);
        System.out.println("  [用户] 我自定义了 RedisTemplate，用 JSON 序列化");

        // 自动配置类执行——发现已经有 Bean 了，跳过
        RedisTemplate template2 = autoConfig.redisTemplate(factory2);

        // 用户使用自己的配置
        template2.set("name", "李四");

        System.out.println("\n===== 总结 =====");
        System.out.println(
            "@ConditionalOnMissingBean 的语义：\n" +
            "  \"如果容器里还没有这个 Bean，我就创建默认的\"\n" +
            "  \"如果容器里已经有了，说明用户自己配了，我不覆盖\"\n\n" +
            "这就是\"留覆盖口子\"：\n" +
            "  Spring Boot 的默认配置是\"兜底方案\"\n" +
            "  用户不满意可以自己配一个，Spring Boot 不覆盖用户的\n");
    }
}