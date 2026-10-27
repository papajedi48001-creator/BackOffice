import { z } from 'zod';

export const vehicleKindSchema = z.enum(['SEDAN', 'PICKUP', 'VAN', 'AMBULANCE', 'OTHER']);
export type VehicleKind = z.infer<typeof vehicleKindSchema>;
export const vehicleStatusSchema = z.enum(['ACTIVE', 'IN_REPAIR', 'RETIRED']);
export type VehicleStatus = z.infer<typeof vehicleStatusSchema>;
export const dispatchStatusSchema = z.enum(['WAITING', 'ASSIGNED', 'DECLINED', 'CANCELLED']);
export type DispatchStatus = z.infer<typeof dispatchStatusSchema>;
export const tripStatusSchema = z.enum(['PLANNED', 'DEPARTED', 'RETURNED', 'CANCELLED']);
export type TripStatus = z.infer<typeof tripStatusSchema>;

/** What a requester and a dispatcher see for a ใบขอใช้รถ, derived from the head คำขอ, the dispatch and the เที่ยวรถ. */
export type FleetRequestStatus = 'HEAD_REVIEW' | 'RETURNED' | 'HEAD_REJECTED' | 'WAITING' | 'ASSIGNED' | 'DEPARTED' | 'DONE' | 'DECLINED' | 'CANCELLED';

export type FleetErrorCode =
  | 'INVALID_RANGE' | 'IN_PAST' | 'TOO_FAR_AHEAD' | 'TOO_LONG' | 'NOT_QUARTER_HOUR'
  | 'NO_ORGANIZATION' | 'NO_APPROVER' | 'TRAVEL_NOT_ELIGIBLE' | 'TRAVEL_ALREADY_HAS_CAR'
  | 'NOT_FOUND' | 'NOT_PENDING' | 'NOT_RETURNED'
  | 'VEHICLE_BUSY' | 'DRIVER_BUSY' | 'VEHICLE_UNAVAILABLE' | 'DRIVER_INACTIVE' | 'TRIP_DOES_NOT_COVER'
  | 'DEPARTURE_TOO_EARLY' | 'ODOMETER_BELOW_LAST' | 'ODOMETER_BELOW_OUT'
  | 'DRIVER_HAS_TRIPS' | 'DUPLICATE_REGISTRATION';

const text = (max: number) => z.string().trim().min(1).max(max);
/** An instant as an ISO 8601 UTC string, such as `2026-11-03T01:00:00.000Z`. */
const instant = z.string().datetime();

/** A ใบขอใช้รถ as filed. The requester is the session's person and never comes from the body. */
export const fleetRequestInputSchema = z.object({
  purpose: text(300), destination: text(300), province: text(100),
  departAt: instant, returnAt: instant,
  passengerCount: z.number().int().min(1).max(99),
  passengerNames: z.string().trim().max(1000).default(''),
  /** A phone the driver may call during the trip, entered on the ใบ; the HR profile phone is never used. */
  contactPhone: z.string().trim().max(32).default(''),
  officialTravelId: z.string().min(1).optional()
}).strict();
export type FleetRequestInput = z.infer<typeof fleetRequestInputSchema>;

export const fleetVehicleInputSchema = z.object({
  registration: text(20), makeModel: text(120), kind: vehicleKindSchema,
  seats: z.number().int().min(1).max(60), status: vehicleStatusSchema,
  note: z.string().trim().max(300).default('')
}).strict();
export type FleetVehicleInput = z.infer<typeof fleetVehicleInputSchema>;

export const fleetDriverInputSchema = z.object({ personId: z.string().min(1), phone: text(32), isActive: z.boolean().default(true) }).strict();
export type FleetDriverInput = z.infer<typeof fleetDriverInputSchema>;

/** การจัดรถ: join a PLANNED เที่ยวรถ, or open a new one with a car, a driver and a time range. */
export const fleetAssignmentInputSchema = z.union([
  z.object({ tripId: z.string().min(1) }).strict(),
  z.object({ vehicleId: z.string().min(1), driverPersonId: z.string().min(1), startsAt: instant, endsAt: instant }).strict()
]);
export type FleetAssignmentInput = z.infer<typeof fleetAssignmentInputSchema>;

export const fleetTripUpdateSchema = z.object({
  vehicleId: z.string().min(1).optional(), driverPersonId: z.string().min(1).optional(),
  startsAt: instant.optional(), endsAt: instant.optional()
}).strict().refine((update) => Object.values(update).some((value) => value !== undefined), { message: 'EMPTY_UPDATE' });
export type FleetTripUpdate = z.infer<typeof fleetTripUpdateSchema>;

export const odometerInputSchema = z.object({ odometer: z.number().int().min(0).max(9_999_999) }).strict();
export type OdometerInput = z.infer<typeof odometerInputSchema>;

export const reasonInputSchema = z.object({ reason: text(500) }).strict();
export type ReasonInput = z.infer<typeof reasonInputSchema>;
