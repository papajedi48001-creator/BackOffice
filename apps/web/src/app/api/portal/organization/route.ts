import { NextResponse } from 'next/server';
import { DatabaseExternalIdentityRepository, HrProfileService, NationalIdHashMatcher, OidcError, type PortalRequest } from '@backoffice/core';
import { getSharedDatabase } from '../../../../lib/database';
import { getNationalIdProtector } from '../../../../lib/national-id';
import { portalOidcClient, portalSsoConfig, providerSsoConfig } from '../../../../lib/provider-sso';

/** The JWT `typ` the portal puts on a หน่วยงาน request; a photo request or an ID token is never accepted here. */
const organizationRequestType = 'backoffice-organization-request+jwt';

/** The portal waits three seconds while a member signs in; answer before that, with 503 if the work behind it stalls. */
const portalOrganizationDeadlineMs = 2_500;

const answer = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });

/**
 * The portal (radius-server) asks, server to server, which หน่วยงาน a member belongs to while the member fills in the membership
 * application, so it can preselect it. The request is a short-lived JWT the portal signs with its OIDC key, naming the portal member,
 * the member's Provider ID account and, at registration, Provider ID's hash_cid. The บุคลากร is the one linked to that Provider ID
 * account, or else to the portal member, or else the one ACTIVE บุคลากร whose national ID gives that hash_cid. Nothing is linked,
 * stored or audited here, and the hash_cid is only compared. The answer is the หน่วยงาน name and the names above it, and the person's
 * own phone from their ทะเบียนประวัติ (only to prefill their own application; it is not logged), plus `departments`: every หน่วยงาน
 * except the hospital itself, so the portal can sync its department list before anyone applies. The list is given even when
 * nobody matches.
 */
export async function GET(request: Request): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Response>((resolve) => { timer = setTimeout(() => resolve(answer({ error: 'service_unavailable' }, 503)), portalOrganizationDeadlineMs); });
  try {
    return await Promise.race([organizationFor(request), deadline]);
  } finally { clearTimeout(timer); }
}

async function organizationFor(request: Request): Promise<Response> {
  const config = portalSsoConfig();
  if (!config) return answer({ error: 'not_found' }, 404);
  const [scheme, token] = (request.headers.get('authorization') ?? '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || token.length > 4096) return answer({ error: 'unauthenticated' }, 401);
  const database = getSharedDatabase();
  if (!database) return answer({ error: 'service_unavailable' }, 503);
  let portalRequest: PortalRequest;
  try {
    portalRequest = await portalOidcClient(config).verifyPortalRequest(token, organizationRequestType);
  } catch (error) {
    return error instanceof OidcError && error.code === 'UNAVAILABLE' ? answer({ error: 'service_unavailable' }, 503) : answer({ error: 'unauthenticated' }, 401);
  }
  const profiles = new HrProfileService(database);
  const [person, departments] = await Promise.all([personFor(database, config.issuer, portalRequest), profiles.portalDepartmentNames()]);
  const [organizations, phone] = person ? await Promise.all([profiles.currentOrganizationNamesOf(person), profiles.phoneOf(person)]) : [[], null];
  if (organizations.length === 0 && !phone && departments.length === 0) return answer({ error: 'not_found' }, 404);
  return answer({ organizations, phone, departments }, 200);
}

async function personFor(database: NonNullable<ReturnType<typeof getSharedDatabase>>, portalIssuer: string, portalRequest: PortalRequest): Promise<string | null> {
  const identities = new DatabaseExternalIdentityRepository(database);
  const providerIssuer = (await providerSsoConfig())?.apiUrl;
  const { provider, hashCid } = portalRequest;
  const link = (provider && provider.issuer === providerIssuer ? await identities.findLink(provider.issuer, provider.subject) : null)
    ?? await identities.findLink(portalIssuer, portalRequest.memberId);
  if (link && (await identities.isActivePerson(link.personId))) return link.personId;
  if (!hashCid) return null;
  const protector = getNationalIdProtector();
  return protector ? new NationalIdHashMatcher(database, protector).findActivePerson(hashCid) : null;
}
