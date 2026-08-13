"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderMutations = void 0;
const auth_1 = require("../../middleware/auth");
const user_model_1 = require("../../models/user.model");
const order_model_1 = require("../../models/order.model");
const product_model_1 = require("../../models/product.model");
const shift_model_1 = require("../../models/shift.model");
const graphql_1 = require("graphql");
const bcrypt_1 = __importDefault(require("bcrypt"));
const mongoose_1 = __importDefault(require("mongoose"));
const redis_service_1 = require("../../services/redis.service");
const subscriptions_1 = require("./subscriptions");
const systemLog_model_1 = require("../../models/systemLog.model");
exports.orderMutations = {
    Mutation: {
        createOrder: async (_, { input }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const shift = await shift_model_1.Shift.findOne({ cafeId: c.cafeId, waitressId: c.userId, status: 'OPEN' });
            if (!shift)
                throw new graphql_1.GraphQLError('NO_OPEN_SHIFT', { extensions: { code: 'BAD_USER_INPUT' } });
            const productIds = input.items.map((i) => new mongoose_1.default.Types.ObjectId(i.productId));
            const products = await product_model_1.Product.find({
                _id: { $in: productIds },
                cafeId: c.cafeId,
                isAvailable: true,
            }).lean();
            if (products.length !== productIds.length) {
                throw new graphql_1.GraphQLError('ITEM_UNAVAILABLE_OR_NOT_FOUND', { extensions: { code: 'BAD_USER_INPUT' } });
            }
            const productMap = new Map(products.map((p) => [p._id.toString(), p]));
            const items = input.items.map((item) => {
                const product = productMap.get(item.productId);
                return {
                    productId: product._id,
                    productName: product.name,
                    unitPrice: product.price,
                    quantity: Math.floor(item.quantity),
                };
            });
            const totalAmount = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
            const order = new order_model_1.Order({
                cafeId: c.cafeId,
                waitressId: c.userId,
                tableNumber: input.tableNumber,
                items,
                totalAmount,
                status: 'PENDING',
            });
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const orderObj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_CREATED}_${c.cafeId}`, { orderCreated: orderObj });
            return orderObj;
        },
        settleOrder: async (_, { orderId, paymentMethod }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const shift = await shift_model_1.Shift.findOne({ cafeId: c.cafeId, status: 'OPEN' });
            if (!shift)
                throw new graphql_1.GraphQLError('SHIFT_CLOSED');
            const order = await order_model_1.Order.findOne({
                _id: orderId,
                cafeId: c.cafeId,
                status: { $in: ['PENDING', 'PRINTED'] },
            });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_FOUND_OR_WRONG_STATE');
            order.status = 'SETTLED';
            order.paymentMethod = paymentMethod;
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            if (paymentMethod === 'CASH') {
                await user_model_1.User.findOneAndUpdate({ _id: order.waitressId, cafeId: c.cafeId }, { $inc: { currentLiability: order.totalAmount } });
            }
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            return obj;
        },
        settleWaitressOrders: async (_, { waitressName }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const shift = await shift_model_1.Shift.findOne({ cafeId: c.cafeId, status: 'OPEN' });
            if (!shift)
                throw new graphql_1.GraphQLError('SHIFT_CLOSED');
            const waitress = await user_model_1.User.findOne({ cafeId: c.cafeId, name: waitressName });
            if (!waitress)
                throw new graphql_1.GraphQLError('WAITRESS_NOT_FOUND');
            const orders = await order_model_1.Order.find({
                waitressId: waitress._id,
                cafeId: c.cafeId,
                status: { $in: ['PENDING', 'PRINTED'] },
            });
            const settledOrders = [];
            for (const order of orders) {
                const pm = order.paymentMethod || 'CASH';
                order.status = 'SETTLED';
                order.paymentMethod = pm;
                order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
                await order.save();
                if (pm === 'CASH') {
                    await user_model_1.User.findOneAndUpdate({ _id: order.waitressId, cafeId: c.cafeId }, { $inc: { currentLiability: order.totalAmount } });
                }
                const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
                subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
                settledOrders.push(obj);
            }
            return settledOrders;
        },
        setOrderPaymentMethod: async (_, { orderId, paymentMethod }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({
                _id: orderId,
                cafeId: c.cafeId,
                status: { $in: ['PENDING', 'PRINTED', 'PRINT_FAILED'] },
            });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_FOUND_OR_WRONG_STATE');
            order.paymentMethod = paymentMethod;
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            return obj;
        },
        acknowledgeOrder: async (_, { orderId }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: { $in: ['PENDING', 'PRINT_FAILED'] } });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_FOUND_OR_WRONG_STATE');
            order.status = 'PRINTED';
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            return obj;
        },
        requestOrderVoid: async (_, { orderId, reason }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({
                _id: orderId,
                cafeId: c.cafeId,
                waitressId: c.userId,
                status: { $in: ['PENDING', 'PRINTED', 'PRINT_FAILED'] },
            });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_FOUND_OR_NOT_OWNED');
            order.previousStatus = order.status;
            order.status = 'VOID_REQUESTED';
            order.reason = reason;
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            (0, subscriptions_1.publishAdminAlert)(c.cafeId, 'VOID_REQUESTED', `Void requested for Table ${order.tableNumber}`, { orderId });
            await systemLog_model_1.SystemLog.create({
                action: 'VOID_REQUESTED',
                description: `Void requested for Table ${order.tableNumber}. Reason: ${reason}`,
                userId: c.userId,
                cafeId: c.cafeId,
            });
            return obj;
        },
        approveOrderVoid: async (_, { orderId, pin }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const attempts = await (0, redis_service_1.trackVoidAttempt)(orderId);
            if (attempts > 5) {
                const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'VOID_REQUESTED' });
                if (order) {
                    order.status = 'LOCKED_VOID';
                    order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
                    await order.save();
                    const openShift = await shift_model_1.Shift.findOne({ cafeId: c.cafeId, status: 'OPEN' });
                    if (openShift) {
                        const misconductCount = await (0, redis_service_1.trackLockedVoid)(c.userId, openShift._id.toString());
                        if (misconductCount >= 2) {
                            (0, subscriptions_1.publishAdminAlert)(c.cafeId, 'CASHIER_MISCONDUCT', `Cashier has caused ${misconductCount} locked voids this shift`, { userId: c.userId });
                        }
                    }
                    subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() } });
                    (0, subscriptions_1.publishAdminAlert)(c.cafeId, 'VOID_LOCKED', `Void locked after 5 failed PIN attempts for Table ${order.tableNumber}`, { orderId });
                }
                throw new graphql_1.GraphQLError('VOID_LOCKED_TOO_MANY_ATTEMPTS');
            }
            const cashier = await user_model_1.User.findById(c.userId);
            if (!cashier)
                throw new graphql_1.GraphQLError('USER_NOT_FOUND');
            const pinValid = await bcrypt_1.default.compare(pin, cashier.pinHash);
            if (!pinValid)
                throw new graphql_1.GraphQLError('INVALID_PIN');
            await (0, redis_service_1.clearVoidAttempts)(orderId);
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'VOID_REQUESTED' });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_IN_VOID_REQUESTED');
            order.status = 'VOIDED';
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            await systemLog_model_1.SystemLog.create({
                action: 'VOID_APPROVED',
                description: `Void approved for Table ${order.tableNumber}`,
                userId: c.userId,
                cafeId: c.cafeId,
            });
            return obj;
        },
        rejectOrderVoid: async (_, { orderId }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'VOID_REQUESTED' });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_IN_VOID_REQUESTED');
            order.status = order.previousStatus || 'PENDING';
            order.previousStatus = undefined;
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            return obj;
        },
        directVoid: async (_, { orderId, reason, wasPaymentCollected }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'PRINTED' });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_FOUND_OR_NOT_PRINTED');
            if (wasPaymentCollected) {
                order.status = 'PENDING_CASH_RESOLUTION';
                (0, subscriptions_1.publishAdminAlert)(c.cafeId, 'PENDING_CASH_RESOLUTION', `Cash resolution required for Table ${order.tableNumber}`, { orderId });
            }
            else {
                order.status = 'VOIDED';
            }
            order.reason = reason;
            order.wasPaymentCollected = wasPaymentCollected;
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            return obj;
        },
        adminUnlockVoid: async (_, { orderId, action }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'LOCKED_VOID' });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_LOCKED');
            if (action === 'APPROVE') {
                order.status = 'VOIDED';
            }
            else if (action === 'REJECT') {
                order.status = order.previousStatus || 'PENDING';
                order.previousStatus = undefined;
            }
            else if (action === 'REOPEN') {
                await (0, redis_service_1.clearVoidAttempts)(orderId);
                order.status = 'VOID_REQUESTED';
            }
            else {
                throw new graphql_1.GraphQLError('INVALID_ACTION');
            }
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            return obj;
        },
        resolveCash: async (_, { orderId, resolution }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'PENDING_CASH_RESOLUTION' });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_IN_PENDING_CASH_RESOLUTION');
            if (resolution === 'added_to_liability') {
                await user_model_1.User.findOneAndUpdate({ _id: order.waitressId, cafeId: c.cafeId }, { $inc: { currentLiability: order.totalAmount } });
            }
            order.status = 'VOIDED';
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            return obj;
        },
        amendOrder: async (_, { orderId, newTableNumber, newItems, adminPin }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const ip = ctx.ip || 'unknown';
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'PENDING' });
            if (!order)
                throw new graphql_1.GraphQLError('ONLY_PENDING_ORDERS_CAN_BE_AMENDED');
            const isFinancialChange = !!newItems;
            if (isFinancialChange) {
                if (!adminPin)
                    throw new graphql_1.GraphQLError('ADMIN_PIN_REQUIRED');
                const attempts = await (0, redis_service_1.trackLoginAttempt)(ip);
                if (attempts > 5) {
                    throw new graphql_1.GraphQLError('TOO_MANY_PIN_ATTEMPTS', { extensions: { code: 'TOO_MANY_REQUESTS' } });
                }
                const allUsers = await user_model_1.User.find({ cafeId: c.cafeId });
                let authAdmin = null;
                for (const u of allUsers) {
                    if (await bcrypt_1.default.compare(adminPin, u.pinHash)) {
                        authAdmin = u;
                        break;
                    }
                }
                if (!authAdmin)
                    throw new graphql_1.GraphQLError('INVALID_ADMIN_PIN');
                await (0, redis_service_1.clearLoginAttempts)(ip);
                if (authAdmin._id.toString() === c.userId)
                    throw new graphql_1.GraphQLError('DUAL_AUTH_REQUIRED: authorizedBy must differ from actorId');
                const products = await product_model_1.Product.find({ _id: { $in: newItems.map((i) => i.productId) }, cafeId: c.cafeId, isAvailable: true });
                if (products.length !== newItems.length)
                    throw new graphql_1.GraphQLError('ITEM_UNAVAILABLE');
                const productMap = new Map(products.map((p) => [p._id.toString(), p]));
                let newTotal = 0;
                const validatedItems = newItems.map((item) => {
                    const product = productMap.get(item.productId);
                    newTotal += product.price * item.quantity;
                    return { productId: product._id, productName: product.name, unitPrice: product.price, quantity: item.quantity };
                });
                order.items = validatedItems;
                order.totalAmount = newTotal;
                order.$locals.authorizedBy = authAdmin._id;
            }
            if (newTableNumber)
                order.tableNumber = newTableNumber;
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            await systemLog_model_1.SystemLog.create({
                action: 'AMEND_ORDER',
                description: `Order for Table ${order.tableNumber} was amended directly. Financial change: ${isFinancialChange}`,
                userId: c.userId,
                cafeId: c.cafeId,
            });
            return obj;
        },
        requestAmendOrder: async (_, { orderId, newTableNumber, newItems, reason }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: { $in: ['PENDING', 'PRINTED'] } });
            if (!order)
                throw new graphql_1.GraphQLError('ONLY_PENDING_OR_PRINTED_ORDERS_CAN_BE_AMENDED');
            let validatedItems;
            if (newItems) {
                const products = await product_model_1.Product.find({ _id: { $in: newItems.map((i) => i.productId) }, cafeId: c.cafeId });
                if (products.length !== newItems.length)
                    throw new graphql_1.GraphQLError('ITEM_UNAVAILABLE');
                const productMap = new Map(products.map((p) => [p._id.toString(), p]));
                validatedItems = newItems.map((item) => {
                    const product = productMap.get(item.productId);
                    return { productId: product._id, productName: product.name, unitPrice: product.price, quantity: item.quantity };
                });
            }
            order.previousStatus = order.status;
            order.status = 'AMEND_REQUESTED';
            order.requestedAmendment = {
                tableNumber: newTableNumber,
                items: validatedItems,
                reason,
            };
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            await systemLog_model_1.SystemLog.create({
                action: 'AMEND_REQUESTED',
                description: `Amendment requested for Table ${order.tableNumber}. Reason: ${reason}`,
                userId: c.userId,
                cafeId: c.cafeId,
            });
            return obj;
        },
        approveAmendment: async (_, { orderId }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'AMEND_REQUESTED' });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_IN_AMEND_REQUESTED');
            if (!order.requestedAmendment)
                throw new graphql_1.GraphQLError('NO_REQUESTED_AMENDMENT');
            if (order.requestedAmendment.items) {
                order.items = order.requestedAmendment.items;
                order.totalAmount = order.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
            }
            if (order.requestedAmendment.tableNumber) {
                order.tableNumber = order.requestedAmendment.tableNumber;
            }
            order.status = order.previousStatus || 'PENDING';
            order.previousStatus = undefined;
            order.requestedAmendment = undefined;
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            await systemLog_model_1.SystemLog.create({
                action: 'AMEND_APPROVED',
                description: `Amendment approved for Table ${order.tableNumber}`,
                userId: c.userId,
                cafeId: c.cafeId,
            });
            return obj;
        },
        rejectAmendment: async (_, { orderId }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const order = await order_model_1.Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'AMEND_REQUESTED' });
            if (!order)
                throw new graphql_1.GraphQLError('ORDER_NOT_IN_AMEND_REQUESTED');
            order.status = order.previousStatus || 'PENDING';
            order.previousStatus = undefined;
            order.requestedAmendment = undefined;
            order.$locals.actorId = new mongoose_1.default.Types.ObjectId(c.userId);
            await order.save();
            const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
            return obj;
        },
    },
};
