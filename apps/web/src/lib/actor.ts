import type { RoomActor } from '@backoffice/contracts';
import { requireAuthorized } from './require-authorized';
import { readSession } from './session';

// The only place the room module learns who is acting (ADR 0002). SSO will create the same session, so this stays unchanged.
export async function requireActor(request: Request): Promise<RoomActor> {
  const session = await requireAuthorized(request);
  return { personId: session.personId!, roles: session.roles };
}

/** Server components read the same session through request headers; `null` means the visitor is not signed in. */
export async function pageActor(): Promise<RoomActor | null> {
  const { headers } = await import('next/headers');
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  return session?.authenticated && session.personId ? { personId: session.personId, roles: session.roles } : null;
}
