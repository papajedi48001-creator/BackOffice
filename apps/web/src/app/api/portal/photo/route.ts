import { NextResponse } from 'next/server';
import { MAX_PROFILE_PHOTO_BYTES, profilePhotoContentTypeSchema } from '@backoffice/contracts';
import { DatabaseExternalIdentityRepository, HrProfileService, OidcError, type PortalRequest } from '@backoffice/core';
import { attachmentService, attachmentsEnabled } from '../../../../lib/attachments';
import { getSharedDatabase } from '../../../../lib/database';
import { portalOidcClient, portalSsoConfig, providerSsoConfig } from '../../../../lib/provider-sso';

/** The JWT `typ` the portal puts on a photo request; an ID token (`typ: JWT`) is never accepted here. */
const photoRequestType = 'backoffice-photo-request+jwt';

/** The portal waits three seconds before it shows its own picture; answer before that, with 503 if the work behind it stalls. */
const portalPhotoDeadlineMs = 2_500;

const answer = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'cache-control': 'no-store' } });

/**
 * The portal (radius-server) asks, server to server, for the profile photo of the member signed in there, so its dashboard shows
 * the same face as Back Office. The request is a short-lived JWT the portal signs with its OIDC key (checked against the same JWKS as
 * Provider ID sign-in) naming the portal member and, when the portal has one bound, the member's Provider ID account. The photo is that of
 * the บุคลากร linked to that Provider ID account (as Provider ID sign-in links it), or else to the portal member (links made through the
 * portal before sign-in went straight to MOPH ID). No browser session is used.
 */
export async function GET(request: Request): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Response>((resolve) => { timer = setTimeout(() => resolve(answer('service_unavailable', 503)), portalPhotoDeadlineMs); });
  try {
    return await Promise.race([photoFor(request), deadline]);
  } finally { clearTimeout(timer); }
}

async function photoFor(request: Request): Promise<Response> {
  const config = portalSsoConfig();
  if (!config) return answer('not_found', 404);
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || token.length > 4096) return answer('unauthenticated', 401);
  const database = getSharedDatabase();
  if (!database || !attachmentsEnabled()) return answer('service_unavailable', 503);
  let portalRequest: PortalRequest;
  try {
    portalRequest = await portalOidcClient(config).verifyPortalRequest(token, photoRequestType);
  } catch (error) {
    return error instanceof OidcError && error.code === 'UNAVAILABLE' ? answer('service_unavailable', 503) : answer('unauthenticated', 401);
  }
  const identities = new DatabaseExternalIdentityRepository(database);
  // Only an account of the environment BackOffice signs in against counts: a UAT account never finds a PRD link.
  const providerIssuer = (await providerSsoConfig())?.apiUrl;
  const { provider } = portalRequest;
  const link = (provider && provider.issuer === providerIssuer ? await identities.findLink(provider.issuer, provider.subject) : null)
    ?? await identities.findLink(config.issuer, portalRequest.memberId);
  if (!link || !(await identities.isActivePerson(link.personId))) return answer('not_found', 404);
  const photoId = await new HrProfileService(database).photoAttachmentOf(link.personId);
  if (!photoId) return answer('not_found', 404);
  try {
    // Not audited per view, like the photo inside Back Office: it loads with every portal dashboard.
    const { attachment, bytes } = await attachmentService(database).openAttachment({ attachmentId: photoId, actorPersonId: link.personId }, { canDownload: async (_input, file) => file.id === photoId }, { recordDownload: false });
    // Checked again here, not only on upload: the contract promises the portal an image of these types and at most 2 MB.
    if (!profilePhotoContentTypeSchema.safeParse(attachment.contentType).success || bytes.byteLength > MAX_PROFILE_PHOTO_BYTES) return answer('not_found', 404);
    return new Response(new Blob([new Uint8Array(bytes)]), { status: 200, headers: { 'content-type': attachment.contentType, 'content-length': String(bytes.byteLength), 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'NOT_FOUND') return answer('not_found', 404);
    return answer('photo_failed', 500);
  }
}
