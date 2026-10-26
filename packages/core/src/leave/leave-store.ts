import type { LeaveBalance, LeaveCounting, LeaveEndHalf, LeaveStartHalf } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { computeBalance, type Entitlement } from './leave-balance';
import { leaveUnits, subtractUnits } from './leave-days';
import { toEntitlement, type LeaveType } from './leave-settings-service';

type Reader = Pick<Database, 'query'>;
const ACTIVE_STATUSES = "('IN_REVIEW', 'RETURNED', 'APPROVED')";
const dateColumn = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d')`;

export interface PersonContext { organizationId: string | null; employmentTypeId: string | null; appointedOn: string | null }

/** The person's current unit (from the open employment record), ประเภทการจ้าง and วันบรรจุ; null for an unknown person. */
export async function loadPersonContext(db: Reader, personId: string): Promise<PersonContext | null> {
  const [row] = await db.query<PersonContext>(`SELECT (SELECT organization_id FROM employment_assignment WHERE person_id = p.id AND effective_until IS NULL ORDER BY effective_from DESC LIMIT 1) AS organizationId, hp.employment_type_id AS employmentTypeId, ${dateColumn('hp.appointed_on')} AS appointedOn FROM person p LEFT JOIN hr_person_profile hp ON hp.person_id = p.id WHERE p.id = ?`, [personId]);
  return row ?? null;
}

export async function loadHolidaySet(db: Reader, from: string, to: string): Promise<Set<string>> {
  const rows = await db.query<{ date: string }>(`SELECT ${dateColumn('holiday_date')} AS date FROM leave_holiday WHERE holiday_date BETWEEN ? AND ?`, [from, to]);
  return new Set(rows.map((row) => row.date));
}

export async function loadEntitlement(db: Reader, employmentTypeId: string, leaveTypeId: string): Promise<Entitlement | null> {
  const [row] = await db.query<Parameters<typeof toEntitlement>[0]>('SELECT employment_type_id AS employmentTypeId, leave_type_id AS leaveTypeId, CAST(days_per_year AS CHAR) AS daysPerYear, CAST(first_year_days AS CHAR) AS firstYearDays, CAST(max_accumulated_days AS CHAR) AS maxAccumulatedDays, CAST(max_accumulated_days_after_10_years AS CHAR) AS maxAccumulatedDaysAfter10Years, min_service_months AS minServiceMonths FROM leave_entitlement WHERE employment_type_id = ? AND leave_type_id = ?', [employmentTypeId, leaveTypeId]);
  return row ? toEntitlement(row) : null;
}

/** ยอดวันลาคงเหลือ of one ประเภทการลา in one ปีงบประมาณ; null when the person's ประเภทการจ้าง has no สิทธิ์การลา for it. */
export async function loadBalance(db: Reader, personId: string, leaveType: Pick<LeaveType, 'id' | 'code'>, fiscalYear: number, excludeRequestId?: string): Promise<LeaveBalance | null> {
  const person = await loadPersonContext(db, personId);
  if (!person?.employmentTypeId) return null;
  const entitlement = await loadEntitlement(db, person.employmentTypeId, leaveType.id);
  if (!entitlement) return null;
  return balanceOfYear(db, personId, leaveType, entitlement, person.appointedOn, fiscalYear, 0, excludeRequestId ?? '');
}

