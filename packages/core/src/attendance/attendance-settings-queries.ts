import { attendanceDefaultSettings, type AttendanceSettings } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';

export interface AttendanceShiftTypeRow {
  id: string; name: string; startTime: string; endTime: string; overnight: boolean; durationMinutes: number;
  earlyWindowMinutes: number; lateGraceMinutes: number; earlyLeaveGraceMinutes: number; checkoutWindowMinutes: number;
  colorHex: string; isActive: boolean; sortOrder: number;
}
export interface AttendanceLocationRow { id: string; name: string; latitude: number; longitude: number; radiusMeters: number; isActive: boolean }

const MINUTES_PER_DAY = 1440;
export const minuteToTime = (minute: number): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
export const timeToMinute = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/** A shift whose end is at or before its start ends the next day. */
export const shiftDurationMinutes = (startMinute: number, endMinute: number): number => (endMinute - startMinute + MINUTES_PER_DAY) % MINUTES_PER_DAY || MINUTES_PER_DAY;

export class AttendanceSettingsQueries {
  constructor(private readonly database: Pick<Database, 'query'>) {}

  /** ค่าตั้ง; a key missing from the table reads as its default. */
  async settings(): Promise<AttendanceSettings> {
    const rows = await this.database.query<{ settingKey: string; settingValue: string }>('SELECT setting_key AS settingKey, setting_value AS settingValue FROM attendance_setting');
    const stored = new Map(rows.map((row) => [row.settingKey, Number(row.settingValue)]));
    return Object.fromEntries(Object.entries(attendanceDefaultSettings).map(([key, fallback]) => { const value = stored.get(key); return [key, value !== undefined && Number.isFinite(value) ? value : fallback]; })) as AttendanceSettings;
  }

  async shiftTypes(): Promise<AttendanceShiftTypeRow[]> {
    const rows = await this.database.query<{ id: string; name: string; startMinute: number; endMinute: number; earlyWindowMinutes: number; lateGraceMinutes: number; earlyLeaveGraceMinutes: number; checkoutWindowMinutes: number; colorHex: string; isActive: number; sortOrder: number }>(
      'SELECT id, name, start_minute AS startMinute, end_minute AS endMinute, early_window_minutes AS earlyWindowMinutes, late_grace_minutes AS lateGraceMinutes, early_leave_grace_minutes AS earlyLeaveGraceMinutes, checkout_window_minutes AS checkoutWindowMinutes, color_hex AS colorHex, is_active AS isActive, sort_order AS sortOrder FROM attendance_shift_type ORDER BY sort_order, name'
    );
    return rows.map((row) => ({
      id: row.id, name: row.name, startTime: minuteToTime(Number(row.startMinute)), endTime: minuteToTime(Number(row.endMinute)),
      overnight: Number(row.endMinute) <= Number(row.startMinute), durationMinutes: shiftDurationMinutes(Number(row.startMinute), Number(row.endMinute)),
      earlyWindowMinutes: Number(row.earlyWindowMinutes), lateGraceMinutes: Number(row.lateGraceMinutes), earlyLeaveGraceMinutes: Number(row.earlyLeaveGraceMinutes), checkoutWindowMinutes: Number(row.checkoutWindowMinutes),
      colorHex: row.colorHex, isActive: Number(row.isActive) === 1, sortOrder: Number(row.sortOrder)
    }));
  }

  async locations(): Promise<AttendanceLocationRow[]> {
    const rows = await this.database.query<{ id: string; name: string; latitude: string; longitude: string; radiusMeters: number; isActive: number }>('SELECT id, name, latitude, longitude, radius_meters AS radiusMeters, is_active AS isActive FROM attendance_location ORDER BY name');
    return rows.map((row) => ({ id: row.id, name: row.name, latitude: Number(row.latitude), longitude: Number(row.longitude), radiusMeters: Number(row.radiusMeters), isActive: Number(row.isActive) === 1 }));
  }
}
