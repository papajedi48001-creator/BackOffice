import { routeId } from '../../attendance-route';
import { saveLocation } from '../save-location';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> { return saveLocation(request, await routeId(context)); }
