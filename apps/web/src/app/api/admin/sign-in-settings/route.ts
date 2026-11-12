import { NextResponse } from 'next/server';
import { signInSettingInputSchema } from '@backoffice/contracts';
import { clearSignInRoutesCache, signInSettings } from '../../../../lib/sign-in-settings';
import { adminResult, readInput, withAdmin } from '../admin-route';

/** ThaID and Provider ID as ผู้ดูแลระบบ > การเข้าสู่ระบบ shows them: never a secret, only whether each is set. */
export async function GET(request: Request): Promise<Response> {
  return withAdmin(request, async (_session, database) => NextResponse.json(await signInSettings(database).view()));
}

/** ผู้ดูแลระบบ saves one route. A blank secret keeps the stored one; switching off the last ready route is refused. */
export async function PUT(request: Request): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const input = await readInput(request, signInSettingInputSchema);
    if (!input.ok) return input.response;
    const { method, ...setting } = input.value;
    const result = await signInSettings(database).save(method, setting, session.personId);
    if (result.ok) clearSignInRoutesCache();
    return adminResult(result);
  });
}
