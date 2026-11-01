import { NextResponse } from 'next/server';
import { MAX_KP7_FILE_BYTES } from '@backoffice/contracts';
import { HrProfileService } from '@backoffice/core';
import { attachmentService, attachmentsEnabled, safeFilename } from '../../../../../../lib/attachments';
import { resultResponse, withSessionAndDatabase } from '../../../profile-route';

const MAX_BODY_BYTES = MAX_KP7_FILE_BYTES + 64 * 1024;
const statusByCode: Record<string, number> = { FILE_TOO_LARGE: 413, INVALID_FILE_CONTENT: 422, FILE_INFECTED: 422, SCAN_UNAVAILABLE: 503 };

/** Takes a person's ก.พ.7 (multipart field `file`): a PDF up to 10 MB, scanned and kept privately, replacing the one before. */
export async function POST(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { personId } = await context.params;
    // Refuse before anything is stored, so nobody can fill storage with files that would only be refused.
    if (!(await new HrProfileService(database).canEditKp7(personId, session))) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    if (!attachmentsEnabled()) return NextResponse.json({ error: 'object_storage_not_configured' }, { status: 503 });
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    if (file.type !== 'application/pdf') return NextResponse.json({ error: 'UNSUPPORTED_FILE_TYPE' }, { status: 415 });
    if (file.size > MAX_KP7_FILE_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    let attachmentId: string;
    try {
      const attachment = await attachmentService(database).uploadAttachment({ actorPersonId: session.personId, filename: safeFilename(file.name || 'kp7', 'application/pdf'), contentType: 'application/pdf', bytes: new Uint8Array(await file.arrayBuffer()) });
      attachmentId = attachment.id;
    } catch (error) {
      const code = error instanceof Error && error.message in statusByCode ? error.message : 'UPLOAD_FAILED';
      return NextResponse.json({ error: code }, { status: statusByCode[code] ?? 500 });
    }
    const result = await new HrProfileService(database).setKp7File(personId, attachmentId, session);
    if (!result.ok) return resultResponse(result);
    return NextResponse.json({ attachmentId }, { status: 201 });
  });
}

/** Removes the person's ก.พ.7 file from their profile. */
export async function DELETE(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    const { personId } = await context.params;
    return resultResponse(await new HrProfileService(database).setKp7File(personId, null, session));
  });
}
