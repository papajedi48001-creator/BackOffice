import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

describe('motion rules in styles.css', () => {
  it('defines motion tokens between 150ms and 400ms', () => {
    for (const token of ['--motion-fast', '--motion-base', '--motion-slow', '--motion-stagger', '--ease-out']) expect(css).toContain(`${token}:`);
    const durations = [...css.matchAll(/--motion-(?:fast|base|slow):\s*(\d+)ms/g)].map((m) => Number(m[1]));
    expect(durations).toHaveLength(3);
    for (const d of durations) { expect(d).toBeGreaterThanOrEqual(150); expect(d).toBeLessThanOrEqual(400); }
  });

  it('animates page content, login card and alerts on entry', () => {
    expect(css).toMatch(/@keyframes rise-in\b/);
    expect(css).toMatch(/@keyframes slide-in\b/);
    expect(css).toMatch(/\.app-main > :not\(\.app-topbar\)[^{]*\{[^}]*animation: rise-in/);
    expect(css).toMatch(/\.login-card[^{]*\{[^}]*animation: rise-in/);
    expect(css).toMatch(/\.form-error[^{]*\{[^}]*animation: slide-in/);
  });

  it('staggers launcher tiles', () => {
    expect(css).toMatch(/\.launcher-grid > li \{[^}]*animation: rise-in/);
    expect(css).toMatch(/\.launcher-grid > li:nth-child\(2\) \{[^}]*animation-delay/);
  });

  it('gives buttons press feedback', () => {
    expect(css).toMatch(/button:active:not\(:disabled\)[^{]*\{[^}]*transform: scale\(\.98\)/);
  });

  it('turns all motion off for prefers-reduced-motion', () => {
    const block = css.match(/@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after, \*::backdrop \{([^}]*)\}/);
    expect(block?.[1]).toMatch(/animation: none !important/);
    expect(block?.[1]).toMatch(/transition: none !important/);
  });
});
