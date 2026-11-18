import { randomUUID } from 'node:crypto';
import { dpUploadSchema, type AccessSubject, type DpUpload } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { dpFiscalYear, parseDp, type DpRecord } from './dp-report';
import { canManageMoney, loadMoneyMember, moneyCan } from './money-access';
import { moneyAudit } from './money-db';

/** Encrypts each record (it holds เลขบัตรประชาชน, name and HN); `NationalIdProtector` in production. */
export type DpCipher = { encrypt(text: string): string; decrypt(text: string): string };

/** One ปีงบ on the files page and in the dashboard status line (legacy `DpStore::summaries`; พึงเบิก over every row). */
export type DpYearSummary = { fy: number; count: number; from: string; to: string; claim: number; eligible: number; flagged: number; latestFile: string | null; updatedAt: string };
/** A stored record as the dashboard reads it (legacy `DpStore::all`). */
export type DpStoredRecord = DpRecord & { fy: number };
export type DpUploadResult =
  | { ok: true; hcode: string; hname: string; rows: number; skipped: number; added: number; updated: number; years: Record<number, number> }
  | { ok: false; code: 'FORBIDDEN' }
  | { ok: false; code: 'INVALID_REPORT' | 'NOT_CONFIGURED'; message: string };
type Denied = { ok: false; code: 'FORBIDDEN' };
type NotConfigured = { ok: false; code: 'NOT_CONFIGURED'; message: string };
type SummaryRow = { fy: number; count: number | string; date_from: string | Date; date_to: string | Date; claim: string | number; eligible: string | number; flagged: number | string; updated_at: Date | string; latest_file: string | null };

const MESSAGE_NOT_CONFIGURED = 'ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสข้อมูลผู้ป่วย (NATIONAL_ID_ENCRYPTION_KEY) ติดต่อผู้ดูแลระบบ';
const CHUNK = 500;
const day = (value: string | Date) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const instant = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(`${String(value).replace(' ', 'T')}Z`).toISOString());
const round2 = (value: number) => Math.round(value * 100) / 100;
/** PHP `strcmp` order, which the legacy store sorted by. */
const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const chunks = <T>(items: T[]) => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, at) => items.slice(at * CHUNK, at * CHUNK + CHUNK));

/**
 * Point ฟื้นฟูผู้พิการ: one row per เลขที่อ้างอิง; a known ref is replaced (and moves ปีงบ when its date moved), as the legacy
 * `DpStore::merge`. A `money.manage` holder uploads and deletes; managers and members with the `disability` page read. The record
 * is stored encrypted; ปีงบ, date and the money the files page sums are kept in clear. Audit carries counts only.
 */
export class DpRecordService {
  constructor(private readonly database: Database, private readonly cipher: DpCipher | null, private readonly createId: () => string = randomUUID) {}

