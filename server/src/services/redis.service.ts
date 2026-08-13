import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);

let redis: Redis;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true });
    redis.on('error', (e) => console.warn('[Redis] Error:', e.message));
  }
  return redis;
}

// PIN brute-force lockout — 5 attempts in 15-minute window per orderId
export async function trackVoidAttempt(orderId: string): Promise<number> {
  const r = getRedis();
  const key = `void_attempts:${orderId}`;
  const count = await r.incr(key);
  await r.expire(key, 900); // 15-minute window
  return count;
}

export async function clearVoidAttempts(orderId: string): Promise<void> {
  await getRedis().del(`void_attempts:${orderId}`);
}

export async function getVoidAttempts(orderId: string): Promise<number> {
  const val = await getRedis().get(`void_attempts:${orderId}`);
  return val ? parseInt(val, 10) : 0;
}

// Cashier Misconduct Alert — track LOCKED_VOID count per cashier per shift
export async function trackLockedVoid(cashierId: string, shiftId: string): Promise<number> {
  const r = getRedis();
  const key = `locked_void_count:${cashierId}:${shiftId}`;
  const count = await r.incr(key);
  await r.expire(key, 86400); // 24 hours
  return count;
}

// Global Login Brute-Force Protection
// Tracks login attempts per IP address
export async function trackLoginAttempt(ip: string): Promise<number> {
  const r = getRedis();
  const key = `login_attempts:${ip}`;
  const count = await r.incr(key);
  // Lockout window is 15 minutes
  if (count === 1) {
    await r.expire(key, 900);
  }
  return count;
}

export async function clearLoginAttempts(ip: string): Promise<void> {
  await getRedis().del(`login_attempts:${ip}`);
}

export async function getLoginAttempts(ip: string): Promise<number> {
  const val = await getRedis().get(`login_attempts:${ip}`);
  return val ? parseInt(val, 10) : 0;
}
