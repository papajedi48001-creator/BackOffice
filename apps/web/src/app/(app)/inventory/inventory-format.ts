const grouping = new Intl.NumberFormat('th-TH');
const thaiDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const thaiDateTime = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

export function formatQuantity(quantity: number, unit: string): string {
  return `${grouping.format(quantity)} ${unit}`;
}

/** Works on the decimal string from the database so large values keep every satang. */
export function formatBaht(decimal: string): string {
  const [whole = '0', fraction = ''] = decimal.split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  return `${negative ? '-' : ''}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

/** `isoDate` is already a Bangkok calendar date, so it is formatted without shifting time zones. */
export function formatThaiDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return thaiDate.format(new Date(Date.UTC(year!, month! - 1, day!)));
}

export function formatThaiDateTime(instant: Date | string): string {
  return thaiDateTime.format(new Date(instant));
}
