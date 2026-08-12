import { RequestContext, requireAuth } from '../../middleware/auth';
import { User } from '../../models/user.model';
import { Role } from '../../models/role.model';
import { GraphQLError } from 'graphql';
import bcrypt from 'bcrypt';

export const userMutations = {
  Mutation: {
    createUser: async (_: any, { name, roleId, pin }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const pinHash = await bcrypt.hash(pin, 10);
      const user = await User.create({ cafeId: c.cafeId, roleId, name, pinHash });
      return { ...user.toObject(), id: user._id.toString() };
    },
    updateUser: async (_: any, { id, name, pin, status }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (status !== undefined) updates.status = status;
      if (pin) updates.pinHash = await bcrypt.hash(pin, 10);
      
      const user = await User.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, updates, { new: true });
      if (!user) throw new GraphQLError('NOT_FOUND');
      return { ...user.toObject(), id: user._id.toString() };
    },
    updateUserRole: async (_: any, { id, roleId }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const user = await User.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, { roleId }, { new: true });
      if (!user) throw new GraphQLError('NOT_FOUND');
      return { ...user.toObject(), id: user._id.toString() };
    },
    resetUserPin: async (_: any, { id, newPin }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const pinHash = await bcrypt.hash(newPin, 10);
      const user = await User.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, { pinHash }, { new: true });
      if (!user) throw new GraphQLError('NOT_FOUND');
      return { ...user.toObject(), id: user._id.toString() };
    },
    createRole: async (_: any, { name, permissions, scope }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const role = await Role.create({ cafeId: c.cafeId, name, permissions, scope: scope || 'CAFE' });
      return { ...role.toObject(), id: role._id.toString() };
    },
    updateRolePermissions: async (_: any, { id, permissions }: any, ctx: RequestContext | null) => {
      const c = requireAuth(ctx);
      const role = await Role.findOneAndUpdate({ _id: id, cafeId: c.cafeId }, { permissions }, { new: true });
      if (!role) throw new GraphQLError('NOT_FOUND');
      return { ...role.toObject(), id: role._id.toString() };
    },
  }
};
