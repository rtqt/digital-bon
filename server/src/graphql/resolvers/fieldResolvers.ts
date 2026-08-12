import { User } from '../../models/user.model';
import { Category } from '../../models/product.model';
import { Role } from '../../models/role.model';

export const fieldResolvers = {
  Order: {
    waitress: (order: any) => User.findById(order.waitressId).lean().then((u) => u ? { ...u, id: u._id.toString() } : null),
    auditLog: (order: any) => (order.auditLog || []).map((a: any) => ({
      ...a,
      timestamp: a.timestamp?.toISOString ? a.timestamp.toISOString() : a.timestamp,
      metadata: a.metadata ? JSON.stringify(a.metadata) : null,
    })),
  },
  Product: {
    category: (product: any) => Category.findById(product.categoryId).lean().then((c) => c ? { ...c, id: c._id.toString() } : null),
  },
  User: {
    role: (user: any) => Role.findById(user.roleId).lean().then((r) => r ? { ...r, id: r._id.toString() } : null),
  },
  Shift: {
    waitress: (shift: any) => User.findById(shift.waitressId).lean().then((u) => u ? { ...u, id: u._id.toString() } : null),
  },
};
