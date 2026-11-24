import { randomUUID } from 'node:crypto';
import { ofcUploadSchema, type AccessSubject, type OfcUpload } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import { canManageMoney, loadMoneyMember, moneyCan } from './money-access';
import { moneyAudit } from './money-db';
import { ofcFileKind, parseOfcRep, parseOfcStm, type OfcRepLine, type OfcStmLine } from './ofc-report';
import { summarizeOfc, type OfcRow, type OfcSummary } from './ofc-summary';

export type OfcReader = (connection: HosxpConnection, start: string, end: string) => Promise<OfcRow[]>;
export type OfcLoad = { ok: true; summary: OfcSummary; updatedAt: string | null } | { ok: false; code: 'FORBIDDEN' | 'NOT_CONFIGURED' | 'HOSXP_FAILED' };
export type OfcUploadResult =
  | { ok: true; kind: 'rep' | 'stm'; rows: number; added: number; updated: number; skipped: number }
  | { ok: false; code: 'FORBIDDEN' }
  | { ok: false; code: 'INVALID_REPORT'; message: string };

const NOT_OFC = 'ไฟล์นี้ไม่ใช่ REP (eclaim OPCS) หรือ Statement (STM … OP) ของ OFC';
const CHUNK = 500;
const round2 = (value: number) => Math.round(value * 100) / 100;
const chunks = <T>(items: readonly T[]) => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, at) => items.slice(at * CHUNK, at * CHUNK + CHUNK));
const marks = (count: number, mark: string) => Array.from({ length: count }, () => mark).join(', ');
const instant = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(`${String(value).replace(' ', 'T')}Z`).toISOString());
const isoDay = (value: unknown) => (value === null || value === undefined ? '' : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

/**
 * Monitor Instrument OFC: OFC outpatient visits with ADP 8610 read live from HOSxP, matched by vn (= SEQ NO) to the stored REP
 * (Data Instrument) and Statement (พึงรับ). Only numbers, codes and dates are stored; a known line is replaced, so a file can be
 * uploaded again. `money.manage` uploads; managers and members given the `ofc` page read. Audit carries the kind and counts only.
 */
export class OfcService {
  constructor(
    private readonly database: Database,
    private readonly resolveConnection: () => Promise<HosxpConnection | null>,
    private readonly reader: OfcReader,
    private readonly createId: () => string = randomUUID
  ) {}

  async upload(subject: AccessSubject, input: OfcUpload): Promise<OfcUploadResult> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    const { sheets } = ofcUploadSchema.parse(input);
    const kind = ofcFileKind(sheets);
    if (!kind) return { ok: false, code: 'INVALID_REPORT', message: NOT_OFC };
    const parsed = kind === 'rep' ? parseOfcRep(sheets) : parseOfcStm(sheets);
    if (!parsed.ok) return { ok: false, code: 'INVALID_REPORT', message: parsed.message };
    if (parsed.lines.length === 0) return { ok: false, code: 'INVALID_REPORT', message: kind === 'rep' ? 'ไม่พบรายการในชีต Data Instrument' : 'ไม่พบรายการในชีตพึงรับ' };
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      let added = 0;
      let updated = 0;
      if (kind === 'rep') {
        const latest = new Map((parsed.lines as OfcRepLine[]).map((line) => [`${line.repNo}|${line.tranId}|${line.itemNo}`, line]));
        const known = new Set<string>();
        for (const part of chunks([...latest.values()])) {
          const found = await database.query<{ rep_no: string; tran_id: string; item_no: number }>(`SELECT rep_no, tran_id, item_no FROM money_ofc_rep WHERE (rep_no, tran_id, item_no) IN (${marks(part.length, '(?, ?, ?)')}) FOR UPDATE`, part.flatMap((line) => [line.repNo, line.tranId, line.itemNo]));
          for (const row of found) known.add(`${row.rep_no}|${row.tran_id}|${Number(row.item_no)}`);
        }
        for (const key of latest.keys()) if (known.has(key)) updated++; else added++;
        for (const part of chunks([...latest.values()])) {
          await database.execute(
            `INSERT INTO money_ofc_rep (rep_no, tran_id, item_no, vn, service_date, adp_code, item_name, qty, claim, paid, deny, error_code, uploaded_at, uploaded_by) VALUES ${marks(part.length, '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)')}
             ON DUPLICATE KEY UPDATE vn = VALUES(vn), service_date = VALUES(service_date), adp_code = VALUES(adp_code), item_name = VALUES(item_name), qty = VALUES(qty), claim = VALUES(claim), paid = VALUES(paid), deny = VALUES(deny), error_code = VALUES(error_code), uploaded_at = VALUES(uploaded_at), uploaded_by = VALUES(uploaded_by)`,
            part.flatMap((line) => [line.repNo.slice(0, 30), line.tranId.slice(0, 30), line.itemNo, line.vn.slice(0, 20), line.date || null, line.adp.slice(0, 15), line.itemName.slice(0, 255), round2(line.qty), round2(line.claim), round2(line.paid), line.deny.slice(0, 10), line.error.slice(0, 100), actor])
          );
        }
      } else {
        const latest = new Map((parsed.lines as OfcStmLine[]).map((line) => [`${line.docNo}|${line.repNo}|${line.vn}`, line]));
        const known = new Set<string>();
        for (const part of chunks([...latest.values()])) {
          const found = await database.query<{ doc_no: string; rep_no: string; vn: string }>(`SELECT doc_no, rep_no, vn FROM money_ofc_stm WHERE (doc_no, rep_no, vn) IN (${marks(part.length, '(?, ?, ?)')}) FOR UPDATE`, part.flatMap((line) => [line.docNo, line.repNo, line.vn]));
          for (const row of found) known.add(`${row.doc_no}|${row.rep_no}|${row.vn}`);
        }
        for (const key of latest.keys()) if (known.has(key)) updated++; else added++;
        for (const part of chunks([...latest.values()])) {
          await database.execute(
            `INSERT INTO money_ofc_stm (doc_no, rep_no, vn, service_date, claim, inst, total, uploaded_at, uploaded_by) VALUES ${marks(part.length, '(?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?)')}
             ON DUPLICATE KEY UPDATE service_date = VALUES(service_date), claim = VALUES(claim), inst = VALUES(inst), total = VALUES(total), uploaded_at = VALUES(uploaded_at), uploaded_by = VALUES(uploaded_by)`,
            part.flatMap((line) => [line.docNo.slice(0, 40), line.repNo.slice(0, 30), line.vn.slice(0, 20), line.date || null, round2(line.claim), round2(line.inst), round2(line.total), actor])
          );
        }
      }
      const rows = added + updated;
      await moneyAudit(database, this.createId, actor, 'money.ofc.upload', 'module', 'smart-money', { kind, rows, added, updated });
      return { ok: true as const, kind, rows, added, updated, skipped: parsed.skipped };
    });
  }

  /** The page for one range: HOSxP visits plus the REP lines of those visits (and of the range) and their Statement rows. */
  async load(subject: AccessSubject, start: string, end: string): Promise<OfcLoad> {
    if (!subject.personId) return { ok: false, code: 'FORBIDDEN' };
    if (!canManageMoney(subject) && !moneyCan(await loadMoneyMember(this.database, subject.personId), false, 'ofc')) return { ok: false, code: 'FORBIDDEN' };
    const connection = await this.resolveConnection();
    if (!connection) return { ok: false, code: 'NOT_CONFIGURED' };
    let rows: OfcRow[];
    try {
      rows = await this.reader(connection, start, end);
    } catch (error) {
      // The driver's message can name the host and user, so only its code is logged.
      const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code) : 'UNKNOWN';
      console.error('[smart-money] ofc HOSxP read failed', code);
      return { ok: false, code: 'HOSXP_FAILED' };
    }
    type RepRaw = { rep_no: string; tran_id: string; item_no: number; vn: string; service_date: unknown; adp_code: string; item_name: string; qty: unknown; claim: unknown; paid: unknown; deny: string; error_code: string };
    type StmRaw = { doc_no: string; rep_no: string; vn: string; service_date: unknown; claim: unknown; inst: unknown; total: unknown };
    const vns = [...new Set(rows.map((row) => row.vn))];
    const repRows = new Map<string, RepRaw>();
    const keep = (row: RepRaw) => repRows.set(`${row.rep_no}|${row.tran_id}|${row.item_no}`, row);
    for (const part of chunks(vns)) for (const row of await this.database.query<RepRaw>(`SELECT * FROM money_ofc_rep WHERE vn IN (${marks(part.length, '?')})`, part)) keep(row);
    for (const row of await this.database.query<RepRaw>('SELECT * FROM money_ofc_rep WHERE service_date BETWEEN ? AND ?', [start, end])) keep(row);
    const stmRows: StmRaw[] = [];
    for (const part of chunks(vns)) stmRows.push(...await this.database.query<StmRaw>(`SELECT * FROM money_ofc_stm WHERE vn IN (${marks(part.length, '?')})`, part));
    const reps = [...repRows.values()].map((row): OfcRepLine => ({
      repNo: row.rep_no, tranId: row.tran_id, itemNo: Number(row.item_no), vn: row.vn, date: isoDay(row.service_date), adp: row.adp_code, itemName: row.item_name,
      qty: Number(row.qty), claim: Number(row.claim), paid: Number(row.paid), deny: row.deny, error: row.error_code
    }));
    const stms = stmRows.map((row): OfcStmLine => ({ docNo: row.doc_no, repNo: row.rep_no, vn: row.vn, date: isoDay(row.service_date), claim: Number(row.claim), inst: Number(row.inst), total: Number(row.total) }));
    const latest = await this.database.query<{ at: Date | string | null }>('SELECT MAX(uploaded_at) AS at FROM (SELECT uploaded_at FROM money_ofc_rep UNION ALL SELECT uploaded_at FROM money_ofc_stm) uploads');
    const at = latest[0]?.at ?? null;
    return { ok: true, summary: summarizeOfc(rows, reps, stms), updatedAt: at ? instant(at) : null };
  }
}
