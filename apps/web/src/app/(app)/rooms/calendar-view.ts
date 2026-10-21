import { addDays, datesBetween, mondayOf } from '../../../lib/bangkok-time';

export interface CalendarView { view: 'week' | 'day'; anchor: string; dates: string[]; previous: string; next: string; }

/** A real calendar date in `YYYY-MM-DD` form, or `null`; a bad query value then shows today rather than failing the page. */
function calendarDate(value: string | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

/** Week view starts on Monday; day view shows one date. `previous`/`next` are the anchors of the neighbouring page. */
export function calendarView(params: { view?: string; week?: string; date?: string }, today: string): CalendarView {
  if (params.view === 'day') {
    const anchor = calendarDate(params.date) ?? today;
    return { view: 'day', anchor, dates: [anchor], previous: addDays(anchor, -1), next: addDays(anchor, 1) };
  }
  const anchor = mondayOf(calendarDate(params.week) ?? today);
  return { view: 'week', anchor, dates: datesBetween(anchor, addDays(anchor, 6)), previous: addDays(anchor, -7), next: addDays(anchor, 7) };
}
