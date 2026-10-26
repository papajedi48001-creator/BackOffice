import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScanField } from './scan-field';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
afterEach(() => { fetchMock.mockReset(); });

const respond = (status: number, body: unknown) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
const scan = (value: string) => {
  const input = screen.getByLabelText('สแกนหรือพิมพ์รหัส แล้วกด Enter');
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: 'Enter' });
  return input as HTMLInputElement;
};

describe('ScanField', () => {
  it('looks up the trimmed code, hands back the result and clears for the next scan', async () => {
    const onResult = vi.fn();
    respond(200, { kind: 'barcode', unitKind: 'PURCHASE', item: { id: 'item-1' } });
    render(<ScanField onResult={onResult} />);

    const input = scan('  8851234567890 ');

    await waitFor(() => expect(onResult).toHaveBeenCalledWith({ kind: 'barcode', unitKind: 'PURCHASE', item: { id: 'item-1' } }));
    expect(fetchMock).toHaveBeenCalledWith('/api/inventory/scan?code=8851234567890', expect.anything());
    expect(input.value).toBe('');
  });

  it('ignores an empty scan', () => {
    render(<ScanField onResult={vi.fn()} />);
    scan('   ');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says when a code is unknown and passes it on', async () => {
    const onNotFound = vi.fn();
    respond(404, { error: 'CODE_NOT_FOUND' });
    render(<ScanField onResult={vi.fn()} onNotFound={onNotFound} />);

    scan('X1');

    expect(await screen.findByText('ไม่พบรหัสนี้ในระบบ')).toBeInTheDocument();
    expect(onNotFound).toHaveBeenCalledWith('X1');
  });

  it('explains when the camera cannot be used', async () => {
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
    render(<ScanField onResult={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'สแกนด้วยกล้อง' }));

    expect(await screen.findByText('เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้อง หรือพิมพ์รหัสแทน')).toBeInTheDocument();
    Object.defineProperty(navigator, 'mediaDevices', { value: original, configurable: true });
  });
});
