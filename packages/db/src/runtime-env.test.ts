import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { databaseConfigFilePath, readDatabaseUrl, readRuntimeValue } from './runtime-env.ts';

afterEach(() => vi.unstubAllEnvs());

test('reads a database URL from a secret file when no direct value is set', () => {
  const directory = mkdtempSync(join(tmpdir(), 'backoffice-db-runtime-env-'));
  const secretFile = join(directory, 'database_url');
  writeFileSync(secretFile, 'mysql://backoffice:from-secret-file\n');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('DATABASE_URL_FILE', secretFile);

  expect(readRuntimeValue('DATABASE_URL')).toBe('mysql://backoffice:from-secret-file');
  rmSync(directory, { recursive: true, force: true });
});

describe('readDatabaseUrl', () => {
  const directories: string[] = [];
  const dirWith = (name: string, content: string) => { const directory = mkdtempSync(join(tmpdir(), 'backoffice-config-')); directories.push(directory); writeFileSync(join(directory, name), content); return directory; };
  afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

  test('prefers DATABASE_URL, then DATABASE_URL_FILE, then the config directory file', () => {
    const secretDirectory = dirWith('database_url', 'mysql://b\n');
    const configDirectory = dirWith('database_url', 'mysql://c\n');
    expect(readDatabaseUrl({ DATABASE_URL: 'mysql://a', DATABASE_URL_FILE: join(secretDirectory, 'database_url'), BACKOFFICE_CONFIG_DIR: configDirectory })).toBe('mysql://a');
    expect(readDatabaseUrl({ DATABASE_URL_FILE: join(secretDirectory, 'database_url'), BACKOFFICE_CONFIG_DIR: configDirectory })).toBe('mysql://b');
    expect(readDatabaseUrl({ BACKOFFICE_CONFIG_DIR: configDirectory })).toBe('mysql://c');
  });

  test('has no value when the config directory holds no database_url file', () => {
    expect(readDatabaseUrl({ BACKOFFICE_CONFIG_DIR: dirWith('other', 'x') })).toBeUndefined();
  });

  test('defaults the config file to /var/lib/backoffice/config/database_url', () => {
    expect(databaseConfigFilePath({})).toBe('/var/lib/backoffice/config/database_url');
    expect(databaseConfigFilePath({ BACKOFFICE_CONFIG_DIR: '/srv/config' })).toBe('/srv/config/database_url');
  });
});
