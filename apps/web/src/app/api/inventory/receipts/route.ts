import { NextResponse } from 'next/server';
import { requireActor } from '../../../../lib/actor';
import { inventoryErrorResponse } from '../inventory-error-response';
import { inventoryQueries, receiptService, requireAnyInventoryPermission } from '../inventory-services';

export async function GET(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    requireAnyInventoryPermission(actor, 'inventory.stock.receive');
    return NextResponse.json({ receipts: await inventoryQueries().listReceipts() });
  } catch (error) { return inventoryErrorResponse(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const receipt = await receiptService().postDelivery(actor, await request.json());
    return NextResponse.json({ id: receipt.id, reference: receipt.reference }, { status: 201 });
  } catch (error) { return inventoryErrorResponse(error); }
}
