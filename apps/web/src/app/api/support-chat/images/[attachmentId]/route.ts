import { NextResponse } from 'next/server';
import { AttachmentAccess } from '@backoffice/core';
import { attachmentService, attachmentsEnabled, safeFilename } from '../../../../../lib/attachments';
import { withSessionAndDatabase } from '../../chat-route';

/** A chat picture shown in the chat window. Access is checked every time (the conversation's person or ผู้ดูแลระบบ); showing it is not recorded as a download. */
export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!attachmentsEnabled()) return NextResponse.json({ error: 'object_storage_not_configured' }, { status: 503 });
    const { attachmentId } = await context.params;
    try {
      const { attachment, bytes } = await attachmentService(database).openAttachment({ attachmentId, actorPersonId: session.personId }, new AttachmentAccess(database, session), { recordDownload: false });
      if (!attachment.contentType.startsWith('image/')) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      const name = encodeURIComponent(safeFilename(attachment.filename ?? 'image', attachment.contentType));
      return new Response(new Blob([new Uint8Array(bytes)]), { status: 200, headers: { 'content-type': attachment.contentType, 'content-length': String(bytes.byteLength), 'content-disposition': `inline; filename*=UTF-8''${name}`, 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'", 'cache-control': 'private, max-age=3600' } });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'not_found' }, { status: 404 });
      return NextResponse.json({ error: 'download_failed' }, { status: 500 });
    }
  });
}
