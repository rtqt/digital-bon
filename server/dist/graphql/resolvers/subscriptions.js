"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionResolvers = exports.ADMIN_ALERT = exports.MENU_UPDATED = exports.ORDER_UPDATED = exports.ORDER_CREATED = exports.pubsub = void 0;
exports.publishAdminAlert = publishAdminAlert;
const graphql_subscriptions_1 = require("graphql-subscriptions");
const auth_1 = require("../../middleware/auth");
exports.pubsub = new graphql_subscriptions_1.PubSub();
exports.ORDER_CREATED = 'ORDER_CREATED';
exports.ORDER_UPDATED = 'ORDER_UPDATED';
exports.MENU_UPDATED = 'MENU_UPDATED';
exports.ADMIN_ALERT = 'ADMIN_ALERT';
function publishAdminAlert(cafeId, type, message, extra) {
    exports.pubsub.publish(`${exports.ADMIN_ALERT}_${cafeId}`, {
        adminAlert: { type, message, timestamp: new Date().toISOString(), ...extra },
    });
}
exports.subscriptionResolvers = {
    Subscription: {
        orderCreated: {
            subscribe: (_, __, ctx) => {
                const c = (0, auth_1.requireAuth)(ctx);
                return exports.pubsub.asyncIterator(`${exports.ORDER_CREATED}_${c.cafeId}`);
            },
        },
        orderUpdated: {
            subscribe: (_, __, ctx) => {
                const c = (0, auth_1.requireAuth)(ctx);
                return exports.pubsub.asyncIterator(`${exports.ORDER_UPDATED}_${c.cafeId}`);
            },
        },
        menuUpdated: {
            subscribe: (_, __, ctx) => {
                const c = (0, auth_1.requireAuth)(ctx);
                return exports.pubsub.asyncIterator(`${exports.MENU_UPDATED}_${c.cafeId}`);
            },
        },
        adminAlert: {
            subscribe: (_, __, ctx) => {
                const c = (0, auth_1.requireAuth)(ctx);
                return exports.pubsub.asyncIterator(`${exports.ADMIN_ALERT}_${c.cafeId}`);
            },
        },
    },
};
