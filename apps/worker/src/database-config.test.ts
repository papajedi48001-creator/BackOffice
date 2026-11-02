import { describe, expect, it } from 'vitest';
import { waitForDatabaseUrl } from './database-config.ts';

describe('waitForDatabaseUrl', () => {
  it('logs once and checks again every 10 seconds until the setup page saves a URL', async () => {
    const answers = [undefined, undefined, 'mysql://ready'];
    const sleeps: number[] = []; const lines: string[] = [];
    const url = await waitForDatabaseUrl({ read: () => answers.shift(), sleep: async (ms) => { sleeps.push(ms); }, log: (line) => { lines.push(line); } });
    expect(url).toBe('mysql://ready');
    expect(sleeps).toEqual([10000, 10000]);
    expect(lines).toEqual(['backoffice.worker.waiting_for_database_config']);
  });

  it('returns at once when a URL is already set', async () => {
    const lines: string[] = [];
    expect(await waitForDatabaseUrl({ read: () => 'mysql://a', log: (line) => { lines.push(line); } })).toBe('mysql://a');
    expect(lines).toEqual([]);
  });
});
