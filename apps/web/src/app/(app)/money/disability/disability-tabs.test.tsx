import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DisabilityTabs } from './disability-tabs';

it('shows each tab as a card link with its figures, marking the open one', () => {
  render(<DisabilityTabs cards={[
    { key: 'imc', code: 'IMC', title: 'Monitor IMC', href: '/money/disability?tab=imc', current: false, main: 'ทะเบียน 12 คน', alert: { text: 'ใกล้ครบกำหนด ≤ 30 วัน 3 คน', tone: 'warn' } },
    { key: 'ofc', code: 'OFC', title: 'Instrument OFC', href: '/money/disability?tab=ofc', current: true, main: '9 คน', alert: { text: 'ยังไม่มี REP 5 ครั้ง · ปฏิเสธ 1', tone: 'bad' } }
  ]} />);
  const nav = screen.getByRole('navigation', { name: 'เมนูกองทุนฟื้นฟูสมรรถภาพ' });
  const links = within(nav).getAllByRole('link');
  expect(links.map((link) => [link.getAttribute('href'), link.getAttribute('aria-current'), link.textContent])).toEqual([
    ['/money/disability?tab=imc', null, 'IMCMonitor IMCทะเบียน 12 คนใกล้ครบกำหนด ≤ 30 วัน 3 คน'],
    ['/money/disability?tab=ofc', 'page', 'OFCInstrument OFC9 คนยังไม่มี REP 5 ครั้ง · ปฏิเสธ 1']
  ]);
});
