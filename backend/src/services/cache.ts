import Redis from 'ioredis';
import { config } from '../config.js';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
    });

    redis.on('error', (err) => {
      // Don't crash — just log; caching is optional
      console.warn('[redis] Connection error (cache disabled):', err.message);
    });

    redis.on('connect', () => console.log('[redis] Connected'));
  }
  return redis;
}

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

/**
 * Get a cached value. Returns null on cache miss or Redis error.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with optional TTL (seconds).
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
  try {
    await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Cache failures are non-fatal
  }
}

/**
 * Delete a cached key (or a pattern using SCAN).
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    await getRedis().del(key);
  } catch {}
}

/**
 * Delete all keys matching a glob pattern (e.g. "report:summary:*").
 * Uses SCAN to avoid KEYS on large datasets.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const client = getRedis();
    let cursor = '0';
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', '100');
      cursor = nextCursor;
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } while (cursor !== '0');
  } catch {}
}

/**
 * Wrap an async function with cache-aside logic.
 * The getter is only called on a cache miss; the result is stored with the given TTL.
 */
export async function withCache<T>(
  key: string,
  getter: () => Promise<T>,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const fresh = await getter();
  await cacheSet(key, fresh, ttlSeconds);
  return fresh;
}
