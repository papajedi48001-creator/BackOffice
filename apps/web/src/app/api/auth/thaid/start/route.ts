import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getSharedDatabase } from '../../../../../lib/database';
import { getNationalIdProtector } from '../../../../../lib/national-id';
import { externalLoginService, providerSsoConfig, providerTicketCookie } from '../../../../../lib/provider-sso';
import { sealThaidFlow, thaidClient, thaidConfig, thaidCookieOptions, thaidFlowCookie, thaidFlowPath } from '../../../../../lib/thaid';

function readCookie(request: Request, name: string): string {
  return request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? '';
}

/** Linking needs a Provider ID login still waiting on รอผูกบัญชี; without one there is nothing to confirm with ThaID. */
async function hasPendingLogin(request: Request): Promise<boolean> {
  const ticket = readCookie(request, providerTicketCookie);
  const provider = ticket ? await providerSsoConfig() : null;
  const database = provider ? getSharedDatabase() : null;
  if (!provider || !database) return false;
  try { return (await externalLoginService(database, provider.apiUrl).pendingLogin(ticket)) !== null; } catch { return false; }
}

/** เข้าสู่ระบบด้วย ThaID: sends the browser to DOPA. ThaID is off until it is set up and the national-ID keys exist to match a บุคลากร. */
export async function GET(request: Request): Promise<Response> {
  const config = await thaidConfig();
  if (!config || !getNationalIdProtector()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const purpose = new URL(request.url).searchParams.get('purpose') === 'link' ? 'link' : 'sign_in';
  // Behind the proxy request.url is the container's own address; the registered redirect URI carries the public origin.
  if (purpose === 'link' && !await hasPendingLogin(request)) return NextResponse.redirect(new URL('/?provider=failed', config.redirectUri), 303);
  const state = randomBytes(32).toString('base64url');
  const response = NextResponse.redirect(thaidClient(config).authorizeUrl(state), 303);
  response.cookies.set(thaidFlowCookie, sealThaidFlow({ state, purpose }, config.clientSecret), thaidCookieOptions(thaidFlowPath));
  return response;
}
