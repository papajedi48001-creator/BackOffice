// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SetupError } from '@backoffice/core';
import { assertConfigWritable, migrationsDir, writeDatabaseConfig } from './setup-config';

describe('writeDatabaseConfig', () => {
  const directories: string[] = [];
  const fresh = () => { const directory = mkdtempSync(join(tmpdir(), 'backoffice-setup-config-')); directories.push(directory); return directory; };
  afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

  it('writes the URL to a 0600 file and leaves no temporary file', async () => {
    const directory = fresh();
    const file = join(directory, 'nested', 'database_url');
    await writeDatabaseConfig('mysql://u:p@h:3306/backoffice', file);
    expect(readFileSync(file, 'utf8')).toBe('mysql://u:p@h:3306/backoffice\n');
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(join(directory, 'nested'))).toEqual(['database_url']);
  });

  it('refuses with config_write_failed when the directory cannot be written', async () => {
    const directory = fresh();
    const blocker = join(directory, 'not-a-directory');
    writeFileSync(blocker, 'x');
    const failure = await writeDatabaseConfig('mysql://u:p@h/db', join(blocker, 'database_url')).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(SetupError);
    expect((failure as SetupError).code).toBe('config_write_failed');
  });
});

describe('assertConfigWritable', () => {
  it('passes and leaves nothing behind when the directory can be written', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'backoffice-setup-probe-'));
    try {
      await assertConfigWritable(join(directory, 'database_url'));
      expect(readdirSync(directory)).toEqual([]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('refuses with config_write_failed before anything touches the database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'backoffice-setup-probe-'));
    try {
      writeFileSync(join(directory, 'blocker'), 'x');
      const failure = await assertConfigWritable(join(directory, 'blocker', 'database_url')).catch((error: unknown) => error);
      expect((failure as SetupError).code).toBe('config_write_failed');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

describe('migrationsDir', () => {
  it('uses BACKOFFICE_MIGRATIONS_DIR, else the db package next to apps/web', () => {
    expect(migrationsDir({ BACKOFFICE_MIGRATIONS_DIR: '/app/migrations' }, '/x')).toBe('/app/migrations');
    expect(migrationsDir({}, '/repo/apps/web')).toBe(resolve('/repo/packages/db/migrations'));
  });
});
