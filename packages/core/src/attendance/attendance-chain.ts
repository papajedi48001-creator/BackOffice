import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';

/**
 * สายแฮชของระบบลงเวลา: every audit row of the module (and, from delivery step 3, every รายการลงเวลา) is linked to the one
 * before it, so a row changed or removed afterwards is found by `verifyChain` even where the database user could edit it.
 */
export const GENESIS_HASH = '0'.repeat(64);
const PAGE = 500;

export type ChainRecordType = 'audit_event';
export interface ChainRow { seq: number; recordType: string; recordId: string; prevHash: string; hash: string }
export type ChainCheck = { ok: true; length: number } | { ok: false; brokenAtSeq: number; reason: 'HASH_MISMATCH' | 'RECORD_MISSING' | 'PREV_MISMATCH' | 'SEQ_GAP' | 'HEAD_MISMATCH' };

/** JSON with keys sorted at every depth and no whitespace, so the same record always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]));
  return value;
}

export function chainHash(prevHash: string, recordType: string, recordId: string, canonical: string): string {
  return createHash('sha256').update(`${prevHash}\n${recordType}\n${recordId}\n${canonical}`).digest('hex');
}

/**
 * Checks consecutive chain rows starting after `start`. `head` is checked only when given (the last page). `canonicalOf`
 * returns the record as stored now, or `null` when it is gone.
 */
export function checkChain(rows: readonly ChainRow[], canonicalOf: (row: ChainRow) => string | null, head: { lastSeq: number; lastHash: string } | null, start = { seq: 0, hash: GENESIS_HASH }): ChainCheck {
  let previous = start;
  for (const row of rows) {
    if (row.seq !== previous.seq + 1) return { ok: false, brokenAtSeq: row.seq, reason: 'SEQ_GAP' };
    if (row.prevHash !== previous.hash) return { ok: false, brokenAtSeq: row.seq, reason: 'PREV_MISMATCH' };
    const canonical = canonicalOf(row);
    if (canonical === null) return { ok: false, brokenAtSeq: row.seq, reason: 'RECORD_MISSING' };
    if (chainHash(row.prevHash, row.recordType, row.recordId, canonical) !== row.hash) return { ok: false, brokenAtSeq: row.seq, reason: 'HASH_MISMATCH' };
    previous = { seq: row.seq, hash: row.hash };
  }
  if (head && (head.lastSeq !== previous.seq || head.lastHash !== previous.hash)) return { ok: false, brokenAtSeq: previous.seq + 1, reason: 'HEAD_MISMATCH' };
  return { ok: true, length: previous.seq - start.seq };
}

type Reader = (database: Pick<Database, 'query'>, ids: readonly string[]) => Promise<Map<string, Record<string, unknown>>>;

/** How each chained record type is read back. Times are formatted in SQL so the hash never depends on the process time zone. A later delivery step adds `attendance_event`. */
export const chainRecordReaders: Record<ChainRecordType, Reader> = {
  audit_event: async (database, ids) => {
    if (ids.length === 0) return new Map();
    const rows = await database.query<Record<string, unknown> & { id: string }>(`SELECT id, actor_person_id, action, target_type, target_id, result, metadata, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at, actor_role FROM audit_event WHERE id IN (${ids.map(() => '?').join(', ')})`, [...ids]);
    return new Map(rows.map((row) => [row.id, row]));
  }
};

/** Adds one record to the chain. Runs inside the caller's transaction; the head row lock keeps the chain in one line. */
export async function appendToChain(tx: Database, recordType: ChainRecordType, recordId: string): Promise<{ seq: number; hash: string }> {
  const [head] = await tx.query<{ lastSeq: number; lastHash: string }>('SELECT last_seq AS lastSeq, last_hash AS lastHash FROM attendance_hash_chain_head WHERE id = 1 FOR UPDATE');
  if (!head) throw new Error('attendance_hash_chain_head_missing');
  const record = (await chainRecordReaders[recordType](tx, [recordId])).get(recordId);
  if (!record) throw new Error('attendance_chain_record_missing');
  const seq = Number(head.lastSeq) + 1;
  const hash = chainHash(head.lastHash, recordType, recordId, canonicalJson(record));
  await tx.execute('INSERT INTO attendance_hash_chain (seq, record_type, record_id, prev_hash, hash, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())', [seq, recordType, recordId, head.lastHash, hash]);
  await tx.execute('UPDATE attendance_hash_chain_head SET last_seq = ?, last_hash = ? WHERE id = 1', [seq, hash]);
  return { seq, hash };
}

/**
 * Every transaction that appends to the chain. READ COMMITTED lets the head row lock see a head another action committed
 * after this transaction's first read; under MariaDB 11.8's snapshot isolation that lock would fail with ER_CHECKREAD.
 */
export function attendanceTransaction<T>(database: Database, work: (tx: Database) => Promise<T>): Promise<T> {
  return database.transaction(work, { isolationLevel: 'READ COMMITTED' });
}

/** One audit row of the module plus its chain row, inside the caller's transaction. Metadata carries ids and codes only. */
export async function attendanceAudit(tx: Database, actorPersonId: string | null, action: string, targetType: string, targetId: string, metadata: Record<string, unknown>): Promise<void> {
  const auditId = randomUUID();
  await new AuditService(new DatabaseAuditRepository(tx), () => auditId).recordAudit({ actorPersonId, action, targetType, targetId, result: 'SUCCESS', metadata });
  await appendToChain(tx, 'audit_event', auditId);
}

/** ตรวจสอบความต่อเนื่อง: walks the chain up to the head read first, in pages, and re-hashes every record as it is stored now. */
export async function verifyChain(database: Pick<Database, 'query'>): Promise<ChainCheck> {
  const [head] = await database.query<{ lastSeq: number; lastHash: string }>('SELECT last_seq AS lastSeq, last_hash AS lastHash FROM attendance_hash_chain_head WHERE id = 1');
  if (!head) return { ok: false, brokenAtSeq: 1, reason: 'HEAD_MISMATCH' };
  const finalHead = { lastSeq: Number(head.lastSeq), lastHash: head.lastHash };
  let start = { seq: 0, hash: GENESIS_HASH };
  for (;;) {
    const rows = (await database.query<ChainRow>('SELECT seq, record_type AS recordType, record_id AS recordId, prev_hash AS prevHash, hash FROM attendance_hash_chain WHERE seq > ? AND seq <= ? ORDER BY seq LIMIT ?', [start.seq, finalHead.lastSeq, PAGE])).map((row) => ({ ...row, seq: Number(row.seq) }));
    const records = new Map<string, Map<string, Record<string, unknown>>>();
    for (const type of new Set(rows.map((row) => row.recordType))) {
      const reader = chainRecordReaders[type as ChainRecordType];
      records.set(type, reader ? await reader(database, rows.filter((row) => row.recordType === type).map((row) => row.recordId)) : new Map());
    }
    const last = rows.length < PAGE;
    const check = checkChain(rows, (row) => { const record = records.get(row.recordType)?.get(row.recordId); return record ? canonicalJson(record) : null; }, last ? finalHead : null, start);
    if (!check.ok || last) return check.ok ? { ok: true, length: finalHead.lastSeq } : check;
    start = { seq: rows.at(-1)!.seq, hash: rows.at(-1)!.hash };
  }
}
