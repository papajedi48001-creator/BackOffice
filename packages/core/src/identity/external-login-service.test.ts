import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AuditInput } from '@backoffice/contracts';
import { LocalAuthService, hashPassword } from './auth-service';
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

async function setup(options: { mustChangePassword?: boolean; active?: string[] } = {}) {
  const repository = new MemoryRepository();
  const audits: AuditInput[] = [];
  const account = { id: 'account-1', personId: 'person-1', username: 'somchai', passwordHash: await hashPassword('correct-password'), mustChangePassword: options.mustChangePassword };
  const localAuth = new LocalAuthService({ findByUsername: async (username) => username === 'somchai' ? account : null });
  const active = new Set(options.active ?? ['person-1', 'person-2']);
  let now = new Date('2026-11-09T06:00:00Z');
  const service = new ExternalLoginService({ repository, localAuth, isActivePerson: async (id) => active.has(id), audit: { recordAudit: async (input) => { audits.push(input); } }, issuer, now: () => now });
  return { repository, service, audits, advance: (ms: number) => { now = new Date(now.getTime() + ms); } };
}

const identity = { issuer, subject: 'member-1', displayName: 'สมชาย ใจดี' };
const credentials = { username: 'somchai', password: 'correct-password' };

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

  it('links with the password and returns mustChangePassword', async () => {
    const { repository, service } = await setup({ mustChangePassword: true });
    const { ticket } = await service.resolve(identity) as { ticket: string };
    await expect(service.linkWithPassword(ticket, credentials)).resolves.toEqual({ personId: 'person-1', mustChangePassword: true });
    expect(repository.links).toEqual([expect.objectContaining({ personId: 'person-1', subject: 'member-1', linkedByPersonId: null })]);
    expect(repository.audits).toContainEqual(expect.objectContaining({ action: 'identity.provider_link', actorPersonId: 'person-1', targetId: 'person-1', metadata: { method: 'self' } }));
  });

  it('refuses an expired ticket', async () => {
    const { service, advance } = await setup();
    const { ticket } = await service.resolve(identity) as { ticket: string };
    advance(10 * 60_000 + 1);
    await expect(service.linkWithPassword(ticket, credentials)).rejects.toThrow('TICKET_EXPIRED');
  });

  it('refuses a person already linked to another subject', async () => {
    const { repository, service } = await setup();
    await repository.link({ personId: 'person-1', issuer, subject: 'member-other', displayName: null, linkedByPersonId: null, audit: {} as AuditInput });
    const { ticket } = await service.resolve(identity) as { ticket: string };
    await expect(service.linkWithPassword(ticket, credentials)).rejects.toThrow('ALREADY_LINKED');
  });

  it('a wrong password does not link and keeps the ticket', async () => {
    const { repository, service } = await setup();
    const { ticket } = await service.resolve(identity) as { ticket: string };
    await expect(service.linkWithPassword(ticket, { username: 'somchai', password: 'wrong' })).rejects.toThrow('INVALID_CREDENTIALS');
    expect(repository.links).toEqual([]);
    await expect(service.linkWithPassword(ticket, credentials)).resolves.toMatchObject({ personId: 'person-1' });
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

  it('adminUnlink keeps the reason out of audit metadata', async () => {
    const { repository, service } = await setup();
    await repository.link({ personId: 'person-1', issuer, subject: 'member-1', displayName: null, linkedByPersonId: null, audit: {} as AuditInput });
    await expect(service.adminUnlink('admin-1', 'person-1', 'ผูกผิดคน')).resolves.toEqual({ ok: true });
    expect(repository.removals).toEqual([{ personId: 'person-1', reason: 'ผูกผิดคน' }]);
    expect(repository.audits.at(-1)).toEqual(expect.objectContaining({ action: 'identity.provider_unlink', actorPersonId: 'admin-1', targetId: 'person-1', metadata: {} }));
    await expect(service.adminUnlink('admin-1', 'person-1', 'อีกครั้ง')).resolves.toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