  async upload(subject: AccessSubject, input: DpUpload): Promise<DpUploadResult> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    if (!this.cipher) return { ok: false, code: 'NOT_CONFIGURED', message: MESSAGE_NOT_CONFIGURED };
    const { fileName, uploadId, rows } = dpUploadSchema.parse(input);
    const parsed = parseDp(rows);
    if (!parsed.ok) return { ok: false, code: 'INVALID_REPORT', message: parsed.message };
    if (parsed.records.some((record) => record.ref.length > 100)) return { ok: false, code: 'INVALID_REPORT', message: 'เลขที่อ้างอิงยาวเกิน 100 ตัวอักษร' };
    const name = fileName.split(/[\\/]/).pop() ?? fileName;
    const cipher = this.cipher;
    const badYear = parsed.records.map((record) => dpFiscalYear(record.date)).find((fy) => fy < 2500 || fy > 2700);
    if (badYear !== undefined) return { ok: false, code: 'INVALID_REPORT', message: `ปีงบไม่ถูกต้อง: ${badYear}` };
    const sealed = parsed.records.map((record) => ({ record, fy: dpFiscalYear(record.date), ciphertext: cipher.encrypt(JSON.stringify(record)) }));
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      const known = new Set<string>();
      for (const part of chunks([...new Set(sealed.map((item) => item.record.ref))])) {
        const found = await database.query<{ ref: string }>(`SELECT ref FROM money_dp_record WHERE ref IN (${part.map(() => '?').join(', ')}) FOR UPDATE`, part);
        for (const row of found) known.add(row.ref);
      }
      let added = 0;
      let updated = 0;
      const years: Record<number, number> = {};
      const latest = new Map<string, (typeof sealed)[number]>();
      for (const item of sealed) {
        if (known.has(item.record.ref)) updated++;
        else { added++; known.add(item.record.ref); }
        years[item.fy] = (years[item.fy] ?? 0) + 1;
        latest.delete(item.record.ref);
        latest.set(item.record.ref, item);
      }
      for (const part of chunks([...latest.values()])) {
        await database.execute(
          `INSERT INTO money_dp_record (ref, fy, service_date, claim, eligible, flagged, record_ciphertext, uploaded_at, uploaded_by) VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)').join(', ')}
           ON DUPLICATE KEY UPDATE fy = VALUES(fy), service_date = VALUES(service_date), claim = VALUES(claim), eligible = VALUES(eligible), flagged = VALUES(flagged),
             record_ciphertext = VALUES(record_ciphertext), uploaded_at = VALUES(uploaded_at), uploaded_by = VALUES(uploaded_by)`,
          part.flatMap(({ record, fy, ciphertext }) => [record.ref, fy, record.date, round2(record.claim), round2(record.eligible), record.status !== '' ? 1 : 0, ciphertext, actor])
        );
      }
      for (const [fy, count] of Object.entries(years)) {
        await database.execute(
          `INSERT INTO money_dp_upload (upload_id, fy, file_name, row_count, uploaded_at, uploaded_by) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(6), ?)
           ON DUPLICATE KEY UPDATE row_count = row_count + VALUES(row_count), file_name = VALUES(file_name), uploaded_at = VALUES(uploaded_at), uploaded_by = VALUES(uploaded_by)`,
          [uploadId, Number(fy), name, count, actor]
        );
      }
      await moneyAudit(database, this.createId, actor, 'money.dp.upload', 'module', 'smart-money', { rows: sealed.length, added, updated });
      return { ok: true as const, hcode: parsed.hcode, hname: parsed.hname, rows: sealed.length, skipped: parsed.skipped, added, updated, years };
    });
  }

  /** ข้อมูลที่นำเข้าแล้ว: one row per ปีงบ, newest first. */
  async summaries(subject: AccessSubject): Promise<{ ok: true; years: DpYearSummary[] } | Denied> {
    if (!(await this.mayView(subject))) return { ok: false, code: 'FORBIDDEN' };
    return { ok: true, years: await this.readSummaries() };
  }

  /** The dashboard: every record, decrypted, with its ปีงบ (by ปีงบ, date, เลขที่อ้างอิง), and the ปีงบ summaries. */
  async all(subject: AccessSubject): Promise<{ ok: true; years: DpYearSummary[]; records: DpStoredRecord[] } | Denied | NotConfigured> {
    if (!(await this.mayView(subject))) return { ok: false, code: 'FORBIDDEN' };
    const rows = await this.database.query<{ ref: string; fy: number; service_date: string | Date; record_ciphertext: string }>('SELECT ref, fy, service_date, record_ciphertext FROM money_dp_record');
    if (rows.length && !this.cipher) return { ok: false, code: 'NOT_CONFIGURED', message: MESSAGE_NOT_CONFIGURED };
    const sorted = rows.map((row) => ({ ...row, date: day(row.service_date) }))
      .sort((a, b) => a.fy - b.fy || byteOrder(a.date, b.date) || byteOrder(a.ref, b.ref));
    const records = sorted.map((row) => ({ ...(JSON.parse(this.cipher!.decrypt(row.record_ciphertext)) as DpRecord), fy: Number(row.fy) }));
    return { ok: true, years: await this.readSummaries(), records };
  }

  /** ลบข้อมูลทั้งปีงบ. */
  async removeYear(subject: AccessSubject, fy: number): Promise<{ ok: true; records: number } | Denied | { ok: false; code: 'NOT_FOUND' }> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      const records = (await database.query('SELECT ref FROM money_dp_record WHERE fy = ? FOR UPDATE', [fy])).length;
      if (records === 0) return { ok: false as const, code: 'NOT_FOUND' as const };
      await database.execute('DELETE FROM money_dp_record WHERE fy = ?', [fy]);
      await database.execute('DELETE FROM money_dp_upload WHERE fy = ?', [fy]);
      await moneyAudit(database, this.createId, actor, 'money.dp.remove', 'module', 'smart-money', { fy, records });
      return { ok: true as const, records };
    });
  }

  private async readSummaries(): Promise<DpYearSummary[]> {
    const rows = await this.database.query<SummaryRow>(
      `SELECT r.fy, COUNT(*) AS count, MIN(r.service_date) AS date_from, MAX(r.service_date) AS date_to, SUM(r.claim) AS claim, SUM(r.eligible) AS eligible,
         SUM(r.flagged) AS flagged, MAX(r.uploaded_at) AS updated_at,
         (SELECT u.file_name FROM money_dp_upload u WHERE u.fy = r.fy ORDER BY u.uploaded_at DESC LIMIT 1) AS latest_file
       FROM money_dp_record r GROUP BY r.fy ORDER BY r.fy DESC`
    );
    return rows.map((row) => ({
      fy: Number(row.fy), count: Number(row.count), from: day(row.date_from), to: day(row.date_to), claim: round2(Number(row.claim)), eligible: round2(Number(row.eligible)),
      flagged: Number(row.flagged), latestFile: row.latest_file, updatedAt: instant(row.updated_at)
    }));
  }

  private async mayView(subject: AccessSubject): Promise<boolean> {
    if (!subject.personId) return false;
    return canManageMoney(subject) || moneyCan(await loadMoneyMember(this.database, subject.personId), false, 'disability');
  }
}
