import { RequestContext, requireAuth } from '../../middleware/auth';
import { User } from '../../models/user.model';
import { Role } from '../../models/role.model';
import { Cafe } from '../../models/cafe.model';
import { Order } from '../../models/order.model';
import { Product, Category } from '../../models/product.model';
import { Shift } from '../../models/shift.model';
import { SystemLog } from '../../models/systemLog.model';

function requirePermission(ctx: RequestContext, perm: string) {
  if (!ctx.permissions.includes(perm)) {
    throw new Error('UNAUTHORIZED');
  }
}

export const queryResolvers = {
  Query: {
    me: (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      return User.findById(c.userId).lean().then((u) => u ? { ...u, id: u._id.toString() } : null);
    },
    orders: async (_: any, { status }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const filter: any = { cafeId: c.cafeId };
      if (status) filter.status = status;
      const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
      return orders.map((o) => ({ ...o, id: o._id.toString() }));
    },
    order: async (_: any, { id }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const o = await Order.findOne({ _id: id, cafeId: c.cafeId }).lean();
      return o ? { ...o, id: o._id.toString() } : null;
    },
    activeShifts: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const shifts = await Shift.find({ cafeId: c.cafeId, status: { $in: ['OPEN', 'RECONCILING'] } }).lean();
      return shifts.map((s) => ({ ...s, id: s._id.toString(), openedAt: s.openedAt?.toISOString() }));
    },
    shortageShifts: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const shifts = await Shift.find({ cafeId: c.cafeId, status: 'CLOSED_SHORTAGE' }).populate('waitressId').lean();
      return shifts.map((s: any) => ({ 
        ...s, 
        id: s._id.toString(), 
        openedAt: s.openedAt?.toISOString(),
        waitress: s.waitressId ? { ...s.waitressId, id: s.waitressId._id.toString() } : null
      }));
    },
    categories: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const cats = await Category.find({ cafeId: c.cafeId }).sort({ order: 1 }).lean();
      return cats.map((c) => ({ ...c, id: c._id.toString() }));
    },
    products: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const prods = await Product.find({ cafeId: c.cafeId }).lean();
      return prods.map((p) => ({ ...p, id: p._id.toString() }));
    },
    users: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const users = await User.find({ cafeId: c.cafeId }).lean();
      return users.map((u) => ({ ...u, id: u._id.toString() }));
    },
    roles: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const roles = await Role.find({ cafeId: c.cafeId }).lean();
      return roles.map((r) => ({ ...r, id: r._id.toString() }));
    },
    cafe: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const cafe = await Cafe.findById(c.cafeId).lean();
      return cafe ? { ...cafe, id: cafe._id.toString() } : null;
    },
    cafes: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      requirePermission(c, 'SYSTEM_ADMIN');
      const cafes = await Cafe.find().lean();
      return cafes.map((cafe) => ({ ...cafe, id: cafe._id.toString() }));
    },
    systemLogs: async (_: any, { limit }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      requirePermission(c, 'SYSTEM_ADMIN');
      const logs = await SystemLog.find()
        .sort({ createdAt: -1 })
        .limit(limit || 100)
        .populate('userId', 'name')
        .populate('cafeId', 'name code')
        .lean();
      return logs.map((l: any) => ({
        ...l,
        id: l._id.toString(),
        createdAt: l.createdAt?.toISOString(),
        user: l.userId ? { ...l.userId, id: l.userId._id.toString() } : null,
        cafe: l.cafeId ? { ...l.cafeId, id: l.cafeId._id.toString() } : null,
      }));
    },
    tableOccupancy: async (_: any, __: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const cafe = await Cafe.findById(c.cafeId).lean();
      const tables: string[] = (cafe as any)?.tables || [];
      if (tables.length === 0) return [];
      
      const activeOrders = await Order.find({
        cafeId: c.cafeId,
        status: { $in: ['PENDING', 'ACKNOWLEDGED', 'PRINT_FAILED', 'PRINTED', 'VOID_REQUESTED'] },
      }).populate('waitressId').lean();
      
      const occupied = new Map<string, { orderId: string; waitressName: string }>();
      for (const order of activeOrders) {
        const waitress = order.waitressId as any;
        occupied.set(order.tableNumber, {
          orderId: order._id.toString(),
          waitressName: waitress?.name || 'Unknown',
        });
      }
      
      return tables.map(tableNumber => {
        const occ = occupied.get(tableNumber);
        return {
          tableNumber,
          isOccupied: !!occ,
          orderId: occ?.orderId || null,
          waitressName: occ?.waitressName || null,
        };
      });
    },
  },
};
