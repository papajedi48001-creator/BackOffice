import type { CommandChainTarget, LeaveEndHalf, LeaveStartHalf, TravelTypeCode } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { leaveUnits } from '../leave/leave-days';

type Reader = Pick<Database, 'query'>;
const NO_HOLIDAYS: ReadonlySet<string> = new Set();
export const ACTIVE_STATUSES = "('IN_REVIEW', 'RETURNED', 'APPROVED')";

export interface TravelType { code: TravelTypeCode; name: string; approvalTarget: CommandChainTarget; sortOrder: number }

export async function loadTravelTypes(db: Reader): Promise<TravelType[]> {
  const rows = await db.query<TravelType>('SELECT code, name, approval_target AS approvalTarget, sort_order AS sortOrder FROM official_travel_type ORDER BY sort_order');
  return rows.map((row) => ({ ...row, sortOrder: Number(row.sortOrder) }));
}

/** Half-day units a trip takes. Trips count calendar days: a weekend away is still away. */
export const travelUnits = (range: { startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf }) => leaveUnits(range, 'CALENDAR_DAYS', NO_HOLIDAYS);

/** Half-day units the person is away on official travel between two dates, from their IN_REVIEW, RETURNED and APPROVED คำขอ. */
export async function activeTravelUnitsOfPerson(db: Reader, personId: string, from: string, to: string, excludeTravelId?: string): Promise<string[]> {
  const trips = await db.query<{ startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf }>(
    `SELECT DATE_FORMAT(t.start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(t.end_date, '%Y-%m-%d') AS endDate, t.start_half AS startHalf, t.end_half AS endHalf
     FROM official_travel_member m JOIN request r ON r.id = m.request_id JOIN official_travel t ON t.id = m.travel_id
     WHERE m.person_id = ? AND r.status IN ${ACTIVE_STATUSES} AND t.start_date <= ? AND t.end_date >= ? AND t.id <> ?`,
    [personId, to, from, excludeTravelId ?? '']
  );
  return trips.flatMap(travelUnits).filter((unit) => unit.slice(0, 10) >= from && unit.slice(0, 10) <= to);
}
