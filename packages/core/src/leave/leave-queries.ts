import type { AccessSubject, LeaveBalance, LeaveEndHalf, LeaveStartHalf, LeaveWarning, RequestStatus } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canManageLeave } from './leave-access';
import { leaveUnits, monthWarnings } from './leave-days';
import { LEAVE_MODULE } from './leave-module';
import { LeaveSettingsService, type LeaveType } from './leave-settings-service';
import { activeUnitsOfPerson, loadBalance, loadHolidaySet } from './leave-store';

const LIST_LIMIT = 1000;

export interface LeaveListItem { requestId: string; reference: string; kind: 'LEAVE' | 'CANCEL_DAYS'; leaveTypeName: string; startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf; days: number; status: RequestStatus; submittedAt: string | null; personDisplayName: string | null; organizationName: string | null }
export interface LeaveStepView { sequence: number; assigneeDisplayName: string | null; status: string; decidedAt: string | null; decisionReason: string | null }
export interface LeaveDetail extends LeaveListItem { leaveTypeId: string; reason: string; contactDuringLeave: string | null; medicalCertificateRequired: boolean; warnings: LeaveWarning[]; steps: LeaveStepView[]; cancellations: LeaveListItem[]; canDecide: boolean; canCancel: boolean; canRequestCancelDays: boolean }
export interface TeamCalendarRow { personId: string; displayName: string | null; organizationName: string | null; days: Array<{ date: string; part: 'FULL' | 'MORNING' | 'AFTERNOON' }> }
export interface LeaveFilter { organizationId?: string; from?: string; to?: string; leaveTypeId?: string; status?: RequestStatus }

type Reader = Pick<Database, 'query'>;
interface ItemRow extends Omit<LeaveListItem, 'days'> { days: string; personId: string; organizationId: string | null; leaveTypeId: string; leaveRequestId: string; fiscalYear: number; counting: 'WORKING_DAYS' | 'CALENDAR_DAYS'; attachmentFrom: string | null; reason: string; contactDuringLeave: string | null }

