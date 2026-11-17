import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(__dirname, 'styles.css'), 'utf8');

describe('ตาราง: ปุ่มจัดการท้ายแถว', () => {
  it('keeps a td.request-actions a real table cell, so its buttons stay inside their row', () => {
    // .request-actions is a flex box with a bottom margin for button rows under a request; on a <td> that turns the cell
    // into a flex box outside the table grid, and the buttons drift out of their row (ตั้งค่าโปรแกรม, กำหนดสิทธิ์, ...).
    expect(css).toMatch(/td\.request-actions \{[^}]*display: table-cell/);
    expect(css).toMatch(/td\.request-actions \{[^}]*margin: 0/);
  });
  it('keeps rows compact: 9px above and below each cell', () => {
    expect(css).toMatch(/\nth, td \{[^}]*padding: 9px 14px/);
  });
});
