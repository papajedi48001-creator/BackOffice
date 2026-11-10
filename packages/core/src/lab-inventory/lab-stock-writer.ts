import { randomUUID } from 'node:crypto';
import { LAB_MODULE, type LabMovementKind } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { bangkokDate } from '../rooms/booking-days';
import { formatDocNo } from './lab-rules';
import type { LotOption } from './lab-rules';
import { labOutbox } from './lab-db';

/** A refusal raised inside a stock transaction; services turn it into `{ ok: false, code }` after the rollback. */
export class LabRefusal extends Error { constructor(readonly code: string) { super(code); } }

/** Today's date in Bangkok, `YYYY-MM-DD`. */
export const labToday = (now: Date = new Date()) => bangkokDate(now);

/** The lots of one item in one store with stock, locked until the transaction ends. */
export async function lockBalances(database: Database, storeId: string, itemId: string): Promise<LotOption[]> {
  const rows = await database.query<{ lot_id: string; expiry_date: string | Date | null; created_at: string | Date; quantity: number }>(
    'SELECT b.lot_id, l.expiry_date, l.created_at, b.quantity FROM lab_lot_balance b JOIN lab_lot l ON l.id = b.lot_id WHERE b.store_id = ? AND l.item_id = ? ORDER BY b.lot_id FOR UPDATE', [storeId, itemId]);
  return rows.map((row) => ({ lotId: row.lot_id, expiryDate: dateOnly(row.expiry_date), createdAt: new Date(row.created_at).toISOString(), available: Number(row.quantity) }));
}

export function dateOnly(value: string | Date | null): string | null {
  if (value === null) return null;
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return value.slice(0, 10);
}

export type Movement = { lotId: string; storeId: string; quantity: number; kind: LabMovementKind; entryDate: string; usageTypeId?: string | null; refType: string; refId: string; note?: string; actorPersonId: string };

/** Changes one lot's stock in one store and records the movement. A balance that would go below zero refuses `INSUFFICIENT_STOCK`. */
export async function move(database: Database, movement: Movement, createId: () => string = randomUUID): Promise<void> {
  const [current] = await database.query<{ quantity: number }>('SELECT quantity FROM lab_lot_balance WHERE lot_id = ? AND store_id = ? FOR UPDATE', [movement.lotId, movement.storeId]);
  const next = Number(current?.quantity ?? 0) + movement.quantity;
  if (next < 0) throw new LabRefusal('INSUFFICIENT_STOCK');
  if (current) await database.execute('UPDATE lab_lot_balance SET quantity = ? WHERE lot_id = ? AND store_id = ?', [next, movement.lotId, movement.storeId]);
  else await database.execute('INSERT INTO lab_lot_balance (lot_id, store_id, quantity) VALUES (?, ?, ?)', [movement.lotId, movement.storeId, next]);
  await database.execute('INSERT INTO lab_movement (id, lot_id, store_id, quantity, kind, entry_date, usage_type_id, ref_type, ref_id, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))',
    [createId(), movement.lotId, movement.storeId, movement.quantity, movement.kind, movement.entryDate, movement.usageTypeId ?? null, movement.refType, movement.refId, movement.note ?? '', movement.actorPersonId]);
}

/** The lot with this item, lot number, expiry and cost, created when it does not exist yet. */
export async function findOrCreateLot(database: Database, lot: { itemId: string; lotNo: string; expiryDate: string | null; unitCost: string; source: 'OPENING' | 'RECEIPT'; receiptLineId?: string | null }, createId: () => string = randomUUID): Promise<string> {
  const id = createId();
  await database.execute('INSERT IGNORE INTO lab_lot (id, item_id, lot_no, expiry_date, unit_cost, source, receipt_line_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))', [id, lot.itemId, lot.lotNo, lot.expiryDate, lot.unitCost, lot.source, lot.receiptLineId ?? null]);
  const [row] = await database.query<{ id: string }>("SELECT id FROM lab_lot WHERE item_id = ? AND lot_no = ? AND expiry_key = IFNULL(?, '9999-12-31') AND unit_cost = ?", [lot.itemId, lot.lotNo, lot.expiryDate, lot.unitCost]);
  return row!.id;
}

export async function openingStatus(database: Database, lock = false): Promise<string> {
  const [row] = await database.query<{ v: string }>(`SELECT setting_value AS v FROM lab_setting WHERE setting_key = 'opening_status'${lock ? ' FOR UPDATE' : ''}`);
  return row?.v ?? 'DRAFT';
}

/** No stock moves (other than the opening itself) until หัวหน้า Lab certifies the ยอดยกมา. */
export async function requireCertified(database: Database): Promise<void> {
  if ((await openingStatus(database)) !== 'CERTIFIED') throw new LabRefusal('OPENING_NOT_CERTIFIED');
}

/** The next เลขเอกสาร for the fiscal year, serialised by the counter row lock. */
export async function nextDocNo(database: Database, prefix: 'LR' | 'LQ', fiscalYear: number): Promise<string> {
  await database.execute('INSERT INTO lab_doc_counter (prefix, fiscal_year, last_no) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE last_no = last_no + 1', [prefix, fiscalYear]);
  const [row] = await database.query<{ last_no: number }>('SELECT last_no FROM lab_doc_counter WHERE prefix = ? AND fiscal_year = ?', [prefix, fiscalYear]);
  return formatDocNo(prefix, fiscalYear, Number(row!.last_no));
}

/** One bell notice in the caller's transaction; the payload carries the subject and a link only, never a reason. */
export function labBell(database: Database, key: string, recipientPersonId: string, subject: string, targetPath: string, createId: () => string = randomUUID): Promise<void> {
  return labOutbox(database, 'notification.in_app', `notification.in_app:${key}:${recipientPersonId}`, { recipientPersonId, subject, targetPath, moduleCode: LAB_MODULE }, createId);
}

export async function membersWithRole(database: Database, role: 'HEAD' | 'KEEPER'): Promise<string[]> {
  return (await database.query<{ person_id: string }>('SELECT person_id FROM lab_member WHERE role = ?', [role])).map((row) => row.person_id);
}

/**
 * Runs stock work in one READ COMMITTED transaction (locking reads see what other transactions committed) and turns a
 * `LabRefusal` into `{ ok: false, code }` after the rollback; a missing referenced row is `NOT_FOUND`.
 */
export async function labTransaction<T extends { ok: true }, C extends string>(database: Database, work: (database: Database) => Promise<T>): Promise<T | { ok: false; code: C }> {
  try {
    return await database.transaction(work, { isolationLevel: 'READ COMMITTED' });
  } catch (error) {
    if (error instanceof LabRefusal) return { ok: false, code: error.code as C };
    const { code, errno } = (typeof error === 'object' && error !== null ? error : {}) as { code?: string; errno?: number };
    if (code === 'ER_NO_REFERENCED_ROW_2' || errno === 1452) return { ok: false, code: 'NOT_FOUND' as C };
    throw error;
  }
}
