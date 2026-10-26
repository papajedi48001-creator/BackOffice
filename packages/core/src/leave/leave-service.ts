import { randomUUID } from 'node:crypto';
import { leaveCancelDaysInputSchema, type ApproverSnapshot, leaveRequestInputSchema, type LeaveBalance, type LeaveCancelDaysInput, type LeaveCounting, type LeaveEndHalf, type LeaveErrorCode, type LeaveRequestInput, type LeaveStartHalf, type LeaveWarning } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { ApprovalService, type ActiveDelegationFinder } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { RequestService, type ApproverResolver } from '../workflow/request-service';
import { serviceMonths } from './leave-balance';
import { fiscalYearOf, leaveUnits, monthWarnings, subtractUnits } from './leave-days';
import { LEAVE_MODULE } from './leave-module';
import { LeaveSettingsService, type LeaveType } from './leave-settings-service';
import { activeTravelUnitsOfPerson } from '../official-travel/travel-store';
import { activeUnitsOfPerson, genderAllows, loadBalance, loadHolidaySet, loadPersonContext, type PersonContext } from './leave-store';

/** A ใบลา as filed; half days default to FULL. */
export type LeaveRequestDraft = Omit<LeaveRequestInput, 'startHalf' | 'endHalf'> & { startHalf?: LeaveStartHalf; endHalf?: LeaveEndHalf };
export interface LeavePreview { days: number; balance: LeaveBalance | null; warnings: LeaveWarning[]; medicalCertificateRequired: boolean; error: LeaveErrorCode | null }
export type LeaveResubmitResult = { ok: true; warnings: LeaveWarning[]; medicalCertificateRequired: boolean } | { ok: false; code: LeaveErrorCode };
export type LeaveSubmitResult = { ok: true; requestId: string; reference: string; warnings: LeaveWarning[]; medicalCertificateRequired: boolean } | { ok: false; code: LeaveErrorCode };

interface Evaluation extends LeavePreview { input: LeaveRequestInput; leaveType: LeaveType | null; person: PersonContext | null; fiscalYear: number }

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const monthEnd = (date: string) => new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Files ใบลา as คำขอ of the leave module, after the checks the spec lists, with the person locked so two filings cannot spend the same days. */
export class LeaveService {
  constructor(
    protected readonly database: Database,
    protected readonly approvers: ApproverResolver,
    protected readonly delegations: ActiveDelegationFinder,
    protected readonly createId: () => string = randomUUID
  ) {}

  /** What a ใบลา would take and leave, with the balance counting it as pending. Writes nothing. */
  async preview(personId: string, draft: LeaveRequestDraft): Promise<LeavePreview> {
    const { days, balance, warnings, medicalCertificateRequired, error } = await this.evaluate(this.database, personId, leaveRequestInputSchema.parse(draft));
    return { days, balance, warnings, medicalCertificateRequired, error };
  }

