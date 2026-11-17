import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

describe('เมนูด้านซ้าย (DESIGN.md, แบบผสม 10 + 1)', () => {
  it('draws a solid white pill for the active page and a faint one that shows only while pointing', () => {
    expect(css).toMatch(/\.nav-pill \{[^}]*background: #fff/);
    expect(css).toMatch(/\.nav-ghost \{[^}]*opacity: 0/);
    expect(css).toMatch(/\.nav-track:hover \.nav-ghost[^{]*\{[^}]*opacity: 1/);
  });
  it('slides both pills instead of jumping', () => {
    expect(css).toMatch(/\.nav-pill \{[^}]*transition: transform/);
    expect(css).toMatch(/\.nav-ghost \{[^}]*transition: transform/);
  });
  it('bounces the module icon on hover and fills it with the module colour when active', () => {
    expect(css).toMatch(/\.nav-icon \{[^}]*background: color-mix\(in srgb, var\(--accent\)/);
    expect(css).toMatch(/\.sidebar a:hover \.nav-icon[^{]*\{[^}]*transform:[^}]*scale/);
    expect(css).toMatch(/\.sidebar a\.is-active \.nav-icon \{[^}]*background: var\(--accent\)/);
  });
  it('gives every icon a very faint glow, a clear one on hover, and a slow breathing glow on the current page (G2 · แสงบางมาก)', () => {
    expect(css).toMatch(/\.nav-icon \{[^}]*box-shadow: 0 0 6px 0 color-mix\(in srgb, var\(--nav-glow\) 35%, transparent\)/);
    expect(css).toMatch(/\.sidebar a:hover \.nav-icon, \.sidebar a:focus-visible \.nav-icon \{[^}]*box-shadow: 0 0 0 3px[^}]*0 0 20px 6px/);
    expect(css).toMatch(/\.sidebar a\.is-active \.nav-icon \{[^}]*animation: nav-breathe 2\.6s ease-in-out infinite/);
    expect(css).toMatch(/@keyframes nav-breathe/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{[^@]*\.sidebar a\.is-active \.nav-icon[^{]*\{ animation: none/);
  });
  it('lays a faint paper grain over the original deep blue (texture 4)', () => {
    const sidebar = css.match(/\n\.sidebar \{([^}]*)\}/)?.[1] ?? '';
    expect(sidebar).toMatch(/background: url\("data:image\/svg\+xml,[^"]*feTurbulence[^"]*"\)[^;]*var\(--brand-deep\)/);
  });
});
