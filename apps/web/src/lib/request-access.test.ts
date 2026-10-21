import { expect, test } from 'vitest';
import { canApproveRequest, canCancelRequest, canResubmitRequest, canViewRequest } from './request-access';

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

test('allows a requestor or an approval-step assignee to view a request', () => {
  const request = { requestorPersonId: 'person-requestor', approverPersonIds: ['person-approver'] };

  expect(canViewRequest('person-requestor', request)).toBe(true);
  expect(canViewRequest('person-approver', request)).toBe(true);
  expect(canViewRequest('person-unrelated', request)).toBe(false);
});

test('lets only the requestor cancel an open request', () => {
  expect(canCancelRequest('person-requestor', { requestorPersonId: 'person-requestor', status: 'IN_REVIEW' })).toBe(true);
  expect(canCancelRequest('person-requestor', { requestorPersonId: 'person-requestor', status: 'RETURNED' })).toBe(true);
  expect(canCancelRequest('person-requestor', { requestorPersonId: 'person-requestor', status: 'APPROVED' })).toBe(false);
  expect(canCancelRequest('person-requestor', { requestorPersonId: 'person-requestor', status: 'CANCELLED' })).toBe(false);
  expect(canCancelRequest('person-approver', { requestorPersonId: 'person-requestor', status: 'IN_REVIEW' })).toBe(false);
  expect(canCancelRequest(undefined, { requestorPersonId: 'person-requestor', status: 'IN_REVIEW' })).toBe(false);
});

test('lets only the requestor resubmit a returned request', () => {
  expect(canResubmitRequest('person-requestor', { requestorPersonId: 'person-requestor', status: 'RETURNED' })).toBe(true);
  expect(canResubmitRequest('person-requestor', { requestorPersonId: 'person-requestor', status: 'IN_REVIEW' })).toBe(false);
  expect(canResubmitRequest('person-approver', { requestorPersonId: 'person-requestor', status: 'RETURNED' })).toBe(false);
});
