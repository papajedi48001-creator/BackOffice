import { randomUUID } from 'node:crypto';
import { imcUploadSchema, type AccessSubject, type ImcUpload } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { DpCipher } from './dp-record-service';
import { buildImcOverview, type ImcOverview } from './imc-overview';
import { imcFileKind, parseImcRegister, parseImcRep, type ImcLine, type ImcRepLine } from './imc-report';
import { canManageMoney, loadMoneyMember, moneyCan } from './money-access';
import { moneyAudit } from './money-db';

export type ImcUploadResult =
  | { ok: true; kind: 'register' | 'rep'; rows: number; added: number; updated: number; skipped: number }
  | { ok: false; code: 'FORBIDDEN' }
  | { ok: false; code: 'INVALID_REPORT' | 'NOT_CONFIGURED'; message: string };
type Denied = { ok: false; code: 'FORBIDDEN' };
type NotConfigured = { ok: false; code: 'NOT_CONFIGURED'; message: string };

const MESSAGE_NOT_CONFIGURED = 'ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสข้อมูลผู้ป่วย (NATIONAL_ID_ENCRYPTION_KEY) ติดต่อผู้ดูแลระบบ';
const MESSAGE_SERVICE_FILE = 'ไฟล์การให้บริการ IMC ไม่ต้องนำเข้า ข้อมูลเดียวกันอยู่ในทะเบียนคนไข้ IMC แล้ว';
const CHUNK = 500;
const round2 = (value: number) => Math.round(value * 100) / 100;
const chunks = <T>(items: T[]) => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, at) => items.slice(at * CHUNK, at * CHUNK + CHUNK));
const instant = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(`${String(value).replace(' ', 'T')}Z`).toISOString());

/**
 * Monitor IMC (กองทุนฟื้นฟูสมรรถภาพ): stores the IMC register lines and REP individual lines, encrypted, and builds the page.
 * A `money.manage` holder uploads; managers and members with the `disability` page read. A known line is replaced, so the same
 * file can be uploaded again as it grows. Audit carries the kind and counts only.
 */
export class ImcService {
  constructor(private readonly database: Database, private readonly cipher: DpCipher | null, private readonly createId: () => string = randomUUID) {}

  async upload(subject: AccessSubject, input: ImcUpload): Promise<ImcUploadResult> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    if (!this.cipher) return { ok: false, code: 'NOT_CONFIGURED', message: MESSAGE_NOT_CONFIGURED };
    const { kind, rows } = imcUploadSchema.parse(input);
    if (imcFileKind(rows) === 'service') return { ok: false, code: 'INVALID_REPORT', message: MESSAGE_SERVICE_FILE };
    const parsed = kind === 'register' ? parseImcRegister(rows) : parseImcRep(rows);
    if (!parsed.ok) return { ok: false, code: 'INVALID_REPORT', message: parsed.message };
    const cipher = this.cipher;
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      let added = 0;
      let updated = 0;
      if (kind === 'register') {
        const latest = new Map((parsed.lines as ImcLine[]).map((line) => [line.key, line]));
        const known = new Set<string>();
        for (const part of chunks([...latest.keys()])) {
          for (const row of await database.query<{ line_key: string }>(`SELECT line_key FROM money_imc_visit WHERE line_key IN (${part.map(() => '?').join(', ')}) FOR UPDATE`, part)) known.add(row.line_key);
        }
        for (const key of latest.keys()) if (known.has(key)) updated++; else added++;
        for (const part of chunks([...latest.values()])) {
          await database.execute(
            `INSERT INTO money_imc_visit (line_key, service_date, code, claim, record_ciphertext, uploaded_at, uploaded_by) VALUES ${part.map(() => '(?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)').join(', ')}
             ON DUPLICATE KEY UPDATE service_date = VALUES(service_date), code = VALUES(code), claim = VALUES(claim), record_ciphertext = VALUES(record_ciphertext), uploaded_at = VALUES(uploaded_at), uploaded_by = VALUES(uploaded_by)`,
            part.flatMap((line) => [line.key, line.date, line.code.slice(0, 20), round2(line.claim), cipher.encrypt(JSON.stringify(line)), actor])
          );
        }
      } else {
        const id = (line: ImcRepLine) => `${line.repNo}|${line.transId}|${line.itemNo}`;
        const latest = new Map((parsed.lines as ImcRepLine[]).map((line) => [id(line), line]));
        const known = new Set<string>();
        for (const part of chunks([...latest.values()])) {
          const found = await database.query<{ rep_no: string; trans_id: string; item_no: number }>(
            `SELECT rep_no, trans_id, item_no FROM money_imc_rep WHERE (rep_no, trans_id, item_no) IN (${part.map(() => '(?, ?, ?)').join(', ')}) FOR UPDATE`, part.flatMap((line) => [line.repNo, line.transId, line.itemNo]));
          for (const row of found) known.add(`${row.rep_no}|${row.trans_id}|${Number(row.item_no)}`);
        }
        for (const key of latest.keys()) if (known.has(key)) updated++; else added++;
        for (const part of chunks([...latest.values()])) {
          await database.execute(
            `INSERT INTO money_imc_rep (rep_no, trans_id, item_no, service_date, claim, paid, record_ciphertext, uploaded_at, uploaded_by) VALUES ${part.map(() => '(?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)').join(', ')}
             ON DUPLICATE KEY UPDATE service_date = VALUES(service_date), claim = VALUES(claim), paid = VALUES(paid), record_ciphertext = VALUES(record_ciphertext), uploaded_at = VALUES(uploaded_at), uploaded_by = VALUES(uploaded_by)`,
            part.flatMap((line) => [line.repNo.slice(0, 30), line.transId.slice(0, 30), line.itemNo, line.date, round2(line.claim), round2(line.paid), cipher.encrypt(JSON.stringify(line)), actor])
          );
        }
      }
      const rows = added + updated;
      await moneyAudit(database, this.createId, actor, 'money.imc.upload', 'module', 'smart-money', { kind, rows, added, updated });
      return { ok: true as const, kind, rows, added, updated, skipped: parsed.skipped };
    });
  }

  /** The Monitor IMC page, with the time of the latest upload (null before the first). */
  async overview(subject: AccessSubject): Promise<({ ok: true; updatedAt: string | null } & ImcOverview) | Denied | NotConfigured> {
    if (!subject.personId) return { ok: false, code: 'FORBIDDEN' };
    if (!canManageMoney(subject) && !moneyCan(await loadMoneyMember(this.database, subject.personId), false, 'disability')) return { ok: false, code: 'FORBIDDEN' };
    const visits = await this.database.query<{ record_ciphertext: string; uploaded_at: Date | string }>('SELECT record_ciphertext, uploaded_at FROM money_imc_visit');
    const reps = await this.database.query<{ record_ciphertext: string; uploaded_at: Date | string }>('SELECT record_ciphertext, uploaded_at FROM money_imc_rep');
    if ((visits.length || reps.length) && !this.cipher) return { ok: false, code: 'NOT_CONFIGURED', message: MESSAGE_NOT_CONFIGURED };
    const open = <T>(row: { record_ciphertext: string }) => JSON.parse(this.cipher!.decrypt(row.record_ciphertext)) as T;
    const times = [...visits, ...reps].map((row) => instant(row.uploaded_at)).sort();
    return { ok: true, updatedAt: times.at(-1) ?? null, ...buildImcOverview(visits.map(open<ImcLine>), reps.map(open<ImcRepLine>)) };
  }
}
