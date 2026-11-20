// Who is calling, from the headers Caddy adds after /verify (contract 4.3, 4.8).
// Caddy strips any client-sent X-User-* first, so the service trusts these
// without checking the token again.
import type { RequestHandler, Response } from 'express';
import { forbidden, HttpError } from './errors.ts';

export type Role = 'resident' | 'volunteer';

export type Caller = {
  id: string;           // account id (X-User-Id)
  roles: Role[];        // X-User-Roles, comma-separated
  traceId: string | null; // X-Request-Id, for logs and events (traceId)
};

const ROLES: readonly string[] = ['resident', 'volunteer'];

// Every route of this service needs a caller (all are behind forward_auth).
// A missing X-User-Id only happens when the service is called directly, not
// through Caddy: answered like Caddy would, 401.
export const gatewayUser: RequestHandler = (req, res, next) => {
  const id = req.get('X-User-Id');
  if (!id) throw new HttpError(401, 'unauthorized', 'Not signed in.');
  const roles = (req.get('X-User-Roles') ?? '')
    .split(',')
    .map((role) => role.trim())
    .filter((role): role is Role => ROLES.includes(role));
  const caller: Caller = { id, roles, traceId: req.get('X-Request-Id') ?? null };
  res.locals.caller = caller;
  next();
};

// The caller set by gatewayUser. res.locals is untyped, so the cast lives here only.
export function callerOf(res: Response): Caller {
  return res.locals.caller as Caller;
}

// The caller needs this role (contract: missing role -> 403). For routes where
// the role depends on the request (GET /api/requests: on view).
export function assertRole(caller: Caller, role: Role): void {
  if (!caller.roles.includes(role)) throw forbidden(`This needs the ${role} role.`);
}

// Route guard: the endpoint always needs this role.
export function requireRole(role: Role): RequestHandler {
  return (_req, res, next) => {
    assertRole(callerOf(res), role);
    next();
  };
}
