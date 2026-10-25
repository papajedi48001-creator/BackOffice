import { NextResponse } from 'next/server';
import { requireActor } from '../../../../../../lib/actor';
import { inventoryErrorResponse } from '../../../inventory-error-response';
import { receiptService } from '../../../inventory-services';

export async function POST(request: Request, context: { params: Promise<{ receiptId: string }> }): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const { receiptId } = await context.params;
    const body = await request.json() as { reason?: unknown } | null;
    const receipt = await receiptService().voidDelivery(actor, { receiptId, reason: body?.reason as string });
    return NextResponse.json({ id: receipt.id, reference: receipt.reference, status: receipt.status });
  } catch (error) { return inventoryErrorResponse(error); }
}
