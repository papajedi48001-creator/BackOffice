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
  lines: [{ date: '2026-10-01', code: 'H9339.1', claim: 450 }, { date: '2026-11-01', code: 'H9340', claim: 200 }],
  services: [{ code: 'H9339.1', name: 'กายภาพบำบัด' }, { code: 'H9340', name: 'ให้บริการIMCที่บ้าน' }],
  totals: { people: 4, visits: 68, claim: 25600, pending: 3, paid: 8950, noRep: 16650, repOutside: 0, diseases: [['Stroke', 3], ['TBI', 1]] }
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
    expect(within(kpis).getByText('เรียกเก็บ IMC').parentElement).toHaveTextContent('25,600.00 บาท');
    expect(within(kpis).getByText('เรียกเก็บ IMC').parentElement).toHaveTextContent('68 ครั้ง (รอประมวลผล 3)');
    expect(within(kpis).getByText('REP').parentElement).toHaveTextContent('8,950.00 บาท');
    expect(within(kpis).getByText('REP').parentElement).toHaveTextContent('ยังไม่มี REP 16,650.00 บาท');
    expect(within(kpis).getByText('ใกล้ครบกำหนด (≤ 30 วัน)').parentElement).toHaveTextContent('1 คน');
    expect(screen.queryByRole('button', { name: 'นำเข้าไฟล์ IMC' })).not.toBeInTheDocument();
  });

  it('lists the patient cards with days left and filters them with the toggle', async () => {
    serve(overview);
    render(<ImcMonitor canManage today="2026-11-19" />);
    const cards = await screen.findByRole('list', { name: 'ผู้ป่วยในทะเบียน' });
    const items = within(cards).getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual(['นางสมมติ หนึ่ง', 'นายสมมติ สอง', 'นายสมมติ สาม', 'นางสมมติ สี่']);
    expect(items[0]).toHaveTextContent('ครบกำหนดแล้ว 40 วัน');
    expect(items[0]).toHaveTextContent('จำหน่าย 13/4/2569 · ครบ 10/10/2569');
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
    const people = await screen.findByRole('table', { name: 'รายละเอียดรายบุคคล' });
    expect(rows(people)[1]!.textContent).toBe('2นายสมมติ สองTBI3/4/256913/4/25697 วัน22 ครั้ง');
    const chart = screen.getByRole('figure', { name: 'กราฟการเรียกเก็บ IMC' });
    expect(within(chart).getAllByText('กายภาพบำบัด').length).toBeGreaterThan(0);
    expect(within(chart).getByText('ต.ค. 69')).toBeInTheDocument();
    const period = screen.getByRole('group', { name: 'ช่วงเวลา' });
    expect(within(period).getByRole('button', { name: 'รายเดือน' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(period).getByRole('button', { name: 'รายปี' }));
    expect(within(screen.getByRole('figure', { name: 'กราฟการเรียกเก็บ IMC' })).getByText('ปีงบ 2570')).toBeInTheDocument();
    const rep = screen.getByRole('table', { name: 'เรียกเก็บเทียบ REP' });
    expect(rows(rep)[0]!.textContent).toBe('1นางสมมติ หนึ่ง8,950.008,950.00DDSA1');
    expect(rows(rep)[1]).toHaveTextContent('ยังไม่มี REP');
    expect(within(rep).getAllByRole('row').at(-1)).toHaveTextContent('รวม 4 คน25,600.008,950.00');
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
});
