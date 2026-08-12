import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  cafeId?: mongoose.Types.ObjectId;
  roleId: mongoose.Types.ObjectId;
  name: string;
  pinHash: string;
  sessionVersion: number;
  currentLiability: number;
  declaredCash: number;
  status: 'ACTIVE' | 'LOCKED_FOR_RECONCILIATION';
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    cafeId: { type: Schema.Types.ObjectId, ref: 'Cafe', required: false, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    name: { type: String, required: true },
    pinHash: { type: String, required: true },
    sessionVersion: { type: Number, default: 0 },
    currentLiability: { type: Number, default: 0 },
    declaredCash: { type: Number, default: 0 },
    status: { type: String, enum: ['ACTIVE', 'LOCKED_FOR_RECONCILIATION'], default: 'ACTIVE' },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
