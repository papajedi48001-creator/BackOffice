import { describe, expect, it } from 'vitest';
import { tripStatus } from './travel-status';

describe('tripStatus', () => {
  it.each([
    [['APPROVED', 'RETURNED'], 'RETURNED'],
    [['APPROVED', 'IN_REVIEW'], 'IN_REVIEW'],
    [['RETURNED', 'IN_REVIEW'], 'RETURNED'],
    [['CANCELLED', 'CANCELLED'], 'CANCELLED'],
    [['REJECTED', 'CANCELLED'], 'REJECTED'],
    [['REJECTED'], 'REJECTED'],
    [['APPROVED', 'REJECTED'], 'APPROVED'],
    [['APPROVED'], 'APPROVED']
  ] as const)('%j is %s', (statuses, expected) => {
    expect(tripStatus([...statuses])).toBe(expected);
  });
});
