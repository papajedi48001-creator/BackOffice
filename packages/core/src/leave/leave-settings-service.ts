import { randomUUID } from 'node:crypto';
import { leaveEntitlementInputSchema, leaveHolidayInputSchema, leaveSettingInputSchema, leaveTypeCreateInputSchema, leaveTypeInputSchema, type CommandChainTarget, type Gender, type LeaveCounting, type LeaveEntitlementInput, type LeaveHolidayInput, type LeaveSettingInput, type LeaveTypeCreateInput, type LeaveTypeInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import type { Entitlement } from './leave-balance';

export interface LeaveType { id: string; code: string; name: string; counting: LeaveCounting; approvalTarget: CommandChainTarget; attachmentRequiredFromDays: number | null; eligibleGender: Gender | null; isActive: boolean; sortOrder: number }
export type LeaveEntitlementRow = { employmentTypeId: string; leaveTypeId: string } & Entitlement;
type Failure<Code extends string> = { ok: false; code: Code };
type DuplicateCode = 'DUPLICATE_CODE' | 'DUPLICATE_NAME';

const typeFields = ['name', 'counting', 'approvalTarget', 'attachmentRequiredFromDays', 'eligibleGender', 'isActive', 'sortOrder'] as const;
const entitlementFields = ['daysPerYear', 'firstYearDays', 'maxAccumulatedDays', 'maxAccumulatedDaysAfter10Years', 'minServiceMonths'] as const;
const typeColumns = "id, code, name, counting, approval_target AS approvalTarget, CAST(attachment_required_from_days AS CHAR) AS attachmentRequiredFromDays, eligible_gender AS eligibleGender, is_active AS isActive, sort_order AS sortOrder";
const entitlementColumns = 'employment_type_id AS employmentTypeId, leave_type_id AS leaveTypeId, CAST(days_per_year AS CHAR) AS daysPerYear, CAST(first_year_days AS CHAR) AS firstYearDays, CAST(max_accumulated_days AS CHAR) AS maxAccumulatedDays, CAST(max_accumulated_days_after_10_years AS CHAR) AS maxAccumulatedDaysAfter10Years, min_service_months AS minServiceMonths';
const decimalOrNull = (value: string | null) => (value === null ? null : Number(value));

type TypeRow = Omit<LeaveType, 'attachmentRequiredFromDays' | 'isActive' | 'sortOrder'> & { attachmentRequiredFromDays: string | null; isActive: number; sortOrder: number | string };
const toType = (row: TypeRow): LeaveType => ({ ...row, attachmentRequiredFromDays: decimalOrNull(row.attachmentRequiredFromDays), isActive: Boolean(row.isActive), sortOrder: Number(row.sortOrder) });
type EntitlementRow = { employmentTypeId: string; leaveTypeId: string; daysPerYear: string; firstYearDays: string | null; maxAccumulatedDays: string | null; maxAccumulatedDaysAfter10Years: string | null; minServiceMonths: number | string };
export const toEntitlement = (row: EntitlementRow): LeaveEntitlementRow => ({ employmentTypeId: row.employmentTypeId, leaveTypeId: row.leaveTypeId, daysPerYear: Number(row.daysPerYear), firstYearDays: decimalOrNull(row.firstYearDays), maxAccumulatedDays: decimalOrNull(row.maxAccumulatedDays), maxAccumulatedDaysAfter10Years: decimalOrNull(row.maxAccumulatedDaysAfter10Years), minServiceMonths: Number(row.minServiceMonths) });

/** What HR keeps for leave: ประเภทการลา, สิทธิ์การลา per ประเภทการจ้าง, วันหยุดราชการ and วันทำการขั้นต่ำต่อเดือน. Each save is audited by changed field names only. */
export class LeaveSettingsService {
  constructor(private readonly database: Pick<Database, 'query' | 'transaction'>, private readonly createId: () => string = randomUUID) {}

  async listTypes(options: { activeOnly?: boolean } = {}): Promise<LeaveType[]> {
    const rows = await this.database.query<TypeRow>(`SELECT ${typeColumns} FROM leave_type ${options.activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort_order, name`);
    return rows.map(toType);
  }

  async createType(input: LeaveTypeCreateInput, actorPersonId: string): Promise<{ ok: true; id: string } | Failure<DuplicateCode>> {
    const valid = leaveTypeCreateInputSchema.parse(input);
    const id = this.createId();
    return withDuplicateCheck(() => this.database.transaction(async (database) => {
      await database.execute('INSERT INTO leave_type (id, code, name, counting, approval_target, attachment_required_from_days, eligible_gender, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [id, valid.code, valid.name, valid.counting, valid.approvalTarget, valid.attachmentRequiredFromDays, valid.eligibleGender ?? null, valid.isActive ? 1 : 0, valid.sortOrder]);
      await this.audit(database, 'leave.type.create', 'leave_type', id, actorPersonId, { leaveTypeCode: valid.code, changedFields: ['code', ...typeFields] });
      return { ok: true as const, id };
    }), (message) => (message.includes('leave_type_name_unique') ? 'DUPLICATE_NAME' : 'DUPLICATE_CODE'));
  }

  /** The code is fixed once created; it names the type in CSV files and audit events. */
  async updateType(id: string, input: LeaveTypeInput, actorPersonId: string): Promise<{ ok: true } | Failure<'NOT_FOUND' | DuplicateCode>> {
    const parsed = leaveTypeInputSchema.parse(input);
    return withDuplicateCheck(() => this.database.transaction(async (database) => {
      const [stored] = await database.query<TypeRow>(`SELECT ${typeColumns} FROM leave_type WHERE id = ? FOR UPDATE`, [id]);
      if (!stored) return { ok: false as const, code: 'NOT_FOUND' as const };
      const before = toType(stored);
      const valid = { ...parsed, eligibleGender: parsed.eligibleGender === undefined ? before.eligibleGender : parsed.eligibleGender };
      const changedFields = typeFields.filter((field) => before[field] !== valid[field]);
      if (changedFields.length === 0) return { ok: true as const };
      await database.execute('UPDATE leave_type SET name = ?, counting = ?, approval_target = ?, attachment_required_from_days = ?, eligible_gender = ?, is_active = ?, sort_order = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?', [valid.name, valid.counting, valid.approvalTarget, valid.attachmentRequiredFromDays, valid.eligibleGender, valid.isActive ? 1 : 0, valid.sortOrder, id]);
      await this.audit(database, 'leave.type.update', 'leave_type', id, actorPersonId, { leaveTypeCode: before.code, changedFields });
      return { ok: true as const };
    }), (message) => (message.includes('leave_type_name_unique') ? 'DUPLICATE_NAME' : 'DUPLICATE_CODE'));
  }

  async listEntitlements(): Promise<LeaveEntitlementRow[]> {
    const rows = await this.database.query<EntitlementRow>(`SELECT ${entitlementColumns} FROM leave_entitlement ORDER BY employment_type_id, leave_type_id`);
    return rows.map(toEntitlement);
  }

  async setEntitlement(input: LeaveEntitlementInput, actorPersonId: string): Promise<{ ok: true } | Failure<'NOT_FOUND'>> {
    const valid = leaveEntitlementInputSchema.parse(input);
    return this.database.transaction(async (database) => {
      const [type] = await database.query<{ code: string }>('SELECT code FROM leave_type WHERE id = ?', [valid.leaveTypeId]);
      const [employmentType] = await database.query<{ id: string }>('SELECT id FROM hr_employment_type WHERE id = ?', [valid.employmentTypeId]);
      if (!type || !employmentType) return { ok: false as const, code: 'NOT_FOUND' as const };
      const [stored] = await database.query<EntitlementRow>(`SELECT ${entitlementColumns} FROM leave_entitlement WHERE employment_type_id = ? AND leave_type_id = ? FOR UPDATE`, [valid.employmentTypeId, valid.leaveTypeId]);
      const before = stored ? toEntitlement(stored) : null;
      const changedFields = entitlementFields.filter((field) => before?.[field] !== valid[field]);
      if (before && changedFields.length === 0) return { ok: true as const };
      await database.execute('INSERT INTO leave_entitlement (employment_type_id, leave_type_id, days_per_year, first_year_days, max_accumulated_days, max_accumulated_days_after_10_years, min_service_months, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE days_per_year = VALUES(days_per_year), first_year_days = VALUES(first_year_days), max_accumulated_days = VALUES(max_accumulated_days), max_accumulated_days_after_10_years = VALUES(max_accumulated_days_after_10_years), min_service_months = VALUES(min_service_months), updated_at = UTC_TIMESTAMP()', [valid.employmentTypeId, valid.leaveTypeId, valid.daysPerYear, valid.firstYearDays, valid.maxAccumulatedDays, valid.maxAccumulatedDaysAfter10Years, valid.minServiceMonths]);
      await this.audit(database, 'leave.entitlement.set', 'leave_entitlement', valid.leaveTypeId, actorPersonId, { employmentTypeId: valid.employmentTypeId, leaveTypeCode: type.code, changedFields });
      return { ok: true as const };
    });
  }

  async deleteEntitlement(employmentTypeId: string, leaveTypeId: string, actorPersonId: string): Promise<{ ok: true } | Failure<'NOT_FOUND'>> {
    return this.database.transaction(async (database) => {
      const [stored] = await database.query<{ code: string }>('SELECT t.code FROM leave_entitlement e JOIN leave_type t ON t.id = e.leave_type_id WHERE e.employment_type_id = ? AND e.leave_type_id = ? FOR UPDATE', [employmentTypeId, leaveTypeId]);
      if (!stored) return { ok: false as const, code: 'NOT_FOUND' as const };
      await database.execute('DELETE FROM leave_entitlement WHERE employment_type_id = ? AND leave_type_id = ?', [employmentTypeId, leaveTypeId]);
      await this.audit(database, 'leave.entitlement.delete', 'leave_entitlement', leaveTypeId, actorPersonId, { employmentTypeId, leaveTypeCode: stored.code });
      return { ok: true as const };
    });
  }

  /** Holidays in a CE calendar year, oldest first. */
  async listHolidays(year: number): Promise<Array<{ date: string; name: string }>> {
    return this.database.query<{ date: string; name: string }>("SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date, name FROM leave_holiday WHERE holiday_date BETWEEN ? AND ? ORDER BY holiday_date", [`${year}-01-01`, `${year}-12-31`]);
  }

  async addHoliday(input: LeaveHolidayInput, actorPersonId: string): Promise<{ ok: true } | Failure<'DUPLICATE_DATE'>> {
    const valid = leaveHolidayInputSchema.parse(input);
    return withDuplicateCheck(() => this.database.transaction(async (database) => {
      await database.execute('INSERT INTO leave_holiday (holiday_date, name) VALUES (?, ?)', [valid.date, valid.name]);
      await this.audit(database, 'leave.holiday.create', 'leave_holiday', valid.date, actorPersonId, { changedFields: ['date', 'name'] });
      return { ok: true as const };
    }), () => 'DUPLICATE_DATE' as const);
  }

  async renameHoliday(date: string, name: string, actorPersonId: string): Promise<{ ok: true } | Failure<'NOT_FOUND'>> {
    const valid = leaveHolidayInputSchema.parse({ date, name });
    return this.database.transaction(async (database) => {
      const [stored] = await database.query<{ name: string }>('SELECT name FROM leave_holiday WHERE holiday_date = ? FOR UPDATE', [valid.date]);
      if (!stored) return { ok: false as const, code: 'NOT_FOUND' as const };
      if (stored.name === valid.name) return { ok: true as const };
      await database.execute('UPDATE leave_holiday SET name = ? WHERE holiday_date = ?', [valid.name, valid.date]);
      await this.audit(database, 'leave.holiday.update', 'leave_holiday', valid.date, actorPersonId, { changedFields: ['name'] });
      return { ok: true as const };
    });
  }

  async deleteHoliday(date: string, actorPersonId: string): Promise<{ ok: true } | Failure<'NOT_FOUND'>> {
    const valid = leaveHolidayInputSchema.pick({ date: true }).parse({ date });
    return this.database.transaction(async (database) => {
      const [stored] = await database.query<{ date: string }>("SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date FROM leave_holiday WHERE holiday_date = ? FOR UPDATE", [valid.date]);
      if (!stored) return { ok: false as const, code: 'NOT_FOUND' as const };
      await database.execute('DELETE FROM leave_holiday WHERE holiday_date = ?', [valid.date]);
      await this.audit(database, 'leave.holiday.delete', 'leave_holiday', valid.date, actorPersonId, {});
      return { ok: true as const };
    });
  }

  async getMinWorkingDays(): Promise<number> {
    const [row] = await this.database.query<{ minimum: number | string }>('SELECT min_working_days_per_month AS minimum FROM leave_setting WHERE id = 1');
    return row ? Number(row.minimum) : 15;
  }

  async setMinWorkingDays(input: LeaveSettingInput, actorPersonId: string): Promise<{ ok: true }> {
    const valid = leaveSettingInputSchema.parse(input);
    return this.database.transaction(async (database) => {
      const [stored] = await database.query<{ minimum: number | string }>('SELECT min_working_days_per_month AS minimum FROM leave_setting WHERE id = 1 FOR UPDATE');
      if (stored && Number(stored.minimum) === valid.minWorkingDaysPerMonth) return { ok: true as const };
      await database.execute('INSERT INTO leave_setting (id, min_working_days_per_month, updated_at) VALUES (1, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE min_working_days_per_month = VALUES(min_working_days_per_month), updated_at = UTC_TIMESTAMP()', [valid.minWorkingDaysPerMonth]);
      await this.audit(database, 'leave.setting.update', 'leave_setting', '1', actorPersonId, { changedFields: ['minWorkingDaysPerMonth'] });
      return { ok: true as const };
    });
  }

  private audit(database: Pick<Database, 'execute'>, action: string, targetType: string, targetId: string, actorPersonId: string, metadata: Record<string, unknown>): Promise<void> {
    return new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action, targetType, targetId, result: 'SUCCESS', metadata });
  }
}

async function withDuplicateCheck<T, Code extends string>(work: () => Promise<T>, codeFor: (message: string) => Code): Promise<T | Failure<Code>> {
  try {
    return await work();
  } catch (error) {
    if (error && typeof error === 'object' && 'errno' in error && error.errno === 1062) return { ok: false, code: codeFor(String((error as { message?: unknown }).message)) };
    throw error;
  }
}
