import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');
const rule = (selector: string) => css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

describe('หน้าหลัก tiles and greeting (DESIGN.md, แบบ 1+ and ท8)', () => {
  it('tints each module tile with its own colour', () => {
    expect(rule('a.module-tile')).toMatch(/background: linear-gradient\([^;]*var\(--accent\)/);
  });
  it('puts the icon behind the tile as a faint watermark that turns and grows on hover', () => {
    expect(rule('.module-watermark')).toMatch(/position: absolute/);
    expect(rule('.module-watermark')).toMatch(/opacity: \.1\d/);
    expect(css).toMatch(/a\.module-tile:hover \.module-watermark[^{]*\{[^}]*transform:[^}]*scale/);
  });
  it('sweeps a flash of light across a tile on hover', () => {
    expect(rule('a.module-tile::before')).toMatch(/translateX\(-1\d\d%\)/);
    expect(css).toMatch(/a\.module-tile:hover::before[^{]*\{[^}]*translateX\(1\d\d%\)/);
  });
  it('flips the calendar page down and lets it sway, all off for reduced motion', () => {
    expect(css).toMatch(/@keyframes calendar-flip\b/);
    expect(css).toMatch(/@keyframes calendar-sway\b/);
    expect(rule('.hero-calendar')).toMatch(/animation: calendar-sway/);
  });
});
