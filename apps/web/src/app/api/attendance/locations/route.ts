import { saveLocation } from './save-location';

export function POST(request: Request): Promise<Response> { return saveLocation(request, null); }
