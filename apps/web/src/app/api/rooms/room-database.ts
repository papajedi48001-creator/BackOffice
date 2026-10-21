import type { Database } from '@backoffice/db';
import { getSharedDatabase } from '../../../lib/database';

export function roomDatabase(): Database {
  const database = getSharedDatabase();
  if (!database) throw new Error('SERVICE_UNAVAILABLE');
  return database;
}
