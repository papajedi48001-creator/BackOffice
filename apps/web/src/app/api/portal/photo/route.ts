import { NextResponse } from 'next/server';
import { DatabaseExternalIdentityRepository, HrProfileService, OidcError } from '@backoffice/core';
import { attachmentService, attachmentsEnabled } from '../../../../lib/attachments';
import { getSharedDatabase } from '../../../../lib/database';
import { portalOidcClient, providerSsoConfig } from '../../../../lib/provider-sso';

/** The JWT `typ` the portal puts on a photo request; an ID token (`typ: JWT`) is never accepted here. */
const photoRequestType = 'backoffice-photo-request+jwt';

const answer = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } });

/**
 * The portal (radius-server) asks, server to server, for the profile photo of the member signed in there, so its dashboard shows
 * the same face as Back Office. The request is a short-lived JWT the portal signs with its OIDC key (checked against the same JWKS as
 * Provider ID sign-in) naming the portal member; the photo is that of the บุคลากร the member is linked to. No browser session is used.
 */
export async function GET(request: Request): Promise<Response> {
  const config = providerSsoConfig();
  if (!config) return answer('not_found', 404);
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || token.length > 4096) return answer('unauthenticated', 401);
  const database = getSharedDatabase();
  if (!database || !attachmentsEnabled()) return answer('service_unavailable', 503);
  let memberId: string;
  try {
    memberId = await portalOidcClient(config).verifyPortalRequest(token, photoRequestType);
  } catch (error) {
    return error instanceof OidcError && error.code === 'UNAVAILABLE' ? answer('service_unavailable', 503) : answer('unauthenticated', 401);
  }
  const identities = new DatabaseExternalIdentityRepository(database);
  const link = await identities.findLink(config.issuer, memberId);
  if (!link || !(await identities.isActivePerson(link.personId))) return answer('not_found', 404);
  const photoId = await new HrProfileService(database).photoAttachmentOf(link.personId);
  if (!photoId) return answer('not_found', 404);
  try {
    // Not audited per view, like the photo inside Back Office: it loads with every portal dashboard.
    const { attachment, bytes } = await attachmentService(database).openAttachment({ attachmentId: photoId, actorPersonId: link.personId }, { canDownload: async (_input, file) => file.id === photoId }, { recordDownload: false });
    return new Response(new Blob([new Uint8Array(bytes)]), { status: 200, headers: { 'content-type': attachment.contentType, 'content-length': String(bytes.byteLength), 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return answer('not_found', 404);
    return answer('photo_failed', 500);
  }
}
