import { describe, expect, it, vi } from 'vitest';
import { DuplicateBarcodeError } from '@backoffice/core';
import { AuthorizationError } from '../../../lib/require-authorized';
import { inventoryErrorResponse } from './inventory-error-response';

describe('inventoryErrorResponse', () => {
  it.each([
    ['EXPIRY_REQUIRED', 400], ['INVALID_RECEIVED_DATE', 400], ['FORBIDDEN', 403], ['ITEM_NOT_FOUND', 404], ['CODE_NOT_FOUND', 404],
    ['DUPLICATE_CODE', 409], ['OPENING_NOT_SUBMITTED', 409], ['OPENING_NOT_CERTIFIED', 409], ['RECEIPT_NOT_VOIDABLE', 409], ['SERVICE_UNAVAILABLE', 503]
  ])('answers %s with %i', async (code, status) => {
    const response = inventoryErrorResponse(new Error(code));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });

  it('names the item that already owns a barcode', async () => {
    const response = inventoryErrorResponse(new DuplicateBarcodeError('AB-01'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'DUPLICATE_BARCODE', itemCode: 'AB-01' });
  });

  it('answers 401 without a session', () => {
    expect(inventoryErrorResponse(new AuthorizationError(401)).status).toBe(401);
  });

  it('never echoes an unknown error message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = inventoryErrorResponse(new Error("Duplicate entry 'IV-SECRET' for key"));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('IV-SECRET');
    expect(JSON.stringify(log.mock.calls)).not.toContain('IV-SECRET');
    log.mockRestore();
  });
});
