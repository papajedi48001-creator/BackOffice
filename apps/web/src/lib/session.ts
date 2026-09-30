import { createHmac, timingSafeEqual } from 'node:crypto';
import { accessSubjectSchema, type Session } from '@backoffice/contracts';
import { readRuntimeValue } from './runtime-env';

const cookieName = 'backoffice_session';

function sessionSecret(): string {
  const configuredSecret = readRuntimeValue('BACKOFFICE_SESSION_SECRET');
  if (configuredSecret) return configuredSecret;
  if (process.env.NODE_ENV === 'production') throw new Error('BACKOFFICE_SESSION_SECRET is required in production');
  return 'development-session-secret-change-before-deployment';
}

function signature(payload: string): string {
  return createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
}

export function createSessionToken(session: Session): string {
  const payload = Buffer.from(JSON.stringify(accessSubjectSchema.parse(session))).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function readSession(request: Request): Session | null {
  const token = request.headers.get('cookie')?.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token) return null;
  const [payload, receivedSignature] = token.split('.');
  if (!payload || !receivedSignature) return null;
  const expectedSignature = signature(payload);
  if (receivedSignature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(receivedSignature), Buffer.from(expectedSignature))) return null;
  try { return accessSubjectSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))); } catch { return null; }
}

export const sessionCookieName = cookieName;
