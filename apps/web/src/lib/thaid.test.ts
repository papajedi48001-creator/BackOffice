import { describe, expect, it } from 'vitest';
import { openThaidFlow, openThaidLink, sealThaidFlow, sealThaidLink } from './thaid';

const secret = 'thaid-client-secret';
const now = new Date('2026-11-12T10:00:00Z');

describe('ThaID flow cookie', () => {
  it('round-trips the state and the purpose, and hides them', () => {
    const sealed = sealThaidFlow({ state: 'state-1', purpose: 'link' }, secret, now);
    expect(sealed).not.toContain('state-1');
    expect(openThaidFlow(sealed, secret, now)).toEqual({ state: 'state-1', purpose: 'link' });
    expect(openThaidFlow(sealThaidFlow({ state: 's', purpose: 'sign_in' }, secret, now), secret, now)).toEqual({ state: 's', purpose: 'sign_in' });
  });

  it('refuses a cookie sealed under another secret, ten minutes old, tampered, or with an unknown purpose', () => {
    const sealed = sealThaidFlow({ state: 'state-1', purpose: 'sign_in' }, secret, now);
    expect(openThaidFlow(sealed, 'other-secret', now)).toBeNull();
    expect(openThaidFlow(sealed, secret, new Date(now.getTime() + 601_000))).toBeNull();
    expect(openThaidFlow(`${sealed.slice(0, -2)}xx`, secret, now)).toBeNull();
    expect(openThaidFlow(undefined, secret, now)).toBeNull();
    expect(openThaidFlow(sealThaidFlow({ state: 's', purpose: 'admin' as 'link' }, secret, now), secret, now)).toBeNull();
  });
});

describe('ThaID link cookie', () => {
  it('round-trips for five minutes and cannot be read as a flow cookie', () => {
    const sealed = sealThaidLink({ personId: 'person-1', ticketHash: 'a'.repeat(64) }, secret, now);
    expect(openThaidLink(sealed, secret, now)).toEqual({ personId: 'person-1', ticketHash: 'a'.repeat(64) });
    expect(openThaidLink(sealed, secret, new Date(now.getTime() + 301_000))).toBeNull();
    expect(openThaidFlow(sealed, secret, now)).toBeNull();
  });
});
