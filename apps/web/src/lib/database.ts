import { createDatabase, readDatabaseUrl, type Database } from '@backoffice/db';

let sharedDatabase: Database | undefined;

// One connection pool per server process; request handlers must not close it.
export function getSharedDatabase(): Database | null {
  if (sharedDatabase) return sharedDatabase;
  const databaseUrl = readDatabaseUrl();
  if (!databaseUrl) return null;
  sharedDatabase = createDatabase(databaseUrl);
  return sharedDatabase;
}
