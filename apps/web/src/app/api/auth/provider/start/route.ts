import { NextResponse } from 'next/server';
import { providerCookieOptions, providerIdClient, providerFlowCookie, providerFlowPath, providerSsoConfig, sealFlow } from '../../../../../lib/provider-sso';

/** เข้าสู่ระบบด้วย Provider ID: sends the browser to MOPH ID; the state stays in an encrypted cookie. */
export async function GET(): Promise<Response> {
  const config = providerSsoConfig();
  if (!config) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { flow, url } = providerIdClient(config).begin();
  const response = NextResponse.redirect(url, 303);
  response.cookies.set(providerFlowCookie, sealFlow(flow, config.healthClientSecret), providerCookieOptions(providerFlowPath));
  return response;
}
