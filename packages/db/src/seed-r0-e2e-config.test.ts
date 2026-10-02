import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { readR0E2eSeedConfig } from './seed-r0-e2e-config.ts';

afterEach(() => vi.unstubAllEnvs());

test('reads seed database URL and password from secret files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'backoffice-r0-seed-'));
  const databaseUrlFile = join(directory, 'database_url');
  const passwordFile = join(directory, 'r0_e2e_password');
  writeFileSync(databaseUrlFile, 'mysql://backoffice:from-secret-file\n');
  writeFileSync(passwordFile, 'temporary-pilot-password\n');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('DATABASE_URL_FILE', databaseUrlFile);
  vi.stubEnv('R0_E2E_PASSWORD', '');
  vi.stubEnv('R0_E2E_PASSWORD_FILE', passwordFile);

  expect(readR0E2eSeedConfig()).toEqual({
    databaseUrl: 'mysql://backoffice:from-secret-file',
    password: 'temporary-pilot-password',
  });
  rmSync(directory, { recursive: true, force: true });
});
