import { Cafe } from '../../models/cafe.model';
import { User } from '../../models/user.model';
import { signToken } from '../../middleware/auth';
import { GraphQLError } from 'graphql';
import bcrypt from 'bcrypt';
import { SystemLog } from '../../models/systemLog.model';
import { trackLoginAttempt, clearLoginAttempts } from '../../services/redis.service';

export const authMutations = {
  Mutation: {
    login: async (_: any, { pin, cafeCode }: any, ctx: any) => {
      const ip = ctx.ip || 'unknown';
      const attempts = await trackLoginAttempt(ip);

      if (attempts > 5) {
        throw new GraphQLError('TOO_MANY_LOGIN_ATTEMPTS', { extensions: { code: 'TOO_MANY_REQUESTS' } });
      }

      const cafe = await Cafe.findOne({ code: cafeCode });
      if (!cafe) throw new GraphQLError('INVALID_CAFE_CODE', { extensions: { code: 'UNAUTHENTICATED' } });
      const cafeId = cafe._id.toString();

      const users = await User.find({ cafeId }).lean();
      for (const user of users) {
        const match = await bcrypt.compare(pin, user.pinHash);
        if (match) {
          await clearLoginAttempts(ip);
          const token = signToken({
            userId: user._id.toString(),
            cafeId: cafeId,
            sessionVersion: user.sessionVersion,
          });
          await SystemLog.create({
            action: 'LOGIN',
            description: `User ${user.name} logged into cafe ${cafe.code}`,
            userId: user._id,
            cafeId: cafe._id,
          });
          return { token, user: { ...user, id: user._id.toString() } };
        }
      }
      throw new GraphQLError('INVALID_PIN', { extensions: { code: 'UNAUTHENTICATED' } });
    },
    superLogin: async (_: any, { pin }: any, ctx: any) => {
      const ip = ctx.ip || 'unknown';
      const attempts = await trackLoginAttempt(ip);

      if (attempts > 5) {
        throw new GraphQLError('TOO_MANY_LOGIN_ATTEMPTS', { extensions: { code: 'TOO_MANY_REQUESTS' } });
      }

      const users = await User.find({ cafeId: null }).lean();
      for (const user of users) {
        const match = await bcrypt.compare(pin, user.pinHash);
        if (match) {
          await clearLoginAttempts(ip);
          const token = signToken({
            userId: user._id.toString(),
            sessionVersion: user.sessionVersion,
          });
          await SystemLog.create({
            action: 'LOGIN',
            description: `Super Admin ${user.name} logged into the system`,
            userId: user._id,
          });
          return { token, user: { ...user, id: user._id.toString() } };
        }
      }
      throw new GraphQLError('INVALID_PIN', { extensions: { code: 'UNAUTHENTICATED' } });
    },
  }
};
