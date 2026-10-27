import { describe, expect, it } from 'vitest';
import { notificationTarget } from './module-notification';

describe('notificationTarget', () => {
  it('routes a fleet notice to the by-request page that redirects to the ใบขอใช้รถ', () => {
    expect(notificationTarget('fleet', 'request-1')).toEqual({ moduleCode: 'fleet', targetPath: '/fleet/requests/by-request/request-1' });
  });
  it('keeps leave, travel and other modules where they were', () => {
    expect(notificationTarget('leave', 'r1')).toEqual({ moduleCode: 'leave', targetPath: '/leave/requests/r1' });
    expect(notificationTarget('official-travel', 'r1')).toEqual({ moduleCode: 'official-travel', targetPath: '/travel/requests/r1' });
    expect(notificationTarget('maintenance', 'r1')).toEqual({ moduleCode: 'requests' });
  });
});