const date = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%d')`;
const instant = (column: string) => `DATE_FORMAT(${column}, '%Y-%m-%dT%H:%i:%sZ')`;
const ACTIVE = new Set(['IN_REVIEW', 'RETURNED', 'APPROVED']);
// Every ใบลา and ขอยกเลิกวันลา as one row shape; a cancellation carries its own dates and the type of the ใบลา it cancels.
const ITEMS = `(
  SELECT l.request_id AS requestId, r.reference, 'LEAVE' AS kind, t.id AS leaveTypeId, t.name AS leaveTypeName, t.counting, CAST(t.attachment_required_from_days AS CHAR) AS attachmentFrom, ${date('l.start_date')} AS startDate, ${date('l.end_date')} AS endDate, l.start_half AS startHalf, l.end_half AS endHalf, CAST(l.days AS CHAR) AS days, r.status, ${instant('r.submitted_at')} AS submittedAt, l.person_id AS personId, p.display_name AS personDisplayName, o.id AS organizationId, o.name AS organizationName, l.request_id AS leaveRequestId, l.fiscal_year AS fiscalYear, l.reason, l.contact_during_leave AS contactDuringLeave
  FROM leave_request l JOIN request r ON r.id = l.request_id JOIN leave_type t ON t.id = l.leave_type_id JOIN person p ON p.id = l.person_id LEFT JOIN organization o ON o.id = JSON_VALUE(r.organization_snapshot, '$.organizationId')
  UNION ALL
  SELECT c.request_id, r.reference, 'CANCEL_DAYS', t.id, t.name, t.counting, NULL, ${date('c.start_date')}, ${date('c.end_date')}, c.start_half, c.end_half, CAST(c.days AS CHAR), r.status, ${instant('r.submitted_at')}, l.person_id, p.display_name, o.id, o.name, l.request_id, l.fiscal_year, c.reason, NULL
  FROM leave_cancellation c JOIN request r ON r.id = c.request_id JOIN leave_request l ON l.request_id = c.leave_request_id JOIN leave_type t ON t.id = l.leave_type_id JOIN person p ON p.id = l.person_id LEFT JOIN organization o ON o.id = JSON_VALUE(r.organization_snapshot, '$.organizationId')
) items`;
const ACTIVE_DELEGATORS = "SELECT delegator_person_id FROM delegation WHERE delegate_person_id = ? AND module_code = 'leave' AND effective_from <= UTC_TIMESTAMP() AND effective_until > UTC_TIMESTAMP()";
const toItem = (row: ItemRow): LeaveListItem => ({ requestId: row.requestId, reference: row.reference, kind: row.kind, leaveTypeName: row.leaveTypeName, startDate: row.startDate, endDate: row.endDate, startHalf: row.startHalf, endHalf: row.endHalf, days: Number(row.days), status: row.status, submittedAt: row.submittedAt, personDisplayName: row.personDisplayName, organizationName: row.organizationName });
const monthStart = (value: string) => `${value.slice(0, 7)}-01`;
const monthEnd = (value: string) => new Date(Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Reads for the leave screens. Who may see a ใบลา is decided here, on the server, for every read. */
export class LeaveQueries {
  constructor(private readonly database: Reader) {}

  async balances(personId: string, fiscalYear: number): Promise<Array<{ leaveType: LeaveType; balance: LeaveBalance }>> {
    const types = await new LeaveSettingsService(this.database as Database).listTypes({ activeOnly: true });
    const rows = await Promise.all(types.map(async (leaveType) => ({ leaveType, balance: await loadBalance(this.database, personId, leaveType, fiscalYear) })));
    return rows.filter((row): row is { leaveType: LeaveType; balance: LeaveBalance } => row.balance !== null);
  }

  async myLeave(personId: string, fiscalYear: number): Promise<LeaveListItem[]> {
    return (await this.items('personId = ? AND fiscalYear = ?', [personId, fiscalYear])).map(toItem);
  }

  async detail(requestId: string, viewer: AccessSubject): Promise<LeaveDetail | null> {
    const [row] = await this.items('requestId = ?', [requestId]);
    if (!row || !viewer.authenticated || !viewer.personId) return null;
    const steps = await this.database.query<{ id: string; sequence: string; assigneeId: string; assigneeDisplayName: string | null; status: string; decidedAt: string | null; decisionReason: string | null }>(
      `SELECT s.id, s.sequence, JSON_VALUE(s.assignee_snapshot, '$.personId') AS assigneeId, p.display_name AS assigneeDisplayName, s.status, ${instant('d.created_at')} AS decidedAt, d.reason AS decisionReason FROM approval_step s LEFT JOIN person p ON p.id = JSON_VALUE(s.assignee_snapshot, '$.personId') LEFT JOIN approval_decision d ON d.approval_step_id = s.id WHERE s.request_id = ? ORDER BY CAST(s.sequence AS UNSIGNED)`, [requestId]
    );
    const current = row.status === 'IN_REVIEW' ? steps.find((step) => step.status === 'PENDING') : undefined;
    const delegators = new Set((await this.database.query<{ id: string }>(`SELECT delegator_person_id AS id FROM delegation WHERE delegate_person_id = ? AND module_code = '${LEAVE_MODULE}' AND effective_from <= UTC_TIMESTAMP() AND effective_until > UTC_TIMESTAMP()`, [viewer.personId])).map((delegation) => delegation.id));
    const self = row.personId === viewer.personId;
    const approver = steps.some((step) => step.assigneeId === viewer.personId);
    const delegate = steps.some((step) => step.status === 'PENDING' && delegators.has(step.assigneeId));
    if (!self && !approver && !delegate && !canManageLeave(viewer)) return null;
    const leave = row.kind === 'LEAVE';
    const days = Number(row.days);
    return {
      ...toItem(row),
      leaveTypeId: row.leaveTypeId,
      reason: row.reason,
      contactDuringLeave: row.contactDuringLeave,
      medicalCertificateRequired: leave && row.attachmentFrom !== null && days >= Number(row.attachmentFrom),
      warnings: leave && ACTIVE.has(row.status) ? await this.warningsOf(row) : [],
      steps: steps.map((step) => ({ sequence: Number(step.sequence), assigneeDisplayName: step.assigneeDisplayName, status: step.status, decidedAt: step.decidedAt, decisionReason: step.decisionReason })),
      cancellations: leave ? (await this.items("kind = 'CANCEL_DAYS' AND leaveRequestId = ?", [requestId])).map(toItem) : [],
      canDecide: !self && current !== undefined && (current.assigneeId === viewer.personId || delegators.has(current.assigneeId)),
      canCancel: self && (row.status === 'IN_REVIEW' || row.status === 'RETURNED'),
      canRequestCancelDays: self && leave && row.status === 'APPROVED'
    };
  }

  /** ใบลา and ขอยกเลิกวันลา whose current step waits on the person, directly or as a ผู้แทน. */
  async pendingForApprover(personId: string): Promise<Array<LeaveListItem & { warnings: LeaveWarning[]; medicalCertificateRequired: boolean }>> {
    const ids = await this.pendingIds(personId);
    if (ids.length === 0) return [];
    const rows = await this.items('requestId IN (?)', [ids]);
    return Promise.all(rows.map(async (row) => ({ ...toItem(row), warnings: row.kind === 'LEAVE' ? await this.warningsOf(row) : [], medicalCertificateRequired: row.kind === 'LEAVE' && row.attachmentFrom !== null && Number(row.days) >= Number(row.attachmentFrom) })));
  }

  async pendingCount(personId: string): Promise<number> {
    return (await this.pendingIds(personId)).length;
  }

  /** Units the person heads now, with every unit below them. */
  async headedOrganizationIds(personId: string, at: Date = new Date()): Promise<string[]> {
    const instantText = at.toISOString().slice(0, 19).replace('T', ' ');
    const headed = await this.database.query<{ id: string }>('SELECT organization_id AS id FROM hr_organization_head WHERE person_id = ? AND effective_from <= ? AND (effective_until IS NULL OR effective_until > ?)', [personId, instantText, instantText]);
    if (headed.length === 0) return [];
    const units = await this.database.query<{ id: string; parentId: string | null }>('SELECT id, parent_id AS parentId FROM organization');
    const found = new Set(headed.map((row) => row.id));
    for (let grew = true; grew;) {
      grew = false;
      for (const unit of units) if (unit.parentId && found.has(unit.parentId) && !found.has(unit.id)) { found.add(unit.id); grew = true; }
    }
    return [...found];
  }

  /** Who is away on which half days of a month, for the units the viewer heads. Never says why or which type. */
  async teamCalendar(viewerPersonId: string, month: string): Promise<TeamCalendarRow[]> {
    const organizationIds = await this.headedOrganizationIds(viewerPersonId);
    if (organizationIds.length === 0) return [];
    const from = monthStart(`${month}-01`);
    const to = monthEnd(`${month}-01`);
    const people = await this.database.query<{ personId: string; displayName: string | null; organizationName: string | null }>(
      "SELECT DISTINCT l.person_id AS personId, p.display_name AS displayName, o.name AS organizationName FROM leave_request l JOIN request r ON r.id = l.request_id JOIN person p ON p.id = l.person_id JOIN employment_assignment ea ON ea.person_id = l.person_id AND ea.effective_until IS NULL JOIN organization o ON o.id = ea.organization_id WHERE ea.organization_id IN (?) AND r.status IN ('IN_REVIEW', 'RETURNED', 'APPROVED') AND l.start_date <= ? AND l.end_date >= ? ORDER BY p.display_name",
      [organizationIds, to, from]
    );
    const rows = await Promise.all(people.map(async (person) => {
      const units = new Set(await activeUnitsOfPerson(this.database, person.personId, from, to));
      const dates = [...new Set([...units].map((unit) => unit.slice(0, 10)))].sort();
      const days = dates.map((day) => ({ date: day, part: units.has(`${day}:AM`) && units.has(`${day}:PM`) ? 'FULL' as const : units.has(`${day}:AM`) ? 'MORNING' as const : 'AFTERNOON' as const }));
      return { personId: person.personId, displayName: person.displayName, organizationName: person.organizationName, days };
    }));
    return rows.filter((row) => row.days.length > 0);
  }

  /** HR's list. The page keeps the default cap; the CSV export passes `limit: null` so no row is dropped. */
  async allLeave(filter: LeaveFilter, options: { limit?: number | null } = {}): Promise<LeaveListItem[]> {
    const clauses: string[] = ['1 = 1'];
    const parameters: unknown[] = [];
    if (filter.organizationId) { clauses.push('organizationId = ?'); parameters.push(filter.organizationId); }
    if (filter.from) { clauses.push('endDate >= ?'); parameters.push(filter.from); }
    if (filter.to) { clauses.push('startDate <= ?'); parameters.push(filter.to); }
    if (filter.leaveTypeId) { clauses.push('leaveTypeId = ?'); parameters.push(filter.leaveTypeId); }
    if (filter.status) { clauses.push('status = ?'); parameters.push(filter.status); }
    return (await this.items(clauses.join(' AND '), parameters, options.limit === undefined ? LIST_LIMIT : options.limit)).map(toItem);
  }

  private items(where: string, parameters: unknown[], limit: number | null = LIST_LIMIT): Promise<ItemRow[]> {
    const capped = limit === null ? '' : ` LIMIT ${Math.max(Math.floor(limit), 0)}`;
    return this.database.query<ItemRow>(`SELECT * FROM ${ITEMS} WHERE ${where} ORDER BY startDate DESC, submittedAt DESC${capped}`, parameters as never);
  }

  private async pendingIds(personId: string): Promise<string[]> {
    const rows = await this.database.query<{ requestId: string }>(
      `SELECT s.request_id AS requestId FROM approval_step s JOIN request r ON r.id = s.request_id
       WHERE r.module_code = '${LEAVE_MODULE}' AND r.status = 'IN_REVIEW' AND s.status = 'PENDING' AND r.requestor_person_id <> ?
         AND CAST(s.sequence AS UNSIGNED) = (SELECT MIN(CAST(s2.sequence AS UNSIGNED)) FROM approval_step s2 WHERE s2.request_id = s.request_id AND s2.status = 'PENDING')
         AND (JSON_VALUE(s.assignee_snapshot, '$.personId') = ? OR JSON_VALUE(s.assignee_snapshot, '$.personId') IN (${ACTIVE_DELEGATORS}))`,
      [personId, personId, personId]
    );
    return rows.map((row) => row.requestId);
  }

  private async warningsOf(row: ItemRow): Promise<LeaveWarning[]> {
    const from = monthStart(row.startDate);
    const to = monthEnd(row.endDate);
    const holidays = await loadHolidaySet(this.database, from, to);
    const units = leaveUnits(row, row.counting, holidays);
    const otherUnits = await activeUnitsOfPerson(this.database, row.personId, from, to, row.requestId);
    return monthWarnings({ units, otherUnits, holidays, minimum: await new LeaveSettingsService(this.database as Database).getMinWorkingDays() });
  }
}
