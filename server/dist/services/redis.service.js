"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRedis = getRedis;
exports.trackVoidAttempt = trackVoidAttempt;
exports.clearVoidAttempts = clearVoidAttempts;
exports.getVoidAttempts = getVoidAttempts;
exports.trackLockedVoid = trackLockedVoid;
exports.trackLoginAttempt = trackLoginAttempt;
exports.clearLoginAttempts = clearLoginAttempts;
exports.getLoginAttempts = getLoginAttempts;
const ioredis_1 = __importDefault(require("ioredis"));
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
let redis;
function getRedis() {
    if (!redis) {
        redis = new ioredis_1.default({ host: REDIS_HOST, port: REDIS_PORT, lazyConnect: true });
        redis.on('error', (e) => console.warn('[Redis] Error:', e.message));
    }
    return redis;
}
// PIN brute-force lockout — 5 attempts in 15-minute window per orderId
async function trackVoidAttempt(orderId) {
    const r = getRedis();
    const key = `void_attempts:${orderId}`;
    const count = await r.incr(key);
    await r.expire(key, 900); // 15-minute window
    return count;
}
async function clearVoidAttempts(orderId) {
    await getRedis().del(`void_attempts:${orderId}`);
}
async function getVoidAttempts(orderId) {
    const val = await getRedis().get(`void_attempts:${orderId}`);
    return val ? parseInt(val, 10) : 0;
}
// Cashier Misconduct Alert — track LOCKED_VOID count per cashier per shift
async function trackLockedVoid(cashierId, shiftId) {
    const r = getRedis();
    const key = `locked_void_count:${cashierId}:${shiftId}`;
    const count = await r.incr(key);
    await r.expire(key, 86400); // 24 hours
    return count;
}
// Global Login Brute-Force Protection
// Tracks login attempts per IP address
async function trackLoginAttempt(ip) {
    const r = getRedis();
    const key = `login_attempts:${ip}`;
    const count = await r.incr(key);
    // Lockout window is 15 minutes
    if (count === 1) {
        await r.expire(key, 900);
    }
    return count;
}
async function clearLoginAttempts(ip) {
    await getRedis().del(`login_attempts:${ip}`);
}
async function getLoginAttempts(ip) {
    const val = await getRedis().get(`login_attempts:${ip}`);
    return val ? parseInt(val, 10) : 0;
}
