import { render, screen } from '@testing-library/react';
import { AuditEventTable, type AuditEventRow } from './audit-event-table';

describe('AuditEventTable', () => {
  it('renders safe request evidence with Thai action and result labels', () => {
    const events = [{ createdAt: '2026-10-01T07:00:00.000Z', action: 'workflow.request.decided', result: 'APPROVE', requestReference: 'REQ-request-1', actorPersonId: 'person-a', targetId: 'request-1', metadata: '{"password":"do-not-render","nationalId":"1234567890123"}' } as unknown as AuditEventRow];

    render(<AuditEventTable events={events} />);

    expect(screen.getByText('REQ-request-1')).toBeInTheDocument();
    expect(screen.getByText('พิจารณาคำขอ')).toBeInTheDocument();
    expect(screen.getByText('อนุมัติแล้ว')).toBeInTheDocument();
    expect(screen.queryByText('person-a')).not.toBeInTheDocument();
    expect(screen.queryByText('request-1')).not.toBeInTheDocument();
    expect(screen.queryByText('do-not-render')).not.toBeInTheDocument();
    expect(screen.queryByText('1234567890123')).not.toBeInTheDocument();
  });

  it('renders the existing empty state when the actor has no events', () => {
    render(<AuditEventTable events={[]} />);

    expect(screen.getByText('ยังไม่มีรายการที่ตรงกับเงื่อนไข')).toBeInTheDocument();
  });
});
