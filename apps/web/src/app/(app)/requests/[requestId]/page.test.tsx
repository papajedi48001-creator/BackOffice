import { fireEvent, render, screen } from '@testing-library/react';
import { RequestDetailPanel } from './request-detail-panel';

describe('RequestDetailPanel', () => {
  it('keeps the visible request status in review after an intermediate approval', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    render(<RequestDetailPanel requestId="request-demo" reference="REQ-request-demo" organizationId="organization-demo" status="IN_REVIEW" canApprove statusAfterApprove="IN_REVIEW" />);

    expect(screen.getByText('รอพิจารณา')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'อนุมัติคำขอ' }));
    expect(await screen.findByText('รอพิจารณา')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'อนุมัติคำขอ' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/requests/request-demo/decisions', expect.objectContaining({ method: 'POST' }));
  });

  it('hides the approval action from a requestor', () => {
    render(<RequestDetailPanel requestId="request-demo" reference="REQ-request-demo" organizationId="organization-demo" status="REJECTED" canApprove={false} statusAfterApprove="APPROVED" />);

    expect(screen.queryByRole('button', { name: 'อนุมัติคำขอ' })).not.toBeInTheDocument();
    expect(screen.getByText('ไม่อนุมัติ')).toBeInTheDocument();
  });
});
