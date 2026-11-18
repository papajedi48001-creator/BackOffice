/** ดาวน์โหลด Excel of monitor แพทย์แผนไทย: SheetJS loads only when the button is clicked. */
import { ttmExportFileName, type TtmExportBook } from './ttm-views';

export async function downloadTtmExport(book: TtmExportBook, start: string, end: string): Promise<void> {
  const XLSX = await import('@e965/xlsx');
  const workbook = XLSX.utils.book_new();
  const head = XLSX.utils.aoa_to_sheet(book.head);
  XLSX.utils.sheet_add_json(head, book.summary, { origin: 'A4' });
  XLSX.utils.book_append_sheet(workbook, head, 'สรุปตามสิทธิ');
  for (const [name, rows] of Object.entries(book.sheets)) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  XLSX.writeFile(workbook, ttmExportFileName(start, end));
}
