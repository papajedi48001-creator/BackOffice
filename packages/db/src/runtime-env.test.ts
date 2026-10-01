import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { readRuntimeValue } from './runtime-env.ts';

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
