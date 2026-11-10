import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signedPayload, verifyDeviceSignature } from './device-signature';

const keyPair = (namedCurve: string) => generateKeyPairSync('ec', { namedCurve });
const jwkOf = (pair: ReturnType<typeof keyPair>) => pair.publicKey.export({ format: 'jwk' }) as { kty: string; crv: string; x: string; y: string };
const signWith = (pair: ReturnType<typeof keyPair>, payload: string) => sign('sha256', Buffer.from(payload), { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');

describe('signedPayload', () => {
  it('joins method, path, timestamp, nonce and the body hash with new lines', () => {
    expect(signedPayload('post', '/api/kiosk/heartbeat', '2026-11-10T01:00:00.000Z', 'n-1', '')).toBe('POST\n/api/kiosk/heartbeat\n2026-11-10T01:00:00.000Z\nn-1\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('verifyDeviceSignature', () => {
  const pair = keyPair('prime256v1');
  const payload = signedPayload('POST', '/api/kiosk/heartbeat', '2026-11-10T01:00:00.000Z', 'nonce-1', '{"a":1}');
  it('accepts a P-256 signature over the payload', () => {
    expect(verifyDeviceSignature(jwkOf(pair), payload, signWith(pair, payload))).toBe(true);
  });
  it('refuses a changed body, another curve and garbage', () => {
    expect(verifyDeviceSignature(jwkOf(pair), signedPayload('POST', '/api/kiosk/heartbeat', '2026-11-10T01:00:00.000Z', 'nonce-1', '{"a":2}'), signWith(pair, payload))).toBe(false);
    const other = keyPair('secp384r1');
    expect(verifyDeviceSignature(jwkOf(other), payload, signWith(other, payload))).toBe(false);
    expect(verifyDeviceSignature(jwkOf(pair), payload, 'not-a-signature')).toBe(false);
    expect(verifyDeviceSignature({ kty: 'EC', crv: 'P-256', x: 'bad', y: 'bad' }, payload, signWith(pair, payload))).toBe(false);
  });
});
