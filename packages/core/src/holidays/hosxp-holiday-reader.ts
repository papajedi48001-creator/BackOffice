import { createDatabase } from '@backoffice/db';
import type { HosxpHolidayReader } from './holiday-sync-service.ts';
import { hosxpConnectionUrl, type HosxpConnection } from './hosxp-settings-service.ts';

/** The URL is built in memory only; it holds the password, so it is never logged or returned. */

/** One read-only SELECT on HOSxP `holiday`; nothing is ever written to HOSxP. */
export const readHosxpHolidays: HosxpHolidayReader = async (connection) => {
  const hosxp = createDatabase(hosxpConnectionUrl(connection));
  try { return await hosxp.query<Record<string, unknown>>('SELECT * FROM holiday'); } finally { await hosxp.close(); }
};

/** ทดสอบการเชื่อมต่อ: counts the rows of `holiday` without reading them. */
export async function testHosxpConnection(connection: HosxpConnection): Promise<{ ok: true; rows: number } | { ok: false; code: 'CONNECTION_FAILED' }> {
  const hosxp = createDatabase(hosxpConnectionUrl(connection));
  try { const [row] = await hosxp.query<{ total: number }>('SELECT COUNT(*) AS total FROM holiday'); return { ok: true, rows: Number(row?.total ?? 0) }; }
  catch { return { ok: false, code: 'CONNECTION_FAILED' }; }
  finally { await hosxp.close().catch(() => undefined); }
}
