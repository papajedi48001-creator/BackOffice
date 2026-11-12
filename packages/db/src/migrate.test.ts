import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrationVersions, pendingMigrations, runMigrations } from './migrate';
import type { Database } from './client';

describe('runMigrations', () => {
  it('records and skips an already applied migration version', async () => {
    const executed: string[] = [];
    const queried: string[] = [];
    const applied = new Set(['0000_r0_foundation.sql']);
    const database: Database = {
      execute: async (sql, parameters = []) => {
        executed.push(`${sql}|${JSON.stringify(parameters)}`);
        if (sql.startsWith('INSERT IGNORE INTO schema_migration') && Array.isArray(parameters)) applied.add(String(parameters[0]));
      },
      query: async <T extends object>(sql: string, parameters = []) => {
        queried.push(`${sql}|${JSON.stringify(parameters)}`);
        if (sql.includes('SELECT version FROM schema_migration')) {
          const version = Array.isArray(parameters) ? String(parameters[0]) : '';
          return (applied.has(version) ? [{ version }] : []) as T[];
        }
        return [] as T[];
      },
      transaction: async () => { throw new Error('DDL migrations must not rely on a transaction'); },
      close: async () => undefined
    };

    await runMigrations(database);

    expect(queried.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS schema_migration'))).toBe(false);
    expect(queried.filter((sql) => sql.includes('SELECT version FROM schema_migration'))).toHaveLength(38);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE notification'))).toBe(true);
    expect(executed.some((sql) => sql.includes('IF NOT EXISTS'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0001_in_app_notifications.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE outbox_event') && sql.includes('dead_lettered_at'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0002_outbox_retry.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS user_session'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS login_throttle'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0003_session_and_login_throttle.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE person') && sql.includes('employee_code'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE organization') && sql.includes('parent_id'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0004_hr_master_data.sql"]'))).toBe(true);
    for (const table of ['room', 'room_addon', 'room_booking', 'room_booking_day', 'room_booking_addon', 'room_booking_history', 'room_booking_sequence']) {
      expect(executed.some((sql) => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`))).toBe(true);
    }
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE notification') && sql.includes('target_path'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0005_room_booking.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE notification') && sql.includes('module_code'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0006_notification_module.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS request_cancellation'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0007_request_cancellation.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE organization') && sql.includes('unit_type'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS hr_organization_head ('))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0009_hr_command_chain.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS hr_employment_type ('))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO hr_employment_type') && sql.includes('DAILY_EMPLOYEE') && sql.includes('ลูกจ้างรายวัน'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS hr_person_profile ('))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0010_hr_staff_profile.sql"]'))).toBe(true);
    for (const table of ['leave_type', 'leave_entitlement', 'leave_holiday', 'leave_setting', 'leave_request', 'leave_cancellation', 'leave_opening_balance']) {
      expect(executed.some((sql) => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`))).toBe(true);
    }
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0011_leave.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE leave_type') && sql.includes('eligible_gender'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0012_leave_type_gender.sql"]'))).toBe(true);
    for (const table of ['official_travel_type', 'official_travel', 'official_travel_member']) {
      expect(executed.some((sql) => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`))).toBe(true);
    }
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0013_official_travel.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS official_travel_report ('))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0014_official_travel_report.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE attachment') && sql.includes('original_filename'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0015_attachment_filename.sql"]'))).toBe(true);
    for (const table of ['fleet_vehicle', 'fleet_driver', 'fleet_request', 'fleet_request_sequence', 'fleet_trip', 'fleet_request_history']) {
      expect(executed.some((sql) => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`))).toBe(true);
    }
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0016_fleet.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE hr_person_profile') && sql.includes('photo_attachment_id'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0017_person_photo.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE organization') && sql.includes('deleted_at'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS hr_position ('))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO hr_position') && sql.includes('เจ้าพนักงานธุรการ'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE hr_person_profile ADD COLUMN IF NOT EXISTS position_id'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0025_local_account_must_change_password.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS support_conversation ('))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0026_support_chat.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE room_booking ADD COLUMN IF NOT EXISTS request_id'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0027_room_booking_request.sql"]'))).toBe(true);
    for (const table of ['line_account_link', 'line_link_code', 'line_group', 'line_module_route']) {
      expect(executed.some((sql) => sql.startsWith(`CREATE TABLE IF NOT EXISTS ${table} (`))).toBe(true);
    }
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0028_line_alert.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE user_session ADD COLUMN IF NOT EXISTS active_role'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS actor_role'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0030_active_role.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0031_provider_sso.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS mci_responder (') && sql.includes('PERSISTENT'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0032_mass_casualty.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS attendance_hash_chain ('))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0033_attendance_foundation.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0035_person_soft_delete.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS lab_lot (') && sql.includes('PERSISTENT'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS site_image (') && sql.includes('MEDIUMBLOB'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0036_site_image.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('CREATE TABLE IF NOT EXISTS sign_in_setting (') && sql.includes('secret_ciphertext'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT IGNORE INTO schema_migration') && sql.endsWith('|["0037_sign_in_setting.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS organization'))).toBe(false);
  });

  it('tolerates another runner recording the same version first', async () => {
    // Integration test files migrate one fresh database in parallel, so two runners can both see a version as missing.
    const recorded = new Set<string>();
    const database: Database = {
      execute: async (sql, parameters = []) => {
        if (!sql.includes('INTO schema_migration')) return;
        const version = Array.isArray(parameters) ? String(parameters[0]) : '';
        if (recorded.has(version) && !sql.startsWith('INSERT IGNORE')) throw new Error(`Duplicate entry '${version}' for key 'PRIMARY'`);
        recorded.add(version);
      },
      query: async <T extends object>() => [] as T[],
      transaction: async () => { throw new Error('DDL migrations must not rely on a transaction'); },
      close: async () => undefined
    };

    await Promise.all([runMigrations(database), runMigrations(database)]);

    expect(recorded.has('0007_request_cancellation.sql')).toBe(true);
    expect(recorded.has('0009_hr_command_chain.sql')).toBe(true);
    expect(recorded.has('0010_hr_staff_profile.sql')).toBe(true);
    expect(recorded.has('0011_leave.sql')).toBe(true);
  });
});

