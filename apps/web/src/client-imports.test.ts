import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `@backoffice/core` pulls in the database driver (mysql2 needs Node's `net`), so a browser bundle that imports a value from
 * it fails to build. Client components may take only types from it (`import type` or inline `type` names).
 */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const valueImportFromCore = (source: string) => [...source.matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+'@backoffice\/core';/gm)]
  .some(([, typeOnly, names]) => !typeOnly && names!.split(',').map((name) => name.trim()).filter(Boolean).some((name) => !name.startsWith('type ')));

describe('client components', () => {
  it('import only types from @backoffice/core', () => {
    const offenders = sources(__dirname).filter((file) => { const source = readFileSync(file, 'utf8'); return /^['"]use client['"]/m.test(source) && valueImportFromCore(source); });
    expect(offenders.map((file) => relative(__dirname, file))).toEqual([]);
  });
});
