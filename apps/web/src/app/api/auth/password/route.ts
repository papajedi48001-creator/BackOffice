import { NextResponse } from 'next/server';
import { PersonAccountService } from '@backoffice/core';
import { changeOwnPasswordInputSchema } from '@backoffice/contracts';
import { getSharedDatabase } from '../../../../lib/database';
import { readPendingPasswordChange, readSession, sessionCookieName } from '../../../../lib/session';

/**
 * เปลี่ยนรหัสผ่าน: only for the signed-in person's own account, including a session that must change a reset password first.
 * Success ends every session of the person and clears the cookie, so they sign in again with the new password.
 */
export async function POST(request: Request): Promise<Response> {
  const database = getSharedDatabase();
  if (!database) return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  const personId = (await readSession(request))?.personId ?? (await readPendingPasswordChange(request))?.personId;
  if (!personId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const parsed = changeOwnPasswordInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  // No protector is needed: changing a password reads no national ID.
  const result = await new PersonAccountService(database, null as never).changeOwnPassword(personId, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.code }, { status: result.code === 'NO_ACCOUNT' ? 404 : 400 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, '', { path: '/', maxAge: 0 });
  return response;
}
