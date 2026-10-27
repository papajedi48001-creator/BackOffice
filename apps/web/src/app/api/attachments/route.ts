import { NextResponse } from 'next/server';
import { supportedAttachmentContentTypeSchema } from '@backoffice/contracts';
import { MAX_ATTACHMENT_BYTES } from '@backoffice/core';
import { attachmentService, attachmentsEnabled } from '../../../lib/attachments';
import { withSessionAndDatabase } from '../hr/profile-route';

const statusByCode: Record<string, number> = { FILE_TOO_LARGE: 413, INVALID_FILE_CONTENT: 422, FILE_INFECTED: 422, SCAN_UNAVAILABLE: 503 };

/** Takes one ไฟล์แนบส่วนตัว (multipart field `file`), scans it and keeps it for the signed-in person. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!attachmentsEnabled()) return NextResponse.json({ error: 'object_storage_not_configured' }, { status: 503 });
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    const contentType = supportedAttachmentContentTypeSchema.safeParse(file.type);
    if (!contentType.success) return NextResponse.json({ error: 'UNSUPPORTED_FILE_TYPE' }, { status: 415 });
    if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    try {
      const filename = (file.name || 'file').slice(0, 255);
      const attachment = await attachmentService(database).uploadAttachment({ actorPersonId: session.personId, filename, contentType: contentType.data, bytes: new Uint8Array(await file.arrayBuffer()) });
      return NextResponse.json({ attachmentId: attachment.id, filename: attachment.filename, contentType: attachment.contentType, sizeBytes: attachment.sizeBytes }, { status: 201 });
    } catch (error) {
      const code = error instanceof Error && error.message in statusByCode ? error.message : 'UPLOAD_FAILED';
      return NextResponse.json({ error: code }, { status: statusByCode[code] ?? 500 });
    }
  });
}
