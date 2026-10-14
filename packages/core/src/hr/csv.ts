/** Parses RFC 4180 CSV. Blank lines are skipped; an unterminated quote throws INVALID_CSV. */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let index = 0;
  const endRow = () => {
    row.push(cell);
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
    cell = '';
  };
  while (index < input.length) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { cell += '"'; index += 2; continue; }
      if (character === '"') { quoted = false; index += 1; continue; }
      cell += character;
      index += 1;
      continue;
    }
    if (character === '"' && cell === '') quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n') endRow();
    else if (character === '\r') { if (input[index + 1] !== '\n') endRow(); }
    else cell += character;
    index += 1;
  }
  if (quoted) throw new Error('INVALID_CSV');
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}
