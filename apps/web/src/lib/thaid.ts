import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { ThaidClient, type ThaidSettings } from '@backoffice/core';
import { signInRoutes } from './sign-in-settings';

export const thaidFlowCookie = 'backoffice_thaid_flow';
export const thaidFlowPath = '/api/auth/thaid';
export const thaidCookieSeconds = 600;

/** `link`: confirm a pending Provider ID login with ThaID (รอผูกบัญชี); `sign_in`: the button on the sign-in page. */
export type ThaidPurpose = 'sign_in' | 'link';
export interface ThaidFlow { state: string; purpose: ThaidPurpose }

/** เข้าสู่ระบบด้วย ThaID: from ผู้ดูแลระบบ > การเข้าสู่ระบบ, else THAID_* in the server environment; null until ready. */
export async function thaidConfig(): Promise<ThaidSettings | null> {
  return (await signInRoutes()).thaid;
}

export const thaidClient = (settings: ThaidSettings): ThaidClient => new ThaidClient(settings);

const cookieKey = (secret: string) => createHash('sha256').update(`backoffice-thaid-flow:${secret}`).digest();

/** The state and purpose ride in an encrypted, ten-minute cookie so nothing about the flow is stored server side. */
export function sealThaidFlow(flow: ThaidFlow, secret: string, now: Date = new Date()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...flow, expiresAt: now.getTime() + thaidCookieSeconds * 1000 }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function openThaidFlow(value: string | undefined, secret: string, now: Date = new Date()): ThaidFlow | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as ThaidFlow & { expiresAt: number };
    if (typeof parsed.expiresAt !== 'number' || parsed.expiresAt < now.getTime()) return null;
    if (typeof parsed.state !== 'string' || !parsed.state || (parsed.purpose !== 'sign_in' && parsed.purpose !== 'link')) return null;
    return { state: parsed.state, purpose: parsed.purpose };
  } catch { return null; }
}

export function thaidCookieOptions(path: string) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path, maxAge: thaidCookieSeconds };
}
