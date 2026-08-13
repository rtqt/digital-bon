"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureReplicaSet = ensureReplicaSet;
exports.connectDB = connectDB;
const mongodb_1 = require("mongodb");
const mongoose_1 = __importDefault(require("mongoose"));
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/digitalbon';
async function ensureReplicaSet() {
    const client = new mongodb_1.MongoClient('mongodb://localhost:27017', {
        serverSelectionTimeoutMS: 5000,
    });
    try {
        await client.connect();
        const admin = client.db('admin').admin();
        let status = null;
        try {
            status = await admin.command({ replSetGetStatus: 1 });
        }
        catch {
            // RS not yet initiated
            status = null;
        }
        if (!status || status.ok !== 1) {
            console.log('[STARTUP] Initiating replica set rs0...');
            await admin.command({
                replSetInitiate: {
                    _id: 'rs0',
                    members: [{ _id: 0, host: 'localhost:27017' }],
                },
            });
            // Wait for primary election
            await new Promise((r) => setTimeout(r, 3000));
            console.log('[STARTUP] Replica set initiated — waiting for primary...');
        }
        else {
            console.log('[STARTUP] Replica set already running — OK');
        }
    }
    catch (e) {
        console.warn('[STARTUP] Could not verify replica set — continuing with standalone connection:', e.message);
    }
    finally {
        await client.close();
    }
}
async function connectDB() {
    const uri = MONGO_URI.includes('replicaSet')
        ? MONGO_URI
        : `${MONGO_URI}?replicaSet=rs0`;
    try {
        await mongoose_1.default.connect(uri, {
            serverSelectionTimeoutMS: 8000,
        });
        console.log('[DB] Connected to MongoDB:', uri);
    }
    catch {
        // Fallback: try without RS for pure standalone mode
        console.warn('[DB] RS connection failed, falling back to standalone...');
        await mongoose_1.default.connect(MONGO_URI);
        console.log('[DB] Connected (standalone mode — transactions disabled)');
    }
}
