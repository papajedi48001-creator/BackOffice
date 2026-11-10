import type { AccessSubject, Session } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';
import { attendanceText } from '../../../lib/attendance-labels';
import { leaveSession } from '../leave/leave-page';

export type AttendanceContext = { ok: true; session: Session & { personId: string }; database: Database } | { ok: false; reason: 'none' | 'forbidden' | 'unavailable' };

/** The session and database for a ระบบลงเวลา page whose access rule is `allowed` (checked here, on the server). */
export async function attendanceContext(allowed: (subject: AccessSubject) => boolean): Promise<AttendanceContext> {
  const session = await leaveSession();
  if (!session) return { ok: false, reason: 'none' };
  if (!allowed(session)) return { ok: false, reason: 'forbidden' };
  const database = getSharedDatabase();
  if (!database) return { ok: false, reason: 'unavailable' };
  return { ok: true, session, database };
}

export function AttendancePageMessage({ title, reason }: { title: string; reason: 'none' | 'forbidden' | 'unavailable' }) {
  if (reason === 'none') return null;
  return <section><h2>{title}</h2><p role="alert">{reason === 'forbidden' ? attendanceText.noAccess : attendanceText.loadError}</p></section>;
}
