import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AccessSubject } from '@backoffice/contracts';
import { createDatabase, runMigrations } from '@backoffice/db';
import type { HosxpConnection } from '../holidays/hosxp-settings-service';
import { PttypeMappingService } from './pttype-mapping-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const connection = { host: 'h', port: 3306, database: 'hos', user: 'u', password: 'p', dateColumn: 'd', nameColumn: 'n' } satisfies HosxpConnection;

describeWithDatabase('PttypeMappingService against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const pttype = `T${randomUUID().slice(0, 6)}`;
  let manager: string;
  const snapshot = { rights: [{ code: pttype, name: 'ทดสอบ', opd: null, ipd: { code: 'P2', name: 'IP', modifiedAt: null } }], opdAccounts: [], ipdAccounts: [] };
  const write = vi.fn().mockResolvedValue({ ok: true, from: { opd: null, ipd: 'P2' } });
  const service = () => new PttypeMappingService(database, async () => connection, { read: vi.fn().mockResolvedValue(snapshot), write });

  beforeAll(async () => {
    await runMigrations(database);
    manager = randomUUID();
    await database.execute("INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, employment_status, created_at) VALUES (?, 'ciphertext', ?, ?, 'ACTIVE', UTC_TIMESTAMP())", [manager, randomUUID(), 'ผู้จัดการ Mapping']);
  });
  afterAll(async () => { await database.close(); });

  it('audits the changed side only, then shows the editor and the history row', async () => {
    const subject: AccessSubject & { personId: string } = { authenticated: true, personId: manager, roles: [{ name: 'pttype-mapping-manager', organizationId: null }], dataOwnerModules: [], hospitalWideDataOwnerModules: [] };
    expect(await service().save(subject, pttype, { opd: 'P1', ipd: 'P2', expected: { opd: null, ipd: 'P2' } })).toEqual({ ok: true });
    const [audit] = await database.query<{ metadata: string; actor_person_id: string; target_type: string }>("SELECT metadata, actor_person_id, target_type FROM audit_event WHERE action = 'pttype_mapping.update' AND target_id = ?", [pttype]);
    expect(audit!.actor_person_id).toBe(manager);
    expect(audit!.target_type).toBe('pttype');
    expect(JSON.parse(audit!.metadata)).toEqual({ pttype, opd: { from: null, to: 'P1' } });

    const loaded = await service().load();
    expect(loaded.ok && loaded.editors[pttype]).toMatchObject({ name: 'ผู้จัดการ Mapping' });
    expect(loaded.ok && loaded.editors[pttype]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);

    const row = (await service().history()).find((entry) => entry.pttype === pttype);
    expect(row).toMatchObject({ actorName: 'ผู้จัดการ Mapping', pttype, opd: { from: null, to: 'P1' }, ipd: null });
  });

  it('audits a CSV export with its row count', async () => {
    await service().recordExport(manager, 7);
    const rows = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'pttype_mapping.export' AND actor_person_id = ?", [manager]);
    expect(JSON.parse(rows[0]!.metadata)).toEqual({ exportKind: 'pttype-mapping', rows: 7 });
  });
});
