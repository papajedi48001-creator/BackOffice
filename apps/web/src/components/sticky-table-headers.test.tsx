import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { StickyTableHeaders } from './sticky-table-headers';

const head = <thead><tr><th>วันที่</th></tr></thead>;

it('marks page-level tables, boxed tables and sets the sticky bar offset (กฎตาราง)', () => {
  render(<>
    <div className="app-topbar" style={{ position: 'sticky', top: 0 }} />
    <table id="page">{head}<tbody><tr><td>1</td></tr></tbody></table>
    <div style={{ overflowX: 'auto' }}><table id="boxed">{head}<tbody><tr><td>1</td></tr></tbody></table></div>
    <dialog open><table id="popup">{head}<tbody><tr><td>1</td></tr></tbody></table></dialog>
    <StickyTableHeaders />
  </>);
  expect(document.getElementById('page')).toHaveAttribute('data-sticky-head', 'page');
  expect(document.getElementById('boxed')).toHaveAttribute('data-sticky-head', 'box');
  expect(document.getElementById('popup')).toHaveAttribute('data-sticky-head', 'box');
  expect(document.documentElement.style.getPropertyValue('--table-sticky-top')).toBe('0px');
});

it('is mounted once for every page in the root layout', () => {
  const layout = readFileSync(join(__dirname, '../app/layout.tsx'), 'utf8');
  expect(layout).toMatch(/import \{ StickyTableHeaders \} from '..\/components\/sticky-table-headers'/);
  expect(layout).toMatch(/<StickyTableHeaders \/>/);
});
