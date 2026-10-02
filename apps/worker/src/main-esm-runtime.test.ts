import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('worker Node ESM runtime', () => {
  it('resolves worker modules before validating its required database configuration', () => {
    let output = '';

    try {
      execFileSync(
        process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
        ['start'],
        {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { ...process.env, DATABASE_URL: '' },
          stdio: 'pipe',
          shell: process.platform === 'win32'
        }
      );
    } catch (error) {
      const failure = error as { stderr?: Buffer; output?: Array<Buffer | string | null> };
      output = [failure.stderr, ...(failure.output ?? [])]
        .filter((value): value is Buffer | string => value !== null && value !== undefined)
        .map((value) => value.toString())
        .join('');
    }

    expect(output).toContain('DATABASE_URL is required');
    expect(output).not.toContain('ERR_MODULE_NOT_FOUND');
  });
});
