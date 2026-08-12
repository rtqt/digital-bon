import { MongoClient } from 'mongodb';
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/digitalbon';

export async function ensureReplicaSet(): Promise<void> {
  const client = new MongoClient('mongodb://localhost:27017', {
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await client.connect();
    const admin = client.db('admin').admin();

    let status: any = null;
    try {
      status = await admin.command({ replSetGetStatus: 1 });
    } catch {
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
    } else {
      console.log('[STARTUP] Replica set already running — OK');
    }
  } catch (e) {
    console.warn('[STARTUP] Could not verify replica set — continuing with standalone connection:', (e as Error).message);
  } finally {
    await client.close();
  }
}

export async function connectDB(): Promise<void> {
  const uri = MONGO_URI.includes('replicaSet')
    ? MONGO_URI
    : `${MONGO_URI}?replicaSet=rs0`;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log('[DB] Connected to MongoDB:', uri);
  } catch {
    // Fallback: try without RS for pure standalone mode
    console.warn('[DB] RS connection failed, falling back to standalone...');
    await mongoose.connect(MONGO_URI);
    console.log('[DB] Connected (standalone mode — transactions disabled)');
  }
}
