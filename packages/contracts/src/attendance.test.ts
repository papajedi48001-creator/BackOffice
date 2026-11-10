import { describe, expect, it } from 'vitest';
import { attendanceLocationInputSchema, attendancePairInputSchema, attendanceSettingsInputSchema, attendanceShiftTypeInputSchema } from './attendance.ts';

const shift = { name: 'เวรข้ามวัน', startTime: '20:00', endTime: '08:00', earlyWindowMinutes: 60, lateGraceMinutes: 0, earlyLeaveGraceMinutes: 0, checkoutWindowMinutes: 240, colorHex: '#1D4ED8', isActive: true };
const location = { name: 'ประตูหน้า อาคารผู้ป่วยนอก', latitude: 17.2, longitude: 103.1, radiusMeters: 100, isActive: true };
const coordinate = 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU';
const pair = { pairingCode: '12345678', publicKey: { kty: 'EC', crv: 'P-256', x: coordinate, y: coordinate } };

describe('attendanceShiftTypeInputSchema', () => {
  it('accepts a shift that ends the next day', () => {
    expect(attendanceShiftTypeInputSchema.parse(shift)).toMatchObject({ startTime: '20:00', endTime: '08:00' });
  });
  it('rejects 24:00, equal start and end, and unknown keys', () => {
    expect(attendanceShiftTypeInputSchema.safeParse({ ...shift, startTime: '24:00' }).success).toBe(false);
    const equal = attendanceShiftTypeInputSchema.safeParse({ ...shift, endTime: '20:00' });
    expect(equal.success).toBe(false);
    expect(equal.error?.issues[0]?.message).toBe('เวลาเริ่มและเวลาเลิกต้องไม่เท่ากัน');
    expect(attendanceShiftTypeInputSchema.safeParse({ ...shift, extra: 1 }).success).toBe(false);
  });
});

describe('attendanceLocationInputSchema', () => {
  it('rejects a latitude past 90 and a radius under 10 metres', () => {
    expect(attendanceLocationInputSchema.safeParse(location).success).toBe(true);
    expect(attendanceLocationInputSchema.safeParse({ ...location, latitude: 91 }).success).toBe(false);
    expect(attendanceLocationInputSchema.safeParse({ ...location, radiusMeters: 5 }).success).toBe(false);
  });
});

describe('attendancePairInputSchema', () => {
  it('accepts an 8-digit code with a P-256 key and rejects 7 digits or another curve', () => {
    expect(attendancePairInputSchema.safeParse(pair).success).toBe(true);
    expect(attendancePairInputSchema.safeParse({ ...pair, pairingCode: '1234567' }).success).toBe(false);
    expect(attendancePairInputSchema.safeParse({ ...pair, publicKey: { ...pair.publicKey, crv: 'P-384' } }).success).toBe(false);
  });
});

describe('attendanceSettingsInputSchema', () => {
  it('keeps GPS accuracy between 5 and 500 metres', () => {
    const settings = { gpsMaxAccuracyMeters: 50, gpsMaxAgeSeconds: 60, retentionDays: 365, requestWindowDays: 30, pinMaxAttempts: 5, pinLockMinutes: 15, defaultRadiusMeters: 100 };
    expect(attendanceSettingsInputSchema.safeParse(settings).success).toBe(true);
    expect(attendanceSettingsInputSchema.safeParse({ ...settings, gpsMaxAccuracyMeters: 501 }).success).toBe(false);
  });
});
