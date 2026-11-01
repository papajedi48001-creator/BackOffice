import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Spawning `pnpm start` takes several seconds when the other workspaces' suites run alongside it.
const spawnTimeoutMs = 30_000;

describe('worker Node ESM runtime', () => {
  it('resolves worker modules and waits for the database configuration', () => {
    let output = '';

    try {
      execFileSync(
        // node itself, as `pnpm start` runs it: a timeout kills pnpm but not the waiting node child.
        process.execPath,
        ['--experimental-transform-types', 'src/main.ts'],
        {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { ...process.env, DATABASE_URL: '', DATABASE_URL_FILE: '', BACKOFFICE_CONFIG_DIR: '/nonexistent-backoffice-config' },
          timeout: 8_000,
          stdio: 'pipe'
        }
      );
    } catch (error) {
      const failure = error as { stdout?: Buffer; stderr?: Buffer; output?: Array<Buffer | string | null> };
      output = [failure.stdout, failure.stderr, ...(failure.output ?? [])]
        .filter((value): value is Buffer | string => value !== null && value !== undefined)
        .map((value) => value.toString())
        .join('');
    }

    expect(output).toContain('backoffice.worker.waiting_for_database_config');
    expect(output).not.toContain('ERR_MODULE_NOT_FOUND');
  }, spawnTimeoutMs);
});
