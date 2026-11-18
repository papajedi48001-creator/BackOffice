/** ดาวน์โหลด Excel of the FDH dashboard: SheetJS loads only when the button is clicked, as on the NHSO page. */
import { fdhExportFileName, type FdhExportSheets } from './fdh-views';

type Sheets = typeof import('@e965/xlsx');

export function fdhWorkbook(XLSX: Sheets, sheets: FdhExportSheets) {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), name);
  return book;
}

export async function downloadFdhExport(sheets: FdhExportSheets): Promise<void> {
  const XLSX = await import('@e965/xlsx');
  XLSX.writeFile(fdhWorkbook(XLSX, sheets), fdhExportFileName(new Date()));
}
