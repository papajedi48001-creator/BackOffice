import { createHash, randomInt } from 'node:crypto';

/** No 0/O or 1/I, so a code read off a phone screen is typed right the first time. */
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH = 8;
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const codePattern = new RegExp(`^[${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}}$`);

/** A fresh รหัสเชื่อมต่อ LINE from a cryptographic source. */
export function generateLinkCode(): string {
  return Array.from({ length: LINK_CODE_LENGTH }, () => LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)]).join('');
}

/** The code inside a chat message, ignoring spaces, dashes and case; null when the message is not a code. */
export function normalizeLinkCode(text: string): string | null {
  const candidate = text.replace(/[\s-]/g, '').toUpperCase();
  return codePattern.test(candidate) ? candidate : null;
}

export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
