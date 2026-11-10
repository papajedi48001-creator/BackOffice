import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attendanceDefaultSettings } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import { insertPerson } from '../leave/leave-fixtures';
import { AttendanceSettingsQueries } from './attendance-settings-queries';
import { AttendanceSettingsService } from './attendance-settings-service';
import { ATTENDANCE_SEED } from './attendance-test-fixtures';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('AttendanceSettingsService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const service = new AttendanceSettingsService(database);
  const queries = new AttendanceSettingsQueries(database);
  const actor = randomUUID();
  const run = randomUUID().slice(0, 6);
  const shift = { startTime: '07:00', endTime: '19:00', earlyWindowMinutes: 30, lateGraceMinutes: 5, earlyLeaveGraceMinutes: 0, checkoutWindowMinutes: 240, colorHex: '#0f766e', isActive: true };
  const audits = (action: string, targetId: string) => database.query<{ id: string; metadata: string }>('SELECT id, metadata FROM audit_event WHERE action = ? AND target_id = ? AND actor_person_id = ?', [action, targetId, actor]);
  const chained = async (auditId: string) => (await database.query("SELECT seq FROM attendance_hash_chain WHERE record_type = 'audit_event' AND record_id = ?", [auditId])).length;

  beforeAll(async () => { await runMigrations(database); await insertPerson(database, actor); });
  afterAll(async () => { await database.close(); });

  it('reads the seeded overnight shifts with their length', async () => {
    const shifts = await queries.shiftTypes();
    expect(shifts.find((row) => row.id === ATTENDANCE_SEED.shiftTypes.overnight)).toMatchObject({ name: 'เวรข้ามวัน', startTime: '20:00', endTime: '08:00', overnight: true, durationMinutes: 720 });
    expect(shifts.find((row) => row.id === ATTENDANCE_SEED.shiftTypes.afternoon)).toMatchObject({ startTime: '16:00', endTime: '00:00', overnight: true, durationMinutes: 480 });
    expect(shifts.find((row) => row.id === ATTENDANCE_SEED.shiftTypes.office)).toMatchObject({ startTime: '08:30', endTime: '16:30', overnight: false, durationMinutes: 480 });
  });

  it('adds and renames a shift type, refuses a duplicate name or an unknown id, and audits into the chain', async () => {
    const added = await service.saveShiftType(actor, null, { ...shift, name: `เวรทดสอบ ${run}` });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(await service.saveShiftType(actor, added.id, { ...shift, name: `เวรใหม่ ${run}`, isActive: false })).toEqual({ ok: true, id: added.id });
    expect(await service.saveShiftType(actor, null, { ...shift, name: `เวรใหม่ ${run}` })).toEqual({ ok: false, code: 'DUPLICATE_NAME' });
    expect(await service.saveShiftType(actor, randomUUID(), { ...shift, name: `อื่น ${run}` })).toEqual({ ok: false, code: 'NOT_FOUND' });
    expect((await queries.shiftTypes()).find((row) => row.id === added.id)).toMatchObject({ name: `เวรใหม่ ${run}`, isActive: false, colorHex: '#0F766E', lateGraceMinutes: 5 });
    const rows = await audits('attendance.shift_type.save', added.id);
    expect(rows).toHaveLength(2);
    expect(await chained(rows[0]!.id)).toBe(1);
  });

  it('saves a location without putting its coordinates in the audit', async () => {
    const saved = await service.saveLocation(actor, null, { name: `จุด ${run}`, latitude: 17.123456, longitude: 103.654321, radiusMeters: 80, isActive: true });
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect((await queries.locations()).find((row) => row.id === saved.id)).toMatchObject({ latitude: 17.123456, longitude: 103.654321, radiusMeters: 80, isActive: true });
    const [row] = await audits('attendance.location.save', saved.id);
    expect(JSON.parse(row!.metadata)).toEqual({ locationId: saved.id, isActive: true });
    expect(await service.saveLocation(actor, null, { name: `จุด ${run}`, latitude: 1, longitude: 1, radiusMeters: 80, isActive: true })).toEqual({ ok: false, code: 'DUPLICATE_NAME' });
  });

  it('saves settings and reads them back', async () => {
    const original = await queries.settings();
    expect(Object.keys(original).sort()).toEqual(Object.keys(attendanceDefaultSettings).sort());
    try {
      expect(await service.saveSettings(actor, { ...original, gpsMaxAccuracyMeters: 40 })).toEqual({ ok: true });
      expect((await queries.settings()).gpsMaxAccuracyMeters).toBe(40);
      const [row] = await audits('attendance.settings.update', 'attendance_setting');
      expect(JSON.parse(row!.metadata)).toEqual({ settingKeys: ['gpsMaxAccuracyMeters'] });
    } finally {
      await service.saveSettings(actor, original);
    }
  });
});