  async submit(personId: string, draft: LeaveRequestDraft): Promise<LeaveSubmitResult> {
    const input = leaveRequestInputSchema.parse(draft);
    return this.withLeaveErrors(() => this.database.transaction(async (database) => {
      await lockPerson(database, personId);
      const evaluation = await this.evaluate(database, personId, input);
      if (evaluation.error) return { ok: false as const, code: evaluation.error };
      const { leaveType, person } = evaluation as Evaluation & { leaveType: LeaveType; person: PersonContext & { organizationId: string } };
      const request = await new RequestService(new DatabaseWorkflowRepository(database), this.approvers, this.createId).submitRequest({ moduleCode: LEAVE_MODULE, requestorPersonId: personId, organizationSnapshot: { organizationId: person.organizationId }, target: leaveType.approvalTarget });
      await database.execute('INSERT INTO leave_request (request_id, person_id, leave_type_id, fiscal_year, start_date, end_date, start_half, end_half, days, reason, contact_during_leave, attachment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [request.id, personId, leaveType.id, evaluation.fiscalYear, input.startDate, input.endDate, input.startHalf, input.endHalf, evaluation.days, input.reason, input.contactDuringLeave ?? null]);
      await this.audit(database, 'leave.request.submitted', request.id, personId, { leaveTypeCode: leaveType.code, days: evaluation.days, fiscalYear: evaluation.fiscalYear, startDate: input.startDate, endDate: input.endDate });
      return { ok: true as const, requestId: request.id, reference: request.reference, warnings: evaluation.warnings, medicalCertificateRequired: evaluation.medicalCertificateRequired };
    }, { isolationLevel: 'READ COMMITTED' }));
  }

  /** Files the edited dates of a RETURNED ใบลา and sends it up a freshly resolved chain. */
  async resubmit(personId: string, requestId: string, draft: LeaveRequestDraft): Promise<LeaveResubmitResult> {
    const input = leaveRequestInputSchema.parse(draft);
    return this.withLeaveErrors(() => this.database.transaction(async (database) => {
      const repository = new DatabaseWorkflowRepository(database);
      const request = await repository.getRequestForUpdate(requestId);
      if (!request || request.moduleCode !== LEAVE_MODULE || request.requestorPersonId !== personId || !await isLeaveRequest(database, requestId)) return { ok: false as const, code: 'NOT_FOUND' as const };
      if (request.status !== 'RETURNED') return { ok: false as const, code: 'NOT_RETURNED' as const };
      await lockPerson(database, personId);
      const evaluation = await this.evaluate(database, personId, input, requestId);
      if (evaluation.error) return { ok: false as const, code: evaluation.error };
      const leaveType = evaluation.leaveType!;
      await database.execute('UPDATE leave_request SET leave_type_id = ?, fiscal_year = ?, start_date = ?, end_date = ?, start_half = ?, end_half = ?, days = ?, reason = ?, contact_during_leave = ?, updated_at = UTC_TIMESTAMP() WHERE request_id = ?', [leaveType.id, evaluation.fiscalYear, input.startDate, input.endDate, input.startHalf, input.endHalf, evaluation.days, input.reason, input.contactDuringLeave ?? null, requestId]);
      await new RequestService(repository, this.approvers, this.createId).resubmitRequest({ requestId, actorPersonId: personId, target: leaveType.approvalTarget });
      await this.audit(database, 'leave.request.resubmitted', requestId, personId, { leaveTypeCode: leaveType.code, days: evaluation.days, fiscalYear: evaluation.fiscalYear, startDate: input.startDate, endDate: input.endDate });
      return { ok: true as const, warnings: evaluation.warnings, medicalCertificateRequired: evaluation.medicalCertificateRequired };
    }, { isolationLevel: 'READ COMMITTED' }));
  }

  /** Withdraws an IN_REVIEW or RETURNED ใบลา (or ขอยกเลิกวันลา); no approval is needed. */
  async cancelPending(personId: string, requestId: string, reason: string): Promise<{ ok: true } | { ok: false; code: 'NOT_FOUND' | 'NOT_PENDING' }> {
    const request = await new DatabaseWorkflowRepository(this.database).getRequest(requestId);
    if (!request || request.moduleCode !== LEAVE_MODULE || request.requestorPersonId !== personId) return { ok: false, code: 'NOT_FOUND' };
    try {
      await new RequestService(new DatabaseWorkflowRepository(this.database), this.approvers, this.createId).cancelRequest({ requestId, actorPersonId: personId, reason });
      return { ok: true };
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'REQUEST_NOT_CANCELLABLE') return { ok: false, code: 'NOT_PENDING' };
      if (code === 'REQUEST_NOT_FOUND' || code === 'NOT_REQUESTOR') return { ok: false, code: 'NOT_FOUND' };
      throw error;
    }
  }

