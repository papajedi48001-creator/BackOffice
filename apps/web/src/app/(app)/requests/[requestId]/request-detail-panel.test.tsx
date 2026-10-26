import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RequestDetailPanel } from './request-detail-panel';

type PanelProps = Parameters<typeof RequestDetailPanel>[0];

const base: PanelProps = {
  requestId: 'request-demo',
  reference: 'REQ-request-demo',
  requestorName: 'นางสาวมาลี ดีงาม',
  organizationName: 'งานการพยาบาล',
  status: 'IN_REVIEW',
  history: [],
  actions: { approve: false, cancel: false, resubmit: false },
  statusAfterApprove: 'APPROVED'
};

const badge = () => document.querySelector('.status')?.textContent;

function respond(ok = true, status = ok ? 200 : 400, body: unknown = {}) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, status, json: async () => body }));
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('RequestDetailPanel', () => {
  it('shows the real requestor and organization', () => {
    render(<RequestDetailPanel {...base} />);
    expect(screen.getByText('นางสาวมาลี ดีงาม')).toBeInTheDocument();
    expect(screen.getByText('งานการพยาบาล')).toBeInTheDocument();
    expect(screen.queryByText('ตัวอย่างบุคลากร')).not.toBeInTheDocument();
  });

  it('keeps the request in review after an intermediate approval', async () => {
    respond();
    render(<RequestDetailPanel {...base} actions={{ approve: true, cancel: false, resubmit: false }} statusAfterApprove="IN_REVIEW" />);

    fireEvent.click(screen.getByRole('button', { name: 'อนุมัติ' }));
    expect(screen.getByRole('dialog', { name: 'อนุมัติ' })).toHaveTextContent('REQ-request-demo');
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));

    expect(await screen.findByText('บันทึกแล้ว')).toBeInTheDocument();
    expect(badge()).toBe('รอพิจารณา');
    expect(screen.queryByRole('button', { name: 'อนุมัติ' })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/requests/request-demo/decisions', expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'APPROVE' }) }));
  });

  it.each([
    ['ไม่อนุมัติ', 'REJECT', 'ไม่อนุมัติ'],
    ['ส่งกลับแก้ไข', 'RETURN', 'ส่งกลับแก้ไข']
  ] as const)('asks for a reason before %s', async (action, decision, label) => {
    respond();
    render(<RequestDetailPanel {...base} actions={{ approve: true, cancel: false, resubmit: false }} />);

    fireEvent.click(screen.getByRole('button', { name: action }));
    expect(screen.getByRole('dialog', { name: action })).toBeInTheDocument();
    const reason = screen.getByRole('textbox', { name: 'เหตุผล' });
    expect(screen.getByRole('button', { name: 'ยืนยัน' })).toBeDisabled();
    fireEvent.change(reason, { target: { value: 'ข้อมูลไม่ครบ' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));

    expect(await screen.findByText('บันทึกแล้ว')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/requests/request-demo/decisions', expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision, reason: 'ข้อมูลไม่ครบ' }) }));
    expect(badge()).toBe(label);
    expect(screen.queryByRole('button', { name: 'อนุมัติ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'เหตุผล' })).not.toBeInTheDocument();
  });

  it('closes the reason form without sending anything', () => {
    respond();
    render(<RequestDetailPanel {...base} actions={{ approve: true, cancel: false, resubmit: false }} />);

    fireEvent.click(screen.getByRole('button', { name: 'ไม่อนุมัติ' }));
    fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));

    expect(screen.queryByRole('textbox', { name: 'เหตุผล' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets the requestor cancel with a reason', async () => {
    respond();
    render(<RequestDetailPanel {...base} actions={{ approve: false, cancel: true, resubmit: false }} />);

    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกคำขอ' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'เหตุผล' }), { target: { value: 'ไม่ต้องการแล้ว' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));

    expect(await screen.findByText('บันทึกแล้ว')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/requests/request-demo/cancellation', expect.objectContaining({ method: 'POST', body: JSON.stringify({ reason: 'ไม่ต้องการแล้ว' }) }));
    expect(badge()).toBe('ยกเลิกแล้ว');
    expect(screen.queryByRole('button', { name: 'ยกเลิกคำขอ' })).not.toBeInTheDocument();
  });

  it('lets the requestor resubmit a returned request', async () => {
    respond();
    render(<RequestDetailPanel {...base} status="RETURNED" actions={{ approve: false, cancel: true, resubmit: true }} />);

    fireEvent.click(screen.getByRole('button', { name: 'ส่งพิจารณาอีกครั้ง' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));

    expect(await screen.findByText('บันทึกแล้ว')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/requests/request-demo/resubmission', expect.objectContaining({ method: 'POST' }));
    expect(badge()).toBe('รอพิจารณา');
  });

  it('keeps the status and shows an alert when the server refuses', async () => {
    respond(false);
    render(<RequestDetailPanel {...base} actions={{ approve: false, cancel: true, resubmit: false }} />);

    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกคำขอ' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'เหตุผล' }), { target: { value: 'ไม่ต้องการแล้ว' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่สามารถบันทึกรายการได้');
    expect(badge()).toBe('รอพิจารณา');
    expect(screen.getByRole('textbox', { name: 'เหตุผล' })).toHaveValue('ไม่ต้องการแล้ว');
  });

  it('tells the user to reload when the request changed meanwhile', async () => {
    respond(false, 409, { error: 'request_not_cancellable' });
    render(<RequestDetailPanel {...base} actions={{ approve: false, cancel: true, resubmit: false }} />);

    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกคำขอ' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'เหตุผล' }), { target: { value: 'ไม่ต้องการแล้ว' } });
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('สถานะคำขอเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่');
    expect(screen.queryByRole('button', { name: 'ยกเลิกคำขอ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'เหตุผล' })).not.toBeInTheDocument();
  });

  it('explains when no approver can be found for a resubmission', async () => {
    respond(false, 422, { error: 'no_approver' });
    render(<RequestDetailPanel {...base} status="RETURNED" actions={{ approve: false, cancel: true, resubmit: true }} />);

    fireEvent.click(screen.getByRole('button', { name: 'ส่งพิจารณาอีกครั้ง' }));
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยัน' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('ไม่พบผู้อนุมัติของหน่วยงาน กรุณาติดต่อฝ่ายบุคคล');
    expect(badge()).toBe('ส่งกลับแก้ไข');
  });

  it('hides every action when none is allowed', () => {
    render(<RequestDetailPanel {...base} status="REJECTED" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows the decision history in Bangkok time with reasons', () => {
    render(<RequestDetailPanel {...base} history={[
      { at: '2026-10-21T03:00:00Z', actorName: 'E001', kind: 'RETURN', reason: 'แนบใบเสนอราคา' },
      { at: '2026-10-21T04:00:00Z', actorName: 'นางสาวมาลี ดีงาม', kind: 'CANCEL', reason: 'ไม่ต้องการแล้ว' }
    ]} />);

    const history = screen.getByRole('list', { name: 'ประวัติการพิจารณา' });
    expect(history).toHaveTextContent('21 ต.ค. 2569 10:00');
    expect(history).toHaveTextContent('E001');
    expect(history).toHaveTextContent('ส่งกลับแก้ไข');
    expect(history).toHaveTextContent('แนบใบเสนอราคา');
    expect(history).toHaveTextContent('ยกเลิกคำขอ');
    expect(history).toHaveTextContent('ไม่ต้องการแล้ว');
  });

  it('says when nothing has been decided yet', () => {
    render(<RequestDetailPanel {...base} />);
    expect(screen.getByText('ยังไม่มีการพิจารณา')).toBeInTheDocument();
  });
});
