// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { verifyDeviceSignature } from '@backoffice/core';
import { kioskSignedHeaders, loadOrCreateKey, memoryKeyStorage } from './kiosk-key';

describe('kiosk key', () => {
  it('creates one non-extractable P-256 key, keeps it, and signs what the server checks', async () => {
    const storage = memoryKeyStorage();
    const first = await loadOrCreateKey(storage);
    const second = await loadOrCreateKey(storage);
    expect(second.publicJwk).toEqual(first.publicJwk);
    expect(first.publicJwk).toMatchObject({ kty: 'EC', crv: 'P-256' });
    const headers = await kioskSignedHeaders(first, 'device-1', 'POST', '/api/kiosk/heartbeat', '{}');
    expect(headers['x-nonce']).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    const { signedPayload } = await import('@backoffice/core');
    expect(verifyDeviceSignature(first.publicJwk, signedPayload('POST', '/api/kiosk/heartbeat', headers['x-timestamp'], headers['x-nonce'], '{}'), headers['x-signature'])).toBe(true);
  });
});
