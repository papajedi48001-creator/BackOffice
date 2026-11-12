import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AuditInput } from '@backoffice/contracts';
import { ExternalLoginService, type ExternalIdentityLink, type ExternalIdentityRepository, type PendingExternalLogin } from './external-login-service';

const issuer = 'https://portal.test';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

class MemoryRepository implements ExternalIdentityRepository {
  links: ExternalIdentityLink[] = [];
  pending: Array<PendingExternalLogin & { ticketHash: string; expiresAt: Date }> = [];
  audits: AuditInput[] = [];
  removals: Array<{ personId: string; reason: string }> = [];
  async findLink(i: string, s: string) { return this.links.find((l) => l.issuer === i && l.subject === s) ?? null; }
  async findLinkForPerson(p: string, i: string) { return this.links.find((l) => l.personId === p && l.issuer === i) ?? null; }
  async upsertPending(input: { issuer: string; subject: string; displayName: string | null; ticketHash: string; expiresAt: Date; now: Date }) {
    const existing = this.pending.find((row) => row.issuer === input.issuer && row.subject === input.subject);
    if (existing) Object.assign(existing, { displayName: input.displayName, ticketHash: input.ticketHash, expiresAt: input.expiresAt, lastSeenAt: input.now });
    else this.pending.push({ id: `pending-${this.pending.length + 1}`, issuer: input.issuer, subject: input.subject, displayName: input.displayName, ticketHash: input.ticketHash, expiresAt: input.expiresAt, lastSeenAt: input.now });
  }
  async findPendingByTicket(hash: string, now: Date) { return this.pending.find((row) => row.ticketHash === hash && row.expiresAt > now) ?? null; }
  async findPending(id: string) { return this.pending.find((row) => row.id === id) ?? null; }
  async listPending() { return this.pending; }
  async listLinks() { return this.links.map((link) => ({ ...link, personName: null })); }
  async link(input: { personId: string; issuer: string; subject: string; displayName: string | null; linkedByPersonId: string | null; audit: AuditInput }) {
    if (this.links.some((l) => l.issuer === input.issuer && (l.subject === input.subject || l.personId === input.personId))) return { ok: false as const, code: 'ALREADY_LINKED' as const };
    this.links.push({ id: `link-${this.links.length + 1}`, personId: input.personId, issuer: input.issuer, subject: input.subject, displayName: input.displayName, linkedByPersonId: input.linkedByPersonId, linkedAt: new Date() });
    this.pending = this.pending.filter((row) => !(row.issuer === input.issuer && row.subject === input.subject));
    this.audits.push(input.audit);
    return { ok: true as const };
  }
  async unlink(input: { personId: string; issuer: string; actorPersonId: string; reason: string; audit: AuditInput }) {
    const before = this.links.length;
    this.links = this.links.filter((l) => !(l.personId === input.personId && l.issuer === input.issuer));
    if (before === this.links.length) return { ok: false as const, code: 'NOT_FOUND' as const };
    this.removals.push({ personId: input.personId, reason: input.reason });
    this.audits.push(input.audit);
    return { ok: true as const };
  }
}

