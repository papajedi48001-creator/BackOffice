import { NextResponse } from 'next/server';
import { HrProfileService } from '@backoffice/core';
import { attachmentService, attachmentsEnabled } from '../../../../../../lib/attachments';
import { withSessionAndDatabase } from '../../../profile-route';

/** A บุคลากร's current profile photo, shown to any signed-in colleague. Only the file that is the person's photo now can be opened here. */
export async function GET(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  return withSessionAndDatabase(request, async (session, database) => {
    if (!attachmentsEnabled()) return NextResponse.json({ error: 'object_storage_not_configured' }, { status: 503 });
    const { personId } = await context.params;
    const photoId = await new HrProfileService(database).photoAttachmentOf(personId);
    if (!photoId) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    try {
      // Not audited per view: the photo loads with every page. Uploading and changing it is audited.
      const { attachment, bytes } = await attachmentService(database).openAttachment({ attachmentId: photoId, actorPersonId: session.personId }, { canDownload: async (_input, file) => file.id === photoId }, { recordDownload: false });
      return new Response(new Blob([new Uint8Array(bytes)]), { status: 200, headers: { 'content-type': attachment.contentType, 'content-length': String(bytes.byteLength), 'content-disposition': 'inline', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'", 'cache-control': 'private, max-age=300' } });
    } catch (error) {
      if (error instanceof Error && error.message === 'NOT_FOUND') return NextResponse.json({ error: 'not_found' }, { status: 404 });
      return NextResponse.json({ error: 'photo_failed' }, { status: 500 });
    }
  });
}
