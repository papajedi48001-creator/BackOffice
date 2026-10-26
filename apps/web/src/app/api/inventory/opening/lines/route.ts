import { NextResponse } from 'next/server';
import { requireActor } from '../../../../../lib/actor';
import { inventoryErrorResponse } from '../../inventory-error-response';
import { receiptService } from '../../inventory-services';

export async function PUT(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const opening = await receiptService().saveOpeningLines(actor, await request.json());
    return NextResponse.json({ id: opening.id, reference: opening.reference, status: opening.status });
  } catch (error) { return inventoryErrorResponse(error); }
}
