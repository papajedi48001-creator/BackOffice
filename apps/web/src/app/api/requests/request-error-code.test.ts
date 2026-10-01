import { describe, expect, it } from 'vitest';
import { requestErrorCode } from './request-error-code';

describe('requestErrorCode', () => {
  it('keeps only known workflow and authorization codes', () => {
    expect(requestErrorCode(new Error('NO_APPROVER'))).toBe('NO_APPROVER');
    expect(requestErrorCode({ status: 401 })).toBe('UNAUTHENTICATED');
    expect(requestErrorCode({ status: 403 })).toBe('FORBIDDEN');
  });

  it('replaces database and unexpected messages with a generic code', () => {
    expect(requestErrorCode(new Error('ER_ACCESS_DENIED_ERROR: password=secret'))).toBe('INTERNAL_ERROR');
    expect(requestErrorCode(new Error('1234567890123'))).toBe('INTERNAL_ERROR');
  });
});
