import { expect, it } from 'vitest';
import { axisLabel, niceScale } from './chart-scale';

it('steps the value axis in round numbers up to the first step at or above the largest value', () => {
  expect(niceScale(8_000_000).ticks).toEqual([0, 2_000_000, 4_000_000, 6_000_000, 8_000_000]);
  expect(niceScale(2_750_000)).toEqual({ top: 3_000_000, ticks: [0, 500_000, 1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000] });
  expect(niceScale(150).top).toBe(150);
  expect(niceScale(7).ticks).toEqual([0, 2, 4, 6, 8]);
});

it('draws an axis from 0 to 1 when there is nothing above zero', () => {
  expect(niceScale(0)).toEqual({ top: 1, ticks: [0, 1] });
  expect(niceScale(-5)).toEqual({ top: 1, ticks: [0, 1] });
});

it('writes millions as ล. and smaller values with thousands separators', () => {
  expect(axisLabel(2_500_000)).toBe('2.5 ล.');
  expect(axisLabel(8_000_000)).toBe('8 ล.');
  expect(axisLabel(1_600_000)).toBe('1.6 ล.');
  expect(axisLabel(500_000)).toBe('500,000');
  expect(axisLabel(2.5)).toBe('2.5');
  expect(axisLabel(0)).toBe('0');
});