  /** ขอยกเลิกวันลา: part or all of an APPROVED ใบลา goes back to the person who approved its last step (the delegator when a ผู้แทน acted). */
  async requestCancelDays(personId: string, requestId: string, draft: CancelDaysDraft): Promise<{ ok: true; requestId: string } | { ok: false; code: LeaveErrorCode }> {
    const input = leaveCancelDaysInputSchema.parse(draft);
    return this.withLeaveErrors(() => this.database.transaction(async (database) => {
      const repository = new DatabaseWorkflowRepository(database);
      const original = await repository.getRequestForUpdate(requestId);
      if (!original || original.moduleCode !== LEAVE_MODULE || original.requestorPersonId !== personId) return { ok: false as const, code: 'NOT_FOUND' as const };
      const checked = await this.checkCancelDays(database, repository, personId, requestId, original.status, input);
      if (!checked.ok) return checked;
      const submitted = await new RequestService(repository, this.approvers, this.createId).submitRequest({ moduleCode: LEAVE_MODULE, requestorPersonId: personId, organizationSnapshot: original.organizationSnapshot }, { approvers: [checked.approver] });
      await database.execute('INSERT INTO leave_cancellation (request_id, leave_request_id, start_date, end_date, start_half, end_half, days, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())', [submitted.id, requestId, input.startDate, input.endDate, input.startHalf, input.endHalf, checked.days, input.reason]);
      await this.audit(database, 'leave.cancel_days.submitted', submitted.id, personId, { leaveTypeCode: checked.leaveTypeCode, days: checked.days, fiscalYear: checked.fiscalYear, startDate: input.startDate, endDate: input.endDate });
      return { ok: true as const, requestId: submitted.id };
    }, { isolationLevel: 'READ COMMITTED' }));
  }

  /** Edits the range of a RETURNED ขอยกเลิกวันลา and sends it back to the same approver, after the checks of a new one. */
  async resubmitCancelDays(personId: string, requestId: string, draft: CancelDaysDraft): Promise<{ ok: true } | { ok: false; code: LeaveErrorCode }> {
    const input = leaveCancelDaysInputSchema.parse(draft);
    return this.withLeaveErrors(() => this.database.transaction(async (database) => {
      const repository = new DatabaseWorkflowRepository(database);
      const request = await repository.getRequestForUpdate(requestId);
      const [link] = await database.query<{ leaveRequestId: string }>('SELECT leave_request_id AS leaveRequestId FROM leave_cancellation WHERE request_id = ?', [requestId]);
      if (!request || !link || request.moduleCode !== LEAVE_MODULE || request.requestorPersonId !== personId) return { ok: false as const, code: 'NOT_FOUND' as const };
      if (request.status !== 'RETURNED') return { ok: false as const, code: 'NOT_RETURNED' as const };
      const original = await repository.getRequestForUpdate(link.leaveRequestId);
      if (!original) return { ok: false as const, code: 'NOT_FOUND' as const };
      const checked = await this.checkCancelDays(database, repository, personId, link.leaveRequestId, original.status, input, requestId);
      if (!checked.ok) return checked;
      await database.execute('UPDATE leave_cancellation SET start_date = ?, end_date = ?, start_half = ?, end_half = ?, days = ?, reason = ? WHERE request_id = ?', [input.startDate, input.endDate, input.startHalf, input.endHalf, checked.days, input.reason, requestId]);
      await new RequestService(repository, this.approvers, this.createId).resubmitRequest({ requestId, actorPersonId: personId }, { approvers: [checked.approver] });
      await this.audit(database, 'leave.cancel_days.resubmitted', requestId, personId, { leaveTypeCode: checked.leaveTypeCode, days: checked.days, fiscalYear: checked.fiscalYear, startDate: input.startDate, endDate: input.endDate });
      return { ok: true as const };
    }, { isolationLevel: 'READ COMMITTED' }));
  }

