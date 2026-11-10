import { createHash, createPublicKey, verify } from 'node:crypto';

/** What a กล่องลงเวลา signs: `METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256HEX(body)`. */
export function signedPayload(method: string, path: string, timestamp: string, nonce: string, body: string): string {
  return [method.toUpperCase(), path, timestamp, nonce, createHash('sha256').update(body).digest('hex')].join('\n');
}

/** ECDSA P-256 / SHA-256 in WebCrypto's raw (IEEE P1363) form, base64url. Any key or signature that does not parse is a refusal. */
export function verifyDeviceSignature(publicKeyJwk: { kty: string; crv: string; x: string; y: string }, payload: string, signatureBase64Url: string): boolean {
  if (publicKeyJwk.kty !== 'EC' || publicKeyJwk.crv !== 'P-256') return false;
  try {
    const key = createPublicKey({ key: { kty: publicKeyJwk.kty, crv: publicKeyJwk.crv, x: publicKeyJwk.x, y: publicKeyJwk.y }, format: 'jwk' });
    const signature = Buffer.from(signatureBase64Url, 'base64url');
    if (signature.length !== 64) return false;
    return verify('sha256', Buffer.from(payload), { key, dsaEncoding: 'ieee-p1363' }, signature);
  } catch {
    return false;
  }
}
