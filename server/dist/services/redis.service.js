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
let redis = null;
let useRedis = process.env.NODE_ENV === 'production';
// In-memory fallback
const memStore = new Map();
function memIncr(key, ttlSeconds) {
    const now = Date.now();
    let item = memStore.get(key);
    if (!item || now > item.exp)
        item = { count: 0, exp: now + (ttlSeconds * 1000) };
    item.count++;
    memStore.set(key, item);
    return item.count;
}
function getRedis() {
    if (!redis) {
        redis = new ioredis_1.default({
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
async function trackVoidAttempt(orderId) {
    const key = `void_attempts:${orderId}`;
    if (!useRedis)
        return memIncr(key, 900);
    try {
        const r = getRedis();
        const count = await r.incr(key);
        await r.expire(key, 900);
        return count;
    }
    catch {
        useRedis = false;
        return memIncr(key, 900);
    }
}
async function clearVoidAttempts(orderId) {
    const key = `void_attempts:${orderId}`;
    if (!useRedis) {
        memStore.delete(key);
        return;
    }
    try {
        await getRedis().del(key);
    }
    catch {
        useRedis = false;
        memStore.delete(key);
    }
}
async function getVoidAttempts(orderId) {
    const key = `void_attempts:${orderId}`;
    if (!useRedis) {
        const item = memStore.get(key);
        return (item && item.exp > Date.now()) ? item.count : 0;
    }
    try {
        const val = await getRedis().get(key);
        return val ? parseInt(val, 10) : 0;
    }
    catch {
        useRedis = false;
        return 0;
    }
}
async function trackLockedVoid(cashierId, shiftId) {
    const key = `locked_void_count:${cashierId}:${shiftId}`;
    if (!useRedis)
        return memIncr(key, 86400);
    try {
        const r = getRedis();
        const count = await r.incr(key);
        await r.expire(key, 86400);
        return count;
    }
    catch {
        useRedis = false;
        return memIncr(key, 86400);
    }
}
// Global Login Brute-Force Protection
// Tracks login attempts per IP address
async function trackLoginAttempt(ip) {
    const key = `login_attempts:${ip}`;
    if (!useRedis)
        return memIncr(key, 900);
    try {
        const r = getRedis();
        const count = await r.incr(key);
        // Lockout window is 15 minutes
        if (count === 1) {
            await r.expire(key, 900);
        }
        return count;
    }
    catch {
        useRedis = false;
        return memIncr(key, 900);
    }
}
async function clearLoginAttempts(ip) {
    const key = `login_attempts:${ip}`;
    if (!useRedis) {
        memStore.delete(key);
        return;
    }
    try {
        await getRedis().del(key);
    }
    catch {
        useRedis = false;
        memStore.delete(key);
    }
}
async function getLoginAttempts(ip) {
    const key = `login_attempts:${ip}`;
    if (!useRedis) {
        const item = memStore.get(key);
        return (item && item.exp > Date.now()) ? item.count : 0;
    }
    try {
        const val = await getRedis().get(key);
        return val ? parseInt(val, 10) : 0;
    }
    catch {
        useRedis = false;
        return 0;
    }
}
