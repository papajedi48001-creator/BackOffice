import { passwordSignInModeInputSchema } from '@backoffice/contracts';
import { getNationalIdProtector } from '../../../../../lib/national-id';
import { clearSignInRoutesCache, signInSettings } from '../../../../../lib/sign-in-settings';
import { adminResult, readInput, withAdmin } from '../../admin-route';

/** ผู้ดูแลระบบ picks อัตโนมัติ · เปิด · ปิด for password sign-in. ปิด is refused while neither ThaID (with its national-ID keys) nor Provider ID is ready. */
export async function PUT(request: Request): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const input = await readInput(request, passwordSignInModeInputSchema);
    if (!input.ok) return input.response;
    const result = await signInSettings(database).savePasswordMode(input.value.mode, session.personId, getNationalIdProtector() !== null);
    if (result.ok) clearSignInRoutesCache();
    return adminResult(result);
  });
}
