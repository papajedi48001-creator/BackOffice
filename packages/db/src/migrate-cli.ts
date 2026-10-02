import { createDatabase } from './client.ts';
import { runMigrations } from './migrate.ts';
import { readRuntimeValue } from './runtime-env.ts';

const connectionUrl = readRuntimeValue('DATABASE_URL');
if (!connectionUrl) throw new Error('DATABASE_URL is required to run migrations');

const db = createDatabase(connectionUrl);
try {
  await runMigrations(db);
  console.log('R0 foundation migration applied.');
} finally {
  await db.close();
}
