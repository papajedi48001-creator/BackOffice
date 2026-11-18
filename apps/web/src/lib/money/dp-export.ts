/** ดาวน์โหลด Excel of the Point ฟื้นฟูผู้พิการ dashboard: SheetJS loads only when the button is clicked. */
import { dpExportFileName, type DpExportSheets } from './dp-views';

export async function downloadDpExport(sheets: DpExportSheets): Promise<void> {
  const XLSX = await import('@e965/xlsx');
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), name);
  XLSX.writeFile(book, dpExportFileName(new Date()));
}
