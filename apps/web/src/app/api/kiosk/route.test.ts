// @vitest-environment node
import { generateKeyPairSync, sign } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signedPayload } from '@backoffice/core';

const mocks = vi.hoisted(() => ({ getSharedDatabase: vi.fn(), moduleModes: vi.fn(), pair: vi.fn(), authenticate: vi.fn(), identity: vi.fn() }));
vi.mock('../../../lib/database', () => ({ getSharedDatabase: mocks.getSharedDatabase }));
vi.mock('@backoffice/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@backoffice/core')>(),
  AdminQueries: class { moduleModes = mocks.moduleModes; },
  DeviceService: class { pair = mocks.pair; authenticate = mocks.authenticate; },
  DeviceQueries: class { identity = mocks.identity; }
}));

import { POST as PAIR } from './pair/route';
import { POST as HEARTBEAT } from './heartbeat/route';
import { resetPairLimiter } from './kiosk-route';

const uuid = '0b6f3c1e-5d1a-4c8e-9a51-2f7c1d9e8b10';
const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = keys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
const pairBody = { pairingCode: '12345678', publicKey: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } };
const pairRequest = (body: unknown = pairBody, ip = '10.0.0.5') => new Request('http://localhost/api/kiosk/pair', { method: 'POST', headers: { 'x-forwarded-for': ip }, body: JSON.stringify(body) });
const signedHeartbeat = (nonce = 'nonce-0123456789abcdef') => {
  const timestamp = new Date().toISOString();
  const signature = sign('sha256', Buffer.from(signedPayload('POST', '/api/kiosk/heartbeat', timestamp, nonce, '{}')), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return new Request('http://localhost/api/kiosk/heartbeat', { method: 'POST', headers: { 'x-device-id': uuid, 'x-timestamp': timestamp, 'x-nonce': nonce, 'x-signature': signature }, body: '{}' });
};

beforeEach(() => { mocks.getSharedDatabase.mockReturnValue({}); mocks.moduleModes.mockResolvedValue({ attendance: 'DEVELOPMENT' }); resetPairLimiter(); });
afterEach(() => vi.resetAllMocks());

describe('POST /api/kiosk/pair', () => {
  it('pairs with a good code and answers the same refusal for any bad one', async () => {
    mocks.pair.mockResolvedValueOnce({ ok: true, deviceId: uuid, deviceName: 'กล่อง OPD', locationName: 'ประตูหน้า' });
    const paired = await PAIR(pairRequest());
    expect(paired.status).toBe(200);
    await expect(paired.json()).resolves.toEqual({ ok: true, deviceId: uuid, deviceName: 'กล่อง OPD', locationName: 'ประตูหน้า' });
    const malformed = await PAIR(pairRequest({ pairingCode: '123' }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({ error: 'PAIRING_CODE_INVALID' });
  });
  it('slows down guessing to 10 tries a minute from one address', async () => {
    mocks.pair.mockResolvedValue({ ok: false, code: 'PAIRING_CODE_INVALID' });
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await PAIR(pairRequest())).status).toBe(400);
    expect((await PAIR(pairRequest())).status).toBe(429);
    expect((await PAIR(pairRequest(pairBody, '10.0.0.6'))).status).toBe(400);
  });
  it('counts the address the proxy saw, not one the caller wrote into x-forwarded-for', async () => {
    mocks.pair.mockResolvedValue({ ok: false, code: 'PAIRING_CODE_INVALID' });
    for (let attempt = 0; attempt < 10; attempt += 1) expect((await PAIR(pairRequest(pairBody, `203.0.113.${attempt}, 10.0.0.5`))).status).toBe(400);
    expect((await PAIR(pairRequest(pairBody, '203.0.113.99, 10.0.0.5'))).status).toBe(429);
  });
  it('stops all guessing for a minute after 30 wrong codes from any addresses', async () => {
    mocks.pair.mockResolvedValue({ ok: false, code: 'PAIRING_CODE_INVALID' });
    for (let attempt = 0; attempt < 30; attempt += 1) expect((await PAIR(pairRequest(pairBody, `10.0.1.${attempt}`))).status).toBe(400);
    expect((await PAIR(pairRequest(pairBody, '10.0.2.1'))).status).toBe(429);
  });
});

describe('POST /api/kiosk/heartbeat', () => {
  it('passes the signed headers and body to the device check and returns server time', async () => {
    mocks.authenticate.mockResolvedValueOnce({ ok: true, device: { id: uuid, locationId: 'loc' } });
    mocks.identity.mockResolvedValueOnce({ deviceName: 'กล่อง OPD', locationName: 'ประตูหน้า' });
    const response = await HEARTBEAT(signedHeartbeat());
    expect(response.status).toBe(200);
    const body = await response.json() as { serverTime: string; deviceName: string };
    expect(Date.parse(body.serverTime)).not.toBeNaN();
    expect(body.deviceName).toBe('กล่อง OPD');
    expect(mocks.authenticate).toHaveBeenCalledWith(expect.objectContaining({ deviceId: uuid, nonce: 'nonce-0123456789abcdef', method: 'POST', path: '/api/kiosk/heartbeat', body: '{}' }));
  });
  it('answers 401 with the reason for a replayed request', async () => {
    mocks.authenticate.mockResolvedValueOnce({ ok: false, code: 'REQUEST_REPLAYED' });
    const response = await HEARTBEAT(signedHeartbeat());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'REQUEST_REPLAYED' });
  });
  it('refuses every box call while the module is switched off', async () => {
    mocks.moduleModes.mockResolvedValue({ attendance: 'OFF' });
    const heartbeat = await HEARTBEAT(signedHeartbeat());
    expect(heartbeat.status).toBe(503);
    await expect(heartbeat.json()).resolves.toEqual({ error: 'MODULE_OFF' });
    expect((await PAIR(pairRequest())).status).toBe(503);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
});
