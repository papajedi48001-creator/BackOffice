import { describe, expect, it } from 'vitest';
import { runMigrations } from './migrate';
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
    expect(queried.filter((sql) => sql.includes('SELECT version FROM schema_migration'))).toHaveLength(8);
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
  });
});
