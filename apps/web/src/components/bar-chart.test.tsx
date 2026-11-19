import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BarChart } from './bar-chart';

const format = (value: number) => value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
const bars = (count: number) => Array.from({ length: count }, (_, index) => ({ label: `กลุ่ม ${index + 1}`, sublabel: `(${index + 1} คน)`, value: (index + 1) * 1000 }));

it('draws bars upright over a value axis, keeping every value as text for screen readers and the tooltip', () => {
  render(<BarChart bars={bars(3)} valueFormat={format} ariaLabel="ค่ารักษารวม" axisTitle="เทียบรายกลุ่ม" />);
  const chart = screen.getByRole('figure', { name: 'ค่ารักษารวม' });
  const items = within(chart).getAllByRole('listitem');
  expect(items).toHaveLength(3);
  for (const [index, text] of ['1,000', '2,000', '3,000'].entries()) expect(within(items[index]!).getByText(text)).toBeInTheDocument();
  for (const text of ['กลุ่ม 2', '(2 คน)']) expect(within(items[1]!).getByText(text)).toBeInTheDocument();
  expect(items[1]).toHaveAttribute('title', 'กลุ่ม 2 (2 คน): 2,000');
  const axis = chart.querySelector('.chart-axis')!;
  expect(axis).toHaveAttribute('aria-hidden', 'true');
  expect([...axis.querySelectorAll('li')].map((tick) => tick.textContent)).toEqual(['0', '500', '1,000', '1,500', '2,000', '2,500', '3,000']);
  expect(within(chart).getByText('เทียบรายกลุ่ม')).toBeInTheDocument();
});

it('keeps many bars upright', () => {
  render(<BarChart bars={bars(20)} valueFormat={format} ariaLabel="ค่ารักษารวม" />);
  const chart = screen.getByRole('figure', { name: 'ค่ารักษารวม' });
  expect(chart).not.toHaveAttribute('data-orientation');
  expect(chart).toHaveClass('chart-frame');
});

it('sizes each bar against the top of the value axis', () => {
  render(<BarChart bars={[{ label: 'ก', value: 50 }, { label: 'ข', value: 180 }]} valueFormat={format} ariaLabel="กราฟ" />);
  const fills = screen.getByRole('figure', { name: 'กราฟ' }).querySelectorAll<HTMLElement>('.bar-chart-fill');
  expect([...fills].map((fill) => fill.style.getPropertyValue('--bar-size'))).toEqual(['25%', '90%']);
});

it('shows a second series beside the first with a legend', () => {
  render(<BarChart bars={[{ label: '1 พ.ย.', value: 800, secondary: 300 }]} legend={['ค่ารักษารวม', 'ลูกหนี้']} valueFormat={format} ariaLabel="แนวโน้ม" />);
  const chart = screen.getByRole('figure', { name: 'แนวโน้ม' });
  const bar = within(chart).getByRole('listitem');
  expect(within(bar).getByText('800')).toBeInTheDocument();
  expect(within(bar).getByText('300')).toBeInTheDocument();
  expect(bar).toHaveAttribute('title', '1 พ.ย.: ค่ารักษารวม 800 · ลูกหนี้ 300');
  expect(chart.querySelector('figcaption')).toHaveTextContent('ค่ารักษารวมลูกหนี้');
});

it('says so when there is nothing to draw', () => {
  render(<BarChart bars={[]} valueFormat={format} ariaLabel="ว่าง" />);
  expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument();
});

it('marks an alert bar and says so in text, not colour alone', () => {
  render(<BarChart bars={[{ label: 'UC ใน CUP', value: 500, alert: 'ไม่นับในคาดการณ์รายรับ' }, { label: 'ชำระเงิน', value: 200 }]} valueFormat={format} ariaLabel="กราฟ" />);
  const items = within(screen.getByRole('figure', { name: 'กราฟ' })).getAllByRole('listitem');
  expect(items[0]).toHaveClass('is-alert');
  expect(within(items[0]!).getByText('ไม่นับในคาดการณ์รายรับ')).toBeInTheDocument();
  expect(items[1]).not.toHaveClass('is-alert');
});

it('stacks a part of the bar in its own colour, with the total as the value and the part in a legend', () => {
  render(<BarChart bars={[{ label: 'ก', value: 1000, stack: 250, stackNote: 'ฟันปลอม 250' }]} stackLegend={['ลูกหนี้ (ไม่รวมฟันปลอม)', 'ลูกหนี้งานฟันปลอม']} valueFormat={format} ariaLabel="กราฟ" />);
  const chart = screen.getByRole('figure', { name: 'กราฟ' });
  expect(within(within(chart).getByRole('listitem')).getByText('1,000')).toBeInTheDocument();
  expect(within(chart).getByText('ฟันปลอม 250')).toBeInTheDocument();
  expect(chart.querySelector<HTMLElement>('.bar-chart-stack')!.style.getPropertyValue('--stack-size')).toBe('25%');
  expect(chart.querySelector('figcaption')).toHaveTextContent('ลูกหนี้ (ไม่รวมฟันปลอม)ลูกหนี้งานฟันปลอม');
});
