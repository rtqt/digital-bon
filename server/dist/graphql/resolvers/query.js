"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryResolvers = void 0;
const auth_1 = require("../../middleware/auth");
const user_model_1 = require("../../models/user.model");
const role_model_1 = require("../../models/role.model");
const cafe_model_1 = require("../../models/cafe.model");
const order_model_1 = require("../../models/order.model");
const product_model_1 = require("../../models/product.model");
const shift_model_1 = require("../../models/shift.model");
const systemLog_model_1 = require("../../models/systemLog.model");
function requirePermission(ctx, perm) {
    if (!ctx.permissions.includes(perm)) {
        throw new Error('UNAUTHORIZED');
    }
}
exports.queryResolvers = {
    Query: {
        me: (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            return user_model_1.User.findById(c.userId).lean().then((u) => u ? { ...u, id: u._id.toString() } : null);
        },
        orders: async (_, { status }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const filter = { cafeId: c.cafeId };
            if (status)
                filter.status = status;
            const orders = await order_model_1.Order.find(filter).sort({ createdAt: -1 }).lean();
            return orders.map((o) => ({ ...o, id: o._id.toString() }));
        },
        order: async (_, { id }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const o = await order_model_1.Order.findOne({ _id: id, cafeId: c.cafeId }).lean();
            return o ? { ...o, id: o._id.toString() } : null;
        },
        activeShifts: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const shifts = await shift_model_1.Shift.find({ cafeId: c.cafeId, status: { $in: ['OPEN', 'RECONCILING'] } }).lean();
            return shifts.map((s) => ({ ...s, id: s._id.toString(), openedAt: s.openedAt?.toISOString() }));
        },
        shortageShifts: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const shifts = await shift_model_1.Shift.find({ cafeId: c.cafeId, status: 'CLOSED_SHORTAGE' }).populate('waitressId').lean();
            return shifts.map((s) => ({
                ...s,
                id: s._id.toString(),
                openedAt: s.openedAt?.toISOString(),
                waitress: s.waitressId ? { ...s.waitressId, id: s.waitressId._id.toString() } : null
            }));
        },
        categories: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const cats = await product_model_1.Category.find({ cafeId: c.cafeId }).sort({ order: 1 }).lean();
            return cats.map((c) => ({ ...c, id: c._id.toString() }));
        },
        products: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const prods = await product_model_1.Product.find({ cafeId: c.cafeId }).lean();
            return prods.map((p) => ({ ...p, id: p._id.toString() }));
        },
        users: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const users = await user_model_1.User.find({ cafeId: c.cafeId }).lean();
            return users.map((u) => ({ ...u, id: u._id.toString() }));
        },
        roles: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const roles = await role_model_1.Role.find({ cafeId: c.cafeId }).lean();
            return roles.map((r) => ({ ...r, id: r._id.toString() }));
        },
        cafe: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const cafe = await cafe_model_1.Cafe.findById(c.cafeId).lean();
            return cafe ? { ...cafe, id: cafe._id.toString() } : null;
        },
        cafes: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            requirePermission(c, 'SYSTEM_ADMIN');
            const cafes = await cafe_model_1.Cafe.find().lean();
            return cafes.map((cafe) => ({ ...cafe, id: cafe._id.toString() }));
        },
        systemLogs: async (_, { limit }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            requirePermission(c, 'SYSTEM_ADMIN');
            const logs = await systemLog_model_1.SystemLog.find()
                .sort({ createdAt: -1 })
                .limit(limit || 100)
                .populate('userId', 'name')
                .populate('cafeId', 'name code')
                .lean();
            return logs.map((l) => ({
                ...l,
                id: l._id.toString(),
                createdAt: l.createdAt?.toISOString(),
                user: l.userId ? { ...l.userId, id: l.userId._id.toString() } : null,
                cafe: l.cafeId ? { ...l.cafeId, id: l.cafeId._id.toString() } : null,
            }));
        },
        tableOccupancy: async (_, __, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const cafe = await cafe_model_1.Cafe.findById(c.cafeId).lean();
            const tables = cafe?.tables || [];
            if (tables.length === 0)
                return [];
            const activeOrders = await order_model_1.Order.find({
                cafeId: c.cafeId,
                status: { $in: ['PENDING', 'ACKNOWLEDGED', 'PRINT_FAILED', 'PRINTED', 'VOID_REQUESTED'] },
            }).populate('waitressId').lean();
            const occupied = new Map();
            for (const order of activeOrders) {
                const waitress = order.waitressId;
                occupied.set(order.tableNumber, {
                    orderId: order._id.toString(),
                    waitressName: waitress?.name || 'Unknown',
                });
            }
            return tables.map(tableNumber => {
                const occ = occupied.get(tableNumber);
                return {
                    tableNumber,
                    isOccupied: !!occ,
                    orderId: occ?.orderId || null,
                    waitressName: occ?.waitressName || null,
                };
            });
        },
    },
};
