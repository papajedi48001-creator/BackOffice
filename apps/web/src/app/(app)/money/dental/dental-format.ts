const baht = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

/** Money with 2 decimals, as the legacy page showed it. */
export const formatMoney = (value: number) => baht.format(value);
/** Counts and chart labels: whole numbers with separators. */
export const formatWhole = (value: number) => whole.format(value);
