import { connect } from 'node:net';

export type ConnectionKey = 'database' | 'redis' | 'storage' | 'scanner' | 'mail';
/** One row of ตั้งค่าการเชื่อมต่อ. Never carries a value from the environment: only which variables it needs and whether it answered. */
export interface ConnectionCheck { key: ConnectionKey; configured: boolean; status: 'ok' | 'failed' | 'not_checked'; variables: readonly string[] }
export interface ConnectionProbes { database(): Promise<void>; tcp(host: string, port: number): Promise<void> }

const services: ReadonlyArray<{ key: ConnectionKey; variables: readonly string[]; target(env: (name: string) => string | undefined): { host: string; port: number } | null | 'database' }> = [
  { key: 'database', variables: ['DATABASE_URL'], target: () => 'database' },
  { key: 'redis', variables: ['REDIS_URL'], target: (env) => hostPort(env('REDIS_URL'), 6379) },
  { key: 'storage', variables: ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'], target: (env) => hostPort(env('S3_ENDPOINT'), 443) },
  { key: 'scanner', variables: ['CLAMD_HOST', 'CLAMD_PORT'], target: (env) => env('CLAMD_HOST') ? { host: env('CLAMD_HOST')!, port: Number(env('CLAMD_PORT') ?? 3310) } : null },
  // No mail sender exists yet; the row shows that the settings are not there rather than hiding the gap.
  { key: 'mail', variables: ['SMTP_HOST', 'SMTP_PORT'], target: (env) => env('SMTP_HOST') ? { host: env('SMTP_HOST')!, port: Number(env('SMTP_PORT') ?? 587) } : null }
];

function hostPort(url: string | undefined, fallbackPort: number): { host: string; port: number } | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, port: Number(parsed.port || (parsed.protocol === 'http:' ? 80 : fallbackPort)) };
  } catch { return null; }
}

/** Checks each configured connection once; the optional variable (CLAMD_PORT) does not count towards "configured". */
export async function checkConnections(env: (name: string) => string | undefined, probes: ConnectionProbes): Promise<ConnectionCheck[]> {
  return Promise.all(services.map(async ({ key, variables, target }) => {
    const required = variables.filter((name) => name !== 'CLAMD_PORT' && name !== 'SMTP_PORT');
    const configured = required.every((name) => Boolean(env(name)));
    const where = configured ? target(env) : null;
    if (!where) return { key, variables, configured, status: 'not_checked' as const };
    try {
      await (where === 'database' ? probes.database() : probes.tcp(where.host, where.port));
      return { key, variables, configured, status: 'ok' as const };
    } catch {
      return { key, variables, configured, status: 'failed' as const };
    }
  }));
}

/** Opens and closes a TCP connection within `timeoutMs`; sends nothing, so no credential is ever used. */
export function tcpProbe(host: string, port: number, timeoutMs = 1500): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port });
    const done = (error?: Error) => { socket.destroy(); if (error) reject(error); else resolve(); };
    socket.setTimeout(timeoutMs, () => done(new Error('TIMEOUT')));
    socket.once('connect', () => done());
    socket.once('error', (error) => done(error));
  });
}
