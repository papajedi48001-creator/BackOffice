import { fireEvent, render, screen } from '@testing-library/react';
import RequestDetailPage from './page';

describe('RequestDetailPage', () => {
  it('shows Thai pending and approved status labels for the core approval path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(await RequestDetailPage({ params: Promise.resolve({ requestId: 'request-demo' }) }));

    expect(screen.getByText('รอพิจารณา')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'อนุมัติคำขอ' }));
    expect(await screen.findByText('อนุมัติแล้ว')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/requests/request-demo/decisions', expect.objectContaining({ method: 'POST' }));
  });
});
