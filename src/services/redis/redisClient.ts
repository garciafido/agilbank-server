import Redis from 'ioredis';

class RedisClient {
  private static instance: Redis | null = null;
  private static subscriberInstance: Redis | null = null;

  static getInstance(): Redis {
    if (!RedisClient.instance) {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      RedisClient.instance = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          console.log(`[Redis] Reconnecting... attempt ${times}, delay ${delay}ms`);
          return delay;
        },
        reconnectOnError: (err) => {
          console.error('[Redis] Reconnect on error:', err.message);
          return true;
        },
      });

      RedisClient.instance.on('connect', () => {
        console.log('[Redis] Connected successfully');
      });

      RedisClient.instance.on('error', (error) => {
        console.error('[Redis] Connection error:', error);
      });

      RedisClient.instance.on('close', () => {
        console.log('[Redis] Connection closed');
      });
    }

    return RedisClient.instance;
  }

  static getSubscriberInstance(): Redis {
    if (!RedisClient.subscriberInstance) {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      RedisClient.subscriberInstance = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          console.log(`[Redis Subscriber] Reconnecting... attempt ${times}, delay ${delay}ms`);
          return delay;
        },
        reconnectOnError: (err) => {
          console.error('[Redis Subscriber] Reconnect on error:', err.message);
          return true;
        },
      });

      RedisClient.subscriberInstance.on('connect', () => {
        console.log('[Redis Subscriber] Connected successfully');
      });

      RedisClient.subscriberInstance.on('error', (error) => {
        console.error('[Redis Subscriber] Connection error:', error);
      });

      RedisClient.subscriberInstance.on('close', () => {
        console.log('[Redis Subscriber] Connection closed');
      });
    }

    return RedisClient.subscriberInstance;
  }

  static async disconnect(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (RedisClient.instance) {
      console.log('[Redis] Disconnecting publisher...');
      promises.push(RedisClient.instance.quit());
      RedisClient.instance = null;
    }

    if (RedisClient.subscriberInstance) {
      console.log('[Redis Subscriber] Disconnecting subscriber...');
      promises.push(RedisClient.subscriberInstance.quit());
      RedisClient.subscriberInstance = null;
    }

    await Promise.all(promises);
    console.log('[Redis] All connections closed');
  }
}

export const redis = RedisClient.getInstance();
export const redisSubscriber = RedisClient.getSubscriberInstance();
export { RedisClient };
