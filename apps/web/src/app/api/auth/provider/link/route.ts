import { NextResponse } from 'next/server';
import { getSharedDatabase } from '../../../../../lib/database';
import { externalLoginService, providerCookieOptions, providerSsoConfig, providerTicketCookie } from '../../../../../lib/provider-sso';
import { sessionCookieName, sessionCookieOptions, startSession } from '../../../../../lib/session';

const failures: Record<string, [number, string]> = {
  INVALID_CREDENTIALS: [401, 'invalid_credentials'], LOGIN_LOCKED: [429, 'login_locked'], ALREADY_LINKED: [409, 'already_linked'], TICKET_EXPIRED: [410, 'ticket_expired']
};

/** ผูกบัญชี Provider ID: the person proves who they are in BackOffice once with their username and password. */
export async function POST(request: Request): Promise<Response> {
  const config = providerSsoConfig();
  if (!config) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const database = getSharedDatabase();
  if (!database) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  const ticket = request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${providerTicketCookie}=`))?.slice(providerTicketCookie.length + 1) ?? '';
  try {
    const body = await request.json();
    const { personId, mustChangePassword } = await externalLoginService(database, config.apiUrl).linkWithPassword(ticket, body);
    const session = await startSession(personId);
    const response = NextResponse.json({ authenticated: true, mustChangePassword });
    response.cookies.set(sessionCookieName, session.token, sessionCookieOptions(session.maxAgeSeconds));
    response.cookies.set(providerTicketCookie, '', { ...providerCookieOptions('/'), maxAge: 0 });
    return response;
  } catch (error) {
    const known = error instanceof Error ? failures[error.message] : undefined;
    if (known) return NextResponse.json({ error: known[1] }, { status: known[0] });
    if (error instanceof SyntaxError || (error instanceof Error && error.name === 'ZodError')) return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
    // The body carries a password: log a code only.
    console.error('provider link failed', 'UNKNOWN');
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
