import { createDatabase } from './client.ts';
import { runMigrations } from './migrate.ts';

const connectionUrl = process.env.DATABASE_URL;
if (!connectionUrl) throw new Error('DATABASE_URL is required to run migrations');

const db = createDatabase(connectionUrl);
try {
  await runMigrations(db);
  console.log('R0 foundation migration applied.');
} finally {
  await db.close();
}
