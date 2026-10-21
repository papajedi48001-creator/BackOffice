import type { Database } from '@backoffice/db';
import { expect, it } from 'vitest';
import { collectBadges } from './dashboard-badges';
import { moduleRegistry, type ModuleEntry } from './modules';

it('keeps badges that load and drops the ones that fail', async () => {
  const base = moduleRegistry[0]!;
  const modules: ModuleEntry[] = [
    { ...base, code: 'a', badge: async () => 4 },
    { ...base, code: 'b', badge: async () => { throw new Error('boom'); } },
    { ...base, code: 'c' }
  ];
  await expect(collectBadges(modules, {} as Database, { authenticated: true, personId: 'p', roles: [], dataOwnerModules: [] })).resolves.toEqual({ a: 4, b: undefined });
});
