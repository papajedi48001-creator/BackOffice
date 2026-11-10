import { NextResponse } from 'next/server';
import { canManageLab, LabOpeningService, LabQueries, LabReceiptService, LabRequisitionService, LabSettingsService, LabUsageService, labCan, loadLabMember, type LabAction } from '@backoffice/core';
import type { Database } from '@backoffice/db';
import { forbidden, readInput, withSessionAndDatabase } from '../hr/profile-route';

export { forbidden, readInput, withSessionAndDatabase };

export const labSettings = (database: Database) => new LabSettingsService(database);
export const labOpening = (database: Database) => new LabOpeningService(database);
export const labReceipts = (database: Database) => new LabReceiptService(database);
export const labRequisitions = (database: Database) => new LabRequisitionService(database);
export const labUsages = (database: Database) => new LabUsageService(database);
export const labQueries = (database: Database) => new LabQueries(database);

const statusByCode: Record<string, number> = {
  NOT_FOUND: 404, FORBIDDEN: 403,
  WRONG_STATUS: 409, OPENING_NOT_CERTIFIED: 409, CONFLICT_OF_INTEREST: 409, RECEIPT_LOT_IN_USE: 409, ITEM_HAS_STOCK: 409, DUPLICATE: 409, PROTECTED: 409, INSUFFICIENT_STOCK: 409, LOT_EXPIRED: 409
};

/** A service result as JSON: `{ error: code }` (plus CSV row errors) with 403/404/409 where the code says so, otherwise 400. */
export function labResult(result: { ok: true } | { ok: false; code: string; errors?: unknown }, okStatus = 200): Response {
  if (result.ok) return NextResponse.json(result, { status: okStatus });
  return NextResponse.json({ error: result.code, ...(result.errors ? { errors: result.errors } : {}) }, { status: statusByCode[result.code] ?? 400 });
}

type Subject = Parameters<typeof canManageLab>[0] & { personId: string };

/** Whether the signed-in person may `action` in the store (`'ALL'` = the whole Lab, which a เจ้าหน้าที่ never may). */
export async function mayInStore(database: Database, session: Subject, action: LabAction, storeId: string): Promise<boolean> {
  const member = await loadLabMember(database, session.personId);
  const manages = canManageLab(session);
  if (storeId === 'ALL') return labCan(member, manages, action, null) && (manages || member?.role !== 'STAFF');
  const [store] = await database.query<{ kind: string; section_id: string | null }>('SELECT kind, section_id FROM lab_store WHERE id = ?', [storeId]);
  if (!store) return false;
  return labCan(member, manages, action, store.section_id);
}

export async function may(database: Database, session: Subject, action: LabAction): Promise<boolean> {
  return labCan(await loadLabMember(database, session.personId), canManageLab(session), action);
}
