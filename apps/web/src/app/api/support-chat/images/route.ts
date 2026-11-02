import { NextResponse } from 'next/server';
import { supportChatImageContentTypeSchema } from '@backoffice/contracts';
import { MAX_ATTACHMENT_BYTES } from '@backoffice/core';
import { attachmentService, attachmentsEnabled, safeFilename } from '../../../../lib/attachments';
import { withSessionAndDatabase } from '../chat-route';

const MAX_BODY_BYTES = MAX_ATTACHMENT_BYTES + 64 * 1024;
const statusByCode: Record<string, number> = { FILE_TOO_LARGE: 413, INVALID_FILE_CONTENT: 422, FILE_INFECTED: 422, SCAN_UNAVAILABLE: 503 };

/** Takes one picture for แชตกับผู้ดูแลระบบ (multipart field `file`, attached or pasted): JPEG, PNG or WebP up to 10 MB, scanned and kept privately. */
export async function POST(request: Request): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!attachmentsEnabled()) return NextResponse.json({ error: 'object_storage_not_configured' }, { status: 503 });
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'FILE_REQUIRED' }, { status: 400 });
    const contentType = supportChatImageContentTypeSchema.safeParse(file.type);
    if (!contentType.success) return NextResponse.json({ error: 'UNSUPPORTED_FILE_TYPE' }, { status: 415 });
    if (file.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: 'FILE_TOO_LARGE' }, { status: 413 });
    try {
      const attachment = await attachmentService(database).uploadAttachment({ actorPersonId: session.personId, filename: safeFilename(file.name || 'image', contentType.data), contentType: contentType.data, bytes: new Uint8Array(await file.arrayBuffer()) });
      return NextResponse.json({ attachmentId: attachment.id }, { status: 201 });
    } catch (error) {
      const code = error instanceof Error && error.message in statusByCode ? error.message : 'UPLOAD_FAILED';
      return NextResponse.json({ error: code }, { status: statusByCode[code] ?? 500 });
    }
  });
}
