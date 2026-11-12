import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { AuditService, DatabaseAuditRepository } from '@backoffice/core';
import { afterSignInPath } from '../../../../../lib/after-sign-in';
import { getSharedDatabase } from '../../../../../lib/database';
import { externalLoginService, providerCookieOptions, providerSsoConfig, providerTicketCookie } from '../../../../../lib/provider-sso';
import { sessionCookieName, sessionCookieOptions, startSession } from '../../../../../lib/session';
import { openThaidLink, thaidConfig, thaidCookieOptions, thaidLinkCookie, ticketHashOf } from '../../../../../lib/thaid';

function readCookie(request: Request, name: string): string {
  return request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}

const sameHash = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * ยืนยันผูกบัญชี: after ThaID confirmed the บุคลากร and the person checked the Provider ID name on screen, links that pending
 * Provider ID login to them and signs them in. The sealed link cookie must belong to the same Provider ID ticket.
 */
export async function POST(request: Request): Promise<Response> {
  const config = await thaidConfig();
  if (!config) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const link = openThaidLink(readCookie(request, thaidLinkCookie), config.clientSecret);
  const ticket = readCookie(request, providerTicketCookie);
  if (!link || !ticket || !sameHash(link.ticketHash, ticketHashOf(ticket))) return NextResponse.json({ error: 'link_expired' }, { status: 400 });
  const database = getSharedDatabase();
  const provider = await providerSsoConfig();
  if (!database || !provider) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  try {
    const linked = await externalLoginService(database, provider.apiUrl).linkPendingToPerson(ticket, link.personId);
    if (!linked.ok) return NextResponse.json({ error: 'link_failed' }, { status: 409 });
    try {
      await new AuditService(new DatabaseAuditRepository(database)).recordAudit({ actorPersonId: link.personId, action: 'identity.thaid_login', targetType: 'person', targetId: link.personId, result: 'SUCCESS', metadata: { stage: 'link' } });
    } catch { /* the link itself is already audited; a sign-in audit outage must not strand the person */ }
    const session = await startSession(link.personId);
    const response = NextResponse.json({ next: await afterSignInPath(database, session.token) });
    response.cookies.set(thaidLinkCookie, '', { ...thaidCookieOptions('/'), maxAge: 0 });
    response.cookies.set(providerTicketCookie, '', { ...providerCookieOptions('/'), maxAge: 0 });
    response.cookies.set(sessionCookieName, session.token, sessionCookieOptions(session.maxAgeSeconds));
    return response;
  } catch {
    console.error('thaid link failed', 'LINK');
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
