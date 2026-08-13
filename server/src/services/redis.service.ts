import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

let redis: Redis | null = null;
let useRedis = process.env.NODE_ENV === 'production';

// In-memory fallback
const memStore = new Map<string, { count: number; exp: number }>();

function memIncr(key: string, ttlSeconds: number): number {
  const now = Date.now();
  let item = memStore.get(key);
  if (!item || now > item.exp) item = { count: 0, exp: now + (ttlSeconds * 1000) };
  item.count++;
  memStore.set(key, item);
  return item.count;
}

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null
    });
    redis.on('error', (e) => {
      console.warn('[Redis] Unreachable. Using in-memory fallback for local dev.');
      useRedis = false;
    });
  }
  return redis;
}

export async function trackVoidAttempt(orderId: string): Promise<number> {
  const key = `void_attempts:${orderId}`;
  if (!useRedis) return memIncr(key, 900);
  try {
    const r = getRedis();
    const count = await r.incr(key);
    await r.expire(key, 900);
    return count;
  } catch {
    useRedis = false;
    return memIncr(key, 900);
  }
}

export async function clearVoidAttempts(orderId: string): Promise<void> {
  const key = `void_attempts:${orderId}`;
  if (!useRedis) { memStore.delete(key); return; }
  try { await getRedis().del(key); } catch { useRedis = false; memStore.delete(key); }
}

export async function getVoidAttempts(orderId: string): Promise<number> {
  const key = `void_attempts:${orderId}`;
  if (!useRedis) {
    const item = memStore.get(key);
    return (item && item.exp > Date.now()) ? item.count : 0;
  }
  try {
    const val = await getRedis().get(key);
    return val ? parseInt(val, 10) : 0;
  } catch {
    useRedis = false;
    return 0;
  }
}

export async function trackLockedVoid(cashierId: string, shiftId: string): Promise<number> {
  const key = `locked_void_count:${cashierId}:${shiftId}`;
  if (!useRedis) return memIncr(key, 86400);
  try {
    const r = getRedis();
    const count = await r.incr(key);
    await r.expire(key, 86400);
    return count;
  } catch {
    useRedis = false;
    return memIncr(key, 86400);
  }
}

// Global Login Brute-Force Protection
// Tracks login attempts per IP address
export async function trackLoginAttempt(ip: string): Promise<number> {
  const key = `login_attempts:${ip}`;
  if (!useRedis) return memIncr(key, 900);
  try {
    const r = getRedis();
    const count = await r.incr(key);
    // Lockout window is 15 minutes
    if (count === 1) {
      await r.expire(key, 900);
    }
    return count;
  } catch {
    useRedis = false;
    return memIncr(key, 900);
  }
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  const key = `login_attempts:${ip}`;
  if (!useRedis) { memStore.delete(key); return; }
  try { await getRedis().del(key); } catch { useRedis = false; memStore.delete(key); }
}

export async function getLoginAttempts(ip: string): Promise<number> {
  const key = `login_attempts:${ip}`;
  if (!useRedis) {
    const item = memStore.get(key);
    return (item && item.exp > Date.now()) ? item.count : 0;
  }
  try {
    const val = await getRedis().get(key);
    return val ? parseInt(val, 10) : 0;
  } catch {
    useRedis = false;
    return 0;
  }
}
