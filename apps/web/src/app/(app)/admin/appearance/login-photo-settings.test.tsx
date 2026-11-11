import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginPhotoSettings } from './login-photo-settings';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const photo = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'hospital.jpg', { type: 'image/jpeg' });

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('LoginPhotoSettings', () => {
  it('shows the current photo, or says none is set', () => {
    const { rerender } = render(<LoginPhotoSettings version="abcdef0123456789" />);
    expect(screen.getByRole('img', { name: 'รูปโรงพยาบาลบนหน้าเข้าสู่ระบบ' })).toHaveAttribute('src', '/api/site/login-photo?v=abcdef0123456789');
    rerender(<LoginPhotoSettings version={null} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/ยังไม่มีรูป/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ลบรูป' })).toBeNull();
  });

  it('uploads the chosen file as form field "file" and refreshes the page', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true, version: '1111111111111111' }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginPhotoSettings version={null} />);
    fireEvent.change(screen.getByLabelText(/เลือกรูป/), { target: { files: [photo()] } });
    fireEvent.click(screen.getByRole('button', { name: 'อัปโหลดรูป' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/admin/site-image');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('explains a refused upload in Thai', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'TOO_LARGE' }, 413)));
    render(<LoginPhotoSettings version={null} />);
    fireEvent.change(screen.getByLabelText(/เลือกรูป/), { target: { files: [photo()] } });
    fireEvent.click(screen.getByRole('button', { name: 'อัปโหลดรูป' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ใหญ่เกิน 3 MB');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('removes the photo after confirming in a dialog', async () => {
    const fetchMock = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    render(<LoginPhotoSettings version="abcdef0123456789" />);
    fireEvent.click(screen.getByRole('button', { name: 'ลบรูป' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ลบรูป' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/site-image', { method: 'DELETE' });
  });
});
