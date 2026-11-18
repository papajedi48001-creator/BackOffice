import { createHash, randomUUID } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { fdhUploadSchema, type AccessSubject, type FdhKind, type FdhUpload } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { parseFdhDocument, type FdhRep, type FdhStm } from './fdh-report';
import type { HerbRepDoc } from './herb-summary';
import { canManageMoney, loadMoneyMember, moneyCan } from './money-access';
import { moneyAudit } from './money-db';

/** Encrypts the parsed document (it holds PID and patient names); `NationalIdProtector` in production. */
export type FdhCipher = { encrypt(text: string): string; decrypt(text: string): string };

/** The packed document is kept under this so that its ciphertext stays under MariaDB's default 16 MB packet. */
const MAX_PACKED = 10 * 1024 * 1024;
const PACKED = 'z1:';

/**
 * The parsed JSON compressed (raw deflate, base64) before it is encrypted: about ten times smaller, so a REP or STM of
 * 30,000 rows fits as it did in the legacy page. `z1:` marks the format; plain JSON is still read.
 */
export function packFdhDocument(json: string): string {
  return PACKED + deflateRawSync(Buffer.from(json, 'utf8')).toString('base64');
}
export function unpackFdhDocument(text: string): string {
  return text.startsWith(PACKED) ? inflateRawSync(Buffer.from(text.slice(PACKED.length), 'base64')).toString('utf8') : text;
}

/** One stored document without its cases/rows: what the files page lists (legacy `FdhStore::summaries`). */
export type FdhDocumentSummary = {
  kind: FdhKind; docNo: string; hcode: string | null; hname: string; period: string; reportDate: string | null;
  fileName: string; count: number; sum: number; uploadedAt: string;
};
/** What the dashboard reads: the legacy document plus `file_name` and `uploaded_at` (ISO, UTC), as `data.php` gave it. */
export type FdhStored<T> = T & { file_name: string; uploaded_at: string };
export type FdhUploadResult =
  | { ok: true; kind: FdhKind; docNo: string; period: string; items: number; replaced: boolean }
  | { ok: false; code: 'FORBIDDEN' }
  | { ok: false; code: 'INVALID_REPORT' | 'NOT_CONFIGURED'; message: string };
type Denied = { ok: false; code: 'FORBIDDEN' };
type Row = {
  kind: FdhKind; doc_no: string; hcode: string | null; hname: string; period: string; report_date: string | Date | null; file_name: string;
  item_count: number; money_sum: string | number; uploaded_at: Date | string; document_ciphertext?: string;
};

