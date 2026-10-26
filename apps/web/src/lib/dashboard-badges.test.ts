import type { Database } from '@backoffice/db';
import { describe, expect, it } from 'vitest';
import { collectBadges, collectSectionBadges } from './dashboard-badges';
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

it('hides a badge that throws before returning a promise', async () => {
  const base = moduleRegistry[0]!;
  const modules: ModuleEntry[] = [
    { ...base, code: 'a', badge: async () => 2 },
    { ...base, code: 'sync', badge: (() => { throw new Error('boom'); }) as unknown as ModuleEntry['badge'] }
  ];
  await expect(collectBadges(modules, {} as Database, { authenticated: true, personId: 'p', roles: [], dataOwnerModules: [] })).resolves.toEqual({ a: 2, sync: undefined });
});

it('gives up on a badge that does not answer in time', async () => {
  const base = moduleRegistry[0]!;
  const modules: ModuleEntry[] = [{ ...base, code: 'slow', badge: () => new Promise<number>(() => {}) }];
  await expect(collectBadges(modules, {} as Database, { authenticated: true, personId: 'p', roles: [], dataOwnerModules: [] }, 20)).resolves.toEqual({ slow: undefined });
});

describe('collectSectionBadges', () => {
  const subject = { authenticated: true as const, personId: 'p', roles: [], dataOwnerModules: [] };
  it('counts each section that has a badge, leaving out one that fails', async () => {
    const sections = [
      { href: '/leave/mine', labelKey: 'leaveMine' as const, visible: () => true },
      { href: '/leave/approvals', labelKey: 'leaveApprovals' as const, visible: () => true, badge: async () => 3 },
      { href: '/leave/all', labelKey: 'leaveAll' as const, visible: () => true, badge: async () => { throw new Error('down'); } }
    ];
    await expect(collectSectionBadges(sections, {} as Database, subject)).resolves.toEqual({ '/leave/approvals': 3, '/leave/all': undefined });
  });
});
