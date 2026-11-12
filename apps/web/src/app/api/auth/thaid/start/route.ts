import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getNationalIdProtector } from '../../../../../lib/national-id';
import { sealThaidFlow, thaidClient, thaidConfig, thaidCookieOptions, thaidFlowCookie, thaidFlowPath } from '../../../../../lib/thaid';

/** เข้าสู่ระบบด้วย ThaID: sends the browser to DOPA. ThaID is off until it is set up and the national-ID keys exist to match a บุคลากร. */
export async function GET(request: Request): Promise<Response> {
  const config = await thaidConfig();
  if (!config || !getNationalIdProtector()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const purpose = new URL(request.url).searchParams.get('purpose') === 'link' ? 'link' : 'sign_in';
  const state = randomBytes(32).toString('base64url');
  const response = NextResponse.redirect(thaidClient(config).authorizeUrl(state), 303);
  response.cookies.set(thaidFlowCookie, sealThaidFlow({ state, purpose }, config.clientSecret), thaidCookieOptions(thaidFlowPath));
  return response;
}
