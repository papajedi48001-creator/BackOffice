import { describe, expect, it } from 'vitest';
import { fleetAssignmentInputSchema, fleetDriverInputSchema, fleetRequestInputSchema, fleetTripUpdateSchema, fleetVehicleInputSchema, odometerInputSchema, reasonInputSchema } from './fleet.ts';

const valid = { purpose: 'ส่งตัวผู้ป่วย', destination: 'โรงพยาบาลมหาสารคาม', province: 'มหาสารคาม', departAt: '2026-11-03T01:00:00.000Z', returnAt: '2026-11-03T09:00:00.000Z', passengerCount: 3 };

describe('fleetRequestInputSchema', () => {
  it('accepts a ใบ and defaults passenger names', () => {
    expect(fleetRequestInputSchema.parse(valid)).toMatchObject({ passengerNames: '' });
  });
  it('rejects zero passengers, 100 passengers, non-ISO times and unknown keys', () => {
    expect(fleetRequestInputSchema.safeParse({ ...valid, passengerCount: 0 }).success).toBe(false);
    expect(fleetRequestInputSchema.safeParse({ ...valid, passengerCount: 100 }).success).toBe(false);
    expect(fleetRequestInputSchema.safeParse({ ...valid, departAt: '2026-11-03 08:00' }).success).toBe(false);
    expect(fleetRequestInputSchema.safeParse({ ...valid, requestorPersonId: 'x' }).success).toBe(false);
  });
  it('accepts an optional official travel id', () => {
    expect(fleetRequestInputSchema.safeParse({ ...valid, officialTravelId: 'travel-1' }).success).toBe(true);
  });
});

describe('vehicle and driver input', () => {
  const vehicle = { registration: 'กษ 1234', makeModel: 'Toyota Hilux', kind: 'PICKUP', seats: 5, status: 'ACTIVE' };
  it('defaults the note and rejects bad kinds and seats', () => {
    expect(fleetVehicleInputSchema.parse(vehicle)).toMatchObject({ note: '' });
    expect(fleetVehicleInputSchema.safeParse({ ...vehicle, kind: 'BUS' }).success).toBe(false);
    expect(fleetVehicleInputSchema.safeParse({ ...vehicle, seats: 0 }).success).toBe(false);
  });
  it('defaults a driver to active', () => {
    expect(fleetDriverInputSchema.parse({ personId: 'p', phone: '0812345678' })).toMatchObject({ isActive: true });
  });
});

describe('assignment, trip update, odometer and reason', () => {
  const full = { vehicleId: 'v', driverPersonId: 'd', startsAt: '2026-11-03T00:30:00.000Z', endsAt: '2026-11-03T10:00:00.000Z' };
  it('takes an existing trip or a new one, not a mix', () => {
    expect(fleetAssignmentInputSchema.safeParse({ tripId: 't' }).success).toBe(true);
    expect(fleetAssignmentInputSchema.safeParse(full).success).toBe(true);
    expect(fleetAssignmentInputSchema.safeParse({ ...full, tripId: 't' }).success).toBe(false);
    expect(fleetAssignmentInputSchema.safeParse({ vehicleId: 'v' }).success).toBe(false);
  });
  it('needs at least one field to update a trip', () => {
    expect(fleetTripUpdateSchema.safeParse({}).success).toBe(false);
    expect(fleetTripUpdateSchema.safeParse({ driverPersonId: 'd' }).success).toBe(true);
  });
  it('bounds the odometer and trims the reason', () => {
    expect(odometerInputSchema.safeParse({ odometer: 0 }).success).toBe(true);
    expect(odometerInputSchema.safeParse({ odometer: 10_000_000 }).success).toBe(false);
    expect(odometerInputSchema.safeParse({ odometer: 1.5 }).success).toBe(false);
    expect(reasonInputSchema.parse({ reason: '  ไม่ว่าง ' })).toEqual({ reason: 'ไม่ว่าง' });
    expect(reasonInputSchema.safeParse({ reason: '   ' }).success).toBe(false);
  });
});
