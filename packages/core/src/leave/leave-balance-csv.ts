import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import { parseCsvRecords } from '../hr/csv';
import { LeaveSettingsService, type LeaveType } from './leave-settings-service';

export type LeaveBalanceCsvErrorCode = 'MISSING_COLUMN' | 'UNKNOWN_EMPLOYEE' | 'UNKNOWN_LEAVE_TYPE' | 'INVALID_NUMBER' | 'DUPLICATE_ROW';
export interface LeaveBalanceCsvError { row: number; column: string; code: LeaveBalanceCsvErrorCode }
export interface LeaveBalanceRow { personId: string; leaveTypeId: string; carriedDays: number; usedDays: number }

const COLUMNS = ['employee_code', 'display_name', 'leave_type', 'carried_days', 'used_days'] as const;
const REQUIRED = ['employee_code', 'leave_type', 'carried_days', 'used_days'] as const;
// A leading = + - @ would run as a formula when HR opens the file in a spreadsheet.
const cell = (value: string) => {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const dayAmount = (text: string): number | null => {
  const value = Number(text.trim());
  return text.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= 999 && Number.isInteger(value * 2) ? value : null;
};

/** ยอดยกมา template filled with what is stored for a ปีงบประมาณ: one row per active person and entitled ประเภทการลา. */
export async function exportLeaveBalancesCsv(db: Pick<Database, 'query'>, fiscalYear: number): Promise<string> {
  const rows = await db.query<{ employeeCode: string; displayName: string | null; code: string; carriedDays: string | null; usedDays: string | null }>(
    `SELECT p.employee_code AS employeeCode, p.display_name AS displayName, t.code, CAST(ob.carried_days AS CHAR) AS carriedDays, CAST(ob.used_days AS CHAR) AS usedDays
     FROM person p JOIN hr_person_profile hp ON hp.person_id = p.id JOIN leave_entitlement e ON e.employment_type_id = hp.employment_type_id JOIN leave_type t ON t.id = e.leave_type_id AND t.is_active = 1
     LEFT JOIN leave_opening_balance ob ON ob.person_id = p.id AND ob.leave_type_id = t.id AND ob.fiscal_year = ?
     WHERE p.employment_status = 'ACTIVE' AND p.employee_code IS NOT NULL ORDER BY p.employee_code, t.sort_order`,
    [fiscalYear]
  );
  const lines = rows.map((row) => [row.employeeCode, row.displayName ?? '', row.code, String(Number(row.carriedDays ?? 0)), String(Number(row.usedDays ?? 0))].map(cell).join(','));
  return `\uFEFF${[COLUMNS.join(','), ...lines].join('\r\n')}\r\n`;
}

/** Checks every row before anything is stored. Errors name the row and column, never the cell's value. */
export function validateLeaveBalances(text: string, context: { people: Map<string, string>; leaveTypes: LeaveType[] }): { rows: LeaveBalanceRow[]; errors: LeaveBalanceCsvError[] } {
  const [header, ...records] = parseCsvRecords(text);
  const columns = (header?.cells ?? []).map((name) => name.trim().toLowerCase());
  const missing = REQUIRED.filter((name) => !columns.includes(name));
  if (missing.length > 0) return { rows: [], errors: missing.map((column) => ({ row: header?.line ?? 1, column, code: 'MISSING_COLUMN' as const })) };
  const at = (cells: string[], name: string) => (cells[columns.indexOf(name)] ?? '').trim();
  const typeByKey = new Map(context.leaveTypes.flatMap((type) => [[type.code, type], [type.name, type]] as const));
  const rows: LeaveBalanceRow[] = [];
  const errors: LeaveBalanceCsvError[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    const personId = context.people.get(at(record.cells, 'employee_code'));
    const leaveType = typeByKey.get(at(record.cells, 'leave_type'));
    const carriedDays = dayAmount(at(record.cells, 'carried_days'));
    const usedDays = dayAmount(at(record.cells, 'used_days'));
    const before = errors.length;
    if (!personId) errors.push({ row: record.line, column: 'employee_code', code: 'UNKNOWN_EMPLOYEE' });
    if (!leaveType) errors.push({ row: record.line, column: 'leave_type', code: 'UNKNOWN_LEAVE_TYPE' });
    if (carriedDays === null) errors.push({ row: record.line, column: 'carried_days', code: 'INVALID_NUMBER' });
    if (usedDays === null) errors.push({ row: record.line, column: 'used_days', code: 'INVALID_NUMBER' });
    if (errors.length > before || !personId || !leaveType || carriedDays === null || usedDays === null) continue;
    const key = `${personId}:${leaveType.id}`;
    if (seen.has(key)) { errors.push({ row: record.line, column: 'leave_type', code: 'DUPLICATE_ROW' }); continue; }
    seen.add(key);
    rows.push({ personId, leaveTypeId: leaveType.id, carriedDays, usedDays });
  }
  return { rows, errors };
}

/** Stores ยอดยกมา from HR's file for one ปีงบประมาณ: all rows or none, and only rows whose values changed. */
export class LeaveBalanceImportService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async apply(text: string, fiscalYear: number, actorPersonId: string): Promise<{ ok: true; rowsChanged: number } | { ok: false; errors: LeaveBalanceCsvError[] }> {
    const people = new Map((await this.database.query<{ code: string; id: string }>('SELECT employee_code AS code, id FROM person WHERE employee_code IS NOT NULL')).map((row) => [row.code, row.id]));
    const { rows, errors } = validateLeaveBalances(text, { people, leaveTypes: await new LeaveSettingsService(this.database).listTypes() });
    if (errors.length > 0) return { ok: false, errors };
    return this.database.transaction(async (database) => {
      const stored = new Map((await database.query<{ personId: string; leaveTypeId: string; carriedDays: string; usedDays: string }>('SELECT person_id AS personId, leave_type_id AS leaveTypeId, CAST(carried_days AS CHAR) AS carriedDays, CAST(used_days AS CHAR) AS usedDays FROM leave_opening_balance WHERE fiscal_year = ? FOR UPDATE', [fiscalYear]))
        .map((row) => [`${row.personId}:${row.leaveTypeId}`, { carriedDays: Number(row.carriedDays), usedDays: Number(row.usedDays) }]));
      // A row of zeros with nothing stored changes nothing, so a re-imported template stays a no-op.
      const changed = rows.filter((row) => {
        const before = stored.get(`${row.personId}:${row.leaveTypeId}`) ?? { carriedDays: 0, usedDays: 0 };
        return before.carriedDays !== row.carriedDays || before.usedDays !== row.usedDays;
      });
      for (const row of changed) {
        await database.execute('INSERT INTO leave_opening_balance (person_id, fiscal_year, leave_type_id, carried_days, used_days, updated_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE carried_days = VALUES(carried_days), used_days = VALUES(used_days), updated_at = UTC_TIMESTAMP()', [row.personId, fiscalYear, row.leaveTypeId, row.carriedDays, row.usedDays]);
      }
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'leave.balance.import', targetType: 'leave_opening_balance', targetId: String(fiscalYear), result: 'SUCCESS', metadata: { fiscalYear, rowsChanged: changed.length } });
      return { ok: true as const, rowsChanged: changed.length };
    });
  }
}
