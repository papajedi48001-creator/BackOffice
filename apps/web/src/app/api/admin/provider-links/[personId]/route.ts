import { NextResponse } from 'next/server';
import { providerUnlinkInputSchema } from '@backoffice/contracts';
import { externalLoginService, providerSsoConfig } from '../../../../../lib/provider-sso';
import { adminResult, readInput, withAdmin } from '../../admin-route';

/** ยกเลิกการผูกบัญชี Provider ID: ผู้ดูแลระบบ only, with a reason; the person's sessions end too. */
export async function DELETE(request: Request, { params }: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const config = providerSsoConfig();
    if (!config) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    const { personId } = await params;
    const input = await readInput(request, providerUnlinkInputSchema);
    if (!input.ok) return input.response;
    return adminResult(await externalLoginService(database, config.issuer).adminUnlink(session.personId, personId, input.value.reason));
  });
}
