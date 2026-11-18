import { randomUUID } from 'node:crypto';
import { nhsoUploadSchema, type AccessSubject, type NhsoCell, type NhsoUpload } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { canManageMoney, loadMoneyMember, moneyCan } from './money-access';
import { moneyAudit } from './money-db';
import { parseNhsoReport } from './nhso-report';

/** The stored table is kept under MariaDB's default 16 MB packet. */
const MAX_ROWS_JSON = 12 * 1024 * 1024;

/** One stored report without its rows: what the files page lists. */
export type NhsoDatasetSummary = {
  hcode: string; name: string; region: string; fy: number; dateFrom: string | null; dateTo: string | null;
  fileName: string; rowCount: number; transferTotal: number; uploadedAt: string;
};
export type NhsoDataset = NhsoDatasetSummary & { rows: NhsoCell[][] };

export type NhsoUploadResult = { ok: true; hcode: string; name: string; fy: number; rows: number; replaced: boolean } | { ok: false; code: 'FORBIDDEN' } | { ok: false; code: 'INVALID_REPORT'; message: string };
type Denied = { ok: false; code: 'FORBIDDEN' };

type Row = { hcode: string; name: string; region: string; fy: number; date_from: string | Date | null; date_to: string | Date | null; file_name: string; row_count: number; transfer_total: string | number; uploaded_at: Date | string; rows_json?: string };

const day = (value: string | Date | null) => (value === null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const summary = (row: Row): NhsoDatasetSummary => ({
  hcode: row.hcode, name: row.name, region: row.region, fy: Number(row.fy), dateFrom: day(row.date_from), dateTo: day(row.date_to), fileName: row.file_name,
  rowCount: Number(row.row_count), transferTotal: Number(row.transfer_total), uploadedAt: row.uploaded_at instanceof Date ? row.uploaded_at.toISOString() : new Date(`${String(row.uploaded_at).replace(' ', 'T')}Z`).toISOString()
});
const COLUMNS = 'hcode, name, region, fy, date_from, date_to, file_name, row_count, transfer_total, uploaded_at';
const ORDER = 'ORDER BY fy, hcode';

/**
 * เงินโอน สปสช.: one report per หน่วยบริการ and ปีงบ. A `money.manage` holder uploads and deletes; managers and members with the
 * `nhso` page read. Audit carries ปีงบ and counts only, never hospital rows.
 */
export class NhsoDatasetService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  async upload(subject: AccessSubject, input: NhsoUpload): Promise<NhsoUploadResult> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    const { fileName, aoa } = nhsoUploadSchema.parse(input);
    const parsed = parseNhsoReport(aoa, fileName);
    if (!parsed.ok) return { ok: false, code: 'INVALID_REPORT', message: parsed.message };
    const report = parsed.report;
    if (!/^\d{5}$/.test(report.hcode) || report.fy < 2500 || report.fy > 2700) return { ok: false, code: 'INVALID_REPORT', message: 'รหัสหน่วยบริการหรือปีงบไม่ถูกต้อง' };
    const rowsJson = JSON.stringify(report.rows);
    if (Buffer.byteLength(rowsJson, 'utf8') > MAX_ROWS_JSON) return { ok: false, code: 'INVALID_REPORT', message: 'ไฟล์ใหญ่เกินไป' };
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      const replaced = (await database.query('SELECT hcode FROM money_nhso_dataset WHERE hcode = ? AND fy = ? FOR UPDATE', [report.hcode, report.fy])).length > 0;
      await database.execute(
        `INSERT INTO money_nhso_dataset (${COLUMNS}, rows_json, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?)
         ON DUPLICATE KEY UPDATE name = VALUES(name), region = VALUES(region), date_from = VALUES(date_from), date_to = VALUES(date_to), file_name = VALUES(file_name),
           row_count = VALUES(row_count), transfer_total = VALUES(transfer_total), uploaded_at = VALUES(uploaded_at), rows_json = VALUES(rows_json), uploaded_by = VALUES(uploaded_by)`,
        [report.hcode, report.name, report.region, report.fy, report.dateFrom, report.dateTo, report.fileName, report.rowCount, report.transferTotal, rowsJson, actor]
      );
      await moneyAudit(database, this.createId, actor, 'money.nhso.upload', 'nhso_dataset', `${report.hcode}-${report.fy}`, { fiscalYear: report.fy, rows: report.rowCount });
      return { ok: true as const, hcode: report.hcode, name: report.name, fy: report.fy, rows: report.rowCount, replaced };
    });
  }

  /** The files page: every report without its rows, by ปีงบ then รหัส. */
  async list(subject: AccessSubject): Promise<{ ok: true; datasets: NhsoDatasetSummary[] } | Denied> {
    if (!(await this.mayView(subject))) return { ok: false, code: 'FORBIDDEN' };
    return { ok: true, datasets: (await this.database.query<Row>(`SELECT ${COLUMNS} FROM money_nhso_dataset ${ORDER}`)).map(summary) };
  }

  /** The dashboard: every report with its rows. */
  async all(subject: AccessSubject): Promise<{ ok: true; datasets: NhsoDataset[] } | Denied> {
    if (!(await this.mayView(subject))) return { ok: false, code: 'FORBIDDEN' };
    const rows = await this.database.query<Row>(`SELECT ${COLUMNS}, rows_json FROM money_nhso_dataset ${ORDER}`);
    return { ok: true, datasets: rows.map((row) => ({ ...summary(row), rows: JSON.parse(row.rows_json ?? '[]') as NhsoCell[][] })) };
  }

  async remove(subject: AccessSubject, hcode: string, fy: number): Promise<{ ok: true } | Denied | { ok: false; code: 'NOT_FOUND' }> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      if ((await database.query('SELECT hcode FROM money_nhso_dataset WHERE hcode = ? AND fy = ? FOR UPDATE', [hcode, fy])).length === 0) return { ok: false as const, code: 'NOT_FOUND' as const };
      await database.execute('DELETE FROM money_nhso_dataset WHERE hcode = ? AND fy = ?', [hcode, fy]);
      await moneyAudit(database, this.createId, actor, 'money.nhso.remove', 'nhso_dataset', `${hcode}-${fy}`, { fiscalYear: fy });
      return { ok: true as const };
    });
  }

  async removeAll(subject: AccessSubject): Promise<{ ok: true; removed: number } | Denied> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      const removed = (await database.query('SELECT hcode FROM money_nhso_dataset FOR UPDATE')).length;
      await database.execute('DELETE FROM money_nhso_dataset');
      await moneyAudit(database, this.createId, actor, 'money.nhso.remove_all', 'module', 'smart-money', { datasets: removed });
      return { ok: true as const, removed };
    });
  }

  private async mayView(subject: AccessSubject): Promise<boolean> {
    if (!subject.personId) return false;
    const manages = canManageMoney(subject);
    return manages || moneyCan(await loadMoneyMember(this.database, subject.personId), false, 'nhso');
  }
}
