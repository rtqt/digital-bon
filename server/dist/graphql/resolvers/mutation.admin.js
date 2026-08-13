"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminMutations = void 0;
const auth_1 = require("../../middleware/auth");
const cafe_model_1 = require("../../models/cafe.model");
const role_model_1 = require("../../models/role.model");
const user_model_1 = require("../../models/user.model");
const graphql_1 = require("graphql");
const bcrypt_1 = __importDefault(require("bcrypt"));
const systemLog_model_1 = require("../../models/systemLog.model");
function requirePermission(ctx, perm) {
    if (!ctx.permissions.includes(perm)) {
        throw new Error('UNAUTHORIZED');
    }
}
exports.adminMutations = {
    Mutation: {
        createCafe: async (_, { name, code, adminPin }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            requirePermission(c, 'SYSTEM_ADMIN');
            const cafe = await cafe_model_1.Cafe.create({ name, code });
            const adminRole = await role_model_1.Role.create({
                cafeId: cafe._id,
                name: 'Cafe Admin',
                permissions: ['CREATE_ORDER', 'SETTLE_ORDER', 'REQUEST_VOID', 'APPROVE_VOID', 'REJECT_VOID', 'DIRECT_VOID', 'RESOLVE_CASH', 'INITIATE_RECONCILIATION', 'AMEND_ORDER', 'UNLOCK_VOID', 'MANAGE_MENU', 'MANAGE_STAFF', 'VIEW_ANALYTICS', 'CAFE_ADMIN'],
                scope: 'CAFE',
            });
            const pinHash = await bcrypt_1.default.hash(adminPin, 10);
            await user_model_1.User.create({
                cafeId: cafe._id,
                roleId: adminRole._id,
                name: 'Admin',
                pinHash,
            });
            await systemLog_model_1.SystemLog.create({
                action: 'CREATE_CAFE',
                description: `New cafe deployed: ${name} (${code})`,
                userId: c.userId,
                cafeId: cafe._id,
            });
            return { ...cafe.toObject(), id: cafe._id.toString() };
        },
        updateCafe: async (_, args, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            requirePermission(c, 'SYSTEM_ADMIN');
            const { id, ...updates } = args;
            const cafe = await cafe_model_1.Cafe.findByIdAndUpdate(id, updates, { new: true });
            if (!cafe)
                throw new graphql_1.GraphQLError('CAFE_NOT_FOUND');
            await systemLog_model_1.SystemLog.create({
                action: 'UPDATE_CAFE',
                description: `Cafe updated: ${cafe.name} (${cafe.code})`,
                userId: c.userId,
                cafeId: cafe._id,
            });
            return { ...cafe.toObject(), id: cafe._id.toString() };
        },
        updateCafeTables: async (_, { tables }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const normalised = [...new Set(tables.map((t) => t.trim()).filter(Boolean))];
            const cafe = await cafe_model_1.Cafe.findByIdAndUpdate(c.cafeId, { tables: normalised }, { new: true });
            if (!cafe)
                throw new graphql_1.GraphQLError('CAFE_NOT_FOUND');
            return { ...cafe.toObject(), id: cafe._id.toString() };
        },
    }
};
