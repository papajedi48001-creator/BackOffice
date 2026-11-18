import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `@backoffice/core` pulls in the database driver (mysql2 needs Node's `net`), so a browser bundle that imports a value from
 * it fails to build. Client components, and the local files they import, may take only types from it.
 */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const STATEMENT = /^\s*(import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/gm;

/** True when the source takes a runtime value (not only types) from `@backoffice/core` or one of its subpaths. */
export function importsCoreValue(source: string): boolean {
  for (const [, keyword, clause, from] of source.matchAll(STATEMENT)) {
    if (!/^@backoffice\/core(\/|$)/.test(from!)) continue;
    if (!typeOnly(keyword!, clause!)) return true;
  }
  return false;
}

const typeOnly = (keyword: string, clause: string) => /^type\s/.test(clause.trim())
  || (keyword === 'import' && /^\{[\s\S]*\}$/.test(clause.trim()) && clause.trim().slice(1, -1).split(',').map((name) => name.trim()).filter(Boolean).every((name) => name.startsWith('type ')));

/** Local files a file takes values from (relative paths only; type-only imports never reach the bundle). */
function localImports(file: string): string[] {
  return [...readFileSync(file, 'utf8').matchAll(STATEMENT)].filter(([, keyword, clause]) => !typeOnly(keyword!, clause!)).map(([, , , from]) => from!).filter((from) => from.startsWith('.')).flatMap((from) => {
    const base = resolve(dirname(file), from);
    const hit = [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx'), base].find((path) => /\.tsx?$/.test(path) && existsSync(path));
    return hit ? [hit] : [];
  });
}

describe('importsCoreValue', () => {
  it('flags value imports in every form and allows type-only ones', () => {
    expect(importsCoreValue("import { NO_PACCOUNT } from '@backoffice/core';")).toBe(true);
    expect(importsCoreValue('import { a,\n  b } from "@backoffice/core"')).toBe(true);
    expect(importsCoreValue("import core from '@backoffice/core'")).toBe(true);
    expect(importsCoreValue("import * as core from '@backoffice/core';")).toBe(true);
    expect(importsCoreValue("import X, { type Y } from '@backoffice/core';")).toBe(true);
    expect(importsCoreValue("export { x } from '@backoffice/core';")).toBe(true);
    expect(importsCoreValue("import { readX } from '@backoffice/core/holidays';")).toBe(true);
    expect(importsCoreValue("import type { DentalRow } from '@backoffice/core';")).toBe(false);
    expect(importsCoreValue("import { type DentalRow, type DentalSummary } from '@backoffice/core';")).toBe(false);
    expect(importsCoreValue("export type { DentalRow } from '@backoffice/core';")).toBe(false);
    expect(importsCoreValue("import { NO_PACCOUNT } from '@backoffice/contracts';")).toBe(false);
  });
});

describe('client components', () => {
  it('take only types from @backoffice/core, also through the local files they import', () => {
    const offenders = new Set<string>();
    for (const file of sources(__dirname).filter((path) => /^['"]use client['"]/m.test(readFileSync(path, 'utf8')))) {
      const seen = new Set<string>(); const queue = [file];
      while (queue.length) {
        const current = queue.pop()!;
        if (seen.has(current)) continue;
        seen.add(current);
        // A 'use server' file is a server action boundary: the browser gets only a reference to it, never its imports.
        if (current !== file && /^['"]use server['"]/m.test(readFileSync(current, 'utf8'))) continue;
        if (importsCoreValue(readFileSync(current, 'utf8'))) offenders.add(`${relative(__dirname, file)} → ${relative(__dirname, current)}`);
        queue.push(...localImports(current));
      }
    }
    expect([...offenders]).toEqual([]);
  });
});