const COLUMNS = 'kind, doc_no, hcode, hname, period, report_date, file_name, item_count, money_sum, uploaded_at';
const day = (value: string | Date | null) => (value === null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const instant = (value: Date | string) => (value instanceof Date ? value.toISOString() : new Date(`${String(value).replace(' ', 'T')}Z`).toISOString());
const summary = (row: Row): FdhDocumentSummary => ({
  kind: row.kind, docNo: row.doc_no, hcode: row.hcode, hname: row.hname, period: row.period, reportDate: day(row.report_date),
  fileName: row.file_name, count: Number(row.item_count), sum: Number(row.money_sum), uploadedAt: instant(row.uploaded_at)
});
/** PHP `strcmp` order (byte order), which the legacy store and pages used. */
const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const round2 = (value: number) => Math.round(value * 100) / 100;
/** Audit target: a fixed-length hash of kind and เลขที่เอกสาร (target_id is 36 characters; the number itself stays out of audit). */
const auditTarget = (kind: FdhKind, docNo: string) => createHash('sha256').update(`${kind}:${docNo}`).digest('hex').slice(0, 32);
const MESSAGE_NOT_CONFIGURED = 'ยังไม่ได้ตั้งค่ากุญแจเข้ารหัสข้อมูลผู้ป่วย (NATIONAL_ID_ENCRYPTION_KEY) ติดต่อผู้ดูแลระบบ';

/**
 * ติดตามกองทุนย่อย FDH: one REP or STM document per (kind, เลขที่เอกสาร); uploading it again replaces it. A `money.manage`
 * holder uploads and deletes; managers and members with the `fdh` page read. The parsed document is stored encrypted, and
 * audit carries the kind and counts only.
 */
export class FdhDocumentService {
  constructor(private readonly database: Database, private readonly cipher: FdhCipher | null, private readonly createId: () => string = randomUUID) {}

  async upload(subject: AccessSubject, input: FdhUpload): Promise<FdhUploadResult> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    if (!this.cipher) return { ok: false, code: 'NOT_CONFIGURED', message: MESSAGE_NOT_CONFIGURED };
    const { fileName, sheets } = fdhUploadSchema.parse(input);
    const name = fileName.split(/[\\/]/).pop() ?? fileName;
    if (!/\.(xls|xlsx)$/i.test(name)) return { ok: false, code: 'INVALID_REPORT', message: 'รับเฉพาะไฟล์ .xls .xlsx (หรือ .zip ที่มีไฟล์เหล่านี้)' };
    const parsed = parseFdhDocument(sheets, name);
    if (!parsed.ok) return { ok: false, code: 'INVALID_REPORT', message: parsed.message };
    const document = parsed.document;
    if (document.doc_no.length > 100) return { ok: false, code: 'INVALID_REPORT', message: 'เลขที่เอกสารไม่ถูกต้อง' };
    const packed = packFdhDocument(JSON.stringify(document));
    if (packed.length > MAX_PACKED) return { ok: false, code: 'INVALID_REPORT', message: 'ไฟล์ใหญ่เกินไป' };
    const kind = document.type;
    const items = kind === 'rep' ? document.cases.length : document.rows.length;
    const sum = round2(kind === 'rep' ? document.cases.reduce((total, item) => total + item.net, 0) : document.rows.reduce((total, row) => total + row.total, 0));
    const period = kind === 'stm' ? document.period : '';
    const ciphertext = this.cipher.encrypt(packed);
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      const replaced = (await database.query('SELECT doc_no FROM money_fdh_document WHERE kind = ? AND doc_no = ? FOR UPDATE', [kind, document.doc_no])).length > 0;
      await database.execute(
        `INSERT INTO money_fdh_document (${COLUMNS}, document_ciphertext, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), ?, ?)
         ON DUPLICATE KEY UPDATE hcode = VALUES(hcode), hname = VALUES(hname), period = VALUES(period), report_date = VALUES(report_date), file_name = VALUES(file_name),
           item_count = VALUES(item_count), money_sum = VALUES(money_sum), uploaded_at = VALUES(uploaded_at), document_ciphertext = VALUES(document_ciphertext), uploaded_by = VALUES(uploaded_by)`,
        [kind, document.doc_no, document.hcode || null, kind === 'rep' ? document.hname : '', period, document.report_date || null, name, items, sum, ciphertext, actor]
      );
      await moneyAudit(database, this.createId, actor, 'money.fdh.upload', 'fdh_document', auditTarget(kind, document.doc_no), { kind, rows: items });
      return { ok: true as const, kind, docNo: document.doc_no, period, items, replaced };
    });
  }

  /** The files page: STM newest งวด first, REP newest เลขที่เอกสาร first, as the legacy upload page. */
  async list(subject: AccessSubject): Promise<{ ok: true; reps: FdhDocumentSummary[]; stms: FdhDocumentSummary[] } | Denied> {
    if (!(await this.mayView(subject))) return { ok: false, code: 'FORBIDDEN' };
    const rows = (await this.database.query<Row>(`SELECT ${COLUMNS} FROM money_fdh_document`)).map(summary);
    return {
      ok: true,
      reps: rows.filter((row) => row.kind === 'rep').sort((a, b) => byteOrder(b.docNo, a.docNo)),
      stms: rows.filter((row) => row.kind === 'stm').sort((a, b) => byteOrder(b.period, a.period))
    };
  }

  /** The dashboard: every document, decrypted, by เลขที่เอกสาร (the legacy `FdhStore::all` order, which `buildCases` relies on). */
  async all(subject: AccessSubject): Promise<{ ok: true; reps: FdhStored<FdhRep>[]; stms: FdhStored<FdhStm>[] } | Denied | { ok: false; code: 'NOT_CONFIGURED'; message: string }> {
    if (!(await this.mayView(subject))) return { ok: false, code: 'FORBIDDEN' };
    const rows = await this.database.query<Row>(`SELECT ${COLUMNS}, document_ciphertext FROM money_fdh_document`);
    if (rows.length && !this.cipher) return { ok: false, code: 'NOT_CONFIGURED', message: MESSAGE_NOT_CONFIGURED };
    const open = (row: Row) => ({ ...(JSON.parse(unpackFdhDocument(this.cipher!.decrypt(row.document_ciphertext ?? ''))) as FdhRep | FdhStm), file_name: row.file_name, uploaded_at: instant(row.uploaded_at) });
    const sorted = [...rows].sort((a, b) => byteOrder(a.doc_no, b.doc_no));
    return {
      ok: true,
      reps: sorted.filter((row) => row.kind === 'rep').map(open) as FdhStored<FdhRep>[],
      stms: sorted.filter((row) => row.kind === 'stm').map(open) as FdhStored<FdhStm>[]
    };
  }

  /**
   * การจ่ายยาสมุนไพร: each REP reduced to what its รับจริง reads (TRAN_ID, SEQ, กองทุนย่อย, and Data Drug icode/type/paid); no PID or
   * name leaves the store for that page. Members with the `herb` or `fdh` page and Smart Money managers may read it.
   */
  async herbRep(subject: AccessSubject): Promise<{ ok: true; docs: HerbRepDoc[]; unreadable: number } | Denied | { ok: false; code: 'NOT_CONFIGURED'; message: string }> {
    if (!subject.personId) return { ok: false, code: 'FORBIDDEN' };
    if (!canManageMoney(subject)) {
      const member = await loadMoneyMember(this.database, subject.personId);
      if (!moneyCan(member, false, 'herb') && !moneyCan(member, false, 'fdh')) return { ok: false, code: 'FORBIDDEN' };
    }
    const rows = await this.database.query<Row>(`SELECT ${COLUMNS}, document_ciphertext FROM money_fdh_document WHERE kind = 'rep'`);
    if (rows.length && !this.cipher) return { ok: false, code: 'NOT_CONFIGURED', message: MESSAGE_NOT_CONFIGURED };
    const docs: HerbRepDoc[] = [];
    let unreadable = 0;
    for (const row of [...rows].sort((a, b) => byteOrder(a.doc_no, b.doc_no))) {
      let rep: FdhRep;
      try {
        rep = JSON.parse(unpackFdhDocument(this.cipher!.decrypt(row.document_ciphertext ?? ''))) as FdhRep;
      } catch {
        unreadable += 1; // a damaged row or a changed key: the page still shows HOSxP numbers and says how many files could not be read
        continue;
      }
      docs.push({
        doc_no: rep.doc_no, report_date: rep.report_date,
        cases: (rep.cases ?? []).map((item) => ({ tran_id: item.tran_id, seq: item.seq, sub_fund: item.sub_fund })),
        drugs: (rep.drugs ?? []).map((drug) => ({ tran_id: drug.tran_id, icode: drug.icode, type: drug.type, paid: drug.paid }))
      });
    }
    return { ok: true, docs, unreadable };
  }

  async remove(subject: AccessSubject, kind: FdhKind, docNo: string): Promise<{ ok: true } | Denied | { ok: false; code: 'NOT_FOUND' }> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      if ((await database.query('SELECT doc_no FROM money_fdh_document WHERE kind = ? AND doc_no = ? FOR UPDATE', [kind, docNo])).length === 0) return { ok: false as const, code: 'NOT_FOUND' as const };
      await database.execute('DELETE FROM money_fdh_document WHERE kind = ? AND doc_no = ?', [kind, docNo]);
      await moneyAudit(database, this.createId, actor, 'money.fdh.remove', 'fdh_document', auditTarget(kind, docNo), { kind });
      return { ok: true as const };
    });
  }

  /** ลบ REP/STM ทั้งหมด: every document of one kind. */
  async removeAll(subject: AccessSubject, kind: FdhKind): Promise<{ ok: true; removed: number } | Denied> {
    if (!subject.personId || !canManageMoney(subject)) return { ok: false, code: 'FORBIDDEN' };
    const actor = subject.personId;
    return this.database.transaction(async (database) => {
      const removed = (await database.query('SELECT doc_no FROM money_fdh_document WHERE kind = ? FOR UPDATE', [kind])).length;
      await database.execute('DELETE FROM money_fdh_document WHERE kind = ?', [kind]);
      await moneyAudit(database, this.createId, actor, 'money.fdh.remove_all', 'module', 'smart-money', { kind, documents: removed });
      return { ok: true as const, removed };
    });
  }

  private async mayView(subject: AccessSubject): Promise<boolean> {
    if (!subject.personId) return false;
    return canManageMoney(subject) || moneyCan(await loadMoneyMember(this.database, subject.personId), false, 'fdh');
  }
}
