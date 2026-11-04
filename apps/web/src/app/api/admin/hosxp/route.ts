import { NextResponse } from 'next/server';
import { hosxpSettingsInputSchema } from '@backoffice/contracts';
import { hosxpSettings } from '../../../../lib/hosxp';
import { adminResult, readInput, withAdmin } from '../admin-route';

/** The HOSxP connection as the admin page shows it: never the password, only whether one is set. */
export async function GET(request: Request): Promise<Response> {
  return withAdmin(request, async (_session, database) => NextResponse.json(await hosxpSettings(database).view()));
}

/** ผู้ดูแลระบบ saves the HOSxP connection. A blank password keeps the stored one. */
export async function PUT(request: Request): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const input = await readInput(request, hosxpSettingsInputSchema);
    if (!input.ok) return input.response;
    return adminResult(await hosxpSettings(database).save(input.value, session.personId));
  });
}
