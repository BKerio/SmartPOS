import type { IncomingMessage, ServerResponse } from 'http';
import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyRequest,
  FastifySchema,
  FastifyTypeProvider,
  RawServerDefault,
  RouteGenericInterface,
} from 'fastify';
import type { Server } from 'socket.io';
import type { AuthPayload } from '@/middleware/auth';

/**
 * Routes don't declare JSON schemas; each handler checks the fields it reads. This type provider
 * types body, query, params and headers as plain records so handlers can read them directly.
 */
export interface LooseTypeProvider extends FastifyTypeProvider {
  validator: Record<string, any>;
}

/** Fastify instance that route plugins receive. */
export type App = FastifyInstance<RawServerDefault, IncomingMessage, ServerResponse, FastifyBaseLogger, LooseTypeProvider>;

/** Request type for route handlers and helpers. */
export type Req = FastifyRequest<RouteGenericInterface, RawServerDefault, IncomingMessage, FastifySchema, LooseTypeProvider>;

declare module 'fastify' {
  interface FastifyInstance {
    io: Server;
  }
  interface FastifyRequest {
    user?: AuthPayload;
    /** Unparsed JSON body, kept for /kopokopo/ routes so webhook signatures can be verified. */
    rawBody?: Buffer;
  }
}
