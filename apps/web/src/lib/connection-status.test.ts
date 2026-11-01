import { describe, expect, it, vi } from 'vitest';
import { checkConnections } from './connection-status';

const env: Record<string, string> = {
  DATABASE_URL: 'mysql://backoffice:db-secret-value@db:3306/backoffice',
  REDIS_URL: 'redis://:redis-secret-value@cache:6379',
  S3_ENDPOINT: 'http://minio:9000', S3_BUCKET: 'files', S3_ACCESS_KEY_ID: 'key-id-value', S3_SECRET_ACCESS_KEY: 's3-secret-value',
  CLAMD_HOST: 'clamav'
};

describe('checkConnections', () => {
  it('reports configured and reachable services without any value from the environment', async () => {
    const tcp = vi.fn(async (host: string) => { if (host === 'clamav') throw new Error('ECONNREFUSED'); });
    const rows = await checkConnections((name) => env[name], { database: async () => undefined, tcp });
    expect(rows.map((row) => [row.key, row.configured, row.status])).toEqual([
      ['database', true, 'ok'], ['redis', true, 'ok'], ['storage', true, 'ok'], ['scanner', true, 'failed'], ['mail', false, 'not_checked']
    ]);
    expect(tcp).toHaveBeenCalledWith('cache', 6379);
    expect(tcp).toHaveBeenCalledWith('minio', 9000);
    expect(tcp).toHaveBeenCalledWith('clamav', 3310);
    const shown = JSON.stringify(rows);
    for (const secret of ['db-secret-value', 'redis-secret-value', 's3-secret-value', 'key-id-value', 'minio', 'cache']) expect(shown).not.toContain(secret);
  });

  it('does not probe what is not configured and marks a failing database', async () => {
    const tcp = vi.fn();
    const rows = await checkConnections((name) => (name === 'DATABASE_URL' ? env[name] : undefined), { database: async () => { throw new Error('down'); }, tcp });
    expect(rows.find((row) => row.key === 'database')?.status).toBe('failed');
    expect(rows.filter((row) => row.key !== 'database').every((row) => !row.configured && row.status === 'not_checked')).toBe(true);
    expect(tcp).not.toHaveBeenCalled();
  });
});
