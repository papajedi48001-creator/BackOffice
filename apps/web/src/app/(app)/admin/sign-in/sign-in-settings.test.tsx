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
  password: { mode: 'AUTO' as const, updatedAt: '2026-11-16T08:20:00.000Z', updatedByName: 'admin01' },
  canStoreSecrets: true
};
const closedByProvider = { open: false, reason: 'AUTO_ROUTE_READY' as const };

it('shows each route with its status and source, and never a secret', () => {
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} passwordState={closedByProvider} />);
  const thaid = screen.getByRole('region', { name: 'ThaID' });
  expect(within(thaid).getByText('ยังตั้งค่าไม่ครบ')).toBeInTheDocument();
  const provider = screen.getByRole('region', { name: 'Provider ID' });
  expect(within(provider).getByText('พร้อมใช้งาน')).toBeInTheDocument();
  expect(within(provider).getByText('ค่าของเซิร์ฟเวอร์')).toBeInTheDocument();
  expect(within(provider).getAllByText('ตั้งไว้แล้ว')).toHaveLength(2);
});

it('edits ThaID in a FormDialog: secret box empty, redirect URI suggested, blank secret kept', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} passwordState={closedByProvider} />);
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
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} passwordState={closedByProvider} />);
  fireEvent.click(screen.getByRole('button', { name: 'ปิด Provider ID' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'ปิดการเข้าสู่ระบบช่องทางนี้' }));
  expect(await within(dialog).findByText('ปิดไม่ได้ เพราะเป็นช่องทางเข้าสู่ระบบสุดท้ายที่ใช้งานได้ ตั้งค่า ThaID ให้พร้อมก่อน')).toBeInTheDocument();
});

it('warns when secrets cannot be stored on this server', () => {
  render(<SignInSettings view={{ ...view, canStoreSecrets: false }} defaultThaidRedirectUri={thaidRedirect} passwordState={closedByProvider} />);
  expect(screen.getByText(/CONNECTION_SECRET_KEY/)).toBeInTheDocument();
});

it('says when saved secrets cannot be opened and must be typed again', () => {
  render(<SignInSettings view={{ ...view, thaid: { ...view.thaid, source: 'SETTINGS', secretsUnreadable: true } }} defaultThaidRedirectUri={thaidRedirect} passwordState={closedByProvider} />);
  expect(within(screen.getByRole('region', { name: 'ThaID' })).getByRole('alert')).toHaveTextContent('เปิด Secret ที่บันทึกไว้ไม่ได้ (CONNECTION_SECRET_KEY ไม่มีหรือถูกเปลี่ยน) กรุณาใส่ Secret ใหม่');
});

it('shows the password card first with อัตโนมัติ · เปิด · ปิด, why it is closed now, and who changed it when', () => {
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} passwordState={closedByProvider} />);
  const regions = screen.getAllByRole('region');
  expect(regions[0]).toHaveAccessibleName('ชื่อผู้ใช้และรหัสผ่าน');
  const card = regions[0]!;
  const group = within(card).getByRole('group', { name: 'การเข้าด้วยชื่อผู้ใช้และรหัสผ่าน' });
  expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['อัตโนมัติ', 'เปิด', 'ปิด']);
  expect(within(group).getByRole('button', { name: 'อัตโนมัติ' })).toHaveAttribute('aria-pressed', 'true');
  expect(card).toHaveTextContent('ปิดอยู่');
  expect(card).toHaveTextContent('เพราะ ThaID หรือ Provider ID พร้อมใช้งาน');
  expect(card).toHaveTextContent('16 พ.ย. 2569 15:20 · admin01');
});

it('says when PASSWORD_SIGN_IN=on on the server keeps it open', () => {
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} passwordState={{ open: true, reason: 'OVERRIDE' }} />);
  expect(screen.getByRole('region', { name: 'ชื่อผู้ใช้และรหัสผ่าน' })).toHaveTextContent('เพราะตั้ง PASSWORD_SIGN_IN=on ไว้บนเซิร์ฟเวอร์');
});

it('changing the mode asks in an ActionDialog with from → to, then saves it', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} passwordState={closedByProvider} />);
  fireEvent.click(screen.getByRole('button', { name: 'เปิด' }));
  const dialog = screen.getByRole('dialog');
  expect(dialog).toHaveTextContent('อัตโนมัติ → เปิด');
  fireEvent.click(within(dialog).getByRole('button', { name: 'ยืนยัน' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/sign-in-settings/password');
  expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ mode: 'ON' }) });
  await waitFor(() => expect(refresh).toHaveBeenCalled());
});

it('says ปิด needs ThaID or Provider ID ready when the server refuses it', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'LAST_SIGN_IN_ROUTE' }), { status: 409 }));
  render(<SignInSettings view={view} defaultThaidRedirectUri={thaidRedirect} passwordState={closedByProvider} />);
  fireEvent.click(within(screen.getByRole('group', { name: 'การเข้าด้วยชื่อผู้ใช้และรหัสผ่าน' })).getByRole('button', { name: 'ปิด' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'ยืนยัน' }));
  expect(await within(dialog).findByText('ปิดไม่ได้ ต้องมี ThaID หรือ Provider ID ที่พร้อมใช้งานก่อน มิฉะนั้นจะไม่มีใครเข้าสู่ระบบได้')).toBeInTheDocument();
});