describe('runMigrations options', () => {
  it('reads migration files from the given directory and returns the versions it ran', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'backoffice-migrations-'));
    for (const version of migrationVersions) writeFileSync(join(directory, version), `CREATE TABLE IF NOT EXISTS t_${version.slice(0, 4)} (id INT)`);
    const executed: string[] = [];
    const database = { execute: async (sql: string) => { executed.push(sql); }, query: async () => [], transaction: async () => { throw new Error('unused'); }, close: async () => undefined } as unknown as Database;

    const ran = await runMigrations(database, { migrationsDir: directory });

    expect(ran).toEqual([...migrationVersions]);
    expect(executed).toContain('CREATE TABLE IF NOT EXISTS t_0000 (id INT)');
    rmSync(directory, { recursive: true, force: true });
  });
});

describe('pendingMigrations', () => {
  it('lists every version when schema_migration does not exist, without creating it', async () => {
    const queries: string[] = [];
    const database = { query: async <T extends object>(sql: string) => { queries.push(sql); return [] as T[]; } };
    expect(await pendingMigrations(database)).toEqual([...migrationVersions]);
    expect(queries.some((sql) => sql.includes('CREATE'))).toBe(false);
  });

  it('lists only the versions not yet recorded', async () => {
    const database = { query: async <T extends object>(sql: string) => (sql.includes('information_schema') ? [{ present: 1 }] : migrationVersions.slice(0, -1).map((version) => ({ version }))) as T[] };
    expect(await pendingMigrations(database)).toEqual([migrationVersions.at(-1)]);
  });
});
