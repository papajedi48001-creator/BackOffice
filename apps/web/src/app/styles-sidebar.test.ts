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

describe('เมนูซ้ายลากปรับขนาด + แท็บขอบ (DESIGN.md)', () => {
  it('sizes the menu column from --sidebar-w and stops animating while it is being dragged', () => {
    expect(css).toMatch(/\.app-shell \{[^}]*grid-template-columns: var\(--sidebar-w, 272px\) minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.app-shell\.is-resizing[^{]*\{[^}]*transition: none/);
  });
  it('puts a draggable edge on the menu with a blue tab that sticks out of it', () => {
    expect(css).toMatch(/\.sidebar-edge \{[^}]*position: fixed[^}]*left: calc\(var\(--sidebar-w, 272px\) - 6px\)[^}]*cursor: col-resize/);
    expect(css).toMatch(/\.sidebar-tab \{[^}]*border-radius: 0 12px 12px 0[^}]*background: var\(--brand-deep\)/);
    expect(css).toMatch(/\[data-sidebar-rail\] \.sidebar-tab svg \{[^}]*rotate\(180deg\)/);
  });
  it('folds to a rail with the icon on top and the name under it, only on wide screens', () => {
    const rail = css.match(/@media \(min-width: 721px\) \{\n {2}\.app-shell\[data-sidebar-rail\]([\s\S]*?)\n\}/)?.[0] ?? '';
    expect(rail).toMatch(/\[data-sidebar-rail\] \.brand-text \{ display: none/);
    expect(rail).toMatch(/\[data-sidebar-rail\] \.sidebar \.nav-track a \{[^}]*flex-direction: column/);
    expect(rail).toMatch(/\[data-sidebar-rail\] \.nav-label \{[^}]*-webkit-line-clamp: 2/);
    expect(rail).toMatch(/\[data-sidebar-rail\] \.nav-badge \{[^}]*position: absolute/);
  });
  it('hides the edge on phones and when printing', () => {
    expect(css).toMatch(/@media \(max-width: 720px\) \{ \.sidebar-edge \{ display: none/);
    expect(css).toMatch(/@media print \{[^}]*\.sidebar-edge/);
  });
});
