import { PersonAccountService } from '@backoffice/core';
import { resultResponse, withSessionAndDatabase } from '../../profile-route';

/** ลบบุคลากร (soft delete). The service lets hospital-wide HR and a ผู้ดูแลระบบ do it; no national ID is read, so no protector is needed. */
export async function DELETE(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { personId } = await context.params;
    return resultResponse(await new PersonAccountService(database, null as never).deletePerson(personId, session));
  });
}
