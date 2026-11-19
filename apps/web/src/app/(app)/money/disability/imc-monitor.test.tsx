import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImcOverview } from '@backoffice/core';
import { ImcMonitor } from './imc-monitor';

const person = (id: number, name: string, due: string, more: Partial<ImcOverview['persons'][number]> = {}): ImcOverview['persons'][number] => ({
  id, name, disease: 'Stroke', right: 'UCS', onset: '2026-04-03', discharge: '2026-04-13', due, status: 'ปกติ', visits: 10, claim: 4500, paid: 0, repNos: [], lastVisit: '2026-11-01', ...more
});
const overview: ImcOverview & { updatedAt: string } = {
  updatedAt: '2026-11-19T03:00:00.000Z',
  persons: [
    person(1, 'นางสมมติ หนึ่ง', '2026-10-10', { visits: 26, claim: 8950, paid: 8950, repNos: ['DDSA1'] }),
    person(2, 'นายสมมติ สอง', '2026-11-26', { disease: 'TBI', visits: 22, claim: 7650 }),
    person(3, 'นายสมมติ สาม', '2027-01-04'),
    person(4, 'นางสมมติ สี่', '2027-04-18', { status: 'จำหน่ายจาก IMC แล้ว' })
  ],
  lines: [
    { person: 1, date: '2026-10-01', code: 'H9339.1', claim: 450, pending: false, repNo: 'DDSA1' },
    { person: 2, date: '2026-11-01', code: 'H9340', claim: 200, pending: true, repNo: '' },
    { person: 2, date: '2026-11-03', code: 'H9339.1', claim: 450, pending: false, repNo: '' }
  ],
  reps: [{ person: 1, date: '2026-10-01', repNo: 'DDSA1', paid: 8950 }, { person: null, date: '2026-11-02', repNo: 'DDSA9', paid: 100 }],
  services: [{ code: 'H9339.1', name: 'กายภาพบำบัด' }, { code: 'H9340', name: 'ให้บริการIMCที่บ้าน' }],
  totals: { people: 4, visits: 68, claim: 25600, pending: 3, paid: 8950, noRep: 16650, repOutside: 0, diseases: [['Stroke', 3], ['Traumatic brain injury (TBI)', 1]] }
};
const serve = (body: unknown, status = 200) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
const rows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1) as HTMLTableRowElement[];

afterEach(() => vi.unstubAllGlobals());

