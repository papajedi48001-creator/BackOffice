import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, runMigrations } from '@backoffice/db';
import { DatabaseExternalIdentityRepository } from './database-external-identity-repository';
import { DatabaseSessionRepository, DatabaseAccessSubjectLoader } from './database-identity-repository';
import { SessionService } from './session-service';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const issuer = 'https://portal.integration.test';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const audit = (actorPersonId: string | null, action: string, targetId: string) => ({ actorPersonId, action, targetType: 'person', targetId, result: 'SUCCESS' as const, metadata: { method: 'self' } });

describeWithDatabase('external identity repository against MariaDB', () => {
  const database = databaseUrl ? createDatabase(databaseUrl) : undefined as never;
  const repository = databaseUrl ? new DatabaseExternalIdentityRepository(database) : undefined as never;
  const personA = randomUUID();
  const personB = randomUUID();
  const subject = () => randomUUID();

  beforeAll(async () => {
    await runMigrations(database);
    for (const [id, name] of [[personA, 'ทดสอบ ผูกบัญชี'], [personB, 'ทดสอบ สอง']]) {
      await database.execute('INSERT INTO person (id, national_id_ciphertext, national_id_lookup, display_name, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())', [id, 'ciphertext', randomUUID(), name]);
    }
  });
  afterAll(async () => database.close());

  it('links once per subject and once per person for an issuer', async () => {
    const first = subject();
    await expect(repository.link({ personId: personA, issuer, subject: first, displayName: 'สมชาย', linkedByPersonId: null, audit: audit(personA, 'identity.provider_link', personA) })).resolves.toEqual({ ok: true });
    await expect(repository.findLink(issuer, first)).resolves.toMatchObject({ personId: personA, displayName: 'สมชาย', linkedByPersonId: null });
    await expect(repository.findLinkForPerson(personA, issuer)).resolves.toMatchObject({ subject: first });
    await expect(repository.link({ personId: personB, issuer, subject: first, displayName: null, linkedByPersonId: null, audit: audit(personB, 'identity.provider_link', personB) })).resolves.toEqual({ ok: false, code: 'ALREADY_LINKED' });
    await expect(repository.link({ personId: personA, issuer, subject: subject(), displayName: null, linkedByPersonId: null, audit: audit(personA, 'identity.provider_link', personA) })).resolves.toEqual({ ok: false, code: 'ALREADY_LINKED' });
    await repository.unlink({ personId: personA, issuer, actorPersonId: personB, reason: 'ทดสอบ', audit: audit(personB, 'identity.provider_unlink', personA) });
  });

  it('link removes the pending login and writes its audit in the same transaction', async () => {
    const pendingSubject = subject();
    const now = new Date();
    await repository.upsertPending({ issuer, subject: pendingSubject, displayName: 'รอผูก', ticketHash: hash('ticket-1'), expiresAt: new Date(now.getTime() + 600_000), now });
    const pending = await repository.findPendingByTicket(hash('ticket-1'), now);
    expect(pending).toMatchObject({ subject: pendingSubject, displayName: 'รอผูก' });
    // An audit row naming an unknown action column value cannot fail, so force the failure through the person foreign key.
    await expect(repository.link({ personId: randomUUID(), issuer, subject: pendingSubject, displayName: null, linkedByPersonId: null, audit: audit(null, 'identity.provider_link', personB) })).rejects.toThrow();
    await expect(repository.findPending(pending!.id)).resolves.not.toBeNull();
    await expect(repository.link({ personId: personB, issuer, subject: pendingSubject, displayName: 'รอผูก', linkedByPersonId: personA, audit: audit(personA, 'identity.provider_link', personB) })).resolves.toEqual({ ok: true });
    await expect(repository.findPending(pending!.id)).resolves.toBeNull();
    const rows = await database.query<{ total: number }>("SELECT COUNT(*) AS total FROM audit_event WHERE action = 'identity.provider_link' AND target_id = ?", [personB]);
    expect(Number(rows[0]!.total)).toBe(1);
    await repository.unlink({ personId: personB, issuer, actorPersonId: personA, reason: 'ทดสอบ', audit: audit(personA, 'identity.provider_unlink', personB) });
  });

  it('unlink revokes the person sessions, keeps the reason out of audit metadata and records it apart', async () => {
    const linked = subject();
    await repository.link({ personId: personA, issuer, subject: linked, displayName: null, linkedByPersonId: null, audit: audit(personA, 'identity.provider_link', personA) });
    const sessions = new SessionService(new DatabaseSessionRepository(database), new DatabaseAccessSubjectLoader(database));
    const { token } = await sessions.start(personA);
    await expect(repository.unlink({ personId: personA, issuer, actorPersonId: personB, reason: 'ผูกผิดคน', audit: { ...audit(personB, 'identity.provider_unlink', personA), metadata: {} } })).resolves.toEqual({ ok: true });
    await expect(sessions.resolve(token)).resolves.toBeNull();
    await expect(repository.findLink(issuer, linked)).resolves.toBeNull();
    const removal = await database.query<{ reason: string }>('SELECT reason FROM identity_link_removal WHERE person_id = ? AND subject = ?', [personA, linked]);
    expect(removal).toEqual([{ reason: 'ผูกผิดคน' }]);
    const metadata = await database.query<{ metadata: string }>("SELECT metadata FROM audit_event WHERE action = 'identity.provider_unlink' AND target_id = ? ORDER BY created_at DESC LIMIT 1", [personA]);
    expect(metadata[0]!.metadata).not.toContain('ผูกผิดคน');
    await expect(repository.unlink({ personId: personA, issuer, actorPersonId: personB, reason: 'ซ้ำ', audit: audit(personB, 'identity.provider_unlink', personA) })).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('pending ticket expires and upsert refreshes the ticket and last seen time', async () => {
    const pendingSubject = subject();
    const now = new Date();
    await repository.upsertPending({ issuer, subject: pendingSubject, displayName: 'เก่า', ticketHash: hash('old'), expiresAt: new Date(now.getTime() + 600_000), now });
    await expect(repository.findPendingByTicket(hash('old'), new Date(now.getTime() + 601_000))).resolves.toBeNull();
    await repository.upsertPending({ issuer, subject: pendingSubject, displayName: 'ใหม่', ticketHash: hash('new'), expiresAt: new Date(now.getTime() + 600_000), now });
    await expect(repository.findPendingByTicket(hash('old'), now)).resolves.toBeNull();
    await expect(repository.findPendingByTicket(hash('new'), now)).resolves.toMatchObject({ subject: pendingSubject, displayName: 'ใหม่' });
    expect((await repository.listPending()).filter((row) => row.subject === pendingSubject)).toHaveLength(1);
  });
});
