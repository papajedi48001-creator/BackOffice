import { randomUUID } from 'node:crypto';
import { leaveRequestInputSchema, type LeaveBalance, type LeaveEndHalf, type LeaveErrorCode, type LeaveRequestInput, type LeaveStartHalf, type LeaveWarning } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import type { ActiveDelegationFinder } from '../workflow/approval-service';
import { DatabaseWorkflowRepository } from '../workflow/database-workflow-repository';
import { RequestService, type ApproverResolver } from '../workflow/request-service';
import { serviceMonths } from './leave-balance';
import { fiscalYearOf, leaveUnits, monthWarnings } from './leave-days';
import { LEAVE_MODULE } from './leave-module';
import { LeaveSettingsService, type LeaveType } from './leave-settings-service';
import { activeUnitsOfPerson, loadBalance, loadHolidaySet, loadPersonContext, type PersonContext } from './leave-store';

/** A ใบลา as filed; half days default to FULL. */
export type LeaveRequestDraft = Omit<LeaveRequestInput, 'startHalf' | 'endHalf'> & { startHalf?: LeaveStartHalf; endHalf?: LeaveEndHalf };
export interface LeavePreview { days: number; balance: LeaveBalance | null; warnings: LeaveWarning[]; medicalCertificateRequired: boolean; error: LeaveErrorCode | null }
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

  /** Runs every submit check in the spec's order; `excludeRequestId` leaves a ใบลา being edited out of overlap, balance and warnings. */
  protected async evaluate(database: Pick<Database, 'query'>, personId: string, input: LeaveRequestInput, excludeRequestId?: string): Promise<Evaluation> {
    const fiscalYear = fiscalYearOf(input.startDate);
    const result: Evaluation = { input, leaveType: null, person: null, fiscalYear, days: 0, balance: null, warnings: [], medicalCertificateRequired: false, error: null };
    const fail = (error: LeaveErrorCode) => ({ ...result, error });
    const leaveType = (await new LeaveSettingsService(database as Database).listTypes()).find((type) => type.id === input.leaveTypeId);
    if (!leaveType) return fail('NOT_FOUND');
    result.leaveType = leaveType;
    if (!leaveType.isActive) return fail('INACTIVE_LEAVE_TYPE');
    if (fiscalYearOf(input.endDate) !== fiscalYear) return fail('CROSSES_FISCAL_YEAR');
    const holidays = await loadHolidaySet(database, monthStart(input.startDate), monthEnd(input.endDate));
    const units = leaveUnits(input, leaveType.counting, holidays);
    result.days = units.length / 2;
    result.medicalCertificateRequired = leaveType.attachmentRequiredFromDays !== null && result.days >= leaveType.attachmentRequiredFromDays;
    if (result.days === 0) return fail('NO_LEAVE_DAYS');
    const person = await loadPersonContext(database, personId);
    result.person = person;
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

/** The first statement of every leave write: it serialises one person's filings so balance checks see each other. */
export async function lockPerson(database: Pick<Database, 'query'>, personId: string): Promise<void> {
  await database.query('SELECT id FROM person WHERE id = ? FOR UPDATE', [personId]);
}
