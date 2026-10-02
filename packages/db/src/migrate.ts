import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Database } from './client.ts';

const migrations = ['0000_r0_foundation.sql', '0001_in_app_notifications.sql'];

export async function runMigrations(db: Database): Promise<void> {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migration (version VARCHAR(255) PRIMARY KEY, applied_at DATETIME NOT NULL)');
  for (const version of migrations) {
    const applied = await db.query<{ version: string }>('SELECT version FROM schema_migration WHERE version = ? LIMIT 1', [version]);
    if (applied.length > 0) continue;
    const migration = await readFile(resolve(import.meta.dirname, `../migrations/${version}`), 'utf8');
    for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) await db.execute(statement);
    await db.execute('INSERT INTO schema_migration (version, applied_at) VALUES (?, UTC_TIMESTAMP())', [version]);
  }
}
