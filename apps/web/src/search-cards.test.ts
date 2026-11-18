import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * การ์ดค้นหา (DESIGN.md): every search box and filter form above a list sits in one `search-card`, the design chosen for
 * ทะเบียนบุคลากร. A page that adds a filter form (`method="get"`) or a search box without the card fails here.
 * Exempt: search boxes that pick a person or item inside a form or popup, and the public MCI board, which has its own big layout.
 */
const exempt = new Set(['app/(app)/admin/person-picker.tsx', 'app/(app)/fleet/settings/driver-form.tsx', 'app/(app)/travel/new/travel-form.tsx', 'app/mci/board/board-view.tsx',
  // Rendered inside the search-card of dental-dashboard.tsx, and the row search inside the รายละเอียดรายการ card.
  'app/(app)/money/dental/dental-filters.tsx', 'app/(app)/money/dental/dental-detail-table.tsx',
  // The row search inside the report tabs of เงินโอน สปสช., as on the legacy page.
  'app/(app)/money/nhso/nhso-details.tsx',
  // The searches inside the รายเคส / รายบุคคล / รายกองทุนย่อย tabs of ติดตามกองทุนย่อย FDH, under its filter search-card.
  'app/(app)/money/fdh/fdh-detail.tsx',
  // The row search inside the รายการ tab of Point ฟื้นฟูผู้พิการ, under its filter search-card.
  'app/(app)/money/disability/dp-detail.tsx']);
const filterForms = [/method="get"/, /type="search"/, /className="(?:leave|lab|money-date)-filter"/];

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name) ? [path] : [];
  });
}

describe('search cards', () => {
  it('put every list search box and filter form in a search-card', () => {
    const offenders = sources(__dirname)
      .map((file) => relative(__dirname, file).replaceAll('\\', '/'))
      .filter((file) => !exempt.has(file))
      .filter((file) => { const text = readFileSync(join(__dirname, file), 'utf8'); return filterForms.some((pattern) => pattern.test(text)) && !text.includes('search-card'); });
    expect(offenders).toEqual([]);
  });
});
