"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userMutations = void 0;
const auth_1 = require("../../middleware/auth");
const user_model_1 = require("../../models/user.model");
const role_model_1 = require("../../models/role.model");
const graphql_1 = require("graphql");
const bcrypt_1 = __importDefault(require("bcrypt"));
exports.userMutations = {
    Mutation: {
        createUser: async (_, { name, roleId, pin }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const pinHash = await bcrypt_1.default.hash(pin, 10);
            const user = await user_model_1.User.create({ cafeId: c.cafeId, roleId, name, pinHash });
            return { ...user.toObject(), id: user._id.toString() };
        },
        updateUser: async (_, { id, name, pin, status }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const updates = {};
            if (name !== undefined)
                updates.name = name;
            if (status !== undefined)
                updates.status = status;
            if (pin)
                updates.pinHash = await bcrypt_1.default.hash(pin, 10);
            const user = await user_model_1.User.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, updates, { new: true });
            if (!user)
                throw new graphql_1.GraphQLError('NOT_FOUND');
            return { ...user.toObject(), id: user._id.toString() };
        },
        updateUserRole: async (_, { id, roleId }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const user = await user_model_1.User.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, { roleId }, { new: true });
            if (!user)
                throw new graphql_1.GraphQLError('NOT_FOUND');
            return { ...user.toObject(), id: user._id.toString() };
        },
        resetUserPin: async (_, { id, newPin }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const pinHash = await bcrypt_1.default.hash(newPin, 10);
            const user = await user_model_1.User.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, { pinHash }, { new: true });
            if (!user)
                throw new graphql_1.GraphQLError('NOT_FOUND');
            return { ...user.toObject(), id: user._id.toString() };
        },
        createRole: async (_, { name, permissions, scope }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const role = await role_model_1.Role.create({ cafeId: c.cafeId, name, permissions, scope: scope || 'CAFE' });
            return { ...role.toObject(), id: role._id.toString() };
        },
        updateRolePermissions: async (_, { id, permissions }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const role = await role_model_1.Role.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, { permissions }, { new: true });
            if (!role)
                throw new graphql_1.GraphQLError('NOT_FOUND');
            return { ...role.toObject(), id: role._id.toString() };
        },
    }
};
