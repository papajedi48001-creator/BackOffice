import { NextResponse } from 'next/server';
import { supportedAttachmentContentTypeSchema } from '@backoffice/contracts';
import { MAX_ATTACHMENT_BYTES } from '@backoffice/core';
import { attachmentService, attachmentsEnabled, safeFilename } from '../../../lib/attachments';
import { withSessionAndDatabase } from '../hr/profile-route';

// Room for the multipart boundaries and headers around one file of the largest allowed size.
const MAX_BODY_BYTES = MAX_ATTACHMENT_BYTES + 64 * 1024;
const statusByCode: Record<string, number> = { FILE_TOO_LARGE: 413, INVALID_FILE_CONTENT: 422, FILE_INFECTED: 422, SCAN_UNAVAILABLE: 503 };

/** Takes one ไฟล์แนบส่วนตัว (multipart field `file`), scans it and keeps it for the signed-in person. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!attachmentsEnabled()) return NextResponse.json({ error: 'object_storage_not_configured' }, { status: 503 });
    // Refused by its declared length before the body is read, so an oversized upload never fills memory.
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    const contentType = supportedAttachmentContentTypeSchema.safeParse(file.type);
    if (!contentType.success) return NextResponse.json({ error: 'UNSUPPORTED_FILE_TYPE' }, { status: 415 });
    if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    try {
      const filename = safeFilename(file.name || 'file', contentType.data);
      const attachment = await attachmentService(database).uploadAttachment({ actorPersonId: session.personId, filename, contentType: contentType.data, bytes: new Uint8Array(await file.arrayBuffer()) });
      return NextResponse.json({ attachmentId: attachment.id, filename: attachment.filename, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes }, { status: 201 });
    } catch (error) {
      const code = error instanceof Error && error.message in statusByCode ? error.message : 'UPLOAD_FAILED';
      return NextResponse.json({ error: code }, { status: statusByCode[code] ?? 500 });
    }
  });
}
