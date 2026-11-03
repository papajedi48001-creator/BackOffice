import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateLinkCode, hashLinkCode, LINK_CODE_ALPHABET, normalizeLinkCode } from './link-code';
import { verifyLineSignature } from './line-signature';

describe('รหัสเชื่อมต่อ LINE', () => {
  it('is eight characters from an alphabet without look-alikes', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateLinkCode();
      expect(code).toHaveLength(8);
      expect([...code].every((char) => LINK_CODE_ALPHABET.includes(char))).toBe(true);
    }
    expect(LINK_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it('reads a code typed with a dash, spaces or lowercase, and nothing else', () => {
    expect(normalizeLinkCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeLinkCode('ABCD 2345')).toBe('ABCD2345');
    expect(normalizeLinkCode('hello')).toBeNull();
    expect(normalizeLinkCode('ABCD23450')).toBeNull();
    expect(normalizeLinkCode('ABCD234O')).toBeNull();
  });

  it('keeps only a sha256 of the code', () => {
    expect(hashLinkCode('ABCD2345')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkCode('ABCD2345')).not.toBe(hashLinkCode('ABCD2346'));
  });
});

describe('verifyLineSignature', () => {
  const body = '{"events":[]}';
  const signature = createHmac('sha256', 'secret').update(body).digest('base64');
  it('accepts the HMAC-SHA256 of the raw body under the channel secret', () => {
    expect(verifyLineSignature('secret', body, signature)).toBe(true);
  });
  it('refuses a wrong, missing or malformed signature', () => {
    expect(verifyLineSignature('other', body, signature)).toBe(false);
    expect(verifyLineSignature('secret', `${body} `, signature)).toBe(false);
    expect(verifyLineSignature('secret', body, null)).toBe(false);
    expect(verifyLineSignature('secret', body, 'abc')).toBe(false);
  });
});
