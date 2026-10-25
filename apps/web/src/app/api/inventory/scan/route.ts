import { NextResponse } from 'next/server';
import { requireActor } from '../../../../lib/actor';
import { inventoryErrorResponse } from '../inventory-error-response';
import { inventoryQueries, requireAnyInventoryPermission } from '../inventory-services';

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    requireAnyInventoryPermission(actor, 'inventory.stock.read', 'inventory.stock.receive');
    const result = await inventoryQueries().resolveScan(new URL(request.url).searchParams.get('code') ?? '');
    if (!result) throw new Error('CODE_NOT_FOUND');
    return NextResponse.json(result);
  } catch (error) { return inventoryErrorResponse(error); }
}
