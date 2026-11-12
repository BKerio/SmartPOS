import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'smartpos-secret-key';

export interface AuthPayload {
  id: string;
  email?: string;
  phone?: string;
  regNo?: string;
  role: string;
  name: string;
}

export const signToken = (payload: AuthPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

/** Verifies the bearer token and sets req.user; sends 401 and returns false when it is missing or invalid. */
function authenticate(req: FastifyRequest, reply: FastifyReply): boolean {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'No token provided' });
    return false;
  }

  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET) as AuthPayload;
    return true;
  } catch {
    reply.status(401).send({ error: 'Invalid or expired token' });
    return false;
  }
}

// Route hooks, registered as `onRequest` so unauthorised requests are rejected before their body
// is read. Returning the reply after sending stops the route handler from running.

export const ensureAuthenticated = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!authenticate(req, reply)) return reply;
};

export const ensureAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!authenticate(req, reply)) return reply;
  if (req.user?.role !== 'admin') {
    return reply.status(403).send({ error: 'Admin access required' });
  }
};

export const ensureFinanceOrAdmin = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!authenticate(req, reply)) return reply;
  if (!['admin', 'finance'].includes(req.user?.role || '')) {
    return reply.status(403).send({ error: 'Admin or finance access required' });
  }
};
