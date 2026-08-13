"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const query_1 = require("./query");
const mutation_admin_1 = require("./mutation.admin");
const mutation_auth_1 = require("./mutation.auth");
const mutation_menu_1 = require("./mutation.menu");
const mutation_order_1 = require("./mutation.order");
const mutation_shift_1 = require("./mutation.shift");
const mutation_user_1 = require("./mutation.user");
const subscriptions_1 = require("./subscriptions");
const fieldResolvers_1 = require("./fieldResolvers");
exports.resolvers = {
    Query: {
        ...query_1.queryResolvers.Query,
    },
    Mutation: {
        ...mutation_admin_1.adminMutations.Mutation,
        ...mutation_auth_1.authMutations.Mutation,
        ...mutation_menu_1.menuMutations.Mutation,
        ...mutation_order_1.orderMutations.Mutation,
        ...mutation_shift_1.shiftMutations.Mutation,
        ...mutation_user_1.userMutations.Mutation,
    },
    Subscription: {
        ...subscriptions_1.subscriptionResolvers.Subscription,
    },
    ...fieldResolvers_1.fieldResolvers,
};
