import { createHmac, timingSafeEqual } from 'node:crypto';

/** LINE signs each webhook body with the channel secret: base64(HMAC-SHA256(secret, raw body)), compared in constant time. */
export function verifyLineSignature(channelSecret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', channelSecret).update(rawBody).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
