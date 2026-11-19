import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

describe('แถบเมนูของโมดูล (แบบ 7.5 ปุ่มไล่สีเรืองแสง)', () => {
  it('puts the sections in a rounded track', () => {
    expect(css).toMatch(/\.module-subnav ul \{[^}]*border-radius: 12px[^}]*background: var\(--line-soft\)/);
  });
  it('slides a glowing gradient button in the module colour under the current section', () => {
    expect(css).toMatch(/\.subnav-thumb[^{]*\{[^}]*background: linear-gradient\([^)]*var\(--accent\)[^}]*var\(--accent-strong\)/);
    expect(css).toMatch(/\.subnav-thumb[^{]*\{[^}]*animation: subnav-breathe/);
    expect(css).toMatch(/\.subnav-thumb \{[^}]*transition: transform/);
    expect(css).toMatch(/@keyframes subnav-breathe/);
  });
  it('writes the current section in white, and draws the button on the link itself until the script is ready', () => {
    expect(css).toMatch(/\.module-subnav a\.is-active[^{]*\{[^}]*color: #fff/);
    expect(css).toMatch(/\.module-subnav ul:not\(\.is-ready\) a\[aria-current="page"\]/);
  });
});
