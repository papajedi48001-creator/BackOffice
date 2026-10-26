import type { Session } from '@backoffice/contracts';
import { canManageTravel } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';
import { leaveSession } from '../leave/leave-page';

/** The signed-in session for a travel page; a visitor without one is sent to sign in. */
export const travelSession = leaveSession;

/** HR travel pages: the session and database, or why the page cannot show (no access, or no database). */
export async function hrTravelContext(): Promise<{ ok: true; session: Session & { personId: string }; database: Database } | { ok: false; reason: 'none' | 'forbidden' | 'unavailable' }> {
  const session = await travelSession();
  if (!session) return { ok: false, reason: 'none' };
  if (!canManageTravel(session)) return { ok: false, reason: 'forbidden' };
  const database = getSharedDatabase();
  return database ? { ok: true, session, database } : { ok: false, reason: 'unavailable' };
}
