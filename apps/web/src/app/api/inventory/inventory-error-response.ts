import { NextResponse } from 'next/server';
import { DuplicateBarcodeError } from '@backoffice/core';
import { AuthorizationError } from '../../../lib/require-authorized';

const statusByCode: Record<string, number> = {
  INVALID_LINE: 400, EXPIRY_REQUIRED: 400, EXPIRY_NOT_ALLOWED: 400, EXPIRY_IN_PAST: 400, INVALID_RECEIVED_DATE: 400, REASON_REQUIRED: 400, EMPTY_RECEIPT: 400,
  FORBIDDEN: 403,
  ITEM_NOT_FOUND: 404, CATEGORY_NOT_FOUND: 404, VENDOR_NOT_FOUND: 404, BARCODE_NOT_FOUND: 404, RECEIPT_NOT_FOUND: 404, CODE_NOT_FOUND: 404,
  DUPLICATE_CODE: 409, DUPLICATE_NAME: 409, ITEM_HAS_LOTS: 409, ITEM_INACTIVE: 409, VENDOR_INACTIVE: 409, CATEGORY_INACTIVE: 409,
  OPENING_NOT_EDITABLE: 409, OPENING_NOT_SUBMITTED: 409, OPENING_NOT_CERTIFIED: 409, RECEIPT_NOT_VOIDABLE: 409,
  SERVICE_UNAVAILABLE: 503
};

export function inventoryErrorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) return NextResponse.json({ error: error.status === 401 ? 'unauthenticated' : 'FORBIDDEN' }, { status: error.status });
  if (error instanceof DuplicateBarcodeError) return NextResponse.json({ error: 'DUPLICATE_BARCODE', itemCode: error.itemCode }, { status: 409 });
  if (error instanceof Error && error.name === 'ZodError') return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 });
  const code = error instanceof Error ? error.message : '';
  const status = statusByCode[code];
  if (status) return NextResponse.json({ error: code }, { status });
  // Database messages can echo row values such as document numbers, so log the error class only.
  console.error('backoffice.inventory_failed', { code: error instanceof Error ? error.name : 'unknown' });
  return NextResponse.json({ error: 'inventory_failed' }, { status: 500 });
}
