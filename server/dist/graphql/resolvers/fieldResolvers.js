"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fieldResolvers = void 0;
const user_model_1 = require("../../models/user.model");
const product_model_1 = require("../../models/product.model");
const role_model_1 = require("../../models/role.model");
exports.fieldResolvers = {
    Order: {
        waitress: (order) => user_model_1.User.findById(order.waitressId).lean().then((u) => u ? { ...u, id: u._id.toString() } : null),
        auditLog: (order) => (order.auditLog || []).map((a) => ({
            ...a,
            timestamp: a.timestamp?.toISOString ? a.timestamp.toISOString() : a.timestamp,
            metadata: a.metadata ? JSON.stringify(a.metadata) : null,
        })),
    },
    Product: {
        category: (product) => product_model_1.Category.findById(product.categoryId).lean().then((c) => c ? { ...c, id: c._id.toString() } : null),
    },
    User: {
        role: (user) => role_model_1.Role.findById(user.roleId).lean().then((r) => r ? { ...r, id: r._id.toString() } : null),
    },
    Shift: {
        waitress: (shift) => user_model_1.User.findById(shift.waitressId).lean().then((u) => u ? { ...u, id: u._id.toString() } : null),
    },
};
