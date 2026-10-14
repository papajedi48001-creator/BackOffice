import { NextResponse } from 'next/server';
import { AuditService, DatabaseAuditRepository, DatabaseLocalAccountRepository, DatabaseLoginThrottle, LocalAuthService } from '@backoffice/core';
import { getSharedDatabase } from '../../../../lib/database';
import { sessionCookieName, sessionCookieOptions, startSession } from '../../../../lib/session';

function failureCode(error: unknown): string {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : 'UNKNOWN';
}

export async function POST(request: Request): Promise<Response> {
  const database = getSharedDatabase();
  if (!database) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const body = await request.json();
    const auth = new LocalAuthService(new DatabaseLocalAccountRepository(database), { throttle: new DatabaseLoginThrottle(database), audit: new AuditService(new DatabaseAuditRepository(database)) });
    const { personId } = await auth.authenticateLocal(body);
    const session = await startSession(personId);
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(sessionCookieName, session.token, sessionCookieOptions(session.maxAgeSeconds));
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'LOGIN_LOCKED') return NextResponse.json({ error: 'login_locked' }, { status: 429 });
    if (error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError') || (error instanceof Error && error.message === 'INVALID_CREDENTIALS')) return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    // Log only an error code: the request body carries the password.
    console.error('local login failed', failureCode(error));
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
