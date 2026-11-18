/** ดาวน์โหลดรายงาน Excel: every report tab on its own sheet, as the legacy page did. SheetJS loads only when it is clicked. */
import type { NhsoTable } from './nhso-core';

type Sheets = typeof import('@e965/xlsx');

export function nhsoReportWorkbook(XLSX: Sheets, report: Record<string, NhsoTable>) {
  const book = XLSX.utils.book_new();
  for (const [name, { columns, rows }] of Object.entries(report)) {
    const sheet = XLSX.utils.json_to_sheet(rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? '']))), { header: columns });
    sheet['!cols'] = columns.map((column) => ({ wch: Math.min(50, Math.max(10, String(column).length + 2, ...rows.slice(0, 500).map((row) => String(row[column] ?? '').length + 2))) }));
    XLSX.utils.book_append_sheet(book, sheet, name.slice(0, 31));
  }
  return book;
}

export function nhsoReportFileName(now: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `NHSO_transfer_report_${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}_${two(now.getHours())}${two(now.getMinutes())}.xlsx`;
}

export async function downloadNhsoReport(report: Record<string, NhsoTable>): Promise<void> {
  const XLSX = await import('@e965/xlsx');
  XLSX.writeFile(nhsoReportWorkbook(XLSX, report), nhsoReportFileName(new Date()));
}
