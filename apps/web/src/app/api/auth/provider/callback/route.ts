import { NextResponse } from 'next/server';
import { AuditService, DatabaseAuditRepository, ProviderIdError } from '@backoffice/core';
import { getSharedDatabase } from '../../../../../lib/database';
import { externalLoginService, openFlow, providerCookieOptions, providerIdClient, providerFlowCookie, providerFlowPath, providerSsoConfig, providerTicketCookie } from '../../../../../lib/provider-sso';
import { sessionCookieName, sessionCookieOptions, sessionService, startSession } from '../../../../../lib/session';

type Outcome = 'unavailable' | 'failed' | 'inactive';
const unknownTarget = '00000000-0000-0000-0000-000000000000';

function readCookie(request: Request, name: string): string | undefined {
  return request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || undefined;
}

/** Behind the proxy request.url is the container's own address; the registered redirect URI carries the public origin. */
function publicUrl(path: string, request: Request): URL {
  return new URL(path, providerSsoConfig()?.redirectUri ?? request.url);
}

function back(request: Request, outcome: Outcome): NextResponse {
  const response = NextResponse.redirect(publicUrl(`/?provider=${outcome}`, request), 303);
  response.cookies.set(providerFlowCookie, '', { ...providerCookieOptions(providerFlowPath), maxAge: 0 });
  return response;
}

async function auditFailure(stage: 'state' | 'token'): Promise<void> {
  const database = getSharedDatabase();
  if (!database) return;
  // A refused sign-in names no person; the code, state and token are never recorded.
  try {
    await new AuditService(new DatabaseAuditRepository(database)).recordAudit({ actorPersonId: null, action: 'identity.provider_login', targetType: 'person', targetId: unknownTarget, result: 'FAILURE', metadata: { stage } });
  } catch { /* an audit outage must not turn a refused sign-in into a 500 */ }
}

export async function GET(request: Request): Promise<Response> {
  const config = providerSsoConfig();
  if (!config) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const flow = openFlow(readCookie(request, providerFlowCookie), config.healthClientSecret);
  const code = query.get('code');
  if (!flow || query.get('state') !== flow.state || !code || code.length > 512 || query.has('error')) {
    await auditFailure('state');
    return back(request, 'failed');
  }
  const client = providerIdClient(config);
  let identity;
  try {
    identity = await client.complete(code);
  } catch (error) {
    if (error instanceof ProviderIdError && error.code === 'INVALID') {
      await auditFailure('token');
      return back(request, 'failed');
    }
    console.error('provider sign-in failed', error instanceof ProviderIdError ? error.code : 'UNKNOWN');
    return back(request, 'unavailable');
  }
  const database = getSharedDatabase();
  if (!database) return back(request, 'unavailable');
  try {
    const result = await externalLoginService(database, client.issuer).resolve(identity);
    if (result.kind === 'inactive') return back(request, 'inactive');
    if (result.kind === 'unlinked') {
      const response = NextResponse.redirect(publicUrl('/link-provider', request), 303);
      response.cookies.set(providerFlowCookie, '', { ...providerCookieOptions(providerFlowPath), maxAge: 0 });
      response.cookies.set(providerTicketCookie, result.ticket, providerCookieOptions('/'));
      return response;
    }
    const session = await startSession(result.personId);
    const mustChange = await sessionService(database).pendingPasswordChange(session.token);
    const response = NextResponse.redirect(publicUrl(mustChange ? '/change-password' : '/dashboard', request), 303);
    response.cookies.set(providerFlowCookie, '', { ...providerCookieOptions(providerFlowPath), maxAge: 0 });
    response.cookies.set(sessionCookieName, session.token, sessionCookieOptions(session.maxAgeSeconds));
    return response;
  } catch {
    console.error('provider sign-in failed', 'RESOLVE');
    return back(request, 'unavailable');
  }
}
