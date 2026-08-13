"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.menuMutations = void 0;
const auth_1 = require("../../middleware/auth");
const product_model_1 = require("../../models/product.model");
const graphql_1 = require("graphql");
const subscriptions_1 = require("./subscriptions");
exports.menuMutations = {
    Mutation: {
        createCategory: async (_, { name, order }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            if (!c.cafeId)
                throw new graphql_1.GraphQLError('CAFE_ID_REQUIRED');
            const cat = await product_model_1.Category.create({ cafeId: c.cafeId, name, order: order ?? 0 });
            subscriptions_1.pubsub.publish(`${subscriptions_1.MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
            return { ...cat.toObject(), id: cat._id.toString() };
        },
        updateCategory: async (_, { id, name, order }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const update = {};
            if (name !== undefined)
                update.name = name;
            if (order !== undefined)
                update.order = order;
            const cat = await product_model_1.Category.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, update, { new: true });
            if (!cat)
                throw new graphql_1.GraphQLError('NOT_FOUND');
            subscriptions_1.pubsub.publish(`${subscriptions_1.MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
            return { ...cat.toObject(), id: cat._id.toString() };
        },
        deleteCategory: async (_, { id }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const res = await product_model_1.Category.deleteOne({ _id: id, cafeId: c.cafeId });
            subscriptions_1.pubsub.publish(`${subscriptions_1.MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
            return res.deletedCount === 1;
        },
        createProduct: async (_, { categoryId, name, price, cost, isAvailable }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const prod = await product_model_1.Product.create({ cafeId: c.cafeId, categoryId, name, price, cost, isAvailable: isAvailable !== false });
            subscriptions_1.pubsub.publish(`${subscriptions_1.MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
            return { ...prod.toObject(), id: prod._id.toString() };
        },
        updateProduct: async (_, { id, name, price, cost }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const update = {};
            if (name !== undefined)
                update.name = name;
            if (price !== undefined)
                update.price = price;
            if (cost !== undefined)
                update.cost = cost;
            const prod = await product_model_1.Product.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, update, { new: true });
            if (!prod)
                throw new graphql_1.GraphQLError('NOT_FOUND');
            subscriptions_1.pubsub.publish(`${subscriptions_1.MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
            return { ...prod.toObject(), id: prod._id.toString() };
        },
        deleteProduct: async (_, { id }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const res = await product_model_1.Product.deleteOne({ _id: id, cafeId: c.cafeId });
            subscriptions_1.pubsub.publish(`${subscriptions_1.MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
            return res.deletedCount === 1;
        },
        toggleProductAvailability: async (_, { id, isAvailable }, ctx) => {
            const c = (0, auth_1.requireAuth)(ctx);
            const prod = await product_model_1.Product.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, { isAvailable }, { new: true });
            if (!prod)
                throw new graphql_1.GraphQLError('NOT_FOUND');
            const obj = { ...prod.toObject(), id: prod._id.toString() };
            subscriptions_1.pubsub.publish(`${subscriptions_1.MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
            return obj;
        },
    }
};
