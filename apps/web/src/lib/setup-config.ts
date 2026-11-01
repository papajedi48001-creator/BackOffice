import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { databaseConfigFilePath } from '@backoffice/db';
import { SetupError } from '@backoffice/core';

/** Saves the database URL where readDatabaseUrl looks for it: a 0600 file written whole, never half. */
export async function writeDatabaseConfig(url: string, path: string = databaseConfigFilePath()): Promise<void> {
  const temporary = `${path}.tmp-${randomBytes(6).toString('hex')}`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(temporary, `${url}\n`, { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    console.error('backoffice.setup.config_write_failed', { code: (error as NodeJS.ErrnoException).code ?? 'UNKNOWN' });
    throw new SetupError('config_write_failed');
  }
}

/** The SQL migrations: the Docker image sets BACKOFFICE_MIGRATIONS_DIR; in the repo they sit beside apps/web. */
export function migrationsDir(env: Readonly<Record<string, string | undefined>> = process.env, cwd: string = process.cwd()): string {
  return env.BACKOFFICE_MIGRATIONS_DIR?.trim() || resolve(cwd, '../../packages/db/migrations');
}