  /** The checks of a ขอยกเลิกวันลา against its locked ใบลา; `excludeRequestId` leaves the one being edited out of the overlap. */
  private async checkCancelDays(database: Pick<Database, 'query'>, repository: DatabaseWorkflowRepository, personId: string, leaveRequestId: string, leaveStatus: string, input: LeaveCancelDaysInput, excludeRequestId?: string): Promise<{ ok: true; days: number; leaveTypeCode: string; fiscalYear: number; approver: ApproverSnapshot } | { ok: false; code: LeaveErrorCode }> {
    const [leave] = await database.query<{ counting: LeaveCounting; code: string; fiscalYear: number; startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf }>("SELECT t.counting, t.code, l.fiscal_year AS fiscalYear, DATE_FORMAT(l.start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(l.end_date, '%Y-%m-%d') AS endDate, l.start_half AS startHalf, l.end_half AS endHalf FROM leave_request l JOIN leave_type t ON t.id = l.leave_type_id WHERE l.request_id = ?", [leaveRequestId]);
    if (!leave) return { ok: false, code: 'NOT_FOUND' };
    if (leaveStatus !== 'APPROVED') return { ok: false, code: 'NOT_APPROVED' };
    await lockPerson(database, personId);
    const holidays = await loadHolidaySet(database, leave.startDate, leave.endDate);
    const units = leaveUnits(input, leave.counting, holidays);
    if (units.length === 0) return { ok: false, code: 'NO_LEAVE_DAYS' };
    if (subtractUnits(units, leaveUnits(leave, leave.counting, holidays)).length > 0) return { ok: false, code: 'OUTSIDE_LEAVE' };
    const earlier = await database.query<DayRangeRow>("SELECT DATE_FORMAT(c.start_date, '%Y-%m-%d') AS startDate, DATE_FORMAT(c.end_date, '%Y-%m-%d') AS endDate, c.start_half AS startHalf, c.end_half AS endHalf FROM leave_cancellation c JOIN request r ON r.id = c.request_id WHERE c.leave_request_id = ? AND c.request_id <> ? AND r.status IN ('IN_REVIEW', 'RETURNED', 'APPROVED')", [leaveRequestId, excludeRequestId ?? '']);
    const cancelled = new Set(earlier.flatMap((range) => leaveUnits(range, leave.counting, holidays)));
    if (units.some((unit) => cancelled.has(unit))) return { ok: false, code: 'OVERLAPS_CANCELLATION' };
    const lastApproved = (await repository.getSteps(leaveRequestId)).filter((step) => step.status === 'APPROVED').sort((left, right) => right.sequence - left.sequence)[0];
    if (!lastApproved) return { ok: false, code: 'NO_APPROVER' };
    return { ok: true, days: units.length / 2, leaveTypeCode: leave.code, fiscalYear: Number(leave.fiscalYear), approver: lastApproved.assigneeSnapshot };
  }

  /** Approves each leave คำขอ in its own transaction, so one failure never undoes another approval. */
  async approveMany(actorPersonId: string, requestIds: readonly string[]): Promise<Array<{ requestId: string; ok: true } | { requestId: string; ok: false; error: string }>> {
    const results: Array<{ requestId: string; ok: true } | { requestId: string; ok: false; error: string }> = [];
    for (const requestId of requestIds) {
      const request = await new DatabaseWorkflowRepository(this.database).getRequest(requestId);
      if (!request || request.moduleCode !== LEAVE_MODULE) { results.push({ requestId, ok: false, error: 'NOT_FOUND' }); continue; }
      try {
        await new ApprovalService(new DatabaseWorkflowRepository(this.database), this.delegations, this.createId).decideRequest({ requestId, actorPersonId, decision: 'APPROVE' });
        results.push({ requestId, ok: true });
      } catch (error) {
        results.push({ requestId, ok: false, error: error instanceof Error ? error.message : 'UNKNOWN' });
      }
    }
    return results;
  }

