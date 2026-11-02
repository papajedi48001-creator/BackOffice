import { PersonAccountService } from '@backoffice/core';
import { resultResponse, withSessionAndDatabase } from '../../../profile-route';

/**
 * รีเซ็ตรหัสผ่าน to the default; the owner must change it at the next login. HR never chooses someone's password.
 * The service lets hospital-wide HR and a ผู้ดูแลระบบ do it; no national ID is read, so no protector is needed.
 */
export async function POST(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { personId } = await context.params;
    return resultResponse(await new PersonAccountService(database, null as never).resetPassword(personId, session));
  });
}
