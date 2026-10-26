import { requireActor } from '../../../../../../../lib/actor';
import { inventoryErrorResponse } from '../../../../inventory-error-response';
import { catalogService } from '../../../../inventory-services';

export async function DELETE(request: Request, context: { params: Promise<{ barcodeId: string }> }): Promise<Response> {
  try {
    const actor = await requireActor(request);
    const { barcodeId } = await context.params;
    await catalogService().removeBarcode(actor, barcodeId);
    return new Response(null, { status: 204 });
  } catch (error) { return inventoryErrorResponse(error); }
}
