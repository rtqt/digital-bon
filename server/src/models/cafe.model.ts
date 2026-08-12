import mongoose, { Schema, Document } from 'mongoose';

export interface ICafe extends Document {
  name: string;
  code: string;
  tables: string[];
  shortageAlertThreshold: number;
  declarationGapAlertThreshold: number;
  syncStatus?: 'SYNCED' | 'PENDING_SYNC' | 'SYNC_FAILED';
  chainId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const cafeSchema = new Schema<ICafe>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true, index: true },
    tables: { type: [String], default: [] },
    shortageAlertThreshold: { type: Number, default: 0 },
    declarationGapAlertThreshold: { type: Number, default: 50 },
    syncStatus: { type: String, enum: ['SYNCED', 'PENDING_SYNC', 'SYNC_FAILED'] },
    chainId: { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

export const Cafe = mongoose.model<ICafe>('Cafe', cafeSchema, 'cafes');
