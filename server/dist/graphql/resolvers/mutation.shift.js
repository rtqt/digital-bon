"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shiftMutations = void 0;
const auth_1 = require("../../middleware/auth");
const user_model_1 = require("../../models/user.model");
const cafe_model_1 = require("../../models/cafe.model");
const order_model_1 = require("../../models/order.model");
const shift_model_1 = require("../../models/shift.model");
const graphql_1 = require("graphql");
const bcrypt_1 = __importDefault(require("bcrypt"));
const subscriptions_1 = require("./subscriptions");
const systemLog_model_1 = require("../../models/systemLog.model");
const redis_service_1 = require("../../services/redis.service");
exports.shiftMutations = {
    Mutation: {
        openShift: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const existing = await shift_model_1.Shift.findOne({ cafeId: c.cafeId, waitressId: c.userId, status: 'OPEN' });
            if (existing)
                return { ...existing.toObject(), id: existing._id.toString(), openedAt: existing.openedAt?.toISOString() };
            const shift = await shift_model_1.Shift.create({ cafeId: c.cafeId, waitressId: c.userId });
            return { ...shift.toObject(), id: shift._id.toString(), openedAt: shift.openedAt?.toISOString() };
        },
        initiateReconciliation: async (_, { waitressId }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const unresolved = await order_model_1.Order.countDocuments({
                cafeId: c.cafeId,
                waitressId,
                status: { $in: order_model_1.UNRESOLVED_STATUSES },
            });
            if (unresolved > 0)
                throw new graphql_1.GraphQLError(`UNRESOLVED_ORDERS: ${unresolved} orders must be resolved first`);
            const settledOrders = await order_model_1.Order.find({
                cafeId: c.cafeId,
                waitressId,
                status: 'SETTLED',
                paymentMethod: 'CASH',
            });
            const expectedCash = settledOrders.reduce((sum, o) => sum + o.totalAmount, 0);
            await user_model_1.User.findByIdAndUpdate(waitressId, {
                $inc: { sessionVersion: 1 },
                status: 'LOCKED_FOR_RECONCILIATION',
                currentLiability: expectedCash,
            });
            const shift = await shift_model_1.Shift.findOneAndUpdate({ cafeId: c.cafeId, waitressId, status: 'OPEN' }, { status: 'RECONCILING', cashierId: c.userId }, { new: true });
            if (!shift)
                throw new graphql_1.GraphQLError('NO_OPEN_SHIFT_FOR_WAITRESS');
            return {
                ...shift.toObject(),
                id: shift._id.toString(),
                openedAt: shift.openedAt?.toISOString(),
                systemExpectedCash: expectedCash,
            };
        },
        submitDualDeclaration: async (_, { shiftId, waitressDeclared, waitressPin, cashierDeclared, cashierPin }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const ip = ctx.ip || 'unknown';
            const attempts = await (0, redis_service_1.trackLoginAttempt)(ip);
            if (attempts > 5) {
                throw new graphql_1.GraphQLError('TOO_MANY_PIN_ATTEMPTS', { extensions: { code: 'TOO_MANY_REQUESTS' } });
            }
            const shift = await shift_model_1.Shift.findOne({ _id: shiftId, cafeId: c.cafeId, status: 'RECONCILING' });
            if (!shift)
                throw new graphql_1.GraphQLError('SHIFT_NOT_IN_RECONCILING_STATE');
            const waitress = await user_model_1.User.findOne({ _id: shift.waitressId, cafeId: c.cafeId });
            const cashier = await user_model_1.User.findById(c.userId);
            if (!waitress || !cashier)
                throw new graphql_1.GraphQLError('USERS_NOT_FOUND');
            const waitressPinValid = await bcrypt_1.default.compare(waitressPin, waitress.pinHash);
            if (!waitressPinValid)
                throw new graphql_1.GraphQLError('INVALID_WAITRESS_PIN');
            const cashierPinValid = await bcrypt_1.default.compare(cashierPin, cashier.pinHash);
            if (!cashierPinValid)
                throw new graphql_1.GraphQLError('INVALID_CASHIER_PIN');
            await (0, redis_service_1.clearLoginAttempts)(ip);
            const expectedCash = waitress.currentLiability;
            const variance = cashierDeclared - expectedCash;
            const declarationGap = Math.abs(cashierDeclared - waitressDeclared);
            let result = 'BALANCED';
            if (variance > 0)
                result = 'SURPLUS';
            else if (variance < 0)
                result = 'SHORTAGE';
            const cafe = await cafe_model_1.Cafe.findById(c.cafeId);
            const gapThreshold = cafe?.declarationGapAlertThreshold ?? 50;
            const shortageThreshold = cafe?.shortageAlertThreshold ?? 0;
            if (declarationGap > gapThreshold) {
                (0, subscriptions_1.publishAdminAlert)(c.cafeId, 'DECLARATION_GAP_ALERT', `Large gap between Waitress (${waitressDeclared}) and Cashier (${cashierDeclared}) declarations`, { userId: shift.waitressId.toString() });
            }
            if (result === 'SHORTAGE' && Math.abs(variance) > shortageThreshold) {
                (0, subscriptions_1.publishAdminAlert)(c.cafeId, 'SHORTAGE_ALERT', `Shift closed with a shortage of ${Math.abs(variance)} ETB.`, { userId: shift.waitressId.toString() });
            }
            await shift_model_1.ShiftReconciliation.create({
                cafeId: c.cafeId,
                shiftId: shift._id,
                waitressId: waitress._id,
                cashierId: cashier._id,
                expectedCash,
                waitstaffDeclared: waitressDeclared,
                cashierCounted: cashierDeclared,
                variance,
                declarationGap,
                result,
                auditLog: [{ action: 'DUAL_DECLARATION_SUBMITTED', actorId: cashier._id, timestamp: new Date() }]
            });
            if (result !== 'SHORTAGE') {
                shift.status = 'CLOSED_BALANCED';
                shift.closedAt = new Date();
                await shift.save();
                await user_model_1.User.findByIdAndUpdate(shift.waitressId, {
                    currentLiability: 0,
                    status: 'ACTIVE',
                    $inc: { sessionVersion: 1 },
                });
            }
            else {
                shift.status = 'CLOSED_SHORTAGE';
                await shift.save();
            }
            await systemLog_model_1.SystemLog.create({
                action: 'SHIFT_CLOSED',
                description: `Shift closed for waitress ${waitress.name}. Result: ${result}. Variance: ${variance} ETB`,
                userId: c.userId,
                cafeId: c.cafeId,
            });
            return {
                ...shift.toObject(),
                id: shift._id.toString(),
                openedAt: shift.openedAt?.toISOString(),
                closedAt: shift.closedAt?.toISOString(),
                systemExpectedCash: expectedCash,
                variance,
                declarationGap,
                result,
            };
        },
        countersignShortage: async (_, { shiftId, adminPin }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const ip = ctx.ip || 'unknown';
            const attempts = await (0, redis_service_1.trackLoginAttempt)(ip);
            if (attempts > 5) {
                throw new graphql_1.GraphQLError('TOO_MANY_PIN_ATTEMPTS', { extensions: { code: 'TOO_MANY_REQUESTS' } });
            }
            const shift = await shift_model_1.Shift.findOne({ _id: shiftId, cafeId: c.cafeId, status: 'CLOSED_SHORTAGE' });
            if (!shift)
                throw new graphql_1.GraphQLError('SHIFT_NOT_IN_SHORTAGE_STATE');
            const admin = await user_model_1.User.findById(c.userId);
            if (!admin)
                throw new graphql_1.GraphQLError('USER_NOT_FOUND');
            const pinValid = await bcrypt_1.default.compare(adminPin, admin.pinHash);
            if (!pinValid)
                throw new graphql_1.GraphQLError('INVALID_ADMIN_PIN');
            await (0, redis_service_1.clearLoginAttempts)(ip);
            const waitress = await user_model_1.User.findById(shift.waitressId);
            const expectedCash = waitress?.currentLiability ?? 0;
            // Update reconciliation audit
            await shift_model_1.ShiftReconciliation.findOneAndUpdate({ shiftId: shift._id }, {
                authorizedBy: admin._id,
                $push: { auditLog: { action: 'SHORTAGE_COUNTERSIGNED', actorId: admin._id, timestamp: new Date() } }
            });
            shift.status = 'CLOSED_BALANCED';
            shift.closedAt = new Date();
            await shift.save();
            await user_model_1.User.findByIdAndUpdate(shift.waitressId, {
                currentLiability: 0,
                status: 'ACTIVE',
                $inc: { sessionVersion: 1 },
            });
            return {
                ...shift.toObject(),
                id: shift._id.toString(),
                openedAt: shift.openedAt?.toISOString(),
                closedAt: shift.closedAt?.toISOString(),
                systemExpectedCash: expectedCash,
            };
        },
    },
};
