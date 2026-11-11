import { NextResponse } from 'next/server';
import { SiteImageService } from '@backoffice/core';
import { withAdmin } from '../admin-route';

const refusals: Record<string, number> = { INVALID_IMAGE: 400, TOO_LARGE: 413 };

/** ผู้ดูแลระบบ > หน้าตาระบบ: uploads the hospital photo for the sign-in page (form field `file`). */
export async function POST(request: Request): Promise<Response> {
  return withAdmin(request, async (session, database) => {
    const file = (await request.formData().catch(() => null))?.get('file');
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'invalid_input', fields: ['file'] }, { status: 400 });
    const result = await new SiteImageService(database).save('login-hero', new Uint8Array(await file.arrayBuffer()), session.personId);
    if (result.ok) return NextResponse.json(result);
    return NextResponse.json({ error: result.code }, { status: refusals[result.code] ?? 400 });
  });
}

/** Removes the photo; the sign-in page goes back to its plain blue background. */
export async function DELETE(request: Request): Promise<Response> {
  return withAdmin(request, async (session, database) => NextResponse.json(await new SiteImageService(database).remove('login-hero', session.personId)));
}
