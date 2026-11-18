import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { GroupedBarChart } from './grouped-bar-chart';

const format = (value: number) => value.toLocaleString('th-TH', { maximumFractionDigits: 0 });
const series = [{ name: 'ปีงบ 2569', tone: 1, faded: true }, { name: 'ปีงบ 2570', tone: 0 }];
const groups = [{ label: 'รพ.กุดบาก', values: [70, 90] }, { label: 'รพ.วาริชภูมิ', values: [150, 30] }];

it('draws one bar per series in each group, sized against the largest, with the series name and value as text', () => {
  render(<GroupedBarChart groups={groups} series={series} valueFormat={format} ariaLabel="เทียบรายโรงพยาบาล" />);
  const chart = screen.getByRole('figure', { name: 'เทียบรายโรงพยาบาล' });
  const items = within(chart).getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(within(items[1]!).getByText('รพ.วาริชภูมิ')).toBeInTheDocument();
  expect(items[1]!.querySelectorAll('.grouped-chart-bar')).toHaveLength(2);
  expect(within(items[1]!).getByText('150')).toBeInTheDocument();
  expect(within(items[1]!).getAllByText('ปีงบ 2569', { selector: '.visually-hidden' })).toHaveLength(1);
  const fills = [...chart.querySelectorAll<HTMLElement>('.grouped-chart-fill')].map((fill) => fill.style.getPropertyValue('--bar-size'));
  expect(fills).toEqual(['46.7%', '60%', '100%', '20%']);
  expect(chart.querySelector('.grouped-chart-fill')).toHaveClass('tone-1', 'is-faded');
  expect(within(chart.querySelector('figcaption')!).getByText('ปีงบ 2570')).toBeInTheDocument();
});

it('stacks the series in one bar per group with the total as text', () => {
  render(<GroupedBarChart groups={groups} series={series} stacked valueFormat={format} ariaLabel="ซ้อน" />);
  const items = within(screen.getByRole('figure', { name: 'ซ้อน' })).getAllByRole('listitem');
  expect(items[0]!.querySelectorAll('.grouped-chart-bar')).toHaveLength(1);
  expect(within(items[0]!).getByText('160')).toBeInTheDocument();
  const segments = [...items[0]!.querySelectorAll<HTMLElement>('.grouped-chart-fill')].map((segment) => segment.style.getPropertyValue('--bar-size'));
  expect(segments).toEqual(['43.8%', '56.3%']);
});

it('says why it is empty', () => {
  render(<GroupedBarChart groups={[]} series={series} valueFormat={format} ariaLabel="ว่าง" emptyText="เลือกปีงบอย่างน้อย 1 ปี" />);
  expect(screen.getByRole('figure', { name: 'ว่าง' })).toHaveTextContent('เลือกปีงบอย่างน้อย 1 ปี');
});
