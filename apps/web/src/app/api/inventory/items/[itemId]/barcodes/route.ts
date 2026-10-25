import { NextResponse } from 'next/server';
import { requireActor } from '../../../../../../lib/actor';
import { inventoryErrorResponse } from '../../../inventory-error-response';
import { catalogService } from '../../../inventory-services';

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const { itemId } = await context.params;
    return NextResponse.json(await catalogService().addBarcode(actor, itemId, await request.json()), { status: 201 });
  } catch (error) { return inventoryErrorResponse(error); }
}
