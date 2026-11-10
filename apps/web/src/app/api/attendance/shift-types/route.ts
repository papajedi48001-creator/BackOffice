import { saveShiftType } from './save-shift-type';

export function POST(request: Request): Promise<Response> { return saveShiftType(request, null); }
