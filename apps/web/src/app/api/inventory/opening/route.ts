import { NextResponse } from 'next/server';
import { requireActor } from '../../../../lib/actor';
import { inventoryErrorResponse } from '../inventory-error-response';
import { receiptService } from '../inventory-services';

/** Creates the opening balance draft the first time anyone in the supplies unit opens it. */
export async function POST(request: Request): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const opening = await receiptService().openOpening(actor);
    return NextResponse.json({ id: opening.id, reference: opening.reference, status: opening.status });
  } catch (error) { return inventoryErrorResponse(error); }
}
