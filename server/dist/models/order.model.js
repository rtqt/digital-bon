"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Order = exports.UNRESOLVED_STATUSES = void 0;
const mongoose_1 = __importStar(require("mongoose"));
exports.UNRESOLVED_STATUSES = [
    'PENDING',
    'PRINTED',
    'PRINT_FAILED',
    'VOID_REQUESTED',
    'AMEND_REQUESTED',
    'PENDING_CASH_RESOLUTION',
];
const orderItemSchema = new mongoose_1.Schema({
    productId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
}, { _id: false });
const auditEntrySchema = new mongoose_1.Schema({
    action: { type: String, required: true },
    actorId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    authorizedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    metadata: { type: mongoose_1.Schema.Types.Mixed },
}, { _id: false });
const orderSchema = new mongoose_1.Schema({
    cafeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    waitressId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
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
}, { timestamps: true });
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
exports.Order = mongoose_1.default.model('Order', orderSchema);
