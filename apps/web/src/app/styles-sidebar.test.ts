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
  it('lays a faint paper grain over the original deep blue (texture 4)', () => {
    const sidebar = css.match(/\n\.sidebar \{([^}]*)\}/)?.[1] ?? '';
    expect(sidebar).toMatch(/background: url\("data:image\/svg\+xml,[^"]*feTurbulence[^"]*"\)[^;]*var\(--brand-deep\)/);
  });
});
