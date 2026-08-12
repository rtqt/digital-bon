import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';
import { Role } from '../models/role.model';

const JWT_SECRET = process.env.JWT_SECRET || 'digitalbon-dev-secret-change-in-prod';
export const JWT_EXPIRY = '12h';

export interface JWTPayload {
  userId: string;
  cafeId?: string;
  sessionVersion: number;
}

export interface RequestContext {
  userId: string;
  cafeId?: string;
  permissions: string[];
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export async function buildContext(req: any): Promise<RequestContext | null> {
  try {
    const authHeader = req?.headers?.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload;

    // I-7: sessionVersion check — enforce shift lock invalidation
    const user = await User.findById(payload.userId).select('sessionVersion cafeId roleId').lean();
    if (!user) return null;
    if (user.sessionVersion !== payload.sessionVersion) return null;

    // Live permission fetch from DB
    const role = await Role.findById(user.roleId).select('permissions').lean();
    const permissions = role?.permissions || [];

    return { userId: payload.userId, cafeId: payload.cafeId, permissions };
  } catch {
    return null;
  }
}

export function requireAuth(ctx: RequestContext | null): RequestContext {
  if (!ctx) throw new Error('UNAUTHENTICATED');
  return ctx;
}

export function requirePermission(ctx: RequestContext, permission: string): void {
  if (!ctx.permissions.includes(permission)) {
    throw new Error(`FORBIDDEN: missing permission ${permission}`);
  }
}
