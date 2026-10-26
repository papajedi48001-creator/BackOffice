import { describe, expect, it } from 'vitest';
import { requestHref } from './request-inbox';

describe('requestHref', () => {
  it('opens a ใบลา on its leave page and anything else in คำขอ', () => {
    expect(requestHref('leave', 'r-1')).toBe('/leave/requests/r-1');
    expect(requestHref('requests', 'r-2')).toBe('/requests/r-2');
  });
});
