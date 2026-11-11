import { NextResponse } from 'next/server';
import { providerLinkInputSchema } from '@backoffice/contracts';
import { externalLoginService, providerSsoConfig } from '../../../../lib/provider-sso';
import { adminResult, readInput, withAdmin } from '../admin-route';

/** ผูกบัญชี Provider ID ที่รอผูกเข้ากับบุคลากร: ผู้ดูแลระบบ only. */
export async function POST(request: Request): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const config = providerSsoConfig();
    if (!config) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const input = await readInput(request, providerLinkInputSchema);
    if (!input.ok) return input.response;
    return adminResult(await externalLoginService(database, config.apiUrl).adminLink(session.personId, input.value.pendingId, input.value.personId), 201);
  });
}
