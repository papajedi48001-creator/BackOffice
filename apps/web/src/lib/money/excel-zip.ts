/** The Excel files inside a .zip (a whole Google Drive folder), read in the browser with SheetJS; temp and Mac files skipped. */
export type ZipEntry = { name: string; bytes: Uint8Array };

const SKIPPED = /(^|\/)(~\$|__MACOSX\/|\._)/;

export async function excelFilesInZip(data: Uint8Array, wanted: RegExp): Promise<ZipEntry[]> {
  const XLSX = await import('@e965/xlsx');
  const zip = XLSX.CFB.read(data, { type: 'array' }) as { FullPaths: string[]; FileIndex: { type: number; content?: ArrayLike<number> }[] };
  return zip.FullPaths.map((path: string, index: number) => [path, zip.FileIndex[index]!] as const)
    .filter(([path, entry]) => entry.type === 2 && entry.content && wanted.test(path) && !SKIPPED.test(path))
    .map(([path, entry]) => ({ name: path.split('/').pop()!, bytes: new Uint8Array(entry.content as ArrayLike<number>) }));
}