describe('ImcMonitor', () => {
  it('shows the four summary cards', async () => {
    serve(overview);
    render(<ImcMonitor canManage={false} today="2026-11-19" />);
    const kpis = await screen.findByRole('region', { name: 'สรุป IMC' });
    expect(within(kpis).getByText('ทะเบียน IMC').parentElement).toHaveTextContent('4 คน');
    expect(within(kpis).getByText('ทะเบียน IMC').parentElement).toHaveTextContent('Stroke 3 · TBI 1');
    expect(within(kpis).getByText('เรียกเก็บ IMC').parentElement).toHaveTextContent('1,100.00 บาท');
    expect(within(kpis).getByText('เรียกเก็บ IMC').parentElement).toHaveTextContent('3 ครั้ง (รอประมวลผล 1)');
    expect(within(kpis).getByText('REP').parentElement).toHaveTextContent('9,050.00 บาท');
    expect(within(kpis).getByText('REP').parentElement).toHaveTextContent('ยังไม่มี REP 650.00 บาท · 1 รายการไม่อยู่ในทะเบียน');
    expect(within(kpis).getByText('ใกล้ครบกำหนด (≤ 30 วัน)').parentElement).toHaveTextContent('1 คน');
    expect(screen.queryByRole('button', { name: 'นำเข้าไฟล์ IMC' })).not.toBeInTheDocument();
  });

  it('lists the patient cards with days left and filters them with the toggle', async () => {
    serve(overview);
    render(<ImcMonitor canManage today="2026-11-19" />);
    fireEvent.click(await screen.findByRole('switch', { name: /ซ่อนคนที่จำหน่าย/ }));
    const cards = screen.getByRole('list', { name: 'ผู้ป่วยในทะเบียน' });
    const items = within(cards).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual(['นางสมมติ หนึ่ง', 'นายสมมติ สอง', 'นายสมมติ สาม', 'นางสมมติ สี่']);
    expect(items[0]).toHaveTextContent('ครบกำหนดแล้ว 40 วัน');
    expect(items[0]).toHaveTextContent('จำหน่าย 13 เม.ย. 2569 · ครบ 10 ต.ค. 2569');
    expect(items[1]).toHaveTextContent('7 วัน');
    expect(items[1]).toHaveTextContent('22 ครั้ง · 7,650 บาท');
    expect(items[2]).toHaveTextContent('1 เดือน 16 วัน');
    expect(items[3]).toHaveTextContent('จำหน่ายจาก IMC แล้ว');
    const filter = screen.getByRole('group', { name: 'กรองผู้ป่วย' });
    fireEvent.click(within(filter).getByRole('button', { name: '≤ 30 วัน' }));
    expect(within(filter).getByRole('button', { name: '≤ 30 วัน' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(cards).getAllByRole('listitem').map((item) => within(item).getByRole('heading').textContent)).toEqual(['นายสมมติ สอง']);
    fireEvent.click(within(filter).getByRole('button', { name: 'ครบกำหนดแล้ว' }));
    expect(within(cards).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(filter).getByRole('button', { name: '31–60 วัน' }));
    expect(within(cards).getAllByRole('listitem').map((item) => within(item).getByRole('heading').textContent)).toEqual(['นายสมมติ สาม']);
    expect(screen.getByRole('button', { name: 'นำเข้าไฟล์ IMC' })).toBeInTheDocument();
  });

  it('shows the person table, the chart with its period toggle and claims against REP', async () => {
    serve(overview);
    render(<ImcMonitor canManage={false} today="2026-11-19" />);
    fireEvent.click(await screen.findByRole('switch', { name: /ซ่อนคนที่จำหน่าย/ }));
    const people = screen.getByRole('table', { name: 'รายละเอียดรายบุคคล' });
    expect(rows(people)[1]!.textContent).toBe('2นายสมมติ สองTBI3 เม.ย. 256913 เม.ย. 25697 วัน2 ครั้ง650.00');
    const chart = () => screen.getByRole('figure', { name: 'กราฟการเรียกเก็บ IMC' });
    expect(within(chart()).getAllByText('กายภาพบำบัด').length).toBeGreaterThan(0);
    const period = screen.getByRole('group', { name: 'กราฟราย' });
    expect(within(period).getByRole('button', { name: 'อัตโนมัติ' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chart()).getByText('1 ต.ค.')).toBeInTheDocument(); // 1 ต.ค. – 19 พ.ย. is 50 days: รายวัน
    fireEvent.click(within(period).getByRole('button', { name: 'รายเดือน' }));
    expect(within(chart()).getByText('ต.ค. 69')).toBeInTheDocument();
    fireEvent.click(within(period).getByRole('button', { name: 'รายปีงบ' }));
    expect(within(chart()).getByText('ปีงบ 2570')).toBeInTheDocument();
    const rep = screen.getByRole('table', { name: 'เรียกเก็บเทียบ REP' });
    expect(rows(rep)[0]!.textContent).toBe('1นางสมมติ หนึ่ง450.008,950.00DDSA1');
    expect(rows(rep)[1]).toHaveTextContent('ยังไม่มี REP');
    expect(within(rep).getAllByRole('row').at(-1)).toHaveTextContent('รวม 4 คน1,100.008,950.00');
  });

  it('says there is no data yet, and shows a failure', async () => {
    serve({ ...overview, updatedAt: null, persons: [], lines: [], services: [], totals: { ...overview.totals, people: 0 } });
    const { unmount } = render(<ImcMonitor canManage today="2026-11-19" />);
    expect(await screen.findByText('ยังไม่มีข้อมูล IMC')).toBeInTheDocument();
    unmount();
    serve({ error: 'FORBIDDEN' }, 403);
    render(<ImcMonitor canManage={false} today="2026-11-19" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('โหลดข้อมูล IMC ไม่ได้');
  });

  it('hides people who are discharged or past their due date behind a switch that starts on, in the cards and the person table', async () => {
    serve(overview);
    render(<ImcMonitor canManage={false} today="2026-11-19" />);
    const toggle = await screen.findByRole('switch', { name: 'ซ่อนคนที่จำหน่าย/ครบกำหนดแล้ว (2)' });
    expect(toggle).toBeChecked();
    const names = () => within(screen.getByRole('list', { name: 'ผู้ป่วยในทะเบียน' })).getAllByRole('listitem').map((item) => within(item).getByRole('heading').textContent);
    expect(names()).toEqual(['นายสมมติ สอง', 'นายสมมติ สาม']);
    expect(screen.getByText('ซ่อนอยู่ 2 คน')).toBeInTheDocument();
    expect(rows(screen.getByRole('table', { name: 'รายละเอียดรายบุคคล' })).map((row) => row.cells[1]!.firstChild!.textContent)).toEqual(['นายสมมติ สอง', 'นายสมมติ สาม']);
    expect(rows(screen.getByRole('table', { name: 'เรียกเก็บเทียบ REP' }))).toHaveLength(5); // everyone and the total: money owed does not hide
    fireEvent.click(toggle);
    expect(names()).toHaveLength(4);
    expect(rows(screen.getByRole('table', { name: 'รายละเอียดรายบุคคล' }))).toHaveLength(4);
    fireEvent.click(toggle);
    fireEvent.click(within(screen.getByRole('group', { name: 'กรองผู้ป่วย' })).getByRole('button', { name: 'ครบกำหนดแล้ว' }));
    expect(toggle).not.toBeChecked();
    expect(names()).toEqual(['นางสมมติ หนึ่ง', 'นางสมมติ สี่']);
  });

  it('limits the summary, chart and tables to the chosen date range, and keeps the register as of today', async () => {
    serve(overview);
    render(<ImcMonitor canManage={false} today="2026-11-19" />);
    const bar = await screen.findByRole('group', { name: 'ช่วงวันที่' });
    expect(within(bar).getByLabelText('ตั้งแต่วันที่')).toHaveValue('พฤหัสบดี 1 ต.ค. 2569');
    expect(within(bar).getByLabelText('ถึงวันที่')).toHaveValue('พฤหัสบดี 19 พ.ย. 2569');
    const shortcuts = within(bar).getByRole('group', { name: 'ช่วงลัด' });
    expect(within(shortcuts).getByRole('button', { name: 'ทั้งหมด' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(shortcuts).getByRole('button', { name: 'เดือนนี้' }));
    expect(within(bar).getByLabelText('ตั้งแต่วันที่')).toHaveValue('อาทิตย์ 1 พ.ย. 2569');
    const kpis = screen.getByRole('region', { name: 'สรุป IMC' });
    expect(within(kpis).getByText('เรียกเก็บ IMC').parentElement).toHaveTextContent('650.00 บาท2 ครั้ง (รอประมวลผล 1)');
    expect(within(kpis).getByText('REP').parentElement).toHaveTextContent('100.00 บาท');
    expect(within(kpis).getByText('ทะเบียน IMC').parentElement).toHaveTextContent('4 คน');
    expect(within(screen.getByRole('table', { name: 'เรียกเก็บเทียบ REP' }).querySelector('tbody')!).getAllByRole('row')[0]!.textContent).toBe('1นางสมมติ หนึ่ง0.00ยังไม่มี REP-');
    fireEvent.change(within(bar).getByLabelText('ตั้งแต่วันที่'), { target: { value: '2/11/2569' } });
    expect(within(shortcuts).getByRole('button', { name: 'เดือนนี้' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(kpis).getByText('เรียกเก็บ IMC').parentElement).toHaveTextContent('450.00 บาท1 ครั้ง');
    expect(within(screen.getByRole('list', { name: 'ผู้ป่วยในทะเบียน' })).getAllByRole('listitem')[0]).toHaveTextContent('22 ครั้ง · 7,650 บาท');
  });

  it('opens a person\'s claim lines in the range when the row is clicked, and closes them again', async () => {
    serve(overview);
    render(<ImcMonitor canManage={false} today="2026-11-19" />);
    const people = await screen.findByRole('table', { name: 'รายละเอียดรายบุคคล' });
    const open = within(people).getByRole('button', { name: 'นายสมมติ สอง' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(rows(people)[0]!.cells[4]!);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    const lines = screen.getByRole('table', { name: 'รายการเรียกเก็บ นายสมมติ สอง' });
    expect(rows(lines).map((row) => row.textContent)).toEqual([
      '3 พ.ย. 2569H9339.1กายภาพบำบัด450.00ยังไม่มี REP',
      '1 พ.ย. 2569H9340ให้บริการIMCที่บ้าน200.00รอประมวลผลยังไม่มี REP',
      'รวม 2 ครั้ง650.00REP 0.00'
    ]);
    fireEvent.click(open);
    expect(screen.queryByRole('table', { name: 'รายการเรียกเก็บ นายสมมติ สอง' })).not.toBeInTheDocument();
  });
});
