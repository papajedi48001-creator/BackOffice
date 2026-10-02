import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('worker Node ESM runtime', () => {
  it('resolves worker modules before validating its required database configuration', () => {
    let output = '';

    try {
      execFileSync(
        process.execPath,
        ['--experimental-strip-types', '--input-type=module', '--eval', "await import('./main.ts')"],
        { cwd: fileURLToPath(new URL('.', import.meta.url)), stdio: 'pipe' }
      );
    } catch (error) {
      const failure = error as { stderr?: Buffer };
      output = failure.stderr?.toString() ?? '';
    }

    expect(output).toContain('DATABASE_URL is required');
    expect(output).not.toContain('ERR_MODULE_NOT_FOUND');
  });
});
