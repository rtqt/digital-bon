import mongoose, { Schema, Document } from 'mongoose';

export type OrderStatus =
  | 'PENDING'
  | 'PRINTED'
  | 'PRINT_FAILED'
  | 'VOID_REQUESTED'
  | 'LOCKED_VOID'
  | 'PENDING_CASH_RESOLUTION'
  | 'AMEND_REQUESTED'
  | 'SETTLED'
  | 'VOIDED';

export const UNRESOLVED_STATUSES: OrderStatus[] = [
  'PENDING',
  'PRINTED',
  'PRINT_FAILED',
  'VOID_REQUESTED',
  'AMEND_REQUESTED',
  'PENDING_CASH_RESOLUTION',
];

export interface IOrderItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  unitPrice: number;
  quantity: number;
}

export interface IAuditEntry {
  action: string;
  actorId: mongoose.Types.ObjectId;
  authorizedBy?: mongoose.Types.ObjectId;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface IOrder extends Document {
  cafeId: mongoose.Types.ObjectId;
  waitressId: mongoose.Types.ObjectId;
  tableNumber: string;
  items: IOrderItem[];
  totalAmount: number;
  status: OrderStatus;
  previousStatus?: OrderStatus;
  paymentMethod?: 'CASH' | 'TELEBIRR' | 'CBE_BIRR';
  reason?: string;
  wasPaymentCollected?: boolean;
  requestedAmendment?: {
    tableNumber?: string;
    items?: IOrderItem[];
    reason?: string;
  };
  auditLog: IAuditEntry[];
  $locals: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const auditEntrySchema = new Schema<IAuditEntry>(
  {
    action: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    cafeId: { type: Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    waitressId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tableNumber: { type: String, required: true },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },
    status: { type: String, required: true, default: 'PENDING', index: true },
    previousStatus: { type: String },
    paymentMethod: { type: String, enum: ['CASH', 'TELEBIRR', 'CBE_BIRR'] },
    reason: { type: String },
    wasPaymentCollected: { type: Boolean },
    requestedAmendment: {
      type: {
        tableNumber: String,
        items: [orderItemSchema],
        reason: String,
      },
      required: false,
    },
    auditLog: [auditEntrySchema],
  },
  { timestamps: true }
);

// I-5: Mandatory Audit Logging pre-save hook
orderSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    const actorId = this.$locals?.actorId;
    if (!actorId) {
      return next(new Error('actorId is required in $locals for status changes'));
    }
    this.auditLog.push({
      action: `STATUS_${this.status}`,
      actorId,
      authorizedBy: this.$locals?.authorizedBy,
      timestamp: new Date(),
      metadata: {
        previousStatus: this.$locals?.previousStatus,
        reason: this.reason,
      },
    });
  }
  next();
});

export const Order = mongoose.model<IOrder>('Order', orderSchema);
