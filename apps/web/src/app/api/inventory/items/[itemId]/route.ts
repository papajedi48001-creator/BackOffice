import { NextResponse } from 'next/server';
import { requireActor } from '../../../../../lib/actor';
import { inventoryErrorResponse } from '../../inventory-error-response';
import { catalogService } from '../../inventory-services';

export async function PUT(request: Request, context: { params: Promise<{ itemId: string }> }): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const { itemId } = await context.params;
    return NextResponse.json(await catalogService().updateItem(actor, itemId, await request.json()));
  } catch (error) { return inventoryErrorResponse(error); }
}
