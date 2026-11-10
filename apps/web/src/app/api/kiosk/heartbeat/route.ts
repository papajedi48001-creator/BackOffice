import { DeviceQueries } from '@backoffice/core';
import { kioskError, kioskJson, withDevice } from '../kiosk-route';

/** Every 60 s from a paired box: marks it ออนไลน์ and hands back the server time it shows. */
export function POST(request: Request): Promise<Response> {
  return withDevice(request, async (device, database) => {
    const identity = await new DeviceQueries(database).identity(device.id);
    if (!identity) return kioskError('DEVICE_SIGNATURE_INVALID', 401);
    return kioskJson({ serverTime: new Date().toISOString(), ...identity });
  });
}

export const dynamic = 'force-dynamic';
