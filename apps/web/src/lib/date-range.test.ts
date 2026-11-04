import { expect, it } from 'vitest';
import { endFollowingStart, returnFollowingDepart } from './date-range';

it('starts the end date on the start date when it is empty or now before the start', () => {
  expect(endFollowingStart('2026-12-03', '')).toBe('2026-12-03');
  expect(endFollowingStart('2026-12-03', '2026-11-04')).toBe('2026-12-03');
});

it('keeps an end date the person already set on or after the new start', () => {
  expect(endFollowingStart('2026-12-03', '2026-12-05')).toBe('2026-12-05');
  expect(endFollowingStart('2026-12-03', '2026-12-03')).toBe('2026-12-03');
});

it('moves a return time onto the departure day, keeping its time, or the departure time when none was set', () => {
  expect(returnFollowingDepart('2026-12-03T08:00', '')).toBe('2026-12-03T08:00');
  expect(returnFollowingDepart('2026-12-03T08:00', '2026-11-04T16:30')).toBe('2026-12-03T16:30');
  expect(returnFollowingDepart('2026-12-03T08:00', '2026-12-04T16:30')).toBe('2026-12-04T16:30');
});
