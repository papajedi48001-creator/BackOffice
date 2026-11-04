import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ headers: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`REDIRECT ${path}`); }), readSession: vi.fn() }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../../lib/session', () => ({ readSession: mocks.readSession }));

import ChooseRolePage from './page';

afterEach(() => vi.clearAllMocks());

it('lists each held role and บุคลากรทั่วไป with Thai names', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'p1', roles: [], dataOwnerModules: [], roleChoices: ['admin', 'fleet-tester', 'leave-manager'], activeRole: null, roleSelectionRequired: true });
  render(await ChooseRolePage());
  expect(screen.getByRole('heading', { name: 'เลือกบทบาทที่จะใช้งาน' })).toBeInTheDocument();
  for (const name of ['ผู้ดูแลระบบ', 'ผู้ทดสอบยานพาหนะ', 'ผู้จัดการการลา', 'บุคลากรทั่วไป']) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
});

it('sends a person with one role or none to หน้าหลัก and anyone signed out to sign in', async () => {
  mocks.headers.mockResolvedValue(new Headers());
  mocks.readSession.mockResolvedValue({ authenticated: true, personId: 'p1', roles: [], dataOwnerModules: [], roleChoices: ['admin'], activeRole: 'admin' });
  await expect(ChooseRolePage()).rejects.toThrow('REDIRECT /dashboard');
  mocks.readSession.mockResolvedValue(null);
  await expect(ChooseRolePage()).rejects.toThrow('REDIRECT /');
});
