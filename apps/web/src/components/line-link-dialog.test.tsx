import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LineLinkDialog } from './line-link-dialog';

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
afterEach(() => { vi.unstubAllGlobals(); });

describe('LineLinkDialog', () => {
  it('makes a code and shows it with the steps and the add-friend link', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(200, { linked: false, linkedAt: null, configured: true }))
      .mockResolvedValueOnce(reply(200, { code: 'ABCD2345', expiresAt: '2026-11-03T04:00:00.000Z', addFriendUrl: 'https://line.me/R/ti/p/%40123abcd' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LineLinkDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'เชื่อมต่อ LINE' }));
    const dialog = await screen.findByRole('dialog', { name: 'เชื่อมต่อ LINE' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'สร้างรหัสเชื่อมต่อ' }));
    expect(await within(dialog).findByText('ABCD-2345')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'เพิ่มบอทของโรงพยาบาลเป็นเพื่อน' })).toHaveAttribute('href', 'https://line.me/R/ti/p/%40123abcd');
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/line/link-code');
    expect((fetchMock.mock.calls[1]![1] as RequestInit).method).toBe('POST');
  });

  it('shows a linked account and removes it only after confirming', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(200, { linked: true, linkedAt: '2026-11-03T03:00:00.000Z', configured: true }))
      .mockResolvedValueOnce(reply(200, { ok: true, removed: true }))
      .mockResolvedValueOnce(reply(200, { linked: false, linkedAt: null, configured: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LineLinkDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'เชื่อมต่อ LINE' }));
    expect(await screen.findByText(/เชื่อมต่อแล้ว/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกการเชื่อมต่อ' }));
    const confirm = await screen.findByRole('dialog', { name: 'ยกเลิกการเชื่อมต่อ LINE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(within(confirm).getByRole('button', { name: 'ยกเลิกการเชื่อมต่อ' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/line/link', { method: 'DELETE' }));
    expect(await screen.findByRole('button', { name: 'สร้างรหัสเชื่อมต่อ' })).toBeInTheDocument();
  });

  it('says LINE is not set up yet instead of offering a code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(200, { linked: false, linkedAt: null, configured: false })));
    render(<LineLinkDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'เชื่อมต่อ LINE' }));
    expect(await screen.findByText('ผู้ดูแลระบบยังไม่ได้ตั้งค่า LINE')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'สร้างรหัสเชื่อมต่อ' })).toBeNull();
  });
});
