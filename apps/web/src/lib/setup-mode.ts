import { readDatabaseUrl } from '@backoffice/db';

/** True while no DATABASE_URL can be found anywhere: the only time /setup is open. */
export function isSetupMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return readDatabaseUrl(env) === undefined;
}
