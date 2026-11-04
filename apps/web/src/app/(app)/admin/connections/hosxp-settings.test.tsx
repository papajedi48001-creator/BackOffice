import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HosxpSettings } from './hosxp-settings';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { vi.restoreAllMocks(); refresh.mockReset(); });
const view = { source: 'SETTINGS' as const, host: '192.168.1.254', port: 3306, database: 'hos', user: 'readonly', passwordSet: true, dateColumn: 'holiday_date', nameColumn: 'day_name', lastSyncAt: '2026-11-04T01:00:00Z', lastSyncStatus: 'OK', lastSyncCount: 21, canStorePassword: true };

it('shows the connection without the password and the last sync in Bangkok time', () => {
  render(<HosxpSettings view={view} />);
  expect(screen.getByText('192.168.1.254:3306')).toBeInTheDocument();
  expect(screen.getByText('ตั้งไว้แล้ว')).toBeInTheDocument();
  expect(screen.getByText('พุธ 4 พ.ย. 2569 08:00 · 21 รายการ')).toBeInTheDocument();
});

it('saves in a FormDialog, sending a blank password to keep the stored one', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  render(<HosxpSettings view={view} />);
  fireEvent.click(screen.getByRole('button', { name: 'แก้ไขการเชื่อมต่อ HOSxP' }));
  expect((screen.getByLabelText('รหัสผ่าน') as HTMLInputElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('ชื่อผู้ใช้'), { target: { value: 'ro2' } });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))).toEqual({ host: '192.168.1.254', port: 3306, database: 'hos', user: 'ro2', password: '', dateColumn: 'holiday_date', nameColumn: 'day_name' });
});

it('tests the connection and pulls holidays now, saying what happened in Thai', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, rows: 21 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'CONNECTION_FAILED' }), { status: 502 }));
  render(<HosxpSettings view={view} />);
  fireEvent.click(screen.getByRole('button', { name: 'ทดสอบการเชื่อมต่อ' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('เชื่อมต่อได้ พบวันหยุด 21 รายการ'));
  fireEvent.click(screen.getByRole('button', { name: 'ดึงวันหยุดตอนนี้' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('เชื่อมต่อ HOSxP ไม่ได้'));
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(['/api/admin/hosxp/test', '/api/admin/hosxp/sync']);
});
