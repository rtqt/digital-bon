import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemLog extends Document {
  action: string;
  description: string;
  userId?: mongoose.Types.ObjectId;
  cafeId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const systemLogSchema = new Schema<ISystemLog>(
  {
    action: { type: String, required: true, index: true },
    description: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: false, index: true },
    cafeId: { type: Schema.Types.ObjectId, ref: 'Cafe', required: false, index: true },
  },
  { timestamps: true }
);

// TTL Index: Delete logs older than 30 days based on createdAt
systemLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const SystemLog = mongoose.model<ISystemLog>('SystemLog', systemLogSchema);
