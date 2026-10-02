import type { AccessResource, Permission, Session } from '@backoffice/contracts';
import { AuthorizationService } from '@backoffice/core';
import { readSession } from './session';

export class AuthorizationError extends Error {
  constructor(public readonly status: 401 | 403) { super(status === 401 ? 'Unauthenticated' : 'Forbidden'); }
}

export async function requireAuthorized(request: Request, action?: Permission, resource?: AccessResource, authorizer = new AuthorizationService()): Promise<Session> {
  const session = readSession(request);
  if (!session?.authenticated || !session.personId) throw new AuthorizationError(401);
  if (action && resource && !(await authorizer.canAccess(session, action, resource)).allowed) throw new AuthorizationError(403);
  return session;
}
