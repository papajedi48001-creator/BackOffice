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

  it('labels cancellations and resubmissions', () => {
    render(<AuditEventTable events={[
      { createdAt: '2026-10-01T07:00:00.000Z', action: 'workflow.request.cancelled', result: 'SUCCESS', requestReference: 'REQ-1' },
      { createdAt: '2026-10-01T08:00:00.000Z', action: 'workflow.request.resubmitted', result: 'SUCCESS', requestReference: 'REQ-2' }
    ]} />);

    expect(screen.getByText('ยกเลิกคำขอ')).toBeInTheDocument();
    expect(screen.getByText('ส่งคำขออีกครั้ง')).toBeInTheDocument();
  });

  it('renders the existing empty state when the actor has no events', () => {
    render(<AuditEventTable events={[]} />);

    expect(screen.getByText('ยังไม่มีรายการที่ตรงกับเงื่อนไข')).toBeInTheDocument();
  });

  it('labels inventory events with their document reference', () => {
    render(<AuditEventTable events={[
      { createdAt: '2026-10-01T07:00:00.000Z', action: 'inventory.receipt.posted', result: 'SUCCESS', requestReference: 'RC-2569-0001' },
      { createdAt: '2026-10-01T08:00:00.000Z', action: 'inventory.opening.certified', result: 'SUCCESS', requestReference: 'OB-2569-0001' }
    ]} />);

    expect(screen.getByText('บันทึกใบรับเข้า')).toBeInTheDocument();
    expect(screen.getByText('RC-2569-0001')).toBeInTheDocument();
    expect(screen.getByText('รับรองยอดยกมา')).toBeInTheDocument();
  });
  it('labels every fleet action in Thai', () => {
    const labels: Array<[AuditEventRow['action'], string]> = [
      ['fleet.request.submitted', 'ยื่นใบขอใช้รถ'], ['fleet.request.resubmitted', 'ส่งใบขอใช้รถใหม่'], ['fleet.request.cancelled', 'ยกเลิกใบขอใช้รถ'], ['fleet.request.assigned', 'จัดรถ'],
      ['fleet.request.unassigned', 'ถอดใบออกจากเที่ยวรถ'], ['fleet.request.declined', 'ไม่จัดรถ'], ['fleet.trip.updated', 'แก้ไขเที่ยวรถ'], ['fleet.trip.departed', 'ออกเดินทาง'],
      ['fleet.trip.returned', 'กลับถึง'], ['fleet.trip.cancelled', 'ยกเลิกเที่ยวรถ'], ['fleet.vehicle.create', 'เพิ่มรถราชการ'], ['fleet.vehicle.update', 'แก้ไขรถราชการ'],
      ['fleet.driver.create', 'เพิ่มพนักงานขับรถ'], ['fleet.driver.update', 'แก้ไขพนักงานขับรถ']
    ];
    render(<AuditEventTable events={labels.map(([action], index) => ({ createdAt: `2026-10-01T07:${String(index).padStart(2, '0')}:00.000Z`, action, result: 'SUCCESS', requestReference: `VR-${index}` }))} />);
    for (const [, label] of labels) expect(screen.getByText(label)).toBeInTheDocument();
  });
});
