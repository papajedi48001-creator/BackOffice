import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');
const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

describe('กฎตาราง: หัวตารางตรึงด้านบนเสมอ (DESIGN.md)', () => {
  it('pins every table head and lets the shared script shift it under the sticky bars', () => {
    expect(rule('thead')).toMatch(/position: sticky/);
    expect(rule('thead')).toMatch(/top: 0/);
    expect(rule('thead')).toMatch(/z-index: \d/);
    expect(rule('thead')).toMatch(/transform: translateY\(var\(--thead-shift, 0px\)\)/);
  });
  it('sits a page-level table head under the top bar and module menu', () => {
    expect(rule('table[data-sticky-head="page"] > thead')).toMatch(/top: var\(--table-sticky-top/);
  });
  it('never lets a table become its own scroll box (overflow: hidden breaks sticky)', () => {
    expect(rule('table')).toMatch(/overflow: clip/);
    for (const m of css.matchAll(/(?:^|\n)([^{}\n]*\btable\b[^{}\n]*)\{([^}]*)\}/g)) {
      if (/(^|[\s,>])table\s*$/.test(m[1]!.trim()) || /(^|[\s,])table\s*,/.test(m[1]!)) expect(m[2]).not.toMatch(/overflow: hidden/);
    }
  });
  it('does not pin header cells one by one (multi-row heads would overlap)', () => {
    expect(css).not.toMatch(/thead th \{[^}]*position: sticky;[^}]*top:/);
  });
  it('lets the head scroll normally when printing', () => {
    expect(css).toMatch(/@media print \{[^@]*thead \{ position: static; transform: none; \}/);
  });
});