async function balanceOfYear(db: Reader, personId: string, leaveType: Pick<LeaveType, 'id' | 'code'>, entitlement: Entitlement, appointedOn: string | null, fiscalYear: number, depth: number, excludeRequestId: string): Promise<LeaveBalance> {
  const [opening] = await db.query<{ carriedDays: string; usedDays: string }>('SELECT CAST(carried_days AS CHAR) AS carriedDays, CAST(used_days AS CHAR) AS usedDays FROM leave_opening_balance WHERE person_id = ? AND fiscal_year = ? AND leave_type_id = ?', [personId, fiscalYear, leaveType.id]);
  const [sums] = await db.query<{ approved: string | null; pending: string | null; cancelled: string | null }>(
    `SELECT CAST(SUM(CASE WHEN r.status = 'APPROVED' THEN l.days END) AS CHAR) AS approved, CAST(SUM(CASE WHEN r.status IN ('IN_REVIEW', 'RETURNED') THEN l.days END) AS CHAR) AS pending,
      (SELECT CAST(SUM(c.days) AS CHAR) FROM leave_cancellation c JOIN request cr ON cr.id = c.request_id JOIN leave_request cl ON cl.request_id = c.leave_request_id WHERE cr.status = 'APPROVED' AND cl.person_id = ? AND cl.fiscal_year = ? AND cl.leave_type_id = ?) AS cancelled
     FROM leave_request l JOIN request r ON r.id = l.request_id WHERE l.person_id = ? AND l.fiscal_year = ? AND l.leave_type_id = ? AND l.request_id <> ?`,
    [personId, fiscalYear, leaveType.id, personId, fiscalYear, leaveType.id, excludeRequestId]
  );
  const carries = leaveType.code === 'VACATION';
  let previousYearRemaining: number | null = null;
  // The previous year counts only when it holds data; a person's history before go-live comes from HR's opening balances.
  if (carries && !opening && depth < 10 && await hasYearData(db, personId, leaveType.id, fiscalYear - 1)) {
    previousYearRemaining = (await balanceOfYear(db, personId, leaveType, entitlement, appointedOn, fiscalYear - 1, depth + 1, excludeRequestId)).remaining;
  }
  return computeBalance({
    carries, entitlement, fiscalYear, appointedOn,
    opening: opening ? { carriedDays: Number(opening.carriedDays), usedDays: Number(opening.usedDays) } : null,
    approvedDays: Number(sums?.approved ?? 0), cancelledDays: Number(sums?.cancelled ?? 0), pendingDays: Number(sums?.pending ?? 0), previousYearRemaining
  });
}

async function hasYearData(db: Reader, personId: string, leaveTypeId: string, fiscalYear: number): Promise<boolean> {
  const rows = await db.query<{ found: number }>('SELECT 1 AS found FROM leave_opening_balance WHERE person_id = ? AND fiscal_year = ? AND leave_type_id = ? UNION ALL SELECT 1 FROM leave_request WHERE person_id = ? AND fiscal_year = ? AND leave_type_id = ? LIMIT 1', [personId, fiscalYear, leaveTypeId, personId, fiscalYear, leaveTypeId]);
  return rows.length > 0;
}

interface StoredRange { requestId: string; counting: LeaveCounting; startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf }

/** Half-day units the person is already on leave for between two dates: IN_REVIEW, RETURNED and APPROVED ใบลา, less APPROVED ขอยกเลิกวันลา. */
export async function activeUnitsOfPerson(db: Reader, personId: string, from: string, to: string, excludeRequestId?: string): Promise<string[]> {
  const leaves = await db.query<StoredRange>(`SELECT l.request_id AS requestId, t.counting, ${dateColumn('l.start_date')} AS startDate, ${dateColumn('l.end_date')} AS endDate, l.start_half AS startHalf, l.end_half AS endHalf FROM leave_request l JOIN request r ON r.id = l.request_id JOIN leave_type t ON t.id = l.leave_type_id WHERE l.person_id = ? AND r.status IN ${ACTIVE_STATUSES} AND l.start_date <= ? AND l.end_date >= ? AND l.request_id <> ?`, [personId, to, from, excludeRequestId ?? '']);
  if (leaves.length === 0) return [];
  const cancellations = await db.query<StoredRange>(`SELECT c.leave_request_id AS requestId, t.counting, ${dateColumn('c.start_date')} AS startDate, ${dateColumn('c.end_date')} AS endDate, c.start_half AS startHalf, c.end_half AS endHalf FROM leave_cancellation c JOIN request cr ON cr.id = c.request_id JOIN leave_request l ON l.request_id = c.leave_request_id JOIN leave_type t ON t.id = l.leave_type_id WHERE cr.status = 'APPROVED' AND c.leave_request_id IN (?)`, [leaves.map((leave) => leave.requestId)]);
  const earliest = leaves.reduce((low, leave) => (leave.startDate < low ? leave.startDate : low), from);
  const latest = leaves.reduce((high, leave) => (leave.endDate > high ? leave.endDate : high), to);
  const holidays = await loadHolidaySet(db, earliest, latest);
  return leaves.flatMap((leave) => subtractUnits(
    leaveUnits(leave, leave.counting, holidays),
    cancellations.filter((cancellation) => cancellation.requestId === leave.requestId).flatMap((cancellation) => leaveUnits(cancellation, cancellation.counting, holidays))
  )).filter((unit) => unit.slice(0, 10) >= from && unit.slice(0, 10) <= to);
}
