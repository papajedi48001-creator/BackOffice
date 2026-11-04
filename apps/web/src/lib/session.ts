import type { Session } from '@backoffice/contracts';
import { DatabaseAccessSubjectLoader, DatabaseSessionRepository, SessionService } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from './database';

const cookieName = 'backoffice_session';

export function sessionService(database: Database): SessionService {
  return new SessionService(new DatabaseSessionRepository(database), new DatabaseAccessSubjectLoader(database));
}

export function readSessionToken(request: Request): string | null {
  return request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1) || null;
}

export async function readSession(request: Request): Promise<Session | null> {
  const token = readSessionToken(request);
  const database = token ? getSharedDatabase() : null;
  if (!token || !database) return null;
  return sessionService(database).resolve(token);
}

/** A signed-in person who must change a reset password before anything else, else null. Only the change-password step uses it. */
export async function readPendingPasswordChange(request: Request): Promise<{ personId: string } | null> {
  const token = readSessionToken(request);
  const database = token ? getSharedDatabase() : null;
  if (!token || !database) return null;
  return sessionService(database).pendingPasswordChange(token);
}

export async function startSession(personId: string): Promise<{ token: string; maxAgeSeconds: number }> {
  const database = getSharedDatabase();
  if (!database) throw new Error('SESSION_STORE_UNAVAILABLE');
  return sessionService(database).start(personId);
}

export async function endSession(request: Request): Promise<string | null> {
  const token = readSessionToken(request);
  const database = token ? getSharedDatabase() : null;
  if (!token || !database) return null;
  return sessionService(database).revoke(token);
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge: maxAgeSeconds };
}

export const sessionCookieName = cookieName;
