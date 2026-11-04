/** Which HOSxP `holiday` columns hold the date and the name. */
export interface HolidayColumns { dateColumn: string; nameColumn: string }
export interface HolidayEntry { date: string; name: string }

const dateAliases = ['holiday_date', 'hdate', 'h_date', 'date', 'holidaydate'];
const nameAliases = ['day_name', 'holiday_name', 'hname', 'name', 'dayname'];
const NAME_MAX = 120;

function find(columns: string[], wanted: string, aliases: string[]): string | undefined {
  const lower = new Map(columns.map((column) => [column.toLowerCase(), column]));
  for (const candidate of [wanted, ...aliases]) { const hit = lower.get(candidate.toLowerCase()); if (hit) return hit; }
  return undefined;
}

/** The configured columns when present, else the first known alias (case-insensitive); null when either cannot be found. */
export function resolveHolidayColumns(columns: string[], wanted: HolidayColumns): HolidayColumns | null {
  const dateColumn = find(columns, wanted.dateColumn, dateAliases);
  const nameColumn = find(columns, wanted.nameColumn, nameAliases);
  return dateColumn && nameColumn ? { dateColumn, nameColumn } : null;
}

/** A DATE from mysql2 (a Date at local midnight or a string) as `YYYY-MM-DD`; null when it is not a real calendar date. */
export function toIsoDate(value: unknown): string | null {
  let text: string | null = null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) text = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) text = value.trim().slice(0, 10);
  if (!text) return null;
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

/** HOSxP rows as วันหยุด. Rows without a real date or a name are skipped; the first row of a date wins. */
export function mapHolidayRows(rows: Array<Record<string, unknown>>, wanted: HolidayColumns): HolidayEntry[] {
  const columns = resolveHolidayColumns([...new Set(rows.flatMap((row) => Object.keys(row)))], wanted);
  if (!columns) return [];
  const seen = new Set<string>();
  const entries: HolidayEntry[] = [];
  for (const row of rows) {
    const date = toIsoDate(row[columns.dateColumn]);
    const raw = row[columns.nameColumn];
    const name = (typeof raw === 'string' ? raw : raw == null ? '' : String(raw)).trim().slice(0, NAME_MAX);
    if (!date || !name || seen.has(date)) continue;
    seen.add(date);
    entries.push({ date, name });
  }
  return entries;
}
