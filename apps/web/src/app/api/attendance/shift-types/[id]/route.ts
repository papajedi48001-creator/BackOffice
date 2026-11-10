import { routeId } from '../../attendance-route';
import { saveShiftType } from '../save-shift-type';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> { return saveShiftType(request, await routeId(context)); }
