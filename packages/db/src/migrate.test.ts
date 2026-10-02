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
        if (sql.startsWith('INSERT INTO schema_migration') && Array.isArray(parameters)) applied.add(String(parameters[0]));
      },
      query: async <T extends object>(sql: string, parameters = []) => {
        queried.push(`${sql}|${JSON.stringify(parameters)}`);
        if (sql.includes('SELECT version FROM schema_migration')) {
          const version = Array.isArray(parameters) ? String(parameters[0]) : '';
          return (applied.has(version) ? [{ version }] : []) as T[];
        }
        return [] as T[];
      },
      transaction: async (work) => work(database),
      close: async () => undefined
    };

    await runMigrations(database);

    expect(queried.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS schema_migration'))).toBe(false);
    expect(queried.filter((sql) => sql.includes('SELECT version FROM schema_migration'))).toHaveLength(2);
    expect(executed.some((sql) => sql.startsWith('ALTER TABLE notification'))).toBe(true);
    expect(executed.some((sql) => sql.startsWith('INSERT INTO schema_migration') && sql.endsWith('|["0001_in_app_notifications.sql"]'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS organization'))).toBe(false);
  });
});
