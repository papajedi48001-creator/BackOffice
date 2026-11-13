import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * วันที่ (CLAUDE.md): every date a person enters goes through ThaiDateInput / ThaiDateTimeInput, which show
 * `13 พ.ย. 2569`. The browser's own date pickers show the date the computer's way (13/11/2026, 11/13/2026...),
 * so they must not come back.
 */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('date fields', () => {
  it('never use the browser date or datetime-local picker', () => {
    const offenders = sources(__dirname).filter((file) => /type(?:=|:\s*)["'](?:date|datetime-local|month|week)["']/.test(readFileSync(file, 'utf8')));
    expect(offenders.map((file) => relative(__dirname, file))).toEqual([]);
  });
});
