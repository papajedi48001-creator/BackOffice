import { randomUUID } from 'node:crypto';
import type { SetupAdminInput, SetupDatabaseInput, SetupErrorCode } from '@backoffice/contracts';
import { pendingMigrations, runMigrations, type Database } from '@backoffice/db';
import { ADMIN_ROLE } from '../access/authorization-service';
import { AuditService } from '../audit/audit-service';
import { DatabaseAuditRepository } from '../audit/database-audit-repository';
import type { NationalIdProtector } from '../crypto/national-id';
import { applyProfileUpdate, lockProfileSubject } from '../hr/profile-service';
import { hashPassword } from '../identity/auth-service';
import { buildDatabaseUrl } from './database-url';

export class SetupError extends Error {
  constructor(readonly code: SetupErrorCode) { super(code); this.name = 'SetupError'; }
}

export interface FirstRunSetupDeps {
  connect(url: string): Database;
  /** Null while NATIONAL_ID_ENCRYPTION_KEY or NATIONAL_ID_LOOKUP_KEY is missing. */
  protector: NationalIdProtector | null;
  migrationsDir: string;
  createId?: () => string;
}

export interface ConnectionCheck { serverVersion: string; pendingMigrations: number; hasAccounts: boolean; }
export interface SetupCompleted { databaseUrl: string; personId: string; serverVersion: string; migrationsApplied: number; }

const connectionCodes: Record<string, SetupErrorCode> = {
  ER_ACCESS_DENIED_ERROR: 'access_denied', ER_DBACCESS_DENIED_ERROR: 'access_denied',
  ECONNREFUSED: 'connection_failed', ETIMEDOUT: 'connection_failed', ENOTFOUND: 'connection_failed', EHOSTUNREACH: 'connection_failed', ER_BAD_DB_ERROR: 'connection_failed'
};

/**
 * Connects to the database the installer typed on the setup page, migrates it when it is empty or behind,
 * and creates the first ผู้ดูแลระบบ. Driver messages carry the host and user, so only a SetupError code leaves here.
 */
export class FirstRunSetup {
  private readonly createId: () => string;
  constructor(private readonly deps: FirstRunSetupDeps) { this.createId = deps.createId ?? randomUUID; }

  async testConnection(input: SetupDatabaseInput): Promise<ConnectionCheck> {
    return this.withDatabase(input, async (database) => {
      const serverVersion = await checkServer(database);
      const hasAccounts = (await countAccounts(database)) > 0;
      return { serverVersion, pendingMigrations: (await pendingMigrations(database)).length, hasAccounts };
    });
  }

  async complete(input: SetupDatabaseInput, admin: SetupAdminInput): Promise<SetupCompleted> {
    const protector = this.deps.protector;
    if (!protector) throw new SetupError('keys_missing');
    const databaseUrl = buildDatabaseUrl(input);
    return this.withDatabase(input, async (database) => {
      const serverVersion = await checkServer(database);
      // Checked before migrating: the setup page must never add an account to a database already in use.
      if ((await countAccounts(database)) > 0) throw new SetupError('accounts_exist');
      const migrationsApplied = (await pendingMigrations(database)).length > 0 ? (await migrate(database, this.deps.migrationsDir)).length : 0;
      const passwordHash = await hashPassword(admin.password);
      const personId = this.createId();
      await database.transaction(async (transaction) => {
        await transaction.execute(
          "INSERT INTO person (id, employee_code, national_id_ciphertext, national_id_lookup, national_id_masked, employment_status, created_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', UTC_TIMESTAMP())",
          [personId, admin.employeeCode, protector.encrypt(admin.nationalId), protector.lookup(admin.nationalId), protector.mask(admin.nationalId)]);
        const subject = await lockProfileSubject(transaction, personId);
        const saved = await applyProfileUpdate(transaction, subject!, { firstName: admin.firstName, lastName: admin.lastName }, personId, this.createId, { canEditOrganization: () => true, syncDisplayName: true, auditAction: 'hr.person.create' });
        if (!saved.ok) throw new SetupError('invalid_input');
        await transaction.execute('INSERT INTO local_account (id, person_id, username, password_hash, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [this.createId(), personId, admin.username, passwordHash]);
        await transaction.execute('INSERT IGNORE INTO role (id, name, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [this.createId(), ADMIN_ROLE]);
        const [role] = await transaction.query<{ id: string }>('SELECT id FROM role WHERE name = ?', [ADMIN_ROLE]);
        await transaction.execute('INSERT INTO role_assignment (id, person_id, role_id, organization_id, created_at) VALUES (?, ?, ?, NULL, UTC_TIMESTAMP())', [this.createId(), personId, role!.id]);
        await new AuditService(new DatabaseAuditRepository(transaction), this.createId).recordAudit({ actorPersonId: personId, action: 'system.setup.completed', targetType: 'person', targetId: personId, result: 'SUCCESS', metadata: { serverVersion, migrationsApplied } });
      }, { isolationLevel: 'READ COMMITTED' });
      return { databaseUrl, personId, serverVersion, migrationsApplied };
    });
  }

  private async withDatabase<T>(input: SetupDatabaseInput, work: (database: Database) => Promise<T>): Promise<T> {
    const database = this.deps.connect(buildDatabaseUrl(input));
    try {
      return await work(database);
    } catch (error) {
      throw toSetupError(error);
    } finally {
      await database.close().catch(() => undefined);
    }
  }
}

async function checkServer(database: Database): Promise<string> {
  const [row] = await database.query<{ version: string }>('SELECT VERSION() AS version');
  const version = row?.version ?? '';
  const [, major, minor] = /^(\d+)\.(\d+)/.exec(version) ?? [];
  if (!version.includes('MariaDB') || Number(major) * 100 + Number(minor) < 1006) throw new SetupError('unsupported_server');
  return version;
}

async function countAccounts(database: Database): Promise<number> {
  const table = await database.query("SELECT 1 AS present FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'local_account' LIMIT 1");
  if (table.length === 0) return 0;
  return Number((await database.query<{ n: number }>('SELECT COUNT(*) AS n FROM local_account'))[0]?.n ?? 0);
}

async function migrate(database: Database, migrationsDir: string): Promise<string[]> {
  try {
    return await runMigrations(database, { migrationsDir });
  } catch (error) {
    const code = (error as { code?: string; errno?: number }).code;
    const errno = (error as { errno?: number }).errno;
    if (errno === 1142 || errno === 1044 || code === 'ER_TABLEACCESS_DENIED_ERROR') throw new SetupError('migration_privilege_missing');
    throw error;
  }
}

function toSetupError(error: unknown): SetupError | Error {
  if (error instanceof SetupError) return error;
  const code = (error as { code?: string }).code;
  if (code && connectionCodes[code]) return new SetupError(connectionCodes[code]);
  if (code === 'ER_DUP_ENTRY') return new SetupError('invalid_input');
  return new SetupError('connection_failed');
}
