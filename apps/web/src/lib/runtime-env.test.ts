import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { readRuntimeValue } from './runtime-env';

afterEach(() => vi.unstubAllEnvs());

test('reads a runtime secret from its file path when the direct value is absent', () => {
  const directory = mkdtempSync(join(tmpdir(), 'backoffice-runtime-env-'));
  const secretFile = join(directory, 'database_url');
  writeFileSync(secretFile, 'mysql://backoffice:from-secret-file\n');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('DATABASE_URL_FILE', secretFile);

  expect(readRuntimeValue('DATABASE_URL')).toBe('mysql://backoffice:from-secret-file');
  rmSync(directory, { recursive: true, force: true });
});
