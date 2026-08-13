"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_EXPIRY = void 0;
exports.signToken = signToken;
exports.buildContext = buildContext;
exports.requireAuth = requireAuth;
exports.requirePermission = requirePermission;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_model_1 = require("../models/user.model");
const role_model_1 = require("../models/role.model");
const JWT_SECRET = process.env.JWT_SECRET || 'digitalbon-dev-secret-change-in-prod';
exports.JWT_EXPIRY = '12h';
function signToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn: exports.JWT_EXPIRY });
}
async function buildContext(req) {
    try {
        const authHeader = req?.headers?.authorization || '';
        if (!authHeader.startsWith('Bearer '))
            return null;
        const token = authHeader.slice(7);
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // I-7: sessionVersion check — enforce shift lock invalidation
        const user = await user_model_1.User.findById(payload.userId).select('sessionVersion cafeId roleId').lean();
        if (!user)
            return null;
        if (user.sessionVersion !== payload.sessionVersion)
            return null;
        // Live permission fetch from DB
        const role = await role_model_1.Role.findById(user.roleId).select('permissions').lean();
        const permissions = role?.permissions || [];
        return { userId: payload.userId, cafeId: payload.cafeId, permissions };
    }
    catch {
        return null;
    }
}
function requireAuth(ctx) {
    if (!ctx)
        throw new Error('UNAUTHENTICATED');
    return ctx;
}
function requirePermission(ctx, permission) {
    if (!ctx.permissions.includes(permission)) {
        throw new Error(`FORBIDDEN: missing permission ${permission}`);
    }
}
