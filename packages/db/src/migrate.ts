import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Database } from './client.ts';

export async function runMigrations(db: Database): Promise<void> {
  const migration = await readFile(resolve(import.meta.dirname, '../migrations/0000_r0_foundation.sql'), 'utf8');
  for (const statement of migration.split(';').map((sql) => sql.trim()).filter(Boolean)) await db.execute(statement);
}
