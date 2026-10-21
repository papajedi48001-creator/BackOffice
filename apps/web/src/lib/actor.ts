import type { RoomActor } from '@backoffice/contracts';
import { requireAuthorized } from './require-authorized';

// The only place the room module learns who is acting (ADR 0002). SSO will create the same session, so this stays unchanged.
export async function requireActor(request: Request): Promise<RoomActor> {
  const session = await requireAuthorized(request);
  return { personId: session.personId!, roles: session.roles };
}
