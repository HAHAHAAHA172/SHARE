import { Redis } from '@upstash/redis';

export function createCache({ url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN } = {}) {
  const memory = new Map();
  const redis = url && token ? new Redis({ url, token }) : null;

  return {
    async get(key) {
      if (redis) {
        try { return await redis.get(key); } catch { /* Fall back to process memory. */ }
      }
      const entry = memory.get(key);
      if (!entry || entry.expiresAt <= Date.now()) { memory.delete(key); return null; }
      return entry.value;
    },
    async set(key, value, ttlSeconds = 300) {
      memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      if (redis) {
        try { await redis.set(key, value, { ex: ttlSeconds }); } catch { /* Cache failure must not fail requests. */ }
      }
    },
    async delete(key) {
      memory.delete(key);
      if (redis) {
        try { await redis.del(key); } catch { /* Cache failure must not fail requests. */ }
      }
    },
    backend: redis ? 'redis' : 'memory',
  };
}
