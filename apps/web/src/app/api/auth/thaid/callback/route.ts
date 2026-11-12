import { NextResponse } from 'next/server';
import { AuditService, DatabaseAuditRepository, ThaidError, ThaidLoginService } from '@backoffice/core';
import { afterSignInPath } from '../../../../../lib/after-sign-in';
import { getSharedDatabase } from '../../../../../lib/database';
import { getNationalIdProtector } from '../../../../../lib/national-id';
import { externalLoginService, providerCookieOptions, providerSsoConfig, providerTicketCookie } from '../../../../../lib/provider-sso';
import { sessionCookieName, sessionCookieOptions, startSession } from '../../../../../lib/session';
import { openThaidFlow, thaidClient, thaidConfig, thaidCookieOptions, thaidFlowCookie, thaidFlowPath, type ThaidPurpose } from '../../../../../lib/thaid';

type Outcome = 'unavailable' | 'failed' | 'inactive' | 'not_found';
const unknownTarget = '00000000-0000-0000-0000-000000000000';

function readCookie(request: Request, name: string): string | undefined {
  return request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) || undefined;
}

/** Behind the proxy request.url is the container's own address; the registered redirect URI carries the public origin. */
const publicUrl = (path: string, redirectUri: string) => new URL(path, redirectUri);

function back(redirectUri: string, purpose: ThaidPurpose, outcome: Outcome): NextResponse {
  const response = NextResponse.redirect(publicUrl(purpose === 'link' ? `/link-provider?thaid=${outcome}` : `/?thaid=${outcome}`, redirectUri), 303);
  response.cookies.set(thaidFlowCookie, '', { ...thaidCookieOptions(thaidFlowPath), maxAge: 0 });
  return response;
}

async function auditFailure(stage: 'state' | 'token'): Promise<void> {
  const database = getSharedDatabase();
  if (!database) return;
  // A refused sign-in names no person; the code, state and citizen ID are never recorded.
  try {
    await new AuditService(new DatabaseAuditRepository(database)).recordAudit({ actorPersonId: null, action: 'identity.thaid_login', targetType: 'person', targetId: unknownTarget, result: 'FAILURE', metadata: { stage } });
  } catch { /* an audit outage must not turn a refused sign-in into a 500 */ }
}

/** เข้าสู่ระบบด้วย ThaID: DOPA returns here; the citizen ID finds the บุคลากร (or confirms a pending Provider ID login) and is then dropped. */
export async function GET(request: Request): Promise<Response> {
  const config = await thaidConfig();
  const protector = getNationalIdProtector();
  if (!config || !protector) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const query = new URL(request.url).searchParams;
  const flow = openThaidFlow(readCookie(request, thaidFlowCookie), config.clientSecret);
  const purpose: ThaidPurpose = flow?.purpose ?? 'sign_in';
  const code = query.get('code');
  if (!flow || query.get('state') !== flow.state || !code || code.length > 4096 || query.has('error')) {
    await auditFailure('state');
    return back(config.redirectUri, purpose, 'failed');
  }
  let citizenId: string;
  try {
    citizenId = await thaidClient(config).citizenIdForCode(code);
  } catch (error) {
    if (error instanceof ThaidError && error.code === 'INVALID') {
      await auditFailure('token');
      return back(config.redirectUri, purpose, 'failed');
    }
    console.error('thaid sign-in failed', error instanceof ThaidError ? error.code : 'UNKNOWN');
    return back(config.redirectUri, purpose, 'unavailable');
  }
  const database = getSharedDatabase();
  if (!database) return back(config.redirectUri, purpose, 'unavailable');
  try {
    const result = await new ThaidLoginService(database, protector, new AuditService(new DatabaseAuditRepository(database))).resolve(citizenId);
    if (result.kind !== 'active') return back(config.redirectUri, purpose, result.kind);
    let clearTicket = false;
    if (purpose === 'link') {
      const provider = await providerSsoConfig();
      const ticket = readCookie(request, providerTicketCookie) ?? '';
      const linked = provider ? await externalLoginService(database, provider.apiUrl).linkPendingToPerson(ticket, result.personId) : { ok: false };
      if (!linked.ok) return back(config.redirectUri, purpose, 'failed');
      clearTicket = true;
    }
    const session = await startSession(result.personId);
    const response = NextResponse.redirect(publicUrl(await afterSignInPath(database, session.token), config.redirectUri), 303);
    response.cookies.set(thaidFlowCookie, '', { ...thaidCookieOptions(thaidFlowPath), maxAge: 0 });
    if (clearTicket) response.cookies.set(providerTicketCookie, '', { ...providerCookieOptions('/'), maxAge: 0 });
    response.cookies.set(sessionCookieName, session.token, sessionCookieOptions(session.maxAgeSeconds));
    return response;
  } catch {
    console.error('thaid sign-in failed', 'RESOLVE');
    return back(config.redirectUri, purpose, 'unavailable');
  }
}