  /** Runs every submit check in the spec's order; `excludeRequestId` leaves a ใบลา being edited out of overlap, balance and warnings. */
  protected async evaluate(database: Pick<Database, 'query'>, personId: string, input: LeaveRequestInput, excludeRequestId?: string): Promise<Evaluation> {
    const fiscalYear = fiscalYearOf(input.startDate);
    const result: Evaluation = { input, leaveType: null, person: null, fiscalYear, days: 0, balance: null, warnings: [], medicalCertificateRequired: false, error: null };
    const fail = (error: LeaveErrorCode) => ({ ...result, error });
    const leaveType = (await new LeaveSettingsService(database as Database).listTypes()).find((type) => type.id === input.leaveTypeId);
    if (!leaveType) return fail('NOT_FOUND');
    result.leaveType = leaveType;
    if (!leaveType.isActive) return fail('INACTIVE_LEAVE_TYPE');
    const person = await loadPersonContext(database, personId);
    result.person = person;
    if (!genderAllows(leaveType, person?.gender ?? null)) return fail('NOT_ELIGIBLE');
    if (fiscalYearOf(input.endDate) !== fiscalYear) return fail('CROSSES_FISCAL_YEAR');
    const holidays = await loadHolidaySet(database, monthStart(input.startDate), monthEnd(input.endDate));
    const units = leaveUnits(input, leaveType.counting, holidays);
    result.days = units.length / 2;
    result.medicalCertificateRequired = leaveType.attachmentRequiredFromDays !== null && result.days >= leaveType.attachmentRequiredFromDays;
    if (result.days === 0) return fail('NO_LEAVE_DAYS');
    const entitlementRows = person?.employmentTypeId ? await database.query<{ minServiceMonths: number }>('SELECT min_service_months AS minServiceMonths FROM leave_entitlement WHERE employment_type_id = ? AND leave_type_id = ?', [person.employmentTypeId, leaveType.id]) : [];
    const minServiceMonths = entitlementRows[0] ? Number(entitlementRows[0].minServiceMonths) : null;
    if (minServiceMonths === null) return fail('NO_ENTITLEMENT');
    if (minServiceMonths > 0 && !person?.appointedOn) return fail('APPOINTMENT_DATE_MISSING');
    if (minServiceMonths > 0 && serviceMonths(person!.appointedOn!, input.startDate) < minServiceMonths) return fail('SERVICE_TOO_SHORT');
    const balance = await loadBalance(database, personId, leaveType, fiscalYear, excludeRequestId);
    if (!balance) return fail('NO_ENTITLEMENT');
    result.balance = { ...balance, pending: balance.pending + result.days, remaining: balance.remaining - result.days };
    const otherUnits = await activeUnitsOfPerson(database, personId, monthStart(input.startDate), monthEnd(input.endDate), excludeRequestId);
    result.warnings = monthWarnings({ units, otherUnits, holidays, minimum: await new LeaveSettingsService(database as Database).getMinWorkingDays() });
    if (result.days > balance.remaining) return fail('INSUFFICIENT_BALANCE');
    const taken = new Set(otherUnits);
    if (units.some((unit) => taken.has(unit))) return fail('OVERLAPS_EXISTING_LEAVE');
    const away = new Set(await activeTravelUnitsOfPerson(database, personId, input.startDate, input.endDate));
    if (units.some((unit) => away.has(unit))) return fail('OVERLAPS_OFFICIAL_TRAVEL');
    if (!person?.organizationId) return fail('NO_ORGANIZATION');
    return result;
  }

  protected async withLeaveErrors<T>(work: () => Promise<T>): Promise<T | { ok: false; code: LeaveErrorCode }> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof Error && error.message === 'NO_APPROVER') return { ok: false, code: 'NO_APPROVER' };
      throw error;
    }
  }

  protected audit(database: Pick<Database, 'execute'>, action: string, targetId: string, actorPersonId: string, metadata: Record<string, unknown>): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action, targetType: 'leave_request', targetId, result: 'SUCCESS', metadata });
  }
}

type CancelDaysDraft = Omit<LeaveCancelDaysInput, 'startHalf' | 'endHalf'> & Partial<Pick<LeaveCancelDaysInput, 'startHalf' | 'endHalf'>>;
type DayRangeRow = { startDate: string; endDate: string; startHalf: LeaveStartHalf; endHalf: LeaveEndHalf };

async function isLeaveRequest(database: Pick<Database, 'query'>, requestId: string): Promise<boolean> {
  return (await database.query('SELECT request_id FROM leave_request WHERE request_id = ?', [requestId])).length > 0;
}

/** The first statement of every leave write: it serialises one person's filings so balance checks see each other. */
export async function lockPerson(database: Pick<Database, 'query'>, personId: string): Promise<void> {
  await database.query('SELECT id FROM person WHERE id = ? FOR UPDATE', [personId]);
}
