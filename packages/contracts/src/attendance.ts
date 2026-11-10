import { z } from 'zod';

/** ระบบลงเวลาปฏิบัติงาน. See docs/superpowers/specs/2026-11-10-attendance-design.md. */
export const ATTENDANCE_MODULE = 'attendance';

/** 24-hour clock time "HH:MM"; "24:00" is not a time. */
export const attendanceTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'กรอกเวลาเป็น ชช:นน');

const name = (max: number) => z.string().trim().min(1, 'กรอกชื่อ').max(max, `ชื่อยาวได้ไม่เกิน ${max} ตัวอักษร`);
const whole = (min: number, max: number) => z.number().int('กรอกจำนวนเต็ม').min(min, `ต้องไม่น้อยกว่า ${min}`).max(max, `ต้องไม่เกิน ${max}`);

/** ประเภทเวร. An end time at or before the start means the shift ends the next day; equal times are refused. */
export const attendanceShiftTypeInputSchema = z.object({
  name: name(60),
  startTime: attendanceTimeSchema,
  endTime: attendanceTimeSchema,
  earlyWindowMinutes: whole(0, 240),
  lateGraceMinutes: whole(0, 120),
  earlyLeaveGraceMinutes: whole(0, 120),
  checkoutWindowMinutes: whole(30, 720),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'เลือกสี'),
  isActive: z.boolean()
}).strict().refine((shift) => shift.startTime !== shift.endTime, { message: 'เวลาเริ่มและเวลาเลิกต้องไม่เท่ากัน', path: ['endTime'] });
export type AttendanceShiftTypeInput = z.infer<typeof attendanceShiftTypeInputSchema>;

/** จุดลงเวลา: where a กล่องลงเวลา stands and the GPS radius a phone must be inside. */
export const attendanceLocationInputSchema = z.object({
  name: name(100),
  latitude: z.number().min(-90, 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90').max(90, 'ละติจูดต้องอยู่ระหว่าง -90 ถึง 90'),
  longitude: z.number().min(-180, 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180').max(180, 'ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180'),
  radiusMeters: whole(10, 2000),
  isActive: z.boolean()
}).strict();
export type AttendanceLocationInput = z.infer<typeof attendanceLocationInputSchema>;

/** กล่องลงเวลา at one จุดลงเวลา. */
export const attendanceDeviceInputSchema = z.object({ name: name(100), locationId: z.string().uuid() }).strict();
export type AttendanceDeviceInput = z.infer<typeof attendanceDeviceInputSchema>;

const coordinate = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
/** The box's ECDSA P-256 public key as a JWK; the private half never leaves the box. */
export const attendancePublicKeyJwkSchema = z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: coordinate, y: coordinate }).strict();
export type AttendancePublicKeyJwk = z.infer<typeof attendancePublicKeyJwkSchema>;

/** รหัสจับคู่: 8 digits shown once to the ผู้ดูแลระบบ, typed on the box. */
export const attendancePairInputSchema = z.object({ pairingCode: z.string().regex(/^\d{8}$/, 'กรอกรหัสจับคู่ 8 หลัก'), publicKey: attendancePublicKeyJwkSchema }).strict();
export type AttendancePairInput = z.infer<typeof attendancePairInputSchema>;

export const attendanceSettingsInputSchema = z.object({
  gpsMaxAccuracyMeters: whole(5, 500),
  gpsMaxAgeSeconds: whole(10, 600),
  retentionDays: whole(30, 3650),
  requestWindowDays: whole(1, 90),
  pinMaxAttempts: whole(3, 10),
  pinLockMinutes: whole(1, 120),
  defaultRadiusMeters: whole(10, 2000)
}).strict();
export type AttendanceSettings = z.infer<typeof attendanceSettingsInputSchema>;

export const attendanceDefaultSettings: AttendanceSettings = { gpsMaxAccuracyMeters: 50, gpsMaxAgeSeconds: 60, retentionDays: 365, requestWindowDays: 30, pinMaxAttempts: 5, pinLockMinutes: 15, defaultRadiusMeters: 100 };

export const attendanceErrorCodeSchema = z.enum([
  'DEVICE_REVOKED', 'DEVICE_SIGNATURE_INVALID', 'REQUEST_REPLAYED', 'QR_EXPIRED', 'QR_USED', 'QR_INVALID', 'OUTSIDE_AREA', 'GPS_INACCURATE', 'GPS_STALE',
  'PIN_INVALID', 'PIN_LOCKED', 'FACE_NOT_RECOGNIZED', 'FACE_LIVENESS_FAILED', 'FACE_SERVICE_UNAVAILABLE', 'PERSON_INACTIVE', 'SHIFT_OVERLAP', 'PERIOD_CLOSED',
  'REQUEST_TOO_OLD', 'CONFLICT_OF_INTEREST', 'NOT_FOUND', 'DUPLICATE_NAME', 'PAIRING_CODE_INVALID', 'MODULE_OFF'
]);
export type AttendanceErrorCode = z.infer<typeof attendanceErrorCodeSchema>;
