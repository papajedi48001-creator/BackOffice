import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service.ts';
import { DatabaseAuditRepository } from '../audit/database-audit-repository.ts';
import { mapHolidayRows, resolveHolidayColumns } from './holiday-rows.ts';
import type { HosxpConnection } from './hosxp-settings-service.ts';

export type HolidaySyncResult = { ok: true; count: number } | { ok: false; code: 'NOT_CONFIGURED' | 'CONNECTION_FAILED' | 'COLUMNS_NOT_FOUND' };
/** Reads HOSxP `holiday` read-only (a single SELECT); see `readHosxpHolidays`. */
export type HosxpHolidayReader = (connection: HosxpConnection) => Promise<Array<Record<string, unknown>>>;

const toDatetime = (instant: Date) => instant.toISOString().slice(0, 19).replace('T', ' ');

/** ดึงวันหยุดจาก HOSxP into leave_holiday. HOSxP rows are upserted as `HOSXP`; a `MANUAL` row for the same date is left as it is. */
export class HolidaySyncService {
  constructor(
    private readonly database: Database,
    private readonly connection: () => Promise<HosxpConnection | null>,
    private readonly read: HosxpHolidayReader,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID
  ) {}

  /** `actorPersonId` is null for the worker's daily run. Errors are reported by code only: driver messages can echo the user name. */
  async sync(actorPersonId: string | null): Promise<HolidaySyncResult> {
    const connection = await this.connection();
    if (!connection) return { ok: false, code: 'NOT_CONFIGURED' };
    let rows: Array<Record<string, unknown>>;
    try { rows = await this.read(connection); } catch { return this.finish(actorPersonId, { ok: false, code: 'CONNECTION_FAILED' }); }
    if (rows.length > 0 && !resolveHolidayColumns(Object.keys(rows[0]!), connection)) return this.finish(actorPersonId, { ok: false, code: 'COLUMNS_NOT_FOUND' });
    const entries = mapHolidayRows(rows, connection);
    const syncedAt = toDatetime(this.now());
    return this.database.transaction(async (database) => {
      for (const entry of entries) {
        await database.execute(
          "INSERT INTO leave_holiday (holiday_date, name, source, synced_at) VALUES (?, ?, 'HOSXP', ?) ON DUPLICATE KEY UPDATE name = IF(source = 'HOSXP', VALUES(name), name), synced_at = IF(source = 'HOSXP', VALUES(synced_at), synced_at)",
          [entry.date, entry.name, syncedAt]
        );
      }
      return this.finish(actorPersonId, { ok: true, count: entries.length }, database);
    });
  }

  private async finish(actorPersonId: string | null, result: HolidaySyncResult, database: Pick<Database, 'execute'> = this.database): Promise<HolidaySyncResult> {
    await database.execute('UPDATE hosxp_connection SET last_sync_at = UTC_TIMESTAMP(), last_sync_status = ?, last_sync_count = ? WHERE id = 1', [result.ok ? 'OK' : result.code, result.ok ? result.count : null]);
    await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'holiday.sync', targetType: 'leave_holiday', targetId: 'hosxp', result: result.ok ? 'SUCCESS' : 'FAILURE', metadata: result.ok ? { count: result.count } : { code: result.code } });
    return result;
  }
}
