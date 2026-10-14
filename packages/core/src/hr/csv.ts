export interface CsvRecord {
  /** 1-based line the record starts on, as a spreadsheet numbers it. */
  line: number;
  cells: string[];
}

/** Parses RFC 4180 CSV. Blank lines are skipped; an unterminated quote throws INVALID_CSV. */
export function parseCsv(text: string): string[][] {
  return parseCsvRecords(text).map((record) => record.cells);
}

export function parseCsvRecords(text: string): CsvRecord[] {
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  const records: CsvRecord[] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let index = 0;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    row.push(cell);
    if (row.length > 1 || row[0] !== '') records.push({ line: rowLine, cells: row });
    row = [];
    cell = '';
    line += 1;
    rowLine = line;
  };
  while (index < input.length) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') { cell += '"'; index += 2; continue; }
      if (character === '"') { quoted = false; index += 1; continue; }
      if (character === '\n') line += 1;
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
  return records;
}
