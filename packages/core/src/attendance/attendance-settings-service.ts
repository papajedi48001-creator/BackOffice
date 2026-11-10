import { randomUUID } from 'node:crypto';
import { attendanceLocationInputSchema, attendanceSettingsInputSchema, attendanceShiftTypeInputSchema, type AttendanceLocationInput, type AttendanceSettings, type AttendanceShiftTypeInput } from '@backoffice/contracts';
import type { Database } from '@backoffice/db';
import { attendanceAudit, attendanceTransaction } from './attendance-chain';
import { isDuplicateEntry } from './attendance-db';
import { AttendanceSettingsQueries, timeToMinute } from './attendance-settings-queries';

export type AttendanceSaveResult = { ok: true; id: string } | { ok: false; code: 'NOT_FOUND' | 'DUPLICATE_NAME' };
type Table = 'attendance_shift_type' | 'attendance_location';

/** ตั้งค่าระบบลงเวลา. Rows are switched off, never deleted. Callers check `canManageAttendance` first. */
export class AttendanceSettingsService {
  constructor(private readonly database: Database, private readonly createId: () => string = randomUUID) {}

  /** Writes only the keys whose value changed; the audit lists those keys, never the values. */
  async saveSettings(actor: string, input: AttendanceSettings): Promise<{ ok: true }> {
    const settings = attendanceSettingsInputSchema.parse(input);
    return attendanceTransaction(this.database, async (tx) => {
      const current = await new AttendanceSettingsQueries(tx).settings();
      const changed = (Object.keys(settings) as (keyof AttendanceSettings)[]).filter((key) => settings[key] !== current[key]);
      for (const key of changed) {
        await tx.execute('INSERT INTO attendance_setting (setting_key, setting_value, updated_by, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)', [key, String(settings[key]), actor]);
      }
      if (changed.length > 0) await attendanceAudit(tx, actor, 'attendance.settings.update', 'attendance_setting', 'attendance_setting', { settingKeys: changed });
      return { ok: true as const };
    });
  }

  saveShiftType(actor: string, id: string | null, input: AttendanceShiftTypeInput): Promise<AttendanceSaveResult> {
    const shift = attendanceShiftTypeInputSchema.parse(input);
    return this.save(actor, 'attendance.shift_type.save', 'attendance_shift_type', id, {
      name: shift.name, start_minute: timeToMinute(shift.startTime), end_minute: timeToMinute(shift.endTime), early_window_minutes: shift.earlyWindowMinutes,
      late_grace_minutes: shift.lateGraceMinutes, early_leave_grace_minutes: shift.earlyLeaveGraceMinutes, checkout_window_minutes: shift.checkoutWindowMinutes,
      color_hex: shift.colorHex.toUpperCase(), is_active: shift.isActive ? 1 : 0
    }, (rowId) => ({ shiftTypeId: rowId }));
  }

  /** Coordinates stay out of the audit (location data is kept only where it is needed). */
  saveLocation(actor: string, id: string | null, input: AttendanceLocationInput): Promise<AttendanceSaveResult> {
    const location = attendanceLocationInputSchema.parse(input);
    return this.save(actor, 'attendance.location.save', 'attendance_location', id, { name: location.name, latitude: location.latitude, longitude: location.longitude, radius_meters: location.radiusMeters, is_active: location.isActive ? 1 : 0 }, (rowId) => ({ locationId: rowId }));
  }

  private async save(actor: string, action: string, table: Table, id: string | null, values: Record<string, string | number>, ids: (rowId: string) => Record<string, string>): Promise<AttendanceSaveResult> {
    const columns = Object.keys(values);
    try {
      return await attendanceTransaction(this.database, async (tx) => {
        let rowId = id;
        if (rowId) {
          const [existing] = await tx.query<{ id: string }>(`SELECT id FROM ${table} WHERE id = ? FOR UPDATE`, [rowId]);
          if (!existing) return { ok: false as const, code: 'NOT_FOUND' as const };
          await tx.execute(`UPDATE ${table} SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [...Object.values(values), rowId]);
        } else {
          rowId = this.createId();
          const extra = table === 'attendance_shift_type' ? { sort_order: Number((await tx.query<{ next: number }>('SELECT COALESCE(MAX(sort_order), 0) + 10 AS next FROM attendance_shift_type'))[0]?.next ?? 10) } : {};
          const all = { ...values, ...extra };
          await tx.execute(`INSERT INTO ${table} (id, ${Object.keys(all).join(', ')}, created_at, updated_at) VALUES (?, ${Object.keys(all).map(() => '?').join(', ')}, UTC_TIMESTAMP(), UTC_TIMESTAMP())`, [rowId, ...Object.values(all)]);
        }
        await attendanceAudit(tx, actor, action, table, rowId, { ...ids(rowId), isActive: values.is_active === 1 });
        return { ok: true as const, id: rowId };
      });
    } catch (error) {
      if (isDuplicateEntry(error)) return { ok: false, code: 'DUPLICATE_NAME' };
      throw error;
    }
  }
}
