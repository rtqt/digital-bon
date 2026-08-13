"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMutations = void 0;
const cafe_model_1 = require("../../models/cafe.model");
const user_model_1 = require("../../models/user.model");
const auth_1 = require("../../middleware/auth");
const graphql_1 = require("graphql");
const bcrypt_1 = __importDefault(require("bcrypt"));
const systemLog_model_1 = require("../../models/systemLog.model");
const redis_service_1 = require("../../services/redis.service");
exports.authMutations = {
    Mutation: {
        login: async (_, { pin, cafeCode }, ctx) => {
            const ip = ctx.ip || 'unknown';
            const attempts = await (0, redis_service_1.trackLoginAttempt)(ip);
            if (attempts > 5) {
                throw new graphql_1.GraphQLError('TOO_MANY_LOGIN_ATTEMPTS', { extensions: { code: 'TOO_MANY_REQUESTS' } });
            }
            const cafe = await cafe_model_1.Cafe.findOne({ code: cafeCode });
            if (!cafe)
                throw new graphql_1.GraphQLError('INVALID_CAFE_CODE', { extensions: { code: 'UNAUTHENTICATED' } });
            const cafeId = cafe._id.toString();
            const users = await user_model_1.User.find({ cafeId }).lean();
            for (const user of users) {
                const match = await bcrypt_1.default.compare(pin, user.pinHash);
                if (match) {
                    await (0, redis_service_1.clearLoginAttempts)(ip);
                    const token = (0, auth_1.signToken)({
                        userId: user._id.toString(),
                        cafeId: cafeId,
                        sessionVersion: user.sessionVersion,
                    });
                    await systemLog_model_1.SystemLog.create({
                        action: 'LOGIN',
                        description: `User ${user.name} logged into cafe ${cafe.code}`,
                        userId: user._id,
                        cafeId: cafe._id,
                    });
                    return { token, user: { ...user, id: user._id.toString() } };
                }
            }
            throw new graphql_1.GraphQLError('INVALID_PIN', { extensions: { code: 'UNAUTHENTICATED' } });
        },
        superLogin: async (_, { pin }, ctx) => {
            const ip = ctx.ip || 'unknown';
            const attempts = await (0, redis_service_1.trackLoginAttempt)(ip);
            if (attempts > 5) {
                throw new graphql_1.GraphQLError('TOO_MANY_LOGIN_ATTEMPTS', { extensions: { code: 'TOO_MANY_REQUESTS' } });
            }
            const users = await user_model_1.User.find({ cafeId: null }).lean();
            for (const user of users) {
                const match = await bcrypt_1.default.compare(pin, user.pinHash);
                if (match) {
                    await (0, redis_service_1.clearLoginAttempts)(ip);
                    const token = (0, auth_1.signToken)({
                        userId: user._id.toString(),
                        sessionVersion: user.sessionVersion,
                    });
                    await systemLog_model_1.SystemLog.create({
                        action: 'LOGIN',
                        description: `Super Admin ${user.name} logged into the system`,
                        userId: user._id,
                    });
                    return { token, user: { ...user, id: user._id.toString() } };
                }
            }
            throw new graphql_1.GraphQLError('INVALID_PIN', { extensions: { code: 'UNAUTHENTICATED' } });
        },
    }
};
