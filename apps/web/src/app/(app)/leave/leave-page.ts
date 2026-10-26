import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Session } from '@backoffice/contracts';
import { canManageLeave, fiscalYearOf } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { bangkokToday } from '../../../lib/bangkok-time';
import { getSharedDatabase } from '../../../lib/database';
import { readSession } from '../../../lib/session';

/** The signed-in session for a leave page; a visitor without one is sent to sign in. */
export async function leaveSession(): Promise<(Session & { personId: string }) | null> {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.authenticated || !session.personId) {
    redirect('/');
    return null;
  }
  return session as Session & { personId: string };
}

/** The ปีงบประมาณ in the query string when it is sensible, otherwise the current one in Bangkok. */
export function chosenFiscalYear(value: string | string[] | undefined): number {
  const year = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(year) && year >= 2500 && year <= 2700 ? year : fiscalYearOf(bangkokToday());
}

/** HR leave pages: the session and database, or why the page cannot show (no access, or no database). */
export async function hrLeaveContext(): Promise<{ ok: true; session: Session & { personId: string }; database: Database } | { ok: false; reason: 'none' | 'forbidden' | 'unavailable' }> {
  const session = await leaveSession();
  if (!session) return { ok: false, reason: 'none' };
  if (!canManageLeave(session)) return { ok: false, reason: 'forbidden' };
  const database = getSharedDatabase();
  return database ? { ok: true, session, database } : { ok: false, reason: 'unavailable' };
}
