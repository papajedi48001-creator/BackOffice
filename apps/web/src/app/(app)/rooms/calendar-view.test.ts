import { describe, expect, it } from 'vitest';
import { calendarView } from './calendar-view';

const today = '2026-11-05';

describe('calendarView', () => {
  it('shows the current week from Monday by default', () => {
    expect(calendarView({}, today)).toMatchObject({ view: 'week', dates: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'], previous: '2026-10-26', next: '2026-11-09' });
  });

  it('shows the week of a chosen date', () => {
    expect(calendarView({ week: '2026-11-12' }, today)).toMatchObject({ view: 'week', previous: '2026-11-02', next: '2026-11-16' });
  });

  it('shows a single day with the days either side to move to', () => {
    expect(calendarView({ view: 'day', date: '2026-11-07' }, today)).toEqual({ view: 'day', anchor: '2026-11-07', dates: ['2026-11-07'], previous: '2026-11-06', next: '2026-11-08' });
  });

  it.each(['2026-13-45', '2026-02-30', 'tomorrow', '2026-1-5'])('falls back to today for an unusable date %s instead of failing', (date) => {
    expect(calendarView({ week: date }, today)).toMatchObject({ view: 'week', anchor: '2026-11-02' });
    expect(calendarView({ view: 'day', date }, today)).toMatchObject({ view: 'day', anchor: today });
  });
});
