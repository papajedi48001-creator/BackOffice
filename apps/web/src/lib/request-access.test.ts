import { expect, test } from 'vitest';
import { canApproveRequest } from './request-access';

test('allows only the pending approval-step assignee to approve', () => {
  expect(canApproveRequest('00000000-0000-4000-8000-000000000003', {
    status: 'IN_REVIEW',
    assigneePersonId: '00000000-0000-4000-8000-000000000003',
  })).toBe(true);

  expect(canApproveRequest('00000000-0000-4000-8000-000000000002', {
    status: 'IN_REVIEW',
    assigneePersonId: '00000000-0000-4000-8000-000000000003',
  })).toBe(false);
});
