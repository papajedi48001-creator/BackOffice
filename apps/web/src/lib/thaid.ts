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

const cookieKey = (secret: string, use: string) => createHash('sha256').update(`backoffice-thaid-${use}:${secret}`).digest();

function seal(value: object, secret: string, use: string, seconds: number, now: Date): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(secret, use), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ ...value, expiresAt: now.getTime() + seconds * 1000 }), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

function open(value: string | undefined, secret: string, use: string, now: Date): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(secret, use), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const parsed = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as Record<string, unknown>;
    return typeof parsed.expiresAt === 'number' && parsed.expiresAt >= now.getTime() ? parsed : null;
  } catch { return null; }
}

/** The state and purpose ride in an encrypted, ten-minute cookie so nothing about the flow is stored server side. */
export function sealThaidFlow(flow: ThaidFlow, secret: string, now: Date = new Date()): string {
  return seal(flow, secret, 'flow', thaidCookieSeconds, now);
}

export function openThaidFlow(value: string | undefined, secret: string, now: Date = new Date()): ThaidFlow | null {
  const parsed = open(value, secret, 'flow', now);
  if (!parsed || typeof parsed.state !== 'string' || !parsed.state || (parsed.purpose !== 'sign_in' && parsed.purpose !== 'link')) return null;
  return { state: parsed.state, purpose: parsed.purpose };
}

export const thaidLinkCookie = 'backoffice_thaid_link';
export const thaidLinkSeconds = 300;
/** A ThaID-confirmed บุคลากร waiting for the person to confirm, on screen, which Provider ID account is linked to them. */
export interface ThaidLink { personId: string; ticketHash: string }

export const ticketHashOf = (ticket: string): string => createHash('sha256').update(ticket, 'utf8').digest('hex');

export function sealThaidLink(link: ThaidLink, secret: string, now: Date = new Date()): string {
  return seal(link, secret, 'link', thaidLinkSeconds, now);
}

export function openThaidLink(value: string | undefined, secret: string, now: Date = new Date()): ThaidLink | null {
  const parsed = open(value, secret, 'link', now);
  if (!parsed || typeof parsed.personId !== 'string' || typeof parsed.ticketHash !== 'string') return null;
  return { personId: parsed.personId, ticketHash: parsed.ticketHash };
}

export function thaidCookieOptions(path: string) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path, maxAge: thaidCookieSeconds };
}
