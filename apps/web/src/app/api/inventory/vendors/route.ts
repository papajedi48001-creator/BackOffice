import { NextResponse } from 'next/server';
import { requireActor } from '../../../../lib/actor';
import { inventoryErrorResponse } from '../inventory-error-response';
import { catalogService } from '../inventory-services';

export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    return NextResponse.json(await catalogService().createVendor(actor, await request.json()), { status: 201 });
  } catch (error) { return inventoryErrorResponse(error); }
}
