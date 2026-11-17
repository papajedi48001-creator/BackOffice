import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

describe('search card (ทะเบียนบุคลากร)', () => {
  it('lays the search wide and the three filters beside it, one column on a phone', () => {
    expect(css).toMatch(/\.search-card \{[^}]*border-radius: 16px/);
    expect(css).toMatch(/\.search-card-fields \{[^}]*grid-template-columns: minmax\(0, 2fr\) repeat\(3, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/@media \(max-width: 760px\) \{[^}]*\.search-card-fields \{[^}]*grid-template-columns: 1fr/);
  });

  it('puts the magnifier inside the search box and the count with ล้างตัวกรอง at the foot', () => {
    expect(css).toMatch(/\.search-card-input svg \{[^}]*position: absolute/);
    expect(css).toMatch(/\.search-card-foot \{[^}]*justify-content: space-between/);
    expect(css).toMatch(/\.app-main \.search-card button\.link-button \{[^}]*background: none/);
  });
});

describe('button rows', () => {
  it('lines ส่งรับรอง up with the other ยอดยกมา buttons instead of sitting on its own margin', () => {
    expect(css).toMatch(/\.lab-actions > \.request-actions \{[^}]*display: contents/);
  });
});

describe('magnifier', () => {
  it('keeps the text clear of the magnifier: the padding rule outranks the general search-card input rule', () => {
    expect(css).toMatch(/\.search-card \.search-card-input input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="hidden"\]\) \{[^}]*padding-left: 42px/);
  });
});
