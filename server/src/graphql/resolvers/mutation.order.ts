import { RequestContext, requireAuth } from '../../middleware/auth';
import { User } from '../../models/user.model';
import { Order } from '../../models/order.model';
import { Product } from '../../models/product.model';
import { Shift } from '../../models/shift.model';
import { GraphQLError } from 'graphql';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { trackVoidAttempt, clearVoidAttempts, trackLockedVoid } from '../../services/redis.service';
import { pubsub, publishAdminAlert, ORDER_CREATED, ORDER_UPDATED } from './subscriptions';
import { SystemLog } from '../../models/systemLog.model';

export const orderMutations = {
  Mutation: {
    createOrder: async (_: any, { input }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);

      const shift = await Shift.findOne({ cafeId: c.cafeId, waitressId: c.userId, status: 'OPEN' });
      if (!shift) throw new GraphQLError('NO_OPEN_SHIFT', { extensions: { code: 'BAD_USER_INPUT' } });

      const productIds = input.items.map((i: any) => new mongoose.Types.ObjectId(i.productId));
      const products = await Product.find({
        _id: { $in: productIds },
        cafeId: c.cafeId,
        isAvailable: true,
      }).lean();

      if (products.length !== productIds.length) {
        throw new GraphQLError('ITEM_UNAVAILABLE_OR_NOT_FOUND', { extensions: { code: 'BAD_USER_INPUT' } });
      }

      const productMap = new Map(products.map((p) => [p._id.toString(), p]));
      const items = input.items.map((item: any) => {
        const product = productMap.get(item.productId)!;
        return {
          productId: product._id,
          productName: product.name,
          unitPrice: product.price,
          quantity: Math.floor(item.quantity),
        };
      });

      const totalAmount = items.reduce((sum: number, i: any) => sum + i.unitPrice * i.quantity, 0);

      const order = new Order({
        cafeId: c.cafeId,
        waitressId: c.userId,
        tableNumber: input.tableNumber,
        items,
        totalAmount,
        status: 'PENDING',
      });
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();

      const orderObj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_CREATED}_${c.cafeId}`, { orderCreated: orderObj });
      return orderObj;
    },

    settleOrder: async (_: any, { orderId, paymentMethod }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const shift = await Shift.findOne({ cafeId: c.cafeId, status: 'OPEN' });
      if (!shift) throw new GraphQLError('SHIFT_CLOSED');

      const order = await Order.findOne({
        _id: orderId,
        cafeId: c.cafeId,
        status: { $in: ['PENDING', 'PRINTED'] },
      });
      if (!order) throw new GraphQLError('ORDER_NOT_FOUND_OR_WRONG_STATE');

      order.status = 'SETTLED';
      order.paymentMethod = paymentMethod;
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();

      if (paymentMethod === 'CASH') {
        await User.findOneAndUpdate(
          { _id: order.waitressId, cafeId: c.cafeId },
          { $inc: { currentLiability: order.totalAmount } }
        );
      }

      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      return obj;
    },

    settleWaitressOrders: async (_: any, { waitressName }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const shift = await Shift.findOne({ cafeId: c.cafeId, status: 'OPEN' });
      if (!shift) throw new GraphQLError('SHIFT_CLOSED');

      const waitress = await User.findOne({ cafeId: c.cafeId, name: waitressName });
      if (!waitress) throw new GraphQLError('WAITRESS_NOT_FOUND');

      const orders = await Order.find({
        waitressId: waitress._id,
        cafeId: c.cafeId,
        status: { $in: ['PENDING', 'PRINTED'] },
      });

      const settledOrders = [];
      for (const order of orders) {
        const pm = order.paymentMethod || 'CASH';
        order.status = 'SETTLED';
        order.paymentMethod = pm;
        order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
        await order.save();

        if (pm === 'CASH') {
          await User.findOneAndUpdate(
            { _id: order.waitressId, cafeId: c.cafeId },
            { $inc: { currentLiability: order.totalAmount } }
          );
        }

        const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
        pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
        settledOrders.push(obj);
      }

      return settledOrders;
    },

    setOrderPaymentMethod: async (_: any, { orderId, paymentMethod }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({
        _id: orderId,
        cafeId: c.cafeId,
        status: { $in: ['PENDING', 'PRINTED', 'PRINT_FAILED'] },
      });
      if (!order) throw new GraphQLError('ORDER_NOT_FOUND_OR_WRONG_STATE');

      order.paymentMethod = paymentMethod;
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();

      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      return obj;
    },

    acknowledgeOrder: async (_: any, { orderId }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: { $in: ['PENDING', 'PRINT_FAILED'] } });
      if (!order) throw new GraphQLError('ORDER_NOT_FOUND_OR_WRONG_STATE');
      order.status = 'PRINTED';
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();
      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      return obj;
    },

    requestOrderVoid: async (_: any, { orderId, reason }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({
        _id: orderId,
        cafeId: c.cafeId,
        waitressId: c.userId,
        status: { $in: ['PENDING', 'PRINTED', 'PRINT_FAILED'] },
      });
      if (!order) throw new GraphQLError('ORDER_NOT_FOUND_OR_NOT_OWNED');
      order.previousStatus = order.status;
      order.status = 'VOID_REQUESTED';
      order.reason = reason;
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();
      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      publishAdminAlert(c.cafeId, 'VOID_REQUESTED', `Void requested for Table ${order.tableNumber}`, { orderId });
      await SystemLog.create({
        action: 'VOID_REQUESTED',
        description: `Void requested for Table ${order.tableNumber}. Reason: ${reason}`,
        userId: c.userId,
        cafeId: c.cafeId,
      });
      return obj;
    },

    approveOrderVoid: async (_: any, { orderId, pin }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);

      const attempts = await trackVoidAttempt(orderId);
      if (attempts > 5) {
        const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'VOID_REQUESTED' });
        if (order) {
          order.status = 'LOCKED_VOID';
          order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
          await order.save();

          const openShift = await Shift.findOne({ cafeId: c.cafeId, status: 'OPEN' });
          if (openShift) {
            const misconductCount = await trackLockedVoid(c.userId, openShift._id.toString());
            if (misconductCount >= 2) {
              publishAdminAlert(c.cafeId, 'CASHIER_MISCONDUCT', `Cashier has caused ${misconductCount} locked voids this shift`, { userId: c.userId });
            }
          }

          pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() } });
          publishAdminAlert(c.cafeId, 'VOID_LOCKED', `Void locked after 5 failed PIN attempts for Table ${order.tableNumber}`, { orderId });
        }
        throw new GraphQLError('VOID_LOCKED_TOO_MANY_ATTEMPTS');
      }

      const cashier = await User.findById(c.userId);
      if (!cashier) throw new GraphQLError('USER_NOT_FOUND');
      const pinValid = await bcrypt.compare(pin, cashier.pinHash);
      if (!pinValid) throw new GraphQLError('INVALID_PIN');

      await clearVoidAttempts(orderId);

      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'VOID_REQUESTED' });
      if (!order) throw new GraphQLError('ORDER_NOT_IN_VOID_REQUESTED');
      order.status = 'VOIDED';
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();
      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      await SystemLog.create({
        action: 'VOID_APPROVED',
        description: `Void approved for Table ${order.tableNumber}`,
        userId: c.userId,
        cafeId: c.cafeId,
      });
      return obj;
    },

    rejectOrderVoid: async (_: any, { orderId }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'VOID_REQUESTED' });
      if (!order) throw new GraphQLError('ORDER_NOT_IN_VOID_REQUESTED');
      order.status = (order.previousStatus as any) || 'PENDING';
      order.previousStatus = undefined;
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();
      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      return obj;
    },

    directVoid: async (_: any, { orderId, reason, wasPaymentCollected }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'PRINTED' });
      if (!order) throw new GraphQLError('ORDER_NOT_FOUND_OR_NOT_PRINTED');

      if (wasPaymentCollected) {
        order.status = 'PENDING_CASH_RESOLUTION';
        publishAdminAlert(c.cafeId, 'PENDING_CASH_RESOLUTION', `Cash resolution required for Table ${order.tableNumber}`, { orderId });
      } else {
        order.status = 'VOIDED';
      }
      order.reason = reason;
      order.wasPaymentCollected = wasPaymentCollected;
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();
      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      return obj;
    },

    adminUnlockVoid: async (_: any, { orderId, action }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'LOCKED_VOID' });
      if (!order) throw new GraphQLError('ORDER_NOT_LOCKED');

      if (action === 'APPROVE') {
        order.status = 'VOIDED';
      } else if (action === 'REJECT') {
        order.status = (order.previousStatus as any) || 'PENDING';
        order.previousStatus = undefined;
      } else if (action === 'REOPEN') {
        await clearVoidAttempts(orderId);
        order.status = 'VOID_REQUESTED';
      } else {
        throw new GraphQLError('INVALID_ACTION');
      }

      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();
      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      return obj;
    },

    resolveCash: async (_: any, { orderId, resolution }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'PENDING_CASH_RESOLUTION' });
      if (!order) throw new GraphQLError('ORDER_NOT_IN_PENDING_CASH_RESOLUTION');

      if (resolution === 'added_to_liability') {
        await User.findOneAndUpdate(
          { _id: order.waitressId, cafeId: c.cafeId },
          { $inc: { currentLiability: order.totalAmount } }
        );
      }
      order.status = 'VOIDED';
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();

      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      return obj;
    },

    amendOrder: async (_: any, { orderId, newTableNumber, newItems, adminPin }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'PENDING' });
      if (!order) throw new GraphQLError('ONLY_PENDING_ORDERS_CAN_BE_AMENDED');

      const isFinancialChange = !!newItems;

      if (isFinancialChange) {
        if (!adminPin) throw new GraphQLError('ADMIN_PIN_REQUIRED');
        const allUsers = await User.find({ cafeId: c.cafeId });
        let authAdmin: any = null;
        for (const u of allUsers) {
          if (await bcrypt.compare(adminPin, u.pinHash)) { authAdmin = u; break; }
        }
        if (!authAdmin) throw new GraphQLError('INVALID_ADMIN_PIN');
        if (authAdmin._id.toString() === c.userId) throw new GraphQLError('DUAL_AUTH_REQUIRED: authorizedBy must differ from actorId');

        const products = await Product.find({ _id: { $in: newItems.map((i: any) => i.productId) }, cafeId: c.cafeId, isAvailable: true });
        if (products.length !== newItems.length) throw new GraphQLError('ITEM_UNAVAILABLE');

        const productMap = new Map(products.map((p) => [p._id.toString(), p]));
        let newTotal = 0;
        const validatedItems = newItems.map((item: any) => {
          const product = productMap.get(item.productId)!;
          newTotal += product.price * item.quantity;
          return { productId: product._id, productName: product.name, unitPrice: product.price, quantity: item.quantity };
        });

        order.items = validatedItems as any;
        order.totalAmount = newTotal;
        order.$locals.authorizedBy = authAdmin._id;
      }

      if (newTableNumber) order.tableNumber = newTableNumber;
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();

      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      await SystemLog.create({
        action: 'AMEND_ORDER',
        description: `Order for Table ${order.tableNumber} was amended directly. Financial change: ${isFinancialChange}`,
        userId: c.userId,
        cafeId: c.cafeId,
      });
      return obj;
    },

    requestAmendOrder: async (_: any, { orderId, newTableNumber, newItems, reason }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: { $in: ['PENDING', 'PRINTED'] } });
      if (!order) throw new GraphQLError('ONLY_PENDING_OR_PRINTED_ORDERS_CAN_BE_AMENDED');

      let validatedItems;
      if (newItems) {
        const products = await Product.find({ _id: { $in: newItems.map((i: any) => i.productId) }, cafeId: c.cafeId });
        if (products.length !== newItems.length) throw new GraphQLError('ITEM_UNAVAILABLE');
        const productMap = new Map(products.map((p) => [p._id.toString(), p]));
        validatedItems = newItems.map((item: any) => {
          const product = productMap.get(item.productId)!;
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
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();

      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      await SystemLog.create({
        action: 'AMEND_REQUESTED',
        description: `Amendment requested for Table ${order.tableNumber}. Reason: ${reason}`,
        userId: c.userId,
        cafeId: c.cafeId,
      });
      return obj;
    },

    approveAmendment: async (_: any, { orderId }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'AMEND_REQUESTED' });
      if (!order) throw new GraphQLError('ORDER_NOT_IN_AMEND_REQUESTED');
      if (!order.requestedAmendment) throw new GraphQLError('NO_REQUESTED_AMENDMENT');

      if (order.requestedAmendment.items) {
        order.items = order.requestedAmendment.items;
        order.totalAmount = order.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
      }
      if (order.requestedAmendment.tableNumber) {
        order.tableNumber = order.requestedAmendment.tableNumber;
      }

      order.status = (order.previousStatus as any) || 'PENDING';
      order.previousStatus = undefined;
      order.requestedAmendment = undefined;
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();

      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      await SystemLog.create({
        action: 'AMEND_APPROVED',
        description: `Amendment approved for Table ${order.tableNumber}`,
        userId: c.userId,
        cafeId: c.cafeId,
      });
      return obj;
    },

    rejectAmendment: async (_: any, { orderId }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const order = await Order.findOne({ _id: orderId, cafeId: c.cafeId, status: 'AMEND_REQUESTED' });
      if (!order) throw new GraphQLError('ORDER_NOT_IN_AMEND_REQUESTED');

      order.status = (order.previousStatus as any) || 'PENDING';
      order.previousStatus = undefined;
      order.requestedAmendment = undefined;
      order.$locals.actorId = new mongoose.Types.ObjectId(c.userId);
      await order.save();

      const obj = { ...order.toObject(), id: order._id.toString(), createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };
      pubsub.publish(`${ORDER_UPDATED}_${c.cafeId}`, { orderUpdated: obj });
      return obj;
    },
  },
};
