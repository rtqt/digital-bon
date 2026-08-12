import { PubSub } from 'graphql-subscriptions';
import { RequestContext, requireAuth } from '../../middleware/auth';

export const pubsub = new PubSub();

export const ORDER_CREATED = 'ORDER_CREATED';
export const ORDER_UPDATED = 'ORDER_UPDATED';
export const MENU_UPDATED = 'MENU_UPDATED';
export const ADMIN_ALERT = 'ADMIN_ALERT';

export function publishAdminAlert(cafeId: string, type: string, message: string, extra?: object) {
  pubsub.publish(`${ADMIN_ALERT}_${cafeId}`, {
    adminAlert: { type, message, timestamp: new Date().toISOString(), ...extra },
  });
}

export const subscriptionResolvers = {
  Subscription: {
    orderCreated: {
      subscribe: (_: any, __: any, ctx: RequestContext | null) => {
        const c = requireAuth(ctx);
        return pubsub.asyncIterator(`${ORDER_CREATED}_${c.cafeId}`);
      },
    },
    orderUpdated: {
      subscribe: (_: any, __: any, ctx: RequestContext | null) => {
        const c = requireAuth(ctx);
        return pubsub.asyncIterator(`${ORDER_UPDATED}_${c.cafeId}`);
      },
    },
    menuUpdated: {
      subscribe: (_: any, __: any, ctx: RequestContext | null) => {
        const c = requireAuth(ctx);
        return pubsub.asyncIterator(`${MENU_UPDATED}_${c.cafeId}`);
      },
    },
    adminAlert: {
      subscribe: (_: any, __: any, ctx: RequestContext | null) => {
        const c = requireAuth(ctx);
        return pubsub.asyncIterator(`${ADMIN_ALERT}_${c.cafeId}`);
      },
    },
  },
};
