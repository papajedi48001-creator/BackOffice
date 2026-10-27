import { describe, expect, it } from 'vitest';
import { canCancel, fleetRequestStatus } from './fleet-status';

describe('fleetRequestStatus', () => {
  it.each([
    [{ headStatus: 'IN_REVIEW', dispatchStatus: 'WAITING', tripStatus: null }, 'HEAD_REVIEW'],
    [{ headStatus: 'RETURNED', dispatchStatus: 'WAITING', tripStatus: null }, 'RETURNED'],
    [{ headStatus: 'REJECTED', dispatchStatus: 'WAITING', tripStatus: null }, 'HEAD_REJECTED'],
    [{ headStatus: 'CANCELLED', dispatchStatus: 'WAITING', tripStatus: null }, 'CANCELLED'],
    [{ headStatus: 'CANCELLED', dispatchStatus: 'CANCELLED', tripStatus: null }, 'CANCELLED'],
    [{ headStatus: 'APPROVED', dispatchStatus: 'WAITING', tripStatus: null }, 'WAITING'],
    [{ headStatus: null, dispatchStatus: 'WAITING', tripStatus: null }, 'WAITING'],
    [{ headStatus: 'APPROVED', dispatchStatus: 'DECLINED', tripStatus: null }, 'DECLINED'],
    [{ headStatus: 'APPROVED', dispatchStatus: 'CANCELLED', tripStatus: null }, 'CANCELLED'],
    [{ headStatus: null, dispatchStatus: 'CANCELLED', tripStatus: null }, 'CANCELLED'],
    [{ headStatus: null, dispatchStatus: 'ASSIGNED', tripStatus: 'PLANNED' }, 'ASSIGNED'],
    [{ headStatus: null, dispatchStatus: 'ASSIGNED', tripStatus: 'DEPARTED' }, 'DEPARTED'],
    [{ headStatus: 'APPROVED', dispatchStatus: 'ASSIGNED', tripStatus: 'RETURNED' }, 'DONE'],
    [{ headStatus: null, dispatchStatus: 'ASSIGNED', tripStatus: null }, 'WAITING'],
    [{ headStatus: null, dispatchStatus: 'ASSIGNED', tripStatus: 'CANCELLED' }, 'WAITING']
  ] as const)('%j -> %s', (input, expected) => {
    expect(fleetRequestStatus(input)).toBe(expected);
  });
});

describe('canCancel', () => {
  it('allows the four open statuses only', () => {
    for (const status of ['HEAD_REVIEW', 'RETURNED', 'WAITING', 'ASSIGNED'] as const) expect(canCancel(status)).toBe(true);
    for (const status of ['HEAD_REJECTED', 'DEPARTED', 'DONE', 'DECLINED', 'CANCELLED'] as const) expect(canCancel(status)).toBe(false);
  });
});
