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
function publicUrl(path: string, request: Request, redirectUri: string | undefined): URL {
  return new URL(path, redirectUri ?? request.url);
}

function back(request: Request, outcome: Outcome, redirectUri?: string): NextResponse {
  const response = NextResponse.redirect(publicUrl(`/?provider=${outcome}`, request, redirectUri), 303);
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
  const config = await providerSsoConfig();
  if (!config) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const flow = openFlow(readCookie(request, providerFlowCookie), config.healthClientSecret);
  const code = query.get('code');
  if (!flow || query.get('state') !== flow.state || !code || code.length > 4096 || query.has('error')) {
    await auditFailure('state');
    return back(request, 'failed', config.redirectUri);
  }
  const client = providerIdClient(config);
  let login;
  try {
    login = await client.complete(code);
  } catch (error) {
    if (error instanceof ProviderIdError && error.code === 'INVALID') {
      await auditFailure('token');
      return back(request, 'failed', config.redirectUri);
    }
    console.error('provider sign-in failed', error instanceof ProviderIdError ? error.code : 'UNKNOWN');
    return back(request, 'unavailable', config.redirectUri);
  }
  const database = getSharedDatabase();
  if (!database) return back(request, 'unavailable', config.redirectUri);
  try {
    const result = await externalLoginService(database, client.issuer).resolve(login.identity, { hashCid: login.hashCid });
    if (result.kind === 'inactive') return back(request, 'inactive', config.redirectUri);
    if (result.kind === 'unlinked') {
      const response = NextResponse.redirect(publicUrl('/link-provider', request, config.redirectUri), 303);
      response.cookies.set(providerFlowCookie, '', { ...providerCookieOptions(providerFlowPath), maxAge: 0 });
      response.cookies.set(providerTicketCookie, result.ticket, providerCookieOptions('/'));
      return response;
    }
    const session = await startSession(result.personId);
    const sessions = sessionService(database);
    const mustChange = await sessions.pendingPasswordChange(session.token);
    // A person with several roles picks one before anything else, as after a password sign-in.
    const roleChoice = !mustChange && (await sessions.resolve(session.token))?.roleSelectionRequired === true;
    const response = NextResponse.redirect(publicUrl(mustChange ? '/change-password' : roleChoice ? '/choose-role' : '/dashboard', request, config.redirectUri), 303);
    response.cookies.set(providerFlowCookie, '', { ...providerCookieOptions(providerFlowPath), maxAge: 0 });
    response.cookies.set(sessionCookieName, session.token, sessionCookieOptions(session.maxAgeSeconds));
    return response;
  } catch {
    console.error('provider sign-in failed', 'RESOLVE');
    return back(request, 'unavailable', config.redirectUri);
  }
}
