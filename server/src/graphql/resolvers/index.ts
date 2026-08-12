import { queryResolvers } from './query';
import { adminMutations } from './mutation.admin';
import { authMutations } from './mutation.auth';
import { menuMutations } from './mutation.menu';
import { orderMutations } from './mutation.order';
import { shiftMutations } from './mutation.shift';
import { userMutations } from './mutation.user';
import { subscriptionResolvers } from './subscriptions';
import { fieldResolvers } from './fieldResolvers';

export const resolvers = {
  Query: {
    ...queryResolvers.Query,
  },
  Mutation: {
    ...adminMutations.Mutation,
    ...authMutations.Mutation,
    ...menuMutations.Mutation,
    ...orderMutations.Mutation,
    ...shiftMutations.Mutation,
    ...userMutations.Mutation,
  },
  Subscription: {
    ...subscriptionResolvers.Subscription,
  },
  ...fieldResolvers,
};
