import { expect, it } from 'vitest';
import { labDayOf } from './lab-text';

it('takes the Bangkok day of a UTC instant, not its UTC day', () => {
  expect(labDayOf('2026-11-09T23:30:00.000Z')).toBe('2026-11-10');
  expect(labDayOf('2026-11-10T16:59:00.000Z')).toBe('2026-11-10');
});
