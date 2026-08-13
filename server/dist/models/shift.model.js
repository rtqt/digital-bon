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
exports.ShiftReconciliation = exports.Shift = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const shiftSchema = new mongoose_1.Schema({
    cafeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Cafe', required: true, index: true },
    waitressId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    cashierId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['OPEN', 'RECONCILING', 'CLOSED_BALANCED', 'CLOSED_SHORTAGE'], default: 'OPEN' },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
}, { timestamps: true });
const reconciliationSchema = new mongoose_1.Schema({
    cafeId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Cafe', required: true },
    shiftId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Shift', required: true },
    waitressId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    cashierId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    expectedCash: { type: Number, required: true },
    waitstaffDeclared: { type: Number, required: true },
    cashierCounted: { type: Number, required: true },
    variance: { type: Number, required: true },
    declarationGap: { type: Number, required: true },
    result: { type: String, enum: ['BALANCED', 'SURPLUS', 'SHORTAGE'], required: true },
    authorizedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    auditLog: [mongoose_1.Schema.Types.Mixed],
}, { timestamps: true });
exports.Shift = mongoose_1.default.model('Shift', shiftSchema);
exports.ShiftReconciliation = mongoose_1.default.model('ShiftReconciliation', reconciliationSchema);