async function setup(options: { active?: string[]; matches?: Record<string, string> } = {}) {
  const repository = new MemoryRepository();
  const audits: AuditInput[] = [];
  const active = new Set(options.active ?? ['person-1', 'person-2']);
  let now = new Date('2026-11-09T06:00:00Z');
  const matches = options.matches;
  const findPersonByNationalIdHash = matches ? async (hash: string) => matches[hash] ?? null : undefined;
  const service = new ExternalLoginService({ repository, isActivePerson: async (id) => active.has(id), audit: { recordAudit: async (input) => { audits.push(input); } }, issuer, now: () => now, findPersonByNationalIdHash });
  return { repository, service, audits, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

const identity = { issuer, subject: 'member-1', displayName: 'สมชาย ใจดี' };

describe('ExternalLoginService', () => {
  it('resolves a linked active person and audits the login', async () => {
    const { repository, service, audits } = await setup();
    await repository.link({ personId: 'person-1', issuer, subject: 'member-1', displayName: null, linkedByPersonId: null, audit: {} as AuditInput });
    await expect(service.resolve(identity)).resolves.toEqual({ kind: 'linked', personId: 'person-1' });
    expect(audits).toContainEqual(expect.objectContaining({ action: 'identity.provider_login', result: 'SUCCESS', actorPersonId: 'person-1', metadata: {} }));
  });

  it('refuses a linked person who is not active', async () => {
    const { repository, service, audits } = await setup({ active: [] });
    await repository.link({ personId: 'person-1', issuer, subject: 'member-1', displayName: null, linkedByPersonId: null, audit: {} as AuditInput });
    await expect(service.resolve(identity)).resolves.toEqual({ kind: 'inactive' });
    expect(audits).toContainEqual(expect.objectContaining({ action: 'identity.provider_login', result: 'FAILURE', metadata: { stage: 'inactive' } }));
  });

  it('gives an unlinked login a ticket and a pending row holding only its hash', async () => {
    const { repository, service } = await setup();
    const result = await service.resolve(identity);
    expect(result.kind).toBe('unlinked');
    const ticket = (result as { ticket: string }).ticket;
    expect(ticket.length).toBeGreaterThanOrEqual(43);
    expect(repository.pending).toEqual([expect.objectContaining({ subject: 'member-1', displayName: 'สมชาย ใจดี', ticketHash: sha(ticket) })]);
  });

  it('shows the Provider ID name for a live ticket so the person can see whose account they are linking', async () => {
    const { service, advance } = await setup();
    const { ticket } = await service.resolve(identity) as { ticket: string };
    await expect(service.pendingLogin(ticket)).resolves.toEqual({ displayName: 'สมชาย ใจดี' });
    await expect(service.pendingLogin('')).resolves.toBeNull();
    await expect(service.pendingLogin('not-a-ticket')).resolves.toBeNull();
    advance(10 * 60_000 + 1);
    await expect(service.pendingLogin(ticket)).resolves.toBeNull();
  });

  it('adminLink links a pending login and audits the admin', async () => {
    const { repository, service } = await setup();
    await service.resolve(identity);
    await expect(service.adminLink('admin-1', 'pending-1', 'person-2')).resolves.toEqual({ ok: true });
    expect(repository.links).toEqual([expect.objectContaining({ personId: 'person-2', linkedByPersonId: 'admin-1', displayName: 'สมชาย ใจดี' })]);
    expect(repository.audits).toContainEqual(expect.objectContaining({ action: 'identity.provider_link', actorPersonId: 'admin-1', targetId: 'person-2', metadata: { method: 'admin' } }));
  });

  it('adminLink refuses a person linked elsewhere, an unknown pending row and an inactive person', async () => {
    const { repository, service } = await setup({ active: ['person-1'] });
    await repository.link({ personId: 'person-1', issuer, subject: 'member-other', displayName: null, linkedByPersonId: null, audit: {} as AuditInput });
    await service.resolve(identity);
    await expect(service.adminLink('admin-1', 'pending-1', 'person-1')).resolves.toEqual({ ok: false, code: 'ALREADY_LINKED' });
    await expect(service.adminLink('admin-1', 'pending-9', 'person-1')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    await expect(service.adminLink('admin-1', 'pending-1', 'person-2')).resolves.toEqual({ ok: false, code: 'PERSON_NOT_ACTIVE' });
  });

  it('linkPendingToPerson links the pending Provider ID login behind a live ticket to the person ThaID confirmed', async () => {
    const { repository, service } = await setup();
    const result = await service.resolve(identity);
    const ticket = (result as { ticket: string }).ticket;
    await expect(service.linkPendingToPerson(ticket, 'person-1')).resolves.toEqual({ ok: true });
    expect(repository.links).toEqual([expect.objectContaining({ personId: 'person-1', subject: identity.subject, linkedByPersonId: null })]);
    expect(repository.audits).toContainEqual(expect.objectContaining({ action: 'identity.provider_link', actorPersonId: 'person-1', targetId: 'person-1', metadata: { method: 'thaid' } }));
    await expect(service.resolve(identity)).resolves.toEqual({ kind: 'linked', personId: 'person-1' });
  });

  it('linkPendingToPerson refuses an unknown ticket, an inactive person and a person linked to another account', async () => {
    const { repository, service } = await setup({ active: ['person-1'] });
    const ticket = ((await service.resolve(identity)) as { ticket: string }).ticket;
    await expect(service.linkPendingToPerson('no-such-ticket', 'person-1')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
    await expect(service.linkPendingToPerson(ticket, 'person-2')).resolves.toEqual({ ok: false, code: 'PERSON_NOT_ACTIVE' });
    await repository.link({ personId: 'person-1', issuer, subject: 'member-other', displayName: null, linkedByPersonId: null, audit: {} as AuditInput });
    await expect(service.linkPendingToPerson(ticket, 'person-1')).resolves.toEqual({ ok: false, code: 'ALREADY_LINKED' });
  });

  it('adminUnlink keeps the reason out of audit metadata', async () => {
    const { repository, service } = await setup();
    await repository.link({ personId: 'person-1', issuer, subject: 'member-1', displayName: null, linkedByPersonId: null, audit: {} as AuditInput });
    await expect(service.adminUnlink('admin-1', 'person-1', 'ผูกผิดคน')).resolves.toEqual({ ok: true });
    expect(repository.removals).toEqual([{ personId: 'person-1', reason: 'ผูกผิดคน' }]);
    expect(repository.audits.at(-1)).toEqual(expect.objectContaining({ action: 'identity.provider_unlink', actorPersonId: 'admin-1', targetId: 'person-1', metadata: {} }));
    await expect(service.adminUnlink('admin-1', 'person-1', 'อีกครั้ง')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('ExternalLoginService national-ID matching', () => {
  const hashCid = 'c'.repeat(64);

  it('links a first login to the one person whose national ID matches and signs straight in', async () => {
    const { repository, service, audits } = await setup({ matches: { [hashCid]: 'person-2' } });
    await expect(service.resolve(identity, { hashCid })).resolves.toEqual({ kind: 'linked', personId: 'person-2' });
    expect(repository.links).toEqual([expect.objectContaining({ personId: 'person-2', subject: 'member-1', linkedByPersonId: null })]);
    expect(repository.audits).toContainEqual(expect.objectContaining({ action: 'identity.provider_link', targetId: 'person-2', metadata: { method: 'national_id' } }));
    expect(audits).toContainEqual(expect.objectContaining({ action: 'identity.provider_login', result: 'SUCCESS', actorPersonId: 'person-2' }));
    expect(JSON.stringify([repository.audits, audits, repository.pending])).not.toContain(hashCid);
  });

  it('sends the login to the admin list when nobody matches, the hash is missing or the matcher is off', async () => {
    for (const [options, hash] of [[{ matches: {} }, hashCid], [{ matches: { [hashCid]: 'person-2' } }, null], [{}, hashCid]] as const) {
      const { repository, service } = await setup(options);
      expect((await service.resolve(identity, { hashCid: hash })).kind).toBe('unlinked');
      expect(repository.links).toEqual([]);
    }
  });

  it('does not take a matched person who is inactive or already linked to another Provider ID account', async () => {
    const inactive = await setup({ matches: { [hashCid]: 'person-2' }, active: ['person-1'] });
    expect((await inactive.service.resolve(identity, { hashCid })).kind).toBe('unlinked');
    const taken = await setup({ matches: { [hashCid]: 'person-2' } });
    await taken.repository.link({ personId: 'person-2', issuer, subject: 'member-other', displayName: null, linkedByPersonId: null, audit: {} as AuditInput });
    expect((await taken.service.resolve(identity, { hashCid })).kind).toBe('unlinked');
    expect(taken.repository.links).toHaveLength(1);
  });
});
