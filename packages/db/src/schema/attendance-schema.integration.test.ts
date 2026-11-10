import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '../index';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('attendance foundation schema (migration 0033)', () => {
  const db = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const personId = randomUUID();
  const locationId = randomUUID();
  const deviceId = randomUUID();

  beforeAll(async () => {
    await runMigrations(db);
    await db.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [personId, 'ciphertext', randomUUID(), 'ทดสอบ']);
    await db.execute('INSERT INTO attendance_location (id, name, latitude, longitude, radius_meters, is_active, created_at, updated_at) VALUES (?, ?, 17.2, 103.1, 100, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [locationId, `จุดทดสอบ ${locationId.slice(0, 8)}`]);
    await db.execute('INSERT INTO attendance_device (id, name, location_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())', [deviceId, 'กล่องทดสอบ', locationId, personId]);
  });

  afterAll(async () => {
    await db.execute('DELETE FROM attendance_request_nonce WHERE device_id = ?', [deviceId]);
    await db.execute('DELETE FROM attendance_device WHERE id = ?', [deviceId]);
    await db.execute('DELETE FROM attendance_location WHERE id = ?', [locationId]);
    await db.execute('DELETE FROM person WHERE id = ?', [personId]);
    await db.close();
  });

  it('seeds five shift types with ราชการปกติ 08:30–16:30 and the default settings', async () => {
    const shifts = await db.query<{ name: string; startMinute: number; endMinute: number; earlyWindow: number; checkoutWindow: number }>("SELECT name, start_minute AS startMinute, end_minute AS endMinute, early_window_minutes AS earlyWindow, checkout_window_minutes AS checkoutWindow FROM attendance_shift_type WHERE id LIKE '00000000-0000-4000-b000-%' ORDER BY sort_order");
    expect(shifts.map((shift) => shift.name)).toEqual(['ราชการปกติ', 'เวรเช้า', 'เวรบ่าย', 'เวรดึก', 'เวรข้ามวัน']);
    expect(shifts[0]).toMatchObject({ startMinute: 510, endMinute: 990, earlyWindow: 60, checkoutWindow: 240 });
    expect(shifts[4]).toMatchObject({ startMinute: 1200, endMinute: 480 });
    const [accuracy] = await db.query<{ value: string }>("SELECT setting_value AS value FROM attendance_setting WHERE setting_key = 'gpsMaxAccuracyMeters'");
    expect(accuracy?.value).toBe('50');
  });

  it('starts the hash chain at sequence 0 and the module in โหมดพัฒนา', async () => {
    const [head] = await db.query<{ id: number; lastHash: string }>('SELECT id, last_hash AS lastHash FROM attendance_hash_chain_head');
    expect(head).toMatchObject({ id: 1 });
    expect(head?.lastHash).toMatch(/^[0-9a-f]{64}$/);
    const [mode] = await db.query<{ mode: string }>("SELECT mode FROM admin_module_setting WHERE module_code = 'attendance'");
    expect(mode?.mode).toBe('DEVELOPMENT');
  });

  it('refuses the same nonce twice for one box', async () => {
    await db.execute('INSERT INTO attendance_request_nonce (device_id, nonce, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [deviceId, 'nonce-0001-abcdef']);
    await expect(db.execute('INSERT INTO attendance_request_nonce (device_id, nonce, created_at) VALUES (?, ?, UTC_TIMESTAMP())', [deviceId, 'nonce-0001-abcdef'])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });

  it('changes nothing when migrations run again', async () => {
    expect(await runMigrations(db)).toEqual([]);
  });
});
