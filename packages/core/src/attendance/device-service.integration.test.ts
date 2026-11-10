import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { insertPerson } from '../leave/leave-fixtures';
import { AttendanceSettingsService } from './attendance-settings-service';
import { DeviceQueries } from './device-queries';
import { DeviceService } from './device-service';
import { signedPayload } from './device-signature';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('DeviceService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  let clock = new Date();
  const service = new DeviceService(database, undefined, () => clock);
  const actor = randomUUID();
  let locationId = '';
  const newKey = () => { const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }); const jwk = pair.publicKey.export({ format: 'jwk' }) as { x: string; y: string }; return { pair, publicKey: { kty: 'EC' as const, crv: 'P-256' as const, x: jwk.x, y: jwk.y } }; };
  const request = (deviceId: string, key: ReturnType<typeof newKey>, overrides: { nonce?: string; timestamp?: string; body?: string } = {}) => {
    const timestamp = overrides.timestamp ?? clock.toISOString();
    const nonce = overrides.nonce ?? randomUUID();
    const body = overrides.body ?? '';
    const signature = sign('sha256', Buffer.from(signedPayload('POST', '/api/kiosk/heartbeat', timestamp, nonce, body)), { key: key.pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return { deviceId, timestamp, nonce, signature, method: 'POST', path: '/api/kiosk/heartbeat', body };
  };
  const lastSeen = async (deviceId: string) => (await database.query<{ lastSeenAt: Date | null }>('SELECT last_seen_at AS lastSeenAt FROM attendance_device WHERE id = ?', [deviceId]))[0]?.lastSeenAt ?? null;

  beforeAll(async () => {
    await runMigrations(database);
    await insertPerson(database, actor);
    const saved = await new AttendanceSettingsService(database).saveLocation(actor, null, { name: `จุดกล่อง ${actor.slice(0, 8)}`, latitude: 17.2, longitude: 103.1, radiusMeters: 100, isActive: true });
    if (!saved.ok) throw new Error('location');
    locationId = saved.id;
  });
  afterAll(async () => { await database.close(); });
  const fresh = () => { clock = new Date(); };

  it('pairs a box once and accepts its signed requests', async () => {
    fresh();
    const created = await service.create(actor, { name: 'กล่องหน้า OPD', locationId });
    if (!created.ok) throw new Error('create');
    expect(created.pairingCode).toMatch(/^\d{8}$/);
    const key = newKey();
    expect(await service.pair({ pairingCode: created.pairingCode, publicKey: key.publicKey })).toMatchObject({ ok: true, deviceId: created.id, deviceName: 'กล่องหน้า OPD' });
    expect(await service.pair({ pairingCode: created.pairingCode, publicKey: newKey().publicKey })).toEqual({ ok: false, code: 'PAIRING_CODE_INVALID' });
    const first = request(created.id, key);
    expect(await service.authenticate(first)).toEqual({ ok: true, device: { id: created.id, locationId } });
    expect(await service.authenticate(first)).toEqual({ ok: false, code: 'REQUEST_REPLAYED' });
    expect(await service.authenticate(request(created.id, key, { timestamp: new Date(clock.getTime() - 61_000).toISOString() }))).toEqual({ ok: false, code: 'DEVICE_SIGNATURE_INVALID' });
    expect(await service.authenticate({ ...request(created.id, key), body: '{"changed":true}' })).toEqual({ ok: false, code: 'DEVICE_SIGNATURE_INVALID' });
    expect(await service.authenticate(request(randomUUID(), key))).toEqual({ ok: false, code: 'DEVICE_SIGNATURE_INVALID' });
    expect((await new DeviceQueries(database).list()).find((device) => device.id === created.id)).toMatchObject({ paired: true, revoked: false, online: true, locationId });
    expect(await new DeviceQueries(database).identity(created.id)).toMatchObject({ deviceName: 'กล่องหน้า OPD' });
    expect(await new DeviceQueries(database).identity(randomUUID())).toBeNull();
    const audits = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE target_id = ? AND action LIKE 'attendance.device.%'", [created.id]);
    expect(audits.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(audits)).not.toContain(created.pairingCode);
    expect(JSON.stringify(audits)).not.toContain(key.publicKey.x);
  });

  it('refuses a pairing code after ten minutes', async () => {
    fresh();
    const created = await service.create(actor, { name: 'กล่องช้า', locationId });
    if (!created.ok) throw new Error('create');
    clock = new Date(clock.getTime() + 10 * 60_000 + 1_000);
    expect(await service.pair({ pairingCode: created.pairingCode, publicKey: newKey().publicKey })).toEqual({ ok: false, code: 'PAIRING_CODE_INVALID' });
  });

  it('stops a revoked box and keeps its last contact time', async () => {
    fresh();
    const created = await service.create(actor, { name: 'กล่องถอน', locationId });
    if (!created.ok) throw new Error('create');
    const key = newKey();
    await service.pair({ pairingCode: created.pairingCode, publicKey: key.publicKey });
    await service.authenticate(request(created.id, key));
    const seen = await lastSeen(created.id);
    expect(await service.revoke(actor, created.id)).toEqual({ ok: true });
    expect(await service.authenticate(request(created.id, key))).toEqual({ ok: false, code: 'DEVICE_REVOKED' });
    expect(await lastSeen(created.id)).toEqual(seen);
    expect(await service.newPairingCode(actor, created.id)).toEqual({ ok: false, code: 'DEVICE_REVOKED' });
    expect(await service.revoke(actor, randomUUID())).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('re-pairs a replaced box with a new code and forgets the old key', async () => {
    fresh();
    const created = await service.create(actor, { name: 'กล่องเปลี่ยนเครื่อง', locationId });
    if (!created.ok) throw new Error('create');
    const oldKey = newKey();
    await service.pair({ pairingCode: created.pairingCode, publicKey: oldKey.publicKey });
    const again = await service.newPairingCode(actor, created.id);
    if (!again.ok) throw new Error('code');
    const newer = newKey();
    expect(await service.pair({ pairingCode: again.pairingCode, publicKey: newer.publicKey })).toMatchObject({ ok: true });
    expect(await service.authenticate(request(created.id, oldKey))).toEqual({ ok: false, code: 'DEVICE_SIGNATURE_INVALID' });
    expect(await service.authenticate(request(created.id, newer))).toMatchObject({ ok: true });
  });

  it('refuses a box at an unknown location', async () => {
    expect(await service.create(actor, { name: 'กล่องหลงทาง', locationId: randomUUID() })).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
