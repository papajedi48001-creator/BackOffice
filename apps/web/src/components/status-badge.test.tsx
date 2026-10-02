import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { StatusBadge } from './status-badge';

it.each([
  ['IN_REVIEW', 'รอพิจารณา'],
  ['APPROVED', 'อนุมัติแล้ว'],
  ['REJECTED', 'ไม่อนุมัติ'],
  ['RETURNED', 'ส่งกลับแก้ไข']
] as const)('renders the Thai label for %s', (status, label) => {
  render(<StatusBadge status={status} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});
