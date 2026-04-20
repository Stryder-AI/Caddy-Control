import { FastifyRequest, FastifyReply } from 'fastify';
import { UserRole } from '../persistence/repositories/users.js';

export interface AuthPayload {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

export function requireAuth(roles?: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'unauthenticated' });
      return reply;
    }
    const user = request.user as AuthPayload;
    if (roles && !roles.includes(user.role)) {
      reply.code(403).send({ error: 'forbidden' });
      return reply;
    }
    return undefined;
  };
}
