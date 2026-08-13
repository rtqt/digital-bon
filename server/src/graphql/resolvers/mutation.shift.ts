import { RequestContext, requireAuth } from '../../middleware/auth';
import { User } from '../../models/user.model';
import { Cafe } from '../../models/cafe.model';
import { Order, UNRESOLVED_STATUSES } from '../../models/order.model';
import { Shift, ShiftReconciliation } from '../../models/shift.model';
import { GraphQLError } from 'graphql';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { publishAdminAlert } from './subscriptions';
import { SystemLog } from '../../models/systemLog.model';

export const shiftMutations = {
  Mutation: {
    openShift: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const existing = await Shift.findOne({ cafeId: c.cafeId, waitressId: c.userId, status: 'OPEN' });
      if (existing) return { ...existing.toObject(), id: existing._id.toString(), openedAt: existing.openedAt?.toISOString() };

      const shift = await Shift.create({ cafeId: c.cafeId, waitressId: c.userId });
      return { ...shift.toObject(), id: shift._id.toString(), openedAt: shift.openedAt?.toISOString() };
    },

    initiateReconciliation: async (_: any, { waitressId }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);

      const unresolved = await Order.countDocuments({
        cafeId: c.cafeId,
        waitressId,
        status: { $in: UNRESOLVED_STATUSES },
      });
      if (unresolved > 0) throw new GraphQLError(`UNRESOLVED_ORDERS: ${unresolved} orders must be resolved first`);

      const settledOrders = await Order.find({
        cafeId: c.cafeId,
        waitressId,
        status: 'SETTLED',
        paymentMethod: 'CASH',
      });

      const expectedCash = settledOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);

      await User.findByIdAndUpdate(waitressId, {
        $inc: { sessionVersion: 1 },
        status: 'LOCKED_FOR_RECONCILIATION',
        currentLiability: expectedCash,
      });

      const shift = await Shift.findOneAndUpdate(
        { cafeId: c.cafeId, waitressId, status: 'OPEN' },
        { status: 'RECONCILING', cashierId: c.userId },
        { new: true }
      );
      if (!shift) throw new GraphQLError('NO_OPEN_SHIFT_FOR_WAITRESS');

      return {
        ...shift.toObject(),
        id: shift._id.toString(),
        openedAt: shift.openedAt?.toISOString(),
        systemExpectedCash: null, // SECURITY FIX: Do not leak expected cash to client
      };
    },

    submitDualDeclaration: async (_: any, { shiftId, waitressDeclared, waitressPin, cashierDeclared, cashierPin }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      if (!c.permissions.includes('PROCESS_PAYMENTS')) throw new GraphQLError('UNAUTHORIZED'); // SECURITY FIX: Ensure only cashiers can process payments

      const shift = await Shift.findOne({ _id: shiftId, cafeId: c.cafeId, status: 'RECONCILING' });
      if (!shift) throw new GraphQLError('SHIFT_NOT_IN_RECONCILING_STATE');

      const waitress = await User.findOne({ _id: shift.waitressId, cafeId: c.cafeId });
      const cashier = await User.findById(c.userId);
      if (!waitress || !cashier) throw new GraphQLError('USERS_NOT_FOUND');

      const waitressPinValid = await bcrypt.compare(waitressPin, waitress.pinHash);
      if (!waitressPinValid) throw new GraphQLError('INVALID_WAITRESS_PIN');
      const cashierPinValid = await bcrypt.compare(cashierPin, cashier.pinHash);
      if (!cashierPinValid) throw new GraphQLError('INVALID_CASHIER_PIN');

      const expectedCash = waitress.currentLiability;
      const variance = cashierDeclared - expectedCash;
      const declarationGap = Math.abs(cashierDeclared - waitressDeclared);
      
      let result: 'BALANCED' | 'SURPLUS' | 'SHORTAGE' = 'BALANCED';
      if (variance > 0) result = 'SURPLUS';
      else if (variance < 0) result = 'SHORTAGE';

      const cafe = await Cafe.findById(c.cafeId);
      const gapThreshold = cafe?.declarationGapAlertThreshold ?? 50;
      const shortageThreshold = cafe?.shortageAlertThreshold ?? 0;

      if (declarationGap > gapThreshold) {
        publishAdminAlert(c.cafeId, 'DECLARATION_GAP_ALERT',
          `Large gap between Waitress (${waitressDeclared}) and Cashier (${cashierDeclared}) declarations`,
          { userId: shift.waitressId.toString() }
        );
      }
      
      if (result === 'SHORTAGE' && Math.abs(variance) > shortageThreshold) {
        publishAdminAlert(c.cafeId, 'SHORTAGE_ALERT',
          `Shift closed with a shortage of ${Math.abs(variance)} ETB.`,
          { userId: shift.waitressId.toString() }
        );
      }

      await ShiftReconciliation.create({
        cafeId: c.cafeId,
        shiftId: shift._id,
        waitressId: waitress._id,
        cashierId: cashier._id,
        expectedCash,
        waitstaffDeclared: waitressDeclared,
        cashierCounted: cashierDeclared,
        variance,
        declarationGap,
        result,
        auditLog: [{ action: 'DUAL_DECLARATION_SUBMITTED', actorId: cashier._id, timestamp: new Date() }]
      });

      if (result !== 'SHORTAGE') {
        shift.status = 'CLOSED_BALANCED';
        shift.closedAt = new Date();
        await shift.save();

        await User.findByIdAndUpdate(shift.waitressId, {
          currentLiability: 0,
          status: 'ACTIVE',
          $inc: { sessionVersion: 1 },
        });
      } else {
        shift.status = 'CLOSED_SHORTAGE';
        await shift.save();
      }

      await SystemLog.create({
        action: 'SHIFT_CLOSED',
        description: `Shift closed for waitress ${waitress.name}. Result: ${result}. Variance: ${variance} ETB`,
        userId: c.userId,
        cafeId: c.cafeId,
      });

      return {
        ...shift.toObject(),
        id: shift._id.toString(),
        openedAt: shift.openedAt?.toISOString(),
        closedAt: shift.closedAt?.toISOString(),
        systemExpectedCash: expectedCash,
        variance,
        declarationGap,
        result,
      };
    },

    countersignShortage: async (_: any, { shiftId, adminPin }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const shift = await Shift.findOne({ _id: shiftId, cafeId: c.cafeId, status: 'CLOSED_SHORTAGE' });
      if (!shift) throw new GraphQLError('SHIFT_NOT_IN_SHORTAGE_STATE');

      const admin = await User.findById(c.userId);
      if (!admin) throw new GraphQLError('USER_NOT_FOUND');
      
      // SECURITY FIX: Prevent admin from countersigning their own shift if they were the cashier or waitress
      if (admin._id.toString() === shift.waitressId.toString() || admin._id.toString() === shift.cashierId?.toString()) {
        throw new GraphQLError('CANNOT_COUNTERSIGN_OWN_SHIFT');
      }

      const pinValid = await bcrypt.compare(adminPin, admin.pinHash);
      if (!pinValid) throw new GraphQLError('INVALID_ADMIN_PIN');

      const waitress = await User.findById(shift.waitressId);
      const expectedCash = waitress?.currentLiability ?? 0;

      // Update reconciliation audit
      await ShiftReconciliation.findOneAndUpdate(
        { shiftId: shift._id },
        { 
          authorizedBy: admin._id,
          $push: { auditLog: { action: 'SHORTAGE_COUNTERSIGNED', actorId: admin._id, timestamp: new Date() } }
        }
      );

      shift.status = 'CLOSED_BALANCED';
      shift.closedAt = new Date();
      await shift.save();

      await User.findByIdAndUpdate(shift.waitressId, {
        currentLiability: 0,
        status: 'ACTIVE',
        $inc: { sessionVersion: 1 },
      });

      return {
        ...shift.toObject(),
        id: shift._id.toString(),
        openedAt: shift.openedAt?.toISOString(),
        closedAt: shift.closedAt?.toISOString(),
        systemExpectedCash: expectedCash,
      };
    },
  },
};
