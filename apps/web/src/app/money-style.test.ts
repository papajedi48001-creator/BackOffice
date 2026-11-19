import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)[^{}\\n]*${escaped}[^{}\\n]*\\{([^}]*)\\}`))?.[1] ?? '';
};

/** Smart Money แบบ 2 (wasan, 2026-11-19): standard controls, ปุ่มสลับ, cards that lift with an accent sweep, motion on entry. */
describe('Smart Money standard controls and motion', () => {
  it('draws ปุ่มสลับ like the program-settings mode switch, with a pop when chosen', () => {
    expect(rule('.app-main .money-segmented button.is-active')).toMatch(/background: var\(--brand-deep\)/);
    expect(rule('.money-segmented a.is-active')).toMatch(/background: var\(--brand-deep\)/);
    expect(rule('.app-main .money-segmented button.is-active')).toMatch(/animation: segment-pop/);
    expect(css).toMatch(/@keyframes segment-pop\b/);
  });

  it('gives Smart Money selects the standard 44px field and toolbars the panel box', () => {
    expect(rule('.money-field select')).toMatch(/min-height: 44px/);
    expect(rule('.money-field select')).toMatch(/border-radius: 10px/);
    expect(rule('.nhso-toolbar')).toMatch(/border-radius: 12px/);
  });

  it('lifts KPI and fund cards on hover with an accent line sweeping under them', () => {
    for (const card of ['.money-kpi', '.nhso-fund-card']) {
      expect(rule(`${card}:hover`), card).toMatch(/transform: translateY\(-3px\)/);
      expect(rule(`${card}::after`), card).toMatch(/transform: scaleX\(0\)/);
    }
  });

  it('brings the cards in one after another and grows the bars from the axis', () => {
    expect(rule('.money-kpis > *')).toMatch(/animation: rise-in/);
    expect(rule('.nhso-fund-grid > li')).toMatch(/animation: rise-in/);
    expect(rule('.chart-plot > span > span:first-child')).toMatch(/animation: bar-grow/);
    expect(css).toMatch(/@keyframes bar-grow\b/);
  });
});

/** Monitor IMC (wasan, 2026-11-19, แบบ 1 + ผู้ป่วยในทะเบียน): patient cards with a ring of days left in four tones. */
describe('Monitor IMC cards', () => {
  it('lays the patient cards in a wrapping grid, lifts them on hover and rises them in on entry', () => {
    expect(rule('.imc-cards')).toMatch(/grid-template-columns: repeat\(auto-fill, minmax\(/);
    expect(rule('.imc-person:hover')).toMatch(/transform: translateY\(-2px\)/);
    expect(rule('.imc-person')).toMatch(/animation: .*rise/);
  });
  it('colours the ring and the tag by tone and draws the ring from the top', () => {
    for (const tone of ['ok', 'warn', 'bad', 'mute']) expect(rule(`.imc-person.is-${tone}`)).toMatch(/--imc-tone:/);
    expect(rule('.imc-ring-fill')).toMatch(/stroke: var\(--imc-tone\)/);
    expect(rule('.imc-ring')).toMatch(/transform: rotate\(-90deg\)/);
    expect(rule('.imc-tag.is-bad')).toMatch(/color:/);
  });
});
