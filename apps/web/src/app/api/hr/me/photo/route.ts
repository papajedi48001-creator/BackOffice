import { NextResponse } from 'next/server';
import { MAX_PROFILE_PHOTO_BYTES, profilePhotoContentTypeSchema } from '@backoffice/contracts';
import { HrProfileService } from '@backoffice/core';
import { attachmentService, attachmentsEnabled, safeFilename } from '../../../../../lib/attachments';
import { profilePhotoUrl } from '../../../../../lib/profile-photo';
import { resultResponse, withSessionAndDatabase } from '../../profile-route';

const MAX_BODY_BYTES = MAX_PROFILE_PHOTO_BYTES + 64 * 1024;
const statusByCode: Record<string, number> = { FILE_TOO_LARGE: 413, INVALID_FILE_CONTENT: 422, FILE_INFECTED: 422, SCAN_UNAVAILABLE: 503 };

/** Takes the signed-in person's own profile photo (multipart field `file`): JPEG, PNG or WebP up to 2 MB, scanned and kept privately. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!attachmentsEnabled()) return NextResponse.json({ error: 'object_storage_not_configured' }, { status: 503 });
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    const contentType = profilePhotoContentTypeSchema.safeParse(file.type);
    if (!contentType.success) return NextResponse.json({ error: 'UNSUPPORTED_FILE_TYPE' }, { status: 415 });
    if (file.size > MAX_PROFILE_PHOTO_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    let attachmentId: string;
    try {
      const attachment = await attachmentService(database).uploadAttachment({ actorPersonId: session.personId, filename: safeFilename(file.name || 'photo', contentType.data), contentType: contentType.data, bytes: new Uint8Array(await file.arrayBuffer()) });
      attachmentId = attachment.id;
    } catch (error) {
      const code = error instanceof Error && error.message in statusByCode ? error.message : 'UPLOAD_FAILED';
      return NextResponse.json({ error: code }, { status: statusByCode[code] ?? 500 });
    }
    const result = await new HrProfileService(database).setOwnPhoto(session.personId, attachmentId, session);
    if (!result.ok) return resultResponse(result);
    return NextResponse.json({ photoUrl: profilePhotoUrl(session.personId, attachmentId) }, { status: 201 });
  });
}

/** Removes the signed-in person's own profile photo; the chip goes back to initials. */
export async function DELETE(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => resultResponse(await new HrProfileService(database).setOwnPhoto(session.personId, null, session)));
}
