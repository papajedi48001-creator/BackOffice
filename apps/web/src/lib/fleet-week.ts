const DAY = 86_400_000;
const bangkokDay = (instant: Date) => new Date(instant.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/** The Monday (Bangkok) of the week holding `value` (`YYYY-MM-DD`); today's week when it is missing or not a real date. */
export function parseWeekStart(value: string | undefined, now: Date): string {
  const real = value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const day = new Date(`${real ? value : bangkokDay(now)}T00:00:00Z`);
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
}
