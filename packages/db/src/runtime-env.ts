import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readRuntimeValue(name: string): string | undefined {
  const directValue = process.env[name]?.trim();
  if (directValue) return directValue;

  const filePath = process.env[`${name}_FILE`]?.trim();
  if (!filePath) return undefined;

  const fileValue = readFileSync(filePath, 'utf8').trim();
  return fileValue || undefined;
}

const defaultConfigDir = '/var/lib/backoffice/config';

/** The file the first-run setup page writes the database URL to. */
export function databaseConfigFilePath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return join(env.BACKOFFICE_CONFIG_DIR?.trim() || defaultConfigDir, 'database_url');
}

/** DATABASE_URL from the environment, then DATABASE_URL_FILE, then the setup page's config file; undefined while none is set. */
export function readDatabaseUrl(env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const direct = env.DATABASE_URL?.trim();
  if (direct) return direct;
  const secretFile = env.DATABASE_URL_FILE?.trim();
  if (secretFile) return readFileSync(secretFile, 'utf8').trim() || undefined;
  try {
    return readFileSync(databaseConfigFilePath(env), 'utf8').trim() || undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
