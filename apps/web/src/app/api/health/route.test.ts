// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/health', () => {
  it('stays healthy and says setup is required while no database is configured', async () => {
    vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('DATABASE_URL_FILE', ''); vi.stubEnv('BACKOFFICE_CONFIG_DIR', '/nonexistent-backoffice-config');
    const response = GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'setup-required' });
  });

  it('answers ok once a database is configured', async () => {
    vi.stubEnv('DATABASE_URL', 'mysql://a');
    await expect(GET().json()).resolves.toEqual({ status: 'ok' });
  });
});
