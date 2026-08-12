import { RequestContext, requireAuth } from '../../middleware/auth';
import { Category, Product } from '../../models/product.model';
import { GraphQLError } from 'graphql';
import { pubsub, MENU_UPDATED } from './subscriptions';

export const menuMutations = {
  Mutation: {
    createCategory: async (_: any, { name, order }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      if (!c.cafeId) throw new GraphQLError('CAFE_ID_REQUIRED');
      const cat = await Category.create({ cafeId: c.cafeId, name, order: order ?? 0 });
      pubsub.publish(`${MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
      return { ...cat.toObject(), id: cat._id.toString() };
    },
    updateCategory: async (_: any, { id, name, order }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const update: any = {};
      if (name !== undefined) update.name = name;
      if (order !== undefined) update.order = order;
      const cat = await Category.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, update, { new: true });
      if (!cat) throw new GraphQLError('NOT_FOUND');
      pubsub.publish(`${MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
      return { ...cat.toObject(), id: cat._id.toString() };
    },
    deleteCategory: async (_: any, { id }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const res = await Category.deleteOne({ _id: id, cafeId: c.cafeId });
      pubsub.publish(`${MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
      return res.deletedCount === 1;
    },
    createProduct: async (_: any, { categoryId, name, price, cost, isAvailable }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const prod = await Product.create({ cafeId: c.cafeId, categoryId, name, price, cost, isAvailable: isAvailable !== false });
      pubsub.publish(`${MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
      return { ...prod.toObject(), id: prod._id.toString() };
    },
    updateProduct: async (_: any, { id, name, price, cost }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const update: any = {};
      if (name !== undefined) update.name = name;
      if (price !== undefined) update.price = price;
      if (cost !== undefined) update.cost = cost;
      const prod = await Product.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, update, { new: true });
      if (!prod) throw new GraphQLError('NOT_FOUND');
      pubsub.publish(`${MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
      return { ...prod.toObject(), id: prod._id.toString() };
    },
    deleteProduct: async (_: any, { id }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const res = await Product.deleteOne({ _id: id, cafeId: c.cafeId });
      pubsub.publish(`${MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
      return res.deletedCount === 1;
    },
    toggleProductAvailability: async (_: any, { id, isAvailable }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const prod = await Product.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, { isAvailable }, { new: true });
      if (!prod) throw new GraphQLError('NOT_FOUND');
      const obj = { ...prod.toObject(), id: prod._id.toString() };
      pubsub.publish(`${MENU_UPDATED}_${c.cafeId}`, { menuUpdated: new Date().toISOString() });
      return obj;
    },
  }
};
