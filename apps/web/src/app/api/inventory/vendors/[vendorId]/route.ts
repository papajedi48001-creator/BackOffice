import { NextResponse } from 'next/server';
import { requireActor } from '../../../../../lib/actor';
import { inventoryErrorResponse } from '../../inventory-error-response';
import { catalogService } from '../../inventory-services';

export async function PUT(request: Request, context: { params: Promise<{ vendorId: string }> }): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const { vendorId } = await context.params;
    return NextResponse.json(await catalogService().updateVendor(actor, vendorId, await request.json()));
  } catch (error) { return inventoryErrorResponse(error); }
}
