import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Session } from '@backoffice/contracts';
import { AdminQueries, isAdmin } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from './database';
import { readSession } from './session';

/** Every admin page starts here: signed in, ผู้ดูแลระบบ (checked on the server), and a database. */
export async function adminPage(): Promise<{ ok: true; session: Session & { personId: string }; database: Database; queries: AdminQueries } | { ok: false; reason: 'no_access' | 'unavailable' }> {
  const session = await readSession(new Request('http://localhost', { headers: await headers() }));
  if (!session?.authenticated || !session.personId) redirect('/');
  if (!isAdmin(session)) return { ok: false, reason: 'no_access' };
  const database = getSharedDatabase();
  if (!database) return { ok: false, reason: 'unavailable' };
  return { ok: true, session: session as Session & { personId: string }, database, queries: new AdminQueries(database) };
}
