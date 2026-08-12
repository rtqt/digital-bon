import mongoose, { Schema, Document } from 'mongoose';

export interface IShift extends Document {
  cafeId: mongoose.Types.ObjectId;
  waitressId: mongoose.Types.ObjectId;
  cashierId?: mongoose.Types.ObjectId;
  status: 'OPEN' | 'RECONCILING' | 'CLOSED_BALANCED' | 'CLOSED_SHORTAGE';
  openedAt: Date;
  closedAt?: Date;
}

export interface IShiftReconciliation extends Document {
  cafeId: mongoose.Types.ObjectId;
  shiftId: mongoose.Types.ObjectId;
  waitressId: mongoose.Types.ObjectId;
  cashierId: mongoose.Types.ObjectId;
  expectedCash: number;
  waitstaffDeclared: number;
  cashierCounted: number;
  variance: number;
  declarationGap: number;
  result: 'BALANCED' | 'SURPLUS' | 'SHORTAGE';
  authorizedBy?: mongoose.Types.ObjectId;
  auditLog: Array<{
    action: string;
    actorId: mongoose.Types.ObjectId;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }>;
  createdAt: Date;
}

const shiftSchema = new Schema<IShift>(
  {
    cafeId: { type: Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    waitressId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['OPEN', 'RECONCILING', 'CLOSED_BALANCED', 'CLOSED_SHORTAGE'], default: 'OPEN' },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
  },
  { timestamps: true }
);

const reconciliationSchema = new Schema<IShiftReconciliation>(
  {
    cafeId: { type: Schema.Types.ObjectId, ref: 'Cafe', required: true },
    shiftId: { type: Schema.Types.ObjectId, ref: 'Shift', required: true },
    waitressId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expectedCash: { type: Number, required: true },
    waitstaffDeclared: { type: Number, required: true },
    cashierCounted: { type: Number, required: true },
    variance: { type: Number, required: true },
    declarationGap: { type: Number, required: true },
    result: { type: String, enum: ['BALANCED', 'SURPLUS', 'SHORTAGE'], required: true },
    authorizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    auditLog: [Schema.Types.Mixed],
  },
  { timestamps: true }
);

export const Shift = mongoose.model<IShift>('Shift', shiftSchema);
export const ShiftReconciliation = mongoose.model<IShiftReconciliation>('ShiftReconciliation', reconciliationSchema);
