import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttachmentField } from './attachment-field';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const pdf = () => new File(['%PDF-1.7'], 'ใบรับรองแพทย์.pdf', { type: 'application/pdf' });

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe('AttachmentField', () => {
  it('uploads the chosen file and reports its id', async () => {
    const fetchMock = vi.fn(async () => json({ attachmentId: 'att-1', filename: 'ใบรับรองแพทย์.pdf', contentType: 'application/pdf', sizeBytes: 8 }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    render(<AttachmentField id="leave-file" label="ไฟล์แนบ" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('ไฟล์แนบ'), { target: { files: [pdf()] } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ attachmentId: 'att-1', filename: 'ใบรับรองแพทย์.pdf' }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/attachments');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('shows the attached file with a link and lets the person remove it', () => {
    const onChange = vi.fn();
    render(<AttachmentField id="leave-file" label="ไฟล์แนบ" value={{ attachmentId: 'att-1', filename: 'ใบรับรองแพทย์.pdf' }} onChange={onChange} />);
    expect(screen.getByRole('link', { name: 'ใบรับรองแพทย์.pdf' })).toHaveAttribute('href', '/api/attachments/att-1/download');
    fireEvent.click(screen.getByRole('button', { name: 'นำไฟล์ออก' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('refuses a file over 10 MB before uploading and names a server refusal in Thai', async () => {
    const fetchMock = vi.fn(async () => json({ error: 'FILE_INFECTED' }, 422));
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    render(<AttachmentField id="leave-file" label="ไฟล์แนบ" value={null} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('ไฟล์แนบ'), { target: { files: [new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('ไฟล์ใหญ่เกิน 10 MB');
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('ไฟล์แนบ'), { target: { files: [pdf()] } });
    expect(await screen.findByText('ไฟล์นี้ไม่ผ่านการตรวจไวรัส')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
