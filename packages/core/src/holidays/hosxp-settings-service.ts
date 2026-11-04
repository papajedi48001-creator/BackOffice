import { randomUUID } from 'node:crypto';
import type { Database } from '@backoffice/db';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import type { ConnectionSecretBox } from './connection-secret-box';

/** Everything needed to read HOSxP `holiday`. Only server code holds this; it never goes to a browser, log or audit row. */
export interface HosxpConnection { host: string; port: number; database: string; user: string; password: string; dateColumn: string; nameColumn: string }
export interface HosxpSettingsInput { host: string; port: number; database: string; user: string; password: string; dateColumn: string; nameColumn: string }
/** What the admin page shows: never the password, only whether one is set. */
export interface HosxpSettingsView { source: 'SETTINGS' | 'ENV' | 'NONE'; host: string; port: number; database: string; user: string; passwordSet: boolean; dateColumn: string; nameColumn: string; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncCount: number | null; canStorePassword: boolean }
type Row = { host: string; port: number; databaseName: string; username: string; passwordCiphertext: string | null; dateColumn: string; nameColumn: string; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncCount: number | null };

const DEFAULT_COLUMNS = { dateColumn: 'holiday_date', nameColumn: 'day_name' };
const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const hostPattern = /^[A-Za-z0-9.-]{1,255}$/;

/** `mysql://user:pass@host:3306/hos` → a connection; null when it is missing or not a mysql URL. */
export function parseHosxpUrl(url: string | undefined): HosxpConnection | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['mysql:', 'mariadb:'].includes(parsed.protocol) || !parsed.hostname) return null;
    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    if (!database) return null;
    return { host: parsed.hostname, port: Number(parsed.port || 3306), database, user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password), ...DEFAULT_COLUMNS };
  } catch { return null; }
}

/** The HOSxP connection under ตั้งค่าการเชื่อมต่อ. Saved settings win; HOSXP_DATABASE_URL is the fallback when none are saved. */
export class HosxpSettingsService {
  constructor(private readonly database: Database, private readonly box: ConnectionSecretBox | null, private readonly env: (name: string) => string | undefined, private readonly createId: () => string = randomUUID) {}

  private async row(): Promise<Row | null> {
    const [row] = await this.database.query<Row>("SELECT host, port, database_name AS databaseName, username, password_ciphertext AS passwordCiphertext, date_column AS dateColumn, name_column AS nameColumn, DATE_FORMAT(last_sync_at, '%Y-%m-%dT%H:%i:%sZ') AS lastSyncAt, last_sync_status AS lastSyncStatus, last_sync_count AS lastSyncCount FROM hosxp_connection WHERE id = 1");
    return row ?? null;
  }

  async view(): Promise<HosxpSettingsView> {
    const row = await this.row();
    const canStorePassword = this.box !== null;
    if (row) return { source: 'SETTINGS', host: row.host, port: Number(row.port), database: row.databaseName, user: row.username, passwordSet: Boolean(row.passwordCiphertext), dateColumn: row.dateColumn, nameColumn: row.nameColumn, lastSyncAt: row.lastSyncAt, lastSyncStatus: row.lastSyncStatus, lastSyncCount: row.lastSyncCount === null ? null : Number(row.lastSyncCount), canStorePassword };
    const env = parseHosxpUrl(this.env('HOSXP_DATABASE_URL'));
    if (env) return { source: 'ENV', host: env.host, port: env.port, database: env.database, user: env.user, passwordSet: Boolean(env.password), ...DEFAULT_COLUMNS, lastSyncAt: null, lastSyncStatus: null, lastSyncCount: null, canStorePassword };
    return { source: 'NONE', host: '', port: 3306, database: 'hos', user: '', passwordSet: false, ...DEFAULT_COLUMNS, lastSyncAt: null, lastSyncStatus: null, lastSyncCount: null, canStorePassword };
  }

  /** The connection to use now, with the password opened; null when nothing is configured or the password cannot be opened. */
  async resolve(): Promise<HosxpConnection | null> {
    const row = await this.row();
    if (!row) return parseHosxpUrl(this.env('HOSXP_DATABASE_URL'));
    let password = '';
    if (row.passwordCiphertext) {
      if (!this.box) return null;
      try { password = this.box.open(row.passwordCiphertext); } catch { return null; }
    }
    return { host: row.host, port: Number(row.port), database: row.databaseName, user: row.username, password, dateColumn: row.dateColumn, nameColumn: row.nameColumn };
  }

  /** Saves the settings. A blank password keeps the stored one. Audit metadata names the changed fields only. */
  async save(input: HosxpSettingsInput, actorPersonId: string): Promise<{ ok: true } | { ok: false; code: 'INVALID_INPUT' | 'NO_SECRET_KEY' }> {
    const valid = { host: input.host.trim(), port: Number(input.port), database: input.database.trim(), user: input.user.trim(), password: input.password, dateColumn: input.dateColumn.trim() || DEFAULT_COLUMNS.dateColumn, nameColumn: input.nameColumn.trim() || DEFAULT_COLUMNS.nameColumn };
    if (!hostPattern.test(valid.host) || !Number.isInteger(valid.port) || valid.port < 1 || valid.port > 65535 || !identifier.test(valid.database) || !valid.user || valid.user.length > 64 || valid.password.length > 256 || !identifier.test(valid.dateColumn) || !identifier.test(valid.nameColumn)) return { ok: false, code: 'INVALID_INPUT' };
    if (valid.password && !this.box) return { ok: false, code: 'NO_SECRET_KEY' };
    const sealed = valid.password ? this.box!.seal(valid.password) : null;
    await this.database.transaction(async (database) => {
      await database.execute(
        'INSERT INTO hosxp_connection (id, host, port, database_name, username, password_ciphertext, date_column, name_column, updated_by_person_id, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE host = VALUES(host), port = VALUES(port), database_name = VALUES(database_name), username = VALUES(username), password_ciphertext = COALESCE(VALUES(password_ciphertext), password_ciphertext), date_column = VALUES(date_column), name_column = VALUES(name_column), updated_by_person_id = VALUES(updated_by_person_id), updated_at = VALUES(updated_at)',
        [valid.host, valid.port, valid.database, valid.user, sealed, valid.dateColumn, valid.nameColumn, actorPersonId]
      );
      await new AuditService(new DatabaseAuditRepository(database), this.createId).recordAudit({ actorPersonId, action: 'admin.hosxp_connection.update', targetType: 'hosxp_connection', targetId: '1', result: 'SUCCESS', metadata: { changedFields: ['host', 'port', 'database', 'user', ...(sealed ? ['password'] : []), 'dateColumn', 'nameColumn'] } });
    });
    return { ok: true };
  }
}
