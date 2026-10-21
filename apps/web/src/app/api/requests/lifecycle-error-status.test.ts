import { describe, expect, it } from 'vitest';
import { lifecycleErrorStatus } from './lifecycle-error-status';

describe('lifecycleErrorStatus', () => {
  it('maps lifecycle codes to HTTP statuses', () => {
    expect(lifecycleErrorStatus('REQUEST_NOT_FOUND')).toBe(404);
    expect(lifecycleErrorStatus('NOT_REQUESTOR')).toBe(404);
    expect(lifecycleErrorStatus('REQUEST_NOT_CANCELLABLE')).toBe(409);
    expect(lifecycleErrorStatus('REQUEST_NOT_RETURNED')).toBe(409);
    expect(lifecycleErrorStatus('REASON_REQUIRED')).toBe(422);
    expect(lifecycleErrorStatus('NO_APPROVER')).toBe(422);
    expect(lifecycleErrorStatus('INTERNAL_ERROR')).toBe(400);
  });
});
