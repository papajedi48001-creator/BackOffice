import { createDatabase, type Database } from '@backoffice/db';
import { readRuntimeValue } from './runtime-env';

let sharedDatabase: Database | undefined;

// One connection pool per server process; request handlers must not close it.
export function getSharedDatabase(): Database | null {
  if (sharedDatabase) return sharedDatabase;
  const databaseUrl = readRuntimeValue('DATABASE_URL');
  if (!databaseUrl) return null;
  sharedDatabase = createDatabase(databaseUrl);
  return sharedDatabase;
}
