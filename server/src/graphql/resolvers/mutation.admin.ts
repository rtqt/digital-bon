import { RequestContext, requireAuth } from '../../middleware/auth';
import { Cafe } from '../../models/cafe.model';
import { Role } from '../../models/role.model';
import { User } from '../../models/user.model';
import { GraphQLError } from 'graphql';
import bcrypt from 'bcrypt';
import { SystemLog } from '../../models/systemLog.model';

function requirePermission(ctx: RequestContext, perm: string) {
  if (!ctx.permissions.includes(perm)) {
    throw new Error('UNAUTHORIZED');
  }
}

export const adminMutations = {
  Mutation: {
    createCafe: async (_: any, { name, code, adminPin }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      requirePermission(c, 'SYSTEM_ADMIN');
      const cafe = await Cafe.create({ name, code });
      
      const adminRole = await Role.create({
        cafeId: cafe._id,
        name: 'Cafe Admin',
        permissions: ['CREATE_ORDER', 'SETTLE_ORDER', 'REQUEST_VOID', 'APPROVE_VOID', 'REJECT_VOID', 'DIRECT_VOID', 'RESOLVE_CASH', 'INITIATE_RECONCILIATION', 'AMEND_ORDER', 'UNLOCK_VOID', 'MANAGE_MENU', 'MANAGE_STAFF', 'VIEW_ANALYTICS', 'CAFE_ADMIN'],
        scope: 'CAFE',
      });

      const pinHash = await bcrypt.hash(adminPin, 10);
      await User.create({
        cafeId: cafe._id,
        roleId: adminRole._id,
        name: 'Admin',
        pinHash,
      });

      await SystemLog.create({
        action: 'CREATE_CAFE',
        description: `New cafe deployed: ${name} (${code})`,
        userId: c.userId,
        cafeId: cafe._id,
      });

      return { ...cafe.toObject(), id: cafe._id.toString() };
    },
    updateCafe: async (_: any, args: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      requirePermission(c, 'SYSTEM_ADMIN');
      const { id, ...updates } = args;
      const cafe = await Cafe.findByIdAndUpdate(id, updates, { new: true });
      if (!cafe) throw new GraphQLError('CAFE_NOT_FOUND');
      
      await SystemLog.create({
        action: 'UPDATE_CAFE',
        description: `Cafe updated: ${cafe.name} (${cafe.code})`,
        userId: c.userId,
        cafeId: cafe._id,
      });

      return { ...cafe.toObject(), id: cafe._id.toString() };
    },
    updateCafeTables: async (_: any, { tables }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const normalised = [...new Set((tables as string[]).map((t: string) => t.trim()).filter(Boolean))];
      const cafe = await Cafe.findByIdAndUpdate(c.cafeId, { tables: normalised }, { new: true });
      if (!cafe) throw new GraphQLError('CAFE_NOT_FOUND');
      return { ...cafe.toObject(), id: cafe._id.toString() };
    },
  }
};
