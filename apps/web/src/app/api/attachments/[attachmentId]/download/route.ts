import { NextResponse } from 'next/server';
import { AttachmentAccess } from '@backoffice/core';
import { attachmentService, attachmentsEnabled, contentDisposition } from '../../../../../lib/attachments';
import { withSessionAndDatabase } from '../../../hr/profile-route';

/** Streams a ไฟล์แนบส่วนตัว after checking, on every request, that this person may see the record holding it. */
export async function GET(request: Request, context: { params: Promise<{ attachmentId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!attachmentsEnabled()) return NextResponse.json({ error: 'object_storage_not_configured' }, { status: 503 });
    const { attachmentId } = await context.params;
    try {
      const { attachment, bytes } = await attachmentService(database).openAttachment({ attachmentId, actorPersonId: session.personId }, new AttachmentAccess(database, session));
      return new Response(new Blob([new Uint8Array(bytes)]), { status: 200, headers: { 'content-type': attachment.contentType, 'content-length': String(bytes.byteLength), 'content-disposition': contentDisposition(attachment.filename, attachment.contentType), 'x-content-type-options': 'nosniff', 'cache-control': 'private, no-store' } });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'not_found' }, { status: 404 });
      return NextResponse.json({ error: 'download_failed' }, { status: 500 });
    }
  });
}
