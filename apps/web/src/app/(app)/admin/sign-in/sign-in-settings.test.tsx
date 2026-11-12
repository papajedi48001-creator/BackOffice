import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SignInSettings } from './sign-in-settings';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { vi.restoreAllMocks(); refresh.mockReset(); });

const thaidRedirect = 'https://office-waritch-hosp.moph.go.th/api/auth/thaid/callback';
const view = {
  thaid: { enabled: true, ready: false, source: 'NONE' as const, values: { clientId: '', redirectUri: '' }, secretsSet: { clientSecret: false }, secretsUnreadable: false },
  providerId: { enabled: true, ready: true, source: 'ENV' as const, values: { environment: 'prd', healthClientId: 'health-1', providerClientId: 'provider-1', redirectUri: 'https://office-waritch-hosp.moph.go.th/api/auth/provider/callback' }, secretsSet: { healthClientSecret: true, providerSecretKey: true }, secretsUnreadable: false },
  canStoreSecrets: true
};

it('shows each route with its status and source, and never a secret', () => {
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} />);
  const thaid = screen.getByRole('region', { name: 'ThaID' });
  expect(within(thaid).getByText('ยังตั้งค่าไม่ครบ')).toBeInTheDocument();
  const provider = screen.getByRole('region', { name: 'Provider ID' });
  expect(within(provider).getByText('พร้อมใช้งาน')).toBeInTheDocument();
  expect(within(provider).getByText('ค่าของเซิร์ฟเวอร์')).toBeInTheDocument();
  expect(within(provider).getAllByText('ตั้งไว้แล้ว')).toHaveLength(2);
});

it('edits ThaID in a FormDialog: secret box empty, redirect URI suggested, blank secret kept', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} />);
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไข ThaID' }));
  const dialog = screen.getByRole('dialog');
  const secret = within(dialog).getByLabelText('Client Secret') as HTMLInputElement;
  expect(secret.type).toBe('password');
  expect(secret.value).toBe('');
  expect((within(dialog).getByLabelText('Redirect URI') as HTMLInputElement).value).toBe(thaidRedirect);
  fireEvent.change(within(dialog).getByLabelText('Client ID'), { target: { value: 'thaid-client' } });
  fireEvent.change(secret, { target: { value: 'thaid-secret' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'บันทึก' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/sign-in-settings');
  expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ method: 'THAID', enabled: true, values: { clientId: 'thaid-client', redirectUri: thaidRedirect }, secrets: { clientSecret: 'thaid-secret' } });
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

it('switching a route off asks in an ActionDialog and says when it is the last way in', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'LAST_SIGN_IN_ROUTE' }), { status: 409 }));
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} />);
  fireEvent.click(screen.getByRole('button', { name: 'ปิด Provider ID' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'ปิดการเข้าสู่ระบบช่องทางนี้' }));
  expect(await within(dialog).findByText('ปิดไม่ได้ เพราะเป็นช่องทางเข้าสู่ระบบสุดท้ายที่ใช้งานได้ ตั้งค่า ThaID ให้พร้อมก่อน')).toBeInTheDocument();
});

it('warns when secrets cannot be stored on this server', () => {
  render(<SignInSettings view={{ ...view, canStoreSecrets: false }} defaultThaidRedirectUri={thaidRedirect} />);
  expect(screen.getByText(/CONNECTION_SECRET_KEY/)).toBeInTheDocument();
});

it('says when saved secrets cannot be opened and must be typed again', () => {
  render(<SignInSettings view={{ ...view, thaid: { ...view.thaid, source: 'SETTINGS', secretsUnreadable: true } }} defaultThaidRedirectUri={thaidRedirect} />);
  expect(within(screen.getByRole('region', { name: 'ThaID' })).getByRole('alert')).toHaveTextContent('เปิด Secret ที่บันทึกไว้ไม่ได้ (CONNECTION_SECRET_KEY ไม่มีหรือถูกเปลี่ยน) กรุณาใส่ Secret ใหม่');
});
