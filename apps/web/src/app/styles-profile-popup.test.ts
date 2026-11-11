import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

describe('profile forms inside a popup', () => {
  it('lays out only the header button row as a flex row, never a form inside the popup', () => {
    expect(css).not.toMatch(/\.profile-box-header \.profile-form\s*\{/);
    expect(css).toMatch(/\.profile-box-header > \.profile-form\s*\{[^}]*display: flex/);
  });

  it('stacks a popup form one or two fields per row, without the card or a repeated heading', () => {
    expect(css).toMatch(/\.form-dialog-body \.profile-form\s*\{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(240px, 1fr\)\)[^}]*border: 0/);
    expect(css).toMatch(/\.form-dialog-body \.profile-form > h4\s*\{[^}]*display: none/);
  });
});
