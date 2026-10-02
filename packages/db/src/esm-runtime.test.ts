import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('database package Node ESM runtime', () => {
  it('loads the public entrypoint with Node type stripping', () => {
    expect(() => execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--input-type=module', '--eval', "await import('./index.ts'); process.exit(0)"],
      {
        cwd: fileURLToPath(new URL('.', import.meta.url)),
        stdio: 'pipe'
      }
    )).not.toThrow();
  });
});
