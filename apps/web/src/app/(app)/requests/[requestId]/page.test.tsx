import { fireEvent, render, screen } from '@testing-library/react';
import { RequestDetailPanel } from './request-detail-panel';

describe('RequestDetailPanel', () => {
  it('shows the approval action only to a pending approver', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<RequestDetailPanel requestId="request-demo" reference="REQ-request-demo" organizationId="organization-demo" status="PENDING" canApprove />);

    expect(screen.getByText('รอพิจารณา')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'อนุมัติคำขอ' }));
    expect(await screen.findByText('อนุมัติแล้ว')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/requests/request-demo/decisions', expect.objectContaining({ method: 'POST' }));
  });

  it('hides the approval action from a requestor', () => {
    render(<RequestDetailPanel requestId="request-demo" reference="REQ-request-demo" organizationId="organization-demo" status="PENDING" canApprove={false} />);

    expect(screen.queryByRole('button', { name: 'อนุมัติคำขอ' })).not.toBeInTheDocument();
  });
});
